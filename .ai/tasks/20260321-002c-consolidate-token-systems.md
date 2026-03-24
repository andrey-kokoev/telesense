# Task 20260321-002c: Consolidate Token Systems

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

## Dependencies

- Must execute **after 002b** (clean globals.css) to avoid merge conflicts on `globals.css`.
- Must execute **before 002d** (add common tokens) to establish the canonical token system.

## Coordination Note

⚠️ **Shared File Warning**: This task modifies `globals.css` which 002b also touches. Do not start until 002b is complete and committed.

⚠️ **Downstream Impact**: This task establishes `--color-*` as the canonical system. Task 002d must use this system, not introduce `--ui-*` tokens.

## Execution Order

Execute third, after 002a and 002b are complete.

## Common Misinterpretations

- **Deleting tokens without updating references**: 50+ Vue file references will break. Update ALL usages before/concurrently with removing definitions.
- **Using hardcoded colors**: Replace `var(--ui-text-muted)` with `var(--color-text-secondary)`, NOT with `#666`
- **Both systems coexist**: Must result in SINGLE system, not documented coexistence

## Current Token Mapping Required

```
--ui-primary → --color-accent
--ui-bg → --color-bg-primary
--ui-text → --color-text-primary
--ui-text-muted → --color-text-secondary
--ui-border → --color-border
--ui-success/error/danger → need semantic tokens
```

## Files with --ui-\* Usage

- `VerticalToggle.vue` (10+ references - HEAVIEST USER)
- `ToastContainer.vue` (success/error + keyframes)
- `RecentRoomBody.vue`, `RecentRoomItem.vue`, `RecentRoomsSection.vue`
- `callLayoutShared.css` (line 223)

## Deliverables

- [x] Audit all uses of `--ui-*` tokens across the codebase
- [x] Replace `--ui-*` with corresponding `--color-*` tokens
- [x] Remove `--ui-*` definitions from `tokens.css`
- [x] Update dark mode to only need `--color-*` overrides
- [x] Verify no visual regressions

## Scope

**Files to modify:**

- `apps/telesense/public/tokens.css`
- `apps/telesense/public/globals.css`
- All Vue SFC files using `--ui-*` tokens

## Acceptance Criteria

- [x] Only one token system remains
- [x] Dark mode continues to work
- [x] No `--ui-*` references in codebase

## Status

🟢 **COMPLETED** — 2026-03-24
