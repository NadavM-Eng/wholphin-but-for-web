// Jellyfin API helper for the throwaway test server: look up subjects for a test, verify what the UI changed,
// and put user data back afterwards. Never point it at a real server (env.ts refuses port 8096).
import { testServerEnv } from './env'

export interface UserData {
  IsFavorite?: boolean
  Played?: boolean
  PlaybackPositionTicks?: number
  PlayCount?: number
  LastPlayedDate?: string | null
}

export interface Item {
  Id: string
  Name?: string
  Type?: string
  SeriesId?: string
  SeriesName?: string
  CollectionType?: string
  UserData?: UserData
  BackdropImageTags?: string[]
  ParentBackdropImageTags?: string[]
}

type Query = Record<string, string | number | boolean | undefined>

const CLIENT = 'Wholphin Web e2e'

/** `MediaBrowser` authorization header; the device id decides which server session a token belongs to. */
export function authHeader(deviceId: string, token?: string): string {
  return `MediaBrowser Client="${CLIENT}", Device="e2e api", DeviceId="${deviceId}", Version="1"${token ? `, Token="${token}"` : ''}`
}

export class JellyfinApi {
  readonly baseUrl: string
  readonly userId: string
  private readonly token: string
  private readonly deviceId: string
  /** user data captured by `snapshot()`, put back by `restoreAll()` */
  private readonly snapshots = new Map<string, UserData>()

  private constructor(baseUrl: string, userId: string, token: string, deviceId: string) {
    this.baseUrl = baseUrl
    this.userId = userId
    this.token = token
    this.deviceId = deviceId
  }

  /**
   * Signs in as the seeded test user (or `user2`). `deviceId` should be unique per concurrent client: Jellyfin
   * revokes the previous token of a user on the same device id when it issues a new one.
   */
  static async signIn(deviceId: string, which: 'user' | 'user2' = 'user'): Promise<JellyfinApi> {
    const env = testServerEnv()
    const res = await fetch(`${env.url}/Users/AuthenticateByName`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader(deviceId) },
      body: JSON.stringify(which === 'user' ? { Username: env.user, Pw: env.password } : { Username: env.user2, Pw: env.password2 }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`e2e api: sign-in as the ${which === 'user' ? 'test user' : 'second test user'} failed (HTTP ${res.status})`)
    const body = (await res.json()) as { AccessToken: string; User: { Id: string } }
    return new JellyfinApi(env.url, body.User.Id, body.AccessToken, deviceId)
  }

  private url(path: string, query: Query = {}): string {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) if (v !== undefined) q.set(k, String(v))
    return `${this.baseUrl}${path}${q.size ? `?${q}` : ''}`
  }

  async request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, opts: { query?: Query; body?: unknown } = {}): Promise<T> {
    const res = await fetch(this.url(path, opts.query), {
      method,
      headers: {
        Authorization: authHeader(this.deviceId, this.token),
        Accept: 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : null),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`e2e api: ${method} ${path} -> HTTP ${res.status}`)
    const type = res.headers.get('content-type') ?? ''
    return (type.includes('json') ? await res.json() : null) as T
  }

  get<T>(path: string, query?: Query): Promise<T> {
    return this.request<T>('GET', path, { query })
  }

  // ---- lookups ------------------------------------------------------------------------------

  /** GET /Items for this user (recursive). */
  async items(query: Query): Promise<Item[]> {
    const r = await this.get<{ Items?: Item[] }>('/Items', { userId: this.userId, recursive: true, enableTotalRecordCount: false, ...query })
    return r.Items ?? []
  }

  /** The item of `type` whose name is exactly `name` (e.g. findItem('Movie', 'Spring')). Throws when absent. */
  async findItem(type: string, name: string): Promise<Item> {
    const found = (await this.items({ includeItemTypes: type, searchTerm: name, limit: 20 })).find((i) => i.Name === name)
    if (!found) throw new Error(`e2e api: no ${type} named "${name}" on the test server (reseed with npm run ts:reset?)`)
    return found
  }

  findMovie(name: string): Promise<Item> {
    return this.findItem('Movie', name)
  }

  findSeries(name: string): Promise<Item> {
    return this.findItem('Series', name)
  }

  async item(id: string): Promise<Item> {
    return this.get<Item>(`/Items/${id}`, { userId: this.userId })
  }

  /** Continue watching (video), the list Home's "Continue watching" row merges with Next up. */
  async resumeItems(limit = 20): Promise<Item[]> {
    const r = await this.get<{ Items?: Item[] }>('/UserItems/Resume', { userId: this.userId, limit, mediaTypes: 'Video', enableTotalRecordCount: false })
    return r.Items ?? []
  }

  /** First resume item matching `name` (item name or series name). */
  async findResumeItem(name: string): Promise<Item> {
    const found = (await this.resumeItems()).find((i) => i.Name === name || i.SeriesName === name)
    if (!found) throw new Error(`e2e api: no resume item "${name}" for the test user (reseed with npm run ts:reset?)`)
    return found
  }

  async nextUp(limit = 20): Promise<Item[]> {
    const r = await this.get<{ Items?: Item[] }>('/Shows/NextUp', { userId: this.userId, limit, enableResumable: false, enableTotalRecordCount: false })
    return r.Items ?? []
  }

  /** The user's libraries, in server order (what the nav drawer lists). */
  async userViews(): Promise<Item[]> {
    const r = await this.get<{ Items?: Item[] }>('/UserViews', { userId: this.userId })
    return r.Items ?? []
  }

  async userData(itemId: string): Promise<UserData> {
    return this.get<UserData>(`/UserItems/${itemId}/UserData`, { userId: this.userId })
  }

  // ---- writes (always paired with snapshot/restore) -----------------------------------------

  /** Remembers the item's user data so `restoreAll()` can put it back after the test changed it. */
  async snapshot(itemId: string): Promise<UserData> {
    const data = await this.userData(itemId)
    if (!this.snapshots.has(itemId)) this.snapshots.set(itemId, data)
    return data
  }

  async setUserData(itemId: string, data: UserData): Promise<void> {
    await this.request('POST', `/UserItems/${itemId}/UserData`, {
      query: { userId: this.userId },
      body: {
        IsFavorite: data.IsFavorite ?? false,
        Played: data.Played ?? false,
        PlaybackPositionTicks: data.PlaybackPositionTicks ?? 0,
        PlayCount: data.PlayCount ?? 0,
        LastPlayedDate: data.LastPlayedDate ?? null,
      },
    })
  }

  /** Puts back every snapshotted item; called by the fixture after each test. */
  async restoreAll(): Promise<void> {
    for (const [id, data] of this.snapshots) await this.setUserData(id, data)
    this.snapshots.clear()
  }

  /** Approves a Quick Connect code shown by the app, as the test user would on another device. */
  async authorizeQuickConnect(code: string): Promise<void> {
    await this.request('POST', '/QuickConnect/Authorize', { query: { code, userId: this.userId } })
  }

  /** Revokes an access token the app obtained (keeps the server's device list from growing). */
  async revoke(token: string): Promise<void> {
    await fetch(this.url('/Sessions/Logout'), {
      method: 'POST',
      headers: { Authorization: authHeader(this.deviceId, token) },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {})
  }

  /** Ends this helper's own session. */
  async dispose(): Promise<void> {
    await this.revoke(this.token)
  }
}
