import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useHideBackButton } from '../../app/shell'
import { useGoBack } from '../../app/shell/useGoBack'
import { usePrefs } from '../../stores/preferences'
import { useMusicQueue, type AudioItem } from '../../stores/musicQueue'
import { ContextMenu, DrawableIcon, FaIcon, LoadingPage, MaterialIcon } from '../../ui'
import { useTranslate } from '../common/useTranslate'
import { PlaybackButton } from '../playback/ui/PlaybackButton'
import { useControllerView } from '../playback/ui/useControllerView'
import { useLyrics } from './data/musicQueries'
import { buildQueueMenu } from './menu/musicMenu'
import { BarVisualizer } from './nowplaying/BarVisualizer'
import { currentLyricIndex, hasLyricLines, LYRIC_TICK_MS } from './nowplaying/lyricsModel'
import { LyricsPane } from './nowplaying/LyricsPane'
import { MusicSeekBar } from './nowplaying/MusicSeekBar'
import { MusicViewOptionsDialog } from './nowplaying/MusicViewOptionsDialog'
import { QueueList } from './nowplaying/QueueList'
import { useNowPlayingBackdrop } from './nowplaying/useNowPlayingBackdrop'
import styles from './NowPlayingPage.module.css'
import {
  cycleRepeat,
  enableVisualizer,
  hasNext,
  moveToNext,
  musicElement,
  next,
  playIndex,
  previous,
  removeFromQueue,
  SEEK_BACK_MS,
  SEEK_FORWARD_MS,
  seekBy,
  seekTo,
  stop,
  toggleShuffle,
  togglePlay,
} from './service/musicService'
import { hasVisualizerTap } from './service/visualizerTap'

/** NowPlayingViewModel: `ControllerViewState(AppPreference.ControllerTimeout.defaultValue)` - the user's timeout is ignored. */
export const NOW_PLAYING_CONTROLS_TIMEOUT_MS = 5000

/**
 * `NowPlayingPage` (W/ui/detail/music/NowPlayingPage.kt, NowPlayingOverlay.kt, NowPlayingButtons.kt): backdrop
 * (song then artist backdrops), album art column (240dp, title / album / artists), visualizer, synced lyrics,
 * and the bottom controls overlay (seek bar, gear / stop, previous / -10 s / play / +30 s / next, shuffle /
 * repeat, queue). The overlay starts hidden and auto-hides after 5 s; any key, pointer move or tap shows it.
 */
export default function NowPlayingPage() {
  const { t } = useTranslate()
  const navigate = useNavigate()
  const goBack = useGoBack()
  const showAlbumArt = usePrefs('musicShowAlbumArt')
  const showVisualizer = usePrefs('musicShowVisualizer')
  const showBackdrop = usePrefs('musicShowBackdrop')
  const showLyrics = usePrefs('musicShowLyrics')
  const oneClickPause = usePrefs('oneClickPause')
  const current = useMusicQueue((s) => s.entries[s.currentIndex] ?? null)
  const status = useMusicQueue((s) => s.status)
  const loading = useMusicQueue((s) => s.loading)
  const positionMs = useMusicQueue((s) => s.positionMs)
  const durationMs = useMusicQueue((s) => s.durationMs)
  const bufferedMs = useMusicQueue((s) => s.bufferedMs)
  const shuffle = useMusicQueue((s) => s.shuffle)
  const repeat = useMusicQueue((s) => s.repeat)
  const canNext = useMusicQueue(hasNext)
  const hasQueue = useMusicQueue((s) => s.entries.length > 0)
  const controls = useControllerView(NOW_PLAYING_CONTROLS_TIMEOUT_MS)
  const [queueFocused, setQueueFocused] = useState(false)
  const [deepQueue, setDeepQueue] = useState(false)
  const [options, setOptions] = useState(false)
  const [menu, setMenu] = useState<{ entry: AudioItem; index: number } | null>(null)
  const [lyricIndex, setLyricIndex] = useState<number | null>(null)
  const lyricsRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  // Read from the DOM, not kept as state: a focused line removed by a track change fires no blur, and a stale
  // "lyrics focused" flag would swallow every key, pointer move and Escape.
  const lyricsFocused = () => !!lyricsRef.current?.contains(document.activeElement)

  useNowPlayingBackdrop(current?.id ?? null, showBackdrop)
  // The TV page shows nothing but the art while the controls are hidden: the shell's floating Back button comes
  // and goes with the controls (as in the video player). It stays while there is nothing to play.
  useHideBackButton(!controls.visible && hasQueue)
  const lyricsQ = useLyrics(current?.id, current?.hasLyrics ?? false)
  // lyrics are reset on every track change; the query key changes with the song id
  const lyrics = lyricsQ.data ?? null
  const lyricsShown = showLyrics && hasLyricLines(lyrics)

  // 150 ms loop: current lyric line
  useEffect(() => {
    if (!lyrics || !hasLyricLines(lyrics)) return
    const tick = () => {
      const el = musicElement()
      const pos = el && !el.paused ? el.currentTime * 1000 : useMusicQueue.getState().positionMs
      setLyricIndex(currentLyricIndex(lyrics, pos))
    }
    tick()
    const id = setInterval(tick, LYRIC_TICK_MS)
    return () => clearInterval(id)
  }, [lyrics])

  // The visualizer preference only works once the analyser tap exists (MU-4: a reload loses it).
  useEffect(() => {
    if (showVisualizer && !hasVisualizerTap()) void enableVisualizer()
  }, [showVisualizer])

  // Keys (PlaybackKeyHandler with seekBack 10 s, seekForward 30 s, no left/right skip) and the Back chain.
  useEffect(() => {
    // NowPlayingOverlay.kt: LaunchedEffect(Unit) { focusRequester.tryRequestFocus() }: controls opened from the
    // keyboard start with focus on play / pause (the overlay stops being inert on the next render).
    const showFocused = () => {
      controls.show()
      requestAnimationFrame(() => pageRef.current?.querySelector<HTMLElement>('[data-play-button] button')?.focus())
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      if (document.querySelector('[role="dialog"], [role="menu"]')) return
      const target = e.target as HTMLElement | null
      const onControl = !!target?.closest('button, [role="slider"], [role="button"], a')
      switch (e.key) {
        case 'MediaPlayPause':
        case 'MediaPlay':
        case 'MediaPause':
          e.preventDefault()
          togglePlay()
          return
        case 'MediaTrackNext':
          e.preventDefault()
          next()
          return
        case 'MediaTrackPrevious':
          e.preventDefault()
          previous()
          return
        case 'MediaFastForward':
          e.preventDefault()
          seekBy(SEEK_FORWARD_MS)
          return
        case 'MediaRewind':
          e.preventDefault()
          seekBy(-SEEK_BACK_MS)
          return
        case 'MediaStop':
          e.preventDefault()
          stop()
          goBack()
          return
        case 'Escape':
        case 'GoBack':
        case 'XF86Back': {
          e.preventDefault()
          if (deepQueue) {
            const first = pageRef.current?.querySelector<HTMLElement>('[data-queue-index="0"] [data-focusable]')
            first?.scrollIntoView({ block: 'nearest' })
            first?.focus()
            setDeepQueue(false)
          } else if (lyricsFocused()) {
            ;(document.activeElement as HTMLElement | null)?.blur()
          } else if (controls.visible) {
            controls.hide()
            ;(document.activeElement as HTMLElement | null)?.blur()
          } else {
            goBack()
          }
          return
        }
      }
      // skipWithLeftRight = false (NowPlayingPage.kt): with the controls hidden, Left/Right only show them.
      if (!controls.visible && !lyricsFocused()) {
        if (e.key === 'ArrowUp' && lyricsShown) {
          e.preventDefault()
          lyricsRef.current?.querySelector<HTMLElement>('[aria-current="true"], button')?.focus()
          return
        }
        if (e.key === 'Enter' && !onControl) {
          e.preventDefault()
          if (oneClickPause) togglePlay()
          else showFocused()
          return
        }
        if (e.key.startsWith('Arrow')) {
          e.preventDefault()
          showFocused()
          return
        }
      }
      if (e.key === ' ' && !onControl) {
        e.preventDefault()
        togglePlay()
      }
      if (controls.visible) controls.pulse()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [controls, deepQueue, lyricsShown, oneClickPause, goBack])

  const queueMenuItems = useMemo(
    () =>
      menu
        ? buildQueueMenu(menu.entry, menu.index, t, {
            navigate: (p) => void navigate(p),
            play: (i) => void playIndex(i),
            playNext: (i) => moveToNext(i),
            remove: (i) => removeFromQueue(i),
          })
        : [],
    [menu, t, navigate],
  )

  const activity = () => {
    if (lyricsFocused()) return
    if (controls.visible) controls.pulse(queueFocused ? NOW_PLAYING_CONTROLS_TIMEOUT_MS * 3 : undefined)
    else controls.show()
  }
  const playing = status === 'playing'
  const interact = () => controls.pulse()

  return (
    <div
      ref={pageRef}
      className={clsx(styles.page, controls.visible && styles.controlsOn)}
      onPointerMove={(e) => e.pointerType === 'mouse' && activity()}
      onPointerDown={() => activity()}
      data-now-playing
    >
      <div className={clsx(styles.main, lyricsShown && styles.withLyrics)}>
        <div className={styles.left}>
          {showAlbumArt && current && (
            <div className={styles.art}>
              {current.imageUrl ? <img className={styles.cover} src={current.imageUrl} alt="" draggable={false} /> : <div className={styles.cover} aria-hidden />}
              {current.title && (
                <p className={styles.title} dir="auto">
                  {current.title}
                </p>
              )}
              {current.albumTitle && (
                <p className={styles.sub} dir="auto">
                  {current.albumTitle}
                </p>
              )}
              {current.artistNames && (
                <p className={styles.sub} dir="auto">
                  {current.artistNames}
                </p>
              )}
            </div>
          )}
          {showVisualizer && (
            <div className={styles.visualizer}>
              <BarVisualizer />
            </div>
          )}
        </div>
        {lyricsShown && lyrics && (
          <div ref={lyricsRef} className={styles.lyrics}>
            <LyricsPane
              lyrics={lyrics}
              current={lyricIndex}
              onSeek={(ms) => seekTo(ms)}
              onFocusChange={(f) => {
                if (f) controls.hide()
              }}
            />
          </div>
        )}
      </div>

      <div
        className={clsx(styles.overlay, queueFocused && styles.overlayFull)}
        data-visible={controls.visible || undefined}
        inert={!controls.visible}
        aria-hidden={!controls.visible || undefined}
      >
        <MusicSeekBar
          positionMs={positionMs}
          durationMs={durationMs}
          bufferedMs={bufferedMs}
          onSeek={seekTo}
          onInteract={interact}
          stepBackMs={SEEK_BACK_MS}
          stepForwardMs={SEEK_FORWARD_MS}
        />
        <div className={clsx(styles.buttons, deepQueue && styles.buttonsHidden)}>
          <div className={styles.start} data-focus-group>
            <PlaybackButton icon={<MaterialIcon name="settings" size={28} />} label={t('view_options')} onClick={() => setOptions(true)} />
            <PlaybackButton
              icon={<DrawableIcon name="stop" size={28} />}
              label={t('web_music_stop')}
              onClick={() => {
                stop()
                goBack()
              }}
            />
          </div>
          <div className={styles.center} data-focus-group>
            <PlaybackButton icon={<DrawableIcon name="skip_previous" size={28} />} label={t('web_playback_previous')} disabled={!hasQueue} onClick={() => (interact(), previous())} />
            <PlaybackButton icon={<DrawableIcon name="fast_rewind" size={28} />} label={t('skip_back_preference')} disabled={!hasQueue} onClick={() => (interact(), seekBy(-SEEK_BACK_MS))} />
            <span data-play-button className={styles.playWrap}>
              <PlaybackButton
                icon={<DrawableIcon name={playing ? 'pause' : 'play'} size={28} />}
                label={playing ? t('web_playback_pause') : t('play')}
                disabled={!hasQueue}
                focusDefault
                onClick={() => (interact(), togglePlay())}
              />
            </span>
            <PlaybackButton icon={<DrawableIcon name="fast_forward" size={28} />} label={t('skip_forward_preference')} disabled={!hasQueue} onClick={() => (interact(), seekBy(SEEK_FORWARD_MS))} />
            <PlaybackButton icon={<DrawableIcon name="skip_next" size={28} />} label={t('web_playback_next')} disabled={!canNext} onClick={() => (interact(), next())} />
          </div>
          <div className={styles.end} data-focus-group>
            <button
              type="button"
              className={clsx(styles.toggle, !shuffle && styles.off)}
              data-focusable
              aria-pressed={shuffle}
              aria-label={t('shuffle')}
              title={t('shuffle')}
              onClick={() => (interact(), toggleShuffle())}
            >
              <FaIcon name="shuffle" />
            </button>
            <button
              type="button"
              className={clsx(styles.toggle, repeat === 'off' && styles.off)}
              data-focusable
              aria-label={t(`web_music_repeat_${repeat}`)}
              title={t(`web_music_repeat_${repeat}`)}
              onClick={() => (interact(), cycleRepeat())}
            >
              <FaIcon name="repeat" />
              {repeat === 'one' && <span className={styles.one}>1</span>}
            </button>
          </div>
        </div>
        <div className={styles.queue}>
          <QueueList
            onMenu={(entry, index) => setMenu({ entry, index })}
            onFocusChange={setQueueFocused}
            onDeepFocus={setDeepQueue}
            onInteract={() => controls.show(NOW_PLAYING_CONTROLS_TIMEOUT_MS * 3)}
            visible={controls.visible}
          />
        </div>
      </div>

      {!controls.visible && !hasQueue && <p className={styles.noItems}>{t('web_music_no_items')}</p>}
      {loading && <LoadingPage className={styles.loading} label={t('loading')} />}
      {menu && <ContextMenu open title={menu.entry.title ?? ''} items={queueMenuItems} point={null} onClose={() => setMenu(null)} />}
      {options && <MusicViewOptionsDialog onClose={() => setOptions(false)} />}
    </div>
  )
}
