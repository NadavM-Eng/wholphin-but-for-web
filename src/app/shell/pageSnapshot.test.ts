// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { capturePageSnapshot, dropPageSnapshot, isPanelPath, mountPageSnapshot, returnFromPanel } from './pageSnapshot'

function shell(html: string): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('data-shell', '')
  el.innerHTML = html
  document.body.append(el)
  return el
}

afterEach(() => {
  dropPageSnapshot()
  document.body.innerHTML = ''
  document.head.innerHTML = ''
})

describe('isPanelPath', () => {
  it('is Settings and its sub-screens only', () => {
    expect(isPanelPath('/settings')).toBe(true)
    expect(isPanelPath('/settings/advanced')).toBe(true)
    expect(isPanelPath('/settings/subtitles')).toBe(true)
    expect(isPanelPath('/home/settings')).toBe(false)
    expect(isPanelPath('/settingsx')).toBe(false)
    expect(isPanelPath('/')).toBe(false)
  })
})

describe('page snapshot', () => {
  it('copies the page without anything code or a label could address, and without media', () => {
    const style = document.createElement('style')
    style.textContent = '[data-card-state="played"] { opacity: 0.5 } .x[data-open] { width: 10px }'
    document.head.append(style)
    const owner = 's1:u1'
    const el = shell(`
      <nav data-shell-drawer="rail" data-open data-focus-trap><a data-focusable data-open href="/x" id="a1">Home</a></nav>
      <div data-shell-backdrop><img src="b.png" loading="lazy" decoding="async"></div>
      <main data-page-root tabindex="-1" data-focus-trap>
        <label for="q">Search</label><input id="q" data-focusable autofocus>
        <button data-focusable data-card-state="played" data-home-pos="0:0">Card</button>
        <div data-open id="expander">open part of the page</div>
        <svg><linearGradient id="g"></linearGradient></svg>
        <audio src="a.mp3" autoplay></audio><video src="v.mp4"></video>
      </main>`)
    ;(el.querySelector('#q') as HTMLInputElement).value = 'typed'
    capturePageSnapshot(el, '/search', owner)
    el.remove()

    const host = document.createElement('div')
    document.body.append(host)
    const unmount = mountPageSnapshot(host, owner)
    expect(unmount).toBeTypeOf('function')
    expect(host.querySelector('audio, video')).toBeNull()
    expect(host.querySelector('[data-focusable], [data-focus-trap], [data-page-root], [data-shell], [data-home-pos], [tabindex], [autofocus], [for]')).toBeNull()
    // ids go, except inside SVG (paint references)
    expect(host.querySelector('input')!.id).toBe('')
    expect(host.querySelector('linearGradient')!.id).toBe('g')
    // attributes a stylesheet selects on stay
    expect(host.querySelector('button')!.getAttribute('data-card-state')).toBe('played')
    // the drawer rests closed; an open part of the page stays open
    expect(host.querySelector('nav')!.hasAttribute('data-open')).toBe(false)
    expect(host.querySelector('nav a')!.hasAttribute('data-open')).toBe(false)
    expect(host.querySelector('main > div')!.hasAttribute('data-open')).toBe(true)
    expect((host.querySelector('input') as HTMLInputElement).value).toBe('typed')
    expect((host.querySelector('img') as HTMLImageElement).getAttribute('loading')).toBe('eager')

    unmount!()
    expect(host.childElementCount).toBe(0)
    // still there for the next Settings screen
    expect(mountPageSnapshot(host, owner)).toBeTypeOf('function')
  })

  it('is never shown to another session', () => {
    const el = shell('<main>page</main>')
    capturePageSnapshot(el, '/', 's1:u1')
    const host = document.createElement('div')
    expect(mountPageSnapshot(host, 's1:u2')).toBeUndefined()
    expect(host.childElementCount).toBe(0)
    expect(returnFromPanel('/', 's1:u2')).toBe(false)
    expect(document.querySelector('[inert]')).toBeNull()
  })

  it('covers the returning page only when it is the copied page, then is gone', () => {
    const owner = 's1:u1'
    capturePageSnapshot(shell('<main>page</main>'), '/favorites?tab=Movie', owner)
    expect(returnFromPanel('/', owner)).toBe(false)
    expect(document.querySelector('[inert]')).toBeNull()

    capturePageSnapshot(shell('<main>page</main>'), '/favorites?tab=Movie', owner)
    expect(returnFromPanel('/favorites?tab=Movie', owner)).toBe(true)
    const cover = document.querySelector<HTMLElement>('body > [inert]')!
    expect(cover.textContent).toBe('page')
    // used up: a second arrival (React StrictMode mounts twice) adds nothing
    expect(returnFromPanel('/favorites?tab=Movie', owner)).toBe(false)
    expect(document.querySelectorAll('body > [inert]').length).toBe(1)
  })
})

describe('the backdrop of the copied page', () => {
  const shown = { itemId: 'item1', imageUrl: 'http://server/Items/item1/Images/Backdrop', colors: null }

  it('is published again at once when the page returns, and marked so the image does not fade in', async () => {
    const { BACKDROP_NONE, isResumedBackdrop, useBackdropResult } = await import('./backdropService')
    useBackdropResult.setState(shown)
    capturePageSnapshot(shell('<main>page</main>'), '/', 's1:u1')
    // every full-screen page clears the published backdrop on entry
    useBackdropResult.setState(BACKDROP_NONE)
    expect(isResumedBackdrop(shown.imageUrl)).toBe(false)

    returnFromPanel('/', 's1:u1')
    expect(useBackdropResult.getState()).toEqual(shown)
    expect(isResumedBackdrop(shown.imageUrl)).toBe(true)
    expect(isResumedBackdrop('http://server/Items/other/Images/Backdrop')).toBe(false)
    useBackdropResult.setState(BACKDROP_NONE)
  })

  it('stays cleared when the arrival is another page or another user', async () => {
    const { BACKDROP_NONE, useBackdropResult } = await import('./backdropService')
    for (const [path, owner] of [
      ['/favorites', 's1:u1'],
      ['/', 's1:u2'],
    ]) {
      useBackdropResult.setState(shown)
      capturePageSnapshot(shell('<main>page</main>'), '/', 's1:u1')
      useBackdropResult.setState(BACKDROP_NONE)
      returnFromPanel(path, owner)
      expect(useBackdropResult.getState()).toEqual(BACKDROP_NONE)
    }
  })
})
