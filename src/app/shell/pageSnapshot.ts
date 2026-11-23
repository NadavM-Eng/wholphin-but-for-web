// The page Settings was opened from, shown behind the Settings panel (owner request; web-only: the TV draws
// Settings as a full-screen destination on a flat background, PreferencesContent.kt PreferencesPage).
//
// The shell and Settings are different route layouts, so the shell page unmounts when Settings opens. What stays
// is a lifeless copy of its DOM: no React, no listeners, no focusable or addressable element. Keeping the real
// page mounted instead would leave its key handlers, focus logic and queries running under Settings.
import { useSessionStore, userKey, type CurrentSession } from '../../stores/session'
import { forgetBackdrop, keepBackdrop, resumeBackdrop } from './backdropService'
import styles from './PageUnderlay.module.css'

type Snapshot = {
  node: HTMLElement
  /** app path (pathname + search) of the copied page */
  path: string
  /** the session it belongs to (pageOwner): never shown to another user */
  owner: string | null
  /** window scroll offset and the shell's own width at the time of the copy (the window's width would include
   *  the room kept for its scrollbar) */
  scrollY: number
  width: number
  /** scrolled elements inside the copy: offsets are lost whenever a node leaves the document */
  scrolls: { el: Element; top: number; left: number }[]
}

let snapshot: Snapshot | null = null
function set(next: Snapshot | null) {
  snapshot = next
}

const ownerOf = (s: CurrentSession | null) => (s ? userKey(s.server.id, s.user.id) : null)
/** Who a copy taken now belongs to. A key, not the session object: that is replaced when the user's own settings change. */
export const pageOwner = () => ownerOf(useSessionStore.getState().current)

/** Settings and its sub-screens: the routes that open as a panel over the page. */
export function isPanelPath(pathname: string): boolean {
  return /^\/settings(\/|$)/.test(pathname)
}

// Every `data-*` attribute a stylesheet selects on. The copy keeps those (they carry its look) and loses all
// others: those are hooks (focus traps, focusable marks, page roots) that code finds with querySelector.
let styledAttrs: { sheets: number; names: Set<string> } | null = null
function styledDataAttrs(): Set<string> {
  if (styledAttrs && styledAttrs.sheets === document.styleSheets.length) return styledAttrs.names
  const names = new Set<string>()
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      const selector = (rule as CSSStyleRule).selectorText
      if (selector) for (const m of selector.matchAll(/\[(data-[\w-]+)/g)) names.add(m[1])
      const nested = (rule as CSSGroupingRule).cssRules
      if (nested?.length) visit(nested)
    }
  }
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      visit(sheet.cssRules)
    } catch {
      // a stylesheet from another origin cannot be read
    }
  }
  styledAttrs = { sheets: document.styleSheets.length, names }
  return names
}

/** Copies the shell page as it looks now. Call while it is still in the document (a layout-effect cleanup). */
export function capturePageSnapshot(shell: HTMLElement, path: string, owner: string | null) {
  const node = shell.cloneNode(true) as HTMLElement
  const source = [shell, ...Array.from(shell.querySelectorAll('*'))]
  const copy = [node, ...Array.from(node.querySelectorAll('*'))]
  const keep = styledDataAttrs()
  const scrolls: Snapshot['scrolls'] = []
  const remove: Element[] = []
  const drawer = shell.querySelector('[data-shell-drawer]')
  copy.forEach((el, i) => {
    const from = source[i]
    // never a second player: a copied media element could start playing
    if (el.matches('audio, video, iframe, object, embed, script')) return void remove.push(el)
    const inDrawer = !!drawer?.contains(from)
    // The drawer is open when Settings is chosen from it; behind the panel it rests closed, as the pointer left
    // it: no open state (below), and its list from the top, not where the open drawer was scrolled to.
    if (!inDrawer && (from.scrollTop || from.scrollLeft)) scrolls.push({ el, top: from.scrollTop, left: from.scrollLeft })
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name
      // ids outside SVG (paint references need theirs) could answer a label or getElementById of the live page
      if ((name === 'id' && !(el instanceof SVGElement)) || name === 'for' || name === 'autofocus' || name === 'tabindex') el.removeAttribute(name)
      else if (name === 'data-open' && inDrawer) el.removeAttribute(name)
      else if (name.startsWith('data-') && !keep.has(name)) el.removeAttribute(name)
    }
    if (el instanceof HTMLImageElement) {
      el.setAttribute('loading', 'eager')
      el.setAttribute('decoding', 'sync')
    } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      el.value = (from as HTMLInputElement).value
    } else if (el instanceof HTMLCanvasElement) {
      try {
        el.getContext('2d')?.drawImage(from as HTMLCanvasElement, 0, 0)
      } catch {
        // an empty canvas in the copy
      }
    }
  })
  for (const el of remove) el.remove()
  keepBackdrop()
  set({ node, path, owner, scrollY: window.scrollY, width: shell.getBoundingClientRect().width, scrolls })
}

export function dropPageSnapshot() {
  snapshot?.node.remove()
  forgetBackdrop()
  set(null)
}

function place(host: HTMLElement, s: Snapshot) {
  // the width the page was laid out at: the window may have had a scrollbar then and none now (or the reverse)
  host.style.width = `${s.width}px`
  host.append(s.node)
  for (const { el, top, left } of s.scrolls) {
    el.scrollTop = top
    el.scrollLeft = left
  }
  host.scrollTop = s.scrollY
}

/** Puts the copy into `host` (the underlay behind the panel). Returns the cleanup, or undefined without a copy. */
export function mountPageSnapshot(host: HTMLElement, owner: string | null): (() => void) | undefined {
  const s = snapshot
  if (!s || s.owner !== owner) return undefined
  place(host, s)
  const onResize = () => {
    host.style.width = ''
  }
  window.addEventListener('resize', onResize)
  return () => {
    window.removeEventListener('resize', onResize)
    s.node.remove()
  }
}

const HOLD_MS = 150
const FADE_MS = 200

/**
 * The shell is back. Returning to the copied page: the copy stays on top for a moment while the real page
 * mounts beneath it, then fades away, so the page does not blink out and in. Returns true in that case (the
 * caller skips the page's own fade-in). Any other arrival just discards the copy.
 */
export function returnFromPanel(path: string, owner: string | null): boolean {
  const s = snapshot
  if (!s) return false
  set(null)
  if (s.path !== path || s.owner !== owner) {
    forgetBackdrop()
    s.node.remove()
    return false
  }
  // the page shows its backdrop again at once, with or without the cover
  resumeBackdrop()
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    s.node.remove()
    return false
  }
  const host = document.createElement('div')
  host.className = `${styles.underlay} ${styles.returning}`
  host.setAttribute('inert', '')
  host.setAttribute('aria-hidden', 'true')
  document.body.append(host)
  place(host, s)
  const done = () => host.remove()
  if (typeof host.animate !== 'function') {
    window.setTimeout(done, HOLD_MS)
    return true
  }
  const total = HOLD_MS + FADE_MS
  const fade = host.animate([{ opacity: 1 }, { opacity: 1, offset: HOLD_MS / total }, { opacity: 0 }], { duration: total, easing: 'linear' })
  fade.onfinish = done
  fade.oncancel = done
  return true
}
