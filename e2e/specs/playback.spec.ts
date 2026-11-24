// The video player against the throwaway server: a few seconds of the Codec Zoo H.264 file in headless Edge (real
// codecs), pause, seek, exit, and the stop position the player reported to the server. Playing reports progress,
// which is server state, so the tests run in the writes project and the fixture restores the item's user data.
import { TAG, expect, test } from '../fixtures'
import type { Item } from '../fixtures/api'

// Chromium builds without proprietary codecs cannot decode H.264; headless Edge can (still headless and muted).
test.use({ channel: 'msedge' })

const video = 'video'

// both tests use the same item: one at a time
test.describe.configure({ mode: 'serial' })

test('play a few seconds, pause, seek, exit; the stop position is reported to the server', { tag: [TAG.writes] }, async ({ page, app, api }) => {
  const item = await api.findMovie('H.264 AAC Baseline')
  // the item keeps a resume point throughout (Home tests running in parallel list it); the fixture restores it
  await api.snapshot(item.Id)

  const started = Date.now()
  await app.goto(`/play/${item.Id}`)
  // decoding and advancing
  await page.waitForFunction((sel) => {
    const v = document.querySelector<HTMLVideoElement>(sel)
    return !!v && v.readyState >= 2 && v.currentTime > 2
  }, video, { timeout: 30_000 })

  // pause (k = play / pause, as the shortcut list says)
  await page.keyboard.press('k')
  await expect.poll(() => page.locator(video).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)

  // seek: 5 = jump to 50 % (the file is 90 s long)
  await page.keyboard.press('5')
  await expect.poll(() => page.locator(video).evaluate((v: HTMLVideoElement) => Math.round(v.currentTime))).toBeGreaterThan(35)
  const at = await page.locator(video).evaluate((v: HTMLVideoElement) => v.currentTime)

  const stopped = page.waitForRequest((r) => /\/Sessions\/Playing\/Stopped/.test(r.url()), { timeout: 15_000 })
  // exit with Back (Escape hides the controls first, then leaves)
  await page.keyboard.press('Escape')
  if (new URL(page.url()).pathname.startsWith('/play/')) await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/\/play\//)

  // the Stopped report carries the position where playback stopped...
  const report = JSON.parse((await stopped).postData() ?? '{}') as { ItemId?: string; PositionTicks?: number; Failed?: boolean }
  expect(report.ItemId).toBe(item.Id)
  expect(report.Failed).toBe(false)
  expect(Math.abs((report.PositionTicks ?? 0) / 10_000_000 - at)).toBeLessThan(3)
  // ...and the server took it: the item's last played date moved. (A 90 s file is shorter than Jellyfin's
  // MinResumeDurationSeconds, 300, so the server marks it played instead of keeping a resume point.)
  await expect.poll(async () => Date.parse((await api.userData(item.Id)).LastPlayedDate ?? '') || 0, { timeout: 15_000 }).toBeGreaterThan(started - 5_000)
})

test('the detail page Play button opens the player at the resume point', { tag: [TAG.writes] }, async ({ page, app, api }) => {
  const item = await api.findMovie('H.264 AAC Baseline')
  await api.snapshot(item.Id)
  await api.setUserData(item.Id, { PlaybackPositionTicks: 30 * 10_000_000, Played: false })
  await app.goto(`/item/${item.Id}`)
  await app.detailButtons.getByRole('button', { name: /^resume/i }).first().click()
  await expect(page).toHaveURL((u) => u.pathname === `/play/${item.Id}` && Number(u.searchParams.get('t')) === 30_000)
  await page.waitForFunction((sel) => {
    const v = document.querySelector<HTMLVideoElement>(sel)
    return !!v && v.readyState >= 2 && v.currentTime >= 29
  }, video, { timeout: 30_000 })
  await page.keyboard.press('k')
  await page.keyboard.press('Escape')
  if (new URL(page.url()).pathname.startsWith('/play/')) await page.keyboard.press('Escape')
  await expect(page).toHaveURL((u) => u.pathname === `/item/${item.Id}`)
})

// Owner request: moving between episodes changes only the picture. The player page, the control strip and the <video>
// stay the same nodes, the strip stays shown and is never faded or covered, the title follows the new episode, the
// last picture is held (no black cover) and Next is greyed out, not removed, on the last entry of the queue. Run with
// motion on: the layout's page fade (700 ms from transparent on every new address) was what looked like a reload.
test.describe('moving between episodes', () => {
  test.use({ reducedMotion: 'no-preference' })

  test('Next button, Next Up panel and queue panel play the next episode in the same player, one PlaybackInfo and one Stopped each', { tag: [TAG.writes] }, async ({ page, app, api }) => {
    test.setTimeout(120_000)
    const series = await api.findSeries('Orbital Drift')
    const episodes = (await api.items({ includeItemTypes: 'Episode', parentId: series.Id, sortBy: 'ParentIndexNumber,IndexNumber' })) as Array<
      Item & { ParentIndexNumber?: number; SeasonName?: string }
    >
    // the season named "Season 1" (the series lists "Specials" first)
    const [e1, e2, e3] = episodes.filter((e) => e.SeasonName === 'Season 1' || (e.SeasonName == null && e.ParentIndexNumber === 1))
    expect(e3, 'Season 1 has three episodes').toBeTruthy()
    // the queue runs to the end of the series; every episode the test may play is restored afterwards
    for (const e of episodes) await api.snapshot(e.Id)
    const norm = (id: string | null | undefined) => (id ?? '').replace(/-/g, '').toLowerCase()

    type Store = { item: { Id?: string } | null; queue: Array<{ item: { Id?: string; Name?: string } }>; durationMs: number; nextUp: { item: { Id?: string } } | null }
    const store = () =>
      page.evaluate(() => {
        const s = (window as unknown as { __playback: { store: { getState(): Store } } }).__playback.store.getState()
        return { item: s.item?.Id ?? null, durationMs: s.durationMs, nextUp: s.nextUp?.item.Id ?? null, queue: s.queue.map((e) => ({ id: e.item.Id ?? '', name: e.item.Name ?? '' })) }
      })
    // a move that reloads more than the next item shows up here: PlaybackInfo (one per started stream), the episode
    // list and intros (only a whole restart builds the queue again), Stopped reports (one per item left)
    const log: string[] = []
    page.on('request', (r) => {
      const p = new URL(r.url()).pathname
      if (r.method() === 'POST' && /\/Items\/[^/]+\/PlaybackInfo$/i.test(p)) log.push(`info ${norm(p.split('/')[2])}`)
      else if (/\/Sessions\/Playing\/Stopped$/i.test(p)) log.push(`stopped ${norm((JSON.parse(r.postData() ?? '{}') as { ItemId?: string }).ItemId)}`)
      else if (/\/Shows\/[^/]+\/Episodes$/i.test(p)) log.push('episodes')
      else if (/\/Intros$/i.test(p)) log.push('intros')
    })
    const decoding = () =>
      page.waitForFunction(() => {
        const v = document.querySelector('video')
        return !!v && v.readyState >= 2 && !v.seeking && v.currentTime > 0.3
      }, null, { timeout: 30_000 })

    /** Marks the player root, the strip and the video, then checks them on every frame until the returned function runs. */
    const watch = async () => {
      await page.evaluate(() => {
        const sels = ['[data-player-root]', '[data-player-strip]', 'video']
        const w = window as unknown as { __move: { frames: number; bad: string[]; on: boolean } }
        for (const n of sels.map((sel) => document.querySelector<HTMLElement>(sel))) if (n) n.dataset.e2eMark = '1'
        w.__move = { frames: 0, bad: [], on: true }
        const tick = () => {
          const m = w.__move
          if (!m.on) return
          m.frames++
          const [root, strip, video] = sels.map((sel) => document.querySelector<HTMLElement>(sel))
          const fail = (why: string) => {
            if (m.bad.length < 5) m.bad.push(`frame ${m.frames}: ${why}`)
          }
          if (root?.dataset.e2eMark !== '1') fail('player root replaced')
          if (video?.dataset.e2eMark !== '1') fail('video replaced')
          if (strip?.dataset.e2eMark !== '1') fail(strip ? 'strip replaced' : 'strip gone')
          else if (strip.getBoundingClientRect().height < 10) fail('strip collapsed')
          else {
            let opacity = 1
            for (let e: HTMLElement | null = strip; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity)
            if (opacity < 0.98) fail(`strip faded to ${opacity.toFixed(2)}`)
          }
          if (document.querySelector('[data-player-cover]')) fail('black cover over the picture')
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      return async () => {
        const m = await page.evaluate(() => {
          const w = window as unknown as { __move: { frames: number; bad: string[]; on: boolean } }
          w.__move.on = false
          return w.__move
        })
        expect(m.bad, 'what left or covered the player during the move').toEqual([])
        expect(m.frames).toBeGreaterThan(5)
      }
    }
    const arrived = async (ep: { Id: string; Name?: string | null }) => {
      await expect(page).toHaveURL((u) => norm(u.pathname.split('/')[2]) === norm(ep.Id), { timeout: 20_000 })
      await expect.poll(async () => norm((await store()).item), { timeout: 20_000 }).toBe(norm(ep.Id))
      await decoding()
      // from its start, not from where the previous one was
      expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeLessThan(5)
      await expect(page.locator('[data-player-titles]')).toContainText(ep.Name ?? '')
    }
    const showControls = async () => {
      const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }))
      await page.mouse.move(w * 0.3, h * 0.3)
      await page.mouse.move(w * 0.3 + 12, h * 0.3 + 12)
      await expect(page.locator('[data-player-strip]')).toBeVisible()
      // the strip's own fade-in is over before the checks start
      await page.waitForTimeout(400)
    }

    await app.goto('/')
    await page.goto(`/play/${e1.Id}`)
    // motion on: the suite's stylesheet that switches animations off is taken out
    await page.evaluate(() => document.querySelectorAll('style[data-e2e="no-animation"]').forEach((el) => el.remove()))
    await decoding()
    await expect.poll(async () => (await store()).durationMs).toBeGreaterThan(10_000)
    const historyLength = await page.evaluate(() => history.length)

    // ---- 1 -> 2 through the Next button of the controls; the pointer stays on the strip, which holds it up
    await showControls()
    await expect(page.locator('[data-player-button="previous"]'), 'nothing before the first entry').toHaveAttribute('aria-disabled', 'true')
    let done = await watch()
    log.length = 0
    await page.locator('[data-player-button="next"]').click()
    await arrived(e2)
    await done()
    expect(log, 'requests of the Next button move').toEqual([`stopped ${norm(e1.Id)}`, `info ${norm(e2.Id)}`])
    await expect(page.locator('[data-player-button="previous"]')).not.toHaveAttribute('aria-disabled', 'true')

    // ---- 2 -> 3 through the Next Up panel at the end of the episode, with the controls shown
    const { durationMs } = await store()
    await page.evaluate((ms) => (window as unknown as { __playback: { engine: { seekTo(ms: number): void } } }).__playback.engine.seekTo(ms), durationMs - 3_000)
    const nextUp = page.locator('[data-next-up]')
    await expect(nextUp).toBeVisible({ timeout: 20_000 })
    expect(norm((await store()).nextUp), 'the panel offers the following episode, not the one playing').toBe(norm(e3.Id))
    await showControls()
    done = await watch()
    log.length = 0
    await nextUp.locator('[data-card-surface]').click()
    await arrived(e3)
    await done()
    expect(log, 'requests of the Next Up move').toEqual([`stopped ${norm(e2.Id)}`, `info ${norm(e3.Id)}`])

    // ---- 3 -> the last entry of the queue through the queue panel; the controls stay up after the pick
    const { queue } = await store()
    const last = queue[queue.length - 1]
    expect(queue.length, 'the queue runs past Season 1').toBeGreaterThan(3)
    await showControls()
    await page.locator('[data-player-button="queue"]').click()
    const lastRow = page.locator(`[data-queue="${queue.length - 1}"] [role="menuitemradio"]`)
    await lastRow.scrollIntoViewIfNeeded()
    done = await watch()
    log.length = 0
    await lastRow.click()
    await arrived({ Id: last.id, Name: last.name })
    await done()
    expect(log, 'requests of the queue move').toEqual([`stopped ${norm(e3.Id)}`, `info ${norm(last.id)}`])
    // the last entry: Next is still there, greyed out and inert; Previous goes back
    const next = page.locator('[data-player-button="next"]')
    await expect(next).toBeVisible()
    await expect(next).toHaveAttribute('aria-disabled', 'true')
    await expect(page.locator('[data-player-button="previous"]')).not.toHaveAttribute('aria-disabled', 'true')
    log.length = 0
    await next.click({ force: true })
    await page.waitForTimeout(500)
    expect(log, 'a greyed-out Next does nothing').toEqual([])
    // the address followed each move without adding history entries
    expect(await page.evaluate(() => history.length)).toBe(historyLength)

    const stopped = page.waitForRequest((r) => /\/Sessions\/Playing\/Stopped/.test(r.url()), { timeout: 20_000 })
    for (let i = 0; i < 8 && new URL(page.url()).pathname.startsWith('/play'); i++) await page.keyboard.press('Escape')
    await expect(page).not.toHaveURL(/\/play\//)
    await (await stopped).response()
  })
})
