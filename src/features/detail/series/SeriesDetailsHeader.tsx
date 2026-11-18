import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import clsx from 'clsx'
import { useSessionStore } from '../../../stores/session'
import { usePrefs } from '../../../stores/preferences'
import { dp } from '../../../theme/scale'
import { OverviewText, QuickDetails, TitleOrLogo } from '../../../ui'
import { quickDetailsFor, type DisplayToggle } from '../../common/itemText'
import { logoUrl } from '../../common/logo'
import { useTranslate } from '../../common/useTranslate'
import headerStyles from '../common/DetailHeader.module.css'
import { genreText } from '../common/detailText'
import styles from './SeriesDetails.module.css'

/**
 * Upstream `SeriesDetailsHeader` (W/ui/detail/series/SeriesDetails.kt:650-710): logo or title (75% wide), then a
 * 60% column with quick details (years, runtime, ratings; no "Ends at"), the studios (bodyLarge) and genres,
 * both through GenreText (first 4, then "+N"), and the overview (3 lines, click: media information). No tagline,
 * stream chips or "Directed by".
 */
export function SeriesDetailsHeader({ item, onOverview }: { item: BaseItemDto; onOverview: () => void }) {
  const { t, locale } = useTranslate()
  const showLogos = usePrefs('showLogos')
  const toggles = usePrefs('displayToggles') as readonly DisplayToggle[]
  const baseUrl = useSessionStore((s) => s.current?.api.basePath ?? null)
  // `QuickDetails(series.ui.quickDetails, null)`: no time remaining, so no "Ends at".
  const qd = quickDetailsFor(t, item, { toggles, nowMs: 0, locale })
  const studios = genreText((item.Studios ?? []).map((s) => s.Name).filter((n): n is string => !!n))
  const genres = genreText(item.Genres)
  const logo = logoUrl(baseUrl, item, Math.round(dp(60) * (window.devicePixelRatio || 1)))
  return (
    <header className={headerStyles.header}>
      <div className={clsx(headerStyles.title, headerStyles.padStart)}>
        <TitleOrLogo title={item.Name} logoSrc={logo} showLogo={showLogos} dir="auto" />
      </div>
      <div className={headerStyles.details}>
        <QuickDetails
          parts={qd.parts}
          officialRating={qd.officialRating}
          communityRating={qd.communityRating}
          criticRating={qd.criticRating}
          locale={locale}
          className={clsx(headerStyles.quick, headerStyles.padStart)}
        />
        {/* The 8dp start padding sits on a wrapper: on the dir="auto" text itself it would follow the text's
            direction and land on the wrong side for Latin metadata on a right-to-left page. */}
        {studios && (
          <div className={headerStyles.padStart}>
            <p className={styles.studios} dir="auto">
              {studios}
            </p>
          </div>
        )}
        {genres && (
          <div className={clsx(headerStyles.padStart, styles.genres)}>
            <p className={headerStyles.genres} dir="auto">
              {genres}
            </p>
          </div>
        )}
        {item.Overview && (
          <OverviewText text={item.Overview} maxLines={3} onClick={onOverview} label={t('media_information')} className={headerStyles.overview} dir="auto" />
        )}
      </div>
    </header>
  )
}
