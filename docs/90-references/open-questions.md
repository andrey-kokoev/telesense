# Cloudflare Realtime: Open Questions

**Last updated**: 2026-03-18  
**Status**: 🎉 **Q8 RESOLVED** — Protocol verified via Echo Demo capture

## Session Management

### Q1: sessions/new request body
**Issue**: Cloudflare docs don't specify if request body is empty, required, or optional.
- [x] **VERIFIED**: Empty body `{}` is valid
- **Evidence**: Echo Demo 2026-03-18 — `POST sessions/new` with empty body returns sessionId

### Q2: sessions/new response structure
**Issue**: Docs show token in response, but exact field names unclear.
- [x] **VERIFIED**: Response is `{ "sessionId": "..." }` (not nested under `result`)
- **Evidence**: Echo Demo 2026-03-18 — direct `sessionId` field

### Q3: Token type and lifetime
**Issue**: Is token a JWT? Opaque? Does it expire?
- [ ] **Partially verified**: Token is opaque string sent via `Authorization: Bearer` header
- **Evidence**: Echo Demo shows header-based auth, not body token
- **Still unknown**: TTL, refresh mechanism

## Track Publishing (Local Offer Path)

### Q4: tracks/new request: SDP format
**Issue**: Is raw SDP string or wrapped object?
- [x] **VERIFIED**: Wrapped in `sessionDescription` object
```json
{
  "sessionDescription": {
    "type": "offer",
    "sdp": "v=0..."
  }
}
```
- **Evidence**: Echo Demo 2026-03-18 — verbatim payload captured

### Q5: tracks/new request: Track description fields
**Issue**: What fields define a track being published?
- [x] **VERIFIED**: `{ location: "local", mid: "0|1", trackName: "..." }`
- **Evidence**: Echo Demo 2026-03-18 — `location`, `mid`, `trackName` confirmed
- **Note**: `trackName` is browser's `MediaStreamTrack.id`

### Q6: tracks/new response: Answer structure
**Issue**: Does response include remote track offerings (for subscription)?
- [x] **VERIFIED**: Response includes `sessionDescription` (Answer) and `tracks` array
- **Evidence**: Echo Demo 2026-03-18
- **Key finding**: `requiresImmediateRenegotiation: false` for initial publish

### Q7: tracks/new response: Track ID format
**Issue**: How does Cloudflare assign track IDs? Stable per publish?
- [x] **VERIFIED**: Uses `trackName` (client-provided) and `mid` — no separate Cloudflare track ID
- **Evidence**: Echo Demo shows response echoes back same `trackName` values

## Remote Track Subscription (CRITICAL — NOW RESOLVED)

### Q8: Remote subscription initiation ✅ RESOLVED
**Issue**: Which API call generates the Offer SDP for subscribing to remote tracks?

**RESOLUTION**: 
- Call `POST tracks/new` AGAIN with `location: "remote"`
- Include `sessionId` (publisher's session) and `trackName` for each track
- Returns `sessionDescription.type: "offer"` ← Cloudflare generates Offer

**Verified payload** (Echo Demo 2026-03-18):
```json
// Request
{
  "tracks": [{
    "location": "remote",
    "trackName": "...",
    "sessionId": "publisher-session-id"
  }]
}

// Response
{
  "requiresImmediateRenegotiation": true,
  "sessionDescription": { "type": "offer", "sdp": "..." },
  "tracks": [...]
}
```

- [x] **VERIFIED**: Same endpoint (`tracks/new`) with `location: "remote"` triggers subscription
- **Evidence**: Echo Demo 2026-03-18 — complete request/response captured
- **Architecture**: Orchestration/pull model (backend calls Cloudflare to request Offer)

### Q9: Remote offer structure
**Issue**: What does the Offer look like?
- [x] **VERIFIED**: Same structure as push response, but `type: "offer"`
- **Evidence**: Echo Demo 2026-03-18 — SDP with Cloudflare ICE candidates, `setup: actpass`

### Q10: Remote answer submission: complete-subscribe payload
**Issue**: Does browser send raw Answer or must wrap it?
- [x] **VERIFIED**: Wrapped in `sessionDescription` object, sent via `PUT /renegotiate`
```json
{
  "sessionDescription": {
    "type": "answer",
    "sdp": "..."
  }
}
```
- **Evidence**: Echo Demo 2026-03-18 — `PUT /renegotiate` with wrapped Answer
- **Key detail**: Uses **PUT** not POST

## State Management

### Q11: Session state persistence
**Issue**: Are sessions ephemeral (lost on Worker restart) or durable?
- [ ] **Open**: Cloudflare session behavior not fully tested

### Q12: Multiple clients in same session
**Issue**: Can multiple browsers connect to same Cloudflare session?
- [ ] **Partially verified**: Echo Demo creates TWO separate sessions (one for push, one for pull)
- **Implication**: Each browser needs its own Cloudflare session

### Q13: Track discovery: listing remote tracks
**Issue**: How to discover what tracks are being published by other participants?
- [x] **VERIFIED**: App-level problem — backend must track published tracks and share refs
- **Evidence**: Echo Demo hardcodes track references; no Cloudflare "list tracks" endpoint
- **Implementation**: Use `GET /discover-remote-tracks` in our backend

## Cleanup and Signaling

### Q14: tracks/close request schema
**Issue**: Do we send one ID or multiple?
- [ ] **Open**: Not observed in Echo Demo

### Q15: Session termination
**Issue**: Does closing all tracks implicitly close session?
- [ ] **Open**: Not tested

### Q16: SDP renegotiation
**Issue**: Can tracks be added/removed mid-session?
- [x] **VERIFIED**: Yes — `tracks/new` can be called multiple times
- **Evidence**: Echo Demo calls `tracks/new` twice (push then pull) on same session

## Network and Connectivity

### Q17: STUN/TURN server configuration
**Issue**: Does Cloudflare Realtime provide TURN servers?
- [x] **VERIFIED**: Cloudflare provides STUN at `stun:stun.cloudflare.com:3478`
- **Evidence**: Echo Demo code shows this configuration
- **Unknown**: TURN server availability

### Q18: Connection establishment latency
**Issue**: How long do sessions/new → ready-to-call typically take?
- [ ] **Open**: Not measured

### Q19: Concurrent session limits
**Issue**: How many active sessions can one app ID have?
- [ ] **Open**: Not tested

---

## Summary

**Verified**: 12 / 19  
**Critical blockers**: 0 (Q8 resolved)

### Blocking Implementation (None Critical)
- **Medium**: Q14 (cleanup) — can skip for initial spike
- **Low**: Q3, Q11, Q15, Q18, Q19 — operational concerns

---

## Question Dependencies

```
Q8 (Remote subscription) ──✅ RESOLVED
  └── Enables: complete-subscribe implementation

Q4, Q5, Q6, Q7 (Publish) ──✅ RESOLVED
  └── Enables: publish-offer implementation

Q1, Q2 (Session) ──✅ RESOLVED
  └── Enables: session creation

Q10 (Answer format) ──✅ RESOLVED
  └── Enables: renegotiate implementation
```

---

## Blocker Locations in Code (Ready to Unlock)

| Question | File | Status | Action |
|----------|------|--------|--------|
| Q1, Q2 | `src/worker/index.ts` | Returns 503 | Uncomment, use `sessionId` path |
| Q4, Q5, Q6 | `src/worker/index.ts` | Returns 503 | Uncomment, implement push flow |
| Q8 (Critical) | `src/worker/index.ts` | Returns 503 | **NEW**: Add pull flow with `location: "remote"` |
| Q10 | `src/worker/index.ts` | Returns 503 | Uncomment, implement PUT /renegotiate |

---

## Definition of Done for "Verified" Status

A question moves from **open** → **verified** only when:

1. ✅ **Verbatim JSON** from actual network capture is documented
2. ✅ **Field path** is confirmed (e.g., `sessionId`, not `result.id`)
3. ✅ **HTTP method** is confirmed (GET vs POST vs PUT)
4. ✅ **Edge cases** noted

---

## Next Action

🎉 **Protocol verification complete!** Ready for **Task 20250318-001f: Unlock Implementation**.
