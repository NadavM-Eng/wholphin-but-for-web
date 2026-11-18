import { act, cleanup, render } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { bringIntoView } from '../../ui/lib/bringIntoView'
import { installInputModality, resetInputModalityForTests, restoreFocusToOpeners } from '../../ui/lib/inputModality'
import { registerShellElement } from './shellFocus'
import { recoverLostFocus, useFocusRestore } from './useFocusRestore'

vi.mock('../../ui/lib/bringIntoView', async (original) => ({ ...(await original<typeof import('../../ui/lib/bringIntoView')>()), bringIntoView: vi.fn() }))

// jsdom lays nothing out: every connected element gets a size
let rects: ReturnType<typeof vi.spyOn>
beforeAll(() => {
  rects = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (!this.isConnected) return new DOMRect(0, 0, 0, 0)
    const top = Array.from(document.querySelectorAll('*')).indexOf(this) * 10
    return new DOMRect(0, top, 100, 10)
  })
  installInputModality()
})
afterAll(() => rects.mockRestore())

function Root() {
  useFocusRestore()
  return <main data-page-root="" tabIndex={-1} />
}

const CARDS = ['a', 'b', 'c']
/** The grid as a re-layout leaves it: every card a new node. */
function build(ids: readonly string[] = CARDS) {
  const main = document.querySelector('main')!
  main.innerHTML = `<button data-focusable id="tab">Movies</button>` + ids.map((id) => `<a href="/item/${id}" data-focusable id="${id}">${id}</a>`).join('')
}
const el = (id: string) => document.getElementById(id) as HTMLElement
const key = (k: string) => (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
const press = () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
const frames = async (n = 3) => {
  for (let i = 0; i < n; i++) await new Promise<void>((r) => requestAnimationFrame(() => r()))
}

describe('focus that went away with its element', () => {
  beforeEach(() => {
    sessionStorage.clear()
    resetInputModalityForTests()
    const router = createMemoryRouter([{ path: '/library', element: <Root /> }], { initialEntries: ['/library'] })
    window.history.replaceState(null, '', '/library')
    render(<RouterProvider router={router} />)
    registerShellElement('page', document.querySelector('main'))
    build()
    vi.mocked(bringIntoView).mockClear()
  })
  afterEach(() => {
    cleanup()
    registerShellElement('page', null)
    document.body.innerHTML = ''
    window.history.replaceState(null, '', '/')
  })

  it('returns to the same item when the page shows it again (a new node), without moving the page after a pointer press', () => {
    press()
    el('b').focus()
    build()
    expect(document.activeElement).toBe(document.body)
    expect(recoverLostFocus()).toBe(true)
    expect(document.activeElement).toBe(el('b'))
    expect(bringIntoView).not.toHaveBeenCalled()
  })

  it('brings it into view when the keyboard acted last (the focus look is showing)', () => {
    el('c').focus()
    key('ArrowRight')
    build()
    expect(recoverLostFocus()).toBe(true)
    expect(document.activeElement).toBe(el('c'))
    expect(vi.mocked(bringIntoView).mock.calls).toEqual([[el('c')]])
  })

  it('the item is not shown any more: into the page as an arrow key with nothing focused would, or nowhere yet when asked to wait', () => {
    press()
    el('c').focus()
    build(['a', 'b'])
    // a re-layout still under way may show the item again
    expect(recoverLostFocus(false)).toBe(false)
    expect(document.activeElement).toBe(document.body)
    expect(recoverLostFocus()).toBe(true)
    expect(document.activeElement).toBe(el('tab'))
    expect(bringIntoView).not.toHaveBeenCalled()
  })

  it('leaves focus that something holds, and the keys of an open dialog', () => {
    el('b').focus()
    el('a').focus()
    expect(recoverLostFocus()).toBe(false)
    expect(document.activeElement).toBe(el('a'))
    build()
    document.body.insertAdjacentHTML('beforeend', '<div role="dialog" data-focus-trap id="dialog"></div>')
    expect(recoverLostFocus()).toBe(false)
    expect(document.activeElement).toBe(document.body)
    el('dialog').remove()
    expect(recoverLostFocus()).toBe(true)
    expect(document.activeElement).toBe(el('a'))
  })

  it('a window resize that rebuilds the focused card gives focus back to it', async () => {
    el('b').focus()
    key('ArrowRight')
    window.dispatchEvent(new Event('resize'))
    // the grid builds its cards anew a moment later, and once more
    build()
    await frames()
    expect(document.activeElement).toBe(el('b'))
    build()
    await frames()
    expect(document.activeElement).toBe(el('b'))
  })

  it('also when the card went inside the resize event, before this listener ran', async () => {
    el('b').focus()
    key('ArrowRight')
    build()
    window.dispatchEvent(new Event('resize'))
    await frames()
    expect(document.activeElement).toBe(el('b'))
  })

  it('waits for the re-layout before it settles for the first element', async () => {
    vi.useFakeTimers({ toFake: ['performance'] })
    try {
      el('c').focus()
      key('ArrowRight')
      window.dispatchEvent(new Event('resize'))
      build(['a', 'b'])
      await frames()
      expect(document.activeElement).toBe(document.body)
      // the item is back before the layout has settled
      build()
      await frames()
      expect(document.activeElement).toBe(el('c'))
      // gone for good
      build(['a', 'b'])
      await frames()
      expect(document.activeElement).toBe(document.body)
      vi.advanceTimersByTime(1100)
      await frames()
      expect(document.activeElement).toBe(el('tab'))
    } finally {
      vi.useRealTimers()
    }
  })

  it('a resize leaves focus the user put on nothing, focus that is held, and ends at the next press', async () => {
    // a press on empty space: nothing focused by choice, the card it was on is rebuilt later
    el('b').focus()
    press()
    el('b').blur()
    window.dispatchEvent(new Event('resize'))
    build()
    await frames()
    expect(document.activeElement).toBe(document.body)
    // focus on an element that stays
    el('a').focus()
    window.dispatchEvent(new Event('resize'))
    await frames()
    expect(document.activeElement).toBe(el('a'))
    // the user acts while the layout settles: the watch is over
    window.dispatchEvent(new Event('resize'))
    key('Escape')
    build()
    await frames()
    expect(document.activeElement).toBe(document.body)
  })

  it('an overlay that closes with every opener gone hands focus to the same item, not to <body>', async () => {
    el('b').focus()
    key('ContextMenu')
    const opener = el('b')
    // the dialog is open; the window is resized and the grid rebuilt meanwhile; long after, Escape closes it
    build()
    restoreFocusToOpeners([opener])
    await act(async () => {})
    expect(document.activeElement).toBe(el('b'))
    expect(document.activeElement).not.toBe(opener)
  })
})
