// Browser integrations: Media Session (the Android MediaSession, spec 05 §5 / 08 PB-10) and the screen wake lock
// (upstream keepScreenOn while playing).

import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'

export interface MediaSessionHandlers {
  play(): void
  pause(): void
  seekBackward(): void
  seekForward(): void
  seekTo(ms: number): void
  previous(): void
  next(): void
  stop(): void
}

/**
 * Whether the Primary image getItemImageUrl would pick for this item is known to exist (has a tag). Live TV
 * channels without a logo have `ImageTags: {}`, and the untagged URL 404s, so no artwork is requested then.
 */
export function hasPrimaryArtwork(
  item: Pick<BaseItemDto, 'Type' | 'SeriesId' | 'ImageTags' | 'SeriesPrimaryImageTag'>,
  useSeriesForPrimary = true,
): boolean {
  const own = item.ImageTags?.Primary
  const isEpOrSeason = item.Type === 'Episode' || item.Type === 'Season'
  if (item.SeriesId != null && isEpOrSeason && (useSeriesForPrimary || (item.Type === 'Season' && !own))) {
    return !!item.SeriesPrimaryImageTag
  }
  return !!own
}

const ms = () => (typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null)

/**
 * `BaseItem.toMediaMetadata` (CurrentMediaInfo.kt:66-83): `title` is BaseItem.title (the series for episodes) and
 * `subtitle` BaseItem.subtitle ("S1 E2 - Name", else the year), shown as the artist line. Year, overview, duration
 * and media type have no MediaMetadata field on the web.
 */
export function setMediaMetadata(meta: { title: string; subtitle: string; artworkUrl: string | null } | null) {
  const s = ms()
  if (!s) return
  if (!meta) {
    s.metadata = null
    return
  }
  try {
    s.metadata = new MediaMetadata({
      title: meta.title,
      artist: meta.subtitle,
      artwork: meta.artworkUrl ? [{ src: meta.artworkUrl }] : [],
    })
  } catch {
    // MediaMetadata missing (old engines)
  }
}

export function bindMediaSession(h: MediaSessionHandlers) {
  const s = ms()
  if (!s) return () => {}
  const set = (action: MediaSessionAction, fn: MediaSessionActionHandler | null) => {
    try {
      s.setActionHandler(action, fn)
    } catch {
      // action unsupported by this browser
    }
  }
  set('play', () => h.play())
  set('pause', () => h.pause())
  set('seekbackward', () => h.seekBackward())
  set('seekforward', () => h.seekForward())
  set('seekto', (d) => {
    if (d.seekTime != null) h.seekTo(d.seekTime * 1000)
  })
  set('previoustrack', () => h.previous())
  set('nexttrack', () => h.next())
  set('stop', () => h.stop())
  return () => {
    for (const a of ['play', 'pause', 'seekbackward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack', 'stop'] as const) set(a, null)
    s.metadata = null
    try {
      s.playbackState = 'none'
    } catch {
      // ignore
    }
  }
}

let lastPositionUpdate = 0
export function updateMediaPosition(positionMs: number, durationMs: number, rate: number, paused: boolean, force = false) {
  const s = ms()
  if (!s) return
  try {
    s.playbackState = paused ? 'paused' : 'playing'
    const now = Date.now()
    if (!force && now - lastPositionUpdate < 1000) return
    lastPositionUpdate = now
    if (durationMs > 0 && Number.isFinite(durationMs)) {
      s.setPositionState({ duration: durationMs / 1000, position: Math.min(positionMs, durationMs) / 1000, playbackRate: rate || 1 })
    }
  } catch {
    // setPositionState rejects inconsistent values; next update fixes it
  }
}

// ---------------------------------------------------------------------------------------------
// Wake lock

let sentinel: WakeLockSentinel | null = null
/** a request in flight; a second acquire waits for it instead of requesting another lock */
let pending: Promise<void> | null = null
let wanted = false
let visibilityBound = false

function releaseSentinel() {
  const s = sentinel
  sentinel = null
  if (s && !s.released) void s.release().catch(() => undefined)
}

async function acquire() {
  if (!wanted || sentinel || pending || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
  if (document.visibilityState !== 'visible') return
  pending = (async () => {
    try {
      const s = await navigator.wakeLock.request('screen')
      s.addEventListener('release', () => {
        if (sentinel === s) sentinel = null
      })
      sentinel = s
      // keepScreenOn(false) ran while the request was in flight
      if (!wanted) releaseSentinel()
    } catch {
      sentinel = null
    } finally {
      pending = null
    }
  })()
  await pending
}

/** Keep the screen on while `on` (re-acquired when the tab becomes visible again). */
export function keepScreenOn(on: boolean) {
  wanted = on
  if (!visibilityBound && typeof document !== 'undefined') {
    visibilityBound = true
    document.addEventListener('visibilitychange', () => void acquire())
  }
  if (on) void acquire()
  else releaseSentinel()
}
