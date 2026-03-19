# Task 20250318-001c: Minimal Backend Scaffold (Phase 3)

**Architectural Authority**: `docs/90-references/consensus-log.md`
**Constraint**: Do not deviate from locked decisions without updating the consensus log.

## Objective

Implement the thinnest possible Worker backend with verified protocol routes. This is NOT a full implementation — routes should fail gracefully if protocol is still unverified.

## Prerequisites

- [ ] Tasks 20250318-001a and 001b completed
- [ ] Protocol payloads verified OR explicitly marked as blocking

## Deliverables

### File: `src/worker/index.ts`

Implement a Worker with these exact routes:

```typescript
POST   /api/calls/:callId/session
POST   /api/calls/:callId/publish-offer
POST   /api/calls/:callId/complete-subscribe
GET    /api/calls/:callId/discover-remote-tracks
POST   /api/calls/:callId/leave
```

### Required Code Comments

Top of file:

```typescript
// SPEC ONLY: wire-format fields and negotiation details must be verified against
// current Cloudflare docs/examples before implementation hardening.
//
// BLOCKER: This code cannot run until Echo Demo payload capture is complete.
// See: docs/realtime-open-questions.md
```

Near state store:

```typescript
// Dev-only ephemeral rendezvous state; invalid across isolates/restarts/deploys.
// Production requires Durable Objects or external shared state.
const calls = new Map<
  string,
  Map<
    string,
    {
      cfSessionId: string
      publishedTrackIds: Set<string>
    }
  >
>()
```

Near remote discovery route:

```typescript
// BLOCKER: this endpoint exposes remote track IDs only.
// The verified mechanism for how the browser receives the SFU-generated
// remote-subscribe offer must be documented in docs/realtime-wire-contract.md.
```

### Route Requirements

#### 1. POST /api/calls/:callId/session

- Validate `callId` parameter
- If protocol unverified: return 503 with `{ error: 'Protocol verification incomplete' }`
- If verified: implement sessions/new call to Cloudflare
- Fail hard on unexpected upstream payload shape (no silent fallbacks)

#### 2. POST /api/calls/:callId/publish-offer

- Accept: `{ internalSessionId, sdpOffer, localTracks }`
- If protocol unverified: return 503
- If verified: implement tracks/new call
- Return: `{ cloudflareTrackIds, answerSdp }`

#### 3. POST /api/calls/:callId/complete-subscribe

- Accept: `{ internalSessionId, sdpAnswer }`
- CRITICAL: Cannot implement until remote-offer delivery (Q8) is verified
- Must document blocker clearly if returning 503

#### 4. GET /api/calls/:callId/discover-remote-tracks

- Query param: `sessionId` (to exclude self)
- Return: `{ tracks: string[] }` — Cloudflare track IDs only
- Does NOT use browser MediaStreamTrack.id

#### 5. POST /api/calls/:callId/leave

- Accept: `{ internalSessionId }`
- Clean up in-memory state
- Return: `{ ok: true }`

### Code Standards

- [ ] Use Hono framework
- [ ] Strict validation for all JSON bodies
- [ ] Explicit 400/404/502/503 responses
- [ ] Upstream failures logged with route and status
- [ ] Raw response body logged only behind debug flag
- [ ] No `any` types unless absolutely unavoidable
- [ ] Provisional types marked clearly

### State Constraints

Use app-level rendezvous state:

```typescript
Map<
  callId,
  Map<
    internalSessionId,
    {
      cfSessionId: string
      publishedTrackIds: Set<string>
    }
  >
>
```

Important:

- Store only Cloudflare-assigned track IDs for remote discovery
- Do not use browser `MediaStreamTrack.id` as remote subscription identifier

## Architecture Constraints (Do NOT Add)

- [ ] No Durable Objects
- [ ] No database
- [ ] No WebSocket signaling layer (unless verified as required)
- [ ] No abstractions for future multiparty use
- [ ] No room model beyond simple `callId`
- [ ] No elaborate service classes

Single file is acceptable for initial spike.

## Acceptance Criteria

- [x] `src/worker/index.ts` exists with all routes
- [x] Proper types defined for all request/response bodies
- [x] Required code comments present
- [x] In-memory state clearly marked as dev-only
- [x] No production architecture patterns (DO, DB, etc.)

## Status

✅ **COMPLETED** — 2026-03-18

**Note**: Originally scaffolded with 503 fallbacks, then unlocked in 001f with verified payloads.

## Dependencies

- 20250318-001a-protocol-docs.md ✅
- 20250318-001b-verify-protocol.md ✅

## Next Step

~~After completion: **20250318-001d-client-scaffold.md**~~ → Completed
~~After 1b complete: **20250318-001f-unlock-implementation.md**~~ → Completed
