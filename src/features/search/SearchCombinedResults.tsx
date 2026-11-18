import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import type { KeyboardEvent, MouseEvent } from 'react'
import type { Translate } from '../../lib/format'
import { useDp } from '../../theme/scale'
import { CardGrid, GridCard } from '../../ui'
import { gridCardProps, type CardContext } from '../common/cardAdapters'
import type { ItemContextMenu } from '../common/useItemContextMenu'
import { CombinedPlaceholder } from './CombinedPlaceholder'
import styles from './SearchPage.module.css'
import { useGridColumns } from './useGridColumns'
import type { SearchResult } from './useSearchResults'

/** Combined mode, Library tab: one "Results" grid of `GridCard`s (`SearchCombinedResults`, SearchPage.kt:539). */
export function SearchCombinedResults({
  result,
  t,
  ctx,
  menu,
  restoreKey,
  getScrollElement,
  hrefFor,
  onClickItem,
}: {
  t: Translate
  restoreKey: string
  getScrollElement: () => HTMLElement | null
  result: SearchResult<BaseItemDto>
  ctx: CardContext
  menu: ItemContextMenu
  hrefFor: (item: BaseItemDto) => string
  onClickItem: (item: BaseItemDto) => (e: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void
}) {
  const columns = useGridColumns()
  const dp = useDp()
  if (result.status !== 'success' || result.items.length === 0) return <CombinedPlaceholder t={t} result={result} />
  const items = result.items
  return (
    <section className={styles.combined} aria-label={t('results')}>
      <h2 className={styles.gridTitle}>{t('results')}</h2>
      <CardGrid
        count={items.length}
        columns={columns}
        gap={16}
        restoreKey={restoreKey}
        getScrollElement={getScrollElement}
        getItemKey={(i) => `${items[i]?.Id}:${i}`}
        estimateRowHeight={(w) => (w * 3) / 2 + dp(52)}
        renderItem={(i, widthPx) => {
          const item = items[i]
          const { href: _h, ...card } = gridCardProps(item, ctx, { widthCss: widthPx, useSeries: false })
          return (
            <GridCard
              {...card}
              href={hrefFor(item)}
              onClick={onClickItem(item)}
              surfaceProps={{ 'data-focus-key': `search:combined:${item.Id}`, 'data-search-item': item.Id ?? '' }}
              {...menu.cardActions(item)}
            />
          )
        }}
      />
    </section>
  )
}
