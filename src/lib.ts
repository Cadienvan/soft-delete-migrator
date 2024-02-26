import { InputMigrateConfig, MigrateConfig, Sqlite3Config, SupportedClient, SupportedConnection } from './models';
import * as sqlite3 from 'sqlite3';
import * as mysql from 'mysql';
import * as mysql2 from 'mysql2';

import {
  isSqlite,
  chunk,
  generateInsertQueries,
  generateDeleteQueries,
  getRowsToMove,
  beginTransaction,
  commitTransaction,
  generateTableIfNecessary,
  getPrimaryKeys,
  pQuery,
  rollbackTransaction,
  saveQueriesToFile
} from './internal';
import { defaultMigrateConfig } from './default';

export function getConnection(client: 'sqlite3', config: Sqlite3Config): sqlite3.Database;
export function getConnection(client: 'mysql', config: mysql.ConnectionConfig): mysql.Connection;
export function getConnection(client: 'mysql2', config: mysql2.ConnectionOptions): mysql2.Connection;
export function getConnection(client: SupportedClient, config: any): any {
  switch (client) {
    case 'sqlite3':
      return new sqlite3.Database(config);
    case 'mysql':
      return mysql.createConnection(config);
    case 'mysql2':
      return mysql2.createConnection(config);
    default:
      throw new Error(`Unsupported client: ${client}`);
  }
}

export function closeConnection(connection: SupportedConnection): void {
  if (isSqlite(connection)) {
    connection.close();
  } else {
    connection.end();
  }
}

export async function migrate<T>(
  masterConnection: SupportedConnection,
  _config: InputMigrateConfig,
  slaveConnection: SupportedConnection = masterConnection
): Promise<void> {
  const config: MigrateConfig = {
    ...defaultMigrateConfig,
    ..._config,
    slaveSchema: _config.slaveSchema || _config.schema || defaultMigrateConfig.schema,
    slaveTableName: _config.slaveTableName || `_${_config.tableName}`
  };

  if (!config.safeExecution) {
    await beginTransaction(masterConnection, slaveConnection);
  }

  try {
    const rowsToMove: T[] = await getRowsToMove<T>(config, masterConnection);
    if (rowsToMove.length === 0) {
      return;
    }

    const primaryKeys = await getPrimaryKeys(masterConnection, config);

    const createQuery = await generateTableIfNecessary(
      config,
      masterConnection,
      slaveConnection,
      primaryKeys,
      config.safeExecution
    );

    const chunks = chunk(rowsToMove, config.chunkSize);

    const insertQueries: string[] = generateInsertQueries<T>(chunks, config, primaryKeys, slaveConnection);
    const deleteQueries: string[] = generateDeleteQueries<T>(chunks, config, primaryKeys, masterConnection);

    if (config.filePaths) {
      await saveQueriesToFile(
        config.filePaths,
        insertQueries,
        deleteQueries,
        createQuery,
        masterConnection,
        slaveConnection
      );
    }

    if (!config.safeExecution) {
      await Promise.all([
        ...insertQueries.map((query) =>
          pQuery(slaveConnection, query)
            .then(() => {
              config.onInsertedChunk();
            })
            .catch(config.onInsertedChunkError)
        ),
        ...deleteQueries.map((query) =>
          pQuery(masterConnection, query)
            .then(() => {
              config.onDeletedChunk();
            })
            .catch(config.onDeletedChunkError)
        )
      ]);
    }

    if (!config.safeExecution) {
      await commitTransaction(masterConnection, slaveConnection);
    }
    if (config.closeConnectionOnFinish) {
      closeConnection(masterConnection);
    }
    return;
  } catch (err) {
    if (!config.safeExecution) {
      await rollbackTransaction(masterConnection, slaveConnection);
    }
    if (config.closeConnectionOnFinish) {
      closeConnection(masterConnection);
    }
    throw err;
  }
}
