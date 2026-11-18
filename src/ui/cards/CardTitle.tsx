import clsx from 'clsx'
import { MarqueeText } from '../text/MarqueeText'
import styles from './CardTitle.module.css'

export type CardTitleProps = {
  title?: string | null
  subtitle?: string | null
  /** Marquee on (upstream: focused for 500ms, 1000ms for people). */
  active: boolean
  /** `poster`: bodyMedium SemiBold / bodySmall. `banner`: bodyLarge SemiBold / bodyMedium. */
  size?: 'poster' | 'banner'
  /** Keep the subtitle line even when empty (upstream always draws both Texts). */
  reserveSubtitle?: boolean
  /** End the title with an ellipsis while it is not scrolling. No upstream card draws one (every title is a marquee). */
  ellipsis?: boolean
  className?: string
}

/**
 * Title block under a card (upstream `SlidingCardText`): 4dp below the image, sliding 8dp further down
 * while the card is focused so the 1.1x card does not cover it (gap 12dp -> 4dp below the text).
 * Must be a descendant of an element with `data-card-root` that also contains the `CardFrame`.
 */
export function CardTitle({
  title,
  subtitle,
  active,
  size = 'poster',
  reserveSubtitle = true,
  ellipsis,
  className,
}: CardTitleProps) {
  return (
    <div className={clsx(styles.text, className)} data-card-text aria-hidden>
      {/* Modifier.padding(horizontal = 4.dp).enableMarquee(): the padding is outside the marquee, so the text is
          clipped (and scrolls) 4dp inside the card edges (W/ui/cards/GridCard.kt, SeasonCard.kt, PersonCard.kt) */}
      <div className={size === 'banner' ? styles.titleBanner : styles.titlePoster}>
        <MarqueeText text={title ?? ''} active={active} ellipsis={ellipsis} />
      </div>
      {(reserveSubtitle || subtitle) && (
        <div className={size === 'banner' ? styles.subtitleBanner : styles.subtitlePoster}>
          <MarqueeText text={subtitle ?? ''} active={active} />
        </div>
      )}
    </div>
  )
}
