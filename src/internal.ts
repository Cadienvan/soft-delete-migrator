import { MigrateConfig } from './models';

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

export function getNewTableName(connection: any, config: MigrateConfig): string {
  if (isSqlite(connection)) {
    return config.slaveTableName || `_${config.tableName}`;
  }
  return config.slaveTableName
    ? `${config.slaveSchema}.${config.slaveTableName}`
    : `${config.schema}._${config.tableName}`;
}
