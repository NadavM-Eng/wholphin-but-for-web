import type { MiddlewareHandler } from 'hono'
import type { ServerConfig } from './config.ts'
import { requestIsHttps } from './requestInfo.ts'

function wsVariant(origin: string): string {
  return origin.replace(/^http/, 'ws')
}

/**
 * CSP for the SPA. Jellyfin is the one cross-origin peer (XHR, WebSocket, images, video, subtitle
 * fonts); when JELLYFIN_URL is not set the user may type any server, so those sources open to http(s).
 * - 'wasm-unsafe-eval': the JASSUB subtitle renderer compiles WebAssembly.
 * - blob: in media/worker/img/connect: hls.js (MediaSource object URLs, worker) and subtitle assets.
 * - style 'unsafe-inline': React inline style attributes (no inline scripts are allowed).
 * - image.tmdb.org: Seerr artwork for items that are not in the Jellyfin library.
 */
export function buildCsp(cfg: ServerConfig): string {
  const peers: string[] = []
  const open = !cfg.jellyfinUrl
  if (cfg.jellyfinUrl) {
    const origin = new URL(cfg.jellyfinUrl).origin
    peers.push(origin, wsVariant(origin))
  }
  for (const o of cfg.extraCspOrigins) peers.push(o, wsVariant(o))
  const net = open ? ['http:', 'https:', 'ws:', 'wss:'] : peers
  const httpOnly = open ? ['http:', 'https:'] : peers.filter((p) => p.startsWith('http'))
  const d: Array<[string, string[]]> = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", "'wasm-unsafe-eval'"]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:', 'https://image.tmdb.org', ...httpOnly]],
    ['media-src', ["'self'", 'blob:', ...httpOnly]],
    ['font-src', ["'self'", 'data:', 'blob:', ...httpOnly]],
    ['connect-src', ["'self'", 'blob:', 'data:', ...net]],
    ['worker-src', ["'self'", 'blob:']],
    ['manifest-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ]
  return d.map(([k, v]) => `${k} ${v.join(' ')}`).join('; ')
}

/** Headers for every response; a route that already set one (the Seerr proxy sets its own CSP) wins. */
export function securityHeaders(cfg: ServerConfig): MiddlewareHandler {
  const csp = buildCsp(cfg)
  return async (c, next) => {
    await next()
    const h = c.res.headers
    const setDefault = (k: string, v: string) => {
      if (!h.has(k)) h.set(k, v)
    }
    setDefault('Content-Security-Policy', csp)
    setDefault('X-Content-Type-Options', 'nosniff')
    // Media and image URLs carry api_key query parameters: never send them as a referrer.
    setDefault('Referrer-Policy', 'no-referrer')
    // microphone=(self): the search page's voice button uses the browser's speech recognition, which needs the
    // microphone for the app's own origin (never for an embedded frame); everything else stays off.
    setDefault('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=(), usb=()')
    setDefault('Cross-Origin-Opener-Policy', 'same-origin')
    h.delete('X-Powered-By')
    if (cfg.hsts && requestIsHttps(c, cfg)) {
      setDefault('Strict-Transport-Security', 'max-age=15552000')
    }
  }
}
