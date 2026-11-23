import { PgsRenderer } from 'libpgs'
// the worker is a self-contained classic script: Vite hands out its address (same origin, so worker-src 'self')
import workerUrl from 'libpgs/dist/libpgs.worker.js?url'
import { useEffect, useRef } from 'react'
import { usePrefs } from '../../../stores/preferences'
import { observeResize } from '../../../ui'
import { getPlaybackEngine, usePlaybackStore } from './engine'
import styles from './SubtitleLayer.module.css'
import { isHdrVideo, RAISED_SHIFT } from './subtitles/style'

export interface PgsSubtitlesProps {
  /** the PGS stream (.sup) of the selected track */
  data: ArrayBuffer
  /** subtitle delay in ms (positive = later) */
  delayMs: number
  /** controls are visible: the picture keeps its size and steps up by the height of the control strip (style.ts RAISED_SHIFT) */
  raised: boolean
  /** keep the renderer alive but draw nothing (seek indicator) */
  hidden: boolean
}

/**
 * PGS (Blu-ray image) subtitles drawn on a canvas over the video by libpgs, the renderer of Jellyfin's own web
 * client. The server only extracts the track; nothing is burned into the video. Loaded lazily by SubtitleLayer.
 *
 * libpgs can follow a <video> by itself, but only on `timeupdate` (about four times a second). The renderer here
 * gets the time of every animation frame instead, which also covers seeks, speed changes and the delay setting;
 * it redraws only when the time crosses into another display set.
 */
export function PgsSubtitles({ data, delayMs, raised, hidden }: PgsSubtitlesProps) {
  const holder = useRef<HTMLDivElement>(null)
  // "Image subtitle opacity" (PlaybackPage.kt:516-517, 594-599: the alpha of the subtitle view for image cues), from
  // the style set the video uses: the HDR copy when "different for HDR" is on and the video is HDR
  const hdr = usePlaybackStore((s) => isHdrVideo(s.item?.MediaSources?.find((m) => m.Id === s.source?.Id)?.MediaStreams ?? s.source?.MediaStreams))
  const opacity = usePrefs((p) => (p.subSeparateHdr && hdr ? p.hdrSubImageOpacity : p.subImageOpacity)) / 100
  const delay = useRef(delayMs)
  useEffect(() => {
    delay.current = delayMs
  }, [delayMs])

  useEffect(() => {
    const el = holder.current
    if (!el) return
    const video = getPlaybackEngine().video
    // the canvas is handed to the worker (transferControlToOffscreen works once), so each renderer gets its own
    const canvas = document.createElement('canvas')
    canvas.className = styles.pgsCanvas
    el.appendChild(canvas)

    // The canvas takes the layout box of the <video> element (both are children of the player surface) and its
    // object-fit, so a PGS frame (usually the full 1920x1080 disc frame) is scaled like the picture under it in
    // every "video scale" mode. Layout sizes, not screen rectangles: the surface may be scaled (Next Up).
    const fit = () => {
      Object.assign(canvas.style, {
        left: `${video.offsetLeft}px`,
        top: `${video.offsetTop}px`,
        width: `${video.offsetWidth}px`,
        height: `${video.offsetHeight}px`,
        transform: video.style.transform,
        objectFit: video.style.objectFit || 'contain',
      })
    }
    fit()
    const stopBox = observeResize(el, fit)
    const stopVideo = observeResize(video, fit)
    const styleWatch = new MutationObserver(fit)
    styleWatch.observe(video, { attributes: true, attributeFilter: ['style'] })

    let renderer: PgsRenderer | null = null
    let raf = 0
    try {
      renderer = new PgsRenderer({ canvas, workerUrl })
      // a stream libpgs cannot read simply shows nothing
      // libpgs skips a redraw while the cue index is unchanged: after loading, step off the timeline once so a paused
      // video inside a cue still gets its picture (seen missing in Firefox)
      void renderer
        .loadFromBuffer(data)
        .then(() => renderer?.renderAtTimestamp(-1))
        .catch(() => undefined)
      const tick = () => {
        renderer?.renderAtTimestamp(video.currentTime - delay.current / 1000)
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    } catch {
      // no Worker / canvas in this browser: no PGS rendering
    }
    return () => {
      cancelAnimationFrame(raf)
      stopBox()
      stopVideo()
      styleWatch.disconnect()
      renderer?.dispose()
      canvas.remove()
    }
  }, [data])

  return (
    <div
      ref={holder}
      className={`${styles.layer} ${styles.pgs}`}
      style={{ transform: raised ? RAISED_SHIFT : undefined, visibility: hidden ? 'hidden' : undefined, opacity: opacity < 1 ? opacity : undefined }}
      data-subtitle-renderer="pgs"
    />
  )
}
