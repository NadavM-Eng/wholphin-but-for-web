import { useLayoutEffect, useState, type RefObject } from 'react'
import { observeResize } from '../../ui'
import { heightBelow } from '../browse/components/fitViewport'

/**
 * Height that makes `ref` reach the bottom of the window from where it starts, for TV-style pages with a
 * fixed header and an inner scrolling list (a CSS length, see `heightBelow`). Returns null when `enabled` is false
 * (normal page flow).
 */
export function useFillViewport(ref: RefObject<HTMLElement | null>, enabled: boolean): string | null {
  const [height, setHeight] = useState<string | null>(null)
  useLayoutEffect(() => {
    if (!enabled) {
      setHeight(null)
      return
    }
    const el = ref.current
    if (!el) return
    const update = () => {
      setHeight(heightBelow(el.getBoundingClientRect().top + window.scrollY, 200))
    }
    update()
    window.addEventListener('resize', update)
    const watched: Element[] = el.parentElement ? [el.parentElement] : []
    // Anything above `el` that changes height (the Discover tab strip collapsing, SE-15) moves its top.
    for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
      for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) watched.push(sib)
    }
    const stopObserving = observeResize(watched, update)
    return () => {
      window.removeEventListener('resize', update)
      stopObserving()
    }
  }, [ref, enabled])
  return height
}

/** TV-style layout (fixed header, inner scroller) only where there is a pointer to hover and room for it. */
export const TV_LAYOUT_QUERY = '(hover: hover) and (min-height: 560px) and (min-width: 700px)'

export function useMediaQuery(query: string): boolean {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches
  const [matches, setMatches] = useState(get)
  useLayoutEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}
