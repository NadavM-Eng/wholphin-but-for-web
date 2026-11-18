import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { contextMenuPoint } from './contextMenu'
import {
  captureOpener,
  captureOpeners,
  HELD_ATTR,
  holdFocusLook,
  installInputModality,
  interactionOrigin,
  keepFocusThroughPress,
  lastInput,
  lastPointerType,
  liveOpener,
  noInputYet,
  registerOverlay,
  resetInputModalityForTests,
  restoreFocusToOpeners,
  setOpenersGoneHandler,
} from './inputModality'

function pointer(type: string, target: Element, pointerType: string, extra: Record<string, number> = {}) {
  const e = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(e, { pointerType, screenX: 0, screenY: 0, movementX: 0, movementY: 0, ...extra })
  target.dispatchEvent(e)
}

function key(target: Element, k: string) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
}

const contextmenu = (x: number, y: number) => new MouseEvent('contextmenu', { clientX: x, clientY: y })

describe('input modality', () => {
  beforeAll(() => installInputModality())
  afterEach(() => {
    resetInputModalityForTests()
    document.body.innerHTML = ''
  })

  it('knows that no press has reached the document yet (the last input is then only a default)', () => {
    expect(lastInput()).toBe('pointer')
    expect(noInputYet()).toBe(true)
    // a lone modifier is no input
    key(document.body, 'Shift')
    expect(noInputYet()).toBe(true)
    pointer('pointerdown', document.body, 'mouse')
    expect(noInputYet()).toBe(false)
    resetInputModalityForTests()
    key(document.body, 'ArrowDown')
    expect(noInputYet()).toBe(false)
  })

  it('tracks the last input and pointer type', () => {
    pointer('pointerdown', document.body, 'touch')
    expect(lastInput()).toBe('pointer')
    expect(lastPointerType()).toBe('touch')
    key(document.body, 'ArrowDown')
    expect(lastInput()).toBe('keyboard')
    // a lone modifier and Ctrl shortcuts are not keyboard navigation
    pointer('pointerdown', document.body, 'mouse')
    key(document.body, 'Shift')
    expect(lastInput()).toBe('pointer')
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }))
    expect(lastInput()).toBe('pointer')
  })

  it('the Menu key and Shift+F10 open the focused element context menu once, also where the browser sends none', () => {
    const card = document.createElement('a')
    card.href = '#'
    document.body.appendChild(card)
    card.focus()
    const got: boolean[] = []
    card.addEventListener('contextmenu', (e) => got.push(e.isTrusted))
    key(card, 'ContextMenu')
    expect(got).toEqual([false])
    expect(contextMenuPoint(contextmenu(10, 10))).toBeNull() // keyboard: the centred dialog
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }))
    expect(got).toHaveLength(2)
    // nothing focused (or a text field): left to the browser
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    input.addEventListener('contextmenu', () => got.push(true))
    key(input, 'ContextMenu')
    expect(got).toHaveLength(2)
  })

  it('opens a right-click menu at the pointer, the Menu key and touch long-press as the dialog', () => {
    pointer('pointerdown', document.body, 'mouse')
    expect(contextMenuPoint(contextmenu(40, 50))).toEqual({ x: 40, y: 50 })
    key(document.body, 'ContextMenu')
    expect(contextMenuPoint(contextmenu(0, 0))).toBeNull()
    pointer('pointerdown', document.body, 'touch')
    expect(contextMenuPoint(contextmenu(40, 50))).toBeNull()
  })

  it('records the pressed element as the opener (Safari does not focus it on click)', () => {
    document.body.innerHTML = '<div><button id="b"><span id="s">x</span></button></div>'
    const b = document.getElementById('b')!
    pointer('pointerdown', document.getElementById('s')!, 'mouse')
    expect(interactionOrigin()).toBe(b)
    expect(document.activeElement).toBe(document.body)
    expect(captureOpener()).toBe(b)
    // an explicit opener wins
    document.body.insertAdjacentHTML('beforeend', '<a id="a" href="#">a</a>')
    const a = document.getElementById('a')!
    expect(captureOpener(a)).toBe(a)
  })

  it("returns to the card, not to its hidden 'more' button", () => {
    document.body.innerHTML =
      '<div data-card-scaler><a id="card" href="#" data-card-surface>card</a><button id="more" tabindex="-1">more</button></div>'
    pointer('pointerdown', document.getElementById('more')!, 'mouse')
    expect(captureOpener()).toBe(document.getElementById('card'))
  })

  it('keeps the focused look on an opener only while the keyboard owns the highlight', () => {
    document.body.innerHTML = '<button id="x">x</button>'
    const x = document.getElementById('x')!
    // opened with the mouse: the look follows the cursor, nothing is held
    pointer('pointerdown', x, 'mouse')
    holdFocusLook(x)()
    expect(x.hasAttribute(HELD_ATTR)).toBe(false)
    // opened with a key: held until released; a second hold on the same element does not end the first
    key(x, 'Enter')
    const release = holdFocusLook(x)
    expect(x.hasAttribute(HELD_ATTR)).toBe(true)
    holdFocusLook(x)()
    expect(x.hasAttribute(HELD_ATTR)).toBe(true)
    release()
    expect(x.hasAttribute(HELD_ATTR)).toBe(false)
    expect(() => holdFocusLook(null)()).not.toThrow()
  })

  it('uses the focused element when the last input was the keyboard', () => {
    document.body.innerHTML = '<button id="x">x</button><button id="y">y</button>'
    const y = document.getElementById('y')!
    pointer('pointerdown', document.getElementById('x')!, 'mouse')
    y.focus()
    key(y, 'Enter')
    expect(captureOpener()).toBe(y)
  })

  it('a dialog opened from a menu entry returns focus to what opened the menu once the entry is gone', () => {
    document.body.innerHTML = '<button id="more">More</button><div id="menu"><button id="entry">Add to playlist</button></div>'
    const more = document.getElementById('more')!
    const menu = document.getElementById('menu')!
    const entry = document.getElementById('entry')!
    // the menu, opened from "More" with the keyboard
    more.focus()
    key(more, 'Enter')
    const menuOpeners = captureOpeners()
    expect(menuOpeners).toEqual([more])
    registerOverlay(menu, menuOpeners)
    // Enter on the entry closes the menu and opens the dialog in one step: the entry is still there while the
    // dialog reads its opener
    entry.focus()
    key(entry, 'Enter')
    const dialogOpeners = captureOpeners()
    expect(dialogOpeners).toEqual([entry, more])
    // while the menu stays open under the dialog (a chooser inside a dialog) the entry is the opener
    expect(liveOpener(dialogOpeners)).toBe(entry)
    menu.remove()
    expect(liveOpener(dialogOpeners)).toBe(more)
    more.remove()
    expect(liveOpener(dialogOpeners)).toBeNull()
  })

  it('a dialog that replaces another one (chooser, then form, then the chooser again) keeps the first opener, and the chain does not grow', () => {
    document.body.innerHTML = '<button id="row">Seerr integration</button>'
    const row = document.getElementById('row')!
    const open = (html: string, focusId: string, from: HTMLElement) => {
      from.focus()
      key(from, 'Enter')
      const openers = captureOpeners()
      const panel = document.createElement('div')
      panel.innerHTML = html
      document.body.appendChild(panel)
      registerOverlay(panel, openers)
      const first = panel.querySelector<HTMLElement>(`#${focusId}`)!
      first.focus()
      return { panel, openers, first }
    }
    const chooser = open('<button id="m1">API Key</button>', 'm1', row)
    const form = open('<input id="f1">', 'f1', chooser.first)
    chooser.panel.remove()
    expect(liveOpener(form.openers)).toBe(row)
    // Escape on the form returns to the chooser: it opens while the form's field still has focus
    const chooser2 = open('<button id="m2">API Key</button>', 'm2', form.first)
    form.panel.remove()
    expect(chooser2.openers).toEqual([form.first, row])
    expect(liveOpener(chooser2.openers)).toBe(row)
    const form2 = open('<input id="f2">', 'f2', chooser2.first)
    chooser2.panel.remove()
    expect(form2.openers).toEqual([chooser2.first, row])
  })

  it('an overlay that closes gives focus to its nearest opener still there; with every opener gone the app is asked, unless something took focus', async () => {
    document.body.innerHTML = '<button id="more">More</button><button id="entry">Entry</button><button id="other">Other</button>'
    const more = document.getElementById('more')!
    const entry = document.getElementById('entry')!
    const other = document.getElementById('other')!
    const asked = vi.fn()
    setOpenersGoneHandler(asked)
    try {
      entry.remove()
      restoreFocusToOpeners([entry, more])
      expect(document.activeElement).toBe(more)
      await Promise.resolve()
      expect(asked).not.toHaveBeenCalled()
      // the opener was built anew while the dialog was open
      more.blur()
      more.remove()
      restoreFocusToOpeners([entry, more])
      expect(asked).not.toHaveBeenCalled()
      await Promise.resolve()
      expect(asked).toHaveBeenCalledTimes(1)
      // what closed the overlay moved focus itself (the next dialog, a pressed control)
      restoreFocusToOpeners([entry, more])
      other.focus()
      await Promise.resolve()
      expect(asked).toHaveBeenCalledTimes(1)
      // an overlay that had no opener (opened on a timer with nothing focused) asks for nothing
      other.blur()
      restoreFocusToOpeners([])
      await Promise.resolve()
      expect(asked).toHaveBeenCalledTimes(1)
    } finally {
      setOpenersGoneHandler(null)
    }
  })

  it('a press that closes an overlay does not move focus: the pointerdown and the mousedown that follows are cancelled, later presses are not', () => {
    const down = new Event('pointerdown', { cancelable: true })
    keepFocusThroughPress(down)
    expect(down.defaultPrevented).toBe(true)
    const mouse = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    document.body.dispatchEvent(mouse)
    expect(mouse.defaultPrevented).toBe(true)
    const next = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    document.body.dispatchEvent(next)
    expect(next.defaultPrevented).toBe(false)
    // no mousedown came (a cancelled pointerdown sends none in most engines): the next press is left alone
    keepFocusThroughPress(new Event('pointerdown', { cancelable: true }))
    pointer('pointerdown', document.body, 'mouse')
    const later = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    document.body.dispatchEvent(later)
    expect(later.defaultPrevented).toBe(false)
  })

  it('holds the keyboard-focused look through a press elsewhere, until its click (a pill that shrinks at mousedown moved the pressed button)', () => {
    document.body.innerHTML = '<button id="filter">Filter</button><button id="view">View options</button>'
    const filter = document.getElementById('filter')!
    const view = document.getElementById('view')!
    const visible = (el: Element) => el === document.activeElement
    const matches = Element.prototype.matches
    // jsdom has no :focus-visible; a script-focused element after a key press shows it
    Element.prototype.matches = function (this: Element, sel: string) {
      return sel === ':focus-visible' ? visible(this) : matches.call(this, sel)
    } as typeof matches
    try {
      filter.focus()
      key(filter, 'Escape')
      // a finger goes down on the other button: the tap's mousedown will move focus there
      pointer('pointerdown', view, 'touch')
      expect(filter.hasAttribute(HELD_ATTR)).toBe(true)
      view.focus()
      expect(filter.hasAttribute(HELD_ATTR)).toBe(true)
      view.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(filter.hasAttribute(HELD_ATTR)).toBe(false)
      // a press on the focused element itself holds nothing; neither does one while the pointer owns the highlight
      pointer('pointerdown', view, 'touch')
      expect(view.hasAttribute(HELD_ATTR)).toBe(false)
      filter.focus()
      key(filter, 'Escape')
      document.documentElement.setAttribute('data-pointer', '')
      pointer('pointerdown', view, 'mouse')
      expect(filter.hasAttribute(HELD_ATTR)).toBe(false)
      document.documentElement.removeAttribute('data-pointer')
      // a scroll gesture (pointercancel) and the next key release it too
      pointer('pointerdown', view, 'touch')
      expect(filter.hasAttribute(HELD_ATTR)).toBe(true)
      pointer('pointercancel', view, 'touch')
      expect(filter.hasAttribute(HELD_ATTR)).toBe(false)
      // an opener already marked by its open dialog is not touched
      filter.setAttribute(HELD_ATTR, '')
      pointer('pointerdown', view, 'touch')
      view.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(filter.hasAttribute(HELD_ATTR)).toBe(true)
    } finally {
      Element.prototype.matches = matches
    }
  })

  it('a press that ends without a click gives the held look back: after the pointerup, a tap a little later, a context menu at once', () => {
    document.body.innerHTML = '<button id="filter">Filter</button><p id="text">text</p>'
    const filter = document.getElementById('filter')!
    const text = document.getElementById('text')!
    const matches = Element.prototype.matches
    Element.prototype.matches = function (this: Element, sel: string) {
      return sel === ':focus-visible' ? this === document.activeElement : matches.call(this, sel)
    } as typeof matches
    vi.useFakeTimers()
    const held = () => filter.hasAttribute(HELD_ATTR)
    const press = (pointerType: string) => {
      filter.focus()
      key(filter, 'Escape')
      pointer('pointerdown', text, pointerType)
      expect(held()).toBe(true)
    }
    try {
      // the secondary or middle mouse button, or a pressed node that is gone at the release: no click follows
      press('mouse')
      pointer('pointerup', text, 'mouse')
      // a click would be dispatched right behind the pointerup, in the same task
      expect(held()).toBe(true)
      vi.advanceTimersByTime(0)
      expect(held()).toBe(false)
      // a finger: the tap's click may come later, and ends the hold when it does
      press('touch')
      pointer('pointerup', text, 'touch')
      vi.advanceTimersByTime(100)
      expect(held()).toBe(true)
      text.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(held()).toBe(false)
      // no click at all (a long press)
      press('touch')
      pointer('pointerup', text, 'touch')
      vi.advanceTimersByTime(399)
      expect(held()).toBe(true)
      vi.advanceTimersByTime(1)
      expect(held()).toBe(false)
      // a new press before that: the end of the earlier one does not end its hold
      press('touch')
      pointer('pointerup', text, 'touch')
      vi.advanceTimersByTime(300)
      pointer('pointerdown', text, 'mouse')
      expect(held()).toBe(true)
      vi.advanceTimersByTime(300)
      expect(held()).toBe(true)
      pointer('pointerup', text, 'mouse')
      vi.advanceTimersByTime(0)
      expect(held()).toBe(false)
      // the context menu of the press (the browser's own menu may keep the pointerup)
      press('mouse')
      text.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
      expect(held()).toBe(false)
      // an opener marked by its open dialog is not this hold's to end
      filter.setAttribute(HELD_ATTR, '')
      pointer('pointerdown', text, 'mouse')
      pointer('pointerup', text, 'mouse')
      vi.advanceTimersByTime(1000)
      expect(held()).toBe(true)
    } finally {
      vi.useRealTimers()
      Element.prototype.matches = matches
    }
  })
})
