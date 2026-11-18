import styles from './RecordingMarker.module.css'

type Props = { isRecording: boolean; isSeriesRecording: boolean }

/**
 * `RecordingMarker` (W/ui/detail/livetv/RecordingMarker.kt): one red 16dp dot for a recording; for a series
 * recording two overlapping dots (the second offset 6dp at 50% alpha), red when this airing records, else gray.
 */
export function RecordingMarker({ isRecording, isSeriesRecording }: Props) {
  if (isSeriesRecording) {
    return (
      <span className={styles.marker} data-series data-active={isRecording || undefined} aria-hidden>
        <span className={styles.dot} />
        <span className={styles.dot2} />
      </span>
    )
  }
  if (!isRecording) return null
  return (
    <span className={styles.marker} data-active aria-hidden>
      <span className={styles.dot} />
    </span>
  )
}
