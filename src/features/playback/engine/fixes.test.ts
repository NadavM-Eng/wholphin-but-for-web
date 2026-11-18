import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBackend } from './backends'
import { ProgressReporter } from './reporting'
import { activeCues } from './subtitles/cues'

describe('activeCues', () => {
  it('keeps a long cue that overlaps more than 50 later cues', () => {
    const cues = [{ startMs: 0, endMs: 600_000, text: 'sign' }]
    for (let i = 0; i < 120; i++) cues.push({ startMs: 1000 + i * 1000, endMs: 1500 + i * 1000, text: `l${i}` })
    expect(activeCues(cues, 100_200).map((c) => c.text)).toEqual(['sign', 'l99'])
  })
})

describe('NativeBackend start seek', () => {
  it('a destroyed backend does not seek the next stream', () => {
    const video = document.createElement('video')
    vi.spyOn(video, 'load').mockImplementation(() => undefined)
    const seeks: number[] = []
    Object.defineProperty(video, 'currentTime', { get: () => seeks.at(-1) ?? 0, set: (v: number) => {
        seeks.push(v)
      },
      configurable: true })
    const a = createBackend(video, false, false, { onFatal: () => undefined })
    a.load('http://x/a', 400)
    a.destroy()
    const b = createBackend(video, false, false, { onFatal: () => undefined })
    b.load('http://x/b', 0)
    video.dispatchEvent(new Event('loadedmetadata'))
    expect(seeks).toEqual([])
    // and a live backend still applies its own start seek
    b.destroy()
    const c = createBackend(video, false, false, { onFatal: () => undefined })
    c.load('http://x/c', 12)
    video.dispatchEvent(new Event('loadedmetadata'))
    expect(seeks).toEqual([12])
  })
})

describe('ProgressReporter after release', () => {
  it('sends no Progress for a released session', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))
    vi.stubGlobal('fetch', fetchSpy)
    const post = vi.fn(() => Promise.resolve({}))
    const api = {
      basePath: 'http://srv',
      authorizationHeader: 'MediaBrowser Token="x"',
      deviceInfo: { id: 'd' },
      axiosInstance: { request: post },
      configuration: {},
    }
    const r = new ProgressReporter(
      api as never,
      { itemId: 'i', mediaSourceId: null, playMethod: 'DirectPlay', audioStreamIndex: 1, subtitleStreamIndex: null, playSessionId: 'p', liveStreamId: null },
      { positionMs: () => 5000, isPaused: () => false, isMuted: () => false, volume: () => 1 },
    )
    r.release({ failed: true })
    r.updateTracks(2, null)
    r.onSeeked()
    await Promise.resolve()
    expect(post).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('wake lock', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  function mockWakeLock() {
    const created: { released: boolean; release: () => Promise<void>; addEventListener: () => void }[] = []
    const resolvers: (() => void)[] = []
    const request = vi.fn(
      () =>
        new Promise((resolve) => {
          const s = {
            released: false,
            release: () => {
              s.released = true
              return Promise.resolve()
            },
            addEventListener: () => undefined,
          }
          created.push(s)
          resolvers.push(() => resolve(s))
        }),
    )
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
    return { created, resolvers, request }
  }

  it('releases a lock that resolves after keepScreenOn(false)', async () => {
    const m = mockWakeLock()
    const { keepScreenOn } = await import('./platform')
    keepScreenOn(true)
    keepScreenOn(false)
    m.resolvers[0]()
    await new Promise((r) => setTimeout(r, 0))
    expect(m.created.map((s) => s.released)).toEqual([true])
  })

  it('two quick keepScreenOn(true) calls request one lock, released by false', async () => {
    const m = mockWakeLock()
    const { keepScreenOn } = await import('./platform')
    keepScreenOn(true)
    keepScreenOn(true)
    m.resolvers.forEach((r) => r())
    await new Promise((r) => setTimeout(r, 0))
    keepScreenOn(false)
    expect(m.request).toHaveBeenCalledTimes(1)
    expect(m.created.map((s) => s.released)).toEqual([true])
  })
})

describe('subtitle URLs without the query token', () => {
  it('drops ApiKey / api_key only when a header is sent', async () => {
    const { withoutApiKey } = await import('./subtitles/loader')
    const a = { authorization: 'MediaBrowser Token="x"' }
    expect(withoutApiKey('http://s/Videos/1/Stream.js?ApiKey=abc', a)).toBe('http://s/Videos/1/Stream.js')
    expect(withoutApiKey('http://s/x.ass?api_key=abc&foo=1', a)).toBe('http://s/x.ass?foo=1')
    expect(withoutApiKey('http://s/x.vtt?foo=1&ApiKey=abc', a)).toBe('http://s/x.vtt?foo=1')
    expect(withoutApiKey('http://s/x.vtt?ApiKey=abc', { authorization: null })).toBe('http://s/x.vtt?ApiKey=abc')
  })
})
