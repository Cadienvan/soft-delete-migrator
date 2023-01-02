import { conn, pQuery } from './shared';

(async () => {
  await pQuery(
    conn,
    `CREATE TABLE users (
    id int(11) NOT NULL AUTO_INCREMENT,
    firstName varchar(45) DEFAULT NULL,
    lastName varchar(45) DEFAULT NULL,
    deleted_at datetime DEFAULT NULL,
    company_id int(11) NOT NULL,
    PRIMARY KEY (id, company_id),
    UNIQUE KEY id_UNIQUE (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=latin1;`,
    []
  );
  process.exit(0);
})();
