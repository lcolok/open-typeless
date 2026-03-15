import { EventEmitter } from 'events';
import log from 'electron-log';
import type { ASRResult, ASRStatus } from '../../../../shared/types/asr';
import type { ASRClient, BaseASRClientEvents, SiliconflowClientConfig } from '../types';
import { buildWavBuffer } from './wav';

const logger = log.scope('siliconflow-client');

export interface SiliconflowClientEvents extends BaseASRClientEvents {}

export interface SiliconflowClient {
  on<K extends keyof SiliconflowClientEvents>(
    event: K,
    listener: SiliconflowClientEvents[K]
  ): this;
  off<K extends keyof SiliconflowClientEvents>(
    event: K,
    listener: SiliconflowClientEvents[K]
  ): this;
  emit<K extends keyof SiliconflowClientEvents>(
    event: K,
    ...args: Parameters<SiliconflowClientEvents[K]>
  ): boolean;
}

export class SiliconflowClient extends EventEmitter implements ASRClient {
  private readonly config: SiliconflowClientConfig;
  private chunks: Buffer[] = [];
  private connected = false;
  private finishing = false;
  /** WAV buffer preserved from last failed transcription for manual retry */
  private failedWavBuffer: Buffer | null = null;

  constructor(config: SiliconflowClientConfig) {
    super();
    this.config = config;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    this.chunks = [];
    this.finishing = false;
    this.connected = true;
    this.emit('status', 'connecting');
    this.emit('status', 'listening');
    logger.info('Siliconflow session ready', {
      baseUrl: this.config.baseUrl,
      model: this.config.model,
    });
  }

  disconnect(): void {
    this.chunks = [];
    this.finishing = false;
    this.connected = false;
    this.emit('status', 'idle');
  }

  sendAudio(chunk: ArrayBuffer): void {
    if (!this.connected || this.finishing) {
      return;
    }
    this.chunks.push(Buffer.from(chunk));
  }

  finishAudio(): void {
    if (!this.connected || this.finishing) {
      return;
    }

    this.finishing = true;
    this.emit('status', 'processing');
    void this.transcribeBufferedAudio();
  }

  private static readonly MAX_RETRIES = 2;
  private static readonly RETRY_DELAY_MS = 1000;

  private async transcribeBufferedAudio(): Promise<void> {
    const pcmData = Buffer.concat(this.chunks);
    logger.info('Transcribing buffered audio', {
      chunks: this.chunks.length,
      pcmBytes: pcmData.length,
      durationMs: Math.round(pcmData.length / 32),
    });

    if (pcmData.length === 0) {
      logger.warn('No audio data to transcribe');
      this.emit('status', 'done');
      return;
    }

    // Build WAV once, reuse across retries
    const wavBuffer = buildWavBuffer(pcmData);
    const endpoint = new URL(
      'audio/transcriptions',
      this.config.baseUrl.endsWith('/') ? this.config.baseUrl : `${this.config.baseUrl}/`,
    ).toString();

    const headers: Record<string, string> = {};
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= SiliconflowClient.MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        logger.info('Retrying transcription', { attempt, maxRetries: SiliconflowClient.MAX_RETRIES });
        await new Promise((r) => setTimeout(r, SiliconflowClient.RETRY_DELAY_MS));
      }

      try {
        // FormData must be rebuilt per attempt (consumed by fetch)
        const formData = new FormData();
        formData.set('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'audio.wav');
        formData.set('model', this.config.model);
        formData.set('language', this.config.language);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: formData,
        });

        if (!response.ok) {
          const body = await response.text();
          logger.error('Siliconflow HTTP error', { attempt, status: response.status, body: body.slice(0, 500) });
          lastError = new Error(`Siliconflow request failed: ${response.status} ${response.statusText}`);
          continue; // retry
        }

        const payload = (await response.json()) as { text?: string };
        const text = payload.text?.trim() ?? '';
        logger.info('Transcription result', { attempt, textLength: text.length, text: text.slice(0, 100) });

        const result: ASRResult = {
          type: 'final',
          text,
          isFinal: true,
        };

        this.failedWavBuffer = null; // clear on success
        this.emit('result', result);
        this.emit('status', 'done');
        return; // success, no more retries
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.error('Siliconflow transcription attempt failed', { attempt, error: lastError.message });
      }
    }

    // All retries exhausted — preserve WAV for manual retry
    this.failedWavBuffer = wavBuffer;
    logger.error('Siliconflow transcription failed after all retries, WAV preserved for retry', {
      error: lastError?.message,
      wavBytes: wavBuffer.length,
    });
    this.emit('error', lastError ?? new Error('Transcription failed'));
    this.emit('status', 'error');
  }

  /**
   * Whether there is a failed transcription that can be retried.
   */
  get hasFailedTranscription(): boolean {
    return this.failedWavBuffer !== null;
  }

  /**
   * Retry the last failed transcription using the preserved WAV buffer.
   * Called when user presses the hotkey again after a failure.
   */
  async retryFailedTranscription(): Promise<void> {
    const wavBuffer = this.failedWavBuffer;
    if (!wavBuffer) {
      logger.warn('No failed transcription to retry');
      return;
    }

    logger.info('Retrying failed transcription', { wavBytes: wavBuffer.length });
    this.emit('status', 'processing');

    const endpoint = new URL(
      'audio/transcriptions',
      this.config.baseUrl.endsWith('/') ? this.config.baseUrl : `${this.config.baseUrl}/`,
    ).toString();

    const headers: Record<string, string> = {};
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }

    try {
      const formData = new FormData();
      formData.set('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'audio.wav');
      formData.set('model', this.config.model);
      formData.set('language', this.config.language);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Retry failed: ${response.status} ${body.slice(0, 200)}`);
      }

      const payload = (await response.json()) as { text?: string };
      const text = payload.text?.trim() ?? '';
      logger.info('Retry transcription result', { textLength: text.length, text: text.slice(0, 100) });

      this.failedWavBuffer = null;
      this.emit('result', { type: 'final', text, isFinal: true });
      this.emit('status', 'done');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Retry transcription failed', { error: err.message });
      // Keep failedWavBuffer for another retry attempt
      this.emit('error', err);
      this.emit('status', 'error');
    }
  }
}
