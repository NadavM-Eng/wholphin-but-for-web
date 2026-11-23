import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { formatClock, formatTimeOfDay } from '../../../lib/format'
import { DrawableIcon, MaterialIcon, TextButton } from '../../../ui'
import { getPlaybackEngine, usePlaybackStore } from '../engine'
import styles from './Controller.module.css'
import { FavoriteButton } from './FavoriteButton'
import { PlaybackButton } from './PlaybackButton'
import { AUDIO_TRACK_ICON, CHAPTERS_ICON, QUEUE_ICON } from './playerIcons'
import { SeekBar } from './SeekBar'
import { plainT, skipSegmentKey } from './text'
import type { PlayerDialog } from './types'
import { useSeekRange } from './useSeekRange'
import { VolumeControl } from './VolumeControl'

export interface ControllerProps {
  /** the open dialog or panel, for the pressed look of its button */
  dialog: PlayerDialog | null
  onDialog: (d: PlayerDialog) => void
  onInteract: (holdMs?: number) => void
  skipBackMs: number
  skipForwardMs: number
  fullscreen: { supported: boolean; active: boolean; toggle: () => void }
  pip: { supported: boolean; active: boolean; toggle: () => void }
}

/** Icon size in dp at the strip's full height; the button scales it down with the strip. */
const ICON = 24

/**
 * The control strip of the web player. Owner request: not the TV controller (title, seek bar, three button
 * groups and the Chapters / Queue rows under them, about a quarter of the screen: overlay/PlaybackController.kt,
 * PlaybackControls.kt) but one compact strip at the bottom edge, as in Jellyfin's web player, low enough to sit
 * inside the black bar of a 2.39:1 film (sizes: PlayerView.module.css `--player-strip-h`).
 *
 * Line 1: elapsed time, the seek bar, remaining time (or the Live badge); the times as a clock ("52:53",
 * "-1:07:20") instead of upstream's words. Line 2, from the physical left to the physical right, the same in
 * every language (owner request: a button stays where the hand expects it, in Hebrew and Arabic too):
 *   settings, favourite, picture in picture, volume | "Ends at" | previous, skip back, play / pause, skip
 *   forward, next (centred) | the Skip button of the current segment | subtitles, audio track, chapters, queue,
 *   fullscreen.
 * The DOM order is that order, so Tab walks the row left to right. Title, subtitle and clock are in the top strip
 * (PlayerTopBar). The buttons keep upstream's actions; chapters and queue open panels (ChaptersPanel, QueuePanel)
 * instead of the rows the TV shows under the controller; favourite is a web addition (FavoriteButton).
 */
export function Controller({ dialog, onDialog, onInteract, skipBackMs, skipForwardMs, fullscreen, pip }: ControllerProps) {
  const { t: rawT, i18n } = useTranslation()
  const t = plainT(rawT)
  const engine = getPlaybackEngine()
  const paused = usePlaybackStore((s) => s.paused)
  const hasNext = usePlaybackStore((s) => s.hasNext)
  const hasChapters = usePlaybackStore((s) => s.chapters.length > 0)
  const hasQueue = usePlaybackStore((s) => s.queue.length > 1)
  const segment = usePlaybackStore((s) => s.segment?.segment ?? null)
  const rate = usePlaybackStore((s) => s.playbackRate)
  const range = useSeekRange()

  const remaining = Math.max(0, range.endMs - range.positionMs)
  const elapsed = formatClock(range.positionMs - range.startMs)
  // Room for the longest text of this item ("1:52:53" needs more than "52:53"), so the seek bar keeps its length
  // when a time gains or loses a character. Counted in `ch`: the digits have one width and ":" is narrower.
  const timeChars = Math.max(formatClock(range.endMs - range.startMs).length, elapsed.length)

  // "Ends at" = now + remaining / speed, refreshed every second (PlaybackController.kt:203-224)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const endsAt = formatTimeOfDay(new Date(now + remaining / (rate || 1)), i18n.language)

  const click = (fn: () => void) => () => {
    onInteract()
    fn()
  }
  const settingsOpen = dialog === 'settings' || dialog === 'speed' || dialog === 'scale' || dialog === 'bitrate'

  return (
    <div className={styles.root} data-player-strip>
      <div className={styles.seekRow} style={{ '--time-ch': timeChars } as CSSProperties}>
        <span className={styles.time} dir="ltr" data-player-time="elapsed">
          {elapsed}
        </span>
        <div className={styles.seek}>
          <SeekBar
            positionMs={range.positionMs}
            durationMs={range.endMs}
            startMs={range.startMs}
            bufferedMs={range.bufferedMs}
            skipBackMs={skipBackMs}
            skipForwardMs={skipForwardMs}
            onSeek={(ms) => engine.seekTo(ms)}
            onInteract={onInteract}
            disabled={range.endMs <= range.startMs}
          />
        </div>
        {range.live ? (
          <span className={styles.live}>{t('web_playback_live')}</span>
        ) : (
          <span className={styles.timeEnd} dir="ltr" data-player-time="remaining">{`-${formatClock(remaining)}`}</span>
        )}
      </div>

      <div className={styles.row}>
        <div className={styles.start}>
          <div className={`${styles.group} ${styles.left}`} data-focus-group data-player-group="left">
            <PlaybackButton
              flat
              name="settings"
              icon={<MaterialIcon name="settings" size={ICON} />}
              label={t('settings')}
              expanded={settingsOpen}
              onClick={click(() => onDialog('settings'))}
            />
            <FavoriteButton onInteract={() => onInteract()} iconSize={ICON} />
            {pip.supported && (
              <PlaybackButton
                flat
                name="pip"
                icon={<MaterialIcon name="picture_in_picture_alt" size={ICON} />}
                label={t('web_playback_pip')}
                title={`${t('web_playback_pip')} (P)`}
                pressed={pip.active}
                onClick={click(pip.toggle)}
              />
            )}
            <VolumeControl onInteract={() => onInteract()} iconSize={ICON} />
          </div>
          {/* "Ends at" shows when the row has room for it: a second, clipped line takes it otherwise */}
          <div className={styles.info}>
            {!range.live && range.endMs > 0 && (
              <span className={styles.endsAt} data-player-ends-at>
                {t('ends_at', { p1: endsAt })}
              </span>
            )}
          </div>
        </div>

        <div className={styles.transport} data-focus-group data-player-group="transport">
          <PlaybackButton
            flat
            name="previous"
            icon={<DrawableIcon name="skip_previous" size={ICON} />}
            label={t('web_playback_previous')}
            title={`${t('web_playback_previous')} (Shift+P)`}
            onClick={click(() => engine.previousButton())}
          />
          <PlaybackButton
            flat
            name="skip-back"
            icon={<DrawableIcon name="fast_rewind" size={ICON} />}
            label={t('skip_back_preference')}
            title={`${t('skip_back_preference')} (J)`}
            onClick={click(() => engine.skipBack())}
          />
          <PlaybackButton
            flat
            name="play"
            icon={<DrawableIcon name={paused ? 'play' : 'pause'} size={ICON} />}
            label={paused ? t('play') : t('web_playback_pause')}
            title={`${paused ? t('play') : t('web_playback_pause')} (K)`}
            focusDefault
            onClick={click(() => engine.togglePlay())}
          />
          <PlaybackButton
            flat
            name="skip-forward"
            icon={<DrawableIcon name="fast_forward" size={ICON} />}
            label={t('skip_forward_preference')}
            title={`${t('skip_forward_preference')} (L)`}
            onClick={click(() => engine.skipForward())}
          />
          <PlaybackButton
            flat
            name="next"
            icon={<DrawableIcon name="skip_next" size={ICON} />}
            label={t('web_playback_next')}
            title={`${t('web_playback_next')} (N)`}
            disabled={!hasNext}
            onClick={click(() => engine.next())}
          />
        </div>

        <div className={styles.end}>
          {segment && (
            <div className={styles.skipSlot}>
              <TextButton className={styles.segmentButton} data-player-skip onClick={click(() => engine.seekTo(Math.floor((segment.EndTicks ?? 0) / 10_000)))}>
                <span className={styles.segmentLabel}>{t(skipSegmentKey(segment.Type))}</span>
              </TextButton>
            </div>
          )}
          <div className={`${styles.group} ${styles.right}`} data-focus-group data-player-group="right">
            <PlaybackButton
              flat
              name="subtitles"
              icon={<DrawableIcon name="captions" size={ICON} />}
              label={t('subtitles')}
              title={`${t('subtitles')} (C)`}
              expanded={dialog === 'captions'}
              onClick={click(() => onDialog('captions'))}
            />
            <PlaybackButton
              flat
              name="audio"
              icon={<MaterialIcon name={AUDIO_TRACK_ICON} size={ICON} />}
              label={t('audio')}
              title={`${t('audio')} (A)`}
              expanded={dialog === 'audio'}
              onClick={click(() => onDialog('audio'))}
            />
            {hasChapters && (
              <PlaybackButton
                flat
                name="chapters"
                icon={<MaterialIcon name={CHAPTERS_ICON} size={ICON} />}
                label={t('chapters')}
                title={`${t('chapters')} (H)`}
                expanded={dialog === 'chapters'}
                onClick={click(() => onDialog('chapters'))}
              />
            )}
            {hasQueue && (
              <PlaybackButton
                flat
                name="queue"
                icon={<MaterialIcon name={QUEUE_ICON} size={ICON} />}
                label={t('queue')}
                title={`${t('queue')} (Q)`}
                expanded={dialog === 'queue'}
                onClick={click(() => onDialog('queue'))}
              />
            )}
            {fullscreen.supported && (
              <PlaybackButton
                flat
                name="fullscreen"
                icon={<MaterialIcon name={fullscreen.active ? 'fullscreen_exit' : 'fullscreen'} size={ICON} />}
                label={fullscreen.active ? t('web_playback_exit_fullscreen') : t('web_playback_fullscreen')}
                title={`${fullscreen.active ? t('web_playback_exit_fullscreen') : t('web_playback_fullscreen')} (F)`}
                onClick={click(fullscreen.toggle)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
