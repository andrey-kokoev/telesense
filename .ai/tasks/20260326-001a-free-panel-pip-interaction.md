# Task 20260326-001a: Free-Panel PiP Interaction Unification

**Objective**: Replace the current partial PiP interaction work with a coherent free-panel model that supports desktop and touch input, keeps the panel in bounds, and removes gesture-classification ambiguity.

## Current State

The current work-in-progress introduces `usePipFrame.ts` and partially wires it into [`CallMobileLayout.vue`](/home/andrey/src/telesense/apps/telesense/src/client/components/CallMobileLayout.vue), but the behavior is not yet coherent:

- Desktop behavior is incomplete: the composable exposes mouse support, but the component does not bind it.
- Geometry repair is incomplete: edge resize can push the PiP out of bounds.
- Persistence is unstable: frame geometry is stored in raw pixels and is not re-canonicalized on container resize/remount.
- Semantics are mixed: some code still assumes media-aspect-driven behavior instead of free-panel behavior.
- Gesture ownership is incomplete: parent gestures can still compete with PiP interaction.

## Architectural Decision

The PiP is a **free panel**, not a video-shaped object. Its rectangle is the primary object; video content adapts inside it.

This task must implement the following semantics:

- Unified input model: use Pointer Events as the primary interaction layer.
- Gesture ownership: once a PiP gesture begins, the PiP owns the interaction until commit/cancel.
- Gesture mode: fixed at `pointerdown`; no mid-gesture reinterpretation.
- Hit testing: disjoint proportional regions, not overlapping thresholds.
- Move semantics: center region moves the panel.
- Resize semantics: edges resize one axis, corners resize two axes.
- Click suppression: suppress click after movement beyond a small fixed pixel threshold.
- Canonicalization: run on every state change, including init, resize, remount, and gesture updates.
- Persistence: preserve normalized top-left origin and normalized width/height relative to full container width/height.
- No snap restore: do not snap to edges/corners during persistence restore.
- Metadata inertness: video metadata changes do not alter panel geometry.
- Content fitting: video uses `object-fit: cover` inside the panel.

## Constraint

This task must remove semantic ambiguity instead of layering more heuristics onto the current implementation.

Specifically:

- Do not use overlapping edge/corner hit zones.
- Do not preserve media aspect ratio as a panel-geometry rule.
- Do not keep raw-pixel geometry as the sole persisted frame representation.
- Do not keep separate mouse/touch semantics if Pointer Events can express the same behavior.

## Policy Decisions

### 1. Persistence

- Preserve normalized `x`, `y`, `width`, and `height`
- Normalize against full container width/height
- Reapply and canonicalize on resize/remount

### 2. Hit Zones

- Use proportional border bands and corner squares
- Border thickness is `1/6` of panel width/height
- Regions must be disjoint by construction
- Center is the remaining interior region

### 3. Interaction

- Pointer Events with capture
- PiP owns active gesture
- `pointercancel`, blur, or lost capture commits the current canonical frame
- Click is suppressed after drag/resize threshold crossing

### 4. Geometry

- Free-panel resize semantics
- Fixed minimum width/height in px
- Maximum width/height may extend to `100%` of container
- Canonicalization must keep the panel fully visible

### 5. Media

- Panel geometry is independent of media aspect metadata after mount
- Render panel content with `object-fit: cover`

## Deliverables

- [ ] Refactor [`usePipFrame.ts`](/home/andrey/src/telesense/apps/telesense/src/client/composables/usePipFrame.ts) into a pointer-driven free-panel geometry engine
- [ ] Add a single canonicalization path used by init, move, resize, resize/remount restore, and external container changes
- [ ] Replace ambiguous/overlapping hit testing with disjoint proportional regions
- [ ] Wire the PiP panel to unified pointer handlers where PiP appears
- [ ] Ensure desktop drag/resize behavior is actually live, not just exposed by the composable
- [ ] Suppress synthetic click after drag/resize
- [ ] Prevent parent gesture interference during active PiP interaction
- [ ] Store and restore normalized geometry instead of raw pixels alone
- [ ] Ensure media metadata changes do not reshape the panel
- [ ] Run `vp check`

## Scope

**Primary files:**

- `apps/telesense/src/client/composables/usePipFrame.ts`
- `apps/telesense/src/client/components/CallMobileLayout.vue`
- `apps/telesense/src/client/components/CallDesktopLayout.vue`
- `apps/telesense/src/client/views/CallView.vue`

Additional files may be modified if needed to support shared interaction wiring or tests.

## Acceptance Criteria

- [ ] PiP supports desktop and touch manipulation through one coherent interaction model
- [ ] PiP always remains fully inside its container after move, resize, remount, and viewport/container resize
- [ ] Hit classification is total and unambiguous
- [ ] Click/tap behavior is preserved when no drag/resize threshold is crossed
- [ ] Drag/resize does not leak into competing parent gestures
- [ ] Geometry persistence is stable across resize/remount
- [ ] Media metadata changes no longer reshape the panel
- [ ] `vp check` passes

## Status

🟡 **PLANNED** — 2026-03-26
