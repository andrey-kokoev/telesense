<script setup lang="ts">
import { ref, onMounted } from "vue"
import { useToast } from "../composables/useToast"
import { useAppStore } from "../composables/useAppStore"
import BottomSheet from "../components/BottomSheet.vue"
import { useSwipeBack } from "../composables/useSwipeBack"
import { usePinchZoom } from "../composables/usePinchZoom"

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
}

const props = defineProps<{ roomId: string }>()
const { show: showToast } = useToast()
const store = useAppStore()

// Swipe back to leave
const swipeBack = useSwipeBack(() => {
  leave()
})

// Pinch zoom for remote video
const remoteZoom = usePinchZoom()

// Swap video positions
const isSwapped = ref(false)
function swapVideos() {
  isSwapped.value = !isSwapped.value
}

const statusEl = ref<HTMLDivElement>()
const localVid = ref<HTMLVideoElement>()
const remoteVid = ref<HTMLVideoElement>()
const showLogs = ref(false)
const logs = ref<string[]>(["Initializing..."])

// Media controls
const localStream = ref<MediaStream | null>(null)
const isAudioMuted = ref(false)
const isVideoOff = ref(false)
const isConnecting = ref(true)
const sheetState = ref<"collapsed" | "half" | "full">("half")
const isFullscreen = ref(false)
const fullscreenVideo = ref<"local" | "remote" | null>(null)

// Smart layout: when connecting, local video is larger
// When connected, both videos are equal
const videoLayout = computed(() => {
  if (isConnecting.value) {
    return "solo" // Local large, remote small/placeholder
  }
  return "duo" // Both equal
})

function log(msg: string) {
  console.log(msg)
  logs.value.push(msg)
}

function toggleAudio() {
  if (!localStream.value) return
  const audioTracks = localStream.value.getAudioTracks()
  audioTracks.forEach((track) => {
    track.enabled = !track.enabled
  })
  isAudioMuted.value = !isAudioMuted.value
  log(isAudioMuted.value ? "🎤 Microphone muted" : "🎤 Microphone unmuted")
}

function toggleVideo() {
  if (!localStream.value) return
  const videoTracks = localStream.value.getVideoTracks()
  videoTracks.forEach((track) => {
    track.enabled = !track.enabled
  })
  isVideoOff.value = !isVideoOff.value
  log(isVideoOff.value ? "📹 Camera off" : "📹 Camera on")
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
  window.location.search = ""
}

// Fullscreen handling
async function toggleFullscreen(videoType: "local" | "remote") {
  const videoEl = videoType === "local" ? localVid.value : remoteVid.value
  if (!videoEl) return

  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      isFullscreen.value = false
      fullscreenVideo.value = null
    } else {
      await videoEl.requestFullscreen()
      isFullscreen.value = true
      fullscreenVideo.value = videoType
    }
  } catch (err) {
    log(`Fullscreen error: ${err}`)
  }
}

// Double-tap detection
let lastTap = 0
function onVideoTap(videoType: "local" | "remote") {
  const now = Date.now()
  const delta = now - lastTap
  if (delta < 300) {
    // Double tap detected
    toggleFullscreen(videoType)
  }
  lastTap = now
}

async function pollAndSubscribe(pc: RTCPeerConnection, sessionId: string) {
  const checkedTracks = new Set<string>()

  const poll = async () => {
    try {
      const res = await apiCall(
        `/api/rooms/${props.roomId}/discover-remote-tracks?sessionId=${sessionId}`,
      )
      if (!res.ok) return
      const data = (await res.json()) as DiscoverResponse

      const newTracks = data.tracks.filter((t) => !checkedTracks.has(t.trackName))

      if (newTracks.length > 0) {
        log(`🔔 Remote participant joined!`)
        log(`   Tracks: ${newTracks.map((t) => t.trackName.slice(0, 8)).join(", ")}`)

        for (const track of newTracks) {
          checkedTracks.add(track.trackName)
        }

        await subscribeToTracks(pc, sessionId, newTracks)
      }
    } catch (e) {
      console.error("Poll error:", e)
    }

    setTimeout(poll, 2000)
  }

  poll()
}

async function subscribeToTracks(
  pc: RTCPeerConnection,
  sessionId: string,
  remoteTracks: Array<{ trackName: string; sessionId: string; mid: string }>,
) {
  try {
    log(`📤 Subscribing to ${remoteTracks.length} remote tracks...`)
    log(`   Local session: ${sessionId.slice(0, 8)}`)
    log(`   Remote sessions: ${remoteTracks.map((t) => t.sessionId.slice(0, 8)).join(", ")}`)

    const subscribeRes = await apiCall(`/api/rooms/${props.roomId}/subscribe-offer`, {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        remoteTracks: remoteTracks.map((t) => ({
          trackName: t.trackName,
          sessionId: t.sessionId,
        })),
      }),
    })

    if (!subscribeRes.ok) {
      const errorData = await subscribeRes.json().catch(() => ({}))
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

    log(`📤 Completing subscription...`)
    const completeRes = await apiCall(`/api/rooms/${props.roomId}/complete-subscribe`, {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        sdpAnswer: answer.sdp,
      }),
    })

    if (!completeRes.ok) {
      const errorData = await completeRes.json().catch(() => ({}))
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

// Picture-in-Picture handling
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
  } catch (err) {
    // Silently fail - PiP might not be supported
  }
}

onMounted(async () => {
  log("🚀 Starting room...")
  log(`🚪 Room ID: ${props.roomId}`)

  // 1. Capture local media
  log("📹 Requesting camera access...")
  try {
    localStream.value = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    if (localVid.value) {
      localVid.value.srcObject = localStream.value
    }
    log("✅ Camera connected")
  } catch (e) {
    log(`❌ Camera error: ${e}`)
    showToast("Camera access denied", "error")
    return
  }

  // 2. Create PeerConnection
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
    bundlePolicy: "max-bundle",
  })

  pc.ontrack = (e) => {
    log("📡 Remote video received!")
    isConnecting.value = false
    let stream = remoteVid.value?.srcObject as MediaStream | null
    if (!stream) {
      stream = new MediaStream()
      if (remoteVid.value) {
        remoteVid.value.srcObject = stream
      }
    }
    stream.addTrack(e.track)
  }

  pc.oniceconnectionstatechange = () => {
    log(`🧊 Connection: ${pc.iceConnectionState}`)
  }

  try {
    // 3. Create session
    log("🔑 Creating session...")
    const sessionRes = await apiCall(`/api/rooms/${props.roomId}/session`, { method: "POST" })
    if (!sessionRes.ok) throw new Error(`Session failed: ${sessionRes.status}`)
    const sessionData = (await sessionRes.json()) as SessionResponse
    const sessionId = sessionData.sessionId
    log(`✅ Session ready`)

    // 4. Add local tracks
    const transceivers = localStream
      .value!.getTracks()
      .map((track) => pc.addTransceiver(track, { direction: "sendonly" }))

    // 5. Create offer
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    // 6. Publish tracks
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
    if (!publishRes.ok) throw new Error(`Publish failed: ${publishRes.status}`)
    const publishData = (await publishRes.json()) as PublishResponse

    await pc.setRemoteDescription(publishData.sessionDescription)
    log("✅ Connected to Cloudflare")

    // Wait for ICE
    await new Promise<void>((res, rej) => {
      const timeout = setTimeout(() => rej(new Error("Connection timeout")), 15000)
      const check = () => {
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          clearTimeout(timeout)
          res()
        } else if (pc.iceConnectionState === "failed") {
          clearTimeout(timeout)
          rej(new Error("Connection failed"))
        }
      }
      pc.addEventListener("iceconnectionstatechange", check)
      check()
    })
    log("🟢 Ready for calls!")
    showToast("Ready for calls!", "success")
    isConnecting.value = false

    // 7. Start polling for remote tracks
    log("👀 Waiting for remote participant...")
    pollAndSubscribe(pc, sessionId)

    // Auto PiP on tab blur
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        togglePiP(true)
      } else {
        togglePiP(false)
      }
    })
  } catch (e) {
    log(`❌ Error: ${e}`)
    showToast("Connection failed", "error")
  }
})
</script>

<template>
  <div
    class="card"
    style="max-width: 900px"
    :style="swipeBack.pageStyle"
    role="main"
    aria-label="Video call"
  >
    <!-- Swipe back backdrop -->
    <div class="swipe-backdrop" :style="swipeBack.backdropStyle"></div>
    <div
      style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
        flex-wrap: wrap;
        gap: 0.5rem;
      "
    >
      <h2 class="card-title" style="margin: 0; text-align: left">
        Room: <code>{{ roomId }}</code>
      </h2>
      <button
        class="btn btn-secondary btn-sm"
        @click="showLogs = !showLogs"
        aria-label="Toggle logs"
      >
        {{ showLogs ? "📋 Hide Logs" : "📋 Show Logs" }}
      </button>
    </div>

    <!-- Mobile Sheet Handle -->
    <div
      class="mobile-sheet-handle"
      @click="sheetState = sheetState === 'collapsed' ? 'half' : 'collapsed'"
    >
      <div class="handle-bar"></div>
      <span>{{ sheetState === "collapsed" ? "Show Controls" : "Hide Controls" }}</span>
    </div>

    <!-- Bottom Sheet for Controls & Logs (mobile) / Panel (desktop) -->
    <BottomSheet v-model="sheetState">
      <!-- Media Controls -->
      <div class="media-controls">
        <button
          class="media-btn"
          :class="{ 'media-btn-muted': isAudioMuted }"
          @click="toggleAudio"
          :disabled="!localStream"
          :aria-pressed="isAudioMuted"
          :aria-label="isAudioMuted ? 'Unmute microphone' : 'Mute microphone'"
        >
          <svg
            v-if="!isAudioMuted"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          <svg
            v-else
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M9 9v6a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          {{ isAudioMuted ? "Unmute" : "Mute" }}
        </button>
        <button
          class="media-btn"
          :class="{ 'media-btn-muted': isVideoOff }"
          @click="toggleVideo"
          :disabled="!localStream"
          :aria-pressed="isVideoOff"
          :aria-label="isVideoOff ? 'Turn camera on' : 'Turn camera off'"
        >
          <svg
            v-if="!isVideoOff"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
          <svg
            v-else
            width="20"
            height="20"
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
          {{ isVideoOff ? "Camera On" : "Camera Off" }}
        </button>
        <button class="media-btn media-btn-leave" @click="leave" aria-label="Leave call">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Leave
        </button>
      </div>

      <!-- Logs Toggle -->
      <div class="logs-section">
        <button class="btn btn-secondary btn-sm btn-full" @click="showLogs = !showLogs">
          {{ showLogs ? "📋 Hide Logs" : "📋 Show Logs" }}
        </button>
        <div v-if="showLogs" ref="statusEl" class="status status-info">{{ logs.join("\n") }}</div>
      </div>
    </BottomSheet>

    <!-- Desktop: Media Controls (shown inline) -->
    <div class="media-controls desktop-controls">
      <button
        class="media-btn"
        :class="{ 'media-btn-muted': isAudioMuted }"
        @click="toggleAudio"
        :disabled="!localStream"
      >
        <svg
          v-if="!isAudioMuted"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
        <svg
          v-else
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M9 9v6a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
          <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
        {{ isAudioMuted ? "Unmute" : "Mute" }}
      </button>
      <button
        class="media-btn"
        :class="{ 'media-btn-muted': isVideoOff }"
        @click="toggleVideo"
        :disabled="!localStream"
      >
        <svg
          v-if="!isVideoOff"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
        <svg
          v-else
          width="20"
          height="20"
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
        {{ isVideoOff ? "Camera On" : "Camera Off" }}
      </button>
      <button class="media-btn media-btn-leave" @click="leave">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Leave
      </button>
    </div>

    <div
      class="video-grid"
      :class="[videoLayout, { 'fullscreen-mode': isFullscreen, swapped: isSwapped }]"
      role="region"
      aria-label="Video feeds"
    >
      <div
        class="video-container local-video"
        :class="{ 'fullscreen-target': fullscreenVideo === 'local' }"
        @click="onVideoTap('local')"
        role="img"
        aria-label="Your video"
      >
        <video ref="localVid" autoplay muted playsinline aria-label="Your video feed"></video>
        <span class="video-label" @click.stop="swapVideos">You</span>
        <div class="fullscreen-hint">Double-tap for fullscreen</div>
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
        class="video-container remote-video"
        :class="{ 'fullscreen-target': fullscreenVideo === 'remote' }"
        @click="onVideoTap('remote')"
        @touchstart.passive="remoteZoom.onTouchStart"
        @touchmove="remoteZoom.onTouchMove"
        @touchend="remoteZoom.onTouchEnd"
        @dblclick="remoteZoom.onDoubleTap"
        role="img"
        aria-label="Remote participant video"
      >
        <video
          ref="remoteVid"
          autoplay
          playsinline
          aria-label="Remote participant video feed"
          :style="remoteZoom.transformStyle"
        ></video>
        <span class="video-label" @click.stop="swapVideos">Remote</span>
        <div class="fullscreen-hint">Double-tap for fullscreen</div>
        <div v-if="isConnecting" class="connecting-overlay">
          <div class="spinner"></div>
          <span>Waiting for participant...</span>
        </div>
      </div>
    </div>
  </div>
</template>
