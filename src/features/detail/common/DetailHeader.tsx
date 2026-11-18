import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { useSessionStore } from '../../../stores/session'
import { usePrefs } from '../../../stores/preferences'
import { dp } from '../../../theme/scale'
import { OverviewText, QuickDetails, TitleOrLogo } from '../../../ui'
import { quickDetailsFor, type DisplayToggle } from '../../common/itemText'
import { logoUrl } from '../../common/logo'
import { useTranslate } from '../../common/useTranslate'
import { directorNames, genreText } from './detailText'
import styles from './DetailHeader.module.css'
import { StreamChips } from './StreamChips'
import type { ChosenStreams } from './streams'
import { useMinuteClock } from './useMinuteClock'

export type DetailHeaderProps = {
  item: BaseItemDto
  /**
   * `movie`: MovieDetailsHeader (logo/title, quick details, genres, chips, tagline, overview, directed by).
   * `episode`: EpisodeDetailsHeader (series name, episode name, quick details, chips, tagline, overview, directed by).
   * `collection`: CollectionDetailsHeader (logo/title, quick details, genres, tagline, overview).
   */
  variant: 'movie' | 'episode' | 'collection'
  chosen?: ChosenStreams | null
  /** Overview click: the Media Information dialog upstream. */
  onOverview?: () => void
  className?: string
  children?: ReactNode
}

/**
 * The text block of the movie / episode / box-set detail pages. Widths follow upstream (title 75%, details
 * column 60%) on wide screens and take the full width on phones.
 */
export function DetailHeader({ item, variant, chosen, onOverview, className, children }: DetailHeaderProps) {
  const { t, locale } = useTranslate()
  const showLogos = usePrefs('showLogos')
  const toggles = usePrefs('displayToggles') as readonly DisplayToggle[]
  const baseUrl = useSessionStore((s) => s.current?.api.basePath ?? null)
  const now = useMinuteClock()
  const qd = quickDetailsFor(t, item, { toggles, nowMs: now, locale })
  const genres = variant === 'episode' ? null : genreText(item.Genres)
  const tagline = item.Taglines?.[0] ?? null
  const directors = variant === 'collection' ? null : directorNames(item)
  const logo = logoUrl(baseUrl, item, Math.round(dp(60) * (window.devicePixelRatio || 1)))
  return (
    <header className={clsx(styles.header, variant === 'episode' && styles.episodeGap, className)}>
      {variant === 'episode' ? (
        <>
          <h1 className={clsx(styles.title, styles.seriesName)} dir="auto">
            {item.SeriesName ?? ''}
          </h1>
          <p className={clsx(styles.title, styles.episodeName)} dir="auto">
            {item.Name ?? ''}
          </p>
        </>
      ) : (
        <div className={clsx(styles.title, styles.padStart)}>
          <TitleOrLogo title={variant === 'collection' ? item.Name : item.Name} logoSrc={logo} showLogo={showLogos} dir="auto" />
        </div>
      )}
      <div className={styles.details}>
        <QuickDetails
          parts={qd.parts}
          officialRating={qd.officialRating}
          communityRating={qd.communityRating}
          criticRating={qd.criticRating}
          endsAt={qd.endsAt}
          locale={locale}
          className={clsx(styles.quick, variant !== 'episode' && styles.padStart)}
        />
        {/* the 8dp start inset sits on a wrapper: logical padding on a dir="auto" line would follow the text's own
            direction and end up on the far side of an English line on a Hebrew page */}
        {genres && (
          <div className={styles.padStart}>
            <p className={styles.genres} dir="auto">
              {genres}
            </p>
          </div>
        )}
        {variant !== 'collection' && (
          <StreamChips
            chosen={chosen ?? null}
            versions={item.MediaSourceCount ?? 0}
            className={variant === 'movie' ? clsx(styles.padStart, styles.chipsMovie) : styles.chipsEpisode}
          />
        )}
        {tagline && (
          <div className={clsx(variant !== 'episode' && styles.padStart)}>
            <p className={styles.tagline} dir="auto">
              {tagline}
            </p>
          </div>
        )}
        {item.Overview && (
          <OverviewText text={item.Overview} maxLines={3} onClick={onOverview} label={t('media_information')} className={styles.overview} dir="auto" />
        )}
        {directors && (
          <div className={clsx(variant !== 'episode' && styles.padStart)}>
            <p className={styles.directed} dir="auto">
              {t('directed_by', { p1: directors })}
            </p>
          </div>
        )}
      </div>
      {children}
    </header>
  )
}
