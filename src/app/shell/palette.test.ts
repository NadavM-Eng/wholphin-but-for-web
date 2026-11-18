import { describe, expect, it } from 'vitest'
import { generatePalette, isAllowedByDefaultFilter, quantize, rgbToHsl, scaledSize } from './palette'

/** RGBA buffer made of `count` pixels of each colour. */
function pixels(...parts: Array<[rgb: number, count: number]>): Uint8ClampedArray {
  const total = parts.reduce((n, [, c]) => n + c, 0)
  const out = new Uint8ClampedArray(total * 4)
  let i = 0
  for (const [rgb, count] of parts) {
    for (let k = 0; k < count; k++) {
      out[i++] = (rgb >> 16) & 0xff
      out[i++] = (rgb >> 8) & 0xff
      out[i++] = rgb & 0xff
      out[i++] = 255
    }
  }
  return out
}

describe('rgbToHsl', () => {
  it('matches ColorUtils for primaries and greys', () => {
    expect(rgbToHsl(0xff0000)).toEqual([0, 1, 0.5])
    expect(rgbToHsl(0x00ff00)[0]).toBeCloseTo(120, 4)
    expect(rgbToHsl(0x0000ff)[0]).toBeCloseTo(240, 4)
    const grey = rgbToHsl(0x808080)
    expect(grey[0]).toBe(0)
    expect(grey[1]).toBe(0)
    expect(grey[2]).toBeCloseTo(0.502, 3)
  })
  it('wraps negative hues', () => {
    expect(rgbToHsl(0xff0080)[0]).toBeCloseTo(329.88, 1)
  })
})

describe('default filter', () => {
  it('drops black, white and the red I line', () => {
    expect(isAllowedByDefaultFilter(rgbToHsl(0x050505))).toBe(false)
    expect(isAllowedByDefaultFilter(rgbToHsl(0xfafafa))).toBe(false)
    // skin tone: hue ~25, saturation < .82
    expect(isAllowedByDefaultFilter(rgbToHsl(0xd09070))).toBe(false)
    expect(isAllowedByDefaultFilter(rgbToHsl(0x2050e0))).toBe(true)
  })
})

describe('scaledSize', () => {
  it('caps the area at 112x112 with ceil', () => {
    expect(scaledSize(100, 100)).toEqual({ width: 100, height: 100 })
    const s = scaledSize(1920, 1080)
    expect(s).toEqual({ width: Math.ceil(1920 * Math.sqrt(12544 / (1920 * 1080))), height: Math.ceil(1080 * Math.sqrt(12544 / (1920 * 1080))) })
  })
})

describe('quantize', () => {
  it('returns the distinct 5-bit colours directly when there are few', () => {
    const sw = quantize(pixels([0x2050e0, 30], [0x10a040, 10]))
    expect(sw).toHaveLength(2)
    // colours are approximated to RGB555 then shifted back (no bit replication)
    expect(sw.map((s) => s.rgb.toString(16)).sort()).toEqual(['10a040', '2050e0'].sort())
    expect(sw.find((s) => s.rgb === 0x2050e0)?.population).toBe(30)
  })

  it('ignores filtered colours entirely', () => {
    const sw = quantize(pixels([0x000000, 100], [0xffffff, 100], [0x2050e0, 1]))
    expect(sw).toHaveLength(1)
  })

  it('median-cuts to at most 16 swatches', () => {
    const parts: Array<[number, number]> = []
    for (let r = 0; r < 256; r += 32) for (let g = 0; g < 256; g += 64) for (let b = 0; b < 256; b += 64) parts.push([(r << 16) | (g << 8) | b, 1 + ((r + g + b) % 7)])
    const sw = quantize(pixels(...parts))
    expect(sw.length).toBeGreaterThan(4)
    expect(sw.length).toBeLessThanOrEqual(16)
    for (const s of sw) expect(isAllowedByDefaultFilter(s.hsl)).toBe(true)
  })
})

describe('targets', () => {
  it('assigns swatches to vibrant / dark / muted targets exclusively', () => {
    const p = generatePalette(
      pixels(
        [0x2050e0, 400], // saturated blue, l ~ .5 -> vibrant
        [0x182878, 300], // saturated dark blue -> darkVibrant
        [0x607088, 200], // greyish blue, s ~ .17 l ~ .45 -> muted
        [0x283038, 100], // dark grey-blue -> darkMuted
        [0x90b8f8, 50], // light saturated blue -> lightVibrant
      ),
    )
    expect(p.targets.vibrant?.rgb).toBe(0x2050e0)
    expect(p.targets.darkVibrant?.rgb).toBe(0x182878)
    expect(p.targets.muted?.rgb).toBe(0x607088)
    expect(p.targets.darkMuted?.rgb).toBe(0x283038)
    expect(p.targets.lightVibrant?.rgb).toBe(0x90b8f8)
    expect(p.dominant?.rgb).toBe(0x2050e0)
    const chosen = Object.values(p.targets).filter(Boolean).map((s) => s!.rgb)
    expect(new Set(chosen).size).toBe(chosen.length)
  })

  it('leaves targets empty when nothing qualifies', () => {
    const p = generatePalette(pixels([0x2050e0, 10]))
    expect(p.targets.vibrant?.rgb).toBe(0x2050e0)
    expect(p.targets.darkMuted).toBeNull()
    expect(p.targets.lightMuted).toBeNull()
  })
})
