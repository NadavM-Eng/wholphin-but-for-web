import { describe, expect, it } from 'vitest'
import { ELLIPSIS, middleEllipsize } from './middleEllipsis'

/** every character 10 wide */
const mono = (start: number, end: number) => (end - start) * 10

describe('middleEllipsize', () => {
  it('returns the text when it fits', () => {
    expect(middleEllipsize('Big Buck Bunny', 140, 10, mono)).toBe('Big Buck Bunny')
    expect(middleEllipsize('', 0, 10, mono)).toBe('')
  })

  it('keeps the tail in half of the room and gives the head the rest', () => {
    // 20 characters in 110: room 100 beside the ellipsis, tail 5, head 5
    expect(middleEllipsize('abcdefghijklmnopqrst', 110, 10, mono)).toBe(`abcde${ELLIPSIS}pqrst`)
    // odd room: the tail rounds down, the head takes the spare character
    expect(middleEllipsize('abcdefghijklmnopqrst', 120, 10, mono)).toBe(`abcdef${ELLIPSIS}pqrst`)
  })

  it('never returns more than fits', () => {
    for (let avail = 0; avail <= 200; avail += 7) {
      const out = middleEllipsize('S01E01 - Departure - Mar 8, 2022', avail, 10, mono)
      if (out !== ELLIPSIS) expect(Array.from(out).length * 10).toBeLessThanOrEqual(Math.max(avail, 10))
    }
  })

  it('shows only the ellipsis when nothing else fits', () => {
    expect(middleEllipsize('abcdef', 10, 10, mono)).toBe(ELLIPSIS)
    expect(middleEllipsize('abcdef', 5, 10, mono)).toBe(ELLIPSIS)
  })

  it('does not split surrogate pairs', () => {
    const text = '😀😀😀😀😀😀😀😀'
    const out = middleEllipsize(text, 50, 10, mono)
    expect(out).toBe(`😀😀${ELLIPSIS}😀😀`)
  })

  it('uses the measured widths, not the character count', () => {
    // wide head characters, narrow tail characters
    const widths = [30, 30, 30, 30, 5, 5, 5, 5]
    const width = (s: number, e: number) => widths.slice(s, e).reduce((a, b) => a + b, 0)
    // avail 80, ellipsis 10: room 70, tail fits 4 narrow (20 <= 35), head gets 50 -> one wide character
    expect(middleEllipsize('ABCDwxyz', 80, 10, width)).toBe(`A${ELLIPSIS}wxyz`)
  })
})
