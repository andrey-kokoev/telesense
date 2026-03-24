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

## Deliverables

- [ ] Add `--radius-pill: 9999px` (or appropriate value)
- [ ] Add `--color-text-secondary-faded: color-mix(...)`
- [ ] Add `--font-mono-display: "Geist Mono", var(--font-mono)`
- [ ] Replace all hardcoded instances with new tokens
- [ ] Consider adding `--shadow-inset` for the repeated inset shadow pattern

## Scope

**Files to modify:**

- `apps/telesense/public/tokens.css`
- `apps/telesense/src/client/components/callLayoutShared.css`
- Various Vue SFC files

## Acceptance Criteria

- [ ] New tokens defined in `tokens.css`
- [ ] All instances use tokens instead of magic values
- [ ] No visual regressions

## Status

🟡 **PLANNED** — 2026-03-21
