import { dp } from '../../theme/scale'

/** Distance kept from the window edges by any menu. */
export const MENU_EDGE_MARGIN = 8
/** material3 MenuVerticalMargin: a menu dropped from an element keeps this far from the window's top and bottom. */
const MENU_VERTICAL_MARGIN_DP = 48

/** An element's box without its focus scale (a graphics layer upstream: the menu anchors to the layout bounds). */
function layoutRect(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  const w = el.offsetWidth || r.width
  const h = el.offsetHeight || r.height
  const cx = (r.left + r.right) / 2
  const cy = (r.top + r.bottom) / 2
  return { left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2 }
}

/**
 * Where a menu of `size` dropped from `anchor` goes, in viewport pixels (material3 DropdownMenuPositionProvider):
 * start edges aligned; directly below the anchor, else directly above, else centred on its top, else 48dp from
 * the window edge nearer the anchor, which may cover the anchor (refshots 08-library-grid-dialogs-filter-dialog:
 * the menu starts 48dp from the top, over its button). A menu taller than the window minus both margins is
 * centred. Pass the menu's layout size (offsetWidth / offsetHeight), not its animated box.
 */
export function menuPositionBelow(anchor: HTMLElement, size: { width: number; height: number }): { left: number; top: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const rtl = getComputedStyle(document.documentElement).direction === 'rtl'
  const r = layoutRect(anchor)
  const margin = Math.min(dp(MENU_VERTICAL_MARGIN_DP), Math.max(MENU_EDGE_MARGIN, (vh - size.height) / 2))
  const fits = (y: number) => y >= margin && y + size.height <= vh - margin
  const edge = (r.top + r.bottom) / 2 < vh / 2 ? margin : vh - margin - size.height
  const top = [r.bottom, r.top - size.height, r.top - size.height / 2].find(fits) ?? edge
  const left = rtl ? r.right - size.width : r.left
  return {
    left: Math.min(Math.max(MENU_EDGE_MARGIN, left), Math.max(MENU_EDGE_MARGIN, vw - size.width - MENU_EDGE_MARGIN)),
    top: Math.min(Math.max(MENU_EDGE_MARGIN, top), Math.max(MENU_EDGE_MARGIN, vh - size.height - MENU_EDGE_MARGIN)),
  }
}
