# Task 20250318-001d: Minimal Client Scaffold (Phase 3)

**Architectural Authority**: `docs/90-references/consensus-log.md`
**Constraint**: Do not deviate from locked decisions without updating the consensus log.

## Objective

Implement the absolute minimum browser client for protocol verification. No frameworks unless repo already uses one.

## Prerequisites

- [ ] Tasks 20250318-001a, 001b, 001c completed
- [ ] Worker routes exist (even if returning 503)

## Deliverables

### File: `src/client/main.ts`

Required functionality:

1. **Capture local camera/mic**
   ```typescript
   navigator.mediaDevices.getUserMedia({ video: true, audio: true })
   ```

2. **Create RTCPeerConnection**
   ```typescript
   new RTCPeerConnection({
     iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }]
   })
   ```

3. **Set up track handlers**
   ```typescript
   pc.ontrack = (e) => { /* attach to remote video element */ }
   pc.oniceconnectionstatechange = () => { /* log state */ }
   ```

4. **Display status**
   - Log each step to a status element
   - Show clear message if blocked: "[BLOCKED] Cannot create session: protocol verification incomplete"

### Required Code Comments

Top of file:
```typescript
// SPEC ONLY: Client cannot function until protocol verification complete.
// BLOCKED: Missing verified mechanism for receiving remote subscribe offer.
```

### File: `public/index.html`

Minimal HTML with only:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Telesense — Protocol Verification Spike</title>
  <style>
    /* Minimal styles: local video, remote video, status area */
  </style>
</head>
<body>
  <h1>Telesense <span style="font-weight:normal;color:#666">(Protocol Verification Spike)</span></h1>
  
  <!-- Status display -->
  <div id="status">Loading...</div>
  
  <!-- Video elements -->
  <video id="local" autoplay muted playsinline></video>
  <video id="remote" autoplay playsinline></video>
  
  <script type="module" src="/src/client/main.ts"></script>
</body>
</html>
```

Required elements:
- [ ] Local video element (autoplay, muted, playsinline)
- [ ] Remote video element (autoplay, playsinline)
- [ ] Status text area
- [ ] Warning banner if implementation blocked

## Client Flow (When Unblocked)

```
1. Get callId from URL (?call=test)
2. Capture local media
3. Create PeerConnection
4. POST /api/calls/:callId/session
5. Add local tracks to PC
6. Create offer
7. POST /api/calls/:callId/publish-offer
8. Set remote description (answer)
9. Poll GET /discover-remote-tracks
10. When remote tracks appear:
    a. Receive remote offer (mechanism TBD)
    b. Create answer
    c. POST /complete-subscribe
```

## Acceptance Criteria

- [x] `src/client/main.ts` exists with RTCPeerConnection setup
- [x] Local media capture implemented
- [x] `public/index.html` exists with local/remote video elements
- [x] Status logging to UI element
- [x] Full 1:1 call flow implemented
- [x] No framework dependencies

## Status

✅ **COMPLETED** — 2026-03-18

**Implemented**: Session, publish, poll, subscribe, complete flow with working 1:1 video calls.

## Dependencies

- 20250318-001a-protocol-docs.md ✅
- 20250318-001c-backend-scaffold.md ✅

## Next Step

~~After completion: **20250318-001e-repo-plumbing.md**~~ → Completed
~~After 1b complete: **20250318-001f-unlock-implementation.md**~~ → Completed
