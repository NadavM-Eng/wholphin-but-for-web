import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { bringIntoView } from './bringIntoView'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

/** Tab-reachable, visible descendants of `root` in DOM order. */
export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.tabIndex >= 0 && !el.hasAttribute('inert') && el.getClientRects().length > 0,
  )
}

/**
 * Move focus among `items` with ArrowUp/ArrowDown (wrapping by default, like upstream `lazyListWrapScrolling`).
 * Skips events another handler already consumed (the global spatial navigator), so the two never
 * both move focus. The newly focused item is scrolled to the TV's pivot. Returns true when handled.
 */
export function handleListArrowKeys(
  e: KeyboardEvent | ReactKeyboardEvent,
  root: HTMLElement,
  selector = '[data-focusable]',
  /** false: a plain list (no wrap); at either end the key is left to the page's arrow-key navigation */
  wrap = true,
): boolean {
  if (e.defaultPrevented || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return false
  const items = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((el) => el.getClientRects().length > 0)
  if (items.length === 0) return false
  const idx = items.indexOf(document.activeElement as HTMLElement)
  const to = e.key === 'ArrowDown' ? idx + 1 : idx - 1
  if (!wrap && idx >= 0 && (to < 0 || to >= items.length)) return false
  const next = items[(to + items.length) % items.length]
  e.preventDefault()
  next.focus({ preventScroll: true })
  bringIntoView(next)
  return true
}
