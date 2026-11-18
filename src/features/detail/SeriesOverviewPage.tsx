// `Destination.SeriesOverview(seriesId, SERIES, SeasonEpisodeIds?)` (W/ui/nav/DestinationContent.kt:137-144) at
// /series/:id?season=&episode= (ids). The page keeps the URL in step with the selected season and episode by
// replacing the history entry, so Back leaves the series and Back / reload come back to the same episode.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router'
import { nav } from '../../app/nav'
import { PAGE_ROOT_ATTR } from '../../app/shell'
import { ErrorMessage, LoadingPage } from '../../ui'
import { useTranslate } from '../common/useTranslate'
import { useDetailItem } from './common/detailQueries'
import styles from './MediaItemPage.module.css'
import { SeriesOverview, type SeasonEpisode } from './series/SeriesOverview'

function fromSearch(search: string): SeasonEpisode {
  const p = new URLSearchParams(search)
  return { season: p.get('season') || null, episode: p.get('episode') || null }
}

/** Route page (lazy default export of src/app/routes.tsx). */
export default function SeriesOverviewPage() {
  const { itemId = '' } = useParams()
  const { t } = useTranslate()
  const location = useLocation()
  const navigate = useNavigate()
  const q = useDetailItem(itemId)
  // The start position comes from the URL once; later URL changes written by the page itself do not restart it,
  // a different link to this route (another season or episode) does.
  const written = useRef<string | null>(null)
  const [start, setStart] = useState(() => ({ search: location.search, value: fromSearch(location.search), epoch: 0 }))
  useEffect(() => {
    if (location.search === start.search || location.search === written.current) return
    setStart((s) => ({ search: location.search, value: fromSearch(location.search), epoch: s.epoch + 1 }))
  }, [location.search, start.search])

  const current = useRef(location)
  useEffect(() => {
    current.current = location
  }, [location])

  const onPosition = useCallback(
    (p: SeasonEpisode, now?: boolean) => {
      const path = nav.series(itemId, p)
      const at = path.indexOf('?')
      const search = at >= 0 ? path.slice(at) : ''
      const loc = current.current
      // the address bar, not the router's location: a `now` write below changes only the former
      if (search === window.location.search) return
      written.current = search
      if (now) {
        // The key or click that asked for this may navigate away in the same event, and a router navigation
        // that is interrupted by the next one never reaches the history. Write the entry directly (same state
        // object, so the router's key, the remembered focus and scroll stay with it).
        window.history.replaceState(window.history.state, '', path)
        return
      }
      void navigate(path, { replace: true, preventScrollReset: true, state: loc.state })
      // Focus is remembered per history entry: record it again under the new entry for Back.
      requestAnimationFrame(() => {
        const a = document.activeElement
        if (a instanceof HTMLElement && a !== document.body && a.closest(`[${PAGE_ROOT_ATTR}]`)) {
          a.blur()
          a.focus({ preventScroll: true })
        }
      })
    },
    [itemId, navigate],
  )

  if (q.isError && !q.data) {
    return (
      <div className={styles.page}>
        <ErrorMessage title={t('compose_error_message_title')} detail={q.error instanceof Error ? q.error.message : String(q.error)} />
      </div>
    )
  }
  const item = q.data
  if (!item) {
    return (
      <div className={styles.page}>
        <LoadingPage label={t('loading')} />
      </div>
    )
  }
  // Anything but a series (an old link, a season id) opens through the item page, which routes it.
  if (item.Type !== 'Series') return <Navigate to={nav.item(item.Id ?? itemId)} replace />
  return <SeriesOverview key={`${item.Id}:${start.epoch}`} series={item} initial={start.value} onPosition={onPosition} />
}
