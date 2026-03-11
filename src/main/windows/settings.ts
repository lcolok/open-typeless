import { BrowserWindow } from 'electron';
import path from 'node:path';

export class SettingsWindowManager {
  private window: BrowserWindow | null = null;

  create(): void {
    if (this.window) {
      return;
    }

    this.window = new BrowserWindow({
      width: 560,
      height: 660,
      title: 'Open Typeless Settings',
      show: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      titleBarStyle: 'hiddenInset',
      vibrancy: 'sidebar',
      visualEffectState: 'active',
      backgroundColor: '#ece9e2',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });

    if (SETTINGS_WINDOW_VITE_DEV_SERVER_URL) {
      const devUrl = SETTINGS_WINDOW_VITE_DEV_SERVER_URL.replace(/\/$/, '');
      void this.window.loadURL(`${devUrl}/settings.html`);
    } else {
      void this.window.loadFile(
        path.join(__dirname, `../renderer/${SETTINGS_WINDOW_VITE_NAME}/settings.html`),
      );
    }

    this.window.on('close', (event) => {
      event.preventDefault();
      this.window?.hide();
    });

    this.window.on('closed', () => {
      this.window = null;
    });
  }

  show(): void {
    if (!this.window) {
      this.create();
    }

    this.window?.show();
    this.window?.focus();
  }

  destroy(): void {
    if (!this.window) {
      return;
    }

    this.window.removeAllListeners('close');
    this.window.close();
    this.window = null;
  }
}

export const settingsWindow = new SettingsWindowManager();
