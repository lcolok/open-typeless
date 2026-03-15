# Network Audio Device Discovery & Pairing

> Auto-discovery, pairing, and connection management for LicheeRV Nano WiFi microphones.

---

## Problem

The current implementation uses a hardcoded UDP port (18816) and requires manual IP configuration on the board (`/boot/mic-target-ip`). This is unsuitable for end users:

- Users cannot SSH into the board to configure IP addresses
- DHCP may reassign IPs after router restarts
- No pairing mechanism — any device on the LAN could send audio
- No connection status feedback — user doesn't know if the board is online
- Multiple boards on the same network would conflict on the fixed port

---

## Architecture

### Three layers

```
┌─ Layer 1: Discovery (mDNS/Bonjour) ──────────────────────────┐
│                                                                │
│  Board: Avahi broadcasts  _typeless-mic._udp  port=18816      │
│  Mac:   bonjour-service discovers boards on LAN                │
│                                                                │
├─ Layer 2: Pairing Handshake ──────────────────────────────────┤
│                                                                │
│  First use:                                                    │
│    1. Mac shows "New device found: LicheeRV-xxxx" in menu     │
│    2. User clicks to confirm pairing                           │
│    3. Mac sends UDP pairing packet (Mac IP + random token)     │
│    4. Board starts streaming with token in header              │
│    5. Both sides persist token for auto-reconnect              │
│                                                                │
├─ Layer 3: Connection Status ──────────────────────────────────┤
│                                                                │
│  Menu bar shows real-time status:                              │
│    LicheeRV Nano (connected ✓)                                │
│    LicheeRV Nano (offline)                                     │
│                                                                │
│  Based on UDP packet heartbeat (isReceiving, 3s timeout)       │
└────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: mDNS Auto-Discovery

### Board side (Avahi)

The board advertises itself on the local network using Avahi (Linux mDNS implementation). This runs automatically on boot.

**Service file** `/etc/avahi/services/typeless-mic.service`:

```xml
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name>LicheeRV-${SERIAL}</name>
  <service>
    <type>_typeless-mic._udp</type>
    <port>18816</port>
    <txt-record>format=s16le</txt-record>
    <txt-record>rate=48000</txt-record>
    <txt-record>channels=1</txt-record>
    <txt-record>version=1</txt-record>
  </service>
</service-group>
```

`${SERIAL}` is derived from the board's MAC address or CPU serial for uniqueness.

**Dependencies**: Avahi daemon must be present on the board image. If not available, can use `avahi-publish` from the init script:

```bash
avahi-publish-service "LicheeRV-$(cat /sys/class/net/wlan0/address | tr -d ':')" \
  _typeless-mic._udp 18816 \
  "format=s16le" "rate=48000" "channels=1" "version=1" &
```

### Mac side (bonjour-service)

The Electron main process uses the `bonjour-service` npm package (pure JS, no native modules) to discover boards:

```typescript
import Bonjour from 'bonjour-service';

const bonjour = new Bonjour();
const browser = bonjour.find({ type: 'typeless-mic', protocol: 'udp' });

browser.on('up', (service) => {
  // service.name = "LicheeRV-xxxx"
  // service.addresses = ["192.168.1.167"]
  // service.port = 18816
  // service.txt = { format: "s16le", rate: "48000", ... }
  console.log('Board discovered:', service.name, service.addresses);
});

browser.on('down', (service) => {
  console.log('Board went offline:', service.name);
});
```

**Key advantage**: Zero configuration. The Mac app finds the board automatically as long as both are on the same WiFi network. Works across IP changes, router restarts, etc.

---

## Layer 2: Pairing Handshake

### Why pairing is needed

Without pairing, any device broadcasting `_typeless-mic._udp` would automatically send audio to the Mac. In shared environments (office, cafe), this is a security concern.

### Protocol

```
Mac                                    Board
 │                                       │
 │  1. Discover via mDNS                 │
 │<──────── _typeless-mic._udp ──────────│
 │                                       │
 │  2. User clicks "Pair" in menu        │
 │                                       │
 │  3. Send pairing request (UDP)        │
 │────────── PAIR_REQ ──────────────────>│
 │  { mac_ip, port, token }              │
 │                                       │
 │  4. Board stores token, starts stream │
 │<──────── PAIR_ACK ───────────────────│
 │  { board_id, token }                  │
 │                                       │
 │  5. Audio stream with token header    │
 │<──────── [token][pcm_data] ──────────│
 │                                       │
```

### Pairing packet format

```
PAIR_REQ (Mac → Board):
  Bytes 0-3:   Magic "OTPR" (Open Typeless Pair Request)
  Bytes 4-5:   Version (uint16 BE)
  Bytes 6-7:   Port for audio (uint16 BE)
  Bytes 8-23:  Token (16 bytes random)

PAIR_ACK (Board → Mac):
  Bytes 0-3:   Magic "OTPA" (Open Typeless Pair Ack)
  Bytes 4-19:  Token echo (confirms pairing)
  Bytes 20-27: Board ID (8 bytes from MAC address)
```

### Token persistence

- **Mac side**: Stored in `settings.json` as `pairedDevices: [{ boardId, token, name }]`
- **Board side**: Stored in `/boot/mic-pair-token`

On subsequent boots, if the board has a stored token, it includes it in audio packets. The Mac validates the token before accepting audio data.

### Control channel

A separate UDP port (18817) is used for control messages (pairing, status queries, configuration). Audio stays on 18816.

---

## Layer 3: Connection Status

### Heartbeat detection

Already implemented via `NetworkAudioSourceService.isReceiving` — checks if a UDP packet arrived within the last 3 seconds.

### Menu bar integration

The device list in the menu bar shows real-time status:

```
音频输入 →
  ✓ 自动选择
  ──────────
  🟢 LicheeRV Nano (已连接)     ← receiving audio packets
  ⚪ LicheeRV Nano (离线)        ← no packets for 3s
  ──────────
  MacBook Pro麦克风
  USB audio CODEC
  AirPods Pro
```

### Discovered but unpaired devices

New boards that haven't been paired show as:

```
  🔵 LicheeRV-a1b2c3 (新设备，点击配对)
```

---

## End User Experience

### First-time setup

1. User plugs in the LicheeRV Nano board (USB-C power)
2. Board connects to WiFi via captive portal (WiFi Portal, already implemented by hardware team)
3. User opens Open Typeless on Mac
4. Menu bar shows: "LicheeRV-xxxx (new device, click to pair)"
5. User clicks → paired → audio streaming begins
6. Done. No terminal, no SSH, no IP addresses.

### Daily use

1. Board powers on → auto-connects to WiFi → auto-broadcasts mDNS → auto-starts streaming
2. Mac app discovers board → validates token → accepts audio
3. User presses hotkey → voice input works

### Hardware delivery

The board is shipped pre-flashed with:
- `mic-streamer` (Go binary) — audio capture + UDP streaming
- Avahi service file — mDNS advertisement
- WiFi Portal — captive portal for WiFi setup
- All configured to start on boot via init scripts

No per-user customization needed at manufacturing time.

---

## Implementation Plan

| Layer | Complexity | Effort | Dependencies |
|-------|-----------|--------|--------------|
| mDNS discovery | Low | 1-2 days | `bonjour-service` npm + Avahi on board |
| Pairing handshake | Medium | 2-3 days | UDP control channel protocol |
| Connection status UI | Low | 1 day | Menu bar updates + heartbeat |
| **Total** | | **4-6 days** | |

### Recommended order

1. **mDNS discovery** — eliminates manual IP configuration, biggest user pain point
2. **Connection status UI** — feedback that the board is working
3. **Pairing** — can defer until multi-user/security is needed

---

## Security Considerations

- **Token-based auth**: Prevents unauthorized audio injection on shared networks
- **No encryption**: Audio is transmitted as plaintext PCM over UDP on the local network. Acceptable for home/office use. For sensitive environments, could add lightweight encryption (ChaCha20) but this adds latency and complexity.
- **LAN only**: mDNS discovery is link-local, does not cross routers. The board is not accessible from the internet.

---

## Files (planned)

| File | Description |
|------|-------------|
| `src/main/services/network-audio-source/discovery.ts` | mDNS browser + discovered device management |
| `src/main/services/network-audio-source/pairing.ts` | Pairing handshake protocol |
| `src/main/services/network-audio-source/network-audio-source.service.ts` | Extended with discovery + pairing integration |
