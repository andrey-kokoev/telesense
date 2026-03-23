import type { Ref } from "vue"
import type { EntitlementTokenRecord } from "../types/entitlementTokens"

type ToastFn = (message: string, variant?: "success" | "error" | "info") => void
type TranslateFn = (key: string, params?: Record<string, string>) => string

export function useEntitlementTokenActions(options: {
  budgetKey: string
  adminFetch: (path: string, init?: RequestInit) => Promise<Response>
  t: TranslateFn
  show: ToastFn
  lastError: Ref<string>
  entitlementTokens: Ref<EntitlementTokenRecord[]>
  tokenDraftLabels: Ref<Record<string, string>>
  editingTokenId: Ref<string>
  editingTokenOriginalLabel: Ref<string>
  editingTokenInput: Ref<HTMLInputElement | null>
}) {
  const {
    budgetKey,
    adminFetch,
    t,
    show,
    lastError,
    entitlementTokens,
    tokenDraftLabels,
    editingTokenId,
    editingTokenOriginalLabel,
    editingTokenInput,
  } = options

  function resetEntitlementTokenLabel(token: EntitlementTokenRecord) {
    tokenDraftLabels.value[token.tokenId] = token.label ?? ""
  }

  async function saveEntitlementTokenLabel(token: EntitlementTokenRecord) {
    const nextLabel = (tokenDraftLabels.value[token.tokenId] ?? "").trim()
    const currentLabel = token.label ?? ""
    if (nextLabel === currentLabel) return

    try {
      const response = await adminFetch("/admin/entitlement/tokens/label", {
        method: "POST",
        body: JSON.stringify({
          budgetKey,
          tokenId: token.tokenId,
          label: nextLabel || null,
        }),
      })
      if (!response.ok) throw new Error(await response.text())
      const data = (await response.json()) as { token: EntitlementTokenRecord | null }
      if (data.token) {
        entitlementTokens.value = entitlementTokens.value.map((item) =>
          item.tokenId === data.token?.tokenId ? data.token : item,
        )
        tokenDraftLabels.value[token.tokenId] = data.token.label ?? ""
      }
      show(t("budget_admin_token_label_saved"), "success")
    } catch (error) {
      resetEntitlementTokenLabel(token)
      lastError.value = error instanceof Error ? error.message : String(error)
      show(lastError.value, "error")
    }
  }

  async function copyEntitlementToken(token: EntitlementTokenRecord) {
    try {
      const response = await adminFetch(
        `/admin/entitlement/tokens/value?budgetKey=${encodeURIComponent(budgetKey)}&tokenId=${encodeURIComponent(token.tokenId)}`,
      )
      if (!response.ok) throw new Error(await response.text())
      const data = (await response.json()) as { tokenValue: string | null }
      if (!data.tokenValue) {
        throw new Error("Token value unavailable")
      }
      await navigator.clipboard.writeText(data.tokenValue)
      show(t("admin_token_copied"), "success")
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      show(t("admin_token_copy_failed"), "error")
    }
  }

  async function deleteEntitlementToken(token: EntitlementTokenRecord) {
    try {
      const response = await adminFetch("/admin/entitlement/tokens/delete", {
        method: "POST",
        body: JSON.stringify({
          budgetKey,
          tokenId: token.tokenId,
        }),
      })
      if (!response.ok) throw new Error(await response.text())
      entitlementTokens.value = entitlementTokens.value.filter(
        (item) => item.tokenId !== token.tokenId,
      )
      delete tokenDraftLabels.value[token.tokenId]
      if (editingTokenId.value === token.tokenId) {
        editingTokenId.value = ""
        editingTokenOriginalLabel.value = ""
        editingTokenInput.value = null
      }
      show(t("budget_admin_token_deleted"), "success")
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      show(lastError.value, "error")
    }
  }

  async function toggleEntitlementToken(token: EntitlementTokenRecord) {
    const previous = token.active
    entitlementTokens.value = entitlementTokens.value.map((item) =>
      item.tokenId === token.tokenId ? { ...item, active: !item.active } : item,
    )

    try {
      const response = await adminFetch("/admin/entitlement/tokens/active", {
        method: "POST",
        body: JSON.stringify({
          budgetKey,
          tokenId: token.tokenId,
          active: !previous,
        }),
      })
      if (!response.ok) throw new Error(await response.text())
      const data = (await response.json()) as { token: EntitlementTokenRecord | null }
      if (data.token) {
        entitlementTokens.value = entitlementTokens.value.map((item) =>
          item.tokenId === data.token?.tokenId ? data.token : item,
        )
      }
    } catch (error) {
      entitlementTokens.value = entitlementTokens.value.map((item) =>
        item.tokenId === token.tokenId ? { ...item, active: previous } : item,
      )
      lastError.value = error instanceof Error ? error.message : String(error)
      show(lastError.value, "error")
    }
  }

  return {
    resetEntitlementTokenLabel,
    saveEntitlementTokenLabel,
    copyEntitlementToken,
    deleteEntitlementToken,
    toggleEntitlementToken,
  }
}
