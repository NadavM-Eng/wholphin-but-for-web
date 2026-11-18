import { describe, expect, it } from 'vitest'
import type { AudioItem } from '../../../stores/musicQueue'
import {
  appendEntries,
  insertNext,
  moveEntry,
  nextIndex,
  nextRepeatMode,
  playOrder,
  previousIndex,
  queuedIds,
  removeEntry,
  shuffleOrderFrom,
  type QueueShape,
} from './queueOps'

const song = (id: string, key = `k-${id}`): AudioItem => ({
  key,
  id,
  albumId: null,
  artistId: null,
  artistIds: [],
  title: id,
  albumTitle: null,
  artistNames: null,
  runtimeMs: 1000,
  imageUrl: null,
  hasLyrics: false,
  container: null,
  codec: null,
})

const q = (ids: string[], over: Partial<QueueShape> = {}): QueueShape => {
  const entries = ids.map((i) => song(i))
  return { entries, currentIndex: 0, shuffle: false, order: entries.map((e) => e.key), repeat: 'off', ...over }
}

describe('queueOps', () => {
  it('next / previous follow list order and stop at the ends with repeat off', () => {
    const s = q(['a', 'b', 'c'], { currentIndex: 1 })
    expect(nextIndex(s, false)).toBe(2)
    expect(previousIndex(s)).toBe(0)
    expect(nextIndex({ ...s, currentIndex: 2 }, true)).toBe(-1)
    expect(previousIndex({ ...s, currentIndex: 0 })).toBe(-1)
  })

  it('repeat ALL wraps; repeat ONE replays only on natural end (Media3 navigation treats ONE as OFF)', () => {
    const s = q(['a', 'b'], { currentIndex: 1 })
    expect(nextIndex({ ...s, repeat: 'all' }, true)).toBe(0)
    expect(previousIndex({ ...s, currentIndex: 0, repeat: 'all' })).toBe(1)
    expect(nextIndex({ ...s, repeat: 'one' }, true)).toBe(1)
    expect(nextIndex({ ...s, repeat: 'one' }, false)).toBe(-1)
    expect(nextIndex({ ...s, currentIndex: 0, repeat: 'one' }, false)).toBe(1)
  })

  it('repeat cycles OFF -> ONE -> ALL -> OFF', () => {
    expect(nextRepeatMode('off')).toBe('one')
    expect(nextRepeatMode('one')).toBe('all')
    expect(nextRepeatMode('all')).toBe('off')
  })

  it('shuffle order starts with the current entry and covers every entry once', () => {
    const s = q(['a', 'b', 'c', 'd'], { currentIndex: 2 })
    const order = shuffleOrderFrom(s.entries, s.entries[2].key, () => 0.3)
    expect(order[0]).toBe('k-c')
    expect([...order].sort()).toEqual(['k-a', 'k-b', 'k-c', 'k-d'])
    const shuffledQ = { ...s, shuffle: true, order }
    expect(playOrder(shuffledQ)[0]).toBe(2)
    expect(nextIndex(shuffledQ, false)).toBe(playOrder(shuffledQ)[1])
  })

  it('append to an empty queue starts at 0; append keeps the current entry', () => {
    const r = appendEntries(q([]), [song('a'), song('b')])
    expect(r.currentIndex).toBe(0)
    expect(r.entries.map((e) => e.id)).toEqual(['a', 'b'])
    const r2 = appendEntries({ ...q(['a', 'b']), currentIndex: 1 }, [song('c')])
    expect(r2.currentIndex).toBe(1)
    expect(r2.entries.map((e) => e.id)).toEqual(['a', 'b', 'c'])
    expect(r2.order).toEqual(['k-a', 'k-b', 'k-c'])
  })

  it('a shuffled new queue starts at the first entry of its shuffle order', () => {
    const r = appendEntries(q([], { shuffle: true }), [song('a'), song('b'), song('c')])
    expect(r.entries[r.currentIndex].key).toBe(r.order[0])
  })

  it('play next inserts after the current entry, also in the shuffle order', () => {
    const s = q(['a', 'b', 'c'], { currentIndex: 0 })
    expect(insertNext(s, [song('x')]).entries.map((e) => e.id)).toEqual(['a', 'x', 'b', 'c'])
    const sh = { ...s, shuffle: true, order: ['k-a', 'k-c', 'k-b'] }
    expect(insertNext(sh, [song('x')]).order).toEqual(['k-a', 'k-x', 'k-c', 'k-b'])
    expect(insertNext(q([]), [song('x')]).currentIndex).toBe(0)
  })

  it('the same song can be queued twice (keys are per entry)', () => {
    const r = appendEntries(q(['a']), [song('a', 'k-a2')])
    expect(r.entries.map((e) => e.key)).toEqual(['k-a', 'k-a2'])
    expect(queuedIds(r.entries)).toEqual(new Set(['a']))
  })

  it('moving keeps the current entry playing', () => {
    const s = q(['a', 'b', 'c', 'd'], { currentIndex: 1 })
    expect(moveEntry(s, 1, 3)?.currentIndex).toBe(3)
    expect(moveEntry(s, 0, 2)?.currentIndex).toBe(0)
    expect(moveEntry(s, 3, 0)?.currentIndex).toBe(2)
    expect(moveEntry(s, 2, 3)?.currentIndex).toBe(1)
    expect(moveEntry(s, 0, 0)).toBeNull()
    expect(moveEntry(s, 0, 9)).toBeNull()
  })

  it('removing entries before / at / after the current one', () => {
    const s = q(['a', 'b', 'c'], { currentIndex: 1 })
    expect(removeEntry(s, 0)).toMatchObject({ currentIndex: 0, currentChanged: false })
    expect(removeEntry(s, 2)).toMatchObject({ currentIndex: 1, currentChanged: false })
    expect(removeEntry(s, 1)).toMatchObject({ currentIndex: 1, currentChanged: true, ended: false })
    const last = { ...s, currentIndex: 2 }
    expect(removeEntry(last, 2)).toMatchObject({ currentIndex: 1, currentChanged: true, ended: true })
    expect(removeEntry({ ...last, repeat: 'all' }, 2)).toMatchObject({ currentIndex: 0, ended: false })
    expect(removeEntry(q(['a']), 0)).toMatchObject({ entries: [], ended: true })
  })
})
