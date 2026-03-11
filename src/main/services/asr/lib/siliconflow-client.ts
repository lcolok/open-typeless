import { EventEmitter } from 'events';
import log from 'electron-log';
import type { ASRResult, ASRStatus } from '../../../../shared/types/asr';
import type { ASRClient, BaseASRClientEvents, SiliconflowClientConfig } from '../types';

const logger = log.scope('siliconflow-client');

function buildWavBuffer(
  pcmData: Buffer,
  sampleRate = 16000,
  channels = 1,
  bitsPerSample = 16,
): Buffer {
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmData.length, 40);

  return Buffer.concat([header, pcmData]);
}

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

  private async transcribeBufferedAudio(): Promise<void> {
    try {
      const pcmData = Buffer.concat(this.chunks);
      if (pcmData.length === 0) {
        this.emit('status', 'done');
        return;
      }

      const wavBuffer = buildWavBuffer(pcmData);
      const formData = new FormData();
      const blob = new Blob([wavBuffer], { type: 'audio/wav' });
      formData.set('file', blob, 'audio.wav');
      formData.set('model', this.config.model);
      formData.set('language', this.config.language);

      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers.Authorization = `Bearer ${this.config.apiKey}`;
      }

      const endpoint = new URL(
        'audio/transcriptions',
        this.config.baseUrl.endsWith('/') ? this.config.baseUrl : `${this.config.baseUrl}/`
      ).toString();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Siliconflow request failed: ${response.status} ${response.statusText}`);
      }

      const payload = (await response.json()) as { text?: string };
      const text = payload.text?.trim() ?? '';

      const result: ASRResult = {
        type: 'final',
        text,
        isFinal: true,
      };

      this.emit('result', result);
      this.emit('status', 'done');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Siliconflow transcription failed', { error: err.message });
      this.emit('error', err);
      this.emit('status', 'error');
    }
  }
}
