import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslate } from '../common/useTranslate'
import { qk } from '../../api/queryKeys'
import { useApi } from '../../api/session'
import { useNav } from '../../app/nav'
import { toast } from '../../app/toast'
import { ListItem, LoadingPage } from '../../ui'
import { itemTitle } from '../common/itemText'
import styles from './DvrSchedule.module.css'
import { dtoSeasonEpisodeLine, formatDayHeading, formatTimeRange, localDay } from './guideModel'
import { LiveTvError } from './LiveTvError'
import { cancelRecording, fetchDvrSchedule } from './liveTvApi'
import { ProgramDialog } from './ProgramDialog'

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN)

/**
 * DVR Schedule tab (W/ui/detail/livetv/DvrSchedule.kt): a centred column (60% wide, surface, 16dp padding, 8dp
 * gaps) with "No scheduled recordings" when both lists are empty, "Active Recordings", then one heading per day
 * (ascending; rows keep server order) of scheduled timers. A row opens the program dialog: Watch (while airing,
 * the dialog stays open), Record buttons shown but inert, Cancel closes the dialog, cancels the timer or series
 * timer and reloads. There is no series-timer list upstream; series timers only show through their scheduled
 * programs here.
 */
export function DvrSchedule() {
  const { t, locale } = useTranslate()
  const api = useApi()
  const qc = useQueryClient()
  const go = useNav()
  const [selected, setSelected] = useState<BaseItemDto | null>(null)
  const key = qk('livetv', 'dvr')
  const query = useQuery({ queryKey: key, staleTime: 0, queryFn: ({ signal }) => fetchDvrSchedule(api, signal) })

  if (query.isError) return <LiveTvError error={query.error} />
  if (!query.data) return <LoadingPage label={t('loading')} />

  const { active, scheduled } = query.data
  const byDay = new Map<number, BaseItemDto[]>()
  for (const item of scheduled) {
    const day = localDay(time(item.StartDate))
    const list = byDay.get(day)
    if (list) list.push(item)
    else byDay.set(day, [item])
  }
  const days = [...byDay.keys()].sort((a, b) => a - b)

  const row = (item: BaseItemDto, i: number) => {
    const start = time(item.StartDate)
    const end = time(item.EndDate)
    return (
      <ListItem
        key={`${item.Id}:${i}`}
        className={styles.item}
        headline={<span dir="auto">{itemTitle(item) ?? ''}</span>}
        supporting={dtoSeasonEpisodeLine(item, t) ?? undefined}
        trailing={Number.isNaN(start) ? undefined : formatTimeRange(start, Number.isNaN(end) ? start : end, locale)}
        onClick={() => setSelected(item)}
      />
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.column} data-dvr-list>
        {active.length === 0 && scheduled.length === 0 && <p className={styles.empty}>{t('no_scheduled_recordings')}</p>}
        {active.length > 0 && (
          <>
            <h2 className={styles.activeTitle}>{t('active_recordings')}</h2>
            {active.map(row)}
          </>
        )}
        {days.map((day) => (
          <section key={day} className={styles.day}>
            <h2 className={styles.dayTitle}>{formatDayHeading(day, locale)}</h2>
            {byDay.get(day)!.map(row)}
          </section>
        ))}
      </div>
      {selected && (
        <ProgramDialog
          state={{ kind: 'success', item: selected }}
          canRecord
          onClose={() => setSelected(null)}
          onWatch={(item) => {
            if (item.ChannelId) go.play(item.ChannelId)
            else toast(t('web_livetv_no_channel_id'), { long: true })
          }}
          onRecord={() => {
            // no-op upstream (DvrSchedule.kt:204-206)
          }}
          onCancelRecord={(item, series) => {
            setSelected(null)
            const timerId = series ? item.SeriesTimerId : item.TimerId
            void (async () => {
              try {
                if (await cancelRecording(api, series, timerId)) await qc.invalidateQueries({ queryKey: key })
              } catch (err) {
                toast(`${t('error')}: ${err instanceof Error ? err.message : String(err)}`)
              }
            })()
          }}
        />
      )}
    </div>
  )
}
