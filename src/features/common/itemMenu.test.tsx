import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { describe, expect, it, vi } from 'vitest'
import { buildItemMenu, type ItemMenuDeps, type ItemMenuOptions } from './itemMenu'
import { testT as t, ud } from './testT'

function deps(over: Partial<ItemMenuDeps> = {}): ItemMenuDeps {
  return {
    t,
    navigate: vi.fn(),
    canDelete: false,
    setPlayed: vi.fn(),
    setFavorite: vi.fn(),
    removeFromNextUp: vi.fn(),
    requestDelete: vi.fn(),
    openPlayWith: vi.fn(),
    handlers: {
      addToPlaylist: vi.fn(),
      addToQueue: vi.fn(),
      playMusic: vi.fn(),
      showMediaInfo: vi.fn(),
      sendMediaInfoLog: vi.fn(),
      chooseStream: vi.fn(),
      clearTrackChoices: vi.fn(),
    },
    ...over,
  }
}

const keys = (item: BaseItemDto, opts: ItemMenuOptions = {}, d = deps()) => buildItemMenu(item, opts, d).map((e) => e.key)
const TICKS_MIN = 60 * 10_000_000

describe('buildItemMenu order and conditions (ContextMenu.kt:331-655)', () => {
  it('movie with a resume point on a library grid', () => {
    const movie: BaseItemDto = { Id: 'm', Type: 'Movie', UserData: ud({ PlaybackPositionTicks: 5 * TICKS_MIN }), MediaSources: [{}] }
    expect(keys(movie, {}, deps({ canDelete: true }))).toEqual([
      'goTo',
      'resume',
      'restart',
      'addToPlaylist',
      'delete',
      'watched',
      'favorite',
      'mediaInfo',
      'playWith',
      'sendMediaInfo',
    ])
  })

  it('next-up episode in the combined home row', () => {
    const ep: BaseItemDto = { Id: 'e', Type: 'Episode', SeriesId: 's', UserData: ud({ Played: false }) }
    expect(keys(ep, { canRemoveContinueWatching: true, canRemoveNextUp: true })).toEqual([
      'goTo',
      'play',
      'addToPlaylist',
      'removeNextUp',
      'watched',
      'favorite',
      'goToSeries',
      'playWith',
    ])
  })

  it('resumable episode in the combined row also offers "remove from continue watching"', () => {
    const ep: BaseItemDto = { Id: 'e', Type: 'Episode', SeriesId: 's', UserData: ud({ PlaybackPositionTicks: 10 }) }
    expect(keys(ep, { canRemoveContinueWatching: true, canRemoveNextUp: true })).toContain('removeContinueWatching')
  })

  it('series: shuffle, no series link', () => {
    expect(keys({ Id: 's', Type: 'Series' })).toEqual(['goTo', 'play', 'shuffle', 'addToPlaylist', 'watched', 'favorite', 'playWith'])
  })

  it('audio playlist: Play and Shuffle go to the music queue, not the video player', () => {
    const d = deps()
    const menu = buildItemMenu({ Id: 'p', Type: 'Playlist', MediaType: 'Audio' }, {}, d)
    expect(menu.map((e) => e.key).slice(0, 3)).toEqual(['goTo', 'play', 'shuffle'])
    menu.find((e) => e.key === 'shuffle')?.onSelect?.()
    expect(d.handlers.playMusic).toHaveBeenCalledWith(expect.objectContaining({ Id: 'p' }), { shuffle: true })
    expect(d.navigate).not.toHaveBeenCalled()
  })

  it('song: no Go To, add to queue, album and artist links', () => {
    const song: BaseItemDto = { Id: 'a', Type: 'Audio', AlbumId: 'al', ArtistItems: [{ Id: 'ar' }] }
    expect(keys(song)).toEqual(['addToQueue', 'addToPlaylist', 'watched', 'favorite', 'goToAlbum', 'goToArtist'])
  })

  it('stream choices only on detail pages', () => {
    const movie: BaseItemDto = {
      Id: 'm',
      Type: 'Movie',
      MediaSources: [
        { Id: 'a', MediaStreams: [{ Type: 'Audio' }, { Type: 'Audio' }, { Type: 'Subtitle' }] },
        { Id: 'b', MediaStreams: [] },
      ],
    }
    expect(keys(movie, { showGoTo: false, showStreamChoices: true, canClearChosenStreams: true })).toEqual([
      'play',
      'chooseAudio',
      'chooseSubtitles',
      'chooseVersion',
      'addToPlaylist',
      'watched',
      'favorite',
      'mediaInfo',
      'clearTrackChoices',
      'playWith',
      'sendMediaInfo',
    ])
  })

  it('the Favorite entry always calls the favorite action (fixes the favorites-page bug)', () => {
    const d = deps()
    const menu = buildItemMenu({ Id: 'm', Type: 'Movie', UserData: ud({ IsFavorite: true, Played: true }) }, {}, d)
    menu.find((e) => e.key === 'favorite')!.onSelect()
    expect(d.setFavorite).toHaveBeenCalledWith(expect.objectContaining({ Id: 'm' }), false)
    expect(d.setPlayed).not.toHaveBeenCalled()
    menu.find((e) => e.key === 'watched')!.onSelect()
    expect(d.setPlayed).toHaveBeenCalledWith(expect.objectContaining({ Id: 'm' }), false)
  })

  it('resume navigates to the player at the saved position', () => {
    const d = deps()
    buildItemMenu({ Id: 'm', Type: 'Movie', UserData: ud({ PlaybackPositionTicks: 90_000_000 }) }, {}, d)
      .find((e) => e.key === 'resume')!
      .onSelect()
    expect(d.navigate).toHaveBeenCalledWith('/play/m?t=9000')
  })
})
