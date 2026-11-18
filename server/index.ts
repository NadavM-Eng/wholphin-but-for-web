import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { ConfigError, loadConfig } from './config.ts'

let cfg
try {
  cfg = loadConfig()
} catch (e) {
  if (e instanceof ConfigError) {
    console.error(`Configuration error: ${e.message}`)
    process.exit(1)
  }
  throw e
}

const server = serve({ fetch: createApp(cfg).fetch, port: cfg.port, hostname: cfg.host }, (info) => {
  console.log(`Wholphin Web listening on ${cfg.host}:${info.port}`)
  console.log(`  serving ${cfg.distDir}`)
  console.log(`  Jellyfin: ${cfg.jellyfinUrl ?? 'not preset (users enter a server address)'}`)
  console.log(`  Seerr proxy: ${cfg.seerrUrl ? 'enabled' : 'disabled'}`)
})

function shutdown() {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 5000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
