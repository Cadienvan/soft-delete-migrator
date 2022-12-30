export type SupportedClient = 'sqlite3' | 'mysql' | 'mysql2';

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
