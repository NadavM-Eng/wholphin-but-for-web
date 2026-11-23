// The web player's control layout (owner request, a deliberate departure from the TV controller): nothing darkens
// the picture while the controls show (the strip's own gradient fades in from one strip height above it), the
// control strip is low enough for the black bar of a 2.39:1 film, its buttons have fixed physical positions that
// are the same in every language (settings, favourite, picture in picture, volume from the left edge; the transport
// in the middle; subtitles, audio, chapters, queue, fullscreen against the right edge), the volume slider opens at
// the right of its button over the free part of the left side and moves nothing, the times are clocks,
// the title stands right after Back, and
// chapters and queue are panels opened from two buttons of the strip. The player itself is the whole window: the
// video box has no margin at any size, and only the scale mode places the picture in it. Real codecs (headless, muted Edge), a few
// seconds of video per test, paused at once. Playing reports progress, which is server state: the tests run in the
// writes project, snapshot every item they play and wait for the Stopped report before the fixture restores it.
import type { Page } from '@playwright/test'
import { uiText } from '../../tools/shots/uiText.ts'
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

/** The fixed order of the strip's buttons, from the physical left to the physical right. */
const LEFT_GROUP = ['settings', 'favorite', 'pip', 'volume']
const TRANSPORT = ['previous', 'skip-back', 'play', 'skip-forward', 'next']
const RIGHT_GROUP = ['subtitles', 'audio', 'chapters', 'queue', 'fullscreen']

/**
 * The strip as it is laid out: its box and side paddings, every button with its group, the Skip button and the
 * "Ends at" text when they show, the seek bar and the two times. `dp`: CSS px of one dp (the interface scale).
 */
function stripLayout(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }
    }
    const strip = document.querySelector<HTMLElement>('[data-player-strip]')!
    const cs = getComputedStyle(strip)
    const optional = (selector: string) => {
      const el = strip.querySelector(selector)
      return el && el.getBoundingClientRect().width > 0 ? box(el) : null
    }
    const endsAt = strip.querySelector<HTMLElement>('[data-player-ends-at]')
    // "Ends at" is clipped whole when the row has no room for it: it then lies outside its clipping box
    const endsAtShown = !!endsAt && endsAt.getBoundingClientRect().bottom <= endsAt.parentElement!.getBoundingClientRect().bottom + 0.5
    return {
      window: { width: innerWidth, height: innerHeight },
      dp: parseFloat(getComputedStyle(document.documentElement).fontSize) / 16,
      strip: { ...box(strip), padLeft: parseFloat(cs.paddingLeft), padRight: parseFloat(cs.paddingRight) },
      buttons: Array.from(strip.querySelectorAll<HTMLElement>('[data-player-button]'), (b) => {
        // where the button is laid out: the focused or hovered one is drawn 1.1 times larger around its centre
        const r = b.getBoundingClientRect()
        const scale = new DOMMatrix(getComputedStyle(b).transform).a || 1
        const [w, h, cx, cy] = [r.width / scale, r.height / scale, (r.left + r.right) / 2, (r.top + r.bottom) / 2]
        return {
          name: b.dataset.playerButton!,
          group: b.closest<HTMLElement>('[data-player-group]')?.dataset.playerGroup ?? null,
          ...{ left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2, width: w, height: h },
        }
      }),
      skip: optional('[data-player-skip]'),
      endsAt: endsAt && endsAtShown ? box(endsAt) : null,
      seek: box(strip.querySelector('[data-seekbar]')!),
      elapsed: box(strip.querySelector('[data-player-time="elapsed"]')!),
      remaining: optional('[data-player-time="remaining"]'),
    }
  })
}
type StripLayout = Awaited<ReturnType<typeof stripLayout>>

/** The rows of buttons of the strip, top to bottom, each from left to right. */
function buttonRows(l: StripLayout) {
  const tops = [...new Set(l.buttons.map((b) => Math.round(b.top)))].sort((a, b) => a - b)
  return tops.map((top) => l.buttons.filter((b) => Math.round(b.top) === top).sort((a, b) => a.left - b.left))
}

/**
 * The rules every strip keeps, whatever the window, the language and the buttons it has: every button whole
 * inside the window and the strip, none over another (nor over the Skip button); the fixed order; the first
 * button of the left group on the strip's left padding and the last of the right group on its right padding; the
 * transport in the middle of the strip where no Skip button takes room beside it.
 */
function expectStripRules(l: StripLayout, label: string, opts: { rows: 1 | 2 }) {
  const all = [...l.buttons, ...(l.skip ? [{ name: 'the Skip button', group: null, ...l.skip }] : [])]
  for (const b of all) {
    expect(b.left, `${label}: ${b.name}, left edge`).toBeGreaterThanOrEqual(-0.5)
    expect(b.right, `${label}: ${b.name}, right edge`).toBeLessThanOrEqual(l.window.width + 0.5)
    expect(b.top, `${label}: ${b.name}, top edge`).toBeGreaterThanOrEqual(l.strip.top - 0.5)
    expect(b.bottom, `${label}: ${b.name}, bottom edge`).toBeLessThanOrEqual(l.strip.bottom + 0.5)
  }
  for (const a of all) {
    for (const b of all) {
      if (a === b || a.top >= b.bottom - 0.5 || b.top >= a.bottom - 0.5) continue
      expect(a.right <= b.left + 0.5 || b.right <= a.left + 0.5, `${label}: ${a.name} and ${b.name} do not overlap`).toBe(true)
    }
  }
  // the DOM order (which Tab follows) is the fixed order, group by group
  const names = l.buttons.map((b) => b.name)
  const present = (group: string[]) => group.filter((n) => names.includes(n))
  expect(names, `${label}: order of the buttons`).toEqual([...present(LEFT_GROUP), ...TRANSPORT, ...present(RIGHT_GROUP)])
  // the permanent buttons: settings opens the row and volume closes the left group (its slider opens after it);
  // subtitles and audio open the right group, where chapters and queue come and go after them
  const leftNames = present(LEFT_GROUP)
  expect([leftNames[0], leftNames[leftNames.length - 1]], `${label}: settings opens the left group and volume closes it`).toEqual(['settings', 'volume'])
  expect(present(RIGHT_GROUP).slice(0, 2), `${label}: subtitles and audio open the right group`).toEqual(['subtitles', 'audio'])
  for (const b of l.buttons) {
    const group = LEFT_GROUP.includes(b.name) ? 'left' : TRANSPORT.includes(b.name) ? 'transport' : 'right'
    expect(b.group, `${label}: group of ${b.name}`).toBe(group)
  }
  const rows = buttonRows(l)
  expect(rows.length, `${label}: rows of buttons`).toBe(opts.rows)
  const rowNames = rows.map((r) => r.map((b) => b.name))
  if (opts.rows === 1) {
    // what is drawn from left to right is the DOM order
    expect(rowNames[0], `${label}: drawn order`).toEqual(names)
  } else {
    expect(rowNames[0], `${label}: first row`).toEqual(TRANSPORT)
    expect(rowNames[1], `${label}: second row`).toEqual([...present(LEFT_GROUP), ...present(RIGHT_GROUP)])
  }
  const by = (name: string) => l.buttons.find((b) => b.name === name)!
  const last = l.buttons[l.buttons.length - 1]
  expect(Math.abs(by('settings').left - (l.strip.left + l.strip.padLeft)), `${label}: settings stands on the left padding`).toBeLessThanOrEqual(0.5)
  expect(Math.abs(last.right - (l.strip.right - l.strip.padRight)), `${label}: ${last.name} stands on the right padding`).toBeLessThanOrEqual(0.5)
  if (!l.skip) {
    const middle = (by('previous').left + by('next').right) / 2
    expect(Math.abs(middle - (l.strip.left + l.strip.right) / 2), `${label}: transport centred`).toBeLessThanOrEqual(1)
  }
  if (l.skip) {
    // the Skip button stands between the transport and the right group
    const firstRight = l.buttons.find((b) => b.group === 'right')!
    expect(l.skip.left, `${label}: the Skip button after the transport`).toBeGreaterThanOrEqual(by('next').right - 0.5)
    if (opts.rows === 1) expect(l.skip.right, `${label}: the Skip button before the right group`).toBeLessThanOrEqual(firstRight.left + 0.5)
  }
  if (l.endsAt) {
    // "Ends at" stands between the left group and the transport
    const lastLeft = [...l.buttons].reverse().find((b) => b.group === 'left')!
    if (opts.rows === 1) expect(l.endsAt.left, `${label}: "Ends at" after the left group`).toBeGreaterThanOrEqual(lastLeft.right - 0.5)
    expect(l.endsAt.right, `${label}: "Ends at" before the transport`).toBeLessThanOrEqual(by('previous').left + 0.5)
  }
}

/** Left edge of every button by name. */
const lefts = (l: StripLayout) => Object.fromEntries(l.buttons.map((b) => [b.name, Math.round(b.left * 100) / 100]))

/** The buttons whose left edge differs by more than 1 CSS px between two layouts (those both have). */
function moved(a: StripLayout, b: StripLayout, names?: string[]) {
  const la = lefts(a)
  const lb = lefts(b)
  return Object.keys(la)
    .filter((n) => n in lb && (!names || names.includes(n)) && Math.abs(la[n] - lb[n]) > 1)
    .map((n) => `${n}: ${la[n]} -> ${lb[n]}`)
}

const SKIP_BUTTON = 'the Skip button'

/**
 * The buttons and the Skip button whose box differs on any side by more than half a CSS px between two layouts,
 * or that only one of the two has. The boxes are those of `stripLayout`: where a button is laid out, without the
 * look of the hovered or focused one.
 */
function displaced(a: StripLayout, b: StripLayout, names?: string[]) {
  type Sides = { left: number; right: number; top: number; bottom: number }
  const boxes = (l: StripLayout) => new Map<string, Sides>([...l.buttons.map((x) => [x.name, x] as const), ...(l.skip ? [[SKIP_BUTTON, l.skip] as const] : [])])
  const [ba, bb] = [boxes(a), boxes(b)]
  const out: string[] = []
  for (const name of new Set([...ba.keys(), ...bb.keys()])) {
    if (names && !names.includes(name)) continue
    const [x, y] = [ba.get(name), bb.get(name)]
    if (!x || !y) {
      out.push(`${name}: ${x ? 'gone' : 'new'}`)
      continue
    }
    const sides = (['left', 'right', 'top', 'bottom'] as const).filter((side) => Math.abs(x[side] - y[side]) > 0.5)
    if (sides.length) out.push(`${name}: ${sides.map((side) => `${side} ${Math.round(x[side] * 100) / 100} -> ${Math.round(y[side] * 100) / 100}`).join(', ')}`)
  }
  return out
}

/**
 * The volume slider as it is drawn and as a pointer meets it.
 * `place`: the box the slider opens in (no width while closed). `visible`: the part of it that neither an ancestor
 * that clips sideways (the strip's left side) nor the window cuts off. `full`: the width the open slider has
 * (`--volume-w`, read from the slider's own box, which keeps that width while the place opens around it).
 * `foreign`: points along the visible slider where a pointer meets something else; `beyond`: whether a pointer just
 * past a cut edge still meets the slider. For every button of the strip and the Skip button: drawn (no opacity 0,
 * hidden or removed box on the way up to the strip), takes clicks, and is what lies under its own middle.
 * `overflow`: how far the strip, its button row or the page scroll sideways.
 */
function sliderState(page: Page) {
  return page.evaluate(() => {
    const strip = document.querySelector<HTMLElement>('[data-player-strip]')!
    const row = strip.querySelector<HTMLElement>('[data-player-group="transport"]')!.parentElement!
    const place = strip.querySelector<HTMLElement>('[data-player-volume-slider]')!
    const r = place.getBoundingClientRect()
    let left = Math.max(r.left, 0)
    let right = Math.min(r.right, innerWidth)
    for (let a = place.parentElement; a && strip.contains(a); a = a.parentElement) {
      const cs = getComputedStyle(a)
      // (a box that dissolved into its parts clips nothing)
      if (cs.overflowX === 'visible' || cs.display === 'contents') continue
      const b = a.getBoundingClientRect()
      left = Math.max(left, b.left + parseFloat(cs.borderLeftWidth))
      right = Math.min(right, b.right - parseFloat(cs.borderRightWidth))
    }
    const drawn = (el: Element) => {
      for (let a: Element | null = el; a && a !== strip.parentElement; a = a.parentElement) {
        const cs = getComputedStyle(a)
        if (cs.display === 'none' || cs.visibility !== 'visible' || Number(cs.opacity) === 0) return false
      }
      return true
    }
    const name = (el: Element | null) => {
      const h = el as HTMLElement | null
      if (!h) return 'nothing'
      const b = h.closest<HTMLElement>('[data-player-button]')
      return b ? `the ${b.dataset.playerButton} button` : h.closest('[data-player-ends-at]') ? '"Ends at"' : h.closest('[data-player-skip]') ? 'the Skip button' : `${h.tagName.toLowerCase()}.${String(h.getAttribute('class') ?? '').split(' ')[0]}`
    }
    const y = (r.top + r.bottom) / 2
    // (a point is hit-tested at whole pixels: the samples keep a pixel and a half from the edges)
    const foreign: string[] = []
    for (let x = left + 1.5; x <= right - 1.5; x += 2) {
      const hit = document.elementFromPoint(x, y)
      if (!hit || !place.contains(hit)) foreign.push(`${name(hit)} at x=${Math.round(x * 10) / 10}`)
    }
    const meets = (x: number) => !!document.elementFromPoint(x, y)?.closest('[data-player-volume-slider]')
    const target = (el: HTMLElement) => {
      const b = el.getBoundingClientRect()
      const hit = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2)
      return { drawn: drawn(el), clickable: getComputedStyle(el).pointerEvents !== 'none', hit: !!hit && el.contains(hit) }
    }
    const endsAt = strip.querySelector<HTMLElement>('[data-player-ends-at]')
    const skip = strip.querySelector<HTMLElement>('[data-player-skip]')
    const control = place.querySelector('[role="slider"]')!.getBoundingClientRect()
    return {
      open: !!strip.querySelector('[data-volume-open]'),
      full: parseFloat(getComputedStyle(place.firstElementChild!).width),
      place: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width },
      control: { left: control.left, right: control.right, width: control.width },
      visible: { left, right, width: Math.max(0, right - left) },
      foreign,
      beyond: { left: r.left < left - 1 && left - 2.5 >= 0 && meets(left - 2.5), right: r.right > right + 1 && right + 2.5 < innerWidth && meets(right + 2.5) },
      endsAt: endsAt ? { drawn: drawn(endsAt) } : null,
      buttons: Array.from(strip.querySelectorAll<HTMLElement>('[data-player-button]'), (b) => ({ name: b.dataset.playerButton!, ...target(b) })),
      skip: skip ? target(skip) : null,
      overflow: Math.max(strip.scrollWidth - strip.clientWidth, row.scrollWidth - row.clientWidth, document.documentElement.scrollWidth - innerWidth, scrollX),
    }
  })
}

/**
 * Opens the volume slider with the mouse, holds it to its rules and closes it again. The slider is laid over the
 * strip and takes no room in it, so while it is open:
 *  (a) no transport button and (b) no other button is laid out anywhere else (the hovered volume button only
 *      looks larger), (c) the Skip button keeps its box and stays drawn and clickable, (d) nothing leaves the
 *      window and nothing scrolls sideways;
 *  (e) one row: the slider starts at the volume button's right edge, opens to its whole width and is cut where
 *      the strip's left side ends, which is the transport's left edge: it never reaches a transport button.
 *      Two rows: it ends at the volume button's left edge and lies whole inside the window;
 *  (f) no button that is drawn and takes clicks lies under it: one row has none there at all; in two rows the
 *      buttons at the left of volume are not drawn and take no click meanwhile (favourite and picture in
 *      picture; settings too when one of those is absent), and every other button is drawn and clickable. Along
 *      the slider a pointer meets nothing but the slider;
 *  (g) "Ends at", which stands where the slider opens, is not drawn (and is nothing a pointer meets there: f), and
 *      is back after the slider closed;
 *  (h) `full`: the row has room, so the whole slider shows. Otherwise it shows as much as the left side has free.
 * The pointer, moved the way a hand does from the button onto the slider, keeps it open.
 */
async function expectVolumeSlider(page: Page, label: string, opts: { rows: 1 | 2; full: boolean }) {
  await showControlsWithMouse(page)
  const before = await stripLayout(page)
  expectStripRules(before, label, { rows: opts.rows })
  const closed = await sliderState(page)
  expect([closed.open, closed.place.width], `${label}: the closed slider has no width`).toEqual([false, 0])
  expect(closed.endsAt, `${label}: "Ends at" before the slider opens`).toEqual({ drawn: true })

  const v = before.buttons.find((b) => b.name === 'volume')!
  const at = { x: (v.left + v.right) / 2, y: (v.top + v.bottom) / 2 }
  await page.mouse.move(at.x, at.y)
  await expect(page.locator('[data-volume-open]'), `${label}: the volume slider opens under the mouse`).toHaveCount(1)
  await expect.poll(async () => Math.abs((await sliderState(page)).place.width - closed.full), `${label}: the slider's place opens to its whole width (${closed.full})`).toBeLessThanOrEqual(0.5)
  const open = await stripLayout(page)
  const s = await sliderState(page)
  const by = (name: string) => open.buttons.find((b) => b.name === name)!
  const has = (name: string) => open.buttons.some((b) => b.name === name)
  const state = (name: string) => s.buttons.find((b) => b.name === name)!

  // (a), (b), (c): nothing is laid out anywhere else
  expect(displaced(before, open, TRANSPORT), `${label}: transport buttons that moved when the slider opened`).toEqual([])
  expect(displaced(before, open, [...LEFT_GROUP, ...RIGHT_GROUP]), `${label}: buttons that moved when the slider opened`).toEqual([])
  expect(displaced(before, open), `${label}: what moved when the slider opened`).toEqual([])
  expect(!!open.skip, `${label}: the Skip button is there as before`).toBe(!!before.skip)
  if (open.skip) expect(s.skip, `${label}: the Skip button stays drawn, takes clicks and lies under its own middle`).toEqual({ drawn: true, clickable: true, hit: true })
  // (d)
  expectStripRules(open, `${label}, slider open`, { rows: opts.rows })
  expect(s.overflow, `${label}: nothing scrolls sideways`).toBeLessThanOrEqual(0)
  expect(s.visible.left, `${label}: the slider inside the window`).toBeGreaterThanOrEqual(0)
  expect(s.visible.right, `${label}: the slider inside the window`).toBeLessThanOrEqual(open.window.width)
  expect(state('volume'), `${label}: the volume button stays under the pointer`).toEqual({ name: 'volume', drawn: true, clickable: true, hit: true })

  // (e)
  expect(s.full, `${label}: the slider's width`).toBeGreaterThan(24)
  const volume = by('volume')
  if (opts.rows === 1) {
    const edge = by('previous').left
    expect(Math.abs(s.place.left - volume.right), `${label}: the slider starts at the volume button's right edge`).toBeLessThanOrEqual(0.5)
    expect(Math.abs(s.visible.left - s.place.left), `${label}: nothing cuts the slider at the volume button`).toBeLessThanOrEqual(0.5)
    expect(s.visible.right, `${label}: the slider ends where the left side of the strip ends, before the transport`).toBeLessThanOrEqual(edge + 0.5)
    // it is cut by nothing else: as much of it shows as the left side has free
    expect(Math.abs(s.visible.width - Math.min(s.full, edge - volume.right)), `${label}: the slider shows as far as the left side reaches (${s.visible.width} of ${s.full}, room ${edge - volume.right})`).toBeLessThanOrEqual(1)
  } else {
    expect(Math.abs(s.place.right - volume.left), `${label}: the slider ends at the volume button's left edge`).toBeLessThanOrEqual(0.5)
    expect(s.place.left, `${label}: the slider inside the window`).toBeGreaterThanOrEqual(-0.5)
    expect(Math.abs(s.visible.width - s.full), `${label}: nothing cuts the slider (${s.visible.width} of ${s.full})`).toBeLessThanOrEqual(0.5)
  }
  // the slider control itself (the kit Slider) lies inside the place that opened for it
  expect(s.control.left, `${label}: the slider control inside its place`).toBeGreaterThanOrEqual(s.place.left - 0.5)
  expect(s.control.right, `${label}: the slider control inside its place`).toBeLessThanOrEqual(s.place.right + 0.5)
  expect(s.beyond, `${label}: a pointer past the slider's cut edge still meets the slider`).toEqual({ left: false, right: false })
  for (const name of TRANSPORT) expect(state(name), `${label}: the ${name} button stays drawn, takes clicks and lies under its own middle`).toEqual({ name, drawn: true, clickable: true, hit: true })

  // (f)
  const under = open.buttons.filter((b) => b.name !== 'volume' && b.top < s.place.bottom && b.bottom > s.place.top && b.right > s.visible.left + 0.5 && b.left < s.visible.right - 0.5).map((b) => b.name)
  const beside = ['favorite', 'pip'].filter(has)
  const expected = opts.rows === 1 ? [] : beside.length === 2 ? beside : [...beside, 'settings']
  expect([...under].sort(), `${label}: the buttons under the slider`).toEqual([...expected].sort())
  for (const b of s.buttons) {
    if (b.name === 'volume') continue
    const want = under.includes(b.name) ? { name: b.name, drawn: false, clickable: false, hit: false } : { name: b.name, drawn: true, clickable: true, hit: true }
    expect(b, `${label}: the ${b.name} button ${under.includes(b.name) ? 'under the slider is not drawn and takes no click' : 'is drawn, takes clicks and lies under its own middle'}`).toEqual(want)
  }
  expect(s.foreign, `${label}: what a pointer meets along the slider, other than the slider`).toEqual([])
  // (g)
  expect(s.endsAt, `${label}: "Ends at" while the slider is open`).toEqual({ drawn: false })
  // (h)
  if (opts.full) expect(s.visible.width, `${label}: the row has room for the whole slider (${s.full})`).toBeGreaterThanOrEqual(s.full - 0.5)
  else if (s.visible.width < s.full - 0.5) test.info().annotations.push({ type: 'volume slider cut', description: `${label}: ${Math.round(s.visible.width)} of ${Math.round(s.full)} px show` })

  // from the button onto the slider, the way a hand moves: it stays open and still nothing moves
  if (s.visible.width >= 8) {
    const to = { x: (s.visible.left + s.visible.right) / 2, y: (s.place.top + s.place.bottom) / 2 }
    await page.mouse.move(to.x, to.y, { steps: 6 })
    expect(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[data-player-volume-slider]'), to), `${label}: the slider is under the pointer`).toBe(true)
    await expect(page.locator('[data-volume-open]'), `${label}: the slider stays open under the pointer`).toHaveCount(1)
    expect(displaced(before, await stripLayout(page)), `${label}: what moved while the pointer was on the slider`).toEqual([])
  }

  // away from it: closed, everything as it was, "Ends at" back
  await showControlsWithMouse(page)
  await expect(page.locator('[data-volume-open]'), `${label}: the slider closes when the pointer leaves`).toHaveCount(0)
  await expect.poll(async () => displaced(before, await stripLayout(page)), `${label}: what is not back in place after the slider closed`).toEqual([])
  const after = await sliderState(page)
  expect(after.place.width, `${label}: the closed slider has no width again`).toBe(0)
  expect(after.endsAt, `${label}: "Ends at" is back after the slider closed`).toEqual({ drawn: true })
  expect(after.buttons.filter((b) => !b.drawn || !b.clickable || !b.hit).map((b) => b.name), `${label}: buttons not back after the slider closed`).toEqual([])
  return { before, open, slider: s, at }
}

type DevStore = { getState(): Record<string, unknown>; setState(patch: Record<string, unknown>): void }
type DevPlayback = { store: DevStore; engine: { seekTo(ms: number): void } }

/**
 * Puts the playback store in a state the playing item does not have (no chapters, a queue of three, a running
 * segment, an item without a favourite button), through the player's development hook (engine.ts
 * `window.__playback`), and waits for the strip to follow. `real` restores what the first call saved. The video
 * is paused, so the engine writes none of these fields meanwhile.
 * `favorite: 'none'`: the item as a trailer, which cannot be marked (FavoriteButton.tsx).
 * `pip: 'none'`: the <video> refuses picture in picture (its own `disablePictureInPicture`), as in a browser
 * without it. The player asks the <video> when it renders, which a patched segment makes it do: patch
 * `segment: 'intro'` along with it, and wait for the button to go or to come back.
 */
async function patchStore(
  page: Page,
  patch: { chapters?: 'none' | 'real'; queue?: 'single' | 'three' | 'real'; segment?: 'intro' | 'none' | 'real'; favorite?: 'none' | 'real'; pip?: 'none' | 'real' },
) {
  await page.evaluate(async (patch) => {
    const w = window as unknown as { __playback: DevPlayback; __e2eStore?: Record<string, unknown> }
    const store = w.__playback.store
    // the engine's poll of the item's own segments would put the real state back within a second: stopped for
    // the rest of this playback, which stays paused (the engine clears the same timer when the player closes)
    if (patch.segment === 'intro') clearInterval((w.__playback.engine as unknown as { segTimer: ReturnType<typeof setInterval> | null }).segTimer ?? undefined)
    const s = store.getState()
    w.__e2eStore ??= { chapters: s.chapters, queue: s.queue, segment: s.segment, item: s.item }
    const real = w.__e2eStore
    const entry = (s.queue as unknown[])[s.index as number] ?? (real.queue as unknown[])[0]
    const next: Record<string, unknown> = {}
    if (patch.chapters) next.chapters = patch.chapters === 'none' ? [] : real.chapters
    if (patch.queue) next.queue = patch.queue === 'single' ? [entry] : patch.queue === 'three' ? [entry, entry, entry] : real.queue
    if (patch.segment) next.segment = patch.segment === 'none' ? null : patch.segment === 'intro' ? { segment: { Id: 'e2e', Type: 'Intro', StartTicks: 0, EndTicks: 1 }, interacted: true } : real.segment
    if (patch.favorite) next.item = patch.favorite === 'none' ? { ...(real.item as object), ExtraType: 'Trailer' } : real.item
    if (patch.pip) document.querySelector('video')!.disablePictureInPicture = patch.pip === 'none'
    store.setState(next)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  }, patch)
}

/** Alpha of black over the picture along a vertical line of the window, per CSS pixel row, measured on a white frame. */
async function darkeningAlong(page: Page, x: number) {
  const { h, ratio } = await page.evaluate(() => ({ h: innerHeight, ratio: devicePixelRatio }))
  const png = (await page.screenshot({ clip: { x, y: 0, width: 1, height: h } })).toString('base64')
  const values = await page.evaluate(async (data) => {
    const img = new Image()
    img.src = `data:image/png;base64,${data}`
    await img.decode()
    const canvas = new OffscreenCanvas(img.width, img.height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, 1, img.height).data
    const out: number[] = []
    for (let i = 0; i < d.length; i += 4) out.push(1 - Math.max(d[i], d[i + 1], d[i + 2]) / 255)
    return out
  }, png)
  /** alpha at a CSS y */
  return (y: number) => values[Math.min(values.length - 1, Math.max(0, Math.round(y * ratio)))]
}

/** Replaces the picture by a white frame (and gives it back): what the controls paint over it can then be measured. */
async function whiteFrame(page: Page, on: boolean) {
  await page.evaluate((on) => {
    const video = document.querySelector('video')!
    video.style.visibility = on ? 'hidden' : ''
    for (let el: HTMLElement | null = video.parentElement; el; el = el.parentElement) {
      el.style.background = on ? '#fff' : ''
      if (getComputedStyle(el).position === 'fixed') break
    }
  }, on)
}

/** Hides the controls when they show (Escape with hidden controls would leave the player). */
async function hideControls(page: Page) {
  if (await page.locator(strip).isVisible()) await page.keyboard.press('Escape')
  await expect(page.locator(strip)).toBeHidden()
}

/** A box may be this far (CSS px) from where it belongs: layout rounding at a fractional device pixel ratio. */
const EDGE = 0.5

/**
 * The player's geometry against the window. `boxes`: how far each side of the <video>, of the box that holds it
 * and of every box around that, up to the player's root (the fixed one), is from the window's edge: all zero when
 * the player is exactly the window. `picture`: the same for the film's picture, which `object-fit: contain` centres
 * in the <video> at the file's own shape (`ratio` = videoWidth / videoHeight, non-square pixels included).
 */
function playerGeometry(page: Page) {
  return page.evaluate(() => {
    const video = document.querySelector('video')!
    const margins = (r: { left: number; top: number; right: number; bottom: number }) => ({ left: r.left, top: r.top, right: innerWidth - r.right, bottom: innerHeight - r.bottom })
    const boxes: Array<{ name: string; left: number; top: number; right: number; bottom: number }> = []
    for (let el: HTMLElement | null = video; el; el = el.parentElement) {
      boxes.push({ name: `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') ?? '').split(' ')[0]}`, ...margins(el.getBoundingClientRect()) })
      if (getComputedStyle(el).position === 'fixed') break
    }
    const v = video.getBoundingClientRect()
    const cs = getComputedStyle(video)
    const ratio = video.videoWidth / video.videoHeight
    const width = Math.min(v.width, v.height * ratio)
    const height = Math.min(v.height, v.width / ratio)
    const left = v.left + (v.width - width) / 2
    const top = v.top + (v.height - height) / 2
    const html = getComputedStyle(document.documentElement)
    // padding and border of the <video> would move the picture inside its box
    const inset = ['padding-left', 'padding-right', 'padding-top', 'padding-bottom', 'border-left-width', 'border-right-width', 'border-top-width', 'border-bottom-width']
    return {
      window: { width: innerWidth, height: innerHeight },
      boxes,
      fit: cs.objectFit,
      videoInset: inset.reduce((sum, p) => sum + parseFloat(cs.getPropertyValue(p)), 0),
      ratio,
      picture: margins({ left, top, right: left + width, bottom: top + height }),
      page: { scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, gutter: html.scrollbarGutter, overflowY: html.overflowY },
    }
  })
}

/**
 * The player is the whole window: its root, the video box and the <video> have no margin on any side, and the
 * page under it neither scrolls nor keeps room for a scrollbar (a fixed box ends where a scrollbar's room starts;
 * the suite's browsers hide scrollbars, so the room is asserted through the style that would reserve it).
 * With the default scale mode ("Fit") the picture is as large as the window allows at the file's shape, centred.
 */
async function expectPlayerIsWindow(page: Page, label: string) {
  const off = (b: { left: number; top: number; right: number; bottom: number }) => Math.max(Math.abs(b.left), Math.abs(b.top), Math.abs(b.right), Math.abs(b.bottom))
  await expect
    .poll(async () => (await playerGeometry(page)).boxes.filter((b) => off(b) > EDGE).map((b) => `${b.name}: left ${b.left}, top ${b.top}, right ${b.right}, bottom ${b.bottom}`), {
      message: `${label}: boxes of the player that are not exactly the window`,
    })
    .toEqual([])
  const g = await playerGeometry(page)
  expect(g.boxes.length, `${label}: the <video>, its box and the player's root`).toBeGreaterThanOrEqual(3)
  expect(g.page.scrollWidth, `${label}: the page does not scroll sideways`).toBeLessThanOrEqual(g.window.width)
  expect(g.page.scrollHeight, `${label}: the page does not scroll`).toBeLessThanOrEqual(g.window.height)
  expect(g.page.gutter, `${label}: no room kept for a scrollbar`).not.toContain('stable')
  expect(g.page.overflowY, `${label}: no scrollbar forced on the page`).not.toBe('scroll')
  expect(g.fit, `${label}: scale mode Fit`).toBe('contain')
  expect(g.videoInset, `${label}: padding and border of the <video>`).toBe(0)
  const barX = Math.max(0, (g.window.width - g.window.height * g.ratio) / 2)
  const barY = Math.max(0, (g.window.height - g.window.width / g.ratio) / 2)
  expect(Math.abs(g.picture.left - barX), `${label}: picture, left edge (bar of ${barX})`).toBeLessThanOrEqual(EDGE)
  expect(Math.abs(g.picture.right - barX), `${label}: picture, right edge (bar of ${barX})`).toBeLessThanOrEqual(EDGE)
  expect(Math.abs(g.picture.top - barY), `${label}: picture, top edge (bar of ${barY})`).toBeLessThanOrEqual(EDGE)
  expect(Math.abs(g.picture.bottom - barY), `${label}: picture, bottom edge (bar of ${barY})`).toBeLessThanOrEqual(EDGE)
  return { ...g, barX, barY }
}

/** Mean brightness (0..255) of the outermost line of pixels along each edge of the window, as it is painted. */
async function edgeBrightness(page: Page) {
  const png = (await page.screenshot()).toString('base64')
  return page.evaluate(async (data) => {
    const img = new Image()
    img.src = `data:image/png;base64,${data}`
    await img.decode()
    const canvas = new OffscreenCanvas(img.width, img.height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const mean = (x: number, y: number, w: number, h: number) => {
      const d = ctx.getImageData(x, y, w, h).data
      let sum = 0
      for (let i = 0; i < d.length; i += 4) sum += Math.max(d[i], d[i + 1], d[i + 2])
      return sum / (d.length / 4)
    }
    return { left: mean(0, 0, 1, img.height), right: mean(img.width - 1, 0, 1, img.height), top: mean(0, 0, img.width, 1), bottom: mean(0, img.height - 1, img.width, 1) }
  }, png)
}

// ---------------------------------------------------------------------------------------------------------------

test.describe('player layout: the picture and the control strip', () => {
  test('nothing darkens the picture while the controls show; the dim preference brings the TV scrim back', { tag: [TAG.writes] }, async ({ page, app, api }) => {
    const item = await api.findMovie('Chapter Marathon')
    await api.snapshot(item.Id)
    await app.goto('/')
    await app.setPreference('controllerTimeout', 15_000)
    await playPaused(page, item, 40_000)

    // where the strip stands: its gradient starts one strip height above it
    await showControlsWithMouse(page)
    const measured = await stripShare(page)
    const zoneTop = measured.top - measured.height
    // the bare, paused picture
    await hideControls(page)
    // away from the middle (the pause mark), from both strips and from where the pointer rests; at the left, clear
    // of the panel opened below
    const at = [0.2, 0.42] as const
    const bare = await pictureSample(page, ...at)
    // the last 48 rows of the picture above the bottom gradient
    const aboveZone = [0.7, (zoneTop - 49) / measured.window] as const
    const bareAboveZone = await pictureSample(page, ...aboveZone)

    await showControlsWithMouse(page)
    await expect(page.locator('[data-player-top]')).toBeVisible()
    // the picture under the pointer is the same picture: no veil, and nothing with a background over the video
    expect(await paintOverPicture(page, ...at)).toEqual([])
    expect(await paintOverPicture(page, 0.7, 0.6)).toEqual([])
    expect(await pictureSample(page, ...at)).toBe(bare)
    // right down to where the strip's gradient begins
    expect(await pictureSample(page, ...aboveZone), 'the picture just above the gradient').toBe(bareAboveZone)

    // a panel does not darken it either (the chapters panel stands at the right; the sample is at the left)
    await button(page, 'chapters').click()
    await expect(panel(page, 'chapters')).toBeVisible()
    const panelLeft = await page.locator('[data-player-sheet] [role="dialog"]').evaluate((el) => el.getBoundingClientRect().left / innerWidth)
    expect(panelLeft, 'the open panel is clear of the sampled square').toBeGreaterThan(at[0] + 0.1)
    expect(await pictureSample(page, ...at)).toBe(bare)
    await page.keyboard.press('Escape')
    await expect(panel(page, 'chapters')).toBeHidden()

    // only the two strips have a dark background of their own
    expect((await paintOverPicture(page, 0.5, 0.01)).length).toBeGreaterThan(0)
    expect((await paintOverPicture(page, 0.5, 0.99)).length).toBeGreaterThan(0)

    // ---- the bottom strip's gradient (owner request: no visible upper edge), measured on a white frame along a
    // line inside the strip's side padding, where no control is drawn
    const gradient = async (label: string) => {
      await whiteFrame(page, true)
      const s = await stripShare(page)
      const topStripBottom = await page.locator('[data-player-top]').evaluate((el) => el.getBoundingClientRect().bottom)
      const alpha = await darkeningAlong(page, 3)
      await whiteFrame(page, false)
      // one strip height above the strip
      const start = s.top - s.height
      // nothing at all between the top strip and the gradient's start
      for (let y = Math.ceil(topStripBottom) + 2; y < start - 1; y++) expect(alpha(y), `${label}: black over the picture at y=${y} (above the gradient)`).toBeLessThanOrEqual(0.005)
      // it starts thin, is light at the strip's top edge and dark at the window's bottom edge
      expect(alpha(start + 2), `${label}: at the gradient start`).toBeLessThanOrEqual(0.02)
      expect(alpha(start + s.height / 4), `${label}: a quarter of the way to the strip`).toBeLessThanOrEqual(0.12)
      expect(alpha(s.top), `${label}: at the strip's top edge`).toBeGreaterThanOrEqual(0.2)
      expect(alpha(s.top), `${label}: at the strip's top edge`).toBeLessThanOrEqual(0.36)
      expect(alpha(s.window - 1), `${label}: at the window's bottom edge`).toBeGreaterThanOrEqual(0.79)
      expect(alpha(s.window - 1), `${label}: at the window's bottom edge`).toBeLessThanOrEqual(0.86)
      // it only gets darker downward, and nowhere by a step the eye takes for a line (the old strip began with a
      // step of 30 %; a smooth fall over two strip heights is under 2 % a pixel row at these sizes)
      for (let y = Math.floor(start) - 2; y < s.window - 1; y++) {
        expect(alpha(y + 1), `${label}: darker or equal below y=${y}`).toBeGreaterThanOrEqual(alpha(y) - 0.005)
        expect(alpha(y + 1) - alpha(y), `${label}: step at y=${y}`).toBeLessThanOrEqual(0.03)
      }
      return { s, alpha }
    }
    const { s, alpha } = await gradient('1440x900')
    expect(Math.abs(s.top - measured.top), 'the strip stands where it was measured').toBeLessThanOrEqual(0.5)
    // the part of the gradient above the strip takes no pointer: a click there is a click on the picture
    const abovePoint = { x: Math.round(await page.evaluate(() => innerWidth * 0.5)), y: Math.round(s.top - 10) }
    expect(alpha(abovePoint.y), 'the click point lies in the gradient').toBeGreaterThan(0.1)
    expect(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[data-player-strip], [data-player-top]'), abovePoint)).toBe(false)
    const isPaused = () => page.locator('video').evaluate((v: HTMLVideoElement) => v.paused)
    await page.mouse.click(abovePoint.x, abovePoint.y)
    await expect.poll(isPaused, { message: 'a click just above the strip plays the picture' }).toBe(false)
    await page.mouse.click(abovePoint.x, abovePoint.y)
    await expect.poll(isPaused, { message: 'and the next one pauses it' }).toBe(true)
    // the same gradient over a large window and over the two-row strip of a phone in portrait
    for (const size of [
      { w: 2558, h: 1328 },
      { w: 390, h: 844 },
    ]) {
      await page.setViewportSize({ width: size.w, height: size.h })
      await showControlsWithMouse(page)
      await gradient(`${size.w}x${size.h}`)
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await showControlsWithMouse(page)

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

    const sizes: Array<{ w: number; h: number; desktop?: boolean; wide16x9?: boolean; portrait?: boolean }> = [
      { w: 1280, h: 720, desktop: true, wide16x9: true },
      { w: 1920, h: 1080, desktop: true, wide16x9: true },
      { w: 2560, h: 1440, desktop: true, wide16x9: true },
      { w: 2560, h: 1080, desktop: true },
      { w: 2558, h: 1328, desktop: true },
      { w: 3440, h: 1440, desktop: true },
      { w: 1440, h: 900, desktop: true },
      { w: 1024, h: 600 },
      { w: 700, h: 900 },
      { w: 844, h: 390 },
      { w: 640, h: 360 },
      { w: 390, h: 844, portrait: true },
      { w: 360, h: 740, portrait: true },
      { w: 360, h: 640, portrait: true },
    ]
    for (const size of sizes) {
      const label = `${size.w}x${size.h}`
      await page.setViewportSize({ width: size.w, height: size.h })
      await showControlsWithMouse(page)
      // the strip lies over the player and takes no room from it: the video box is the window, and the wide film
      // reaches its left and right edges
      const g = await expectPlayerIsWindow(page, label)
      // (a 3440x1440 window is a hair wider than the film)
      if (size.w / size.h < ratio) expect(g.barX, `${label}: a 2.39:1 film reaches the left and right edges`).toBe(0)
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
      // every button is whole inside the window and inside the strip, no two overlap, the order is the fixed one,
      // settings stands on the left padding and the last button on the right one, the transport is centred; one
      // row of buttons, two on a phone in portrait
      const l = await stripLayout(page)
      expect(l.buttons.map((x) => x.name), label).toEqual(expect.arrayContaining([...TRANSPORT, 'settings', 'subtitles', 'audio', 'favorite', 'volume']))
      expectStripRules(l, label, { rows: size.portrait ? 2 : 1 })
      // the seek bar and both times are part of the strip
      await expect(page.locator(`${strip} [data-seekbar]`)).toBeVisible()
      await expect(page.locator(`${strip} [data-player-time="elapsed"]`)).toBeVisible()
      await expect(page.locator(`${strip} [data-player-time="remaining"]`)).toBeVisible()
    }

    // title and "Ends at" kept their places: the top strip, and the button row between the left group and the
    // transport
    await page.setViewportSize({ width: 1280, height: 720 })
    await showControlsWithMouse(page)
    await expect(page.locator('[data-player-top]')).toContainText('Coffee Run')
    await expect(page.locator(strip)).toContainText(/Ends at \d/)
    expect((await stripLayout(page)).endsAt, '"Ends at" shows in a wide row').not.toBeNull()
    await leavePlayer(page)
  })
})

test.describe('player layout: the player is the whole window', () => {
  test('the video box has no margin at any window size, interface scale, pixel ratio or in fullscreen, and a 16:9 film in a 16:9 window touches all four edges', { tag: [TAG.writes] }, async ({ page, app, api }) => {
    test.setTimeout(120_000)
    // a file that is 16:9 with square pixels (the generated clips of the test server are 1280x720 shown as 1280x725)
    const item = await api.findMovie('Big Buck Bunny')
    await api.snapshot(item.Id)
    await app.goto('/')
    await app.setPreference('controllerTimeout', 15_000)
    await page.setViewportSize({ width: 1280, height: 720 })
    // 20 s in: a bright frame from edge to edge
    await playPaused(page, item, 20_000)
    const file = await page.locator('video').evaluate((v: HTMLVideoElement) => ({ w: v.videoWidth, h: v.videoHeight }))
    expect(file.w * 9, 'the file is 16:9').toBe(file.h * 16)
    await expect(page.locator(strip)).toBeHidden({ timeout: 20_000 })

    // every resize is followed: 16:9 windows (the film touches all four edges), windows a pixel or a toolbar away
    // from 16:9, 16:10, phones in both orientations
    const sizes: Array<{ w: number; h: number; wide16x9?: boolean }> = [
      { w: 1280, h: 720, wide16x9: true },
      { w: 1920, h: 1080, wide16x9: true },
      { w: 2560, h: 1440, wide16x9: true },
      { w: 2558, h: 1439 },
      { w: 2558, h: 1328 },
      { w: 1440, h: 900 },
      { w: 844, h: 390 },
      { w: 390, h: 844 },
      { w: 360, h: 640 },
    ]
    for (const size of sizes) {
      const label = `${size.w}x${size.h}`
      await page.setViewportSize({ width: size.w, height: size.h })
      const bare = await expectPlayerIsWindow(page, `${label}, bare video`)
      if (size.wide16x9) expect([bare.barX, bare.barY], `${label}: no bar on any side`).toEqual([0, 0])
      // the two strips lie over the picture: showing them moves nothing
      await showControlsWithMouse(page)
      await expectPlayerIsWindow(page, `${label}, controls shown`)
      await hideControls(page)
    }

    // the same in what is painted: the outermost pixels of a 16:9 window are picture on all four sides, and in a
    // 16:10 window the black bars are above and below only
    for (const size of [
      { w: 1280, h: 720 },
      { w: 1920, h: 1080 },
    ]) {
      await page.setViewportSize({ width: size.w, height: size.h })
      await expectPlayerIsWindow(page, `${size.w}x${size.h}`)
      const edge = await edgeBrightness(page)
      for (const side of ['left', 'right', 'top', 'bottom'] as const) expect(edge[side], `${size.w}x${size.h}: picture on the ${side} edge`).toBeGreaterThan(60)
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await expectPlayerIsWindow(page, '1440x900')
    const letterboxed = await edgeBrightness(page)
    expect(letterboxed.top, '16:10 window: a black bar above the picture').toBeLessThan(8)
    expect(letterboxed.bottom, '16:10 window: a black bar below the picture').toBeLessThan(8)

    // the interface scale sizes the controls, never the player
    for (const size of [
      { w: 1920, h: 1080 },
      { w: 390, h: 844 },
    ]) {
      await page.setViewportSize({ width: size.w, height: size.h })
      for (const scale of [50, 150, 200]) {
        const label = `${size.w}x${size.h}, interface scale ${scale} %`
        await app.setPreference('webInterfaceScale', scale)
        await expectPlayerIsWindow(page, `${label}, bare video`)
        await showControlsWithMouse(page)
        await expectPlayerIsWindow(page, `${label}, controls shown`)
        await hideControls(page)
      }
      await app.setPreference('webInterfaceScale', 100)
    }

    // fullscreen (F) and back
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.keyboard.press('f')
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true)
    await expectPlayerIsWindow(page, 'fullscreen')
    await page.keyboard.press('f')
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false)
    await expectPlayerIsWindow(page, 'after fullscreen')

    // display scaling of 125 % and 150 % (a fractional device pixel ratio), with an odd window size
    const cdp = await page.context().newCDPSession(page)
    for (const ratio of [1.25, 1.5]) {
      for (const size of [
        { w: 2558, h: 1439 },
        { w: 1440, h: 900 },
      ]) {
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: ratio, mobile: false })
        await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio])).toEqual([size.w, size.h, ratio])
        await expectPlayerIsWindow(page, `${size.w}x${size.h} at device pixel ratio ${ratio}`)
      }
    }
    await cdp.send('Emulation.clearDeviceMetricsOverride')
    await cdp.detach()
    await page.setViewportSize({ width: 1280, height: 720 })
    await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio])).toEqual([1280, 720, 1])
    await expectPlayerIsWindow(page, 'back at 1280x720')

    await leavePlayer(page)
  })
})

test.describe('player layout: chapters and queue panels', () => {
  test('mouse: the Chapters button opens a panel on the strip, above it at the right; choosing a chapter seeks; outside press and the button close it', { tag: [TAG.writes] }, async ({ page, app, api }) => {
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

    // on the strip, at the right (above its button), not wider than half the window; the strip stays up under it
    await expect(page.locator('[data-player-sheet]')).toHaveAttribute('data-player-sheet', 'bottom-right')
    const box = await page.locator('[data-player-sheet] [role="dialog"]').evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, window: innerWidth }
    })
    const s = await stripShare(page)
    expect(box.bottom).toBeLessThanOrEqual(s.top)
    expect(box.width).toBeLessThanOrEqual(box.window / 2)
    expect(box.right).toBeLessThanOrEqual(box.window)
    expect(box.right).toBeGreaterThan(box.window - 24)
    expect(box.left).toBeGreaterThan(box.window / 2 - 24)
    const opener = (await button(page, 'chapters').boundingBox())!
    expect(opener.x, 'the panel stands above its button').toBeGreaterThanOrEqual(box.left)
    expect(opener.x + opener.width).toBeLessThanOrEqual(box.right)
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
    // Where the pause landed, a segment of the episode (its intro) may still run: the floating Skip button then
    // has the focus and Enter would skip instead of showing the controls. Back dismisses that button first.
    const pausedAt = await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)
    const segments = (await api.get<{ Items?: { StartTicks?: number; EndTicks?: number }[] }>(`/MediaSegments/${first.Id}`)).Items ?? []
    if (segments.some((s) => pausedAt >= (s.StartTicks ?? 0) / 10_000_000 && pausedAt < (s.EndTicks ?? 0) / 10_000_000)) {
      await expect(page.locator('[data-skip-segment]')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.locator('[data-skip-segment]')).toBeHidden()
    }

    const focusedName = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.playerButton ?? (document.activeElement?.hasAttribute('data-seekbar') ? 'seek' : null))

    // Enter shows the controls with Play focused, as OK does on the TV
    await page.keyboard.press('Enter')
    await expect(button(page, 'play')).toBeFocused()

    // Right walks the row to its right end, Left back to its left end: every button of the strip takes focus,
    // the favourite button too, in the order they stand in
    const layout = await stripLayout(page)
    expectStripRules(layout, 'an episode with chapters and a queue', { rows: 1 })
    const all = layout.buttons.map((b) => b.name)
    expect(all).toEqual(expect.arrayContaining(['chapters', 'queue', 'favorite']))
    // the row an episode with chapters and a queue has, as it is drawn: volume is the transport's neighbour at the
    // left and subtitles the one at the right
    const pictureInPicture = all.includes('pip') ? ['pip'] : []
    expect(all, 'the drawn order').toEqual(['settings', 'favorite', ...pictureInPicture, 'volume', ...TRANSPORT, 'subtitles', 'audio', 'chapters', 'queue', 'fullscreen'])
    const walk = async (key: 'ArrowRight' | 'ArrowLeft' | 'Tab', presses: number) => {
      const names: string[] = []
      for (let i = 0; i < presses; i++) {
        await page.keyboard.press(key)
        const name = await focusedName()
        // null: the Skip button of a running segment, which stands between the transport and the right group
        if (name && names[names.length - 1] !== name) names.push(name)
      }
      return names
    }
    const fromPlay = all.slice(all.indexOf('play') + 1)
    expect(await walk('ArrowRight', fromPlay.length + 2), 'Right from Play').toEqual(fromPlay)
    expect(await focusedName()).toBe(all[all.length - 1])
    expect(await walk('ArrowLeft', all.length + 2), 'Left from the last button').toEqual(all.slice(0, -1).reverse())
    expect(await focusedName()).toBe('settings')
    // back to the middle for the next step
    await button(page, 'play').focus()

    // Up: the seek bar, then the Back button of the top strip
    await page.keyboard.press('ArrowUp')
    await expect(page.locator('[data-seekbar]')).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(button(page, 'back')).toBeFocused()
    // Down from Back lands on the control under it (the seek bar or, at the start edge, the first button)
    await page.keyboard.press('ArrowDown')
    expect(['seek', ...all]).toContain(await focusedName())

    // Tab walks the same controls from left to right (and the Skip button of the intro segment, when one is
    // running): Back, the seek bar, then the row in its drawn order
    await button(page, 'back').focus()
    expect(await walk('Tab', all.length + 2), 'Tab from Back').toEqual(['seek', ...all])

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

test.describe('player layout: fixed positions in every language', () => {
  test('English and Hebrew: every button at the same place in every window; sheets above their buttons; clock times; the title right after Back', { tag: [TAG.writes] }, async ({ page, app, api }) => {
    test.setTimeout(300_000)
    const item = await api.findMovie('Chapter Marathon')
    await api.snapshot(item.Id)
    await app.goto('/')
    await app.setPreference('controllerTimeout', 15_000)
    await page.setViewportSize({ width: 1280, height: 720 })
    await playPaused(page, item, 40_000)

    type Lang = 'en' | 'he'
    const LANGS: Lang[] = ['en', 'he']
    const language = async (lang: Lang) => {
      await app.setPreference('userInterfaceLanguage', lang)
      await expect(page.locator('html')).toHaveAttribute('lang', lang)
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).direction)).toBe(lang === 'he' ? 'rtl' : 'ltr')
    }
    const resize = async (w: number, h: number) => {
      await page.setViewportSize({ width: w, height: h })
      await showControlsWithMouse(page)
    }

    // ---- the strip in every window, with the buttons an item can have: none of the optional ones, chapters and
    // a queue, and a running segment (its Skip button) besides
    const sizes: Array<{ w: number; h: number; rows: 1 | 2 }> = [
      { w: 360, h: 740, rows: 2 },
      { w: 390, h: 844, rows: 2 },
      { w: 700, h: 900, rows: 1 },
      { w: 844, h: 390, rows: 1 },
      { w: 1280, h: 720, rows: 1 },
      { w: 1920, h: 1080, rows: 1 },
      { w: 2558, h: 1328, rows: 1 },
      { w: 3440, h: 1440, rows: 1 },
    ]
    const states = {
      plain: { chapters: 'none', queue: 'single', segment: 'none' },
      full: { chapters: 'real', queue: 'three', segment: 'none' },
      skip: { chapters: 'real', queue: 'three', segment: 'intro' },
    } as const
    const seen = new Map<string, StripLayout>()
    const sweep = async (lang: Lang, list: typeof sizes, scale = 100) => {
      for (const size of list) {
        await resize(size.w, size.h)
        const at = `${size.w}x${size.h}${scale === 100 ? '' : ` at ${scale} %`}`
        for (const state of ['plain', 'full', 'skip'] as const) {
          await patchStore(page, states[state])
          const l = await stripLayout(page)
          const label = `${at}, ${lang}, ${state}`
          expect(l.buttons.map((b) => b.name), label).toEqual(expect.arrayContaining(state === 'plain' ? ['settings', 'favorite'] : ['chapters', 'queue', 'favorite']))
          expect(!!l.skip, `${label}: the Skip button`).toBe(state === 'skip')
          expectStripRules(l, label, { rows: size.rows })
          seen.set(`${at} ${state} ${lang}`, l)
        }
        const get = (state: string) => seen.get(`${at} ${state} ${lang}`)!
        // chapters and queue take their places in the right group between audio and fullscreen, which stays on
        // the right edge: subtitles and audio stand two places further left, and nothing else moves
        const [plain, full] = [get('plain'), get('full')]
        expect(moved(plain, full, [...LEFT_GROUP, ...TRANSPORT, 'fullscreen']), `${at}, ${lang}: buttons that moved when chapters and queue appeared`).toEqual([])
        const leftOf = (l: StripLayout, name: string) => l.buttons.find((b) => b.name === name)!.left
        // one place: a button and the gap to the next
        const place = leftOf(full, 'queue') - leftOf(full, 'chapters')
        expect(Math.abs(leftOf(full, 'fullscreen') - leftOf(full, 'queue') - place), `${at}, ${lang}: the places of the right group are equal`).toBeLessThanOrEqual(0.5)
        for (const name of ['subtitles', 'audio']) expect(Math.abs(leftOf(plain, name) - leftOf(full, name) - 2 * place), `${at}, ${lang}: ${name} stands two places further left with chapters and queue`).toBeLessThanOrEqual(1)
        // the Skip button takes its room beside the right group, which stays where it is, like the left group
        expect(moved(get('full'), get('skip'), [...LEFT_GROUP, ...RIGHT_GROUP]), `${at}, ${lang}: buttons that moved when the Skip button appeared`).toEqual([])
        // the seek line: elapsed time at its left, remaining at its right, in every language
        const l = get('full')
        expect(l.elapsed.right, `${at}, ${lang}: elapsed time left of the bar`).toBeLessThanOrEqual(l.seek.left + 0.5)
        expect(l.remaining!.left, `${at}, ${lang}: remaining time right of the bar`).toBeGreaterThanOrEqual(l.seek.right - 0.5)
      }
      await patchStore(page, { chapters: 'real', queue: 'real', segment: 'real' })
    }
    for (const lang of LANGS) {
      await language(lang)
      await sweep(lang, sizes)
    }
    // interface scale 50 % and 200 %: the same rules, on a desktop and on the two phones
    for (const scale of [50, 200]) {
      await app.setPreference('webInterfaceScale', scale)
      for (const lang of LANGS) {
        await language(lang)
        await sweep(lang, [sizes[0], sizes[1], sizes[5]], scale)
      }
    }
    await app.setPreference('webInterfaceScale', 100)
    // the same window in English and in Hebrew: every button, the Skip button and the seek line at the same place
    for (const [key, en] of seen) {
      if (!key.endsWith(' en')) continue
      const he = seen.get(key.replace(/ en$/, ' he'))!
      expect(moved(en, he), `${key}: buttons at another place in Hebrew`).toEqual([])
      expect(he.buttons.length, key).toBe(en.buttons.length)
      if (en.skip) expect(Math.abs(en.skip.right - he.skip!.right), `${key}: right edge of the Skip button`).toBeLessThanOrEqual(1)
      expect(Math.abs(en.seek.left - he.seek.left) + Math.abs(en.seek.right - he.seek.right), `${key}: the seek bar`).toBeLessThanOrEqual(1)
    }

    // ---- per language, in a desktop window
    const sheet = page.locator('[data-player-sheet] [role="dialog"]')
    const top = () =>
      page.evaluate(() => {
        const rect = (selector: string) => {
          const r = document.querySelector(selector)!.getBoundingClientRect()
          return { left: r.left, right: r.right }
        }
        return {
          window: innerWidth,
          dp: parseFloat(getComputedStyle(document.documentElement).fontSize) / 16,
          titles: rect('[data-player-titles]'),
          back: rect('[data-player-button="back"]'),
          pictures: document.querySelectorAll('[data-player-top] img').length,
        }
      })
    /** The physical side each button's sheet stands at, in every language: the side of the button itself. */
    const SHEET_SIDE = { settings: 'left', subtitles: 'right', audio: 'right', chapters: 'right', queue: 'right' } as const
    /** Checks where the open sheet of a button stands, and leaves it open. */
    const sheetStands = async (label: string, opener: keyof typeof SHEET_SIDE) => {
      const side = SHEET_SIDE[opener]
      const l = await stripLayout(page)
      const from = l.buttons.find((b) => b.name === opener)!
      await expect(page.locator('[data-player-sheet]'), `${label}: placement`).toHaveAttribute('data-player-sheet', `bottom-${side}`)
      const box = await sheet.evaluate((el) => {
        const r = el.getBoundingClientRect()
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
      })
      expect(box.left, `${label}: inside the window`).toBeGreaterThanOrEqual(0)
      expect(box.right, `${label}: inside the window`).toBeLessThanOrEqual(l.window.width + 0.5)
      expect(box.top, `${label}: inside the window`).toBeGreaterThanOrEqual(0)
      expect(box.bottom, `${label}: on the strip`).toBeLessThanOrEqual(l.strip.top + 0.5)
      // at its edge of the window, above its button
      if (side === 'left') {
        expect(box.left, `${label}: at the left edge`).toBeLessThanOrEqual(12 * l.dp)
        if (l.window.width >= 1000) expect(box.right, `${label}: in the left half`).toBeLessThanOrEqual(l.window.width / 2 + 24)
      } else {
        expect(l.window.width - box.right, `${label}: at the right edge`).toBeLessThanOrEqual(12 * l.dp)
        if (l.window.width >= 1000) expect(box.left, `${label}: in the right half`).toBeGreaterThanOrEqual(l.window.width / 2 - 24)
      }
      expect((from.left + from.right) / 2, `${label}: above its button`).toBeGreaterThan(box.left)
      expect((from.left + from.right) / 2, `${label}: above its button`).toBeLessThan(box.right)
    }
    const titleStart: Partial<Record<string, number>> = {}
    for (const lang of LANGS) {
      await language(lang)
      await patchStore(page, { chapters: 'real', queue: 'three', segment: 'intro' })

      for (const size of [
        { w: 1280, h: 720 },
        { w: 360, h: 740 },
      ]) {
        await resize(size.w, size.h)
        const at = `${size.w}x${size.h}, ${lang}`

        // the sheets and panels stand at the physical side of the button that opens them, above it: settings (and
        // its speed, scale and bitrate sheets) at the left; subtitles, audio, chapters and queue at the right
        for (const opener of ['settings', 'subtitles', 'audio', 'chapters', 'queue'] as const) {
          await showControlsWithMouse(page)
          await button(page, opener).click()
          await expect(sheet).toBeVisible()
          await sheetStands(`${at}: the sheet of ${opener}`, opener)
          if (opener === 'settings') {
            // its own sheets stand at the same place: speed and scale return to Settings, bitrate closes
            for (const row of ['playback_speed', 'video_scale', 'max_bitrate']) {
              await sheet.getByText(uiText(lang, row), { exact: true }).click()
              await expect(sheet.getByRole('menuitemradio').first()).toBeVisible()
              await sheetStands(`${at}: ${row}`, opener)
              await page.keyboard.press('Escape')
              if (row !== 'max_bitrate') await expect(sheet.getByText(uiText(lang, 'max_bitrate'), { exact: true })).toBeVisible()
            }
          } else await page.keyboard.press('Escape')
          await expect(sheet).toBeHidden()
        }

        // the title stands right after Back, close to the start edge (the top strip mirrors with the language);
        // no logo picture stands between them
        const t = await top()
        const start = lang === 'he' ? t.window - t.titles.right : t.titles.left
        const backStart = lang === 'he' ? t.window - t.back.right : t.back.left
        const backEnd = lang === 'he' ? t.window - t.back.left : t.back.right
        expect(t.pictures, `${at}: pictures in the top strip`).toBe(0)
        expect(backStart / t.dp, `${at}: Back from the edge, in dp`).toBeGreaterThanOrEqual(3.5)
        expect(backStart / t.dp, `${at}: Back from the edge, in dp`).toBeLessThanOrEqual(8)
        expect((start - backEnd) / t.dp, `${at}: Back to the title, in dp`).toBeGreaterThanOrEqual(0)
        expect((start - backEnd) / t.dp, `${at}: Back to the title, in dp`).toBeLessThanOrEqual(6)
        // 64dp before (12 + 40 + 12), and up to 204dp with a logo
        expect(start / t.dp, `${at}: title from the edge, in dp`).toBeLessThanOrEqual(52)
        titleStart[`${size.w} ${lang}`] = start
      }

      await resize(1280, 720)
      // the texts of the row keep the language's direction inside their boxes; the row itself never mirrors
      const directions = await page.evaluate(() => {
        const dir = (selector: string) => getComputedStyle(document.querySelector(selector)!).direction
        return { row: dir('[data-player-group="left"]'), endsAt: dir('[data-player-ends-at]'), skip: dir('[data-player-skip]'), times: [dir('[data-player-time="elapsed"]'), dir('[data-player-time="remaining"]')] }
      })
      const own = lang === 'he' ? 'rtl' : 'ltr'
      expect(directions).toEqual({ row: 'ltr', endsAt: own, skip: own, times: ['ltr', 'ltr'] })

      // the volume slider opens at the right of its button, which stays under the pointer, over the place of
      // "Ends at": whole in this window, and nothing moves for it (every rule of it: expectVolumeSlider)
      const { slider: volumeSlider } = await expectVolumeSlider(page, `1280x720, ${lang}, volume slider`, { rows: 1, full: true })
      expect(volumeSlider.control.width, `${lang}: the slider control itself`).toBeGreaterThan(60)
      await showControlsWithMouse(page)

      // ---- the times: clocks, left to right, the minus in front, and a seek bar that keeps its length
      const elapsed = page.locator('[data-player-time="elapsed"]')
      const remaining = page.locator('[data-player-time="remaining"]')
      const duration = await page.locator('video').evaluate((v: HTMLVideoElement) => v.duration)
      const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2, '0')}`
      expect(duration, 'the test film is a few minutes long').toBeGreaterThan(60)
      expect(duration).toBeLessThan(600)
      // As if the film were an hour longer (the store's duration, written again after every seek, which reads the
      // real one): the remaining time then loses characters on the way ("-1:00:33" early, "-58:5x" near the end).
      const setDuration = (ms: number) => page.evaluate((ms) => (window as unknown as { __playback: DevPlayback }).__playback.store.setState({ durationMs: ms }), ms)
      const widths: number[] = []
      const lengths = new Set<number>()
      // 0:07, a time near the real end, and one second later
      const late = Math.floor(duration) - 15
      for (const second of [7, late, late + 1]) {
        await page.evaluate((ms) => (window as unknown as { __playback: DevPlayback }).__playback.engine.seekTo(ms), second * 1000 + 300)
        await expect(elapsed, `${lang}: elapsed time`).toHaveText(clock(second))
        await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.seeking)).toBe(false)
        await setDuration(3_600_000 + 40_000)
        await expect(remaining, `${lang}: remaining time of the longer film`).toHaveText(second < 40 ? /^-1:00:\d\d$/ : /^-5\d:\d\d$/)
        expect(await elapsed.textContent()).toMatch(/^\d+:\d\d(:\d\d)?$/)
        expect(await remaining.textContent()).toMatch(/^-\d+:\d\d(:\d\d)?$/)
        lengths.add((await remaining.textContent())!.length)
        // drawn in reading order from the left: the minus first, also in Hebrew
        expect(await app.drawnText(elapsed)).toBe(await elapsed.textContent())
        expect(await app.drawnText(remaining)).toBe(await remaining.textContent())
        const m = await page.evaluate(() => {
          const textWidth = (el: Element) => {
            const range = document.createRange()
            range.selectNodeContents(el)
            return range.getBoundingClientRect().width
          }
          const time = (name: string) => document.querySelector(`[data-player-time="${name}"]`)!
          return {
            seek: document.querySelector('[data-seekbar]')!.getBoundingClientRect().width,
            room: [time('elapsed'), time('remaining')].map((el) => el.getBoundingClientRect().width - textWidth(el)),
            equalDigits: [time('elapsed'), time('remaining')].map((el) => getComputedStyle(el).fontVariantNumeric),
          }
        })
        // the box of each time is the room kept for the item's longest text, not the width of the text shown
        for (const room of m.room) expect(room, `${lang}: room left in a time's box at ${clock(second)}`).toBeGreaterThanOrEqual(0)
        expect(m.equalDigits).toEqual(['tabular-nums', 'tabular-nums'])
        widths.push(m.seek)
      }
      expect([...lengths].sort(), 'the remaining time was shown as h:mm:ss and as mm:ss').toEqual([6, 8])
      await setDuration(Math.round(duration * 1000))
      expect(Math.max(...widths) - Math.min(...widths), `${lang}: the seek bar's length over three different times (${widths.join(', ')})`).toBeLessThanOrEqual(0.01)

      // the preview chip over the seek bar and the chapter list show clocks too
      const bar = (await page.locator('[data-seekbar]').boundingBox())!
      await page.mouse.move(bar.x + bar.width * 0.5, bar.y + bar.height / 2)
      const chip = page.locator('[data-player-preview-time]')
      await expect(chip).toHaveText(/^\d+:\d\d(:\d\d)?$/)
      expect(await app.drawnText(chip)).toBe(await chip.textContent())
      await showControlsWithMouse(page)
      await button(page, 'chapters').click()
      const second = panel(page, 'chapters').locator('[data-chapter="1"] [dir="ltr"]')
      await expect(second).toHaveText(/^\d+:\d\d(:\d\d)?$/)
      expect(await app.drawnText(second)).toBe(await second.textContent())
      await page.keyboard.press('Escape')
      await expect(sheet).toBeHidden()
      // the seek bar still says its position in words
      expect(await page.locator('[data-seekbar]').getAttribute('aria-valuetext')).not.toMatch(/^\d+:\d\d/)
    }
    // mirrored exactly: the title is as far from the right edge in Hebrew as from the left one in English
    for (const w of [1280, 360]) expect(Math.abs(titleStart[`${w} en`]! - titleStart[`${w} he`]!), `title start at ${w}px, en against he`).toBeLessThanOrEqual(0.5)

    await patchStore(page, { chapters: 'real', queue: 'real', segment: 'real' })
    await leavePlayer(page)
  })

  test('the volume slider opens at the right of its button, over the free part of the left side: no button and no Skip button moves or gives it room, "Ends at" is not drawn meanwhile, at interface scale 100 % and 200 %', { tag: [TAG.writes] }, async ({ page, app, api }) => {
    test.setTimeout(300_000)
    const item = await api.findMovie('Chapter Marathon')
    await api.snapshot(item.Id)
    await app.goto('/')
    await app.setPreference('controllerTimeout', 15_000)
    await page.setViewportSize({ width: 1280, height: 720 })
    await playPaused(page, item, 40_000)

    const slider = page.locator('[data-player-group="left"] [role="slider"]')
    const opened = page.locator('[data-volume-open]')
    const dp = () => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize) / 16)

    // ---- one row of buttons: the slider lies over the place of "Ends at" and is cut where the left side ends
    for (const scale of [100, 200]) {
      await app.setPreference('webInterfaceScale', scale)
      for (const lang of ['en', 'he'] as const) {
        await app.setPreference('userInterfaceLanguage', lang)
        await expect(page.locator('html')).toHaveAttribute('lang', lang)
        for (const size of [
          { w: 700, h: 900 },
          { w: 900, h: 600 },
          { w: 1000, h: 700 },
          { w: 1280, h: 720 },
          { w: 1920, h: 1080 },
        ]) {
          await page.setViewportSize({ width: size.w, height: size.h })
          for (const state of ['plain', 'full', 'skip'] as const) {
            const label = `${size.w}x${size.h} at ${scale} %, ${lang}, ${state}`
            await showControlsWithMouse(page)
            await patchStore(page, { chapters: state === 'plain' ? 'none' : 'real', queue: state === 'plain' ? 'single' : 'three', segment: state === 'skip' ? 'intro' : 'none' })
            // Without a Skip button every one of these rows has room for the whole slider, and so has a wide row
            // with one. In a narrower row the Skip button's place takes the room from the left side, and the
            // slider is cut where that side ends (accepted for now; the report lists how much of it shows).
            const full = state !== 'skip' || size.w / (await dp()) >= 1200
            const { before } = await expectVolumeSlider(page, label, { rows: 1, full })
            expect(!!before.skip, `${label}: the Skip button`).toBe(state === 'skip')
          }
        }
      }
    }
    // ---- the two-row strip of a narrow window used with a mouse: its second row can be full, so the slider lies
    // over the places at the left of volume, whose buttons (favourite and picture in picture) are not drawn
    // meanwhile; nothing moves at all
    for (const scale of [100, 200]) {
      await app.setPreference('webInterfaceScale', scale)
      for (const size of [
        { w: 390, h: 844 },
        { w: 360, h: 740 },
      ]) {
        const label = `${size.w}x${size.h} at ${scale} %, he, two rows`
        await page.setViewportSize({ width: size.w, height: size.h })
        await showControlsWithMouse(page)
        await patchStore(page, { chapters: 'real', queue: 'three', segment: 'intro' })
        const { open, slider: s } = await expectVolumeSlider(page, label, { rows: 2, full: true })
        expect(open.buttons.map((b) => b.name), `${label}: favourite and picture in picture are there`).toEqual(expect.arrayContaining(['favorite', 'pip']))
        // the first row is no part of it
        expect(s.skip, `${label}: the Skip button of the first row stays`).toEqual({ drawn: true, clickable: true, hit: true })
      }
    }
    await app.setPreference('webInterfaceScale', 100)
    // one of the two buttons absent (an item that cannot be marked; a browser without picture in picture): the
    // slider then reaches settings, which is not drawn meanwhile either
    for (const missing of ['favorite', 'pip'] as const) {
      const label = `390x844, he, two rows, no ${missing} button`
      await page.setViewportSize({ width: 390, height: 844 })
      await showControlsWithMouse(page)
      await patchStore(page, { chapters: 'real', queue: 'three', segment: 'intro', ...(missing === 'favorite' ? { favorite: 'none' } : { pip: 'none' }) })
      await expect(button(page, missing), `${label}: the button is gone`).toHaveCount(0)
      const { slider: s } = await expectVolumeSlider(page, label, { rows: 2, full: true })
      const present = missing === 'pip' ? 'favorite' : 'pip'
      expect(s.buttons.filter((b) => !b.drawn).map((b) => b.name).sort(), `${label}: the buttons that are not drawn under the slider`).toEqual([present, 'settings'].sort())
      await patchStore(page, missing === 'favorite' ? { favorite: 'real' } : { segment: 'intro', pip: 'real' })
      await expect(button(page, missing), `${label}: the button is back`).toHaveCount(1)
    }
    await app.setPreference('userInterfaceLanguage', 'en')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')

    // ---- a narrow window that is also short (a phone's split screen): two rows as well, at any interface scale.
    // One row there left a button no width at all at 200 %. The slider keeps the rules of the two-row strip.
    for (const scale of [100, 200]) {
      await app.setPreference('webInterfaceScale', scale)
      for (const size of [
        { w: 360, h: 400 },
        { w: 390, h: 420 },
        { w: 499, h: 360 },
      ]) {
        const label = `${size.w}x${size.h} at ${scale} %, narrow and short`
        await page.setViewportSize({ width: size.w, height: size.h })
        await showControlsWithMouse(page)
        await patchStore(page, { chapters: 'real', queue: 'three', segment: 'intro' })
        const l = await stripLayout(page)
        expectStripRules(l, label, { rows: 2 })
        for (const b of l.buttons) expect(b.width, `${label}: width of ${b.name}`).toBeGreaterThanOrEqual(20)
        expect((await sliderState(page)).overflow, `${label}: the strip does not scroll sideways`).toBeLessThanOrEqual(0)
        await expectVolumeSlider(page, `${label}, volume slider`, { rows: 2, full: true })
      }
    }
    await app.setPreference('webInterfaceScale', 100)

    // ---- the keyboard while the pointer rests on volume: Tab or an arrow pressed outside the slider closes it
    // first, so the arrows and Tab go past the slider's place to the next button and never stop inside it
    await page.setViewportSize({ width: 900, height: 600 })
    await showControlsWithMouse(page)
    await patchStore(page, { chapters: 'real', queue: 'three', segment: 'intro' })
    {
      const { at } = await expectVolumeSlider(page, 'keyboard at 900x600', { rows: 1, full: true })
      /** The pointer on the volume button, a few pixels from where it was: a slider that a key closed opens again. */
      const rest = async (dx: number) => {
        await page.mouse.move(at.x + dx, at.y + 1)
        await expect(opened, 'a mouse move on volume opens the slider').toHaveCount(1)
      }
      const skip = page.locator('[data-player-skip]')
      await rest(0)
      // the Skip button no longer answers to the slider (at 900 wide it once gave the slider its room and was not drawn)
      await expect(skip, 'the open slider leaves the Skip button drawn at 900 wide').toHaveCSS('opacity', '1')
      await expect(skip, 'and clickable').toHaveCSS('pointer-events', 'auto')
      // an arrow from picture in picture goes to volume
      await button(page, 'pip').focus()
      await page.keyboard.press('ArrowRight')
      await expect(opened, 'an arrow key closes the slider').toHaveCount(0)
      await expect(button(page, 'volume'), 'the arrow goes to volume').toBeFocused()
      // and the next one past the slider, open again, to the transport; back the same way
      await rest(2)
      await page.keyboard.press('ArrowRight')
      await expect(opened, 'an arrow key closes the slider').toHaveCount(0)
      await expect(button(page, 'previous'), 'the arrow goes past the slider to the transport').toBeFocused()
      await rest(4)
      await page.keyboard.press('ArrowLeft')
      await expect(opened, 'an arrow key closes the slider').toHaveCount(0)
      await expect(button(page, 'volume'), 'the arrow comes back past the slider to volume').toBeFocused()
      // Tab from volume does not enter the open slider, nor does Shift+Tab from the transport
      await rest(2)
      await page.keyboard.press('Tab')
      await expect(opened, 'Tab closes the slider').toHaveCount(0)
      await expect(button(page, 'previous'), 'Tab goes past the slider to the transport').toBeFocused()
      await rest(4)
      await page.keyboard.press('Shift+Tab')
      await expect(opened, 'Shift+Tab closes the slider').toHaveCount(0)
      await expect(button(page, 'volume'), 'Shift+Tab comes back past the slider to volume').toBeFocused()
      // Tab onto the Skip button closes it too, and the button is drawn
      await rest(2)
      await button(page, 'next').focus()
      await page.keyboard.press('Tab')
      await expect(skip, 'Tab reaches the Skip button').toBeFocused()
      await expect(opened, 'Tab closes the slider').toHaveCount(0)
      await expect(skip, 'the focused Skip button is drawn').toHaveCSS('opacity', '1')
      // keys pressed inside the slider are the slider's own: it stays open
      await rest(4)
      await slider.focus()
      const volumeBefore = await page.evaluate(() => document.querySelector('video')!.volume)
      await page.keyboard.press('ArrowLeft')
      await expect(opened, 'an arrow inside the slider keeps it open').toHaveCount(1)
      expect(await page.evaluate(() => document.querySelector('video')!.volume), 'the arrow changed the volume').not.toBe(volumeBefore)
      await page.keyboard.press('ArrowRight')
      await showControlsWithMouse(page)
      await expect(opened).toHaveCount(0)
    }
    // two rows: the open slider hides the buttons at the left of volume, and the key that goes there closes it
    // first, so focus never lands on a button that is not drawn
    await page.setViewportSize({ width: 390, height: 844 })
    await showControlsWithMouse(page)
    {
      const v = (await stripLayout(page)).buttons.find((b) => b.name === 'volume')!
      const at = { x: (v.left + v.right) / 2, y: (v.top + v.bottom) / 2 }
      await page.mouse.move(at.x, at.y)
      await expect(opened, 'two rows: the slider opens').toHaveCount(1)
      await expect(button(page, 'pip'), 'two rows: picture in picture is not drawn under the slider').toHaveCSS('opacity', '0')
      await button(page, 'volume').focus()
      await page.keyboard.press('ArrowLeft')
      await expect(opened, 'two rows: an arrow key closes the slider').toHaveCount(0)
      await expect(button(page, 'pip'), 'two rows: the arrow goes to picture in picture').toBeFocused()
      await expect(button(page, 'pip'), 'two rows: the focused button is drawn').toHaveCSS('opacity', '1')
      await page.mouse.move(at.x + 2, at.y + 1)
      await expect(opened, 'two rows: a mouse move opens the slider again').toHaveCount(1)
      await button(page, 'settings').focus()
      await page.keyboard.press('Tab')
      await expect(opened, 'two rows: Tab closes the slider').toHaveCount(0)
      await expect(button(page, 'favorite'), 'two rows: Tab reaches favourite').toBeFocused()
      await expect(button(page, 'favorite'), 'two rows: the focused button is drawn').toHaveCSS('opacity', '1')
      await showControlsWithMouse(page)
    }

    // ---- while it opens and while it closes (the suite removes every transition: here the real ones, each held
    // at shares of its length)
    await page.setViewportSize({ width: 900, height: 600 })
    await showControlsWithMouse(page)
    await patchStore(page, { chapters: 'real', queue: 'three', segment: 'intro' })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.evaluate(() => {
      document.querySelectorAll('style[data-e2e="no-animation"]').forEach((el) => el.remove())
      // a transition of the strip stops where it starts (the test moves it by hand): a slow machine cannot let
      // it run out between the pointer's move and the first measurement
      const hold = (e: Event) => {
        for (const a of (e.target as Element).getAnimations()) if (a instanceof CSSTransition) a.pause()
      }
      const strip = document.querySelector('[data-player-strip]')!
      strip.addEventListener('transitionrun', hold, true)
      ;(window as unknown as { __e2eRelease: () => void }).__e2eRelease = () => strip.removeEventListener('transitionrun', hold, true)
    })
    const before = await stripLayout(page)
    const v = before.buttons.find((b) => b.name === 'volume')!
    /** Every running transition of the strip, held at a share of its length: what changes, and of which element. */
    const holdAt = (share: number) =>
      page.evaluate((share) => {
        const strip = document.querySelector('[data-player-strip]')!
        const out: string[] = []
        for (const a of document.getAnimations()) {
          if (!(a instanceof CSSTransition) || !(a.effect instanceof KeyframeEffect) || !a.effect.target || !strip.contains(a.effect.target)) continue
          a.pause()
          a.currentTime = Number(a.effect.getComputedTiming().duration) * share
          const t = a.effect.target as HTMLElement
          const what = t.hasAttribute('data-player-volume-slider') ? 'the slider' : t.hasAttribute('data-player-ends-at') ? '"Ends at"' : t.dataset.playerButton ? `the ${t.dataset.playerButton} button` : `${t.tagName.toLowerCase()}.${String(t.getAttribute('class') ?? '').split(' ')[0]}`
          out.push(`${a.transitionProperty} of ${what}`)
        }
        return out.sort()
      }, share)
    const finish = () =>
      page.evaluate(() => {
        const strip = document.querySelector('[data-player-strip]')!
        for (const a of document.getAnimations()) if (a instanceof CSSTransition && a.effect instanceof KeyframeEffect && !!a.effect.target && strip.contains(a.effect.target)) a.finish()
      })
    // the slider's width and opacity, and the opacity of "Ends at"; besides them only the hover look of the volume
    // button: the Skip button's place gives up no room any more, so nothing of it is in transition
    const OWN = ['opacity of "Ends at"', 'opacity of the slider', 'width of the slider']
    const others = (held: string[]) => held.filter((x) => !OWN.includes(x) && !x.endsWith(' of the volume button'))
    /** What holds at every moment of the opening and of the closing. `usable`: the pointer is on the control. */
    const during = async (label: string, usable = false) => {
      const now = await stripLayout(page)
      const s = await sliderState(page)
      // along the part that is open already a pointer meets the slider, not the fading "Ends at"
      if (usable) expect(s.foreign, `${label}: what a pointer meets along the slider, other than the slider`).toEqual([])
      expect(displaced(before, now, TRANSPORT), `${label}: transport buttons that moved`).toEqual([])
      expect(displaced(before, now), `${label}: what moved`).toEqual([])
      expect(s.skip, `${label}: the Skip button stays drawn, takes clicks and lies under its own middle`).toEqual({ drawn: true, clickable: true, hit: true })
      expect(s.buttons.filter((b) => !b.drawn || !b.clickable || !b.hit).map((b) => b.name), `${label}: buttons that are not drawn, take no click or lie under something`).toEqual([])
      expect(s.overflow, `${label}: nothing scrolls sideways`).toBeLessThanOrEqual(0)
      expect(Math.abs(s.place.left - now.buttons.find((b) => b.name === 'volume')!.right), `${label}: the slider starts at the volume button's right edge`).toBeLessThanOrEqual(0.5)
      expect(s.visible.right, `${label}: the slider ends before the transport`).toBeLessThanOrEqual(now.buttons.find((b) => b.name === 'previous')!.left + 0.5)
      return s
    }
    const partly = (s: Awaited<ReturnType<typeof sliderState>>, label: string) => {
      expect(s.place.width, `the slider's place, ${label}`).toBeGreaterThan(s.full * 0.1)
      expect(s.place.width, `the slider's place, ${label}`).toBeLessThan(s.full * 0.9)
    }

    await page.mouse.move((v.left + v.right) / 2, (v.top + v.bottom) / 2)
    await expect(opened).toHaveCount(1)
    await expect.poll(() => holdAt(0.5), 'the transitions of the opening').toEqual(expect.arrayContaining(OWN))
    expect(others(await holdAt(0.5)), 'what else of the strip is in transition while the slider opens').toEqual([])
    partly(await during('halfway through the opening', true), 'held halfway open')
    for (const share of [0.15, 0.85]) {
      await holdAt(share)
      await during(`${share * 100} % of the opening`, true)
    }
    await finish()
    const wide = await during('opened', true)
    expect(Math.abs(wide.place.width - wide.full), 'the slider is open to its whole width').toBeLessThanOrEqual(0.5)
    expect(wide.endsAt, '"Ends at" once the slider is open').toEqual({ drawn: false })

    await showControlsWithMouse(page)
    await expect(opened).toHaveCount(0)
    await expect.poll(() => holdAt(0.5), 'the transitions of the closing').toEqual(expect.arrayContaining(OWN))
    expect(others(await holdAt(0.5)), 'what else of the strip is in transition while the slider closes').toEqual([])
    partly(await during('halfway through the closing'), 'held halfway closed')
    for (const share of [0.15, 0.85]) {
      await holdAt(share)
      await during(`${share * 100} % of the closing`)
    }
    await finish()
    const shut = await during('closed')
    expect(shut.place.width, 'the closed slider has no width').toBe(0)
    expect(shut.endsAt, '"Ends at" is back once the slider is closed').toEqual({ drawn: true })
    await page.evaluate(() => (window as unknown as { __e2eRelease: () => void }).__e2eRelease())
    await page.emulateMedia({ reducedMotion: 'reduce' })

    await patchStore(page, { chapters: 'real', queue: 'real', segment: 'real' })
    await leavePlayer(page)
  })
})

test.describe('player layout: the favourite button', () => {
  test('marks the playing item on the server and back; while the next queue entry loads it is disabled and marks nothing', { tag: [TAG.writes] }, async ({ page, app, api }) => {
    const series = await api.findSeries('Orbital Drift')
    const episodes = (await api.items({ includeItemTypes: 'Episode', parentId: series.Id, sortBy: 'ParentIndexNumber,IndexNumber' })) as Array<Item & { ParentIndexNumber?: number }>
    const [first, second] = episodes.filter((e) => e.ParentIndexNumber === 1)
    // the first is not a favourite, the second is; everything else of their state stays as it was
    await api.setUserData(first.Id, { ...(await api.snapshot(first.Id)), IsFavorite: false })
    await api.setUserData(second.Id, { ...(await api.snapshot(second.Id)), IsFavorite: true })
    const isFavorite = async (item: Item) => (await api.userData(item.Id)).IsFavorite
    const favoriteCalls: string[] = []
    page.on('request', (r) => {
      // the writes only (a cross-origin write is preceded by an OPTIONS request)
      if (/Favorite/i.test(new URL(r.url()).pathname) && ['POST', 'DELETE'].includes(r.method())) favoriteCalls.push(`${r.method()} ${new URL(r.url()).pathname}`)
    })
    await app.goto('/')
    await app.setPreference('controllerTimeout', 60_000)
    await playPaused(page, first, 12_000)
    await showControlsWithMouse(page)

    const favorite = button(page, 'favorite')
    await expect(favorite).toHaveAttribute('aria-pressed', 'false')
    await expect(favorite).toHaveAttribute('aria-label', 'Favorite')
    await favorite.click()
    await expect(favorite).toHaveAttribute('aria-pressed', 'true')
    await expect(favorite).toHaveAttribute('aria-label', 'Unfavorite')
    await expect.poll(() => isFavorite(first), { message: 'server: the playing episode is a favourite' }).toBe(true)
    await favorite.click()
    await expect(favorite).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(() => isFavorite(first), { message: 'server: and is none again' }).toBe(false)
    // a click keeps the controls up
    await expect(page.locator(strip)).toBeVisible()
    expect(favoriteCalls.map((c) => c.split(' ')[0]), 'one write per click').toEqual(['POST', 'DELETE'])

    // ---- Next, with the second episode's full item held back: the engine has moved on, its item has not
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    let holding = 0
    await page.route(
      (url) => url.pathname.endsWith(`/Items/${second.Id}`),
      async (route) => {
        holding++
        await held
        await route.continue()
      },
    )
    await page.keyboard.press('n')
    const store = () =>
      page.evaluate(() => {
        const s = (window as unknown as { __playback: DevPlayback }).__playback.store.getState() as { index: number; entryKind: string | null; status: string; item: { Id?: string } | null }
        return { index: s.index, entryKind: s.entryKind, status: s.status, item: s.item?.Id ?? null }
      })
    await expect.poll(() => holding, { message: 'the player asks for the second episode' }).toBeGreaterThan(0)
    expect(await store(), 'in between: the second entry, the first item').toEqual({ index: 1, entryKind: 'media', status: 'loading', item: first.Id })
    await showControlsWithMouse(page)
    // the button belongs to the second episode (a favourite) and takes no click
    await expect(favorite).toHaveAttribute('aria-disabled', 'true')
    await expect(favorite).toHaveAttribute('aria-pressed', 'true')
    await expect(favorite).toHaveAttribute('aria-label', 'Unfavorite')
    // (a real press at its place: Playwright itself would wait for the button to be enabled)
    await favorite.click({ force: true })
    await favorite.focus()
    await page.keyboard.press('Enter')
    expect(await store(), 'still in between after the clicks').toMatchObject({ index: 1, item: first.Id })
    release()
    await expect(page).toHaveURL((u) => u.pathname === `/play/${second.Id}`, { timeout: 20_000 })
    await expect.poll(async () => (await store()).item, { timeout: 20_000 }).toBe(second.Id)
    await page.unroute((url) => url.pathname.endsWith(`/Items/${second.Id}`))
    await page.waitForFunction(() => {
      const v = document.querySelector('video')
      return !!v && v.readyState >= 2 && v.currentTime > 0.2
    }, null, { timeout: 30_000 })
    await page.keyboard.press('k')
    // nothing was marked meanwhile: no request, and both episodes as they were
    expect(favoriteCalls.length, `favourite requests while the entry loaded (${favoriteCalls.slice(2).join(', ')})`).toBe(2)
    expect([await isFavorite(first), await isFavorite(second)], 'server: first and second episode').toEqual([false, true])

    // loaded: the button works again, on the second episode
    await showControlsWithMouse(page)
    await expect(favorite).not.toHaveAttribute('aria-disabled', 'true')
    await expect(favorite).toHaveAttribute('aria-pressed', 'true')
    await favorite.click()
    await expect(favorite).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(() => isFavorite(second), { message: 'server: the second episode is no favourite any more' }).toBe(false)
    expect(await isFavorite(first)).toBe(false)

    await leavePlayer(page)
  })
})

test.describe('player layout: phone', () => {
  // the writes project's desktop Chromium as a touch phone (the phone project is read-only)
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('touch: a tap shows the two-row strip (390 and 360 wide); sheets fit the screen; the chapters panel is as wide as the screen and a tap chooses; landscape is one row', { tag: [TAG.writes] }, async ({ page, app, api }) => {
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
    const showStrip = async () => {
      if (!(await page.locator(strip).isVisible())) await tapPicture()
      await expect(page.locator(strip)).toBeVisible()
    }
    const dialog = page.locator('[data-player-sheet] [role="dialog"]')
    await expectPlayerIsWindow(page, 'phone, portrait, bare video')
    await showStrip()
    await expectPlayerIsWindow(page, 'phone, portrait, controls shown')

    // portrait, 390 and 360 wide: two rows (the transport; the left group at the left and the right group at the
    // right), every button present and whole, none smaller than the strip's share that was its size before
    let portrait = await stripShare(page)
    for (const size of [
      { w: 390, h: 844 },
      { w: 360, h: 740 },
    ]) {
      const label = `phone ${size.w}x${size.h}`
      await page.setViewportSize({ width: size.w, height: size.h })
      await showStrip()
      // every button the strip can have: chapters (the film's own), a queue, and the Skip button of a segment
      await patchStore(page, { queue: 'three', segment: 'intro' })
      portrait = await stripShare(page)
      expect(portrait.share, label).toBeLessThanOrEqual(LETTERBOX_BAR + 0.0005)
      const p = await stripLayout(page)
      const there = (name: string) => p.buttons.some((b) => b.name === name)
      expect(p.buttons.map((b) => b.name), label).toEqual([...LEFT_GROUP.filter(there), ...TRANSPORT, ...RIGHT_GROUP.filter(there)])
      expect(p.buttons.map((b) => b.name), label).toEqual(expect.arrayContaining(['settings', 'favorite', 'volume', 'subtitles', 'audio', 'chapters', 'queue']))
      expectStripRules(p, label, { rows: 2 })
      for (const b of p.buttons) {
        // 36dp of the 100dp strip
        expect(b.width, `${label}: width of ${b.name}`).toBeGreaterThanOrEqual(p.strip.height * 0.36 - 0.5)
        expect(b.height, `${label}: height of ${b.name}`).toBeGreaterThanOrEqual(p.strip.height * 0.36 - 0.5)
      }
      // the two groups of the second row stand apart
      const row = buttonRows(p)[1]
      const lastLeft = row.filter((b) => b.group === 'left').pop()!
      const firstRight = row.find((b) => b.group === 'right')!
      expect(firstRight.left - lastLeft.right, `${label}: room between the two groups`).toBeGreaterThanOrEqual(4)
      expect((await page.evaluate(() => document.documentElement.scrollWidth)) <= size.w, `${label}: the page does not scroll sideways`).toBe(true)

      // a finger gets the mute button only: where it is the main pointer no slider opens, and no button of the
      // row is hidden for one
      const volume = button(page, 'volume')
      const muted = await volume.getAttribute('aria-pressed')
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), `${label}: a finger is the main pointer`).toBe(true)
      await volume.tap()
      await expect(volume, `${label}: a tap on volume mutes`).toHaveAttribute('aria-pressed', muted === 'true' ? 'false' : 'true')
      await expect(page.locator('[data-volume-open]'), `${label}: no slider opens under a finger`).toHaveCount(0)
      await expect(page.locator('[data-player-volume-slider]'), `${label}: the slider's place is not there for a finger`).toHaveCSS('display', 'none')
      for (const name of ['settings', 'favorite']) await expect(button(page, name), `${label}: ${name} stays drawn`).toHaveCSS('opacity', '1')
      await volume.tap()
      await expect(volume, `${label}: the next tap is back`).toHaveAttribute('aria-pressed', muted ?? 'false')

      // a sheet fits the screen and stands on the strip: settings at the left, subtitles at the right
      for (const [opener, placement] of [
        ['settings', 'bottom-left'],
        ['subtitles', 'bottom-right'],
      ]) {
        await showStrip()
        await button(page, opener).tap()
        await expect(dialog).toBeVisible()
        await expect(page.locator('[data-player-sheet]'), `${label}: ${opener} sheet`).toHaveAttribute('data-player-sheet', placement)
        const sheetBox = (await dialog.boundingBox())!
        expect(sheetBox.x, `${label}: ${opener} sheet`).toBeGreaterThanOrEqual(0)
        expect(sheetBox.x + sheetBox.width, `${label}: ${opener} sheet`).toBeLessThanOrEqual(size.w)
        expect(sheetBox.y + sheetBox.height, `${label}: ${opener} sheet`).toBeLessThanOrEqual(portrait.top)
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
      }
      await patchStore(page, { queue: 'real', segment: 'real' })
    }

    // a tap on Play reaches Play while Next is disabled (the disabled button's touch target once covered the
    // whole strip, and every button before it in the row)
    await showStrip()
    await expect(button(page, 'next')).toHaveAttribute('aria-disabled', 'true')
    const isPaused = () => page.locator('video').evaluate((v: HTMLVideoElement) => v.paused)
    await button(page, 'play').tap()
    await expect.poll(isPaused, { message: 'a tap on Play plays' }).toBe(false)
    await button(page, 'play').tap()
    await expect.poll(isPaused, { message: 'and the next one pauses' }).toBe(true)

    // the panel: the whole width (less the 8dp margins), on the strip
    await showStrip()
    await button(page, 'chapters').tap()
    const list = panel(page, 'chapters')
    await expect(list).toBeVisible()
    const box = (await dialog.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(360 - 17)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(360)
    expect(box.y + box.height).toBeLessThanOrEqual(portrait.top)
    // a tap on a row seeks there
    await list.locator('[data-chapter="1"] button').tap()
    await expect(list).toBeHidden()
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeLessThan(30)

    // landscape: one row, still inside the limit, every button inside the screen and as large as before
    await page.setViewportSize({ width: 844, height: 390 })
    await tapPicture()
    await expect(page.locator(strip)).toBeVisible()
    await expectPlayerIsWindow(page, 'phone, landscape, controls shown')
    const landscape = await stripShare(page)
    expect(landscape.share).toBeLessThanOrEqual(LETTERBOX_BAR + 0.0005)
    const l = await stripLayout(page)
    expectStripRules(l, 'phone, landscape', { rows: 1 })
    // 38dp of the 62dp strip
    for (const b of l.buttons) expect(b.width, `phone, landscape: width of ${b.name}`).toBeGreaterThanOrEqual(l.strip.height * 0.613 - 0.5)
    // the panel there: half the screen at most, at the right, scrolling inside
    await button(page, 'chapters').tap()
    await expect(list).toBeVisible()
    const wide = (await dialog.boundingBox())!
    expect(wide.width).toBeLessThanOrEqual(l.window.width / 2)
    expect(wide.x + wide.width).toBeLessThanOrEqual(l.window.width)
    expect(wide.x + wide.width).toBeGreaterThan(l.window.width - 24)
    expect(wide.y).toBeGreaterThanOrEqual(0)
    expect(wide.y + wide.height).toBeLessThanOrEqual(landscape.top)
    await button(page, 'panel-close').tap()
    await expect(list).toBeHidden()

    await leavePlayer(page)
  })
})
