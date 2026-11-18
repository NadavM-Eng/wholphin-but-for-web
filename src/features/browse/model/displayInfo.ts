// Local per-user library state: `LibraryDisplayInfo` (sort, filter, view options; W/data/model/LibraryDisplayInfo.kt)
// and `RememberedTab` (W/services/RememberedTabService.kt). Upstream keeps both in Room tables keyed by
// (user row, itemId) and never syncs them; the web keeps them in localStorage keyed by (server, user, itemId).
import type { ItemSortBy, SortOrder } from '@jellyfin/sdk/lib/generated-client/models'
import { normalizeId } from '../../../lib/ids'
import { readJson, writeJson } from '../../../lib/storage'
import type { GetItemsFilter } from './filter'
import type { SortAndDirection } from './sort'
import { decodeViewOptions, type ViewOptions } from './viewOptions'

export type LibraryDisplayInfo = {
  sort: SortAndDirection
  filter: GetItemsFilter
  viewOptions: ViewOptions | null
}

const DISPLAY_PREFIX = 'wholphin.libraryDisplay.v1.'
const TAB_PREFIX = 'wholphin.rememberedTab.v1.'

/** Library ids are normalized; suffixed keys ("{id}_genres", "a_favorites_movies") keep their suffix. */
function idPart(itemId: string): string {
  const m = /^([0-9a-fA-F-]{32,36})(_.*)?$/.exec(itemId)
  return m ? `${normalizeId(m[1])}${m[2] ?? ''}` : itemId
}

const displayKey = (serverId: string, userId: string, itemId: string) => `${DISPLAY_PREFIX}${serverId}:${normalizeId(userId)}:${idPart(itemId)}`
const tabKey = (serverId: string, userId: string, itemId: string) => `${TAB_PREFIX}${serverId}:${normalizeId(userId)}:${idPart(itemId)}`

type Stored = { sort?: unknown; direction?: unknown; filter?: unknown; viewOptions?: unknown }

export function loadDisplayInfo(serverId: string, userId: string, itemId: string): LibraryDisplayInfo | null {
  const s = readJson<Stored>(displayKey(serverId, userId, itemId))
  if (!s || typeof s !== 'object') return null
  const sort = typeof s.sort === 'string' ? (s.sort as ItemSortBy) : 'SortName'
  const direction: SortOrder = s.direction === 'Descending' ? 'Descending' : 'Ascending'
  const filter = s.filter && typeof s.filter === 'object' ? (s.filter as GetItemsFilter) : {}
  return { sort: { sort, direction }, filter, viewOptions: decodeViewOptions(s.viewOptions) }
}

export function saveDisplayInfo(serverId: string, userId: string, itemId: string, info: LibraryDisplayInfo): void {
  writeJson(displayKey(serverId, userId, itemId), {
    sort: info.sort.sort,
    direction: info.sort.direction,
    filter: info.filter,
    viewOptions: info.viewOptions,
  })
}

export function loadRememberedTab(serverId: string, userId: string, itemId: string): number | null {
  const v = readJson<{ index?: unknown }>(tabKey(serverId, userId, itemId))
  return typeof v?.index === 'number' && Number.isInteger(v.index) ? v.index : null
}

export function saveRememberedTab(serverId: string, userId: string, itemId: string, index: number): void {
  writeJson(tabKey(serverId, userId, itemId), { index })
}

/** `NavDrawerItem.Favorites.id`: the favorites page's remembered-tab / display-info key. */
export const FAVORITES_ID = 'a_favorites'
