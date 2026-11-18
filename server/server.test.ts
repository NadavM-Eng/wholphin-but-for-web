// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { loadConfig, type ServerConfig } from './config.ts'
import { buildUpstreamUrl, resolveUpstreamPath, rewriteLocation, rewriteSetCookie } from './seerrProxy.ts'

interface Seen {
  method?: string
  url?: string
  headers: IncomingMessage['headers']
  bodyBytes: number
}

let upstream: Server
let upstreamUrl: string
let app: Server
let base: string
let dist: string
let last: Seen
const hang = new Set<() => void>()

async function drain(req: IncomingMessage): Promise<number> {
  let n = 0
  try {
    for await (const chunk of req) n += (chunk as Buffer).length
  } catch {
    // the proxy aborted the upstream request (size limit / timeout)
  }
  return n
}

function startApp(cfg: ServerConfig): Promise<Server> {
  return new Promise((res) => {
    const s = serve({ fetch: createApp(cfg).fetch, port: 0, hostname: '127.0.0.1' }, () => res(s as unknown as Server))
  })
}

beforeAll(async () => {
  upstream = createServer(async (req, res) => {
    const bodyBytes = await drain(req)
    last = { method: req.method, url: req.url, headers: req.headers, bodyBytes }
    const u = req.url ?? ''
    if (u.startsWith('/api/v1/auth/local')) {
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': ['connect.sid=abc123; Path=/; Domain=seerr.internal; HttpOnly; Secure; SameSite=None; Max-Age=60', 'locale=en; Path=/api'],
        connection: 'x-secret',
        'x-secret': 'hidden',
        'keep-alive': 'timeout=5',
        'access-control-allow-origin': '*',
        'content-security-policy': 'script-src *',
      })
      res.end('{"ok":true}')
    } else if (u.startsWith('/api/v1/redirect')) {
      res.writeHead(302, { location: `${upstreamUrl}/api/v1/landed?x=1` })
      res.end()
    } else if (u.startsWith('/api/v1/slowbody')) {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.write('a')
      setTimeout(() => res.end('b'), 1600)
    } else if (u.startsWith('/api/v1/hang')) {
      const t = setTimeout(() => res.end('late'), 5000)
      hang.add(() => clearTimeout(t))
    } else if (u.startsWith('/imageproxy/')) {
      res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': '3' })
      res.end(Buffer.from([1, 2, 3]))
    } else {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ path: u, bodyBytes }))
    }
  })
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r))
  upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`

  dist = mkdtempSync(join(tmpdir(), 'ww-dist-'))
  mkdirSync(join(dist, 'assets'))
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>spa</title>')
  writeFileSync(join(dist, 'assets', 'app-abc123.js'), 'console.log(1)')
  writeFileSync(join(dist, 'config.json'), '{"serverName":"Fallback","seerrProxyPath":"/old"}')
  writeFileSync(join(dist, '.secret'), 'x')

  const cfg = loadConfig({
    DIST_DIR: dist,
    JELLYFIN_URL: 'https://jf.example.com/',
    SEERR_URL: `${upstreamUrl}/`,
    MAX_BODY_MB: '1',
    SEERR_TIMEOUT_SECONDS: '1',
  })
  app = await startApp(cfg)
  base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`
})

afterAll(() => {
  for (const f of hang) f()
  app.closeAllConnections()
  upstream.closeAllConnections()
  app.close()
  upstream.close()
})

describe('static + config', () => {
  it('serves index.html with no-cache and security headers, and hashed assets immutable', async () => {
    const r = await fetch(`${base}/`)
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-cache')
    const csp = r.headers.get('content-security-policy')!
    expect(csp).toContain('connect-src')
    expect(csp).toContain('https://jf.example.com')
    expect(csp).toContain('wss://jf.example.com')
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    // the microphone is allowed for the app's own origin only (voice search); the rest stays off
    expect(r.headers.get('permissions-policy')).toBe('camera=(), microphone=(self), geolocation=(), payment=(), usb=()')
    const a = await fetch(`${base}/assets/app-abc123.js`)
    expect(a.headers.get('cache-control')).toContain('immutable')
    expect(a.headers.get('content-type')).toContain('javascript')
  })
  it('falls back to index.html for client routes, 404s missing files and dotfiles', async () => {
    expect(await (await fetch(`${base}/item/123/some/deep`)).text()).toContain('<title>spa</title>')
    expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404)
    expect((await fetch(`${base}/nope.png`)).status).toBe(404)
    expect((await fetch(`${base}/.secret`)).status).toBe(404)
    expect(await (await fetch(`${base}/%2e%2e/%2e%2e/etc/passwd`)).text()).toContain('<title>spa</title>')
  })
  it('answers conditional requests and health', async () => {
    const first = await fetch(`${base}/`)
    const again = await fetch(`${base}/`, { headers: { 'if-none-match': first.headers.get('etag')! } })
    expect(again.status).toBe(304)
    expect(await (await fetch(`${base}/healthz`)).json()).toEqual({ status: 'ok' })
  })
  it('publishes env over dist/config.json', async () => {
    const j = await (await fetch(`${base}/config.json`)).json()
    expect(j).toEqual({ serverName: 'Fallback', serverUrl: 'https://jf.example.com', seerrProxyPath: '/seerr-proxy' })
  })
  it('sets HSTS only for https requests (via X-Forwarded-Proto)', async () => {
    expect((await fetch(`${base}/`)).headers.get('strict-transport-security')).toBeNull()
    const r = await fetch(`${base}/`, { headers: { 'x-forwarded-proto': 'https' } })
    expect(r.headers.get('strict-transport-security')).toContain('max-age')
  })
})

describe('config from dist', () => {
  it('narrows the CSP to a serverUrl baked into dist/config.json', () => {
    const d = mkdtempSync(join(tmpdir(), 'ww-dist2-'))
    writeFileSync(join(d, 'config.json'), '{"serverUrl":"http://from-dist.example"}')
    expect(loadConfig({ DIST_DIR: d }).jellyfinUrl).toBe('http://from-dist.example')
  })
})

describe('seerr proxy', () => {
  it('forwards only the connect.sid cookie and drops auth headers', async () => {
    await fetch(`${base}/seerr-proxy/api/v1/x`, {
      headers: { cookie: 'a=1; connect.sid=s1; b=2', authorization: 'Bearer z', 'x-emby-token': 't' },
    })
    expect(last.headers.cookie).toBe('connect.sid=s1')
    expect(last.headers.authorization).toBeUndefined()
    expect(last.headers['x-emby-token']).toBeUndefined()
  })

  it('does not cut a streaming body off at the header timeout', async () => {
    const r = await fetch(`${base}/seerr-proxy/api/v1/slowbody`)
    expect(r.status).toBe(200)
    expect(await r.text()).toBe('ab')
  })

  it('rewrites cookies, strips hop-by-hop and upstream CORS/CSP headers', async () => {
    const r = await fetch(`${base}/seerr-proxy/api/v1/auth/local`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'connect.sid=old', origin: base },
      body: '{"email":"a"}',
    })
    expect(r.status).toBe(200)
    const cookies = r.headers.getSetCookie()
    expect(cookies[0]).toBe('connect.sid=abc123; Path=/seerr-proxy; HttpOnly; Max-Age=60; SameSite=Lax')
    expect(cookies[1]).toBe('locale=en; Path=/seerr-proxy; SameSite=Lax')
    expect(r.headers.get('x-secret')).toBeNull()
    expect(r.headers.get('access-control-allow-origin')).toBeNull()
    expect(r.headers.get('content-security-policy')).toContain('sandbox')
    expect(last.headers.cookie).toBe('connect.sid=old')
    expect(last.headers.host).toBe(upstreamUrl.replace('http://', ''))
    expect(last.headers.origin).toBe(upstreamUrl)
    expect(last.headers['x-forwarded-proto']).toBe('http')
    expect(last.headers['x-forwarded-host']).toBe(base.replace('http://', ''))
    expect(last.headers['x-forwarded-for']).toContain('127.0.0.1')
    expect(last.bodyBytes).toBe(13)
  })
  it('adds Secure to cookies when the request came in over https', async () => {
    const r = await fetch(`${base}/seerr-proxy/api/v1/auth/local`, { method: 'POST', headers: { 'x-forwarded-proto': 'https' } })
    expect(r.headers.getSetCookie()[0]).toContain('; Secure')
  })
  it('does not trust forwarded headers from the client for XFF when TRUST_PROXY is off', async () => {
    const s = await startApp(loadConfig({ DIST_DIR: dist, SEERR_URL: upstreamUrl, TRUST_PROXY: 'false' }))
    const b = `http://127.0.0.1:${(s.address() as AddressInfo).port}`
    await fetch(`${b}/seerr-proxy/api/v1/status`, { headers: { 'x-forwarded-for': '6.6.6.6', 'x-forwarded-proto': 'https' } })
    expect(last.headers['x-forwarded-for']).toBe('127.0.0.1')
    expect(last.headers['x-forwarded-proto']).toBe('http')
    s.close()
  })
  it('passes query strings and binary bodies through', async () => {
    const r = await fetch(`${base}/seerr-proxy/api/v1/search?query=a%20b&page=2`)
    expect(((await r.json()) as { path: string }).path).toBe('/api/v1/search?query=a%20b&page=2')
    const img = await fetch(`${base}/seerr-proxy/imageproxy/tmdb/t/p/w500/x.jpg`)
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    expect(img.headers.get('content-type')).toBe('image/jpeg')
  })
  it('rewrites redirects so the upstream origin never leaks', async () => {
    const r = await fetch(`${base}/seerr-proxy/api/v1/redirect`, { redirect: 'manual' })
    expect(r.status).toBe(302)
    expect(r.headers.get('location')).toBe('/seerr-proxy/api/v1/landed?x=1')
  })
  it('only reaches the allowed Seerr paths; traversal attempts never reach upstream', async () => {
    last = { headers: {}, bodyBytes: 0 }
    for (const p of ['/seerr-proxy/login', '/seerr-proxy/api/v1/../../etc', '/seerr-proxy/api/v1/%2e%2e/secret', '/seerr-proxy/api/v1/..%2fsecret', '/seerr-proxy/api/v1/a%5cb', '/seerr-proxy//evil.example/api/v1/x', '/seerr-proxy/%00']) {
      const r = await fetch(`${base}${p}`)
      expect(r.status, p).not.toBe(200)
      expect(r.headers.get('content-type') ?? '', p).not.toContain('text/html')
    }
    expect(last.url).toBeUndefined()
  })
  it('limits methods and rejects cross-origin state changes', async () => {
    expect((await fetch(`${base}/seerr-proxy/api/v1/x`, { method: 'TRACE' as string }).catch(() => ({ status: 405 }))).status).toBe(405)
    const r = await fetch(`${base}/seerr-proxy/api/v1/auth/local`, { method: 'POST', headers: { origin: 'https://evil.example' }, body: 'x' })
    expect(r.status).toBe(403)
  })
  it('times out a hanging upstream with 504', async () => {
    const r = await fetch(`${base}/seerr-proxy/api/v1/hang`)
    expect(r.status).toBe(504)
  })
  it('answers 502 when the upstream is down, without naming it', async () => {
    const s = await startApp(loadConfig({ DIST_DIR: dist, SEERR_URL: 'http://127.0.0.1:1' }))
    const b = `http://127.0.0.1:${(s.address() as AddressInfo).port}`
    const r = await fetch(`${b}/seerr-proxy/api/v1/status`)
    expect(r.status).toBe(502)
    expect(await r.text()).not.toContain('127.0.0.1')
    s.close()
  })
  it('is a 404 JSON (not the SPA) when Seerr is not configured, and config omits the path', async () => {
    const s = await startApp(loadConfig({ DIST_DIR: dist }))
    const b = `http://127.0.0.1:${(s.address() as AddressInfo).port}`
    const r = await fetch(`${b}/seerr-proxy/api/v1/status`)
    expect(r.status).toBe(404)
    expect(r.headers.get('content-type')).toContain('json')
    expect(((await (await fetch(`${b}/config.json`)).json()) as { seerrProxyPath?: string }).seerrProxyPath).toBeUndefined()
    // no JELLYFIN_URL: CSP is open to any server the user types
    expect((await fetch(`${b}/`)).headers.get('content-security-policy')).toContain('connect-src \'self\' blob: data: http: https:')
    s.close()
  })
  // Last: the server closes the connection after answering 413 without reading the body.
  it('rejects oversized bodies, declared or streamed', async () => {
    const big = new Uint8Array(2 * 1024 * 1024)
    const r = await fetch(`${base}/seerr-proxy/api/v1/request`, { method: 'POST', body: big })
    expect(r.status).toBe(413)
    const stream = new ReadableStream({
      start(c) {
        for (let i = 0; i < 3; i++) c.enqueue(new Uint8Array(700 * 1024))
        c.close()
      },
    })
    const r2 = await fetch(`${base}/seerr-proxy/api/v1/request`, { method: 'POST', body: stream, duplex: 'half' } as RequestInit)
    expect(r2.status).toBe(413)
    const ok = await fetch(`${base}/seerr-proxy/api/v1/request`, { method: 'POST', body: new Uint8Array(900 * 1024) })
    expect(((await ok.json()) as { bodyBytes: number }).bodyBytes).toBe(900 * 1024)
  })
})

describe('proxy helpers', () => {
  it('resolveUpstreamPath', () => {
    expect(resolveUpstreamPath('/seerr-proxy/api/v1/auth/me')).toBe('/api/v1/auth/me')
    expect(resolveUpstreamPath('/seerr-proxy')).toBeNull()
    expect(resolveUpstreamPath('/seerr-proxyx/api/v1/a')).toBeNull()
  })
  it('buildUpstreamUrl keeps the base path and refuses to leave it', () => {
    expect(buildUpstreamUrl('http://s:5055/seerr', '/api/v1/a', '?q=1')?.href).toBe('http://s:5055/seerr/api/v1/a?q=1')
    expect(buildUpstreamUrl('http://s:5055', '/@evil.com/x', '')?.origin).toBe('http://s:5055')
  })
  it('rewriteSetCookie / rewriteLocation', () => {
    expect(rewriteSetCookie('a=b; Path=/x; Secure; SameSite=Strict; Partitioned', false)).toBe('a=b; Path=/seerr-proxy; SameSite=Lax')
    const up = new URL('http://s:5055/seerr/api/v1/x')
    expect(rewriteLocation('/seerr/login', up, 'http://s:5055/seerr')).toBe('/seerr-proxy/login')
    expect(rewriteLocation('https://other.example/x', up, 'http://s:5055/seerr')).toBe('https://other.example/x')
  })
})

describe('the page under the Content-Security-Policy', () => {
  it('has no inline script: script-src allows the app origin only, so an inline one would never run', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
    const scripts = html.match(/<script\b[^>]*>/g) ?? []
    expect(scripts.length).toBeGreaterThan(0)
    for (const tag of scripts) expect(tag).toMatch(/\ssrc=/)
    expect(html).not.toMatch(/\son[a-z]+\s*=/i)
  })
})
