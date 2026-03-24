# Task 20260321-002c: Add Common Pattern Tokens

**Objective**: Extract frequently repeated magic values into semantic tokens.

## Current State

Repeated patterns without tokens:

```css
/* "Pill" radius - appears 10+ times */
border-radius: 999px;

/* Faded text color - appears 3+ times */
color-mix(in srgb, var(--color-text-secondary) 70%, transparent);

/* Font stack - appears 4+ times */
font-family: "Geist Mono", var(--font-mono);
```

## Dependencies

- Must execute **after 002c** (token consolidation) to ensure new tokens use the canonical `--color-*` system.

## Constraint

All new tokens must use the `--color-*` naming convention established by 002c. Do NOT introduce new `--ui-*` tokens.

## Execution Order

Execute fourth, after 002c is complete.

## Common Misinterpretations

- **Tokens without replacement**: Adding `--radius-pill` but leaving `border-radius: 9999px` hardcoded in 15 places
- **Using opacity instead of color-mix**: `opacity: 0.72` affects entire element; use `color-mix(in srgb, var(--color-text-secondary) 72%, transparent)`
- **Creating --ui-\* tokens**: Must use `--color-*` naming only (established by 002c)

## Deliverables

- [x] Add `--radius-pill: 9999px` (or appropriate value)
- [x] Add `--color-text-secondary-faded: color-mix(...)`
- [x] Add `--font-mono-display: "Geist Mono", var(--font-mono)`
- [x] Replace all hardcoded instances with new tokens
- [x] Consider adding `--shadow-inset` for the repeated inset shadow pattern

## Scope

**Files to modify:**

- `apps/telesense/public/tokens.css`
- `apps/telesense/src/client/components/callLayoutShared.css`
- Various Vue SFC files

## Acceptance Criteria

- [x] New tokens defined in `tokens.css`
- [x] All instances use tokens instead of magic values
- [x] No visual regressions

## Status

🟢 **COMPLETED** — 2026-03-24
