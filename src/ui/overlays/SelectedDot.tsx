import styles from './SelectedDot.module.css'

/**
 * Upstream `SelectedLeadingContent`: an 8dp dot in the content color (4dp side padding), the "this one
 * is chosen" marker in dialog lists (used where a radio button would be; upstream has no checkbox/radio).
 */
export function SelectedDot({ selected }: { selected: boolean }) {
  return <span className={styles.slot}>{selected && <span className={styles.dot} />}</span>
}
