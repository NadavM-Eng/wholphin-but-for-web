import { describe, expect, it } from 'vitest'
import { globMatch, matchesAny, parseArgs } from './args.ts'
import { REF_MAP } from './refmap.ts'
import { SCENES } from './scenes.ts'

describe('shots args', () => {
  it('defaults to every viewport and theme on the test server', () => {
    const o = parseArgs([])
    expect(o.viewport).toHaveLength(4)
    expect(o.theme).toHaveLength(8)
    expect(o.server).toBe('test')
  })

  it('restricts viewports and themes by prefix and case-insensitively', () => {
    const o = parseArgs(['--viewport', 'phone,desktop', '--theme=purple,oled_black', '--rtl', '--server', 'real'])
    expect(o.viewport.map((v) => v.name)).toEqual(['desktop-1920x1080', 'phone-390x844'])
    expect(o.theme).toEqual(['PURPLE', 'OLED_BLACK'])
    expect(o.rtl).toBe(true)
    expect(o.server).toBe('real')
  })

  it('picks an engine and the opt-in wide viewport', () => {
    expect(parseArgs([]).engine).toBe('chromium')
    const o = parseArgs(['--engine', 'WebKit', '--viewport', 'wide,phone'])
    expect(o.engine).toBe('webkit')
    expect(o.viewport.map((v) => v.name)).toEqual(['phone-390x844', 'wide-1440x900'])
    expect(parseArgs(['--viewport', 'all']).viewport).toHaveLength(4)
    expect(() => parseArgs(['--engine', 'ie'])).toThrow()
  })

  it('rejects unknown flags and values', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown flag --nope/)
    expect(() => parseArgs(['--scene'])).toThrow(/needs a value/)
    expect(() => parseArgs(['--theme', 'pink'])).toThrow()
    expect(() => parseArgs(['--server', 'prod'])).toThrow()
  })

  it('matches scene names by glob or family prefix', () => {
    expect(globMatch('home-*', 'home-drawer')).toBe(true)
    expect(matchesAny(['home'], 'home-drawer')).toBe(true)
    expect(matchesAny(['home'], 'homeless')).toBe(false)
    expect(matchesAny([], 'anything')).toBe(true)
  })
})

describe('scene manifest', () => {
  it('has unique kebab-case names', () => {
    const names = SCENES.map((s) => s.name)
    expect(new Set(names).size).toBe(names.length)
    for (const n of names) expect(n).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('maps every reference pair to a known scene', () => {
    const names = new Set(SCENES.map((s) => s.name))
    for (const p of REF_MAP) expect(names.has(p.scene), p.scene).toBe(true)
  })
})
