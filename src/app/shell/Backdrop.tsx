import clsx from 'clsx'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePrefs } from '../../stores/preferences'
import { COLOR_ANIM_MS, dynamicBackground, fastOutSlowIn, mixColors, type BackdropColors } from './backdropColors'
import styles from './Backdrop.module.css'
import { isResumedBackdrop, useBackdropPending, useBackdropResult, usePageBackdropStore } from './backdropService'

/** ApplicationContent.kt TOP_SCRIM_* (used in Backdrop.module.css). */
export const TOP_SCRIM_ALPHA = 0.55
export const TOP_SCRIM_END_FRACTION = 0.25

export type BackdropProps = {
  rtl: boolean
  enableTopScrim?: boolean
}

/**
 * W/ui/nav/Backdrop.kt: full-window layer behind the drawer pages. Optional colour wash (dynamic style),
 * then the backdrop image in the top-end 70% x 70% box, faded in over 800 ms, with the top scrim and the
 * start/bottom alpha masks.
 * Web (owner request): the image is not darkened while the drawer is open (upstream draws black at 75% over it).
 */
export function Backdrop({ rtl, enableTopScrim = true }: BackdropProps) {
  const published = useBackdropResult()
  const own = usePageBackdropStore((s) => s.result)
  const ownTopScrim = usePageBackdropStore((s) => s.topScrim)
  const ownKeepPrevious = usePageBackdropStore((s) => s.keepPrevious)
  const ownCrossfadeMs = usePageBackdropStore((s) => s.crossfadeMs)
  const result = own ?? published
  // a page-owned backdrop brings its own drawing options (NowPlayingPage.kt:173-180: no top scrim)
  const topScrim = own ? ownTopScrim : enableTopScrim
  const style = usePrefs('backdropStyle')
  const busy = useBackdropPending((s) => s.count > 0) && !own
  const dynamic = style !== 'BACKDROP_IMAGE_ONLY' && style !== 'BACKDROP_NONE'
  return (
    <div className={styles.root} aria-hidden="true" aria-busy={busy || undefined} data-shell-backdrop>
      {dynamic && result.colors && <ColorWash colors={result.colors} rtl={rtl} />}
      {style !== 'BACKDROP_NONE' && (
        <div className={clsx(styles.imageBox, rtl && styles.rtl)}>
          {own && ownKeepPrevious ? (
            <HeldImages src={result.imageUrl} fadeMs={ownCrossfadeMs} />
          ) : (
            result.imageUrl && <FadeImage key={result.imageUrl} src={result.imageUrl} />
          )}
          {topScrim && <div className={styles.scrim} />}
        </div>
      )}
    </div>
  )
}

/**
 * Coil crossfade (800 ms, linear) from nothing: the previous image was already blanked by the service.
 * Not for the image a page shows again when Settings closes over it: that one is there at once.
 */
function FadeImage({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(() => isResumedBackdrop(src))
  return (
    <img
      className={clsx(styles.image, loaded && styles.loaded)}
      src={src}
      alt=""
      crossOrigin="anonymous"
      decoding="async"
      draggable={false}
      onLoad={() => setLoaded(true)}
    />
  )
}

/**
 * useExistingImageAsPlaceholder + CrossFadeFactory(duration): the image shown last stays while the next one
 * loads, then the two cross-fade (Coil fades the old one out as the new one fades in). No URL: nothing.
 */
function HeldImages({ src, fadeMs }: { src: string | null; fadeMs: number }) {
  const [layers, setLayers] = useState<{ url: string; loaded: boolean }[]>([])
  const top = layers[layers.length - 1]
  if (src == null) {
    if (layers.length) setLayers([])
  } else if (top?.url !== src) {
    const again = layers.find((l) => l.url === src && l.loaded)
    setLayers(again ? [again] : [...layers.filter((l) => l.loaded).slice(-1), { url: src, loaded: false }])
  }
  const settled = !!top?.loaded && layers.length > 1
  useEffect(() => {
    if (!settled) return
    const id = window.setTimeout(() => setLayers((ls) => ls.slice(-1)), fadeMs)
    return () => window.clearTimeout(id)
  }, [settled, top?.url, fadeMs])
  return layers.map((l, i) => {
    const visible = i === layers.length - 1 ? l.loaded : !top.loaded
    return (
      <img
        key={l.url}
        className={styles.image}
        style={{ opacity: visible ? 1 : 0, transition: `opacity ${fadeMs}ms linear` }}
        src={l.url}
        alt=""
        crossOrigin="anonymous"
        decoding="async"
        draggable={false}
        onLoad={() => setLayers((ls) => ls.map((x) => (x.url === l.url ? { ...x, loaded: true } : x)))}
      />
    )
  })
}

/**
 * The radial colour wash. Colours animate with tween(1250) in Oklab like animateColorAsState; the first
 * colours after the layer appears are shown directly (Compose starts the animation at its first value).
 */
function ColorWash({ colors, rtl }: { colors: BackdropColors; rtl: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const shown = useRef<BackdropColors>(colors)
  const raf = useRef(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const from = shown.current
    const to = colors
    cancelAnimationFrame(raf.current)
    if (from === to || reducedMotion()) {
      shown.current = to
      el.style.background = dynamicBackground(to, rtl)
      return
    }
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / COLOR_ANIM_MS)
      const c = t >= 1 ? to : mixColors(from, to, fastOutSlowIn(t))
      shown.current = c
      el.style.background = dynamicBackground(c, rtl)
      if (t < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
  }, [colors, rtl])

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  return <div ref={ref} className={styles.wash} />
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
