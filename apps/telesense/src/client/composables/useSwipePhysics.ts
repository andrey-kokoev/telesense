import { computed, onBeforeUnmount, ref } from "vue"

const swipeConfig = {
  reveal: 48,
  ready: 72,
  autoMinOffset: 96,
  autoWidthFraction: 0.5,
  stiffness: 0.18,
  friction: 0.76,
  resistance: 0.8,
} as const

export function useSwipePhysics() {
  const offset = ref(0)
  const targetOffset = ref(0)
  const velocity = ref(0)
  const width = ref(240)

  let pointerStartX = 0
  let rafId: number | null = null

  function getMaxDistance() {
    return Math.max(swipeConfig.autoMinOffset, width.value * swipeConfig.autoWidthFraction)
  }

  function normalizeTarget(rawDistance: number) {
    const maxDistance = getMaxDistance()
    const direction = rawDistance < 0 ? -1 : 1
    const clamped = Math.min(maxDistance, Math.abs(rawDistance))
    const progress = clamped / maxDistance
    const integrated =
      (progress - 0.5 * swipeConfig.resistance * progress * progress) /
      (1 - 0.5 * swipeConfig.resistance)
    return direction * maxDistance * integrated
  }

  function step() {
    const force = (targetOffset.value - offset.value) * swipeConfig.stiffness
    velocity.value = (velocity.value + force) * swipeConfig.friction
    offset.value += velocity.value

    if (Math.abs(targetOffset.value - offset.value) < 0.25 && Math.abs(velocity.value) < 0.25) {
      offset.value = targetOffset.value
      velocity.value = 0
      rafId = null
      return
    }

    rafId = window.requestAnimationFrame(step)
  }

  function ensureLoop() {
    if (rafId !== null) return
    rafId = window.requestAnimationFrame(step)
  }

  function start(startX: number, nextWidth: number) {
    pointerStartX = startX
    width.value = nextWidth
    ensureLoop()
  }

  function move(currentX: number) {
    const rawDistance = currentX - pointerStartX
    targetOffset.value = normalizeTarget(rawDistance)
    ensureLoop()
  }

  function reset() {
    targetOffset.value = 0
    ensureLoop()
  }

  function stop() {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  const state = computed(() => {
    const currentOffset = offset.value
    const absOffset = Math.abs(currentOffset)
    const autoThreshold = getMaxDistance()
    const direction = currentOffset > 0 ? "edit" : currentOffset < 0 ? "delete" : null
    const phase =
      absOffset >= autoThreshold
        ? "auto"
        : absOffset >= swipeConfig.ready
          ? "ready"
          : absOffset >= swipeConfig.reveal
            ? "revealed"
            : "idle"

    return {
      offset: currentOffset,
      absOffset,
      autoThreshold,
      direction,
      phase,
      progress: Math.min(1, absOffset / autoThreshold),
      shouldTriggerOnRelease: phase === "ready" || phase === "auto",
      shouldAutoTrigger: phase === "auto",
    }
  })

  onBeforeUnmount(() => {
    stop()
  })

  return {
    config: swipeConfig,
    state,
    start,
    move,
    reset,
  }
}
