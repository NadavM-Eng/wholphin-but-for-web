import { describe, expect, it } from 'vitest'
import { browserAudioContainers, canDirectPlay, universalAudioUrl } from './streamUrl'

const all = { aac: true, mp3: true, opus: true, flac: true, vorbis: true, alac: false, wav: true }

describe('music stream URL', () => {
  it('lists only what the browser plays, in container|codec form', () => {
    const list = browserAudioContainers({ ...all, flac: false, opus: false })
    expect(list).toContain('mp3')
    expect(list).toContain('m4a|aac')
    expect(list).not.toContain('flac')
    expect(list.some((c) => c.includes('opus'))).toBe(false)
  })

  it('direct play matches container and codec', () => {
    const list = browserAudioContainers(all)
    expect(canDirectPlay({ container: 'flac', codec: 'flac' }, list)).toBe(true)
    expect(canDirectPlay({ container: 'm4a', codec: 'aac' }, list)).toBe(true)
    expect(canDirectPlay({ container: 'm4a', codec: 'alac' }, list)).toBe(false)
    expect(canDirectPlay({ container: 'ape', codec: 'ape' }, list)).toBe(false)
    expect(canDirectPlay({ container: 'mov,mp4,m4a', codec: 'aac' }, list)).toBe(true)
    expect(canDirectPlay({ container: null, codec: null }, list)).toBe(true)
  })

  it('builds the universal URL with the token, the transcode target and a start for transcodes', () => {
    const url = new URL(
      universalAudioUrl({
        baseUrl: 'http://srv/',
        token: 'tok',
        itemId: 'abc',
        userId: 'u',
        deviceId: 'd',
        containers: ['mp3', 'flac'],
        playSessionId: 'ps',
        startMs: 1500,
      }),
    )
    expect(url.pathname).toBe('/Audio/abc/universal')
    expect(url.searchParams.get('container')).toBe('mp3,flac')
    expect(url.searchParams.get('transcodingContainer')).toBe('mp3')
    expect(url.searchParams.get('transcodingProtocol')).toBe('http')
    expect(url.searchParams.get('startTimeTicks')).toBe('15000000')
    expect(url.searchParams.get('ApiKey')).toBe('tok')
    expect(url.searchParams.get('playSessionId')).toBe('ps')
  })
})
