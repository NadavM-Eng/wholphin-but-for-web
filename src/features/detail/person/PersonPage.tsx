import type { BaseItemDto, BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { getItemImageUrl } from '../../../api/images'
import { clearBackdrop } from '../../../app/backdrop'
import { useSessionStore } from '../../../stores/session'
import { ExpandableButton, FaIcon, LoadingRow, OverviewText } from '../../../ui'
import { ITEM_ROW_FIELDS } from '../../common/itemFields'
import { useItemActions } from '../../common/useItemActions'
import { useTranslate } from '../../common/useTranslate'
import { CARD_HEIGHT } from '../../common/viewOptions'
import { PosterItemsRow } from '../common/PosterItemsRow'
import { detailKeys, usePagedItems } from '../common/detailQueries'
import { personDates } from '../common/detailText'
import { MediaInfoDialog } from '../common/MediaInfoDialog'
import { useMinuteClock } from '../common/useMinuteClock'
import styles from './PersonPage.module.css'
import { mayTakeInitialFocus } from '../../../app/shell'
import { DetailDiscoverRow } from '../../discover/DetailDiscover'

/** Pager page size of the filmography rows (PersonViewModel.fetchRow). */
const PAGE_SIZE = 15

function FilmographyRow({ personId, kind, titleKey, enabled }: { personId: string; kind: BaseItemKind; titleKey: string; enabled: boolean }) {
  const { t } = useTranslate()
  const paged = usePagedItems(
    [...detailKeys.item(personId), 'filmography', kind],
    enabled
      ? {
          personIds: [personId],
          includeItemTypes: [kind],
          fields: ITEM_ROW_FIELDS,
          recursive: true,
          sortBy: ['PremiereDate', 'ProductionYear', 'SortName'],
          sortOrder: ['Descending', 'Descending', 'Ascending'],
        }
      : null,
    PAGE_SIZE,
    // Membership only: watched / favorite marks are patched into the loaded pages in place.
    ['deleted'],
  )
  // Upstream keeps the row's LazyColumn item even when the row shows nothing (LoadingRow(showIfEmpty = false)),
  // and the column's 16dp spacing still applies around the empty item: the placeholder keeps that rhythm.
  if (!enabled) return <div aria-hidden="true" />
  const base = t(titleKey)
  if (paged.isError && paged.total == null) {
    return <LoadingRow title={base} message={paged.error instanceof Error ? paged.error.message : String(paged.error)} error />
  }
  if (paged.total == null) return <LoadingRow title={base} message={t('loading')} />
  if (paged.total === 0) return <div aria-hidden="true" />
  const episode = kind === 'Episode'
  return (
    <PosterItemsRow
      title={`${base} (${paged.total})`}
      count={paged.total}
      getItem={paged.get}
      height={episode ? CARD_HEIGHT.episode : CARD_HEIGHT.poster}
      // Episodes: item aspect or 4:3; movies/series: the item's own aspect (SeasonCard default).
      aspectRatio={episode ? (it) => (it.PrimaryImageAspectRatio && it.PrimaryImageAspectRatio > 0 ? it.PrimaryImageAspectRatio : 4 / 3) : undefined}
      // SeasonCard's default `showImageOverlay = false`; long-press has no action on this page.
      showOverlay={false}
      gap={episode ? 24 : undefined}
      restoreKey={`person-${kind}:${personId}`}
    />
  )
}

/**
 * Upstream `PersonPage` (W/ui/detail/PersonPage.kt): photo, an info panel (name, born / birthplace / died,
 * overview opening a dialog, favorite button), then Movies (N), TV Shows (N) and Episodes (N) rows, each only
 * when the person's count for it is > 0. No backdrop. Then the Seerr "Discover" row (the person's credits).
 */
export function PersonPage({ item }: { item: BaseItemDto }) {
  const { t, locale } = useTranslate()
  const actions = useItemActions()
  const baseUrl = useSessionStore((s) => s.current?.api.basePath ?? null)
  const [showOverview, setShowOverview] = useState(false)
  const id = item.Id ?? ''
  const name = item.Name ?? id
  const favorite = item.UserData?.IsFavorite ?? false
  const now = useMinuteClock()
  const dates = useMemo(() => personDates(t, item, new Date(now), locale), [t, item, now, locale])
  const birthplace = item.ProductionLocations?.[0]
  const image = item.ImageTags?.Primary ? getItemImageUrl(baseUrl, item, 'Primary', { fillHeight: 960 }) : null

  useEffect(() => clearBackdrop(), [])

  // The header takes focus on arrival (PersonPage.kt headerFocusRequester); never on touch, never stealing focus.
  const infoRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (matchMedia('(hover: none)').matches) return
    const raf = requestAnimationFrame(() => {
      if (mayTakeInitialFocus()) infoRef.current?.querySelector<HTMLElement>('[data-focusable]')?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  // RoundedCornerShape(10) on the panel: a circular corner of 10% of its shorter side, which CSS cannot express
  // for a box of unknown height (a percent radius is elliptical), so it follows the measured box.
  useEffect(() => {
    const el = infoRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const apply = () => el.style.setProperty('--info-radius', `${Math.min(el.offsetWidth, el.offsetHeight) * 0.1}px`)
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // The photo's aspect ratio (width / height) for its circular 10% corners, see PersonPage.module.css.
  const [photoAspect, setPhotoAspect] = useState<number | null>(null)

  return (
    <div className={styles.page}>
      <div
        className={styles.header}
        data-focus-scroll-anchor
        onFocus={(e) => {
          // PersonPage.kt brings the header into view from LaunchedEffect(focused), focused = overview OR button:
          // it runs when focus enters the header, not when it moves from the overview to the button, which then
          // gets the plain pivot (refshot 16-person-page-2: Favorite at 162dp, the name cut off). The attribute is
          // read synchronously by bringIntoView right after this focus event.
          const from = e.relatedTarget
          e.currentTarget.toggleAttribute('data-focus-scroll-anchor', !(from instanceof Node && e.currentTarget.contains(from)))
        }}
      >
        {/* Upstream AsyncImage(model = null) draws nothing: the space stays empty. */}
        <div className={styles.photoBox}>
          {image && (
            <img
              className={styles.photo}
              src={image}
              alt={name}
              style={photoAspect ? ({ '--ar': photoAspect } as CSSProperties) : undefined}
              onLoad={(e) => {
                const { naturalWidth: w, naturalHeight: h } = e.currentTarget
                if (w > 0 && h > 0) setPhotoAspect(w / h)
              }}
            />
          )}
        </div>
        <div className={styles.infoCell}>
          <div className={styles.info} ref={infoRef}>
            <h1 className={styles.name} dir="auto">
              {name}
            </h1>
            {dates.born && <p className={styles.line}>{dates.born}</p>}
            {birthplace && birthplace.trim() !== '' && (
              <p className={styles.line} dir="auto">{`${t('birthplace')}: ${birthplace}`}</p>
            )}
            {dates.died && <p className={styles.line}>{dates.died}</p>}
            <OverviewText text={item.Overview ?? ''} maxLines={3} onClick={() => setShowOverview(true)} label={t('media_information')} className={styles.overview} dir="auto" />
            <div className={styles.favorite}>
              <ExpandableButton
                icon={<FaIcon name="heart" />}
                iconKind="fa"
                iconColor={favorite ? 'var(--fx-favorite-active)' : undefined}
                label={favorite ? t('remove_favorite') : t('add_favorite')}
                labelOnTouch
                onClick={() => void actions.setFavorite(item, !favorite)}
              />
            </div>
          </div>
        </div>
      </div>
      <FilmographyRow personId={id} kind="Movie" titleKey="movies_title" enabled={(item.MovieCount ?? 0) > 0} />
      <FilmographyRow personId={id} kind="Series" titleKey="tv_shows_title" enabled={(item.SeriesCount ?? 0) > 0} />
      <FilmographyRow personId={id} kind="Episode" titleKey="episodes" enabled={(item.EpisodeCount ?? 0) > 0} />
      <DetailDiscoverRow item={item} restoreKey={`person-discover:${id}`} />
      {showOverview && (
        <MediaInfoDialog info={{ title: name, overview: item.Overview, genres: [], files: [] }} showFilePath={false} onClose={() => setShowOverview(false)} />
      )}
    </div>
  )
}
