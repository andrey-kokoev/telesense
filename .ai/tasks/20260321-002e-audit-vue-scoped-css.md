# Task 20260321-002e: Audit Vue Scoped CSS for Shared Patterns

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

## Dependencies

- Should execute **after 002d** (add common tokens) to use the established token system for any new utility classes.
- Can execute in parallel with 002c if coordination is managed.

## Constraint

Any new utility classes created must use the `--color-*` token system established by 002c and 002d.

## Execution Order

Execute fifth and final, after 002d is complete.

## Common Misinterpretations

- **Extracting generic properties**: Don't create `.flex` utility - extract SEMANTIC patterns (e.g., `.video-card`, `.control-button`)
- **Moving component-specific styles**: Only TRUE cross-cutting concerns should be global
- **Not measuring**: Actually run `vp build` and compare CSS bundle size before/after

## Deliverables

- [x] Audit scoped CSS in all major Vue files
- [x] Identify patterns that appear in 2+ files
- [x] Extract common patterns to `globals.css` or new utility classes
- [x] Replace scoped duplicates with shared classes
- [x] Measure CSS size reduction

## Scope

**Files to analyze:**

- `apps/telesense/src/client/views/LandingView.vue`
- `apps/telesense/src/client/views/CallView.vue`
- `apps/telesense/src/client/components/CallMobileLayout.vue`
- `apps/telesense/src/client/components/CallDesktopLayout.vue`

## Acceptance Criteria

- [x] Common patterns extracted to shared CSS
- [x] Scoped CSS reduced where possible
- [x] No visual regressions
- [x] Document patterns for future use

## Status

🟢 **COMPLETED** — 2026-03-24
