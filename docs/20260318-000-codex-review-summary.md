# Codex Review Consensus Log

**Purpose**: Record architectural decisions validated through AI review loop to prevent re-debate.

## Final Consensus (2026-03-18)

| Topic | Kimi Position | Codex Position | Resolution |
|-------|---------------|----------------|------------|
| Web Workers | Include for Dialpad fidelity | Omit for zero-to-one | **Codex won** — Workers are Phase 2 |
| RealtimeKit vs raw API | Raw API for control | Raw API for honesty | **Agreed** — No SDK abstractions |
| In-memory state | Mark as dev-only | Mark as dev-only + leak guard | **Codex won** — Add 1000-call warning |
| Protocol verification | Infer and code | Block until captured | **Codex won** — Return 503 pending capture |
| File splitting | Split now | Single file until verified | **Codex won** — One file during discovery |

## Corrections Applied (2026-03-18)

| Correction | Previous (Wrong) | Current (Correct) | Impact |
|------------|------------------|-------------------|--------|
| Repository | `cloudflare/calls-demo` (404) | `cloudflare/realtime-examples` | Fixed source reference |
| Remote subscription model | Push (webhook/polling) | **Orchestration (pull)** | Q8 investigation method changed—look for explicit API call |

**Critical insight**: Backend must **proactively initiate** subscription by calling Cloudflare API to request an Offer for remote tracks—not wait for Cloudflare to push.

## Remaining Disagreement

None. Both agents agree scaffold is ready for Echo Demo verification.

---

## Rationale for Key Decisions

### Why Block at 503 (not implement guesses)

**Codex argument**: If we guess the payload shape, we create a false sense of progress ("code compiles"). Then when Echo Demo reveals a mismatch, we've wasted time on untestable code. Better to:
- Return 503 (Service Unavailable) on all Cloudflare-facing routes
- Paste actual JSON from Echo Demo into `realtime-wire-contract.md`
- Then uncomment the implementation sections

**Kimi's initial worry**: Feels like procrastination. Codex countered: It's not procrastination, it's epistemic honesty. We *don't know* the shapes yet.

**Decision**: Codex approach adopted. Return 503 pending verification.

### Why not Web Workers (main-thread only for v1)

**Kimi argument**: Dialpad uses Workers extensively; we should include them for parity.

**Codex argument**: 
- Workers are optimization, not correctness requirement
- We have no MediaStream composition yet (no need to run encoding off main thread)
- If we include Workers now, we add complexity for a problem we don't have yet
- Post-verification, we can add Workers without changing API surface

**Decision**: Codex approach adopted. Main-thread for v1; Workers are Phase 2.

### Why single-file Worker (not split into layers)

**Kimi argument**: We should split into `realtime-api.ts` + `call-state.ts` + `routes.ts` from day one.

**Codex argument**:
- Once we know the protocol, splitting is trivial (few dependencies)
- Before we know the protocol, splitting is guesswork (wrong boundaries)
- Keep all logic in one file to see patterns emerge from actual Echo Demo data

**Decision**: Codex approach adopted. Single file during discovery; split after protocol lock.

### Why in-memory `Map` (not Durable Objects yet)

**Kimi argument**: Should use Durable Objects for state durability.

**Codex argument**:
- Durable Objects add observability complexity (when does state sync? Where do failures hide?)
- Protocol discovery doesn't require durability
- Once we know the happy path, we can evaluate durability strategy

**Kimi refinement**: Add a 1000-call warning to catch leaks early.

**Decision**: In-memory with leak guard. Durable Objects post-verification.

---

## What This Means Going Forward

If you (or another agent) encounter future pull requests that propose:

- ✅ **"Let's verify Q8 against Echo Demo capture"** → Accept (in-scope)
- ✅ **"Q4 (SDP wrapping) is confirmed, let's uncomment the impl"** → Accept (in-scope)
- ❌ **"Let's include Web Workers for performance"** → Refer back here (Phase 2)
- ❌ **"Let's split Worker into layers now"** → Refer back here (post-verification)
- ❌ **"Let's guess at Q8 and code to it"** → Refer back here (anti-pattern, blocks learning)

This log serves as a decision cache to prevent infinite re-debate.
