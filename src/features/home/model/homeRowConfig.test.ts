import { describe, expect, it } from 'vitest'
import {
  decodeHomePageSettings,
  DEFAULT_VIEW_OPTIONS,
  encodeHomePageSettings,
  encodeRow,
  GENRE_VIEW_OPTIONS,
  LIVE_TV_VIEW_OPTIONS,
  rowDataKey,
  UnsupportedHomeSettingsVersionError,
  type HomeRowConfig,
} from './homeRowConfig'

// Shape written by the Android app (kotlinx, encodeDefaults = false), with a trailing comma and an
// unknown row type that must be skipped.
const ANDROID_JSON = `{
  "rows": [
    {"type": "ContinueWatchingCombined"},
    {"type": "RecentlyAdded", "parentId": "f137a2dd-21bb-c1b9-9aa5-c0f6bf02a805", "viewOptions": {"heightDp": 128, "aspectRatio": "SQUARE"}},
    {"type": "Genres", "parentId": "f137a2dd-21bb-c1b9-9aa5-c0f6bf02a805"},
    {"type": "TvPrograms"},
    {"type": "Favorite", "kind": "BoxSet", "viewOptions": {"contentScale": "Fill_WIDTH"}},
    {"type": "ByParent", "parentId": "9d7ad6af-e9af-a2da-b1a2-f6e00ad28fa6", "sort": {"sort": "DateCreated", "direction": "Descending"}},
    {"type": "SomethingNew", "foo": 1},
    {"type": "RecentlyAdded", "viewOptions": {}},
    {"type": "NextUp", "viewOptions": {"aspectRatio": "NOT_A_RATIO"}},
    {"type": "CustomEndpoint", "endpoint": "/HomeScreen/Section", "title": "Plugin row", "query": [{"key": "a", "value": "b"}]},
  ],
  "version": 1,
}`

describe('decodeHomePageSettings', () => {
  const s = decodeHomePageSettings(ANDROID_JSON)

  it('keeps valid rows in order and skips unknown or malformed ones', () => {
    expect(s.version).toBe(1)
    expect(s.rows.map((r) => r.type)).toEqual([
      'ContinueWatchingCombined',
      'RecentlyAdded',
      'Genres',
      'TvPrograms',
      'Favorite',
      'ByParent',
      'CustomEndpoint',
    ])
  })

  it('fills view options: class default when absent, field defaults when partial', () => {
    expect(s.rows[0].viewOptions).toEqual(DEFAULT_VIEW_OPTIONS)
    expect(s.rows[1].viewOptions).toEqual({ ...DEFAULT_VIEW_OPTIONS, heightDp: 128, aspectRatio: 'SQUARE' })
    expect(s.rows[2].viewOptions).toEqual(GENRE_VIEW_OPTIONS)
    expect(s.rows[3].viewOptions).toEqual(LIVE_TV_VIEW_OPTIONS)
    expect(s.rows[4].viewOptions.contentScale).toBe('Fill_WIDTH')
  })

  it('reads SDK enum wire names', () => {
    const fav = s.rows[4] as Extract<HomeRowConfig, { type: 'Favorite' }>
    expect(fav.kind).toBe('BoxSet')
    const byParent = s.rows[5] as Extract<HomeRowConfig, { type: 'ByParent' }>
    expect(byParent.recursive).toBe(false)
    expect(byParent.sort).toEqual({ sort: 'DateCreated', direction: 'Descending' })
  })

  it('rejects a missing or newer version', () => {
    expect(() => decodeHomePageSettings('{"rows": []}')).toThrow(UnsupportedHomeSettingsVersionError)
    expect(() => decodeHomePageSettings('{"rows": [], "version": 2}')).toThrow(UnsupportedHomeSettingsVersionError)
  })
})

describe('encode', () => {
  it('omits default values like encodeDefaults = false', () => {
    expect(encodeRow({ type: 'ContinueWatchingCombined', viewOptions: { ...DEFAULT_VIEW_OPTIONS } })).toEqual({
      type: 'ContinueWatchingCombined',
    })
    expect(encodeRow({ type: 'Genres', parentId: 'f137a2dd21bbc1b99aa5c0f6bf02a805', viewOptions: { ...GENRE_VIEW_OPTIONS } })).toEqual({
      type: 'Genres',
      parentId: 'f137a2dd-21bb-c1b9-9aa5-c0f6bf02a805',
    })
    expect(
      encodeRow({ type: 'Studios', parentId: 'f137a2dd21bbc1b99aa5c0f6bf02a805', viewOptions: { ...DEFAULT_VIEW_OPTIONS, heightDp: 100 } }),
    ).toEqual({ type: 'Studios', parentId: 'f137a2dd-21bb-c1b9-9aa5-c0f6bf02a805', viewOptions: { heightDp: 100 } })
  })

  it('round-trips', () => {
    const s = decodeHomePageSettings(ANDROID_JSON)
    expect(decodeHomePageSettings(encodeHomePageSettings(s))).toEqual(s)
  })

  it('identifies a row request independently of its view options', () => {
    const a: HomeRowConfig = { type: 'NextUp', viewOptions: { ...DEFAULT_VIEW_OPTIONS } }
    const b: HomeRowConfig = { type: 'NextUp', viewOptions: { ...DEFAULT_VIEW_OPTIONS, heightDp: 100 } }
    expect(rowDataKey(a)).toBe(rowDataKey(b))
  })
})
