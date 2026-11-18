// The video player against the throwaway server: a few seconds of the Codec Zoo H.264 file in headless Edge (real
// codecs), pause, seek, exit, and the stop position the player reported to the server. Playing reports progress,
// which is server state, so the tests run in the writes project and the fixture restores the item's user data.
import { TAG, expect, test } from '../fixtures'

// Chromium builds without proprietary codecs cannot decode H.264; headless Edge can (still headless and muted).
test.use({ channel: 'msedge' })

const video = 'video'

// both tests use the same item: one at a time
test.describe.configure({ mode: 'serial' })

test('play a few seconds, pause, seek, exit; the stop position is reported to the server', { tag: [TAG.writes] }, async ({ page, app, api }) => {
  const item = await api.findMovie('H.264 AAC Baseline')
  // the item keeps a resume point throughout (Home tests running in parallel list it); the fixture restores it
  await api.snapshot(item.Id)

  const started = Date.now()
  await app.goto(`/play/${item.Id}`)
  // decoding and advancing
  await page.waitForFunction((sel) => {
    const v = document.querySelector<HTMLVideoElement>(sel)
    return !!v && v.readyState >= 2 && v.currentTime > 2
  }, video, { timeout: 30_000 })

  // pause (k = play / pause, as the shortcut list says)
  await page.keyboard.press('k')
  await expect.poll(() => page.locator(video).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)

  // seek: 5 = jump to 50 % (the file is 90 s long)
  await page.keyboard.press('5')
  await expect.poll(() => page.locator(video).evaluate((v: HTMLVideoElement) => Math.round(v.currentTime))).toBeGreaterThan(35)
  const at = await page.locator(video).evaluate((v: HTMLVideoElement) => v.currentTime)

  const stopped = page.waitForRequest((r) => /\/Sessions\/Playing\/Stopped/.test(r.url()), { timeout: 15_000 })
  // exit with Back (Escape hides the controls first, then leaves)
  await page.keyboard.press('Escape')
  if (new URL(page.url()).pathname.startsWith('/play/')) await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/\/play\//)

  // the Stopped report carries the position where playback stopped...
  const report = JSON.parse((await stopped).postData() ?? '{}') as { ItemId?: string; PositionTicks?: number; Failed?: boolean }
  expect(report.ItemId).toBe(item.Id)
  expect(report.Failed).toBe(false)
  expect(Math.abs((report.PositionTicks ?? 0) / 10_000_000 - at)).toBeLessThan(3)
  // ...and the server took it: the item's last played date moved. (A 90 s file is shorter than Jellyfin's
  // MinResumeDurationSeconds, 300, so the server marks it played instead of keeping a resume point.)
  await expect.poll(async () => Date.parse((await api.userData(item.Id)).LastPlayedDate ?? '') || 0, { timeout: 15_000 }).toBeGreaterThan(started - 5_000)
})

test('the detail page Play button opens the player at the resume point', { tag: [TAG.writes] }, async ({ page, app, api }) => {
  const item = await api.findMovie('H.264 AAC Baseline')
  await api.snapshot(item.Id)
  await api.setUserData(item.Id, { PlaybackPositionTicks: 30 * 10_000_000, Played: false })
  await app.goto(`/item/${item.Id}`)
  await app.detailButtons.getByRole('button', { name: /^resume/i }).first().click()
  await expect(page).toHaveURL((u) => u.pathname === `/play/${item.Id}` && Number(u.searchParams.get('t')) === 30_000)
  await page.waitForFunction((sel) => {
    const v = document.querySelector<HTMLVideoElement>(sel)
    return !!v && v.readyState >= 2 && v.currentTime >= 29
  }, video, { timeout: 30_000 })
  await page.keyboard.press('k')
  await page.keyboard.press('Escape')
  if (new URL(page.url()).pathname.startsWith('/play/')) await page.keyboard.press('Escape')
  await expect(page).toHaveURL((u) => u.pathname === `/item/${item.Id}`)
})
