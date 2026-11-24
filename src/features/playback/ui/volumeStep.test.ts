import { describe, expect, it } from 'vitest'
import { stepVolume } from './volumeStep'

describe('stepVolume', () => {
  it('moves by 5 percent', () => {
    expect(stepVolume(0.5, false, 1)).toEqual({ volume: 0.55, muted: false })
    expect(stepVolume(0.5, false, -1)).toEqual({ volume: 0.45, muted: false })
  })
  it('stops at 0 and 100', () => {
    expect(stepVolume(1, false, 1)).toEqual({ volume: 1, muted: false })
    expect(stepVolume(0.05, false, -1)).toEqual({ volume: 0, muted: true })
    expect(stepVolume(0, true, -1)).toEqual({ volume: 0, muted: true })
  })
  it('raising while muted unmutes', () => {
    expect(stepVolume(0.5, true, 1)).toEqual({ volume: 0.55, muted: false })
    expect(stepVolume(0, true, 1)).toEqual({ volume: 0.05, muted: false })
  })
})
