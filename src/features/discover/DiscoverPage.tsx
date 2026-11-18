import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { nav } from '../../app/nav'
import { TabRow } from '../../ui'
import collapse from '../common/Collapse.module.css'
import { DiscoverBackdrop } from './DiscoverBackdrop'
import { DiscoverGrid } from './DiscoverGrid'
import styles from './DiscoverPage.module.css'
import { DiscoverSearchTab } from './DiscoverSearchTab'
import { SeerrDiscoverTab } from './SeerrDiscoverTab'
import { SeerrGate } from './SeerrGate'
import { SeerrRequestsTab } from './SeerrRequestsTab'
import { useHeaderOnFirstRow } from '../common/useHeaderOnFirstRow'

const TABS = [
  { key: 'discover', label: 'discover' },
  { key: 'request', label: 'request' },
  { key: 'search', label: 'search' },
  { key: 'movies', label: 'movies_title' },
  { key: 'tv', label: 'tv_shows_title' },
] as const
type TabKey = (typeof TABS)[number]['key']

/**
 * Discover (`W/ui/discover/DiscoverPage.kt`): tabs Discover, Request, Search, Movies, TV Shows. The tab is
 * kept in the URL (`?tab=`) so Back and reload return to it.
 */
export default function DiscoverPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: TabKey = TABS.some((x) => x.key === raw) ? (raw as TabKey) : 'discover'
  const [body, setBody] = useState<HTMLDivElement | null>(null)
  // SE-15: the tab strip hides while keyboard focus is past the first row of the tab's content.
  const showTabs = useHeaderOnFirstRow(body, true, tab)

  return (
    <div className={styles.page}>
      <DiscoverBackdrop />
      <SeerrGate>
        <div className={styles.content}>
          <div className={collapse.collapse} data-hidden={showTabs ? undefined : ''} inert={!showTabs}>
            <div>
              <TabRow
                className={styles.tabs}
                label={t('discover')}
                tabs={TABS.map((x) => ({
                  key: x.key,
                  label: t(x.label),
                  href: `${nav.discover()}?tab=${x.key}`,
                }))}
                selectedKey={tab}
                onSelect={(key) =>
                  setParams(key === 'discover' ? {} : { tab: key }, {
                    replace: true,
                  })
                }
              />
            </div>
          </div>
          <div ref={setBody} className={styles.body}>
            {tab === 'discover' && <SeerrDiscoverTab />}
            {tab === 'request' && <SeerrRequestsTab />}
            {tab === 'search' && <DiscoverSearchTab />}
            {tab === 'movies' && <DiscoverGrid key="movies" type="DISCOVER_MOVIES" stateKey="movies" />}
            {tab === 'tv' && <DiscoverGrid key="tv" type="DISCOVER_TV" stateKey="tv" />}
          </div>
        </div>
      </SeerrGate>
    </div>
  )
}
