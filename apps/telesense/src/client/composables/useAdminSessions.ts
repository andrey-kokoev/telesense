import { computed } from "vue"
import { useAppStore } from "./useAppStore"

export function useAdminSessions() {
  const store = useAppStore()

  const hasHostAdminSession = computed(() => !!store.hostAdminSessionToken.value)
  const hasBudgetAdminSession = computed(
    () => !!store.budgetAdminSessionToken.value && !!store.budgetAdminBudgetKey.value,
  )

  function hostAdminHeaders() {
    return store.getHostAdminHeaders()
  }

  function budgetAdminHeaders() {
    return store.getBudgetAdminHeaders()
  }

  return {
    store,
    hasHostAdminSession,
    hasBudgetAdminSession,
    hostAdminHeaders,
    budgetAdminHeaders,
  }
}
