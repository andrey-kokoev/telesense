export function useAdminNavigation() {
  function goHome() {
    window.location.href = "/"
  }

  function goHostAdmin() {
    window.location.href = "/host-admin"
  }

  function goBudgetAdmin(budgetKey: string) {
    window.location.href = `/budget-admin/${encodeURIComponent(budgetKey)}`
  }

  return {
    goHome,
    goHostAdmin,
    goBudgetAdmin,
  }
}
