import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import '../src/styles/settings/settings.css';
import type { AppSettings } from '../../shared/types/settings';

const initialSettings: AppSettings = {
  asrProvider: 'volcengine',
  interactionMode: 'ptt',
  siliconflowModel: 'TeleAI/TeleSpeechASR',
  siliconflowLanguage: 'zh',
  siliconflowBaseUrl: 'https://copilot.logic.heiyu.space/providers/siliconflow/v1',
};

function SettingsApp() {
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [status, setStatus] = useState('Loading settings...');

  useEffect(() => {
    void window.api.settings.get().then((nextSettings) => {
      setSettings(nextSettings);
      setStatus('Changes apply to the next recording session.');
    });

    return window.api.settings.onChanged((nextSettings) => {
      setSettings(nextSettings);
      setStatus('Settings updated.');
    });
  }, []);

  const updateSettings = async (update: Partial<AppSettings>) => {
    const nextSettings = await window.api.settings.update(update);
    setSettings(nextSettings);
    setStatus('Settings saved.');
  };

  return (
    <main className="settings-page">
      <section className="settings-shell">
        <div className="settings-card__header">
          <div>
            <p className="settings-eyebrow">Menu Bar Utility</p>
            <h1>Open Typeless</h1>
          </div>
          <p className="settings-status">{status}</p>
        </div>

        <section className="settings-group">
          <p className="settings-group__title">Recording</p>

          <label className="settings-row">
            <span className="settings-row__label">ASR Provider</span>
            <select
              value={settings.asrProvider}
              onChange={(event) =>
                void updateSettings({
                  asrProvider: event.target.value as AppSettings['asrProvider'],
                })}
            >
              <option value="volcengine">Volcengine</option>
              <option value="siliconflow">Siliconflow</option>
            </select>
          </label>

          <label className="settings-row">
            <span className="settings-row__label">Interaction Mode</span>
            <select
              value={settings.interactionMode}
              onChange={(event) =>
                void updateSettings({
                  interactionMode: event.target.value as AppSettings['interactionMode'],
                })}
            >
              <option value="ptt">Hold to Talk</option>
              <option value="toggle">Toggle Record</option>
            </select>
          </label>
        </section>

        <section className="settings-group">
          <p className="settings-group__title">Siliconflow</p>

          <label className="settings-row">
            <span className="settings-row__label">Model</span>
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
            <span className="settings-row__label">Language</span>
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
            <span className="settings-row__label">Base URL</span>
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
          <strong>Tip</strong>
          <span>
            The menu bar item can switch provider, interaction mode, and
            Siliconflow model without reopening this panel.
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
