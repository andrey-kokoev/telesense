<template>
  <li
    :ref="setRootRef"
    class="landing__recent-item"
    :class="swipeVisuals.className"
    :style="swipeVisuals.rootStyle"
    tabindex="0"
    @click="!editing && handleOpen()"
    @keydown.enter.prevent="!editing && emit('open')"
    @keydown.space.prevent="!editing && emit('open')"
    @touchstart.passive="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
    @touchcancel="resetSwipe"
  >
    <button
      type="button"
      class="landing__recent-swipe-action landing__recent-swipe-action--edit"
      :style="swipeVisuals.actionStyle"
      @click.stop="startEdit"
      :aria-label="t('landing_edit_label')"
      tabindex="-1"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
    <button
      type="button"
      class="landing__recent-swipe-action landing__recent-swipe-action--delete"
      :style="swipeVisuals.actionStyle"
      @click.stop="emit('delete')"
      :aria-label="t('landing_delete_room')"
      tabindex="-1"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
    <RecentRoomBody
      ref="bodyRef"
      :room="room"
      :availability="availability"
      :editing="editing"
      :edit-label="editLabel"
      :item-style="swipeVisuals.itemStyle"
      @update:edit-label="editLabel = $event"
      @start-edit="startEdit"
      @delete="emit('delete')"
      @save="saveEdit"
      @cancel="cancelEdit"
    />
  </li>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type ComponentPublicInstance,
} from "vue"
import RecentRoomBody from "./RecentRoomBody.vue"
import type { RecentCall } from "../composables/useAppStore"
import { useI18n } from "../composables/useI18n"
import { useSwipePhysics } from "../composables/useSwipePhysics"
import type { Availability } from "../composables/useRecentRoomAvailability"

const props = defineProps<{
  room: RecentCall
  availability: Availability
  registerVisibilityRef: (el: unknown, roomId: string) => void
}>()

const emit = defineEmits<{
  (e: "open"): void
  (e: "rename", label: string): void
  (e: "delete"): void
}>()
const { t } = useI18n()
const rootEl = ref<HTMLElement | null>(null)
const bodyRef = ref<InstanceType<typeof RecentRoomBody> | null>(null)
const editing = ref(false)
const editLabel = ref("")
const suppressClick = ref(false)
const touchStartX = ref<number | null>(null)
const touchStartY = ref<number | null>(null)
const swipeTriggered = ref(false)
const swipe = useSwipePhysics()
const swipeState = swipe.state

type RecentRowInteractionState =
  | "idle"
  | "editing"
  | "swiping_edit"
  | "swiping_delete"
  | "swipe_ready_edit"
  | "swipe_ready_delete"

const interactionState = computed<RecentRowInteractionState>(() => {
  if (editing.value) return "editing"
  if (swipeState.value.direction === "edit") {
    return swipeState.value.phase === "ready" || swipeState.value.phase === "auto"
      ? "swipe_ready_edit"
      : swipeState.value.phase === "idle"
        ? "idle"
        : "swiping_edit"
  }
  if (swipeState.value.direction === "delete") {
    return swipeState.value.phase === "ready" || swipeState.value.phase === "auto"
      ? "swipe_ready_delete"
      : swipeState.value.phase === "idle"
        ? "idle"
        : "swiping_delete"
  }
  return "idle"
})

const swipeVisuals = computed(() => {
  const classMap: Record<RecentRowInteractionState, string> = {
    idle: "",
    editing: "landing__recent-item--editing",
    swiping_edit: "landing__recent-item--swiping-right landing__recent-item--editing",
    swiping_delete: "landing__recent-item--swiping-left landing__recent-item--deleting",
    swipe_ready_edit:
      "landing__recent-item--swiping-right landing__recent-item--editing landing__recent-item--swipe-ready",
    swipe_ready_delete:
      "landing__recent-item--swiping-left landing__recent-item--deleting landing__recent-item--swipe-ready",
  }

  const rootStyle = {
    "--recent-swipe-tint": `${16 + swipeState.value.progress * 40}%`,
  }

  const itemStyle =
    swipeState.value.offset === 0
      ? undefined
      : { transform: `translateX(${swipeState.value.offset}px)` }

  let actionStyle = { transform: "scale(1)" }
  if (!(swipeState.value.phase === "idle" || swipeState.value.phase === "revealed")) {
    const progress = Math.min(
      1,
      (swipeState.value.absOffset - swipe.config.ready) /
        Math.max(1, swipeState.value.autoThreshold - swipe.config.ready),
    )
    actionStyle = { transform: `scale(${1 + progress * 0.5})` }
  }

  return {
    className: classMap[interactionState.value],
    rootStyle,
    itemStyle,
    actionStyle,
  }
})

function setRootRef(el: Element | ComponentPublicInstance | null) {
  const resolved =
    el instanceof HTMLElement
      ? el
      : el instanceof Element
        ? el instanceof HTMLElement
          ? el
          : null
        : el && "$el" in el && el.$el instanceof HTMLElement
          ? el.$el
          : null
  rootEl.value = resolved
}

watch(
  rootEl,
  (el) => {
    props.registerVisibilityRef(el, props.room.id)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  props.registerVisibilityRef(null, props.room.id)
})

function isTouchSwipeEnabled() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
}

function handleOpen() {
  if (suppressClick.value) {
    suppressClick.value = false
    return
  }
  emit("open")
}

function resetSwipe() {
  touchStartX.value = null
  touchStartY.value = null
  swipeTriggered.value = false
  swipe.reset()
}

function triggerSwipeAction(direction: "edit" | "delete") {
  suppressClick.value = true
  window.setTimeout(() => {
    suppressClick.value = false
  }, 250)
  swipeTriggered.value = false
  swipe.reset()
  if (direction === "delete") {
    emit("delete")
  } else {
    startEdit()
  }
}

function onTouchStart(event: TouchEvent) {
  if (!isTouchSwipeEnabled() || editing.value) return
  const touch = event.touches[0]
  if (!touch) return
  touchStartX.value = touch.clientX
  touchStartY.value = touch.clientY
  swipeTriggered.value = false
  swipe.start(touch.clientX, rootEl.value?.clientWidth ?? 240)
}

function onTouchMove(event: TouchEvent) {
  if (!isTouchSwipeEnabled() || editing.value) return
  const touch = event.touches[0]
  if (touchStartX.value === null || touchStartY.value === null || !touch) return

  const dx = touch.clientX - touchStartX.value
  const dy = touch.clientY - touchStartY.value
  if (Math.abs(dx) <= Math.abs(dy)) return

  event.preventDefault()
  swipe.move(touch.clientX)

  if (swipeState.value.shouldAutoTrigger && swipeState.value.direction && !swipeTriggered.value) {
    swipeTriggered.value = true
    triggerSwipeAction(swipeState.value.direction as "edit" | "delete")
  }
}

function onTouchEnd() {
  if (!isTouchSwipeEnabled() || editing.value) return
  touchStartX.value = null
  touchStartY.value = null

  if (swipeTriggered.value) {
    swipeTriggered.value = false
    swipe.reset()
    return
  }

  if (swipeState.value.shouldTriggerOnRelease && swipeState.value.direction) {
    triggerSwipeAction(swipeState.value.direction as "edit" | "delete")
    return
  }

  swipe.reset()
}

function startEdit() {
  swipe.reset()
  editing.value = true
  editLabel.value = props.room.name || props.room.id
  void nextTick(() => {
    bodyRef.value?.focusEditingInput()
  })
}

function cancelEdit() {
  editing.value = false
  editLabel.value = ""
}

function saveEdit() {
  const nextLabel = editLabel.value.trim()
  emit("rename", nextLabel === props.room.id ? "" : nextLabel)
  cancelEdit()
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!editing.value) return
  if (rootEl.value?.contains(event.target as Node)) return
  cancelEdit()
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown)
})
</script>

<style scoped>
.landing__recent-item {
  position: relative;
  overflow: hidden;
  background: color-mix(in srgb, var(--color-bg-tertiary) 92%, var(--color-bg-secondary) 8%);
  border: 1px solid color-mix(in srgb, var(--color-border-hover) 72%, var(--color-border));
  border-radius: var(--radius-lg);
  box-shadow:
    0 1px 0 rgb(255 255 255 / 0.16),
    0 6px 13px rgb(0 0 0 / 0.08);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.landing__recent-item:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-border-hover);
  box-shadow:
    0 1px 0 rgb(255 255 255 / 0.18),
    0 7px 15px rgb(0 0 0 / 0.1);
}

.landing__recent-item--editing {
  background: color-mix(
    in srgb,
    var(--color-accent) var(--recent-swipe-tint, 16%),
    var(--color-bg-tertiary)
  );
}

.landing__recent-item--deleting {
  background: color-mix(
    in srgb,
    var(--ui-danger) var(--recent-swipe-tint, 16%),
    var(--color-bg-tertiary)
  );
}

.landing__recent-swipe-action {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 4.5rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  color: var(--color-text-primary);
  background: transparent;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.12s ease,
    background-color 0.12s ease,
    color 0.12s ease,
    transform 0.08s linear;
}

.landing__recent-swipe-action--edit {
  left: 0;
  background: color-mix(
    in srgb,
    var(--color-accent) var(--recent-swipe-tint, 16%),
    var(--color-bg-tertiary)
  );
}

.landing__recent-swipe-action--delete {
  right: 0;
  background: color-mix(
    in srgb,
    var(--ui-danger) var(--recent-swipe-tint, 16%),
    var(--color-bg-tertiary)
  );
}

.landing__recent-item--swiping-right .landing__recent-swipe-action--edit,
.landing__recent-item--swiping-left .landing__recent-swipe-action--delete {
  opacity: 1;
  pointer-events: auto;
}

.landing__recent-item--swipe-ready .landing__recent-swipe-action {
  color: var(--color-text-primary);
}

.landing__recent-item--swipe-ready .landing__recent-swipe-action--edit {
  background: color-mix(
    in srgb,
    var(--color-accent) max(var(--recent-swipe-tint, 22%), 34%),
    var(--color-bg-tertiary)
  );
}

.landing__recent-item--swipe-ready .landing__recent-swipe-action--delete {
  background: color-mix(
    in srgb,
    var(--ui-danger) max(var(--recent-swipe-tint, 22%), 34%),
    var(--color-bg-tertiary)
  );
}

.landing__recent-item--swipe-ready.landing__recent-item--editing {
  background: color-mix(
    in srgb,
    var(--color-accent) max(var(--recent-swipe-tint, 22%), 34%),
    var(--color-bg-tertiary)
  );
}

.landing__recent-item--swipe-ready.landing__recent-item--deleting {
  background: color-mix(
    in srgb,
    var(--ui-danger) max(var(--recent-swipe-tint, 22%), 34%),
    var(--color-bg-tertiary)
  );
}

@media (hover: hover) and (pointer: fine) {
  .landing__recent-item :deep(.landing__recent-icon) {
    opacity: 0;
  }

  .landing__recent-item:hover :deep(.landing__recent-icon),
  .landing__recent-item:focus-within :deep(.landing__recent-icon) {
    opacity: 1;
  }
}

@media (pointer: coarse) {
  .landing__recent-item {
    background: var(--color-bg-tertiary);
    box-shadow: none;
  }

  .landing__recent-item:hover {
    background: var(--color-bg-tertiary);
    border-color: color-mix(in srgb, var(--color-border-hover) 72%, var(--color-border));
    box-shadow: none;
  }

  .landing__recent-swipe-action {
    width: 4rem;
  }
}
</style>
