import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  type ComponentPublicInstance,
  type Ref,
} from "vue"
import { writeToClipboard } from "../lib/clipboard"
import { useEntitlementTokenActions } from "./useEntitlementTokenActions"
import type { EntitlementTokenRecord } from "../types/entitlementTokens"

export function useBudgetAdminTokens(options: {
  budgetKey: string
  adminFetch: (
    path: string,
    init?: RequestInit,
    options?: { preferHostAdmin?: boolean },
  ) => Promise<Response>
  adminFetchJson: <T>(
    path: string,
    init?: RequestInit,
    options?: { preferHostAdmin?: boolean },
  ) => Promise<T>
  t: (key: string, params?: Record<string, string>) => string
  show: (message: string, tone?: "success" | "error" | "info") => void
  lastError: Ref<string>
}) {
  const { budgetKey, adminFetch, adminFetchJson, t, show, lastError } = options

  const entitlementTokens = ref<EntitlementTokenRecord[]>([])
  const tokenDraftLabels = ref<Record<string, string>>({})
  const editingTokenId = ref("")
  const editingTokenOriginalLabel = ref("")
  const editingTokenInput = ref<HTMLInputElement | null>(null)

  async function loadEntitlementTokens() {
    const data = await adminFetchJson<{ tokens: EntitlementTokenRecord[] }>(
      `/admin/entitlement/tokens?budgetKey=${encodeURIComponent(budgetKey)}`,
    )
    entitlementTokens.value = data.tokens
    tokenDraftLabels.value = Object.fromEntries(
      data.tokens.map((token) => [token.tokenId, token.label ?? ""]),
    )
  }

  async function mintEntitlementToken() {
    try {
      const response = await adminFetch("/admin/entitlement/mint", {
        method: "POST",
        body: JSON.stringify({ budgetKey }),
      })
      if (!response.ok) throw new Error(await response.text())
      const data = (await response.json()) as {
        serviceEntitlementToken: string
        tokenId: string
        budgetKey: string
        budgetId: string
        secretVersion: number
      }
      await loadEntitlementTokens()
      try {
        await writeToClipboard(data.serviceEntitlementToken)
        show(t("admin_token_copied"), "success")
      } catch {
        show(t("budget_admin_entitlement_minted"), "success")
      }
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      show(lastError.value, "error")
    }
  }

  function setTokenDraftLabel(tokenId: string, event: Event) {
    const target = event.target as HTMLInputElement
    tokenDraftLabels.value[tokenId] = target.value
  }

  function setEditingTokenInput(el: Element | ComponentPublicInstance | null) {
    if (el instanceof HTMLInputElement) {
      editingTokenInput.value = el
      return
    }
    if (el instanceof Element) {
      editingTokenInput.value = el instanceof HTMLInputElement ? el : el.querySelector("input")
      return
    }
    if (el && "$el" in el && el.$el instanceof Element) {
      editingTokenInput.value =
        el.$el instanceof HTMLInputElement ? el.$el : el.$el.querySelector("input")
      return
    }
    editingTokenInput.value = null
  }

  function startEntitlementTokenLabelEdit(token: EntitlementTokenRecord) {
    editingTokenId.value = token.tokenId
    tokenDraftLabels.value[token.tokenId] = token.label ?? ""
    editingTokenOriginalLabel.value = token.label ?? ""
    void nextTick(() => {
      editingTokenInput.value?.focus()
      editingTokenInput.value?.select()
    })
  }

  function cancelEntitlementTokenLabelEdit() {
    if (!editingTokenId.value) return
    const tokenId = editingTokenId.value
    tokenDraftLabels.value[tokenId] = editingTokenOriginalLabel.value
    editingTokenId.value = ""
    editingTokenOriginalLabel.value = ""
  }

  async function commitEntitlementTokenLabel(token: EntitlementTokenRecord) {
    if (editingTokenId.value !== token.tokenId) return
    editingTokenId.value = ""
    editingTokenOriginalLabel.value = ""
    await saveEntitlementTokenLabel(token)
  }

  const {
    saveEntitlementTokenLabel,
    copyEntitlementToken,
    deleteEntitlementToken,
    toggleEntitlementToken,
  } = useEntitlementTokenActions({
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
  })

  function handleDocumentClick(event: MouseEvent) {
    const target = event.target
    if (!(target instanceof Element)) {
      cancelEntitlementTokenLabelEdit()
      return
    }

    if (
      editingTokenId.value &&
      !target.closest("[data-budget-token-label-edit]") &&
      !target.closest("[data-budget-token-label-display]")
    ) {
      cancelEntitlementTokenLabelEdit()
    }
  }

  onMounted(() => {
    document.addEventListener("click", handleDocumentClick)
  })

  onBeforeUnmount(() => {
    document.removeEventListener("click", handleDocumentClick)
  })

  return {
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
  }
}
