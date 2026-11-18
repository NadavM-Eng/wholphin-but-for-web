import clsx from 'clsx'
import { useRef } from 'react'
import { dpCss } from '../../theme/scale'
import { clampAspect } from '../lib/gridMath'
import { useFocusedAfterDelay } from '../lib/useFocusedAfterDelay'
import { BannerCard, type BannerCardProps } from './BannerCard'
import { CardTitle } from './CardTitle'
import layout from './cardLayout.module.css'

export type BannerCardWithTitleProps = BannerCardProps & {
  title?: string | null
  subtitle?: string | null
}

/**
 * `BannerCard` with a sliding title below (upstream `BannerCardWithTitle`, `BannerCard.kt:201-272`):
 * column width = height x clamped aspect, title bodyLarge SemiBold, subtitle bodyMedium. Used by
 * home rows whose "show titles" option is on (off by default).
 */
export function BannerCardWithTitle({ title, subtitle, className, style, ...banner }: BannerCardWithTitleProps) {
  const root = useRef<HTMLDivElement>(null)
  const active = useFocusedAfterDelay(root, 500)
  const height = banner.height ?? 120
  const ratio = clampAspect(banner.aspectRatio ?? 16 / 9)
  return (
    <div ref={root} className={clsx(layout.root, className)} style={{ width: dpCss(height * ratio), ...style }} data-card-root>
      <BannerCard {...banner} label={banner.label ?? title ?? banner.name ?? ''} />
      <CardTitle title={title} subtitle={subtitle} active={active} size="banner" />
    </div>
  )
}
