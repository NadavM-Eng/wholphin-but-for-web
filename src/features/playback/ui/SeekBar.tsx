import clsx from 'clsx'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { plainT } from './text'
import { formatDuration } from '../../../lib/format'
import { HoldSeek } from './holdSeek'
import styles from './SeekBar.module.css'
import { TrickplayPreview } from './TrickplayPreview'

/** SeekBarState debounce (overlay/SeekBarState.kt): key seeks commit 750 ms after the last step. */
export const SEEK_COMMIT_DEBOUNCE_MS = 750

export interface SeekBarProps {
  positionMs: number
  durationMs: number
  bufferedMs: number
  /** start of the seekable window (live TV), 0 for VOD */
  startMs?: number
  skipBackMs: number
  skipForwardMs: number
  onSeek: (ms: number) => void
  /** controls interaction: pulses the auto-hide timer (pass Infinity while dragging) */
  onInteract: (holdMs?: number) => void
  onFocusChange?: (focused: boolean) => void
  disabled?: boolean
  /** element the trickplay preview is rendered into (the controller's anchor); without it, right above the bar */
  previewHost?: HTMLElement | null
}

/**
 * The controller seek bar (overlay/PlaybackControls.kt SeekBar + SeekBar.kt IntervalSeekBarImpl/SeekBarDisplay):
 * round-capped track onSurface@25%, buffered onSurface@65%, progress in the theme border color, white knob with
 * radius = bar height + 1dp; 6dp tall, 12dp when focused (the layout grows with it, as upstream). The lines are
 * drawn with round caps, so each extends half the bar height past both of its ends. D-pad left/right step by the skip sizes with acceleration
 * and commit after 750 ms. Pointer additions: hover preview, click to seek, drag to scrub (commit on release),
 * wheel to skip. The trickplay preview floats above the bar while it is focused, hovered or dragged.
 */
export function SeekBar({
  positionMs,
  durationMs,
  bufferedMs,
  startMs = 0,
  skipBackMs,
  skipForwardMs,
  onSeek,
  onInteract,
  onFocusChange,
  disabled,
  previewHost,
}: SeekBarProps) {
  const t = plainT(useTranslation().t)
  const root = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const hold = useRef(new HoldSeek(0))
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [focused, setFocused] = useState(false)
  const [keyPending, setKeyPending] = useState<number | null>(null)
  const [hoverMs, setHoverMs] = useState<number | null>(null)
  const [dragMs, setDragMs] = useState<number | null>(null)
  const span = Math.max(1, durationMs - startMs)

  useEffect(
    () => () => {
      if (commitTimer.current) clearTimeout(commitTimer.current)
    },
    [],
  )

  const clamp = (ms: number) => Math.min(durationMs > 0 ? durationMs : ms, Math.max(startMs, ms))
  const shown = dragMs ?? keyPending ?? positionMs
  const pct = (ms: number) => Math.min(1, Math.max(0, (ms - startMs) / span))
  const previewMs = dragMs ?? hoverMs ?? (focused && keyPending != null ? keyPending : focused ? positionMs : null)

  // Keep the preview inside the bar: x = width * pct - w / 2, clamped to [0, width - w] (offsetByPercent).
  useLayoutEffect(() => {
    const el = previewRef.current
    const box = root.current
    if (!el || !box || previewMs == null) return
    const w = el.offsetWidth
    const width = box.clientWidth
    const x = Math.min(Math.max(0, width * pct(previewMs) - w / 2), Math.max(0, width - w))
    el.style.transform = `translateX(${x}px)`
  })

  const msAt = (clientX: number) => {
    const r = track.current?.getBoundingClientRect()
    if (!r || r.width <= 0) return positionMs
    // the bar is drawn left to right in every locale (SeekBar is forced LTR upstream)
    return clamp(startMs + ((clientX - r.left) / r.width) * span)
  }

  const scheduleCommit = (ms: number) => {
    if (commitTimer.current) clearTimeout(commitTimer.current)
    commitTimer.current = setTimeout(() => {
      commitTimer.current = null
      onSeek(ms)
      setKeyPending(null)
    }, SEEK_COMMIT_DEBOUNCE_MS)
  }

  const step = (dir: -1 | 1, multiplier: number) => {
    onInteract()
    const base = keyPending ?? positionMs
    const next = clamp(base + (dir < 0 ? -skipBackMs : skipForwardMs) * multiplier)
    setKeyPending(next)
    scheduleCommit(next)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (disabled) return
    const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
    if (!dir) return
    e.preventDefault()
    if (!focused) {
      setFocused(true)
      onFocusChange?.(true)
    }
    const m = hold.current.keyDown(dir, e.repeat, performance.now(), durationMs)
    if (m != null) step(dir, m)
  }
  const onKeyUp = (e: KeyboardEvent) => {
    if (disabled) return
    const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
    if (!dir) return
    e.preventDefault()
    const m = hold.current.keyUp(dir)
    if (m != null) step(dir, m)
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    onInteract(Infinity)
    setDragMs(msAt(e.clientX))
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragMs != null) {
      setDragMs(msAt(e.clientX))
    } else if (e.pointerType === 'mouse') {
      setHoverMs(msAt(e.clientX))
    }
  }
  const endDrag = (e: PointerEvent<HTMLDivElement>, commit: boolean) => {
    if (dragMs == null) return
    const ms = msAt(e.clientX)
    setDragMs(null)
    if (e.pointerType !== 'mouse') setHoverMs(null)
    onInteract()
    if (commit) onSeek(ms)
  }
  const onWheel = (e: WheelEvent) => {
    if (disabled || Math.abs(e.deltaY) < 1) return
    onInteract()
    onSeek(clamp(positionMs + (e.deltaY > 0 ? -skipBackMs : skipForwardMs)))
  }

  return (
    <div
      ref={root}
      className={clsx(styles.root, dragMs != null && styles.active)}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={t('web_playback_seek')}
      aria-valuemin={Math.round(startMs / 1000)}
      aria-valuemax={Math.round(durationMs / 1000)}
      aria-valuenow={Math.round(shown / 1000)}
      aria-valuetext={formatDuration(t, Math.floor(shown / 1000) * 1000)}
      aria-disabled={disabled || undefined}
      data-focusable
      data-seekbar
      onFocus={(e) => {
        if (e.target !== e.currentTarget) return
        hold.current.reset()
        // keyboard focus only: a click focuses too, but must not pin the preview open
        const keyboard = e.currentTarget.matches(':focus-visible')
        setFocused(keyboard)
        onFocusChange?.(keyboard)
      }}
      onBlur={(e) => {
        if (e.target !== e.currentTarget) return
        setFocused(false)
        onFocusChange?.(false)
      }}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endDrag(e, true)}
      onPointerCancel={(e) => endDrag(e, false)}
      onPointerLeave={() => setHoverMs(null)}
      onWheel={onWheel}
    >
      {previewMs != null &&
        (previewHost ? (
          createPortal(
            <div ref={previewRef} className={styles.previewHosted}>
              <TrickplayPreview positionMs={previewMs} />
            </div>,
            previewHost,
          )
        ) : (
          <div ref={previewRef} className={styles.preview}>
            <TrickplayPreview positionMs={previewMs} />
          </div>
        ))}
      <div ref={track} className={styles.track}>
        <div className={styles.buffered} style={{ '--p': pct(Math.max(bufferedMs, startMs)) } as CSSProperties} />
        <div className={styles.progress} style={{ '--p': pct(shown) } as CSSProperties} />
        <div className={styles.knob} style={{ left: `${pct(shown) * 100}%` }} />
      </div>
    </div>
  )
}
