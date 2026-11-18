// Values made of digits, signs and Latin units must not take the direction of a right-to-left line (".25" was
// drawn "25.", "-1.5s" "1.5s-", "100 Mbps" "Mbps 100"). jsdom lays nothing out, so these tests hold the markup that
// isolates them; the drawn order is asserted in e2e (playback-engines.spec.ts, settings.spec.ts).
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { SliderPreference } from '../../settings/SliderPreference'
import { usePlaybackStore } from '../engine'
import { PlaybackDialogs } from './PlaybackDialogs'
import { ltrValue } from './text'

const engine = vi.hoisted(() => ({ setPlaybackRate: () => {}, setMaxBitrate: () => {}, adjustSubtitleDelay: () => {} }))
vi.mock('../engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../engine')>()),
  getPlaybackEngine: () => engine,
}))

beforeAll(() => {
  // jsdom has no layout
  Element.prototype.scrollIntoView = () => {}
})
afterEach(cleanup)

function dialog(name: 'settings' | 'speed' | 'bitrate' | 'delay') {
  const { container } = render(
    <PlaybackDialogs dialog={name} setDialog={() => {}} showDebug={false} onToggleDebug={() => {}} scale="FIT" onScale={() => {}} onSearchSubtitles={() => {}} />,
  )
  const texts = (selector: string) => Array.from(container.querySelectorAll(selector), (el) => el.textContent)
  return { container, texts }
}

describe('values in a right-to-left interface', () => {
  it('the speed list: every label takes its direction from its content', () => {
    const { texts } = dialog('speed')
    expect(texts('[role="menuitemradio"] bdi')).toEqual(['.25', '.5', '.75', '1.0', '1.25', '1.5', '1.75', '2.0'])
  })

  it('the Settings sheet: the speed, delay and bitrate values are isolated like the labels', () => {
    usePlaybackStore.setState({ playbackRate: 0.25, subtitleDelayMs: -1500, maxBitrate: 100 * 1024 * 1024 })
    const isolated = dialog('settings').texts('bdi')
    expect(isolated).toContain('0.25')
    expect(isolated).toContain('-1.5s')
    expect(isolated).toContain('100 Mbps')
    // nothing in a row is left outside an isolate
    expect(dialog('settings').texts('button').join('')).toBe(isolated.join(''))
  })

  it('the bitrate list', () => {
    expect(dialog('bitrate').texts('[role="menuitemradio"] bdi')).toContain('500 kbps')
  })

  it('the subtitle delay dialog: the value and the step buttons are left-to-right', () => {
    usePlaybackStore.setState({ subtitleDelayMs: -1500 })
    expect(dialog('delay').texts('[dir="ltr"]')).toEqual(['-1.5s', '-1s', '-250ms', '-50ms', '+50ms', '+250ms', '+1s'])
  })

  it('a settings slider summary takes its direction from its content', () => {
    const { container } = render(<SliderPreference id="MaxBitrate" title="Max bitrate" summary="100 Mbps" value={17} min={0} max={22} step={1} onChange={() => {}} />)
    expect(container.querySelector('bdi')?.textContent).toBe('100 Mbps')
  })

  it('a value inside a line of plain text (toast) is wrapped in a left-to-right isolate', () => {
    expect(ltrValue('-250 ms')).toBe('\u2066-250 ms\u2069')
    expect(ltrValue('1.25x')).toBe('\u20661.25x\u2069')
  })
})
