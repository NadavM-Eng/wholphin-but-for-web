// Starts (or reuses) the Vite dev server for the crawler.
import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

async function up(origin: string): Promise<boolean> {
  try {
    const res = await fetch(`${origin}/__dev/session?probe=1`, { signal: AbortSignal.timeout(2500) })
    // the middleware answers JSON (even an error body) only when it is our Vite dev server
    return (res.headers.get('content-type') ?? '').includes('json')
  } catch {
    return false
  }
}

export interface DevServer {
  origin: string
  /** true when this process started it */
  owned: boolean
  stop(): void
}

export async function ensureDevServer(opts: { port: number; url: string | null }): Promise<DevServer> {
  const origin = opts.url ?? `http://localhost:${opts.port}`
  if (await up(origin)) {
    console.log(`[shots] reusing dev server at ${origin}`)
    return { origin, owned: false, stop() {} }
  }
  if (opts.url) throw new Error(`No Vite dev server answers at ${origin}`)
  console.log(`[shots] starting dev server on port ${opts.port}`)
  const vite = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
  const child: ChildProcess = spawn(process.execPath, [vite, '--port', String(opts.port), '--strictPort'], {
    cwd: ROOT,
    env: { ...process.env, WW_VITE_CACHE: `node_modules/.vite-${opts.port}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  child.stdout?.on('data', (d: Buffer) => (log += d.toString()))
  child.stderr?.on('data', (d: Buffer) => (log += d.toString()))
  let exited = false
  child.on('exit', () => (exited = true))
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (exited) throw new Error(`Vite exited early:\n${log.slice(-1500)}`)
    if (await up(origin)) break
    await new Promise((r) => setTimeout(r, 400))
  }
  if (!(await up(origin))) {
    child.kill()
    throw new Error(`Vite did not come up on ${origin}:\n${log.slice(-1500)}`)
  }
  return {
    origin,
    owned: true,
    stop() {
      if (!exited) child.kill()
    },
  }
}
