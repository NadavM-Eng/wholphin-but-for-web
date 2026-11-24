import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLICK_WAIT_MS, createClickGate, isMouseClick } from './useMouseClickGate'

function setup() {
  const s = { paused: false }
  const togglePlay = vi.fn(() => {
    s.paused = !s.paused
  })
  const gate = createClickGate({ isPaused: () => s.paused, togglePlay })
  return { s, togglePlay, gate }
}

describe('mouse click gate', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('a single click acts after the wait, not before', () => {
    const { s, togglePlay, gate } = setup()
    gate.click()
    vi.advanceTimersByTime(CLICK_WAIT_MS - 1)
    expect(togglePlay).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(togglePlay).toHaveBeenCalledTimes(1)
    expect(s.paused).toBe(true)
  })

  it('a fast double click never toggles play', () => {
    const { s, togglePlay, gate } = setup()
    gate.click()
    vi.advanceTimersByTime(100)
    gate.click()
    gate.doubleClick()
    vi.advanceTimersByTime(2000)
    expect(togglePlay).not.toHaveBeenCalled()
    expect(s.paused).toBe(false)
  })

  it('a slow double click puts the play state back and drops the second click', () => {
    const { s, togglePlay, gate } = setup()
    gate.click()
    vi.advanceTimersByTime(CLICK_WAIT_MS + 100)
    expect(s.paused).toBe(true)
    gate.click()
    gate.doubleClick()
    vi.advanceTimersByTime(2000)
    expect(s.paused).toBe(false)
    expect(togglePlay).toHaveBeenCalledTimes(2)
  })

  it('a slow double click on a paused video leaves it paused', () => {
    const { s, gate } = setup()
    s.paused = true
    gate.click()
    vi.advanceTimersByTime(CLICK_WAIT_MS + 100)
    expect(s.paused).toBe(false)
    gate.click()
    gate.doubleClick()
    vi.advanceTimersByTime(2000)
    expect(s.paused).toBe(true)
  })

  it('an old click that acted is not undone by a later fast double click', () => {
    const { s, gate } = setup()
    gate.click()
    vi.advanceTimersByTime(CLICK_WAIT_MS + 10)
    expect(s.paused).toBe(true)
    vi.advanceTimersByTime(5000)
    gate.click()
    gate.click()
    gate.doubleClick()
    vi.advanceTimersByTime(2000)
    expect(s.paused).toBe(true)
  })

  it('touch and pen clicks are not mouse clicks', () => {
    expect(isMouseClick('mouse')).toBe(true)
    expect(isMouseClick('')).toBe(true)
    expect(isMouseClick('touch')).toBe(false)
    expect(isMouseClick('pen')).toBe(false)
  })

  it('dispose clears the pending timer', () => {
    const { togglePlay, gate } = setup()
    gate.click()
    gate.dispose()
    vi.advanceTimersByTime(2000)
    expect(togglePlay).not.toHaveBeenCalled()
  })
})
