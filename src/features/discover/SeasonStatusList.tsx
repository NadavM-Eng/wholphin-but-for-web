import { useTranslation } from 'react-i18next'
import type { RequestSeason } from '../../api/seerr'
import { withCount } from '../../i18n'
import { formatSeasonNumber } from '../../lib/format'
import styles from './DiscoverDetails.module.css'
import { SeasonBadge } from './SeasonBadge'
import { plainT } from './seerrText'

/**
 * Per-season availability at a glance. Upstream's seasons row on this page is commented out
 * (DiscoverSeriesDetails.kt); the same per-season status otherwise only shows inside the request dialog.
 */
export function SeasonStatusList({ seasons }: { seasons: RequestSeason[] }) {
  const { t } = useTranslation()
  if (seasons.length === 0) return null
  return (
    <section className={styles.seasons} aria-label={t('web_seerr_season_status')}>
      <h2 className={styles.seasonsTitle}>{withCount(t('tv_seasons'), seasons.length)}</h2>
      <ul className={styles.seasonChips} role="list">
        {seasons.map((s) => (
          <li key={s.seasonNumber} className={styles.seasonChip}>
            <SeasonBadge availability={s.availability} />
            <span dir="auto">{s.season.name || formatSeasonNumber(plainT(t), s.seasonNumber)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
