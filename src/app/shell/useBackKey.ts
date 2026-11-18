import { useContext, useEffect, useRef } from 'react'
import { UNSAFE_DataRouterContext, useLocation } from 'react-router'
import { useGoBack } from './useGoBack'

/** Keys that act as the TV remote's Back: Escape, and the Back key of TV browsers. */
const BACK_KEYS = new Set(['Escape', 'GoBack', 'XF86Back'])

function isTyping(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'image', 'color', 'file'].includes(el.type)
  }
  return false
}

/** An open dialog, menu or listbox owns Escape. */
function overlayOpen(): boolean {
  return !!document.querySelector(
    '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], dialog[open], [data-focus-trap]:not([data-shell-trap])',
  )
}

/**
 * A Back key pressed while a navigation was on its way: the `location.key` that navigation ends in. Module state:
 * the layout that took the key may be gone when the navigation lands.
 */
let queuedBackFor: string | null = null

/** Test hook. */
export function resetBackKeyForTests() {
  queuedBackFor = null
}

/**
 * Global Back key. Runs after page handlers (window, bubble phase), so a page that handles Escape itself
 * calls preventDefault() and wins. `intercept` gets first say (the shell: close the drawer, open it on
 * Home); otherwise it goes back in history. Browser Back (button, gesture, BrowserBack key) is native history.
 *
 * On the TV a navigation is done before the next key is handled, so Back right after OK on a card returns from
 * the page that was just opened. Here the page's module may still be loading and the URL unchanged: Back then
 * would act on the page being left (go back past it, or open the drawer on Home under the arriving page) and
 * cancel the navigation. Such a Back waits for the navigation and is handled on the page it opens.
 *
 * The same holds for the moment after the router is through and before React shows the new page (the router's
 * state update is a transition): the address is the new one, the handlers are still the old page's. On Home that
 * was the Home rule (Back in the drawer returns to the page), which took a Back meant for the page being opened.
 */
export function useBackKey(intercept?: () => boolean) {
  const goBack = useGoBack()
  // the router itself: its state is ahead of what React has rendered (useNavigation lags by a transition)
  const router = useContext(UNSAFE_DataRouterContext)?.router
  const locationKey = useLocation().key
  const ref = useRef(intercept)
  /** The location whose page (and `intercept`) is the one on screen. */
  const shownKey = useRef(locationKey)
  useEffect(() => {
    ref.current = intercept
    shownKey.current = locationKey
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!BACK_KEYS.has(e.key) || e.defaultPrevented || e.repeat) return
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (isTyping(document.activeElement) || overlayOpen()) return
      e.preventDefault()
      const state = router?.state
      if (state && state.navigation.state !== 'idle') {
        queuedBackFor = state.navigation.location.key
        return
      }
      if (state && state.location.key !== shownKey.current) {
        queuedBackFor = state.location.key
        return
      }
      if (ref.current?.()) return
      goBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goBack, router])
  // After the effect that refreshes `ref`: the page that shows now answers. A Back whose navigation never
  // landed (another one took its place) is dropped.
  useEffect(() => {
    if (queuedBackFor == null || (router && router.state.navigation.state !== 'idle')) return
    const mine = queuedBackFor === locationKey
    queuedBackFor = null
    if (!mine || ref.current?.()) return
    goBack()
  }, [locationKey, goBack, router])
}
