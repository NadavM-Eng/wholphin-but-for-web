import clsx from 'clsx'
import type { MouseEvent } from 'react'
import styles from './TitleValueText.module.css'

export type TitleValueTextProps = {
  title: string
  value: string
  /** Makes it focusable/clickable (focused: onPrimary@.75 background, 4dp corners, scale 1.1). */
  onClick?: () => void
  onContextMenu?: (e: MouseEvent<HTMLElement>) => void
  href?: string
  className?: string
}

/** Upstream `TitleValueText`: labelMedium (Normal, @.8) title over a one-line labelLarge (Normal) value. */
export function TitleValueText({ title, value, onClick, onContextMenu, href, className }: TitleValueTextProps) {
  const body = (
    <>
      <span className={styles.title}>{title}</span>
      <span className={styles.value}>{value}</span>
    </>
  )
  if (href != null) {
    return (
      <a href={href} data-focusable className={clsx(styles.root, styles.clickable, className)} onClick={onClick} onContextMenu={onContextMenu}>
        {body}
      </a>
    )
  }
  if (onClick || onContextMenu) {
    return (
      <button type="button" data-focusable className={clsx(styles.root, styles.clickable, className)} onClick={onClick} onContextMenu={onContextMenu}>
        {body}
      </button>
    )
  }
  return <div className={clsx(styles.root, className)}>{body}</div>
}
