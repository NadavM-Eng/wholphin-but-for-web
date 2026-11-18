import { describe, expect, it } from 'vitest'
import { arrayList, findIndexByNumberOrId, findIndexByNumberOrIdFast, type IndexedItem } from './episodeIndex'
import { episodeAspect } from './stripLayout'

const S1 = 'season-1'
const ep = (n: number, season = S1, parentIndex = 1): IndexedItem => ({ Id: `e${parentIndex}-${n}`, IndexNumber: n, ParentId: season, ParentIndexNumber: parentIndex })

/** A list that counts page loads, to check the search reads only what it needs. */
function paged(items: IndexedItem[], pageSize: number) {
  const reads = new Set<number>()
  return {
    reads,
    list: {
      size: items.length,
      pageSize,
      get: async (i: number) => {
        reads.add(Math.floor(i / pageSize))
        return items[i]
      },
    },
  }
}

describe('findIndexByNumberOrIdFast (SeriesViewModel.kt:752-878)', () => {
  it('scans a single page by id, or by number with the parent', async () => {
    const eps = [ep(1), ep(2), ep(4), ep(5)] // S1E3 missing
    expect(await findIndexByNumberOrIdFast(4, 'e1-4', arrayList(eps, 100), S1, 1)).toBe(2)
    expect(await findIndexByNumberOrIdFast(null, 'e1-5', arrayList(eps, 100), S1, 1)).toBe(3)
    expect(await findIndexByNumberOrIdFast(5, null, arrayList(eps, 100), S1, 1)).toBe(3)
  })

  it('gives -1 when the single-page scan finds nothing (callers clamp to 0)', async () => {
    expect(await findIndexByNumberOrIdFast(9, 'nope', arrayList([ep(1), ep(2)], 100), S1, 1)).toBe(-1)
  })

  it('a specials episode listed inside the season does not match by number alone', async () => {
    const special = { Id: 'sp1', IndexNumber: 2, ParentId: 'season-0', SeasonId: 'season-0', ParentIndexNumber: 0 }
    const eps = [ep(1), special, ep(2), ep(3)]
    expect(await findIndexByNumberOrIdFast(2, 'e1-2', arrayList(eps, 100), S1, 1)).toBe(2)
  })

  it('accepts SeasonId as the parent (episodes outside season folders)', async () => {
    const flat = [1, 2, 3].map((n) => ({ Id: `f${n}`, IndexNumber: n, ParentId: 'series', SeasonId: S1, ParentIndexNumber: 1 }))
    expect(await findIndexByNumberOrIdFast(null, 'f3', arrayList(flat, 100), S1, null)).toBe(2)
  })

  it('seasons: Specials (0) first, found by id or number', async () => {
    const seasons = [0, 1, 2, 3].map((n) => ({ Id: `s${n}`, IndexNumber: n }))
    expect(await findIndexByNumberOrIdFast(2, 's2', arrayList(seasons, 20), null, null)).toBe(2)
    expect(await findIndexByNumberOrIdFast(0, 's0', arrayList(seasons, 20), null, null)).toBe(0)
  })
})

describe('findIndexByNumberOrId (more than one page)', () => {
  const long = Array.from({ length: 250 }, (_, i) => ep(i + 1))

  it('starts at number - 1 and reads only that page when it matches', async () => {
    const { list, reads } = paged(long, 100)
    expect(await findIndexByNumberOrIdFast(180, 'e1-180', list, S1, 1)).toBe(179)
    expect([...reads]).toEqual([1])
  })

  it('walks left when episodes are missing before the target', async () => {
    const gaps = long.filter((e) => e.IndexNumber !== 10 && e.IndexNumber !== 11)
    const { list } = paged(gaps, 100)
    // E150 sits at index 147: the hint index 149 holds E152, so the search walks left.
    expect(await findIndexByNumberOrIdFast(150, 'e1-150', list, S1, 1)).toBe(147)
  })

  it('walks right when the hint index holds a lower number', async () => {
    const withSpecials = [ep(1), ...Array.from({ length: 130 }, (_, i) => ep(i + 2))]
    withSpecials.splice(1, 1) // drop E2: every later episode is one index earlier
    withSpecials.unshift({ Id: 'x', IndexNumber: 0, ParentId: S1, ParentIndexNumber: 1 }) // and an E0 shifts them back
    withSpecials.unshift({ Id: 'y', IndexNumber: 0, ParentId: S1, ParentIndexNumber: 1 })
    const { list } = paged(withSpecials, 100)
    const index = await findIndexByNumberOrIdFast(120, 'e1-120', list, S1, 1)
    expect(withSpecials[index].Id).toBe('e1-120')
  })

  it('moves off an item of another season before walking', async () => {
    const mixed = [...Array.from({ length: 105 }, (_, i) => ep(i + 1)), { Id: 'other', IndexNumber: 107, ParentId: 'season-2', ParentIndexNumber: 2 }, ep(106), ep(107)]
    const { list } = paged(mixed, 100)
    // the hint index 105 holds a season-2 episode: step to a season-1 neighbour, then walk to E106
    expect(await findIndexByNumberOrIdFast(106, 'e1-106', list, S1, 1)).toBe(106)
  })

  it('without a usable number, scans for the id', async () => {
    const { list } = paged(long, 100)
    expect(await findIndexByNumberOrId(null, 'e1-230', list, S1, 1)).toBe(229)
    expect(await findIndexByNumberOrId(999, 'e1-3', list, S1, 1)).toBe(2)
  })

  it('returns 0 when nothing matches', async () => {
    const { list } = paged(long, 100)
    expect(await findIndexByNumberOrId(null, 'missing', list)).toBe(0)
    expect(await findIndexByNumberOrId(null, null, list)).toBe(0)
  })
})

describe('episodeAspect (SeriesOverviewContent.kt:251-255)', () => {
  it('is at least 4:3, 16:9 when unknown', () => {
    expect(episodeAspect(undefined)).toBeCloseTo(16 / 9)
    expect(episodeAspect({ PrimaryImageAspectRatio: 1 })).toBeCloseTo(4 / 3)
    expect(episodeAspect({ PrimaryImageAspectRatio: 2 })).toBe(2)
  })
})
