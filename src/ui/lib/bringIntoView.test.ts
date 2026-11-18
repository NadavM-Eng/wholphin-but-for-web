import { describe, expect, it, vi } from 'vitest'
import { bringIntoView, nearestScrollTop, pivotScrollTop } from './bringIntoView'

describe('pivotScrollTop', () => {
  // a 540dp page: the reference pictures show a focused card's top at 162dp (.3 x 540)
  it('puts the item on the pivot when the scroll range allows', () => {
    expect(pivotScrollTop(427, 108, 540, 1400)).toBe(427 - 162)
    expect(pivotScrollTop(100, 108, 540, 1400)).toBe(0) // above the pivot already: stays at the start
    expect(pivotScrollTop(1300, 80, 540, 1400)).toBe(860) // clamped to the end
  })
  it('aligns an item taller than the room below the pivot to the trailing edge', () => {
    // 400dp item in a 540dp viewport: 378dp below the pivot is not enough, so its end meets the viewport end
    expect(pivotScrollTop(600, 400, 540, 2000)).toBe(600 - (540 - 400))
  })
  it('does nothing without a scroll range', () => {
    expect(pivotScrollTop(300, 50, 540, 540)).toBe(0)
  })
})

describe('nearestScrollTop', () => {
  // the player's chapter row (refshots 24-playback-chapters-chapters-2): 213dp cards every 229dp in a 944dp row
  it('leaves a fully visible item where it is', () => {
    expect(nearestScrollTop(474, 213, 944, 1400, 0)).toBe(0)
  })
  it('scrolls just far enough to show an item past either edge', () => {
    expect(nearestScrollTop(932, 213, 944, 1400, 0)).toBe(932 + 213 - 944)
    expect(nearestScrollTop(16, 213, 944, 1400, 300)).toBe(16)
  })
  it('keeps an item larger than the viewport that already covers it', () => {
    expect(nearestScrollTop(100, 1200, 944, 2000, 200)).toBe(200)
  })
})

describe('bringIntoView', () => {
  it('ignores detached elements and pages that cannot scroll', () => {
    const el = document.createElement('button')
    expect(() => bringIntoView(el)).not.toThrow()
    document.body.appendChild(el)
    expect(() => bringIntoView(el)).not.toThrow()
    el.remove()
  })

  // a scroller of 500 with 2000 of content; the button sits 1200 down the content
  function scrollerWith(pinned: boolean) {
    const scroller = document.createElement('div')
    scroller.style.overflowY = 'auto'
    const header = document.createElement('header')
    if (pinned) header.setAttribute('data-focus-scroll', 'none')
    const button = document.createElement('button')
    header.appendChild(button)
    scroller.appendChild(header)
    document.body.appendChild(scroller)
    Object.defineProperty(scroller, 'clientHeight', { value: 500 })
    Object.defineProperty(scroller, 'scrollHeight', { value: 2000 })
    const rect = (top: number, height: number) => ({ top, bottom: top + height, left: 0, right: 100, width: 100, height }) as DOMRect
    scroller.getBoundingClientRect = () => rect(0, 500)
    button.getBoundingClientRect = () => rect(1200, 40)
    const scrollTo = vi.fn()
    scroller.scrollTo = scrollTo as unknown as typeof scroller.scrollTo
    return { scroller, button, scrollTo }
  }

  it('scrolls a scroller for a focused element inside it', () => {
    const { scroller, button, scrollTo } = scrollerWith(false)
    bringIntoView(button)
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 1200 - 150 }))
    scroller.remove()
  })

  it('scrolls nothing outside a pinned container (a sticky header is always in view)', () => {
    const { scroller, button, scrollTo } = scrollerWith(true)
    bringIntoView(button)
    expect(scrollTo).not.toHaveBeenCalled()
    scroller.remove()
  })
})
