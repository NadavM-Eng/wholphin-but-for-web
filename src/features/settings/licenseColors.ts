// License badge colors of AboutLibraries 15 (the library behind upstream's LicenseInfo.kt -> LibrariesContainer;
// its M3VariantTokens.kt `accentDerivedLicenseHueResolver` and LicensePalette.kt, dark theme, normal contrast).
// Known licenses take the theme's primary hue turned by a fixed angle; unknown ones pick from a fixed palette by
// the Java hash of their id. These colors belong to the library, not to a Wholphin theme, hence the literals.

/** Degrees added to the hue of `primary`; null = the neutral gray. Keys are lower-case SPDX ids. */
const HUE_OFFSETS: Readonly<Record<string, number | null>> = {
  'apache-2.0': -60,
  mit: -130,
  'epl-2.0': 60,
  'epl-1.0': 60,
  'bsd-3-clause': 170,
  'bsd-2-clause': 170,
  'gpl-3.0': 30,
  'gpl-3.0-only': 30,
  'gpl-3.0-or-later': 30,
  'gpl-2.0': 30,
  'lgpl-2.1': 50,
  'lgpl-3.0': 50,
  'mpl-2.0': 75,
  isc: -130,
  unlicense: null,
  'cc0-1.0': null,
}

const NEUTRAL = '#B7B7B7'

/** DarkNormalLicensePalette */
const FALLBACK_PALETTE = [
  '#C4B5FD',
  '#93C5FD',
  '#7DD3FC',
  '#5EEAD4',
  '#86EFAC',
  '#D9F99D',
  '#FCD34D',
  '#FCA5A5',
  '#FDA4AF',
  '#F9A8D4',
  '#F0ABFC',
  '#94A3B8',
] as const

/** java.lang.String.hashCode */
export function javaHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

/**
 * CSS color of a license badge. For a known license: `Color.hsv(primaryHue + offset, 0.4, 0.97)`, written as the
 * equivalent HWB (white = (1 - s) v, black = 1 - v) relative to the theme's primary, so it follows the theme.
 */
export function licenseChipColor(id: string | null | undefined): string {
  const key = (id ?? '').trim()
  if (!key) return NEUTRAL
  const lower = key.toLowerCase()
  if (Object.hasOwn(HUE_OFFSETS, lower)) {
    const offset = HUE_OFFSETS[lower]
    if (offset == null) return NEUTRAL
    return `hwb(from var(--c-primary) calc(h ${offset < 0 ? '-' : '+'} ${Math.abs(offset)}) 58.2% 3%)`
  }
  return FALLBACK_PALETTE[Math.abs(javaHash(key)) % FALLBACK_PALETTE.length]
}
