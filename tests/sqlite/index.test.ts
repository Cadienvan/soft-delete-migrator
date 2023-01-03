import { migrate } from '../../src/lib';
import {
  createMasterTableInSqlite,
  dropTable,
  masterTableName,
  pQuery,
  putDummyDataInSqlite,
  slaveTableName,
  SQLiteConn1,
  SQLiteConn2,
  updateDummyDataInSqlite
} from '../shared';

describe('dummy db test', () => {
  it('should have 1000 rows in the masterTableName', async () => {
    await createMasterTableInSqlite();
    await putDummyDataInSqlite();

    const results = await pQuery(SQLiteConn1, `SELECT id FROM ${masterTableName}`, []);

    await dropTable(SQLiteConn1, masterTableName);

    expect(results.length).toBe(1000);
  });

  it('should have 100 rows in the masterTableName that are soft deleted', async () => {
    await createMasterTableInSqlite();
    await putDummyDataInSqlite();
    await updateDummyDataInSqlite();

    const results = await pQuery(SQLiteConn1, `SELECT id FROM ${masterTableName} WHERE deleted_at IS NOT NULL`, []);

    await dropTable(SQLiteConn1, masterTableName);

    expect(results.length).toBe(100);
  });
});

describe('migrate', () => {
  it('should migrate and check the results on the same connection', async () => {
    await createMasterTableInSqlite();
    await putDummyDataInSqlite();
    await updateDummyDataInSqlite();

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

    await dropTable(SQLiteConn1, masterTableName);

    expect(results.length).toBe(softDeletedCount);
  });

  it('should migrate and check the results on a different connection', async () => {
    await createMasterTableInSqlite();
    await putDummyDataInSqlite();
    await updateDummyDataInSqlite();

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

    await dropTable(SQLiteConn1, masterTableName);

    expect(results.length).toBe(softDeletedCount);
  });
});
