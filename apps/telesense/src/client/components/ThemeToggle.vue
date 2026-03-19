<template>
  <button class="theme-toggle" :title="`Theme: ${theme} (click to cycle)`" @click="cycleTheme">
    <Icon :icon="iconName" class="theme-toggle__icon" aria-hidden="true" />
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { Icon } from "@iconify/vue"
import { useTheme } from "../composables/useTheme"

const { theme, cycleTheme } = useTheme()

const iconName = computed(() => {
  switch (theme.value) {
    case "light":
      return "heroicons:sun"
    case "dark":
      return "heroicons:moon"
    case "system":
      return "heroicons:computer-desktop"
    default:
      return "heroicons:sun"
  }
})
</script>

<style scoped>
.theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  padding: 0;
  font-family: inherit;
  color: var(--color-text-secondary);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  cursor: pointer;
  margin-bottom: var(--space-4);
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.theme-toggle:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-border-hover);
  color: var(--color-text-primary);
}

.theme-toggle__icon {
  width: 1.1rem;
  height: 1.1rem;
  line-height: 1;
}
</style>
