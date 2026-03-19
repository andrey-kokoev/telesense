# Realtime Wire Contract (Echo Demo Capture)

**Status: ✅ PARTIALLY VERIFIED — Echo Demo captured 2026-03-18**

## Architecture Consensus (Locked)

These decisions are **frozen** and will not change regardless of payload verification:

| Decision                            | Rationale                                                                             | Codex Review |
| ----------------------------------- | ------------------------------------------------------------------------------------- | ------------ |
| Backend-mediated HTTPS API          | Cloudflare Realtime is low-level SFU; no native rooms                                 | Confirmed    |
| Raw `RTCPeerConnection` (no SDK)    | Alignment with Cloudflare's "no SDK provided at this level"                           | Confirmed    |
| `callId` as app-level rendezvous    | Cloudflare has no native room abstraction                                             | Confirmed    |
| In-memory `Map` state (dev-only)    | Durable Objects deferred to post-verification                                         | Confirmed    |
| Single-file Worker during discovery | Split into `realtime-api.ts` + `call-state.ts` + `routes.ts` only after protocol lock | Confirmed    |
| Poll-first signaling                | WebSocket/SSE deferred until basics work                                              | Confirmed    |

**Last Consensus Update**: 2026-03-18 with Codex review.

---

> ⚠️ **CRITICAL CORRECTION APPLIED 2026-03-18**
>
> Remote subscription uses **orchestration/pull model**, not push.
> Call `tracks/new` with `location: "remote"` to request an Offer from Cloudflare.
> See Section 3 below for verified flow.

---

## Architecture (Verified)

**Pattern**: SFU (Selective Forwarding Unit) with client-side media subscription negotiation

**Participants**:

1. Browser client (RTCPeerConnection)
2. Cloudflare Realtime SFU (remote offer generation, track subscription)
3. Worker relay (session state, SDP delivery)

**Session Lifecycle**:

```
Browser                    Worker                          Realtime SFU
  |                          |                                  |
  +-- POST /session -------->|                                  |
  |                          |-- POST sessions/new --+          |
  |                          |                       v          |
  |                          |<-- {sessionId}        |          |
  |<-- {sessionId} ----------|                       |          |
  |                          |                       <----------+
  |                          |                                  |
  +-- POST /publish-offer -->|                                  |
  |  (local SDP Offer)       |-- POST tracks/new -------+       |
  |  location: "local"       |  (Offer w/ local tracks)|       |
  |                          |                         v       |
  |<-- (Answer, trackIds) ---|<-- (Answer, trackIds) |        |
  |                          |                       <---------+
  |                          |                                  |
  |  [Later: remote peer joins]                                 |
  |                          |                                  |
  +-- GET /discover-remote -->|                                  |
  |<-- [remoteTrackRefs] -----|                                  |
  |                          |                                  |
  +-- POST /subscribe ------>|                                  |
  |                          |-- POST tracks/new -------+       |
  |                          |  location: "remote"     |       |
  |                          |                         v       |
  |<-- (Offer, trackIds) ----|<-- (Offer)             |        |
  |                          |                       <---------+
  |                          |                                  |
  +-- POST /complete-subscribe                                |
  |  (Answer)                |-- PUT /renegotiate -----+       |
  |                          |  (Answer)               |       |
  |                          |                         v       |
  |<-- {ok} -----------------|                       <---------+
```

---

## Verified Endpoints (Echo Demo 2026-03-18)

### 1. POST /v1/apps/{appId}/sessions/new

**Purpose**: Create a new Calls session

**Request**:

```http
POST https://rtc.live.cloudflare.com/v1/apps/8b4b4a5e75f322fe92872b9a1d3747b5/sessions/new
Authorization: Bearer {APP_TOKEN}
Content-Type: application/json

{}  // Empty body - verified
```

**Response** (200 OK):

```json
{
  "sessionId": "c94f2751ff85e3256f3f1747747224dc7a72bc897214f91187596ddcc4709593"
}
```

**Status**: ✅ VERIFIED

- Response path: `sessionId` (not `result.id`)
- Token is sent via `Authorization: Bearer` header (not in body)

---

### 2. POST /v1/apps/{appId}/sessions/{sessionId}/tracks/new (PUSH)

**Purpose**: Publish local tracks to Cloudflare

**Request**:

```http
POST https://rtc.live.cloudflare.com/v1/apps/{appId}/sessions/{localSessionId}/tracks/new
Authorization: Bearer {APP_TOKEN}
Content-Type: application/json

{
  "sessionDescription": {
    "sdp": "v=0\r\no=- 2799342825385766298 2 IN IP4 127.0.0.1\r\n...",
    "type": "offer"
  },
  "tracks": [
    {
      "location": "local",
      "mid": "0",
      "trackName": "a9df124e-5b0b-491c-b144-7856f9d3251c"
    },
    {
      "location": "local",
      "mid": "1",
      "trackName": "c2e9c1aa-5710-45c0-8ed1-7aee8c5b3bd9"
    }
  ]
}
```

**Response** (200 OK):

```json
{
  "requiresImmediateRenegotiation": false,
  "tracks": [
    {
      "mid": "0",
      "trackName": "a9df124e-5b0b-491c-b144-7856f9d3251c"
    },
    {
      "mid": "1",
      "trackName": "c2e9c1aa-5710-45c0-8ed1-7aee8c5b3bd9"
    }
  ],
  "sessionDescription": {
    "sdp": "v=0\r\no=- 337511335713934166 1773865148 IN IP4 0.0.0.0\r\ns=-\r\n...",
    "type": "answer"
  }
}
```

**Status**: ✅ VERIFIED

- Request uses `sessionDescription` wrapper with `sdp` and `type`
- `location: "local"` indicates publishing
- Response includes `sessionDescription.type: "answer"`
- `requiresImmediateRenegotiation: false` for initial publish

---

### 3. POST /v1/apps/{appId}/sessions/{sessionId}/tracks/new (PULL) ⭐ CRITICAL

**Purpose**: Subscribe to remote tracks — generates an **OFFER** from Cloudflare

**This is the answer to Q8: Remote Subscription Initiation**

**Request**:

```http
POST https://rtc.live.cloudflare.com/v1/apps/{appId}/sessions/{remoteSessionId}/tracks/new
Authorization: Bearer {APP_TOKEN}
Content-Type: application/json

{
  "tracks": [
    {
      "location": "remote",
      "trackName": "a9df124e-5b0b-491c-b144-7856f9d3251c",
      "sessionId": "c94f2751ff85e3256f3f1747747224dc7a72bc897214f91187596ddcc4709593"
    },
    {
      "location": "remote",
      "trackName": "c2e9c1aa-5710-45c0-8ed1-7aee8c5b3bd9",
      "sessionId": "c94f2751ff85e3256f3f1747747224dc7a72bc897214f91187596ddcc4709593"
    }
  ]
}
```

**Key fields**:

- `location: "remote"` — Tells Cloudflare we want to SUBSCRIBE
- `sessionId` — The **publisher's** session ID (where tracks originate)
- `trackName` — The track identifier from the publisher

**Response** (200 OK):

```json
{
  "requiresImmediateRenegotiation": true,
  "tracks": [
    {
      "sessionId": "c94f2751ff85e3256f3f1747747224dc7a72bc897214f91187596ddcc4709593",
      "trackName": "a9df124e-5b0b-491c-b144-7856f9d3251c",
      "mid": "0"
    },
    {
      "sessionId": "c94f2751ff85e3256f3f1747747224dc7a72bc897214f91187596ddcc4709593",
      "trackName": "c2e9c1aa-5710-45c0-8ed1-7aee8c5b3bd9",
      "mid": "1"
    }
  ],
  "sessionDescription": {
    "sdp": "v=0\r\no=- 1928992679383597876 1773865148 IN IP4 0.0.0.0\r\ns=-\r\n...",
    "type": "offer"
  }
}
```

**Status**: ✅ **VERIFIED — Q8 RESOLVED**

- Same endpoint (`tracks/new`) used for both push and pull
- `location: "remote"` triggers subscription behavior
- Returns `sessionDescription.type: "offer"` ← **Cloudflare generates Offer for subscriber**
- `requiresImmediateRenegotiation: true` indicates you must complete renegotiation

**Flow**:

1. Get remote track references (sessionId + trackName)
2. Call `tracks/new` with `location: "remote"`
3. Receive **Offer** from Cloudflare
4. Set as remote description in RTCPeerConnection
5. Create Answer
6. PUT to `/renegotiate`

---

### 4. PUT /v1/apps/{appId}/sessions/{sessionId}/renegotiate

**Purpose**: Complete renegotiation by sending Answer

**Request**:

```http
PUT https://rtc.live.cloudflare.com/v1/apps/{appId}/sessions/{sessionId}/renegotiate
Authorization: Bearer {APP_TOKEN}
Content-Type: application/json

{
  "sessionDescription": {
    "sdp": "v=0\r\no=- 7934741593981415176 2 IN IP4 127.0.0.1\r\ns=-\r\n...",
    "type": "answer"
  }
}
```

**Response** (200 OK):

```json
{}
```

**Status**: ✅ VERIFIED

- Uses **PUT** (not POST)
- Sends `sessionDescription` with `type: "answer"`
- Empty JSON object `{}` response on success

---

## API Base URL

```
https://rtc.live.cloudflare.com/v1/apps/{APP_ID}
```

**Note**: This is **different** from `realtime.cloudflare.com` mentioned in some docs.

---

## Authentication

All requests require:

```
Authorization: Bearer {APP_TOKEN}
Content-Type: application/json
```

---

## Unverified / Not Captured

- ❌ `tracks/close` — Not observed in Echo Demo flow
- ❌ Error responses — Only success paths captured
- ❌ Session TTL / expiration behavior

---

## References

- [Realtime Examples](https://github.com/cloudflare/realtime-examples) (Echo demo for payload capture)
- [Cloudflare Realtime Docs](https://developers.cloudflare.com/calls/get-started/) (limited; protocol details sparse)

---

## Next Steps

1. ✅ **Protocol verified** — Q8 resolved (pull model with `location: "remote"`)
2. 🔄 **Unlock implementation** — Update `src/worker/index.ts` with verified payloads
3. 🔄 **Test 1:1 call** — Two browser tabs, full flow
