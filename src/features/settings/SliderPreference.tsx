import { useLayoutEffect, useRef, useState } from 'react'
import { Slider } from '../../ui'
import styles from './Preference.module.css'

export type SliderPreferenceProps = {
  id: string
  title: string
  summary: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  /**
   * For a preference whose value re-lays out the page when it is applied (prefModel `relaysOutPage`): the summary
   * of a value that is not applied yet. Given, a pointer drag only moves the thumb and this summary, the value is
   * applied once when the pointer is released, and the slider then stays where it was on the screen.
   */
  dragSummary?: (value: number) => string
}

/** The nearest ancestor that scrolls up and down (the settings list). */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(p).overflowY)) return p
  }
  return null
}

/**
 * `SliderPreference` (SliderPreference.kt): title, then SliderBar + right-aligned summary; the row turns
 * inverseSurface while focused. Every step commits immediately, as upstream; the value does not wrap at min/max.
 * Web only, with `dragSummary`: a pointer drag commits at its release (keys still commit per step).
 */
export function SliderPreference({ id, title, summary, value, min, max, step, onChange, dragSummary }: SliderPreferenceProps) {
  const row = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const [dragged, setDragged] = useState<number | null>(null)
  // where the bar was on the screen when a value that re-lays out the page was applied, and the value it had
  const applied = useRef<{ y: number; from: number } | null>(null)
  const shown = dragged !== null && dragSummary ? dragSummary(dragged) : summary
  const middle = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    return r.top + r.height / 2
  }

  const apply = (next: number) => {
    if (dragSummary && bar.current) applied.current = { y: middle(bar.current), from: value }
    onChange(next)
  }

  // After the page is laid out with the new value: the bar is back at the height it was, as far as the list can
  // scroll (the finger, the mouse or the keyboard user's eye is on it), and the row is in view in any case. Focus
  // is untouched: the slider element stays.
  useLayoutEffect(() => {
    const was = applied.current
    applied.current = null
    if (!was || !bar.current || !row.current || was.from === value) return
    const list = scrollParent(row.current)
    if (list) list.scrollTop += middle(bar.current) - was.y
    row.current.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })

  return (
    <div ref={row} className={styles.slider} data-pref-id={id}>
      <span className={styles.sliderTitle}>{title}</span>
      <div ref={bar} className={styles.sliderRow}>
        <Slider
          className={styles.sliderBar}
          value={value}
          min={min}
          max={max}
          step={step}
          label={title}
          valueText={shown}
          onChange={apply}
          onDragValue={dragSummary ? setDragged : undefined}
        />
        {/* direction from the content: "100 Mbps" reads left to right in a right-to-left interface, a translated
            summary right to left */}
        <span className={styles.sliderSummary} aria-hidden>
          <bdi>{shown}</bdi>
        </span>
      </div>
    </div>
  )
}
