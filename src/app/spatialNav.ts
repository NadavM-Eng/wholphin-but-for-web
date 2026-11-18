// Global arrow-key spatial navigation (the D-pad of the TV app) for elements marked `data-focusable`.
//
// Markup contract:
//   data-focusable          element can receive arrow-key focus (must also be focusable: button/a/tabIndex)
//   data-focus-group        candidates inside the current element's nearest group win before looking outside
//   data-focus-trap         focus never leaves this subtree (dialogs); the last trap in the DOM wins
//   data-focus-default      preferred start element when nothing is focused yet
//   data-focus-vertical-only  focusables inside are reached only by Up/Down from outside it, never by
//                           Left/Right, and only when nothing else lies in that direction (the shell's
//                           floating Back button: Left from a page's start column goes to the nav drawer
//                           beside it, as on the TV, and Up from a first row goes to the page's tab row)
//   data-focus-enter        on a container: where focus lands when an arrow key brings it in from outside
//                           (Compose focusProperties { onEnter } / focusRestorer), whichever element inside is
//                           geometrically nearest:
//                             "restore"  the element focused there last, else the first one (ItemRow, button rows)
//                             "last"     the element focused there last, else the nearest one (a scrolling grid:
//                                        its first rendered card may be far outside the view)
//                             "tabs"     Up/Down: the selected tab; Left/Right: the tab at the edge entered (TabRow)
//                             "current"  the element marked aria-current, else the first one (letter picker)
//   data-focus-up / -down / -left / -right = "<key>"
//                           on an element or a container: when that arrow key would take focus out of it (nothing
//                           further inside in that direction), focus goes to [data-focus-key="<key>"] (to its
//                           entry element when the key names a container) instead of the nearest element
//                           outside, as an explicit Compose focus link (focusProperties { up = ... }) does
// After a move the focused element is scrolled to the TV's pivot (src/ui/lib/bringIntoView.ts).
// Arrow keys are never hijacked while typing in inputs or when a handler already called preventDefault().

import { bringIntoView } from '../ui/lib/bringIntoView'

export type Direction = 'up' | 'down' | 'left' | 'right'

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/** Weight of the cross-axis distance: >1 keeps focus in the same row/column when possible. */
export const CROSS_AXIS_WEIGHT = 2
/** Pixels of overlap tolerated between neighbours (borders, scaled focus). */
const EPS = 1

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

function gap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  if (bEnd < aStart) return aStart - bEnd
  if (bStart > aEnd) return bStart - aEnd
  return 0
}

/**
 * Score of moving from `from` to `to` in `dir`, or null when `to` is not in that direction.
 * Lower is better: distance along the direction + weighted cross-axis gap (0 when the ranges overlap)
 * + a small centre-alignment tie-breaker.
 */
export function directionalScore(from: Rect, to: Rect, dir: Direction): number | null {
  const fcx = (from.left + from.right) / 2
  const fcy = (from.top + from.bottom) / 2
  const tcx = (to.left + to.right) / 2
  const tcy = (to.top + to.bottom) / 2
  let primary: number
  let cross: number
  let align: number
  switch (dir) {
    case 'right':
      if (!(tcx > fcx && to.left >= from.left + EPS && to.right > from.right)) return null
      primary = Math.max(0, to.left - from.right)
      cross = gap(from.top, from.bottom, to.top, to.bottom)
      align = Math.abs(tcy - fcy)
      break
    case 'left':
      if (!(tcx < fcx && to.right <= from.right - EPS && to.left < from.left)) return null
      primary = Math.max(0, from.left - to.right)
      cross = gap(from.top, from.bottom, to.top, to.bottom)
      align = Math.abs(tcy - fcy)
      break
    case 'down':
      if (!(tcy > fcy && to.top >= from.top + EPS && to.bottom > from.bottom)) return null
      primary = Math.max(0, to.top - from.bottom)
      cross = gap(from.left, from.right, to.left, to.right)
      align = Math.abs(tcx - fcx)
      break
    case 'up':
      if (!(tcy < fcy && to.bottom <= from.bottom - EPS && to.top < from.top)) return null
      primary = Math.max(0, from.top - to.bottom)
      cross = gap(from.left, from.right, to.left, to.right)
      align = Math.abs(tcx - fcx)
      break
  }
  return primary + cross * CROSS_AXIS_WEIGHT + align * 0.01
}

/**
 * Index of the best candidate in `dir`, or -1. For Left/Right a candidate in the beam (overlapping the current
 * element's rows) always wins over one outside it, as in Compose's two-dimensional focus search (beamBeats):
 * Right along a toolbar reaches its far end before a nearer tab above it.
 */
export function pickNext(from: Rect, candidates: readonly Rect[], dir: Direction): number {
  let best = -1
  let bestScore = Infinity
  let bestInBeam = false
  const horizontal = dir === 'left' || dir === 'right'
  candidates.forEach((r, i) => {
    const s = directionalScore(from, r, dir)
    if (s == null) return
    const inBeam = horizontal && gap(from.top, from.bottom, r.top, r.bottom) === 0
    if ((inBeam && !bestInBeam) || (inBeam === bestInBeam && s < bestScore)) {
      bestScore = s
      best = i
      bestInBeam = inBeam
    }
  })
  return best
}

// ---------------------------------------------------------------------------------------------
// DOM

const FOCUSABLE = '[data-focusable]'

function isUsable(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  if (el.closest('[inert],[aria-hidden="true"]')) return false
  if ((el as HTMLButtonElement).disabled) return false
  const r = el.getBoundingClientRect()
  if (!(r.width > 0 && r.height > 0)) return false
  // visibility: hidden keeps its box but cannot take focus (a collapsed header): the key would be lost on it
  return typeof el.checkVisibility !== 'function' || el.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true })
}

/** Outermost subtree navigation may use: the active trap (dialog) or the document. */
function rootScope(active: Element | null): ParentNode {
  const ownTrap = active?.closest('[data-focus-trap]')
  if (ownTrap) return ownTrap
  const traps = document.querySelectorAll('[data-focus-trap]')
  return traps.length ? traps[traps.length - 1] : document
}

function candidatesIn(scope: ParentNode, exclude: Element | null): HTMLElement[] {
  return Array.from(scope.querySelectorAll(FOCUSABLE)).filter((el): el is HTMLElement => el !== exclude && isUsable(el))
}

function focusEl(el: HTMLElement, scroll = true) {
  el.focus({ preventScroll: true })
  if (scroll) bringIntoView(el)
}

/** The element focused last inside each data-focus-enter="restore" / "last" container. */
const lastFocusIn = new WeakMap<Element, HTMLElement>()
const REMEMBERING = '[data-focus-enter="restore"], [data-focus-enter="last"]'

function rememberFocus(e: FocusEvent) {
  const t = e.target
  if (!(t instanceof HTMLElement) || !t.matches(FOCUSABLE)) return
  for (let c = t.closest(REMEMBERING); c; c = c.parentElement?.closest(REMEMBERING) ?? null) {
    lastFocusIn.set(c, t)
  }
}

/** Where focus lands inside `container` when `dir` brings it in, or null to keep the geometric pick. */
function entryTarget(container: Element, dir: Direction): HTMLElement | null {
  const items = candidatesIn(container, null)
  if (!items.length) return null
  const mode = container.getAttribute('data-focus-enter')
  switch (mode) {
    case 'restore':
    case 'last': {
      const last = lastFocusIn.get(container)
      if (last && last.isConnected && container.contains(last) && isUsable(last)) return last
      return mode === 'restore' ? items[0] : null
    }
    case 'tabs': {
      if (dir === 'up' || dir === 'down') return items.find((el) => el.getAttribute('aria-selected') === 'true') ?? null
      // Upstream: last tab when moving Left, first when moving Right, i.e. the tab at the edge that is entered.
      const edge = (el: HTMLElement) => el.getBoundingClientRect().left
      return items.reduce((a, b) => ((dir === 'left' ? edge(b) > edge(a) : edge(b) < edge(a)) ? b : a))
    }
    case 'current':
      return items.find((el) => el.hasAttribute('aria-current')) ?? items[0]
    default:
      return null
  }
}

/** Applies the entry rule of the outermost data-focus-enter container that `picked` is in and `from` is not. */
function resolveEntry(from: Element, picked: HTMLElement, dir: Direction): HTMLElement {
  let container: Element | null = null
  for (let c = picked.closest('[data-focus-enter]'); c; c = c.parentElement?.closest('[data-focus-enter]') ?? null) {
    if (!c.contains(from)) container = c
  }
  return (container && entryTarget(container, dir)) ?? picked
}

/**
 * An explicit link for `dir` on the current element or an ancestor (data-focus-up="key" ...), resolved in `root`.
 * It applies only when the move would leave the element that holds it.
 */
function linkedTarget(current: HTMLElement, root: ParentNode, dir: Direction): HTMLElement | null {
  const attr = `data-focus-${dir}`
  const holder = current.closest(`[${attr}]`)
  const key = holder?.getAttribute(attr)
  if (!holder || !key || !(root === document || (root as Element).contains(holder))) return null
  if (holder !== current) {
    const inside = candidatesIn(holder, current).map((c) => c.getBoundingClientRect())
    if (pickNext(current.getBoundingClientRect(), inside, dir) >= 0) return null
  }
  const target = root.querySelector(`[data-focus-key="${CSS.escape(key)}"]`)
  if (!target || target.contains(current)) return null
  if (target.matches(FOCUSABLE) && isUsable(target)) return target
  return (target.hasAttribute('data-focus-enter') && entryTarget(target, dir)) || (candidatesIn(target, null)[0] ?? null)
}

/**
 * Focus the default (or first) focusable element inside `scope`. First is the start of the top row: top-left,
 * and top-right where the row runs right to left (Compose's initial focus follows the layout direction).
 * `scroll: false` leaves the page where it is (focus given back without a key press).
 */
export function focusFirst(scope: ParentNode = document, scroll = true): boolean {
  const def = scope.querySelector('[data-focus-default]')
  if (def && isUsable(def)) {
    focusEl(def, scroll)
    return true
  }
  const all = candidatesIn(scope, null)
  if (!all.length) return false
  const first = all.reduce((a, b) => {
    const ra = a.getBoundingClientRect()
    const rb = b.getBoundingClientRect()
    if (rb.top < ra.top - EPS) return b
    if (Math.abs(rb.top - ra.top) > EPS) return a
    // same row: the one nearer the row's start edge (a left-to-right island in a right-to-left page keeps left)
    const rtl = getComputedStyle(a.parentElement ?? a).direction === 'rtl'
    return (rtl ? rb.right > ra.right : rb.left < ra.left) ? b : a
  })
  focusEl(first, scroll)
  return true
}

/**
 * Brings focus into `container` as an arrow key from outside would: its entry element (data-focus-enter), else
 * its first usable element. For a component that knows where a key leads when geometry cannot say (the letter
 * column beside a grid is not level with a card row in every window).
 */
export function focusInto(container: Element, dir: Direction): boolean {
  const target = (container.hasAttribute('data-focus-enter') && entryTarget(container, dir)) || (candidatesIn(container, null)[0] ?? null)
  if (!target) return false
  focusEl(target)
  return true
}

/**
 * The shell's side of a horizontal move: true when something outside the page scope lies in the beam of every
 * page element in `dir` (the nav rail, which runs the whole height of the start edge). Upstream the rail is part
 * of the same focus tree, and a candidate in the beam always beats one outside it: Left from a song row goes to
 * the rail, not up to the Play button that is further left but in another row. With such an edge, a move whose
 * best page candidate is outside the beam is left unhandled, and the shell takes the key.
 */
let beamEdge: ((dir: Direction, from: HTMLElement) => boolean) | null = null
export function setBeamEdge(fn: ((dir: Direction, from: HTMLElement) => boolean) | null): void {
  beamEdge = fn
}

/** Moves focus from the active element in `dir`. Returns true when focus moved. */
export function moveFocus(dir: Direction): boolean {
  const active = document.activeElement
  const root = rootScope(active)
  const current = active instanceof HTMLElement && active !== document.body && active.closest<HTMLElement>(FOCUSABLE)
  if (!current || !(root === document || (root as Element).contains(current))) {
    return focusFirst(root)
  }
  const linked = linkedTarget(current, root, dir)
  if (linked) {
    focusEl(linked)
    return true
  }
  const from = current.getBoundingClientRect()
  // Elements behind data-focus-vertical-only (seen from outside it): a last resort for Up/Down, never Left/Right.
  const lastResort = (c: Element) => {
    const vOnly = c.closest('[data-focus-vertical-only]')
    return !!vOnly && !vOnly.contains(current)
  }
  const search = (fallback: boolean): boolean => {
    // Try the innermost group first, then each enclosing group, then the whole root scope.
    let group: Element | null = current.parentElement?.closest('[data-focus-group]') ?? null
    const tried = new Set<HTMLElement>()
    for (;;) {
      const scope: ParentNode = group && (root === document || (root as Element).contains(group)) ? group : root
      const cands = candidatesIn(scope, current).filter((c) => !tried.has(c) && lastResort(c) === fallback)
      const rects = cands.map((c) => c.getBoundingClientRect())
      const idx = pickNext(from, rects, dir)
      if (idx >= 0) {
        const horizontal = dir === 'left' || dir === 'right'
        if (horizontal && gap(from.top, from.bottom, rects[idx].top, rects[idx].bottom) > 0 && beamEdge?.(dir, current)) return false
        focusEl(resolveEntry(current, cands[idx], dir))
        return true
      }
      cands.forEach((c) => tried.add(c))
      if (scope === root) return false
      group = group?.parentElement?.closest('[data-focus-group]') ?? null
    }
  }
  return search(false) || ((dir === 'up' || dir === 'down') && search(true))
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'image', 'color', 'file'].includes(el.type)
  }
  return false
}

function isNativeActivator(el: HTMLElement): boolean {
  return (
    el instanceof HTMLButtonElement ||
    el instanceof HTMLAnchorElement ||
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement ||
    el.tagName === 'SUMMARY'
  )
}

function onKeyDown(e: KeyboardEvent) {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
  if (isTypingTarget(e.target)) return
  const dir = KEY_DIRECTIONS[e.key]
  if (dir) {
    if (e.shiftKey) return
    if (moveFocus(dir)) e.preventDefault()
    return
  }
  if (e.key === 'Enter' || e.key === ' ') {
    const t = e.target
    if (t instanceof HTMLElement && t.matches(FOCUSABLE) && !isNativeActivator(t)) {
      e.preventDefault()
      t.click()
    }
  }
}

/**
 * Installs the global handler (bubble phase, so component handlers run first and can preventDefault).
 * Pointer movement never moves focus; only clicks focus what they hit, as browsers do.
 */
export function initSpatialNav(target: Window = window): () => void {
  target.addEventListener('keydown', onKeyDown)
  target.addEventListener('focusin', rememberFocus, true)
  return () => {
    target.removeEventListener('keydown', onKeyDown)
    target.removeEventListener('focusin', rememberFocus, true)
  }
}
