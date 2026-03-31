<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import CallDesktopLayout from "../components/CallDesktopLayout.vue"
import CallMobileLayout from "../components/CallMobileLayout.vue"
import { useAppStore } from "../composables/useAppStore"
import { useCallMedia } from "../composables/useCallMedia"
import { useCallSession } from "../composables/useCallSession"
import { useI18n } from "../composables/useI18n"
import { usePinchZoom } from "../composables/usePinchZoom"
import { useSwipeBack } from "../composables/useSwipeBack"
import { useToast } from "../composables/useToast"
import { useMetering } from "../composables/useMetering"

interface LogEntry {
  timestamp: string
  kind: string
  message: string
  details?: Record<string, unknown>
}

type CallDisplayState =
  | "starting"
  | "waiting_for_remote"
  | "connected"
  | "remote_media_interrupted"
  | "remote_left"

type TakeoverPromptState = "closed" | "prompting" | "resolving"
type LogsPanelState = "closed" | "open"

const props = defineProps<{ roomId: string }>()
const { show: showToast } = useToast()
const store = useAppStore()
const { t } = useI18n()
const metering = useMetering(props.roomId)

const swipeBack = useSwipeBack(() => {
  leave()
})
const remoteZoom = usePinchZoom()

const isMobile = ref(false)
const logsPanelState = ref<LogsPanelState>("closed")
const logs = ref<LogEntry[]>([])
const takeoverPromptState = ref<TakeoverPromptState>("closed")
const takeoverPromptMessage = ref("")
const takeoverPromptResolver = ref<((value: boolean) => void) | null>(null)
const mediaQueryListener = ref<((event: MediaQueryListEvent) => void) | null>(null)
let viewportQuery: MediaQueryList | null = null

const isAuthenticated = store.isAuthenticated
const useMobileLayout = computed(() => isMobile.value)
const showLogs = computed(() => logsPanelState.value === "open")
const desktopCallLayout = computed(() => store.preferences.value.desktopCallLayout)
const mobileCallLayout = computed(() => store.preferences.value.mobileCallLayout)

function setDesktopCallLayout(layout: "side-by-side" | "focus-remote") {
  store.setPreference("desktopCallLayout", layout)
}

function setMobileCallLayout(layout: "picture-in-picture" | "remote-only") {
  store.setPreference("mobileCallLayout", layout)
}

function setLogsPanelOpen(nextOpen: boolean) {
  logsPanelState.value = nextOpen ? "open" : "closed"
}

const MAX_LOG_ENTRIES = 200

function log(message: string, kind = "note", details?: Record<string, unknown>) {
  console.log(message, details ?? "")
  logs.value.push({
    timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    kind,
    message,
    details,
  })
  if (logs.value.length > MAX_LOG_ENTRIES) {
    logs.value.splice(0, logs.value.length - MAX_LOG_ENTRIES)
  }
}

function leaveToLanding() {
  window.location.search = ""
}

function leaveWithErrorToLanding(message: string) {
  const params = new URLSearchParams()
  params.set("error", message)
  window.location.search = params.toString()
}

function confirmTakeover(message: string) {
  return new Promise<boolean>((resolve) => {
    takeoverPromptMessage.value = message
    takeoverPromptResolver.value = resolve
    takeoverPromptState.value = "prompting"
  })
}

function resolveTakeoverPrompt(value: boolean) {
  if (takeoverPromptState.value !== "prompting") return

  takeoverPromptState.value = "resolving"
  takeoverPromptResolver.value?.(value)
  takeoverPromptResolver.value = null
  takeoverPromptMessage.value = ""
  takeoverPromptState.value = "closed"
}

let syncMediaStateImpl: () => Promise<void> | void = () => {}

const {
  localVid,
  remoteVid,
  remoteStream,
  localStream,
  publishedVideoSender,
  cameraTrack,
  isAudioMuted,
  isVideoOff,
  isScreenSharing,
  setLocalVideoEl,
  setRemoteVideoEl,
  toggleAudio,
  toggleVideo,
  toggleScreenShare,
  clearRemoteVideo,
  stopLocalMedia,
  onVideoTap,
} = useCallMedia({
  log,
  showToast,
  syncMediaState: () => syncMediaStateImpl(),
})
const {
  sessionLifecycle,
  isRemoteAudioMuted,
  isRemoteVideoOff,
  hadRemoteParticipant,
  isRemoteDisconnected,
  isRemoteMediaInterrupted,
  chatMessages,
  isChatOpen,
  sendChatMessage,
  deleteMessage,
  toggleChat,
  syncMediaState,
  endRoom,
  leave,
} = useCallSession({
  roomId: props.roomId,
  store,
  log,
  showToast,
  media: {
    localVid,
    remoteVid,
    remoteStream,
    localStream,
    publishedVideoSender,
    cameraTrack,
    isAudioMuted,
    isVideoOff,
    clearRemoteVideo,
    stopLocalMedia,
  },
  onLeave: leaveToLanding,
  onLeaveWithError: leaveWithErrorToLanding,
  onConfirmTakeover: confirmTakeover,
})
syncMediaStateImpl = syncMediaState

// Chat input
const chatInput = ref("")

function handleSendMessage() {
  const text = chatInput.value.trim()
  if (!text) return

  const sent = sendChatMessage(text)
  if (sent) {
    chatInput.value = ""
  } else {
    showToast("Could not send message - chat not connected", "error")
  }
}

function handleDeleteMessage(messageId: string) {
  const result = deleteMessage(messageId)
  if (result === "not-found") {
    showToast("Message not found", "error")
  } else if (result === "local-only") {
    showToast("Deleted locally only - remote may still see it", "info")
  }
  // "deleted" case is silent success
}

const remoteDisplayState = computed<CallDisplayState>(() => {
  if (sessionLifecycle.value !== "ready") return "starting"
  if (!hadRemoteParticipant.value) return "waiting_for_remote"
  if (isRemoteDisconnected.value) return "remote_left"
  if (isRemoteMediaInterrupted.value) return "remote_media_interrupted"
  return "connected"
})

onMounted(() => {
  viewportQuery = window.matchMedia("(max-width: 768px)")
  isMobile.value = viewportQuery.matches
  mediaQueryListener.value = (event: MediaQueryListEvent) => {
    isMobile.value = event.matches
  }
  viewportQuery.addEventListener("change", mediaQueryListener.value)

  // Start metering polling
  metering.startPolling()
})

// Watch for grace period entry and show toast
watch(
  () => metering.lifecycle.value,
  (lifecycle) => {
    if (lifecycle === "in_grace") {
      showToast(
        t("call_service_budget_grace_toast", {
          minutes: metering.graceRemainingMinutes.value,
        }),
        "error",
      )
    }
  },
)

watch(
  useMobileLayout,
  (enabled) => {
    document.documentElement.style.overflow = enabled ? "hidden" : ""
    document.body.style.overflow = enabled ? "hidden" : ""
    document.body.style.touchAction = enabled ? "none" : ""
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (viewportQuery && mediaQueryListener.value) {
    viewportQuery.removeEventListener("change", mediaQueryListener.value)
  }
  viewportQuery = null
  mediaQueryListener.value = null

  document.documentElement.style.overflow = ""
  document.body.style.overflow = ""
  document.body.style.touchAction = ""
})
</script>

<template>
  <!-- Grace period banner -->
  <div v-if="metering.isInGrace.value" class="grace-banner" role="alert">
    <span class="grace-banner__icon">⚠️</span>
    <span class="grace-banner__text">
      {{
        t("call_service_budget_grace_banner", {
          minutes: metering.graceRemainingMinutes.value,
        })
      }}
    </span>
  </div>

  <CallMobileLayout
    v-if="useMobileLayout"
    :room-id="roomId"
    :swipe-page-style="swipeBack.pageStyle.value"
    :swipe-backdrop-style="swipeBack.backdropStyle.value"
    :show-logs="showLogs"
    :logs="logs"
    :can-end-room="isAuthenticated"
    :is-audio-muted="isAudioMuted"
    :is-video-off="isVideoOff"
    :is-remote-audio-muted="isRemoteAudioMuted"
    :is-remote-video-off="isRemoteVideoOff"
    :has-local-stream="!!localStream"
    :remote-display-state="remoteDisplayState"
    :mobile-layout="mobileCallLayout"
    :remote-zoom-style="remoteZoom.transformStyle.value"
    :is-chat-open="isChatOpen"
    :chat-messages="chatMessages"
    :set-local-video-el="setLocalVideoEl"
    :set-remote-video-el="setRemoteVideoEl"
    @update:show-logs="setLogsPanelOpen($event)"
    @set-mobile-layout="setMobileCallLayout"
    @toggle-audio="toggleAudio"
    @toggle-video="toggleVideo"
    @toggle-chat="toggleChat"
    @send-chat-message="handleSendMessage"
    @leave="leave"
    @end-room="endRoom"
    @local-video-tap="onVideoTap('local')"
    @remote-video-tap="onVideoTap('remote')"
    @remote-touch-start="remoteZoom.onTouchStart"
    @remote-touch-move="remoteZoom.onTouchMove"
    @remote-touch-end="remoteZoom.onTouchEnd"
    @remote-double-tap="remoteZoom.onDoubleTap"
  />
  <CallDesktopLayout
    v-else
    :room-id="roomId"
    :swipe-page-style="swipeBack.pageStyle.value"
    :swipe-backdrop-style="swipeBack.backdropStyle.value"
    :show-logs="showLogs"
    :logs="logs"
    :can-end-room="isAuthenticated"
    :is-audio-muted="isAudioMuted"
    :is-video-off="isVideoOff"
    :is-screen-sharing="isScreenSharing"
    :is-remote-audio-muted="isRemoteAudioMuted"
    :is-remote-video-off="isRemoteVideoOff"
    :has-local-stream="!!localStream"
    :remote-display-state="remoteDisplayState"
    :desktop-layout="desktopCallLayout"
    :remote-zoom-style="remoteZoom.transformStyle.value"
    :is-chat-open="isChatOpen"
    :chat-messages="chatMessages"
    :set-local-video-el="setLocalVideoEl"
    :set-remote-video-el="setRemoteVideoEl"
    @update:show-logs="setLogsPanelOpen($event)"
    @set-desktop-layout="setDesktopCallLayout"
    @toggle-audio="toggleAudio"
    @toggle-video="toggleVideo"
    @toggle-screen-share="toggleScreenShare"
    @toggle-chat="toggleChat"
    @send-chat-message="handleSendMessage"
    @leave="leave"
    @end-room="endRoom"
    @local-video-tap="onVideoTap('local')"
    @remote-video-tap="onVideoTap('remote')"
    @remote-touch-start="remoteZoom.onTouchStart"
    @remote-touch-move="remoteZoom.onTouchMove"
    @remote-touch-end="remoteZoom.onTouchEnd"
    @remote-double-tap="remoteZoom.onDoubleTap"
  />
  <div
    v-if="takeoverPromptState !== 'closed'"
    class="call-view__modal-backdrop"
    @click.self="takeoverPromptState === 'prompting' && resolveTakeoverPrompt(false)"
  >
    <div class="call-view__modal p-4">
      <h3 class="call-view__modal-title">{{ t("call_takeover_title") }}</h3>
      <p class="call-view__modal-copy">{{ takeoverPromptMessage }}</p>
      <div class="call-view__modal-actions">
        <button
          class="call-view__modal-button call-view__modal-button--secondary"
          :disabled="takeoverPromptState !== 'prompting'"
          @click="resolveTakeoverPrompt(false)"
        >
          {{ t("landing_cancel") }}
        </button>
        <button
          class="call-view__modal-button call-view__modal-button--primary"
          :disabled="takeoverPromptState !== 'prompting'"
          @click="resolveTakeoverPrompt(true)"
        >
          {{ t("call_take_over") }}
        </button>
      </div>
    </div>
  </div>

  <!-- Chat panel -->
  <div v-if="isChatOpen" class="call-view__chat-backdrop" @click.self="toggleChat">
    <div class="call-view__chat-panel">
      <div class="call-view__chat-header">
        <strong>{{ t("call_chat_title") }}</strong>
        <button class="call-view__chat-close" @click="toggleChat">✕</button>
      </div>
      <div class="call-view__chat-messages">
        <div
          v-for="msg in chatMessages"
          :key="msg.id"
          class="call-view__chat-message"
          :class="{ 'call-view__chat-message--local': msg.isLocal }"
        >
          <span class="call-view__chat-text">{{ msg.text }}</span>
          <div class="call-view__chat-meta">
            <span class="call-view__chat-time">
              {{
                new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              }}
            </span>
            <button
              v-if="msg.isLocal"
              class="call-view__chat-delete"
              @click="handleDeleteMessage(msg.id)"
              title="Delete"
            >
              🗑
            </button>
          </div>
        </div>
        <div v-if="chatMessages.length === 0" class="call-view__chat-empty">
          {{ t("call_chat_empty") }}
        </div>
      </div>
      <form class="call-view__chat-input-area" @submit.prevent="handleSendMessage">
        <input
          v-model="chatInput"
          type="text"
          class="call-view__chat-input"
          :placeholder="t('call_chat_placeholder')"
          maxlength="500"
        />
        <button type="submit" class="call-view__chat-send" :disabled="!chatInput.trim()">
          {{ t("call_chat_send") }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.call-view__chat-backdrop {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  justify-content: flex-end;
  background: color-mix(in srgb, var(--color-bg-primary) 60%, transparent);
}

.call-view__chat-panel {
  width: min(100%, 24rem);
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
  border-left: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg);
}

@media (max-width: 640px) {
  .call-view__chat-panel {
    width: 100%;
    border-left: none;
  }
}

.call-view__chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.call-view__chat-close {
  border: none;
  background: none;
  font-size: 1.25rem;
  cursor: pointer;
  color: var(--color-text-secondary);
}

.call-view__chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.call-view__chat-message {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
  border-radius: var(--radius-lg);
  background: var(--color-bg-secondary);
  max-width: 85%;
  align-self: flex-start;
}

.call-view__chat-message--local {
  background: var(--color-accent);
  color: var(--color-accent-foreground);
  align-self: flex-end;
}

.call-view__chat-text {
  line-height: 1.4;
  word-break: break-word;
}

.call-view__chat-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  align-self: flex-end;
}

.call-view__chat-time {
  font-size: 0.75rem;
  opacity: 0.7;
}

.call-view__chat-delete {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.875rem;
  padding: 0;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.call-view__chat-delete:hover {
  opacity: 1;
}

.call-view__chat-empty {
  text-align: center;
  color: var(--color-text-secondary);
  padding: var(--space-8);
}

.call-view__chat-input-area {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-4);
  border-top: 1px solid var(--color-border);
}

.call-view__chat-input {
  flex: 1;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font: inherit;
}

.call-view__chat-send {
  padding: var(--space-3) var(--space-4);
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-accent);
  color: var(--color-accent-foreground);
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}

.call-view__chat-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.call-view__modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  background: color-mix(in srgb, var(--color-bg-primary) 48%, transparent);
  backdrop-filter: blur(10px);
}

.call-view__modal {
  width: min(100%, 28rem);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-elevated);
  box-shadow: var(--shadow-lg);
  padding: var(--space-5);
}

.call-view__modal-title {
  margin: 0 0 var(--space-2);
  font-size: 1rem;
  font-weight: 700;
}

.call-view__modal-copy {
  margin: 0;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.call-view__modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.call-view__modal-button {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0.7rem 1rem;
  font: inherit;
  cursor: pointer;
}

.call-view__modal-button--secondary {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.call-view__modal-button--primary {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-accent-foreground);
}

.grace-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: var(--color-accent);
  color: white;
  font-weight: 500;
  text-align: center;
}

.grace-banner__icon {
  font-size: 1.25rem;
}

.grace-banner__text {
  font-size: 0.875rem;
}
</style>
