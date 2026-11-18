import { afterEach, describe, expect, it, vi } from 'vitest'
import { setAppConfig } from '../config'
import { anySignal, buildSeerrUrl, seerrFetch, seerrProxyPath, setSeerrApiKey } from './client'

afterEach(() => {
  setAppConfig({})
  setSeerrApiKey(null)
  vi.unstubAllGlobals()
})

describe('seerr client', () => {
  it('combines abort signals without AbortSignal.any (Safari before 17.4)', () => {
    const native = AbortSignal.any
    try {
      ;(AbortSignal as { any?: unknown }).any = undefined
      const a = new AbortController()
      const b = new AbortController()
      expect(anySignal([])).toBeUndefined()
      expect(anySignal([a.signal])).toBe(a.signal)
      const both = anySignal([a.signal, b.signal])!
      expect(both.aborted).toBe(false)
      b.abort(new Error('second'))
      expect(both.aborted).toBe(true)
      expect((both.reason as Error).message).toBe('second')
      expect(anySignal([a.signal, b.signal])!.aborted).toBe(true)
    } finally {
      AbortSignal.any = native
    }
  })

  it('uses the configured same-origin proxy only', () => {
    setAppConfig({ seerrProxyPath: '/seerr/' })
    expect(seerrProxyPath()).toBe('/seerr')
    expect(buildSeerrUrl('/search', { query: 'a b', page: 1, empty: null })).toBe('/seerr/api/v1/search?query=a%20b&page=1')
    expect(buildSeerrUrl('/search', { query: "Kumiko, the (Treasure) Hunter's!" })).toBe(
      '/seerr/api/v1/search?query=Kumiko%2C%20the%20%28Treasure%29%20Hunter%27s%21',
    )
    setAppConfig({ seerrProxyPath: 'https://seerr.example' })
    expect(seerrProxyPath()).toBeNull()
    setAppConfig({ seerrProxyPath: '//evil.example' })
    expect(seerrProxyPath()).toBeNull()
  })

  it('sends the API key without cookies and drops null body fields', async () => {
    setAppConfig({ seerrProxyPath: '/seerr-proxy' })
    setSeerrApiKey('k')
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 1 }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await seerrFetch('/request', {
      method: 'POST',
      body: { mediaType: 'movie', mediaId: 5, serverId: null, tags: [] },
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/seerr-proxy/api/v1/request')
    // A wrong key must not fall back to the browser's Seerr session cookie.
    expect(init.credentials).toBe('omit')
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('k')
    expect(JSON.parse(init.body as string)).toEqual({
      mediaType: 'movie',
      mediaId: 5,
      tags: [],
    })
  })

  it('rejects a non-JSON answer (missing proxy serving the SPA)', async () => {
    setAppConfig({ seerrProxyPath: '/seerr-proxy' })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          }),
      ),
    )
    await expect(seerrFetch('/settings/public')).rejects.toMatchObject({
      status: 502,
    })
  })

  it('sends the session cookie when no API key is set', async () => {
    setAppConfig({ seerrProxyPath: '/seerr-proxy' })
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ id: 1 }), { headers: { 'content-type': 'application/json' } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await seerrFetch('/auth/me')
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.credentials).toBe('include')
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBeUndefined()
  })
})
