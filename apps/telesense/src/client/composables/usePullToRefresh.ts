import { ref, computed } from "vue";

const MAX_PULL = 100;
const REFRESH_THRESHOLD = 60;

export function usePullToRefresh(onRefresh?: () => Promise<void> | void) {
  const isPulling = ref(false);
  const pullDistance = ref(0);
  const isRefreshing = ref(false);
  const startY = ref(0);

  const pullProgress = computed(() => {
    return Math.min(pullDistance.value / REFRESH_THRESHOLD, 1);
  });

  const canRefresh = computed(() => {
    return pullDistance.value >= REFRESH_THRESHOLD;
  });

  const pullStyle = computed(() => {
    if (!isPulling.value) {
      return {
        transform: "translateY(0)",
        transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      };
    }
    return {
      transform: `translateY(${pullDistance.value}px)`,
      transition: "none",
    };
  });

  const indicatorStyle = computed(() => {
    const opacity = Math.min(pullDistance.value / 30, 1);
    const scale = Math.min(0.5 + (pullDistance.value / REFRESH_THRESHOLD) * 0.5, 1);
    return {
      opacity,
      transform: `translateY(${-40 + pullDistance.value * 0.5}px) scale(${scale}) rotate(${pullDistance.value * 2}deg)`,
      transition: isPulling.value ? "none" : "all 0.3s ease",
    };
  });

  function onTouchStart(e: TouchEvent) {
    // Only start if at top of scroll
    const target = e.target as HTMLElement;
    const scrollable = target.closest(".scrollable") as HTMLElement;
    if (scrollable && scrollable.scrollTop > 0) return;

    isPulling.value = true;
    startY.value = e.touches[0].clientY;
    pullDistance.value = 0;
  }

  function onTouchMove(e: TouchEvent) {
    if (!isPulling.value) return;

    const currentY = e.touches[0].clientY;
    const delta = currentY - startY.value;

    if (delta < 0) {
      isPulling.value = false;
      pullDistance.value = 0;
      return;
    }

    // Resistance curve - harder to pull as you go further
    const resistance = 0.5 + (delta / MAX_PULL) * 0.5;
    pullDistance.value = Math.min(delta * resistance, MAX_PULL);
  }

  async function onTouchEnd() {
    if (!isPulling.value) return;

    isPulling.value = false;

    if (canRefresh.value && !isRefreshing.value) {
      isRefreshing.value = true;
      pullDistance.value = REFRESH_THRESHOLD;

      try {
        if (onRefresh) await onRefresh();
      } finally {
        // Keep showing refresh state briefly
        setTimeout(() => {
          pullDistance.value = 0;
          isRefreshing.value = false;
        }, 500);
      }
    } else {
      pullDistance.value = 0;
    }
  }

  return {
    isPulling,
    isRefreshing,
    pullDistance,
    pullProgress,
    canRefresh,
    pullStyle,
    indicatorStyle,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}
