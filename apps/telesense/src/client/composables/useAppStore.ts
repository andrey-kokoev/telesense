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
  participantSecret: string
}

export type StoredServiceEntitlementState = "missing" | "valid" | "exhausted"

interface AppState {
  browserInstanceId: string
  serviceEntitlementToken: string
  serviceEntitlementState: StoredServiceEntitlementState
  hostAdminSessionToken: string
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
  serviceEntitlementToken: "",
  serviceEntitlementState: "missing",
  hostAdminSessionToken: "",
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
  const legacyState = state.value as AppState & {
    userId?: string
    serviceEntitlementTokenVerified?: boolean
    hostToken?: string
    hostAdminToken?: string
  }
  if (!state.value.browserInstanceId && legacyState.userId) {
    state.value.browserInstanceId = legacyState.userId
    delete legacyState.userId
  }

  if (!state.value.browserInstanceId) {
    state.value.browserInstanceId = generateBrowserInstanceId()
  }

  if (!state.value.roomParticipantCredentials) {
    state.value.roomParticipantCredentials = {}
  }

  if (!state.value.preferences) {
    state.value.preferences = { ...defaultState.preferences }
  } else {
    state.value.preferences = {
      ...defaultState.preferences,
      ...state.value.preferences,
    }
  }

  if (!state.value.serviceEntitlementState) {
    const hasToken = !!state.value.serviceEntitlementToken
    if (!hasToken) {
      state.value.serviceEntitlementState = "missing"
    } else if (legacyState.serviceEntitlementTokenVerified) {
      state.value.serviceEntitlementState = "valid"
    } else {
      state.value.serviceEntitlementState = "exhausted"
    }
    delete legacyState.serviceEntitlementTokenVerified
  }

  if (!state.value.hostAdminSessionToken && (legacyState.hostAdminToken || legacyState.hostToken)) {
    state.value.hostAdminSessionToken = legacyState.hostAdminToken || legacyState.hostToken || ""
    delete legacyState.hostAdminToken
    delete legacyState.hostToken
  }

  if (!state.value.hostAdminSessionToken) {
    state.value.hostAdminSessionToken = ""
  }

  // Auth
  const hasServiceEntitlementToken = computed(() => !!state.value.serviceEntitlementToken)
  const hasHostAdminSessionToken = computed(() => !!state.value.hostAdminSessionToken)
  const serviceEntitlementTokenVerified = computed(
    () => !!state.value.serviceEntitlementToken && state.value.serviceEntitlementState === "valid",
  )
  const isAuthenticated = computed(() => serviceEntitlementTokenVerified.value)

  function setServiceEntitlementToken(
    token: string,
    entitlementState: Exclude<StoredServiceEntitlementState, "missing"> = "valid",
  ) {
    state.value.serviceEntitlementToken = token.trim()
    state.value.serviceEntitlementState = state.value.serviceEntitlementToken
      ? entitlementState
      : "missing"
  }

  function clearServiceEntitlementToken() {
    state.value.serviceEntitlementToken = ""
    state.value.serviceEntitlementState = "missing"
  }

  function setHostAdminSessionToken(token: string) {
    state.value.hostAdminSessionToken = token.trim()
  }

  function clearHostAdminSessionToken() {
    state.value.hostAdminSessionToken = ""
  }

  function getServiceEntitlementHeaders(): Record<string, string> {
    return {
      "X-Service-Entitlement-Token": state.value.serviceEntitlementToken,
    }
  }

  function getHostAdminHeaders(): Record<string, string> {
    return {
      "X-Host-Admin-Session": state.value.hostAdminSessionToken,
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
    const credential = state.value.roomParticipantCredentials[roomId.toUpperCase()]
    if (!credential) return null
    return { participantSecret: credential.participantSecret }
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
    serviceEntitlementToken: computed(() => state.value.serviceEntitlementToken),
    serviceEntitlementState: computed(() => state.value.serviceEntitlementState),
    hostAdminSessionToken: computed(() => state.value.hostAdminSessionToken),
    serviceEntitlementTokenVerified,
    hasServiceEntitlementToken,
    hasHostAdminSessionToken,
    recentCalls,
    roomParticipantCredentials,
    preferences,
    isAuthenticated,

    // Actions
    setServiceEntitlementToken,
    clearServiceEntitlementToken,
    setHostAdminSessionToken,
    clearHostAdminSessionToken,
    getServiceEntitlementHeaders,
    getHostAdminHeaders,
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
