import type {
  BudgetResponse,
  BudgetUsageSummary,
  MonthlyAllowanceResponse,
} from "../types/hostAdmin"

type TranslateFn = (key: string, params?: Record<string, string>) => string

export type BudgetPresentation = {
  statusLabel: string
  usageSummaryText: string
  usagePercent: number
  usageLimitLabel: string
  usageDetail: string
  usageSummary: BudgetUsageSummary | null
}

export function formatBudgetBytes(bytes: number | null | undefined) {
  if (typeof bytes !== "number") return "—"

  const units = ["B", "KiB", "MiB", "GiB", "TiB"]
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

export function presentBudget(
  budget: BudgetResponse | null,
  monthlyAllowance: MonthlyAllowanceResponse | null,
  t: TranslateFn,
): BudgetPresentation {
  const statusLabel = (() => {
    switch (budget?.grace.lifecycle) {
      case "uninitialized":
        return t("admin_status_uninitialized")
      case "active":
        return t("admin_status_active")
      case "in_grace":
        return t("admin_status_in_grace")
      case "exhausted":
        return t("admin_status_exhausted")
      default:
        return t("admin_status_loading")
    }
  })()

  if (!budget) {
    return {
      statusLabel,
      usageSummaryText: "— used",
      usagePercent: 0,
      usageLimitLabel: "— budget size",
      usageDetail: "",
      usageSummary: null,
    }
  }

  if (budget.grace.lifecycle === "uninitialized") {
    const totalBytes = monthlyAllowance?.resetAmountBytes ?? 0
    return {
      statusLabel,
      usageSummaryText: t("admin_budget_not_initialized"),
      usagePercent: 0,
      usageLimitLabel: `${formatBudgetBytes(totalBytes)} budget size`,
      usageDetail: t("admin_budget_not_initialized"),
      usageSummary: null,
    }
  }

  const totalBytes =
    monthlyAllowance?.resetAmountBytes ??
    budget.allowance.remainingBytes + budget.allowance.consumedBytes
  const usagePercent =
    totalBytes > 0
      ? Math.max(0, Math.min(100, Math.round((budget.allowance.consumedBytes / totalBytes) * 100)))
      : 0
  const usageSummaryText = t("admin_budget_used_percent", { percent: String(usagePercent) })
  const usageLimitLabel = `${formatBudgetBytes(totalBytes)} budget size`
  const usageDetail =
    totalBytes > 0
      ? t("admin_budget_used_detail", {
          used: formatBudgetBytes(budget.allowance.consumedBytes),
          total: formatBudgetBytes(totalBytes),
        })
      : ""

  return {
    statusLabel,
    usageSummaryText,
    usagePercent,
    usageLimitLabel,
    usageDetail,
    usageSummary: {
      percent: usagePercent,
      label: usageSummaryText,
      title: usageDetail,
    },
  }
}
