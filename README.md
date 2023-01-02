

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

- [ ] Try to understand if schema can be removed. Maybe tell dev to specify it or take from connection?
- [ ] Documentation
- [ ] Integrity mechanism to check if primary keys exist both in master and slave table.
- [ ] Explain why it can't be done: export function getConnection(client: 'mysql', config: typeof mysql.Connection.constructor): mysql.Connection; (Because sqlite3 and mysql2 do not expose constructors)
