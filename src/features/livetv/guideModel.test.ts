import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { describe, expect, it } from 'vitest'
import { testT } from '../common/testT'
import {
  buildGuideTimes,
  hoursBetween,
  mapPrograms,
  MAX_HOURS,
  programAtHour,
  programCategory,
  programSubtitle,
  quickDetails,
  roundDownToHalfHour,
  timelineSpan,
  verticalTarget,
  windowToFetch,
  type TvProgram,
} from './guideModel'

const H = 3_600_000
const local = (h: number, m = 0) => new Date(2026, 10, 17, h, m, 0, 0).getTime()

function dto(id: string, channelId: string, start: number, end: number, extra: Partial<BaseItemDto> = {}): BaseItemDto {
  return {
    Id: id,
    ChannelId: channelId,
    Name: id,
    StartDate: new Date(start).toISOString(),
    EndDate: new Date(end).toISOString(),
    RunTimeTicks: (end - start) * 10_000,
    ...extra,
  }
}

describe('guide time window', () => {
  it('rounds down to the half hour', () => {
    expect(roundDownToHalfHour(local(20, 17) + 42_000)).toBe(local(20, 0))
    expect(roundDownToHalfHour(local(20, 47))).toBe(local(20, 30))
  })

  it('builds 48 labels from :00 and 49 from :30 (first cell 30 min wide)', () => {
    const a = buildGuideTimes(local(20, 10))
    expect(a.length).toBe(MAX_HOURS)
    expect(a[0]).toBe(local(20, 0))
    expect(a[1]).toBe(local(21, 0))
    const b = buildGuideTimes(local(20, 40))
    expect(b.length).toBe(MAX_HOURS + 1)
    expect(b[1]).toBe(local(21, 0))
    expect(timelineSpan(b, 0)).toEqual({ startHour: 0, endHour: 0.5 })
    expect(timelineSpan(b, b.length - 1).endHour).toBe(48.5)
  })

  it('hoursBetween truncates to seconds', () => {
    expect(hoursBetween(0, 90 * 60_000 + 999)).toBe(1.5)
  })
})

describe('program mapping', () => {
  const g = local(20, 0)

  it('maps categories with kids > movie > news > sports precedence', () => {
    expect(programCategory({ IsKids: true, IsMovie: true })).toBe('KIDS')
    expect(programCategory({ IsMovie: true, IsNews: true })).toBe('MOVIE')
    expect(programCategory({ IsNews: true, IsSports: true })).toBe('NEWS')
    expect(programCategory({ IsSports: true })).toBe('SPORTS')
    expect(programCategory({})).toBeNull()
  })

  it('fills leading, middle and trailing gaps and drops programs that already ended', () => {
    const map = mapPrograms(
      [
        dto('old', 'c1', g - 2 * H, g - H),
        dto('a', 'c1', g + 1.5 * H, g + 2 * H),
        dto('b', 'c1', g + 3.25 * H, g + 4 * H),
      ],
      g,
      ['c1'],
      'No data',
    )
    const list = map.get('c1')!
    expect(list.some((p) => p.id === 'old')).toBe(false)
    const spans = list.slice(0, 6).map((p) => [p.startHours, p.endHours, p.category === 'FAKE'])
    expect(spans).toEqual([
      [0, 1, true],
      [1, 1.5, true],
      [1.5, 2, false],
      [2, 3, true],
      [3, 3.25, true],
      [3.25, 4, false],
    ])
    // trailing: 4 -> 5 then hourly up to 48
    expect(list[6].startHours).toBe(4)
    expect(list[6].endHours).toBe(5)
    expect(list[list.length - 1].endHours).toBe(MAX_HOURS)
  })

  it('clamps a program that started before the guide to 0 and keeps its real start', () => {
    const map = mapPrograms([dto('a', 'c1', g - 0.5 * H, g + 0.5 * H)], g, ['c1'], 'No data')
    const p = map.get('c1')![0]
    expect(p.startHours).toBe(0)
    expect(p.endHours).toBe(0.5)
    expect(p.start).toBe(g - 0.5 * H)
  })

  it('gives channels without programs 48 one-hour fillers and guards missing fields', () => {
    const map = mapPrograms([{ Id: 'x', Name: 'no channel', StartDate: new Date(g).toISOString(), EndDate: new Date(g + H).toISOString() }], g, ['c2'], 'No data')
    expect(map.get('c2')!.length).toBe(48)
    expect(map.get('c2')!.every((p) => p.name === 'No data')).toBe(true)
  })

  it('collapses whitespace and uses the series name and episode title only for series', () => {
    const map = mapPrograms(
      [
        dto('a', 'c1', g, g + H, { SeriesName: 'Big\n  Show', EpisodeTitle: 'Pilot\tone', IsSeries: true, ParentIndexNumber: 1, IndexNumber: 2 }),
        dto('b', 'c2', g, g + H, { Name: 'Film', EpisodeTitle: 'ignored' }),
      ],
      g,
      ['c1', 'c2'],
      'No data',
    )
    const a = map.get('c1')![0]
    expect(a.name).toBe('Big Show')
    expect(a.subtitle).toBe('Pilot one')
    expect(programSubtitle(a, testT)).toContain(' - Pilot one')
    expect(map.get('c2')![0].subtitle).toBeNull()
  })

  it('marks recordings from non-blank timer ids', () => {
    const map = mapPrograms([dto('a', 'c1', g, g + H, { TimerId: 't1', SeriesTimerId: ' ' })], g, ['c1'], 'No data')
    expect(map.get('c1')![0].isRecording).toBe(true)
    expect(map.get('c1')![0].isSeriesRecording).toBe(false)
  })
})

describe('paging window (onFocusChannel)', () => {
  it('does nothing while the focused row is well inside the fetched window', () => {
    expect(windowToFetch(10, 500, { first: 0, last: 99 })).toBeNull()
  })
  it('fetches row +/- 100 when focus leaves the window', () => {
    expect(windowToFetch(150, 500, { first: 0, last: 99 })).toEqual({ first: 50, last: 249 })
  })
  it('refetches after a jump to the other end of a long list (upstream left those rows empty)', () => {
    expect(windowToFetch(0, 300, { first: 160, last: 299 })).toEqual({ first: 0, last: 99 })
    expect(windowToFetch(295, 300, { first: 0, last: 99 })).toEqual({ first: 195, last: 299 })
  })
  it('never refetches for small channel lists', () => {
    expect(windowToFetch(3, 4, { first: 0, last: 3 })).toBeNull()
    expect(windowToFetch(60, 120, { first: 0, last: 99 })).toBeNull()
  })
})

describe('focus helpers', () => {
  const mk = (s: number, e: number): TvProgram => ({ ...mapPrograms([], 0, ['c'], 'x').get('c')![0], startHours: s, endHours: e })
  const row = [mk(0, 1), mk(1, 1.5), mk(1.5, 3), mk(3, 4)]
  it('finds the program at an hour', () => {
    expect(programAtHour(row, 0.2)).toBe(0)
    expect(programAtHour(row, 1.5)).toBe(2)
    expect(programAtHour(row, 10)).toBe(3)
  })
  it('picks the overlapping program with the closest centre', () => {
    expect(verticalTarget(row, { start: 1, end: 2 })).toBe(1)
    expect(verticalTarget(row, { start: 1.6, end: 2.6 })).toBe(2)
    expect(verticalTarget(row, { start: 0, end: 0.5 })).toBe(0)
  })
})

describe('quick details', () => {
  it('shows only the time range for fillers, and duration / time left / rating for real programs', () => {
    const g = local(20, 0)
    const map = mapPrograms([dto('a', 'c1', g, g + H, { OfficialRating: 'TV-PG' })], g, ['c1'], 'No data')
    const real = map.get('c1')![0]
    const parts = quickDetails(real, g + 15 * 60_000, testT, 'en-US')
    expect(parts.length).toBe(4)
    expect(parts[3]).toBe('TV-PG')
    const fake = map.get('c1')![1]
    expect(quickDetails(fake, g, testT, 'en-US').length).toBe(1)
  })
})
