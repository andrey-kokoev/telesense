import type { Ref } from "vue"
import { useAdminClient } from "./useAdminClient"
import { useAdminNavigation } from "./useAdminNavigation"
import { useAdminSessions } from "./useAdminSessions"
import { useI18n } from "./useI18n"
import { useToast } from "./useToast"

type AccessState = "checking" | "authorized" | "unauthorized"

export function useBudgetAdminAccess(options: {
  budgetKey: string
  accessState: Ref<AccessState>
  budgetAdminTokenInput: Ref<string>
  budgetLabel: Ref<string>
  lastError: Ref<string>
}) {
  const { budgetKey, accessState, budgetAdminTokenInput, budgetLabel, lastError } = options
  const { t } = useI18n()
  const { show } = useToast()
  const { store, hasHostAdminSession } = useAdminSessions()
  const { goHome, goHostAdmin } = useAdminNavigation()
  const { adminFetchJson, verifyBudgetAdminAccess } = useAdminClient()

  async function verifyAccess() {
    accessState.value = "checking"
    const authorized = await verifyBudgetAdminAccess(budgetKey)
    if (!authorized) {
      accessState.value = "unauthorized"
      return false
    }
    accessState.value = "authorized"
    return true
  }

  async function loadBudgetLabel() {
    if (!store.hostAdminSessionToken.value) return
    const data = await adminFetchJson<{
      budgets: Array<{ budgetKey: string; label: string | null }>
    }>("/admin/host/budgets")
    budgetLabel.value =
      data.budgets.find((item) => item.budgetKey === budgetKey)?.label || budgetKey
  }

  async function unlockBudgetAdmin() {
    const token = store.sanitizeCredentialToken(budgetAdminTokenInput.value)
    if (!token) return
    lastError.value = ""
    try {
      const response = await fetch("/budget-admin/auth/exchange", {
        method: "POST",
        headers: { "X-Budget-Admin-Token": token },
      })
      if (!response.ok) throw new Error(await response.text())
      const data = (await response.json()) as { budgetKey: string; budgetAdminSessionToken: string }
      store.setBudgetAdminSession(data.budgetAdminSessionToken, data.budgetKey)
      budgetAdminTokenInput.value = ""
      show(t("budget_admin_unlocked"), "success")
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      show(lastError.value, "error")
      throw error
    }
  }

  return {
    goHome,
    goHostAdmin,
    hasHostAdminSession,
    verifyAccess,
    loadBudgetLabel,
    unlockBudgetAdmin,
  }
}
