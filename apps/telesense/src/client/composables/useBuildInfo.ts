import { computed, ref } from "vue"
import { useToast } from "./useToast"

const updateAvailable = ref(false)
const isRefreshing = ref(false)
let applyUpdate: ((reloadPage?: boolean) => Promise<void>) | null = null

const { show } = useToast()

function formatBuildTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

export function useBuildInfo() {
  const version = __APP_VERSION__
  const commit = __BUILD_COMMIT_SHA__
  const builtAt = __BUILD_TIME__

  const shortCommit = computed(() => commit.slice(0, 7))
  const buildLabel = computed(() => `v${version} · ${shortCommit.value}`)
  const builtAtLabel = computed(() => formatBuildTime(builtAt))
  const statusLabel = computed(() =>
    updateAvailable.value ? "Update available - tap to refresh" : `Deployed ${builtAtLabel.value}`,
  )

  async function refreshToLatest(): Promise<void> {
    if (isRefreshing.value) return
    isRefreshing.value = true
    try {
      if (applyUpdate) {
        await applyUpdate(true)
      } else {
        window.location.reload()
      }
    } finally {
      isRefreshing.value = false
    }
  }

  function registerUpdateHandler(handler: (reloadPage?: boolean) => Promise<void>): void {
    applyUpdate = handler
  }

  function markUpdateAvailable(): void {
    if (updateAvailable.value) return
    updateAvailable.value = true
    show("New version available. Tap the build badge to refresh.", "info")
  }

  function clearUpdateAvailable(): void {
    updateAvailable.value = false
  }

  return {
    version,
    commit,
    builtAt,
    shortCommit,
    buildLabel,
    builtAtLabel,
    statusLabel,
    updateAvailable,
    isRefreshing,
    refreshToLatest,
    registerUpdateHandler,
    markUpdateAvailable,
    clearUpdateAvailable,
  }
}
