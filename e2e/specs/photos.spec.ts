// Photos: the photo library and album pages are the photos feature's grid; a photo opens the viewer.
import { TAG, expect, test } from '../fixtures'

test('a photo album opens the photo grid and a photo opens the viewer', { tag: [TAG.desktop, TAG.phone, TAG.engines, TAG.iphone] }, async ({ page, app, api }) => {
  const [album] = await api.items({ includeItemTypes: 'PhotoAlbum', limit: 1 })
  expect(album, 'the test server has a photo album').toBeTruthy()
  await app.goto(`/item/${album.Id}`)
  const grid = page.locator('[data-photo-folder]')
  await expect(grid).toBeVisible()
  await expect(app.routeStub).toHaveCount(0)

  const first = grid.locator('[data-card-surface]').first()
  await expect(first).toBeVisible()
  await app.activate(first)
  await expect(page).toHaveURL(/\/slideshow\//)
  await expect(page.locator('[data-slideshow-stage] img').first()).toBeVisible({ timeout: 15_000 })
})

test('the photo library opens the photo page', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
  const lib = (await api.userViews()).find((v) => v.CollectionType === 'photos' || v.CollectionType === 'homevideos')!
  await app.goto(`/library/${lib.Id}`)
  await expect(page.locator('[data-photo-folder]')).toBeVisible()
})

test('the slideshow keeps advancing, and the address follows the photo on screen', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app, api }) => {
  const [album] = await api.items({ includeItemTypes: 'PhotoAlbum', limit: 1 })
  const photos = await api.items({ parentId: album.Id, includeItemTypes: 'Photo' })
  expect(photos.length, 'the album has enough photos to watch a few changes').toBeGreaterThan(4)
  await app.goto(`/item/${album.Id}`)
  // the shortest duration: one second per photo
  await app.setPreference('slideshowDuration', 1000)
  const index = () => Number(new URL(page.url()).searchParams.get('index'))

  // stepping by hand: the address names the photo that shows, so a reload comes back to it
  await app.goto(`/slideshow/${album.Id}?index=0`)
  await expect(page.locator('[data-slideshow-stage] img').first()).toBeVisible({ timeout: 15_000 })
  await page.keyboard.press('ArrowRight')
  await expect.poll(index).toBe(1)
  await page.keyboard.press('ArrowRight')
  await expect.poll(index).toBe(2)
  const id = new URL(page.url()).searchParams.get('id')
  expect(id).toBeTruthy()
  // nothing is still loading when the page is reloaded (Firefox reports an aborted module import as an error)
  await app.settle()
  await page.reload()
  await app.settle()
  await expect(page.locator(`[data-slideshow-stage] img[src*="${id}"]`).first()).toBeVisible({ timeout: 15_000 })
  expect(index()).toBe(2)

  // the slideshow: it used to stop on the second photo in Chromium (the next photo is prefetched, its load event
  // ran before the "loading" hook and the timer that load had just armed was cancelled)
  await page.keyboard.press('Enter')
  const play = page.getByRole('button', { name: 'Play slideshow' })
  await expect(play).toBeFocused()
  // the overlay finishes opening (in WebKit a click in its first 100 ms hits a node that is replaced)
  await app.settle()
  await play.click()
  await expect(page.locator('[data-slideshow]')).toHaveAttribute('data-slideshow-state', 'running')
  const seen = new Set<number>([2])
  await expect
    .poll(
      () => {
        seen.add(index())
        return seen.size
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThanOrEqual(5)
})

test('Left from any letter of the photo grid returns to the card focused last, never to the nav drawer', { tag: [TAG.keyboard] }, async ({ page, app, api }) => {
  const [album] = await api.items({ includeItemTypes: 'PhotoAlbum', limit: 1 })
  await app.goto(`/item/${album.Id}`)
  await expect(app.focused).toHaveAttribute('data-card-surface', /.*/)
  const inGrid = () => page.evaluate(() => !!document.activeElement?.closest('[data-photo-folder] [data-grid-index]'))
  const inLetters = () => page.evaluate(() => document.activeElement?.hasAttribute('data-letter') ?? false)
  // Right along the first row until the letters take focus
  let last: string | null = null
  for (let i = 0; i < 20 && (await inGrid()); i++) {
    last = await app.focused.getAttribute('aria-label')
    await app.press('ArrowRight')
  }
  await expect.poll(inLetters).toBe(true)
  // far down the column, below every photo row in a 1440x900 window (Left from "T" opened the drawer)
  await app.press('ArrowDown', 20)
  expect(await inLetters()).toBe(true)
  await app.press('ArrowLeft')
  await expect(app.focused).toHaveAttribute('aria-label', last!)
  expect(await page.evaluate(() => !!document.activeElement?.closest('[data-shell-drawer]'))).toBe(false)
})
