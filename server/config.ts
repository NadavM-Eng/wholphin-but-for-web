import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Where the SPA reaches the Seerr proxy. Fixed: the SPA's default and the Vite dev proxy use the same path. */
export const SEERR_MOUNT = '/seerr-proxy'

export interface ServerConfig {
  port: number
  host: string
  /** Built SPA (vite build output). */
  distDir: string
  /** Public address of Jellyfin as browsers must reach it, no trailing slash. Unset = multi-server mode. */
  jellyfinUrl?: string
  serverName?: string
  /** Internal address of Seerr, no trailing slash. Unset = proxy disabled. */
  seerrUrl?: string
  /** Honour X-Forwarded-Proto/-Host/-For from a reverse proxy in front of this server. */
  trustProxy: boolean
  hsts: boolean
  /** Extra origins appended to the CSP connect/img/media sources. */
  extraCspOrigins: string[]
  maxBodyBytes: number
  upstreamTimeoutMs: number
  accessLog: boolean
}

export class ConfigError extends Error {}

function httpUrl(name: string, raw: string): URL {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new ConfigError(`${name} is not a valid URL: ${raw}`)
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new ConfigError(`${name} must start with http:// or https://: ${raw}`)
  }
  return u
}

function trimUrl(u: URL): string {
  return (u.origin + u.pathname).replace(/\/+$/, '')
}

function flag(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === '') return fallback
  return /^(1|true|yes|on)$/i.test(raw.trim())
}

function int(name: string, raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ConfigError(`${name} must be an integer between ${min} and ${max}, got: ${raw}`)
  }
  return n
}

export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const jf = env.JELLYFIN_URL?.trim()
  const seerr = env.SEERR_URL?.trim()
  let seerrUrl: string | undefined
  if (seerr) {
    // The SPA appends /api/v1/... itself; a base that already ends in it would double up.
    seerrUrl = trimUrl(httpUrl('SEERR_URL', seerr)).replace(/\/api\/v1$/, '')
  }
  const distDir = resolve(env.DIST_DIR?.trim() || fileURLToPath(new URL('../dist', import.meta.url)))
  let jellyfinUrl = jf ? trimUrl(httpUrl('JELLYFIN_URL', jf)) : undefined
  if (!jellyfinUrl) {
    // A serverUrl baked into dist/config.json locks the app to that server, so the CSP must be narrowed to it too.
    try {
      const raw = JSON.parse(readFileSync(join(distDir, 'config.json'), 'utf8')) as { serverUrl?: unknown }
      if (typeof raw.serverUrl === 'string' && raw.serverUrl) jellyfinUrl = trimUrl(httpUrl('serverUrl in config.json', raw.serverUrl))
    } catch {
      // none or invalid
    }
  }
  return {
    port: int('PORT', env.PORT, 8080, 1, 65535),
    host: env.HOST?.trim() || '0.0.0.0',
    distDir,
    jellyfinUrl,
    serverName: env.SERVER_NAME?.trim() || undefined,
    seerrUrl,
    trustProxy: flag(env.TRUST_PROXY, true),
    hsts: flag(env.HSTS, true),
    extraCspOrigins: (env.CSP_EXTRA_ORIGINS ?? '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((o) => httpUrl('CSP_EXTRA_ORIGINS', o).origin),
    maxBodyBytes: int('MAX_BODY_MB', env.MAX_BODY_MB, 10, 1, 1024) * 1024 * 1024,
    upstreamTimeoutMs: int('SEERR_TIMEOUT_SECONDS', env.SEERR_TIMEOUT_SECONDS, 30, 1, 600) * 1000,
    accessLog: flag(env.ACCESS_LOG, false),
  }
}
