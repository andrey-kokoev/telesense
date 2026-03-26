<template>
  <div class="landing__section">
    <h2 class="landing__section-title">{{ title }}</h2>

    <form class="landing__form" @submit.prevent="emit('submit')">
      <div v-if="showInputs" class="landing__code-inputs" @paste="emit('paste', $event)">
        <div v-for="(_, index) in digits" :key="index" class="landing__code-input-wrap">
          <input
            :ref="(el) => setInputRef(el, index)"
            :value="digits[index]"
            type="text"
            inputmode="text"
            autocapitalize="none"
            autocomplete="section-room-code off"
            autocorrect="off"
            spellcheck="false"
            enterkeyhint="done"
            :name="`${name}-${index}`"
            :aria-label="`${title} ${index + 1}`"
            data-form-type="other"
            maxlength="1"
            class="landing__code-input"
            :disabled="isInputDisabled(index)"
            @input="emit('input', index, $event)"
            @keydown="handleInputKeydown(index, $event)"
            @blur="emit('blur')"
          />
          <span
            v-if="
              !inactive &&
              index === digits.findIndex((digit) => digit === '') &&
              digits[index] === ''
            "
            class="landing__code-caret landing-code-caret"
            aria-hidden="true"
            >_</span
          >
        </div>
      </div>
      <button
        ref="submitButton"
        type="submit"
        class="landing__btn"
        :class="buttonClass"
        :disabled="buttonDisabled"
      >
        <span v-if="buttonIcon" class="landing__btn-icon">{{ buttonIcon }}</span>
        <span>{{ buttonLabel }}</span>
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue"

const props = withDefaults(
  defineProps<{
    title: string
    digits: string[]
    name: string
    showInputs?: boolean
    inactive?: boolean
    buttonLabel: string
    buttonClass: string
    buttonDisabled: boolean
    buttonIcon?: string
    setInputRef: (el: unknown, index: number) => void
    isInputDisabled: (index: number) => boolean
  }>(),
  {
    showInputs: true,
    inactive: false,
  },
)

const emit = defineEmits<{
  (e: "submit"): void
  (e: "paste", event: ClipboardEvent): void
  (e: "input", index: number, event: Event): void
  (e: "keydown", index: number, event: KeyboardEvent): void
  (e: "blur"): void
}>()

const submitButton = ref<HTMLButtonElement | null>(null)

function handleInputKeydown(index: number, event: KeyboardEvent) {
  if (event.key === "Tab" && !event.shiftKey && index === props.digits.length - 1) {
    event.preventDefault()
    submitButton.value?.focus()
    return
  }

  emit("keydown", index, event)
}
</script>

<style scoped>
.landing__code-inputs {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-inset);
}

.landing__code-input-wrap {
  position: relative;
}

.landing__code-input {
  width: 100%;
  aspect-ratio: 1;
  padding: 0;
  font-size: 1.35rem;
  font-family: var(--font-mono-display);
  font-weight: 500;
  line-height: 1;
  text-align: center;
  text-transform: uppercase;
  color: var(--color-text-primary);
  opacity: 0.8;
  background: var(--color-bg-secondary);
  border: 1px solid color-mix(in srgb, var(--color-border-hover) 78%, var(--color-border));
  border-radius: var(--radius-lg);
  box-shadow:
    0 1px 0 rgb(255 255 255 / 0.16),
    0 6px 13px rgb(0 0 0 / 0.08);
  outline: none;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background-color 0.15s ease,
    transform 0.15s ease;
}

.landing__code-input:focus {
  border-width: 1.5px;
  border-color: var(--color-accent);
  box-shadow:
    0 1px 0 rgb(255 255 255 / 0.18),
    0 7px 15px rgb(0 0 0 / 0.1),
    inset 0 0 0 2px var(--color-accent-alpha),
    0 0 0 2px var(--color-accent-alpha),
    0 0 14px 4px var(--color-accent-alpha);
}

.landing__code-input:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.landing__code-caret {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-accent);
  opacity: 1;
  animation: landing-code-caret-blink 1.05s steps(1, end) infinite;
  pointer-events: none;
  font-size: 1.9rem;
  font-weight: 700;
  line-height: 1;
  transform: translateY(0.02em) scaleX(2);
}

.landing__code-input-wrap:focus-within .landing__code-caret {
  opacity: 0;
  animation: none;
}

@keyframes landing-code-caret-blink {
  0%,
  49% {
    opacity: 1;
  }

  50%,
  100% {
    opacity: 0.18;
  }
}

.landing__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  font-size: 1rem;
  font-weight: 500;
  font-family: inherit;
  border: none;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    transform 0.1s ease,
    opacity 0.15s ease;
}

.landing__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.landing__btn:active:not(:disabled) {
  transform: scale(0.98);
}

.landing__btn--primary {
  background: var(--color-accent);
  color: var(--color-accent-foreground);
}

.landing__btn--primary:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

.landing__btn--secondary {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.landing__btn--secondary:hover:not(:disabled) {
  background: var(--color-bg-hover);
}

.landing__btn-icon {
  font-size: 1.25rem;
  line-height: 1;
}

@media (max-width: 480px) {
  .landing__code-inputs {
    gap: var(--space-1);
    padding: var(--space-2);
    border-radius: var(--radius-lg);
  }

  .landing__code-input {
    font-size: 1.2rem;
  }

  .landing__code-caret {
    font-size: 1.65rem;
  }
}
</style>
