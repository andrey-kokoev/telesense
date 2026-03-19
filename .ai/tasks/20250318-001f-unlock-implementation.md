# Task 20250318-001f: Unlock Implementation (Phase 5)

**Architectural Authority**: `docs/90-references/consensus-log.md`
**Constraint**: Do not deviate from locked decisions without updating the consensus log.

## Objective

Convert the defensive 503-scaffold into working implementation by integrating verified protocol payloads. This task bridges "scaffold only" to "local publish works" or "full 1:1 call works".

## Prerequisites (ALL Required)

- [ ] Task 20250318-001a completed — Protocol docs exist
- [ ] Task 20250318-001b completed — Payloads captured from Echo Demo
- [ ] Task 20250318-001c completed — Backend scaffold exists
- [ ] Task 20250318-001d completed — Client scaffold exists
- [ ] Task 20250318-001e completed — Repo plumbing exists

⚠️ **Cannot proceed until Echo Demo capture is complete.**

## Deliverables

### Step 1: Document Verified Payloads

Update `docs/realtime-wire-contract.md`:

````markdown
## Wire Format (VERIFIED — Echo Demo Capture)

### 1. POST /realtime/client/v4/apps/{appId}/sessions/new

**Request** (VERIFIED):

```json
[paste verbatim from DevTools]
```
````

**Response** (VERIFIED):

```json
[paste verbatim from DevTools]
```

````

- [ ] Replace all "INFERRED" markers with "VERIFIED" or keep as "INFERRED"
- [ ] Add verbatim JSON from DevTools for each endpoint
- [ ] Document remote offer delivery mechanism (Q8) with evidence

### Step 2: Update Open Questions

Update `docs/realtime-open-questions.md`:

- [ ] Move verified questions from `open` → `verified`
- [ ] Add source citation (Echo Demo capture, timestamp)
- [ ] Keep unverified questions as `open`
- [ ] Mark Q8 as `verified` or `blocked-with-reason`

### Step 3: Uncomment Backend Implementation

Edit `src/worker/index.ts`:

For each route, remove 503 fallback and uncomment verified implementation:

```typescript
// BEFORE (scaffold):
app.post('/api/calls/:callId/session', async (c) => {
  console.error('[BLOCKED] sessions/new needs verification')
  return c.json({ error: 'Protocol verification incomplete' }, 503)
  /*
  const res = await fetch(...)
  ...
  */
})

// AFTER (verified):
app.post('/api/calls/:callId/session', async (c) => {
  const res = await fetch(`${REALTIME_API}/${env.REALTIME_APP_ID}/sessions/new`, {
    method: 'POST',
    headers: headers(env)
  })
  // ... full implementation
})
````

Routes to unlock:

- [ ] `POST /api/calls/:callId/session` — Remove 503, implement sessions/new
- [ ] `POST /api/calls/:callId/publish-offer` — Remove 503, implement tracks/new
- [ ] **Remote subscription initiation** — NEW: Implement the API call that requests subscription Offer from Cloudflare (Q8)
- [ ] `POST /api/calls/:callId/complete-subscribe` — Remove 503, implement renegotiate with Answer

**Critical**: Q8 (remote subscription) is an **orchestration/pull** model—backend must proactively call Cloudflare to request Offer, not wait for push.

Keep 503 only for genuinely unresolved routes (if any).

### Step 4: Implement Full Client Flow

Edit `src/client/main.ts`:

Replace blocked message with full implementation:

```typescript
// BEFORE (scaffold):
log("[BLOCKED] Cannot create session: worker routes return 503")

// AFTER (verified):
async function createSession() {
  const res = await fetch(`/api/calls/${callId}/session`, { method: "POST" })
  const data = await res.json()
  // ... full implementation
}
```

Implement full flow:

- [ ] Call `POST /api/calls/:callId/session`
- [ ] Create offer, call `POST /publish-offer`
- [ ] Set remote description with answer
- [ ] Poll `GET /discover-remote-tracks`
- [ ] Handle remote offer (per verified Q8 mechanism)
- [ ] Call `POST /complete-subscribe` with answer

### Step 5: Update README Status

Edit `README.md`:

```markdown
# telesence

**Status: `full 1:1 call works`**
```

Update sections:

- [ ] Current State — Mark implementation as working
- [ ] Known Blockers — Remove resolved blockers
- [ ] Next Step — Update to next milestone

### Step 6: Test Locally

```bash
pnpm dev
```

- [ ] Worker starts without errors
- [ ] Client loads and can create session
- [ ] Local publish succeeds (camera/mic → Cloudflare)
- [ ] Two tabs can see each other (if Q8 resolved)

## Status Determination

| Status                | Criteria                                                 |
| --------------------- | -------------------------------------------------------- |
| `local publish works` | Tab A can publish tracks to Cloudflare, sees local video |
| `full 1:1 call works` | Tab A and Tab B can see/hear each other                  |

If Q8 (remote offer delivery) remains unresolved:

- Status stays `scaffold only` or moves to `local publish works`
- Document blocker honestly in README and wire-contract

## Acceptance Criteria

- [x] `docs/realtime-wire-contract.md` contains verbatim verified JSON
- [x] `docs/realtime-open-questions.md` shows verified items
- [x] Backend routes implement verified payloads
- [x] Client implements full call flow
- [x] README status updated
- [x] Local test confirms working state (2 tabs, bidirectional video)

## Status

✅ **COMPLETED** — 2026-03-18

**Milestone**: Full 1:1 video calls working between two browser tabs via Cloudflare Realtime SFU.

## Test Results

- ✅ Session creation: `POST /sessions/new`
- ✅ Track publishing: `POST /tracks/new` (push)
- ✅ Track subscription: `POST /tracks/new` (pull) — Q8 resolved
- ✅ Renegotiation: `PUT /renegotiate`
- ✅ Two-tab 1:1 call: Working

## Dependencies

- 20250318-001a-protocol-docs.md ✅
- 20250318-001b-verify-protocol.md ✅
- 20250318-001c-backend-scaffold.md ✅
- 20250318-001d-client-scaffold.md ✅
- 20250318-001e-repo-plumbing.md ✅

## Next Steps

Future tasks:

- Production hardening (Durable Objects, auth, error recovery)
- Feature additions (screen share, chat, mute/unmute)
- Performance optimization
- Deploy to Cloudflare
