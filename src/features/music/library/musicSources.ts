// Grid sources of the music library tabs (CollectionFolderMusic.kt on CollectionFolderView). Albums and Songs use the
// library's `GET /Items` pager (browse `folderSource`); Artists pages `/Artists` or `/Artists/AlbumArtists`
// (CollectionFolderViewModel.createPager, GetItemsFilterOverride.ARTIST). Plus the Recommended tab's rows.
import type { Api } from '@jellyfin/sdk'
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import type { ArtistApiGetArtistsRequest } from '@jellyfin/sdk/lib/generated-client/api/artist-api'
import { getArtistApi } from '@jellyfin/sdk/lib/utils/api/artist-api'
import { qk } from '../../../api/queryKeys'
import type { GridSource } from '../../browse/components/LibraryGrid'
import type { RecommendedRow } from '../../browse/data/recommended'
import type { GridState } from '../../browse/data/useGridState'
import { filterYears, type GetItemsFilter } from '../../browse/model/filter'
import { letterBound, letterJumpIndex } from '../../browse/model/letterJump'
import { gridSortParams } from '../../browse/model/sort'
import type { ArtistSource } from '../../browse/model/viewOptions'
import { SLIM_ITEM_FIELDS } from '../../common/itemFields'

type ArtistParams = Omit<ArtistApiGetArtistsRequest, 'startIndex' | 'limit' | 'enableTotalRecordCount'>

const nonEmpty = <T>(v: T[] | null | undefined): T[] | undefined => (v && v.length > 0 ? v : undefined)

/**
 * `createGetArtistsRequest` / `createGetAlbumArtistsRequest` + `GetItemsFilter.applyTo(GetArtistsRequest)`: the
 * library as parent, Primary + Thumb images, the slim fields, and the filter's rating / favorite / genre / person /
 * studio / tag / official rating / year values (no played, video type or item type).
 */
export function artistParams(libraryId: string, userId: string, s: Pick<GridState, 'filter' | 'sort'>): ArtistParams {
  const f: GetItemsFilter = s.filter
  return {
    userId,
    parentId: libraryId,
    enableImageTypes: ['Primary', 'Thumb'],
    fields: SLIM_ITEM_FIELDS,
    minCommunityRating: f.minCommunityRating ?? undefined,
    isFavorite: f.favorite ?? undefined,
    genreIds: nonEmpty(f.genres),
    personIds: nonEmpty(f.persons),
    studioIds: nonEmpty(f.studios),
    tags: nonEmpty(f.tags),
    officialRatings: nonEmpty(f.officialRatings),
    years: filterYears(f),
    // Upstream bug fixed: CollectionFolderView.kt createGetArtistsRequest drops the chosen sort, so the Artists
    // tab's sort button changes nothing on the TV.
    ...gridSortParams(s.sort, 'music'),
  }
}

/** `ViewOptions.artistSource` (`ViewOptionsExtras.MusicLibrary`), default ARTIST. */
export const artistSourceOf = (s: GridState): ArtistSource => s.viewOptions.artistSource ?? 'ARTIST'

/** The Artists tab's pager and its letter index, both on the endpoint the artist source selects. */
export function artistGridSource(api: Api, userId: string, library: BaseItemDto): (s: GridState) => GridSource {
  const libraryId = library.Id ?? ''
  return (s) => {
    const source = artistSourceOf(s)
    const params = artistParams(libraryId, userId, s)
    const artists = getArtistApi(api)
    const call = (p: ArtistApiGetArtistsRequest, signal?: AbortSignal) =>
      source === 'ALBUM_ARTIST' ? artists.getAlbumArtists(p, { signal }) : artists.getArtists(p, { signal })
    return {
      key: qk('music', 'artists', source, params),
      deps: ['favorite', 'played', 'deleted'],
      fetchPage: async (startIndex, limit, withTotal, signal) => {
        const res = await call({ ...params, startIndex, limit, enableTotalRecordCount: withTotal }, signal)
        return { items: res.data.Items ?? [], total: withTotal ? (res.data.TotalRecordCount ?? null) : null }
      },
      // positionOfLetter: the count comes from the same endpoint the pager pages through
      letterIndex: async (letter, total) => {
        const direction = s.sort.sort === 'SortName' ? s.sort.direction : 'Ascending'
        const res = await call({
          ...params,
          enableImageTypes: undefined,
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

/** `getRecommendedRows` (RecommendedMusic.kt): the library's albums, sorted per row. */
export function musicRecommendedRows(parentId: string, userId: string): RecommendedRow[] {
  const base = { userId, parentId, fields: SLIM_ITEM_FIELDS, includeItemTypes: ['MusicAlbum' as const], recursive: true, enableUserData: true }
  return [
    {
      titleKey: 'recently_released',
      request: 'items',
      query: { ...base, sortBy: ['PremiereDate', 'SortName'], sortOrder: ['Descending', 'Ascending'], maxPremiereDate: new Date().toISOString() },
    },
    { titleKey: 'recently_added', request: 'items', query: { ...base, sortBy: ['DateCreated'], sortOrder: ['Descending'] } },
    { titleKey: 'top_rated', request: 'items', query: { ...base, sortBy: ['CommunityRating'], sortOrder: ['Descending'] } },
  ]
}
