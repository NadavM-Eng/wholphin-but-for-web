/**
 * Scroll offsets remembered per `restoreKey` for the life of the tab, so Back restores a row's or
 * grid's position. Kept in memory (and mirrored to sessionStorage so a reload of the same entry works).
 */
const memory = new Map<string, number>()
const PREFIX = 'wh-scroll:'

export function saveScroll(key: string, offset: number) {
  memory.set(key, offset)
  try {
    sessionStorage.setItem(PREFIX + key, String(Math.round(offset)))
  } catch {
    // storage unavailable (private mode, quota): memory still works
  }
}

export function loadScroll(key: string): number | undefined {
  if (memory.has(key)) return memory.get(key)
  try {
    const v = sessionStorage.getItem(PREFIX + key)
    if (v != null && Number.isFinite(Number(v))) return Number(v)
  } catch {
    // ignore
  }
  return undefined
}
