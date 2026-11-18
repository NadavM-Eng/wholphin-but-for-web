import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { describe, expect, it } from 'vitest'
import {
  buildDrawerState,
  builtinItems,
  DISCOVER_ID,
  FAVORITES_ID,
  librariesFromViews,
  libraryDrawerId,
  libraryIcon,
  selectionForPath,
  selectionForStack,
} from './drawerItems'

const ID = (n: number) => n.toString(16).padStart(32, '0')
const view = (n: number, name: string, ct?: string): BaseItemDto => ({ Id: ID(n), Name: name, CollectionType: ct as BaseItemDto['CollectionType'] })

const VIEWS = [
  view(1, 'Movies', 'movies'),
  view(2, 'Shows', 'tvshows'),
  view(3, 'Books', 'books'),
  view(4, 'Live TV', 'livetv'),
  view(5, 'Mixed'),
  view(6, 'Recordings', 'unknown'),
  view(7, 'Trailers', 'trailers'),
  view(8, 'Music', 'music'),
]

describe('librariesFromViews', () => {
  it('keeps supported collection types and recording folders in server order', () => {
    const libs = librariesFromViews(VIEWS, new Set([ID(6)]))
    expect(libs.map((l) => l.name)).toEqual(['Movies', 'Shows', 'Live TV', 'Mixed', 'Recordings', 'Music'])
    expect(libs[0].id).toBe(`s_${ID(1)}`)
    expect(libs.find((l) => l.name === 'Recordings')?.path).toBe(`/recordings/${ID(6)}`)
    expect(libs.find((l) => l.name === 'Live TV')?.path).toBe('/livetv')
    expect(libs.find((l) => l.name === 'Movies')?.path).toBe(`/library/${ID(1)}`)
  })

  it('normalizes dashed ids', () => {
    expect(libraryDrawerId('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE')).toBe('s_aaaaaaaabbbbccccddddeeeeeeeeeeee')
  })
})

describe('libraryIcon', () => {
  it('maps collection types like NavDrawer.kt', () => {
    expect(libraryIcon('movies')).toEqual({ kind: 'fa', name: 'film' })
    expect(libraryIcon('tvshows')).toEqual({ kind: 'fa', name: 'tv' })
    expect(libraryIcon('homevideos')).toEqual({ kind: 'fa', name: 'video' })
    expect(libraryIcon('livetv')).toEqual({ kind: 'drawable', name: 'gf_dvr' })
    expect(libraryIcon('music')).toEqual({ kind: 'fa', name: 'music' })
    expect(libraryIcon('boxsets')).toEqual({ kind: 'fa', name: 'open_folder' })
    expect(libraryIcon('playlists')).toEqual({ kind: 'fa', name: 'list_ul' })
    expect(libraryIcon('photos')).toEqual({ kind: 'fa', name: 'film' })
    expect(libraryIcon(null)).toEqual({ kind: 'fa', name: 'film' })
  })
})

describe('buildDrawerState', () => {
  const all = [...builtinItems(true), ...librariesFromViews(VIEWS, new Set())]

  it('defaults to everything pinned in default order', () => {
    const s = buildDrawerState(all, {})
    expect(s.items.map((i) => i.id).slice(0, 2)).toEqual([FAVORITES_ID, DISCOVER_ID])
    expect(s.moreItems).toEqual([])
  })

  it('sorts by saved order (unknown last, stable) and moves unpinned items under More', () => {
    const s = buildDrawerState(all, {
      [libraryDrawerId(ID(2))]: { type: 'PINNED', order: 0 },
      [FAVORITES_ID]: { type: 'UNPINNED', order: 1 },
      [libraryDrawerId(ID(1))]: { type: 'PINNED', order: -1 },
      [libraryDrawerId(ID(99))]: { type: 'UNPINNED', order: 2 },
    })
    expect(s.items[0].name).toBe('Shows')
    expect(s.items[1].id).toBe(DISCOVER_ID)
    expect(s.items[2].name).toBe('Movies')
    expect(s.moreItems.map((i) => i.id)).toEqual([FAVORITES_ID])
  })

  it('omits Discover when Seerr is not active', () => {
    expect(builtinItems(false).map((i) => i.id)).toEqual([FAVORITES_ID])
  })
})

describe('selection', () => {
  const state = buildDrawerState([...builtinItems(false), ...librariesFromViews(VIEWS, new Set([ID(6)]))], {})

  it('matches built-in pages and drawer destinations only', () => {
    expect(selectionForPath('/', state)).toBe('home')
    expect(selectionForPath('/search?q=x', state)).toBe('search')
    expect(selectionForPath('/favorites', state)).toBe(FAVORITES_ID)
    expect(selectionForPath(`/library/${ID(1)}?tab=2`, state)).toBe(libraryDrawerId(ID(1)))
    expect(selectionForPath(`/recordings/${ID(6)}`, state)).toBe(libraryDrawerId(ID(6)))
    expect(selectionForPath('/livetv', state)).toBe(libraryDrawerId(ID(4)))
    // a card click opens the same pages at /library/<id>
    expect(selectionForPath(`/library/${ID(4)}`, state)).toBe(libraryDrawerId(ID(4)))
    expect(selectionForPath(`/library/${ID(6)}`, state)).toBe(libraryDrawerId(ID(6)))
    expect(selectionForPath(`/item/${ID(1)}`, state)).toBeNull()
  })

  it('walks the stack from the top', () => {
    expect(selectionForStack(['/', `/library/${ID(2)}`, '/item/abc'], state)).toBe(libraryDrawerId(ID(2)))
    expect(selectionForStack(['/', '/item/abc'], state)).toBe('home')
    expect(selectionForStack(['/item/abc'], state)).toBeNull()
  })
})
