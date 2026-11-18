import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useSession } from '../../../api/session'
import { DialogPopup } from '../../../ui'
import type { StreamChoiceKind } from '../../common/itemMenuHandlers'
import { useTranslate } from '../../common/useTranslate'
import { useChosenStreams } from './detailQueries'
import { chooserTitle, chooseTrack, chooseVersion, trackEntries, versionEntries } from './streamChooser'

/** Version / audio / subtitle chooser for an item (the "Choose …" entries and the Version button). */
export function StreamChooserDialog({
  item,
  choice,
  onChosen,
  onClose,
  elevation = 3,
}: {
  item: BaseItemDto
  choice: StreamChoiceKind
  onChosen?: () => void
  onClose: () => void
  /** 3dp over a context menu (ContextMenu.kt); 1dp for the Version button's own dialog (PlayButtons.kt, DialogPopup default). */
  elevation?: 1 | 3
}) {
  const { t, locale } = useTranslate()
  const chosen = useChosenStreams(item)
  const preferredSub = useSession()?.userDto?.Configuration?.SubtitleLanguagePreference
  if (!chosen) return null
  const items =
    choice === 'version'
      ? versionEntries(t, item.MediaSources ?? [], chosen.source.Id, (s) => {
          chooseVersion(item, s)
          onChosen?.()
        }, locale)
      : trackEntries(t, choice, chosen, preferredSub, (index) => {
          chooseTrack(item, chosen, choice, index)
          onChosen?.()
        }, locale)
  return <DialogPopup open title={chooserTitle(t, choice)} items={items} onClose={onClose} elevation={elevation} />
}
