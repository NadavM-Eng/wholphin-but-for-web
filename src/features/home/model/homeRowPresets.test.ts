import { describe, expect, it } from 'vitest'
import type { Library } from '../../common/libraries'
import { DEFAULT_VIEW_OPTIONS, GENRE_VIEW_OPTIONS, LIVE_TV_VIEW_OPTIONS, type HomeRowConfig } from './homeRowConfig'
import {
  applyPreset,
  createDefaultRows,
  PRESET_COMPACT,
  PRESET_DEFAULT,
  PRESET_EPISODE_THUMBNAILS,
  presetForCollectionType,
  presetForItemKind,
  viewOptionsForCollectionType,
} from './homeRowPresets'

const lib = (id: string, collectionType: Library['collectionType']): Library => ({
  id,
  name: id,
  type: 'CollectionFolder',
  collectionType,
  isRecordingFolder: false,
})

describe('createDefaultRows', () => {
  it('starts with the combined row, then Watch live / Recently added per library in order', () => {
    const rows = createDefaultRows([lib('m', 'movies'), lib('tv', 'livetv'), lib('mu', 'music'), lib('p', 'photos')])
    expect(rows.map((r) => r.type)).toEqual(['ContinueWatchingCombined', 'RecentlyAdded', 'TvPrograms', 'RecentlyAdded', 'RecentlyAdded'])
    expect(rows[2].viewOptions).toEqual(LIVE_TV_VIEW_OPTIONS)
    expect(rows[3].viewOptions).toMatchObject({ heightDp: 128, aspectRatio: 'SQUARE' })
    expect(rows[4].viewOptions).toMatchObject({ heightDp: 128, aspectRatio: 'WIDE' })
  })
})

describe('preset lookups', () => {
  it('maps item kinds like HomeRowPresets.getByItemType (SH-3)', () => {
    expect(presetForItemKind(PRESET_COMPACT, 'Movie').heightDp).toBe(148)
    expect(presetForItemKind(PRESET_COMPACT, 'Person').heightDp).toBe(148)
    expect(presetForItemKind(PRESET_COMPACT, 'Photo')).toEqual(PRESET_COMPACT.videoLibrary)
    expect(presetForItemKind(PRESET_COMPACT, 'Episode')).toEqual(PRESET_COMPACT.continueWatching)
    expect(presetForItemKind(PRESET_COMPACT, 'Studio')).toEqual({ ...GENRE_VIEW_OPTIONS, heightDp: 100 })
    expect(presetForItemKind(PRESET_COMPACT, 'Book')).toEqual(PRESET_COMPACT.movieLibrary)
  })

  it('gives plain defaults to playlists / books / folders / unknown libraries', () => {
    expect(presetForCollectionType(PRESET_COMPACT, 'playlists')).toEqual(DEFAULT_VIEW_OPTIONS)
    expect(presetForCollectionType(PRESET_COMPACT, null)).toEqual(DEFAULT_VIEW_OPTIONS)
    expect(presetForCollectionType(PRESET_DEFAULT, 'photos')).toMatchObject({ aspectRatio: 'WIDE', contentScale: 'CROP' })
  })

  it('library defaults (viewOptionsForCollectionType)', () => {
    expect(viewOptionsForCollectionType('trailers')).toMatchObject({ heightDp: 128, aspectRatio: 'WIDE' })
    expect(viewOptionsForCollectionType('boxsets')).toEqual(DEFAULT_VIEW_OPTIONS)
  })
})

describe('applyPreset', () => {
  it('restyles rows per kind and leaves GetItems / CustomEndpoint unchanged', () => {
    const rows: HomeRowConfig[] = [
      { type: 'ContinueWatchingCombined', viewOptions: { ...DEFAULT_VIEW_OPTIONS } },
      { type: 'RecentlyAdded', parentId: 'tv', viewOptions: { ...DEFAULT_VIEW_OPTIONS } },
      { type: 'Genres', parentId: 'tv', viewOptions: { ...GENRE_VIEW_OPTIONS, spacing: 20 } },
      { type: 'Recordings', viewOptions: { ...DEFAULT_VIEW_OPTIONS } },
      { type: 'GetItems', name: 'x', filter: {}, viewOptions: { ...DEFAULT_VIEW_OPTIONS, heightDp: 99 } },
    ]
    const out = applyPreset(rows, PRESET_EPISODE_THUMBNAILS, (id) => (id === 'tv' ? 'tvshows' : null))
    expect(out[0].viewOptions).toMatchObject({ heightDp: 100, imageType: 'THUMB', showTitles: true, useSeries: false })
    expect(out[1].viewOptions.heightDp).toBe(148)
    expect(out[2].viewOptions).toEqual({ ...GENRE_VIEW_OPTIONS, spacing: 20, heightDp: 100 })
    expect(out[3].viewOptions).toEqual(PRESET_EPISODE_THUMBNAILS.tvLibrary)
    expect(out[4]).toBe(rows[4])
  })
})
