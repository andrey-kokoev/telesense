import { createApp } from "vue"
import { registerSW } from "virtual:pwa-register"
import App from "./App.vue"
import { useTheme } from "./composables/useTheme"

// Initialize theme before mounting
useTheme()

if (import.meta.env.DEV) {
  void navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => {
      for (const registration of registrations) {
        void registration.unregister()
      }
    })
    .catch(() => {
      // Ignore service worker cleanup failures in development.
    })
} else {
  registerSW({
    immediate: true,
  })
}

const app = createApp(App)

// Auto-focus directive for editing inputs
app.directive("focus", {
  mounted(el) {
    el.focus()
    el.select?.()
  },
})

// Click-outside directive
app.directive("click-outside", {
  mounted(el, binding) {
    el._clickOutside = (event: Event) => {
      if (!(el === event.target || el.contains(event.target as Node))) {
        binding.value(event)
      }
    }
    document.addEventListener("click", el._clickOutside, true)
  },
  unmounted(el) {
    document.removeEventListener("click", el._clickOutside, true)
  },
})

app.mount("#app")
