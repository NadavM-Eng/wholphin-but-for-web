/// <reference lib="dom" />
// The scene manifest. One entry per picture; every route of src/app/routes.tsx is covered at least once.
//
// Adding a scene is a few lines:
//   { name: 'search-results', path: async (jf) => `/search?q=${encodeURIComponent((await jf.movie())?.Name ?? 'a')}` },
//   { name: 'settings-dialog', path: '/settings', prepare: async (page) => { await page.getByRole('button', { name: /language/i }).first().click() } },
// `path` may be a function that looks real ids up through the Jellyfin client (return null to skip the scene
// when the server has no such item). `prepare` runs after the page settled; the settle check runs again after it.
// Full field list: ./types.ts (Scene). Helpers for common interactions are at the top of this file.
import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import type { JfClient } from './jellyfin.ts'
import { homeRowsLoaded, tvScenes } from './tvScenes.ts'
import type { Scene, SceneCtx } from './types.ts'
import { uiPattern as P, uiText as T } from './uiText.ts'

// ------------------------------------------------------------------ interaction helpers

/** Focusable things in the page content, excluding the nav drawer / header chrome. */
const CONTENT = '[data-focusable]:not(nav *):not(aside *):not(header *):not([data-nav-drawer] *)'

/** Card-like focusables in the page content that are visible (have an image or a title). */
export function contentCards(page: Page) {
  return page.locator(CONTENT).filter({ visible: true })
}

/** Hover the nth (0-based) content card: the TV app's "focused" look applies on :hover. */
export async function hoverCard(page: Page, n = 2) {
  const cards = contentCards(page)
  await cards.nth(Math.min(n, Math.max(0, (await cards.count()) - 1))).hover()
}

/** Home customization: click an entry of the settings panel (Add row, Source, Settings, Display presets). */
export async function openHomeSettingsEntry(page: Page, name: RegExp) {
  await page.getByRole('button', { name }).first().click()
}

/** Focus the first card of the nth (1-based) visual row of content cards, scrolling it into view. */
export async function focusRow(page: Page, row: number) {
  await page.evaluate(
    ({ sel, row: want }) => {
      const els = Array.from(document.querySelectorAll<HTMLElement>(sel)).filter((e) => {
        const r = e.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      })
      // cluster by the nearest scroll container + vertical position (rows are horizontal strips)
      const rows: HTMLElement[][] = []
      for (const e of els) {
        const top = e.getBoundingClientRect().top + window.scrollY
        const last = rows[rows.length - 1]
        const lastTop = last ? last[0].getBoundingClientRect().top + window.scrollY : -1e9
        if (last && Math.abs(top - lastTop) < 40) last.push(e)
        else rows.push([e])
      }
      const target = rows[Math.min(want - 1, rows.length - 1)]?.[0]
      target?.scrollIntoView({ block: 'center' })
      target?.focus()
    },
    { sel: CONTENT, row },
  )
}

/**
 * Expand the nav drawer and wait until it really is open (the shell opens it behind a hover-intent timer):
 *  - phone / compact layout: tap the menu button (the drawer is a sheet),
 *  - touch with a rail (tablet): tap the rail (first tap only expands it),
 *  - mouse: hover the rail.
 */
export async function expandDrawer(page: Page, ctx: SceneCtx) {
  const nav = page.locator('nav[data-shell-drawer]').first()
  await nav.waitFor({ state: 'attached' })
  const mode = await nav.getAttribute('data-shell-drawer')
  if (mode === 'sheet') {
    await page.getByRole('button', { name: P(ctx.lang, 'web_open_menu', { match: 'contains', i: true }) }).first().click()
  } else if (ctx.viewport.touch) {
    await nav.locator('[data-focusable]').first().tap()
  } else {
    await nav.hover()
  }
  await page.locator('nav[data-shell-drawer][data-open]').waitFor({ state: 'attached', timeout: 3000 })
}

/** Expand the drawer, then point at the first library entry (hover with a mouse, focus on touch). */
export async function pointAtDrawerLibrary(page: Page, ctx: SceneCtx) {
  await expandDrawer(page, ctx)
  const lib = page.locator('nav[data-shell-drawer] [data-drawer-id^="s_"]').first()
  if (ctx.viewport.touch) await lib.focus()
  else await lib.hover()
}

/** Expand the drawer, then point at a drawer entry by its text (profile name, "Settings", ...). */
export async function pointAtDrawerItem(page: Page, ctx: SceneCtx, text: RegExp) {
  await expandDrawer(page, ctx)
  const item = page.locator('nav[data-shell-drawer] [data-focusable]').filter({ hasText: text }).first()
  if (ctx.viewport.touch) await item.focus()
  else await item.hover()
}

/** Click the first button/link/focusable whose text or aria-label matches (cards are often divs labelled by aria-label). */
async function clickByText(page: Page, text: RegExp) {
  const any = page.locator('button, a, [role=button], [data-focusable]')
  await any.filter({ hasText: text }).or(page.getByLabel(text)).first().click({ timeout: 4000 })
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }

/**
 * Answers the Quick Connect endpoints locally. Enabled false shows the password dialog; true shows a fixed code
 * that never gets authorized. The real server is never asked to create a pending request.
 */
async function mockQuickConnect(page: Page, o: { enabled: boolean }) {
  await page.route(/\/QuickConnect\/(Enabled|Initiate|Connect)/, (route) => {
    const url = route.request().url()
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...CORS, 'access-control-allow-methods': '*' } })
    const body = /\/Enabled/.test(url)
      ? String(o.enabled)
      : JSON.stringify({ Secret: 'shots-secret', Code: '123456', Authenticated: false, DateAdded: '2025-01-01T00:00:00Z' })
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body })
  })
}

/** From the server list: first server, first user (opens the login dialog over the user picker). */
async function openLoginDialog(page: Page) {
  await page.locator('[data-focus-group] [data-focusable]').first().click()
  await page.waitForURL(/\/setup\/users/, { timeout: 5000 })
  await page.locator('[data-focus-group] [data-focusable]').first().click()
  await page.waitForURL(/\/setup\/login/, { timeout: 5000 })
}

const q = encodeURIComponent
/**
 * Live TV safety net: every write under /LiveTv/Timers, /LiveTv/SeriesTimers and /LiveTv/Recordings is answered
 * here (204) and never reaches the server; `/LiveTv/Timers/Defaults` gets a realistic SeriesTimerInfoDto. With
 * `schedule` the DVR lists (scheduled timers, active recordings) are mocked too.
 */
export async function mockLiveTvWrites(page: Page, opts: { schedule?: boolean } = {}) {
  await page.route(/\/LiveTv\/(Timers|SeriesTimers|Recordings)(\/|\?|$)/i, async (route) => {
    const req = route.request()
    const url = req.url()
    if (req.method() === 'GET' && /\/LiveTv\/Timers\/Defaults/i.test(url)) {
      const start = Date.now()
      return route.fulfill({
        json: {
          Type: 'SeriesTimer', ProgramId: new URL(url).searchParams.get('programId'), Name: 'Mock', ChannelName: 'Mock',
          StartDate: new Date(start).toISOString(), EndDate: new Date(start + 1800e3).toISOString(), Priority: 0,
          PrePaddingSeconds: 0, PostPaddingSeconds: 0, IsPrePaddingRequired: false, IsPostPaddingRequired: false,
          KeepUntil: 'UntilDeleted', RecordAnyTime: false, RecordAnyChannel: false, RecordNewOnly: false, Days: [], KeepUpTo: 0,
        },
      })
    }
    if (req.method() !== 'GET') return route.fulfill({ status: 204, body: '' })
    if (opts.schedule && /\/LiveTv\/Timers\?/i.test(url)) {
      const t0 = Date.now() + 3600e3
      const prog = (id: string, name: string, start: number, series: boolean) => ({
        Id: id, Name: name, Type: 'Program', ChannelId: 'mock-channel', IsSeries: series, EpisodeTitle: series ? 'Pilot' : null,
        ParentIndexNumber: series ? 1 : null, IndexNumber: series ? 2 : null, Overview: 'Mocked scheduled program.',
        StartDate: new Date(start).toISOString(), EndDate: new Date(start + 1800e3).toISOString(),
      })
      return route.fulfill({
        json: {
          Items: [
            { Id: 'timer1', ProgramInfo: prog('p1', 'Evening News', t0, true) },
            { Id: 'timer2', SeriesTimerId: 'st1', ProgramInfo: prog('p2', 'Cartoon Hour', t0 + 3600e3, true) },
            { Id: 'timer3', ProgramInfo: prog('p3', 'Tomorrow Movie', t0 + 26 * 3600e3, false) },
          ],
          TotalRecordCount: 3,
        },
      })
    }
    if (opts.schedule && /\/LiveTv\/Recordings\?/i.test(url) && /isInProgress=true/i.test(url)) {
      return route.fulfill({
        json: {
          Items: [{ Id: 'rec1', Name: 'Live Match', Type: 'Recording', StartDate: new Date(Date.now() - 600e3).toISOString(), EndDate: new Date(Date.now() + 1200e3).toISOString() }],
          TotalRecordCount: 1,
        },
      })
    }
    return route.continue()
  })
}

const idOr = (item: { Id: string } | null | undefined, make: (id: string) => string) => (item ? make(item.Id) : null)

/** Detail pages: a movie / box set by exact title (test-server fixtures). */
async function byName(jf: JfClient, type: string, name: string) {
  const r = await jf.items({ includeItemTypes: type, searchTerm: name, limit: 5 })
  return r.find((i) => i.Name === name) ?? null
}

/** Clicks a button of a detail page's button row by index (negative = from the end). */
async function clickDetailButton(page: Page, index: number, row = '[data-focus-key="detail-play-buttons"]') {
  const buttons = page.locator(`${row} [role=toolbar] > *`)
  await buttons.first().waitFor({ timeout: 5000 })
  const n = await buttons.count()
  await buttons.nth(index < 0 ? n + index : index).click()
}

async function scrollPageToEnd(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(300)
}

/** Series overview of the test server's Orbital Drift at [season, episode] numbers (null: no ids in the URL). */
async function orbitalEpisode(jf: JfClient, at: [number, number] | null): Promise<string | null> {
  const series = await byName(jf, 'Series', 'Orbital Drift')
  if (!series) return null
  if (!at) return `/series/${series.Id}`
  const eps = await jf.items({ parentId: series.Id, includeItemTypes: 'Episode', recursive: true })
  const e = eps.find((x) => x.ParentIndexNumber === at[0] && x.IndexNumber === at[1])
  return e?.SeasonId ? `/series/${series.Id}?season=${e.SeasonId}&episode=${e.Id}` : null
}

/** A playlist of videos (audio playlists use the same page; they have their own scene). */
async function videoPlaylist(jf: JfClient) {
  return jf.memo('playlist:video', async () => (await jf.first({ includeItemTypes: 'Playlist', mediaTypes: 'Video', recursive: true })) ?? (await jf.playlist()))
}

/** Scenes that open an item page by a lookup. */
function itemScene(name: string, find: (jf: JfClient) => Promise<{ Id: string } | null>, extra: Partial<Scene> = {}): Scene {
  return { name, group: 'detail', path: async (jf) => idOr(await find(jf), (id) => `/item/${id}`), ...extra }
}

function libraryScene(name: string, type: string, extra: Partial<Scene> = {}): Scene {
  return { name, group: 'library', path: async (jf) => idOr(await jf.libraryOf(type), (id) => `/library/${id}`), ...extra }
}

/** Library-grid interaction scenes (src/features/browse); the movie library's Library tab unless noted. */
function browseScenes(): Scene[] {
  const tab = (type: string, key: string) => async (jf: JfClient) => idOr(await jf.libraryOf(type), (id) => `/library/${id}?tab=${key}`)
  const scroller = '[class*="scroller"]'
  const openViewOptions = async (page: Page, ctx: SceneCtx) => {
    await page.getByRole('button', { name: T(ctx.lang, 'view_options') }).first().click()
  }
  /** `layout`: the layout's index in the `view_options_types` string array (Grid, List, Compact List) */
  const pickLayout = async (page: Page, ctx: SceneCtx, layout: number) => {
    await openViewOptions(page, ctx)
    await page.getByText(T(ctx.lang, 'layout'), { exact: true }).click()
    await page.getByRole('menuitem', { name: T(ctx.lang, 'view_options_types', layout), exact: true }).click()
    await page.keyboard.press('Escape')
  }
  // the sort button is named after the current sort (Name)
  const sortButton = (page: Page, ctx: SceneCtx) => page.getByRole('button', { name: P(ctx.lang, 'sort_by_name', { match: 'contains' }) }).first()
  const filterButton = (page: Page, ctx: SceneCtx) => page.getByRole('button', { name: T(ctx.lang, 'filter') }).first()
  const grid = (name: string, prepare?: Scene['prepare']): Scene => ({ name, group: 'library', path: tab('movies', 'library'), prepare })
  return [
    grid('library-movies-sort-menu', async (page, ctx) => {
      await sortButton(page, ctx).click()
    }),
    // right-click = TV long-press on the sort button: flips the direction
    grid('library-movies-sort-desc', async (page, ctx) => {
      await sortButton(page, ctx).click({ button: 'right' })
    }),
    grid('library-movies-filter-menu', async (page, ctx) => {
      await filterButton(page, ctx).click()
    }),
    grid('library-movies-filter-values', async (page, ctx) => {
      await filterButton(page, ctx).click()
      await page.getByRole('menuitem', { name: T(ctx.lang, 'year') }).click()
    }),
    grid('library-movies-view-options', openViewOptions),
    grid('library-movies-letter-jump', async (page) => {
      await page.locator('[data-letter="M"]').click()
    }),
    grid('library-movies-scrolled', async (page) => {
      await page.locator(scroller).first().evaluate((el) => el.scrollBy(0, el.clientHeight))
    }),
    grid('library-movies-list', (page, ctx) => pickLayout(page, ctx, 1)),
    grid('library-movies-compact-list', (page, ctx) => pickLayout(page, ctx, 2)),
    grid('library-grid-context-menu', async (page) => {
      await page.locator('[data-grid-index="0"] [data-card-surface]').click({ button: 'right' })
    }),
    {
      name: 'library-movies-recommended-scrolled',
      group: 'library',
      path: tab('movies', 'recommended'),
      prepare: async (page) => {
        await page.locator('[data-home-row]').first().evaluate((el) => el.parentElement?.scrollBy(0, 400))
      },
    },
    { name: 'library-tvshows-genres', group: 'library', path: tab('tvshows', 'genres') },
    { name: 'library-tvshows-studios', group: 'library', path: tab('tvshows', 'studios') },
    // a fresh load of /grid without its navigation state shows a notice
    { name: 'grid-missing-state', group: 'browse', path: '/grid', allowEmpty: true },
  ]
}

// ------------------------------------------------------------------ player, settings and Seerr helpers

/** Settings row by preference id (PreferenceRow's data-pref-id). */
async function clickPref(page: Page, id: string) {
  const row = page.locator(`[data-pref-id="${id}"]`).first()
  await row.waitFor({ state: 'visible', timeout: 8000 })
  await row.scrollIntoViewIfNeeded()
  const inner = row.locator('[data-focusable]').first()
  await ((await inner.count()) ? inner : row).click({ timeout: 4000 })
}

/** Movie by name on the server (the test server's Codec Zoo files), else the first movie. */
async function movieNamed(jf: JfClient, name: string) {
  return jf.memo(`movie:${name}`, async () => (await jf.first({ includeItemTypes: 'Movie', searchTerm: name, recursive: true })) ?? (await jf.movie()))
}

/** Wait until the player shows a decoded frame, then pause it with the overlay's Pause button. */
async function pausePlayer(page: Page, ctx: SceneCtx) {
  await page.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 2, null, { timeout: 20000 })
  // the overlay appears on pointer movement, or on a tap on touch screens
  if (ctx.viewport.touch) await page.touchscreen.tap(ctx.viewport.width / 2, ctx.viewport.height / 3)
  else {
    await page.mouse.move(640, 360)
    await page.mouse.move(660, 380)
  }
  const pause = page.getByRole('button', { name: P(ctx.lang, 'web_playback_pause', { i: true }) }).first()
  await pause.waitFor({ state: 'visible', timeout: 5000 })
  await pause.click()
  await page.waitForFunction(() => document.querySelector('video')?.paused === true, null, { timeout: 5000 })
}

/**
 * Paused player, then one of the overlay's buttons (settings, subtitles, audio: string keys, whole name) and
 * optionally an entry of its sheet (string key, anywhere in the text).
 */
function playerSheet(button: string, entry?: string) {
  return async (page: Page, ctx: SceneCtx) => {
    await pausePlayer(page, ctx)
    await page.getByRole('button', { name: P(ctx.lang, button, { i: true }) }).first().click()
    const sheet = page.locator('[data-player-sheet]').first()
    await sheet.waitFor({ state: 'visible', timeout: 4000 })
    if (entry) {
      await sheet.getByText(P(ctx.lang, entry, { match: 'contains', i: true })).first().click()
      await page.waitForTimeout(300)
    }
  }
}

function playerScene(name: string, prepare: (page: Page, ctx: SceneCtx) => Promise<void>, item = 'Multi Track'): Scene {
  return {
    name,
    group: 'playback',
    path: async (jf) => idOr(await movieNamed(jf, item), (id) => `/play/${id}?t=27000`),
    prepare,
    extraWaitMs: 800,
  }
}

/** Seerr test-account credentials (the account /dev/login uses), read from .env.local; never logged. */
function seerrCreds(): { username: string; password: string } | null {
  try {
    const env = Object.fromEntries(
      readFileSync('.env.local', 'utf8')
        .split(/\r?\n/)
        .filter((l) => l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
    )
    return env.TEST_JELLYFIN_USER && env.TEST_JELLYFIN_PASSWORD ? { username: env.TEST_JELLYFIN_USER, password: env.TEST_JELLYFIN_PASSWORD } : null
  } catch {
    return null
  }
}

/**
 * Discover needs a signed-in Seerr user. Signs the browser in to Seerr (through the dev proxy) with the limited test
 * account, records the link for the current Jellyfin user the way linkSeerr() does, and reloads. Every Seerr write
 * other than the sign-in is answered locally (a request "succeeds" without reaching Seerr); the route stays on the page.
 */
async function linkSeerrForShots(page: Page) {
  await page.route('**/seerr-proxy/api/v1/**', (route) => {
    const req = route.request()
    if (req.method() === 'GET' || /\/auth\/jellyfin$/.test(req.url())) return route.continue()
    const body = /\/request$/.test(req.url())
      ? JSON.stringify({ id: 999999, status: 1, createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z', is4k: false })
      : '{}'
    return route.fulfill({ status: req.method() === 'POST' ? 201 : 200, contentType: 'application/json', body })
  })
  const creds = seerrCreds()
  if (!creds) throw new Error('no Seerr test credentials in .env.local')
  const linked = await page.evaluate(async (c) => {
    const login = await fetch('/seerr-proxy/api/v1/auth/jellyfin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: c.username, password: c.password }),
      credentials: 'include',
    })
    if (!login.ok) return `login ${login.status}`
    const me = (await (await fetch('/seerr-proxy/api/v1/auth/me', { credentials: 'include' })).json()) as { id: number }
    // the signed-in user is the persisted "most recent" one (the crawler signs in through /dev/login)
    const raw = JSON.parse(localStorage.getItem('wholphin.session.v1') ?? '{}') as {
      state?: { mostRecent?: { serverId?: string | null; userId?: string | null } }
    }
    const cur = raw.state?.mostRecent
    if (!cur?.serverId || !cur.userId) return 'no session'
    // no local helper functions in here: tsx would wrap them in __name(), which does not exist in the page
    const key = `${cur.serverId.replace(/-/g, '').toLowerCase()}:${cur.userId.replace(/-/g, '').toLowerCase()}`
    const links = JSON.parse(localStorage.getItem('wholphin.seerr.links.v1') ?? '{}') as Record<string, unknown>
    links[key] = { method: 'jellyfin', username: c.username, seerrUserId: me.id, linkedAt: Date.now() }
    localStorage.setItem('wholphin.seerr.links.v1', JSON.stringify(links))
    return 'ok'
  }, creds)
  if (linked !== 'ok') throw new Error(`Seerr link failed: ${linked}`)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('[data-focus-key^="discover:"], main h1, main h2').first().waitFor({ state: 'visible', timeout: 15000 })
}

/** A Discover scene: link Seerr, then an optional interaction. */
function discoverScene(name: string, path: string, then?: (page: Page, ctx: SceneCtx) => Promise<void>, extra: Partial<Scene> = {}): Scene {
  return {
    name,
    group: 'discover',
    path,
    extraWaitMs: 1000,
    // Seerr links available titles to the Jellyfin it is configured with (the real server): signed in to the test
    // server, those posters and logos would 404. Run with --server real (read-only: requests are answered locally).
    servers: ['real'],
    // titles without Rotten Tomatoes data answer 404 on /ratings; the UI ignores it like upstream
    allow: [/404 GET \/seerr-proxy\/api\/v1\/(movie|tv)\/\d+\/ratings/],
    prepare: async (page, ctx) => {
      await linkSeerrForShots(page)
      if (then) await then(page, ctx)
    },
    ...extra,
  }
}

// ------------------------------------------------------------------ the manifest

/** Album by name (test server), else the first album. */
async function albumNamed(jf: JfClient, name: string) {
  return jf.memo(`album:${name}`, async () => (await jf.first({ includeItemTypes: 'MusicAlbum', searchTerm: name, recursive: true })) ?? (await jf.album()))
}

/** Click the album page's Play button, wait until the music plays, then pause it (the network settles). */
async function startAlbum(page: Page, ctx: SceneCtx, opts: { song?: number; pause?: boolean } = {}) {
  if (opts.song != null) await page.locator('[data-focus-key^="album-song:"]').nth(opts.song).click()
  else await page.getByRole('button', { name: P(ctx.lang, 'play', { i: true }) }).first().click()
  await page.locator('[data-mini-player]').waitFor({ state: 'visible', timeout: 10000 })
  // the mini player's progress moves once audio is decoding
  await page.waitForFunction(() => {
    const fill = document.querySelector<HTMLElement>('[data-mini-player] [aria-hidden] > div')
    return !!fill && parseFloat(fill.style.width) > 0
  }, null, { timeout: 15000 })
  if (opts.pause !== false) await page.locator('[data-mini-player]').getByRole('button', { name: P(ctx.lang, 'web_playback_pause', { i: true }) }).click()
}

/** Album page -> play -> Now Playing (through the mini player) with the controls shown. */
function nowPlayingScene(name: string, album: string, then?: (page: Page, ctx: SceneCtx) => Promise<void>, song?: number): Scene {
  return {
    name,
    group: 'music',
    servers: ['test'],
    path: async (jf) => idOr(await albumNamed(jf, album), (id) => `/item/${id}`),
    prepare: async (page, ctx) => {
      await startAlbum(page, ctx, { song })
      await page.locator('[data-mini-player] a').first().click()
      await page.waitForURL(/\/now-playing/, { timeout: 5000 })
      if (then) await then(page, ctx)
    },
    extraWaitMs: 600,
  }
}

/** Shows the Now Playing controls (pointer move, or a tap on touch screens). */
async function showNowPlayingControls(page: Page, ctx: SceneCtx) {
  // the page must be mounted before it can see the pointer: WebKit drops a move sent right after the URL change
  await page.locator('[data-now-playing]').waitFor({ state: 'visible', timeout: 4000 })
  const shown = page.locator('[data-now-playing] [data-visible]')
  for (let attempt = 0; attempt < 4; attempt++) {
    if (ctx.viewport.touch) await page.touchscreen.tap(ctx.viewport.width / 2, 40)
    else {
      await page.mouse.move(400 + attempt * 7, 300)
      await page.mouse.move(420 + attempt * 7, 320)
    }
    if (await shown.waitFor({ state: 'visible', timeout: 1000 }).then(() => true, () => false)) return
  }
  await shown.waitFor({ state: 'visible', timeout: 1000 })
}

const BASE_SCENES: Scene[] = [
  // ---- setup (signed out / remembered server) ----
  { name: 'setup-server-empty', group: 'setup', auth: 'out', path: '/setup/servers' },
  {
    // The web has no LAN discovery step: the dialog opens straight on manual URL entry.
    name: 'setup-add-server-dialog',
    group: 'setup',
    auth: 'out',
    path: '/setup/servers',
    prepare: (page, ctx) => clickByText(page, P(ctx.lang, 'add_server', { match: 'contains', i: true })),
  },
  {
    name: 'setup-add-server-typed',
    group: 'setup',
    auth: 'out',
    path: '/setup/servers',
    prepare: async (page, ctx) => {
      await clickByText(page, P(ctx.lang, 'add_server', { match: 'contains', i: true }))
      await page.locator('[role=dialog] input').first().fill('http://192.168.1.50:8096')
    },
  },
  { name: 'setup-server-list', group: 'setup', auth: 'saved', path: '/setup/servers' },
  {
    name: 'setup-user-list',
    group: 'setup',
    auth: 'saved',
    path: '/setup/servers',
    prepare: async (page) => {
      await page.locator('[data-focus-group] [data-focusable]').first().click()
      await page.waitForURL(/\/setup\/users/, { timeout: 5000 })
    },
  },
  {
    // A server without Quick Connect: the user picker with the username/password dialog.
    name: 'setup-login',
    group: 'setup',
    auth: 'saved',
    path: '/setup/servers',
    prepare: async (page) => {
      await mockQuickConnect(page, { enabled: false })
      await openLoginDialog(page)
      await page.locator('[role=dialog] input[type=password]').waitFor({ state: 'visible' })
    },
  },
  {
    // The same dialog after a rejected password (the server answer is mocked: no real failed login is recorded).
    name: 'setup-login-error',
    group: 'setup',
    auth: 'saved',
    allow: [/401 POST \/Users\/AuthenticateByName/],
    path: '/setup/servers',
    prepare: async (page) => {
      await mockQuickConnect(page, { enabled: false })
      await page.route('**/Users/AuthenticateByName', (route) =>
        route.fulfill({ status: 401, headers: CORS, contentType: 'application/json', body: '{}' }),
      )
      await openLoginDialog(page)
      const pw = page.locator('[role=dialog] input[type=password]')
      await pw.fill('wrong-password')
      await pw.press('Enter')
      await page.locator('[role=dialog] [role=alert], [role=dialog] [data-error]').first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
    },
  },
  {
    // Quick Connect on, with a fixed mocked code: deterministic, and no pending request is left on the server.
    name: 'setup-quick-connect',
    group: 'setup',
    auth: 'saved',
    path: '/setup/servers',
    prepare: async (page) => {
      await mockQuickConnect(page, { enabled: true })
      await openLoginDialog(page)
      await page.locator('[data-testid="quick-connect-code"]').waitFor({ timeout: 5000 })
    },
  },

  // ---- home + shell ----
  { name: 'home', group: 'home', path: '/', waitFor: homeRowsLoaded },
  { name: 'home-card-hover', group: 'home', path: '/', waitFor: homeRowsLoaded, prepare: (page) => hoverCard(page, 2) },
  { name: 'home-drawer', group: 'home', path: '/', waitFor: homeRowsLoaded, prepare: expandDrawer },
  {
    name: 'home-drawer-library',
    group: 'home',
    path: '/',
    waitFor: homeRowsLoaded,
    prepare: pointAtDrawerLibrary,
  },
  { name: 'home-drawer-profile', group: 'home', path: '/', waitFor: homeRowsLoaded, prepare: (page, ctx) => pointAtDrawerItem(page, ctx, /./) },
  { name: 'home-drawer-settings', group: 'home', path: '/', waitFor: homeRowsLoaded, prepare: (page, ctx) => pointAtDrawerItem(page, ctx, P(ctx.lang, 'settings', { match: 'contains', i: true })) },
  {
    name: 'home-context-menu',
    group: 'home',
    path: '/',
    waitFor: homeRowsLoaded,
    prepare: async (page) => {
      const card = contentCards(page).nth(1)
      await card.click({ button: 'right' })
    },
  },
  ...[2, 3, 4, 5, 6].map(
    (n): Scene => ({ name: `home-row-${n}`, group: 'home', path: '/', waitFor: homeRowsLoaded, prepare: (page) => focusRow(page, n) }),
  ),
  // the row id is a numeric index into the home settings (MoreHomeRowPage), not a row name: 0 is the first configured row
  { name: 'home-more-row', group: 'home', path: '/home/row/0' },
  // allowEmpty: the preview shows 'No results' rows for libraries with nothing recently added (HomeSettingsPage.kt preview)
  { name: 'home-settings', group: 'home', allowEmpty: true, path: '/home/settings' },
  // ---- home customization (HomeSettingsPage): inner pages, dialogs, the save prompt ----
  { name: 'home-settings-add-row', group: 'home', allowEmpty: true, path: '/home/settings', prepare: (page, ctx) => openHomeSettingsEntry(page, P(ctx.lang, 'add_row')) },
  {
    name: 'home-settings-row-types',
    group: 'home', allowEmpty: true,
    path: '/home/settings',
    prepare: async (page, ctx) => {
      await openHomeSettingsEntry(page, P(ctx.lang, 'add_row'))
      await page.locator('[data-hs-key^="lib:"] [data-focusable]').first().click()
    },
  },
  {
    name: 'home-settings-row-settings',
    group: 'home', allowEmpty: true,
    path: '/home/settings',
    prepare: async (page) => {
      await page.locator('[data-row-entry] [data-focusable]').first().click()
    },
  },
  {
    name: 'home-settings-row-choice',
    group: 'home', allowEmpty: true,
    path: '/home/settings',
    prepare: async (page, ctx) => {
      await page.locator('[data-row-entry] [data-focusable]').first().click()
      await page.getByRole('button', { name: P(ctx.lang, 'aspect_ratio', { match: 'contains' }) }).first().click()
    },
  },
  { name: 'home-settings-global', group: 'home', allowEmpty: true, path: '/home/settings', prepare: (page, ctx) => openHomeSettingsEntry(page, P(ctx.lang, 'settings')) },
  {
    name: 'home-settings-removed-next-up',
    group: 'home', allowEmpty: true,
    path: '/home/settings',
    prepare: async (page, ctx) => {
      await openHomeSettingsEntry(page, P(ctx.lang, 'settings'))
      await page.getByRole('button', { name: P(ctx.lang, 'view_removed_next_up', { match: 'contains' }) }).click()
    },
  },
  { name: 'home-settings-presets', group: 'home', allowEmpty: true, path: '/home/settings', prepare: (page, ctx) => openHomeSettingsEntry(page, P(ctx.lang, 'display_presets', { match: 'prefix' })) },
  { name: 'home-settings-source', group: 'home', allowEmpty: true, path: '/home/settings', prepare: (page, ctx) => openHomeSettingsEntry(page, P(ctx.lang, 'web_source', { match: 'prefix' })) },
  {
    name: 'home-settings-search-collection',
    group: 'home', allowEmpty: true,
    path: '/home/settings',
    prepare: async (page, ctx) => {
      await openHomeSettingsEntry(page, P(ctx.lang, 'add_row'))
      await page.getByRole('button', { name: P(ctx.lang, 'collection') }).click()
    },
  },
  {
    // a change (move the first row down), then Back at the row list: the Save dialog
    name: 'home-settings-save-dialog',
    group: 'home', allowEmpty: true,
    path: '/home/settings',
    prepare: async (page, ctx) => {
      await page.locator('[data-row-entry]').first().getByRole('button', { name: P(ctx.lang, 'web_move_down', { match: 'contains' }) }).click()
      await page.keyboard.press('Escape')
    },
  },
  { name: 'search', group: 'search', path: '/search' },
  {
    name: 'search-results',
    group: 'search',
    path: async (jf) => {
      const m = await jf.movie()
      return `/search?q=${q((m?.Name ?? 'a').split(/\s+/).find((w) => w.length >= 3) ?? 'a')}`
    },
    // the result rows can start after a quiet network gap (lazy route chunk, then the library list)
    waitFor: '[data-search-row]',
  },
  // ---- search (track: search) ----
  {
    name: 'search-typed',
    group: 'search',
    path: '/search',
    prepare: async (page, ctx) => {
      await page.getByRole('searchbox', { name: T(ctx.lang, 'search') }).fill('the')
      await page.waitForTimeout(1200) // 750 ms debounce
    },
  },
  {
    name: 'search-results-focused',
    group: 'search',
    path: '/search',
    prepare: async (page, ctx) => {
      const field = page.getByRole('searchbox', { name: T(ctx.lang, 'search') })
      await field.fill('the')
      await field.press('Enter') // explicit search: focus jumps to the first row with results
      await page.waitForTimeout(800)
    },
  },
  {
    name: 'search-scrolled',
    group: 'search',
    path: '/search?q=e',
    prepare: async (page) => {
      await page.locator('[data-search-row]').first().waitFor()
      await page.mouse.move(600, 500)
      await page.mouse.wheel(0, 700)
    },
  },
  {
    name: 'search-context-menu',
    group: 'search',
    path: '/search?q=the',
    prepare: async (page) => {
      await page.locator('[data-search-row] a[data-focusable]').first().click({ button: 'right' })
    },
  },
  {
    name: 'search-view-options',
    group: 'search',
    path: '/search?q=the',
    prepare: async (page, ctx) => {
      await page.getByRole('button', { name: T(ctx.lang, 'view_options') }).click()
    },
  },
  {
    name: 'search-include-types',
    group: 'search',
    path: '/search?q=the',
    prepare: async (page, ctx) => {
      await page.getByRole('button', { name: T(ctx.lang, 'view_options') }).click()
      await page.getByText(T(ctx.lang, 'include_types')).click()
    },
  },
  { name: 'search-no-results', group: 'search', path: '/search?q=zzqxjv' },
  { name: 'search-hebrew', group: 'search', path: `/search?q=${q('אהבה')}`, servers: ['real'] },
  { name: 'search-japanese', group: 'search', path: `/search?q=${q('の')}`, servers: ['real'] },
  { name: 'favorites', group: 'browse', path: '/favorites' },
  {
    // ItemGridState contract of src/features/browse/data/gridRequestKinds.ts ("View more" of a Recently added row)
    name: 'grid',
    group: 'browse',
    path: '/grid',
    state: {
      title: 'recently_added',
      titleIsKey: true,
      request: 'items',
      params: { query: { recursive: true, includeItemTypes: ['Movie'], sortBy: ['DateCreated'], sortOrder: ['Descending'], fields: ['Overview', 'SortName'] } },
      initialPosition: 0,
    },
  },

  // ---- detail ----
  itemScene('item-movie', (jf) => jf.movie()),
  itemScene('item-movie-resume', async (jf) => {
    // jf.resumable() prefers an episode; look for an in-progress movie explicitly
    const r = await jf.get<{ Items?: { Id: string; Type?: string }[] }>('/UserItems/Resume', { userId: jf.userId, limit: 20, mediaTypes: 'Video' })
    return r?.Items?.find((i) => i.Type === 'Movie') ?? null
  }),
  itemScene('item-series', async (jf) => (await jf.seriesWithSeasons())?.series ?? null),
  itemScene('item-season', async (jf) => {
    const s = await jf.seriesWithSeasons()
    return s ? ((await jf.episodeOf(s.series))?.season ?? null) : null
  }, { redirectsTo: /^\/series\// }), // upstream opens a Season as SeriesOverview
  itemScene('item-episode', async (jf) => {
    const s = await jf.seriesWithSeasons()
    return s ? ((await jf.episodeOf(s.series))?.episode ?? null) : null
  }),
  itemScene('item-episode-resume', async (jf) => {
    const r = await jf.resumable()
    return r?.Type === 'Episode' ? r : null
  }),
  itemScene('item-boxset', (jf) => jf.boxSet()),
  // a video playlist; the audio one (same page, music menu and queue markers) is item-playlist-audio
  itemScene('item-playlist', (jf) => videoPlaylist(jf)),
  itemScene('item-person', (jf) => jf.person()),
  itemScene('item-album', (jf) => jf.album()),
  itemScene('item-artist', (jf) => jf.artist()),
  itemScene('item-audio', (jf) => jf.audio()),
  itemScene('item-photo-album', (jf) => jf.photoAlbum()),
  // upstream has no photo page: the web opens the viewer on the photo's album
  itemScene('item-photo', (jf) => jf.photo(), { redirectsTo: /^\/slideshow\// }),
  // ---- detail pages, part 1 (src/features/detail): interaction scenes. Named test-server items are looked up
  // by title and skipped (null) on a server without them; selectors are structural so --rtl runs work too.
  itemScene('item-movie-scrolled', (jf) => jf.movie(), { prepare: (page) => scrollPageToEnd(page) }),
  itemScene('item-movie-tracks', (jf) => byName(jf, 'Movie', 'Multi Track Showcase')),
  itemScene('item-movie-tracks-more-menu', (jf) => byName(jf, 'Movie', 'Multi Track Showcase'), { prepare: (page) => clickDetailButton(page, -1) }),
  itemScene('item-movie-tracks-subtitles', (jf) => byName(jf, 'Movie', 'Multi Track Showcase'), {
    prepare: async (page) => {
      await clickDetailButton(page, -1)
      // menu: Play / Resume…, Choose Audio, Choose Subtitles, …
      const items = page.locator('[role=dialog] [role=menuitem]')
      const byText = items.filter({ hasText: /subtit|כתוביות/i })
      await ((await byText.count()) ? byText.first() : items.nth(2)).click()
    },
  }),
  itemScene('item-movie-tracks-media-info', (jf) => byName(jf, 'Movie', 'Multi Track Showcase'), {
    prepare: async (page) => {
      await page.locator('main header [role=button]').first().click()
    },
  }),
  itemScene('item-movie-versions', (jf) => byName(jf, 'Movie', 'Elephants Dream')),
  itemScene('item-movie-versions-dialog', (jf) => byName(jf, 'Movie', 'Elephants Dream'), { prepare: (page) => clickDetailButton(page, 1) }),
  itemScene('item-movie-chapters', (jf) => byName(jf, 'Movie', 'Chapter Marathon'), { prepare: (page) => scrollPageToEnd(page) }),
  itemScene('item-movie-trailer-extras', (jf) => byName(jf, 'Movie', 'Big Buck Bunny'), { prepare: (page) => scrollPageToEnd(page) }),
  itemScene('item-movie-add-to-playlist', (jf) => jf.movie(), {
    prepare: async (page) => {
      await clickDetailButton(page, -1)
      // "Add to playlist" opens the playlist picker (nothing is written)
      await page.locator('[role=dialog] [role=menuitem]').filter({ hasText: /playlist|רשימת/i }).first().click()
      await page.locator('[role=dialog] [role=menu]').waitFor({ timeout: 5000 }).catch(() => {})
    },
  }),
  itemScene('item-boxset-view-options', (jf) => jf.boxSet(), { prepare: (page) => clickDetailButton(page, -2, '[data-focus-key="collection-buttons"]') }),
  itemScene('item-boxset-sort-menu', (jf) => jf.boxSet(), {
    prepare: async (page) => {
      await page.locator('[data-focus-key="collection-buttons"] > :last-child button').first().click()
    },
  }),
  itemScene('item-playlist-row-menu', (jf) => videoPlaylist(jf), {
    prepare: async (page) => {
      // the playlist is a LibraryGrid list: row 0's last button is its More button
      const more = page.locator('[data-page-root] [data-grid-index="0"] button').last()
      await more.waitFor({ timeout: 5000 })
      await more.click()
    },
  }),
  itemScene('item-person-scrolled', (jf) => jf.person(), { prepare: (page) => scrollPageToEnd(page) }),
  // ---- detail fixes (wave 3b): extras group grid, chooser over the menu, box-set filter and focused-item header.
  itemScene('item-movie-extras-group-grid', (jf) => byName(jf, 'Movie', 'Big Buck Bunny'), {
    prepare: async (page) => {
      const group = page.locator('[data-focus-key^="extras:"]').filter({ hasText: /\d/ }).last()
      await group.scrollIntoViewIfNeeded()
      await group.locator('[data-card-surface]').first().click()
      await page.waitForURL(/\/grid$/, { timeout: 5000 }).catch(() => {})
    },
  }),
  itemScene('item-movie-tracks-audio-over-menu', (jf) => byName(jf, 'Movie', 'Multi Track Showcase'), {
    prepare: async (page) => {
      await clickDetailButton(page, -1)
      // Choose Audio keeps the menu open underneath (upstream dismissOnClick = false)
      await page.locator('[role=dialog] [role=menuitem]').nth(1).click()
    },
  }),
  itemScene('item-boxset-filter-menu', (jf) => jf.boxSet(), {
    prepare: async (page) => {
      await page.locator('[data-focus-key="collection-buttons"] > :last-child button').last().click()
    },
  }),
  itemScene('item-boxset-focused-header', (jf) => jf.boxSet(), {
    prepare: async (page) => {
      // keyboard focus in the items swaps the collection header for the focused item's header
      await page.locator('[data-focus-key="collection-buttons"] button').first().focus()
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowDown')
      await page.waitForTimeout(400)
    },
  }),
  {
    name: 'series-overview',
    group: 'detail',
    path: async (jf) => idOr((await jf.seriesWithSeasons())?.series, (id) => `/series/${id}`),
  },
  {
    name: 'series-overview-episode',
    group: 'detail',
    path: async (jf) => {
      const s = await jf.seriesWithSeasons()
      const e = s ? await jf.episodeOf(s.series) : null
      return s && e ? `/series/${s.series.Id}?season=${e.season.Id}&episode=${e.episode.Id}` : null
    },
  },
  {
    name: 'series-overview-last-season',
    group: 'detail',
    path: async (jf) => {
      const s = await jf.seriesWithSeasons()
      const last = s?.seasons[s.seasons.length - 1]
      return s && last && s.seasons.length > 1 ? `/series/${s.series.Id}?season=${last.Id}` : null
    },
  },
  // ---- detail pages, part 2: series details and series overview (src/features/detail/series). Named items are the
  // test server's Orbital Drift (Specials, missing S02E03, an unaired S03E05); skipped on a server without it.
  itemScene('item-series-orbital', (jf) => byName(jf, 'Series', 'Orbital Drift')),
  itemScene('item-series-scrolled', (jf) => byName(jf, 'Series', 'Orbital Drift'), { prepare: (page) => scrollPageToEnd(page) }),
  itemScene('item-series-watched-confirm', (jf) => byName(jf, 'Series', 'Orbital Drift'), {
    prepare: (page) => clickDetailButton(page, 2, '[data-focus-key="series-buttons"]'),
  }),
  itemScene('item-series-season-menu', (jf) => byName(jf, 'Series', 'Orbital Drift'), {
    prepare: async (page) => {
      await page.locator('[data-focus-key^="series-seasons"] [data-card-surface]').nth(1).click({ button: 'right' })
    },
  }),
  { name: 'series-orbital', group: 'detail', path: (jf) => orbitalEpisode(jf, null) },
  { name: 'series-orbital-season-1', group: 'detail', path: (jf) => orbitalEpisode(jf, [1, 1]) },
  {
    name: 'series-orbital-episode-2',
    group: 'detail',
    path: (jf) => orbitalEpisode(jf, [1, 2]),
    // the first arrow key focuses the selected card (keyboard focus ring, as the TV's focused card)
    prepare: async (page) => {
      await page.keyboard.press('ArrowRight')
    },
  },
  { name: 'series-orbital-after-missing', group: 'detail', path: (jf) => orbitalEpisode(jf, [2, 4]) },
  { name: 'series-orbital-unaired', group: 'detail', path: (jf) => orbitalEpisode(jf, [3, 5]) },
  {
    name: 'series-orbital-dimmed',
    group: 'detail',
    path: (jf) => orbitalEpisode(jf, [1, 2]),
    // keyboard: the selected card, then Down to the buttons (the other cards dim to 40%)
    prepare: async (page) => {
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowDown')
    },
  },
  {
    name: 'series-orbital-tabs-focused',
    group: 'detail',
    path: (jf) => orbitalEpisode(jf, [1, 2]),
    prepare: async (page) => {
      await page.locator('[role=tablist] [aria-selected=true]').focus()
      await page.keyboard.press('ArrowRight')
    },
  },
  {
    name: 'series-orbital-specials',
    group: 'detail',
    path: (jf) => orbitalEpisode(jf, null),
    prepare: async (page) => {
      await page.locator('[role=tablist] [role=tab]').first().click()
      await page.locator('[data-ep-index="0"]').waitFor({ timeout: 5000 })
    },
  },
  {
    name: 'series-orbital-episode-menu',
    group: 'detail',
    path: (jf) => orbitalEpisode(jf, [1, 1]),
    prepare: async (page) => {
      await page.locator('[data-ep-index="0"] [data-card-surface]').click({ button: 'right' })
    },
  },
  {
    name: 'series-orbital-more-menu',
    group: 'detail',
    path: (jf) => orbitalEpisode(jf, [1, 1]),
    prepare: (page) => clickDetailButton(page, -1),
  },
  {
    name: 'series-orbital-season-tab-menu',
    group: 'detail',
    path: (jf) => orbitalEpisode(jf, [1, 1]),
    prepare: async (page) => {
      await page.locator('[role=tablist] [role=tab]').nth(2).click({ button: 'right' })
    },
  },
  { name: 'series-orbital-scrolled', group: 'detail', path: (jf) => orbitalEpisode(jf, [1, 1]), prepare: (page) => scrollPageToEnd(page) },
  {
    // the longest season of the series with the most seasons, opened deep inside (paged episode search)
    name: 'series-overview-deep',
    group: 'detail',
    path: async (jf) => {
      const s = await jf.seriesWithSeasons()
      if (!s) return null
      const eps = await jf.items({ parentId: s.series.Id, includeItemTypes: 'Episode', recursive: true, sortBy: 'ParentIndexNumber,IndexNumber', limit: 400 })
      const e = eps[Math.floor(eps.length * 0.8)]
      return e?.SeasonId ? `/series/${s.series.Id}?season=${e.SeasonId}&episode=${e.Id}` : null
    },
  },

  // ---- libraries ----
  libraryScene('library-movies', 'movies'),
  libraryScene('library-tvshows', 'tvshows'),
  libraryScene('library-music', 'music'),
  libraryScene('library-homevideos', 'homevideos'),
  libraryScene('library-boxsets', 'boxsets'),
  libraryScene('library-playlists', 'playlists'),
  {
    // a mixed-content library: CollectionType "folders", or none at all (how Jellyfin 10.11 reports "Mixed content");
    // the Live TV recordings view is also untyped, so it is excluded
    name: 'library-folders',
    group: 'library',
    path: async (jf) => {
      const rec = await jf.recordingsFolder()
      const views = await jf.views()
      const v = views.find((x) => x.CollectionType === 'folders') ?? views.find((x) => !x.CollectionType && x.Id !== rec?.Id)
      return idOr(v ?? null, (id) => `/library/${id}`)
    },
  },
  {
    name: 'library-movies-tab-1',
    group: 'library',
    path: async (jf) => idOr(await jf.libraryOf('movies'), (id) => `/library/${id}?tab=1`),
  },
  {
    name: 'library-movies-tab-2',
    group: 'library',
    path: async (jf) => idOr(await jf.libraryOf('movies'), (id) => `/library/${id}?tab=2`),
  },
  {
    name: 'library-movies-tab-3',
    group: 'library',
    path: async (jf) => idOr(await jf.libraryOf('movies'), (id) => `/library/${id}?tab=3`),
  },
  {
    name: 'library-tvshows-tab-1',
    group: 'library',
    path: async (jf) => idOr(await jf.libraryOf('tvshows'), (id) => `/library/${id}?tab=1`),
  },
  {
    name: 'library-genre-filtered',
    group: 'library',
    path: async (jf) => {
      const lib = await jf.libraryOf('movies')
      // a genre of this library (the first server-wide genre can belong to another library and show nothing)
      const g = lib && (await jf.get<{ Items?: { Id: string }[] }>('/Genres', { userId: jf.userId, parentId: lib.Id, limit: 1 }))?.Items?.[0]
      return lib && g ? `/library/${lib.Id}/filtered?type=Genre&filter=${g.Id}&collectionType=movies&recursive=true` : null
    },
  },
  {
    name: 'library-studio-filtered',
    group: 'library',
    path: async (jf) => {
      const lib = await jf.libraryOf('movies')
      const s = lib && (await jf.get<{ Items?: { Id: string }[] }>('/Studios', { userId: jf.userId, parentId: lib.Id, limit: 1 }))?.Items?.[0]
      return lib && s ? `/library/${lib.Id}/filtered?type=Studio&filter=${s.Id}&collectionType=movies&recursive=true` : null
    },
  },

  // ---- library browsing (track: browse): menus, dialogs, letter jump, list mode, scrolled states ----
  ...browseScenes(),

  // ---- live tv, discover ----
  { name: 'livetv', group: 'livetv', path: '/livetv' },
  {
    name: 'livetv-recordings',
    group: 'livetv',
    path: async (jf) => idOr(await jf.recordingsFolder(), (id) => `/recordings/${id}`),
  },
  // Recording / timer writes are always answered locally (mockLiveTvWrites): never create a recording on a server.
  { name: 'livetv-library', group: 'livetv', path: async (jf) => idOr(await jf.libraryOf('livetv'), (id) => `/library/${id}`) },
  {
    name: 'livetv-keyboard',
    group: 'livetv',
    path: '/livetv',
    prepare: async (page) => {
      await mockLiveTvWrites(page)
      await page.locator('[data-focus-default]').focus()
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowDown')
    },
  },
  {
    name: 'livetv-program-dialog',
    group: 'livetv',
    path: '/livetv',
    prepare: async (page) => {
      await mockLiveTvWrites(page)
      await page.locator('[data-focus-key^="lt-program:"]:not([data-fake])').nth(1).click()
      await page.getByRole('dialog').getByRole('button').first().waitFor()
    },
  },
  {
    name: 'livetv-channel-dialog',
    group: 'livetv',
    path: '/livetv',
    prepare: async (page) => {
      await page.locator('[data-channel]').first().click()
    },
  },
  {
    name: 'livetv-view-options',
    group: 'livetv',
    path: '/livetv',
    prepare: async (page, ctx) => {
      await page.locator(`button[aria-label="${T(ctx.lang, 'view_options')}"]`).click()
    },
  },
  { name: 'livetv-dvr', group: 'livetv', path: '/livetv?tab=1', allowEmpty: true },
  {
    name: 'livetv-dvr-mocked',
    group: 'livetv',
    path: '/livetv',
    prepare: async (page) => {
      await mockLiveTvWrites(page, { schedule: true })
      await page.getByRole('tab').nth(1).click()
      await page.getByText('Cartoon Hour').waitFor()
    },
  },
  {
    name: 'livetv-dvr-dialog',
    group: 'livetv',
    path: '/livetv',
    prepare: async (page) => {
      await mockLiveTvWrites(page, { schedule: true })
      await page.getByRole('tab').nth(1).click()
      await page.getByText('Cartoon Hour').click()
    },
  },
  { name: 'livetv-recordings-tab', group: 'livetv', path: '/livetv?tab=2', allowEmpty: true },
  {
    name: 'livetv-no-channels',
    group: 'livetv',
    path: '/livetv',
    allowEmpty: true,
    prepare: async (page) => {
      await page.route(/\/LiveTv\/Channels(\?|$)/, (route) => route.fulfill({ json: { Items: [], TotalRecordCount: 0, StartIndex: 0 } }))
      await page.reload()
    },
  },
  {
    name: 'livetv-error',
    group: 'livetv',
    path: '/livetv',
    allowEmpty: true,
    allow: [/500 GET \/LiveTv\/Channels/, /status of 500/],
    prepare: async (page) => {
      await page.route(/\/LiveTv\/Channels(\?|$)/, (route) => route.fulfill({ status: 500, body: 'mock failure' }))
      await page.reload()
    },
  },
  // Without a Seerr sign-in Discover shows the sign-in gate; the other Discover scenes sign in first (real Seerr,
  // limited test account, read-only: every Seerr write is answered locally).
  { name: 'discover-gate', group: 'discover', path: '/discover', allowEmpty: true },
  discoverScene('discover', '/discover'),
  discoverScene('discover-card-hover', '/discover', (page) => page.locator('[data-focus-key^="discover:"]').nth(1).hover()),
  discoverScene('discover-row-2', '/discover', (page) => focusRow(page, 2)),
  discoverScene('discover-more', '/discover/more/trending'),
  discoverScene('discover-item', '/discover/movie/603'),
  // an obscure series (tmdb tv 1) that is not in the library
  discoverScene('discover-tv', '/discover/tv/1'),
  // tmdb 2 ("Ariel", 1988) is not in the library, so Request is offered. The simple flow submits as soon as the
  // request is chosen; the POST is answered by linkSeerrForShots, never by Seerr.
  discoverScene('discover-request', '/discover/movie/2', async (page, ctx) => {
    await page.getByRole('button', { name: P(ctx.lang, 'request', { i: true }) }).first().click({ timeout: 8000 })
    await page.waitForTimeout(800)
  }),
  // a series request always opens the seasons dialog (RequestSeasonsDialog); Submit is answered locally
  discoverScene('discover-tv-request', '/discover/tv/1', async (page, ctx) => {
    await page.getByRole('button', { name: P(ctx.lang, 'request', { i: true }) }).first().click({ timeout: 8000 })
    await page.locator('[role=dialog]').first().waitFor({ state: 'visible', timeout: 8000 })
  }),
  discoverScene('discover-tv-request-submitted', '/discover/tv/1', async (page, ctx) => {
    await page.getByRole('button', { name: P(ctx.lang, 'request', { i: true }) }).first().click({ timeout: 8000 })
    const dialog = page.locator('[role=dialog]').first()
    await dialog.getByText(P(ctx.lang, 'select_all', { match: 'contains', i: true })).first().click({ timeout: 8000 })
    await dialog.getByRole('button', { name: P(ctx.lang, 'submit', { i: true }) }).click({ timeout: 8000 })
    await dialog.waitFor({ state: 'hidden', timeout: 8000 })
  }),
  discoverScene(
    'discover-requests-tab',
    '/discover',
    async (page, ctx) => {
      await page.getByRole('tab', { name: P(ctx.lang, 'request', { match: 'contains', i: true }) }).first().click({ timeout: 5000 })
    },
    { allowEmpty: true }, // the test account has no requests
  ),

  // ---- settings (fullscreen) ----
  { name: 'settings', group: 'settings', path: '/settings' },
  { name: 'settings-advanced', group: 'settings', path: '/settings/advanced' },
  { name: 'settings-screensaver', group: 'settings', path: '/settings/screensaver' },
  { name: 'settings-skip-segments', group: 'settings', path: '/settings/skip_segments' },
  { name: 'settings-experimental', group: 'settings', path: '/settings/experimental' },
  { name: 'settings-hdr-formats', group: 'settings', path: '/settings/hdr_formats' },
  { name: 'settings-subtitles', group: 'settings', path: '/settings/subtitles' },
  { name: 'settings-subtitles-hdr', group: 'settings', path: '/settings/subtitles?hdr=true' },
  { name: 'settings-user', group: 'settings', path: '/settings/user' },
  // settings dialogs and sub-screens
  { name: 'settings-theme-dialog', group: 'settings', path: '/settings', prepare: (page) => clickPref(page, 'ThemeColors') },
  { name: 'settings-nav-pins', group: 'settings', path: '/settings', prepare: (page) => clickPref(page, 'UserPinnedNavDrawerItems') },
  { name: 'settings-language', group: 'settings', path: '/settings', prepare: (page) => clickPref(page, 'UserInterfaceLanguage') },
  { name: 'settings-version', group: 'settings', path: '/settings', prepare: (page) => clickPref(page, 'InstalledVersion') },
  { name: 'settings-seerr', group: 'settings', path: '/settings', prepare: (page) => clickPref(page, 'SeerrIntegration') },
  { name: 'settings-skip-dialog', group: 'settings', path: '/settings/skip_segments', prepare: (page) => clickPref(page, 'SkipIntros') },
  { name: 'settings-advanced-quick-connect', group: 'settings', path: '/settings/advanced', prepare: (page) => clickPref(page, 'QuickConnect') },
  {
    name: 'settings-advanced-bottom',
    group: 'settings',
    path: '/settings/advanced',
    prepare: (page) => page.locator('[data-settings-list] [data-pref-id]').last().scrollIntoViewIfNeeded(),
  },
  {
    name: 'settings-sign-out',
    group: 'settings',
    path: '/settings',
    prepare: (page) => page.locator('[data-pref-id="WebSignOut"]').scrollIntoViewIfNeeded(),
  },
  { name: 'settings-subtitles-color-dialog', group: 'settings', path: '/settings/subtitles', prepare: (page) => clickPref(page, 'SubFontColor') },
  {
    name: 'settings-subtitles-scrolled',
    group: 'settings',
    path: '/settings/subtitles',
    prepare: (page) => page.locator('[data-settings-list] [data-pref-id]').nth(10).scrollIntoViewIfNeeded(),
  },
  { name: 'license', group: 'settings', path: '/license' },
  { name: 'debug', group: 'settings', auth: 'out', path: '/debug' },

  // ---- playback, music, photos (fullscreen). Headless Chromium has no proprietary codecs: console noise expected. ----
  {
    name: 'play-movie',
    group: 'playback',
    animations: true,
    path: async (jf) => idOr(await jf.movie(), (id) => `/play/${id}`),
    extraWaitMs: 1500,
    // the video keeps streaming: the network never goes quiet while it plays
    allow: [/page still changing/],
  },
  {
    name: 'play-episode-resume',
    group: 'playback',
    animations: true,
    path: async (jf) => {
      const r = (await jf.resumable()) ?? (await jf.anyEpisode())
      const ticks = r?.UserData?.PlaybackPositionTicks ?? 0
      return r ? `/play/${r.Id}${ticks ? `?t=${Math.round(ticks / 10000)}` : ''}` : null
    },
    extraWaitMs: 1500,
  },
  {
    name: 'play-list-series',
    group: 'playback',
    animations: true,
    path: async (jf) => idOr((await jf.seriesWithSeasons())?.series, (id) => `/play/list/${id}`),
    extraWaitMs: 1500,
  },
  // player overlay on Multi Track Showcase (test server): several audio and subtitle tracks
  playerScene('play-paused', pausePlayer),
  playerScene('play-sheet-settings', playerSheet('settings')),
  playerScene('play-sheet-speed', playerSheet('settings', 'playback_speed')),
  playerScene('play-sheet-scale', playerSheet('settings', 'video_scale')),
  playerScene('play-sheet-bitrate', playerSheet('settings', 'max_bitrate')),
  playerScene('play-sheet-delay', playerSheet('settings', 'subtitle_delay')),
  playerScene('play-sheet-captions', playerSheet('subtitles')),
  playerScene('play-sheet-audio', playerSheet('audio')),
  playerScene('play-shortcuts', async (page, ctx) => {
    await pausePlayer(page, ctx)
    await page.keyboard.press('?')
    await page.locator('[role=dialog]').first().waitFor({ state: 'visible', timeout: 4000 })
  }),
  { name: 'now-playing', group: 'music', path: '/now-playing' },
  { name: 'library-music-albums', group: 'music', path: async (jf) => idOr(await jf.libraryOf('music'), (id) => `/library/${id}?tab=albums`) },
  { name: 'library-music-artists', group: 'music', path: async (jf) => idOr(await jf.libraryOf('music'), (id) => `/library/${id}?tab=artists`) },
  { name: 'library-music-genres', group: 'music', path: async (jf) => idOr(await jf.libraryOf('music'), (id) => `/library/${id}?tab=genres`) },
  { name: 'library-music-songs', group: 'music', path: async (jf) => idOr(await jf.libraryOf('music'), (id) => `/library/${id}?tab=songs`) },
  {
    name: 'music-genre',
    group: 'music',
    path: async (jf) => {
      const lib = await jf.libraryOf('music')
      const g = lib ? await jf.first({ parentId: lib.Id, includeItemTypes: 'MusicGenre', recursive: true }) : null
      const genre = g ?? (lib ? (await jf.get<{ Items?: { Id: string }[] }>('/Genres', { parentId: lib.Id, includeItemTypes: 'MusicAlbum', limit: 1 }))?.Items?.[0] : null)
      return lib && genre ? `/library/${lib.Id}/filtered?type=Genre&filter=${genre.Id}&collectionType=music&recursive=1` : null
    },
  },
  itemScene('item-album-multidisc', (jf) => albumNamed(jf, 'Live at the Tidal Hall'), { group: 'music' }),
  {
    name: 'item-album-song',
    group: 'music',
    path: async (jf) => {
      const a = await albumNamed(jf, 'After Hours')
      const song = a ? await jf.first({ parentId: a.Id, includeItemTypes: 'Audio', sortBy: 'IndexNumber', startIndex: 4 }) : null
      return a && song ? `/item/${a.Id}?song=${song.Id}` : null
    },
  },
  {
    name: 'item-album-menu',
    group: 'music',
    path: async (jf) => idOr(await albumNamed(jf, 'After Hours'), (id) => `/item/${id}`),
    prepare: async (page, ctx) => {
      await page.locator('[data-focus-key^="album-song:"]').first().locator('xpath=..').getByRole('button', { name: P(ctx.lang, 'more', { i: true }) }).click()
      await page.locator('[role=dialog]').first().waitFor({ state: 'visible', timeout: 4000 })
    },
  },
  {
    name: 'item-playlist-audio',
    group: 'music',
    path: async (jf) => idOr(await jf.first({ includeItemTypes: 'Playlist', mediaTypes: 'Audio', recursive: true }), (id) => `/item/${id}`),
  },
  {
    name: 'music-mini-player',
    group: 'music',
    servers: ['test'],
    path: async (jf) => idOr(await albumNamed(jf, 'After Hours'), (id) => `/item/${id}`),
    prepare: async (page, ctx) => startAlbum(page, ctx),
  },
  nowPlayingScene('now-playing-art', 'After Hours'),
  nowPlayingScene('now-playing-controls', 'After Hours', showNowPlayingControls),
  nowPlayingScene('now-playing-lyrics', 'Hollow Light', async (page) => {
    await page.locator('[data-now-playing] [role=list][aria-label]').first().waitFor({ state: 'visible', timeout: 8000 })
  }, 0),
  nowPlayingScene('now-playing-options', 'After Hours', async (page, ctx) => {
    await showNowPlayingControls(page, ctx)
    await page.getByRole('button', { name: P(ctx.lang, 'view_options', { i: true }) }).click()
    await page.locator('[role=dialog]').first().waitFor({ state: 'visible', timeout: 4000 })
  }),
  // Photo / home-video library and album grids, the viewer with its overlay and filter, the screensaver.
  {
    name: 'photos-library',
    group: 'photos',
    path: async (jf) => idOr((await jf.libraryOf('photos')) ?? (await jf.libraryOf('homevideos')), (id) => `/library/${id}`),
    waitFor: '[data-photo-folder]',
  },
  {
    name: 'photos-library-view-options',
    group: 'photos',
    path: async (jf) => idOr((await jf.libraryOf('photos')) ?? (await jf.libraryOf('homevideos')), (id) => `/library/${id}`),
    waitFor: '[data-photo-folder]',
    prepare: async (page, ctx) => {
      await page.locator(`[data-photo-folder] button[aria-label="${T(ctx.lang, 'view_options')}"]`).click()
    },
  },
  {
    name: 'photos-library-filter',
    group: 'photos',
    path: async (jf) => idOr((await jf.libraryOf('photos')) ?? (await jf.libraryOf('homevideos')), (id) => `/library/${id}`),
    waitFor: '[data-photo-folder]',
    prepare: async (page, ctx) => {
      await page.locator(`[data-photo-folder] button[aria-label="${T(ctx.lang, 'filter')}"]`).click()
    },
  },
  {
    name: 'photos-album',
    group: 'photos',
    path: async (jf) => idOr(await jf.photoAlbum(), (id) => `/item/${id}`),
    waitFor: '[data-photo-folder]',
  },
  {
    name: 'photos-viewer',
    group: 'photos',
    path: async (jf) => idOr(await jf.photoAlbum(), (id) => `/slideshow/${id}?index=1`),
    waitFor: '[data-slideshow-stage] img[data-loaded]',
  },
  {
    // main's slideshow start path (?start=true: the timer runs), dropped by the merge
    name: 'slideshow',
    group: 'photos',
    animations: true,
    path: async (jf) => idOr((await jf.photoAlbum()) ?? (await jf.libraryOf('homevideos')), (id) => `/slideshow/${id}?start=true`),
    waitFor: '[data-slideshow-stage] img',
  },
  {
    name: 'photos-viewer-overlay',
    group: 'photos',
    path: async (jf) => idOr(await jf.photoAlbum(), (id) => `/slideshow/${id}?index=1`),
    waitFor: '[data-slideshow-stage] img',
    prepare: async (page) => {
      await page.locator('[data-slideshow-stage]').click({ position: { x: 40, y: 200 } })
      await page.locator('[data-slideshow-overlay]').waitFor()
    },
  },
  {
    name: 'photos-viewer-filter',
    group: 'photos',
    path: async (jf) => idOr(await jf.photoAlbum(), (id) => `/slideshow/${id}?index=1`),
    waitFor: '[data-slideshow-stage] img',
    prepare: async (page, ctx) => {
      await page.locator('[data-slideshow-stage]').click({ position: { x: 40, y: 200 } })
      await page.locator(`[data-slideshow-overlay] button[aria-label="${T(ctx.lang, 'filter')}"]`).click()
      await page.locator('[data-slideshow-filter]').waitFor()
    },
  },
  {
    name: 'photos-screensaver',
    group: 'photos',
    path: '/settings/screensaver',
    prepare: async (page, ctx) => {
      await page.getByText(P(ctx.lang, 'start_screensaver', { match: 'contains', i: true })).first().click()
      await page.locator('[data-screensaver][data-shown] img').first().waitFor({ timeout: 10000 })
    },
  },

  // ---- dev + errors ----
  { name: 'not-found', group: 'misc', path: '/this/route/does/not/exist' },
  { name: 'dev-gallery', group: 'misc', auth: 'out', path: '/dev/gallery' },
]

/** Every scene: the app's own states, then the Android TV reference states (compare mode only, see ./tvScenes.ts). */
export const SCENES: Scene[] = [...BASE_SCENES, ...tvScenes({ mockQuickConnect, mockLiveTvWrites })]
