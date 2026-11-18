import { describe, expect, it } from 'vitest'
import { canRetryWithTranscoding, playbackErrorDetail } from './playbackErrors'

describe('playback error screen', () => {
  it('does not repeat a detail the message already quotes', () => {
    const e = { kind: 'load-failed' as const, detail: 'Request failed with status code 404' }
    expect(playbackErrorDetail('Could not load the item: Request failed with status code 404', e)).toBeUndefined()
    expect(playbackErrorDetail('Playback failed', { kind: 'no-method', detail: 'x' })).toBe('x')
  })
  it('offers transcoding only once the item loaded and a lighter method is still allowed', () => {
    expect(canRetryWithTranscoding({ kind: 'load-failed' }, false, true, true)).toBe(false)
    expect(canRetryWithTranscoding({ kind: 'unsupported-browser' }, true, true, true)).toBe(false)
    expect(canRetryWithTranscoding({ kind: 'no-method' }, true, false, false)).toBe(false)
    expect(canRetryWithTranscoding({ kind: 'no-method' }, true, true, false)).toBe(true)
  })
})
