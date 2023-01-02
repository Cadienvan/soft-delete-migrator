import { MigrateConfig } from "./models";

export const defaultMigrateConfig: MigrateConfig = {
  schema: "public",
  tableName: "",
  softDeleteColumn: "deleted_at",
  migrateCondition: "1=1",
  migrateConditionParams: [],
  limit: 1000,
  chunkSize: 1000,
  filePath: undefined,
  safeExecution: false,
};