import { MaterialIcon } from '../../../ui'
import styles from './MusicQueueMarker.module.css'

/**
 * `MusicQueueMarker` (W/ui/detail/music/SongListDisplay.kt): a play arrow on the song that is playing, an 8dp dot
 * on a song that is in the queue. Used by the song rows and by the playlist page's audio rows.
 */
export function MusicQueueMarker({ isPlaying, isQueued }: { isPlaying?: boolean; isQueued?: boolean }) {
  if (isPlaying) {
    return (
      <span className={styles.playing} data-queue-marker="playing">
        <MaterialIcon name="play_arrow" />
      </span>
    )
  }
  if (isQueued) return <span className={styles.dot} aria-hidden data-queue-marker="queued" />
  return null
}
