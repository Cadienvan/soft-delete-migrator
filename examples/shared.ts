import { getConnection } from '../src/lib';

export const conn = getConnection('mysql2', {
  host: 'localhost',
  port: 10002,
  user: 'root',
  password: 'root',
  database: 'soft_delete_test'
});
/*
export const conn = getConnection('sqlite3', {
  filename: './examples/soft-delete-test.db'
});
*/
