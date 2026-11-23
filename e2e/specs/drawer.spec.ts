// Nav drawer: a 64dp rail on desktop that expands on hover / keyboard focus, an overlay sheet on phones; the
// libraries it lists are the server's /UserViews; navigating from it closes it.
import { TAG, expect, test } from '../fixtures'
import type { App } from '../fixtures/app'

/** Library entries (`data-drawer-id="s_<id>"`) in drawer order, as item ids. */
async function drawerLibraryIds(app: App): Promise<string[]> {
  return app.drawer.locator('[data-drawer-id^="s_"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-drawer-id')!.slice(2)))
}

const width = async (app: App) => (await app.drawer.boundingBox())!.width

/** Focus is on the routed page or inside it (not in the drawer, not on <body>). */
const focusInPage = (app: App) =>
  app.page.evaluate(() => {
    const a = document.activeElement
    return !!a && !!a.closest('[data-page-root]') && !a.closest('[data-shell-drawer]')
  })

test('desktop rail: collapsed, expands while hovered, lists the server libraries in order', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app, api }) => {
  await app.goto('/')
  await app.expectHome()
  await expect(app.drawer).toHaveAttribute('data-shell-drawer', 'rail')
  await expect(app.drawer).not.toHaveAttribute('data-open')
  const rail = await width(app)
  expect(rail).toBeGreaterThan(40)
  expect(rail).toBeLessThan(100)
  expect((await app.drawer.boundingBox())!.x).toBeLessThan(5)

  // libraries: same ids, same order as the server's user views (all of the test server's types are supported)
  const views = await api.userViews()
  expect(await drawerLibraryIds(app)).toEqual(views.map((v) => v.Id.replace(/-/g, '').toLowerCase()))
  for (const v of views) await expect(app.drawer.locator(`[data-drawer-id="s_${v.Id}"]`)).toContainText(v.Name!)

  const pageX = async () => (await app.pageRoot.boundingBox())!.x
  const closedX = await pageX()
  await app.drawer.hover()
  await expect(app.drawer).toHaveAttribute('data-open', /.*/)
  await expect.poll(() => width(app)).toBeGreaterThan(rail + 100)
  // the open drawer lies over the page: the page does not move aside (owner request; the TV pushes it)
  await page.waitForTimeout(400)
  expect(await pageX()).toBe(closedX)
  // moving away collapses it
  await page.mouse.move(900, 450)
  await expect(app.drawer).not.toHaveAttribute('data-open')
  await expect.poll(() => width(app)).toBeLessThan(rail + 1)
})

test('desktop rail: navigating from the drawer opens the page, marks the entry and closes the drawer', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
  const movies = (await api.userViews()).find((v) => v.CollectionType === 'movies')!
  await app.goto('/')
  await app.expectHome()
  await app.drawer.hover()
  await expect(app.drawer).toHaveAttribute('data-open', /.*/)
  const entry = app.drawer.locator(`[data-drawer-id="s_${movies.Id}"]`)
  await entry.click()
  // the library page records its tab in the URL (?tab=recommended)
  await expect(page).toHaveURL(new RegExp(`/library/${movies.Id}(\\?tab=\\w+)?$`))
  await expect(app.drawer).not.toHaveAttribute('data-open')
  await expect(entry).toHaveAttribute('aria-current', 'page')
  await expect(app.drawer.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
})

test('keyboard: focus expands the rail, Enter navigates, closes it and moves focus into the page', { tag: [TAG.keyboard] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  await expect.poll(() => app.focusedHomePos()).toBe('0:0')
  await app.press('ArrowLeft')
  await expect(app.drawer).toHaveAttribute('data-open', /.*/)
  await app.press('ArrowDown') // Home -> Favorites
  await expect(app.focused).toHaveAccessibleName('Favorites')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/favorites(\?|$)/)
  await expect(app.drawer).not.toHaveAttribute('data-open')
  await expect(app.drawer.getByRole('link', { name: 'Favorites' })).toHaveAttribute('aria-current', 'page')

  // focus moves into the page: the first favorite card
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-page-root] [data-grid-index]'))).toBe(true)
  // Back to Home through the drawer: Left from the first column enters the drawer on the selected entry
  await app.press('ArrowLeft')
  await expect(app.focused).toHaveAccessibleName('Favorites')
  await app.press('ArrowUp')
  await expect(app.focused).toHaveAccessibleName('Home')
  await page.keyboard.press('Enter')
  await app.expectHome()
  await expect.poll(() => app.focusedHomePos()).toBe('0:0')
  await expect(app.drawer).not.toHaveAttribute('data-open')
  expect((await app.expectSingleHighlight()).homePos).toBe('0:0')
})

test('keyboard: the first card keeps the focus it was given (the grid is built once), and a second visit lands on it too', { tag: [TAG.keyboard] }, async ({ page, app }) => {
  // every grid card that gets focus, in order
  await page.addInitScript(() => {
    const w = window as unknown as { __focusedCards: Element[] }
    w.__focusedCards = []
    document.addEventListener(
      'focusin',
      (e) => {
        const t = e.target as Element
        if (t.closest('[data-page-root] [data-grid-index]') && !w.__focusedCards.includes(t)) w.__focusedCards.push(t)
      },
      true,
    )
  })
  /** [cards that had focus so far, the last of them is still in the page and focused, its grid index] */
  const cards = () =>
    page.evaluate(() => {
      const list = (window as unknown as { __focusedCards: Element[] }).__focusedCards
      const last = list[list.length - 1]
      return [list.length, !!last && last.isConnected && last === document.activeElement, last?.closest('[data-grid-index]')?.getAttribute('data-grid-index') ?? null]
    })
  const openFavorites = async () => {
    await expect.poll(() => app.focusedHomePos()).toBe('0:0')
    await app.press('ArrowLeft')
    await app.press('ArrowDown') // Home -> Favorites
    await expect(app.focused).toHaveAccessibleName('Favorites')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/favorites\?tab=/)
  }
  await app.goto('/')
  await app.expectHome()
  await openFavorites()
  await expect.poll(cards).toEqual([1, true, '0'])
  // Favorites writes ?tab= into the URL right after its first render: the grid must not be re-created for it
  // (the focused card was removed, and an arrow key pressed before the next frame went to the tab row)
  await app.settle()
  expect(await cards()).toEqual([1, true, '0'])

  // Home and back: this time the cards are there in the page's first render (cached), before the shell has
  // moved focus out of the drawer. The first card still takes it, not the tab row.
  await app.press('ArrowLeft')
  await expect(app.focused).toHaveAccessibleName('Favorites')
  await app.press('ArrowUp')
  await page.keyboard.press('Enter')
  await app.expectHome()
  await openFavorites()
  await expect.poll(cards).toEqual([2, true, '0'])
  await app.settle()
  expect(await cards()).toEqual([2, true, '0'])
})

test('keyboard: an arrow key with nothing focused returns to the last focused card, not to the top of the page', { tag: [TAG.keyboard] }, async ({ page, app }) => {
  const focusedIndex = () => page.evaluate(() => document.activeElement?.closest('[data-page-root] [data-grid-index]')?.getAttribute('data-grid-index') ?? null)
  await app.goto('/favorites')
  await expect.poll(focusedIndex).toBe('0')
  await app.press('ArrowRight')
  await expect.poll(focusedIndex).toBe('1')
  // what a click on empty space does: nothing holds focus any more
  await page.evaluate(() => (document.activeElement as HTMLElement).blur())
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)
  // the first arrow key puts focus back where it was (the TV hands focus back to the last focused child) ...
  await app.press('ArrowDown')
  await expect.poll(focusedIndex).toBe('1')
  // ... and the next one moves from there
  await app.press('ArrowLeft')
  await expect.poll(focusedIndex).toBe('0')
})

test('keyboard: an empty page still takes focus out of the drawer', { tag: [TAG.keyboard] }, async ({ page, app }) => {
  // every favorites request answers "none" (favorite artists come from /Artists), so the Favorites page shows
  // only its empty state
  await page.route(/\/(Items|Persons|Artists)\?.*isFavorite=true/i, (route) =>
    route.fulfill({ json: { Items: [], TotalRecordCount: 0, StartIndex: 0 } }),
  )
  await app.goto('/')
  await app.expectHome()
  await expect.poll(() => app.focusedHomePos()).toBe('0:0')
  await app.press('ArrowLeft')
  await app.press('ArrowDown') // Home -> Favorites
  await expect(app.focused).toHaveAccessibleName('Favorites')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/favorites/)
  await expect(app.drawer).not.toHaveAttribute('data-open')
  await expect(page.locator('[data-page-root]').getByText('No favorites found!')).toBeVisible()
  // focus left the collapsed drawer for the page: its empty-state text is the only thing to focus. Waiting for
  // "somewhere in the page" is not enough: focus is parked on <main> for a frame first, and an arrow key
  // pressed in that frame goes to the page's first element instead of the drawer.
  await expect(page.locator('[data-page-root]').getByText('No favorites found!')).toBeFocused()
  // Left from the page goes back into the drawer, on the selected entry
  await app.press('ArrowLeft')
  await expect(app.focused).toHaveAccessibleName('Favorites')
  await expect(app.drawer).toHaveAttribute('data-open', /.*/)
})

test('keyboard: a page with nothing to focus yet holds focus on the page area, then its first card takes it', { tag: [TAG.keyboard] }, async ({ page, app }) => {
  // the favorites requests wait, so the page shows only its loading state: nothing focusable
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  await page.route(/[?&]isFavorite=true/i, async (route) => {
    await held
    await route.fallback()
  })
  try {
    await app.goto('/')
    await app.expectHome()
    await expect.poll(() => app.focusedHomePos()).toBe('0:0')
    await app.press('ArrowLeft')
    await app.press('ArrowDown') // Home -> Favorites
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/favorites/)
    await expect(app.drawer).not.toHaveAttribute('data-open')
    // parked on <main tabIndex=-1> itself: out of the drawer, not on <body>
    await expect.poll(() => page.evaluate(() => document.activeElement?.matches('main[data-page-root]') ?? false)).toBe(true)
    // longer than the shell keeps looking for something to focus
    await page.waitForTimeout(2500)
    expect(await page.evaluate(() => document.activeElement?.matches('main[data-page-root]') ?? false)).toBe(true)
  } finally {
    release()
  }
  // the page's own arrival focus takes over from the parked page area
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-page-root] [data-grid-index="0"]'))).toBe(true)
})

test('keyboard: Enter on the Live TV entry moves focus from the drawer into the guide', { tag: [TAG.keyboard] }, async ({ page, app, api }) => {
  const liveTv = (await api.userViews()).find((v) => v.CollectionType === 'livetv')
  test.skip(!liveTv, 'the test server has no Live TV library')
  await app.goto('/')
  await app.expectHome()
  await expect.poll(() => app.focusedHomePos()).toBe('0:0')
  await app.press('ArrowLeft')
  await expect(app.drawer).toHaveAttribute('data-open', /.*/)
  const entry = app.drawer.locator(`[data-drawer-id="s_${liveTv!.Id}"]`)
  for (let i = 0; i < 20 && !(await entry.evaluate((el) => el === document.activeElement)); i++) await app.press('ArrowDown')
  await expect(entry).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL((u) => u.pathname !== '/')
  await expect(app.drawer).not.toHaveAttribute('data-open')
  await expect.poll(() => focusInPage(app)).toBe(true)
  // Left from the page goes back into the drawer, on the selected entry
  await app.press('ArrowLeft')
  await expect(entry).toBeFocused()
  await expect(app.drawer).toHaveAttribute('data-open', /.*/)
})

test('phone: the drawer is a sheet behind the menu button; it opens, closes, and navigating closes it', { tag: [TAG.phone, TAG.iphone] }, async ({ page, app, api }) => {
  await app.goto('/')
  await app.expectHome()
  await expect(app.drawer).toHaveAttribute('data-shell-drawer', 'sheet')
  await expect(app.drawer).not.toHaveAttribute('data-open')
  // closed: not reachable (inert) and not covering the page
  await expect(app.drawer).toHaveAttribute('inert', '')
  await expect(app.drawer.getByRole('link', { name: 'Home' })).not.toBeInViewport()

  await app.tap(app.menuButton)
  await expect(app.drawer).toHaveAttribute('data-open', /.*/)
  await expect(app.drawer.getByRole('link', { name: 'Home' })).toBeInViewport()
  // Back (Escape) closes it
  await page.keyboard.press('Escape')
  await expect(app.drawer).not.toHaveAttribute('data-open')

  // navigating closes it
  const shows = (await api.userViews()).find((v) => v.CollectionType === 'tvshows')!
  await app.tap(app.menuButton)
  await expect(app.drawer).toHaveAttribute('data-open', /.*/)
  await app.tap(app.drawer.locator(`[data-drawer-id="s_${shows.Id}"]`))
  await expect(page).toHaveURL(new RegExp(`/library/${shows.Id}(\\?tab=\\w+)?$`))
  await expect(app.drawer).not.toHaveAttribute('data-open')
  await expect(app.drawer).toHaveAttribute('inert', '')
})

test('keyboard: keys pressed while a page opened from the drawer is loading do not put focus in the drawer', { tag: [TAG.keyboard] }, async ({ page, app }) => {
  // the favorites requests wait, so the page shows only its loading state: nothing focusable
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  await page.route(/[?&]isFavorite=true/i, async (route) => {
    await held
    await route.fallback()
  })
  const parkedOnPage = () => page.evaluate(() => document.activeElement?.matches('main[data-page-root]') ?? false)
  try {
    await app.goto('/')
    await app.expectHome()
    await expect.poll(() => app.focusedHomePos()).toBe('0:0')
    await app.press('ArrowLeft')
    await app.press('ArrowDown') // Home -> Favorites
    await expect(app.focused).toHaveAccessibleName('Favorites')
    // Enter, and the key that points at the page right behind it: the page on screen is still Home, and its
    // remembered card must not get focus back (it is removed a moment later and the next arrow went to the drawer)
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowRight')
    await expect(page).toHaveURL(/\/favorites/)
    await expect.poll(parkedOnPage).toBe(true)
    // arrows that do not point at the drawer are taken while the page has nothing to focus
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowRight')
    expect(await parkedOnPage()).toBe(true)
    await expect(app.drawer).not.toHaveAttribute('data-open')
  } finally {
    release()
  }
  // the page's first focus lands in the page when its cards show
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-page-root] [data-grid-index="0"]'))).toBe(true)
  await expect(app.drawer).not.toHaveAttribute('data-open')
})

test('keyboard: choosing the current page again in the drawer builds it anew: the first card takes focus', { tag: [TAG.keyboard] }, async ({ page, app }) => {
  const focusedIndex = () => page.evaluate(() => document.activeElement?.closest('[data-page-root] [data-grid-index]')?.getAttribute('data-grid-index') ?? null)
  await app.goto('/favorites')
  await expect.poll(focusedIndex).toBe('0')
  await app.press('ArrowRight')
  await expect.poll(focusedIndex).toBe('1')
  const before = await app.focused.elementHandle()
  await app.press('ArrowLeft')
  await expect.poll(focusedIndex).toBe('0')
  // Left from the first column enters the drawer on the selected entry
  await app.press('ArrowLeft')
  await expect(app.focused).toHaveAccessibleName('Favorites')
  await page.keyboard.press('Enter')
  // upstream pushes a new destination for every drawer choice: a new page with its own first focus, not the
  // kept grid with focus left on the tab row
  await expect.poll(focusedIndex).toBe('0')
  await expect(app.drawer).not.toHaveAttribute('data-open')
  expect(await before!.evaluate((el) => el.isConnected), 'the grid was built again').toBe(false)
})

test('keyboard: Down reaches the music mini player from a failed page with nothing to focus, not while that page is loading', { tag: [TAG.keyboard] }, async ({ page, app, api, guard }) => {
  // playback reports are answered here, so the test changes no played state on the server (and the fixture puts
  // the songs' user data back should one get through)
  await page.route(/\/Sessions\/Playing(\/|\?|$)/, (route) => route.fulfill({ status: 204, body: '' }))
  const album = await api.findItem('MusicAlbum', 'After Hours')
  for (const song of await api.items({ parentId: album.Id, includeItemTypes: 'Audio' })) await api.snapshot(song.Id)
  await app.goto(`/item/${album.Id}`)
  await expect(app.focused).toHaveAccessibleName(/^play$/i)
  await page.keyboard.press('Enter')
  const bar = page.locator('[data-mini-player]')
  await expect(bar).toBeVisible({ timeout: 10_000 })
  const inBar = () => bar.evaluate((el) => el.contains(document.activeElement))

  // Home without a reload (the queue lives in the page)
  await app.press('ArrowLeft')
  await expect(app.focused).toHaveAccessibleName('Home')
  await page.keyboard.press('Enter')
  await app.expectHome()
  await expect.poll(() => app.focusedHomePos()).toBe('0:0')

  // the first card's item answers 404 after a wait: its page shows the loading state, then an error and nothing
  // to focus
  const id = /[0-9a-f]{32}/.exec((await app.homeCard('0:0').getAttribute('href'))!)![0]
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  await page.route(
    (url) => url.pathname.endsWith(`/Items/${id}`),
    async (route) => {
      await held
      await route.fulfill({ status: 404, body: '' })
    },
  )
  guard.allow(/^http 404 GET \S+\/Items\/[0-9a-f]{32}$/, 'the item request this test fails on purpose')
  try {
    await page.keyboard.press('Enter')
    await expect(app.pageRoot.locator('[aria-busy="true"]').first()).toBeVisible()
    await expect(app.homeRows).toHaveCount(0)
    // still loading: Down is taken and moves nothing (the page's first focus is still to come)
    await app.press('ArrowDown')
    expect(await inBar()).toBe(false)
  } finally {
    release()
  }
  await expect(app.pageRoot.getByRole('alert')).toBeVisible()
  await expect(app.pageRoot.locator('[data-focusable]')).toHaveCount(0)
  // settled with nothing to focus: Down enters the bar, and the bar works from the keyboard
  await app.press('ArrowDown')
  expect(await inBar()).toBe(true)
  await app.press('ArrowRight')
  await expect(app.focused).toHaveAccessibleName(/^pause$/i)
  await page.keyboard.press('Enter')
  await expect(bar.getByRole('button', { name: /^play$/i })).toBeVisible()
  // Up: the page has nothing to return to, so focus waits on the page area, from where Down returns to the bar
  // and the key towards the drawer enters it
  await app.press('ArrowUp')
  await expect.poll(() => page.evaluate(() => document.activeElement?.matches('main[data-page-root]') ?? false)).toBe(true)
  await app.press('ArrowDown')
  expect(await inBar()).toBe(true)
  await app.press('ArrowUp')
  await app.press('ArrowLeft')
  await expect(app.drawer).toHaveAttribute('data-open', /.*/)
  await expect(app.focused).toHaveAccessibleName('Home')
})
