/**
 * Main window renderer process.
 * Handles automatic audio recording when ASR status changes.
 */

import './index.css';
import { AudioRecorder } from './renderer/src/modules/asr';
import type { ASRPerfContext } from './shared/types/asr';
import type { AppSettings } from './shared/types/settings';

console.log(
  '👋 This message is being logged by "renderer.ts", included via Vite',
);

// Audio recorder instance
let recorder: AudioRecorder | null = null;
let desiredRecording = false;
let startGeneration = 0;
let currentPerfContext: ASRPerfContext = {
  sessionId: 'renderer-init',
  startedAtMs: Date.now(),
};
let cueAudioContext: AudioContext | null = null;
let currentCaptureReady = false;
let currentAsrStatus = 'idle';

interface ToneStep {
  frequency: number;
  durationMs: number;
  gain: number;
}

function getWarmupConfig(mode: AppSettings['audioWarmupMode']): {
  keepAliveMs: number;
  enabled: boolean;
} {
  switch (mode) {
    case 'off':
      return { keepAliveMs: 0, enabled: false };
    case 'extended':
      return { keepAliveMs: 45_000, enabled: true };
    case 'short':
    default:
      return { keepAliveMs: 10_000, enabled: true };
  }
}

function reportPerf(
  stage: string,
  details?: Record<string, unknown>,
  durationMs?: number
): void {
  const timestampMs = Date.now();
  window.api.asr.reportPerf({
    sessionId: currentPerfContext.sessionId,
    stage,
    timestampMs,
    sinceStartMs: timestampMs - currentPerfContext.startedAtMs,
    durationMs,
    details,
  });
}

async function ensureCueAudioContext(): Promise<AudioContext | null> {
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextClass) {
    return null;
  }

  if (!cueAudioContext || cueAudioContext.state === 'closed') {
    cueAudioContext = new AudioContextClass();
  }

  if (cueAudioContext.state === 'suspended') {
    await cueAudioContext.resume();
  }

  return cueAudioContext;
}

async function playCue(steps: ToneStep[]): Promise<void> {
  const context = await ensureCueAudioContext();
  if (!context) {
    reportPerf('audio_cue_unavailable');
    return;
  }

  let cursor = context.currentTime + 0.01;

  for (const step of steps) {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(step.frequency, cursor);

    gainNode.gain.setValueAtTime(0.0001, cursor);
    gainNode.gain.linearRampToValueAtTime(step.gain, cursor + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      cursor + step.durationMs / 1000
    );

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.start(cursor);
    oscillator.stop(cursor + step.durationMs / 1000);

    cursor += step.durationMs / 1000 + 0.015;
  }
}

function playReadyCue(): void {
  reportPerf('ready_cue_requested');
  void playCue([
    { frequency: 880, durationMs: 70, gain: 0.03 },
    { frequency: 1174.66, durationMs: 90, gain: 0.03 },
  ]).then(() => {
    reportPerf('ready_cue_completed');
  });
}

function playStopCue(): void {
  reportPerf('stop_cue_requested');
  void playCue([
    { frequency: 698.46, durationMs: 60, gain: 0.026 },
    { frequency: 523.25, durationMs: 90, gain: 0.024 },
  ]).then(() => {
    reportPerf('stop_cue_completed');
  });
}

function updateCaptureReady(ready: boolean): void {
  if (currentCaptureReady === ready) {
    return;
  }

  const previousReady = currentCaptureReady;
  currentCaptureReady = ready;
  window.api.asr.sendCaptureReady(ready);
  reportPerf('renderer_capture_ready_state_changed', { ready });

  if (!previousReady && ready && currentAsrStatus === 'listening') {
    playReadyCue();
  }
}

/**
 * Initialize audio recorder with callback to send chunks to main process.
 */
function initRecorder(): AudioRecorder {
  return new AudioRecorder(
    (chunk) => {
      // Send audio chunk to main process via IPC
      window.api.asr.sendAudio(chunk);
    },
    (state) => {
      console.log('[Renderer] AudioRecorder state:', state);
    },
    (spectrum) => {
      window.api.asr.sendSpectrum(spectrum);
    },
    (stage, details, durationMs) => {
      reportPerf(stage, details, durationMs);
    },
    () => {
      updateCaptureReady(true);
      reportPerf('renderer_capture_ready');
    }
  );
}

function getRecorder(): AudioRecorder {
  if (!recorder) {
    recorder = initRecorder();
  }

  return recorder;
}

function applyRecorderSettings(settings: AppSettings): void {
  const activeRecorder = getRecorder();
  activeRecorder.configureWarmup(getWarmupConfig(settings.audioWarmupMode));
  reportPerf('renderer_warmup_mode_applied', {
    mode: settings.audioWarmupMode,
  });
}

/**
 * Start recording audio.
 */
async function startRecording(): Promise<void> {
  const activeRecorder = getRecorder();

  const generation = ++startGeneration;

  try {
    console.log('[Renderer] Starting audio recording...');
    updateCaptureReady(false);
    reportPerf('renderer_start_recording_called', { generation });
    await activeRecorder.start();

    if (generation !== startGeneration || !desiredRecording) {
      console.log('[Renderer] Discarding stale audio start');
      reportPerf('renderer_stale_start_discarded', { generation });
      activeRecorder.stop();
      return;
    }

    console.log('[Renderer] Audio recording started');
    reportPerf('renderer_start_recording_completed', { generation });
  } catch (error) {
    console.error('[Renderer] Failed to start recording:', error);
    reportPerf('renderer_start_recording_failed', {
      generation,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Stop recording audio.
 */
function stopRecording(): void {
  desiredRecording = false;
  startGeneration += 1;
  updateCaptureReady(false);

  if (recorder) {
    console.log('[Renderer] Stopping audio recording...');
    reportPerf('renderer_stop_recording_called');
    recorder.stop();
    console.log('[Renderer] Audio recording stopped');
    reportPerf('renderer_stop_recording_completed');
  }
}

// Track current status to avoid duplicate operations
let currentStatus = 'idle';

// Listen for ASR status changes from main process
window.api.asr.onStatus((status) => {
  console.log('[Renderer] ASR status changed:', status);
  currentAsrStatus = status;
  reportPerf('renderer_status_received', { status });

  // Avoid duplicate handling
  if (status === currentStatus) return;
  currentStatus = status;

  if (status === 'listening') {
    desiredRecording = true;
    updateCaptureReady(false);
    // Start recording when ASR is listening
    startRecording();
  } else {
    if (status === 'processing') {
      playStopCue();
    }
    // Stop recording for any other status
    stopRecording();
  }
});

window.api.asr.onPerfContext((context) => {
  currentPerfContext = context;
  reportPerf('renderer_perf_context_received');
});

void window.api.settings.get().then((settings) => {
  applyRecorderSettings(settings);
  if (settings.audioWarmupMode !== 'off') {
    void getRecorder().prepare();
  }
});

window.api.settings.onChanged((settings) => {
  applyRecorderSettings(settings);
  if (settings.audioWarmupMode !== 'off') {
    void getRecorder().prepare();
  }
});

// Cleanup on window unload
window.addEventListener('beforeunload', () => {
  if (recorder) {
    recorder.destroy();
    recorder = null;
  }
});

console.log('[Renderer] Auto-recording initialized, waiting for ASR status...');
