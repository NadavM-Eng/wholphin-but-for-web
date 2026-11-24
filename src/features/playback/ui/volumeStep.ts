// Pure rule of the volume keys (ArrowUp / ArrowDown of the video player): 5 percent per press between 0 and 100.

export const VOLUME_STEP = 0.05

/** The volume and mute state after one press; raising while muted unmutes, reaching 0 mutes (as the slider does). */
export function stepVolume(volume: number, muted: boolean, dir: -1 | 1): { volume: number; muted: boolean } {
  const base = dir > 0 ? volume : muted ? 0 : volume
  const v = Math.min(1, Math.max(0, Math.round(base / VOLUME_STEP + dir) * VOLUME_STEP))
  const rounded = Math.round(v * 100) / 100
  return { volume: rounded, muted: rounded === 0 }
}
