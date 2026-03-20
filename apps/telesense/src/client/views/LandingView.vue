<template>
  <div class="landing">
    <header class="landing__header">
      <h1 class="landing__title">
        <span class="landing__title__glyph landing__title__glyph--t">t</span
        ><span class="landing__title-rest"
          >ele<span class="landing__title__glyph landing__title__glyph--s">s</span>ense</span
        >
      </h1>
      <p class="landing__subtitle">{{ t("landing_secure_video_calls") }}</p>
    </header>

    <main class="landing__main">
      <!-- Authenticated User View -->
      <template v-if="isAuthenticated">
        <div class="landing__section">
          <h2 class="landing__section-title">{{ t("landing_start_room") }}</h2>

          <form class="landing__form" @submit.prevent="submitCreateRoom">
            <div
              v-if="isCreateRoomDraftActive"
              class="landing__code-inputs"
              @paste="onCreateRoomCodePaste"
            >
              <input
                v-for="(_, index) in createRoomCodeDigits"
                :key="index"
                :ref="(el) => setCreateRoomCodeInputRef(el, index)"
                :value="createRoomCodeDigits[index]"
                type="text"
                inputmode="text"
                autocapitalize="characters"
                autocomplete="off"
                autocorrect="off"
                spellcheck="false"
                name="create-room-code"
                data-form-type="other"
                maxlength="1"
                class="landing__code-input"
                :disabled="isCreateRoomCodeInputDisabled(index)"
                @input="onCreateRoomCodeInput(index, $event)"
                @keydown="onCreateRoomCodeKeydown(index, $event)"
              />
            </div>
            <button
              type="submit"
              class="landing__btn landing__btn--primary"
              :disabled="isCreateRoomDraftActive && createRoomIdInput.length !== 6"
            >
              <span class="landing__btn-icon">{{ isCreateRoomDraftActive ? "✓" : "+" }}</span>
              <span>{{
                isCreateRoomDraftActive
                  ? t("landing_create_room_with_id", { roomId: createRoomIdInput })
                  : t("landing_create_new_room")
              }}</span>
            </button>
          </form>
        </div>

        <div class="landing__divider">
          <span>{{ t("landing_or") }}</span>
        </div>

        <div class="landing__section">
          <h2 class="landing__section-title">{{ t("landing_join_room") }}</h2>

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
                autocorrect="off"
                spellcheck="false"
                name="room-code"
                data-form-type="other"
                maxlength="1"
                class="landing__code-input"
                :disabled="isRoomCodeInputDisabled(index)"
                @input="onRoomCodeInput(index, $event)"
                @keydown="onRoomCodeKeydown(index, $event)"
              />
            </div>
            <button
              type="submit"
              class="landing__btn landing__btn--secondary"
              :disabled="roomIdInput.length !== 6"
            >
              {{ t("landing_join") }}
            </button>
          </form>
        </div>
      </template>

      <!-- Unauthenticated User View -->
      <template v-else>
        <div class="landing__section">
          <h2 class="landing__section-title">{{ t("landing_join_room") }}</h2>

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
                autocorrect="off"
                spellcheck="false"
                name="room-code"
                data-form-type="other"
                maxlength="1"
                class="landing__code-input"
                :disabled="isRoomCodeInputDisabled(index)"
                @input="onRoomCodeInput(index, $event)"
                @keydown="onRoomCodeKeydown(index, $event)"
              />
            </div>
            <button
              type="submit"
              class="landing__btn landing__btn--secondary"
              :disabled="roomIdInput.length !== 6"
            >
              {{ t("landing_join") }}
            </button>
          </form>
        </div>

        <div class="landing__divider">
          <span>{{ t("landing_or") }}</span>
        </div>

        <div class="landing__section">
          <h2 class="landing__section-title">{{ t("landing_create_rooms") }}</h2>
          <p class="landing__hint">{{ t("landing_enter_token_hint") }}</p>

          <form class="landing__form" @submit.prevent="saveToken">
            <input
              v-model="tokenInput"
              type="password"
              class="landing__input"
              :placeholder="t('landing_enter_token_placeholder')"
              autocomplete="off"
            />
            <button
              type="submit"
              class="landing__btn landing__btn--primary"
              :disabled="!tokenInput.trim()"
            >
              {{ t("landing_save_token") }}
            </button>
          </form>
        </div>
      </template>

      <!-- Recent Calls -->
      <div v-if="recentCalls.length > 0" class="landing__recent">
        <button type="button" class="landing__recent-debug" @click="addTwelveRecentRooms">
          +12
        </button>
        <h3 class="landing__recent-title">
          {{
            recentCalls.length > 8
              ? `${t("landing_recent")} (${recentCalls.length})`
              : t("landing_recent")
          }}
        </h3>
        <div ref="recentScrollEl" class="landing__recent-scroll">
          <ul class="landing__recent-list">
            <RecentRoomItem
              v-for="room in recentCalls"
              :key="room.id"
              :room="room"
              :availability="roomAvailability[room.id] ?? 'unchecked'"
              :register-visibility-ref="setRecentItemRef"
              @open="handleRecentItemClick(room.id)"
              @rename="renameRoom(room.id, $event)"
              @delete="deleteRoom(room.id)"
            />
          </ul>
        </div>
      </div>
    </main>

    <!-- Token Change Modal (for authenticated users) -->
    <div v-if="showTokenModal" class="landing__modal" @click.self="showTokenModal = false">
      <div class="landing__modal-content">
        <h3 class="landing__modal-title">{{ t("landing_change_token") }}</h3>
        <form class="landing__form" @submit.prevent="updateToken">
          <input
            v-model="tokenInput"
            type="password"
            class="landing__input"
            :placeholder="t('landing_enter_new_token_placeholder')"
            autocomplete="off"
          />
          <div class="landing__modal-actions">
            <button
              type="button"
              class="landing__btn landing__btn--ghost"
              @click="showTokenModal = false"
            >
              {{ t("landing_cancel") }}
            </button>
            <button
              type="submit"
              class="landing__btn landing__btn--primary"
              :disabled="!tokenInput.trim()"
            >
              {{ t("landing_save") }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="isAuthenticated" class="landing__token-status">
      <span class="landing__token-badge">✓ {{ t("landing_token_set") }}</span>
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
        <span>{{ t("landing_change_token_action") }}</span>
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
        <span>{{ t("landing_clear_token") }}</span>
      </button>
    </div>

    <div class="landing__footer">
      <div class="landing__footer-actions">
        <LanguageToggle />
        <ThemeToggle />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue"
import LanguageToggle from "../components/LanguageToggle.vue"
import RecentRoomItem from "../components/RecentRoomItem.vue"
import ThemeToggle from "../components/ThemeToggle.vue"
import { useAppStore } from "../composables/useAppStore"
import { useI18n } from "../composables/useI18n"
import { useRecentRoomAvailability } from "../composables/useRecentRoomAvailability"
import { useRoomCodeInput } from "../composables/useRoomCodeInput"
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
const { t } = useI18n()

const tokenInput = ref("")
const showTokenModal = ref(false)
const {
  digits: roomCodeDigits,
  value: roomIdInput,
  setInputRef: setRoomCodeInputRef,
  focusInput: focusRoomCodeInput,
  isInputDisabled: isRoomCodeInputDisabled,
  onInput: onRoomCodeInput,
  onKeydown: onRoomCodeKeydown,
  onPaste: onRoomCodePaste,
} = useRoomCodeInput(joinExistingRoom)
const {
  digits: createRoomCodeDigits,
  value: createRoomIdInput,
  setInputRef: setCreateRoomCodeInputRef,
  focusInput: focusCreateRoomCodeInput,
  isInputDisabled: isCreateRoomCodeInputDisabled,
  onInput: onCreateRoomCodeInput,
  onKeydown: onCreateRoomCodeKeydown,
  onPaste: onCreateRoomCodePaste,
  setValue: setCreateRoomCodeValue,
  clear: clearCreateRoomCode,
} = useRoomCodeInput(submitCreateRoom)
const { roomAvailability, recentScrollEl, setRecentItemRef } =
  useRecentRoomAvailability(recentCalls)
const isCreateRoomDraftActive = computed(() => createRoomIdInput.value.length > 0)

onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  const error = params.get("error")
  if (error) {
    show(error, "error")
    params.delete("error")
    const nextSearch = params.toString()
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`
    window.history.replaceState({}, "", nextUrl)
  }
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

function addTwelveRecentRooms() {
  for (let i = 0; i < 12; i++) {
    addRecentCall(generateCallId())
  }
}

async function createNewRoom() {
  const roomId = createRoomIdInput.value || generateCallId()
  if (!recentCalls.value.some((room) => room.id === roomId)) {
    addRecentCall(roomId)
  }
  show(t("landing_created_room", { roomId }), "success")
  clearCreateRoomCode()
  goToRoom(roomId)
}

async function submitCreateRoom() {
  if (!isCreateRoomDraftActive.value) {
    const roomId = generateCallId()
    setCreateRoomCodeValue(roomId)
    await nextTick()
    focusCreateRoomCodeInput(0)
    return
  }

  if (createRoomIdInput.value.length !== 6) return
  await createNewRoom()
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

function handleRecentItemClick(roomId: string) {
  void openRecentRoom(roomId)
}

async function openRecentRoom(roomId: string) {
  if (isAuthenticated.value) {
    goToRoom(roomId)
    return
  }

  try {
    const res = await fetch(`/api/rooms/${roomId}/status`)
    if (!res.ok) {
      show("Could not check room availability", "error")
      return
    }

    const data = (await res.json()) as { exists?: boolean }
    if (!data.exists) {
      roomAvailability.value[roomId] = "unavailable"
      show("Room is no longer available", "error")
      return
    }

    roomAvailability.value[roomId] = "available"
    goToRoom(roomId)
  } catch {
    show("Could not check room availability", "error")
  }
}

function renameRoom(roomId: string, nextLabel: string) {
  renameRecentCall(roomId, nextLabel)
}

function deleteRoom(roomId: string) {
  removeRecentCall(roomId)
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
  const token = tokenInput.value.trim()
  if (!token) return

  const isValid = await verifyToken(token)
  if (!isValid) {
    show(t("landing_invalid_token"), "error")
    return
  }

  setToken(token, true)
  tokenInput.value = ""
  show(t("landing_token_saved"), "success")
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
  padding-bottom: var(--space-6);
  display: flex;
  justify-content: center;
}

.landing__footer-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.landing__footer-actions :deep(.theme-toggle) {
  margin-bottom: 0;
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

.landing__code-input:disabled {
  opacity: 0.35;
  cursor: not-allowed;
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

.landing__recent-debug {
  margin-bottom: var(--space-3);
  padding: var(--space-1) var(--space-2);
  font: inherit;
  color: var(--color-text-secondary);
  background: var(--color-bg-secondary);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-full);
}

.landing__recent-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-3);
}

.landing__recent-scroll {
  position: relative;
  min-height: 100px;
  max-height: 60vh;
  overflow-y: auto;
  padding-inline: var(--space-4);
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--color-text-tertiary) 45%, var(--color-bg-tertiary))
    transparent;
}

.landing__recent-scroll::before,
.landing__recent-scroll::after {
  content: "";
  position: sticky;
  left: 0;
  right: 0;
  display: block;
  height: 24px;
  pointer-events: none;
  z-index: 1;
}

.landing__recent-scroll::before {
  top: 0;
  margin-bottom: -24px;
  background: linear-gradient(to bottom, var(--color-bg-secondary), transparent);
}

.landing__recent-scroll::after {
  bottom: 0;
  margin-top: -24px;
  background: linear-gradient(to top, var(--color-bg-secondary), transparent);
}

.landing__recent-scroll::-webkit-scrollbar {
  width: 10px;
}

.landing__recent-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.landing__recent-scroll::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--color-text-tertiary) 45%, var(--color-bg-tertiary));
  border: 2px solid transparent;
  border-radius: 999px;
  background-clip: padding-box;
}

.landing__recent-scroll::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--color-text-secondary) 55%, var(--color-bg-tertiary));
  border: 2px solid transparent;
  background-clip: padding-box;
}

.landing__recent-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
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
}
</style>
