// Browser-engine compatibility: things that differ between Chromium, Firefox and WebKit (Safari does not focus
// buttons on click, Firefox and old Safari draw scrollbars differently, ResizeObserver loop errors, the
// "browser too old" notice of index.html). Runs in the Chromium desktop project and in the firefox / webkit ones.
import type { Page } from '@playwright/test'
import { SIGNED_OUT, TAG, expect, test } from '../fixtures'

/** Collects `error` events on window (the ResizeObserver loop error is one, without an Error object). */
async function collectWindowErrors(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __errors: string[] }
    w.__errors = []
    window.addEventListener('error', (e) => w.__errors.push(e.message || String(e.error)), true)
  })
  return () => page.evaluate(() => (window as unknown as { __errors: string[] }).__errors)
}

test.describe('browser baseline notice', () => {
  test.use(SIGNED_OUT)

  test('the app starts and no notice shows in a supported browser', { tag: [TAG.desktop, TAG.engines] }, async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 })
    await expect(page.locator('html')).not.toHaveAttribute('data-unsupported')
    await expect(page.getByText('This browser is too old for Wholphin Web')).toHaveCount(0)
  })

  test('a failing feature test shows the notice and the app does not start', { tag: [TAG.desktop, TAG.engines] }, async ({ page }) => {
    // pretend relative colours are missing (a browser below the baseline)
    await page.addInitScript(() => {
      const orig = CSS.supports.bind(CSS) as (a: string, b?: string) => boolean
      CSS.supports = ((a: string, b?: string) => (/from /.test(String(b)) ? false : orig(a, b))) as typeof CSS.supports
    })
    await page.goto('/')
    await expect(page.getByRole('alert')).toContainText('This browser is too old for Wholphin Web')
    await expect(page.locator('html')).toHaveAttribute('data-unsupported', '')
    // give the module script time to run: it must not render anything
    await page.waitForLoadState('networkidle')
    await expect(page.locator('#root')).toBeEmpty()
  })
})

test('resizing Home and a library grid raises no ResizeObserver loop error', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app, api }) => {
  const errors = await collectWindowErrors(page)
  const lib = (await api.userViews()).find((v) => v.CollectionType === 'movies')!
  for (const path of ['/', `/library/${lib.Id}?tab=library`, '/favorites']) {
    await app.goto(path)
    for (const width of [1100, 700, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
    }
    await app.settle()
  }
  expect(await errors()).toEqual([])
})

test('scrollbars are themed: thin standard properties, or the ::-webkit-scrollbar fallback', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app, browserName }) => {
  await app.goto('/')
  const r = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;top:0;left:0;width:100px;height:50px;overflow:scroll'
    document.body.appendChild(probe)
    const cs = getComputedStyle(probe)
    const rules: string[] = []
    for (const sheet of Array.from(document.styleSheets)) {
      let list: CSSRuleList
      try {
        list = sheet.cssRules
      } catch {
        continue
      }
      for (const rule of Array.from(list)) {
        if (rule instanceof CSSStyleRule && rule.style.getPropertyValue('scrollbar-width') && probe.matches(rule.selectorText)) {
          rules.push(rule.style.getPropertyValue('scrollbar-width'))
        }
      }
    }
    const out = { width: cs.getPropertyValue('scrollbar-width'), gutter: probe.offsetWidth - probe.clientWidth, rules }
    probe.remove()
    return out
  })
  // the global rule reaches an ordinary scroll container
  expect(r.rules).toContain('thin')
  if (browserName === 'chromium') expect(r.width).toBe('thin')
  // WebKit before Safari 18.2 ignores scrollbar-width: the ::-webkit-scrollbar rules keep the bar at 8px.
  // (Playwright's headless Firefox hides every scrollbar, so its computed value and gutter say nothing.)
  if (browserName !== 'firefox') expect(r.gutter).toBeLessThanOrEqual(8)
})

test('the card "more" button opens the menu dialog; Escape gives focus back to the card', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  const card = app.homeRow('Recently added in Movies').locator('[data-home-pos]').first()
  await card.scrollIntoViewIfNeeded()
  await card.hover()
  const more = card.locator('xpath=..').locator('[data-card-more]')
  await expect(more).toBeVisible()
  await more.click()
  const title = await card.getAttribute('aria-label')
  const dialog = page.getByRole('dialog', { name: title! })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  // the more button hides again on keydown, so the card itself is the opener (Safari: clicks do not focus)
  await expect(card).toBeFocused()
})
