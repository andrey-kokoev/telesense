import { computed } from "vue"
import { useStorage } from "@vueuse/core"
import { z } from "zod"
import { detectLocale, isSupportedLocale, type Locale } from "../i18n/messages"

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

export interface AppState {
  browserInstanceId: string
  serviceEntitlementToken: string
  serviceEntitlementState: StoredServiceEntitlementState
  hostAdminBootstrapToken: string
  hostAdminSessionToken: string
  budgetAdminSessionToken: string
  budgetAdminBudgetKey: string
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
  hostAdminBootstrapToken: "",
  hostAdminSessionToken: "",
  budgetAdminSessionToken: "",
  budgetAdminBudgetKey: "",
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

const localeSchema = z.custom<Locale>(
  (value) => typeof value === "string" && isSupportedLocale(value),
)
const recentCallSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
})
const roomParticipantCredentialSchema = z.object({
  participantSecret: z.string().min(1),
})
const appStateSchema = z.object({
  browserInstanceId: z.string().min(1),
  serviceEntitlementToken: z.string(),
  serviceEntitlementState: z.enum(["missing", "valid", "exhausted"]),
  hostAdminBootstrapToken: z.string(),
  hostAdminSessionToken: z.string(),
  budgetAdminSessionToken: z.string(),
  budgetAdminBudgetKey: z.string(),
  recentCalls: z.array(recentCallSchema),
  roomParticipantCredentials: z.record(z.string(), roomParticipantCredentialSchema),
  preferences: z.object({
    showLogs: z.boolean(),
    audioEnabled: z.boolean(),
    videoEnabled: z.boolean(),
    desktopCallLayout: z.enum(["side-by-side", "focus-remote"]),
    mobileCallLayout: z.enum(["picture-in-picture", "remote-only"]),
    locale: localeSchema,
  }),
})

export function sanitizeCredentialToken(token: string): string {
  return token.normalize("NFKC").replace(/[\p{C}\p{Z}]+/gu, "")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

export function normalizeStoredAppState(raw: unknown): AppState {
  const input = isRecord(raw) ? raw : {}

  const browserInstanceId = z.string().min(1).safeParse(input.browserInstanceId).success
    ? (input.browserInstanceId as string)
    : z.string().min(1).safeParse(input.userId).success
      ? (input.userId as string)
      : generateBrowserInstanceId()

  const serviceEntitlementToken = sanitizeCredentialToken(
    z.string().catch("").parse(input.serviceEntitlementToken),
  )
  const hostAdminSessionToken = sanitizeCredentialToken(
    z
      .string()
      .catch("")
      .parse(
        z.string().safeParse(input.hostAdminSessionToken).success
          ? input.hostAdminSessionToken
          : z.string().safeParse(input.hostAdminToken).success
            ? input.hostAdminToken
            : input.hostToken,
      ),
  )
  const hostAdminBootstrapToken = sanitizeCredentialToken(
    z
      .string()
      .catch("")
      .parse(
        z.string().safeParse(input.hostAdminBootstrapToken).success
          ? input.hostAdminBootstrapToken
          : z.string().safeParse(input.hostAdminToken).success
            ? input.hostAdminToken
            : input.hostToken,
      ),
  )
  const budgetAdminSessionToken = sanitizeCredentialToken(
    z.string().catch("").parse(input.budgetAdminSessionToken),
  )
  const budgetAdminBudgetKey = z.string().catch("").parse(input.budgetAdminBudgetKey).trim()

  const serviceEntitlementState = z
    .enum(["missing", "valid", "exhausted"])
    .safeParse(input.serviceEntitlementState).success
    ? (input.serviceEntitlementState as StoredServiceEntitlementState)
    : !serviceEntitlementToken
      ? "missing"
      : input.serviceEntitlementTokenVerified === true
        ? "valid"
        : "exhausted"

  const recentCalls = Array.isArray(input.recentCalls)
    ? input.recentCalls
        .flatMap((item) => {
          const parsed = recentCallSchema.safeParse(item)
          if (!parsed.success) return []
          return [
            {
              id: parsed.data.id.toUpperCase(),
              name: parsed.data.name?.trim() || undefined,
            } satisfies RecentCall,
          ]
        })
        .slice(0, 999)
    : []

  const roomParticipantCredentials = isRecord(input.roomParticipantCredentials)
    ? Object.fromEntries(
        Object.entries(input.roomParticipantCredentials)
          .map(([roomId, credential]) => {
            const parsed = roomParticipantCredentialSchema.safeParse(credential)
            if (!parsed.success) return null
            return [
              roomId.toUpperCase(),
              { participantSecret: parsed.data.participantSecret },
            ] as const
          })
          .filter((entry): entry is readonly [string, RoomParticipantCredential] => entry !== null),
      )
    : {}

  const preferencesInput = isRecord(input.preferences) ? input.preferences : {}
  const localeCandidate =
    z.string().safeParse(preferencesInput.locale).success &&
    isSupportedLocale(preferencesInput.locale as string)
      ? (preferencesInput.locale as Locale)
      : defaultState.preferences.locale

  return appStateSchema.parse({
    browserInstanceId,
    serviceEntitlementToken,
    serviceEntitlementState,
    hostAdminBootstrapToken,
    hostAdminSessionToken,
    budgetAdminSessionToken,
    budgetAdminBudgetKey,
    recentCalls,
    roomParticipantCredentials,
    preferences: {
      showLogs: z
        .boolean()
        .catch(defaultState.preferences.showLogs)
        .parse(preferencesInput.showLogs),
      audioEnabled: z
        .boolean()
        .catch(defaultState.preferences.audioEnabled)
        .parse(preferencesInput.audioEnabled),
      videoEnabled: z
        .boolean()
        .catch(defaultState.preferences.videoEnabled)
        .parse(preferencesInput.videoEnabled),
      desktopCallLayout: z
        .enum(["side-by-side", "focus-remote"])
        .catch(defaultState.preferences.desktopCallLayout)
        .parse(preferencesInput.desktopCallLayout),
      mobileCallLayout: z
        .enum(["picture-in-picture", "remote-only"])
        .catch(defaultState.preferences.mobileCallLayout)
        .parse(preferencesInput.mobileCallLayout),
      locale: localeCandidate,
    },
  })
}

// Reactive state backed by localStorage
const state = useStorage<AppState>(
  STORAGE_KEY,
  defaultState,
  typeof localStorage === "undefined" ? undefined : localStorage,
)

export function useAppStore() {
  state.value = normalizeStoredAppState(state.value)

  // Auth
  const hasServiceEntitlementToken = computed(() => !!state.value.serviceEntitlementToken)
  const hasHostAdminSessionToken = computed(() => !!state.value.hostAdminSessionToken)
  const hasBudgetAdminSessionToken = computed(
    () => !!state.value.budgetAdminSessionToken && !!state.value.budgetAdminBudgetKey,
  )
  const serviceEntitlementTokenVerified = computed(
    () => !!state.value.serviceEntitlementToken && state.value.serviceEntitlementState === "valid",
  )
  const isAuthenticated = computed(() => serviceEntitlementTokenVerified.value)

  function setServiceEntitlementToken(
    token: string,
    entitlementState: Exclude<StoredServiceEntitlementState, "missing"> = "valid",
  ) {
    state.value.serviceEntitlementToken = sanitizeCredentialToken(token)
    state.value.serviceEntitlementState = state.value.serviceEntitlementToken
      ? entitlementState
      : "missing"
  }

  function clearServiceEntitlementToken() {
    state.value.serviceEntitlementToken = ""
    state.value.serviceEntitlementState = "missing"
  }

  function setHostAdminSessionToken(
    token: string,
    bootstrapToken = state.value.hostAdminBootstrapToken,
  ) {
    state.value.hostAdminBootstrapToken = sanitizeCredentialToken(bootstrapToken)
    state.value.hostAdminSessionToken = sanitizeCredentialToken(token)
    state.value.budgetAdminSessionToken = ""
    state.value.budgetAdminBudgetKey = ""
  }

  function clearHostAdminSessionToken() {
    state.value.hostAdminBootstrapToken = ""
    state.value.hostAdminSessionToken = ""
  }

  function setBudgetAdminSession(token: string, budgetKey: string) {
    if (state.value.hostAdminSessionToken) {
      return
    }
    state.value.budgetAdminSessionToken = sanitizeCredentialToken(token)
    state.value.budgetAdminBudgetKey = budgetKey.trim()
  }

  function clearBudgetAdminSession() {
    state.value.budgetAdminSessionToken = ""
    state.value.budgetAdminBudgetKey = ""
  }

  function getServiceEntitlementHeaders(): Record<string, string> {
    return {
      "X-Service-Entitlement-Token": sanitizeCredentialToken(state.value.serviceEntitlementToken),
    }
  }

  function getHostAdminHeaders(): Record<string, string> {
    return {
      "X-Host-Admin-Session": sanitizeCredentialToken(state.value.hostAdminSessionToken),
    }
  }

  function getBudgetAdminHeaders(): Record<string, string> {
    return {
      "X-Budget-Admin-Session": sanitizeCredentialToken(state.value.budgetAdminSessionToken),
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
    hostAdminBootstrapToken: computed(() => state.value.hostAdminBootstrapToken),
    hostAdminSessionToken: computed(() => state.value.hostAdminSessionToken),
    budgetAdminSessionToken: computed(() => state.value.budgetAdminSessionToken),
    budgetAdminBudgetKey: computed(() => state.value.budgetAdminBudgetKey),
    serviceEntitlementTokenVerified,
    hasServiceEntitlementToken,
    hasHostAdminSessionToken,
    hasBudgetAdminSessionToken,
    recentCalls,
    roomParticipantCredentials,
    preferences,
    isAuthenticated,

    // Actions
    sanitizeCredentialToken,
    setServiceEntitlementToken,
    clearServiceEntitlementToken,
    setHostAdminSessionToken,
    clearHostAdminSessionToken,
    setBudgetAdminSession,
    clearBudgetAdminSession,
    getServiceEntitlementHeaders,
    getHostAdminHeaders,
    getBudgetAdminHeaders,
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
