// Subtitles after a skip with the arrow keys (owner reports: "the subtitles are flying into existence from the left",
// and "I would like to be able to see the subtitles 0.05 seconds after the skip"). At the key press the line on screen
// goes away at once; it comes back as soon as the video has landed at the new position and the renderer has drawn
// for it (not after the skip indicator). Text, ASS and PGS lines stay mounted and are only hidden, and a returning
// text line is simply there, in its place from the first frame.
// Judged frame by frame with animations and transitions running: the suite's fixture switches them off, which is
// how the fly-in went unseen. The cues are put into the player's store through the development hook, so most tests
// need no special media. Playing reports progress (server state): writes project, the fixture restores the item.
import type { Page } from '@playwright/test'
import type { JellyfinApi } from '../fixtures/api'
import { TAG, expect, test } from '../fixtures'

// Chromium builds without proprietary codecs cannot decode H.264; headless Edge can (still headless and muted).
test.use({ channel: 'msedge', reducedMotion: 'no-preference' })

type Hook = { __playback: { store: { setState(p: unknown): void } } }
type Frame = { t: number; left: number; width: number; text: string; visible: boolean }

const norm = (id: string) => id.replace(/-/g, '').toLowerCase()

/** The track choice the player remembers for an item (stores/playbackChoices.ts), written before the app starts. */
async function rememberTracks(page: Page, api: JellyfinApi, itemId: string, tracks: { audio?: number; subtitle?: number }) {
  const server = await api.get<{ Id: string }>('/System/Info/Public')
  const key = `wholphin.playbackChoices.v1.${norm(server.Id)}:${norm(api.userId)}`
  const row = { itemId: norm(itemId), sourceId: norm(itemId), audioIndex: tracks.audio ?? -1, subtitleIndex: tracks.subtitle ?? -1, updated: Date.now() }
  await page.addInitScript(
    ({ key, row }) => {
      try {
        const doc = (JSON.parse(localStorage.getItem(key) ?? 'null') as { items?: Record<string, unknown> } | null) ?? { items: {}, stc: {}, delays: {} }
        doc.items = { ...doc.items, [row.itemId]: row }
        localStorage.setItem(key, JSON.stringify(doc))
      } catch {
        // about:blank has no storage
      }
    },
    { key, row },
  )
}

/** Skips of 10 s, so a skip from inside one cue lands inside another. */
async function skipTenSeconds(page: Page) {
  await page.addInitScript(() => {
    try {
      const k = 'wholphin.prefs.app.v1'
      localStorage.setItem(k, JSON.stringify({ ...(JSON.parse(localStorage.getItem(k) ?? '{}') as object), skipForward: 10000 }))
    } catch {
      // about:blank has no storage
    }
  })
}

interface Sample {
  t: number
  /** the renderer is visible and has something on its canvas / a text line */
  shown: boolean
  /** painted pixels in the upper and the lower half of the picture (ASS and PGS) */
  upper: number
  lower: number
}
interface Recording {
  frames: Sample[]
  seekedAt: number
}

/** Painted pixels of the renderer's canvas right now (no key press), to know that a line is on screen before the skip. */
async function painted(page: Page, kind: 'ass' | 'pgs'): Promise<number> {
  return page.evaluate((kind) => {
    const c = document.querySelector(`[data-subtitle-renderer="${kind}"] canvas`) as HTMLCanvasElement | null
    if (!c || !c.width || !c.height) return 0
    const scratch = document.createElement('canvas')
    scratch.width = 320
    scratch.height = 180
    const g = scratch.getContext('2d', { willReadFrequently: true })!
    g.drawImage(c, 0, 0, 320, 180)
    const d = g.getImageData(0, 0, 320, 180).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i] >= 64) n++
    return n
  }, kind)
}

/**
 * Every animation frame from the key press on: what the renderer shows. Times are milliseconds from the key press;
 * `seekedAt` is when the video element reported its last seek as landed.
 */
async function recordSkip(page: Page, kind: 'ass' | 'pgs', key: string, windowMs = 1500): Promise<Recording> {
  const recording = page.evaluate(
    ({ kind, windowMs }) =>
      new Promise<Recording>((resolve) => {
        const v = document.querySelector('video') as HTMLVideoElement
        let keyAt = -1
        let seekedAt = -1
        // a tap on an arrow key skips when the key is released (ui/holdSeek.ts)
        window.addEventListener('keyup', () => (keyAt = performance.now()), { capture: true, once: true })
        v.addEventListener('seeked', () => {
          if (keyAt >= 0) seekedAt = performance.now() - keyAt
        })
        const scratch = document.createElement('canvas')
        scratch.width = 320
        scratch.height = 180
        const g = scratch.getContext('2d', { willReadFrequently: true })!
        const frames: Sample[] = []
        const tick = () => {
          const now = performance.now()
          if (keyAt >= 0) {
            let upper = 0
            let lower = 0
            let shown = false
            const el = document.querySelector(`[data-subtitle-renderer="${kind}"]`)
            const c = el?.querySelector('canvas')
            if (el && c && c.width && c.height) {
              g.clearRect(0, 0, 320, 180)
              g.drawImage(c, 0, 0, 320, 180)
              const d = g.getImageData(0, 0, 320, 180).data
              for (let i = 3; i < d.length; i += 4) {
                if (d[i] < 64) continue
                if (i / 4 < 320 * 90) upper++
                else lower++
              }
              shown = getComputedStyle(el).visibility === 'visible' && upper + lower > 5
            }
            frames.push({ t: now - keyAt, shown, upper, lower })
            if (now - keyAt > windowMs) return resolve({ frames, seekedAt })
          }
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    { kind, windowMs },
  )
  await page.keyboard.press(key)
  return recording
}

/** Nothing shows before the video has landed, and the new line shows soon after. Returns ms from the key press to the first shown frame. */
function judge(rec: Recording, label: string, boundMs: number) {
  expect(rec.seekedAt, `${label}: the video landed`).toBeGreaterThan(0)
  const early = rec.frames.filter((f) => f.shown && f.t < rec.seekedAt)
  expect(early.map((f) => Math.round(f.t)), `${label}: frames that showed a line before the video had landed (seeked at ${Math.round(rec.seekedAt)} ms)`).toEqual([])
  const first = rec.frames.find((f) => f.shown)
  expect(first, `${label}: the line comes back`).toBeTruthy()
  expect(first!.t, `${label}: the line is back within ${boundMs} ms of the key press`).toBeLessThan(boundMs)
  const text = `seeked ${Math.round(rec.seekedAt)} ms, visible ${Math.round(first!.t)} ms after the key press`
  test.info().annotations.push({ type: label, description: text })
  console.log(`${label}: ${text}`)
  return first!.t
}

/** Leaves the player and waits for the stop report, so the server ends the playback session. */
async function leave(page: Page) {
  const stopped = page.waitForRequest((r) => /\/Sessions\/Playing\/Stopped/.test(r.url()), { timeout: 20_000 })
  for (let i = 0; i < 8 && new URL(page.url()).pathname.startsWith('/play'); i++) await page.keyboard.press('Escape')
  await (await stopped).response()
}

test('after an arrow-key skip with the controls hidden the subtitle line is back at once and in its place from its first frame (it does not fly in), and the ASS renderer is kept', { tag: [TAG.writes] }, async ({ page, app, api }) => {
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
  await area.evaluate((el) => el.setAttribute('data-first', ''))

  for (const key of ['ArrowRight', 'ArrowLeft']) {
    // every frame from the key press until well after the skip indicator has gone
    const frames = page.evaluate(
      () =>
        new Promise<Frame[]>((resolve) => {
          const out: Frame[] = []
          const end = performance.now() + 4000
          let keyAt = -1
          // a tap on an arrow key skips when the key is released (ui/holdSeek.ts)
        window.addEventListener('keyup', () => (keyAt = performance.now()), { capture: true, once: true })
          // the mutation records catch a hidden state shorter than a frame
          const el0 = document.querySelector('[data-subtitle-area]')?.parentElement
          let sawHidden = false
          if (el0) new MutationObserver(() => (sawHidden ||= getComputedStyle(el0).visibility === 'hidden')).observe(el0, { attributes: true, attributeFilter: ['style'] })
          const tick = () => {
            if (keyAt < 0) return void requestAnimationFrame(tick)
            const el = document.querySelector('[data-subtitle-area]')
            const t = performance.now() - keyAt
            if (el) {
              const r = el.getBoundingClientRect()
              out.push({ t, left: Math.round(r.left), width: Math.round(r.width), text: el.textContent ?? '', visible: getComputedStyle(el).visibility === 'visible' })
            } else out.push({ t, left: -1, width: -1, text: '', visible: false })
            if (performance.now() < end) requestAnimationFrame(tick)
            else {
              if (sawHidden) out.push({ t: -2, left: 0, width: 0, text: '', visible: false })
              resolve(out)
            }
          }
          requestAnimationFrame(tick)
        }),
    )
    await page.keyboard.press(key)
    const all = await frames
    const seen = all.filter((f) => f.t >= 0)
    // the line is the same element all the time: it is taken away for the seek and is back long before the skip indicator ends
    expect(all.some((f) => f.t === -2) || seen.some((f) => !f.visible), `${key}: the line is hidden while the seek is in flight`).toBe(true)
    expect(seen.at(-1)!.text, `${key}: the line is back`).toContain('A line that must simply be there')
    const back = seen.find((f) => f.visible && f.t > 0)
    expect(back?.t ?? Infinity, `${key}: the line is back well before the skip indicator ends (800 ms)`).toBeLessThan(300)
    const shown = seen.filter((f) => f.visible)
    const moving = shown.filter((f) => Math.abs(f.left - rest.left) > 1 || Math.abs(f.width - rest.width) > 1)
    expect(moving.slice(0, 6), `${key}: frames in which the line was not in its place (of ${shown.length} with the line)`).toEqual([])
    // the same element: the text layer is not rebuilt after the skip
    await expect(page.locator('[data-subtitle-area][data-first]')).toHaveCount(1)
  }

  // ASS subtitles: the renderer (a worker with libass and the fonts) is kept over the skip and only hidden for it
  const script = ['[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1280', 'PlayResY: 720', '', '[V4+ Styles]', 'Format: Name, Fontname, Fontsize, PrimaryColour, Alignment', 'Style: Default,Arial,48,&H00FFFFFF,2', '', '[Events]', 'Format: Layer, Start, End, Style, Text', 'Dialogue: 0,0:00:00.00,0:59:00.00,Default,A styled line', ''].join('\n')
  await page.evaluate((content) => (window as unknown as Hook).__playback.store.setState({ subtitle: { kind: 'ass', streamIndex: 3, content, fonts: [] }, subtitleIndex: 3 }), script)
  const ass = page.locator('[data-subtitle-renderer="ass"]')
  await expect(ass.locator('canvas')).toHaveCount(1)
  await ass.locator('canvas').evaluate((el) => el.setAttribute('data-first', ''))
  // every value the renderer's visibility takes, also for a few milliseconds (the seek is short)
  await ass.evaluate((el) => {
    const w = window as unknown as { __vis: string[] }
    w.__vis = [getComputedStyle(el).visibility]
    new MutationObserver(() => w.__vis.push(getComputedStyle(el).visibility)).observe(el, { attributes: true, attributeFilter: ['style'] })
  })
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(1500)
  const states = new Set(await page.evaluate(() => (window as unknown as { __vis: string[] }).__vis))
  expect([...states].sort(), 'hidden for the seek, never removed').toEqual(['hidden', 'visible'])
  await expect(ass).toBeVisible()
  // the same canvas: no new renderer was started
  await expect(ass.locator('canvas[data-first]')).toHaveCount(1)
  await expect(ass.locator('canvas')).toHaveCount(1)

  await leave(page)
})

test('ASS subtitles over a directly played file: the line of the new position is back about 50 ms after the skip, never before the video has landed, and the old line is gone at once', { tag: [TAG.writes] }, async ({ page, app, api }) => {
  test.setTimeout(120_000)
  // 30 s MKV; the first audio track plays directly
  const item = await api.findMovie('Dual Audio Second Default')
  await api.snapshot(item.Id)
  await rememberTracks(page, api, item.Id, { audio: 1 })
  await skipTenSeconds(page)
  await app.goto('/')
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(`/play/${item.Id}`)
  await page.waitForFunction(() => {
    const v = document.querySelector('video')
    return !!v && v.readyState >= 2 && !v.paused && v.currentTime > 2
  }, undefined, { timeout: 30_000 })
  await page.evaluate(() => document.querySelectorAll('style[data-e2e="no-animation"]').forEach((el) => el.remove()))
  // a line at the bottom before the skip (0-10 s), another at the top after it (10-29 s): the picture says which one it is
  const script = ['[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1280', 'PlayResY: 720', '', '[V4+ Styles]', 'Format: Name, Fontname, Fontsize, PrimaryColour, Alignment', 'Style: Low,Arial,64,&H00FFFFFF,2', 'Style: High,Arial,64,&H00FFFFFF,8', '', '[Events]', 'Format: Layer, Start, End, Style, Text', 'Dialogue: 0,0:00:00.00,0:00:10.00,Low,OLD LINE AT THE BOTTOM', 'Dialogue: 0,0:00:10.00,0:00:29.00,High,NEW LINE AT THE TOP', ''].join('\n')
  await page.evaluate((content) => (window as unknown as Hook).__playback.store.setState({ subtitle: { kind: 'ass', streamIndex: 9, content, fonts: [] }, subtitleIndex: 9 }), script)
  if (await page.locator('[data-player-strip]').isVisible()) await page.keyboard.press('Escape')
  await expect(page.locator('[data-player-strip]')).toBeHidden()
  // the old line is on screen, then skip
  await expect.poll(() => painted(page, 'ass'), { timeout: 10_000 }).toBeGreaterThan(5)
  const rec = await recordSkip(page, 'ass', 'ArrowRight')
  judge(rec, 'ASS direct', 300)
  expect(rec.frames.filter((f) => f.shown && f.lower > 5).map((f) => Math.round(f.t)), 'frames that showed the old line at the bottom').toEqual([])
  expect(rec.frames.find((f) => f.shown)!.upper, 'the new line at the top').toBeGreaterThan(5)
  await leave(page)
})

test('PGS subtitles over a directly played file: the picture of the new position is back about 50 ms after the skip, never before the video has landed', { tag: [TAG.writes] }, async ({ page, app, api }) => {
  test.setTimeout(120_000)
  // 24 s MKV, English PGS (stream 2) with cues at 2-6, 8-12, 14-18 and 20-24 s: a skip of 10 s from inside the first lands inside the third
  const item = await api.findMovie('PGS Image Subtitles')
  await api.snapshot(item.Id)
  await rememberTracks(page, api, item.Id, { subtitle: 2 })
  await skipTenSeconds(page)
  await app.goto('/')
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(`/play/${item.Id}`)
  // inside the first cue (2-6 s), with its picture on screen
  await page.waitForFunction(() => {
    const v = document.querySelector('video')
    return !!v && v.readyState >= 2 && !v.paused && v.currentTime > 4.2
  }, undefined, { timeout: 30_000 })
  await page.evaluate(() => document.querySelectorAll('style[data-e2e="no-animation"]').forEach((el) => el.remove()))
  if (await page.locator('[data-player-strip]').isVisible()) await page.keyboard.press('Escape')
  await expect(page.locator('[data-player-strip]')).toBeHidden()
  await expect.poll(() => painted(page, 'pgs'), { timeout: 10_000 }).toBeGreaterThan(5)
  const rec = await recordSkip(page, 'pgs', 'ArrowRight')
  judge(rec, 'PGS direct', 300)
  await leave(page)
})
