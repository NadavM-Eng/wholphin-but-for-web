import { describe, expect, it } from 'vitest'
import { recommendedReady } from '../data/recommended'
import { favoritesDisplayId, favoriteTypes, initialFavoriteTab } from './favorites'
import {
  applyFilter,
  countFilters,
  DEFAULT_FILTER_OPTIONS,
  deleteFilters,
  FILTERS,
  filterYears,
  isValueSelected,
  mergeFilter,
  selectValue,
} from './filter'
import { tvCardWidthDp, webColumns } from './gridColumns'
import { letterBound, letterJumpIndex } from './letterJump'
import { gridSortParams, pickSort, sortOptionsForCollection, sortOptionsForKind } from './sort'
import { decodeViewOptions, defaultViewOptionsForKind, VIEW_OPTIONS_WIDE, withImageType, withLayout } from './viewOptions'

describe('filter', () => {
  it('applies like GetItemsFilter.applyTo: decades expand, video types map to REST names', () => {
    const p = applyFilter({ years: [1999], decades: [2000], videoTypes: ['FOUR_K', 'SD', 'BLU_RAY', 'THREE_D'], played: false, genres: ['g'] })
    expect(p.years).toEqual([1999, ...Array.from({ length: 10 }, (_, i) => 2000 + i)])
    expect(p.is4K).toBe(true)
    expect(p.isHd).toBe(false)
    expect(p.is3D).toBe(true)
    expect(p.videoTypes).toEqual(['BluRay'])
    expect(p.isPlayed).toBe(false)
    expect(p.genreIds).toEqual(['g'])
    expect(p.isFavorite).toBeUndefined()
  })
  it('HD wins over SD; no video types sends nothing', () => {
    expect(applyFilter({ videoTypes: ['HD', 'SD'] }).isHd).toBe(true)
    const none = applyFilter({})
    expect([none.isHd, none.is4K, none.is3D, none.videoTypes, none.years]).toEqual([undefined, undefined, undefined, undefined, undefined])
  })
  it('overwrites includeItemTypes unless the request keeps its own', () => {
    expect(applyFilter({}).includeItemTypes).toBeUndefined()
    expect(applyFilter({ includeItemTypes: ['Series'] }).includeItemTypes).toEqual(['Series'])
    expect(applyFilter({ includeItemTypes: ['Series'] }, ['Movie']).includeItemTypes).toEqual(['Movie'])
  })
  it('merge keeps the page values and fills the rest', () => {
    const m = mergeFilter({ includeItemTypes: ['Movie'], genres: ['a'] }, { includeItemTypes: ['BoxSet'], genres: ['b'], played: true })
    expect(m.includeItemTypes).toEqual(['Movie'])
    expect(m.genres).toEqual(['a'])
    expect(m.played).toBe(true)
  })
  it('counts and deletes only the given options', () => {
    const f = { played: true, studios: ['s'], genres: ['g'] }
    expect(countFilters(f, DEFAULT_FILTER_OPTIONS)).toBe(2)
    const d = deleteFilters(f, DEFAULT_FILTER_OPTIONS)
    expect(d.played).toBeNull()
    expect(d.studios).toEqual(['s'])
  })
  it('selects values: lists toggle (empty -> null), booleans from the True/False label, rating sets', () => {
    let f = selectValue(FILTERS.Genre, {}, { name: 'Action', value: 'g1' })
    expect(f.genres).toEqual(['g1'])
    f = selectValue(FILTERS.Genre, f, { name: 'Action', value: 'g1' })
    expect(f.genres).toBeNull()
    f = selectValue(FILTERS.Played, {}, { name: 'False', value: null })
    expect(f.played).toBe(false)
    expect(isValueSelected(FILTERS.Played, f, { name: 'False', value: null })).toBe(true)
    f = selectValue(FILTERS.CommunityRating, {}, { name: '7', value: 7 })
    expect(f.minCommunityRating).toBe(7)
    expect(selectValue(FILTERS.CommunityRating, f, { name: '7', value: 7 }).minCommunityRating).toBe(7)
    f = selectValue(FILTERS.OfficialRating, {}, { name: 'PG', value: 3 })
    expect(f.officialRatings).toEqual(['PG'])
    expect(filterYears({ decades: [1990] })).toHaveLength(10)
  })
})

describe('sort', () => {
  it('adds the SortName and movie ProductionYear tie-breakers', () => {
    expect(gridSortParams({ sort: 'DateCreated', direction: 'Descending' }, 'movies')).toEqual({
      sortBy: ['DateCreated', 'SortName', 'ProductionYear'],
      sortOrder: ['Descending', 'Ascending', 'Ascending'],
    })
    expect(gridSortParams({ sort: 'SortName', direction: 'Descending' }, 'tvshows')).toEqual({ sortBy: ['SortName'], sortOrder: ['Descending'] })
    expect(gridSortParams({ sort: 'Default', direction: 'Ascending' }, 'playlists')).toEqual({})
  })
  it('flips direction when the current sort is picked again', () => {
    expect(pickSort({ sort: 'SortName', direction: 'Ascending' }, 'SortName').direction).toBe('Descending')
    expect(pickSort({ sort: 'SortName', direction: 'Descending' }, 'Runtime')).toEqual({ sort: 'Runtime', direction: 'Descending' })
  })
  it('picks the option lists', () => {
    expect(sortOptionsForCollection('tvshows')).toContain('DateLastContentAdded')
    expect(sortOptionsForCollection('boxsets')[0]).toBe('Default')
    expect(sortOptionsForCollection(null)).not.toContain('Default')
    expect(sortOptionsForKind('Episode')).toContain('AiredEpisodeOrder')
  })
})

describe('letter jump', () => {
  it('ascending uses the letter, descending the next letter mirrored', () => {
    expect(letterBound('m', 'Ascending')).toBe('M')
    expect(letterBound('M', 'Descending')).toBe('N')
    expect(letterBound('#', 'Descending')).toBe('A')
    expect(letterBound('Z', 'Descending')).toBe('{')
    // 100 items, 40 below "N": in descending order the M block starts at 100 - 40 = 60
    expect(letterJumpIndex(40, 100, 'Descending')).toBe(60)
    expect(letterJumpIndex(40, 100, 'Ascending')).toBe(40)
    expect(letterJumpIndex(100, 100, 'Ascending')).toBe(99)
    expect(letterJumpIndex(null, 100, 'Ascending')).toBe(-1)
  })
})

describe('web columns', () => {
  it('equals the chosen count at the TV grid width and follows the window', () => {
    expect(webColumns(838, 6, 16)).toBe(6)
    expect(webColumns(838, 4, 24)).toBe(4)
    expect(webColumns(324, 6, 16)).toBe(2)
    expect(webColumns(1450, 6, 16)).toBe(10)
    expect(webColumns(200, 1, 16)).toBe(1)
    expect(webColumns(0, 6, 16)).toBe(6)
    expect(tvCardWidthDp(6, 16)).toBeCloseTo((838 - 80) / 6)
  })
})

describe('view options', () => {
  it('setters follow upstream side effects', () => {
    const v = defaultViewOptionsForKind('Movie')
    expect(withImageType(v, 'THUMB').aspectRatio).toBe('WIDE')
    expect(withLayout(v, 'DENSE_LIST').spacing).toBe(2)
    expect(defaultViewOptionsForKind('Episode')).toEqual(VIEW_OPTIONS_WIDE)
    expect(defaultViewOptionsForKind('Playlist').aspectRatio).toBe('SQUARE')
  })
  it('decodes leniently (Kotlin JSON with extras)', () => {
    const d = decodeViewOptions({ columns: 40, spacing: 'x', type: 'LIST', extras: { type: 'x', artistSource: 'ALBUM_ARTIST' } })
    expect(d?.columns).toBe(12)
    expect(d?.spacing).toBe(16)
    expect(d?.type).toBe('LIST')
    expect(d?.artistSource).toBe('ALBUM_ARTIST')
    expect(decodeViewOptions(null)).toBeNull()
  })
})

describe('recommended', () => {
  it('waits for rows in order, shows on the first non-empty, and no longer spins when all are empty', () => {
    expect(recommendedReady([{ pending: true, nonEmpty: false }, { pending: false, nonEmpty: true }])).toBe(false)
    expect(recommendedReady([{ pending: false, nonEmpty: true }, { pending: true, nonEmpty: false }])).toBe(true)
    expect(recommendedReady([{ pending: false, nonEmpty: false }, { pending: true, nonEmpty: false }])).toBe(false)
    expect(recommendedReady([{ pending: false, nonEmpty: false }, { pending: false, nonEmpty: false }])).toBe(true)
  })
})

describe('favorites', () => {
  it('derives types from the libraries, Person always', () => {
    expect(favoriteTypes(['movies', 'tvshows', null])).toEqual(['Movie', 'Series', 'Season', 'Episode', 'Person'])
    expect(favoriteTypes([])).toEqual(['Person'])
  })
  it('uses the legacy display-info keys', () => {
    expect(favoritesDisplayId('Movie')).toBe('a_favorites_movies')
    expect(favoritesDisplayId('BoxSet')).toBe('a_favorites_BoxSet')
  })
  it('opens on the preferred tab, else the first with results', () => {
    const r = [
      { kind: 'Movie' as const, status: 'empty' as const },
      { kind: 'Series' as const, status: 'items' as const },
      { kind: 'Person' as const, status: 'pending' as const },
    ]
    expect(initialFavoriteTab('Movie', r)).toBe('Series')
    expect(initialFavoriteTab('Person', r)).toBeNull()
    expect(initialFavoriteTab(null, [{ kind: 'Movie', status: 'empty' }])).toBe('none')
    expect(initialFavoriteTab('Series', r)).toBe('Series')
  })
})
