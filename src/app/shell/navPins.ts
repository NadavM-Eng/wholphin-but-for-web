// Per-user nav drawer pins (upstream Room table NavDrawerPinnedItem, stored locally, never on the server).
// The settings "Customize Navigation Drawer Items" dialog writes them with saveNavPins().
import { create } from 'zustand'
import { readJson, writeJson } from '../../lib/storage'
import { useSessionStore, userKey } from '../../stores/session'
import type { NavPins, PinType } from './drawerItems'

const PREFIX = 'wholphin.navPins.v1.'

interface PinsState {
  user: string | null
  pins: NavPins
}

const usePinsStore = create<PinsState>()(() => ({ user: null, pins: {} }))

function currentUserKey(): string | null {
  const cur = useSessionStore.getState().current
  return cur ? userKey(cur.server.id, cur.user.id) : null
}

function sync() {
  const user = currentUserKey()
  if (usePinsStore.getState().user === user) return
  usePinsStore.setState({ user, pins: user ? (readJson<NavPins>(PREFIX + user) ?? {}) : {} })
}

let bound = false
function bind() {
  if (bound) return
  bound = true
  sync()
  useSessionStore.subscribe(sync)
}

/** Current user's pins (re-renders on change). */
export function useNavPins(): NavPins {
  bind()
  return usePinsStore((s) => s.pins)
}

export function getNavPins(): NavPins {
  bind()
  return usePinsStore.getState().pins
}

/**
 * Saves the full ordered list the pins dialog shows (`saveNavDrawerPinnedItems`): each row's index becomes
 * its order, `pinned=false` rows go under "More". Ids are drawer ids (`a_favorites`, `a_discover`, `s_<uuid>`).
 */
export function saveNavPins(rows: ReadonlyArray<{ id: string; pinned: boolean }>) {
  bind()
  const user = usePinsStore.getState().user
  const pins: NavPins = { ...usePinsStore.getState().pins }
  rows.forEach((r, i) => {
    pins[r.id] = { type: (r.pinned ? 'PINNED' : 'UNPINNED') as PinType, order: i }
  })
  usePinsStore.setState({ pins })
  if (user) writeJson(PREFIX + user, pins)
}

/**
 * NavDrawerPreferencesViewModel.init: `items + moreItems` sorted by the saved order (unknown or -1 last), so
 * pinned and unpinned entries stay interleaved where the user put them (Array.sort is stable).
 */
export function orderPinsForDialog<T extends { id: string }>(pinned: readonly T[], more: readonly T[], saved: NavPins): T[] {
  const orderOf = (id: string) => {
    const o = saved[id]?.order
    return o != null && o >= 0 ? o : Number.MAX_SAFE_INTEGER
  }
  return [...pinned, ...more].sort((a, b) => orderOf(a.id) - orderOf(b.id))
}
