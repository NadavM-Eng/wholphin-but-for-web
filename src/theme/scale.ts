import { useSyncExternalStore } from 'react'

/**
 * Interface scale. CSS is authored in px where 1px = 1 Android dp; PostCSS rewrites px to rem
 * (16px = 1rem) and the root font size carries the scale, so everything grows together.
 * JS that needs real pixels (virtualizers, canvas) must go through dp()/useDp().
 */
const BASE_ROOT_PX = 16

let userScale = 1
let current = computeScale()
const listeners = new Set<() => void>()

/** Automatic scale by viewport width: the TV app is a 960dp-wide canvas, a desktop window is not. */
function autoScale(width: number): number {
  if (width >= 3200) return 1.75
  if (width >= 2400) return 1.5
  if (width >= 1600) return 1.25
  return 1
}

function computeScale(): number {
  const width = typeof window === 'undefined' ? 1280 : window.innerWidth
  return autoScale(width) * userScale
}

function apply() {
  const next = computeScale()
  if (typeof document !== 'undefined') {
    document.documentElement.style.fontSize = `${BASE_ROOT_PX * next}px`
  }
  if (next !== current) {
    current = next
    listeners.forEach((l) => l())
  }
}

/** Call once at startup. */
export function initScale() {
  apply()
  window.addEventListener('resize', apply)
}

/** User preference multiplier (e.g. 0.8 … 1.5). */
export function setUserScale(multiplier: number) {
  userScale = multiplier
  apply()
}

export function getScale(): number {
  return current
}

/** dp -> device-independent CSS pixels at the current scale. */
export function dp(n: number): number {
  return n * current
}

/** dp -> CSS length string that follows the scale without re-rendering (use for inline styles). */
export function dpCss(n: number): string {
  return `${n / BASE_ROOT_PX}rem`
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Returns a dp->px converter that re-renders the component when the scale changes. */
export function useDp(): (n: number) => number {
  const scale = useSyncExternalStore(subscribe, getScale, () => 1)
  return (n: number) => n * scale
}
