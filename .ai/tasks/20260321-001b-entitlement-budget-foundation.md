# Task 20260321-001b: Entitlement Budget Foundation (Phase 2)

**Architectural Authority**: The 2026-03-21 entitlement-budget decisions locked during agent planning.
**Constraint**: This phase introduces the durable budget model and stateless token model, but not periodic metering yet.

## Objective

Introduce the durable entitlement budget layer and stateless service entitlement tokens in the simplest coherent form.

Current rollout assumptions:

- one shared global budget
- many equivalent valid tokens
- no external token registry

## Locked Decisions

- [x] Durable object name is `EntitlementBudget`
- [x] Current rollout uses one shared global budget
- [x] Token is stateless and self-routing
- [x] Token envelope is `budgetId.secretVersion.claims.proof`
- [x] Claims are compact base64url JSON
- [x] Proof scheme is `HMAC-SHA256`
- [x] Claims include:
  - `tokenFormatVersion`
  - `issuedAt`
- [x] No `exp` in initial rollout
- [x] `tokenFormatVersion = 1`
- [x] `secretVersion` increments from `1`
- [x] One random secret per secret version
- [x] Only current secret version is valid after rotation
- [x] Retired secret bytes are dropped immediately
- [x] Secret-version metadata may remain

## Deliverables

### Step 1: Add `EntitlementBudget` DO

Implement durable state for:

- [ ] budget id
- [ ] remaining allowance
- [ ] consumed allowance
- [ ] current secret version
- [ ] secret-version metadata history
- [ ] current secret material

Expected state shape:

```typescript
type SecretVersionRecord = {
  version: number
  createdAt: number
  retiredAt?: number
  secret?: string
}

type EntitlementBudgetState = {
  budgetId: string
  remainingBytes: number
  consumedBytes: number
  currentSecretVersion: number
  secretVersions: SecretVersionRecord[]
}
```

### Step 2: Add Stateless Token Helpers

Implement helper code for:

- [ ] minting `budgetId.secretVersion.claims.proof`
- [ ] parsing token segments
- [ ] verifying HMAC-SHA256 proof
- [ ] extracting:
  - `budgetId`
  - `secretVersion`
  - `tokenFormatVersion`
  - `issuedAt`

### Step 3: Add Admin Mint Endpoint

Add an admin-only worker route that:

- [ ] creates or uses the shared global budget
- [ ] mints token using newest secret version
- [ ] returns minted token only at issuance time

### Step 4: Bind Rooms to Budget

Room/session admission must:

- [ ] verify `serviceEntitlementToken`
- [ ] extract `budgetId`
- [ ] persist `budgetId` on room activation
- [ ] continue using stored `budgetId` for all later joins
- [ ] ignore later tokens for budget routing once room is active
- [ ] treat inactive-room reactivation as fresh affiliation

### Step 5: Add Entry-Time Budget Depletion Check

Before activating a room or admitting a new first entrant:

- [ ] check whether the addressed budget can still serve usage
- [ ] surface “valid token but exhausted service budget” distinctly

This phase stops at admission-time enforcement. It does not meter active calls yet.

## Architecture Constraints (Do NOT Add)

- [ ] No D1 or KV token registry
- [ ] No periodic metering yet
- [ ] No grace-period flow yet
- [ ] No budget takeover by later token

## Acceptance Criteria

- [ ] `EntitlementBudget` DO exists
- [ ] Admin endpoint can mint a valid token
- [ ] Token verification is stateless
- [ ] Rooms bind and store `budgetId`
- [ ] Exhausted budgets are blocked at room activation time

## Status

✅ **COMPLETE** — 2026-03-21

> **Note**: See [001e-entitlement-rollout-review.md](./20260321-001e-entitlement-rollout-review.md) for reconciliation rationale.

All deliverables implemented:

- EntitlementBudget DO exists
- Stateless token helpers (mint/verify with HMAC-SHA256)
- Admin mint endpoint at /admin/entitlement/mint
- Room-to-budget binding on activation
- Entry-time budget depletion check

## Next Step

After completion: `20260321-001c-room-metering-and-grace.md`
