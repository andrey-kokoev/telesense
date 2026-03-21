import { onBeforeUnmount, ref, watch, type Ref } from "vue"
import { useIntersectionObserver } from "@vueuse/core"
import type { RecentCall } from "./useAppStore"

export type Availability = "available" | "unavailable" | "unchecked" | "queued" | "checking"

export function useRecentRoomAvailability(recentCalls: Ref<RecentCall[]>) {
  const roomAvailability = ref<Record<string, Availability>>({})
  const recentScrollEl = ref<HTMLElement | null>(null)
  const recentItemStops = new Map<string, () => void>()
  const queuedRoomIds = new Set<string>()
  const inFlightRoomIds = new Set<string>()
  const isBatchRunning = ref(false)

  onBeforeUnmount(() => {
    for (const stop of recentItemStops.values()) {
      stop()
    }
    recentItemStops.clear()
  })

  watch(
    recentCalls,
    () => {
      const nextAvailability: Record<string, Availability> = {}
      for (const room of recentCalls.value) {
        nextAvailability[room.id] = roomAvailability.value[room.id] ?? "unchecked"
      }
      roomAvailability.value = nextAvailability
    },
    { deep: true, immediate: true },
  )

  function setRecentItemRef(el: unknown, roomId: string) {
    recentItemStops.get(roomId)?.()
    recentItemStops.delete(roomId)

    if (!(el instanceof HTMLElement)) {
      return
    }

    const { stop } = useIntersectionObserver(
      el,
      ([entry]) => {
        if (entry?.isIntersecting) {
          queueRoomAvailabilityCheck(roomId)
        }
      },
      {
        root: recentScrollEl,
        threshold: 0.2,
      },
    )

    recentItemStops.set(roomId, stop)
  }

  function queueRoomAvailabilityCheck(roomId: string) {
    if ((roomAvailability.value[roomId] ?? "unchecked") !== "unchecked") return
    if (inFlightRoomIds.has(roomId)) return

    queuedRoomIds.add(roomId)
    roomAvailability.value[roomId] = "queued"
    void runAvailabilityBatch()
  }

  async function runAvailabilityBatch() {
    if (isBatchRunning.value) return

    const roomIds = Array.from(queuedRoomIds).slice(0, 12)
    if (roomIds.length === 0) return

    isBatchRunning.value = true
    for (const roomId of roomIds) {
      queuedRoomIds.delete(roomId)
      inFlightRoomIds.add(roomId)
      roomAvailability.value[roomId] = "checking"
    }

    try {
      const res = await fetch("/api/rooms/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomIds }),
      })

      if (res.ok) {
        const data = (await res.json()) as {
          rooms?: Record<string, { exists?: boolean }>
        }

        for (const roomId of roomIds) {
          roomAvailability.value[roomId] = data.rooms?.[roomId]?.exists
            ? "available"
            : "unavailable"
        }
      }
      if (!res.ok) {
        for (const roomId of roomIds) {
          roomAvailability.value[roomId] = "unchecked"
        }
      }
    } catch {
      for (const roomId of roomIds) {
        roomAvailability.value[roomId] = "unchecked"
      }
    } finally {
      for (const roomId of roomIds) {
        inFlightRoomIds.delete(roomId)
      }
      isBatchRunning.value = false
      if (queuedRoomIds.size > 0) {
        void runAvailabilityBatch()
      }
    }
  }

  return {
    roomAvailability,
    recentScrollEl,
    setRecentItemRef,
  }
}
