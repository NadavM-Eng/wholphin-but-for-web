import clsx from 'clsx'
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode, Ref } from 'react'
import { useLongPress } from '../lib/useLongPress'
import styles from './ListItem.module.css'

export type ListItemProps = {
  headline: ReactNode
  overline?: ReactNode
  supporting?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  selected?: boolean
  /** Stays focusable (aria-disabled), like a disabled tv ListItem. */
  disabled?: boolean
  /** `DenseListItem`: smaller heights, padding and type. */
  dense?: boolean
  /** Turn off the 1.05 focus scale (collection lists use scale 1.0). */
  noScale?: boolean
  onClick?: (e: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void
  onContextMenu?: (e: MouseEvent<HTMLElement>) => void
  href?: string
  /** ARIA role: `menuitem` in menus, `option`, `menuitemradio`… Default: a plain button/link. */
  role?: string
  /** `aria-checked` of a `switch` / `checkbox` row (no selected look). */
  checked?: boolean
  className?: string
  style?: CSSProperties
  ref?: Ref<HTMLElement>
}

/**
 * The tv-material3 `ListItem` look used in dialogs and settings (values from tv-material
 * `ListItemDefaults`): 8dp shape, 16/12dp padding, min height 48/56/64/80dp, transparent ->
 * inverseSurface / inverseOnSurface when focused, selected = secondaryContainer@.4, focused scale 1.05.
 */
export function ListItem({
  headline,
  overline,
  supporting,
  leading,
  trailing,
  selected,
  disabled,
  dense,
  noScale,
  onClick,
  onContextMenu,
  href,
  role,
  checked,
  className,
  style,
  ref,
}: ListItemProps) {
  const lines = 1 + (overline ? 1 : 0) + (supporting ? 1 : 0)
  const cls = clsx(
    styles.item,
    dense && styles.dense,
    lines === 2 && styles.two,
    lines === 3 && styles.three,
    leading != null && styles.hasLeading,
    selected && styles.selected,
    noScale && styles.noScale,
    onContextMenu && styles.hasMenu,
    className,
  )
  // A row with a context menu opens it on a touch long-press too: iOS Safari sends no contextmenu for touch
  // (same as CardFrame, src/ui/lib/useLongPress.ts).
  const longPress = useLongPress(
    onContextMenu ? (target) => target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })) : undefined,
  )
  const body = (
    <>
      {leading != null && <span className={styles.leading}>{leading}</span>}
      <span className={styles.texts}>
        {overline && <span className={dense ? styles.overlineDense : styles.overline}>{overline}</span>}
        <span className={dense ? styles.headlineDense : styles.headline}>{headline}</span>
        {supporting && <span className={styles.supporting}>{supporting}</span>}
      </span>
      {trailing != null && <span className={dense ? styles.trailingDense : styles.trailing}>{trailing}</span>}
    </>
  )
  const click = (e: MouseEvent<HTMLElement>) => {
    if (disabled) {
      e.preventDefault()
      return
    }
    onClick?.(e)
  }
  const common = {
    className: cls,
    style,
    role,
    'aria-disabled': disabled || undefined,
    'aria-selected': role === 'option' ? !!selected : undefined,
    'aria-checked': role === 'menuitemradio' || role === 'menuitemcheckbox' ? !!selected : role === 'switch' || role === 'checkbox' ? !!checked : undefined,
    'data-focusable': true,
    onClick: click,
    onContextMenu: longPress.wrapContextMenu(onContextMenu),
    ...(onContextMenu
      ? {
          onPointerDown: longPress.onPointerDown,
          onPointerMove: longPress.onPointerMove,
          onPointerUp: longPress.onPointerUp,
          onPointerCancel: longPress.onPointerCancel,
        }
      : null),
  }
  if (href != null && !disabled) {
    return (
      <a {...common} ref={ref as Ref<HTMLAnchorElement>} href={href}>
        {body}
      </a>
    )
  }
  return (
    <button {...common} ref={ref as Ref<HTMLButtonElement>} type="button">
      {body}
    </button>
  )
}
