/// <reference lib="dom" />
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium, devices, firefox, webkit, type Browser, type BrowserContext, type Page, type Response } from '@playwright/test'
import type { Options } from './args.ts'
import { ROOT } from './devServer.ts'
import { createJfClient, type JfClient } from './jellyfin.ts'
import { NO_ANIMATION_CSS, settle, trackNetwork } from './settle.ts'
import type { AuthMode, EngineName, Issue, Scene, ShotEntry, ThemeName, ViewportDef } from './types.ts'

const APP_PREFS_KEY = 'wholphin.prefs.app.v1'
const SESSION_KEY = 'wholphin.session.v1'
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'

/** The frozen wall clock of every picture: today's date (so server dates stay plausible) at 20:00 local time. */
let FIXED_TIME = (() => {
  const d = new Date()
  d.setHours(20, 0, 0, 0)
  return d
})()

/**
 * The server's TV guide is a fixed file with a fixed window. When today's 20:00 lies outside it every guide cell
 * says "No data" and the Live TV scenes show nothing: the clock then moves to 20:00 of a day inside the window
 * (else the middle of the window), so the pictures do not depend on the day or hour the crawler runs.
 */
async function alignClockWithGuide(jf: JfClient): Promise<void> {
  type Programs = { Items?: { StartDate?: string; EndDate?: string }[] }
  const edge = (sortOrder: string) => jf.get<Programs>('/LiveTv/Programs', { limit: 1, sortBy: 'StartDate', sortOrder, enableTotalRecordCount: false })
  const [first, last] = await Promise.all([edge('Ascending'), edge('Descending')])
  const start = Date.parse(first?.Items?.[0]?.StartDate ?? '')
  const end = Date.parse(last?.Items?.[0]?.EndDate ?? '')
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return
  // leave room after the clock: the guide shows the hours that follow it
  const margin = Math.min(2 * 3600_000, (end - start) / 4)
  const inside = (t: number) => t >= start && t <= end - margin
  if (inside(FIXED_TIME.getTime())) return
  for (const day of [new Date(start), new Date(end)]) {
    const d = new Date(day)
    d.setHours(20, 0, 0, 0)
    if (inside(d.getTime())) {
      FIXED_TIME = d
      return
    }
  }
  const mid = new Date((start + end - margin) / 2)
  mid.setMinutes(0, 0, 0)
  FIXED_TIME = mid
}

/** Timer-driven UI after an interaction (drawer hover intent 150 ms, home header 250 ms, backdrop 500 ms): let it land. */
export const AFTER_PREPARE_MS = 800

const EMPTY_TEXTS = JSON.stringify(
  ['en', 'he'].map((l) => {
    try {
      return (JSON.parse(readFileSync(path.join(ROOT, 'src', 'i18n', 'locales', `${l}.json`), 'utf8')) as Record<string, string>).no_results
    } catch {
      return ''
    }
  }).filter(Boolean),
)

type LocalStorageMap = Record<string, string>

export interface Baselines {
  /** localStorage of the signed-in browser profile */
  signedIn: LocalStorageMap
}

export interface Session {
  baselines: Baselines
  jf: JfClient
  serverUrl: string
}

function parseSession(ls: LocalStorageMap) {
  const raw = ls[SESSION_KEY]
  if (!raw) throw new Error('The browser profile has no saved session after /dev/login')
  return JSON.parse(raw) as {
    state: {
      servers: Record<string, { url: string }>
      users: Record<string, { accessToken: string | null; id: string; serverId: string }>
      mostRecent: { serverId: string | null; userId: string | null }
    }
    version: number
  }
}

/** localStorage for one auth mode and theme. */
function storageFor(base: Baselines, auth: AuthMode, theme: ThemeName, extra: Record<string, unknown> = {}): LocalStorageMap {
  if (auth === 'out') return {}
  const ls: LocalStorageMap = { ...base.signedIn }
  const prefs = (() => {
    try {
      return JSON.parse(ls[APP_PREFS_KEY] ?? '{}') as Record<string, unknown>
    } catch {
      return {}
    }
  })()
  prefs.themeColors = theme
  Object.assign(prefs, extra)
  ls[APP_PREFS_KEY] = JSON.stringify(prefs)
  if (auth === 'saved') {
    const s = parseSession(ls)
    for (const u of Object.values(s.state.users)) u.accessToken = null
    s.state.mostRecent = { serverId: null, userId: null }
    ls[SESSION_KEY] = JSON.stringify(s)
  }
  return ls
}

/** Theme for contexts without a profile ('out'): the preference is app-level, so it can be seeded alone. */
function outStorage(theme: ThemeName, extra: Record<string, unknown> = {}): LocalStorageMap {
  return { [APP_PREFS_KEY]: JSON.stringify({ themeColors: theme, ...extra }) }
}

/** Signs in through /dev/login once and returns the profile plus a Jellyfin client for scene resolution. */
export async function obtainSession(browser: Browser, origin: string, server: 'real' | 'test'): Promise<Session> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await ctx.newPage()
  const q = server === 'test' ? '?server=test&next=/' : '?next=/'
  await page.goto(`${origin}/dev/login${q}`, { waitUntil: 'domcontentloaded' })
  try {
    await page.waitForFunction(() => !location.pathname.startsWith('/dev/login') && !!localStorage.getItem('wholphin.session.v1'), undefined, {
      timeout: 30000,
    })
  } catch {
    const text = await page.locator('body').innerText().catch(() => '')
    throw new Error(`/dev/login did not sign in (${server}): ${text.slice(0, 200)}`)
  }
  // let the app persist everything it wants to (prefs, device id) before the snapshot
  await page.waitForTimeout(800)
  const ls = await page.evaluate(() => {
    const out: Record<string, string> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!
      out[k] = localStorage.getItem(k)!
    }
    return out
  })
  await ctx.close()
  const s = parseSession(ls).state
  const user = Object.values(s.users).find((u) => u.accessToken && u.id) ?? null
  if (!user?.accessToken) throw new Error('/dev/login produced no access token')
  const serverUrl = s.servers[user.serverId]?.url
  if (!serverUrl) throw new Error('/dev/login produced no server url')
  const jf = createJfClient(serverUrl, user.accessToken, user.id)
  await alignClockWithGuide(jf)
  return { baselines: { signedIn: ls }, jf, serverUrl }
}

export interface ResolvedScene {
  scene: Scene
  /** resolved app path, or null when skipped */
  url: string | null
  skipReason?: string
  group: string
}

export async function resolveScenes(scenes: Scene[], jf: JfClient): Promise<ResolvedScene[]> {
  const out: ResolvedScene[] = []
  for (const scene of scenes) {
    const group = scene.group ?? scene.name.split('-')[0]
    try {
      const url = typeof scene.path === 'string' ? scene.path : await scene.path(jf)
      out.push(url ? { scene, url, group } : { scene, url: null, skipReason: 'no suitable item on this server', group })
    } catch (e) {
      out.push({ scene, url: null, skipReason: `resolve failed: ${(e as Error).message}`, group })
    }
  }
  return out
}

const log = (...a: unknown[]) => console.log('[shots]', ...a)

interface Ctx {
  context: BrowserContext
  page: Page
}

async function newContext(browser: Browser, o: Options, vp: ViewportDef, auth: AuthMode, theme: ThemeName, base: Baselines, origin: string): Promise<Ctx> {
  const ls = auth === 'out' ? outStorage(theme) : storageFor(base, auth, theme)
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: o.dpr,
    hasTouch: vp.touch,
    ...deviceProfile(o.engine, vp),
    locale: o.rtl ? 'he-IL' : 'en-US',
    colorScheme: 'dark',
    storageState: { cookies: [], origins: [{ origin, localStorage: Object.entries(ls).map(([name, value]) => ({ name, value })) }] },
  })
  // Pictures must not differ between runs because of the wall clock (header clock, "Ends at"): freeze it. Timers still run.
  await context.clock.setFixedTime(FIXED_TIME)
  const page = await context.newPage()
  page.setDefaultTimeout(3000) // interactions in prepare(): fail fast instead of burning 30 s
  // warm-up on the app origin so sessionStorage/localStorage are reachable before the first scene
  await page.goto(`${origin}/__dev/session?probe=1`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  if (o.engine === 'webkit') await matchCssViewport(page, vp.width, vp.height)
  // runs in every document: optional navigation state for the first load, and the no-animation stylesheet
  await context.addInitScript(
    ({ css }) => {
      try {
        const st = sessionStorage.getItem('__shotsState')
        if (st) {
          sessionStorage.removeItem('__shotsState')
          history.replaceState({ usr: JSON.parse(st), key: 'shots', idx: 0 }, '')
        }
        if (sessionStorage.getItem('__shotsAnim') !== '1') {
          const add = () => {
            const el = document.createElement('style')
            el.setAttribute('data-shots', '')
            el.textContent = css
            document.documentElement.appendChild(el)
          }
          add()
        }
      } catch {
        // storage unavailable: pictures just keep their animations
      }
    },
    { css: NO_ANIMATION_CSS },
  )
  return { context, page }
}

/**
 * Playwright's WebKit on Windows multiplies the requested viewport by the host's display scaling (at 125 %
 * a 1440 px viewport gets only 1152 CSS px). Enlarge the viewport by that factor so the page lays out at the
 * requested CSS size (the picture is then larger in device pixels). No-op where the engine honours the size.
 */
export async function matchCssViewport(page: Page, width: number, height: number) {
  const css = await page.evaluate(() => window.innerWidth).catch(() => width)
  if (!css || Math.abs(css - width) <= 1) return
  const f = width / css
  await page.setViewportSize({ width: Math.round(width * f), height: Math.round(height * f) })
}

/**
 * Mobile flag and user agent per engine. Chromium phone = Android Chrome; WebKit phone/tablet = iPhone/iPad Safari UA;
 * Firefox has no mobile emulation in Playwright (isMobile is unsupported), so it gets touch only.
 */
function deviceProfile(engine: EngineName, vp: ViewportDef): { isMobile?: boolean; userAgent?: string } {
  if (engine === 'firefox') return {}
  if (engine === 'webkit') {
    if (!vp.touch) return {}
    // isMobile stays off: with mobile viewport emulation, Playwright's WebKit on a scaled Windows desktop lays out
    // at the requested width but shows a narrower window (see matchCssViewport), which cannot be compensated.
    const d = devices[vp.mobile ? 'iPhone 13' : 'iPad (gen 7)']
    return { isMobile: false, userAgent: d.userAgent }
  }
  return { isMobile: vp.mobile, userAgent: vp.mobile ? ANDROID_UA : undefined }
}

const PAGE_CHECKS = () => `(() => {
  const de = document.documentElement
  const vw = window.innerWidth
  const overflow = de.scrollWidth > vw + 1 ? { scrollWidth: de.scrollWidth, clientWidth: vw } : null
  const offenders = []
  if (overflow) {
    for (const e of document.querySelectorAll('body *')) {
      const r = e.getBoundingClientRect()
      if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) {
        const cs = getComputedStyle(e)
        if (cs.position === 'fixed') continue
        offenders.push(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.split(/\\s+/)[0] : ''))
        if (offenders.length >= 3) break
      }
    }
  }
  const emptyTexts = ${EMPTY_TEXTS}
  const vh = window.innerHeight
  const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw }
  const empty = Array.from(document.querySelectorAll('body *')).some((e) => e.children.length === 0 && emptyTexts.includes((e.textContent || '').trim()) && visible(e))
  const stub = document.querySelector('[data-route-stub]')?.getAttribute('data-route-stub') ?? null
  const broken = [], zero = []
  for (const img of document.images) {
    const src = img.currentSrc || img.src
    if (!src || src.startsWith('data:')) continue
    const short = src.replace(/^https?:\\/\\/[^/]+/, '').replace(/[?].*$/, '').slice(-70)
    if (img.complete && img.naturalWidth === 0) { broken.push(short); continue }
    const r = img.getBoundingClientRect()
    const cs = getComputedStyle(img)
    if ((r.width === 0 || r.height === 0) && cs.display !== 'none' && cs.visibility !== 'hidden' && img.offsetParent !== null) zero.push(short)
  }
  return { overflow, offenders, stub, broken: broken.slice(0, 5), zero: zero.slice(0, 5), empty, brokenTotal: broken.length, zeroTotal: zero.length }
})()`

interface CheckResult {
  overflow: { scrollWidth: number; clientWidth: number } | null
  offenders: string[]
  stub: string | null
  broken: string[]
  zero: string[]
  brokenTotal: number
  zeroTotal: number
  empty: boolean
}

async function takeShot(
  ctx: Ctx,
  r: ResolvedScene,
  vp: ViewportDef,
  theme: ThemeName,
  auth: AuthMode,
  o: Options,
  origin: string,
  base: Baselines,
  runDir: string,
  jf: JfClient,
): Promise<ShotEntry> {
  const { page } = ctx
  const { scene } = r
  const issues: Issue[] = []
  const rel = `${vp.name}/${theme}/${scene.name}.png`
  const entry: ShotEntry = { scene: scene.name, group: r.group, viewport: vp.name, theme, file: null, url: r.url, status: 'ok', ms: 0, issues, requests: 0 }
  const t0 = Date.now()
  const allowed = (text: string) => (scene.allow ?? []).some((re) => re.test(text))
  const add = (kind: Issue['kind'], severity: Issue['severity'], message: string) => {
    if (!allowed(message)) issues.push({ kind, severity, message: message.slice(0, 400) })
  }

  // state isolation: every scene starts from the baseline profile
  const ls = auth === 'out' ? outStorage(theme, scene.prefs) : storageFor(base, auth, theme, scene.prefs)
  // the wall clock of this picture: the scene's own moment, else the run's fixed evening
  let clock = FIXED_TIME
  if (scene.clock) {
    const iso = typeof scene.clock === 'string' ? scene.clock : await Promise.resolve(scene.clock(jf)).catch(() => null)
    if (iso && !Number.isNaN(Date.parse(iso))) clock = new Date(iso)
  }
  await ctx.context.clock.setFixedTime(clock).catch(() => {})
  try {
    await page.evaluate(
      ({ ls, anim, state }) => {
        localStorage.clear()
        for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v)
        sessionStorage.clear()
        if (anim) sessionStorage.setItem('__shotsAnim', '1')
        if (state !== undefined) sessionStorage.setItem('__shotsState', JSON.stringify(state))
      },
      { ls, anim: !!scene.animations, state: scene.state },
    )
  } catch {
    // page was not on the app origin (previous navigation failed): the goto below still works with the context's profile
  }
  await page.emulateMedia({ reducedMotion: scene.animations ? 'no-preference' : 'reduce' })

  const net = trackNetwork(page)
  const onConsole = (m: import('@playwright/test').ConsoleMessage) => {
    const type = m.type()
    if (type !== 'error' && type !== 'warning') return
    const text = m.text()
    if (/^Failed to load resource/.test(text)) return // reported by the response listener with its URL
    if (/\[vite\]|Download the React DevTools/.test(text)) return
    add(type === 'error' ? 'console-error' : 'console-warning', type === 'error' ? 'error' : 'warn', text)
  }
  const onPageError = (e: Error) => add('pageerror', 'error', e.message)
  const onResponse = (res: Response) => {
    const status = res.status()
    if (status < 400) return
    const url = res.url()
    if (/\/favicon\.ico|\/__dev\/session/.test(url)) return
    // feature probes whose 404 is the normal answer (upstream checks for the optional Wholphin server plugin)
    if (status === 404 && /\/wholphin\/(public|seerrsettings)/.test(url)) return
    // a missing image is cosmetic (the UI shows its placeholder): warning, not error
    const isImage404 = status === 404 && /\/Images\//.test(url)
    add('http-error', isImage404 ? 'warn' : 'error', `${status} ${res.request().method()} ${url.replace(/^https?:\/\/[^/]+/, '').slice(0, 160)}`)
  }
  const onFailed = (req: import('@playwright/test').Request) => {
    const err = req.failure()?.errorText ?? 'failed'
    if (/ERR_ABORTED|NS_BINDING_ABORTED|Load request cancelled|^cancelled$/.test(err)) return // navigations and cancelled loads (Chromium, Firefox, WebKit wording)
    add('request-failed', 'error', `${err} ${req.method()} ${req.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 160)}`)
  }
  page.on('console', onConsole)
  page.on('pageerror', onPageError)
  page.on('response', onResponse)
  page.on('requestfailed', onFailed)

  try {
    try {
      await page.goto(origin + r.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    } catch (e) {
      add('navigation', 'error', `goto failed: ${(e as Error).message.split('\n')[0]}`)
    }
    if (scene.waitFor) {
      try {
        if (typeof scene.waitFor === 'string') await page.locator(scene.waitFor).first().waitFor({ state: 'visible', timeout: 10000 })
        else await scene.waitFor(page)
      } catch (e) {
        add('settle-timeout', 'warn', `waitFor not satisfied: ${(e as Error).message.split('\n')[0]}`)
      }
    }
    let res = await settle(page, net, { timeoutMs: o.settleMs })
    if (scene.prepare) {
      try {
        await scene.prepare(page, { jf, origin, viewport: vp, lang: o.rtl ? 'he' : 'en' })
      } catch (e) {
        add('prepare-failed', 'warn', (e as Error).message.split('\n')[0])
      }
      // timer-driven UI (hover intent, header, backdrop) is invisible to the network/layout checks: wait it out first
      await page.waitForTimeout(AFTER_PREPARE_MS)
      res = await settle(page, net, { timeoutMs: o.settleMs })
    }
    if (scene.extraWaitMs) await page.waitForTimeout(scene.extraWaitMs)
    if (res.timedOut) add('settle-timeout', 'warn', `page still changing after ${o.settleMs} ms (in-flight requests: ${net.inflight()})`)

    if (!scene.prepare) {
      const finalPath = new URL(page.url()).pathname
      const wantPath = (r.url ?? '').split('?')[0]
      if (finalPath !== wantPath && !scene.redirectsTo?.test(finalPath)) add('navigation', 'warn', `redirected to ${finalPath + new URL(page.url()).search}`)
    }

    const checks = (await page.evaluate(PAGE_CHECKS())) as CheckResult
    if (checks.empty && !scene.allowEmpty) add('empty-page', 'warn', 'the page shows "No results": the scene came up empty (wrong id, or no data)')
    if (checks.stub) add('route-stub', 'warn', `still a route stub: ${checks.stub}`)
    if (checks.overflow) {
      entry.overflow = checks.overflow
      add('overflow', 'warn', `horizontal overflow ${checks.overflow.scrollWidth}px > ${checks.overflow.clientWidth}px (${checks.offenders.join(', ')})`)
    }
    if (checks.brokenTotal) add('broken-image', 'error', `${checks.brokenTotal} broken image(s): ${checks.broken.join(' | ')}`)
    if (checks.zeroTotal) add('zero-size-image', 'warn', `${checks.zeroTotal} image(s) with zero size: ${checks.zero.join(' | ')}`)

    const abs = path.join(runDir, rel)
    mkdirSync(path.dirname(abs), { recursive: true })
    await page.screenshot({ path: abs, fullPage: !!scene.fullPage, animations: scene.animations ? 'allow' : 'disabled', caret: 'hide' })
    entry.file = rel
    // a player page: end the playback session now, so the server stops transcoding before the next scene loads
    if (/^\/play\//.test(new URL(page.url()).pathname)) {
      await page.evaluate(() => (window as unknown as { __playback?: { engine?: { stop?(reason: string): unknown } } }).__playback?.engine?.stop?.('user')).catch(() => {})
      await page.waitForTimeout(400)
    }
  } catch (e) {
    add('navigation', 'error', `capture failed: ${(e as Error).message.split('\n')[0]}`)
  } finally {
    page.off('console', onConsole)
    page.off('pageerror', onPageError)
    page.off('response', onResponse)
    page.off('requestfailed', onFailed)
    entry.requests = net.apiCount()
    net.dispose()
    await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {})
  }
  entry.ms = Date.now() - t0
  entry.status = issues.some((i) => i.severity === 'error') ? 'error' : issues.length ? 'warn' : 'ok'
  return entry
}

export interface CaptureInput {
  options: Options
  origin: string
  runDir: string
  scenes: ResolvedScene[]
  session: Session
  browser: Browser
}

/** Takes every (scene x viewport x theme) picture; combos run in parallel, scenes within a combo in order. */
export async function capture(input: CaptureInput): Promise<ShotEntry[]> {
  const { options: o, origin, runDir, scenes, session, browser } = input
  const entries: ShotEntry[] = []
  const combos: { vp: ViewportDef; theme: ThemeName }[] = []
  for (const vp of o.viewport) for (const theme of o.theme) combos.push({ vp, theme })

  // skipped scenes: one entry each so the report is complete
  const runnable = scenes.filter((s) => s.url)
  for (const s of scenes.filter((x) => !x.url)) {
    entries.push({
      scene: s.scene.name, group: s.group, viewport: '-', theme: '-', file: null, url: null, status: 'skipped',
      skipReason: s.skipReason, ms: 0, issues: [], requests: 0,
    })
  }

  let done = 0
  const total = combos.reduce((n, c) => n + runnable.filter((s) => !s.scene.viewports || s.scene.viewports.some((v) => c.vp.name.startsWith(v))).length, 0)
  const queue = [...combos]
  async function worker() {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const contexts = new Map<AuthMode, Ctx>()
      try {
        for (const s of runnable) {
          if (s.scene.viewports && !s.scene.viewports.some((v) => c.vp.name.startsWith(v))) continue
          const auth = s.scene.auth ?? 'in'
          let ctx = contexts.get(auth)
          if (!ctx) {
            ctx = await newContext(browser, o, c.vp, auth, c.theme, session.baselines, origin)
            contexts.set(auth, ctx)
          }
          const e = await takeShot(ctx, s, c.vp, c.theme, auth, o, origin, session.baselines, runDir, session.jf)
          entries.push(e)
          done++
          const mark = e.status === 'ok' ? 'ok  ' : e.status === 'warn' ? 'warn' : 'ERR '
          log(`${String(done).padStart(4)}/${total} ${mark} ${c.vp.name} ${c.theme} ${s.scene.name} (${e.ms} ms${e.issues.length ? `, ${e.issues.length} issue(s)` : ''})`)
        }
      } finally {
        for (const x of contexts.values()) await x.context.close().catch(() => {})
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(o.workers, combos.length) }, worker))
  return entries
}

/** Headless and muted in every engine (tools/quiet-playwright.mjs enforces it too). */
export async function launch(engine: EngineName = 'chromium', channel: string | null = null): Promise<Browser> {
  const args = ['--mute-audio', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required']
  if (engine === 'chromium' && channel) {
    // an installed browser (msedge, chrome) brings the proprietary codecs the player scenes need; still headless and muted
    try {
      return await chromium.launch({ headless: true, channel, args })
    } catch (e) {
      console.log(`[shots] channel "${channel}" is not available (${(e as Error).message.split('\n')[0]}); using the bundled Chromium`)
    }
  }
  // media.autoplay.*: the same as Chromium's --autoplay-policy flag above (player scenes start without a gesture)
  if (engine === 'firefox') {
    return firefox.launch({
      headless: true,
      firefoxUserPrefs: { 'media.volume_scale': '0.0', 'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0 },
    })
  }
  if (engine === 'webkit') return webkit.launch({ headless: true })
  return chromium.launch({ headless: true, args })
}
