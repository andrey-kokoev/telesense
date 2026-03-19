import { ref } from "vue"

const LONG_PRESS_DURATION = 500
const MOVE_THRESHOLD = 10

export function useLongPress(onLongPress: () => void) {
  const isPressing = ref(false)
  let pressTimer: ReturnType<typeof setTimeout> | null = null
  let startX = 0
  let startY = 0

  function onTouchStart(e: TouchEvent) {
    isPressing.value = true
    startX = e.touches[0].clientX
    startY = e.touches[0].clientY

    pressTimer = setTimeout(() => {
      if (isPressing.value) {
        onLongPress()
        isPressing.value = false
      }
    }, LONG_PRESS_DURATION)
  }

  function onTouchMove(e: TouchEvent) {
    if (!isPressing.value) return

    const currentX = e.touches[0].clientX
    const currentY = e.touches[0].clientY
    const deltaX = Math.abs(currentX - startX)
    const deltaY = Math.abs(currentY - startY)

    // Cancel if moved too much
    if (deltaX > MOVE_THRESHOLD || deltaY > MOVE_THRESHOLD) {
      cancelPress()
    }
  }

  function onTouchEnd() {
    cancelPress()
  }

  function cancelPress() {
    isPressing.value = false
    if (pressTimer) {
      clearTimeout(pressTimer)
      pressTimer = null
    }
  }

  return {
    isPressing,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    cancelPress,
  }
}
