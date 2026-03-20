import { onBeforeUnmount, onMounted, ref, type Ref } from "vue"
import { useAppStore } from "./useAppStore"

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

type MediaState = {
  localVid: Ref<HTMLVideoElement | undefined>
  remoteVid: Ref<HTMLVideoElement | undefined>
  remoteStream: Ref<MediaStream | null>
  localStream: Ref<MediaStream | null>
  publishedVideoSender: Ref<RTCRtpSender | null>
  cameraTrack: Ref<MediaStreamTrack | null>
  isAudioMuted: Ref<boolean>
  isVideoOff: Ref<boolean>
  clearRemoteVideo: () => void
  stopLocalMedia: () => void
}

export function useCallSession({
  roomId,
  store,
  log,
  showToast,
  media,
  onLeave,
  onLeaveWithError,
}: {
  roomId: string
  store: ReturnType<typeof useAppStore>
  log: (message: string) => void
  showToast: (message: string, type?: "success" | "error" | "info") => void
  media: MediaState
  onLeave: () => void
  onLeaveWithError: (message: string) => void
}) {
  const pcRef = ref<RTCPeerConnection | null>(null)
  const isRemoteAudioMuted = ref(false)
  const isRemoteVideoOff = ref(false)
  const isStartingCall = ref(true)
  const hadRemoteParticipant = ref(false)
  const isRemoteDisconnected = ref(false)
  const currentSessionId = ref<string | null>(null)
  const pollTimeoutId = ref<number | null>(null)
  const heartbeatIntervalId = ref<number | null>(null)
  const visibilityListener = ref<(() => void) | null>(null)
  const beforeUnloadListener = ref<(() => void) | null>(null)

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

  async function cleanupCallPresence() {
    stopPolling()
    stopHeartbeat()
    const sessionId = currentSessionId.value
    if (!sessionId) return
    currentSessionId.value = null
    try {
      await apiCall(`/api/rooms/${roomId}/leave`, {
        method: "POST",
        body: JSON.stringify({ sessionId }),
        keepalive: true,
      })
    } catch {
      // best-effort cleanup
    }
  }

  function leave() {
    void cleanupCallPresence()
    onLeave()
  }

  function leaveWithError(message: string) {
    void cleanupCallPresence()
    onLeaveWithError(message)
  }

  function handleRemoteDisconnect(reason: string) {
    if (!hadRemoteParticipant.value || isRemoteDisconnected.value) return
    log(`🔌 Remote participant disconnected (${reason})`)
    media.clearRemoteVideo()
    isRemoteDisconnected.value = true
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
    const res = await apiCall(`/api/rooms/${roomId}/heartbeat`, {
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
          leaveWithError("Room ended")
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

  async function syncMediaState() {
    const sessionId = currentSessionId.value
    if (!sessionId) return

    try {
      await apiCall(`/api/rooms/${roomId}/media-state`, {
        method: "POST",
        body: JSON.stringify({
          sessionId,
          audioEnabled: !media.isAudioMuted.value,
          videoEnabled: !media.isVideoOff.value,
        }),
      })
    } catch {
      // best-effort sync
    }
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

      const subscribeRes = await apiCall(`/api/rooms/${roomId}/subscribe-offer`, {
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
      const completeRes = await apiCall(`/api/rooms/${roomId}/complete-subscribe`, {
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

  async function pollAndSubscribe(pc: RTCPeerConnection, sessionId: string) {
    const checkedTracks = new Set<string>()
    const poll = async () => {
      if (currentSessionId.value !== sessionId) return
      try {
        const res = await apiCall(
          `/api/rooms/${roomId}/discover-remote-tracks?sessionId=${sessionId}`,
        )
        if (!res.ok) return
        const data = (await res.json()) as DiscoverResponse
        const discoveredTrackNames = new Set(data.tracks.map((track) => track.trackName))
        isRemoteAudioMuted.value =
          data.remoteParticipants.length > 0 &&
          data.remoteParticipants.every((participant) => !participant.audioEnabled)
        isRemoteVideoOff.value =
          data.remoteParticipants.length > 0 &&
          data.remoteParticipants.every((participant) => !participant.videoEnabled)

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

  async function togglePiP(enable: boolean) {
    const videoEl = media.remoteVid.value
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
    const res = await apiCall(`/api/rooms/${roomId}/terminate`, {
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
    log("🚀 Starting room...")
    log(`🚪 Room ID: ${roomId}`)

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
      bundlePolicy: "max-bundle",
    })
    pcRef.value = pc

    pc.ontrack = (event) => {
      log("📡 Remote video received!")
      hadRemoteParticipant.value = true
      isRemoteDisconnected.value = false

      let stream = media.remoteVid.value?.srcObject as MediaStream | null
      if (!stream) {
        stream = new MediaStream()
        media.remoteStream.value = stream
        if (media.remoteVid.value) {
          media.remoteVid.value.srcObject = stream
        }
      }
      media.remoteStream.value = stream
      stream.addTrack(event.track)

      event.track.addEventListener("ended", () => {
        const currentStream = media.remoteVid.value?.srcObject as MediaStream | null
        const hasLiveTracks = currentStream
          ?.getTracks()
          .some((track) => track.readyState === "live")
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
      const sessionRes = await apiCall(`/api/rooms/${roomId}/session`, { method: "POST" })
      if (!sessionRes.ok) {
        if (sessionRes.status === 401) {
          throw new Error("Room requires a valid token")
        }
        if (sessionRes.status === 403) {
          throw new Error("Token is not allowed for this room")
        }
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

      log("📹 Requesting camera access...")
      try {
        media.localStream.value = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        })
        media.cameraTrack.value = media.localStream.value.getVideoTracks()[0] ?? null
        if (media.localVid.value) {
          media.localVid.value.srcObject = media.localStream.value
        }
        log("✅ Camera connected")
      } catch (e) {
        log(`❌ Camera error: ${e}`)
        await cleanupCallPresence()
        leaveWithError("Camera access denied")
        return
      }

      await syncMediaState()

      const transceivers = media.localStream.value
        .getTracks()
        .map((track) => pc.addTransceiver(track, { direction: "sendonly" }))
      media.publishedVideoSender.value =
        transceivers.find(({ sender }) => sender.track?.kind === "video")?.sender ?? null

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      log("📤 Publishing...")
      const publishRes = await apiCall(`/api/rooms/${roomId}/publish-offer`, {
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
      isStartingCall.value = false
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
      media.publishedVideoSender.value = null
      pc.close()
      isStartingCall.value = false
      await cleanupCallPresence()
      media.clearRemoteVideo()
      media.stopLocalMedia()
      log(`❌ Error: ${e}`)
      leaveWithError(e instanceof Error ? e.message : "Connection failed")
    }
  })

  onBeforeUnmount(() => {
    if (visibilityListener.value) {
      document.removeEventListener("visibilitychange", visibilityListener.value)
      visibilityListener.value = null
    }

    if (beforeUnloadListener.value) {
      window.removeEventListener("beforeunload", beforeUnloadListener.value)
      beforeUnloadListener.value = null
    }

    void cleanupCallPresence()
    pcRef.value?.close()
    pcRef.value = null
    media.publishedVideoSender.value = null
    media.clearRemoteVideo()
    media.stopLocalMedia()
  })

  return {
    isRemoteAudioMuted,
    isRemoteVideoOff,
    isStartingCall,
    hadRemoteParticipant,
    isRemoteDisconnected,
    syncMediaState,
    endRoom,
    leave,
  }
}
