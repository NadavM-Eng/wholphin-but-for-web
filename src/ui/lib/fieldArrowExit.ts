export type ExitDirection = 'up' | 'down' | 'left' | 'right'

type Field = { value: string; selectionStart: number | null; selectionEnd: number | null }

type KeyLike = { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }

/**
 * Which way an arrow key should move focus out of a one-line text field, or null when the key belongs to the
 * caret. Up/Down always leave (a one-line field has no lines to move between; on TV the field is read-only until
 * activated, so the D-pad never edits); Left/Right leave only from the matching edge of the text, mirrored in RTL.
 * Used by the search page's header and the Add to playlist dialog's search field.
 */
export function fieldArrowExit(
  key: string,
  field: Field,
  rtl: boolean,
  modified: boolean,
): ExitDirection | null {
  if (modified) return null
  const len = field.value.length
  const atStart = field.selectionStart === 0 && field.selectionEnd === 0
  const atEnd = field.selectionStart === len && field.selectionEnd === len
  if (key === 'ArrowDown') return 'down'
  if (key === 'ArrowUp') return 'up'
  if (key === 'ArrowLeft' && (rtl ? atEnd : atStart)) return 'left'
  if (key === 'ArrowRight' && (rtl ? atStart : atEnd)) return 'right'
  return null
}

/** fieldArrowExit for a key event whose target is a text input (null for any other target). */
export function inputArrowExit(e: KeyLike & { target: EventTarget | null }): ExitDirection | null {
  const el = e.target
  if (!(el instanceof HTMLInputElement)) return null
  const rtl = getComputedStyle(el).direction === 'rtl'
  return fieldArrowExit(e.key, el, rtl, e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)
}
