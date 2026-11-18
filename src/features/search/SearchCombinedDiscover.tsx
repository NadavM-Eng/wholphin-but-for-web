import type { Translate } from '../../lib/format'
import { useDp } from '../../theme/scale'
import { CardGrid, DiscoverItemCard } from '../../ui'
import { useLinkClick } from '../common/links'
import { CombinedPlaceholder } from './CombinedPlaceholder'
import type { SearchDiscoverResult } from './searchExtensions'
import styles from './SearchPage.module.css'
import { useGridColumns } from './useGridColumns'
import type { SearchResult } from './useSearchResults'

type Props = {
  result: SearchResult<SearchDiscoverResult>
  t: Translate
  restoreKey: string
  getScrollElement: () => HTMLElement | null
}

/** Combined mode, Discover tab: Seerr results as a grid of `DiscoverItemCard`s (no long-press menu). */
export function SearchCombinedDiscover({ result, t, restoreKey, getScrollElement }: Props) {
  const columns = useGridColumns()
  const dp = useDp()
  const linkClick = useLinkClick()
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
        getItemKey={(i) => items[i]?.key ?? i}
        estimateRowHeight={(w) => (w * 3) / 2 + dp(52)}
        renderItem={(i) => {
          const r = items[i]
          return (
            <DiscoverItemCard
              {...r.card}
              width="fill"
              href={r.href}
              onClick={linkClick(r.href)}
              surfaceProps={{ 'data-focus-key': `search:discover-grid:${r.key}` }}
            />
          )
        }}
      />
    </section>
  )
}
