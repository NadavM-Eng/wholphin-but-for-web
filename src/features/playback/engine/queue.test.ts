// Queue for an item played directly: next and previous are the neighbours, and the item never follows itself.
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { describe, expect, it } from 'vitest'
import { isSameMedia, queueForPlayedItem, queuePosition, type QueueEntry } from './queue'

const ep = (id: string, season: number, n: number | null, extra: Partial<BaseItemDto> = {}): BaseItemDto => ({
  Id: id,
  Type: 'Episode',
  SeriesId: 'series-1',
  ParentIndexNumber: season,
  IndexNumber: n ?? undefined,
  ...extra,
})
const media = (item: BaseItemDto): QueueEntry => ({ kind: 'media', item })
const ids = (q: QueueEntry[]) => q.map((e) => e.item.Id)

/** what the engine does: index + 1 for Next, index - 1 for Previous */
function walk(q: QueueEntry[], steps: (1 | -1)[]) {
  let i = 0
  const seen = [q[i].item.Id]
  for (const s of steps) {
    i += s
    seen.push(q[i]?.item.Id)
  }
  return seen
}

const specials = [ep('s0e1', 0, 1), ep('s0e2', 0, 2)]
const season1 = [ep('e1', 1, 1), ep('e2', 1, 2), ep('e3', 1, 3)]
const season2 = [ep('s2e1', 2, 1), ep('s2e2', 2, 2), ep('s2e4', 2, 4)]

describe('queueForPlayedItem', () => {
  it('cuts the server list at the item: next, next, next across the season boundary and a missing number, then previous', () => {
    const q = queueForPlayedItem(season1[1], [...season1.slice(1), ...season2].map(media))
    expect(ids(q)).toEqual(['e2', 'e3', 's2e1', 's2e2', 's2e4'])
    expect(walk(q, [1, 1, 1, 1, -1])).toEqual(['e2', 'e3', 's2e1', 's2e2', 's2e4', 's2e2'])
  })

  it('Specials listed first: the item is found and what follows it is next, not the first special', () => {
    const q = queueForPlayedItem(season1[0], [...specials, ...season1].map(media))
    expect(ids(q)).toEqual(['e1', 'e2', 'e3'])
  })

  it('another version of the episode under its own id: it stands for the item and is not offered as next', () => {
    const alt = ep('e2-alt', 1, 2)
    const q = queueForPlayedItem(alt, [...season1.slice(1), ...season2].map(media))
    expect(ids(q)).toEqual(['e2-alt', 'e3', 's2e1', 's2e2', 's2e4'])
    expect(isSameMedia(q[0].item, q[1].item)).toBe(false)
  })

  it('the item not in the list at all: it is played first and never repeated', () => {
    const q = queueForPlayedItem(ep('e9', 1, 9), [...specials, ...season1].map(media))
    expect(ids(q)).toEqual(['e9', 's0e1', 's0e2', 'e1', 'e2', 'e3'])
    expect(ids(q).filter((id) => id === 'e9')).toHaveLength(1)
  })

  it('matches ids written with or without dashes, in any case', () => {
    const q = queueForPlayedItem(ep('AB-CD', 1, 1), [media(ep('abcd', 1, 1)), media(season1[1])])
    expect(ids(q)).toEqual(['abcd', 'e2'])
  })
})

describe('isSameMedia', () => {
  it('episodes with no number, other seasons, other series and movies are not taken for one another', () => {
    expect(isSameMedia(ep('a', 1, null), ep('b', 1, null))).toBe(false)
    expect(isSameMedia(ep('a', 1, 2), ep('b', 2, 2))).toBe(false)
    expect(isSameMedia(ep('a', 1, 2), ep('b', 1, 2, { SeriesId: 'other' }))).toBe(false)
    expect(isSameMedia(ep('a', 1, 2), ep('b', 1, 2, { IndexNumberEnd: 3 }))).toBe(false)
    expect(isSameMedia({ Id: 'm1', Type: 'Movie' }, { Id: 'm2', Type: 'Movie' })).toBe(false)
    expect(isSameMedia(ep('a', 1, 2), ep('b', 1, 2))).toBe(true)
  })
})

describe('queuePosition (enabled state of Previous and Next)', () => {
  it('greys Previous on the first entry and Next on the last', () => {
    expect(queuePosition(0, 3)).toEqual({ hasPrevious: false, hasNext: true })
    expect(queuePosition(1, 3)).toEqual({ hasPrevious: true, hasNext: true })
    expect(queuePosition(2, 3)).toEqual({ hasPrevious: true, hasNext: false })
  })
  it('a single entry has neither', () => {
    expect(queuePosition(0, 1)).toEqual({ hasPrevious: false, hasNext: false })
  })
  it('an index outside the queue has neither', () => {
    expect(queuePosition(0, 0)).toEqual({ hasPrevious: false, hasNext: false })
    expect(queuePosition(3, 3)).toEqual({ hasPrevious: false, hasNext: false })
    expect(queuePosition(-1, 3)).toEqual({ hasPrevious: false, hasNext: false })
  })
})
