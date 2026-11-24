import JASSUB from 'jassub'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { getPlaybackEngine } from './engine'
import styles from './SubtitleLayer.module.css'
import { assWithLineDirections } from './subtitles/assDirection'
import { RAISED_SHIFT } from './subtitles/style'

/**
 * ASS/SSA subtitles through JASSUB (libass in a worker). Loaded lazily by SubtitleLayer.
 * `hidden` keeps the renderer and only stops showing its canvas (a seek is in flight): a new renderer would start a
 * worker, load libass and the fonts and parse the script again after every skip.
 */
export function AssSubtitles({ content, fonts, delayMs, lifted = false, hidden = false }: { content: string; fonts: Uint8Array[]; delayMs: number; lifted?: boolean; hidden?: boolean }) {
  const holder = useRef<HTMLDivElement>(null)
  const instance = useRef<JASSUB | null>(null)
  // a paused video draws once per seek: until that draw is done the canvas still holds the old line
  const [drawing, setDrawing] = useState(false)

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

  // a paused video gets no frame callbacks: draw the new position once a seek has landed
  useEffect(() => {
    const video = getPlaybackEngine().video
    const onSeeked = () => {
      const inst = instance.current
      if (!inst || !video.paused || video.videoWidth === 0) return
      flushSync(() => setDrawing(true))
      void inst.manualRender({ mediaTime: video.currentTime, width: video.videoWidth, height: video.videoHeight, expectedDisplayTime: performance.now() }, true).catch(() => undefined).finally(() => setDrawing(false))
    }
    video.addEventListener('seeked', onSeeked)
    return () => video.removeEventListener('seeked', onSeeked)
  }, [])

  return <div ref={holder} className={styles.layer} style={{ visibility: hidden || drawing ? 'hidden' : undefined, transform: lifted ? RAISED_SHIFT : undefined }} data-subtitle-renderer="ass" />
}
