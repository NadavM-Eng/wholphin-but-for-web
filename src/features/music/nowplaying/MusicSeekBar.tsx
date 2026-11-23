import clsx from 'clsx'
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useTranslate } from '../../common/useTranslate'
import { formatClock } from '../../../lib/format'
import { keepPressToControl } from '../../../ui/lib/touchIntent'
import styles from './MusicSeekBar.module.css'

export type MusicSeekBarProps = {
  positionMs: number
  durationMs: number
  bufferedMs: number
  onSeek: (ms: number) => void
  onInteract: () => void
  stepBackMs: number
  stepForwardMs: number
}

/**
 * The Now Playing seek bar (SeekBar with `isEnabled = false` upstream: display only). On the web the bar also
 * seeks with a click, a drag or the arrow keys (-10 s / +30 s), since a pointer has no other way to seek.
 * Same look as the video player's bar: 6dp track (12dp focused), buffered @65%, progress in the border colour.
 */
export function MusicSeekBar({ positionMs, durationMs, bufferedMs, onSeek, onInteract, stepBackMs, stepForwardMs }: MusicSeekBarProps) {
  const { t } = useTranslate()
  const root = useRef<HTMLDivElement>(null)
  const [dragMs, setDragMs] = useState<number | null>(null)
  // the press and the drag are the bar's: no text selection, no drag-and-drop of a selection that covers it
  useEffect(() => keepPressToControl(root.current!), [])
  const span = Math.max(1, durationMs)
  const shown = dragMs ?? positionMs
  const pct = (ms: number) => `${Math.min(100, Math.max(0, (ms / span) * 100))}%`
  const msAt = (clientX: number) => {
    const box = root.current?.getBoundingClientRect()
    if (!box || box.width <= 0) return 0
    return Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * durationMs
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    const back = rtl ? 'ArrowRight' : 'ArrowLeft'
    const fwd = rtl ? 'ArrowLeft' : 'ArrowRight'
    if (e.key === back || e.key === fwd) {
      e.preventDefault()
      e.stopPropagation()
      onInteract()
      onSeek(Math.min(durationMs, Math.max(0, positionMs + (e.key === back ? -stepBackMs : stepForwardMs))))
    }
  }
  return (
    <div className={styles.wrap}>
      <div
        ref={root}
        className={clsx(styles.root, dragMs != null && styles.active)}
        role="slider"
        tabIndex={0}
        data-focusable
        aria-label={t('web_playback_seek')}
        aria-valuemin={0}
        aria-valuemax={Math.round(durationMs / 1000)}
        aria-valuenow={Math.round(shown / 1000)}
        aria-valuetext={formatClock(shown)}
        onKeyDown={onKeyDown}
        onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
          if (durationMs <= 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragMs(msAt(e.clientX))
          onInteract()
        }}
        onPointerMove={(e) => {
          if (dragMs != null) setDragMs(msAt(e.clientX))
        }}
        onPointerUp={(e) => {
          if (dragMs == null) return
          onSeek(msAt(e.clientX))
          setDragMs(null)
        }}
        onPointerCancel={() => setDragMs(null)}
      >
        <div className={styles.track}>
          <div className={styles.buffered} style={{ width: pct(bufferedMs) }} />
          <div className={styles.progress} style={{ width: pct(shown) }} />
          <div className={styles.knob} style={{ left: pct(shown) }} />
        </div>
      </div>
      <div className={styles.times}>
        <span>{formatClock(shown)}</span>
        <span>{durationMs > 0 ? formatClock(durationMs) : ''}</span>
      </div>
    </div>
  )
}
