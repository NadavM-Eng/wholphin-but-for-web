import clsx from 'clsx'
import type { CSSProperties, MouseEvent, ReactNode, Ref } from 'react'
import styles from './Button.module.css'

export type ButtonVariant = 'default' | 'text' | 'icon' | 'expandable'

export type ButtonProps = {
  children?: ReactNode
  onClick?: (e: MouseEvent<HTMLElement>) => void
  onContextMenu?: (e: MouseEvent<HTMLElement>) => void
  /** Render an `<a>` so middle-click / open-in-new-tab work. */
  href?: string
  /**
   * Disabled buttons stay focusable (TV `Surface` keeps focus when disabled and shows the
   * focused-disabled ring), so this sets `aria-disabled` and swallows clicks instead of `disabled`.
   */
  disabled?: boolean
  variant?: ButtonVariant
  /** Accessible name when the content is an icon. */
  label?: string
  title?: string
  type?: 'button' | 'submit'
  className?: string
  style?: CSSProperties
  ref?: Ref<HTMLElement>
  /** Show the label on touch screens (expandable buttons). */
  'data-touch-label'?: boolean
  autoFocus?: boolean
} & {
  /** Any other data attribute (`data-focus-default`, `data-focus-key`...) is forwarded to the element. */
  [key: `data-${string}`]: string | number | boolean | undefined
}

/**
 * Port of Wholphin's `Button` (`ui/components/Button.kt`): a pill `Surface` with
 * surfaceVariant@.8 / onSurface@.8 that inverts to onSurface / inverseOnSurface when focused,
 * scales 1.1 on focus (`ClickableSurfaceDefaults.scale()`), padding 4dp, 40dp content height.
 */
export function Button({
  children,
  onClick,
  onContextMenu,
  href,
  disabled,
  variant = 'default',
  label,
  title,
  type = 'button',
  className,
  style,
  ref,
  autoFocus,
  ...rest
}: ButtonProps) {
  const cls = clsx(styles.root, styles[variant], className)
  const handleClick = (e: MouseEvent<HTMLElement>) => {
    if (disabled) {
      e.preventDefault()
      return
    }
    onClick?.(e)
  }
  // forward data-* attributes (spatial-nav markers, test hooks); data-touch-label keeps its boolean-to-attribute rule
  const data = Object.fromEntries(Object.entries(rest).filter(([k]) => k.startsWith('data-') && k !== 'data-touch-label'))
  const common = {
    ...data,
    className: cls,
    style,
    title,
    'aria-label': label,
    'aria-disabled': disabled || undefined,
    'data-focusable': true,
    'data-touch-label': rest['data-touch-label'] || undefined,
    onClick: handleClick,
    onContextMenu,
    autoFocus,
  }
  if (href != null && !disabled) {
    return (
      <a {...common} ref={ref as Ref<HTMLAnchorElement>} href={href}>
        {children}
      </a>
    )
  }
  return (
    <button {...common} ref={ref as Ref<HTMLButtonElement>} type={type}>
      {children}
    </button>
  )
}
