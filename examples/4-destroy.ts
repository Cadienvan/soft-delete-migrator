import { getConnection } from '../src/lib';

const conn = getConnection('mysql', {
  host: 'localhost',
  port: 10002,
  user: 'root',
  password: 'root',
  database: 'soft_delete_test'
});

conn.query('DROP TABLE users', (err) => {
  if (err) {
    console.error(err);
    return;
  }
  conn.query('DROP TABLE _users', (err) => {
    if (err) {
      console.error(err);
      return;
    }

    console.log('done');
    process.exit(0);
  });
});
