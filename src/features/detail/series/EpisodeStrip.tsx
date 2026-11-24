import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useVirtualizer } from '@tanstack/react-virtual'
import clsx from 'clsx'
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type Ref } from 'react'
import { nav } from '../../../app/nav'
import { useDp } from '../../../theme/scale'
import { BannerCard, MaterialIcon, lastInputWasTouch, observeResize } from '../../../ui'
import { installDragScroll } from '../../../ui/lib/dragScroll'
import { installWheelScroll } from '../../../ui/lib/wheelScroll'
import { useCardContext } from '../../common/cardAdapters'
import { isHoverPointer, useHoverIntent } from '../../common/hoverIntent'
import { episodeCornerText } from '../../common/itemText'
import { resumeMs } from '../../common/itemMenu'
import type { ItemContextMenu } from '../../common/useItemContextMenu'
import { useTranslate } from '../../common/useTranslate'
import styles from './EpisodeStrip.module.css'
import type { EpisodeList } from './seriesQueries'
import { EPISODE_CARD_HEIGHT, episodeAspect } from './stripLayout'

const GAP = 16
const SWIPE_SETTLE_MS = 150

export type EpisodeStripHandle = {
  /** Moves keyboard focus to the card at `index` (scrolling it into view first). */
  focusIndex: (index: number) => void
}

type Props = {
  list: EpisodeList
  total: number
  selected: number
  onSelect: (index: number) => void
  onPlay: (ep: BaseItemDto) => void
  menu: ItemContextMenu
  /** Chosen media source of the selected episode (its menu's stream entries). */
  chosenSourceId: string | null | undefined
  canClearChosenStreams: boolean
  /** Non-selected cards at 40% (focus is on the page but not on the strip). */
  dimmed: boolean
  /** Changes when a new list is shown: the selected card is scrolled to the start. */
  listKey: string
  /** Down from a card: the page moves focus itself (to the buttons' first entry) and returns true. */
  onArrowDown?: () => boolean
  ref?: Ref<EpisodeStripHandle>
}

/**
 * The episode strip of the series overview (W/ui/detail/series/SeriesOverviewContent.kt:229-310): a LazyRow of
 * `BannerCard`s 120dp tall, 16dp apart with 16dp side padding, the episode's Primary image (not the series'),
 * the episode name when there is no image, watched check + "E3" pill, progress bar, no favorite heart.
 * Non-selected cards sit on black and fade to 40% while focus is elsewhere on the page.
 *
 * Web input: keyboard focus selects at once and Left / Right move along the strip; a mouse hover selects after
 * a short intent delay and a click plays (upstream click = play); the mouse also moves the strip, by holding and
 * pulling it sideways (the click that ends such a pull plays nothing) and by turning the wheel over it (at either
 * end of the strip the wheel scrolls the page again); on touch screens a tap on another card
 * selects it, a tap on the selected card plays, and a swipe selects the first card fully in view.
 */
export function EpisodeStrip({ list, total, selected, onSelect, onPlay, menu, chosenSourceId, canClearChosenStreams, dimmed, listKey, onArrowDown, ref }: Props) {
  const { t, locale } = useTranslate()
  const ctx = useCardContext()
  const dp = useDp()
  const scroller = useRef<HTMLDivElement>(null)
  // Known before the first layout: the initial scroll to the selected card depends on it.
  const [rtl, setRtl] = useState(() => typeof document !== 'undefined' && getComputedStyle(document.documentElement).direction === 'rtl')
  const [edges, setEdges] = useState({ start: true, end: true })
  // Keyboard focus inside the strip, or a mouse over it: the cards show their own focus / hover state.
  const [focusInside, setFocusInside] = useState(false)
  const [mouseOver, setMouseOver] = useState(false)
  // At rest (nothing in the strip focused or hovered, focus not elsewhere on the page) the selected card is drawn
  // focused, as the TV opens with it focused (RequestOrRestoreFocus): it marks which card the header describes.
  const restMarker = !focusInside && !mouseOver && !dimmed
  // Mouse hover selects the card after the shared intent delay (the TV has no hover; focus moves deliberately).
  const hover = useHoverIntent<number>()
  const swipeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  })

  useLayoutEffect(() => {
    if (scroller.current) setRtl(getComputedStyle(scroller.current).direction === 'rtl')
  }, [])

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: total,
    horizontal: true,
    isRtl: rtl,
    getScrollElement: () => scroller.current,
    estimateSize: (i) => dp(EPISODE_CARD_HEIGHT * episodeAspect(list.peek(i))),
    gap: dp(GAP),
    paddingStart: dp(GAP),
    paddingEnd: dp(GAP),
    scrollPaddingStart: dp(GAP),
    scrollPaddingEnd: dp(GAP),
    overscan: 4,
  })

  // A new list (season change, first load): the selected card starts the row (rememberLazyListState(index)).
  const hasItems = total > 0
  useLayoutEffect(() => {
    if (hasItems) virtualizer.scrollToIndex(Math.min(selected, total - 1), { align: 'start' })
    // only when the list changes, not on every selection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey, hasItems])

  const cardAt = (index: number) => scroller.current?.querySelector<HTMLElement>(`[data-ep-index="${index}"] [data-card-surface]`) ?? null

  const focusIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= total) return
      virtualizer.scrollToIndex(index, { align: 'auto' })
      // Neighbours are rendered (overscan): focus at once, so fast key repeats each move one card.
      const now = cardAt(index)
      if (now) {
        now.focus({ preventScroll: true })
        return
      }
      let tries = 0
      const attempt = () => {
        const el = cardAt(index)
        if (el) el.focus({ preventScroll: true })
        else if (tries++ < 10) requestAnimationFrame(attempt)
      }
      requestAnimationFrame(attempt)
    },
    [total, virtualizer],
  )
  useImperativeHandle(ref, () => ({ focusIndex }), [focusIndex])

  const updateEdges = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const pos = Math.abs(el.scrollLeft)
    const start = pos <= 1
    const end = pos >= el.scrollWidth - el.clientWidth - 1
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
  }, [])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onScroll = () => {
      updateEdges()
      if (!lastInputWasTouch()) return
      // Swipe: the first card fully in view becomes the selected one once the row settles.
      clearTimeout(swipeTimer.current)
      swipeTimer.current = setTimeout(() => {
        const box = el.getBoundingClientRect()
        const cards = Array.from(el.querySelectorAll<HTMLElement>('[data-ep-index]')).sort((a, b) => Number(a.dataset.epIndex) - Number(b.dataset.epIndex))
        const first = cards.find((c) => {
          const r = c.getBoundingClientRect()
          return rtl ? r.right <= box.right + 1 : r.left >= box.left - 1
        })
        if (first) onSelectRef.current(Number(first.dataset.epIndex))
      }, SWIPE_SETTLE_MS)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    const stopObserving = observeResize(el, updateEdges)
    // mouse: hold and pull the strip sideways, or turn the wheel over it (owner request)
    const stopDrag = installDragScroll(el)
    const stopWheel = installWheelScroll(el)
    return () => {
      el.removeEventListener('scroll', onScroll)
      stopObserving()
      stopDrag()
      stopWheel()
      clearTimeout(swipeTimer.current)
    }
  }, [rtl, updateEdges])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (e.key === 'ArrowDown') {
      if (onArrowDown?.()) e.preventDefault()
      return
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const card = (e.target as HTMLElement).closest<HTMLElement>('[data-ep-index]')
    if (!card) return
    const from = Number(card.dataset.epIndex)
    const forward = (e.key === 'ArrowRight') !== rtl
    const to = from + (forward ? 1 : -1)
    // At the ends the key falls through to the global spatial navigation (e.g. Left to the nav drawer).
    if (to < 0 || to >= total) return
    e.preventDefault()
    focusIndex(to)
  }

  const page = (dir: 1 | -1) => {
    const el = scroller.current
    if (!el) return
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: dir * (rtl ? -1 : 1) * el.clientWidth * 0.8, behavior: smooth ? 'smooth' : 'auto' })
  }

  const height = dp(EPISODE_CARD_HEIGHT)
  return (
    <div className={styles.viewport}>
      <div
        ref={scroller}
        className={styles.scroller}
        onKeyDown={onKeyDown}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse' || e.pointerType === 'pen') setMouseOver(true)
        }}
        onPointerLeave={() => setMouseOver(false)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusInside(false)
        }}
        onFocus={(e) => {
          setFocusInside(true)
          const card = (e.target as HTMLElement).closest<HTMLElement>('[data-ep-index]')
          if (!card) return
          const index = Number(card.dataset.epIndex)
          // Coming into the strip with the keyboard lands on the selected card (upstream focusRestorer).
          const fromOutside = !e.currentTarget.contains(e.relatedTarget as Node | null)
          if (fromOutside && index !== selected && (e.target as HTMLElement).matches(':focus-visible') && cardAt(selected)) {
            cardAt(selected)?.focus({ preventScroll: true })
            virtualizer.scrollToIndex(selected, { align: 'auto' })
            return
          }
          if (!lastInputWasTouch()) onSelect(index)
        }}
      >
        <div className={styles.track} style={{ width: `${virtualizer.getTotalSize()}px`, height: `${height}px` }}>
          {virtualizer.getVirtualItems().map((v) => {
            const ep = list.get(v.index)
            const isSelected = v.index === selected
            const aspect = episodeAspect(ep)
            if (!ep) {
              return (
                <div key={v.key} data-index={v.index} ref={virtualizer.measureElement} className={styles.item} style={{ insetInlineStart: `${v.start}px` }}>
                  <div className={styles.placeholder} style={{ width: `${dp(EPISODE_CARD_HEIGHT * aspect)}px`, height: `${height}px` }} />
                </div>
              )
            }
            const href = nav.play(ep.Id ?? '', { t: resumeMs(ep) })
            const actions = menu.cardActions(ep, {
              showGoTo: false,
              showStreamChoices: true,
              chosenSourceId: isSelected ? chosenSourceId : undefined,
              canClearChosenStreams: isSelected && canClearChosenStreams,
            })
            return (
              <div
                key={v.key}
                data-index={v.index}
                data-ep-index={v.index}
                data-focus-key={`episode:${ep.Id}`}
                data-demo-focus={isSelected && restMarker ? '' : undefined}
                ref={virtualizer.measureElement}
                className={clsx(styles.item, !isSelected && styles.unselected, !isSelected && dimmed && styles.dimmed)}
                style={{ insetInlineStart: `${v.start}px` }}
                onPointerEnter={(e) => {
                  if (isHoverPointer(e)) hover.over(v.index, () => onSelectRef.current(v.index))
                }}
                onPointerLeave={() => hover.leave()}
                onKeyUp={(e) => {
                  // Media Play key on a card plays it (isPlayKeyUp).
                  if (e.key === 'MediaPlayPause' || e.key === 'MediaPlay') onPlay(ep)
                }}
              >
                <BannerCard
                  name={ep.Name}
                  label={ep.Name ?? ''}
                  imageSrc={ctx.image(ep, 'Primary', { heightDp: EPISODE_CARD_HEIGHT, useSeries: false })}
                  cornerText={episodeCornerText(t, ep, locale)}
                  played={ep.UserData?.Played ?? false}
                  playedPercent={ep.UserData?.PlayedPercentage ?? 0}
                  height={EPISODE_CARD_HEIGHT}
                  aspectRatio={aspect}
                  fit="fill"
                  href={href}
                  surfaceProps={{ 'data-focus-default': isSelected ? true : undefined, 'aria-current': isSelected ? 'true' : undefined }}
                  onClick={(e: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
                    if ('button' in e && e.button !== 0) return
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                    e.preventDefault()
                    if (lastInputWasTouch() && !isSelected) onSelect(v.index)
                    else onPlay(ep)
                  }}
                  {...actions}
                />
              </div>
            )
          })}
        </div>
      </div>
      {!edges.start && (
        <button type="button" tabIndex={-1} aria-label={t('web_previous')} className={clsx(styles.arrow, styles.prev)} onClick={() => page(-1)}>
          <MaterialIcon name="chevron_left" size={28} className={styles.arrowIcon} />
        </button>
      )}
      {!edges.end && (
        <button type="button" tabIndex={-1} aria-label={t('web_next')} className={clsx(styles.arrow, styles.next)} onClick={() => page(1)}>
          <MaterialIcon name="chevron_right" size={28} className={styles.arrowIcon} />
        </button>
      )}
    </div>
  )
}
