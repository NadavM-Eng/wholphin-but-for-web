import { describe, expect, it } from 'vitest'
import { spaceAbove } from './useHomeFocus'

describe('spaceAbove', () => {
  it('keeps the TV 50dp when the card fits below it', () => {
    expect(spaceAbove(50, 190, 400)).toBe(50)
    expect(spaceAbove(50, 190, 240)).toBe(50)
  })

  it('moves the card up to end at the list bottom in a short list', () => {
    expect(spaceAbove(50, 140, 180)).toBe(40)
  })

  it('aligns a card taller than the list with its top', () => {
    expect(spaceAbove(50, 190, 180)).toBe(0)
  })
})
