import { ref, computed, onUnmounted } from "vue"

export type MeteringStatus = {
  remainingBytes: number
  lifecycle: "active" | "in_grace" | "exhausted"
  inGrace: boolean
  graceEndsAt: number | null
  graceRemainingMinutes: number
}

const POLL_INTERVAL_MS = 30 * 1000 // Poll every 30 seconds

export function useMetering(roomId: string) {
  const status = ref<MeteringStatus | null>(null)
  const error = ref<string | null>(null)
  const isLoading = ref(false)

  const lifecycle = computed(() => status.value?.lifecycle ?? "active")
  const isInGrace = computed(() => lifecycle.value === "in_grace")
  const graceRemainingMinutes = computed(() => status.value?.graceRemainingMinutes ?? 0)
  const graceEndsAt = computed(() =>
    status.value?.graceEndsAt ? new Date(status.value.graceEndsAt) : null,
  )

  let pollTimer: number | null = null

  async function fetchStatus() {
    if (!roomId) return

    isLoading.value = true
    error.value = null

    try {
      const response = await fetch(`/api/rooms/${roomId}/meter`)
      if (!response.ok) {
        throw new Error(`Failed to fetch metering status: ${response.status}`)
      }
      status.value = (await response.json()) as MeteringStatus
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Unknown error"
    } finally {
      isLoading.value = false
    }
  }

  function startPolling() {
    if (pollTimer) return

    void fetchStatus() // Immediate first fetch
    pollTimer = window.setInterval(() => {
      void fetchStatus()
    }, POLL_INTERVAL_MS)
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  onUnmounted(() => {
    stopPolling()
  })

  return {
    status,
    error,
    isLoading,
    lifecycle,
    isInGrace,
    graceRemainingMinutes,
    graceEndsAt,
    fetchStatus,
    startPolling,
    stopPolling,
  }
}
