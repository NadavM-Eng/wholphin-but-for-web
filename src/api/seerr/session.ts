/**
 * Seerr connection state per Jellyfin user (port of W/services/SeerrServerRepository.kt and
 * W/services/UserSwitchListener.kt, adapted to a browser).
 *
 * Web deviations (documented in the report):
 * - There is no "enter your Seerr URL" step: the deployment decides whether Seerr exists by proxying it
 *   same-origin (`seerrProxyPath`). Without a proxy Discover is unavailable.
 * - Upstream stores the Seerr password in plain text to log in again on every start. The web never
 *   stores it: it relies on Seerr's `connect.sid` session cookie (sent by the browser through the proxy)
 *   and keeps only a record that the link exists (method, username, Seerr user id). When the cookie has
 *   expired, or now belongs to another Seerr user (the browser has one cookie for all Jellyfin users),
 *   the state is `expired` and the user is asked to sign in again.
 * - An API key is an admin-level secret: it is kept in sessionStorage only (this tab), so after the
 *   browser is closed the user enters it again.
 */
import { create } from 'zustand'
import { readJson, writeJson } from '../../lib/storage'
import { useSessionStore, userKey } from '../../stores/session'
import { isAuthError, seerrProxyPath, SeerrError, setSeerrApiKey } from './client'
import { seerrApi } from './endpoints'
import { requestFlags, type RequestFlags } from './permissions'
import type { PublicSettings, SeerrUser } from './types'

/** `SeerrAuthMethod` (W/data/model/SeerrServer.kt). */
export type SeerrAuthMethod = 'jellyfin' | 'local' | 'apiKey'

/** What is persisted per Jellyfin user: enough to know a link exists, never a password or key. */
export interface SeerrLink {
  method: SeerrAuthMethod
  /** Seerr username for jellyfin/local sign-in (prefills the re-login form). */
  username: string | null
  /** Seerr user id, to detect that the browser's cookie belongs to someone else. */
  seerrUserId: number
  linkedAt: number
}

/**
 * - `unavailable`: no proxy configured, or the proxy does not answer as Seerr
 * - `checking`: probing / restoring
 * - `notLinked`: Seerr is there, this Jellyfin user has not signed in to it
 * - `linked`: signed in (upstream `SeerrConnectionStatus.Success`)
 * - `expired`: a link exists but the session is gone; sign in again
 * - `error`: Seerr could not be reached (upstream `SeerrConnectionStatus.Error`)
 */
export type SeerrStatus = 'unavailable' | 'checking' | 'notLinked' | 'linked' | 'expired' | 'error'

export interface SeerrState {
  status: SeerrStatus
  /** Proxy answered `/settings/public` (Discover can be offered). */
  available: boolean | null
  settings: PublicSettings | null
  user: SeerrUser | null
  link: SeerrLink | null
  error: string | null
  /** `${serverId}:${userId}` of the Jellyfin user this state belongs to. */
  sessionKey: string | null
}

const LINKS_KEY = 'wholphin.seerr.links.v1'
const API_KEYS_KEY = 'wholphin.seerr.apikeys.v1'

export const useSeerrStore = create<SeerrState>()(() => ({
  status: 'checking',
  available: null,
  settings: null,
  user: null,
  link: null,
  error: null,
  sessionKey: null,
}))

// ---------------------------------------------------------------------------------------------
// Persistence

function readLinks(): Record<string, SeerrLink> {
  return readJson<Record<string, SeerrLink>>(LINKS_KEY) ?? {}
}

function writeLink(key: string, link: SeerrLink | null) {
  const all = readLinks()
  if (link) all[key] = link
  else delete all[key]
  writeJson(LINKS_KEY, all)
}

function readApiKeys(): Record<string, string> {
  try {
    return JSON.parse(globalThis.sessionStorage?.getItem(API_KEYS_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

function writeApiKey(key: string, apiKey: string | null) {
  const all = readApiKeys()
  if (apiKey) all[key] = apiKey
  else delete all[key]
  try {
    globalThis.sessionStorage?.setItem(API_KEYS_KEY, JSON.stringify(all))
  } catch {
    // storage blocked: the key lasts for this page only
  }
}

function currentSessionKey(): string | null {
  const cur = useSessionStore.getState().current
  return cur ? userKey(cur.server.id, cur.user.id) : null
}

// ---------------------------------------------------------------------------------------------
// Lifecycle

let generation = 0

/** Probes the proxy and restores this Jellyfin user's link (UserSwitchListener). */
export async function refreshSeerr(): Promise<void> {
  const gen = ++generation
  const key = currentSessionKey()
  const current = () => gen === generation
  const set = (s: Partial<SeerrState>) => {
    if (current()) useSeerrStore.setState(s)
  }
  // The API key is global client state: a stale run (fast user switch) must not overwrite the newer one.
  const setKey = (k: string | null) => {
    if (current()) setSeerrApiKey(k)
  }
  if (seerrProxyPath() == null) {
    setKey(null)
    set({
      status: 'unavailable',
      available: false,
      user: null,
      link: null,
      settings: null,
      error: null,
      sessionKey: key,
    })
    return
  }
  set({ status: 'checking', sessionKey: key, error: null })
  let settings: PublicSettings
  try {
    settings = await seerrApi.publicSettings()
    if (!settings || typeof settings !== 'object') throw new SeerrError(502, 'Invalid Seerr response')
  } catch (e) {
    setKey(null)
    set({
      status: 'unavailable',
      available: false,
      user: null,
      link: null,
      settings: null,
      error: errorText(e),
    })
    return
  }
  if (!current()) return
  set({ available: true, settings })
  const link = key ? (readLinks()[key] ?? null) : null
  if (!key || !link) {
    setKey(null)
    set({ status: 'notLinked', user: null, link: null })
    return
  }
  let apiKey: string | null = null
  if (link.method === 'apiKey') {
    apiKey = readApiKeys()[key] ?? null
    if (!apiKey) {
      setKey(null)
      set({ status: 'expired', user: null, link })
      return
    }
  }
  setKey(apiKey)
  try {
    const me = await seerrApi.me()
    if (link.method !== 'apiKey' && me.id !== link.seerrUserId) {
      // The browser's cookie now belongs to another Seerr user (another Jellyfin user linked since).
      set({ status: 'expired', user: null, link })
      return
    }
    set({ status: 'linked', user: me, link })
  } catch (e) {
    set({
      status: isAuthError(e) ? 'expired' : 'error',
      user: null,
      link,
      error: errorText(e),
    })
  }
}

let bound = false

/** Starts following the Jellyfin session (idempotent). Called by the hooks, so whoever renders first wins. */
export function ensureSeerrBinding() {
  if (bound) return
  bound = true
  let lastKey: string | null | undefined
  const onChange = () => {
    const key = currentSessionKey()
    if (key === lastKey) return
    lastKey = key
    void refreshSeerr()
  }
  useSessionStore.subscribe(onChange)
  // Hooks call this during render: start the first probe after it, not inside it.
  queueMicrotask(onChange)
}

/**
 * A Seerr call answered 401/403. 403 is also "missing permission", so confirm with GET /auth/me before
 * declaring the session expired.
 */
export async function verifySeerrSession(): Promise<void> {
  const st = useSeerrStore.getState()
  if (st.status !== 'linked') return
  const gen = generation
  // Only write if nothing (a refresh, link, unlink or user switch) happened while /auth/me was in flight.
  const current = () => gen === generation && useSeerrStore.getState().sessionKey === st.sessionKey
  try {
    const me = await seerrApi.me()
    if (current()) useSeerrStore.setState({ user: me })
  } catch (e) {
    if (isAuthError(e) && current()) useSeerrStore.setState({ status: 'expired', user: null })
  }
}

export type SeerrLoginError = 'invalidCredentials' | 'couldNotConnect' | 'noSession' | 'other'

export class SeerrLoginFailure extends Error {
  readonly kind: SeerrLoginError
  constructor(kind: SeerrLoginError, message: string) {
    super(message)
    this.kind = kind
  }
}

/**
 * `SwitchSeerrViewModel.submitServer` without the URL step: signs in (`seerrLogin`), then reads
 * `/settings/public`, then saves the link for the current Jellyfin user.
 */
export async function linkSeerr(method: SeerrAuthMethod, username: string, secret: string): Promise<SeerrUser> {
  const key = currentSessionKey()
  if (!key) throw new SeerrLoginFailure('noSession', 'No Jellyfin session')
  let me: SeerrUser
  try {
    if (method === 'apiKey') {
      me = await seerrApi.me({ apiKey: secret.trim() })
    } else {
      if (method === 'jellyfin') await seerrApi.loginJellyfin(username, secret)
      else await seerrApi.loginLocal(username, secret)
      me = await seerrApi.me({ apiKey: null })
    }
  } catch (e) {
    if (isAuthError(e)) throw new SeerrLoginFailure('invalidCredentials', errorText(e))
    if (e instanceof SeerrError && e.status >= 400 && e.status < 500) throw new SeerrLoginFailure('couldNotConnect', errorText(e))
    throw new SeerrLoginFailure('other', errorText(e))
  }
  const settings = await seerrApi.publicSettings().catch(() => useSeerrStore.getState().settings)
  // The Jellyfin user changed while signing in: do not attach this Seerr account to the new user.
  if (currentSessionKey() !== key) throw new SeerrLoginFailure('noSession', 'The Jellyfin user changed')
  const link: SeerrLink = {
    method,
    username: method === 'apiKey' ? null : username,
    seerrUserId: me.id,
    linkedAt: Date.now(),
  }
  if (method === 'apiKey') {
    writeApiKey(key, secret.trim())
    setSeerrApiKey(secret.trim())
  } else {
    writeApiKey(key, null)
    setSeerrApiKey(null)
  }
  writeLink(key, link)
  generation++
  useSeerrStore.setState({
    status: 'linked',
    available: true,
    settings,
    user: me,
    link,
    error: null,
    sessionKey: key,
  })
  return me
}

/** "Remove Seerr Server": forget the link and end the Seerr session cookie. */
export async function unlinkSeerr(): Promise<void> {
  const key = currentSessionKey()
  const { link, status } = useSeerrStore.getState()
  if (key) {
    writeLink(key, null)
    writeApiKey(key, null)
  }
  setSeerrApiKey(null)
  generation++
  useSeerrStore.setState({
    status: 'notLinked',
    user: null,
    link: null,
    error: null,
  })
  // Log out only when the browser's Seerr cookie is this user's ('linked'). When 'expired', the cookie may
  // belong to another Jellyfin user's Seerr account, and logging out would sign them out too.
  if (link && link.method !== 'apiKey' && status === 'linked') {
    try {
      await seerrApi.logout()
    } catch {
      // the cookie may already be gone
    }
  }
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

// ---------------------------------------------------------------------------------------------
// Hooks

/** Seerr exists on this deployment (proxy configured and answering). Gate the Discover drawer entry on this. */
export function useSeerrConfigured(): boolean {
  ensureSeerrBinding()
  return useSeerrStore((s) => s.available === true)
}

export interface SeerrSessionView extends SeerrState {
  /** Signed in: Discover content, Seerr rows and search may call Seerr (upstream `SeerrServerRepository.active`). */
  active: boolean
  flags: RequestFlags
}

/** Full Seerr connection state for the current Jellyfin user. */
export function useSeerrSession(): SeerrSessionView {
  ensureSeerrBinding()
  const st = useSeerrStore()
  return {
    ...st,
    active: st.status === 'linked',
    flags: requestFlags(st.user, st.settings),
  }
}
