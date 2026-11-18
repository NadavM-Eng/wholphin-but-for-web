import clsx from 'clsx'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { focusableIn, handleListArrowKeys } from '../lib/focus'
import { captureOpeners, focusFromScript, holdFocusLook, keepFocusThroughPress, liveOpener, registerOverlay, restoreFocusToOpeners } from '../lib/inputModality'
import { MENU_EDGE_MARGIN, menuPositionBelow } from '../lib/menuPosition'
import styles from './DropdownMenu.module.css'

export type MenuAnchor = HTMLElement | { x: number; y: number }

export type DropdownMenuProps = {
  open: boolean
  /** Element to drop below (sort/filter buttons), or a pointer position (right-click menus). */
  anchor: MenuAnchor | null
  onClose: () => void
  children: ReactNode
  label?: string
  /** Optional heading row (the context-menu title). */
  header?: ReactNode
  className?: string
  /**
   * Element to give focus back to on close. Default: an element anchor, else the focused element when the
   * menu opens, else the element just pressed (Safari does not focus what a click hits).
   */
  returnFocus?: HTMLElement | null
}

const MARGIN = MENU_EDGE_MARGIN
/** What a press gives focus to by itself. */
const FOCUS_TAKING = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]), [contenteditable="true"], [data-focusable]'

/**
 * Material3 `DropdownMenu` as Wholphin uses it with `TvDropdownMenuItem`s: 4dp radius container at
 * surface+3dp, 8dp vertical padding, 112-280dp wide. Positioned by M3's rule for an element anchor (below it,
 * above it, or 48dp from the window edge), or at the pointer. Esc / outside click close it; focus returns to where it was.
 */
export function DropdownMenu({ open, anchor, onClose, children, label, header, className, returnFocus }: DropdownMenuProps) {
  const menu = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  const returnFocusRef = useRef(returnFocus)
  // Point anchors are often fresh objects; key effects on their value, not identity.
  const anchorRef = useRef(anchor)
  // Declared before the effects below, so it runs first.
  useLayoutEffect(() => {
    anchorRef.current = anchor
    returnFocusRef.current = returnFocus
  })
  const anchorKey = anchor == null ? null : anchor instanceof HTMLElement ? anchor : `${anchor.x},${anchor.y}`

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    const el = menu.current
    if (!open || !anchor || !el) {
      setPos(null)
      return
    }
    const place = () => {
      // layout size: the opening animation scales the box, which must not move the menu
      const m = { width: el.offsetWidth, height: el.offsetHeight }
      if (anchor instanceof HTMLElement) {
        const next = menuPositionBelow(anchor, m)
        setPos((prev) => (prev && prev.left === next.left && prev.top === next.top ? prev : next))
        return
      }
      const vw = window.innerWidth
      const vh = window.innerHeight
      const rtl = getComputedStyle(document.documentElement).direction === 'rtl'
      let left = rtl ? anchor.x - m.width : anchor.x
      let top = anchor.y
      if (left + m.width > vw - MARGIN) left = anchor.x - m.width
      if (top + m.height > vh - MARGIN) top = anchor.y - m.height
      left = Math.min(Math.max(MARGIN, left), Math.max(MARGIN, vw - m.width - MARGIN))
      top = Math.min(Math.max(MARGIN, top), Math.max(MARGIN, vh - m.height - MARGIN))
      setPos((prev) => (prev && prev.left === left && prev.top === top ? prev : { left, top }))
    }
    place()
    // items that arrive later (filter values) change the menu's size: place it again
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(place)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open, anchorKey])

  useLayoutEffect(() => {
    if (!open) return
    const anchor = anchorRef.current
    const openers = captureOpeners(returnFocusRef.current ?? (anchor instanceof HTMLElement ? anchor : null))
    // for a dialog opened from one of the entries: the entry is gone with the menu
    if (menu.current) registerOverlay(menu.current, openers)
    // the button keeps its focused look under the open menu, as behind a dialog
    const release = holdFocusLook(liveOpener(openers))
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      // A press on the anchor button is left to its own click handler (which toggles the menu).
      if (anchor instanceof HTMLElement && anchor.contains(t)) return
      if (!menu.current || menu.current.contains(t)) return
      // A press on a control takes focus there as usual. One on empty space would only take it off the opener
      // that gets it back now (to the page area or to nothing).
      if (!(t instanceof Element && t.closest(FOCUS_TAKING))) keepFocusThroughPress(e)
      onCloseRef.current()
    }
    const onScrollOrResize = () => onCloseRef.current()
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('resize', onScrollOrResize)
      release()
      restoreFocusToOpeners(openers)
    }
  }, [open, anchorKey])

  // Focus the first item once the menu is placed: it is visibility:hidden until then and cannot take focus
  // (without this, Esc and the arrow keys did not reach a menu opened by a click or a keyboard press).
  const placed = open && pos != null
  useEffect(() => {
    if (!placed || !menu.current) return
    const first = focusableIn(menu.current)[0]
    if (first) focusFromScript(first)
  }, [placed])

  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <div
      ref={menu}
      role="menu"
      aria-label={label}
      data-focus-trap
      className={clsx(styles.menu, className)}
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || e.key === 'Tab') {
          e.preventDefault()
          e.stopPropagation()
          onCloseRef.current()
          return
        }
        if (menu.current) handleListArrowKeys(e, menu.current)
      }}
    >
      {header && <div className={styles.header}>{header}</div>}
      {children}
    </div>,
    document.body,
  )
}
