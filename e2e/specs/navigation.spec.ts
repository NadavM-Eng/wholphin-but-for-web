// Back / Escape: no Back button on Home, one on inner pages; Back returns to Home with the scroll position and
// the focused card restored; Escape on Home moves between page and drawer; a deep-linked page goes Back to Home.
import { TAG, expect, test } from '../fixtures'
import type { App } from '../fixtures/app'

/** Scroll offset of Home's vertical rows list (the rows scroll inside the page, not the window). */
function rowsScrollTop(app: App): Promise<number> {
  return app.homeRowsScroller.evaluate((el) => el.scrollTop)
}

test('Back button: absent on Home, present on an inner page, returns with scroll and focus restored', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  await expect(app.backButton).toHaveCount(0)

  // scroll the rows with the wheel and open a card from a lower row
  const rows = app.homeRows
  await rows.first().hover()
  await page.mouse.wheel(0, 700)
  await expect.poll(() => rowsScrollTop(app)).toBeGreaterThan(100)
  await app.settle()
  const scrolled = await rowsScrollTop(app)
  // the second card of the lowest row that is fully on screen
  const pos = await page.evaluate(() => {
    const onScreen = Array.from(document.querySelectorAll('[data-home-pos]')).filter((c) => {
      const r = c.getBoundingClientRect()
      return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && c.getAttribute('data-home-pos')!.endsWith(':1')
    })
    return onScreen.at(-1)?.getAttribute('data-home-pos') ?? null
  })
  expect(pos, 'a card on screen after scrolling').not.toBeNull()
  const card = app.homeCard(pos!)
  const href = await card.getAttribute('href')
  await card.click()
  await expect(page).toHaveURL((u) => u.pathname + u.search === href)

  await expect(app.backButton).toBeVisible()
  await app.activate(app.backButton)
  await app.expectHome()
  await expect.poll(() => rowsScrollTop(app)).toBeGreaterThan(scrolled - 3)
  expect(await rowsScrollTop(app)).toBeLessThan(scrolled + 3)
  await expect.poll(() => app.focusedHomePos()).toBe(pos)
})

test('Escape: goes Back from an inner page with focus and scroll restored; on Home it toggles page and drawer', { tag: [TAG.keyboard, TAG.engines] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  await expect.poll(() => app.focusedHomePos()).toBe('0:0')

  // keyboard focus scrolls the rows; go three rows down and one card right. Which rows show and how long they
  // are depends on the server's data (a library with one item gives a row with one card): go on to a row with two.
  await app.press('ArrowDown', 3)
  for (let i = 0; i < 4; i++) {
    const row = (await app.focusedHomePos())?.split(':')[0]
    if ((await page.locator(`[data-home-pos="${row}:1"]`).count()) > 0) break
    await app.press('ArrowDown')
  }
  await app.press('ArrowRight')
  const pos = await app.focusedHomePos()
  expect(pos).toMatch(/:1$/)
  await app.settle()
  const scrolled = await rowsScrollTop(app)
  expect(scrolled).toBeGreaterThan(0)
  const href = await app.focused.getAttribute('href')

  await page.keyboard.press('Enter')
  await expect(page).toHaveURL((u) => u.pathname + u.search === href)
  await app.settle()

  await page.keyboard.press('Escape')
  await app.expectHome()
  await expect.poll(() => app.focusedHomePos()).toBe(pos)
  await expect.poll(() => rowsScrollTop(app)).toBeGreaterThan(scrolled - 3)
  expect(await rowsScrollTop(app)).toBeLessThan(scrolled + 3)
  expect((await app.expectSingleHighlight()).homePos).toBe(pos)

  // Escape on Home: into the drawer (its selected entry), and Escape again back to the page
  await page.keyboard.press('Escape')
  await expect(app.focused).toHaveAccessibleName('Home')
  await expect(app.drawer).toHaveAttribute('data-open', /.*/)
  await expect(page).toHaveURL((u) => u.pathname === '/')
  await page.keyboard.press('Escape')
  await expect.poll(() => app.focusedHomePos()).toBe(pos)
  await expect(app.drawer).not.toHaveAttribute('data-open')
})

test('a deep-linked inner page goes Back to Home', { tag: [TAG.desktop, TAG.phone, TAG.iphone] }, async ({ page, app }) => {
  await app.goto('/favorites')
  await expect(app.gridCards.first()).toBeVisible()
  await expect(page).toHaveURL(/\/favorites(\?|$)/)
  await expect(app.pageRoot).toBeVisible()
  await expect(app.backButton).toBeVisible()
  await app.activate(app.backButton)
  await app.expectHome()
  await expect(app.backButton).toHaveCount(0)
  // Home replaced the deep link: there is no history entry to go back to inside the app
  expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(2)
})

test('phone: Back in the top bar returns to Home', { tag: [TAG.phone] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  await expect(app.backButton).toHaveCount(0)
  const card = app.homeCard('0:0')
  const href = await card.getAttribute('href')
  await app.tap(card)
  await expect(page).toHaveURL((u) => u.pathname + u.search === href)
  await expect(app.backButton).toBeVisible()
  await app.tap(app.backButton)
  await app.expectHome()
})

test('keyboard: Escape right behind Enter on a card is answered by the page that opens, not by the one being left', { tag: [TAG.keyboard, TAG.engines] }, async ({ page, app }) => {
  // every new history entry, so the test can tell "opened and went back" from "never opened"
  await page.addInitScript(() => {
    const w = window as unknown as { __pushes: number }
    w.__pushes = 0
    const push = history.pushState.bind(history)
    history.pushState = (...args: Parameters<History['pushState']>) => {
      w.__pushes++
      push(...args)
    }
  })
  await app.goto('/')
  await app.expectHome()
  await expect.poll(() => app.focusedHomePos()).toBe('0:0')
  await app.press('ArrowRight')
  await expect.poll(() => app.focusedHomePos()).toBe('0:1')
  // The item page's module may still be loading when Escape arrives. On Home, Escape then opened the drawer under
  // the arriving page; on an inner page it went back past it and cancelled the navigation.
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  await expect.poll(() => page.evaluate(() => (window as unknown as { __pushes: number }).__pushes)).toBe(1)
  await app.expectHome()
  await expect(page).toHaveURL((u) => u.pathname === '/')
  await expect.poll(() => app.focusedHomePos()).toBe('0:1')
  await expect(app.drawer).not.toHaveAttribute('data-open')
  expect((await app.expectSingleHighlight()).homePos).toBe('0:1')
})

test('keyboard: Escape at the moment the router is through, before the new page shows, is answered by the new page too', { tag: [TAG.keyboard, TAG.engines] }, async ({ page, app }) => {
  // The window is one render long, so the key is sent from inside it: the router writes the new history entry
  // right before it publishes its state, and a microtask queued there runs before React has rendered the page.
  // (Home's rule took such an Escape: it opened the drawer over the arriving page, or, with focus in the drawer,
  // did nothing, and the page opened from the drawer stayed.)
  await page.addInitScript(() => {
    const w = window as unknown as { __escapeAtPush: boolean; __sent: string[] }
    w.__escapeAtPush = false
    w.__sent = []
    const push = history.pushState.bind(history)
    history.pushState = (...args: Parameters<History['pushState']>) => {
      push(...args)
      if (!w.__escapeAtPush) return
      w.__escapeAtPush = false
      queueMicrotask(() => {
        // still Home on screen, already the new address
        w.__sent.push(`${location.pathname} ${document.querySelector('[data-home-row]') ? 'home shown' : 'home gone'}`)
        ;(document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      })
    }
  })
  const arm = () => page.evaluate(() => void ((window as unknown as { __escapeAtPush: boolean }).__escapeAtPush = true))
  const sent = () => page.evaluate(() => (window as unknown as { __sent: string[] }).__sent.splice(0))
  await app.goto('/')
  await app.expectHome()
  await expect.poll(() => app.focusedHomePos()).toBe('0:0')

  // Enter on a Home card
  const href = (await app.homeCard('0:0').getAttribute('href'))!
  await arm()
  await page.keyboard.press('Enter')
  await expect.poll(sent).toEqual([`${href.split('?')[0]} home shown`])
  await app.expectHome()
  await expect.poll(() => app.focusedHomePos()).toBe('0:0')
  await expect(app.drawer).not.toHaveAttribute('data-open')

  // Enter on a drawer entry
  await app.press('ArrowLeft')
  await app.press('ArrowDown') // Home -> Favorites
  await expect(app.focused).toHaveAccessibleName('Favorites')
  await arm()
  await page.keyboard.press('Enter')
  await expect.poll(sent).toEqual(['/favorites home shown'])
  await app.expectHome()
  await expect(page).toHaveURL((u) => u.pathname === '/')
})
