/**
 * ASR (Automatic Speech Recognition) type definitions.
 * Used by both main process and renderer process.
 */

export type ASRProvider = 'volcengine' | 'siliconflow';

/**
 * ASR configuration shared across providers.
 */
export interface ASRConfig {
  provider?: ASRProvider;
  appId?: string;
  accessToken?: string;
  resourceId?: string;
  baseUrl?: string;
  model?: string;
  language?: string;
}

/**
 * ASR result from speech recognition.
 */
export interface ASRResult {
  type: 'interim' | 'final';
  text: string;
  isFinal: boolean;
}

/**
 * ASR status states.
 * - idle: Not started
 * - connecting: Establishing connection to ASR service
 * - listening: Actively listening for audio
 * - processing: Processing final audio
 * - done: Recognition complete
 * - error: An error occurred
 */
export type ASRStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'processing'
  | 'done'
  | 'error';

/**
 * Audio chunk data (PCM format).
 */
export interface AudioChunk {
  data: Int16Array;
  sampleRate: 16000;
  channels: 1;
}
