import { Menu, Tray, nativeImage, app } from 'electron';
import log from 'electron-log';
import { settingsService } from '../settings';
import { settingsWindow } from '../../windows';

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
      settingsWindow.show();
    });

    settingsService.on('changed', this.settingsChangedHandler);

    this.refreshMenu();
    logger.info('Menu bar initialized');
  }

  destroy(): void {
    settingsService.off('changed', this.settingsChangedHandler);
    this.tray?.destroy();
    this.tray = null;
  }

  refreshMenu(): void {
    if (!this.tray) {
      return;
    }

    const settings = settingsService.getSettings();
    this.tray.setTitle('OT');
    this.tray.setToolTip(
      `Open Typeless (${settings.asrProvider}, ${settings.interactionMode})`
    );
    const menu = Menu.buildFromTemplate([
      {
        label: 'Open Typeless',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Open Settings',
        click: () => settingsWindow.show(),
      },
      {
        label: 'ASR Provider',
        submenu: [
          {
            label: 'Volcengine',
            type: 'radio',
            checked: settings.asrProvider === 'volcengine',
            click: () => settingsService.updateSettings({ asrProvider: 'volcengine' }),
          },
          {
            label: 'Siliconflow',
            type: 'radio',
            checked: settings.asrProvider === 'siliconflow',
            click: () => settingsService.updateSettings({ asrProvider: 'siliconflow' }),
          },
        ],
      },
      {
        label: 'Interaction Mode',
        submenu: [
          {
            label: 'Hold to Talk',
            type: 'radio',
            checked: settings.interactionMode === 'ptt',
            click: () => settingsService.updateSettings({ interactionMode: 'ptt' }),
          },
          {
            label: 'Toggle Record',
            type: 'radio',
            checked: settings.interactionMode === 'toggle',
            click: () => settingsService.updateSettings({ interactionMode: 'toggle' }),
          },
        ],
      },
      {
        label: 'Siliconflow Model',
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
        label: 'Quit',
        click: () => app.quit(),
      },
    ]);

    this.tray.setContextMenu(menu);
  }
}

export const menuBarService = new MenuBarService();
