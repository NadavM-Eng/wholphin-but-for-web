import { useEffect, useRef, useSyncExternalStore, type RefObject } from 'react'
import { useLocation } from 'react-router'
import { create } from 'zustand'

/** Below this width (CSS px) there is no rail: a menu button opens the drawer as an overlay sheet. */
export const COMPACT_MAX_WIDTH = 599.98
const COMPACT_QUERY = `(max-width: ${COMPACT_MAX_WIDTH}px)`

function subscribe(cb: () => void) {
  const mq = window.matchMedia(COMPACT_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** True on phone widths (overlay-sheet drawer, top bar). */
export function useCompactLayout(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(COMPACT_QUERY).matches,
    () => false,
  )
}

/**
 * Space a page must leave free at the top-end so its content does not run under the clock, like
 * TabbedPage's tab row (end padding 184dp when the clock is shown, TabbedPage.kt:156-176). 0 on phones,
 * where the clock sits in the top bar. In CSS use `var(--shell-clock-reserve)` (and
 * `var(--shell-back-reserve)` for the floating Back button at the top-start).
 */
export const CLOCK_RESERVE_DP = 184
/** Width the floating Back button occupies at the top-start of the content area (40dp + 8dp gap). */
export const BACK_RESERVE_DP = 48

export interface ShellLayout {
  /** phone layout (no rail; top bar with menu, back and clock) */
  compact: boolean
  /** the overlay clock is shown at the top-end (reserve CLOCK_RESERVE_DP there) */
  clockOverlay: boolean
  /** the floating Back button is shown at the top-start (reserve BACK_RESERVE_DP there) */
  backOverlay: boolean
}

/** Written by the mounted layout (AppShell or FullScreenLayout), reset when it unmounts. */
export const useShellLayoutStore = create<Omit<ShellLayout, 'compact'>>()(() => ({ clockOverlay: false, backOverlay: false }))

/** What the shell currently overlays on the page (for pages laying out their top row). */
export function useShellLayout(): ShellLayout {
  const compact = useCompactLayout()
  const clockOverlay = useShellLayoutStore((s) => s.clockOverlay)
  const backOverlay = useShellLayoutStore((s) => s.backOverlay)
  return { compact, clockOverlay, backOverlay }
}

/** Publishes the current layout's overlays to useShellLayout(); clears them when the layout unmounts. */
export function usePublishShellLayout(clockOverlay: boolean, backOverlay: boolean) {
  useEffect(() => {
    useShellLayoutStore.setState({ clockOverlay, backOverlay })
  }, [clockOverlay, backOverlay])
  useEffect(() => () => useShellLayoutStore.setState({ clockOverlay: false, backOverlay: false }), [])
}

/** NavDisplay's default transition, which Wholphin does not override: fade (tween 700, FastOutSlowIn). */
const FADE_MS = 700
let firstPageShown = false
let skipFade = false

/** The next page arrival shows without the fade (the page comes back from under the Settings panel). */
export function skipNextPageFade() {
  skipFade = true
}

/**
 * Fades the routed page in on every path change (and when a layout mounts after the first page).
 * `enabled` false: this page just appears (Settings, owner request).
 */
export function usePageFade(ref: RefObject<HTMLElement | null>, enabled = true) {
  const { pathname } = useLocation()
  const last = useRef<string | null>(null)
  useEffect(() => {
    const el = ref.current
    const prev = last.current
    last.current = pathname
    const skip = skipFade
    skipFade = false
    if (!el || skip) return
    if (!enabled) {
      firstPageShown = true
      return
    }
    if (!firstPageShown) {
      firstPageShown = true
      return
    }
    if (prev === pathname) return
    if (typeof el.animate !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' })
  }, [pathname, ref, enabled])
}
