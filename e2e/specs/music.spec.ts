// Music: the music library and album pages are the music feature's (not the generic grid), Play fills the music
// queue and the mini player shows its progress without covering the page.
import { TAG, expect, test } from '../fixtures'

test('the music library opens the music page, not the generic grid', { tag: [TAG.desktop, TAG.phone, TAG.engines, TAG.iphone] }, async ({ page, app, api }) => {
  const music = (await api.userViews()).find((v) => v.CollectionType === 'music')!
  await app.goto(`/library/${music.Id}`)
  // CollectionFolderMusic's five tabs (the generic grid has none)
  await expect(page.getByRole('tab')).toHaveCount(5)
  await expect(page.getByRole('tab', { name: 'Artists' })).toBeVisible()
  await expect(app.routeStub).toHaveCount(0)
})

test('album Play starts the music queue; the mini player shows progress and stays clear of the page', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app, api }) => {
  const album = await api.findItem('MusicAlbum', 'After Hours')
  await app.goto(`/item/${album.Id}`)
  await expect(page.locator('[data-focus-key^="album-song:"]').first()).toBeVisible()
  await page.getByRole('button', { name: /^play$/i }).first().click()

  const bar = page.locator('[data-mini-player]')
  await expect(bar).toBeVisible({ timeout: 10_000 })
  // the progress fill moves once audio decodes
  await expect
    .poll(() => bar.locator('[aria-hidden] > div').first().evaluate((d: HTMLElement) => parseFloat(d.style.width) || 0), { timeout: 15_000 })
    .toBeGreaterThan(0)
  // the body is padded by the bar's height, so the page's end is never under it
  await expect(page.locator('body')).toHaveAttribute('data-music-bar', /.*/)
  const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom))
  const barHeight = (await bar.boundingBox())!.height
  expect(pad).toBeGreaterThanOrEqual(barHeight - 1)

  await bar.getByRole('button', { name: /^pause$/i }).click()
  await expect(bar.getByRole('button', { name: /^play$/i })).toBeVisible()
})

test('an arrow key with nothing focused brings the last focused song back clear of the mini player', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
  // a short window, so the album page scrolls
  await page.setViewportSize({ width: 1440, height: 480 })
  const album = await api.findItem('MusicAlbum', 'After Hours')
  await app.goto(`/item/${album.Id}`)
  const songs = page.locator('[data-focus-key^="album-song:"]')
  await expect(songs.first()).toBeVisible()
  await page.getByRole('button', { name: /^play$/i }).first().click()
  const bar = page.locator('[data-mini-player]')
  await expect(bar).toBeVisible({ timeout: 10_000 })
  await bar.getByRole('button', { name: /^pause$/i }).click()
  await expect(bar.getByRole('button', { name: /^play$/i })).toBeVisible()

  // the last song had the focus; then the page was scrolled until the song sat just under the window's end, and
  // focus was dropped (a wheel scroll and a click on empty page space)
  const last = songs.last()
  await last.focus()
  await page.evaluate(() => {
    const el = document.activeElement as HTMLElement
    window.scrollBy(0, el.getBoundingClientRect().top - window.innerHeight - 4)
    el.blur()
  })
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  await expect(last).not.toBeInViewport()

  await app.press('ArrowDown')
  await expect(last).toBeFocused()
  // scrolled like an arrow-key move: the window ends above the bar, the song is not put under it
  const row = (await last.boundingBox())!
  const barBox = (await bar.boundingBox())!
  expect(row.y + row.height).toBeLessThanOrEqual(barBox.y + 1)
})

test('Down from the last Home row enters the mini player', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
  const album = await api.findItem('MusicAlbum', 'After Hours')
  await app.goto(`/item/${album.Id}`)
  await expect(page.locator('[data-focus-key^="album-song:"]').first()).toBeVisible()
  await page.getByRole('button', { name: /^play$/i }).first().click()
  const bar = page.locator('[data-mini-player]')
  await expect(bar).toBeVisible({ timeout: 10_000 })
  await bar.getByRole('button', { name: /^pause$/i }).click()
  await expect(bar.getByRole('button', { name: /^play$/i })).toBeVisible()

  // Home without a reload (the queue lives in the page)
  await app.drawer.hover()
  await app.drawer.getByRole('link', { name: 'Home' }).click()
  await app.expectHome()
  await app.settle()
  // the pointer leaves the drawer; the keyboard starts from the first card
  await page.mouse.move(900, 300)
  await expect(app.drawer).not.toHaveAttribute('data-open')
  await app.homeCard('0:0').focus()
  const inBar = () => bar.evaluate((el) => el.contains(document.activeElement))
  // down the rows: the last row used to swallow the key, so the bar was out of reach with the arrows
  for (let i = 0; i < 40 && !(await inBar()); i++) await app.press('ArrowDown')
  expect(await inBar()).toBe(true)
  // and Up returns to the page
  await app.press('ArrowUp')
  await expect.poll(() => app.focusedHomePos()).not.toBeNull()
})

test('Now Playing still answers keys after the focused lyric line went away with its track', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
  // the first track of this album has lyrics, the second has none
  const album = await api.findItem('MusicAlbum', 'Hollow Light')
  // playing reports progress and marks a short track played: the fixture puts the songs' user data back
  for (const song of await api.items({ parentId: album.Id, includeItemTypes: 'Audio' })) await api.snapshot(song.Id)
  await app.goto(`/item/${album.Id}`)
  await expect(page.locator('[data-focus-key^="album-song:"]').first()).toBeVisible()
  await page.getByRole('button', { name: /^play$/i }).first().click()
  const bar = page.locator('[data-mini-player]')
  await expect(bar).toBeVisible({ timeout: 10_000 })
  await bar.locator('a[href="/now-playing"]').click()
  await expect(page).toHaveURL(/\/now-playing/)
  const lyrics = page.getByRole('list', { name: 'Lyrics' })
  await expect(lyrics).toBeVisible()
  // the controls hide after five seconds without input
  const controls = page.locator('[data-now-playing] [data-visible]')
  await expect(controls).toHaveCount(0, { timeout: 15_000 })
  await page.keyboard.press('ArrowUp')
  await expect.poll(() => lyrics.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  // the next track: the lyrics pane and its focused line are removed, and no blur event tells the page
  await page.keyboard.press('MediaTrackNext')
  await expect(lyrics).toHaveCount(0, { timeout: 15_000 })
  // an arrow key shows the controls again (the page ignored arrows, Enter, the mouse and Escape)
  await page.keyboard.press('ArrowDown')
  await expect(controls).toHaveCount(1)
  // Escape hides them, Escape again leaves the page
  await page.keyboard.press('Escape')
  await expect(controls).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL((u) => !u.pathname.includes('now-playing'))
  await expect(bar).toBeVisible()
  await bar.getByRole('button', { name: /^pause$/i }).click()
  await expect(bar.getByRole('button', { name: /^play$/i })).toBeVisible()
})
