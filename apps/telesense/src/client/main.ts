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

const statusEl = document.getElementById('status') as HTMLDivElement
const localVid = document.getElementById('local') as HTMLVideoElement
const remoteVid = document.getElementById('remote') as HTMLVideoElement

function log(msg: string) {
  console.log(msg)
  statusEl.textContent += msg + '\n'
}

async function init() {
  log('🚀 Initializing Telesense...')

  const callId = new URLSearchParams(location.search).get('call') || 'test'
  log(`📞 Call ID: ${callId}`)

  // 1. Capture local media
  log('📹 Capturing local media...')
  let localStream: MediaStream
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    localVid.srcObject = localStream
    log('✅ Local media captured')
  } catch (e) {
    log(`❌ Failed to capture: ${e}`)
    return
  }

  // 2. Create PeerConnection
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
    bundlePolicy: 'max-bundle'
  })

  pc.ontrack = (e) => {
    log('📡 Received remote track!')
    let stream = remoteVid.srcObject as MediaStream | null
    if (!stream) {
      stream = new MediaStream()
      remoteVid.srcObject = stream
    }
    stream.addTrack(e.track)
  }

  pc.oniceconnectionstatechange = () => {
    log(`🧊 ICE state: ${pc.iceConnectionState}`)
  }

  try {
    // 3. Create session
    log('🔑 Creating session...')
    const sessionRes = await fetch(`/api/calls/${callId}/session`, { method: 'POST' })
    if (!sessionRes.ok) throw new Error(`Session failed: ${sessionRes.status}`)
    const sessionData = await sessionRes.json() as SessionResponse
    const sessionId = sessionData.sessionId
    log(`✅ Session created: ${sessionId.slice(0, 8)}...`)

    // 4. Add local tracks
    const transceivers = localStream.getTracks().map(track => 
      pc.addTransceiver(track, { direction: 'sendonly' })
    )

    // 5. Create offer
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    // 6. Publish tracks
    log('📤 Publishing tracks...')
    const publishRes = await fetch(`/api/calls/${callId}/publish-offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    log('✅ Published and connected to Cloudflare')

    // Wait for ICE to connect for publishing
    await new Promise<void>((res, rej) => {
      const timeout = setTimeout(() => rej(new Error('ICE timeout')), 10000)
      const check = () => {
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          clearTimeout(timeout)
          res()
        } else if (pc.iceConnectionState === 'failed') {
          clearTimeout(timeout)
          rej(new Error('ICE failed'))
        }
      }
      pc.addEventListener('iceconnectionstatechange', check)
      check()
    })
    log('🟢 Publish ICE connected')

    // 7. Start polling for remote tracks
    log('👀 Polling for remote tracks...')
    pollAndSubscribe(callId, sessionId, pc)

  } catch (e) {
    log(`❌ Error: ${e}`)
  }
}

async function pollAndSubscribe(callId: string, sessionId: string, pc: RTCPeerConnection) {
  const checkedTracks = new Set<string>()
  
  const poll = async () => {
    try {
      const res = await fetch(`/api/calls/${callId}/discover-remote-tracks?sessionId=${sessionId}`)
      if (!res.ok) return
      const data = await res.json() as DiscoverResponse
      
      const newTracks = data.tracks.filter(t => !checkedTracks.has(t.trackName))
      
      if (newTracks.length > 0) {
        log(`🔔 Found ${newTracks.length} new remote track(s)`)
        
        for (const track of newTracks) {
          checkedTracks.add(track.trackName)
        }
        
        // Subscribe to new tracks
        await subscribeToTracks(callId, sessionId, pc, newTracks)
      }
    } catch (e) {
      console.error('Poll error:', e)
    }
    
    // Poll every 2 seconds
    setTimeout(poll, 2000)
  }
  
  poll()
}

async function subscribeToTracks(
  callId: string, 
  sessionId: string, 
  pc: RTCPeerConnection,
  remoteTracks: Array<{ trackName: string; sessionId: string; mid: string }>
) {
  log('📥 Subscribing to remote tracks...')
  
  try {
    // 1. Request subscription offer from backend
    const subscribeRes = await fetch(`/api/calls/${callId}/subscribe-offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    
    // 2. Set remote description (Cloudflare's Offer)
    await pc.setRemoteDescription(subscribeData.sessionDescription)
    
    // 3. Create answer
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    
    // 4. Complete subscription
    const completeRes = await fetch(`/api/calls/${callId}/complete-subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        sdpAnswer: answer.sdp
      })
    })
    if (!completeRes.ok) throw new Error(`Complete subscribe failed: ${completeRes.status}`)
    
    log('✅ Subscribed to remote tracks! Media should flow shortly...')
    
  } catch (e) {
    log(`❌ Subscribe error: ${e}`)
  }
}

init()
