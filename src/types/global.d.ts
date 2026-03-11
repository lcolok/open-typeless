/**
 * Global type declarations for the Electron application.
 * Extends the Window interface with the exposed API.
 */

import type { ASRConfig, ASRResult, ASRStatus } from '../shared/types/asr';
import type { AppSettings, AppSettingsUpdate } from '../shared/types/settings';

/**
 * ASR API interface exposed via contextBridge.
 */
interface ASRApi {
  /**
   * Start ASR session.
   * @param config - Optional partial ASR configuration
   */
  start: (config?: Partial<ASRConfig>) => Promise<{ success: boolean }>;

  /**
   * Stop ASR session.
   */
  stop: () => Promise<{ success: boolean }>;

  /**
   * Send audio chunk to main process.
   * @param chunk - Audio data as ArrayBuffer
   */
  sendAudio: (chunk: ArrayBuffer) => void;

  /**
   * Send microphone level for visualization.
   * @param level - Normalized level in range 0..1
   */
  sendLevel: (level: number) => void;

  /**
   * Send microphone spectrum bins for visualization.
   * @param spectrum - Normalized frequency bins in range 0..1
   */
  sendSpectrum: (spectrum: number[]) => void;

  /**
   * Subscribe to ASR results.
   * @param callback - Called when ASR result is received
   * @returns Unsubscribe function
   */
  onResult: (callback: (result: ASRResult) => void) => () => void;

  /**
   * Subscribe to ASR status changes.
   * @param callback - Called when ASR status changes
   * @returns Unsubscribe function
   */
  onStatus: (callback: (status: ASRStatus) => void) => () => void;

  /**
   * Subscribe to microphone level changes.
   * @param callback - Called when input level changes
   * @returns Unsubscribe function
   */
  onLevel: (callback: (level: number) => void) => () => void;

  /**
   * Subscribe to microphone spectrum changes.
   * @param callback - Called when spectrum changes
   * @returns Unsubscribe function
   */
  onSpectrum: (callback: (spectrum: number[]) => void) => () => void;

  /**
   * Subscribe to ASR errors.
   * @param callback - Called when ASR error occurs
   * @returns Unsubscribe function
   */
  onError: (callback: (error: string) => void) => () => void;
}

/**
 * Floating Window API interface exposed via contextBridge.
 */
interface FloatingWindowApi {
  /**
   * Show the floating window.
   */
  show: () => Promise<{ success: boolean }>;

  /**
   * Hide the floating window.
   */
  hide: () => Promise<{ success: boolean }>;

  /**
   * Set content height for adaptive window sizing.
   * @param height - Content height in pixels (from scrollHeight)
   */
  setContentHeight: (height: number) => void;
}

/**
 * Application API exposed to the renderer process.
 */
interface AppApi {
  asr: ASRApi;
  floatingWindow: FloatingWindowApi;
  settings: {
    get: () => Promise<AppSettings>;
    update: (update: AppSettingsUpdate) => Promise<AppSettings>;
    openWindow: () => Promise<{ success: boolean }>;
    onChanged: (callback: (settings: AppSettings) => void) => () => void;
  };
}

declare global {
  interface Window {
    api: AppApi;
  }
}

export {};
