import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePlayerKeys, type PlayerKeyContext } from './usePlayerKeys'

const engine = vi.hoisted(() => ({ reportInteraction: () => {}, togglePlay: () => {} }))
vi.mock('../engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../engine')>()),
  getPlaybackEngine: () => engine,
}))

function setup(over: Partial<PlayerKeyContext> = {}) {
  const ctx: { current: PlayerKeyContext } = {
    current: {
      controlsVisible: false,
      dialogOpen: false,
      errorShown: false,
      dpadSeekVisible: false,
      oneClickPause: false,
      skipBackMs: 10_000,
      skipForwardMs: 30_000,
      durationMs: 600_000,
      dpadSeek: vi.fn(),
      showControls: vi.fn(),
      adjustVolume: vi.fn(),
      pulseControls: vi.fn(),
      clearDpadSeek: vi.fn(),
      back: vi.fn(),
      leave: vi.fn(),
      closeDialog: vi.fn(),
      shortcut: vi.fn(),
      ...over,
    },
  }
  const hook = renderHook(() => usePlayerKeys(ctx))
  const key = (type: 'keydown' | 'keyup', k: string, target: EventTarget = window) =>
    target.dispatchEvent(new KeyboardEvent(type, { key: k, cancelable: true, bubbles: true }))
  return { ctx, key, unmount: hook.unmount }
}

describe('usePlayerKeys Enter', () => {
  it('Enter with the controls hidden shows them on key up', () => {
    const { ctx, key, unmount } = setup()
    key('keydown', 'Enter')
    key('keyup', 'Enter')
    expect(ctx.current.showControls).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('an Enter that picked a chapter (controls visible on key down, hidden by the pick) does not bring them back', () => {
    const { ctx, key, unmount } = setup({ controlsVisible: true })
    key('keydown', 'Enter')
    ctx.current = { ...ctx.current, controlsVisible: false }
    key('keyup', 'Enter')
    expect(ctx.current.showControls).not.toHaveBeenCalled()
    unmount()
  })

  it('an Enter that closed a sheet does not show the controls', () => {
    const { ctx, key, unmount } = setup({ dialogOpen: true })
    key('keydown', 'Enter')
    ctx.current = { ...ctx.current, dialogOpen: false }
    key('keyup', 'Enter')
    expect(ctx.current.showControls).not.toHaveBeenCalled()
    // the next Enter, pressed with the controls hidden, still works
    key('keydown', 'Enter')
    key('keyup', 'Enter')
    expect(ctx.current.showControls).toHaveBeenCalledTimes(1)
    unmount()
  })
})

describe('usePlayerKeys volume', () => {
  it('ArrowUp raises and ArrowDown lowers the volume, hidden or shown by the mouse, and does not show the controls', () => {
    for (const controlsVisible of [false, true]) {
      const { ctx, key, unmount } = setup({ controlsVisible })
      key('keydown', 'ArrowUp')
      key('keyup', 'ArrowUp')
      key('keydown', 'ArrowDown')
      key('keyup', 'ArrowDown')
      expect(ctx.current.adjustVolume).toHaveBeenNthCalledWith(1, 1)
      expect(ctx.current.adjustVolume).toHaveBeenNthCalledWith(2, -1)
      expect(ctx.current.showControls).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('a held key repeats', () => {
    const { ctx, unmount } = setup()
    for (let i = 0; i < 3; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', repeat: i > 0, cancelable: true }))
    expect(ctx.current.adjustVolume).toHaveBeenCalledTimes(3)
    unmount()
  })

  it('with the focus inside the strip the arrows are left to the navigation', () => {
    const strip = document.createElement('div')
    strip.setAttribute('data-focus-trap', '')
    const btn = document.createElement('button')
    strip.appendChild(btn)
    document.body.appendChild(strip)
    const { ctx, key, unmount } = setup({ controlsVisible: true })
    key('keydown', 'ArrowUp', btn)
    expect(ctx.current.adjustVolume).not.toHaveBeenCalled()
    unmount()
    strip.remove()
  })

  it('with a dialog open the arrows are left to the dialog', () => {
    const { ctx, key, unmount } = setup({ dialogOpen: true })
    key('keydown', 'ArrowDown')
    expect(ctx.current.adjustVolume).not.toHaveBeenCalled()
    unmount()
  })

  it('Tab with the controls hidden shows them, with Play focus requested', () => {
    const { ctx, key, unmount } = setup()
    key('keydown', 'Tab')
    expect(ctx.current.showControls).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('Enter with one-click pause toggles play and does not show the controls', () => {
    const { ctx, key, unmount } = setup({ oneClickPause: true })
    key('keydown', 'Enter')
    key('keyup', 'Enter')
    expect(ctx.current.showControls).not.toHaveBeenCalled()
    unmount()
  })
})
