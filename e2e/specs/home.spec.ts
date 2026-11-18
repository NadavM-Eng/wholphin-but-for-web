// Home: the seeded rows, the header and backdrop following the hovered (mouse) or focused (keyboard) card, and
// arrow-key navigation across rows and into / out of the drawer.
import { TAG, expect, test } from '../fixtures'
import type { App } from '../fixtures/app'

/** Item id in a Home card href: /item/<id>, /series/<id>?…&episode=<id>, /play/<id>. */
function idsInHref(href: string | null): string[] {
  return href ? Array.from(href.matchAll(/[0-9a-f]{32}/g), (m) => m[0]) : []
}

async function cardLabel(app: App, pos: string) {
  return app.homeCard(pos).getAttribute('aria-label')
}

const backdropImage = (app: App) => app.page.locator('[data-shell-backdrop] img')

test('Continue watching lists the seeded resume items and Next up entries', { tag: [TAG.desktop, TAG.phone, TAG.engines, TAG.iphone] }, async ({ app, api }) => {
  const [resume, nextUp] = await Promise.all([api.resumeItems(), api.nextUp()])
  await app.goto('/')
  await app.expectHome()

  const row = app.homeRow('Continue watching')
  await expect(row).toHaveCount(1)
  // the combined row comes first (default home rows)
  await expect(app.homeRows.first().getByRole('region')).toHaveAccessibleName('Continue watching')
  const shown = new Set((await row.locator('[data-home-pos]').evaluateAll((els) => els.map((e) => e.getAttribute('href')))).flatMap(idsInHref))
  for (const item of resume) expect(shown, `resume item "${item.Name}" in Continue watching`).toContain(item.Id)
  for (const item of nextUp) expect(shown, `next up "${item.SeriesName} – ${item.Name}" in Continue watching`).toContain(item.Id)

  await expect(app.homeRow('Recently added in Movies')).toHaveCount(1)
})

test('the View more grid of a row lists at least the row items', { tag: [TAG.desktop, TAG.phone] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  const row = app.homeRow('Recently added in Movies')
  const index = await row.getAttribute('data-home-row')
  const inRow = await row.locator('[data-home-pos]').evaluateAll((els) => els.map((e) => e.getAttribute('href')))

  await app.goto(`/home/row/${index}`)
  await expect(page.getByRole('heading', { name: 'Recently added in Movies' })).toBeVisible()
  const inGrid = await app.pageRoot.locator('[data-card-surface]').evaluateAll((els) => els.map((e) => e.getAttribute('href')))
  // the grid is virtualized: compare the first items, which are on screen
  for (const href of inRow.slice(0, 6)) if (!href?.startsWith('/home/row/')) expect(inGrid).toContain(href)
})

test('the header and the backdrop follow the hovered card', { tag: [TAG.desktop, TAG.engines] }, async ({ app, api }) => {
  await app.goto('/')
  await app.expectHome()
  const movies = app.homeRow('Recently added in Movies')
  const cards = movies.locator('[data-home-pos]')

  for (const n of [1, 2]) {
    const card = cards.nth(n)
    const label = await card.getAttribute('aria-label')
    const [id] = idsInHref(await card.getAttribute('href'))
    expect((await api.item(id)).Type).toBe('Movie')
    await card.hover()
    await expect.poll(() => app.homeHeaderTitle(), { message: 'header shows the hovered card' }).toBe(label)
    await expect(backdropImage(app)).toHaveAttribute('src', new RegExp(`/Items/${id}/Images/Backdrop`))
    await expect.poll(() => backdropImage(app).evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
  }
})

test('with a mouse only the hovered card shows the focus highlight', { tag: [TAG.desktop, TAG.engines] }, async ({ app }) => {
  // Home gives its first card launch focus (TV behaviour). Once the mouse moves, the hovered card owns the
  // highlight and the focused card's ring is hidden (src/ui/lib/inputModality.ts), even for a single move.
  await app.goto('/')
  await app.expectHome()
  await expect.poll(() => app.focusedHomePos()).toBe('0:0')
  await app.homeCard('0:2').hover()
  const lit = await app.expectSingleHighlight({ timeout: 3000 })
  // what the user sees: the launch-focused card is not drawn focused (no ring)
  // the ring is drawn by the card's scaler, centred on the card edge (half of it outside the clipped surface)
  const ring = (pos: string) =>
    app.homeCard(pos).evaluate((el) => getComputedStyle(el.closest('[data-card-scaler]') ?? el, '::after').borderTopColor)
  await expect.poll(() => ring('0:0')).toBe('rgba(0, 0, 0, 0)')
  await expect.poll(() => ring('0:2')).not.toBe('rgba(0, 0, 0, 0)')
  expect(lit.homePos).toBe('0:2')
})

test('the header and the backdrop follow the keyboard focus', { tag: [TAG.keyboard] }, async ({ app, api }) => {
  await app.goto('/')
  await app.expectHome()
  // launch focus: the first card of the first row
  await expect.poll(() => app.focusedHomePos()).toBe('0:0')
  expect((await app.expectSingleHighlight()).homePos).toBe('0:0')
  await expect.poll(() => app.homeHeaderTitle()).toBe(await cardLabel(app, '0:0'))

  await app.press('ArrowRight')
  await expect.poll(() => app.focusedHomePos()).toBe('0:1')
  await expect.poll(() => app.homeHeaderTitle()).toBe(await cardLabel(app, '0:1'))

  await app.press('ArrowDown')
  const pos = await app.focusedHomePos()
  expect(pos).toMatch(/^[1-9]\d*:0$/)
  await expect.poll(() => app.homeHeaderTitle()).toBe(await cardLabel(app, pos!))
  // the row below may be any type (the seeded data changes: Live TV channels have no backdrop at all)
  const [id] = idsInHref(await app.homeCard(pos!).getAttribute('href'))
  const item = await api.item(id)
  if (item.BackdropImageTags?.length) {
    await expect(backdropImage(app)).toHaveAttribute('src', new RegExp(`/Items/${id}/Images/Backdrop`))
  } else if (!item.ParentBackdropImageTags?.length) {
    await expect(backdropImage(app)).toHaveCount(0)
  }
})

test('arrow keys move across rows, into the drawer and back', { tag: [TAG.keyboard] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  await expect.poll(() => app.focusedHomePos()).toBe('0:0')

  await app.press('ArrowRight', 2)
  await expect.poll(() => app.focusedHomePos()).toBe('0:2')
  expect((await app.expectSingleHighlight()).homePos).toBe('0:2')

  // down: the next non-empty row, at its first card (nothing remembered there yet)
  await app.press('ArrowDown')
  const second = await app.focusedHomePos()
  expect(second).toMatch(/^[1-9]\d*:0$/)
  const secondRow = second!.split(':')[0]
  // the seeded data is shared and changes: a row with a single card cannot move right, so expect the column it has
  const secondCol = (await page.locator(`[data-home-row="${secondRow}"] [data-home-pos]`).count()) > 1 ? 1 : 0
  await app.press('ArrowRight')
  await expect.poll(() => app.focusedHomePos()).toBe(`${secondRow}:${secondCol}`)

  // up: back to the column last focused in the first row
  await app.press('ArrowUp')
  await expect.poll(() => app.focusedHomePos()).toBe('0:2')
  // down again: the second row remembers its column too
  await app.press('ArrowDown')
  await expect.poll(() => app.focusedHomePos()).toBe(`${secondRow}:${secondCol}`)
  await app.press('ArrowUp')

  // left to the start of the row, then once more: the drawer opens on its selected entry (Home)
  await app.press('ArrowLeft', 2)
  await expect.poll(() => app.focusedHomePos()).toBe('0:0')
  await expect(app.drawer).not.toHaveAttribute('data-open')
  await app.press('ArrowLeft')
  await expect(app.focused).toHaveAttribute('aria-current', 'page')
  await expect(app.focused).toHaveAccessibleName('Home')
  await expect(app.drawer).toHaveAttribute('data-open', /.*/)
  const lit = await app.expectSingleHighlight()
  expect(lit.inDrawer).toBe(true)

  // inside the drawer up/down move between entries
  await app.press('ArrowDown')
  await expect(app.focused).toHaveAccessibleName('Favorites')

  // right: back to the card the page had focused; the drawer collapses
  await app.press('ArrowRight')
  await expect.poll(() => app.focusedHomePos()).toBe('0:0')
  await expect(app.drawer).not.toHaveAttribute('data-open')
  expect((await app.expectSingleHighlight()).homePos).toBe('0:0')
})

test('a row can be dragged sideways with the mouse, and the drag does not open the card under it', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  // a row with more cards than fit (a narrow window makes sure there is one)
  await page.setViewportSize({ width: 800, height: 900 })
  const row = await page.evaluateHandle(() => {
    const scrollers = Array.from(document.querySelectorAll<HTMLElement>('[data-home-row]')).map((r) =>
      r.matches('[data-home-pos]') ? null : (r.querySelector<HTMLElement>('[data-home-pos]')?.parentElement ?? null),
    )
    const find = (el: HTMLElement | null): HTMLElement | null => {
      for (let p = el; p; p = p.parentElement) if (p.scrollWidth > p.clientWidth + 150 && getComputedStyle(p).overflowX !== 'visible') return p
      return null
    }
    // which rows overflow depends on the server's data (watched marks hide and shorten rows): take the first
    // one that does, wherever it is on the page
    for (const s of scrollers) {
      const sc = find(s)
      if (sc) return sc
    }
    return null
  })
  const el = row.asElement()
  expect(el, 'a Home row that overflows').not.toBeNull()
  await el!.evaluate((e) => e.scrollIntoView({ block: 'center' }))
  await expect.poll(() => el!.evaluate((e) => {
    const r = e.getBoundingClientRect()
    return r.top >= 0 && r.bottom <= innerHeight
  })).toBe(true)
  const box = (await el!.boundingBox())!
  const y = box.y + box.height / 2
  const x = box.x + box.width - 80
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - 60, y, { steps: 4 })
  await page.mouse.move(x - 140, y, { steps: 4 })
  await expect.poll(() => el!.evaluate((e) => Math.abs(e.scrollLeft))).toBeGreaterThan(100)
  await page.mouse.up()
  // the click that ends the drag is swallowed: still on Home
  await expect(page).toHaveURL((u) => u.pathname === '/')
  expect(await el!.evaluate((e) => Math.abs(e.scrollLeft))).toBeGreaterThan(100)
  // a press without a pull is still a click
  const card = el!.asElement()
  const href = await card.evaluate((e) => {
    const cards = Array.from(e.querySelectorAll<HTMLAnchorElement>('a[data-home-pos]'))
    const c = cards.find((a) => {
      const r = a.getBoundingClientRect()
      return r.left >= 80 && r.right <= innerWidth
    })
    c?.setAttribute('data-e2e-pick', '')
    return c?.getAttribute('href') ?? null
  })
  expect(href).not.toBeNull()
  await page.locator('[data-e2e-pick]').click()
  await expect(page).toHaveURL((u) => u.pathname + u.search === href)
})

test('a "View more" page opened by its address focuses a card in view', { tag: [TAG.keyboard] }, async ({ page, app }) => {
  await app.goto('/home/row/0')
  const focusedIndex = () => page.evaluate(() => document.activeElement?.closest('[data-page-root] [data-grid-index]')?.getAttribute('data-grid-index') ?? null)
  await expect.poll(focusedIndex).toBe('0')
  await page.reload()
  await app.settle()
  await expect.poll(focusedIndex).toBe('0')
  await app.press('ArrowRight')
  await expect.poll(focusedIndex).toBe('1')
})

test('a reloaded, scrolled "View more" grid brings its restored card fully into view', { tag: [TAG.keyboard] }, async ({ page, app }) => {
  // a short window: the grid of row 0 scrolls, and no whole row fits between the window's edges once scrolled
  await page.setViewportSize({ width: 1000, height: 460 })
  await app.goto('/home/row/0')
  const focusedIndex = () => page.evaluate(() => document.activeElement?.closest('[data-page-root] [data-grid-index]')?.getAttribute('data-grid-index') ?? null)
  await expect.poll(focusedIndex).toBe('0')
  const box = () => app.focused.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, height: innerHeight }
  })
  // scroll the window so the focused first card is cut at the top, then reload
  const { top } = await box()
  await page.evaluate((y) => window.scrollTo(0, y), top + 120)
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0)
  await page.reload()
  await app.settle()
  await expect.poll(focusedIndex).not.toBeNull()
  // the restored card is brought into view (smoothly) as an arrow-key move would
  await expect
    .poll(async () => {
      const b = await box()
      return b.top >= -1 && b.bottom <= b.height + 1
    })
    .toBe(true)
})

test('a press elsewhere that ends without a click (the middle or the secondary button) gives the keyboard-focused card its look back', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  // the pointer rests on the Home header (no control there) before the last key press: the keyboard owns the highlight
  const header = (await page.locator('[data-home-header]').boundingBox())!
  await page.mouse.move(header.x + header.width / 2, header.y + 20)
  await app.homeCard('0:0').focus()
  await app.press('ArrowRight')
  await expect.poll(() => app.focusedHomePos()).toBe('0:1')
  const held = () => page.locator('[data-focus-held]').evaluateAll((els) => els.map((e) => e.getAttribute('data-home-pos')))

  // while the button is down the card keeps its focused look (as through a click) ...
  await page.mouse.down({ button: 'middle' })
  expect(await held()).toEqual(['0:1'])
  await page.mouse.up({ button: 'middle' })
  // ... and no click follows to end it: it ended with the press (before, the mark stayed until the next click or key)
  await expect.poll(held).toEqual([])

  await app.homeCard('0:1').focus()
  await app.press('ArrowLeft')
  await expect.poll(() => app.focusedHomePos()).toBe('0:0')
  await page.mouse.down({ button: 'right' })
  await page.mouse.up({ button: 'right' })
  await expect.poll(held).toEqual([])
})

test('Back with the mouse to a scrolled "View more" grid leaves the page where it was, also when the opened card is cut by the window', { tag: [TAG.desktop] }, async ({ page, app }) => {
  // a narrow, short window: the grid of the Movies row scrolls, and part way down the window's edge cuts a row
  await page.setViewportSize({ width: 700, height: 460 })
  await app.goto('/')
  await app.expectHome()
  const index = await app.homeRow('Recently added in Movies').getAttribute('data-home-row')
  await app.goto(`/home/row/${index}`)
  const cells = page.locator('[data-page-root] [data-grid-index]')
  await expect(cells.first()).toBeVisible()
  await cells.first().hover()
  await page.mouse.wheel(0, 60)
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(60)
  // a card the window's bottom edge cuts: opened with a click on the part that shows
  const target = await cells.evaluateAll((els) => {
    const c = els.map((el) => ({ index: el.getAttribute('data-grid-index'), box: el.getBoundingClientRect() })).find((c) => c.box.top < innerHeight - 60 && c.box.bottom > innerHeight + 20)
    return c ? { index: c.index, x: c.box.left + c.box.width / 2, y: c.box.top + 30 } : null
  })
  expect(target, 'a card is cut by the window').not.toBeNull()
  const before = await page.evaluate(() => scrollY)
  await page.mouse.click(target!.x, target!.y)
  await expect(page).not.toHaveURL(/\/home\/row\//)
  await app.settle()

  await page.goBack()
  await expect(page).toHaveURL(/\/home\/row\//)
  // the opened card has focus again (the shell puts it back) ...
  const focusedIndex = () => page.evaluate(() => document.activeElement?.closest('[data-page-root] [data-grid-index]')?.getAttribute('data-grid-index') ?? null)
  await expect.poll(focusedIndex).toBe(target!.index)
  await app.settle()
  // ... and the page did not move to bring it into view: after a pointer press the window stays where the user left it
  expect(Math.abs((await page.evaluate(() => scrollY)) - before)).toBeLessThanOrEqual(1)
})
