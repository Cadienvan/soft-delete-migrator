import {
  InputMigrateConfig,
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
import * as fsPromises from 'fs/promises';

import {
  isSqlite,
  chunk,
  generateInsertQueries,
  generateDeleteQueries,
  getSlaveTableName,
  getTableName
} from './internal';
import { defaultMigrateConfig } from './default';

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

export function closeConnection(connection: SupportedConnection): void {
  if (isSqlite(connection)) {
    connection.close();
  } else {
    connection.end();
  }
}

export async function migrate<T>(
  masterConnection: SupportedConnection,
  _config: InputMigrateConfig,
  slaveConnection: SupportedConnection = masterConnection
): Promise<void> {
  const config: MigrateConfig = {
    ...defaultMigrateConfig,
    ..._config,
    slaveSchema: _config.slaveSchema || _config.schema || defaultMigrateConfig.schema,
    slaveTableName: _config.slaveTableName || `_${_config.tableName}`
  };

  await beginTransaction(masterConnection, slaveConnection);

  try {
    const rowsToMove: T[] = await getRowsToMove<T>(config, masterConnection);
    if (rowsToMove.length === 0) {
      return;
    }

    const primaryKeys = await getPrimaryKeys(masterConnection, config);

    await generateTableIfNecessary(config, masterConnection, slaveConnection, primaryKeys);

    const chunks = chunk(rowsToMove, config.chunkSize);

    const insertQueries: string[] = generateInsertQueries<T>(chunks, config, primaryKeys, slaveConnection);
    const deleteQueries: string[] = generateDeleteQueries<T>(chunks, config, primaryKeys, masterConnection);

    if (config.filePaths) {
      try {
        saveQueriesToFile(config.filePaths, insertQueries, deleteQueries, masterConnection, slaveConnection);
      } catch (err) {
        console.error('Could not save queries to file', err);
      }
    }

    if (!config.safeExecution) {
      await Promise.all([
        ...insertQueries.map((query) =>
          pQuery(slaveConnection, query)
            .then(() => {
              config.onInsertedChunk();
            })
            .catch(config.onInsertedChunkError)
        ),
        ...deleteQueries.map((query) =>
          pQuery(masterConnection, query)
            .then(() => {
              config.onDeletedChunk();
            })
            .catch(config.onDeletedChunkError)
        )
      ]);
    }

    await commitTransaction(masterConnection, slaveConnection);
    if (config.closeConnectionOnFinish) {
      closeConnection(masterConnection);
    }
    return;
  } catch (err) {
    await rollbackTransaction(masterConnection, slaveConnection);
    if (config.closeConnectionOnFinish) {
      closeConnection(masterConnection);
    }
    throw err;
  }
}

async function rollbackTransaction(masterConnection: any, slaveConnection: any) {
  if (masterConnection === slaveConnection) return pQuery(masterConnection, 'ROLLBACK');
  return Promise.all([pQuery(masterConnection, 'ROLLBACK'), pQuery(slaveConnection, 'ROLLBACK')]);
}

async function commitTransaction(masterConnection: any, slaveConnection: any) {
  if (masterConnection === slaveConnection) return pQuery(masterConnection, 'COMMIT');
  return Promise.all([pQuery(masterConnection, 'COMMIT'), pQuery(slaveConnection, 'COMMIT')]);
}

async function beginTransaction(masterConnection: any, slaveConnection: any) {
  const promises: any[] = [];
  if (isSqlite(masterConnection)) promises.push(pQuery(masterConnection, 'BEGIN TRANSACTION'));
  else promises.push(pQuery(masterConnection, 'START TRANSACTION'));
  if (masterConnection !== slaveConnection) {
    if (isSqlite(slaveConnection)) promises.push(pQuery(slaveConnection, 'BEGIN TRANSACTION'));
    else promises.push(pQuery(slaveConnection, 'START TRANSACTION'));
  }
  return Promise.all(promises);
}

function pQuery<T>(connection: sqlite3.Database, query: string, params?: any[]): Promise<T[]>;
function pQuery<T>(connection: mysql.Connection, query: string, params?: any[]): Promise<T[]>;
function pQuery<T>(connection: mysql2.Connection, query: string, params?: any[]): Promise<T[]>;
function pQuery<T>(connection: any, query: string, params?: any[]): Promise<T[]> {
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
  if (!(await tableExists(migrationConnection, config))) {
    const columnsDefinition = await getPrimaryKeyColumnsDefinitions(connection, config, primaryKeys);

    const createTableQ = `CREATE TABLE ${getSlaveTableName(migrationConnection, config)} (
    ${columnsDefinition},
    ${config.softDeleteColumn} ${isSqlite(migrationConnection) ? 'INTEGER' : 'DATETIME'},
    data JSON NULL
  )`;
    await pQuery(migrationConnection, createTableQ);
  }
}

async function tableExists(connection: any, config: MigrateConfig) {
  let tableExistsQ = `
  SELECT COUNT(*) AS cnt
  FROM information_schema.tables
  WHERE table_schema = '${config.schema}'
  AND table_name = '${getSlaveTableName(connection, config)}'
`;
  if (isSqlite(connection)) {
    tableExistsQ = `
    SELECT COUNT(*) AS cnt
    FROM sqlite_master
    WHERE type='table' AND name='${getSlaveTableName(connection, config)}'
  `;
  }
  const tableExists: number[] = await pQuery(connection, tableExistsQ);
  return tableExists[0]['cnt'] > 0;
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

async function getPrimaryKeys(connection: any, config: MigrateConfig): Promise<string[]> {
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

async function getPrimaryKeyColumnsDefinitions(
  connection: any,
  config: MigrateConfig,
  primaryKeys: string[]
): Promise<string> {
  if (isSqlite(connection)) {
    return detectSqliteColumnDefinitions(connection, config, primaryKeys);
  } else {
    return detectMysqlColumnDefinitions(connection, config, primaryKeys);
  }
}

async function detectSqliteColumnDefinitions(
  connection: any,
  config: MigrateConfig,
  primaryKeys: string[]
): Promise<string> {
  const columnDefinitionsQ = `
    PRAGMA table_info(${config.tableName})
  `;
  const columnDefinitions: { cid: number; name: string; type: string; notnull: 0 | 1; dflt_value: any; pk: 0 | 1 }[] =
    await pQuery(connection, columnDefinitionsQ);
  return columnDefinitions
    .filter((c) => primaryKeys.indexOf(c.name) !== -1)
    .map((c) => `${c.name} ${c.type} ${c.notnull ? 'NOT NULL' : ''} ${c.dflt_value ? `DEFAULT ${c.dflt_value}` : ''}`)
    .join(', ');
}

async function detectMysqlColumnDefinitions(
  connection: any,
  config: MigrateConfig,
  primaryKeys: string[]
): Promise<string> {
  const columnDefinitionsQ = `
    SELECT column_name, column_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = '${config.schema}' AND table_name = '${config.tableName}'
  `;
  const columnDefinitions: { column_name: string; column_type: string; is_nullable: string; column_default: any }[] =
    await pQuery(connection, columnDefinitionsQ);
  return columnDefinitions
    .filter((c) => primaryKeys.indexOf(c.column_name) !== -1)
    .map(
      (c) =>
        `${c.column_name} ${c.column_type} ${c.is_nullable === 'NO' ? 'NOT NULL' : ''} ${
          c.column_default ? `DEFAULT ${c.column_default}` : ''
        }`
    )
    .join(', ');
}

async function saveQueriesToFile(
  filePaths: string[],
  insertQueries: string[],
  deleteQueries: string[],
  masterConnection: SupportedConnection,
  slaveConnection: SupportedConnection
) {
  // If files exists, delete them
  await fsPromises.unlink(filePaths[0]);
  await fsPromises.unlink(filePaths[1]);

  let masterFileContent = ``;
  let slaveFileContent = ``;

  masterFileContent += '-- Soft delete migration\n';
  masterFileContent += '-- Generated at ' + new Date().toISOString() + '\n';
  masterFileContent += '--\n';
  masterFileContent +=
    '-- This script will move all rows that have been soft deleted and move them into a new table.\n';
  masterFileContent += '--\n';
  masterFileContent +=
    '-- To run this script, copy the contents of this file into a new file and run it against your database.\n';
  masterFileContent += '--\n';
  masterFileContent += '-- This script will not delete any data. It will only move it.\n';
  masterFileContent += '--\n';
  masterFileContent += '--\n';
  masterFileContent += '--\n';
  masterFileContent += '\n';
  masterFileContent += '\n';
  masterFileContent += '\n';
  masterFileContent += '-- Begin transaction\n';

  // The two files will be identical till this point.
  slaveFileContent = masterFileContent;
  masterFileContent += `${isSqlite(masterConnection) ? 'BEGIN' : 'START'} TRANSACTION;\n`;
  masterFileContent += '\n';
  slaveFileContent += `${isSqlite(slaveConnection) ? 'BEGIN' : 'START'} TRANSACTION;\n`;
  slaveFileContent += '\n';

  slaveFileContent += '-- Insert all rows that have been soft deleted into a new table\n';
  slaveFileContent += '\n';
  for (const insertQuery of insertQueries) {
    slaveFileContent += insertQuery;
    slaveFileContent += ';\n';
  }
  slaveFileContent += '\n';
  slaveFileContent += '\n';
  slaveFileContent += '\n';

  masterFileContent += '-- Delete all rows that have been soft deleted from the original table\n';
  masterFileContent += '\n';
  for (const deleteQuery of deleteQueries) {
    masterFileContent += deleteQuery;
    masterFileContent += ';\n';
  }
  masterFileContent += '\n';
  masterFileContent += '\n';
  masterFileContent += '\n';

  masterFileContent += '-- Commit transaction\n';
  masterFileContent += 'COMMIT;\n';
  masterFileContent += '\n';

  slaveFileContent += '-- Commit transaction\n';
  slaveFileContent += 'COMMIT;\n';
  slaveFileContent += '\n';

  await fsPromises.writeFile(filePaths[0], masterFileContent);
  await fsPromises.writeFile(filePaths[1], slaveFileContent);
}
