# Task 20260321-001d: Budget Ops and Rotation (Phase 4)

**Architectural Authority**: The 2026-03-21 entitlement-budget decisions locked during agent planning.
**Constraint**: This phase is operational hardening after the core model is working.

## Objective

Add the operational surfaces around budget management and secret rotation without changing the already-locked entitlement model.

## Locked Decisions

- [x] Only current secret version is valid after rotation
- [x] Retired secret bytes are dropped immediately
- [x] Secret-version metadata remains available
- [x] Token minting is admin-only
- [x] Initial allowance is env-configured
- [x] Shared global budget remains the rollout model

## Deliverables

### Step 1: Secret Rotation Surface

Add admin-only support for:

- [ ] rotating budget secret version
- [ ] incrementing `currentSecretVersion`
- [ ] retiring old secret bytes immediately
- [ ] preserving version metadata history

### Step 2: Budget Inspection Surface

Add admin-only inspection for:

- [ ] remaining bytes
- [ ] consumed bytes
- [ ] current secret version
- [ ] secret-version metadata history
- [ ] current grace status

### Step 3: Docs

Update documentation for:

- [ ] token format
- [ ] budget secret versioning
- [ ] rotation behavior
- [ ] operational/admin endpoints

## Architecture Constraints (Do NOT Add)

- [ ] No external token history store
- [ ] No historical secret-byte retention beyond current version
- [ ] No multi-budget customer model yet

## Acceptance Criteria

- [ ] Secret rotation works
- [ ] Old tokens fail immediately after rotation
- [ ] Version metadata history remains inspectable
- [ ] Docs reflect operational behavior

## Status

✅ **COMPLETE** — 2026-03-21

All deliverables implemented:

- Secret rotation endpoint at /admin/entitlement/rotate
- Budget inspection endpoint at /admin/entitlement/budget
- Version metadata history preserved
- Old tokens invalidated on rotation
- Documentation updated with token format and rotation behavior
