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

## Deliverables

- [ ] Audit which `.header`, `.card*` classes are still used
- [ ] Fix `.input-group` duplicate definition
- [ ] Remove confirmed orphaned classes
- [ ] Verify `.btn-sm` usage (keep if used, document if kept for future)
- [ ] Add comments for remaining classes explaining usage

## Scope

**Files to modify:**

- `apps/telesense/public/globals.css`
- Search across all Vue files for class usage

## Acceptance Criteria

- [ ] No duplicate CSS definitions
- [ ] Orphaned code removed
- [ ] No visual regressions
- [ ] CSS file size reduced

## Status

🟡 **PLANNED** — 2026-03-21
