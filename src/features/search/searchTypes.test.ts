import { describe, expect, it } from 'vitest'
import { ALL_SEARCHABLE_TYPES, determineSearchableTypes, searchCardKind, searchTypeTitleKey } from './searchTypes'

describe('determineSearchableTypes', () => {
  it('keeps People always and the fixed order', () => {
    expect(determineSearchableTypes([], false, [])).toEqual(['Person'])
    expect(determineSearchableTypes(['tvshows', 'movies'], false, [])).toEqual(['Movie', 'Series', 'Episode', 'Person'])
  })

  it('adds Live TV kinds only with Live TV access, ignoring libraries', () => {
    expect(determineSearchableTypes(['livetv'], false, [])).toEqual(['Person'])
    expect(determineSearchableTypes([], true, [])).toEqual(['Person', 'TvChannel', 'LiveTvProgram'])
  })

  it('maps music, home videos, box sets and playlists libraries', () => {
    expect(determineSearchableTypes(['music', 'homevideos', 'boxsets', 'playlists', 'musicvideos'], false, [])).toEqual([
      'BoxSet',
      'Person',
      'MusicAlbum',
      'MusicArtist',
      'Audio',
      'MusicVideo',
      'Playlist',
      'Video',
      'Photo',
      'PhotoAlbum',
    ])
  })

  it('removes excluded types (People too)', () => {
    expect(determineSearchableTypes(['movies'], true, ['Person', 'TvChannel'])).toEqual(['Movie', 'LiveTvProgram'])
  })

  it('ignores mixed-content libraries', () => {
    expect(determineSearchableTypes([null, undefined], false, [])).toEqual(['Person'])
  })
})

describe('titles and cards', () => {
  it('has a title for every searchable type', () => {
    for (const type of ALL_SEARCHABLE_TYPES) expect(searchTypeTitleKey(type)).not.toBe('results')
    expect(searchTypeTitleKey('LiveTvProgram')).toBe('programs')
  })

  it('maps card shapes', () => {
    expect(searchCardKind('Episode')).toBe('episode')
    expect(searchCardKind('MusicArtist')).toBe('square')
    expect(searchCardKind('Person')).toBe('person')
    expect(searchCardKind('TvChannel')).toBe('channel')
    expect(searchCardKind('LiveTvProgram')).toBe('program')
    expect(searchCardKind('Movie')).toBe('poster')
  })
})
