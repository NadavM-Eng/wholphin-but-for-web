import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { describe, expect, it } from 'vitest'
import {
  cardFallbackName,
  headerSubtitle,
  headerTitle,
  itemSubtitle,
  itemTitle,
  quickDetailsBasic,
  quickDetailsFor,
  remainingOrRuntimeTicks,
  remainingTicks,
  unplayedCornerText,
} from './itemText'
import { testT as t, ud } from './testT'

const MIN = 60 * 10_000_000

const episode: BaseItemDto = {
  Id: 'e',
  Type: 'Episode',
  Name: 'The Cockatoo',
  SeriesName: 'The Bakery on Elm Street',
  SeriesId: 's',
  ParentIndexNumber: 1,
  IndexNumber: 3,
  PremiereDate: '2020-03-22T00:00:00.0000000Z',
  RunTimeTicks: 42 * MIN,
  UserData: ud({ PlaybackPositionTicks: 24 * MIN, Played: false }),
}

describe('titles', () => {
  it('episodes use the series name as title and "S1 E3 - name" as subtitle', () => {
    expect(itemTitle(episode)).toBe('The Bakery on Elm Street')
    expect(itemSubtitle(t, episode)).toBe('S1 E3 - The Cockatoo')
    expect(headerTitle(episode)).toBe('The Bakery on Elm Street')
    expect(headerSubtitle(episode)).toBe('The Cockatoo')
    expect(cardFallbackName(episode)).toBe('The Bakery on Elm Street')
  })

  it('series years, albums, songs, movies', () => {
    expect(itemSubtitle(t, { Type: 'Series', ProductionYear: 2010, Status: 'Continuing' })).toBe('2010 - Present')
    expect(itemSubtitle(t, { Type: 'MusicAlbum', Artists: ['A', 'B'], ProductionYear: 1999 })).toBe('A, B - 1999')
    expect(itemSubtitle(t, { Type: 'Audio', Album: 'Al', Artists: ['A'] })).toBe('Al - A')
    expect(itemSubtitle(t, { Type: 'Movie', ProductionYear: 2013 })).toBe('2013')
    expect(headerSubtitle({ Type: 'Movie', Name: 'x' })).toBeNull()
  })
})

describe('time remaining', () => {
  it('only when position > 0 and before the end', () => {
    expect(remainingTicks(episode)).toBe(18 * MIN)
    expect(remainingTicks({ ...episode, UserData: ud({ PlaybackPositionTicks: 0 }) })).toBeNull()
    expect(remainingTicks({ ...episode, UserData: ud({ PlaybackPositionTicks: 50 * MIN }) })).toBeNull()
    expect(remainingOrRuntimeTicks({ ...episode, UserData: ud({}) })).toBe(42 * MIN)
    expect(remainingOrRuntimeTicks({ Type: 'Program', RunTimeTicks: 5 })).toBeNull()
  })
})

describe('quick details', () => {
  it('episode: S/E, date, runtime, time left', () => {
    expect(quickDetailsBasic(t, episode, 'en-US')).toEqual(['S1 E3', 'Mar 22, 2020', '42m', '18m left'])
  })

  it('season / box set / program', () => {
    expect(quickDetailsBasic(t, { Type: 'Season', ChildCount: 6, ProductionYear: 2022 })).toEqual(['6 Episodes', '2022'])
    expect(quickDetailsBasic(t, { Type: 'BoxSet', ChildCount: 3, ProductionYear: 2001 })).toEqual(['2001', '3 items'])
    expect(quickDetailsBasic(t, { Type: 'Program', ChannelName: 'Movie Zoo', RunTimeTicks: 30 * MIN })).toEqual(['Movie Zoo', '30m'])
  })

  it('applies display toggles and ends-at', () => {
    const movie: BaseItemDto = { Type: 'Movie', ProductionYear: 2013, RunTimeTicks: 2 * MIN, OfficialRating: 'PG', CommunityRating: 7.4, CriticRating: 80 }
    const now = Date.UTC(2026, 0, 1, 12, 0)
    const all = quickDetailsFor(t, movie, { toggles: ['OFFICIAL_RATING', 'COMMUNITY_RATING', 'CRITIC_RATING'], nowMs: now, locale: 'en-US' })
    expect(all).toMatchObject({ parts: ['2013', '2m'], officialRating: 'PG', communityRating: 7.4, criticRating: 80 })
    expect(all.endsAt).toMatch(/^Ends at /)
    const none = quickDetailsFor(t, movie, { toggles: [], nowMs: now })
    expect(none).toMatchObject({ officialRating: null, communityRating: null, criticRating: null })
  })
})

describe('corner text', () => {
  it('episode number or abbreviated unplayed count', () => {
    expect(unplayedCornerText(t, episode)).toBe('E3')
    expect(unplayedCornerText(t, { Type: 'Series', UserData: ud({ UnplayedItemCount: 5533 }) }, 'en-US')).toBe('5.5K')
    expect(unplayedCornerText(t, { Type: 'Series', UserData: ud({ UnplayedItemCount: 0 }) })).toBeNull()
    expect(unplayedCornerText(t, { Type: 'Movie' })).toBeNull()
  })
})
