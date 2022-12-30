import { getConnection } from '../src/lib';

const conn = getConnection('mysql', {
  host: 'localhost',
  port: 10002,
  user: 'root',
  password: 'root',
  database: 'soft_delete_test'
});

// Randomly update 1000 rows in the users table to be soft deleted
// The deleted_at column is set to a random date between 2021-01-01 and 2022-06-30
const promises: Promise<any>[] = [];
for (let i = 0; i < 100; i++) {
  const date = new Date(2021, Math.floor(Math.random() * 18), Math.floor(Math.random() * 30));
  const randomId = Math.floor(Math.random() * 5000);
  promises.push(
    new Promise((resolve) => {
      conn.query('UPDATE users SET deleted_at = ? WHERE id = ?', [date, randomId], (err) => {
        if (err) {
          console.error(err);
        }
        resolve(1);
      });
    })
  );
}

Promise.all(promises)
  .then(() => {
    console.log('done');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
  });
