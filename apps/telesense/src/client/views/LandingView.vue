<template>
  <div class="landing">
    <header class="landing__header">
      <h1 class="landing__title">
        <span class="landing__title__glyph landing__title__glyph--t">t</span
        ><span class="landing__title-rest"
          >ele<span class="landing__title__glyph landing__title__glyph--s">s</span>ense</span
        >
      </h1>
      <p class="landing__subtitle">Secure video calls</p>
    </header>

    <main class="landing__main">
      <!-- Authenticated User View -->
      <template v-if="isAuthenticated">
        <div class="landing__section">
          <h2 class="landing__section-title">Start a Room</h2>

          <button class="landing__btn landing__btn--primary" @click="createNewRoom">
            <span class="landing__btn-icon">+</span>
            <span>Create New Room</span>
          </button>
        </div>

        <div class="landing__divider">
          <span>or</span>
        </div>

        <div class="landing__section">
          <h2 class="landing__section-title">Join a Room</h2>

          <form class="landing__form" @submit.prevent="joinExistingRoom">
            <div class="landing__code-inputs" @paste="onRoomCodePaste">
              <input
                v-for="(_, index) in roomCodeDigits"
                :key="index"
                :ref="(el) => setRoomCodeInputRef(el, index)"
                :value="roomCodeDigits[index]"
                type="text"
                inputmode="text"
                autocapitalize="characters"
                autocomplete="off"
                maxlength="1"
                class="landing__code-input"
                @input="onRoomCodeInput(index, $event)"
                @keydown="onRoomCodeKeydown(index, $event)"
              />
            </div>
            <button
              type="submit"
              class="landing__btn landing__btn--secondary"
              :disabled="roomIdInput.length !== 6"
            >
              Join
            </button>
          </form>
        </div>
      </template>

      <!-- Unauthenticated User View -->
      <template v-else>
        <div class="landing__section">
          <h2 class="landing__section-title">Join a Room</h2>

          <form class="landing__form" @submit.prevent="joinExistingRoom">
            <div class="landing__code-inputs" @paste="onRoomCodePaste">
              <input
                v-for="(_, index) in roomCodeDigits"
                :key="index"
                :ref="(el) => setRoomCodeInputRef(el, index)"
                :value="roomCodeDigits[index]"
                type="text"
                inputmode="text"
                autocapitalize="characters"
                autocomplete="off"
                maxlength="1"
                class="landing__code-input"
                @input="onRoomCodeInput(index, $event)"
                @keydown="onRoomCodeKeydown(index, $event)"
              />
            </div>
            <button
              type="submit"
              class="landing__btn landing__btn--secondary"
              :disabled="roomIdInput.length !== 6"
            >
              Join
            </button>
          </form>
        </div>

        <div class="landing__divider">
          <span>or</span>
        </div>

        <div class="landing__section">
          <h2 class="landing__section-title">Create Rooms</h2>
          <p class="landing__hint">Enter your token to create new rooms</p>

          <form class="landing__form" @submit.prevent="saveToken">
            <input
              v-model="tokenInput"
              type="password"
              class="landing__input"
              placeholder="Enter your token"
              autocomplete="off"
            />
            <button
              type="submit"
              class="landing__btn landing__btn--primary"
              :disabled="!tokenInput.trim()"
            >
              Save Token
            </button>
          </form>
        </div>
      </template>

      <!-- Recent Calls -->
      <div v-if="recentCalls.length > 0" class="landing__recent">
        <h3 class="landing__recent-title">Recent</h3>
        <div class="landing__recent-scroll">
          <ul class="landing__recent-list">
            <li
              v-for="room in recentCalls"
              :key="room.id"
              class="landing__recent-item"
              tabindex="0"
              @click="editingRoomId !== room.id && goToRoom(room.id)"
              @keydown.enter.prevent="editingRoomId !== room.id && goToRoom(room.id)"
              @keydown.space.prevent="editingRoomId !== room.id && goToRoom(room.id)"
            >
              <template v-if="editingRoomId === room.id">
                <form class="landing__recent-edit" @submit.prevent="saveRoomLabel(room.id)">
                  <input
                    v-model="editingRoomLabel"
                    type="text"
                    class="landing__input landing__recent-input"
                    maxlength="20"
                    @click.stop
                    @keydown.esc.prevent="cancelRoomEdit"
                    v-focus
                  />
                  <button
                    type="submit"
                    class="landing__recent-icon"
                    @click.stop
                    aria-label="Save label"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                </form>
              </template>
              <template v-else>
                <div class="landing__recent-copy">
                  <span v-if="room.name" class="landing__recent-label">{{ room.name }}</span>
                  <span
                    class="landing__recent-id"
                    :class="{ 'landing__recent-id--muted': room.name }"
                  >
                    {{ room.id }}
                  </span>
                </div>
                <button
                  class="landing__recent-icon"
                  @click.stop="startRoomEdit(room.id, room.name)"
                  aria-label="Edit label"
                  title="Edit label"
                  tabindex="-1"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
                <button
                  class="landing__recent-icon"
                  @click.stop="deleteRoom(room.id)"
                  aria-label="Delete room"
                  title="Delete room"
                  tabindex="-1"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </template>
            </li>
          </ul>
        </div>
      </div>
    </main>

    <!-- Token Change Modal (for authenticated users) -->
    <div v-if="showTokenModal" class="landing__modal" @click.self="showTokenModal = false">
      <div class="landing__modal-content">
        <h3 class="landing__modal-title">Change Token</h3>
        <form class="landing__form" @submit.prevent="updateToken">
          <input
            v-model="tokenInput"
            type="password"
            class="landing__input"
            placeholder="Enter new token"
            autocomplete="off"
          />
          <div class="landing__modal-actions">
            <button
              type="button"
              class="landing__btn landing__btn--ghost"
              @click="showTokenModal = false"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="landing__btn landing__btn--primary"
              :disabled="!tokenInput.trim()"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="isAuthenticated" class="landing__token-status">
      <span class="landing__token-badge">✓ Token set</span>
      <button class="landing__token-action" @click="showTokenModal = true">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        <span>Change token</span>
      </button>
      <button class="landing__token-action" @click="clearToken">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
        <span>Clear token</span>
      </button>
    </div>

    <div class="landing__footer">
      <ThemeToggle />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import ThemeToggle from "../components/ThemeToggle.vue"
import { useAppStore } from "../composables/useAppStore"
import { useToast } from "../composables/useToast"

const {
  isAuthenticated,
  setToken,
  recentCalls,
  addRecentCall,
  clearToken: clearStoredToken,
  renameRecentCall,
  removeRecentCall,
} = useAppStore()
const { show } = useToast()

const roomCodeDigits = ref<string[]>(Array.from({ length: 6 }, () => ""))
const roomCodeInputs = ref<Array<HTMLInputElement | null>>([])
const tokenInput = ref("")
const showTokenModal = ref(false)
const editingRoomId = ref<string | null>(null)
const editingRoomLabel = ref("")
const roomIdInput = computed(() => roomCodeDigits.value.join(""))

function setRoomCodeInputRef(el: unknown, index: number) {
  roomCodeInputs.value[index] = el instanceof HTMLInputElement ? el : null
}

function focusRoomCodeInput(index: number) {
  const input = roomCodeInputs.value[index]
  input?.focus()
  input?.select()
}

function normalizeRoomCode(value: string) {
  return value.replace(/[^A-Z0-9]/gi, "").toUpperCase()
}

function onRoomCodeInput(index: number, event: Event) {
  const input = event.target as HTMLInputElement
  const normalized = normalizeRoomCode(input.value)
  const nextChar = normalized.slice(-1)

  roomCodeDigits.value[index] = nextChar
  input.value = nextChar

  if (nextChar && index < roomCodeDigits.value.length - 1) {
    focusRoomCodeInput(index + 1)
  }
}

function onRoomCodeKeydown(index: number, event: KeyboardEvent) {
  if (event.key === "Backspace" && !roomCodeDigits.value[index] && index > 0) {
    roomCodeDigits.value[index - 1] = ""
    focusRoomCodeInput(index - 1)
  }

  if (event.key === "ArrowLeft" && index > 0) {
    event.preventDefault()
    focusRoomCodeInput(index - 1)
  }

  if (event.key === "ArrowRight" && index < roomCodeDigits.value.length - 1) {
    event.preventDefault()
    focusRoomCodeInput(index + 1)
  }
}

function onRoomCodePaste(event: ClipboardEvent) {
  event.preventDefault()
  const pasted = normalizeRoomCode(event.clipboardData?.getData("text") || "").slice(0, 6)
  roomCodeDigits.value = roomCodeDigits.value.map((_, index) => pasted[index] || "")
  focusRoomCodeInput(Math.min(pasted.length, roomCodeDigits.value.length - 1))
}

onMounted(() => {
  focusRoomCodeInput(0)
})

function generateCallId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let result = ""
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

async function createNewRoom() {
  const roomId = generateCallId()
  if (!recentCalls.value.some((room) => room.id === roomId)) {
    addRecentCall(roomId)
  }
  show(`Created room: ${roomId}`, "success")
  goToRoom(roomId)
}

function joinExistingRoom() {
  const id = roomIdInput.value
  if (id.length !== 6) return

  if (!recentCalls.value.some((room) => room.id === id)) {
    addRecentCall(id)
  }
  goToRoom(id)
}

function goToRoom(roomId: string) {
  window.location.href = `/?room=${roomId}`
}

function startRoomEdit(roomId: string, currentLabel?: string) {
  editingRoomId.value = roomId
  editingRoomLabel.value = currentLabel || roomId
}

function cancelRoomEdit() {
  editingRoomId.value = null
  editingRoomLabel.value = ""
}

function saveRoomLabel(roomId: string) {
  const nextLabel = editingRoomLabel.value.trim()
  renameRecentCall(roomId, nextLabel === roomId ? "" : nextLabel)
  cancelRoomEdit()
}

function deleteRoom(roomId: string) {
  removeRecentCall(roomId)
  if (editingRoomId.value === roomId) {
    cancelRoomEdit()
  }
}

async function verifyToken(candidateToken: string) {
  const res = await fetch("/api/auth/verify", {
    headers: {
      "X-User-Token": candidateToken,
    },
  })

  return res.ok
}

async function saveToken() {
  const t = tokenInput.value.trim()
  if (!t) return

  const isValid = await verifyToken(t)
  if (!isValid) {
    show("Invalid token", "error")
    return
  }

  setToken(t, true)
  tokenInput.value = ""
  show("Token saved", "success")
}

async function updateToken() {
  await saveToken()
  showTokenModal.value = false
}

function clearToken() {
  clearStoredToken()
  tokenInput.value = ""
}
</script>

<style scoped>
.landing {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  background: var(--color-bg-primary);
}

.landing__header {
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  text-align: center;
  margin-bottom: var(--space-10);
}

.landing__title {
  font-size: 2.5rem;
  font-weight: 700;
  font-family: "Geist Mono", var(--font-mono);
  color: var(--color-text-primary);
  opacity: 0.8;
  margin: 0;
  letter-spacing: 0.1ch;
  margin-top: var(--space-2);
}

.landing__title-rest {
  font-weight: 500;
}

.landing__title__glyph {
  display: inline-block;
  padding: 0 0.04em;
  color: var(--color-bg-primary);
  background: var(--color-text-primary);
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0;
  border-radius: 0.08em;
}

.landing__title__glyph--s {
  padding-left: 0.02em;
  margin-right: 0.05ch;
  margin-left: 0.05ch;
}

.landing__title__glyph--t {
  padding-left: 0.035em;
  margin-right: 0.1ch;
}

.landing__subtitle {
  font-family: "Geist Mono", var(--font-mono);
  font-size: 1rem;
  color: var(--color-text-secondary);
  letter-spacing: 0.04ch;
  margin: var(--space-2) 0 0;
}

.landing__main {
  width: 100%;
  max-width: 360px;
}

.landing__footer {
  width: 100%;
  max-width: 360px;
  margin-top: auto;
  padding-top: var(--space-8);
  display: flex;
  justify-content: center;
}

.landing__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.landing__section-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}

.landing__hint {
  font-size: 0.875rem;
  color: var(--color-text-tertiary);
  margin: calc(var(--space-1) * -1) 0 var(--space-1);
}

.landing__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.landing__input {
  width: 100%;
  padding: var(--space-3) var(--space-4);
  font-size: 1rem;
  font-family: inherit;
  color: var(--color-text-primary);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  outline: none;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.landing__input:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-alpha);
}

.landing__input::placeholder {
  color: var(--color-text-tertiary);
}

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

.landing__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
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

.landing__btn--ghost {
  background: transparent;
  color: var(--color-text-secondary);
}

.landing__btn--ghost:hover:not(:disabled) {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.landing__btn-icon {
  font-size: 1.25rem;
  line-height: 1;
}

.landing__divider {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin: var(--space-6) 0;
  color: var(--color-text-tertiary);
  font-size: 0.875rem;
}

.landing__divider::before,
.landing__divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--color-border);
}

.landing__token-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  margin-top: var(--space-8);
  padding-top: var(--space-6);
  border-top: 1px solid var(--color-border);
}

.landing__token-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-success);
  background: var(--color-success-alpha);
  border-radius: var(--radius-full);
}

.landing__token-action {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  border-radius: var(--radius-full);
  transition:
    color 0.15s ease,
    background-color 0.15s ease;
}

.landing__token-action:hover {
  color: var(--color-text-primary);
}

.landing__recent {
  margin-top: var(--space-8);
  padding-top: var(--space-6);
  border-top: 1px solid var(--color-border);
}

.landing__recent-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-3);
}

.landing__recent-scroll {
  min-height: 100px;
  max-height: 60vh;
  overflow-y: auto;
}

.landing__recent-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.landing__recent-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.landing__recent-item:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-border-hover);
}

.landing__recent-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.landing__recent-label {
  font-size: 0.875rem;
  color: var(--color-text-primary);
  font-weight: 500;
  line-height: 1.2;
}

.landing__recent-id {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-primary);
  letter-spacing: 0.05em;
}

.landing__recent-id--muted {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.landing__recent-icon {
  width: 2rem;
  height: 2rem;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  border-radius: var(--radius);
  opacity: 0;
  cursor: pointer;
  transition:
    opacity 0.15s ease,
    color 0.15s ease,
    background-color 0.15s ease;
}

.landing__recent-item:hover .landing__recent-icon,
.landing__recent-item:focus-within .landing__recent-icon {
  opacity: 1;
}

.landing__recent-icon:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
}

.landing__recent-edit {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.landing__recent-input {
  padding: var(--space-2) var(--space-3);
}

.landing__modal {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: rgba(0, 0, 0, 0.5);
  z-index: 100;
}

.landing__modal-content {
  width: 100%;
  max-width: 360px;
  padding: var(--space-6);
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
}

.landing__modal-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-4);
}

.landing__modal-actions {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.landing__modal-actions .landing__btn {
  flex: 1;
}

@media (max-width: 480px) {
  .landing {
    padding: var(--space-6) var(--space-4);
  }

  .landing__header {
    margin-bottom: var(--space-8);
  }

  .landing__title {
    font-size: 2rem;
  }

  .landing__recent-icon {
    opacity: 1;
  }
}
</style>
