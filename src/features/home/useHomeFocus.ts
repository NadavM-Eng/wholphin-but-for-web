// Which card drives the Home header and backdrop, per input type:
//   keyboard  the focused card, immediately; the list scrolls it to 50dp below its top (TV
//             ScrollToTopBringIntoViewSpec) — vertical scroll never happens for pointer input
//   mouse     the hovered card after a short intent delay (no scrolling)
//   touch     the tapped card, or the first fully visible card of the row the user just swiped
import { useEffect, useRef, type RefObject } from 'react'
import { dp } from '../../theme/scale'
import { lastInputWasTouch } from '../../ui'
import { createHoverIntent, isHoverPointer } from '../common/hoverIntent'
import { POS_ATTR } from './homeCardLayout'

export type HomePos = { row: number; col: number }

export const ROW_ATTR = 'data-home-row'
const SWIPE_SETTLE_MS = 150
const USER_SCROLL_EVENTS = ['wheel', 'touchstart', 'pointerdown'] as const

export function parsePos(v: string | null | undefined): HomePos | null {
  const m = v ? /^(\d+):(\d+)$/.exec(v) : null
  return m ? { row: Number(m[1]), col: Number(m[2]) } : null
}

function cardOf(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(`[${POS_ATTR}]`) : null
}

/** Upstream `ScrollToTopBringIntoViewSpec(spaceAbovePx = 50dp)`: room for the row title above the card. */
const SPACE_ABOVE_DP = 50

/**
 * Room left above the focused card. The TV's list is always tall enough for 50dp plus a card; a short window
 * (less the music mini player's reserve, which the list already ends above) is not, so the card moves up just
 * far enough to end at the list's bottom edge, and to the list's top when it is taller than the list.
 */
export function spaceAbove(wanted: number, itemSize: number, viewport: number): number {
  return Math.max(0, Math.min(wanted, viewport - itemSize))
}

/**
 * Smoothly scrolls `container` so the focused element's top sits 50dp below the top of the list
 * (HomePage.kt:353-363). Uses the unscaled box: the 1.1x focus scale (centre origin) is a graphics
 * layer on TV and does not move the bring-into-view rectangle.
 */
export function scrollFocusToTop(container: HTMLElement, target: HTMLElement) {
  const r = target.getBoundingClientRect()
  const top = r.top + (r.height - target.offsetHeight) / 2
  const listTop = container.getBoundingClientRect().top + container.clientTop
  const delta = top - listTop - spaceAbove(dp(SPACE_ABOVE_DP), target.offsetHeight, container.clientHeight)
  if (Math.abs(delta) < 1) return
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
  container.scrollTo({ top: container.scrollTop + delta, behavior: smooth ? 'smooth' : 'auto' })
}

export function useHomeFocus(container: RefObject<HTMLElement | null>, onPosition: (pos: HomePos) => void, enabled: boolean) {
  const cb = useRef(onPosition)
  useEffect(() => {
    cb.current = onPosition
  })

  useEffect(() => {
    const el = container.current
    if (!el || !enabled) return
    const hover = createHoverIntent<string>()
    let swipeTimer: ReturnType<typeof setTimeout> | undefined
    let settleTimer: ReturnType<typeof setTimeout> | undefined

    const emit = (card: HTMLElement | null) => {
      const pos = parsePos(card?.getAttribute(POS_ATTR))
      if (pos) cb.current(pos)
    }

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement
      const card = cardOf(target)
      if (card) emit(card)
      const keyboard = target.matches(':focus-visible') && !lastInputWasTouch()
      if (!keyboard) return
      if (!target.closest(`[${ROW_ATTR}]`)) return
      // after the spatial navigator's own scrollIntoView(nearest)
      requestAnimationFrame(() => scrollFocusToTop(el, target))
      // Fast key repeats interrupt smooth scrolls with instant "nearest" scrolls: settle on the row
      // that holds focus once the keys stop.
      clearTimeout(settleTimer)
      settleTimer = setTimeout(() => {
        const current = document.activeElement
        if (current instanceof HTMLElement && el.contains(current) && current.closest(`[${ROW_ATTR}]`)) scrollFocusToTop(el, current)
      }, 450)
    }

    // The user scrolling the list (wheel, touch, scrollbar) after a key: settling on the focused card would undo
    // that scroll.
    const onUserScroll = () => clearTimeout(settleTimer)

    const onPointerOver = (e: PointerEvent) => {
      if (!isHoverPointer(e)) return
      const card = cardOf(e.target)
      hover.over(card?.getAttribute(POS_ATTR) ?? null, () => emit(card))
    }

    const onPointerOut = (e: PointerEvent) => {
      const next = cardOf(e.relatedTarget)
      if (!next) hover.leave()
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') emit(cardOf(e.target))
    }

    const onScroll = (e: Event) => {
      if (!lastInputWasTouch()) return
      const scroller = e.target
      if (!(scroller instanceof HTMLElement) || scroller === el || !scroller.querySelector(`[${POS_ATTR}]`)) return
      clearTimeout(swipeTimer)
      swipeTimer = setTimeout(() => {
        const left = scroller.getBoundingClientRect()
        const cards = Array.from(scroller.querySelectorAll<HTMLElement>(`[${POS_ATTR}]`))
        const rtl = getComputedStyle(scroller).direction === 'rtl'
        const first = cards.find((c) => {
          const r = c.getBoundingClientRect()
          return rtl ? r.right <= left.right + 1 : r.left >= left.left - 1
        })
        emit(first ?? null)
      }, SWIPE_SETTLE_MS)
    }

    el.addEventListener('focusin', onFocusIn)
    el.addEventListener('pointerover', onPointerOver)
    el.addEventListener('pointerout', onPointerOut)
    el.addEventListener('pointerdown', onPointerDown, { capture: true })
    el.addEventListener('scroll', onScroll, { capture: true, passive: true })
    for (const t of USER_SCROLL_EVENTS) el.addEventListener(t, onUserScroll, { capture: true, passive: true })
    return () => {
      for (const t of USER_SCROLL_EVENTS) el.removeEventListener(t, onUserScroll, { capture: true })
      hover.dispose()
      clearTimeout(swipeTimer)
      clearTimeout(settleTimer)
      el.removeEventListener('focusin', onFocusIn)
      el.removeEventListener('pointerover', onPointerOver)
      el.removeEventListener('pointerout', onPointerOut)
      el.removeEventListener('pointerdown', onPointerDown, { capture: true })
      el.removeEventListener('scroll', onScroll, { capture: true })
    }
  }, [container, enabled])
}
