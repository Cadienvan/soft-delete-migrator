import { conn, pQuery } from './shared';


// Chunk an array into chunks of a given size
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

(async () => {
  const rows: any[] = [];
  for (let i = 0; i < 5000; i++) {
    rows.push([i + 1, Math.floor(Math.random() * 100) + 1, `first${i + 1}`, `last${i + 1}`, null]);
  }

  const chunks = chunk(rows, 100);
  const promises: Promise<any>[] = [];
  let sentChunks = 0;
  chunks.forEach((chunk) => {
    promises.push(
      pQuery(conn, 'INSERT INTO users (id, company_id, firstName, lastName, deleted_at) VALUES ?', [chunk])
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
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
    });
})();
