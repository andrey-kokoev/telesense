<template>
  <button
    type="button"
    class="vertical-toggle"
    :class="{
      'vertical-toggle--active': active,
      'vertical-toggle--inactive': !active,
      'vertical-toggle--dim': dimInactive && !active,
    }"
    :title="title"
    :aria-label="ariaLabel || title"
    :aria-pressed="active"
    @click="$emit('click', $event)"
  >
    <span class="vertical-toggle__thumb" aria-hidden="true"></span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  active: boolean
  title: string
  ariaLabel?: string
  dimInactive?: boolean
}>()

defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<style scoped>
.vertical-toggle {
  display: inline-flex;
  align-items: flex-start;
  justify-content: center;
  width: 1.15rem;
  height: 2.1rem;
  padding: 0.13rem 0.1rem 0.1rem;
  border: 1px solid color-mix(in srgb, var(--color-text-primary) 18%, var(--color-border) 82%);
  border-radius: 0.4rem;
  background: color-mix(in srgb, var(--color-text-secondary) 75%, var(--color-bg-primary) 25%);
  flex: none;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-text-primary) 18%, transparent 82%);
}

.vertical-toggle__thumb {
  display: block;
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 0.28rem;
  border: 1px solid color-mix(in srgb, var(--color-border) 78%, var(--color-text-primary) 22%);
  background: color-mix(in srgb, var(--color-bg-primary) 82%, var(--color-text-primary) 18%);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.2);
  transform: translateY(0);
}

.vertical-toggle--active {
  background: color-mix(in srgb, var(--color-success, #16a34a) 16%, var(--color-bg-primary) 84%);
  border-color: color-mix(in srgb, var(--color-success, #16a34a) 32%, var(--color-border) 68%);
}

.vertical-toggle--active .vertical-toggle__thumb {
  transform: translateY(0);
  background: var(--color-success, #16a34a);
}

.vertical-toggle--inactive .vertical-toggle__thumb {
  transform: translateY(0.92rem);
  background: color-mix(in srgb, var(--color-text-secondary) 72%, var(--color-bg-primary) 28%);
}

.vertical-toggle--dim {
  opacity: 0.7;
}
</style>
