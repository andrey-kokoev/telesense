# Task 20260321-002a: Consolidate Token Systems

**Objective**: Merge the overlapping `--ui-*` and `--color-*` token systems into a single, coherent naming convention.

## Current State

Two parallel token systems exist in `tokens.css`:

```css
/* System 1: --ui-* (legacy) */
--ui-bg: var(--color-tan-50);
--ui-text: #1a1a1a;
--ui-primary: var(--color-yellow-600);

/* System 2: --color-* (preferred, works with dark mode) */
--color-bg-primary: var(--color-tan-50);
--color-text-primary: #1a1a1a;
--color-accent: var(--color-yellow-600);
```

## Deliverables

- [ ] Audit all uses of `--ui-*` tokens across the codebase
- [ ] Replace `--ui-*` with corresponding `--color-*` tokens
- [ ] Remove `--ui-*` definitions from `tokens.css`
- [ ] Update dark mode to only need `--color-*` overrides
- [ ] Verify no visual regressions

## Scope

**Files to modify:**

- `apps/telesense/public/tokens.css`
- `apps/telesense/public/globals.css`
- All Vue SFC files using `--ui-*` tokens

## Acceptance Criteria

- [ ] Only one token system remains
- [ ] Dark mode continues to work
- [ ] No `--ui-*` references in codebase

## Status

🟡 **PLANNED** — 2026-03-21
