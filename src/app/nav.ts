// Typed path builders for every route in routes.tsx. Never hand-build app URLs elsewhere.
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useMemo } from 'react'
import { useNavigate, type NavigateOptions } from 'react-router'

type Query = Record<string, string | number | boolean | null | undefined>

function withQuery(path: string, query?: Query): string {
  if (!query) return path
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === false || v === '') continue
    q.set(k, v === true ? '1' : String(v))
  }
  const s = q.toString()
  return s ? `${path}?${s}` : path
}

const seg = (s: string) => encodeURIComponent(s)

/** Settings screens (upstream PreferenceScreenOption), lower-case in URLs. */
export type SettingsScreen =
  | 'basic'
  | 'screensaver'
  | 'skip_segments'
  | 'hdr_formats'

/** FilteredCollection parameters (Destination.FilteredCollection). */
export interface FilteredCollectionParams {
  /** GENRE or STUDIO */
  parentType: 'Genre' | 'Studio'
  /** genre/studio item id */
  filterId: string
  collectionType?: string | null
  recursive?: boolean
  /** `GetItemsFilter.includeItemTypes` of the destination (genre/studio tabs pass Movie or Series), comma-joined as `types`. */
  includeItemTypes?: readonly string[] | null
}

/** Location state accepted by /grid (Destination.ItemGrid). Pages read it with `useLocation().state`. */
export interface ItemGridState {
  /** i18n key or literal title */
  title: string
  titleIsKey?: boolean
  /** request kind understood by the grid page (e.g. 'favorites', 'person-items', 'similar') */
  request: string
  params?: Record<string, unknown>
  initialPosition?: number
}

export const nav = {
  // setup
  servers: (next?: string | null) => withQuery('/setup/servers', { next }),
  users: (next?: string | null) => withQuery('/setup/users', { next }),
  login: (opts: { username?: string; password?: boolean; next?: string | null } = {}) =>
    withQuery('/setup/login', { username: opts.username, mode: opts.password ? 'password' : undefined, next: opts.next }),

  // shell
  home: () => '/',
  homeSettings: () => '/home/settings',
  moreHomeRow: (rowId: string | number, opts: { position?: number } = {}) =>
    withQuery(`/home/row/${seg(String(rowId))}`, { position: opts.position }),
  search: (query?: string) => withQuery('/search', { q: query }),
  favorites: () => '/favorites',
  item: (itemId: string, opts: { song?: string } = {}) => withQuery(`/item/${seg(itemId)}`, { song: opts.song }),
  /** SeriesOverview; season/episode are item ids (SeasonEpisodeIds) */
  series: (seriesId: string, opts: { season?: string | null; episode?: string | null } = {}) =>
    withQuery(`/series/${seg(seriesId)}`, { season: opts.season, episode: opts.episode }),
  library: (itemId: string, opts: { tab?: number | string } = {}) => withQuery(`/library/${seg(itemId)}`, { tab: opts.tab }),
  filtered: (itemId: string, p: FilteredCollectionParams) =>
    withQuery(`/library/${seg(itemId)}/filtered`, {
      type: p.parentType,
      filter: p.filterId,
      collectionType: p.collectionType,
      recursive: p.recursive,
      types: p.includeItemTypes?.length ? p.includeItemTypes.join(',') : undefined,
    }),
  /** ItemGrid: pass the ItemGridState as navigation state (see useNav().grid) */
  grid: () => '/grid',
  recordings: (itemId: string) => `/recordings/${seg(itemId)}`,
  liveTv: () => '/livetv',
  discover: () => '/discover',
  discoverItem: (mediaType: 'movie' | 'tv' | 'person' | string, tmdbId: string | number) =>
    `/discover/${seg(mediaType)}/${seg(String(tmdbId))}`,
  discoverMore: (type: string) => `/discover/more/${seg(type)}`,

  // full screen
  /** Playback; t = start position in ms */
  play: (itemId: string, opts: { t?: number; transcode?: boolean; shuffle?: boolean } = {}) =>
    withQuery(`/play/${seg(itemId)}`, { t: opts.t ? Math.round(opts.t) : undefined, transcode: opts.transcode, shuffle: opts.shuffle }),
  /** PlaybackList (play/shuffle a series, season, box set, playlist, genre...) */
  playList: (
    itemId: string,
    opts: { index?: number; shuffle?: boolean; recursive?: boolean; sort?: string; order?: 'asc' | 'desc'; filter?: string } = {},
  ) =>
    withQuery(`/play/list/${seg(itemId)}`, {
      index: opts.index,
      shuffle: opts.shuffle,
      recursive: opts.recursive,
      sort: opts.sort,
      order: opts.order,
      filter: opts.filter,
    }),
  nowPlaying: () => '/now-playing',
  /** Slideshow (photos/SlideshowPage). `id` = the photo to open on (web), `sort`/`order` = the grid's sort. */
  slideshow: (
    parentId: string,
    opts: { index?: number; id?: string | null; start?: boolean; recursive?: boolean; filter?: string; sort?: string; order?: 'asc' | 'desc' } = {},
  ) =>
    withQuery(`/slideshow/${seg(parentId)}`, {
      index: opts.index,
      id: opts.id ?? undefined,
      start: opts.start,
      recursive: opts.recursive,
      sort: opts.sort,
      order: opts.order,
      filter: opts.filter,
    }),
  settings: (screen?: SettingsScreen) => (screen && screen !== 'basic' ? `/settings/${screen}` : '/settings'),
  subtitleSettings: (opts: { hdr?: boolean } = {}) => withQuery('/settings/subtitles', { hdr: opts.hdr }),
  /** one subject of Settings (web-only regrouping: src/features/settings/topics.ts) */
  settingsTopic: (topic: string) => `/settings/topic/${seg(topic)}`,
  license: () => '/license',
  debug: () => '/debug',

  // dev
  devGallery: () => '/dev/gallery',
  devLogin: (opts: { next?: string; server?: 'test' } = {}) => withQuery('/dev/login', { next: opts.next, server: opts.server }),
} as const

export type Nav = typeof nav

/**
 * `BaseItem.destination()` (W/data/model/BaseItem.kt, spec 02 §2.3): where a click on a card goes.
 */
export function itemDestination(
  item: Pick<
    BaseItemDto,
    'Id' | 'Type' | 'ExtraType' | 'SeasonId' | 'SeriesId' | 'ChannelId' | 'AlbumId' | 'CollectionType'
  >,
): string {
  const id = item.Id ?? ''
  if (item.ExtraType != null || item.Type === 'Trailer') return nav.play(id)
  switch (item.Type) {
    case 'Episode':
      return item.SeasonId && item.SeriesId ? nav.series(item.SeriesId, { season: item.SeasonId, episode: id }) : nav.item(id)
    case 'Season':
      return item.SeriesId ? nav.series(item.SeriesId, { season: id }) : nav.item(id)
    case 'TvChannel':
      return nav.play(id)
    case 'Program':
      return item.ChannelId ? nav.play(item.ChannelId) : nav.item(id)
    case 'Audio':
      return item.AlbumId ? nav.item(item.AlbumId, { song: id }) : nav.item(id)
    case 'CollectionFolder':
    case 'UserView':
    case 'Folder':
      return nav.library(id)
    default:
      return nav.item(id)
  }
}

type Navigating<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => string ? (...args: A) => void : never
}

export type NavActions = Navigating<Nav> & {
  /** navigate to a path built with nav.* */
  to: (path: string, options?: NavigateOptions) => void
  /** replace the current entry */
  replace: (path: string) => void
  /** browser Back (TV Back button) */
  back: () => void
  /** ItemGrid with its state */
  openGrid: (state: ItemGridState) => void
  /** card click */
  openItem: (item: Parameters<typeof itemDestination>[0]) => void
}

/** Navigation actions mirroring `nav`: `const go = useNav(); go.item(id)`. */
export function useNav(): NavActions {
  const navigate = useNavigate()
  return useMemo(() => {
    const bound = Object.fromEntries(
      Object.entries(nav).map(([k, fn]) => [
        k,
        (...args: unknown[]) => void navigate((fn as (...a: unknown[]) => string)(...args)),
      ]),
    ) as Navigating<Nav>
    return {
      ...bound,
      to: (path: string, options?: NavigateOptions) => void navigate(path, options),
      replace: (path: string) => void navigate(path, { replace: true }),
      back: () => void navigate(-1),
      openGrid: (state: ItemGridState) => void navigate(nav.grid(), { state }),
      openItem: (item) => void navigate(itemDestination(item)),
    }
  }, [navigate])
}
