import { computed, watchEffect } from "vue";
import { useStorage } from "@vueuse/core";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "telesense:theme";

const theme = useStorage<Theme>(STORAGE_KEY, "system");

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

export const isDark = computed(() => {
  if (theme.value === "system") {
    return systemDark.matches;
  }
  return theme.value === "dark";
});

export function useTheme() {
  // Apply theme to document
  watchEffect(() => {
    const dark = isDark.value;
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  });

  // Listen for system theme changes
  watchEffect((onCleanup) => {
    if (theme.value !== "system") return;

    const handler = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle("dark", e.matches);
      document.documentElement.style.colorScheme = e.matches ? "dark" : "light";
    };

    systemDark.addEventListener("change", handler);
    onCleanup(() => systemDark.removeEventListener("change", handler));
  });

  function setTheme(newTheme: Theme) {
    theme.value = newTheme;
  }

  function cycleTheme() {
    const modes: Theme[] = ["light", "dark", "system"];
    const currentIndex = modes.indexOf(theme.value);
    const nextIndex = (currentIndex + 1) % modes.length;
    theme.value = modes[nextIndex];
  }

  return {
    theme: computed(() => theme.value),
    isDark,
    setTheme,
    cycleTheme,
  };
}
