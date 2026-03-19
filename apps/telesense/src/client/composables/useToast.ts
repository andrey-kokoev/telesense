import { ref } from "vue"

export interface Toast {
  id: number
  message: string
  type: "success" | "error" | "info"
}

const toasts = ref<Toast[]>([])
let nextId = 0

export function useToast() {
  function show(message: string, type: Toast["type"] = "info") {
    const id = nextId++
    toasts.value.push({ id, message, type })

    setTimeout(() => {
      remove(id)
    }, 3000)
  }

  function remove(id: number) {
    const index = toasts.value.findIndex((t) => t.id === id)
    if (index > -1) {
      toasts.value.splice(index, 1)
    }
  }

  return {
    toasts,
    show,
    remove,
  }
}
