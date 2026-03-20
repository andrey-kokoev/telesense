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
    <div class="landing__recent-item-main" :style="swipeVisuals.itemStyle">
      <template v-if="editing">
        <form class="landing__recent-edit" @submit.prevent="saveEdit">
          <input
            ref="editingInput"
            v-model="editLabel"
            type="text"
            class="landing__input landing__recent-input"
            maxlength="20"
            @click.stop
            @keydown.esc.prevent="cancelEdit"
          />
          <button
            type="submit"
            class="landing__recent-icon"
            @click.stop
            :aria-label="t('landing_save_label')"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        </form>
      </template>
      <template v-else>
        <span
          class="landing__recent-status-dot"
          :class="`landing__recent-status-dot--${availability}`"
          aria-hidden="true"
        ></span>
        <div class="landing__recent-copy">
          <span v-if="room.name" class="landing__recent-label">{{ room.name }}</span>
          <span class="landing__recent-id" :class="{ 'landing__recent-id--muted': room.name }">
            {{ room.id }}
          </span>
        </div>
        <button
          class="landing__recent-icon"
          @click.stop="startEdit"
          :aria-label="t('landing_edit_label')"
          :title="t('landing_edit_label')"
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
          class="landing__recent-icon"
          @click.stop="emit('delete')"
          :aria-label="t('landing_delete_room')"
          :title="t('landing_delete_room')"
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
      </template>
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
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
const editingInput = ref<HTMLInputElement | null>(null)
const editing = ref(false)
const editLabel = ref("")
const suppressClick = ref(false)
const touchStartX = ref<number | null>(null)
const touchStartY = ref<number | null>(null)
const swipeTriggered = ref(false)
const swipe = useSwipePhysics()
const swipeState = swipe.state

const swipeVisuals = computed(() => {
  let className = ""
  if (swipeState.value.direction && swipeState.value.phase !== "idle") {
    const sideClass =
      swipeState.value.direction === "edit"
        ? "landing__recent-item--swiping-right landing__recent-item--editing"
        : "landing__recent-item--swiping-left landing__recent-item--deleting"

    className =
      swipeState.value.phase === "ready" || swipeState.value.phase === "auto"
        ? `${sideClass} landing__recent-item--swipe-ready`
        : sideClass
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
    className,
    rootStyle,
    itemStyle,
    actionStyle,
  }
})

function setRootRef(el: Element | null) {
  rootEl.value = el instanceof HTMLElement ? el : null
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
    triggerSwipeAction(swipeState.value.direction)
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
    triggerSwipeAction(swipeState.value.direction)
    return
  }

  swipe.reset()
}

function startEdit() {
  swipe.reset()
  editing.value = true
  editLabel.value = props.room.name || props.room.id
  void nextTick(() => {
    editingInput.value?.focus()
    editingInput.value?.select()
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
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.landing__recent-item:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-border-hover);
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

.landing__recent-item-main {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: var(--color-bg-tertiary);
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

.landing__recent-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.landing__recent-status-dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 999px;
  background: var(--color-text-tertiary);
  opacity: 0.55;
}

.landing__recent-status-dot--available {
  background: var(--ui-success);
}

.landing__recent-status-dot--unavailable {
  background: color-mix(in srgb, var(--color-text-tertiary) 85%, var(--color-accent) 15%);
  opacity: 0.45;
}

.landing__recent-label {
  font-size: 0.875rem;
  color: var(--color-text-primary);
  font-weight: 500;
  line-height: 1.2;
}

.landing__recent-id {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-primary);
  line-height: 1.2;
}

.landing__recent-id--muted {
  color: var(--color-text-secondary);
  font-size: 0.8rem;
}

.landing__recent-icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  border-radius: var(--radius-full);
  opacity: 1;
}

@media (hover: hover) and (pointer: fine) {
  .landing__recent-icon {
    opacity: 0;
  }

  .landing__recent-item:hover .landing__recent-icon,
  .landing__recent-item:focus-within .landing__recent-icon {
    opacity: 1;
  }
}

.landing__recent-edit {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
}

.landing__recent-input {
  min-width: 0;
  flex: 1;
  padding: var(--space-2) var(--space-3);
}
</style>
