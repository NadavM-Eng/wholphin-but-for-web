/**
 * Minimal Seerr HTTP client (port of W/api/seerr/SeerrApiClient.kt for a browser).
 *
 * Seerr sends no CORS headers and authenticates with the `connect.sid` session cookie, so the browser
 * can only reach it same-origin through the deployment's reverse proxy (`seerrProxyPath` in
 * /config.json; the Vite dev server proxies /seerr-proxy). Every request is relative to that path and
 * sends cookies (`credentials: 'include'`). An API key, when the user chose that sign-in method, rides
 * along as `X-Api-Key` exactly as upstream's interceptor does, and then the cookie is NOT sent: Seerr's auth
 * middleware falls back to the `connect.sid` session when the key does not match, so a wrong key would
 * otherwise borrow whoever's Seerr session this browser holds.
 */
import { getAppConfig } from '../config'

/** Default dev proxy (vite.config.ts) used only by the dev server when config.json names none. */
const DEV_PROXY_PATH = '/seerr-proxy'

/** Same-origin path of the Seerr proxy, or null when this deployment has no Seerr. */
export function seerrProxyPath(): string | null {
  const configured = getAppConfig().seerrProxyPath
  const path = configured ?? (import.meta.env.DEV ? DEV_PROXY_PATH : null)
  if (!path) return null
  // Only same-origin paths: an absolute URL would be a cross-origin request Seerr cannot answer.
  if (!path.startsWith('/') || path.startsWith('//')) return null
  return path.replace(/\/+$/, '')
}

/** HTTP error from Seerr. `response.status` matches the shape the shared QueryClient retry rule reads. */
export class SeerrError extends Error {
  readonly status: number
  readonly response: { status: number }
  readonly body: unknown
  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.name = 'SeerrError'
    this.status = status
    this.response = { status }
    this.body = body
  }
}

export const isAuthError = (e: unknown): boolean => e instanceof SeerrError && (e.status === 401 || e.status === 403)

let apiKey: string | null = null

/** API-key sign-in: the key is sent as `X-Api-Key` on every request (upstream interceptor). */
export function setSeerrApiKey(key: string | null) {
  apiKey = key?.trim() || null
}

export function getSeerrApiKey(): string | null {
  return apiKey
}

type QueryValue = string | number | boolean | null | undefined
export type SeerrQuery = Record<string, QueryValue>

export interface SeerrRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  query?: SeerrQuery
  body?: unknown
  signal?: AbortSignal
  /** Overrides the stored API key for this call (sign-in probe); `null` sends none. */
  apiKey?: string | null
  timeoutMs?: number
}

/** encodeURIComponent plus the sub-delims it leaves alone (!'()*), which Seerr also refuses in a query. */
const encodeRfc3986 = (v: string): string =>
  encodeURIComponent(v).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

export function buildSeerrUrl(path: string, query?: SeerrQuery): string {
  const base = seerrProxyPath()
  if (base == null) throw new SeerrError(0, 'Seerr is not available on this deployment')
  // Seerr rejects '+' for a space ("must be url encoded"), so not URLSearchParams: percent-encode like
  // upstream's generated OpenAPI client (%20).
  const parts: string[] = []
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue
      parts.push(`${encodeRfc3986(k)}=${encodeRfc3986(String(v))}`)
    }
  }
  const qs = parts.join('&')
  return `${base}/api/v1${path}${qs ? `?${qs}` : ''}`
}

function messageOf(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    const m = b.message ?? b.error
    if (typeof m === 'string' && m.trim()) return m
  }
  return fallback
}

/** Performs one Seerr API call and parses the JSON answer. Throws SeerrError on any non-2xx status. */
/**
 * One signal that aborts when any of `signals` does. `AbortSignal.any` needs Safari 17.4 (the baseline is 16.4):
 * older engines get a controller that follows every signal.
 */
export function anySignal(signals: AbortSignal[]): AbortSignal | undefined {
  if (signals.length <= 1) return signals[0]
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(signals)
  const all = new AbortController()
  for (const s of signals) {
    if (s.aborted) {
      all.abort(s.reason)
      break
    }
    s.addEventListener('abort', () => all.abort(s.reason), { once: true, signal: all.signal })
  }
  return all.signal
}

export async function seerrFetch<T>(path: string, opts: SeerrRequestOptions = {}): Promise<T> {
  const url = buildSeerrUrl(path, opts.query)
  const headers: Record<string, string> = { Accept: 'application/json' }
  const key = opts.apiKey !== undefined ? opts.apiKey : apiKey
  if (key) headers['X-Api-Key'] = key
  let body: string | undefined
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    // Null fields are left out, as upstream's generated client does: Seerr's request validator rejects
    // `"serverId": null` with 400.
    body = JSON.stringify(opts.body, (_k, v: unknown) => (v === null ? undefined : v))
  }
  const signals = [opts.signal, opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined].filter(
    (s): s is AbortSignal => !!s,
  )
  let res: Response
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body,
      // With an API key the key alone must authenticate (see above); otherwise the session cookie does.
      credentials: key ? 'omit' : 'include',
      signal: anySignal(signals),
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError' && opts.signal?.aborted) throw e
    throw new SeerrError(0, e instanceof Error ? e.message : String(e))
  }
  const type = res.headers.get('content-type') ?? ''
  const isJson = type.includes('application/json')
  let parsed: unknown = undefined
  if (res.status !== 204) {
    try {
      parsed = isJson ? await res.json() : await res.text()
    } catch {
      parsed = undefined
    }
  }
  if (!res.ok) throw new SeerrError(res.status, messageOf(parsed, `HTTP ${res.status}`), parsed)
  // A proxy that is missing usually answers with the SPA's index.html: treat that as "no Seerr here".
  if (res.status !== 204 && !isJson && parsed !== '') throw new SeerrError(502, 'Seerr proxy returned a non-JSON response')
  return parsed as T
}
