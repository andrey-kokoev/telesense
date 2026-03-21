# Task 20260321-001a: Service Entitlement Rename (Phase 1)

**Architectural Authority**: The 2026-03-21 entitlement-budget decisions locked during agent planning.
**Constraint**: This phase is terminology and surface alignment only. Do not introduce budget metering behavior here.

## Objective

Rename the current generic creator/auth token surface to `serviceEntitlementToken` so the codebase reflects the real concept:

- it is not user identity
- it is not participant identity
- it is proof of right to consume service

## Deliverables

### Rename Across Current Surface

- [ ] `apps/telesense/src/worker/index.ts`
- [ ] `apps/telesense/src/client/composables/useAppStore.ts`
- [ ] `apps/telesense/src/client/views/LandingView.vue`
- [ ] `apps/telesense/src/client/composables/useCallSession.ts`
- [ ] `apps/telesense/src/client/i18n/messages.ts`
- [ ] `apps/telesense/README.md`
- [ ] deploy/env configuration

### Required Naming Targets

- [ ] env name: `SERVICE_ENTITLEMENT_TOKEN`
- [ ] header name: `X-Service-Entitlement-Token`
- [ ] error-code family: `SERVICE_ENTITLEMENT_*`
- [ ] client state: `serviceEntitlementToken`
- [ ] client verification flag: `serviceEntitlementTokenVerified`

## Architecture Constraints (Do NOT Add)

- [ ] No `EntitlementBudget` DO yet
- [ ] No token mint endpoint yet
- [ ] No metering logic yet
- [ ] No grace-period flow yet

## Acceptance Criteria

- [ ] Current token surface is renamed coherently
- [ ] Worker accepts `X-Service-Entitlement-Token`
- [ ] Docs and UI wording reflect service entitlement semantics
- [ ] Existing behavior remains unchanged

## Status

✅ **COMPLETE** — 2026-03-21

All renaming completed:

- Environment variables renamed
- HTTP headers renamed
- Error codes renamed
- Client state renamed
- Function names renamed
- Documentation updated

## Next Step

After completion: `20260321-001b-entitlement-budget-foundation.md`
