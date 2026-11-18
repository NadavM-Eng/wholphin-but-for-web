import { useEffect, useRef, useState, type FocusEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { mayTakeInitialFocus } from '../../app/shell'
import { useScrollRestore } from '../../app/useScrollRestore'
import { useDiscoverRow, useGenreSlider, type DiscoverGenre, type DiscoverItem, type DiscoverRowKind } from '../../api/seerr'
import { DiscoverGenreRow } from './DiscoverGenreRow'
import { DiscoverHeader, type DiscoverFocus } from './DiscoverHeader'
import { DiscoverRow } from './DiscoverRow'
import { submitDiscoverBackdrop } from './backdropStore'
import { discoverMoreHref, itemDestinationHref } from './links'
import { isolate } from './seerrText'
import styles from './SeerrDiscoverTab.module.css'
import { TV_LAYOUT_QUERY, useFillViewport, useMediaQuery } from './useFillViewport'

type RowDef = { kind: DiscoverRowKind; titleKey: string }

/** Last focused card per history entry, so Back returns focus where it was (upstream rememberPosition). */
const lastFocus = new Map<string, { row: string; index: string | null }>()

const TRENDING: RowDef = { kind: 'TRENDING', titleKey: 'trending' }
const MOVIES: RowDef = { kind: 'DISCOVER_MOVIES', titleKey: 'movies_title' }
const UPCOMING_MOVIES: RowDef = {
  kind: 'UPCOMING_MOVIES',
  titleKey: 'upcoming_movies',
}
const TV: RowDef = { kind: 'DISCOVER_TV', titleKey: 'tv_shows_title' }
const UPCOMING_TV: RowDef = { kind: 'UPCOMING_TV', titleKey: 'upcoming_tv' }

/**
 * Tab 1 of Discover (`SeerrDiscoverPage`): header for the focused card, then the rows Trending, Movies,
 * Genres in Movies, Upcoming Movies, TV Shows, Genres in TV Shows, Upcoming TV Shows. Rows load in parallel.
 */
export function SeerrDiscoverTab() {
  const { t } = useTranslation()
  const location = useLocation()
  const [focus, setFocus] = useState<DiscoverFocus>(null)
  const tvLayout = useMediaQuery(TV_LAYOUT_QUERY)
  const layoutRef = useRef<HTMLDivElement>(null)
  const height = useFillViewport(layoutRef, tvLayout)
  const scrollRef = useScrollRestore<HTMLDivElement>('discover-rows')

  const trending = useDiscoverRow('TRENDING')
  const movies = useDiscoverRow('DISCOVER_MOVIES')
  const upcomingMovies = useDiscoverRow('UPCOMING_MOVIES')
  const tv = useDiscoverRow('DISCOVER_TV')
  const upcomingTv = useDiscoverRow('UPCOMING_TV')
  const movieGenres = useGenreSlider('movie')
  const tvGenres = useGenreSlider('tv')

  const onItem = (item: DiscoverItem) => {
    setFocus({ kind: 'item', item })
    submitDiscoverBackdrop(`discover_${item.type}_${item.id}`, item.backdropUrl)
  }
  // Each genre row passes its own genre, so the TV row previews TV genre backdrops (upstream
  // SeerrDiscoverPage.kt ROW_GENRES_TV reads movieGenres by mistake).
  const onGenre = (type: 'movie' | 'tv') => (g: DiscoverGenre) => {
    setFocus({
      kind: 'genre',
      title: t(type === 'movie' ? 'genre_movies' : 'genre_tv_shows', {
        p1: isolate(g.name),
      }),
    })
    submitDiscoverBackdrop(`discover_genre_${type}_${g.id}`, g.imageUrl)
  }
  const clearFocus = () => {
    setFocus(null)
    submitDiscoverBackdrop(null, null)
  }

  // Back restores the focused card; the first visit focuses Trending once (keyboard users land on content, as on TV).
  const focusedOnce = useRef(false)
  const loadedCount = [trending, movies, upcomingMovies, tv, upcomingTv, movieGenres, tvGenres].filter((q) => q.data).length
  useEffect(() => {
    if (focusedOnce.current || !trending.data?.length) return
    if (!mayTakeInitialFocus()) {
      focusedOnce.current = true
      return
    }
    const saved = lastFocus.get(location.key)
    const root = layoutRef.current
    let target: HTMLElement | null | undefined
    if (saved) {
      const row = root?.querySelector(`[data-row="${saved.row}"]`)
      if (!row) return // that row has not loaded yet
      target =
        saved.index != null
          ? row.querySelector<HTMLElement>(`[data-card-surface][data-index="${saved.index}"]`)
          : row.querySelector<HTMLElement>('[data-card-surface]:not([data-index])')
    } else if (tvLayout) {
      target = root?.querySelector<HTMLElement>('[data-row="TRENDING"] [data-card-surface]')
    }
    focusedOnce.current = true
    target?.focus({ preventScroll: !!saved })
  }, [trending.data, tvLayout, loadedCount, location.key])

  // Keyboard focus moving into a row brings that row to the top of the list (ScrollToTopBringIntoViewSpec).
  const onRowFocus = (e: FocusEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const row = e.currentTarget.dataset.row ?? ''
    lastFocus.set(location.key, {
      row,
      index: target.getAttribute('data-index'),
    })
    if (target.matches(':focus-visible')) {
      const rowEl = e.currentTarget
      const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
      // After the arrow-key navigator's own scrollIntoView('nearest'), which would cancel a smooth scroll.
      requestAnimationFrame(() =>
        rowEl.scrollIntoView({
          block: 'start',
          behavior: smooth ? 'smooth' : 'auto',
        }),
      )
    }
  }

  const itemRow = (def: RowDef, query: ReturnType<typeof useDiscoverRow>) => (
    <div data-row={def.kind} className={styles.row} onFocus={onRowFocus}>
      <DiscoverRow
        title={t(def.titleKey)}
        query={query}
        hrefOf={itemDestinationHref}
        onActive={onItem}
        viewMoreHref={discoverMoreHref(def.kind)}
        onViewMoreActive={clearFocus}
        restoreKey={`discover-row-${def.kind}`}
      />
    </div>
  )
  const genreRow = (type: 'movie' | 'tv', query: ReturnType<typeof useGenreSlider>) => (
    <div data-row={`GENRES_${type}`} className={styles.row} onFocus={onRowFocus}>
      <DiscoverGenreRow
        title={t('genres_in', {
          p1: t(type === 'movie' ? 'movies_title' : 'tv_shows_title'),
        })}
        query={query}
        onActive={onGenre(type)}
        restoreKey={`discover-genres-${type}`}
        hrefOf={(g) =>
          discoverMoreHref(type === 'movie' ? 'DISCOVER_MOVIES' : 'DISCOVER_TV', {
            filter: { genreIds: [g.id] },
            title: t(type === 'movie' ? 'genre_movies' : 'genre_tv_shows', {
              p1: isolate(g.name),
            }),
            startIndex: 0,
          })
        }
      />
    </div>
  )

  return (
    <div
      ref={layoutRef}
      className={styles.layout}
      style={height != null ? { height } : undefined}
      data-tv-layout={tvLayout || undefined}
    >
      {tvLayout && <DiscoverHeader focus={focus} />}
      <div ref={scrollRef} className={styles.rows}>
        {itemRow(TRENDING, trending)}
        {itemRow(MOVIES, movies)}
        {genreRow('movie', movieGenres)}
        {itemRow(UPCOMING_MOVIES, upcomingMovies)}
        {itemRow(TV, tv)}
        {genreRow('tv', tvGenres)}
        {itemRow(UPCOMING_TV, upcomingTv)}
      </div>
    </div>
  )
}
