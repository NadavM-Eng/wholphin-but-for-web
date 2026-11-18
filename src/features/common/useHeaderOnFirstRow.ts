import { useEffect, useState } from 'react'

/**
 * True when keyboard focus inside `scope` is on the first row of its content: the first `[data-row]` (the
 * Discover tab's rows) or row 0 of a CardGrid (`[data-grid-index]` cells inside a `[data-index]` row).
 * Anything else (sort / filter buttons, the search field) counts as the first row.
 */
export function isFirstRowFocus(target: Element, scope: Element): boolean {
  const row = target.closest('[data-row]')
  if (row && scope.contains(row)) return row === scope.querySelector('[data-row]')
  const cell = target.closest('[data-grid-index]')
  if (cell && scope.contains(cell)) return cell.parentElement?.getAttribute('data-index') === '0'
  return true
}

/**
 * SE-15 (DiscoverPage.kt `positionCallback`, DiscoverRequestGrid.kt `showHeader`): the header (tab strip,
 * "more" grid title and controls) hides once keyboard focus leaves the first row and returns when it comes
 * back. Web adaptation: only keyboard focus (`:focus-visible`) hides it; any pointer, wheel or touch input
 * shows it again, since mouse and touch users scroll instead of moving focus. `resetKey` changes (a new tab)
 * start from `initial` again. `scope` is an element (callback-ref state), since it may mount after the page
 * (SeerrGate renders its children only once Seerr is linked).
 */
export function useHeaderOnFirstRow(scope: HTMLElement | null, initial = true, resetKey?: unknown): boolean {
  const [state, setState] = useState({ key: resetKey, show: initial })
  if (state.key !== resetKey) setState({ key: resetKey, show: initial })

  useEffect(() => {
    const el = scope
    if (!el) return
    const onFocus = (e: FocusEvent) => {
      const target = e.target as Element
      if (!target.matches(':focus-visible')) return
      const show = isFirstRowFocus(target, el)
      setState((s) => (s.show === show ? s : { ...s, show }))
    }
    const onPointer = () => setState((s) => (s.show ? s : { ...s, show: true }))
    el.addEventListener('focusin', onFocus)
    window.addEventListener('pointerdown', onPointer, { passive: true })
    window.addEventListener('wheel', onPointer, { passive: true })
    window.addEventListener('touchstart', onPointer, { passive: true })
    return () => {
      el.removeEventListener('focusin', onFocus)
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('wheel', onPointer)
      window.removeEventListener('touchstart', onPointer)
    }
  }, [scope])

  return state.key === resetKey ? state.show : initial
}
