import { migrate } from '../../src/lib';
import { chunk, pQuery, SQLiteConn1, SQLiteConn2 } from '../shared';

const masterTableName = 'softdeletetest';
const slaveTableName = 'slave';

beforeAll(async () => {
  // Create the softdeletetest table
  await pQuery(
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

  await Promise.all(promisesInsert);

  // Randomly update 100 rows in the softdeletetest table to be soft deleted
  const promisesUpdate: Promise<any>[] = [];
  for (let i = 1; i <= 100; i++) {
    const date = new Date(2021, Math.floor(Math.random() * 18), Math.floor(Math.random() * 30));
    promisesUpdate.push(pQuery(SQLiteConn1, `UPDATE ${masterTableName} SET deleted_at = ? WHERE id = ?`, [date, i]));
  }

  await Promise.all(promisesUpdate);
});

describe('dummy db test', () => {
  it('should have 1000 rows in the masterTableName', async () => {
    const results = await pQuery(SQLiteConn1, `SELECT id FROM ${masterTableName}`, []);
    expect(results.length).toBe(1000);
  });

  it('should have 100 rows in the masterTableName that are soft deleted', async () => {
    const results = await pQuery(SQLiteConn1, `SELECT id FROM ${masterTableName} WHERE deleted_at IS NOT NULL`, []);
    expect(results.length).toBe(100);
  });
});

describe('migrate', () => {
  it('should migrate and check the results on the same connection', async () => {
    // Randomly update 100 rows in the softdeletetest table to be soft deleted
    const promisesUpdate: Promise<any>[] = [];
    for (let i = 1; i <= 100; i++) {
      const date = new Date(2021, Math.floor(Math.random() * 18), Math.floor(Math.random() * 30));
      promisesUpdate.push(pQuery(SQLiteConn1, `UPDATE ${masterTableName} SET deleted_at = ? WHERE id = ?`, [date, i]));
    }

    await Promise.all(promisesUpdate);

    const softDeletedCount = (
      await pQuery(SQLiteConn1, `SELECT id FROM ${masterTableName} WHERE deleted_at IS NOT NULL`, [])
    ).length;
    // Migrate the soft deleted rows
    await migrate(SQLiteConn1, {
      tableName: masterTableName,
      slaveTableName,
      softDeleteColumn: 'deleted_at',
      limit: 500,
      chunkSize: 10,
      safeExecution: false
    });

    // Check the results
    const results = await pQuery(SQLiteConn1, `SELECT id FROM slave`, []);
    expect(results.length).toBe(softDeletedCount);
  });

  it('should migrate and check the results on a different connection', async () => {
    // Randomly update 100 rows in the softdeletetest table to be soft deleted
    const promisesUpdate: Promise<any>[] = [];
    for (let i = 1; i <= 100; i++) {
      const date = new Date(2021, Math.floor(Math.random() * 18), Math.floor(Math.random() * 30));
      promisesUpdate.push(pQuery(SQLiteConn1, `UPDATE ${masterTableName} SET deleted_at = ? WHERE id = ?`, [date, i]));
    }

    await Promise.all(promisesUpdate);
    const softDeletedCount = (
      await pQuery(SQLiteConn1, `SELECT id FROM ${masterTableName} WHERE deleted_at IS NOT NULL`, [])
    ).length;
    // Migrate the soft deleted rows
    await migrate(
      SQLiteConn1,
      {
        tableName: masterTableName,
        slaveTableName,
        softDeleteColumn: 'deleted_at',
        limit: 500,
        chunkSize: 10,
        safeExecution: false
      },
      SQLiteConn2
    );

    // Check the results
    const results = await pQuery(SQLiteConn2, `SELECT id FROM slave`, []);
    expect(results.length).toBe(softDeletedCount);
  });
});
