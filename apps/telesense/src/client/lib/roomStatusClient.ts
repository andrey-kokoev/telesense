import { fetchJson, postJson } from "./jsonClient"

export type RoomStatusResult = {
  exists: boolean
}

export type RoomStatusBatchResult = Record<string, RoomStatusResult>

export async function getRoomStatus(roomId: string): Promise<RoomStatusResult> {
  const data = await fetchJson<{ exists?: boolean }>(`/api/rooms/${roomId}/status`)
  return { exists: !!data.exists }
}

export async function getRoomStatuses(roomIds: string[]): Promise<RoomStatusBatchResult> {
  const data = await postJson<{
    rooms?: Record<string, { exists?: boolean }>
  }>("/api/rooms/status", { roomIds })

  return Object.fromEntries(
    roomIds.map((roomId) => [roomId, { exists: !!data.rooms?.[roomId]?.exists }]),
  )
}
