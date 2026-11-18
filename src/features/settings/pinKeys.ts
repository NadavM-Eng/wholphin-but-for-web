/** Arrow keys and digits append to the PIN (W/ui/setup/PinEntry.kt: U/R/D/L and 0-9). */
const KEY_CHARS: Record<string, string> = { ArrowUp: 'U', ArrowRight: 'R', ArrowDown: 'D', ArrowLeft: 'L' }

export function pinCharForKey(key: string): string | null {
  if (key in KEY_CHARS) return KEY_CHARS[key]
  return /^[0-9]$/.test(key) ? key : null
}
