// Favorites requests per type (FavoritesViewModel.createGetItemsRequest / createGetArtistsRequest /
// createGetPersonsRequest / positionOfLetter), page size 50.
import type { Api } from '@jellyfin/sdk'
import type { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models'
import { getArtistApi } from '@jellyfin/sdk/lib/utils/api/artist-api'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { getPersonApi } from '@jellyfin/sdk/lib/utils/api/person-api'
import { qk } from '../../../api/queryKeys'
import { SLIM_ITEM_FIELDS } from '../../common/itemFields'
import type { GridSource } from '../components/LibraryGrid'
import { applyFilter } from '../model/filter'
import { letterBound, letterJumpIndex } from '../model/letterJump'
import type { GridState } from './useGridState'

export const FAVORITES_PAGE_SIZE = 50
/** `/Persons` has no startIndex: one request returns every favorite person. */
const PERSONS_PAGE_SIZE = 100_000

export function favoritesSource(api: Api, userId: string, kind: BaseItemKind): (s: GridState) => GridSource {
  return (s) => {
    const f = applyFilter(s.filter, [kind])
    const sort = { sortBy: [s.sort.sort], sortOrder: [s.sort.direction] }
    if (kind === 'Person') {
      // createGetPersonsRequest: isFavorite + Slim fields only (no enableImageTypes)
      const params = { userId, isFavorite: s.filter.favorite ?? true, fields: SLIM_ITEM_FIELDS }
      return {
        key: qk('browse', 'favorites', kind, params),
        pageSize: PERSONS_PAGE_SIZE,
        deps: ['favorite', 'deleted'],
        fetchPage: async (_start, _limit, _withTotal, signal) => {
          const res = await getPersonApi(api).getPersons(params, { signal })
          const items = res.data.Items ?? []
          return { items, total: items.length }
        },
        // FavoritesViewModel.positionOfLetter returns null for people: the letter column still shows (and
        // marks the focused person's letter), a letter just jumps nowhere.
        letterIndex: () => Promise.resolve(-1),
      }
    }
    if (kind === 'MusicArtist') {
      const params = {
        userId,
        isFavorite: s.filter.favorite ?? true,
        fields: SLIM_ITEM_FIELDS,
        ...sort,
        minCommunityRating: f.minCommunityRating,
        genreIds: f.genreIds,
        personIds: f.personIds,
        studioIds: f.studioIds,
        tags: f.tags,
        officialRatings: f.officialRatings,
        years: f.years,
      }
      return {
        key: qk('browse', 'favorites', kind, params),
        pageSize: FAVORITES_PAGE_SIZE,
        deps: ['favorite', 'deleted'],
        fetchPage: async (startIndex, limit, withTotal, signal) => {
          const res = await getArtistApi(api).getArtists({ ...params, startIndex, limit, enableTotalRecordCount: withTotal }, { signal })
          return { items: res.data.Items ?? [], total: withTotal ? (res.data.TotalRecordCount ?? null) : null }
        },
        letterIndex: async (letter, total) => {
          const direction = s.sort.sort === 'SortName' ? s.sort.direction : 'Ascending'
          const res = await getArtistApi(api).getArtists({
            ...params,
            fields: undefined,
            nameLessThan: letterBound(letter, direction),
            limit: 0,
            enableTotalRecordCount: true,
            enableUserData: false,
          })
          return letterJumpIndex(res.data.TotalRecordCount, total, direction)
        },
      }
    }
    // applyTo(overwriteIncludeTypes = false): the tab's type stays; isFavorite comes from the filter (true)
    const params = { userId, isFavorite: true, recursive: true, fields: SLIM_ITEM_FIELDS, ...sort, ...f, includeItemTypes: [kind] }
    return {
      key: qk('browse', 'favorites', kind, params),
      pageSize: FAVORITES_PAGE_SIZE,
      deps: ['favorite', 'deleted'],
      fetchPage: async (startIndex, limit, withTotal, signal) => {
        const res = await getLibraryApi(api).getItems({ ...params, startIndex, limit, enableTotalRecordCount: withTotal }, { signal })
        return { items: res.data.Items ?? [], total: withTotal ? (res.data.TotalRecordCount ?? null) : null }
      },
      // FavoritesViewModel.positionOfLetter never set nameLessThan (the jump went to the end); fixed here.
      letterIndex: async (letter, total) => {
        const direction = s.sort.sort === 'SortName' ? s.sort.direction : 'Ascending'
        const res = await getLibraryApi(api).getItems({
          ...params,
          fields: undefined,
          nameLessThan: letterBound(letter, direction),
          limit: 0,
          enableTotalRecordCount: true,
          enableUserData: false,
        })
        return letterJumpIndex(res.data.TotalRecordCount, total, direction)
      },
    }
  }
}
