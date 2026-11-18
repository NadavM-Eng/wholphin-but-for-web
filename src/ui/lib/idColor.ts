/**
 * Port of `rememberIdColor` (upstream `ui/setup/ServerList.kt:57-92`): a deterministic color per id,
 * used by the server/user circles and the genre/studio cards.
 *
 * Upstream hashes a `java.util.UUID` with `UUID.hashCode()` and does the HSV math in 32-bit floats.
 * Both are reproduced here (BigInt for the 64-bit halves, `Math.fround` for float32), so a Jellyfin id
 * gets the same color as on the TV. Ids that are not UUIDs fall back to Java's `String.hashCode()`,
 * which upstream never sees (its ids are always UUIDs).
 */

export type Rgb = { r: number; g: number; b: number }

const UUID_HEX = /^[0-9a-f]{32}$/i

/** `java.util.UUID.hashCode()` for a UUID given as 32 hex digits, with or without dashes. */
export function javaUuidHashCode(id: string): number | null {
  const hex = id.replace(/-/g, '')
  if (!UUID_HEX.test(hex)) return null
  const msb = BigInt.asIntN(64, BigInt('0x' + hex.slice(0, 16)))
  const lsb = BigInt.asIntN(64, BigInt('0x' + hex.slice(16)))
  const hilo = msb ^ lsb
  return Number(BigInt.asIntN(32, hilo >> 32n)) ^ Number(BigInt.asIntN(32, hilo))
}

/** `java.lang.String.hashCode()` (UTF-16 code units). */
export function javaStringHashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

const f = Math.fround

/** The HSV math of `rememberIdColor`, in float32 like Kotlin `Float`. Returns 0-255 channels. */
export function idHashToRgb(hash: number): Rgb {
  // Kotlin Int `/` and `%` truncate toward zero, like Math.trunc and JS `%`.
  const hue = f(hash % 360)
  const saturation = f(f(0.6) + f(f(Math.trunc(hash / 360) % 40) / f(100)))
  const brightness = f(f(0.4) + f(f(Math.trunc(hash / 14400) % 30) / f(100)))
  const c = f(brightness * saturation)
  const x = f(c * f(1 - Math.abs(f(f(f(hue / f(60)) % f(2)) - 1))))
  const m = f(brightness - c)
  let rgb: [number, number, number]
  if (hue < 60) rgb = [c, x, 0]
  else if (hue < 120) rgb = [x, c, 0]
  else if (hue < 180) rgb = [0, c, x]
  else if (hue < 240) rgb = [0, x, c]
  else if (hue < 300) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  // Compose packs an sRGB float color as (v * 255 + 0.5).toInt().
  const to8 = (v: number) => Math.trunc(f(f(Math.min(1, Math.max(0, f(v + m)))) * f(255)) + f(0.5))
  return { r: to8(rgb[0]), g: to8(rgb[1]), b: to8(rgb[2]) }
}

/** Color for an id, or null when there is no id (callers then use `surfaceVariant`, as upstream). */
export function idColor(id: string | null | undefined): Rgb | null {
  if (!id) return null
  const hash = javaUuidHashCode(id) ?? javaStringHashCode(id)
  return idHashToRgb(hash)
}

/** CSS color for an id at an alpha; null id gives `surfaceVariant` at that alpha. */
export function idColorCss(id: string | null | undefined, alpha = 1): string {
  const rgb = idColor(id)
  if (!rgb) return `rgb(from var(--c-surface-variant) r g b / ${alpha})`
  return `rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${alpha})`
}
