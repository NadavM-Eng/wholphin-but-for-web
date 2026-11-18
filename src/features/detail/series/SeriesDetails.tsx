import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import clsx from 'clsx'
import { useEffect, useMemo, useRef } from 'react'
import { submitBackdrop } from '../../../app/backdrop'
import { useGoBack } from '../../../app/shell'
import { withCount } from '../../../i18n'
import { ErrorMessage } from '../../../ui'
import { CARD_HEIGHT } from '../../common/viewOptions'
import { useItemContextMenu } from '../../common/useItemContextMenu'
import { useTranslate } from '../../common/useTranslate'
import { ExtrasRow } from '../common/ExtrasRow'
import { PeopleRow } from '../common/PeopleRow'
import { PosterItemsRow } from '../common/PosterItemsRow'
import { useLocalTrailers, usePeopleFavorites, useSimilarItems, useSpecialFeatures } from '../common/detailQueries'
import { peopleOf } from '../common/detailText'
import { groupExtras } from '../common/extras'
import { openItemDialog } from '../common/itemDialogs'
import { mediaInfoOf } from '../common/mediaInfo'
import { useThemeSong } from '../common/themeMusic'
import { localTrailers, remoteTrailers } from '../common/trailers'
import { useCanDelete, useDeleteAndGoBack } from '../common/useDetailActions'
import pageStyles from '../common/DetailPage.module.css'
import { SeriesDetailButtons } from './SeriesDetailButtons'
import styles from './SeriesDetails.module.css'
import { SeriesDetailsHeader } from './SeriesDetailsHeader'
import { useSeasons } from './seriesQueries'
import { DetailDiscoverRow } from '../../discover/DetailDiscover'

/**
 * Upstream `SeriesDetails` (W/ui/detail/series/SeriesDetails.kt), the page a series opens to: header, the button
 * row, then Seasons (N) (always), People, Extras and More like this (each only when non-empty), in that order.
 * Season and similar cards are `SeasonCard`s 172dp tall with the overlay; a season opens the series overview at
 * that season. The Seerr "Discover" row (similar series) comes last.
 */
export function SeriesDetails({ item }: { item: BaseItemDto }) {
  const { t } = useTranslate()
  const id = item.Id ?? ''
  const goBack = useGoBack()
  const canDelete = useCanDelete(item)
  const deleteAndBack = useDeleteAndGoBack()
  const menu = useItemContextMenu()
  const seasonsQ = useSeasons(id)
  const local = useLocalTrailers(item)
  const extrasQ = useSpecialFeatures(id)
  const similarQ = useSimilarItems(id)
  const favorites = usePeopleFavorites(item)

  useEffect(() => submitBackdrop(item), [item])
  useThemeSong(id)

  // Upstream order on this page: local trailers first, then the remote ones (SeriesViewModel.kt:224-227).
  const trailers = useMemo(
    () => [...localTrailers(local.data ?? [], t('trailers', { count: 1 })), ...remoteTrailers(item, t('trailers', { count: 1 }))],
    [local.data, item, t],
  )
  const extras = useMemo(() => groupExtras(t, extrasQ.data ?? []), [extrasQ.data, t])
  const people = useMemo(() => peopleOf(item), [item])
  const seasons = seasonsQ.data

  // Deleting the last season or episode of the series goes back (SeriesViewModel.deleteItem on the details page).
  const hadSeasons = useRef(false)
  useEffect(() => {
    if (!seasons) return
    if (seasons.length > 0) hadSeasons.current = true
    else if (hadSeasons.current) goBack()
  }, [seasons, goBack])

  // A failed seasons request is a page error (SeriesViewModel.init: series = DataLoadingState.Error).
  if (seasonsQ.isError && !seasons) {
    const err = seasonsQ.error
    return (
      <div className={pageStyles.page}>
        <ErrorMessage title={t('compose_error_message_title')} detail={err instanceof Error ? err.message : String(err)} />
      </div>
    )
  }

  return (
    <div className={clsx(pageStyles.page, styles.page)}>
      <div className={pageStyles.headerBlock} data-focus-scroll-anchor>
        <SeriesDetailsHeader item={item} onOverview={() => openItemDialog({ kind: 'mediaInfo', info: mediaInfoOf(item) })} />
        <SeriesDetailButtons item={item} trailers={trailers} canDelete={canDelete} onConfirmDelete={() => void deleteAndBack(item)} />
      </div>
      <PosterItemsRow
        title={withCount(t('tv_seasons'), seasons?.length ?? 0)}
        items={seasons}
        height={CARD_HEIGHT.poster}
        menu={menu}
        menuOptions={{ showGoTo: true, showStreamChoices: false }}
        restoreKey={`series-seasons:${id}`}
      />
      <PeopleRow people={people} favorites={favorites.data} restoreKey={`detail-people:${id}`} />
      <ExtrasRow extras={extras} restoreKey={`detail-extras:${id}`} />
      <PosterItemsRow
        title={t('more_like_this')}
        items={similarQ.data}
        height={CARD_HEIGHT.poster}
        menu={menu}
        menuOptions={{ showGoTo: true, showStreamChoices: false }}
        restoreKey={`detail-similar:${id}`}
      />
      <DetailDiscoverRow item={item} restoreKey={`detail-discover:${id}`} />
      {menu.element}
    </div>
  )
}
