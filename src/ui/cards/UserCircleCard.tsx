import clsx from 'clsx'
import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { idColorCss } from '../lib/idColor'
import { CardFrame, type CardActions } from './CardFrame'
import styles from './UserCircleCard.module.css'

export type UserCircleCardProps = CardActions & {
  /** User id (Jellyfin UUID); drives the circle color via the ported `rememberIdColor`. */
  id?: string | null
  name: string
  imageSrc?: string | null
  /** The signed-in user: stronger tint (.7 -> .9 instead of .5 -> .7). */
  isCurrent?: boolean
  /** Replaces the letter / image inside the circle (used by ServerCircleCard). */
  content?: ReactNode
  /** Color override (CSS color); default the id color. */
  color?: string
  /** Container alpha [unfocused, focused]; default by `isCurrent`. */
  tintAlphas?: [number, number]
  className?: string
  style?: CSSProperties
  surfaceProps?: Record<string, string | number | boolean | undefined>
}

/**
 * Login user circle (upstream `UserIconCard`, `ui/setup/UserList.kt:196-290`): 129dp circle tinted with
 * the id color, focused scale 1.2 with a 3dp onSurface ring, image or bold first letter
 * (displayLarge), name below after 24dp (bodyLarge Bold, 2 lines).
 */
export function UserCircleCard({
  id,
  name,
  imageSrc,
  isCurrent,
  content,
  color,
  tintAlphas,
  className,
  style,
  surfaceProps,
  ...actions
}: UserCircleCardProps) {
  const [failed, setFailed] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const clickable = !!(actions.onClick || actions.href)
  const a = tintAlphas ?? (isCurrent ? [0.7, 0.9] : [0.5, 0.7])
  const tint = (alpha: number) => (color ? `rgb(from ${color} r g b / ${alpha})` : idColorCss(id, alpha))
  const letter = (name || id || '?').charAt(0).toUpperCase() || '?'
  return (
    <div ref={root} className={clsx(styles.root, className)} style={style}>
      <CardFrame
        label={name}
        shape="circle"
        ring="onSurface"
        focusScale={1.2}
        container={tint(a[0])}
        focusedContainer={tint(a[1])}
        surfaceProps={surfaceProps}
        {...actions}
        className={styles.circle}
      >
        <span className={styles.center}>
          {content ??
            (imageSrc && failed !== imageSrc ? (
              <img src={imageSrc} alt="" className={styles.img} draggable={false} onError={() => setFailed(imageSrc)} />
            ) : (
              <span className={styles.letter}>{letter}</span>
            ))}
        </span>
      </CardFrame>
      {/* Web: the name is part of the tap target for mouse and touch (the circle keeps focus and the label). */}
      <span
        className={clsx(styles.name, clickable && styles.nameClickable)}
        aria-hidden={clickable || undefined}
        onClick={
          clickable
            ? () => {
                const surface = root.current?.querySelector<HTMLElement>('[data-card-surface]')
                surface?.focus({ preventScroll: true })
                surface?.click()
              }
            : undefined
        }
        onContextMenu={actions.onContextMenu}
      >
        {name}
      </span>
    </div>
  )
}
