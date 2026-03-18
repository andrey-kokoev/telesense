# API Reference

Complete reference for all endpoints.

## Base URLs

| Environment | URL |
|-------------|-----|
| Cloudflare API | `https://rtc.live.cloudflare.com/v1/apps/{APP_ID}` |
| Local Worker | `http://localhost:8787` |
| Local Client | `http://localhost:5173` |

## Authentication

### Cloudflare API
```http
Authorization: Bearer {APP_TOKEN}
Content-Type: application/json
```

### Worker API
No authentication required (CORS-enabled for local dev).

## Endpoints

### POST /api/calls/:callId/session

Create a new session for this call.

**Request**:
```http
POST /api/calls/test/session
Content-Type: application/json

{}  // Empty body
```

**Response** (200 OK):
```json
{
  "sessionId": "f55ce501-025e-4c1a-881a-3479b0499c11",
  "cloudflareSessionId": "ea2a61a4f979a2d534d1c307be181c78941f0281de4b91a90caf22559763391c"
}
```

**Errors**:
- `400` - Invalid callId
- `502` - Upstream Cloudflare error

---

### POST /api/calls/:callId/publish-offer

Publish local tracks to Cloudflare.

**Request**:
```http
POST /api/calls/test/publish-offer
Content-Type: application/json

{
  "sessionId": "f55ce501-025e-4c1a-881a-3479b0499c11",
  "sdpOffer": "v=0\r\no=-...",
  "tracks": [
    { "mid": "0", "trackName": "audio-track-id" },
    { "mid": "1", "trackName": "video-track-id" }
  ]
}
```

**Response** (200 OK):
```json
{
  "sessionDescription": {
    "type": "answer",
    "sdp": "v=0\r\no=-..."
  },
  "tracks": [
    { "mid": "0", "trackName": "audio-track-id" },
    { "mid": "1", "trackName": "video-track-id" }
  ]
}
```

**Errors**:
- `400` - Invalid request body
- `404` - Session not found
- `502` - Upstream error

---

### POST /api/calls/:callId/subscribe-offer

Request an Offer to subscribe to remote tracks. ⭐ Key endpoint for 1:1 calls.

**Request**:
```http
POST /api/calls/test/subscribe-offer
Content-Type: application/json

{
  "sessionId": "f55ce501-025e-4c1a-881a-3479b0499c11",
  "remoteTracks": [
    {
      "trackName": "remote-video-track-id",
      "sessionId": "remote-session-id"
    }
  ]
}
```

**Response** (200 OK):
```json
{
  "sessionDescription": {
    "type": "offer",
    "sdp": "v=0\r\no=-..."
  },
  "tracks": [
    {
      "sessionId": "remote-session-id",
      "trackName": "remote-video-track-id",
      "mid": "0"
    }
  ],
  "requiresImmediateRenegotiation": true
}
```

**Note**: This is the **pull model** - browser asks Cloudflare for an Offer.

---

### POST /api/calls/:callId/complete-subscribe

Complete subscription by sending Answer.

**Request**:
```http
POST /api/calls/test/complete-subscribe
Content-Type: application/json

{
  "sessionId": "f55ce501-025e-4c1a-881a-3479b0499c11",
  "sdpAnswer": "v=0\r\no=-..."
}
```

**Response** (200 OK):
```json
{ "ok": true }
```

---

### GET /api/calls/:callId/discover-remote-tracks

Discover tracks published by other participants.

**Request**:
```http
GET /api/calls/test/discover-remote-tracks?sessionId=f55ce501...
```

**Response** (200 OK):
```json
{
  "tracks": [
    {
      "trackName": "remote-video-id",
      "sessionId": "remote-session-id",
      "mid": "1"
    }
  ]
}
```

---

### POST /api/calls/:callId/leave

Clean up session.

**Request**:
```http
POST /api/calls/test/leave
Content-Type: application/json

{
  "sessionId": "f55ce501-025e-4c1a-881a-3479b0499c11"
}
```

**Response** (200 OK):
```json
{ "ok": true }
```

---

### GET /health

Health check endpoint.

**Response** (200 OK):
```json
{
  "status": "healthy",
  "version": "0.0.1",
  "callsActive": 1,
  "sessionsActive": 2
}
```

## Cloudflare Direct API

These are called by the Worker, not directly by clients.

### POST /v1/apps/{appId}/sessions/new

Create a Cloudflare session.

**Request**:
```http
POST /v1/apps/{APP_ID}/sessions/new
Authorization: Bearer {APP_TOKEN}
```

**Response**:
```json
{
  "sessionId": "ea2a61a4f979a2d534d1c307be181c78941f0281de4b91a90caf22559763391c"
}
```

### POST /v1/apps/{appId}/sessions/{sessionId}/tracks/new

Create/modify tracks. Key endpoint with dual behavior:

**For publishing** (location: "local"):
```json
{
  "sessionDescription": { "type": "offer", "sdp": "..." },
  "tracks": [
    { "location": "local", "mid": "0", "trackName": "..." }
  ]
}
```

**For subscribing** (location: "remote"):
```json
{
  "tracks": [
    { "location": "remote", "sessionId": "...", "trackName": "..." }
  ]
}
```

### PUT /v1/apps/{appId}/sessions/{sessionId}/renegotiate

Complete renegotiation with Answer.

**Request**:
```http
PUT /v1/apps/{APP_ID}/sessions/{sessionId}/renegotiate
Authorization: Bearer {APP_TOKEN}

{
  "sessionDescription": { "type": "answer", "sdp": "..." }
}
```

**Response**:
```json
{}
```

## Error Codes

| Code | Meaning | HTTP Status |
|------|---------|-------------|
| `BAD_REQUEST` | Invalid input | 400 |
| `SESSION_NOT_FOUND` | Session doesn't exist | 404 |
| `UPSTREAM_ERROR` | Cloudflare API failed | 502 |
| `INVALID_RESPONSE` | Unexpected response format | 502 |
| `INTERNAL_ERROR` | Server error | 500 |

## Rate Limits

Cloudflare Realtime limits:
- Concurrent sessions per app: Check Cloudflare docs
- Requests per second: Standard Cloudflare rate limiting

## See Also

- [Lifecycle](./02-lifecycle.md) - Sequence of API calls
- [Wire Format](../90-references/wire-format.md) - Payload details
