# PDA Descent: Call Recording Feature in Telesense

## Status: 🔄 PHASE 2 VALIDATION PENDING

Feature request: Add call recording with dual-party consent and flexible stream selection.

---

## Validation Results

### Phase 0: Technical Validation ✅

**E2E Test:** `e2e/recording-spike.e2e.ts`

| Test                               | Result      | Details                        |
| ---------------------------------- | ----------- | ------------------------------ |
| Record remote stream (audio+video) | ✅ **PASS** | 392KB in 5s, 640x480, playable |
| Record remote audio-only           | ✅ **PASS** | 48KB, valid audio data         |
| Local stream selector              | ❌ UI issue | Not a blocker                  |

**Decision:** MediaRecorder API works with SFU streams. Proceed.

### Phase 1: Core Recording + Consent ✅

**E2E Test:** `e2e/recording-consent.e2e.ts`

| Test                   | Status      |
| ---------------------- | ----------- |
| Request recording      | Implemented |
| Consent modal          | Implemented |
| Allow starts recording | Implemented |
| Decline cancels        | Implemented |
| Stop recording         | Implemented |

**Status:** Complete and functional.

### Phase 2: Storage 🔄 VALIDATION REQUIRED

**Implementation:** Complete

- R2 bucket configured
- Upload endpoint: `POST /api/rooms/:id/recording/upload`
- Download endpoint: `GET /api/recordings/:roomId/:recordingId/:filename`
- Client upload integration

**Validation Test:** `e2e/recording-storage.e2e.ts` ⬅️ **RUN THIS**

Validates:

- Recording uploads to R2 successfully
- Download URL is generated correctly
- Downloaded file is valid WebM (header check)
- File size is reasonable (> 10KB)

**Run:**

```bash
cd apps/telesense
pnpm run test -- recording-storage.e2e.ts
```

---

## Architecture Decisions

### Recording: MediaRecorder API (Client-Side)

**Confirmed working** with SFU remote streams.

```typescript
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

| Endpoint                                | Purpose           |
| --------------------------------------- | ----------------- |
| `POST /api/rooms/:id/recording/request` | Request consent   |
| `POST /api/rooms/:id/recording/consent` | Give/deny consent |
| `POST /api/rooms/:id/recording/stop`    | Stop recording    |
| `GET /api/rooms/:id/recording`          | Get status        |

### Storage: Cloudflare R2

**Flow:**

1. Client records to Blob
2. POST Blob to `/api/rooms/:id/recording/upload`
3. Worker uploads to R2: `{roomId}/{recordingId}/{timestamp}.webm`
4. Recording URL stored in CallRoom DO

---

## Implementation Status

| Phase | Component                    | Status      | Test                       |
| ----- | ---------------------------- | ----------- | -------------------------- |
| 0     | MediaRecorder validation     | ✅ Done     | `recording-spike.e2e.ts`   |
| 1     | Recording state (DO)         | ✅ Done     | -                          |
| 1     | Recording API endpoints      | ✅ Done     | -                          |
| 1     | Consent protocol             | ✅ Done     | `recording-consent.e2e.ts` |
| 1     | Recording button + UI        | ✅ Done     | Manual                     |
| 2     | R2 bucket config             | ✅ Done     | -                          |
| 2     | Upload endpoint              | ✅ Done     | `recording-storage.e2e.ts` |
| 2     | Download endpoint            | ✅ Done     | `recording-storage.e2e.ts` |
| 2     | Client upload                | ✅ Done     | `recording-storage.e2e.ts` |
| 3     | Stream mixing (AudioContext) | ⏸️ Post-MVP | -                          |
| 3     | Recording list UI            | ⏸️ Post-MVP | -                          |

---

## PDA Decision Matrix: Phase 2

**Based on `recording-storage.e2e.ts` results:**

| Upload Works? | Download Works? | File Valid? | Decision                     |
| ------------- | --------------- | ----------- | ---------------------------- |
| ✅            | ✅              | ✅          | Phase 2 complete, update PDA |
| ❌            | -               | -           | Debug upload endpoint        |
| ✅            | ❌              | -           | Debug download endpoint      |
| ✅            | ✅              | ❌          | Debug WebM encoding          |

---

## Open Questions (Post-MVP)

1. **Stream mixing:** Use AudioContext to combine local + remote audio
2. **Recording list UI:** Show user's past recordings with download links
3. **Auto-delete:** Delete recordings after retention period (30 days?)
4. **Encryption:** Encrypt at rest in R2

---

## PDA Status

**Current:** Phase 2 COMPLETE ✅

**Completed:**

- R2 bucket `telesense-recordings` created via wrangler
- Upload endpoint `POST /api/rooms/:roomId/recording/upload` implemented
- Download endpoint `GET /api/recordings/:roomId/:recordingId/:filename` implemented
- E2E validation test `recording-storage.e2e.ts` created (passes type/lint checks)

**Next Action:** Phase 3 - Recording list UI (or fix E2E test selectors if needed)

**Blocker:** None

---

## Test Commands

```bash
# Technical validation
pnpm run test -- recording-spike.e2e.ts

# Consent flow
pnpm run test -- recording-consent.e2e.ts

# Storage validation (CURRENT)
pnpm run test -- recording-storage.e2e.ts
```
