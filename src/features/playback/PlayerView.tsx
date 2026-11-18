import clsx from 'clsx'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { ltrValue, plainT } from './ui/text'
import { toast } from '../../app/toast'
import { usePrefs } from '../../stores/preferences'
import { Button, CircularProgress, ErrorMessage, MaterialIcon, TextButton } from '../../ui'
import { getPlaybackEngine, PLAYBACK_SPEEDS, PlayerSurface, SubtitleLayer, usePlaybackStore } from './engine'
import { canRetryWithTranscoding, playbackErrorDetail, playbackErrorText } from './playbackErrors'
import styles from './PlayerView.module.css'
import { ChaptersPanel } from './ui/ChaptersPanel'
import { Controller } from './ui/Controller'
import { DebugOverlay } from './ui/DebugOverlay'
import { DownloadSubtitlesDialog } from './ui/DownloadSubtitlesDialog'
import { DpadSeekOverlay } from './ui/DpadSeekOverlay'
import { stepSpeed, type Shortcut } from './ui/keymap'
import { NextUpPanel } from './ui/NextUpPanel'
import { PauseIndicator } from './ui/PauseIndicator'
import { PlaybackDialogs } from './ui/PlaybackDialogs'
import { PlayerTopBar } from './ui/PlayerTopBar'
import { QueuePanel } from './ui/QueuePanel'
import { SEEK_COMMIT_DEBOUNCE_MS } from './ui/SeekBar'
import { ShortcutsDialog } from './ui/ShortcutsDialog'
import { SkipIndicator } from './ui/SkipIndicator'
import { SkipSegmentButton } from './ui/SkipSegmentButton'
import { STRIP_SHEETS, type ContentScale, type PlayerDialog } from './ui/types'
import { useControllerView } from './ui/useControllerView'
import { usePlayerKeys, type PlayerKeyContext } from './ui/usePlayerKeys'
import { useFullscreen, usePersistentVolume, usePictureInPicture } from './ui/useScreenModes'

/** Accumulated D-pad seek (PlaybackPage.kt skipIndicatorDuration / skipPosition). */
interface SkipState {
  total: number
  position: number
  /** increments on every step so the indicator animation restarts */
  seq: number
}

const SEGMENT_NAME: Record<string, string> = { Intro: 'intro', Outro: 'outro', Recap: 'recap', Preview: 'preview', Commercial: 'commercial' }
const DOUBLE_TAP_MS = 300

/**
 * The playback screen (W/ui/playback/PlaybackPage.kt PlaybackPageContent + overlay/PlaybackOverlay.kt): the video
 * with subtitles, the controls overlay, D-pad seek feedback, pause and buffering indicators, the floating Skip
 * button, the Next Up panel, the dialogs and the error screen. Mouse, touch and keyboard are layered on the TV
 * focus model (spec 05 §B7).
 *
 * The controls overlay is the web layout the owner asked for, not the TV's: a slim strip at the top (Back, logo,
 * title, clock: PlayerTopBar) and a compact strip at the bottom edge (seek line and one row of flat buttons:
 * Controller), each with its own dark gradient, and nothing over the picture between them. The TV's scrim over
 * the whole screen (PlaybackOverlay.kt:133-151) is the web-only preference "Dim the video while the controls
 * are shown", off by default. Chapters and queue are panels opened from the strip (ChaptersPanel, QueuePanel)
 * instead of the overlay states CHAPTERS / QUEUE.
 */
export function PlayerView({ onBack }: { onBack: () => void }) {
  const { t: rawT } = useTranslation()
  const t = plainT(rawT)
  const engine = getPlaybackEngine()
  const timeoutMs = usePrefs('controllerTimeout')
  const dpadSeekMode = usePrefs('dpadSeekMode')
  const oneClickPause = usePrefs('oneClickPause')
  const showClock = usePrefs('showClock')
  const skipBackMs = usePrefs('skipBack')
  const skipForwardMs = usePrefs('skipForward')
  const defaultScale = usePrefs('globalContentScale')
  const debugPref = usePrefs('playbackDebugInfo')
  const dimVideo = usePrefs('webPlayerDimVideo')

  const status = usePlaybackStore((s) => s.status)
  const error = usePlaybackStore((s) => s.error)
  const item = usePlaybackStore((s) => s.item)
  const nextUp = usePlaybackStore((s) => s.nextUp)
  const segment = usePlaybackStore((s) => s.segment)
  const autoplayBlocked = usePlaybackStore((s) => s.autoplayBlocked)
  const durationMs = usePlaybackStore((s) => s.durationMs)
  const bufferedMs = usePlaybackStore((s) => s.bufferedMs)
  const allowDirectPlay = usePlaybackStore((s) => s.allowDirectPlay)
  const allowDirectStream = usePlaybackStore((s) => s.allowDirectStream)
  const showSignal = usePlaybackStore((s) => s.showControlsSignal)
  const autoSkipped = usePlaybackStore((s) => s.autoSkipped)
  const muted = usePlaybackStore((s) => s.muted)
  const volume = usePlaybackStore((s) => s.volume)

  const controller = useControllerView(timeoutMs)
  const [dialog, setDialog] = useState<PlayerDialog | null>(null)
  const [showDebug, setShowDebug] = useState(debugPref)
  const [scale, setScale] = useState<ContentScale>(defaultScale)
  const [skip, setSkip] = useState<SkipState>({ total: 0, position: 0, seq: 0 })
  const [focusPlay, setFocusPlay] = useState(0)
  const [volumeHud, setVolumeHud] = useState(0)
  const [showBuffering, setShowBuffering] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipRef = useRef(skip)
  useLayoutEffect(() => {
    skipRef.current = skip
  })
  const fullscreen = useFullscreen()
  const pip = usePictureInPicture()
  usePersistentVolume()

  const visible = controller.visible
  const trickplayMode = dpadSeekMode === 'SEEKBAR_TRICKPLAY'

  // Video scale is page state (PlaybackPage.kt:176-184), starting from the global preference.
  useEffect(() => {
    engine.setContentScale(scale)
  }, [engine, scale])
  useEffect(() => () => engine.setContentScale('FIT'), [engine])

  // Showing or hiding the controls cancels the skip indicator (PlaybackPage.kt:217-221).
  useEffect(() => {
    setSkip((s) => (s.total === 0 ? s : { ...s, total: 0 }))
    if (!visible && overlay.current?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
  }, [visible])

  // Initial focus on Play/Pause when the controls appear from the keyboard. Each request is served once: controls
  // that come up later for another reason (the pointer, a panel opened by its shortcut) leave focus where it is.
  const focusPlayDone = useRef(0)
  useLayoutEffect(() => {
    if (!visible || focusPlay === focusPlayDone.current) return
    focusPlayDone.current = focusPlay
    overlay.current?.querySelector<HTMLElement>('[data-focus-default]')?.focus({ preventScroll: true })
  }, [focusPlay, visible])

  // Subtitle delay and subtitle search hide the controls so the subtitles stay visible (PlaybackPage.kt:779-782).
  useEffect(() => {
    if (dialog === 'delay' || dialog === 'search') controller.hide()
  }, [dialog, controller])

  // The engine asks for the controls at the end of an item with "Next up: never" (showControls()).
  // Only a new signal shows them: `controller` changes identity on every show/hide, so depending on it would
  // re-show the controls after each hide and Back could never leave the player.
  const controllerRef = useRef(controller)
  useLayoutEffect(() => {
    controllerRef.current = controller
  })
  useEffect(() => {
    if (showSignal > 0) controllerRef.current.show()
  }, [showSignal])
  // A sheet that stands on the control strip (settings, tracks, chapters, queue) keeps the strip up while it is
  // open; closing it restarts the hide timer. (On the TV the dialog window covers the controller, whose timer
  // runs on underneath.)
  const stripSheet = dialog != null && STRIP_SHEETS.has(dialog)
  useEffect(() => {
    if (!stripSheet) return
    controllerRef.current.show(Infinity)
    return () => controllerRef.current.pulse()
  }, [stripSheet])
  // The error screen owns the keys and pointer; the controls stay hidden behind it.
  useEffect(() => {
    if (error) controllerRef.current.hide()
  }, [error])

  // Buffering spinner only after 250 ms (PlaybackPage.kt:194-205).
  useEffect(() => {
    if (status !== 'buffering') {
      setShowBuffering(false)
      return
    }
    const id = setTimeout(() => setShowBuffering(true), 250)
    return () => clearTimeout(id)
  }, [status])

  // Web addition: a toast when a segment was skipped automatically.
  const lastSkipToast = useRef<string | null>(null)
  useEffect(() => {
    if (!autoSkipped || lastSkipToast.current === autoSkipped.segmentId) return
    lastSkipToast.current = autoSkipped.segmentId
    const name = SEGMENT_NAME[autoSkipped.type]
    toast(t('web_playback_auto_skipped', { p1: name ? t(name) : '' }))
  }, [autoSkipped, t])

  useEffect(() => {
    if (!volumeHud) return
    const id = setTimeout(() => setVolumeHud(0), 1000)
    return () => clearTimeout(id)
  }, [volumeHud])

  // D-pad seek: immediate seek with the skip indicator, or (trickplay mode) a pending position committed after
  // 750 ms and cleared 1.5 s after the last change.
  const updateIndicator = useCallback(
    (delta: number, position: number) => {
      setSkip((s) => {
        const reversed = (s.total > 0 && delta < 0) || (s.total < 0 && delta > 0)
        return { total: (reversed ? 0 : s.total) + delta, position, seq: s.seq + 1 }
      })
    },
    [],
  )
  const seekImmediate = useCallback(
    (delta: number) => {
      engine.seekBy(delta)
      updateIndicator(delta, engine.positionMs())
    },
    [engine, updateIndicator],
  )
  const dpadSeek = useCallback(
    (delta: number) => {
      if (!trickplayMode) {
        seekImmediate(delta)
        return
      }
      const s = skipRef.current
      const from = s.total === 0 ? engine.positionMs() : s.position
      const dur = usePlaybackStore.getState().durationMs
      const position = Math.min(Math.max(0, from + delta), Math.max(0, dur))
      updateIndicator(delta, position)
      if (commitTimer.current) clearTimeout(commitTimer.current)
      commitTimer.current = setTimeout(() => engine.seekTo(position), SEEK_COMMIT_DEBOUNCE_MS)
    },
    [engine, trickplayMode, seekImmediate, updateIndicator],
  )
  useEffect(() => {
    if (!trickplayMode || skip.total === 0) return
    const id = setTimeout(() => setSkip((s) => ({ ...s, total: 0 })), 1500)
    return () => clearTimeout(id)
  }, [trickplayMode, skip.seq, skip.total])
  useEffect(
    () => () => {
      if (commitTimer.current) clearTimeout(commitTimer.current)
    },
    [],
  )
  const clearSkip = useCallback(() => setSkip((s) => ({ ...s, total: 0 })), [])

  const showControls = useCallback(
    (focus: boolean) => {
      controller.show()
      if (focus) setFocusPlay((n) => n + 1)
    },
    [controller],
  )

  const showSegment = !!segment && !segment.interacted && !nextUp && !visible && skip.total === 0

  // Back: hide the controls first, then Skip button -> Next Up countdown -> Next Up panel -> leave.
  const back = useCallback(() => {
    if (controller.visible) {
      controller.hide()
      return
    }
    if (!engine.handleBack()) onBack()
  }, [controller, engine, onBack])

  const shortcut = useCallback(
    (s: Shortcut) => {
      const st = usePlaybackStore.getState()
      if (typeof s === 'object') {
        if (st.durationMs > 0) engine.seekTo((st.durationMs * s.percent) / 100)
        return
      }
      switch (s) {
        case 'toggle-play':
          engine.togglePlay()
          break
        case 'seek-back':
          seekImmediate(-skipBackMs)
          break
        case 'seek-forward':
          seekImmediate(skipForwardMs)
          break
        case 'next':
          engine.next()
          break
        case 'previous':
          engine.previous()
          break
        case 'stop':
          engine.stop('user')
          break
        case 'captions':
          setDialog('captions')
          break
        case 'audio':
          setDialog('audio')
          break
        case 'skip-segment':
          if (st.segment && !st.segment.interacted) engine.skipSegment()
          else if (st.segment) engine.seekTo(Math.floor((st.segment.segment.EndTicks ?? 0) / 10_000))
          break
        case 'fullscreen':
          if (fullscreen.supported) fullscreen.toggle()
          break
        case 'pip':
          if (pip.supported) pip.toggle()
          break
        case 'mute':
          engine.setMuted(!st.muted)
          setVolumeHud(Date.now())
          break
        case 'debug':
          setShowDebug((d) => !d)
          if (!controller.visible) showControls(false)
          break
        case 'subtitle-delay-down':
        case 'subtitle-delay-up':
          if (st.subtitleIndex != null) {
            engine.adjustSubtitleDelay(s === 'subtitle-delay-up' ? 250 : -250)
            toast(`${t('subtitle_delay')}: ${ltrValue(`${usePlaybackStore.getState().subtitleDelayMs} ms`)}`)
          }
          break
        case 'speed-down':
        case 'speed-up': {
          const next = stepSpeed(PLAYBACK_SPEEDS, st.playbackRate, s === 'speed-up' ? 1 : -1)
          if (next != null) {
            engine.setPlaybackRate(next)
            toast(`${t('playback_speed')}: ${ltrValue(`${next}x`)}`)
          }
          break
        }
        case 'help':
          setDialog('help')
          break
        case 'chapters':
          if (st.chapters.length > 0) setDialog('chapters')
          break
        case 'queue':
          if (st.queue.length > 1) setDialog('queue')
          break
      }
    },
    [engine, seekImmediate, skipBackMs, skipForwardMs, fullscreen, pip, controller, showControls, t],
  )

  const keyCtx = useRef<PlayerKeyContext>(null as unknown as PlayerKeyContext)
  const latestKeyCtx: PlayerKeyContext = {
    controlsVisible: visible,
    dialogOpen: dialog != null,
    errorShown: error != null,
    dpadSeekVisible: trickplayMode && skip.total !== 0,
    oneClickPause,
    skipBackMs,
    skipForwardMs,
    durationMs,
    dpadSeek,
    showControls: () => showControls(true),
    pulseControls: () => controller.pulse(),
    clearDpadSeek: clearSkip,
    back,
    leave: onBack,
    closeDialog: () => setDialog((d) => (d === 'speed' || d === 'scale' ? 'settings' : null)),
    shortcut,
  }
  useLayoutEffect(() => {
    keyCtx.current = latestKeyCtx
  })
  usePlayerKeys(keyCtx)

  // DEV-only test hook for the Playwright verification scripts (opens dialogs the test account may not reach)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__playerUi = { setDialog }
    return () => {
      delete w.__playerUi
    }
  }, [])

  // ---------------------------------------------------------------------------------------------
  // Pointer and touch

  const lastMove = useRef({ x: -1, y: -1, t: 0 })
  const overlayHovered = useRef(false)
  const onPointerMove = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'mouse') return
    const m = lastMove.current
    if (Math.abs(e.clientX - m.x) + Math.abs(e.clientY - m.y) < 3) return
    m.x = e.clientX
    m.y = e.clientY
    const now = performance.now()
    if (now - m.t < 150 && controller.visible) return
    m.t = now
    engine.reportInteraction()
    // moving on the floating Skip button / Next Up card must not raise the controls, which hide them
    const onPanel = e.target instanceof Element && !!e.target.closest('[data-skip-segment],[data-next-up]')
    if (!dialog && !error && !overlayHovered.current && !onPanel) controller.show()
  }

  const tap = useRef<{ t: number; x: number; side: -1 | 0 | 1; timer: ReturnType<typeof setTimeout> | null }>({ t: 0, x: 0, side: 0, timer: null })
  const onCatcherPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    engine.reportInteraction()
    if (e.pointerType === 'mouse') return
    const rect = e.currentTarget.getBoundingClientRect()
    const third = (e.clientX - rect.left) / rect.width
    const side: -1 | 0 | 1 = third < 1 / 3 ? -1 : third > 2 / 3 ? 1 : 0
    const now = Date.now()
    const tp = tap.current
    const quick = now - tp.t < DOUBLE_TAP_MS
    if (tp.timer) clearTimeout(tp.timer)
    tp.timer = null
    if (quick && side !== 0 && (tp.side === side || tp.side === 0 || tp.t === 0)) {
      // double tap (and further quick taps) on the left / right third: skip back / forward
      seekImmediate(side < 0 ? -skipBackMs : skipForwardMs)
      tp.t = now
      tp.side = side
      return
    }
    tp.t = now
    tp.side = side
    tp.timer = setTimeout(() => {
      tp.timer = null
      tp.t = 0
      if (controller.visible) controller.hide()
      else showControls(false)
    }, DOUBLE_TAP_MS)
  }
  useEffect(
    () => () => {
      if (tap.current.timer) clearTimeout(tap.current.timer)
    },
    [],
  )
  const onCatcherClick = (e: ReactMouseEvent) => {
    // mouse only (touch is handled on pointer up). Each click of a double click toggles, so a double click
    // (fullscreen) leaves play/pause as it was, like other desktop players.
    if ((e.nativeEvent as PointerEvent).pointerType && (e.nativeEvent as PointerEvent).pointerType !== 'mouse') return
    engine.togglePlay()
  }
  const onWheel = (e: WheelEvent) => {
    if (Math.abs(e.deltaY) < 1) return
    engine.reportInteraction()
    const st = usePlaybackStore.getState()
    const v = Math.min(1, Math.max(0, Math.round((st.muted ? 0 : st.volume) * 20 + (e.deltaY < 0 ? 1 : -1)) / 20))
    engine.setVolume(v)
    engine.setMuted(v === 0)
    setVolumeHud(Date.now())
  }

  // ---------------------------------------------------------------------------------------------
  // Render

  const loading = status === 'loading' && !error
  // a chapter or queue entry was chosen: the panel closes and the controls hide (ChapterRowOverlay.kt:117-121)
  const pickedFromPanel = () => {
    setDialog(null)
    controller.hide()
  }

  return (
    <div
      ref={root}
      className={clsx(styles.root, nextUp && styles.withNextUp, !visible && !dialog && styles.hideCursor)}
      onPointerMove={onPointerMove}
      onPointerDown={() => engine.reportInteraction()}
    >
      <div className={clsx(styles.player, nextUp && styles.shrunk)}>
        <PlayerSurface>
          <SubtitleLayer raised={visible} hidden={skip.total !== 0 && !visible} />
          <div
            className={styles.catcher}
            onClick={onCatcherClick}
            onDoubleClick={() => fullscreen.supported && fullscreen.toggle()}
            onPointerUp={onCatcherPointerUp}
            onWheel={onWheel}
            aria-hidden
          />

          {loading && (
            <div className={styles.cover}>
              <CircularProgress />
            </div>
          )}
          {showBuffering && !loading && (
            <div className={styles.buffering}>
              <CircularProgress />
            </div>
          )}

          {!visible && !dialog && skip.total === 0 && <PauseIndicator />}

          {!visible && skip.total !== 0 && !trickplayMode && (
            <>
              <div className={styles.skipIndicator}>
                <SkipIndicator durationMs={skip.total} seq={skip.seq} onFinish={clearSkip} />
              </div>
              {dpadSeekMode === 'SEEKBAR_MINIMAL' && durationMs > 0 && (
                <div className={styles.miniProgress} style={{ width: `${Math.min(100, (skip.position / durationMs) * 100)}%` }} />
              )}
            </>
          )}
          {!visible && skip.total !== 0 && trickplayMode && (
            <DpadSeekOverlay positionMs={skip.position} durationMs={durationMs} bufferedMs={bufferedMs} />
          )}

          {volumeHud > 0 && (
            <div className={styles.hud} role="status">
              <MaterialIcon name={muted || volume === 0 ? 'volume_off' : 'volume_up'} size={20} />
              {`${Math.round((muted ? 0 : volume) * 100)}%`}
            </div>
          )}

          {/* Controls overlay (PlaybackOverlay.kt) */}
          <div
            ref={overlay}
            className={clsx(styles.overlay, visible && styles.overlayVisible, dimVideo && !showDebug && styles.dim)}
            inert={!visible}
            data-focus-trap={visible && !dialog && !error ? true : undefined}
            onPointerEnter={(e) => {
              if (e.pointerType === 'mouse') overlayHovered.current = false
            }}
          >
            <div className={styles.top}>
              <PlayerTopBar onBack={onBack} visible={visible} showClock={showClock} showDebug={showDebug} />
            </div>
            {showDebug && visible && (
              <div
                className={styles.debug}
                onFocusCapture={() => controller.pulse(Infinity)}
                onBlurCapture={() => controller.pulse()}
                onPointerEnter={() => controller.pulse(Infinity)}
                onPointerLeave={() => controller.pulse()}
              >
                <DebugOverlay />
              </div>
            )}
            <div
              className={styles.bottom}
              onPointerEnter={(e) => {
                if (e.pointerType !== 'mouse') return
                overlayHovered.current = true
                controller.pulse(Infinity)
              }}
              onPointerLeave={(e) => {
                if (e.pointerType !== 'mouse') return
                overlayHovered.current = false
                // a sheet opening over the strip takes the pointer from it: the strip stays while the sheet is open
                if (!stripSheet) controller.pulse()
              }}
            >
              {visible && (
                <div className={styles.slideUp}>
                  <Controller
                    dialog={dialog}
                    onDialog={setDialog}
                    onInteract={(hold) => controller.pulse(hold)}
                    skipBackMs={skipBackMs}
                    skipForwardMs={skipForwardMs}
                    fullscreen={fullscreen}
                    pip={pip}
                  />
                </div>
              )}
            </div>
          </div>

          {autoplayBlocked && !error && (
            <div className={styles.center} data-player-prompt>
              <Button onClick={() => engine.play()} autoFocus>
                <MaterialIcon name="play_arrow" />
                {t('web_playback_click_to_play')}
              </Button>
            </div>
          )}
        </PlayerSurface>
      </div>

      {showSegment && segment && (
        <div className={styles.segment}>
          <SkipSegmentButton
            key={`${segment.segment.Id}`}
            type={segment.segment.Type}
            onSkip={() => engine.skipSegment()}
            onDismiss={() => engine.dismissSegment()}
          />
        </div>
      )}

      {nextUp && (
        <NextUpPanel
          onPlay={() => {
            engine.reportInteraction()
            controller.hide()
            engine.playNextUp()
          }}
        />
      )}

      {error && (
        <div className={styles.error} data-player-error data-focus-trap>
          <ErrorMessage title={t('error')} message={playbackErrorText(rawT, error)} detail={playbackErrorDetail(playbackErrorText(rawT, error), error)} />
          <div className={styles.errorActions}>
            <TextButton onClick={() => engine.retry(false)} autoFocus>
              {t('retry')}
            </TextButton>
            {canRetryWithTranscoding(error, item != null, allowDirectPlay, allowDirectStream) && (
              <TextButton onClick={() => engine.retry(true)}>{t('play_with_transcoding')}</TextButton>
            )}
            <TextButton onClick={onBack}>{t('web_back')}</TextButton>
          </div>
        </div>
      )}

      {dialog === 'search' ? (
        <DownloadSubtitlesDialog onClose={() => setDialog(null)} />
      ) : dialog === 'help' ? (
        <ShortcutsDialog onClose={() => setDialog(null)} />
      ) : dialog === 'chapters' ? (
        <ChaptersPanel onClose={() => setDialog(null)} onPicked={pickedFromPanel} />
      ) : dialog === 'queue' ? (
        <QueuePanel onClose={() => setDialog(null)} onPicked={pickedFromPanel} />
      ) : dialog ? (
        <PlaybackDialogs
          key={dialog}
          dialog={dialog}
          setDialog={setDialog}
          showDebug={showDebug}
          onToggleDebug={() => setShowDebug((d) => !d)}
          scale={scale}
          onScale={setScale}
          onSearchSubtitles={() => {
            controller.hide()
            setDialog('search')
          }}
        />
      ) : null}
    </div>
  )
}
