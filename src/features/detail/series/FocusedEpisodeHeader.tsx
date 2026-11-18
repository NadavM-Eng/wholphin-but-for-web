import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import clsx from 'clsx'
import { usePrefs } from '../../../stores/preferences'
import { OverviewText, QuickDetails } from '../../../ui'
import { quickDetailsFor, type DisplayToggle } from '../../common/itemText'
import { useTranslate } from '../../common/useTranslate'
import headerStyles from '../common/DetailHeader.module.css'
import { StreamChips } from '../common/StreamChips'
import type { ChosenStreams } from '../common/streams'
import { useMinuteClock } from '../common/useMinuteClock'
import styles from './SeriesOverview.module.css'

/**
 * Upstream `FocusedEpisodeHeader` (W/ui/detail/series/FocusedEpisodeHeader.kt), 60% wide, 8dp apart: episode name
 * (headlineSmall 20sp, one line), quick details (S1 E3 • date • runtime or time left • ratings • Ends at), stream
 * chips, and the overview in its fixed 3-line box (click: media information). Nothing shows before an episode is
 * known; the overview box keeps its height so the strip below does not move.
 */
export function FocusedEpisodeHeader({ ep, chosen, onOverview }: { ep: BaseItemDto | undefined; chosen: ChosenStreams | null; onOverview: () => void }) {
  const { t, locale } = useTranslate()
  const toggles = usePrefs('displayToggles') as readonly DisplayToggle[]
  const now = useMinuteClock()
  const qd = ep ? quickDetailsFor(t, ep, { toggles, nowMs: now, locale }) : null
  return (
    <div className={styles.episodeHeader}>
      {/* start padding on a wrapper, so it stays on the page's start side whatever the name's direction */}
      <div className={headerStyles.padStart}>
        <h2 className={clsx(headerStyles.episodeName, styles.episodeName)} dir="auto">
          {ep?.Name ?? ''}
        </h2>
      </div>
      {qd && (
        <QuickDetails
          parts={qd.parts}
          officialRating={qd.officialRating}
          communityRating={qd.communityRating}
          criticRating={qd.criticRating}
          endsAt={qd.endsAt}
          locale={locale}
          className={clsx(headerStyles.quick, headerStyles.padStart)}
        />
      )}
      {ep && <StreamChips chosen={chosen} versions={ep.MediaSourceCount ?? 0} className={headerStyles.padStart} />}
      <OverviewText text={ep?.Overview ?? ''} maxLines={3} onClick={onOverview} label={t('media_information')} className={styles.overview} dir="auto" />
    </div>
  )
}
