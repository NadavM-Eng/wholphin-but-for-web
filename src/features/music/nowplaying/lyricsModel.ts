// LyricDto handling (NowPlayingViewModel.listenForLyrics, LyricsContent.kt).
import type { LyricDto } from '@jellyfin/sdk/lib/generated-client/models'

/** Every 150 ms upstream recomputes the current line. */
export const LYRIC_TICK_MS = 150

/**
 * Index of the last line whose start is <= position + offset, or null (unsynced lyrics never highlight, and
 * nothing is highlighted before the first line starts).
 */
export function currentLyricIndex(lyrics: LyricDto | null | undefined, positionMs: number): number | null {
  const lines = lyrics?.Lyrics ?? []
  if (lines.length === 0) return null
  const offsetMs = (lyrics?.Metadata?.Offset ?? 0) / 10_000
  const pos = (positionMs + offsetMs) * 10_000
  let found = -1
  for (let i = 0; i < lines.length; i++) {
    const start = lines[i].Start
    if (start != null && pos >= start) found = i
  }
  return found >= 0 ? found : null
}

/** Blank lines are rendered as 16 spaces so they keep their height (LyricsContent.kt). */
export function lyricText(text: string | null | undefined): string {
  return text && text.trim() ? text : ' '.repeat(16)
}

/** `state.hasLyrics`: fetched and non-empty. */
export function hasLyricLines(lyrics: LyricDto | null | undefined): boolean {
  return (lyrics?.Lyrics?.length ?? 0) > 0
}
