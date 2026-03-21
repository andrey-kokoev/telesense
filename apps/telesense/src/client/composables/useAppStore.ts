import { computed } from "vue"
import { useStorage } from "@vueuse/core"
import { detectLocale, type Locale } from "../i18n/messages"

// Single namespaced key for all app state
const STORAGE_KEY = "telesense:state"

export interface RecentCall {
  id: string
  name?: string
}

export interface RoomParticipantCredential {
  participantId: string
  participantSecret: string
}

interface AppState {
  browserInstanceId: string
  token: string
  tokenVerified: boolean
  recentCalls: RecentCall[]
  roomParticipantCredentials: Record<string, RoomParticipantCredential>
  preferences: {
    showLogs: boolean
    audioEnabled: boolean
    videoEnabled: boolean
    desktopCallLayout: "side-by-side" | "focus-remote"
    mobileCallLayout: "picture-in-picture" | "remote-only"
    locale: Locale
  }
}

function generateBrowserInstanceId(): string {
  return crypto.randomUUID()
}

const defaultState: AppState = {
  browserInstanceId: generateBrowserInstanceId(),
  token: "",
  tokenVerified: false,
  recentCalls: [],
  roomParticipantCredentials: {},
  preferences: {
    showLogs: false,
    audioEnabled: true,
    videoEnabled: true,
    desktopCallLayout: "side-by-side",
    mobileCallLayout: "picture-in-picture",
    locale: detectLocale(),
  },
}

// Reactive state backed by localStorage
const state = useStorage<AppState>(STORAGE_KEY, defaultState, localStorage)

export function useAppStore() {
  const legacyState = state.value as AppState & { userId?: string }
  if (!state.value.browserInstanceId && legacyState.userId) {
    state.value.browserInstanceId = legacyState.userId
    delete legacyState.userId
  }

  if (!state.value.browserInstanceId) {
    state.value.browserInstanceId = generateBrowserInstanceId()
  }

  // Auth
  const isAuthenticated = computed(() => !!state.value.token && state.value.tokenVerified)

  function setToken(token: string, verified = false) {
    state.value.token = token.trim()
    state.value.tokenVerified = !!state.value.token && verified
  }

  function clearToken() {
    state.value.token = ""
    state.value.tokenVerified = false
  }

  function getAuthHeaders(): Record<string, string> {
    return {
      "X-User-Token": state.value.token,
    }
  }

  // Recent calls
  const recentCalls = computed(() => state.value.recentCalls)
  const roomParticipantCredentials = computed(() => state.value.roomParticipantCredentials)

  function addRecentCall(roomId: string, name?: string) {
    const normalizedId = roomId.toUpperCase()
    const normalizedName = name?.trim() || undefined

    // Remove if exists, add to front, keep max 999
    state.value.recentCalls = [
      { id: normalizedId, name: normalizedName },
      ...state.value.recentCalls.filter((c) => c.id !== normalizedId),
    ].slice(0, 999)
  }

  function renameRecentCall(roomId: string, name: string) {
    const normalizedId = roomId.toUpperCase()
    const call = state.value.recentCalls.find((c) => c.id === normalizedId)
    if (call) {
      call.name = name.trim() || undefined
    }
  }

  function removeRecentCall(roomId: string) {
    const normalizedId = roomId.toUpperCase()
    state.value.recentCalls = state.value.recentCalls.filter((c) => c.id !== normalizedId)
  }

  function clearRecentCalls() {
    state.value.recentCalls = []
  }

  function getRoomParticipantCredential(roomId: string): RoomParticipantCredential | null {
    return state.value.roomParticipantCredentials[roomId.toUpperCase()] ?? null
  }

  function setRoomParticipantCredential(roomId: string, credential: RoomParticipantCredential) {
    state.value.roomParticipantCredentials[roomId.toUpperCase()] = credential
  }

  function clearRoomParticipantCredential(roomId: string) {
    delete state.value.roomParticipantCredentials[roomId.toUpperCase()]
  }

  // Preferences
  const preferences = computed(() => state.value.preferences)

  function setPreference<K extends keyof AppState["preferences"]>(
    key: K,
    value: AppState["preferences"][K],
  ) {
    state.value.preferences[key] = value
  }

  // Reset all state
  function resetState() {
    state.value = { ...defaultState }
  }

  return {
    // State (readonly)
    browserInstanceId: computed(() => state.value.browserInstanceId),
    token: computed(() => state.value.token),
    tokenVerified: computed(() => state.value.tokenVerified),
    recentCalls,
    roomParticipantCredentials,
    preferences,
    isAuthenticated,

    // Actions
    setToken,
    clearToken,
    getAuthHeaders,
    addRecentCall,
    renameRecentCall,
    removeRecentCall,
    clearRecentCalls,
    getRoomParticipantCredential,
    setRoomParticipantCredential,
    clearRoomParticipantCredential,
    setPreference,
    resetState,
  }
}
