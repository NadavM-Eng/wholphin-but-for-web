import { useEffect, useState } from 'react'

/**
 * Height (CSS px) of the part of the layout viewport covered by an on-screen keyboard, from the
 * VisualViewport API (Chrome Android / iOS Safari shrink only the visual viewport by default).
 * Setup dialogs add it as bottom margin so they re-centre above the keyboard instead of under it.
 */
export function useKeyboardInset(enabled = true): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = typeof window === 'undefined' ? undefined : window.visualViewport
    if (!enabled || !vv) return
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop
      // Ignore pinch zoom and browser chrome jitter; a keyboard is much taller than 80px.
      setInset(covered > 80 ? Math.round(covered) : 0)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [enabled])
  return inset
}

/** Keeps a focused field inside its scrolling dialog visible (after the keyboard animation). */
export function revealOnFocus(e: { target: EventTarget }) {
  const el = e.target
  if (!(el instanceof HTMLElement) || !el.matches('input, textarea')) return
  setTimeout(() => el.scrollIntoView({ block: 'nearest' }), 300)
}
