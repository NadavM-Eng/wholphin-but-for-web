import { describe, expect, it } from 'vitest'
import { backdropUrls } from './useNowPlayingBackdrop'

describe('backdropUrls (NowPlayingViewModel.backdropImageUrls)', () => {
  const artist = { Id: 'a1', BackdropImageTags: ['bbb', 'aaa'] }

  it('numbers the backdrops by sorted tag and sizes the rendition that is drawn', () => {
    expect(backdropUrls('http://jf', artist, 1344)).toEqual([
      'http://jf/Items/a1/Images/Backdrop/0?quality=96&fillWidth=1344&tag=aaa',
      'http://jf/Items/a1/Images/Backdrop/1?quality=96&fillWidth=1344&tag=bbb',
    ])
  })

  it('without a width asks for the stored image, which the colours are taken from (upstream sends no size)', () => {
    expect(backdropUrls('http://jf', artist, null)).toEqual([
      'http://jf/Items/a1/Images/Backdrop/0?quality=96&tag=aaa',
      'http://jf/Items/a1/Images/Backdrop/1?quality=96&tag=bbb',
    ])
  })
})
