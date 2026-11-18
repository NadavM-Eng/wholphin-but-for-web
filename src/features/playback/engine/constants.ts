// Option lists of the player dialogs (W/ui/playback/PlaybackConstants.kt, W/preferences/AppPreference.kt).

/** `playbackSpeedOptions` */
export const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const

const M = 1024 * 1024

/** `bitrateValues`: 500k ... 200M with M = 1,048,576 (AppPreference.kt:349-363). */
export const BITRATE_VALUES: readonly number[] = [
  500 * 1024,
  750 * 1024,
  1 * M,
  2 * M,
  3 * M,
  5 * M,
  8 * M,
  10 * M,
  15 * M,
  20 * M,
  ...Array.from({ length: 8 }, (_, i) => (30 + i * 10) * M),
  ...Array.from({ length: 5 }, (_, i) => (120 + i * 20) * M),
]
