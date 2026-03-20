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
  isSwapped: boolean
  canEndRoom: boolean
  isAudioMuted: boolean
  isVideoOff: boolean
  isScreenSharing: boolean
  isRemoteAudioMuted: boolean
  isRemoteVideoOff: boolean
  hasLocalStream: boolean
  isConnecting: boolean
  isRemoteDisconnected: boolean
  desktopLayout: "side-by-side" | "focus-remote"
  remoteZoomStyle: CSSProperties
  videoLayout: string
  setLocalVideoEl: (el: Element | null) => void
  setRemoteVideoEl: (el: Element | null) => void
}>()

const emit = defineEmits<{
  "update:showLogs": [value: boolean]
  setDesktopLayout: [value: "side-by-side" | "focus-remote"]
  toggleAudio: []
  toggleVideo: []
  toggleScreenShare: []
  leave: []
  endRoom: []
  swapVideos: []
  localVideoTap: []
  remoteVideoTap: []
  remoteTouchStart: [event: TouchEvent]
  remoteTouchMove: [event: TouchEvent]
  remoteTouchEnd: [event: TouchEvent]
  remoteDoubleTap: [event: MouseEvent]
}>()

const showMenu = ref(false)
const menuWrap = ref<HTMLElement | null>(null)

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
</script>

<template>
  <div class="call-desktop" :style="swipePageStyle" role="main" aria-label="Video call">
    <div class="swipe-backdrop" :style="swipeBackdropStyle"></div>

    <header class="call-desktop__header">
      <div>
        <div class="call-desktop__eyebrow">room</div>
        <code class="call-desktop__room-code">{{ roomId }}</code>
      </div>
      <div class="call-desktop__header-actions">
        <div class="call-desktop__layout-selector" role="group" aria-label="Desktop layout">
          <button
            class="call-desktop__layout-option"
            :class="{ 'call-desktop__layout-option--active': desktopLayout === 'side-by-side' }"
            title="Side by side"
            aria-label="Side by side"
            @click="emit('setDesktopLayout', 'side-by-side')"
          >
            <Icon icon="sidekickicons:view-split-16-solid" aria-hidden="true" />
          </button>
          <button
            class="call-desktop__layout-option"
            :class="{ 'call-desktop__layout-option--active': desktopLayout === 'focus-remote' }"
            title="Focus remote"
            aria-label="Focus remote"
            @click="emit('setDesktopLayout', 'focus-remote')"
          >
            <Icon icon="mdi:picture-in-picture-top-right" aria-hidden="true" />
          </button>
        </div>
        <ThemeToggle />
      </div>
    </header>

    <div class="call-desktop__body">
      <div
        class="call-desktop__videos"
        :class="[
          videoLayout,
          `call-desktop__videos--${desktopLayout}`,
          { 'call-desktop__videos--swapped': isSwapped },
        ]"
        role="region"
        aria-label="Video feeds"
      >
        <div
          class="call-desktop__video-card call-desktop__video-card--local"
          @click="emit('localVideoTap')"
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
          <span
            class="video-label"
            :class="{ 'video-label--clickable': desktopLayout === 'side-by-side' }"
            @click.stop="desktopLayout === 'side-by-side' && emit('swapVideos')"
          >
            You
          </span>
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
              'call-desktop__video--hidden':
                isConnecting || isRemoteVideoOff || isRemoteDisconnected,
            }"
          ></video>
          <span
            class="video-label"
            :class="{ 'video-label--clickable': desktopLayout === 'side-by-side' }"
            @click.stop="desktopLayout === 'side-by-side' && emit('swapVideos')"
          >
            Remote
          </span>
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
            {{ isAudioMuted ? "Unmute" : "Mute" }}
          </button>
          <button
            class="call-desktop__control"
            :class="{ 'call-desktop__control--muted': isVideoOff }"
            @click="emit('toggleVideo')"
            :disabled="!hasLocalStream"
          >
            {{ isVideoOff ? "Camera On" : "Camera Off" }}
          </button>
          <button class="call-desktop__control call-desktop__control--leave" @click="emit('leave')">
            Leave
          </button>
        </div>

        <div ref="menuWrap" class="call-desktop__menu-wrap">
          <button
            class="call-desktop__menu-button"
            aria-label="More actions"
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
                emit('update:showLogs', !showLogs)
                showMenu = false
              "
            >
              Logs
            </button>
            <button
              class="call-desktop__menu-item"
              :disabled="!hasLocalStream"
              @click="
                emit('toggleScreenShare')
                showMenu = false
              "
            >
              {{ isScreenSharing ? "Stop Sharing" : "Share Screen" }}
            </button>
            <button
              v-if="canEndRoom"
              class="call-desktop__menu-item call-desktop__menu-item--danger"
              @click="
                emit('endRoom')
                showMenu = false
              "
            >
              End Room
            </button>
          </div>
        </div>
      </div>

      <div v-if="showLogs" class="call-desktop__sidebar">
        <button class="call-desktop__sidebar-close" @click="emit('update:showLogs', false)">
          Close Logs
        </button>
        <div
          v-for="(entry, index) in logs"
          :key="`${entry.timestamp}-${index}`"
          class="call-desktop__log-row"
        >
          <span class="call-desktop__log-time muted">{{ entry.timestamp }}</span>
          <span>{{ entry.message }}</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.call-desktop {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem;
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

.call-desktop__layout-selector {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem;
  border-radius: 999px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  min-height: 2.5rem;
}

.call-desktop__layout-option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  width: 2.4rem;
  height: 2.1rem;
  padding: 0;
  border-radius: 999px;
}

.call-desktop__layout-option :deep(svg) {
  width: 1.1rem;
  height: 1.1rem;
}

.call-desktop__layout-option--active {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.call-desktop__footer {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
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

.call-desktop__eyebrow {
  font-size: 0.72rem;
  font-family: "Geist Mono", var(--font-mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
}

.call-desktop__room-code {
  color: var(--color-text-primary);
  font-size: 0.95rem;
  font-family: "Geist Mono", var(--font-mono);
}

.call-desktop__control,
.call-desktop__menu-button,
.call-desktop__sidebar-close {
  border: none;
  border-radius: 999px;
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
  background: var(--color-bg-secondary);
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.16);
}

.call-desktop__menu-item {
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  text-align: left;
  padding: 0.7rem 0.8rem;
  border-radius: 0.7rem;
  font: inherit;
}

.call-desktop__menu-item:disabled {
  opacity: 0.5;
}

.call-desktop__menu-item--danger {
  color: var(--color-accent);
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
}

.call-desktop__videos {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.call-desktop__videos.solo {
  grid-template-columns: minmax(0, 1fr);
}

.call-desktop__videos.call-desktop__videos--side-by-side {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.call-desktop__videos--focus-remote {
  position: relative;
  grid-template-columns: minmax(0, 1fr);
}

.call-desktop__videos--swapped .call-desktop__video-card--local {
  order: 2;
}

.call-desktop__videos--swapped .call-desktop__video-card--remote {
  order: 1;
}

.call-desktop__video-card {
  position: relative;
  overflow: hidden;
  border-radius: 1.5rem;
  background: color-mix(in srgb, var(--color-bg-secondary) 18%, #000);
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

.call-desktop__video-card video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.call-desktop__video--hidden {
  opacity: 0;
}

.video-label {
  position: absolute;
  top: 0.8rem;
  left: 0.8rem;
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

.video-label--clickable {
  cursor: pointer;
}

.video-status-badge {
  position: absolute;
  top: 0.8rem;
  right: 0.8rem;
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

.call-desktop__sidebar {
  border-radius: 1rem;
  background: var(--color-bg-secondary);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.call-desktop__log-row {
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
  font: 0.8rem/1.45 var(--font-mono);
}

.call-desktop__log-time {
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
