import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import '../src/styles/settings/settings.css';
import type { AppSettings } from '../../shared/types/settings';
import { getLocalizedInteractionMode, getLocalizedProviderLabel, t } from '../../shared/i18n';

const initialSettings: AppSettings = {
  asrProvider: 'volcengine',
  locale: 'zh',
  interactionMode: 'ptt',
  audioWarmupMode: 'short',
  siliconflowModel: 'TeleAI/TeleSpeechASR',
  siliconflowLanguage: 'zh',
  siliconflowBaseUrl: 'https://copilot.logic.heiyu.space/providers/siliconflow/v1',
  audioSourceMode: 'auto',
  localAudioDeviceId: 'auto',
  transcriptionMode: 'standard',
};

function SettingsApp() {
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [statusKey, setStatusKey] = useState<
    'settings.status.loading' | 'settings.status.changes_apply' | 'settings.status.updated' | 'settings.status.saved'
  >('settings.status.loading');
  const locale = settings.locale;

  useEffect(() => {
    void window.api.settings.get().then((nextSettings) => {
      setSettings(nextSettings);
      setStatusKey('settings.status.changes_apply');
    });

    return window.api.settings.onChanged((nextSettings) => {
      setSettings(nextSettings);
      setStatusKey('settings.status.updated');
    });
  }, []);

  const updateSettings = async (update: Partial<AppSettings>) => {
    const nextSettings = await window.api.settings.update(update);
    setSettings(nextSettings);
    setStatusKey('settings.status.saved');
  };

  return (
    <main className="settings-page">
      <section className="settings-shell">
        <div className="settings-card__header">
          <div>
            <p className="settings-eyebrow">{t(locale, 'settings.eyebrow')}</p>
            <h1>{t(locale, 'app.title')}</h1>
          </div>
          <p className="settings-status">{t(locale, statusKey)}</p>
        </div>

        <section className="settings-group">
          <p className="settings-group__title">{t(locale, 'settings.group.recording')}</p>

          <label className="settings-row">
            <span className="settings-row__label">{t(locale, 'settings.field.locale')}</span>
            <select
              value={settings.locale}
              onChange={(event) =>
                void updateSettings({
                  locale: event.target.value as AppSettings['locale'],
                })}
            >
              <option value="zh">{t(locale, 'settings.locale.zh')}</option>
              <option value="en">{t(locale, 'settings.locale.en')}</option>
              <option value="ja">{t(locale, 'settings.locale.ja')}</option>
            </select>
          </label>

          <label className="settings-row">
            <span className="settings-row__label">{t(locale, 'settings.field.provider')}</span>
            <select
              value={settings.asrProvider}
              onChange={(event) =>
                void updateSettings({
                  asrProvider: event.target.value as AppSettings['asrProvider'],
                })}
            >
              <option value="volcengine">
                {getLocalizedProviderLabel(locale, 'volcengine')}
              </option>
              <option value="siliconflow">
                {getLocalizedProviderLabel(locale, 'siliconflow')}
              </option>
            </select>
          </label>

          <label className="settings-row">
            <span className="settings-row__label">
              {t(locale, 'settings.field.interaction_mode')}
            </span>
            <select
              value={settings.interactionMode}
              onChange={(event) =>
                void updateSettings({
                  interactionMode: event.target.value as AppSettings['interactionMode'],
                })}
            >
              <option value="ptt">{getLocalizedInteractionMode(locale, 'ptt')}</option>
              <option value="toggle">{getLocalizedInteractionMode(locale, 'toggle')}</option>
            </select>
          </label>

          <label className="settings-row">
            <span className="settings-row__label">
              {t(locale, 'settings.field.audio_warmup')}
            </span>
            <select
              value={settings.audioWarmupMode}
              onChange={(event) =>
                void updateSettings({
                  audioWarmupMode: event.target.value as AppSettings['audioWarmupMode'],
                })}
            >
              <option value="off">{t(locale, 'settings.warmup.off')}</option>
              <option value="short">{t(locale, 'settings.warmup.short')}</option>
              <option value="extended">{t(locale, 'settings.warmup.extended')}</option>
            </select>
          </label>
        </section>

        <section className="settings-group">
          <p className="settings-group__title">{t(locale, 'settings.group.siliconflow')}</p>

          <label className="settings-row">
            <span className="settings-row__label">{t(locale, 'settings.field.model')}</span>
            <select
              value={settings.siliconflowModel}
              onChange={(event) =>
                void updateSettings({ siliconflowModel: event.target.value })}
            >
              <option value="TeleAI/TeleSpeechASR">TeleAI/TeleSpeechASR</option>
              <option value="FunAudioLLM/SenseVoiceSmall">FunAudioLLM/SenseVoiceSmall</option>
            </select>
          </label>

          <label className="settings-row">
            <span className="settings-row__label">{t(locale, 'settings.field.language')}</span>
            <input
              type="text"
              value={settings.siliconflowLanguage}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  siliconflowLanguage: event.target.value,
                }))}
              onBlur={() =>
                void updateSettings({
                  siliconflowLanguage: settings.siliconflowLanguage.trim() || 'zh',
                })}
            />
          </label>

          <label className="settings-row settings-row--stacked">
            <span className="settings-row__label">{t(locale, 'settings.field.base_url')}</span>
            <input
              type="text"
              value={settings.siliconflowBaseUrl}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  siliconflowBaseUrl: event.target.value,
                }))}
              onBlur={() =>
                void updateSettings({
                  siliconflowBaseUrl:
                    settings.siliconflowBaseUrl.trim() ||
                    'https://copilot.logic.heiyu.space/providers/siliconflow/v1',
                })}
            />
          </label>
        </section>

        <div className="settings-note">
          <strong>{t(locale, 'settings.note.title')}</strong>
          <span>
            {t(locale, 'settings.note.body')}
          </span>
        </div>
      </section>
    </main>
  );
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(<SettingsApp />);
