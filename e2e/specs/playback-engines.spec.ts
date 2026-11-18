// The video player in the other engines (projects firefox and webkit): a few seconds of a 15 s H.264 + AAC clip of
// the throwaway server, pause, leave. First it records what the engine itself says about H.264 (annotation
// `h264-support`): an engine that cannot decode it headless is reported, not forced. Playing reports progress, so
// each engine plays its own clip (their reports never cross) and the fixture restores the clip's user data.
// Also here, in Chromium too: the paused player's sheets in Hebrew (values such as ".25" read left to right).
import { uiText } from '../../tools/shots/uiText.ts'
import { TAG, expect, test } from '../fixtures'

const CLIP: Record<string, string> = { firefox: 'Clips', webkit: 'FOTE: More Clips', chromium: 'Clips' }

test('a short H.264 clip plays, pauses and Back leaves the player', { tag: [TAG.engines] }, async ({ page, app, api, browserName }, info) => {
  const item = await api.findMovie(CLIP[browserName])
  await api.snapshot(item.Id)

  await app.goto('/')
  const support = await page.evaluate(() => {
    const type = 'video/mp4; codecs="avc1.640028, mp4a.40.2"'
    const MS = (globalThis as { MediaSource?: typeof MediaSource; ManagedMediaSource?: typeof MediaSource }).MediaSource ?? (globalThis as { ManagedMediaSource?: typeof MediaSource }).ManagedMediaSource
    return { canPlayType: document.createElement('video').canPlayType(type), mediaSource: MS ? MS.isTypeSupported(type) : null }
  })
  info.annotations.push({ type: 'h264-support', description: `${browserName}: canPlayType="${support.canPlayType}", MediaSource=${support.mediaSource ?? 'absent'}` })
  test.skip(support.canPlayType === '' && !support.mediaSource, `${browserName} reports it cannot decode H.264 headless`)

  const stopped = page.waitForRequest((r) => /\/Sessions\/Playing\/Stopped/.test(r.url()), { timeout: 30_000 })
  await page.goto(`/play/${item.Id}`)
  // decoding and advancing
  await page.waitForFunction(() => {
    const v = document.querySelector('video')
    return !!v && v.readyState >= 2 && v.currentTime > 2
  }, null, { timeout: 30_000 })
  await page.keyboard.press('k')
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)

  // Back: Escape hides the controls first, then leaves
  await page.keyboard.press('Escape')
  if (new URL(page.url()).pathname.startsWith('/play/')) await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/\/play\//)
  // the session is closed on the server (it stops serving the stream)
  const report = JSON.parse((await stopped).postData() ?? '{}') as { ItemId?: string; Failed?: boolean }
  expect(report.ItemId).toBe(item.Id)
  expect(report.Failed).toBe(false)
})

// Hebrew: the paused player's sheets. Each engine pauses its own item, one that no other test plays.
const SHEET_CLIP: Record<string, string> = { chromium: 'Caminandes: Gran Dillama', firefox: 'Agent 327: Operation Barbershop', webkit: 'Sprite Fright' }

test.describe('Hebrew interface', () => {
  // the app follows the browser's language
  test.use({ locale: 'he-IL' })

  test('values in the player sheets read left to right', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app, api, guard, browserName }) => {
    const item = await api.findMovie(SHEET_CLIP[browserName])
    await api.snapshot(item.Id)
    // Firefox closes the download of a paused direct-play file itself (media cache) and reports the request as failed
    guard.allow(/^request-failed NS_ERROR_PARSED_DATA_CACHED GET \S+\/Videos\/[0-9a-f]{32}\/stream$/, 'Firefox suspends the media download of a paused video')

    await app.goto('/')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    const decodes = await page.evaluate(() => {
      const type = 'video/mp4; codecs="avc1.640028, mp4a.40.2"'
      const MS = (globalThis as { MediaSource?: typeof MediaSource; ManagedMediaSource?: typeof MediaSource }).MediaSource ?? (globalThis as { ManagedMediaSource?: typeof MediaSource }).ManagedMediaSource
      return document.createElement('video').canPlayType(type) !== '' || !!MS?.isTypeSupported(type)
    })
    test.skip(browserName === 'webkit' && !decodes, 'webkit reports it cannot decode H.264 headless: the player shows no controls to open a sheet from')

    const stopped = page.waitForRequest((r) => /\/Sessions\/Playing\/Stopped/.test(r.url()), { timeout: 30_000 })
    await page.goto(`/play/${item.Id}`)
    await page.waitForFunction(() => {
      const v = document.querySelector('video')
      return !!v && v.readyState >= 2 && v.currentTime > 0.5
    }, null, { timeout: 30_000 })
    await page.keyboard.press('k')
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)

    // Settings: the bitrate row's value is a number and a Latin unit (the right-to-left line drew "Mbps 100")
    await page.mouse.move(640, 360)
    await page.mouse.move(660, 380)
    await page.getByRole('button', { name: uiText('he', 'settings'), exact: true }).first().click()
    const sheet = page.locator('[data-player-sheet]')
    const bitrate = sheet.getByText(/^\d+ [kM]bps$/)
    await expect(bitrate).toBeVisible()
    expect(await app.drawnText(bitrate)).toBe(((await bitrate.textContent()) ?? '').replace(/\s/g, ''))
    // a translated value keeps the interface's direction: its letters are drawn right to left
    const scale = uiText('he', 'content_scale_fit')
    expect(await app.drawnText(sheet.getByText(scale, { exact: true }))).toBe([...scale.replace(/\s/g, '')].reverse().join(''))

    // Playback speed: ".25" starts with a full stop (drawn "25." before)
    await sheet.getByText(uiText('he', 'playback_speed'), { exact: true }).click()
    const speeds = sheet.getByRole('menuitemradio')
    await expect(speeds).toHaveCount(8)
    expect(await Promise.all([0, 1, 2, 3].map((i) => app.drawnText(speeds.nth(i))))).toEqual(['.25', '.5', '.75', '1.0'])

    // leave: Escape closes the speed list, the Settings sheet, the controls, then the player
    for (let i = 0; i < 6 && new URL(page.url()).pathname.startsWith('/play/'); i++) await app.press('Escape')
    await expect(page).not.toHaveURL(/\/play\//)
    const report = JSON.parse((await stopped).postData() ?? '{}') as { ItemId?: string }
    expect(report.ItemId).toBe(item.Id)
  })
})
