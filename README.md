

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

## Use-case 1: Migrate soft deleted rows to a different database

Given two variables, `mySqlConn` containing an active connection to a MySQL database and `sqliteConn` containing an active connection to a SQLite database, the following code will migrate all soft deleted rows from the `users` table of `mySqlConn` to the `users_deleted` table of `sqliteConn` considering all the deleted items prior to the 2022-12-31:

```typescript
import { migrate } from 'soft-delete-migrator';

migrate(
      mySqlConn,
      {
        tableName: 'users',
        slaveTableName: 'users_deleted',
        softDeleteColumn: 'deleted_at',
        migrateCondition: 'deleted_at < ?',
        migrateConditionParams: ['2022-12-31'],
        limit: 500,
        chunkSize: 10,
        safeExecution: false,

      },
      SQLiteConn2
    );


@TODO
# Tests

You can run the tests by using the following command:

```bash
npm test
```

As the tests are using a real database, you need to have a MySQL running on your machine.  
You can configure the connection details in the `test/shared.ts` file.  
The MySQL instance must have two schemas already created: `soft_delete_migrator` and `soft_delete_migrator_slave`.  
The SQLite instances are created in memory and do not need any configuration.

# ToDo

- [ ] Try to understand if schema can be removed. Maybe tell dev to specify it or take from connection?
- [ ] Documentation
- [ ] Integrity mechanism to check if primary keys exist both in master and slave table.
- [ ] Explain why it can't be done: export function getConnection(client: 'mysql', config: typeof mysql.Connection.constructor): mysql.Connection; (Because sqlite3 and mysql2 do not expose constructors)
