import { describe, expect, it } from 'vitest'
import { dashedId, keepInNextUp, localDateTimeNow, parseRemovedNextUp, serializeRemovedNextUp } from './displayPreferences'
import { mapItemsDeep } from './itemCache'
import { ud } from './testT'

describe('removed from next up', () => {
  const json = '{"value":{"418ca0e3-2d36-940a-2b2c-5525fe7947a0":"2026-11-17T15:19:25.560"}}'

  it('parses the Android format and writes it back with dashed ids', () => {
    const map = parseRemovedNextUp(json)
    expect(map).toEqual({ '418ca0e32d36940a2b2c5525fe7947a0': '2026-11-17T15:19:25.560' })
    expect(serializeRemovedNextUp(map)).toBe(json)
    expect(parseRemovedNextUp('not json')).toEqual({})
    expect(dashedId('418ca0e32d36940a2b2c5525fe7947a0')).toBe('418ca0e3-2d36-940a-2b2c-5525fe7947a0')
  })

  it('hides a removed series until it is played after the removal', () => {
    const removed = { s1: localDateTimeNow(new Date(2026, 10, 17, 12, 0, 0)) }
    const ep = (lastPlayed?: string) => ({ Id: 'e', Type: 'Episode' as const, SeriesId: 's1', UserData: ud({ LastPlayedDate: lastPlayed }) })
    expect(keepInNextUp(ep(), removed)).toBe(false)
    expect(keepInNextUp(ep(new Date(2026, 10, 17, 11, 0).toISOString()), removed)).toBe(false)
    expect(keepInNextUp(ep(new Date(2026, 10, 17, 13, 0).toISOString()), removed)).toBe(true)
    expect(keepInNextUp({ Id: 'x', Type: 'Episode', SeriesId: 'other' }, removed)).toBe(true)
  })
})

describe('mapItemsDeep', () => {
  it('patches items in lists, query results and infinite pages, keeping untouched references', () => {
    const data = {
      pages: [{ items: [{ Id: 'a', Type: 'Movie' }, { Id: 'b', Type: 'Movie' }] }],
      other: { Items: [{ Id: 'c', Type: 'Movie' }] },
    }
    const out = mapItemsDeep(data, 'b', (i) => ({ ...i, Name: 'patched' })) as typeof data
    expect(out.pages[0].items[1]).toEqual({ Id: 'b', Type: 'Movie', Name: 'patched' })
    expect(out.pages[0].items[0]).toBe(data.pages[0].items[0])
    expect(out.other).toBe(data.other)
    const removed = mapItemsDeep(data, 'a', () => null) as typeof data
    expect(removed.pages[0].items.map((i) => i.Id)).toEqual(['b'])
    expect(mapItemsDeep(data, 'zzz', () => null)).toBe(data)
  })
})
