import { ref, computed } from 'vue'

const TOKEN_KEY = 'telesense-token'

const token = ref(localStorage.getItem(TOKEN_KEY) || '')

export function useAuth() {
  const isAuthenticated = computed(() => !!token.value)
  
  function setToken(newToken: string) {
    token.value = newToken.trim()
    if (token.value) {
      localStorage.setItem(TOKEN_KEY, token.value)
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }
  }
  
  function clearToken() {
    token.value = ''
    localStorage.removeItem(TOKEN_KEY)
  }
  
  function getAuthHeaders(): Record<string, string> {
    return {
      'X-User-Token': token.value
    }
  }
  
  return {
    token: computed(() => token.value),
    isAuthenticated,
    setToken,
    clearToken,
    getAuthHeaders
  }
}
