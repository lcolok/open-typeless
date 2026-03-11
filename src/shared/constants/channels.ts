/**
 * IPC channel constants.
 * Used by both main process and renderer process for communication.
 */

export const IPC_CHANNELS = {
  ASR: {
    /** Start ASR session */
    START: 'asr:start',
    /** Stop ASR session */
    STOP: 'asr:stop',
    /** Send audio data (Renderer -> Main) */
    SEND_AUDIO: 'asr:send-audio',
    /** ASR result (Main -> Renderer) */
    RESULT: 'asr:result',
    /** ASR status change (Main -> Renderer) */
    STATUS: 'asr:status',
    /** Audio input level (Renderer -> Main -> Renderer) */
    LEVEL: 'asr:level',
    /** Audio spectrum bins (Renderer -> Main -> Renderer) */
    SPECTRUM: 'asr:spectrum',
    /** ASR error (Main -> Renderer) */
    ERROR: 'asr:error',
  },
  SETTINGS: {
    GET: 'settings:get',
    UPDATE: 'settings:update',
    CHANGED: 'settings:changed',
    OPEN_WINDOW: 'settings:open-window',
  },
  FLOATING_WINDOW: {
    /** Show floating window (Renderer -> Main) */
    SHOW: 'floating-window:show',
    /** Hide floating window (Renderer -> Main) */
    HIDE: 'floating-window:hide',
    /** Set content height for adaptive window sizing (Renderer -> Main) */
    SET_CONTENT_HEIGHT: 'floating-window:set-content-height',
  },
} as const;
