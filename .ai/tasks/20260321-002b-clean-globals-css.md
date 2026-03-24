# Task 20260321-002e: Clean globals.css Legacy Code

**Objective**: Remove orphaned and duplicate CSS from globals.css.

## Current State

Issues in `globals.css`:

1. **Duplicate definition** (lines 66-68 and 138-142):

```css
.input-group { ... } /* defined twice with different properties */
```

2. **Likely orphaned classes** (from old landing page):

```css
.header { ... }
.header h1 { ... }
.header .subtitle { ... }
.card { ... }
.card-title { ... }
.card-description { ... }
```

3. **Potentially unused button size**:

```css
.btn-sm { ... } /* defined but .btn-lg is used more */
```

## Dependencies

- Should execute after **002b** (keyframes dedupe) if that task modifies `globals.css`.
- Must execute **before 002c** (token consolidation) to avoid merge conflicts on `globals.css`.

## Coordination Note

⚠️ **Shared File Warning**: This task and 002c both modify `globals.css`. Execute this task first, complete it, and commit before starting 002a.

## Execution Order

Execute second, immediately after 002a.

## Common Misinterpretations

- **Deleting classes without verification**: Use `grep -r "class=\"header\"" apps/telesense/src/` to verify usage first
- **Deleting `.btn-sm`**: Task says "verify usage (keep if used, document if kept for future)" - check if intentionally kept
- **Wrong duplicate removal**: Two `.input-group` definitions exist - determine which is actually used before removing

## Deliverables

- [x] Audit which `.header`, `.card*` classes are still used
- [x] Fix `.input-group` duplicate definition
- [x] Remove confirmed orphaned classes
- [x] Verify `.btn-sm` usage (keep if used, document if kept for future)
- [x] Add comments for remaining classes explaining usage

## Scope

**Files to modify:**

- `apps/telesense/public/globals.css`
- Search across all Vue files for class usage

## Acceptance Criteria

- [x] No duplicate CSS definitions
- [x] Orphaned code removed
- [x] No visual regressions
- [x] CSS file size reduced

## Status

🟢 **COMPLETED** — 2026-03-24
