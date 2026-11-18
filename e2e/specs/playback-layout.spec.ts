// The web player's control layout (owner request, a deliberate departure from the TV controller): nothing darkens
// the picture while the controls show, the control strip is low enough for the black bar of a 2.39:1 film, and
// chapters and queue are panels opened from two buttons of the strip. Real codecs (headless, muted Edge), a few
// seconds of video per test, paused at once. Playing reports progress, which is server state: the tests run in the
// writes project, snapshot every item they play and wait for the Stopped report before the fixture restores it.
import type { Page } from '@playwright/test'
import { TAG, expect, test } from '../fixtures'
import type { Item } from '../fixtures/api'

test.use({ channel: 'msedge' })
// one video at a time, in order; a failure does not skip the tests after it
test.describe.configure({ mode: 'default' })

/** A 2.39:1 film leaves (1 - (16/9) / 2.39) / 2 of a 16:9 screen's height black under the picture. */
const LETTERBOX_BAR = (1 - 16 / 9 / 2.39) / 2
/** The owner's model (Jellyfin's web player) is about 8.5 % high; "large desktop window" in the brief: 9 %. */
const DESKTOP_SHARE = 0.09

const strip = '[data-player-strip]'
const button = (page: Page, name: string) => page.locator(`[data-player-button="${name}"]`)
const panel = (page: Page, name: 'chapters' | 'queue') => page.locator(`[data-player-panel="${name}"]`)

/** Opens the player on the item and pauses it once it decodes and advances. */
async function playPaused(page: Page, item: Item, startMs = 0) {
  await page.goto(`/play/${item.Id}?t=${startMs}`)
  await page.waitForFunction((from) => {
    const v = document.querySelector('video')
    return !!v && v.readyState >= 2 && !v.seeking && v.currentTime > from + 0.3
  }, startMs / 1000, { timeout: 30_000 })
  // k = play / pause. Pressed again when the video still runs: the first key of a page can arrive before the
  // player listens.
  const paused = () => page.locator('video').evaluate((v: HTMLVideoElement) => v.paused)
  await expect(async () => {
    if (!(await paused())) await page.keyboard.press('k')
    await expect.poll(paused, { timeout: 2_000 }).toBe(true)
  }).toPass({ timeout: 15_000 })
}

/** Back out of the player and wait until the server has answered the Stopped report (its session is closed). */
async function leavePlayer(page: Page) {
  const stopped = page.waitForRequest((r) => /\/Sessions\/Playing\/Stopped/.test(r.url()), { timeout: 20_000 })
  for (let i = 0; i < 8 && new URL(page.url()).pathname.startsWith('/play'); i++) await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/\/play\//)
  await (await stopped).response()
}

/** The controls, shown the way a mouse user gets them. The pointer ends on the picture, away from both strips. */
async function showControlsWithMouse(page: Page) {
  const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }))
  await page.mouse.move(w * 0.3, h * 0.45)
  await page.mouse.move(w * 0.3 + 12, h * 0.45 + 12)
  await expect(page.locator(strip)).toBeVisible()
}

/** Height of the control strip as a share of the window height, and the strip's top edge. */
function stripShare(page: Page) {
  return page.locator(strip).evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { share: r.height / innerHeight, top: r.top, bottom: r.bottom, height: r.height, window: innerHeight }
  })
}

/**
 * What is painted over the <video> at a point of the picture: every element of the player that covers the point
 * (and its ::before / ::after) and has a background colour, picture or gradient. Empty when nothing darkens it.
 * The player's own boxes around the video (its black page) are behind the picture and do not count.
 */
function paintOverPicture(page: Page, fx: number, fy: number) {
  return page.evaluate(
    ([fx, fy]) => {
      const x = innerWidth * fx
      const y = innerHeight * fy
      const video = document.querySelector('video')!
      // the player's root: the fixed box that fills the window
      let root: HTMLElement = video
      while (root.parentElement && getComputedStyle(root).position !== 'fixed') root = root.parentElement
      const painted = (cs: CSSStyleDeclaration) => {
        // "rgba(0, 0, 0, 0)", or "color(srgb 0 0 0 / 0)" for a colour computed from a token
        const c = cs.backgroundColor.replaceAll(' ', '')
        const transparent = c === 'transparent' || c.endsWith(',0)') || c.endsWith('/0)')
        return !transparent || cs.backgroundImage !== 'none'
      }
      const shown = (el: Element) => {
        for (let a: Element | null = el; a && a !== root.parentElement; a = a.parentElement) {
          const cs = getComputedStyle(a)
          if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false
        }
        return true
      }
      const out: string[] = []
      for (const el of root.querySelectorAll('*')) {
        if (el === video || el.contains(video)) continue
        const r = el.getBoundingClientRect()
        if (x < r.left || x > r.right || y < r.top || y > r.bottom || !shown(el)) continue
        const name = `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') ?? '').split(' ')[0]}`
        if (painted(getComputedStyle(el))) out.push(name)
        for (const pseudo of ['::before', '::after']) {
          const cs = getComputedStyle(el, pseudo)
          if (cs.content !== 'none' && cs.display !== 'none' && painted(cs)) out.push(name + pseudo)
        }
      }
      return out
    },
    [fx, fy] as const,
  )
}

/** The pixels of a 48 x 48 square of the picture (PNG bytes of the paused frame with whatever lies over it). */
async function pictureSample(page: Page, fx: number, fy: number) {
  const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }))
  return (await page.screenshot({ clip: { x: Math.round(w * fx), y: Math.round(h * fy), width: 48, height: 48 } })).toString('base64')
}

/** Left and right edge of every button of the strip, by name, plus the window width. */
function stripButtons(page: Page) {
  return page.evaluate(() => {
    const s = document.querySelector('[data-player-strip]')!.getBoundingClientRect()
    return {
      window: innerWidth,
      strip: { top: s.top, bottom: s.bottom },
      buttons: Array.from(document.querySelectorAll<HTMLElement>('[data-player-strip] [data-player-button]'), (b) => {
        const r = b.getBoundingClientRect()
        return { name: b.dataset.playerButton!, left: r.left, right: r.right, top: r.top, bottom: r.bottom }
      }),
    }
  })
}

// ---------------------------------------------------------------------------------------------------------------

test.describe('player layout: the picture and the control strip', () => {
  test('nothing darkens the picture while the controls show; the dim preference brings the TV scrim back', { tag: [TAG.writes] }, async ({ page, app, api }) => {
    const item = await api.findMovie('Chapter Marathon')
    await api.snapshot(item.Id)
    await app.goto('/')
    await app.setPreference('controllerTimeout', 15_000)
    await playPaused(page, item, 40_000)

    // the bare, paused picture: wait until the controls of the arrival are gone
    await expect(page.locator(strip)).toBeHidden({ timeout: 20_000 })
    // away from the middle (the pause mark) and from both strips
    const at = [0.3, 0.42] as const
    const bare = await pictureSample(page, ...at)

    await showControlsWithMouse(page)
    await expect(page.locator('[data-player-top]')).toBeVisible()
    // the picture under the pointer is the same picture: no veil, and nothing with a background over the video
    expect(await paintOverPicture(page, ...at)).toEqual([])
    expect(await paintOverPicture(page, 0.7, 0.6)).toEqual([])
    expect(await pictureSample(page, ...at)).toBe(bare)

    // a panel does not darken it either (the chapters panel is at the end side; the sample is at the start side)
    await button(page, 'chapters').click()
    await expect(panel(page, 'chapters')).toBeVisible()
    expect(await pictureSample(page, ...at)).toBe(bare)
    await page.keyboard.press('Escape')
    await expect(panel(page, 'chapters')).toBeHidden()

    // only the two strips have a dark background of their own
    expect((await paintOverPicture(page, 0.5, 0.01)).length).toBeGreaterThan(0)
    expect((await paintOverPicture(page, 0.5, 0.99)).length).toBeGreaterThan(0)

    // "Dim the video while the controls are shown" (off by default): the TV's gradient over the whole screen
    await app.setPreference('webPlayerDimVideo', true)
    await showControlsWithMouse(page)
    await expect.poll(() => paintOverPicture(page, ...at)).not.toEqual([])
    expect(await pictureSample(page, ...at)).not.toBe(bare)
    await app.setPreference('webPlayerDimVideo', false)
    await expect.poll(() => paintOverPicture(page, ...at)).toEqual([])

    await leavePlayer(page)
  })

  test('the strip fits the black bar of a 2.39:1 film and keeps its limit in every window', { tag: [TAG.writes] }, async ({ page, app, api }) => {
    const item = await api.findMovie('Coffee Run')
    await api.snapshot(item.Id)
    await app.goto('/')
    await app.setPreference('controllerTimeout', 15_000)
    await page.setViewportSize({ width: 1280, height: 720 })
    await playPaused(page, item, 60_000)
    // the file really is a wide film
    const ratio = await page.locator('video').evaluate((v: HTMLVideoElement) => v.videoWidth / v.videoHeight)
    expect(ratio).toBeGreaterThan(2.3)

    const sizes: Array<{ w: number; h: number; desktop?: boolean; wide16x9?: boolean }> = [
      { w: 1280, h: 720, desktop: true, wide16x9: true },
      { w: 1920, h: 1080, desktop: true, wide16x9: true },
      { w: 2560, h: 1440, desktop: true, wide16x9: true },
      { w: 2560, h: 1080, desktop: true },
      { w: 1440, h: 900, desktop: true },
      { w: 1024, h: 600 },
      { w: 844, h: 390 },
      { w: 640, h: 360 },
      { w: 390, h: 844 },
      { w: 360, h: 640 },
    ]
    for (const size of sizes) {
      const label = `${size.w}x${size.h}`
      await page.setViewportSize({ width: size.w, height: size.h })
      await showControlsWithMouse(page)
      const s = await stripShare(page)
      // seek line, times, the row(s) of buttons and the paddings: all inside the strip, the strip on the bottom edge
      expect(s.share, `${label}: strip height as a share of the window`).toBeLessThanOrEqual(LETTERBOX_BAR + 0.0005)
      if (size.desktop) expect(s.share, `${label}: a large desktop window`).toBeLessThanOrEqual(DESKTOP_SHARE)
      expect(Math.abs(s.bottom - s.window), `${label}: the strip sits on the bottom edge`).toBeLessThanOrEqual(1)
      if (size.wide16x9) {
        // the strip starts below the picture: it covers nothing of a 2.39:1 film on a 16:9 screen
        const pictureBottom = await page.locator('video').evaluate((v: HTMLVideoElement) => {
          const r = v.getBoundingClientRect()
          const height = Math.min(r.height, r.width / (v.videoWidth / v.videoHeight))
          return r.top + (r.height + height) / 2
        })
        expect(s.top, `${label}: strip top against the picture's bottom edge`).toBeGreaterThanOrEqual(pictureBottom - 0.5)
      }
      // every button is whole inside the window and inside the strip, and no two overlap
      const b = await stripButtons(page)
      expect(b.buttons.map((x) => x.name), label).toEqual(expect.arrayContaining(['previous', 'skip-back', 'play', 'skip-forward', 'next', 'subtitles', 'audio', 'volume', 'settings']))
      for (const x of b.buttons) {
        expect(x.left, `${label}: ${x.name}`).toBeGreaterThanOrEqual(0)
        expect(x.right, `${label}: ${x.name}`).toBeLessThanOrEqual(b.window + 0.5)
        expect(x.top, `${label}: ${x.name}`).toBeGreaterThanOrEqual(b.strip.top - 0.5)
        expect(x.bottom, `${label}: ${x.name}`).toBeLessThanOrEqual(b.strip.bottom + 0.5)
      }
      for (const x of b.buttons) {
        for (const y of b.buttons) {
          if (x === y || x.top >= y.bottom - 0.5 || y.top >= x.bottom - 0.5) continue
          expect(x.right <= y.left + 0.5 || y.right <= x.left + 0.5, `${label}: ${x.name} and ${y.name} do not overlap`).toBe(true)
        }
      }
      // the transport buttons sit in the middle of the strip where both sides have room (owner request)
      if (b.window >= 1024) {
        const edge = (name: string, side: 'left' | 'right') => b.buttons.find((i) => i.name === name)![side]
        expect(Math.abs((edge('previous', 'left') + edge('next', 'right')) / 2 - b.window / 2), `${label}: transport centred`).toBeLessThan(2)
      }
      // the seek bar and both times are part of the strip
      await expect(page.locator(`${strip} [data-seekbar]`)).toBeVisible()
      await expect(page.locator(`${strip} [data-player-time="elapsed"]`)).toBeVisible()
      await expect(page.locator(`${strip} [data-player-time="remaining"]`)).toBeVisible()
    }

    // one row of buttons on a desktop and on a phone in landscape, two on a phone in portrait
    const rows = async () => new Set((await stripButtons(page)).buttons.map((x) => Math.round(x.top))).size
    await page.setViewportSize({ width: 1280, height: 720 })
    await showControlsWithMouse(page)
    expect(await rows()).toBe(1)
    await page.setViewportSize({ width: 844, height: 390 })
    await showControlsWithMouse(page)
    expect(await rows()).toBe(1)
    await page.setViewportSize({ width: 390, height: 844 })
    await showControlsWithMouse(page)
    expect(await rows()).toBe(2)

    // title and "Ends at" kept their places: the top strip and the button row
    await page.setViewportSize({ width: 1280, height: 720 })
    await showControlsWithMouse(page)
    await expect(page.locator('[data-player-top]')).toContainText('Coffee Run')
    await expect(page.locator(strip)).toContainText(/Ends at \d/)
    await leavePlayer(page)
  })
})

test.describe('player layout: chapters and queue panels', () => {
  test('mouse: the Chapters button opens a panel on the strip at the end side; choosing a chapter seeks; outside press and the button close it', { tag: [TAG.writes] }, async ({ page, app, api }) => {
    const item = await api.findMovie('Chapter Marathon')
    await api.snapshot(item.Id)
    const chapters = (await api.get<{ Chapters?: { Name?: string; StartPositionTicks?: number }[] }>(`/Items/${item.Id}`, { userId: api.userId, fields: 'Chapters' })).Chapters ?? []
    expect(chapters.length).toBeGreaterThan(3)
    await app.goto('/')
    await app.setPreference('controllerTimeout', 15_000)
    // inside the fourth chapter
    const startMs = Math.round((chapters[3].StartPositionTicks ?? 0) / 10_000) + 3_000
    await playPaused(page, item, startMs)
    await showControlsWithMouse(page)

    // no rows of cards under the controls any more: a button in the row, no Queue button for a single movie
    await expect(button(page, 'chapters')).toBeVisible()
    await expect(button(page, 'queue')).toHaveCount(0)
    await expect(button(page, 'chapters')).toHaveAttribute('aria-expanded', 'false')

    await button(page, 'chapters').click()
    const list = panel(page, 'chapters')
    await expect(list).toBeVisible()
    // one row per chapter with its name, the one being played marked and focused
    await expect(list.locator('[data-chapter]')).toHaveCount(chapters.length)
    await expect(list.locator('[data-chapter]').nth(1)).toContainText(chapters[1].Name ?? '')
    await expect(list.locator('[data-current]')).toHaveCount(1)
    await expect(list.locator('[data-chapter="3"]')).toHaveAttribute('data-current', 'true')
    await expect(list.locator('[data-chapter="3"] button')).toBeFocused()
    await expect(button(page, 'chapters')).toHaveAttribute('aria-expanded', 'true')
    // the server has a picture for every chapter of this item
    await expect(list.locator('[data-chapter="0"] img')).toBeVisible()

    // on the strip, at the end side, not wider than half the window; the strip stays up under it
    const box = await page.locator('[data-player-sheet] [role="dialog"]').evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, window: innerWidth }
    })
    const s = await stripShare(page)
    expect(box.bottom).toBeLessThanOrEqual(s.top)
    expect(box.width).toBeLessThanOrEqual(box.window / 2)
    expect(box.window - box.right).toBeLessThan(24)
    expect(box.left).toBeGreaterThan(box.window / 2 - 24)
    await expect(page.locator(strip)).toBeVisible()

    // a press outside closes it and does not start the video
    await page.mouse.click(box.window * 0.25, s.window * 0.4)
    await expect(list).toBeHidden()
    expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
    await expect(page.locator(strip)).toBeVisible()

    // its own button closes it too (and does not open it again)
    await button(page, 'chapters').click()
    await expect(list).toBeVisible()
    const where = (await button(page, 'chapters').boundingBox())!
    await page.mouse.click(where.x + where.width / 2, where.y + where.height / 2)
    await expect(list).toBeHidden()
    await expect(button(page, 'chapters')).toHaveAttribute('aria-expanded', 'false')

    // the Close button of the panel
    await button(page, 'chapters').click()
    await expect(list).toBeVisible()
    await button(page, 'panel-close').click()
    await expect(list).toBeHidden()

    // choosing a chapter seeks to its start, closes the panel and hides the controls
    await button(page, 'chapters').click()
    await list.locator('[data-chapter="1"] button').click()
    const target = (chapters[1].StartPositionTicks ?? 0) / 10_000_000
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThanOrEqual(target - 0.5)
    expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeLessThan(target + 5)
    await expect(list).toBeHidden()
    await expect(page.locator(strip)).toBeHidden()

    await leavePlayer(page)
  })

  test('keyboard: arrows and Tab reach every control; both panels open, move, close with focus back on their button, and choose', { tag: [TAG.writes] }, async ({ page, app, api }) => {
    const series = await api.findSeries('Orbital Drift')
    const episodes = (await api.items({ includeItemTypes: 'Episode', parentId: series.Id, sortBy: 'ParentIndexNumber,IndexNumber', fields: 'Chapters' })) as Array<
      Item & { ParentIndexNumber?: number; IndexNumber?: number; Chapters?: { StartPositionTicks?: number }[] }
    >
    const season1 = episodes.filter((e) => e.ParentIndexNumber === 1)
    const [first, second] = season1
    expect(first?.Chapters?.length ?? 0).toBeGreaterThan(1)
    // both are watched episodes already: playing them a few seconds moves no "Next up"
    await api.snapshot(first.Id)
    await api.snapshot(second.Id)
    await app.goto('/')
    await app.setPreference('controllerTimeout', 15_000)
    await playPaused(page, first, 12_000)
    await expect(page.locator(strip)).toBeHidden({ timeout: 20_000 })

    const focusedName = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.playerButton ?? (document.activeElement?.hasAttribute('data-seekbar') ? 'seek' : null))

    // Enter shows the controls with Play focused, as OK does on the TV
    await page.keyboard.press('Enter')
    await expect(button(page, 'play')).toBeFocused()

    // Right walks the row to its end, Left back to its start: every button of the strip takes focus
    const all = (await stripButtons(page)).buttons.map((b) => b.name)
    expect(all).toEqual(expect.arrayContaining(['chapters', 'queue']))
    const seen = new Set<string>(['play'])
    for (let i = 0; i < all.length + 2; i++) {
      await page.keyboard.press('ArrowRight')
      const name = await focusedName()
      if (name) seen.add(name)
    }
    expect(await focusedName()).toBe(all[all.length - 1])
    for (let i = 0; i < all.length + 3; i++) {
      await page.keyboard.press('ArrowLeft')
      const name = await focusedName()
      if (name) seen.add(name)
    }
    expect(await focusedName()).toBe('previous')
    expect([...seen].sort()).toEqual([...all].sort())

    // Up: the seek bar, then the Back button of the top strip
    await page.keyboard.press('ArrowUp')
    await expect(page.locator('[data-seekbar]')).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(button(page, 'back')).toBeFocused()
    // Down from Back lands on the control under it (the seek bar or, at the start edge, the first button)
    await page.keyboard.press('ArrowDown')
    expect(['seek', ...all]).toContain(await focusedName())

    // Tab reaches the same controls (and the Skip button of the intro segment, when one is running)
    const tabbed = new Set<string>()
    for (let i = 0; i < all.length + 8; i++) {
      await page.keyboard.press('Tab')
      const name = await focusedName()
      if (name) tabbed.add(name)
    }
    expect([...tabbed].sort()).toEqual([...all, 'back', 'seek'].sort())

    // ---- chapters, by its button
    await button(page, 'chapters').focus()
    await page.keyboard.press('Enter')
    const chapterList = panel(page, 'chapters')
    await expect(chapterList).toBeVisible()
    const current = chapterList.locator('[data-current] button')
    await expect(current).toBeFocused()
    const startIndex = Number(await chapterList.locator('[data-current]').getAttribute('data-chapter'))
    // arrows move inside the panel and stay in it
    await page.keyboard.press('ArrowDown')
    await expect(chapterList.locator(`[data-chapter="${startIndex + 1}"] button`)).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowRight')
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-player-sheet]'))).toBe(true)
    // Escape closes it; focus is back on the Chapters button and the strip is still up
    await page.keyboard.press('Escape')
    await expect(chapterList).toBeHidden()
    await expect(button(page, 'chapters')).toBeFocused()
    await expect(page.locator(strip)).toBeVisible()
    // its shortcut opens it and closes it again
    await page.keyboard.press('h')
    await expect(chapterList).toBeVisible()
    await page.keyboard.press('h')
    await expect(chapterList).toBeHidden()
    await expect(button(page, 'chapters')).toBeFocused()
    // Enter on another chapter seeks there, and that Enter does not bring the hidden controls back
    await page.keyboard.press('Enter')
    await expect(current).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(chapterList.locator(`[data-chapter="${startIndex - 1}"] button`)).toBeFocused()
    await page.keyboard.press('Enter')
    const chapterStart = (first.Chapters![startIndex - 1].StartPositionTicks ?? 0) / 10_000_000
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement, at) => Math.abs(v.currentTime - at), chapterStart)).toBeLessThan(1.5)
    await expect(chapterList).toBeHidden()
    await expect(page.locator(strip)).toBeHidden()

    // ---- queue, by its shortcut and by its button
    await page.keyboard.press('q')
    const queueList = panel(page, 'queue')
    await expect(queueList).toBeVisible()
    // the strip comes up under a panel opened from the bare video
    await expect(page.locator(strip)).toBeVisible()
    await expect(queueList.locator('[data-queue]').first()).toContainText(first.Name ?? '')
    await expect(queueList.locator('[data-queue="0"]')).toHaveAttribute('data-current', 'true')
    await expect(queueList.locator('[data-queue="0"] button')).toBeFocused()
    expect(await queueList.locator('[data-queue]').count()).toBeGreaterThan(1)
    await page.keyboard.press('q')
    await expect(queueList).toBeHidden()

    await button(page, 'queue').focus()
    await page.keyboard.press('Enter')
    await expect(queueList.locator('[data-queue="0"] button')).toBeFocused()
    await page.keyboard.press('Backspace')
    await expect(queueList).toBeHidden()
    await expect(button(page, 'queue')).toBeFocused()

    // choosing the next entry plays it: the address follows, the panel and the controls are gone
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    await expect(queueList.locator('[data-queue="1"] button')).toBeFocused()
    await expect(queueList.locator('[data-queue="1"]')).toContainText(second.Name ?? '')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL((u) => u.pathname === `/play/${second.Id}`, { timeout: 20_000 })
    await expect(queueList).toBeHidden()
    await page.waitForFunction(() => {
      const v = document.querySelector('video')
      return !!v && v.readyState >= 2 && v.currentTime > 0.2
    }, null, { timeout: 30_000 })
    await page.keyboard.press('k')

    await leavePlayer(page)
  })
})

test.describe('player layout: right to left', () => {
  test.use({ locale: 'he-IL' })

  test('Hebrew: the strip and the panel mirror, the transport buttons and the seek line do not', { tag: [TAG.writes] }, async ({ page, app, api }) => {
    const item = await api.findMovie('Chapter Marathon')
    await api.snapshot(item.Id)
    await app.goto('/')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await app.setPreference('controllerTimeout', 15_000)
    await playPaused(page, item, 40_000)
    await showControlsWithMouse(page)

    const b = await stripButtons(page)
    const x = (name: string) => b.buttons.find((i) => i.name === name)!.left
    // transport in the middle of the strip (owner request), in its left-to-right order; the options at the end edge (the left)
    const right = (name: string) => b.buttons.find((i) => i.name === name)!.right
    expect(Math.abs((x('previous') + right('next')) / 2 - b.window / 2)).toBeLessThan(2)
    expect(x('previous')).toBeLessThan(x('play'))
    expect(x('play')).toBeLessThan(x('next'))
    expect(x('settings')).toBeLessThan(x('subtitles'))
    expect(x('subtitles')).toBeLessThan(x('chapters'))
    expect(x('chapters')).toBeLessThan(b.window / 2)
    // elapsed time at the left of the seek line, remaining at its right, as in every locale
    const times = await page.evaluate(() => ['elapsed', 'remaining'].map((n) => document.querySelector(`[data-player-time="${n}"]`)!.getBoundingClientRect().left))
    const seek = (await page.locator('[data-seekbar]').boundingBox())!
    expect(times[0]).toBeLessThan(seek.x)
    expect(times[1]).toBeGreaterThan(seek.x + seek.width - 1)
    // Back at the right end of the top strip
    expect((await button(page, 'back').boundingBox())!.x).toBeGreaterThan(b.window / 2)

    // the panel stands at the end side: the left
    await button(page, 'chapters').click()
    await expect(panel(page, 'chapters')).toBeVisible()
    const box = (await page.locator('[data-player-sheet] [role="dialog"]').boundingBox())!
    expect(box.x).toBeLessThan(24)
    expect(box.x + box.width).toBeLessThanOrEqual(b.window / 2 + 24)
    await page.keyboard.press('Escape')
    await expect(panel(page, 'chapters')).toBeHidden()

    await leavePlayer(page)
  })
})

test.describe('player layout: phone', () => {
  // the writes project's desktop Chromium as a touch phone (the phone project is read-only)
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('touch: a tap shows the two-row strip; the chapters panel is as wide as the screen and a tap chooses; landscape is one row', { tag: [TAG.writes] }, async ({ page, app, api }) => {
    const item = await api.findMovie('Chapter Marathon')
    await api.snapshot(item.Id)
    await app.goto('/')
    await app.setPreference('controllerTimeout', 15_000)
    await playPaused(page, item, 40_000)
    await expect(page.locator(strip)).toBeHidden({ timeout: 20_000 })

    const tapPicture = async () => {
      const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }))
      await page.touchscreen.tap(w / 2, h * 0.3)
    }
    await tapPicture()
    await expect(page.locator(strip)).toBeVisible()
    const portrait = await stripShare(page)
    expect(portrait.share).toBeLessThanOrEqual(LETTERBOX_BAR + 0.0005)
    const p = await stripButtons(page)
    expect(new Set(p.buttons.map((x) => Math.round(x.top))).size).toBe(2)
    for (const x of p.buttons) {
      expect(x.left, x.name).toBeGreaterThanOrEqual(0)
      expect(x.right, x.name).toBeLessThanOrEqual(p.window + 0.5)
    }

    // the panel: the whole width (less the 8dp margins), on the strip
    await button(page, 'chapters').tap()
    const list = panel(page, 'chapters')
    await expect(list).toBeVisible()
    const box = (await page.locator('[data-player-sheet] [role="dialog"]').boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(p.window - 17)
    expect(box.y + box.height).toBeLessThanOrEqual(portrait.top)
    // a tap on a row seeks there
    await list.locator('[data-chapter="1"] button').tap()
    await expect(list).toBeHidden()
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeLessThan(30)

    // landscape: one row, still inside the limit, every button inside the screen
    await page.setViewportSize({ width: 844, height: 390 })
    await tapPicture()
    await expect(page.locator(strip)).toBeVisible()
    const landscape = await stripShare(page)
    expect(landscape.share).toBeLessThanOrEqual(LETTERBOX_BAR + 0.0005)
    const l = await stripButtons(page)
    expect(new Set(l.buttons.map((x) => Math.round(x.top))).size).toBe(1)
    for (const x of l.buttons) {
      expect(x.left, x.name).toBeGreaterThanOrEqual(0)
      expect(x.right, x.name).toBeLessThanOrEqual(l.window + 0.5)
    }
    // the panel there: half the screen at most, scrolling inside
    await button(page, 'chapters').tap()
    await expect(list).toBeVisible()
    const wide = (await page.locator('[data-player-sheet] [role="dialog"]').boundingBox())!
    expect(wide.width).toBeLessThanOrEqual(l.window / 2)
    expect(wide.y).toBeGreaterThanOrEqual(0)
    expect(wide.y + wide.height).toBeLessThanOrEqual(landscape.top)
    await button(page, 'panel-close').tap()
    await expect(list).toBeHidden()

    await leavePlayer(page)
  })
})
