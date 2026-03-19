// Cloudflare Realtime Client — Full 1:1 Call Implementation
// Protocol verified via Echo Demo 2026-03-18

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

// User token for API authentication
const USER_TOKEN = import.meta.env.VITE_USER_TOKEN || 'dev-token'

// Helper for API calls with auth
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

const appEl = document.getElementById('app') as HTMLDivElement

function renderLandingPage() {
  appEl.innerHTML = `
    <div class="card">
      <h2 class="card-title">Join a Video Call</h2>
      <p class="card-description">Enter a call ID or generate a random one to start</p>
      
      <div class="input-group">
        <input 
          type="text" 
          id="callIdInput" 
          class="input" 
          placeholder="Enter call ID (e.g., team-meeting)"
          autocomplete="off"
        >
      </div>
      
      <button id="joinBtn" class="btn btn-primary btn-lg btn-full">
        Join Call
      </button>
      
      <div class="divider">
        <span>or</span>
      </div>
      
      <button id="randomBtn" class="btn btn-secondary btn-full">
        🎲 Generate Random Call ID
      </button>
      
      <div class="info-box">
        💡 <strong>Tip:</strong> Share your call ID with someone to start a 1:1 video call. Both participants use the same ID.
      </div>
    </div>
  `
  
  const callIdInput = document.getElementById('callIdInput') as HTMLInputElement
  const joinBtn = document.getElementById('joinBtn') as HTMLButtonElement
  const randomBtn = document.getElementById('randomBtn') as HTMLButtonElement
  
  const startCall = (callId: string) => {
    if (!callId.trim()) {
      callIdInput.focus()
      return
    }
    window.location.search = `?call=${encodeURIComponent(callId.trim())}`
  }
  
  joinBtn.onclick = () => startCall(callIdInput.value)
  callIdInput.onkeypress = (e) => { if (e.key === 'Enter') startCall(callIdInput.value) }
  randomBtn.onclick = () => {
    const randomId = Math.random().toString(36).substring(2, 10)
    callIdInput.value = randomId
    startCall(randomId)
  }
  
  callIdInput.focus()
}

function renderCallPage(callId: string) {
  appEl.innerHTML = `
    <div class="card" style="max-width: 900px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
        <h2 class="card-title" style="margin: 0; text-align: left;">Call: <code>${escapeHtml(callId)}</code></h2>
        <div style="display: flex; gap: 0.5rem;">
          <button id="toggleLogBtn" class="btn btn-secondary" style="font-size: 0.875rem;">📋 Show Logs</button>
          <button id="leaveBtn" class="btn btn-secondary" style="font-size: 0.875rem;">Leave</button>
        </div>
      </div>
      
      <div id="status" class="status status-info" style="display: none;">Initializing...</div>
      
      <div class="video-grid">
        <div class="video-container">
          <video id="local" autoplay muted playsinline></video>
          <span class="video-label">You</span>
        </div>
        <div class="video-container">
          <video id="remote" autoplay playsinline></video>
          <span class="video-label">Remote</span>
        </div>
      </div>
    </div>
  `
  
  const statusEl = document.getElementById('status') as HTMLDivElement
  const toggleBtn = document.getElementById('toggleLogBtn') as HTMLButtonElement
  
  toggleBtn.onclick = () => {
    const isHidden = statusEl.style.display === 'none'
    statusEl.style.display = isHidden ? 'block' : 'none'
    toggleBtn.textContent = isHidden ? '📋 Hide Logs' : '📋 Show Logs'
  }
  
  document.getElementById('leaveBtn')!.onclick = () => {
    window.location.search = ''
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function log(statusEl: HTMLDivElement, msg: string) {
  console.log(msg)
  statusEl.textContent += msg + '\n'
}

async function init() {
  const callId = new URLSearchParams(location.search).get('call')
  
  if (!callId) {
    renderLandingPage()
    return
  }
  
  renderCallPage(callId)
  
  const statusEl = document.getElementById('status') as HTMLDivElement
  const localVid = document.getElementById('local') as HTMLVideoElement
  const remoteVid = document.getElementById('remote') as HTMLVideoElement
  
  log(statusEl, '🚀 Starting call...')
  log(statusEl, `📞 Call ID: ${callId}`)

  // 1. Capture local media
  log(statusEl, '📹 Requesting camera access...')
  let localStream: MediaStream
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    localVid.srcObject = localStream
    log(statusEl, '✅ Camera connected')
    statusEl.className = 'status status-success'
  } catch (e) {
    log(statusEl, `❌ Camera error: ${e}`)
    statusEl.className = 'status status-error'
    return
  }

  // 2. Create PeerConnection
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
    bundlePolicy: 'max-bundle'
  })

  pc.ontrack = (e) => {
    log(statusEl, '📡 Remote video received!')
    let stream = remoteVid.srcObject as MediaStream | null
    if (!stream) {
      stream = new MediaStream()
      remoteVid.srcObject = stream
    }
    stream.addTrack(e.track)
  }

  pc.oniceconnectionstatechange = () => {
    log(statusEl, `🧊 Connection: ${pc.iceConnectionState}`)
  }

  try {
    // 3. Create session
    log(statusEl, '🔑 Creating session...')
    const sessionRes = await apiCall(`/api/calls/${callId}/session`, { method: 'POST' })
    if (!sessionRes.ok) throw new Error(`Session failed: ${sessionRes.status}`)
    const sessionData = await sessionRes.json() as SessionResponse
    const sessionId = sessionData.sessionId
    log(statusEl, `✅ Session ready`)

    // 4. Add local tracks
    const transceivers = localStream.getTracks().map(track => 
      pc.addTransceiver(track, { direction: 'sendonly' })
    )

    // 5. Create offer
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    // 6. Publish tracks
    log(statusEl, '📤 Publishing...')
    const publishRes = await apiCall(`/api/calls/${callId}/publish-offer`, {
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
    log(statusEl, '✅ Connected to Cloudflare')

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
    log(statusEl, '🟢 Ready for calls!')

    // 7. Start polling for remote tracks
    log(statusEl, '👀 Waiting for remote participant...')
    pollAndSubscribe(callId, sessionId, pc, statusEl)

  } catch (e) {
    log(statusEl, `❌ Error: ${e}`)
    statusEl.className = 'status status-error'
  }
}

async function pollAndSubscribe(
  callId: string, 
  sessionId: string, 
  pc: RTCPeerConnection,
  statusEl: HTMLDivElement
) {
  const checkedTracks = new Set<string>()
  
  const poll = async () => {
    try {
      const res = await apiCall(`/api/calls/${callId}/discover-remote-tracks?sessionId=${sessionId}`)
      if (!res.ok) return
      const data = await res.json() as DiscoverResponse
      
      const newTracks = data.tracks.filter(t => !checkedTracks.has(t.trackName))
      
      if (newTracks.length > 0) {
        log(statusEl, `🔔 Remote participant joined!`)
        
        for (const track of newTracks) {
          checkedTracks.add(track.trackName)
        }
        
        await subscribeToTracks(callId, sessionId, pc, newTracks, statusEl)
      }
    } catch (e) {
      console.error('Poll error:', e)
    }
    
    setTimeout(poll, 2000)
  }
  
  poll()
}

async function subscribeToTracks(
  callId: string, 
  sessionId: string, 
  pc: RTCPeerConnection,
  remoteTracks: Array<{ trackName: string; sessionId: string; mid: string }>,
  statusEl: HTMLDivElement
) {
  try {
    const subscribeRes = await apiCall(`/api/calls/${callId}/subscribe-offer`, {
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
    
    const completeRes = await apiCall(`/api/calls/${callId}/complete-subscribe`, {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        sdpAnswer: answer.sdp
      })
    })
    if (!completeRes.ok) throw new Error(`Complete subscribe failed: ${completeRes.status}`)
    
    log(statusEl, '✅ Connected to remote participant!')
    
  } catch (e) {
    log(statusEl, `❌ Subscribe error: ${e}`)
  }
}

init()
