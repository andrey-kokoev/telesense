import { computed, nextTick, ref, type ComputedRef, type Ref } from "vue"
import { getRoomStatus } from "../lib/roomStatusClient"
import type { RecentCall } from "./useAppStore"
import type { Availability } from "./useRecentRoomAvailability"

type ToastFn = (message: string, variant?: "success" | "error" | "info") => void
type TranslateFn = (key: string, params?: Record<string, string>) => string
type ServiceEntitlementUiState = "missing" | "verifying" | "valid" | "exhausted" | "invalid"

export type RoomLookupState = "idle" | "checking" | "exists" | "missing" | "error"
export type RoomActionState = "idle" | "submitting"
export type RoomEntryState =
  | "incomplete"
  | "checking"
  | "joinable"
  | "creatable"
  | "token_required"
  | "error"

export function useRoomEntryState(options: {
  roomIdInput: ComputedRef<string>
  recentCalls: Ref<RecentCall[]>
  roomAvailability: Ref<Record<string, Availability>>
  serviceEntitlementUiState: ComputedRef<ServiceEntitlementUiState>
  hasServiceEntitlementToken: ComputedRef<boolean>
  canCreateRooms: ComputedRef<boolean>
  setRoomCodeValue: (nextValue: string) => void
  focusRoomCodeInput: (index: number) => void
  clearRoomCode: () => void
  onRoomCodeInput: (index: number, event: Event) => Promise<void>
  onRoomCodeKeydown: (index: number, event: KeyboardEvent) => void
  addRecentCall: (roomId: string) => void
  openTokenModal: () => void
  goToRoom: (roomId: string) => void
  show: ToastFn
  t: TranslateFn
}) {
  const {
    roomIdInput,
    recentCalls,
    roomAvailability,
    serviceEntitlementUiState,
    hasServiceEntitlementToken,
    canCreateRooms,
    setRoomCodeValue,
    focusRoomCodeInput,
    clearRoomCode,
    onRoomCodeInput,
    onRoomCodeKeydown,
    addRecentCall,
    openTokenModal,
    goToRoom,
    show,
    t,
  } = options

  const roomLookupState = ref<RoomLookupState>("idle")
  const roomActionState = ref<RoomActionState>("idle")
  let lastCheckedRoomId = ""
  let roomLookupRequest = 0

  const hasCompleteRoomCode = computed(() => roomIdInput.value.length === 6)
  const roomEntryState = computed<RoomEntryState>(() => {
    if (!hasCompleteRoomCode.value) return "incomplete"
    if (roomLookupState.value === "checking") return "checking"
    if (roomLookupState.value === "exists") return "joinable"
    if (roomLookupState.value === "error") return "error"
    if (roomLookupState.value === "missing" && canCreateRooms.value) return "creatable"
    if (roomLookupState.value === "missing") return "token_required"
    return "checking"
  })

  const roomActionButtonLabel = computed(() => {
    if (roomEntryState.value === "incomplete") return t("landing_enter_room_code")
    if (roomEntryState.value === "checking") return t("landing_checking_room")
    if (roomEntryState.value === "joinable") return t("landing_join_room_action")
    if (roomEntryState.value === "token_required") return t("landing_enter_token_prompt_action")
    if (roomEntryState.value === "error") return t("landing_try_again")
    return t("landing_create_room_action")
  })

  const roomActionButtonClass = computed(() => {
    if (roomEntryState.value === "joinable" || roomEntryState.value === "error") {
      return "landing__btn--secondary"
    }
    return "landing__btn--primary"
  })

  const isRoomActionButtonDisabled = computed(() => {
    if (roomActionState.value === "submitting") return true
    return roomEntryState.value === "incomplete" || roomEntryState.value === "checking"
  })

  const roomEntryHelperText = computed(() => {
    if (roomIdInput.value.length === 0) return ""
    if (roomEntryState.value === "incomplete") return t("landing_room_code_helper")
    if (roomEntryState.value === "checking") return t("landing_checking_room_hint")
    if (roomEntryState.value === "joinable") return t("landing_room_found_hint")
    if (roomEntryState.value === "creatable") return t("landing_room_not_found_create_hint")
    if (roomEntryState.value === "error") return t("landing_room_check_failed")
    if (roomEntryState.value === "token_required" && hasServiceEntitlementToken.value) {
      return serviceEntitlementUiState.value === "verifying"
        ? t("landing_service_entitlement_verifying_hint")
        : t("landing_service_entitlement_exhausted_hint")
    }
    if (roomEntryState.value === "token_required") return t("landing_token_required_hint")
    return ""
  })

  const tokenModalTitle = computed(() =>
    roomEntryState.value === "token_required"
      ? t("landing_enter_token_prompt_action")
      : t("landing_change_token"),
  )

  const tokenModalPlaceholder = computed(() =>
    roomEntryState.value === "token_required"
      ? t("landing_enter_token_hint")
      : t("landing_enter_new_token_placeholder"),
  )

  function resetLookupState() {
    roomLookupState.value = "idle"
    lastCheckedRoomId = ""
  }

  function generateCallId(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    let result = ""
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  async function checkEnteredRoomAvailability() {
    const roomId = roomIdInput.value
    if (roomId.length !== 6) return
    if (lastCheckedRoomId === roomId && roomLookupState.value !== "error") return

    roomLookupState.value = "checking"
    const requestId = ++roomLookupRequest
    try {
      const data = await getRoomStatus(roomId)
      if (requestId !== roomLookupRequest || roomIdInput.value !== roomId) return

      lastCheckedRoomId = roomId
      roomLookupState.value = data.exists ? "exists" : "missing"
    } catch {
      if (requestId !== roomLookupRequest || roomIdInput.value !== roomId) return
      roomLookupState.value = "error"
    }
  }

  async function createNewRoom() {
    const roomId = roomIdInput.value || generateCallId()
    if (!recentCalls.value.some((room) => room.id === roomId)) {
      addRecentCall(roomId)
    }
    show(t("landing_created_room", { roomId }), "success")
    clearRoomCode()
    goToRoom(roomId)
  }

  async function joinExistingRoom() {
    if (roomActionState.value === "submitting") return
    const id = roomIdInput.value
    if (id.length !== 6) return

    roomActionState.value = "submitting"
    if (!recentCalls.value.some((room) => room.id === id)) {
      addRecentCall(id)
    }
    goToRoom(id)
  }

  async function handleRoomCodeInput(index: number, event: Event) {
    await onRoomCodeInput(index, event)
    if (roomIdInput.value.length === 6) {
      await checkEnteredRoomAvailability()
    } else {
      resetLookupState()
    }
  }

  async function handleRoomCodeKeydown(index: number, event: KeyboardEvent) {
    onRoomCodeKeydown(index, event)

    if (event.defaultPrevented && roomIdInput.value.length === 6) {
      await checkEnteredRoomAvailability()
      return
    }

    if (roomIdInput.value.length < 6) {
      resetLookupState()
    }
  }

  async function handleRoomCodeBlur() {
    if (roomIdInput.value.length === 6) {
      await checkEnteredRoomAvailability()
    }
  }

  async function submitRoomAction() {
    if (roomActionState.value === "submitting") return
    if (roomIdInput.value.length !== 6) return

    if (roomLookupState.value === "idle" || roomLookupState.value === "error") {
      await checkEnteredRoomAvailability()
    }

    if (roomLookupState.value === "exists") {
      await joinExistingRoom()
      return
    }

    if (roomEntryState.value === "creatable") {
      roomActionState.value = "submitting"
      await createNewRoom()
      return
    }

    if (roomEntryState.value === "token_required") {
      openTokenModal()
      return
    }

    if (roomEntryState.value === "error") {
      await checkEnteredRoomAvailability()
    }
  }

  async function openRecentRoom(roomId: string) {
    if (serviceEntitlementUiState.value === "valid") {
      goToRoom(roomId)
      return
    }

    setRoomCodeValue(roomId)
    await nextTick()
    focusRoomCodeInput(0)
    await checkEnteredRoomAvailability()

    if (roomLookupState.value === "exists") {
      roomAvailability.value[roomId] = "available"
      goToRoom(roomId)
      return
    }

    if (roomLookupState.value === "missing") {
      roomAvailability.value[roomId] = "unavailable"
      show(t("landing_room_unavailable"), "error")
      if (!canCreateRooms.value) {
        openTokenModal()
      }
      return
    }

    if (roomLookupState.value === "error") {
      show(t("landing_room_check_failed"), "error")
    }
  }

  return {
    roomLookupState,
    roomActionState,
    roomEntryState,
    roomActionButtonLabel,
    roomActionButtonClass,
    isRoomActionButtonDisabled,
    roomEntryHelperText,
    tokenModalTitle,
    tokenModalPlaceholder,
    checkEnteredRoomAvailability,
    handleRoomCodeInput,
    handleRoomCodeKeydown,
    handleRoomCodeBlur,
    submitRoomAction,
    openRecentRoom,
  }
}
