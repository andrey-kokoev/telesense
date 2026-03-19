import { computed } from "vue"
import { useStorage } from "@vueuse/core"

// Single namespaced key for all app state
const STORAGE_KEY = "telesense:state"

export interface RecentCall {
  id: string
  name?: string
}

interface AppState {
  token: string
  tokenVerified: boolean
  recentCalls: RecentCall[]
  preferences: {
    showLogs: boolean
    audioEnabled: boolean
    videoEnabled: boolean
  }
}

const defaultState: AppState = {
  token: "",
  tokenVerified: false,
  recentCalls: [],
  preferences: {
    showLogs: false,
    audioEnabled: true,
    videoEnabled: true,
  },
}

// Reactive state backed by localStorage
const state = useStorage<AppState>(STORAGE_KEY, defaultState, localStorage)

export function useAppStore() {
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

  function addRecentCall(roomId: string, name?: string) {
    const normalizedId = roomId.toUpperCase()
    const normalizedName = name?.trim() || undefined

    // Remove if exists, add to front, keep max 10
    state.value.recentCalls = [
      { id: normalizedId, name: normalizedName },
      ...state.value.recentCalls.filter((c) => c.id !== normalizedId),
    ].slice(0, 10)
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
    token: computed(() => state.value.token),
    tokenVerified: computed(() => state.value.tokenVerified),
    recentCalls,
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
    setPreference,
    resetState,
  }
}
