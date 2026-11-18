import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { cssTransform, dragBy, isZoomed, zoomAt, CROSSFADE_MS, type Screen, type Transform } from './slideshowModel'
import styles from './SlideshowPage.module.css'

export type StageMedia =
  | { kind: 'photo'; key: string; src: string; originalSrc: string | null; matrix: number[] | null }
  | { kind: 'video'; key: string; src: string; loop: boolean }

export type SlideshowStageProps = {
  media: StageMedia | null
  /** Per-image load failure ("Error loading image"). */
  failed: boolean
  transform: Transform
  /** False while a gesture is moving the image (no transition). */
  animate: boolean
  screen: Screen
  videoRef: RefObject<HTMLVideoElement | null>
  onTransform: (t: Transform, animate: boolean) => void
  onTap: () => void
  onSwipe: (dir: 1 | -1) => void
  onLoadStart: () => void
  onLoaded: () => void
  onError: (message: string) => void
  onVideoEnded: () => void
  onVideoPlayingChange: (playing: boolean) => void
}

type Layer = { key: string; src: string; matrix: number[] | null }

const DOUBLE_TAP_MS = 280
const TAP_SLOP = 10
const SWIPE_MIN = 60

/**
 * The image area of SlideshowPage.kt: black, the photo fitted (ContentScale.Fit) with a 750 ms cross-fade from
 * the previous photo, zoom / pan / rotation transforms and the colour filter; or the clip in a <video>. Web
 * gestures: wheel and pinch zoom at the pointer, drag to pan while zoomed, swipe left / right on touch, tap or
 * click for the controls, double-tap / double-click to zoom 2x or back.
 */
export function SlideshowStage(p: SlideshowStageProps) {
  const { t } = useTranslation()
  const filterId = `ww-photo-filter-${useId().replace(/:/g, '')}`
  const stage = useRef<HTMLDivElement>(null)
  const isVideo = p.media?.kind === 'video'
  const { videoRef } = p
  const latest = useRef(p)
  useLayoutEffect(() => {
    latest.current = p
  })

  // ---- cross-fade: the last shown photo stays under the new one until it has loaded
  const [shown, setShown] = useState<Layer | null>(null)
  const [incoming, setIncoming] = useState<{ layer: Layer; loaded: boolean } | null>(null)
  const photo = p.media?.kind === 'photo' ? p.media : null
  const photoKey = photo ? `${photo.key}|${photo.src}` : null
  const [seenKey, setSeenKey] = useState<string | null>(null)
  if (photoKey !== seenKey) {
    setSeenKey(photoKey)
    if (photo) setIncoming({ layer: { key: photo.key, src: photo.src, matrix: photo.matrix }, loaded: false })
    else {
      setIncoming(null)
      if (!p.media) setShown(null)
    }
  }
  // the colour filter changes in place
  const matrix = photo?.matrix ?? null
  useEffect(() => {
    if (incoming?.loaded) {
      const id = setTimeout(() => {
        setShown(incoming.layer)
        setIncoming(null)
      }, CROSSFADE_MS)
      return () => clearTimeout(id)
    }
  }, [incoming])


  // a new photo url starts loading. A layout effect: a prefetched photo comes from the memory cache and its load
  // event can run before passive effects, so a passive park() would cancel the pulse that load just armed.
  useLayoutEffect(() => {
    if (photoKey) latest.current.onLoadStart()
  }, [photoKey])

  // ---- original-size layer while zoomed beyond the resized copy
  const [originalLoaded, setOriginalLoaded] = useState<string | null>(null)
  const originalSrc = photo?.originalSrc ?? null

  // ---- gestures
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const pointers = new Map<number, { x: number; y: number }>()
    let start: { x: number; y: number; time: number; moved: boolean; t: Transform } | null = null
    let pinch: { dist: number; zoom: number; t: Transform } | null = null
    let lastTap = 0
    let tapTimer: ReturnType<typeof setTimeout> | null = null
    const center = (x: number, y: number) => {
      const r = el.getBoundingClientRect()
      return { x: x - r.left - r.width / 2, y: y - r.top - r.height / 2 }
    }
    const video = () => latest.current.media?.kind === 'video'

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return
      // a press that dismissed a panel (ImageFilterDialog) is not a tap
      if (e.defaultPrevented) return
      if ((e.target as Element).closest('button, a, [role="slider"], [data-slideshow-overlay], [data-slideshow-filter]')) return
      el.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 1) {
        start = { x: e.clientX, y: e.clientY, time: performance.now(), moved: false, t: latest.current.transform }
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: latest.current.transform.zoom, t: latest.current.transform }
        if (start) start.moved = true
      }
    }
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId)
      if (!prev) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const cur = latest.current
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        const mid = center((a.x + b.x) / 2, (a.y + b.y) / 2)
        cur.onTransform(zoomAt(cur.transform, pinch.zoom * (dist / Math.max(1, pinch.dist)), mid.x, mid.y, cur.screen, video()), false)
        return
      }
      if (!start) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (!start.moved && Math.hypot(dx, dy) > TAP_SLOP) start.moved = true
      if (start.moved && isZoomed(cur.transform.zoom)) {
        cur.onTransform(dragBy(cur.transform, e.clientX - prev.x, e.clientY - prev.y, cur.screen, video()), false)
      }
    }
    const onUp = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      pointers.delete(e.pointerId)
      const cur = latest.current
      if (pointers.size < 2 && pinch) {
        pinch = null
        start = null
        cur.onTransform(cur.transform, true)
        return
      }
      if (pointers.size > 0 || !start) return
      const s = start
      start = null
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y
      if (s.moved) {
        if (!isZoomed(cur.transform.zoom) && e.pointerType !== 'mouse' && Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) {
          const rtl = getComputedStyle(el).direction === 'rtl'
          cur.onSwipe((dx < 0) !== rtl ? 1 : -1)
        } else {
          cur.onTransform(cur.transform, true)
        }
        return
      }
      // tap / click; a second one soon after is a double-tap
      const now = performance.now()
      if (now - lastTap < DOUBLE_TAP_MS) {
        lastTap = 0
        if (tapTimer) clearTimeout(tapTimer)
        tapTimer = null
        const pt = center(e.clientX, e.clientY)
        const tr = cur.transform
        cur.onTransform(isZoomed(tr.zoom) ? { ...tr, zoom: 1, panX: 0, panY: 0 } : zoomAt(tr, 2, pt.x, pt.y, cur.screen, video()), true)
        return
      }
      lastTap = now
      tapTimer = setTimeout(() => {
        tapTimer = null
        latest.current.onTap()
      }, DOUBLE_TAP_MS)
    }
    const onCancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size === 0) {
        start = null
        pinch = null
      }
    }
    const onWheel = (e: WheelEvent) => {
      if ((e.target as Element).closest('[data-slideshow-overlay], [data-slideshow-filter]')) return
      e.preventDefault()
      const cur = latest.current
      const pt = center(e.clientX, e.clientY)
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      cur.onTransform(zoomAt(cur.transform, cur.transform.zoom * Math.exp(-delta * 0.0015), pt.x, pt.y, cur.screen, video()), false)
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      if (tapTimer) clearTimeout(tapTimer)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
      el.removeEventListener('wheel', onWheel)
    }
  }, [])

  // rotated by an odd multiple of 90: swap the box so the photo still fits the screen
  const quarter = Math.round(p.transform.rotation / 90)
  const swapped = Math.abs(quarter) % 2 === 1
  const box = swapped ? { width: p.screen.height, height: p.screen.width } : { width: p.screen.width, height: p.screen.height }
  const transition = p.animate ? styles.animated : undefined
  const filterStyle = !isVideo && matrix ? { filter: `url(#${filterId})` } : undefined

  return (
    <div ref={stage} className={styles.stage} data-slideshow-stage>
      {matrix && (
        <svg className={styles.svgDefs} aria-hidden>
          <filter id={filterId} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={matrix.join(' ')} />
          </filter>
        </svg>
      )}
      <div className={`${styles.transform} ${transition ?? ''}`} style={{ transform: cssTransform(p.transform, isVideo) }}>
        <div
          className={`${styles.rotate} ${transition ?? ''}`}
          style={{ width: box.width, height: box.height, transform: `translate(-50%, -50%) rotate(${p.transform.rotation}deg)` }}
        >
          {p.media?.kind === 'video' ? (
            <video
              key={p.media.key}
              ref={videoRef}
              className={styles.media}
              src={p.media.src}
              loop={p.media.loop}
              autoPlay
              playsInline
              onLoadStart={p.onLoadStart}
              onLoadedData={p.onLoaded}
              onEnded={p.onVideoEnded}
              onPlay={() => p.onVideoPlayingChange(true)}
              onPause={() => p.onVideoPlayingChange(false)}
              onError={(e) => p.onError(e.currentTarget.error?.message || 'MediaError')}
            />
          ) : (
            <>
              {shown && (
                <img
                  key={`shown-${shown.key}`}
                  className={styles.media}
                  src={shown.src}
                  alt=""
                  draggable={false}
                  style={shown.key === photo?.key ? filterStyle : undefined}
                />
              )}
              {incoming && (
                <img
                  key={`in-${incoming.layer.key}-${incoming.layer.src}`}
                  className={`${styles.media} ${styles.fade}`}
                  src={incoming.layer.src}
                  alt={t('web_photos_viewer')}
                  draggable={false}
                  data-loaded={incoming.loaded ? '' : undefined}
                  style={filterStyle}
                  onLoad={() => {
                    setIncoming((cur) => (cur && cur.layer.src === incoming.layer.src ? { ...cur, loaded: true } : cur))
                    p.onLoaded()
                  }}
                  onError={() => p.onError(t('web_photos_error_loading_image'))}
                />
              )}
              {originalSrc && !incoming && (
                <img
                  key={`orig-${originalSrc}`}
                  className={styles.media}
                  src={originalSrc}
                  alt=""
                  draggable={false}
                  style={{ ...filterStyle, opacity: originalLoaded === originalSrc ? 1 : 0 }}
                  onLoad={() => setOriginalLoaded(originalSrc)}
                />
              )}
            </>
          )}
        </div>
      </div>
      {p.failed && <p className={styles.error}>{t('web_photos_error_loading_image')}</p>}
    </div>
  )
}
