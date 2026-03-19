<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useToast } from '../composables/useToast'

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

const props = defineProps<{ callId: string }>()
const { show: showToast } = useToast()

const USER_TOKEN = import.meta.env.VITE_USER_TOKEN || 'dev-token'

const statusEl = ref<HTMLDivElement>()
const localVid = ref<HTMLVideoElement>()
const remoteVid = ref<HTMLVideoElement>()
const showLogs = ref(false)
const logs = ref<string[]>(['Initializing...'])

function log(msg: string) {
  console.log(msg)
  logs.value.push(msg)
}

async function apiCall(url: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Token': USER_TOKEN,
      ...options.headers,
    },
  })
}

function leave() {
  window.location.search = ''
}

async function pollAndSubscribe(
  pc: RTCPeerConnection,
  sessionId: string
) {
  const checkedTracks = new Set<string>()
  
  const poll = async () => {
    try {
      const res = await apiCall(`/api/calls/${props.callId}/discover-remote-tracks?sessionId=${sessionId}`)
      if (!res.ok) return
      const data = await res.json() as DiscoverResponse
      
      const newTracks = data.tracks.filter(t => !checkedTracks.has(t.trackName))
      
      if (newTracks.length > 0) {
        log(`🔔 Remote participant joined!`)
        
        for (const track of newTracks) {
          checkedTracks.add(track.trackName)
        }
        
        await subscribeToTracks(pc, sessionId, newTracks)
      }
    } catch (e) {
      console.error('Poll error:', e)
    }
    
    setTimeout(poll, 2000)
  }
  
  poll()
}

async function subscribeToTracks(
  pc: RTCPeerConnection,
  sessionId: string,
  remoteTracks: Array<{ trackName: string; sessionId: string; mid: string }>
) {
  try {
    const subscribeRes = await apiCall(`/api/calls/${props.callId}/subscribe-offer`, {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        remoteTracks: remoteTracks.map(t => ({
          trackName: t.trackName,
          sessionId: t.sessionId
        }))
      })
    })
    if (!subscribeRes.ok) throw new Error(`Subscribe failed: ${subscribeRes.status}`)
    const subscribeData = await subscribeRes.json() as SubscribeResponse
    
    await pc.setRemoteDescription(subscribeData.sessionDescription)
    
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    
    const completeRes = await apiCall(`/api/calls/${props.callId}/complete-subscribe`, {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        sdpAnswer: answer.sdp
      })
    })
    if (!completeRes.ok) throw new Error(`Complete subscribe failed: ${completeRes.status}`)
    
    log('✅ Connected to remote participant!')
    showToast('Remote participant connected!', 'success')
    
  } catch (e) {
    log(`❌ Subscribe error: ${e}`)
  }
}

onMounted(async () => {
  log('🚀 Starting call...')
  log(`📞 Call ID: ${props.callId}`)

  // 1. Capture local media
  log('📹 Requesting camera access...')
  let localStream: MediaStream
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    if (localVid.value) {
      localVid.value.srcObject = localStream
    }
    log('✅ Camera connected')
  } catch (e) {
    log(`❌ Camera error: ${e}`)
    showToast('Camera access denied', 'error')
    return
  }

  // 2. Create PeerConnection
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
    bundlePolicy: 'max-bundle'
  })

  pc.ontrack = (e) => {
    log('📡 Remote video received!')
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
    log('🔑 Creating session...')
    const sessionRes = await apiCall(`/api/calls/${props.callId}/session`, { method: 'POST' })
    if (!sessionRes.ok) throw new Error(`Session failed: ${sessionRes.status}`)
    const sessionData = await sessionRes.json() as SessionResponse
    const sessionId = sessionData.sessionId
    log(`✅ Session ready`)

    // 4. Add local tracks
    const transceivers = localStream.getTracks().map(track => 
      pc.addTransceiver(track, { direction: 'sendonly' })
    )

    // 5. Create offer
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    // 6. Publish tracks
    log('📤 Publishing...')
    const publishRes = await apiCall(`/api/calls/${props.callId}/publish-offer`, {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        sdpOffer: offer.sdp,
        tracks: transceivers.map(({ mid, sender }) => ({
          mid: mid!,
          trackName: sender.track?.id || crypto.randomUUID()
        }))
      })
    })
    if (!publishRes.ok) throw new Error(`Publish failed: ${publishRes.status}`)
    const publishData = await publishRes.json() as PublishResponse
    
    await pc.setRemoteDescription(publishData.sessionDescription)
    log('✅ Connected to Cloudflare')

    // Wait for ICE
    await new Promise<void>((res, rej) => {
      const timeout = setTimeout(() => rej(new Error('Connection timeout')), 15000)
      const check = () => {
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          clearTimeout(timeout)
          res()
        } else if (pc.iceConnectionState === 'failed') {
          clearTimeout(timeout)
          rej(new Error('Connection failed'))
        }
      }
      pc.addEventListener('iceconnectionstatechange', check)
      check()
    })
    log('🟢 Ready for calls!')
    showToast('Ready for calls!', 'success')

    // 7. Start polling for remote tracks
    log('👀 Waiting for remote participant...')
    pollAndSubscribe(pc, sessionId)

  } catch (e) {
    log(`❌ Error: ${e}`)
    showToast('Connection failed', 'error')
  }
})
</script>

<template>
  <div class="card" style="max-width: 900px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
      <h2 class="card-title" style="margin: 0; text-align: left;">Call: <code>{{ callId }}</code></h2>
      <div style="display: flex; gap: 0.5rem;">
        <button class="btn btn-secondary" style="font-size: 0.875rem;" @click="showLogs = !showLogs">
          {{ showLogs ? '📋 Hide Logs' : '📋 Show Logs' }}
        </button>
        <button class="btn btn-secondary" style="font-size: 0.875rem;" @click="leave">Leave</button>
      </div>
    </div>
    
    <div v-if="showLogs" ref="statusEl" class="status status-info">{{ logs.join('\n') }}</div>
    
    <div class="video-grid">
      <div class="video-container">
        <video ref="localVid" autoplay muted playsinline></video>
        <span class="video-label">You</span>
      </div>
      <div class="video-container">
        <video ref="remoteVid" autoplay playsinline></video>
        <span class="video-label">Remote</span>
      </div>
    </div>
  </div>
</template>
