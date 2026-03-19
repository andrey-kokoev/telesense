import { ref, computed, type Ref } from "vue";
import { useHaptics } from "./useHaptics";

export interface SwipeState {
  offsetX: number;
  direction: "left" | "right" | null;
  isSwiping: boolean;
  isRevealed: boolean;
}

export interface SwipeActions {
  offsetX: Ref<number>;
  direction: Ref<"left" | "right" | null>;
  isSwiping: Ref<boolean>;
  isRevealed: Ref<boolean>;
  rowStyle: Ref<{ transform: string; transition: string }>;
  bgClass: Ref<string>;
  onTouchStart: (e: TouchEvent) => void;
  onTouchMove: (e: TouchEvent) => void;
  onTouchEnd: () => "delete" | "edit" | null;
  reset: () => void;
}

const SWIPE_THRESHOLD = 80;
const MAX_SWIPE = 120;

export function useSwipeActions(): SwipeActions {
  const offsetX = ref(0);
  const startX = ref(0);
  const direction = ref<"left" | "right" | null>(null);
  const isSwiping = ref(false);
  const isRevealed = ref(false);
  const wasRevealed = ref(false);
  const { swipeConfirm } = useHaptics();

  const rowStyle = computed(() => ({
    transform: `translateX(${offsetX.value}px)`,
    transition: isSwiping.value ? "none" : "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
  }));

  const bgClass = computed(() => {
    if (!isRevealed.value) return "";
    return direction.value === "left" ? "bg-delete" : "bg-edit";
  });

  function onTouchStart(e: TouchEvent) {
    startX.value = e.touches[0].clientX;
    isSwiping.value = true;
    isRevealed.value = false;
    direction.value = null;
  }

  function onTouchMove(e: TouchEvent) {
    if (!isSwiping.value) return;

    const currentX = e.touches[0].clientX;
    const diff = currentX - startX.value;

    // Determine direction
    if (diff < 0) {
      direction.value = "left";
      offsetX.value = Math.max(-MAX_SWIPE, diff);
      const nowRevealed = Math.abs(offsetX.value) >= SWIPE_THRESHOLD;
      // Trigger haptic when crossing threshold
      if (nowRevealed && !wasRevealed.value) {
        swipeConfirm();
      }
      wasRevealed.value = nowRevealed;
      isRevealed.value = nowRevealed;
    } else if (diff > 0) {
      direction.value = "right";
      offsetX.value = Math.min(MAX_SWIPE, diff);
      const nowRevealed = offsetX.value >= SWIPE_THRESHOLD;
      if (nowRevealed && !wasRevealed.value) {
        swipeConfirm();
      }
      wasRevealed.value = nowRevealed;
      isRevealed.value = nowRevealed;
    }
  }

  function onTouchEnd(): "delete" | "edit" | null {
    isSwiping.value = false;

    const absOffset = Math.abs(offsetX.value);

    if (absOffset >= SWIPE_THRESHOLD && direction.value) {
      // Threshold met - return action but keep visual state
      offsetX.value = direction.value === "left" ? -SWIPE_THRESHOLD : SWIPE_THRESHOLD;
      return direction.value === "left" ? "delete" : "edit";
    }

    // Snap back
    offsetX.value = 0;
    isRevealed.value = false;
    direction.value = null;
    return null;
  }

  function reset() {
    offsetX.value = 0;
    isSwiping.value = false;
    isRevealed.value = false;
    wasRevealed.value = false;
    direction.value = null;
  }

  return {
    offsetX,
    direction,
    isSwiping,
    isRevealed,
    rowStyle,
    bgClass,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    reset,
  };
}
