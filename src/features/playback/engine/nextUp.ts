// End-of-item and Next Up rules (PlaybackViewModel.onPlaybackStateChanged / shouldAutoPlayNextUp, PlaybackPage
// next-up countdown; spec 05 §7).
import type { Preferences } from '../../../stores/preferences'

export type NextUpPrefs = Pick<Preferences, 'showNextUpTiming' | 'autoPlayNextUp' | 'autoPlayNextDelay' | 'passOutProtection'>

export type QueueEntryKind = 'intro' | 'media'

export type EndOfItemAction =
  /** play the next entry now */
  | 'play-next'
  /** open the Next Up panel (with countdown when autoplay applies) */
  | 'show-next-up'
  /** stay on the finished item with the controls shown */
  | 'show-controls'
  /** leave the player */
  | 'exit'

/** `autoPlayNext && (passOut == 0 || now - lastInteraction < passOut)`. */
export function shouldAutoPlayNextUp(prefs: NextUpPrefs, lastInteractionMs: number, nowMs: number): boolean {
  if (!prefs.autoPlayNextUp) return false
  return prefs.passOutProtection > 0 ? nowMs - lastInteractionMs < prefs.passOutProtection : true
}

/**
 * What to do when the current entry ends. Upstream with "Show next up: never" + autoplay only shows the controls
 * (spec 05 §7 AMBIGUOUS; W/ui/playback/PlaybackViewModel.kt onPlaybackStateChanged), so autoplay never happens.
 * Fixed: it plays the next entry immediately unless pass-out protection applies.
 */
export function endOfItemAction(
  next: QueueEntryKind | null,
  current: QueueEntryKind,
  prefs: NextUpPrefs,
  autoPlayAllowed: boolean,
): EndOfItemAction {
  if (next == null) return 'exit'
  if (next === 'intro' || current === 'intro') return 'play-next'
  if (prefs.showNextUpTiming === 'NEXT_UP_NEVER') {
    if (!prefs.autoPlayNextUp) return 'exit'
    return autoPlayAllowed ? 'play-next' : 'show-controls'
  }
  return 'show-next-up'
}

/** Initial countdown seconds for the Next Up panel, or null when it should not count down. */
export function nextUpCountdownStart(prefs: NextUpPrefs, autoPlayAllowed: boolean): number | null {
  return autoPlayAllowed ? Math.max(0, prefs.autoPlayNextDelay) : null
}

/**
 * Previous-button rule (PlaybackPage.kt:317-324): go to the previous entry only near the start of the current
 * one (media3 maxSeekToPreviousPosition = 3000 ms), else restart the current entry.
 */
export const MAX_SEEK_TO_PREVIOUS_MS = 3000
export function previousAction(positionMs: number, hasPrevious: boolean): 'previous-item' | 'restart' {
  return positionMs < MAX_SEEK_TO_PREVIOUS_MS && hasPrevious ? 'previous-item' : 'restart'
}
