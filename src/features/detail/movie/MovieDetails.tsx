import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useEffect, useMemo } from 'react'
import { submitBackdrop } from '../../../app/backdrop'
import { useNav } from '../../../app/nav'
import { CARD_HEIGHT } from '../../common/viewOptions'
import { useItemContextMenu } from '../../common/useItemContextMenu'
import { useTranslate } from '../../common/useTranslate'
import { DetailHeader } from '../common/DetailHeader'
import { DetailPlayButtons } from '../common/DetailPlayButtons'
import { ChaptersRow } from '../common/ChaptersRow'
import { ExtrasRow } from '../common/ExtrasRow'
import { PeopleRow } from '../common/PeopleRow'
import { PosterItemsRow } from '../common/PosterItemsRow'
import { useChosenStreams, useLocalTrailers, usePeopleFavorites, useSimilarItems, useSpecialFeatures } from '../common/detailQueries'
import { peopleOf } from '../common/detailText'
import { groupExtras } from '../common/extras'
import { openItemDialog } from '../common/itemDialogs'
import { mediaInfoOf } from '../common/mediaInfo'
import { hasSavedChoices } from '../common/streams'
import { localTrailers, remoteTrailers } from '../common/trailers'
import { useThemeSong } from '../common/themeMusic'
import { useCanDelete, useDeleteAndGoBack } from '../common/useDetailActions'
import styles from '../common/DetailPage.module.css'
import { DetailDiscoverRow } from '../../discover/DetailDiscover'

/**
 * Upstream `MovieDetails` (W/ui/detail/movie/MovieDetails.kt), also used for Video and MusicVideo: header,
 * play buttons, then People, Chapters, Extras, More like this and the Seerr "Discover" row (each only when non-empty).
 */
export function MovieDetails({ item }: { item: BaseItemDto }) {
  const { t } = useTranslate()
  const go = useNav()
  const id = item.Id ?? ''
  const chosen = useChosenStreams(item)
  const canDelete = useCanDelete(item)
  const deleteAndBack = useDeleteAndGoBack()
  const menu = useItemContextMenu()
  const local = useLocalTrailers(item)
  const extrasQ = useSpecialFeatures(id)
  const similarQ = useSimilarItems(id)
  const favorites = usePeopleFavorites(item)

  useEffect(() => submitBackdrop(item), [item])
  useThemeSong(id)

  const trailers = useMemo(
    () => [...localTrailers(local.data ?? [], t('trailers', { count: 1 })), ...remoteTrailers(item, t('trailers', { count: 1 }))],
    [local.data, item, t],
  )
  const extras = useMemo(() => groupExtras(t, extrasQ.data ?? []), [extrasQ.data, t])
  const people = useMemo(() => peopleOf(item), [item])

  const play = (ms: number) => go.play(id, { t: ms })

  return (
    <div className={styles.page}>
      <div className={styles.headerBlock} data-focus-scroll-anchor>
        <DetailHeader item={item} variant="movie" chosen={chosen} onOverview={() => openItemDialog({ kind: 'mediaInfo', info: mediaInfoOf(item) })} />
        <DetailPlayButtons
          item={item}
          initialFocus
          onPlay={play}
          trailers={trailers}
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
      <PeopleRow people={people} favorites={favorites.data} restoreKey={`detail-people:${id}`} />
      <ChaptersRow itemId={id} chapters={item.Chapters ?? []} onPlay={play} restoreKey={`detail-chapters:${id}`} />
      <ExtrasRow extras={extras} restoreKey={`detail-extras:${id}`} />
      <PosterItemsRow
        title={t('more_like_this')}
        items={similarQ.data}
        height={item.Type === 'Movie' ? CARD_HEIGHT.poster : CARD_HEIGHT.episode}
        menu={menu}
        menuOptions={{ showGoTo: true }}
        restoreKey={`detail-similar:${id}`}
      />
      <DetailDiscoverRow item={item} restoreKey={`detail-discover:${id}`} />
      {menu.element}
    </div>
  )
}
