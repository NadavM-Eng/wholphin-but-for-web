// Port of W/ui/playback/SeekAcceleration.kt (spec 05 §9.7). Used by the controls for hold-to-seek.

/** Hold-to-seek starts after this many key repeats while controls are hidden (PlaybackKeyHandler.kt). */
export const HOLD_TO_SEEK_REPEAT_START_COUNT = 8

/** Seek step multiplier for a held key. `repeatCount` is the key-repeat count, `durationMs` the item length. */
export function calculateSeekAccelerationMultiplier(repeatCount: number, durationMs: number | null | undefined): number {
  if (repeatCount <= 0 || durationMs == null || durationMs <= 0) return 1
  const s = Math.trunc(repeatCount / 3)
  if (s <= 0) return 1
  const minutes = Math.trunc(durationMs / 60_000)
  if (minutes < 30) return s < 30 ? 1 : 2
  if (minutes < 90) return s < 13 ? 1 : s < 50 ? 2 : s < 75 ? 3 : 4
  if (minutes < 150) return s < 20 ? 1 : s < 40 ? 2 : s < 60 ? 4 : 6
  return s < 20 ? 1 : s < 40 ? 3 : s < 60 ? 6 : 10
}

/**
 * Synthetic repeat count for the web, where OS key-repeat rates differ: one repeat per 50 ms held
 * (spec 05 §B7 "Hold acceleration on the web").
 */
export function repeatCountFromHold(heldMs: number): number {
  return Math.max(0, Math.floor(heldMs / 50))
}
