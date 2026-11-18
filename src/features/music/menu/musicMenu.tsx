// `buildContextForMusic` and `buildContextForMusicQueue` (W/ui/components/ContextMenu.kt:758-960): the
// long-press menus of songs, albums and artists on the music pages, and of rows in the Now Playing queue.
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { itemDestination, nav } from '../../../app/nav'
import type { Translate } from '../../../lib/format'
import type { AudioItem } from '../../../stores/musicQueue'
import { FaIcon, MaterialIcon, type DialogItem } from '../../../ui'

/** Upstream `Color.Red` (favorite heart) and `Color.Red.copy(alpha = .8f)` (delete). */
const RED = 'var(--fx-favorite-active)'
const DELETE_RED = 'var(--fx-delete-red)'

export type MusicMenuOptions = {
  /** Position of the item in its list (passed to Play / Remove). */
  index: number
  /** "Go to" (album/artist/similar rows; never for songs). Default false. */
  showGoTo?: boolean
  /** Now Playing: "Remove from queue" instead of "Add to queue". */
  canRemoveFromQueue?: boolean
  /** Editable playlist: "Remove from playlist". */
  showRemoveFromPlaylist?: boolean
  canDelete: boolean
}

export type MusicMenuActions = {
  navigate: (path: string) => void
  play: (index: number, item: BaseItemDto) => void
  playNext: (index: number, item: BaseItemDto) => void
  addToQueue: (item: BaseItemDto) => void
  removeFromQueue: (index: number, item: BaseItemDto) => void
  removeFromPlaylist: (index: number, item: BaseItemDto) => void
  addToPlaylist: (item: BaseItemDto) => void
  requestDelete: (item: BaseItemDto) => void
  setFavorite: (item: BaseItemDto, favorite: boolean) => void
}

export function buildMusicMenu(item: BaseItemDto, o: MusicMenuOptions, t: Translate, a: MusicMenuActions): DialogItem[] {
  const out: DialogItem[] = []
  const favorite = item.UserData?.IsFavorite ?? false
  // Songs should not show Go to
  if (o.showGoTo && item.Type !== 'Audio') {
    out.push({ key: 'goTo', headline: t('go_to'), leading: <MaterialIcon name="arrow_forward" />, onSelect: () => a.navigate(itemDestination(item)) })
  }
  out.push({ key: 'play', headline: t('play'), leading: <MaterialIcon name="play_arrow" />, onSelect: () => a.play(o.index, item) })
  out.push({ key: 'playNext', headline: t('play_next'), leading: <MaterialIcon name="play_arrow" />, onSelect: () => a.playNext(o.index, item) })
  if (o.canRemoveFromQueue) {
    out.push({ key: 'removeFromQueue', headline: t('remove_from_queue'), leading: <MaterialIcon name="delete" />, onSelect: () => a.removeFromQueue(o.index, item) })
  } else {
    out.push({ key: 'addToQueue', headline: t('add_to_queue'), leading: <MaterialIcon name="add" />, onSelect: () => a.addToQueue(item) })
  }
  if (o.showRemoveFromPlaylist) {
    out.push({
      key: 'removeFromPlaylist',
      headline: t('remove_from_playlist'),
      leading: <FaIcon name="circle_xmark" />,
      onSelect: () => a.removeFromPlaylist(o.index, item),
    })
  }
  out.push({ key: 'addToPlaylist', headline: t('add_to_playlist'), leading: <FaIcon name="list_ul" />, onSelect: () => a.addToPlaylist(item) })
  if (o.canDelete) {
    out.push({ key: 'delete', headline: t('delete'), leading: <MaterialIcon name="delete" />, leadingColor: DELETE_RED, onSelect: () => a.requestDelete(item) })
  }
  out.push({
    key: 'favorite',
    headline: t(favorite ? 'remove_favorite' : 'add_favorite'),
    leading: <FaIcon name="heart" />,
    leadingColor: favorite ? RED : undefined,
    onSelect: () => a.setFavorite(item, !favorite),
  })
  if (item.Type === 'Audio' && item.AlbumId) {
    const albumId = item.AlbumId
    out.push({ key: 'goToAlbum', headline: t('go_to_album'), leading: <FaIcon name="compact_disc" />, onSelect: () => a.navigate(nav.item(albumId)) })
  }
  const artistId = item.ArtistItems?.[0]?.Id
  if ((item.Type === 'Audio' || item.Type === 'MusicAlbum') && artistId) {
    out.push({ key: 'goToArtist', headline: t('go_to_artist'), leading: <FaIcon name="user" />, onSelect: () => a.navigate(nav.item(artistId)) })
  }
  return out
}

export type QueueMenuActions = {
  navigate: (path: string) => void
  play: (index: number) => void
  playNext: (index: number) => void
  remove: (index: number) => void
}

/** Now Playing queue row menu: Play, Play next, Remove from queue, Go to album, Go to artist. */
export function buildQueueMenu(entry: AudioItem, index: number, t: Translate, a: QueueMenuActions): DialogItem[] {
  const out: DialogItem[] = [
    { key: 'play', headline: t('play'), leading: <MaterialIcon name="play_arrow" />, onSelect: () => a.play(index) },
    { key: 'playNext', headline: t('play_next'), leading: <MaterialIcon name="play_arrow" />, onSelect: () => a.playNext(index) },
    { key: 'removeFromQueue', headline: t('remove_from_queue'), leading: <MaterialIcon name="delete" />, onSelect: () => a.remove(index) },
  ]
  if (entry.albumId) {
    const albumId = entry.albumId
    out.push({ key: 'goToAlbum', headline: t('go_to_album'), leading: <MaterialIcon name="arrow_forward" />, onSelect: () => a.navigate(nav.item(albumId)) })
  }
  if (entry.artistId) {
    const artistId = entry.artistId
    out.push({ key: 'goToArtist', headline: t('go_to_artist'), leading: <MaterialIcon name="arrow_forward" />, onSelect: () => a.navigate(nav.item(artistId)) })
  }
  return out
}
