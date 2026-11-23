import type { BaseItemDto, BaseItemKind, CollectionType } from '@jellyfin/sdk/lib/generated-client/models'
import { getGenreApi } from '@jellyfin/sdk/lib/utils/api/genre-api'
import { getStudioApi } from '@jellyfin/sdk/lib/utils/api/studio-api'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation } from 'react-router'
import { qk } from '../../../api/queryKeys'
import { useApi, useSession } from '../../../api/session'
import { nav } from '../../../app/nav'
import { mayTakeInitialFocus } from '../../../app/shell'
import { imagePx } from '../../../api/images'
import { dp as dpNow, useDp } from '../../../theme/scale'
import { AlphabetPicker, CardGrid, ErrorMessage, GenreCard, LoadingPage, StudioCard, letterForSortName, observeResize, type CardGridHandle } from '../../../ui'
import { useCardContext } from '../../common/cardAdapters'
import { fetchGenreImages } from '../../common/genreImages'
import { SLIM_ITEM_FIELDS } from '../../common/itemFields'
import { useLinkClick } from '../../common/links'
import { useTranslate } from '../../common/useTranslate'
import { gridContentWidthPx, webColumns } from '../model/gridColumns'
import { enterLetterColumn, leaveLetterColumn } from './letterFocus'
import styles from './LibraryGrid.module.css'

const COLUMNS = 4

/** fillWidth of genre art: (screen width - (2 x 16 + 3 x 16)) / 4 dp, as upstream (approximate on purpose). */
function genreImageWidthPx(): number | null {
  return imagePx((window.innerWidth / dpNow(1) - 80) / 4, 'dp')
}
const SPACING = 16

type Props = {
  kind: 'Genre' | 'Studio'
  /** The library. */
  parent: BaseItemDto
  includeItemTypes: BaseItemKind[] | null
  collectionType: CollectionType | null
}

/**
 * `GenreCardGrid` / `StudioCardGrid` (W/ui/components/GenreCardGrid.kt, StudioCardGrid.kt): every genre
 * (or studio) of the library as 16:9 tiles, 4 columns, spacing 16, letter column always on. Genre art is a
 * random item's backdrop per genre (max 4 requests at a time, cached 2 h); studios use their Thumb.
 * A click opens the library filtered to that genre / studio.
 */
export function TileGrid({ kind, parent, includeItemTypes, collectionType }: Props) {
  const { t } = useTranslate()
  const api = useApi()
  const session = useSession()
  const userId = session?.user.id ?? ''
  const parentId = parent.Id ?? ''
  const ctx = useCardContext()
  const linkClick = useLinkClick()
  const location = useLocation()
  const dp = useDp()
  const grid = useRef<CardGridHandle>(null)

  const list = useQuery({
    queryKey: qk('browse', kind, parentId, includeItemTypes),
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => {
      const req = { userId, parentId, fields: SLIM_ITEM_FIELDS, includeItemTypes: includeItemTypes ?? undefined }
      const res = kind === 'Genre' ? await getGenreApi(api).getGenres(req, { signal }) : await getStudioApi(api).getStudios(req, { signal })
      return res.data.Items ?? []
    },
  })
  const items = list.data ?? []

  // Genre art fills in after the tiles appear (GenreViewModel.init).
  const images = useQuery({
    queryKey: qk('browse', 'genreImages', parentId, includeItemTypes),
    enabled: kind === 'Genre' && items.length > 0,
    staleTime: 2 * 60 * 60_000,
    queryFn: ({ signal }) =>
      fetchGenreImages(
        api,
        { userId, parentId, genreIds: items.map((g) => g.Id ?? ''), includeItemTypes, cardWidthPx: genreImageWidthPx(), useCache: true },
        signal,
      ),
  })

  const scroller = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    setWidth(gridContentWidthPx(el))
    return observeResize(el, () => setWidth(gridContentWidthPx(el)))
  }, [list.isSuccess])
  const columns = webColumns(width / dp(1), COLUMNS, SPACING)

  const [position, setPosition] = useState(-1)
  useEffect(() => {
    // focus goes to the first card on load (GenreCardGrid LaunchedEffect)
    if (!list.isSuccess || items.length === 0 || matchMedia('(hover: none)').matches) return
    requestAnimationFrame(() => {
      if (!mayTakeInitialFocus()) return
      scroller.current?.querySelector<HTMLElement>('[data-grid-index="0"] [data-focusable]')?.focus({ preventScroll: true })
    })
    // once per load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.isSuccess])

  const jumpToLetter = useCallback(
    async (letter: string) => {
      const req = { userId: kind === 'Studio' ? userId : undefined, parentId, nameLessThan: letter, limit: 0, enableTotalRecordCount: true, includeItemTypes: includeItemTypes ?? undefined }
      const res = kind === 'Genre' ? await getGenreApi(api).getGenres(req) : await getStudioApi(api).getStudios(req)
      const index = res.data.TotalRecordCount ?? -1
      if (index >= 0 && items.length > 0) {
        const i = Math.min(index, items.length - 1)
        setPosition(i)
        grid.current?.scrollToIndex(i)
      }
    },
    [api, kind, userId, parentId, includeItemTypes, items.length],
  )

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-grid-index]')
    if (!cell || e.defaultPrevented) return
    const index = Number(cell.dataset.gridIndex)
    if (columns > 0 && enterLetterColumn(e, index % columns === columns - 1 || index === items.length - 1)) return
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !/^[a-z]$/i.test(e.key)) return
    e.preventDefault()
    void jumpToLetter(e.key.toUpperCase())
  }

  if (list.isError) return <ErrorMessage title={t('compose_error_message_title')} detail={list.error instanceof Error ? list.error.message : String(list.error)} />
  if (!list.data) return <LoadingPage />

  // upstream's focused index starts at 0: footer and letter follow the first tile until something is focused
  const current = items[Math.max(position, 0)]
  // createGenreDestination / createStudioDestination (W/data/model/BaseItem.kt:380-435); studio pages use UNKNOWN
  const hrefOf = (it: BaseItemDto) =>
    nav.filtered(parentId, {
      parentType: kind,
      filterId: it.Id ?? '',
      collectionType: kind === 'Studio' ? null : collectionType,
      recursive: true,
      includeItemTypes,
    })

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        {items.length === 0 ? (
          <div className={styles.empty}>{t('no_results')}</div>
        ) : (
          <div className={styles.bodyRow}>
            <div className={styles.gridBox}>
              <div
                ref={scroller}
                className={clsx(styles.scroller, styles.scrollerTiles)}
                data-grid-scroller
                onKeyDown={onKeyDown}
                onFocus={(e) => {
                  const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-grid-index]')
                  if (cell) setPosition(Number(cell.dataset.gridIndex))
                }}
                data-focus-group
                data-focus-enter="last"
              >
                <CardGrid
                  ref={grid}
                  count={items.length}
                  columns={{ kind: 'fixed', columns }}
                  gap={SPACING}
                  getScrollElement={() => scroller.current}
                  restoreKey={`${location.key}:${kind}:${parentId}`}
                  estimateRowHeight={(w) => (w * 9) / 16}
                  renderItem={(i) => {
                    const it = items[i]
                    const href = hrefOf(it)
                    const common = { id: it.Id, name: it.Name, href, onClick: linkClick(href), surfaceProps: { 'data-focus-key': `${kind}:${i}` } }
                    return kind === 'Genre' ? (
                      <GenreCard {...common} imageSrc={images.data?.[it.Id ?? ''] ?? null} />
                    ) : (
                      <StudioCard {...common} imageSrc={it.ImageTags?.Thumb ? ctx.image(it, 'Thumb', { widthDp: 220 }) : null} />
                    )
                  }}
                />
              </div>
              <div className={styles.footer} dir="ltr">
                {Math.max(position, 0) + 1} / {items.length}
              </div>
            </div>
            <div className={styles.letters} onKeyDown={leaveLetterColumn}>
              <AlphabetPicker current={letterForSortName(current?.SortName ?? current?.Name)} onSelect={(l) => void jumpToLetter(l)} label={t('web_jump_to_letter')} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
