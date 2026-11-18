import { describe, expect, it } from 'vitest'
import { cueTextStyle, cueWindowColor, DEFAULT_SUBTITLE_STYLE, edgeSizeDp, MEDIA3_EDGE_DP, type SubtitleStyle } from './subtitleStyle'

const style = (over: Partial<SubtitleStyle>): SubtitleStyle => ({ ...DEFAULT_SUBTITLE_STYLE, ...over })
/** dpCss(n): the rem length of n dp */
const rem = (dp: number) => `${dp / 16}rem`

describe('cueTextStyle (Media3 SubtitlePainter)', () => {
  it('strokes the outline with edgeThickness / 2 dp, so half of that shows outside the glyphs', () => {
    // defaults: edge size "2.0" = thickness 4 -> a 2dp stroke -> a 1dp visible outline
    expect(DEFAULT_SUBTITLE_STYLE.edgeThickness).toBe(4)
    expect(edgeSizeDp(DEFAULT_SUBTITLE_STYLE)).toBe(2)
    const css = cueTextStyle(DEFAULT_SUBTITLE_STYLE)
    expect(css.WebkitTextStroke).toBe(`${rem(2)} rgb(0 0 0 / 1.000)`)
    expect(css.paintOrder).toBe('stroke fill')
    expect(cueTextStyle(style({ edgeThickness: 10 })).WebkitTextStroke).toBe(`${rem(5)} rgb(0 0 0 / 1.000)`)
  })

  it('keeps Media3 own 2dp outline where upstream does not override it (margin and image samples)', () => {
    expect(cueTextStyle(style({ edgeThickness: 10 }), MEDIA3_EDGE_DP).WebkitTextStroke).toBe(`${rem(2)} rgb(0 0 0 / 1.000)`)
  })

  it('draws the drop shadow at the fixed 2dp offset whatever the edge size', () => {
    const a = cueTextStyle(style({ edgeStyle: 'EDGE_SHADOW', edgeThickness: 4 }))
    const b = cueTextStyle(style({ edgeStyle: 'EDGE_SHADOW', edgeThickness: 20 }))
    expect(a.textShadow).toBe(b.textShadow)
    expect(a.textShadow?.startsWith(`${rem(2)} ${rem(2)} `)).toBe(true)
    expect(a.WebkitTextStroke).toBeUndefined()
  })

  it('has no edge for EDGE_NONE and no font size of its own', () => {
    const css = cueTextStyle(style({ edgeStyle: 'EDGE_NONE' }))
    expect(css.WebkitTextStroke).toBeUndefined()
    expect(css.textShadow).toBeUndefined()
    expect(css.fontSize).toBeUndefined()
  })

  it('paints the wrap background on the text itself, without padding, and the box background as a window', () => {
    const wrap = style({ backgroundStyle: 'BG_WRAP', backgroundColor: '#000000', backgroundOpacity: 50 })
    expect(cueTextStyle(wrap).backgroundColor).toBe('rgb(0 0 0 / 0.498)')
    expect(cueTextStyle(wrap).paddingInline).toBeUndefined()
    expect(cueWindowColor(wrap)).toBeNull()
    const boxed = style({ backgroundStyle: 'BG_BOXED', backgroundColor: '#000000', backgroundOpacity: 50 })
    expect(cueTextStyle(boxed).backgroundColor).toBeUndefined()
    expect(cueWindowColor(boxed)).toBe('rgb(0 0 0 / 0.498)')
    expect(cueWindowColor(DEFAULT_SUBTITLE_STYLE)).toBeNull()
  })
})
