// The web player's layout (owner request): one strip of flat buttons with Chapters and Queue as buttons in it, and
// the two lists as panels. jsdom lays nothing out: sizes, the missing veil and focus are asserted in e2e
// (e2e/specs/playback.spec.ts); here the markup, the conditions and the actions.
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { usePlaybackStore } from '../engine'
import { ChaptersPanel } from './ChaptersPanel'
import { Controller } from './Controller'
import { SHORTCUT_SHEET, shortcutFor } from './keymap'
import { AUDIO_TRACK_ICON, CHAPTERS_ICON, QUEUE_ICON } from './playerIcons'
import { QueuePanel } from './QueuePanel'
import { STRIP_SHEETS, type PlayerDialog } from './types'

const engine = vi.hoisted(() => ({
  video: { readyState: 0, seeking: false, currentTime: 0 },
  seekTo: vi.fn(),
  playQueueIndex: vi.fn(),
  positionMs: () => 0,
}))
vi.mock('../engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../engine')>()),
  getPlaybackEngine: () => engine,
}))

const initial = usePlaybackStore.getState()
beforeAll(() => {
  // jsdom has no layout
  Element.prototype.scrollIntoView = () => {}
})
afterEach(() => {
  cleanup()
  usePlaybackStore.setState(initial, true)
  engine.seekTo.mockClear()
  engine.playQueueIndex.mockClear()
})

const off = { supported: false, active: false, toggle: () => {} }
const on = { supported: true, active: false, toggle: () => {} }

function strip(dialog: PlayerDialog | null = null, onDialog: (d: PlayerDialog) => void = () => {}, modes = off) {
  const { container } = render(<Controller dialog={dialog} onDialog={onDialog} onInteract={() => {}} skipBackMs={10_000} skipForwardMs={30_000} fullscreen={modes} pip={modes} />)
  const names = () => Array.from(container.querySelectorAll('[data-player-button]'), (b) => b.getAttribute('data-player-button'))
  const button = (name: string) => container.querySelector<HTMLButtonElement>(`[data-player-button="${name}"]`)
  return { container, names, button }
}

const chapters = [
  { index: 0, startMs: 0, name: 'Opening', imageTag: 'a' },
  { index: 1, startMs: 12_000, name: 'The Setup', imageTag: null },
  { index: 2, startMs: 24_000, name: null, imageTag: 'c' },
]
const queue = [
  { kind: 'media' as const, item: { Id: 'e1', Type: 'Episode' as const, Name: 'Departure', SeriesName: 'Orbital Drift', ParentIndexNumber: 1, IndexNumber: 1 } },
  { kind: 'media' as const, item: { Id: 'e2', Type: 'Episode' as const, Name: 'Dead Reckoning', SeriesName: 'Orbital Drift', ParentIndexNumber: 1, IndexNumber: 2 } },
  { kind: 'media' as const, item: { Id: 'm1', Type: 'Movie' as const, Name: 'Coffee Run', ProductionYear: 2020 } },
]

describe('the control strip', () => {
  it('is one row: transport first, then the option buttons, every one a flat button', () => {
    const { container, names } = strip(null, () => {}, on)
    expect(names()).toEqual(['previous', 'skip-back', 'play', 'skip-forward', 'next', 'subtitles', 'audio', 'volume', 'settings', 'pip', 'fullscreen'])
    expect(container.querySelectorAll('[data-player-strip]').length).toBe(1)
    // the seek bar and both times are in the strip, the title is not (PlayerTopBar)
    expect(container.querySelector('[data-player-strip] [data-seekbar]')).not.toBeNull()
    expect(container.querySelectorAll('[data-player-strip] [data-player-time]').length).toBe(2)
    for (const b of container.querySelectorAll('[data-player-button]')) expect(b.className).toMatch(/flat/)
  })

  it('shows the Chapters button only for an item with chapters and the Queue button only for a queue of several', () => {
    expect(strip().names()).not.toContain('chapters')
    expect(strip().names()).not.toContain('queue')
    cleanup()
    usePlaybackStore.setState({ chapters, queue: queue.slice(0, 1) })
    expect(strip().names().slice(5, 7)).toEqual(['chapters', 'subtitles'])
    cleanup()
    usePlaybackStore.setState({ chapters: [], queue })
    expect(strip().names().slice(5, 7)).toEqual(['queue', 'subtitles'])
    cleanup()
    usePlaybackStore.setState({ chapters, queue })
    expect(strip().names().slice(5, 8)).toEqual(['chapters', 'queue', 'subtitles'])
  })

  it('the two buttons open their panels and show which one is open', () => {
    usePlaybackStore.setState({ chapters, queue })
    const opened: PlayerDialog[] = []
    const closed = strip(null, (d) => opened.push(d))
    fireEvent.click(closed.button('chapters')!)
    fireEvent.click(closed.button('queue')!)
    expect(opened).toEqual(['chapters', 'queue'])
    expect(closed.button('chapters')!.getAttribute('aria-expanded')).toBe('false')
    expect(closed.button('chapters')!.getAttribute('aria-haspopup')).toBe('dialog')
    cleanup()
    const open = strip('queue')
    expect(open.button('queue')!.getAttribute('aria-expanded')).toBe('true')
    expect(open.button('chapters')!.getAttribute('aria-expanded')).toBe('false')
  })

  it('draws chapters, queue and audio with three different icons', () => {
    usePlaybackStore.setState({ chapters, queue })
    const { button } = strip()
    const d = (name: string) => button(name)!.querySelector('path')?.getAttribute('d')
    expect(new Set([CHAPTERS_ICON, QUEUE_ICON, AUDIO_TRACK_ICON]).size).toBe(3)
    expect(new Set([d('chapters'), d('queue'), d('audio'), d('settings')]).size).toBe(4)
  })
})

describe('the chapters panel', () => {
  it('lists every chapter, marks the one being played and seeks to the chosen one', () => {
    usePlaybackStore.setState({ chapters, positionMs: 13_000, item: { Id: 'item1' } })
    const picked = vi.fn()
    const { container } = render(<ChaptersPanel onClose={() => {}} onPicked={picked} />)
    const rows = Array.from(container.querySelectorAll('[data-player-panel="chapters"] [data-chapter]'))
    expect(rows.length).toBe(3)
    expect(rows.map((r) => r.hasAttribute('data-current'))).toEqual([false, true, false])
    expect(rows[1].querySelector('button')!.getAttribute('aria-checked')).toBe('true')
    // a chapter without a name is listed by its start time
    expect(rows[0].textContent).toContain('Opening')
    expect(rows[2].querySelector('button')!.textContent).not.toBe('')
    // focus starts on the chapter being played
    expect(document.activeElement).toBe(rows[1].querySelector('button'))
    fireEvent.click(rows[2].querySelector('button')!)
    expect(engine.seekTo).toHaveBeenCalledWith(24_000)
    expect(picked).toHaveBeenCalledTimes(1)
  })

  it('closes with Escape, with its own key and with its Close button', () => {
    usePlaybackStore.setState({ chapters })
    const close = vi.fn()
    const { container } = render(<ChaptersPanel onClose={close} onPicked={() => {}} />)
    const dialog = container.querySelector('[role="dialog"]')!
    fireEvent.keyDown(dialog, { key: 'Escape' })
    fireEvent.keyDown(dialog, { key: 'h' })
    fireEvent.keyDown(dialog, { key: 'H' })
    fireEvent.click(container.querySelector('[data-player-button="panel-close"]')!)
    expect(close).toHaveBeenCalledTimes(4)
    // another shortcut's key is not a close key
    fireEvent.keyDown(dialog, { key: 'q' })
    expect(close).toHaveBeenCalledTimes(4)
  })
})

describe('the queue panel', () => {
  it('lists the whole queue with its positions, marks the entry being played and plays the chosen one', () => {
    usePlaybackStore.setState({ queue, index: 1 })
    const picked = vi.fn()
    const close = vi.fn()
    const { container } = render(<QueuePanel onClose={close} onPicked={picked} />)
    const rows = Array.from(container.querySelectorAll('[data-player-panel="queue"] [data-queue]'))
    expect(rows.length).toBe(3)
    expect(rows.map((r) => r.hasAttribute('data-current'))).toEqual([false, true, false])
    expect(rows.map((r) => r.textContent?.slice(0, 1))).toEqual(['1', '2', '3'])
    expect(rows[0].textContent).toContain('Departure')
    expect(rows[0].textContent).toContain('Orbital Drift')
    expect(rows[2].textContent).toContain('Coffee Run')
    expect(rows[2].textContent).toContain('2020')
    expect(document.activeElement).toBe(rows[1].querySelector('button'))
    // an earlier entry can be chosen too
    fireEvent.click(rows[0].querySelector('button')!)
    expect(engine.playQueueIndex).toHaveBeenCalledWith(0)
    expect(picked).toHaveBeenCalledTimes(1)
    // the entry being played is not restarted: the panel just closes
    fireEvent.click(rows[1].querySelector('button')!)
    expect(engine.playQueueIndex).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })
})

describe('shortcuts and sheets', () => {
  it('H opens the chapters, Q the queue, and both are in the shortcut list', () => {
    expect(shortcutFor({ key: 'h' })).toBe('chapters')
    expect(shortcutFor({ key: 'H', shiftKey: true })).toBe('chapters')
    expect(shortcutFor({ key: 'q' })).toBe('queue')
    expect(shortcutFor({ key: 'q', ctrlKey: true })).toBeNull()
    expect(SHORTCUT_SHEET.find((s) => s.keys.includes('H'))?.label).toBe('chapters')
    expect(SHORTCUT_SHEET.find((s) => s.keys.includes('Q'))?.label).toBe('queue')
  })

  it('the sheets that stand on the strip keep it up; the centered ones do not', () => {
    for (const d of ['settings', 'speed', 'scale', 'bitrate', 'captions', 'audio', 'chapters', 'queue'] as const) expect(STRIP_SHEETS.has(d)).toBe(true)
    for (const d of ['delay', 'search', 'help'] as const) expect(STRIP_SHEETS.has(d)).toBe(false)
  })
})
