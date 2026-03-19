# Media Flow (Physical)

The journey of a video frame from camera to screen.

## Overview

```
Camera → Encoder → RTP → SRTP → UDP → Cloudflare → UDP → SRTP → RTP → Decoder → Screen
     (Browser A)                    (Internet)              (Browser B)
```

## Step-by-Step

### 1. Capture (Browser A)

```javascript
// Raw video from webcam
const stream = await navigator.mediaDevices.getUserMedia({ video: true })
const track = stream.getVideoTracks()[0]
```

**Format**: Raw YUV 4:2:0  
**Size**: 1280×720 @ 30fps = ~265 Mbps uncompressed  
**Too big to send!**

### 2. Encode (Browser A)

```
Raw YUV → VP8 Encoder → Compressed bitstream
265 Mbps → ~1-2 Mbps (100:1 compression!)
```

**Codec options**:

- VP8 (baseline, always supported)
- VP9 (better compression, more CPU)
- H264 (hardware accelerated)
- AV1 (best compression, high CPU)

**Frame types**:

- **I-frame** (Intra): Full image, ~1 per second
- **P-frame** (Predicted): Differences only, much smaller

### 3. RTP Packetization (Browser A)

```
┌─────────────────────────────────────────┐
│  RTP Header (12 bytes)                  │
├─────────────────────────────────────────┤
│  Version: 2          (2 bits)           │
│  Padding: 0          (1 bit)            │
│  Extension: 0        (1 bit)            │
│  CSRC count: 0       (4 bits)           │
│  Marker: 1           (1 bit)            │  ← End of frame
│  Payload type: 96    (7 bits)           │  ← VP8
│  Sequence number: 12345 (16 bits)       │  ← For ordering
│  Timestamp: 90000    (32 bits)          │  ← 90kHz clock
│  SSRC: 0x12345678    (32 bits)          │  ← Sync source ID
├─────────────────────────────────────────┤
│  VP8 Payload (variable)                 │
│  - Payload descriptor (1-3 bytes)       │
│  - VP8 compressed data                  │
└─────────────────────────────────────────┘
        ↓
   UDP datagram (~1200 bytes)
```

**MTU consideration**: Keep under 1500 bytes to avoid IP fragmentation.

### 4. Encryption (Browser A)

```
RTP Packet
    ↓
DTLS Handshake (WebRTC does this automatically)
    ↓
SRTP Encrypt
    ↓
Encrypted RTP (same size, scrambled)
```

**Keys**: Derived from DTLS handshake, rotated periodically.

### 5. UDP Transmission (Browser A)

```
Source: 192.168.1.5:54321 (local, behind NAT)
Dest:   141.101.90.0:1473 (Cloudflare)
Protocol: UDP

ICE candidate: srflx (server reflexive)
STUN server helped find public IP
```

**Characteristics**:

- No guarantee of delivery
- No ordering guarantee
- Fast (no retransmission delay)

### 6. Cloudflare Reception

```
1. UDP arrives at port 1473
2. DTLS decrypt → SRTP decrypt → RTP packet
3. Parse RTP header
   - Look up SSRC → session → track
4. Find subscribers for this track
5. Clone packet for each subscriber
```

**SFU Logic**:

```python
# Simplified
subscribers = get_subscribers(track_id)
for subscriber in subscribers:
    packet_copy = clone(packet)
    packet_copy.ssrc = subscriber.local_ssrc  # Rewrite SSRC
    send_to(subscriber.address, packet_copy)
```

### 7. Cloudflare Forwarding

**Selective Forwarding**:

- Doesn't decode video
- Doesn't mix audio
- Just routes packets

**Bandwidth adaptation**:

- If subscriber has low bandwidth: drop some packets
- If packet loss detected: request retransmission (NACK)

### 8. UDP Reception (Browser B)

```
UDP arrives at port 3478
↓
DTLS decrypt → SRTP decrypt → RTP packet
↓
Jitter Buffer (50-200ms delay)
↓
Reorder packets by sequence number
↓
Decode
```

**Jitter Buffer**:

```
Packets arrive: [1, 3, 2, 5, 4, 6]
Buffer waits:   [1, _, 3, _, 5, _]
After 100ms:    [1, 2, 3, 4, 5, 6] → Send to decoder
```

### 9. Decode (Browser B)

```
RTP payload → VP8 Decoder → Raw YUV frame
1-2 Mbps   →   265 Mbps    → Canvas/WebGL
```

**Latency budget**:

- Encode: 5-20ms
- Network: 20-100ms
- Decode: 5-10ms
- **Total one-way: 30-130ms**

### 10. Render (Browser B)

```javascript
// Video element shows decoded frames
<video id="remote" autoplay playsinline />
```

**Pipeline**:

```
YUV frame → Texture upload → GPU compositing → Screen
```

## Protocol Stack

| Layer          | Protocol      | Purpose              |
| -------------- | ------------- | -------------------- |
| 7 Application  | WebRTC API    | JavaScript interface |
| 6 Presentation | RTP           | Media packetization  |
| 5 Session      | SRTP          | Encryption           |
| 4 Transport    | DTLS          | Key exchange         |
| 3 Network      | UDP           | Fast delivery        |
| 2 Link         | ICE/STUN/TURN | NAT traversal        |

## Why UDP?

```
TCP Approach:
"Packet 1 sent... waiting for ACK..."
"ACK received, sending packet 2..."
→ Reliable but SLOW (retransmission delay)

UDP Approach:
"Packet 1 sent, packet 2 sent, packet 3 sent..."
→ Fast but lossy (video can glitch)
```

WebRTC uses UDP because:

1. Real-time needs speed over reliability
2. Video codecs can handle some packet loss
3. Forward error correction (FEC) recovers some loss
4. Retransmission (NACK) for critical packets only

## Bandwidth Estimation

**VP8 @ 1280×720 @ 30fps**:

- Average: 1.5 Mbps
- Peak (I-frame): 3 Mbps
- Minimum: 0.5 Mbps (low motion)

**For 1:1 call**:

- Up: 1.5 Mbps (your video)
- Down: 1.5 Mbps (their video)
- Total: 3 Mbps symmetric

## Tools for Debugging

### Browser DevTools

```javascript
// Check connection stats
const pc = /* your RTCPeerConnection */
const stats = await pc.getStats()
stats.forEach(stat => {
  if (stat.type === 'inbound-rtp') {
    console.log('Packets received:', stat.packetsReceived)
    console.log('Bytes received:', stat.bytesReceived)
    console.log('Jitter:', stat.jitter)
  }
})
```

### Network Inspection

```bash
# Capture RTP packets (requires sudo)
tshark -i any -f "udp portrange 10000-20000" -w capture.pcap
```

### WebRTC Internals

```
chrome://webrtc-internals/  (Chrome)
about:webrtc                (Firefox)
```

Shows:

- ICE candidates
- Connection state
- Bandwidth estimates
- Frame statistics

## Related

- [System Architecture](./01-overview.md) - High-level design
- [Protocol Reference](../20-protocol/01-api-reference.md) - API details
- [Troubleshooting](../00-getting-started/03-troubleshooting.md) - Debug issues
