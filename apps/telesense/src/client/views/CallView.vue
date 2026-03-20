<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import CallDesktopLayout from "../components/CallDesktopLayout.vue"
import CallMobileLayout from "../components/CallMobileLayout.vue"
import { useAppStore } from "../composables/useAppStore"
import { usePinchZoom } from "../composables/usePinchZoom"
import { useSwipeBack } from "../composables/useSwipeBack"
import { useToast } from "../composables/useToast"

interface SessionResponse {
  sessionId: string
  cloudflareSessionId: string
}

interface PublishResponse {
  sessionDescription: RTCSessionDescriptionInit
  tracks: Array<{ mid: string; trackName: string }>
}

interface SubscribeResponse {
  sessionDescription: RTCSessionDescriptionInit
  tracks: Array<{ sessionId: string; trackName: string; mid: string }>
  requiresImmediateRenegotiation: boolean
}

interface DiscoverResponse {
  tracks: Array<{ trackName: string; sessionId: string; mid: string }>
  remoteParticipantCount: number
  remoteParticipants: Array<{
    sessionId: string
    audioEnabled: boolean
    videoEnabled: boolean
  }>
}

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
const localVid = ref<HTMLVideoElement>()
const remoteVid = ref<HTMLVideoElement>()
const remoteStream = ref<MediaStream | null>(null)
const showLogs = ref(false)
const logs = ref<LogEntry[]>([])
const localStream = ref<MediaStream | null>(null)
const pcRef = ref<RTCPeerConnection | null>(null)
const publishedVideoSender = ref<RTCRtpSender | null>(null)
const cameraTrack = ref<MediaStreamTrack | null>(null)
const screenTrack = ref<MediaStreamTrack | null>(null)
const isAudioMuted = ref(false)
const isVideoOff = ref(false)
const isScreenSharing = ref(false)
const isRemoteAudioMuted = ref(false)
const isRemoteVideoOff = ref(false)
const isConnecting = ref(true)
const hadRemoteParticipant = ref(false)
const isRemoteDisconnected = ref(false)
const currentSessionId = ref<string | null>(null)
const pollTimeoutId = ref<number | null>(null)
const heartbeatIntervalId = ref<number | null>(null)
const visibilityListener = ref<(() => void) | null>(null)
const beforeUnloadListener = ref<(() => void) | null>(null)
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

function setLocalVideoEl(el: Element | null) {
  localVid.value = el instanceof HTMLVideoElement ? el : undefined
  if (localVid.value && localStream.value) {
    localVid.value.srcObject = localStream.value
  }
}

function setRemoteVideoEl(el: Element | null) {
  remoteVid.value = el instanceof HTMLVideoElement ? el : undefined
  if (remoteVid.value && remoteStream.value) {
    remoteVid.value.srcObject = remoteStream.value
  }
}

function log(msg: string) {
  console.log(msg)
  logs.value.push({
    timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    message: msg,
  })
}

function toggleAudio() {
  if (!localStream.value) return
  for (const track of localStream.value.getAudioTracks()) {
    track.enabled = !track.enabled
  }
  isAudioMuted.value = !isAudioMuted.value
  syncMediaState()
  log(isAudioMuted.value ? "🎤 Microphone muted" : "🎤 Microphone unmuted")
}

function toggleVideo() {
  if (!localStream.value) return
  if (isScreenSharing.value) return
  for (const track of localStream.value.getVideoTracks()) {
    track.enabled = !track.enabled
  }
  isVideoOff.value = !isVideoOff.value
  syncMediaState()
  log(isVideoOff.value ? "📹 Camera off" : "📹 Camera on")
}

function updateLocalPreview(videoTrack: MediaStreamTrack | null) {
  const stream = localStream.value
  if (!stream) return

  const nextStream = new MediaStream()
  for (const track of stream.getAudioTracks()) {
    nextStream.addTrack(track)
  }
  if (videoTrack) {
    nextStream.addTrack(videoTrack)
  }

  localStream.value = nextStream
  if (localVid.value) {
    localVid.value.srcObject = nextStream
  }
}

async function restoreCameraTrack() {
  const sender = publishedVideoSender.value
  const track = cameraTrack.value
  if (!sender || !track) return

  screenTrack.value?.stop()
  screenTrack.value = null
  isScreenSharing.value = false
  await sender.replaceTrack(track)
  updateLocalPreview(track)
  log("🖥️ Screen sharing stopped")
}

async function toggleScreenShare() {
  const sender = publishedVideoSender.value
  if (!sender || !localStream.value) return

  if (isScreenSharing.value) {
    await restoreCameraTrack()
    return
  }

  try {
    const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
    const track = displayStream.getVideoTracks()[0]
    if (!track) return

    screenTrack.value = track
    track.addEventListener(
      "ended",
      () => {
        void restoreCameraTrack()
      },
      { once: true },
    )

    await sender.replaceTrack(track)
    isScreenSharing.value = true
    isVideoOff.value = false
    updateLocalPreview(track)
    syncMediaState()
    log("🖥️ Screen sharing started")
  } catch (e) {
    log(`❌ Screen share error: ${e}`)
    showToast("Could not start screen share", "error")
  }
}

async function apiCall(url: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...store.getAuthHeaders(),
      ...options.headers,
    },
  })
}

function leave() {
  void cleanupCallPresence()
  window.location.search = ""
}

function clearRemoteVideo() {
  const stream = remoteStream.value ?? (remoteVid.value?.srcObject as MediaStream | null)
  if (stream) {
    stream.getTracks().forEach((track) => track.stop())
  }
  remoteStream.value = null
  if (remoteVid.value) {
    remoteVid.value.srcObject = null
  }
}

function stopLocalMedia() {
  screenTrack.value?.stop()
  screenTrack.value = null
  isScreenSharing.value = false
  const stream = localStream.value
  if (stream) {
    stream.getTracks().forEach((track) => track.stop())
  }
  localStream.value = null
  if (localVid.value) {
    localVid.value.srcObject = null
  }
}

function handleRemoteDisconnect(reason: string) {
  if (!hadRemoteParticipant.value || isRemoteDisconnected.value) return
  log(`🔌 Remote participant disconnected (${reason})`)
  clearRemoteVideo()
  isRemoteDisconnected.value = true
  isConnecting.value = false
  showToast("Remote participant disconnected", "error")
}

function stopPolling() {
  if (pollTimeoutId.value !== null) {
    window.clearTimeout(pollTimeoutId.value)
    pollTimeoutId.value = null
  }
}

function stopHeartbeat() {
  if (heartbeatIntervalId.value !== null) {
    window.clearInterval(heartbeatIntervalId.value)
    heartbeatIntervalId.value = null
  }
}

async function sendHeartbeat(sessionId: string) {
  const res = await apiCall(`/api/rooms/${props.roomId}/heartbeat`, {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  })
  if (!res.ok) {
    const error = new Error(`Heartbeat failed: ${res.status}`)
    ;(error as Error & { status?: number }).status = res.status
    throw error
  }
}

function startHeartbeat(sessionId: string) {
  stopHeartbeat()
  const beat = async () => {
    try {
      await sendHeartbeat(sessionId)
    } catch (e) {
      if ((e as Error & { status?: number }).status === 404) {
        log("🛑 Room ended")
        showToast("Room ended", "error")
        leave()
        return
      }
      log(`⚠️ Presence heartbeat failed: ${e}`)
    }
  }
  void beat()
  heartbeatIntervalId.value = window.setInterval(() => {
    void beat()
  }, 5000)
}

async function cleanupCallPresence() {
  stopPolling()
  stopHeartbeat()
  const sessionId = currentSessionId.value
  if (!sessionId) return
  currentSessionId.value = null
  try {
    await apiCall(`/api/rooms/${props.roomId}/leave`, {
      method: "POST",
      body: JSON.stringify({ sessionId }),
      keepalive: true,
    })
  } catch {
    // best-effort cleanup
  }
}

async function syncMediaState() {
  const sessionId = currentSessionId.value
  if (!sessionId) return

  try {
    await apiCall(`/api/rooms/${props.roomId}/media-state`, {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        audioEnabled: !isAudioMuted.value,
        videoEnabled: !isVideoOff.value,
      }),
    })
  } catch {
    // best-effort sync
  }
}

async function toggleFullscreen(videoType: "local" | "remote") {
  const videoEl = videoType === "local" ? localVid.value : remoteVid.value
  if (!videoEl) return
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await videoEl.requestFullscreen()
    }
  } catch (err) {
    log(`Fullscreen error: ${err}`)
  }
}

let lastTap = 0
function onVideoTap(videoType: "local" | "remote") {
  const now = Date.now()
  if (now - lastTap < 300) {
    void toggleFullscreen(videoType)
  }
  lastTap = now
}

async function pollAndSubscribe(pc: RTCPeerConnection, sessionId: string) {
  const checkedTracks = new Set<string>()
  const poll = async () => {
    if (currentSessionId.value !== sessionId) return
    try {
      const res = await apiCall(
        `/api/rooms/${props.roomId}/discover-remote-tracks?sessionId=${sessionId}`,
      )
      if (!res.ok) return
      const data = (await res.json()) as DiscoverResponse
      const discoveredTrackNames = new Set(data.tracks.map((track) => track.trackName))
      isRemoteAudioMuted.value =
        data.remoteParticipants.length > 0 && data.remoteParticipants.every((p) => !p.audioEnabled)
      isRemoteVideoOff.value =
        data.remoteParticipants.length > 0 && data.remoteParticipants.every((p) => !p.videoEnabled)

      if (hadRemoteParticipant.value && data.remoteParticipantCount === 0) {
        checkedTracks.clear()
        handleRemoteDisconnect("remote participant left room")
      } else if (hadRemoteParticipant.value && discoveredTrackNames.size === 0) {
        checkedTracks.clear()
        handleRemoteDisconnect("remote tracks disappeared")
      }

      const newTracks = data.tracks.filter((track) => !checkedTracks.has(track.trackName))
      if (newTracks.length > 0) {
        log(`🔔 Remote participant joined!`)
        log(`   Tracks: ${newTracks.map((track) => track.trackName.slice(0, 8)).join(", ")}`)
        for (const track of newTracks) {
          checkedTracks.add(track.trackName)
        }
        await subscribeToTracks(pc, sessionId, newTracks)
      }
    } catch (e) {
      console.error("Poll error:", e)
    }

    if (currentSessionId.value !== sessionId) return
    pollTimeoutId.value = window.setTimeout(() => {
      void poll()
    }, 2000)
  }

  await poll()
}

async function subscribeToTracks(
  pc: RTCPeerConnection,
  sessionId: string,
  remoteTracks: Array<{ trackName: string; sessionId: string; mid: string }>,
) {
  try {
    log(`📤 Subscribing to ${remoteTracks.length} remote tracks...`)
    log(`   Local session: ${sessionId.slice(0, 8)}`)
    log(
      `   Remote sessions: ${remoteTracks.map((track) => track.sessionId.slice(0, 8)).join(", ")}`,
    )

    const subscribeRes = await apiCall(`/api/rooms/${props.roomId}/subscribe-offer`, {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        remoteTracks: remoteTracks.map((track) => ({
          trackName: track.trackName,
          sessionId: track.sessionId,
        })),
      }),
    })

    if (!subscribeRes.ok) {
      const errorData = (await subscribeRes.json().catch(() => ({}))) as {
        error?: string
        code?: string
      }
      log(`❌ Subscribe failed: ${subscribeRes.status}`)
      log(`   Error: ${errorData.error || "Unknown"}`)
      log(`   Code: ${errorData.code || "N/A"}`)
      throw new Error(`Subscribe failed: ${subscribeRes.status}`)
    }

    const subscribeData = (await subscribeRes.json()) as SubscribeResponse
    log(`✅ Got subscribe offer, ${subscribeData.tracks?.length || 0} tracks`)

    await pc.setRemoteDescription(subscribeData.sessionDescription)
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    log("📤 Completing subscription...")
    const completeRes = await apiCall(`/api/rooms/${props.roomId}/complete-subscribe`, {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        sdpAnswer: answer.sdp,
      }),
    })

    if (!completeRes.ok) {
      const errorData = (await completeRes.json().catch(() => ({}))) as { error?: string }
      log(`❌ Complete subscribe failed: ${completeRes.status}`)
      log(`   Error: ${errorData.error || "Unknown"}`)
      throw new Error(`Complete subscribe failed: ${completeRes.status}`)
    }

    log("✅ Connected to remote participant!")
    showToast("Remote participant connected!", "success")
  } catch (e) {
    log(`❌ Subscribe error: ${e}`)
  }
}

async function togglePiP(enable: boolean) {
  const videoEl = remoteVid.value
  if (!videoEl || !document.pictureInPictureEnabled) return
  try {
    if (enable && document.pictureInPictureElement !== videoEl) {
      await videoEl.requestPictureInPicture()
      log("📺 Picture-in-Picture enabled")
    } else if (!enable && document.pictureInPictureElement === videoEl) {
      await document.exitPictureInPicture()
      log("📺 Picture-in-Picture disabled")
    }
  } catch {
    // ignore unsupported PiP
  }
}

async function endRoom() {
  const res = await apiCall(`/api/rooms/${props.roomId}/terminate`, {
    method: "POST",
  })
  if (!res.ok) {
    showToast("Could not end room", "error")
    return
  }
  showToast("Room ended for everyone", "success")
  leave()
}

onMounted(async () => {
  viewportQuery = window.matchMedia("(max-width: 768px)")
  isMobile.value = viewportQuery.matches
  mediaQueryListener.value = (event: MediaQueryListEvent) => {
    isMobile.value = event.matches
  }
  viewportQuery.addEventListener("change", mediaQueryListener.value)

  log("🚀 Starting room...")
  log(`🚪 Room ID: ${props.roomId}`)
  log("📹 Requesting camera access...")

  try {
    localStream.value = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    cameraTrack.value = localStream.value.getVideoTracks()[0] ?? null
    if (localVid.value) {
      localVid.value.srcObject = localStream.value
    }
    log("✅ Camera connected")
  } catch (e) {
    log(`❌ Camera error: ${e}`)
    showToast("Camera access denied", "error")
    return
  }

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
    bundlePolicy: "max-bundle",
  })
  pcRef.value = pc

  pc.ontrack = (event) => {
    log("📡 Remote video received!")
    hadRemoteParticipant.value = true
    isRemoteDisconnected.value = false
    isConnecting.value = false

    let stream = remoteVid.value?.srcObject as MediaStream | null
    if (!stream) {
      stream = new MediaStream()
      remoteStream.value = stream
      if (remoteVid.value) {
        remoteVid.value.srcObject = stream
      }
    }
    remoteStream.value = stream
    stream.addTrack(event.track)

    event.track.addEventListener("ended", () => {
      const currentStream = remoteVid.value?.srcObject as MediaStream | null
      const hasLiveTracks = currentStream?.getTracks().some((track) => track.readyState === "live")
      if (!hasLiveTracks) {
        handleRemoteDisconnect("track ended")
      }
    })
  }

  pc.oniceconnectionstatechange = () => {
    log(`🧊 Connection: ${pc.iceConnectionState}`)
    if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
      handleRemoteDisconnect(pc.iceConnectionState)
    }
  }

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
      handleRemoteDisconnect(pc.connectionState)
    }
  }

  try {
    log("🔑 Creating session...")
    const sessionRes = await apiCall(`/api/rooms/${props.roomId}/session`, { method: "POST" })
    if (!sessionRes.ok) {
      if (sessionRes.status === 404) {
        throw new Error("Room not found")
      }
      throw new Error(`Session failed: ${sessionRes.status}`)
    }

    const sessionData = (await sessionRes.json()) as SessionResponse
    const sessionId = sessionData.sessionId
    currentSessionId.value = sessionId
    log("✅ Session ready")
    startHeartbeat(sessionId)
    await syncMediaState()

    const transceivers = localStream
      .value!.getTracks()
      .map((track) => pc.addTransceiver(track, { direction: "sendonly" }))
    publishedVideoSender.value =
      transceivers.find(({ sender }) => sender.track?.kind === "video")?.sender ?? null

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    log("📤 Publishing...")
    const publishRes = await apiCall(`/api/rooms/${props.roomId}/publish-offer`, {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        sdpOffer: offer.sdp,
        tracks: transceivers.map(({ mid, sender }) => ({
          mid: mid!,
          trackName: sender.track?.id || crypto.randomUUID(),
        })),
      }),
    })
    if (!publishRes.ok) {
      throw new Error(`Publish failed: ${publishRes.status}`)
    }

    const publishData = (await publishRes.json()) as PublishResponse
    await pc.setRemoteDescription(publishData.sessionDescription)
    log("✅ Connected to Cloudflare")

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Connection timeout")), 15000)
      const check = () => {
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          clearTimeout(timeout)
          resolve()
        } else if (pc.iceConnectionState === "failed") {
          clearTimeout(timeout)
          reject(new Error("Connection failed"))
        }
      }
      pc.addEventListener("iceconnectionstatechange", check)
      check()
    })

    log("🟢 Ready for calls!")
    showToast("Ready for calls!", "success")
    isConnecting.value = false
    log("👀 Waiting for remote participant...")
    void pollAndSubscribe(pc, sessionId)

    visibilityListener.value = () => {
      if (document.visibilityState === "hidden") {
        void togglePiP(true)
      } else {
        void togglePiP(false)
      }
    }
    document.addEventListener("visibilitychange", visibilityListener.value)

    beforeUnloadListener.value = () => {
      void cleanupCallPresence()
    }
    window.addEventListener("beforeunload", beforeUnloadListener.value)
  } catch (e) {
    pcRef.value = null
    publishedVideoSender.value = null
    pc.close()
    await cleanupCallPresence()
    clearRemoteVideo()
    stopLocalMedia()
    log(`❌ Error: ${e}`)
    showToast(e instanceof Error ? e.message : "Connection failed", "error")
  }
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

  void cleanupCallPresence()
  pcRef.value?.close()
  pcRef.value = null
  publishedVideoSender.value = null
  clearRemoteVideo()
  stopLocalMedia()
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
    :is-screen-sharing="isScreenSharing"
    :is-remote-audio-muted="isRemoteAudioMuted"
    :is-remote-video-off="isRemoteVideoOff"
    :has-local-stream="!!localStream"
    :is-connecting="isConnecting"
    :is-remote-disconnected="isRemoteDisconnected"
    :mobile-layout="mobileCallLayout"
    :remote-zoom-style="remoteZoom.transformStyle.value"
    :set-local-video-el="setLocalVideoEl"
    :set-remote-video-el="setRemoteVideoEl"
    @update:show-logs="showLogs = $event"
    @set-mobile-layout="setMobileCallLayout"
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
    :is-connecting="isConnecting"
    :is-remote-disconnected="isRemoteDisconnected"
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
