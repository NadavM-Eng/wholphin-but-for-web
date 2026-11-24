# Wholphin Web — working agreement for every agent

Wholphin Web is an unofficial web port of [Wholphin](https://github.com/damontecres/Wholphin), the Android TV client for Jellyfin. Goal: the same look, colors, structure and features as the TV app, adapted to browsers (mouse, keyboard, touch; fluid layout instead of a fixed TV canvas). License GPL-2.0-only, same as upstream.

## Sources of truth, in order

1. The upstream Kotlin source in `reference/wholphin/` (git-ignored, read-only; never edit it, never run gradle or anything from it). Main code: `reference/wholphin/app/src/main/java/com/github/damontecres/wholphin/` (called `W/` below).
2. The extracted specs in `docs/spec/` (`01-design-system.md`, `02-shell-navigation-home.md`, `03-browse-and-detail.md`, `04-livetv-music-photos-discover.md`, `05-playback.md`, `06-settings-data-setup.md`, `07-jellyfin-api-inventory.md`, `design-tokens.json`, `preferences.json`). Specs are summaries: when a spec and the Kotlin disagree, or the spec marks something "unverified", read the Kotlin and follow it.
3. This file for how the web code is organized.

Port behavior faithfully. Where upstream has an obvious bug (specs list several), fix it and leave a one-line comment naming the upstream file.

## Stack

Vite 8, React 19, TypeScript 7 (strict, `erasableSyntaxOnly`: no enums, no parameter properties; use `as const` objects and union types), React Router 8 (library mode, `createBrowserRouter`), TanStack Query 5, TanStack Virtual, Zustand 5, `@jellyfin/sdk` (generated axios client), i18next, hls.js, jassub, CSS Modules. Tests: Vitest (+ jsdom) for logic, Playwright for the screenshot crawler. Node 24, npm (not pnpm/yarn).

Do not add dependencies without a clear need; never add a UI kit, Tailwind, or a CSS-in-JS library.

## Layout of `src/`

| Path | Owns |
|---|---|
| `src/app/` | entry, providers, router (`routes.tsx`), `AppShell`, nav drawer, backdrop, global key handling |
| `src/api/` | Jellyfin client/session wiring, image URLs, shared query helpers, Seerr client (`src/api/seerr/`) |
| `src/stores/` | Zustand stores: servers/users/session, preferences, playback choices |
| `src/i18n/` | i18next init, `locales/*.json` (generated from Android `strings.xml`) |
| `src/theme/` | generated `tokens.css`, `global.css`, typography classes, theme switching |
| `src/ui/` | shared presentational components (buttons, cards, rows, dialogs, tabs, inputs, spinner…) |
| `src/features/<name>/` | one folder per feature: `setup`, `home`, `browse`, `detail`, `search`, `playback`, `discover`, `settings`, `livetv`, `music`, `photos` |
| `src/lib/` | pure helpers (formatting, time, ids) with unit tests |
| `tools/` | Node/TS scripts: token + string generators, screenshot crawler, reference-shot capture |
| `server/` | small Hono server for production: serves `dist/`, proxies Seerr (and optionally Jellyfin) |

**Finding things.** `docs/CODE-MAP.md` says which file is responsible for what a person sees or does in the app ("Where is … ?"), lists every screen with its page file, every `data-*` marker with the files that set it, and every file of `src/` with a line about it. Look there before searching the tree. It is generated: `npm run map` writes it, and `npm run test` fails when it is out of date, so run `npm run map` after adding, moving or renaming a file or changing the comment at its top. When you add something a person can see, or had to search for something the map did not lead you to, add a row to `tools/code-map/where.json`. Start every new file with a comment that says what it is in one sentence: that sentence is its line in the map.

Stay inside the paths your task assigns. If you need something from another area (a new shared component, a store field, a route), add the smallest thing that works in the owning folder and say so in your final report; do not restructure code you do not own. Several agents work in this tree at the same time.

## Conventions

**Units.** Write CSS in `px` where 1px = 1 Android dp/sp from the specs. PostCSS converts px to rem at build time and the root font size carries the interface scale, so never hardcode sizes in JS; when JS needs a pixel size (virtualizer row heights, canvas math) use `useDp()` / `dp(n)` from `src/theme/scale`. A true hairline that must not scale is written `1PX`.

**Colors.** Only through CSS variables generated from `design-tokens.json`: `var(--c-primary)`, `--c-on-primary`, `--c-surface`, `--c-on-surface`, `--c-surface-variant`, `--c-border` (the accent/focus color), etc. (kebab-case of the Material role name), plus `--c-surface-1` and `--c-surface-3` (surface at elevation 1dp/3dp) and fixed colors as `--fx-*`. The theme is set by `data-theme="PURPLE|BLUE|…"` on `<html>`. Never write a theme hex in a component.

**Type.** Use the classes from `src/theme/typography.css`: `t-displayLarge … t-labelSmall` (Material 3 scale), composed in CSS Modules with `composes: t-bodyMedium from global;` or applied via `className`.

**Focus = hover = keyboard focus.** The TV app's "focused" look applies on `:hover` and `:focus-visible`. Every interactive element is a real `<button>`/`<a>` (or has role + tabIndex) and reachable by Tab; arrow-key spatial navigation is provided globally by `src/app/spatialNav` for elements marked `data-focusable`. Long-press/Menu on TV = right-click (context menu) and a visible "more" affordance on touch.

**Layout.** Fluid: rows scroll horizontally (wheel/drag/arrow buttons on hover), grids reflow with the window, pages scroll vertically. Must work from 360px-wide phones to ultrawide. RTL locales (he, ar) must not break: use logical properties (`margin-inline-start`, `inset-inline-end`, `padding-inline`) instead of left/right.

**Data.** All server reads go through TanStack Query hooks. Query keys start with `[serverId, userId, …]` (use `qk()` from `src/api/queryKeys`). Get the SDK instance with `useApi()` from `src/api/session`; do not construct axios or fetch Jellyfin URLs by hand except for media/image URLs via `src/api/images` and playback URL builders. Mutations invalidate the narrowest keys that changed.

**Preferences.** Read/write through `usePrefs()` / `setPref()` in `src/stores/preferences`; keys and defaults are generated from `docs/spec/preferences.json`. Persisted per user in localStorage. Android-only preferences are omitted from the UI.

**Strings.** No literal user-facing English in components: `const { t } = useTranslation()` and `t('android_string_name')`. Keys are the upstream Android string names; positional args become `{{p1}}`, `{{p2}}`; plurals use i18next `count`. A string that upstream does not have goes in `src/i18n/extra/en.json` under a `web_` prefixed key.

**Routing.** Routes are declared only in `src/app/routes.tsx`; feature folders export page components (lazy-loaded). Navigate with typed helpers from `src/app/nav.ts` (`nav.item(id)`, `nav.play(id, opts)`…), not hand-built strings. Browser Back replaces the TV Back button; pages must restore scroll position and focused row on Back.

**Components.** Function components, named exports, one component per file, co-located `Name.module.css`. No default exports except lazy route pages. No `any`; no `// @ts-ignore`. Keep comments for constraints the code cannot show.

## Commands

```bash
npm run dev          # Vite dev server on http://localhost:5173 (proxies /seerr-proxy to DEV_SEERR_URL)
npm run typecheck    # tsc -b, must pass before you report done
npm run test         # vitest run
npm run lint         # oxlint
npm run gen          # regenerate tokens.css, preferences, locales from docs/spec + reference
npm run map          # regenerate docs/CODE-MAP.md (which file is responsible for what)
npm run shots        # Playwright crawler: screenshots of every route into shots/out/
```

Local test settings live in `.env.local` (git-ignored): `VITE_DEV_JELLYFIN_URL`, `DEV_SEERR_URL`, `TEST_JELLYFIN_URL`, `TEST_JELLYFIN_USER`, `TEST_JELLYFIN_PASSWORD`. Never print, commit, or paste these values anywhere.

## Documentation

The owner wants the whole project documented so it can be reviewed at the end. `docs/README.md` is the index. The set: `docs/PROJECT-LOG.md` (what was done, in order), `docs/DECISIONS.md` (who decided what and why), `docs/ARCHITECTURE.md` (how the code is organized), `docs/DEVIATIONS.md` (every difference from the TV app: adapted, not ported, upstream bugs fixed, web-only additions), `docs/TOOLING.md` (tools and commands), `docs/STATUS.md` (what works right now), `docs/spec/` (behavior extracted from upstream).

Builders do not edit these files (parallel edits collide). Instead, your final report must list, precisely enough to paste into them: every deviation from upstream you introduced (TV behavior → web behavior → why → file), every upstream bug you fixed instead of copying, every decision you made where the spec was ambiguous, any new command/script/env key, and what you verified versus what you did not. The lead folds reports into the docs after each wave; raw briefs and reports are archived locally with `node tools/archive-agent-logs.mjs`.

The docs go public with the repo: no credentials, account names, email addresses, real server addresses or machine-specific absolute paths in them.

## Hard rules

- **Never fill the disk.** Do not create anything on the servers that keeps writing data on its own: no Live TV recordings or recording timers (one test recording filled the disk), no long-running transcodes left behind, no downloads of large media. Anything you generate stays small (clips of seconds, images) and inside git-ignored project folders; if a step could write more than about 1 GB, stop and report instead.
- **Go easy on the development machine.** The machine is in use while you work. Run one dev server and one browser at a time, close each as soon as you are done, and never leave watchers, servers or browsers running between steps. Play one video at a time; keep media tests short (seconds, not minutes) and stop the playback session when done so the server stops transcoding. On the real Jellyfin keep transcodes to the minimum a check needs (it serves other people); do codec-heavy work on the throwaway server, which is CPU-capped. Do not run the full crawler, a Docker build, or the whole test suite more often than your task needs.
- **No sound and no windows on the development machine.** This machine is in use while you work. `tools/quiet-playwright.mjs` (postinstall) patches Playwright so every launch is headless and muted, whatever a script asks for; do not work around it and do not set `WW_ALLOW_HEADED`. Still write `headless: true` and `args: ['--mute-audio']` in every `launch()`; for Firefox also set `firefoxUserPrefs: { 'media.volume_scale': '0.0' }`. Use `channel: 'msedge'` or `'chrome'` in headless mode when a test needs real codecs; if something only works in a visible window (for example hardware HEVC decoding), record it as "not testable headless" instead of opening one. Never open a visible browser, emulator window, system player, file explorer or any other window; never start an emulator without `-no-window -no-audio`; never change system volume or settings. Assert audio with code (decoded bytes, Web Audio analyser), not by listening.
- A real Jellyfin and Seerr that other people use may be reachable at the configured addresses (by default `localhost:8096` / `localhost:5055`). Read-only use with the test account is fine. Do not change server settings, do not delete or edit media, and do not mass-mark items played. The test account has no auto-approve permission in Seerr, so a request it submits stays pending and starts no download: submitting one is allowed when a test genuinely needs the full request flow, but keep it to the minimum, use an obviously obscure title, withdraw/cancel it right after, and list every request you created in your report. Never sign in to Seerr or Jellyfin as anyone other than the test account.
- Do not touch Caddy, Docker containers you did not start, or anything outside this repository folder (other than your temp/scratch dir).
- Do not `git commit`, `git push`, or change branches; the lead does that. Do not edit `CLAUDE.md`, `package.json` dependencies, or files outside your assignment without saying so in your report.
- Before reporting done: `npm run typecheck` and `npm run test` pass, and you have looked at your screens in a browser (or via `npm run shots`) rather than assuming they render. Report what you verified, what you did not, and any spec ambiguity you resolved and how.
