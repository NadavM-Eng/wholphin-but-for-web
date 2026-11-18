import clsx from 'clsx'
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode, Ref } from 'react'
import { MaterialIcon } from '../icons/MaterialIcon'
import { useLongPress } from '../lib/useLongPress'
import styles from './CardFrame.module.css'

export type CardActions = {
  /** Navigation target; renders an `<a>` so middle-click / open-in-new-tab work. */
  href?: string
  onClick?: (e: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void
  /**
   * Right-click / keyboard Menu key / touch long-press: upstream's long-press context menu. A touch
   * long-press calls `onMore` when given (same menu as the button), else this with a `contextmenu` event.
   */
  onContextMenu?: (e: MouseEvent<HTMLElement>) => void
  /**
   * Shows a "more" button (visible on touch screens, and on hover with a mouse) that opens the
   * same menu, for devices without right-click. Receives the button element for anchoring.
   */
  onMore?: (anchor: HTMLElement) => void
  /** Accessible name of the "more" button (localized by the caller). */
  moreLabel?: string
}

export type CardFrameProps = CardActions & {
  children: ReactNode
  /** Accessible name of the card (usually the title). */
  label: string
  /** `rounded`: CardDefaults shape (8dp). `circle`: person / server / user circles. */
  shape?: 'rounded' | 'circle'
  /** Container color behind the content (CSS color). Default transparent. */
  container?: string
  /** Container color while focused (server/user circles); defaults to `container`. */
  focusedContainer?: string
  /** Focus ring color: `border` (CardDefaults.border, 3dp) or `onSurface` (login circles). */
  ring?: 'border' | 'onSurface'
  /** Focused scale: 1.1 for cards (CardDefaults.scale), 1.2 for the login circles. */
  focusScale?: number
  className?: string
  style?: CSSProperties
  ref?: Ref<HTMLElement>
  /** Extra attributes for the focusable element (e.g. data-index for grids). */
  surfaceProps?: Record<string, string | number | boolean | undefined>
}

/**
 * The tv-material `Card` surface every card is built on: focusable `<a>`/`[role=button]` that scales
 * and shows the 3dp accent ring on `:focus-visible` and pointer hover. Upstream values: shape
 * RoundedCornerShape(8dp), focusedScale 1.1, focusedBorder 3dp `colorScheme.border` centred on the card edge, no glow,
 * scale tween 300ms in / 500ms out, easing (0,0,.2,1).
 */
export function CardFrame({
  children,
  label,
  href,
  onClick,
  onContextMenu,
  onMore,
  moreLabel,
  shape = 'rounded',
  container,
  focusedContainer,
  ring = 'border',
  focusScale,
  className,
  style,
  ref,
  surfaceProps,
}: CardFrameProps) {
  const vars = {
    ...style,
    ...(container ? { '--card-bg': container } : null),
    ...(focusedContainer ? { '--card-bg-focus': focusedContainer } : null),
    ...(focusScale ? { '--card-scale': focusScale } : null),
  } as CSSProperties

  // iOS Safari sends no contextmenu for touch: time the press ourselves (src/ui/lib/useLongPress.ts).
  const longPress = useLongPress(
    onMore || onContextMenu
      ? (target) => {
          if (onMore) onMore(target)
          else target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
        }
      : undefined,
  )

  const surfaceClass = clsx(styles.surface, shape === 'circle' && styles.circle)
  const common = {
    className: surfaceClass,
    'aria-label': label,
    'data-focusable': true,
    'data-card-surface': true,
    onContextMenu: longPress.wrapContextMenu(onContextMenu),
    onPointerDown: longPress.onPointerDown,
    onPointerMove: longPress.onPointerMove,
    onPointerUp: longPress.onPointerUp,
    onPointerCancel: longPress.onPointerCancel,
    ...surfaceProps,
  }

  const surface =
    href != null ? (
      <a {...common} ref={ref as Ref<HTMLAnchorElement>} href={href} onClick={onClick} draggable={false}>
        {children}
      </a>
    ) : (
      <div
        {...common}
        ref={ref as Ref<HTMLDivElement>}
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick?.(e)
          }
        }}
      >
        {children}
      </div>
    )

  return (
    <div
      className={clsx(styles.scaler, shape === 'circle' && styles.scalerCircle, ring === 'onSurface' && styles.ringOnSurface, className)}
      style={vars}
      data-card-scaler
    >
      {surface}
      {onMore && (
        <button
          type="button"
          className={styles.more}
          tabIndex={-1}
          data-card-more
          aria-label={moreLabel}
          title={moreLabel}
          onClick={(e) => {
            e.stopPropagation()
            onMore(e.currentTarget)
          }}
        >
          <MaterialIcon name="more_vert" size={20} />
        </button>
      )}
    </div>
  )
}
