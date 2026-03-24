import type { Ref } from "vue"
import { useAdminClient } from "./useAdminClient"
import { useAdminSessions } from "./useAdminSessions"
import { useI18n } from "./useI18n"
import { useToast } from "./useToast"

type AdminAccessState = "checking" | "authorized" | "unauthorized"

export function useHostAdminBootstrap(options: {
  adminAccessState: Ref<AdminAccessState>
  hostAdminTokenInput: Ref<string>
  lastError: Ref<string>
  clearPageState: () => void
  refreshAll: () => Promise<void>
}) {
  const { adminAccessState, hostAdminTokenInput, lastError, clearPageState, refreshAll } = options
  const { t } = useI18n()
  const { show } = useToast()
  const { store, hasHostAdminSession } = useAdminSessions()
  const { verifyHostAdminAccess, copyHostAdminBootstrapToken } = useAdminClient()

  async function exchangeHostAdminBootstrapToken(bootstrapToken: string) {
    return fetch("/admin/auth/exchange", {
      method: "POST",
      headers: {
        "X-Host-Admin-Token": bootstrapToken,
      },
    })
  }

  async function verifyAdminAccess() {
    if (!hasHostAdminSession.value) {
      adminAccessState.value = "unauthorized"
      return false
    }

    adminAccessState.value = "checking"
    const authorized = await verifyHostAdminAccess()
    if (!authorized) {
      adminAccessState.value = "unauthorized"
      return false
    }

    adminAccessState.value = "authorized"
    return true
  }

  async function saveHostAdminToken() {
    const bootstrapToken = store.sanitizeCredentialToken(hostAdminTokenInput.value)
    if (!bootstrapToken) return

    lastError.value = ""

    try {
      const exchange = await exchangeHostAdminBootstrapToken(bootstrapToken)
      if (!exchange.ok) {
        throw new Error(await exchange.text())
      }
      const exchangeData = (await exchange.json()) as { hostAdminSessionToken: string }
      store.setHostAdminSessionToken(exchangeData.hostAdminSessionToken, bootstrapToken)

      const authorized = await verifyAdminAccess()
      if (!authorized) {
        lastError.value = t("admin_access_denied_hint")
        show(lastError.value, "error")
        return
      }
      hostAdminTokenInput.value = ""
      show(t("admin_bootstrap_saved"), "success")
      await refreshAll()
    } catch (error) {
      store.clearHostAdminSessionToken()
      adminAccessState.value = "unauthorized"
      lastError.value = error instanceof Error ? error.message : String(error)
      show(lastError.value, "error")
    }
  }

  function clearStoredHostAdminToken() {
    store.clearHostAdminSessionToken()
    hostAdminTokenInput.value = ""
    adminAccessState.value = "unauthorized"
    clearPageState()
  }

  async function copyHostAdminToken() {
    try {
      await copyHostAdminBootstrapToken()
      show(t("admin_bootstrap_token_copied"), "success")
    } catch {
      show(t("admin_token_copy_failed"), "error")
    }
  }

  return {
    hasHostAdminSession,
    verifyAdminAccess,
    saveHostAdminToken,
    clearStoredHostAdminToken,
    copyHostAdminToken,
  }
}
