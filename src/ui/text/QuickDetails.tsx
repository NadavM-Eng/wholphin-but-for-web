import clsx from 'clsx'
import { Fragment, type ReactNode } from 'react'
import { CommunityRating } from './CommunityRating'
import { CriticRating } from './CriticRating'
import styles from './QuickDetails.module.css'

export type QuickDetailsProps = {
  /** The basic parts in order (year, "S2 E5", runtime, "45m left"…), already formatted. */
  parts: (string | null | undefined)[]
  officialRating?: string | null
  communityRating?: number | null
  criticRating?: number | null
  /** Already formatted, e.g. "Ends at 10:42 PM". */
  endsAt?: string | null
  locale?: string
  className?: string
}

/** Upstream dot separator `"  •  "` (`Formatting.kt` `dot()`). */
export const DOT = '  •  '

/**
 * Upstream `QuickDetails`: titleSmall, onSurface, one line (as tall as the font, 16.4dp); basic parts joined
 * by the dot, then official rating, community rating (star), critic rating (tomato) and "ends at", each after
 * a dot. The rating icons are inline 1em boxes directly after their number.
 */
export function QuickDetails({ parts, officialRating, communityRating, criticRating, endsAt, locale, className }: QuickDetailsProps) {
  const segments: ReactNode[] = parts.filter((p): p is string => !!p)
  if (officialRating) segments.push(officialRating)
  if (communityRating != null) segments.push(<CommunityRating value={communityRating} locale={locale} inline />)
  if (criticRating != null) segments.push(<CriticRating value={criticRating} inline />)
  if (endsAt) segments.push(endsAt)
  if (segments.length === 0) return null
  return (
    <p className={clsx(styles.line, className)}>
      {segments.map((s, i) => (
        <Fragment key={i}>
          {i > 0 && <span className={styles.dot}>{DOT}</span>}
          {s}
        </Fragment>
      ))}
    </p>
  )
}
