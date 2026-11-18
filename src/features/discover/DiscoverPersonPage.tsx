import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { usePersonCredits, type DiscoverItem } from '../../api/seerr'
import { CardGrid, ErrorMessage, LoadingPage, type CardGridHandle } from '../../ui'
import { loadScroll } from '../../ui/rows/scrollMemory'
import { DiscoverCard } from './DiscoverCard'
import { clearDiscoverBackdrop } from './backdropStore'
import styles from './DiscoverDetails.module.css'
import { discoveredItemHref } from './links'
import { isolate } from './seerrText'

/**
 * `DiscoverPersonPage`: "Discover: <name>" over the person's combined credits (cast + crew, de-duplicated,
 * newest first), scrolled to `startIndex`. Cards open Seerr pages. A failed fetch shows an error (upstream
 * spins forever).
 */
export function DiscoverPersonPage({ id, name, startIndex }: { id: number; name: string | null; startIndex: number }) {
  const { t } = useTranslation()
  const location = useLocation()
  const credits = usePersonCredits(id)
  useEffect(() => clearDiscoverBackdrop(), [])
  const title = name ? t('web_seerr_discover_title', { p1: t('discover'), p2: isolate(name) }) : t('discover')

  return (
    <div className={styles.person}>
      <h1 className={styles.personTitle}>{title}</h1>
      {credits.isPending ? (
        <LoadingPage delayMs={300} label={t('loading')} />
      ) : credits.isError ? (
        <ErrorMessage title={t('web_seerr_error_occurred')} detail={credits.error.message} />
      ) : (
        <PersonGrid items={credits.data} startIndex={startIndex} restoreKey={`discover-person-${id}-${location.key}`} />
      )}
    </div>
  )
}

function PersonGrid({ items, startIndex, restoreKey }: { items: DiscoverItem[]; startIndex: number; restoreKey: string }) {
  const { t } = useTranslation()
  const grid = useRef<CardGridHandle>(null)
  const restored = useRef(loadScroll(restoreKey) != null)
  // `startIndex` (person "view more" from a Jellyfin page) applies once, unless Back restores a position.
  useEffect(() => {
    if (startIndex > 0 && startIndex < items.length && !restored.current) {
      restored.current = true
      grid.current?.scrollToIndex(startIndex, { focus: false })
    }
  }, [startIndex, items.length])
  return (
    <CardGrid
      ref={grid}
      count={items.length}
      columns={{ kind: 'auto', minCardWidth: 140 }}
      gap={16}
      restoreKey={restoreKey}
      getItemKey={(i) => `${items[i].type}-${items[i].id}`}
      empty={<p className={styles.empty}>{t('no_results')}</p>}
      renderItem={(i) => <DiscoverCard item={items[i]} href={discoveredItemHref(items[i])} width="fill" index={i} />}
    />
  )
}
