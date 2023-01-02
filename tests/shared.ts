import { getConnection } from '../src/lib';

export const MysqlConn = getConnection('mysql', {
  host: 'localhost',
  port: 10002,
  user: 'root',
  password: 'root',
  database: 'soft_delete_test'
});

export const Mysql2Conn = getConnection('mysql2', {
  host: 'localhost',
  port: 10002,
  user: 'root',
  password: 'root',
  database: 'soft_delete_test'
});

export const SQLiteConn1 = getConnection('sqlite3', {
  filename: ':memory:'
});

export const SQLiteConn2 = getConnection('sqlite3', {
  filename: ':memory:'
});

export function pQuery<T>(connection: any, query: string, params?: any[]): Promise<T[]> {
  query = query.trim();
  if (isSqlite(connection)) {
    return pQuerySqlite<T>(query, connection, params);
  } else {
    return pQueryMysql<T>(connection, query, params);
  }
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

function isSqlite(connection: any): boolean {
  return connection.run !== undefined;
}

export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
