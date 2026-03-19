<script setup lang="ts">
import { ref } from "vue"
import TvNoiseSurface from "./TvNoiseSurface.vue"

defineProps<{
  roomId: string
  swipePageStyle: Record<string, string>
  swipeBackdropStyle: Record<string, string>
  showLogs: boolean
  logs: Array<{ timestamp: string; message: string }>
  isSwapped: boolean
  canEndRoom: boolean
  isAudioMuted: boolean
  isVideoOff: boolean
  isRemoteAudioMuted: boolean
  isRemoteVideoOff: boolean
  hasLocalStream: boolean
  isConnecting: boolean
  isRemoteDisconnected: boolean
  remoteZoomStyle: Record<string, string>
  videoLayout: string
  setLocalVideoEl: (el: Element | null) => void
  setRemoteVideoEl: (el: Element | null) => void
}>()

const emit = defineEmits<{
  "update:showLogs": [value: boolean]
  toggleAudio: []
  toggleVideo: []
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
</script>

<template>
  <div class="call-mobile" :style="swipePageStyle" role="main" aria-label="Video call">
    <div class="swipe-backdrop" :style="swipeBackdropStyle"></div>

    <header class="call-mobile__header">
      <span class="call-mobile__eyebrow">room</span>
      <code class="call-mobile__room-code">{{ roomId }}</code>
    </header>

    <div
      class="call-mobile__videos"
      :class="[videoLayout, { 'call-mobile__videos--swapped': isSwapped }]"
      role="region"
      aria-label="Video feeds"
    >
      <div
        class="call-mobile__video-card call-mobile__video-card--local"
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
        <span class="video-label" @click.stop="emit('swapVideos')">You</span>
        <div v-if="isVideoOff" class="video-off-overlay">
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
        <span class="video-label" @click.stop="emit('swapVideos')">Remote</span>
        <span v-if="isRemoteAudioMuted" class="video-status-badge">Muted</span>
        <TvNoiseSurface v-if="isConnecting || isRemoteVideoOff || isRemoteDisconnected">
          <div v-if="isConnecting" class="connecting-overlay">
            <div class="spinner"></div>
            <span>Waiting for participant...</span>
          </div>
          <div v-else-if="isRemoteVideoOff" class="connecting-overlay">
            <span>Participant camera off</span>
          </div>
          <div v-else class="connecting-overlay">
            <span>Participant disconnected</span>
          </div>
        </TvNoiseSurface>
      </div>
    </div>

    <div class="call-mobile__controls">
      <button
        class="call-mobile__control"
        :class="{ 'call-mobile__control--muted': isAudioMuted }"
        @click="emit('toggleAudio')"
        :disabled="!hasLocalStream"
      >
        {{ isAudioMuted ? "Unmute" : "Mute" }}
      </button>
      <button
        class="call-mobile__control"
        :class="{ 'call-mobile__control--muted': isVideoOff }"
        @click="emit('toggleVideo')"
        :disabled="!hasLocalStream"
      >
        {{ isVideoOff ? "Camera On" : "Camera Off" }}
      </button>
      <button class="call-mobile__control call-mobile__control--leave" @click="emit('leave')">
        Leave
      </button>
    </div>

    <div class="call-mobile__menu-wrap">
      <button
        class="call-mobile__menu-button"
        aria-label="More actions"
        @click="showMenu = !showMenu"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      <div v-if="showMenu" class="call-mobile__menu">
        <button
          class="call-mobile__menu-item"
          @click="
            emit('update:showLogs', !showLogs)
            showMenu = false
          "
        >
          Logs
        </button>
        <button
          v-if="canEndRoom"
          class="call-mobile__menu-item call-mobile__menu-item--danger"
          @click="
            emit('endRoom')
            showMenu = false
          "
        >
          End Room
        </button>
      </div>
    </div>

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
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 0.9rem 0.9rem 5.6rem;
}

.call-mobile__header {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
}

.call-mobile__eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
}

.call-mobile__room-code {
  color: var(--color-text-primary);
  font-size: 0.92rem;
}

.call-mobile__videos {
  display: grid;
  gap: 0.75rem;
  flex: 1;
}

.call-mobile__video-card {
  position: relative;
  overflow: hidden;
  border-radius: 1.25rem;
  background: #111;
  min-height: 28vh;
}

.call-mobile__videos.solo .call-mobile__video-card--remote {
  min-height: 42vh;
}

.call-mobile__videos--swapped .call-mobile__video-card--local {
  order: 2;
}

.call-mobile__videos--swapped .call-mobile__video-card--remote {
  order: 1;
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
  background: rgb(0 0 0 / 0.2);
  color: white;
  z-index: 1;
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.8);
}

.spinner {
  width: 2rem;
  height: 2rem;
  border: 2px solid rgb(255 255 255 / 0.25);
  border-top-color: white;
  border-radius: 999px;
  animation: spin 0.8s linear infinite;
}

.call-mobile__controls {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
  padding: 0.75rem 0.9rem calc(0.75rem + env(safe-area-inset-bottom));
  background: color-mix(in srgb, var(--color-bg-primary) 90%, transparent);
  backdrop-filter: blur(14px);
}

.call-mobile__control,
.call-mobile__sheet-button {
  border: none;
  border-radius: 999px;
  background: var(--color-bg-secondary);
  color: color-mix(in srgb, var(--color-text-primary) 78%, var(--color-accent) 22%);
  padding: 0.82rem 0.9rem;
  font: inherit;
}

.call-mobile__control--muted {
  background: var(--color-bg-tertiary);
}

.call-mobile__control--leave {
  background: var(--color-bg-secondary);
  color: var(--color-accent);
}

.call-mobile__sheet {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding-bottom: 1rem;
}

.call-mobile__menu-wrap {
  position: fixed;
  right: 0.9rem;
  bottom: calc(0.75rem + env(safe-area-inset-bottom));
  z-index: 10;
}

.call-mobile__menu-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border: none;
  border-radius: 999px;
  background: var(--color-bg-secondary);
  color: color-mix(in srgb, var(--color-text-primary) 78%, var(--color-accent) 22%);
  padding: 0;
  font: inherit;
}

.call-mobile__menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 0.5rem);
  min-width: 10rem;
  display: flex;
  flex-direction: column;
  padding: 0.4rem;
  border-radius: 1rem;
  background: var(--color-bg-secondary);
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.16);
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
