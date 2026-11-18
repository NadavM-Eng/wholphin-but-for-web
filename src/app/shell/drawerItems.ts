// Nav drawer item model (W/ui/nav/NavDrawer.kt NavDrawerItem, W/services/NavDrawerService.kt). Pure.
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { normalizeId } from '../../lib/ids'
import { nav } from '../nav'

export type PinType = 'PINNED' | 'UNPINNED'

/** NavDrawerPinnedItem row (per user): type + user order (-1 = never ordered). */
export interface NavPin {
  type: PinType
  order: number
}

export type NavPins = Record<string, NavPin>

/** Font Awesome / drawable icon of a drawer item (NavDrawer.kt NavItem). */
export type DrawerIcon =
  | { kind: 'fa'; name: 'heart' | 'ellipsis' | 'magnifying_glass_plus' | 'film' | 'tv' | 'video' | 'music' | 'open_folder' | 'list_ul' }
  | { kind: 'drawable'; name: 'gf_dvr' }

export interface DrawerItem {
  /** `a_favorites`, `a_discover`, or `s_<uuid32>` for libraries */
  id: string
  kind: 'favorites' | 'discover' | 'library'
  /** library display name (built-ins are translated by the drawer) */
  name: string | null
  /** library id (32-hex) */
  itemId: string | null
  collectionType: string | null
  isRecordingFolder: boolean
  icon: DrawerIcon
  /** app path the item navigates to */
  path: string
}

export interface DrawerState {
  items: DrawerItem[]
  moreItems: DrawerItem[]
}

export const FAVORITES_ID = 'a_favorites'
export const DISCOVER_ID = 'a_discover'
export const MORE_ID = 'a_more'

/** `ServerNavDrawerItem.getId`: "s_" + UUID without dashes. */
export const libraryDrawerId = (itemId: string) => `s_${normalizeId(itemId)}`

/** `supportedCollectionTypes` (W/util/Constants.kt:25-38); null = mixed folders. */
const SUPPORTED = new Set<string | null>([
  'movies',
  'tvshows',
  'homevideos',
  'playlists',
  'boxsets',
  'livetv',
  'musicvideos',
  'folders',
  'music',
  'photos',
  null,
])

/** Library icons (NavDrawer.kt:664-692): film for anything not listed. */
export function libraryIcon(collectionType: string | null | undefined): DrawerIcon {
  switch (collectionType) {
    case 'movies':
      return { kind: 'fa', name: 'film' }
    case 'tvshows':
      return { kind: 'fa', name: 'tv' }
    case 'homevideos':
      return { kind: 'fa', name: 'video' }
    case 'livetv':
      return { kind: 'drawable', name: 'gf_dvr' }
    case 'music':
      return { kind: 'fa', name: 'music' }
    case 'boxsets':
      return { kind: 'fa', name: 'open_folder' }
    case 'playlists':
      return { kind: 'fa', name: 'list_ul' }
    default:
      return { kind: 'fa', name: 'film' }
  }
}

/**
 * Where a library entry goes: recording folder -> Recordings, Live TV collection -> the Live TV page,
 * anything else -> the collection page (upstream Destination.MediaItem dispatches on the collection type).
 */
export function libraryPath(itemId: string, collectionType: string | null, isRecordingFolder: boolean): string {
  if (isRecordingFolder) return nav.recordings(itemId)
  if (collectionType === 'livetv') return nav.liveTv()
  return nav.library(itemId)
}

/** `getAllUserLibraries` filter + map: supported collection types or recording folders, server order. */
export function librariesFromViews(views: readonly BaseItemDto[], recordingFolderIds: ReadonlySet<string>): DrawerItem[] {
  const out: DrawerItem[] = []
  for (const v of views) {
    if (!v.Id) continue
    const id = normalizeId(v.Id)
    const ct = (v.CollectionType as string | null | undefined) ?? null
    const isRec = recordingFolderIds.has(id)
    if (!SUPPORTED.has(ct) && !isRec) continue
    out.push({
      id: libraryDrawerId(id),
      kind: 'library',
      name: v.Name ?? '',
      itemId: id,
      collectionType: ct,
      isRecordingFolder: isRec,
      icon: libraryIcon(ct),
      path: libraryPath(v.Id, ct, isRec),
    })
  }
  return out
}

export function builtinItems(discoverActive: boolean): DrawerItem[] {
  const fav: DrawerItem = {
    id: FAVORITES_ID,
    kind: 'favorites',
    name: null,
    itemId: null,
    collectionType: null,
    isRecordingFolder: false,
    icon: { kind: 'fa', name: 'heart' },
    path: nav.favorites(),
  }
  const disc: DrawerItem = {
    id: DISCOVER_ID,
    kind: 'discover',
    name: null,
    itemId: null,
    collectionType: null,
    isRecordingFolder: false,
    icon: { kind: 'fa', name: 'magnifying_glass_plus' },
    path: nav.discover(),
  }
  return discoverActive ? [fav, disc] : [fav]
}

/**
 * `updateNavDrawer`: stable sort by the saved order (unknown / -1 = end), then pinned (or unknown) items
 * go to the main list, the rest under "More". Pins for items the server no longer returns are ignored.
 */
export function buildDrawerState(all: readonly DrawerItem[], pins: NavPins): DrawerState {
  const key = (it: DrawerItem) => {
    const o = pins[it.id]?.order
    return o != null && o >= 0 ? o : Number.MAX_SAFE_INTEGER
  }
  const sorted = all
    .map((it, i) => ({ it, i }))
    .sort((a, b) => key(a.it) - key(b.it) || a.i - b.i)
    .map((x) => x.it)
  const items: DrawerItem[] = []
  const moreItems: DrawerItem[] = []
  for (const it of sorted) {
    if ((pins[it.id]?.type ?? 'PINNED') === 'PINNED') items.push(it)
    else moreItems.push(it)
  }
  return { items, moreItems }
}

// ---- Selection (NavDrawerViewModel.updateSelectedIndex) -------------------------------------

/** Selection key: a built-in page or a drawer item id. */
export type DrawerSelection = 'home' | 'search' | 'nowPlaying' | string

/**
 * Which drawer entry a single app path corresponds to, or null (e.g. a detail page).
 * Upstream compares destinations structurally, so only the exact drawer destinations match.
 */
export function selectionForPath(path: string, state: DrawerState): DrawerSelection | null {
  const p = path.split('?')[0].replace(/\/+$/, '') || '/'
  if (p === '/') return 'home'
  if (p === '/search') return 'search'
  if (p === '/now-playing') return 'nowPlaying'
  const all = [...state.items, ...state.moreItems]
  for (const it of all) {
    const target = it.path.split('?')[0]
    if (target === p) return it.id
    if (it.kind === 'library' && it.itemId) {
      // ids in URLs may be dashed or upper-case. Either prefix matches the entry: a card click reaches the Live TV
      // library and recording folders at /library/<id> (itemDestination), the drawer at /livetv or /recordings/<id>.
      const m = /^\/(library|recordings)\/([^/]+)$/.exec(p)
      if (m && normalizeId(decodeURIComponent(m[2])) === it.itemId) return it.id
    }
  }
  return null
}

/** Walks the stack from the top down; first match wins. */
export function selectionForStack(paths: readonly string[], state: DrawerState): DrawerSelection | null {
  for (let i = paths.length - 1; i >= 0; i--) {
    const s = selectionForPath(paths[i], state)
    if (s != null) return s
  }
  return null
}
