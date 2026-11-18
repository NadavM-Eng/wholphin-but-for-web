import { useCallback, useEffect, useRef } from 'react'
import { useLocation } from 'react-router'

// Scroll positions per history entry (location.key) and container key. Kept in sessionStorage so a
// reload of the tab keeps them, like the browser does for the window.
const STORAGE_KEY = 'wholphin.scroll.v1'
const MAX_ENTRIES = 200

type Saved = Record<string, { x: number; y: number }>

function load(): Saved {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}') as Saved
  } catch {
    return {}
  }
}

let cache: Saved | null = null
function positions(): Saved {
  cache ??= load()
  return cache
}

function save(key: string, x: number, y: number) {
  const all = positions()
  delete all[key]
  all[key] = { x, y }
  const keys = Object.keys(all)
  for (let i = 0; i < keys.length - MAX_ENTRIES; i++) delete all[keys[i]]
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // ignore
  }
}

/**
 * Remembers and restores the scroll position of a nested scroll container for the current history entry,
 * so Back returns to where the user was (window scrolling is handled by <ScrollRestoration/>).
 *
 *   const ref = useScrollRestore('grid')
 *   <div ref={ref} style={{ overflow: 'auto' }}>…</div>
 *
 * Content that loads asynchronously: the position is re-applied until the container is tall enough
 * (up to ~2 s), so virtualized lists can restore once their data arrives.
 */
export function useScrollRestore<T extends HTMLElement = HTMLElement>(key: string) {
  const location = useLocation()
  const storeKey = `${location.key}:${key}`
  const elRef = useRef<T | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  const ref = useCallback(
    (el: T | null) => {
      cleanupRef.current?.()
      cleanupRef.current = null
      elRef.current = el
      if (!el) return
      const target = positions()[storeKey]
      let raf = 0
      let tries = 0
      let restoring = !!target
      const stop = () => {
        restoring = false
        cancelAnimationFrame(raf)
      }
      const apply = () => {
        if (!target || !restoring) return
        el.scrollTo(target.x, target.y)
        const done = Math.abs(el.scrollTop - target.y) < 2 && Math.abs(el.scrollLeft - target.x) < 2
        if (!done && tries++ < 120) raf = requestAnimationFrame(apply)
        else restoring = false
      }
      apply()
      const userEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const
      userEvents.forEach((ev) => el.addEventListener(ev, stop, { passive: true }))
      let pending = 0
      const onScroll = () => {
        if (restoring || pending) return
        pending = window.setTimeout(() => {
          pending = 0
          save(storeKey, el.scrollLeft, el.scrollTop)
        }, 100)
      }
      el.addEventListener('scroll', onScroll, { passive: true })
      cleanupRef.current = () => {
        cancelAnimationFrame(raf)
        userEvents.forEach((ev) => el.removeEventListener(ev, stop))
        if (pending) {
          clearTimeout(pending)
          save(storeKey, el.scrollLeft, el.scrollTop)
        }
        el.removeEventListener('scroll', onScroll)
      }
    },
    [storeKey],
  )

  useEffect(() => () => cleanupRef.current?.(), [])
  return ref
}
