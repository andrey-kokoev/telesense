import { computed } from "vue"
import { useAppStore } from "./useAppStore"
import { detectLocale, messages, type Locale, type MessageKey } from "../i18n/messages"

export function useI18n() {
  const store = useAppStore()

  const locale = computed<Locale>(() => store.preferences.value.locale ?? detectLocale())

  function setLocale(next: Locale) {
    store.setPreference("locale", next)
  }

  function t(key: MessageKey, params?: Record<string, string | number>) {
    let text: string = messages[locale.value]?.[key] ?? messages.en[key]
    if (!params) return text

    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }

    return text
  }

  return { locale, setLocale, t }
}
