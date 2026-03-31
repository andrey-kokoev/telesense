import { onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue"
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
    graceEndsAt?: number
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

  if (response.status === 402) {
    return {
      kind: "service-budget-exhausted" as const,
      message: "Service budget exhausted - room will terminate soon",
      code: errorData.code,
      graceEndsAt: errorData.graceEndsAt as number | undefined,
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
  log: (message: string, kind?: string, details?: Record<string, unknown>) => void
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

  // Chat state
  const CHAT_STORAGE_KEY = `telesense:chat:${roomId}`
  const MAX_STORED_MESSAGES = 100

  function loadChatHistory() {
    try {
      const stored = localStorage.getItem(CHAT_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Array<{
          id: string
          text: string
          timestamp: number
          isLocal: boolean
        }>
        // Validate structure before using
        if (Array.isArray(parsed)) {
          return parsed.slice(-MAX_STORED_MESSAGES)
        }
      }
    } catch {
      // Invalid storage data, start fresh
    }
    return []
  }

  function saveChatHistory() {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatMessages.value))
    } catch {
      // Storage might be full or unavailable
    }
  }

  const chatMessages =
    ref<Array<{ id: string; text: string; timestamp: number; isLocal: boolean }>>(loadChatHistory())
  const dataChannel = ref<RTCDataChannel | null>(null)
  const isChatOpen = ref(false)

  // Auto-save chat history when messages change
  watch(
    chatMessages,
    () => {
      saveChatHistory()
    },
    { deep: true },
  )

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
  ): Promise<boolean> {
    try {
      log(`📤 Subscribing to ${remoteTracks.length} remote tracks...`, "subscribe.start", {
        localSessionId: sessionId,
        remoteTracks: remoteTracks.map((track) => ({
          trackName: track.trackName,
          sessionId: track.sessionId,
          mid: track.mid,
        })),
      })
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

      log("✅ Connected to remote participant!", "subscribe.ok", {
        localSessionId: sessionId,
        remoteSessionIds: [...new Set(remoteTracks.map((track) => track.sessionId))],
        trackCount: subscribeData.tracks?.length || remoteTracks.length,
      })
      showToast("Remote participant connected!", "success")
      return true
    } catch (e) {
      log(`❌ Subscribe error: ${errorToMessage(e)}`, "subscribe.error", {
        localSessionId: sessionId,
        remoteTracks: remoteTracks.map((track) => ({
          trackName: track.trackName,
          sessionId: track.sessionId,
        })),
        error: errorToMessage(e),
      })
      return false
    }
  }

  async function pollAndSubscribe(pc: RTCPeerConnection, sessionId: string) {
    const checkedTracks = new Set<string>()
    let lastDiscoverySignature = ""
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
        const discoverySignature = JSON.stringify({
          remoteParticipantCount: data.remoteParticipantCount,
          tracks: data.tracks.map((track) => ({
            trackName: track.trackName,
            sessionId: track.sessionId,
          })),
        })
        if (
          discoverySignature !== lastDiscoverySignature &&
          (data.remoteParticipantCount > 0 || data.tracks.length > 0)
        ) {
          log(
            `👁️ Discovery saw ${data.remoteParticipantCount} remote participant(s) and ${data.tracks.length} remote track(s)`,
            "discover.poll",
            {
              localSessionId: sessionId,
              remoteParticipantCount: data.remoteParticipantCount,
              remoteParticipants: data.remoteParticipants,
              tracks: data.tracks.map((track) => ({
                trackName: track.trackName,
                sessionId: track.sessionId,
                mid: track.mid,
              })),
            },
          )
          lastDiscoverySignature = discoverySignature
        }
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
          const subscribed = await subscribeToTracks(pc, sessionId, newTracks)
          if (subscribed) {
            for (const track of newTracks) {
              checkedTracks.add(track.trackName)
            }
          }
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
    log("🚀 Starting room...", "session.start", { roomId })
    log(`🚪 Room ID: ${roomId}`)

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
      bundlePolicy: "max-bundle",
    })
    pcRef.value = pc

    pc.ontrack = (event) => {
      log("📡 Remote video received!", "remote.track", {
        kind: event.track.kind,
        trackId: event.track.id,
        streamIds: event.streams.map((stream) => stream.id),
      })
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

    // Handle incoming data channel from remote peer
    pc.ondatachannel = (event) => {
      const channel = event.channel
      if (channel.label === "chat") {
        setupDataChannel(channel)
      }
    }

    try {
      log("🔑 Creating session...", "session.create.start", {
        roomId,
        browserInstanceId: store.browserInstanceId.value,
      })
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
      log("✅ Session ready", "session.create.ok", {
        roomId,
        browserInstanceId: store.browserInstanceId.value,
        sessionId: sessionData.sessionId,
        cloudflareSessionId: sessionData.cloudflareSessionId,
        participantSecretPresent: !!sessionData.participantSecret,
      })
      store.setRoomParticipantCredential(roomId, {
        participantSecret: sessionData.participantSecret,
      })
      const sessionId = sessionData.sessionId
      currentSessionId.value = sessionId
      startHeartbeat(sessionId)

      log("📹 Requesting camera/microphone access...")
      sessionLifecycle.value = "acquiring_media"
      const acquiredTracks: MediaStreamTrack[] = []
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true })
        acquiredTracks.push(...videoStream.getVideoTracks())
        log("✅ Camera connected")
      } catch (e) {
        log(`⚠️ Camera not available: ${errorToMessage(e)}`)
      }
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        acquiredTracks.push(...audioStream.getAudioTracks())
        log("✅ Microphone connected")
      } catch (e) {
        log(`⚠️ Microphone not available: ${errorToMessage(e)}`)
      }
      if (acquiredTracks.length > 0) {
        media.localStream.value = new MediaStream(acquiredTracks)
        media.cameraTrack.value = acquiredTracks.find((t) => t.kind === "video") ?? null
        if (media.localVid.value) {
          media.localVid.value.srcObject = media.localStream.value
        }
      } else {
        log("⚠️ No media devices available - joining as viewer")
        media.localStream.value = null
        media.cameraTrack.value = null
      }

      await syncMediaState()

      const transceivers = media.localStream.value
        ? media.localStream.value
            .getTracks()
            .map((track) => pc.addTransceiver(track, { direction: "sendonly" }))
        : []
      media.publishedVideoSender.value =
        transceivers.find(({ sender }) => sender.track?.kind === "video")?.sender ?? null

      // Create data channel for chat (before creating offer)
      try {
        const dc = pc.createDataChannel("chat", {
          ordered: true,
        })
        setupDataChannel(dc)
        dataChannel.value = dc
        log("💬 Chat data channel created")
      } catch (e) {
        log(`⚠️ Could not create data channel: ${errorToMessage(e)}`)
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      log("📤 Publishing...", "publish.start", {
        sessionId,
        trackKinds: media.localStream.value?.getTracks().map((track) => track.kind) ?? [],
      })
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
      log("✅ Connected to Cloudflare", "publish.ok", {
        sessionId,
        confirmedTrackCount: publishData.tracks?.length || 0,
      })

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

  function setupDataChannel(dc: RTCDataChannel) {
    dc.onopen = () => {
      log("💬 Chat channel open")
    }

    dc.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as
          | { id: string; text: string; timestamp: number }
          | { type: "delete"; messageId: string }

        // Handle delete signal
        if ("type" in data && data.type === "delete") {
          const index = chatMessages.value.findIndex((m) => m.id === data.messageId)
          if (index !== -1) {
            chatMessages.value.splice(index, 1)
            log("💬 Message deleted by remote")
          }
          return
        }

        // Handle regular message
        if ("text" in data) {
          chatMessages.value.push({
            ...data,
            isLocal: false,
          })
          // Keep only last 100 messages
          if (chatMessages.value.length > 100) {
            chatMessages.value.shift()
          }
          log("💬 Received message")
        }
      } catch {
        // Ignore malformed messages
      }
    }

    dc.onclose = () => {
      log("💬 Chat channel closed")
    }

    dc.onerror = (e) => {
      log(`💬 Chat error: ${errorToMessage(e)}`)
    }
  }

  function sendChatMessage(text: string): boolean {
    const dc = dataChannel.value
    if (!dc || dc.readyState !== "open") {
      return false
    }

    const message = {
      id: crypto.randomUUID(),
      text: text.slice(0, 500), // Limit message length
      timestamp: Date.now(),
    }

    try {
      dc.send(JSON.stringify(message))
      chatMessages.value.push({
        ...message,
        isLocal: true,
      })
      // Keep only last 100 messages
      if (chatMessages.value.length > 100) {
        chatMessages.value.shift()
      }
      return true
    } catch {
      return false
    }
  }

  function deleteMessage(messageId: string): "deleted" | "local-only" | "not-found" {
    const index = chatMessages.value.findIndex((m) => m.id === messageId)
    if (index === -1) {
      return "not-found"
    }

    const message = chatMessages.value[index]

    // Remove locally
    chatMessages.value.splice(index, 1)

    // Try to notify remote if session is active and it's a local message
    const dc = dataChannel.value
    if (message.isLocal && dc && dc.readyState === "open") {
      try {
        dc.send(
          JSON.stringify({
            type: "delete",
            messageId,
          }),
        )
        return "deleted"
      } catch {
        // Failed to notify remote, but local deletion succeeded
        return "local-only"
      }
    }

    // For remote messages or if no active session, only local deletion
    return message.isLocal ? "local-only" : "deleted"
  }

  function toggleChat() {
    isChatOpen.value = !isChatOpen.value
  }

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
    dataChannel.value?.close()
    pcRef.value?.close()
    pcRef.value = null
    dataChannel.value = null
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
    chatMessages,
    isChatOpen,
    sendChatMessage,
    deleteMessage,
    toggleChat,
    syncMediaState,
    endRoom,
    leave,
  }
}
