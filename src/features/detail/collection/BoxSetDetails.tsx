import clsx from 'clsx'
import type { BaseItemDto, BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { useApi, useSession } from '../../../api/session'
import { clearBackdrop, submitBackdrop } from '../../../app/backdrop'
import { itemDestination, useNav } from '../../../app/nav'
import { useDp } from '../../../theme/scale'
import { CardGrid, CircularProgress, ExpandableButton, FaIcon, GridCard, ItemRow, LoadingRow, MaterialIcon, PlayButtons } from '../../../ui'
import { gridCardProps, useCardContext } from '../../common/cardAdapters'
import { itemQueryMeta } from '../../common/itemCache'
import { SLIM_ITEM_FIELDS } from '../../common/itemFields'
import { isHoverPointer, useHoverIntent } from '../../common/hoverIntent'
import { useLinkClick } from '../../common/links'
import { useItemActions } from '../../common/useItemActions'
import { useItemContextMenu } from '../../common/useItemContextMenu'
import { useTranslate } from '../../common/useTranslate'
import { aspectValue, contentScaleFit, CARD_HEIGHT } from '../../common/viewOptions'
import { HomeCard } from '../../home/HomeCard'
import { HomeHeader } from '../../home/HomeHeader'
import { usePrefs } from '../../../stores/preferences'
import type { DisplayToggle } from '../../common/itemText'
import { cardWidthDp } from '../../home/homeCardLayout'
import { viewOptions as homeViewOptions, type HomeRowViewOptions } from '../../home/model/homeRowConfig'
import { DetailHeader } from '../common/DetailHeader'
import { ConfirmDialog } from '../../../ui'
import { detailKeys, usePagedItems } from '../common/detailQueries'
import { openItemDialog } from '../common/itemDialogs'
import { mediaInfoOf } from '../common/mediaInfo'
import { SortButton } from '../../browse/components/SortButton'
import { MOVIE_SORT_OPTIONS, sortedListDeps } from '../common/sortOptions'
import { useThemeSong } from '../common/themeMusic'
import { useCanDelete, useDeleteAndGoBack } from '../common/useDetailActions'
import pageStyles from '../common/DetailPage.module.css'
import styles from './BoxSetDetails.module.css'
import { FilterButton } from '../../browse/components/FilterButton'
import { getFilterValues } from '../../browse/data/filterValues'
import { applyFilter, DEFAULT_FILTER_OPTIONS } from '../../browse/model/filter'
import { ALL_BUT_BOXSET, TYPE_TITLE_KEY, TYPES_IN_COLLECTION, useCollectionFilter, useCollectionOptions, useCollectionSort } from './collectionOptions'
import { CollectionViewOptionsDialog } from './CollectionViewOptionsDialog'
import { mayTakeInitialFocus } from '../../../app/shell'

/** Row card options per type (CollectionRows.kt). */
function rowOptions(type: BaseItemKind, showTitles: boolean): HomeRowViewOptions {
  switch (type) {
    case 'Episode':
      return homeViewOptions({ heightDp: CARD_HEIGHT.episode, episodeAspectRatio: 'WIDE', showTitles, useSeries: false })
    case 'MusicArtist':
    case 'MusicAlbum':
    case 'Playlist':
    case 'Audio':
      return homeViewOptions({ heightDp: CARD_HEIGHT.episode, aspectRatio: 'SQUARE', showTitles })
    case 'Video':
    case 'MusicVideo':
      return homeViewOptions({ heightDp: CARD_HEIGHT.episode, aspectRatio: 'WIDE', showTitles })
    default:
      return homeViewOptions({ showTitles })
  }
}

/**
 * Upstream `CollectionDetails` (W/ui/detail/collection/*): header (logo/title, quick details, genres, tagline,
 * overview), buttons (Play, Shuffle, Favorite, Delete, View options, More | Sort), then the items: one row per
 * type ("separate types", the default) or one grid. The collection's theme song plays.
 */
export function BoxSetDetails({ item }: { item: BaseItemDto }) {
  const { t } = useTranslate()
  const go = useNav()
  const api = useApi()
  const userId = useSession()?.user.id
  const id = item.Id ?? ''
  const actions = useItemActions()
  const canDelete = useCanDelete(item)
  const deleteAndBack = useDeleteAndGoBack()
  const menu = useItemContextMenu()
  const options = useCollectionOptions()
  const [sort, setSort] = useCollectionSort(id)
  const [filter, setFilter] = useCollectionFilter(id)
  const qc = useQueryClient()
  const [dialog, setDialog] = useState<'view' | 'delete' | null>(null)
  const favorite = item.UserData?.IsFavorite ?? false

  useThemeSong(id)
  // Cleared on enter, then the collection's own backdrop (DestinationContent + updateBackdrop).
  useEffect(() => {
    clearBackdrop()
    submitBackdrop(item)
  }, [item])

  const base = { userId, parentId: id, recursive: false, fields: SLIM_ITEM_FIELDS, sortBy: [sort.sort], sortOrder: [sort.direction] }
  // `filter.applyTo(request, overwriteIncludeTypes = false)`: the row's own types are kept.
  const withFilter = <R extends { includeItemTypes?: BaseItemKind[] }>(req: R) => ({ ...req, ...applyFilter(filter, req.includeItemTypes) })

  const rows = useQueries({
    queries: TYPES_IN_COLLECTION.map((type) => ({
      queryKey: [...detailKeys.item(id), 'collectionRow', type, sort, filter],
      enabled: options.separateTypes,
      meta: itemQueryMeta(...sortedListDeps(sort.sort)),
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const req = withFilter(
          type === 'BoxSet' ? { ...base, includeItemTypes: undefined, excludeItemTypes: ALL_BUT_BOXSET } : { ...base, includeItemTypes: [type] },
        )
        return (await getLibraryApi(api).getItems(req, { signal })).data.Items ?? []
      },
    })),
  })

  const mixed = usePagedItems(
    [...detailKeys.item(id), 'collectionMixed'],
    options.separateTypes ? null : withFilter({ ...base, includeItemTypes: [...TYPES_IN_COLLECTION] }),
    100,
    sortedListDeps(sort.sort),
  )

  const showDetails = options.cardViewOptions.showDetails
  // State B of the header (CollectionDetails.kt:316-407): while keyboard focus is in the items, the collection
  // header and buttons give way to the focused item's HomePageHeader (or to nothing with Show details off).
  // Keyboard only: a mouse moving over the cards would make the page jump under the pointer.
  const [itemsFocus, setItemsFocus] = useState(false)
  const [focusedItem, setFocusedItem] = useState<BaseItemDto | null>(null)
  const buttonsRef = useRef<HTMLDivElement>(null)
  const returnToButtons = useRef(false)
  const toggles = usePrefs('displayToggles') as readonly DisplayToggle[]
  const showLogos = usePrefs('showLogos')
  // The button row takes focus on arrival (CollectionDetails.kt:356); never on touch, never stealing focus.
  useEffect(() => {
    if (matchMedia('(hover: none)').matches) return
    const id = requestAnimationFrame(() => {
      if (mayTakeInitialFocus()) buttonsRef.current?.querySelector<HTMLElement>('button, [tabindex="0"]')?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(id)
  }, [])
  useEffect(() => {
    if (itemsFocus || !returnToButtons.current) return
    returnToButtons.current = false
    buttonsRef.current?.querySelector<HTMLElement>('button, [tabindex="0"]')?.focus()
  }, [itemsFocus])

  // AnimatedContent(header_transition): the incoming header slides in (the item header from below, the
  // collection header from above) and fades in. Not on the page's first composition.
  const [swapped, setSwapped] = useState(false)

  // CollectionViewModel.updateBackdrop: the focused item's backdrop with Show details, else none.
  const onFocusItem = (it: BaseItemDto) => {
    setFocusedItem(it)
    if (showDetails) submitBackdrop(it)
    else clearBackdrop()
  }
  // A mouse resting on a card counts like focus after the shared hover-intent delay.
  const hover = useHoverIntent<string>()
  const onHoverItem = (e: PointerEvent<HTMLElement>, it: BaseItemDto, key: string) => {
    if (isHoverPointer(e)) hover.over(key, () => onFocusItem(it))
  }

  const itemsHandlers = {
    onFocus: (e: FocusEvent<HTMLDivElement>) => {
      if (!(e.target as HTMLElement).matches(':focus-visible')) return
      setItemsFocus(true)
      setSwapped(true)
    },
    onBlur: (e: FocusEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setItemsFocus(false)
    },
    // HiddenFocusBox: Up from the top of the items (focus did not move, or only reached the shell's floating Back
    // button, which the TV does not have) brings the collection header back.
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'ArrowUp' || !itemsFocus) return
      const before = document.activeElement
      requestAnimationFrame(() => {
        const now = document.activeElement
        if (now !== before && !now?.closest('[data-focus-vertical-only]')) return
        returnToButtons.current = true
        setItemsFocus(false)
        // onChangeBackdrop(collection), as on entering the page.
        clearBackdrop()
        submitBackdrop(item)
        // Focus already left the items (to the Back button): itemsFocus is false and the effect above won't re-run.
        requestAnimationFrame(() => {
          if (!returnToButtons.current) return
          returnToButtons.current = false
          buttonsRef.current?.querySelector<HTMLElement>('button, [tabindex="0"]')?.focus()
        })
      })
    },
  }

  return (
    <div className={clsx(pageStyles.page, styles.page)}>
      {itemsFocus && showDetails && (
        <div className={clsx(styles.focusedHeader, styles.enterFromBelow)}>
          <HomeHeader item={focusedItem} showLogo={showLogos} toggles={toggles} />
        </div>
      )}
      <div className={clsx(pageStyles.headerBlock, itemsFocus && styles.away, swapped && styles.enterFromAbove)} hidden={itemsFocus} data-focus-scroll-anchor>
        <DetailHeader item={item} variant="collection" className={styles.header} onOverview={() => openItemDialog({ kind: 'mediaInfo', info: mediaInfoOf(item) })} />
        <div className={styles.buttons} data-focus-key="collection-buttons" ref={buttonsRef}>
          <PlayButtons label={t('play')} className={styles.group}>
            <ExpandableButton
              icon={<MaterialIcon name="play_arrow" size={28} />}
              label={t('play')}
              labelOnTouch
              onClick={() => go.playList(id, { index: 0, recursive: true, sort: sort.sort, order: sort.direction === 'Ascending' ? 'asc' : 'desc' })}
            />
            <ExpandableButton
              icon={<FaIcon name="shuffle" />}
              iconKind="fa"
              label={t('shuffle')}
              onClick={() => go.playList(id, { index: 0, recursive: true, shuffle: true })}
            />
            <ExpandableButton
              icon={<FaIcon name="heart" />}
              iconKind="fa"
              iconColor={favorite ? 'var(--fx-favorite-active)' : undefined}
              label={favorite ? t('remove_favorite') : t('add_favorite')}
              onClick={() => void actions.setFavorite(item, !favorite)}
            />
            {canDelete && <ExpandableButton icon={<MaterialIcon name="delete" size={24} />} label={t('delete')} destructive onClick={() => setDialog('delete')} />}
            <ExpandableButton icon={<FaIcon name="sliders" />} iconKind="fa" label={t('view_options')} onClick={() => setDialog('view')} />
            <ExpandableButton
              icon={<MaterialIcon name="more_vert" size={28} />}
              label={t('more')}
              onClick={() => menu.open(item, null, { showGoTo: false, showStreamChoices: false, onDelete: (i) => void deleteAndBack(i) })}
            />
          </PlayButtons>
          <div className={styles.end}>
            <SortButton options={MOVIE_SORT_OPTIONS} current={sort} onChange={setSort} />
            {/* FilterByButton(DefaultFilterOptions); values from the collection (FilterOptionCache(itemId)). */}
            <FilterButton
              options={DEFAULT_FILTER_OPTIONS}
              current={filter}
              onChange={setFilter}
              getValues={(def) => (userId ? getFilterValues(api, qc, userId, id, def.kind) : Promise.resolve([]))}
            />
          </div>
        </div>
      </div>
      <div className={styles.items} {...itemsHandlers} onPointerLeave={() => hover.leave()}>
        {options.separateTypes ? (
          <SeparateRows
            rows={rows.map((r, i) => ({ type: TYPES_IN_COLLECTION[i], q: r }))}
            showTitles={options.cardViewOptions.showTitles}
            menu={menu}
            collectionId={id}
            onFocusItem={onFocusItem}
            onHoverItem={onHoverItem}
          />
        ) : (
          <MixedGrid paged={mixed} collectionId={id} menu={menu} onFocusItem={onFocusItem} onHoverItem={onHoverItem} />
        )}
      </div>
      {dialog === 'view' && <CollectionViewOptionsDialog onClose={() => setDialog(null)} onShowDetailsOff={() => submitBackdrop(item)} />}
      {dialog === 'delete' && (
        <ConfirmDialog
          open
          variant="delete"
          title={t('delete_item')}
          body={item.Name}
          cancelLabel={t('cancel')}
          confirmLabel={t('confirm')}
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null)
            void deleteAndBack(item)
          }}
        />
      )}
      {menu.element}
    </div>
  )
}

type HoverItem = (e: PointerEvent<HTMLElement>, it: BaseItemDto, key: string) => void

type RowQ = { type: BaseItemKind; q: { data?: BaseItemDto[]; isError: boolean; error: unknown; isPending: boolean } }

function SeparateRows({
  rows,
  showTitles,
  menu,
  collectionId,
  onFocusItem,
  onHoverItem,
}: {
  rows: RowQ[]
  showTitles: boolean
  menu: ReturnType<typeof useItemContextMenu>
  collectionId: string
  onFocusItem: (it: BaseItemDto) => void
  onHoverItem: HoverItem
}) {
  const { t } = useTranslate()
  const ctx = useCardContext()
  const linkClick = useLinkClick()
  // Header stays mounted while rows load (upstream replaces the whole page with a spinner, spec 08 BR-7).
  if (rows.every((r) => r.q.isPending)) {
    return (
      <div className={styles.loading}>
        <CircularProgress size={48} label={t('loading')} />
      </div>
    )
  }
  return (
    <div className={styles.rows}>
      {rows.map(({ type, q }) => {
        const title = t(TYPE_TITLE_KEY[type] ?? 'unknown')
        if (q.isError) return <LoadingRow key={type} title={title} message={q.error instanceof Error ? q.error.message : String(q.error)} error />
        const items = q.data ?? []
        if (items.length === 0) return null
        const o = rowOptions(type, showTitles)
        return (
          <ItemRow
            key={type}
            title={title}
            count={items.length}
            gap={o.spacing}
            itemWidth={(i) => cardWidthDp(items[i], o)}
            restoreKey={`collection-row:${collectionId}:${type}`}
            previousLabel={t('web_previous')}
            nextLabel={t('web_next')}
            getItemKey={(i) => `${items[i].Id}:${i}`}
            renderItem={(i) => {
              const it = items[i]
              const href = itemDestination(it)
              return (
                <div onFocus={() => onFocusItem(it)} onPointerEnter={(e) => onHoverItem(e, it, `${type}:${i}`)}>
                  <HomeCard item={it} pos={`${type}:${i}`} viewOptions={o} ctx={ctx} href={href} onClick={linkClick(href)} menu={menu.cardActions(it, { showGoTo: true })} tabStop />
                </div>
              )
            }}
          />
        )
      })}
    </div>
  )
}

function MixedGrid({
  paged,
  collectionId,
  menu,
  onFocusItem,
  onHoverItem,
}: {
  paged: ReturnType<typeof usePagedItems>
  collectionId: string
  menu: ReturnType<typeof useItemContextMenu>
  onFocusItem: (it: BaseItemDto) => void
  onHoverItem: HoverItem
}) {
  const { t } = useTranslate()
  const ctx = useCardContext()
  const linkClick = useLinkClick()
  const dp = useDp()
  const o = useCollectionOptions().cardViewOptions
  const aspect = aspectValue(o.aspectRatio)
  const estimate = useMemo(() => (w: number) => w / Math.max(aspect, 2 / 3) + (o.showTitles ? dp(48) : 0), [aspect, o.showTitles, dp])
  if (paged.total == null) {
    return (
      <div className={styles.loading}>
        <CircularProgress size={48} label={t('loading')} />
      </div>
    )
  }
  return (
    <CardGrid
      count={paged.total}
      columns={{ kind: 'fixed', columns: o.columns }}
      gap={o.spacing}
      estimateRowHeight={estimate}
      restoreKey={`collection-grid:${collectionId}`}
      empty={<p className={styles.empty}>{t('no_results')}</p>}
      renderItem={(i, w) => {
        const it = paged.get(i)
        if (!it) return <GridCard title=" " aspectRatio={aspect} showTitle={o.showTitles} label="" />
        const p = gridCardProps(it, ctx, { widthCss: w, aspectRatio: aspect, fit: contentScaleFit(o.contentScale), imageType: o.imageType, useSeries: true, showTitle: o.showTitles })
        return (
          <div onFocus={() => onFocusItem(it)} onPointerEnter={(e) => onHoverItem(e, it, `grid:${i}`)} data-focus-key={`collection-grid:${i}`}>
            <GridCard {...p} onClick={linkClick(p.href)} {...menu.cardActions(it, { showGoTo: true })} />
          </div>
        )
      }}
    />
  )
}
