// Media segment handling (PlaybackViewModel.listenForSegments / updateSegment, spec 05 §6). The engine calls
// evaluateSegments every 500 ms with the playback position; this file holds the per-tick decision only.
import type { MediaSegmentDto, MediaSegmentType } from '@jellyfin/sdk/lib/generated-client/models'
import type { Preferences } from '../../../stores/preferences'

export const SEGMENT_POLL_MS = 500
/** The floating Skip button dismisses itself after this long (PlaybackPage.kt:606-628). */
export const SKIP_BUTTON_TIMEOUT_MS = 10_000
export const TICKS_PER_MS = 10_000

export type SkipBehavior = Preferences['skipIntros']

export interface SegmentState {
  segment: MediaSegmentDto
  /** true once auto-skipped, clicked or dismissed: no floating Skip button */
  interacted: boolean
}

export type SegmentPrefs = Pick<
  Preferences,
  'skipIntros' | 'skipOutros' | 'skipCommercials' | 'skipPreviews' | 'skipRecaps' | 'showNextUpTiming'
>

export function behaviorFor(type: MediaSegmentType | undefined, prefs: SegmentPrefs): SkipBehavior {
  switch (type) {
    case 'Commercial':
      return prefs.skipCommercials
    case 'Preview':
      return prefs.skipPreviews
    case 'Recap':
      return prefs.skipRecaps
    case 'Outro':
      return prefs.skipOutros
    case 'Intro':
      return prefs.skipIntros
    default:
      return 'IGNORE'
  }
}

export interface SegmentTickInput {
  segments: readonly MediaSegmentDto[]
  positionMs: number
  itemId: string
  prefs: SegmentPrefs
  hasNext: boolean
  /** the next queue entry is real media (not a cinema-mode intro) */
  nextIsMedia: boolean
  /** ids auto-skipped, clicked or dismissed for the current item */
  handled: ReadonlySet<string>
  /** outro ids that already opened Next Up */
  outroShown: ReadonlySet<string>
}

export interface SegmentTickResult {
  /** new state, or 'keep' to leave the current state untouched */
  state: SegmentState | null | 'keep'
  /** seek here (auto-skip) */
  seekToMs?: number
  /** add to `handled` */
  markHandled?: string
  /** add to `outroShown` */
  markOutroShown?: string
  /** open the Next Up panel now (outro with "during credits") */
  showNextUp?: boolean
}

const sameId = (a: string | null | undefined, b: string | null | undefined) =>
  a != null && b != null && a.replace(/-/g, '').toLowerCase() === b.replace(/-/g, '').toLowerCase()

export function segmentEndMs(s: MediaSegmentDto): number {
  return Math.floor((s.EndTicks ?? 0) / TICKS_PER_MS)
}

export function evaluateSegments(i: SegmentTickInput): SegmentTickResult {
  const ticks = i.positionMs * TICKS_PER_MS
  const seg = i.segments.find((s) => s.Type !== 'Unknown' && ticks >= (s.StartTicks ?? 0) && ticks < (s.EndTicks ?? 0))
  if (!seg) return { state: null }
  if (!sameId(seg.ItemId, i.itemId) || !seg.Id) return { state: 'keep' }

  if (seg.Type === 'Outro' && i.prefs.showNextUpTiming === 'DURING_CREDITS' && i.hasNext && !i.outroShown.has(seg.Id)) {
    // Upstream records the outro even when the next entry is an intro, and does not evaluate the skip this tick.
    return { state: 'keep', markOutroShown: seg.Id, showNextUp: i.nextIsMedia }
  }
  switch (behaviorFor(seg.Type, i.prefs)) {
    case 'AUTO_SKIP':
      if (!i.handled.has(seg.Id)) return { state: { segment: seg, interacted: true }, seekToMs: segmentEndMs(seg) + 1, markHandled: seg.Id }
      return { state: { segment: seg, interacted: true } }
    case 'ASK_TO_SKIP':
      return { state: { segment: seg, interacted: i.handled.has(seg.Id) } }
    default:
      return { state: null }
  }
}
