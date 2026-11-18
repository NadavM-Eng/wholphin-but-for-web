import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { mayTakeInitialFocus } from '../../app/shell'
import { useLocation } from 'react-router'
import { useRequests } from '../../api/seerr'
import { CardGrid, ErrorMessage, LoadingPage } from '../../ui'
import { DiscoverCard } from './DiscoverCard'
import { clearDiscoverBackdrop } from './backdropStore'
import styles from './DiscoverGrid.module.css'
import { discoveredItemHref } from './links'

/**
 * Tab 2 "Request" (`SeerrRequestsPage`): GET /request (first page, API order; managers see everyone's),
 * each title's details 3 at a time; any failure shows the error. Cards always open the Seerr page.
 */
export function SeerrRequestsTab() {
  const { t } = useTranslation()
  const location = useLocation()
  const requests = useRequests()
  useEffect(() => clearDiscoverBackdrop(), [])
  // SE-10: with no requests, focus goes to the tab strip (upstream `focusRequesterOnEmpty`), unless something
  // already holds it (a click on the tab keeps focus on the tab).
  const empty = requests.isSuccess && requests.data.length === 0
  useEffect(() => {
    if (!empty || !mayTakeInitialFocus()) return
    document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true })
  }, [empty])

  if (requests.isPending) return <LoadingPage delayMs={300} label={t('loading')} />
  if (requests.isError) return <ErrorMessage title={t('web_seerr_error_occurred')} detail={requests.error.message} />
  const list = requests.data
  return (
    <div className={styles.root}>
      <CardGrid
        count={list.length}
        columns={{ kind: 'auto', minCardWidth: 140 }}
        gap={16}
        restoreKey={`discover-requests-${location.key}`}
        getItemKey={(i) => list[i].request.id}
        empty={<p className={styles.empty}>{t('no_results')}</p>}
        renderItem={(i) => <DiscoverCard item={list[i].item} href={discoveredItemHref(list[i].item)} width="fill" index={i} />}
      />
    </div>
  )
}
