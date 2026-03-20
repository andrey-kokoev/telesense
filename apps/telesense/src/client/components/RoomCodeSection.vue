<template>
  <div class="landing__section">
    <h2 class="landing__section-title">{{ title }}</h2>

    <form class="landing__form" @submit.prevent="emit('submit')">
      <div v-if="showInputs" class="landing__code-inputs" @paste="emit('paste', $event)">
        <input
          v-for="(_, index) in digits"
          :key="index"
          :ref="(el) => setInputRef(el, index)"
          :value="digits[index]"
          type="text"
          inputmode="text"
          autocapitalize="characters"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
          :name="name"
          data-form-type="other"
          maxlength="1"
          class="landing__code-input"
          :disabled="isInputDisabled(index)"
          @input="emit('input', index, $event)"
          @keydown="emit('keydown', index, $event)"
        />
      </div>
      <button type="submit" class="landing__btn" :class="buttonClass" :disabled="buttonDisabled">
        <span v-if="buttonIcon" class="landing__btn-icon">{{ buttonIcon }}</span>
        <span>{{ buttonLabel }}</span>
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  digits: string[]
  name: string
  showInputs?: boolean
  buttonLabel: string
  buttonClass: string
  buttonDisabled: boolean
  buttonIcon?: string
  setInputRef: (el: unknown, index: number) => void
  isInputDisabled: (index: number) => boolean
}>()

const emit = defineEmits<{
  (e: "submit"): void
  (e: "paste", event: ClipboardEvent): void
  (e: "input", index: number, event: Event): void
  (e: "keydown", index: number, event: KeyboardEvent): void
}>()
</script>

<style scoped>
.landing__code-inputs {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--space-2);
}

.landing__code-input {
  width: 100%;
  aspect-ratio: 1;
  padding: 0;
  font-size: 1.35rem;
  font-family: "Geist Mono", var(--font-mono);
  font-weight: 500;
  line-height: 1;
  text-align: center;
  text-transform: uppercase;
  color: var(--color-text-primary);
  opacity: 0.8;
  background: var(--color-bg-secondary);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-lg);
  outline: none;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background-color 0.15s ease;
}

.landing__code-input:focus {
  border-width: 2px;
  border-color: var(--color-accent);
  box-shadow:
    inset 0 0 0 2px var(--color-accent-alpha),
    0 0 0 2px var(--color-accent-alpha),
    0 0 14px 4px var(--color-accent-alpha);
}

.landing__code-input:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
