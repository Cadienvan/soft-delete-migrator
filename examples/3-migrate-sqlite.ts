import { conn, conn2 } from './shared';
import { migrate } from '../src/lib';

migrate(
  conn,
  {
    schema: '',
    tableName: 'users',
    softDeleteColumn: 'deleted_at',
    migrateCondition: 'deleted_at < ?',
    migrateConditionParams: [1640991600000],
    limit: 500,
    chunkSize: 10,
    filePaths: ['./examples/soft-delete-test-master.sql', './examples/soft-delete-test-slave.sql'],
    safeExecution: false
  },
  conn2
)
  .then(() => {
    console.log('done');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
  });
