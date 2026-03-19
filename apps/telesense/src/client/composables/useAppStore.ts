import { ref, computed } from 'vue'
import { useStorage } from '@vueuse/core'

// Single namespaced key for all app state
const STORAGE_KEY = 'telesense:state'

interface AppState {
  token: string
  recentCalls: string[]
  preferences: {
    showLogs: boolean
    audioEnabled: boolean
    videoEnabled: boolean
  }
}

const defaultState: AppState = {
  token: '',
  recentCalls: [],
  preferences: {
    showLogs: false,
    audioEnabled: true,
    videoEnabled: true
  }
}

// Reactive state backed by localStorage
const state = useStorage<AppState>(STORAGE_KEY, defaultState, localStorage)

export function useAppStore() {
  // Auth
  const isAuthenticated = computed(() => !!state.value.token)
  
  function setToken(token: string) {
    state.value.token = token.trim()
  }
  
  function clearToken() {
    state.value.token = ''
  }
  
  function getAuthHeaders(): Record<string, string> {
    return {
      'X-User-Token': state.value.token
    }
  }
  
  // Recent calls
  const recentCalls = computed(() => state.value.recentCalls)
  
  function addRecentCall(callId: string) {
    const normalized = callId.toUpperCase()
    // Remove if exists, add to front, keep max 10
    state.value.recentCalls = [
      normalized,
      ...state.value.recentCalls.filter(c => c !== normalized)
    ].slice(0, 10)
  }
  
  function clearRecentCalls() {
    state.value.recentCalls = []
  }
  
  // Preferences
  const preferences = computed(() => state.value.preferences)
  
  function setPreference<K extends keyof AppState['preferences']>(
    key: K, 
    value: AppState['preferences'][K]
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
    recentCalls,
    preferences,
    isAuthenticated,
    
    // Actions
    setToken,
    clearToken,
    getAuthHeaders,
    addRecentCall,
    clearRecentCalls,
    setPreference,
    resetState
  }
}
