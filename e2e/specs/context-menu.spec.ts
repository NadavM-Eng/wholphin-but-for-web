// The item context menu (TV long-press): right-click opens it at the pointer, the Menu key and the touch "More"
// button open the centred dialog. Its Favorite / Mark as watched entries change server state (@writes: checked
// through the API, then restored).
import { TAG, expect, test } from '../fixtures'
import type { JellyfinApi } from '../fixtures/api'
import type { App } from '../fixtures/app'

/** The Home card linking to `/item/<id>` (first match; Home may list an item in several rows). */
const cardFor = (app: App, itemId: string) => app.page.locator(`[data-home-pos][href="/item/${itemId}"]`).first()

/** A movie from the Movies row (the subject for read-only menu tests). */
async function movieCard(app: App) {
  const card = app.homeRow('Recently added in Movies').locator('[data-home-pos]').first()
  await expect(card).toBeVisible()
  return { card, title: (await card.getAttribute('aria-label'))! }
}

test('right-click opens the menu at the pointer; a click outside closes it', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  const { card, title } = await movieCard(app)
  await card.scrollIntoViewIfNeeded()
  await app.settle()
  const box = (await card.boundingBox())!
  await card.click({ button: 'right', position: { x: box.width / 2, y: box.height / 3 } })

  const menu = page.getByRole('menu', { name: title })
  await expect(menu).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0) // a popup menu, not the TV dialog
  // opened where the pointer was: a corner at the pointer, or moved just enough to stay inside the window
  const m = (await menu.boundingBox())!
  const px = box.x + box.width / 2
  const py = box.y + box.height / 3
  const vh = page.viewportSize()!.height
  expect(Math.min(Math.abs(m.x - px), Math.abs(m.x + m.width - px))).toBeLessThan(box.width)
  const nearY = Math.min(Math.abs(m.y - py), Math.abs(m.y + m.height - py)) < box.height
  const clamped = m.y >= 0 && m.y + m.height <= vh + 1 && m.y <= py && m.y + m.height >= py
  expect(nearY || clamped).toBe(true)
  await expect(menu.getByRole('menuitem', { name: /^(Favorite|Unfavorite)$/ })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: /^Mark as (watched|unwatched)$/ })).toBeVisible()

  await page.mouse.click(m.x + m.width + 200, 20)
  await expect(menu).toBeHidden()
  await expect(page).toHaveURL((u) => u.pathname === '/')
})

test('the right-click menu takes keyboard focus; Escape closes it and focus returns to the card', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  const { card, title } = await movieCard(app)
  await card.click({ button: 'right' })
  const menu = page.getByRole('menu', { name: title })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem').first()).toBeFocused({ timeout: 2000 })
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitem').nth(1)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden({ timeout: 2000 })
  // the opener (the right-clicked card) gets focus back, not <body>
  await expect(card).toBeFocused()
})

test('reduced motion: the right-click menu still takes keyboard focus with the app\'s own stylesheet', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app }) => {
  // The suite runs with prefers-reduced-motion and removes every transition (fixtures/index.ts). The app's own
  // reduced-motion rule (global.css) must not make `visibility` a transition: a menu that was just placed would
  // still compute as hidden and refuse focus. Drop the suite's stylesheet so only the app's rule applies.
  await app.goto('/')
  await app.expectHome()
  await page.evaluate(() => document.querySelectorAll('style[data-e2e="no-animation"]').forEach((s) => s.remove()))
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
  const { card, title } = await movieCard(app)
  await card.click({ button: 'right' })
  const menu = page.getByRole('menu', { name: title })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem').first()).toBeFocused({ timeout: 2000 })
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden({ timeout: 2000 })
  await expect(card).toBeFocused()
})

test('the Menu key opens the menu dialog for the focused card; Escape returns focus to the card', { tag: [TAG.keyboard, TAG.engines] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  await expect.poll(() => app.focusedHomePos()).toBe('0:0')
  await app.press('ArrowRight')
  await expect.poll(() => app.focusedHomePos()).toBe('0:1')
  const title = await app.focused.getAttribute('aria-label')

  await page.keyboard.press('ContextMenu')
  const dialog = page.getByRole('dialog', { name: title! })
  await expect(dialog).toBeVisible()
  const items = dialog.getByRole('menuitem')
  await expect(items.first()).toBeFocused()
  // arrows move inside the menu (wrapping); focus never leaves the dialog
  await app.press('ArrowDown')
  await expect(items.nth(1)).toBeFocused()
  await app.press('ArrowUp', 2)
  await expect(items.last()).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect.poll(() => app.focusedHomePos()).toBe('0:1')
  expect((await app.expectSingleHighlight()).homePos).toBe('0:1')
  // Escape closed only the menu: still on Home, drawer still closed
  await expect(page).toHaveURL((u) => u.pathname === '/')
  await expect(app.drawer).not.toHaveAttribute('data-open')
})

test('a window resize that makes the grid build its cards anew does not drop focus, with the menu dialog open or without', { tag: [TAG.keyboard] }, async ({ page, app, api }) => {
  const library = (await api.userViews()).find((v) => v.Name === 'Codec Zoo')!
  await app.goto(`/library/${library.Id}?tab=library`)
  const focusedIndex = () => page.evaluate(() => document.activeElement?.closest('[data-page-root] [data-grid-index]')?.getAttribute('data-grid-index') ?? null)
  const focusedHref = () => page.evaluate(() => document.activeElement?.getAttribute('href') ?? null)
  await expect.poll(focusedIndex).toBe('0')
  // cells of the grid's first row (the cell, not the card in it, which grows with focus)
  const firstRowCount = () =>
    page.locator('[data-page-root] [data-grid-index]').evaluateAll((cells) => cells.filter((c) => Math.abs(c.getBoundingClientRect().top - cells[0].getBoundingClientRect().top) < 2).length)
  // the last card of the first row: with fewer columns it belongs to another row
  const columns = await firstRowCount()
  expect(columns).toBeGreaterThan(3)
  await app.press('ArrowRight', columns - 1)
  await expect.poll(focusedIndex).toBe(String(columns - 1))
  const href = (await focusedHref())!
  const title = await app.focused.getAttribute('aria-label')

  // fewer columns: the grid builds the card anew in its new row (focus fell to <body> with the old element)
  await page.setViewportSize({ width: 700, height: 600 })
  await expect.poll(firstRowCount).toBeLessThan(columns)
  await expect.poll(focusedHref).toBe(href)
  expect((await app.expectSingleHighlight()).href).toBe(href)

  // the same while the card's menu dialog is open: its opener is gone when Escape closes it
  await page.keyboard.press('ContextMenu')
  const dialog = page.getByRole('dialog', { name: title! })
  await expect(dialog.getByRole('menuitem').first()).toBeFocused()
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect.poll(firstRowCount).toBe(columns)
  await expect(dialog.getByRole('menuitem').first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect.poll(focusedHref).toBe(href)
  // the arrows go on from that card
  await app.press('ArrowLeft')
  await expect.poll(focusedIndex).toBe(String(columns - 2))
})

test('touch: the card "More" button opens the menu dialog', { tag: [TAG.phone, TAG.iphone] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  const { card, title } = await movieCard(app)
  await card.scrollIntoViewIfNeeded()
  await app.tap(card.locator('xpath=..').locator('[data-card-more]'))
  const dialog = page.getByRole('dialog', { name: title })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('menuitem', { name: /^(Favorite|Unfavorite)$/ })).toBeVisible()
  // tapping outside the dialog closes it without navigating
  await page.mouse.click(5, 5)
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL((u) => u.pathname === '/')
})

test('touch: a long-press on a card opens the menu dialog and does not open the card', { tag: [TAG.phone, TAG.iphone] }, async ({ page, app, browserName }) => {
  // iOS Safari sends no contextmenu for a touch long-press: drop the browser's own so only the app's pointer
  // timer (src/ui/lib/useLongPress.ts) can open the menu
  await page.addInitScript(() => {
    window.addEventListener('contextmenu', (e) => e.isTrusted && e.stopImmediatePropagation(), true)
  })
  await app.goto('/')
  await app.expectHome()
  const { card, title } = await movieCard(app)
  await card.scrollIntoViewIfNeeded()
  await app.settle()
  const box = (await card.boundingBox())!
  const point = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }
  const dialog = page.getByRole('dialog', { name: title })
  if (browserName === 'chromium') {
    // Playwright has no long-press: hold a real touch point through CDP (Chromium) until the menu shows
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
    await expect(dialog).toBeVisible({ timeout: 3000 })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } else {
    // WebKit has no protocol for a held touch: the same pointer sequence as synthetic events (touch pointer
    // down on the card, held, up on the card (a touch pointer is captured by the element it went down on),
    // then the click a real release produces under the finger, which is now the menu)
    const fire = (type: string) =>
      page.evaluate(
        ([t, x, y]) => {
          const w = window as unknown as { __lpDown?: Element }
          const el = t === 'pointerup' && w.__lpDown ? w.__lpDown : document.elementFromPoint(x as number, y as number)!
          if (t === 'pointerdown') w.__lpDown = el
          const init = { bubbles: true, cancelable: true, composed: true, clientX: x as number, clientY: y as number }
          el.dispatchEvent(t === 'click' ? new MouseEvent('click', init) : new PointerEvent(t as string, { ...init, pointerId: 7, pointerType: 'touch', isPrimary: true }))
        },
        [type, point.x, point.y] as const,
      )
    await fire('pointerdown')
    await expect(dialog).toBeVisible({ timeout: 3000 })
    await fire('pointerup')
    await fire('click')
  }
  // the release is not a tap on the card: still on Home with the menu open
  await expect(dialog.getByRole('menuitem', { name: /^(Favorite|Unfavorite)$/ })).toBeVisible()
  await expect(page).toHaveURL((u) => u.pathname === '/')
  await page.mouse.click(5, 5)
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL((u) => u.pathname === '/')
})

/** Snapshot + force a known starting state, so a run interrupted before its restore cannot skew the next one. */
async function prepare(api: JellyfinApi, name: string, start: { IsFavorite?: boolean; Played?: boolean }) {
  const movie = await api.findMovie(name)
  const before = await api.snapshot(movie.Id)
  if ((start.IsFavorite ?? before.IsFavorite) !== before.IsFavorite || (start.Played ?? before.Played) !== before.Played) {
    await api.setUserData(movie.Id, { ...before, ...start })
  }
  return movie
}

test.describe('server state', () => {
  // Subjects are fixed seeded movies with no resume point (so they never sit in Continue watching).
  test('Favorite / Unfavorite from the right-click menu change the server state', { tag: [TAG.writes] }, async ({ page, app, api }) => {
    const movie = await prepare(api, 'Spring', { IsFavorite: false })
    await app.goto('/')
    await app.expectHome()
    const card = cardFor(app, movie.Id)

    await card.click({ button: 'right' })
    await page.getByRole('menu', { name: movie.Name }).getByRole('menuitem', { name: 'Favorite', exact: true }).click()
    await expect.poll(async () => (await api.userData(movie.Id)).IsFavorite, { message: 'server: favourite set' }).toBe(true)

    await card.click({ button: 'right' })
    const menu = page.getByRole('menu', { name: movie.Name })
    await expect(menu.getByRole('menuitem', { name: 'Unfavorite', exact: true })).toBeVisible()
    await menu.getByRole('menuitem', { name: 'Unfavorite', exact: true }).click()
    await expect.poll(async () => (await api.userData(movie.Id)).IsFavorite, { message: 'server: favourite cleared' }).toBe(false)
  })

  test('Mark as watched from the Menu-key dialog changes the server state', { tag: [TAG.writes] }, async ({ page, app, api }) => {
    const movie = await prepare(api, 'Cosmos Laundromat', { Played: false })
    await app.goto('/')
    await app.expectHome()
    const card = cardFor(app, movie.Id)
    await card.focus()
    await page.keyboard.press('ContextMenu')
    const dialog = page.getByRole('dialog', { name: movie.Name })
    await dialog.getByRole('menuitem', { name: 'Mark as watched' }).click()
    await expect.poll(async () => (await api.userData(movie.Id)).Played, { message: 'server: marked watched' }).toBe(true)
    // the fixture restores the snapshot (unwatched, play count) after the test
  })
})
