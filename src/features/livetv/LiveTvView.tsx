import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useSearchParams } from 'react-router'
import { useApi, useSession } from '../../api/session'
import { clearBackdrop } from '../../app/backdrop'
import { isKeyboardModality, mayTakeInitialFocus } from '../../app/shell/shellFocus'
import { recordingFoldersQuery } from '../../app/shell/useDrawerItems'
import { usePrefs } from '../../stores/preferences'
import { loadRememberedTab, saveRememberedTab } from '../browse/model/displayInfo'
import { LoadingPage, TabRow } from '../../ui'
import collapse from '../common/Collapse.module.css'
import { DvrSchedule } from './DvrSchedule'
import { LiveTvError } from './LiveTvError'
import styles from './LiveTvView.module.css'
import { RecordingFolderGrid } from './RecordingFolderGrid'
import { tabArrivalTarget } from './tabArrival'
import { TvGuide } from './TvGuide'

type Props = {
  /** the Live TV user view id (remembered-tab key); null when it is not known (e.g. no such library) */
  libraryId: string | null
}

/**
 * Live TV library page (`CollectionFolderLiveTv`, W/ui/detail/CollectionFolderLiveTv.kt): a TabbedPage with
 * "Guide", "DVR Schedule" and one tab per recording folder (`GET /LiveTv/Recordings/Folders?userId=`). The tab is
 * kept in the URL (`?tab=<index>`, as `nav.library(id, { tab })`) and, with "remember selected tab" on, per user
 * and library. The tab row hides while keyboard focus is below the guide's first row or while a recording folder's
 * grid (browse's LibraryGrid) is scrolled. Selecting a tab clears the backdrop (TabViewModel.updateSelectedTabIndex).
 */
export function LiveTvView({ libraryId }: Props) {
  const { t } = useTranslation()
  const api = useApi()
  const session = useSession()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const rememberTabs = usePrefs('rememberSelectedTab')
  const rememberKey = libraryId ?? 'livetv'

  useEffect(() => clearBackdrop(), [])

  const folders = useQuery({
    // shared with the drawer and Home (401/403 are "no folders" there, as NavDrawerService does)
    ...recordingFoldersQuery(api, session?.user.id ?? ''),
    enabled: !!session,
  })

  const [guideRow, setGuideRow] = useState(0)
  const onRowPosition = useCallback((row: number) => setGuideRow(row), [])
  // a recording-folder tab: the grid reports scrolling (LibraryGrid onScrolled) and the tab row collapses
  const [scrolledGrid, setScrolledGrid] = useState<string | null>(null)

  const tabCount = 2 + (folders.data?.length ?? 0)
  const raw = params.get('tab')
  const fromUrl = raw != null && /^\d+$/.test(raw) ? Number(raw) : null
  const remembered = rememberTabs && folders.data && session ? loadRememberedTab(session.server.id, session.user.id, rememberKey) : null
  const tab = fromUrl ?? (remembered != null ? Math.min(Math.max(remembered, 0), tabCount - 1) : 0)

  // A tab's content takes focus once it has loaded: DvrSchedule(requestFocusAfterLoading) its first row,
  // CollectionFolderView its first card; an empty schedule leaves focus on the selected tab
  // (focusRequesterOnEmpty). Only while focus is still at the page entry (on this page's tab row after a keyboard
  // choice, on <body> after a direct load, or still in the drawer while a keyboard arrival is pending:
  // mayTakeInitialFocus), never on a touch-only device. The guide does the same for itself (GuideGrid).
  const body = useRef<HTMLDivElement>(null)
  /** time stamp of an Up / Down key press inside the page that has not moved focus yet */
  const arrow = useRef(0)
  const ready = !!folders.data
  useEffect(() => {
    const el = body.current
    const page = el?.parentElement
    if (!ready || tab === 0 || !el || !page || matchMedia('(hover: none)').matches) return
    const take = () => {
      const target = tabArrivalTarget(page, el, tab, mayTakeInitialFocus(), isKeyboardModality())
      if (target === 'wait') return false
      if (target && target !== document.activeElement) target.focus({ preventScroll: true })
      return true
    }
    if (take()) return
    const observer = new MutationObserver(() => {
      if (take()) stop()
    })
    const timer = window.setTimeout(stop, 10_000)
    function stop() {
      observer.disconnect()
      window.clearTimeout(timer)
    }
    observer.observe(el, { childList: true, subtree: true })
    return stop
  }, [tab, ready])

  if (folders.isError) return <LiveTvError error={folders.error} />
  if (!folders.data) return <LoadingPage label={t('loading')} />

  const tabs = [
    { key: '0', label: t('tv_guide') },
    { key: '1', label: t('tv_dvr_schedule') },
    ...folders.data.map((f, i) => ({ key: String(i + 2), label: f.Name ?? t('recordings') })),
  ]
  const showTabs = tab === 0 ? guideRow <= 0 : tab === 1 ? true : scrolledGrid !== folders.data[tab - 2]?.Id

  const select = (key: string) => {
    const index = Number(key)
    setParams(index === 0 ? {} : { tab: key }, { replace: true })
    if (rememberTabs && session) saveRememberedTab(session.server.id, session.user.id, rememberKey, index)
    setGuideRow(0)
    clearBackdrop()
  }

  let content
  if (tab === 0) content = <TvGuide onRowPosition={onRowPosition} />
  else if (tab === 1) content = <DvrSchedule />
  else {
    const folder = folders.data[tab - 2]
    content = folder?.Id ? (
      <RecordingFolderGrid key={folder.Id} folder={folder} variant="tab" onScrolled={(on) => setScrolledGrid(on ? (folder.Id ?? null) : null)} />
    ) : (
      <LiveTvError message={t('web_livetv_invalid_tab', { p1: tab })} />
    )
  }

  return (
    // the guide and the folder grids scroll inside their own box: one viewport tall; the DVR schedule scrolls the page
    <div
      className={styles.page}
      data-guide={tab !== 1 || undefined}
      onKeyDownCapture={(e) => {
        arrow.current = e.key === 'ArrowUp' || e.key === 'ArrowDown' ? e.timeStamp : 0
      }}
      onPointerDownCapture={() => {
        arrow.current = 0
      }}
      onFocus={(e) => {
        // TabRow.kt focusProperties.onEnter: moving into the tab row with Up or Down lands on the selected tab,
        // whichever tab is nearest (the shared TabRow leaves the choice to the arrow-key navigator)
        const row = e.target.closest('[role="tablist"]')
        const viaArrow = arrow.current > 0 && e.timeStamp - arrow.current < 250
        arrow.current = 0
        if (!row || !viaArrow || (e.relatedTarget instanceof Node && row.contains(e.relatedTarget))) return
        const selected = row.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
        if (selected && selected !== e.target) selected.focus()
      }}
    >
      <div className={collapse.collapse} data-hidden={showTabs ? undefined : ''} inert={!showTabs}>
        <div>
          <TabRow
            className={styles.tabs}
            label={t('live_tv')}
            tabs={tabs.map((x) => ({ ...x, href: `${location.pathname}${x.key === '0' ? '' : `?tab=${x.key}`}` }))}
            selectedKey={String(tab)}
            onSelect={select}
          />
        </div>
      </div>
      <div ref={body} className={styles.body}>
        {content}
      </div>
    </div>
  )
}
