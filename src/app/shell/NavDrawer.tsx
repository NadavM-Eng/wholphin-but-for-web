import clsx from 'clsx'
import { useEffect, useRef, type FocusEvent, type MouseEvent, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useUserImageUrl } from '../../api/images'
import { useSession } from '../../api/session'
import { DrawableIcon, FaIcon, MaterialIcon } from '../../ui'
import { nav } from '../nav'
import type { DrawerIcon, DrawerItem, DrawerSelection, DrawerState } from './drawerItems'
import styles from './NavDrawer.module.css'
import { NavDrawerItem } from './NavDrawerItem'
import { pivotScrollTop } from '../../ui/lib/bringIntoView'
import { ProfileAvatar } from './ProfileAvatar'
import { useShellFlags } from './shellFlags'
import { isKeyboardModality, lastPointer, registerShellElement } from './shellFocus'
import { setDrawerReason, setMoreExpanded, useShellStore } from './shellStore'
import { switchUserFromDrawer } from './switchUser'

/** Hover-intent delay before the rail expands under the mouse. */
const HOVER_OPEN_MS = 150
const HOVER_CLOSE_MS = 80

export type NavDrawerProps = {
  /** 'rail': 64dp column that expands in place; 'sheet': phone overlay */
  mode: 'rail' | 'sheet'
  open: boolean
  state: DrawerState
  selection: DrawerSelection | null
  onNavigateFromDrawer: (path: string) => void
  onGoHome: () => void
  /** called after an entry was activated (the shell moves focus into the page) */
  onAfterActivate: (keyboard: boolean) => void
}

function ItemIcon({ icon }: { icon: DrawerIcon }) {
  return icon.kind === 'fa' ? <FaIcon name={icon.name} size={16} /> : <DrawableIcon name={icon.name} size={24} />
}

/**
 * W/ui/nav/NavDrawer.kt + NavigationDrawerAndroid.kt. Profile, Now playing, then the scrolling list: Search,
 * Home, pinned items, "More" (+ its items when expanded), Settings pinned to the bottom.
 */
export function NavDrawer({ mode, open, state, selection, onNavigateFromDrawer, onGoHome, onAfterActivate }: NavDrawerProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const session = useSession()
  const flags = useShellFlags()
  const moreExpanded = useShellStore((s) => s.moreExpanded)
  const rootRef = useRef<HTMLElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const hoverTimer = useRef(0)
  const pivotFrame = useRef(0)
  // Upstream always requests the user image and falls back to the letter on error; without a known
  // image tag the web skips the request (it would 404 for users without an image).
  const userImageUrl = useUserImageUrl(session?.user.id, session?.user.primaryImageTag)
  const userImage = session?.user.primaryImageTag ? userImageUrl : null

  useEffect(
    () => () => {
      window.clearTimeout(hoverTimer.current)
      cancelAnimationFrame(pivotFrame.current)
    },
    [],
  )

  // Keyboard focus in the list scrolls it like the TV's LazyColumn (the pivot rule of src/ui/lib/bringIntoView.ts). It runs a frame later,
  // after the arrow-key navigator's own "nearest" scroll; hover and touch never scroll the list.
  const pivotTo = (item: EventTarget) => {
    const list = listRef.current
    if (!list || !(item instanceof HTMLElement) || !list.contains(item) || !isKeyboardModality()) return
    cancelAnimationFrame(pivotFrame.current)
    pivotFrame.current = requestAnimationFrame(() => {
      if (!item.isConnected) return
      const offset = item.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop
      const top = pivotScrollTop(offset, item.offsetHeight, list.clientHeight, list.scrollHeight)
      if (Math.abs(top - list.scrollTop) < 1) return
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      list.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' })
    })
  }

  // The Settings pages are loaded on demand: fetch them while the drawer is open, so the click opens them at once
  useEffect(() => {
    if (open) void import('../../features/settings/SettingsPage')
  }, [open])

  const activate = (fn: () => void) => {
    const keyboard = isKeyboardModality()
    fn()
    onAfterActivate(keyboard)
  }

  // ---- open/close: hover (mouse), keyboard focus-within, tap (touch) ----
  const onPointerEnter = (e: PointerEvent) => {
    if (mode !== 'rail' || e.pointerType === 'touch') return
    window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => setDrawerReason('hover', true), HOVER_OPEN_MS)
  }
  const onPointerLeave = (e: PointerEvent) => {
    if (mode !== 'rail' || e.pointerType === 'touch') return
    window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => setDrawerReason('hover', false), HOVER_CLOSE_MS)
  }
  const onFocus = (e: FocusEvent) => {
    if (mode === 'rail' && isKeyboardModality()) setDrawerReason('focus', true)
    pivotTo(e.target)
  }
  const onBlur = (e: FocusEvent) => {
    const next = e.relatedTarget
    if (!(next instanceof Node) || !rootRef.current?.contains(next)) setDrawerReason('focus', false)
  }
  // On touch tablets the first tap on the collapsed rail only expands it.
  const onClickCapture = (e: MouseEvent) => {
    if (mode === 'rail' && !open && lastPointer() === 'touch') {
      e.preventDefault()
      e.stopPropagation()
      setDrawerReason('pinned', true)
    }
  }

  const selectedHiddenInMore = !moreExpanded && state.moreItems.some((i) => i.id === selection)
  const focusTargetId = selectedHiddenInMore ? 'a_more' : selection

  // On the TV the list keeps the scroll position it had when the selected entry was focused (pivot rule), so
  // the collapsed rail shows the selected library even far down the list. A page reached without the drawer
  // (a link, a reload, Back) gets the same position here, as long as focus is not inside the list.
  const itemCount = state.items.length + (moreExpanded ? state.moreItems.length : 0)
  useEffect(() => {
    const list = listRef.current
    const item = list?.querySelector<HTMLElement>('[data-focus-target]')
    if (!list || !item || list.contains(document.activeElement)) return
    const offset = item.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop
    const top = pivotScrollTop(offset, item.offsetHeight, list.clientHeight, list.scrollHeight)
    if (Math.abs(top - list.scrollTop) >= 1) list.scrollTo({ top, behavior: 'auto' })
  }, [focusTargetId, itemCount, mode])

  const onItem = (item: DrawerItem) => activate(() => onNavigateFromDrawer(item.path))
  const itemLabel = (item: DrawerItem) =>
    item.kind === 'favorites' ? t('favorites') : item.kind === 'discover' ? t('discover') : (item.name ?? '')

  const user = session?.user
  const server = session?.server
  const userName = user?.name ?? user?.id ?? ''

  return (
    <nav
      ref={(el) => {
        rootRef.current = el
        registerShellElement('drawer', el)
      }}
      className={clsx(styles.drawer, mode === 'sheet' && styles.sheet)}
      data-open={open || undefined}
      data-focus-trap
      data-shell-trap
      data-shell-drawer={mode}
      inert={mode === 'sheet' && !open ? true : undefined}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      onClickCapture={onClickCapture}
    >
      {user && server && (
        <NavDrawerItem
          label={userName}
          data-drawer-id="profile"
          supporting={server.name ?? server.url}
          drawerOpen={open}
          leading={<ProfileAvatar userId={user.id} name={user.name} imageUrl={userImage} alpha={open ? 1 : 0.5} />}
          onActivate={() =>
            activate(() => {
              // switch user (upstream also stops music: MusicService does not exist yet on the web).
              // RequireSession redirects to the user list, without ?next (see switchUser.ts).
              switchUserFromDrawer()
            })
          }
        />
      )}
      {flags.nowPlayingEnabled && (
        <NavDrawerItem
          label={t('now_playing')}
          supporting={flags.nowPlayingTitle}
          drawerOpen={open}
          selected={selection === 'nowPlaying'}
          focusTarget={focusTargetId === 'nowPlaying'}
          href={nav.nowPlaying()}
          leading={<MaterialIcon name="play_arrow" className={styles.icon} />}
          onActivate={() => activate(() => void navigate(nav.nowPlaying()))}
        />
      )}
      <div ref={listRef} className={styles.list}>
        <NavDrawerItem
          label={t('search')}
          drawerOpen={open}
          selected={selection === 'search'}
          focusTarget={focusTargetId === 'search'}
          href={nav.search()}
          leading={<MaterialIcon name="search" className={styles.icon} />}
          onActivate={() => activate(() => onNavigateFromDrawer(nav.search()))}
        />
        <NavDrawerItem
          label={t('home')}
          drawerOpen={open}
          selected={selection === 'home'}
          focusTarget={focusTargetId === 'home'}
          href={nav.home()}
          leading={<MaterialIcon name="home" className={styles.icon} />}
          onActivate={() => activate(onGoHome)}
        />
        {state.items.map((item) => (
          <NavDrawerItem
            key={item.id}
            data-drawer-id={item.id}
            label={itemLabel(item)}
            drawerOpen={open}
            selected={selection === item.id}
            focusTarget={focusTargetId === item.id}
            href={item.path}
            leading={
              <span className={styles.icon}>
                <ItemIcon icon={item.icon} />
              </span>
            }
            onActivate={() => onItem(item)}
          />
        ))}
        {state.moreItems.length > 0 && (
          <NavDrawerItem
            data-drawer-id="a_more"
            label={t('more')}
            drawerOpen={open}
            focusTarget={focusTargetId === 'a_more'}
            ariaExpanded={moreExpanded}
            leading={
              <span className={styles.icon}>
                <FaIcon name="ellipsis" size={16} />
              </span>
            }
            trailing={<MaterialIcon name={moreExpanded ? 'arrow_drop_down' : 'chevron_left'} className={styles.moreArrow} />}
            onActivate={() => setMoreExpanded(!moreExpanded)}
          />
        )}
        {moreExpanded &&
          state.moreItems.map((item) => (
            <NavDrawerItem
              key={item.id}
              data-drawer-id={item.id}
              label={itemLabel(item)}
              drawerOpen={open}
              moreChild
              selected={selection === item.id}
              focusTarget={focusTargetId === item.id}
              href={item.path}
              leading={
                <span className={styles.icon}>
                  <ItemIcon icon={item.icon} />
                </span>
              }
              onActivate={() => onItem(item)}
            />
          ))}
        <div className={styles.footer}>
          <NavDrawerItem
            label={t('settings')}
            drawerOpen={open}
            href={nav.settings()}
            leading={<MaterialIcon name="settings" className={styles.icon} />}
            // Not through activate(): the drawer stays open until Settings is on screen (the shell closes it when it
            // unmounts). Closing it at the click showed the bare page between the drawer and the Settings panel,
            // which grows out of the open drawer.
            onActivate={() => void navigate(nav.settings())}
          />
        </div>
      </div>
    </nav>
  )
}
