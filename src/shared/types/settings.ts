export type InteractionMode = 'ptt' | 'toggle';
export type AppLocale = 'zh' | 'en' | 'ja';
export type AudioWarmupMode = 'off' | 'short' | 'extended';
/** Audio source selection: auto (network > local), network-only, or local-only */
export type AudioSourceMode = 'auto' | 'network' | 'local';
/** Transcription mode: standard (batch after stop) or streaming (sentence-by-sentence) */
export type TranscriptionMode = 'standard' | 'streaming';

export interface AppSettings {
  asrProvider: 'volcengine' | 'siliconflow';
  locale: AppLocale;
  interactionMode: InteractionMode;
  audioWarmupMode: AudioWarmupMode;
  audioSourceMode: AudioSourceMode;
  /** Specific local audio device ID, or 'auto' for bluetooth-priority selection */
  localAudioDeviceId: string;
  transcriptionMode: TranscriptionMode;
  siliconflowModel: string;
  siliconflowLanguage: string;
  siliconflowBaseUrl: string;
}

export interface AppSettingsUpdate {
  asrProvider?: AppSettings['asrProvider'];
  locale?: AppSettings['locale'];
  interactionMode?: AppSettings['interactionMode'];
  audioWarmupMode?: AppSettings['audioWarmupMode'];
  audioSourceMode?: AppSettings['audioSourceMode'];
  localAudioDeviceId?: string;
  transcriptionMode?: TranscriptionMode;
  siliconflowModel?: string;
  siliconflowLanguage?: string;
  siliconflowBaseUrl?: string;
}
