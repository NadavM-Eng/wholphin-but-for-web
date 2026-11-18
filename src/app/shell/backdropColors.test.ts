import { describe, expect, it } from 'vitest'
import {
  dynamicBackground,
  fadeToTransparentStops,
  fadeVarToTransparentStops,
  fastOutSlowIn,
  isCool,
  mixOklab,
  selectBackdropColors,
  TRANSPARENT,
} from './backdropColors'
import { rgbToHsl, type Palette, type Swatch, type TargetName } from './palette'

const sw = (rgb: number): Swatch => ({ rgb, population: 1, hsl: rgbToHsl(rgb) })

function palette(t: Partial<Record<TargetName, number>>): Palette {
  const targets = {
    lightVibrant: null,
    vibrant: null,
    darkVibrant: null,
    lightMuted: null,
    muted: null,
    darkMuted: null,
  } as Record<TargetName, Swatch | null>
  for (const [k, v] of Object.entries(t)) targets[k as TargetName] = sw(v)
  return { swatches: [], dominant: null, targets }
}

const BLUE = 0x2050e0 // cool
const ORANGE = 0xe08020 // warm
const SLATE = 0x506080 // cool muted
const BROWN = 0x806040 // warm muted

describe('isCool', () => {
  it('uses b > r && b + g > 1.5 r', () => {
    expect(isCool(sw(BLUE))).toBe(true)
    expect(isCool(sw(ORANGE))).toBe(false)
    expect(isCool(sw(0x606070))).toBe(true)
    expect(isCool(sw(0x707060))).toBe(false)
  })
})

describe('selectBackdropColors', () => {
  it('primary: darkVibrant, else darkMuted, at .4', () => {
    expect(selectBackdropColors(palette({ darkVibrant: 0x102060, darkMuted: 0x202020 })).primary).toEqual({ r: 0x10, g: 0x20, b: 0x60, a: 0.4 })
    expect(selectBackdropColors(palette({ darkMuted: 0x303840 })).primary).toEqual({ r: 0x30, g: 0x38, b: 0x40, a: 0.4 })
  })

  it('secondary prefers a cool colour: cool vibrant, then cool muted, then vibrant, then muted', () => {
    expect(selectBackdropColors(palette({ vibrant: BLUE, muted: SLATE })).secondary.b).toBe(BLUE & 0xff)
    expect(selectBackdropColors(palette({ vibrant: ORANGE, muted: SLATE })).secondary).toEqual({ r: 0x50, g: 0x60, b: 0x80, a: 0.4 })
    expect(selectBackdropColors(palette({ vibrant: ORANGE, muted: BROWN })).secondary).toEqual({ r: 0xe0, g: 0x80, b: 0x20, a: 0.4 })
    expect(selectBackdropColors(palette({ muted: BROWN })).secondary).toEqual({ r: 0x80, g: 0x60, b: 0x40, a: 0.4 })
  })

  it('tertiary: vibrant, else lightVibrant, at .35', () => {
    expect(selectBackdropColors(palette({ vibrant: ORANGE, lightVibrant: 0xa0c0ff })).tertiary.a).toBe(0.35)
    expect(selectBackdropColors(palette({ vibrant: ORANGE, lightVibrant: 0xa0c0ff })).tertiary.r).toBe(0xe0)
    expect(selectBackdropColors(palette({ lightVibrant: 0xa0c0ff })).tertiary).toEqual({ r: 0xa0, g: 0xc0, b: 0xff, a: 0.35 })
  })

  it('missing swatches become transparent, not "unspecified"', () => {
    expect(selectBackdropColors(palette({}))).toEqual({ primary: TRANSPARENT, secondary: TRANSPARENT, tertiary: TRANSPARENT })
  })
})

describe('animation helpers', () => {
  it('easing ends at 0 and 1 and is monotonic', () => {
    expect(fastOutSlowIn(0)).toBe(0)
    expect(fastOutSlowIn(1)).toBe(1)
    let prev = 0
    for (let i = 1; i <= 20; i++) {
      const v = fastOutSlowIn(i / 20)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
    expect(fastOutSlowIn(0.5)).toBeGreaterThan(0.7)
  })

  it('oklab mix returns the endpoints', () => {
    const a = { r: 32, g: 80, b: 224, a: 0.4 }
    const b = { r: 224, g: 128, b: 32, a: 0.35 }
    const m0 = mixOklab(a, b, 0)
    const m1 = mixOklab(a, b, 1)
    expect(m0.r).toBeCloseTo(32, 0)
    expect(m0.b).toBeCloseTo(224, 0)
    expect(m1.g).toBeCloseTo(128, 0)
    expect(m1.a).toBeCloseTo(0.35, 5)
  })
})

describe('gradients', () => {
  it('keeps the colour and fades only the alpha (Android interpolates premultiplied, as CSS does)', () => {
    const s = fadeToTransparentStops({ r: 200, g: 100, b: 0, a: 0.4 })
    expect(s).toBe('rgb(200.0 100.0 0.0 / 0.4000) 0%, rgb(200.0 100.0 0.0 / 0.0000) 100%')
    expect(fadeVarToTransparentStops('--c-background')).toBe('var(--c-background) 0%, rgb(from var(--c-background) r g b / 0) 100%')
  })

  it('orders layers tertiary, bridge, primary, secondary, base and mirrors for RTL', () => {
    const c = { primary: TRANSPARENT, secondary: TRANSPARENT, tertiary: TRANSPARENT }
    const ltr = dynamicBackground(c, false)
    const at = [...ltr.matchAll(/at (\S+) (\S+),/g)].map((m) => `${m[1]} ${m[2]}`)
    expect(at).toEqual(['100% 0%', '0% 100%', '100% 100%', '0% 0%'])
    expect(ltr.endsWith('var(--c-background)')).toBe(true)
    const rtl = [...dynamicBackground(c, true).matchAll(/at (\S+) (\S+),/g)].map((m) => `${m[1]} ${m[2]}`)
    expect(rtl).toEqual(['0% 0%', '100% 100%', '0% 100%', '100% 0%'])
  })
})
