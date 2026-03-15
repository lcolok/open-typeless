# Network Audio Source (LicheeRV Nano WiFi Microphone)

> Direct UDP audio injection into ASR service, bypassing browser audio stack.

---

## Overview

The `NetworkAudioSourceService` receives raw PCM audio from a LicheeRV Nano board via WiFi UDP and feeds it directly to the ASR service in the main process. This eliminates the browser audio stack (getUserMedia → AudioContext → ScriptProcessor → IPC) and its ~500ms buffering overhead.

**Latency**: ~15ms end-to-end (board mic → WiFi → ASR).

---

## Architecture

```
LicheeRV Nano                    Electron Main Process
┌─────────────┐   UDP 18816     ┌──────────────────────────────┐
│ MEMS mic    │   960B/pkt      │ NetworkAudioSourceService    │
│ → arecord   │ ──────────────→ │   dgram recv                 │
│ → Go stream │  48kHz s16le    │   → ring buffer (spectrum)   │
└─────────────┘                 │   → downsample 48→16kHz      │
                                │   → asrService.sendAudio()   │
                                │                              │
                                │ Goertzel spectrum → 60fps    │
                                │   → floating window          │
                                └──────────────────────────────┘
```

### Audio flow when network source is active

1. `PushToTalkService` detects board is streaming (`isReceiving`)
2. Calls `networkAudioSource.activate()` instead of `notifyRendererStartRecording()`
3. Immediately sends `CAPTURE_READY` to floating window
4. Immediately sends `notifyRendererStopRecording()` to prevent renderer's AudioRecorder from starting (ASR status broadcast triggers it)
5. Audio flows: UDP → downsample → `asrService.processAudioChunk()`
6. On stop: `networkAudioSource.deactivate()`, ASR finishes normally

### Fallback to local microphone

When `networkAudioSource.isReceiving === false` (board offline / no UDP data for 3s), `PushToTalkService` falls back to the original renderer-based AudioRecorder path automatically.

---

## Protocol

| Parameter | Value |
|-----------|-------|
| Transport | UDP unicast |
| Port | 18816 |
| Format | raw PCM, signed 16-bit little-endian |
| Sample rate | 48000 Hz (board native) |
| Channels | 1 (mono) |
| Packet size | 960 bytes (10ms) |
| Sender | Go `mic-streamer` on LicheeRV Nano |

---

## Key Implementation Details

### Buffer safety

Node.js `Buffer.alloc()` uses a shared 8KB memory pool. Multiple small Buffers share the same underlying `ArrayBuffer`. When passing audio data to the ASR client:

```typescript
// WRONG — returns the entire pool, not just our 320 bytes
const bad = new Uint8Array(pcm16k).buffer;

// CORRECT — slice creates an independent copy
const good = pcm16k.buffer.slice(
  pcm16k.byteOffset,
  pcm16k.byteOffset + pcm16k.byteLength,
);
```

### Downsampling

48kHz → 16kHz using 3-sample averaging (anti-aliasing low-pass filter):

```typescript
for (let i = 0; i < dstSamples; i++) {
  const j = i * 6;
  const s0 = buf.readInt16LE(j);
  const s1 = buf.readInt16LE(j + 2);
  const s2 = buf.readInt16LE(j + 4);
  result.writeInt16LE(((s0 + s1 + s2) / 3) | 0, i * 2);
}
```

### Spectrum visualization

Uses Goertzel algorithm (11 frequency bins, log-spaced 85Hz–8kHz) on a 512-sample ring buffer, updated at 60fps via `setInterval(16)`. Matches the AnalyserNode behavior used by the renderer's AudioRecorder.

### Dual audio source conflict

ASR status `listening` is broadcast to all windows, which triggers the renderer's AudioRecorder. When using network audio, `notifyRendererStopRecording()` is called immediately after `activate()` to prevent two audio sources feeding ASR simultaneously.

---

## Files

| File | Description |
|------|-------------|
| `src/main/services/network-audio-source/network-audio-source.service.ts` | Core service |
| `src/main/services/network-audio-source/index.ts` | Exports |

---

## Future: Streaming Sentence-by-Sentence Transcription

### Concept

Instead of waiting for the entire recording to finish, detect sentence boundaries by silence gaps and transcribe each sentence immediately while continuing to record.

```
Speaking...  |  Silence 500ms  |  Speaking...  |  Silence 500ms  |  Speaking...
             ↓                                ↓
        Send segment 1 to ASR            Send segment 2 to ASR
        ↓                                ↓
   Result appears immediately       Result appears immediately
```

### Implementation approach

**Option A: VAD + segmented batch upload (SiliconFlow)**

1. **VAD**: Track consecutive low-RMS packets. After 50 packets (~500ms) below threshold → sentence boundary.
2. **Segment buffer**: Accumulate chunks per sentence. On boundary, send current segment to SiliconFlow HTTP API.
3. **Concurrent uploads**: Multiple segments in-flight, results ordered by sequence number.
4. **Complexity**: Medium. ~100 lines for VAD + segment management.

**Option B: Volcengine streaming WebSocket (simpler)**

Volcengine client already supports real-time streaming ASR. Just connect the network audio source to the Volcengine client instead of SiliconFlow. Results stream back as the user speaks — no VAD needed on our side.

**Complexity**: Low. The Volcengine client and network audio source both already exist; just wire them together.

### Recommendation

Option B (Volcengine streaming) for simplicity. Option A (VAD + segmented) as fallback if Volcengine is unavailable.
