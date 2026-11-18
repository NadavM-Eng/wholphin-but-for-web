// Queue construction: port of W/services/PlaylistCreator.kt plus the item kind sets of PlaybackConstants.kt /
// Constants.kt (spec 05 §1.1).
import type { Api } from '@jellyfin/sdk'
import type {
  BaseItemDto,
  BaseItemKind,
  ItemFields,
  ItemFilter,
  ItemSortBy,
  SortOrder,
  VideoType,
} from '@jellyfin/sdk/lib/generated-client/models'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { getShowApi } from '@jellyfin/sdk/lib/utils/api/show-api'
import { getVideoApi } from '@jellyfin/sdk/lib/utils/api/video-api'
import { applyFilter, type GetItemsFilter } from '../../browse/model/filter'

/** `Playlist.MAX_SIZE` */
export const QUEUE_MAX_SIZE = 100

/** `BaseItemKind.playable`: the item itself can be played. */
export const PLAYABLE_KINDS: ReadonlySet<string> = new Set([
  'Episode',
  'Movie',
  'MusicVideo',
  'Trailer',
  'Video',
  'LiveTvChannel',
  'LiveTvProgram',
  'Program',
  'Recording',
  'TvChannel',
  'TvProgram',
])

/** `supportItemKinds` (W/util/Constants.kt:6-18): kinds play() accepts. */
export const SUPPORTED_ITEM_KINDS: ReadonlySet<string> = new Set([
  'Movie',
  'Episode',
  'Series',
  'Video',
  'MusicVideo',
  'Season',
  'CollectionFolder',
  'Folder',
  'UserView',
  'Trailer',
  'TvChannel',
  'TvProgram',
  'LiveTvChannel',
  'LiveTvProgram',
  'Recording',
])

/** `DetailItemFields` (UiConstants.kt). */
export const DETAIL_FIELDS: ItemFields[] = [
  'Overview',
  'Trickplay',
  'SortName',
  'Chapters',
  'MediaSources',
  'MediaSourceCount',
  'CanDelete',
  'PrimaryImageAspectRatio',
]

export type QueueEntry = { kind: 'media'; item: BaseItemDto } | { kind: 'intro'; item: BaseItemDto }

export interface SortAndDirection {
  sort: ItemSortBy
  direction: SortOrder
}
export const DEFAULT_SORT: SortAndDirection = { sort: 'SortName', direction: 'Ascending' }

/**
 * Optional item filter for PlaybackList (upstream `GetItemsFilter.applyTo`). Carried in the `filter` query
 * parameter as JSON; unknown keys are ignored. Two spellings are accepted: these REST parameter names, and the
 * Kotlin `GetItemsFilter` field names browse's grids and the playlist page save (`genres`, `played`, `decades`,
 * `videoTypes`...), which are mapped with browse's `applyFilter`.
 */
export interface QueueFilter {
  genreIds?: string[]
  studioIds?: string[]
  personIds?: string[]
  years?: number[]
  officialRatings?: string[]
  tags?: string[]
  isPlayed?: boolean
  isFavorite?: boolean
  includeItemTypes?: BaseItemKind[]
  filters?: ItemFilter[]
  minCommunityRating?: number
  is4K?: boolean
  isHd?: boolean
  is3D?: boolean
  videoTypes?: VideoType[]
}

/** Keys only the Kotlin `GetItemsFilter` spelling uses. */
const KOTLIN_FILTER_KEYS = ['genres', 'studios', 'persons', 'played', 'favorite', 'decades', 'videoTypes', 'minCommunityRating'] as const

function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

export function parseQueueFilter(raw: string | null | undefined): QueueFilter {
  if (!raw) return {}
  try {
    const v: unknown = JSON.parse(raw)
    if (!v || typeof v !== 'object') return {}
    const o = v as Record<string, unknown>
    const strs = (k: string) => (Array.isArray(o[k]) ? (o[k] as unknown[]).filter((x): x is string => typeof x === 'string') : undefined)
    if (KOTLIN_FILTER_KEYS.some((k) => o[k] != null)) {
      const p = applyFilter(o as GetItemsFilter)
      return compact({ ...p, filters: strs('filters') as ItemFilter[] | undefined })
    }
    return {
      genreIds: strs('genreIds'),
      studioIds: strs('studioIds'),
      personIds: strs('personIds'),
      years: Array.isArray(o.years) ? (o.years as unknown[]).filter((x): x is number => typeof x === 'number') : undefined,
      officialRatings: strs('officialRatings'),
      tags: strs('tags'),
      isPlayed: typeof o.isPlayed === 'boolean' ? o.isPlayed : undefined,
      isFavorite: typeof o.isFavorite === 'boolean' ? o.isFavorite : undefined,
      includeItemTypes: strs('includeItemTypes') as BaseItemKind[] | undefined,
      filters: strs('filters') as ItemFilter[] | undefined,
    }
  } catch {
    return {}
  }
}

export type QueueResult = { ok: true; entries: QueueEntry[] } | { ok: false; message: string }

const PLAYABLE_FOR_COLLECTION: Record<string, BaseItemKind[]> = {
  movies: ['Movie'],
  tvshows: ['Episode'],
  musicvideos: ['MusicVideo'],
  homevideos: ['Video'],
  trailers: ['Trailer'],
}
const ALL_PLAYABLE: BaseItemKind[] = ['Episode', 'Movie', 'MusicVideo', 'Trailer', 'Video']

export interface CreateQueueOptions {
  startIndex?: number
  sort?: SortAndDirection | null
  shuffled?: boolean
  filter?: QueueFilter
  userId?: string
}

/** Contextual queue for an item (`PlaylistCreator.createFrom`). */
export async function createQueue(api: Api, item: BaseItemDto, o: CreateQueueOptions = {}): Promise<QueueResult> {
  const id = item.Id ?? ''
  const userId = o.userId
  const random: SortAndDirection = { sort: 'Random', direction: 'Ascending' }
  const withParts = (items: BaseItemDto[]) => addParts(api, items, userId)
  switch (item.Type) {
    case 'BoxSet':
    case 'CollectionFolder':
    case 'UserView':
    case 'Folder': {
      // Folder is unsupported upstream ("TODO"); it is played like a collection here.
      const sort = o.shuffled ? random : (o.sort ?? DEFAULT_SORT)
      const kinds = PLAYABLE_FOR_COLLECTION[item.CollectionType ?? ''] ?? ALL_PLAYABLE
      const f = o.filter ?? {}
      const res = await getLibraryApi(api).getItems({
        userId,
        parentId: id,
        enableImageTypes: ['Primary', 'Thumb', 'Logo'],
        includeItemTypes: f.includeItemTypes?.length ? f.includeItemTypes : kinds,
        recursive: true,
        excludeItemIds: [id],
        sortBy: [sort.sort],
        sortOrder: [sort.direction],
        fields: DETAIL_FIELDS,
        startIndex: o.startIndex ?? 0,
        limit: QUEUE_MAX_SIZE,
        excludeLocationTypes: ['Virtual'],
        ...filterParams(f),
      })
      return { ok: true, entries: await withParts(res.data.Items ?? []) }
    }
    case 'Episode': {
      if (!item.SeriesId) return { ok: false, message: 'Episode has no seriesId' }
      return { ok: true, entries: await fromEpisode(api, item.SeriesId, id, null, !!o.shuffled, userId) }
    }
    case 'Season': {
      if (!item.SeriesId) return { ok: false, message: 'Episode has no seriesId' }
      if (o.shuffled) {
        const res = await getShowApi(api).getEpisodes({
          seriesId: item.SeriesId,
          seasonId: id,
          userId,
          limit: QUEUE_MAX_SIZE,
          sortBy: 'Random',
          fields: DETAIL_FIELDS,
        })
        return { ok: true, entries: await withParts(res.data.Items ?? []) }
      }
      return { ok: true, entries: await fromEpisode(api, item.SeriesId, null, id, false, userId) }
    }
    case 'Series': {
      if (o.shuffled) {
        const res = await getShowApi(api).getEpisodes({ seriesId: id, userId, limit: QUEUE_MAX_SIZE, sortBy: 'Random', fields: DETAIL_FIELDS })
        return { ok: true, entries: await withParts(res.data.Items ?? []) }
      }
      const next = (await getShowApi(api).getNextUp({ seriesId: id, userId })).data.Items?.[0]
      const first = next ?? (await getShowApi(api).getEpisodes({ seriesId: id, userId, limit: 1 })).data.Items?.[0]
      if (!first?.Id) return { ok: false, message: `Could not determine next up episode for series: ${id}` }
      return { ok: true, entries: await fromEpisode(api, id, first.Id, null, false, userId) }
    }
    case 'Playlist': {
      const sort = o.shuffled ? random : (o.sort ?? { sort: 'Default' as ItemSortBy, direction: 'Ascending' as SortOrder })
      const f = o.filter ?? {}
      const res = await getLibraryApi(api).getItems({
        userId,
        parentId: id,
        fields: DETAIL_FIELDS,
        startIndex: o.startIndex,
        limit: QUEUE_MAX_SIZE,
        sortBy: [sort.sort],
        sortOrder: [sort.direction],
        excludeLocationTypes: ['Virtual'],
        ...filterParams(f),
        ...(f.includeItemTypes?.length ? { includeItemTypes: f.includeItemTypes } : {}),
      })
      return { ok: true, entries: await withParts(res.data.Items ?? []) }
    }
    case 'Movie':
    case 'Video':
    case 'MusicVideo':
    case 'Trailer': {
      const entries: QueueEntry[] = [{ kind: 'media', item }]
      if ((item.PartCount ?? 0) > 1 && id) {
        const parts = (await getVideoApi(api).getAdditionalPart({ itemId: id, userId })).data.Items ?? []
        entries.push(...parts.map((p) => ({ kind: 'media' as const, item: p })))
      }
      return { ok: true, entries }
    }
    default:
      return { ok: false, message: `Unsupported type: ${item.Type}` }
  }
}

function filterParams(f: QueueFilter) {
  return {
    genreIds: f.genreIds,
    studioIds: f.studioIds,
    personIds: f.personIds,
    years: f.years,
    officialRatings: f.officialRatings,
    tags: f.tags,
    isPlayed: f.isPlayed,
    isFavorite: f.isFavorite,
    filters: f.filters,
    minCommunityRating: f.minCommunityRating,
    is4K: f.is4K,
    isHd: f.isHd,
    is3D: f.is3D,
    videoTypes: f.videoTypes,
  }
}

async function fromEpisode(
  api: Api,
  seriesId: string,
  episodeId: string | null,
  seasonId: string | null,
  shuffled: boolean,
  userId: string | undefined,
): Promise<QueueEntry[]> {
  const res = await getShowApi(api).getEpisodes({
    seriesId,
    seasonId: seasonId ?? undefined,
    userId,
    fields: DETAIL_FIELDS,
    startItemId: episodeId ?? undefined,
    sortBy: shuffled ? 'Random' : undefined,
    limit: QUEUE_MAX_SIZE,
  })
  const entries = await addParts(api, res.data.Items ?? [], userId)
  const norm = (s: string | null | undefined) => s?.replace(/-/g, '').toLowerCase()
  const start = episodeId ? Math.max(0, entries.findIndex((e) => norm(e.item.Id) === norm(episodeId))) : 0
  return entries.slice(start)
}

/** `convertAndAddParts`: drop virtual items, expand multi-part videos. */
async function addParts(api: Api, items: BaseItemDto[], userId: string | undefined): Promise<QueueEntry[]> {
  const out: QueueEntry[] = []
  for (const it of items) {
    if (it.LocationType === 'Virtual') continue
    out.push({ kind: 'media', item: it })
    if ((it.PartCount ?? 0) > 1 && it.Id) {
      const parts = (await getVideoApi(api).getAdditionalPart({ itemId: it.Id, userId })).data.Items ?? []
      out.push(...parts.map((p) => ({ kind: 'media' as const, item: p })))
    }
  }
  return out
}
