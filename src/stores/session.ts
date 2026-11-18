import type { Api } from '@jellyfin/sdk'
import type { UserDto } from '@jellyfin/sdk/lib/generated-client/models'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { normalizeId } from '../lib/ids'

/** Saved Jellyfin server (upstream `JellyfinServer`, W/data/model/JellyfinServer.kt). Ids are 32-hex lowercase. */
export interface SavedServer {
  id: string
  name: string | null
  /** normalized base URL, no trailing slash */
  url: string
  version: string | null
  lastUsed: number | null
}

/** Saved user on a server (upstream `JellyfinUser`). */
export interface SavedUser {
  id: string
  serverId: string
  name: string | null
  /** null for public-user placeholders, after sign-out, and after the server rejected it */
  accessToken: string | null
  primaryImageTag: string | null
  /** local profile PIN (UI lock only; the server token is the real credential) */
  pin: string | null
  /** always require a server login for this profile */
  requireLogin: boolean
  lastUsed: number | null
}

export interface MostRecent {
  serverId: string | null
  userId: string | null
}

export interface CurrentSession {
  server: SavedServer
  user: SavedUser
  /** GET /Users/Me result (configuration, policy) */
  userDto: UserDto
  api: Api
}

/** `isProtected` (JellyfinServer.kt:74-76): never auto-restored. */
export const isProtected = (u: Pick<SavedUser, 'pin' | 'requireLogin'>) => !!u.pin?.trim() || u.requireLogin

export const userKey = (serverId: string, userId: string) => `${normalizeId(serverId)}:${normalizeId(userId)}`

interface SessionState {
  // persisted
  servers: Record<string, SavedServer>
  users: Record<string, SavedUser>
  mostRecent: MostRecent
  // runtime
  /** `init` until startup restore finished */
  status: 'init' | 'ready'
  current: CurrentSession | null
  /** server whose user list the setup flow shows */
  selectedServerId: string | null
  /** id of the server forced by /config.json (preset mode), if any */
  presetServerId: string | null
  /** set when a request came back 401 and the token was dropped (setup shows the expired toast) */
  authExpired: boolean
}

export const SESSION_STORAGE_KEY = 'wholphin.session.v1'

export const useSessionStore = create<SessionState>()(
  persist(
    (): SessionState => ({
      servers: {},
      users: {},
      mostRecent: { serverId: null, userId: null },
      status: 'init',
      current: null,
      selectedServerId: null,
      presetServerId: null,
      authExpired: false,
    }),
    {
      name: SESSION_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ servers: s.servers, users: s.users, mostRecent: s.mostRecent }),
    },
  ),
)

// ---- plain mutations (no network) ----

export function upsertServer(server: SavedServer) {
  useSessionStore.setState((s) => ({ servers: { ...s.servers, [server.id]: { ...s.servers[server.id], ...server } } }))
}

export function upsertUser(user: SavedUser) {
  const key = userKey(user.serverId, user.id)
  useSessionStore.setState((s) => ({ users: { ...s.users, [key]: { ...s.users[key], ...user } } }))
}

export function patchUser(serverId: string, userId: string, patch: Partial<SavedUser>) {
  const key = userKey(serverId, userId)
  useSessionStore.setState((s) => {
    const u = s.users[key]
    if (!u) return {}
    const next = { ...u, ...patch }
    const current =
      s.current && userKey(s.current.server.id, s.current.user.id) === key ? { ...s.current, user: next } : s.current
    return { users: { ...s.users, [key]: next }, current }
  })
}

export function getServer(id: string | null | undefined): SavedServer | null {
  const n = normalizeId(id)
  return n ? (useSessionStore.getState().servers[n] ?? null) : null
}

export function getUser(serverId: string, userId: string): SavedUser | null {
  return useSessionStore.getState().users[userKey(serverId, userId)] ?? null
}

export function usersOfServer(serverId: string): SavedUser[] {
  const sid = normalizeId(serverId)
  return Object.values(useSessionStore.getState().users).filter((u) => u.serverId === sid)
}

/** Servers sorted by name then url, as the upstream picker. */
export function sortedServers(servers: Record<string, SavedServer>): SavedServer[] {
  return Object.values(servers).sort(
    (a, b) => (a.name ?? '').localeCompare(b.name ?? '') || a.url.localeCompare(b.url),
  )
}

/** Stores the local profile protection (upstream ProfileProtection: NONE / PIN / LOGIN). UI comes later. */
export function setUserProtection(serverId: string, userId: string, protection: { pin: string | null; requireLogin: boolean }) {
  patchUser(serverId, userId, { pin: protection.requireLogin ? null : protection.pin, requireLogin: protection.requireLogin })
}
