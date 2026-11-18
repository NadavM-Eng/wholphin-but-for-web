import { afterEach, describe, expect, it } from 'vitest'
import { getPrefs, PREFERENCE_DEFAULTS, resetPrefs, setPref } from '../../stores/preferences'
import { onScreensaverStart, screensaverAvailable, startScreensaver } from './screensaverEvents'
import { resetSubtitleStyle } from './subtitleStyle'

afterEach(() => resetPrefs('all'))

describe('resetSubtitleStyle', () => {
  it('SDR reset restores the style and turns the separate HDR style off (fresh SubtitlePreferences upstream)', () => {
    setPref('subFontColor', '#FFFF00')
    setPref('subSeparateHdr', true)
    setPref('hdrSubFontColor', '#00FFFF')
    resetSubtitleStyle(false)
    const p = getPrefs()
    expect(p.subFontColor).toBe(PREFERENCE_DEFAULTS.subFontColor)
    expect(p.subSeparateHdr).toBe(false)
    expect(p.hdrSubFontColor).toBe('#00FFFF')
  })

  it('HDR reset touches only the HDR copy', () => {
    setPref('subFontColor', '#FFFF00')
    setPref('subSeparateHdr', true)
    setPref('hdrSubFontColor', '#00FFFF')
    resetSubtitleStyle(true)
    const p = getPrefs()
    expect(p.hdrSubFontColor).toBe(PREFERENCE_DEFAULTS.subFontColor)
    expect(p.subFontColor).toBe('#FFFF00')
    expect(p.subSeparateHdr).toBe(true)
  })
})

describe('screensaver start', () => {
  it('is available only while a handler is registered, and calls it', () => {
    expect(screensaverAvailable()).toBe(false)
    let calls = 0
    const off = onScreensaverStart(() => calls++)
    expect(screensaverAvailable()).toBe(true)
    startScreensaver()
    expect(calls).toBe(1)
    off()
    expect(screensaverAvailable()).toBe(false)
  })
})
