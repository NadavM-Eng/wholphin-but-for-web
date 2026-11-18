import clsx from 'clsx'
import { useCallback, useEffect, useRef, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { useGoBack } from '../../app/shell'
import { useScrollRestore } from '../../app/useScrollRestore'
import styles from './SettingsLayout.module.css'

/** Last focused row per history entry, so Back lands on the row that opened the sub-screen (ST-5). */
const lastFocused = new Map<string, string>()

/** Touch-only device: no keyboard focus ring to start from, so the first row is not focused on open. */
const touchOnly = () => typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches

/** Focusable rows taking part in the wrap; the server-version banner is not a preference (isFirst skips it). */
function wrapItems(list: HTMLElement): HTMLElement[] {
  return Array.from(list.querySelectorAll<HTMLElement>('[data-focusable]')).filter(
    (el) =>
      el.getClientRects().length > 0 &&
      !(el as HTMLButtonElement).disabled &&
      !el.closest('[data-pref-id="ServerVersionWarning"]'),
  )
}

export type SettingsLayoutProps = {
  title: string
  children: ReactNode
  /** Content left of the panel (subtitle preview). Without it the area is empty like upstream. */
  aside?: ReactNode
  /** `panel`: 40% wide (PreferencesPage); `narrow`: 25% (SubtitleStylePage). */
  width?: 'panel' | 'narrow'
  /** Element id of the row to focus first when nothing is remembered. */
  initialFocusId?: string
}

/**
 * The upstream settings page frame (`PreferencesPage`, PreferencesContent.kt:798-828): background, and a
 * panel at the end edge (40% wide, full height, surface at 1dp) that fades and slides in from half its
 * width, with a centered headlineSmall title and a 16dp padded list. Full width on phones.
 * Escape / browser Back / the shell's floating Back button close it; clicking the empty area closes it too.
 */
export function SettingsLayout({ title, children, aside, width = 'panel', initialFocusId }: SettingsLayoutProps) {
  // Escape and the floating Back button are the shell's (FullScreenLayout); a click on the empty area is Back too
  const back = useGoBack()
  const location = useLocation()
  const listRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useScrollRestore<HTMLDivElement>('settings')
  const setListRef = useCallback(
    (el: HTMLDivElement | null) => {
      listRef.current = el
      scrollRef(el)
    },
    [scrollRef],
  )

  // Focus the remembered row (Back) or the first row (upstream focusRequester on open).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const list = listRef.current
      if (!list || list.contains(document.activeElement)) return
      const remembered = lastFocused.get(location.key)
      if (!remembered && touchOnly()) return
      const id = remembered ?? initialFocusId
      const el =
        (id && list.querySelector<HTMLElement>(`[data-pref-id="${CSS.escape(id)}"] [data-focusable], [data-pref-id="${CSS.escape(id)}"][data-focusable]`)) ||
        list.querySelector<HTMLElement>('[data-focusable]')
      el?.focus({ preventScroll: true })
      el?.scrollIntoView({ block: 'nearest' })
    })
    return () => cancelAnimationFrame(raf)
  }, [location.key, initialFocusId])

  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-pref-id]')
    if (row?.dataset.prefId) lastFocused.set(location.key, row.dataset.prefId)
  }

  // lazyListWrapScrolling (W/preferences/Extensions.kt:32-71): Up on the first row focuses the last, Down on
  // the last focuses the first. Other moves are left to the global spatial navigator.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const list = listRef.current
    const active = document.activeElement
    if (!list || !(active instanceof HTMLElement) || !list.contains(active)) return
    const items = wrapItems(list)
    if (items.length < 2) return
    const current = active.closest<HTMLElement>('[data-focusable]')
    const first = items[0]
    const last = items[items.length - 1]
    const target = e.key === 'ArrowDown' && current === last ? first : e.key === 'ArrowUp' && current === first ? last : null
    if (!target) return
    e.preventDefault()
    target.focus({ preventScroll: true })
    // animateScrollToItem(0) / (totalItemsCount - 1): the list goes to its very top (banner and first group
    // header visible again) or its very end, not just far enough to show the target row.
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
    list.scrollTo({ top: target === first ? 0 : list.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }

  return (
    <div className={clsx(styles.page, width === 'narrow' && styles.narrow, aside != null && styles.withAside)}>
      {aside != null ? (
        <div className={styles.aside}>{aside}</div>
      ) : (
        <div className={styles.empty} onClick={back} aria-hidden />
      )}
      <section className={styles.panel} aria-label={title}>
        <header className={styles.header}>
          <h1 className={styles.title}>{title}</h1>
        </header>
        <div ref={setListRef} className={styles.list} onFocus={onFocus} onKeyDown={onKeyDown} data-settings-list>
          {children}
        </div>
      </section>
    </div>
  )
}
