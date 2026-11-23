import { describe, expect, it } from 'vitest'
import { subtitleStyleReach } from './style'

describe('subtitleStyleReach', () => {
  it('says which subtitles the style options can restyle', () => {
    // text cues, and no track at all (the sample line), take every option
    expect(subtitleStyleReach(null)).toBe('text')
    expect(subtitleStyleReach({ kind: 'text' })).toBe('text')
    // pictures only take the image opacity
    expect(subtitleStyleReach({ kind: 'pgs' })).toBe('image')
    // ASS brings its own style
    expect(subtitleStyleReach({ kind: 'ass' })).toBe('styled')
    // drawn into the video by the server
    expect(subtitleStyleReach({ kind: 'burn-in' })).toBe('burned')
    // nothing is drawn: nothing to say
    expect(subtitleStyleReach({ kind: 'unavailable' })).toBe('text')
  })
})
