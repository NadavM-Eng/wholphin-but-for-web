import { describe, expect, it } from 'vitest'
import { currentLyricIndex, hasLyricLines, lyricText } from './lyricsModel'

const s = (sec: number) => sec * 10_000_000

describe('lyrics', () => {
  const lyrics = {
    Lyrics: [
      { Text: 'one', Start: s(1) },
      { Text: '', Start: s(3) },
      { Text: 'three', Start: s(5) },
    ],
  }

  it('current line = last line started (position + offset)', () => {
    expect(currentLyricIndex(lyrics, 0)).toBeNull()
    expect(currentLyricIndex(lyrics, 1000)).toBe(0)
    expect(currentLyricIndex(lyrics, 4000)).toBe(1)
    expect(currentLyricIndex(lyrics, 9000)).toBe(2)
    expect(currentLyricIndex({ ...lyrics, Metadata: { Offset: s(2) } }, 3000)).toBe(2)
  })

  it('unsynced lyrics never highlight', () => {
    expect(currentLyricIndex({ Lyrics: [{ Text: 'a' }, { Text: 'b' }] }, 5000)).toBeNull()
  })

  it('blank lines keep their height; empty lyrics hide the pane', () => {
    expect(lyricText('')).toHaveLength(16)
    expect(lyricText('x')).toBe('x')
    expect(hasLyricLines({ Lyrics: [] })).toBe(false)
    expect(hasLyricLines(null)).toBe(false)
    expect(hasLyricLines(lyrics)).toBe(true)
  })
})
