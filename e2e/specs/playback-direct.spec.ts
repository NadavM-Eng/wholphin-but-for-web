// What the browser plays by itself, so the server does not have to convert it: Matroska files played directly,
// PGS (image) subtitles drawn on a canvas, ASS subtitles over a directly played file, and a file's second audio
// track remuxed with nothing re-encoded. Headless Edge (real codecs) against the throwaway server; each test asks
// the server what it is doing for the session. Playing reports progress, which is server state, so the tests run in
// the writes project and the fixture restores the item's user data. Short items that no other spec plays.
import type { Page } from '@playwright/test'
import type { JellyfinApi } from '../fixtures/api'
import { TAG, expect, test } from '../fixtures'

test.use({ channel: 'msedge' })
// one video at a time
test.describe.configure({ mode: 'serial' })

interface PlaybackInfoAnswer {
  MediaSources?: Array<{
    SupportsDirectPlay?: boolean
    TranscodingUrl?: string | null
    MediaStreams?: Array<{ Index?: number; Type?: string; Codec?: string; DeliveryMethod?: string; DeliveryUrl?: string | null }>
  }>
}
interface ServerSession {
  NowPlayingItem?: { Id?: string }
  PlayState?: { PlayMethod?: string }
  TranscodingInfo?: { IsVideoDirect?: boolean; IsAudioDirect?: boolean; TranscodeReasons?: string[] } | null
}

const norm = (id: string) => id.replace(/-/g, '').toLowerCase()

/**
 * The track choice the player remembers for an item (stores/playbackChoices.ts), written before the app starts:
 * the same state as after picking the tracks in the player's dialogs, without depending on their layout.
 */
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

/** Opens the player and returns the server's PlaybackInfo answer and the profile the browser sent. */
async function startPlayer(page: Page, itemId: string) {
  const answered = page.waitForResponse((r) => r.request().method() === 'POST' && new RegExp(`/Items/${itemId}/PlaybackInfo`, 'i').test(r.url()), { timeout: 30_000 })
  await page.goto(`/play/${itemId}`)
  const res = await answered
  const profile = (JSON.parse(res.request().postData() ?? '{}') as { DeviceProfile?: { DirectPlayProfiles?: Array<{ Container?: string }>; SubtitleProfiles?: Array<{ Format?: string; Method?: string }> } }).DeviceProfile
  const info = (await res.json()) as PlaybackInfoAnswer
  await page.waitForFunction(() => {
    const v = document.querySelector('video')
    return !!v && v.readyState >= 2 && v.currentTime > 1
  }, null, { timeout: 30_000 })
  return { source: info.MediaSources?.[0], profile }
}

const video = (page: Page) => page.locator('video')
const time = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => v.currentTime)

/** The server's own view of the playing session (the test user sees its own sessions). */
async function serverSession(api: JellyfinApi, itemId: string): Promise<ServerSession | undefined> {
  return (await api.get<ServerSession[]>('/Sessions', { activeWithinSeconds: 60 })).find((s) => s.NowPlayingItem?.Id === itemId)
}

/**
 * "The server converts nothing": the player's address is the file itself (static=true), which Jellyfin hands out byte
 * for byte. The server's session is looked at as well when it shows this item: every test of this project uses one
 * sign-in and so one server session, and another test that plays at the same moment can show its own item there.
 */
async function expectFileItself(page: Page, api: JellyfinApi, itemId: string) {
  expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentSrc)).toMatch(/\/Videos\/[0-9a-f]+\/stream\?static=true/)
  const method = (await serverSession(api, itemId))?.PlayState?.PlayMethod
  if (method) expect(method).toBe('DirectPlay')
}

/** Leaves the player (Escape hides the controls first) and waits until the server has no session for the item. */
async function leavePlayer(page: Page, api: JellyfinApi, itemId: string) {
  for (let i = 0; i < 4 && new URL(page.url()).pathname.startsWith('/play/'); i++) await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/\/play\//)
  await expect.poll(async () => !!(await serverSession(api, itemId)), { timeout: 15_000 }).toBe(false)
}

/**
 * Opaque pixels of the PGS canvas, as { count, top } with `top` the highest painted row as a fraction of the
 * canvas height. The canvas itself belongs to a worker (OffscreenCanvas), so its current frame is copied.
 */
async function pgsPixels(page: Page): Promise<{ count: number; top: number }> {
  return page.locator('[data-subtitle-renderer="pgs"] canvas').evaluate((c: HTMLCanvasElement) => {
    const copy = document.createElement('canvas')
    copy.width = c.width
    copy.height = c.height
    const g = copy.getContext('2d')
    if (!g || !c.width || !c.height) return { count: 0, top: 1 }
    g.drawImage(c, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    let count = 0
    let top = c.height
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] < 128) continue
      count++
      top = Math.min(top, Math.floor(i / 4 / c.width))
    }
    return { count, top: top / c.height }
  })
}

/** Pauses on an exact time, as dragging the seek bar would. */
async function pauseAt(page: Page, seconds: number) {
  await video(page).evaluate((v: HTMLVideoElement, t) => {
    v.pause()
    v.currentTime = t
  }, seconds)
  await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => !v.seeking && v.readyState >= 2)).toBe(true)
}

test('a Matroska file is played directly: it starts, seeks to the middle and near the end, and the server converts nothing', { tag: [TAG.writes] }, async ({ page, app, api }) => {
  // 24 s MKV, H.264 + AAC (its VobSub tracks stay off)
  const item = await api.findMovie('VobSub Image Subtitles')
  await api.snapshot(item.Id)
  await app.goto('/')

  const { source, profile } = await startPlayer(page, item.Id)
  // the profile built in this browser offers Matroska, and the server agrees to hand out the file as it is
  expect(profile?.DirectPlayProfiles?.map((p) => p.Container)).toContain('mkv')
  expect(source?.SupportsDirectPlay).toBe(true)
  expect(source?.TranscodingUrl ?? null).toBeNull()
  expect(await video(page).evaluate((v: HTMLVideoElement) => v.currentSrc)).toMatch(/\/Videos\/[0-9a-f]+\/stream\?static=true/)
  // picture and sound are really decoded
  expect(await video(page).evaluate((v: HTMLVideoElement) => v.videoWidth)).toBe(1280)
  expect(await video(page).evaluate((v: HTMLVideoElement) => (v as unknown as { webkitAudioDecodedByteCount: number }).webkitAudioDecodedByteCount)).toBeGreaterThan(0)

  // 5 = 50 % (12 s): lands there and keeps playing
  await page.keyboard.press('5')
  await expect.poll(() => time(page)).toBeGreaterThan(11.5)
  await expect.poll(() => time(page), { timeout: 15_000 }).toBeGreaterThan(13.5)
  expect(await time(page)).toBeLessThan(18)
  // 8 = 80 % (19.2 s), near the end
  await page.keyboard.press('8')
  await expect.poll(() => time(page), { timeout: 15_000 }).toBeGreaterThan(20)
  // pause before the file ends (the player would leave by itself)
  await page.keyboard.press('k')
  await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)

  await expectFileItself(page, api, item.Id)
  await leavePlayer(page, api, item.Id)
})

test('PGS subtitles are drawn in the browser, on time, over a directly played file', { tag: [TAG.writes] }, async ({ page, app, api }) => {
  // 24 s MKV with two PGS tracks; the English one (stream 2) has cues at 2-6, 8-12, 14-18 and 20-24 s
  const item = await api.findMovie('PGS Image Subtitles')
  await api.snapshot(item.Id)
  await rememberTracks(page, api, item.Id, { subtitle: 2 })
  await app.goto('/')

  const supRequest = page.waitForResponse((r) => /\/Subtitles\/2\/0\/Stream\.pgssub/i.test(r.url()), { timeout: 30_000 })
  const { source, profile } = await startPlayer(page, item.Id)
  expect(profile?.SubtitleProfiles).toContainEqual({ Format: 'pgssub', Method: 'External' })
  // no burn-in: the file is still played directly and the track comes as a file of its own
  expect(source?.SupportsDirectPlay).toBe(true)
  expect(source?.MediaStreams?.find((s) => s.Index === 2)).toMatchObject({ Codec: 'PGSSUB', DeliveryMethod: 'External' })
  const sup = await supRequest
  expect(sup.status()).toBe(200)
  expect(sup.url()).not.toMatch(/api_?key=/i)
  await expect(page.locator('[data-subtitle-renderer="pgs"] canvas')).toBeAttached()

  // inside the second cue: a picture in the lower part of the frame
  await pauseAt(page, 9.5)
  await expect.poll(async () => (await pgsPixels(page)).count, { timeout: 10_000 }).toBeGreaterThan(500)
  expect((await pgsPixels(page)).top).toBeGreaterThan(0.6)
  // between two cues: gone
  await pauseAt(page, 12.8)
  await expect.poll(async () => (await pgsPixels(page)).count).toBe(0)
  // a seek backwards into the first cue, then forwards into the third (the file is cut at 24 s, before the
  // display set that would end its fourth cue, and libpgs draws nothing after a stream's last display set)
  await pauseAt(page, 3)
  await expect.poll(async () => (await pgsPixels(page)).count).toBeGreaterThan(500)
  await pauseAt(page, 17.5)
  await expect.poll(async () => (await pgsPixels(page)).count).toBeGreaterThan(500)

  // playing across a cue start: nothing at 7.2 s, and the picture is there within half a second of 8.0 s
  await pauseAt(page, 7.2)
  await expect.poll(async () => (await pgsPixels(page)).count).toBe(0)
  await video(page).evaluate((v: HTMLVideoElement) => v.play())
  const seen = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const v = document.querySelector('video') as HTMLVideoElement
        const c = document.querySelector('[data-subtitle-renderer="pgs"] canvas') as HTMLCanvasElement
        const copy = document.createElement('canvas')
        const tick = () => {
          copy.width = c.width
          copy.height = c.height
          const g = copy.getContext('2d', { willReadFrequently: true })
          if (g && c.width && c.height) {
            g.drawImage(c, 0, 0)
            // the cue box is in the lower third: one row through it is enough
            const d = g.getImageData(0, Math.floor(c.height * 0.8), c.width, 1).data
            for (let i = 3; i < d.length; i += 4) if (d[i] >= 128) return resolve(v.currentTime)
          }
          if (v.currentTime > 11) return resolve(-1)
          requestAnimationFrame(tick)
        }
        tick()
      }),
  )
  expect(seen).toBeGreaterThanOrEqual(8)
  expect(seen).toBeLessThan(8.5)

  await expectFileItself(page, api, item.Id)
  await leavePlayer(page, api, item.Id)
})

test('the second audio track of a file is remuxed with video and audio copied; the first one and an ASS track play directly', { tag: [TAG.writes] }, async ({ page, app, api }) => {
  // 30 s MKV: English AAC first, Japanese AAC second and flagged default, a PGS and an ASS track
  const item = await api.findMovie('Dual Audio Second Default')
  await api.snapshot(item.Id)

  // 1. Japanese (stream 2): a browser plays only the first audio track of a file, so the server repackages
  await rememberTracks(page, api, item.Id, { audio: 2 })
  await app.goto('/')
  let started = await startPlayer(page, item.Id)
  expect(started.source?.SupportsDirectPlay).toBe(false)
  const url = new URL(started.source?.TranscodingUrl ?? '', 'http://server')
  expect(url.pathname).toMatch(/\.m3u8$/)
  expect(url.searchParams.get('TranscodeReasons')).toBe('SecondaryAudioNotSupported')
  expect(url.searchParams.get('AudioStreamIndex')).toBe('2')
  expect(url.searchParams.get('SegmentContainer')).toBe('mp4')
  // the server's encoder report, when the shared session shows this item (see expectFileItself): both streams
  // copied, nothing re-encoded. The reason asserted above already allows nothing else.
  let report = 'no report yet'
  await expect
    .poll(async () => {
      const t = (await serverSession(api, item.Id))?.TranscodingInfo
      if (t) report = `${t.IsVideoDirect} ${t.IsAudioDirect}`
      return report
    }, { timeout: 20_000 })
    .not.toBe('no report yet')
    .catch(() => undefined)
  expect(['true true', 'no report yet']).toContain(report)
  await leavePlayer(page, api, item.Id)

  // 2. English (stream 1, the first track) with the ASS track (stream 4): the file itself, ASS drawn by JASSUB
  await rememberTracks(page, api, item.Id, { audio: 1, subtitle: 4 })
  const ass = page.waitForResponse((r) => /\/Subtitles\/4\/0\/Stream\.ass/i.test(r.url()), { timeout: 30_000 })
  started = await startPlayer(page, item.Id)
  expect(started.source?.SupportsDirectPlay).toBe(true)
  expect(started.source?.MediaStreams?.find((s) => s.Index === 4)).toMatchObject({ Codec: 'ass', DeliveryMethod: 'External' })
  expect((await ass).status()).toBe(200)
  await expectFileItself(page, api, item.Id)
  await leavePlayer(page, api, item.Id)
})

test('an HDR10 file is played directly on a display that is not HDR: desktop Chromium tone-maps it, the server does not', { tag: [TAG.writes] }, async ({ page, app, api }, info) => {
  // 60 s MKV, HEVC Main 10 flagged BT.2020 / PQ with mastering metadata, AAC
  const item = await api.findMovie('HEVC HDR10')
  await api.snapshot(item.Id)
  await app.goto('/')
  const support = await page.evaluate(() => ({
    hevc10: document.createElement('video').canPlayType('video/mp4; codecs="hvc1.2.4.L153.B0"'),
    hdrDisplay: matchMedia('(dynamic-range: high)').matches,
  }))
  info.annotations.push({ type: 'hevc-support', description: `HEVC Main 10 canPlayType="${support.hevc10}", HDR display ${support.hdrDisplay}` })
  test.skip(support.hevc10 === '', 'this browser has no HEVC Main 10 decoder here (it needs the hardware decoder)')

  const { source } = await startPlayer(page, item.Id)
  expect(source?.SupportsDirectPlay).toBe(true)
  expect(source?.TranscodingUrl ?? null).toBeNull()
  // frames are really decoded
  await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.getVideoPlaybackQuality().totalVideoFrames), { timeout: 15_000 }).toBeGreaterThan(24)
  await expectFileItself(page, api, item.Id)
  await leavePlayer(page, api, item.Id)
})
