// Helpers for the app's own conventions: settle detection (shared with the screenshot crawler), the shell
// landmarks, spatial-navigation focus, and preferences. Specs talk to the app through this class so a markup
// change is fixed in one place.
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import { settle, trackNetwork, type NetTracker } from '../../tools/shots/settle.ts'

/** Description of the element that currently shows the focus highlight. */
export interface Highlighted {
  tag: string
  label: string | null
  href: string | null
  /** `data-home-pos` of a Home card ("row:col"), if any */
  homePos: string | null
  /** inside the nav drawer */
  inDrawer: boolean
  /** focused (keyboard) rather than hovered */
  focused: boolean
}

export class App {
  readonly page: Page
  private readonly net: NetTracker
  private readonly info: TestInfo

  constructor(page: Page, info: TestInfo) {
    this.page = page
    this.info = info
    this.net = trackNetwork(page)
  }

  dispose() {
    this.net.dispose()
  }

  // ---- navigation + settle -------------------------------------------------------------------

  /** Opens an app path and waits until the page stopped changing. */
  async goto(path: string) {
    await this.page.goto(path)
    await this.settle()
  }

  /**
   * Waits like the crawler does (tools/shots/settle.ts): no request in flight for a quiet window, fonts and
   * visible images loaded, no visible spinner (`aria-busy`), layout identical across frames. Never throws:
   * tests assert what they need afterwards; a timeout is recorded as an annotation.
   */
  async settle(timeoutMs = 15_000) {
    const r = await settle(this.page, this.net, { timeoutMs })
    if (r.timedOut) this.info.annotations.push({ type: 'settle-timeout', description: this.page.url() })
  }

  /** Signs in to the throwaway server through the dev endpoint (see tools/vite-dev-session.ts). */
  async devLogin(next?: string) {
    const q = new URLSearchParams({ server: 'test' })
    if (next) q.set('next', next)
    await this.page.goto(`/dev/login?${q}`)
    await this.page.waitForURL((u) => !u.pathname.startsWith('/dev/'), { timeout: 30_000 })
    await this.settle()
  }

  /** True on the touch phone project. */
  get touch(): boolean {
    return !!this.info.project.use.hasTouch
  }

  /** Activates a control the way the project's user would: a tap on touch devices, a click otherwise. */
  async activate(target: Locator) {
    if (this.touch) await this.tap(target)
    else await target.click()
  }

  /**
   * A touch tap. Playwright's WebKit on a Windows desktop with display scaling sends touches to the wrong place
   * (the point is multiplied by the host scale; mouse clicks are right), so there the tap is the same event
   * sequence dispatched on the element: touch pointerdown / pointerup, then click.
   */
  async tap(target: Locator) {
    if (this.info.project.use.browserName !== 'webkit') return target.tap()
    await target.scrollIntoViewIfNeeded()
    await expect(target).toBeVisible()
    await target.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const init = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }
      const p = { ...init, pointerId: 9, pointerType: 'touch', isPrimary: true }
      el.dispatchEvent(new PointerEvent('pointerdown', p))
      el.dispatchEvent(new PointerEvent('pointerup', p))
      ;(el as HTMLElement).click()
    })
  }

  /**
   * A real one-finger gesture: down at `from`, an optional rest, a straight move to `to`, up. Chromium only: it is
   * sent through the DevTools protocol, so the browser itself decides whether the finger pans the page
   * (`touch-action`, then `pointercancel`) or the page gets the pointer events. Playwright's own touchscreen can
   * only tap; WebKit and Firefox have no way to send a moving touch (dispatch pointer events there).
   * One move per animation frame, so the page handles each before the next.
   */
  async touchDrag(from: { x: number; y: number }, to: { x: number; y: number }, opts: { steps?: number; holdMs?: number } = {}) {
    if (this.info.project.use.browserName && this.info.project.use.browserName !== 'chromium') throw new Error('touchDrag needs Chromium (DevTools protocol)')
    const cdp = await this.page.context().newCDPSession(this.page)
    const steps = opts.steps ?? 12
    const at = (p: { x: number; y: number }) => [{ x: Math.round(p.x), y: Math.round(p.y), id: 1, radiusX: 4, radiusY: 4, force: 1 }]
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(from) })
      // the gesture under test is a timed one (a rest on a drag handle): the wait is the gesture
      if (opts.holdMs) await this.page.waitForTimeout(opts.holdMs)
      for (let i = 1; i <= steps; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: at({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }),
        })
        await this.page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())))
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    } finally {
      await cdp.detach()
    }
  }

  /** Current path + search, e.g. "/item/abc?x=1". */
  path(): string {
    const u = new URL(this.page.url())
    return u.pathname + u.search
  }

  // ---- landmarks ----------------------------------------------------------------------------

  /** The drawer shell (Home, libraries, detail pages). */
  get shell(): Locator {
    return this.page.locator('[data-shell]')
  }

  /** Nav drawer: `data-shell-drawer="rail"` on desktop, `"sheet"` on phones; `data-open` while expanded. */
  get drawer(): Locator {
    return this.page.locator('[data-shell-drawer]')
  }

  /** The element holding the routed page (AppShell main / FullScreenLayout root). */
  get pageRoot(): Locator {
    return this.page.locator('[data-page-root]')
  }

  /** The shell's Back control (absent on Home). */
  get backButton(): Locator {
    return this.page.locator('[data-shell]').getByRole('button', { name: 'Back', exact: true })
  }

  /** Phone top bar menu button that opens the drawer sheet. */
  get menuButton(): Locator {
    // its label is a web-only string: in a right-to-left language the English text is wrapped in a left-to-right
    // isolate (U+2066 ... U+2069, src/i18n ltrFallback), which is part of the accessible name
    return this.page.getByRole('button', { name: /^\u2066?Menu\u2069?$/ })
  }

  /** A route stub page. None is left since the final merge; specs assert `toHaveCount(0)` on real pages. */
  get routeStub(): Locator {
    return this.page.locator('[data-route-stub]')
  }

  /** The library / favorites grid (browse's CollectionFolderView): its cards. */
  get gridCards(): Locator {
    return this.page.locator('[data-page-root] [data-grid-index] [data-card-surface]')
  }

  /** The play-button row of a movie / episode / video detail page. */
  get detailButtons(): Locator {
    return this.page.locator('[data-focus-key="detail-play-buttons"]')
  }

  // ---- Home ---------------------------------------------------------------------------------

  get homeRows(): Locator {
    return this.page.locator('[data-home-row]')
  }

  /** Home row whose title is `title` (rows render as <section aria-label=title>). */
  homeRow(title: string | RegExp): Locator {
    return this.homeRows.filter({ has: this.page.getByRole('region', { name: title }) })
  }

  /** A Home card by its "row:col" position. */
  homeCard(pos: string): Locator {
    return this.page.locator(`[data-home-pos="${pos}"]`)
  }

  /** Home's vertical rows scroller (the rows scroll inside the page, not the window). */
  get homeRowsScroller(): Locator {
    return this.page.locator('[data-home-rows]')
  }

  /** Home header (title or logo, details and overview of the highlighted card). */
  get homeHeader(): Locator {
    return this.page.locator('[data-home-header]')
  }

  async homeHeaderTitle(): Promise<string | null> {
    return this.homeHeader.evaluate((h) => {
      const img = h.querySelector('img')
      if (img) return img.getAttribute('alt')
      return h.querySelector('h1')?.textContent?.trim() || null
    })
  }

  /** Waits until Home rendered its rows and settled. */
  async expectHome() {
    await expect(this.page).toHaveURL((u) => u.pathname === '/')
    // a row without items takes no space (as on the TV), so the first row in the document can be a hidden one
    await expect(this.homeRows.filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 })
    await this.settle()
  }

  // ---- focus --------------------------------------------------------------------------------

  /** The focused element. */
  get focused(): Locator {
    return this.page.locator(':focus')
  }

  /** `data-home-pos` of the focused Home card, or null. */
  async focusedHomePos(): Promise<string | null> {
    return this.page.evaluate(() => document.activeElement?.closest('[data-home-pos]')?.getAttribute('data-home-pos') ?? null)
  }

  /**
   * "Focus = hover = keyboard focus": the TV look shows on `:focus-visible` and on mouse hover. Asserts that
   * exactly one `[data-focusable]` element shows it and returns that element. Mirrors the kit's CSS
   * (src/ui/lib/inputModality.ts): while `<html data-pointer>` is set (the mouse moved last) the hovered
   * element is lit and focus rings are hidden; otherwise the `:focus-visible` element is lit.
   */
  async expectSingleHighlight(opts: { timeout?: number } = {}): Promise<Highlighted> {
    let found: Highlighted[] = []
    await expect
      .poll(
        async () => {
          found = await this.page.evaluate(() => {
            const hover = matchMedia('(hover: hover)').matches
            const pointer = document.documentElement.hasAttribute('data-pointer')
            const lit = (el: Element) =>
              pointer
                ? hover && (el.matches(':hover') || !!el.closest('[data-card-scaler]')?.matches(':hover'))
                : el.matches(':focus-visible')
            return Array.from(document.querySelectorAll('[data-focusable]'))
              .filter((el) => el.getClientRects().length > 0 && lit(el))
              .map((el) => ({
                tag: el.tagName.toLowerCase(),
                label: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 60) ?? null,
                href: el.getAttribute('href'),
                homePos: el.getAttribute('data-home-pos'),
                inDrawer: !!el.closest('[data-shell-drawer]'),
                focused: el.matches(':focus-visible'),
              }))
          })
          return found.length
        },
        { message: 'exactly one element shows the focus highlight', timeout: opts.timeout },
      )
      .toBe(1)
    return found[0]
  }

  /** Presses `key` `times` times, letting the app react between presses. */
  async press(key: string, times = 1) {
    for (let i = 0; i < times; i++) {
      await this.page.keyboard.press(key)
      // two animation frames: the app moves focus / scroll from rAF, so the next key sees the settled state
      await this.page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
    }
  }

  // ---- preferences --------------------------------------------------------------------------

  /**
   * Sets an app preference through the app's own store (src/stores/preferences.ts setPref), exactly what the
   * Settings screen calls. For setup only: specs about a preference itself drive the Settings UI (settings.spec.ts).
   */
  async setPreference(key: string, value: unknown) {
    await this.page.evaluate(
      async ([k, v]) => {
        // After an HMR update the app runs '/src/stores/preferences.ts?t=…'; the bare path would load a second,
        // unbound module instance. Import the URL the page actually loaded (the newest one).
        const loaded = performance
          .getEntriesByType('resource')
          .map((e) => new URL(e.name))
          .filter((u) => u.origin === location.origin && u.pathname === '/src/stores/preferences.ts')
          .pop()
        const url = loaded ? loaded.pathname + loaded.search : '/src/stores/preferences.ts'
        const mod = (await import(/* @vite-ignore */ url)) as { setPref: (key: string, value: unknown) => void }
        mod.setPref(k as string, v)
      },
      [key, value] as const,
    )
  }

  // ---- layout -------------------------------------------------------------------------------

  /** Asserts the document does not scroll horizontally at the current viewport. */
  async expectNoHorizontalOverflow() {
    const r = await this.page.evaluate(() => {
      const de = document.documentElement
      const vw = window.innerWidth
      const offenders: string[] = []
      if (de.scrollWidth > vw + 1) {
        for (const el of Array.from(document.body.querySelectorAll('*'))) {
          const b = el.getBoundingClientRect()
          if (b.width === 0 || b.height === 0) continue
          // only elements that are not clipped by a scrolling/hidden ancestor can widen the page
          if (b.right > vw + 1 || b.left < -1) {
            let p = el.parentElement
            let clipped = false
            while (p && p !== document.body) {
              const o = getComputedStyle(p).overflowX
              if (o !== 'visible') {
                clipped = true
                break
              }
              p = p.parentElement
            }
            if (!clipped) offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} ${Math.round(b.left)}..${Math.round(b.right)}`)
          }
          if (offenders.length >= 5) break
        }
      }
      return { scrollWidth: de.scrollWidth, viewport: vw, offenders }
    })
    expect(r.scrollWidth, `horizontal overflow at ${r.viewport}px: ${r.offenders.join(', ')}`).toBeLessThanOrEqual(r.viewport + 1)
  }

  /**
   * The element's characters in the order they are drawn, left to right, spaces dropped (one line of text). A
   * right-to-left line reorders a value made of neutral characters: ".25" is drawn "25.", "100 Mbps" "Mbps100".
   */
  async drawnText(target: Locator): Promise<string> {
    return target.evaluate((el) => {
      const drawn: Array<{ c: string; x: number }> = []
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
        for (let i = 0; i < n.data.length; i++) {
          if (/\s/.test(n.data[i])) continue
          const range = document.createRange()
          range.setStart(n, i)
          range.setEnd(n, i + 1)
          const rect = range.getClientRects()[0]
          if (rect && rect.width > 0) drawn.push({ c: n.data[i], x: rect.left })
        }
      }
      return drawn
        .sort((a, b) => a.x - b.x)
        .map((d) => d.c)
        .join('')
    })
  }
}
