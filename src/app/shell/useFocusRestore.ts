import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router'
import { bringIntoView } from '../../ui/lib/bringIntoView'
import { lastInput, setOpenersGoneHandler } from '../../ui/lib/inputModality'
import { focusPageFromNowhere } from './shellFocus'

// Restores the focused element when coming Back to a history entry (upstream keeps the focused row/card
// in the page's saved state). Pages can make the match exact with `data-focus-key="<stable id>"` on the
// focusable element; otherwise the element is found again by its href and position among the page's
// [data-focusable] elements. Focus inside `data-no-focus-restore` is not remembered.
//
// The same memory gives focus back when its element goes away under it without a navigation: a window resize
// makes a grid build its cards anew (other rows and columns) or drop the ones now far from view, and the focused
// card, or the card a still open dialog was opened from, is one of them (recoverLostFocus).

/** Marks the element that holds the routed page (AppShell's main, FullScreenLayout's root). */
export const PAGE_ROOT_ATTR = 'data-page-root'

interface Saved {
  key: string | null
  href: string | null
  index: number
  /**
   * Path of the page the focus was on. The first entry of every document load has the same history key
   * ("default"), so a URL opened in the same tab would otherwise get the focus position of the page before it.
   */
  path?: string
}

const STORAGE_KEY = 'wholphin.focus.v1'
const MAX = 200
const RESTORE_MS = 2500
/** How long after the last resize event a re-layout may still take focus away with a rebuilt element. */
const RESIZE_SETTLE_MS = 1000

function load(): Record<string, Saved> {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, Saved>
  } catch {
    return {}
  }
}

let cache: Record<string, Saved> | null = null
const all = () => (cache ??= load())

function persist() {
  const c = all()
  const keys = Object.keys(c)
  for (let i = 0; i < keys.length - MAX; i++) delete c[keys[i]]
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(c))
  } catch {
    // ignore
  }
}

function pageRoot(): Element | null {
  return document.querySelector(`[${PAGE_ROOT_ATTR}]`)
}

function focusables(root: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-focusable]'))
}

function describe(el: HTMLElement): Saved | null {
  const root = pageRoot()
  // The page root itself (<main tabIndex=-1>) is where focus is parked when a page has nothing to focus yet, and
  // what WebKit focuses first when a card is pressed: it is never the position to come back to.
  if (!root?.contains(el) || el === root) return null
  // pages whose focus starts nowhere (the photo viewer: keys act on the photo until OK opens the controls)
  if (el.closest('[data-no-focus-restore]')) return null
  const target = el.closest<HTMLElement>('[data-focusable]') ?? el
  const keyed = target.closest<HTMLElement>('[data-focus-key]')
  const saved = {
    key: keyed?.dataset.focusKey ?? null,
    href: target.getAttribute('href'),
    index: focusables(root).indexOf(target),
  }
  // nothing find() could match again (a scroll container, a text block): keep what was remembered before
  return saved.key == null && saved.href == null && saved.index < 0 ? null : saved
}

function visible(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

function find(saved: Saved): HTMLElement | null {
  const root = pageRoot()
  if (!root) return null
  if (saved.key) {
    const el = root.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(saved.key)}"]`)
    const f = el?.matches('[data-focusable]') ? el : el?.querySelector<HTMLElement>('[data-focusable]')
    if (f && visible(f)) return f
    return null
  }
  const list = focusables(root)
  const at = list[saved.index]
  if (at && visible(at) && (saved.href == null || at.getAttribute('href') === saved.href)) return at
  if (saved.href) {
    const byHref = list.find((e) => e.getAttribute('href') === saved.href && visible(e))
    if (byHref) return byHref
  }
  return null
}

/** The history entry on screen (the key its focus is remembered under). */
let shownEntry: string | null = null
/** The element that took focus last, and the history entry it did so on. Forgotten at a pointer press. */
let lastFocused: { el: HTMLElement; entry: string | null } | null = null

/**
 * Nothing holds focus, and the element that held it last is gone from the document while the page is still the
 * same: focus went away with its element (a new page takes its own first focus; focus the user put on nothing
 * stays there). A grid may build its cards anew inside the resize event itself, before any listener here runs,
 * so what was focused when the resize began cannot be asked then.
 */
function lostWithItsElement(): boolean {
  const a = document.activeElement
  return (!a || a === document.body) && lastFocused != null && !lastFocused.el.isConnected && lastFocused.entry === shownEntry
}

/**
 * Nothing holds focus because its element went away (not because the user put it nowhere): focus goes to the
 * same item again when the page still shows it (found as on Back: its key, its link, its place), else into the
 * page as an arrow key with nothing focused would (focusPageFromNowhere). Brought into view only when the
 * keyboard acted last: after a mouse or touch press the page does not move. Not while a dialog or menu is open
 * (the keys are the overlay's). `fallback: false` only looks for the same item (a re-layout that is still under
 * way may show it again in a moment). True when something took focus.
 */
export function recoverLostFocus(fallback = true): boolean {
  const a = document.activeElement
  if (a && a !== document.body) return false
  if (document.querySelector('[data-focus-trap]:not([data-shell-trap])')) return false
  const scroll = lastInput() === 'keyboard'
  const saved = shownEntry == null ? undefined : all()[shownEntry]
  const el = saved && (saved.path == null || saved.path === window.location.pathname) ? find(saved) : null
  if (el) {
    el.focus({ preventScroll: true })
    if (document.activeElement === el) {
      if (scroll) bringIntoView(el)
      return true
    }
  }
  return fallback && focusPageFromNowhere(scroll)
}

/** Remembers focus per history entry and puts it back on Back/Forward. Mount once at the root. */
export function useFocusRestore() {
  const location = useLocation()
  const navType = useNavigationType()
  const keyRef = useRef(location.key)

  useLayoutEffect(() => {
    keyRef.current = location.key
    shownEntry = location.key
  }, [location.key])

  // Focus whose element goes away without a navigation. An overlay that closes with every opener gone asks
  // through its handler; a window resize is watched here until its re-layout has settled. The user's next press
  // ends the watch.
  useEffect(() => {
    let raf = 0
    let until = 0
    // (during a resize the watch takes over at its end)
    setOpenersGoneHandler(() => void recoverLostFocus(raf === 0))
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }
    const tick = () => {
      raf = 0
      // while the re-layout runs only the same item is looked for; the page's first element once it has settled
      const settled = performance.now() >= until
      if (lostWithItsElement()) recoverLostFocus(settled)
      if (!settled) raf = requestAnimationFrame(tick)
    }
    const onResize = () => {
      until = performance.now() + RESIZE_SETTLE_MS
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const events = ['keydown', 'pointerdown'] as const
    window.addEventListener('resize', onResize)
    events.forEach((ev) => window.addEventListener(ev, stop, { capture: true, passive: true }))
    return () => {
      stop()
      setOpenersGoneHandler(null)
      window.removeEventListener('resize', onResize)
      events.forEach((ev) => window.removeEventListener(ev, stop, { capture: true }))
    }
  }, [])

  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      if (!(e.target instanceof HTMLElement)) return
      lastFocused = { el: e.target, entry: shownEntry }
      const d = describe(e.target)
      if (!d) return
      all()[keyRef.current] = { ...d, path: window.location.pathname }
      persist()
    }
    // a press puts focus where it lands (a focusin follows) or on nothing, which is then the user's choice
    const onPress = () => {
      lastFocused = null
    }
    document.addEventListener('focusin', onFocus)
    window.addEventListener('pointerdown', onPress, { capture: true, passive: true })
    return () => {
      document.removeEventListener('focusin', onFocus)
      window.removeEventListener('pointerdown', onPress, { capture: true })
    }
  }, [])

  useEffect(() => {
    if (navType !== 'POP') return
    const saved = all()[location.key]
    if (!saved || (saved.path != null && saved.path !== location.pathname)) return
    const start = performance.now()
    let raf = 0
    // A page may focus its default element on mount; the remembered element still wins until the user acts.
    const stop = () => cancelAnimationFrame(raf)
    const events = ['keydown', 'pointerdown', 'wheel', 'touchstart'] as const
    events.forEach((ev) => window.addEventListener(ev, stop, { capture: true, passive: true }))
    const tick = () => {
      const el = find(saved)
      if (el) {
        if (document.activeElement !== el) el.focus({ preventScroll: true })
        return
      }
      if (performance.now() - start < RESTORE_MS) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      stop()
      events.forEach((ev) => window.removeEventListener(ev, stop, { capture: true }))
    }
    // the path is read once per history entry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, navType])
}
