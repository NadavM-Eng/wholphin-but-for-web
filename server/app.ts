import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Hono } from 'hono'
import { compress } from 'hono/compress'
import { SEERR_MOUNT, type ServerConfig } from './config.ts'
import { createSeerrProxy } from './seerrProxy.ts'
import { securityHeaders } from './security.ts'
import { createStaticHandler } from './static.ts'

/** What the SPA reads from /config.json (src/api/config.ts). dist/config.json is the base, env wins. */
async function buildClientConfig(cfg: ServerConfig): Promise<Record<string, string>> {
  let base: Record<string, unknown> = {}
  try {
    const raw: unknown = JSON.parse(await readFile(join(cfg.distDir, 'config.json'), 'utf8'))
    if (raw && typeof raw === 'object') base = raw as Record<string, unknown>
  } catch {
    // none or invalid: env only
  }
  const out: Record<string, string> = {}
  for (const k of ['serverUrl', 'serverName', 'seerrProxyPath']) {
    if (typeof base[k] === 'string' && base[k]) out[k] = base[k]
  }
  if (cfg.jellyfinUrl) out.serverUrl = cfg.jellyfinUrl
  if (cfg.serverName) out.serverName = cfg.serverName
  if (cfg.seerrUrl) out.seerrProxyPath = SEERR_MOUNT
  else delete out.seerrProxyPath
  return out
}

export function createApp(cfg: ServerConfig): Hono {
  const app = new Hono()
  const serveStatic = createStaticHandler(cfg.distDir)
  const seerr = createSeerrProxy(cfg)

  app.use(securityHeaders(cfg))
  if (cfg.accessLog) {
    app.use(async (c, next) => {
      const t = Date.now()
      await next()
      // Path only: query strings can carry tokens.
      console.log(`${c.req.method} ${new URL(c.req.url).pathname} ${c.res.status} ${Date.now() - t}ms`)
    })
  }
  app.use(compress())

  app.get('/healthz', async (c) => {
    c.header('cache-control', 'no-store')
    try {
      await readFile(join(cfg.distDir, 'index.html'))
    } catch {
      return c.json({ status: 'error', reason: 'dist missing' }, 503)
    }
    return c.json({ status: 'ok' })
  })

  app.get('/config.json', async (c) => {
    c.header('cache-control', 'no-store')
    return c.json(await buildClientConfig(cfg))
  })

  app.all(SEERR_MOUNT, (c) => seerr(c))
  app.all(`${SEERR_MOUNT}/*`, (c) => seerr(c))

  app.all('*', (c) => serveStatic(c))
  app.onError((err, c) => {
    console.error('request failed:', err instanceof Error ? err.message : err)
    return c.json({ error: 'internal_error' }, 500)
  })
  return app
}
