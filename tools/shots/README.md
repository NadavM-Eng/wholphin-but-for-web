# Screenshot crawler ("shots")

Walks the whole web app with Playwright (Chromium), takes a picture of every scene in every viewport and theme, and
reports the health of each page. It doubles as the project's smoke test.

```bash
npm run shots                                   # everything: all scenes x 4 viewports x 8 themes, test server
npm run shots:quick                             # PURPLE only, desktop + phone
npm run shots -- --scene home,item-movie --theme PURPLE --viewport desktop,phone
npm run shots -- --server real --scene library-movies --theme PURPLE --viewport desktop
npm run shots -- --rtl --theme PURPLE           # Hebrew locale (run name gets an -rtl suffix)
npm run shots -- --strict --theme PURPLE        # exit code 1 when a picture has an error-level issue
npm run shots -- --list                         # resolved scene list (real ids), no pictures
npm run shots -- --engine webkit --viewport wide,phone --theme PURPLE   # another engine (firefox | webkit)
npm run shots:compare                           # web vs Android TV reference sheet (every reference picture)
npm run shots -- --scene 'tv-09*,tv-14*' --theme PURPLE --viewport desktop   # some of the reference states
```

It starts a Vite dev server on port 5184 (`WW_VITE_CACHE=node_modules/.vite-5184`) or reuses one already answering
there, signs in through `/dev/login`, and stops the server again if it started it. `--port N` or `SHOTS_PORT` pick
another port, `--url http://host:port` reuses a specific running dev server.

## Flags

| Flag | Meaning |
|---|---|
| `--scene a,b*` | scene names or `*` globs; a bare name also matches its `name-*` family (`home` = `home`, `home-drawer`, ...) |
| `--viewport v,..` | `desktop` (1920x1080), `laptop` (1280x720), `tablet` (820x1180, touch), `phone` (390x844, touch, mobile UA); `wide` (1440x900) only when named |
| `--engine e` | `chromium` (default), `firefox`, `webkit`. WebKit phone/tablet get the iPhone/iPad user agent (touch, no `isMobile`); Firefox gets touch only. On a Windows host with display scaling the WebKit viewport is enlarged so the page lays out at the requested CSS size (pictures are then larger) |
| `--theme t,..` | `PURPLE BLUE GREEN ORANGE BOLD_BLUE OLED_BLACK RED BROWN` or `all` (default). Written to the app's `themeColors` preference in localStorage before load |
| `--rtl` | browser locale `he-IL`; the app follows it (`dir="rtl"`) |
| `--server real\|test` | which Jellyfin `/dev/login` signs in to (default `test`, the throwaway one) |
| `--run name` | output folder `shots/out/<name>` (default: timestamp) |
| `--strict` / `--strict-warnings` | non-zero exit on errors / on errors and warnings |
| `--workers N` | parallel browser contexts (default 4) |
| `--dpr N` | device scale factor (default 1) |
| `--settle-ms N` | per-picture settle limit (default 15000) |
| `--channel c` | `msedge` or `chrome`: drive an installed browser (still headless and muted) instead of the bundled Chromium. It has the proprietary codecs the player scenes need; `none` forces the bundled one. Compare mode uses `msedge` unless told otherwise |
| `--compare`, `--no-capture` | see Compare |

## Output

```
shots/out/<run>/<viewport>/<theme>/<scene>.png
shots/out/<run>/index.html      contact sheet: grouped by scene, viewport/theme/name filters, click to enlarge
shots/out/<run>/report.html     health report (report.json has the same data)
shots/out/<run>/compare/index.html   (compare mode)
shots/out/latest.json           name of the newest run
```

Both HTML files work when opened straight from disk.

### Health report

Per picture: console errors and warnings, uncaught exceptions, failed requests and 4xx/5xx responses, route stubs
(`[data-route-stub]`), horizontal overflow of the document (with the first offending elements), broken images
(loaded with zero natural size) and zero-size images, redirects away from the requested path, settle timeouts, and
timing. Errors: console errors, page errors, failed or 4xx/5xx requests, broken images, navigation failures.
Warnings: console warnings, stubs, overflow, zero-size images, settle timeouts, failed `prepare`, unexpected redirects.
Identical issues across viewports and themes are collapsed in `report.html`.

### Settle detection

No fixed sleeps. A picture is taken after two consecutive passes in which: no API/asset request has been in flight for
350 ms, web fonts are loaded, every `<img>` in the viewport is complete and decoded, no visible `[aria-busy="true"]`
element remains, and the layout of everything in the viewport is identical across two animation frames. CSS animation
and transition are disabled (and `prefers-reduced-motion: reduce` emulated) unless the scene sets `animations: true`.

## Scenes: `tools/shots/scenes.ts`

A scene is `{ name, path | (jf) => path, prepare?(page), waitFor?, auth?, state?, ... }` (all fields documented in
`types.ts`). Adding one is a few lines:

```ts
// a page for a real item, resolved at run time (return null to skip when the server has no such item)
{ name: 'item-movie-4k', path: async (jf) => { const m = await jf.first({ includeItemTypes: 'Movie', sortBy: 'Random' }); return m && `/item/${m.Id}` } },

// an interaction scene: prepare runs after the page settled, then settle runs again before the picture
{ name: 'settings-about-dialog', path: '/settings', prepare: async (page, ctx) => { await page.getByText(uiText(ctx.lang, 'about')).first().click() } },
```

* Find controls by role, by the data attributes the app already sets (`data-pref-id`, `data-focus-key`, ...), or by
  name through `uiText(ctx.lang, key)` / `uiPattern(ctx.lang, key, { match, i })` from `uiText.ts`: the name as the
  app shows it in the run's language, read from `src/i18n` (keys are the Android string names; an English fallback
  in Hebrew comes wrapped in a left-to-right isolate, as the app shows it). A literal English name fails in the
  `--rtl` run.

* `jf` is a read-only Jellyfin client using the token of the crawler's browser session (`jellyfin.ts`): `jf.first(params)`,
  `jf.items(params)`, `jf.get(path)`, memoized lookups (`jf.movie()`, `jf.seriesWithSeasons()`, `jf.resumable()`,
  `jf.libraryOf('movies')`, ...). Never write to the server from a scene's `path`; only `prepare` may click.
* `auth`: `'in'` (default, signed in), `'out'` (empty profile, first launch), `'saved'` (server + user remembered, no token:
  what the setup screens show).
* `state`: navigation state for pages driven by it (`/grid`), delivered as `history.state.usr` on the first load.
* `servers: ['test']` limits a scene to the throwaway server (for scenes that write to it). The Quick Connect scenes
  answer `/QuickConnect/*` locally (`mockQuickConnect`), so they run on either server and leave no pending code behind.
* `allowEmpty` silences the `empty-page` warning (raised when the picture shows the "No results" text).
* The wall clock is frozen at 20:00 local time in every context (today, or a day inside the server's TV guide
  window when today's 20:00 is outside it, so the Live TV scenes have data whenever the crawler runs), and every `prepare` is followed by an 800 ms pause
  before the settle check, so hover-intent, header and backdrop timers have landed.
* `viewports: ['phone']`, `allow: [/regex/]` (expected request/console failures), `fullPage`, `animations`, `extraWaitMs`.
* Interaction helpers exported from `scenes.ts`: `hoverCard`, `focusRow`, `expandDrawer`, `pointAtDrawerLibrary`,
  `pointAtDrawerItem`, `contentCards`. The drawer helpers know the three modes (mouse hover on the rail, tap on a touch
  rail, menu button for the phone sheet) and wait for `nav[data-open]`; the card helpers use `[data-focusable]` outside
  `nav`/`aside`/`header`. A `prepare` that throws is reported as a warning and the picture is still taken.
* Each scene runs from the baseline profile: localStorage is reset before every scene, so scenes cannot contaminate each other.

Every route in `src/app/routes.tsx` has at least one scene. Known guesses: `home-more-row` opens row index 0 (the id is a
numeric index into the home settings), `grid` passes `{ request: 'favorites' }` as state, `discover-more` uses `trending`; adjust when the
pages define their ids.

* `prefs: { ... }` merges app preferences into the scene's profile (interface scale, a theme of its own),
  `clock` freezes another moment than 20:00 (an ISO string, or a function of `jf`: the Live TV scenes use a moment
  inside the test server's guide), `compareOnly` keeps a scene out of plain crawls.
* A scene on a `/play/...` page ends its playback session after the picture, so the server stops transcoding.

## Compare

`npm run shots:compare` crawls the scenes named in `refmap.ts` and writes `compare/index.html`: Android TV
reference (`refshots/out`, described by its `manifest.json`) on the left, the web picture on the right. No pixel
diffing. `refmap.ts` has one line per reference picture (`{ ref, scene, note }`); `--no-capture --run <name>` rebuilds
the sheet from an existing run.

The web side is `tvScenes.ts`: one scene per reference state, named `tv-<reference file name>`, `compareOnly`.
Each runs in a 1920x1080 window with the interface-scale preference at 160 %, which makes the root scale 2: the
page is laid out on the TV's 960x540 dp canvas and 1 dp is 2 picture pixels on both sides, so the pictures can be
overlaid. (A 960x540 window at device scale 2 gives the same pixels but trips the narrow-window media queries.)
The scenes use the keyboard the way the reference run used the remote (`press(page, 'down*2 right enter')`,
`until(page, 'down', /label/)`), from the page's own arrival focus, so focus looks and scroll positions are the
app's. Items are the throwaway test server's fixtures, looked up by name. The run takes about 20 minutes with
`--workers 1`: the player scenes (references 23-25, 34-36) play a few seconds of video each and need H.264, hence
headless Edge.

What cannot match: data that changed since the references were taken (watched marks, resume points, the home
rows), the clock, and the recorded web-only parts (Back button, mini player, web-only player buttons). The notes in
`refmap.ts` name them per picture.
