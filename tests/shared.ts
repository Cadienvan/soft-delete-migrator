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

export const SQLiteConn1 = getConnection('sqlite3', ':memory:');

export const SQLiteConn2 = getConnection('sqlite3', ':memory:');

export const masterTableName = 'softdeletetest';
export const slaveTableName = 'slave';

export const masterSchema = 'soft_delete_test';
export const slaveSchema = 'soft_delete_test_slave';

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

export const createMasterTableInMysql = () => {
  return pQuery(
    MysqlConn,
    `CREATE TABLE ${masterSchema}.${masterTableName} (
      id int(11) NOT NULL AUTO_INCREMENT,
      firstName varchar(45) DEFAULT NULL,
      lastName varchar(45) DEFAULT NULL,
      deleted_at datetime DEFAULT NULL,
      company_id int(11) NOT NULL,
      PRIMARY KEY (id, company_id),
      UNIQUE KEY id_UNIQUE (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=latin1;`,
    []
  );
};

export const putDummyDataInMysql = () => {
  // Insert 1000 rows into the masterTableName table
  const rows: any[] = [];
  for (let i = 0; i < 1000; i++) {
    rows.push([i + 1, Math.floor(Math.random() * 100) + 1, `first${i + 1}`, `last${i + 1}`, null]);
  }

  const chunks = chunk(rows, 100);
  const promisesInsert: Promise<any>[] = [];
  for (const chunk of chunks) {
    promisesInsert.push(
      pQuery(MysqlConn, `INSERT INTO ${masterTableName} (id, company_id, firstName, lastName, deleted_at) VALUES ?`, [
        chunk
      ])
    );
  }

  return Promise.all(promisesInsert);
};

export const updateDummyDataInMysql = () => {
  // Randomly update 100 rows in the softdeletetest table to be soft deleted
  const promisesUpdate: Promise<any>[] = [];
  for (let i = 1; i <= 100; i++) {
    const date = new Date(2021, Math.floor(Math.random() * 18), Math.floor(Math.random() * 30));
    promisesUpdate.push(pQuery(MysqlConn, `UPDATE ${masterTableName} SET deleted_at = ? WHERE id = ?`, [date, i]));
  }

  return Promise.all(promisesUpdate);
};

export const dropTable = (conn, tableName, schema = '') => {
  const tbName = schema ? `${schema}.${tableName}` : tableName;
  return pQuery(conn, `DROP TABLE ${tbName}`, []);
};

export const createMasterTableInSqlite = () => {
  return pQuery(
    SQLiteConn1,
    `CREATE TABLE ${masterTableName} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      firstName TEXT,
      lastName TEXT,
      deleted_at TEXT,
      company_id INTEGER
    )`,
    []
  );
};

export const putDummyDataInSqlite = () => {
  // Insert 1000 rows into the masterTableName table
  const rows: any[] = [];
  for (let i = 0; i < 1000; i++) {
    rows.push([i + 1, Math.floor(Math.random() * 100) + 1, `first${i + 1}`, `last${i + 1}`, null]);
  }

  const chunks = chunk(rows, 100);
  const promisesInsert: Promise<any>[] = [];
  for (const chunk of chunks) {
    promisesInsert.push(
      pQuery(
        SQLiteConn1,
        `INSERT INTO ${masterTableName} (id, company_id, firstName, lastName, deleted_at) VALUES ${chunk
          .map(() => '(?, ?, ?, ?, ?)')
          .join(', ')}`,
        chunk.flat()
      )
    );
  }

  return Promise.all(promisesInsert);
};

export const updateDummyDataInSqlite = () => {
  // Randomly update 100 rows in the softdeletetest table to be soft deleted
  const promisesUpdate: Promise<any>[] = [];
  for (let i = 1; i <= 100; i++) {
    const date = new Date(2021, Math.floor(Math.random() * 18), Math.floor(Math.random() * 30));
    promisesUpdate.push(pQuery(SQLiteConn1, `UPDATE ${masterTableName} SET deleted_at = ? WHERE id = ?`, [date, i]));
  }

  return Promise.all(promisesUpdate);
};
