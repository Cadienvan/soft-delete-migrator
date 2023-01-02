import * as sqlite3 from 'sqlite3';
import * as mysql from 'mysql';
import * as mysql2 from 'mysql2';

export type SupportedClient = 'sqlite3' | 'mysql' | 'mysql2';
export type SupportedConnection = sqlite3.Database | mysql.Connection | mysql2.Connection;

// Create a type for each supported client
export type Sqlite3Config = {
  filename: string;
};

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
  filePath?: string;
  safeExecution?: boolean;
};
