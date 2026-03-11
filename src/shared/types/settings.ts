export type InteractionMode = 'ptt' | 'toggle';
export type AppLocale = 'zh' | 'en' | 'ja';
export type AudioWarmupMode = 'off' | 'short' | 'extended';

export interface AppSettings {
  asrProvider: 'volcengine' | 'siliconflow';
  locale: AppLocale;
  interactionMode: InteractionMode;
  audioWarmupMode: AudioWarmupMode;
  siliconflowModel: string;
  siliconflowLanguage: string;
  siliconflowBaseUrl: string;
}

export interface AppSettingsUpdate {
  asrProvider?: AppSettings['asrProvider'];
  locale?: AppSettings['locale'];
  interactionMode?: AppSettings['interactionMode'];
  audioWarmupMode?: AppSettings['audioWarmupMode'];
  siliconflowModel?: string;
  siliconflowLanguage?: string;
  siliconflowBaseUrl?: string;
}
