import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DiscoverRating } from '../../api/seerr'
import { usePrefs } from '../../stores/preferences'
import { Dialog, OverviewText, QuickDetails, TitleOrLogo } from '../../ui'
import styles from './DiscoverDetails.module.css'
import { isolate } from './seerrText'

export type DiscoverDetailsHeaderProps = {
  title: string | null
  logoSrc: string | null
  /** Basic quick-detail parts (release date, runtime, certification), already formatted. */
  parts: (string | null)[]
  rating: DiscoverRating | null | undefined
  genres: string[]
  /** Movies only. */
  tagline?: string | null
  overview: string | null
  /** Movies only: "Directed by …". */
  directedBy?: string | null
}

/**
 * `DiscoverMovieDetailsHeader` / `DiscoverSeriesDetailsHeader`: TitleOrLogo (75% wide), then a 60% column
 * of quick details, genres, (tagline), overview (3 lines, opens the details dialog), (Directed by).
 */
export function DiscoverDetailsHeader({
  title,
  logoSrc,
  parts,
  rating,
  genres,
  tagline,
  overview,
  directedBy,
}: DiscoverDetailsHeaderProps) {
  const { t, i18n } = useTranslation()
  const showLogos = usePrefs('showLogos')
  const [dialog, setDialog] = useState(false)
  return (
    <div className={styles.header}>
      <div className={styles.titleBox} dir="auto">
        <TitleOrLogo title={title} logoSrc={logoSrc} showLogo={showLogos} />
      </div>
      <div className={styles.headerColumn}>
        <div className={styles.padded}>
          <QuickDetails
            parts={parts}
            communityRating={rating?.audience ?? null}
            criticRating={rating?.critic ?? null}
            locale={i18n.language}
          />
        </div>
        {genres.length > 0 && (
          <p className={`${styles.padded} ${styles.genres}`} dir="auto">
            {genres.join(', ')}
          </p>
        )}
        {tagline?.trim() && (
          <p className={`${styles.padded} ${styles.tagline}`} dir="auto">
            {tagline}
          </p>
        )}
        {overview && (
          <div dir="auto">
            <OverviewText
              text={overview}
              maxLines={3}
              onClick={() => setDialog(true)}
              label={title ?? undefined}
              className={styles.overview}
            />
          </div>
        )}
        {directedBy && <p className={`${styles.padded} ${styles.directed}`}>{t('directed_by', { p1: isolate(directedBy) })}</p>}
      </div>
      <Dialog open={dialog} onClose={() => setDialog(false)} variant="scrollable" label={title ?? t('unknown')}>
        <h2 className={styles.dialogTitle} dir="auto">
          {title ?? t('unknown')}
        </h2>
        {overview && (
          <p className={styles.dialogText} dir="auto">
            {overview}
          </p>
        )}
        {genres.length > 0 && (
          <p className={styles.dialogGenres} dir="auto">
            {genres.join(', ')}
          </p>
        )}
      </Dialog>
    </div>
  )
}
