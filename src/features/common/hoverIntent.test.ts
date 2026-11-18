import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHoverIntent, HOVER_INTENT_MS } from './hoverIntent'

describe('hover intent', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.documentElement.setAttribute('data-pointer', '')
  })
  afterEach(() => {
    vi.useRealTimers()
    document.documentElement.removeAttribute('data-pointer')
  })

  it('does not fire while the keyboard owns the highlight (pointerover from content moving under the cursor)', () => {
    document.documentElement.removeAttribute('data-pointer')
    const h = createHoverIntent<number>()
    const fired: number[] = []
    h.over(1, () => fired.push(1))
    vi.advanceTimersByTime(HOVER_INTENT_MS * 2)
    expect(fired).toEqual([])
    // a real move later (data-pointer set) over the same card counts again
    document.documentElement.setAttribute('data-pointer', '')
    h.over(1, () => fired.push(1))
    vi.advanceTimersByTime(HOVER_INTENT_MS)
    expect(fired).toEqual([1])
  })

  it('fires only after the pointer rests on one key for the delay', () => {
    const h = createHoverIntent<number>()
    const fired: number[] = []
    h.over(1, () => fired.push(1))
    vi.advanceTimersByTime(HOVER_INTENT_MS - 10)
    h.over(2, () => fired.push(2))
    vi.advanceTimersByTime(HOVER_INTENT_MS - 10)
    expect(fired).toEqual([])
    vi.advanceTimersByTime(10)
    expect(fired).toEqual([2])
  })

  it('moving within the same key does not restart the delay; leaving cancels', () => {
    const h = createHoverIntent<string>()
    const fired: string[] = []
    h.over('a', () => fired.push('a'))
    vi.advanceTimersByTime(HOVER_INTENT_MS / 2)
    h.over('a', () => fired.push('a again'))
    vi.advanceTimersByTime(HOVER_INTENT_MS / 2)
    expect(fired).toEqual(['a'])
    h.over('b', () => fired.push('b'))
    h.leave()
    vi.advanceTimersByTime(HOVER_INTENT_MS * 2)
    expect(fired).toEqual(['a'])
    // after leaving, the same key counts as a new hover
    h.over('a', () => fired.push('a2'))
    vi.advanceTimersByTime(HOVER_INTENT_MS)
    expect(fired).toEqual(['a', 'a2'])
  })

  it('a null key (between cards) cancels without firing', () => {
    const h = createHoverIntent<number>()
    const fire = vi.fn()
    h.over(1, fire)
    h.over(null, fire)
    vi.advanceTimersByTime(HOVER_INTENT_MS * 2)
    expect(fire).not.toHaveBeenCalled()
  })
})
