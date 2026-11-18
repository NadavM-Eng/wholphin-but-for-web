// Port of androidx.palette (1.0/1.1) as upstream uses it: `Palette.from(bitmap).generate()` with the default
// 16 colours, 112x112 resize area, default filter and the six default targets. Pure: feed it RGBA pixels.
// Sources: androidx/palette/graphics/{Palette,ColorCutQuantizer,Target}.java, core ColorUtils.RGBToHSL.

export type Hsl = readonly [h: number, s: number, l: number]

export interface Swatch {
  /** 0xRRGGBB */
  rgb: number
  population: number
  hsl: Hsl
}

export type TargetName = 'lightVibrant' | 'vibrant' | 'darkVibrant' | 'lightMuted' | 'muted' | 'darkMuted'

export interface Palette {
  swatches: Swatch[]
  dominant: Swatch | null
  /** selected swatch per default target (null when no swatch qualifies) */
  targets: Record<TargetName, Swatch | null>
}

const f = Math.fround

/** Palette.DEFAULT_RESIZE_BITMAP_AREA */
export const DEFAULT_RESIZE_AREA = 112 * 112
/** Palette.DEFAULT_CALCULATE_NUMBER_COLORS */
export const DEFAULT_MAX_COLORS = 16

/** `Palette.scaleBitmapDown` dimensions: area capped at 112*112, `ceil(side * sqrt(area / bitmapArea))`. */
export function scaledSize(width: number, height: number, resizeArea = DEFAULT_RESIZE_AREA): { width: number; height: number } {
  const area = width * height
  if (resizeArea <= 0 || area <= resizeArea) return { width, height }
  const ratio = Math.sqrt(resizeArea / area)
  return { width: Math.ceil(width * ratio), height: Math.ceil(height * ratio) }
}

/** `ColorUtils.RGBToHSL` (float maths, as Java). */
export function rgbToHsl(rgb: number): Hsl {
  const rf = f(((rgb >> 16) & 0xff) / 255)
  const gf = f(((rgb >> 8) & 0xff) / 255)
  const bf = f((rgb & 0xff) / 255)
  const max = Math.max(rf, gf, bf)
  const min = Math.min(rf, gf, bf)
  const delta = f(max - min)
  let h: number
  let s: number
  const l = f(f(max + min) / 2)
  if (max === min) {
    h = 0
    s = 0
  } else {
    if (max === rf) h = f(f(f(gf - bf) / delta) % 6)
    else if (max === gf) h = f(f(f(bf - rf) / delta) + 2)
    else h = f(f(f(rf - gf) / delta) + 4)
    s = f(delta / f(1 - Math.abs(f(f(2 * l) - 1))))
  }
  h = f(f(h * 60) % 360)
  if (h < 0) h = f(h + 360)
  const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
  return [clamp(h, 0, 360), clamp(s, 0, 1), clamp(l, 0, 1)]
}

/** `Palette.DEFAULT_FILTER`: drops near-black, near-white and the "red I line" (skin tones). */
export function isAllowedByDefaultFilter(hsl: Hsl): boolean {
  const isBlack = hsl[2] <= f(0.05)
  const isWhite = hsl[2] >= f(0.95)
  const isNearRedILine = hsl[0] >= 10 && hsl[0] <= 37 && hsl[1] <= f(0.82)
  return !isBlack && !isWhite && !isNearRedILine
}

// ---- ColorCutQuantizer -------------------------------------------------------------------------

const W = 5
const WMASK = (1 << W) - 1
const COMPONENT_RED = -3
const COMPONENT_GREEN = -2
const COMPONENT_BLUE = -1

const qRed = (c: number) => (c >> (W + W)) & WMASK
const qGreen = (c: number) => (c >> W) & WMASK
const qBlue = (c: number) => c & WMASK
const to888 = (r5: number, g5: number, b5: number) => (((r5 << 3) & 0xff) << 16) | (((g5 << 3) & 0xff) << 8) | ((b5 << 3) & 0xff)
const quantizedTo888 = (c: number) => to888(qRed(c), qGreen(c), qBlue(c))

function makeSwatch(rgb: number, population: number): Swatch {
  return { rgb, population, hsl: rgbToHsl(rgb) }
}

class Vbox {
  lower: number
  upper: number
  population = 0
  minR = 0
  maxR = 0
  minG = 0
  maxG = 0
  minB = 0
  maxB = 0
  private readonly colors: Int32Array
  private readonly hist: Int32Array

  constructor(colors: Int32Array, hist: Int32Array, lower: number, upper: number) {
    this.colors = colors
    this.hist = hist
    this.lower = lower
    this.upper = upper
    this.fitBox()
  }

  volume() {
    return (this.maxR - this.minR + 1) * (this.maxG - this.minG + 1) * (this.maxB - this.minB + 1)
  }

  canSplit() {
    return this.upper - this.lower + 1 > 1
  }

  fitBox() {
    let minR = Infinity
    let minG = Infinity
    let minB = Infinity
    let maxR = -Infinity
    let maxG = -Infinity
    let maxB = -Infinity
    let count = 0
    for (let i = this.lower; i <= this.upper; i++) {
      const c = this.colors[i]
      count += this.hist[c]
      const r = qRed(c)
      const g = qGreen(c)
      const b = qBlue(c)
      if (r > maxR) maxR = r
      if (r < minR) minR = r
      if (g > maxG) maxG = g
      if (g < minG) minG = g
      if (b > maxB) maxB = b
      if (b < minB) minB = b
    }
    Object.assign(this, { minR, maxR, minG, maxG, minB, maxB, population: count })
  }

  splitBox(): Vbox {
    const split = this.findSplitPoint()
    const box = new Vbox(this.colors, this.hist, split + 1, this.upper)
    this.upper = split
    this.fitBox()
    return box
  }

  private longestDimension() {
    const r = this.maxR - this.minR
    const g = this.maxG - this.minG
    const b = this.maxB - this.minB
    if (r >= g && r >= b) return COMPONENT_RED
    if (g >= r && g >= b) return COMPONENT_GREEN
    return COMPONENT_BLUE
  }

  private findSplitPoint() {
    const dim = this.longestDimension()
    const { colors, lower, upper } = this
    modifySignificantOctet(colors, dim, lower, upper)
    // Arrays.sort(int[], from, to) on non-negative ints = numeric ascending
    const part = Array.from(colors.subarray(lower, upper + 1)).sort((a, b) => a - b)
    colors.set(part, lower)
    modifySignificantOctet(colors, dim, lower, upper)
    const mid = Math.trunc(this.population / 2)
    let count = 0
    for (let i = lower; i <= upper; i++) {
      count += this.hist[colors[i]]
      if (count >= mid) return Math.min(upper - 1, i)
    }
    return lower
  }

  averageColor(): Swatch {
    let r = 0
    let g = 0
    let b = 0
    let total = 0
    for (let i = this.lower; i <= this.upper; i++) {
      const c = this.colors[i]
      const pop = this.hist[c]
      total += pop
      r += pop * qRed(c)
      g += pop * qGreen(c)
      b += pop * qBlue(c)
    }
    const mean = (sum: number) => Math.floor(f(sum / total) + 0.5)
    return makeSwatch(to888(mean(r), mean(g), mean(b)), total)
  }
}

function modifySignificantOctet(a: Int32Array, dim: number, lower: number, upper: number) {
  if (dim === COMPONENT_GREEN) {
    for (let i = lower; i <= upper; i++) {
      const c = a[i]
      a[i] = (qGreen(c) << (W + W)) | (qRed(c) << W) | qBlue(c)
    }
  } else if (dim === COMPONENT_BLUE) {
    for (let i = lower; i <= upper; i++) {
      const c = a[i]
      a[i] = (qBlue(c) << (W + W)) | (qGreen(c) << W) | qRed(c)
    }
  }
}

/** java.util.PriorityQueue (binary heap) with Palette's volume comparator, so ties resolve like Android. */
class VboxQueue {
  readonly items: Vbox[] = []
  private cmp(a: Vbox, b: Vbox) {
    return b.volume() - a.volume()
  }
  get size() {
    return this.items.length
  }
  offer(x: Vbox) {
    const q = this.items
    let k = q.length
    q.push(x)
    while (k > 0) {
      const parent = (k - 1) >>> 1
      const e = q[parent]
      if (this.cmp(x, e) >= 0) break
      q[k] = e
      k = parent
    }
    q[k] = x
  }
  poll(): Vbox | undefined {
    const q = this.items
    if (!q.length) return undefined
    const result = q[0]
    const x = q.pop()!
    const n = q.length
    if (n > 0) {
      let k = 0
      const half = n >>> 1
      while (k < half) {
        let child = 2 * k + 1
        let c = q[child]
        const right = child + 1
        if (right < n && this.cmp(c, q[right]) > 0) c = q[(child = right)]
        if (this.cmp(x, c) <= 0) break
        q[k] = c
        k = child
      }
      q[k] = x
    }
    return result
  }
}

/** `ColorCutQuantizer(pixels, maxColors, DEFAULT_FILTER).getQuantizedColors()`. `pixels` = RGBA bytes. */
export function quantize(rgba: ArrayLike<number>, maxColors = DEFAULT_MAX_COLORS): Swatch[] {
  const hist = new Int32Array(1 << (W * 3))
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const c = ((rgba[i] >> 3) << (W + W)) | ((rgba[i + 1] >> 3) << W) | (rgba[i + 2] >> 3)
    hist[c]++
  }
  let distinct = 0
  for (let c = 0; c < hist.length; c++) {
    if (hist[c] > 0 && !isAllowedByDefaultFilter(rgbToHsl(quantizedTo888(c)))) hist[c] = 0
    if (hist[c] > 0) distinct++
  }
  const colors = new Int32Array(distinct)
  let idx = 0
  for (let c = 0; c < hist.length; c++) if (hist[c] > 0) colors[idx++] = c

  if (distinct <= maxColors) {
    return Array.from(colors, (c) => makeSwatch(quantizedTo888(c), hist[c]))
  }
  const pq = new VboxQueue()
  pq.offer(new Vbox(colors, hist, 0, colors.length - 1))
  while (pq.size < maxColors) {
    const box = pq.poll()
    if (box && box.canSplit()) {
      pq.offer(box.splitBox())
      pq.offer(box)
    } else {
      // Android drops the polled box here (ColorCutQuantizer.splitBoxes returns without re-offering it)
      break
    }
  }
  const out: Swatch[] = []
  // PriorityQueue iteration = heap array order
  for (const box of pq.items) {
    const s = box.averageColor()
    if (isAllowedByDefaultFilter(s.hsl)) out.push(s)
  }
  return out
}

// ---- Target scoring --------------------------------------------------------------------------

interface Target {
  name: TargetName
  sat: readonly [min: number, target: number, max: number]
  light: readonly [min: number, target: number, max: number]
}

const VIBRANT_SAT = [f(0.35), 1, 1] as const
const MUTED_SAT = [0, f(0.3), f(0.4)] as const
const LIGHT = [f(0.55), f(0.74), 1] as const
const NORMAL = [f(0.3), f(0.5), f(0.7)] as const
const DARK = [0, f(0.26), f(0.45)] as const
const WEIGHT_SATURATION = f(0.24)
const WEIGHT_LUMA = f(0.52)
const WEIGHT_POPULATION = f(0.24)

/** Palette.Builder default target order. Every default target is exclusive. */
export const DEFAULT_TARGETS: readonly Target[] = [
  { name: 'lightVibrant', sat: VIBRANT_SAT, light: LIGHT },
  { name: 'vibrant', sat: VIBRANT_SAT, light: NORMAL },
  { name: 'darkVibrant', sat: VIBRANT_SAT, light: DARK },
  { name: 'lightMuted', sat: MUTED_SAT, light: LIGHT },
  { name: 'muted', sat: MUTED_SAT, light: NORMAL },
  { name: 'darkMuted', sat: MUTED_SAT, light: DARK },
]

/** `new Palette(swatches, targets).generate()` */
export function paletteFromSwatches(swatches: Swatch[]): Palette {
  let dominant: Swatch | null = null
  for (const s of swatches) if (!dominant || s.population > dominant.population) dominant = s
  const maxPopulation = dominant ? dominant.population : 1
  const used = new Set<number>()
  const targets = {} as Record<TargetName, Swatch | null>
  for (const t of DEFAULT_TARGETS) {
    let best: Swatch | null = null
    let bestScore = 0
    for (const s of swatches) {
      const [, sat, light] = s.hsl
      if (sat < t.sat[0] || sat > t.sat[2] || light < t.light[0] || light > t.light[2] || used.has(s.rgb)) continue
      const score =
        f(WEIGHT_SATURATION * f(1 - Math.abs(f(sat - t.sat[1])))) +
        f(WEIGHT_LUMA * f(1 - Math.abs(f(light - t.light[1])))) +
        f(WEIGHT_POPULATION * f(s.population / maxPopulation))
      if (best == null || score > bestScore) {
        best = s
        bestScore = score
      }
    }
    if (best) used.add(best.rgb)
    targets[t.name] = best
  }
  return { swatches, dominant, targets }
}

/** Full pipeline on already-downscaled RGBA pixels. */
export function generatePalette(rgba: ArrayLike<number>): Palette {
  return paletteFromSwatches(quantize(rgba))
}
