import { describe, expect, it } from 'vitest'
import { isSeekHeld, SEEK_HOLD_IDLE, seekHoldNext, type SeekHoldEvent, type SeekHoldState } from './seekHoldState'

const run = (events: SeekHoldEvent[], from: SeekHoldState = SEEK_HOLD_IDLE) => events.reduce(seekHoldNext, from)

describe('seekHoldNext', () => {
  it('holds from the press until the seek has landed and a frame was drawn', () => {
    let s = run([{ type: 'press' }])
    expect(isSeekHeld(s)).toBe(true)
    s = run([{ type: 'seeking' }], s)
    s = run([{ type: 'seeked', stillSeeking: false }], s)
    expect(s.phase).toBe('landed')
    expect(isSeekHeld(s)).toBe(true)
    s = run([{ type: 'frame', gen: s.gen }], s)
    expect(isSeekHeld(s)).toBe(false)
  })

  it('an earlier seek landing before the pressed seek was issued does not release', () => {
    const s = run([{ type: 'press' }, { type: 'seeked', stillSeeking: false }])
    expect(s.phase).toBe('armed')
  })

  it('a seeked while another seek is still running does not release', () => {
    const s = run([{ type: 'seeking' }, { type: 'seeked', stillSeeking: true }])
    expect(s.phase).toBe('seeking')
  })

  it('a new press or seek after landing ignores the frame that was waited for', () => {
    const landed = run([{ type: 'seeking' }, { type: 'seeked', stillSeeking: false }])
    const again = run([{ type: 'press' }], landed)
    expect(run([{ type: 'frame', gen: landed.gen }], again).phase).toBe('armed')
    const next = run([{ type: 'seeking' }], landed)
    expect(run([{ type: 'frame', gen: landed.gen }], next).phase).toBe('seeking')
  })

  it('several presses release only after the last seek has landed', () => {
    let s = run([{ type: 'press' }, { type: 'seeking' }, { type: 'press' }, { type: 'press' }])
    expect(s.phase).toBe('armed')
    s = run([{ type: 'seeking' }, { type: 'seeked', stillSeeking: false }], s)
    s = run([{ type: 'frame', gen: s.gen }], s)
    expect(isSeekHeld(s)).toBe(false)
  })

  it('a timeout lets go, and does nothing when idle', () => {
    expect(isSeekHeld(run([{ type: 'press' }, { type: 'timeout' }]))).toBe(false)
    expect(seekHoldNext(SEEK_HOLD_IDLE, { type: 'timeout' })).toBe(SEEK_HOLD_IDLE)
  })
})
