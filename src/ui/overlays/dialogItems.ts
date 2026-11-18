import type { ReactNode } from 'react'

/** One row of a `DialogPopup` / `ContextMenu` (upstream `DialogItem`). */
export type DialogItem = {
  kind?: 'item'
  /** Stable key; defaults to the index. */
  key?: string
  headline: ReactNode
  overline?: ReactNode
  supporting?: ReactNode
  /** Usually a `FaIcon` or `MaterialIcon`. */
  leading?: ReactNode
  trailing?: ReactNode
  /** Color of the leading icon (red for destructive / favorite, as upstream `iconColor`). */
  leadingColor?: string
  selected?: boolean
  disabled?: boolean
  onSelect: () => void
  /** Close after selecting even when the dialog's `dismissOnClick` is false. */
  dismissOnClick?: boolean
  /**
   * Stay open after selecting even when the dialog closes on click (upstream `DialogItem(dismissOnClick = false)`
   * in a menu: the dialog it opens shows on top of the menu, and Back / Escape returns to the menu).
   */
  keepOpen?: boolean
  href?: string
}

/** `DialogItemDivider`: a HorizontalDivider in a 16dp slot. */
export type DialogDivider = { kind: 'divider'; key?: string }

export type DialogEntry = DialogItem | DialogDivider

export function isDivider(e: DialogEntry): e is DialogDivider {
  return e.kind === 'divider'
}
