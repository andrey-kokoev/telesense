<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import CallDesktopLayout from "../components/CallDesktopLayout.vue"
import CallMobileLayout from "../components/CallMobileLayout.vue"
import { useAppStore } from "../composables/useAppStore"
import { useCallMedia } from "../composables/useCallMedia"
import { useCallSession } from "../composables/useCallSession"
import { usePinchZoom } from "../composables/usePinchZoom"
import { useSwipeBack } from "../composables/useSwipeBack"
import { useToast } from "../composables/useToast"

interface LogEntry {
  timestamp: string
  message: string
}

const props = defineProps<{ roomId: string }>()
const { show: showToast } = useToast()
const store = useAppStore()

const swipeBack = useSwipeBack(() => {
  leave()
})
const remoteZoom = usePinchZoom()

const isMobile = ref(false)
const showLogs = ref(false)
const logs = ref<LogEntry[]>([])
const mediaQueryListener = ref<((event: MediaQueryListEvent) => void) | null>(null)
let viewportQuery: MediaQueryList | null = null

const isAuthenticated = store.isAuthenticated
const useMobileLayout = computed(() => isMobile.value)
const desktopCallLayout = computed(() => store.preferences.value.desktopCallLayout)
const mobileCallLayout = computed(() => store.preferences.value.mobileCallLayout)

function setDesktopCallLayout(layout: "side-by-side" | "focus-remote") {
  store.setPreference("desktopCallLayout", layout)
}

function setMobileCallLayout(layout: "picture-in-picture" | "remote-only") {
  store.setPreference("mobileCallLayout", layout)
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
  isRemoteAudioMuted,
  isRemoteVideoOff,
  isStartingCall,
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
})
syncMediaStateImpl = syncMediaState

const isWaitingForRemote = computed(
  () => !isRemoteDisconnected.value && (isStartingCall.value || !hadRemoteParticipant.value),
)

onMounted(() => {
  viewportQuery = window.matchMedia("(max-width: 768px)")
  isMobile.value = viewportQuery.matches
  mediaQueryListener.value = (event: MediaQueryListEvent) => {
    isMobile.value = event.matches
  }
  viewportQuery.addEventListener("change", mediaQueryListener.value)
})

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
    :is-waiting-for-remote="isWaitingForRemote"
    :is-remote-disconnected="isRemoteDisconnected"
    :is-remote-media-interrupted="isRemoteMediaInterrupted"
    :mobile-layout="mobileCallLayout"
    :remote-zoom-style="remoteZoom.transformStyle.value"
    :set-local-video-el="setLocalVideoEl"
    :set-remote-video-el="setRemoteVideoEl"
    @update:show-logs="showLogs = $event"
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
    :is-waiting-for-remote="isWaitingForRemote"
    :is-remote-disconnected="isRemoteDisconnected"
    :is-remote-media-interrupted="isRemoteMediaInterrupted"
    :desktop-layout="desktopCallLayout"
    :remote-zoom-style="remoteZoom.transformStyle.value"
    :set-local-video-el="setLocalVideoEl"
    :set-remote-video-el="setRemoteVideoEl"
    @update:show-logs="showLogs = $event"
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
</template>
