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

## Dependencies

- **None** - This is the first task to execute. It makes isolated changes.

## Execution Order

Execute first. Changes are localized to keyframe definitions only.

## Common Misinterpretations

**Keyframes that are NOT duplicates** (keep as-is):

- `slideIn` in ToastContainer.vue (used for toast animations)
- `landing-code-caret-blink` in RoomCodeSection.vue (used for caret)

**Risk:** Moving keyframes TO `callLayoutShared.css` instead of consolidating TO `globals.css`

## Deliverables

- [x] Audit all keyframe definitions across CSS files
- [x] Keep keyframes only in `globals.css` (the global entry point)
- [x] Remove duplicate from `callLayoutShared.css`
- [x] Verify spinners still animate correctly

## Scope

**Files to modify:**

- `apps/telesense/public/globals.css`
- `apps/telesense/src/client/components/callLayoutShared.css`

## Acceptance Criteria

- [x] Only one `spin` keyframe definition exists
- [x] Loading spinners work in both mobile and desktop layouts
- [x] No visual regressions

## Status

🟢 **COMPLETED** — 2026-03-24
