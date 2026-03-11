/**
 * Shared module barrel export.
 * Exports types and constants used by both main and renderer processes.
 */

// Types
export type {
  ASRConfig,
  ASRProvider,
  ASRResult,
  ASRStatus,
  AudioChunk,
  AppSettings,
  AppSettingsUpdate,
  InteractionMode,
} from './types';

// Constants
export { IPC_CHANNELS } from './constants';
