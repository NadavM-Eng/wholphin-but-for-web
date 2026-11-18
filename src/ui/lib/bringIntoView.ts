// Scrolling a newly focused element into place the way the TV app does.
//
// Compose on TV devices uses the pivot bring-into-view rule (foundation `PivotBringIntoViewSpec`: parent
// fraction .3, child fraction 0) for every scrollable that has no spec of its own, rows and columns alike: a
// focused item is scrolled so its leading edge sits 30% into the viewport, as far as the scroll range allows.
// Seen in refshots 09-movie-detail-page-2 (focused person card top at 162dp = .3 x 540), 13-series-detail-page-2
// and 31-settings-advanced-page-3/-5/-7 (the focused row at 44 + .3 x 496dp every time).
//
// Markup:
//   data-focus-scroll-anchor   on a container: focus anywhere inside brings this container, not the focused
//                              element, to the pivot (upstream's header.bringIntoView() when a detail page's
//                              buttons or overview take focus, which shows the whole header again)
//   data-focus-scroll="nearest" on a scroller: that scroller moves only as far as needed to show the focused element
//                              (Compose's non-TV DefaultBringIntoViewSpec). The player's chapter and queue rows:
//                              refshots 24-playback-chapters-chapters-2 shows the third chapter focused with the
//                              row where it was (first card at 24dp), not at the pivot
//   data-focus-scroll="none"   on a container that is pinned to its scroller (a sticky header): it is always in
//                              view, so focus inside it scrolls nothing outside it

export const PIVOT_PARENT_FRACTION = 0.3

/** Scroll offset that puts an item (offset and size along the scroll axis, in content coordinates) on the pivot. */
export function pivotScrollTop(itemOffset: number, itemSize: number, viewport: number, contentSize: number): number {
  const pivot = PIVOT_PARENT_FRACTION * viewport
  // an item that would not fit below the pivot is aligned to the trailing edge instead
  const lead = itemSize <= viewport && viewport - pivot < itemSize ? viewport - itemSize : pivot
  const max = Math.max(0, contentSize - viewport)
  return Math.min(Math.max(0, itemOffset - lead), max)
}

/** Scroll offset that just shows an item: unchanged when it is fully visible or larger than the viewport. */
export function nearestScrollTop(itemOffset: number, itemSize: number, viewport: number, contentSize: number, current: number): number {
  const lead = itemOffset - current
  const trail = lead + itemSize
  if ((lead >= 0 && trail <= viewport) || (lead < 0 && trail > viewport)) return current
  const delta = Math.abs(lead) < Math.abs(trail - viewport) ? lead : trail - viewport
  return Math.min(Math.max(0, current + delta), Math.max(0, contentSize - viewport))
}

type Box = { left: number; top: number; right: number; bottom: number }

/**
 * The element's box without its own focus scale: on the TV the scale is a graphics layer and does not move the
 * rectangle that is brought into view. `offsetWidth/Height` are the layout size; the scale keeps the centre.
 */
function layoutBox(el: HTMLElement): Box {
  const r = el.getBoundingClientRect()
  const w = el.offsetWidth || r.width
  const h = el.offsetHeight || r.height
  const cx = (r.left + r.right) / 2
  const cy = (r.top + r.bottom) / 2
  return { left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2 }
}

const scrolls = (v: string) => v === 'auto' || v === 'scroll'

/** Room the body keeps free at the bottom of the window for a fixed bar (MiniPlayer.module.css), in real px. */
function bodyBottomReserve(): number {
  const pad = parseFloat(getComputedStyle(document.body).paddingBottom)
  return Number.isFinite(pad) && pad > 0 && pad < window.innerHeight / 2 ? pad : 0
}

/**
 * Brings `el` to the pivot in every scrollable ancestor, innermost first, as a bring-into-view request bubbles
 * through nested scrollables upstream. Smooth unless the user asked for reduced motion. Scrollers that keep
 * their own rule (Home: 50dp under the list top) simply scroll again afterwards.
 */
export function bringIntoView(el: HTMLElement): void {
  if (typeof window === 'undefined' || !el.isConnected) return
  const smooth = typeof matchMedia === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches
  const behavior: ScrollBehavior = smooth ? 'smooth' : 'auto'
  const x = layoutBox(el)
  const anchor = el.closest<HTMLElement>('[data-focus-scroll-anchor]')
  const y = anchor ? anchor.getBoundingClientRect() : x
  let yTop = y.top
  const yHeight = y.bottom - y.top
  let xLeft = x.left
  const xWidth = x.right - x.left
  const rootEl = document.scrollingElement ?? document.documentElement

  for (let p = el.parentElement; p; p = p.parentElement) {
    if (p.dataset.focusScroll === 'none') break
    const isRoot = p === rootEl || p === document.documentElement
    if (p === document.body && rootEl !== document.body) continue
    const cs = getComputedStyle(p)
    // the window ends where the page does: above the bar the body reserves room for (the music mini player sets
    // a bottom padding on <body>), so an item aligned to the trailing edge is not put under it
    const view = isRoot ? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight - bodyBottomReserve() } : null
    const pr = view ? null : p.getBoundingClientRect()
    const vTop = view ? 0 : pr!.top + p.clientTop
    const vLeft = view ? 0 : pr!.left + p.clientLeft
    const vH = view ? view.height : p.clientHeight
    const vW = view ? view.width : p.clientWidth
    // the root scrolls unless something (an open dialog) locked it
    const canY = (isRoot ? cs.overflowY !== 'hidden' && cs.overflowY !== 'clip' : scrolls(cs.overflowY)) && p.scrollHeight > vH + 1
    const canX = (isRoot ? cs.overflowX !== 'hidden' && cs.overflowX !== 'clip' : scrolls(cs.overflowX)) && p.scrollWidth > vW + 1
    if (canY) {
      const yOffset = yTop - vTop + p.scrollTop
      const target =
        p.dataset.focusScroll === 'nearest' ? nearestScrollTop(yOffset, yHeight, vH, p.scrollHeight, p.scrollTop) : pivotScrollTop(yOffset, yHeight, vH, p.scrollHeight)
      const delta = target - p.scrollTop
      if (Math.abs(delta) >= 1) {
        p.scrollTo({ top: target, behavior })
        yTop -= delta
      }
    }
    if (canX) {
      const rtl = cs.direction === 'rtl'
      const pos = Math.abs(p.scrollLeft)
      // distance of the item's leading edge from the start of the content
      const offset = rtl ? vLeft + vW - (xLeft + xWidth) + pos : xLeft - vLeft + pos
      const target =
        p.dataset.focusScroll === 'nearest' ? nearestScrollTop(offset, xWidth, vW, p.scrollWidth, pos) : pivotScrollTop(offset, xWidth, vW, p.scrollWidth)
      const delta = target - pos
      if (Math.abs(delta) >= 1) {
        p.scrollTo({ left: rtl ? -target : target, behavior })
        xLeft += rtl ? delta : -delta
      }
    }
    // nothing outside a fixed layer (drawer, dialog) scrolls it into view
    if (isRoot || cs.position === 'fixed') break
  }
}
