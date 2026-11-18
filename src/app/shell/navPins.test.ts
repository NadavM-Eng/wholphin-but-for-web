import { describe, expect, it } from 'vitest'
import { orderPinsForDialog } from './navPins'

describe('orderPinsForDialog', () => {
  it('keeps pinned and unpinned items interleaved in the saved order', () => {
    const pinned = [{ id: 'movies' }, { id: 'music' }]
    const more = [{ id: 'collections' }]
    const saved = {
      movies: { type: 'PINNED' as const, order: 0 },
      collections: { type: 'UNPINNED' as const, order: 1 },
      music: { type: 'PINNED' as const, order: 2 },
    }
    expect(orderPinsForDialog(pinned, more, saved).map((p) => p.id)).toEqual(['movies', 'collections', 'music'])
  })

  it('puts unknown and negative orders last, keeping their incoming order', () => {
    const pinned = [{ id: 'a' }, { id: 'b' }]
    const more = [{ id: 'c' }, { id: 'd' }]
    const saved = { c: { type: 'UNPINNED' as const, order: 0 }, b: { type: 'PINNED' as const, order: -1 } }
    expect(orderPinsForDialog(pinned, more, saved).map((p) => p.id)).toEqual(['c', 'a', 'b', 'd'])
  })
})
