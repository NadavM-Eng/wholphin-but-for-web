// Library browsing: the tab row and the remembered tab, the grid's sort / filter / view options (saved per library),
// the letter column, paging while scrolling (a mocked 250-item library) and focus restoration on Back.
import type { Page, Route } from '@playwright/test'
import { TAG, expect, test } from '../fixtures'
import type { JellyfinApi } from '../fixtures/api'

/**
 * `app.setPreference`, but through the preferences module instance the app really runs: after an HMR update Vite
 * serves it as `/src/stores/preferences.ts?t=…`, and importing the bare path then gives a second, unbound instance
 * (user-scoped preferences would not be saved for the signed-in user).
 */
async function setPref(page: Page, key: string, value: unknown) {
  await page.evaluate(
    async ([k, v]) => {
      const loaded = performance.getEntriesByType('resource').map((e) => e.name)
      const url = loaded.find((n) => /\/src\/stores\/preferences\.ts(\?|$)/.test(n)) ?? '/src/stores/preferences.ts'
      const mod = (await import(/* @vite-ignore */ url)) as { setPref: (key: string, value: unknown) => void }
      mod.setPref(k as string, v)
    },
    [key, value] as const,
  )
}

async function moviesLibrary(api: JellyfinApi) {
  const lib = (await api.userViews()).find((v) => v.Name === 'Movies' && v.CollectionType === 'movies')
  if (!lib) throw new Error('e2e: the test server has no "Movies" library')
  return lib
}

/** The grid's cards (virtualized: only the rendered ones). */
const gridCards = (page: Page) => page.locator('[data-page-root] [data-grid-index] [data-card-surface]')
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true })

test('library tabs: the URL follows the tab, and with "remember selected tab" a fresh visit reopens it', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
  const lib = await moviesLibrary(api)
  await app.goto('/')
  await setPref(page, 'rememberSelectedTab', true)
  await app.goto(`/library/${lib.Id}`)
  await expect(tab(page, 'Recommended')).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL(/[?&]tab=recommended/)

  await tab(page, 'Library').click()
  await expect(page).toHaveURL(/[?&]tab=library/)
  await expect(gridCards(page).first()).toBeVisible()

  // a new visit without ?tab= opens the remembered tab
  await app.goto('/')
  await app.goto(`/library/${lib.Id}`)
  await expect(tab(page, 'Library')).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL(/[?&]tab=library/)

  // without the preference the first tab opens
  await setPref(page, 'rememberSelectedTab', false)
  await app.goto(`/library/${lib.Id}`)
  await expect(tab(page, 'Recommended')).toHaveAttribute('aria-selected', 'true')
})

test('sort, filter and view options apply to the grid and survive a reload', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app, api }) => {
  const lib = await moviesLibrary(api)
  await app.goto(`/library/${lib.Id}?tab=library`)
  const sort = page.getByRole('button', { name: /^Name$/ })
  await expect(sort).toBeVisible()

  // Sort: Date added (the current direction is kept)
  await sort.click()
  await page.getByRole('menuitemradio', { name: 'Date Added' }).click()
  await expect(page.getByRole('button', { name: /^Date Added$/ })).toBeVisible()

  // Filter: Favorites = True; the grid then holds exactly the library's favourite movies
  const favourites = await api.items({ parentId: lib.Id, includeItemTypes: 'Movie', isFavorite: true })
  await page.getByRole('button', { name: 'Filter', exact: true }).click()
  await page.getByRole('menu', { name: 'Filter' }).getByText('Favorites', { exact: true }).click()
  await page.getByRole('menu', { name: 'Favorites' }).getByText('True', { exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(gridCards(page)).toHaveCount(favourites.length)
  await expect.poll(async () => (await gridCards(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).sort()).toEqual(
    favourites.map((f) => f.Name).sort(),
  )

  // View options: List layout
  await page.getByRole('button', { name: 'View options' }).click()
  const dialog = page.getByRole('dialog', { name: 'View options' })
  await dialog.getByRole('button', { name: /^Layout/ }).click()
  await page.getByRole('menuitem', { name: 'List' }).or(page.getByRole('option', { name: 'List' })).first().click()
  await page.keyboard.press('Escape')
  await expect(dialog.getByRole('switch', { name: 'Show details' })).toHaveCount(0)
  await expect(gridCards(page)).toHaveCount(0)
  const rows = page.locator('[data-page-root] [data-grid-index] [data-focusable]')
  await expect(rows.first()).toBeVisible()

  await page.reload()
  await app.settle()
  await expect(page.getByRole('button', { name: /^Date Added$/ })).toBeVisible()
  await expect(rows).toHaveCount(favourites.length)
  await expect(gridCards(page)).toHaveCount(0)
})

test('the view options switches expose their state', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
  const lib = await moviesLibrary(api)
  await app.goto(`/library/${lib.Id}?tab=library`)
  await page.getByRole('button', { name: 'View options' }).click()
  const details = page.getByRole('dialog', { name: 'View options' }).getByRole('switch', { name: 'Show details' })
  await expect(details).toHaveAttribute('aria-checked', 'false')
  await details.click()
  await expect(details).toHaveAttribute('aria-checked', 'true')
})

test('the letter column jumps to the first title with that letter', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app, api }) => {
  const lib = await moviesLibrary(api)
  const movies = await api.items({ parentId: lib.Id, includeItemTypes: 'Movie', sortBy: 'SortName', sortOrder: 'Ascending', fields: 'SortName' })
  const target = movies.find((m) => /^s/i.test((m as { SortName?: string }).SortName ?? m.Name ?? ''))
  if (!target) throw new Error('e2e: no movie sorting under S')
  await app.goto(`/library/${lib.Id}?tab=library`)
  await page.getByRole('toolbar', { name: 'Jump to letter' }).locator('[data-letter="S"]').click()
  await expect(app.focused).toHaveAttribute('aria-label', target.Name!)
  await expect(page.getByRole('toolbar', { name: 'Jump to letter' }).locator('[data-letter="S"]')).toHaveAttribute('aria-current', 'true')
})

const MOCK_TOTAL = 250

/** Serves the Movies library grid as 250 synthetic movies (no images), recording the pages asked for. */
async function mockBigLibrary(page: Page, libraryId: string, starts: number[]) {
  await page.route(
    (u) => u.pathname.endsWith('/Items') && u.searchParams.get('parentId') === libraryId && u.searchParams.get('includeItemTypes') === 'Movie',
    async (route: Route) => {
      const u = new URL(route.request().url())
      const start = Number(u.searchParams.get('startIndex') ?? 0)
      const limit = Number(u.searchParams.get('limit') ?? 100)
      starts.push(start)
      const items = Array.from({ length: Math.max(0, Math.min(limit, MOCK_TOTAL - start)) }, (_, i) => {
        const n = start + i
        return { Id: `e2e0000000000000000000000000${String(n).padStart(4, '0')}`, Name: `Paged ${String(n).padStart(3, '0')}`, Type: 'Movie', ImageTags: {}, UserData: {} }
      })
      await route.fulfill({ json: { Items: items, TotalRecordCount: u.searchParams.get('enableTotalRecordCount') === 'true' ? MOCK_TOTAL : 0, StartIndex: start } })
    },
  )
}

test('the grid loads pages of 100 as it scrolls and End jumps to the last item', { tag: [TAG.keyboard, TAG.engines] }, async ({ page, app, api }) => {
  const lib = await moviesLibrary(api)
  const starts: number[] = []
  await mockBigLibrary(page, lib.Id, starts)
  await app.goto(`/library/${lib.Id}?tab=library`)
  await expect(app.focused).toHaveAttribute('aria-label', 'Paged 000')
  await expect(page.getByText(`1 / ${MOCK_TOTAL}`, { exact: true })).toBeVisible()
  expect(starts).toEqual([0])

  // PageDown steps through the grid: the second page is fetched on the way
  await app.press('PageDown', 4)
  await expect.poll(() => starts.includes(100), { message: 'page 2 requested' }).toBe(true)

  await app.press('End')
  await expect(app.focused).toHaveAttribute('aria-label', `Paged ${MOCK_TOTAL - 1}`)
  await expect(page.getByText(`${MOCK_TOTAL} / ${MOCK_TOTAL}`, { exact: true })).toBeVisible()
  expect(starts).toContain(200)

  await app.press('Home')
  await expect(app.focused).toHaveAttribute('aria-label', 'Paged 000')
})

test('Back from an item restores the focused card of the grid', { tag: [TAG.keyboard] }, async ({ page, app, api }) => {
  const lib = await moviesLibrary(api)
  await app.goto(`/library/${lib.Id}?tab=library`)
  await expect(app.focused).toHaveAttribute('data-card-surface', /.*/)
  await app.press('ArrowRight', 2)
  await app.press('ArrowDown')
  const label = await app.focused.getAttribute('aria-label')
  const href = await app.focused.getAttribute('href')
  expect(href).toMatch(/^\/(item|series)\//)
  await app.press('Enter')
  await expect(page).toHaveURL((u) => u.pathname === href!.split('?')[0])
  await app.settle()
  await app.press('Escape')
  await expect(page).toHaveURL(/\/library\//)
  await expect(app.focused).toHaveAttribute('aria-label', label!)
})

test('mouse hover moves the details header only after the hover-intent delay', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
  const lib = await moviesLibrary(api)
  await app.goto(`/library/${lib.Id}?tab=library`)
  await page.getByRole('button', { name: 'View options' }).click()
  await page.getByRole('dialog', { name: 'View options' }).getByRole('switch', { name: 'Show details' }).click()
  await page.keyboard.press('Escape')
  // the header names its item by the logo's alt text or the title
  const headerTitle = () =>
    page.locator('[data-page-root] [data-home-header]').evaluate((h) => h.querySelector('img')?.getAttribute('alt') ?? h.querySelector('h1')?.textContent?.trim() ?? null)
  const first = await gridCards(page).nth(0).getAttribute('aria-label')
  const third = await gridCards(page).nth(2).getAttribute('aria-label')
  // park the pointer away from the cards (the dialog closed under it)
  await page.mouse.move(1300, 40)
  await gridCards(page).nth(0).hover()
  await expect.poll(headerTitle).toBe(first)
  await gridCards(page).nth(2).hover()
  // still the previous item right after the pointer arrived (250 ms intent), then the hovered one
  expect(await headerTitle()).toBe(first)
  await expect.poll(headerTitle).toBe(third)
})

test('the wheel scrolls a grid whose card has keyboard focus, and the grid stays scrolled', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app, api }) => {
  // a short window: the movies need scrolling, also once the collapsed header has given its room to the grid
  await page.setViewportSize({ width: 900, height: 420 })
  const lib = await moviesLibrary(api)
  await app.goto(`/library/${lib.Id}?tab=library`)
  // the first card takes focus on arrival; an arrow key makes it keyboard focus
  await expect(app.focused).toHaveAttribute('data-card-surface', /.*/)
  await app.press('ArrowRight')
  const scroller = page.locator('[data-page-root] [data-focus-enter="last"]')
  const top = () => scroller.evaluate((el) => el.scrollTop)
  expect(await top()).toBe(0)
  await gridCards(page).nth(1).hover()
  await page.mouse.wheel(0, 200)
  // past the 24 px after which the header collapses
  await expect.poll(top).toBeGreaterThan(24)
  // Nothing to poll for: the defect was a timer. 280 ms after the header collapsed, the still-focused card was
  // brought back into view and the grid jumped back to the top.
  await page.waitForTimeout(700)
  expect(await top()).toBeGreaterThan(24)
})

test('the wheel right after an arrow key scrolls the Recommended tab, and the rows stay scrolled', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app, api }) => {
  await page.setViewportSize({ width: 900, height: 600 })
  const lib = await moviesLibrary(api)
  await app.goto(`/library/${lib.Id}?tab=recommended`)
  // the first card takes focus on arrival; Down makes the second row's card keyboard focus and scrolls the rows
  await expect(app.focused).toHaveAttribute('data-home-pos', '0:0')
  const rows = page.locator('[data-page-root] [data-home-row]').first().locator('..')
  const top = () => rows.evaluate((el) => el.scrollTop)
  await app.press('ArrowDown')
  await expect(app.focused).toHaveAttribute('data-home-pos', /^[1-9]\d*:0$/)
  // well inside the 450 ms after the key in which the rows settle on the focused card
  await page.waitForTimeout(150)
  await page.locator('[data-page-root] [data-home-pos]').first().hover()
  await page.mouse.wheel(0, 400)
  await page.waitForTimeout(100)
  const wheeled = await top()
  // Nothing to poll for: the defect was a timer. 450 ms after the key, the rows scrolled back to the focused card.
  await page.waitForTimeout(700)
  expect(await top()).toBeGreaterThanOrEqual(wheeled - 1)
})

test('the grid hands focus back to its last card from the letters, and Up from its first row reaches its own buttons', { tag: [TAG.keyboard] }, async ({ page, app, api }) => {
  const lib = await moviesLibrary(api)
  await app.goto(`/library/${lib.Id}?tab=library`)
  await expect(app.focused).toHaveAttribute('data-card-surface', /.*/)
  const inGrid = () => page.evaluate(() => !!document.activeElement?.closest('[data-grid-index]'))
  const letters = page.getByRole('toolbar', { name: 'Jump to letter' })
  const inLetters = () => letters.evaluate((el) => el.contains(document.activeElement))

  // a card in the middle of the first row: the tab row is nearer above it than the grid's own buttons, which
  // still come first (upstream: the header is the grid's sibling)
  await app.press('ArrowRight', 3)
  const middle = await app.focused.getAttribute('aria-label')
  await app.press('ArrowUp')
  await expect.poll(inGrid).toBe(false)
  await expect(app.focused).not.toHaveRole('tab')
  expect(await app.focused.evaluate((el) => el.tagName)).toBe('BUTTON')
  // ... and Down returns to the card it came from
  await app.press('ArrowDown')
  await expect(app.focused).toHaveAttribute('aria-label', middle!)

  // Right until the letters take focus, from the last card of the first row
  let last = middle
  for (let i = 0; i < 20 && (await inGrid()); i++) {
    last = await app.focused.getAttribute('aria-label')
    await app.press('ArrowRight')
  }
  await expect.poll(inLetters).toBe(true)
  // Left goes back to that card (CardGrid.kt focusRestorer), not to whichever card is level with the letter
  await app.press('ArrowLeft')
  await expect(app.focused).toHaveAttribute('aria-label', last!)
})
