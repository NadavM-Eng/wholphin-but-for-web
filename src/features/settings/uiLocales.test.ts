import { describe, expect, it } from 'vitest'
import { LOCALES } from '../../i18n'
import { localeDisplayName, uiLocaleOption, uiLocaleOptions } from './uiLocales'

describe('localeDisplayName (Locale.getDisplayName)', () => {
  it('uses the plain form with the region in parentheses, not the dialect name', () => {
    expect(localeDisplayName('en-US', 'en')).toBe('English (United States)')
    expect(localeDisplayName('en-GB', 'en')).toBe('English (United Kingdom)')
    expect(localeDisplayName('de', 'en')).toBe('German')
  })

  it('names a language in itself without capitalizing it', () => {
    expect(localeDisplayName('de', 'de')).toBe('Deutsch')
    expect(localeDisplayName('da', 'da')).toBe('dansk')
  })

  it('answers null instead of another language when the runtime has no names for the locale', () => {
    expect(localeDisplayName('de', 'zz')).toBeNull()
  })
})

describe('uiLocaleOptions (LocaleChoiceDialog order and names)', () => {
  const options = uiLocaleOptions(LOCALES)

  it('lists the base locale first, as en-US', () => {
    expect(options[0]).toEqual({ tag: 'en', name: 'English (United States)', englishName: 'English (United States)' })
  })

  it('keeps every shipped locale once', () => {
    expect(options.map((o) => o.tag).sort()).toEqual(LOCALES.map((l) => l.tag).sort())
  })

  it('sorts the rest by the Android resource tag (he = iw, id = in)', () => {
    const tags = options.slice(1).map((o) => o.tag)
    expect(tags.slice(0, 8)).toEqual(['ar', 'be', 'ca', 'cs', 'da', 'de', 'el', 'en-GB'])
    expect(tags.indexOf('id')).toBeLessThan(tags.indexOf('it'))
    expect(tags.indexOf('it')).toBeLessThan(tags.indexOf('he'))
    expect(tags.indexOf('he')).toBeLessThan(tags.indexOf('ja'))
    expect(tags.indexOf('pt')).toBeLessThan(tags.indexOf('pt-BR'))
  })

  it('falls back to the generated names when the runtime cannot name a locale', () => {
    const o = uiLocaleOption({ tag: 'zz', nativeName: 'Zed', englishName: 'Zedish', keys: 0 })
    expect(o.name).toBe('Zed')
  })
})
