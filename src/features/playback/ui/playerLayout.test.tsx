// The web player's layout (owner request): one strip of flat buttons in a fixed physical order (left group,
// transport, right group), Chapters and Queue as buttons in it and the two lists as panels, the times as clocks, a
// top strip without a logo. jsdom lays nothing out: positions, sizes, the gradient and focus are asserted in e2e
// (e2e/specs/playback-layout.spec.ts); here the markup, the order, the conditions and the actions.
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { usePlaybackStore } from '../engine'
import { ChaptersPanel } from './ChaptersPanel'
import { Controller } from './Controller'
import { DpadSeekOverlay } from './DpadSeekOverlay'
import { SHORTCUT_SHEET, shortcutFor } from './keymap'
import { PlaybackDialogs } from './PlaybackDialogs'
import { AUDIO_TRACK_ICON, CHAPTERS_ICON, QUEUE_ICON } from './playerIcons'
import { PlayerTopBar } from './PlayerTopBar'
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
// the favourite button's action needs a session and a query client; its own behaviour is FavoriteButton.test.tsx
vi.mock('../../common/useItemActions', () => ({ useItemActions: () => ({ setFavorite: () => Promise.resolve() }) }))

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
  document.documentElement.removeAttribute('dir')
})

const off = { supported: false, active: false, toggle: () => {} }
const on = { supported: true, active: false, toggle: () => {} }

function strip(dialog: PlayerDialog | null = null, onDialog: (d: PlayerDialog) => void = () => {}, modes = off) {
  const { container } = render(<Controller dialog={dialog} onDialog={onDialog} onInteract={() => {}} skipBackMs={10_000} skipForwardMs={30_000} fullscreen={modes} pip={modes} />)
  const names = () => Array.from(container.querySelectorAll('[data-player-button]'), (b) => b.getAttribute('data-player-button'))
  const button = (name: string) => container.querySelector<HTMLButtonElement>(`[data-player-button="${name}"]`)
  const time = (name: 'elapsed' | 'remaining') => container.querySelector<HTMLElement>(`[data-player-time="${name}"]`)!
  /** the room kept for a time, in characters */
  const timeChars = () => time('elapsed').parentElement!.style.getPropertyValue('--time-ch')
  return { container, names, button, time, timeChars }
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
/** the item being played: with it the favourite button shows */
const playing = { item: { Id: 'm1', Type: 'Movie' as const, Name: 'Coffee Run', ImageTags: { Logo: 'logo-tag' } }, entryKind: 'media' as const }
const LEFT = ['settings', 'favorite', 'pip', 'volume']
const TRANSPORT = ['previous', 'skip-back', 'play', 'skip-forward', 'next']
const RIGHT = ['subtitles', 'audio', 'fullscreen']
/** true when `a` comes before `b` in the document */
const before = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
const groupOf = (el: Element | null) => el?.closest('[data-player-group]')?.getAttribute('data-player-group')

describe('the control strip', () => {
  it('is one row in a fixed order: settings, favourite, picture in picture, volume | transport | subtitles, audio, fullscreen', () => {
    usePlaybackStore.setState(playing)
    const { container, names } = strip(null, () => {}, on)
    expect(names()).toEqual([...LEFT, ...TRANSPORT, ...RIGHT])
    expect(container.querySelectorAll('[data-player-strip]').length).toBe(1)
    // the seek bar and both times are in the strip, the title is not (PlayerTopBar)
    expect(container.querySelector('[data-player-strip] [data-seekbar]')).not.toBeNull()
    expect(container.querySelectorAll('[data-player-strip] [data-player-time]').length).toBe(2)
    for (const b of container.querySelectorAll('[data-player-button]')) expect(b.className).toMatch(/flat/)
    // three groups for the arrow keys, in the order they are drawn; Play takes the first focus
    const groups = Array.from(container.querySelectorAll('[data-focus-group]'))
    expect(groups.map((g) => g.getAttribute('data-player-group'))).toEqual(['left', 'transport', 'right'])
    expect(groups.map((g) => Array.from(g.querySelectorAll('[data-player-button]'), (b) => b.getAttribute('data-player-button')))).toEqual([LEFT, TRANSPORT, RIGHT])
    expect(Array.from(container.querySelectorAll('[data-focus-default]'), (b) => b.getAttribute('data-player-button'))).toEqual(['play'])
  })

  it('has the same order in a right-to-left page: no button is placed by the language', () => {
    usePlaybackStore.setState({ ...playing, chapters, queue })
    document.documentElement.setAttribute('dir', 'rtl')
    expect(strip(null, () => {}, on).names()).toEqual([...LEFT, ...TRANSPORT, 'subtitles', 'audio', 'chapters', 'queue', 'fullscreen'])
  })

  it('favourite stands right after settings in the left group and shows only while an item plays', () => {
    // nothing is playing yet: no favourite button, picture in picture follows settings
    expect(strip(null, () => {}, on).names().slice(0, 3)).toEqual(['settings', 'pip', 'volume'])
    cleanup()
    usePlaybackStore.setState(playing)
    const { container } = strip(null, () => {}, on)
    expect(Array.from(container.querySelectorAll('[data-player-group="left"] [data-player-button]'), (b) => b.getAttribute('data-player-button'))).toEqual(LEFT)
    // a browser without fullscreen and picture in picture: settings, favourite, volume | … | subtitles, audio
    cleanup()
    expect(strip().names().slice(0, 3)).toEqual(['settings', 'favorite', 'volume'])
    expect(strip().names().slice(-2)).toEqual(['subtitles', 'audio'])
  })

  it('the volume slider opens under a mouse only, at the right of its button, and not where a finger is the main pointer', () => {
    const { container, button } = strip()
    const root = button('volume')!.parentElement!
    const place = container.querySelector<HTMLElement>('[data-player-volume-slider]')!
    // the slider's place comes after the button in the row (the row is left to right in every language)
    expect(before(button('volume')!, place)).toBe(true)
    expect(groupOf(place)).toBe('left')
    const open = () => root.hasAttribute('data-volume-open')
    expect([open(), place.hasAttribute('inert')]).toEqual([false, true])
    fireEvent.pointerEnter(root, { pointerType: 'touch' })
    expect(open()).toBe(false)
    fireEvent.pointerEnter(root, { pointerType: 'mouse' })
    expect([open(), place.hasAttribute('inert')]).toEqual([true, false])
    expect(place.querySelector('[role="slider"]')).not.toBeNull()
    fireEvent.pointerLeave(root, { pointerType: 'mouse' })
    expect([open(), place.hasAttribute('inert')]).toEqual([false, true])
    // a touch screen with a mouse attached: the stylesheet hides the slider there, so nothing may make room for it
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)' }))
    try {
      fireEvent.pointerEnter(root, { pointerType: 'mouse' })
      expect(open()).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('shows the Chapters button only for an item with chapters and the Queue button only for a queue of several, after subtitles and audio in the right group', () => {
    expect(strip().names()).not.toContain('chapters')
    expect(strip().names()).not.toContain('queue')
    cleanup()
    usePlaybackStore.setState({ chapters, queue: queue.slice(0, 1) })
    expect(strip().names().slice(-4)).toEqual(['next', 'subtitles', 'audio', 'chapters'])
    cleanup()
    usePlaybackStore.setState({ chapters: [], queue })
    expect(strip().names().slice(-4)).toEqual(['next', 'subtitles', 'audio', 'queue'])
    cleanup()
    usePlaybackStore.setState({ chapters, queue })
    const both = strip()
    expect(both.names().slice(-5)).toEqual(['next', 'subtitles', 'audio', 'chapters', 'queue'])
    expect(groupOf(both.button('chapters'))).toBe('right')
    expect(groupOf(both.button('queue'))).toBe('right')
  })

  it('"Ends at" follows the left group; the Skip button stands between the transport and the right group', () => {
    usePlaybackStore.setState({
      ...playing,
      durationMs: 600_000,
      positionMs: 30_000,
      segment: { segment: { Id: 's1', ItemId: 'm1', Type: 'Intro', StartTicks: 0, EndTicks: 900_000_000 }, interacted: true } as never,
    })
    const { container, button } = strip(null, () => {}, on)
    const endsAt = container.querySelector('[data-player-ends-at]')!
    expect(before(button('volume')!, endsAt)).toBe(true)
    expect(before(endsAt, button('previous')!)).toBe(true)
    const skip = container.querySelector<HTMLElement>('[data-player-skip]')!
    expect(skip.hasAttribute('data-focusable')).toBe(true)
    expect(before(button('next')!, skip)).toBe(true)
    expect(before(skip, button('subtitles')!)).toBe(true)
    // not inside a button group: it comes and goes without taking a place among the fixed buttons
    expect(groupOf(skip)).toBeUndefined()
    fireEvent.click(skip)
    expect(engine.seekTo).toHaveBeenCalledWith(90_000)
  })

  it('shows elapsed and remaining time as clocks, left to right, with room kept for the longest text of the item', () => {
    usePlaybackStore.setState({ durationMs: 6_773_000, positionMs: 3_173_900 })
    const long = strip()
    expect(long.time('elapsed').textContent).toBe('52:53')
    expect(long.time('remaining').textContent).toBe('-59:59')
    expect(long.time('elapsed').getAttribute('dir')).toBe('ltr')
    expect(long.time('remaining').getAttribute('dir')).toBe('ltr')
    // "1:52:53" is the longest text this item shows: seven characters (the remaining time has its minus more)
    expect(long.timeChars()).toBe('7')
    cleanup()
    // past the hour: a character more in the text, the same room
    usePlaybackStore.setState({ durationMs: 6_773_000, positionMs: 3_713_000 })
    const later = strip()
    expect(later.time('elapsed').textContent).toBe('1:01:53')
    expect(later.time('remaining').textContent).toBe('-51:00')
    expect(later.timeChars()).toBe('7')
    cleanup()
    usePlaybackStore.setState({ durationMs: 599_000, positionMs: 5_000 })
    const short = strip()
    expect(short.time('elapsed').textContent).toBe('0:05')
    expect(short.time('remaining').textContent).toBe('-9:54')
    expect(short.timeChars()).toBe('4')
    // the seek bar still says the position in words (screen readers)
    expect(short.container.querySelector('[data-seekbar]')!.getAttribute('aria-valuetext')).not.toMatch(/\d:\d\d/)
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
    // the start times are clocks, left to right; a chapter without a name is listed by its start time
    expect(rows[0].textContent).toContain('Opening')
    expect(rows[1].textContent).toBe('The Setup0:12')
    expect(rows[1].querySelector('[dir="ltr"]')!.textContent).toBe('0:12')
    expect(rows[2].querySelector('button')!.textContent).toBe('0:24')
    // focus starts on the chapter being played
    expect(document.activeElement).toBe(rows[1].querySelector('button'))
    fireEvent.click(rows[2].querySelector('button')!)
    expect(engine.seekTo).toHaveBeenCalledWith(24_000)
    expect(picked).toHaveBeenCalledTimes(1)
  })

  it('lists a chapter an hour in as h:mm:ss', () => {
    usePlaybackStore.setState({ chapters: [{ index: 0, startMs: 3_723_000, name: 'Finale', imageTag: null }] })
    const { container } = render(<ChaptersPanel onClose={() => {}} onPicked={() => {}} />)
    expect(container.querySelector('[data-chapter="0"]')!.textContent).toBe('Finale1:02:03')
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

describe('the D-pad seek overlay', () => {
  it('shows its preview chip and both timecodes as clocks', () => {
    const { container } = render(<DpadSeekOverlay positionMs={3_173_000} durationMs={6_773_000} bufferedMs={0} />)
    // the chip over the bar, then the two timecodes under it
    expect(Array.from(container.querySelectorAll('span'), (el) => el.textContent)).toEqual(['52:53', '52:53', '-1:00:00'])
  })
})

describe('the top strip', () => {
  it('has Back, then the title right after it, and no logo picture', () => {
    // an item with a logo picture on the server
    usePlaybackStore.setState({ item: { ...playing.item, ProductionYear: 2020 } })
    const { container } = render(<PlayerTopBar onBack={() => {}} visible showClock showDebug={false} />)
    const top = container.querySelector('[data-player-top]')!
    expect(top.querySelector('img')).toBeNull()
    const back = top.querySelector('[data-player-button="back"]')!
    const titles = top.querySelector('[data-player-titles]')!
    expect(titles.textContent).toContain('Coffee Run')
    expect(titles.textContent).toContain('2020')
    // nothing stands before the Back button or between it and the titles
    expect(top.firstElementChild).toBe(back.parentElement)
    expect(back.parentElement!.nextElementSibling).toBe(titles)
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

  it('every sheet a button of the strip opens stands at the physical left; the subtitle delay is centred', () => {
    usePlaybackStore.setState({ chapters, queue })
    const placement = (ui: ReactElement) => {
      const { container } = render(ui)
      const value = container.querySelector('[data-player-sheet]')?.getAttribute('data-player-sheet')
      cleanup()
      return value
    }
    const dialog = (name: PlayerDialog) => (
      <PlaybackDialogs dialog={name} setDialog={() => {}} showDebug={false} onToggleDebug={() => {}} scale="FIT" onScale={() => {}} onSearchSubtitles={() => {}} />
    )
    for (const name of ['settings', 'speed', 'scale', 'bitrate'] as const) expect(placement(dialog(name)), name).toBe('bottom-left')
    for (const name of ['captions', 'audio'] as const) expect(placement(dialog(name)), name).toBe('bottom-right')
    expect(placement(<ChaptersPanel onClose={() => {}} onPicked={() => {}} />)).toBe('bottom-right')
    expect(placement(<QueuePanel onClose={() => {}} onPicked={() => {}} />)).toBe('bottom-right')
    expect(placement(dialog('delay'))).toBe('center')
  })
})
