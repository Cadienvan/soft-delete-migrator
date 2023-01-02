import { MigrateConfig, Mysql2Config, MysqlConfig, Sqlite3Config, SupportedClient } from './models';
import * as sqlite3 from 'sqlite3';
import * as mysql from 'mysql';
import * as mysql2 from 'mysql2';
import * as fs from 'fs';

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

export function migrate(connection: sqlite3.Database, config: MigrateConfig): Promise<void>;
export function migrate(connection: mysql.Connection, config: MigrateConfig): Promise<void>;
export function migrate(connection: mysql2.Connection, config: MigrateConfig): Promise<void>;
export async function migrate<T>(connection: any, config: MigrateConfig): Promise<void> {
  // Start a transaction
  if (isSqlite(connection)) await pQuery(connection, 'BEGIN TRANSACTION');
  else await pQuery(connection, 'START TRANSACTION');

  try {
    const rowsToMove: T[] = await getRowsToMove<T>(config, connection);
    console.log(rowsToMove);

    if (rowsToMove.length === 0) {
      return;
    }

    const primaryKeys = await detectPrimaryKeys(connection, config);

    await generateTableIfNecessary(config, connection, primaryKeys);

    const chunks = chunk(rowsToMove, config.chunkSize);

    const insertQueries: string[] = generateInsertQueries<T>(chunks, config, primaryKeys, connection);
    const deleteQueries: string[] = generateDeleteQueries<T>(chunks, config, primaryKeys, connection);

    if (config.filePath) {
      saveQueriesToFile(config.filePath, insertQueries, deleteQueries);
    }

    if (!config.safeExecution) {
      await Promise.all(insertQueries.map((query) => pQuery(connection, query)));
      await Promise.all(deleteQueries.map((query) => pQuery(connection, query)));
    }
    await pQuery(connection, 'COMMIT');
    return;
  } catch (err) {
    await pQuery(connection, 'ROLLBACK');
    throw err;
  }
}

function saveQueriesToFile(filePath: string, insertQueries: string[], deleteQueries: string[]) {
  fs.writeFileSync(filePath, [...insertQueries, ...deleteQueries].join('\n'));
}

function generateDeleteQueries<T>(chunks: T[][], config: MigrateConfig, primaryKeys: string[], connection: any) {
  const deleteQueries: string[] = [];
  for (const chunk of chunks) {
    deleteQueries.push(
      `
          DELETE FROM ${getTableName(connection, config)}
          WHERE (${primaryKeys.join(', ')}) IN (${chunk
        .map((row) => {
          return `(${primaryKeys.map((key) => `'${row[key]}'`).join(', ')})`;
        })
        .join(', ')});`.trim()
    );
  }
  return deleteQueries;
}

function generateInsertQueries<T>(chunks: T[][], config: MigrateConfig, primaryKeys: string[], connection: any) {
  const insertQueries: string[] = [];
  for (const chunk of chunks) {
    insertQueries.push(
      `
          INSERT INTO ${getNewTableName(connection, config)} (${primaryKeys.join(', ')}, ${
        config.softDeleteColumn
      }, data)
          VALUES ${chunk
            .map((row) => {
              const data = Object.assign({}, row);
              primaryKeys.forEach((key) => delete data[key]);
              delete data[config.softDeleteColumn];
              return `(${primaryKeys.map((key) => `'${row[key]}'`).join(', ')}, '${sanitizeDate(
                row[config.softDeleteColumn]
              )}', '${JSON.stringify(data)}')`;
            })
            .join(', ')};`.trim()
    );
  }
  return insertQueries;
}

async function generateTableIfNecessary(config: MigrateConfig, connection: any, primaryKeys: string[]) {
  if (isSqlite(connection)) {
    await generateTableIfNecessarySqlite(config, connection, primaryKeys);
  } else {
    await generateTableIfNecessaryMysql(config, connection, primaryKeys);
  }
}

async function generateTableIfNecessarySqlite(config: MigrateConfig, connection: any, primaryKeys: string[]) {
  const tableExistsQ = `
      SELECT COUNT(*) AS cnt
      FROM sqlite_master
      WHERE type='table' AND name='_${config.tableName}'
    `;
  const tableExists: number[] = await pQuery(connection, tableExistsQ);
  if (tableExists[0]['cnt'] === 0) {
    const createTableQ = `
          CREATE TABLE ${getNewTableName(connection, config)} AS
          SELECT ${primaryKeys.join(', ')}, ${config.softDeleteColumn}
          FROM ${getTableName(connection, config)}
          WHERE 1 = 0
        `;
    await pQuery(connection, createTableQ);
    const alterTableQ = `
              ALTER TABLE ${getNewTableName(connection, config)}
              ADD COLUMN data JSON NULL
            `;
    await pQuery(connection, alterTableQ);
  }
}

async function generateTableIfNecessaryMysql(config: MigrateConfig, connection: any, primaryKeys: string[]) {
  const tableExistsQ = `
      SELECT COUNT(*) AS cnt
      FROM information_schema.tables
      WHERE table_schema = '${config.schema}'
      AND table_name = '_${config.tableName}'
    `;
  const tableExists: number[] = await pQuery(connection, tableExistsQ);
  if (tableExists[0]['cnt'] === 0) {
    const createTableQ = `
          CREATE TABLE ${getNewTableName(connection, config)} AS
          SELECT ${primaryKeys.join(', ')}, ${config.softDeleteColumn}
          FROM ${getTableName(connection, config)}
          WHERE 1 = 0
        `;
    await pQuery(connection, createTableQ);
    const alterTableQ = `
              ALTER TABLE ${getNewTableName(connection, config)}
              ADD PRIMARY KEY (${primaryKeys.join(', ')}),
              ADD COLUMN data JSON NULL
            `;
    await pQuery(connection, alterTableQ);
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

// Chunk an array into chunks of a given size
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function pQuery<T>(connection: sqlite3.Database, query: string, params?: any[]): Promise<T[]>;
export function pQuery<T>(connection: mysql.Connection, query: string, params?: any[]): Promise<T[]>;
export function pQuery<T>(connection: mysql2.Connection, query: string, params?: any[]): Promise<T[]>;
export function pQuery<T>(connection: any, query: string, params?: any[]): Promise<T[]> {
  query = query.trim();
  console.log(query, params);
  return new Promise((resolve, reject) => {
    if (isSqlite(connection)) {
      if (query.toLowerCase().startsWith('select') || query.toLowerCase().startsWith('pragma')) {
        connection.all(query, params, (err, rows: T[]) => {
          console.log('rows', rows, err, query, params);
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
    } else {
      connection.query(query, params, (err, rows: T[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    }
  });
}

function sanitizeDate(date: Date | string): string {
  if (typeof date === 'string') return date;
  return date.toISOString().replace('T', ' ').replace('Z', '');
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

function isSqlite(connection: any): boolean {
  return connection.run !== undefined;
}

function getTableName(connection: any, config: MigrateConfig): string {
  return isSqlite(connection) ? config.tableName : `${config.schema}.${config.tableName}`;
}

function getNewTableName(connection: any, config: MigrateConfig): string {
  return isSqlite(connection) ? `_${config.tableName}` : `${config.schema}._${config.tableName}`;
}
