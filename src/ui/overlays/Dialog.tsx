import clsx from 'clsx'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { focusableIn } from '../lib/focus'
import { captureOpeners, focusFromScript, holdFocusLook, keepFocusThroughPress, liveOpener, registerOverlay, restoreFocusToOpeners } from '../lib/inputModality'
import styles from './Dialog.module.css'

export type DialogVariant = 'popup' | 'basic' | 'scrollable'

export type DialogProps = {
  open: boolean
  onClose: () => void
  children: ReactNode
  /**
   * `popup`: upstream `DialogPopup` shell (28dp radius, 24dp padding).
   * `basic`: `BasicDialog` (8dp radius, no padding; ConfirmDialog content brings its own).
   * `scrollable`: `ScrollableDialog` (600dp wide, max 380dp tall, 16dp padding, 8dp gap, 8dp radius).
   */
  variant?: DialogVariant
  /** Tonal elevation in dp: 1 (default dialogs) or 3 (context menus, scrollable). */
  elevation?: 1 | 3
  /** Accessible name. */
  label?: string
  /** Close on backdrop click (default true). */
  dismissOnBackdrop?: boolean
  className?: string
  style?: CSSProperties
  /** Element to focus first; default the first focusable descendant. */
  initialFocus?: () => HTMLElement | null | undefined
  /** Dim the page behind (default true); false for dialogs that set a 0 dim amount (View options). */
  scrim?: boolean
  /**
   * Element to give focus back to on close. Default: the focused element when the dialog opens, or the
   * element just pressed (Safari does not focus buttons and links on click, so focus would go to <body>).
   */
  returnFocus?: HTMLElement | null
}

/**
 * Modal shell for every overlay: portal into <body>, scrim, focus trap (`data-focus-trap` for the global
 * arrow-key navigator, plus a Tab cycle here), Esc and backdrop click close, focus is restored to the
 * element that opened it.
 */
export function Dialog({
  open,
  onClose,
  children,
  variant = 'popup',
  elevation,
  label,
  dismissOnBackdrop = true,
  className,
  style,
  initialFocus,
  scrim = true,
  returnFocus,
}: DialogProps) {
  const panel = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  // The opener is read while rendering the opening pass: a child with autoFocus takes focus when React commits,
  // before any effect here runs, and would then be mistaken for the opener (focus was lost on close).
  // With the openers behind it: a menu entry that opens this dialog is gone when its menu closes.
  const [opening, setOpening] = useState<{ open: boolean; openers: HTMLElement[] }>({ open: false, openers: [] })
  if (opening.open !== open) setOpening({ open, openers: open && typeof document !== 'undefined' ? captureOpeners(returnFocus) : [] })

  // Focus moves into the dialog; the opener keeps its focused look meanwhile and gets focus back on close.
  useLayoutEffect(() => {
    if (!open) return
    const p = panel.current
    const openers = opening.openers.filter((el) => !p?.contains(el))
    if (p) registerOverlay(p, openers)
    const release = holdFocusLook(liveOpener(openers))
    if (p) {
      // a child that asked for focus itself (autoFocus) keeps it unless the caller names the first element
      const target = initialFocus?.() ?? (p.contains(document.activeElement) ? null : (focusableIn(p)[0] ?? p))
      if (target) focusFromScript(target)
    }
    const root = document.documentElement
    const prevOverflow = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      root.style.overflow = prevOverflow
      release()
      restoreFocusToOpeners(openers)
    }
    // initialFocus, returnFocus and the opener are read once, when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Focus can end up outside the open dialog (a press beside a dialog on top of it in an engine that blurs, a
  // focused element removed from it): Escape still closes the top dialog. Its own handler below needs focus inside.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const overlays = '[data-focus-trap]:not([data-shell-trap])'
      const all = document.querySelectorAll(overlays)
      if (!panel.current || all[all.length - 1] !== panel.current || document.activeElement?.closest(overlays)) return
      e.preventDefault()
      onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!open || typeof document === 'undefined') return null

  const surfaceVar = (elevation ?? (variant === 'scrollable' ? 3 : 1)) === 3 ? 'var(--c-surface-3)' : 'var(--c-surface-1)'

  return createPortal(
    <div
      className={clsx(styles.backdrop, !scrim && styles.noScrim)}
      onPointerDown={(e) => {
        if (!dismissOnBackdrop || e.target !== e.currentTarget) return
        // the opener gets focus back while the dialog closes; the rest of this press must not take it away
        keepFocusThroughPress(e)
        onCloseRef.current()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        data-focus-trap
        className={clsx(styles.panel, styles[variant], className)}
        style={{ background: surfaceVar, ...style }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onCloseRef.current()
            return
          }
          if (e.key === 'Tab' && panel.current) {
            const items = focusableIn(panel.current)
            if (items.length === 0) {
              e.preventDefault()
              return
            }
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
          // ScrollableDialog: d-pad up/down scrolls the text by 100px.
          if (variant === 'scrollable' && !e.defaultPrevented && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            const t = e.target as HTMLElement
            if (t === panel.current) {
              e.preventDefault()
              panel.current.scrollBy({ top: e.key === 'ArrowDown' ? 100 : -100 })
            }
          }
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
