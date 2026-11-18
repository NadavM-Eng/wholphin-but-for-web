import { afterAll, describe, expect, it } from 'vitest'
import { i18next, initI18n, setLanguage, withCount } from './index'

const LRI = '\u2066'
const PDI = '\u2069'

describe('English fallback text in a right-to-left language', () => {
  afterAll(() => setLanguage('en'))

  it('is wrapped in a left-to-right isolate; translated and English-interface text is not', async () => {
    await initI18n('en')
    expect(i18next.t('web_close')).toBe('Close')

    await setLanguage('he')
    // `web_` strings exist in English only
    expect(i18next.t('web_close')).toBe(`${LRI}Close${PDI}`)
    expect(i18next.t('web_photos_position', { p1: 5, p2: 15 })).toBe(`${LRI}5 of 15${PDI}`)
    // a string the Hebrew locale has: untouched
    const cancel = i18next.t('cancel')
    expect(cancel).not.toContain(LRI)
    expect(cancel).not.toBe('Cancel')
  })

  it('a count appended to a label goes inside the isolate', () => {
    expect(withCount('Seasons', 3)).toBe('Seasons (3)')
    expect(withCount(`${LRI}Home rows${PDI}`, 6)).toBe(`${LRI}Home rows (6)${PDI}`)
    // translated text: plain concatenation, as upstream
    expect(withCount('\u05e2\u05d5\u05e0\u05d5\u05ea', 2)).toBe('\u05e2\u05d5\u05e0\u05d5\u05ea (2)')
  })
})
