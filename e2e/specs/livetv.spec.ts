// Live TV: the guide renders its channels and programs, a program opens the program dialog, and nothing the page
// does writes to the server. Recordings and timers fill disks: every write to them is answered here (never
// forwarded) and the test fails if one was even attempted.
import type { Page, Request } from '@playwright/test'
import { TAG, expect, test } from '../fixtures'

const LIVE_TV_WRITE = /\/LiveTv\/(Timers|SeriesTimers|Recordings)(\/|\?|$)/i

/** Answers Live TV writes locally and records them; GETs pass through. */
async function blockLiveTvWrites(page: Page): Promise<Request[]> {
  const writes: Request[] = []
  await page.route(LIVE_TV_WRITE, (route) => {
    const req = route.request()
    if (req.method() === 'GET') return route.continue()
    writes.push(req)
    return route.fulfill({ status: 204, body: '' })
  })
  return writes
}

test('the guide renders, a program opens its dialog, and no recording or timer is written', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app }) => {
  const writes = await blockLiveTvWrites(page)
  await app.goto('/livetv')
  await expect(page.getByRole('tab', { name: 'TV Guide' }).or(page.getByRole('tab').first())).toBeVisible()
  const channels = page.locator('[data-channel]')
  await expect(channels.first()).toBeVisible()
  expect(await channels.count()).toBeGreaterThanOrEqual(1)

  const program = page.locator('[data-focus-key^="lt-program:"]:not([data-fake])').first()
  await expect(program).toBeVisible()
  await program.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  expect(writes.map((r) => `${r.method()} ${r.url()}`)).toEqual([])
})

test('the Live TV library and a recording folder open the Live TV pages', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
  const writes = await blockLiveTvWrites(page)
  const views = await api.userViews()
  const live = views.find((v) => v.CollectionType === 'livetv')!
  await app.goto(`/library/${live.Id}`)
  await expect(page.locator('[data-channel]').first()).toBeVisible()
  await expect(app.routeStub).toHaveCount(0)

  // the recordings tab (third) draws browse's library grid with its toolbar
  await page.getByRole('tab').nth(2).click()
  await expect(page.getByRole('button', { name: 'View options' }).first()).toBeVisible()
  expect(writes).toHaveLength(0)
})

test('a click on a program after the keyboard left the first guide row opens that program', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app }) => {
  const writes = await blockLiveTvWrites(page)
  await app.goto('/livetv')
  const inGuide = () => page.evaluate(() => !!document.activeElement?.closest('[data-focus-key^="lt-program:"]'))
  await expect.poll(inGuide).toBe(true)
  // keyboard focus below the first row hides the tab row and the buttons
  await app.press('ArrowDown', 2)
  const tabs = page.getByRole('tablist').first()
  await expect.poll(() => tabs.evaluate((el) => !!el.closest('[inert]'))).toBe(true)
  await app.settle()
  // Pointer input shows them again and the guide moves down by their height. That happens on release now: when
  // it happened on the press, the release landed on another cell and the click was lost.
  // a program that is whole on screen, in the lowest row that has one, and not the focused one
  const key = await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll<HTMLElement>('[data-focus-key^="lt-program:"]:not([data-fake])')).filter((c) => {
      const r = c.getBoundingClientRect()
      return c !== document.activeElement && r.width > 60 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight
    })
    return cells.at(-1)?.getAttribute('data-focus-key') ?? null
  })
  expect(key, 'a program cell on screen').not.toBeNull()
  await page.locator(`[data-focus-key="${key}"]`).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect.poll(() => tabs.evaluate((el) => !!el.closest('[inert]'))).toBe(false)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  expect(writes.map((r) => `${r.method()} ${r.url()}`)).toEqual([])
})

test('the DVR tab opened by its address takes focus: its first row, or the selected tab when the schedule is empty', { tag: [TAG.keyboard] }, async ({ page, app }) => {
  const writes = await blockLiveTvWrites(page)
  await app.goto('/livetv?tab=1')
  await expect(page.getByRole('tab', { selected: true })).toHaveCount(1)
  // 'row' inside the schedule list, 'tab' on the selected tab; never <body> or another tab
  const where = () =>
    page.evaluate(() => {
      const a = document.activeElement
      if (a?.closest('[data-dvr-list]')) return 'row'
      return a?.getAttribute('role') === 'tab' && a.getAttribute('aria-selected') === 'true' ? 'tab' : (a?.tagName ?? null)
    })
  await expect(page.locator('[data-dvr-list]')).toBeAttached()
  const rows = await page.locator('[data-dvr-list] [data-focusable]').count()
  await expect.poll(where).toBe(rows > 0 ? 'row' : 'tab')
  expect(writes).toHaveLength(0)
})

test('a Live TV tab chosen with the mouse keeps focus; chosen with the keyboard, its content takes it', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app }) => {
  await blockLiveTvWrites(page)
  const where = () =>
    page.evaluate(() => {
      const a = document.activeElement
      if (a?.closest('[data-grid-index]')) return 'card'
      return a?.getAttribute('role') === 'tab' ? `tab:${a.getAttribute('aria-selected')}` : (a?.tagName ?? null)
    })
  await app.goto('/livetv')
  const recordings = page.getByRole('tab').nth(2)
  await expect(recordings, 'the test server has a recordings folder').toBeVisible()
  await recordings.click()
  await expect(page).toHaveURL(/[?&]tab=2/)
  await expect(page.locator('[data-page-root] [data-grid-index="0"]')).toBeVisible()
  await app.settle()
  // Nothing to poll for: the defect moved focus into the grid once the folder's cards had loaded.
  await page.waitForTimeout(500)
  expect(await where()).not.toBe('card')

  // the keyboard: Enter on the tab, as on the TV, hands focus to the folder's first card once it shows
  await app.goto('/livetv')
  await page.getByRole('tab').nth(2).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/[?&]tab=2/)
  await expect.poll(where).toBe('card')
})
