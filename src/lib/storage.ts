/** localStorage access that never throws (private mode, blocked storage, SSR/tests). */
export function readJson<T>(key: string): T | null {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value))
  } catch {
    // storage full or blocked: settings simply do not persist
  }
}

export function removeKey(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key)
  } catch {
    // ignore
  }
}

export function readString(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function writeString(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value)
  } catch {
    // ignore
  }
}
