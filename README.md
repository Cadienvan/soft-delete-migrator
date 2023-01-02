

# What is this?

A library providing a simple way of accessing a database and moving soft deleted rows to automatically generated tables and prevent performance erosion.  
The library also allows the migration to happen on a different database.  
Currently supported RDBMS are: **Mysql**, **Sqlite**.  
Currently supported Node.js clients: [`mysql`](https://www.npmjs.com/package/mysql), [`mysql2`](https://www.npmjs.com/package/mysql2), [`sqlite3`](https://www.npmjs.com/package/sqlite3).

# How do I install it?

```bash
npm install soft-delete-migrator
```

# How can I use it?

@TODO
# Tests

You can run the tests by using the following command:

```bash
npm test
```

# ToDo

- [ ] Move console logs and errors to a logger passed as a parameter.
- [x] saveQueriesToFile - Allow two different files to be saved depending on connections.
- [ ] Events
- [ ] Documentation
- [ ] Tests
- [ ] Integrity mechanism to check if primary keys exist both in master and slave table.
- [x] Allow slave table name to be defined programmatically.
- [ ] Explain why it can't be done: export function getConnection(client: 'mysql', config: typeof mysql.Connection.constructor): mysql.Connection; (Because sqlite3 and mysql2 do not expose constructors)
- [x] Sqlite currently missing primary keys in newly created table
- [x] Allow slave table to be created in a different connection (Can't creat MysQL table using SELECT FROM anymore)