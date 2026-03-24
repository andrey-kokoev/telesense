import { adminMessages } from "./messages.admin"
import { landingCallMessages } from "./messages.landing-call"

export const locales = [
  "en",
  "ru",
  "zh",
  "hi",
  "ko",
  "ja",
  "es",
  "pt",
  "ar",
  "id",
  "fr",
  "bn",
  "tr",
  "vi",
  "th",
  "ur",
  "fil",
  "fa",
] as const

export type Locale = (typeof locales)[number]

export const localeOptions: ReadonlyArray<{ code: Locale; label: string }> = [
  { code: "en", label: "English" },
  { code: "ru", label: "Русский" },
  { code: "zh", label: "中文" },
  { code: "hi", label: "हिन्दी" },
  { code: "ko", label: "한국어" },
  { code: "ja", label: "日本語" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "ar", label: "العربية" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "fr", label: "Français" },
  { code: "bn", label: "বাংলা" },
  { code: "tr", label: "Türkçe" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "th", label: "ไทย" },
  { code: "ur", label: "اردو" },
  { code: "fil", label: "Filipino" },
  { code: "fa", label: "فارسی" },
] as const

export function isSupportedLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value)
}

export function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "en"
  const primary = navigator.language.split("-")[0]?.toLowerCase() ?? "en"
  return isSupportedLocale(primary) ? primary : "en"
}

type LandingCallMessages = typeof landingCallMessages
type AdminMessages = typeof adminMessages
type EnglishMessages = LandingCallMessages["en"] & AdminMessages["en"]
type LocaleMessages = {
  en: EnglishMessages
} & {
  [L in Exclude<Locale, "en">]: LandingCallMessages[L] & Partial<AdminMessages["en"]>
}

export const messages = Object.fromEntries(
  locales.map((locale) => [
    locale,
    {
      ...landingCallMessages[locale],
      ...adminMessages[locale as keyof AdminMessages],
    },
  ]),
) as LocaleMessages

export type MessageKey = keyof EnglishMessages
