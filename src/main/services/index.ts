/**
 * Services module exports.
 * Re-exports all main process services.
 */

// ASR Service
export {
  ASRService,
  asrService,
  startASR,
  stopASR,
  getASRStatus,
  VolcengineClient,
  SiliconflowClient,
  loadASRConfig,
  isASRConfigured,
  ConfigurationError,
  VOLCENGINE_CONSTANTS,
  SILICONFLOW_CONSTANTS,
} from './asr';

export type {
  ASRServiceEvents,
  StartASRResponse,
  StopASRResponse,
  VolcengineClientEvents,
  SiliconflowClientEvents,
  ASREnvConfig,
  ASRClient,
  SiliconflowClientConfig,
  ResolvedASRConfig,
  VolcengineClientConfig,
  ConnectionState,
} from './asr';

// Keyboard Service
export { KeyboardService, keyboardService } from './keyboard';
export type { KeyboardConfig } from './keyboard';

// Text Input Service
export { TextInputService, textInputService } from './text-input';
export type { TextInsertResult } from './text-input';

// Permissions Service
export { PermissionsService, permissionsService } from './permissions';
export type { PermissionStatus, PermissionType, MediaAccessStatus } from './permissions';

// Settings Service
export { SettingsService, settingsService } from './settings';

// Menu Bar Service
export { MenuBarService, menuBarService } from './menu-bar';

// Push-to-Talk Service
export { PushToTalkService, pushToTalkService } from './push-to-talk';
export type { PushToTalkConfig } from './push-to-talk';
