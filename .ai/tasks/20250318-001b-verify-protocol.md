# Task 20250318-001b: Verify Protocol from Real Examples (Phase 2)

**Architectural Authority**: `docs/90-references/consensus-log.md`
**Constraint**: Do not deviate from locked decisions without updating the consensus log.

**Executor**: User or external agent with browser access
**AI Agent Role**: Guide capture process, structure findings into docs

⚠️ **HUMAN GATE**: This task requires running the Echo Demo and capturing DevTools traffic—something an AI agent cannot directly perform. The user must execute this step.

## Objective

Use real evidence, not speculation, to verify the Cloudflare Realtime protocol. Capture actual network payloads from the Echo Demo to resolve open questions.

## Prerequisites

- [ ] Task 20250318-001a-protocol-docs completed
- [ ] `docs/realtime-wire-contract.md` exists
- [ ] `docs/realtime-open-questions.md` exists

## Sources of Truth (Priority Order)

1. Cloudflare Echo Demo or equivalent working demo
2. `cloudflare/realtime-examples` repository
3. Current official Cloudflare OpenAPI / docs
4. Orange Meets as architecture reference only

## Verification Tasks

### Task 1: Capture sessions/new Payloads

**Goal**: Verify session creation endpoint.

Run Echo Demo with DevTools Network tab open:

```
1. Open https://github.com/cloudflare/realtime-examples (Echo demo)
2. Open Chrome DevTools → Network tab
3. Start a call (first browser tab)
4. Look for POST to sessions/new
```

Capture and document:

- [ ] Request body (empty vs required fields)
- [ ] Response structure (`result.id` vs `sessionId`)
- [ ] Token format (`result.token` path)
- [ ] Any error responses

Update `docs/realtime-wire-contract.md` with verbatim JSON.

### Task 2: Capture tracks/new Payloads

**Goal**: Verify track publishing endpoint.

In the same session:

```
1. After session creation, look for POST to tracks/new
2. Capture request body
3. Capture response body
```

Capture and document:

- [ ] Exact request body schema (sessionDescription wrapping)
- [ ] Track description fields (name, kind, location, etc.)
- [ ] Response structure (answer SDP path, track IDs)
- [ ] Whether response includes remote track offers

Update `docs/realtime-wire-contract.md` with verbatim JSON.

### Task 3: Resolve Critical Blocker — Remote Subscription Initiation ⚠️

**Goal**: Answer: _Which API call generates the Offer SDP for subscribing to remote tracks?_

**Critical Correction**: This is an **orchestration/pull model**, not push. Look for backend proactively calling Cloudflare to request subscription Offer.

Procedure:

```
1. Open Browser Tab A, start call (publish tracks)
2. Open Browser Tab B, join same call
3. Watch network traffic in Tab A carefully
4. Look for SECOND API call after initial tracks/new that returns:
   - sessionDescription with type: "offer"
   - This is the subscription offer for Peer B's tracks
```

Hypotheses to test:

**Hypothesis A**: `POST tracks/new` again with `location: "remote"`
**Hypothesis B**: Separate endpoint like `POST /subscribe` or `GET /offers`
**Hypothesis C**: `PUT /renegotiate` initiated by backend

Document in `docs/realtime-wire-contract.md` under:

```markdown
## Remote subscription initiation
```

Required outcomes:

- [ ] Confirmed API endpoint with verbatim JSON, OR
- [ ] Still unresolved with exact reason why

### Task 4: Capture tracks/close Payloads

**Goal**: Verify cleanup endpoint.

- [ ] Request body (array vs single track ID)
- [ ] Response shape

## Update Questions Document

For each verified item:

1. Move question from `open` to `verified` in `docs/realtime-open-questions.md`
2. Add source citation (Echo Demo capture, line X)
3. Add verbatim JSON to `docs/realtime-wire-contract.md`

## Acceptance Criteria

- [x] At least one payload captured with verbatim JSON
- [x] Q8 (remote offer delivery) explicitly addressed with evidence
- [x] `docs/realtime-wire-contract.md` updated with verified payloads
- [x] `docs/realtime-open-questions.md` updated with verified status

## Status

✅ **COMPLETED** — 2026-03-18

**Key Findings**:

- Repository: `cloudflare/realtime-examples` (not calls-demo)
- API base: `rtc.live.cloudflare.com/v1` (not realtime.cloudflare.com)
- Q8 resolved: `POST /tracks/new` with `location: "remote"` returns Offer
- Architecture: Orchestration/pull model (not push)

## Honesty Requirement

✅ Protocol fully verified. No blockers remain.

## Dependencies

- 20250318-001a-protocol-docs.md ✅

## Next Step

~~After completion: **20250318-001f-unlock-implementation.md**~~ → Completed
