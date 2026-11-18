import clsx from 'clsx'
import type { MouseEvent, ReactNode } from 'react'
import styles from './DropdownMenuItem.module.css'

export type DropdownMenuItemProps = {
  children: ReactNode
  onClick: (e: MouseEvent<HTMLElement>) => void
  leading?: ReactNode
  trailing?: ReactNode
  /** Leading icon color (e.g. red for destructive). */
  leadingColor?: string
  disabled?: boolean
  selected?: boolean
  href?: string
  className?: string
}

/**
 * Upstream `TvDropdownMenuItem`: M3 `DropdownMenuItem` (48dp, 12dp padding, tv bodyLarge label, 24dp icons,
 * 12dp gap) that is surface+3dp / onSurface, and inverseSurface / inverseOnSurface when focused.
 */
export function DropdownMenuItem({
  children,
  onClick,
  leading,
  trailing,
  leadingColor,
  disabled,
  selected,
  href,
  className,
}: DropdownMenuItemProps) {
  const content = (
    <>
      {leading != null && (
        <span className={styles.icon} style={leadingColor ? { color: leadingColor } : undefined}>
          {leading}
        </span>
      )}
      <span className={styles.text}>{children}</span>
      {trailing != null && <span className={styles.icon}>{trailing}</span>}
    </>
  )
  const common = {
    className: clsx(styles.item, className),
    role: selected != null ? 'menuitemradio' : 'menuitem',
    'aria-checked': selected != null ? selected : undefined,
    'aria-disabled': disabled || undefined,
    'data-focusable': true,
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (disabled) {
        e.preventDefault()
        return
      }
      onClick(e)
    },
  }
  return href != null && !disabled ? (
    <a {...common} href={href}>
      {content}
    </a>
  ) : (
    <button {...common} type="button">
      {content}
    </button>
  )
}
