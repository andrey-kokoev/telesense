import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue"
import type { CSSProperties, Ref } from "vue"

const STORAGE_KEY = "telesense-pip-geometry"
const CLICK_THRESHOLD_PX = 8
const DOUBLE_ACTIVATE_THRESHOLD_MS = 300
const MIN_SIZE_PX = 120
const DEFAULT_WIDTH_RATIO = 0.25
const DEFAULT_HEIGHT_RATIO = 0.22
const BORDER_BAND_RATIO = 1 / 6
const DEFAULT_INSET_PX = 14.4

interface NormalizedFrame {
  nx: number // normalized x (0-1 relative to container width)
  ny: number // normalized y (0-1 relative to container height)
  nw: number // normalized width (0-1 relative to container width)
  nh: number // normalized height (0-1 relative to container height)
}

interface Frame extends NormalizedFrame {
  x: number // pixel values
  y: number
  width: number
  height: number
}

type ZoneType = "center" | "corner" | "edge"
type CornerHV = { h: "left" | "right"; v: "top" | "bottom" }
type EdgeSide = "left" | "right" | "top" | "bottom"

interface Zone {
  type: ZoneType
  corner?: CornerHV
  edge?: EdgeSide
}

interface MoveGesture {
  type: "move"
  startPointerX: number
  startPointerY: number
  startFrameX: number
  startFrameY: number
}

interface CornerGesture extends CornerHV {
  type: "corner"
  anchorX: number // container-relative
  anchorY: number // container-relative
  handleOffsetX: number
  handleOffsetY: number
}

interface EdgeGesture {
  type: "edge"
  side: EdgeSide
  anchor: number // container-relative
  handleOffset: number
}

type Gesture = MoveGesture | CornerGesture | EdgeGesture

interface GestureState {
  gesture: Gesture
  containerRect: DOMRect
  startFrame: Frame
  hasMoved: boolean
  startPointerX: number // viewport coordinate
  startPointerY: number // viewport coordinate
}

// Module-level flag to suppress next click (cleared after consumption)
let suppressNextClick = false

function loadPersistedFrame(): NormalizedFrame | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<NormalizedFrame>
    if (
      typeof parsed.nx === "number" &&
      typeof parsed.ny === "number" &&
      typeof parsed.nw === "number" &&
      typeof parsed.nh === "number" &&
      !Number.isNaN(parsed.nx) &&
      !Number.isNaN(parsed.ny) &&
      !Number.isNaN(parsed.nw) &&
      !Number.isNaN(parsed.nh)
    ) {
      return { nx: parsed.nx, ny: parsed.ny, nw: parsed.nw, nh: parsed.nh }
    }
  } catch {
    // ignore
  }
  return null
}

function savePersistedFrame(frame: NormalizedFrame): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(frame))
  } catch {
    // ignore
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function detectZone(ox: number, oy: number, w: number, h: number): Zone {
  // Border bands are 1/6 of panel dimensions
  const bandX = w * BORDER_BAND_RATIO
  const bandY = h * BORDER_BAND_RATIO

  const isLeft = ox < bandX
  const isRight = ox > w - bandX
  const isTop = oy < bandY
  const isBottom = oy > h - bandY

  // Corners: disjoint by construction (overlapping regions are corners)
  if (isLeft && isTop) return { type: "corner", corner: { h: "left", v: "top" } }
  if (isRight && isTop) return { type: "corner", corner: { h: "right", v: "top" } }
  if (isLeft && isBottom) return { type: "corner", corner: { h: "left", v: "bottom" } }
  if (isRight && isBottom) return { type: "corner", corner: { h: "right", v: "bottom" } }

  // Edges: only when in one band but not corner
  if (isLeft) return { type: "edge", edge: "left" }
  if (isRight) return { type: "edge", edge: "right" }
  if (isTop) return { type: "edge", edge: "top" }
  if (isBottom) return { type: "edge", edge: "bottom" }

  return { type: "center" }
}

function canonicalizeFrame(frame: Frame, containerWidth: number, containerHeight: number): Frame {
  const minW = Math.min(MIN_SIZE_PX, containerWidth)
  const minH = Math.min(MIN_SIZE_PX, containerHeight)

  // Clamp size
  const width = clamp(frame.width, minW, containerWidth)
  const height = clamp(frame.height, minH, containerHeight)

  // Clamp position to keep fully visible
  const x = clamp(frame.x, 0, Math.max(0, containerWidth - width))
  const y = clamp(frame.y, 0, Math.max(0, containerHeight - height))

  // Recompute normalized values
  const nx = containerWidth > 0 ? x / containerWidth : 0
  const ny = containerHeight > 0 ? y / containerHeight : 0
  const nw = containerWidth > 0 ? width / containerWidth : DEFAULT_WIDTH_RATIO
  const nh = containerHeight > 0 ? height / containerHeight : DEFAULT_HEIGHT_RATIO

  return { x, y, width, height, nx, ny, nw, nh }
}

function computeInitialFrame(
  containerWidth: number,
  containerHeight: number,
  persisted: NormalizedFrame | null,
): Frame {
  if (persisted) {
    // Restore from persisted normalized values
    const x = persisted.nx * containerWidth
    const y = persisted.ny * containerHeight
    const width = persisted.nw * containerWidth
    const height = persisted.nh * containerHeight
    return canonicalizeFrame(
      {
        x,
        y,
        width,
        height,
        nx: persisted.nx,
        ny: persisted.ny,
        nw: persisted.nw,
        nh: persisted.nh,
      },
      containerWidth,
      containerHeight,
    )
  }

  // Default: bottom-right position
  const width = Math.min(MIN_SIZE_PX * 2, containerWidth * DEFAULT_WIDTH_RATIO)
  const height = Math.min(MIN_SIZE_PX * 2, containerHeight * DEFAULT_HEIGHT_RATIO)
  const x = Math.max(0, containerWidth - width - DEFAULT_INSET_PX)
  const y = Math.max(0, containerHeight - height - DEFAULT_INSET_PX)

  return canonicalizeFrame(
    {
      x,
      y,
      width,
      height,
      nx: x / containerWidth,
      ny: y / containerHeight,
      nw: width / containerWidth,
      nh: height / containerHeight,
    },
    containerWidth,
    containerHeight,
  )
}

export function usePipFrame(containerRef: Ref<HTMLElement | null>) {
  const frame = ref<Frame>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    nx: 0,
    ny: 0,
    nw: DEFAULT_WIDTH_RATIO,
    nh: DEFAULT_HEIGHT_RATIO,
  })
  const initialized = ref(false)
  const gestureState = shallowRef<GestureState | null>(null)
  const isDragging = computed(() => gestureState.value !== null)
  const lastClickAt = ref(0)

  const style = computed<CSSProperties>(() => {
    if (!initialized.value) return { visibility: "hidden" }
    const { x, y, width, height } = frame.value
    return {
      position: "absolute",
      left: `${x}px`,
      top: `${y}px`,
      width: `${width}px`,
      height: `${height}px`,
      right: "unset",
      bottom: "unset",
      touchAction: "none", // Prevent browser gesture interference
      userSelect: "none",
    }
  })

  function getContainerRect(): { width: number; height: number } | null {
    const container = containerRef.value
    if (!container) return null
    const rect = container.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  }

  function init(): void {
    const rect = getContainerRect()
    if (!rect) return

    const persisted = loadPersistedFrame()
    frame.value = computeInitialFrame(rect.width, rect.height, persisted)
    initialized.value = true
  }

  function canonicalize(): void {
    const rect = getContainerRect()
    if (!rect) return
    frame.value = canonicalizeFrame(frame.value, rect.width, rect.height)
  }

  function persist(): void {
    const { nx, ny, nw, nh } = frame.value
    savePersistedFrame({ nx, ny, nw, nh })
  }

  function resetToDefault(): void {
    const rect = getContainerRect()
    if (!rect) return
    frame.value = computeInitialFrame(rect.width, rect.height, null)
    initialized.value = true
    persist()
  }

  function startGesture(pointerX: number, pointerY: number, target: HTMLElement): boolean {
    const container = containerRef.value
    if (!container) return false

    if (!initialized.value) {
      init()
    }

    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()

    // Calculate pointer position relative to the PiP element
    const ox = pointerX - targetRect.left
    const oy = pointerY - targetRect.top
    const relX = pointerX - containerRect.left
    const relY = pointerY - containerRect.top

    const zone = detectZone(ox, oy, targetRect.width, targetRect.height)
    const f = frame.value

    let gesture: Gesture

    if (zone.type === "center") {
      gesture = {
        type: "move",
        startPointerX: pointerX,
        startPointerY: pointerY,
        startFrameX: f.x,
        startFrameY: f.y,
      }
    } else if (zone.type === "corner" && zone.corner) {
      const { h, v } = zone.corner
      const handleX = h === "left" ? f.x : f.x + f.width
      const handleY = v === "top" ? f.y : f.y + f.height
      gesture = {
        type: "corner",
        h,
        v,
        anchorX: h === "left" ? f.x + f.width : f.x,
        anchorY: v === "top" ? f.y + f.height : f.y,
        handleOffsetX: handleX - relX,
        handleOffsetY: handleY - relY,
      }
    } else if (zone.type === "edge" && zone.edge) {
      const side = zone.edge
      if (side === "left") {
        gesture = {
          type: "edge",
          side,
          anchor: f.x + f.width,
          handleOffset: f.x - relX,
        }
      } else if (side === "right") {
        gesture = {
          type: "edge",
          side,
          anchor: f.x,
          handleOffset: f.x + f.width - relX,
        }
      } else if (side === "top") {
        gesture = {
          type: "edge",
          side,
          anchor: f.y + f.height,
          handleOffset: f.y - relY,
        }
      } else {
        gesture = {
          type: "edge",
          side,
          anchor: f.y,
          handleOffset: f.y + f.height - relY,
        }
      }
    } else {
      return false
    }

    gestureState.value = {
      gesture,
      containerRect,
      startFrame: { ...f },
      hasMoved: false,
      startPointerX: pointerX,
      startPointerY: pointerY,
    }

    return true
  }

  function applyGesture(pointerX: number, pointerY: number): void {
    const state = gestureState.value
    if (!state) return

    const { gesture, containerRect, startPointerX, startPointerY } = state
    const f = frame.value
    const containerWidth = containerRect.width
    const containerHeight = containerRect.height

    // Convert viewport pointer to container-relative coordinates
    const relX = pointerX - containerRect.left
    const relY = pointerY - containerRect.top

    // Check if moved beyond threshold (using viewport coordinates for all gesture types)
    if (!state.hasMoved) {
      const dx = pointerX - startPointerX
      const dy = pointerY - startPointerY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > CLICK_THRESHOLD_PX) {
        state.hasMoved = true
      }
    }

    if (gesture.type === "move") {
      const newX = gesture.startFrameX + relX - (startPointerX - containerRect.left)
      const newY = gesture.startFrameY + relY - (startPointerY - containerRect.top)
      frame.value = {
        ...f,
        x: clamp(newX, 0, Math.max(0, containerWidth - f.width)),
        y: clamp(newY, 0, Math.max(0, containerHeight - f.height)),
        nx: containerWidth > 0 ? newX / containerWidth : 0,
        ny: containerHeight > 0 ? newY / containerHeight : 0,
      }
      return
    }

    const minSize = MIN_SIZE_PX

    if (gesture.type === "corner") {
      const { h, v, anchorX, anchorY, handleOffsetX, handleOffsetY } = gesture
      const handleX = relX + handleOffsetX
      const handleY = relY + handleOffsetY

      // New width and height based on the active corner, not the raw pointer position.
      let newW = clamp(
        h === "left" ? anchorX - handleX : handleX - anchorX,
        minSize,
        containerWidth,
      )
      let newH = clamp(
        v === "top" ? anchorY - handleY : handleY - anchorY,
        minSize,
        containerHeight,
      )

      // Ensure we don't exceed container
      newW = Math.min(newW, containerWidth)
      newH = Math.min(newH, containerHeight)

      const newX = h === "left" ? anchorX - newW : anchorX
      const newY = v === "top" ? anchorY - newH : anchorY

      frame.value = {
        x: clamp(newX, 0, Math.max(0, containerWidth - newW)),
        y: clamp(newY, 0, Math.max(0, containerHeight - newH)),
        width: newW,
        height: newH,
        nx: newX / containerWidth,
        ny: newY / containerHeight,
        nw: newW / containerWidth,
        nh: newH / containerHeight,
      }
      return
    }

    // Edge resize
    const { side, anchor, handleOffset } = gesture

    if (side === "left") {
      const handleX = relX + handleOffset
      const newW = clamp(anchor - handleX, minSize, Math.min(containerWidth, anchor))
      const newX = anchor - newW
      frame.value = {
        ...f,
        x: newX,
        width: newW,
        nx: newX / containerWidth,
        nw: newW / containerWidth,
      }
    } else if (side === "right") {
      const handleX = relX + handleOffset
      const newW = clamp(handleX - anchor, minSize, containerWidth - anchor)
      frame.value = {
        ...f,
        width: newW,
        nw: newW / containerWidth,
      }
    } else if (side === "top") {
      const handleY = relY + handleOffset
      const newH = clamp(anchor - handleY, minSize, Math.min(containerHeight, anchor))
      const newY = anchor - newH
      frame.value = {
        ...f,
        y: newY,
        height: newH,
        ny: newY / containerHeight,
        nh: newH / containerHeight,
      }
    } else {
      // bottom
      const handleY = relY + handleOffset
      const newH = clamp(handleY - anchor, minSize, containerHeight - anchor)
      frame.value = {
        ...f,
        height: newH,
        nh: newH / containerHeight,
      }
    }
  }

  function endGesture(): void {
    if (!gestureState.value) return
    if (gestureState.value.hasMoved) {
      suppressNextClick = true
    }
    gestureState.value = null
    canonicalize()
    persist()
  }

  function handleBlur(): void {
    if (gestureState.value) {
      endGesture()
    }
  }

  function onPointerDown(event: PointerEvent): void {
    const target = event.currentTarget as HTMLElement
    if (!target) return

    // Capture pointer to ensure PiP owns the gesture
    target.setPointerCapture(event.pointerId)

    const started = startGesture(event.clientX, event.clientY, target)
    if (!started) {
      target.releasePointerCapture(event.pointerId)
    }
  }

  function onPointerMove(event: PointerEvent): void {
    if (!gestureState.value) return
    applyGesture(event.clientX, event.clientY)
  }

  function onPointerUp(event: PointerEvent): void {
    const target = event.currentTarget as HTMLElement
    if (target && gestureState.value) {
      try {
        target.releasePointerCapture(event.pointerId)
      } catch {
        // ignore if not captured
      }
    }
    endGesture()
  }

  function onPointerCancel(event: PointerEvent): void {
    const target = event.currentTarget as HTMLElement
    if (target) {
      try {
        target.releasePointerCapture(event.pointerId)
      } catch {
        // ignore
      }
    }
    endGesture()
  }

  function onLostPointerCapture(_event: PointerEvent): void {
    endGesture()
  }

  function onClick(event: MouseEvent): void {
    // Suppress click if we moved beyond threshold during the gesture
    if (suppressNextClick) {
      suppressNextClick = false
      event.stopPropagation()
      event.preventDefault()
      return
    }

    const now = Date.now()
    if (now - lastClickAt.value < DOUBLE_ACTIVATE_THRESHOLD_MS) {
      lastClickAt.value = 0
      event.stopPropagation()
      event.preventDefault()
      resetToDefault()
      return
    }

    lastClickAt.value = now
  }

  // Touch event suppression to prevent bubbling to parent gestures (e.g., pinch-zoom)
  function onTouchStart(event: TouchEvent): void {
    if (gestureState.value) {
      // PiP owns the gesture - prevent parent handlers from seeing this
      event.stopPropagation()
    }
  }

  function onTouchMove(event: TouchEvent): void {
    if (gestureState.value) {
      event.stopPropagation()
      event.preventDefault() // Also prevent scrolling/elastic banding
    }
  }

  function onTouchEnd(event: TouchEvent): void {
    if (gestureState.value) {
      event.stopPropagation()
    }
  }

  function handleContainerResize(): void {
    if (!initialized.value) return
    canonicalize()
    persist()
  }

  function handleWindowResize(): void {
    handleContainerResize()
  }

  onMounted(() => {
    window.addEventListener("resize", handleWindowResize)
    window.addEventListener("blur", handleBlur)
    // Initialize on next tick to ensure container is rendered
    requestAnimationFrame(() => {
      init()
    })
  })

  onBeforeUnmount(() => {
    window.removeEventListener("resize", handleWindowResize)
    window.removeEventListener("blur", handleBlur)
  })

  return {
    style,
    initialized,
    isDragging,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture,
    onClick,
    resetToDefault,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    init,
    canonicalize,
  }
}
