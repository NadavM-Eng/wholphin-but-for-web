// BackdropService.extractColorsFromBackdrop for the browser: load the image (CORS: Jellyfin sends
// Access-Control-Allow-Origin: *), read its pixels, reduce them exactly as Palette.scaleBitmapDown does on
// Android, run the Palette port.
import { selectBackdropColors, type BackdropColors } from './backdropColors'
import { generatePalette, scaledSize } from './palette'

const CACHE_SIZE = 50
/** LRU of 50 URLs, as upstream. `null` = extraction failed (ExtractedColors.DEFAULT). */
const cache = new Map<string, BackdropColors | null>()
const inflight = new Map<string, Promise<BackdropColors | null>>()

function remember(url: string, value: BackdropColors | null) {
  cache.delete(url)
  cache.set(url, value)
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string)
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`image failed: ${url}`))
    img.src = url
  })
}

// ---- Bitmap.createScaledBitmap(bitmap, w, h, filter = false), the downscale inside Palette ---------------
//
// Android draws the bitmap through Skia's bitmap shader with nearest sampling (SkBitmapProcState: nofilter_scale
// + SkBitmapProcStateAutoMapper). Which source pixel a destination pixel takes is fixed-point arithmetic on a
// FLOAT inverse scale, and it decides the colours: the colour cut of a few thousand pixels is chaotic, a shift
// of one source pixel in a fifth of the columns changed one of the three colours on 5 of 11 test backdrops.
// Plain `floor((d + .5) * src / dst)` differs from Skia wherever a sample lands exactly on a pixel edge
// (1920 -> 150: every 5th column, 1080 -> 84: every 7th row):
//   - Skia moves every sample down by one 16.16 unit, so an exact edge takes the LOWER pixel;
//   - the inverse scale is a float (12.8 is stored as 12.80000019), and along a row Skia adds it up in 32.32
//     fixed point, so that error grows with x and from some column on the edge sample takes the UPPER pixel
//     again (1920 -> 150: from column 80).
// Verified against the Android TV reference pictures: 11 of 11 backdrops give the TV's colours with this
// arithmetic, 6 of 11 with plain floor (same decoded pixels on both sides).

const f = Math.fround
/** SK_FractionalInt1: Skia's 32.32 fixed point. Every value below stays under 2^53, so doubles are exact. */
const FRACTIONAL_ONE = 2 ** 32
/** One SkFixed (16.16) unit in 32.32: SkBitmapProcStateAutoMapper's bias for nearest sampling. */
const SAMPLE_BIAS = 2 ** 16
/** x coordinates per matrix-proc call (SkBitmapProcShader: a 128 x uint32 buffer, one entry for y, 16 bit per x). */
const SPAN = 254

/** `1 / (dst / (float) src)`: createScaledBitmap's float scale, inverted by SkMatrix in float. */
const inverseScale = (src: number, dst: number) => f(1 / f(dst / src))
/** A float source coordinate as biased 32.32 (SkScalarToFractionalInt, minus the bias). */
const toBiasedFractional = (v: number) => Math.trunc(v * FRACTIONAL_ONE) - SAMPLE_BIAS
const pin = (v: number, max: number) => (v < 0 ? 0 : v > max ? max : v)

/** Source column of every destination column: mapped in float at the start of a span, then stepped in 32.32. */
export function nearestColumns(sw: number, dw: number): Int32Array {
  const inv = inverseScale(sw, dw)
  const dx = Math.trunc(inv * FRACTIONAL_ONE)
  const xs = new Int32Array(dw)
  for (let start = 0; start < dw; start += SPAN) {
    const fx = toBiasedFractional(f(f(start + 0.5) * inv))
    const end = Math.min(dw, start + SPAN)
    for (let x = start; x < end; x++) xs[x] = pin(Math.floor((fx + (x - start) * dx) / FRACTIONAL_ONE), sw - 1)
  }
  return xs
}

/** Source row of every destination row: each scanline is mapped on its own, in float. */
export function nearestRows(sh: number, dh: number): Int32Array {
  const inv = inverseScale(sh, dh)
  const ys = new Int32Array(dh)
  for (let y = 0; y < dh; y++) ys[y] = pin(Math.floor(toBiasedFractional(f(f(y + 0.5) * inv)) / FRACTIONAL_ONE), sh - 1)
  return ys
}

/** The downscaled RGBA pixels, bit for bit what Palette quantises on Android (given the same decoded source). */
export function scaleNearest(src: ArrayLike<number>, sw: number, sh: number, dw: number, dh: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dw * dh * 4)
  if (dw === sw && dh === sh) {
    // createScaledBitmap returns the bitmap itself
    out.set(src)
    return out
  }
  const xs = nearestColumns(sw, dw)
  const ys = nearestRows(sh, dh)
  let o = 0
  for (let y = 0; y < dh; y++) {
    const row = ys[y] * sw
    for (let x = 0; x < dw; x++) {
      const i = (row + xs[x]) * 4
      out[o++] = src[i]
      out[o++] = src[i + 1]
      out[o++] = src[i + 2]
      out[o++] = src[i + 3]
    }
  }
  return out
}

async function extract(url: string): Promise<BackdropColors | null> {
  try {
    const img = await loadImage(url)
    const { width, height } = scaledSize(img.naturalWidth, img.naturalHeight)
    if (!width || !height) return null
    const sw = img.naturalWidth
    const sh = img.naturalHeight
    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    // Drawn 1:1 and downscaled here: canvas scaling (even with smoothing off) samples differently per engine
    // and never the way Android does (see scaleNearest).
    ctx.drawImage(img, 0, 0)
    const full = ctx.getImageData(0, 0, sw, sh).data
    canvas.width = 0 // release the full-size backing store early
    return selectBackdropColors(generatePalette(scaleNearest(full, sw, sh, width, height)))
  } catch {
    return null
  }
}

/**
 * Colours for a backdrop URL. Resolves `undefined` for a blank URL (upstream returns null: keep the
 * previous colours) and `null` when loading/extraction failed (upstream DEFAULT: no colour layer).
 */
export async function extractBackdropColors(url: string | null): Promise<BackdropColors | null | undefined> {
  if (!url?.trim()) return undefined
  if (cache.has(url)) {
    const v = cache.get(url) ?? null
    remember(url, v)
    return v
  }
  let p = inflight.get(url)
  if (!p) {
    p = extract(url).then((v) => {
      inflight.delete(url)
      // a failed load is retried next time (upstream caches only decoded bitmaps)
      if (v) remember(url, v)
      return v
    })
    inflight.set(url, p)
  }
  return p
}

/** `clearColorCache()` */
export function clearBackdropColorCache() {
  cache.clear()
}
