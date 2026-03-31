<script setup lang="ts">
import type { CSSProperties, ComponentPublicInstance, Ref } from "vue"
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { Icon } from "@iconify/vue"
import LanguageToggle from "./LanguageToggle.vue"
import ThemeToggle from "./ThemeToggle.vue"
import TvNoiseSurface from "./TvNoiseSurface.vue"
import { useI18n } from "../composables/useI18n"
import { useToast } from "../composables/useToast"
import { usePipFrame } from "../composables/usePipFrame"

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
  isScreenSharing: boolean
  isRemoteAudioMuted: boolean
  isRemoteVideoOff: boolean
  hasLocalStream: boolean
  remoteDisplayState:
    | "starting"
    | "waiting_for_remote"
    | "connected"
    | "remote_media_interrupted"
    | "remote_left"
  desktopLayout: "side-by-side" | "focus-remote"
  remoteZoomStyle: CSSProperties
  isChatOpen: boolean
  chatMessages: Array<{ id: string; text: string; timestamp: number; isLocal: boolean }>
  setLocalVideoEl: (el: Element | ComponentPublicInstance | null) => void
  setRemoteVideoEl: (el: Element | ComponentPublicInstance | null) => void
}>()

const { show } = useToast()
const { t } = useI18n()

const emit = defineEmits<{
  "update:showLogs": [value: boolean]
  setDesktopLayout: [value: "side-by-side" | "focus-remote"]
  toggleAudio: []
  toggleVideo: []
  toggleScreenShare: []
  toggleChat: []
  sendChatMessage: [text: string]
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
const videosContainerRef: Ref<HTMLElement | null> = ref(null)

const {
  style: pipFrameStyle,
  onPointerDown: onPipPointerDown,
  onPointerMove: onPipPointerMove,
  onPointerUp: onPipPointerUp,
  onPointerCancel: onPipPointerCancel,
  onLostPointerCapture: onPipLostPointerCapture,
  onClick: onPipClick,
  onTouchStart: onPipTouchStart,
  onTouchMove: onPipTouchMove,
  onTouchEnd: onPipTouchEnd,
} = usePipFrame(videosContainerRef)

const isWaitingForRemote = computed(
  () =>
    props.remoteDisplayState === "starting" || props.remoteDisplayState === "waiting_for_remote",
)
const isRemoteDisconnected = computed(() => props.remoteDisplayState === "remote_left")
const isRemoteMediaInterrupted = computed(
  () => props.remoteDisplayState === "remote_media_interrupted",
)

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
  <div class="call-desktop" :style="swipePageStyle" role="main" :aria-label="t('call_video_call')">
    <div class="swipe-backdrop" :style="swipeBackdropStyle"></div>

    <header class="call-desktop__header">
      <div>
        <div class="call-desktop__eyebrow">{{ t("call_room") }}</div>
        <button
          type="button"
          class="call-desktop__room-code-button"
          :title="t('call_click_to_copy')"
          :aria-label="t('call_copy_room_code')"
          @click="copyRoomCode"
        >
          <code class="call-desktop__room-code">{{ roomId }}</code>
        </button>
      </div>
      <div class="call-desktop__header-actions">
        <div class="call-desktop__layout-selector" role="group" aria-label="Desktop layout">
          <button
            class="call-desktop__layout-option"
            :class="{ 'call-desktop__layout-option--active': desktopLayout === 'side-by-side' }"
            :title="t('call_desktop_side_by_side')"
            :aria-label="t('call_desktop_side_by_side')"
            @click="emit('setDesktopLayout', 'side-by-side')"
          >
            <Icon icon="sidekickicons:view-split-16-solid" aria-hidden="true" />
          </button>
          <button
            class="call-desktop__layout-option"
            :class="{ 'call-desktop__layout-option--active': desktopLayout === 'focus-remote' }"
            :title="t('call_desktop_focus_remote')"
            :aria-label="t('call_desktop_focus_remote')"
            @click="emit('setDesktopLayout', 'focus-remote')"
          >
            <Icon icon="mdi:picture-in-picture-top-right" aria-hidden="true" />
          </button>
        </div>
        <LanguageToggle />
        <ThemeToggle />
      </div>
    </header>

    <div class="call-desktop__body">
      <div
        ref="videosContainerRef"
        class="call-desktop__videos"
        :class="`call-desktop__videos--${desktopLayout}`"
        role="region"
        :aria-label="t('call_video_feeds')"
      >
        <div
          class="call-desktop__video-card call-desktop__video-card--local"
          :class="{ 'call-desktop__video-card--pip': desktopLayout === 'focus-remote' }"
          :style="desktopLayout === 'focus-remote' ? pipFrameStyle : undefined"
          @pointerdown="desktopLayout === 'focus-remote' ? onPipPointerDown : undefined"
          @pointermove="desktopLayout === 'focus-remote' ? onPipPointerMove : undefined"
          @pointerup="desktopLayout === 'focus-remote' ? onPipPointerUp : undefined"
          @pointercancel="desktopLayout === 'focus-remote' ? onPipPointerCancel : undefined"
          @lostpointercapture="
            desktopLayout === 'focus-remote' ? onPipLostPointerCapture : undefined
          "
          @touchstart="desktopLayout === 'focus-remote' ? onPipTouchStart : undefined"
          @touchmove="desktopLayout === 'focus-remote' ? onPipTouchMove : undefined"
          @touchend="desktopLayout === 'focus-remote' ? onPipTouchEnd : undefined"
          @click="desktopLayout === 'focus-remote' ? onPipClick : () => emit('localVideoTap')"
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

        <div
          class="call-desktop__video-card call-desktop__video-card--remote"
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
        </div>
      </div>
    </div>

    <footer class="call-desktop__footer">
      <div class="call-desktop__footer-row">
        <div class="call-desktop__controls">
          <button
            class="call-desktop__control"
            :class="{ 'call-desktop__control--muted': isAudioMuted }"
            @click="emit('toggleAudio')"
            :disabled="!hasLocalStream"
          >
            {{ isAudioMuted ? t("call_unmute") : t("call_mute") }}
          </button>
          <button
            class="call-desktop__control"
            :class="{ 'call-desktop__control--muted': isVideoOff }"
            @click="emit('toggleVideo')"
            :disabled="!hasLocalStream"
          >
            {{ isVideoOff ? t("call_camera_on") : t("call_camera_off") }}
          </button>
          <button class="call-desktop__control call-desktop__control--leave" @click="emit('leave')">
            {{ t("call_leave") }}
          </button>
          <button
            class="call-desktop__control"
            :class="{ 'call-desktop__control--active': isChatOpen }"
            @click="emit('toggleChat')"
          >
            {{ t("call_chat") }}
            <span v-if="chatMessages.length > 0 && !isChatOpen" class="call-desktop__chat-badge">
              {{ chatMessages.length > 9 ? "9+" : chatMessages.length }}
            </span>
          </button>
        </div>

        <div ref="menuWrap" class="call-desktop__menu-wrap">
          <button
            class="call-desktop__menu-button"
            :aria-label="t('call_more_actions')"
            @click="showMenu = !showMenu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>

          <div v-if="showMenu" class="call-desktop__menu">
            <button
              class="call-desktop__menu-item"
              @click="
                () => {
                  emit('update:showLogs', !showLogs)
                  showMenu = false
                }
              "
            >
              {{ t("call_logs") }}
            </button>
            <button
              class="call-desktop__menu-item"
              :disabled="!hasLocalStream"
              @click="
                () => {
                  emit('toggleScreenShare')
                  showMenu = false
                }
              "
            >
              {{ isScreenSharing ? t("call_stop_sharing") : t("call_share_screen") }}
            </button>
            <button
              v-if="canEndRoom"
              class="call-desktop__menu-item call-desktop__menu-item--danger"
              @click="
                () => {
                  emit('endRoom')
                  showMenu = false
                }
              "
            >
              {{ t("call_end_room") }}
            </button>
          </div>
        </div>
      </div>
    </footer>

    <div
      v-if="showLogs"
      class="call-desktop__logs-modal-backdrop"
      @click="emit('update:showLogs', false)"
    >
      <div class="call-desktop__sidebar" @click.stop>
        <div class="call-desktop__sidebar-header">
          <strong>{{ t("call_logs") }}</strong>
          <div class="call-desktop__sidebar-actions">
            <button
              class="call-desktop__sidebar-close"
              :title="t('call_click_to_copy')"
              :aria-label="t('call_click_to_copy')"
              @click="copyDiagnostics"
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
            <button class="call-desktop__sidebar-close" @click="emit('update:showLogs', false)">
              {{ t("call_close_logs") }}
            </button>
          </div>
        </div>
        <div
          v-for="(entry, index) in logs"
          :key="`${entry.timestamp}-${index}`"
          class="call-desktop__log-row"
        >
          <span class="call-desktop__log-time muted">{{ entry.timestamp }}</span>
          <span>{{ entry.message }}</span>
          <pre v-if="entry.details" class="log-details">{{
            JSON.stringify(entry.details, null, 2)
          }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./callLayoutShared.css"></style>

<style scoped>
.call-desktop {
  position: fixed;
  inset: 0;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem;
  overflow: hidden;
}

.call-desktop__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.call-desktop__header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.call-desktop__header-actions :deep(.theme-toggle) {
  margin-bottom: 0;
  width: 2.5rem;
  height: 2.5rem;
}

.call-desktop__footer {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
}

.call-desktop__footer-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}

.call-desktop__controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  flex-wrap: nowrap;
}

.call-desktop__control,
.call-desktop__menu-button,
.call-desktop__sidebar-close {
  border: none;
  border-radius: var(--radius-full);
  background: var(--color-bg-secondary);
  color: color-mix(in srgb, var(--color-text-primary) 78%, var(--color-accent) 22%);
  padding: 0.8rem 1rem;
  font: inherit;
}

.call-desktop__menu-wrap {
  position: relative;
  z-index: 10;
}

.call-desktop__menu-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding-inline: 0.9rem;
}

.call-desktop__menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 0.5rem);
  z-index: 11;
  min-width: 10rem;
  display: flex;
  flex-direction: column;
  padding: 0.4rem;
  border-radius: 1rem;
}

.call-desktop__control--muted {
  background: var(--color-bg-tertiary);
}

.call-desktop__control--leave {
  background: var(--color-bg-secondary);
  color: var(--color-accent);
}

.call-desktop__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.call-desktop__videos {
  height: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.call-desktop__videos.call-desktop__videos--side-by-side {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.call-desktop__videos--focus-remote {
  position: relative;
  grid-template-columns: minmax(0, 1fr);
}

.call-desktop__video-card {
  border-radius: 1.5rem;
  min-height: 60vh;
}

.call-desktop__videos--focus-remote .call-desktop__video-card--remote {
  min-height: 72vh;
}

.call-desktop__videos--focus-remote .call-desktop__video-card--local {
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: min(20vw, 15rem);
  min-height: 0;
  aspect-ratio: 3 / 4;
  z-index: 2;
  border: 1px solid rgb(255 255 255 / 0.14);
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.3);
}

/* When PiP is interactive, composable provides positioning */
.call-desktop__video-card--local.call-desktop__video-card--pip {
  top: unset;
  right: unset;
  width: unset;
  aspect-ratio: unset;
}

.call-desktop__sidebar {
  width: min(38rem, calc(100vw - 4rem));
  max-height: min(70vh, 36rem);
  border-radius: 1rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  overflow: auto;
}

.call-desktop__sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.call-desktop__sidebar-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.call-desktop__logs-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: rgb(0 0 0 / 0.24);
}
</style>
