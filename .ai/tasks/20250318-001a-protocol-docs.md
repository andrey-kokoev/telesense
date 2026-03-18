# Task 20250318-001a: Create Protocol Documentation (Phase 1)

**Architectural Authority**: `docs/20260318-000-codex-review-summary.md`
**Constraint**: Do not deviate from locked decisions (single-file, main-thread, poll-first) without updating the consensus log.

## Objective

Create the protocol documentation foundation before writing any implementation code. This is the first step toward a verified 1:1 Cloudflare Realtime call.

## Deliverables

### 1. Create `docs/realtime-wire-contract.md`

This file must contain:

* Purpose of the experiment
* Source-of-truth hierarchy
* Verified endpoints
* Observed payloads
* Inferred payloads clearly marked as inferred
* Minimal 1:1 happy path
* Unresolved blockers

Template structure:

```markdown
# Realtime Wire Contract (Echo Demo Capture)

**Status: Protocol specification incomplete. Waiting for Echo Demo payload capture.**

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
  |                          |<-- (token, sessionId) |          |
  |<-- (token, sessionId) ---|                       |          |
  ...
```

## Wire Format (INFERRED — NEEDS ECHO DEMO VERIFICATION)

### 1. POST /realtime/client/v4/apps/{appId}/sessions/new
**Request**: ...
**Response**: ...
**Status**: ❌ Unverified

### 2. POST /realtime/client/v4/apps/{appId}/sessions/{sessionId}/tracks/new
**Request**: ...
**Response**: ...
**Status**: ❌ Unverified

### 3. Remote Offer Delivery (CRITICAL BLOCKER)
**Question**: How does browser receive Offer from SFU for remote track subscription?
**Status**: ❌ CRITICAL BLOCKER
```

### 2. Create `docs/realtime-open-questions.md`

This file should track every unresolved protocol question, each with status:

- `open` — Not yet verified
- `verified` — Confirmed via captured payload
- `discarded` — Invalidated by new information

Categories to cover:
- Session Management (sessions/new format, response structure, token type)
- Track Publishing (SDP format, track description fields, response structure)
- Remote Track Subscription (offer delivery mechanism — CRITICAL)
- Renegotiate (request/response schema)
- Cleanup (tracks/close payload)
- ICE/Connectivity (Trickle ICE support)

## Acceptance Criteria

- [x] `docs/realtime-wire-contract.md` exists with architecture diagram
- [x] `docs/realtime-open-questions.md` exists with tracked questions
- [x] All inferred payloads clearly marked with `> INFERRED`
- [x] Critical blocker Q8 documented: "How does existing browser receive remote offer?"

## Status

✅ **COMPLETED** — 2026-03-18

## Dependencies

None. This is the first step.

## Next Step

~~After completion: **20250318-001b-verify-protocol.md**~~ → Completed
