import type { UseQueryResult } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { DiscoverItem } from '../../api/seerr'
import { ErrorMessage, ItemRow, ViewMoreCard } from '../../ui'
import { isHoverPointer, useHoverIntent } from '../common/hoverIntent'
import { DiscoverCard } from './DiscoverCard'
import styles from './DiscoverRow.module.css'
import { useSpaLink } from './useSpaLink'

export type DiscoverRowProps = {
  title: string
  query: Pick<UseQueryResult<DiscoverItem[]>, 'data' | 'error' | 'isPending' | 'isError'>
  hrefOf: (item: DiscoverItem) => string
  onActive?: (item: DiscoverItem, index: number) => void
  /** "View more" card at the end (DiscoverMoreResult). */
  viewMoreHref?: string
  onViewMoreActive?: () => void
  restoreKey?: string
  /**
   * Detail pages: render the row only once it has items (upstream `if (similar.isNotEmpty())`), so nothing
   * shows while it loads, when it is empty, or when the fetch failed.
   */
  hideWhenEmpty?: boolean
}

/** Upstream `DiscoverRow` / `DiscoverItemRow`: loading -> title + "Loading…", error -> ErrorMessage, else the cards. */
export function DiscoverRow({
  title,
  query,
  hrefOf,
  onActive,
  viewMoreHref,
  onViewMoreActive,
  restoreKey,
  hideWhenEmpty,
}: DiscoverRowProps) {
  const { t } = useTranslation()
  const link = useSpaLink()
  // as the cards beside it (DiscoverCard): hover takes the header only after the shared intent delay
  const hover = useHoverIntent<string>()
  if (hideWhenEmpty && (query.isError || query.isPending || !query.data?.length)) return null
  if (query.isError) {
    return <ErrorMessage title={t('web_seerr_error_occurred')} message={title} detail={query.error?.message} />
  }
  if (query.isPending) {
    return (
      <section className={styles.loading} aria-busy>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.loadingText}>{t('loading')}</p>
      </section>
    )
  }
  const items = query.data ?? []
  const count = items.length + (viewMoreHref ? 1 : 0)
  return (
    <ItemRow
      title={title}
      count={count}
      itemWidth={(172 * 2) / 3}
      restoreKey={restoreKey}
      previousLabel={t('web_previous')}
      nextLabel={t('web_next')}
      getItemKey={(i) => (i < items.length ? `${items[i].type}-${items[i].id}-${i}` : 'more')}
      renderItem={(i) =>
        i < items.length ? (
          <DiscoverCard
            item={items[i]}
            href={hrefOf(items[i])}
            index={i}
            focusKey={`discover:${restoreKey ?? title}:${i}`}
            onActive={onActive ? (it) => onActive(it, i) : undefined}
          />
        ) : (
          <div
            onFocus={onViewMoreActive}
            onPointerEnter={onViewMoreActive ? (e) => isHoverPointer(e) && hover.over('more', onViewMoreActive) : undefined}
            onPointerLeave={onViewMoreActive ? hover.leave : undefined}
          >
            <ViewMoreCard label={t('view_more')} href={viewMoreHref} onClick={viewMoreHref ? link(viewMoreHref) : undefined} />
          </div>
        )
      }
    />
  )
}
