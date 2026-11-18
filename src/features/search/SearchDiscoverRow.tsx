import { useCallback, useMemo } from 'react'
import type { Translate } from '../../lib/format'
import { DiscoverItemCard, ItemRow, LoadingRow } from '../../ui'
import { useLinkClick } from '../common/links'
import type { SearchDiscoverResult } from './searchExtensions'
import type { SearchResult } from './useSearchResults'

type Props = {
  result: SearchResult<SearchDiscoverResult>
  t: Translate
  restoreKey: string
}

/** The "Discover" row after the type rows in category mode (Seerr results, no long-press menu). */
export function SearchDiscoverRow({ result, t, restoreKey }: Props) {
  const linkClick = useLinkClick()
  const items = useMemo(() => (result.status === 'success' ? result.items : []), [result])
  const key = useCallback((i: number) => items[i]?.key ?? i, [items])
  const title = t('discover')
  if (result.status === 'searching') return <LoadingRow title={title} message={t('searching')} />
  if (result.status === 'error') return <LoadingRow title={title} message={result.message} error />
  if (items.length === 0) return null
  return (
    <div data-search-row="discover">
      <ItemRow
        title={title}
        count={items.length}
        itemWidth={(172 * 2) / 3}
        restoreKey={restoreKey}
        previousLabel={t('web_previous')}
        nextLabel={t('web_next')}
        getItemKey={key}
        renderItem={(i) => {
          const r = items[i]
          return (
            <DiscoverItemCard
              {...r.card}
              showOverlay
              href={r.href}
              onClick={linkClick(r.href)}
              surfaceProps={{ 'data-focus-key': `search:discover:${r.key}` }}
            />
          )
        }}
      />
    </div>
  )
}
