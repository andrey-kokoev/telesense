import { describe, expect, test, vi, beforeEach, afterEach } from "vite-plus/test"

// Mock localStorage using globalThis
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as unknown as { localStorage: typeof localStorageMock }).localStorage =
  localStorageMock

// Mock crypto.randomUUID
Object.defineProperty(globalThis, "crypto", {
  value: {
    randomUUID: vi.fn(() => "test-uuid-123"),
  },
})

describe("Chat message persistence", () => {
  const roomId = "TEST12"
  const storageKey = `telesense:chat:${roomId}`

  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("loads empty chat history when localStorage is empty", () => {
    localStorageMock.getItem.mockReturnValue(null)

    const chatMessages = loadChatHistory(roomId)

    expect(chatMessages).toEqual([])
    expect(localStorageMock.getItem).toHaveBeenCalledWith(storageKey)
  })

  test("loads chat history from localStorage", () => {
    const storedMessages = [
      { id: "1", text: "Hello", timestamp: 1234567890, isLocal: true },
      { id: "2", text: "Hi there", timestamp: 1234567891, isLocal: false },
    ]
    localStorageMock.getItem.mockReturnValue(JSON.stringify(storedMessages))

    const chatMessages = loadChatHistory(roomId)

    expect(chatMessages).toEqual(storedMessages)
  })

  test("limits loaded messages to last 100", () => {
    const manyMessages = Array.from({ length: 150 }, (_, i) => ({
      id: String(i),
      text: `Message ${i}`,
      timestamp: 1234567890 + i,
      isLocal: i % 2 === 0,
    }))
    localStorageMock.getItem.mockReturnValue(JSON.stringify(manyMessages))

    const chatMessages = loadChatHistory(roomId)

    expect(chatMessages).toHaveLength(100)
    expect(chatMessages[0].id).toBe("50") // First 50 dropped
    expect(chatMessages[99].id).toBe("149")
  })

  test("handles corrupted localStorage gracefully", () => {
    localStorageMock.getItem.mockReturnValue("invalid json{{{")

    const chatMessages = loadChatHistory(roomId)

    expect(chatMessages).toEqual([])
  })

  test("handles non-array data in localStorage", () => {
    localStorageMock.getItem.mockReturnValue(JSON.stringify({ notAnArray: true }))

    const chatMessages = loadChatHistory(roomId)

    expect(chatMessages).toEqual([])
  })

  test("saves chat history to localStorage", () => {
    const messages = [{ id: "1", text: "Hello", timestamp: 1234567890, isLocal: true }]

    saveChatHistory(roomId, messages)

    expect(localStorageMock.setItem).toHaveBeenCalledWith(storageKey, JSON.stringify(messages))
  })

  test("handles localStorage errors gracefully", () => {
    localStorageMock.setItem.mockImplementation(() => {
      throw new Error("Storage full")
    })

    const messages = [{ id: "1", text: "Hello", timestamp: 1234567890, isLocal: true }]

    // Should not throw
    expect(() => saveChatHistory(roomId, messages)).not.toThrow()
  })
})

describe("Chat message sending", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(1234567890000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("creates message with correct structure", () => {
    const text = "Hello world"
    const message = createChatMessage(text)

    expect(message).toEqual({
      id: "test-uuid-123",
      text: "Hello world",
      timestamp: 1234567890000,
    })
  })

  test("truncates messages longer than 500 characters", () => {
    const longText = "a".repeat(1000)
    const message = createChatMessage(longText)

    expect(message.text).toHaveLength(500)
  })
})

// Helper functions extracted from useCallSession for testing

function loadChatHistory(roomId: string): Array<{
  id: string
  text: string
  timestamp: number
  isLocal: boolean
}> {
  const storageKey = `telesense:chat:${roomId}`
  const MAX_STORED_MESSAGES = 100

  try {
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      const parsed = JSON.parse(stored) as Array<{
        id: string
        text: string
        timestamp: number
        isLocal: boolean
      }>
      if (Array.isArray(parsed)) {
        return parsed.slice(-MAX_STORED_MESSAGES)
      }
    }
  } catch {
    // Invalid storage data, start fresh
  }
  return []
}

function saveChatHistory(
  roomId: string,
  messages: Array<{ id: string; text: string; timestamp: number; isLocal: boolean }>,
): void {
  const storageKey = `telesense:chat:${roomId}`
  try {
    localStorage.setItem(storageKey, JSON.stringify(messages))
  } catch {
    // Storage might be full or unavailable
  }
}

function createChatMessage(text: string): { id: string; text: string; timestamp: number } {
  return {
    id: crypto.randomUUID(),
    text: text.slice(0, 500),
    timestamp: Date.now(),
  }
}
