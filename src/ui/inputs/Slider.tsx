import clsx from 'clsx'
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { dp } from '../../theme/scale'
import { TOUCH_SLOP_DP, pansByDragging, touchIntent } from '../lib/touchIntent'
import styles from './Slider.module.css'

export type SliderProps = {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  /**
   * For a value whose application re-lays out the page the slider is on (the slider would move and resize under
   * the pointer). Given, a pointer gesture does not call `onChange` on the way: the slider shows the value under
   * the pointer by itself and reports it here, and `onChange` is called once, at the release, when the value is
   * another one. `null` ends the gesture (released or cancelled; a cancelled one applies nothing). Keys still call
   * `onChange` per step.
   */
  onDragValue?: (value: number | null) => void
  /** Upstream `interval` (step per key press). */
  step?: number
  /** Left at min jumps to max and vice versa (upstream `enableWrapAround`). */
  wrapAround?: boolean
  label: string
  /** Text for screen readers, e.g. "1.5x". */
  valueText?: string
  disabled?: boolean
  className?: string
}

/**
 * Upstream `SliderBar` (`ui/components/SliderBar.kt`): a 6dp round track that grows to 12dp when
 * focused, white thumb circle, fill and track colors per theme (see the CSS). Keyboard: left/right by
 * `step` (mirrored in RTL), Home/End; mouse: press or drag.
 *
 * Touch and pen (web only): sliders sit in pages that scroll, so a finger that lands on one changes nothing. Up
 * or down is the page's scroll (`touch-action: pan-y` in the CSS). Only a sideways drag past the slop takes the
 * slider, and the thumb then follows the finger (absolute, like the mouse and the browsers' own range input: a
 * relative drag cannot reach the far end from a finger that started beside the thumb). A tap sets the value on
 * release. A gesture the browser takes back (pointercancel) restores the value the slider had.
 *
 * With `onDragValue` (web only) a drag, by mouse, finger or pen, is shown by the slider alone and applied once,
 * when the pointer is released.
 */
export function Slider({ value, min, max, onChange, onDragValue, step = 1, wrapAround, label, valueText, disabled, className }: SliderProps) {
  const rail = useRef<HTMLDivElement>(null)
  // the value under the pointer of a drag that applies at its release (`onDragValue`); null outside such a drag.
  // The ref is what the handlers read: moves can come faster than renders.
  const [pending, setPending] = useState<number | null>(null)
  const pendingRef = useRef<number | null>(null)
  const range = max - min || 1
  const pct = Math.min(1, Math.max(0, ((pending ?? value) - min) / range))

  const valueAt = (clientX: number): number | undefined => {
    const r = rail.current?.getBoundingClientRect()
    if (!r || r.width === 0) return undefined
    const rtl = getComputedStyle(rail.current!).direction === 'rtl'
    let f = (clientX - r.left) / r.width
    if (rtl) f = 1 - f
    f = Math.min(1, Math.max(0, f))
    const raw = min + f * range
    const snapped = Math.round((raw - min) / step) * step + min
    return Math.min(max, Math.max(min, snapped))
  }

  const fromPointer = (clientX: number) => {
    const next = valueAt(clientX)
    if (next !== undefined && next !== value) onChange(next)
  }

  /** One step of a drag: applied at once, or kept as the pending value when the slider applies at the release. */
  const drag = (clientX: number) => {
    if (!onDragValue) return fromPointer(clientX)
    const next = valueAt(clientX)
    if (next === undefined || next === pendingRef.current) return
    pendingRef.current = next
    setPending(next)
    onDragValue(next)
  }

  /** The end of a drag that applies at its release; nothing to do after any other one. */
  const endDrag = (apply: boolean) => {
    const next = pendingRef.current
    if (next === null) return
    pendingRef.current = null
    setPending(null)
    onDragValue?.(null)
    if (apply && next !== value) onChange(next)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    let next: number | null = null
    const dec = () => (wrapAround && value <= min ? max : Math.max(min, value - step))
    const inc = () => (wrapAround && value >= max ? min : Math.min(max, value + step))
    switch (e.key) {
      case 'ArrowLeft':
        next = rtl ? inc() : dec()
        break
      case 'ArrowRight':
        next = rtl ? dec() : inc()
        break
      case 'Home':
        next = min
        break
      case 'End':
        next = max
        break
      default:
        return
    }
    // Consume the key so the global arrow-key navigator does not also move focus.
    e.preventDefault()
    e.stopPropagation()
    if (next !== value) onChange(next)
  }

  const touch = useRef<{ id: number; x: number; y: number; from: number; phase: 'undecided' | 'dragging' | 'scrolling' } | null>(null)

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return
    if (pansByDragging(e.pointerType)) {
      if (e.isPrimary) touch.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: value, phase: 'undecided' }
      return
    }
    touch.current = null
    e.currentTarget.setPointerCapture(e.pointerId)
    drag(e.clientX)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = touch.current
    if (g?.id === e.pointerId) {
      if (g.phase === 'undecided') {
        const intent = touchIntent(e.clientX - g.x, e.clientY - g.y, dp(TOUCH_SLOP_DP))
        if (intent === 'undecided') return
        g.phase = intent === 'side' ? 'dragging' : 'scrolling'
        // keeps the drag when the finger leaves the slider
        if (g.phase === 'dragging') e.currentTarget.setPointerCapture(e.pointerId)
      }
      if (g.phase === 'dragging') drag(e.clientX)
      return
    }
    // the mouse drag. A finger this gesture does not track (a second one, which the browser captures by itself) moves nothing.
    if (!pansByDragging(e.pointerType) && e.currentTarget.hasPointerCapture(e.pointerId)) drag(e.clientX)
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const g = touch.current
    if (g?.id !== e.pointerId) {
      if (!pansByDragging(e.pointerType)) endDrag(true)
      return
    }
    touch.current = null
    // a tap: down and up without leaving the slop
    if (g.phase === 'undecided') fromPointer(e.clientX)
    else if (g.phase === 'dragging') endDrag(true)
  }
  const onPointerCancel = (e: PointerEvent<HTMLDivElement>) => {
    const g = touch.current
    if (g?.id !== e.pointerId) {
      if (!pansByDragging(e.pointerType)) endDrag(false)
      return
    }
    touch.current = null
    if (g.phase !== 'dragging') return
    // the browser took the gesture (it pans the page after all): nothing may have changed
    if (onDragValue) endDrag(false)
    else if (value !== g.from) onChange(g.from)
  }
  // A capture that ends with neither a release nor a cancel must not leave a pending value on show (after a
  // release this finds nothing: the release has ended the drag).
  const onLostPointerCapture = () => endDrag(false)

  return (
    <div
      role="slider"
      tabIndex={0}
      data-focusable
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={pending ?? value}
      aria-valuetext={valueText}
      aria-disabled={disabled || undefined}
      className={clsx(styles.slider, className)}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onLostPointerCapture}
    >
      <div ref={rail} className={styles.rail}>
        <span className={styles.inactive} />
        <span className={styles.active} style={{ inlineSize: `calc(${pct * 100}% + var(--h))` }} />
        <span className={styles.thumb} style={{ insetInlineStart: `${pct * 100}%` }} />
      </div>
    </div>
  )
}
