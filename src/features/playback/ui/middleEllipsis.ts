/** U+2026, what Android's TextUtils.ellipsize inserts. */
export const ELLIPSIS = '…'

/**
 * `TextOverflow.MiddleEllipsis` for one line, as Android's `TextUtils.ellipsize(TruncateAt.MIDDLE)` does it: the
 * tail keeps as many characters as fit in half of the room left beside the ellipsis, the head gets what remains.
 * `width(start, end)` measures the code points `[start, end)` of `text`; returns `text` unchanged when it fits.
 */
export function middleEllipsize(text: string, avail: number, ellipsisWidth: number, width: (start: number, end: number) => number): string {
  const chars = Array.from(text)
  const len = chars.length
  if (len === 0 || width(0, len) <= avail) return text
  const room = avail - ellipsisWidth
  if (room <= 0) return ELLIPSIS
  // largest n in [0, max] for which fits(n) holds; fits is monotonic
  const most = (max: number, fits: (n: number) => boolean) => {
    let lo = 0
    let hi = max
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (fits(mid)) lo = mid
      else hi = mid - 1
    }
    return lo
  }
  const tail = most(len, (n) => width(len - n, len) <= room / 2)
  const rest = room - width(len - tail, len)
  const head = most(len - tail, (n) => width(0, n) <= rest)
  return chars.slice(0, head).join('') + ELLIPSIS + chars.slice(len - tail).join('')
}
