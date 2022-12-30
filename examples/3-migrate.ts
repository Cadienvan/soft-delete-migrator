import { getConnection, migrate } from '../src/lib';

const conn = getConnection('mysql', {
  host: 'localhost',
  port: 10002,
  user: 'root',
  password: 'root',
  database: 'app'
});

migrate(conn, {
  schema: 'soft_delete_test',
  tableName: 'users',
  primaryKey: ['id', 'company_id'],
  softDeleteColumn: 'deleted_at',
  migrateCondition: 'deleted_at < ?',
  migrateConditionParams: ['2022-01-01'],
  limit: 500,
  chunkSize: 10,
  filePath: './examples/soft-delete-test.sql',
  safeExecution: true
})
  .then(() => {
    console.log('done');
  })
  .catch((err) => {
    console.error(err);
  });
