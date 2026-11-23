// The subtitle style options inside the player (web addition): the sheet opens from the player's Settings, changes
// apply to the video at once, a sample line stands in while no subtitle is on screen, and a choice dialog opened
// from the sheet keeps its own keys. Playing reports progress (server state): writes project, the fixture restores
// the item's user data; the style preferences the test changes are put back.
import type { Page } from '@playwright/test'
import { TAG, expect, test } from '../fixtures'
import type { Item } from '../fixtures/api'

// Chromium builds without proprietary codecs cannot decode H.264; headless Edge can (still headless and muted).
test.use({ channel: 'msedge' })

async function playPaused(page: Page, item: Item, startMs: number) {
  await page.goto(`/play/${item.Id}?t=${startMs}`)
  await page.waitForFunction(
    (from) => {
      const v = document.querySelector('video')
      return !!v && v.readyState >= 2 && !v.seeking && v.currentTime > from + 0.3
    },
    startMs / 1000,
    { timeout: 30_000 },
  )
  const paused = () => page.locator('video').evaluate((v: HTMLVideoElement) => v.paused)
  await expect(async () => {
    if (!(await paused())) await page.keyboard.press('k')
    await expect.poll(paused, { timeout: 2_000 }).toBe(true)
  }).toPass({ timeout: 15_000 })
}

/** Leaves the player and waits for the stop report, so the server ends the playback session. */
async function leave(page: Page) {
  const stopped = page.waitForRequest((r) => /\/Sessions\/Playing\/Stopped/.test(r.url()), { timeout: 20_000 })
  for (let i = 0; i < 8 && new URL(page.url()).pathname.startsWith('/play'); i++) await page.keyboard.press('Escape')
  await (await stopped).response()
}

const dialogNames = (page: Page) => page.getByRole('dialog').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))

test('Settings > Subtitle style in the player: a sample line shows, colour and size change it at once, the nested dialog keeps its Escape', { tag: [TAG.writes] }, async ({ page, app, api }) => {
  test.setTimeout(120_000)
  const item = await api.findMovie('Big Buck Bunny')
  await api.snapshot(item.Id)
  await app.goto('/')
  await app.setPreference('controllerTimeout', 60_000)
  await page.setViewportSize({ width: 1600, height: 900 })
  await playPaused(page, item, 20_000)

  // controls up, then Settings > Subtitle style
  const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }))
  await page.mouse.move(w * 0.5, h * 0.4)
  await page.mouse.move(w * 0.5 + 12, h * 0.4 + 12)
  await page.locator('[data-player-button="settings"]').click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  const settingsWidth = (await settings.boundingBox())!.width
  // the menu is as wide as its longest label and the padding around it: no empty half beside the labels
  const longestLabel = await settings.evaluate((el) => Math.max(...Array.from(el.querySelectorAll('bdi'), (b) => b.getBoundingClientRect().width)))
  expect(longestLabel / settingsWidth).toBeGreaterThan(0.7)
  await settings.getByText('Subtitle style', { exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Subtitle style' })
  await expect(sheet).toBeVisible()
  // the sheet of sliders has the full compact width (under a quarter of this window, the TV's list would be a
  // third); the video shows through
  const sheetWidth = (await sheet.boundingBox())!.width
  expect(sheetWidth).toBeLessThan(400)
  expect(sheetWidth).toBeGreaterThan(settingsWidth)
  expect(await sheet.evaluate((el) => /\/ 0\.\d+\)$|,\s*0\.\d+\)$/.test(getComputedStyle(el).backgroundColor))).toBe(true)
  await expect(page.locator('[data-subtitle-style-note]')).toHaveCount(0)
  // the options of the Settings page, without the row that opens another page
  const rows = await sheet.locator('[data-pref-id]').evaluateAll((els) => els.map((el) => el.getAttribute('data-pref-id')))
  expect(rows).toEqual(expect.arrayContaining(['SubFontSize', 'SubFontColor', 'SubEdgeStyle', 'SubBackgroundStyle', 'SubMargin', 'SubReset']))
  expect(rows).not.toContain('SubtitleStyle')

  // no subtitle track is on: a sample line stands in, in the current style
  const sample = page.locator('[data-subtitle-sample]')
  await expect(sample).toHaveText('Subtitles will look like this')
  const look = () =>
    sample.evaluate((el) => {
      const text = getComputedStyle(el.querySelector('span span')!)
      return { size: parseFloat(text.fontSize), color: text.color }
    })
  const before = await look()
  expect(before.color).toBe('rgb(255, 255, 255)')

  // a choice opens its own dialog; Escape closes that one only
  const colour = sheet.locator('[data-pref-id="SubFontColor"]').getByRole('button').first()
  await colour.click()
  await expect.poll(() => dialogNames(page)).toEqual(['Subtitle style', 'Font color'])
  await page.keyboard.press('Escape')
  await expect.poll(() => dialogNames(page)).toEqual(['Subtitle style'])
  await colour.click()
  await page.getByRole('dialog', { name: 'Font color' }).getByText('Yellow', { exact: true }).click()
  await expect.poll(async () => (await look()).color).toBe('rgb(255, 255, 0)')

  // a slider with the arrow keys changes the size and does not seek the video
  await sheet.locator('[data-pref-id="SubFontSize"]').locator('[role="slider"], input[type="range"]').first().focus()
  const time = await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await look()).size).toBeGreaterThan(before.size)
  expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(time)

  // subtitles the options cannot restyle (here: drawn into the picture by the server, set through the dev hook):
  // the sheet says so, and no sample line pretends otherwise
  type Hook = { __playback: { store: { setState(p: unknown): void } } }
  await page.evaluate(() => (window as unknown as Hook).__playback.store.setState({ subtitle: { kind: 'burn-in', streamIndex: 3 }, subtitleIndex: 3 }))
  await expect(page.locator('[data-subtitle-style-note="burned"]')).toContainText('do not change them')
  await expect(sample).toHaveCount(0)
  await page.evaluate(() => (window as unknown as Hook).__playback.store.setState({ subtitle: null, subtitleIndex: null }))
  await expect(page.locator('[data-subtitle-style-note]')).toHaveCount(0)
  await expect(sample).toHaveCount(1)

  // Escape: back to Settings, then closed; the sample line goes with the sheet
  await sheet.locator('[data-pref-id="SubFontSize"]').locator('[role="slider"], input[type="range"]').first().focus()
  await page.keyboard.press('Escape')
  await expect(settings).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(sample).toHaveCount(0)
  await expect(page).toHaveURL(/\/play\//)

  await app.setPreference('subFontColor', 0xffffff)
  await app.setPreference('subFontSize', 24)
  await leave(page)
})
