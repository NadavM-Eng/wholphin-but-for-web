import { bringIntoView } from '../../ui/lib/bringIntoView'
import { lastInput, noInputYet } from '../../ui/lib/inputModality'
import { fullyInView } from './pickVisibleCell'

/** As long as the shell's focus restore keeps trying (useFocusRestore RESTORE_MS). */
const WATCH_MS = 2500
const USER_INPUT = ['keydown', 'pointerdown', 'wheel', 'touchstart'] as const

/** The window less the room the body keeps for a fixed bar at the bottom (the music mini player). */
function windowView() {
  const pad = parseFloat(getComputedStyle(document.body).paddingBottom)
  const reserve = Number.isFinite(pad) && pad > 0 && pad < window.innerHeight / 2 ? pad : 0
  return { top: 0, bottom: window.innerHeight - reserve }
}

/**
 * The page may move by itself: the keyboard acted last, or the user has not acted on this document at all (a
 * reload, an address opened). After a mouse or touch press (Back to the grid from a card that was opened with a
 * click, cut by the window's edge or not) the window stays where the user left it.
 */
function mayScroll(): boolean {
  return lastInput() === 'keyboard' || noInputYet()
}

function reveal(el: Element | null, root: HTMLElement) {
  if (!mayScroll()) return
  if (!(el instanceof HTMLElement) || !root.contains(el) || !el.closest('[data-grid-index]')) return
  if (!fullyInView(el.getBoundingClientRect(), windowView())) bringIntoView(el)
}

/**
 * After a reload or Back restored a window-scrolled grid: whichever card takes focus without the user acting
 * (the page's own pick, or the remembered card the shell puts back) is brought fully into view if the restored
 * scroll cut it, unless a pointer acted last (mayScroll). Ends at the user's first input or after the shell's
 * restore window.
 */
export function watchRestoredFocus(root: HTMLElement): void {
  const onFocus = (e: FocusEvent) => reveal(e.target as Element | null, root)
  const stop = () => {
    clearTimeout(timer)
    root.removeEventListener('focusin', onFocus)
    for (const t of USER_INPUT) window.removeEventListener(t, stop, { capture: true })
  }
  const timer = setTimeout(stop, WATCH_MS)
  root.addEventListener('focusin', onFocus)
  for (const t of USER_INPUT) window.addEventListener(t, stop, { capture: true, passive: true })
  reveal(document.activeElement, root)
}
