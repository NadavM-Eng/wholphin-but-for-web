// @vitest-environment jsdom
import type { KeyboardEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { gridContentWidthPx } from '../model/gridColumns'
import { enterLetterColumn } from './letterFocus'

function build(dir: 'ltr' | 'rtl' = 'ltr') {
  document.body.innerHTML = `
    <div dir="${dir}">
      <div><div id="scroller" style="direction:${dir}"></div></div>
      <div><button data-letter="A"></button><button data-letter="C" aria-current="true"></button></div>
    </div>`
  return document.getElementById('scroller') as HTMLElement
}

function key(scroller: HTMLElement, k: string, mods: Partial<KeyboardEvent<HTMLElement>> = {}) {
  const preventDefault = vi.fn()
  const e = { key: k, currentTarget: scroller, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault, ...mods } as unknown as KeyboardEvent<HTMLElement>
  return { e, preventDefault }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('enterLetterColumn', () => {
  it('moves from a last-column card to the current letter', () => {
    const { e, preventDefault } = key(build(), 'ArrowRight')
    expect(enterLetterColumn(e, true)).toBe(true)
    expect(preventDefault).toHaveBeenCalled()
    expect(document.activeElement?.getAttribute('data-letter')).toBe('C')
  })

  it('leaves other columns, other keys and modified keys to spatial navigation', () => {
    const scroller = build()
    expect(enterLetterColumn(key(scroller, 'ArrowRight').e, false)).toBe(false)
    expect(enterLetterColumn(key(scroller, 'ArrowLeft').e, true)).toBe(false)
    expect(enterLetterColumn(key(scroller, 'ArrowRight', { shiftKey: true }).e, true)).toBe(false)
    expect(document.activeElement).toBe(document.body)
  })

  it('uses the left arrow in right-to-left pages', () => {
    const scroller = build('rtl')
    expect(enterLetterColumn(key(scroller, 'ArrowRight').e, true)).toBe(false)
    expect(enterLetterColumn(key(scroller, 'ArrowLeft').e, true)).toBe(true)
  })

  it('does nothing without a letter column', () => {
    const scroller = build()
    scroller.parentElement?.nextElementSibling?.remove()
    expect(enterLetterColumn(key(scroller, 'ArrowRight').e, true)).toBe(false)
  })
})

describe('gridContentWidthPx', () => {
  it('is the client width without the inline padding', () => {
    const el = document.createElement('div')
    el.style.paddingInlineStart = '10px'
    el.style.paddingInlineEnd = '6px'
    Object.defineProperty(el, 'clientWidth', { value: 854 })
    document.body.append(el)
    expect(gridContentWidthPx(el)).toBe(838)
  })

  it('never goes below zero', () => {
    const el = document.createElement('div')
    el.style.paddingInlineStart = '10px'
    document.body.append(el)
    expect(gridContentWidthPx(el)).toBe(0)
  })
})
