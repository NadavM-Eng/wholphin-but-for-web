import { describe, expect, it } from 'vitest'
import {
  buildItemImageUrl,
  bucketPx,
  getItemImageUrl,
  getPersonImageUrl,
  getUserImageUrl,
  imagePx,
  type ImageItem,
} from './images'

const BASE = 'http://jf.local:8096/'
const path = (url: string | null) => {
  if (!url) return null
  const u = new URL(url)
  return `${u.pathname}?${u.searchParams.toString()}`
}

const episode: ImageItem = {
  Id: 'ep1',
  Type: 'Episode',
  SeriesId: 'ser1',
  ImageTags: { Primary: 'epPrim' },
  BackdropImageTags: [],
  ParentThumbItemId: 'ser1',
  ParentThumbImageTag: 'serThumb',
  ParentBackdropItemId: 'ser1',
  ParentBackdropImageTags: ['serBd'],
  SeriesPrimaryImageTag: 'serPrim',
  ParentLogoItemId: 'ser1',
  ParentLogoImageTag: 'serLogo',
}

describe('buildItemImageUrl', () => {
  it('emits only non-null params and quality 96', () => {
    expect(path(buildItemImageUrl(BASE, 'abc', 'Primary', { fillHeight: 258, tag: 't1' }))).toBe(
      '/Items/abc/Images/Primary?quality=96&fillHeight=258&tag=t1',
    )
    expect(path(buildItemImageUrl(BASE, 'abc', 'Primary', { fillWidth: 0, fillHeight: -1 }))).toBe(
      '/Items/abc/Images/Primary?quality=96',
    )
    expect(path(buildItemImageUrl(BASE, 'abc', 'Backdrop', { imageIndex: 2 }))).toBe('/Items/abc/Images/Backdrop/2?quality=96')
  })
  it('returns null without a base url', () => {
    expect(buildItemImageUrl('', 'abc', 'Primary')).toBeNull()
    expect(buildItemImageUrl(null, 'abc', 'Primary')).toBeNull()
  })
})

describe('getItemImageUrl selection rules', () => {
  it('logo: series logo for episodes, tag only if parent logo item is the series', () => {
    expect(path(getItemImageUrl(BASE, episode, 'Logo'))).toBe('/Items/ser1/Images/Logo?quality=96&tag=serLogo')
    expect(path(getItemImageUrl(BASE, { ...episode, ParentLogoItemId: 'other' }, 'Logo'))).toBe(
      '/Items/ser1/Images/Logo?quality=96',
    )
    expect(path(getItemImageUrl(BASE, { Id: 'm', Type: 'Movie', ImageTags: { Logo: 'L' } }, 'Logo'))).toBe(
      '/Items/m/Images/Logo?quality=96&tag=L',
    )
  })

  it('backdrop: series backdrop for episodes, own backdrop, else null', () => {
    expect(path(getItemImageUrl(BASE, episode, 'Backdrop'))).toBe('/Items/ser1/Images/Backdrop?quality=96&tag=serBd')
    expect(path(getItemImageUrl(BASE, { Id: 'm', Type: 'Movie', BackdropImageTags: ['b0', 'b1'] }, 'Backdrop'))).toBe(
      '/Items/m/Images/Backdrop?quality=96&tag=b0',
    )
    expect(getItemImageUrl(BASE, { Id: 'm', Type: 'Movie', BackdropImageTags: [] }, 'Backdrop')).toBeNull()
  })

  it('compares ids regardless of dashes/case', () => {
    const id = '0123456789abcdef0123456789abcdef'
    const dashed = '01234567-89AB-CDEF-0123-456789ABCDEF'
    const ep = { ...episode, SeriesId: id, ParentLogoItemId: dashed }
    expect(path(getItemImageUrl(BASE, ep, 'Logo'))).toBe(`/Items/${id}/Images/Logo?quality=96&tag=serLogo`)
  })

  it('thumb: parent thumb, parent backdrop, season parent thumb, episode primary, own backdrop, own thumb', () => {
    // (a) parent thumb
    expect(path(getItemImageUrl(BASE, episode, 'Thumb'))).toBe('/Items/ser1/Images/Thumb?quality=96&tag=serThumb')
    // (b) parent backdrop when no parent thumb
    expect(path(getItemImageUrl(BASE, { ...episode, ParentThumbItemId: null }, 'Thumb'))).toBe(
      '/Items/ser1/Images/Backdrop?quality=96&tag=serBd',
    )
    // (c) season without own thumb, useSeries off
    const season: ImageItem = { Id: 's1', Type: 'Season', SeriesId: 'ser1', ImageTags: {}, ParentThumbItemId: 'ser1', ParentThumbImageTag: 'pt' }
    expect(path(getItemImageUrl(BASE, season, 'Thumb', { useSeriesForPrimary: false }))).toBe(
      '/Items/ser1/Images/Thumb?quality=96&tag=pt',
    )
    // (d) episode, no parent thumb/backdrop -> own primary
    const bare: ImageItem = { Id: 'e', Type: 'Episode', SeriesId: 'ser1', ImageTags: { Primary: 'p' } }
    expect(path(getItemImageUrl(BASE, bare, 'Thumb'))).toBe('/Items/e/Images/Primary?quality=96&tag=p')
    // (e) movie without thumb but with backdrop
    expect(path(getItemImageUrl(BASE, { Id: 'm', Type: 'Movie', ImageTags: {}, BackdropImageTags: ['b'] }, 'Thumb'))).toBe(
      '/Items/m/Images/Backdrop?quality=96&tag=b',
    )
    // (f) own thumb
    expect(path(getItemImageUrl(BASE, { Id: 'm', Type: 'Movie', ImageTags: { Thumb: 't' } }, 'Thumb'))).toBe(
      '/Items/m/Images/Thumb?quality=96&tag=t',
    )
  })

  it('primary: series poster for episodes when useSeries, else own; season falls back to series', () => {
    expect(path(getItemImageUrl(BASE, episode, 'Primary', { fillHeight: 258 }))).toBe(
      '/Items/ser1/Images/Primary?quality=96&fillHeight=258&tag=serPrim',
    )
    expect(path(getItemImageUrl(BASE, episode, 'Primary', { useSeriesForPrimary: false }))).toBe(
      '/Items/ep1/Images/Primary?quality=96&tag=epPrim',
    )
    expect(path(getItemImageUrl(BASE, episode, 'Banner'))).toBe('/Items/ser1/Images/Banner?quality=96')
    const season: ImageItem = { Id: 's1', Type: 'Season', SeriesId: 'ser1', ImageTags: {}, SeriesPrimaryImageTag: 'sp' }
    expect(path(getItemImageUrl(BASE, season, 'Primary', { useSeriesForPrimary: false }))).toBe(
      '/Items/ser1/Images/Primary?quality=96&tag=sp',
    )
  })

  it('primary: no request for a series image the server says does not exist (no SeriesPrimaryImageTag)', () => {
    // the season and the episodes of a Live TV recording: their series has no primary image
    const season: ImageItem = { Id: 's1', Type: 'Season', SeriesId: 'ser1', ImageTags: {} }
    expect(getItemImageUrl(BASE, season, 'Primary')).toBeNull()
    expect(getItemImageUrl(BASE, season, 'Primary', { useSeriesForPrimary: false })).toBeNull()
    const ep: ImageItem = { Id: 'e1', Type: 'Episode', SeriesId: 'ser1', ImageTags: { Primary: 'p' } }
    expect(getItemImageUrl(BASE, ep, 'Primary')).toBeNull()
    // the item's own image is still used where the series image is not asked for
    expect(path(getItemImageUrl(BASE, ep, 'Primary', { useSeriesForPrimary: false }))).toBe('/Items/e1/Images/Primary?quality=96&tag=p')
    expect(path(getItemImageUrl(BASE, { ...season, ImageTags: { Primary: 'own' } }, 'Primary', { useSeriesForPrimary: false }))).toBe(
      '/Items/s1/Images/Primary?quality=96&tag=own',
    )
    // a banner has no tag to tell by: asked for as before
    expect(path(getItemImageUrl(BASE, season, 'Banner'))).toBe('/Items/ser1/Images/Banner?quality=96')
  })

  it('other types use the item itself', () => {
    expect(path(getItemImageUrl(BASE, { Id: 'a', Type: 'MusicAlbum', ImageTags: { Disc: 'd' } }, 'Disc'))).toBe(
      '/Items/a/Images/Disc?quality=96&tag=d',
    )
    expect(getItemImageUrl(BASE, null, 'Primary')).toBeNull()
  })
})

describe('user and person images', () => {
  it('builds avatar and person urls', () => {
    expect(path(getUserImageUrl(BASE, 'u1', 'tag'))).toBe('/UserImage?userId=u1&tag=tag')
    expect(path(getPersonImageUrl(BASE, { Id: 'p', PrimaryImageTag: 'x' }))).toBe('/Items/p/Images/Primary?tag=x')
  })
})

describe('device pixel sizing', () => {
  it('buckets up', () => {
    expect(bucketPx(1)).toBe(64)
    expect(bucketPx(172)).toBe(200)
    expect(bucketPx(200)).toBe(200)
    expect(bucketPx(99999)).toBe(3840)
  })
  it('applies scale for dp and dpr for both', () => {
    expect(imagePx(172, 'dp', 1, 1)).toBe(200)
    expect(imagePx(172, 'dp', 1.25, 2)).toBe(480) // 430
    expect(imagePx(172, 'css', 1.25, 2)).toBe(400) // 344
    expect(imagePx(0)).toBeNull()
  })
})
