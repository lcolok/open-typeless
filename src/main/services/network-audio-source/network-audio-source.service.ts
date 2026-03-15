/**
 * Network Audio Source Service.
 * Receives raw PCM audio from LicheeRV Nano via WiFi UDP
 * and feeds it directly to the ASR service — no sox, no BlackHole,
 * no getUserMedia. This eliminates ~500ms of software buffering.
 *
 * The board streams 48kHz/16-bit/mono PCM continuously.
 * This service downsamples to 16kHz and only forwards audio
 * to ASR when activated by PushToTalkService.
 */

import { createSocket, Socket } from 'dgram';
import { BrowserWindow } from 'electron';
import log from 'electron-log';
import { asrService } from '../asr';
import { settingsService } from '../settings';
import { IPC_CHANNELS } from '../../../shared/constants/channels';
import { StreamingTranscriber } from './streaming-transcriber';

const logger = log.scope('network-audio-source');

const UDP_PORT = 18816;
const LIVENESS_TIMEOUT_MS = 3000;
const SPECTRUM_BINS = 11;
const SAMPLE_RATE = 48000;

// ─── Downsample ──────────────────────────────────────────────

/**
 * Downsample 48kHz s16le mono to 16kHz using 3-sample averaging.
 */
function downsample48to16(buf: Buffer): Buffer {
  const srcSamples = Math.floor(buf.length / 2);
  const dstSamples = Math.floor(srcSamples / 3);
  const result = Buffer.alloc(dstSamples * 2);
  for (let i = 0; i < dstSamples; i++) {
    const j = i * 6;
    const s0 = buf.readInt16LE(j);
    const s1 = buf.readInt16LE(j + 2);
    const s2 = buf.readInt16LE(j + 4);
    result.writeInt16LE(((s0 + s1 + s2) / 3) | 0, i * 2);
  }
  return result;
}

// ─── Spectrum Analyser (matches AnalyserNode behavior) ───────

// Ring buffer to accumulate samples across packets, like AnalyserNode's internal buffer.
// 512 samples @ 48kHz = 10.7ms window, matching AnalyserNode fftSize=512.
const FFT_SIZE = 512;
const ringBuf = new Float32Array(FFT_SIZE);
let ringPos = 0;

// 11 log-spaced frequency bins covering speech range
const TARGET_FREQS = [85, 150, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 8000];

// Precompute Goertzel coefficients for FFT_SIZE window
const goertzelCoeffs = TARGET_FREQS.map((freq) => {
  const k = (freq * FFT_SIZE) / SAMPLE_RATE;
  return 2 * Math.cos((2 * Math.PI * k) / FFT_SIZE);
});

// Smoothed output bins — mimics AnalyserNode.smoothingTimeConstant = 0.8
const smoothedBins = new Float32Array(SPECTRUM_BINS);
const SMOOTHING = 0.8; // same as AnalyserNode default

/**
 * Push new samples into the ring buffer.
 */
function pushSamples(buf: Buffer): void {
  const count = Math.floor(buf.length / 2);
  for (let i = 0; i < count; i++) {
    ringBuf[ringPos] = buf.readInt16LE(i * 2) / 32768;
    ringPos = (ringPos + 1) % FFT_SIZE;
  }
}

/**
 * Compute spectrum from the ring buffer using Goertzel algorithm.
 * Called on a fixed timer (like requestAnimationFrame), not per-packet.
 */
function computeSpectrum(): number[] {
  const result: number[] = [];

  for (let b = 0; b < SPECTRUM_BINS; b++) {
    const coeff = goertzelCoeffs[b];
    let s1 = 0, s2 = 0;

    // Read ring buffer in order (oldest to newest)
    for (let i = 0; i < FFT_SIZE; i++) {
      const idx = (ringPos + i) % FFT_SIZE;
      const s0 = ringBuf[idx] + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }

    const magnitude = Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2);
    // Scale to 0..1 (empirical, tuned for speech)
    const raw = Math.min(1, magnitude * 3);

    // Apply smoothing: same formula as AnalyserNode
    // smoothed = smoothing * previous + (1 - smoothing) * current
    smoothedBins[b] = SMOOTHING * smoothedBins[b] + (1 - SMOOTHING) * raw;
    result.push(smoothedBins[b]);
  }

  return result;
}

// ─── Service ─────────────────────────────────────────────────

export class NetworkAudioSourceService {
  private socket: Socket | null = null;
  private active = false;
  private lastPacketTime = 0;
  private livenessTimer: ReturnType<typeof setInterval> | null = null;
  private spectrumTimer: ReturnType<typeof setInterval> | null = null;
  private streamingTranscriber = new StreamingTranscriber();
  private onSegmentResult: ((text: string, index: number) => void) | null = null;

  get isReceiving(): boolean {
    return Date.now() - this.lastPacketTime < LIVENESS_TIMEOUT_MS;
  }

  start(): void {
    if (this.socket) return;

    this.socket = createSocket('udp4');

    this.socket.on('message', (msg: Buffer) => {
      this.lastPacketTime = Date.now();

      // Always push to ring buffer for spectrum (even when not active,
      // so the spectrum is ready immediately when activated)
      pushSamples(msg);

      if (!this.active) return;

      const pcm16k = downsample48to16(msg);
      // Buffer.alloc uses a shared pool — pcm16k.buffer is the entire pool.
      // slice() creates an independent copy of just our bytes.
      const isolated = pcm16k.buffer.slice(
        pcm16k.byteOffset,
        pcm16k.byteOffset + pcm16k.byteLength,
      );
      asrService.processAudioChunk(isolated);

      // Feed streaming transcriber if in streaming mode
      if (settingsService.getSettings().transcriptionMode === 'streaming') {
        this.streamingTranscriber.feed(pcm16k);
      }
    });

    this.socket.on('error', (err) => {
      logger.error('UDP socket error', { message: err.message });
    });

    this.socket.bind(UDP_PORT, () => {
      logger.info('Network audio source listening', { port: UDP_PORT });
    });

    this.livenessTimer = setInterval(() => {
      if (this.isReceiving) {
        logger.debug('Board audio stream active');
      }
    }, 10000);
  }

  stop(): void {
    this.active = false;
    this.stopSpectrumTimer();

    if (this.livenessTimer) {
      clearInterval(this.livenessTimer);
      this.livenessTimer = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    logger.info('Network audio source stopped');
  }

  /**
   * Register a callback for streaming segment results.
   * PushToTalkService uses this to insert text as sentences are recognized.
   */
  onStreamingResult(callback: (text: string, index: number) => void): void {
    this.onSegmentResult = callback;
  }

  activate(): void {
    this.active = true;
    this.startSpectrumTimer();
    this.streamingTranscriber.start();
    this.streamingTranscriber.removeAllListeners();
    this.streamingTranscriber.on('segment-result', (text, idx) => {
      this.onSegmentResult?.(text, idx);
    });
    logger.info('Network audio source activated');
  }

  deactivate(): void {
    this.active = false;
    this.streamingTranscriber.stop();
    this.stopSpectrumTimer();

    // Clear visualization
    const zeros = Array(SPECTRUM_BINS).fill(0);
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.ASR.SPECTRUM, zeros);
      }
    }
    // Reset smoothed bins
    smoothedBins.fill(0);

    logger.info('Network audio source deactivated');
  }

  /**
   * Start fixed-rate spectrum updates at ~60fps,
   * matching requestAnimationFrame used by the renderer's AudioRecorder.
   */
  private startSpectrumTimer(): void {
    this.stopSpectrumTimer();
    this.spectrumTimer = setInterval(() => {
      const spectrum = computeSpectrum();
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.ASR.SPECTRUM, spectrum);
        }
      }
    }, 16); // ~60fps
  }

  private stopSpectrumTimer(): void {
    if (this.spectrumTimer) {
      clearInterval(this.spectrumTimer);
      this.spectrumTimer = null;
    }
  }
}

export const networkAudioSource = new NetworkAudioSourceService();
