// DOM-level focus plumbing shared by the drawer and the shell: input modality, drawer entry/exit,
// moving focus into the page after a drawer navigation.
import { bringIntoView } from '../../ui/lib/bringIntoView'
import { installInputModality, lastInput, lastPointerType } from '../../ui/lib/inputModality'
import { focusFirst } from '../spatialNav'

let installed = false

const els: { drawer: HTMLElement | null; content: HTMLElement | null; page: HTMLElement | null } = {
  drawer: null,
  content: null,
  page: null,
}
let lastContentFocus: HTMLElement | null = null
/**
 * The placeholder focusPageWhenReady put focus on (the page's top-start element), or the mini player entry an
 * arrow key from a page with nothing to focus was given (focusBarBelowPage); the page's own first focus may
 * replace it. Forgotten when focus moves off it, on a pointer press, and on a key press other than an arrow or a
 * modifier (typing into it, activating it).
 */
let arrivalFocus: Element | null = null
/**
 * A page opened from the drawer with the keyboard is on its way:
 *   'pending'  from the activation of the drawer entry until the shell's first look at the new page (the frame
 *              after the navigation is through). The page on screen may still be the one being left (the next
 *              page's module is loading); focus is still in the drawer.
 *   'landing'  the shell has looked and the page had nothing to focus yet (loading): focus is parked on the page
 *              area until the page's first element takes it.
 * Ended by focus landing on an element (the page's first, or the drawer when the user asks for it) and by a
 * pointer press. Key presses do not end it: a key pressed a few milliseconds after Enter must not decide where
 * the page's first focus goes.
 */
let arrival: 'pending' | 'landing' | null = null
/** Only the newest focusPageWhenReady keeps looking. */
let arrivalRun = 0
let pendingSince = 0
/**
 * A navigation that never lands (a history entry the drawer's plan counted on is gone) must not take the
 * toward-page key for good: after this long the keys work as without an arrival.
 */
const PENDING_KEYS_MAX_MS = 10_000
/** The page on screen is being left: keys that would move focus into it are taken instead. */
const leavingPage = () => arrival === 'pending' && performance.now() - pendingSince < PENDING_KEYS_MAX_MS

/** Keys that leave the placeholder for the page to replace (an arrow that moves focus is seen as a focus change). */
const PLACEHOLDER_KEEPING_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock'])

/**
 * Installs the app-wide input modality tracker (src/ui/lib/inputModality.ts: highlight owner, last input,
 * opener) plus the shell's own bookkeeping (last focus inside the page, arrival focus).
 */
export function installModalityTracking() {
  if (installed || typeof window === 'undefined') return
  installed = true
  installInputModality()
  window.addEventListener(
    'keydown',
    (e) => {
      // an arrow key that moves nothing (Down from the tab row while the cards are still loading) leaves the
      // placeholder in place; typing into it or activating it makes it the user's own focus
      if (!PLACEHOLDER_KEEPING_KEYS.has(e.key)) arrivalFocus = null
    },
    true,
  )
  window.addEventListener(
    'pointerdown',
    (e) => {
      arrivalFocus = null
      arrival = null
      // Safari does not focus links and buttons on click: remember the pressed element as the page's last
      // focus too, so leaving the drawer with the keyboard returns to what was clicked.
      const hit = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-focusable]') : null
      if (hit && els.content?.contains(hit)) lastContentFocus = hit
    },
    true,
  )
  document.addEventListener(
    'focusin',
    (e) => {
      const t = e.target
      if (t !== arrivalFocus) arrivalFocus = null
      // the page area itself is where a landing waits; anything else that takes focus ends it
      if (arrival === 'landing' && t !== els.page) arrival = null
      // <main> is only where focusPageWhenReady parks focus on a page with nothing focusable: not a place to
      // return to from the drawer (focusContentFromDrawer then looks for the page's first element)
      if (t instanceof HTMLElement && t !== els.page && els.content?.contains(t)) lastContentFocus = t
    },
    true,
  )
}

/** The last interaction was the keyboard (focus-within only opens the drawer then). */
export const isKeyboardModality = () => lastInput() === 'keyboard'
/** pointerType of the last pointer press ('mouse', 'pen', 'touch'). */
export const lastPointer = () => lastPointerType()

/** drawer = the nav drawer; content = the page area incl. the Back button (focus trap); page = the routed page only */
export function registerShellElement(kind: 'drawer' | 'content' | 'page', el: HTMLElement | null) {
  els[kind] = el
}

export const drawerEl = () => els.drawer
export const contentEl = () => els.content

function usable(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement) || !el.isConnected) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

/**
 * Keyboard entry into the drawer (NavDrawer.kt focusProperties.onEnter / Back on Home): the selected item,
 * the "More" row when the selection is hidden under it, else the first item.
 */
export function focusDrawerEntry(): boolean {
  const d = els.drawer
  if (!d) return false
  const target = d.querySelector('[data-focus-target]') ?? d.querySelector('[data-focusable]')
  if (!usable(target)) return false
  target.focus({ preventScroll: true })
  target.scrollIntoView({ block: 'nearest' })
  return true
}

/** Focus back on the last focused element when it is still shown inside `scope` and takes focus. */
function restoreLastFocus(scope: HTMLElement | null, scroll = true): boolean {
  const el = lastContentFocus
  if (!scope || !usable(el) || !scope.contains(el)) return false
  el.focus({ preventScroll: true })
  // a button that was disabled since does not take it
  if (document.activeElement !== el) return false
  // scrolled like every other keyboard focus move (spatialNav focusEl): to the pivot, and clear of the room the
  // body keeps for the music mini player, which a native scrollIntoView does not know about
  if (scroll) bringIntoView(el)
  return true
}

/**
 * Leaving the drawer to the right: back to where focus was in the page, else the page's first element. While a
 * page opened from the drawer is still on its way the key is taken and nothing moves: the page on screen is the
 * one being left, and focus goes into the new page as soon as it shows.
 */
export function focusContentFromDrawer(): boolean {
  if (leavingPage()) return true
  return restoreLastFocus(els.content) || (els.page ? focusFirst(els.page) : false)
}

/**
 * An arrow key while nothing is focused (<body>, or the page area itself after a click on empty space): focus
 * returns to where it last was in the routed page while that element is still there (upstream: focusRestorer on
 * every row and grid hands focus back to the last focused child), else to the page's first element. The shell's
 * own Back button is not a place to return to here. `scroll: false` when no key asked for it (focus given back
 * after its element went away): the page stays where it is.
 */
export function focusPageFromNowhere(scroll = true): boolean {
  return restoreLastFocus(els.page, scroll) || (els.page ? focusFirst(els.page, scroll) : false)
}

/** The music mini player (src/features/music/MiniPlayer.tsx): a bar under the page, outside the shell's tree. */
const BAR = '[data-mini-player]'

/**
 * The routed page shows its final state: some text (an empty-state or error message) and no loading mark. Every
 * loading state carries aria-busy (LoadingPage, CircularProgress); a page that renders nothing at all is on its
 * way somewhere else (a redirect whose target is still loading).
 */
function pageSettled(): boolean {
  const p = els.page
  return !!p && !!p.textContent?.trim() && !p.querySelector('[aria-busy="true"]')
}

/**
 * Into the bar under the page. Like the placeholder of an arrival, this focus is the page's to replace until the
 * user acts on it: should the page show content after all, its first focus still lands there.
 */
function focusBarBelowPage(): boolean {
  const first = Array.from(document.querySelectorAll<HTMLElement>(`${BAR} [data-focusable]`)).find(usable)
  if (!first) return false
  first.focus({ preventScroll: true })
  if (document.activeElement !== first) return false
  arrivalFocus = first
  return true
}

/**
 * Up in the mini player that moved nothing (the bar's own handler runs first and returns to the element it was
 * entered from): the page's last or first element, else the page area itself, where the arrow keys work as with
 * nothing focused. True when focus left the bar.
 */
export function leaveBarToPage(): boolean {
  const page = els.page
  if (!page || !document.activeElement?.closest(BAR)) return false
  if (focusPageFromNowhere()) return true
  page.focus({ preventScroll: true })
  return document.activeElement === page
}

/**
 * The shell's answer to an arrow key pressed while nothing is focused; true when the key was taken.
 * The page's last focused element, else its first (focusPageFromNowhere). A page with nothing to focus (still
 * loading, an empty result, an error, a stub) leaves only the drawer, and only the key that points at it goes
 * there: any other arrow key is taken and nothing moves, so the first focus of a page that is still loading
 * lands in the page when its content shows (it does not take focus out of the drawer). One more way out once
 * such a page has settled (pageSettled): Down (`down`) enters the music mini player when it shows. Without a
 * rail (`rail`: phones) the key is otherwise left to the navigator, which starts from the top bar.
 */
export function focusFromNowhere(towardDrawer: boolean, rail: boolean, down = false): boolean {
  if (leavingPage()) return true
  if (focusPageFromNowhere()) return true
  if (down && pageSettled() && focusBarBelowPage()) return true
  if (!rail) return false
  return towardDrawer ? focusDrawerEntry() : true
}

/**
 * A drawer entry was activated with the keyboard: focus will move into the page it opens (focusPageWhenReady,
 * once the navigation is through). Until then the page may take its first focus itself (mayTakeInitialFocus).
 * The page being left is no place to return to any more.
 */
export function expectPageArrival() {
  arrival = 'pending'
  pendingSince = performance.now()
  arrivalFocus = null
  lastContentFocus = null
}

/** Nothing is on its way any more: the shell is gone (a full-screen page was opened). */
export function endPageArrival() {
  arrivalRun++
  arrival = null
  arrivalFocus = null
}

/**
 * After navigating from the drawer the new page takes focus (upstream: pages request focus on entry,
 * which closes the drawer). Retries for a while because pages load lazily and render data later.
 */
export function focusPageWhenReady(timeoutMs = 2000) {
  const start = performance.now()
  const run = ++arrivalRun
  let parked = false
  const tick = () => {
    if (run !== arrivalRun) return
    const c = els.page
    if (!c) {
      arrival = null
      return
    }
    if (!parked) {
      // The page already took focus itself: its cards were there in its first render (data from the cache), and
      // its own first-focus request ran before this frame (mayTakeInitialFocus allows it while arrival is pending).
      const a = document.activeElement
      if (a instanceof HTMLElement && a !== c && c.contains(a)) {
        arrival = null
        return
      }
    } else if (arrival !== 'landing') {
      // ended meanwhile: the page's own first focus, the user's move into the drawer, a pointer press
      return
    }
    if (focusFirst(c)) {
      arrivalFocus = document.activeElement
      arrival = null
      return
    }
    // Nothing focusable yet (loading, empty, error, stub page): focus leaves the collapsed drawer for the
    // page itself (<main tabIndex=-1>) right away; the page's first element still takes over if it shows
    // up within the timeout, and the page's own first-focus request whenever it comes.
    if (!parked) {
      parked = true
      arrival = 'landing'
      c.focus({ preventScroll: true })
      arrivalFocus = c
    }
    if (performance.now() - start < timeoutMs) requestAnimationFrame(tick)
  }
  arrival = 'pending'
  pendingSince = start
  requestAnimationFrame(tick)
}

/**
 * Whether a page may move focus to its own first element now (upstream pages request focus on their first
 * card once data shows): nothing is focused (<body>, or the page area itself), or only the placeholder focus the
 * shell gave the page on arrival (its top-start element, often the tab row) and the user has not moved on from
 * it. Also while an arrival is under way and focus is still in the drawer: the page was opened from the drawer
 * with the keyboard and the shell moves focus into it in the next frame anyway. (A page that shows its cards in
 * its first render asks in its first effects or the frame after them, before the shell has looked; refused, it
 * never asks again and focus stayed on the tab row.)
 */
export function mayTakeInitialFocus(): boolean {
  const a = document.activeElement
  // <main> itself (parked there by focusPageWhenReady, or a click on empty page space) is no focus to keep
  if (!a || a === document.body || a === els.page || (a === arrivalFocus && a.isConnected)) return true
  return arrival !== null && !!els.drawer?.contains(a)
}
