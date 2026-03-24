import { onBeforeUnmount, ref, watch, type Ref } from "vue"
import { useIntersectionObserver } from "@vueuse/core"
import { getRoomStatuses } from "../lib/roomStatusClient"
import {
  applyRecentRoomAvailabilityResults,
  beginRecentRoomAvailabilityBatch,
  canQueueRecentRoomAvailability,
  markQueuedRecentRoomAvailability,
  resetRecentRoomAvailability,
  syncRecentRoomAvailabilityState,
} from "./recentRoomAvailabilityState"
import type { RecentCall } from "./useAppStore"

export type Availability = "available" | "unavailable" | "unchecked" | "queued" | "checking"

const INITIAL_BATCH_LIMIT = 100
const VISIBILITY_BATCH_LIMIT = 12

export function useRecentRoomAvailability(recentCalls: Ref<RecentCall[]>) {
  const roomAvailability = ref<Record<string, Availability>>({})
  const recentScrollEl = ref<HTMLElement | null>(null)
  const recentItemStops = new Map<string, () => void>()
  const queuedRoomIds = new Set<string>()
  const inFlightRoomIds = new Set<string>()
  const isBatchRunning = ref(false)
  const hasRunInitialBatch = ref(false)

  onBeforeUnmount(() => {
    for (const stop of recentItemStops.values()) {
      stop()
    }
    recentItemStops.clear()
  })

  watch(
    recentCalls,
    () => {
      roomAvailability.value = syncRecentRoomAvailabilityState(
        recentCalls.value.map((room) => room.id),
        roomAvailability.value,
      )

      if (!hasRunInitialBatch.value) {
        for (const room of recentCalls.value.slice(0, INITIAL_BATCH_LIMIT)) {
          queueRoomAvailabilityCheck(room.id, "initial")
        }
        hasRunInitialBatch.value = true
      }
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
          queueRoomAvailabilityCheck(roomId, "visible")
        }
      },
      {
        root: recentScrollEl,
        threshold: 0.2,
      },
    )

    recentItemStops.set(roomId, stop)
  }

  function queueRoomAvailabilityCheck(roomId: string, source: "initial" | "visible") {
    if (!canQueueRecentRoomAvailability(roomAvailability.value, inFlightRoomIds, roomId)) return

    roomAvailability.value = markQueuedRecentRoomAvailability(
      roomAvailability.value,
      queuedRoomIds,
      roomId,
    )
    void runAvailabilityBatch(source === "initial" ? INITIAL_BATCH_LIMIT : VISIBILITY_BATCH_LIMIT)
  }

  async function runAvailabilityBatch(batchLimit = VISIBILITY_BATCH_LIMIT) {
    if (isBatchRunning.value) return

    const batch = beginRecentRoomAvailabilityBatch(
      roomAvailability.value,
      queuedRoomIds,
      inFlightRoomIds,
      batchLimit,
    )
    const roomIds = batch.roomIds
    if (roomIds.length === 0) return

    isBatchRunning.value = true
    roomAvailability.value = batch.availability

    try {
      const statuses = await getRoomStatuses(roomIds)
      roomAvailability.value = applyRecentRoomAvailabilityResults(
        roomAvailability.value,
        roomIds,
        statuses,
      )
    } catch {
      roomAvailability.value = resetRecentRoomAvailability(roomAvailability.value, roomIds)
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
