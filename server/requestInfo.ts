import type { Context } from 'hono'
import type { ServerConfig } from './config.ts'

interface NodeEnv {
  incoming?: { socket?: { remoteAddress?: string; encrypted?: boolean } }
}

function first(v: string | undefined): string | undefined {
  return v?.split(',')[0]?.trim() || undefined
}

export function remoteAddress(c: Context): string | undefined {
  return (c.env as NodeEnv | undefined)?.incoming?.socket?.remoteAddress
}

export function requestIsHttps(c: Context, cfg: Pick<ServerConfig, 'trustProxy'>): boolean {
  if (cfg.trustProxy) {
    const p = first(c.req.header('x-forwarded-proto'))
    if (p) return p.toLowerCase() === 'https'
  }
  return !!(c.env as NodeEnv | undefined)?.incoming?.socket?.encrypted
}

/** Hosts the browser may legitimately have used for this request (own Host, plus the proxy's). */
export function requestHosts(c: Context, cfg: Pick<ServerConfig, 'trustProxy'>): string[] {
  const hosts = [c.req.header('host')]
  if (cfg.trustProxy) hosts.push(first(c.req.header('x-forwarded-host')))
  return hosts.filter((h): h is string => !!h).map((h) => h.toLowerCase())
}
