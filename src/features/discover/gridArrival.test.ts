import { describe, expect, it } from 'vitest'
import { gridArrivalStep, type GridArrivalState } from './gridArrival'

const base: GridArrivalState = {
  done: false,
  isPending: false,
  fetchError: false,
  loaded: 20,
  start: 0,
  hasNextPage: true,
  isFetchingNextPage: false,
}

describe('gridArrivalStep', () => {
  it('arrives at card 0 on the first load (genre card, start 0)', () => {
    expect(gridArrivalStep(base)).toBe('arrive')
  })
  it('waits while the first page loads or once positioned', () => {
    expect(gridArrivalStep({ ...base, isPending: true })).toBe('wait')
    expect(gridArrivalStep({ ...base, done: true })).toBe('wait')
  })
  it('loads pages until the start index is in range ("View more", start 20)', () => {
    expect(gridArrivalStep({ ...base, start: 20 })).toBe('fetch')
    expect(gridArrivalStep({ ...base, start: 20, isFetchingNextPage: true })).toBe('wait')
    expect(gridArrivalStep({ ...base, start: 20, loaded: 40 })).toBe('arrive')
  })
  it('gives up on an empty or short list and on a failed page', () => {
    expect(gridArrivalStep({ ...base, loaded: 0, hasNextPage: false })).toBe('give-up')
    expect(gridArrivalStep({ ...base, start: 20, hasNextPage: false })).toBe('give-up')
    expect(gridArrivalStep({ ...base, start: 20, fetchError: true })).toBe('give-up')
  })
})
