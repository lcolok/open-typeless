/**
 * AudioRecorder class for capturing microphone audio.
 * Uses Web Audio API to capture, process, and convert audio to PCM format.
 *
 * This is a vanilla TypeScript implementation that doesn't require React.
 * Can be used directly or wrapped in a React hook when needed.
 */

import { AUDIO_CONFIG, AUDIO_ERRORS } from '../constants';
import { float32ToArrayBuffer } from './pcm-converter';
import type {
  AudioChunkCallback,
  AudioPerfCallback,
  AudioReadyCallback,
  AudioSpectrumCallback,
  AudioRecorderState,
  AudioResources,
  StateChangeCallback,
} from '../types';

/**
 * AudioRecorder for capturing microphone audio and converting to PCM format.
 *
 * @example
 * ```typescript
 * const recorder = new AudioRecorder(
 *   (chunk) => {
 *     window.api.asr.sendAudio(chunk);
 *   },
 *   (state) => {
 *     console.log('Recording:', state.isRecording);
 *     if (state.error) console.error(state.error);
 *   }
 * );
 *
 * // Start recording
 * await recorder.start();
 *
 * // Stop recording
 * recorder.stop();
 *
 * // Clean up when done
 * recorder.destroy();
 * ```
 */
export class AudioRecorder {
  private static readonly READY_CONSECUTIVE_CHUNKS = 3;

  private static readonly READY_RMS_THRESHOLD = 0.00008;

  private static readonly READY_PEAK_THRESHOLD = 0.00025;

  private state: AudioRecorderState = {
    isRecording: false,
    error: null,
  };

  private resources: AudioResources | null = null;
  private onAudioChunk: AudioChunkCallback;
  private onSpectrum: AudioSpectrumCallback | null;
  private onStateChange: StateChangeCallback | null;
  private onPerf: AudioPerfCallback | null;
  private onReady: AudioReadyCallback | null;
  private spectrumFrameId: number | null = null;
  private cleanupTimeoutId: number | null = null;
  private setupPromise: Promise<void> | null = null;
  private firstChunkSent = false;
  private firstSpectrumSent = false;
  private readyFired = false;
  private consecutiveLiveChunks = 0;
  private warmIdleTimeoutMs = 10_000;
  private shouldPrewarm = true;

  private getInputLivenessMetrics(inputData: Float32Array): {
    isLive: boolean;
    peak: number;
    rms: number;
  } {
    let sumSquares = 0;
    let peak = 0;

    for (let i = 0; i < inputData.length; i++) {
      const sample = inputData[i];
      const abs = Math.abs(sample);
      sumSquares += sample * sample;

      if (abs > peak) {
        peak = abs;
      }
    }

    const rms = Math.sqrt(sumSquares / inputData.length);
    const isLive =
      rms >= AudioRecorder.READY_RMS_THRESHOLD ||
      peak >= AudioRecorder.READY_PEAK_THRESHOLD;

    return { isLive, peak, rms };
  }

  private resetReadyDetection(): void {
    this.firstChunkSent = false;
    this.firstSpectrumSent = false;
    this.readyFired = false;
    this.consecutiveLiveChunks = 0;
  }

  private async getPreferredDeviceId(): Promise<string | undefined> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return undefined;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(
      (device) => device.kind === 'audioinput'
    );

    if (audioInputs.length === 0) {
      return undefined;
    }

    const bluetoothPattern =
      /airpods|airpods pro|bluetooth|buds|headset|hands-free/i;

    const preferredDevice =
      audioInputs.find(
        (device) =>
          device.deviceId === 'default' &&
          bluetoothPattern.test(device.label)
      ) ??
      audioInputs.find((device) => bluetoothPattern.test(device.label)) ??
      audioInputs.find((device) => device.deviceId === 'default');

    console.log(
      '[AudioRecorder] Available audio inputs:',
      audioInputs.map((device) => ({
        id: device.deviceId,
        label: device.label || '(unlabeled)',
      }))
    );
    console.log('[AudioRecorder] Selected audio input:', {
      id: preferredDevice?.deviceId ?? '(system default)',
      label: preferredDevice?.label || '(system default)',
    });

    return preferredDevice?.deviceId;
  }

  /**
   * Creates a new AudioRecorder instance.
   *
   * @param onAudioChunk - Callback invoked with each audio chunk (PCM 16-bit ArrayBuffer)
   * @param onStateChange - Optional callback invoked when state changes
   */
  constructor(
    onAudioChunk: AudioChunkCallback,
    onStateChange?: StateChangeCallback,
    onSpectrum?: AudioSpectrumCallback,
    onPerf?: AudioPerfCallback,
    onReady?: AudioReadyCallback
  ) {
    this.onAudioChunk = onAudioChunk;
    this.onStateChange = onStateChange ?? null;
    this.onSpectrum = onSpectrum ?? null;
    this.onPerf = onPerf ?? null;
    this.onReady = onReady ?? null;
  }

  /**
   * Gets the current recorder state.
   */
  public getState(): AudioRecorderState {
    return { ...this.state };
  }

  /**
   * Whether recording is currently in progress.
   */
  public get isRecording(): boolean {
    return this.state.isRecording;
  }

  /**
   * Current error message, or null if no error.
   */
  public get error(): string | null {
    return this.state.error;
  }

  /**
   * Updates the internal state and notifies listeners.
   */
  private setState(newState: Partial<AudioRecorderState>): void {
    this.state = { ...this.state, ...newState };
    this.onStateChange?.(this.getState());
  }

  /**
   * Cleans up all audio resources.
   */
  private cleanupResources(): void {
    if (!this.resources) return;

    if (this.spectrumFrameId !== null) {
      cancelAnimationFrame(this.spectrumFrameId);
      this.spectrumFrameId = null;
    }

    // Disconnect and close audio nodes
    this.resources.processorNode.disconnect();
    this.resources.sourceNode.disconnect();
    this.resources.analyserNode.disconnect();

    // Stop all media stream tracks
    this.resources.stream.getTracks().forEach((track: MediaStreamTrack) => {
      track.stop();
    });

    // Close the AudioContext
    void this.resources.audioContext.close();

    this.resources = null;
  }

  private stopSpectrumLoop(): void {
    if (this.spectrumFrameId !== null) {
      cancelAnimationFrame(this.spectrumFrameId);
      this.spectrumFrameId = null;
    }
  }

  private cancelCleanup(): void {
    if (this.cleanupTimeoutId !== null) {
      clearTimeout(this.cleanupTimeoutId);
      this.cleanupTimeoutId = null;
    }
  }

  private scheduleCleanup(): void {
    if (!this.shouldPrewarm) {
      this.cleanupResources();
      return;
    }

    this.cancelCleanup();
    this.cleanupTimeoutId = window.setTimeout(() => {
      console.log('[AudioRecorder] Releasing warmed audio resources after idle timeout');
      this.onPerf?.('warm_cleanup_timeout');
      this.cleanupResources();
      this.cleanupTimeoutId = null;
    }, this.warmIdleTimeoutMs);
  }

  private startSpectrumLoop(): void {
    if (!this.resources?.analyserNode || !this.onSpectrum) {
      return;
    }

    this.stopSpectrumLoop();

    const analyser = this.resources.analyserNode;
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    const outputBins = 11;

    const tick = (): void => {
      analyser.getByteFrequencyData(frequencyData);

      const spectrum = Array.from({ length: outputBins }, (_, index) => {
        const start = Math.floor((index / outputBins) * frequencyData.length);
        const end = Math.floor(((index + 1) / outputBins) * frequencyData.length);
        let sum = 0;
        let count = 0;

        for (let i = start; i < end; i++) {
          sum += frequencyData[i];
          count++;
        }

        if (count === 0) {
          return 0;
        }

        const average = sum / count / 255;
        return Math.min(1, Math.pow(average, 0.85) * 1.35);
      });

      if (!this.firstSpectrumSent) {
        this.firstSpectrumSent = true;
        this.onPerf?.('first_spectrum_frame');
      }

      this.onSpectrum?.(spectrum);
      this.spectrumFrameId = requestAnimationFrame(tick);
    };

    tick();
  }

  private async ensureResources(): Promise<void> {
    this.cancelCleanup();

    if (this.resources) {
      return;
    }

    if (this.setupPromise) {
      await this.setupPromise;
      return;
    }

    this.setupPromise = this.createResources();

    try {
      await this.setupPromise;
    } finally {
      this.setupPromise = null;
    }
  }

  private async createResources(): Promise<void> {
    const totalStart = performance.now();

    // Check for AudioContext support
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) {
      this.setState({ error: AUDIO_ERRORS.AUDIO_CONTEXT_NOT_SUPPORTED });
      return;
    }

    const deviceStart = performance.now();
    const preferredDeviceId = await this.getPreferredDeviceId();
    this.onPerf?.(
      'device_selection_complete',
      {
        preferredDeviceId: preferredDeviceId ?? '(system default)',
      },
      Math.round(performance.now() - deviceStart)
    );
    console.log('[AudioRecorder] Device selection ready', {
      durationMs: Math.round(performance.now() - deviceStart),
      preferredDeviceId: preferredDeviceId ?? '(system default)',
    });

    const streamStart = performance.now();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(preferredDeviceId
          ? {
              deviceId: preferredDeviceId === 'default'
                ? undefined
                : { exact: preferredDeviceId },
            }
          : {}),
        sampleRate: AUDIO_CONFIG.sampleRate,
        channelCount: AUDIO_CONFIG.channelCount,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.onPerf?.(
      'get_user_media_complete',
      undefined,
      Math.round(performance.now() - streamStart)
    );
    console.log('[AudioRecorder] getUserMedia resolved', {
      durationMs: Math.round(performance.now() - streamStart),
    });

    const activeTrack = stream.getAudioTracks()[0];
    console.log('[AudioRecorder] Active input track:', {
      label: activeTrack?.label || '(unknown)',
      settings: activeTrack?.getSettings?.(),
    });

    const graphStart = performance.now();
    const audioContext = new AudioContextClass({
      sampleRate: AUDIO_CONFIG.sampleRate,
    });

    const sourceNode = audioContext.createMediaStreamSource(stream);
    const analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 512;
    analyserNode.smoothingTimeConstant = 0.82;
    analyserNode.minDecibels = -90;
    analyserNode.maxDecibels = -18;

    const processorNode = audioContext.createScriptProcessor(
      AUDIO_CONFIG.bufferSize,
      AUDIO_CONFIG.channelCount,
      AUDIO_CONFIG.channelCount
    );

    const onChunk = this.onAudioChunk;
    processorNode.onaudioprocess = (event: AudioProcessingEvent): void => {
      if (!this.state.isRecording) {
        return;
      }

      const inputData = event.inputBuffer.getChannelData(0);
      const { isLive, peak, rms } = this.getInputLivenessMetrics(inputData);

      if (!this.firstChunkSent) {
        this.firstChunkSent = true;
        this.onPerf?.('first_audio_chunk', {
          peak,
          rms,
        });
      }

      if (isLive) {
        this.consecutiveLiveChunks += 1;
      } else {
        this.consecutiveLiveChunks = 0;
      }

      if (
        !this.readyFired &&
        this.consecutiveLiveChunks >= AudioRecorder.READY_CONSECUTIVE_CHUNKS
      ) {
        this.readyFired = true;
        this.onPerf?.('input_live_confirmed', {
          consecutiveLiveChunks: this.consecutiveLiveChunks,
          peak,
          rms,
        });
        this.onReady?.();
      }

      const pcmBuffer = float32ToArrayBuffer(inputData);
      onChunk(pcmBuffer);
    };

    sourceNode.connect(analyserNode);
    sourceNode.connect(processorNode);
    processorNode.connect(audioContext.destination);

    this.resources = {
      stream,
      audioContext,
      sourceNode,
      processorNode,
      analyserNode,
    };

    console.log('[AudioRecorder] Audio graph warmed', {
      graphMs: Math.round(performance.now() - graphStart),
      totalMs: Math.round(performance.now() - totalStart),
    });
    this.onPerf?.(
      'audio_graph_ready',
      undefined,
      Math.round(performance.now() - graphStart)
    );
    this.onPerf?.(
      'recorder_resources_ready',
      undefined,
      Math.round(performance.now() - totalStart)
    );
  }

  /**
   * Starts recording audio from the microphone.
   *
   * @returns Promise that resolves when recording starts, or rejects on error
   */
  public async start(): Promise<void> {
    // Check if already recording
    if (this.state.isRecording) {
      this.setState({ error: AUDIO_ERRORS.ALREADY_RECORDING });
      return;
    }

    // Clear any previous error
    this.setState({ error: null });

    try {
      const startTime = performance.now();
      this.resetReadyDetection();
      this.onPerf?.('recorder_start_requested');
      await this.ensureResources();
      this.setState({ isRecording: true });
      this.startSpectrumLoop();
      this.onPerf?.(
        'recorder_start_completed',
        {
          warmed: Boolean(this.resources),
        },
        Math.round(performance.now() - startTime)
      );
      console.log('[AudioRecorder] Recording activated', {
        durationMs: Math.round(performance.now() - startTime),
        warmed: Boolean(this.resources),
      });
    } catch (err) {
      // Handle specific error types
      if (err instanceof DOMException) {
        switch (err.name) {
          case 'NotAllowedError':
          case 'PermissionDeniedError':
            this.setState({ error: AUDIO_ERRORS.PERMISSION_DENIED });
            break;
          case 'NotFoundError':
          case 'DevicesNotFoundError':
            this.setState({ error: AUDIO_ERRORS.DEVICE_NOT_AVAILABLE });
            break;
          default:
            this.setState({ error: `Microphone error: ${err.message}` });
        }
      } else if (err instanceof Error) {
        this.setState({ error: `Failed to start recording: ${err.message}` });
      } else {
        this.setState({
          error: 'An unknown error occurred while starting recording',
        });
      }

      // Clean up any partially created resources
      this.cleanupResources();
      this.cancelCleanup();
      this.onSpectrum?.(Array(11).fill(0));
    }
  }

  public async prepare(): Promise<void> {
    if (!this.shouldPrewarm) {
      return;
    }

    try {
      this.onPerf?.('recorder_prepare_requested');
      await this.ensureResources();
      this.onPerf?.('recorder_prepare_completed');
      this.scheduleCleanup();
    } catch (error) {
      console.warn('[AudioRecorder] Warmup failed', error);
    }
  }

  /**
   * Stops the current recording.
   */
  public stop(): void {
    if (!this.state.isRecording) {
      return;
    }

    this.onPerf?.('recorder_stop_requested');
    this.stopSpectrumLoop();
    this.setState({ isRecording: false });
    this.resetReadyDetection();
    this.onSpectrum?.(Array(11).fill(0));
    this.scheduleCleanup();
    this.onPerf?.('recorder_stop_completed');
  }

  /**
   * Cleans up all resources. Call this when the recorder is no longer needed.
   */
  public destroy(): void {
    this.cancelCleanup();
    this.stopSpectrumLoop();
    this.stop();
    this.cleanupResources();
    this.onStateChange = null;
    this.onSpectrum = null;
  }

  public configureWarmup(options: {
    keepAliveMs: number;
    enabled: boolean;
  }): void {
    this.warmIdleTimeoutMs = options.keepAliveMs;
    this.shouldPrewarm = options.enabled;

    if (!options.enabled) {
      this.cancelCleanup();
      if (!this.state.isRecording) {
        this.cleanupResources();
      }
    } else if (!this.state.isRecording && this.resources) {
      this.scheduleCleanup();
    }
  }
}
