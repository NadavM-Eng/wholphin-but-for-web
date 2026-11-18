import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type FocusEvent, type MouseEvent } from 'react'
import { useApi, useSession } from '../../../api/session'
import { submitBackdrop } from '../../../app/backdrop'
import { useNav } from '../../../app/nav'
import { mayTakeInitialFocus, useCompactLayout, useGoBack } from '../../../app/shell'
import { getItemPlayback } from '../../../stores/playbackChoices'
import { useSessionStore } from '../../../stores/session'
import { usePrefs } from '../../../stores/preferences'
import { dp } from '../../../theme/scale'
import { CircularProgress, ErrorMessage, TabRow, TitleOrLogo, contextMenuPoint, lastInput, useLongPress } from '../../../ui'
import { formatSeasonNumber } from '../../../lib/format'
import { resumeMs } from '../../common/itemMenu'
import { logoUrl } from '../../common/logo'
import { useItemActions } from '../../common/useItemActions'
import { useItemContextMenu } from '../../common/useItemContextMenu'
import { useTranslate } from '../../common/useTranslate'
import { DetailPlayButtons } from '../common/DetailPlayButtons'
import { ExtrasRow } from '../common/ExtrasRow'
import { PeopleRow } from '../common/PeopleRow'
import { useChosenStreams, useSpecialFeatures } from '../common/detailQueries'
import { groupExtras } from '../common/extras'
import { openItemDialog } from '../common/itemDialogs'
import { mediaInfoOf } from '../common/mediaInfo'
import { hasSavedChoices } from '../common/streams'
import { useThemeSong } from '../common/themeMusic'
import { useCanDelete } from '../common/useDetailActions'
import { EpisodeStrip, type EpisodeStripHandle } from './EpisodeStrip'
import { EPISODE_CARD_HEIGHT } from './stripLayout'
import { FocusedEpisodeHeader } from './FocusedEpisodeHeader'
import { overviewScrollTop } from './overviewScroll'
import { arrayList, findIndexByNumberOrIdFast } from './episodeIndex'
import { SEASON_PAGE_SIZE, episodeAccess, fetchEpisodeHint, useEpisodeList, usePeopleInEpisode, useSeasons } from './seriesQueries'
import styles from './SeriesOverview.module.css'

/** `SeasonEpisodeIds` as the URL carries it (ids only; the numbers come from the episode itself). */
export type SeasonEpisode = { season: string | null; episode: string | null }

/** `SeriesOverviewPosition` plus the season id the episode list belongs to. */
type Position = { seasonIndex: number; seasonId: string; episode: number }

/** The URL follows the selection after it rests this long (history.replaceState, not a new entry). */
const URL_SYNC_MS = 300

/**
 * Upstream `SeriesOverview` + `SeriesOverviewContent` (W/ui/detail/series/): season tabs, the series logo, the
 * focused episode's details, the episode strip, the focused episode's buttons, Cast & Crew / Guest stars of that
 * episode, and the season's extras. Opened at `initial` (season / episode ids, from the URL) with upstream's
 * search; without ids it starts at the first season's first episode.
 */
/** Keys that move the selection: the URL waits for them to settle. Any other key may leave the page. */
const SELECTION_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Shift', 'Control', 'Alt', 'Meta'])

export function SeriesOverview({
  series,
  initial,
  onPosition,
}: {
  series: BaseItemDto
  initial: SeasonEpisode
  /** `now`: write the URL of the current history entry at once (the page may be left by this same key or click). */
  onPosition: (p: SeasonEpisode, now?: boolean) => void
}) {
  const { t } = useTranslate()
  const api = useApi()
  const qc = useQueryClient()
  const userId = useSession()?.user.id
  const go = useNav()
  const goBack = useGoBack()
  const compact = useCompactLayout()
  const actions = useItemActions()
  const showLogos = usePrefs('showLogos')
  const baseUrl = useSessionStore((s) => s.current?.api.basePath ?? null)
  const id = series.Id ?? ''
  const menu = useItemContextMenu()
  const seasonsQ = useSeasons(id)
  const seasons = seasonsQ.data
  const [pos, setPos] = useState<Position | null>(null)
  const [error, setError] = useState<string | null>(null)
  const strip = useRef<EpisodeStripHandle>(null)
  const root = useRef<HTMLDivElement>(null)
  const stripBox = useRef<HTMLDivElement>(null)
  const focusFirstAfterLoad = useRef(false)

  useEffect(() => submitBackdrop(series), [series])
  useThemeSong(id)
  // The remembered-choices store loads lazily on its first read and sets state then; reading it here, after the
  // first commit, keeps that out of a later render (src/stores/playbackChoices.ts doc()).
  useEffect(() => void getItemPlayback(''), [])

  // SeriesOverviewContent.kt:147-155: Column.fillMaxSize().padding(vertical = 16.dp).verticalScroll(...), so the
  // scrolled content is clipped 16dp inside the screen's top and bottom edges (refshot 14-series-overview-top cuts
  // the Cast & Crew circles at 524dp). The page keeps the window as its scroller (scroll restoration, phone
  // browser bars), so the clip follows the window instead: nothing is drawn above 16dp or below height - 16dp.
  useEffect(() => {
    const el = root.current
    if (!el) return
    let raf = 0
    const apply = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const inset = dp(16)
      const top = Math.max(0, inset - r.top)
      const bottom = Math.max(0, r.bottom - (window.innerHeight - inset))
      el.style.clipPath = top > 0 || bottom > 0 ? `inset(${top}px -100vw ${bottom}px -100vw)` : ''
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply)
    }
    apply()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    ro?.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      ro?.disconnect()
    }
  }, [])

  // The start position (SeriesViewModel.init + findIndexByNumberOrIdFast), once the seasons are known. It runs
  // once per mount: a later seasons refetch (a watched / favorite / delete invalidation) must not move the
  // selection back to `initial`. Only a run interrupted before it finished (StrictMode, a refetch mid-search) runs again.
  const started = useRef(false)
  useEffect(() => {
    if (!seasons || started.current) return
    started.current = true
    let cancelled = false
    let finished = false
    void (async () => {
      try {
        const hint = initial.episode ? await fetchEpisodeHint(qc, api, userId, initial.episode).catch(() => null) : null
        const seasonId = initial.season ?? hint?.SeasonId ?? seasons[0]?.Id ?? null
        if (!seasonId) {
          // Upstream: EpisodeList.Error("Could not determine season").
          if (!cancelled) {
            finished = true
            setError(t('web_could_not_determine_season'))
          }
          return
        }
        const seasonNumber = hint?.ParentIndexNumber ?? seasons.find((s) => s.Id === seasonId)?.IndexNumber ?? null
        const seasonIndex =
          initial.season != null || hint
            ? Math.max(0, await findIndexByNumberOrIdFast(seasonNumber, seasonId, arrayList(seasons, SEASON_PAGE_SIZE), null, null))
            : 0
        let episode = 0
        if (initial.episode) {
          const access = episodeAccess(qc, api, userId, id, seasonId)
          const total = await access.loadTotal()
          episode = Math.max(0, await findIndexByNumberOrIdFast(hint?.IndexNumber ?? null, initial.episode, access.blocking(total), seasonId, seasonNumber))
        }
        if (!cancelled) {
          finished = true
          setPos({ seasonIndex, seasonId, episode })
        }
      } catch (err) {
        if (!cancelled) {
          finished = true
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    })()
    return () => {
      cancelled = true
      if (!finished) started.current = false
    }
  }, [seasons, initial.season, initial.episode, qc, api, userId, id, t])

  const list = useEpisodeList(id, pos?.seasonId ?? null)
  const total = list && list.seasonId === pos?.seasonId ? list.total : null
  const focused = pos && list && total != null && total > 0 ? list.get(Math.min(pos.episode, total - 1)) : undefined
  const chosen = useChosenStreams(focused)
  const canDelete = useCanDelete(focused)
  const people = usePeopleInEpisode(focused?.Id ?? null)
  const extrasQ = useSpecialFeatures(pos?.seasonId ?? undefined)
  const extras = useMemo(() => groupExtras(t, extrasQ.data ?? []), [extrasQ.data, t])
  const castAndCrew = useMemo(() => people.filter((p) => p.Type !== 'GuestStar'), [people])
  const guestStars = useMemo(() => people.filter((p) => p.Type === 'GuestStar'), [people])

  // Deleting episodes: past the end the selection is the last episode (`focused` and the strip clamp it), and
  // an emptied season goes back (SeriesViewModel.deleteItem).
  const hadEpisodes = useRef<string | null>(null)
  useEffect(() => {
    if (!pos || total == null) return
    if (total > 0) hadEpisodes.current = pos.seasonId
    else if (hadEpisodes.current === pos.seasonId) goBack()
  }, [pos, total, goBack])

  // A season picked with the keyboard moves focus to its first episode once loaded (requestFocusAfterSeason).
  useEffect(() => {
    if (total != null && total > 0 && focusFirstAfterLoad.current) {
      focusFirstAfterLoad.current = false
      strip.current?.focusIndex(0)
    }
  }, [total, pos?.seasonId])

  // Arrival: the selected episode card takes real focus once the strip shows (RequestOrRestoreFocus), so the first
  // key press moves from it. Never on touch screens and never stealing focus (mayTakeInitialFocus); on Back the
  // shell's focus restore puts the remembered element back over it.
  const arrived = useRef(false)
  useEffect(() => {
    if (arrived.current || !pos || total == null || total === 0) return
    if (matchMedia('(hover: none)').matches) {
      arrived.current = true
      return
    }
    const index = Math.min(pos.episode, total - 1)
    const raf = requestAnimationFrame(() => {
      arrived.current = true
      if (mayTakeInitialFocus()) strip.current?.focusIndex(index)
    })
    return () => cancelAnimationFrame(raf)
  }, [pos, total])

  // The URL follows the selection (replace), so Back leaves the series and a reload or Back returns here.
  const focusedId = focused?.Id ?? null
  const pendingUrl = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (!pos || (total != null && total > 0 && !focusedId) || total == null) return
    const p = { season: pos.seasonId, episode: focusedId }
    const timer = setTimeout(() => {
      pendingUrl.current = null
      onPosition(p)
    }, URL_SYNC_MS)
    pendingUrl.current = () => {
      clearTimeout(timer)
      pendingUrl.current = null
      onPosition(p, true)
    }
    return () => {
      clearTimeout(timer)
      pendingUrl.current = null
    }
  }, [pos?.seasonId, focusedId, total, onPosition, pos])
  // Enter (or a click) sooner than URL_SYNC_MS after the last arrow key opened the episode while the URL still
  // named the one before it, and Back came back to that one. The pending position is written first.
  const flushUrl = () => pendingUrl.current?.()

  // Where an arrow key's focus move leaves the page scrolled (overviewScroll.ts). The global navigator has
  // already scrolled by its own rule when the focus event's microtask runs; this replaces that scroll. Focus in
  // the top group keeps the navigator's header rule (header.bringIntoView()), except Down from the strip onto the
  // buttons with reduced motion, which the reference run shows one delayed frame down.
  const topBox = useRef<HTMLDivElement>(null)
  const arrowMove = useRef<{ key: string; fromStrip: boolean; scrollY: number } | null>(null)
  const onArrowKey = (key: string) => {
    arrowMove.current = { key, fromStrip: !!stripBox.current?.contains(document.activeElement), scrollY: window.scrollY }
    setTimeout(() => (arrowMove.current = null), 0)
  }
  const scrollAfterArrow = (target: EventTarget) => {
    const move = arrowMove.current
    const top = topBox.current
    if (!move || !top || !(target instanceof HTMLElement) || !root.current?.contains(target)) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    let frames: number
    if (!top.contains(target)) frames = reduced ? 2 : Infinity
    else if (reduced && move.key === 'ArrowDown' && move.fromStrip && target.closest(`.${styles.footer}`)) frames = 1
    else return
    queueMicrotask(() => {
      if (document.activeElement !== target) return
      const r = target.getBoundingClientRect()
      const h = target.offsetHeight || r.height
      const inset = dp(16)
      const bodyPad = parseFloat(getComputedStyle(document.body).paddingBottom)
      const reserve = Number.isFinite(bodyPad) && bodyPad > 0 && bodyPad < window.innerHeight / 2 ? bodyPad : 0
      const scroller = document.scrollingElement ?? document.documentElement
      // measured from where the page was before the key: the navigator may have scrolled already
      const current = move.scrollY
      const next = overviewScrollTop({
        current,
        // the layout box without the focus scale (a graphics layer on the TV), as src/ui/lib/bringIntoView.ts
        itemTop: (r.top + r.bottom) / 2 - h / 2 + window.scrollY - current,
        itemHeight: h,
        viewTop: inset,
        viewHeight: window.innerHeight - reserve - 2 * inset,
        max: scroller.scrollHeight - window.innerHeight,
        frames,
      })
      // also when `next` is where the page was: it ends a smooth scroll the navigator started
      window.scrollTo({ top: next, behavior: reduced ? 'auto' : 'smooth' })
    })
  }

  // Dimming: focus is on the page but not on the strip (and the pointer is not over it).
  const [focusIn, setFocusIn] = useState<'none' | 'strip' | 'other'>('none')
  const [stripHover, setStripHover] = useState(false)
  const dimmed = focusIn === 'other' && !stripHover

  const selectSeason = (key: string) => {
    const i = Number(key)
    const season = seasons?.[i]
    if (!pos || !season?.Id || i === pos.seasonIndex) return
    setPos({ seasonIndex: i, seasonId: season.Id, episode: 0 })
    focusFirstAfterLoad.current = lastInput() === 'keyboard'
  }

  const onTabContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    const tab = (e.target as HTMLElement).closest<HTMLElement>('[data-tab-key]')
    const season = tab ? seasons?.[Number(tab.dataset.tabKey)] : undefined
    if (!season) return
    e.preventDefault()
    // Web addition: the season's item menu (Play, Shuffle, watched, favorite, …) on its tab.
    menu.open(season, contextMenuPoint(e), { showGoTo: false, showStreamChoices: false })
  }

  // Touch long-press on a season tab opens the same menu (iOS Safari sends no contextmenu for touch).
  const pressedTab = useRef<HTMLElement | null>(null)
  const tabLongPress = useLongPress((box) =>
    (pressedTab.current?.isConnected ? pressedTab.current : box).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
  )

  // Entering the tab row with the keyboard lands on the selected season's tab (TabRow focus restorer).
  const onTabsFocus = (e: FocusEvent<HTMLDivElement>) => {
    if (!pos || e.currentTarget.contains(e.relatedTarget as Node | null)) return
    const target = e.target as HTMLElement
    if (!target.matches(':focus-visible') || target.dataset.tabKey === String(pos.seasonIndex)) return
    e.currentTarget.querySelector<HTMLElement>(`[data-tab-key="${pos.seasonIndex}"]`)?.focus()
  }

  const play = (ep: BaseItemDto, ms = resumeMs(ep)) => go.play(ep.Id ?? '', { t: ms })
  const logo = logoUrl(baseUrl, series, Math.round(dp(60) * (window.devicePixelRatio || 1)))
  const tabs = (seasons ?? []).map((s, i) => ({ key: String(i), label: s.Name ?? (s.IndexNumber != null ? formatSeasonNumber(t, s.IndexNumber) : '') }))

  const header = (
    <FocusedEpisodeHeader ep={focused} chosen={chosen} onOverview={() => focused && openItemDialog({ kind: 'mediaInfo', info: mediaInfoOf(focused) })} />
  )

  let stripContent
  if (error || seasonsQ.isError || list?.isError) {
    const detail = error ?? (seasonsQ.error instanceof Error ? seasonsQ.error.message : list?.error instanceof Error ? list.error.message : null)
    stripContent = <ErrorMessage title={t('compose_error_message_title')} detail={detail ?? ''} />
  } else if (!pos || !list || total == null) {
    stripContent = (
      <div className={styles.loading} style={{ height: `${dp(EPISODE_CARD_HEIGHT)}px` }} aria-busy="true">
        <CircularProgress size={40} label={t('loading')} />
      </div>
    )
  } else {
    stripContent = (
      <EpisodeStrip
        ref={strip}
        key={pos.seasonId}
        list={list}
        total={total}
        selected={Math.min(pos.episode, Math.max(0, total - 1))}
        onSelect={(i) => setPos((p) => (p && p.episode !== i ? { ...p, episode: i } : p))}
        onPlay={(ep) => play(ep)}
        menu={menu}
        chosenSourceId={chosen?.source.Id}
        canClearChosenStreams={hasSavedChoices(chosen)}
        dimmed={dimmed}
        listKey={pos.seasonId}
        onArrowDown={() => {
          // Down enters the button row at its first button (focusRestorer(firstFocus) on ExpandablePlayButtons).
          const first = root.current?.querySelector<HTMLElement>(`.${styles.footer} [data-focusable], .${styles.footer} button:not([disabled])`)
          first?.focus()
          return !!first
        }}
      />
    )
  }

  return (
    <div
      ref={root}
      className={styles.page}
      onKeyDownCapture={(e) => {
        if (!SELECTION_KEYS.has(e.key)) flushUrl()
        else if (e.key.startsWith('Arrow') && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) onArrowKey(e.key)
      }}
      onClickCapture={flushUrl}
      onFocus={(e) => {
        scrollAfterArrow(e.target)
        // Dialogs are portals: their focus bubbles here through React but is not on the page (no dimming then).
        if (!root.current?.contains(e.target)) setFocusIn('none')
        else setFocusIn(stripBox.current?.contains(e.target) ? 'strip' : 'other')
      }}
      onBlur={(e) => {
        if (!root.current?.contains(e.relatedTarget as Node | null)) setFocusIn('none')
      }}
    >
      <div ref={topBox} className={styles.top} data-focus-scroll-anchor>
        <div
          className={styles.tabs}
          onContextMenu={tabLongPress.wrapContextMenu(onTabContextMenu)}
          onFocus={onTabsFocus}
          onPointerDown={(e) => {
            pressedTab.current = e.target as HTMLElement
            tabLongPress.onPointerDown(e)
          }}
          onPointerMove={tabLongPress.onPointerMove}
          onPointerUp={tabLongPress.onPointerUp}
          onPointerCancel={tabLongPress.onPointerCancel}
        >
          <TabRow tabs={tabs} selectedKey={pos ? String(pos.seasonIndex) : null} onSelect={selectSeason} label={t('tv_seasons')} />
        </div>
        <div className={styles.title}>
          <TitleOrLogo title={series.Name} logoSrc={logo} showLogo={showLogos} dir="auto" />
        </div>
        {!compact && header}
        <div
          ref={stripBox}
          className={styles.strip}
          onPointerEnter={(e) => e.pointerType === 'mouse' && setStripHover(true)}
          onPointerLeave={() => setStripHover(false)}
        >
          {stripContent}
        </div>
        {compact && header}
        {focused && (
          <DetailPlayButtons
            key={focused.Id}
            item={focused}
            className={styles.footer}
            onPlay={(ms) => play(focused, ms)}
            trailers={null}
            canDelete={canDelete}
            onConfirmDelete={() => void actions.deleteItem(focused)}
            navigate={(p) => go.to(p)}
            onWatchedToggled={() => pos && strip.current?.focusIndex(Math.min(pos.episode, (total ?? 1) - 1))}
            onMore={() =>
              menu.open(focused, null, {
                showGoTo: false,
                showStreamChoices: true,
                chosenSourceId: chosen?.source.Id,
                canClearChosenStreams: hasSavedChoices(chosen),
              })
            }
          />
        )}
      </div>
      <div key={people.length > 0 ? 'people' : 'none'} className={styles.people}>
        <PeopleRow people={castAndCrew} favorites={undefined} withMenu={false} title={t('cast_and_crew')} focusPrefix="cast" restoreKey={`series-cast:${focusedId}`} />
        <PeopleRow people={guestStars} favorites={undefined} withMenu={false} title={t('guest_stars')} focusPrefix="guests" restoreKey={`series-guests:${focusedId}`} />
      </div>
      <ExtrasRow extras={extras} restoreKey={`series-extras:${pos?.seasonId ?? ''}`} />
      {menu.element}
    </div>
  )
}
