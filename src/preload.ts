/**
 * Preload script for Electron.
 * Exposes a safe API to the renderer process via contextBridge.
 *
 * See the Electron documentation for details on how to use preload scripts:
 * https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './shared/constants/channels';
import type { ASRConfig, ASRResult, ASRStatus } from './shared/types/asr';
import type { AppSettings, AppSettingsUpdate } from './shared/types/settings';

/**
 * ASR API exposed to the renderer process.
 */
const asrApi = {
  /**
   * Start ASR session.
   * @param config - Optional partial ASR configuration
   */
  start: (config?: Partial<ASRConfig>): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.ASR.START, config),

  /**
   * Stop ASR session.
   */
  stop: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.ASR.STOP),

  /**
   * Send audio chunk to main process.
   * @param chunk - Audio data as ArrayBuffer
   */
  sendAudio: (chunk: ArrayBuffer): void => {
    ipcRenderer.send(IPC_CHANNELS.ASR.SEND_AUDIO, chunk);
  },

  /**
   * Send microphone input level to main process for floating window visualization.
   * @param level - Normalized level in range 0..1
   */
  sendLevel: (level: number): void => {
    ipcRenderer.send(IPC_CHANNELS.ASR.LEVEL, level);
  },

  /**
   * Send microphone spectrum bins to main process for visualization.
   * @param spectrum - Normalized frequency bins in range 0..1
   */
  sendSpectrum: (spectrum: number[]): void => {
    ipcRenderer.send(IPC_CHANNELS.ASR.SPECTRUM, spectrum);
  },

  /**
   * Subscribe to ASR results.
   * @param callback - Called when ASR result is received
   * @returns Unsubscribe function
   */
  onResult: (callback: (result: ASRResult) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, result: ASRResult): void => {
      callback(result);
    };
    ipcRenderer.on(IPC_CHANNELS.ASR.RESULT, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.ASR.RESULT, handler);
    };
  },

  /**
   * Subscribe to ASR status changes.
   * @param callback - Called when ASR status changes
   * @returns Unsubscribe function
   */
  onStatus: (callback: (status: ASRStatus) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: ASRStatus): void => {
      callback(status);
    };
    ipcRenderer.on(IPC_CHANNELS.ASR.STATUS, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.ASR.STATUS, handler);
    };
  },

  /**
   * Subscribe to microphone level changes.
   * @param callback - Called when level changes
   * @returns Unsubscribe function
   */
  onLevel: (callback: (level: number) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, level: number): void => {
      callback(level);
    };
    ipcRenderer.on(IPC_CHANNELS.ASR.LEVEL, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.ASR.LEVEL, handler);
    };
  },

  /**
   * Subscribe to microphone spectrum changes.
   * @param callback - Called when spectrum changes
   * @returns Unsubscribe function
   */
  onSpectrum: (callback: (spectrum: number[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, spectrum: number[]): void => {
      callback(spectrum);
    };
    ipcRenderer.on(IPC_CHANNELS.ASR.SPECTRUM, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.ASR.SPECTRUM, handler);
    };
  },

  /**
   * Subscribe to ASR errors.
   * @param callback - Called when ASR error occurs
   * @returns Unsubscribe function
   */
  onError: (callback: (error: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, error: string): void => {
      callback(error);
    };
    ipcRenderer.on(IPC_CHANNELS.ASR.ERROR, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.ASR.ERROR, handler);
    };
  },
};

/**
 * Floating Window API exposed to the renderer process.
 */
const floatingWindowApi = {
  /**
   * Show the floating window.
   */
  show: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FLOATING_WINDOW.SHOW),

  /**
   * Hide the floating window.
   */
  hide: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FLOATING_WINDOW.HIDE),

  /**
   * Set content height for adaptive window sizing.
   * @param height - Content height in pixels (from scrollHeight)
   */
  setContentHeight: (height: number): void => {
    ipcRenderer.send(IPC_CHANNELS.FLOATING_WINDOW.SET_CONTENT_HEIGHT, height);
  },
};

const settingsApi = {
  get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET),

  update: (update: AppSettingsUpdate): Promise<AppSettings> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.UPDATE, update),

  openWindow: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.OPEN_WINDOW),

  onChanged: (callback: (settings: AppSettings) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, settings: AppSettings): void => {
      callback(settings);
    };
    ipcRenderer.on(IPC_CHANNELS.SETTINGS.CHANGED, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.SETTINGS.CHANGED, handler);
    };
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('api', {
  asr: asrApi,
  floatingWindow: floatingWindowApi,
  settings: settingsApi,
});
