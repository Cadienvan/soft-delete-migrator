import * as sqlite3 from 'sqlite3';
import * as mysql from 'mysql';
import * as mysql2 from 'mysql2';

export type SupportedClient = 'sqlite3' | 'mysql' | 'mysql2';
export type SupportedConnection = sqlite3.Database | mysql.Connection | mysql2.Connection;

// Create a type for each supported client
export type Sqlite3Config = string

export type MysqlConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

export type Mysql2Config = MysqlConfig;

export type MigrateConfig = {
  schema: string;
  tableName: string;
  softDeleteColumn: string;
  migrateCondition: string;
  migrateConditionParams: any[];
  limit: number;
  chunkSize: number;
  filePaths?: string[];
  safeExecution: boolean;
  slaveSchema?: string;
  slaveTableName?: string;
  closeConnectionOnFinish: boolean;
  onInsertedChunk: () => void;
  onDeletedChunk: () => void;
  onInsertedChunkError: (error: Error) => void;
  onDeletedChunkError: (error: Error) => void;
};

export type InputMigrateConfig = {
  schema?: string;
  tableName: string;
  softDeleteColumn?: string;
  migrateCondition?: string;
  migrateConditionParams?: any[];
  limit?: number;
  chunkSize?: number;
  filePaths?: string[];
  safeExecution?: boolean;
  slaveSchema?: string;
  slaveTableName?: string;
  closeConnectionOnFinish?: boolean;
  onInsertedChunk?: () => void;
  onDeletedChunk?: () => void;
  onInsertedChunkError?: (error: Error) => void;
  onDeletedChunkError?: (error: Error) => void;
};
