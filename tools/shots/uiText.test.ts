import { describe, expect, it } from 'vitest'
import { uiPattern, uiText } from './uiText.ts'

describe('uiText', () => {
  it('reads the English text, and the translation in Hebrew', () => {
    expect(uiText('en', 'view_options')).toBe('View options')
    expect(uiText('he', 'view_options')).toBe('אפשרויות תצוגה')
  })

  it('wraps an untranslated string in a left-to-right isolate in Hebrew, as the app shows it', () => {
    expect(uiText('en', 'web_playback_pause')).toBe('Pause')
    expect(uiText('he', 'web_playback_pause')).toBe('⁦Pause⁩')
  })

  it('picks an entry of a string array', () => {
    expect(uiText('en', 'view_options_types', 2)).toBe('Compact List')
    expect(uiText('he', 'view_options_types', 1)).toBe('⁦List⁩')
  })

  it('throws for a key the app does not have', () => {
    expect(() => uiText('en', 'no_such_string_key')).toThrow(/no_such_string_key/)
    expect(() => uiText('en', 'view_options_types')).toThrow()
  })

  it('builds patterns that match the same names as the literal English ones did', () => {
    expect(uiPattern('en', 'add_row').source).toBe('^Add row$')
    expect(uiPattern('en', 'display_presets', { match: 'prefix' }).source).toBe('^Display presets')
    expect(uiPattern('en', 'add_server', { match: 'contains', i: true }).test('+ add server')).toBe(true)
    expect(uiPattern('he', 'web_playback_pause', { i: true }).test('⁦Pause⁩')).toBe(true)
    // regex characters in a translation are taken literally
    expect(uiPattern('en', 'aspect_ratio').test('Aspect Ratio')).toBe(true)
  })
})
