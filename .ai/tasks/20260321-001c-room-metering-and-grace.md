# Task 20260321-001c: Room Metering and Grace (Phase 3)

**Architectural Authority**: The 2026-03-21 entitlement-budget decisions locked during agent planning.
**Constraint**: This phase adds periodic charging and in-call exhaustion handling on top of the already-working budget foundation.

## Objective

Add periodic room-driven metering, budget exhaustion grace handling, and forced room termination.

## Locked Decisions

- [x] Accounting unit is estimated egress bytes
- [x] Tick interval is `60s`
- [x] One timer per room
- [x] Room computes the usage estimate
- [x] Estimate basis is per published track bitrate class × subscriber count
- [x] No active media means no draw
- [x] One waiting participant with active published media is billable
- [x] Budget stores aggregate counters only
- [x] Aggregate counters include:
  - total estimated egress bytes
  - last charged timestamp
  - grace end timestamp
- [x] If a metering tick cannot reach the budget, fail open briefly and retry on next normal tick
- [x] If requested draw exceeds remaining allowance:
  - consume remaining budget
  - enter grace period
- [x] Exhaustion status is `402 PAYMENT_REQUIRED`
- [x] During grace:
  - notify participants
  - reject new joins
  - show coarse minute countdown
  - terminate at grace end
- [x] UI wording stays product-facing: “service budget”

## Deliverables

### Step 1: Periodic Room Metering

Implement:

- [ ] one timer per active room
- [ ] `60s` tick cadence
- [ ] room-side usage estimation
- [ ] internal charge call by stored `budgetId`
- [ ] no token re-verification on each tick

### Step 2: Budget Aggregate Charging

Budget-side charging must:

- [ ] decrement remaining bytes
- [ ] increment consumed bytes
- [ ] update last charged timestamp
- [ ] enter grace when exhausted

### Step 3: Grace Flow

Implement:

- [ ] authoritative `graceEndsAt` in budget
- [ ] room-side cached grace window
- [ ] new joins rejected during grace
- [ ] in-call banner and countdown
- [ ] termination at grace end

### Step 4: Notification UX

Participants should see:

- [ ] immediate in-call toast on grace entry
- [ ] persistent in-call banner
- [ ] coarse minute countdown

## Architecture Constraints (Do NOT Add)

- [ ] No per-draw persistent event history
- [ ] No budget DO tracking of active room ids
- [ ] No client-billed authority

## Acceptance Criteria

- [ ] Rooms meter once per tick
- [ ] Usage is charged against stored `budgetId`
- [ ] Exhaustion enters grace correctly
- [ ] New joins are rejected during grace
- [ ] Rooms terminate when grace expires

## Status

🟡 **PLANNED** — 2026-03-21

## Next Step

After completion: `20260321-001d-budget-ops-and-rotation.md`
