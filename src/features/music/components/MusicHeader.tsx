import clsx from 'clsx'
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useState } from 'react'
import { usePrefs } from '../../../stores/preferences'
import { Dialog, OverviewText, QuickDetails } from '../../../ui'
import { artistsString, quickDetailsBasic } from '../../common/itemText'
import { genreText } from '../../detail/common/detailText'
import { useTranslate } from '../../common/useTranslate'
import styles from './MusicHeader.module.css'

/** keeps an empty line's height (an empty element has no line box to trim) */
const ZWSP = '\u200b'

export type MusicHeaderProps = {
  item: BaseItemDto
  imageUrl: string | null
  /** artist page: clicking the overview opens it in a dialog; album page: no-op (upstream `overviewOnClick = {}`) */
  overviewDialog?: boolean
}

/**
 * `AlbumHeader` / `ArtistHeader` (AlbumDetailsPage.kt:658-744, ArtistDetailsPage.kt:759-842): cover 20% wide
 * (r=16dp) and 16dp gap, then the artists line (headlineMedium SemiBold), the name (headlineSmall), and a
 * 60%-wide column with quick details, genres (4, then "+N") and a 3-line overview. The artists and quick-details
 * lines keep their height when empty, as upstream's empty Texts do (an artist page has neither).
 */
export function MusicHeader({ item, imageUrl, overviewDialog }: MusicHeaderProps) {
  const { t, locale } = useTranslate()
  const toggles = usePrefs('displayToggles')
  const [showOverview, setShowOverview] = useState(false)
  const artists = artistsString(item)
  const genres = genreText(item.Genres)
  const parts = quickDetailsBasic(t, item, locale)
  const officialRating = toggles.includes('OFFICIAL_RATING') ? item.OfficialRating : null
  const communityRating = toggles.includes('COMMUNITY_RATING') ? item.CommunityRating : null
  const criticRating = toggles.includes('CRITIC_RATING') ? item.CriticRating : null
  const hasQuick = parts.some((p) => !!p) || !!officialRating || communityRating != null || criticRating != null
  const overview = item.Overview?.trim()
  return (
    <header className={styles.header}>
      {imageUrl ? (
        <img className={styles.cover} src={imageUrl} alt="" draggable={false} />
      ) : (
        <div className={clsx(styles.cover, styles.noCover)} aria-hidden />
      )}
      <div className={styles.column}>
        <p className={styles.artists} dir="auto">
          {artists ?? ZWSP}
        </p>
        <h1 className={styles.name} dir="auto">
          {item.Name ?? ''}
        </h1>
        <div className={styles.details}>
          {hasQuick ? (
            <QuickDetails
              className={styles.quick}
              parts={parts}
              officialRating={officialRating}
              communityRating={communityRating}
              criticRating={criticRating}
              locale={locale}
            />
          ) : (
            <p className={styles.quickEmpty} aria-hidden>
              {ZWSP}
            </p>
          )}
          {genres && (
            <p className={styles.genres} dir="auto">
              {genres}
            </p>
          )}
          {overview && (
            <OverviewText text={overview} maxLines={3} onClick={overviewDialog ? () => setShowOverview(true) : undefined} className={styles.overview} />
          )}
        </div>
      </div>
      {showOverview && overview && (
        <Dialog open variant="scrollable" label={item.Name ?? ''} onClose={() => setShowOverview(false)}>
          <h2 className={styles.dialogTitle}>{item.Name}</h2>
          <p className={styles.dialogText} dir="auto">
            {overview}
          </p>
        </Dialog>
      )}
    </header>
  )
}
