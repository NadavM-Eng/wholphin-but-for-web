// Text subtitles after a skip with the arrow keys (owner report: "the subtitles are flying into existence from the
// left"). With the controls hidden, an arrow-key skip shows the skip indicator and takes the subtitles away for its
// time; when they come back they must simply be there, in their place from the first frame.
// Judged frame by frame with animations and transitions running: the suite's fixture switches them off, which is
// how the fly-in went unseen. The cues are put into the player's store through the development hook, so the test
// needs no special media. Playing reports progress (server state): writes project, the fixture restores the item.
import type { Page } from '@playwright/test'
import { TAG, expect, test } from '../fixtures'

// Chromium builds without proprietary codecs cannot decode H.264; headless Edge can (still headless and muted).
test.use({ channel: 'msedge', reducedMotion: 'no-preference' })

type Hook = { __playback: { store: { setState(p: unknown): void } } }
type Frame = { left: number; width: number; text: string }

/** Leaves the player and waits for the stop report, so the server ends the playback session. */
async function leave(page: Page) {
  const stopped = page.waitForRequest((r) => /\/Sessions\/Playing\/Stopped/.test(r.url()), { timeout: 20_000 })
  for (let i = 0; i < 8 && new URL(page.url()).pathname.startsWith('/play'); i++) await page.keyboard.press('Escape')
  await (await stopped).response()
}

test('after an arrow-key skip with the controls hidden the subtitle line is in its place from its first frame (it does not fly in), and the ASS renderer is kept', { tag: [TAG.writes] }, async ({ page, app, api }) => {
  test.setTimeout(120_000)
  const item = await api.findMovie('Big Buck Bunny')
  await api.snapshot(item.Id)
  await app.goto('/')
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto(`/play/${item.Id}?t=20000`)
  await page.waitForFunction(() => {
    const v = document.querySelector('video')
    return !!v && v.readyState >= 2 && !v.paused && v.currentTime > 20.3
  }, undefined, { timeout: 30_000 })
  // animations and transitions run as they do for a person
  await page.evaluate(() => document.querySelectorAll('style[data-e2e="no-animation"]').forEach((el) => el.remove()))
  // one cue over the whole film
  await page.evaluate(() =>
    (window as unknown as Hook).__playback.store.setState({ subtitle: { kind: 'text', streamIndex: 2, cues: [{ startMs: 0, endMs: 3_600_000, text: 'A line that must simply be there' }] }, subtitleIndex: 2 }),
  )
  const area = page.locator('[data-subtitle-area]')
  await expect(area).toContainText('A line that must simply be there')
  // the controls are hidden (they show for a moment when playback starts)
  if (await page.locator('[data-player-strip]').isVisible()) await page.keyboard.press('Escape')
  await expect(page.locator('[data-player-strip]')).toBeHidden()
  await expect(area).toContainText('A line that must simply be there')
  const box = () =>
    area.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { left: Math.round(r.left), width: Math.round(r.width) }
    })
  // at rest: the area of the picture (the film is 16:9, the window too)
  await expect.poll(async () => (await box()).width).toBeGreaterThan(1500)
  const rest = await box()

  for (const key of ['ArrowRight', 'ArrowLeft']) {
    // every frame from the key press until well after the skip indicator has gone
    const frames = page.evaluate(
      () =>
        new Promise<Frame[]>((resolve) => {
          const out: Frame[] = []
          const end = performance.now() + 4000
          const tick = () => {
            const el = document.querySelector('[data-subtitle-area]')
            if (el) {
              const r = el.getBoundingClientRect()
              out.push({ left: Math.round(r.left), width: Math.round(r.width), text: el.textContent ?? '' })
            } else out.push({ left: -1, width: -1, text: '' })
            if (performance.now() < end) requestAnimationFrame(tick)
            else resolve(out)
          }
          requestAnimationFrame(tick)
        }),
    )
    await page.keyboard.press(key)
    const seen = await frames
    // the subtitles went away for the indicator and came back
    expect(seen.some((f) => f.text === ''), `${key}: the line is hidden while the skip indicator shows`).toBe(true)
    expect(seen.at(-1)!.text, `${key}: the line is back`).toContain('A line that must simply be there')
    const shown = seen.filter((f) => f.text !== '')
    const moving = shown.filter((f) => Math.abs(f.left - rest.left) > 1 || Math.abs(f.width - rest.width) > 1)
    expect(moving.slice(0, 6), `${key}: frames in which the line was not in its place (of ${shown.length} with the line)`).toEqual([])
  }

  // ASS subtitles: the renderer (a worker with libass and the fonts) is kept over the skip and only hidden for it
  const script = ['[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1280', 'PlayResY: 720', '', '[V4+ Styles]', 'Format: Name, Fontname, Fontsize, PrimaryColour, Alignment', 'Style: Default,Arial,48,&H00FFFFFF,2', '', '[Events]', 'Format: Layer, Start, End, Style, Text', 'Dialogue: 0,0:00:00.00,0:59:00.00,Default,A styled line', ''].join('\n')
  await page.evaluate((content) => (window as unknown as Hook).__playback.store.setState({ subtitle: { kind: 'ass', streamIndex: 3, content, fonts: [] }, subtitleIndex: 3 }), script)
  const ass = page.locator('[data-subtitle-renderer="ass"]')
  await expect(ass.locator('canvas')).toHaveCount(1)
  await ass.locator('canvas').evaluate((el) => el.setAttribute('data-first', ''))
  const visibility = page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const out: string[] = []
        const end = performance.now() + 3500
        const tick = () => {
          const el = document.querySelector('[data-subtitle-renderer="ass"]')
          out.push(el ? getComputedStyle(el).visibility : 'gone')
          if (performance.now() < end) requestAnimationFrame(tick)
          else resolve(out)
        }
        requestAnimationFrame(tick)
      }),
  )
  await page.keyboard.press('ArrowRight')
  const states = new Set(await visibility)
  expect([...states].sort(), 'hidden for the skip indicator, never removed').toEqual(['hidden', 'visible'])
  await expect(ass).toBeVisible()
  // the same canvas: no new renderer was started
  await expect(ass.locator('canvas[data-first]')).toHaveCount(1)
  await expect(ass.locator('canvas')).toHaveCount(1)

  await leave(page)
})
