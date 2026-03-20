<script setup lang="ts">
import type { CSSProperties } from "vue"
import { onBeforeUnmount, onMounted, ref } from "vue"
import { Icon } from "@iconify/vue"
import ThemeToggle from "./ThemeToggle.vue"
import TvNoiseSurface from "./TvNoiseSurface.vue"

defineProps<{
  roomId: string
  swipePageStyle: CSSProperties
  swipeBackdropStyle: CSSProperties
  showLogs: boolean
  logs: Array<{ timestamp: string; message: string }>
  canEndRoom: boolean
  isAudioMuted: boolean
  isVideoOff: boolean
  isScreenSharing: boolean
  isRemoteAudioMuted: boolean
  isRemoteVideoOff: boolean
  hasLocalStream: boolean
  isConnecting: boolean
  isRemoteDisconnected: boolean
  mobileLayout: "picture-in-picture" | "remote-only"
  remoteZoomStyle: CSSProperties
  setLocalVideoEl: (el: Element | null) => void
  setRemoteVideoEl: (el: Element | null) => void
}>()

const emit = defineEmits<{
  "update:showLogs": [value: boolean]
  setMobileLayout: [value: "picture-in-picture" | "remote-only"]
  toggleAudio: []
  toggleVideo: []
  toggleScreenShare: []
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
</script>

<template>
  <div class="call-mobile" :style="swipePageStyle" role="main" aria-label="Video call">
    <div class="swipe-backdrop" :style="swipeBackdropStyle"></div>

    <header class="call-mobile__header">
      <div class="call-mobile__header-copy">
        <span class="call-mobile__eyebrow">room</span>
        <code class="call-mobile__room-code">{{ roomId }}</code>
      </div>
      <div class="call-mobile__header-actions">
        <div class="call-mobile__layout-selector" role="group" aria-label="Mobile layout">
          <button
            class="call-mobile__layout-option"
            :class="{ 'call-mobile__layout-option--active': mobileLayout === 'picture-in-picture' }"
            title="Picture in picture"
            aria-label="Picture in picture"
            @click="emit('setMobileLayout', 'picture-in-picture')"
          >
            <Icon icon="mdi:picture-in-picture-top-right" aria-hidden="true" />
          </button>
          <button
            class="call-mobile__layout-option"
            :class="{ 'call-mobile__layout-option--active': mobileLayout === 'remote-only' }"
            title="Remote only"
            aria-label="Remote only"
            @click="emit('setMobileLayout', 'remote-only')"
          >
            <Icon icon="mdi:fit-to-screen-outline" aria-hidden="true" />
          </button>
        </div>
        <ThemeToggle />
      </div>
    </header>

    <div class="call-mobile__videos" role="region" aria-label="Video feeds">
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
            'call-mobile__video--hidden': isConnecting || isRemoteVideoOff || isRemoteDisconnected,
          }"
        ></video>
        <span class="video-label">Remote</span>
        <span v-if="isRemoteAudioMuted" class="video-status-badge">Muted</span>
        <TvNoiseSurface v-if="isConnecting || isRemoteDisconnected">
          <div v-if="isConnecting" class="connecting-overlay">
            <div class="spinner call-spinner"></div>
            <span>Waiting for participant...</span>
          </div>
          <div v-else class="connecting-overlay">
            <span>Participant disconnected</span>
          </div>
        </TvNoiseSurface>
        <div v-else-if="isRemoteVideoOff" class="video-off-overlay video-off-overlay--visible">
          <span>Participant camera off</span>
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
          <span class="video-label">You</span>
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

    <nav ref="menuWrap" class="call-mobile__bottom-bar" aria-label="Call controls">
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
        <span>{{ isAudioMuted ? "Unmute" : "Mute" }}</span>
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
        <span>{{ isVideoOff ? "Camera On" : "Camera Off" }}</span>
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
        <span>Leave</span>
      </button>
      <button
        type="button"
        class="call-mobile__nav-button"
        :class="{ 'call-mobile__nav-button--active': showMenu }"
        aria-label="More actions"
        @click="showMenu = !showMenu"
        @pointerup="blurTappedButton"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
        <span>More</span>
      </button>

      <div v-if="showMenu" class="call-mobile__menu">
        <button
          type="button"
          class="call-mobile__menu-item"
          @click="
            emit('update:showLogs', !showLogs)
            showMenu = false
          "
          @pointerup="blurTappedButton"
        >
          Logs
        </button>
        <button
          type="button"
          class="call-mobile__menu-item"
          :disabled="!hasLocalStream"
          @click="
            emit('toggleScreenShare')
            showMenu = false
          "
          @pointerup="blurTappedButton"
        >
          {{ isScreenSharing ? "Stop Sharing" : "Share Screen" }}
        </button>
        <button
          type="button"
          v-if="canEndRoom"
          class="call-mobile__menu-item call-mobile__menu-item--danger"
          @click="
            emit('endRoom')
            showMenu = false
          "
          @pointerup="blurTappedButton"
        >
          End Room
        </button>
      </div>
    </nav>

    <div v-if="showLogs" class="call-mobile__sheet">
      <div
        v-for="(entry, index) in logs"
        :key="`${entry.timestamp}-${index}`"
        class="call-mobile__log-row"
      >
        <span class="call-mobile__log-time muted">{{ entry.timestamp }}</span>
        <span>{{ entry.message }}</span>
      </div>
    </div>
  </div>
</template>

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

.call-mobile__layout-selector {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem;
  border-radius: 999px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  min-height: 2.5rem;
}

.call-mobile__layout-option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.4rem;
  height: 2.1rem;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-secondary);
}

.call-mobile__layout-option--active {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.call-mobile__layout-option :deep(svg) {
  width: 1.1rem;
  height: 1.1rem;
}

.call-mobile__header-copy {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
}

.call-mobile__eyebrow {
  font-size: 0.72rem;
  font-family: "Geist Mono", var(--font-mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
}

.call-mobile__room-code {
  color: var(--color-text-primary);
  font-size: 0.92rem;
  font-family: "Geist Mono", var(--font-mono);
}

.call-mobile__videos {
  position: relative;
  flex: 1;
  min-height: 0;
}

.call-mobile__video-card {
  position: relative;
  overflow: hidden;
  border-radius: 1.25rem;
  background: color-mix(in srgb, var(--color-bg-secondary) 18%, #000);
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

.call-mobile__video-card video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.call-mobile__video--hidden {
  opacity: 0;
}

.video-label {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  bottom: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.28rem 0.56rem;
  border-radius: 999px;
  background: rgb(0 0 0 / 0.55);
  color: white;
  font-size: 0.75rem;
  width: fit-content;
  height: auto;
  line-height: 1;
}

.video-status-badge {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.28rem 0.56rem;
  border-radius: 999px;
  background: rgb(0 0 0 / 0.55);
  color: white;
  font-size: 0.75rem;
  line-height: 1;
}

.connecting-overlay,
.video-off-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: white;
  z-index: 1;
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.8);
}

.connecting-overlay {
  background: rgb(0 0 0 / 0.2);
}

.video-off-overlay {
  background: #000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.16s ease;
}

.video-off-overlay--visible {
  opacity: 1;
}

.spinner {
  width: 2rem;
  height: 2rem;
  border: 2px solid rgb(255 255 255 / 0.25);
  border-top-color: white;
  border-radius: 999px;
  animation: spin 0.8s linear infinite;
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
  font-family: "Geist Mono", var(--font-mono);
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
  background: var(--color-bg-secondary);
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.16);
  z-index: 11;
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
  background: var(--color-bg-secondary);
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.16);
  overflow-anchor: none;
}

.call-mobile__menu-item {
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  text-align: left;
  padding: 0.7rem 0.8rem;
  border-radius: 0.7rem;
  font: inherit;
}

.call-mobile__menu-item:disabled {
  opacity: 0.5;
}

.call-mobile__menu-item--danger {
  color: var(--color-accent);
}

.call-mobile__log-row {
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
  font: 0.8rem/1.45 var(--font-mono);
}

.call-mobile__log-time {
  flex: 0 0 auto;
}

.muted {
  color: var(--ui-text-muted);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
