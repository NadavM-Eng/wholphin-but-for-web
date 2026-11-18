# End-to-end regression suite

Playwright Test drives the real app (Vite dev server) against the **throwaway test Jellyfin** (`http://localhost:8097`,
`tools/testserver/`). Tests assert behaviour (URLs, focus, ARIA state, server state), never pixels; pictures are the
screenshot crawler's job (`tools/shots`).

## Running

```bash
npm run ts:up          # the test Jellyfin must be up and seeded (global setup stops the run with a hint if not)
npm run e2e            # everything: setup + desktop, keyboard, phone, writes + the firefox, webkit, iphone smoke projects
npm run e2e:desktop    # one project (also e2e:keyboard, e2e:phone, e2e:writes)
npx playwright test --project=firefox --project=webkit --project=iphone   # only the other engines
E2E_ENGINES_ALL=1 npx playwright test --project=firefox --project=webkit --project=iphone   # every desktop / phone test in them
npm run e2e:flaky      # every read-only test 3 times (flake hunt); skips @writes, whose copies would race
npm run e2e:typecheck  # tsc over e2e/ and playwright.config.ts
npm run e2e:list       # which tests run in which project
npx playwright test e2e/specs/home.spec.ts -g "arrow keys"   # one test
```

- The dev server is started on port **5601** (`E2E_PORT`), with its own Vite cache (`node_modules/.vite-5601`), and
  reused when it already runs. Workers: 4 (`E2E_WORKERS`); a full run (257 tests, seven projects) takes about five minutes.
- Two runs at the same time (several agents or working copies on one machine) must not share a port: give each its
  own `E2E_PORT` (for example `E2E_PORT=5701 npm run e2e`). A port other than 5601 (or `E2E_RUN_ID`) also gives the
  run its own output folder (`e2e/.output/<run>/`) and its own device ids (`wholphin-e2e-<run>-…`), so the runs do not
  overwrite each other's storage states or revoke each other's tokens.
- Every browser is headless and muted (`tools/quiet-playwright.mjs` enforces it; the config says it too). Do not use
  `--ui`, `--headed` or `--debug` on the shared machine: they open windows.
- Output goes to the git-ignored `e2e/.output/`: `auth/` (signed-in storage states), `test-results/` (trace,
  screenshot and error context of each failure), `report/` (HTML report). Read a trace with
  `npx playwright show-trace e2e/.output/test-results/<test>/trace.zip` (opens a window: not on the shared machine).
  Traces record what the test typed, including the test server's passwords: keep them local.
- Retries: 0 locally (a test that fails once is a bug: fix the test, or report the app bug), 1 on CI.

## Layout

| Path | What |
|---|---|
| `playwright.config.ts` | projects, web server, output folders, defaults (reduced motion, UTC, en-US) |
| `e2e/global-setup.ts` | fails fast unless the test server is up and seeded (resume points, next up, libraries, Quick Connect, both users) |
| `e2e/auth.setup.ts` | `setup` project: one signed-in storage state per project through `/dev/login?server=test` |
| `e2e/projects.ts` | browser profiles (desktop 1440x900, phone 390x844 touch) and storage-state paths |
| `e2e/fixtures/index.ts` | the suite's `test`/`expect`, tags, `SIGNED_OUT` |
| `e2e/fixtures/app.ts` | `app`: settle, landmarks, Home helpers, focus helpers, preferences, overflow check |
| `e2e/fixtures/api.ts` | `api`: the test server as the test user (lookups, user data snapshot/restore, Quick Connect) |
| `e2e/fixtures/guard.ts` | the shared console / request check and its allow-list |
| `e2e/fixtures/env.ts` | `TESTSRV_*` from `.env.local` (never printed), port and base URL |
| `e2e/flows/*.ts` | multi-step UI flows shared by specs (sign-in screens) |
| `e2e/specs/<area>.spec.ts` | one spec file per app area |

## Projects and tags

Every test lists the projects it runs in with tags (`TAG` in `fixtures/index.ts`); a test without one of these tags
runs nowhere.

| Project | Tag | Browser | Session | Notes |
|---|---|---|---|---|
| `desktop` | `@desktop` | Chromium 1440x900, mouse + keyboard | signed in | |
| `keyboard` | `@keyboard` | Chromium 1440x900 | signed in | keyboard only: any pointer event fails the test |
| `phone` | `@phone` | Chromium 390x844, touch, mobile UA | signed in | `app.activate()` taps |
| `writes` | `@writes` | Chromium 1440x900 | signed in (own session) | tests that change server state |
| `firefox` | `@engines` | Firefox 1440x900 (Firefox UA, `media.volume_scale` 0) | signed in | smoke subset; `E2E_ENGINES_ALL=1`: every `@desktop` test |
| `webkit` | `@engines` | WebKit 1440x900 (Safari UA) | signed in | smoke subset; `E2E_ENGINES_ALL=1`: every `@desktop` test |
| `iphone` | `@iphone` | WebKit 390x844, touch, iPhone UA | signed in | touch smoke subset; `E2E_ENGINES_ALL=1`: every `@phone` test |
| `setup` | - | | | creates the storage states; every project depends on it |

Signed-out tests start with `test.use(SIGNED_OUT)`.

Other engines, things to know:

- Playwright's WebKit on a Windows desktop with display scaling (e.g. 110 %) lays the page out narrower than the
  requested viewport (1440 becomes 1256 CSS px). The `page` fixture enlarges the viewport so the page gets the
  project's CSS size (`matchCssViewport`, shared with the crawler). Read the CSS width with
  `page.evaluate(() => innerWidth)`, not `page.viewportSize()`. The `iphone` profile therefore has no `isMobile`
  (mobile viewport emulation cannot be compensated); it keeps touch, `hover: none` and the iOS user agent.
- Touches in that WebKit land at the wrong point (scaled by the host DPI). Use `app.tap(locator)` (or
  `app.activate`), never `locator.tap()`: in WebKit it dispatches the touch pointer sequence and the click on the
  element itself.
- Playwright's headless Firefox hides all scrollbars; WebKit opens a page without an `about:blank` history entry
  before it (assert history through the router's `history.state.idx`, not by going Back past the first page).
- Each engine words a cancelled or refused request differently (`net::ERR_ABORTED`, `NS_BINDING_ABORTED`,
  `Load request cancelled`; `ERR_CONNECTION_REFUSED`, `NS_ERROR_CONNECTION_REFUSED`, `Blocked by Web Inspector`):
  allow-list patterns must cover all three.

## Conventions

- **Fixtures.** Import `test`, `expect`, `TAG`, `SIGNED_OUT` from `e2e/fixtures`, never from `@playwright/test`
  (the shared checks live in the fixtures).
- **Selectors.** Roles and accessible names first (`getByRole('button', { name: 'Add Server' })`), then the app's
  own data attributes: `data-shell`, `data-shell-drawer` (`rail`/`sheet`, `data-open` while expanded),
  `data-page-root`, `data-focusable`, `data-card-surface`, `data-card-scaler`, `data-card-more`
  (a card's "more" button), `data-home-rows` (Home's vertical rows scroller), `data-home-row`, `data-home-pos="row:col"`,
  `data-home-header`, `data-drawer-id` (`profile` for the user entry, `s_<id>` for libraries), `data-pin-dots`,
  `data-shell-backdrop`, `<html data-pointer>` (the mouse owns the highlight), `data-grid-index` (a library grid /
  playlist cell), `data-queue-marker` (`playing` / `queued` on a song row), `data-mini-player`, `data-pref-id` (a
  settings row), `data-channel` and `data-focus-key^="lt-program:"` (the guide), `data-photo-folder`,
  `data-slideshow-stage`, the player's `data-player-strip` (the control strip), `data-player-top`, `data-player-button="<name>"`
  (`play`, `chapters`, `queue`, `settings`, `back`, `panel-close`...), `data-player-time`, `data-player-sheet`,
  `data-player-panel="chapters|queue"` with `data-chapter` / `data-queue` rows and `data-current` on the one being played,
  `data-seekbar`, and the few existing `data-testid`s of the setup screens. Do not add test ids to `src/` from a test task: list the missing hook in your report (see below).
  English strings are fine as names: the suite pins `locale: 'en-US'`.
- **Waiting.** `app.goto(path)` navigates and settles (same rule as the crawler, `tools/shots/settle.ts`: network
  quiet, fonts and visible images loaded, no visible `aria-busy`, layout stable). After that use web-first
  assertions (`await expect(locator)...`, `expect.poll`), never fixed sleeps. When the app moves focus a frame after a
  render, wait for the focus (`await expect(x).toBeFocused()`) before typing.
- **Touch gestures.** `app.touchDrag(from, to, { steps, holdMs })` sends a real one-finger swipe or drag in
  Chromium (DevTools protocol `Input.dispatchTouchEvent`), so the browser itself decides between panning the page
  and handing the pointer events to the app; use it for "a scroll that starts on a control must not change it".
  WebKit and Firefox have no such channel: there dispatch the pointer events on the element and assert the
  computed `touch-action` (a dispatched pointer cannot be captured: allow that page error with `guard.allow`).
- **Focus.** `app.focusedHomePos()`, `app.focused`, `app.press(key, times)`, and `app.expectSingleHighlight()`:
  exactly one `[data-focusable]` shows the TV focus look (`:focus-visible` while the keyboard owns the highlight,
  the hovered element while `<html data-pointer>` is set: the same rule as the kit's CSS).
- **Server data.** Never hard-code ids; ask `api` (`findMovie('Spring')`, `findSeries`, `findResumeItem`,
  `resumeItems()`, `nextUp()`, `userViews()`). Other people use the same test server, so derive expectations from
  the API at test time rather than from a fixed list.
- **Writes.** A test that changes server state is tagged `@writes` only, calls `api.snapshot(id)` (and forces its
  starting state) before acting, verifies the change through the API, and leaves the restore to the fixture
  (`api.restoreAll()` runs after every test). Pick subjects that no read-only test asserts on. Never create Live TV
  recordings or timers, never delete media. One exception to the tag: `playback-engines.spec.ts` (`@engines`)
  plays a clip in Firefox and WebKit, which reports progress; each engine has its own clip that nothing else
  reads, snapshots it and lets the fixture restore it (do not repeat it with `--repeat-each`: copies would race).
  Its Hebrew test (`@desktop @engines`) pauses a video to open the player's sheets, under the same rule: one item
  per engine that no other test plays.
  The playlist the "Add to playlist" test creates is deleted by the test, but Jellyfin may write its metadata
  file after the delete (the test waits 3 s first for that reason); the folder then stays and the server's next scheduled library scan lists it again as a
  playlist without an owner (the app's permission lookup answers 404 for it, which the console guard reports in
  every test that opens "Add to playlist"). The global setup removes such leftovers older than ten minutes when
  the server's administrator is in `.env.local` (`TESTSRV_ADMIN_USER` / `TESTSRV_ADMIN_PASSWORD`).
- **Sessions.** Each context gets a device id per project and worker (`wholphin-e2e-<project>-w<n>`), so repeated
  sign-ins replace their own token instead of piling up devices, and parallel workers never revoke each other's
  token. Tests that sign in through the UI start `SIGNED_OUT` (or call `app.devLogin()` in a signed-out context);
  never sign in again inside a shared signed-in state.
- **Preferences.** `app.setPreference(key, value)` calls the app's own `setPref` through the module URL the page
  really loaded (after an HMR update that is `preferences.ts?t=…`). It is for setup; the settings screens are
  driven through their UI in `settings.spec.ts`.
- **Reduced motion.** The suite runs with `prefers-reduced-motion` and also injects a stylesheet that removes every
  transition and animation (`style[data-e2e="no-animation"]`, the crawler's). That stylesheet can hide bugs of
  the app's own reduced-motion rule: a test about it removes the element first (`context-menu.spec.ts`).
- **Console / requests.** Any console error, page error, failed request or HTTP >= 400 fails the test. Suite-wide
  exceptions (each with its reason) are in `GLOBAL_ALLOWANCES` (`fixtures/guard.ts`); a failure a test provokes on
  purpose is allowed in that test with `guard.allow(/pattern/, 'reason')`. Allowed hits are listed as annotations
  in the report.
- **Known app bugs.** A test that documents a bug that is not fixed yet calls `test.fail()` with a comment that
  points to "Known app issues" below; it starts failing ("expected to fail") once the bug is fixed, which is the
  signal to drop `test.fail()`.

## Adding a spec for a new area

1. Create `e2e/specs/<area>.spec.ts` (`library`, `detail`, `playback`, `settings`, `seerr`, `livetv`, `music`,
   `photos`...). Import from `../fixtures`.
2. Tag each test with the projects it makes sense in. Keyboard-only behaviour gets its own `@keyboard` test that
   uses only `page.keyboard`; touch behaviour gets `@phone` and `app.activate()`/`tap()`.
3. Look up subjects with `api` (add a lookup to `fixtures/api.ts` if needed: e.g. `findItem('MusicAlbum', name)`).
4. Repeated multi-step UI belongs in `e2e/flows/<area>.ts`; a markup detail used by several specs belongs in
   `fixtures/app.ts` (one place to fix when markup changes).
5. Replace the area's route in `specs/layout.spec.ts` with a real subject if it needs one (the overflow and console
   checks then cover the real page), and add rows to the coverage table below.
6. Playback: keep media seconds long, one video at a time, stop the session at the end (the server must stop
   transcoding). Use `channel: 'chrome'`/`'msedge'` (headless) only in the tests that need real codecs.
7. Run the new spec 3 times (`npx playwright test e2e/specs/<area>.spec.ts --repeat-each=3`) before handing it in.

## Coverage

| Area | Behaviour | Spec | Projects |
|---|---|---|---|
| Sign-in | cold start without a saved server lands on the server list | `signin` | desktop, phone |
| | Add Server: unreachable (Unable to connect), not a Jellyfin (Invalid server info), valid -> user list | `signin` | desktop, phone |
| | password login: wrong password shows the error, right one lands on Home | `signin` | desktop, phone |
| | whole sign-in with the keyboard only | `signin` | keyboard |
| | deep link while signed out reopens after sign-in (`?next`) | `signin` | desktop |
| | session survives a reload (Home and an inner page) | `signin` | desktop, phone |
| Accounts | Quick Connect: code shown, approved through the API, app signs in | `accounts` | desktop, phone |
| | PIN: set + confirm, required on next entry and after reload, wrong PIN rejected, removed | `accounts` | desktop, phone |
| | switch user from the drawer, sign in as a second user, back to the first without a password | `accounts` | desktop |
| Home | Continue watching contains every seeded resume item and Next up entry | `home` | desktop, phone |
| | View more grid lists the row's items | `home` | desktop, phone |
| | header and backdrop follow the hovered card | `home` | desktop |
| | header and backdrop follow the keyboard focus | `home` | keyboard |
| | arrows across rows (remembered column), into the drawer and back | `home` | keyboard |
| | one highlight with a mouse: the launch-focused card loses its ring once the mouse moves | `home` | desktop |
| | a row is dragged sideways with the mouse; the drag does not open the card under it, a plain press still does | `home` | desktop, firefox, webkit |
| | a "View more" page opened by its address (and reloaded) focuses a card in view | `home` | keyboard |
| | a reloaded, scrolled "View more" grid brings the card that takes focus fully into view | `home` | keyboard |
| | Back with the mouse to a scrolled "View more" grid: the opened card has focus again and the page stays where it was, also when the window cuts that card | `home` | desktop |
| | a press elsewhere that ends without a click (middle or secondary button) gives the keyboard-focused card its look back | `home` | desktop, firefox, webkit |
| Back / Escape | no Back on Home; Back on an inner page returns with scroll and focus restored | `navigation` | desktop |
| | Escape goes back with scroll and focus restored; Escape on Home toggles page and drawer | `navigation` | keyboard |
| | deep-linked inner page goes Back to Home | `navigation` | desktop, phone |
| | Back in the phone top bar | `navigation` | phone |
| | Escape right behind Enter on a card is answered by the page that opens (Back to Home, card focused, drawer closed) | `navigation` | keyboard, firefox, webkit |
| | Escape at the moment the router is through, before the new page shows (sent from a microtask of the router's `pushState`): answered by the new page, from a Home card and from a drawer entry | `navigation` | keyboard, firefox, webkit |
| Context menu | right-click opens a popup at the pointer; outside click closes it | `context-menu` | desktop |
| | right-click menu takes focus, arrows move, Escape closes it and focus returns to the card | `context-menu` | desktop |
| | the same with the app's own reduced-motion rule only (no suite stylesheet) | `context-menu` | desktop |
| | Menu key opens the dialog, arrows wrap, Escape returns focus to the card | `context-menu` | keyboard |
| | a window resize that makes the grid build its cards anew keeps focus on the same card, with the Menu-key dialog open or without | `context-menu` | keyboard |
| | touch "More" button opens the dialog | `context-menu` | phone |
| | touch long-press opens the dialog without a native contextmenu (iOS) and the release does not click | `context-menu` | phone, iphone |
| | Favorite / Unfavorite change the server state | `context-menu` | writes |
| | Mark as watched changes the server state | `context-menu` | writes |
| Drawer | rail collapsed, expands on hover, collapses on leave; libraries = `/UserViews` in order | `drawer` | desktop |
| | navigating closes it and marks the entry | `drawer` | desktop |
| | keyboard focus expands it; Enter navigates and focus moves into the page; back to Home focuses the first card | `drawer` | keyboard |
| | Favorites by keyboard, twice: the first card takes focus and stays the same element (the grid is not re-created when `?tab=` is written); on the second visit (cached data) it takes focus again, not the tab row | `drawer` | keyboard |
| | an arrow key with nothing focused (after a blur) returns to the last focused card, the next one moves from it | `drawer` | keyboard |
| | an empty page (every favorites request, `/Artists` too, answered "none"): the empty state shows, focus leaves the collapsed drawer for the page, Left returns to the entry | `drawer` | keyboard |
| | a page with nothing focusable yet (favorites requests held): focus waits on `<main>` itself, then the page's first card takes it | `drawer` | keyboard |
| | keys pressed while the page is loading (the toward-page key right behind Enter, then Down and Right): focus stays out of the drawer and the first card takes it when the data arrives | `drawer` | keyboard |
| | choosing the current page's own entry again builds the page anew: the first card takes focus | `drawer` | keyboard |
| | Down reaches the music mini player from a failed page with nothing to focus, not while that page is loading; Up waits on the page area, from where the drawer key enters the drawer (playback reports answered locally) | `drawer` | keyboard |
| | Enter on the Live TV entry moves focus into the guide; Left returns to the entry | `drawer` | keyboard |
| | phone sheet: hidden and inert, opens from the menu button, Escape closes, navigating closes | `drawer` | phone |
| Library | tabs: the URL follows the tab; "Remember selected tabs" reopens it on a fresh visit | `browse` | desktop |
| | sort, filter and view options apply to the grid and survive a reload | `browse` | desktop, firefox, webkit |
| | the view options switches expose their state | `browse` | desktop |
| | the letter column jumps to the first title with that letter | `browse` | desktop, firefox, webkit |
| | the grid loads pages of 100 as it scrolls; End jumps to the last item | `browse` | keyboard, firefox, webkit |
| | Back from an item restores the focused card of the grid | `browse` | keyboard |
| | mouse hover moves the details header only after the hover-intent delay | `browse` | desktop |
| | the wheel scrolls a grid whose card has keyboard focus and the grid stays scrolled (one fixed 700 ms wait: the defect was a timer) | `browse` | desktop, firefox, webkit |
| | the wheel right after an arrow key scrolls the Recommended tab and the rows stay scrolled (the same fixed wait) | `browse` | desktop, firefox, webkit |
| | Up from the first row reaches the grid's own buttons and Down returns; Left from the letter column returns to the last focused card | `browse` | keyboard |
| Detail | movie page: header, play buttons and rows | `detail` | desktop, phone, firefox, webkit, iphone |
| | movie page: Play takes the arrival focus and Down reaches the rows | `detail` | keyboard |
| | the audio and subtitle choosers list the item's tracks | `detail` | desktop, firefox, webkit |
| | favourite and watched buttons change the server state | `detail` | writes |
| | mixed-direction metadata keeps its block at the start edge, text in its own direction | `detail` | desktop |
| | playlist: the first row takes focus on a direct load and on a reload | `detail` | keyboard |
| | playlist: view options switch between list, dense list and grid and are kept | `detail` | desktop |
| | playlist: Move down / Move up reorder it on the server | `detail` | writes |
| | box set: focusing an item swaps the collection header for the item header, Up brings it back | `detail` | keyboard |
| | delete from the detail page and from a grid card menu: asks first, then sends the DELETE (mocked) | `detail` | desktop |
| | "Send media info log to server" uploads a client log with the media sources (upload mocked) | `detail` | desktop |
| | Add to playlist can create a new playlist with the item | `detail` | writes |
| | a click beside a nested dialog closes only that dialog, focus stays in the one underneath; beside a single dialog it returns to the opener | `detail` | desktop, firefox, webkit |
| | dialogs opened from a menu entry (Media Information, Add to playlist) give focus back to the More button; Add to playlist: Up reaches the search field, Down leaves it | `detail` | keyboard |
| Series | season tabs switch the episode strip and the URL follows | `series` | desktop, phone, firefox, webkit, iphone |
| | a deep link selects and focuses its episode; the arrows move the selection and the URL; Enter right after an arrow still comes Back to the episode that was opened | `series` | keyboard |
| | missing and unaired episodes show as placeholder cards (mocked) | `series` | desktop |
| | "Mark entire series played / unplayed" asks first and sends the request (mocked) | `series` | desktop |
| | Down from the episode strip onto the buttons scrolls the overview (reduced motion: the TV with animations off) with the focused button whole in view; Up returns to the top | `series` | keyboard |
| Search | searches as you type, the URL keeps the query, Back returns to the results | `search` | desktop, phone, firefox, webkit, iphone |
| | Back to the results restores the focused card | `search` | keyboard |
| | Include types: one switch per type; turning Movies off drops the Movies row | `search` | desktop |
| Home settings | a row added, moved to the top and saved to this device shows first on Home | `home-settings` | desktop |
| | leaving the editor and discarding keeps Home unchanged | `home-settings` | desktop |
| | a finger that starts on a reorder handle scrolls the row list and the rows keep their order; resting on the handle (one fixed 650 ms wait: the pick-up is a 400 ms timer) picks the row up and the drag reorders | `home-settings` | phone |
| Preferences | theme changes `data-theme` and colors, survives reload | `preferences` | desktop |
| | Hebrew: `dir=rtl`, translated drawer, drawer on the right, survives reload | `preferences` | desktop, phone |
| | interface scale changes the root font size (and dp sizes), survives reload | `preferences` | desktop |
| Settings | theme dialog changes the theme at once, survives reload | `settings` | desktop, phone, firefox, webkit, iphone |
| | drawer -> Settings; drawer-items dialog, subtitle style, Home customization, user settings open | `settings` | desktop |
| | Profile protection > Require PIN > Escape: focus is back on the settings row | `settings` | keyboard |
| | License page: arrows scroll the page, Right hands focus to a row in view, Left reaches Back without the page jumping | `settings` | keyboard |
| | Hebrew: a slider summary of a number and a Latin unit ("100 Mbps") is drawn left to right; a translated one keeps the interface's direction | `settings` | desktop, firefox, webkit |
| | a finger that starts on a slider scrolls the settings list, straight or slightly diagonal, and the value stays; a sideways drag moves the thumb under the finger without scrolling; a tap sets the value (real touch gestures, `app.touchDrag`) | `settings` | phone |
| | the slider under dispatched touch pointer events (these engines cannot be sent a moving touch): `touch-action: pan-y`; down, an up-and-down move and a cancel change nothing; a sideways drag and a tap do | `settings` | firefox, webkit, iphone |
| | interface scale, finger drag (real touch, `app.touchDrag`): at every move the root font size and the slider's box are unchanged while the thumb and the summary show the pending value; lifted, the size is applied in one write and the slider is in view at the same height | `settings` | phone |
| | interface scale, mouse drag: during the drag the root font size and the slider's box are unchanged, the summary shows the pending value and the same point gives the same value again; the release applies once, the slider stays in view, at the same height, focused; a click on the track applies at its release | `settings` | desktop, firefox, webkit |
| | interface scale under dispatched touch pointer events: a drag applies nothing until its release, a cancelled one nothing at all | `settings` | firefox, webkit, iphone |
| Playback | H.264 item in headless Edge: plays, pauses (k), seeks (5 = 50 %), exits; Stopped report carries the position | `playback` | writes |
| | detail Resume opens the player at the resume point (`?t=`) | `playback` | writes |
| | a 15 s H.264 clip plays, pauses and Back leaves; the engine's own H.264 report is an annotation; each engine its own clip, user data restored | `playback-engines` | firefox, webkit |
| | Hebrew, paused player: the speed list (".25", ".5", ".75") and the Settings sheet's bitrate value are drawn left to right, a translated value right to left | `playback-engines` | desktop, firefox, webkit |
| Playback without server conversion | a Matroska file in headless Edge is played directly (the profile built in the browser offers `mkv`, PlaybackInfo answers direct play, no encoder on the server), seeks to the middle and near the end | `playback-direct` | writes |
| | PGS subtitles over a directly played file: the track comes as a `.sup` file without a token in its address and is drawn on a canvas; a picture inside a cue (9.5 s, 3 s, 17.5 s), none between cues, and it appears within half a second of a cue start while playing | `playback-direct` | writes |
| | the second audio track of a file: an HLS remux whose reason is `SecondaryAudioNotSupported`, the server's encoder report says video and audio are copied; the first track with an ASS subtitle plays directly | `playback-direct` | writes |
| | an HDR10 file on a display that is not HDR is played directly in desktop Chromium (skipped where the browser has no HEVC Main 10 decoder; the support it reports is an annotation) | `playback-direct` | writes |
| Player layout | controls shown (mouse) over a paused frame: no element with a background lies over the picture and its pixels are the bare frame's, also with the chapters panel open; only the top and bottom strips are dark; the web preference "Dim the video while the controls are shown" brings the TV scrim back | `playback-layout` | writes |
| | a 2.39:1 film: the control strip is at most 12.8 % of the window height in ten window sizes (9 % on the desktop ones), sits on the bottom edge and starts below the picture on 16:9 windows; every button whole inside the window and the strip, none overlapping; one row of buttons on desktop and phone landscape, two on phone portrait; title in the top strip, "Ends at" in the row | `playback-layout` | writes |
| | mouse: the Chapters button (no Queue button for a single movie) opens a panel on the strip at the end side, at most half the window wide, one row per chapter with pictures, the current one marked and focused; an outside press (video stays paused), the button itself and the Close button close it; choosing a chapter seeks and hides the controls | `playback-layout` | writes |
| | keyboard only: Enter focuses Play; Left / Right reach every button of the strip, Up the seek bar and Back, Tab the same set; chapters and queue panels by button and by H / Q: focus on the current row, arrows stay inside, Escape / Backspace / the same key close with focus back on the button; Enter on a chapter seeks without bringing the controls back; Enter on the next queue entry plays it (the address follows) | `playback-layout` | writes |
| | Hebrew: transport at the right in left-to-right order, options at the left, elapsed left and remaining right of the seek line, Back at the right, the panel at the left | `playback-layout` | writes |
| | touch (390x844 and 844x390 in the writes project): a tap shows the strip (two rows in portrait, one in landscape, within 12.8 %), the chapters panel is as wide as the screen in portrait and at most half in landscape, a tap on a row seeks | `playback-layout` | writes |
| Music | music library opens the music tabs | `music` | desktop, phone, firefox, webkit, iphone |
| | album Play fills the queue; mini player shows progress; body padded by the bar | `music` | desktop, firefox, webkit |
| | audio playlist on the playlist page: music menu on a song, focus back to the row, Play all marks the rows, the last row stays clear of the mini player | `detail` | desktop |
| | an arrow key with nothing focused brings the last focused song back clear of the mini player | `music` | desktop |
| | Down from the last Home row enters the mini player, Up returns | `music` | desktop |
| | Now Playing: after the focused lyric line went away with its track, arrows show the controls and Escape leaves | `music` | desktop |
| Photos | photo album grid -> viewer; photo library page | `photos` | desktop, phone, firefox, webkit, iphone |
| | the viewer's address follows the photo (reload returns to it); a 1 s slideshow goes on past the second photo | `photos` | desktop, firefox, webkit |
| | Left from any letter of the photo grid returns to the card focused last, never to the nav drawer | `photos` | keyboard |
| Live TV | guide renders, program dialog opens, no Timer/Recording write attempted (writes answered locally) | `livetv` | desktop, firefox, webkit |
| | Live TV library and recordings tab (browse grid toolbar) | `livetv` | desktop |
| | a click on a program after keyboard focus left the first guide row opens that program | `livetv` | desktop, firefox, webkit |
| | the DVR tab opened by its address takes focus (first row, or the selected tab when the schedule is empty) | `livetv` | keyboard |
| | a Live TV tab chosen with the mouse keeps focus; chosen with the keyboard, its content takes it (writes answered locally) | `livetv` | desktop, firefox, webkit |
| Discover | real server, read-only: drawer entry, rows, title page, request answered locally (never reaches Seerr) | `discover` | desktop |
| Layout | no horizontal overflow on every route and on the sign-in screens | `layout` | desktop, phone |
| Engines | the app starts with no "browser too old" notice; a failing feature test shows it and the app does not start | `engines` | desktop, firefox, webkit |
| | resizing Home, a library grid and Favorites raises no ResizeObserver loop error | `engines` | desktop, firefox, webkit |
| | scrollbars are themed (standard properties, `::-webkit-scrollbar` fallback at most 8px) | `engines` | desktop, firefox, webkit |
| | the card "more" button opens the menu dialog and Escape returns focus to the card (Safari: clicks do not focus) | `engines` | desktop, firefox, webkit |
| | smoke subset in Firefox / WebKit: sign-in, Home, drawer, a library (sort, filter, view options, letter jump, paging), movie page and its choosers, series, search, right-click and Menu-key menus, Back and Escape, theme, Hebrew, no overflow, the settings theme dialog, a slider under touch pointer events, music library and album Play with the mini player, photo album into the viewer, the guide and its program dialog, a short H.264 playback | tagged specs | firefox, webkit |
| | touch subset with the iPhone profile: sign-in, Home, drawer sheet, movie page, series, search, More button, long-press, Back, Hebrew, no overflow, the settings theme dialog, a slider under touch pointer events, music library, photo album into the viewer | tagged specs | iphone |
| All | no console errors, page errors or failed requests on any visited page | fixture | all |

The Discover spec signs in to a real server with a limited account (`TEST_JELLYFIN_USER` /
`TEST_JELLYFIN_PASSWORD`); it is skipped when those are not configured.

## Known app issues

None open. Fixed and turned into normal tests: two cards highlighted with a mouse on Home (`home`), the right-click
menu not taking keyboard focus (`context-menu`), keyboard focus staying in the collapsed drawer after navigating to a
page with nothing focusable (`drawer`). When a test documents a new bug, list it here with a reproduction and mark the
test `test.fail()`.
