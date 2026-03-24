import { computed, onMounted, ref } from "vue"
import { useAdminClient } from "./useAdminClient"
import { useBudgetAdminAccess } from "./useBudgetAdminAccess"
import { useBudgetAdminTokens } from "./useBudgetAdminTokens"
import { presentBudget } from "./useBudgetPresentation"
import { useI18n } from "./useI18n"
import { useToast } from "./useToast"
import type { BudgetResponse, MonthlyAllowanceResponse } from "../types/hostAdmin"

type AccessState = "checking" | "authorized" | "unauthorized"

export default function useBudgetAdminPage(props: { budgetKey: string }) {
  const { adminFetch, adminFetchJson } = useAdminClient()
  const { t } = useI18n()
  const { show } = useToast()
  const budget = ref<BudgetResponse | null>(null)
  const monthlyAllowance = ref<MonthlyAllowanceResponse | null>(null)
  const budgetLabel = ref(props.budgetKey)
  const accessState = ref<AccessState>("checking")
  const budgetAdminTokenInput = ref("")
  const lastError = ref("")
  const showBudgetKey = computed(() => budgetLabel.value.trim() !== props.budgetKey.trim())

  const budgetPresentation = computed(() =>
    presentBudget(
      budget.value,
      monthlyAllowance.value,
      t as (key: string, params?: Record<string, string>) => string,
    ),
  )

  async function loadBudget() {
    budget.value = await adminFetchJson<BudgetResponse>(
      `/admin/entitlement/budget?budgetKey=${encodeURIComponent(props.budgetKey)}`,
    )
  }

  async function loadMonthlyAllowance() {
    monthlyAllowance.value = await adminFetchJson<MonthlyAllowanceResponse>(
      `/admin/entitlement/monthly-allowance?budgetKey=${encodeURIComponent(props.budgetKey)}`,
    )
  }

  async function refresh() {
    lastError.value = ""
    try {
      const ok = await verifyAccess()
      if (!ok) return
      await Promise.all([loadBudget(), loadMonthlyAllowance(), loadEntitlementTokens()])
      await loadBudgetLabel().catch(() => {
        // Host-admin label lookup is best-effort and should not block budget-admin access.
      })
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
    }
  }

  const {
    goHome,
    goHostAdmin,
    hasHostAdminSession,
    verifyAccess,
    loadBudgetLabel,
    unlockBudgetAdmin: unlockBudgetAdminAccess,
  } = useBudgetAdminAccess({
    budgetKey: props.budgetKey,
    accessState,
    budgetAdminTokenInput,
    budgetLabel,
    lastError,
  })

  async function unlockBudgetAdmin() {
    try {
      await unlockBudgetAdminAccess()
      await refresh()
    } catch {
      // Error state and toast are handled in useBudgetAdminAccess.
    }
  }

  const {
    entitlementTokens,
    tokenDraftLabels,
    editingTokenId,
    loadEntitlementTokens,
    mintEntitlementToken,
    setTokenDraftLabel,
    setEditingTokenInput,
    startEntitlementTokenLabelEdit,
    cancelEntitlementTokenLabelEdit,
    commitEntitlementTokenLabel,
    copyEntitlementToken,
    deleteEntitlementToken,
    toggleEntitlementToken,
  } = useBudgetAdminTokens({
    budgetKey: props.budgetKey,
    adminFetch,
    adminFetchJson,
    t: t as (key: string, params?: Record<string, string>) => string,
    show,
    lastError,
  })

  onMounted(() => {
    void refresh()
  })

  return {
    t,
    goHome,
    goHostAdmin,
    hasHostAdminSession,
    budgetLabel,
    showBudgetKey,
    accessState,
    budgetAdminTokenInput,
    lastError,
    entitlementTokens,
    tokenDraftLabels,
    editingTokenId,
    budgetStatus: computed(() => budgetPresentation.value.statusLabel),
    usageSummary: computed(() => budgetPresentation.value.usageSummaryText),
    usagePercent: computed(() => budgetPresentation.value.usagePercent),
    usageLimitLabel: computed(() => budgetPresentation.value.usageLimitLabel),
    usageDetail: computed(() => budgetPresentation.value.usageDetail),
    unlockBudgetAdmin,
    mintEntitlementToken,
    setTokenDraftLabel,
    setEditingTokenInput,
    startEntitlementTokenLabelEdit,
    cancelEntitlementTokenLabelEdit,
    commitEntitlementTokenLabel,
    copyEntitlementToken,
    deleteEntitlementToken,
    toggleEntitlementToken,
  }
}
