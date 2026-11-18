// Pure queue operations behind the music service (W/services/MusicService.kt, which drives a Media3 player
// playlist). The queue is a list of entries; `currentIndex` points into it. With shuffle on, `order` holds the
// entry keys in play order (Media3 `ShuffleOrder`); with shuffle off the play order is the list order.
// Repeat follows Media3: ONE repeats the track on natural end, but a user "next"/"previous" treats ONE as OFF
// (`BasePlayer.getRepeatModeForNavigation`).
import type { AudioItem, RepeatMode } from '../../../stores/musicQueue'

export type QueueShape = {
  entries: readonly AudioItem[]
  currentIndex: number
  shuffle: boolean
  /** entry keys in play order (only meaningful with shuffle on; kept in sync either way) */
  order: readonly string[]
  repeat: RepeatMode
}

/** Media3 `seekToPrevious`: within this position the previous track is played, after it the track restarts. */
export const MAX_SEEK_TO_PREVIOUS_MS = 3000

/** Fisher-Yates with an injectable random source (tests pass a seeded one). */
export function shuffled<T>(list: readonly T[], random: () => number = Math.random): T[] {
  const out = list.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** A shuffle order that starts with `firstKey` (the current entry) followed by the others in random order. */
export function shuffleOrderFrom(entries: readonly AudioItem[], firstKey: string | null, random: () => number = Math.random): string[] {
  const rest = shuffled(
    entries.map((e) => e.key).filter((k) => k !== firstKey),
    random,
  )
  return firstKey != null && entries.some((e) => e.key === firstKey) ? [firstKey, ...rest] : rest
}

/** Entry indexes in play order. */
export function playOrder(q: QueueShape): number[] {
  if (!q.shuffle) return q.entries.map((_, i) => i)
  const pos = new Map(q.entries.map((e, i) => [e.key, i]))
  const out: number[] = []
  for (const k of q.order) {
    const i = pos.get(k)
    if (i != null) out.push(i)
  }
  return out
}

/**
 * Index of the entry after the current one, or -1. `natural` = the track ended by itself (repeat ONE replays it);
 * otherwise a user "next" (ONE behaves as OFF).
 */
export function nextIndex(q: QueueShape, natural: boolean): number {
  if (q.entries.length === 0) return -1
  if (natural && q.repeat === 'one') return q.currentIndex
  const order = playOrder(q)
  const p = order.indexOf(q.currentIndex)
  if (p < 0) return order[0] ?? -1
  if (p + 1 < order.length) return order[p + 1]
  return q.repeat === 'all' ? order[0] : -1
}

/** Index of the entry before the current one in play order, or -1 (repeat ALL wraps). */
export function previousIndex(q: QueueShape): number {
  if (q.entries.length === 0) return -1
  const order = playOrder(q)
  const p = order.indexOf(q.currentIndex)
  if (p > 0) return order[p - 1]
  return q.repeat === 'all' && order.length > 1 ? order[order.length - 1] : -1
}

/** Media3 RepeatButtonState cycle: OFF -> ONE -> ALL -> OFF. */
export function nextRepeatMode(mode: RepeatMode): RepeatMode {
  return mode === 'off' ? 'one' : mode === 'one' ? 'all' : 'off'
}

/** Keys that are new to the order are placed right after the current entry (play next) or at the end. */
function withOrder(q: QueueShape, entries: AudioItem[], currentIndex: number, newKeys: string[], afterCurrent: boolean): string[] {
  const live = new Set(entries.map((e) => e.key))
  const order = q.order.filter((k) => live.has(k))
  if (newKeys.length === 0) return order
  if (!q.shuffle) return [...order, ...newKeys]
  // Media3 scatters inserted items randomly through the shuffle order; on the web "play next" must play next,
  // and appended songs go after the current one so they are reached.
  const currentKey = entries[currentIndex]?.key
  const at = currentKey != null ? order.indexOf(currentKey) + 1 : order.length
  if (afterCurrent) return [...order.slice(0, at), ...newKeys, ...order.slice(at)]
  const tail = shuffled([...order.slice(at), ...newKeys])
  return [...order.slice(0, at), ...tail]
}

/** Appends `items` at the end of the queue (MusicService.addToQueue / addAllToQueue). */
export function appendEntries(q: QueueShape, items: readonly AudioItem[]): Pick<QueueShape, 'entries' | 'currentIndex' | 'order'> {
  const entries = [...q.entries, ...items]
  if (q.entries.length === 0) {
    if (!q.shuffle) return { entries, currentIndex: 0, order: entries.map((e) => e.key) }
    // a shuffled new queue starts at the first entry of its shuffle order
    const order = shuffleOrderFrom(entries, null)
    return { entries, currentIndex: Math.max(0, entries.findIndex((e) => e.key === order[0])), order }
  }
  return { entries, currentIndex: q.currentIndex, order: withOrder(q, entries, q.currentIndex, items.map((i) => i.key), false) }
}

/** Inserts `items` right after the current entry (MusicService.playNext: `addMediaItem(currentIndex + 1)`). */
export function insertNext(q: QueueShape, items: readonly AudioItem[]): Pick<QueueShape, 'entries' | 'currentIndex' | 'order'> {
  if (q.entries.length === 0) return appendEntries(q, items)
  const at = q.currentIndex + 1
  const entries = [...q.entries.slice(0, at), ...items, ...q.entries.slice(at)]
  return { entries, currentIndex: q.currentIndex, order: withOrder(q, entries, q.currentIndex, items.map((i) => i.key), true) }
}

/** Player.moveMediaItem(from, to): the current entry keeps playing; its index follows it. */
export function moveEntry(q: QueueShape, from: number, to: number): Pick<QueueShape, 'entries' | 'currentIndex'> | null {
  const n = q.entries.length
  if (from < 0 || from >= n || to < 0 || to >= n || from === to) return null
  const entries = q.entries.slice()
  const [moved] = entries.splice(from, 1)
  entries.splice(to, 0, moved)
  let currentIndex = q.currentIndex
  if (from === q.currentIndex) currentIndex = to
  else if (from < q.currentIndex && to >= q.currentIndex) currentIndex--
  else if (from > q.currentIndex && to <= q.currentIndex) currentIndex++
  return { entries, currentIndex }
}

/**
 * Player.removeMediaItem(index). Removing the current entry moves playback to the entry that takes its place
 * (`currentChanged`); removing the last remaining entry empties the queue.
 */
export function removeEntry(
  q: QueueShape,
  index: number,
): (Pick<QueueShape, 'entries' | 'currentIndex' | 'order'> & { currentChanged: boolean; ended: boolean }) | null {
  const n = q.entries.length
  if (index < 0 || index >= n) return null
  const removedKey = q.entries[index].key
  const entries = q.entries.filter((_, i) => i !== index)
  const order = q.order.filter((k) => k !== removedKey)
  if (index !== q.currentIndex) {
    return { entries, order, currentIndex: index < q.currentIndex ? q.currentIndex - 1 : q.currentIndex, currentChanged: false, ended: false }
  }
  if (entries.length === 0) return { entries, order, currentIndex: 0, currentChanged: true, ended: true }
  // Media3 keeps the same window index (the following entry); at the end it wraps with repeat ALL, else ends.
  if (index < entries.length) return { entries, order, currentIndex: index, currentChanged: true, ended: false }
  return q.repeat === 'all'
    ? { entries, order, currentIndex: 0, currentChanged: true, ended: false }
    : { entries, order, currentIndex: entries.length - 1, currentChanged: true, ended: true }
}

/** Ids of every queued song (MusicServiceState.queuedIds): album/playlist rows mark them with a dot. */
export function queuedIds(entries: readonly AudioItem[]): Set<string> {
  return new Set(entries.map((e) => e.id))
}
