import type { MediaSourceInfo, MediaStream } from '@jellyfin/sdk/lib/generated-client/models'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadSubtitle, looksLikePgs, type LoadContext } from './loader'

const source: MediaSourceInfo = { Id: 'src1', MediaAttachments: [] }
const ctx: LoadContext = { baseUrl: 'http://server', authorization: 'MediaBrowser Token="t"', itemId: 'item1', source, assMode: 'ASS_LIBASS' }

/** A PGS stream starts with a segment header: "PG", then two 32-bit timestamps, the segment type and its size. */
function sup(bytes = 64): ArrayBuffer {
  const b = new Uint8Array(bytes)
  b.set([0x50, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0x16, 0, 0])
  return b.buffer
}

function respond(body: ArrayBuffer | string, status = 200) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return Promise.resolve(new Response(body, { status }))
    }),
  )
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('PGS subtitles are loaded for the canvas renderer', () => {
  const pgs: MediaStream = {
    Type: 'Subtitle',
    Index: 3,
    Codec: 'PGSSUB',
    DeliveryMethod: 'External',
    DeliveryUrl: '/Videos/item1/src1/Subtitles/3/0/Stream.pgssub?ApiKey=secret',
  }

  it('fetches the .sup stream with the Authorization header and no token in the address', async () => {
    const calls = respond(sup())
    const r = await loadSubtitle(pgs, ctx)
    expect(r.kind).toBe('pgs')
    expect(r.streamIndex).toBe(3)
    if (r.kind === 'pgs') expect(looksLikePgs(r.data)).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('http://server/Videos/item1/src1/Subtitles/3/0/Stream.pgssub')
    expect(calls[0].init?.headers).toEqual({ Authorization: 'MediaBrowser Token="t"' })
  })

  it('an answer that is not a PGS stream is "unavailable", not handed to the renderer', async () => {
    respond('Error processing request.')
    expect((await loadSubtitle(pgs, ctx)).kind).toBe('unavailable')
    respond(new ArrayBuffer(0))
    expect((await loadSubtitle(pgs, ctx)).kind).toBe('unavailable')
  })

  it('a failed request rejects (the engine shows the track as unavailable)', async () => {
    respond('nope', 404)
    await expect(loadSubtitle(pgs, ctx)).rejects.toThrow('HTTP 404')
  })

  it('PGS that the server will burn in stays burn-in, and is never fetched', async () => {
    const calls = respond(sup())
    expect((await loadSubtitle({ ...pgs, DeliveryMethod: 'Encode', DeliveryUrl: null }, ctx)).kind).toBe('burn-in')
    expect(calls).toHaveLength(0)
  })
})

describe('looksLikePgs', () => {
  it('needs the "PG" magic', () => {
    expect(looksLikePgs(sup())).toBe(true)
    expect(looksLikePgs(new Uint8Array([0x50]).buffer)).toBe(false)
    expect(looksLikePgs(new TextEncoder().encode('WEBVTT').buffer as ArrayBuffer)).toBe(false)
  })
})
