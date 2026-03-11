export type InteractionMode = 'ptt' | 'toggle';

export interface AppSettings {
  asrProvider: 'volcengine' | 'siliconflow';
  interactionMode: InteractionMode;
  siliconflowModel: string;
  siliconflowLanguage: string;
  siliconflowBaseUrl: string;
}

export interface AppSettingsUpdate {
  asrProvider?: AppSettings['asrProvider'];
  interactionMode?: AppSettings['interactionMode'];
  siliconflowModel?: string;
  siliconflowLanguage?: string;
  siliconflowBaseUrl?: string;
}
