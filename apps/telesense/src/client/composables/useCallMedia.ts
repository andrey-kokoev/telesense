import { ref } from "vue"

export function useCallMedia({
  log,
  showToast,
  syncMediaState,
}: {
  log: (message: string) => void
  showToast: (message: string, type?: "success" | "error" | "info") => void
  syncMediaState: () => Promise<void> | void
}) {
  const localVid = ref<HTMLVideoElement>()
  const remoteVid = ref<HTMLVideoElement>()
  const remoteStream = ref<MediaStream | null>(null)
  const localStream = ref<MediaStream | null>(null)
  const publishedVideoSender = ref<RTCRtpSender | null>(null)
  const cameraTrack = ref<MediaStreamTrack | null>(null)
  const screenTrack = ref<MediaStreamTrack | null>(null)
  const isAudioMuted = ref(false)
  const isVideoOff = ref(false)
  const isScreenSharing = ref(false)
  let lastTap = 0

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
      await syncMediaState()
      log("🖥️ Screen sharing started")
    } catch (e) {
      log(`❌ Screen share error: ${e}`)
      showToast("Could not start screen share", "error")
    }
  }

  function toggleAudio() {
    if (!localStream.value) return
    for (const track of localStream.value.getAudioTracks()) {
      track.enabled = !track.enabled
    }
    isAudioMuted.value = !isAudioMuted.value
    void syncMediaState()
    log(isAudioMuted.value ? "🎤 Microphone muted" : "🎤 Microphone unmuted")
  }

  function toggleVideo() {
    if (!localStream.value || isScreenSharing.value) return
    for (const track of localStream.value.getVideoTracks()) {
      track.enabled = !track.enabled
    }
    isVideoOff.value = !isVideoOff.value
    void syncMediaState()
    log(isVideoOff.value ? "📹 Camera off" : "📹 Camera on")
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

  function onVideoTap(videoType: "local" | "remote") {
    const now = Date.now()
    if (now - lastTap < 300) {
      void toggleFullscreen(videoType)
    }
    lastTap = now
  }

  return {
    localVid,
    remoteVid,
    remoteStream,
    localStream,
    publishedVideoSender,
    cameraTrack,
    screenTrack,
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
  }
}
