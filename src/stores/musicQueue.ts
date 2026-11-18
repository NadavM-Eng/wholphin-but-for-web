// State of the music player (upstream MusicServiceState + the Media3 player state the music screens read).
// Only src/features/music/service writes it; pages read it with `useMusicQueue(selector)`.
import { create } from 'zustand'

/**
 * One queue entry (W/data/model/AudioItem.kt). `key` is unique per entry so the same song can be queued twice;
 * `imageUrl` is the album's Primary image.
 */
export type AudioItem = {
  key: string
  id: string
  albumId: string | null
  /** first entry of `ArtistItems` (Go to artist) */
  artistId: string | null
  /** every `ArtistItems` id (Now Playing backdrops) */
  artistIds: string[]
  title: string | null
  albumTitle: string | null
  /** `artists` joined by ", " */
  artistNames: string | null
  runtimeMs: number | null
  imageUrl: string | null
  hasLyrics: boolean
  /** first media source container / audio codec (decides direct play vs. transcode) */
  container: string | null
  codec: string | null
}

export type RepeatMode = 'off' | 'one' | 'all'

/** `NowPlayingStatus`: PLAYING, PAUSED (also after the queue ended), IDLE (no queue). */
export type MusicStatus = 'idle' | 'playing' | 'paused'

export type MusicQueueState = {
  entries: readonly AudioItem[]
  currentIndex: number
  shuffle: boolean
  /** entry keys in shuffled play order */
  order: readonly string[]
  repeat: RepeatMode
  status: MusicStatus
  /** `loadingState == Loading` while a queue or instant mix is being fetched (Now Playing shows a spinner) */
  loading: boolean
  /** increments on every queue change (upstream `queueVersion`) */
  version: number
  /** when the status last became PAUSED (the drawer entry hides 2 h later) */
  pausedAt: number | null
  positionMs: number
  durationMs: number
  bufferedMs: number
  /** the element is waiting for data */
  buffering: boolean
  volume: number
  muted: boolean
  /** last playback error text, cleared on the next track */
  error: string | null
}

export const MUSIC_QUEUE_EMPTY: MusicQueueState = {
  entries: [],
  currentIndex: 0,
  shuffle: false,
  order: [],
  repeat: 'off',
  status: 'idle',
  loading: false,
  version: 0,
  pausedAt: null,
  positionMs: 0,
  durationMs: 0,
  bufferedMs: 0,
  buffering: false,
  volume: 1,
  muted: false,
  error: null,
}

export const useMusicQueue = create<MusicQueueState>()(() => ({ ...MUSIC_QUEUE_EMPTY }))

/** The entry being played, or null. */
export function currentEntry(s: Pick<MusicQueueState, 'entries' | 'currentIndex'>): AudioItem | null {
  return s.entries[s.currentIndex] ?? null
}

/** Hook: the entry being played. */
export function useCurrentAudio(): AudioItem | null {
  return useMusicQueue((s) => s.entries[s.currentIndex] ?? null)
}
