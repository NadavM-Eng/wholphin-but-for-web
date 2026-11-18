// Test-server settings for the e2e suite. Values come from the environment, else from `.env.local` at the repo
// root (written by `npm run ts:up` / tools/testserver/setup.mjs). Secrets are never logged: error messages name
// the missing keys only.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Port of the Vite dev server the suite drives (one port per working copy; override with E2E_PORT). */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 5601)
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`

/**
 * Separates runs from different working copies or agents on one machine: their output folders, storage states
 * and device ids (a shared device id makes one run revoke the other run's tokens). E2E_RUN_ID, else the port
 * when it is not the default one.
 */
export const E2E_RUN_ID = process.env.E2E_RUN_ID ?? (E2E_PORT === 5601 ? '' : String(E2E_PORT))

/** Device id of a suite session: `wholphin-e2e-[<run>-]<name>`. */
export const e2eDeviceId = (name: string) => `wholphin-e2e-${E2E_RUN_ID ? `${E2E_RUN_ID}-` : ''}${name}`

function readEnvFile(): Record<string, string> {
  const file = path.join(REPO_ROOT, '.env.local')
  if (!existsSync(file)) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

let cached: TestServerEnv | null = null

export interface TestServerEnv {
  /** base URL of the throwaway Jellyfin (http://localhost:8097), no trailing slash */
  url: string
  /** the seeded user (`tester`): resume points, next up, favourites */
  user: string
  password: string
  /** second user (`Casey Rivera`, parental limit) for switch-user tests */
  user2: string
  password2: string
}

/** Reads TESTSRV_* (process env first, then .env.local). Throws with a setup hint when a key is missing. */
export function testServerEnv(): TestServerEnv {
  if (cached) return cached
  const file = readEnvFile()
  const get = (k: string) => process.env[k] ?? file[k]
  const keys = ['TESTSRV_URL', 'TESTSRV_USER', 'TESTSRV_PASSWORD', 'TESTSRV_USER2', 'TESTSRV_PASSWORD2'] as const
  const missing = keys.filter((k) => !get(k))
  if (missing.length) {
    throw new Error(
      `e2e: ${missing.join(', ')} missing from .env.local. Provision the throwaway Jellyfin first: ` +
        '`npm run ts:up` (first time: see tools/testserver/README.md).',
    )
  }
  const url = get('TESTSRV_URL')!.replace(/\/+$/, '')
  // The suite writes user data (favourites, watched state). It must never point at a real server.
  if (/:8096\b/.test(url)) throw new Error('e2e: TESTSRV_URL points at port 8096 (the real Jellyfin). The suite only runs against the throwaway server.')
  cached = {
    url,
    user: get('TESTSRV_USER')!,
    password: get('TESTSRV_PASSWORD')!,
    user2: get('TESTSRV_USER2')!,
    password2: get('TESTSRV_PASSWORD2')!,
  }
  return cached
}

/**
 * The throwaway server's administrator (TESTSRV_ADMIN_USER / TESTSRV_ADMIN_PASSWORD), or null when not configured.
 * Only for the global setup's clean-up of leftovers that the test user may not delete; no test signs in with it.
 */
export function testServerAdmin(): { user: string; password: string } | null {
  const file = readEnvFile()
  const get = (k: string) => process.env[k] ?? file[k]
  const user = get('TESTSRV_ADMIN_USER')
  const password = get('TESTSRV_ADMIN_PASSWORD')
  return user && password ? { user, password } : null
}

/**
 * The limited account of the real server (TEST_JELLYFIN_USER / TEST_JELLYFIN_PASSWORD), which is also the
 * Seerr test account: only for the read-only Discover spec (`discover.spec.ts`). Null when not configured.
 */
export function realServerAccount(): { user: string; password: string } | null {
  const file = readEnvFile()
  const get = (k: string) => process.env[k] ?? file[k]
  const user = get('TEST_JELLYFIN_USER')
  const password = get('TEST_JELLYFIN_PASSWORD')
  return user && password ? { user, password } : null
}
