// App-wide item dialogs opened from any context menu (media information, add to playlist, choose
// version / audio / subtitles). "Clear track choices" and "Send media info log" are installed once by app/startup.
// `installItemDialogHandlers()` replaces the placeholders of src/features/common/itemMenuHandlers;
// `<ItemDialogsHost />` renders the open dialog.
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { create } from 'zustand'
import { setItemMenuHandlers, type StreamChoiceKind } from '../../common/itemMenuHandlers'
import { mediaInfoOf, type MediaInfo } from './mediaInfo'

export type OpenItemDialog =
  | { kind: 'mediaInfo'; info: MediaInfo; showFilePath?: boolean }
  | { kind: 'playlist'; item: BaseItemDto }
  | { kind: 'stream'; item: BaseItemDto; choice: StreamChoiceKind; onChosen?: () => void }

export const useItemDialogs = create<{ open: OpenItemDialog | null }>(() => ({ open: null }))

export function openItemDialog(d: OpenItemDialog) {
  useItemDialogs.setState({ open: d })
}

export function closeItemDialog() {
  useItemDialogs.setState({ open: null })
}

let installed = false

/** Installs the real handlers once (idempotent). */
export function installItemDialogHandlers() {
  if (installed) return
  installed = true
  setItemMenuHandlers({
    addToPlaylist: (item) => openItemDialog({ kind: 'playlist', item }),
    showMediaInfo: (item) => openItemDialog({ kind: 'mediaInfo', info: mediaInfoOf(item) }),
    chooseStream: (item, choice, onChosen) => openItemDialog({ kind: 'stream', item, choice, onChosen }),
  })
}
