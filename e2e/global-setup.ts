// Runs once before any browser starts: the throwaway Jellyfin must be up and seeded, or the run stops here with
// a message that says what to do (instead of dozens of timeouts).
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import type { FullConfig } from '@playwright/test'
import { JellyfinApi, authHeader } from './fixtures/api'
import { REPO_ROOT, e2eDeviceId, testServerAdmin, testServerEnv } from './fixtures/env'

const HINT =
  'Start the throwaway test server with `npm run ts:up` (first time on this machine: see tools/testserver/README.md; ' +
  'to reseed a broken server: `npm run ts:reset`).'

function fail(what: string): never {
  throw new Error(`\n\ne2e: ${what}\n${HINT}\n`)
}

/** Name of the playlist the "Add to playlist can create a new playlist" test makes: its creation time in base 36. */
const E2E_PLAYLIST = /^e2e playlist ([0-9a-z]+)$/
const STALE_AFTER_MS = 10 * 60_000

/**
 * Removes playlists that earlier runs of the playlist test left on the server. The test deletes its playlist, but
 * Jellyfin writes the playlist's metadata file a moment after creating it, which can be after the delete: the
 * folder stays on disk, and the server's next scheduled library scan lists it again as a playlist without an
 * owner. The app's permission lookup then answers 404 for each of them and the console guard fails every test
 * that opens "Add to playlist". Only the administrator may delete an ownerless playlist, so this is skipped when
 * its credentials are not in .env.local; playlists younger than ten minutes may belong to a run in progress.
 */
async function removeStalePlaylists(baseUrl: string): Promise<void> {
  const admin = testServerAdmin()
  if (!admin) return
  const deviceId = e2eDeviceId('global-setup-admin')
  const signIn = await fetch(`${baseUrl}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader(deviceId) },
    body: JSON.stringify({ Username: admin.user, Pw: admin.password }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!signIn.ok) return
  const { AccessToken: token, User } = (await signIn.json()) as { AccessToken: string; User: { Id: string } }
  const headers = { Authorization: authHeader(deviceId, token), Accept: 'application/json' }
  try {
    const query = new URLSearchParams({ userId: User.Id, includeItemTypes: 'Playlist', recursive: 'true', searchTerm: 'e2e playlist' })
    const res = await fetch(`${baseUrl}/Items?${query}`, { headers, signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return
    const { Items = [] } = (await res.json()) as { Items?: { Id: string; Name?: string }[] }
    for (const item of Items) {
      const created = parseInt(E2E_PLAYLIST.exec(item.Name ?? '')?.[1] ?? '', 36)
      if (!Number.isFinite(created) || Date.now() - created < STALE_AFTER_MS) continue
      await fetch(`${baseUrl}/Items/${item.Id}`, { method: 'DELETE', headers, signal: AbortSignal.timeout(15_000) }).catch(() => undefined)
    }
  } finally {
    await fetch(`${baseUrl}/Sessions/Logout`, { method: 'POST', headers }).catch(() => undefined)
  }
}

/** True when the Live TV guide still has a program that ends later than `hours` from now. */
async function guideReaches(api: JellyfinApi, hours: number): Promise<boolean> {
  const minEndDate = new Date(Date.now() + hours * 3_600_000).toISOString()
  const res = await api.request<{ Items?: unknown[] }>('GET', '/LiveTv/Programs', { query: { minEndDate, limit: 1, enableTotalRecordCount: false } })
  return (res.Items ?? []).length > 0
}

/**
 * The test server's guide is a file of dated programs, so it runs out; a guide without programs fails the Live TV
 * tests with a grid of "No data". The test server's own tool writes a new one (it needs the administrator's
 * credentials in .env.local and Docker, both present wherever the server itself was set up).
 */
async function renewGuideIfRunningOut(api: JellyfinApi): Promise<void> {
  if (await guideReaches(api, 3)) return
  spawnSync(process.execPath, [path.join(REPO_ROOT, 'tools', 'testserver', 'setup.mjs'), 'guide'], { cwd: REPO_ROOT, stdio: 'ignore', timeout: 180_000, windowsHide: true })
  if (!(await guideReaches(api, 3))) fail('the Live TV guide on the test server has run out and could not be renewed (`npm run ts:guide`).')
}

export default async function globalSetup(_config: FullConfig) {
  const env = testServerEnv()
  let info: { ProductName?: string; StartupWizardCompleted?: boolean; Version?: string }
  try {
    const res = await fetch(`${env.url}/System/Info/Public`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) fail(`the test Jellyfin at ${env.url} answered HTTP ${res.status}.`)
    info = (await res.json()) as typeof info
  } catch (e) {
    if (e instanceof Error && e.message.includes('e2e:')) throw e
    fail(`the test Jellyfin at ${env.url} is not reachable.`)
  }
  if (info.ProductName !== 'Jellyfin Server' || info.StartupWizardCompleted !== true) {
    fail(`${env.url} is not a provisioned Jellyfin (startup wizard not completed).`)
  }

  let api: JellyfinApi
  try {
    api = await JellyfinApi.signIn(e2eDeviceId('global-setup'))
  } catch {
    fail('the seeded test user cannot sign in (credentials in .env.local do not match the server).')
  }
  try {
    const [resume, nextUp, views] = await Promise.all([api.resumeItems(), api.nextUp(), api.userViews()])
    const missing: string[] = []
    if (resume.length === 0) missing.push('resume points (Continue watching)')
    if (nextUp.length === 0) missing.push('Next up entries')
    if (views.length === 0) missing.push('libraries')
    if (missing.length) fail(`the test server is not seeded: no ${missing.join(', ')} for the test user.`)
    const qc = await fetch(`${env.url}/QuickConnect/Enabled`).then((r) => r.text())
    if (qc.trim() !== 'true') fail('Quick Connect is disabled on the test server.')
    if (views.some((v) => v.CollectionType === 'livetv')) await renewGuideIfRunningOut(api)
  } finally {
    await api.dispose()
  }
  await removeStalePlaylists(env.url).catch(() => undefined)
  try {
    const second = await JellyfinApi.signIn(e2eDeviceId('global-setup'), 'user2')
    await second.dispose()
  } catch {
    fail('the second test user cannot sign in.')
  }
}
