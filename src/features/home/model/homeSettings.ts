// Home settings persistence and source resolution (W/services/HomeSettingsService.kt).
//
// Where the row list lives (spec 02 §5.4):
//   LOCAL           localStorage `wholphin.home_settings.v1.<serverId>:<userId>` (upstream: a file per user)
//   SERVER_PROFILE  DisplayPreferences "default" / client "Wholphin", CustomPrefs["home_settings"]
//   PLUGIN          GET {server}/wholphin/homesettings (optional "Wholphin" server plugin)
//   WEB_CONFIG      the Jellyfin web client's home sections (DisplayPreferences "usersettings" / "emby")
//   DEFAULT         generated from the libraries, never persisted
// The chosen source is stored per user (`wholphin.home_settings_source.v1.<serverId>:<userId>`,
// upstream: JellyfinUser.config.homeSettingsSource). All values are the upstream JSON format.
import type { Api } from '@jellyfin/sdk'
import type { UserDto } from '@jellyfin/sdk/lib/generated-client/models'
import { getUserApi } from '@jellyfin/sdk/lib/utils/api/user-api'
import { normalizeId, sameId } from '../../../lib/ids'
import { readJson, readString, removeKey, writeJson, writeString } from '../../../lib/storage'
import { getDisplayPreferences, getWholphinDisplayPreferences, updateDisplayPreferences } from '../../common/displayPreferences'
import { hasTvAccess, type Library } from '../../common/libraries'
import {
  decodeHomePageSettings,
  encodeHomePageSettings,
  LIVE_TV_VIEW_OPTIONS,
  SUPPORTED_HOME_PAGE_SETTINGS_VERSION,
  viewOptions,
  type HomePageSettings,
  type HomeRowConfig,
} from './homeRowConfig'
import { createDefaultRows, viewOptionsForCollectionType } from './homeRowPresets'

export type HomeSettingsSource = 'UNSET' | 'LOCAL' | 'SERVER_PROFILE' | 'PLUGIN' | 'DEFAULT' | 'WEB_CONFIG'

/** String key of each source's label (`HomePageSettingsSource.stringResId`). */
export const HOME_SETTINGS_SOURCE_LABEL: Record<HomeSettingsSource, string> = {
  UNSET: 'unknown',
  LOCAL: 'home_settings_source_local',
  SERVER_PROFILE: 'home_settings_source_server_profile',
  PLUGIN: 'home_settings_source_plugin',
  DEFAULT: 'home_settings_source_unset',
  WEB_CONFIG: 'home_settings_source_web',
}

export const HOME_SETTINGS_PREF_KEY = 'home_settings'

const LOCAL_PREFIX = 'wholphin.home_settings.v1.'
const SOURCE_PREFIX = 'wholphin.home_settings_source.v1.'
const userPart = (serverId: string, userId: string) => `${normalizeId(serverId)}:${normalizeId(userId)}`

// ---- local ----

export function loadLocal(serverId: string, userId: string): HomePageSettings | null {
  const raw = readString(LOCAL_PREFIX + userPart(serverId, userId))
  return raw ? decodeHomePageSettings(raw) : null
}

export function saveLocal(serverId: string, userId: string, settings: HomePageSettings): void {
  writeString(LOCAL_PREFIX + userPart(serverId, userId), encodeHomePageSettings(settings))
}

export function clearLocal(serverId: string, userId: string): void {
  removeKey(LOCAL_PREFIX + userPart(serverId, userId))
}

export function getSource(serverId: string, userId: string): HomeSettingsSource {
  return readJson<HomeSettingsSource>(SOURCE_PREFIX + userPart(serverId, userId)) ?? 'UNSET'
}

export function setSource(serverId: string, userId: string, source: HomeSettingsSource): void {
  writeJson(SOURCE_PREFIX + userPart(serverId, userId), source)
}

// ---- server profile ----

export async function loadFromServer(api: Api, userId: string): Promise<HomePageSettings | null> {
  const prefs = await getWholphinDisplayPreferences(api, userId)
  const raw = prefs.CustomPrefs?.[HOME_SETTINGS_PREF_KEY]
  return raw ? decodeHomePageSettings(raw) : null
}

export function saveToServer(api: Api, userId: string, settings: HomePageSettings): Promise<void> {
  return updateDisplayPreferences(api, userId, (p) => {
    p[HOME_SETTINGS_PREF_KEY] = encodeHomePageSettings(settings)
  })
}

// ---- server plugin ----

async function pluginGet(api: Api, path: string, signal?: AbortSignal) {
  return api.axiosInstance.get(`${api.basePath.replace(/\/+$/, '')}${path}`, {
    headers: { Authorization: api.authorizationHeader },
    signal,
    validateStatus: () => true,
  })
}

/** Presence probe of the "Wholphin" server plugin (`GET /wholphin/public`, any 2xx). */
export async function isServerPluginInstalled(api: Api, signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await pluginGet(api, '/wholphin/public', signal)
    return res.status >= 200 && res.status < 300
  } catch {
    return false
  }
}

/** `ServerPluginApi.fetchHomePageSettings`: null/404/empty rows => none. */
export async function loadFromPlugin(api: Api, signal?: AbortSignal): Promise<HomePageSettings | null> {
  const res = await pluginGet(api, '/wholphin/homesettings', signal)
  if (res.status === 404 || res.status === 204 || res.data == null || res.data === '') return null
  if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`)
  const settings = decodeHomePageSettings(res.data)
  return settings.rows.length ? settings : null
}

// ---- Jellyfin web client layout ----

/** `parseFromWebConfig` (HomeSettingsService.kt:327-441, SH-2). Null when the web client stored nothing. */
export async function parseFromWebConfig(
  api: Api,
  userId: string,
  libraries: readonly Library[],
  signal?: AbortSignal,
): Promise<HomeRowConfig[] | null> {
  const prefs = await getDisplayPreferences(api, userId, 'usersettings', 'emby', signal)
  const custom = prefs.CustomPrefs ?? {}
  if (Object.keys(custom).length === 0) return null
  const user = (await getUserApi(api).getUserById({ userId }, { signal })).data
  const excludes = user.Configuration?.LatestItemsExcludes ?? []
  const libs = libraries.filter((l) => !excludes.some((e) => sameId(e, l.id)))
  const rows: HomeRowConfig[] = []
  for (let i = 0; i <= 9; i++) {
    switch (custom[`homesection${i}`]?.toLowerCase()) {
      case 'activerecordings':
        rows.push({ type: 'Recordings', viewOptions: viewOptions() })
        break
      case 'resume':
        rows.push({ type: 'ContinueWatching', viewOptions: viewOptions() })
        break
      case 'nextup':
        rows.push({ type: 'NextUp', viewOptions: viewOptions() })
        break
      case 'livetv':
        if (hasTvAccess(user)) rows.push({ type: 'TvPrograms', viewOptions: { ...LIVE_TV_VIEW_OPTIONS } })
        break
      case 'latestmedia':
        for (const l of libs) rows.push({ type: 'RecentlyAdded', parentId: l.id, viewOptions: viewOptionsForCollectionType(l.collectionType) })
        break
      default:
        // none, smalllibrarytitles, librarybuttons, resumeaudio, resumebook: unsupported
        break
    }
  }
  return rows
}

// ---- resolution ----

export type ResolvedHomeSettings = {
  /** Where the rows came from (DEFAULT when generated). */
  source: HomeSettingsSource
  rows: HomeRowConfig[]
}

export type ResolveContext = {
  api: Api
  serverId: string
  user: UserDto
  /** Libraries for the default rows (drawer-unpinned ones already removed by the caller). */
  defaultLibraries: readonly Library[]
  allLibraries: readonly Library[]
  signal?: AbortSignal
}

async function tryLoad(fn: () => Promise<HomePageSettings | null> | HomePageSettings | null): Promise<HomePageSettings | null> {
  try {
    return await fn()
  } catch {
    return null
  }
}

/**
 * `fetchSettingsFor` + `loadCurrentSettings`: UNSET tries local -> server profile -> plugin (when
 * installed); an explicit source uses only that source. Nothing found, or an error, gives the default.
 */
export async function resolveHomeSettings(ctx: ResolveContext): Promise<ResolvedHomeSettings> {
  const userId = ctx.user.Id ?? ''
  const source = getSource(ctx.serverId, userId)
  const fallback = (): ResolvedHomeSettings => ({ source: 'DEFAULT', rows: createDefaultRows(ctx.defaultLibraries) })
  try {
    let found: { source: HomeSettingsSource; settings: HomePageSettings | null }
    switch (source) {
      case 'UNSET': {
        let s = await tryLoad(() => loadLocal(ctx.serverId, userId))
        let from: HomeSettingsSource = 'LOCAL'
        if (!s) {
          s = await tryLoad(() => loadFromServer(ctx.api, userId))
          from = 'SERVER_PROFILE'
        }
        if (!s && (await isServerPluginInstalled(ctx.api, ctx.signal))) {
          s = await tryLoad(() => loadFromPlugin(ctx.api, ctx.signal))
          from = 'PLUGIN'
        }
        found = { source: from, settings: s }
        break
      }
      case 'LOCAL':
        found = { source, settings: loadLocal(ctx.serverId, userId) }
        break
      case 'SERVER_PROFILE':
        found = { source, settings: await loadFromServer(ctx.api, userId) }
        break
      case 'PLUGIN':
        found = { source, settings: await loadFromPlugin(ctx.api, ctx.signal) }
        break
      case 'WEB_CONFIG': {
        const rows = await parseFromWebConfig(ctx.api, userId, ctx.allLibraries, ctx.signal)
        found = { source, settings: rows ? { rows, version: SUPPORTED_HOME_PAGE_SETTINGS_VERSION } : null }
        break
      }
      case 'DEFAULT':
        return fallback()
    }
    return found.settings ? { source: found.source, rows: found.settings.rows } : fallback()
  } catch {
    return fallback()
  }
}
