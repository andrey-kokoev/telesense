import { onBeforeUnmount, onMounted, ref, type Ref } from "vue"
import { useAppStore } from "./useAppStore"

interface SessionResponse {
  sessionId: string
  cloudflareSessionId: string
  participantSecret: string
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

type SessionLifecycle =
  | "creating_session"
  | "acquiring_media"
  | "publishing"
  | "ready"
  | "leaving"
  | "failed"

const SESSION_REPLACED_MESSAGE = "Call moved to another tab. Multiple tabs are not supported"
const ROOM_ENDED_MESSAGE = "Room ended"

export async function decodeCallApiError(response: Response) {
  const errorData = (await response
    .clone()
    .json()
    .catch(() => ({}))) as {
    code?: string
    error?: string
  }

  if (response.status === 409 && errorData.code === "SESSION_REPLACED") {
    return {
      kind: "session-replaced" as const,
      message: SESSION_REPLACED_MESSAGE,
      code: errorData.code,
    }
  }

  if (response.status === 404 && errorData.code === "SESSION_NOT_FOUND") {
    return {
      kind: "session-missing" as const,
      message: ROOM_ENDED_MESSAGE,
      code: errorData.code,
    }
  }

  if (response.status === 403 && errorData.code === "PARTICIPANT_AUTH_FAILED") {
    return {
      kind: "participant-auth-failed" as const,
      message: "This room is already active in another browser",
      code: errorData.code,
    }
  }

  if (response.status === 409 && errorData.code === "PARTICIPANT_TAKEOVER_REQUIRED") {
    return {
      kind: "participant-takeover-required" as const,
      message: "This room is already open in another tab. Taking over will disconnect it.",
      code: errorData.code,
    }
  }

  if (response.status === 401) {
    return {
      kind: "service-entitlement-required" as const,
      message: "Room requires a valid service entitlement",
      code: errorData.code,
    }
  }

  if (response.status === 403) {
    return {
      kind: "forbidden" as const,
      message: "Service entitlement is not valid for this room",
      code: errorData.code,
    }
  }

  if (response.status === 404) {
    return {
      kind: "not-found" as const,
      message: "Room not found",
      code: errorData.code,
    }
  }

  return {
    kind: "unknown" as const,
    message: errorData.error || `Request failed: ${response.status}`,
    code: errorData.code,
  }
}

export function useCallSession({
  roomId,
  store,
  log,
  showToast,
  media,
  onLeave,
  onLeaveWithError,
  onConfirmTakeover,
}: {
  roomId: string
  store: ReturnType<typeof useAppStore>
  log: (message: string) => void
  showToast: (message: string, type?: "success" | "error" | "info") => void
  media: MediaState
  onLeave: () => void
  onLeaveWithError: (message: string) => void
  onConfirmTakeover: (message: string) => Promise<boolean>
}) {
  const pcRef = ref<RTCPeerConnection | null>(null)
  const isRemoteAudioMuted = ref(false)
  const isRemoteVideoOff = ref(false)
  const sessionLifecycle = ref<SessionLifecycle>("creating_session")
  const hadRemoteParticipant = ref(false)
  const isRemoteDisconnected = ref(false)
  const isRemoteMediaInterrupted = ref(false)
  const currentSessionId = ref<string | null>(null)
  const pollTimeoutId = ref<number | null>(null)
  const heartbeatIntervalId = ref<number | null>(null)
  const visibilityListener = ref<(() => void) | null>(null)
  const beforeUnloadListener = ref<(() => void) | null>(null)

  async function apiCall(url: string, options: RequestInit = {}) {
    const extraHeaders =
      options.headers && !Array.isArray(options.headers)
        ? (options.headers as Record<string, string>)
        : {}

    return fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...store.getServiceEntitlementHeaders(),
        ...extraHeaders,
      },
    })
  }

  function errorToMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
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
    sessionLifecycle.value = "leaving"
    void cleanupCallPresence()
    onLeave()
  }

  function leaveWithError(message: string) {
    sessionLifecycle.value = "failed"
    void cleanupCallPresence()
    onLeaveWithError(message)
  }

  async function decodeApiError(response: Response) {
    return decodeCallApiError(response)
  }

  async function throwIfTerminalSessionError(
    response: Response,
    context: "publish" | "subscribe" | "complete-subscribe" | "media-state",
  ) {
    const decoded = await decodeApiError(response)
    if (decoded.kind === "session-replaced" || decoded.kind === "session-missing") {
      log(
        `🛑 ${decoded.kind === "session-replaced" ? "Session replaced" : "Session missing"} during ${context}`,
      )
      leaveWithError(decoded.message)
      throw new Error(decoded.code || decoded.kind)
    }
  }

  function handleRemotePresenceDisconnect(reason: string) {
    if (!hadRemoteParticipant.value || isRemoteDisconnected.value) return
    log(`🔌 Remote participant disconnected (${reason})`)
    media.clearRemoteVideo()
    isRemoteDisconnected.value = true
    isRemoteMediaInterrupted.value = false
    showToast("Remote participant disconnected", "error")
  }

  function handleRemoteMediaInterrupted(reason: string) {
    if (
      !hadRemoteParticipant.value ||
      isRemoteDisconnected.value ||
      isRemoteMediaInterrupted.value
    ) {
      return
    }
    log(`⚠️ Remote media interrupted (${reason})`)
    isRemoteMediaInterrupted.value = true
    showToast("Remote media interrupted", "error")
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
      const decoded = await decodeApiError(res)
      const error = new Error(decoded.message)
      ;(error as Error & { kind?: string }).kind = decoded.kind
      throw error
    }
  }

  function startHeartbeat(sessionId: string) {
    stopHeartbeat()
    const beat = async () => {
      try {
        await sendHeartbeat(sessionId)
      } catch (e) {
        if ((e as Error & { kind?: string }).kind === "session-replaced") {
          log("🛑 Session replaced by a newer connection")
          leaveWithError(SESSION_REPLACED_MESSAGE)
          return
        }
        if ((e as Error & { kind?: string }).kind === "session-missing") {
          log("🛑 Room ended")
          leaveWithError(ROOM_ENDED_MESSAGE)
          return
        }
        log(`⚠️ Presence heartbeat failed: ${errorToMessage(e)}`)
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
      const res = await apiCall(`/api/rooms/${roomId}/media-state`, {
        method: "POST",
        body: JSON.stringify({
          sessionId,
          audioEnabled: !media.isAudioMuted.value,
          videoEnabled: !media.isVideoOff.value,
        }),
      })

      await throwIfTerminalSessionError(res, "media-state")
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

      await throwIfTerminalSessionError(subscribeRes, "subscribe")

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

      await throwIfTerminalSessionError(completeRes, "complete-subscribe")

      if (!completeRes.ok) {
        const errorData = (await completeRes.json().catch(() => ({}))) as { error?: string }
        log(`❌ Complete subscribe failed: ${completeRes.status}`)
        log(`   Error: ${errorData.error || "Unknown"}`)
        throw new Error(`Complete subscribe failed: ${completeRes.status}`)
      }

      log("✅ Connected to remote participant!")
      showToast("Remote participant connected!", "success")
    } catch (e) {
      log(`❌ Subscribe error: ${errorToMessage(e)}`)
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
        if (!res.ok) {
          const decoded = await decodeApiError(res)
          if (decoded.kind === "session-replaced" || decoded.kind === "session-missing") {
            log(
              `🛑 ${decoded.kind === "session-replaced" ? "Session replaced" : "Session missing"} during discovery`,
            )
            leaveWithError(decoded.message)
            return
          }
          return
        }
        const data = (await res.json()) as DiscoverResponse
        const discoveredTrackNames = new Set(data.tracks.map((track) => track.trackName))
        isRemoteAudioMuted.value =
          data.remoteParticipants.length > 0 &&
          data.remoteParticipants.every((participant) => !participant.audioEnabled)
        isRemoteVideoOff.value =
          data.remoteParticipants.length > 0 &&
          data.remoteParticipants.every((participant) => !participant.videoEnabled)
        if (data.remoteParticipantCount > 0) {
          isRemoteDisconnected.value = false
          isRemoteMediaInterrupted.value = false
        }

        if (hadRemoteParticipant.value && data.remoteParticipantCount === 0) {
          checkedTracks.clear()
          handleRemotePresenceDisconnect("remote participant left room")
        } else if (hadRemoteParticipant.value && discoveredTrackNames.size === 0) {
          handleRemoteMediaInterrupted("remote tracks disappeared")
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
      isRemoteMediaInterrupted.value = false

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
          handleRemoteMediaInterrupted("track ended")
        }
      })
    }

    pc.oniceconnectionstatechange = () => {
      log(`🧊 Connection: ${pc.iceConnectionState}`)
      if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
        handleRemoteMediaInterrupted(pc.iceConnectionState)
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        handleRemoteMediaInterrupted(pc.connectionState)
      }
    }

    try {
      log("🔑 Creating session...")
      sessionLifecycle.value = "creating_session"
      const participantCredential = store.getRoomParticipantCredential(roomId)
      const createSession = async (confirmTakeover = false) =>
        apiCall(`/api/rooms/${roomId}/session`, {
          method: "POST",
          body: JSON.stringify({
            browserInstanceId: store.browserInstanceId.value,
            participantSecret: participantCredential?.participantSecret,
            confirmTakeover,
          }),
        })

      let sessionRes = await createSession()
      if (!sessionRes.ok) {
        const decoded = await decodeApiError(sessionRes)
        if (decoded.kind === "participant-takeover-required") {
          const confirmed = await onConfirmTakeover(decoded.message)
          if (!confirmed) {
            leave()
            return
          }
          sessionRes = await createSession(true)
        }
      }
      if (!sessionRes.ok) {
        const decoded = await decodeApiError(sessionRes)
        throw new Error(decoded.message)
      }

      const sessionData = (await sessionRes.json()) as SessionResponse
      store.setRoomParticipantCredential(roomId, {
        participantSecret: sessionData.participantSecret,
      })
      const sessionId = sessionData.sessionId
      currentSessionId.value = sessionId
      log("✅ Session ready")
      startHeartbeat(sessionId)

      log("📹 Requesting camera access...")
      sessionLifecycle.value = "acquiring_media"
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
        log(`❌ Camera error: ${errorToMessage(e)}`)
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
      sessionLifecycle.value = "publishing"
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

      await throwIfTerminalSessionError(publishRes, "publish")

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
      sessionLifecycle.value = "ready"
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
      sessionLifecycle.value = "failed"
      await cleanupCallPresence()
      media.clearRemoteVideo()
      media.stopLocalMedia()
      log(`❌ Error: ${errorToMessage(e)}`)
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
    sessionLifecycle,
    isRemoteAudioMuted,
    isRemoteVideoOff,
    hadRemoteParticipant,
    isRemoteDisconnected,
    isRemoteMediaInterrupted,
    syncMediaState,
    endRoom,
    leave,
  }
}
