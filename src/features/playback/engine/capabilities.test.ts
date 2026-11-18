import { describe, expect, it, vi } from 'vitest'
import {
  browserToneMapsHdr,
  confirmDecode,
  emptyCapabilities,
  hdrPlayable,
  matroskaCodecSupported,
  matroskaSupported,
  type MatroskaTypeAnswers,
} from './capabilities'
import { probePlayback } from './probeMedia'

// what canPlayType says about Matroska in the engines that were measured (Edge 157, Chrome 157 and Firefox 159
// answer per codec; Playwright's WebKit on Windows says "probably" to everything) and in one that does not know it
const chromium: MatroskaTypeAnswers = { bare: true, h264Aac: true, bogus: false }
const yesToEverything: MatroskaTypeAnswers = { bare: true, h264Aac: true, bogus: true }
const silent: MatroskaTypeAnswers = { bare: false, h264Aac: false, bogus: false }

describe('Matroska support comes from the loaded clip', () => {
  it('a clip that played means yes, whatever canPlayType says', () => {
    expect(matroskaSupported('ok', chromium)).toBe(true)
    // older Chromium: plays Matroska, answers "" to the type
    expect(matroskaSupported('ok', silent)).toBe(true)
  })

  it('a clip that failed means no, even when canPlayType says "probably" to everything', () => {
    expect(matroskaSupported('error', yesToEverything)).toBe(false)
    expect(matroskaSupported('error', chromium)).toBe(false)
  })

  it('no answer in time: canPlayType counts only from an engine that rejects a made-up codec', () => {
    expect(matroskaSupported('timeout', chromium)).toBe(true)
    expect(matroskaSupported('timeout', yesToEverything)).toBe(false)
    // Safari / iOS: loading postponed and the type unknown
    expect(matroskaSupported('timeout', silent)).toBe(false)
  })
})

describe('codecs inside Matroska', () => {
  it('nothing without the container or without file support for the codec', () => {
    expect(matroskaCodecSupported(false, true, chromium, true)).toBe(false)
    expect(matroskaCodecSupported(true, false, chromium, true)).toBe(false)
  })

  it('an engine with credible per-codec answers is believed (Firefox: FLAC in Matroska refused)', () => {
    expect(matroskaCodecSupported(true, true, chromium, true)).toBe(true)
    expect(matroskaCodecSupported(true, true, chromium, false)).toBe(false)
  })

  it('an engine without credible answers gets the file answer alone', () => {
    expect(matroskaCodecSupported(true, true, silent, false)).toBe(true)
    expect(matroskaCodecSupported(true, true, yesToEverything, true)).toBe(true)
  })
})

describe('AC-3 / E-AC-3 are confirmed by a real clip', () => {
  const claimed = { file: true, hls: true }
  it('an explicit error overrules the type check', () => {
    expect(confirmDecode(claimed, 'error')).toEqual({ file: false, hls: false })
  })
  it('a decoded clip or no answer keeps it', () => {
    expect(confirmDecode(claimed, 'ok')).toEqual(claimed)
    // iOS loads nothing before a user gesture, and it does decode AC-3
    expect(confirmDecode(claimed, 'timeout')).toEqual(claimed)
  })
})

describe('HDR on a display that is not HDR', () => {
  const brands = (...names: string[]) => names.map((brand) => ({ brand }))
  it('desktop Chromium tone-maps by itself (Chrome, Edge and other Chromium browsers)', () => {
    expect(browserToneMapsHdr({ brands: brands('Chromium', 'Google Chrome', 'Not.A/Brand'), mobile: false })).toBe(true)
    expect(browserToneMapsHdr({ brands: brands('Microsoft Edge', 'Chromium'), mobile: false })).toBe(true)
    expect(browserToneMapsHdr({ brands: brands('Chromium', 'Brave') })).toBe(true)
  })
  it('Chrome on Android, and browsers without userAgentData (Firefox, Safari), do not count', () => {
    expect(browserToneMapsHdr({ brands: brands('Chromium', 'Google Chrome'), mobile: true })).toBe(false)
    expect(browserToneMapsHdr(undefined)).toBe(false)
    expect(browserToneMapsHdr({})).toBe(false)
    expect(browserToneMapsHdr({ brands: brands('Some Browser'), mobile: false })).toBe(false)
  })
  it('HDR10 is playable with a decoder and either an HDR display or a tone-mapping browser', () => {
    expect(hdrPlayable(true, true, false)).toBe(true)
    expect(hdrPlayable(true, false, true)).toBe(true)
    // SDR display, no tone mapping (Firefox): the server tone-maps
    expect(hdrPlayable(true, false, false)).toBe(false)
    // no decoder: never
    expect(hdrPlayable(false, true, true)).toBe(false)
  })
})

describe('probe clips', () => {
  it('give a result where media cannot load, without hanging or throwing', async () => {
    // jsdom implements neither media loading (load() only logs "not implemented") nor blob URLs for it
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
    expect(await probePlayback('mkv', 50)).toMatch(/^(timeout|error)$/)
    load.mockRestore()
  })

  it('the empty capability set plays nothing from Matroska and cannot switch audio tracks', () => {
    const c = emptyCapabilities()
    expect(c.containers.mkv).toBe(false)
    expect(Object.values(c.matroska.video).concat(Object.values(c.matroska.audio)).some(Boolean)).toBe(false)
    expect(c.audioTrackSelection).toBe(false)
  })
})
