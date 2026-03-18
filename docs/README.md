# Telesense Documentation

**Project**: Cloudflare Realtime 1:1 Video Calls  
**Status**: ✅ Full 1:1 call works (verified 2026-03-18)

## Quick Navigation

| Document | Purpose | Audience |
|----------|---------|----------|
| [20260318-000-codex-review-summary.md](./20260318-000-codex-review-summary.md) | Architectural decisions & rationale | Developers, AI agents |
| [20260318-001-realtime-wire-contract.md](./20260318-001-realtime-wire-contract.md) | Verified API payloads & protocol | Backend developers |
| [20260318-002-realtime-open-questions.md](./20260318-002-realtime-open-questions.md) | Q&A tracking (Q8 resolved) | All developers |

## Documentation Philosophy

1. **Verification-first**: No implementation without captured payloads
2. **Consensus-locked**: Decisions in `000-*` are frozen to prevent re-debate
3. **Evidence-based**: All protocol claims have verbatim JSON from Echo Demo

## Task Tracking

Granular tasks in `.ai/tasks/`:

| Task | Status | Description |
|------|--------|-------------|
| 20250318-001a-protocol-docs.md | ✅ | Create protocol documentation |
| 20250318-001b-verify-protocol.md | ✅ | Verify from Echo Demo |
| 20250318-001c-backend-scaffold.md | ✅ | Backend scaffold |
| 20250318-001d-client-scaffold.md | ✅ | Client scaffold |
| 20250318-001e-repo-plumbing.md | ✅ | Project configuration |
| 20250318-001f-unlock-implementation.md | ✅ | Full implementation |

## Key Findings Summary

### Q8: Remote Subscription — RESOLVED ⭐

**Discovery**: Same endpoint, different location

```http
# Push (publish)
POST /tracks/new
{ "location": "local", ... } → Returns Answer

# Pull (subscribe)  
POST /tracks/new
{ "location": "remote", ... } → Returns Offer
```

**Architecture**: Orchestration/pull model — backend proactively requests Offer from Cloudflare.

## API Base URL

```
https://rtc.live.cloudflare.com/v1/apps/{APP_ID}
```

**Not** `realtime.cloudflare.com` (different API).

## Verification Status

| Question | Status | Evidence |
|----------|--------|----------|
| sessions/new | ✅ Verified | Empty body, returns `{sessionId}` |
| tracks/new (push) | ✅ Verified | `location: "local"` → Answer |
| tracks/new (pull) | ✅ Verified | `location: "remote"` → Offer |
| renegotiate | ✅ Verified | PUT with Answer |
| Q8 mechanism | ✅ Resolved | Pull model confirmed |
| E2E test | ✅ Automated | Playwright 1:1 call test |

## Automated Testing

E2E tests in `e2e/` using Playwright:
```bash
pnpm test      # Run automated 1:1 call test
pnpm test:ui   # Interactive mode
```

Tests verify:
- Session creation
- Track publishing
- Discovery & subscription
- Bidirectional media flow

## Contributing

When updating documentation:
1. Mark inferred vs verified claims clearly
2. Add verbatim JSON for any new endpoints
3. Update consensus log if architectural decisions change
4. Keep task files in sync with actual implementation
