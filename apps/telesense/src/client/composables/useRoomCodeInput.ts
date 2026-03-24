import { computed, nextTick, ref } from "vue"

export function normalizeRoomCode(value: string) {
  return value.replace(/[^A-Z0-9]/gi, "").toUpperCase()
}

function roomCodeCharacterFromKeyboardEvent(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return ""

  return normalizeRoomCode(event.key).slice(-1)
}

function isInvalidRoomCodeCharacter(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return false
  if (event.key.length !== 1) return false
  return !normalizeRoomCode(event.key)
}

export function useRoomCodeInput(
  options: {
    onSubmit?: () => void
    onInvalidCharacter?: () => void
  } = {},
) {
  const { onSubmit, onInvalidCharacter } = options
  const digits = ref<string[]>(Array.from({ length: 6 }, () => ""))
  const inputs = ref<Array<HTMLInputElement | null>>([])
  const value = computed(() => digits.value.join(""))

  function setInputRef(el: unknown, index: number) {
    inputs.value[index] = el instanceof HTMLInputElement ? el : null
  }

  function focusInput(index: number) {
    const input = inputs.value[index]
    input?.focus()
    input?.setSelectionRange(0, 0)
  }

  function isInputDisabled(index: number) {
    return index > 0 && !digits.value[index - 1]
  }

  function clearDigitsFrom(index: number) {
    for (let i = index; i < digits.value.length; i++) {
      digits.value[i] = ""
      const input = inputs.value[i]
      if (input) {
        input.value = ""
      }
    }
  }

  async function onInput(index: number, event: Event) {
    const input = event.target as HTMLInputElement
    const normalized = normalizeRoomCode(input.value)
    const nextChar = normalized.slice(-1)

    digits.value[index] = nextChar
    input.value = nextChar

    if (!nextChar) {
      clearDigitsFrom(index + 1)
      return
    }

    if (index < digits.value.length - 1) {
      await nextTick()
      focusInput(index + 1)
    }
  }

  function onKeydown(index: number, event: KeyboardEvent) {
    const replacement = roomCodeCharacterFromKeyboardEvent(event)

    if (replacement.length === 1) {
      event.preventDefault()
      digits.value[index] = replacement
      const input = event.currentTarget as HTMLInputElement | null
      if (input) {
        input.value = replacement
        input.setSelectionRange(0, 0)
      }
      if (index < digits.value.length - 1) {
        void nextTick(() => focusInput(index + 1))
      }
      return
    }

    if (isInvalidRoomCodeCharacter(event)) {
      event.preventDefault()
      onInvalidCharacter?.()
      return
    }

    if (event.key === "Enter") {
      event.preventDefault()
      onSubmit?.()
      return
    }

    if (event.key === "Backspace" && !digits.value[index] && index > 0) {
      digits.value[index - 1] = ""
      focusInput(index - 1)
    }

    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault()
      focusInput(index - 1)
    }

    if (event.key === "ArrowRight" && index < digits.value.length - 1) {
      event.preventDefault()
      focusInput(index + 1)
    }
  }

  function onPaste(event: ClipboardEvent) {
    event.preventDefault()
    const pasted = normalizeRoomCode(event.clipboardData?.getData("text") || "").slice(0, 6)
    digits.value = digits.value.map((_, index) => pasted[index] || "")
    focusInput(Math.min(pasted.length, digits.value.length - 1))
  }

  function setValue(nextValue: string) {
    const normalized = normalizeRoomCode(nextValue).slice(0, 6)
    digits.value = digits.value.map((_, index) => normalized[index] || "")
  }

  async function insertCharacter(nextValue: string) {
    const normalized = normalizeRoomCode(nextValue)
    const nextChar = normalized.slice(-1)
    if (!nextChar) return

    const index = digits.value.findIndex((digit) => digit === "")
    const targetIndex = index === -1 ? digits.value.length - 1 : index
    digits.value[targetIndex] = nextChar

    const input = inputs.value[targetIndex]
    if (input) {
      input.value = nextChar
    }

    if (targetIndex < digits.value.length - 1) {
      await nextTick()
      focusInput(targetIndex + 1)
    } else {
      await nextTick()
      focusInput(targetIndex)
    }
  }

  function clear() {
    digits.value = Array.from({ length: 6 }, () => "")
  }

  return {
    digits,
    value,
    setInputRef,
    focusInput,
    isInputDisabled,
    onInput,
    onKeydown,
    onPaste,
    setValue,
    insertCharacter,
    clear,
  }
}
