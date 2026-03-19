import { computed, ref, onMounted, onUnmounted } from "vue"

const EDGE_THRESHOLD = 20
const SWIPE_THRESHOLD = 100

export function useSwipeBack(onBack: () => void) {
  const isSwiping = ref(false)
  const startX = ref(0)
  const currentX = ref(0)
  const progress = ref(0)

  const pageStyle = computed(() => {
    if (!isSwiping.value) {
      return {
        transform: "translateX(0)",
        transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      }
    }
    const translate = Math.max(0, currentX.value - startX.value)
    return {
      transform: `translateX(${translate}px)`,
      transition: "none",
    }
  })

  const backdropStyle = computed(() => {
    const opacity = 0.5 * (1 - progress.value)
    return {
      opacity: isSwiping.value ? opacity : 0,
      pointerEvents: isSwiping.value ? ("auto" as const) : ("none" as const),
    }
  })

  function onTouchStart(e: TouchEvent) {
    const touch = e.touches[0]

    // Only start if near left edge
    if (touch.clientX > EDGE_THRESHOLD) return

    isSwiping.value = true
    startX.value = touch.clientX
    currentX.value = touch.clientX
    progress.value = 0
  }

  function onTouchMove(e: TouchEvent) {
    if (!isSwiping.value) return

    currentX.value = e.touches[0].clientX
    const delta = currentX.value - startX.value

    // Only allow right swipe (back)
    if (delta < 0) {
      isSwiping.value = false
      return
    }

    progress.value = Math.min(delta / window.innerWidth, 1)
  }

  function onTouchEnd() {
    if (!isSwiping.value) return

    const delta = currentX.value - startX.value
    isSwiping.value = false
    progress.value = 0

    if (delta > SWIPE_THRESHOLD) {
      onBack()
    }
  }

  onMounted(() => {
    document.addEventListener("touchstart", onTouchStart, { passive: true })
    document.addEventListener("touchmove", onTouchMove, { passive: true })
    document.addEventListener("touchend", onTouchEnd)
  })

  onUnmounted(() => {
    document.removeEventListener("touchstart", onTouchStart)
    document.removeEventListener("touchmove", onTouchMove)
    document.removeEventListener("touchend", onTouchEnd)
  })

  return {
    isSwiping,
    progress,
    pageStyle,
    backdropStyle,
  }
}
