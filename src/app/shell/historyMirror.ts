// A mirror of upstream's app back stack on top of browser history. Each history index remembers its path
// and its depth above the nearest Home entry, which is what the drawer needs for:
//   - selection highlight (NavDrawerViewModel.updateSelectedIndex walks the stack top-down)
//   - navigateToFromDrawer: the stack becomes exactly [Home, X], so Back from X returns Home
//   - goToHome: pop back to the Home entry instead of pushing a new one
// Kept in sessionStorage so it survives reloads of the tab, like history itself.

export interface StackEntry {
  path: string
  /** 0 = Home; n = n entries above the Home it was reached from */
  depth: number
}

export type NavType = 'PUSH' | 'REPLACE' | 'POP'

const KEY = 'wholphin.shell.stack.v1'
const MAX = 500

const isHome = (path: string) => (path.split('?')[0] || '/') === '/'

/** Pure update of the mirror for a navigation that landed on `idx` with `path`. */
export function updateStack(entries: readonly (StackEntry | null)[], idx: number, path: string, type: NavType): (StackEntry | null)[] {
  const next = entries.slice(0, Math.max(entries.length, idx + 1))
  const below = idx > 0 ? next[idx - 1] : null
  const fresh = (): StackEntry => ({ path, depth: isHome(path) ? 0 : (below?.depth ?? 0) + 1 })
  if (type === 'PUSH') {
    next.length = idx
    next[idx] = fresh()
  } else if (type === 'REPLACE') {
    const prev = next[idx]
    next[idx] = isHome(path) ? { path, depth: 0 } : { path, depth: prev?.depth ?? fresh().depth }
  } else {
    const prev = next[idx]
    next[idx] = prev && prev.path === path ? prev : fresh()
  }
  for (let i = 0; i < next.length; i++) if (next[i] === undefined) next[i] = null
  return next
}

/** Paths of the app stack ending at `idx` (from its Home entry up), oldest first. */
export function stackPaths(entries: readonly (StackEntry | null)[], idx: number): string[] {
  const top = entries[idx]
  if (!top) return []
  const out: string[] = []
  for (let i = idx - top.depth; i <= idx; i++) {
    const e = entries[i]
    if (e) out.push(e.path)
  }
  return out
}

export type DrawerNavPlan =
  | { kind: 'push' }
  | { kind: 'replace' }
  /** go back `delta` entries (negative) to the [Home, Y] entry, then replace it */
  | { kind: 'popThenReplace'; delta: number }

/** `navigateToFromDrawer` on browser history. */
export function planDrawerNav(entries: readonly (StackEntry | null)[], idx: number): DrawerNavPlan {
  const cur = entries[idx]
  if (!cur || cur.depth === 0) return { kind: 'push' }
  if (cur.depth === 1) return { kind: 'replace' }
  const target = idx - (cur.depth - 1)
  const t = entries[target]
  if (target >= 0 && t && t.depth === 1) return { kind: 'popThenReplace', delta: target - idx }
  return { kind: 'push' }
}

export type HomeNavPlan = { kind: 'reload' } | { kind: 'pop'; delta: number } | { kind: 'push' }

/** `goToHome` (or `reloadHome` when already on Home). */
export function planGoHome(entries: readonly (StackEntry | null)[], idx: number): HomeNavPlan {
  const cur = entries[idx]
  if (cur && cur.depth === 0) return { kind: 'reload' }
  if (cur) {
    const target = idx - cur.depth
    const t = entries[target]
    if (target >= 0 && t && t.depth === 0) return { kind: 'pop', delta: target - idx }
  }
  return { kind: 'push' }
}

export function loadStack(): (StackEntry | null)[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(v) ? (v as (StackEntry | null)[]) : []
  } catch {
    return []
  }
}

export function saveStack(entries: readonly (StackEntry | null)[]) {
  try {
    // indexes must stay aligned with history, so old entries are blanked rather than dropped
    const out = entries.length > MAX ? entries.map((e, i) => (i < entries.length - MAX ? null : e)) : entries
    sessionStorage.setItem(KEY, JSON.stringify(out))
  } catch {
    // storage full or blocked: the mirror is a convenience
  }
}

/** React Router keeps the history index in `history.state.idx`. */
export function historyIndex(): number {
  const s = (typeof window === 'undefined' ? null : window.history.state) as { idx?: unknown } | null
  return typeof s?.idx === 'number' ? s.idx : 0
}
