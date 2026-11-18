// Jellyfin client wiring and the server/user session lifecycle. Port of W/data/ServerRepository.kt,
// W/data/MostRecentServer.kt and the setup view models (spec 06 §5).
import { Jellyfin, RecommendedServerInfoScore, type Api, type RecommendedServerInfo } from '@jellyfin/sdk'
import {
  ProductNameIssue,
  SlowResponseIssue,
  SystemInfoIssue,
  VersionMissingIssue,
  VersionOutdatedIssue,
  VersionUnsupportedIssue,
  type RecommendedServerIssue,
} from '@jellyfin/sdk/lib/models/recommended-server-issue'
import type { AuthenticationResult, PublicSystemInfo, UserDto } from '@jellyfin/sdk/lib/generated-client/models'
import { getAuthenticationApi } from '@jellyfin/sdk/lib/utils/api/authentication-api'
import { getSessionApi } from '@jellyfin/sdk/lib/utils/api/session-api'
import { getSystemApi } from '@jellyfin/sdk/lib/utils/api/system-api'
import { getUserApi } from '@jellyfin/sdk/lib/utils/api/user-api'
import { isUuid, normalizeId } from '../lib/ids'
import { readString, writeString } from '../lib/storage'
import {
  getServer,
  getUser,
  isProtected,
  patchUser,
  upsertServer,
  upsertUser,
  userKey,
  useSessionStore,
  type CurrentSession,
  type SavedServer,
  type SavedUser,
} from '../stores/session'
import { getAppConfig, loadAppConfig } from './config'

export type { CurrentSession, SavedServer, SavedUser } from '../stores/session'

/** Timeout for reachability probes and setup calls (upstream: 6 s request/connect/socket). */
export const PROBE_TIMEOUT_MS = 6000
/** Quick Connect state polling interval (SwitchUserViewModel). */
export const QUICK_CONNECT_POLL_MS = 5000

// ---------------------------------------------------------------------------------------------
// Client identity (spec 06 §5.9)

const DEVICE_ID_KEY = 'wholphin.deviceId'

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().replace(/-/g, '')
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

/** Stable random id per browser profile. */
export function getDeviceId(): string {
  let id = readString(DEVICE_ID_KEY)
  if (!id) {
    id = randomId()
    writeString(DEVICE_ID_KEY, id)
  }
  return id
}

/** "Chrome on Windows" style name from a user agent string. */
export function deviceNameFromUserAgent(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /SamsungBrowser\//.test(ua)
          ? 'Samsung Internet'
          : /Chrome\/|CriOS\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Browser'
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPod/.test(ua)
        ? 'iOS'
        : /iPad/.test(ua)
          ? 'iPadOS'
          : /CrOS/.test(ua)
            ? 'ChromeOS'
            : /Mac OS X|Macintosh/.test(ua)
              ? 'macOS'
              : /Linux/.test(ua)
                ? 'Linux'
                : null
  return os ? `${browser} on ${os}` : browser
}

export const CLIENT_NAME = 'Wholphin Web'
export const CLIENT_VERSION = __APP_VERSION__

export const jellyfin = new Jellyfin({
  clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION },
  deviceInfo: {
    id: getDeviceId(),
    name: typeof navigator === 'undefined' ? 'Browser' : deviceNameFromUserAgent(navigator.userAgent),
  },
})

// ---------------------------------------------------------------------------------------------
// Accessors

/** Current session or null (non-React). */
export function getSession(): CurrentSession | null {
  return useSessionStore.getState().current
}

/** SDK instance for the signed-in user (non-React). Throws when signed out. */
export function getApi(): Api {
  const s = getSession()
  if (!s) throw new Error('No Jellyfin session')
  return s.api
}

/** Current session (re-renders on change); null when signed out. */
export function useSession(): CurrentSession | null {
  return useSessionStore((s) => s.current)
}

/** SDK instance for the signed-in user. Throws if there is no session (pages under AppShell always have one). */
export function useApi(): Api {
  const s = useSession()
  if (!s) throw new Error('useApi() used without a Jellyfin session')
  return s.api
}

// ---------------------------------------------------------------------------------------------
// Errors

export type SessionErrorKind =
  | 'invalid-url'
  | 'unreachable'
  | 'invalid-server-info'
  | 'unsupported-version'
  | 'invalid-response'
  | 'invalid-credentials'
  | 'expired'
  | 'forbidden'
  | 'cancelled'
  | 'error'

export interface TriedAddress {
  address: string
  issues: Array<'invalid-server-info' | 'unreachable' | 'unsupported-version'>
}

export class SessionError extends Error {
  kind: SessionErrorKind
  tried: TriedAddress[]
  status: number | null
  constructor(kind: SessionErrorKind, message?: string, opts: { tried?: TriedAddress[]; status?: number | null } = {}) {
    super(message ?? kind)
    this.name = 'SessionError'
    this.kind = kind
    this.tried = opts.tried ?? []
    this.status = opts.status ?? null
  }
}

function httpStatus(err: unknown): number | null {
  const s = (err as { response?: { status?: unknown } } | null)?.response?.status
  return typeof s === 'number' ? s : null
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function toSessionError(err: unknown): SessionError {
  if (err instanceof SessionError) return err
  const status = httpStatus(err)
  if (status === 401) return new SessionError('expired', errorMessage(err), { status })
  if (status === 403) return new SessionError('forbidden', errorMessage(err), { status })
  if (status == null) return new SessionError('unreachable', errorMessage(err))
  return new SessionError('error', errorMessage(err), { status })
}

// ---------------------------------------------------------------------------------------------
// 401 handling: drop the rejected token and fall back to the user list

let interceptorInstalled = false

function installUnauthorizedInterceptor() {
  if (interceptorInstalled) return
  interceptorInstalled = true
  // Every SDK Api shares axios' global instance unless one is passed, so one interceptor covers all calls.
  jellyfin.createApi('http://localhost').axiosInstance.interceptors.response.use(undefined, (err: unknown) => {
    const cur = useSessionStore.getState().current
    if (httpStatus(err) === 401 && cur?.user.accessToken) {
      const headers = (err as { config?: { headers?: Record<string, unknown> } }).config?.headers
      const auth = String(headers?.Authorization ?? headers?.authorization ?? '')
      if (auth.includes(`Token="${cur.user.accessToken}"`)) handleUnauthorized()
    }
    return Promise.reject(err)
  })
}

/** Forget the current user's token (the server rejected it); the auth guard then shows the user list. */
export function handleUnauthorized() {
  const cur = useSessionStore.getState().current
  if (!cur) return
  patchUser(cur.server.id, cur.user.id, { accessToken: null })
  useSessionStore.setState((s) => ({
    current: null,
    authExpired: true,
    selectedServerId: cur.server.id,
    mostRecent: { ...s.mostRecent, userId: null },
  }))
}

// ---------------------------------------------------------------------------------------------
// Server connection

/** Trims, and drops trailing slashes. Scheme/port candidates are generated by the SDK. */
export function normalizeServerInput(input: string): string {
  return input.trim().replace(/\/+$/, '')
}

function describeIssue(issue: RecommendedServerIssue): TriedAddress['issues'][number] {
  if (issue instanceof ProductNameIssue) return 'invalid-server-info'
  if (issue instanceof SystemInfoIssue) return issue.error ? 'unreachable' : 'invalid-server-info'
  if (issue instanceof SlowResponseIssue) return 'unreachable'
  if (issue instanceof VersionMissingIssue || issue instanceof VersionOutdatedIssue || issue instanceof VersionUnsupportedIssue)
    return 'unsupported-version'
  return 'unreachable'
}

function serverFromInfo(url: string, info: PublicSystemInfo): SavedServer {
  return {
    id: normalizeId(info.Id ?? '') ?? '',
    name: info.ServerName ?? null,
    url: normalizeServerInput(url),
    version: info.Version ?? null,
    lastUsed: Date.now(),
  }
}

/**
 * Resolves user input to a reachable Jellyfin server (SwitchServerViewModel.addServer): the SDK builds
 * scheme/port candidates, probes `GET /System/Info/Public` on each and scores them; the best non-BAD one wins.
 * Throws SessionError (`invalid-url`, `unreachable`, `invalid-server-info`, `unsupported-version`,
 * `invalid-response`) with the tried addresses.
 */
export async function connectToServer(input: string): Promise<{ server: SavedServer; info: PublicSystemInfo }> {
  const normalized = normalizeServerInput(input)
  if (!normalized) throw new SessionError('invalid-url')
  const candidates = jellyfin.discovery.getAddressCandidates(normalized)
  if (candidates.length === 0) throw new SessionError('invalid-url')
  const results: RecommendedServerInfo[] = await jellyfin.discovery.getRecommendedServers(
    candidates,
    RecommendedServerInfoScore.BAD,
  )
  const best = jellyfin.discovery.findBestServer(results)
  const tried = results.map((r) => ({ address: r.address, issues: r.issues.map(describeIssue) }))
  if (!best?.systemInfo) {
    const all = tried.flatMap((t) => t.issues)
    const kind = all.includes('unsupported-version')
      ? 'unsupported-version'
      : all.includes('invalid-server-info')
        ? 'invalid-server-info'
        : 'unreachable'
    throw new SessionError(kind, undefined, { tried })
  }
  const info = best.systemInfo
  // Upstream accepts only a UUID id and a finished startup wizard.
  if (!isUuid(info.Id) || info.StartupWizardCompleted !== true) {
    throw new SessionError('invalid-response', undefined, { tried })
  }
  return { server: serverFromInfo(best.address, info), info }
}

/** Probe a known server (picker status), 6 s timeout. */
export async function getPublicSystemInfo(url: string): Promise<PublicSystemInfo> {
  try {
    const res = await getSystemApi(jellyfin.createApi(url)).getPublicSystemInfo({ timeout: PROBE_TIMEOUT_MS })
    return res.data
  } catch (err) {
    throw toSessionError(err)
  }
}

/** `addAndChangeServer`: save the server, clear the current user and show its user list. */
export function selectServer(server: SavedServer) {
  upsertServer({ ...server, lastUsed: Date.now() })
  useSessionStore.setState({
    current: null,
    selectedServerId: server.id,
    mostRecent: { serverId: server.id, userId: null },
  })
}

/** Go back to the server list (keeps saved data). */
export function clearSelectedServer() {
  useSessionStore.setState({ current: null, selectedServerId: null })
}

// ---------------------------------------------------------------------------------------------
// Users

export async function getPublicUsers(server: SavedServer): Promise<UserDto[]> {
  try {
    const res = await getUserApi(jellyfin.createApi(server.url)).getPublicUsers({ timeout: PROBE_TIMEOUT_MS })
    return res.data
  } catch (err) {
    throw toSessionError(err)
  }
}

export async function getQuickConnectEnabled(server: SavedServer): Promise<boolean> {
  try {
    const res = await getAuthenticationApi(jellyfin.createApi(server.url)).getQuickConnectEnabled({
      timeout: PROBE_TIMEOUT_MS,
    })
    return res.data === true
  } catch {
    return false
  }
}

/**
 * `changeUser(server, user)` (ServerRepository.kt:94-130): validate the token with `GET /Users/Me`,
 * refresh server name/version, persist both, remember as most recent and publish the session.
 */
export async function changeUser(server: SavedServer, user: SavedUser): Promise<CurrentSession> {
  if (!user.accessToken) throw new SessionError('expired')
  const api = jellyfin.createApi(server.url, user.accessToken)
  let me: UserDto
  try {
    me = (await getUserApi(api).getCurrentUser()).data
  } catch (err) {
    const e = toSessionError(err)
    if (e.kind === 'expired') patchUser(server.id, user.id, { accessToken: null })
    throw e
  }
  const info = await getSystemApi(api)
    .getPublicSystemInfo({ timeout: PROBE_TIMEOUT_MS })
    .then((r) => r.data)
    .catch(() => null)
  const now = Date.now()
  const srv: SavedServer = {
    ...server,
    name: info?.ServerName ?? server.name,
    version: info?.Version ?? server.version,
    lastUsed: now,
  }
  const usr: SavedUser = {
    ...user,
    id: normalizeId(me.Id ?? user.id) ?? user.id,
    serverId: srv.id,
    name: me.Name ?? user.name,
    primaryImageTag: me.PrimaryImageTag ?? null,
    lastUsed: now,
  }
  upsertServer(srv)
  upsertUser(usr)
  const current: CurrentSession = { server: srv, user: usr, userDto: me, api }
  useSessionStore.setState({
    current,
    selectedServerId: srv.id,
    authExpired: false,
    mostRecent: { serverId: srv.id, userId: usr.id },
  })
  return current
}

/** Builds/updates the saved user from an AuthenticationResult and becomes that user. */
async function adoptAuthResult(server: SavedServer, result: AuthenticationResult): Promise<CurrentSession> {
  const token = result.AccessToken
  const userId = normalizeId(result.User?.Id)
  if (!token || !userId || (result.ServerId && !isUuid(result.ServerId))) {
    throw new SessionError('invalid-response')
  }
  const serverId = normalizeId(result.ServerId) ?? server.id
  const srv: SavedServer = { ...server, id: serverId, name: server.name ?? result.User?.ServerName ?? null }
  const existing = getUser(serverId, userId)
  const user: SavedUser = {
    id: userId,
    serverId,
    name: result.User?.Name ?? existing?.name ?? null,
    accessToken: token,
    primaryImageTag: result.User?.PrimaryImageTag ?? null,
    // "if the server authenticated, always remove the PIN" (ServerRepository)
    pin: null,
    requireLogin: existing?.requireLogin ?? false,
    lastUsed: Date.now(),
  }
  upsertServer(srv)
  upsertUser(user)
  return changeUser(srv, user)
}

/** `POST /Users/AuthenticateByName`. 401 -> SessionError('invalid-credentials'). */
export async function loginWithPassword(server: SavedServer, username: string, password: string): Promise<CurrentSession> {
  let result: AuthenticationResult
  try {
    const res = await getAuthenticationApi(jellyfin.createApi(server.url)).authenticateUserByName({
      authenticateUserByName: { Username: username, Pw: password },
    })
    result = res.data
  } catch (err) {
    if (httpStatus(err) === 401) throw new SessionError('invalid-credentials', undefined, { status: 401 })
    throw toSessionError(err)
  }
  return adoptAuthResult(server, result)
}

export interface QuickConnectRequest {
  secret: string
  code: string
}

/** `POST /QuickConnect/Initiate`. */
export async function initiateQuickConnect(server: SavedServer): Promise<QuickConnectRequest> {
  try {
    const res = await getAuthenticationApi(jellyfin.createApi(server.url)).initiateQuickConnect()
    if (!res.data.Secret || !res.data.Code) throw new SessionError('invalid-response')
    return { secret: res.data.Secret, code: res.data.Code }
  } catch (err) {
    throw toSessionError(err)
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new SessionError('cancelled'))
    const id = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(id)
      reject(new SessionError('cancelled'))
    })
  })
}

/**
 * Polls `GET /QuickConnect/Connect?secret=` every 5 s until authorized, then exchanges the secret
 * (`POST /Users/AuthenticateWithQuickConnect`) and becomes that user. Abort with the signal.
 */
export async function waitForQuickConnect(
  server: SavedServer,
  secret: string,
  signal?: AbortSignal,
): Promise<CurrentSession> {
  const auth = getAuthenticationApi(jellyfin.createApi(server.url))
  for (;;) {
    if (signal?.aborted) throw new SessionError('cancelled')
    let authenticated = false
    try {
      authenticated = (await auth.getQuickConnectState({ secret }, { signal })).data.Authenticated === true
    } catch (err) {
      if (signal?.aborted) throw new SessionError('cancelled')
      throw toSessionError(err)
    }
    if (authenticated) {
      try {
        const res = await auth.authenticateWithQuickConnect({ quickConnectDto: { Secret: secret } }, { signal })
        return await adoptAuthResult(server, res.data)
      } catch (err) {
        throw toSessionError(err)
      }
    }
    await sleep(QUICK_CONNECT_POLL_MS, signal)
  }
}

/**
 * `trySwitchUser` for a saved user whose token is usable. Callers check `needsLogin`/`needsPin`
 * first (SwitchUserContent click rules).
 */
export async function switchUser(server: SavedServer, user: SavedUser): Promise<CurrentSession> {
  return changeUser(server, user)
}

export const needsLogin = (u: SavedUser) => !u.accessToken || u.requireLogin
export const needsPin = (u: SavedUser) => !needsLogin(u) && !!u.pin?.trim()

/** Adopt a token obtained elsewhere (dev session helper). */
export async function signInWithToken(serverUrl: string, info: PublicSystemInfo, user: UserDto, accessToken: string) {
  const server = serverFromInfo(serverUrl, info)
  upsertServer(server)
  const id = normalizeId(user.Id) ?? ''
  const existing = getUser(server.id, id)
  const saved: SavedUser = {
    id,
    serverId: server.id,
    name: user.Name ?? null,
    accessToken,
    primaryImageTag: user.PrimaryImageTag ?? null,
    pin: existing?.pin ?? null,
    requireLogin: existing?.requireLogin ?? false,
    lastUsed: Date.now(),
  }
  upsertUser(saved)
  return changeUser(server, saved)
}

/**
 * Leave the current user without revoking the token (upstream "Switch user": `switchServerOrUser()`).
 * Upstream also forgets the most recent server; the web keeps it so a reload lands on that server's user list.
 */
export function leaveUser() {
  useSessionStore.setState((s) => ({
    current: null,
    selectedServerId: s.current?.server.id ?? s.selectedServerId,
    mostRecent: { ...s.mostRecent, userId: null },
  }))
}

/**
 * Explicit sign-out: revoke the token on the server (`POST /Sessions/Logout`; upstream never calls it,
 * W/data/ServerRepository.kt) and forget it locally.
 */
export async function signOut(target?: { server: SavedServer; user: SavedUser }) {
  const cur = getSession()
  // A saved user from the user list (after the drawer's "switch user" left it), or the current session.
  const isCurrent = !target || (!!cur && cur.server.id === target.server.id && cur.user.id === target.user.id)
  const serverId = target?.server.id ?? cur?.server.id
  const userId = target?.user.id ?? cur?.user.id
  if (!serverId || !userId) return
  const api = isCurrent ? cur?.api : target.user.accessToken ? jellyfin.createApi(target.server.url, target.user.accessToken) : null
  try {
    if (api) await getSessionApi(api).reportSessionEnded({ timeout: PROBE_TIMEOUT_MS })
  } catch {
    // offline or already invalid: forgetting locally is enough
  }
  patchUser(serverId, userId, { accessToken: null })
  if (isCurrent) leaveUser()
}

/** `removeUser`: delete the saved user; if current, end the session. */
export function removeUser(serverId: string, userId: string) {
  const key = userKey(serverId, userId)
  useSessionStore.setState((s) => {
    const users = { ...s.users }
    delete users[key]
    const isCurrent = s.current && userKey(s.current.server.id, s.current.user.id) === key
    const isRecent = s.mostRecent.userId && userKey(s.mostRecent.serverId ?? '', s.mostRecent.userId) === key
    return {
      users,
      current: isCurrent ? null : s.current,
      mostRecent: isRecent ? { ...s.mostRecent, userId: null } : s.mostRecent,
    }
  })
}

/** `removeServer`: delete the server and its users; if current, end the session. */
export function removeServer(serverId: string) {
  const id = normalizeId(serverId)
  useSessionStore.setState((s) => {
    const servers = { ...s.servers }
    delete servers[id]
    const users = Object.fromEntries(Object.entries(s.users).filter(([, u]) => u.serverId !== id))
    const isCurrent = s.current?.server.id === id
    return {
      servers,
      users,
      current: isCurrent ? null : s.current,
      selectedServerId: s.selectedServerId === id ? null : s.selectedServerId,
      mostRecent: s.mostRecent.serverId === id ? { serverId: null, userId: null } : s.mostRecent,
    }
  })
}

// ---------------------------------------------------------------------------------------------
// Startup

/** Preset mode (/config.json `serverUrl`): resolve the server once; returns null when unreachable. */
export async function ensurePresetServer(): Promise<SavedServer | null> {
  const cfg = getAppConfig()
  if (!cfg.serverUrl) return null
  const url = normalizeServerInput(cfg.serverUrl)
  const known = Object.values(useSessionStore.getState().servers).find((s) => s.url === url)
  try {
    const info = await getPublicSystemInfo(url)
    const server = { ...serverFromInfo(url, info), name: info.ServerName ?? cfg.serverName ?? null }
    if (!isUuid(info.Id)) throw new SessionError('invalid-response')
    upsertServer(server)
    useSessionStore.setState({ presetServerId: server.id, selectedServerId: server.id })
    return server
  } catch {
    if (known) {
      useSessionStore.setState({ presetServerId: known.id, selectedServerId: known.id })
      return known
    }
    useSessionStore.setState({ presetServerId: null })
    return null
  }
}

export interface StartupOptions {
  /** AppPreferences.signInAutomatically */
  signInAutomatically: boolean
}

/**
 * `handleAppStart` + `restoreLastSession` (MainActivity.kt:559-584, ServerRepository.kt:133-168):
 * restore the most recent unprotected user when auto sign-in is on; otherwise preselect the most
 * recent server so the user list shows.
 */
export async function initSession(opts: StartupOptions): Promise<void> {
  installUnauthorizedInterceptor()
  try {
    await loadAppConfig()
    const preset = getAppConfig().serverUrl ? await ensurePresetServer() : null
    const { mostRecent } = useSessionStore.getState()
    const server = preset ?? getServer(mostRecent.serverId)
    if (!server) return
    useSessionStore.setState({ selectedServerId: server.id })
    if (!opts.signInAutomatically || !mostRecent.userId || mostRecent.serverId !== server.id) return
    const user = getUser(server.id, mostRecent.userId)
    if (!user || isProtected(user) || !user.accessToken) return
    try {
      await changeUser(server, user)
    } catch (err) {
      const e = toSessionError(err)
      if (e.kind === 'expired') useSessionStore.setState({ authExpired: true })
    }
  } finally {
    useSessionStore.setState({ status: 'ready' })
  }
}
