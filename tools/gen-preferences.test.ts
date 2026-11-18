import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { defaultFor, generate, prefKey, scopeOf, tsType, type SpecPref } from './gen-preferences.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const spec = JSON.parse(readFileSync(resolve(root, 'docs/spec/preferences.json'), 'utf8')) as {
  preferences: SpecPref[]
  screens: Record<string, unknown>
}
const byId = (id: string) => spec.preferences.find((p) => p.id === id)!

describe('gen-preferences', () => {
  it('derives keys', () => {
    expect(prefKey('BackdropStylePref')).toBe('backdropStyle')
    expect(prefKey('ProtectProfilePreference')).toBe('protectProfile')
    expect(prefKey('ThemeColors')).toBe('themeColors')
  })

  it('stores durations in milliseconds and applies documented overrides', () => {
    expect(defaultFor(byId('SkipForward'))).toBe(30_000)
    expect(defaultFor(byId('SkipBackOnResume'))).toBe(0)
    expect(defaultFor(byId('PassOutProtection'))).toBe(7_200_000)
    expect(defaultFor(byId('MaxBitrate'))).toBe(104_857_600)
    expect(defaultFor(byId('DecodeAv1'))).toBe(false)
    expect(defaultFor(byId('ScreensaverDimToggle'))).toBe(false)
    expect(defaultFor(byId('ScreensaverDimPercent'))).toBe(75)
  })

  it('maps types and scopes', () => {
    expect(tsType(byId('ThemeColors'))).toContain('"OLED_BLACK"')
    expect(tsType(byId('ScreensaverItemTypes'))).toMatch(/^Array</)
    expect(tsType(byId('HomeClickToPlay'))).toBe('boolean')
    expect(tsType(byId('UserInterfaceLanguage'))).toBe('string | null')
    expect(scopeOf(byId('UserInterfaceLanguage'))).toBe('user')
    expect(scopeOf(byId('ThemeColors'))).toBe('app')
  })

  it('omits android-only preferences from the type', () => {
    const out = generate(spec)
    const typeBlock = out.slice(out.indexOf('export interface Preferences'), out.indexOf('export type PreferenceKey'))
    expect(typeBlock).not.toContain('playerBackend')
    expect(typeBlock).toContain('webInterfaceScale: number')
    // web-only: the TV scrim over the whole video while the controls of the player show, off unless the user turns it on
    expect(typeBlock).toContain('webPlayerDimVideo: boolean')
    expect(out).toContain('  webPlayerDimVideo: false,')
    expect(out).toContain('{ id: "PlayerBackendPref"')
  })

  it('adds the HDR subtitle copy and reclassifies its toggle for the web', () => {
    const out = generate(spec)
    expect(out).toContain('hdrSubFontSize: number')
    expect(out).toContain('subSeparateHdr: boolean')
    expect(out).toContain("subFontSize: 'hdrSubFontSize',")
    expect(out).not.toContain('hdrSubSeparateHdr')
    expect(out).toContain(`{ id: "SubHdrSettings", key: null, widget: 'destination'`)
  })
})
