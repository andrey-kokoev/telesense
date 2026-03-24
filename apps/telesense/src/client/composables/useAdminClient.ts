import { readErrorText, readJsonResponse } from "../lib/jsonClient"
import { useAdminSessions } from "./useAdminSessions"

export function useAdminClient() {
  const {
    store,
    hasHostAdminSession,
    hasBudgetAdminSession,
    hostAdminHeaders,
    budgetAdminHeaders,
  } = useAdminSessions()

  function adminHeaders(preferHostAdmin = true) {
    if (preferHostAdmin && hasHostAdminSession.value) {
      return hostAdminHeaders()
    }
    return budgetAdminHeaders()
  }

  async function adminFetch(
    path: string,
    init: RequestInit = {},
    options: { preferHostAdmin?: boolean } = {},
  ) {
    return fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...adminHeaders(options.preferHostAdmin ?? true),
        ...(init.headers && !Array.isArray(init.headers)
          ? (init.headers as Record<string, string>)
          : {}),
      },
    })
  }

  async function adminFetchJson<T>(
    path: string,
    init: RequestInit = {},
    options: { preferHostAdmin?: boolean } = {},
  ) {
    const response = await adminFetch(path, init, options)
    if (!response.ok) {
      throw new Error(await readErrorText(response))
    }
    return readJsonResponse<T>(response)
  }

  async function verifyHostAdminAccess() {
    if (!hasHostAdminSession.value) {
      return false
    }

    const response = await adminFetch("/admin/auth/verify")
    if (!response.ok) {
      store.clearHostAdminSessionToken()
      return false
    }

    return true
  }

  async function verifyBudgetAdminAccess(budgetKey: string) {
    if (hasHostAdminSession.value) {
      return true
    }
    if (!hasBudgetAdminSession.value || store.budgetAdminBudgetKey.value !== budgetKey) {
      return false
    }

    const response = await fetch(
      `/budget-admin/auth/verify?budgetKey=${encodeURIComponent(budgetKey)}`,
      {
        headers: budgetAdminHeaders(),
      },
    )
    if (!response.ok) {
      store.clearBudgetAdminSession()
      return false
    }

    return true
  }

  async function copyHostAdminBootstrapToken() {
    const data = await adminFetchJson<{ hostAdminBootstrapToken: string }>("/admin/auth/bootstrap")
    const token = store.sanitizeCredentialToken(data.hostAdminBootstrapToken)
    if (!token) {
      throw new Error("Missing host admin bootstrap token")
    }
    store.setHostAdminSessionToken(store.hostAdminSessionToken.value, token)
    await navigator.clipboard.writeText(token)
  }

  return {
    adminHeaders,
    adminFetch,
    adminFetchJson,
    verifyHostAdminAccess,
    verifyBudgetAdminAccess,
    copyHostAdminBootstrapToken,
  }
}
