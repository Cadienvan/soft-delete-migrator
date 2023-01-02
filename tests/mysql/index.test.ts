import { migrate } from '../../src/lib';
import { chunk, Mysql2Conn, MysqlConn, pQuery } from '../shared';

const masterTableName = 'softdeletetest';
const slaveTableName = 'slave';

const masterSchema = 'soft_delete_test';
const slaveSchema = 'soft_delete_test_slave';

beforeAll(async () => {
  // Create the softdeletetest table
  await pQuery(
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

  await Promise.all(promisesInsert);

  // Randomly update 100 rows in the softdeletetest table to be soft deleted
  const promisesUpdate: Promise<any>[] = [];
  for (let i = 1; i <= 100; i++) {
    const date = new Date(2021, Math.floor(Math.random() * 18), Math.floor(Math.random() * 30));
    promisesUpdate.push(pQuery(MysqlConn, `UPDATE ${masterTableName} SET deleted_at = ? WHERE id = ?`, [date, i]));
  }

  await Promise.all(promisesUpdate);
});

afterAll(async () => {
  await pQuery(MysqlConn, `DROP TABLE ${masterSchema}.${masterTableName}`, []);
});

describe('dummy db test', () => {
  it('should have 1000 rows in the masterTableName', async () => {
    const results = await pQuery(MysqlConn, `SELECT id FROM ${masterTableName}`, []);
    expect(results.length).toBe(1000);
  });

  it('should have 100 rows in the masterTableName that are soft deleted', async () => {
    const results = await pQuery(MysqlConn, `SELECT id FROM ${masterTableName} WHERE deleted_at IS NOT NULL`, []);
    expect(results.length).toBe(100);
  });
});

describe('migrate', () => {
  it('should migrate and check the results on the same connection', async () => {
    // Randomly update 100 rows in the softdeletetest table to be soft deleted
    const promisesUpdate: Promise<any>[] = [];
    for (let i = 1; i <= 100; i++) {
      const date = new Date(2021, Math.floor(Math.random() * 18), Math.floor(Math.random() * 30));
      promisesUpdate.push(pQuery(MysqlConn, `UPDATE ${masterTableName} SET deleted_at = ? WHERE id = ?`, [date, i]));
    }

    await Promise.all(promisesUpdate);

    const softDeletedCount = (
      await pQuery(
        MysqlConn,
        `SELECT id FROM ${masterTableName} WHERE deleted_at IS NOT NULL AND deleted_at < '2022-01-01'`,
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
    expect(results.length).toBe(softDeletedCount);
    await pQuery(MysqlConn, `DROP TABLE ${slaveTableName}`, []);
  });

  it('should migrate and check the results on a different connection (schema+library in case of test suite for simplicity)', async () => {
    // Randomly update 100 rows in the softdeletetest table to be soft deleted
    const promisesUpdate: Promise<any>[] = [];
    for (let i = 1; i <= 100; i++) {
      const date = new Date(2021, Math.floor(Math.random() * 18), Math.floor(Math.random() * 30));
      promisesUpdate.push(pQuery(MysqlConn, `UPDATE ${masterTableName} SET deleted_at = ? WHERE id = ?`, [date, i]));
    }

    await Promise.all(promisesUpdate);

    const softDeletedCount = (
      await pQuery(
        MysqlConn,
        `SELECT id FROM ${masterTableName} WHERE deleted_at IS NOT NULL AND deleted_at < '2022-01-01'`,
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
    expect(results.length).toBe(softDeletedCount);
    await pQuery(Mysql2Conn, `DROP TABLE ${slaveSchema}.${slaveTableName}`, []);
  });
});
