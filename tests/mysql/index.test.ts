import { migrate } from '../../src/lib';
import {
  createMasterTableInMysql,
  dropTable,
  masterSchema,
  masterTableName,
  Mysql2Conn,
  MysqlConn,
  pQuery,
  putDummyDataInMysql,
  slaveSchema,
  slaveTableName,
  SQLiteConn1,
  updateDummyDataInMysql
} from '../shared';

describe('dummy db test', () => {
  it('should have 1000 rows in the masterTableName', async () => {
    await createMasterTableInMysql();
    await putDummyDataInMysql();
    const results = await pQuery(MysqlConn, `SELECT id FROM ${masterTableName}`, []);

    await dropTable(MysqlConn, masterTableName);

    expect(results.length).toBe(1000);
  });

  it('should have 100 rows in the masterTableName that are soft deleted', async () => {
    await createMasterTableInMysql();
    await putDummyDataInMysql();
    await updateDummyDataInMysql();

    const results = await pQuery(MysqlConn, `SELECT id FROM ${masterTableName} WHERE deleted_at IS NOT NULL`, []);
    
    await dropTable(MysqlConn, masterTableName);

    expect(results.length).toBe(100);
  });
});

describe('migrate', () => {
  it('should migrate and check the results on the same connection', async () => {
    await createMasterTableInMysql();
    await putDummyDataInMysql();
    await updateDummyDataInMysql();

    const softDeletedCount = (
      await pQuery(
        MysqlConn,
        `SELECT id FROM ${masterSchema}.${masterTableName} WHERE deleted_at IS NOT NULL AND deleted_at < '2022-01-01'`,
        []
      )
    ).length;
    // Migrate the soft deleted rows
    await migrate(MysqlConn, {
      schema: masterSchema,
      tableName: masterTableName,
      slaveTableName,
      softDeleteColumn: 'deleted_at',
      migrateCondition: 'deleted_at < ?',
      migrateConditionParams: ['2022-01-01'],
      limit: 500,
      chunkSize: 10,
      safeExecution: false
    });

    // Check the results
    const results = await pQuery(MysqlConn, `SELECT id FROM ${slaveTableName}`, []);

    await dropTable(MysqlConn, slaveTableName);
    await dropTable(MysqlConn, masterTableName, masterSchema);

    expect(results.length).toBe(softDeletedCount);
  });

  it('should migrate and check the results on a different connection (schema+library in case of test suite for simplicity)', async () => {
    await createMasterTableInMysql();
    await putDummyDataInMysql();
    await updateDummyDataInMysql();

    const softDeletedCount = (
      await pQuery(
        MysqlConn,
        `SELECT id FROM ${masterSchema}.${masterTableName} WHERE deleted_at IS NOT NULL AND deleted_at < '2022-01-01'`,
        []
      )
    ).length;
    // Migrate the soft deleted rows
    await migrate(
      MysqlConn,
      {
        schema: masterSchema,
        tableName: masterTableName,
        slaveSchema,
        slaveTableName,
        softDeleteColumn: 'deleted_at',
        migrateCondition: 'deleted_at < ?',
        migrateConditionParams: ['2022-01-01'],
        limit: 500,
        chunkSize: 10,
        safeExecution: false
      },
      Mysql2Conn
    );

    // Check the results
    const results = await pQuery(Mysql2Conn, `SELECT id FROM ${slaveSchema}.${slaveTableName}`, []);

    await dropTable(MysqlConn, masterTableName, masterSchema);
    await dropTable(Mysql2Conn, slaveTableName, slaveSchema);

    expect(results.length).toBe(softDeletedCount);
  });

  it('should migrate and check the results on mixed connections (mysql to sqlite)', async () => {
    await createMasterTableInMysql();
    await putDummyDataInMysql();
    await updateDummyDataInMysql();

    const softDeletedCount = (
      await pQuery(
        MysqlConn,
        `SELECT id FROM ${masterSchema}.${masterTableName} WHERE deleted_at IS NOT NULL AND deleted_at < '2022-01-01'`,
        []
      )
    ).length;
    // Migrate the soft deleted rows
    await migrate(
      MysqlConn,
      {
        schema: masterSchema,
        tableName: masterTableName,
        slaveTableName,
        softDeleteColumn: 'deleted_at',
        migrateCondition: 'deleted_at < ?',
        migrateConditionParams: ['2022-01-01'],
        limit: 500,
        chunkSize: 10,
        safeExecution: false
      },
      SQLiteConn1
    );

    // Check the results
    const results = await pQuery(SQLiteConn1, `SELECT id FROM ${slaveTableName}`, []);

    await dropTable(MysqlConn, masterTableName, masterSchema);

    expect(results.length).toBe(softDeletedCount);
  });
});
