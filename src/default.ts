import { MigrateConfig } from './models';

export const defaultMigrateConfig: MigrateConfig = {
  schema: 'public',
  tableName: '',
  limit: 1000,
  chunkSize: 100,
  safeExecution: false,
  closeConnectionOnFinish: false,
  columns: ['*'],
  autoRecoveryOnMappingError: false,
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
