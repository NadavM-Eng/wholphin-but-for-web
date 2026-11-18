import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  endPageArrival,
  expectPageArrival,
  focusContentFromDrawer,
  focusFromNowhere,
  focusPageFromNowhere,
  focusPageWhenReady,
  installModalityTracking,
  leaveBarToPage,
  mayTakeInitialFocus,
  registerShellElement,
} from './shellFocus'
import { bringIntoView } from '../../ui/lib/bringIntoView'

// the scrolling itself is bringIntoView.test.ts's; here only who is scrolled
vi.mock('../../ui/lib/bringIntoView', async (original) => ({ ...(await original<typeof import('../../ui/lib/bringIntoView')>()), bringIntoView: vi.fn() }))

// jsdom lays nothing out: every connected element gets a size, in document order from the top
let rects: ReturnType<typeof vi.spyOn>
beforeAll(() => {
  rects = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (!this.isConnected) return new DOMRect(0, 0, 0, 0)
    const top = Array.from(document.querySelectorAll('*')).indexOf(this) * 10
    return new DOMRect(0, top, 100, 10)
  })
  HTMLElement.prototype.scrollIntoView = () => {}
  installModalityTracking()
})
afterAll(() => rects.mockRestore())

function shell() {
  document.body.innerHTML = `
    <nav id="drawer"><a href="#" data-focusable id="entry">Favorites</a></nav>
    <div id="content" tabindex="-1">
      <button data-focusable id="back">Back</button>
      <main id="page" tabindex="-1">
        <button data-focusable id="tab">Movies</button>
        <a href="#" data-focusable id="card0">one</a>
        <a href="#" data-focusable id="card1">two</a>
      </main>
    </div>`
  const el = (id: string) => document.getElementById(id) as HTMLElement
  registerShellElement('drawer', el('drawer'))
  registerShellElement('content', el('content'))
  registerShellElement('page', el('page'))
  return el
}

describe('focus back into the page', () => {
  let el: (id: string) => HTMLElement
  beforeEach(() => {
    el = shell()
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('an arrow key with nothing focused returns to the last focused element of the page', () => {
    el('card1').focus()
    el('card1').blur()
    expect(document.activeElement).toBe(document.body)
    expect(focusPageFromNowhere()).toBe(true)
    expect(document.activeElement).toBe(el('card1'))
  })

  it('also when focus is parked on the page area itself', () => {
    el('card1').focus()
    el('page').focus()
    expect(focusPageFromNowhere()).toBe(true)
    expect(document.activeElement).toBe(el('card1'))
  })

  it('goes to the first element when the remembered one was removed', () => {
    el('card1').focus()
    el('card1').remove()
    expect(focusPageFromNowhere()).toBe(true)
    expect(document.activeElement).toBe(el('tab'))
  })

  it('goes to the first element when the remembered one no longer takes focus', () => {
    el('tab').focus()
    el('tab').blur()
    ;(el('tab') as HTMLButtonElement).disabled = true
    expect(focusPageFromNowhere()).toBe(true)
    expect(document.activeElement).toBe(el('card0'))
  })

  it('does not return to the shell Back button, which leaving the drawer does', () => {
    el('card0').focus()
    el('back').focus()
    el('back').blur()
    expect(focusPageFromNowhere()).toBe(true)
    expect(document.activeElement).toBe(el('tab'))
    el('back').focus()
    el('entry').focus()
    expect(focusContentFromDrawer()).toBe(true)
    expect(document.activeElement).toBe(el('back'))
  })

  it('scrolls the restored element as an arrow-key move does (pivot rule, clear of the mini player), not "nearest"', () => {
    const native = vi.spyOn(HTMLElement.prototype, 'scrollIntoView')
    el('card1').focus()
    el('card1').blur()
    vi.mocked(bringIntoView).mockClear()
    expect(focusPageFromNowhere()).toBe(true)
    expect(vi.mocked(bringIntoView).mock.calls).toEqual([[el('card1')]])
    el('entry').focus()
    vi.mocked(bringIntoView).mockClear()
    expect(focusContentFromDrawer()).toBe(true)
    expect(vi.mocked(bringIntoView).mock.calls).toEqual([[el('card1')]])
    expect(native).not.toHaveBeenCalled()
    native.mockRestore()
  })

  it('reports false when the page has nothing to focus (the drawer is next)', () => {
    el('page').innerHTML = '<p>No results</p>'
    expect(focusPageFromNowhere()).toBe(false)
  })

  it('a page with nothing to focus: only the key that points at the drawer goes there', () => {
    // a page that is still loading (opened by a link or a reload), or an empty one
    el('page').innerHTML = '<p>Loading</p>'
    // Right, Up, Down: taken, nothing moves (the page's first focus can still land when its content shows)
    expect(focusFromNowhere(false, true)).toBe(true)
    expect(document.activeElement).toBe(document.body)
    expect(mayTakeInitialFocus()).toBe(true)
    expect(focusFromNowhere(true, true)).toBe(true)
    expect(document.activeElement).toBe(el('entry'))
    // phones have no rail: the key is left to the navigator
    el('entry').blur()
    expect(focusFromNowhere(true, false)).toBe(false)
    expect(focusFromNowhere(false, false)).toBe(false)
  })
})

describe('the music mini player under a page with nothing to focus', () => {
  let el: (id: string) => HTMLElement
  beforeEach(() => {
    el = shell()
    document.body.insertAdjacentHTML(
      'beforeend',
      '<aside data-mini-player><a href="#" data-focusable id="now">Song</a><button data-focusable id="pause">Pause</button></aside>',
    )
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })
  const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }))
  const down = () => focusFromNowhere(false, true, true)

  it('Down from a settled page (an error or empty text) enters the bar', () => {
    el('page').innerHTML = '<div role="alert"><p>An error occurred</p></div>'
    expect(down()).toBe(true)
    expect(document.activeElement).toBe(el('now'))
  })

  it('also without a rail (phones); the other arrows are as before', () => {
    el('page').innerHTML = '<p>No results</p>'
    expect(focusFromNowhere(false, false, false)).toBe(false)
    expect(document.activeElement).toBe(document.body)
    expect(focusFromNowhere(false, false, true)).toBe(true)
    expect(document.activeElement).toBe(el('now'))
  })

  it('Down while the page is still loading is taken and moves nothing', () => {
    el('page').innerHTML = '<div role="status" aria-busy="true" aria-label="Loading"></div>'
    expect(down()).toBe(true)
    expect(document.activeElement).toBe(document.body)
    // a spinner beside text that is already there
    el('page').innerHTML = '<h1>Movies</h1><div role="progressbar" aria-busy="true"></div>'
    expect(down()).toBe(true)
    expect(document.activeElement).toBe(document.body)
  })

  it('nor on a page that shows nothing (a redirect on its way)', () => {
    el('page').innerHTML = ''
    expect(down()).toBe(true)
    expect(document.activeElement).toBe(document.body)
    el('page').innerHTML = '<div> </div>'
    expect(down()).toBe(true)
    expect(document.activeElement).toBe(document.body)
  })

  it('nor while a page opened from the drawer is on its way', () => {
    el('page').innerHTML = '<p>No results</p>'
    el('entry').focus()
    expectPageArrival()
    el('entry').blur()
    expect(down()).toBe(true)
    expect(document.activeElement).toBe(document.body)
    endPageArrival()
  })

  it('a page with something to focus keeps the key', () => {
    expect(down()).toBe(true)
    expect(document.activeElement).toBe(el('tab'))
  })

  it('without the bar the key is taken as before', () => {
    document.querySelector('[data-mini-player]')!.remove()
    el('page').innerHTML = '<p>No results</p>'
    expect(down()).toBe(true)
    expect(document.activeElement).toBe(document.body)
  })

  it('the bar focus is the page’s to replace until the user acts on it', () => {
    el('page').innerHTML = '<p>No results</p>'
    expect(down()).toBe(true)
    expect(document.activeElement).toBe(el('now'))
    // content after all: the page's first focus may still land
    expect(mayTakeInitialFocus()).toBe(true)
    key('ArrowDown')
    expect(mayTakeInitialFocus()).toBe(true)
    key('Enter')
    expect(mayTakeInitialFocus()).toBe(false)
    // moving along the bar makes it the user's own focus too
    el('now').blur()
    expect(down()).toBe(true)
    el('pause').focus()
    expect(mayTakeInitialFocus()).toBe(false)
  })

  it('Up that the bar could not use returns to the page area; from there the keys work as with nothing focused', () => {
    el('page').innerHTML = '<p>No results</p>'
    expect(leaveBarToPage()).toBe(false)
    expect(down()).toBe(true)
    expect(leaveBarToPage()).toBe(true)
    expect(document.activeElement).toBe(el('page'))
    expect(focusFromNowhere(true, true, false)).toBe(true)
    expect(document.activeElement).toBe(el('entry'))
  })

  it('Up from the bar prefers the page’s last or first element when there is one', () => {
    el('card1').focus()
    el('now').focus()
    expect(leaveBarToPage()).toBe(true)
    expect(document.activeElement).toBe(el('card1'))
  })
})

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

describe('arrival from the drawer with the keyboard', () => {
  let el: (id: string) => HTMLElement
  beforeEach(() => {
    el = shell()
    el('entry').focus()
  })
  afterEach(async () => {
    // stop a running focusPageWhenReady
    endPageArrival()
    registerShellElement('page', null)
    await frame()
    document.body.innerHTML = ''
  })
  const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }))

  it('focus in the drawer is not for the page to take', () => {
    expect(mayTakeInitialFocus()).toBe(false)
  })

  it('a page whose cards are there in its first render takes focus before the shell looks, and keeps it', async () => {
    focusPageWhenReady()
    // the page's own first-focus request, in the same frame
    expect(mayTakeInitialFocus()).toBe(true)
    el('card0').focus()
    await frame()
    await frame()
    expect(document.activeElement).toBe(el('card0'))
    // it is the page's own focus now, not a placeholder another part may replace
    expect(mayTakeInitialFocus()).toBe(false)
  })

  it('also a page that asks in its first effects, before the shell was told the navigation is through', async () => {
    // Enter on the drawer entry
    expectPageArrival()
    expect(mayTakeInitialFocus()).toBe(true)
    el('card0').focus()
    focusPageWhenReady()
    await frame()
    await frame()
    expect(document.activeElement).toBe(el('card0'))
  })

  it('otherwise the shell focuses the first element as a placeholder the page may replace', async () => {
    focusPageWhenReady()
    await frame()
    expect(document.activeElement).toBe(el('tab'))
    expect(mayTakeInitialFocus()).toBe(true)
    // an arrow key that moves nothing (Down while the cards are still loading) and a lone modifier leave it
    key('ArrowDown')
    key('Shift')
    expect(mayTakeInitialFocus()).toBe(true)
    // activating it or typing into it makes it the user's own focus
    key('Enter')
    expect(mayTakeInitialFocus()).toBe(false)
  })

  it('the placeholder is over once focus moves off it, also when it comes back', async () => {
    focusPageWhenReady()
    await frame()
    expect(document.activeElement).toBe(el('tab'))
    el('card1').focus()
    el('tab').focus()
    expect(mayTakeInitialFocus()).toBe(false)
  })

  it('a key pressed before the shell looked does not decide where the first focus goes', async () => {
    // Enter on the drawer entry, then a key a few milliseconds later, focus still on the entry
    expectPageArrival()
    key('ArrowLeft')
    key('Shift')
    expect(mayTakeInitialFocus()).toBe(true)
    el('card0').focus()
    focusPageWhenReady()
    await frame()
    await frame()
    expect(document.activeElement).toBe(el('card0'))
  })

  it('the key towards the page, pressed before the new page shows, is taken and does not return to the page being left', () => {
    el('card1').focus()
    el('entry').focus()
    expectPageArrival()
    expect(focusContentFromDrawer()).toBe(true)
    expect(document.activeElement).toBe(el('entry'))
    // nor does an arrow key with nothing focused
    el('entry').blur()
    expect(focusFromNowhere(false, true)).toBe(true)
    expect(document.activeElement).toBe(document.body)
  })

  it('a navigation that never lands does not take the key for good', () => {
    vi.useFakeTimers({ toFake: ['performance'] })
    try {
      el('card1').focus()
      el('entry').focus()
      expectPageArrival()
      vi.advanceTimersByTime(11_000)
      // the first element: the remembered card was forgotten when the navigation started
      expect(focusContentFromDrawer()).toBe(true)
      expect(document.activeElement).toBe(el('tab'))
    } finally {
      vi.useRealTimers()
    }
  })

  it('once a drawer navigation has started the old page has no remembered focus', async () => {
    el('card1').focus()
    el('entry').focus()
    expectPageArrival()
    focusPageWhenReady()
    await frame()
    // the same page is still there (its own drawer entry was chosen): the first element, not the remembered card
    expect(document.activeElement).toBe(el('tab'))
  })

  it('while the page is still loading an arrow key keeps focus waiting on the page area; only the drawer key leaves', async () => {
    const cards = el('page').innerHTML
    el('page').innerHTML = ''
    expectPageArrival()
    focusPageWhenReady()
    await frame()
    expect(document.activeElement).toBe(el('page'))
    // Right, Down, Up: taken, nothing moves, and the drawer does not open
    key('ArrowRight')
    expect(focusFromNowhere(false, true)).toBe(true)
    expect(document.activeElement).toBe(el('page'))
    // the page's first focus still lands when its content shows
    expect(mayTakeInitialFocus()).toBe(true)
    el('page').innerHTML = cards
    await frame()
    await frame()
    expect(document.activeElement).toBe(el('tab'))
    expect(mayTakeInitialFocus()).toBe(true)
  })

  it('the key towards the drawer during loading goes there, and the page then leaves focus where the user put it', async () => {
    const cards = el('page').innerHTML
    el('page').innerHTML = ''
    expectPageArrival()
    focusPageWhenReady()
    await frame()
    expect(document.activeElement).toBe(el('page'))
    key('ArrowLeft')
    expect(focusFromNowhere(true, true)).toBe(true)
    expect(document.activeElement).toBe(el('entry'))
    el('page').innerHTML = cards
    await frame()
    await frame()
    expect(document.activeElement).toBe(el('entry'))
    expect(mayTakeInitialFocus()).toBe(false)
    // without a rail (phones) there is no drawer to go to
    el('entry').blur()
    el('page').innerHTML = ''
    expect(focusFromNowhere(true, false)).toBe(false)
  })

  it('a pointer press ends the arrival', () => {
    expectPageArrival()
    window.dispatchEvent(new Event('pointerdown'))
    expect(mayTakeInitialFocus()).toBe(false)
    el('card1').focus()
    el('entry').focus()
    expect(focusContentFromDrawer()).toBe(true)
    expect(document.activeElement).toBe(el('card1'))
  })

  it('leaving the shell ends the arrival (a full-screen page was opened from the drawer)', () => {
    expectPageArrival()
    endPageArrival()
    expect(mayTakeInitialFocus()).toBe(false)
  })

  it('a page with nothing to focus yet: focus is parked on the page area, then its first element takes it', async () => {
    const cards = el('page').innerHTML
    el('page').innerHTML = ''
    focusPageWhenReady()
    await frame()
    expect(document.activeElement).toBe(el('page'))
    expect(mayTakeInitialFocus()).toBe(true)
    el('page').innerHTML = cards
    await frame()
    await frame()
    expect(document.activeElement).toBe(el('tab'))
  })
})
