<template>
  <button class="theme-toggle" :title="`Theme: ${theme} (click to cycle)`" @click="cycleTheme">
    <span class="theme-toggle__icon">{{ icon }}</span>
    <span class="theme-toggle__label">{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useTheme } from "../composables/useTheme";

const { theme, cycleTheme } = useTheme();

const icon = computed(() => {
  switch (theme.value) {
    case "light":
      return "☀️";
    case "dark":
      return "🌙";
    case "system":
      return "💻";
    default:
      return "☀️";
  }
});

const label = computed(() => {
  switch (theme.value) {
    case "light":
      return "Light";
    case "dark":
      return "Dark";
    case "system":
      return "System";
    default:
      return "Light";
  }
});
</script>

<style scoped>
.theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  font-size: 0.875rem;
  font-family: inherit;
  color: var(--color-text-secondary);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  cursor: pointer;
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
  font-size: 1rem;
  line-height: 1;
}

.theme-toggle__label {
  font-weight: 500;
}

@media (max-width: 480px) {
  .theme-toggle__label {
    display: none;
  }
}
</style>
