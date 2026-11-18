// The Seerr provider of the main search page's "Discover" results (src/features/search/searchExtensions.ts,
// upstream SearchViewModel.searchSeerr): page 1 of Seerr's search, movies and TV only, as ready card props.
import { cardAvailability, fromSearch, seerrApi, useSeerrStore, yearOfDate } from '../../api/seerr'
import { getSession } from '../../api/session'
import { i18next } from '../../i18n'
import { registerSearchDiscoverProvider, type SearchDiscoverResult } from '../search/searchExtensions'
import { itemDestinationHref } from './links'
import { availabilityLabel } from './seerrText'

const TYPE_LABEL = { movie: 'movies', tv: 'tv_shows' } as const

/** Installs the provider app-wide (idempotent per call site; returns the uninstaller). */
export function installSearchDiscoverProvider(): () => void {
  return registerSearchDiscoverProvider({
    subscribe: (onChange) =>
      useSeerrStore.subscribe((s, prev) => {
        if (s.status !== prev.status || s.user?.id !== prev.user?.id || s.settings !== prev.settings) onChange()
      }),
    isActive: () => useSeerrStore.getState().status === 'linked',
    cacheKey: () => {
      const s = useSeerrStore.getState()
      return `${s.sessionKey ?? ''}:${s.user?.id ?? ''}:${s.settings?.cacheImages ? 1 : 0}`
    },
    search: async (query, signal) => {
      const settings = useSeerrStore.getState().settings
      const ctx = { jellyfinBaseUrl: getSession()?.api.basePath ?? null, settings }
      const t = (k: string, o?: Record<string, unknown>) => (o ? i18next.t(k, o) : i18next.t(k))
      const results = (await seerrApi.search(query.trim(), 1, { signal })).results ?? []
      return results
        .map((r) => fromSearch(ctx, r))
        .filter((i) => i.type === 'movie' || i.type === 'tv')
        .map(
          (i): SearchDiscoverResult => ({
            key: `${i.type}:${i.id}`,
            href: itemDestinationHref(i),
            card: {
              title: i.title,
              subtitle: (() => {
                const y = yearOfDate(i.releaseDate)
                return y != null ? String(y) : ''
              })(),
              posterSrc: i.posterUrl,
              mediaType: i.type,
              typeLabel: t(TYPE_LABEL[i.type as 'movie' | 'tv'], { count: 1 }),
              availability: cardAvailability(i.availability),
              availabilityLabel: availabilityLabel(i.availability, t),
            },
          }),
        )
    },
  })
}
