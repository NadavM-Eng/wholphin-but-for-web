import { afterEach, describe, expect, it } from 'vitest'
import { fieldArrowExit, inputArrowExit } from './fieldArrowExit'

const f = (value: string, start: number, end = start) => ({ value, selectionStart: start, selectionEnd: end })

describe('fieldArrowExit', () => {
  it('Up and Down always leave, with or without text', () => {
    expect(fieldArrowExit('ArrowDown', f('', 0), false, false)).toBe('down')
    expect(fieldArrowExit('ArrowDown', f('Late', 2), false, false)).toBe('down')
    expect(fieldArrowExit('ArrowUp', f('Late', 4), false, false)).toBe('up')
  })

  it('Left/Right leave only at the matching edge', () => {
    expect(fieldArrowExit('ArrowLeft', f('Late', 0), false, false)).toBe('left')
    expect(fieldArrowExit('ArrowLeft', f('Late', 2), false, false)).toBeNull()
    expect(fieldArrowExit('ArrowRight', f('Late', 4), false, false)).toBe('right')
    expect(fieldArrowExit('ArrowRight', f('Late', 3), false, false)).toBeNull()
    expect(fieldArrowExit('ArrowRight', f('Late', 0, 4), false, false)).toBeNull()
    expect(fieldArrowExit('ArrowLeft', f('Late', 0, 4), false, false)).toBeNull()
  })

  it('an empty field leaves both ways', () => {
    expect(fieldArrowExit('ArrowLeft', f('', 0), false, false)).toBe('left')
    expect(fieldArrowExit('ArrowRight', f('', 0), false, false)).toBe('right')
  })

  it('mirrors Left/Right in RTL', () => {
    expect(fieldArrowExit('ArrowLeft', f('abc', 3), true, false)).toBe('left')
    expect(fieldArrowExit('ArrowRight', f('abc', 0), true, false)).toBe('right')
    expect(fieldArrowExit('ArrowLeft', f('abc', 0), true, false)).toBeNull()
    expect(fieldArrowExit('ArrowRight', f('abc', 3), true, false)).toBeNull()
  })

  it('leaves modified keys and other keys to the field', () => {
    expect(fieldArrowExit('ArrowDown', f('', 0), false, true)).toBeNull()
    expect(fieldArrowExit('a', f('', 0), false, false)).toBeNull()
    expect(fieldArrowExit('Escape', f('', 0), false, false)).toBeNull()
  })
})

describe('inputArrowExit', () => {
  afterEach(() => document.body.replaceChildren())

  const key = (k: string, target: EventTarget | null, mods: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) => ({
    key: k,
    target,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...mods,
  })

  it('reads the caret and the direction of the input', () => {
    const input = document.createElement('input')
    document.body.append(input)
    input.value = 'Late'
    input.setSelectionRange(4, 4)
    expect(inputArrowExit(key('ArrowRight', input))).toBe('right')
    expect(inputArrowExit(key('ArrowLeft', input))).toBeNull()
    input.dir = 'rtl'
    expect(inputArrowExit(key('ArrowLeft', input))).toBe('left')
  })

  it('a modifier keeps the key in the field', () => {
    const input = document.createElement('input')
    document.body.append(input)
    expect(inputArrowExit(key('ArrowDown', input, { shiftKey: true }))).toBeNull()
    expect(inputArrowExit(key('ArrowDown', input, { altKey: true }))).toBeNull()
  })

  it('ignores targets that are not text inputs', () => {
    const button = document.createElement('button')
    document.body.append(button)
    expect(inputArrowExit(key('ArrowDown', button))).toBeNull()
    expect(inputArrowExit(key('ArrowDown', null))).toBeNull()
  })
})
