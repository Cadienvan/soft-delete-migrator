import { conn } from "./shared";

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
