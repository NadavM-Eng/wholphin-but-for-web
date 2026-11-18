import clsx from 'clsx'
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { captureOpener, focusFromScript, restoreFocus } from '../../../ui'
import styles from './PlayerSheet.module.css'

export interface PlayerSheetProps {
  onClose: () => void
  label: string
  children: ReactNode
  /** `bottom-start` / `bottom-end`: BottomDialog gravity; `center`: plain Dialog (subtitle delay, search, help) */
  placement: 'bottom-start' | 'bottom-end' | 'center'
  /** surfaceColorAtElevation 1 or 3; 'scrim' = TransparentBlack50 (subtitle delay) */
  surface?: 1 | 3 | 'scrim'
  /** CSS selector inside the sheet for the first focus; default: the first focusable */
  initialFocus?: string
  /** Up on the first item goes to the last and Down on the last to the first (Captions dialog) */
  wrap?: boolean
  /** bottom sheets: a fixed line above the scrolling list (the title and Close button of a panel) */
  header?: ReactNode
  /** keys that close the sheet besides Escape / Backspace: the shortcut that opened it (lower case) */
  closeKeys?: readonly string[]
  className?: string
  style?: CSSProperties
}

const FOCUSABLE = 'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])'

/**
 * The player's dialogs. They render inside the player (not portalled to <body>) so they stay visible in
 * fullscreen and over the video without a dim (`setDimAmount(0f)`), 8dp from the screen edges with 8dp corners.
 * The bottom ones are `BottomDialog` (overlay/PlaybackControls.kt): a 424dp wide list on the surface color;
 * on the web they stand on the control strip instead of the screen's bottom edge (the strip's buttons open them).
 * Escape / Backspace / a click outside close them; focus is trapped for the arrow-key navigator and restored to
 * the opener on close.
 */
export function PlayerSheet({ onClose, label, children, placement, surface = 1, initialFocus, wrap, header, closeKeys, className, style }: PlayerSheetProps) {
  const panel = useRef<HTMLDivElement>(null)
  // BottomDialog (bottom-start / bottom-end): a list whose focused row may reach past the panel's sides
  const list = placement !== 'center'
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })

  useLayoutEffect(() => {
    // the focused control, or the one just pressed where a press does not focus it (src/ui/lib/inputModality)
    const opener = captureOpener()
    const p = panel.current
    const match = initialFocus ? p?.querySelector<HTMLElement>(initialFocus) : null
    const wanted = match && !match.matches(FOCUSABLE) ? match.querySelector<HTMLElement>(FOCUSABLE) : match
    const target = wanted ?? p?.querySelector<HTMLElement>(FOCUSABLE) ?? p
    if (target) focusFromScript(target)
    target?.scrollIntoView({ block: 'nearest' })
    return () => {
      if (!opener?.closest('[inert]')) restoreFocus(opener)
    }
    // initial focus is read once, when the sheet opens
  }, [])

  const onKeyDown = (e: KeyboardEvent) => {
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
    const again = !typing && !e.ctrlKey && !e.altKey && !e.metaKey && !!closeKeys?.includes(e.key.toLowerCase())
    if (e.key === 'Escape' || (e.key === 'Backspace' && !typing) || again) {
      e.preventDefault()
      e.stopPropagation()
      close.current()
      return
    }
    if (wrap && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && panel.current) {
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>('[data-focusable]'))
      const i = items.indexOf(e.target as HTMLElement)
      if (e.key === 'ArrowUp' && i === 0) {
        e.preventDefault()
        items[items.length - 1]?.focus()
        items[items.length - 1]?.scrollIntoView({ block: 'nearest' })
      } else if (e.key === 'ArrowDown' && i === items.length - 1) {
        e.preventDefault()
        items[0]?.focus()
        items[0]?.scrollIntoView({ block: 'nearest' })
      }
    }
    if (e.key === 'Tab' && panel.current) {
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  return (
    <div
      className={clsx(styles.backdrop, placement === 'center' ? styles.center : placement === 'bottom-end' ? styles.bottomEnd : styles.bottomStart)}
      data-player-sheet
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close.current()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        data-focus-trap
        className={clsx(
          styles.panel,
          list && styles.list,
          surface === 3 ? styles.surface3 : surface === 'scrim' ? styles.scrim : styles.surface1,
          className,
        )}
        style={style}
        onKeyDown={onKeyDown}
      >
        {list && header}
        {list ? <div className={styles.listScroll}>{children}</div> : children}
      </div>
    </div>
  )
}
