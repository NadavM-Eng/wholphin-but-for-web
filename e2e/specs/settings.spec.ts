// Settings through its own UI: the theme dialog changes the app at once and the choice survives a reload; the
// entry points of the drawer and the sub-screens the other features read from.
import type { Locator, Page } from '@playwright/test'
import { TAG, expect, test } from '../fixtures'

/** scrollTop of the list the element scrolls in */
const listTop = (el: Locator) =>
  el.evaluate((node) => {
    for (let p = node.parentElement; p; p = p.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight) return p.scrollTop
    }
    return -1
  })
/** A slider's value as a fraction of its range, and where that fraction is on the screen. */
const fraction = async (slider: Locator) => {
  const [now, min, max] = await Promise.all(['aria-valuenow', 'aria-valuemin', 'aria-valuemax'].map(async (a) => Number(await slider.getAttribute(a))))
  return (now - min) / (max - min)
}
const pointOn = async (slider: Locator, f: number) => {
  const box = (await slider.boundingBox())!
  return { x: box.x + box.width * f, y: box.y + box.height / 2 }
}
/**
 * A touch pointer event dispatched on the slider at fraction `f` of its width, `dy` pixels off its middle: for the
 * engines that cannot be sent a moving touch. Such a pointer is not an active one, so the browser refuses to
 * capture it (`guard.allow(NO_CAPTURE, ...)`).
 */
const sendTouch = (slider: Locator, type: string, f: number, dy = 0) =>
  slider.evaluate(
    (el, [type, f, dy]) => {
      const r = el.getBoundingClientRect()
      const init = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width * f, clientY: r.top + r.height / 2 + dy, button: 0 }
      el.dispatchEvent(new PointerEvent(type, { ...init, pointerId: 9, pointerType: 'touch', isPrimary: true }))
    },
    [type, f, dy] as const,
  )
const NO_CAPTURE = /^pageerror: (Element\.setPointerCapture: Invalid pointer id|The object can not be found here\.)$/

// The interface scale is the one slider whose value re-lays out its own page (the root font size).
const rootFontSize = (page: Page) => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))
/** Counts the writes of the root font size from now on (`window.__rootWrites`). */
const countRootWrites = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __rootWrites: number }
    w.__rootWrites = 0
    new MutationObserver((records) => (w.__rootWrites += records.length)).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
  })
const rootWrites = (page: Page) => page.evaluate(() => (window as unknown as { __rootWrites: number }).__rootWrites)
const middleY = async (slider: Locator) => {
  const box = (await slider.boundingBox())!
  return box.y + box.height / 2
}

test('the theme dialog changes the theme at once and the choice survives a reload', { tag: [TAG.desktop, TAG.phone, TAG.engines, TAG.iphone] }, async ({ page, app }) => {
  await app.goto('/settings')
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-theme', 'PURPLE')
  const row = page.locator('[data-pref-id="ThemeColors"]')
  await app.activate(row.locator('[data-focusable]').first())
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await app.activate(dialog.getByRole('option', { name: 'Blue' }).or(dialog.getByText('Blue', { exact: true })).first())
  await expect(html).toHaveAttribute('data-theme', 'BLUE')
  // choosing commits and closes the dialog itself, as upstream's choice dialog does. No Escape here: once the
  // dialog is gone Escape is the shell's Back and leaves Settings, and which of the two it hit depended on timing.
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/\/settings$/)

  await page.reload()
  await app.settle()
  await expect(html).toHaveAttribute('data-theme', 'BLUE')
  await expect(row).toContainText('Blue')
})

test('the drawer opens Settings; its rows lead to the user, subtitle, Home and drawer-items screens', { tag: [TAG.desktop] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  await app.drawer.hover()
  await app.drawer.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings$/)

  // Customize Navigation Drawer Items: the shell's pins dialog
  await page.locator('[data-pref-id="UserPinnedNavDrawerItems"] [data-focusable]').first().click()
  const pins = page.getByRole('dialog', { name: 'Customize Navigation Drawer Items' })
  await expect(pins).toBeVisible()
  await expect(pins.getByText('Favorites', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(pins).toBeHidden()

  for (const [id, path] of [
    ['SubtitleStyle', /\/settings\/subtitles$/],
    ['CustomizeHome', /\/home\/settings$/],
    ['UserProfileSettings', /\/settings\/user$/],
  ] as const) {
    await app.goto('/settings')
    await page.locator(`[data-pref-id="${id}"] [data-focusable]`).first().click()
    await expect(page).toHaveURL(path)
    await expect(app.routeStub).toHaveCount(0)
  }
})

test('a dialog opened from a choice dialog gives focus back to the settings row', { tag: [TAG.keyboard] }, async ({ page, app }) => {
  await app.goto('/settings')
  const row = page.locator('[data-page-root] [data-focusable]').filter({ hasText: 'Profile protection' }).first()
  await row.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  for (let i = 0; i < 6 && !((await app.focused.textContent()) ?? '').includes('Require PIN'); i++) await app.press('ArrowDown')
  await expect(app.focused).toContainText('Require PIN')
  // the choice closes its dialog and opens the PIN dialog: its opener, the choice, is gone when that one closes
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog').getByText('Enter PIN').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(row).toBeFocused()
  await expect(page).toHaveURL(/\/settings$/)
})

test('License page: arrows on the page scroll it, then hand focus to a row in view without jumping back', { tag: [TAG.keyboard] }, async ({ page, app }) => {
  await app.goto('/license')
  // the page container itself holds focus and scrolls (the header inside it is pinned)
  const scroller = page.locator('[data-focus-scroll="none"]').locator('xpath=..')
  const top = () => scroller.evaluate((el) => el.scrollTop)
  await scroller.focus()
  await app.press('ArrowDown', 8)
  await expect.poll(top).toBe(800)
  // Right hands focus to a row that is in view (it went to the first link at the top of the page, and the page
  // scrolled back there)
  await app.press('ArrowRight')
  await expect(app.focused).toBeInViewport({ ratio: 1 })
  expect(await app.focused.evaluate((el) => !el.closest('header') && el.tabIndex >= 0)).toBe(true)
  expect(await top()).toBe(800)
  // from a row, Left reaches the header's Back button; the header is pinned, so the page stays where it is
  await app.press('ArrowLeft')
  await expect(app.focused).toHaveAccessibleName('Back')
  await app.settle()
  expect(await top()).toBe(800)
})

test('a finger that starts on a slider scrolls the settings list; only a sideways drag or a tap changes the slider', { tag: [TAG.phone] }, async ({ page, app }) => {
  await app.goto('/settings/advanced')
  const slider = page.getByRole('slider', { name: 'Slideshow duration' })
  await expect(slider).toBeInViewport()
  const start = await fraction(slider)
  expect(await listTop(slider)).toBe(0)

  // straight up, then slightly diagonal (60px sideways over 220): the list scrolls, the value stays
  for (const drift of [6, -60]) {
    const from = await pointOn(slider, 0.8)
    await app.touchDrag(from, { x: from.x + drift, y: from.y - 220 })
    await expect.poll(() => listTop(slider), `the list scrolls (drift ${drift}px)`).toBeGreaterThan(100)
    expect(await fraction(slider)).toBe(start)
    await slider.evaluate((el) => el.closest('[data-pref-id]')!.parentElement!.scrollTo(0, 0))
    await expect.poll(() => listTop(slider)).toBe(0)
  }
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL(/\/settings\/advanced$/)

  // a sideways drag takes the slider: the thumb ends under the finger and the list stays where it is
  const from = await pointOn(slider, 0.3)
  const to = await pointOn(slider, 0.7)
  await app.touchDrag(from, { x: to.x, y: to.y + 4 })
  await expect.poll(() => fraction(slider)).toBeGreaterThan(0.64)
  expect(await fraction(slider)).toBeLessThan(0.76)
  expect(await listTop(slider)).toBe(0)

  // a tap sets the value at that point
  const mid = await pointOn(slider, 0.5)
  await page.touchscreen.tap(mid.x, mid.y)
  await expect.poll(() => fraction(slider)).toBeLessThan(0.56)
  expect(await fraction(slider)).toBeGreaterThan(0.44)
})

// WebKit and Firefox cannot be sent a moving touch: the slider's handlers get the pointer events a finger
// produces (the browser's own part, panning on `touch-action: pan-y` and then pointercancel, is asserted as style).
test('slider under touch pointer events: down, an up-and-down move and a cancel change nothing; a sideways drag and a tap do', { tag: [TAG.iphone, TAG.engines] }, async ({ page, app, guard }) => {
  guard.allow(NO_CAPTURE, 'a dispatched pointer is not an active one: the browser refuses to capture its id')
  await app.goto('/settings/advanced')
  const slider = page.getByRole('slider', { name: 'Slideshow duration' })
  await slider.scrollIntoViewIfNeeded()
  const start = await fraction(slider)
  expect(await slider.evaluate((el) => getComputedStyle(el).touchAction)).toMatch(/^pan-y( pinch-zoom)?$/)
  const send = (type: string, f: number, dy = 0) => sendTouch(slider, type, f, dy)
  await send('pointerdown', 0.8)
  expect(await fraction(slider)).toBe(start)
  for (const dy of [-20, -60, -120]) await send('pointermove', 0.78, dy)
  await send('pointercancel', 0.78, -120)
  expect(await fraction(slider)).toBe(start)

  await send('pointerdown', 0.3)
  await send('pointermove', 0.5, 2)
  await send('pointermove', 0.7, 3)
  await send('pointerup', 0.7, 3)
  await expect.poll(() => fraction(slider)).toBeGreaterThan(0.64)
  expect(await fraction(slider)).toBeLessThan(0.76)

  await send('pointerdown', 0.5)
  expect(await fraction(slider)).toBeGreaterThan(0.64)
  await send('pointerup', 0.5)
  await expect.poll(() => fraction(slider)).toBeLessThan(0.56)
  expect(await fraction(slider)).toBeGreaterThan(0.44)
})

// The interface scale re-lays out the whole page, its own slider included: applied on every step of a drag, the
// slider ran away from the finger (the root font size went 16 -> 32px in ten steps and the row left the screen).
test('interface scale: a finger drag moves only the thumb and the summary; the size is applied once, when the finger lifts', { tag: [TAG.phone] }, async ({ page, app }) => {
  await app.goto('/settings')
  const row = page.locator('[data-pref-id="WebInterfaceScale"]')
  const slider = row.getByRole('slider')
  await slider.scrollIntoViewIfNeeded()
  await expect(slider).toHaveAttribute('aria-valuenow', '100')
  expect(await rootFontSize(page)).toBe(16)
  const y = await middleY(slider)

  // what the page is like after each move of the finger, until it lifts
  await countRootWrites(page)
  await slider.evaluate((el) => {
    const log = { moves: [] as Array<{ font: number; now: number; summary: string; box: string }>, writesAtRelease: -1 }
    const w = window as unknown as { __drag: typeof log; __rootWrites: number }
    w.__drag = log
    const row = el.closest('[data-pref-id]')!
    el.addEventListener('pointermove', () =>
      requestAnimationFrame(() => {
        if (log.writesAtRelease >= 0) return
        const r = el.getBoundingClientRect()
        log.moves.push({
          font: parseFloat(getComputedStyle(document.documentElement).fontSize),
          now: Number(el.getAttribute('aria-valuenow')),
          summary: row.querySelector('bdi')!.textContent ?? '',
          box: [r.left, r.top, r.width, r.height].map((n) => Math.round(n)).join(' '),
        })
      }),
    )
    for (const type of ['pointerup', 'pointercancel']) window.addEventListener(type, () => (log.writesAtRelease = w.__rootWrites), { capture: true })
  })

  const from = await pointOn(slider, 1 / 3)
  const to = await pointOn(slider, 0.8)
  await app.touchDrag(from, { x: to.x, y: to.y + 4 }, { steps: 16 })

  const log = await page.evaluate(() => (window as unknown as { __drag: { moves: Array<{ font: number; now: number; summary: string; box: string }>; writesAtRelease: number } }).__drag)
  expect(log.moves.length).toBeGreaterThan(8)
  // the interface kept its size and the slider its place under the finger
  expect([...new Set(log.moves.map((m) => m.font))]).toEqual([16])
  expect(new Set(log.moves.map((m) => m.box)).size).toBe(1)
  expect(log.writesAtRelease).toBe(0)
  // while the thumb and the summary followed it: 0.8 of 50..200 is 170
  const last = log.moves[log.moves.length - 1]
  expect(last.now).toBeGreaterThanOrEqual(160)
  expect(last.now).toBeLessThanOrEqual(180)
  expect(last.summary).toBe(`${last.now}%`)
  expect(new Set(log.moves.map((m) => m.now)).size).toBeGreaterThan(3)

  // lifted: that value is applied, in one write
  await expect(slider).toHaveAttribute('aria-valuenow', String(last.now))
  await expect(row).toContainText(`${last.now}%`)
  await expect.poll(() => rootFontSize(page)).toBeCloseTo((16 * last.now) / 100, 1)
  expect(await rootWrites(page)).toBe(1)
  // and the slider is still there, at the height the finger left it
  await expect(slider).toBeInViewport({ ratio: 1 })
  expect(Math.abs((await middleY(slider)) - y)).toBeLessThan(2)
})

test('interface scale: a mouse drag moves only the thumb and the summary; the size is applied once, at the release', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app }) => {
  await app.goto('/settings')
  const row = page.locator('[data-pref-id="WebInterfaceScale"]')
  const slider = row.getByRole('slider')
  await slider.scrollIntoViewIfNeeded()
  await slider.focus()
  await expect(slider).toHaveAttribute('aria-valuenow', '100')
  expect(await rootFontSize(page)).toBe(16)
  const box = (await slider.boundingBox())!
  const y = box.y + box.height / 2
  const x = (f: number) => box.x + box.width * f
  await countRootWrites(page)

  await page.mouse.move(x(1 / 3), y)
  await page.mouse.down()
  await page.mouse.move(x(0.8), y + 40, { steps: 8 })
  // 0.8 of 50..200: the thumb and the summary are there, the interface is not
  await expect(slider).toHaveAttribute('aria-valuenow', '170')
  await expect(row).toContainText('170%')
  // back and forth over the same points gives the same values: the slider did not move under the pointer
  await page.mouse.move(x(0.2), y, { steps: 4 })
  await expect(slider).toHaveAttribute('aria-valuenow', '80')
  await expect(row).toContainText('80%')
  await page.mouse.move(x(0.8), y, { steps: 4 })
  await expect(slider).toHaveAttribute('aria-valuenow', '170')
  expect(await rootFontSize(page)).toBe(16)
  expect(await rootWrites(page)).toBe(0)
  expect(await slider.boundingBox()).toEqual(box)

  await page.mouse.up()
  await expect.poll(() => rootFontSize(page)).toBeCloseTo(27.2, 1)
  expect(await rootWrites(page)).toBe(1)
  await expect(slider).toHaveAttribute('aria-valuenow', '170')
  await expect(row).toContainText('170%')
  // the page was laid out anew: the slider is in view, at the height the pointer left it, and still has focus
  await expect(slider).toBeInViewport({ ratio: 1 })
  expect(Math.abs((await middleY(slider)) - y)).toBeLessThan(2)
  await expect(slider).toBeFocused()

  // a click on the track: applied at the release, once
  const now = (await slider.boundingBox())!
  await page.mouse.move(now.x + now.width / 3, now.y + now.height / 2)
  await page.mouse.down()
  await expect(slider).toHaveAttribute('aria-valuenow', '100')
  expect(await rootWrites(page)).toBe(1)
  await page.mouse.up()
  await expect.poll(() => rootFontSize(page)).toBe(16)
  expect(await rootWrites(page)).toBe(2)
  await expect(slider).toBeInViewport({ ratio: 1 })
})

// WebKit and Firefox cannot be sent a moving touch (see above): the pointer events a finger produces.
test('interface scale under touch pointer events: a drag applies nothing until its release, a cancelled one nothing at all', { tag: [TAG.iphone, TAG.engines] }, async ({ page, app, guard }) => {
  guard.allow(NO_CAPTURE, 'a dispatched pointer is not an active one: the browser refuses to capture its id')
  await app.goto('/settings')
  const row = page.locator('[data-pref-id="WebInterfaceScale"]')
  const slider = row.getByRole('slider')
  await slider.scrollIntoViewIfNeeded()
  await expect(slider).toHaveAttribute('aria-valuenow', '100')
  expect(await rootFontSize(page)).toBe(16)
  const box = (await slider.boundingBox())!
  await countRootWrites(page)

  const drag = async () => {
    await sendTouch(slider, 'pointerdown', 1 / 3)
    await sendTouch(slider, 'pointermove', 0.5, 2)
    await sendTouch(slider, 'pointermove', 0.65, 3)
    await sendTouch(slider, 'pointermove', 0.8, 3)
    await expect(slider).toHaveAttribute('aria-valuenow', '170')
    await expect(row).toContainText('170%')
    expect(await rootFontSize(page)).toBe(16)
    expect(await slider.boundingBox()).toEqual(box)
  }
  // the browser takes the gesture back: the slider shows the applied value again
  await drag()
  await sendTouch(slider, 'pointercancel', 0.8, 3)
  await expect(slider).toHaveAttribute('aria-valuenow', '100')
  await expect(row).toContainText('100%')
  expect(await rootWrites(page)).toBe(0)

  await drag()
  expect(await rootWrites(page)).toBe(0)
  await sendTouch(slider, 'pointerup', 0.8, 3)
  await expect.poll(() => rootFontSize(page)).toBeCloseTo(27.2, 1)
  expect(await rootWrites(page)).toBe(1)
  await expect(slider).toHaveAttribute('aria-valuenow', '170')
  await expect(slider).toBeInViewport({ ratio: 1 })
})

test.describe('Hebrew interface', () => {
  // the app follows the browser's language
  test.use({ locale: 'he-IL' })

  test('a slider summary made of a number and a Latin unit reads left to right', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app }) => {
    await app.goto('/settings/advanced')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    const row = page.locator('[data-pref-id="MaxBitrate"]')
    const summary = row.getByText(/^\d+ [kM]bps$/)
    await expect(summary).toBeVisible()
    const text = ((await summary.textContent()) ?? '').replace(/\s/g, '')
    // drawn in reading order, "100" then "Mbps" (the right-to-left line drew "Mbps 100")
    expect(await app.drawnText(summary)).toBe(text)
    // a translated summary keeps the interface's direction: "5.00 seconds" in Hebrew starts at the right, so the
    // number is drawn to the right of the word
    const translated = page.locator('[data-pref-id="ControllerTimeout"]').getByText(/\d [\u0590-\u05ff]/).last()
    expect(await app.drawnText(translated)).toMatch(/^[\u0590-\u05ff]+\d+\.\d+$/)
  })
})
