import { Menu, Tray, nativeImage, app } from 'electron';
import log from 'electron-log';
import { settingsService } from '../settings';
import { settingsWindow } from '../../windows';
import { getLocalizedInteractionMode, getLocalizedProviderLabel, t } from '../../../shared/i18n';

const logger = log.scope('menu-bar-service');

function createTrayImage() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
      <g fill="none" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="6" y="3" width="6" height="8" rx="3" />
        <path d="M4.5 8.5c0 2.5 2 4.5 4.5 4.5s4.5-2 4.5-4.5" />
        <path d="M9 13v2.5" />
        <path d="M6.5 15.5h5" />
      </g>
    </svg>
  `.trim();

  const image = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
  image.setTemplateImage(true);
  return image;
}

export class MenuBarService {
  private tray: Tray | null = null;
  private menu: Menu | null = null;
  private readonly settingsChangedHandler = (): void => {
    this.refreshMenu();
  };

  create(): void {
    if (this.tray) {
      return;
    }

    this.tray = new Tray(createTrayImage());
    this.tray.setTitle('OT');
    this.tray.setToolTip('Open Typeless');
    this.tray.on('click', () => {
      if (this.tray && this.menu) {
        this.tray.popUpContextMenu(this.menu);
      }
    });
    this.tray.on('right-click', () => {
      if (this.tray && this.menu) {
        this.tray.popUpContextMenu(this.menu);
      }
    });

    settingsService.on('changed', this.settingsChangedHandler);

    this.refreshMenu();
    logger.info('Menu bar initialized');
  }

  destroy(): void {
    settingsService.off('changed', this.settingsChangedHandler);
    this.menu = null;
    this.tray?.destroy();
    this.tray = null;
  }

  refreshMenu(): void {
    if (!this.tray) {
      return;
    }

    const settings = settingsService.getSettings();
    const locale = settings.locale;
    const providerLabel = getLocalizedProviderLabel(locale, settings.asrProvider);
    const interactionModeLabel = getLocalizedInteractionMode(locale, settings.interactionMode);

    this.tray.setTitle('OT');
    this.tray.setToolTip(
      t(locale, 'menu.tooltip', {
        provider: providerLabel,
        mode: interactionModeLabel,
      })
    );
    this.menu = Menu.buildFromTemplate([
      {
        label: t(locale, 'app.title'),
        enabled: false,
      },
      { type: 'separator' },
      {
        label: t(locale, 'menu.open_settings'),
        click: () => settingsWindow.show(),
      },
      {
        label: t(locale, 'menu.asr_provider'),
        submenu: [
          {
            label: t(locale, 'menu.provider.volcengine'),
            type: 'radio',
            checked: settings.asrProvider === 'volcengine',
            click: () => settingsService.updateSettings({ asrProvider: 'volcengine' }),
          },
          {
            label: t(locale, 'menu.provider.siliconflow'),
            type: 'radio',
            checked: settings.asrProvider === 'siliconflow',
            click: () => settingsService.updateSettings({ asrProvider: 'siliconflow' }),
          },
        ],
      },
      {
        label: t(locale, 'menu.interaction_mode'),
        submenu: [
          {
            label: t(locale, 'menu.mode.ptt'),
            type: 'radio',
            checked: settings.interactionMode === 'ptt',
            click: () => settingsService.updateSettings({ interactionMode: 'ptt' }),
          },
          {
            label: t(locale, 'menu.mode.toggle'),
            type: 'radio',
            checked: settings.interactionMode === 'toggle',
            click: () => settingsService.updateSettings({ interactionMode: 'toggle' }),
          },
        ],
      },
      {
        label: t(locale, 'settings.field.audio_warmup'),
        submenu: [
          {
            label: t(locale, 'settings.warmup.off'),
            type: 'radio',
            checked: settings.audioWarmupMode === 'off',
            click: () => settingsService.updateSettings({ audioWarmupMode: 'off' }),
          },
          {
            label: t(locale, 'settings.warmup.short'),
            type: 'radio',
            checked: settings.audioWarmupMode === 'short',
            click: () => settingsService.updateSettings({ audioWarmupMode: 'short' }),
          },
          {
            label: t(locale, 'settings.warmup.extended'),
            type: 'radio',
            checked: settings.audioWarmupMode === 'extended',
            click: () => settingsService.updateSettings({ audioWarmupMode: 'extended' }),
          },
        ],
      },
      {
        label: t(locale, 'settings.field.locale'),
        submenu: [
          {
            label: t(locale, 'settings.locale.zh'),
            type: 'radio',
            checked: settings.locale === 'zh',
            click: () => settingsService.updateSettings({ locale: 'zh' }),
          },
          {
            label: t(locale, 'settings.locale.en'),
            type: 'radio',
            checked: settings.locale === 'en',
            click: () => settingsService.updateSettings({ locale: 'en' }),
          },
          {
            label: t(locale, 'settings.locale.ja'),
            type: 'radio',
            checked: settings.locale === 'ja',
            click: () => settingsService.updateSettings({ locale: 'ja' }),
          },
        ],
      },
      {
        label: t(locale, 'menu.siliconflow_model'),
        submenu: [
          {
            label: 'TeleAI/TeleSpeechASR',
            type: 'radio',
            checked: settings.siliconflowModel === 'TeleAI/TeleSpeechASR',
            click: () =>
              settingsService.updateSettings({
                siliconflowModel: 'TeleAI/TeleSpeechASR',
              }),
          },
          {
            label: 'FunAudioLLM/SenseVoiceSmall',
            type: 'radio',
            checked: settings.siliconflowModel === 'FunAudioLLM/SenseVoiceSmall',
            click: () =>
              settingsService.updateSettings({
                siliconflowModel: 'FunAudioLLM/SenseVoiceSmall',
              }),
          },
        ],
      },
      { type: 'separator' },
      {
        label: t(locale, 'menu.quit'),
        click: () => app.quit(),
      },
    ]);

    this.tray.setContextMenu(this.menu);
  }
}

export const menuBarService = new MenuBarService();
