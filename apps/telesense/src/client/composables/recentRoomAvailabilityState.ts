import type { Availability } from "./useRecentRoomAvailability"

export function syncRecentRoomAvailabilityState(
  nextRoomIds: string[],
  current: Record<string, Availability>,
) {
  return Object.fromEntries(
    nextRoomIds.map((roomId) => [roomId, current[roomId] ?? "unchecked"]),
  ) as Record<string, Availability>
}

export function canQueueRecentRoomAvailability(
  availability: Record<string, Availability>,
  inFlightRoomIds: Set<string>,
  roomId: string,
) {
  return (availability[roomId] ?? "unchecked") === "unchecked" && !inFlightRoomIds.has(roomId)
}

export function markQueuedRecentRoomAvailability(
  availability: Record<string, Availability>,
  queuedRoomIds: Set<string>,
  roomId: string,
) {
  queuedRoomIds.add(roomId)
  return {
    ...availability,
    [roomId]: "queued" as const,
  }
}

export function beginRecentRoomAvailabilityBatch(
  availability: Record<string, Availability>,
  queuedRoomIds: Set<string>,
  inFlightRoomIds: Set<string>,
  batchLimit: number,
) {
  const roomIds = Array.from(queuedRoomIds).slice(0, batchLimit)
  const nextAvailability = { ...availability }

  for (const roomId of roomIds) {
    queuedRoomIds.delete(roomId)
    inFlightRoomIds.add(roomId)
    nextAvailability[roomId] = "checking"
  }

  return {
    roomIds,
    availability: nextAvailability,
  }
}

export function applyRecentRoomAvailabilityResults(
  availability: Record<string, Availability>,
  roomIds: string[],
  statuses: Record<string, { exists: boolean }>,
) {
  const nextAvailability = { ...availability }
  for (const roomId of roomIds) {
    nextAvailability[roomId] = statuses[roomId]?.exists ? "available" : "unavailable"
  }
  return nextAvailability
}

export function resetRecentRoomAvailability(
  availability: Record<string, Availability>,
  roomIds: string[],
) {
  const nextAvailability = { ...availability }
  for (const roomId of roomIds) {
    nextAvailability[roomId] = "unchecked"
  }
  return nextAvailability
}
