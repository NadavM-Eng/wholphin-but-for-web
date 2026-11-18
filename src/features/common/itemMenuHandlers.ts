// Context-menu actions whose screens live in other features. Each defaults to a clearly named placeholder that
// shows a toast; the owning feature replaces it once, app-wide, with
// `setItemMenuHandlers({ addToPlaylist: openPlaylistDialog })` (detail/common/itemDialogs, music/MusicHost,
// app/startup).
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { toast } from '../../app/toast'
import { i18next } from '../../i18n'

export type StreamChoiceKind = 'audio' | 'subtitles' | 'version'

export type ItemMenuHandlers = {
  /** Upstream `PlaylistDialog` (pick or create a playlist, then add). */
  addToPlaylist: (item: BaseItemDto) => void
  /** Music queue (album / song). */
  addToQueue: (item: BaseItemDto) => void
  /** Replace the music queue with the songs of an album / artist / audio playlist and play (MusicViewModel.play). */
  playMusic: (item: BaseItemDto, opts: { startIndex?: number; shuffle?: boolean }) => void
  /** `ItemDetailsDialog` ("Media Information"). */
  showMediaInfo: (item: BaseItemDto) => void
  /** `ServerReportService.sendMediaReportFor`. */
  sendMediaInfoLog: (item: BaseItemDto) => void
  /**
   * Choose audio / subtitle track or version (detail pages with stream choices). `onChosen` runs after a pick
   * (the context menu closes then, ContextMenu.kt onChooseTracks -> onDismissRequest); a cancel leaves the menu.
   */
  chooseStream: (item: BaseItemDto, kind: StreamChoiceKind, onChosen?: () => void) => void
  /** Delete the saved track choices of the item / series. */
  clearTrackChoices: (item: BaseItemDto) => void
}

/** Placeholder for an action whose UI is not built yet: tells the user instead of failing silently. */
export function placeholderAction(labelKey: string): () => void {
  return () => {
    toast(i18next.t('web_not_available_yet', { p1: i18next.t(labelKey) }))
  }
}

const defaults: ItemMenuHandlers = {
  addToPlaylist: placeholderAction('add_to_playlist'),
  addToQueue: placeholderAction('add_to_queue'),
  playMusic: placeholderAction('play'),
  showMediaInfo: placeholderAction('media_information'),
  sendMediaInfoLog: placeholderAction('send_media_info_log_to_server'),
  chooseStream: placeholderAction('web_stream_choices'),
  clearTrackChoices: placeholderAction('clear_track_choices'),
}

let current: ItemMenuHandlers = { ...defaults }

/**
 * Installs real implementations (app-wide). Returns a function that puts back the previous value of only the
 * keys this call set, and only while they are still the ones it installed: restoring the whole earlier map
 * would also drop handlers other features installed in between (MusicHost unmounting on a user switch removed
 * the item dialogs' handlers).
 */
export function setItemMenuHandlers(partial: Partial<ItemMenuHandlers>): () => void {
  const previous = current
  current = { ...current, ...partial }
  return () => {
    const next: Record<string, unknown> = { ...current }
    for (const key of Object.keys(partial) as (keyof ItemMenuHandlers)[]) {
      if (current[key] === partial[key]) next[key] = previous[key]
    }
    current = next as ItemMenuHandlers
  }
}

export function getItemMenuHandlers(): ItemMenuHandlers {
  return current
}
