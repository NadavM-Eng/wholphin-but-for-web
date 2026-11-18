import { describe, expect, it } from 'vitest'
import { directionalScore, pickNext, type Rect } from './spatialNav'

const box = (left: number, top: number, w = 100, h = 150): Rect => ({ left, top, right: left + w, bottom: top + h })

// Two rows of posters: row A at y=0, row B at y=200, 110px pitch.
const rowA = [0, 110, 220, 330].map((x) => box(x, 0))
const rowB = [0, 110, 220, 330, 440].map((x) => box(x + 40, 200))

describe('directionalScore', () => {
  it('rejects candidates behind or beside', () => {
    expect(directionalScore(rowA[1], rowA[0], 'right')).toBeNull()
    expect(directionalScore(rowA[1], rowA[2], 'left')).toBeNull()
    expect(directionalScore(rowB[0], rowA[0], 'down')).toBeNull()
    expect(directionalScore(rowA[0], rowA[1], 'down')).toBeNull()
  })
  it('scores the adjacent item lowest', () => {
    const near = directionalScore(rowA[0], rowA[1], 'right')!
    const far = directionalScore(rowA[0], rowA[2], 'right')!
    expect(near).toBeLessThan(far)
  })
})

describe('pickNext', () => {
  it('moves along a row', () => {
    expect(pickNext(rowA[1], rowA, 'right')).toBe(2)
    expect(pickNext(rowA[1], rowA, 'left')).toBe(0)
    expect(pickNext(rowA[3], rowA, 'right')).toBe(-1)
  })

  it('prefers staying in the row over a closer item in another row', () => {
    const all = [...rowA, ...rowB]
    // From A1 going right: A2 (same row) must win over B1/B2 which are diagonally right.
    expect(all[pickNext(rowA[1], all, 'right')]).toBe(rowA[2])
  })

  it('moves down to the overlapping item of the next row', () => {
    const all = [...rowA, ...rowB]
    // A2 spans x 220..320; B1 spans 150..250 and B2 260..360: both overlap, nearest centre wins (B2 centre 310 vs 200).
    expect(all[pickNext(rowA[2], all, 'down')]).toBe(rowB[2])
    expect(all[pickNext(rowB[0], all, 'up')]).toBe(rowA[0])
  })

  it('skips rows that are further away', () => {
    const rowC = [box(0, 400)]
    const all = [...rowA, ...rowC, ...rowB]
    expect(all[pickNext(rowA[0], all, 'down')]).toBe(rowB[0])
  })

  it('handles a tall element next to small ones (drawer next to content)', () => {
    const drawer = box(0, 0, 60, 800)
    const content = [box(100, 300), box(100, 0)]
    // both overlap vertically; the one nearest the drawer's centre line wins
    expect(content[pickNext(drawer, content, 'right')]).toBe(content[0])
    expect(pickNext(content[0], [drawer], 'left')).toBe(0)
  })

  it('prefers a far item in the beam over a near one outside it for Left/Right (Compose beamBeats)', () => {
    const from = { left: 260, top: 80, right: 310, bottom: 130 }
    const tabAbove = { left: 330, top: 10, right: 400, bottom: 50 }
    const farRight = { left: 1700, top: 80, right: 1750, bottom: 130 }
    expect(pickNext(from, [tabAbove, farRight], 'right')).toBe(1)
    expect(pickNext(from, [tabAbove], 'right')).toBe(0)
  })
})