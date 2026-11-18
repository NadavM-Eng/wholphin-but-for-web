// Input modality: which input the user used last, kept in ONE place for the whole app.
//
// 1. One highlight at a time (the TV app only ever has one focused element).
//    The kit draws the TV "focused" look for both keyboard focus (:focus-visible) and mouse hover (:hover).
//    Without coordination a keyboard-focused card and a hovered card both look focused. This tracks which
//    input moved last on <html>:
//      - a real pointer movement (mouse or pen, the cursor's screen position changed) sets `data-pointer`;
//      - any key press (other than a lone modifier) removes it.
//    Kit CSS then shows the focus look only while the keyboard is in charge and the hover look only while
//    the pointer is:
//      :where(:root:not([data-pointer])) .x:focus-visible { ...focused... }
//      :where(:root[data-pointer]) .x:hover { ...focused... }
//    Focus itself never moves on hover, so Tab / arrow navigation continue from the real focus and screen
//    readers are not affected. Touch never sets the attribute (no hover there).
//
// 2. Last input (`lastInput()`, `lastPointerType()`): the last keydown versus the last pointerdown, with its
//    pointerType. Used to tell a keyboard Menu key / touch long-press `contextmenu` from a mouse right-click,
//    and by the shell (the drawer opens on focus-within only for the keyboard). Standard event fields only:
//    no Chromium-only `sourceCapabilities` or `button === -1` guesses.
//
// 3. Opener (`interactionOrigin()`): the element the last pointerdown / keydown happened on. Safari does not
//    focus buttons and links on click, so `document.activeElement` is <body> when a click opens a dialog or
//    menu; overlays use this to know where to put focus back when they close.

const ATTR = 'data-pointer'
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'OS', 'Fn'])

/** A press older than this did not open the overlay (it opened on a timer or a data load). */
const ORIGIN_FRESH_MS = 2000
/** Start-up window in which a first, motionless pointermove is taken for the page appearing under the cursor. */
const SETTLE_MS = 1000

export type InputKind = 'keyboard' | 'pointer'

let installed = false
let input: InputKind = 'pointer'
/** a key or pointer press has reached this document (until then `input` is only its default) */
let pressed = false
let pointerType = 'mouse'
let origin: HTMLElement | null = null
let originAt = 0

/** The nearest element that can take focus (an overlay's opener), else the target itself. */
function focusTarget(t: EventTarget | null): HTMLElement | null {
  if (!(t instanceof Element)) return null
  // A card's "more" button is an affordance of the card (hidden again once the mouse leaves or a key is
  // pressed): the card itself is the opener to return to.
  const card = t.closest('[data-card-scaler]')?.querySelector<HTMLElement>(':scope > [data-card-surface]')
  if (card) return card
  const el = t.closest<HTMLElement>(
    'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"], [data-focusable]',
  )
  return el ?? (t instanceof HTMLElement ? t : null)
}

/** A native contextmenu this soon after the Menu key's own (synthetic) one is the same key press. */
const MENU_KEY_DEDUPE_MS = 600

const isEditable = (el: Element | null) =>
  !!el && (el.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]') || (el as HTMLElement).isContentEditable)

/**
 * The keyboard Menu key (TV: long-press OK / Menu) and Shift+F10 open the focused element's context menu in
 * every engine. Chromium and Firefox on Windows turn them into a `contextmenu` event themselves; WebKit (and
 * Firefox elsewhere) do not, and Mac keyboards have no Menu key at all. So the key itself dispatches a
 * `contextmenu` on the focused element, and a native one that follows the same key press is dropped.
 */
function installMenuKey(doc: Document) {
  let syntheticAt = -Infinity
  doc.addEventListener(
    'keydown',
    (e) => {
      const menuKey = e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey)
      if (!menuKey || e.defaultPrevented) return
      const target = doc.activeElement
      if (!(target instanceof HTMLElement) || target === doc.body || isEditable(target)) return
      e.preventDefault()
      syntheticAt = performance.now()
      const r = target.getBoundingClientRect()
      target.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, composed: true, button: 2, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }),
      )
    },
    false,
  )
  doc.addEventListener(
    'contextmenu',
    (e) => {
      if (e.isTrusted && performance.now() - syntheticAt < MENU_KEY_DEDUPE_MS && lastInput() === 'keyboard') {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    },
    true,
  )
}

const PRESSABLE =
  'button:not(:disabled), a[href], [role="button"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [role="switch"], [data-focusable]'

/**
 * Safari (WebKit) does not focus buttons and links on click: a press blurs whatever had focus and focuses the
 * nearest focusable ancestor instead (here `<main tabIndex=-1>`), or nothing. Controls that change size with
 * focus (the expanding toolbar pills) then shrink between mousedown and mouseup, so the click lands next to them
 * and nothing opens. Give the pressed control the focus, as Chromium and Firefox do natively (arrow keys and
 * Back's focus restore then continue from the control that was clicked).
 */
function installPressFocus(doc: Document) {
  let pressing: HTMLElement | null = null
  const end = () => {
    pressing = null
  }
  doc.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target instanceof Element ? e.target : null
      const el = t?.closest<HTMLElement>(PRESSABLE) ?? null
      pressing = el && !isEditable(t) && el.tabIndex >= -1 ? el : null
    },
    { capture: true, passive: true },
  )
  doc.addEventListener('pointerup', end, { capture: true, passive: true })
  doc.addEventListener('pointercancel', end, { capture: true, passive: true })
  doc.addEventListener(
    'focusin',
    (e) => {
      const el = pressing
      if (!el || e.target === el || !(e.target instanceof Node) || !e.target.contains(el)) return
      el.focus({ preventScroll: true })
    },
    true,
  )
  const nothingFocused = () => doc.activeElement === doc.body || doc.activeElement == null
  doc.addEventListener(
    'focusout',
    (e) => {
      const el = pressing
      // also when the pressed control is the one losing focus: a second click on the focused control
      if (!el || e.relatedTarget) return
      queueMicrotask(() => {
        if (pressing === el && el.isConnected && nothingFocused()) el.focus({ preventScroll: true })
      })
    },
    true,
  )
  // Nothing had focus and the press focused nothing: no focus event fires at all, so look once the press's own
  // default action is over. Mouse and pen only (a finger has no keyboard to continue from the pressed control).
  doc.addEventListener(
    'mousedown',
    (e) => {
      const el = pressing
      if (!el || pointerType === 'touch') return
      setTimeout(() => {
        if (!e.defaultPrevented && el.isConnected && nothingFocused()) el.focus({ preventScroll: true })
      }, 0)
    },
    { capture: true, passive: true },
  )
}

/**
 * How long a tap's click may follow the lifted finger: at once where double-tap zoom is off (a responsive
 * viewport), about 350 ms later where the engine still waits for a second tap.
 */
const TAP_CLICK_MS = 400

function showsKeyboardFocus(el: Element): boolean {
  try {
    return el.matches(':focus-visible')
  } catch {
    // an engine without the selector
    return false
  }
}

/**
 * A press somewhere else while the keyboard still owns the highlight (a finger never takes it: no hover; a
 * mouse that has not moved since the last key): the keyboard-focused element shows the focused look until the
 * press's mousedown moves focus. Controls that change size with focus (the expanding toolbar pills) shrink at
 * that moment, their neighbours slide, and the mouseup and click land beside the button that was pressed: the
 * press is lost. The look is held (HELD_ATTR, as behind a dialog) until the click is through, or until the press
 * has ended without one (the secondary or middle button, a long touch press, the pressed node removed meanwhile).
 */
function installPressHold(doc: Document) {
  let held: HTMLElement | null = null
  let ending: ReturnType<typeof setTimeout> | undefined
  const release = () => {
    clearTimeout(ending)
    ending = undefined
    held?.removeAttribute(HELD_ATTR)
    held = null
  }
  doc.addEventListener(
    'pointerdown',
    (e) => {
      release()
      const a = doc.activeElement
      if (!(a instanceof HTMLElement) || a === doc.body || pointerHighlight()) return
      if (e.target instanceof Node && a.contains(e.target)) return
      if (a.hasAttribute(HELD_ATTR) || !showsKeyboardFocus(a)) return
      a.setAttribute(HELD_ATTR, '')
      held = a
    },
    { capture: true, passive: true },
  )
  // the click's target is settled once it is dispatched: what follows may move again
  doc.addEventListener('click', release, true)
  doc.addEventListener('pointercancel', release, true)
  doc.addEventListener('keydown', release, true)
  // A press that produces no click ends with its pointerup. A mouse's click is dispatched in the same task as
  // the pointerup, so the look is given back in the next one; a tap's click may follow later (TAP_CLICK_MS).
  doc.addEventListener(
    'pointerup',
    (e) => {
      const el = held
      if (!el) return
      clearTimeout(ending)
      ending = setTimeout(() => {
        if (held === el) release()
      }, e.pointerType === 'touch' ? TAP_CLICK_MS : 0)
    },
    { capture: true, passive: true },
  )
  // the browser's own menu can keep the pointerup of the press that opened it
  doc.addEventListener('contextmenu', release, true)
}

export function installInputModality(doc: Document = document): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  installMenuKey(doc)
  installPressFocus(doc)
  installPressHold(doc)
  const root = doc.documentElement
  const installedAt = performance.now()
  let lastX = Number.NaN
  let lastY = Number.NaN
  let lastSX = Number.NaN
  let lastSY = Number.NaN
  doc.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch') return
      // Content scrolling under a still cursor sends pointer events with no movement: same viewport and screen
      // position and no movementX/Y. Any of the three changing is real movement (some engines, e.g. WebKit under
      // automation, report a constant screenX/Y, so the screen position alone is not enough).
      const first = Number.isNaN(lastX)
      const moved = !!e.movementX || !!e.movementY || e.clientX !== lastX || e.clientY !== lastY || e.screenX !== lastSX || e.screenY !== lastSY
      lastX = e.clientX
      lastY = e.clientY
      lastSX = e.screenX
      lastSY = e.screenY
      if (!moved) return
      // The first event has no previous position to compare with: a browser may send one when the page
      // appears under a resting cursor. Right after start-up it counts only when it reports a movement
      // (a real single move later, e.g. one jump of the cursor onto a card, still counts).
      if (first && !e.movementX && !e.movementY && performance.now() - installedAt < SETTLE_MS) return
      if (!root.hasAttribute(ATTR)) root.setAttribute(ATTR, '')
    },
    { capture: true, passive: true },
  )
  doc.addEventListener(
    'pointerdown',
    (e) => {
      input = 'pointer'
      pressed = true
      pointerType = e.pointerType || 'mouse'
      origin = focusTarget(e.target)
      originAt = performance.now()
    },
    { capture: true, passive: true },
  )
  doc.addEventListener(
    'keydown',
    (e) => {
      if (MODIFIERS.has(e.key)) return
      pressed = true
      // Ctrl/Cmd/Alt shortcuts (browser zoom, tab switching) are not keyboard navigation.
      if (!e.metaKey && !e.ctrlKey && !e.altKey) input = 'keyboard'
      origin = focusTarget(e.target)
      originAt = performance.now()
      if (root.hasAttribute(ATTR)) root.removeAttribute(ATTR)
    },
    true,
  )
}

/** True while the pointer, not the keyboard, owns the highlight. */
export const pointerHighlight = () => typeof document !== 'undefined' && document.documentElement.hasAttribute(ATTR)

/** The input that acted last: a key press or a pointer press. */
export const lastInput = (): InputKind => input

/** No key or pointer press yet in this document: a reload, or a page opened by its address. */
export const noInputYet = (): boolean => !pressed

/** `pointerType` of the last pointer press ('mouse', 'pen', 'touch'). */
export const lastPointerType = (): string => pointerType

/** The input that acted last was a finger (a key press or a mouse / pen press since then ends it). */
export const lastInputWasTouch = (): boolean => input === 'pointer' && pointerType === 'touch'

/** The element the last key or pointer press happened on (still in the document), or null. */
export const interactionOrigin = (): HTMLElement | null => (origin?.isConnected ? origin : null)

/**
 * The element to give focus back to when an overlay that is opening now closes: `explicit` when the caller
 * passed one, else the focused element, else (Safari: clicks do not focus buttons) the pressed element.
 */
export function captureOpener(explicit?: HTMLElement | null): HTMLElement | null {
  if (explicit?.isConnected) return explicit
  const pressed = interactionOrigin()
  // A pointer press that just happened names the opener even where the press did not focus it (Safari).
  if (pressed && input === 'pointer' && performance.now() - originAt < ORIGIN_FRESH_MS) return pressed
  const active = typeof document === 'undefined' ? null : document.activeElement
  if (active instanceof HTMLElement && active !== document.body && active !== document.documentElement) return active
  return pressed
}

/** Overlay root (dialog panel, menu) -> the elements to give focus back to when it closes, nearest first. */
const overlayOpeners = new WeakMap<Element, readonly HTMLElement[]>()

/**
 * The elements to give focus back to when an overlay that is opening now closes, nearest first: its opener
 * (captureOpener), then the openers of the overlay that opener sits in. A menu entry that opens a dialog is
 * removed with its menu, and a dialog that follows another one (a chooser, then a form) was opened from an
 * element of the dialog it replaces: focus then goes back to what opened the first of them, as on the TV, where
 * it returns to the focused element of the window underneath.
 */
export function captureOpeners(explicit?: HTMLElement | null): HTMLElement[] {
  const first = captureOpener(explicit)
  if (!first) return []
  for (let p: Element | null = first; p; p = p.parentElement) {
    const outer = overlayOpeners.get(p)
    if (outer) return [first, ...outer.filter((el) => el !== first && el.isConnected)]
  }
  return [first]
}

/** Records what opened the overlay rooted at `root` (for the overlays opened from inside it). */
export function registerOverlay(root: Element, openers: readonly HTMLElement[]) {
  overlayOpeners.set(root, openers)
}

/** The nearest opener that is still in the document. */
export const liveOpener = (openers: readonly HTMLElement[]): HTMLElement | null => openers.find((el) => el.isConnected) ?? null

/**
 * The press in progress closed an overlay and focus went back to its opener: the press itself must not move
 * focus again (its default action would focus whatever lies under the pointer now that the overlay is gone:
 * the page area, or nothing). Cancels the press's focus change in every engine: the pointerdown itself, and the
 * compatibility mousedown where one still follows (after a touch it comes only when the finger is lifted).
 */
export function keepFocusThroughPress(e: { preventDefault: () => void }, doc: Document = document) {
  e.preventDefault()
  const types = ['mousedown', 'click', 'keydown', 'pointerdown'] as const
  const stop = (ev: Event) => {
    if (ev.type === 'mousedown') ev.preventDefault()
    for (const t of types) doc.removeEventListener(t, stop, true)
  }
  for (const t of types) doc.addEventListener(t, stop, true)
}

/** Marks an overlay's opener while the overlay is open; kit CSS draws it like `:focus-visible`. */
export const HELD_ATTR = 'data-focus-held'

/**
 * On the TV the element that opened a dialog keeps its focused look behind the scrim (its window only loses
 * window focus). Here focus moves into the overlay, so the opener is marked instead for as long as the overlay
 * is open, when the keyboard owns the highlight (with a pointer the look follows the cursor). Returns the undo.
 */
export function holdFocusLook(opener: HTMLElement | null): () => void {
  if (!opener?.isConnected || pointerHighlight() || input !== 'keyboard' || opener.hasAttribute(HELD_ATTR)) return () => {}
  opener.setAttribute(HELD_ATTR, '')
  return () => opener.removeAttribute(HELD_ATTR)
}

/**
 * Script focus that shows the focus ring when the keyboard is in charge. Chromium does that by itself after a
 * key press; Firefox only when the previously focused element showed it (so a dialog opened by a key after a
 * mouse click got no ring). `focusVisible` is Firefox's FocusOptions extension; other engines ignore it.
 */
export function focusFromScript(el: HTMLElement) {
  el.focus({ preventScroll: true, ...(input === 'keyboard' ? { focusVisible: true } : null) } as FocusOptions)
}

/** Puts focus back on an overlay's opener (no scroll jump) if it is still in the document. */
export function restoreFocus(opener: HTMLElement | null) {
  if (opener?.isConnected) focusFromScript(opener)
}

let openersGone: (() => void) | null = null

/**
 * What the app does when an overlay closes and nothing that opened it is left in the document (the shell gives
 * focus back to the page, src/app/shell/useFocusRestore.ts). Without a handler focus stays on <body>.
 */
export function setOpenersGoneHandler(fn: (() => void) | null) {
  openersGone = fn
}

/**
 * Puts focus back when an overlay closes: on the nearest opener still in the document. When it had openers and
 * none is left (a card that its grid built anew while the dialog was open: a window resize), the app's handler
 * decides, once the closing render is through and only if nothing took focus meanwhile.
 */
export function restoreFocusToOpeners(openers: readonly HTMLElement[]) {
  const opener = liveOpener(openers)
  if (opener) focusFromScript(opener)
  else if (openers.length && openersGone) {
    queueMicrotask(() => {
      const a = document.activeElement
      if (!a || a === document.body) openersGone?.()
    })
  }
}

/** Test hook: forget the recorded state (jsdom runs several cases in one document). */
export function resetInputModalityForTests() {
  input = 'pointer'
  pressed = false
  pointerType = 'mouse'
  origin = null
  originAt = 0
}
