import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useCallback, useMemo, type KeyboardEvent, type MouseEvent } from 'react'
import type { Translate } from '../../lib/format'
import { ItemRow, LoadingRow } from '../../ui'
import type { CardContext } from '../common/cardAdapters'
import type { ItemContextMenu } from '../common/useItemContextMenu'
import { SearchPageCard } from './SearchPageCard'
import { searchCardWidthDp, type SearchCardKind } from './searchTypes'
import type { SearchResult } from './useSearchResults'

type Props = {
  rowKey: string
  title: string
  result: SearchResult<BaseItemDto>
  kind: SearchCardKind
  t: Translate
  ctx: CardContext
  menu: ItemContextMenu
  restoreKey: string
  hrefFor: (item: BaseItemDto) => string
  onClickItem: (item: BaseItemDto) => (e: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void
}

/**
 * One category of results (`SearchRowResult`, W/ui/search/SearchPage.kt:672): "Searching…" placeholder,
 * red error text, nothing when empty, else a titled card row.
 */
export function SearchRowResult({ rowKey, title, result, kind, t, ctx, menu, restoreKey, hrefFor, onClickItem }: Props) {
  const width = searchCardWidthDp(kind)
  const items = useMemo(() => (result.status === 'success' ? result.items : []), [result])
  const key = useCallback((i: number) => `${items[i]?.Id}:${i}`, [items])
  if (result.status === 'searching') return <LoadingRow title={title} message={t('searching')} />
  if (result.status === 'error') return <LoadingRow title={title} message={result.message} error />
  if (items.length === 0) return null
  return (
    <div data-search-row={rowKey}>
      <ItemRow
        title={title}
        count={items.length}
        itemWidth={width}
        restoreKey={restoreKey}
        previousLabel={t('web_previous')}
        nextLabel={t('web_next')}
        getItemKey={key}
        renderItem={(i) => {
          const item = items[i]
          return (
            <SearchPageCard
              item={item}
              kind={kind}
              ctx={ctx}
              focusKey={`search:${rowKey}:${item.Id}`}
              href={hrefFor(item)}
              onClick={onClickItem(item)}
              {...menu.cardActions(item)}
            />
          )
        }}
      />
    </div>
  )
}
