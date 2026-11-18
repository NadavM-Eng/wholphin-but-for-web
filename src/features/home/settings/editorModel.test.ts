import { describe, expect, it } from 'vitest'
import type { Library } from '../../common/libraries'
import { viewOptions, type HomeRowConfig } from '../model/homeRowConfig'
import {
  combineRows,
  libraryRow,
  moveRow,
  nextSort,
  possibleFavoriteTypes,
  prefGroupsFor,
  reorderRow,
  resetViewOptionsFor,
  resizeAll,
  rowsChanged,
  setViewOption,
  splitRow,
  supportedRowTypes,
  withIds,
} from './editorModel'

const lib = (collectionType: Library['collectionType'], isRecordingFolder = false): Library => ({
  id: '0123456789abcdef0123456789abcdef',
  name: 'L',
  type: 'CollectionFolder',
  collectionType,
  isRecordingFolder,
})

const cw: HomeRowConfig = { type: 'ContinueWatching', viewOptions: viewOptions({ heightDp: 100 }) }
const nu: HomeRowConfig = { type: 'NextUp', viewOptions: viewOptions() }
const ra: HomeRowConfig = { type: 'RecentlyAdded', parentId: 'a', viewOptions: viewOptions() }

describe('home settings editor model', () => {
  it('moves and reorders', () => {
    expect(moveRow([1, 2, 3], 'UP', 1)).toEqual([2, 1, 3])
    expect(moveRow([1, 2, 3], 'DOWN', 1)).toEqual([1, 3, 2])
    expect(moveRow([1, 2, 3], 'UP', 0)).toEqual([1, 2, 3])
    expect(reorderRow([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4])
    expect(reorderRow([1, 2, 3, 4], 3, 0)).toEqual([4, 1, 2, 3])
  })

  it('combines continue watching and next up into one row', () => {
    const rows = withIds([ra, cw, nu])
    const out = combineRows(rows, 1)
    expect(out.map((r) => r.config.type)).toEqual(['RecentlyAdded', 'ContinueWatchingCombined'])
    expect(out[1].id).toBe(1)
    expect(out[1].config.viewOptions.heightDp).toBe(100)
  })

  it('splits the combined row', () => {
    const rows = withIds([{ type: 'ContinueWatchingCombined', viewOptions: viewOptions({ spacing: 4 }) }, ra])
    const out = splitRow(rows, 0, 7)
    expect(out.map((r) => [r.id, r.config.type])).toEqual([
      [0, 'ContinueWatching'],
      [7, 'NextUp'],
      [1, 'RecentlyAdded'],
    ])
    expect(out[1].config.viewOptions.spacing).toBe(4)
  })

  it('resizes every row by 4dp steps without clamping', () => {
    expect(resizeAll(withIds([cw]), -1)[0].config.viewOptions.heightDp).toBe(96)
  })

  it('flips, clears and sets the ByParent sort', () => {
    expect(nextSort(null, 'SortName')).toEqual({ sort: 'SortName', direction: 'Ascending' })
    expect(nextSort({ sort: 'SortName', direction: 'Ascending' }, 'SortName')).toEqual({ sort: 'SortName', direction: 'Descending' })
    expect(nextSort({ sort: 'SortName', direction: 'Ascending' }, 'Default')).toBeNull()
  })

  it('offers the row types of getSupportedRowTypes', () => {
    expect(supportedRowTypes(lib('movies'))).toEqual(['RECENTLY_ADDED', 'RECENTLY_RELEASED', 'SUGGESTIONS', 'GENRES'])
    expect(supportedRowTypes(lib('tvshows'))).toContain('STUDIOS')
    expect(supportedRowTypes(lib('boxsets'))).toEqual(['RECENTLY_ADDED', 'RECENTLY_RELEASED', 'GENRES', 'COLLECTION'])
    expect(supportedRowTypes(lib('livetv'))).toEqual(['TV_CHANNELS', 'TV_PROGRAMS'])
    expect(supportedRowTypes(lib(null, true))).toEqual(['RECENTLY_RECORDED', 'GENRES'])
    expect(supportedRowTypes(lib('music'))).toEqual(['RECENTLY_ADDED', 'RECENTLY_RELEASED', 'GENRES'])
    expect(libraryRow(lib('playlists'), 'PLAYLIST')).toBeNull()
    expect(libraryRow(lib('music'), 'RECENTLY_ADDED')?.viewOptions.aspectRatio).toBe('SQUARE')
  })

  it('lists favorite kinds from the libraries plus people', () => {
    expect(possibleFavoriteTypes([lib('tvshows'), lib('livetv')])).toEqual(['Series', 'Season', 'Episode', 'Person', 'TvChannel'])
    expect(possibleFavoriteTypes([])).toEqual(['Person'])
  })

  it('picks the preference groups and reset target per row kind', () => {
    expect(prefGroupsFor(cw).map((g) => g.titleKey)).toEqual(['general', 'for_episodes', 'more'])
    expect(prefGroupsFor({ type: 'Genres', parentId: 'a', viewOptions: viewOptions() })).toHaveLength(1)
    expect(resetViewOptionsFor({ type: 'Genres', parentId: 'a', viewOptions: viewOptions() }).aspectRatio).toBe('WIDE')
    expect(resetViewOptionsFor({ type: 'Studios', parentId: 'a', viewOptions: viewOptions() }).aspectRatio).toBe('TALL')
  })

  it('sets the aspect ratio with the image type', () => {
    expect(setViewOption(viewOptions(), 'imageType', 'THUMB').aspectRatio).toBe('WIDE')
    expect(setViewOption(viewOptions(), 'episodeImageType', 'PRIMARY').episodeAspectRatio).toBe('TALL')
  })

  it('detects changes by value', () => {
    expect(rowsChanged([cw], [{ viewOptions: viewOptions({ heightDp: 100 }), type: 'ContinueWatching' }])).toBe(false)
    expect(rowsChanged([cw, nu], [nu, cw])).toBe(true)
  })
})
