import { getConnection } from '../src/lib';

const conn = getConnection('mysql', {
  host: 'localhost',
  port: 10002,
  user: 'root',
  password: 'root',
  database: 'soft_delete_test'
});

conn.query(
  `CREATE TABLE users (
    id int(11) NOT NULL AUTO_INCREMENT,
    firstName varchar(45) DEFAULT NULL,
    lastName varchar(45) DEFAULT NULL,
    deleted_at datetime DEFAULT NULL,
    company_id int(11) NOT NULL,
    PRIMARY KEY (id, company_id),
    UNIQUE KEY id_UNIQUE (id)
  ) ENGINE=InnoDB AUTO_INCREMENT=5001 DEFAULT CHARSET=latin1;`,
  (err) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log('done');
    process.exit(0);
  }
);
