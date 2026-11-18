/**
 * Deployment config served at /config.json (public/config.json, default `{}`).
 * - serverUrl: when set, the app is locked to this one Jellyfin server and skips the server list.
 * - serverName: display name fallback until /System/Info/Public answers.
 * - seerrProxyPath: same-origin path that proxies Seerr (default /seerr-proxy).
 */
export interface AppConfig {
  serverUrl?: string
  serverName?: string
  seerrProxyPath?: string
}

let config: AppConfig = {}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

export async function loadAppConfig(): Promise<AppConfig> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}config.json`, { cache: 'no-cache' })
    if (res.ok) {
      const raw: unknown = await res.json()
      if (raw && typeof raw === 'object') {
        const r = raw as Record<string, unknown>
        config = { serverUrl: str(r.serverUrl), serverName: str(r.serverName), seerrProxyPath: str(r.seerrProxyPath) }
      }
    }
  } catch {
    // no config.json (or invalid): normal multi-server mode
  }
  return config
}

export function getAppConfig(): AppConfig {
  return config
}

/** For tests and the dev tools. */
export function setAppConfig(next: AppConfig) {
  config = next
}
