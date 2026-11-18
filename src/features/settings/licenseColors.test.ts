import { describe, expect, it } from 'vitest'
import { javaHash, licenseChipColor } from './licenseColors'

describe('licenseChipColor', () => {
  it('matches java.lang.String.hashCode', () => {
    expect(javaHash('')).toBe(0)
    expect(javaHash('MIT')).toBe(76344)
    expect(javaHash('OFL-1.1')).toBe(-826035908)
  })

  it('turns the primary hue by the license offset (hsv s .4 v .97 as hwb)', () => {
    expect(licenseChipColor('Apache-2.0')).toBe('hwb(from var(--c-primary) calc(h - 60) 58.2% 3%)')
    expect(licenseChipColor('mit')).toBe('hwb(from var(--c-primary) calc(h - 130) 58.2% 3%)')
    expect(licenseChipColor('MPL-2.0')).toBe('hwb(from var(--c-primary) calc(h + 75) 58.2% 3%)')
  })

  it('uses the neutral gray for public-domain licenses and for no license', () => {
    expect(licenseChipColor('CC0-1.0')).toBe('#B7B7B7')
    expect(licenseChipColor('')).toBe('#B7B7B7')
    expect(licenseChipColor(null)).toBe('#B7B7B7')
  })

  it('picks unknown licenses from the palette by hash, like PaletteFallbackLicenseHueResolver', () => {
    // |hash("OFL-1.1")| % 12 = 826035908 % 12 = 8
    expect(licenseChipColor('OFL-1.1')).toBe('#FDA4AF')
    expect(licenseChipColor('GPL-2.0-only')).toMatch(/^#[0-9A-F]{6}$/)
  })
})
