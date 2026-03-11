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
  private state: AudioRecorderState = {
    isRecording: false,
    error: null,
  };

  private resources: AudioResources | null = null;
  private onAudioChunk: AudioChunkCallback;
  private onSpectrum: AudioSpectrumCallback | null;
  private onStateChange: StateChangeCallback | null;
  private spectrumFrameId: number | null = null;

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
    onSpectrum?: AudioSpectrumCallback
  ) {
    this.onAudioChunk = onAudioChunk;
    this.onStateChange = onStateChange ?? null;
    this.onSpectrum = onSpectrum ?? null;
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

  private startSpectrumLoop(): void {
    if (!this.resources?.analyserNode || !this.onSpectrum) {
      return;
    }

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

      this.onSpectrum?.(spectrum);
      this.spectrumFrameId = requestAnimationFrame(tick);
    };

    tick();
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
      // Check for AudioContext support
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextClass) {
        this.setState({ error: AUDIO_ERRORS.AUDIO_CONTEXT_NOT_SUPPORTED });
        return;
      }

      const preferredDeviceId = await this.getPreferredDeviceId();

      // Request microphone access with audio constraints
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

      const activeTrack = stream.getAudioTracks()[0];
      console.log('[AudioRecorder] Active input track:', {
        label: activeTrack?.label || '(unknown)',
        settings: activeTrack?.getSettings?.(),
      });

      // Create AudioContext with desired sample rate
      const audioContext = new AudioContextClass({
        sampleRate: AUDIO_CONFIG.sampleRate,
      });

      // Create source node from media stream
      const sourceNode = audioContext.createMediaStreamSource(stream);
      const analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 512;
      analyserNode.smoothingTimeConstant = 0.82;
      analyserNode.minDecibels = -90;
      analyserNode.maxDecibels = -18;

      // Create ScriptProcessorNode for audio processing
      // Note: ScriptProcessorNode is deprecated but still widely supported
      // AudioWorklet would be the modern replacement but requires more setup
      const processorNode = audioContext.createScriptProcessor(
        AUDIO_CONFIG.bufferSize,
        AUDIO_CONFIG.channelCount, // input channels
        AUDIO_CONFIG.channelCount // output channels
      );

      // Store callback reference for closure
      const onChunk = this.onAudioChunk;

      // Set up audio processing callback
      processorNode.onaudioprocess = (event: AudioProcessingEvent): void => {
        // Get audio data from input buffer (channel 0 = mono)
        const inputData = event.inputBuffer.getChannelData(0);

        // Convert Float32 audio to PCM 16-bit ArrayBuffer
        const pcmBuffer = float32ToArrayBuffer(inputData);

        // Send chunk to callback
        onChunk(pcmBuffer);
      };

      // Connect the audio graph: source -> processor -> destination
      sourceNode.connect(analyserNode);
      sourceNode.connect(processorNode);
      // Connect to destination to ensure onaudioprocess fires
      // The audio won't actually play because we're not outputting anything meaningful
      processorNode.connect(audioContext.destination);

      // Store resources for cleanup
      this.resources = {
        stream,
        audioContext,
        sourceNode,
        processorNode,
        analyserNode,
      };

      this.setState({ isRecording: true });
      this.startSpectrumLoop();
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
      this.onSpectrum?.(Array(11).fill(0));
    }
  }

  /**
   * Stops the current recording.
   */
  public stop(): void {
    if (!this.state.isRecording) {
      return;
    }

    this.cleanupResources();
    this.setState({ isRecording: false });
    this.onSpectrum?.(Array(11).fill(0));
  }

  /**
   * Cleans up all resources. Call this when the recorder is no longer needed.
   */
  public destroy(): void {
    this.stop();
    this.onStateChange = null;
    this.onSpectrum = null;
  }
}
