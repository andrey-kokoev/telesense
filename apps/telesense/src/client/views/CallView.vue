<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import CallDesktopLayout from "../components/CallDesktopLayout.vue"
import CallMobileLayout from "../components/CallMobileLayout.vue"
import { useAppStore } from "../composables/useAppStore"
import { useCallMedia } from "../composables/useCallMedia"
import { useCallSession } from "../composables/useCallSession"
import { useI18n } from "../composables/useI18n"
import { usePinchZoom } from "../composables/usePinchZoom"
import { useSwipeBack } from "../composables/useSwipeBack"
import { useToast } from "../composables/useToast"
import { useMetering } from "../composables/useMetering"

interface LogEntry {
  timestamp: string
  message: string
}

type CallDisplayState =
  | "starting"
  | "waiting_for_remote"
  | "connected"
  | "remote_media_interrupted"
  | "remote_left"

type TakeoverPromptState = "closed" | "prompting" | "resolving"
type LogsPanelState = "closed" | "open"

const props = defineProps<{ roomId: string }>()
const { show: showToast } = useToast()
const store = useAppStore()
const { t } = useI18n()
const metering = useMetering(props.roomId)

const swipeBack = useSwipeBack(() => {
  leave()
})
const remoteZoom = usePinchZoom()

const isMobile = ref(false)
const logsPanelState = ref<LogsPanelState>("closed")
const logs = ref<LogEntry[]>([])
const takeoverPromptState = ref<TakeoverPromptState>("closed")
const takeoverPromptMessage = ref("")
const takeoverPromptResolver = ref<((value: boolean) => void) | null>(null)
const mediaQueryListener = ref<((event: MediaQueryListEvent) => void) | null>(null)
let viewportQuery: MediaQueryList | null = null

const isAuthenticated = store.isAuthenticated
const useMobileLayout = computed(() => isMobile.value)
const showLogs = computed(() => logsPanelState.value === "open")
const desktopCallLayout = computed(() => store.preferences.value.desktopCallLayout)
const mobileCallLayout = computed(() => store.preferences.value.mobileCallLayout)

function setDesktopCallLayout(layout: "side-by-side" | "focus-remote") {
  store.setPreference("desktopCallLayout", layout)
}

function setMobileCallLayout(layout: "picture-in-picture" | "remote-only") {
  store.setPreference("mobileCallLayout", layout)
}

function setLogsPanelOpen(nextOpen: boolean) {
  logsPanelState.value = nextOpen ? "open" : "closed"
}

function log(msg: string) {
  console.log(msg)
  logs.value.push({
    timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    message: msg,
  })
}

function leaveToLanding() {
  window.location.search = ""
}

function leaveWithErrorToLanding(message: string) {
  const params = new URLSearchParams()
  params.set("error", message)
  window.location.search = params.toString()
}

function confirmTakeover(message: string) {
  return new Promise<boolean>((resolve) => {
    takeoverPromptMessage.value = message
    takeoverPromptResolver.value = resolve
    takeoverPromptState.value = "prompting"
  })
}

function resolveTakeoverPrompt(value: boolean) {
  if (takeoverPromptState.value !== "prompting") return

  takeoverPromptState.value = "resolving"
  takeoverPromptResolver.value?.(value)
  takeoverPromptResolver.value = null
  takeoverPromptMessage.value = ""
  takeoverPromptState.value = "closed"
}

let syncMediaStateImpl: () => Promise<void> | void = () => {}

const {
  localVid,
  remoteVid,
  remoteStream,
  localStream,
  publishedVideoSender,
  cameraTrack,
  isAudioMuted,
  isVideoOff,
  isScreenSharing,
  setLocalVideoEl,
  setRemoteVideoEl,
  toggleAudio,
  toggleVideo,
  toggleScreenShare,
  clearRemoteVideo,
  stopLocalMedia,
  onVideoTap,
} = useCallMedia({
  log,
  showToast,
  syncMediaState: () => syncMediaStateImpl(),
})
const {
  sessionLifecycle,
  isRemoteAudioMuted,
  isRemoteVideoOff,
  hadRemoteParticipant,
  isRemoteDisconnected,
  isRemoteMediaInterrupted,
  syncMediaState,
  endRoom,
  leave,
} = useCallSession({
  roomId: props.roomId,
  store,
  log,
  showToast,
  media: {
    localVid,
    remoteVid,
    remoteStream,
    localStream,
    publishedVideoSender,
    cameraTrack,
    isAudioMuted,
    isVideoOff,
    clearRemoteVideo,
    stopLocalMedia,
  },
  onLeave: leaveToLanding,
  onLeaveWithError: leaveWithErrorToLanding,
  onConfirmTakeover: confirmTakeover,
})
syncMediaStateImpl = syncMediaState

const remoteDisplayState = computed<CallDisplayState>(() => {
  if (sessionLifecycle.value !== "ready") return "starting"
  if (!hadRemoteParticipant.value) return "waiting_for_remote"
  if (isRemoteDisconnected.value) return "remote_left"
  if (isRemoteMediaInterrupted.value) return "remote_media_interrupted"
  return "connected"
})

onMounted(() => {
  viewportQuery = window.matchMedia("(max-width: 768px)")
  isMobile.value = viewportQuery.matches
  mediaQueryListener.value = (event: MediaQueryListEvent) => {
    isMobile.value = event.matches
  }
  viewportQuery.addEventListener("change", mediaQueryListener.value)

  // Start metering polling
  metering.startPolling()
})

// Watch for grace period entry and show toast
watch(
  () => metering.lifecycle.value,
  (lifecycle) => {
    if (lifecycle === "in_grace") {
      showToast(
        t("call_service_budget_grace_toast", {
          minutes: metering.graceRemainingMinutes.value,
        }),
        "error",
      )
    }
  },
)

watch(
  useMobileLayout,
  (enabled) => {
    document.documentElement.style.overflow = enabled ? "hidden" : ""
    document.body.style.overflow = enabled ? "hidden" : ""
    document.body.style.touchAction = enabled ? "none" : ""
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (viewportQuery && mediaQueryListener.value) {
    viewportQuery.removeEventListener("change", mediaQueryListener.value)
  }
  viewportQuery = null
  mediaQueryListener.value = null

  if (visibilityListener.value) {
    document.removeEventListener("visibilitychange", visibilityListener.value)
    visibilityListener.value = null
  }

  if (beforeUnloadListener.value) {
    window.removeEventListener("beforeunload", beforeUnloadListener.value)
    beforeUnloadListener.value = null
  }

  document.documentElement.style.overflow = ""
  document.body.style.overflow = ""
  document.body.style.touchAction = ""
})
</script>

<template>
  <!-- Grace period banner -->
  <div v-if="metering.isInGrace.value" class="grace-banner" role="alert">
    <span class="grace-banner__icon">⚠️</span>
    <span class="grace-banner__text">
      {{
        t("call_service_budget_grace_banner", {
          minutes: metering.graceRemainingMinutes.value,
        })
      }}
    </span>
  </div>

  <CallMobileLayout
    v-if="useMobileLayout"
    :room-id="roomId"
    :swipe-page-style="swipeBack.pageStyle.value"
    :swipe-backdrop-style="swipeBack.backdropStyle.value"
    :show-logs="showLogs"
    :logs="logs"
    :can-end-room="isAuthenticated"
    :is-audio-muted="isAudioMuted"
    :is-video-off="isVideoOff"
    :is-remote-audio-muted="isRemoteAudioMuted"
    :is-remote-video-off="isRemoteVideoOff"
    :has-local-stream="!!localStream"
    :remote-display-state="remoteDisplayState"
    :mobile-layout="mobileCallLayout"
    :remote-zoom-style="remoteZoom.transformStyle.value"
    :set-local-video-el="setLocalVideoEl"
    :set-remote-video-el="setRemoteVideoEl"
    @update:show-logs="setLogsPanelOpen($event)"
    @set-mobile-layout="setMobileCallLayout"
    @toggle-audio="toggleAudio"
    @toggle-video="toggleVideo"
    @leave="leave"
    @end-room="endRoom"
    @local-video-tap="onVideoTap('local')"
    @remote-video-tap="onVideoTap('remote')"
    @remote-touch-start="remoteZoom.onTouchStart"
    @remote-touch-move="remoteZoom.onTouchMove"
    @remote-touch-end="remoteZoom.onTouchEnd"
    @remote-double-tap="remoteZoom.onDoubleTap"
  />
  <CallDesktopLayout
    v-else
    :room-id="roomId"
    :swipe-page-style="swipeBack.pageStyle.value"
    :swipe-backdrop-style="swipeBack.backdropStyle.value"
    :show-logs="showLogs"
    :logs="logs"
    :can-end-room="isAuthenticated"
    :is-audio-muted="isAudioMuted"
    :is-video-off="isVideoOff"
    :is-screen-sharing="isScreenSharing"
    :is-remote-audio-muted="isRemoteAudioMuted"
    :is-remote-video-off="isRemoteVideoOff"
    :has-local-stream="!!localStream"
    :remote-display-state="remoteDisplayState"
    :desktop-layout="desktopCallLayout"
    :remote-zoom-style="remoteZoom.transformStyle.value"
    :set-local-video-el="setLocalVideoEl"
    :set-remote-video-el="setRemoteVideoEl"
    @update:show-logs="setLogsPanelOpen($event)"
    @set-desktop-layout="setDesktopCallLayout"
    @toggle-audio="toggleAudio"
    @toggle-video="toggleVideo"
    @toggle-screen-share="toggleScreenShare"
    @leave="leave"
    @end-room="endRoom"
    @local-video-tap="onVideoTap('local')"
    @remote-video-tap="onVideoTap('remote')"
    @remote-touch-start="remoteZoom.onTouchStart"
    @remote-touch-move="remoteZoom.onTouchMove"
    @remote-touch-end="remoteZoom.onTouchEnd"
    @remote-double-tap="remoteZoom.onDoubleTap"
  />
  <div
    v-if="takeoverPromptState !== 'closed'"
    class="call-view__modal-backdrop"
    @click.self="takeoverPromptState === 'prompting' && resolveTakeoverPrompt(false)"
  >
    <div class="call-view__modal">
      <h3 class="call-view__modal-title">{{ t("call_takeover_title") }}</h3>
      <p class="call-view__modal-copy">{{ takeoverPromptMessage }}</p>
      <div class="call-view__modal-actions">
        <button
          class="call-view__modal-button call-view__modal-button--secondary"
          :disabled="takeoverPromptState !== 'prompting'"
          @click="resolveTakeoverPrompt(false)"
        >
          {{ t("landing_cancel") }}
        </button>
        <button
          class="call-view__modal-button call-view__modal-button--primary"
          :disabled="takeoverPromptState !== 'prompting'"
          @click="resolveTakeoverPrompt(true)"
        >
          {{ t("call_take_over") }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.call-view__modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  background: color-mix(in srgb, var(--color-bg-primary) 48%, transparent);
  backdrop-filter: blur(10px);
}

.call-view__modal {
  width: min(100%, 28rem);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-elevated);
  box-shadow: var(--shadow-lg);
  padding: var(--space-5);
}

.call-view__modal-title {
  margin: 0 0 var(--space-2);
  font-size: 1rem;
  font-weight: 700;
}

.call-view__modal-copy {
  margin: 0;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.call-view__modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.call-view__modal-button {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0.7rem 1rem;
  font: inherit;
  cursor: pointer;
}

.call-view__modal-button--secondary {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.call-view__modal-button--primary {
  background: var(--ui-primary);
  border-color: var(--ui-primary);
  color: var(--color-accent-foreground);
}

.grace-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: var(--color-accent);
  color: white;
  font-weight: 500;
  text-align: center;
}

.grace-banner__icon {
  font-size: 1.25rem;
}

.grace-banner__text {
  font-size: 0.875rem;
}
</style>
