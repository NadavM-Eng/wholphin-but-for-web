import { describe, expect, it } from 'vitest'
import en from '../i18n/locales/en.json'
import {
  abbreviateNumber,
  formatAudioCodec,
  formatBitrate,
  formatBytes,
  formatClock,
  formatCommunityRating,
  formatCriticRating,
  formatDate,
  formatDuration,
  formatEndsAt,
  formatMaxBitrate,
  formatRuntime,
  formatSeasonEpisode,
  formatSubtitleCodec,
  formatTimeLeft,
  formatVideoRange,
  msToTicks,
  resolutionString,
  roundMinutesMs,
  seriesProductionYears,
  ticksToMs,
  timeRemainingTicks,
  type Translate,
} from './format'

const strings = en as Record<string, string | string[]>
/** Minimal interpolating t() over the generated English strings. */
const t: Translate = (key, opts = {}) => {
  const s = strings[key]
  if (typeof s !== 'string') return key
  return s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(opts[k]))
}
const min = 60_000
const hour = 60 * min

describe('durations', () => {
  it('converts ticks', () => {
    expect(ticksToMs(10_000_000)).toBe(1000)
    expect(msToTicks(1000)).toBe(10_000_000)
  })
  it('rounds minutes like Duration.roundMinutes', () => {
    expect(roundMinutesMs(2 * hour + 3 * min + 40_000)).toBe(2 * hour + 4 * min)
    expect(roundMinutesMs(29_000)).toBe(0)
    expect(roundMinutesMs(30_000)).toBe(min)
  })
  it('formats durations', () => {
    expect(formatDuration(t, 90 * min)).toBe('1h 30m')
    expect(formatDuration(t, 45 * min)).toBe('45m')
    expect(formatDuration(t, 2 * hour)).toBe('2h')
    expect(formatDuration(t, hour + 5_000)).toBe('1h 5s')
    expect(formatDuration(t, hour + min + 1_000)).toBe('1h 1m 1s')
    expect(formatDuration(t, 61_000)).toBe('1m 1s')
    expect(formatDuration(t, 5_000)).toBe('5s')
  })
  it('formats runtime and time left', () => {
    expect(formatRuntime(t, msToTicks(2 * hour + 3 * min + 40_000))).toBe('2h 4m')
    expect(formatRuntime(t, msToTicks(10_000))).toBeNull()
    expect(formatRuntime(t, null)).toBeNull()
    expect(formatTimeLeft(t, msToTicks(30 * min))).toBe('30m left')
    expect(timeRemainingTicks(1000, 400)).toBe(600)
    expect(timeRemainingTicks(1000, 0)).toBeNull()
  })
  it('formats ends at', () => {
    const now = new Date(2024, 0, 1, 10, 0).getTime()
    expect(formatEndsAt(t, now, msToTicks(90 * min), 'en-GB')).toBe('Ends at 11:30')
  })
  it('formats a player clock', () => {
    expect(formatClock(3_723_000)).toBe('1:02:03')
    expect(formatClock(123_000)).toBe('2:03')
  })
})

describe('dates and labels', () => {
  it('formats date-only values without a timezone shift', () => {
    expect(formatDate('2000-08-24T00:00:00.0000000Z', 'en-US')).toBe('Aug 24, 2000')
    expect(formatDate(null)).toBeNull()
  })
  it('formats season/episode labels', () => {
    expect(formatSeasonEpisode(t, 2, 5)).toBe('S2 E5')
    expect(formatSeasonEpisode(t, 2, 5, 6)).toBe('S2 E5-E6')
    expect(formatSeasonEpisode(t, 2, 5, null, true)).toBe('S02E05')
    expect(formatSeasonEpisode(t, 2, 5, 7, true)).toBe('S02E05-E07')
    expect(formatSeasonEpisode(t, null, 5)).toBeNull()
  })
  it('formats series production years', () => {
    expect(seriesProductionYears(t, { ProductionYear: 2010, Status: 'Continuing' })).toBe('2010 - Present')
    expect(seriesProductionYears(t, { ProductionYear: 2010, Status: 'Ended', EndDate: '2015-05-01T00:00:00Z' })).toBe(
      '2010 - 2015',
    )
    expect(seriesProductionYears(t, { ProductionYear: 2010, Status: 'Ended', EndDate: '2010-12-01T00:00:00Z' })).toBe('2010')
    expect(seriesProductionYears(t, {})).toBeNull()
  })
})

describe('numbers', () => {
  it('abbreviates', () => {
    expect(abbreviateNumber(999)).toBe('999')
    expect(abbreviateNumber(5533, 'en')).toBe('5.5K')
    expect(abbreviateNumber(2_500_000, 'en')).toBe('2.5M')
  })
  it('formats bytes and bitrates', () => {
    expect(formatBytes(1536, undefined, 1024, 'en')).toBe('1.50 KiB')
    expect(formatBitrate(8_000_000, 'en')).toBe('8.00 mbps')
    expect(formatMaxBitrate(512_000)).toBe('500 kbps')
    expect(formatMaxBitrate(104_857_600)).toBe('100 Mbps')
  })
  it('formats ratings', () => {
    expect(formatCommunityRating(7.45, 'en')).toBe('7.5')
    expect(formatCriticRating(87.9)).toBe('87%')
  })
})

describe('streams', () => {
  it('builds resolution strings', () => {
    expect(resolutionString(3840, 2160, false)).toBe('4K')
    expect(resolutionString(1920, 1080, false)).toBe('1080p')
    expect(resolutionString(1920, 800, false)).toBe('1080p')
    expect(resolutionString(1280, 720, true)).toBe('720i')
    expect(resolutionString(1080, 1920, false)).toBe('1080p')
    expect(resolutionString(200, 100, false)).toBe('100p')
  })
  it('formats video ranges', () => {
    expect(formatVideoRange(t, 'SDR', 'SDR', null)).toBeNull()
    expect(formatVideoRange(t, 'HDR', 'HDR10Plus', null)).toBe('HDR10+')
    expect(formatVideoRange(t, 'HDR', 'DOVIWithHDR10', null)).toBe('Dolby Vision')
    expect(formatVideoRange(t, 'HDR', 'HDR10', 'DV Profile 8')).toBe('Dolby Vision')
  })
  it('formats codecs', () => {
    expect(formatAudioCodec(t, 'truehd', 'Dolby TrueHD + Dolby Atmos')).toBe('Dolby Atmos')
    expect(formatAudioCodec(t, 'dts', 'DTS-HD MA')).toBe('DTS:HD MA')
    expect(formatAudioCodec(t, 'eac3', null)).toBe('DD+')
    expect(formatAudioCodec(t, 'opus', null)).toBe('Opus')
    expect(formatAudioCodec(t, 'aac', null)).toBe('AAC')
    expect(formatAudioCodec(t, null, null)).toBeNull()
    expect(formatSubtitleCodec('subrip')).toBe('SRT')
    expect(formatSubtitleCodec('ass')).toBe('ASS')
  })
})
