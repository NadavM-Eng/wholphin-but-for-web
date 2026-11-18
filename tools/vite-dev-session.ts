// Dev-only Vite middleware: GET /__dev/session signs in to a test Jellyfin server with credentials from
// .env.local (read server-side; the password never reaches the browser bundle or any log) and returns
// { serverUrl, serverInfo, user, accessToken }. The browser route /dev/login consumes it.
//   (default)       TEST_JELLYFIN_URL / TEST_JELLYFIN_USER / TEST_JELLYFIN_PASSWORD
//   ?server=test    TESTSRV_URL / TESTSRV_USER / TESTSRV_PASSWORD
// Optional ?deviceId=&deviceName= let the token belong to the browser's own device identity.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadEnv, type Plugin } from 'vite'

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

const quote = (s: string) => s.replace(/["\\\r\n]/g, '_')

export function devSession(): Plugin {
  return {
    name: 'wholphin-dev-session',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/session', (req: IncomingMessage, res: ServerResponse) => {
        void handle(req, res)
      })

      async function handle(req: IncomingMessage, res: ServerResponse) {
        if (req.method !== 'GET') return send(res, 405, { error: 'GET only' })
        // Re-read on every request so keys added to .env.local later are picked up without a restart.
        const env = loadEnv(server.config.mode, server.config.envDir || server.config.root, '')
        const q = new URL(req.url ?? '/', 'http://dev.local').searchParams
        const which = q.get('server') === 'test' ? 'test' : 'default'
        const [urlKey, userKey, passKey] =
          which === 'test'
            ? ['TESTSRV_URL', 'TESTSRV_USER', 'TESTSRV_PASSWORD']
            : ['TEST_JELLYFIN_URL', 'TEST_JELLYFIN_USER', 'TEST_JELLYFIN_PASSWORD']
        const baseUrl = env[urlKey]?.trim().replace(/\/+$/, '')
        const username = env[userKey]
        const password = env[passKey] ?? ''
        if (!baseUrl || !username) {
          return send(res, 404, { error: `${urlKey}/${userKey} not set in .env.local` })
        }
        const deviceId = (q.get('deviceId') ?? 'wholphin-web-dev-session').slice(0, 64)
        const deviceName = (q.get('deviceName') ?? 'Vite dev server').slice(0, 64)
        const authorization = `MediaBrowser Client="Wholphin Web", Device="${quote(deviceName)}", DeviceId="${quote(deviceId)}", Version="dev"`
        try {
          const infoRes = await fetch(`${baseUrl}/System/Info/Public`, { signal: AbortSignal.timeout(6000) })
          if (!infoRes.ok) return send(res, 502, { error: `System/Info/Public returned ${infoRes.status}` })
          const serverInfo: unknown = await infoRes.json()
          const authRes = await fetch(`${baseUrl}/Users/AuthenticateByName`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: authorization },
            body: JSON.stringify({ Username: username, Pw: password }),
            signal: AbortSignal.timeout(10000),
          })
          if (!authRes.ok) return send(res, 502, { error: `AuthenticateByName returned ${authRes.status}` })
          const auth = (await authRes.json()) as { AccessToken?: string; User?: unknown }
          if (!auth.AccessToken) return send(res, 502, { error: 'No access token in response' })
          return send(res, 200, { serverUrl: baseUrl, serverInfo, user: auth.User, accessToken: auth.AccessToken })
        } catch (err) {
          return send(res, 502, { error: err instanceof Error ? err.message : 'request failed' })
        }
      }
    },
  }
}
