// Dynamic backdrop colours (W/services/BackdropService.kt extractColorsFromBitmap, W/ui/nav/Backdrop.kt).
// Pure helpers: swatch -> corner colour rules, colour animation maths, gradient strings.
import type { Palette, Swatch } from './palette'

/** Non-premultiplied sRGB colour, channels 0..255, alpha 0..1. */
export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

/**
 * The three extracted colours. `null` as a whole = upstream `ExtractedColors.DEFAULT` (Color.Unspecified):
 * no colour layer is drawn. A missing swatch is `TRANSPARENT` (upstream `Color.Transparent`), which still counts.
 */
export interface BackdropColors {
  /** bottom-end corner */
  primary: Rgba
  /** top-start corner */
  secondary: Rgba
  /** top-end corner (under the image) */
  tertiary: Rgba
}

export const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, a: 0 }

function toColor(swatch: Swatch | null | undefined, alpha: number): Rgba {
  if (!swatch) return TRANSPARENT
  return { r: (swatch.rgb >> 16) & 0xff, g: (swatch.rgb >> 8) & 0xff, b: swatch.rgb & 0xff, a: alpha }
}

/** `Palette.Swatch.coolColor`: blue/purple/green rather than red/orange/yellow. */
export function isCool(swatch: Swatch): boolean {
  const r = (swatch.rgb >> 16) & 0xff
  const g = (swatch.rgb >> 8) & 0xff
  const b = swatch.rgb & 0xff
  return b > r && b + g > r * 1.5
}

/**
 * Corner colours from a palette, exactly as BackdropService:
 * - primary = darkVibrant ?: darkMuted @ .4
 * - secondary = vibrant if cool, else muted if cool, else vibrant, else muted @ .4
 * - tertiary = vibrant ?: lightVibrant @ .35
 */
export function selectBackdropColors(p: Palette): BackdropColors {
  const { vibrant, darkVibrant, lightVibrant, muted, darkMuted } = p.targets
  const secondary =
    vibrant && isCool(vibrant) ? vibrant : muted && isCool(muted) ? muted : (vibrant ?? muted ?? null)
  return {
    primary: toColor(darkVibrant ?? darkMuted, 0.4),
    secondary: toColor(secondary, 0.4),
    tertiary: toColor(vibrant ?? lightVibrant, 0.35),
  }
}

// ---- Animation (animateColorAsState: interpolates in Oklab with alpha, tween(1250) FastOutSlowIn) ----

export const COLOR_ANIM_MS = 1250

/** Compose FastOutSlowInEasing = CubicBezierEasing(0.4, 0, 0.2, 1). */
export function fastOutSlowIn(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return cubicBezier(0.4, 0, 0.2, 1, t)
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  const bez = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3
  let lo = 0
  let hi = 1
  let s = x
  for (let i = 0; i < 30; i++) {
    const v = bez(x1, x2, s)
    if (Math.abs(v - x) < 1e-6) break
    if (v < x) lo = s
    else hi = s
    s = (lo + hi) / 2
  }
  return bez(y1, y2, s)
}

type Lab = [number, number, number]

const toLinear = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const fromLinear = (v: number) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055
  return Math.min(255, Math.max(0, c * 255))
}

export function rgbToOklab(c: Rgba): Lab {
  const r = toLinear(c.r)
  const g = toLinear(c.g)
  const b = toLinear(c.b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

export function oklabToRgb([L, A, B]: Lab, a: number): Rgba {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707608957 * s),
    a,
  }
}

/** Colour at fraction `t` (0..1, already eased) between `from` and `to`, in Oklab + alpha. */
export function mixOklab(from: Rgba, to: Rgba, t: number): Rgba {
  const a = rgbToOklab(from)
  const b = rgbToOklab(to)
  const lab: Lab = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
  return oklabToRgb(lab, from.a + (to.a - from.a) * t)
}

export function mixColors(from: BackdropColors, to: BackdropColors, t: number): BackdropColors {
  return {
    primary: mixOklab(from.primary, to.primary, t),
    secondary: mixOklab(from.secondary, to.secondary, t),
    tertiary: mixOklab(from.tertiary, to.tertiary, t),
  }
}

// ---- Gradient strings ------------------------------------------------------------------------

function css(c: Rgba): string {
  return `rgb(${c.r.toFixed(1)} ${c.g.toFixed(1)} ${c.b.toFixed(1)} / ${c.a.toFixed(4)})`
}

/**
 * `radialGradient(listOf(color, Color.Transparent))`: Android interpolates gradient stops PREMULTIPLIED
 * (hwui passes SkGradientShader's interpolate-in-premul flag), so the colour keeps its hue and only its
 * alpha falls to 0 at the radius. CSS gradients interpolate premultiplied too, so two stops are the same
 * ramp. Measured on refshots 33-themes-home-purple: the premultiplied model fits the wash within 0.5/255,
 * a ramp that also darkens towards black is off by about 6/255.
 */
export function fadeToTransparentStops(c: Rgba): string {
  return `${css(c)} 0%, ${css({ ...c, a: 0 })} 100%`
}

/** Same ramp for a CSS colour variable (the theme background "bridge"). */
export function fadeVarToTransparentStops(cssVar: string): string {
  return `var(${cssVar}) 0%, rgb(from var(${cssVar}) r g b / 0) 100%`
}

/**
 * The colour wash of Backdrop.kt as a CSS `background`: base background, then radial gradients of radius
 * 0.8 x width at top-start (secondary), bottom-end (primary), bottom-start (background "bridge") and
 * top-end (tertiary), drawn in that order. CSS lists the topmost layer first. Mirrored for RTL.
 */
export function dynamicBackground(c: BackdropColors, rtl: boolean, radius = '80vw'): string {
  const start = rtl ? '100%' : '0%'
  const end = rtl ? '0%' : '100%'
  const g = (x: string, y: string, stops: string) => `radial-gradient(circle ${radius} at ${x} ${y}, ${stops})`
  return [
    g(end, '0%', fadeToTransparentStops(c.tertiary)),
    g(start, '100%', fadeVarToTransparentStops('--c-background')),
    g(end, '100%', fadeToTransparentStops(c.primary)),
    g(start, '0%', fadeToTransparentStops(c.secondary)),
    'var(--c-background)',
  ].join(', ')
}
