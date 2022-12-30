import { getConnection } from '../src/lib';

const conn = getConnection('mysql', {
  host: 'localhost',
  port: 10002,
  user: 'root',
  password: 'root',
  database: 'app'
});

// Chunk an array into chunks of a given size
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
conn.query('TRUNCATE TABLE soft_delete_test.users', (err) => {
  if (err) {
    console.error(err);
    return;
  }
  // Insert 5k rows, 100 at a time.
  // Every row contains id, firstName, lastName, and deleted_at
  // The deleted_at column is set to null for all rows
  const rows: any[] = [];
  for (let i = 0; i < 5000; i++) {
    rows.push([i + 1, Math.floor(Math.random() * 100) + 1, `first${i + 1}`, `last${i + 1}`, null]);
  }

  const chunks = chunk(rows, 100);
  const promises: Promise<any>[] = [];
  let sentChunks = 0;
  chunks.forEach((chunk) => {
    promises.push(
      new Promise((resolve) => {
        conn.query(
          'INSERT INTO soft_delete_test.users (id, company_id, firstName, lastName, deleted_at) VALUES ?',
          [chunk],
          (err) => {
            if (err) {
              console.error(err);
            }
            resolve(1);
          }
        );
      })
        .then(() => {
          sentChunks++;
          console.log(`Inserted ${sentChunks} of ${chunks.length} chunks`);
        })
        .catch((err) => {
          console.error(err);
        })
    );
  });

  Promise.all(promises)
    .then(() => {
      console.log('done');
    })
    .catch((err) => {
      console.error(err);
    });
});
