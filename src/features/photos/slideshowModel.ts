// Pure parts of the slideshow viewer: zoom / pan / rotation (W/ui/slideshow/SlideshowPage.kt:160-214), the
// image colour filter (W/data/model/VideoFilter.kt) and the slideshow timing constants.

/** Zoom limits and steps (SlideshowPage.kt zoom(), ImageControlsOverlay.kt). */
export const MIN_ZOOM = 1
export const MAX_ZOOM = 5
/** Overlay Zoom in / Zoom out buttons. */
export const ZOOM_BUTTON_STEP = 0.15
/** Long-press Up / Down, per key repeat. */
export const ZOOM_REPEAT_STEP = 0.05
/** D-pad pan per press, dp. */
export const PAN_STEP_DP = 30
/** Pan is clamped to this fraction of the screen size. */
export const MAX_PAN_FRACTION = 0.75
/** Coil CrossFadeFactory(750ms). */
export const CROSSFADE_MS = 750

/** `isZoomed = zoomFactor * 100 > 102`. */
export const isZoomed = (zoom: number) => zoom * 100 > 102

export interface Transform {
  zoom: number
  /** pan in CSS px (Compose: px) */
  panX: number
  panY: number
  /** degrees, accumulates in 90 degree steps */
  rotation: number
}

export const IDENTITY: Transform = { zoom: 1, panX: 0, panY: 0, rotation: 0 }

export interface Screen {
  width: number
  height: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** `zoom(factor)`: zooming out shrinks the pan proportionally; at <= 1.02x the pan resets. */
export function applyZoom(t: Transform, factor: number): Transform {
  let { panX, panY } = t
  if (factor < 0 && t.zoom > 1) {
    const diff = factor / (t.zoom - 1)
    const dx = Math.abs(panX * diff)
    const dy = Math.abs(panY * diff)
    if (panX > 0) panX -= dx
    else if (panX < 0) panX += dx
    if (panY > 0) panY -= dy
    else if (panY < 0) panY += dy
  }
  const zoom = clamp(t.zoom + factor, MIN_ZOOM, MAX_ZOOM)
  if (!isZoomed(zoom)) return { ...t, zoom, panX: 0, panY: 0 }
  return { ...t, zoom, panX, panY }
}

/** `pan(x, y)`: adds px, clamped to +/-75% of the screen. */
export function applyPan(t: Transform, dx: number, dy: number, s: Screen): Transform {
  const mx = s.width * MAX_PAN_FRACTION
  const my = s.height * MAX_PAN_FRACTION
  return {
    ...t,
    panX: dx !== 0 ? clamp(t.panX + dx, -mx, mx) : t.panX,
    panY: dy !== 0 ? clamp(t.panY + dy, -my, my) : t.panY,
  }
}

/** `reset(resetRotate)`. */
export function resetTransform(t: Transform, resetRotate: boolean): Transform {
  return { zoom: 1, panX: 0, panY: 0, rotation: resetRotate ? 0 : t.rotation }
}

/**
 * Photos are scaled about `TransformOrigin((W - panX) / 2W, (H - panY) / 2H)` and then translated by the pan.
 * That equals a scale about the centre followed by a translation of `pan * (1 + zoom) / 2`. Videos use the
 * centre as origin, so their translation is the pan itself (SlideshowPage.kt:346-406).
 */
export function effectiveTranslation(t: Transform, isVideo: boolean): { x: number; y: number } {
  if (isVideo) return { x: t.panX, y: t.panY }
  const k = (1 + t.zoom) / 2
  return { x: t.panX * k, y: t.panY * k }
}

/** Inverse of effectiveTranslation for photos (pointer gestures work in screen translation). */
export function panForTranslation(tx: number, ty: number, zoom: number, isVideo: boolean): { panX: number; panY: number } {
  if (isVideo) return { panX: tx, panY: ty }
  const k = (1 + zoom) / 2
  return { panX: tx / k, panY: ty / k }
}

/**
 * Web: zoom by `factor` (multiplicative, wheel / pinch) keeping the screen point (px, py) (relative to the centre)
 * under the pointer. Same limits and pan clamp as the TV controls.
 */
export function zoomAt(t: Transform, nextZoom: number, px: number, py: number, s: Screen, isVideo: boolean): Transform {
  const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM)
  if (!isZoomed(zoom)) return { ...t, zoom, panX: 0, panY: 0 }
  const cur = effectiveTranslation(t, isVideo)
  // screen point = centre + zoom * local + translation  =>  keep `local` fixed
  const lx = (px - cur.x) / t.zoom
  const ly = (py - cur.y) / t.zoom
  const tx = px - zoom * lx
  const ty = py - zoom * ly
  const pan = panForTranslation(tx, ty, zoom, isVideo)
  return applyPan({ ...t, zoom, panX: 0, panY: 0 }, pan.panX, pan.panY, s)
}

/** Web: drag by (dx, dy) screen px while zoomed. */
export function dragBy(t: Transform, dx: number, dy: number, s: Screen, isVideo: boolean): Transform {
  const cur = effectiveTranslation(t, isVideo)
  const pan = panForTranslation(cur.x + dx, cur.y + dy, t.zoom, isVideo)
  return applyPan({ ...t, panX: 0, panY: 0 }, pan.panX, pan.panY, s)
}

/** CSS transform of the photo layer (rotation is applied by an inner element about its own centre). */
export function cssTransform(t: Transform, isVideo: boolean): string {
  const { x, y } = effectiveTranslation(t, isVideo)
  return `translate(${round(x)}px, ${round(y)}px) scale(${round(t.zoom, 4)})`
}

const round = (v: number, digits = 2) => {
  const f = 10 ** digits
  return Math.round(v * f) / f
}

// ---------------------------------------------------------------------------------------------
// Slideshow duration (AppPreference.SlideshowDuration: default 5000, min 1000)

export const SLIDESHOW_DURATION_DEFAULT = 5000
export const SLIDESHOW_DURATION_MIN = 1000

/** `takeIf { it >= min } ?: default`. */
export function slideshowDelay(pref: number | null | undefined): number {
  return pref != null && pref >= SLIDESHOW_DURATION_MIN ? pref : SLIDESHOW_DURATION_DEFAULT
}

// ---------------------------------------------------------------------------------------------
// Image size requested on the web (upstream downloads the original file)

/**
 * Longest edge, in device pixels, to request for a photo shown full-screen: the larger window edge times the
 * device pixel ratio, rounded up to a 256 px step so resizes reuse the cache. A square box keeps rotated photos
 * sharp too.
 */
export function screenImageEdge(s: Screen, dpr: number): number {
  const px = Math.max(s.width, s.height) * Math.max(1, dpr)
  return Math.max(256, Math.ceil(px / 256) * 256)
}

/**
 * True when the photo, at `zoom`, is drawn larger than the resized copy (`edge` device px on its long side) and
 * the original is bigger than that copy: then the original is worth fetching.
 */
export function needsOriginal(p: {
  zoom: number
  edge: number
  imageWidth: number | null | undefined
  imageHeight: number | null | undefined
  screen: Screen
  dpr: number
  rotated: boolean
}): boolean {
  if (!isZoomed(p.zoom)) return false
  const w = p.imageWidth ?? 0
  const h = p.imageHeight ?? 0
  if (w <= 0 || h <= 0) return true
  const long = Math.max(w, h)
  if (long <= p.edge) return false
  const [iw, ih] = p.rotated ? [h, w] : [w, h]
  const fit = Math.min(p.screen.width / iw, p.screen.height / ih)
  const drawnLong = long * fit * p.zoom * Math.max(1, p.dpr)
  return drawnLong > p.edge * 1.05
}

// ---------------------------------------------------------------------------------------------
// Colour filter (VideoFilter)

export interface ImageFilter {
  brightness: number
  contrast: number
  saturation: number
  red: number
  green: number
  blue: number
}

export const DEFAULT_FILTER: ImageFilter = { brightness: 100, contrast: 100, saturation: 100, red: 100, green: 100, blue: 100 }

export const FILTER_SLIDERS: readonly { key: keyof ImageFilter; labelKey: string; tint?: string }[] = [
  { key: 'brightness', labelKey: 'brightness' },
  { key: 'contrast', labelKey: 'contrast' },
  { key: 'saturation', labelKey: 'saturation' },
  { key: 'red', labelKey: 'red', tint: 'var(--fx-red)' },
  { key: 'green', labelKey: 'green', tint: 'var(--fx-green)' },
  { key: 'blue', labelKey: 'blue', tint: 'var(--fx-blue)' },
]

/** `hasImageFilter()`. */
export function hasImageFilter(f: ImageFilter): boolean {
  return f.red !== 100 || f.green !== 100 || f.blue !== 100 || f.brightness !== 100 || f.contrast !== 100 || f.saturation !== 100
}

export function normalizeFilter(v: unknown): ImageFilter | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const n = (k: keyof ImageFilter) => {
    const x = o[k]
    return typeof x === 'number' && Number.isFinite(x) ? Math.round(Math.min(200, Math.max(0, x))) : 100
  }
  return { brightness: n('brightness'), contrast: n('contrast'), saturation: n('saturation'), red: n('red'), green: n('green'), blue: n('blue') }
}

type Matrix = number[] // 4x5 row-major (feColorMatrix order)

const identity = (): Matrix => [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]

/** Compose ColorMatrix.setToSaturation (luma weights 0.213 / 0.715 / 0.072). */
function saturationMatrix(s: number): Matrix {
  const inv = 1 - s
  const r = 0.213 * inv
  const g = 0.715 * inv
  const b = 0.072 * inv
  return [r + s, g, b, 0, 0, r, g + s, b, 0, 0, r, g, b + s, 0, 0, 0, 0, 0, 1, 0]
}

/** Applies `m` after `base` (out = m x base). */
function then(base: Matrix, m: Matrix): Matrix {
  const out: Matrix = new Array<number>(20).fill(0)
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      let v = 0
      for (let k = 0; k < 4; k++) v += m[row * 5 + k] * base[k * 5 + col]
      if (col === 4) v += m[row * 5 + 4]
      out[row * 5 + col] = v
    }
  }
  return out
}

const scale = (r: number, g: number, b: number): Matrix => [r, 0, 0, 0, 0, 0, g, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, 1, 0]

/**
 * `VideoFilter.createComposeColorMatrix()` with its overwrite fixed: upstream `setToScale` resets the matrix, so
 * any red/green/blue change silently drops the saturation. Here saturation, RGB, contrast and brightness all
 * apply, in that order. Contrast is a plain RGB scale as upstream (no offset). Returns null without a filter.
 */
export function colorMatrix(f: ImageFilter): number[] | null {
  if (!hasImageFilter(f)) return null
  let m = identity()
  if (f.saturation !== 100) m = then(m, saturationMatrix(f.saturation / 100))
  if (f.red !== 100 || f.green !== 100 || f.blue !== 100) m = then(m, scale(f.red / 100, f.green / 100, f.blue / 100))
  if (f.contrast !== 100) m = then(m, scale(f.contrast / 100, f.contrast / 100, f.contrast / 100))
  if (f.brightness !== 100) m = then(m, scale(f.brightness / 100, f.brightness / 100, f.brightness / 100))
  return m.map((v) => Math.round(v * 10000) / 10000)
}
