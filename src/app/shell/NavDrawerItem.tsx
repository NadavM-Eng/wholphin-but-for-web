import clsx from 'clsx'
import { useState, type MouseEvent, type PointerEvent, type ReactNode, type Ref } from 'react'
import { MarqueeText } from '../../ui'
import styles from './NavDrawer.module.css'

export type NavDrawerItemProps = {
  label: string
  /** second line (profile: server name; now playing: track title) -> two-line height */
  supporting?: string | null
  /** 24dp leading icon */
  leading: ReactNode
  trailing?: ReactNode
  /** selection highlight (only tints the icon, as upstream) */
  selected?: boolean
  /** the drawer is expanded (marquee only runs then) */
  drawerOpen: boolean
  /** "More" children: surface @ 50% container while the drawer is open */
  moreChild?: boolean
  /** render an <a> so middle-click / open-in-new-tab work */
  href?: string
  onActivate: () => void
  /** element keyboard entry into the drawer lands on */
  focusTarget?: boolean
  ref?: Ref<HTMLElement>
  'data-drawer-id'?: string
  ariaExpanded?: boolean
}

/**
 * NavigationDrawerAndroid.kt NavigationDrawerItem: a tv-material ListItem without focus scale, 56dp high
 * (64dp with a supporting line), 16dp padding, leading box (32dp ListItem icon slot holding the 24dp
 * icon), headline titleMedium. Focused = hover or keyboard focus.
 */
export function NavDrawerItem({
  label,
  supporting,
  leading,
  trailing,
  selected,
  drawerOpen,
  moreChild,
  href,
  onActivate,
  focusTarget,
  ref,
  ariaExpanded,
  ...rest
}: NavDrawerItemProps) {
  const [hovered, setHovered] = useState(false)
  const [focusVisible, setFocusVisible] = useState(false)
  const focused = hovered || focusVisible
  const cls = clsx(styles.item, supporting && styles.twoLine, moreChild && styles.moreChild)
  const common = {
    className: cls,
    'data-focusable': true,
    'data-selected': selected || undefined,
    'data-focus-target': focusTarget || undefined,
    'data-drawer-id': rest['data-drawer-id'],
    'aria-current': selected ? ('page' as const) : undefined,
    'aria-expanded': ariaExpanded,
    onPointerEnter: (e: { pointerType: string }) => e.pointerType !== 'touch' && setHovered(true),
    onPointerLeave: () => setHovered(false),
    // One focused item, like the TV: when the mouse really moves over an item while another drawer item
    // has keyboard focus, focus follows the mouse (layout-caused moves have no movement and are ignored).
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'touch' || (e.movementX === 0 && e.movementY === 0)) return
      const a = document.activeElement
      const el = e.currentTarget
      if (a instanceof HTMLElement && a !== el && a.matches(':focus-visible') && el.closest('[data-shell-drawer]')?.contains(a)) {
        el.focus({ preventScroll: true })
      }
    },
    onFocus: (e: { currentTarget: Element }) => setFocusVisible(e.currentTarget.matches(':focus-visible')),
    onBlur: () => setFocusVisible(false),
  }
  const body = (
    <>
      <span className={styles.leading}>{leading}</span>
      <span className={styles.text}>
        <MarqueeText className={styles.headline} text={label} active={focused && drawerOpen} />
        {supporting && <span className={styles.supporting}>{supporting}</span>}
      </span>
      {trailing && <span className={styles.trailing}>{trailing}</span>}
    </>
  )
  if (href != null) {
    const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      e.preventDefault()
      onActivate()
    }
    return (
      <a {...common} ref={ref as Ref<HTMLAnchorElement>} href={href} onClick={onClick}>
        {body}
      </a>
    )
  }
  return (
    <button {...common} ref={ref as Ref<HTMLButtonElement>} type="button" onClick={onActivate}>
      {body}
    </button>
  )
}
