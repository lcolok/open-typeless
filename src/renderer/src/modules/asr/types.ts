/**
 * Type definitions for the ASR audio recorder module.
 */

/**
 * AudioRecorder state.
 */
export interface AudioRecorderState {
  /** Whether recording is currently in progress */
  isRecording: boolean;
  /** Error message if an error occurred, null otherwise */
  error: string | null;
}

/**
 * Callback function type for audio chunks.
 */
export type AudioChunkCallback = (chunk: ArrayBuffer) => void;

/**
 * Callback invoked with normalized frequency bins in range 0..1.
 */
export type AudioSpectrumCallback = (spectrum: number[]) => void;

/**
 * Callback function type for state changes.
 */
export type StateChangeCallback = (state: AudioRecorderState) => void;

/**
 * Internal state for managing audio resources.
 */
export interface AudioResources {
  /** MediaStream from getUserMedia */
  stream: MediaStream;
  /** AudioContext for processing audio */
  audioContext: AudioContext;
  /** Source node from the media stream */
  sourceNode: MediaStreamAudioSourceNode;
  /** Processor node for capturing audio data */
  processorNode: ScriptProcessorNode;
  /** Analyser node for live spectrum visualization */
  analyserNode: AnalyserNode;
}
