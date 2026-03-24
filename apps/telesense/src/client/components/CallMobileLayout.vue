<script setup lang="ts">
import type { CSSProperties, ComponentPublicInstance } from "vue"
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { Icon } from "@iconify/vue"
import LanguageToggle from "./LanguageToggle.vue"
import ThemeToggle from "./ThemeToggle.vue"
import TvNoiseSurface from "./TvNoiseSurface.vue"
import { useI18n } from "../composables/useI18n"
import { useToast } from "../composables/useToast"

const props = defineProps<{
  roomId: string
  swipePageStyle: CSSProperties
  swipeBackdropStyle: CSSProperties
  showLogs: boolean
  logs: Array<{
    timestamp: string
    kind: string
    message: string
    details?: Record<string, unknown>
  }>
  canEndRoom: boolean
  isAudioMuted: boolean
  isVideoOff: boolean
  isRemoteAudioMuted: boolean
  isRemoteVideoOff: boolean
  hasLocalStream: boolean
  remoteDisplayState:
    | "starting"
    | "waiting_for_remote"
    | "connected"
    | "remote_media_interrupted"
    | "remote_left"
  mobileLayout: "picture-in-picture" | "remote-only"
  remoteZoomStyle: CSSProperties
  setLocalVideoEl: (el: Element | ComponentPublicInstance | null) => void
  setRemoteVideoEl: (el: Element | ComponentPublicInstance | null) => void
}>()

const { show } = useToast()
const { t } = useI18n()

const emit = defineEmits<{
  "update:showLogs": [value: boolean]
  setMobileLayout: [value: "picture-in-picture" | "remote-only"]
  toggleAudio: []
  toggleVideo: []
  leave: []
  endRoom: []
  localVideoTap: []
  remoteVideoTap: []
  remoteTouchStart: [event: TouchEvent]
  remoteTouchMove: [event: TouchEvent]
  remoteTouchEnd: [event: TouchEvent]
  remoteDoubleTap: [event: MouseEvent]
}>()

const showMenu = ref(false)
const menuWrap = ref<HTMLElement | null>(null)
const isWaitingForRemote = computed(
  () =>
    props.remoteDisplayState === "starting" || props.remoteDisplayState === "waiting_for_remote",
)
const isRemoteDisconnected = computed(() => props.remoteDisplayState === "remote_left")
const isRemoteMediaInterrupted = computed(
  () => props.remoteDisplayState === "remote_media_interrupted",
)
const localVideoCorner = ref<"top-left" | "top-right" | "bottom-left" | "bottom-right">(
  "bottom-right",
)
const pipTouchStart = ref<{ x: number; y: number } | null>(null)

const blurTappedButton = (event: Event) => {
  window.setTimeout(() => {
    ;(event.currentTarget as HTMLButtonElement | null)?.blur()
  }, 0)
}

const handleDocumentPointerDown = (event: PointerEvent) => {
  if (!menuWrap.value?.contains(event.target as Node)) {
    showMenu.value = false
  }
}

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentPointerDown)
})

function onLocalPreviewTouchStart(event: TouchEvent) {
  const touch = event.touches[0]
  if (!touch) return
  pipTouchStart.value = { x: touch.clientX, y: touch.clientY }
}

function onLocalPreviewTouchEnd(event: TouchEvent) {
  const start = pipTouchStart.value
  const touch = event.changedTouches[0]
  pipTouchStart.value = null
  if (!start || !touch) return

  const dx = touch.clientX - start.x
  const dy = touch.clientY - start.y
  if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return

  if (Math.abs(dx) >= 24 && Math.abs(dy) >= 24) {
    localVideoCorner.value =
      dx > 0 ? (dy > 0 ? "bottom-right" : "top-right") : dy > 0 ? "bottom-left" : "top-left"
    return
  }

  const horizontal = Math.abs(dx) >= Math.abs(dy)

  if (horizontal) {
    if (dx > 0) {
      localVideoCorner.value =
        localVideoCorner.value === "top-left"
          ? "top-right"
          : localVideoCorner.value === "bottom-left"
            ? "bottom-right"
            : localVideoCorner.value
    } else {
      localVideoCorner.value =
        localVideoCorner.value === "top-right"
          ? "top-left"
          : localVideoCorner.value === "bottom-right"
            ? "bottom-left"
            : localVideoCorner.value
    }
    return
  }

  if (dy > 0) {
    localVideoCorner.value =
      localVideoCorner.value === "top-left"
        ? "bottom-left"
        : localVideoCorner.value === "top-right"
          ? "bottom-right"
          : localVideoCorner.value
  } else {
    localVideoCorner.value =
      localVideoCorner.value === "bottom-left"
        ? "top-left"
        : localVideoCorner.value === "bottom-right"
          ? "top-right"
          : localVideoCorner.value
  }
}

async function copyRoomCode() {
  try {
    await navigator.clipboard.writeText(props.roomId)
    show(t("call_room_code_copied"), "success")
  } catch {
    show(t("call_room_code_copy_failed"), "error")
  }
}

async function copyDiagnostics() {
  try {
    await navigator.clipboard.writeText(
      JSON.stringify(
        props.logs.map((entry) => ({
          at: entry.timestamp,
          kind: entry.kind,
          message: entry.message,
          details: entry.details,
        })),
        null,
        2,
      ),
    )
  } catch {
    show(t("call_room_code_copy_failed"), "error")
  }
}
</script>

<template>
  <div class="call-mobile" :style="swipePageStyle" role="main" :aria-label="t('call_video_call')">
    <div class="swipe-backdrop" :style="swipeBackdropStyle"></div>

    <header class="call-mobile__header">
      <div class="call-mobile__header-copy">
        <span class="call-mobile__eyebrow">{{ t("call_room") }}</span>
        <button
          type="button"
          class="call-mobile__room-code-button"
          :aria-label="t('call_copy_room_code')"
          @click="copyRoomCode"
        >
          <code class="call-mobile__room-code">{{ roomId }}</code>
        </button>
      </div>
      <div class="call-mobile__header-actions">
        <div class="call-mobile__layout-selector" role="group" aria-label="Mobile layout">
          <button
            class="call-mobile__layout-option"
            :class="{ 'call-mobile__layout-option--active': mobileLayout === 'picture-in-picture' }"
            :title="t('call_mobile_picture_in_picture')"
            :aria-label="t('call_mobile_picture_in_picture')"
            @click="emit('setMobileLayout', 'picture-in-picture')"
          >
            <Icon icon="mdi:picture-in-picture-top-right" aria-hidden="true" />
          </button>
          <button
            class="call-mobile__layout-option"
            :class="{ 'call-mobile__layout-option--active': mobileLayout === 'remote-only' }"
            :title="t('call_mobile_remote_only')"
            :aria-label="t('call_mobile_remote_only')"
            @click="emit('setMobileLayout', 'remote-only')"
          >
            <Icon icon="mdi:fit-to-screen-outline" aria-hidden="true" />
          </button>
        </div>
        <LanguageToggle />
        <ThemeToggle />
      </div>
    </header>

    <div class="call-mobile__videos" role="region" :aria-label="t('call_video_feeds')">
      <div
        class="call-mobile__video-card call-mobile__video-card--remote"
        @click="emit('remoteVideoTap')"
        @touchstart.passive="emit('remoteTouchStart', $event)"
        @touchmove="emit('remoteTouchMove', $event)"
        @touchend="emit('remoteTouchEnd', $event)"
        @dblclick="emit('remoteDoubleTap', $event)"
        role="img"
        aria-label="Remote participant video"
      >
        <video
          :ref="setRemoteVideoEl"
          autoplay
          playsinline
          aria-label="Remote participant video feed"
          :style="remoteZoomStyle"
          :class="{
            'video--hidden':
              isWaitingForRemote ||
              isRemoteVideoOff ||
              isRemoteDisconnected ||
              isRemoteMediaInterrupted,
          }"
        ></video>
        <span class="video-label">{{ t("call_remote") }}</span>
        <span v-if="isRemoteAudioMuted" class="video-status-badge">{{
          t("call_muted_badge")
        }}</span>
        <TvNoiseSurface
          v-if="isWaitingForRemote || isRemoteDisconnected || isRemoteMediaInterrupted"
        >
          <div v-if="isWaitingForRemote" class="connecting-overlay">
            <div class="spinner call-spinner"></div>
            <span>{{ t("call_waiting_for_participant") }}</span>
          </div>
          <div v-else-if="isRemoteMediaInterrupted" class="connecting-overlay">
            <span>{{ t("call_connection_interrupted") }}</span>
          </div>
          <div v-else class="connecting-overlay">
            <span>{{ t("call_participant_disconnected") }}</span>
          </div>
        </TvNoiseSurface>
        <div v-else-if="isRemoteVideoOff" class="video-off-overlay video-off-overlay--visible">
          <span>{{ t("call_participant_camera_off") }}</span>
        </div>

        <div
          v-if="mobileLayout === 'picture-in-picture'"
          class="call-mobile__video-card call-mobile__video-card--local"
          :class="`call-mobile__video-card--${localVideoCorner}`"
          @click="emit('localVideoTap')"
          @touchstart.passive="onLocalPreviewTouchStart"
          @touchend="onLocalPreviewTouchEnd"
          role="img"
          aria-label="Your video"
        >
          <video
            :ref="setLocalVideoEl"
            autoplay
            muted
            playsinline
            aria-label="Your video feed"
          ></video>
          <span class="video-label">{{ t("call_you") }}</span>
          <div class="video-off-overlay" :class="{ 'video-off-overlay--visible': isVideoOff }">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"
              />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          </div>
        </div>
      </div>
    </div>

    <nav ref="menuWrap" class="call-mobile__bottom-bar" :aria-label="t('call_controls')">
      <button
        type="button"
        class="call-mobile__nav-button"
        :class="{ 'call-mobile__nav-button--active': isAudioMuted }"
        @click="emit('toggleAudio')"
        @pointerup="blurTappedButton"
        :disabled="!hasLocalStream"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 1 0 6 0V4a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 1 1-14 0v-2" />
          <path d="M12 19v4" />
        </svg>
        <span>{{ isAudioMuted ? t("call_unmute") : t("call_mute") }}</span>
      </button>
      <button
        type="button"
        class="call-mobile__nav-button"
        :class="{ 'call-mobile__nav-button--active': isVideoOff }"
        @click="emit('toggleVideo')"
        @pointerup="blurTappedButton"
        :disabled="!hasLocalStream"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="m22 8-6 4 6 4V8Z" />
          <rect x="2" y="6" width="14" height="12" rx="2" ry="2" />
        </svg>
        <span>{{ isVideoOff ? t("call_camera_on") : t("call_camera_off") }}</span>
      </button>
      <button
        type="button"
        class="call-mobile__nav-button call-mobile__nav-button--leave"
        @click="emit('leave')"
        @pointerup="blurTappedButton"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="m16 17 5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
        <span>{{ t("call_leave") }}</span>
      </button>
      <button
        type="button"
        class="call-mobile__nav-button"
        :class="{ 'call-mobile__nav-button--active': showMenu }"
        :aria-label="t('call_more_actions')"
        @click="showMenu = !showMenu"
        @pointerup="blurTappedButton"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
        <span>{{ t("call_more_actions") }}</span>
      </button>

      <div v-if="showMenu" class="call-mobile__menu">
        <button
          type="button"
          class="call-mobile__menu-item"
          @click="
            () => {
              emit('update:showLogs', !showLogs)
              showMenu = false
            }
          "
          @pointerup="blurTappedButton"
        >
          {{ t("call_logs") }}
        </button>
        <button
          type="button"
          v-if="canEndRoom"
          class="call-mobile__menu-item call-mobile__menu-item--danger"
          @click="
            () => {
              emit('endRoom')
              showMenu = false
            }
          "
          @pointerup="blurTappedButton"
        >
          {{ t("call_end_room") }}
        </button>
      </div>
    </nav>

    <div v-if="showLogs" class="call-mobile__sheet">
      <div class="call-mobile__sheet-header">
        <strong>{{ t("call_logs") }}</strong>
        <button
          type="button"
          class="call-mobile__sheet-copy"
          :title="t('call_click_to_copy')"
          :aria-label="t('call_click_to_copy')"
          @click="copyDiagnostics"
          @pointerup="blurTappedButton"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      </div>
      <div
        v-for="(entry, index) in logs"
        :key="`${entry.timestamp}-${index}`"
        class="call-mobile__log-row"
      >
        <span class="call-mobile__log-time muted">{{ entry.timestamp }}</span>
        <span>{{ entry.message }}</span>
        <pre v-if="entry.details" class="log-details">{{
          JSON.stringify(entry.details, null, 2)
        }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped src="./callLayoutShared.css"></style>

<style scoped>
.call-mobile {
  position: fixed;
  inset: 0;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 0.9rem 0.9rem 5.6rem;
  overflow: hidden;
}

.call-mobile__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.call-mobile__header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.call-mobile__header-actions :deep(.theme-toggle) {
  margin-bottom: 0;
}

.call-mobile__header-copy {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
}

.call-mobile__videos {
  position: relative;
  flex: 1;
  min-height: 0;
}

.call-mobile__video-card {
  border-radius: 1.25rem;
  min-height: 28vh;
}

.call-mobile__video-card--remote {
  position: absolute;
  inset: 0;
  min-height: 0;
}

.call-mobile__video-card--local {
  position: absolute;
  width: min(34vw, 8.5rem);
  aspect-ratio: 3 / 4;
  min-height: 0;
  z-index: 2;
  border: 1px solid rgb(255 255 255 / 0.14);
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.28);
}

.call-mobile__video-card--top-left {
  top: 0.9rem;
  left: 0.9rem;
}

.call-mobile__video-card--top-right {
  top: 0.9rem;
  right: 0.9rem;
}

.call-mobile__video-card--bottom-left {
  bottom: 0.9rem;
  left: 0.9rem;
}

.call-mobile__video-card--bottom-right {
  right: 0.9rem;
  bottom: 0.9rem;
}

.call-mobile__bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: calc(56px + env(safe-area-inset-bottom));
  display: flex;
  border-top: 1px solid color-mix(in srgb, var(--color-accent) 18%, transparent);
  background: var(--color-bg-primary);
  z-index: 10;
  overflow-anchor: none;
  isolation: isolate;
  transform: translateZ(0);
}

.call-mobile__nav-button {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.18rem;
  padding: 0 0 calc(env(safe-area-inset-bottom) * 0.35);
  border: none;
  background: none;
  color: color-mix(in srgb, var(--color-text-primary) 70%, var(--color-accent) 18%);
  font-family: var(--font-mono-display);
  font-size: 0.7rem;
  font-weight: 500;
  line-height: 1;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.call-mobile__nav-button--active {
  color: var(--color-text-primary);
}

.call-mobile__nav-button--leave {
  color: var(--color-accent);
}

.call-mobile__nav-button svg {
  flex: 0 0 auto;
}

.call-mobile__sheet {
  position: absolute;
  left: 0.9rem;
  right: 0.9rem;
  bottom: calc(56px + env(safe-area-inset-bottom) + 0.75rem);
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  max-height: min(40vh, 18rem);
  overflow-y: auto;
  padding: 0.85rem 0.95rem;
  border: 1px solid color-mix(in srgb, var(--color-border) 80%, transparent);
  border-radius: 1rem;
  z-index: 11;
}

.call-mobile__sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.call-mobile__sheet-copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: none;
  border-radius: var(--radius-full);
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
}

.call-mobile__menu {
  position: absolute;
  right: 0.75rem;
  bottom: calc(100% + 0.5rem);
  min-width: 10rem;
  display: flex;
  flex-direction: column;
  padding: 0.4rem;
  border-radius: 1rem;
  overflow-anchor: none;
}
</style>
