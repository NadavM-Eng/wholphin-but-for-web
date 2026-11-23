import JASSUB from 'jassub'
import { useEffect, useRef } from 'react'
import { getPlaybackEngine } from './engine'
import styles from './SubtitleLayer.module.css'
import { assWithLineDirections } from './subtitles/assDirection'

/** ASS/SSA subtitles through JASSUB (libass in a worker). Loaded lazily by SubtitleLayer. */
export function AssSubtitles({ content, fonts, delayMs }: { content: string; fonts: Uint8Array[]; delayMs: number }) {
  const holder = useRef<HTMLDivElement>(null)
  const instance = useRef<JASSUB | null>(null)

  useEffect(() => {
    const el = holder.current
    if (!el) return
    // transferControlToOffscreen works once per canvas, so each renderer gets a fresh one
    const canvas = document.createElement('canvas')
    canvas.className = styles.assCanvas
    el.appendChild(canvas)
    let inst: JASSUB | null = null
    try {
      // libass draws every line left to right unless the script asks otherwise: state each line's direction first
      inst = new JASSUB({ video: getPlaybackEngine().video, canvas, subContent: assWithLineDirections(content), fonts, timeOffset: 0 })
      instance.current = inst
    } catch {
      // Worker/OffscreenCanvas unavailable: no ASS rendering
    }
    return () => {
      instance.current = null
      void inst?.destroy().catch(() => undefined)
      canvas.remove()
    }
  }, [content, fonts])

  useEffect(() => {
    // libass draws at mediaTime + timeOffset; a positive delay shows subtitles later
    const inst = instance.current
    if (!inst) return
    inst.timeOffset = -delayMs / 1000
    // JASSUB redraws only from requestVideoFrameCallback, which does not fire while paused
    const video = getPlaybackEngine().video
    if (video.paused && video.videoWidth > 0) {
      void inst
        .manualRender({ mediaTime: video.currentTime, width: video.videoWidth, height: video.videoHeight, expectedDisplayTime: performance.now() }, true)
        .catch(() => undefined)
    }
  }, [delayMs])

  return <div ref={holder} className={styles.layer} data-subtitle-renderer="ass" />
}
