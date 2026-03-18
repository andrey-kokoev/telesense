# Call Lifecycle

Complete sequence of API calls for a 1:1 video call.

## Overview

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│ Browser │     │ Worker  │     │Cloudflare│
│    A    │     │         │     │   SFU   │
└────┬────┘     └────┬────┘     └────┬────┘
     │               │               │
     │  1. Create Session            │
     │──────────────────────────────►│
     │               │               │
     │               │  2. POST /sessions/new
     │               │──────────────►│
     │               │               │
     │               │◄──────────────│
     │◄──────────────│  3. {sessionId}
     │               │               │
     │  4. Publish Tracks            │
     │──────────────────────────────►│
     │               │               │
     │               │  5. POST /tracks/new
     │               │   {location: "local"}
     │               │──────────────►│
     │               │               │
     │               │◄──────────────│
     │◄──────────────│  6. {sessionDescription: Answer}
     │               │               │
     │  7. ICE Connected             │
     │────────UDP/SRTP──────────────►│
     │               │               │
     │◄─────Media flowing────────────│
     │               │               │
     │               │               │
     │    [Browser B joins]          │
     │               │               │
     │               │◄──────────────│
     │               │  8. B creates session
     │               │   B publishes tracks
     │               │               │
     │  9. Discover                  │
     │──────────────────────────────►│
     │               │               │
     │◄──────────────│  10. [B's tracks]
     │               │               │
     │  11. Subscribe                │
     │──────────────────────────────►│
     │               │               │
     │               │  12. POST /tracks/new
     │               │   {location: "remote"}
     │               │──────────────►│
     │               │               │
     │               │◄──────────────│
     │◄──────────────│  13. {sessionDescription: Offer}
     │               │               │
     │  14. Complete                 │
     │──────────────────────────────►│
     │               │               │
     │               │  15. PUT /renegotiate
     │               │   {sessionDescription: Answer}
     │               │──────────────►│
     │               │               │
     │  16. Media flows both ways    │
     │◄─────UDP/SRTP────────►│◄─────│
     │               │               │
```

## Phase 1: Session Setup (Tab A)

### 1.1 Create Session

**Browser A** → **Worker** → **Cloudflare**

```javascript
// Browser
const res = await fetch('/api/calls/test/session', { method: 'POST' })
const { sessionId } = await res.json()
```

```http
# Worker → Cloudflare
POST https://rtc.live.cloudflare.com/v1/apps/{APP_ID}/sessions/new
```

### 1.2 Publish Tracks

**Browser A** creates WebRTC offer, sends to Cloudflare via Worker.

```javascript
// Browser
const pc = new RTCPeerConnection({...})
const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: true})
stream.getTracks().forEach(track => pc.addTrack(track, stream))

const offer = await pc.createOffer()
await pc.setLocalDescription(offer)

await fetch('/api/calls/test/publish-offer', {
  method: 'POST',
  body: JSON.stringify({
    sessionId,
    sdpOffer: offer.sdp,
    tracks: [{ mid: '0', trackName: track.id }]
  })
})
```

```http
# Worker → Cloudflare
POST /v1/apps/{APP_ID}/sessions/{sessionId}/tracks/new
{
  "sessionDescription": { "type": "offer", "sdp": "..." },
  "tracks": [{ "location": "local", "mid": "0", "trackName": "..." }]
}
```

**Response**: Answer SDP from Cloudflare.

### 1.3 ICE Connection

WebRTC establishes UDP connection to Cloudflare.

```javascript
pc.oniceconnectionstatechange = () => {
  if (pc.iceConnectionState === 'connected') {
    // Media flowing to Cloudflare
  }
}
```

## Phase 2: Session Setup (Tab B)

Same as Phase 1, but for Browser B.

```javascript
// Browser B does the same thing
const res = await fetch('/api/calls/test/session', { method: 'POST' })
const { sessionId: sessionIdB } = await res.json()
// ... publish tracks ...
```

## Phase 3: Discovery (Tab A finds Tab B)

### 3.1 Poll for Remote Tracks

Browser A polls every 2 seconds:

```javascript
const poll = async () => {
  const res = await fetch(`/api/calls/test/discover-remote-tracks?sessionId=${sessionIdA}`)
  const { tracks } = await res.json()
  
  if (tracks.length > 0) {
    // Found B's tracks!
    await subscribeToTracks(tracks)
  }
  
  setTimeout(poll, 2000)
}
```

**Worker logic**:
```typescript
// Find all tracks from other sessions in same call
const remoteTracks = []
for (const [sid, session] of callSessions) {
  if (sid === selfSessionId) continue
  remoteTracks.push(...session.publishedTracks)
}
```

## Phase 4: Subscription (The Magic)

### 4.1 Request Offer

Browser A asks Cloudflare for an Offer to receive B's tracks.

```javascript
await fetch('/api/calls/test/subscribe-offer', {
  method: 'POST',
  body: JSON.stringify({
    sessionId: sessionIdA,
    remoteTracks: [{
      trackName: "B's-video-track-id",
      sessionId: "B's-cloudflare-session-id"
    }]
  })
})
```

```http
# Worker → Cloudflare
POST /v1/apps/{APP_ID}/sessions/{sessionIdA}/tracks/new
{
  "tracks": [{
    "location": "remote",
    "trackName": "B's-video-track-id",
    "sessionId": "B's-cloudflare-session-id"
  }]
}
```

**Response**: Cloudflare generates and returns **Offer SDP**!

### 4.2 Complete Subscription

Browser A creates Answer, sends to Cloudflare.

```javascript
const offer = subscribeResponse.sessionDescription  // From Cloudflare!
await pc.setRemoteDescription(offer)

const answer = await pc.createAnswer()
await pc.setLocalDescription(answer)

await fetch('/api/calls/test/complete-subscribe', {
  method: 'POST',
  body: JSON.stringify({
    sessionId: sessionIdA,
    sdpAnswer: answer.sdp
  })
})
```

```http
# Worker → Cloudflare
PUT /v1/apps/{APP_ID}/sessions/{sessionIdA}/renegotiate
{
  "sessionDescription": { "type": "answer", "sdp": "..." }
}
```

## Phase 5: Bidirectional Media

Now both browsers:
- **Send** their camera/mic to Cloudflare
- **Receive** the other person's video from Cloudflare

```
Browser A ──UDP/SRTP──► Cloudflare ──UDP/SRTP──► Browser B
Browser A ◄──UDP/SRTP── Cloudflare ◄──UDP/SRTP── Browser B
```

## Timing Summary

| Phase | Typical Duration | Notes |
|-------|-----------------|-------|
| Session creation | 100-500ms | API round-trip |
| Publish offer/answer | 200-800ms | Cloudflare processing |
| ICE connection | 1-5 seconds | UDP hole punching |
| Discovery | 2-5 seconds | Polling interval |
| Subscription | 500-1000ms | 2 API calls |
| **Total to media** | **5-15 seconds** | End-to-end |

## Error Handling

At each phase, handle errors:

```javascript
try {
  const res = await fetch('/api/calls/test/session', { method: 'POST' })
  if (!res.ok) {
    const error = await res.json()
    // error.code: 'UPSTREAM_ERROR', 'BAD_REQUEST', etc.
    throw new Error(error.error)
  }
} catch (e) {
  // Network error or exception
  console.error('Failed to create session:', e)
}
```

## See Also

- [API Reference](./01-api-reference.md) - Endpoint details
- [Media Flow](../10-architecture/02-media-flow.md) - Packet-level details
- [Troubleshooting](../00-getting-started/03-troubleshooting.md) - Common issues
