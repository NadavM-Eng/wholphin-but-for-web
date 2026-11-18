import { useEffect, useRef, useState } from 'react'
import { DrawableIcon } from '../../../ui'
import { usePlaybackStore } from '../engine'
import styles from './PauseIndicator.module.css'

/**
 * `PauseIndicator` (overlay/PauseIndicator.kt): when playback pauses, a 64dp pause icon scales in over 300 ms and
 * fades out 350 ms later. Only rendered while the controls are hidden.
 */
export function PauseIndicator() {
  const paused = usePlaybackStore((s) => s.paused && (s.status === 'paused' || s.status === 'buffering'))
  const [visible, setVisible] = useState(false)
  const was = useRef(paused)
  useEffect(() => {
    if (paused && !was.current) setVisible(true)
    was.current = paused
  }, [paused])
  useEffect(() => {
    if (!visible) return
    // shown 350 ms, then the 300 ms CSS fade-out runs before unmounting
    const id = setTimeout(() => setVisible(false), 650)
    return () => clearTimeout(id)
  }, [visible])
  if (!visible) return null
  return (
    <div className={styles.root} aria-hidden>
      <DrawableIcon name="pause" />
    </div>
  )
}
