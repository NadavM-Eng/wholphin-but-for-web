import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation } from 'react-router'
import { usePrefs } from '../stores/preferences'
import { IconButton, MaterialIcon } from '../ui'
import { BackButton } from './shell/BackButton'
import { Backdrop } from './shell/Backdrop'
import { startBackdropService } from './shell/backdropService'
import { Clock } from './shell/Clock'
import { selectionForStack, type DrawerSelection } from './shell/drawerItems'
import { NavDrawer } from './shell/NavDrawer'
import styles from './shell/AppShell.module.css'
import {
  contentEl,
  drawerEl,
  endPageArrival,
  expectPageArrival,
  focusContentFromDrawer,
  focusDrawerEntry,
  focusFromNowhere,
  focusPageWhenReady,
  installModalityTracking,
  isKeyboardModality,
  leaveBarToPage,
  registerShellElement,
} from './shell/shellFocus'
import { markShellMounted } from './shell/shellFlags'
import { closeDrawer, isDrawerOpen, setDrawerReason, setMoreExpanded, useShellStore } from './shell/shellStore'
import { drawerNavSettling, drawerVisitOf, useAppStack, useStackPaths } from './shell/useAppStack'
import { useBackKey } from './shell/useBackKey'
import { useDrawerItems } from './shell/useDrawerItems'
import { PAGE_ROOT_ATTR } from './shell/useFocusRestore'
import { useCompactLayout, usePageFade, usePublishShellLayout } from './shell/useShellLayout'
import { setBeamEdge } from './spatialNav'

function isTyping(el: Element | null) {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  return el instanceof HTMLInputElement && !['button', 'checkbox', 'radio', 'range', 'submit', 'reset'].includes(el.type)
}

/**
 * App shell for drawer pages (W/ui/nav/ApplicationContent.kt + NavDrawer.kt): backdrop behind everything,
 * the nav drawer (64dp rail that expands on hover / keyboard focus / tap; an overlay sheet on phones),
 * the page area shifted while the drawer is open, the clock at the top-end and a Back button.
 */
export function AppShell() {
  const { i18n, t } = useTranslation()
  const rtl = i18n.dir() === 'rtl'
  const location = useLocation()
  const compact = useCompactLayout()
  const showClock = usePrefs('showClock')
  const state = useDrawerItems()
  useEffect(() => markShellMounted(), [])
  const paths = useStackPaths((s) => s.paths)
  const { navigateFromDrawer, goHome } = useAppStack()
  const open = useShellStore(isDrawerOpen)
  const pinned = useShellStore((s) => s.pinned)
  const backHidden = useShellStore((s) => s.backHidden > 0)
  const homeReload = useShellStore((s) => s.homeReload)
  const isHome = location.pathname === '/'
  const showBack = !isHome && !backHidden
  const pageRef = useRef<HTMLElement | null>(null)
  const menuRef = useRef<HTMLElement | null>(null)
  const pendingPageFocus = useRef(false)
  /** The drawer activation started a navigation (false: Home was reloaded in place). */
  const navigated = useRef(false)

  // A drawer choice always shows a new page (upstream navigateToFromDrawer pushes a new destination), also when
  // it is the page already showing: the routed page is re-created for every drawer navigation. Its id
  // travels in the history entry's state; an entry without one (a page's own replace, Back) keeps the page.
  const visit = drawerVisitOf(location.state)
  const [drawerVisit, setDrawerVisit] = useState(visit)
  if (visit != null && visit !== drawerVisit) setDrawerVisit(visit)

  useEffect(() => {
    installModalityTracking()
    startBackdropService()
    return () => {
      // pointerleave/focusout never fire when the shell unmounts (e.g. Settings opened from the drawer)
      closeDrawer()
      endPageArrival()
    }
  }, [])

  // Selection highlight: walk the stack from the top; keep the previous one when nothing matches.
  const matched = useMemo(() => selectionForStack(paths, state), [paths, state])
  const [lastSelection, setLastSelection] = useState<DrawerSelection>('home')
  if (matched != null && matched !== lastSelection) setLastSelection(matched)
  const selection = matched ?? lastSelection

  usePageFade(pageRef)

  usePublishShellLayout(!compact && showClock, !compact && showBack)

  // Keyboard navigation scrolls the focused row to the TV's pivot, which can leave a row title or a header line
  // under the floating Back button (the TV has no such button). While the window is scrolled the button steps
  // aside for keyboard users, who have the Back keys; any pointer movement or focus on it shows it again (CSS).
  const backSlot = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const sync = () => backSlot.current?.toggleAttribute('data-scrolled', window.scrollY > 8)
    sync()
    window.addEventListener('scroll', sync, { passive: true })
    return () => window.removeEventListener('scroll', sync)
  }, [compact, showBack, location.key])

  // Leaving rail mode or navigating closes a tap-opened rail / the phone sheet.
  useEffect(() => {
    setDrawerReason('pinned', false)
    // not on the page that shows between the two steps of a drawer navigation from deeper in the stack
    if (pendingPageFocus.current && !drawerNavSettling()) {
      pendingPageFocus.current = false
      focusPageWhenReady()
    }
  }, [location.key, compact])

  const onAfterActivate = (keyboard: boolean) => {
    const wasSheet = compact
    closeDrawer()
    if (keyboard) {
      expectPageArrival()
      // The navigation ends in a new location (the effect above), however long the next page's module takes to
      // load. Home chosen on Home starts none: the page is re-created in place and the shell looks next frame.
      if (navigated.current) pendingPageFocus.current = true
      else focusPageWhenReady()
    } else {
      const a = document.activeElement
      if (a instanceof HTMLElement && drawerEl()?.contains(a)) a.blur()
    }
    if (wasSheet) menuRef.current?.blur()
  }

  // Arrow keys between page and drawer (TV: LEFT from the page's start edge enters the drawer).
  useEffect(() => {
    const toDrawer = rtl ? 'ArrowRight' : 'ArrowLeft'
    const toPage = rtl ? 'ArrowLeft' : 'ArrowRight'
    // before spatialNav (window): nothing focused -> the page's last focused element, else its first; the drawer
    // only when the page has none
    const onDocKey = (e: KeyboardEvent) => {
      if (!e.key.startsWith('Arrow') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      // Up in the music mini player: the bar's own handler (React's root listener, before this one) takes the key
      // and returns to the element it was entered from. Focus still in the bar: there was none (an empty page).
      if (e.key === 'ArrowUp' && leaveBarToPage()) e.preventDefault()
      if (e.defaultPrevented) return
      const a = document.activeElement
      // <main> itself holds focus after a drawer navigation to a page without focusable content
      if (a && a !== document.body && a !== pageRef.current) return
      // an open dialog or menu that lost focus (a press beside it): the key is the overlay's, not the page's
      // behind it (the navigator then starts from the top overlay's first element)
      if (document.querySelector('[data-focus-trap]:not([data-shell-trap])')) return
      // a page with nothing focusable (empty result, error, stub): the drawer is the only place to go, and the
      // music mini player below once the page has settled
      if (focusFromNowhere(e.key === toDrawer, !compact, e.key === 'ArrowDown')) e.preventDefault()
    }
    // after spatialNav: it could not move inside the trapped page/drawer
    const onWinKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const a = document.activeElement
      if (isTyping(a)) return
      if (e.key === toDrawer && !compact && contentEl()?.contains(a)) {
        if (focusDrawerEntry()) e.preventDefault()
      } else if (e.key === toPage && drawerEl()?.contains(a)) {
        if (focusContentFromDrawer()) e.preventDefault()
      }
    }
    // the rail is in the beam of every page element: a page candidate outside the beam loses to it (spatialNav)
    setBeamEdge((dir, from) => !compact && dir === (rtl ? 'right' : 'left') && !!contentEl()?.contains(from) && !!drawerEl())
    document.addEventListener('keydown', onDocKey)
    window.addEventListener('keydown', onWinKey)
    return () => {
      setBeamEdge(null)
      document.removeEventListener('keydown', onDocKey)
      window.removeEventListener('keydown', onWinKey)
    }
  }, [rtl, compact])

  // Back key (Escape): collapse "More", close the sheet, on Home open the drawer (NavDrawer.kt:297-310).
  useBackKey(() => {
    const s = useShellStore.getState()
    const inDrawer = !!drawerEl()?.contains(document.activeElement)
    if (compact && s.pinned) {
      if (s.moreExpanded) setMoreExpanded(false)
      else {
        closeDrawer()
        menuRef.current?.focus()
      }
      return true
    }
    if (inDrawer && s.moreExpanded) {
      setMoreExpanded(false)
      return true
    }
    if (isHome) {
      if (compact) {
        setDrawerReason('pinned', true)
        requestAnimationFrame(() => focusDrawerEntry())
      } else if (inDrawer) {
        // upstream: the second Back exits the app; a web page cannot, so return to the page instead
        if (!focusContentFromDrawer()) (document.activeElement as HTMLElement | null)?.blur()
      } else {
        focusDrawerEntry()
      }
      return true
    }
    return false
  })

  const openSheet = () => {
    setDrawerReason('pinned', true)
    if (isKeyboardModality()) requestAnimationFrame(() => focusDrawerEntry())
  }

  return (
    <div
      className={clsx(styles.shell, compact && styles.compact, rtl && styles.rtl, !compact && showClock && styles.clockOn, showBack && styles.backOn)}
      data-shell
    >
      <Backdrop drawerOpen={open && !compact} rtl={rtl} />
      {compact && pinned && <div className={styles.scrim} onClick={closeDrawer} aria-hidden="true" />}
      {!compact && pinned && (
        <div
          className={styles.catcher}
          aria-hidden="true"
          onPointerDown={(e) => {
            e.preventDefault()
            closeDrawer()
          }}
        />
      )}
      <NavDrawer
        mode={compact ? 'sheet' : 'rail'}
        open={compact ? pinned : open}
        state={state}
        selection={selection}
        onNavigateFromDrawer={(path) => {
          navigated.current = true
          navigateFromDrawer(path)
        }}
        onGoHome={() => {
          navigated.current = goHome()
        }}
        onAfterActivate={onAfterActivate}
      />
      <div
        ref={(el) => registerShellElement('content', el)}
        className={styles.content}
        data-open={(open && !compact) || undefined}
        data-focus-trap
        data-shell-trap
        tabIndex={-1}
      >
        {compact ? (
          <header className={styles.topBar}>
            <IconButton
              ref={menuRef}
              label={t('web_open_menu')}
              icon={<MaterialIcon name="menu" />}
              onClick={openSheet}
            />
            {showBack && <BackButton />}
            <span className={styles.spacer} />
            {showClock && <Clock placement="inline" />}
          </header>
        ) : (
          showBack && (
            // Left/Right from the page never stops on the corner Back button (the drawer is beside the page)
            <div ref={backSlot} className={styles.backSlot} data-focus-vertical-only>
              <BackButton className={styles.back} />
            </div>
          )
        )}
        <main
          ref={(el) => {
            pageRef.current = el
            registerShellElement('page', el)
          }}
          className={styles.page}
          // focusPageWhenReady's fallback for pages with nothing focusable (empty, error, stub): focus must
          // leave the collapsed drawer, and <main> only takes focus with a tabIndex
          tabIndex={-1}
          {...{ [PAGE_ROOT_ATTR]: '' }}
        >
          <Outlet key={`${homeReload}:${drawerVisit ?? ''}`} />
        </main>
      </div>
      {!compact && showClock && <Clock placement="overlay" />}
    </div>
  )
}
