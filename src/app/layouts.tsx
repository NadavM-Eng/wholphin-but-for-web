import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, ScrollRestoration, useLocation } from 'react-router'
import { ensureSeerrBinding, useSeerrStore } from '../api/seerr'
import { useSessionStore } from '../stores/session'
import { clearBackdrop } from './backdrop'
import { LoadingScreen } from './LoadingScreen'
import { nav } from './nav'
import { BackButton } from './shell/BackButton'
import { Backdrop } from './shell/Backdrop'
import { startBackdropService } from './shell/backdropService'
import styles from './shell/FullScreenLayout.module.css'
import { PageUnderlay } from './shell/PageUnderlay'
import { dropPageSnapshot, isPanelPath } from './shell/pageSnapshot'
import { installModalityTracking } from './shell/shellFocus'
import { setDiscoverEnabled } from './shell/shellFlags'
import { useShellStore } from './shell/shellStore'
import { leftUserDeliberately } from './shell/switchUser'
import { useStackMirror } from './shell/useAppStack'
import { useBackKey } from './shell/useBackKey'
import { PAGE_ROOT_ATTR, useFocusRestore } from './shell/useFocusRestore'
import { usePageFade, usePublishShellLayout } from './shell/useShellLayout'
import { ToastContainer } from './ToastContainer'
import { installSearchDiscoverProvider } from '../features/discover/searchProvider'
import { MusicHost } from '../features/music/MusicHost'
import { useSetupTarget } from './useSetupTarget'

/**
 * Root of every route: waits for the startup restore, then renders; hosts toasts, window scroll restoration,
 * focus restoration on Back and the history mirror the drawer uses.
 */
export function RootLayout() {
  const status = useSessionStore((s) => s.status)
  useStackMirror()
  useFocusRestore()
  useEffect(() => installModalityTracking(), [])
  return (
    <>
      {status === 'ready' ? <Outlet /> : <LoadingScreen />}
      <ScrollRestoration getKey={(location) => location.key} />
      <ToastContainer />
    </>
  )
}

/**
 * Auth guard for everything that needs a signed-in user (upstream SetupDestination.AppContent).
 * Redirects to setup with `?next=` so the deep link is reopened after sign-in, except after the drawer's
 * profile entry: a deliberate user switch starts the next session at Home.
 */
export function RequireSession() {
  const current = useSessionStore((s) => s.current)
  const target = useSetupTarget()
  const location = useLocation()
  if (!current) {
    const next = leftUserDeliberately() ? '/' : location.pathname + location.search
    const to = target === 'users' ? nav.users(next === '/' ? null : next) : nav.servers(next === '/' ? null : next)
    return <Navigate to={to} replace />
  }
  return <SignedIn />
}

function SignedIn() {
  // signed out (also from Settings): the copy of the page behind Settings goes with the session
  useEffect(() => () => dropPageSnapshot(), [])
  return (
    <>
      <DiscoverDrawerFlag />
      <MusicHost />
      <Outlet />
    </>
  )
}

/**
 * Drives the drawer's Discover entry and the search page's Seerr results from the Seerr connection (NavDrawerService.kt:64 combines
 * SeerrServerRepository.active = connection Success && api active): shown only while this user is signed in
 * to Seerr. Without a Seerr proxy in the deployment the status is 'unavailable' and it never shows.
 * Mounted for every signed-in route so full-screen pages (Settings' drawer pins dialog) see the same flag.
 */
function DiscoverDrawerFlag() {
  const linked = useSeerrStore((s) => s.status === 'linked')
  useEffect(() => ensureSeerrBinding(), [])
  useEffect(() => setDiscoverEnabled(linked), [linked])
  // the search page's "Discover" results (searchExtensions); the provider itself checks the link status
  useEffect(() => installSearchDiscoverProvider(), [])
  return null
}

/** Setup screens (server list, user list, login). No session required. */
export function SetupLayout() {
  return (
    <main data-setup>
      <Outlet />
    </main>
  )
}

/**
 * Full-screen destinations rendered without the nav drawer (upstream `Destination(fullScreen = true)`).
 * Clears the backdrop on entry (DestinationContent.kt:68-70); the Backdrop layer is still drawn underneath,
 * as ApplicationContent draws it under every destination, so a full-screen page may submit one. Shows a
 * floating Back button that a page can hide with useHideBackButton() (e.g. the player, which has its own
 * controls). Settings opens as a panel: the page it was opened from shows behind it (PageUnderlay).
 */
export function FullScreenLayout() {
  const { i18n } = useTranslation()
  const panel = isPanelPath(useLocation().pathname)
  const backHidden = useShellStore((s) => s.backHidden > 0)
  // Settings places its own Back button where it needs one (SettingsLayout); this one would lie on its panel,
  // and a page can only hide it after it has shown for a frame
  const showBack = !backHidden && !panel
  const pageRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    startBackdropService()
    clearBackdrop()
  }, [])
  useBackKey()
  usePageFade(pageRef, !panel)
  usePublishShellLayout(false, showBack)
  return (
    <div data-fullscreen className={styles.root} data-back={showBack ? '' : undefined}>
      <Backdrop rtl={i18n.dir() === 'rtl'} />
      {panel && <PageUnderlay />}
      {showBack && (
        <div className={styles.backSlot}>
          <BackButton className={styles.back} />
        </div>
      )}
      <div ref={pageRef} className={styles.page} {...{ [PAGE_ROOT_ATTR]: '' }}>
        <Outlet />
      </div>
    </div>
  )
}
