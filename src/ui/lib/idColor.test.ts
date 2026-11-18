import { describe, expect, it } from 'vitest'
import { idColor, idColorCss, javaStringHashCode, javaUuidHashCode } from './idColor'

// Expected values were produced by running the upstream Kotlin math (as Java, same float32 semantics)
// against java.util.UUID on a JVM.
const cases: [string, number, [number, number, number]][] = [
  ['38f5f7a0-9f4c-4e1b-8a43-1f2e3d4c5b6a', 280428031, [76, 38, 112]],
  ['00000000-0000-0000-0000-000000000000', 0, [102, 41, 41]],
  ['e9b1c3f0-1234-4bcd-9abc-0123456789ab', 610140341, [46, 128, 8]],
  ['5d2f1a0e-7c3b-4a9d-8e6f-abcdefabcdef', 1087387313, [52, 110, 44]],
  ['a1b2c3d4-e5f6-4789-abcd-ef0123456789', -859042603, [64, 30, 44]],
]

describe('idColor', () => {
  it.each(cases)('matches the JVM for %s', (id, hash, [r, g, b]) => {
    expect(javaUuidHashCode(id)).toBe(hash)
    expect(idColor(id)).toEqual({ r, g, b })
  })

  it('accepts Jellyfin ids without dashes', () => {
    expect(idColor('38f5f7a09f4c4e1b8a431f2e3d4c5b6a')).toEqual({ r: 76, g: 38, b: 112 })
  })

  it('falls back to String.hashCode for non-UUID ids', () => {
    expect(javaUuidHashCode('server-1')).toBeNull()
    expect(javaStringHashCode('hello')).toBe(99162322)
    expect(idColor('server-1')).not.toBeNull()
  })

  it('uses surfaceVariant for a missing id', () => {
    expect(idColor(null)).toBeNull()
    expect(idColorCss(undefined, 0.5)).toBe('rgb(from var(--c-surface-variant) r g b / 0.5)')
    expect(idColorCss('00000000-0000-0000-0000-000000000000', 0.7)).toBe('rgb(102 41 41 / 0.7)')
  })
})
