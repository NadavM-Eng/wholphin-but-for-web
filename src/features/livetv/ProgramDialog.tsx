import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { useTranslate } from '../common/useTranslate'
import { CircularProgress, Dialog, MaterialIcon, TextButton } from '../../ui'
import { dtoSeasonEpisodeLine, formatTimeRange } from './guideModel'
import { LiveTvError } from './LiveTvError'
import styles from './ProgramDialog.module.css'

export type ProgramDialogState =
  | { kind: 'loading' }
  | { kind: 'error'; error: unknown }
  | { kind: 'success'; item: BaseItemDto }

type Props = {
  state: ProgramDialogState
  canRecord: boolean
  onClose: () => void
  onWatch: (item: BaseItemDto) => void
  onRecord: (item: BaseItemDto, series: boolean) => void
  onCancelRecord: (item: BaseItemDto, series: boolean) => void
}

const notBlank = (s: string | null | undefined) => s != null && s.trim() !== ''

/**
 * `ProgramDialog` (W/ui/detail/livetv/ProgramDialog.kt): surface@5dp, 16dp corners and padding, 8dp gaps. Title
 * (titleLarge), "S1 E2 - Episode" for series (titleMedium), time range (titleSmall), overview (3 lines), then a
 * centred column (16dp gap, 8dp top padding): "Watch live" only while airing (strict), and when `canRecord` a
 * centred row (16dp gap) with the series button (series only) and the program button (only until it ends).
 * Cancel buttons carry a red close icon. Spinner while loading, ErrorMessage on failure.
 */
export function ProgramDialog({ state, canRecord, onClose, onWatch, onRecord, onCancelRecord }: Props) {
  const { t, locale } = useTranslate()
  const panel = useRef<HTMLDivElement>(null)
  // `LocalDateTime.now()` read when the dialog composes
  const [now] = useState(() => Date.now())
  const loaded = state.kind === 'success'

  // focusRequester.tryRequestFocus() once loaded: the first button
  useEffect(() => {
    if (!loaded) return
    panel.current?.querySelector<HTMLElement>('[data-focusable]')?.focus({ preventScroll: true })
  }, [loaded])

  let body
  if (state.kind === 'error') {
    // upstream ErrorMessage(st): the same component as the rest of Live TV, with its "Send app logs" button
    body = <LiveTvError error={state.error} />
  } else if (state.kind === 'loading') {
    body = <CircularProgress size={48} className={styles.spinner} label={t('loading')} />
  } else {
    const dto = state.item
    const start = dto.StartDate ? Date.parse(dto.StartDate) : NaN
    const end = dto.EndDate ? Date.parse(dto.EndDate) : NaN
    const isRecording = notBlank(dto.TimerId)
    const isSeriesRecording = notBlank(dto.SeriesTimerId)
    const seLine = dtoSeasonEpisodeLine(dto, t)
    const airing = now > start && now < end
    // `dto.endDate?.isAfter(now) ?: true`
    const programRecordable = Number.isNaN(end) || end > now
    body = (
      <>
        <h2 className={styles.title} dir="auto">
          {dto.Name ?? ''}
        </h2>
        {seLine && (
          <p className={styles.episode} dir="auto">
            {seLine}
          </p>
        )}
        {!Number.isNaN(start) && <p className={styles.time}>{formatTimeRange(start, Number.isNaN(end) ? start : end, locale)}</p>}
        {dto.Overview && (
          <p className={styles.overview} dir="auto">
            {dto.Overview}
          </p>
        )}
        <div className={styles.actions}>
          {airing && (
            <TextButton onClick={() => onWatch(dto)}>
              <span className={styles.buttonContent}>
                <MaterialIcon name="play_arrow" />
                {t('watch_live')}
              </span>
            </TextButton>
          )}
          {canRecord && (
            <div className={styles.recordRow}>
              {dto.IsSeries && (
                <TextButton onClick={() => (isSeriesRecording ? onCancelRecord(dto, true) : onRecord(dto, true))}>
                  <span className={styles.buttonContent}>
                    {isSeriesRecording && <MaterialIcon name="close" className={styles.cancelIcon} />}
                    {isSeriesRecording ? t('cancel_series_recording') : t('record_series')}
                  </span>
                </TextButton>
              )}
              {programRecordable && (
                <TextButton onClick={() => (isRecording ? onCancelRecord(dto, false) : onRecord(dto, false))}>
                  <span className={styles.buttonContent}>
                    {isRecording && <MaterialIcon name="close" className={styles.cancelIcon} />}
                    {isRecording ? t('cancel_recording') : t('record_program')}
                  </span>
                </TextButton>
              )}
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <Dialog
      open
      onClose={onClose}
      variant="basic"
      label={state.kind === 'success' ? (state.item.Name ?? undefined) : undefined}
      className={clsx(styles.panel, loaded && styles.loaded)}
      style={{ background: 'color-mix(in srgb, var(--c-primary) 10.06%, var(--c-surface))' }}
    >
      <div ref={panel} className={styles.column}>
        {body}
      </div>
    </Dialog>
  )
}
