// Small per-history-entry memory (sessionStorage), so Back restores what the TV app keeps in
// `rememberSaveable` (the focused row/column of Home, for example).
const PREFIX = 'wholphin.entry.v1.'
/** Most recently saved keys, oldest first; entries beyond MAX_ENTRIES are evicted. */
const INDEX_KEY = `${PREFIX}__index`
const MAX_ENTRIES = 50

export function loadEntryState<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function readIndex(): string[] {
  try {
    const v: unknown = JSON.parse(sessionStorage.getItem(INDEX_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : []
  } catch {
    return []
  }
}

export function saveEntryState(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value))
    const index = readIndex().filter((k) => k !== key)
    index.push(key)
    while (index.length > MAX_ENTRIES) {
      const old = index.shift()
      if (old != null) sessionStorage.removeItem(PREFIX + old)
    }
    sessionStorage.setItem(INDEX_KEY, JSON.stringify(index))
  } catch {
    // storage unavailable: Back simply starts fresh
  }
}
