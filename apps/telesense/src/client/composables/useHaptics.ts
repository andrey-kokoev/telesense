// Haptic feedback composable - wraps navigator.vibrate with patterns

type VibratePattern = number | number[]

const PATTERNS: Record<string, VibratePattern> = {
  // Light tap - button press, selection
  light: 10,
  
  // Medium - important action
  medium: 30,
  
  // Heavy - error, warning
  heavy: 100,
  
  // Success - three pulses
  success: [50, 30, 50],
  
  // Error - single strong
  error: 100,
  
  // Selection change
  selection: 15,
  
  // Swipe threshold reached
  swipeConfirm: [20, 10, 20],
  
  // Delete action
  delete: [30, 50, 30]
}

type HapticPattern = keyof typeof PATTERNS

// Check if haptics are supported
const isSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator

export function useHaptics() {
  /**
   * Trigger haptic feedback
   * @param pattern Named pattern or custom vibration pattern
   */
  function vibrate(pattern: HapticPattern | number | number[]): void {
    if (!isSupported) return
    
    const value = typeof pattern === 'string' ? PATTERNS[pattern] : pattern
    
    try {
      navigator.vibrate(value)
    } catch {
      // Silently fail if haptics not available
    }
  }
  
  /**
   * Light tap - use for button presses
   */
  function tap(): void {
    vibrate('light')
  }
  
  /**
   * Success feedback - use for completed actions
   */
  function success(): void {
    vibrate('success')
  }
  
  /**
   * Error feedback - use for errors/warnings
   */
  function error(): void {
    vibrate('error')
  }
  
  /**
   * Selection feedback - use when selecting items
   */
  function selection(): void {
    vibrate('selection')
  }
  
  /**
   * Swipe confirmation - threshold reached
   */
  function swipeConfirm(): void {
    vibrate('swipeConfirm')
  }
  
  /**
   * Delete action feedback
   */
  function deleteAction(): void {
    vibrate('delete')
  }
  
  return {
    vibrate,
    tap,
    success,
    error,
    selection,
    swipeConfirm,
    deleteAction,
    isSupported
  }
}
