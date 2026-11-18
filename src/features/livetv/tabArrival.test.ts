// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { tabArrivalTarget } from './tabArrival'

function setup(content: string) {
  document.body.innerHTML = `
    <div id="page">
      <div role="tablist"><button role="tab" id="guide" aria-selected="false">G</button><button role="tab" id="dvr" aria-selected="true">D</button></div>
      <div id="body">${content}</div>
    </div>
    <nav><a id="drawer" href="#">L</a></nav>`
  return { page: document.getElementById('page')!, body: document.getElementById('body')! }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('tabArrivalTarget', () => {
  it('DVR: first row once loaded, on a direct load (focus on <body>)', () => {
    const { page, body } = setup('<div data-dvr-list><button data-focusable id="r0">a</button><button data-focusable>b</button></div>')
    expect(tabArrivalTarget(page, body, 1, true, true)).toBe(document.getElementById('r0'))
  })

  it('DVR: waits while loading', () => {
    const { page, body } = setup('<div>loading</div>')
    expect(tabArrivalTarget(page, body, 1, true, true)).toBe('wait')
  })

  it('DVR: an empty schedule gives the selected tab', () => {
    const { page, body } = setup('<div data-dvr-list><p>none</p></div>')
    document.getElementById('guide')!.focus()
    expect(tabArrivalTarget(page, body, 1, false, true)).toBe(document.getElementById('dvr'))
  })

  it('takes focus from the tab row even when the page may not take initial focus', () => {
    const { page, body } = setup('<div data-dvr-list><button data-focusable id="r0">a</button></div>')
    document.getElementById('guide')!.focus()
    expect(tabArrivalTarget(page, body, 1, false, true)).toBe(document.getElementById('r0'))
  })

  it('leaves focus the user placed elsewhere', () => {
    const { page, body } = setup('<div data-dvr-list><button data-focusable>a</button></div>')
    document.getElementById('drawer')!.focus()
    expect(tabArrivalTarget(page, body, 1, false, true)).toBeNull()
  })

  it('recording folder: first card, else wait', () => {
    const { page, body } = setup('<div data-grid-index="0"><a data-focusable href="#" id="c0">x</a></div>')
    expect(tabArrivalTarget(page, body, 2, true, true)).toBe(document.getElementById('c0'))
    body.innerHTML = ''
    expect(tabArrivalTarget(page, body, 2, true, true)).toBe('wait')
  })

  it('a tab chosen with a pointer keeps its focus', () => {
    const { page, body } = setup('<div data-dvr-list><button data-focusable id="r0">a</button></div>')
    document.getElementById('dvr')!.focus()
    expect(tabArrivalTarget(page, body, 1, false, false)).toBeNull()
    body.innerHTML = '<div data-grid-index="0"><a data-focusable href="#">x</a></div>'
    expect(tabArrivalTarget(page, body, 2, false, false)).toBeNull()
  })

  it('a page opened with nothing focused takes arrival focus whatever the last input was', () => {
    const { page, body } = setup('<div data-dvr-list><button data-focusable id="r0">a</button></div>')
    expect(tabArrivalTarget(page, body, 1, true, false)).toBe(document.getElementById('r0'))
  })
})
