# Task 20260321-002b: Deduplicate Animation Keyframes

**Objective**: Remove duplicate `@keyframes` definitions and consolidate to single sources.

## Current State

`@keyframes spin` is defined in:

1. `globals.css` (line 262)
2. `callLayoutShared.css` (line 226)

Both are identical:

```css
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
```

## Deliverables

- [ ] Audit all keyframe definitions across CSS files
- [ ] Keep keyframes only in `globals.css` (the global entry point)
- [ ] Remove duplicate from `callLayoutShared.css`
- [ ] Verify spinners still animate correctly

## Scope

**Files to modify:**

- `apps/telesense/public/globals.css`
- `apps/telesense/src/client/components/callLayoutShared.css`

## Acceptance Criteria

- [ ] Only one `spin` keyframe definition exists
- [ ] Loading spinners work in both mobile and desktop layouts
- [ ] No visual regressions

## Status

🟡 **PLANNED** — 2026-03-21
