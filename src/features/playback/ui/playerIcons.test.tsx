// The control row has a volume control (web addition) and the audio-track button side by side: a speaker means
// volume only, the track list is a music note. Upstream's speaker on the audio button looked like a second volume.
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePlaybackStore } from '../engine'
import { Controller } from './Controller'
import { AUDIO_TRACK_ICON, volumeIcon } from './playerIcons'

// no media element in jsdom: the seek bar reads the position from the store instead
const engine = vi.hoisted(() => ({ video: { readyState: 0, seeking: false, currentTime: 0 } }))
vi.mock('../engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../engine')>()),
  getPlaybackEngine: () => engine,
}))

afterEach(cleanup)

const off = { supported: false, active: false, toggle: () => {} }

function row() {
  const { container } = render(
    <Controller dialog={null} onDialog={() => {}} onInteract={() => {}} skipBackMs={10_000} skipForwardMs={30_000} fullscreen={off} pip={off} />,
  )
  const drawing = (label: RegExp) => {
    const button = Array.from(container.querySelectorAll('button')).find((b) => label.test(b.getAttribute('aria-label') ?? ''))
    if (!button) throw new Error(`no button named ${label}`)
    return { tag: button.firstElementChild?.tagName.toLowerCase(), d: button.querySelector('path')?.getAttribute('d') }
  }
  // with or without loaded strings: the name is the string or its key
  return { audio: drawing(/^audio$/i), volume: drawing(/mute/i) }
}

describe('the audio-track button and the volume control', () => {
  it('never share an icon name, whatever the volume', () => {
    const speakers = [volumeIcon(true, 0), volumeIcon(true, 1), volumeIcon(false, 0.1), volumeIcon(false, 0.5), volumeIcon(false, 1)]
    expect(new Set(speakers)).toEqual(new Set(['volume_off', 'volume_down', 'volume_up']))
    expect(speakers).not.toContain(AUDIO_TRACK_ICON)
    expect(AUDIO_TRACK_ICON).toBe('audiotrack')
  })

  it('are drawn differently in the control row at every volume', () => {
    const notes = new Set<string>()
    for (const state of [
      { volume: 1, muted: false },
      { volume: 0.2, muted: false },
      { volume: 1, muted: true },
      { volume: 0, muted: false },
    ]) {
      usePlaybackStore.setState(state)
      const { audio, volume } = row()
      cleanup()
      expect(audio.tag).toBe('svg')
      expect(audio.d).toBeTruthy()
      expect(volume.d).toBeTruthy()
      expect(audio.d).not.toBe(volume.d)
      notes.add(audio.d ?? '')
    }
    // the note does not change with the volume
    expect(notes.size).toBe(1)
  })
})
