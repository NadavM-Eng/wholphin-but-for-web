import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { getSession } from '../../../api/session'
import { formatMaxBitrate } from '../../../lib/format'
import { ListItem, SelectedDot } from '../../../ui'
import { BITRATE_VALUES, getPlaybackEngine, PLAYBACK_SPEEDS, TrackIndex, usePlaybackStore } from '../engine'
import styles from './PlaybackDialogs.module.css'
import { PlayerSheet } from './PlayerSheet'
import { SubtitleDelayDialog } from './SubtitleDelayDialog'
import { SubtitleStyleSheet } from './SubtitleStyleSheet'
import { kotlinDuration, speedLabel, streamLabels, plainT } from './text'
import { CONTENT_SCALE_LABELS, CONTENT_SCALES, type ContentScale, type PlayerDialog } from './types'

export interface PlaybackDialogsProps {
  dialog: PlayerDialog
  setDialog: (d: PlayerDialog | null) => void
  showDebug: boolean
  onToggleDebug: () => void
  scale: ContentScale
  onScale: (s: ContentScale) => void
  /** Captions -> "Search & Download" */
  onSearchSubtitles: () => void
}

/** Float.toString of the speed ("1.0", "0.25") for the Settings row. */
const floatString = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n))

/** `hasSubtitleDownloadPermission` (PlaybackPage.kt:754-755). */
function canDownloadSubtitles(): boolean {
  const p = getSession()?.userDto.Policy
  return !!(p?.IsAdministrator || p?.EnableSubtitleManagement)
}

/**
 * `PlaybackDialog` (W/ui/playback/PlaybackDialog.kt): Settings / Speed / Scale / Bitrate on elevation 1, Captions /
 * Audio on elevation 3, the subtitle delay centered. Choosing a speed or scale returns to Settings, like upstream's
 * dismiss handler. Upstream opens the Settings group bottom-start, above its Settings button at the start of the
 * controller, and the track lists bottom-end; in the web strip the settings, subtitles and audio buttons are at the
 * physical left in every language, so every sheet opens at the left, above them.
 */
export function PlaybackDialogs({ dialog, setDialog, showDebug, onToggleDebug, scale, onScale, onSearchSubtitles }: PlaybackDialogsProps) {
  const t = plainT(useTranslation().t)
  const engine = getPlaybackEngine()
  const st = usePlaybackStore()
  const close = () => setDialog(null)

  switch (dialog) {
    case 'settings': {
      const rows: Array<{ key: PlayerDialog | 'debug' | 'help'; headline: string; supporting?: string | null }> = [
        { key: 'speed', headline: t('playback_speed'), supporting: floatString(st.playbackRate) },
        { key: 'scale', headline: t('video_scale'), supporting: t(CONTENT_SCALE_LABELS[scale]) },
        // upstream offers the delay only with MPV; the web renderer supports it everywhere (spec 05 §B4)
        { key: 'delay', headline: t('subtitle_delay'), supporting: kotlinDuration(st.subtitleDelayMs) },
        // web addition (owner request): the Settings page's subtitle style options, with the video as the preview
        { key: 'subtitleStyle', headline: t('subtitle_style') },
        { key: 'bitrate', headline: t('max_bitrate'), supporting: formatMaxBitrate(st.maxBitrate) },
        { key: 'debug', headline: t(showDebug ? 'hide_debug_info' : 'show_debug_info') },
        { key: 'help', headline: t('web_shortcut_title') },
      ]
      return (
        <PlayerSheet label={t('settings')} placement="bottom-left" className={styles.compactSheet} surface={1} onClose={close}>
          {rows.map((r) => (
            <ListItem
              key={r.key}
              headline={<Line>{r.headline}</Line>}
              supporting={r.supporting ? <Line>{r.supporting}</Line> : null}
              // no leading slot: upstream keeps an empty selection dot here, which only made the menu wider
              className={styles.row}
              disabled={r.key === 'delay' && st.subtitleIndex == null}
              onClick={() => {
                if (r.key === 'debug') {
                  close()
                  onToggleDebug()
                } else setDialog(r.key)
              }}
            />
          ))}
        </PlayerSheet>
      )
    }

    case 'speed':
      return (
        <PlayerSheet label={t('playback_speed')} placement="bottom-left" className={styles.compactSheet} onClose={() => setDialog('settings')} initialFocus="[data-current]">
          {PLAYBACK_SPEEDS.map((r) => (
            <Choice
              key={r}
              headline={speedLabel(r)}
              selected={Math.abs(r - st.playbackRate) < 1e-6}
              onClick={() => {
                engine.setPlaybackRate(r)
                setDialog('settings')
              }}
            />
          ))}
        </PlayerSheet>
      )

    case 'scale':
      return (
        <PlayerSheet label={t('video_scale')} placement="bottom-left" className={styles.compactSheet} onClose={() => setDialog('settings')} initialFocus="[data-current]">
          {CONTENT_SCALES.map((s) => (
            <Choice
              key={s}
              headline={t(CONTENT_SCALE_LABELS[s])}
              selected={s === scale}
              onClick={() => {
                onScale(s)
                setDialog('settings')
              }}
            />
          ))}
        </PlayerSheet>
      )

    case 'subtitleStyle':
      return <SubtitleStyleSheet onClose={() => setDialog('settings')} />

    case 'bitrate':
      return (
        <PlayerSheet label={t('max_bitrate')} placement="bottom-left" className={styles.compactSheet} onClose={close} initialFocus="[data-current]">
          {BITRATE_VALUES.map((b) => (
            <Choice
              key={b}
              headline={formatMaxBitrate(b)}
              selected={b === st.maxBitrate}
              onClick={() => {
                close()
                engine.setMaxBitrate(b)
              }}
            />
          ))}
        </PlayerSheet>
      )

    case 'delay':
      return <SubtitleDelayDialog onClose={close} />

    case 'audio':
      return (
        <PlayerSheet label={t('audio')} placement="bottom-right" surface={3} onClose={close} initialFocus="[data-current]">
          {st.audioStreams.map((s) => {
            const l = streamLabels(t, s)
            return (
              <Choice
                key={s.Index}
                headline={l.headline}
                supporting={l.supporting}
                selected={s.Index === st.audioIndex}
                onClick={() => {
                  close()
                  if (s.Index != null) engine.setAudio(s.Index)
                }}
              />
            )
          })}
        </PlayerSheet>
      )

    case 'captions': {
      // the raw choice, so "Only forced" stays selected after a restart (spec 08 PB-7)
      const current = st.subtitleChoice === TrackIndex.UNSPECIFIED ? (st.subtitleIndex ?? TrackIndex.DISABLED) : st.subtitleChoice
      const pick = (index: number) => {
        close()
        engine.setSubtitle(index)
      }
      const focusCurrent = current >= 0 ? '[data-current]' : '[data-none]'
      return (
        <PlayerSheet label={t('subtitles')} placement="bottom-right" surface={3} onClose={close} initialFocus={focusCurrent} wrap>
          <Choice headline={t('none')} selected={current === TrackIndex.DISABLED} onClick={() => pick(TrackIndex.DISABLED)} attr="data-none" />
          <Choice headline={t('only_forced_subtitles')} selected={current === TrackIndex.ONLY_FORCED} onClick={() => pick(TrackIndex.ONLY_FORCED)} />
          {st.subtitleStreams.length > 0 && <hr className={styles.divider} />}
          {st.subtitleStreams.map((s) => {
            const l = streamLabels(t, s)
            return (
              <Choice
                key={s.Index}
                headline={l.headline}
                supporting={l.supporting}
                selected={s.Index === current}
                onClick={() => s.Index != null && pick(s.Index)}
              />
            )
          })}
          <hr className={styles.divider} />
          <ListItem
            headline={<Line>{t('search_and_download')}</Line>}
            leading={<SelectedDot selected={false} />}
            className={styles.row}
            disabled={!canDownloadSubtitles()}
            onClick={() => {
              close()
              onSearchSubtitles()
            }}
          />
        </PlayerSheet>
      )
    }

    default:
      return null
  }
}

/**
 * One line of a row at the font's own height, as Compose lays out a one-line Text (see PlaybackDialogs.module.css).
 * The text takes its direction from its content (`<bdi>`): a value such as ".25", "-1.5s" or "100 Mbps" and a track
 * title from the server read left to right in a right-to-left interface, a translated label right to left.
 */
function Line({ children }: { children: ReactNode }) {
  return (
    <span className={styles.line}>
      <bdi>{children}</bdi>
    </span>
  )
}

function Choice({
  headline,
  supporting,
  selected,
  onClick,
  attr,
}: {
  headline: string
  supporting?: string | null
  selected: boolean
  onClick: () => void
  attr?: string
}) {
  const extra: Record<string, boolean | undefined> = { 'data-current': selected || undefined }
  if (attr) extra[attr] = true
  return (
    <div className={styles.choice} {...extra}>
      <ListItem
        headline={<Line>{headline}</Line>}
        supporting={supporting ? <Line>{supporting}</Line> : null}
        leading={<SelectedDot selected={selected} />}
        selected={selected}
        className={styles.row}
        onClick={onClick}
        role="menuitemradio"
      />
    </div>
  )
}
