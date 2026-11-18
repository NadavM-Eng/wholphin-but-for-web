import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { describe, expect, it } from 'vitest'
import { artistParams, musicRecommendedRows } from './library/musicSources'
import { discGroups, isVariousArtists } from './musicText'
import { THEME_VOLUME } from '../detail/common/themeMusic'
import { groupWaveform } from './service/visualizerTap'

describe('music helpers', () => {
  it('various artists', () => {
    expect(isVariousArtists({ Artists: ['A'] })).toBe(false)
    expect(isVariousArtists({ Artists: ['A', 'B'] })).toBe(true)
    expect(isVariousArtists({ Artists: ['A'], AlbumArtists: [{ Name: 'Various Artists' }] })).toBe(true)
  })

  it('groups songs by disc keeping list indexes', () => {
    const songs: BaseItemDto[] = [
      { Id: '1', ParentIndexNumber: 1 },
      { Id: '2', ParentIndexNumber: 1 },
      { Id: '3', ParentIndexNumber: 2 },
    ]
    const g = discGroups(songs)
    expect(g.map((x) => x.disc)).toEqual([1, 2])
    expect(g[1].items[0].index).toBe(2)
    expect(discGroups([{ Id: 'a' }, { Id: 'b' }])).toHaveLength(1)
  })

  it('waveform groups into bars; silence is flat', () => {
    expect(groupWaveform(new Array(960).fill(128), 96)).toEqual(new Array(96).fill(0))
    const loud = groupWaveform(
      Array.from({ length: 960 }, (_, i) => (i % 2 ? 255 : 0)),
      96,
    )
    expect(loud).toHaveLength(96)
    expect(loud[0]).toBeGreaterThan(200)
  })

  it('theme song volume; HIGHEST is 0.75 (upstream 75f, clamped to 1 by the player)', () => {
    expect(THEME_VOLUME.DISABLED).toBeNull()
    expect(THEME_VOLUME.LOWEST).toBe(0.05)
    expect(THEME_VOLUME.MEDIUM).toBe(0.25)
    expect(THEME_VOLUME.HIGHEST).toBe(0.75)
  })

  it('artists tab request: library parent, filter values, the chosen sort', () => {
    const p = artistParams('lib', 'user', {
      sort: { sort: 'DateCreated', direction: 'Descending' },
      filter: { favorite: true, genres: ['g1'], decades: [1990], played: true, includeItemTypes: ['Movie'] },
    })
    expect(p).toMatchObject({ userId: 'user', parentId: 'lib', isFavorite: true, genreIds: ['g1'], enableImageTypes: ['Primary', 'Thumb'] })
    expect(p.years).toEqual([1990, 1991, 1992, 1993, 1994, 1995, 1996, 1997, 1998, 1999])
    expect(p.sortBy).toEqual(['DateCreated', 'SortName'])
    expect(p.sortOrder).toEqual(['Descending', 'Ascending'])
    // applyTo(GetArtistsRequest) has no played / item type
    expect(p).not.toHaveProperty('isPlayed')
    expect(p).not.toHaveProperty('includeItemTypes')
    expect(artistParams('lib', 'user', { sort: { sort: 'SortName', direction: 'Ascending' }, filter: {} }).sortBy).toEqual(['SortName'])
  })

  it('recommended rows: albums of the library, sorted per row', () => {
    const rows = musicRecommendedRows('lib', 'user')
    expect(rows.map((r) => r.titleKey)).toEqual(['recently_released', 'recently_added', 'top_rated'])
    for (const r of rows) expect(r.query).toMatchObject({ parentId: 'lib', userId: 'user', includeItemTypes: ['MusicAlbum'], recursive: true })
    expect(rows[0].query).toMatchObject({ sortBy: ['PremiereDate', 'SortName'], sortOrder: ['Descending', 'Ascending'] })
    expect(rows[2].query).toMatchObject({ sortBy: ['CommunityRating'], sortOrder: ['Descending'] })
  })
})
