export type EntitlementTokenRecord = {
  tokenId: string
  budgetKey: string
  budgetId: string
  secretVersion: number
  tokenPreview: string | null
  label: string | null
  active: boolean
  consumedBytes?: number
  createdAt: number
  updatedAt: number
}
