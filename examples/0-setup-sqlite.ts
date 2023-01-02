import { conn, pQuery } from './shared';


(async () => {
  // Create a users table in sqlite containing id, firstName, lastName, deleted_at, and company_id.
  // The id is a unique key.
  // id + company_id is the primary key.
  await pQuery(
    conn,
    `CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      firstName TEXT,
      lastName TEXT,
      deleted_at TEXT,
      company_id INTEGER
    )`,
    []
  );
  process.exit(0);
})();
