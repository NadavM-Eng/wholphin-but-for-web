// `HomeDataService.fetchDataForRow` (W/services/HomeDataService.kt:82-700) and
// `LatestNextUpService` (getResume / getNextUp / buildCombined): the exact requests upstream sends.
import type { Api } from '@jellyfin/sdk'
import type { BaseItemDto, BaseItemDtoQueryResult, UserDto } from '@jellyfin/sdk/lib/generated-client/models'
import { getArtistApi } from '@jellyfin/sdk/lib/utils/api/artist-api'
import { getGenreApi } from '@jellyfin/sdk/lib/utils/api/genre-api'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { getLiveTvApi } from '@jellyfin/sdk/lib/utils/api/live-tv-api'
import { getPersonApi } from '@jellyfin/sdk/lib/utils/api/person-api'
import { getShowApi } from '@jellyfin/sdk/lib/utils/api/show-api'
import { getStudioApi } from '@jellyfin/sdk/lib/utils/api/studio-api'
import { getItemImageUrl } from '../../../api/images'
import { nav } from '../../../app/nav'
import { mapLimited } from '../../common/concurrency'
import { lastPlayedOf } from '../../common/datePlayed'
import { getRemovedNextUp, keepInNextUp } from '../../common/displayPreferences'
import { fetchGenreImages } from '../../common/genreImages'
import { HOME_ITEM_FIELDS, HOME_ITEM_FIELDS_BOX_SETS, PROGRAM_ITEM_FIELDS, SLIM_ITEM_FIELDS } from '../../common/itemFields'
import { typeNameKey } from '../../common/itemKinds'
import { findLibrary, kindForCollectionType, type Library } from '../../common/libraries'
import { getSuggestions, suggestionKindFor } from '../../common/suggestions'
import type { HomeRowConfig } from '../model/homeRowConfig'

/** A row title to translate at render time (titles follow the UI language). */
export type RowTitle = { key: string; p1?: string; p1Key?: string } | { text: string }

export type HomeRowData = {
  title: RowTitle
  items: BaseItemDto[]
  /** Upstream `imageUrlOverride` (genre / studio art), by item id. */
  imageOverrides?: Record<string, string | null>
  /** Upstream `destinationOverride` (genre / studio filtered pages), by item id. */
  hrefOverrides?: Record<string, string>
  /** `showViewMore` = items.size >= limit (CustomEndpoint: always). */
  showViewMore: boolean
  /** Total for paged requests (MoreHomeRow grid). */
  total?: number
  /** Suggestions still being computed (upstream `HomeRowLoadingState.Loading`). */
  pending?: boolean
}

export type RowFetchContext = {
  api: Api
  serverId: string
  userId: string
  user: UserDto
  libraries: readonly Library[]
  /** `max_items_per_row` (the MoreHomeRow grid passes 1000). */
  limit: number
  enableRewatching: boolean
  /** `max_days_next_up`, -1 = no limit. */
  maxDaysNextUp: number
  /** Upstream `isRefresh` (genre images come from cache only then). */
  isRefresh: boolean
  signal?: AbortSignal
  /** Paged grids: start of the page; requests that support it also return the total. */
  startIndex?: number
}

/** Error for a CustomEndpoint row (rendered as the row's error text). */
export class RowError extends Error {}

/** Row title known before the data arrives (`HomeSettingsService.resolve` without network). */
export function configTitle(c: HomeRowConfig, libraries: readonly Library[] | undefined): RowTitle {
  const libName = (id: string) => findLibrary(libraries, id)?.name
  const inLib = (key: string, fallback: string, id: string): RowTitle => {
    const n = libName(id)
    return n != null ? { key, p1: n } : { key: fallback }
  }
  switch (c.type) {
    case 'ContinueWatching':
    case 'ContinueWatchingCombined':
      return { key: 'continue_watching' }
    case 'NextUp':
      return { key: 'next_up' }
    case 'RecentlyAdded':
      return inLib('recently_added_in', 'recently_added', c.parentId)
    case 'RecentlyReleased':
      return inLib('recently_released_in', 'recently_released', c.parentId)
    case 'Genres':
      return inLib('genres_in', 'genres', c.parentId)
    case 'Studios':
      return inLib('studios_in', 'studios', c.parentId)
    case 'Favorite':
      return { key: 'favorite_items_title', p1Key: typeNameKey(c.kind) }
    case 'Recordings':
      return { key: 'active_recordings' }
    case 'TvPrograms':
      return { key: 'watch_live' }
    case 'TvChannels':
      return { key: 'channels' }
    case 'Suggestions':
      return { key: 'suggestions_for', p1: libName(c.parentId) ?? '' }
    case 'ByParent':
      return { text: libName(c.parentId) ?? '' }
    case 'GetItems':
      return { text: c.name }
    case 'CustomEndpoint':
      return { text: c.title }
  }
}

const libraryFields = (lib: Library | undefined) =>
  lib?.type === 'CollectionFolder' && lib.collectionType === 'boxsets' ? HOME_ITEM_FIELDS_BOX_SETS : HOME_ITEM_FIELDS

const result = (title: RowTitle, items: BaseItemDto[], limit: number, total?: number): HomeRowData => ({
  title,
  items,
  showViewMore: items.length >= limit,
  total,
})

function paging(ctx: RowFetchContext) {
  return ctx.startIndex != null ? { startIndex: ctx.startIndex, enableTotalRecordCount: true } : {}
}

/** `getResume` (LatestNextUpService.kt:52-74). */
export async function fetchResume(ctx: RowFetchContext): Promise<BaseItemDto[]> {
  const res = await getLibraryApi(ctx.api).getResumeItems(
    { userId: ctx.userId, fields: SLIM_ITEM_FIELDS, limit: ctx.limit, mediaTypes: ['Video'], enableTotalRecordCount: false },
    { signal: ctx.signal },
  )
  return res.data.Items ?? []
}

/** `getNextUp` (:79-127) including the removed-from-next-up filter. */
export async function fetchNextUp(ctx: RowFetchContext): Promise<BaseItemDto[]> {
  const [removed, res] = await Promise.all([
    getRemovedNextUp(ctx.api, ctx.userId),
    getShowApi(ctx.api).getNextUp(
      {
        userId: ctx.userId,
        fields: SLIM_ITEM_FIELDS,
        imageTypeLimit: 1,
        limit: ctx.limit,
        enableResumable: false,
        enableUserData: true,
        enableRewatching: ctx.enableRewatching,
        nextUpDateCutoff: ctx.maxDaysNextUp > 0 ? new Date(Date.now() - ctx.maxDaysNextUp * 86_400_000).toISOString() : undefined,
        enableTotalRecordCount: false,
      },
      { signal: ctx.signal },
    ),
  ])
  return (res.data.Items ?? []).filter((i) => keepInNextUp(i, removed))
}

/**
 * `buildCombined` (:134-165, SH-10): next-up items get their logical last-played time (3 lookups at a
 * time), resume items their own; resume wins for a shared id; no de-duplication; newest first, nulls last.
 */
export async function buildCombined(ctx: RowFetchContext, resume: BaseItemDto[], nextUp: BaseItemDto[]): Promise<BaseItemDto[]> {
  const stamps = new Map<string, number | null>()
  const nextUpTimes = await mapLimited(nextUp, 3, async (item) => {
    const p = item.SeriesId ? lastPlayedOf(ctx.api, ctx.userId, item) : null
    try {
      return p ? await p : null
    } catch {
      return null
    }
  })
  nextUp.forEach((item, i) => stamps.set(item.Id ?? '', nextUpTimes[i]))
  for (const r of resume) {
    const ms = r.UserData?.LastPlayedDate ? Date.parse(r.UserData.LastPlayedDate) : NaN
    stamps.set(r.Id ?? '', Number.isNaN(ms) ? null : ms)
  }
  const all = [...resume, ...nextUp]
  const key = (i: BaseItemDto) => stamps.get(i.Id ?? '') ?? null
  return all
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const x = key(a.item)
      const y = key(b.item)
      if (x === y) return a.index - b.index
      if (x == null) return 1
      if (y == null) return -1
      return y - x
    })
    .map((e) => e.item)
}

/** Items of a `/Items`-style response, typed. */
const items = (r: { data: BaseItemDtoQueryResult }) => r.data.Items ?? []

export async function fetchHomeRow(c: HomeRowConfig, ctx: RowFetchContext): Promise<HomeRowData> {
  const { api, userId, limit, signal } = ctx
  const title = configTitle(c, ctx.libraries)
  const lib = 'parentId' in c ? findLibrary(ctx.libraries, c.parentId) : undefined
  const opt = { signal }

  switch (c.type) {
    case 'ContinueWatching':
      return result(title, await fetchResume(ctx), limit)

    case 'NextUp':
      return result(title, await fetchNextUp(ctx), limit)

    case 'ContinueWatchingCombined': {
      const [resume, nextUp] = await Promise.all([fetchResume(ctx), fetchNextUp(ctx)])
      const combined = await buildCombined(ctx, resume, nextUp)
      return { title, items: combined.slice(0, limit), showViewMore: combined.length >= limit }
    }

    case 'Genres': {
      const res = await getGenreApi(api).getGenres({ parentId: c.parentId, userId, limit, ...paging(ctx) }, opt)
      const genres = items(res)
      const images = await fetchGenreImages(
        api,
        { userId, parentId: c.parentId, genreIds: genres.map((g) => g.Id ?? ''), includeItemTypes: null, useCache: ctx.isRefresh },
        signal,
      )
      const hrefOverrides: Record<string, string> = {}
      for (const g of genres) {
        hrefOverrides[g.Id ?? ''] = nav.filtered(c.parentId, {
          parentType: 'Genre',
          filterId: g.Id ?? '',
          collectionType: lib?.collectionType ?? null,
          recursive: true,
        })
      }
      return { ...result(title, genres, limit, res.data.TotalRecordCount), imageOverrides: images, hrefOverrides }
    }

    case 'Studios': {
      const res = await getStudioApi(api).getStudios({ parentId: c.parentId, userId, limit, includeItemTypes: ['Series'], ...paging(ctx) }, opt)
      const studios = items(res)
      const imageOverrides: Record<string, string | null> = {}
      const hrefOverrides: Record<string, string> = {}
      for (const s of studios) {
        const id = s.Id ?? ''
        // upstream builds the Thumb URL even without a tag; StudioCard falls back to the name on error
        imageOverrides[id] = getItemImageUrl(api.basePath, { Id: id, Type: s.Type, ImageTags: { Thumb: s.ImageTags?.Thumb ?? '' } }, 'Thumb')
        hrefOverrides[id] = nav.filtered(c.parentId, { parentType: 'Studio', filterId: id, recursive: true })
      }
      return { ...result(title, studios, limit, res.data.TotalRecordCount), imageOverrides, hrefOverrides }
    }

    case 'RecentlyAdded': {
      // isPlayed unset: the server applies the user's "hide played in latest" setting
      const res = await getLibraryApi(api).getLatestMedia(
        { fields: libraryFields(lib), imageTypeLimit: 1, parentId: c.parentId, groupItems: true, limit },
        opt,
      )
      return result(title, res.data ?? [], limit)
    }

    case 'RecentlyReleased': {
      const res = await getLibraryApi(api).getItems(
        {
          parentId: c.parentId,
          limit,
          sortBy: ['PremiereDate', 'SeriesSortName', 'AiredEpisodeOrder'],
          sortOrder: ['Descending', 'Ascending', 'Descending'],
          fields: libraryFields(lib),
          recursive: true,
          maxPremiereDate: new Date().toISOString(),
          isUnaired: false,
          ...paging(ctx),
        },
        opt,
      )
      return result(title, items(res), limit, res.data.TotalRecordCount)
    }

    case 'ByParent': {
      const s = c.sort
      const sortBy = s ? (s.sort === 'Random' ? ['SortName' as const, 'Random' as const] : s.sort === 'SortName' ? [s.sort] : [s.sort, 'SortName' as const]) : undefined
      const sortOrder = s ? (s.sort === 'Random' ? ['Ascending' as const, s.direction] : s.sort === 'SortName' ? [s.direction] : [s.direction, 'Ascending' as const]) : undefined
      // The parent lookup is not caught: a 404 makes the row empty (hidden), as upstream.
      const [parent, res] = await Promise.all([
        getLibraryApi(api).getItem({ itemId: c.parentId, userId }, opt),
        getLibraryApi(api).getItems(
          { userId, parentId: c.parentId, recursive: c.recursive, sortBy, sortOrder, limit, fields: libraryFields(lib), ...paging(ctx) },
          opt,
        ),
      ])
      const name = parent.data.Name
      return result(name ? { text: name } : { key: 'collection' }, items(res), limit, res.data.TotalRecordCount)
    }

    case 'GetItems': {
      const f = c.filter
      const res = await getLibraryApi(api).getItems(
        {
          sortBy: f.sortBy,
          sortOrder: f.sortOrder,
          ids: f.ids,
          minCommunityRating: f.minCommunityRating,
          minCriticRating: f.minCriticRating,
          recursive: f.recursive,
          searchTerm: f.searchTerm,
          parentId: f.parentId,
          includeItemTypes: f.includeItemTypes,
          isFavorite: f.isFavorite,
          isPlayed: f.isPlayed,
          officialRatings: f.officialRatings,
          tags: f.tags,
          years: f.years,
          personIds: f.personIds,
          minOfficialRating: f.minOfficialRating,
          hasOfficialRating: f.hasOfficialRating,
          studioIds: f.studioIds,
          genreIds: f.genreIds,
          userId,
          limit,
          fields: HOME_ITEM_FIELDS_BOX_SETS,
          ...paging(ctx),
        },
        opt,
      )
      return result(title, items(res), limit, res.data.TotalRecordCount)
    }

    case 'Favorite': {
      if (c.kind === 'Person') {
        const res = await getPersonApi(api).getPersons(
          { userId, limit, fields: HOME_ITEM_FIELDS, isFavorite: true, enableImages: true, enableImageTypes: ['Primary'], startIndex: ctx.startIndex },
          opt,
        )
        return result(title, items(res), limit, res.data.TotalRecordCount)
      }
      if (c.kind === 'MusicArtist') {
        const res = await getArtistApi(api).getArtists({ userId, limit, fields: HOME_ITEM_FIELDS, isFavorite: true, ...paging(ctx) }, opt)
        return result(title, items(res), limit, res.data.TotalRecordCount)
      }
      const res = await getLibraryApi(api).getItems(
        {
          userId,
          recursive: true,
          limit,
          fields: c.kind === 'BoxSet' ? HOME_ITEM_FIELDS_BOX_SETS : HOME_ITEM_FIELDS,
          includeItemTypes: [c.kind],
          isFavorite: true,
          ...paging(ctx),
        },
        opt,
      )
      return result(title, items(res), limit, res.data.TotalRecordCount)
    }

    case 'Recordings': {
      const res = await getLiveTvApi(api).getRecordings(
        {
          userId,
          isInProgress: true,
          fields: HOME_ITEM_FIELDS,
          limit,
          enableImages: true,
          enableUserData: true,
          enableTotalRecordCount: ctx.startIndex != null,
          startIndex: ctx.startIndex,
        },
        opt,
      )
      return result(title, items(res), limit, res.data.TotalRecordCount)
    }

    case 'TvPrograms': {
      const res = await getLiveTvApi(api).getPrograms(
        {
          getProgramsDto: {
            UserId: userId,
            Fields: PROGRAM_ITEM_FIELDS,
            Limit: limit,
            EnableUserData: true,
            EnableImages: true,
            EnableImageTypes: ['Primary', 'Logo'],
            ImageTypeLimit: 1,
            IsAiring: true,
            MinEndDate: new Date(Date.now() + 60_000).toISOString(),
            StartIndex: ctx.startIndex,
            EnableTotalRecordCount: ctx.startIndex != null,
          },
        },
        opt,
      )
      return result(title, items(res), limit, res.data.TotalRecordCount)
    }

    case 'TvChannels': {
      const res = await getLiveTvApi(api).getLiveTvChannels({ userId, fields: HOME_ITEM_FIELDS, limit, enableImages: true, startIndex: ctx.startIndex }, opt)
      return result(title, items(res), limit, res.data.TotalRecordCount)
    }

    case 'Suggestions': {
      const library = (await getLibraryApi(api).getItem({ itemId: c.parentId }, opt)).data
      const sTitle: RowTitle = { key: 'suggestions_for', p1: library.Name ?? '' }
      const kind = suggestionKindFor(library.CollectionType)
      if (!kind) throw new RowError(`Unsupported type ${library.CollectionType ?? 'null'}`)
      const list = await getSuggestions(api, { serverId: ctx.serverId, userId, parentId: c.parentId, kind, count: limit }, signal)
      return result(sTitle, list, limit)
    }

    case 'CustomEndpoint': {
      const list = await fetchCustomEndpoint(api, userId, c, signal)
      return { title, items: list, showViewMore: true }
    }
  }
}

/**
 * Resolves a custom-endpoint path against the server base URL, or null when the result would leave it.
 * The request carries the access token, so the check is on the parsed URL (same origin, under the base
 * path), not on the input text: WHATWG parsing turns inputs such as "\\host/x" or " //host/x" into
 * other hosts, and "../" can climb out of a sub-path.
 */
export function resolveCustomEndpointUrl(basePath: string, endpoint: string): URL | null {
  if (/^\s*[a-z][a-z0-9+.-]*:/i.test(endpoint)) return null
  let base: URL
  let url: URL
  try {
    base = new URL(basePath.replace(/\/+$/, '') + '/')
    url = new URL(endpoint.trim().replace(/^\/+/, ''), base)
  } catch {
    return null
  }
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return null
  if (url.username || url.password) return null
  return url
}

/** `fetchCustomEndpointItems` (:702-747): relative path only, userId + query params, extra headers. */
async function fetchCustomEndpoint(
  api: Api,
  userId: string,
  c: Extract<HomeRowConfig, { type: 'CustomEndpoint' }>,
  signal?: AbortSignal,
): Promise<BaseItemDto[]> {
  const url = resolveCustomEndpointUrl(api.basePath, c.endpoint)
  if (!url) throw new RowError(`Custom endpoint must be an path relative to Jellyfin baseUrl: ${c.endpoint}`)
  url.searchParams.set('userId', userId)
  for (const q of c.query ?? []) url.searchParams.set(q.key, q.value)
  const headers: Record<string, string> = { Authorization: api.authorizationHeader }
  for (const h of c.headers ?? []) headers[h.key] = h.value
  const res = await api.axiosInstance.get<BaseItemDtoQueryResult>(url.toString(), { headers, signal, validateStatus: () => true })
  if (res.status < 200 || res.status >= 300) throw new RowError(`HTTP ${res.status}`)
  return res.data?.Items ?? []
}

/** Rows whose grid page can request further pages with startIndex (upstream `ApiRequestPager`). */
export function isPagedRow(c: HomeRowConfig): boolean {
  switch (c.type) {
    case 'RecentlyReleased':
    case 'ByParent':
    case 'GetItems':
    case 'Recordings':
    case 'TvPrograms':
    case 'TvChannels':
    case 'Genres':
    case 'Studios':
      return true
    case 'Favorite':
      return true
    default:
      return false
  }
}

/** The library kind used for genre / studio filtered pages. */
export const libraryItemKind = (lib: Library | undefined) => kindForCollectionType(lib?.collectionType)
