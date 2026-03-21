import { describe, expect, test, vi, beforeEach } from "vite-plus/test"
import { nextTick } from "vue"
import { normalizeRoomCode, useRoomCodeInput } from "./useRoomCodeInput"

class MockInputElement {
  value = ""
  focused = false
  selectionRange: [number, number] | null = null

  focus() {
    this.focused = true
  }

  setSelectionRange(start: number, end: number) {
    this.selectionRange = [start, end]
  }
}

describe("useRoomCodeInput", () => {
  beforeEach(() => {
    vi.stubGlobal("HTMLInputElement", MockInputElement as unknown as typeof HTMLInputElement)
  })

  test("normalizes room codes to uppercase alphanumeric characters", () => {
    expect(normalizeRoomCode("a-b 3!z")).toBe("AB3Z")
  })

  test("replaces a filled digit on keydown and advances focus", async () => {
    const onSubmit = vi.fn()
    const roomCode = useRoomCodeInput(onSubmit)
    const firstInput = new MockInputElement()
    const secondInput = new MockInputElement()

    roomCode.setInputRef(firstInput, 0)
    roomCode.setInputRef(secondInput, 1)
    roomCode.setValue("AB")

    const preventDefault = vi.fn()
    roomCode.onKeydown(0, {
      key: "z",
      preventDefault,
      currentTarget: firstInput,
    } as unknown as KeyboardEvent)

    await nextTick()

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(roomCode.digits.value[0]).toBe("Z")
    expect(firstInput.value).toBe("Z")
    expect(secondInput.focused).toBe(true)
    expect(secondInput.selectionRange).toEqual([0, 0])
  })

  test("submits on enter", () => {
    const onSubmit = vi.fn()
    const roomCode = useRoomCodeInput(onSubmit)

    roomCode.onKeydown(0, {
      key: "Enter",
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent)

    expect(onSubmit).toHaveBeenCalledOnce()
  })

  test("fills all digits from paste and focuses the last pasted cell", () => {
    const roomCode = useRoomCodeInput()
    const inputs = Array.from({ length: 6 }, () => new MockInputElement())
    inputs.forEach((input, index) => roomCode.setInputRef(input, index))

    roomCode.onPaste({
      preventDefault: vi.fn(),
      clipboardData: {
        getData: () => "ab12cd",
      },
    } as unknown as ClipboardEvent)

    expect(roomCode.value.value).toBe("AB12CD")
    expect(inputs[5]?.focused).toBe(true)
    expect(inputs[5]?.selectionRange).toEqual([0, 0])
  })
})
