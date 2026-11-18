import type { Api } from '@jellyfin/sdk'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SORT } from '../model/sort'
import { defaultViewOptionsForKind } from '../model/viewOptions'
import { favoritesSource } from './favoritesSource'
import type { GridState } from './useGridState'

// The sources only touch the API inside fetchPage / a real letter lookup.
const api = {} as Api
const state = (kind: 'Person' | 'Movie'): GridState => ({
  sort: DEFAULT_SORT,
  filter: { favorite: true },
  viewOptions: defaultViewOptionsForKind(kind),
})

describe('favoritesSource', () => {
  it('keeps the letter column for people, with a jump that goes nowhere (positionOfLetter = null)', async () => {
    const source = favoritesSource(api, 'user', 'Person')(state('Person'))
    expect(source.letterIndex).toBeTypeOf('function')
    await expect(source.letterIndex?.('M', 12)).resolves.toBe(-1)
  })

  it('gives every other type a letter lookup too', () => {
    expect(favoritesSource(api, 'user', 'Movie')(state('Movie')).letterIndex).toBeTypeOf('function')
  })
})
