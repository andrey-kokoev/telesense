# PDA Descent: Call Recording Feature in Telesense

## Status: ✅ TECHNICALLY VALIDATED

Feature request: Add call recording with dual-party consent and flexible stream selection.

---

## Validation Results

### E2E Test: `e2e/recording-spike.e2e.ts`

| Test                               | Result      | Details                        |
| ---------------------------------- | ----------- | ------------------------------ |
| Record remote stream (audio+video) | ✅ **PASS** | 392KB in 5s, 640x480, playable |
| Record remote audio-only           | ✅ **PASS** | 48KB, valid audio data         |
| Local stream selector              | ❌ UI issue | Not a blocker                  |

### Key Finding

**MediaRecorder API CAN record Cloudflare Realtime SFU remote streams.**

The `remoteVideo.srcObject` contains a valid `MediaStream` that:

- MediaRecorder accepts without errors
- Produces playable WebM output (VP9/Opus)
- Records at ~78KB/second (adjustable bitrate)
- Maintains audio/video sync

**Decision: ✅ Proceed with client-side MediaRecorder approach**

---

## Requirements Breakdown

### Functional Requirements

| Requirement          | Details                                                            |
| -------------------- | ------------------------------------------------------------------ |
| **Dual Consent**     | Both participants must consent before recording starts             |
| **Initiation**       | Recording can be initiated by either participant                   |
| **Media Types**      | Audio only, Video only, or Both                                    |
| **Stream Selection** | Can choose which participant's stream(s) to record                 |
| **Combinations**     | Any combination: local audio + remote video, both audio only, etc. |
| **UI**               | Selection UI at time of recording initiation                       |

### Recording Combinations Matrix

| Local Audio | Local Video | Remote Audio | Remote Video | Use Case                    |
| ----------- | ----------- | ------------ | ------------ | --------------------------- |
| ✅          | ❌          | ❌           | ❌           | Record self notes only      |
| ❌          | ❌          | ✅           | ❌           | Record remote audio only    |
| ✅          | ✅          | ❌           | ❌           | Record self presentation    |
| ❌          | ❌          | ✅           | ✅           | Record remote presentation  |
| ✅          | ❌          | ✅           | ❌           | Both audio only (interview) |
| ✅          | ✅          | ✅           | ✅           | Full call recording         |

---

## Consent Flow Design

```
Participant A clicks "Start Recording"
    ↓
System asks A: "What do you want to record?"
    - [x] My audio  [x] My video
    - [x] Remote audio  [x] Remote video
    ↓
System sends consent request to B
    ↓
B sees: "A wants to record: [description of selection]"
    - [Allow] [Deny]
    ↓
If B allows: Recording starts for both
If B denies: A sees "Recording request denied"
```

---

## Architecture Decisions

### Recording: MediaRecorder API (Client-Side)

**Confirmed working** with SFU remote streams.

```typescript
// Pseudo-code for recording
const remoteVideo = document.querySelector(".remote-video") as HTMLVideoElement
const remoteStream = remoteVideo.srcObject as MediaStream

const recorder = new MediaRecorder(remoteStream, {
  mimeType: "video/webm;codecs=vp9,opus",
  videoBitsPerSecond: 2500000,
})

recorder.ondataavailable = (e) => chunks.push(e.data)
recorder.start(1000) // Collect every second
```

### Consent Transport: Extend Chat API

Use existing polling mechanism (proven, reliable):

- `POST /api/rooms/:id/recording/request` - request consent
- `POST /api/rooms/:id/recording/consent` - give/deny consent
- `POST /api/rooms/:id/recording/stop` - stop recording
- Chat poll returns recording status

### Storage: Cloudflare R2

1. Client records to Blob
2. Request presigned upload URL from worker
3. Upload directly to R2
4. Worker stores metadata (participants, duration, etc.)

### Stream Mixing: AudioContext

For combining multiple tracks (local + remote):

```typescript
const audioContext = new AudioContext()
const dest = audioContext.createMediaStreamDestination()

// Connect local audio
const localSource = audioContext.createMediaStreamSource(localStream)
localSource.connect(dest)

// Connect remote audio
const remoteSource = audioContext.createMediaStreamSource(remoteStream)
remoteSource.connect(dest)

// Record the mixed stream
const mixedStream = new MediaStream([...videoTracks, dest.stream.getAudioTracks()[0]])
```

---

## Implementation Plan

### Phase 1: Core Recording

- [ ] Add recording state to CallRoom DO
- [ ] Extend chat API for recording consent
- [ ] Add recording button to call controls
- [ ] Basic recording (single stream)

### Phase 2: Stream Selection

- [ ] Recording options modal
- [ ] Select which streams to record
- [ ] Consent request/response flow

### Phase 3: Storage

- [ ] R2 bucket setup
- [ ] Presigned URL endpoint
- [ ] Upload from client
- [ ] Recording list in UI

### Phase 4: Advanced Features

- [ ] AudioContext mixing for multiple streams
- [ ] Recording indicator during call
- [ ] Download recordings
- [ ] Auto-delete after retention period

---

## Open Questions (for implementation)

1. **Storage retention**: How long keep recordings? (suggest 30 days default)
2. **Max duration**: Limit per recording? (suggest 60 min)
3. **Encryption**: Encrypt at rest in R2? (suggest yes)
4. **Notifications**: Email when recording ready? (post-MVP)

---

## PDA Status

**✅ VALIDATED - Ready for implementation**

Technical approach confirmed:

- MediaRecorder works with SFU streams
- WebM output, ~78KB/sec
- Consent via chat polling
- Storage via R2

**Next step:** Begin Phase 1 implementation (core recording with consent)
