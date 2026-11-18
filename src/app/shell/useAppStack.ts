import { useCallback, useLayoutEffect } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router'
import { create } from 'zustand'
import { clearBackdrop } from '../backdrop'
import { nav } from '../nav'
import {
  historyIndex,
  loadStack,
  planDrawerNav,
  planGoHome,
  saveStack,
  stackPaths,
  updateStack,
  type StackEntry,
} from './historyMirror'
import { bumpHomeReload } from './shellStore'

let entries: (StackEntry | null)[] | null = null
let pendingReplace: string | null = null
/** The Back half of a drawer navigation has landed and its replace half is on its way. */
let settling = false
let drawerVisits = 0
/** Distinct from the numbers of an earlier load of the tab: the entry's state outlives a reload. */
const LOAD_ID = Date.now().toString(36)
const getEntries = () => (entries ??= loadStack())

/**
 * `location.state` of the entry a drawer navigation creates. Upstream pushes a new destination for every drawer
 * choice, also for the page that is already showing; the shell re-creates the routed page when this id changes
 * (AppShell), so choosing the current page's own entry gives a new page, not the kept one.
 */
export interface DrawerVisitState {
  drawerVisit: string
}
const visitState = (): DrawerVisitState => ({ drawerVisit: `${LOAD_ID}:${++drawerVisits}` })
export function drawerVisitOf(state: unknown): string | null {
  const v = (state as Partial<DrawerVisitState> | null)?.drawerVisit
  return typeof v === 'string' ? v : null
}

/**
 * True between the two steps of a drawer navigation from deeper in the stack (go back to the [Home, X] entry,
 * then replace it): the page that shows for that moment is not the destination.
 */
export const drawerNavSettling = () => settling

/** Upstream-style back stack (paths, Home first) of the current history entry. */
export const useStackPaths = create<{ paths: string[] }>()(() => ({ paths: [] }))

/**
 * Keeps the history mirror in sync with every navigation. Mounted once at the root so full-screen pages
 * (Settings, playback) are recorded too.
 */
export function useStackMirror() {
  const location = useLocation()
  const navType = useNavigationType()
  const navigate = useNavigate()
  const path = location.pathname + location.search
  useLayoutEffect(() => {
    const idx = historyIndex()
    entries = updateStack(getEntries(), idx, path, navType)
    saveStack(entries)
    useStackPaths.setState({ paths: stackPaths(entries, idx) })
    settling = false
    if (pendingReplace && navType === 'POP') {
      const to = pendingReplace
      pendingReplace = null
      settling = true
      void navigate(to, { replace: true, state: visitState() })
    }
  }, [location.key, path, navType, navigate])
}

export interface AppStack {
  /** NavigationManager.navigateToFromDrawer: the stack becomes [Home, path] */
  navigateFromDrawer: (path: string) => void
  /** Home entry: goToHome, or reloadHome + clearBackdrop when already on Home. False when it reloaded in place (no navigation). */
  goHome: () => boolean
}

export function useAppStack(): AppStack {
  const navigate = useNavigate()

  const navigateFromDrawer = useCallback(
    (to: string) => {
      const plan = planDrawerNav(getEntries(), historyIndex())
      if (plan.kind === 'replace') void navigate(to, { replace: true, state: visitState() })
      else if (plan.kind === 'popThenReplace') {
        pendingReplace = to
        void navigate(plan.delta)
      } else void navigate(to, { state: visitState() })
    },
    [navigate],
  )

  const goHome = useCallback(() => {
    const plan = planGoHome(getEntries(), historyIndex())
    if (plan.kind === 'reload') {
      // reloadHome(): a fresh Home and the backdrop cleared. Only Home's own data reloads (the remounted
      // HomePage resets its rows, like a new HomeViewModel); the drawer's views are not refetched.
      clearBackdrop()
      bumpHomeReload()
      window.scrollTo({ top: 0 })
      return false
    }
    if (plan.kind === 'pop') void navigate(plan.delta)
    else void navigate(nav.home())
    return true
  }, [navigate])

  return { navigateFromDrawer, goHome }
}
