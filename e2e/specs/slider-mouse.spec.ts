// Sliders and seek bars under a mouse. A press on one is the control's alone: with the page's text selection over
// the control (select all, a double click on the slider, a selection across its row) the browser used to drag the
// selection away instead. The pointer events then ended in a pointercancel (WebKit: they just stopped), the cursor
// showed "not allowed" and the slider stayed where it was; it worked again once the selection was gone, hence
// "sometimes". Real mouse input; every gesture is checked for a drag-and-drop that got through and for a cancel.
// Touch is settings.spec.ts ("a finger that starts on a slider..."), keys are the unit tests.
import type { Locator, Page } from '@playwright/test'
import { TAG, expect, test } from '../fixtures'

interface GestureLog {
  /** dragstart events that reached the window without being refused: the browser began a drag-and-drop */
  drags: number
  /** pointercancel events */
  cancels: number
}
type Watched = { __sliderMouse?: GestureLog }

/** Counts, from now on, what no mouse gesture on a slider may produce. */
const watchGestures = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as Watched
    const fresh = !w.__sliderMouse
    w.__sliderMouse = { drags: 0, cancels: 0 }
    if (!fresh) return
    // bubble phase: after the control had its say
    window.addEventListener('dragstart', (e) => {
      if (!e.defaultPrevented) w.__sliderMouse!.drags++
    })
    window.addEventListener('pointercancel', () => w.__sliderMouse!.cancels++, true)
  })
const gestures = (page: Page) => page.evaluate(() => (window as unknown as Watched).__sliderMouse)
const CLEAN: GestureLog = { drags: 0, cancels: 0 }

const selectedText = (page: Page) => page.evaluate(() => String(getSelection()))
const clearSelection = (page: Page) => page.evaluate(() => getSelection()?.removeAllRanges())
const selectAll = async (page: Page) => {
  await page.keyboard.press('ControlOrMeta+a')
  expect((await selectedText(page)).length, 'select all selected the text of the page').toBeGreaterThan(20)
}

const range = async (slider: Locator) => {
  const [now, min, max] = await Promise.all(['aria-valuenow', 'aria-valuemin', 'aria-valuemax'].map(async (a) => Number(await slider.getAttribute(a))))
  return { now, min, max }
}
/** The point at fraction `f` of the control's width (0 = the left edge of the screen box, in every language). */
const pointOn = async (slider: Locator, f: number, dy = 0) => {
  const box = (await slider.boundingBox())!
  return { x: box.x + box.width * f, y: box.y + box.height / 2 + dy }
}
/** The fraction of the control's width where its thumb is. */
const thumbAt = async (slider: Locator) => {
  const { now, min, max } = await range(slider)
  const f = (now - min) / (max - min)
  return (await slider.evaluate((el) => getComputedStyle(el).direction === 'rtl')) ? 1 - f : f
}
/**
 * The control shows the value at fraction `f` of its width, within `slack` of its range (a step, and the few
 * pixels between the control's box and its track). Polled: a value shown by a state update can be a frame late.
 */
async function expectValueAt(slider: Locator, f: number, message: string, slack = 0.045) {
  const { min, max } = await range(slider)
  const mirrored = await slider.evaluate((el) => getComputedStyle(el).direction === 'rtl')
  const want = min + Math.min(1, Math.max(0, mirrored ? 1 - f : f)) * (max - min)
  await expect
    .poll(async () => Math.abs((await range(slider)).now - want) / (max - min), { message: `${message}: the value is the one under the pointer (${Math.round(want)} of ${min}..${max})` })
    .toBeLessThanOrEqual(slack)
}
/** Presses the mouse on the control at `from` and moves to `to` (fractions of its width); the button stays down. */
async function pressAndMove(page: Page, slider: Locator, from: number, to: number, opts: { steps?: number; dy?: number } = {}) {
  const a = await pointOn(slider, from)
  const b = await pointOn(slider, to, opts.dy ?? 0)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: opts.steps ?? 8 })
}
/** A whole drag: it follows the pointer while the button is down, keeps the value at the release, and nothing cancelled it. */
async function drag(page: Page, slider: Locator, from: number, to: number, message: string, opts: { steps?: number; dy?: number; slack?: number } = {}) {
  await watchGestures(page)
  await pressAndMove(page, slider, from, to, opts)
  await expectValueAt(slider, to, `${message}, button down`, opts.slack)
  await page.mouse.up()
  await expectValueAt(slider, to, `${message}, released`, opts.slack)
  expect(await gestures(page), `${message}: no drag-and-drop began and no pointer was cancelled`).toEqual(CLEAN)
}

// Interface scale applies at the release and re-lays out the page (`onDragValue`); Skip forward applies on the way.
const SETTINGS_SLIDERS = [
  { id: 'WebInterfaceScale', what: 'the interface scale (applied at the release)' },
  { id: 'SkipForward', what: 'skip forward (applied on the way)' },
] as const

for (const language of [
  { name: 'English', locale: 'en-US', dir: 'ltr' },
  { name: 'Hebrew', locale: 'he-IL', dir: 'rtl' },
] as const) {
  test.describe(`settings sliders with a mouse, ${language.name}`, () => {
    // the app follows the browser's language
    test.use({ locale: language.locale })

    for (const { id, what } of SETTINGS_SLIDERS) {
      test(`${what} follows the mouse whatever is selected on the page`, { tag: [TAG.desktop, TAG.engines] }, async ({ page, app }) => {
        await app.goto('/settings')
        await expect(page.locator('html')).toHaveAttribute('dir', language.dir)
        const row = page.locator(`[data-pref-id="${id}"]`)
        const slider = row.getByRole('slider')
        await slider.evaluate((el) => el.scrollIntoView({ block: 'center' }))
        await app.settle()
        await expect(slider).toBeInViewport({ ratio: 1 })

        await test.step('everything selected (select all), a press on the track and a drag', async () => {
          await selectAll(page)
          await drag(page, slider, 0.3, 0.8, 'after select all')
        })

        await test.step('a double click on the slider selects nothing, and the next press on the thumb drags', async () => {
          await clearSelection(page)
          const mid = await pointOn(slider, 0.5)
          // (where the value lands is not asked: the first click of the two applies the interface scale and the
          // slider is laid out anew under the second)
          await page.mouse.dblclick(mid.x, mid.y)
          expect(await selectedText(page), 'text selected by a double click on the slider').toBe('')
          await drag(page, slider, await thumbAt(slider), 0.2, 'after a double click on the slider')
        })

        await test.step('a selection across the row, a fast drag that leaves the slider downwards', async () => {
          await row.evaluate((el) => {
            const all = document.createRange()
            all.selectNodeContents(el)
            getSelection()!.removeAllRanges()
            getSelection()!.addRange(all)
          })
          expect((await selectedText(page)).length).toBeGreaterThan(3)
          await drag(page, slider, 0.25, 0.7, 'with the row selected', { steps: 1, dy: 90 })
        })

        await test.step('everything selected, from one edge past the other and out of the window, and back', async () => {
          await selectAll(page)
          await watchGestures(page)
          await pressAndMove(page, slider, 0.01, 0.99)
          await expectValueAt(slider, 1, 'at the far edge')
          const { y } = await pointOn(slider, 0.5)
          const width = await page.evaluate(() => innerWidth)
          // past the right edge of the slider, then out of the window on the left: the value stays at the ends
          await page.mouse.move(width - 2, y - 30, { steps: 4 })
          await expectValueAt(slider, 1, 'beyond the far edge')
          await page.mouse.move(-40, y + 30, { steps: 6 })
          await expectValueAt(slider, 0, 'outside the window')
          const back = await pointOn(slider, 0.6)
          await page.mouse.move(back.x, back.y, { steps: 6 })
          await expectValueAt(slider, 0.6, 'back on the slider, button down')
          await page.mouse.up()
          await expectValueAt(slider, 0.6, 'back on the slider, released')
          expect(await gestures(page), 'no drag-and-drop began and no pointer was cancelled').toEqual(CLEAN)
        })

        await test.step('a drag selects no text itself, and the pressed slider has focus: the keys go on from there', async () => {
          await clearSelection(page)
          await drag(page, slider, 0.6, 0.4, 'nothing selected', { dy: 70 })
          expect(await selectedText(page), 'text selected by dragging the slider').toBe('')
          await expect(slider).toBeFocused()
          const before = (await range(slider)).now
          await page.keyboard.press('End')
          await expect.poll(async () => (await range(slider)).now).toBe((await range(slider)).max)
          await page.keyboard.press('Home')
          await expect.poll(async () => (await range(slider)).now).toBe((await range(slider)).min)
          expect(before).not.toBe((await range(slider)).min)
        })
      })
    }
  })
}

// The Now Playing page is text all over (titles, lyrics, the queue), so select all covers its seek bar. The bar is
// drawn left to right in every language. Playing reports progress: the songs' user data is put back by the fixture.
test('the Now Playing seek bar follows the mouse with everything on the page selected', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
  // an album no other test plays
  const album = await api.findItem('MusicAlbum', 'Second Harvest')
  for (const song of await api.items({ parentId: album.Id, includeItemTypes: 'Audio' })) await api.snapshot(song.Id)
  await app.goto(`/item/${album.Id}`)
  await expect(page.locator('[data-focus-key^="album-song:"]').first()).toBeVisible()
  await page.getByRole('button', { name: /^play$/i }).first().click()
  const bar = page.locator('[data-mini-player]')
  await expect(bar).toBeVisible({ timeout: 10_000 })
  // paused: the position then only moves by the seek
  await bar.getByRole('button', { name: /^pause$/i }).click()
  await expect(bar.getByRole('button', { name: /^play$/i })).toBeVisible()
  await bar.locator('a[href="/now-playing"]').click()
  await expect(page).toHaveURL(/\/now-playing/)

  const seek = page.locator('[data-now-playing]').getByRole('slider', { name: 'Seek' })
  // the controls hide after five seconds without input; the mouse brings them back
  const controls = page.locator('[data-now-playing] [data-visible]')
  const show = async () => {
    await page.mouse.move(700, 300)
    await page.mouse.move(712, 312)
    await expect(controls).toHaveCount(1)
    await expect(seek).toBeVisible()
  }
  await show()
  await expect.poll(async () => (await range(seek)).max, 'the track has its length').toBeGreaterThan(5)

  await selectAll(page)
  await show()
  await drag(page, seek, 0.2, 0.7, 'Now Playing seek bar after select all', { dy: 40 })

  await clearSelection(page)
  await show()
  const mid = await pointOn(seek, 0.5)
  await page.mouse.dblclick(mid.x, mid.y)
  expect(await selectedText(page), 'text selected by a double click on the seek bar').toBe('')
  await drag(page, seek, 0.5, 0.25, 'Now Playing seek bar after a double click on it')
  expect(await selectedText(page), 'text selected by dragging the seek bar').toBe('')
  await expect(seek).toBeFocused()
})

// The video player: a few seconds of a film no other test plays, paused at once. A VP9 file, which the suite's
// own Chromium decodes (a browser channel cannot be set for one test of a file). Playing reports progress, which is
// server state: writes project, snapshot, and the Stopped report awaited.
// Unlike the tests above, this one also passed before the fix: nothing in the player can be selected
// (PlayerView's `user-select: none`), so select all left nothing to drag. It holds the two controls to the same
// behaviour should that ever change.
test('the player seek bar and volume slider follow the mouse with everything selected', { tag: [TAG.writes] }, async ({ page, app, api }) => {
  const item = await api.findMovie('VP9 Vorbis')
  await api.snapshot(item.Id)
  await app.goto('/')
  await page.goto(`/play/${item.Id}`)
  await page.waitForFunction(() => {
    const v = document.querySelector('video')
    return !!v && v.readyState >= 2 && !v.seeking && v.currentTime > 0.3
  }, null, { timeout: 30_000 })
  const video = page.locator('video')
  const paused = () => video.evaluate((v: HTMLVideoElement) => v.paused)
  await expect(async () => {
    if (!(await paused())) await page.keyboard.press('k')
    await expect.poll(paused, { timeout: 2_000 }).toBe(true)
  }).toPass({ timeout: 15_000 })

  const strip = page.locator('[data-player-strip]')
  const show = async () => {
    const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }))
    await page.mouse.move(w * 0.3, h * 0.45)
    await page.mouse.move(w * 0.3 + 12, h * 0.45 + 12)
    await expect(strip).toBeVisible()
  }
  const seek = page.locator('[data-seekbar]')
  const duration = await video.evaluate((v: HTMLVideoElement) => v.duration)

  await show()
  await page.keyboard.press('ControlOrMeta+a')
  await show()
  await drag(page, seek, 0.2, 0.7, 'video seek bar after select all', { dy: -60 })
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), 'the video went where the bar was released').toBeGreaterThan(duration * 0.6)
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeLessThan(duration * 0.8)

  // the volume slider opens while the pointer is on the volume button
  await show()
  await page.locator('[data-player-button="volume"]').hover()
  const volume = strip.getByRole('slider', { name: 'Volume' })
  await expect(volume).toBeVisible()
  await expect.poll(async () => (await volume.boundingBox())?.width ?? 0, 'the volume slider is open').toBeGreaterThan(80)
  // a short slider (112dp) in steps of 5: a step and its side padding are a larger share of it
  const SHORT = { slack: 0.09 }
  const applied = () => video.evaluate((v: HTMLVideoElement) => Math.round(v.volume * 100))
  await page.keyboard.press('ControlOrMeta+a')
  await drag(page, volume, 0.9, 0.3, 'volume slider after select all', SHORT)
  await expect.poll(applied, 'the video has the volume the slider shows').toBe((await range(volume)).now)
  const mid = await pointOn(volume, 0.5)
  await page.mouse.dblclick(mid.x, mid.y)
  await drag(page, volume, await thumbAt(volume), 0.8, 'volume slider after a double click on it', SHORT)
  await expect.poll(applied, 'the video has the volume the slider shows').toBe((await range(volume)).now)

  const stopped = page.waitForRequest((r) => /\/Sessions\/Playing\/Stopped/.test(r.url()), { timeout: 20_000 })
  for (let i = 0; i < 8 && new URL(page.url()).pathname.startsWith('/play'); i++) await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/\/play\//)
  await (await stopped).response()
})
