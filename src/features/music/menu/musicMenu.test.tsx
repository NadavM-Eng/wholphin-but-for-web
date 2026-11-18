import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { describe, expect, it, vi } from 'vitest'
import { testT as t, ud } from '../../common/testT'
import { buildMusicMenu, buildQueueMenu, type MusicMenuActions } from './musicMenu'

const actions = (): MusicMenuActions => ({
  navigate: vi.fn(),
  play: vi.fn(),
  playNext: vi.fn(),
  addToQueue: vi.fn(),
  removeFromQueue: vi.fn(),
  removeFromPlaylist: vi.fn(),
  addToPlaylist: vi.fn(),
  requestDelete: vi.fn(),
  setFavorite: vi.fn(),
})

describe('music context menu (ContextMenu.kt buildContextForMusic)', () => {
  it('song: no Go to; play, play next, add to queue, playlist, favorite, go to album / artist', () => {
    const song: BaseItemDto = { Id: 's', Type: 'Audio', AlbumId: 'al', ArtistItems: [{ Id: 'ar' }], UserData: ud({ IsFavorite: true }) }
    const items = buildMusicMenu(song, { index: 2, showGoTo: true, canDelete: false }, t, actions())
    expect(items.map((i) => i.key)).toEqual(['play', 'playNext', 'addToQueue', 'addToPlaylist', 'favorite', 'goToAlbum', 'goToArtist'])
    expect(items.find((i) => i.key === 'favorite')?.headline).toBe(t('remove_favorite'))
  })

  it('album with Go to, delete, remove from queue and remove from playlist', () => {
    const album: BaseItemDto = { Id: 'a', Type: 'MusicAlbum', ArtistItems: [{ Id: 'ar' }] }
    const items = buildMusicMenu(album, { index: 0, showGoTo: true, canDelete: true, canRemoveFromQueue: true, showRemoveFromPlaylist: true }, t, actions())
    expect(items.map((i) => i.key)).toEqual(['goTo', 'play', 'playNext', 'removeFromQueue', 'removeFromPlaylist', 'addToPlaylist', 'delete', 'favorite', 'goToArtist'])
  })

  it('artist: no go to album / artist', () => {
    const items = buildMusicMenu({ Id: 'x', Type: 'MusicArtist', ArtistItems: [{ Id: 'y' }] }, { index: 0, canDelete: false }, t, actions())
    expect(items.map((i) => i.key)).toEqual(['play', 'playNext', 'addToQueue', 'addToPlaylist', 'favorite'])
  })

  it('queue row menu', () => {
    const play = vi.fn()
    const items = buildQueueMenu(
      {
        key: 'k',
        id: 's',
        albumId: 'al',
        artistId: null,
        artistIds: [],
        title: 'S',
        albumTitle: null,
        artistNames: null,
        runtimeMs: null,
        imageUrl: null,
        hasLyrics: false,
        container: null,
        codec: null,
      },
      4,
      t,
      { navigate: vi.fn(), play, playNext: vi.fn(), remove: vi.fn() },
    )
    expect(items.map((i) => i.key)).toEqual(['play', 'playNext', 'removeFromQueue', 'goToAlbum'])
    items[0].onSelect()
    expect(play).toHaveBeenCalledWith(4)
  })
})
