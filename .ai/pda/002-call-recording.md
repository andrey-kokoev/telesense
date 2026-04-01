# PDA Descent: Call Recording Feature in Telesense

## Status: REQUIREMENTS ANALYSIS

Feature request: Add call recording with dual-party consent and flexible stream selection.

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

## Technical Constraints

### WebRTC Recording Options

1. **MediaRecorder API** (Client-side)
   - Records from MediaStream directly
   - Works with existing peer connection
   - Blob output, can upload after recording
   - Pros: Simple, no server changes needed
   - Cons: Recording stops if tab closes, memory limits for long recordings

2. **Cloudflare Realtime Server-Side Recording**
   - Check if Realtime API supports recording
   - Would need server-side configuration
   - Pros: More reliable, works even if client disconnects
   - Cons: May not exist, requires vendor lock-in

3. **Custom Server Recording**
   - Stream tracks through server, record there
   - Pros: Full control
   - Cons: High bandwidth, adds latency

### Recommendation: MediaRecorder API

For MVP, use client-side MediaRecorder:

- Records the received remote streams
- Can mix multiple tracks into one recording
- Upload to storage (R2/S3) after recording stops

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

## Architecture Questions

1. **How to transport consent?**
   - Via existing chat polling mechanism (POST/GET endpoints)
   - Or via data channel (if we fix it) for lower latency

2. **Where to store recordings?**
   - Client-side: Blob in memory, then upload
   - Server: Cloudflare R2 or similar object storage

3. **Recording format?**
   - WebM (native to MediaRecorder)
   - Or MP4 via conversion (ffmpeg-wasm?)

4. **How to handle one participant declining?**
   - Recording cannot start without both consent
   - Consent can be revoked at any time (stops recording)

---

## PDA Next Steps

1. **Spike: MediaRecorder API capability**
   - Can we record remote MediaStream tracks?
   - Can we mix multiple tracks?
   - Test in isolation first

2. **Design: Consent protocol**
   - Message types needed
   - State machine for recording session

3. **UI: Recording controls**
   - Button placement (in call controls?)
   - Selection modal design
   - Recording indicator while active

4. **Storage: Upload mechanism**
   - Presigned URLs for R2 upload
   - Or multipart upload for large files

---

## Open Questions

- [ ] Does Cloudflare Realtime have native recording we should use instead?
- [ ] What are storage limits/costs for R2?
- [ ] Should recordings be encrypted at rest?
- [ ] How long should recordings be retained?
- [ ] Should participants be able to download their recordings?

---

## PDA Status

**Ambiguity:** Medium - spike created, awaiting test results.

**Spike created:** `src/client/debug/recording-spike.html`

### Quick Test Instructions

```bash
# Terminal 1
cd apps/telesense
pnpm run dev

# Then open in TWO browsers:
# http://localhost:5173/src/client/debug/recording-spike.html
```

### Decision Matrix Based on Spike Results

| Remote Recording Works?  | Proceed With                         | Abort Condition         |
| ------------------------ | ------------------------------------ | ----------------------- |
| **Yes**                  | MediaRecorder API (client-side)      | None                    |
| **No**                   | Research Cloudflare native recording | If CF doesn't support   |
| **Partial** (audio only) | Hybrid approach                      | If quality unacceptable |

**Next step:** Run spike in two browsers, document results.
