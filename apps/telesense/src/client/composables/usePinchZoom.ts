import { ref, computed } from "vue"

const MIN_SCALE = 1
const MAX_SCALE = 3

export function usePinchZoom() {
  const scale = ref(1)
  const isPinching = ref(false)
  const initialDistance = ref(0)
  const initialScale = ref(1)

  const transformStyle = computed(() => ({
    transform: `scale(${scale.value})`,
    transition: isPinching.value ? "none" : "transform 0.2s ease",
  }))

  function getDistance(touches: TouchList): number {
    if (touches.length < 2) return 0
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  function onTouchStart(e: TouchEvent) {
    if (e.touches.length !== 2) return

    isPinching.value = true
    initialDistance.value = getDistance(e.touches)
    initialScale.value = scale.value
  }

  function onTouchMove(e: TouchEvent) {
    if (!isPinching.value || e.touches.length !== 2) return

    e.preventDefault() // Prevent scrolling while pinching

    const currentDistance = getDistance(e.touches)
    const ratio = currentDistance / initialDistance.value
    const newScale = initialScale.value * ratio

    scale.value = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale))
  }

  function onTouchEnd() {
    isPinching.value = false

    // Snap back to min if close
    if (scale.value < MIN_SCALE + 0.2) {
      scale.value = MIN_SCALE
    }
  }

  function reset() {
    scale.value = 1
    isPinching.value = false
  }

  function onDoubleTap() {
    // Toggle between min and 2x
    scale.value = scale.value === MIN_SCALE ? 2 : MIN_SCALE
  }

  return {
    scale,
    isPinching,
    transformStyle,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    reset,
    onDoubleTap,
  }
}
