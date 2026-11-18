import { describe, expect, it } from 'vitest'
import { pansByDragging, touchIntent } from './touchIntent'

describe('what a finger on a draggable control means', () => {
  const SLOP = 10

  it('is undecided inside the slop, in every direction', () => {
    expect(touchIntent(0, 0, SLOP)).toBe('undecided')
    expect(touchIntent(10, 0, SLOP)).toBe('undecided')
    expect(touchIntent(-10, 3, SLOP)).toBe('undecided')
    expect(touchIntent(0, -10, SLOP)).toBe('undecided')
    expect(touchIntent(7, 7, SLOP)).toBe('undecided')
  })

  it('is a sideways drag once the sideways travel passes the slop and is the larger one', () => {
    expect(touchIntent(11, 0, SLOP)).toBe('side')
    expect(touchIntent(-11, 4, SLOP)).toBe('side')
    expect(touchIntent(40, -39, SLOP)).toBe('side')
  })

  it('is the page scroll when the finger went up or down, however far sideways a slightly diagonal one drifts', () => {
    expect(touchIntent(0, 11, SLOP)).toBe('scroll')
    expect(touchIntent(3, -11, SLOP)).toBe('scroll')
    expect(touchIntent(60, 220, SLOP)).toBe('scroll')
    expect(touchIntent(-60, -61, SLOP)).toBe('scroll')
    // exactly diagonal: not further sideways than up, so not the control's
    expect(touchIntent(30, 30, SLOP)).toBe('scroll')
  })

  it('the slop is the caller\'s size (dp at the interface scale)', () => {
    expect(touchIntent(15, 0, 10)).toBe('side')
    expect(touchIntent(15, 0, 20)).toBe('undecided')
  })

  it('a finger and a pen pan the page by dragging, a mouse does not', () => {
    expect(pansByDragging('touch')).toBe(true)
    expect(pansByDragging('pen')).toBe(true)
    expect(pansByDragging('mouse')).toBe(false)
    expect(pansByDragging('')).toBe(false)
  })
})
