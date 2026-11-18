// Filter value sources (W/services/FilterOptionCache.kt): fetched on demand when a filter's menu opens,
// cached per (user, parent library, filter) for 1 h.
import type { Api } from '@jellyfin/sdk'
import { getFilterApi } from '@jellyfin/sdk/lib/utils/api/filter-api'
import { getGenreApi } from '@jellyfin/sdk/lib/utils/api/genre-api'
import { getLocalizationApi } from '@jellyfin/sdk/lib/utils/api/localization-api'
import { getStudioApi } from '@jellyfin/sdk/lib/utils/api/studio-api'
import { getYearApi } from '@jellyfin/sdk/lib/utils/api/year-api'
import type { QueryClient } from '@tanstack/react-query'
import { qk } from '../../../api/queryKeys'
import { toast } from '../../../app/toast'
import { i18next } from '../../../i18n'
import { FILTER_VIDEO_TYPES, type FilterKind, type FilterValue } from '../model/filter'

const TTL_MS = 60 * 60_000

async function load(api: Api, userId: string, parentId: string | null, kind: FilterKind, signal?: AbortSignal): Promise<FilterValue[]> {
  const parent = parentId ?? undefined
  switch (kind) {
    case 'Genre': {
      const res = await getGenreApi(api).getGenres({ parentId: parent, userId }, { signal })
      return (res.data.Items ?? []).map((g) => ({ name: g.Name ?? '', value: g.Id ?? null }))
    }
    case 'Studio': {
      // FilterOptionCache always asks for series studios, whatever the library (spec 03 quirk 6)
      const res = await getStudioApi(api).getStudios({ parentId: parent, userId, includeItemTypes: ['Series'] }, { signal })
      return (res.data.Items ?? []).map((s) => ({ name: s.Name ?? '', value: s.Id ?? null }))
    }
    case 'Played':
    case 'Favorite':
      // literal "True" / "False" values (parsed with toBoolean)
      return [
        { name: 'True', value: null },
        { name: 'False', value: null },
      ]
    case 'OfficialRating': {
      const [ratings, filters] = await Promise.all([
        getLocalizationApi(api).getParentalRatings({ signal }),
        getFilterApi(api).getQueryFiltersLegacy({ parentId: parent, userId }, { signal }),
      ])
      const values = new Map<string, number>()
      for (const r of ratings.data) if (r.Name != null) values.set(r.Name, r.Value ?? 0)
      return (filters.data.OfficialRatings ?? [])
        .map((r) => ({ name: r, value: values.get(r) ?? 0 }))
        .sort((a, b) => a.value - b.value)
    }
    case 'VideoType':
      return FILTER_VIDEO_TYPES.map((v) => ({ name: v.label, value: v.value }))
    case 'Year':
    case 'Decade': {
      const res = await getYearApi(api).getYears({ parentId: parent, userId, sortBy: ['SortName'], sortOrder: ['Ascending'] }, { signal })
      // `name.toIntOrNull()`: non-numeric names are dropped
      const years = (res.data.Items ?? []).flatMap((y) => (/^[+-]?\d+$/.test(y.Name?.trim() ?? '') ? [Number(y.Name)] : []))
      if (kind === 'Year') return years.map((y) => ({ name: String(y), value: y }))
      const decades = [...new Set(years.map((y) => Math.floor(y / 10) * 10))].sort((a, b) => a - b)
      return decades.map((d) => ({ name: `${d}'s`, value: d }))
    }
    case 'CommunityRating':
      return Array.from({ length: 10 }, (_, i) => ({ name: String(i + 1), value: i + 1 }))
  }
}

/** Values of `kind` for the library `parentId` (null = whole server, favorites). Errors toast and give []. */
export async function getFilterValues(
  api: Api,
  qc: QueryClient,
  userId: string,
  parentId: string | null,
  kind: FilterKind,
): Promise<FilterValue[]> {
  try {
    return await qc.fetchQuery({
      queryKey: qk('browse', 'filterValues', parentId, kind),
      staleTime: TTL_MS,
      gcTime: TTL_MS,
      queryFn: ({ signal }) => load(api, userId, parentId, kind, signal),
    })
  } catch (err) {
    toast(i18next.t('web_error_occurred', { p1: err instanceof Error ? err.message : String(err) }))
    return []
  }
}
