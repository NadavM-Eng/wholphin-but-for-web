import type { SavedUser } from '../../stores/session'

/** One PIN "key" (upstream PinEntry.kt:66-86): D-pad arrows become U/R/D/L, digit keys their digit. */
export type PinKey = 'U' | 'R' | 'D' | 'L' | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'

const ARROWS: Record<string, PinKey> = { ArrowUp: 'U', ArrowRight: 'R', ArrowDown: 'D', ArrowLeft: 'L' }

/** PIN character for a KeyboardEvent.key (numpad digits report the same `key`), or null. */
export function pinKeyFor(key: string): PinKey | null {
  if (key in ARROWS) return ARROWS[key]
  return /^[0-9]$/.test(key) ? (key as PinKey) : null
}

/** `SetPinFlow` ENTER_PIN rule: at least 4 keys. */
export const MIN_PIN_LENGTH = 4

export function isPinLongEnough(pin: string): boolean {
  return pin.length >= MIN_PIN_LENGTH
}

/** Upstream `ProfileProtection` (SetPinFlow.kt:24-28). */
export type ProfileProtection = 'NONE' | 'PIN' | 'LOGIN'

export function profileProtectionOf(u: Pick<SavedUser, 'pin' | 'requireLogin'>): ProfileProtection {
  // login > PIN > none (PreferencesContent.kt:470-475)
  if (u.requireLogin) return 'LOGIN'
  return u.pin?.trim() ? 'PIN' : 'NONE'
}
