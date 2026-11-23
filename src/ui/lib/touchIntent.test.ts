import { describe, expect, it } from 'vitest'
import { keepPressToControl, pansByDragging, touchIntent } from './touchIntent'

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

describe('a press on a control that follows the pointer belongs to the control alone', () => {
  const build = () => {
    const page = document.createElement('div')
    page.innerHTML = '<p>text</p><div class="control"><span class="thumb"></span></div>'
    document.body.appendChild(page)
    const control = page.querySelector<HTMLElement>('.control')!
    /** true when the browser's own action for the event was refused */
    const refused = (type: string, on: Element) => !on.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
    const pointer = (type: string, on: Element, button = 0) => !on.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button }))
    return { page, control, thumb: control.firstElementChild!, text: page.querySelector('p')!, refused, pointer }
  }
  const BROWSER_ANSWERS = ['dragstart', 'selectstart']

  it('from the press to the release, no drag-and-drop and no text selection begins: on the control, on a part of it, or beside it', () => {
    const { page, control, thumb, text, refused, pointer } = build()
    const undo = keepPressToControl(control)
    pointer('pointerdown', thumb)
    for (const type of BROWSER_ANSWERS) {
      expect(refused(type, control), type).toBe(true)
      expect(refused(type, thumb), `${type} on a part of it`).toBe(true)
      // the control can have moved from under the press point: the browser then begins on what is there now
      expect(refused(type, text), `${type} beside it`).toBe(true)
    }
    pointer('pointerup', text)
    for (const type of BROWSER_ANSWERS) for (const on of [control, thumb, text]) expect(refused(type, on), `${type} after the release`).toBe(false)
    undo()
    page.remove()
  })

  it('a cancelled press ends it too, and so does the next press when the release was never told (outside the window)', () => {
    const { page, control, thumb, text, refused, pointer } = build()
    const undo = keepPressToControl(control)
    pointer('pointerdown', thumb)
    pointer('pointercancel', thumb)
    for (const type of BROWSER_ANSWERS) expect(refused(type, text), `${type} after a cancel`).toBe(false)
    pointer('pointerdown', thumb)
    pointer('pointerdown', text)
    for (const type of BROWSER_ANSWERS) expect(refused(type, text), `${type} in a press elsewhere`).toBe(false)
    // a press on the control right after another one on it still counts
    pointer('pointerdown', thumb)
    pointer('pointerdown', thumb)
    for (const type of BROWSER_ANSWERS) expect(refused(type, thumb), `${type} in the second press`).toBe(true)
    undo()
    page.remove()
  })

  it('a window that loses focus during the press ends it: the release may then never be told', () => {
    const { page, control, thumb, text, refused, pointer } = build()
    const undo = keepPressToControl(control)
    pointer('pointerdown', thumb)
    window.dispatchEvent(new Event('blur'))
    for (const type of BROWSER_ANSWERS) for (const on of [control, text]) expect(refused(type, on), `${type} after the window lost focus`).toBe(false)
    undo()
    page.remove()
  })

  it('leaves the press itself to the browser (it moves focus), other buttons, and a page nobody presses the control on', () => {
    const { page, control, thumb, text, refused, pointer } = build()
    const undo = keepPressToControl(control)
    for (const type of BROWSER_ANSWERS) for (const on of [control, thumb, text]) expect(refused(type, on), `${type} without a press`).toBe(false)
    for (const type of ['pointerdown', 'mousedown', 'pointermove', 'click']) expect(pointer(type, thumb), type).toBe(false)
    pointer('pointerup', thumb)
    // the secondary button opens the context menu; a press beside the control is not the control's
    pointer('pointerdown', thumb, 2)
    pointer('pointerdown', text)
    for (const type of BROWSER_ANSWERS) expect(refused(type, text), type).toBe(false)
    undo()
    page.remove()
  })

  it('returns the undo, which also ends a press that is down', () => {
    const { page, control, thumb, refused, pointer } = build()
    const undo = keepPressToControl(control)
    pointer('pointerdown', thumb)
    undo()
    for (const type of BROWSER_ANSWERS) expect(refused(type, thumb), type).toBe(false)
    pointer('pointerdown', thumb)
    for (const type of BROWSER_ANSWERS) expect(refused(type, thumb), `${type} after the undo`).toBe(false)
    page.remove()
  })
})
