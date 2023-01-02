import { getConnection } from '../src/lib';

/*export const conn = getConnection('mysql2', {
  host: 'localhost',
  port: 10002,
  user: 'root',
  password: 'root',
  database: 'soft_delete_test'
});*/

export const conn = getConnection('sqlite3', {
  filename: './examples/soft-delete-test.db'
});

export const conn2 = getConnection('sqlite3', {
  filename: './examples/soft-delete-test2.db'
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
