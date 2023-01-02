import {
  MigrateConfig,
  Mysql2Config,
  MysqlConfig,
  Sqlite3Config,
  SupportedClient,
  SupportedConnection
} from './models';
import * as sqlite3 from 'sqlite3';
import * as mysql from 'mysql';
import * as mysql2 from 'mysql2';
import * as fs from 'fs';
import {
  isSqlite,
  chunk,
  generateInsertQueries,
  generateDeleteQueries,
  getNewTableName,
  getTableName
} from './internal';

// Do some function overload magic to get the correct type for the config
// based on the client
export function getConnection(client: 'sqlite3', config: Sqlite3Config): sqlite3.Database;
export function getConnection(client: 'mysql', config: MysqlConfig): mysql.Connection;
export function getConnection(client: 'mysql2', config: Mysql2Config): mysql2.Connection;
export function getConnection(client: SupportedClient, config: any): any {
  switch (client) {
    case 'sqlite3':
      return new sqlite3.Database(config.filename);
    case 'mysql':
      return mysql.createConnection(config);
    case 'mysql2':
      return mysql2.createConnection(config);
    default:
      throw new Error(`Unsupported client: ${client}`);
  }
}

export function closeConnection(client: 'sqlite3', connection: sqlite3.Database): void;
export function closeConnection(client: 'mysql', connection: mysql.Connection): void;
export function closeConnection(client: 'mysql2', connection: mysql2.Connection): void;
export function closeConnection(client: SupportedClient, connection: any): void {
  switch (client) {
    case 'sqlite3':
      connection.close();
      break;
    case 'mysql':
    case 'mysql2':
      connection.end();
      break;
    default:
      throw new Error(`Unsupported client: ${client}`);
  }
}

export async function migrate<T>(
  connection: SupportedConnection,
  config: MigrateConfig,
  migrationConnection: SupportedConnection = connection
): Promise<void> {
  if (isSqlite(connection)) await pQuery(connection, 'BEGIN TRANSACTION');
  else await pQuery(connection, 'START TRANSACTION');
  if (isSqlite(migrationConnection)) await pQuery(migrationConnection, 'BEGIN TRANSACTION');
  else await pQuery(migrationConnection, 'START TRANSACTION');

  try {
    const rowsToMove: T[] = await getRowsToMove<T>(config, connection);
    if (rowsToMove.length === 0) {
      return;
    }

    const primaryKeys = await detectPrimaryKeys(connection, config);

    await generateTableIfNecessary(config, connection, migrationConnection, primaryKeys);

    const chunks = chunk(rowsToMove, config.chunkSize);

    const insertQueries: string[] = generateInsertQueries<T>(chunks, config, primaryKeys, migrationConnection);
    const deleteQueries: string[] = generateDeleteQueries<T>(chunks, config, primaryKeys, connection);

    if (config.filePath) {
      try {
        saveQueriesToFile(config.filePath, insertQueries, deleteQueries, connection);
      } catch (err) {
        console.error('Could not save queries to file', err);
      }
    }

    if (!config.safeExecution) {
      await Promise.all(insertQueries.map((query) => pQuery(migrationConnection, query)));
      await Promise.all(deleteQueries.map((query) => pQuery(connection, query)));
    }

    await pQuery(connection, 'COMMIT');
    await pQuery(migrationConnection, 'COMMIT');
    return;
  } catch (err) {
    await pQuery(connection, 'ROLLBACK');
    await pQuery(migrationConnection, 'ROLLBACK');
    throw err;
  }
}

export function pQuery<T>(connection: sqlite3.Database, query: string, params?: any[]): Promise<T[]>;
export function pQuery<T>(connection: mysql.Connection, query: string, params?: any[]): Promise<T[]>;
export function pQuery<T>(connection: mysql2.Connection, query: string, params?: any[]): Promise<T[]>;
export function pQuery<T>(connection: any, query: string, params?: any[]): Promise<T[]> {
  query = query.trim();
  if (isSqlite(connection)) {
    return pQuerySqlite<T>(query, connection, params);
  } else {
    return pQueryMysql<T>(connection, query, params);
  }
}

async function generateTableIfNecessary(
  config: MigrateConfig,
  connection: any,
  migrationConnection: any,
  primaryKeys: string[]
) {
  if (isSqlite(connection)) {
    await generateTableIfNecessarySqlite(config, connection, migrationConnection, primaryKeys);
  } else {
    await generateTableIfNecessaryMysql(config, connection, migrationConnection, primaryKeys);
  }
}

async function tableExists(connection: any, config: MigrateConfig) {
  let tableExistsQ = `
  SELECT COUNT(*) AS cnt
  FROM information_schema.tables
  WHERE table_schema = '${config.schema}'
  AND table_name = '${getNewTableName(connection, config)}'
`;
  if (isSqlite(connection)) {
    tableExistsQ = `
    SELECT COUNT(*) AS cnt
    FROM sqlite_master
    WHERE type='table' AND name='${getNewTableName(connection, config)}'
  `;
  }
  const tableExists: number[] = await pQuery(connection, tableExistsQ);
  return tableExists[0]['cnt'] > 0;
}

async function generateTableIfNecessarySqlite(
  config: MigrateConfig,
  connection: any,
  migrationConnection: any,
  primaryKeys: string[]
) {
  if (!(await tableExists(migrationConnection, config))) {
    const columns = await detectSqliteColumnDefinitions(connection, config);
    const columnsDefinition = columns
      .filter((c) => primaryKeys.indexOf(c.name) !== -1)
      .map((c) => `${c.name} ${c.type} ${c.notnull ? 'NOT NULL' : ''} ${c.dflt_value ? `DEFAULT ${c.dflt_value}` : ''}`)
      .join(', ');
    const createTableQ = `
    CREATE TABLE ${getNewTableName(migrationConnection, config)} (
      ${columnsDefinition},
      ${config.softDeleteColumn} INTEGER,
      data JSON NULL
    )`;
    await pQuery(migrationConnection, createTableQ);
  }
}

async function generateTableIfNecessaryMysql(
  config: MigrateConfig,
  connection: any,
  migrationConnection: any,
  primaryKeys: string[]
) {
  if (!(await tableExists(migrationConnection, config))) {
    const columns = await detectMysqlColumnDefinitions(connection, config);
    const columnsDefinition = columns
      .filter((c) => primaryKeys.indexOf(c.column_name) !== -1)
      .map(
        (c) =>
          `${c.column_name} ${c.column_type} ${c.is_nullable === 'NO' ? 'NOT NULL' : ''} ${
            c.column_default ? `DEFAULT ${c.column_default}` : ''
          }`
      )
      .join(', ');
    const createTableQ = `
          CREATE TABLE ${getNewTableName(migrationConnection, config)} (
            ${columnsDefinition},
            ${config.softDeleteColumn} DATETIME,
            data JSON NULL
          )
        `;
    await pQuery(migrationConnection, createTableQ);
  }
}

async function getRowsToMove<T>(config: MigrateConfig, connection: any) {
  const rowsToMoveQ = `
      SELECT *
      FROM ${getTableName(connection, config)}
      WHERE ${config.softDeleteColumn} IS NOT NULL AND (${config.migrateCondition})
      LIMIT ${config.limit}
    `;

  const rowsToMove: T[] = await pQuery(connection, rowsToMoveQ, config.migrateConditionParams);
  return rowsToMove;
}

function pQueryMysql<T>(connection: any, query: string, params: any[] | undefined): Promise<T[]> {
  return new Promise((resolve, reject) => {
    connection.query(query, params, (err, rows: T[]) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

function pQuerySqlite<T>(query: string, connection: any, params: any[] | undefined): Promise<T[]> {
  return new Promise((resolve, reject) => {
    if (query.toLowerCase().startsWith('select') || query.toLowerCase().startsWith('pragma')) {
      connection.all(query, params, (err, rows: T[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    } else {
      const stmt = connection.prepare(query);
      stmt.run(params, (err) => {
        if (err) {
          reject(err);
        }
        resolve([]);
      });
      stmt.finalize();
    }
  });
}

async function detectPrimaryKeys(connection: any, config: MigrateConfig): Promise<string[]> {
  let primaryKeysQ: string;
  let primaryKeys: { column_name: string }[];
  if (isSqlite(connection)) {
    primaryKeysQ = `
      PRAGMA table_info(${config.tableName})
    `;
    primaryKeys = (await pQuery(connection, primaryKeysQ))
      .filter((key: any) => key.pk === 1)
      .map((key: any) => ({ column_name: key.name }));
  } else {
    primaryKeysQ = `
    SELECT column_name
    FROM information_schema.key_column_usage
    WHERE table_schema = '${config.schema}' AND table_name = '${config.tableName}' AND constraint_name = 'PRIMARY'
  `;
    primaryKeys = await pQuery(connection, primaryKeysQ);
  }
  return primaryKeys.map((key) => key.column_name);
}

async function detectSqliteColumnDefinitions(connection: any, config: MigrateConfig): Promise<any[]> {
  const columnDefinitionsQ = `
    PRAGMA table_info(${config.tableName})
  `;
  const columnDefinitions: { cid: number; name: string; type: string; notnull: 0 | 1; dflt_value: any; pk: 0 | 1 }[] =
    await pQuery(connection, columnDefinitionsQ);
  return columnDefinitions;
}

async function detectMysqlColumnDefinitions(connection: any, config: MigrateConfig): Promise<any[]> {
  const columnDefinitionsQ = `
    SELECT column_name, column_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = '${config.schema}' AND table_name = '${config.tableName}'
  `;
  const columnDefinitions: { column_name: string; column_type: string; is_nullable: string; column_default: any }[] =
    await pQuery(connection, columnDefinitionsQ);
  return columnDefinitions;
}

function saveQueriesToFile(filePath: string, insertQueries: string[], deleteQueries: string[], connection: any) {
  // If file exists, delete it
  if (fs.existsSync(filePath)) {
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error('Error deleting file', err);
      }
      let beginTransactionCommand = 'START TRANSACTION;';
      if (isSqlite(connection)) beginTransactionCommand = 'BEGIN TRANSACTION;';

      // Write to file using streams. This is much faster than using fs.appendFileSync
      // which is synchronous and will block the event loop.
      const stream = fs.createWriteStream(filePath, { flags: 'w' });
      stream.write('-- Soft delete migration\n');
      stream.write('-- Generated at ' + new Date().toISOString() + '\n');
      stream.write('--\n');
      stream.write('-- This script will move all rows that have been soft deleted and move them into a new table.\n');
      stream.write('--\n');
      stream.write(
        '-- To run this script, copy the contents of this file into a new file and run it against your database.\n'
      );
      stream.write('--\n');
      stream.write('-- This script will not delete any data. It will only move it.\n');
      stream.write('--\n');
      stream.write('--\n');
      stream.write('--\n');
      stream.write('\n');
      stream.write('\n');
      stream.write('\n');
      stream.write('-- Begin transaction\n');
      stream.write(`${beginTransactionCommand}\n`);
      stream.write('\n');
      stream.write('-- Insert all rows that have been soft deleted into a new table\n');
      stream.write('\n');
      for (const insertQuery of insertQueries) {
        stream.write(insertQuery);
        stream.write(';\n');
      }
      stream.write('\n');
      stream.write('\n');
      stream.write('\n');
      stream.write('-- Delete all rows that have been soft deleted from the original table\n');
      stream.write('\n');
      for (const deleteQuery of deleteQueries) {
        stream.write(deleteQuery);
        stream.write(';\n');
      }
      stream.write('\n');
      stream.write('\n');
      stream.write('\n');
      stream.write('-- Commit transaction\n');
      stream.write('COMMIT;\n');
      stream.end();
    });
  }
}
