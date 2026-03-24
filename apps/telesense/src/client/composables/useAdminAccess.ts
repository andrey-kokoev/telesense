import { useAdminClient } from "./useAdminClient"
import { useAdminNavigation } from "./useAdminNavigation"
import { useAdminSessions } from "./useAdminSessions"

export function useAdminAccess() {
  const {
    store,
    hasHostAdminSession,
    hasBudgetAdminSession,
    hostAdminHeaders,
    budgetAdminHeaders,
  } = useAdminSessions()
  const { goHome, goHostAdmin, goBudgetAdmin } = useAdminNavigation()
  const {
    adminHeaders,
    adminFetch,
    adminFetchJson,
    verifyHostAdminAccess,
    verifyBudgetAdminAccess,
    copyHostAdminBootstrapToken,
  } = useAdminClient()

  return {
    store,
    hasHostAdminSession,
    hasBudgetAdminSession,
    goHome,
    goHostAdmin,
    goBudgetAdmin,
    hostAdminHeaders,
    budgetAdminHeaders,
    adminHeaders,
    adminFetch,
    adminFetchJson,
    verifyHostAdminAccess,
    verifyBudgetAdminAccess,
    copyHostAdminBootstrapToken,
  }
}
