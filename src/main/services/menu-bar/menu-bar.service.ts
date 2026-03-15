import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, Menu, Tray, nativeImage, app, ipcMain } from 'electron';
import log from 'electron-log';
import { settingsService } from '../settings';
import { settingsWindow } from '../../windows';
import { getLocalizedInteractionMode, getLocalizedProviderLabel, t } from '../../../shared/i18n';
import { IPC_CHANNELS } from '../../../shared/constants/channels';
import type { AppSettings } from '../../../shared/types/settings';
import { audioDiscovery } from '../network-audio-source';
import { networkAudioSource } from '../network-audio-source';

const logger = log.scope('menu-bar-service');

function resolveTrayIconPath(): string | null {
  const candidates = [
    path.join(process.cwd(), 'assets', 'tray', 'ot-monogramTemplate.png'),
    path.join(app.getAppPath(), 'assets', 'tray', 'ot-monogramTemplate.png'),
    path.resolve(app.getAppPath(), '..', 'assets', 'tray', 'ot-monogramTemplate.png'),
    path.resolve(__dirname, '../../../../assets/tray/ot-monogramTemplate.png'),
    path.resolve(__dirname, '../../../../../assets/tray/ot-monogramTemplate.png'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  logger.error('Tray icon asset not found', { candidates });
  return null;
}

function createTrayImage() {
  const iconPath = resolveTrayIconPath();
  if (!iconPath) {
    return nativeImage.createEmpty();
  }

  const image = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
  image.setTemplateImage(true);

  logger.info('Resolved tray icon asset', {
    iconPath,
    isEmpty: image.isEmpty(),
    size: image.getSize(),
  });

  return image;
}

interface AudioDeviceInfo {
  deviceId: string;
  label: string;
}

export class MenuBarService {
  private tray: Tray | null = null;
  private menu: Menu | null = null;
  private audioDevices: AudioDeviceInfo[] = [];
  private statusTimer: ReturnType<typeof setInterval> | null = null;
  private lastReceivingState = false;
  private readonly settingsChangedHandler = (): void => {
    this.refreshMenu();
  };

  create(): void {
    if (this.tray) {
      return;
    }

    this.tray = new Tray(createTrayImage());
    this.tray.setTitle('');
    this.tray.setToolTip('Open Typeless');
    this.tray.on('click', () => {
      // Re-enumerate devices every time menu is opened
      this.requestAudioDevices();
      if (this.tray && this.menu) {
        this.tray.popUpContextMenu(this.menu);
      }
    });
    this.tray.on('right-click', () => {
      this.requestAudioDevices();
      if (this.tray && this.menu) {
        this.tray.popUpContextMenu(this.menu);
      }
    });

    settingsService.on('changed', this.settingsChangedHandler);

    // Listen for audio device list from renderer
    ipcMain.on(IPC_CHANNELS.AUDIO_DEVICES.LIST, (_event, devices: AudioDeviceInfo[]) => {
      this.audioDevices = devices;
      this.refreshMenu();
    });

    // Refresh menu when network devices appear/disappear
    audioDiscovery.on('device-found', () => this.refreshMenu());
    audioDiscovery.on('device-lost', () => this.refreshMenu());

    this.refreshMenu();
    this.requestAudioDevices();

    // Poll network audio status every 3s to update menu when board goes online/offline
    this.statusTimer = setInterval(() => {
      const receiving = networkAudioSource.isReceiving;
      if (receiving !== this.lastReceivingState) {
        this.lastReceivingState = receiving;
        this.refreshMenu();
      }
    }, 3000);

    logger.info('Menu bar initialized');
  }

  destroy(): void {
    settingsService.off('changed', this.settingsChangedHandler);
    if (this.statusTimer) {
      clearInterval(this.statusTimer);
      this.statusTimer = null;
    }
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

    this.tray.setTitle('');
    this.tray.setToolTip(
      t(locale, 'menu.tooltip', {
        provider: providerLabel,
        mode: interactionModeLabel,
      })
    );
    const boardStatus = this.getBoardStatusLabel();

    this.menu = Menu.buildFromTemplate([
      {
        label: t(locale, 'app.title'),
        enabled: false,
      },
      ...(boardStatus ? [{
        label: boardStatus,
        enabled: false,
      }] : []),
      { type: 'separator' },
      {
        label: t(locale, 'menu.open_settings'),
        click: () => settingsWindow.show(),
      },
      {
        label: t(locale, 'menu.asr_model'),
        submenu: [
          {
            label: 'Volcengine/BigModel',
            type: 'radio',
            checked: settings.asrProvider === 'volcengine',
            click: () => settingsService.updateSettings({ asrProvider: 'volcengine' }),
          },
          { type: 'separator' },
          {
            label: 'SiliconFlow/TeleSpeechASR',
            type: 'radio',
            checked: settings.asrProvider === 'siliconflow' && settings.siliconflowModel === 'TeleAI/TeleSpeechASR',
            click: () => settingsService.updateSettings({
              asrProvider: 'siliconflow',
              siliconflowModel: 'TeleAI/TeleSpeechASR',
            }),
          },
          {
            label: 'SiliconFlow/SenseVoiceSmall',
            type: 'radio',
            checked: settings.asrProvider === 'siliconflow' && settings.siliconflowModel === 'FunAudioLLM/SenseVoiceSmall',
            click: () => settingsService.updateSettings({
              asrProvider: 'siliconflow',
              siliconflowModel: 'FunAudioLLM/SenseVoiceSmall',
            }),
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
        label: t(locale, 'menu.audio_source'),
        submenu: [
          {
            label: t(locale, 'menu.source.auto'),
            type: 'radio',
            checked: settings.audioSourceMode === 'auto',
            click: () => settingsService.updateSettings({ audioSourceMode: 'auto' }),
          },
          {
            label: this.getNetworkDeviceLabel(locale),
            type: 'radio',
            checked: settings.audioSourceMode === 'network',
            click: () => settingsService.updateSettings({ audioSourceMode: 'network' }),
          },
          {
            label: t(locale, 'menu.source.local') +
              (settings.audioSourceMode === 'local' ? ' ✓' : ''),
            submenu: this.buildLocalDeviceSubmenu(settings),
          },
        ],
      },
      {
        label: t(locale, 'menu.transcription_mode'),
        submenu: [
          {
            label: t(locale, 'menu.transcription.standard'),
            type: 'radio',
            checked: settings.transcriptionMode === 'standard',
            click: () => settingsService.updateSettings({ transcriptionMode: 'standard' }),
          },
          {
            label: t(locale, 'menu.transcription.streaming'),
            type: 'radio',
            checked: settings.transcriptionMode === 'streaming',
            click: () => settingsService.updateSettings({ transcriptionMode: 'streaming' }),
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
      { type: 'separator' },
      {
        label: t(locale, 'menu.quit'),
        click: () => app.quit(),
      },
    ]);

    this.tray.setContextMenu(this.menu);
  }

  private buildLocalDeviceSubmenu(settings: AppSettings): Electron.MenuItemConstructorOptions[] {
    const isLocal = settings.audioSourceMode === 'local';
    const items: Electron.MenuItemConstructorOptions[] = [
      {
        label: '自动选择',
        type: 'radio',
        checked: isLocal && settings.localAudioDeviceId === 'auto',
        click: () => settingsService.updateSettings({ audioSourceMode: 'local', localAudioDeviceId: 'auto' }),
      },
    ];

    if (this.audioDevices.length > 0) {
      items.push({ type: 'separator' });
      for (const device of this.audioDevices) {
        if (device.deviceId === 'default') continue;
        items.push({
          label: device.label,
          type: 'radio',
          checked: isLocal && settings.localAudioDeviceId === device.deviceId,
          click: () => settingsService.updateSettings({
            audioSourceMode: 'local',
            localAudioDeviceId: device.deviceId,
          }),
        });
      }
    }

    return items;
  }

  private getBoardStatusLabel(): string | null {
    const devices = audioDiscovery.discoveredDevices;
    const isOnline = networkAudioSource.isReceiving;

    if (devices.length === 0 && !isOnline) return null;

    const name = devices.length > 0 ? devices[0].name : '网络麦克风';
    return isOnline ? `🟢 ${name}` : `⚪ ${name} (离线)`;
  }

  private getNetworkDeviceLabel(_locale: AppSettings['locale']): string {
    const devices = audioDiscovery.discoveredDevices;
    const isOnline = networkAudioSource.isReceiving;

    if (devices.length > 0) {
      const name = devices[0].name;
      return isOnline ? `🟢 ${name}` : `⚪ ${name}`;
    }

    return isOnline ? '🟢 网络麦克风' : '⚪ 网络麦克风 (未发现)';
  }

  private requestAudioDevices(): void {
    const wins = BrowserWindow.getAllWindows().filter(w => !w.isDestroyed());
    if (wins.length > 0) {
      wins[0].webContents.send(IPC_CHANNELS.AUDIO_DEVICES.ENUMERATE);
    }
  }
}

export const menuBarService = new MenuBarService();
