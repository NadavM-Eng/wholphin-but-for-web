import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MaterialIcon, type MaterialIconName } from './MaterialIcon'

afterEach(cleanup)

const pathOf = (name: MaterialIconName) => render(<MaterialIcon name={name} />).container.querySelector('path')?.getAttribute('d')

describe('MaterialIcon', () => {
  it('has the audiotrack icon: the 24px filled Material Icons path (a music note), never mirrored', () => {
    const { container } = render(<MaterialIcon name="audiotrack" />)
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(container.querySelector('svg')?.style.transform).toBe('')
    expect(container.querySelector('path')?.getAttribute('d')).toBe(
      'M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z',
    )
  })

  it("has the icons of the player's Chapters and Queue buttons: the 24px filled Material Icons paths", () => {
    expect(pathOf('format_list_bulleted')).toBe(
      'M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z',
    )
    expect(pathOf('video_library')).toBe(
      'M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z',
    )
  })

  it('the audiotrack icon is not one of the speakers', () => {
    const note = pathOf('audiotrack')
    for (const speaker of ['volume_up', 'volume_down', 'volume_off'] as const) expect(pathOf(speaker)).not.toBe(note)
  })
})
