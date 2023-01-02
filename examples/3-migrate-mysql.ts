import { conn, pQuery } from './shared';


migrate(conn, {
  schema: 'soft_delete_test',
  tableName: 'users',
  softDeleteColumn: 'deleted_at',
  migrateCondition: 'deleted_at < ?',
  migrateConditionParams: ['2022-01-01'],
  limit: 500,
  chunkSize: 10,
  filePath: './examples/soft-delete-test.sql',
  safeExecution: false
})
  .then(() => {
    console.log('done');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
  });
