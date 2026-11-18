import clsx from 'clsx'
import type { CSSProperties } from 'react'
import { dpCss } from '../../theme/scale'
import { faChar, type FaName } from './faCodepoints'

export type FaIconProps = {
  name: FaName
  /** Font size in sp (= dp). Omit to inherit the surrounding font size. */
  size?: number
  color?: string
  /** Accessible name; without it the icon is decorative. */
  label?: string
  className?: string
  style?: CSSProperties
}

/** A Font Awesome Solid glyph rendered from the bundled `fa_solid_900.ttf`, like upstream `Text(fontFamily = FontAwesome)`. */
export function FaIcon({ name, size, color, label, className, style }: FaIconProps) {
  return (
    <span
      className={clsx('fa', className)}
      style={{ fontSize: size != null ? dpCss(size) : undefined, color, ...style }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {faChar(name)}
    </span>
  )
}
