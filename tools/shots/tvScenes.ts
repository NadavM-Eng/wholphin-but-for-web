/// <reference lib="dom" />
// The Android TV reference states (refshots/out, one picture each) reproduced on the web with the keyboard.
//
// Every scene here is `compareOnly` (crawled by `npm run shots:compare` or when named with --scene) and runs at the
// TV canvas: a 1920x1080 window with the interface-scale preference at 160 %, which makes the root scale 2, so the
// page is laid out on 960x540 dp and 1 dp = 2 picture pixels, exactly like the reference pictures. Scene names are
// `tv-<reference file name>`; ./refmap.ts pairs them (several references can share one scene when the TV pictures
// show the same state).
//
// The scenes drive the app the way the reference run drove the TV: real arrow keys from the page's own initial
// focus, so the focused look and the scroll position after each move are the app's, not the script's. Items are
// looked up by the names of the throwaway test server's fixtures; a scene is skipped on a server without them.
import type { Page } from '@playwright/test'
import type { JfClient, JfItem } from './jellyfin.ts'
import type { Scene, SceneCtx, ThemeName } from './types.ts'

/** What ./scenes.ts lends to this file (passed in, so the two modules do not import each other). */
export interface TvHelpers {
  mockQuickConnect(page: Page, o: { enabled: boolean }): Promise<void>
  mockLiveTvWrites(page: Page, opts?: { schedule?: boolean }): Promise<void>
}

/** Interface scale 160 % on a 1920 px window = root scale 2 (src/theme/scale.ts: 1.25 x 1.6). */
const TV_PREFS = { webInterfaceScale: 160 }
const KEY: Record<string, string> = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', enter: 'Enter', back: 'Escape', menu: 'ContextMenu' }

/** Presses keys written like the reference manifest: "left down*3 enter". `wait:500` pauses. */
export async function press(page: Page, seq: string, gap = 140) {
  for (const tok of seq.split(/\s+/).filter(Boolean)) {
    if (tok.startsWith('wait:')) {
      await page.waitForTimeout(Number(tok.slice(5)))
      continue
    }
    const m = /^(.+?)\*(\d+)$/.exec(tok)
    const name = m ? m[1] : tok
    for (let i = 0; i < (m ? Number(m[2]) : 1); i++) {
      await page.keyboard.press(KEY[name] ?? name)
      await page.waitForTimeout(gap)
    }
    // a dialog, a menu or another page may be opening
    if (name === 'enter' || name === 'back' || name === 'menu') await page.waitForTimeout(350)
  }
}

/** "row title | label" of the focused element (row title: the home / detail row it sits in). */
function focusLabel(page: Page): Promise<string> {
  return page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null
    if (!a || a === document.body) return ''
    const row = a.closest('[data-home-row], [data-search-row], [data-focus-group]')
    const title = row?.querySelector('h2, h3')?.textContent ?? ''
    const pref = a.closest('[data-pref-id]')?.getAttribute('data-pref-id') ?? ''
    // icon fonts put private-use glyphs into the text: drop them
    const text = (a.getAttribute('aria-label') ?? a.textContent ?? '').replace(/[-]/g, '').trim()
    return `${title.trim()} | ${text} | ${pref}`
  })
}

/** Whether the focused element's label (see focusLabel) matches. */
const focused = async (page: Page, re: RegExp) => re.test(await focusLabel(page))

/** Presses `key` until the focused element's label (see focusLabel) matches; throws when it never does. */
export async function until(page: Page, key: string, re: RegExp, max = 30) {
  for (let i = 0; i <= max; i++) {
    if (re.test(await focusLabel(page))) return
    if (i === max) break
    await page.keyboard.press(KEY[key] ?? key)
    await page.waitForTimeout(160)
  }
  throw new Error(`"${key}" x${max} never reached ${re}`)
}

/** Keyboard focus (focus-visible look) on the first match: a modifier key first puts the app in keyboard mode. */
async function kfocus(page: Page, selector: string) {
  await page.keyboard.press('Shift')
  await page.locator(selector).first().evaluate((el) => (el as HTMLElement).focus())
  await page.waitForTimeout(200)
}

/** Waits until something in the page content holds the keyboard focus (pages focus their first element themselves). */
async function waitFocus(page: Page, selector = '[data-focusable], button, a, input') {
  await page
    .waitForFunction((sel) => !!document.activeElement && document.activeElement !== document.body && document.activeElement.matches(sel), selector, { timeout: 6000 })
    .catch(() => {})
}

const idOr = (item: { Id: string } | null | undefined, make: (id: string) => string) => (item ? make(item.Id) : null)

/**
 * Home: every row has its data (a row still loading shows its placeholder: LoadingRow, role=status). The settle
 * check already waits for the row requests; this states it for the Home pictures.
 */
export async function homeRowsLoaded(page: Page) {
  await page.waitForFunction(() => {
    const rows = document.querySelector('[data-home-rows]')
    return !!rows && !rows.querySelector('[data-home-row] [role=status]')
  }, null, { timeout: 15000 })
}

async function byName(jf: JfClient, type: string, name: string): Promise<JfItem | null> {
  return jf.memo(`tv:${type}:${name}`, async () => (await jf.items({ includeItemTypes: type, searchTerm: name, limit: 8 })).find((i) => i.Name === name) ?? null)
}
const view = async (jf: JfClient, name: string) => (await jf.views()).find((v) => v.Name === name) ?? null
const lib = (name: string, tab?: string | number) => async (jf: JfClient) => idOr(await view(jf, name), (id) => `/library/${id}${tab === undefined ? '' : `?tab=${tab}`}`)
const item = (type: string, name: string) => async (jf: JfClient) => idOr(await byName(jf, type, name), (id) => `/item/${id}`)

async function person(jf: JfClient, name: string) {
  return jf.memo(`tv:person:${name}`, async () => (await jf.get<{ Items?: JfItem[] }>('/Persons', { userId: jf.userId, searchTerm: name, limit: 5 }))?.Items?.find((p) => p.Name === name) ?? null)
}

/** Orbital Drift's series overview at season / episode numbers. */
async function orbital(jf: JfClient, season: number, episode: number): Promise<string | null> {
  const series = await byName(jf, 'Series', 'Orbital Drift')
  if (!series) return null
  const eps = await jf.memo('tv:orbital-eps', () => jf.items({ parentId: series.Id, includeItemTypes: 'Episode', recursive: true }))
  const e = eps.find((x) => x.ParentIndexNumber === season && x.IndexNumber === episode)
  return e?.SeasonId ? `/series/${series.Id}?season=${e.SeasonId}&episode=${e.Id}` : null
}
async function orbitalEpisodeId(jf: JfClient, season: number, episode: number): Promise<string | null> {
  const url = await orbital(jf, season, episode)
  return url ? new URL(url, 'http://x').searchParams.get('episode') : null
}

/**
 * The wall clock of the Live TV scenes: 18 minutes into "Headline Hour, Episode 23" on the first channel, the
 * program that was on when the reference run opened the guide. The test server's synthetic guide is rebuilt as
 * time passes (same line-up, later dates), so the moment is looked up, not fixed; without that program, 5 h 18 min
 * after the first one. Times of day in the pictures therefore differ from the references.
 */
async function guideClock(jf: JfClient): Promise<string | null> {
  return jf.memo('tv:guide-clock', async () => {
    const r = await jf.get<{ Items?: { Name?: string; EpisodeTitle?: string; StartDate?: string }[] }>('/LiveTv/Programs', {
      userId: jf.userId, sortBy: 'StartDate', limit: 400, enableTotalRecordCount: false,
    })
    const items = r?.Items ?? []
    const ref = items.find((p) => p.Name === 'Headline Hour' && p.EpisodeTitle === 'Episode 23')
    if (ref?.StartDate) return new Date(Date.parse(ref.StartDate) + 18 * 60e3).toISOString()
    const start = items[0]?.StartDate
    return start ? new Date(Date.parse(start) + (5 * 60 + 18) * 60e3).toISOString() : null
  })
}

/** Channels in channel-number order, as the reference run had them (pairing only; the app's own order is by name). */
async function sortChannels(page: Page) {
  await page.route(/\/LiveTv\/Channels(\?|$)/, async (route) => {
    try {
      const res = await route.fetch()
      const json = (await res.json()) as { Items?: { ChannelNumber?: string }[] }
      json.Items?.sort((x, y) => Number(x.ChannelNumber) - Number(y.ChannelNumber))
      await route.fulfill({ response: res, json })
    } catch {
      await route.continue().catch(() => {})
    }
  })
}

// ------------------------------------------------------------------ player helpers (need a browser with H.264: --channel msedge)

async function waitPlaying(page: Page) {
  await page.waitForFunction(() => {
    const v = document.querySelector('video')
    return !!v && v.readyState >= 2 && !v.paused && v.currentTime > 0.2
  }, null, { timeout: 30000 })
}
async function waitVideoTime(page: Page, seconds: number, timeout = 45000) {
  await page.waitForFunction((s) => (document.querySelector('video')?.currentTime ?? -1) >= s, seconds, { timeout, polling: 50 })
}
const seekTo = (page: Page, ms: number) =>
  page.evaluate((ms) => (window as unknown as { __playback?: { engine?: { seekTo(ms: number): void } } }).__playback?.engine?.seekTo(ms), ms)
/**
 * Back to a moment of the video and playing from there. The crawler's settle check runs while the video plays, so a
 * short test clip is seconds in (past its intro segment, whose Skip button would take the Enter key) by the time
 * a scene starts.
 */
async function playFrom(page: Page, ms: number) {
  await seekTo(page, ms)
  await page.waitForFunction((s) => {
    const v = document.querySelector('video')
    return !!v && !v.seeking && !v.paused && v.readyState >= 2 && v.currentTime >= s && v.currentTime < s + 2.5
  }, ms / 1000, { timeout: 20000, polling: 50 })
}

/** Enter on the bare video shows the controls with Play/Pause focused, as OK does on the TV. */
async function showControls(page: Page) {
  // the controls a page shows on arrival hide after their timeout: wait for the bare video first
  await page.locator('[data-seekbar]').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
  // a focused Skip button would take the Enter key (the test clips have an intro segment from their first seconds,
  // added after the references were taken): take the focus off it, so Enter reaches the player
  await page.evaluate(() => {
    const a = document.activeElement
    if (a instanceof HTMLElement && a.closest('[data-skip-segment]')) a.blur()
  })
  await page.keyboard.press('Enter')
  await page.locator('[data-seekbar]').waitFor({ state: 'visible', timeout: 5000 })
  await page.waitForTimeout(300)
}
/** Keyboard focus on a button of the control strip: Settings, or the one whose tooltip ends "(K)". */
async function focusPlayerButton(page: Page, which: 'settings' | 'C' | 'A' | 'K') {
  if (!(await page.locator('[data-seekbar]').isVisible())) await showControls(page)
  await page.evaluate((which) => {
    const all = Array.from(document.querySelectorAll<HTMLElement>('[data-player-strip] button'))
    const b = which === 'settings' ? all.find((x) => x.dataset.playerButton === 'settings') : all.find((x) => (x.getAttribute('title') ?? '').endsWith(`(${which})`))
    b?.focus()
  }, which)
  await page.waitForTimeout(200)
}

// ------------------------------------------------------------------ the scenes

export function tvScenes(h: TvHelpers): Scene[] {
  /** One reference state. `ref` is the reference file name without ".png". */
  const tv = (ref: string, path: Scene['path'], prepare?: (page: Page, ctx: SceneCtx) => Promise<void>, extra: Partial<Scene> = {}): Scene => ({
    name: `tv-${ref}`,
    group: `tv-${ref.slice(0, 2)}`,
    compareOnly: true,
    viewports: ['desktop'],
    path,
    ...(path === '/' ? { waitFor: homeRowsLoaded } : {}),
    prepare: async (page, ctx) => {
      if ((extra.auth ?? 'in') === 'in') await waitFocus(page)
      if (prepare) await prepare(page, ctx)
    },
    ...extra,
    prefs: { ...TV_PREFS, ...extra.prefs },
  })
  /** keys only */
  const keys = (seq: string) => (page: Page) => press(page, seq)

  // ---- 01 setup
  const setup: Scene[] = [
    tv('01-setup-server-empty', '/setup/servers', undefined, { auth: 'out' }),
    // the web has no discovery step: Enter on Add Server opens the manual entry at once (both TV dialog pictures pair with it)
    tv('01-setup-add-dialog-manual', '/setup/servers', keys('enter'), { auth: 'out' }),
    tv(
      '01-setup-add-dialog-typed',
      '/setup/servers',
      async (page) => {
        await press(page, 'enter')
        await page.keyboard.type('http://10.0.2.2:8097')
      },
      { auth: 'out' },
    ),
    tv('01-setup-server-list', '/setup/servers', undefined, { auth: 'saved' }),
    tv(
      // the reference server had no saved user yet: forget the users of the saved profile, then open the server
      '01-setup-user-list-empty',
      '/setup/servers',
      async (page) => {
        await page.evaluate(() => {
          const k = 'wholphin.session.v1'
          const s = JSON.parse(localStorage.getItem(k) ?? '{}') as { state?: { users?: Record<string, unknown> } }
          if (s.state) s.state.users = {}
          localStorage.setItem(k, JSON.stringify(s))
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.locator('[data-focus-group] [data-focusable]').first().waitFor({ timeout: 8000 })
        await press(page, 'wait:400 enter')
        await page.waitForURL(/\/setup\/users/, { timeout: 5000 })
      },
      { auth: 'saved' },
    ),
    tv(
      '01-setup-quick-connect',
      '/setup/servers',
      async (page) => {
        await h.mockQuickConnect(page, { enabled: true })
        await page.locator('[data-focus-group] [data-focusable]').first().waitFor({ timeout: 8000 })
        await press(page, 'wait:300 enter')
        await page.waitForURL(/\/setup\/users/, { timeout: 5000 })
        await press(page, 'wait:500 enter')
        await page.locator('[data-testid="quick-connect-code"]').waitFor({ timeout: 6000 })
      },
      { auth: 'saved' },
    ),
  ]

  // ---- 02 home, 03 drawer, 12 home context menu
  // The reference run stopped on every row for its picture, so each row's backdrop and colours were published
  // (500 ms after the focus) before the next Down. A row whose items have no backdrop keeps the colours of the
  // row above (02-home-row-4 and -5 show the blue of row 3), so the rows are walked at that pace here too.
  const homeRow = (re: RegExp) => async (page: Page) => {
    for (let i = 0; i < 30 && !(await focused(page, re)); i++) {
      await press(page, 'down wait:200')
      await page.waitForFunction(() => !document.querySelector('[data-shell-backdrop][aria-busy="true"]'), undefined, { timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(300)
    }
    await until(page, 'down', re, 0)
  }
  const home: Scene[] = [
    tv('02-home-top', '/'),
    tv('02-home-card-focused', '/', keys('right*2')),
    // the Watch live row needs programs airing now; the guide of the test server is a fixed file (see guideClock)
    tv('02-home-row-2', '/', keys('down')),
    tv('02-home-row-3', '/', homeRow(/^Recently added in Movies/)),
    tv('02-home-row-4', '/', homeRow(/^Recently added in Music/)),
    tv('02-home-row-5', '/', homeRow(/^Recently added in Photos/)),
    tv('02-home-row-6', '/', homeRow(/^Recently added in Shows/)),
    tv('03-nav-drawer-expanded', '/', keys('left')),
    tv('03-nav-drawer-library-focused', '/', async (page) => {
      await press(page, 'left')
      await until(page, 'down', /\| Collections \|/)
    }),
    tv('03-nav-drawer-settings-focused', '/', async (page) => {
      await press(page, 'left')
      await until(page, 'down', /\| Settings \|/)
    }),
    tv('03-nav-drawer-profile-focused', '/', keys('left down*3 up*8')),
    tv('12-context-menu-home-card', '/', keys('right menu')),
  ]

  // ---- 04-08, 17, 18 libraries; 12 grid context menu; 19 favorites
  const libraries: Scene[] = [
    tv('04-library-movies-recommended', lib('Movies')),
    tv('04-library-movies-library', lib('Movies', 1)),
    tv('04-library-movies-collections', lib('Movies', 2)),
    tv('04-library-movies-genres', lib('Movies', 3)),
    tv('05-library-codec-zoo-recommended', lib('Codec Zoo')),
    tv('05-library-codec-zoo-library', lib('Codec Zoo', 1)),
    tv('06-library-shows-recommended', lib('Shows')),
    tv('06-library-shows-library', lib('Shows', 1)),
    tv('06-library-shows-genres', lib('Shows', 'genres')),
    tv('06-library-shows-studios', lib('Shows', 'studios')),
    tv('07-library-music-recommended', lib('Music')),
    tv('07-library-music-albums', lib('Music', 'albums')),
    tv('07-library-music-artists', lib('Music', 'artists')),
    tv('07-library-music-genres', lib('Music', 'genres')),
    tv('07-library-music-songs', lib('Music', 'songs')),
    tv('08-library-grid-dialogs-sort-dialog', lib('Movies', 1), keys('up enter')),
    tv('08-library-grid-dialogs-filter-dialog', lib('Movies', 1), keys('up right enter')),
    tv('08-library-grid-dialogs-view-options', lib('Movies', 1), keys('up right*2 enter')),
    // Right from the last column enters the letter column at the current letter; twelve steps down the column
    tv('08-library-grid-dialogs-alphabet-focused', lib('Movies', 1), keys('right*6 down*12')),
    tv('08-library-grid-dialogs-alphabet-jumped', lib('Movies', 1), keys('right*6 down*12 enter')),
    tv('12-context-menu-grid-card', lib('Movies', 1), keys('right menu')),
    tv('17-collection-library', lib('Collections')),
    tv('18-playlist-library', lib('Playlists')),
    tv('19-favorites-movies', '/favorites'),
    tv('19-favorites-tv-shows', '/favorites?tab=Series'),
    tv('19-favorites-episodes', '/favorites?tab=Episode'),
    tv('19-favorites-people', '/favorites?tab=Person'),
    tv('19-favorites-albums', '/favorites?tab=MusicAlbum'),
    tv('19-favorites-artists', '/favorites?tab=MusicArtist'),
  ]

  // ---- 09-11, 13-18 detail pages (Play has the focus on arrival, as on the TV)
  const bbb = item('Movie', 'Big Buck Bunny')
  const ed = item('Movie', 'Elephants Dream')
  const mts = item('Movie', 'Multi Track Showcase')
  const od = item('Series', 'Orbital Drift')
  const boxset = item('BoxSet', 'Blender Open Movies')
  const lateNight = item('Playlist', 'Late Night Mix')
  const ton = async (jf: JfClient) => idOr(await person(jf, 'Ton Roosendaal'), (id) => `/item/${id}`)
  const button = (re: RegExp, then = '') => async (page: Page) => {
    await until(page, 'right', re, 10)
    if (then) await press(page, then)
  }
  const moreMenu = (entry?: RegExp) => async (page: Page) => {
    await until(page, 'right', /\| More \|/, 10)
    await press(page, 'enter')
    if (entry) {
      await until(page, 'down', entry, 16)
      await press(page, 'enter')
    }
  }
  const detail: Scene[] = [
    tv('09-movie-detail-top', bbb),
    tv('09-movie-detail-watched-focused', bbb, button(/watched/i)),
    tv('09-movie-detail-favorite-focused', bbb, button(/favorite/i)),
    tv('09-movie-detail-trailer-dialog', bbb, button(/trailer/i, 'enter')),
    tv('09-movie-detail-more-menu', bbb, moreMenu()),
    tv('09-movie-detail-page-2', bbb, keys('down')),
    tv('09-movie-detail-page-3', bbb, keys('down*2')),
    tv('09-movie-detail-page-4', bbb, keys('down*3')),
    tv('10-movie-versions-top', ed),
    tv('10-movie-versions-version-focused', ed, button(/\| Version \|/)),
    tv('10-movie-versions-version-dialog', ed, button(/\| Version \|/, 'enter')),
    // the TV picture is the focused Play trailer button plus an Android toast; on the web a remote trailer opens a new tab
    tv('10-movie-versions-trailer-dialog', ed, button(/trailer/i)),
    tv('11-movie-tracks-top', mts),
    tv('11-movie-tracks-more-menu', mts, moreMenu()),
    tv('11-movie-tracks-choose-audio', mts, moreMenu(/Choose Audio/)),
    tv('11-movie-tracks-choose-subtitles', mts, moreMenu(/Choose Subtitles/)),
    tv('11-movie-tracks-media-info', mts, moreMenu(/Media Information/)),
    tv('13-series-detail-page-1', od),
    tv('13-series-detail-page-2', od, keys('down')),
    tv('13-series-detail-page-3', od, keys('down*2')),
    tv('14-series-overview-seasons-row', od, keys('down right')),
    // arriving from the Season 1 card: the first episode is selected; a key press gives it the keyboard focus
    tv('14-series-overview-top', (jf) => orbital(jf, 1, 1), keys('right left')),
    tv('14-series-overview-episode-2', (jf) => orbital(jf, 1, 1), keys('right')),
    // waits as in the reference run (tools/refshots/scenes.mjs): the second episode's people have to be there before
    // Down, or the page is still too short to scroll and every later offset starts from the wrong place
    tv('14-series-overview-page-2', (jf) => orbital(jf, 1, 1), keys('right wait:900 down')),
    tv('14-series-overview-page-3', (jf) => orbital(jf, 1, 1), keys('right wait:900 down wait:500 down')),
    tv('14-series-overview-page-4', (jf) => orbital(jf, 1, 1), keys('right wait:900 down wait:500 down wait:500 down')),
    tv('14-series-overview-season-tab', (jf) => orbital(jf, 1, 1), keys('right up*2 right')),
    // the Menu key on the focused card opens the TV-style centered dialog (a right-click opens the pointer menu)
    tv('15-episode-detail-menu', (jf) => orbital(jf, 1, 1), keys('right left menu')),
    tv('16-person-top', ton),
    tv('16-person-page-2', ton, keys('down')),
    tv('16-person-page-3', ton, keys('down*2')),
    tv('17-collection-page', boxset),
    tv('17-collection-page-2', boxset, keys('down')),
    tv('17-collection-page-3', boxset, keys('down*2')),
    tv('18-playlist-page', lateNight),
    ...[2, 3, 4, 5, 6].map((n) => tv(`18-playlist-page-${n}`, lateNight, keys(`down*${n - 1}`))),
    tv('35-segments-episodes', (jf) => orbital(jf, 1, 1), keys('right left down')),
  ]

  // ---- 20 search
  const search: Scene[] = [
    // the TV focuses the voice button on arrival, the web the text field (recorded adaptation): one Left gives the TV state
    tv('20-search-empty', '/search', keys('left')),
    tv('20-search-field-focused', '/search'),
    tv('20-search-typed', '/search', async (page) => {
      await page.keyboard.type('bunny')
      await page.waitForTimeout(1300) // 750 ms debounce
    }),
    tv('20-search-results', '/search?q=bunny', (page) => kfocus(page, '[data-search-header] button'), { waitFor: '[data-search-row]' }),
    tv('20-search-page-2', '/search?q=bunny', async (page) => {
      await kfocus(page, '[data-search-header] button')
      await press(page, 'down')
    }, { waitFor: '[data-search-row]' }),
  ]

  // ---- 21, 22, 30, 31, 32, 33 settings
  const pref = (label: RegExp, then = '') => async (page: Page) => {
    await until(page, 'down', label, 60)
    if (then) await press(page, then)
  }
  const THEMES: [string, ThemeName][] = [
    ['purple', 'PURPLE'], ['blue', 'BLUE'], ['green', 'GREEN'], ['orange', 'ORANGE'], ['bold-blue', 'BOLD_BLUE'], ['black', 'OLED_BLACK'], ['red', 'RED'], ['brown', 'BROWN'],
  ]
  const settings: Scene[] = [
    tv('21-settings-main-page-1', '/settings'),
    tv('21-settings-main-page-2', '/settings/topic/screensaver', pref(/\| ScreensaverSettings$/)),
    tv('21-settings-main-page-3', '/settings/topic/playback', pref(/\| AutoPlayNextUp$/)),
    tv('21-settings-main-page-4', '/settings/topic/home', pref(/\| UserPinnedNavDrawerItems$/)),
    tv('21-settings-main-page-5', '/settings/topic/home', pref(/\| SeerrIntegration$/)),
    tv('21-settings-main-page-6', '/settings/topic/interface', pref(/\| PlayThemeMusic$/)),
    tv('21-settings-main-page-7', '/settings/topic/playback', pref(/\| SkipBack$/)),
    tv('21-settings-main-page-8', '/settings/topic/playback', pref(/\| PassOutProtection$/)),
    tv('21-settings-main-page-9', '/settings', pref(/\| Topic-profile$/)),
    tv('22-settings-sub-theme-dialog', '/settings', pref(/\| ThemeColors$/, 'enter')),
    tv('22-settings-sub-language', '/settings', pref(/\| UserInterfaceLanguage$/, 'enter')),
    tv('22-settings-sub-nav-pins', '/settings/topic/home', pref(/\| UserPinnedNavDrawerItems$/, 'enter')),
    tv('22-settings-sub-version', '/settings/topic/about', pref(/\| InstalledVersion$/, 'enter')),
    tv('22-settings-sub-screensaver', '/settings/screensaver'),
    tv('22-settings-sub-user-profile', '/settings/topic/profile'),
    tv('22-settings-sub-advanced', '/settings/topic/playback'),
    tv('22-settings-sub-subtitle-style', '/settings/subtitles'),
    tv('22-settings-sub-home-customize', '/home/settings', undefined, { allowEmpty: true }),
    ...[2, 3, 4, 5, 6].map((n) => tv(`30-settings-subtitle-style-page-${n}`, '/settings/subtitles', keys(`down*${5 * (n - 1)}`))),
    ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => tv(`31-settings-advanced-page-${n}`, '/settings/topic/playback', keys(`down*${5 * (n - 1)}`))),
    // the playback backend chooser is not ported (one backend in a browser): another choice dialog shows the same shell
    tv('31-settings-advanced-backend', '/settings/topic/subtitles', pref(/\| AssSubtitleMode$/, 'enter')),
    tv('31-settings-advanced-experimental-confirm', '/settings/topic/about', pref(/\| ExperimentalEnable$/, 'enter')),
    tv('31-settings-advanced-license', '/license'),
    tv('31-settings-advanced-quick-connect', '/settings/topic/profile', pref(/\| QuickConnect$/, 'enter')),
    tv('31-settings-advanced-skip', '/settings/skip_segments'),
    tv('32-settings-home-customize-add-row', '/home/settings', keys('enter'), { allowEmpty: true }),
    tv('32-settings-home-customize-presets', '/home/settings', pref(/Display presets/, 'enter'), { allowEmpty: true }),
    tv('32-settings-home-customize-source', '/home/settings', pref(/\| Source/, 'enter'), { allowEmpty: true }),
    ...THEMES.flatMap(([file, theme]) => [
      tv(`33-themes-home-${file}`, '/', undefined, { prefs: { themeColors: theme } }),
      tv(`33-themes-settings-${file}`, '/settings', pref(/\| ThemeColors$/), { prefs: { themeColors: theme } }),
    ]),
    tv('33-themes-detail-black', bbb, undefined, { prefs: { themeColors: 'OLED_BLACK' } }),
    tv('33-themes-detail-bold-blue', bbb, undefined, { prefs: { themeColors: 'BOLD_BLUE' } }),
  ]

  // ---- 26-29 music and photos
  const album = item('MusicAlbum', 'After Hours')
  const artist = async (jf: JfClient) =>
    idOr((await jf.get<{ Items?: JfItem[] }>('/Artists', { userId: jf.userId, searchTerm: 'The Glass Orchard', limit: 5 }))?.Items?.find((a) => a.Name === 'The Glass Orchard'), (id) => `/item/${id}`)
  const photoAlbum = async (jf: JfClient) => idOr(await byName(jf, 'PhotoAlbum', '2024-07 Alpine Trip'), (id) => `/item/${id}`)
  const playing = async (page: Page) => {
    await press(page, 'enter')
    await page.locator('[data-mini-player]').waitFor({ state: 'visible', timeout: 10000 })
    await page.waitForTimeout(600)
  }
  const music: Scene[] = [
    tv('26-music-album-album', album),
    tv('26-music-album-after-play', album, playing, { servers: ['test'], extraWaitMs: 400 }),
    tv('26-music-album-after-play-2', album, async (page) => {
      await playing(page)
      await press(page, 'down')
    }, { servers: ['test'], extraWaitMs: 400 }),
    tv('27-music-artist-artist', artist),
    tv('27-music-artist-page-2', artist, keys('down')),
    tv('27-music-artist-page-3', artist, keys('down*2')),
    tv('28-now-playing-drawer-now-playing', album, async (page) => {
      await playing(page)
      await press(page, 'left')
      await until(page, 'up', /Now playing/i, 24)
    }, { servers: ['test'], extraWaitMs: 400 }),
    tv('28-now-playing-page', album, async (page) => {
      await playing(page)
      await press(page, 'left')
      await until(page, 'up', /Now playing/i, 24)
      await press(page, 'enter')
      await page.waitForURL(/\/now-playing/, { timeout: 5000 })
      await page.waitForTimeout(800)
    }, { servers: ['test'], extraWaitMs: 600 }),
    tv('29-library-photos-landing', lib('Photos'), undefined, { waitFor: '[data-photo-folder]' }),
    tv('29-library-photos-album', photoAlbum, undefined, { waitFor: '[data-photo-folder]' }),
    tv('29-library-photos-viewer', photoAlbum, keys('enter wait:800'), { waitFor: '[data-photo-folder]' }),
    tv('29-library-photos-viewer-2', photoAlbum, keys('enter wait:800 right wait:600'), { waitFor: '[data-photo-folder]' }),
    tv('29-library-photos-viewer-3', photoAlbum, keys('enter wait:800 right wait:600 enter'), { waitFor: '[data-photo-folder]' }),
  ]

  // ---- 34 Live TV: every write is answered locally (never a recording or a timer on a server)
  const live = (ref: string, seq: string, extra: Partial<Scene> = {}, path = '/livetv', then?: (page: Page) => Promise<void>) =>
    tv(
      ref,
      path,
      async (page) => {
        await h.mockLiveTvWrites(page)
        await sortChannels(page)
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.locator('[data-focus-default]').waitFor({ timeout: 10000 })
        await waitFocus(page)
        await page.waitForTimeout(500)
        await press(page, seq)
        if (then) await then(page)
      },
      { clock: guideClock, allowEmpty: true, ...extra },
    )
  const TO_FUTURE = 'right*17 down*4 left*14 up*3'
  const livetv: Scene[] = [
    tv('34-live-tv-drawer-entry', '/', async (page) => {
      await press(page, 'left')
      await until(page, 'down', /\| Live TV \|/)
    }),
    live('34-live-tv-guide', ''),
    live('34-live-tv-guide-program-focused', 'right*3'),
    live('34-live-tv-guide-scrolled-right', 'right*7'),
    live('34-live-tv-guide-scrolled-right-2', 'right*17'),
    live('34-live-tv-guide-channel-2', 'right*17 down'),
    live('34-live-tv-guide-channel-4', 'right*17 down*4'),
    live('34-live-tv-guide-back-left', 'right*17 down*4 left*14'),
    live('34-live-tv-program-dialog-future', `${TO_FUTURE} enter`),
    live('34-live-tv-program-dialog-now', `${TO_FUTURE} enter back left*3 enter`),
    live('34-live-tv-view-options-button', 'up'),
    live('34-live-tv-view-options', 'up enter'),
    live('34-live-tv-tabs', 'up*2'),
    live('34-live-tv-dvr-schedule', 'up*2 right enter'),
    live('34-live-tv-recordings', 'up*2 right*2 enter wait:800'),
  ]

  /** The program on now of the fourth channel, Watch live: a few seconds of a looping test stream, stopped by the crawler. */
  const watchLive = (ref: string, then: (page: Page) => Promise<void>) =>
    live(
      ref,
      'down*3 enter',
      { servers: ['test'], animations: true, allow: [/page still changing/], extraWaitMs: 300 },
      '/livetv',
      async (page) => {
        await page.getByRole('dialog').getByRole('button').first().waitFor({ timeout: 6000 })
        await press(page, 'enter')
        await page.waitForURL(/\/play\//, { timeout: 15000 })
        await waitPlaying(page)
        await then(page)
      },
    )
  const liveplay: Scene[] = [
    watchLive('34-live-tv-playing', async (page) => {
      await page.locator('[data-seekbar]').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
    }),
    watchLive('34-live-tv-player-overlay', showControls),
    watchLive('34-live-tv-player-overlay-2', async (page) => {
      await showControls(page)
      await press(page, 'down')
    }),
  ]

  // ---- 23-25, 35, 36 the player. Real time and real codecs: animations stay on, the video keeps streaming.
  const play = (ref: string, path: Scene['path'], run: (page: Page) => Promise<void>, extra: Partial<Scene> = {}) =>
    tv(
      ref,
      path,
      async (page) => {
        await waitPlaying(page)
        await run(page)
      },
      { servers: ['test'], animations: true, allow: [/page still changing/], extraWaitMs: 300, ...extra },
    )
  const playOf = (type: string, name: string, query = '') => async (jf: JfClient) => idOr(await byName(jf, type, name), (id) => `/play/${id}${query}`)
  const bbbPlay = playOf('Movie', 'Big Buck Bunny', '?t=0')
  const chapters = playOf('Movie', 'Chapter Marathon', '?t=0')
  const pgs = playOf('Movie', 'PGS Image Subtitles', '?t=0')
  const e1Play = async (jf: JfClient) => {
    const id = await orbitalEpisodeId(jf, 1, 1)
    return id ? `/play/${id}?t=0` : null
  }
  const fromStart = (run: (page: Page) => Promise<void>) => async (page: Page) => {
    await playFrom(page, 0)
    await run(page)
  }
  /** English PGS through the captions sheet (the server burns it in: a transcode), then back to the start, controls hidden. */
  const pgsOn = async (page: Page) => {
    await showControls(page)
    await focusPlayerButton(page, 'C')
    await press(page, 'enter')
    await page.locator('[data-player-sheet]').getByText(/English.*PGS/i).first().click()
    await page.waitForTimeout(1500)
    await waitPlaying(page)
    await seekTo(page, 3000)
    await page.locator('[data-seekbar]').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
  }
  const settingsSheet = async (page: Page, then = '') => {
    await showControls(page)
    await focusPlayerButton(page, 'settings')
    await press(page, `enter ${then}`)
  }
  const player: Scene[] = [
    play('23-playback-movie-playing', bbbPlay, async (page) => {
      await page.locator('[data-seekbar]').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
    }),
    play('23-playback-movie-controls', bbbPlay, showControls),
    play('23-playback-movie-seekbar', bbbPlay, async (page) => {
      await showControls(page)
      await press(page, 'up')
    }),
    play('23-playback-movie-seekbar-scrub', bbbPlay, async (page) => {
      await showControls(page)
      await press(page, 'up right*4')
    }),
    play('23-playback-movie-settings-dialog', bbbPlay, (page) => settingsSheet(page)),
    play('23-playback-movie-settings-dialog-2', bbbPlay, (page) => settingsSheet(page, 'down')),
    play('23-playback-movie-speed-dialog', bbbPlay, (page) => settingsSheet(page, 'enter')),
    play('23-playback-movie-scale-dialog', bbbPlay, (page) => settingsSheet(page, 'down enter')),
    play('23-playback-movie-captions-dialog', bbbPlay, async (page) => {
      await showControls(page)
      await focusPlayerButton(page, 'C')
      await press(page, 'enter')
    }),
    play('23-playback-movie-audio-dialog', bbbPlay, async (page) => {
      await showControls(page)
      await focusPlayerButton(page, 'A')
      await press(page, 'enter')
    }),
    play('23-playback-movie-paused', bbbPlay, async (page) => {
      await showControls(page)
      await press(page, 'enter')
    }),
    play('24-playback-chapters-controls', chapters, fromStart(showControls)),
    // the web player lists chapters and queue in panels opened from the control strip (H / Q), where the TV has
    // rows of cards under its controller (reached with Down)
    play('24-playback-chapters-chapters', chapters, async (page) => {
      await playFrom(page, 0)
      await showControls(page)
      await press(page, 'h wait:300')
    }),
    play('24-playback-chapters-chapters-2', chapters, async (page) => {
      await playFrom(page, 0)
      await showControls(page)
      await press(page, 'h wait:300 down*2')
    }),
    play('25-playback-episode-controls', e1Play, fromStart(showControls)),
    play('25-playback-episode-queue', e1Play, async (page) => {
      await playFrom(page, 0)
      await showControls(page)
      await press(page, 'q wait:400')
    }),
    play('35-segments-skip-intro-button', e1Play, async (page) => {
      await playFrom(page, 3000)
      await waitVideoTime(page, 5.3)
    }),
    play('35-segments-after-skip-intro', e1Play, async (page) => {
      await playFrom(page, 3000)
      await waitVideoTime(page, 5.3)
      await press(page, 'enter wait:400')
    }),
    play('35-segments-skip-outro-button', e1Play, async (page) => {
      await playFrom(page, 21500)
      await waitVideoTime(page, 23.4)
    }),
    play('35-segments-next-up', e1Play, async (page) => {
      await seekTo(page, 28200)
      await page.locator('[data-next-up]').waitFor({ state: 'visible', timeout: 30000 })
      await page.waitForTimeout(1600)
    }),
    play('36-image-subtitles-play-1', pgs, async (page) => {
      await pgsOn(page)
      await waitVideoTime(page, 4.1)
    }),
    // a moment between two cues
    play('36-image-subtitles-play-3', pgs, async (page) => {
      await pgsOn(page)
      await waitVideoTime(page, 7.6)
    }),
    play('36-image-subtitles-controls', pgs, async (page) => {
      await pgsOn(page)
      await seekTo(page, 13200)
      await waitVideoTime(page, 14.2)
      await showControls(page)
    }),
    play('36-image-subtitles-captions-dialog', pgs, async (page) => {
      await pgsOn(page)
      await seekTo(page, 13200)
      await waitVideoTime(page, 14.2)
      await showControls(page)
      await focusPlayerButton(page, 'C')
      await press(page, 'enter')
    }),
    tv('36-image-subtitles-top', item('Movie', 'PGS Image Subtitles')),
    tv('36-image-subtitles-more-menu', item('Movie', 'PGS Image Subtitles'), moreMenu()),
    tv('36-image-subtitles-choose-subtitles', item('Movie', 'PGS Image Subtitles'), moreMenu(/Choose Subtitles/)),
  ]

  return [...setup, ...home, ...libraries, ...detail, ...search, ...settings, ...music, ...livetv, ...liveplay, ...player]
}
