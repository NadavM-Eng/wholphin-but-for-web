// A card grid must stand still when nobody touches it. The cards are sized from the width of the element that
// scrolls them and decide the height of its content; when the vertical scrollbar took room only while the content
// overflowed, a grid that just fitted had no resting state and shifted sideways on every frame (scrollbar in,
// cards narrower and shorter, content fits, scrollbar out, cards larger again).
//
// Every other spec runs with Playwright's default `--hide-scrollbars`, where a scrollbar takes no room and this
// cannot happen. This file starts its own Chromium with real scrollbars and, for each window width, finds the
// window height at which the grid just fits and samples the cards frame by frame around it, 1px at a time.
import type { Page, Route } from '@playwright/test'
import { TAG, expect, test } from '../fixtures'
import type { JellyfinApi } from '../fixtures/api'

// launchOptions is replaced as a whole: keep the suite's --mute-audio
test.use({ launchOptions: { args: ['--mute-audio'], ignoreDefaultArgs: ['--hide-scrollbars'] } })

/** Window heights sampled around the height at which the grid just fits: from 2px below it to 6px above. */
const BELOW = 2
const ABOVE = 6
/** Frames compared at each window size. */
const FRAMES = 16

interface Sample {
  /** number of frames whose layout differs from the frame before */
  changes: number
  /** the distinct layouts seen: "columns | x:width of each first-row card | client width of the scroller" */
  layouts: string[]
  /** content height and client height of the scroller, and what the window has above and below it */
  scrollHeight: number
  clientHeight: number
  columns: number
}

/**
 * Compares the first row of cards over `frames` animation frames, after the layout has been the same for a few
 * frames (or 90 frames have passed: a grid that never rests is then reported by `changes`).
 */
function sampleGrid(page: Page, frames: number): Promise<Sample> {
  return page.evaluate(
    (frames) =>
      new Promise<Sample>((resolve) => {
        const scrollerOf = (el: Element): Element => {
          for (let p = el.parentElement; p; p = p.parentElement) {
            const o = getComputedStyle(p).overflowY
            if (p !== document.documentElement && p !== document.body && (o === 'auto' || o === 'scroll')) return p
          }
          return document.documentElement
        }
        const read = () => {
          const first = document.querySelector('[data-page-root] [data-grid-index="0"]')
          if (!first) return { key: 'no grid', scrollHeight: 0, clientHeight: 0, columns: 0 }
          const top = Math.round(first.getBoundingClientRect().top)
          const row = Array.from(document.querySelectorAll('[data-page-root] [data-grid-index]')).filter(
            (c) => Math.round(c.getBoundingClientRect().top) === top,
          )
          const sc = scrollerOf(first)
          const cells = row.map((c) => {
            const r = c.getBoundingClientRect()
            return `${r.x.toFixed(2)}:${r.width.toFixed(2)}`
          })
          return { key: `${row.length} | ${cells.join(' ')} | ${sc.clientWidth}`, scrollHeight: sc.scrollHeight, clientHeight: sc.clientHeight, columns: row.length }
        }
        let waited = 0
        let same = 0
        let last = read().key
        const settle = () => {
          const now = read().key
          same = now === last ? same + 1 : 0
          last = now
          if (same >= 4 || ++waited >= 90) requestAnimationFrame(compare)
          else requestAnimationFrame(settle)
        }
        const seen: string[] = []
        let changes = 0
        const compare = () => {
          const now = read()
          if (seen.length && now.key !== seen[seen.length - 1]) changes++
          seen.push(now.key)
          if (seen.length < frames) requestAnimationFrame(compare)
          else resolve({ changes, layouts: Array.from(new Set(seen)), scrollHeight: now.scrollHeight, clientHeight: now.clientHeight, columns: now.columns })
        }
        requestAnimationFrame(settle)
      }),
    frames,
  )
}

/** `error` events on window: the "ResizeObserver loop" report is one (no Error object, so no `pageerror`). */
async function collectWindowErrors(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __errors: string[] }
    w.__errors = []
    window.addEventListener('error', (e) => w.__errors.push(e.message || String(e.error)), true)
  })
  return () => page.evaluate(() => (window as unknown as { __errors: string[] }).__errors)
}

/** This browser's scrollbars take room (otherwise the sweep below proves nothing). */
async function expectRealScrollbars(page: Page) {
  const gutter = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;top:0;left:0;width:100px;height:50px;overflow:scroll'
    document.body.appendChild(probe)
    const w = probe.offsetWidth - probe.clientWidth
    probe.remove()
    return w
  })
  expect(gutter, 'the browser of this spec must draw scrollbars that take room').toBeGreaterThan(0)
}

/**
 * For each window width: the height at which the grid just fits its scroller, then every height from a little
 * below it to a little above it. At each size no first-row card may change its x or width, and the scroller may
 * not change its client width, from one frame to the next.
 */
async function expectStillAroundFit(page: Page, widths: readonly number[]) {
  const moved: string[] = []
  for (const width of widths) {
    // A window the grid overflows: its content then has the height it has beside a scrollbar. First a short one
    // (rows below it are not rendered and count with their estimated height), then closer and closer until the
    // window is only a little too short, where every row is rendered and measured.
    let fit = 0
    let h = 320
    for (let i = 0; i < 8; i++) {
      await page.setViewportSize({ width, height: h })
      const s = await sampleGrid(page, 4)
      expect(s.columns, `a grid at ${width}px`).toBeGreaterThan(0)
      if (s.scrollHeight <= s.clientHeight) {
        // the estimate was too tall and this window already holds the grid
        expect(h, `the grid overflows a ${width}x320 window`).toBeGreaterThan(320)
        h = Math.max(320, h - 200)
        continue
      }
      fit = s.scrollHeight + (h - s.clientHeight)
      if (h >= fit - 60) break
      h = fit - 40
    }
    expect(fit, `the height at which the grid fits a ${width}px wide window`).toBeGreaterThan(0)
    for (let height = fit - BELOW; height <= fit + ABOVE; height++) {
      await page.setViewportSize({ width, height })
      const s = await sampleGrid(page, FRAMES)
      if (s.changes > 0) moved.push(`${width}x${height}: ${s.changes} of ${FRAMES} frames moved\n    ${s.layouts.join('\n    ')}`)
    }
  }
  // soft: a test with several steps reports every one of them
  expect.soft(moved, 'window sizes at which the grid moved without input').toEqual([])
}

async function moviesLibrary(api: JellyfinApi) {
  const lib = (await api.userViews()).find((v) => v.Name === 'Movies' && v.CollectionType === 'movies')
  if (!lib) throw new Error('e2e: the test server has no "Movies" library')
  return lib
}

/** Serves the Movies library grid as `total()` synthetic movies without images (row heights depend on nothing else). */
async function mockLibrary(page: Page, libraryId: string, total: () => number) {
  await page.route(
    (u) => u.pathname.endsWith('/Items') && u.searchParams.get('parentId') === libraryId && u.searchParams.get('includeItemTypes') === 'Movie',
    async (route: Route) => {
      const u = new URL(route.request().url())
      const start = Number(u.searchParams.get('startIndex') ?? 0)
      const limit = Number(u.searchParams.get('limit') ?? 100)
      const items = Array.from({ length: Math.max(0, Math.min(limit, total() - start)) }, (_, i) => {
        const n = start + i
        return { Id: `e2e0000000000000000000000001${String(n).padStart(4, '0')}`, Name: `Still ${String(n).padStart(3, '0')}`, Type: 'Movie', ImageTags: {}, UserData: {} }
      })
      await route.fulfill({ json: { Items: items, TotalRecordCount: u.searchParams.get('enableTotalRecordCount') === 'true' ? total() : 0, StartIndex: start } })
    },
  )
}

const firstCell = (page: Page) => page.locator('[data-page-root] [data-grid-index="0"]')

/**
 * Display scale of the screen (Windows 100 %, 125 %, 150 %) with window widths of a 2560-pixel-wide screen at that
 * scale and other common ones. 33 items in 11 columns at 125 % is one case that moved.
 */
const SCREENS = [
  { scale: 1, widths: [1100, 1440, 1441, 1920, 2560], total: 33 },
  { scale: 1.25, widths: [2047, 2048, 2049, 1536], total: 33 },
  { scale: 1.5, widths: [1706, 1707, 1280], total: 33 },
] as const

for (const screen of SCREENS) {
  test.describe(`display scale ${screen.scale}`, () => {
    test.use({ deviceScaleFactor: screen.scale })

    test(`a library grid that just fits its scroller stands still (display scale ${screen.scale})`, { tag: [TAG.desktop] }, async ({ page, app, api }) => {
      test.setTimeout(180_000)
      const errors = await collectWindowErrors(page)
      const lib = await moviesLibrary(api)
      await mockLibrary(page, lib.Id, () => screen.total)
      await app.goto(`/library/${lib.Id}?tab=library`)
      await expect(page.getByText(`1 / ${screen.total}`, { exact: true })).toBeVisible()
      await expectRealScrollbars(page)
      await expectStillAroundFit(page, screen.widths)
      expect((await errors()).filter((e) => /ResizeObserver/i.test(e))).toEqual([])
    })
  })
}

test('a library grid stands still at other item counts, interface scales, in Hebrew and as a list', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
  test.setTimeout(240_000)
  const errors = await collectWindowErrors(page)
  const lib = await moviesLibrary(api)
  const path = `/library/${lib.Id}?tab=library`
  let total = 33
  await mockLibrary(page, lib.Id, () => total)
  const open = async () => {
    await app.goto(path)
    await expect(firstCell(page)).toBeVisible()
  }

  await test.step('item counts around 33: a full last row, one card more, one card less', async () => {
    for (const n of [8, 32, 34]) {
      total = n
      await open()
      await expectStillAroundFit(page, [1440])
    }
  })

  await test.step('interface scale 90 % and 130 % (sizes in rem with fractions of a pixel)', async () => {
    total = 14
    await open()
    await expectRealScrollbars(page)
    for (const scale of [90, 130]) {
      await app.setPreference('webInterfaceScale', scale)
      await expect.poll(() => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))).toBe((16 * scale) / 100)
      await expectStillAroundFit(page, [1440, 1300])
    }
    await app.setPreference('webInterfaceScale', 100)
  })

  await test.step('phone width', async () => {
    total = 9
    await open()
    await expectStillAroundFit(page, [390])
  })

  await test.step('list view', async () => {
    total = 20
    await page.setViewportSize({ width: 1440, height: 900 })
    await open()
    await page.getByRole('button', { name: 'View options' }).click()
    const dialog = page.getByRole('dialog', { name: 'View options' })
    await dialog.getByRole('button', { name: /^Layout/ }).click()
    await page.getByRole('menuitem', { name: 'List' }).or(page.getByRole('option', { name: 'List' })).first().click()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page.locator('[data-page-root] [data-grid-index] [data-card-surface]')).toHaveCount(0)
    await expectStillAroundFit(page, [1440, 1100])
    // back to the grid for the next step (the layout is saved per library in this browser profile)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByRole('button', { name: 'View options' }).click()
    await dialog.getByRole('button', { name: /^Layout/ }).click()
    await page.getByRole('menuitem', { name: 'Grid' }).or(page.getByRole('option', { name: 'Grid' })).first().click()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page.locator('[data-page-root] [data-grid-index] [data-card-surface]').first()).toBeVisible()
  })

  await test.step('Hebrew (the scrollbar is on the other side)', async () => {
    await app.setPreference('userInterfaceLanguage', 'he')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expectStillAroundFit(page, [1440, 1100])
  })

  expect((await errors()).filter((e) => /ResizeObserver/i.test(e))).toEqual([])
})

test('a grid scrolled by the page ("View more") that just fits the window stands still', { tag: [TAG.desktop] }, async ({ page, app }) => {
  test.setTimeout(180_000)
  const errors = await collectWindowErrors(page)
  await app.goto('/')
  await app.expectHome()
  const index = await app.homeRow('Recently added in Movies').getAttribute('data-home-row')
  await app.goto(`/home/row/${index}`)
  await expect(page.getByRole('heading', { name: 'Recently added in Movies' })).toBeVisible()
  await expectRealScrollbars(page)
  await expectStillAroundFit(page, [1100, 1440, 1707, 2048])
  expect((await errors()).filter((e) => /ResizeObserver/i.test(e))).toEqual([])
})

test('the genre tiles grid stands still when it just fits', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
  test.setTimeout(120_000)
  const errors = await collectWindowErrors(page)
  const lib = await moviesLibrary(api)
  // enough genres for three rows of tiles (the test library has a handful); their pictures stay placeholders
  await page.route(
    (u) => u.pathname.endsWith('/Genres') && u.searchParams.get('parentId') === lib.Id,
    async (route: Route) => {
      const items = Array.from({ length: 12 }, (_, n) => ({ Id: `e2e0000000000000000000000003${String(n).padStart(4, '0')}`, Name: `Genre ${String(n).padStart(2, '0')}`, Type: 'Genre', ImageTags: {} }))
      await route.fulfill({ json: { Items: items, TotalRecordCount: items.length, StartIndex: 0 } })
    },
  )
  await app.goto(`/library/${lib.Id}?tab=genres`)
  await expect(firstCell(page)).toBeVisible()
  await expectRealScrollbars(page)
  await expectStillAroundFit(page, [1100, 1440, 2048])
  expect((await errors()).filter((e) => /ResizeObserver/i.test(e))).toEqual([])
})
