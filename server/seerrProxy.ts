import type { Context } from 'hono'
import { SEERR_MOUNT, type ServerConfig } from './config.ts'
import { remoteAddress, requestHosts, requestIsHttps } from './requestInfo.ts'

/**
 * Reverse proxy to ONE Seerr instance (SEERR_URL). The target is never derived from the request:
 * only the path below the mount and the query string are forwarded, and only for the Seerr API,
 * its image/avatar proxies (not its web UI).
 */

const ALLOWED_PREFIXES = ['/api/v1/', '/imageproxy/', '/avatarproxy/']
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'])
const SAFE_METHODS = new Set(['GET', 'HEAD'])
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'trailers',
  'transfer-encoding',
  'upgrade',
])
// Never forwarded upstream: set by us or meaningless/unsafe for the upstream hop.
const DROP_REQUEST = new Set(['authorization', 'x-emby-token', 'x-emby-authorization', 'x-mediabrowser-token', 'host', 'content-length', 'origin', 'referer', 'accept-encoding', 'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-host', 'x-forwarded-port', 'forwarded', 'x-real-ip'])
const DROP_RESPONSE = new Set(['set-cookie', 'content-encoding', 'server', 'x-powered-by', 'content-security-policy', 'content-security-policy-report-only', 'strict-transport-security', 'access-control-allow-origin', 'access-control-allow-credentials', 'access-control-allow-headers', 'access-control-allow-methods', 'access-control-expose-headers', 'public-key-pins'])

function json(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** Path below the mount, or null when it must not be forwarded. */
export function resolveUpstreamPath(pathname: string): string | null {
  if (pathname !== SEERR_MOUNT && !pathname.startsWith(`${SEERR_MOUNT}/`)) return null
  const rest = pathname.slice(SEERR_MOUNT.length)
  // Encoded separators / dots / NUL / backslashes are how traversal gets past a prefix check.
  if (/%(2e|2f|5c|00)/i.test(rest) || rest.includes('\\') || rest.includes('\0')) return null
  if (rest.split('/').some((s) => s === '.' || s === '..')) return null
  if (rest.includes('//')) return null
  if (!ALLOWED_PREFIXES.some((p) => rest.startsWith(p))) return null
  return rest
}

export function buildUpstreamUrl(base: string, rest: string, search: string): URL | null {
  const b = new URL(base)
  let u: URL
  try {
    u = new URL(base + rest + search)
  } catch {
    return null
  }
  const prefix = b.pathname.replace(/\/+$/, '')
  if (u.origin !== b.origin || !(u.pathname === prefix || u.pathname.startsWith(`${prefix}/`))) return null
  return u
}

/** One Set-Cookie from Seerr -> one the browser keeps for the app's own origin, scoped to the mount. */
export function rewriteSetCookie(raw: string, https: boolean): string {
  const parts = raw.split(';').map((p) => p.trim())
  const nameValue = parts.shift() ?? ''
  const kept: string[] = []
  for (const attr of parts) {
    const key = attr.split('=')[0]!.trim().toLowerCase()
    // Domain would bind the cookie to Seerr's host, Path to Seerr's paths, Secure breaks plain HTTP,
    // SameSite=None needs Secure, Partitioned is pointless. All replaced below.
    if (['domain', 'path', 'secure', 'samesite', 'partitioned'].includes(key)) continue
    kept.push(attr)
  }
  return [nameValue, `Path=${SEERR_MOUNT}`, ...kept, 'SameSite=Lax', ...(https ? ['Secure'] : [])].join('; ')
}

/** Redirects must stay inside the proxy and never name the Seerr origin. */
export function rewriteLocation(location: string, upstream: URL, base: string): string {
  const prefix = new URL(base).pathname.replace(/\/+$/, '')
  let target: URL
  try {
    target = new URL(location, upstream)
  } catch {
    return SEERR_MOUNT + '/'
  }
  if (target.origin !== upstream.origin) return location
  let path = target.pathname
  if (prefix && path.startsWith(prefix)) path = path.slice(prefix.length)
  return `${SEERR_MOUNT}${path}${target.search}${target.hash}`
}

function limitBody(body: ReadableStream<Uint8Array>, max: number, onExceed: () => void): ReadableStream<Uint8Array> {
  let seen = 0
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength
        if (seen > max) {
          onExceed()
          controller.error(new Error('body too large'))
          return
        }
        controller.enqueue(chunk)
      },
    }),
  )
}

export function createSeerrProxy(cfg: ServerConfig) {
  const base = cfg.seerrUrl
  return async (c: Context): Promise<Response> => {
    if (!base) return json(404, 'seerr_not_configured')
    const method = c.req.method
    if (!METHODS.has(method)) return json(405, 'method_not_allowed')

    const url = new URL(c.req.url)
    const rest = resolveUpstreamPath(url.pathname)
    if (rest === null) return json(404, 'not_found')
    const target = buildUpstreamUrl(base, rest, url.search)
    if (!target) return json(400, 'bad_request')

    // CSRF defence in depth (cookies are SameSite=Lax already): state-changing requests must come from our own origin.
    if (!SAFE_METHODS.has(method)) {
      const origin = c.req.header('origin')
      if (origin) {
        let host = ''
        try {
          host = new URL(origin).host.toLowerCase()
        } catch {
          // invalid Origin: rejected below
        }
        if (!host || !requestHosts(c, cfg).includes(host)) return json(403, 'cross_origin_forbidden')
      }
    }

    const declared = Number(c.req.header('content-length') ?? 0)
    if (declared > cfg.maxBodyBytes) return json(413, 'payload_too_large')

    const connectionTokens = (c.req.header('connection') ?? '').split(',').map((t) => t.trim().toLowerCase())
    const headers = new Headers()
    for (const [k, v] of c.req.raw.headers) {
      const key = k.toLowerCase()
      if (HOP_BY_HOP.has(key) || DROP_REQUEST.has(key) || connectionTokens.includes(key)) continue
      if (key === 'cookie') {
        // Cookies are not port-scoped: forward only Seerr's own session cookie, never other services' on the same host name.
        const kept = v.split(';').map((p) => p.trim()).filter((p) => p.toLowerCase().startsWith('connect.sid='))
        if (kept.length) headers.set('cookie', kept.join('; '))
        continue
      }
      headers.set(k, v)
    }
    headers.set('host', target.host)
    headers.set('accept-encoding', 'identity')
    const https = requestIsHttps(c, cfg)
    const peer = remoteAddress(c)
    const prior = cfg.trustProxy ? c.req.header('x-forwarded-for') : undefined
    const xff = [prior, peer].filter(Boolean).join(', ')
    if (xff) headers.set('x-forwarded-for', xff)
    headers.set('x-forwarded-proto', https ? 'https' : 'http')
    const fwdHost = requestHosts(c, cfg).at(-1)
    if (fwdHost) headers.set('x-forwarded-host', fwdHost)
    if (c.req.header('origin')) headers.set('origin', target.origin)

    let exceeded = false
    // The timeout covers waiting for the response headers only; a body that is already streaming is not cut off.
    const ac = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      ac.abort()
    }, cfg.upstreamTimeoutMs)
    const signal = AbortSignal.any([ac.signal, c.req.raw.signal])
    const init: RequestInit & { duplex?: 'half' } = { method, headers, redirect: 'manual', signal }
    if (!SAFE_METHODS.has(method) && c.req.raw.body) {
      init.body = limitBody(c.req.raw.body, cfg.maxBodyBytes, () => (exceeded = true))
      init.duplex = 'half'
    }

    let res: Response
    try {
      res = await fetch(target, init)
    } catch {
      if (exceeded) return json(413, 'payload_too_large')
      if (timedOut) return json(504, 'upstream_timeout')
      return json(502, 'upstream_unavailable')
    } finally {
      clearTimeout(timer)
    }

    const out = new Headers()
    const resTokens = (res.headers.get('connection') ?? '').split(',').map((t) => t.trim().toLowerCase())
    const decoded = res.headers.has('content-encoding') // fetch already decoded it: length no longer matches
    for (const [k, v] of res.headers) {
      const key = k.toLowerCase()
      if (decoded && key === 'content-length') continue
      if (HOP_BY_HOP.has(key) || DROP_RESPONSE.has(key) || resTokens.includes(key)) continue
      out.set(k, v)
    }
    for (const cookie of res.headers.getSetCookie()) out.append('set-cookie', rewriteSetCookie(cookie, https))
    const loc = res.headers.get('location')
    if (loc) out.set('location', rewriteLocation(loc, target, base))
    // Whatever Seerr returns is rendered on the app's origin (where Jellyfin tokens live): never let it run script.
    out.set('content-security-policy', "default-src 'none'; sandbox")
    out.set('x-content-type-options', 'nosniff')
    if (!out.has('cache-control')) out.set('cache-control', 'no-store')
    const nullBody = method === 'HEAD' || res.status === 204 || res.status === 304
    return new Response(nullBody ? null : res.body, { status: res.status, headers: out })
  }
}
