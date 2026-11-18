import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import type { Context } from 'hono'
import { getMimeType } from 'hono/utils/mime'

const IMMUTABLE = 'public, max-age=31536000, immutable'

/**
 * Serves the Vite build. Hashed files under /assets/ are immutable; everything else (index.html,
 * favicon, config) revalidates with an ETag so a redeploy shows up on the next load.
 * Extension-less paths are client routes and get index.html; a missing file with an extension is a real 404.
 */
export function createStaticHandler(distDir: string) {
  const root = resolve(distDir)

  async function find(pathname: string): Promise<string | null> {
    let decoded: string
    try {
      decoded = decodeURIComponent(pathname)
    } catch {
      return null
    }
    if (decoded.includes('\0') || decoded.includes('\\')) return null
    const full = resolve(join(root, decoded))
    if (full !== root && !full.startsWith(root + sep)) return null
    // Dotfiles (.env, .git, ...) are never served.
    if (decoded.split('/').some((s) => s.startsWith('.'))) return null
    return full
  }

  async function file(path: string) {
    try {
      const s = await stat(path)
      return s.isFile() ? s : null
    } catch {
      return null
    }
  }

  return async (c: Context): Promise<Response> => {
    const method = c.req.method
    if (method !== 'GET' && method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } })
    }
    const pathname = new URL(c.req.url).pathname
    let path = await find(pathname)
    if (!path) return new Response('Not Found', { status: 404 })
    let st = await file(path)
    const hasExt = extname(pathname) !== ''
    if (!st && pathname !== '/' && (hasExt || pathname.startsWith('/assets/'))) {
      return new Response('Not Found', { status: 404, headers: { 'cache-control': 'no-store' } })
    }
    if (!st || pathname.endsWith('/')) {
      path = join(root, 'index.html')
      st = await file(path)
      if (!st) return new Response('Application not built (dist/index.html missing)', { status: 503 })
    }
    const isIndex = path === join(root, 'index.html')
    const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`
    const headers = new Headers({
      'content-type': getMimeType(path) ?? 'application/octet-stream',
      'cache-control': !isIndex && pathname.startsWith('/assets/') ? IMMUTABLE : 'no-cache',
      etag,
      'last-modified': st.mtime.toUTCString(),
    })
    if (c.req.header('if-none-match') === etag) return new Response(null, { status: 304, headers })
    headers.set('content-length', String(st.size))
    if (method === 'HEAD') return new Response(null, { status: 200, headers })
    return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, { status: 200, headers })
  }
}
