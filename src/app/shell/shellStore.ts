// Runtime state of the app shell (drawer open state, "More", back-button visibility, Home reload).
import { useEffect } from 'react'
import { create } from 'zustand'

/** Why the drawer is expanded. Upstream: open iff the drawer has focus. */
export interface DrawerOpenReasons {
  /** mouse is over the rail (after the hover-intent delay) */
  hover: boolean
  /** keyboard focus is inside the drawer */
  focus: boolean
  /** expanded by a tap on a touch device, or the phone sheet is shown */
  pinned: boolean
}

interface ShellState extends DrawerOpenReasons {
  /** "More" section expanded (NavDrawerState.moreExpanded) */
  moreExpanded: boolean
  /** number of mounted pages that asked to hide the floating Back button */
  backHidden: number
  /** bumps when the Home entry is clicked while on Home (upstream reloadHome) */
  homeReload: number
}

export const useShellStore = create<ShellState>()(() => ({
  hover: false,
  focus: false,
  pinned: false,
  moreExpanded: false,
  backHidden: 0,
  homeReload: 0,
}))

export const isDrawerOpen = (s: DrawerOpenReasons) => s.hover || s.focus || s.pinned

/** True while the drawer is expanded (TV DrawerValue.Open). */
export function useDrawerOpen(): boolean {
  return useShellStore(isDrawerOpen)
}

export function setDrawerReason(reason: keyof DrawerOpenReasons, value: boolean) {
  if (useShellStore.getState()[reason] !== value) useShellStore.setState({ [reason]: value })
}

export function closeDrawer() {
  useShellStore.setState({ hover: false, focus: false, pinned: false })
}

export function setMoreExpanded(value: boolean) {
  useShellStore.setState({ moreExpanded: value })
}

/**
 * A page that renders its own Back control (or must not show one, e.g. over video) hides the floating
 * shell Back button while it is mounted.
 */
export function useHideBackButton(hide = true) {
  useEffect(() => {
    if (!hide) return
    useShellStore.setState((s) => ({ backHidden: s.backHidden + 1 }))
    return () => useShellStore.setState((s) => ({ backHidden: s.backHidden - 1 }))
  }, [hide])
}

export function bumpHomeReload() {
  useShellStore.setState((s) => ({ homeReload: s.homeReload + 1 }))
}
