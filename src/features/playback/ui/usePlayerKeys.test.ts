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
  const key = (type: 'keydown' | 'keyup', k: string) => window.dispatchEvent(new KeyboardEvent(type, { key: k, cancelable: true }))
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
