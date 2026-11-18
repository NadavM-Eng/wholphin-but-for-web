import type { BaseItemDto, MediaSourceInfo, MediaStream } from '@jellyfin/sdk/lib/generated-client/models'
import { describe, expect, it } from 'vitest'
import { TrackIndex } from '../../playback/engine/streamChoice'
import { testT as t, ud } from '../../common/testT'
import { playlistMediaType } from '../playlist/playlistModel'
import { gridSortParams } from '../../browse/model/sort'
import { directorNames, genreText, personDates, personRole, yearsBetween } from './detailText'
import { groupExtras } from './extras'
import { entryIdFor } from './playlists'
import { trackEntries, versionEntries } from './streamChooser'
import { computeChosenStreams, hasSavedChoices, languageName, streamChips, streamDisplayTitle } from './streams'
import { sortedListDeps } from './sortOptions'
import { remoteTrailers } from './trailers'

const stream = (s: Partial<MediaStream>): MediaStream => ({ ...s }) as MediaStream

const video = stream({ Type: 'Video', Index: 0, Width: 1920, Height: 1080, Codec: 'h264', VideoRange: 'SDR' })
const aEn = stream({ Type: 'Audio', Index: 1, Language: 'eng', Codec: 'aac', ChannelLayout: 'stereo', IsDefault: true })
const aFr = stream({ Type: 'Audio', Index: 2, Language: 'fre', Codec: 'ac3', ChannelLayout: '5.1' })
const sEn = stream({ Type: 'Subtitle', Index: 3, Language: 'eng', Codec: 'subrip' })
const sForced = stream({ Type: 'Subtitle', Index: 4, Language: 'eng', Codec: 'subrip', IsForced: true, IsExternal: true, Title: 'Forced' })

const source = (id: string, streams: MediaStream[], extra: Partial<MediaSourceInfo> = {}): MediaSourceInfo => ({ Id: id, MediaStreams: streams, ...extra })

const movie: BaseItemDto = {
  Id: 'm1',
  Type: 'Movie',
  Name: 'Movie',
  MediaSourceCount: 2,
  MediaSources: [
    source('low', [{ ...video, Width: 640, Height: 360 }, aEn], { Name: '360p', Bitrate: 1_260_000, RunTimeTicks: 11 * 60 * 10_000_000 }),
    source('high', [video, aEn, aFr, sEn, sForced], { Name: '1080p', Bitrate: 8_000_000, RunTimeTicks: 11 * 60 * 10_000_000 }),
  ],
}

describe('streams', () => {
  it('languageName: Unknown for missing / und, display name otherwise', () => {
    expect(languageName(t, null, 'en')).toBe('Unknown')
    expect(languageName(t, 'und', 'en')).toBe('Unknown')
    expect(languageName(t, 'eng', 'en')).toBe('English')
    expect(languageName(t, 'fre', 'en')).toBe('French')
  })

  it('streamDisplayTitle joins language, codec, layout and flags', () => {
    expect(streamDisplayTitle(t, aEn, true, 'en')).toBe('English AAC stereo (Default)')
    expect(streamDisplayTitle(t, aFr, false, 'en')).toBe('French DD 5.1')
    expect(streamDisplayTitle(t, sForced, true, 'en')).toBe('English SRT (Forced, External)')
  })

  it('chooses the highest resolution source by default and builds the chips', () => {
    const c = computeChosenStreams(movie, null, [], [], null, null)
    expect(c?.source.Id).toBe('high')
    const chips = streamChips(t, c, 2, 'en')
    expect(chips.map((x) => x.text)).toEqual(['1080p', 'H264', 'English AAC stereo', expect.any(String)])
    expect(chips[0].count).toBe(2)
    expect(chips[2].count).toBe(2)
    expect(hasSavedChoices(c)).toBe(false)
  })

  it('a remembered version and disabled subtitles show "None (+n)"', () => {
    const c = computeChosenStreams(movie, { itemId: 'm1', sourceId: 'high', audioIndex: 2, subtitleIndex: TrackIndex.DISABLED }, [], [], null, null)
    expect(c?.audio.stream?.Index).toBe(2)
    expect(c?.subtitle.stream).toBeNull()
    const sub = streamChips(t, c, 2, 'en').find((x) => x.key === 'subtitle')
    expect(sub).toMatchObject({ text: 'None', count: 2, disabled: true })
    expect(hasSavedChoices(c)).toBe(true)
  })

  it('no subtitle chip without subtitle streams; audio "None" without audio', () => {
    const item: BaseItemDto = { Id: 'x', MediaSources: [source('a', [video])] }
    const chips = streamChips(t, computeChosenStreams(item, null, [], [], null, null), 0, 'en')
    expect(chips.map((c) => c.key)).toEqual(['video', 'codec', 'audio'])
    expect(chips[2].text).toBe('None')
  })
})

describe('stream choosers', () => {
  it('version list marks the chosen source and shows video title, bitrate and runtime', () => {
    const items = versionEntries(t, movie.MediaSources ?? [], 'high', () => {}, 'en')
    expect(items).toHaveLength(2)
    expect(items[1]).toMatchObject({ headline: '1080p', selected: true, trailing: '11m', supporting: '8.00 mbps' })
  })

  it('subtitle list starts with None, Only forced and a divider', () => {
    const c = computeChosenStreams(movie, { itemId: 'm1', sourceId: 'high', audioIndex: -1, subtitleIndex: TrackIndex.ONLY_FORCED }, [], [], null, null)
    if (!c) throw new Error('no streams')
    const items = trackEntries(t, 'subtitles', c, 'eng', () => {}, 'en')
    expect(items.map((i) => ('headline' in i ? i.headline : 'divider'))).toEqual(['None', 'Only Forced Subtitles', 'divider', 'English SRT', 'Forced'])
    // the saved ONLY_FORCED choice is marked (upstream never marks it)
    expect(items[1]).toMatchObject({ key: 'forced' })
    const forced = items[4]
    expect('selected' in forced && forced.selected).toBe(true)
  })

  it('every chooser row is a two-line item, as upstream always passes supportingContent', () => {
    const c = computeChosenStreams(movie, null, [], [], null, null)
    if (!c) throw new Error('no streams')
    const rows = [...trackEntries(t, 'subtitles', c, null, () => {}, 'en'), ...trackEntries(t, 'audio', c, null, () => {}, 'en'), ...versionEntries(t, movie.MediaSources ?? [], null, () => {}, 'en')]
    const items = rows.filter((r) => 'headline' in r)
    expect(items.length).toBeGreaterThan(4)
    // ListItem counts a row as two-line when `supporting` is truthy (None, Only forced and untitled streams included)
    for (const r of items) expect('supporting' in r && !!r.supporting).toBe(true)
  })
})

describe('detail text', () => {
  it('genreText keeps 4 and counts the rest', () => {
    expect(genreText(['A', 'B'])).toBe('A, B')
    expect(genreText(['A', 'B', 'C', 'D', 'E', 'F'])).toBe('A, B, C, D, +2')
    expect(genreText([])).toBeNull()
  })

  it('directorNames joins all non-blank directors', () => {
    expect(directorNames({ People: [{ Name: 'A', Type: 'Director' }, { Name: ' ', Type: 'Director' }, { Name: 'B', Type: 'Actor' }, { Name: 'C', Type: 'Director' }] })).toBe('A, C')
    expect(directorNames({ People: [] })).toBeNull()
  })

  it('personRole follows Person.kt', () => {
    expect(personRole(t, 'Frank', 'Actor')).toBe('Frank')
    expect(personRole(t, 'Director', 'Director')).toBe('Director')
    expect(personRole(t, 'Screenplay', 'Writer')).toBe('Screenplay - Writer')
    expect(personRole(t, 'Executive Producer', 'Producer')).toBe('Executive Producer')
    expect(personRole(t, null, 'Producer')).toBe('Producer')
    expect(personRole(t, 'Guest Star', 'GuestStar')).toBe('Guest Star')
  })

  it('ages in whole years', () => {
    expect(yearsBetween('1960-03-20T00:00:00Z', '2026-03-19')).toBe(65)
    expect(yearsBetween('1960-03-20T00:00:00Z', '2026-03-20')).toBe(66)
    const d = personDates(t, { PremiereDate: '1960-03-20T00:00:00.0000000Z' }, new Date(2026, 10, 17), 'en')
    expect(d.born).toBe('Born: Mar 20, 1960 (66 years old)')
    expect(d.died).toBeNull()
    const dead = personDates(t, { PremiereDate: '1950-01-02T00:00:00Z', EndDate: '2020-01-01T00:00:00Z' }, new Date(2026, 0, 1), 'en')
    expect(dead.born).toBe('Born: Jan 2, 1950')
    expect(dead.died).toBe('Died: Jan 1, 2020 (69 years old)')
  })
})

describe('extras', () => {
  it('groups by type, drops trailers/theme media, orders by type', () => {
    const f = (id: string, ExtraType: BaseItemDto['ExtraType'], Name?: string, played = false): BaseItemDto => ({ Id: id, ExtraType, Name, UserData: ud({ Played: played }) })
    const out = groupExtras(t, [f('1', 'Trailer', 'T'), f('2', 'BehindTheScenes', 'Making of'), f('3', 'Featurette', '', true), f('4', 'Unknown', 'a', true), f('5', 'Unknown', 'b', true), f('6', 'ThemeSong')], () => 0)
    expect(out.map((e) => e.type)).toEqual(['Featurette', 'BehindTheScenes', 'Unknown'])
    expect(out[0]).toMatchObject({ kind: 'single', title: 'Featurette', subtitle: null })
    expect(out[1]).toMatchObject({ kind: 'single', title: 'Making of', subtitle: 'Behind the scenes' })
    expect(out[2]).toMatchObject({ kind: 'group', title: 'Other', subtitle: '2 items', played: true })
  })
})

describe('trailers', () => {
  it('official first, teasers last, YouTube subtitle', () => {
    const r = remoteTrailers(
      {
        RemoteTrailers: [
          { Name: 'Teaser Trailer', Url: 'https://www.youtube.com/watch?v=1' },
          { Name: 'Clip', Url: 'https://example.com/c' },
          { Name: 'Official Trailer', Url: 'https://youtube.com/watch?v=2' },
          { Url: 'https://vimeo.com/3' },
        ],
      },
      'Trailer',
    )
    expect(r.map((x) => x.name)).toEqual(['Official Trailer', 'Trailer', 'Clip', 'Teaser Trailer'])
    expect(r[0]).toMatchObject({ kind: 'remote', subtitle: 'YouTube' })
    expect(r[1]).toMatchObject({ subtitle: null })
  })
})

describe('playlist', () => {
  it('media type from the server, else a single kind among <= 50 items', () => {
    expect(playlistMediaType('Audio', 3, [])).toBe('Audio')
    expect(playlistMediaType('Unknown', 2, [{ Type: 'Movie' }, { Type: 'Episode' }])).toBe('Video')
    expect(playlistMediaType(undefined, 2, [{ Type: 'Movie' }, { Type: 'Audio' }])).toBe('Unknown')
    expect(playlistMediaType(undefined, 51, [{ Type: 'Movie' }])).toBe('Unknown')
  })

  it('sort (the library grid request without a collection type): Default sends none, others add SortName', () => {
    expect(gridSortParams({ sort: 'Default', direction: 'Descending' }, null)).toEqual({})
    expect(gridSortParams({ sort: 'SortName', direction: 'Descending' }, null)).toEqual({ sortBy: ['SortName'], sortOrder: ['Descending'] })
    expect(gridSortParams({ sort: 'Runtime', direction: 'Descending' }, null)).toEqual({ sortBy: ['Runtime', 'SortName'], sortOrder: ['Descending', 'Ascending'] })
  })

  it('entry ids: same index in playlist order, else the first entry of the item', () => {
    const entries = [
      { id: 'a', entryId: 'e1' },
      { id: 'b', entryId: 'e2' },
      { id: 'a', entryId: 'e3' },
    ]
    expect(entryIdFor(entries, { Id: 'a' }, 2, true)).toBe('e3')
    expect(entryIdFor(entries, { Id: 'a' }, 0, false)).toBe('e1')
    expect(entryIdFor(entries, { Id: 'a', PlaylistItemId: 'x' }, 0, true)).toBe('x')
    expect(entryIdFor(undefined, { Id: 'z' }, 0, true)).toBe('z')
  })
})

describe('sortedListDeps', () => {
  it('refetches on watched changes only when the sort depends on them', () => {
    expect(sortedListDeps('SortName')).toEqual(['deleted'])
    expect(sortedListDeps('Random')).toEqual(['deleted'])
    expect(sortedListDeps('DatePlayed')).toEqual(['played', 'deleted'])
    expect(sortedListDeps('PlayCount')).toEqual(['played', 'deleted'])
  })
})
