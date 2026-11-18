import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import pxtorem from 'postcss-pxtorem'
import { loadEnv, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { devSession } from './tools/vite-dev-session.ts'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

/**
 * Dev only: the dev server serves the project root, and on a case-insensitive disk `/license` (an app route)
 * resolves to the repository's LICENSE file. Page loads (Accept: text/html) of extension-less paths go to the
 * SPA instead. Production serves dist/, which has no such files.
 */
function spaRoutesOverRootFiles(): Plugin {
  return {
    name: 'ww-spa-routes-over-root-files',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? ''
        const isPageLoad = req.method === 'GET' && /^\/[a-z-]+$/i.test(path) && !!req.headers.accept?.includes('text/html')
        if (!isPageLoad || !existsSync(resolve(server.config.root, path.slice(1)))) return next()
        server
          .transformIndexHtml(req.url ?? '/', readFileSync(resolve(server.config.root, 'index.html'), 'utf8'))
          .then((html) => {
            res.setHeader('Content-Type', 'text/html')
            res.end(html)
          })
          .catch(next)
      })
    },
  }
}

/**
 * Supported browsers (lead decision): the stylesheets need relative colour syntax (`rgb(from …)`) and
 * `color-mix()`, which set the floor at Chrome/Edge 119, Firefox 128 and Safari 16.4. index.html shows a
 * "browser too old" notice below that (feature test, keep the two in sync).
 */
const BROWSER_TARGETS = ['chrome119', 'edge119', 'firefox128', 'safari16.4']

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const seerr = env.DEV_SEERR_URL
  // Only this checkout's own worktrees folder: a dev server started inside a worktree (whose path contains
  // `.worktrees/`) must still watch its own sources.
  const ownWorktrees = `${process.cwd().replaceAll('\\', '/')}/.worktrees/**`

  return {
    // devSession() only registers in `vite serve` (apply: 'serve'); it is never part of a build.
    plugins: [react(), devSession(), spaRoutesOverRootFiles()],
    // Parallel dev servers (one per agent) each need their own optimizer cache.
    cacheDir: process.env.WW_VITE_CACHE || 'node_modules/.vite',
    // scan only the app's entry; HTML files under shots/out and reference/ made the scan fail noisily
    optimizeDeps: { entries: ['index.html'] },
    build: {
      target: BROWSER_TARGETS,
      cssTarget: BROWSER_TARGETS,
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    css: {
      modules: { localsConvention: 'camelCaseOnly' },
      postcss: {
        plugins: [
          // CSS is authored in px where 1px = 1 Android dp. Converting to rem lets the root font
          // size scale the whole interface (see src/theme/scale.ts). `1PX` (uppercase) is left alone.
          pxtorem({ rootValue: 16, propList: ['*'], minPixelValue: 0, mediaQuery: false, exclude: /node_modules/i }),
        ],
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      watch: { ignored: [ownWorktrees, '**/reference/**', '**/dev/testserver/data/**', '**/refshots/**', '**/shots/out/**'] },
      proxy: seerr
        ? {
            // Seerr sends no CORS headers and uses a session cookie, so the browser must reach it
            // same-origin. Production does the same through server/.
            '/seerr-proxy': {
              target: seerr,
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/seerr-proxy/, ''),
            },
          }
        : undefined,
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}', 'tools/**/*.test.ts', 'server/**/*.test.ts'],
    },
  }
})
