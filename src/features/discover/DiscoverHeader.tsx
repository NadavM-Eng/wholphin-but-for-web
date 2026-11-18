import { useTranslation } from 'react-i18next'
import { useDiscoverRating, yearOfDate, type DiscoverItem } from '../../api/seerr'
import { usePrefs } from '../../stores/preferences'
import { QuickDetails, TitleOrLogo } from '../../ui'
import styles from './DiscoverHeader.module.css'

export type DiscoverFocus = { kind: 'item'; item: DiscoverItem } | { kind: 'genre'; title: string } | null

/**
 * `HomePageHeader` as the Discover tab uses it (SeerrDiscoverPage.kt): the focused card's title (or
 * Jellyfin logo), quick details `year • audience★ • critic%`, overview. A focused genre card shows only
 * "<Genre> Movies" / "<Genre> TV Shows".
 */
export function DiscoverHeader({ focus }: { focus: DiscoverFocus }) {
  const { i18n } = useTranslation()
  const showLogos = usePrefs('showLogos')
  const item = focus?.kind === 'item' ? focus.item : null
  const rating = useDiscoverRating(item?.type, item?.id).data
  const year = item ? yearOfDate(item.releaseDate) : null
  return (
    <header className={styles.header} aria-live="polite">
      {focus?.kind === 'genre' && <h2 className={styles.title}>{focus.title}</h2>}
      {item && (
        <>
          <div className={styles.titleBox} dir="auto">
            <TitleOrLogo title={item.title} logoSrc={item.logoUrl} showLogo={showLogos} as="h2" />
          </div>
          <div className={styles.details}>
            <QuickDetails
              parts={[year != null ? String(year) : null]}
              communityRating={rating?.audience ?? null}
              criticRating={rating?.critic ?? null}
              locale={i18n.language}
            />
            {item.overview && (
              <p className={styles.overview} dir="auto">
                {item.overview}
              </p>
            )}
          </div>
        </>
      )}
    </header>
  )
}
