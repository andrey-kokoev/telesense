<template>
  <div class="language-toggle-wrap">
    <button
      class="language-toggle"
      :title="`Language: ${locale.toUpperCase()}`"
      @click="isOpen = true"
    >
      <span class="language-toggle__label">{{ locale.toUpperCase() }}</span>
    </button>

    <div v-if="isOpen" class="language-toggle__backdrop" @click="isOpen = false">
      <div class="language-toggle__modal" role="dialog" aria-label="Select language" @click.stop>
        <button
          v-for="option in localeOptions"
          :key="option.code"
          class="language-toggle__option"
          :class="{ 'language-toggle__option--active': option.code === locale }"
          @click="
            () => {
              setLocale(option.code)
              isOpen = false
            }
          "
        >
          <span class="language-toggle__option-code">{{ option.code.toUpperCase() }}</span>
          <span>{{ option.label }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue"
import { useI18n } from "../composables/useI18n"
import { localeOptions } from "../i18n/messages"

const { locale, setLocale } = useI18n()
const isOpen = ref(false)
</script>

<style scoped>
.language-toggle-wrap {
  display: contents;
}

.language-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.5rem;
  height: 2.5rem;
  padding: 0 0.55rem;
  font-family: "Geist Mono", var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
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

.language-toggle:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-border-hover);
  color: var(--color-text-primary);
}

.language-toggle__label {
  line-height: 1;
}

.language-toggle__backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgb(0 0 0 / 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.language-toggle__modal {
  width: min(22rem, 100%);
  max-height: min(75vh, 32rem);
  overflow: auto;
  display: grid;
  gap: 0.35rem;
  padding: 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: 1rem;
  background: var(--color-bg-secondary);
  box-shadow: 0 16px 40px rgb(0 0 0 / 0.18);
}

.language-toggle__option {
  display: grid;
  grid-template-columns: 2.5rem 1fr;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  border: none;
  border-radius: 0.8rem;
  padding: 0.75rem 0.8rem;
  background: transparent;
  color: var(--color-text-primary);
  font: inherit;
  text-align: left;
}

.language-toggle__option--active {
  background: var(--color-bg-tertiary);
}

.language-toggle__option-code {
  font-family: "Geist Mono", var(--font-mono);
  font-size: 0.72rem;
  color: var(--color-text-secondary);
}
</style>
