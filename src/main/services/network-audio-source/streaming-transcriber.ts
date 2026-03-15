/**
 * Streaming Transcriber.
 * Implements VAD (Voice Activity Detection) + segmented batch upload.
 * Detects silence gaps between sentences and transcribes each segment
 * immediately while recording continues.
 */

import { EventEmitter } from 'events';
import log from 'electron-log';
import { buildWavBuffer } from '../asr/lib/wav';
import { settingsService } from '../settings';

const logger = log.scope('streaming-transcriber');

// VAD parameters — tuned to avoid false cuts during language switching.
// Longer silence threshold reduces mid-sentence splits when mixing Chinese/English.
const SILENCE_RMS_THRESHOLD = 200;     // Below this RMS = silence (stricter = fewer false silences)
const SILENCE_DURATION_MS = 1200;      // 1.2s of silence = sentence boundary (was 600ms)
const MIN_SEGMENT_MS = 1500;           // Ignore segments shorter than 1.5s (was 500ms)
const SAMPLE_RATE = 16000;
const BYTES_PER_MS = (SAMPLE_RATE * 2) / 1000; // 32 bytes/ms

export interface StreamingTranscriberEvents {
  /** Emitted when a segment is transcribed */
  'segment-result': (text: string, segmentIndex: number) => void;
  /** Emitted when a segment transcription fails */
  'segment-error': (error: Error, segmentIndex: number) => void;
}

export interface StreamingTranscriber {
  on<K extends keyof StreamingTranscriberEvents>(event: K, listener: StreamingTranscriberEvents[K]): this;
  off<K extends keyof StreamingTranscriberEvents>(event: K, listener: StreamingTranscriberEvents[K]): this;
  emit<K extends keyof StreamingTranscriberEvents>(
    event: K,
    ...args: Parameters<StreamingTranscriberEvents[K]>
  ): boolean;
}

export class StreamingTranscriber extends EventEmitter {
  private chunks: Buffer[] = [];
  private chunkBytes = 0;
  private silentMs = 0;
  private segmentIndex = 0;
  private inFlightCount = 0;
  private active = false;

  /**
   * Start a new streaming session.
   */
  start(): void {
    this.chunks = [];
    this.chunkBytes = 0;
    this.silentMs = 0;
    this.segmentIndex = 0;
    this.inFlightCount = 0;
    this.active = true;
    logger.info('Streaming transcriber started');
  }

  /**
   * Stop the session. Flushes any remaining audio as a final segment.
   */
  stop(): void {
    if (!this.active) return;
    this.active = false;

    // Flush remaining audio
    if (this.chunkBytes >= MIN_SEGMENT_MS * BYTES_PER_MS) {
      this.flushSegment();
    }

    logger.info('Streaming transcriber stopped', {
      segments: this.segmentIndex,
      inFlight: this.inFlightCount,
    });
  }

  /**
   * Feed a downsampled 16kHz PCM chunk. Called per UDP packet.
   */
  feed(pcm16k: Buffer): void {
    if (!this.active) return;

    this.chunks.push(pcm16k);
    this.chunkBytes += pcm16k.byteLength;

    // Compute RMS for VAD
    const samples = Math.floor(pcm16k.byteLength / 2);
    let sumSq = 0;
    for (let i = 0; i < samples; i++) {
      const s = pcm16k.readInt16LE(i * 2);
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / Math.max(samples, 1));

    if (rms < SILENCE_RMS_THRESHOLD) {
      // 10ms per packet (960 bytes @ 48kHz → 320 bytes @ 16kHz → 10ms)
      this.silentMs += 10;

      if (this.silentMs >= SILENCE_DURATION_MS && this.chunkBytes >= MIN_SEGMENT_MS * BYTES_PER_MS) {
        this.flushSegment();
      }
    } else {
      this.silentMs = 0;
    }
  }

  /**
   * Whether there are segments still being transcribed.
   */
  get hasPendingSegments(): boolean {
    return this.inFlightCount > 0;
  }

  private flushSegment(): void {
    const pcmData = Buffer.concat(this.chunks);
    const durationMs = Math.round(pcmData.byteLength / BYTES_PER_MS);
    const idx = this.segmentIndex++;

    // Reset for next segment
    this.chunks = [];
    this.chunkBytes = 0;
    this.silentMs = 0;

    logger.info('Flushing segment', { index: idx, durationMs, bytes: pcmData.byteLength });

    this.inFlightCount++;
    void this.transcribeSegment(pcmData, idx);
  }

  private async transcribeSegment(pcmData: Buffer, idx: number): Promise<void> {
    try {
      const wavBuffer = buildWavBuffer(pcmData);
      const settings = settingsService.getSettings();

      const endpoint = new URL(
        'audio/transcriptions',
        settings.siliconflowBaseUrl.endsWith('/')
          ? settings.siliconflowBaseUrl
          : `${settings.siliconflowBaseUrl}/`,
      ).toString();

      const headers: Record<string, string> = {};
      const apiKey = process.env.SILICONFLOW_API_KEY;
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      const formData = new FormData();
      formData.set('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'audio.wav');
      formData.set('model', settings.siliconflowModel);
      formData.set('language', settings.siliconflowLanguage);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const payload = (await response.json()) as { text?: string };
      const text = payload.text?.trim() ?? '';

      if (text) {
        logger.info('Segment transcribed', { index: idx, textLength: text.length, text: text.slice(0, 60) });
        this.emit('segment-result', text, idx);
      } else {
        logger.debug('Segment returned empty text', { index: idx });
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Segment transcription failed', { index: idx, error: err.message });
      this.emit('segment-error', err, idx);
    } finally {
      this.inFlightCount--;
    }
  }
}
