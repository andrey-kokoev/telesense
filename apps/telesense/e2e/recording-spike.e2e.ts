import { expect, test } from "@playwright/test"

/**
 * Recording Spike E2E Test
 *
 * Validates that MediaRecorder API can record remote WebRTC streams
 * from Cloudflare Realtime SFU.
 *
 * Success criteria:
 * - MediaRecorder can capture remote MediaStream tracks
 * - Recorded blob has valid video data
 * - Recording can be played back
 */

test.describe("Recording spike - MediaRecorder validation", () => {
  test("can record remote stream from SFU", async ({ browser }) => {
    const roomId = `R${Date.now().toString().slice(-5)}`.slice(0, 6).toUpperCase()

    // Create two isolated browser contexts
    const contextA = await browser.newContext()
    const contextB = await browser.newContext()

    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()

    // Capture console logs
    const logsA: string[] = []
    const logsB: string[] = []
    pageA.on("console", (msg) => logsA.push(msg.text()))
    pageB.on("console", (msg) => logsB.push(msg.text()))

    try {
      // ===== SETUP: Both browsers join same room =====
      await pageA.goto(`/?room=${roomId}`)
      await pageB.goto(`/?room=${roomId}`)

      // Wait for both to show call view
      await expect(pageA.getByText(roomId)).toBeVisible({ timeout: 10000 })
      await expect(pageB.getByText(roomId)).toBeVisible({ timeout: 10000 })

      // Wait for connection established
      await expect(pageA.getByText("Remote participant connected!")).toBeVisible({
        timeout: 30000,
      })
      await expect(pageB.getByText("Remote participant connected!")).toBeVisible({
        timeout: 10000,
      })

      // Wait a bit for streams to stabilize
      await pageA.waitForTimeout(2000)

      // ===== TEST: Browser A records remote stream from B =====

      // Inject recording test code into page A
      const recordingResult = await pageA.evaluate(async () => {
        const result = {
          success: false,
          error: null as string | null,
          duration: 0,
          blobSize: 0,
          mimeType: "",
          tracksRecorded: [] as string[],
          canPlayBack: false,
        }

        try {
          // Find the remote video element
          const remoteVideo = document.querySelector(
            'video[class*="remote"], video:not([muted])',
          ) as HTMLVideoElement
          if (!remoteVideo) {
            throw new Error("Remote video element not found")
          }

          // Get the remote stream
          const remoteStream = remoteVideo.srcObject as MediaStream
          if (!remoteStream) {
            throw new Error("No remote stream available")
          }

          // Log what tracks we have
          const tracks = remoteStream.getTracks()
          result.tracksRecorded = tracks.map((t) => `${t.kind}:${t.label}`)
          console.log("Remote tracks found:", result.tracksRecorded)

          if (tracks.length === 0) {
            throw new Error("Remote stream has no tracks")
          }

          // Find supported MIME type
          const mimeTypes = [
            "video/webm;codecs=vp9,opus",
            "video/webm;codecs=vp8,opus",
            "video/webm",
          ]
          let selectedMimeType = ""
          for (const type of mimeTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
              selectedMimeType = type
              break
            }
          }

          if (!selectedMimeType) {
            throw new Error("No supported MIME type found")
          }
          result.mimeType = selectedMimeType

          // Create MediaRecorder
          const mediaRecorder = new MediaRecorder(remoteStream, {
            mimeType: selectedMimeType,
          })

          const chunks: Blob[] = []

          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              chunks.push(e.data)
            }
          }

          // Start recording
          const recordDuration = 5000 // 5 seconds
          mediaRecorder.start(100) // Collect every 100ms

          // Wait for recording duration
          await new Promise((resolve) => setTimeout(resolve, recordDuration))

          // Stop recording
          await new Promise<void>((resolve) => {
            mediaRecorder.onstop = () => resolve()
            mediaRecorder.stop()
          })

          result.duration = recordDuration

          // Analyze recording
          if (chunks.length === 0) {
            throw new Error("No data recorded")
          }

          const blob = new Blob(chunks, { type: selectedMimeType })
          result.blobSize = blob.size

          console.log(`Recorded ${chunks.length} chunks, total size: ${blob.size} bytes`)

          // Validate: recording should have reasonable size (> 10KB for 5 seconds)
          if (blob.size < 10000) {
            throw new Error(`Recording too small: ${blob.size} bytes`)
          }

          // Validate: try to play back
          const url = URL.createObjectURL(blob)
          const testVideo = document.createElement("video")

          const canPlay = await new Promise<boolean>((resolve) => {
            testVideo.onloadedmetadata = () => {
              console.log(`Playback metadata: ${testVideo.videoWidth}x${testVideo.videoHeight}`)
              resolve(testVideo.videoWidth > 0 && testVideo.duration > 0)
            }
            testVideo.onerror = () => {
              console.error("Playback failed")
              resolve(false)
            }
            // Timeout fallback
            setTimeout(() => resolve(false), 5000)
            testVideo.src = url
            testVideo.load()
          })

          result.canPlayBack = canPlay
          URL.revokeObjectURL(url)

          if (!canPlay) {
            throw new Error("Recording cannot be played back")
          }

          result.success = true
        } catch (err) {
          result.error = err instanceof Error ? err.message : String(err)
          console.error("Recording test failed:", result.error)
        }

        return result
      })

      // Log results
      console.log("\n=== Recording Test Result ===")
      console.log("Success:", recordingResult.success)
      console.log("Duration:", recordingResult.duration, "ms")
      console.log("Blob size:", recordingResult.blobSize, "bytes")
      console.log("MIME type:", recordingResult.mimeType)
      console.log("Tracks:", recordingResult.tracksRecorded)
      console.log("Can playback:", recordingResult.canPlayBack)
      if (recordingResult.error) {
        console.log("Error:", recordingResult.error)
      }

      // ===== ASSERTIONS =====

      // 1. Recording must succeed
      expect(recordingResult.success, `Recording failed: ${recordingResult.error}`).toBe(true)

      // 2. Must have recorded video tracks
      expect(recordingResult.tracksRecorded.length).toBeGreaterThan(0)

      // 3. Blob must have reasonable size (at least 10KB for 5 seconds)
      expect(recordingResult.blobSize).toBeGreaterThan(10000)

      // 4. Must be playable
      expect(recordingResult.canPlayBack).toBe(true)

      // 5. Duration should be approximately what we requested
      expect(recordingResult.duration).toBeGreaterThanOrEqual(4500)
      expect(recordingResult.duration).toBeLessThanOrEqual(6000)

      console.log("\n✅ All assertions passed - MediaRecorder works with SFU streams!")
    } finally {
      // Debug logs
      console.log("\n=== Browser A Logs ===")
      logsA.forEach((log) => console.log(log))
      console.log("\n=== Browser B Logs ===")
      logsB.forEach((log) => console.log(log))

      await contextA.close()
      await contextB.close()
    }
  })

  test("can record audio-only from remote stream", async ({ browser }) => {
    const roomId = `A${Date.now().toString().slice(-5)}`.slice(0, 6).toUpperCase()

    const contextA = await browser.newContext()
    const contextB = await browser.newContext()

    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()

    try {
      // Join room
      await pageA.goto(`/?room=${roomId}`)
      await pageB.goto(`/?room=${roomId}`)

      await expect(pageA.getByText("Remote participant connected!")).toBeVisible({
        timeout: 30000,
      })
      await pageA.waitForTimeout(2000)

      // Test audio-only recording
      const audioResult = await pageA.evaluate(async () => {
        const result = {
          success: false,
          error: null as string | null,
          blobSize: 0,
          hasAudio: false,
        }

        try {
          const remoteVideo = document.querySelector(
            'video[class*="remote"], video:not([muted])',
          ) as HTMLVideoElement
          if (!remoteVideo?.srcObject) {
            throw new Error("No remote stream")
          }

          const remoteStream = remoteVideo.srcObject as MediaStream
          const audioTrack = remoteStream.getAudioTracks()[0]

          if (!audioTrack) {
            throw new Error("No audio track available")
          }

          const audioStream = new MediaStream([audioTrack])

          const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : "audio/webm"

          const recorder = new MediaRecorder(audioStream, { mimeType })
          const chunks: Blob[] = []

          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data)
          }

          recorder.start(100)
          await new Promise((r) => setTimeout(r, 3000))
          await new Promise<void>((r) => {
            recorder.onstop = () => r()
            recorder.stop()
          })

          if (chunks.length === 0) {
            throw new Error("No audio data recorded")
          }

          const blob = new Blob(chunks, { type: mimeType })
          result.blobSize = blob.size
          result.hasAudio = true

          // Audio-only should be smaller than video
          if (blob.size < 1000) {
            throw new Error("Audio recording too small")
          }

          result.success = true
        } catch (err) {
          result.error = err instanceof Error ? err.message : String(err)
        }

        return result
      })

      console.log("\n=== Audio-only Recording Result ===")
      console.log("Success:", audioResult.success)
      console.log("Blob size:", audioResult.blobSize)
      if (audioResult.error) console.log("Error:", audioResult.error)

      expect(audioResult.success, `Audio recording failed: ${audioResult.error}`).toBe(true)
      expect(audioResult.blobSize).toBeGreaterThan(1000)

      console.log("\n✅ Audio-only recording works!")
    } finally {
      await contextA.close()
      await contextB.close()
    }
  })

  test("can record local stream", async ({ browser }) => {
    const roomId = `L${Date.now().toString().slice(-5)}`.slice(0, 6).toUpperCase()

    const contextA = await browser.newContext()
    const pageA = await contextA.newPage()

    try {
      await pageA.goto(`/?room=${roomId}`)
      await expect(pageA.getByText("Waiting for participant...")).toBeVisible({
        timeout: 30000,
      })
      await pageA.waitForTimeout(2000)

      // Test local recording
      const localResult = await pageA.evaluate(async () => {
        const result = {
          success: false,
          error: null as string | null,
          blobSize: 0,
        }

        try {
          // Get local stream from video element
          const localVideo = document.querySelector(
            'video[class*="local"], video[muted]',
          ) as HTMLVideoElement
          if (!localVideo?.srcObject) {
            throw new Error("No local stream")
          }

          const localStream = localVideo.srcObject as MediaStream

          const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
            ? "video/webm;codecs=vp9,opus"
            : "video/webm"

          const recorder = new MediaRecorder(localStream, { mimeType })
          const chunks: Blob[] = []

          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data)
          }

          recorder.start(100)
          await new Promise((r) => setTimeout(r, 3000))
          await new Promise<void>((r) => {
            recorder.onstop = () => r()
            recorder.stop()
          })

          if (chunks.length === 0) {
            throw new Error("No local data recorded")
          }

          const blob = new Blob(chunks, { type: mimeType })
          result.blobSize = blob.size
          result.success = true
        } catch (err) {
          result.error = err instanceof Error ? err.message : String(err)
        }

        return result
      })

      console.log("\n=== Local Recording Result ===")
      console.log("Success:", localResult.success)
      console.log("Blob size:", localResult.blobSize)
      if (localResult.error) console.log("Error:", localResult.error)

      expect(localResult.success, `Local recording failed: ${localResult.error}`).toBe(true)
      expect(localResult.blobSize).toBeGreaterThan(5000)

      console.log("\n✅ Local recording works!")
    } finally {
      await contextA.close()
    }
  })
})
