// Subtitles in right-to-left scripts: every line of a cue is laid out in its own direction, so the mark that ends
// a Hebrew or Arabic sentence is drawn at the left end of the line and the one that ends an English sentence at
// the right end, whatever the interface language is; the line stays centred on the picture. Text subtitles (our
// own renderer, measured with a DOM Range per character) and ASS subtitles (libass on a canvas, measured in its
// pixels).
// A 90 s Matroska file of the throwaway server is played directly in headless Edge (real codecs). The subtitle
// track's content is supplied here (request interception), and the playback reports are answered locally, so the
// tests neither need special media on the server nor change anything there.
import type { Locator, Page } from '@playwright/test'
import type { JellyfinApi } from '../fixtures/api'
import { TAG, expect, test } from '../fixtures'

test.use({ channel: 'msedge' })
// one video at a time
test.describe.configure({ mode: 'serial' })

/** The file's first audio track (played directly), its embedded English SubRip track and its ASS track. */
const AUDIO = 4
const TEXT_TRACK = 7
const ASS_TRACK = 10

const HE = 'שלום לכולם.'
const EN = 'Hello there.'
const HE_LATIN_FIRST = 'Tom הלך הביתה אתמול.'
const HE_NUMBER_FIRST = '3 ימים עברו מאז.'
const HE_DIALOGUE = ['- מה קרה?', '- כלום, באמת!']
const MIXED = ['Good evening.', 'ערב טוב.']
const AR = 'مرحبا بالعالم.'
const HE_ITALIC = 'לא.'

/** One cue every 4 s, 3 s long, the first at 2 s. */
const CUES = [HE, EN, HE_LATIN_FIRST, HE_NUMBER_FIRST, HE_DIALOGUE.join('\n'), MIXED.join('\n'), AR, `<i>${HE_ITALIC}</i>`]
const cueStart = (i: number) => 2 + i * 4
const TICKS = 10_000_000

/** The server's JSON delivery of a text track (subtitles/loader.ts asks for Stream.js first), with the cues above. */
const TEXT_BODY = JSON.stringify({
  TrackEvents: CUES.map((Text, i) => ({ Id: String(i + 1), Text, StartPositionTicks: cueStart(i) * TICKS, EndPositionTicks: (cueStart(i) + 3) * TICKS })),
})

/**
 * A track prepared for players that lay every line out left to right, as many Hebrew files are: the full stop,
 * question mark or comma that closes a line is stored before its first word and a dialogue dash after its last.
 * Written with "+" in stored order. One English line among them.
 */
const PREPARED = ['.' + 'שלום לכולם', '?' + 'מה קרה' + ' -', ',' + 'בוא הנה', EN, '!' + 'לא ייאמן']
const PREPARED_BODY = JSON.stringify({
  TrackEvents: PREPARED.map((Text, i) => ({ Id: String(i + 1), Text, StartPositionTicks: cueStart(i) * TICKS, EndPositionTicks: (cueStart(i) + 3) * TICKS })),
})

/** ASS scripts as most are written: the style's Encoding is 1, which tells libass nothing about direction. */
const ASS_LINES = [HE, EN, HE_LATIN_FIRST, `${String.fromCharCode(0x202b)}${HE}`]
/** ...and one whose Hebrew lines store their full stop first, written for libass as it is */
const ASS_PREPARED_LINES = ['.' + 'שלום לכולם', '.' + 'ערב טוב לכולם']
const assTime = (seconds: number) => `0:00:${String(seconds).padStart(2, '0')}.00`
const assBody = (lines: string[]) => `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,72,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,10,10,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lines.map((text, i) => `Dialogue: 0,${assTime(cueStart(i))},${assTime(cueStart(i) + 3)},Default,,0,0,0,,${text}`).join('\n')}
`

const norm = (id: string) => id.replace(/-/g, '').toLowerCase()

/** The track choice the player remembers for an item (stores/playbackChoices.ts), written before the app starts. */
async function rememberTracks(page: Page, api: JellyfinApi, itemId: string, subtitleIndex: number) {
  const server = await api.get<{ Id: string }>('/System/Info/Public')
  const key = `wholphin.playbackChoices.v1.${norm(server.Id)}:${norm(api.userId)}`
  const row = { itemId: norm(itemId), sourceId: norm(itemId), audioIndex: AUDIO, subtitleIndex, updated: Date.now() }
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

/** Opens the player on the test file with one subtitle track chosen and its content supplied here; resolves once the picture is decoded. */
async function play(page: Page, api: JellyfinApi, track: number, file: 'js' | 'ass', body: string): Promise<void> {
  const item = await api.findMovie('Multi Track Showcase')
  await rememberTracks(page, api, item.Id, track)
  // nothing reaches the server's play state: the reports are answered here
  await page.route(/\/Sessions\/Playing(\/|\?|$)/, (route) => route.fulfill({ status: 204, body: '' }))
  await page.route(new RegExp(`/Subtitles/${track}/\\d+/Stream\\.${file}`, 'i'), (route) =>
    route.fulfill({ status: 200, contentType: file === 'js' ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', body }),
  )
  await page.goto(`/play/${item.Id}`)
  await page.waitForFunction(() => {
    const v = document.querySelector('video')
    return !!v && v.readyState >= 2 && v.currentTime > 0.5
  }, null, { timeout: 30_000 })
}

/** Pauses in the middle of cue `i` (or `offset` seconds away from it), as dragging the seek bar would. */
async function showCue(page: Page, i: number, offset = 0) {
  await page.locator('video').evaluate((v: HTMLVideoElement, t) => {
    v.pause()
    v.currentTime = t
  }, cueStart(i) + 1.5 + offset)
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => !v.seeking && v.readyState >= 2)).toBe(true)
}

async function leave(page: Page) {
  for (let i = 0; i < 4 && new URL(page.url()).pathname.startsWith('/play/'); i++) await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/\/play\//)
}

interface DrawnLine {
  /** left edge of the first letter of the text (in stored order) */
  firstLetter: number
  /** left edge of the first and of the last character of the text (in stored order) */
  firstChar: number
  lastMark: number
  /** the drawn text's left and right edge, its horizontal middle and the picture's */
  left: number
  right: number
  middle: number
  pictureMiddle: number
}

/** Where the glyphs of one text subtitle line are drawn, measured with a DOM Range per character. */
async function drawn(line: Locator): Promise<DrawnLine> {
  await expect(line).toBeVisible()
  return line.evaluate((el) => {
    const chars: Array<{ c: string; left: number; right: number }> = []
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      for (let i = 0; i < n.data.length; i++) {
        if (/\s/.test(n.data[i])) continue
        const range = document.createRange()
        range.setStart(n, i)
        range.setEnd(n, i + 1)
        const rect = range.getClientRects()[0]
        if (rect && rect.width > 0) chars.push({ c: n.data[i], left: rect.left, right: rect.right })
      }
    }
    const first = chars.find((x) => /\p{L}/u.test(x.c))
    const last = chars[chars.length - 1]
    if (!first || !last) throw new Error('the line has no drawn text')
    const left = Math.min(...chars.map((x) => x.left))
    const right = Math.max(...chars.map((x) => x.right))
    const video = document.querySelector('video')!.getBoundingClientRect()
    return { firstLetter: first.left, firstChar: chars[0].left, lastMark: last.left, left, right, middle: (left + right) / 2, pictureMiddle: video.left + video.width / 2 }
  })
}

const line = (page: Page, text: string) => page.getByText(text, { exact: true })

async function expectRightToLeft(page: Page, text: string) {
  const d = await drawn(line(page, text))
  expect(d.lastMark, `"${text}": the closing mark is left of the first letter`).toBeLessThan(d.firstLetter)
  expect(Math.abs(d.middle - d.pictureMiddle), `"${text}" is centred`).toBeLessThanOrEqual(1.5)
}

async function expectLeftToRight(page: Page, text: string) {
  const d = await drawn(line(page, text))
  expect(d.lastMark, `"${text}": the closing mark is right of the first letter`).toBeGreaterThan(d.firstLetter)
  expect(Math.abs(d.middle - d.pictureMiddle), `"${text}" is centred`).toBeLessThanOrEqual(1.5)
}

test('a Hebrew or Arabic subtitle line ends at its left end, an English one at its right end, each line of a cue by itself', { tag: [TAG.desktop, TAG.phone] }, async ({ page, app, api }) => {
  await app.goto('/')
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  await play(page, api, TEXT_TRACK, 'js', TEXT_BODY)

  await showCue(page, 0)
  await expectRightToLeft(page, HE)
  await showCue(page, 1)
  await expectLeftToRight(page, EN)
  // a Hebrew sentence that starts with a Latin name, or with a number, is still a right-to-left line
  await showCue(page, 2)
  await expectRightToLeft(page, HE_LATIN_FIRST)
  await showCue(page, 3)
  await expectRightToLeft(page, HE_NUMBER_FIRST)
  // dialogue: both lines right to left, the dashes at the right
  await showCue(page, 4)
  for (const text of HE_DIALOGUE) {
    await expectRightToLeft(page, text)
    const dash = await line(page, text).evaluate((el) => {
      const range = document.createRange()
      range.setStart(el.firstChild as Text, 0)
      range.setEnd(el.firstChild as Text, 1)
      return { dash: range.getBoundingClientRect().right, right: el.getBoundingClientRect().right }
    })
    expect(Math.abs(dash.right - dash.dash), `"${text}": the dash is at the right end`).toBeLessThanOrEqual(1)
  }
  // an English line and a Hebrew line in one cue
  await showCue(page, 5)
  await expectLeftToRight(page, MIXED[0])
  await expectRightToLeft(page, MIXED[1])
  await showCue(page, 6)
  await expectRightToLeft(page, AR)
  // inline markup is not text: the two letters of the italic tags do not outvote a two-letter Hebrew word
  await showCue(page, 7)
  await expectRightToLeft(page, HE_ITALIC)

  await leave(page)
})

test.describe('Hebrew interface', () => {
  // the app follows the browser's language
  test.use({ locale: 'he-IL' })

  test('an English subtitle line keeps its full stop at the right end, a Hebrew one at the left end', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
    await app.goto('/')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await play(page, api, TEXT_TRACK, 'js', TEXT_BODY)

    await showCue(page, 1)
    await expectLeftToRight(page, EN)
    await showCue(page, 0)
    await expectRightToLeft(page, HE)
    await showCue(page, 5)
    await expectLeftToRight(page, MIXED[0])
    await expectRightToLeft(page, MIXED[1])

    await leave(page)
  })

  test('a Hebrew track that stores its closing punctuation first is drawn with that punctuation at the left end', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
    await app.goto('/')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await play(page, api, TEXT_TRACK, 'js', PREPARED_BODY)
    await expectPreparedTrack(page)
    await leave(page)
  })
})

test('a Hebrew track that stores its closing punctuation first: the same with an English interface', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
  await app.goto('/')
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  await play(page, api, TEXT_TRACK, 'js', PREPARED_BODY)
  await expectPreparedTrack(page)
  await leave(page)
})

/**
 * The lines of PREPARED: the stored-first full stop, question mark and comma are the leftmost glyph, the
 * stored-last dialogue dash the rightmost, the words between them read right to left, and the line is centred.
 */
async function expectPreparedTrack(page: Page) {
  for (const [i, text] of PREPARED.entries()) {
    await showCue(page, i)
    const d = await drawn(line(page, text))
    if (text === EN) {
      expect(d.lastMark, `"${text}": the full stop is right of the first letter`).toBeGreaterThan(d.firstLetter)
    } else {
      expect(Math.abs(d.firstChar - d.left), `"${text}": the closing mark is the leftmost glyph`).toBeLessThanOrEqual(0.5)
      expect(d.firstChar, `"${text}": the closing mark is left of the first letter`).toBeLessThan(d.firstLetter)
      if (text.endsWith('-')) expect(d.lastMark, `"${text}": the dash is right of the first letter`).toBeGreaterThan(d.firstLetter)
    }
    expect(Math.abs(d.middle - d.pictureMiddle), `"${text}" is centred`).toBeLessThanOrEqual(1.5)
  }
}

interface Ink {
  /** runs of painted columns, left to right, each with the height of its ink */
  clusters: Array<{ left: number; right: number; height: number }>
  width: number
}

/**
 * What libass painted: the canvas is read column by column. The canvas belongs to a worker (OffscreenCanvas), so
 * its current frame is copied first.
 */
async function assInk(page: Page): Promise<Ink> {
  return page.locator('[data-subtitle-renderer="ass"] canvas').evaluate((c: HTMLCanvasElement) => {
    const copy = document.createElement('canvas')
    copy.width = c.width
    copy.height = c.height
    const g = copy.getContext('2d')
    const clusters: Array<{ left: number; right: number; top: number; bottom: number }> = []
    if (g && c.width && c.height) {
      g.drawImage(c, 0, 0)
      const d = g.getImageData(0, 0, c.width, c.height).data
      let open: (typeof clusters)[number] | null = null
      for (let x = 0; x < c.width; x++) {
        let top = -1
        let bottom = -1
        for (let y = 0; y < c.height; y++) {
          if (d[(y * c.width + x) * 4 + 3] < 128) continue
          if (top < 0) top = y
          bottom = y
        }
        if (top < 0) open = null
        else if (!open) clusters.push((open = { left: x, right: x, top, bottom }))
        else {
          open.right = x
          open.top = Math.min(open.top, top)
          open.bottom = Math.max(open.bottom, bottom)
        }
      }
    }
    return { clusters: clusters.map((k) => ({ left: k.left, right: k.right, height: k.bottom - k.top + 1 })), width: c.width }
  })
}

/**
 * Pauses inside ASS event `i` and returns its ink. JASSUB draws when the video presents a frame, which a paused
 * video does only after a seek: the seek is repeated a few hundredths further until the renderer (still loading
 * at the first one) has drawn the event.
 */
async function showAss(page: Page, i: number): Promise<Ink> {
  let ink: Ink = { clusters: [], width: 0 }
  let nudge = 0
  await expect
    .poll(
      async () => {
        await showCue(page, i, nudge)
        nudge = (nudge + 0.04) % 1
        await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
        ink = await assInk(page)
        return ink.clusters.length
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(3)
  return ink
}

/** The full stop is the one low mark of these lines: a run of columns much lower than the letters. */
function fullStopSide(ink: Ink): 'left' | 'right' | 'none' {
  const tallest = Math.max(...ink.clusters.map((k) => k.height))
  const low = (k: Ink['clusters'][number]) => k.height < tallest * 0.3
  const first = ink.clusters[0]
  const last = ink.clusters[ink.clusters.length - 1]
  return low(first) && !low(last) ? 'left' : low(last) && !low(first) ? 'right' : 'none'
}

/** Distance between the middle of the ink and the middle of the canvas. */
const centred = (ink: Ink) => Math.abs((ink.clusters[0].left + ink.clusters[ink.clusters.length - 1].right) / 2 - ink.width / 2)

test('ASS: libass draws a Hebrew line right to left although the script does not ask for it, an English line left to right', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
  await app.goto('/')
  await play(page, api, ASS_TRACK, 'ass', assBody(ASS_LINES))
  await expect(page.locator('[data-subtitle-renderer="ass"] canvas')).toBeAttached()

  const hebrew = await showAss(page, 0)
  expect(fullStopSide(hebrew), `"${ASS_LINES[0]}": the full stop`).toBe('left')
  expect(centred(hebrew)).toBeLessThanOrEqual(6)
  const english = await showAss(page, 1)
  expect(fullStopSide(english), `"${ASS_LINES[1]}": the full stop`).toBe('right')
  expect(centred(english)).toBeLessThanOrEqual(6)
  // a Hebrew sentence that starts with a Latin name
  const latinFirst = await showAss(page, 2)
  expect(fullStopSide(latinFirst), `"${ASS_LINES[2]}": the full stop`).toBe('left')
  expect(centred(latinFirst)).toBeLessThanOrEqual(6)
  // a line that carries its own direction mark (a right-to-left embedding) is drawn as before
  const marked = await showAss(page, 3)
  expect(fullStopSide(marked), 'a line that starts with a right-to-left embedding: the full stop').toBe('left')
  expect(centred(marked)).toBeLessThanOrEqual(6)

  await leave(page)
})

test('ASS: a Hebrew script that stores its full stops first is left as it is, the full stop drawn at the left end', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
  await app.goto('/')
  await play(page, api, ASS_TRACK, 'ass', assBody(ASS_PREPARED_LINES))
  await expect(page.locator('[data-subtitle-renderer="ass"] canvas')).toBeAttached()

  for (const [i, text] of ASS_PREPARED_LINES.entries()) {
    const ink = await showAss(page, i)
    expect(fullStopSide(ink), `"${text}": the full stop`).toBe('left')
    expect(centred(ink)).toBeLessThanOrEqual(6)
  }

  await leave(page)
})
