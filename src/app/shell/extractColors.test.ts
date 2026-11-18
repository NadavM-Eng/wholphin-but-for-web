import { describe, expect, it } from 'vitest'
import { selectBackdropColors, type Rgba } from './backdropColors'
import { nearestColumns, nearestRows, scaleNearest } from './extractColors'
import { GLASS_ORCHARD, MULTI_TRACK, type SparseBackdrop } from './extractColors.fixtures'
import { generatePalette, scaledSize } from './palette'

/** 1-channel helper: an RGBA buffer whose red channel holds the pixel index. */
function indexed(w: number, h: number) {
  const a = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) a[i * 4] = i
  return a
}
const reds = (a: Uint8ClampedArray) => Array.from(a.filter((_, i) => i % 4 === 0))

/** Plain `floor((d + .5) * src / dst)`: what the port did before, and what Skia does away from pixel edges. */
const floorIndex = (sn: number, dn: number) => Array.from({ length: dn }, (_, d) => Math.floor(((d + 0.5) * sn) / dn))
/** Destination indices whose sample lands exactly on a source pixel edge. */
const edges = (sn: number, dn: number) => floorIndex(sn, dn).flatMap((_, d) => (Number.isInteger(((d + 0.5) * sn) / dn) ? [d] : []))
/** Destination indices where `got` is one below plain floor. */
const lowered = (got: Int32Array, sn: number, dn: number) => floorIndex(sn, dn).flatMap((v, d) => (got[d] === v - 1 ? [d] : []))
const differing = (got: Int32Array, sn: number, dn: number) => floorIndex(sn, dn).flatMap((v, d) => (got[d] !== v ? [d] : []))

describe('nearestColumns / nearestRows (Skia nearest sampling of Bitmap.createScaledBitmap)', () => {
  it('1920 -> 150: an exact pixel edge takes the lower pixel up to column 79, the upper one after', () => {
    const xs = nearestColumns(1920, 150)
    // 12.8 source pixels per column: columns 2, 7, 12 ... land on an edge
    expect(edges(1920, 150)).toHaveLength(30)
    expect(lowered(xs, 1920, 150)).toEqual([2, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 57, 62, 67, 72, 77])
    expect(differing(xs, 1920, 150)).toEqual(lowered(xs, 1920, 150))
    expect([xs[0], xs[1], xs[2], xs[77], xs[82], xs[147], xs[149]]).toEqual([6, 19, 31, 991, 1056, 1888, 1913])
  })

  it('1080 -> 84: every row on an edge takes the lower pixel', () => {
    const ys = nearestRows(1080, 84)
    expect(lowered(ys, 1080, 84)).toEqual(edges(1080, 84))
    expect(edges(1080, 84)).toEqual([3, 10, 17, 24, 31, 38, 45, 52, 59, 66, 73, 80])
    expect(differing(ys, 1080, 84)).toEqual(edges(1080, 84))
    expect([ys[0], ys[3], ys[80], ys[83]]).toEqual([6, 44, 1034, 1073])
  })

  it('other source sizes: the float error of each scale decides where the edge samples flip', () => {
    expect(lowered(nearestColumns(2560, 150), 2560, 150)).toEqual([7])
    expect(lowered(nearestRows(1440, 84), 1440, 84)).toEqual(edges(1440, 84))
    expect(lowered(nearestColumns(1280, 150), 1280, 150)).toEqual([7, 22])
    expect(lowered(nearestColumns(3840, 150), 3840, 150)).toEqual([2, 7, 12, 17, 22, 27, 32, 37])
    // 850 -> 84 has no sample on an edge: identical to plain floor
    expect(Array.from(nearestRows(850, 84))).toEqual(floorIndex(850, 84))
  })

  it('stays inside the source', () => {
    for (const [sn, dn] of [[1920, 150], [1080, 84], [5, 3], [3, 2], [7000, 300], [113, 112]]) {
      for (const v of [...nearestColumns(sn, dn), ...nearestRows(sn, dn)]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThan(sn)
      }
    }
  })
})

describe('scaleNearest (Bitmap.createScaledBitmap, filter = false)', () => {
  it('halving takes the top-left pixel of each 2x2 block (every sample is on an edge)', () => {
    // 4x2 -> 2x1: samples at x = 1 and 3, y = 1, all moved down one fixed-point unit
    expect(reds(scaleNearest(indexed(4, 2), 4, 2, 2, 1))).toEqual([0, 2])
  })

  it('keeps the image at the same size', () => {
    const src = indexed(3, 3)
    expect(Array.from(scaleNearest(src, 3, 3, 3, 3))).toEqual(Array.from(src))
  })

  it('handles non-integer ratios without reading past the edge', () => {
    const out = scaleNearest(indexed(5, 3), 5, 3, 3, 2)
    expect(out.length).toBe(3 * 2 * 4)
    expect(reds(out)).toEqual([0, 2, 4, 10, 12, 14])
  })
})

// ---- real backdrops: the colours the Android TV app shows for them (fitted from the reference pictures) ----

/** Source positions the fixture holds: per destination pixel the floor pixel and, on an exact edge, the one below. */
function positions(sn: number, dn: number): number[] {
  const set = new Set<number>()
  for (let d = 0; d < dn; d++) {
    const v = ((d + 0.5) * sn) / dn
    set.add(Math.floor(v))
    set.add(Math.max(0, Math.ceil(v) - 1))
  }
  return [...set].sort((a, b) => a - b)
}

/** The stored image as RGBA, filled only where a nearest-neighbour downscale may read (elsewhere pure red). */
function expand(fx: SparseBackdrop): Uint8ClampedArray {
  const { width, height } = fx
  const size = scaledSize(width, height)
  const cols = positions(width, size.width)
  const rows = positions(height, size.height)
  const out = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < out.length; i += 4) {
    out[i] = 255
    out[i + 3] = 255
  }
  const channel = (i: number) => parseInt(fx.colors[i], 32) << 3
  const order = fx.order.split(' ').map((t) => parseInt(t, 36))
  expect(order).toHaveLength(rows.length)
  rows.forEach((y, r) => {
    let c = 0
    for (const run of fx.lines[order[r]].split(' ')) {
      const [color, count = '1'] = run.split('*')
      const k = parseInt(color, 36) * 3
      for (let n = parseInt(count, 36); n > 0; n--) {
        const o = (y * width + cols[c++]) * 4
        out[o] = channel(k)
        out[o + 1] = channel(k + 1)
        out[o + 2] = channel(k + 2)
      }
    }
    expect(c).toBe(cols.length)
  })
  return out
}

const rgb = (c: Rgba) => [c.r, c.g, c.b]

function colorsOf(fx: SparseBackdrop, scale: typeof scaleNearest) {
  const size = scaledSize(fx.width, fx.height)
  const c = selectBackdropColors(generatePalette(scale(expand(fx), fx.width, fx.height, size.width, size.height)))
  return { primary: rgb(c.primary), secondary: rgb(c.secondary), tertiary: rgb(c.tertiary) }
}

/** The port's downscale before the fix: plain floor on both axes. */
function scaleFloor(src: ArrayLike<number>, sw: number, sh: number, dw: number, dh: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dw * dh * 4)
  const xs = floorIndex(sw, dw)
  const ys = floorIndex(sh, dh)
  for (let y = 0, o = 0; y < dh; y++) for (let x = 0; x < dw; x++) for (let k = 0; k < 4; k++) out[o++] = src[(ys[y] * sw + xs[x]) * 4 + k]
  return out
}

describe('colours of real backdrops match the Android TV app', () => {
  it('music artist page (27-music-artist-artist): green in all three corners', () => {
    expect(colorsOf(GLASS_ORCHARD, scaleNearest)).toEqual({ secondary: [24, 160, 48], primary: [16, 128, 80], tertiary: [24, 160, 48] })
    // plain floor sampling made the bottom-end corner purple: the difference the comparison with the TV found
    expect(colorsOf(GLASS_ORCHARD, scaleFloor).primary).toEqual([56, 16, 64])
  })

  it('movie page (11-movie-tracks-top): needs both the lower pixel on an edge and the flip at column 80', () => {
    expect(colorsOf(MULTI_TRACK, scaleNearest)).toEqual({ secondary: [152, 24, 128], primary: [16, 64, 8], tertiary: [152, 24, 128] })
    expect(colorsOf(MULTI_TRACK, scaleFloor).secondary).toEqual([152, 24, 120])
  })
})
