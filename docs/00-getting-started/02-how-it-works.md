# How telesence Works

A high-level guide to understanding the 1:1 video call architecture.

## The 30-Second Version

1. **Browser A** creates a session with Cloudflare
2. **Browser A** sends its camera/mic data to Cloudflare SFU
3. **Browser B** joins the same "call" (via `callId`)
4. **Browser B** asks Cloudflare: "give me an Offer to receive A's tracks"
5. **Cloudflare** sends an Offer SDP to B
6. **Browser B** answers, and **media flows** between A and B via Cloudflare

## Key Concepts

### The "Call" is Just a Name

```
callId: "my-meeting-123"
```

- Cloudflare has no concept of "rooms" or "calls"
- We use `callId` as an app-level tag to group sessions
- All browsers with the same `callId` can discover each other

### Sessions vs Tracks

| Concept        | What                       | Example                            |
| -------------- | -------------------------- | ---------------------------------- |
| **Session**    | A connection to Cloudflare | Each browser has one               |
| **Track**      | A media stream             | Camera = 1 track, Mic = 1 track    |
| **Track Name** | Browser's track ID         | `"a1b2c3d4-e5f6..."` (random UUID) |

### How Remote Subscription Works

The hardest part of Cloudflare Realtime: **How do you subscribe to someone else's tracks?**

**Answer: Same endpoint, different `location`**

```http
# Publishing (sending YOUR camera)
POST /tracks/new
{
  "location": "local",     // ← "I have media to send"
  "sessionDescription": { "type": "offer", "sdp": "..." }
}
# Response: Answer SDP

# Subscribing (receiving THEIR camera)
POST /tracks/new
{
  "location": "remote",    // ← "I want to receive"
  "sessionId": "their-session-id",
  "trackName": "their-track-id"
}
# Response: Offer SDP ← This was the breakthrough!
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      BROWSER A (Caller)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  getUserMedia│──►│   Encoder   │──►│  WebRTC API │         │
│  │  (camera)   │  │ (VP8/H264)  │  │  (sendonly) │         │
│  └─────────────┘  └─────────────┘  └──────┬──────┘         │
│                                           │                 │
└───────────────────────────────────────────┼─────────────────┘
                                            │ SRTP/UDP
                                            ▼
┌─────────────────────────────────────────────────────────────┐
│              CLOUDFLARE SFU (Selective Forwarding)           │
│                                                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  Receives RTP packets from A                        │   │
│   │  Decrypts → Identifies track → Looks up subscribers │   │
│   │  Clones packets → Sends to B (and others)           │   │
│   │                                                     │   │
│   │  NO transcoding  (CPU intensive)                    │   │
│   │  NO mixing       (that's MCU)                       │   │
│   │  JUST routing    (selective forwarding)             │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                                            │ SRTP/UDP
                                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     BROWSER B (Callee)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  WebRTC API │──►│   Decoder   │──►│  <video>    │         │
│  │  (recvonly) │  │ (VP8/H264)  │  │  (render)   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## The Signaling Dance

Before media flows, we need to exchange SDP (Session Description Protocol):

### Step 1: Browser A Creates Session

```http
POST /sessions/new
Response: { "sessionId": "abc123..." }
```

### Step 2: Browser A Publishes (Sends Offer)

```http
POST /tracks/new (with location: "local")
Request: { "sessionDescription": { "type": "offer", "sdp": "..." } }
Response: { "sessionDescription": { "type": "answer", "sdp": "..." } }
```

Now A is sending to Cloudflare.

### Step 3: Browser B Joins

Same as A - creates session, publishes its own tracks.

### Step 4: Discovery (App-Level)

```http
GET /discover-remote-tracks?sessionId=...
Response: [
  { "trackName": "...", "sessionId": "A's-session" }
]
```

### Step 5: Browser B Subscribes (The Magic)

```http
POST /tracks/new (with location: "remote")
Request: { "tracks": [{ "location": "remote", "sessionId": "A's-session", "trackName": "..." }] }
Response: { "sessionDescription": { "type": "offer", "sdp": "..." } }
```

**This is the key insight:** Cloudflare generates an Offer for the subscription.

### Step 6: Complete Subscription

```http
PUT /renegotiate
Request: { "sessionDescription": { "type": "answer", "sdp": "..." } }
```

Now B receives from Cloudflare.

## Data Flow (Physical)

See [Media Flow Documentation](../10-architecture/02-media-flow.md) for packet-level details.

Quick summary:

```
Raw Video (YUV)
    → Encoder (VP8)
    → RTP Packets
    → SRTP Encryption
    → UDP/DTLS
    → Cloudflare
    → UDP/DTLS
    → SRTP Decrypt
    → RTP
    → Decoder
    → YUV
    → Screen
```

## Why This Architecture?

| Decision            | Why                                         |
| ------------------- | ------------------------------------------- |
| **Cloudflare SFU**  | No server-side encoding, just routing       |
| **Pull model**      | Browser asks for Offer, not pushed          |
| **HTTPS signaling** | Simple, debuggable, no WebSocket complexity |
| **In-memory state** | Protocol discovery first, durability later  |

## Limitations

- **No recording** (Cloudflare doesn't store)
- **No chat** (would need separate data channel)
- **No screen share** (would need additional track handling)
- **In-memory only** (sessions lost on worker restart)

## Next Steps

- [Quick Start Guide](./01-quickstart.md) - Try it yourself
- [Architecture Deep Dive](../10-architecture/01-overview.md) - System design
- [Media Flow](../10-architecture/02-media-flow.md) - Packet-level details
