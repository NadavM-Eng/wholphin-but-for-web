import { describe, expect, it } from 'vitest'
import { PLAYBACK_SPEEDS } from '../engine'
import { HoldSeek } from './holdSeek'
import { shortcutFor, stepSpeed } from './keymap'
import { episodeLine, itemSubtitleLong, itemTitle, kotlinDuration, speedLabel, streamLabels } from './text'

const t = (key: string, o?: Record<string, unknown>) => {
  if (key === 'season_episode_number') return `S${o?.p1} E${o?.p2}`
  if (key === 'season_episode_number_padded') return `S${o?.p1}E${o?.p2}`
  if (key === 'unknown') return 'Unknown'
  if (key === 'default_track') return 'Default'
  return key
}

describe('HoldSeek (PlaybackKeyHandler.handleHoldSkip)', () => {
  it('a tap seeks once on key up', () => {
    const h = new HoldSeek()
    expect(h.keyDown(1, false, 0, 600_000)).toBeNull()
    expect(h.keyUp(1)).toBe(1)
  })

  it('swallows the first 8 synthetic repeats (400 ms) with controls hidden, then seeks on repeats', () => {
    const h = new HoldSeek()
    h.keyDown(1, false, 0, 600_000)
    expect(h.keyDown(1, true, 300, 600_000)).toBeNull()
    expect(h.keyDown(1, true, 420, 600_000)).toBe(1)
    // faster than the 125 ms step cadence: dropped
    expect(h.keyDown(1, true, 500, 600_000)).toBeNull()
    expect(h.keyDown(1, true, 560, 600_000)).toBe(1)
    // a hold that seeked does not add a tap seek
    expect(h.keyUp(1)).toBeNull()
  })

  it('accelerates with the hold time (SeekAcceleration table, 60 min item)', () => {
    const h = new HoldSeek()
    h.keyDown(-1, false, 0, 60 * 60_000)
    // 400 ms start + 39 repeats x 50 ms -> s = 13 -> x2
    expect(h.keyDown(-1, true, 400 + 39 * 50, 60 * 60_000)).toBe(2)
  })

  it('the focused seek bar has no start delay', () => {
    const h = new HoldSeek(0)
    h.keyDown(1, false, 0, 60_000)
    expect(h.keyDown(1, true, 60, 60_000)).toBe(1)
  })

  it('a direction change re-arms', () => {
    const h = new HoldSeek()
    h.keyDown(1, false, 0, 60_000)
    expect(h.keyDown(-1, true, 1000, 60_000)).toBeNull()
    expect(h.keyUp(-1)).toBe(1)
  })
})

describe('shortcutFor', () => {
  it('maps the documented keys', () => {
    expect(shortcutFor({ key: ' ' })).toBe('toggle-play')
    expect(shortcutFor({ key: 'k' })).toBe('toggle-play')
    expect(shortcutFor({ key: 'j' })).toBe('seek-back')
    expect(shortcutFor({ key: 'L' })).toBe('seek-forward')
    expect(shortcutFor({ key: 'P', shiftKey: true })).toBe('previous')
    expect(shortcutFor({ key: 'p' })).toBe('pip')
    expect(shortcutFor({ key: 'MediaTrackNext' })).toBe('next')
    expect(shortcutFor({ key: '>' })).toBe('speed-up')
    expect(shortcutFor({ key: '7' })).toEqual({ percent: 70 })
    expect(shortcutFor({ key: '?' })).toBe('help')
    expect(shortcutFor({ key: 'f', ctrlKey: true })).toBeNull()
    expect(shortcutFor({ key: 'MediaPlayPause' })).toBeNull()
  })

  it('steps through the upstream speed list', () => {
    expect(stepSpeed(PLAYBACK_SPEEDS, 1, 1)).toBe(1.25)
    expect(stepSpeed(PLAYBACK_SPEEDS, 1, -1)).toBe(0.75)
    expect(stepSpeed(PLAYBACK_SPEEDS, 2, 1)).toBeNull()
    expect(stepSpeed(PLAYBACK_SPEEDS, 0.25, -1)).toBeNull()
  })
})

describe('text', () => {
  it('formats Kotlin durations', () => {
    expect(kotlinDuration(0)).toBe('0s')
    expect(kotlinDuration(250)).toBe('250ms')
    expect(kotlinDuration(-50)).toBe('-50ms')
    expect(kotlinDuration(1500)).toBe('1.5s')
    expect(kotlinDuration(-1000)).toBe('-1s')
    expect(kotlinDuration(62_500)).toBe('1m 2.5s')
  })

  it('labels speeds like upstream', () => {
    expect(speedLabel(0.25)).toBe('.25')
    expect(speedLabel(1)).toBe('1.0')
    expect(speedLabel(1.75)).toBe('1.75')
  })

  it('builds episode title lines', () => {
    const ep = { Type: 'Episode', Name: 'Departure', SeriesName: 'Orbital Drift', ParentIndexNumber: 1, IndexNumber: 1 } as const
    expect(itemTitle(ep)).toBe('Orbital Drift')
    expect(itemSubtitleLong(t, ep)).toBe('S01E01 - Departure')
    expect(episodeLine(t, { ...ep, IndexNumber: 2, Name: 'Dead Reckoning' })).toBe('S1 E2 - Dead Reckoning')
    expect(itemSubtitleLong(t, { Type: 'Movie', Name: 'X', ProductionYear: 2008 })).toBe('2008')
  })

  it('labels streams like SimpleMediaStream', () => {
    expect(streamLabels(t, { Type: 'Subtitle', Language: 'und', Codec: 'subrip', IsDefault: true })).toEqual({
      headline: 'Unknown SRT (Default)',
      supporting: null,
    })
    expect(streamLabels(t, { Type: 'Audio', Title: 'Commentary', Language: null, Codec: 'aac', ChannelLayout: 'stereo' })).toEqual({
      headline: 'Commentary',
      supporting: 'Unknown AAC stereo',
    })
  })
})
