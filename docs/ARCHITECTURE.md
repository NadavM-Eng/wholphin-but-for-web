# Architecture

How Wholphin Web is put together, for whoever maintains it: the moving parts, where each one lives, and the conventions the code follows.

Last updated: 2026-11-24. Describes the code on `main` at `509db33`: the merged app with the TV-comparison pass, the final check and repair, the backdrop colour fix ([final-merge-notes.md](final-merge-notes.md) sections 11 and 12, [parity-notes.md](parity-notes.md)), the polish round that followed (merge commit `f1fb308`, [final-merge-notes.md](final-merge-notes.md) section 13), the two commits after it: values in right-to-left languages (`692715f`, section 12 below) and touch on sliders and the reorder handle (`7ad52ba`, section 10 below; both in [final-merge-notes.md](final-merge-notes.md) section 14), and the work since, which [PROJECT-LOG.md](PROJECT-LOG.md) records as phases 31 to 34:

- the release round of 2026-11-18: a slider that applies its value at the release (`93fe59c`, section 10), the audio-track icon (`6c14670`), and the compact player layout with the probes and profile rules that let the browser play more by itself (`bf31148`, section 14.4);
- the maintenance round of 2026-11-22: the scrollbar gutter of card grids (`db14d7c`) and the press that stays with its control (`4a08905`, both section 10), the direction of subtitle lines (`6f16c8b`), and the player's fixed button positions, clock times and favourite button (`c2316a4`, `255bff6`, all three section 14.4);
- the shell and Settings round of 2026-11-23: the Back button's rules (`32a0101`, section 6), the drawer over the page (`bb76c45`), Settings as a panel over a copy of the page it was opened from (`dc3c877` to `445a739`, both section 13), and the series page's people rows (`ba1526e`, section 14.2);
- 2026-11-24, after the second release: the new order of Settings (`b7f3310`, section 14.5), which `main` has and the public repository does not yet;
- 2026-11-24, after the third release (phases 40 and 41; section 14.4 is brought to `5734cae`, which adds the episode change that keeps the player in place): the mouse click gate (`0daae7e`), the subtitle hold during a skip and the volume on the Up and Down arrows (`93e5bf4`), the pointer rule for showing the controls (`7b000ca`), and the queue rules and the address that follows the queue (`e6dece7`);
- 2026-11-23 and 24: sign-in for a user without a password (`27ab920`) and the Home header's overview (`8d305b7`, both section 13), and the subtitle style options and compact Settings sheets of the player (`e31ba4b`, `cf29a99`, `509db33`, section 14.4).

Related documents: [README.md](README.md) (index), [PROJECT-LOG.md](PROJECT-LOG.md) (chronology), [DECISIONS.md](DECISIONS.md) (decisions), [DEVIATIONS.md](DEVIATIONS.md) (differences from upstream), [TOOLING.md](TOOLING.md) (tools and commands), [STATUS.md](STATUS.md) (current state), [deploy.md](deploy.md) (running it in production), [spec/](spec/) (behavior specs extracted from upstream), [CLAUDE.md](../CLAUDE.md) (working agreement).

**What this page describes.** The merged application: sign-in, the app shell, Home, library browsing, detail pages, search, video playback, settings, Seerr (Discover), Live TV, music, photos, the in-app screensaver, the production server and the test suites, as one code base. Every path named here is relative to the repository root. "Upstream" means the original Wholphin Android TV app; `W/` is short for its Kotlin source folder inside the git-ignored `reference/` checkout.

**What this page does not claim.** It describes structure and behavior as written in the code. It is not a test report. Where a section says something was checked, it names the source (the merge notes in [final-merge-notes.md](final-merge-notes.md), or a feature's own notes). For what was driven in a browser, route by route, see [STATUS.md](STATUS.md). Places where the code has two mechanisms for one job, or a question that is still open, are collected in [section 22](#22-two-mechanisms-and-open-points).

---

## 1. The big picture

Wholphin Web is a single-page application. That means the browser downloads one HTML page plus JavaScript once, and every screen after that is drawn by JavaScript without reloading the page. It talks to two servers:

- **Jellyfin**, the media server. The browser calls it **directly**, for API calls, images, video and audio. Jellyfin allows cross-origin requests (requests from a page on a different address), so no middleman is needed.
- **Seerr**, the request manager for movies and shows (Jellyseerr or Overseerr). The browser reaches it **only through a same-origin proxy**: a path on the app's own address (`/seerr-proxy`) that forwards to Seerr. This is needed because Seerr sends no CORS headers (CORS is the browser rule that blocks cross-origin calls unless the server allows them) and keeps its login in a session cookie, which the browser only sends to the same address.

In production, a small Node server (`server/`) serves the built app, publishes the runtime settings file `/config.json`, and runs the Seerr proxy. It does not carry video or images. During development, the Vite dev server does the same jobs: it serves `public/config.json` and proxies `/seerr-proxy` to the address in `DEV_SEERR_URL` (see `vite.config.ts`).

```text
                      +---------------------------------------------+
                      |                  Browser                    |
                      |  Wholphin Web (React single-page app)       |
                      |                                             |
                      |  @jellyfin/sdk ------------------------+    |
                      |  Seerr client (fetch, relative path) --|-+  |
                      +----------------------------------------|-|--+
                               |  page, assets, /config.json   | |
                               v                               | |
   +-----------------------------------------------+           | |
   | Wholphin Web server (Hono, Docker image)      |<----------|-+  same origin:
   |  - serves dist/ (the built app)               |           |    /seerr-proxy/api/v1/...
   |  - GET /config.json  (serverUrl, Seerr path)  |           |
   |  - /seerr-proxy/* --> Seerr (cookie rewrite)  |           |
   |  [dev: the Vite dev server does these jobs]   |           |
   +------------------------|----------------------+           |
                            |                                  |  cross-origin, direct:
                            v                                  |  /Users, /Items, /Videos, images ...
                     +-------------+                    +------v------+
                     |   Seerr     |                    |  Jellyfin   |
                     +-------------+                    +-------------+
```

The intended deployment puts this server at its own address (a subdomain such as `wholphin.example.org`, or its own port) behind an existing reverse proxy, next to Jellyfin's built-in web interface rather than replacing it. Since 2026-11-18 it runs that way as a trial, at the trial address behind a real reverse proxy ([DECISIONS.md](DECISIONS.md) O-26, O-27; section 15). Whether and when the trial becomes permanent is the owner's decision (O-8, Q-1).

---

## 2. Stack and why

| Piece | Used for | Why this one |
|---|---|---|
| Vite 8 | dev server and production build | fast, simple config, built-in proxy for Seerr in development |
| React 19 + TypeScript 7 (strict) | all UI | its ecosystem covers every need here. TypeScript runs with `erasableSyntaxOnly`, so the code uses no `enum` and no parameter properties |
| React Router 8 (`createBrowserRouter`) | URLs, layouts, lazy pages, scroll restoration | one route table maps every upstream screen to a URL |
| TanStack Query 5 | all server reads, caching, retry | per-user cache keys, invalidation after changes |
| TanStack Virtual | long horizontal rows and grids | only visible cards are in the page |
| Zustand 5 | small global stores (session, preferences, shell, backdrop, toasts, playback state, music queue, Seerr link, screensaver) | minimal code, works outside React too |
| `@jellyfin/sdk` | typed Jellyfin API client (generated, uses axios) | official, covers every endpoint |
| i18next + react-i18next | translations | plural rules, lazy loading of languages |
| hls.js | HLS streams where the browser has no native HLS | needed for transcoded and remuxed video |
| jassub | ASS/SSA subtitles drawn by libass compiled to WebAssembly | styled subtitles look as their authors intended |
| libpgs | PGS (Blu-ray picture) subtitles drawn on a canvas, in a worker | the renderer Jellyfin's own web client uses; without it the server burns such subtitles into the picture, which re-encodes the video ([DECISIONS.md](DECISIONS.md) T-59). MIT license |
| `vendor/rvfc-polyfill` | a local stand-in for a dependency of jassub | the published package is GPL-3.0, which cannot ship in a GPL-2.0-only project ([DECISIONS.md](DECISIONS.md) T-32) |
| CSS Modules + generated CSS variables | styling | exact upstream values matter more than convenience, so no UI kit, no Tailwind, no CSS-in-JS |
| Vitest (+ jsdom) | unit tests | same config as Vite |
| Playwright | the end-to-end suite (`e2e/`) and the screenshot crawler (`tools/shots`) | drives Chromium, Firefox and WebKit |
| Hono on `@hono/node-server` | the production server (`server/`) | small, typed, easy to test |

Versions are in `package.json`. The license is GPL-2.0-only, the same as upstream Wholphin. The reasoning behind these choices is recorded in [DECISIONS.md](DECISIONS.md): T-1 (stack), T-10 (Seerr proxy), T-11 (deployment). Three components that ship with the app are under the Apache License 2.0 (hls.js, abslink, which jassub depends on, and the Material Design icon path data). The root file `LICENSE-EXCEPTION.md` grants an additional permission for combining the project's own code with them, `THIRD-PARTY-NOTICES.md` lists every shipped component with its license, and the question is recorded as Q-22.

---

## 3. Folder map

To find the file that is responsible for something a person sees or does, use [CODE-MAP.md](CODE-MAP.md): a generated page with "Where is ... ?" rows, the screens, the `data-*` markers, the folder trees and every file of `src/` with a line about it (`npm run map` writes it; DECISIONS T-82). The table below is the short version.

| Path | Owns |
|---|---|
| `index.html`, `public/browser-check.js` | the page shell, and the "browser too old" test it loads as a plain script file (section 4) |
| `src/main.tsx` | entry point: imports global CSS, runs `startApp()`, then renders `<App />` |
| `src/app/` | startup (`startup.ts`), providers (`providers.tsx`), route table (`routes.tsx`), layouts and auth guard (`layouts.tsx`), `AppShell.tsx`, typed navigation (`nav.ts`), arrow-key navigation (`spatialNav.ts`), scroll restoration (`useScrollRestore.ts`), toasts, error screens, the backdrop request contract (`backdrop.ts`), how preferences take effect (`applyPreferences.ts`) |
| `src/app/shell/` | the parts of the app shell: nav drawer, backdrop renderer and service, backdrop colour extraction (`palette.ts`, `extractColors.ts`, `backdropColors.ts`), clock, Back button and Back key, focus plumbing and the arrival state (`shellFocus.ts`), focus restore on Back and focus recovery after a resize (`useFocusRestore.ts`), history mirror, drawer pins and their dialog, shell layout flags, the copy of the page that stays behind Settings (`pageSnapshot.ts`, `PageUnderlay.tsx`; section 13) |
| `src/app/dev/` | `DevLoginPage.tsx`, a dev-only sign-in shortcut used by the test tools |
| `src/api/` | Jellyfin client and session lifecycle (`session.ts`), runtime config (`config.ts`), query keys and the shared `QueryClient`, image URL building (`images.ts`), shared hooks (`hooks/useUserViews.ts`), playback URL builders (`playback/urls.ts`), the Seerr client (`seerr/`) |
| `src/stores/` | Zustand stores: saved servers, users and the current session (`session.ts`); preferences (`preferences.ts` and the generated `preferences.gen.ts`); remembered playback choices (`playbackChoices.ts`); the music queue state (`musicQueue.ts`) |
| `src/i18n/` | i18next setup (`index.ts`, with the left-to-right fallback and the shared `withCount` helper), generated `locales/*.json` and `locales/index.ts`, web-only strings in `extra/en.json` |
| `src/theme/` | generated `tokens.css`, `typography.css`, `themes.gen.ts`; hand-written `global.css` (base styles and the text-trimming helpers `t-line`, `t-trim`, `t-trimBox`) and `scale.ts`; the Font Awesome font file in `fonts/` |
| `src/ui/` | the shared presentational component kit (buttons, cards, rows, grids, dialogs, menus, inputs, text), helpers in `ui/lib/` (the input-modality tracker, pivot scrolling `bringIntoView.ts`, row mouse drag `dragScroll.ts`, menu placement `menuPosition.ts`, the arrow exits of a one-line text field `fieldArrowExit.ts`), a dev-only gallery page, and `LIB_DEFAULTS.md` |
| `src/features/common/` | item plumbing shared by every feature: card adapters, the item context menu and its handler registry, item mutations and cache patching, hover intent, library list, display preferences. Its `README.md` is the guide |
| `src/features/setup/` | server list, user list, login dialog, PIN entry |
| `src/features/home/` | Home rows, header, "view more" grid, Home customization (`settings/`) |
| `src/features/browse/` | library pages: tabs, the shared library grid, recommended rows, genre and studio tiles, Favorites, the generic item grid |
| `src/features/detail/` | movie, episode, series, series overview, box set, playlist and person pages, with shared pieces in `detail/common/` (see its `README.md`) |
| `src/features/search/` | the search page, voice input, and the extension points other features plug into |
| `src/features/playback/` | the playback engine (`engine/`, see its `README.md`), the player screen (`PlayerView.tsx`) and its controls (`ui/`) |
| `src/features/settings/` | settings screens, subtitle style editor, Debug and License pages, the client log |
| `src/features/discover/` | the Seerr pages (Discover, requests, title and person pages) and the Seerr pieces that appear on other pages |
| `src/features/livetv/` | TV guide, DVR schedule, recordings |
| `src/features/music/` | music library, album, artist and song pages, the music player service, the mini player, Now Playing |
| `src/features/photos/` | photo grids, the photo viewer and slideshow, and the in-app screensaver |
| `src/lib/` | pure helpers: formatting (`format.ts`), ids (`ids.ts`), safe `localStorage` access (`storage.ts`) |
| `server/` | the production server: static files, `/config.json`, security headers, the Seerr proxy, health endpoint (section 15) |
| `vendor/rvfc-polyfill/` | the project's own stand-in for jassub's `rvfc-polyfill` dependency, wired in through `overrides` in `package.json` |
| `e2e/` | the end-to-end regression suite (Playwright Test); `e2e/README.md` is its guide |
| `tools/` | Node and TypeScript scripts: the four generators, the screenshot crawler (`shots/`, with the TV-canvas scenes `tvScenes.ts`, the reference map `refmap.ts` and the interface-text lookup `uiText.ts`), the stylesheet guard for the oldest supported engines (`css-engine-baseline.test.ts`, section 16), the Android TV reference capture (`refshots/`), the throwaway test server (`testserver/`, with its self-renewing Live TV guide `guide.mjs`), the dev sign-in plugin (`vite-dev-session.ts`), `quiet-playwright.mjs` (forces test browsers headless and muted), `low-priority.ps1`, the agent-log archiver |
| `docs/` | this documentation set; `docs/spec/` holds the behavior specs plus `design-tokens.json` and `preferences.json`, which the generators read |
| `dev/`, `shots/` | working folders: `dev/testserver/docker-compose.yml` defines the throwaway test server (its `data/` subfolder is git-ignored); `shots/out/` holds crawler output (git-ignored) |
| `types/` | a type declaration for the `postcss-pxtorem` plugin |
| `public/` | files copied as-is into the build: `config.json` (default `{}`), `favicon.svg` |
| `reference/` | git-ignored checkout of the upstream Wholphin source; read-only |
| `Dockerfile`, `docker-compose.example.yml` | the production image and an example of running it |
| `LICENSE`, `LICENSE-EXCEPTION.md`, `THIRD-PARTY-NOTICES.md` | the GPL version 2 text, the additional permission for the Apache-2.0 components, and the list of shipped third-party components (written from `src/features/settings/licenses.gen.json`) |
| `playwright.config.ts`, `vite.config.ts`, `tsconfig*.json`, `.oxlintrc.json` | configuration of the end-to-end suite, the build and unit tests, TypeScript, and the linter |
| `.github/` | the CI workflow (`workflows/ci.yml`), Dependabot settings, issue and pull-request templates |

Tool details are in [TOOLING.md](TOOLING.md).

---

## 4. Startup sequence

The order is set in `index.html`, `src/main.tsx` and `src/app/startup.ts`.

### 4.1 The browser test in `index.html`

Before any module runs, a small script file (`public/browser-check.js`, loaded by `index.html`; a file and not an inline script, because the production Content-Security-Policy allows no inline scripts), written in old-style JavaScript so that old browsers can run it, tests five features: CSS relative color syntax (`rgb(from …)`), CSS `color-mix()`, `String.prototype.isWellFormed`, `Array.prototype.findLast`, and regular-expression lookbehind. If any is missing, the script sets `data-unsupported` on `<html>` and draws a full-page notice ("This browser is too old for Wholphin Web", with the minimum versions). The notice is plain English text built in the script; it does not go through the translation system, because that system has not loaded.

`startApp()` checks for `data-unsupported` first and, when it is set, returns a promise that never resolves. React is therefore never rendered and the notice stays. The supported versions and the reason for them are in section 16.

### 4.2 `startApp()`

1. `src/main.tsx` imports `theme/global.css`, which pulls in the Roboto font, `tokens.css` and `typography.css`.
2. `startApp()` in `src/app/startup.ts` runs, in order:
   1. `initScale()` (`src/theme/scale.ts`) sets the root font size from the window width and listens for resizes (section 9).
   2. `bindPrefsToSession()` (`src/stores/preferences.ts`) loads the signed-in user's own preferences now and whenever the user changes.
   3. `installClientLog()` (`src/features/settings/clientLog.ts`) starts recording console output into an in-memory buffer of 500 lines, with credentials redacted. It is installed here so that the Debug page and "Send app logs" see the whole session.
   4. `bindPreferenceEffects()` (`src/app/applyPreferences.ts`) applies the theme (`<html data-theme>`) and the interface scale, and re-applies theme, scale and UI language whenever those preferences change.
   5. `initSpatialNav()` (`src/app/spatialNav.ts`) installs the global arrow-key handler (section 11).
   6. `setItemMenuHandlers({ clearTrackChoices, sendMediaInfoLog })` installs two item-menu actions that need no screen of their own (section 7).
   7. `installModalityTracking()` (`src/app/shell/shellFocus.ts`) installs the input-modality tracker (section 11).
   8. `await initI18n(getPref('userInterfaceLanguage'))` (`src/i18n/index.ts`) starts i18next with English bundled, then loads and switches to the chosen language, or the browser's language when none is chosen. It sets `<html lang>` and `<html dir>`.
   9. `initSession({ signInAutomatically: getPref('signInAuto') })` (`src/api/session.ts`) is started **without** waiting for it.
3. React renders `<App />` (`src/app/App.tsx`): `Providers` around the `RouterProvider`. `Providers` (`src/app/providers.tsx`) nests the i18next provider, an error boundary and the TanStack `QueryClientProvider`, and mounts `<AppScreensaver />` once for the whole app (section 14.10).
4. `RootLayout` (`src/app/layouts.tsx`) shows a loading screen until the session store's `status` becomes `'ready'`, then renders the matched route.

### 4.3 Session restore

What `initSession()` does (a port of upstream `handleAppStart` and `restoreLastSession`):

1. Installs the global 401 handler (section 5).
2. `loadAppConfig()` (`src/api/config.ts`) fetches `/config.json` with `cache: 'no-cache'`. Fields: `serverUrl` (locks the app to one Jellyfin server), `serverName` (display fallback), `seerrProxyPath`. A missing or invalid file means normal multi-server mode.
3. If `serverUrl` is set, `ensurePresetServer()` probes `/System/Info/Public`, saves the server and marks it as the preset. If the probe fails but the server was saved before, the saved copy is used.
4. Picks the server: the preset, else the most recently used one. It becomes `selectedServerId`, so a signed-out visitor sees that server's user list.
5. If "sign in automatically" is on, the most recent user belongs to this server, has a token and is not protected (no PIN, not "require login"), it calls `changeUser()`, which validates the token with `GET /Users/Me`. A 401 here sets `authExpired`.
6. Always ends by setting `status: 'ready'`.

### 4.4 What is listening after startup

Several parts install global listeners. Knowing them helps when a key or click does something unexpected.

| Installed by | Where | Listens for | Purpose |
|---|---|---|---|
| `initSpatialNav()` | `src/app/spatialNav.ts` | `keydown` on `window`, bubble phase; `focusin` on `window`, capture | arrow keys move focus; Enter and Space activate non-native focusable elements; the last focused element inside each `data-focus-enter="restore"` / `"last"` container |
| `installInputModality()` | `src/ui/lib/inputModality.ts` | `pointermove`, `pointerdown`, `mousedown`, `keydown`, `contextmenu`, `click`, `pointerup`, `pointercancel`, `focusin`, `focusout` on `document` | which input owns the highlight, the last input and whether any input came yet, overlay openers, the Menu key, press focus, press hold (section 11) |
| `installModalityTracking()` | `src/app/shell/shellFocus.ts` | `keydown` and `pointerdown` on `window` (capture), `focusin` on `document` | the shell's memory of the last focused element in the page, the arrival state and the "arrival focus" (section 11.4) |
| `initSession()` | `src/api/session.ts` | every axios response | the 401 handler |
| `installClientLog()` | `src/features/settings/clientLog.ts` | console output | the Debug page's log |
| `initScale()` | `src/theme/scale.ts` | window resize | interface scale |
| `RootLayout` | `src/app/shell/useFocusRestore.ts`, `useAppStack.ts` | `focusin` on `document`; `pointerdown` and `keydown` on `window` (capture); `resize` on `window`; route changes | focus restore on Back; focus recovery when the focused element goes away in a resize or with an overlay's openers (section 11.5); the history mirror |
| `AppShell` and `FullScreenLayout` | `src/app/shell/useBackKey.ts` | `keydown` on `window` | Escape as Back, queued while a navigation is under way or its page is not shown yet (section 6) |
| `AppShell` | `src/app/AppShell.tsx` | `keydown` on `document` and `window`; installs the navigator's beam edge (`setBeamEdge`) | moving focus between the page and the drawer |
| `ItemRow` | `src/ui/rows/ItemRow.tsx` via `src/ui/lib/dragScroll.ts` | pointer, `click` (capture) and `dragstart` events on each row's scroller | mouse drag of a row (section 10) |
| `AppScreensaver` | `src/features/photos/AppScreensaver.tsx` | keys, pointer movement, touch, wheel | idle timer of the screensaver |
| `MusicHost` | `src/features/music/MusicHost.tsx` | `play` events on `document` (capture) | pausing music when an unmuted video starts |

`installModalityTracking()` is called from `startApp()`, `RootLayout` and `AppShell`; it installs once and ignores later calls.

---

## 5. Session model

Code: `src/stores/session.ts` (state and plain mutations) and `src/api/session.ts` (everything that talks to the network). Ported from upstream `ServerRepository.kt` and the setup view models.

### What is stored

| Thing | Type | Where |
|---|---|---|
| Saved servers | `SavedServer`: `id` (32-hex, lower case), `name`, `url` (normalized, no trailing slash), `version`, `lastUsed` | `localStorage` key `wholphin.session.v1` (Zustand `persist`) |
| Saved users | `SavedUser`: `id`, `serverId`, `name`, `accessToken` (or null), `primaryImageTag`, `pin`, `requireLogin`, `lastUsed`; keyed `serverId:userId` | same key |
| Most recent | `{ serverId, userId }` | same key |
| Current session | `CurrentSession`: `server`, `user`, `userDto` (the `/Users/Me` answer), `api` (an SDK `Api` bound to that server and token) | memory only |
| Runtime flags | `status` (`init`/`ready`), `selectedServerId`, `presetServerId`, `authExpired` | memory only |
| Device id | random 32-hex id per browser profile | `localStorage` key `wholphin.deviceId` |

The client identifies itself to Jellyfin as "Wholphin Web" with the app version, and a device name such as "Chrome on Windows" derived from the user agent (`deviceNameFromUserAgent`).

### Operations (`src/api/session.ts`)

| Function | What it does |
|---|---|
| `connectToServer(input)` | lets the SDK build address candidates (schemes, ports), probes each, picks the best. Rejects servers whose id is not a UUID or whose setup wizard is unfinished, as upstream does. Errors are a typed `SessionError` with the addresses tried |
| `selectServer`, `clearSelectedServer` | choose or leave a server in the setup flow |
| `getPublicUsers`, `getQuickConnectEnabled`, `getPublicSystemInfo` | setup-screen probes, 6-second timeout |
| `loginWithPassword` | `POST /Users/AuthenticateByName`; 401 becomes `invalid-credentials` |
| `initiateQuickConnect`, `waitForQuickConnect` | Quick Connect: get a code, poll every 5 s, exchange the secret |
| `changeUser` / `switchUser` | validate the token with `/Users/Me`, refresh server name and version, save, publish the session |
| `needsLogin(u)`, `needsPin(u)` | the click rules on the user list: no token or "require login" means password; a PIN means the PIN pad first. On the user list, a user whom the server lists without a password is signed in at the click, without the dialog (section 13, "Setup flow") |
| `leaveUser()` | "switch user": drop the current session, keep the token |
| `signOut()` | revokes the token on the server (`POST /Sessions/Logout`, which upstream never calls), forgets it locally |
| `removeUser`, `removeServer` | delete saved entries, ending the session if it was the current one |
| `signInWithToken` | used only by the dev sign-in route |

Components get the session with `useSession()` and the SDK object with `useApi()`; code outside React uses `getSession()` and `getApi()`.

### Preset server

When `/config.json` names `serverUrl`, the app is locked to that server: `presetServerId` is set, the setup flow starts at the user list, and the "switch servers" entries are hidden. `useSetupTarget()` (`src/app/useSetupTarget.ts`) returns `'users'` whenever a server is selected or preset, else `'servers'`.

### PIN and "require login"

These are local profile locks, as upstream has them. `pin` is a UI lock only; the server token stays the real credential. A protected user (`isProtected`: PIN set or `requireLogin`) is never restored automatically at startup. A successful server sign-in always clears the PIN, matching upstream. The PIN is a key sequence (digits plus U/D/L/R for the arrow keys) stored as plain text in `localStorage`, like the rest of the session store. Hashing it is an open question ([DECISIONS.md](DECISIONS.md) Q-16).

### 401 handling

`installUnauthorizedInterceptor()` adds one axios response interceptor. All SDK `Api` objects share axios' global instance, so this covers every Jellyfin call. When a response is 401 **and** the request carried the current user's token, `handleUnauthorized()` clears that token, ends the session and sets `authExpired`. The auth guard then redirects to the user list, which shows an "expired" message. The shared `QueryClient` (`src/api/queryClient.ts`) never retries 4xx responses and retries everything else once.

---

## 6. Routing

The route table lives only in `src/app/routes.tsx`. Its header comment maps every upstream `Destination` (from `W/ui/nav/Destination.kt`) to a URL. "Shell" means drawn inside the app shell with the nav drawer; "fullscreen" means no drawer. The Settings routes (`/settings` and everything under it) are full-screen routes that are drawn as a panel, with a copy of the page they were opened from behind it (section 13, "Settings over the page"). Every route below renders a real page; the placeholder component that earlier stages used (`RouteStub`) has been deleted.

| Path | Page (`src/features/…`) | Upstream screen | Layout |
|---|---|---|---|
| `/setup/servers [?next]` | `setup/ServerListPage` | SetupDestination.ServerList | setup |
| `/setup/users [?next]` | `setup/UserListPage` | SetupDestination.UserList(server) | setup |
| `/setup/login [?username&mode&next]` | `setup/LoginPage` | login dialog over the user list | setup |
| `/` | `home/HomePage` | Home | shell |
| `/home/row/:rowId [?position]` | `home/MoreHomeRowPage` | MoreHomeRow | shell |
| `/search [?q&tab]` | `search/SearchPage` | Search(query) | shell |
| `/favorites` | `browse/FavoritesPage` | Favorites | shell |
| `/item/:itemId [?song]` | `detail/MediaItemPage` | MediaItem (the page chooses the screen by item type) | shell |
| `/series/:itemId [?season&episode]` | `detail/SeriesOverviewPage` | SeriesOverview (season and episode are item ids) | shell |
| `/library/:itemId [?tab]` | `browse/CollectionFolderPage` | MediaItem for CollectionFolder / UserView / Folder | shell |
| `/library/:itemId/filtered [?type&filter&collectionType&recursive&types]` | `browse/FilteredCollectionPage` | FilteredCollection | shell |
| `/grid` (location state: `ItemGridState`) | `browse/ItemGridPage` | ItemGrid | shell |
| `/recordings/:itemId` | `livetv/RecordingsPage` | Recordings | shell |
| `/livetv` | `livetv/LiveTvPage` | Live TV collection (drawer entry) | shell |
| `/discover [?tab]` | `discover/DiscoverPage` | Discover | shell |
| `/discover/more/:type` | `discover/DiscoverMorePage` | DiscoverMoreResult | shell |
| `/discover/:mediaType/:tmdbId` | `discover/DiscoveredItemPage` | DiscoveredItem | shell |
| `/home/settings` | `home/HomeSettingsPage` | HomeSettings | fullscreen |
| `/settings` | `settings/SettingsPage` (renders `SettingsHome`) | Settings(BASIC), regrouped: quick rows and the nine subjects (web) | fullscreen |
| `/settings/subtitles [?hdr]` | `settings/SubtitleSettingsPage` | SubtitleSettings(hdr) | fullscreen |
| `/settings/topic/:topic` | `settings/SettingsTopicPage` | web only: one subject; holds the rows of upstream's Advanced, Experimental and UserAppPreferences screens | fullscreen |
| `/settings/:screen` | `settings/SettingsPage` | Settings(screen): screensaver, skip_segments, hdr_formats; `advanced`, `experimental` and `user` redirect to `/settings`, the Audio subject and the Profile subject | fullscreen |
| `/play/:itemId [?t&transcode&shuffle]` | `playback/PlaybackPage` | Playback (`t` = start in ms) | fullscreen |
| `/play/list/:itemId [?index&shuffle&recursive&sort&order&filter]` | `playback/PlaybackListPage` | PlaybackList | fullscreen |
| `/now-playing` | `music/NowPlayingPage` | NowPlaying | fullscreen |
| `/slideshow/:parentId [?index&id&start&recursive&sort&order&filter]` | `photos/SlideshowPage` | Slideshow | fullscreen |
| `/license` | `settings/LicensePage` | License | fullscreen |
| `/debug` | `settings/DebugPage` | Debug (no session needed, reachable from login failures) | fullscreen |
| `/dev/login [?next&server=test]` | `app/dev/DevLoginPage` | none (development builds only) | none |
| `/dev/gallery` | `ui/gallery/GalleryPage` | none (development builds only) | none |
| `*` | `app/NotFoundPage` | none | none |

Upstream's `UpdateApp` (Android self-update) has no web route. In a development build, `/play/:itemId?debug=1` shows the engine's debug page (`src/features/playback/engine/__dev/PlaybackDevPage.tsx`) instead of the player.

### Layouts and the auth guard (`src/app/layouts.tsx`)

```text
RootLayout                      loading screen until session status = 'ready'; <ScrollRestoration>, toasts,
 |                              focus restore on Back, history mirror
 +-- SetupLayout                /setup/*  (no session needed)
 +-- RequireSession             no session -> redirect to /setup/users or /setup/servers with ?next=
 |    |                         also mounts the Seerr binding and MusicHost for every signed-in route
 |    +-- AppShell              drawer pages
 |    +-- FullScreenLayout      settings (as a panel over a copy of the page), player, Now Playing, slideshow, license ...
 +-- FullScreenLayout           /debug (no session needed)
 +-- dev routes (development builds only), 404
```

- `RequireSession` sends a signed-out visitor to setup and keeps the requested address in `?next=` so it reopens after sign-in. The one exception: after a deliberate "switch user" from the drawer, the next session starts at Home (`leftUserDeliberately()`). While a user is signed in it mounts two invisible helpers for every route below it: `DiscoverDrawerFlag` (binds the Seerr state to the user, shows the drawer's Discover entry while Seerr is linked, and installs the search page's Seerr provider) and `MusicHost` (section 14.8). When the signed-in part unmounts (a sign-out, also from Settings) it discards the copy of the page behind Settings (`dropPageSnapshot()`), so the copy goes with the session.
- `FullScreenLayout` clears the backdrop when entered (upstream `DestinationContent.kt`), still draws the backdrop layer, and shows a floating Back button. A page hides that button with `useHideBackButton()` when it has its own Back control; the player, the photo viewer and the Debug and License pages do. On a Settings route (`isPanelPath()` in `src/app/shell/pageSnapshot.ts`) the layout differs in three ways: it renders `PageUnderlay` (the copy of the page Settings was opened from) between the backdrop and the page, it never shows its own Back button (the Settings layout places one itself where it needs one; a page could hide the shell's button only after it had shown for a frame), and the page does not fade in (`usePageFade(pageRef, !panel)`: the second argument switches the fade off).
- Every page is lazy-loaded: `page(() => import(...))` turns a module's default export into a React Router `lazy` component. Route pages are the only default exports in the code base.

### One route, several feature pages

Upstream sends many kinds of item to the same destination and decides the screen from the item. The web does the same in two route pages. The dispatch functions are pure (item in, page out), so the route page loads the item once and the feature page reuses the same cache entry (`itemKey`, section 7).

**The library route, `/library/:itemId`** (`src/features/browse/CollectionFolderPage.tsx`), decides in this order:

| Order | Test | Page |
|---|---|---|
| 1 | `useLiveTvRoute(itemId)` (`src/features/livetv/useLiveTvRoute.tsx`): the id is the Live TV library | `LiveTvView` (guide, DVR schedule, recording folders) |
| 1 | the same hook: the id is a recording folder | `RecordingsView` |
| 2 | `photoPageFor(folder, 'library')` (`src/features/photos/usePhotoRoute.tsx`): a photos or home-videos library | `PhotoLibraryPage` |
| 2 | the same function: a `PhotoAlbum` | `PhotoAlbumPage` |
| 3 | `musicPageFor(folder)` (`src/features/music/useMusicRoute.tsx`): a music library | `MusicLibraryPage` |
| 4 | collection type `movies` | movie library tabs: Recommended, Library, Collections, Genres |
| 4 | collection type `tvshows` | TV library tabs: Recommended, Library, Genres, Studios |
| 5 | anything else (box sets, playlists, music videos, books, plain folders) | the generic `LibraryGrid` |

The Live TV test needs the drawer's library list, so it runs before the folder item has loaded and answers "still loading" until that list arrives.

**The item route, `/item/:itemId`** (`src/features/detail/MediaItemPage.tsx`), loads the item with `useDetailItem()` and decides:

| Item type | Page |
|---|---|
| `MusicAlbum`, `MusicArtist` | `AlbumPage`, `ArtistPage` |
| `Audio` | the album page focused on that song (`?song=` does the same from a link); a song without an album gets `SongPage` |
| `PhotoAlbum` | `PhotoAlbumPage` |
| `Photo` | a redirect to the viewer on its parent folder (`/slideshow/<parent>?id=<photo>`) |
| `Movie`, `Video`, `MusicVideo`, `Trailer`, `Recording` | `MovieDetails` |
| `Episode` | `EpisodeDetails` |
| `Series` | `SeriesDetails` |
| `Season` | a redirect to `/series/<series>?season=<id>` |
| `BoxSet` | `BoxSetDetails` |
| `Playlist` (video or audio) | `PlaylistDetails` |
| `Person` | `PersonPage` |
| library and folder types | a redirect to `/library/<id>` |
| `TvChannel`, `Program` and their alternate spellings | a redirect to what a card click does: play the channel |
| anything else | a one-line "unsupported item type" notice |

**The filtered route, `/library/:itemId/filtered`** (`src/features/browse/FilteredCollectionPage.tsx`), shows a library narrowed to one genre or studio. A music library's genre (`type=Genre&collectionType=music`) renders `MusicGenrePage` instead.

`/livetv` and `/recordings/:itemId` render the same `LiveTvView` and `RecordingsView` directly. The hook forms `useMusicRoute()` and `usePhotoRoute()` still exist in their files but nothing calls them; the route pages use the pure `musicPageFor()` and `photoPageFor()`.

### Navigation helpers (`src/app/nav.ts`)

- `nav.*` builds a typed path for every route, for example `nav.item(id)`, `nav.series(id, { season, episode })`, `nav.play(id, { t, transcode, shuffle })`, `nav.playList(id, {...})`, `nav.slideshow(parentId, {...})`, `nav.settings('advanced')`. Empty, `false` and `null` query values are left out, and `true` becomes `1`. Code never builds app URLs by hand.
- `useNav()` returns the same names as actions that navigate, plus `to`, `replace`, `back`, `openGrid(state)` and `openItem(item)`.
- `itemDestination(item)` ports upstream `BaseItem.destination()`: where a click on a card goes. Extras and trailers play, episodes and seasons open the series overview, a TV channel or program plays the channel, audio opens its album, library folders open the library page, everything else opens `/item/:id`.
- The generic grid, `/grid`, receives its request as navigation state (`ItemGridState`), not in the URL. Opening `/grid` fresh, without state, shows a short notice.

### Back

The TV remote's Back key becomes three things:

- the browser's own Back (button, gesture), which is ordinary history;
- **Escape** (and the `GoBack` / `XF86Back` keys of TV browsers), handled by `useBackKey()` (`src/app/shell/useBackKey.ts`). It ignores the key while typing or while a dialog, menu or list box is open, lets the shell act first (close the drawer; on Home, move between page and drawer), and otherwise calls `useGoBack()`. It runs in the bubble phase on `window`, so a page that handles Escape itself calls `preventDefault()` and wins. **Queued Back:** on the TV a navigation is complete before the next key is handled; here the next page's module may still be loading with the address unchanged. A Back key pressed while the router reports a navigation under way (read from the router's own state through React Router's `UNSAFE_DataRouterContext`, because `useNavigation` lags a render behind) is remembered with the `location.key` that navigation ends in, and handled on the page it opens; it is dropped when another navigation took its place. There is a second such moment: the router is through, but React has not shown the new page yet (the router's state update is a transition), so the address is the new one while the Back rule on screen is still the old page's (on Home: "Back in the drawer returns to the page"). The hook remembers which `location.key` its page was rendered for; a Back key pressed while the router's location differs from it is queued in the same way and handled once the new page shows. Both cases are closed in this one hook, for every page;
- a visible in-app Back button (`src/app/shell/BackButton.tsx`) on inner pages ([DECISIONS.md](DECISIONS.md) O-12, T-7). Since `32a0101` it is absent wherever another way out is beside the page (O-39):
  - **Shell pages.** `AppShell` shows it unless `isDrawerDestination(path, drawerState)` (`src/app/shell/drawerItems.ts`) says the drawer itself leads to this page: Home, Search, Favorites, Discover, Live TV, a library or a recording folder, which is every path that `selectionForPath()` matches to a drawer entry. Until the libraries have loaded the drawer is empty, so the shape of the path decides in the meantime and the button does not flash. An item page, a "View more" grid and the other inner pages keep the button.
  - **Its look.** At rest the arrow has no circle. Under the pointer, and while the window is scrolled under it (`data-scrolled` on its slot), it gets the kit button's rest circle; keyboard focus keeps the kit's focused look (`src/app/shell/AppShell.module.css`).
  - **Settings.** No Back button while the empty area beside the panel can be clicked to leave; the Settings layout places its own where it cannot (section 14.5; O-39, O-40).

`useGoBack()` (`src/app/shell/useGoBack.ts`) pops one history entry. On the first entry of a tab (a deep link), there is nothing of the app's to pop and going back would leave the app, so it replaces the entry with Home instead.

Some pages apply upstream's own Back rules before leaving: the player (hide the controls, then dismiss the Skip button, then leave), Home customization (an inner back stack and a Save dialog, implemented as a router blocker so that Escape, the Back button and browser Back all follow it), and the TV guide (Escape jumps to the row's first program, then to the top).

### The history mirror

The TV app has its own back stack; the browser has history. `src/app/shell/historyMirror.ts` and `useAppStack.ts` keep a copy of upstream's stack on top of browser history (in `sessionStorage`, key `wholphin.shell.stack.v1`). The drawer needs it for three things: the selection highlight (which entry is "current"), drawer navigation that leaves the stack as exactly [Home, X], and "Home" going back to the existing Home entry instead of pushing a new one. `selectionForPath` in `src/app/shell/drawerItems.ts` matches a library entry by item id under either `/library/<id>` or its dedicated route. Every drawer navigation carries a fresh `drawerVisit` id in its location state (`useAppStack.ts`), and `AppShell` re-creates the routed page when that id changes, so choosing the current page's own drawer entry builds a new page, as upstream pushes a new destination.

### Scroll and focus restore on Back

| What | Mechanism | Where |
|---|---|---|
| Window scroll | React Router's `<ScrollRestoration getKey={(l) => l.key}>`, per history entry | `RootLayout` |
| Inner scroll containers | `useScrollRestore(key)` saves positions per history entry in `sessionStorage` (`wholphin.scroll.v1`, 200 entries) and keeps re-applying the position for about 2 seconds, so virtualized lists can restore after their data arrives | `src/app/useScrollRestore.ts` |
| Rows and grids of the UI kit | their own scroll memory | `src/ui/rows/scrollMemory.ts` |
| The focused element | `useFocusRestore()` records the focused element per history entry (`sessionStorage`, `wholphin.focus.v1`, 200 entries) and refocuses it when the entry is reached by Back or Forward, retrying for 2.5 seconds or until the user acts. A page can make the match exact with `data-focus-key`; otherwise the element is found again by its link and its position. The saved record carries the page's path and is used only on that path. Focus inside `data-no-focus-restore` is not recorded. The same record serves focus that is lost without a navigation (section 11.5) | `src/app/shell/useFocusRestore.ts` |
| Home's focused row and column | a small per-entry store in `sessionStorage` (`wholphin.entry.v1.*`) | `src/features/home/entryState.ts` |
| Library grids | each page is its own cached query; a new navigation refetches, Back reuses the cache. The grid component is keyed by the **visit** (`useVisitKey()`: the history entry's key, except that a replace navigation keeps the key it replaces), so a tab page that writes `?tab=` with a replace right after its first render does not build the grid twice; scroll memory stays keyed by `location.key` | `src/features/browse/data/visit.ts`, `usePagedItems.ts`, `components/LibraryGrid.tsx` |
| The TV guide | scroll position and focused cell per history entry, in memory | `src/features/livetv/GuideGrid.tsx` |
| Settings | the last focused row per history entry, in memory | `src/features/settings/SettingsLayout.tsx` |

---

## 7. Data fetching conventions

- **The SDK.** Components get the `Api` object with `useApi()` (`src/api/session.ts`) and call SDK helpers such as `getUserViewApi(api).getUserViews(...)`. Nobody creates axios instances or builds Jellyfin API URLs by hand. The exceptions are URLs that must work in `<img src>`, `<video src>` and `<audio src>`: image URLs (`src/api/images.ts`), playback URLs (`src/api/playback/urls.ts`) and the photo viewer's URLs (`src/features/photos/photoUrls.ts`). Media elements cannot send an Authorization header, so playback URLs carry the token as the `ApiKey` query parameter.
- **Query keys.** Every Jellyfin query key starts with `[serverId, userId, ...]`, built by `qk(...parts)` in `src/api/queryKeys.ts`. Switching user can therefore never show another user's cached data. `qkUser()` is the prefix for invalidating everything of the current user.
- **The shared item key.** `itemKey(id)` is the one key for `GET /Items/{id}`. Detail, music, photos, browse and Live TV all use it, so the item route and the feature page it dispatches to share one cache entry and one request.
- **Defaults** (`src/api/queryClient.ts`): data is fresh for 30 s and kept for 10 min; no refetch on window focus; refetch on reconnect; one retry except on 4xx; mutations never retry.
- **Seerr queries** use keys of the form `qk('seerr', seerrUserId, …)` and the Seerr client, not the SDK (section 14.6).

### Mutations and cache (`src/features/common/`)

`useItemActions()` (`useItemActions.ts`) provides `setFavorite`, `setPlayed`, `removeFromNextUp` and `deleteItem`. Each one patches every cached copy of the item at once (`patchItemInCaches` in `itemCache.ts`, which works on arrays, `{ Items }` objects, infinite pages and wrapper objects), then invalidates only the queries that declared a dependency:

```ts
useQuery({ queryKey: qk('my', 'list'), meta: itemQueryMeta('played', 'favorite'), queryFn })
```

The tags are `played`, `favorite`, `nextUp` and `deleted`. A query without tags still receives the in-place field patches, so a favorite heart or watched badge redraws without a refetch.

### The item menu and its handler registry

The long-press menu of the TV app is one shared component on the web.

- `buildItemMenu` (`src/features/common/itemMenu.tsx`, unit-tested) produces upstream's entries in upstream's order for an item and a set of page options.
- `useItemContextMenu()` (`useItemContextMenu.tsx`) wires the menu onto a card (`menu.cardActions(item)`) and returns `menu.element`, which a page renders once. That element also contains the delete confirmation, the "Play with" sub-menu and `ItemDialogsHost` (the Media Information, Add to playlist and stream chooser dialogs).
- Play, Resume, Restart, Shuffle and "Play with" navigate to `nav.play` / `nav.playList`.
- Actions whose screens live in another feature go through a registry, `src/features/common/itemMenuHandlers.ts`. Each handler starts as a placeholder that shows a "not available yet" toast. The owning feature replaces it with `setItemMenuHandlers({ … })`, which returns a function that restores only the keys that call set, and only while they are still its own.

| Handler | Installed by |
|---|---|
| `addToPlaylist`, `showMediaInfo`, `chooseStream` | `installItemDialogHandlers()` in `src/features/detail/common/itemDialogs.ts` (called by `ItemDialogsHost`) |
| `clearTrackChoices` | `src/app/startup.ts` (calls `deleteChosenStreams` in `src/stores/playbackChoices.ts`) |
| `sendMediaInfoLog` | `src/app/startup.ts` (loads `src/features/detail/common/mediaReport.ts` on first use) |
| `addToQueue`, `playMusic` | `MusicHost` (`src/features/music/MusicHost.tsx`) |

Music pages use a second, separate menu (`src/features/music/menu/`), as upstream does; see section 22.

### Remembered playback choices (`src/stores/playbackChoices.ts`)

Upstream keeps the user's version, audio and subtitle choices in a local database. The web keeps them in `localStorage` per server and user (key prefix `wholphin.playbackChoices.v1.`, capped at 3000 items): per item, plus a language choice per season and series. The detail pages' choosers write to this store and the playback engine reads it, so a choice made before pressing Play is the one that plays. Keying by item fixes an upstream bug where one movie's choice applied to every movie in the same folder.

### Image URLs and size buckets (`src/api/images.ts`)

A port of upstream `ImageUrlService.kt`.

- `buildItemImageUrl(base, itemId, type, params)` builds `{base}/Items/{id}/Images/{type}[/{index}]?…` with quality 96 by default. No token is added: Jellyfin's image routes are anonymous, and the `tag` parameter makes the URL change when the image changes, so browser caching is safe.
- `getItemImageUrl(base, item, type, opts)` applies upstream's selection rules branch by branch. For example, episodes and seasons use the series' poster, logo and backdrop; a missing Thumb falls back to a backdrop. Two rules avoid requests that are certain to fail (a web deviation; upstream sends them and its image loader swallows the 404):
  - **Series Primary.** A season or episode asks for its series' poster only when the item carries `SeriesPrimaryImageTag`, which the server sends whenever the series has one; without it (the series of a Live TV recording) the placeholder shows.
  - **Series backdrop.** An episode or season takes the series backdrop with the parent backdrop tag when `ParentBackdropItemId` is the series. The image rules cannot tell from a list item alone whether the series has a backdrop (lists that ask for primary images only carry no parent backdrop fields), so they still request it there; the episode page, which has the full item, asks for no backdrop when the item names no ancestor with one (`src/features/detail/episode/EpisodeDetails.tsx`).
- `getUserImageUrl`, `getPersonImageUrl` and `getChapterImageUrl` cover the other image kinds.
- **Size buckets.** A requested size is converted to device pixels (dp times interface scale times `devicePixelRatio`) and rounded **up** to the next value in `IMAGE_BUCKETS` (64, 96, 128 … 1920, 2560, 3840). Similar layouts therefore request identical URLs and reuse the browser cache.
- Features normally go through `useImageResolver()` in `src/features/common/imageResolver.ts`.

### Where local state lives

Besides the session and preference stores, features keep the following in the browser. All keys but one start with `wholphin.`; those marked "per user" end in `<serverId>:<userId>` or contain it.

| Key (prefix) | Storage | Holds | Owner |
|---|---|---|---|
| `wholphin.navPins.v1.` | local, per user | drawer pins | `src/app/shell/navPins.ts` |
| `wholphin.playbackChoices.v1.` | local, per user | version, audio and subtitle choices | `src/stores/playbackChoices.ts` |
| `wholphin.libraryDisplay.v1.`, `wholphin.rememberedTab.v1.` | local, per user | sort, filter and view options per library (the music library's Albums, Artists and Songs tabs share one entry, as upstream); the remembered tab | `src/features/browse/model/displayInfo.ts` |
| `wholphin.collectionSort.v1.`, `wholphin.collectionFilter.v1.`, `wholphin.collectionViewOptions.v1.` | local, per user | the sort and the filter of each box set, and the view options that all box sets share | `src/features/detail/collection/collectionOptions.ts` |
| `wholphin.photos.display.v1.`, `wholphin.photos.effects.v1.` | local, per user | the photo grids' sort, filter and view options; the viewer's color filter per photo or album | `src/features/photos/photoStorage.ts` |
| `wholphin.home_settings.v1.`, `wholphin.home_settings_source.v1.` | local, per user | locally saved Home rows and which source is chosen | `src/features/home/model/homeSettings.ts` |
| `wholphin.suggestions.v1.` | local, per user | cached library suggestions | `src/features/common/suggestions.ts` |
| `wholphin.seerr.links.v1` | local | per Jellyfin user: that a Seerr link exists, its method, user name and Seerr user id (never a password) | `src/api/seerr/session.ts` |
| `wholphin.seerr.apikeys.v1` | session (this tab) | a Seerr API key, when the user chose that method | `src/api/seerr/session.ts` |
| `wholphin.player.volume.v1` | local | the video player's volume and mute | `src/features/playback/ui/useScreenModes.ts` |
| `wholphin.scroll.v1`, `wholphin.focus.v1`, `wholphin.shell.stack.v1`, `wholphin.entry.v1.` | session | Back restoration (section 6) | `src/app/`, `src/features/home/` |
| `wh-scroll:` | session | scroll offsets of the UI kit's rows and grids (section 6); the one prefix that does not start with `wholphin.` | `src/ui/rows/scrollMemory.ts` |

Sort, filter and view options, drawer pins and playback choices are never synced to the server, as upstream keeps them in its local database. Upstream's `DisplayPreferences` use (client name "Wholphin", shared with the TV app) is ported in `src/features/common/displayPreferences.ts`.

---

## 8. Preferences

### Generation

`docs/spec/preferences.json` lists every upstream preference with its type, default, options, UI screens and a classification: `web`, `web-adapted` or `android-only`. `tools/gen-preferences.ts` (`npm run gen:preferences`) reads it and writes `src/stores/preferences.gen.ts`, which contains:

| Export | Content |
|---|---|
| `Preferences`, `PreferenceKey` | the typed shape: one key per web preference, named in lowerCamelCase from the upstream id with a trailing `Pref` removed (`BackdropStylePref` becomes `backdropStyle`) |
| `PREFERENCE_DEFAULTS` | defaults; durations are stored in milliseconds, as the app consumes them |
| `PREFERENCE_SCOPE` | `'app'` or `'user'` for each key |
| `SUBTITLE_HDR_KEYS` | for each of the 13 subtitle-style keys, the name of its HDR copy (`subFontSize` and `hdrSubFontSize`, and so on) |
| `PREFERENCE_META`, `PREFERENCE_SCREENS` | widget kind, string keys, options, slider ranges and units, and which settings screen and group each preference appears in. The settings pages are built from this data |
| `ANDROID_ONLY_PREFERENCES` | upstream preferences dropped on the web, each with the reason (26 entries) |

Web-only preferences are declared in the generator itself (`WEB_ONLY`); today those are `webInterfaceScale` and, since `bf31148`, `webPlayerDimVideo` (the Advanced screen's "Dim the video while the controls are shown", off by default; section 14.4). The generated file has 103 keys: 97 app-wide and 6 per user.

### Storage scope

Upstream keeps most preferences per device and a few on the user record. The web follows that ([DECISIONS.md](DECISIONS.md) T-15; `src/stores/preferences.ts`):

- **App-wide** values: `localStorage` key `wholphin.prefs.app.v1`, one document per browser.
- **Per-user** values (`userInterfaceLanguage`, `preferredAudioLang`, `preferredSubtitleLang`, `subtitleMode`, `searchExcludedTypes`, `searchIncludeDiscover`): `wholphin.prefs.user.v1.<serverId>:<userId>`.
- Only values that differ from the default are written, so a later change of default reaches users who never touched the setting.
- The scope rule is `scopeOf()` in the generator.

`CLAUDE.md` says preferences are "persisted per user"; the code stores most of them per browser. That mismatch is recorded as Q-18.

### API

- `usePrefs('themeColors')` or `usePrefs((p) => p.x)` in components; `getPref(key)` and `getPrefs()` elsewhere.
- `setPref(key, value)` saves to the right scope and applies upstream's side effects (turning AC3 off, or turning stereo downmix on, also turns off "prefer AC3 for surround").
- `resetPrefs(scope)` and `resetSubtitlePrefs()` reset values.

### How a preference takes effect

Code that needs a value reads it where it is used, so most preferences need no wiring. A few have global effects, wired once in `src/app/applyPreferences.ts`:

| Preference | Effect |
|---|---|
| `themeColors` | `<html data-theme="…">`, which switches the whole color token set |
| `webInterfaceScale` | `setUserScale()`, clamped to 50 to 200 percent. Its settings slider applies the value when a drag is released, not while it is dragged (section 10) |
| `userInterfaceLanguage` | `setLanguage()`: loads the locale and sets `lang`/`dir` |
| `signInAuto` | read once at startup by `initSession()` |

The screensaver preferences are followed by the screensaver service (section 14.10), and the playback preferences are read by the engine when it builds the device profile (section 14.4).

---

## 9. Theming, units and scale

### Tokens generator

`tools/gen-tokens.mjs` (`npm run gen:tokens`) reads `docs/spec/design-tokens.json` and writes three files:

- `src/theme/tokens.css`: for each of the 8 themes (PURPLE, BLUE, GREEN, ORANGE, BOLD_BLUE, OLED_BLACK, RED, BROWN) a `:root[data-theme='…']` block of `--c-*` variables. Each is the kebab-case Material role name: `--c-primary`, `--c-on-surface`, `--c-surface-variant`, `--c-border` (the focus accent) and so on. PURPLE is also the plain `:root` default.
- `src/theme/typography.css`: the Material 3 type scale as classes `.t-displayLarge` … `.t-labelSmall`.
- `src/theme/themes.gen.ts`: `THEME_NAMES`, `DEFAULT_THEME`, and the translation key for each theme's label.

Only dark schemes exist; upstream's light schemes cannot be reached in the app ([DECISIONS.md](DECISIONS.md) T-4). Elevated surfaces are precomputed: `--c-surface-1` and `--c-surface-3` are the surface color at 1dp and 3dp elevation, using the tv-material formula.

**Fixed colors (`--fx-*`).** Colors that do not change with the theme are also generated, in the same file. They come from two places: the `fixedColors` object of `design-tokens.json` (for example `--fx-black-50`, `--fx-golden-yellow`, the program-guide category colors `--fx-dark-cyan`, `--fx-dark-green`, `--fx-dark-purple`, `--fx-dark-red`, the Seerr badge colors `--fx-discover-*`, `--fx-favorite-active`, `--fx-star-filled`), and a short list written in the generator itself (`--fx-white`, `--fx-gray`, `--fx-black`, `--fx-red`, `--fx-green`, `--fx-blue`, and the Debug page's log colors `--fx-log-debug`, `--fx-log-info`, `--fx-log-warn`, `--fx-log-error`). The second list is not in the spec file yet (Q-30). Translucent black and white in component CSS are derived from `--fx-black` and `--fx-white` with relative color syntax, which is one reason for the browser baseline in section 16.

**Rules:** components use colors only through these variables, never a hex value. Text styles come from the `t-*` classes, either composed in a CSS Module (`composes: t-bodyMedium from global;`) or applied with `className`.

**Text trimming (`src/theme/global.css`).** A Compose `Text` on tv-material cuts the leading above its first and below its last line, so a one-line text is exactly as tall as the font (Roboto: 1.171875 em, the variable `--t-font-height`). CSS keeps full line boxes, which made web texts 2 to 5 dp taller than the TV's ([parity-notes.md](parity-notes.md) section 3.1). Three opt-in helpers, listed after the type classes so they win when composed with one, close the gap:

| Class | Use |
|---|---|
| `t-line` | a text that never wraps: `line-height: var(--t-font-height)` |
| `t-trim` | a block that may wrap or is line-clamped: the leading is pulled in with negative block margins. Exact in every engine; for a box with no margin, padding or background of its own |
| `t-trimBox` | `text-box: trim-both text`, where `t-trim` cannot serve (a box with its own padding or margins, or a slot whose content may already be trimmed). Engines round the font box up to whole pixels and may skip the end trim in a `-webkit-line-clamp` box |

`t-line` and `t-trim` are exact in every engine. `t-trimBox` is not: Firefox 128, the oldest supported Firefox, does not know `text-box` and keeps full line boxes, and Chromium rounds. The feature stylesheets therefore use `t-line` and `t-trim` (composed, or the `t-trim` margin rule written out where a selector cannot compose, as for each line of the setup screens' error list), and nothing outside `global.css` writes `text-box` itself. `t-trimBox` is left for the slots of `ListItem` that hold element children and the Live TV view-options title, whose box has its own padding. `tools/css-engine-baseline.test.ts` holds this rule (section 16).

The License page's badge colours (`src/features/settings/licenseColors.ts`) are computed from colour literals on purpose: they belong to the AboutLibraries library that upstream's License page uses, not to a Wholphin theme.

### Units: 1px = 1dp, converted to rem

Upstream sizes are in Android dp (density-independent pixels) and sp (the same, for text). In this code base CSS is written in `px` with **1px = 1dp**, so upstream numbers can be copied unchanged. At build time `postcss-pxtorem` (configured in `vite.config.ts`, `rootValue: 16`) rewrites every `px` to `rem`. The root font size then carries the interface scale, so everything grows and shrinks together. A true hairline that must not scale is written `1PX` (upper case), which the plugin leaves alone.

### The scale (`src/theme/scale.ts`)

- **Automatic part** by window width: 1 below 1600 CSS px, 1.25 from 1600, 1.5 from 2400, 1.75 from 3200. The TV app draws on a 960dp-wide canvas; desktop windows are much wider.
- **User part**: the `webInterfaceScale` preference (percent).
- The root font size becomes `16px × auto × user` and is updated on resize.
- JavaScript that needs real pixel sizes (virtualizer item sizes, canvas math) must not hardcode them. It uses `dp(n)`, the hook `useDp()` (re-renders when the scale changes), or `dpCss(n)` for an inline style that follows the scale without re-rendering.

`src/theme/global.css` sets the base: `color-scheme: dark`, the surface background, Roboto with system fallbacks (including a Hebrew-capable font), the Font Awesome Solid font used for upstream's icon glyphs, and thin themed scrollbars (standard properties, with a `::-webkit-scrollbar` fallback for browsers that ignore them).

---

## 10. The UI kit (`src/ui/`)

Everything is exported from `src/ui/index.ts`. A dev-only gallery (`/dev/gallery`, `src/ui/gallery/`) shows each component with sample data.

| Family | Components |
|---|---|
| Icons | `FaIcon` (Font Awesome glyphs by name), `MaterialIcon`, `DrawableIcon` (upstream vector drawables), `AppLogo` |
| Buttons | `Button`, `TextButton`, `IconButton`, `ExpandableButton`, `PlayButtons` |
| Cards | `CardFrame` (the base: focus scale, ring, actions), `CardImage`, `CardTitle`, `GridCard`, `PosterCard`, `BannerCard`, `BannerCardWithTitle`, `PersonCard`, `GenreCard`, `StudioCard`, `ViewMoreCard`, `ChapterCard`, `DiscoverItemCard`, `UserCircleCard`, `ServerCircleCard`, `WatchedBadge`, `Pill`, `ProgressBar` |
| Rows and grids | `ItemRow` (virtualized horizontal row; wheel, trackpad, touch, arrow buttons on hover, and mouse drag), `CardGrid` (virtualized, reflowing grid with a scroll-to-index handle), `AlphabetPicker`, `LoadingRow` |
| Feedback | `CircularProgress`, `LoadingPage`, `ErrorMessage`, `Toast`, `ToastViewport` |
| Overlays | `Dialog` (portal, optional scrim, focus trap, focus return), `DialogPopup` (the TV's 440 dp column; an optional `fit` makes the box as wide as its longest row, 240 dp to 440 dp, with a gap above and below, and only the language list uses it), `ConfirmDialog`, `ContextMenu`, `DropdownMenu`, `DropdownMenuItem`, `ListItem`, `SelectedDot` |
| Inputs | `TextField`, `SearchField`, `Switch`, `SwitchWithLabel`, `Slider` |
| Text | `TabRow`, `CommunityRating`, `CriticRating`, `StarRating`, `QuickDetails`, `TitleOrLogo`, `OverviewText`, `StreamChip`, `TitleValueText`, `MarqueeText` |
| Helpers (`ui/lib/`) | `inputModality.ts` (section 11), `bringIntoView.ts` (pivot scrolling, section 11.3), `dragScroll.ts` and `wheelScroll.ts` (below), `menuPosition.ts` (material3's dropdown placement), `fieldArrowExit.ts` (section 11.3), `touchIntent.ts` (below), `useLongPress`, `contextMenuPoint`, `idColor` (stable color from an id), grid math (`columnCount`, `cardWidth`), alphabet letters, star-rating steps, `useFocusedAfterDelay`, `observeResize`, focus and marquee utilities |

### The presentational rule

Kit components receive everything through props: data, labels already translated, links, handlers. They do not fetch data, read the session, or know about Jellyfin item objects. Turning a Jellyfin item into card props is the job of the adapters in `src/features/common/cardAdapters.ts`. `Button` forwards every `data-*` attribute, so pages can mark buttons for spatial navigation and tests.

### The focused look

The TV app has one "focused" look. For cards (`src/ui/cards/CardFrame.module.css`) that means scale 1.1 with tv-material's timing (300 ms in, 500 ms out, curve `cubic-bezier(0, 0, 0.2, 1)`) and a 3dp ring in `--c-border` centred on the edge of the 8dp rounded shape (tv-material strokes the outline), drawn by the card's scaler because the surface clips its content. An element marked `data-focus-held` (an overlay's opener, section 11.5) shows the same look. On the web the same look is drawn for keyboard focus and for mouse hover, but never for both at once; section 11 explains the rule and the CSS pattern every component follows.

### Mouse drag on rows

The TV has no pointer; the working agreement asks rows to scroll by wheel, drag and arrow buttons. `installDragScroll(el)` (`src/ui/lib/dragScroll.ts`), installed by `ItemRow` on its scroller, lets the mouse pull a row sideways. Only a mouse press with the main button, and only while the row can scroll, starts it; a finger and a pen pan natively. The press must move 6 CSS px (`DRAG_SLOP_PX`) before it counts as a drag; until then it stays a click. During a drag the row carries `data-dragging` and captures the pointer; the click that ends a drag is swallowed, so the card under the pointer does not open. While a row can scroll, the browser's own drag-and-drop of the card links is cancelled. The same arithmetic serves right-to-left rows.

`installWheelScroll(el)` (`src/ui/lib/wheelScroll.ts`, `4d6b61e`; DECISIONS O-50, T-79) is the mouse wheel's counterpart, and only the series overview's episode strip (`EpisodeStrip.tsx`) installs it, together with `installDragScroll`; the item rows keep their drag-scroll and their wheel scrolls the page. A wheel notch down (`isMouseWheelNotch`: not Shift, not Ctrl, mostly vertical, and a line or page step or at least 50 px, so the fine steps of a trackpad are left alone) scrolls the strip towards its end by `WHEEL_GAIN` times the notch, about one card, in both writing directions (`wheelTarget` is the pure part, unit-tested). The strip glides unless reduced motion is asked for; the next notch counts from the place the strip is gliding to, so quick notches add up. At either end of the strip the event is left alone and the page scrolls. The listener is not passive, because the page must not scroll for a notch the strip takes.

### Touch on controls that drag

A control that is dragged and sits in a page that scrolls has to decide what a finger means: the page, or the control. The TV has no touch, so this is the web's own rule. It lives in one small helper, `src/ui/lib/touchIntent.ts`:

- `TOUCH_SLOP_DP` (10): the travel, in dp, before a touch counts as a gesture. It is not smaller than the browsers' own slop (Android's is 8 dp, iOS uses about 10 pt), so the browser has normally decided whether it pans the page before the control reacts. Callers convert it with `dp()` from `src/theme/scale.ts`, so it grows with the interface scale.
- `touchIntent(dx, dy, slop)` reads the travel since the touch went down: `undecided` while it is inside the slop (a release there is a tap), `side` once it is past the slop and further sideways than up or down, `scroll` once it is past the slop and at least as far up or down as sideways.
- `pansByDragging(pointerType)` is true for a finger and a pen, the pointers that pan a page by dragging on it. A mouse does not.

**The slider** (`src/ui/inputs/Slider.tsx`, used by every settings slider, the view options dialogs, the photo dialogs and the player's volume control). Its stylesheet sets `touch-action: pan-y pinch-zoom`, so the browser may pan the page up and down and zoom with two fingers from a gesture that starts on it.

- **Mouse:** a press with the main button captures the pointer and sets the value at once; the drag follows. This is the path it always had.
- **Finger or pen:** the press only records where it landed and the value the slider had. Each move is read with `touchIntent`. `scroll` ends the gesture for the slider until release, also where nothing can scroll and no `pointercancel` comes, and also if the finger later turns sideways. `side` captures the pointer, and from then on the thumb is under the finger: the drag is absolute, like the mouse's, because a drag relative to the thumb could not reach the far end from a finger that started beside it. A release while still `undecided` is a tap and sets the value at that point.
- **`pointercancel`** after a drag began means the browser took the gesture for a pan after all: the slider puts back the value it had when the finger landed.
- A touch that the gesture does not track (a second finger, which the browser captures by itself) moves nothing: the capture-follows-pointer line is for the mouse only.
- Keyboard handling and right-to-left mirroring are unchanged; the pointer position is mirrored in the same place for all three inputs.

Known consequence, recorded and kept: a swipe that first goes more than the slop sideways and only then up is the slider's ([STATUS.md](STATUS.md) section 4.3).

**A slider that applies its value at the release** (`93fe59c`; [DECISIONS.md](DECISIONS.md) O-32). By default the slider reports every step of a drag through `onChange`, as the TV's slider does. One value cannot be applied under the pointer: the interface scale lays the whole page out anew, the slider included, so the same pointer position meant another value on the next move. For such a value the slider has an optional mode, switched on by passing `onDragValue`:

- During a pointer drag (mouse, finger or pen) the slider does not call `onChange`. It keeps the value under the pointer in its own state (`pending`), draws the thumb and fill from it, reports it as `aria-valuenow`, and tells the caller through `onDragValue(value)` so that the caller can show it.
- At the release it calls `onDragValue(null)` and then `onChange` once (not at all when the value is the one it had). A mouse click on the track goes the same way. A finger's tap never becomes a drag: it calls `onChange` once, at the lift.
- A `pointercancel`, or a pointer capture that ends with neither a release nor a cancel, calls `onDragValue(null)` and applies nothing, so a value that was never applied cannot stay on show.
- The keyboard still calls `onChange` for every step, as on the TV.

Who uses the mode is decided in the settings feature, not in the kit: `relaysOutPage(meta)` in `src/features/settings/prefModel.ts` names the preferences whose value re-lays out the page (the hand-written set `RELAYOUT_SLIDERS`, today `WebInterfaceScale` alone), `PreferenceRow.tsx` gives those rows a `dragSummary`, and `SliderPreference.tsx` then passes `onDragValue` to the slider and shows the pending value as the row's summary while a drag is under way. Every other slider stays in the default mode.

**A press that stays with its control** (`4a08905`). A mouse press on a slider that the page's text selection covered (select all, a double click on the slider, a selection across the row) made the browser start its own drag-and-drop of the selection: the pointer was cancelled and the slider did not follow. `keepPressToControl(el)` in `src/ui/lib/touchIntent.ts` is installed on the control's element: from a press with the main button until its release (or a cancel, the next press, or the window losing focus) it refuses `dragstart` and `selectstart` on the whole page, not only on the control, because the control can have moved from under the point of the press by the time the browser looks up what to drag. Focus on press stays the browser's own. It returns the function that removes it. The shared slider, the player's and the music player's seek bars and the TV guide's drag-scroll install it.

**The reorder handle** of the Home rows editor (`src/features/home/settings/RowListPage.tsx`) cannot use direction, because reordering is itself an up-and-down drag. It uses a rest instead:

- **Mouse:** a press on the handle picks the row up, as before.
- **Finger or pen:** the handle's stylesheet sets `touch-action: pan-y`, so a finger that lands on it and moves scrolls the list. Resting on the handle for `HANDLE_HOLD_MS` (400 ms) without leaving the 10 dp slop picks the row up; a move past the slop, a release or a cancel before that ends the wait. 400 ms is longer than a hesitation before a scroll and shorter than the 500 ms long press of `useLongPress`, at which Android would offer its own menu.
- `touch-action` cannot change during a gesture, so once the row is held the pan is refused per event: a native, non-passive `touchmove` listener on the handle calls `preventDefault()` (React's own touch listeners are passive and cannot). The browser's long-press menu is suppressed while a row is held.

The player's seek bar, the music seek bar and the photo viewer's stage keep `touch-action: none`: nothing scrolls around them, and the seek bars commit only on release. A new control that drags inside a scrolling page should use this helper and one of the two patterns above, not `touch-action: none`.

### Card grids and the scrollbar

Since `db14d7c`. `CardGrid` (`src/ui/rows/CardGrid.tsx`) sizes its cards from the width of the element that scrolls them, and the cards decide the height of that element's content. With a scrollbar that takes room only while the content overflows, a grid within a few pixels of its scroller's height had no resting state: scrollbar in, cards narrower and shorter, content fits, scrollbar out, cards larger again, on every frame. The gutter is therefore always reserved, by two marks that `src/theme/global.css` styles with `scrollbar-gutter: stable` (an always-present scrollbar where the browser lacks that property):

- `data-grid-scroller` on an element that scrolls a grid: the library grid's own scroller, the generic grid page, the genre and studio tiles, the search page. In a development build `CardGrid` logs an error when the scroll element it is given lacks the mark.
- `data-grid-window`, which `CardGrid` sets itself while the window scrolls it, so that the page reserves the gutter for as long as such a grid shows.

Overlay scrollbars (touch screens, macOS) take no room either way. The grid's width is read through `observeResize`, once per frame and never inside the observer callback.

### `LIB_DEFAULTS.md`

`src/ui/LIB_DEFAULTS.md` records values taken from the `androidx.tv:tv-material` library source rather than from Wholphin: card shape 8dp, focus scales, animation timings, list-item sizes, switch sizes, the elevation formula, and the type scale. The library source was read from its main branch because no tag for the exact release Wholphin uses could be found. Values that could not be confirmed are marked "guess".

---

## 11. Input model

The TV app has one input device (the remote) and one focused element. A browser has keyboard, mouse, pen and touch, sometimes all on the same machine. The input model has one tracker for "which input is in charge" and builds everything else on it.

### 11.1 The input-modality tracker (`src/ui/lib/inputModality.ts`)

`installInputModality()` is installed once at startup and keeps three pieces of state for the whole app.

**1. Who owns the highlight.** The attribute `data-pointer` on `<html>`:

- a real pointer movement by mouse or pen sets it. "Real" means the cursor's position changed; content scrolling under a still cursor does not count, and neither does a single motionless event in the first second after startup (a page appearing under a resting cursor);
- any key press other than a lone modifier removes it;
- touch never sets it, because touch has no hover.

**2. The last input.** `lastInput()` returns `'keyboard'` or `'pointer'` (the last key press versus the last pointer press; Ctrl, Alt and Cmd shortcuts do not count as keyboard navigation). `lastPointerType()` returns `'mouse'`, `'pen'` or `'touch'`, and `lastInputWasTouch()` combines the two. `lastInput()` answers `'pointer'` before any press, so `noInputYet()` tells that default apart: it is true until the first key or pointer press reaches the document (a reload, an address opened). Code that may move the page by itself (a restored "View more" grid, section 11.4) uses it: the page moves when the keyboard acted last or nothing was pressed yet, never after a mouse or touch press. Only standard event fields are used.

**3. The opener.** `interactionOrigin()` is the element the last key or pointer press happened on. Safari does not focus buttons and links on click, so when a click opens a dialog, `document.activeElement` is `<body>`; overlays use the opener to know where focus goes back (section 11.5).

### 11.2 The single-highlight rule

Exactly one element shows the focused look at a time. Every component's CSS follows this pattern:

```css
:where(:root:not([data-pointer])) .x:focus-visible { /* focused look */ }
@media (hover: hover) {
  :where(:root[data-pointer]) .x:hover { /* the same look */ }
}
```

While the keyboard is in charge, the focused element is highlighted and hover is ignored. While the pointer is in charge, the hovered element is highlighted and the focus ring is hidden. Real focus never moves on hover, so Tab and the arrow keys continue from where focus actually is, and screen readers are unaffected. `pointerHighlight()` gives JavaScript the same answer. The end-to-end suite checks the rule with `app.expectSingleHighlight()`.

The rule was applied to the UI kit first and then to the CSS of the music, player, Live TV, settings and Discover features during the merge repair (17 modules; [final-merge-notes.md](final-merge-notes.md) section 7.1). The PIN entry's text-entry ring is deliberately left as it was.

### 11.3 Spatial navigation (`src/app/spatialNav.ts`)

This is the TV remote's D-pad, rebuilt for keyboards. One global `keydown` listener runs in the bubble phase, so a component's own handler runs first and can call `preventDefault()` to take over. The markup contract:

| Attribute | Meaning |
|---|---|
| `data-focusable` | element can receive arrow-key focus (it must also be a real button, link, or have `tabIndex`) |
| `data-focus-group` | candidates inside the nearest group are tried before looking outside it; groups nest |
| `data-focus-trap` | focus never leaves this subtree (dialogs, menus, the shell's page area); the last trap in the page wins |
| `data-focus-default` | where focus starts when nothing is focused |
| `data-focus-vertical-only` | elements inside are reached only by Up or Down from outside, never by Left or Right, and only when nothing else lies in that direction. The shell's floating Back button and the player's Back button use it, so Left from a page's first column goes to the drawer rather than stopping on the button |
| `data-focus-enter` | on a container: where focus lands when an arrow key brings it in from outside (Compose's `focusProperties { onEnter }` / `focusRestorer`). `"restore"`: the element focused there last, else the first (`ItemRow`, `PlayButtons`); `"last"`: the element focused there last, else the geometric pick (the library grid and the genre and studio tiles, whose first rendered card may be far out of view); `"tabs"`: Up and Down land on the selected tab, Left and Right on the tab at the edge entered (`TabRow`); `"current"`: the element with `aria-current`, else the first (`AlphabetPicker`) |
| `data-focus-up` / `-down` / `-left` / `-right` = key | an explicit link: when that arrow would take focus out of the element or container that carries it, focus goes to `[data-focus-key="<key>"]` (or that container's entry element). Supported by the navigator and its tests; no component sets it at the time of writing |

The next element is the candidate in the arrow's direction with the lowest score: distance along the direction, plus twice the sideways gap (`CROSS_AXIS_WEIGHT = 2`), plus a small tie-breaker for center alignment. Candidates inside the current element's innermost `data-focus-group` are tried first, then each enclosing group, then the whole scope. For Left and Right, a candidate that overlaps the current element's row (in its "beam") always beats one that does not, as in Compose's focus search. Elements that cannot take focus (inside `inert` or `aria-hidden`, disabled, zero-sized, or `visibility: hidden`) are skipped. Arrow keys are ignored while typing in a text field, with Shift, Ctrl, Alt or Cmd held, or when an earlier handler prevented the default. Enter and Space activate focusable elements that are not native buttons or links. Pointer movement never moves focus.

Other entry points of `src/app/spatialNav.ts`:

- `focusFirst(scope, scroll)`: the `data-focus-default` element, else the start of the top row. The start is top-left, and top-right where the row runs right to left (Compose's initial focus follows the layout direction). With `scroll` false the page is not scrolled for it (focus given back without a key press, section 11.5).
- `focusInto(container, dir)`: brings focus into a container as an arrow key from outside would (its `data-focus-enter` rule, else its first element). For components that know where a key leads when geometry cannot say: the letter column beside a grid is not level with a card row in every window, so `leaveLetterColumn()` in `src/features/browse/components/letterFocus.ts` hands Left (Right in right-to-left) from the letters to the grid's own entry rule, and `enterLetterColumn()` takes the key from a card in the last column to the current letter (upstream `AlphabetButtons` `onEnter`). The library grid and the genre and studio tiles use both.
- **Leaving a one-line text field.** Because the navigator ignores arrow keys while typing, a field that should hand them on does so itself with `fieldArrowExit()` / `inputArrowExit()` (`src/ui/lib/fieldArrowExit.ts`): Up and Down always leave the field (on the TV a field is read-only until activated, so the D-pad never edits it); Left and Right leave only from the matching edge of the text, mirrored in right-to-left. The search page's header and the Add to playlist dialog's search field use it, then call `moveFocus(dir)`. (It used to exist twice, once under `src/features/detail/common/`.)
- `setBeamEdge(fn)`: the shell's side of a horizontal move. Upstream the nav rail is part of the same focus tree and lies in the beam of every page element, so Left from a song row goes to the rail rather than up to a Play button further left in another row. `AppShell` installs a function that answers yes for the toward-drawer direction while the rail is shown; a move whose best page candidate is outside the beam is then left unhandled, and the shell takes the key.

**Pivot scrolling (`src/ui/lib/bringIntoView.ts`).** After every move the navigator calls `bringIntoView(el)`, which scrolls the focused element the way Compose on TV does (`PivotBringIntoViewSpec`): its leading edge 30 % into the viewport (`PIVOT_PARENT_FRACTION`), as far as the scroll range allows, in every scrollable ancestor from the innermost out, vertically and horizontally (right-to-left aware), smooth unless reduced motion is asked for. An item that would not fit below the pivot is aligned to the trailing edge. The element's own focus scale is left out of the box measured. For the window, the bottom padding the body keeps for the music mini player is taken off the viewport, so an item aligned to the bottom edge does not end under the bar. The walk stops at a fixed layer (drawer, dialog). Markup:

| Attribute | Meaning |
|---|---|
| `data-focus-scroll-anchor` | on a container: focus anywhere inside brings the container, not the focused element, to the pivot (detail page headers: upstream's `header.bringIntoView()`) |
| `data-focus-scroll="nearest"` | on a scroller: it moves only as far as needed to show the focused element. Supported by `bringIntoView` and its tests; no component sets it since the player's chapter and queue rows became panels (`bf31148`, section 14.4) |
| `data-focus-scroll="none"` | on a container pinned to its scroller (a sticky header): focus inside it scrolls nothing outside it (the full-page header of the License and Debug pages, `src/features/settings/FullPage.tsx`) |

The shell's focus restores (`restoreLastFocus` in `src/app/shell/shellFocus.ts`) scroll with the same function; the drawer's own entry focus stays a native "nearest" scroll inside the fixed drawer. Pages with a rule of their own scroll again afterwards (Home: the focused row 50dp under the list top, or, in a window too short for that, just far enough to end at the list's edge).

The shell adds drawer movement on top (`src/app/AppShell.tsx`): Left from the page's start edge enters the drawer, Right goes back to the page, mirrored in right-to-left layouts. The page area is a focus trap (`data-shell-trap`), so the global navigator stops at its edge and the shell's own listener, which runs after it, makes the hop. While the window is scrolled, the floating Back button steps aside for keyboard users and returns on pointer movement or when it takes focus, so pivot scrolling does not put row titles under it. Several pages handle their own arrows before the global navigator: the player (capture phase), the TV guide (program by program), the photo viewer, Home's Down from its last row into the music mini player, the mini player's own Down and Up (section 22), and the series overview, which replaces the navigator's scroll after an arrow key with the TV column's own rule (section 14.2).

### 11.4 Arrival focus

Upstream pages request focus on their first card when they open. On the web that must not fight the user.

- After a keyboard navigation from the drawer, `focusPageWhenReady()` (`src/app/shell/shellFocus.ts`) focuses the page's first element, retrying for 2 seconds because pages load lazily. If the page has nothing focusable (loading, empty, error), focus is parked on `<main>` itself, so it at least leaves the collapsed drawer. The element chosen this way is remembered as the **arrival focus** (a placeholder the page's own first focus may replace) until focus moves off it, a pointer press, or a key other than an arrow or a modifier.
- **The arrival state.** Besides the arrival focus, the shell keeps a small state machine for a page opened from the drawer with the keyboard: `'pending'` from the activation of the drawer entry until the shell's first look at the new page (the page on screen may still be the one being left), then `'landing'` while focus is parked on `<main>` waiting for the page's first element. Focus landing on an element, or a pointer press, ends it; key presses do not, so a key pressed a few milliseconds after Enter cannot decide where the page's first focus goes. While it is pending, the toward-page key is taken and moves nothing (for at most 10 s, `PENDING_KEYS_MAX_MS`, in case the navigation never lands).
- **An arrow key with nothing focused** (`focusFromNowhere()`): focus returns to the page's last focused element if it is still there, else to the page's first element (`focusPageFromNowhere()`). When the page has nothing to focus (loading, empty, error), only the arrow that points at the drawer enters it; any other arrow is taken and moves nothing, so a page that is still loading takes its first focus when its content shows. One more way out exists once such a page has **settled**: Down enters the music mini player when it shows. "Settled" is read from the page itself (`pageSettled()`): it shows some text (an empty-state or error message) and nothing in it carries `aria-busy="true"`, which every loading state of the kit sets; a page that renders nothing at all is taken to be on its way elsewhere. The bar focus given this way is kept as the arrival focus, so the page's own first focus may still replace it. Phones (no rail) leave the key to the navigator.
- **Up out of the mini player with nothing to return to** (`leaveBarToPage()`, called by `AppShell`): the bar's own handler returns to the element it was entered from; when focus is still in the bar after it (the bar was entered from an empty page), focus goes to the page's last or first element, else to the page area (`<main>`) itself, from where the arrow keys work as with nothing focused.
- A page that wants its own first element focused once data shows asks `mayTakeInitialFocus()`. It answers yes when nothing is focused, focus is on `<main>`, focus is still the untouched arrival focus, or an arrival is under way and focus is still in the drawer.
- A press in the page is remembered as the page's last focus even where the browser does not focus on click, so leaving the drawer with the keyboard returns to what was clicked (`focusContentFromDrawer()`).
- Some areas have their own small arrival rules, written as pure functions with unit tests:
  - **The Live TV tabs** (`tabArrivalTarget()` in `src/features/livetv/tabArrival.ts`): once a non-guide tab's content has loaded, focus goes to its first card (a recording folder) or the first row of the DVR schedule, and stays on the selected tab when the schedule is empty. It does so only when `mayTakeInitialFocus()` allows it (a direct load with nothing focused, an arrival from the drawer), or when focus is on the tab row and the tab was chosen with the keyboard. A tab chosen with a pointer keeps focus, as on every other tabbed page. Never on a touch-only device.
  - **The Discover grid's start card** (`src/features/discover/gridArrival.ts`).
  - **The "View more" grid opened by its address, reloaded, or reached by Back** (a POP navigation; `src/features/home/pickVisibleCell.ts`, `restoredFocus.ts`; not on a touch-only device). The restored scroll is kept. If nothing has focus, the page focuses the card at the grid's starting position (`?position=`) when it is fully in view, else the first card fully in view (`pickVisibleCell()`), else, when no card is wholly in view (a short window, or a restored scroll that cuts every row), the first partly visible one (`firstPartlyVisible()`). `watchRestoredFocus()` then watches the card that takes focus without the user acting (this pick, or the remembered card that the shell's restore on Back puts over it) for as long as the shell's restore keeps trying (2.5 s, ended by the first key, press, wheel or touch), and brings it fully into view when the window cuts it. It scrolls only when the keyboard acted last or nothing was pressed yet (`noInputYet()`, section 11.1); after a mouse or touch press the page stays where the user left it.
  - **The License and Debug pages**, where an arrow on the page hands focus to an element in view (`src/features/settings/fullPageFocus.ts`).

### 11.5 Focus restore for overlays

Overlays remember what opened them and give focus back when they close. `captureOpener()` (`src/ui/lib/inputModality.ts`) prefers an explicitly passed element, then a pointer press made within the last 2 seconds, then the focused element. A card's "more" button counts as the card. `focusFromScript()` asks the browser to show the focus ring when the keyboard is in charge (Firefox does not do so by itself for scripted focus). Each overlay is a `data-focus-trap`, so arrow keys stay inside it.

- **The opener chain.** `Dialog` and `DropdownMenu` call `captureOpeners()`, which returns the opener followed by the openers of the overlay that opener sits in (recorded per overlay root with `registerOverlay()`). On close, focus goes to the nearest one still in the document (`liveOpener()`). A menu entry that opens a dialog is removed with its menu, and a dialog that follows another one was opened from an element of the dialog it replaces; focus then goes back to what opened the first of them, as on the TV, where it returns to the focused element of the window underneath. `ContextMenu` is drawn with `DropdownMenu` (at the pointer) or `DialogPopup` (the centred dialog); the player's `PlayerSheet` and the photo viewer's filter and view-options panels use the single `captureOpener()` / `restoreFocus()` pair.
- **The held look.** On the TV the opener keeps its focused look behind the scrim. `holdFocusLook(opener)` marks it with `data-focus-held` while the overlay is open, when the keyboard owns the highlight; the kit's CSS draws that attribute like `:focus-visible`.
- **Presses that close an overlay.** A press outside a dialog or menu that closes it does not move focus again (`keepFocusThroughPress()` cancels that press's focus change); Escape closes the top dialog also when focus is in no overlay; arrow keys with nothing focused belong to the open overlay.
- **When every opener is gone.** `Dialog` and `DropdownMenu` close through `restoreFocusToOpeners(openers)`: focus goes to the nearest opener still in the document; when the overlay had openers and none is left (a card that its grid built anew while the dialog was open), the app's handler decides, after the closing render and only if nothing took focus meanwhile. The handler is installed with `setOpenersGoneHandler()` by the shell's `useFocusRestore()` and runs the recovery below. Without a handler focus stays on `<body>`. The player's `PlayerSheet` and the photo viewer's panels still use the single `restoreFocus()` and do not reach this handler.

**Focus lost without a navigation** (`recoverLostFocus()` in `src/app/shell/useFocusRestore.ts`). The library grid builds its cards anew whenever its column count changes, so a window resize can take away the focused card, or the card a still open dialog was opened from. The shell keeps the element that took focus last and the history entry it did so on. After a `resize` event it watches, frame by frame, for focus that went away with its element (nothing focused, the last focused element no longer in the document, the same history entry); a grid may rebuild inside the resize event itself, so the check cannot be made when the resize begins. It then:

1. puts focus on the same item again, found as on Back (its `data-focus-key`, its link, its place among the page's focusable elements), when the page still shows it;
2. only once the re-layout has settled (1 second after the last `resize` event) falls back to `focusPageFromNowhere()`: the page's last focused element, else its first, as an arrow key with nothing focused would;
3. scrolls the page for it (pivot scrolling, section 11.3) only when the keyboard acted last; otherwise both steps focus without scrolling (`focusPageFromNowhere(false)`, `focusFirst(page, false)`), and after a mouse or touch press the page does not move.

It does nothing while a dialog or menu is open (the keys are the overlay's) or when the user put focus on nothing; a pointer press forgets the last focused element. The watch runs only after `resize` events and ends at the next key or pointer press. An overlay whose openers are all gone calls the same function; during a resize it only looks for the same item and leaves the fallback to the watch.

Focus restore on Back, for whole pages, is a different mechanism (section 6); it shares the saved record with this recovery.

### 11.6 The Menu key

The keyboard Menu key and Shift+F10 open the focused element's context menu in every engine. Chromium and Firefox on Windows turn those keys into a `contextmenu` event themselves; WebKit does not, and Mac keyboards have no Menu key. The tracker therefore dispatches a `contextmenu` event on the focused element itself and drops the native one that may follow the same key press.

### 11.7 Press focus

Safari does not focus a button or link when it is clicked; it blurs the previous element instead. Controls that change size with focus (the expanding toolbar buttons) would then shrink between mouse-down and mouse-up, and the click would miss. The tracker gives the pressed control focus, as Chromium and Firefox do natively.

**Press hold.** The related case in every engine: while the keyboard owns the highlight, a press somewhere else would take the focused look off the keyboard-focused element at mouse-down; an expanding pill then shrinks, its neighbours slide, and the click lands beside the button that was pressed. The tracker marks the focused element `data-focus-held` from the pointer press until its click is dispatched (or the press is cancelled, or a key is pressed). A press that produces no click (a secondary or middle button, a long touch press, the pressed node removed before the release) also ends the hold: in the next task after a mouse or pen release, because a mouse's click is dispatched in the same task as its `pointerup`; 400 ms after a touch release (`TAP_CLICK_MS`), because a tap's click may follow the lifted finger by about 350 ms where the browser still waits for a second tap; and at once on `contextmenu`, because the browser's own menu can keep the release.

### 11.8 Context menus: the TV long press

Upstream opens an item menu on long press of the remote's center button. On the web the same menu opens by:

- right-click: the menu opens at the pointer;
- the Menu key or Shift+F10: the menu opens as the centered TV-style dialog;
- a touch long-press: the centered dialog;
- the visible "more" button on cards (always shown on touch screens; shown on mouse hover).

`contextMenuPoint(e)` (`src/ui/lib/contextMenu.ts`) decides between pointer position and centered dialog from the last input.

**Touch long-press** is timed by the app (`useLongPress` in `src/ui/lib/useLongPress.ts`), because iOS Safari sends no `contextmenu` event for touch. A touch held for 500 ms without moving more than 10 CSS px and without any scroll fires the menu. The click that the release produces is swallowed wherever it lands, since it would otherwise activate an item of the menu that just opened. On Android, where the browser also sends its own `contextmenu`, the second event of the same gesture is ignored. Mouse and pen presses are ignored by the hook; they have right-click.

### 11.9 Hover intent

Where the hovered item drives something expensive (Home's header and backdrop, a library grid's details pane, the episode strip), the mouse must rest on a card for 250 ms before it takes over (`useHoverIntent` in `src/features/common/hoverIntent.ts`). Sweeping the mouse across a row therefore does not flicker the header. Keyboard focus and touch taps stay immediate. A hover counts only while the pointer owns the highlight, because browsers also send hover events when content scrolls under a resting cursor. The nav drawer has its own, shorter timers (150 ms to open on hover, 80 ms to close).

---

## 12. Internationalization and right-to-left

### Pipeline

`tools/gen-strings.ts` (`npm run gen:strings`) converts upstream's Android `strings.xml` files (from the git-ignored `reference/` checkout) into i18next JSON:

- Output: `src/i18n/locales/<tag>.json` for English and the 41 upstream translations (42 files), plus `src/i18n/locales/index.ts` with the locale list and lazy loaders.
- Keys are the Android string names. Positional arguments `%1$s`, `%2$d` become `{{p1}}`, `{{p2}}`. In plurals the quantity becomes `{{count}}` with i18next suffixes (`_one`, `_other` …), emitting only the plural categories each language has.
- Android escapes, quoting, CDATA and entities are decoded; string arrays become JSON arrays.
- Android folder names map to BCP-47 tags (`values-iw` becomes `he`, `values-b+sr+Latn` becomes `sr-Latn`).

The output is committed, so the app builds without the upstream checkout.

Web-only strings go in `src/i18n/extra/en.json` with a `web_` prefix (186 keys on `main` at `509db33`; 183 at `7ad52ba`). They exist only in English; a user of any other language sees those strings in English ([DECISIONS.md](DECISIONS.md) Q-23). Components never contain literal English: `const { t } = useTranslation(); t('android_string_name')`. Pure helpers take a plain translate function from `useTranslate()` (`src/features/common/useTranslate.ts`).

### Runtime (`src/i18n/index.ts`)

- English is bundled together with the web-only strings. Other locales load on demand when selected.
- `setLanguage(tag)` resolves the tag (exact match, then language only, legacy codes such as `iw` handled), else follows the browser's languages, else English.
- **Right-to-left:** `isRtl()` covers ar, he, fa, ur and yi. `<html dir>` is set accordingly. CSS uses logical properties (`margin-inline-start`, `inset-inline-end`) instead of left/right, so the layout mirrors on its own. The shell swaps arrow-key directions in RTL. **Mirrored details** that logical properties cannot express (a flipped arrow icon, a transform, a slide direction) are written with the document's `dir` attribute, as a selector of its own: `:global([dir='rtl']) .icon { … }`, never with the `:dir(rtl)` pseudo-class. Chrome and Edge 119 do not know `:dir()`, and a browser drops a whole selector list that contains an unknown pseudo-class, so a list such as `[dir='rtl'] .thumb, .thumb:dir(rtl)` would lose its working half too. `tools/css-engine-baseline.test.ts` fails on any `:dir()` in `src` (section 16).
- **English inside a right-to-left language.** A post-processor (`ltrFallback`) wraps every string that the chosen right-to-left locale has not translated (the `web_` strings, and upstream strings a locale lacks) in a left-to-right isolate (U+2066 … U+2069), so the sentence keeps its order ("5 of 15" does not become "of 15 5"). `withCount(label, n)` builds upstream's counted titles (`"Songs (6)"`) and puts the count inside such an isolate, so an untranslated title does not read "(6) Songs". It is the one helper for counted titles; the album page, the series page, the Seerr season list and Home customization use it.
- **Values in a right-to-left line.** A value made of digits, signs and Latin units (".25", "-1.5s", "+50ms", "100 Mbps") has no strong direction of its own at its edges, so a right-to-left line reorders it: ".25" is drawn "25.", "100 Mbps" is drawn "Mbps 100". Translated text must keep the interface's direction, so the fix is per slot, by what the slot can hold:

  | The slot holds | Use | Examples in the code |
  |---|---|---|
  | Either a translated text or a value, depending on the row | `<bdi>` around the text: the slot takes its direction from its own content, and a content with no strong character falls back to left to right | the headline and supporting line of every row of the player's sheets (`Line` in `src/features/playback/ui/PlaybackDialogs.tsx`), a settings slider's summary (`src/features/settings/SliderPreference.tsx`), names and authors on the License page |
  | Always a value or other left-to-right text | `dir="ltr"` on its element | the subtitle delay value and its six step buttons (`SubtitleDelayDialog.tsx`), the whole debug overlay (`DebugOverlay.tsx`, English diagnostics), grid position counters, the PIN pad, addresses and paths |
  | A value inside a plain string, with no element of its own | `ltrValue(value)` from `src/features/playback/ui/text.ts`, which wraps it in the isolate characters U+2066 and U+2069 (written as escapes in the source) | the toasts of the delay and speed shortcuts in `PlayerView.tsx` |

  In a left-to-right interface all three do nothing visible. The time codes of the player's controls were left to the locale's direction at first, as upstream does (Q-35); since `c2316a4` they are clocks ("52:53", "-1:07:20") in elements with `dir="ltr"`, so the minus stays in front in Hebrew too, and the whole button row of the player is laid out left to right in every language (section 14.4; [DECISIONS.md](DECISIONS.md) O-36, O-37). `ltrValue` stands beside two older isolate helpers (the fallback wrapper above, and one in `src/features/discover/seerrText.ts`); they were not merged into one.

---

## 13. App shell, backdrop, setup flow and Home

### App shell (`src/app/AppShell.tsx`, `src/app/shell/`)

- **Nav drawer** (`NavDrawer.tsx`, `drawerItems.ts`, `useDrawerItems.ts`): a port of `NavDrawer.kt` and `NavDrawerService`. It holds the profile entry, Now Playing (while a music queue exists), Search, Home, the pinned entries (libraries, recording folders, Favorites, and Discover while Seerr is linked), a "More" section for the entries that are not pinned, and Settings. On wide windows it is a 64dp rail that expands on hover, on keyboard focus or on tap. Under 600 CSS px it becomes an overlay sheet with a top bar (menu button, Back, clock).
- **The open drawer lies over the page** (`bb76c45`; an owner request, where the TV moves the page aside by 160dp). The page area and the music mini player no longer move when the rail opens. The open rail has a panel of its own, a pseudo-element of the drawer in `NavDrawer.module.css`: the surface colour, solid under the entries and fading out over 64dp past the end edge, so the page under it gets no hard border. The phone's sheet keeps its own background. The backdrop is not darkened while the drawer is open (`732e409`; upstream draws black at 75 % over the image), so `Backdrop` no longer takes the drawer's state.
- **The drawer and Settings.** While the rail is open the drawer fetches the Settings page's code chunk, so a click on the Settings entry opens it at once. That entry does not close the drawer as the other entries do: the drawer stays open until the shell unmounts, because the Settings panel opens out of the open drawer (below, "Settings over the page").
- **Pins** are stored per user in one store (`navPins.ts`). The settings row "Customize Navigation Drawer Items" opens the shell's `NavDrawerPinsDialog`.
- **Feature flags** (`shellFlags.ts`): other features switch drawer entries on and off without the shell knowing them. `setDiscoverEnabled()` is driven by the Seerr link state, `setNowPlaying()` by the music queue. `shellMounted` counts mounted shells, so UI that belongs beside the drawer (the mini player) hides on full-screen routes.
- **Layout variables.** The drawer publishes its width as `--shell-rail-width` and `--shell-rail-open-width`, and the curve and duration of its opening as `--shell-spring` and `--shell-spring-ms` (`NavDrawer.module.css`). The mini player positions itself with the rail width; the Settings panel's opening uses the open width and the spring.
- **Clock** (`Clock.tsx`) at the top end, and layout reservations so pages can leave room for it and for the Back button (`useShellLayout.ts`). The Back button's rules are in section 6.
- **Page fade** between pages (`usePageFade(ref, enabled)` in `useShellLayout.ts`, upstream's 700 ms fade), focus restore on Back, and the history mirror (section 6). Two cases skip the fade: a layout that passes `enabled` false (the Settings routes, which just appear), and the next arrival after `skipNextPageFade()`, which `AppShell` calls when the page comes back from under the Settings panel.

### Backdrop contract

Pages never draw the big background image themselves. They **request** one through `src/app/backdrop.ts`:

| Function | Use |
|---|---|
| `submitBackdrop(item)` | when an item gains focus or hover, or a detail page opens |
| `submitBackdropUrl(key, url)` | for things that are not Jellyfin items (Seerr results) |
| `clearBackdrop()` | when nothing should show |

The signatures are a contract shared by all features. The shell does the rest in `backdropService.ts` (port of `BackdropService.kt`). A request with a new image blanks the image at once, waits a fixed 500 ms, extracts colors (dynamic style only), and publishes only if no newer request has replaced it. `Backdrop.tsx` then draws it: the image with masks and the top scrim, fading in, with four corner color gradients (upstream's dim layer for the open drawer is not drawn since `732e409`). While a request is waiting, the renderer reports `aria-busy`, so the screenshot crawler does not photograph the blank interval. A page can show its own result instead of the service's with `usePageBackdrop()`; Now Playing does (below).

**Colour extraction** (`src/app/shell/extractColors.ts`, `palette.ts`, `backdropColors.ts`). Upstream reads the colours with Android's Palette library; the web has a port of it (`palette.ts`) and of upstream's choice of the three corner colours (`backdropColors.ts`). Two details decide whether the web picks the TV's colours:

- **The image the colours come from.** The image drawn on screen is a window-sized rendition; the colours are taken from the backdrop as stored (`backdropColorSourceFor()`: upstream's exact request, quality and tag, no size), because the palette of a resized JPEG differs from the original's.
- **The downscale.** Before quantising, Palette shrinks the image with `Bitmap.createScaledBitmap(bitmap, w, h, false)`, which goes through Skia's nearest-neighbour sampling in fixed-point arithmetic on a float inverse scale. Plain `floor((d + 0.5) * src / dst)` picks a neighbouring source pixel wherever a sample lands exactly on a pixel edge, which changed the colours of some items. `nearestColumns()`, `nearestRows()` and `scaleNearest()` reproduce Skia's arithmetic; the image is drawn 1:1 on a canvas and downscaled in JavaScript, because canvas scaling samples differently per engine. `extractColors.test.ts` checks it against `extractColors.fixtures.ts`, real pixels of two backdrops of the throwaway test server.

Results are kept in an LRU cache of 50 URLs, as upstream; a failed load is not cached. Recorded result (commit `b08f0bb` and the colour job's report and independent verifier): with the same decoded pixels, this arithmetic gives the TV's colours for 11 of 11 backdrops that show colours in the reference pictures (plain floor: 6 of 11), within 1/255 at the points sampled. Recorded limits, not reproduced: Android's image loader caps decoded images at 4096 px and scales larger ones while decoding. A device whose Skia build samples differently, or a browser whose JPEG decoder differs from Android's on a few pixels (possibly Safari on Apple hardware, not testable here), could still give other colours.

**Now Playing** (`src/features/music/nowplaying/useNowPlayingBackdrop.ts`, a port of `NowPlayingViewModel.listenForBackdrop`) cycles the song's and its artists' backdrops every 2 minutes through `usePageBackdrop()`; each image is drawn as a window-sized rendition and its colours are extracted from the stored image, by the same rule.

### Settings over the page: the page copy (`src/app/shell/pageSnapshot.ts`)

Since `dc3c877` Settings opens as a panel, and the page it was opened from stays visible beside it ([DECISIONS.md](DECISIONS.md) O-40, T-61). Upstream draws Settings as a full-screen destination on a flat background. The panel itself is the Settings feature's layout (section 14.5); what is behind it belongs to the shell and is described here.

**Why a copy.** The shell (`AppShell`) and Settings (`FullScreenLayout`) are different route layouts, so the shell page unmounts when Settings opens. Keeping the real page mounted instead would leave its key handlers, its focus logic and its queries running under Settings. What stays is a lifeless copy of the page's DOM: no React, no listeners, nothing that can take focus or answer a lookup. There is one copy at a time, held in a module variable.

**Taking the copy.** `AppShell` has a layout effect keyed by the app path (path and query). Its cleanup runs while the page is still in the document and the address is already the next page's; when that address is a Settings route (`isPanelPath()`), it calls `capturePageSnapshot(shell, path, owner)`. The function clones the shell element and walks the clone beside the original:

- media and embedded elements (`audio`, `video`, `iframe`, `object`, `embed`, `script`) are removed, so a copy can never play anything;
- `id` (kept on SVG elements, whose paint references need theirs), `for`, `autofocus` and `tabindex` are removed;
- every `data-*` attribute that no stylesheet selects on is removed. Those are the hooks code finds with `querySelector` (focus traps, focusable marks, page roots); the ones a stylesheet uses carry the look and stay. The set is read from the document's style sheets and cached until their number changes;
- the drawer in the copy rests closed (its `data-open` is removed and its list is not scrolled), although it was open when Settings was chosen from it;
- images are set to load eagerly and decode synchronously, form controls get their current values, and a canvas is redrawn from its original;
- the scroll offsets of scrolled elements, the window's scroll offset and the shell's own width are recorded. The width is the shell's, not the window's: the window's includes the room of its scrollbar, which made the copy 10 px too wide (found by a reviewer's test, fixed in `398f168`);
- the owner is recorded as the user key (`pageOwner()`: server id and user id), not as the session object, which is replaced whenever the user's own settings change;
- `keepBackdrop()` is called (below).

**Showing it.** On a Settings route `FullScreenLayout` renders `PageUnderlay` (`src/app/shell/PageUnderlay.tsx`): a fixed, window-sized box marked `inert` and `aria-hidden`, which takes no pointer events. `mountPageSnapshot(host, owner)` puts the copy into it only when the copy belongs to the current user, sets the box to the recorded width, restores the inner scroll offsets and scrolls the box to the window's old offset. The box's stylesheet stops every animation and transition inside the copy, and paints the background colour: the ground under the copy, and the whole background when there is no copy (Settings opened by its address or reloaded). Nothing is drawn over the copy; a light tint lay over it at first and was removed with the drawer's dim layer (`732e409`).

**Returning.** The same layout effect of `AppShell` calls `returnFromPanel(path, owner)` when the shell is back:

- no copy: nothing happens;
- the path or the user is not the copy's: the copy is discarded (`forgetBackdrop()`);
- back on the copied page: `resumeBackdrop()` is called, the copy is placed in a new fixed box on `<body>` (`inert`, `z-index: 30`) while the real page mounts beneath it, held for 150 ms, faded out over 200 ms and removed. The function returns true and `AppShell` calls `skipNextPageFade()`, so the page does not blink out and in. With `prefers-reduced-motion: reduce` there is no cover: the copy is removed and the page simply appears.

The signed-in part of the route tree discards the copy when it unmounts (section 6), so a copy is never shown to another session.

**The backdrop across Settings** (`src/app/shell/backdropService.ts`, `d1be200`). `FullScreenLayout` clears the published backdrop on entry, as for every full-screen page, while the copy still shows the page's backdrop. Without more, the returning page asked for its backdrop again: blank, a 500 ms wait, an 800 ms fade. The service therefore has three small functions that `pageSnapshot.ts` calls: `keepBackdrop()` remembers the published result when the copy is taken; `resumeBackdrop()` publishes it again on the return, image and colours, with no wait; `forgetBackdrop()` drops it when the copy is discarded. For 2 seconds after a resume (`RESUME_MS`) a request for the same image, from a page that clears and submits when it mounts, is answered from the remembered result too, and `isResumedBackdrop(url)` tells `Backdrop.tsx` to show that image without its fade.

**Tests and open points.** `src/app/shell/pageSnapshot.test.ts` covers the copy's rules and the backdrop hand-over; the browser tests are in `e2e/specs/settings.spec.ts`. An independent review on 2026-11-23 (two reviewers) left these, all minor: the copy does not follow a window resize (only its fixed width is released), a change of interface scale or a change of language made inside Settings; the music mini player is not in the copy; pictures that had not loaded when the copy was taken are empty in it.

### Setup flow (`src/features/setup/`)

- **Server list** (`ServerListPage.tsx`): server circles with live 6-second probes and the upstream version warning, Add Server dialog with upstream's error texts, and a context menu with Switch / Delete.
- **Server version** (`src/lib/serverVersion.ts`, shared with the settings screens): parses the server's version and classifies it as `SUPPORTED`, `NOT_SUPPORTED` (below the SDK's minimum) or `UNKNOWN` (no version, on the user picker), with upstream's notice text. Upstream's fourth tier, "will not be supported soon" (`NOT_SUPPORTED_IN_FUTURE`), announces a future requirement of the Android app's SDK; the web never classifies a server that way, and the tier has been removed from the type and the server list. The kit's `ServerCircleCard` still has its `unsupported_future` look, which only the dev gallery shows.
- **User list** (`UserListPage.tsx` → `SwitchUserScreen.tsx`): saved users plus the server's public users, avatars, Add User, Switch servers (hidden in preset mode), and the "expired" toast.
- **A user without a password** (`27ab920`; [DECISIONS.md](DECISIONS.md) O-41). Each circle on the user list carries `noPassword`: true when the server's public user list says so (`hasNoPassword()` in `setupHelpers.ts`: `HasPassword` is exactly `false` in `GET /Users/Public`; a server that does not say is treated as asking for one). A click on such a circle that would otherwise open the login dialog calls `loginWithPassword()` with the empty password and goes on as after any sign-in. When the server refuses with "invalid credentials" (a password was set since the list loaded) the dialog opens instead; any other error is shown first and the dialog opens too. Upstream always opens the dialog. The rule holds for the circles on this screen only: a name typed under Add User goes through the dialog as before. A saved user who needs no login (`needsLogin()` false) is switched to as before, with the PIN pad first where a PIN is set (section 5).
- **Login** (`/setup/login`): the same component as the user list with the login dialog on top, so the list stays mounted. It starts in Quick Connect mode when the server has it enabled; otherwise, or with `mode=password`, it shows the password form. A login opened from the list replaces the list's history entry with Home, so Back from Home does not return to the user list.
- **PIN** (`PinEntry*.tsx`, `SetPinFlow.tsx`, `usePinInput.ts`): upstream's arrows-and-digits PIN plus Backspace and an on-screen keypad.
- `?next=` deep links survive every step (`safeNext()` in `setupHelpers.ts`).

### Home (`src/features/home/`)

- All 15 upstream home row types, with upstream's settings format, presets and default rows (respecting drawer pins). The row list can come from five sources, as upstream: local, the user's server profile, the optional Wholphin server plugin, the Jellyfin web client's home sections, or defaults (`model/homeSettings.ts`). The plugin source was never tested: neither test server has the plugin (Q-20).
- One TanStack query per row, at most 4 loading at a time (upstream's `Semaphore(4)`). Rows render as they arrive; a 404 hides a row, other errors show an error row.
- The header above the rows follows keyboard focus immediately, mouse hover after the hover-intent delay, and taps on touch, and it submits the backdrop (`useHomeFocus.ts`). After an arrow key the list settles on the focused card 450 ms later; a wheel, touch or pointer press on the rows in that time cancels the settle, so it does not undo the user's scroll. The same hook serves the Recommended tabs of the library pages and of the music library.
- **The header's overview** (`HomeHeader.tsx`, `HomeHeader.module.css`; `8d305b7`, [DECISIONS.md](DECISIONS.md) O-42). Upstream gives the overview a fixed box: 400dp wide and 3 lines high, 2 under an episode name. Here the box takes the height that is left in the header's 180dp and is a third of the window wide, from the TV's 400dp up to 680dp. How many lines show is counted, not fixed: a layout effect divides the box's height by the text's computed line height and writes the result into the CSS variable `--lines` that clamps the text, and a `ResizeObserver` on the box repeats the count when its size changes (4 lines for a film, 3 under an episode name, as the commit records). The header's height and the rows below do not change.
- On Back, the focused card, the row scroll and the page scroll return. When a row refresh removes the focused card, Home refocuses the remembered row and column.
- `MoreHomeRowPage` is the paged "view more" grid. After a reload or Back it keeps the restored scroll and focuses a card in view, which `restoredFocus.ts` brings fully into view when the keyboard acted last (section 11.4).
- **Home customization** (`HomeSettingsPage.tsx`, `settings/`): the row list editor with an inner back stack, a live preview and the Save dialog (save locally, save to the server, or discard). Rows are reordered with the up and down buttons or by a drag handle; with a finger the handle scrolls the list and picks a row up after a rest (section 10, "Touch on controls that drag").

---

## 14. Feature areas

Each subsection names the entry files and the contracts other code relies on. Differences from the TV app are listed in [DEVIATIONS.md](DEVIATIONS.md), not here.

### 14.1 Browse (`src/features/browse/`)

- **`LibraryGrid`** (`components/LibraryGrid.tsx`) is the shared library grid: title, sort chip, Filter, View options, random-item button, Play and Shuffle, the letter column, the item counter, and grid or list layout with a details pane (`ListDetails.tsx`). It takes a `GridSource` (a query key, a page fetcher, optional letter lookup), so any feature can show its own request in it. Movie and TV libraries, the music library's Albums, Artists and Songs tabs (`src/features/music/library/musicSources.ts` supplies the Artists pager), the music genre page, box sets, playlists, plain folders, Favorites, the filtered genre and studio pages, the playlist detail page and the Live TV recording folders all use it.
- **Grid focus.** The grid and its header form one `data-focus-group`, so Up from the first row reaches the grid's own buttons before the tab row; the card area is `data-focus-enter="last"`, so an arrow key from outside returns to the card focused last. The letter column is entered at the current letter and left back to that card (`components/letterFocus.ts`, section 11.3). The grid's first card takes focus once loaded when `mayTakeInitialFocus()` allows it. After the header collapses, the focused card is re-pivoted only when a focus move scrolled it, never after a wheel, touch or scrollbar scroll. The genre and studio tiles (`TileGrid.tsx`) follow the same focus rules. A letter jump focuses the first item at or after the letter, which is what upstream's `jumpToLetter` means to do (upstream's grid hands focus back to the card it came from, a bug not copied). The grid builds its cards anew whenever its column count changes (twice per window shrink), so a focused card is replaced in a resize; the shell's focus recovery puts focus back on the same item (section 11.5).
- **Paging** (`data/usePagedItems.ts`): page 0 is fetched with the total count, the grid reports all slots at once, and later pages load when their slots are rendered. Each page is its own TanStack query, so item patches reach it and Back finds it in the cache.
- **Grid state** (`data/useGridState.ts`, `model/displayInfo.ts`): sort, filter and view options per library, saved locally per user.
- **Tabs** (`components/TabbedPage.tsx`, `data/useTabState.ts`): the selected tab lives in the URL (`?tab=`), and with "remember selected tab" on it is also stored per library and user. Live TV and the music library use the same store.
- **Recommended tab** (`components/RecommendedTab.tsx`, `data/recommended.ts`) and **genre and studio tiles** (`components/TileGrid.tsx`).
- **"Play all"** (`data/librarySource.ts`): navigates to `nav.playList(...)` with the grid's sort and filter. The filter travels as the upstream `GetItemsFilter` JSON; the player's `parseQueueFilter` (`src/features/playback/engine/queue.ts`) accepts that form and the REST parameter form.
- **`ItemGridPage`** is the generic "view more" grid driven by navigation state (`data/gridRequestKinds.ts`).

### 14.2 Detail (`src/features/detail/`)

`MediaItemPage.tsx` dispatches by item type (section 6). The screens are `movie/MovieDetails.tsx`, `episode/EpisodeDetails.tsx`, `series/SeriesDetails.tsx`, `series/SeriesOverview.tsx` (season tabs and the episode strip; the URL follows the selection with `history.replaceState`), `collection/BoxSetDetails.tsx`, `playlist/PlaylistDetails.tsx` and `person/PersonPage.tsx`. One playlist page serves audio and video playlists; on an audio playlist, Play, Shuffle and a row click go to the music queue through the `playMusic` handler.

**The series overview's scroll** (`series/overviewScroll.ts`, applied in `SeriesOverview.tsx`). Upstream scrolls a column that is padded 16dp at the top and bottom, under a delayed nested scroll that takes a third (`OVERVIEW_Y_DELAY`, 0.33) of every scroll step (`SeriesOverviewContent.kt:147-155`, `DelayedNestedScrollConnection.kt`). After an arrow key moves focus below the top group, the page replaces the global navigator's scroll with `overviewScrollTop()`: the distance to the pivot of that padded viewport, cut to `1 - 0.33^frames` of it. With `prefers-reduced-motion: reduce`, which stands for Android's animator scale 0 and matches the reference pictures, two frames move the column (89 % of the way); with motion, the whole way, smoothly. Down from the episode strip onto the buttons with reduced motion moves one frame (67 %), a rule fitted to the reference picture. Focus inside the top group keeps the header rule (`data-focus-scroll-anchor`). Web addition: after a partial move the focused element is pulled whole into the viewport. Only arrow-key moves are handled this way.

**The people rows of the series overview** (`usePeopleInEpisode()` in `series/seriesQueries.ts`; `ba1526e`). A port of upstream `lookupPeopleInEpisode`: the selected episode's people come from `GET /Items/{id}` (the shared item cache), and the rows show them only after the episode has stayed selected for 250 ms. Upstream empties the rows on every change of episode. Here the hook holds the people it returned last until the newly selected episode's people are ready, so the Cast & Crew and Guest stars rows stay in the page while the selection moves (a mouse moving along the episode strip selects episode after episode), actors that both episodes share keep their cards, and only the others change. Without an episode (a season still loading), or when the lookup fails, the hook returns an empty list.

Shared pieces are in `detail/common/` and described in its `README.md`: the header, play buttons, people, chapters and extras rows, the stream choosers (`useChosenStreams`, `StreamChooserDialog`), the app-wide item dialogs (`ItemDialogsHost`, `itemDialogs.ts`), the playlists API helpers, theme music (`themeMusic.ts`, the app's only theme-song player; it does not start while the music queue is active), and "Send media info log" (`mediaReport.ts`).

### 14.3 Search (`src/features/search/`)

`SearchPage.tsx` debounces typing by 750 ms (the header's field hands arrow keys on with the kit's `inputArrowExit()`, section 11.3), keeps the query in `?q=` and the Discover tab in `?tab=discover` (the Library tab has no parameter), and shows results either as one row per item type or as one combined grid, as upstream. `useSearchResults.ts` issues the requests (50 results each, no paging), `searchRelevance.ts` orders them, and `voiceInput.ts` wraps the browser's Web Speech API for voice search where the browser offers it.

`searchExtensions.ts` holds two extension points for code outside this folder:

- `registerSearchDiscoverProvider(...)`: the Seerr feature registers a provider that adds "Discover" results (section 14.6).
- `registerSearchProgramHandler(...)`: meant for Live TV, to open the program dialog from a program card. **Nothing registers it.** A program card in search therefore plays its channel, where upstream opens the dialog.

### 14.4 Playback (`src/features/playback/`)

Playback has two layers: a headless **engine** that owns the media element and talks to Jellyfin, and a **player UI** that reads the engine's state and sends it commands. The engine's contract (state fields, commands, start sequence) is documented in `src/features/playback/engine/README.md`; the summary below is for orientation. Results per test file are in `engine/PLAYBACK_MATRIX.md`.

**What runs where**

| Work | Where it runs |
|---|---|
| deciding what the browser can decode; building the device profile | the browser (`capabilities.ts`, `probeMedia.ts`, `deviceProfile.ts`) |
| deciding direct play, remux or transcode for one file | the Jellyfin server, in its answer to `POST /Items/{id}/PlaybackInfo` |
| decoding a file the browser can play (direct play) | the browser's `<video>` element |
| remuxing or transcoding | the Jellyfin server, delivered as HLS |
| fetching and feeding HLS segments | hls.js in the browser (in a worker and Media Source Extensions), or the browser's own HLS on Apple WebKit |
| text subtitles | the browser: fetched from the server and drawn by the app as HTML |
| ASS/SSA subtitles | the browser: libass compiled to WebAssembly, in jassub's worker, drawn on a canvas over the video |
| PGS (Blu-ray picture) subtitles | the browser: the server hands out the track as a file, and libpgs draws it on a canvas over the video, in its own worker. With the preference "Direct play PGS" off, the server burns them in |
| DVD (VobSub) and DVB subtitles | the server burns them into the picture, which forces a video transcode |
| progress reports | the browser sends them to Jellyfin |
| the Wholphin Web server | nothing: no media passes through it |

**The engine (`engine/`)**

A port of upstream `PlaybackViewModel.kt` and its services. Only one playback exists at a time: `getPlaybackEngine()` is page-wide, owns a single `<video>` element (mounted into the page by `PlayerSurface.tsx`), and publishes its state in a Zustand store (`usePlaybackStore`). `usePlaybackSession(dest, onExit)` starts it for a route and stops it on unmount.

| Part | File | What it does |
|---|---|---|
| Capability detection | `capabilities.ts`, `probeMedia.ts` | asks the browser what it can decode: `canPlayType` (progressive files), `MediaSource.isTypeSupported` (what hls.js can feed), `navigator.mediaCapabilities.decodingInfo` (size limits, HDR); and, where those answers are not reliable, really loads a clip of a fraction of a second (see "The capability probe" below). The result is cached for the page's lifetime |
| Device profile | `deviceProfile.ts` | turns those answers plus the playback preferences (maximum resolution and bitrate, AC3, downmix, ASS mode, "Direct play PGS", HDR overrides) into the Jellyfin `DeviceProfile` (see "Device profile decisions" below) |
| Route to destination | `destination.ts` | `/play/...` query parameters to a `PlaybackDestination` |
| Queue | `queue.ts` | a playable item plays itself and gets its context appended (an episode continues the season; a movie gets its parts); a container (series, season, playlist, box set, folder) becomes a queue; cinema-mode intros are prepended when starting at 0. For a playable item the contextual list is cut at the item (`queueForPlayedItem`): where the server's list holds it under its own id the queue starts there, where the list holds the same episode under another id (`isSameMedia`: another version of it) that entry stands for it, and any other copy is dropped, so the entry after the item is never the item again. Upstream appends the whole list after the item |
| Stream choice | `streamChoice.ts`, `trackSelection.ts` | version, audio and subtitle choice from the remembered choices and the language preferences (ports of `StreamChoiceService` and `TrackSelectionUtils`) |
| PlaybackInfo | `playbackInfo.ts` | the request body (negative track sentinels are sent as null) and the reading of the answer into a URL and a play method |
| Backends | `backends.ts` | `native`: a progressive file in `<video src>`; `hlsjs`: hls.js over Media Source Extensions; `native-hls`: the browser's own HLS on Apple WebKit |
| Fallback ladder | `fallback.ts`, `watchdog.ts` | direct play, then remux (stream copy), then full transcode, then a clear error. The steps are request flags that only go down, so the ladder cannot loop. Triggers: a `<video>` error, a fatal hls.js error, no `canplay` within 20 s (direct) or 45 s (HLS), a frame watchdog (time advancing without decoded frames), and a failed track switch |
| Subtitles | `subtitles/loader.ts`, `subtitles/cues.ts`, `subtitles/style.ts`, `subtitles/direction.ts`, `subtitles/assDirection.ts`, `SubtitleLayer.tsx`, `AssSubtitles.tsx`, `PgsSubtitles.tsx` | see below |
| Reporting | `reporting.ts` | Start on the first frame; Progress every 5 s and on pause, seek and track change; Stopped on every exit, including closing the tab (a keepalive request). Transcodes also get `DELETE /Videos/ActiveEncodings`; live streams are closed |
| Segments | `segments.ts` | intro, outro, recap, preview and commercial segments, checked every 500 ms: auto-skip, or the floating Skip button, by preference |
| Next up | `nextUp.ts` | what happens when an item ends or its credits start: the Next Up panel, the countdown, pass-out protection. The panel never offers the media that is playing: `showNextUp` in `engine.ts` steps over every queue entry for which `isSameMedia` holds |
| Trickplay | `trickplay.ts` | which tile of which sprite sheet shows a given position; the UI draws it with `background-position` |
| Platform | `platform.ts` | Media Session (lock-screen and media-key controls) and the screen wake lock |
| Other | `seekAcceleration.ts`, `trailers.ts`, `constants.ts`, `types.ts` | hold-to-seek acceleration table, local and remote trailers, shared constants and public types |

**The capability probe** (`bf31148`; [DECISIONS.md](DECISIONS.md) O-34, T-59). A browser's answer to "would you play this type" is wrong often enough to matter in two places, so `probeMedia.ts` asks "did you just play it" instead. It holds three clips as base64 text, about 7 kB of media together: a Matroska file of 1533 bytes (H.264 32x32 and AAC, half a second) and two MP4 files with a quarter of a second of silence, one in AC-3 and one in E-AC-3. `probePlayback(clip)` loads one from a `blob:` address into a detached, muted media element and resolves to `ok` (the first frame was decoded), `error` (the element reported an error, or a video clip gave no picture size) or `timeout` (no answer within 2 seconds: a browser that loads nothing before a user gesture). Nothing is played. `capabilities.ts` turns that into decisions with small pure functions, which is where the unit tests sit:

- `matroskaSupported(probe, typeAnswers)`: the clip decides. Without an answer, `canPlayType` is believed only from an engine that turns down a made-up codec in Matroska (one that accepts everything is not a witness).
- `matroskaCodecSupported(...)`: a codec inside Matroska needs the element to play it from a file at all, and, where the engine answers Matroska questions per codec, its yes for this one. The result is `Capabilities.matroska`, one flag per video and audio codec.
- `confirmDecode(claimed, probe)`: AC-3 and E-AC-3 are asked by type first; only when the type check says yes is the clip loaded, and only an explicit `error` overrules the claim.
- `browserToneMapsHdr(userAgentData)` and `hdrPlayable(decodes, display, toneMapsToSdr)`: HDR10 and HLG count as playable when the decoder takes them and either the display is HDR or the browser converts HDR for an ordinary display itself. No API answers the second question, so this is the one check by browser engine in the code: the "Chromium" brand of the browser's client hints, and not mobile; the same rule as Jellyfin's own web client.

`Capabilities.audioTrackSelection` records whether the element has `video.audioTracks`. The probes run once, together with the other checks. The Debug page shows their results as "Measured Playback Support" (section 14.5).

**Device profile decisions.** The first three below follow Jellyfin's own web client (the header comment of `deviceProfile.ts` names the file there):

- **Containers for direct play:** MP4 and WebM as the type checks say, and Matroska (`mkv`) when the probe clip played. The Matroska entry lists only the codecs flagged in `Capabilities.matroska`, because Chromium plays a Matroska file whose audio it cannot decode as a silent film, without an error; an unlisted audio codec therefore goes through the server.
- **The second audio track:** when the element cannot switch audio tracks (every browser but Safari), the profile's VideoAudio codec profile carries the condition `IsSecondaryAudio = false`. The server then answers a request for any track but the file's first with a remux (video and that audio track copied) and a request for the first with direct play. `engine.ts` takes the first audio stream of a file as the one a directly played file plays (`defaultAudioIndex`; measured in Edge, Chrome and Firefox on a file whose second track carries the default flag), and an audio switch is no longer a step of the fallback ladder.
- **Subtitles:** text formats and ASS are `External`; PGS is `External` too while the preference "Direct play PGS" is on. DVD (VobSub) and DVB subtitles are burned in: no established web renderer exists for them, and Jellyfin 10.11 answers "External" for a DVD subtitle with an address that returns 404.
- **HDR:** the range types in the codec conditions come from `Capabilities.hdr`, so the tone-mapping rule above reaches the server through them; the HDR override preferences still force either way. Dolby Vision without an HDR10 or HLG base layer is not covered by that rule: it goes to the server unless the browser reports a Dolby Vision decoder and the display is HDR (`capabilities.ts`), or an override preference forces it.
- **What the server may copy:** the HLS transcoding profile lists every video codec the browser decodes, so for a file with one unsupported stream (AC-3 or E-AC-3 without a system decoder, DTS, TrueHD) the server converts that stream and copies the video.

Still converted by the server: video codecs no browser decodes (MPEG-2, MPEG-4 ASP, VC-1), containers other than MP4, WebM and Matroska (remuxed when the codecs fit), DVD and DVB subtitles, ASS in burn-in mode, and anything over the bitrate or resolution limit the user set. `engine/README.md` has the same list with the reasons, and `engine/PLAYBACK_MATRIX.md` the server's answer per test file before and after.

**Subtitles in detail.** `subtitles/loader.ts` turns the chosen stream into one of five forms:

- `text`: the server's JSON track events (WebVTT as a fallback) parsed into cues. `SubtitleLayer.tsx` draws them as HTML over the video, styled from the subtitle preferences and scaled to the rendered video height. The separate HDR style set applies when "different for HDR" is on and the video is HDR.
- `ass`: the raw ASS/SSA file plus the item's embedded font attachments. `AssSubtitles.tsx` hands them to jassub, which runs libass in a worker and draws on a canvas. The jassub code is loaded only when an ASS track is selected. jassub redraws from the browser's `requestVideoFrameCallback`; where a browser lacks that function, `vendor/rvfc-polyfill` supplies a stand-in built on `requestAnimationFrame`. The preference "ASS: built-in" renders ASS as plain text cues instead.
- `pgs`: the raw PGS stream of the track (a `.sup` file), fetched whole and checked to be a PGS stream (`looksLikePgs()`) before it reaches the renderer; anything else is reported as `unavailable`. `PgsSubtitles.tsx` creates a canvas and hands it to libpgs, which draws in a worker (a self-contained script served from the app's own origin). The canvas takes the layout box and the `object-fit` of the `<video>` element, so a subtitle picture is scaled like the picture under it in every video scale mode. The renderer is given the time of every animation frame, minus the subtitle delay (libpgs by itself follows `timeupdate`, about four times a second), and one redraw is forced after the stream has loaded, so a paused video shows the cue it stands in. The libpgs code is its own chunk, loaded only when a PGS track is chosen. Since `cf29a99` the layer's opacity is the preference "Image subtitle opacity" of the style set the video uses (the HDR copy for an HDR video when "different for HDR" is on), as upstream applies it to image cues; before, only the Settings preview read that preference.
- `burn-in`: DVD and DVB subtitles, PGS when "Direct play PGS" is off, and ASS when the preference asks for burn-in. The server draws them into the video.
- `unavailable`: the server offers no client-side delivery for this stream with the current play method.

The subtitle delay works for every form. All three client renderers mount in one place: `SubtitleLayer`, which `PlayerView` renders inside `PlayerSurface`, the positioned box that also holds the engine's `<video>` element. `SubtitleLayer` takes three props from the player: `hidden` (a seek is in flight, from `useSeekHold`, see "The subtitle hold during a skip" below; the text, PGS and ASS renderers all stay mounted but invisible then, so their workers do not start and parse the stream or script again, and `AssSubtitles` takes `hidden` as `visibility: hidden` on its layer, `c92f5e6`, `93e5bf4`), `raised` (the controls are showing, or the skip indicator or the seek bar is) and `lifted` (the skip indicator shows with the controls hidden: the line steps up above it). The text area has no CSS transition: it used to animate its `left`, `width` and `height` as a leftover of the TV's shrinking subtitle view, and that drew the line flying in from the left edge when the text renderer came back, its area starting without a size and being measured at once. Raised text keeps its size and gets a larger bottom margin, and the PGS layer is moved up as a whole, both by the height of the control strip (`RAISED_BY` and `RAISED_SHIFT` in `subtitles/style.ts`, which read the CSS variable `--player-strip-h`); the TV shrinks its subtitle view to 70 % instead, because its controller covers the lower part of the picture.

**The direction of a subtitle line** (`6f16c8b`). The TV draws cues with Android text views, which pick each line's direction themselves; a browser lays a block out in the page's direction unless told otherwise, which put closing punctuation at the wrong end. `subtitles/direction.ts` (pure, unit-tested) gives every line of a cue a base direction of its own, and `SubtitleLayer` writes it as the line's `dir`; the text is never rearranged. The rule, in order: a line that starts with a direction mark has the direction its author stated; a line without right-to-left letters is left to right; a track that stores the closing punctuation of its right-to-left lines at the start of the line (files prepared for players that lay everything out left to right, common for right-to-left subtitle files) is laid out left to right, as on those players; otherwise a line with right-to-left letters is right to left by its first letter, by the majority of its letters, or by the track as a whole; a line without letters follows its neighbour. `trackLayout()` reads what the track as a whole says once per track. For ASS, `subtitles/assDirection.ts` prepares the script before jassub gets it: a script with right-to-left letters that is in reading order gets `Encoding: -1` on every style (libass then takes each line's direction from its first strong character) and a direction mark in front of a line where that first character would give the wrong answer; every other script is passed on as it is.

**What the style options reach** (`e31ba4b`, `cf29a99`). Two additions serve the player's subtitle style sheet (below). The store field `subtitleSample` (`engine/types.ts`) is true while that sheet is open: `SubtitleLayer` then draws a sample line (the string `web_subtitle_sample_1`) in the current style while no cue is on screen, also with subtitles off, and marks its box `data-subtitle-sample`; a chosen track that is still loading gets no sample. `subtitleStyleReach(subtitle)` in `subtitles/style.ts` says what the style options can do to the subtitles on screen: `text` (cues the app draws, and the sample line), `image` (PGS: pictures, only the image opacity applies), `styled` (ASS drawn by libass in the script's own style) or `burned` (part of the picture the server sends).

**The player UI (`PlayerView.tsx`, `ui/`)**

`PlaybackPage.tsx` and `PlaybackListPage.tsx` are thin route pages: they build the destination, hide the shell's Back button, start the session and render `PlayerView`. When Next Up or the queue moves on, `PlaybackPage` replaces `/play/<id>` with the entry now playing without restarting the engine, so a reload continues what is playing; `/play/list/...` keeps naming the list. How the address follows without a restart is described under "The address that follows the queue" below. `PlayerView` is a port of upstream's `PlaybackPage.kt` and overlay: the video with subtitles, the controls overlay, seek feedback, pause and buffering indicators, the floating Skip button, the Next Up panel, the dialogs and the error screen (with Retry and "Play with transcoding"). The controls overlay itself is not the TV's layout: on the owner's request it is modelled on Jellyfin's own web player, a deliberate deviation ([DECISIONS.md](DECISIONS.md) O-34, O-37, T-60; `bf31148`, `c2316a4`, `255bff6`).

**The address that follows the queue** (`PlaybackPage.tsx`; `3325a7d`, repaired in `e6dece7`; [DECISIONS.md](DECISIONS.md) T-86). `usePlaybackSession(dest, ...)` keys the engine's session on the destination, so a change of the destination restarts the engine. The page's destination comes from the address, and the address changes when the queue moves on, so that a reload continues what is playing. To keep the two apart, the page marks its own replacement of the address with the history state `playbackFollowsQueue`: while the current address carries that mark, the destination that started the engine (kept in component state) stays the running one and the session key does not change; a navigation by the user has no mark and gives a new destination. The mark is read from the address's own state, not found by comparing ids, because the state update and the navigation land in different renders and a comparison made between them restarted the engine on an earlier episode. A move to the next entry now makes one playback-info request and no restart, and the `<video>` element stays. The address follow also calls `skipNextPageFade()` (`src/app/shell/useShellLayout`): the layout fades a page in from transparent over 700 ms on every new path, which made each move look like a page reload (`5734cae`; T-88).

**The held picture during an episode change** (`engine/engine.ts`; `5734cae`; T-88). Detaching the stream empties the `<video>` element, which showed black. Before a move to another queue entry the engine's `holdFrame()` draws the element's current frame into a canvas (at most at the size it is shown, with the element's own box and scale, `aria-hidden`, marked `data-player-held-frame`) placed after the element, and sets the store field `frameHeld`. `releaseFrame()` removes it when the new entry has a frame (about 160 ms after the next button or at the end of an episode, about 360 ms after Next Up), and on every exit path. When the element holds no picture (a second move before the first has a frame, a skipped entry, the first start) `holdFrame()` does nothing and the picture already held stays. `PlayerView` shows the black cover (`data-player-cover`) only while `status` is loading and no frame is held; during a move a small buffering spinner stands over the held picture. Next Up and the choice of a queue entry leave the controls as they are. `queuePosition(index, length)` in `engine/queue.ts` gives `hasPrevious` and `hasNext`, which the engine publishes into the store and `ui/Controller.tsx` uses to grey out Previous and Next at the ends of the queue. The role and the notes of the engineer who owns this area are `.claude/agents/playback.md` and `src/features/playback/AGENT-NOTES.md`.

**Clicks on the picture** (`ui/useMouseClickGate.ts`; `0daae7e`; T-84). A mouse click on the picture (`PlayerView`'s click catcher) does not toggle play at once. `createClickGate` (free of React, unit-tested) holds the click for `CLICK_WAIT_MS` (250 ms); a second click inside that time cancels it and the pair is a double click (fullscreen), so play is not toggled. A double click slower than that has already toggled play with its first click, and its second click puts the earlier play state back, within the system's double-click time and at most one second. `isMouseClick` lets only mouse clicks (and clicks with no pointer type) through the gate; touch, pen, the keyboard and the buttons act at once.

**The pointer and the controls** (`PlayerView.tsx`; `7b000ca`). A mouse move shows the controls and the cursor, unless the pointer is on the control strip, a dialog or an error screen is up, or the target is the floating Skip button or the Next Up panel. "The pointer is on the strip" is a flag set by the strip's pointer-enter and cleared by its pointer-leave; a key can hide the controls while it is set, and the hidden strip then sends no pointer-leave. The flag therefore counts only while the controls are visible (`controller.visible && overlayHovered.current`), so a later mouse move brings the controls back.

**The subtitle hold during a skip** (`useSeekHold.ts`, `engine/seekHoldState.ts`; `93e5bf4`; T-85). `PlayerView` calls `useSeekHold('video' | 'animation')` (`'video'` for ASS, whose renderer redraws on the video's own frames: the wait is then for the next video frame, `requestVideoFrameCallback`, while playing and for an animation frame while paused, where the video's frames do not fire; `'animation'` for text and PGS) and passes its `held` to `SubtitleLayer` as `hidden`. A skip press (`seekImmediate`, `dpadSeek`) calls `press()`, which hides the subtitles before the next frame is painted (`flushSync`). The sequence is a pure state machine, `seekHoldNext`: `idle`, then `armed` on a press, `seeking` on the video's `seeking` event, `landed` on `seeked` when no seek is still running, and `idle` again when the frame requested after landing was drawn (a frame callback carries a generation number, so one scheduled for an older seek is ignored). After 3 seconds without an answer the hold lets go, unless the video is still seeking (a repackaged stream restarting), which keeps it. The TV app has no such hold: its subtitles stay, and the web version hides them only so that an old line is not drawn over the new picture. The measured result is in T-85.

**Volume on the Up and Down arrows** (`ui/usePlayerKeys.ts`, `ui/volumeStep.ts`; `93e5bf4`). In the capture-phase key handler, ArrowUp and ArrowDown call `adjustVolume` when the event's target is not inside the side panels (`inSidePanel`) or the control strip and sheets (`inControls`: `[data-focus-trap],[data-player-sheet]`); `stepVolume(volume, muted, dir)` moves the volume by 5 percent and unmutes when raising, and the volume pill appears with its level. Inside the strip or a sheet the arrows move focus as before. With the controls hidden, Tab (when it is not a repeat) and Enter show them; the TV's Up and Down no longer do.

**The layout of the controls.** The overlay (`.overlay` in `PlayerView.module.css`) is a column with two strips and nothing between them:

- **The top strip** (`ui/PlayerTopBar.tsx`): Back, then right after it the item's title and subtitle, and the clock at the end. It has no logo (the TV shows one at the top). Its dark gradient belongs to its wrapper (`.top`), which also carries the safe-area insets.
- **The control strip** (`ui/Controller.tsx`) at the bottom edge, in a wrapper (`.bottom`) whose gradient starts fully transparent one strip height above the strip and darkens to the window edge; the part above the strip takes no pointer, so a click there is a click on the picture.
  - Line 1: elapsed time, the seek bar (`ui/SeekBar.tsx`), remaining time or the Live badge. The times are clocks from `formatClock()` in `src/lib/format.ts` ("52:53", "1:52:53", "-53:39": no hour field under an hour, O-36), in elements with `dir="ltr"`; the row reserves the width of the item's longest time text (`--time-ch`), so the seek bar keeps its length while the times change. The seek preview, the D-pad seek overlay and the chapter list show the same clocks.
  - Line 2 is one row with the same physical positions in every language (O-37): the left group (settings, favourite, picture in picture, volume), "Ends at", the transport buttons in the middle, the Skip button of a running segment, and the right group (subtitles, audio track, chapters, queue, fullscreen). The DOM order is that order, so Tab walks the row from left to right. The groups carry `data-player-group="left|transport|right"`.
  - Phones in portrait (a window under 700 px wide and at least 500 px high), and any window under 500 px wide whatever its height, get two rows of buttons: the transport, then the left group at the left and the right group at the right.
- **Between the strips** nothing is drawn over the picture. The TV's gradient over the whole screen exists as the class `.dim`, set only when the web-only preference `webPlayerDimVideo` is on and the debug info is not showing. The debug overlay, when shown, is placed between the strips.

**The strip's height is one CSS variable.** `--player-strip-h`, set on the player's root in `PlayerView.module.css`, is `max(46PX, min(62px, 12.8dvh))`: 62 dp at full size, never more than 12.8 percent of the window height, and never less than 46 real pixels (the upper-case unit is not scaled). 12.8 percent is the bar that a 2.39:1 film leaves at the bottom of a 16:9 screen, `(1 - (16/9) / 2.39) / 2`; a window lower than 360 px exceeds it, because of the 46-pixel floor. Where the browser has no `dvh` unit, `vh` is used. The two-row strip gets `max(72PX, min(100px, 12.8dvh))`. `Controller.module.css` lays the strip out as shares of that one variable, so it keeps its proportions when a short window makes it lower. Three other parts read the same variable: the sheets, to stand on the strip; the subtitles, to step up by its height; and the debug overlay, for its room.

**Buttons and icons.** `ui/PlaybackButton.tsx` has a `flat` look for the strips, keeps the TV's circle for the music pages, and carries `data-player-button="<name>"` for tests and scenes. The icon names of the buttons the web adds or changes are constants in one module, `ui/playerIcons.ts`: `AUDIO_TRACK_ICON` (the Material "audiotrack" note, where upstream draws a speaker; O-32, `6c14670`), `CHAPTERS_ICON`, `QUEUE_ICON`, and `volumeIcon(silent, volume)` for the speakers of the volume control. A unit test holds that the audio-track icon is never one of the speakers.

**The favourite button** (`ui/FavoriteButton.tsx`, `ui/FavoriteToggle.tsx`; a web addition, `c2316a4`). `FavoriteButton` reads the playback store and decides what can be marked: the entry being played when it is the media itself, not a cinema-mode intro, a trailer or a guide programme. While the next queue entry loads, the store's `item` is still the previous entry; the button then shows the queue's own copy of the new entry and is disabled. `FavoriteToggle` is the button itself and calls the app's one favourite action (`useItemActions()`, section 7). So that the state shown is right at once and after a rollback, item patches now reach holders of item copies outside the query caches: `onItemPatched(listener)` in `src/features/common/itemCache.ts` receives every `patchItemInCaches()`, and `engine.ts` subscribes to apply the patch to the store's playing item, its queue entries and its Next Up item.

**The volume control** (`ui/VolumeControl.tsx`, a web addition) is the last button of the left group: a mute button and a slider that opens on mouse hover only. Since `255bff6` the slider opens at the physical right of its button, laid over the free part of the left side, where "Ends at" stands (not drawn meanwhile); it takes no room in the row, so nothing moves, and it is cut where the left side ends. In the two-row strip it stands over the buttons at the left of volume instead. A Tab or arrow key pressed outside the open slider closes it first, so focus never lands on a control it hides. Where a finger is the main pointer there is only the mute button.

**Sheets and panels.** Every dialog of the player is drawn by `ui/PlayerSheet.tsx`, inside the player. The dialog that is open is one value, `PlayerDialog` in `ui/types.ts`; `STRIP_SHEETS` in the same file names those that stand on the control strip (settings, speed, scale, bitrate, subtitle style, subtitles, audio, chapters, queue). A sheet's `placement` is `bottom-left`, `bottom-right` or `center`: the bottom ones stand 8 dp above the strip at that physical side in every language, above the button group that opens them (settings and its sub-sheets at the left; subtitles, audio, chapters and queue at the right). While a strip sheet is open, `PlayerView` keeps the controls up and restarts the hide timer when it closes. Chapters and queue are panels: `ui/PlayerPanel.tsx` is a `PlayerSheet` with a header and a Close button, half the player's width and at most 520 dp (the whole width under 600 px), scrolling inside; `ui/ChaptersPanel.tsx` and `ui/QueuePanel.tsx` fill it with rows. A panel takes focus on its current row, closes with Escape, Backspace, a press outside it, its Close button and the key that opened it (H for chapters, Q for the queue), and tells `PlayerView` when a row was chosen, which hides the controls as the TV does.

**The compact Settings sheets** (`cf29a99`, `509db33`; O-43). The sheets of the left side (Settings, speed, scale, bitrate, subtitle style) carry the class `compactSheet` of `ui/PlaybackDialogs.module.css`: as wide as their longest row, between 120 dp and 280 dp, where the TV's list is 424 dp; at most 72 percent of the player's height; rows of 44 dp; and a surface that is 92 percent opaque, so the video shows through a little. A sheet of sliders has no width of its own and takes the full 280 dp (`sliderSheet`). The track, chapter and queue sheets at the right keep the TV's size.

**Subtitle style in the player** (`ui/SubtitleStyleSheet.tsx`; a web addition, `e31ba4b`). The row "Subtitle style" of the player's Settings sheet opens a sheet that holds the Settings page's own subtitle style list: it builds the `SUBTITLE_STYLE` screen with the settings feature's `buildScreen()` and draws it with that feature's `PreferenceList`, without the rows that open another page. This is the one place where the playback feature renders components of the settings feature; the sheet's stylesheet tightens their rows by their place in the markup (`[data-pref-id]`), because their class names belong to the other feature. It edits the style set the video uses: the separate HDR copy when "different for HDR" is on and the video is HDR, as the renderer picks it. The playing video is the preview: the sheet sets the store's `subtitleSample` while it is open, and when `subtitleStyleReach()` says the subtitles on screen cannot be restyled (pictures, their own style, or part of the server's picture) a note at the top of the sheet says so (`data-subtitle-style-note`). A dialog that a row of the sheet opens (a colour choice) is the kit's `Dialog`, drawn outside the sheet: `PlayerSheet` ignores keys whose target is outside its panel, and `usePlayerKeys` leaves Back to any focus trap, so that dialog's Escape closes only that dialog.

| Piece | File |
|---|---|
| The top strip: Back, title, clock | `ui/PlayerTopBar.tsx` |
| The control strip: seek line, times, buttons | `ui/Controller.tsx`, `ui/SeekBar.tsx`, `ui/PlaybackButton.tsx`, `ui/playerIcons.ts` |
| Auto-hide of the controls | `ui/useControllerView.ts` |
| Clicks on the picture, the subtitle hold during a skip, volume steps | `ui/useMouseClickGate.ts`, `useSeekHold.ts` with `engine/seekHoldState.ts`, `ui/volumeStep.ts` |
| Chapters and queue panels | `ui/PlayerPanel.tsx`, `ui/ChaptersPanel.tsx`, `ui/QueuePanel.tsx` |
| Seek preview with trickplay tiles | `ui/TrickplayPreview.tsx`, `ui/DpadSeekOverlay.tsx`, `ui/SkipIndicator.tsx` |
| Dialogs: settings, captions, audio, speed, scale, bitrate, subtitle style, subtitle delay, subtitle download, shortcuts | `ui/PlaybackDialogs.tsx`, `ui/SubtitleStyleSheet.tsx`, `ui/SubtitleDelayDialog.tsx`, `ui/DownloadSubtitlesDialog.tsx`, `ui/ShortcutsDialog.tsx`, drawn in `ui/PlayerSheet.tsx` |
| Skip button, Next Up panel | `ui/SkipSegmentButton.tsx`, `ui/NextUpPanel.tsx` |
| Keyboard | `ui/usePlayerKeys.ts` (the D-pad rules, in the capture phase so they act before the global navigator), `ui/keymap.ts` (single-key shortcuts, among them H for chapters and Q for the queue), `ui/holdSeek.ts` |
| Web additions: fullscreen, picture-in-picture, volume, favourite | `ui/useScreenModes.ts`, `ui/VolumeControl.tsx`, `ui/FavoriteButton.tsx`, `ui/FavoriteToggle.tsx` |
| Debug overlay | `ui/DebugOverlay.tsx` |

The player's dialogs render inside the player, not in a portal on `<body>`, so they stay visible in fullscreen. Every row of a sheet draws its headline and supporting line through one component (`Line` in `ui/PlaybackDialogs.tsx`), which lets a value such as ".25" or "100 Mbps" read in order in a right-to-left interface (section 12). In a development build the engine publishes itself and its store as `window.__playback`; the end-to-end layout tests use it to put the strip into states a test item does not have (a queue, chapters, a Skip button).

**What was checked, and what was not.** The engine's own notes record tests of every file in the test server's codec collection in headless Edge, a Chrome subset, and items on a real server with a limited test account. The merge notes record a short H.264 playback inside the production container under its Content-Security-Policy, and the end-to-end suite plays short clips in headless Edge, Firefox and WebKit. Since `bf31148` the engine's notes also record the server's playback answer per file, track and browser before and after the direct-play work, and the suite holds in headless Edge: the player layout (`playback-layout`), direct play of a Matroska file, PGS drawn in the browser, the second audio track and HDR10 (`playback-direct`), the direction of subtitle lines (`subtitles-bidi`) and the subtitle style sheet (`playback-subtitle-style`). Playwright's WebKit build on Windows has neither Media Source Extensions nor native HLS, so only direct play of an MP4 could be tried in it; a remux or transcode in WebKit was not tested. Not tested: Safari and iOS on real devices (the native-HLS path), a browser that decodes AC-3, HDR output on an HDR display, hardware HEVC decoding (not available headless), real phones, cinema-mode intros, the note for subtitles that cannot be restyled with real image, ASS or burned-in subtitles (the test sets the subtitle kind through the dev hook), the player's Settings sheets at phone width, and remote control over Jellyfin's websocket, which is not implemented and which the owner does not require ([DECISIONS.md](DECISIONS.md) O-30).

### 14.5 Settings (`src/features/settings/`)

- **The order of Settings** (`b7f3310`; [DECISIONS.md](DECISIONS.md) O-48, T-77). The first screen and the subjects are the web's own order; the rows are the upstream rows.
  - `topics.ts` is the model: `TOPICS` (nine subjects, each a list of sections of row ids), `QUICK_ROWS` (five shortcut rows, also in their subject), `NAVIGATION_ONLY` (the three upstream rows that only led from one regrouped screen to another, which have no place), `buildTopic`, `buildRows`, `resolveRow` and `topicPreview`. `resolveRow` takes the row's entry on the upstream screen it came from (BASIC, ADVANCED, EXPERIMENTAL or USER_PROFILE) and applies that visibility condition; the experimental row under Audio shows only while "Experimental settings" is on. Rows that are not generated preferences (`WebSignOut`, `WebResetPreferences`) have their title keys in `SPECIAL_TITLE_KEYS`. `topics.test.ts` fails when a web-visible upstream row has no home, has two, or never shows.
  - `SettingsHome.tsx` is `/settings`: a "Quick settings" group (two rows beside each other, the slider across both columns), then "All settings": one `ClickPreference` per subject (`data-pref-id="Topic-<id>"`) whose summary lists every row of the subject, one to a line. `SettingsTopicPage.tsx` is `/settings/topic/:topic`: the sections of one subject; an unknown subject goes to `/settings`. `TopicRows.tsx` draws a subject's rows and picks the component for the rows that are not plain preference rows: `ProfileLanguagePreference.tsx` (preferred audio and subtitle language), `SubtitleModePreference.tsx`, `ProfileProtectionPreference` with its "Change PIN" row, `SignOutPreference.tsx` and `ResetPreferencesPreference.tsx` (a web-only row in About).
  - Layout (`Preference.module.css`): the subjects are CSS columns (flow down, then across), so the keyboard order equals the reading order; below a container width written in rem (the build's px-to-rem step does not change at-rule conditions, and the threshold must follow the interface scale) both parts are one column. Rows of the first screen are 56dp.
  - Old addresses: `SettingsPage.tsx` keeps a table `MOVED` (`advanced` to `/settings`, `experimental` to the Audio subject, `user` to the Profile subject), looked up by own keys only; `screenFromParam` does the same. `UserProfileSettingsPage.tsx` was removed; `nav.userSettings` became `nav.settingsTopic(topic)`, and `SettingsScreen` no longer has `advanced` or `experimental`. Upstream destinations that named those screens map to `/settings` or a subject (`DESTINATIONS` in `prefModel.ts`).
- **Screens from data.** `SettingsPage.tsx` renders `/settings` (through `SettingsHome`) and `/settings/:screen` (screensaver, skip behavior, HDR formats). `prefModel.ts` builds each screen from the generated `PREFERENCE_META` and `PREFERENCE_SCREENS`, plus a hand-written overlay the metadata cannot carry: slider unit conversions, summary formats, validators, destinations, web visibility rules, and the mark for a slider whose value re-lays out the page and is therefore applied at the release of a drag (`relaysOutPage`, section 10). `PreferenceList.tsx` draws groups (the player's subtitle style sheet draws the `SUBTITLE_STYLE` screen with it too, section 14.4); `PreferenceRow.tsx` picks the row component for each widget kind (`SwitchPreference`, `SliderPreference`, `ChoicePreference`, `MultiChoicePreference`, `ClickPreference`, a string input dialog) and for the special rows (theme picker with live preview, language list, profile protection with the PIN pad, Quick Connect authorize, drawer pins, send app logs, clear image cache, installed version, start screensaver, the Seerr entry).
- **Frame.** `SettingsLayout.tsx` is upstream's panel (40 percent of the width, at least the TV's 384dp; 25 percent and 240dp on the subtitle style screen; full width on phones). Up and Down wrap inside it. Four things differ from upstream since the round of 2026-11-23, all owner requests ([DECISIONS.md](DECISIONS.md) O-39, O-40, T-61):
  - **Side.** The panel stands at the start edge, the nav drawer's side, in both directions (upstream: the end edge).
  - **What is beside it.** The layout has no background of its own, so the layer behind shows: the copy of the page Settings was opened from, at its own brightness, or the plain background (section 13, "Settings over the page"). A click on the empty area goes Back, as Escape and the browser's Back do. A screen with a preview beside the panel (subtitle style) has its own ground.
  - **Back button.** None while the empty area is there to click. Where it is not, the layout places its own, because the shell's floating one would lie on the panel: over the panel's header when the panel fills the window, in the preview's corner beside a preview. Whether there is room is measured (the page's width minus the panel's, against 48 dp), not asked with a width query: the panel's least width grows with the interface scale.
  - **Look and opening.** The panel has the open drawer's look: one pseudo-element, the "ground", in the surface colour, solid under the panel and fading out over 64dp past its end edge. When Settings is chosen from the open drawer, the ground slides out from the open drawer's width with the drawer's spring (`--shell-rail-open-width`, `--shell-spring`), a single transform; the header and the list do not move and are not clipped, they fade in once the ground has all but arrived. Opened by its address, on a reload and between Settings screens nothing moves (a module flag, `visiting`, is true from the first Settings screen of a visit until Settings is left). With reduced motion nothing is animated. Earlier forms of the same day were replaced: upstream's slide-and-fade of the panel (`5ab9fd6`), a panel that grew out of the rail (`7454e4c`), and an opening drawn with a mask, which wiped the content in mid-word and was painted on every frame (`630c7e9`, replaced in `445a739`); T-61 records the attempts and why they were dropped.
- **Other screens.** `SubtitleSettingsPage.tsx` (the style editor with a live preview, and its HDR copy at `?hdr`), `LicensePage.tsx` (from the generated `licenses.gen.json`), `DebugPage.tsx`.
- **Debug page.** App and device information, codec and HDR support detected in this browser, the section "Measured Playback Support" (`measuredPlaybackSupport()` in `debugInfo.ts`: what the probe clips of section 14.4 found), preferences, server and user (token redacted) and the client log. It also offers copy, send logs, clear caches, reset preferences, switch user and sign out. It needs no session, so it is reachable from a failed login.
- **Sign out** is also a row of the Profile subject of Settings (`SignOutPreference.tsx`).
- **Client log** (`clientLog.ts`): a ring buffer of console output with secrets redacted before they are stored. "Send app logs" (`sendAppLogs.ts`) uploads it to the current Jellyfin server as a client log document.
- **Screensaver hook** (`screensaverEvents.ts`): the "Start screensaver" row is shown only while the screensaver component is mounted and has registered a handler.

Android-only preferences are not shown. Home customization is linked from settings but lives in `src/features/home/`.

### 14.6 Seerr and Discover (`src/api/seerr/`, `src/features/discover/`)

**The client (`src/api/seerr/`)**

- `client.ts`: every request is relative to `seerrProxyPath()`. That is `seerrProxyPath` from `/config.json`; in a development build only, it falls back to `/seerr-proxy`. Anything that is not a same-origin path is refused, so without a proxy in the deployment Seerr is simply unavailable. Requests send the browser's cookies, except when an API key is used: then the cookie is deliberately left out, so a wrong key cannot fall back to someone else's Seerr session. Query strings are percent-encoded by hand, because Seerr rejects `+` for a space.
- `endpoints.ts`, `types.ts`: typed endpoints, only those upstream uses.
- `session.ts`: the Seerr link per Jellyfin user (sign in as Jellyfin user, as local Seerr user, or with an API key). **No password is stored**, unlike upstream: the browser's Seerr session cookie is the credential. The store's `status` is one of `unavailable` (the deployment has no proxy), `checking`, `notLinked`, `linked`, `expired` or `error`. One cookie serves every Jellyfin user of the browser; when it has run out, or belongs to a different Seerr user than the link says, the state is `expired` and the user is asked to sign in again.
- `permissions.ts`, `status.ts`, `filter.ts`, `items.ts`: pure rules (permission bits, availability and request status, discover filters, mapping Seerr results to card data), unit-tested.
- `queries.ts`: the TanStack Query hooks behind every Seerr screen.

**The same-origin proxy.** In development, `vite.config.ts` proxies `/seerr-proxy` to `DEV_SEERR_URL` and strips the prefix. In production, `server/seerrProxy.ts` does it with more care (section 15). The browser-side client is identical in both.

**Pages (`src/features/discover/`)**

- `DiscoverPage.tsx`: tabs Discover, Request, Search, Movies, TV Shows; the tab is kept in the URL.
- `DiscoverMorePage.tsx`: the "view more" grids with sort and filter.
- `DiscoveredItemPage.tsx`: dispatches `/discover/:mediaType/:tmdbId` to the movie, TV or person page.
- `RequestMovieDialog.tsx`, `RequestSeasonsDialog.tsx`, `RequestOptions.tsx`, `useRequestActions.ts`: the request flow (seasons, 4K and advanced options, cancelling your own request).
- `SeerrGate.tsx`: wraps every Discover page. While Seerr is not linked it explains why and offers the sign-in dialog (`SeerrLinkDialog.tsx`).
- `SeerrSettingsEntry.tsx`: the Seerr row in settings.

**Seerr on other pages**

- **Drawer.** `DiscoverDrawerFlag` in `src/app/layouts.tsx` shows the Discover entry only while this user is linked.
- **Search.** `searchProvider.ts` registers the provider of the search page's extension point: page 1 of Seerr's search, movies and TV only.
- **Detail pages.** `DetailDiscover.tsx` adds a "Discover" row (similar titles) to movie and series pages, the combined credits row to person pages, and a "Discover" button to series pages. All of these render nothing while Seerr is not linked.
- **Backdrop.** `backdropStore.ts` forwards Seerr artwork to the shell with `submitBackdropUrl()`.

Open points: whether signing out of Jellyfin should also sign out of Seerr (Q-6), where an API key should live (Q-7), and whether to keep the web-only season-status list on TV pages (Q-8).

### 14.7 Live TV (`src/features/livetv/`)

- **Entry.** `LiveTvView.tsx` is the Live TV library page: tabs "Guide", "DVR Schedule" and one tab per recording folder (each named by the server's recording folder, as upstream). When a non-guide tab's content has loaded, `tabArrivalTarget()` (`tabArrival.ts`, section 11.4) decides whether focus moves into it: for a keyboard choice of the tab or a page opened with nothing focused, yes; for a tab clicked or tapped, focus stays on the tab. It is reached from `/livetv` (`LiveTvPage.tsx`) and from the library route (section 6). `RecordingsView.tsx` is a single recording folder, reached from `/recordings/:itemId` and from the library route.
- **Data.** `liveTvApi.ts` holds every Live TV call with upstream's parameters. `useGuide.ts` is the guide's state (a port of `LiveTvViewModel`): all channels in one request, programs fetched per window of channels around the focused row. `guideModel.ts` is the pure model: the 48-hour time window, mapping programs to cells, filling gaps with "No data" cells, and upstream's layout constants.
- **The grid.** `GuideGrid.tsx` is one scroll box in both directions. The timeline row sticks to the top and the channel column to the start. Programs are positioned by time (240dp per hour, 64dp per row), and only the rows and hours in view, a small overscan and the focused cell are rendered; this virtualization is written in the component, without a library. Arrow keys move program by program; the wheel, drag and touch pan scroll.
- **Dialogs.** `ProgramDialog.tsx` (Watch live, Record, Record series, Cancel), a channel dialog (Watch live, Favorite), `LiveTvViewOptionsDialog.tsx`, and `DvrSchedule.tsx` (active recordings and scheduled timers by day).
- **Recording folders** (`RecordingFolderGrid.tsx`) are drawn with browse's shared `LibraryGrid`.

**Write guards.** The calls that create or cancel recordings and timers (`createTimer`, `createSeriesTimer`, `cancelTimer`, `cancelSeriesTimer`) are real, complete code, and the Record buttons call them. The application itself has no switch that disables them. The guards are in the test tools: the end-to-end Live TV spec and the crawler's Live TV scenes (`mockLiveTvWrites` in `tools/shots/scenes.ts`) answer every request under `/LiveTv/Timers`, `/LiveTv/SeriesTimers` and `/LiveTv/Recordings` themselves, so no write reaches a server. This follows a project rule made after one test recording filled a disk ([DECISIONS.md](DECISIONS.md) T-30). **Recording and cancelling have therefore never been run against a real server.**

### 14.8 Music (`src/features/music/`)

- **The service** (`service/musicService.ts`) is a port of upstream `MusicService.kt`: one app-wide queue with its own audio output, separate from the video player. It lives at module level, not in a component, so music keeps playing while the user navigates. It plays through two `<audio>` elements that are never added to the page: one plays, the other preloads the next direct-play track during the last 30 seconds, and they swap when the track ends.
- **State** is published in `src/stores/musicQueue.ts`. Only the service writes it; pages read it with `useMusicQueue(selector)` and call the service's commands.
- **Queue rules** (`queue/queueOps.ts`) are pure and unit-tested: append, play next, move, remove, shuffle order, repeat modes.
- **Streams** (`service/streamUrl.ts`): the browser's audio support, detected at run time with the playback engine's capability probe, decides between playing the file directly and asking the server to transcode it to MP3.
- **Reporting** (`service/reporter.ts`): Start, Progress every 5 s, Stopped.
- **`MusicHost.tsx`** is mounted once for every signed-in route. It drives the drawer's "Now playing" entry (kept for 2 hours while paused), stops the music when a video route opens or the user changes, pauses it when an unmuted `<video>` elsewhere in the page starts, installs the item menu's `addToQueue` and `playMusic` handlers, and renders the mini player.
- **Mini player** (`MiniPlayer.tsx`): a web-only bar at the bottom of shell pages with art, title, play/pause, next and a progress line. It reserves space with `body[data-music-bar]` and is hidden on full-screen routes.
- **Now Playing** (`NowPlayingPage.tsx`, `nowplaying/`): the full-screen player with the queue list, lyrics (`LyricsPane.tsx`, `lyricsModel.ts`), a seek bar, view options, a bar visualizer, and its own rotating backdrop (`useNowPlayingBackdrop.ts`, section 13). The visualizer taps the audio through a Web Audio analyser that is created only when the user turns it on (`service/visualizerTap.ts`).
- **Pages**: `MusicLibraryPage.tsx` (tabs Recommended, Albums, Artists, Genres, Songs; Albums, Artists and Songs are browse's shared `LibraryGrid`, Genres the shared genre tiles, Recommended `library/RecommendedMusic.tsx`; the music library's own grid of earlier stages is gone), `AlbumPage.tsx`, `ArtistPage.tsx`, `SongPage.tsx`, `MusicGenrePage.tsx`. Song lists come from `data/songSources.ts`.
- **Menu**: music items use their own context menu (`menu/musicMenu.tsx`, `menu/useMusicContextMenu.tsx`), a port of upstream's separate music menu.

### 14.9 Photos and slideshow (`src/features/photos/`)

- **Grids.** `PhotoFolderView.tsx` shows a photo or home-videos library, or a photo album: sort, filter, view options, Play and Shuffle, the letter column and the counter. It is the photo feature's own grid, not browse's `LibraryGrid` (section 22), but it follows the library grid's entry rule: the card area is `data-focus-enter="last"`, and the letter column hands Left (Right in right-to-left) to it with browse's `leaveLetterColumn()`, so an arrow key entering the grid, from any letter included, returns to the card focused last (upstream `CardGrid.kt` `focusRestorer`). Right from the grid into the letter column still goes by geometry. `PhotoLibraryPage.tsx` and `PhotoAlbumPage.tsx` are thin wrappers.
- **Viewer** (`SlideshowPage.tsx`, route `/slideshow/:parentId`): a black full-screen page that steps through the folder's photos, runs a slideshow on a timer (`slideshowTimer.ts`), and plays video clips inline. `SlideshowStage.tsx` draws the image with a cross-fade and applies zoom, pan, rotation and a color filter (`slideshowModel.ts`); `ImageOverlay.tsx` is the details and controls panel. The viewer requests a screen-sized image from the server rather than the original file (`photoUrls.ts`).
- **Opening a photo.** The grid passes its sort and filter in the URL, and `?id=` names the photo on screen: the viewer replaces it as the user steps through the photos (no new history entries), so a reload, a shared link, Back and Forward return to that photo.
- **Screen on.** `screenWakeLock.ts` holds the Screen Wake Lock for named holders (the slideshow, the screensaver) and re-acquires it when the tab becomes visible again.

### 14.10 The in-app screensaver

The screensaver lives in the photos folder because it shares the image code: `src/features/photos/AppScreensaver.tsx`, `screensaverService.ts`, `screensaverItems.ts`.

- `<AppScreensaver />` is mounted once in `src/app/providers.tsx`. It does nothing while nobody is signed in.
- `screensaverService.ts` is a port of upstream `ScreensaverService.kt`: an idle timer that shows the screensaver, and optionally a dim layer, after the configured delay. Any key, pointer movement, touch or wheel resets the timer and dismisses the screensaver; the key or click that wakes it does nothing else.
- `screensaverItems.ts` builds the item list: random items of the chosen types with a backdrop (or photos), limited by the parental-rating preference.
- A page that must not be interrupted calls `keepScreenOn(true, name)`; the running slideshow does.

**Media probes.** Upstream's player tells the screensaver service when it is playing. The web player and the music service do not know the service, so before showing anything the timer asks `mediaPlaying()`:

1. It scans the page for a `<video>` or `<audio>` element that is playing. This covers the video player and the slideshow's clips.
2. It asks every registered **probe**. A probe is a function that answers "is something playing?" for media the scan cannot see. The music service registers one with `addMediaPlayingProbe()`, because its `<audio>` elements are never added to the page.

If either says yes, the screensaver does not start and the timer runs again. A new player whose media element is not in the document must register a probe, or the screensaver will start over it.

---

## 15. The production server and the Docker image

Code: `server/`. Guide for operators: [deploy.md](deploy.md).

### What it serves (`server/app.ts`)

`createApp(config)` builds a Hono application with these routes, in order:

| Route | Behavior |
|---|---|
| `GET /healthz` | `{"status":"ok"}` when `dist/index.html` is readable, else HTTP 503. Never cached |
| `GET /config.json` | the runtime settings the app reads at startup (below). Never cached |
| `/seerr-proxy` and `/seerr-proxy/*` | the Seerr proxy (below) |
| everything else | static files from the build folder (`server/static.ts`) |

Every response gets the security headers. Responses are compressed. An optional access log prints the method, path, status and time of each request, and never the query string, because query strings can carry tokens.

**Static files.** Files under `/assets/` have content hashes in their names and are cached for a year. Everything else, including `index.html`, is revalidated with an ETag, so a redeploy shows up on the next load. A path without a file extension is an in-app route and gets `index.html`; a missing file with an extension is a real 404. Dotfiles are never served, and only GET and HEAD are allowed.

The app must be served at the root of its own address or port. A sub-path such as `/wholphin/` is not supported.

### `/config.json`

The app's three runtime settings are `serverUrl`, `serverName` and `seerrProxyPath` (`src/api/config.ts`). The server builds the answer from `dist/config.json` as the base, with environment variables taking precedence: `JELLYFIN_URL` becomes `serverUrl`, `SERVER_NAME` becomes `serverName`, and `seerrProxyPath` is `/seerr-proxy` when `SEERR_URL` is set and absent otherwise. Settings therefore change by restarting the server, not by rebuilding the app.

### Configuration (`server/config.ts`)

| Variable | Default | Meaning |
|---|---|---|
| `JELLYFIN_URL` | none | the address **browsers** use to reach Jellyfin. Set: the app is locked to that server. Unset: users type a server address |
| `SEERR_URL` | none | where **this server** reaches Seerr. Unset: the proxy answers 404 and the app has no Discover |
| `SERVER_NAME` | none | display name shown before the server answers |
| `PORT`, `HOST` | `8080`, `0.0.0.0` | where to listen |
| `DIST_DIR` | `dist` next to the server | the built app |
| `TRUST_PROXY` | `true` | believe `X-Forwarded-Proto`, `-Host` and `-For` from a reverse proxy in front. Whether this should default to off is open (Q-9) |
| `HSTS` | `true` | send `Strict-Transport-Security` on HTTPS requests |
| `CSP_EXTRA_ORIGINS` | none | extra origins the app may connect to |
| `MAX_BODY_MB`, `SEERR_TIMEOUT_SECONDS` | `10`, `30` | limits of the Seerr proxy |
| `ACCESS_LOG` | `false` | one log line per request |

An invalid value stops the server at startup with a readable message.

### Security headers and the Content-Security-Policy (`server/security.ts`)

A Content-Security-Policy (CSP) is a header that tells the browser which origins a page may load scripts, images and media from and connect to. The policy here:

- scripts only from the app's own origin, plus permission to compile WebAssembly (jassub needs it). No inline scripts;
- inline styles allowed (React sets `style` attributes);
- images, media, fonts and connections to the app's own origin, `blob:` and `data:` where hls.js, the probe clips of section 14.4 and subtitles need them, artwork from the TMDB image host for Seerr results, and Jellyfin. Workers may come from the app's own origin and from `blob:` (`worker-src`), which, as the code reads, covers the workers of hls.js, jassub and libpgs; no check of the project has run the libpgs worker in the production build under this policy;
- **Jellyfin is narrowed to the configured origin** (and its WebSocket form) when `JELLYFIN_URL` is set, or when `dist/config.json` names a `serverUrl`. Without either, the user may type any server, so those sources are opened to any `http:` and `https:` origin;
- no plugins, no framing by other sites, forms only to the app's own origin.

The other headers: `X-Content-Type-Options: nosniff`; `Referrer-Policy: no-referrer` (media and image URLs carry a token in the query string, so they must never be sent as a referrer); a `Permissions-Policy` that turns off camera, geolocation, payment and USB and allows the microphone for the app's own origin only (`microphone=(self)`); `Cross-Origin-Opener-Policy: same-origin`; and HSTS on HTTPS.

The `Permissions-Policy` allows the microphone for the app's own origin and for nothing embedded in it. Voice search (section 14.3) asks the browser for speech recognition, which needs the microphone; the header no longer blocks it. Voice search with a real microphone through the production server was not tested.

### The Seerr proxy, and why it is not an open proxy (`server/seerrProxy.ts`)

An open proxy is a server that forwards requests to whatever address the caller names. This one cannot be used that way:

- **The target is fixed.** It is `SEERR_URL`, read once at startup. Nothing in a request can change it. Only the path below `/seerr-proxy` and the query string are forwarded, and the resulting URL is checked to still be on Seerr's origin and under its base path.
- **Only three path prefixes are forwarded:** `/api/v1/`, `/imageproxy/` and `/avatarproxy/`. Seerr's own web interface is not reachable through the proxy.
- **Path tricks are rejected:** encoded dots, slashes, backslashes and NUL bytes, `.` and `..` segments, and double slashes.
- **Redirects are not followed.** A `Location` header from Seerr is rewritten to stay under `/seerr-proxy`.
- **Cross-site writes are rejected.** A request that changes state (anything but GET or HEAD) whose `Origin` header names a different host gets HTTP 403.
- **Credentials are filtered.** Only Seerr's own session cookie (`connect.sid`) is forwarded; Jellyfin authorization headers are dropped. Seerr's `Set-Cookie` is rewritten to `Path=/seerr-proxy; SameSite=Lax`, with `Secure` over HTTPS, so the browser keeps it for the app's address and sends it only to the proxy.
- **Responses cannot run script.** Every proxied response gets its own policy, `default-src 'none'; sandbox`, and `nosniff`. Whatever Seerr returns is shown on the app's origin, where the Jellyfin tokens live, so it must never execute.
- **Limits.** Request bodies are capped (HTTP 413). The timeout covers the wait for Seerr's response headers only (HTTP 504); a body that is already streaming is not cut off. An unreachable Seerr gives HTTP 502.

What the proxy does not do: it adds no authentication of its own. Anyone who can open the app can reach Seerr's API through it, and Seerr's own login protects the data.

The server has unit tests in `server/server.test.ts`, run with the rest of the unit tests.

### Running it

- `npm start` runs `server/index.ts` directly with Node 24 against a `dist/` built by `npm run build`.
- `npm run serve:build` bundles the server and its dependencies into one file, `dist-server/index.js` (`server/vite.config.ts`), for a machine that has only Node and the `dist/` folder.

### The Docker image (`Dockerfile`)

A two-stage build on `node:24-alpine`:

1. **Build stage:** `npm ci`, then `npx vite build` (the app) and `npm run serve:build` (the one-file server). The `vendor/` folder and `tools/quiet-playwright.mjs` are copied before `npm ci`, because the install needs both. This stage runs `vite build` directly, so it does not run the TypeScript check that `npm run build` runs first.
2. **Runtime stage:** only `dist/` and the bundled `server.js`. No `node_modules`, no build tools. It runs as the unprivileged `node` user, listens on port 8080, and has a health check that calls `/healthz`.

`docker-compose.example.yml` shows a read-only container bound to the local machine, for use behind a reverse proxy.

**Checked** (per [final-merge-notes.md](final-merge-notes.md) section 12.6): the image was built from the tree of the final check and repair (`wholphin-web:latest`, 258 MB; the `npm ci` layer came from the build cache) and run against the throwaway test server: `/healthz` answered 200, `/config.json` carried the server address, a deep link answered with the app's page, the headers above were present with the policy narrowed to the configured Jellyfin, sign-in reached Home, and an H.264 item played 4 s with no policy violation. The image was later rebuilt from `main` at `7ad52ba` (258 MB) and runs since 2026-11-18 as a trial behind a real reverse proxy over HTTPS, where a check in headless Edge loaded the app, read `/config.json`, reached the Seerr proxy, signed in, opened Home and an item page and saw no policy violation, without playing a video ([final-merge-notes.md](final-merge-notes.md) section 14.6; [STATUS.md](STATUS.md)). The trial's image has been rebuilt at each go-live since, each time only after the owner's yes for that build ([DECISIONS.md](DECISIONS.md) O-45); on 2026-11-24 the trial ran the image built from `509db33` and later that day, on the owner's yes, the image built from `4d6b61e`; the previous image is kept under a rollback tag, and the image is labelled with its commit ([TOOLING.md](TOOLING.md) section 16; T-64). For the changes of 2026-11-23 and 24 the lead did not look at the live trial; the owner looked at each change there. **Not checked:** video playback in the image by the project's own tests since the tree of the final check, the example Caddy and nginx snippets in [deploy.md](deploy.md) as written (the trial's route was added to a running Caddy by hand), and `npm ci` from a completely clean checkout. Whether the app should reload itself after a redeploy removed a code chunk it needs is open (Q-10); today it shows the error screen.

---

## 16. Browser baseline and build targets

**Supported browsers:** Chrome and Edge 119 or newer, Firefox 128 or newer, Safari 16.4 or newer (including iOS and iPadOS 16.4) ([DECISIONS.md](DECISIONS.md) T-33).

The floor comes from the stylesheets: they use CSS relative color syntax (`rgb(from …)`) and `color-mix()`, which those versions introduced. Two places encode the baseline and must be changed together:

| Place | What it does |
|---|---|
| `BROWSER_TARGETS` in `vite.config.ts` | `['chrome119', 'edge119', 'firefox128', 'safari16.4']`, used as both `build.target` (JavaScript syntax) and `build.cssTarget` (CSS syntax), so the build does not down-level below these versions |
| `public/browser-check.js`, loaded by `index.html` | the feature test and the "too old" notice (section 4.1) |

The end-to-end suite has a spec for this (`e2e/specs/engines.spec.ts`): the app starts with no notice in Chromium, Firefox and WebKit, and a forced failing feature test shows the notice and stops the app.

The build does not rewrite newer CSS for these versions, so two features are kept out of the stylesheets by hand: the `:dir()` pseudo-class (unknown to Chrome and Edge 119; mirrored details use `[dir='rtl']` selectors, section 12) and `text-box` (unknown to Firefox 128; texts are trimmed with the exact helpers `t-line` and `t-trim`, section 9). A unit test, `tools/css-engine-baseline.test.ts`, reads every `.css` file under `src` (comments removed) and fails when any of them uses `:dir()`, or sets `text-box`, `text-box-trim` or `text-box-edge` to anything but `normal` outside `src/theme/global.css`, where the kit's `t-trimBox` helper lives. Playwright's browsers are much newer than these versions, so the difference itself has not been observed in a real Chrome 119 or Firefox 128.

Other things a developer should know about engines, all handled in the input-modality tracker and the UI kit: Safari does not focus buttons on click (sections 11.5 and 11.7), iOS Safari sends no `contextmenu` for touch (section 11.8), Firefox does not show a focus ring for scripted focus after a mouse click (section 11.5), and WebKit does not turn the Menu key into `contextmenu` (section 11.6). Media support differs per browser and is detected at run time (section 14.4), not assumed from the browser name.

---

## 17. Testing layers

| Layer | Tool | What it covers | Where it runs |
|---|---|---|---|
| Unit tests | Vitest with jsdom | pure logic: models, rules, formatters, generators, the production server | locally and in CI |
| End-to-end suite | Playwright Test | behavior of the running app in real browsers | locally only, against the throwaway test server |
| Screenshot crawler | Playwright | a picture and a health report of every route | locally only |
| Reference comparison | the crawler plus an Android TV emulator | the web picture next to the TV app's picture | locally only |
| CI | GitHub Actions | typecheck, unit tests, lint, build, Docker image build | on every push and pull request to `main` |

### Unit tests

`npm run test` runs Vitest once. The configuration is in `vite.config.ts` (`test`): the jsdom environment, and test files matching `src/**/*.test.{ts,tsx}`, `tools/**/*.test.ts` and `server/**/*.test.ts`. Tests sit next to the code they test. They cover logic, not rendering: for example the item menu's entries, the playback engine's decisions, the Seerr rules, the queue operations, the guide model, the input-modality tracker and the Seerr proxy. On `main` at `509db33` the lead's run counted 101 files and 897 tests, all passing (84 files and 742 tests on the merged tree of the polish round, `f1fb308`; 87 and 776 at `7ad52ba`, where the three new files test the right-to-left values, the slider's pointer handling and the touch helper; [final-merge-notes.md](final-merge-notes.md) sections 13.5 and 14.5). The files added since test, among other things, the player's icons, layout and favourite button, the capability decisions, the PGS loader, the direction of subtitle lines, the page copy behind Settings and the card grid's width. Two tests under `tools/` guard the code base itself rather than one module: `tools/css-engine-baseline.test.ts` (section 16) and the crawler's string lookup, `tools/shots/uiText.test.ts`.

### The end-to-end suite (`e2e/`)

`e2e/README.md` is the full guide. In short: Playwright Test starts a Vite dev server on its own port and drives the app against the throwaway test Jellyfin (`tools/testserver/`). Tests assert behavior (URLs, focus, ARIA state, server state), never pixels.

- **Projects.** `playwright.config.ts` defines the projects; `e2e/projects.ts` holds their browser profiles.

  | Project | Tag | Browser |
  |---|---|---|
  | `desktop` | `@desktop` | Chromium 1440×900, mouse and keyboard |
  | `keyboard` | `@keyboard` | Chromium 1440×900, keyboard only: any pointer event fails the test |
  | `phone` | `@phone` | Chromium 390×844, touch, mobile user agent |
  | `writes` | `@writes` | Chromium, own session: tests that change server state and restore it |
  | `firefox`, `webkit` | `@engines` | Firefox and WebKit at 1440×900: a smoke subset |
  | `iphone` | `@iphone` | WebKit 390×844 with touch and an iPhone user agent: a touch smoke subset |
  | `setup` | none | signs in once per project and saves the session; every project depends on it |

- **Tags.** Every test lists the projects it runs in with tags; a test without a tag runs nowhere. Setting `E2E_ENGINES_ALL=1` makes the Firefox and WebKit projects run every desktop test and the iPhone project every phone test, for a full compatibility pass.
- **Run isolation.** Two runs on one machine must not share a port. `E2E_PORT` gives a run its own dev-server port, Vite cache, output folder and device ids, so parallel runs do not overwrite each other's saved sessions or revoke each other's tokens. Within a run, each project and worker has its own device id.
- **Shared checks.** A fixture fails any test that produces a console error, a page error, a failed request or an HTTP status of 400 or more, except for listed, explained exceptions (`e2e/fixtures/guard.ts`).
- **Server state.** Read-only tests look subjects up through the API at test time. Tests that write are tagged `@writes`, snapshot what they change and let a fixture restore it. Live TV writes and Seerr requests are answered by the test itself and never reach a server.
- **The Live TV guide renews itself.** The test server's guide is an XMLTV file of dated programs (`tools/testserver/guide.mjs`: four channels, half-hour programs for 8 days from six hours before "now"), so it runs out. `node tools/testserver/setup.mjs guide` (`npm run ts:guide`) writes a new one into the container and has Jellyfin read it when the current one no longer reaches two days ahead; the e2e global setup (`e2e/global-setup.ts`) runs it by itself when the guide does not reach 3 hours ahead, and `npm run ts:verify` reports a guide that does not reach the next 24 hours.
- **A fresh server.** `npm run ts:reset` returns the test server to its seed. On Jellyfin 10.11 a freshly wiped server answers `/System/Info/Public` while its startup page still answers everything else with 503; `waitForServer` in `tools/testserver/setup.mjs` therefore also waits for another address to stop answering 503 before provisioning (commit `bc93855`, on `main` right after `e1b7e04`). While a freshly reset Jellyfin fills its image cache for the first time it can answer a few image requests with 500 (its log shows "Response Content-Length mismatch"); the shared guard fails a test on those, and the guard was deliberately not loosened for them, so the first full run after a reset may fail on that alone ([DECISIONS.md](DECISIONS.md) T-50). The same addresses answer 200 afterwards.
- **Touch gestures.** Playwright's own touchscreen can only tap. Where a test needs a finger that moves, the fixture's `app.touchDrag(from, to, { steps, holdMs })` (`e2e/fixtures/app.ts`) sends a real one-finger gesture through Chromium's debugging protocol, so the browser itself decides whether the finger pans the page or the page gets the pointer events; it throws in any other engine. WebKit and Firefox cannot be sent a moving touch: tests there dispatch touch pointer events on the element and assert the computed `touch-action`.
- **Drawn order.** `app.drawnText(locator)` returns an element's characters in the order they are drawn, left to right, which is how the right-to-left value tests see "25." where the text content says ".25".
- **Quiet.** Every browser is headless and muted; `tools/quiet-playwright.mjs` enforces that whatever a script asks for.
- **Real server.** One spec (`discover`) signs in to a real Jellyfin and Seerr with a limited test account, read-only, and is skipped when that account is not configured.
- **Motion.** The fixture runs every test with reduced motion and a stylesheet that removes every animation and transition, so a passing test says nothing about how an animation looks. A test about motion changes that for itself: the "with animations on" group of `settings.spec.ts` sets reduced motion to no-preference (the stylesheet stays, so it asserts which animations start and what the cover does, not how they look), and the volume slider's transition test of `playback-layout.spec.ts` and one test of `context-menu.spec.ts` also remove the stylesheet. How an animation looks is judged from recorded frames at normal speed before the change is shown ([DECISIONS.md](DECISIONS.md) T-62; [TOOLING.md](TOOLING.md) section 12).
- **Real scrollbars.** Playwright hides scrollbars by default, where layout that depends on the room a scrollbar takes cannot be tested; `grid-stability.spec.ts` starts its own browser with them (still headless and muted).
- **The player's dev hook.** The layout tests put the control strip into states a test item does not have through `window.__playback` (section 14.4), which exists in development builds only.

The suite had 250 tests across the seven projects at `7ad52ba` (221 before the polish round, 239 after it, 245 after the closing round's two right-to-left tests in three engines, 250 with the touch fix's three tests in five runs), and the lead's run there had 250 of 250 passed, in 4.4 minutes. With the interface-scale tests and the tests of the player layout and of direct play it had 267 at `bf31148`, where the lead's last run, alone, had 267 of 267 passed in 5.0 minutes. Four spec files and further tests came after that (grid stability, sliders with a mouse, subtitle direction, the subtitle style sheet, and the Settings panel, sign-in and series tests of 2026-11-23); the current count was not taken for this page, `npm run e2e:list` prints it, and the coverage table of `e2e/README.md` lists the behaviours. Before the second public release (2026-11-24) the whole suite ran on the release tree in all seven projects, Firefox and WebKit included: 336 tests, 334 passed; the two failures were faults of two Settings tests on WebKit, repaired in `e9b96bf` ([PROJECT-LOG.md](PROJECT-LOG.md) phase 35). For each change before that the browser tests of the changed area were run when the change was made (T-63). The results of the earlier runs are in [STATUS.md](STATUS.md).

### The screenshot crawler (`tools/shots/`)

`tools/shots/README.md` is the full guide. `npm run shots` walks every scene in `tools/shots/scenes.ts` in each viewport (desktop, laptop, tablet, phone) and each of the 8 themes, takes a picture, and writes a contact sheet and a health report: console errors, failed requests, horizontal overflow, broken images, unexpected redirects and settle timeouts. Every route has at least one scene. A picture is taken only once the page has settled (network quiet, fonts and images loaded, nothing marked `aria-busy`, layout stable); there are no fixed sleeps. `--rtl` runs it in Hebrew, `--engine` in Firefox or WebKit.

Scenes that click or type before their picture (`prepare` steps) find controls by their names in the run's language: `uiText(lang, key)` and `uiPattern(lang, key, …)` in `tools/shots/uiText.ts` read the app's own locale files under `src/i18n` (keys are the upstream Android string names) and return the text as the app shows it, with the app's own rule for an English fallback in a right-to-left language (wrapped in a left-to-right isolate, as `ltrFallback` does). A key the app does not have throws, so a renamed string fails loudly instead of matching nothing. The same scenes therefore work in the English and the Hebrew run, and `src` carries no data attributes for the crawler.

Not run on the final tree: the full 8-theme crawl and the laptop viewport. The last runs recorded in the merge notes, in the polish round, used one theme with the desktop and phone viewports, in English and in Hebrew: 390 pictures each, none with a warning or an error, one scene skipped for lack of data ([final-merge-notes.md](final-merge-notes.md) section 13.6; before the string lookup the Hebrew crawl had 84 warnings).

### The reference comparison

`tools/refshots/` runs the real Android TV app in a headless emulator against the throwaway test server and saves reference pictures. `npm run shots:compare` crawls the TV-canvas scenes of `tools/shots/tvScenes.ts` and writes a page with the TV picture on the left and the web picture on the right.

- **The TV canvas.** Every scene there is `compareOnly` (crawled only in compare mode or when named with `--scene`) and runs in a 1920x1080 window with the interface-scale preference at 160 %, which makes the root scale 2: the page is laid out on 960x540 dp, and 1 dp is 2 picture pixels, as in the reference pictures.
- **Driven like the TV.** The scenes press real arrow keys from the page's own initial focus, written like the reference manifest (`"left down*3 enter"`), so the focused look and the scroll position are the app's, not the script's. Items are looked up by the names of the test server's fixtures; a scene is skipped on a server without them.
- **The reference map.** `tools/shots/refmap.ts` pairs every reference picture with a scene (244 pictures, 208 scenes; several references share a scene where the TV pictures show the same state), with a note where the web differs on purpose or by data.

There is no pixel diffing between the TV and the web: a person compares them. The last recorded compare run (208 scenes, headless Edge) had 208 ok, 0 warnings, 0 errors ([final-merge-notes.md](final-merge-notes.md) section 13.6). What still differs is listed in [parity-notes.md](parity-notes.md) section 6; the polish round settled its items 2, 3 and 7 (section 13.3 of the merge notes).

**The reference pictures are missing at the moment.** `refshots/out/` in the main checkout was emptied by accident on 2026-11-18, when finished worktrees were removed ([TOOLING.md](TOOLING.md) sections 8 and 14). Until `tools/refshots` has captured the 244 pictures again, the compare page has no TV side; the new capture is still owed on 2026-11-24 ([DECISIONS.md](DECISIONS.md) T-57). The tool and the reference map are unchanged. The player scenes of `tvScenes.ts` were changed in `bf31148` for the new layout: they find the buttons in the control strip, and the chapters and queue scenes open the panels with H and Q, so those pictures will differ from the TV's by design.

### CI (`.github/workflows/ci.yml`)

One job runs `npm ci`, `npm run typecheck`, `npm run e2e:typecheck`, `npm run test`, `npm run lint` and `npm run build`. A second job builds the Docker image without pushing it. The end-to-end suite and the crawler are **not** run in CI: they need a Jellyfin server and browsers. The workflow has run on GitHub and succeeded on `c358a52` and on `7ad52ba`; its results on later commits are not recorded on this page.

---

## 18. How to add a screen

Example: a new full-screen page "Queue" at `/queue`.

1. **Page component.** Create `src/features/<feature>/QueuePage.tsx` with a **default export** (route pages are the only default exports). Co-locate `QueuePage.module.css`. Write sizes in px as dp, colors as `var(--c-…)` or `var(--fx-…)`, and text styles with `t-*` classes.
2. **Route.** Add one line to `src/app/routes.tsx` in the right layout: inside the `AppShell` children for a drawer page, or inside the `FullScreenLayout` children for a full-screen one:
   ```tsx
   { path: 'queue', ...page(() => import('../features/music/QueuePage')) },
   ```
   Also add a row to the table in the file's header comment, naming the upstream screen.
3. **Path builder.** Add `queue: () => '/queue'` to `nav` in `src/app/nav.ts`. `useNav()` picks it up on its own, so callers write `go.queue()`.
4. **Data.** Read with TanStack Query, using `useApi()` for the SDK and `qk('queue', …)` for the key. For a single item use `itemKey(id)`. If item actions should refresh this query, add `meta: itemQueryMeta(...)`.
5. **Strings.** Use `t('upstream_string_name')`. If upstream has no such string, add a `web_…` key to `src/i18n/extra/en.json`.
6. **Input.**
   - Use kit components; they are already real buttons or links and focusable.
   - Mark custom focusable elements with `data-focusable`, and group rows with `data-focus-group`.
   - Style the focused look with the two-selector pattern of section 11.2, never with a bare `:hover` or `:focus-visible`.
   - Use `useItemContextMenu()` for item cards and render `menu.element` once.
   - If the page focuses its first element when data arrives, ask `mayTakeInitialFocus()` first.
   - Use `useScrollRestore(key)` on inner scroll containers, and `data-focus-key` on elements whose position in the page can change.
   - If the page has its own Back control, call `useHideBackButton()`. A shell page that a drawer entry leads to gets no Back button by itself (`isDrawerDestination()`, section 6).
   - Call `submitBackdrop()` or `clearBackdrop()`.
7. **If the page is one kind of library or item** rather than a new URL, do not add a route. Add a case to the dispatch in `CollectionFolderPage.tsx` or `MediaItemPage.tsx` (section 6) and export a pure `xxxPageFor(item)` function from the feature.
8. **Check.** `npm run typecheck`, `npm run test`, then add a scene to the crawler (`tools/shots/scenes.ts`) and, for behavior worth protecting, a spec in `e2e/specs/` (see "Adding a spec for a new area" in `e2e/README.md`).

## 19. How to add a preference and a settings row

1. **Upstream preference.** Add it to `docs/spec/preferences.json` with its id, type, default, options, `titleKey`/`summaryKey`, `screens` and `classification` (`web`, `web-adapted` or `android-only`).
   **Web-only preference.** Add it to the `WEB_ONLY` array in `tools/gen-preferences.ts` instead, as `WebInterfaceScale` is.
2. Run `npm run gen:preferences`. This regenerates `src/stores/preferences.gen.ts`: the type, default, scope and settings metadata appear on their own. Do not edit the generated file. Durations are stored in milliseconds when `storedUnit` is `ms`.
3. Add any new label strings: upstream ones come with `npm run gen:strings`, web ones go in `src/i18n/extra/en.json`.
4. **Read it** where it matters, with `usePrefs('newKey')` or `getPref('newKey')`. If it has a global effect (like theme or scale), add a branch to `bindPreferenceEffects()` in `src/app/applyPreferences.ts`. If changing it must also change another preference, add that to `withSideEffects()` in `src/stores/preferences.ts`.
5. **The settings row appears on its own.** The settings screens are built from `PREFERENCE_META` and `PREFERENCE_SCREENS`, so a preference with a `screens` entry and a standard widget (switch, choice, multi-choice, slider, string) needs no settings code.
6. **When the row needs more than the metadata carries**, edit `src/features/settings/prefModel.ts`: a slider's unit conversion or summary text, the mark for a slider whose value re-lays out the page (`RELAYOUT_SLIDERS`, section 10), a validator, a visibility rule (for example "only on an HDR display"), or the destination of a row that opens another screen.
7. **When the row is a special control** (a picker with a preview, a dialog with its own flow), write a component in `src/features/settings/` and add a case for the preference in `PreferenceRow.tsx`, as `ThemePreference` and `QuickConnectPreference` do. A row that is not a preference at all, such as Sign out, is passed to `PreferenceList` through `extraRows` by the page.
8. Run `npm run test`; `tools/gen-preferences.test.ts` and `src/features/settings/prefModel.test.ts` cover the generator and the screen model.

## 20. How to add an item-menu action

The item menu is shared by every page that shows Jellyfin items (section 7).

1. **The entry.** Add it to `buildItemMenu` in `src/features/common/itemMenu.tsx`, in upstream's position (`ContextMenu.kt` is the reference) and with upstream's condition. If the condition depends on the page, add a field to `ItemMenuOptions` so a page can pass it to `useItemContextMenu()` or `cardActions()`. Extend `itemMenu.test.tsx`.
2. **If the action is navigation or an item mutation**, do it in the entry: navigate with `nav.*`, or call the functions of `useItemActions()`.
3. **If the action needs a screen or dialog owned by another feature:**
   1. Add a field to `ItemMenuHandlers` in `src/features/common/itemMenuHandlers.ts` and a placeholder to `defaults` with `placeholderAction('<label key>')`. Until a real handler is installed, the entry shows a "not available yet" toast instead of failing silently.
   2. Call `getItemMenuHandlers().yourAction(item)` from the menu entry.
   3. In the owning feature, install the real handler once with `setItemMenuHandlers({ yourAction })`, from a component that is mounted whenever a user is signed in, or from `src/app/startup.ts` when the action needs no UI. If you install it from an effect, return the function `setItemMenuHandlers` gives back as the cleanup; it restores only your own keys.
   4. If the dialog should be available app-wide, add a kind to `OpenItemDialog` in `src/features/detail/common/itemDialogs.ts` and render it in `ItemDialogsHost.tsx`.
4. **Music items** have their own menu. An action for albums, artists or songs goes in `src/features/music/menu/musicMenu.tsx` instead (or as well).

---

## 21. Generated files: do not edit by hand

| File | Generated by | Source |
|---|---|---|
| `src/theme/tokens.css` | `tools/gen-tokens.mjs` (`npm run gen:tokens`) | `docs/spec/design-tokens.json`, plus the fixed colors listed in the generator |
| `src/theme/typography.css` | `tools/gen-tokens.mjs` | `docs/spec/design-tokens.json` |
| `src/theme/themes.gen.ts` | `tools/gen-tokens.mjs` | `docs/spec/design-tokens.json` |
| `src/stores/preferences.gen.ts` | `tools/gen-preferences.ts` (`npm run gen:preferences`) | `docs/spec/preferences.json` + `WEB_ONLY` |
| `src/i18n/locales/*.json`, `src/i18n/locales/index.ts` | `tools/gen-strings.ts` (`npm run gen:strings`) | upstream `strings.xml` in `reference/` |
| `src/features/settings/licenses.gen.json` | `tools/gen-licenses.ts` (`npm run gen:licenses`) | production dependencies in `package-lock.json`, plus bundled assets |
| `src/features/settings/upstream.gen.json` | `tools/gen-licenses.ts` | the upstream commit in `reference/`, when present |

`npm run gen` runs all four generators in order (tokens, strings, preferences, licenses). All outputs are committed, so a fresh checkout builds without the upstream source. To change a value, change the source and regenerate. Hand-edited outputs are overwritten on the next run. After merging branches, regenerate instead of resolving conflicts in these files by hand.

---

## 22. Two mechanisms and open points

Places where the code has two ways of doing one thing, or a known gap. Each is a fact about the code as read for this page; the decisions are tracked in [DECISIONS.md](DECISIONS.md) Part 4 and [final-merge-notes.md](final-merge-notes.md) sections 5, 7, 8.8, 11.4, 12.7 and 13.7. The entries added on 2026-11-24 come from the commits after `7ad52ba` and the lead's record, and name their section here.

**Two mechanisms for one job**

| Topic | The two mechanisms | Reference |
|---|---|---|
| Hiding a page's header | Library browsing (and everything on `LibraryGrid`: the music library tabs and the recording folders) hides the tab row once the content is **scrolled** (`onScrolled` in `LibraryGrid`, `RecommendedTab` and `RecommendedMusic`). Discover and photos hide it only while **keyboard focus** is below the first row (`useHeaderOnFirstRow` in `src/features/common/`). The Live TV page applies the focus rule to the guide with a check of its own (`LiveTvView.tsx`, from the guide's focused row) and the scroll rule to its recording-folder tabs. Choosing one changes how the other features behave | Q-24 |
| Grids | Browse's `LibraryGrid` is shared by most pages, the music library included. The photo grid (`PhotoFolderView`) is a separate implementation with its own letter column; photos also keep their sort, filter and view options under their own storage key, and have their own paging hook (`src/features/photos/usePagedItems.ts` beside `src/features/browse/data/usePagedItems.ts`) | Q-31 |
| Item menus | The shared item menu (`src/features/common/itemMenu.tsx`) and the music menu (`src/features/music/menu/`). The shared menu does not offer Play on a music album or artist | merge notes 5 |
| PIN entry and server-version check | `src/features/setup/` and `src/features/settings/` each have their own `PinEntry.tsx` and `SetPinFlow.tsx` (the server-version check was duplicated too and is now one file, `src/lib/serverVersion.ts`) | read in the code |
| Focus below the page | The mini player handles Down and Up itself, because it sits outside the shell's page area, which is a focus trap; Home hands Down from its last row to the bar itself (`src/features/home/HomePage.tsx`); the shell adds the case of a settled page with nothing to focus (`focusFromNowhere()` and `leaveBarToPage()` in `src/app/shell/shellFocus.ts`, section 11.4). These rules name the mini player; the shell still has no general rule for bars below the page | Q-32 |
| Focus return when an overlay's opener is gone | The kit's `Dialog` and `DropdownMenu` close through `restoreFocusToOpeners()`, which hands a lost focus to the shell's recovery (section 11.5). The player's `PlayerSheet` and the photo viewer's `ImageFilterDialog` and `ViewOptionsPanel` use the older `restoreFocus()`. The closing round probed them and found that this is right as it is: the view options panel and a player sheet opened with the controls shown keep their opener through resizes, and the other cases (the filter dialog, a sheet opened while the controls are hidden) close onto `<body>`, which is the idle state of those full-screen pages, whose keys act without a focused element. The shell's recovery must not be used there: it knows shell pages only, and it would put focus on a control that Enter then presses | merge notes 13.7, 14.1 |
| Left-to-right isolates in plain strings | `ltrFallback` in `src/i18n/index.ts` (untranslated strings), `isolate` in `src/features/discover/seerrText.ts`, and `ltrValue` in `src/features/playback/ui/text.ts` (values in toasts) each wrap text in isolate characters; section 12 says which to use for a value | merge notes 14.4 |
| Duplicate strings | `web_previous` / `web_next` and `web_playback_previous` / `web_playback_next` both exist in `src/i18n/extra/en.json` | merge notes 5 |
| Back button on a full-screen page | `FullScreenLayout` shows a floating Back button that a page hides with `useHideBackButton()`; on the Settings routes the layout never shows it and `SettingsLayout` places its own, in one of two places, by measured room (sections 6 and 14.5) | read in the code |
| "Is this a Settings route" | `isPanelPath()` in `src/app/shell/pageSnapshot.ts`, used by `AppShell` and `FullScreenLayout`; `SettingsLayout.tsx` writes the same pattern again for its `visiting` flag | read in the code |
| Subtitles raised for the controls | text cues get a larger bottom margin and the PGS layer is moved as a whole, both by the strip's height; ASS is drawn where the script puts it (section 14.4) | read in the code |

**Known gaps in behavior**

- A Live TV program card in search plays its channel; upstream opens the program dialog. The extension point exists and nothing registers it (section 14.3).
- Recording and timer writes have never run against a real server (section 14.7).
- Remote control over Jellyfin's websocket is not implemented (section 14.4); the owner does not require it ([DECISIONS.md](DECISIONS.md) O-30).
- DVD (VobSub) and DVB subtitles are burned in by the server; only PGS has a renderer in the browser (section 14.4).
- Sound the browser cannot decode (AC-3 and E-AC-3 in most browsers, DTS, TrueHD) is converted by the server, with the video copied; there is no decoder in the app (section 14.4).
- The copy of the page behind Settings does not follow a window resize, a change of interface scale or a change of language made inside Settings; the music mini player is not in it; pictures that had not loaded when it was taken are empty in it (section 13).
- After Back to a "View more" grid in a short window the window's scroll position is not restored. Seen while the Settings panel was reviewed and also without Settings, so it predates that work; not looked into yet.
- The note of the player's subtitle style sheet for subtitles that cannot be restyled was tested by setting the subtitle kind through the dev hook, not with real image, ASS or burned-in subtitles; the player's compact Settings sheets were not reviewed at phone width (section 14.4).
- The Discover drawer entry is not highlighted when a Discover URL is opened directly; the merge notes record this as open, and it was not re-checked for this page.
- Web-only strings exist in English only (Q-23).
- The library grid builds its cards anew on every column-count change (twice per window shrink); the shell's recovery puts focus back (section 11.5), but keeping the cards would remove the loss at its source (merge notes 13.7).
- The slots of `ListItem` that hold element children, and the Live TV view-options title, still trim with `t-trimBox` (`text-box`), so they keep full line boxes in Firefox 128 (section 9).
- Resizing a scrolled grid in several steps can raise the window error "ResizeObserver loop completed with undelivered notifications". The list library (`@tanstack/react-virtual`) renders synchronously inside its own row observer when a measured row comes with a scroll correction; that changes the grid container's height again in the same frame, and `CardGrid` watches that container for its width (`src/ui/rows/CardGrid.tsx`). Nothing is visible on screen. The app's own log records window errors (`src/features/settings/clientLog.ts`), so each occurrence is one error line on the Debug page and in sent app logs (merge notes 14.1).
- Home's probe for the optional Wholphin server plugin (`GET /wholphin/public`, `src/features/home/model/homeSettings.ts`) is answered 404 by a server without the plugin, and the browser logs that 404 in its console. That line is expected, not a defect (merge notes 14.1).
- A finger's swipe that starts more than 10 dp sideways on a slider and then goes up is taken by the slider (section 10). Touch as a whole has been tried on real hardware once, by the owner on a phone; the slider and handle rules of section 10 were run with real touch gestures in Chromium only.
- Upstream's companion server plugin (server-provided Seerr address, server-side Home settings) is not supported beyond Home's probe for it (Q-20).

**Open questions that touch the structure**

- PINs are stored as plain text (Q-16).
- Whether signing out of Jellyfin should sign out of Seerr, and where a Seerr API key should live (Q-6, Q-7).
- The default of `TRUST_PROXY` (Q-9), and reloading after a redeploy removed a code chunk (Q-10).
- The fixed colors that exist only in the token generator, not in the spec file (Q-30).
- No longer open: the placement and icon of the web-only volume control in the player (Q-34, settled). The icon stays a speaker and the audio-track button became a music note (`6c14670`, O-32); since `255bff6` the control is the last button of the left group, its slider opening at the right (section 14.4; O-37, T-60).
- View options (card size, columns, spacing, text under a card) are kept per library (section 7). The owner's answer that they should be one setting for every library (O-36) is not built; offered as the next item on 2026-11-24, it was set aside (O-44).
- Defaults that the owner of a deployment sets for all its users (the first example: the interface language) are wanted and not built. Serving such a setting through `/config.json` (section 15) is the lead's idea, not agreed (O-31).
- `CLAUDE.md` describes preferences as per user; most are per browser (Q-18).
- Apache-2.0 components in a GPL-2.0-only project (Q-22). The owner's answer is the additional permission in the root file `LICENSE-EXCEPTION.md`; section 2 names the components.

**Not established from the code for this page**

- Voice search with a real microphone through the production server (section 15: the `Permissions-Policy` header allows the microphone for the app's own origin).
- The component READMEs can lag the code; where a README and the code disagreed, this page follows the code.
- Counts (preference keys, strings, unit tests) are snapshots of `main` at `509db33`, or of an earlier tree where a section says so; the end-to-end count is of `bf31148` (section 17). The file names in this page were checked against `c358a52`, those of the parts added by the closing round and the touch fix against `7ad52ba`, and those of the parts this update added or changed (sections 6, 10, 13, 14.2, 14.4 and 14.5) against `509db33`. Nothing was run for this update: it was written from the commits, the source and the lead's record of the checks.
- How the Settings panel's opening and the return to the page look in motion is not established by the browser tests: they run under the suite's no-animation stylesheet and assert which animations start and what covers the page. The rule to judge motion from recorded frames (T-62) came out of this work, and the owner accepted the result on the trial (O-40).
- The stylesheets were checked for `:dir()` and `text-box` by reading and by the guard test, not in a real Chrome 119 or Firefox 128 (section 16).
- The queued Back key in a production build was checked with `vite preview` in Chromium (20 of 20), not behind the Hono server or in the Docker image ([final-merge-notes.md](final-merge-notes.md) 13.1, 13.7).
- Resize recovery with a card that the shrink drops from the rendered range while the keyboard is in charge, and in Hebrew: unit-tested only (merge notes 13.7).
