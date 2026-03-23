import { computed, ref, watch, type Ref } from "vue"

type CreateRoomFlowState = "idle" | "editing" | "submitting"
type JoinRoomFlowState = "editing" | "submitting"
type ActiveCodeTarget = "join" | "create" | null

export function useActiveRoomCodeTarget(options: {
  roomIdInput: Ref<string>
  createRoomIdInput: Ref<string>
  createRoomFlowState: Ref<CreateRoomFlowState>
  joinRoomFlowState: Ref<JoinRoomFlowState>
  clearJoinRoomCode: () => void
  clearCreateRoomCode: () => void
}) {
  const {
    roomIdInput,
    createRoomIdInput,
    createRoomFlowState,
    joinRoomFlowState,
    clearJoinRoomCode,
    clearCreateRoomCode,
  } = options

  const activeCodeTarget = ref<ActiveCodeTarget>("join")

  const isCreateRoomSectionInactive = computed(() => activeCodeTarget.value === "join")
  const isJoinRoomSectionInactive = computed(() => activeCodeTarget.value === "create")

  watch(createRoomIdInput, (value) => {
    if (createRoomFlowState.value === "submitting") return
    createRoomFlowState.value = value.length > 0 ? "editing" : "idle"
    if (value.length > 0) {
      activeCodeTarget.value = "create"
    } else if (activeCodeTarget.value === "create") {
      activeCodeTarget.value = "join"
    }
  })

  watch(roomIdInput, (value) => {
    if (joinRoomFlowState.value === "submitting") return
    joinRoomFlowState.value = "editing"
    if (value.length > 0) {
      activeCodeTarget.value = "join"
    }
  })

  function activateCreateTarget() {
    if (activeCodeTarget.value === "create") return
    activeCodeTarget.value = "create"
    clearJoinRoomCode()
    joinRoomFlowState.value = "editing"
  }

  function activateJoinTarget() {
    if (activeCodeTarget.value === "join") return
    activeCodeTarget.value = "join"
    clearCreateRoomCode()
    createRoomFlowState.value = "idle"
  }

  return {
    activeCodeTarget,
    isCreateRoomSectionInactive,
    isJoinRoomSectionInactive,
    activateCreateTarget,
    activateJoinTarget,
  }
}
