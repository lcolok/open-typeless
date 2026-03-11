import { BrowserWindow, ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/channels';
import { settingsService } from '../services/settings';
import { settingsWindow } from '../windows';
import type { AppSettingsUpdate } from '../../shared/types/settings';

function broadcastSettingsChanged(): void {
  const settings = settingsService.getSettings();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.SETTINGS.CHANGED, settings);
    }
  }
}

export function setupSettingsHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS.GET, () => {
    return settingsService.getSettings();
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS.UPDATE, (_event, update: AppSettingsUpdate) => {
    return settingsService.updateSettings(update);
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS.OPEN_WINDOW, () => {
    settingsWindow.show();
    return { success: true };
  });

  settingsService.on('changed', () => {
    broadcastSettingsChanged();
  });
}
