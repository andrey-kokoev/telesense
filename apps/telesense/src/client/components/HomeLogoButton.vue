<template>
  <button
    type="button"
    class="home-logo-button"
    :aria-label="ariaLabel"
    @click="$emit('click', $event)"
  >
    <img class="home-logo-button__icon" src="/favicon.svg" alt="" aria-hidden="true" />
  </button>
</template>

<script setup lang="ts">
defineProps<{
  ariaLabel: string
}>()

defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<style scoped>
.home-logo-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  flex: none;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 0.9rem;
  background: color-mix(in srgb, var(--color-bg-primary) 90%, var(--color-text-primary) 10%);
  color: var(--color-text-primary);
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    color 140ms ease;
  margin-top: 0.05rem;
}

.home-logo-button:hover {
  border-color: color-mix(in srgb, var(--color-accent) 40%, var(--color-border) 60%);
  background: color-mix(in srgb, var(--color-bg-primary) 84%, var(--color-text-primary) 16%);
}

.home-logo-button__icon {
  width: 1.5rem;
  height: 1.5rem;
  display: block;
}
</style>
