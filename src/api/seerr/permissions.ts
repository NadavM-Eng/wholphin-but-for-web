/**
 * Seerr permission bits (port of W/data/model/SeerrPermission.kt, from Seerr server/lib/permissions.ts).
 * `hasPermission` = the bit itself, any parent (recursively) or ADMIN.
 */
import type { PublicSettings, SeerrUser } from './types'

export const SeerrPermission = {
  NONE: 0,
  ADMIN: 2,
  MANAGE_SETTINGS: 4,
  MANAGE_USERS: 8,
  MANAGE_REQUESTS: 16,
  REQUEST: 32,
  VOTE: 64,
  AUTO_APPROVE: 128,
  AUTO_APPROVE_MOVIE: 256,
  AUTO_APPROVE_TV: 512,
  REQUEST_4K: 1024,
  REQUEST_4K_MOVIE: 2048,
  REQUEST_4K_TV: 4096,
  REQUEST_ADVANCED: 8192,
  REQUEST_VIEW: 16384,
  AUTO_APPROVE_4K: 32768,
  AUTO_APPROVE_4K_MOVIE: 65536,
  AUTO_APPROVE_4K_TV: 131072,
  REQUEST_MOVIE: 262144,
  REQUEST_TV: 524288,
  MANAGE_ISSUES: 1048576,
  VIEW_ISSUES: 2097152,
  CREATE_ISSUES: 4194304,
  AUTO_REQUEST: 8388608,
  AUTO_REQUEST_MOVIE: 16777216,
  AUTO_REQUEST_TV: 33554432,
  RECENT_VIEW: 67108864,
  WATCHLIST_VIEW: 134217728,
  MANAGE_BLOCKLIST: 268435456,
  VIEW_BLOCKLIST: 1073741824,
} as const

export type SeerrPermissionName = keyof typeof SeerrPermission

const PARENTS: Partial<Record<SeerrPermissionName, SeerrPermissionName[]>> = {
  AUTO_APPROVE_MOVIE: ['AUTO_APPROVE'],
  AUTO_APPROVE_TV: ['AUTO_APPROVE'],
  REQUEST_4K_MOVIE: ['REQUEST_4K'],
  REQUEST_4K_TV: ['REQUEST_4K'],
  REQUEST_ADVANCED: ['MANAGE_REQUESTS'],
  REQUEST_VIEW: ['MANAGE_REQUESTS'],
  AUTO_APPROVE_4K_MOVIE: ['AUTO_APPROVE_4K'],
  AUTO_APPROVE_4K_TV: ['AUTO_APPROVE_4K'],
  REQUEST_MOVIE: ['REQUEST'],
  REQUEST_TV: ['REQUEST'],
  VIEW_ISSUES: ['MANAGE_ISSUES'],
  CREATE_ISSUES: ['MANAGE_ISSUES'],
  AUTO_REQUEST_MOVIE: ['AUTO_REQUEST'],
  AUTO_REQUEST_TV: ['AUTO_REQUEST'],
  RECENT_VIEW: ['MANAGE_REQUESTS'],
  WATCHLIST_VIEW: ['MANAGE_REQUESTS'],
  VIEW_BLOCKLIST: ['MANAGE_BLOCKLIST'],
}

const bitSet = (flag: number, permissions: number) => (flag & permissions) === flag

/** `SeerrUserConfig?.hasPermission`: false without a permissions value. */
export function hasPermission(user: Pick<SeerrUser, 'permissions'> | null | undefined, p: SeerrPermissionName): boolean {
  const perms = user?.permissions
  if (perms == null) return false
  const check = (name: SeerrPermissionName): boolean => bitSet(SeerrPermission[name], perms) || (PARENTS[name] ?? []).some(check)
  return check(p) || bitSet(SeerrPermission.ADMIN, perms)
}

export const canRequestMovies = (u: Pick<SeerrUser, 'permissions'> | null | undefined) =>
  hasPermission(u, 'REQUEST_MOVIE') || hasPermission(u, 'REQUEST_4K_MOVIE')

export const canRequestTv = (u: Pick<SeerrUser, 'permissions'> | null | undefined) =>
  hasPermission(u, 'REQUEST_TV') || hasPermission(u, 'REQUEST_4K_TV')

/** The `CurrentSeerr` derived flags. */
export interface RequestFlags {
  requestMovieEnabled: boolean
  request4kMovieEnabled: boolean
  requestTvEnabled: boolean
  request4kTvEnabled: boolean
  /** REQUEST_ADVANCED: may pick server / quality profile / root folder. */
  advanced: boolean
}

export function requestFlags(user: SeerrUser | null | undefined, settings: PublicSettings | null | undefined): RequestFlags {
  return {
    requestMovieEnabled: hasPermission(user, 'REQUEST_MOVIE'),
    request4kMovieEnabled: !!settings?.movie4kEnabled && hasPermission(user, 'REQUEST_4K_MOVIE'),
    requestTvEnabled: hasPermission(user, 'REQUEST_TV'),
    request4kTvEnabled: !!settings?.series4kEnabled && hasPermission(user, 'REQUEST_4K_TV'),
    advanced: hasPermission(user, 'REQUEST_ADVANCED'),
  }
}
