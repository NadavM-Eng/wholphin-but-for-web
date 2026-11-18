import type { KeyboardEvent } from 'react'
import { focusInto } from '../../../app/spatialNav'

/**
 * Entering the letter column from the grid lands on the current letter (`AlphabetButtons`
 * `focusProperties.onEnter`, W/ui/detail/CardGrid.kt), not on the letter level with the card that spatial
 * navigation would pick. Call from the grid scroller's keydown for a card in the last column; returns true
 * when it moved focus.
 */
export function enterLetterColumn(e: KeyboardEvent<HTMLElement>, lastColumn: boolean): boolean {
  if (!lastColumn || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return false
  const scroller = e.currentTarget
  const towardEnd = getComputedStyle(scroller).direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
  if (e.key !== towardEnd) return false
  // the scroller sits in the grid box, a sibling of the letter column
  const letter = scroller.parentElement?.parentElement?.querySelector<HTMLElement>('[data-letter][aria-current]')
  if (!letter) return false
  e.preventDefault()
  letter.focus()
  return true
}

/**
 * The way back: the key that points from the letter column at the grid returns to the card focused there last
 * (W/ui/detail/CardGrid.kt: focusRestorer on the grid), else to its first card. The letters are not level with
 * a card row in every window; with nothing in the key's beam the shell would take the key for the nav drawer.
 * Call from the keydown of the letter column's wrapper (a sibling of the grid box); returns true when it moved
 * focus.
 */
export function leaveLetterColumn(e: KeyboardEvent<HTMLElement>): boolean {
  if (e.defaultPrevented || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return false
  const column = e.currentTarget
  const rtl = getComputedStyle(column).direction === 'rtl'
  if (e.key !== (rtl ? 'ArrowRight' : 'ArrowLeft')) return false
  const grid = column.parentElement?.querySelector<HTMLElement>('[data-focus-enter="last"]')
  if (!grid || !focusInto(grid, rtl ? 'right' : 'left')) return false
  e.preventDefault()
  return true
}
