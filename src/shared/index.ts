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
  AppLocale,
  AudioWarmupMode,
  InteractionMode,
} from './types';

// Constants
export { IPC_CHANNELS } from './constants';
export {
  getLocalizedInteractionMode,
  getLocalizedProviderLabel,
  getLocalizedStatusBadge,
  getLocalizedStatusDetail,
  getLocalizedStatusLabel,
  resolveLocale,
  t,
} from './i18n';
