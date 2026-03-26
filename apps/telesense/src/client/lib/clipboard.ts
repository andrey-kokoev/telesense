/**
 * Write text to the clipboard with progressive fallbacks.
 *
 * - ClipboardItem (iOS 16.4+, modern desktop): initiated synchronously within
 *   the gesture context even though data resolution is async, which survives
 *   awaited fetch calls on iOS Safari.
 * - navigator.clipboard.writeText: standard desktop path.
 * - document.execCommand('copy'): last-resort for very old browsers.
 */
export async function writeToClipboard(text: string): Promise<void> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": Promise.resolve(new Blob([text], { type: "text/plain" })),
      }),
    ])
    return
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const el = document.createElement("textarea")
  el.value = text
  el.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0"
  document.body.appendChild(el)
  el.select()
  const ok = document.execCommand("copy")
  document.body.removeChild(el)
  if (!ok) throw new Error("Clipboard unavailable")
}
