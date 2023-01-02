

# What is this?

# How do I install it?

# How can I use it?

# Tests

You can run the tests by using the following command:

```bash
npm test
```

# ToDo

- [ ] Tests
- [ ] Integrity mechanism to check if primary keys exist both in master and slave table.
- [ ] Allow slave table name to be defined programmatically.
- [ ] Explain why it can't be done: export function getConnection(client: 'mysql', config: typeof mysql.Connection.constructor): mysql.Connection; (Because sqlite3 and mysql2 do not expose constructors)
- [x] Sqlite currently missing primary keys in newly created table
- [ ] Allow slave table to be created in a different connection (Can't creat MysQL table using SELECT FROM anymore)