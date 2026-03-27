<script setup lang="ts">
import { computed } from "vue"
import { useBuildInfo } from "../composables/useBuildInfo"

const { buildLabel, updateAvailable, isRefreshing, refreshToLatest, builtAtLabel } = useBuildInfo()

const text = computed(() => {
  if (isRefreshing.value) return `${buildLabel.value} · refreshing`
  if (updateAvailable.value) return `${buildLabel.value} · update available - tap to refresh`
  return `${buildLabel.value} · deployed ${builtAtLabel.value}`
})

function handleClick() {
  if (!updateAvailable.value || isRefreshing.value) return
  void refreshToLatest()
}
</script>

<template>
  <button
    type="button"
    class="build-status-text"
    :class="{ 'build-status-text--interactive': updateAvailable }"
    :disabled="!updateAvailable || isRefreshing"
    @click="handleClick"
  >
    {{ text }}
  </button>
</template>

<style scoped>
.build-status-text {
  border: none;
  padding: 0;
  background: none;
  color: color-mix(in srgb, var(--color-text-secondary) 78%, transparent);
  font-family: var(--font-mono-display);
  font-size: 0.68rem;
  line-height: 1.2;
  text-align: center;
}

.build-status-text:disabled {
  cursor: default;
}

.build-status-text--interactive {
  color: color-mix(in srgb, var(--color-text-primary) 65%, var(--color-accent));
  cursor: pointer;
}
</style>
