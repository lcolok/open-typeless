/**
 * ASR module exports.
 * Re-exports the ASR service, procedures, and library utilities.
 */

// Service
export { ASRService, asrService } from './asr.service';
export type { ASRServiceEvents } from './asr.service';

// Procedures
export { startASR, stopASR, getASRStatus } from './procedures';
export type { StartASRResponse, StopASRResponse } from './procedures';

// Types
export type {
  ASRClient,
  VolcengineClientConfig,
  SiliconflowClientConfig,
  ResolvedASRConfig,
  ConnectionState,
  VolcengineMessage,
  VolcengineHeader,
} from './types';
export { VOLCENGINE_CONSTANTS, SILICONFLOW_CONSTANTS } from './types';

// Library utilities
export {
  VolcengineClient,
  SiliconflowClient,
  loadASRConfig,
  isASRConfigured,
  ConfigurationError,
} from './lib';
export type { VolcengineClientEvents, SiliconflowClientEvents, ASREnvConfig } from './lib';
