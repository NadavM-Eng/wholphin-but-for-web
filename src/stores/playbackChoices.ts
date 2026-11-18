// Remembered playback choices per signed-in user: the Room tables ItemPlayback, SeriesTrackChoice and
// ItemTrackModification of upstream (W/data/ItemPlaybackRepository.kt, SeriesTrackChoiceDao.kt), kept in
// localStorage under `serverId:userId`. Spec 05 §2.1-2.2, §4.4.
import type { BaseItemDto, MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client/models'
import { create } from 'zustand'
import {
  buildTrackChoice,
  chooseSource,
  relativeStreamFrom,
  TrackIndex,
  type ItemPlayback,
  type SeriesTrackChoice,
  type TrackChoiceType,
} from '../features/playback/engine/streamChoice'
import { normalizeId } from '../lib/ids'
import { readJson, writeJson } from '../lib/storage'
import { useSessionStore, userKey } from './session'

const KEY_PREFIX = 'wholphin.playbackChoices.v1.'
/** Oldest rows are dropped beyond this many items (localStorage is small; Room had no limit). */
const MAX_ITEMS = 3000

interface StoredItem extends ItemPlayback {
  updated: number
}

interface ChoicesDoc {
  items: Record<string, StoredItem>
  /** key `${parentId}|${type}` (upstream primary key userId, parentId, type) */
  stc: Record<string, SeriesTrackChoice>
  /** key `${itemId}|${trackIndex}` -> subtitle delay in ms */
  delays: Record<string, number>
}

const empty = (): ChoicesDoc => ({ items: {}, stc: {}, delays: {} })

interface ChoicesState {
  user: string | null
  doc: ChoicesDoc
}

export const usePlaybackChoicesStore = create<ChoicesState>()(() => ({ user: null, doc: empty() }))

function currentUserKey(): string | null {
  const cur = useSessionStore.getState().current
  return cur ? userKey(cur.server.id, cur.user.id) : null
}

function doc(): ChoicesDoc {
  const user = currentUserKey()
  const st = usePlaybackChoicesStore.getState()
  if (st.user !== user) {
    const loaded = user ? readJson<ChoicesDoc>(KEY_PREFIX + user) : null
    const next = { ...empty(), ...loaded }
    usePlaybackChoicesStore.setState({ user, doc: next })
    return next
  }
  return st.doc
}

function commit(next: ChoicesDoc) {
  const user = currentUserKey()
  const ids = Object.keys(next.items)
  if (ids.length > MAX_ITEMS) {
    const keep = ids.sort((a, b) => next.items[b].updated - next.items[a].updated).slice(0, MAX_ITEMS)
    next = { ...next, items: Object.fromEntries(keep.map((k) => [k, next.items[k]])) }
  }
  usePlaybackChoicesStore.setState({ user, doc: next })
  if (user) writeJson(KEY_PREFIX + user, next)
}

const id = (s: string) => normalizeId(s)

// ---------------------------------------------------------------------------------------------
// ItemPlayback

/** The stored row, or null. Upstream ignores a row without a source when starting playback (spec 05 §1.2 step 4). */
export function getItemPlayback(itemId: string): ItemPlayback | null {
  const row = doc().items[id(itemId)]
  if (!row) return null
  const { updated: _u, ...ip } = row
  return ip
}

export function saveItemPlayback(ip: ItemPlayback): ItemPlayback {
  const d = doc()
  const row: StoredItem = { ...ip, itemId: id(ip.itemId), updated: Date.now() }
  commit({ ...d, items: { ...d.items, [row.itemId]: row } })
  return ip
}

/** `savePlayVersion`: remember a version (resets the track indexes, as upstream builds a fresh row). */
export function savePlayVersion(itemId: string, sourceId: string): ItemPlayback {
  return saveItemPlayback({ itemId, sourceId, audioIndex: TrackIndex.UNSPECIFIED, subtitleIndex: TrackIndex.UNSPECIFIED })
}

// ---------------------------------------------------------------------------------------------
// SeriesTrackChoice

type SeriesItem = Pick<BaseItemDto, 'Id' | 'SeriesId' | 'SeasonId' | 'ParentId' | 'Type'>

/**
 * Season/series keys for an item. Upstream keys the "season" choice by `parentId` for every item, so a movie's
 * choice is stored under its library folder and leaks to every movie in it (spec 05 §2.2). Fixed here: only items
 * that belong to a series get series/season choices (W/services/StreamChoiceService.kt).
 */
function parentsOf(item: SeriesItem): { seriesId: string | null; seasonId: string | null } {
  if (!item.SeriesId) return { seriesId: null, seasonId: null }
  const season = item.SeasonId ?? item.ParentId ?? null
  return { seriesId: id(item.SeriesId), seasonId: season ? id(season) : null }
}

/** `getSeriesTrackChoices(item, type)`: season row first, then series (SeriesTrackChoiceDao.get). */
export function getSeriesTrackChoices(item: SeriesItem, type: TrackChoiceType): SeriesTrackChoice[] {
  const { seriesId, seasonId } = parentsOf(item)
  const d = doc()
  const out: SeriesTrackChoice[] = []
  if (seasonId) {
    const s = d.stc[`${seasonId}|${type}`]
    if (s) out.push(s)
  }
  if (seriesId) {
    const s = d.stc[`${seriesId}|${type}`]
    if (s) out.push(s)
  }
  return out
}

function saveStc(rows: SeriesTrackChoice[]) {
  if (rows.length === 0) return
  const d = doc()
  const stc = { ...d.stc }
  for (const r of rows) stc[`${id(r.parentId)}|${r.type}`] = r
  commit({ ...d, stc })
}

// ---------------------------------------------------------------------------------------------
// saveTrackSelection (ItemPlaybackRepository.kt:157-223)

/**
 * Saves the user's audio or subtitle pick for `item` (index = server stream index or a TrackIndex sentinel) and,
 * for series items, the season/series preferences. Returns the updated ItemPlayback.
 */
export function saveTrackSelection(
  item: BaseItemDto,
  itemPlayback: ItemPlayback | null,
  trackIndex: number,
  type: 'Audio' | 'Subtitle',
): ItemPlayback {
  const itemId = item.Id ?? ''
  const source: MediaSourceInfo | null =
    (itemPlayback?.sourceId ? item.MediaSources?.find((s) => s.Id && id(s.Id) === id(itemPlayback.sourceId ?? '')) : null) ??
    chooseSource(item.MediaSources, null)
  if (!source) throw new Error(`Could not find media source for ${itemId}`)
  let row: ItemPlayback = itemPlayback ?? {
    itemId,
    sourceId: source.Id ?? null,
    audioIndex: TrackIndex.UNSPECIFIED,
    subtitleIndex: TrackIndex.UNSPECIFIED,
  }
  row = type === 'Audio' ? { ...row, audioIndex: trackIndex } : { ...row, subtitleIndex: trackIndex }
  saveItemPlayback(row)

  const { seriesId, seasonId } = parentsOf(item)
  if (!seriesId && !seasonId) return row
  const streams = source.MediaStreams ?? []
  const stcType: TrackChoiceType = type === 'Audio' ? 'AUDIO' : 'SUBTITLE'
  const rows = (activation: SeriesTrackChoice['activation'], stream: ReturnType<typeof relativeStreamFrom>) => {
    const out: SeriesTrackChoice[] = []
    if (seasonId) out.push(buildTrackChoice({ itemId, parentId: seasonId, parentType: 'SEASON', type: stcType, activation }, stream))
    if (seriesId) out.push(buildTrackChoice({ itemId, parentId: seriesId, parentType: 'SERIES', type: stcType, activation }, stream))
    return out
  }
  if (type === 'Subtitle' && trackIndex === TrackIndex.DISABLED) saveStc(rows('DISABLED', null))
  else if (type === 'Subtitle' && trackIndex === TrackIndex.ONLY_FORCED) saveStc(rows('ONLY_FORCED', null))
  else {
    const stream = relativeStreamFrom(trackIndex, streams)
    if (stream?.stream.Language != null) saveStc(rows('ACTIVATED', stream))
  }
  return row
}

/** `deleteChosenStreams`: forget the item row and the season + series rows that apply to it. */
export function deleteChosenStreams(item: SeriesItem) {
  const d = doc()
  const items = { ...d.items }
  if (item.Id) delete items[id(item.Id)]
  const stc = { ...d.stc }
  const { seriesId, seasonId } = parentsOf(item)
  for (const t of ['AUDIO', 'SUBTITLE'] as const) {
    if (seasonId) delete stc[`${seasonId}|${t}`]
    if (seriesId) delete stc[`${seriesId}|${t}`]
  }
  commit({ ...d, items, stc })
}

// ---------------------------------------------------------------------------------------------
// Subtitle delay (ItemTrackModification)

export function getSubtitleDelay(itemId: string, trackIndex: number): number {
  return doc().delays[`${id(itemId)}|${trackIndex}`] ?? 0
}

export function saveSubtitleDelay(itemId: string, trackIndex: number, delayMs: number) {
  const d = doc()
  const delays = { ...d.delays }
  const k = `${id(itemId)}|${trackIndex}`
  if (delayMs === 0) delete delays[k]
  else delays[k] = delayMs
  commit({ ...d, delays })
}
