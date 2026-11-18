// Preferences that change the whole app: theme, UI language (RTL), interface scale. Each is set through the app's
// preference store (the Settings UI itself is covered by settings.spec.ts) and must apply live and survive a reload.
import { TAG, expect, test } from '../fixtures'
import type { App } from '../fixtures/app'

const primaryColor = (app: App) => app.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--c-primary').trim())

test('theme: switching changes data-theme and the colors, and survives a reload', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-theme', 'PURPLE')
  const purple = await primaryColor(app)

  await app.setPreference('themeColors', 'BLUE')
  await expect(html).toHaveAttribute('data-theme', 'BLUE')
  const blue = await primaryColor(app)
  expect(blue).not.toBe(purple)

  await page.reload()
  await app.expectHome()
  await expect(html).toHaveAttribute('data-theme', 'BLUE')
  expect(await primaryColor(app)).toBe(blue)
})

test('Hebrew: the document turns right-to-left, the drawer moves to the right, and it survives a reload', { tag: [TAG.desktop, TAG.phone, TAG.engines, TAG.iphone] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  const html = page.locator('html')
  await expect(html).toHaveAttribute('dir', 'ltr')
  const homeEntry = app.drawer.locator('a[href="/"]')
  await expect(homeEntry).toHaveText('Home')

  await app.setPreference('userInterfaceLanguage', 'he')
  await expect(html).toHaveAttribute('dir', 'rtl')
  await expect(html).toHaveAttribute('lang', 'he')
  await expect(homeEntry).not.toHaveText('Home')

  const check = async () => {
    const vw = await page.evaluate(() => window.innerWidth) // CSS width (WebKit's viewport may be scaled, see matchCssViewport)
    if (app.touch) {
      await app.tap(app.menuButton)
      await expect(app.drawer).toHaveAttribute('data-open', /.*/)
      await expect(homeEntry).toBeInViewport()
    }
    const box = (await app.drawer.boundingBox())!
    // the rail / sheet hugs the right edge
    expect(Math.abs(box.x + box.width - vw)).toBeLessThan(2)
    if (!app.touch) expect(box.x).toBeGreaterThan(vw / 2)
    if (app.touch) await page.keyboard.press('Escape')
  }
  await check()
  await app.expectNoHorizontalOverflow()

  await page.reload()
  await app.expectHome()
  await expect(html).toHaveAttribute('dir', 'rtl')
  await check()
})

test('interface scale: the root font size follows the preference and survives a reload', { tag: [TAG.desktop] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  const fontSize = () => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))
  // 1440px wide: automatic scale 1 -> 16px
  expect(await fontSize()).toBe(16)
  const rail = (await app.drawer.boundingBox())!.width

  await app.setPreference('webInterfaceScale', 150)
  await expect.poll(fontSize).toBe(24)
  // everything authored in dp grows with it: the 64dp rail becomes 96px
  await expect.poll(async () => Math.round((await app.drawer.boundingBox())!.width)).toBe(Math.round(rail * 1.5))

  await page.reload()
  await app.expectHome()
  expect(await fontSize()).toBe(24)
})
