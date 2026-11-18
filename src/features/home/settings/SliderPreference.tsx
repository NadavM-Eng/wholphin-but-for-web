import { Slider } from '../../../ui'
import styles from './HomeSettings.module.css'

export type SliderPreferenceProps = {
  title: string
  value: number
  min: number
  max: number
  step: number
  /** Summary shown after the slider (upstream: the value, or a summarizer's text). */
  summary: string
  onChange: (value: number) => void
}

/** Upstream `SliderPreference` (ui/preferences/SliderPreference.kt): title, then SliderBar + summary in a row. */
export function SliderPreference({ title, value, min, max, step, summary, onChange }: SliderPreferenceProps) {
  return (
    <div className={styles.sliderPref}>
      <span className={styles.sliderTitle}>{title}</span>
      <div className={styles.sliderRow}>
        <Slider value={value} min={min} max={max} step={step} onChange={onChange} label={title} valueText={summary} />
        <span className={styles.sliderValue} aria-hidden>
          {summary}
        </span>
      </div>
    </div>
  )
}
