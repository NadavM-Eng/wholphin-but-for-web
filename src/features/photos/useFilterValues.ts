// Filter value sources (W/services/FilterOptionCache.kt, ItemFilterBy.kt): genres, parental ratings and years come
// from the server for the library (cached 1 h like upstream's 1 h expiry); the rest are static lists.
import { getFilterApi } from '@jellyfin/sdk/lib/utils/api/filter-api'
import { getGenreApi } from '@jellyfin/sdk/lib/utils/api/genre-api'
import { getLocalizationApi } from '@jellyfin/sdk/lib/utils/api/localization-api'
import { getYearApi } from '@jellyfin/sdk/lib/utils/api/year-api'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { qk } from '../../api/queryKeys'
import { useApi, useSession } from '../../api/session'
import { FILTER_VIDEO_TYPES, type FilterKind } from './photoQuery'

export interface FilterValueOption {
  label: string
  value: boolean | number | string
}

const HOUR = 60 * 60_000

async function load(kind: FilterKind, api: ReturnType<typeof useApi>, userId: string, parentId: string): Promise<FilterValueOption[]> {
  switch (kind) {
    case 'played':
    case 'favorite':
      // literal labels upstream (FilterValueOption("True", true) / ("False", false))
      return [
        { label: 'True', value: true },
        { label: 'False', value: false },
      ]
    case 'communityRating':
      return Array.from({ length: 10 }, (_, i) => ({ label: String(i + 1), value: i + 1 }))
    case 'videoTypes':
      return FILTER_VIDEO_TYPES.map((v) => ({ label: v, value: v }))
    case 'genres': {
      const res = await getGenreApi(api).getGenres({ parentId, userId })
      return (res.data.Items ?? []).filter((g) => g.Id && g.Name).map((g) => ({ label: g.Name!, value: g.Id! }))
    }
    case 'officialRatings': {
      const [ratings, filters] = await Promise.all([
        getLocalizationApi(api).getParentalRatings(),
        getFilterApi(api).getQueryFiltersLegacy({ parentId, userId }),
      ])
      const score = new Map<string, number>()
      for (const r of ratings.data) if (r.Name) score.set(r.Name, r.Value ?? 0)
      return (filters.data.OfficialRatings ?? [])
        .map((name) => ({ label: name, value: name, n: score.get(name) ?? 0 }))
        .sort((a, b) => a.n - b.n)
        .map(({ label, value }) => ({ label, value }))
    }
    case 'years':
    case 'decades': {
      const res = await getYearApi(api).getYears({ parentId, userId, sortBy: ['SortName'], sortOrder: ['Ascending'] })
      const years = (res.data.Items ?? []).map((y) => Number(y.Name)).filter((y) => Number.isInteger(y))
      if (kind === 'years') return years.map((y) => ({ label: String(y), value: y }))
      const decades = [...new Set(years.map((y) => Math.floor(y / 10) * 10))].sort((a, b) => a - b)
      return decades.map((d) => ({ label: `${d}'s`, value: d }))
    }
  }
}

export function useFilterValues(kind: FilterKind | null, parentId: string): UseQueryResult<FilterValueOption[]> {
  const api = useApi()
  const session = useSession()
  return useQuery({
    queryKey: qk('photos', 'filterValues', parentId, kind),
    enabled: kind != null && !!session,
    staleTime: HOUR,
    gcTime: HOUR,
    queryFn: () => load(kind!, api, session!.user.id, parentId),
  })
}
