import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useEffect } from 'react'
import { clearBackdrop, submitBackdrop } from '../../../app/backdrop'
import { useNav } from '../../../app/nav'
import { useItemContextMenu } from '../../common/useItemContextMenu'
import { DetailHeader } from '../common/DetailHeader'
import { DetailPlayButtons } from '../common/DetailPlayButtons'
import { useChosenStreams } from '../common/detailQueries'
import { openItemDialog } from '../common/itemDialogs'
import { mediaInfoOf } from '../common/mediaInfo'
import { hasSavedChoices } from '../common/streams'
import { useThemeSong } from '../common/themeMusic'
import { useCanDelete, useDeleteAndGoBack } from '../common/useDetailActions'
import styles from '../common/DetailPage.module.css'

/**
 * Upstream `EpisodeDetails` (W/ui/detail/episode/EpisodeDetails.kt): only reached for an episode without
 * season or series ids (normal episode links go to the series overview). Header and play buttons, no trailer
 * button, no rows; the series theme song plays. "Go to series" is in the More menu.
 */
export function EpisodeDetails({ item }: { item: BaseItemDto }) {
  const go = useNav()
  const id = item.Id ?? ''
  const chosen = useChosenStreams(item)
  const canDelete = useCanDelete(item)
  const deleteAndBack = useDeleteAndGoBack()
  const menu = useItemContextMenu()

  // BackdropService.submit(episode): the series backdrop (resolved by the shell's image rules). The item is a
  // full DTO (GET /Items/{id}), which names the nearest ancestor that has a backdrop: without one, and without a
  // backdrop of its own, the series has none (a Live TV recording). Upstream still asks for it
  // (ImageUrlService.kt:67-73, Coil swallows the 404); here nothing is requested.
  useEffect(() => {
    if (item.ParentBackdropItemId || (item.BackdropImageTags?.length ?? 0) > 0) submitBackdrop(item)
    else clearBackdrop()
  }, [item])
  useThemeSong(item.SeriesId ?? null)

  return (
    <div className={styles.page}>
      <div className={styles.headerBlock} data-focus-scroll-anchor>
        <DetailHeader item={item} variant="episode" chosen={chosen} onOverview={() => openItemDialog({ kind: 'mediaInfo', info: mediaInfoOf(item) })} />
        <DetailPlayButtons
          item={item}
          initialFocus
          onPlay={(ms) => go.play(id, { t: ms })}
          trailers={null}
          canDelete={canDelete}
          onConfirmDelete={() => void deleteAndBack(item)}
          navigate={(p) => go.to(p)}
          onMore={() =>
            menu.open(item, null, {
              showGoTo: false,
              showStreamChoices: true,
              chosenSourceId: chosen?.source.Id,
              canClearChosenStreams: hasSavedChoices(chosen),
              onDelete: (i) => void deleteAndBack(i),
            })
          }
        />
      </div>
      {menu.element}
    </div>
  )
}
