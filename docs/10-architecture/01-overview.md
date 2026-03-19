# System Architecture

Telesense is a minimalist 1:1 video calling application built on Cloudflare's Realtime (Calls) API.

## Design Principles

1. **Protocol First**: Verify payloads before implementation
2. **Single File**: Keep all worker logic in one file during discovery
3. **No Abstractions**: Use raw RTCPeerConnection, no SDKs
4. **Verification**: Capture Echo Demo traffic as source of truth

## System Components

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Browser (Tab A)         Browser (Tab B)            │   │
│  │  ┌──────────────┐        ┌──────────────┐          │   │
│  │  │ getUserMedia │        │ getUserMedia │          │   │
│  │  │ (camera/mic) │        │ (camera/mic) │          │   │
│  │  └──────┬───────┘        └──────┬───────┘          │   │
│  │         │                       │                  │   │
│  │  ┌──────▼───────┐        ┌──────▼───────┐          │   │
│  │  │   Encoder    │        │   Decoder    │          │   │
│  │  │  (VP8/H264)  │        │  (VP8/H264)  │          │   │
│  │  └──────┬───────┘        └──────┬───────┘          │   │
│  │         │                       │                  │   │
│  │  ┌──────▼───────┐        ┌──────▼───────┐          │   │
│  │  │   WebRTC     │◄──────►│   WebRTC     │          │   │
│  │  │  PeerConnection      │  PeerConnection      │   │   │
│  │  │  (sendonly)  │        │  (recvonly)  │          │   │
│  │  └──────┬───────┘        └──────┬───────┘          │   │
│  │         │                       │                  │   │
│  └─────────┼───────────────────────┼──────────────────┘   │
│            │                       │                       │
│            │    HTTPS Signaling    │                       │
│            │    (JSON payloads)    │                       │
│            │                       │                       │
└────────────┼───────────────────────┼───────────────────────┘
             │                       │
             ▼                       ▼
┌─────────────────────────────────────────────────────────────┐
│                      WORKER LAYER (Hono)                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Routes:                                            │   │
│  │  POST   /api/calls/:callId/session                  │   │
│  │  POST   /api/calls/:callId/publish-offer           │   │
│  │  POST   /api/calls/:callId/subscribe-offer         │   │
│  │  POST   /api/calls/:callId/complete-subscribe      │   │
│  │  GET    /api/calls/:callId/discover-remote-tracks  │   │
│  │  POST   /api/calls/:callId/leave                   │   │
│  │                                                     │   │
│  │  State: Map<callId, Map<sessionId, Session>>      │   │
│  │  (in-memory, dev-only)                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                │
└────────────────────────────┼────────────────────────────────┘
                             │
                             │ Cloudflare API
                             │ (HTTPS + Authorization: Bearer)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                  CLOUDFLARE REALTIME SFU                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Endpoints:                                         │   │
│  │  POST /v1/apps/{appId}/sessions/new                │   │
│  │  POST /v1/apps/{appId}/sessions/{id}/tracks/new    │   │
│  │  PUT  /v1/apps/{appId}/sessions/{id}/renegotiate   │   │
│  │                                                     │   │
│  │  Function: Selective Forwarding Unit (SFU)         │   │
│  │  - Receives RTP packets                             │   │
│  │  - Routes to subscribers                            │   │
│  │  - NO transcoding                                   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### Client (Browser)

- Media capture (`getUserMedia`)
- Video encoding/decoding (WebRTC)
- ICE connectivity establishment
- Rendering (`<video>` elements)

### Worker (Hono)

- Session management
- Signaling coordination
- Track discovery
- Cloudflare API proxy

### Cloudflare SFU

- RTP packet routing
- ICE/STUN/TURN handling
- Session state
- Subscription management

## Data Flow

### 1. Session Creation

```
Browser → Worker → Cloudflare
   POST /session → POST /sessions/new
   ← {sessionId} ← {sessionId}
```

### 2. Track Publishing

```
Browser → Worker → Cloudflare
   POST /publish-offer → POST /tracks/new (location: "local")
   Offer SDP              ← Answer SDP
   ← Answer SDP
```

### 3. Track Subscription (Q8)

```
Browser → Worker → Cloudflare
   POST /subscribe-offer → POST /tracks/new (location: "remote")
                         ← Offer SDP (Cloudflare generates!)
   ← Offer SDP

   POST /complete-subscribe → PUT /renegotiate
   Answer SDP
```

### 4. Media Flow

```
Browser A → UDP/SRTP → Cloudflare → UDP/SRTP → Browser B
Encoder                                 Decoder
(sendonly)                              (recvonly)
```

## Design Decisions

### Why Single-File Worker?

**Phase 1 (Discovery)**: Keep everything in `index.ts`

- Easier to see patterns
- Faster iteration
- No premature abstraction

**Phase 2 (Production)**: Split into:

- `realtime-api.ts` - Cloudflare API client
- `call-state.ts` - Session management
- `routes.ts` - HTTP handlers
- `types.ts` - Shared interfaces

### Why In-Memory State?

For protocol discovery:

- ✅ Simple
- ✅ Fast
- ✅ No external dependencies

For production:

- ❌ Lost on worker restart
- ❌ Not shared across instances
- ❌ No persistence

**Migration path**: Replace `Map` with Durable Objects or Redis.

### Why Poll Instead of WebSocket?

- ✅ Simpler failure modes
- ✅ Easier to debug (HTTP in DevTools)
- ✅ Works through corporate proxies

Trade-off: 2-second latency for discovery.

## Security Model

| Layer           | Protection                                |
| --------------- | ----------------------------------------- |
| **App Secret**  | Server-only (wrangler secret / .dev.vars) |
| **Session IDs** | Random UUIDs, not guessable               |
| **Media**       | DTLS + SRTP (always encrypted)            |
| **Signaling**   | HTTPS + CORS                              |

## Scalability Limits

Current (in-memory):

- ~1000 concurrent calls (memory limit)
- Single region (worker runs in one DC)

With Durable Objects:

- 10,000+ concurrent calls
- Global distribution

## Related Documentation

- [Media Flow](./02-media-flow.md) - Packet-level details
- [Protocol Reference](../20-protocol/01-api-reference.md) - API docs
- [Wire Contract](../90-references/wire-format.md) - Payload details
