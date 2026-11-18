// Discover (Seerr) against the real server, read-only: the limited test account signs in to Jellyfin and to
// Seerr (through the dev proxy); every other Seerr write (a request, a cancel) is answered here and never reaches
// Seerr. Skipped when the real-server account is not configured.
import type { Page, Request } from '@playwright/test'
import { SIGNED_OUT, TAG, expect, test } from '../fixtures'
import { realServerAccount } from '../fixtures/env'

test.use(SIGNED_OUT)

/** Answers every Seerr write but the sign-in locally; returns the writes the page attempted. */
async function mockSeerrWrites(page: Page): Promise<Request[]> {
  const writes: Request[] = []
  await page.route('**/seerr-proxy/api/v1/**', (route) => {
    const req = route.request()
    if (req.method() === 'GET' || /\/auth\/jellyfin$/.test(req.url())) return route.continue()
    writes.push(req)
    const body = /\/request$/.test(req.url())
      ? JSON.stringify({ id: 999999, status: 1, createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z', is4k: false })
      : '{}'
    return route.fulfill({ status: req.method() === 'POST' ? 201 : 200, contentType: 'application/json', body })
  })
  return writes
}

/** Signs the page in to Seerr with the test account and records the link for the signed-in Jellyfin user. */
async function linkSeerr(page: Page, account: { user: string; password: string }) {
  const result = await page.evaluate(async (c) => {
    const login = await fetch('/seerr-proxy/api/v1/auth/jellyfin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: c.user, password: c.password }),
      credentials: 'include',
    })
    if (!login.ok) return `login ${login.status}`
    const me = (await (await fetch('/seerr-proxy/api/v1/auth/me', { credentials: 'include' })).json()) as { id: number }
    const raw = JSON.parse(localStorage.getItem('wholphin.session.v1') ?? '{}') as { state?: { mostRecent?: { serverId?: string; userId?: string } } }
    const cur = raw.state?.mostRecent
    if (!cur?.serverId || !cur.userId) return 'no session'
    const key = `${cur.serverId.replace(/-/g, '').toLowerCase()}:${cur.userId.replace(/-/g, '').toLowerCase()}`
    const links = JSON.parse(localStorage.getItem('wholphin.seerr.links.v1') ?? '{}') as Record<string, unknown>
    links[key] = { method: 'jellyfin', username: c.user, seerrUserId: me.id, linkedAt: Date.now() }
    localStorage.setItem('wholphin.seerr.links.v1', JSON.stringify(links))
    return 'ok'
  }, account)
  expect(result, 'Seerr sign-in through the dev proxy').toBe('ok')
}

test('Discover: drawer entry, rows, a title page, and a request that never reaches Seerr', { tag: [TAG.desktop] }, async ({ page, app, guard }) => {
  const account = realServerAccount()
  test.skip(!account, 'TEST_JELLYFIN_USER / TEST_JELLYFIN_PASSWORD not configured')
  // titles without Rotten Tomatoes data answer 404 on /ratings; the UI ignores it like upstream
  guard.allow(/^http 404 GET \S+\/seerr-proxy\/api\/v1\/(movie|tv)\/\d+\/ratings$/, 'Seerr has no ratings for some titles')
  const writes = await mockSeerrWrites(page)

  // the real server, as the limited account (read-only)
  await page.goto('/dev/login?next=/')
  await page.waitForURL((u) => !u.pathname.startsWith('/dev/'), { timeout: 30_000 })
  await app.settle()
  await linkSeerr(page, account!)
  await page.reload()
  await app.settle()

  // the drawer lists Discover once Seerr is linked
  await app.drawer.hover()
  const entry = app.drawer.getByRole('link', { name: 'Discover' })
  await expect(entry).toBeVisible()
  await entry.click()
  await expect(page).toHaveURL(/\/discover$/)
  const cards = page.locator('[data-focus-key^="discover:"]')
  await expect(cards.first()).toBeVisible({ timeout: 20_000 })

  // tmdb 2 ("Ariel", 1988) is not in the library, so Request is offered; the simple flow submits at once
  await app.goto('/discover/movie/2')
  const request = page.getByRole('button', { name: /^request$/i }).first()
  await expect(request).toBeVisible({ timeout: 15_000 })
  await request.click()
  await expect.poll(() => writes.filter((w) => w.method() === 'POST' && /\/request$/.test(w.url())).length).toBeGreaterThan(0)
  // nothing but the mocked request was written
  expect(writes.every((w) => /\/request$/.test(w.url()))).toBe(true)
})
