import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { focusFirst, focusInto, initSpatialNav, moveFocus, setBeamEdge } from './spatialNav'

vi.mock('../ui/lib/bringIntoView', () => ({ bringIntoView: vi.fn() }))

// jsdom lays nothing out: each element's box comes from its data-box="left,top,width,height"
let rects: ReturnType<typeof vi.spyOn>
let stop: () => void
beforeAll(() => {
  rects = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const [l, t, w, h] = (this.dataset.box ?? '0,0,0,0').split(',').map(Number)
    return new DOMRect(l, t, w, h)
  })
  stop = initSpatialNav()
})
afterAll(() => {
  rects.mockRestore()
  stop()
})
afterEach(() => {
  document.body.innerHTML = ''
})

const el = (id: string) => document.getElementById(id) as HTMLElement
const b = (id: string, box: string, extra = '') => `<button id="${id}" data-focusable data-box="${box}" ${extra}>${id}</button>`

describe('focusFirst', () => {
  it('is the top-left element in a left-to-right row', () => {
    document.body.innerHTML = `<div id="tabs">${b('guide', '100,10,80,30')}${b('dvr', '190,10,80,30')}${b('rec', '280,10,80,30')}</div>${b('card', '100,100,80,80')}`
    expect(focusFirst(document)).toBe(true)
    expect(document.activeElement).toBe(el('guide'))
  })

  it('is the top-right element where the top row runs right to left (the first tab in Hebrew)', () => {
    // DOM order = reading order: Guide is rightmost
    document.body.innerHTML = `<div id="tabs" dir="rtl">${b('guide', '1229,10,80,30')}${b('dvr', '1094,10,80,30')}${b('rec', '977,10,80,30')}</div><div dir="rtl">${b('card', '1229,100,80,80')}</div>`
    expect(focusFirst(document)).toBe(true)
    expect(document.activeElement).toBe(el('guide'))
  })

  it('keeps top-left inside a left-to-right island of a right-to-left page', () => {
    document.body.innerHTML = `<div dir="rtl"><div dir="ltr">${b('a', '100,10,80,30')}${b('z', '900,10,80,30')}</div></div>`
    expect(focusFirst(document)).toBe(true)
    expect(document.activeElement).toBe(el('a'))
  })

  it('still prefers the element marked as default', () => {
    document.body.innerHTML = `<div dir="rtl">${b('guide', '1229,10,80,30')}${b('dvr', '1094,10,80,30', 'data-focus-default')}</div>`
    expect(focusFirst(document)).toBe(true)
    expect(document.activeElement).toBe(el('dvr'))
  })
})

describe('a grid that hands focus back to its last focused card (data-focus-enter="last")', () => {
  // two rows of three cards and a letter column to the right of them
  const grid = () => {
    document.body.innerHTML = `
      <div id="root" data-focus-group>
        <div id="header">${b('sort', '0,0,40,40')}${b('view', '50,0,40,40')}${b('play', '500,0,40,40')}</div>
        <div id="grid" data-focus-group data-focus-enter="last">
          ${b('c0', '0,100,100,150')}${b('c1', '110,100,100,150')}${b('c2', '220,100,100,150')}
          ${b('c3', '0,260,100,150')}${b('c4', '110,260,100,150')}${b('c5', '220,260,100,150')}
        </div>
        <div id="letters">${b('la', '560,100,20,20')}${b('lb', '560,280,20,20')}</div>
      </div>`
  }

  it('Left from the letter column returns to the card focus came from, not to the card level with the letter', () => {
    grid()
    el('c2').focus()
    el('lb').focus()
    expect(moveFocus('left')).toBe(true)
    expect(document.activeElement).toBe(el('c2'))
  })

  it('goes to the nearest card when the remembered one is gone (scrolled out of a virtual grid) or there is none yet', () => {
    grid()
    el('lb').focus()
    expect(moveFocus('left')).toBe(true)
    expect(document.activeElement).toBe(el('c5'))
    el('c2').focus()
    el('lb').focus()
    el('c2').remove()
    expect(moveFocus('left')).toBe(true)
    expect(document.activeElement).toBe(el('c5'))
  })

  it('Up from the first row reaches the header of the same group before a nearer-looking tab row outside it', () => {
    grid()
    // a tab straight above the third card: by distance alone it beats the header buttons, which are off to the sides
    document.body.insertAdjacentHTML('afterbegin', `<div id="tabs">${b('tab', '230,-60,80,30')}</div>`)
    el('c2').focus()
    expect(moveFocus('up')).toBe(true)
    expect(document.activeElement).toBe(el('view'))
    // and Down from the header comes back to the card it left
    expect(moveFocus('down')).toBe(true)
    expect(document.activeElement).toBe(el('c2'))
    // from the header, Up goes on to the tabs
    el('view').focus()
    expect(moveFocus('up')).toBe(true)
    expect(document.activeElement).toBe(el('tab'))
  })

  it('a letter below every card row: by geometry the move belongs to the shell (the rail is in its beam), focusInto still enters the grid', () => {
    grid()
    document.body.insertAdjacentHTML('beforeend', b('low', '560,600,20,20'))
    el('letters').appendChild(el('low'))
    el('c1').focus()
    el('low').focus()
    setBeamEdge(() => true)
    try {
      expect(moveFocus('left')).toBe(false)
      expect(focusInto(el('grid'), 'left')).toBe(true)
      expect(document.activeElement).toBe(el('c1'))
      // nothing remembered (the card is gone): the first card
      el('low').focus()
      el('c1').remove()
      expect(focusInto(el('grid'), 'left')).toBe(true)
      expect(document.activeElement).toBe(el('c0'))
    } finally {
      setBeamEdge(null)
    }
  })
})

describe('elements that cannot take focus', () => {
  it('skips one that is hidden with visibility (a collapsed header keeps its box)', () => {
    document.body.innerHTML = `${b('hidden', '0,0,40,40')}${b('shown', '0,100,40,40')}${b('from', '0,200,40,40')}`
    const hidden = el('hidden') as HTMLElement & { checkVisibility?: unknown }
    // jsdom has no checkVisibility: an engine that does reports the collapsed header as not visible
    HTMLElement.prototype.checkVisibility = function (this: HTMLElement) {
      return this !== hidden
    }
    try {
      el('shown').remove()
      el('from').focus()
      expect(moveFocus('up')).toBe(false)
      expect(document.activeElement).toBe(el('from'))
    } finally {
      delete (HTMLElement.prototype as { checkVisibility?: unknown }).checkVisibility
    }
  })
})
