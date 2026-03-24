# Task 20260321-002d: Audit Vue Scoped CSS for Shared Patterns

**Objective**: Identify and extract common patterns from Vue SFC scoped styles.

## Current State

Large scoped CSS blocks in Vue files:

- `LandingView.vue`: 776 lines total (likely ~300+ CSS)
- `CallMobileLayout.vue`: 653 lines (imports shared but has ~200 scoped)
- `CallDesktopLayout.vue`: 559 lines (imports shared but has ~150 scoped)

Likely duplications:

- Flexbox layout patterns
- Button styles
- Input styles
- Card/container patterns

## Deliverables

- [ ] Audit scoped CSS in all major Vue files
- [ ] Identify patterns that appear in 2+ files
- [ ] Extract common patterns to `globals.css` or new utility classes
- [ ] Replace scoped duplicates with shared classes
- [ ] Measure CSS size reduction

## Scope

**Files to analyze:**

- `apps/telesense/src/client/views/LandingView.vue`
- `apps/telesense/src/client/views/CallView.vue`
- `apps/telesense/src/client/components/CallMobileLayout.vue`
- `apps/telesense/src/client/components/CallDesktopLayout.vue`

## Acceptance Criteria

- [ ] Common patterns extracted to shared CSS
- [ ] Scoped CSS reduced where possible
- [ ] No visual regressions
- [ ] Document patterns for future use

## Status

🟡 **PLANNED** — 2026-03-21
