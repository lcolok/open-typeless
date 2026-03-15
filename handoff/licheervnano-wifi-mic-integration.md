# LicheeRV Nano WiFi 麦克风集成方案

> **状态**: 调研完成，待实施
> **日期**: 2026-03-14
> **目标**: 让 LicheeRV Nano 板载 MEMS 麦克风通过 WiFi 持续推流到 macOS，作为 open-typeless 中比蓝牙耳机更高优先级的音频输入设备

---

## 一、背景

open-typeless 是 macOS 语音输入工具，当前音频采集路径：

```
Right Option 按键 → Renderer getUserMedia() → AudioRecorder (16kHz/16bit/mono PCM)
    → IPC → Main Process → ASR Service (火山引擎 WebSocket / SiliconFlow HTTP)
    → 识别结果 → 插入文字
```

音频设备优先级（`audio-recorder.ts:121-131`）：蓝牙耳机 > 系统默认设备。

LicheeRV Nano（$9.9 开发板）自带 MEMS 麦克风和 WiFi 6，可作为独立拾音器。

---

## 二、方案选型过程

### 评估了 6 种通信协议

| 协议 | 端到端延迟 | macOS 原生音频设备 | 改动量 | 结论 |
|------|-----------|-------------------|--------|------|
| USB Audio Gadget (f_uac2) | 15-30ms | 是 | 极小 | 有线最佳方案 |
| **WiFi UDP + BlackHole** | **18-25ms** | **是（虚拟设备）** | **极小** | **无线最佳方案 ✓** |
| WiFi UDP 直注入 Main Process | 12-15ms | 否（需重构） | 大 | 延迟最低但改动大 |
| Roc Toolkit | 20-40ms | 是（roc-vad） | 小 | 工具链不成熟 |
| WiFi TCP/WebSocket | 10-50ms | 否 | 中 | 不如 UDP |
| Bluetooth BLE | 30-100+ms | 否 | 极大 | 硬件未焊接电阻 |

### 选定方案：WiFi 持续推流 + BlackHole

选择理由：
1. open-typeless 几乎零改动 — 只改设备优先级正则
2. 荔枝派侧无状态 — 开机自动推流，无需控制协议
3. 热键逻辑完全不变 — Right Option 触发流程不受影响
4. 延迟 18-25ms，比蓝牙耳机（40-200ms）好一个量级
5. 持续推流消除了麦克风 warmup 冷启动延迟

---

## 三、架构设计

```
┌─ LicheeRV Nano ─────────────────┐
│                                  │
│  /etc/init.d/S98mic-stream:     │
│    amixer 启用板载 MEMS ADC      │
│    ffmpeg -f alsa -i hw:0,0     │
│      -ar 16000 -ac 1 -f s16le  │
│      udp://<mac-ip>:18816       │
│      ?pkt_size=640              │
│                                  │
│  (无按钮、无控制逻辑、无状态)     │
└──────────────────────────────────┘
              │
              │ WiFi UDP 单播
              │ Raw PCM s16le, 16kHz, mono
              │ 640 bytes/packet (20ms)
              │ 50 pkt/s, ~35 KB/s
              │
┌─ macOS (open-typeless) ─────────────────────────────┐
│                                                      │
│  Main Process 新增:                                  │
│    UdpAudioBridgeService                             │
│      dgram UDP :18816 接收                           │
│      → spawn sox 子进程                              │
│      → 写入 BlackHole 2ch CoreAudio 设备             │
│                                                      │
│  Renderer Process (不改):                            │
│    getUserMedia({deviceId: "BlackHole 2ch"})         │
│    → AudioRecorder → IPC → ASR Service              │
│                                                      │
│  触发流程 (不改):                                     │
│    Right Option → PushToTalkService → 正常 ASR 流程   │
└──────────────────────────────────────────────────────┘
```

### 延迟链路分析

| 环节 | 延迟 |
|------|------|
| ALSA capture buffer (板子) | ~5ms |
| ffmpeg 打包 + 重采样 (48→16kHz) | ~2ms |
| WiFi 6 本地网络传输 | 1-3ms |
| Node.js dgram 接收 | <1ms |
| sox stdin → BlackHole CoreAudio | ~5-10ms |
| Electron getUserMedia buffer | ~5ms |
| **总计** | **~18-25ms** |

---

## 四、涉及文件和改动

### 4.1 open-typeless 侧

#### 新增文件

| 文件 | 说明 |
|------|------|
| `src/main/services/udp-audio-bridge/udp-audio-bridge.service.ts` | UDP 接收 + sox 桥接服务 |
| `src/main/services/udp-audio-bridge/index.ts` | 导出 |

#### 修改文件

| 文件 | 改动 |
|------|------|
| `src/renderer/src/modules/asr/lib/audio-recorder.ts` | L121-131: 设备优先级加入 BlackHole 匹配 |
| `src/main/index.ts`（或 app ready 入口） | 启动 `udpAudioBridge.start()` |

### 4.2 LicheeRV Nano 侧

| 文件 | 说明 |
|------|------|
| `/etc/init.d/S98mic-stream` | 开机自启推流脚本 |
| `/boot/mic-target-ip` | Mac IP 配置 |

---

## 五、关键实现细节

### 5.1 UdpAudioBridgeService (Main Process)

```typescript
import { createSocket, Socket } from 'dgram';
import { spawn, ChildProcess } from 'child_process';
import log from 'electron-log';

const logger = log.scope('udp-audio-bridge');
const UDP_PORT = 18816;

export class UdpAudioBridgeService {
  private socket: Socket | null = null;
  private soxProcess: ChildProcess | null = null;
  private isRunning = false;

  start(): void {
    if (this.isRunning) return;

    // sox: stdin raw PCM → BlackHole CoreAudio 设备
    this.soxProcess = spawn('sox', [
      '-t', 'raw', '-r', '16000', '-b', '16', '-c', '1',
      '-e', 'signed-integer', '-L', '-',
      '-t', 'coreaudio', 'BlackHole 2ch',
    ], { stdio: ['pipe', 'ignore', 'pipe'] });

    this.soxProcess.on('error', (err) => {
      logger.error('sox process error', { message: err.message });
    });

    this.soxProcess.on('exit', (code) => {
      logger.warn('sox exited', { code });
      if (this.isRunning) setTimeout(() => this.startSox(), 1000);
    });

    // UDP 监听
    this.socket = createSocket('udp4');
    this.socket.on('message', (msg) => {
      if (this.soxProcess?.stdin?.writable) {
        this.soxProcess.stdin.write(msg);
      }
    });
    this.socket.bind(UDP_PORT);

    this.isRunning = true;
    logger.info('UDP Audio Bridge started', { port: UDP_PORT });
  }

  stop(): void {
    this.isRunning = false;
    this.socket?.close(); this.socket = null;
    this.soxProcess?.stdin?.end();
    this.soxProcess?.kill(); this.soxProcess = null;
  }
}

export const udpAudioBridge = new UdpAudioBridgeService();
```

### 5.2 设备优先级改动 (audio-recorder.ts)

```typescript
// L121-131 改为:
const externalMicPattern = /blackhole/i;
const bluetoothPattern = /airpods|airpods pro|bluetooth|buds|headset|hands-free/i;

const preferredDevice =
  audioInputs.find((device) => externalMicPattern.test(device.label)) ??
  audioInputs.find(
    (device) => device.deviceId === 'default' && bluetoothPattern.test(device.label)
  ) ??
  audioInputs.find((device) => bluetoothPattern.test(device.label)) ??
  audioInputs.find((device) => device.deviceId === 'default');
```

### 5.3 荔枝派开机脚本 (/etc/init.d/S98mic-stream)

```bash
#!/bin/sh
PIDFILE=/var/run/mic-stream.pid
PORT=18816
LOG=/tmp/mic-stream.log

start() {
    [ -f /boot/mic-target-ip ] || { echo "No /boot/mic-target-ip"; return; }
    TARGET_IP=$(cat /boot/mic-target-ip | tr -d '[:space:]')

    # 启用板载 MEMS 麦克风
    amixer -Dhw:0 cset name='ADC Power' on,on >/dev/null 2>&1
    amixer -Dhw:0 cset name='ADC Capture Volume' 24,24 >/dev/null 2>&1

    # 持续推流: ALSA 48kHz → 重采样 16kHz → raw PCM → UDP
    ffmpeg -f alsa -i hw:0,0 -ar 16000 -ac 1 -f s16le \
        "udp://${TARGET_IP}:${PORT}?pkt_size=640" \
        > "$LOG" 2>&1 &
    echo $! > "$PIDFILE"
    echo "mic-stream → $TARGET_IP:$PORT (PID $!)"
}

stop() {
    [ -f "$PIDFILE" ] && kill $(cat "$PIDFILE") 2>/dev/null && rm -f "$PIDFILE"
}

case "$1" in
    start) start ;; stop) stop ;; restart) stop; start ;;
    *) echo "Usage: $0 {start|stop|restart}" ;;
esac
```

---

## 六、Mac 侧前置依赖

```bash
brew install blackhole-2ch sox
```

---

## 七、验证步骤（回家后执行）

### Step 1: Mac 侧验证 BlackHole + sox（~5 分钟）

```bash
# 验证 BlackHole 已安装
sox -t coreaudio -L  # 列表中应有 "BlackHole 2ch"

# 测试 sox → BlackHole 通路
sox -n -t coreaudio "BlackHole 2ch" synth 3 sine 440 &
sox -t coreaudio "BlackHole 2ch" /tmp/bh-test.wav trim 0 2
afplay /tmp/bh-test.wav  # 应听到 440Hz
```

### Step 2: 荔枝派侧验证麦克风 + ffmpeg（~10 分钟）

```bash
ssh root@<licheerv-ip>

# 验证麦克风
amixer -Dhw:0 cset name='ADC Power' on,on
amixer -Dhw:0 cset name='ADC Capture Volume' 24,24
arecord -D hw:0,0 -f S16_LE -r 48000 -c 1 -d 3 -t wav /tmp/mic.wav

# 验证 ffmpeg 能力
ffmpeg -protocols 2>/dev/null | grep udp     # 期望找到 udp
ffmpeg -formats 2>/dev/null | grep s16le     # 期望找到 s16le
```

### Step 3: 端到端推流测试（~10 分钟）

```bash
# Mac 终端 1: 接收 UDP → sox → BlackHole
nc -lu 18816 | sox -t raw -r 16000 -b 16 -c 1 -e signed -L - -t coreaudio "BlackHole 2ch"

# 荔枝派: 推流
ffmpeg -f alsa -i hw:0,0 -ar 16000 -ac 1 -f s16le "udp://<mac-ip>:18816?pkt_size=640"

# Mac 终端 2: 从 BlackHole 录一段验证
sox -t coreaudio "BlackHole 2ch" /tmp/remote-mic.wav trim 0 5
afplay /tmp/remote-mic.wav  # 应听到荔枝派采集的声音
```

### Step 4: open-typeless 集成（~15 分钟）

1. 创建 `src/main/services/udp-audio-bridge/` 目录和文件
2. 修改 `audio-recorder.ts` 设备优先级
3. 修改 app 入口启动 bridge
4. `pnpm start` 启动开发模式
5. 按 Right Option 对着荔枝派说话 → 验证 ASR 正常工作
6. 查看 console 日志确认 `[AudioRecorder] Selected audio input: BlackHole 2ch`

### Step 5: 部署为开机自启

```bash
# 在荔枝派上
echo "<mac-ip>" > /boot/mic-target-ip
# 将 S98mic-stream 脚本部署到 /etc/init.d/ 并 chmod +x
reboot  # 验证重启后自动推流
```

---

## 八、已知风险和降级方案

| 风险 | 检测 | 降级方案 |
|------|------|---------|
| ffmpeg 不支持 UDP output | `ffmpeg -protocols \| grep udp` | 用 `arecord \| busybox nc -u` 替代 |
| ffmpeg 不支持 48→16kHz 重采样 | 直接推流测试 | 推 48kHz 原始采样率，Mac 侧 sox 参数改 `-r 48000` |
| BlackHole 采样率不匹配 | Audio MIDI Setup 查看 | 设置 BlackHole 为 16000Hz 或让 sox 自动转换 |
| sox 不在 Electron PATH | spawn 报错 | 用绝对路径 `/opt/homebrew/bin/sox` |
| 板载 ffmpeg 太精简 | 多项功能缺失 | 交叉编译 mic-streamer.c（见下方备选） |

### 降级方案：自编 mic-streamer (C 语言)

如果板上 ffmpeg 功能不足，交叉编译一个极简的 ALSA→UDP 推流程序：

```bash
riscv64-unknown-linux-musl-gcc -O2 -static -lasound -o mic-streamer mic-streamer.c
scp mic-streamer root@<ip>:/usr/local/bin/
```

核心逻辑：ALSA 采集 16kHz mono → 每 20ms 读 320 帧 → sendto() UDP 640 字节包。

---

## 九、后续优化方向

1. **mDNS 自动发现** — 荔枝派用 avahi-publish 广播，Mac 侧用 bonjour-service 发现，无需手动配置 IP
2. **Opus 压缩** — 256kbps → 24kbps，提升 WiFi 抗干扰能力（需板上编译 libopus）
3. **naudiodon 替代 sox** — 消除 sox 子进程，Node.js 直接写 PortAudio → BlackHole
4. **直注入方案** — 跳过 BlackHole，UDP 音频直接喂给 ASR Service（需架构重构）
5. **物理 PTT 按钮** — 荔枝派 GPIO 按钮事件通过 UDP 控制通道发送到 Mac

---

## 十、硬件参考

| 规格 | 值 |
|------|---|
| 板子 | LicheeRV Nano W (WiFi 版), $9.90 |
| SoC | Sophgo SG2002, RISC-V 64-bit 1GHz |
| 麦克风 | 板载 MEMS 模拟麦克风 (焊死) |
| ADC | SG2002 内置 16-bit codec, ALSA hw:0,0 |
| 采样率 | 板载 ADC 仅支持 48kHz（需重采样到 16kHz） |
| WiFi | 内置 WiFi 6 + BLE 5.4 |
| 功耗 | ~1.2W (含 WiFi) |
| 供电 | USB-C 5V |
| OS | Buildroot Linux 5.10, busybox, ffmpeg 4.4.4, Python 3.11 |
| 关键注意 | ADC 每次重启默认关闭，必须 amixer 启用 |
