import { computed, ref, watch, type Ref } from "vue"
import type { StoredServiceEntitlementState } from "./useAppStore"

type TokenResolveData =
  | {
      kind?: "host-admin"
      hostAdminSessionToken?: string
      serviceEntitlementToken?: string
      budgetKey?: string
      error?: string
    }
  | {
      kind?: "budget-admin"
      budgetAdminSessionToken?: string
      budgetKey?: string
      serviceEntitlementToken?: string
      error?: string
    }
  | {
      kind?: "service-entitlement"
      entitlementState?: "valid" | "exhausted"
      error?: string
    }

type TokenResolveResult = {
  ok: boolean
  status: number
  data: TokenResolveData
}

type TokenEntryPhase = "idle" | "editing" | "verifying" | "invalid"
type TokenEntryUiState = "missing" | "verifying" | "valid" | "exhausted" | "invalid"
type ToastFn = (message: string, variant?: "success" | "error" | "info") => void
type TranslateFn = (key: string, params?: Record<string, string>) => string

export function useLandingTokenEntry(options: {
  serviceEntitlementState: Ref<StoredServiceEntitlementState>
  hasHostAdminSessionToken: Ref<boolean>
  hasBudgetAdminSessionToken: Ref<boolean>
  sanitizeCredentialToken: (token: string) => string
  setServiceEntitlementToken: (
    token: string,
    entitlementState?: Exclude<StoredServiceEntitlementState, "missing">,
  ) => void
  setHostAdminSessionToken: (token: string, bootstrapToken?: string) => void
  setBudgetAdminSession: (token: string, budgetKey: string) => void
  clearServiceEntitlementToken: () => void
  clearHostAdminSessionToken: () => void
  clearBudgetAdminSession: () => void
  resolveEnteredToken: (candidateToken: string) => Promise<TokenResolveResult>
  t: TranslateFn
  show: ToastFn
  navigate: (path: string) => void
}) {
  const {
    serviceEntitlementState,
    hasHostAdminSessionToken,
    hasBudgetAdminSessionToken,
    sanitizeCredentialToken,
    setServiceEntitlementToken,
    setHostAdminSessionToken,
    setBudgetAdminSession,
    clearServiceEntitlementToken,
    clearHostAdminSessionToken,
    clearBudgetAdminSession,
    resolveEnteredToken,
    t,
    show,
    navigate,
  } = options

  const tokenInput = ref("")
  const showTokenModal = ref(false)
  const tokenEntryPhase = ref<TokenEntryPhase>("idle")

  const serviceEntitlementUiState = computed<TokenEntryUiState>(() => {
    if (tokenEntryPhase.value === "verifying") return "verifying"
    if (tokenEntryPhase.value === "invalid") return "invalid"
    return serviceEntitlementState.value
  })

  const tokenStatusLabel = computed(() => {
    if (serviceEntitlementUiState.value === "verifying") {
      return `… ${t("landing_service_entitlement_verifying")}`
    }
    if (serviceEntitlementUiState.value === "invalid") {
      return `! ${t("landing_invalid_token")}`
    }
    if (serviceEntitlementUiState.value === "exhausted") {
      return `! ${t("landing_service_entitlement_saved_exhausted")}`
    }
    if (hasHostAdminSessionToken.value) {
      return `✓ ${t("landing_host_admin_access_active")}`
    }
    if (hasBudgetAdminSessionToken.value) {
      return `✓ ${t("landing_budget_admin_access_active")}`
    }
    return `✓ ${t("landing_token_set")}`
  })

  watch(tokenInput, (value) => {
    if (tokenEntryPhase.value === "verifying") return
    tokenEntryPhase.value = value.trim() ? "editing" : "idle"
  })

  function openTokenModal() {
    if (tokenEntryPhase.value === "invalid") {
      tokenEntryPhase.value = tokenInput.value.trim() ? "editing" : "idle"
    }
    showTokenModal.value = true
  }

  function closeTokenModal() {
    if (tokenEntryPhase.value !== "verifying") {
      tokenEntryPhase.value = tokenInput.value.trim() ? "editing" : "idle"
    }
    showTokenModal.value = false
  }

  async function saveEnteredToken() {
    const token = sanitizeCredentialToken(tokenInput.value)
    if (!token) return false

    tokenEntryPhase.value = "verifying"
    const resolution = await resolveEnteredToken(token)

    if (!resolution.ok) {
      tokenEntryPhase.value = "invalid"
      show(
        ("error" in resolution.data && resolution.data.error) || t("landing_invalid_token"),
        "error",
      )
      return false
    }

    if (resolution.data.kind === "host-admin" && resolution.data.hostAdminSessionToken) {
      setHostAdminSessionToken(resolution.data.hostAdminSessionToken, token)
      if (resolution.data.serviceEntitlementToken) {
        setServiceEntitlementToken(resolution.data.serviceEntitlementToken, "valid")
      }
      tokenEntryPhase.value = "idle"
      tokenInput.value = ""
      show(t("admin_bootstrap_saved"), "success")
      navigate("/host-admin")
      return true
    }

    if (
      resolution.data.kind === "budget-admin" &&
      resolution.data.budgetAdminSessionToken &&
      resolution.data.budgetKey
    ) {
      setBudgetAdminSession(resolution.data.budgetAdminSessionToken, resolution.data.budgetKey)
      if (resolution.data.serviceEntitlementToken) {
        setServiceEntitlementToken(resolution.data.serviceEntitlementToken, "valid")
      }
      tokenEntryPhase.value = "idle"
      tokenInput.value = ""
      show(t("budget_admin_unlocked"), "success")
      navigate(`/budget-admin/${encodeURIComponent(resolution.data.budgetKey)}`)
      return true
    }

    const entitlementState =
      resolution.data.kind === "service-entitlement" &&
      resolution.data.entitlementState === "exhausted"
        ? "exhausted"
        : "valid"

    setServiceEntitlementToken(token, entitlementState)
    tokenEntryPhase.value = "idle"
    tokenInput.value = ""

    if (entitlementState === "exhausted") {
      show(
        ("error" in resolution.data && resolution.data.error) ||
          t("landing_service_entitlement_saved_exhausted"),
        "error",
      )
      return true
    }

    show(t("landing_token_saved"), "success")
    return true
  }

  async function updateServiceEntitlementToken() {
    const saved = await saveEnteredToken()
    if (saved) {
      closeTokenModal()
    }
  }

  function clearEnteredAccess() {
    clearServiceEntitlementToken()
    clearHostAdminSessionToken()
    clearBudgetAdminSession()
    tokenInput.value = ""
    tokenEntryPhase.value = "idle"
    showTokenModal.value = false
  }

  return {
    tokenInput,
    showTokenModal,
    tokenEntryPhase,
    serviceEntitlementUiState,
    tokenStatusLabel,
    openTokenModal,
    closeTokenModal,
    saveEnteredToken,
    updateServiceEntitlementToken,
    clearEnteredAccess,
  }
}
