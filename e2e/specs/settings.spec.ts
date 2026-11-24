// Settings through its own UI: the theme dialog changes the app at once and the choice survives a reload; the
// entry points of the drawer and the sub-screens the other features read from.
import type { Locator, Page } from '@playwright/test'
import { TAG, expect, test } from '../fixtures'
import type { App } from '../fixtures/app'

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

test('the drawer opens Settings; its quick rows and its subjects lead to their screens', { tag: [TAG.desktop] }, async ({ page, app }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await app.goto('/')
  await app.expectHome()
  await app.drawer.hover()
  await app.drawer.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings$/)

  // the first screen: the quick rows, then the nine subjects, each naming its first rows
  const ids = await page.locator('[data-settings-list] [data-pref-id]').evaluateAll((els) => els.map((el) => el.getAttribute('data-pref-id')))
  expect(ids).toEqual([
    'ThemeColors',
    'UserInterfaceLanguage',
    'WebInterfaceScale',
    'SubtitleStyle',
    'CustomizeHome',
    ...['profile', 'interface', 'home', 'playback', 'subtitles', 'audio', 'video', 'screensaver', 'about'].map((t) => `Topic-${t}`),
  ])
  // each subject lists its rows under its name, one to a line and none cut short
  const listed = (subject: string) =>
    page.locator(`[data-pref-id="Topic-${subject}"] [data-subject-row]`).evaluateAll((els) =>
      els.map((el) => ({ text: el.textContent, top: Math.round(el.getBoundingClientRect().top), cut: el.scrollWidth > el.clientWidth + 1 || getComputedStyle(el).textOverflow === 'ellipsis' })),
    )
  const subtitles = await listed('subtitles')
  expect(subtitles.map((r) => r.text)).toEqual(['Preferred subtitle language', 'Subtitle mode', 'Subtitle style', 'SSA/ASS subtitle playback', 'Direct play PGS subtitles'])
  expect(new Set(subtitles.map((r) => r.top)).size).toBe(5)
  expect(subtitles.some((r) => r.cut)).toBe(false)
  expect((await listed('playback')).length).toBe(14)
  // the quick rows stand two beside each other with the slider across both columns; the subjects flow down two
  // columns, the first ones in the first
  const box = async (id: string) => (await page.locator(`[data-pref-id="${id}"]`).boundingBox())!
  const [theme, language, scale, profile, iface, about] = await Promise.all(['ThemeColors', 'UserInterfaceLanguage', 'WebInterfaceScale', 'Topic-profile', 'Topic-interface', 'Topic-about'].map(box))
  expect(language.y).toBe(theme.y)
  expect(language.x).toBeGreaterThan(theme.x + theme.width - 1)
  expect(scale.width).toBeGreaterThan(theme.width + language.width - 1)
  expect(iface.x).toBe(profile.x)
  expect(iface.y).toBeGreaterThan(profile.y + profile.height - 1)
  expect(about.x).toBeGreaterThan(profile.x + profile.width - 1)
  // one column in a narrow panel
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(async () => (await box('Topic-about')).x).toBe((await box('Topic-profile')).x)
  expect((await box('UserInterfaceLanguage')).y).toBeGreaterThan((await box('ThemeColors')).y)
  await page.setViewportSize({ width: 1440, height: 900 })

  // a subject, then a row of it. Customize Navigation Drawer Items: the shell's pins dialog
  await page.locator('[data-pref-id="Topic-home"] [data-focusable]').first().click()
  await expect(page).toHaveURL(/\/settings\/topic\/home$/)
  await expect(page.getByRole('region', { name: 'Home' })).toBeVisible()
  await page.locator('[data-pref-id="UserPinnedNavDrawerItems"] [data-focusable]').first().click()
  const pins = page.getByRole('dialog', { name: 'Customize Navigation Drawer Items' })
  await expect(pins).toBeVisible()
  await expect(pins.getByText('Favorites', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(pins).toBeHidden()

  for (const [id, path] of [
    ['SubtitleStyle', /\/settings\/subtitles$/],
    ['CustomizeHome', /\/home\/settings$/],
    ['Topic-profile', /\/settings\/topic\/profile$/],
  ] as const) {
    await app.goto('/settings')
    await page.locator(`[data-pref-id="${id}"] [data-focusable]`).first().click()
    await expect(page).toHaveURL(path)
    await expect(app.routeStub).toHaveCount(0)
  }
})

test('every subject shows its rows, and the addresses of the upstream screens that became subjects lead there', { tag: [TAG.desktop] }, async ({ page, app }) => {
  const rows = () => page.locator('[data-settings-list] [data-pref-id]').evaluateAll((els) => els.map((el) => el.getAttribute('data-pref-id')))
  const SUBJECTS: Record<string, string[]> = {
    profile: ['ProtectProfilePreference', 'SignInAuto', 'QuickConnect', 'WebSignOut'],
    interface: ['ThemeColors', 'WebInterfaceScale', 'UserInterfaceLanguage', 'BackdropStylePref', 'ShowClock', 'ShowLogos', 'DisplayTogglesPref', 'ManageMedia', 'RememberSelectedTab', 'PlayThemeMusic'],
    home: ['CustomizeHome', 'UserPinnedNavDrawerItems', 'SeerrIntegration'],
    playback: ['SkipForward', 'SkipBack', 'SkipBackOnResume', 'OneClickPause', 'ControllerTimeout', 'WebPlayerDimVideo', 'GlobalContentScale', 'DpadSeekModePref', 'CinemaMode', 'SkipSegments', 'ShowNextUpTiming', 'AutoPlayNextUp', 'AutoPlayNextDelay', 'PassOutProtection'],
    subtitles: ['PreferredSubtitleLang', 'SubtitleModePref', 'SubtitleStyle', 'AssSubtitleMode', 'DirectPlayPgs'],
    audio: ['PreferredAudioLang', 'DownMixStereo', 'Ac3Supported'],
    video: ['MaxBitrate', 'MaxResolutionPref', 'DecodeAv1', 'HdrFormatSettings'],
    screensaver: ['ScreensaverSettings', 'SlideshowDuration', 'SlideshowPlayVideos'],
    about: ['InstalledVersion', 'OssLicenseInfo', 'PlaybackDebugInfo', 'DebugLogging', 'SendAppLogs', 'ClearImageCache', 'ExperimentalEnable', 'WebResetPreferences'],
  }
  for (const [subject, expected] of Object.entries(SUBJECTS)) {
    await app.goto(`/settings/topic/${subject}`)
    await expect.poll(rows, subject).toEqual(expected)
  }

  // the experimental row shows under Audio once "Experimental settings" (About) is on
  await app.setPreference('experimentalEnable', true)
  await app.goto('/settings/topic/audio')
  await expect.poll(rows).toEqual([...SUBJECTS.audio, 'PreferAc3ForSurround'])
  await expect(page.getByRole('heading', { name: 'Experimental settings' })).toBeVisible()
  await app.setPreference('experimentalEnable', false)

  // a row of a subject leads on (Skip behavior), and Back comes back to the subject
  await app.goto('/settings/topic/playback')
  await page.locator('[data-pref-id="SkipSegments"] [data-focusable]').first().click()
  await expect(page).toHaveURL(/\/settings\/skip_segments$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/settings\/topic\/playback$/)

  // old addresses, and one that names no subject
  for (const [old, now] of [
    ['/settings/advanced', /\/settings$/],
    ['/settings/experimental', /\/settings\/topic\/audio$/],
    ['/settings/user', /\/settings\/topic\/profile$/],
    ['/settings/topic/nothing', /\/settings$/],
  ] as const) {
    await app.goto(old)
    await expect(page).toHaveURL(now)
    await expect(app.routeStub).toHaveCount(0)
  }
})

test('keyboard on the first screen: down through the quick rows into the two columns of subjects, sideways between the columns, Enter opens a subject and Escape comes back to its row', { tag: [TAG.keyboard] }, async ({ page, app }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await app.goto('/settings')
  const focusedRow = () => page.evaluate(() => document.activeElement?.closest('[data-pref-id]')?.getAttribute('data-pref-id') ?? null)
  await expect.poll(focusedRow).toBe('ThemeColors')
  await app.press('ArrowRight')
  await expect.poll(focusedRow).toBe('UserInterfaceLanguage')
  await app.press('ArrowLeft')
  // the subjects flow down the first column, then the second
  for (const id of ['WebInterfaceScale', 'SubtitleStyle', 'Topic-profile', 'Topic-interface']) {
    await app.press('ArrowDown')
    await expect.poll(focusedRow).toBe(id)
  }
  // sideways: to a subject of the other column and back into the first
  await app.press('ArrowRight')
  const SECOND_COLUMN = ['Topic-subtitles', 'Topic-audio', 'Topic-video', 'Topic-screensaver', 'Topic-about']
  await expect.poll(focusedRow).toMatch(/^Topic-(subtitles|audio|video|screensaver|about)$/)
  const other = (await focusedRow())!
  expect(SECOND_COLUMN).toContain(other)
  await app.press('ArrowLeft')
  await expect.poll(focusedRow).toMatch(/^Topic-(profile|interface|home|playback)$/)
  await app.press('ArrowRight')
  await expect.poll(focusedRow).toMatch(/^Topic-(subtitles|audio|video|screensaver|about)$/)
  const opened = (await focusedRow())!.slice('Topic-'.length)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/settings/topic/${opened}$`))
  await expect.poll(async () => ((await focusedRow()) ?? '').startsWith('Topic-')).toBe(false)
  await expect.poll(focusedRow).not.toBeNull()
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/settings$/)
  await expect.poll(focusedRow).toBe(`Topic-${opened}`)
  // Up from the first row wraps to the last subject, Down from there to the first row
  await page.locator('[data-pref-id="ThemeColors"] [data-focusable]').first().focus()
  await expect.poll(focusedRow).toBe('ThemeColors')
  await app.press('ArrowUp')
  await expect.poll(focusedRow).toBe('Topic-about')
  await app.press('ArrowDown')
  await expect.poll(focusedRow).toBe('ThemeColors')
})

test('the language list is in a solid box like every other choice, over the page that shows behind Settings too', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await app.goto('/')
  await app.expectHome()
  await app.drawer.hover()
  await app.drawer.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await page.locator('[data-pref-id="UserInterfaceLanguage"] [data-focusable]').first().click()
  const dialog = page.getByRole('dialog', { name: 'User interface language' })
  await expect(dialog).toBeVisible()
  const look = await dialog.evaluate((el) => {
    const s = getComputedStyle(el)
    // "rgb(r, g, b)", "rgba(r, g, b, a)" or "color(srgb r g b / a)", depending on the engine
    const m = /^rgba\(.*,\s*([\d.]+)\)$/.exec(s.backgroundColor) ?? /\/\s*([\d.]+)\)$/.exec(s.backgroundColor)
    const r = el.getBoundingClientRect()
    return {
      transparent: s.backgroundColor === 'transparent' || s.backgroundColor === 'rgba(0, 0, 0, 0)',
      alpha: m ? Number(m[1]) : 1,
      radius: parseFloat(s.borderTopLeftRadius),
      padding: parseFloat(s.paddingTop),
      // the long list leaves a gap above and below (the TV's dialog runs from the top of the screen to its bottom)
      inside: r.top >= 16 && r.bottom <= document.documentElement.clientHeight - 16 && r.left >= 0 && r.right <= document.documentElement.clientWidth,
    }
  })
  // upstream draws this one list without the popup's container; on the web it has it (owner request)
  expect(look).toEqual({ transparent: false, alpha: 1, radius: look.radius, padding: look.padding, inside: true })
  expect(look.radius).toBeGreaterThan(8)
  expect(look.padding).toBeGreaterThan(8)
  // the box is as wide as the longest name needs, not the TV's fixed 440dp: no empty half beside the names
  const fit = await dialog.evaluate((el) => {
    const dp = parseFloat(getComputedStyle(document.documentElement).fontSize) / 16
    const names = Array.from(el.querySelectorAll('[lang]'), (n) => n.getBoundingClientRect().width)
    const list = el.querySelector('[data-focusable]')!.parentElement!
    return { widthDp: el.getBoundingClientRect().width / dp, longestDp: Math.max(...names) / dp, cut: list.scrollWidth > list.clientWidth + 1 }
  })
  expect(fit.widthDp).toBeLessThan(400)
  expect(fit.widthDp - fit.longestDp).toBeLessThan(160)
  expect(fit.cut).toBe(false)
  // the long list scrolls inside the box
  expect(await dialog.locator('[role="menuitemradio"], [data-focusable]').count()).toBeGreaterThan(20)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL(/\/settings$/)
})

test('a dialog opened from a choice dialog gives focus back to the settings row', { tag: [TAG.keyboard] }, async ({ page, app }) => {
  await app.goto('/settings/topic/profile')
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
  await expect(page).toHaveURL(/\/settings\/topic\/profile$/)
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
  await app.goto('/settings/topic/playback')
  const slider = page.getByRole('slider', { name: 'Skip forward' })
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
  await expect(page).toHaveURL(/\/settings\/topic\/playback$/)

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
  await app.goto('/settings/topic/playback')
  const slider = page.getByRole('slider', { name: 'Skip forward' })
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
    await app.goto('/settings/topic/video')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    const row = page.locator('[data-pref-id="MaxBitrate"]')
    const summary = row.getByText(/^\d+ [kM]bps$/)
    await expect(summary).toBeVisible()
    const text = ((await summary.textContent()) ?? '').replace(/\s/g, '')
    // drawn in reading order, "100" then "Mbps" (the right-to-left line drew "Mbps 100")
    expect(await app.drawnText(summary)).toBe(text)
    // a translated summary keeps the interface's direction: "5.00 seconds" in Hebrew starts at the right, so the
    // number is drawn to the right of the word
    await app.goto('/settings/topic/playback')
    const translated = page.locator('[data-pref-id="ControllerTimeout"]').getByText(/\d [\u0590-\u05ff]/).last()
    expect(await app.drawnText(translated)).toMatch(/^[\u0590-\u05ff]+\d+\.\d+$/)
  })
})

// ---- Settings as a panel over the page it was opened from (src/app/shell/pageSnapshot.ts) -------------------------
// The shell page unmounts when Settings opens; a lifeless copy of it stays behind the panel under a light tint.
// Where the area beside the panel can be clicked there is no Back button: a click there, Escape and the browser's
// Back go one step back.

/** The place of the page's copy behind the panel (`PageUnderlay`): empty when Settings was opened by its address. */
const underlay = (page: Page) => page.locator('[data-page-underlay]')
/** Settings' floating Back button. By role: the copy is hidden from the accessibility tree, a Back button in it does not count. */
const settingsBack = (page: Page) => page.getByRole('button', { name: 'Back', exact: true })
/** The copy that covers the arriving page for a moment after Settings closes (`returnFromPanel`; it has no hook of its own). */
const RETURN_COVER = 'body > div[inert][aria-hidden="true"]'
/** Titles of the Home rows inside `root`. */
const rowTitles = (root: Locator) => root.locator('section[aria-label]').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))
/** Where each card in view is drawn ("label @ x,y wxh"): the page and its copy must agree. */
const cardBoxes = (root: Locator) =>
  root.locator('[data-card-surface]').evaluateAll((els) =>
    els
      .map((el) => ({ label: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '', r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth)
      .map(({ label, r }) => `${label} @ ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`)
      .sort(),
  )
const focusInPanel = (page: Page) => page.evaluate(() => !!document.activeElement?.closest('[data-settings-list]'))
/** Alpha of anything drawn over the page's copy (`PageUnderlay`): 0, the page behind keeps its brightness. */
const tintAlpha = (page: Page) =>
  underlay(page).evaluate((el) => {
    const after = getComputedStyle(el, '::after')
    if (after.content === 'none') return 0
    const m = /^rgba\(.*,\s*([\d.]+)\)$/.exec(after.backgroundColor) ?? /\/\s*([\d.]+)\)$/.exec(after.backgroundColor)
    return m ? Number(m[1]) : 1
  })
/** Alpha of the Settings page's own background: 1 is the flat background, 0 lets the page behind show through. */
const backgroundAlpha = (page: Page) =>
  page.locator('[data-settings-list]').evaluate((list) => {
    const color = getComputedStyle(list.closest('section')!.parentElement!).backgroundColor
    // "rgb(r, g, b)", "rgba(r, g, b, a)" or "color(srgb r g b / a)", depending on the engine
    const m = /^rgba\(.*,\s*([\d.]+)\)$/.exec(color) ?? /\/\s*([\d.]+)\)$/.exec(color)
    return m ? Number(m[1]) : 1
  })
/** Width of the copy's nav rail. */
const copiedRailWidth = async (page: Page) => (await underlay(page).locator('nav').first().boundingBox())!.width
/** A click on the empty area beside the panel (the panel stands at the start edge; the suite's pages are left to right). */
const clickBesidePanel = async (page: Page) => {
  const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }))
  await page.mouse.click(w * 0.8, h / 2)
}
const hoverDrawer = async (app: App) => {
  await app.drawer.hover()
  await expect(app.drawer).toHaveAttribute('data-open', /.*/)
}
/** Settings chosen from the hovered drawer of the page that shows. */
const openSettingsFromDrawer = async (page: Page, app: App) => {
  await hoverDrawer(app)
  await app.drawer.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.locator('[data-pref-id="ThemeColors"]')).toBeVisible()
}
/** No copy is left anywhere and the shell page is the one that answers: `card` is what a pointer meets. */
const expectPageUsable = async (page: Page, app: App, card: Locator) => {
  await expect(app.shell).toHaveCount(1)
  await expect(underlay(page)).toHaveCount(0)
  await expect(page.locator(RETURN_COVER)).toHaveCount(0)
  await expect(card).toBeVisible()
  expect(
    await card.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return !!hit && (el.contains(hit) || !!hit.closest('[data-card-scaler]')?.contains(el))
    }),
    'the card is what a pointer meets',
  ).toBe(true)
}

test('Settings from the drawer: a lifeless copy of the page stays behind the panel, there is no Back button, focus is in the panel', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  await hoverDrawer(app)
  const titles = await rowTitles(app.shell)
  expect(titles.length).toBeGreaterThan(1)
  const boxes = await cardBoxes(app.shell)
  expect(boxes.length).toBeGreaterThan(3)
  await openSettingsFromDrawer(page, app)

  // the copy: hidden from assistive technology and from input, the same rows, every card where it was
  const copy = underlay(page)
  await expect(copy).toHaveAttribute('inert', /.*/)
  await expect(copy).toHaveAttribute('aria-hidden', 'true')
  expect(await rowTitles(copy)).toEqual(titles)
  expect(await cardBoxes(copy)).toEqual(boxes)
  // the drawer was open when Settings was chosen: behind the panel the rail rests closed
  expect(await copiedRailWidth(page)).toBeLessThan(100)
  // not darkened: the Settings page's own background lets the copy through, and nothing lies over the copy
  expect(await backgroundAlpha(page)).toBe(0)
  expect(await tintAlpha(page)).toBe(0)

  // nothing in the copy answers the app's lookups or can take focus
  await expect(copy.locator('[data-focusable], [data-focus-trap], [data-shell], [data-page-root]')).toHaveCount(0)
  await expect(copy.locator('[tabindex], [autofocus], audio, video, iframe')).toHaveCount(0)
  expect(await copy.evaluate((host) => Array.from(host.querySelectorAll('[id]')).filter((el) => !(el instanceof SVGElement)).length)).toBe(0)
  await expect(app.shell).toHaveCount(0)
  await expect(app.pageRoot).toHaveCount(1)

  await expect(settingsBack(page)).toHaveCount(0)
  await expect.poll(() => focusInPanel(page)).toBe(true)
  // Shift+Tab from the first row stays out of the copy: it takes no focus
  await page.keyboard.press('Shift+Tab')
  expect(await page.evaluate(() => !!document.activeElement?.closest('[data-page-underlay]'))).toBe(false)
})

test('from the open drawer to Settings without a blink: the drawer stays open until Settings shows, whose first frame already has the page behind and no Back button', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  await app.settle()
  await hoverDrawer(app)
  // what is on screen at every animation frame from the click on
  await page.evaluate(() => {
    const w = window as unknown as { __frames: string[] }
    w.__frames = []
    const tick = () => {
      const settings = document.querySelector('[data-settings-list]')
      if (settings) {
        const copy = document.querySelector('[data-page-underlay]')?.childElementCount ?? 0
        const back = document.querySelectorAll('[data-fullscreen] button[aria-label="Back"]').length
        w.__frames.push(`settings copy=${copy} back=${back}`)
      } else {
        w.__frames.push(`page drawer=${document.querySelector('[data-shell-drawer]')?.hasAttribute('data-open') ? 'open' : 'closed'}`)
      }
      if (w.__frames.length < 600 && w.__frames.filter((f) => f.startsWith('settings')).length < 20) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await app.drawer.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect.poll(() => page.evaluate(() => (window as unknown as { __frames: string[] }).__frames.filter((f) => f.startsWith('settings')).length)).toBe(20)
  const frames = await page.evaluate(() => (window as unknown as { __frames: string[] }).__frames)
  // never the bare page with its drawer closed, never Settings on a flat background or with the shell's Back button
  expect(Array.from(new Set(frames))).toEqual(['page drawer=open', 'settings copy=1 back=0'])
})

test('a click beside the panel goes one step back: from a sub-screen to Settings, from Settings to the page, which is usable again', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  const titles = await rowTitles(app.shell)
  await openSettingsFromDrawer(page, app)
  const row = page.locator('[data-pref-id="Topic-profile"] [data-focusable]').first()
  await row.click()
  await expect(page).toHaveURL(/\/settings\/topic\/profile$/)
  // a sub-screen is a panel over the same page
  await expect(settingsBack(page)).toHaveCount(0)
  expect(await rowTitles(underlay(page))).toEqual(titles)

  await clickBesidePanel(page)
  await expect(page).toHaveURL(/\/settings$/)
  await expect(row).toBeFocused()
  expect(await rowTitles(underlay(page))).toEqual(titles)
  await expect(settingsBack(page)).toHaveCount(0)

  await clickBesidePanel(page)
  await app.expectHome()
  await expectPageUsable(page, app, app.homeCard('0:0'))
  // the page answers the pointer: the drawer opens under it again
  await hoverDrawer(app)
})

test('Escape goes one step back: from a sub-screen to Settings, from Settings to the page it was opened from', { tag: [TAG.keyboard, TAG.engines] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  await expect.poll(() => app.focusedHomePos()).toBe('0:0')
  const titles = await rowTitles(app.shell)
  // the drawer's Settings entry, with the keyboard
  await app.press('ArrowLeft')
  await expect(app.drawer).toHaveAttribute('data-open', /.*/)
  for (let i = 0; i < 20 && (await app.focused.getAttribute('href')) !== '/settings'; i++) await app.press('ArrowDown')
  await expect(app.focused).toHaveAccessibleName('Settings')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/settings$/)
  await expect.poll(() => focusInPanel(page)).toBe(true)
  expect(await rowTitles(underlay(page))).toEqual(titles)
  // the drawer had keyboard focus and was open: behind the panel the rail rests closed
  expect(await copiedRailWidth(page)).toBeLessThan(100)
  await expect(settingsBack(page)).toHaveCount(0)

  const row = page.locator('[data-pref-id="Topic-profile"] [data-focusable]').first()
  await row.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/settings\/topic\/profile$/)
  await expect.poll(() => focusInPanel(page)).toBe(true)

  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/settings$/)
  await expect(row).toBeFocused()
  expect(await rowTitles(underlay(page))).toEqual(titles)

  await page.keyboard.press('Escape')
  await app.expectHome()
  await expectPageUsable(page, app, app.homeCard('0:0'))
  // focus is in the page again, not on the drawer entry that opened Settings
  await expect.poll(() => app.focusedHomePos()).toBe('0:0')
  await expect(app.drawer).not.toHaveAttribute('data-open')
  // and the keys are the page's
  await app.press('ArrowRight')
  await expect.poll(() => app.focusedHomePos()).toBe('0:1')
})

test('Settings opened by its address: no copy and a flat background, no Back button; Escape and a click beside the panel go Home', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app }) => {
  await app.goto('/settings')
  await expect(underlay(page)).toHaveCount(1)
  await expect(underlay(page).locator('*')).toHaveCount(0)
  await expect(settingsBack(page)).toHaveCount(0)
  await expect.poll(() => focusInPanel(page)).toBe(true)
  // the page works: a dialog opens, Escape closes the dialog and only that
  await page.locator('[data-pref-id="ThemeColors"] [data-focusable]').first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL(/\/settings$/)

  await page.keyboard.press('Escape')
  await app.expectHome()
  await expectPageUsable(page, app, app.homeCard('0:0'))

  await app.goto('/settings')
  await expect(page.locator('[data-pref-id="ThemeColors"]')).toBeVisible()
  await clickBesidePanel(page)
  await app.expectHome()
  await expectPageUsable(page, app, app.homeCard('0:0'))
})

test('the copy shows the page where it was scrolled: a grid scrolled with the window, and one scrolled in its own box', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app, api }) => {
  // a short window, wide enough for the area beside the panel: both grids need scrolling
  await page.setViewportSize({ width: 1000, height: 460 })
  await app.goto('/')
  await app.expectHome()
  const index = await app.homeRow('Recently added in Movies').getAttribute('data-home-row')
  const movies = (await api.userViews()).find((v) => v.CollectionType === 'movies')!
  const cells = page.locator('[data-page-root] [data-grid-index]')

  // "View more": the window scrolls
  await app.goto(`/home/row/${index}`)
  await expect(cells.first()).toBeVisible()
  await cells.first().hover()
  await page.mouse.wheel(0, 60)
  // how far one wheel step goes is the engine's business (WebKit: 52 px here)
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(20)
  await app.settle()
  await hoverDrawer(app)
  let boxes = await cardBoxes(app.shell)
  expect(boxes.length).toBeGreaterThan(2)
  await openSettingsFromDrawer(page, app)
  expect(await cardBoxes(underlay(page))).toEqual(boxes)
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/home\/row\//)
  await expectPageUsable(page, app, cells.first())

  // a library grid: its own scroller
  await app.goto(`/library/${movies.Id}?tab=library`)
  await expect(cells.first()).toBeVisible()
  const scroller = page.locator('[data-page-root] [data-focus-enter="last"]')
  await app.gridCards.nth(1).hover()
  await page.mouse.wheel(0, 200)
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(24)
  await app.settle()
  await hoverDrawer(app)
  boxes = await cardBoxes(app.shell)
  expect(boxes.length).toBeGreaterThan(2)
  await openSettingsFromDrawer(page, app)
  expect(await cardBoxes(underlay(page))).toEqual(boxes)
})

test('/settings/subtitles on a wide window keeps its Back button (a preview fills the area beside the panel)', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  const titles = await rowTitles(app.shell)
  await openSettingsFromDrawer(page, app)
  await expect(settingsBack(page)).toHaveCount(0)
  await page.locator('[data-pref-id="SubtitleStyle"] [data-focusable]').first().click()
  await expect(page).toHaveURL(/\/settings\/subtitles$/)
  await expect(settingsBack(page)).toBeVisible()
  // nothing of the page shows around the preview

  await settingsBack(page).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(settingsBack(page)).toHaveCount(0)
  expect(await rowTitles(underlay(page))).toEqual(titles)
})

test('narrowing the window until the panel is the whole width brings the Back button back, widening it takes it away', { tag: [TAG.desktop] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  await openSettingsFromDrawer(page, app)
  await expect(settingsBack(page)).toHaveCount(0)
  await page.setViewportSize({ width: 700, height: 900 })
  await expect(settingsBack(page)).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(settingsBack(page)).toHaveCount(0)
  await clickBesidePanel(page)
  await app.expectHome()
  await expectPageUsable(page, app, app.homeCard('0:0'))
})

test('phone width: Settings is the whole width and keeps its Back button, which goes one step back', { tag: [TAG.phone, TAG.iphone] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  await app.tap(app.menuButton)
  await expect(app.drawer).toHaveAttribute('data-open', /.*/)
  await app.tap(app.drawer.getByRole('link', { name: 'Settings' }))
  await expect(page).toHaveURL(/\/settings$/)
  await expect(settingsBack(page)).toBeVisible()
  // the panel covers the window: nothing of the page shows beside or through it
  const panel = page.getByRole('region', { name: 'Settings' })
  expect(Math.round((await panel.boundingBox())!.width)).toBe(await page.evaluate(() => innerWidth))

  const row = page.locator('[data-pref-id="Topic-profile"] [data-focusable]').first()
  await row.scrollIntoViewIfNeeded()
  await app.tap(row)
  await expect(page).toHaveURL(/\/settings\/topic\/profile$/)
  await expect(settingsBack(page)).toBeVisible()
  await app.tap(settingsBack(page))
  await expect(page).toHaveURL(/\/settings$/)
  await app.tap(settingsBack(page))
  await app.expectHome()
  await expectPageUsable(page, app, app.homeCard('0:0'))
  // the drawer sheet closed when Settings was chosen and is closed on the page that returns
  await expect(app.drawer).not.toHaveAttribute('data-open')
})

test.describe('with animations on', () => {
  // the suite's reduced motion skips the cover: the page then simply appears
  test.use({ reducedMotion: 'no-preference' })

  test('Settings opens out of the drawer: its ground slides out once and the content fades in; the panel itself and the page do not move, and nothing moves between Settings screens', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app }) => {
    await app.goto('/')
    await app.expectHome()
    await app.settle()
    // every animation that starts inside the full-screen layout from now on (the copy behind the panel is still)
    await page.evaluate(() => {
      const w = window as unknown as { __started: string[] }
      w.__started = []
      const inSettings = (el: Element | null) => !!el?.closest('[data-fullscreen]') && !el.closest('[data-page-underlay] > *')
      document.addEventListener('animationstart', (e) => inSettings(e.target as Element) && w.__started.push(`css ${e.animationName}`), true)
      const animate = Element.prototype.animate
      Element.prototype.animate = function (...args: Parameters<Element['animate']>) {
        if (inSettings(this) && (this.matches('[data-page-root], [data-page-underlay]') || !!this.querySelector('[data-settings-list]'))) w.__started.push('script')
        return animate.apply(this, args)
      }
    })
    await openSettingsFromDrawer(page, app)
    const panel = page.getByRole('region', { name: 'Settings' })
    // at full strength and in place right away: the opening only uncovers the panel
    expect(await panel.evaluate((el) => `${getComputedStyle(el).opacity} ${getComputedStyle(el).transform} ${getComputedStyle(el.closest('[data-page-root]')!).opacity}`)).toBe('1 none 1')
    await app.activate(page.locator('[data-pref-id="Topic-playback"] [data-focusable], [data-pref-id="Topic-playback"][data-focusable]').first())
    await expect(page).toHaveURL(/\/settings\/topic\/playback$/)
    await expect(page.getByRole('region', { name: 'Playback' })).toBeVisible()
    await page.waitForTimeout(400)
    // the opening, played once when Settings opened (the names are hashed by the build): the ground behind the
    // panel slides out, and the header and the list fade in. Nothing else, and nothing on the next screen.
    const started = await page.evaluate(() => (window as unknown as { __started: string[] }).__started)
    expect(started.map((name) => /ground|content/.exec(name)?.[0]).sort()).toEqual(['content', 'content', 'ground'])
    // the ground is the drawer's colour with a soft end edge, one piece; on the next screen it is at rest
    const advanced = page.getByRole('region', { name: 'Playback' })
    expect(await advanced.evaluate((el) => getComputedStyle(el, '::before').animationName)).toBe('none')
    expect(await advanced.evaluate((el) => getComputedStyle(el, '::before').backgroundImage)).toContain('linear-gradient')
    expect(await advanced.evaluate((el) => getComputedStyle(el.querySelector('[data-settings-list]')!).opacity)).toBe('1')
  })

  test('back on the page: the copy covers the arriving page for a moment, the page does not fade in again, then the copy is gone', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app }) => {
    await app.goto('/')
    await app.expectHome()
    await openSettingsFromDrawer(page, app)
    await app.settle()
    type Cover = { added: number; removed: number; elements: number; shells: number; pageAnimations: number }
    await page.evaluate((selector) => {
      const log = { added: 0, removed: 0, elements: 0, shells: -1, pageAnimations: -1 }
      ;(window as unknown as { __cover: typeof log }).__cover = log
      const cover = (n: Node): n is HTMLElement => n instanceof HTMLElement && n.matches(selector)
      new MutationObserver((records) => {
        for (const r of records) {
          for (const n of Array.from(r.addedNodes).filter(cover)) {
            log.added++
            log.elements = n.querySelectorAll('*').length
            log.shells = document.querySelectorAll('[data-shell]').length
          }
          // a removed node has no parent left to match "body >" against
          for (const _ of Array.from(r.removedNodes).filter((n) => n instanceof HTMLElement && n.matches('div[inert][aria-hidden="true"]'))) {
            log.removed++
            // the page's own fade lasts 700 ms: it would still run now
            log.pageAnimations = document.querySelector('[data-shell] [data-page-root]')?.getAnimations().length ?? -1
          }
        }
      }).observe(document.body, { childList: true })
    }, RETURN_COVER)

    await clickBesidePanel(page)
    await expect(page).toHaveURL((u) => u.pathname === '/')
    const log = () => page.evaluate(() => (window as unknown as { __cover: Cover }).__cover)
    await expect.poll(async () => (await log()).removed).toBe(1)
    const seen = await log()
    expect(seen.added).toBe(1)
    // the cover held the copy, over the real page that was already there
    expect(seen.elements).toBeGreaterThan(50)
    expect(seen.shells).toBe(1)
    expect(seen.pageAnimations).toBe(0)
    await app.expectHome()
    await expectPageUsable(page, app, app.homeCard('0:0'))
  })

  test('back on the page: its backdrop picture is there from the first frame, it does not blank and fade in again', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app }) => {
    await app.goto('/')
    await app.expectHome()
    const image = page.locator('[data-shell] [data-shell-backdrop] img')
    // the focused card's backdrop, after its 500 ms wait and 800 ms fade
    await expect(image).toHaveCSS('opacity', '1', { timeout: 15_000 })
    const src = await image.getAttribute('src')
    await openSettingsFromDrawer(page, app)
    await app.settle()
    // the returned page's backdrop on each of its first 90 frames (1.5 s: longer than the wait and most of the fade)
    await page.evaluate(() => {
      const w = window as unknown as { __backdrop: string[] }
      w.__backdrop = []
      const tick = () => {
        const shell = document.querySelector('[data-shell]')
        if (shell) {
          const img = shell.querySelector('[data-shell-backdrop] img')
          w.__backdrop.push(img ? `${img.getAttribute('src')} ${getComputedStyle(img).opacity}` : 'none')
        }
        if (w.__backdrop.length < 90) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    // Escape, not a click: the pointer stays where it is (a pointer arriving on a card would select that card)
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL((u) => u.pathname === '/')
    await expect.poll(() => page.evaluate(() => (window as unknown as { __backdrop: string[] }).__backdrop.length)).toBe(90)
    const frames = await page.evaluate(() => (window as unknown as { __backdrop: string[] }).__backdrop)
    expect(Array.from(new Set(frames))).toEqual([`${src} 1`])
  })
})
