import { conn } from './shared';
import { migrate } from '../src/lib';

migrate(conn, {
  schema: 'soft_delete_test',
  tableName: 'users',
  softDeleteColumn: 'deleted_at',
  migrateCondition: 'deleted_at < ?',
  migrateConditionParams: ['2022-01-01'],
  limit: 500,
  chunkSize: 10,
  filePaths: ['./examples/soft-delete-test-master-mysql.sql', './examples/soft-delete-test-slave-mysql.sql'],
  safeExecution: false
})
  .then(() => {
    console.log('done');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
  });
