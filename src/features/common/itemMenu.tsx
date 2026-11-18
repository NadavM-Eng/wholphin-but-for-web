// `buildContextMenuItems` (W/ui/components/ContextMenu.kt:331-655): the long-press menu of an item with
// upstream's entries, order and conditions.
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { itemDestination, nav } from '../../app/nav'
import { ticksToMs, type Translate } from '../../lib/format'
import { FaIcon, MaterialIcon, type DialogItem } from '../../ui'
import { isPlayableType, isShufflableType } from './itemKinds'
import styles from './itemMenu.module.css'
import type { ItemMenuHandlers } from './itemMenuHandlers'

/** Per-page switches (upstream `ContextMenu.ForBaseItem` fields). */
export type ItemMenuOptions = {
  /** "Go To" entry (false on the item's own detail page). Default true. */
  showGoTo?: boolean
  /** Target of "Go To" when the card has a destination override (genre / studio tiles). */
  goToHref?: string
  /** Choose audio / subtitles / version and "Clear track choices" (detail pages). Default false. */
  showStreamChoices?: boolean
  /** Home rows ContinueWatching / Combined. */
  canRemoveContinueWatching?: boolean
  /** Home rows NextUp / Combined. */
  canRemoveNextUp?: boolean
  /** Playlist pages: "Remove from playlist" (index = position in the playlist). */
  removeFromPlaylist?: { index: number; onRemove: (item: BaseItemDto, index: number) => void }
  /** Detail pages: the media source currently chosen (for the stream-choice counts). */
  chosenSourceId?: string | null
  /** Detail pages: whether there are saved track choices to clear. */
  canClearChosenStreams?: boolean
  /**
   * Replaces the default delete after the confirmation (detail pages: their own item is deleted with the
   * "Deleted" toast and Back, upstream `viewModel.deleteItem`). Per-open only (not kept in `defaults`).
   */
  onDelete?: (item: BaseItemDto) => void
}

export type ItemMenuDeps = {
  t: Translate
  navigate: (path: string) => void
  canDelete: boolean
  setPlayed: (item: BaseItemDto, played: boolean) => void
  setFavorite: (item: BaseItemDto, favorite: boolean) => void
  removeFromNextUp: (item: BaseItemDto) => void
  /** Opens the delete confirmation (the menu stays as upstream `dismissOnClick = false`). */
  requestDelete: (item: BaseItemDto) => void
  /** Opens the "Play with" sub-menu. */
  openPlayWith: (item: BaseItemDto) => void
  handlers: ItemMenuHandlers
  /** Closes the menu (after a stream choice is picked in the chooser it opened). */
  closeMenu?: () => void
}

/** Upstream `Color.Red` (favorite heart) and `Color.Red.copy(alpha = .8f)` (delete). */
const RED = 'var(--fx-favorite-active)'
const DELETE_RED = 'var(--fx-delete-red)'

export function resumeMs(item: BaseItemDto): number {
  return ticksToMs(item.UserData?.PlaybackPositionTicks ?? 0)
}

export function buildItemMenu(item: BaseItemDto, opts: ItemMenuOptions, d: ItemMenuDeps): DialogItem[] {
  const { t } = d
  const out: DialogItem[] = []
  const id = item.Id ?? ''
  const played = item.UserData?.Played ?? false
  const favorite = item.UserData?.IsFavorite ?? false
  const position = resumeMs(item)
  const hasPosition = (item.UserData?.PlaybackPositionTicks ?? 0) > 0
  const go = (path: string) => () => d.navigate(path)

  // Songs do not show Go To.
  if ((opts.showGoTo ?? true) && item.Type !== 'Audio') {
    out.push({ key: 'goTo', headline: t('go_to'), leading: <MaterialIcon name="arrow_forward" />, onSelect: go(opts.goToHref ?? itemDestination(item)) })
  }
  // An audio playlist plays in the music queue, not the video player (PlaylistDetails.kt MediaType.AUDIO)
  const music = item.Type === 'Playlist' && item.MediaType === 'Audio'
  if (music) {
    out.push({ key: 'play', headline: t('play'), leading: <MaterialIcon name="play_arrow" />, onSelect: () => d.handlers.playMusic(item, {}) })
    out.push({ key: 'shuffle', headline: t('shuffle'), leading: <FaIcon name="shuffle" />, onSelect: () => d.handlers.playMusic(item, { shuffle: true }) })
  } else if (isPlayableType(item.Type)) {
    if (hasPosition) {
      out.push({ key: 'resume', headline: t('resume'), leading: <MaterialIcon name="play_arrow" />, onSelect: go(nav.play(id, { t: position })) })
      out.push({ key: 'restart', headline: t('restart'), leading: <MaterialIcon name="refresh" />, onSelect: go(nav.play(id)) })
    } else {
      out.push({ key: 'play', headline: t('play'), leading: <MaterialIcon name="play_arrow" />, onSelect: go(nav.play(id)) })
    }
  }
  if (!music && isShufflableType(item.Type)) {
    out.push({ key: 'shuffle', headline: t('shuffle'), leading: <FaIcon name="shuffle" />, onSelect: go(nav.playList(id, { shuffle: true })) })
  }
  if (opts.showStreamChoices && item.MediaSources?.length) {
    const sources = item.MediaSources
    const source = sources.find((s) => opts.chosenSourceId != null && s.Id === opts.chosenSourceId) ?? sources[0]
    const streams = source?.MediaStreams ?? []
    if (streams.filter((s) => s.Type === 'Audio').length > 1) {
      out.push({
        key: 'chooseAudio',
        headline: t('choose_stream', { p1: t('audio') }),
        leading: <FaIcon name="volume_low" />,
        keepOpen: true,
        onSelect: () => d.handlers.chooseStream(item, 'audio', d.closeMenu),
      })
    }
    if (streams.some((s) => s.Type === 'Subtitle')) {
      out.push({
        key: 'chooseSubtitles',
        headline: t('choose_stream', { p1: t('subtitles') }),
        leading: <FaIcon name="closed_captioning" />,
        keepOpen: true,
        onSelect: () => d.handlers.chooseStream(item, 'subtitles', d.closeMenu),
      })
    }
    if (sources.length > 1) {
      out.push({
        key: 'chooseVersion',
        headline: t('choose_stream', { p1: t('version') }),
        leading: <FaIcon name="file_video" />,
        keepOpen: true,
        onSelect: () => d.handlers.chooseStream(item, 'version', d.closeMenu),
      })
    }
  }
  if (item.Type === 'MusicAlbum' || item.Type === 'Audio') {
    out.push({ key: 'addToQueue', headline: t('add_to_queue'), leading: <MaterialIcon name="add" />, onSelect: () => d.handlers.addToQueue(item) })
  }
  if (opts.removeFromPlaylist) {
    const { index, onRemove } = opts.removeFromPlaylist
    out.push({
      key: 'removeFromPlaylist',
      headline: t('remove_from_playlist'),
      leading: <FaIcon name="circle_xmark" />,
      onSelect: () => onRemove(item, index),
    })
  }
  out.push({ key: 'addToPlaylist', headline: t('add_to_playlist'), leading: <FaIcon name="list_ul" />, onSelect: () => d.handlers.addToPlaylist(item) })
  if (d.canDelete) {
    out.push({
      key: 'delete',
      headline: t('delete'),
      leading: <MaterialIcon name="delete" />,
      leadingColor: DELETE_RED,
      keepOpen: true,
      onSelect: () => d.requestDelete(item),
    })
  }
  if (opts.canRemoveContinueWatching && !played && hasPosition) {
    out.push({
      key: 'removeContinueWatching',
      headline: t('remove_continue_watching'),
      leading: <FaIcon name="eye" />,
      onSelect: () => d.setPlayed(item, false),
    })
  }
  if (opts.canRemoveNextUp && item.Type === 'Episode' && item.SeriesId) {
    out.push({ key: 'removeNextUp', headline: t('remove_next_up'), leading: <FaIcon name="tag" />, onSelect: () => d.removeFromNextUp(item) })
  }
  out.push({
    key: 'watched',
    headline: t(played ? 'mark_unwatched' : 'mark_watched'),
    leading: <FaIcon name={played ? 'eye' : 'eye_slash'} />,
    onSelect: () => d.setPlayed(item, !played),
  })
  // Always the favorite API. Upstream's favorites page wires this entry to setWatched
  // (W/ui/detail/FavoritesPage.kt, spec 03 §16.3); here every page shares this action.
  out.push({
    key: 'favorite',
    headline: t(favorite ? 'remove_favorite' : 'add_favorite'),
    leading: <FaIcon name="heart" />,
    leadingColor: favorite ? RED : undefined,
    onSelect: () => d.setFavorite(item, !favorite),
  })
  if (item.AlbumId) {
    out.push({ key: 'goToAlbum', headline: t('go_to_album'), leading: <FaIcon name="compact_disc" />, onSelect: go(nav.item(item.AlbumId)) })
  }
  const artistId = item.ArtistItems?.[0]?.Id
  if (artistId) {
    out.push({ key: 'goToArtist', headline: t('go_to_artist'), leading: <FaIcon name="user" />, onSelect: go(nav.item(artistId)) })
  }
  if (item.SeriesId) {
    // ContextMenu.kt:599 uses the auto-mirrored arrow here, unlike "Go to" (:354)
    out.push({ key: 'goToSeries', headline: t('go_to_series'), leading: <MaterialIcon name="arrow_forward" className={styles.autoMirror} />, onSelect: go(nav.item(item.SeriesId)) })
  }
  const hasSources = (item.MediaSources?.length ?? 0) > 0
  if (hasSources) {
    out.push({ key: 'mediaInfo', headline: t('media_information'), leading: <MaterialIcon name="info" />, onSelect: () => d.handlers.showMediaInfo(item) })
  }
  if (opts.showStreamChoices && opts.canClearChosenStreams) {
    out.push({
      key: 'clearTrackChoices',
      headline: t('clear_track_choices'),
      leading: <MaterialIcon name="delete" />,
      onSelect: () => d.handlers.clearTrackChoices(item),
    })
  }
  if (isPlayableType(item.Type)) {
    out.push({ key: 'playWith', headline: t('play_with'), leading: <MaterialIcon name="play_arrow" />, onSelect: () => d.openPlayWith(item) })
  }
  if (hasSources) {
    out.push({
      key: 'sendMediaInfo',
      headline: t('send_media_info_log_to_server'),
      leading: <FaIcon name="file_video" />,
      onSelect: () => d.handlers.sendMediaInfoLog(item),
    })
  }
  return out
}

/**
 * "Play with" sub-menu (`buildPlayWith`). Upstream lists its Android player backends plus "Transcoding";
 * the browser has one player, so the web offers playing normally (the server decides direct play) or
 * forcing a transcode.
 */
export function buildPlayWithMenu(item: BaseItemDto, d: Pick<ItemMenuDeps, 't' | 'navigate'>): DialogItem[] {
  const id = item.Id ?? ''
  const t = resumeMs(item)
  return [
    { key: 'play', headline: d.t('play'), onSelect: () => d.navigate(nav.play(id, { t })) },
    { key: 'transcode', headline: d.t('transcoding'), onSelect: () => d.navigate(nav.play(id, { t, transcode: true })) },
  ]
}
