import { MigrateConfig, SupportedConnection } from './models';
import * as fsPromises from 'fs/promises';
import * as sqlite3 from 'sqlite3';
import * as mysql from 'mysql';
import * as mysql2 from 'mysql2';

export function generateDeleteQueries<T>(
  chunks: T[][],
  config: MigrateConfig,
  primaryKeys: string[],
  connection: any
): string[] {
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

export function generateInsertQueries<T>(
  chunks: T[][],
  config: MigrateConfig,
  primaryKeys: string[],
  connection: any
): string[] {
  const insertQueries: string[] = [];
  for (const chunk of chunks) {
    insertQueries.push(
      `
          INSERT INTO ${getSlaveTableName(connection, config)} (${primaryKeys.join(', ')}, ${
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

export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function sanitizeDate(date: Date | string): string {
  if (typeof date === 'string') return date;
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

export function isSqlite(connection: any): boolean {
  return connection.run !== undefined;
}

export function getTableName(connection: any, config: MigrateConfig): string {
  return isSqlite(connection) ? config.tableName : `${config.schema}.${config.tableName}`;
}

export function getSlaveTableName(connection: any, config: MigrateConfig): string {
  if (isSqlite(connection)) {
    return config.slaveTableName ?? `_${config.tableName}`;
  }
  return config.slaveTableName
    ? `${config.slaveSchema ?? config.schema}.${config.slaveTableName}`
    : `${config.schema}._${config.tableName}`;
}

export async function rollbackTransaction(masterConnection: any, slaveConnection: any) {
  if (masterConnection === slaveConnection) return pQuery(masterConnection, 'ROLLBACK');
  return Promise.all([pQuery(masterConnection, 'ROLLBACK'), pQuery(slaveConnection, 'ROLLBACK')]);
}

export async function commitTransaction(masterConnection: any, slaveConnection: any) {
  if (masterConnection === slaveConnection) return pQuery(masterConnection, 'COMMIT');
  return Promise.all([pQuery(masterConnection, 'COMMIT'), pQuery(slaveConnection, 'COMMIT')]);
}

export async function beginTransaction(masterConnection: any, slaveConnection: any) {
  const promises: any[] = [];
  if (isSqlite(masterConnection)) promises.push(pQuery(masterConnection, 'BEGIN TRANSACTION'));
  else promises.push(pQuery(masterConnection, 'START TRANSACTION'));
  if (masterConnection !== slaveConnection) {
    if (isSqlite(slaveConnection)) promises.push(pQuery(slaveConnection, 'BEGIN TRANSACTION'));
    else promises.push(pQuery(slaveConnection, 'START TRANSACTION'));
  }
  return Promise.all(promises);
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

export async function generateTableIfNecessary(
  config: MigrateConfig,
  connection: any,
  migrationConnection: any,
  primaryKeys: string[],
  onlyReturnQuery = false
) {
  const doesTableExist = await tableExists(migrationConnection, config);
  if (!doesTableExist || onlyReturnQuery) {
    const columnsDefinition = await getPrimaryKeyColumnsDefinitions(connection, config, primaryKeys);

    const createTableQ = `CREATE TABLE ${getSlaveTableName(migrationConnection, config)} (
    ${columnsDefinition},
    ${config.softDeleteColumn} ${isSqlite(migrationConnection) ? 'INTEGER' : 'DATETIME'},
    data JSON NULL
  )`;

    if (!doesTableExist && !onlyReturnQuery) {
      await pQuery(migrationConnection, createTableQ);
    }
    return createTableQ;
  }
  return '';
}

export async function tableExists(connection: any, config: MigrateConfig) {
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

export async function getRowsToMove<T>(config: MigrateConfig, connection: any) {
  const rowsToMoveQ = `
      SELECT *
      FROM ${getTableName(connection, config)}
      WHERE ${config.softDeleteColumn} IS NOT NULL AND (${config.migrateCondition})
      LIMIT ${config.limit}
    `;

  const rowsToMove: T[] = await pQuery(connection, rowsToMoveQ, config.migrateConditionParams);
  return rowsToMove;
}

export function pQueryMysql<T>(connection: any, query: string, params: any[] | undefined): Promise<T[]> {
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

export function pQuerySqlite<T>(query: string, connection: any, params: any[] | undefined): Promise<T[]> {
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

export async function getPrimaryKeys(connection: any, config: MigrateConfig): Promise<string[]> {
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

export async function getPrimaryKeyColumnsDefinitions(
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

export async function detectSqliteColumnDefinitions(
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

export async function detectMysqlColumnDefinitions(
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

export async function saveQueriesToFile(
  filePaths: string[],
  insertQueries: string[],
  deleteQueries: string[],
  createQuery: string,
  masterConnection: SupportedConnection,
  slaveConnection: SupportedConnection
) {
  // If files exists, delete them
  if (
    await fsPromises
      .access(filePaths[0])
      .then(() => true)
      .catch(() => false)
  ) {
    await fsPromises.unlink(filePaths[0]);
  }
  if (
    await fsPromises
      .access(filePaths[1])
      .then(() => true)
      .catch(() => false)
  ) {
    await fsPromises.unlink(filePaths[1]);
  }

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
  slaveFileContent += createQuery;
  slaveFileContent += ';\n';
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
