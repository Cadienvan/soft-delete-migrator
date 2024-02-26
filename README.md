

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

## Use-case 1: Migrate soft deleted rows to the same database

Given a variable `mySqlConn` containing an active connection to a MySQL database, the following code will migrate all soft deleted rows from the `users` table to the `users_deleted` table considering all the deleted items prior to the 2022-12-31:

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

  }
).then(() => {
  console.log('Migration completed');
}).catch((err) => {
  console.error('Migration failed', err);
});

```

## Use-case 2: Migrate soft deleted rows to a different db connection/client

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
  sqliteConn
).then(() => {
  console.log('Migration completed');
}).catch((err) => {
  console.error('Migration failed', err);
});

```

# API

### A little introduction

When talking about a `master` database, we mean the database containing the table where the soft deleted rows will be migrated from.  
When talking about a `slave` database, we mean the database containing the table where the soft deleted rows will be migrated to.  
The `slave` database is optional. If not given, the library will create a table with the same name as the master table but with the `_` prefix and the given/default schema.  
When talking about `migrateCondition`, we mean the condition to apply to the query to select the rows to migrate.  
This condition will be applied while running the following query (An example of what the library does internally):
```sql
SELECT * FROM <schema>.<tableName> WHERE <softDeleteColumn> IS NOT NULL AND (<migrateCondition>) LIMIT <limit>
```

## migrate

The library exposes a `migrate` function, which executes the migration process.  
The function expects the following parameters:

- `masterConnection`(_required_): The connection to the master database.  
  The connection must be an instance of the following classes: `mysql.Connection`, `mysql2.Connection`, `sqlite3.Database`.  
  The connection must be already connected as the library will not connect it.
- `_config`(_required_): An object containing the following properties:
  - `tableName`(_required_): The name of the master table containing the soft deleted rows.
  - `schema`(_optional_): The schema containing the table to migrate.  
    Defaults to `public`.
  - `softDeleteColumn`(_optional_): The name of the column containing the soft delete datetime(MySQL) or timestamp (Sqlite).  
    Defaults to `deleted_at`.
  - `migrateCondition`(_optional_): The additional condition to apply to the query to select the rows to migrate. 
    Defaults to `1=1`.
  - `migrateConditionParams`(_optional_): The parameters to use in the `migrateCondition` query.
  - `limit`(_optional_): The maximum number of rows to migrate.  
    Defaults to `1000`.
  - `chunkSize`(_optional_): The number of rows to migrate at a time.  
    Defaults to `100`.
  - `filePaths`(_optional_): An array containing two file paths.  
    The first file path is the path used to save the queries necessary for the `master` instance.  
    The second file path is the path used to save the queries necessary for the `slave` instance.
  - `safeExecution`(_optional_): If set to `true`, the library will not execute the queries but will just write them to the `filePaths`, if given.  
  - `slaveSchema`(_optional_): The schema containing the slave table.  
    Defaults to `undefined`. If not set, the library will use the `schema` value.
  - `slaveTableName`(_optional_): The name of the slave table.  
    Defaults to `undefined`. If not set, the library will use the `tableName` value with the `_` prefix and the given/default `schema`.
  - `closeConnectionOnFinish`(_optional_): If set to `true`, the library will close the connection to the involved database(s) after the migration is completed.
  - `autoRecoveryOnMappingError`(_optional_): Usually, the library does a base64 encoding of the JSON stringification of all non-primary fields (All of them or just the passed `columns`). In case of error with any of those two processes, the library will throw an error. If set to `true`, in case of encoding error, the library will try to recover the data by mapping the fields only using the JSON stringification. In case of error in this phase, the library will save an empty string.
    Defaults to `false`.
  - `onInsertedChunk`(_optional_): A callback function to be called after each chunk of rows is inserted on the slave table.
  - `onDeletedChunk`(_optional_): A callback function to be called after each chunk of rows is deleted from the master table.
  - `onInsertedChunkError`(_optional_): A callback function to be called after each chunk of rows fails to be inserted on the slave table.  
    Defaults to a function which `throws` the error.
  - `onDeletedChunkError`(_optional_): A callback function to be called after each chunk of rows fails to be deleted from the master table.  
    Defaults to a function which `throws` the error.
- `slaveConnection`(_optional_): The connection to the slave database.  
  If not given, the library will use the `masterConnection` for both the master and the slave database.

## Other functions

The library also exposes two utility functions: `getConnection` and `closeConnection`.  
The `getConnection` function expects the following parameters:
- `client`: The client to use.  
  Can be either `mysql`, `mysql2` or `sqlite`.
- `config`: The configuration to use to create the connection.
  - In case of `mysql` or `mysql2`, the configuration must be an instance of `mysql.ConnectionConfig` or `mysql2.ConnectionOptions`.
  - In case of `sqlite`, the configuration must be a string containing the path to the SQLite database.

# FAQ

## Why do I need to specify the `schema`?

The library uses the `schema` parameter to check, in case of MySql, if the table exists in the information schema tables.

## How can you ensure data integrity?

The library does all of its work in a transaction.  
If the migration fails, the transaction is rolled back and the data is not migrated.  
If the migration succeeds, the transaction is committed and the data is migrated.

## How can you ensure that the migration is not executed twice?

The library is idempotent in itself as it just considers the rows respecting the `NOT NULL` value of the `softDeleteColumn` and also the `migrateCondition`, if passed.  
If you want to ensure that the migration is not executed twice, you can use the `filePaths` configuration to save the queries necessary to execute the migration, set the `safeExecution` configuration to `true` and then execute them manually.

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
- [ ] Integrity mechanism to check if primary keys exist both in master and slave table.
- [ ] Add support for other databases. Maybe suggest a generic connection interface?
