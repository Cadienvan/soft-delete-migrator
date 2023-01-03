import { MigrateConfig } from './models';

export const defaultMigrateConfig: MigrateConfig = {
  schema: 'public',
  tableName: '',
  softDeleteColumn: 'deleted_at',
  migrateCondition: '1=1',
  migrateConditionParams: [],
  limit: 1000,
  chunkSize: 1000,
  safeExecution: false,
  closeConnectionOnFinish: false,
  onInsertedChunk: () => {
    return;
  },
  onDeletedChunk: () => {
    return;
  },
  onInsertedChunkError: (error: Error) => {
    throw error;
  },
  onDeletedChunkError: (error: Error) => {
    throw error;
  }
};
