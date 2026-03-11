import { EventEmitter } from 'events';
import { app } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import log from 'electron-log';
import { SILICONFLOW_CONSTANTS } from '../asr/types';
import type { AppSettings, AppSettingsUpdate, InteractionMode } from '../../../shared/types/settings';

const logger = log.scope('settings-service');

interface SettingsServiceEvents {
  changed: (settings: AppSettings) => void;
}

export interface SettingsService {
  on<K extends keyof SettingsServiceEvents>(
    event: K,
    listener: SettingsServiceEvents[K]
  ): this;
  emit<K extends keyof SettingsServiceEvents>(
    event: K,
    ...args: Parameters<SettingsServiceEvents[K]>
  ): boolean;
}

function getDefaultInteractionMode(): InteractionMode {
  return process.env.ASR_INTERACTION_MODE === 'toggle' ? 'toggle' : 'ptt';
}

function getDefaultSettings(): AppSettings {
  return {
    asrProvider: process.env.ASR_PROVIDER === 'siliconflow' ? 'siliconflow' : 'volcengine',
    interactionMode: getDefaultInteractionMode(),
    siliconflowModel:
      process.env.SILICONFLOW_MODEL ?? SILICONFLOW_CONSTANTS.DEFAULT_MODEL,
    siliconflowLanguage:
      process.env.SILICONFLOW_LANGUAGE ?? SILICONFLOW_CONSTANTS.DEFAULT_LANGUAGE,
    siliconflowBaseUrl:
      process.env.SILICONFLOW_BASE_URL ?? SILICONFLOW_CONSTANTS.DEFAULT_BASE_URL,
  };
}

export class SettingsService extends EventEmitter {
  private settings: AppSettings | null = null;

  private get settingsPath(): string {
    return path.join(app.getPath('userData'), 'settings.json');
  }

  getSettings(): AppSettings {
    if (this.settings) {
      return this.settings;
    }

    const defaults = getDefaultSettings();

    try {
      const raw = readFileSync(this.settingsPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      this.settings = {
        ...defaults,
        ...parsed,
      };
    } catch (error) {
      this.settings = defaults;
      logger.info('Using default settings', {
        reason: error instanceof Error ? error.message : 'settings file not found',
      });
      this.persistSettings(this.settings);
    }

    return this.settings;
  }

  updateSettings(update: AppSettingsUpdate): AppSettings {
    const nextSettings = {
      ...this.getSettings(),
      ...update,
    };

    this.settings = nextSettings;
    this.persistSettings(nextSettings);
    this.emit('changed', nextSettings);
    logger.info('Settings updated', nextSettings);
    return nextSettings;
  }

  private persistSettings(settings: AppSettings): void {
    mkdirSync(path.dirname(this.settingsPath), { recursive: true });
    writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2));
  }
}

export const settingsService = new SettingsService();
