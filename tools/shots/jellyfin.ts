// Minimal read-only Jellyfin client for scene resolution (plain fetch; the crawler never writes to the server).
// It uses the access token the browser session obtained through /dev/login, so manifest scenes resolve real ids
// without baking any server-specific id into tools/shots/scenes.ts.

export interface JfItem {
  Id: string
  Name?: string
  Type?: string
  CollectionType?: string
  SeriesId?: string
  SeasonId?: string
  ParentId?: string
  ChildCount?: number
  RecursiveItemCount?: number
  IndexNumber?: number
  ParentIndexNumber?: number
  UserData?: { PlaybackPositionTicks?: number; Played?: boolean }
  MediaType?: string
  IsFolder?: boolean
  People?: { Id: string; Name?: string; Type?: string }[]
  GenreItems?: { Id: string; Name?: string }[]
  Studios?: { Id?: string; Name?: string }[]
}

type Params = Record<string, string | number | boolean | undefined>

export interface JfClient {
  baseUrl: string
  userId: string
  /** GET any path under the server, returns parsed JSON or null on 404/error */
  get<T>(path: string, params?: Params): Promise<T | null>
  /** GET /Items with the user context; returns [] on failure */
  items(params: Params): Promise<JfItem[]>
  first(params: Params): Promise<JfItem | null>
  /** memoized lookup: the same key resolves once per run */
  memo<T>(key: string, load: () => Promise<T>): Promise<T>

  // typical subjects
  views(): Promise<JfItem[]>
  libraryOf(collectionType: string): Promise<JfItem | null>
  movie(): Promise<JfItem | null>
  /** series with the most seasons (checks the first 25 series) */
  seriesWithSeasons(): Promise<{ series: JfItem; seasons: JfItem[] } | null>
  episodeOf(series: JfItem): Promise<{ season: JfItem; episode: JfItem } | null>
  /** an item with a resume point (episode preferred); falls back to null */
  resumable(): Promise<JfItem | null>
  anyEpisode(): Promise<JfItem | null>
  boxSet(): Promise<JfItem | null>
  playlist(): Promise<JfItem | null>
  album(): Promise<JfItem | null>
  artist(): Promise<JfItem | null>
  audio(): Promise<JfItem | null>
  photoAlbum(): Promise<JfItem | null>
  photo(): Promise<JfItem | null>
  person(): Promise<JfItem | null>
  genre(): Promise<JfItem | null>
  studio(): Promise<JfItem | null>
  recordingsFolder(): Promise<JfItem | null>
  channel(): Promise<JfItem | null>
}

export function createJfClient(baseUrl: string, token: string, userId: string): JfClient {
  const cache = new Map<string, Promise<unknown>>()
  const auth = `MediaBrowser Client="Wholphin Web Shots", Device="shots crawler", DeviceId="wholphin-web-shots", Version="1", Token="${token}"`

  async function get<T>(path: string, params: Params = {}): Promise<T | null> {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v))
    const url = `${baseUrl}${path}${q.size ? `?${q}` : ''}`
    try {
      const res = await fetch(url, { headers: { Authorization: auth, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) })
      if (!res.ok) return null
      return (await res.json()) as T
    } catch {
      return null
    }
  }

  async function items(params: Params): Promise<JfItem[]> {
    const r = await get<{ Items?: JfItem[] }>('/Items', { userId, recursive: true, enableTotalRecordCount: false, ...params })
    return r?.Items ?? []
  }

  const memo = <T,>(key: string, load: () => Promise<T>): Promise<T> => {
    let p = cache.get(key) as Promise<T> | undefined
    if (!p) {
      p = load()
      cache.set(key, p)
    }
    return p
  }
  const first = async (params: Params) => (await items({ limit: 1, ...params }))[0] ?? null
  const byType = (key: string, params: Params) => memo(key, () => first(params))

  const client: JfClient = {
    baseUrl,
    userId,
    get,
    items,
    first,
    memo,
    views: () =>
      memo('views', async () => (await get<{ Items?: JfItem[] }>('/UserViews', { userId }))?.Items ?? []),
    libraryOf: (ct) => memo(`lib:${ct}`, async () => (await client.views()).find((v) => v.CollectionType === ct) ?? null),
    movie: () => byType('movie', { includeItemTypes: 'Movie', sortBy: 'SortName' }),
    seriesWithSeasons: () =>
      memo('series', async () => {
        const list = await items({ includeItemTypes: 'Series', sortBy: 'SortName', limit: 25 })
        let best: { series: JfItem; seasons: JfItem[] } | null = null
        for (const s of list) {
          const r = await get<{ Items?: JfItem[] }>(`/Shows/${s.Id}/Seasons`, { userId })
          const seasons = r?.Items ?? []
          if (!best || seasons.length > best.seasons.length) best = { series: s, seasons }
          if (seasons.length >= 3) break
        }
        return best
      }),
    episodeOf: (series) =>
      memo(`ep:${series.Id}`, async () => {
        const r = await get<{ Items?: JfItem[] }>(`/Shows/${series.Id}/Seasons`, { userId })
        const season = (r?.Items ?? []).find((s) => (s.IndexNumber ?? 0) > 0) ?? r?.Items?.[0]
        if (!season) return null
        const eps = await get<{ Items?: JfItem[] }>(`/Shows/${series.Id}/Episodes`, { userId, seasonId: season.Id, limit: 3 })
        const episode = eps?.Items?.[1] ?? eps?.Items?.[0]
        return episode ? { season, episode } : null
      }),
    resumable: () =>
      memo('resume', async () => {
        const r = await get<{ Items?: JfItem[] }>('/UserItems/Resume', { userId, limit: 10, mediaTypes: 'Video' })
        const list = r?.Items ?? []
        return list.find((i) => i.Type === 'Episode') ?? list[0] ?? null
      }),
    anyEpisode: () => byType('anyEpisode', { includeItemTypes: 'Episode', sortBy: 'SortName' }),
    boxSet: () => byType('boxset', { includeItemTypes: 'BoxSet' }),
    playlist: () => byType('playlist', { includeItemTypes: 'Playlist' }),
    album: () => byType('album', { includeItemTypes: 'MusicAlbum', sortBy: 'SortName' }),
    artist: () =>
      memo('artist', async () => (await get<{ Items?: JfItem[] }>('/Artists/AlbumArtists', { userId, limit: 1 }))?.Items?.[0] ?? null),
    audio: () => byType('audio', { includeItemTypes: 'Audio' }),
    photoAlbum: () => byType('photoAlbum', { includeItemTypes: 'PhotoAlbum' }),
    photo: () => byType('photo', { includeItemTypes: 'Photo' }),
    person: () =>
      memo('person', async () => (await get<{ Items?: JfItem[] }>('/Persons', { userId, limit: 1, personTypes: 'Actor' }))?.Items?.[0] ?? null),
    genre: () =>
      memo('genre', async () => (await get<{ Items?: JfItem[] }>('/Genres', { userId, limit: 1, includeItemTypes: 'Movie,Series' }))?.Items?.[0] ?? null),
    studio: () =>
      memo('studio', async () => (await get<{ Items?: JfItem[] }>('/Studios', { userId, limit: 1, includeItemTypes: 'Movie,Series' }))?.Items?.[0] ?? null),
    recordingsFolder: () =>
      memo('recfolder', async () => (await get<{ Items?: JfItem[] }>('/LiveTv/Recordings/Folders', { userId }))?.Items?.[0] ?? null),
    channel: () =>
      memo('channel', async () => (await get<{ Items?: JfItem[] }>('/LiveTv/Channels', { userId, limit: 1 }))?.Items?.[0] ?? null),
  }
  return client
}
