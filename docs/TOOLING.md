# Tooling

This document lists every tool, script, command and environment key that a developer or a reviewer of Wholphin Web needs: what each one is for, how to run it, and what is known to work.

Last updated: 2026-11-24

Related documents: [README.md](README.md) (index), [PROJECT-LOG.md](PROJECT-LOG.md) (chronology), [DECISIONS.md](DECISIONS.md) (decisions), [ARCHITECTURE.md](ARCHITECTURE.md) (structure), [DEVIATIONS.md](DEVIATIONS.md) (differences from upstream), [STATUS.md](STATUS.md) (current state), [deploy.md](deploy.md) (deployment guide), [spec/](spec/) (behavior specs extracted from upstream), [CLAUDE.md](../CLAUDE.md) (working agreement). Tool-level READMEs: [e2e/README.md](../e2e/README.md), [tools/shots/README.md](../tools/shots/README.md), [tools/testserver/README.md](../tools/testserver/README.md), [tools/refshots/README.md](../tools/refshots/README.md).

**How this document was checked.** Every command and flag below was read against `package.json` and the argument parsing of the script it runs. Nothing was started while writing it: no dev server, browser, test run, build, container or emulator. The only things executed were read-only counts (a short script that imports the crawler's scene table and reference table, file counts and folder sizes on disk) and, for the last update, read-only git commands and one listing of the CI runs on GitHub (`gh run list`). Statements about how a tool behaves therefore come from its source, its README and the recorded agent reports, not from a fresh run. Where something was never verified, the text says so, and section 19 collects those points.

**Which tree.** This document was written for `main` at `7ad52ba` (2026-11-18) and brought to `509db33` on 2026-11-24 (next paragraph). The version of 2026-11-18 covers the merged app, the TV-comparison pass, the final check and repair, the backdrop color fix, the two test-server commits `bc93855` (the stricter start-up wait) and `3b1dd7b` (pre-made recordings, section 7), the polish round (merge `f1fb308`), and the two commits after it, `692715f` and `7ad52ba`, which added two helpers to the end-to-end fixtures (section 12). Two things outside the tree changed the same day and are described where they belong: the Android TV reference pictures were lost (sections 8, 9 and 14), and every worktree was removed (section 14). The tool changes of those passes (the TV-canvas reference scenes and the compare sheet, the crawler's `--channel` flag, the license generator's author names, the stricter start-up wait, and the polish round's crawler changes: scenes that find controls in the run's language and Home scenes that wait for their rows) are described in the sections below. Counts are snapshots.

**The update of 2026-11-24.** `main` is at `509db33`. Between `7ad52ba` and it, no npm script, no tool under `tools/` and no environment key was added (`package.json` gained one production dependency, `libpgs`, and nothing else). What did change for tools and commands, each in its section:

- the generators' inputs: a second web-only preference, three more web-only strings on balance, and the license list with `libpgs` (section 3);
- the throwaway test server: a sixteenth Codec Zoo clip, and what the playback engine now does with the Matroska and PGS clips (section 7);
- the crawler's TV-canvas player scenes, changed for the new player layout (section 9);
- the unit tests' last recorded run (section 11);
- the end-to-end suite: six more spec files, a development-only hook for the player tests, a spec that starts a browser with real scrollbars, and how motion is judged (section 12);
- the production image: the commit label and the rollback tags of a go-live (section 16);
- two procedures that are the lead's and have no script in the repository: releases from the private to the public repository (section 20) and the fast path for small changes (section 21).

Nothing was run for this update either: it was written from the commits `7ad52ba..509db33`, the source and the lead's record of the checks.

**Shell.** Commands are written for a POSIX shell (Git Bash works on Windows). Where a command sets an environment variable inline, the PowerShell form is given as well.

## 1. Overview

| Tool | Where | What it is for | Needs |
|---|---|---|---|
| Generators | `tools/gen-tokens.mjs`, `tools/gen-strings.ts`, `tools/gen-preferences.ts`, `tools/gen-licenses.ts` | Turn extracted upstream data into committed source files: CSS theme variables, 42 locale files, a typed preferences store, the license list | Node |
| Dev server | `vite.config.ts` | Serves the app for development, proxies Seerr, hosts the dev sign-in helper | Node |
| Dev sign-in helper | `tools/vite-dev-session.ts`, `src/app/dev/DevLoginPage.tsx` | Signs the app in without anyone typing a password, in development only | `.env.local` |
| Throwaway test server | `tools/testserver/`, `dev/testserver/` | A disposable Jellyfin 10.11.11 in Docker with a fixed library of test media, so tests never write to a real server | Docker |
| Android TV reference capture | `tools/refshots/` | Runs the official Wholphin app in an emulator and saves screenshots of every screen, as the visual reference | Android SDK, the test server, `gh` |
| Screenshot crawler ("shots") | `tools/shots/` | Photographs every page of the web app in several window sizes, themes and browser engines; reports page health; builds a side-by-side sheet against the reference pictures | Playwright browsers, the test server |
| UI gallery | `src/ui/gallery/`, route `/dev/gallery` | One page showing every shared UI component, in development only | dev server |
| Unit tests | `src/**/*.test.ts(x)`, `tools/**/*.test.ts`, `server/**/*.test.ts` | Logic tests with Vitest | Node |
| End-to-end suite | `e2e/`, `playwright.config.ts` | Drives the real app in real browsers against the test server and asserts behavior | Playwright browsers, the test server |
| CI | `.github/workflows/ci.yml`, `.github/dependabot.yml` | Typecheck, unit tests, lint, build and a Docker image build on every push and pull request to `main` | GitHub |
| Quiet test browsers | `tools/quiet-playwright.mjs` | Patches the installed Playwright so every browser it launches is headless (no window) and muted | runs on `npm install` |
| Low-priority keeper | `tools/low-priority.ps1` | Keeps the processes of the project's tooling at below-normal priority on a Windows machine that someone is using | Windows PowerShell |
| Agent-log archiver | `tools/archive-agent-logs.mjs` | Copies agent briefs and reports into a readable local archive for documentation | a Claude Code session folder |
| Conversation export | `tools/export-conversation.mjs` | Writes the whole working session (the chat, every subagent's chat, workflow runs, pictures) as local Markdown pages | a Claude Code session of this project |
| Production server and Docker image | `server/`, `Dockerfile`, `docker-compose.example.yml` | Serve the built app, publish runtime configuration, proxy Seerr | Node 24 or Docker |

Software the tools assume:

- **Node 24 and npm.** `.nvmrc` contains `24`; CI reads the Node version from that file.
- **Docker** for the throwaway test server and for the production image.
- **Playwright's browsers** for the crawler and the end-to-end suite (section 12 has the install command). The end-to-end specs that play video also need Microsoft Edge installed (five spec files on `main` at `509db33`, section 12).
- **The Android SDK**, only for the reference capture.

Ports used by the tools on the local machine:

| Port | Used by |
|---|---|
| 5173 | `npm run dev` |
| 5184 | the dev server the screenshot crawler starts (`--port` or `SHOTS_PORT` to change) |
| 5601 | the dev server the end-to-end suite starts (`E2E_PORT` to change) |
| 8097 | the throwaway test Jellyfin |
| 8080 | the production server's default (`PORT` to change) |
| 5570 | the Android emulator's console port (its `adb` name is `emulator-5570`) |

Repository housekeeping files:

| File | What it does |
|---|---|
| `.nvmrc` | Names the Node version (24). |
| `.editorconfig` | UTF-8, Unix line endings, a final newline, two-space indentation, trailing spaces trimmed (kept in Markdown); Windows script files (`.bat`, `.cmd`, `.ps1`) use Windows line endings. |
| `.gitattributes` | Stores text files with Unix line endings in the repository and in working copies, marks images, fonts, media and archives as binary, and keeps Windows line endings for `.bat`, `.cmd` and `.ps1`. |
| `.gitignore` | Keeps local material out of the repository: `node_modules`, `dist`, `dist-server`, `.env` and `.env.*`, `reference/`, `shots/out/`, `refshots/out/`, `e2e/.output/`, `dev/testserver/data/`, `.worktrees/`, `.agent-logs/`; since 2026-11-18 also local-only working folders under `dev/` (experiments and launchers) and the crash dumps of shell tools (`*.stackdump`). |
| `.oxlintrc.json` | Lint configuration. It ignores `.worktrees/`, `reference/`, `dist/`, `shots/`, `refshots/` and `dev/testserver/data/`. |
| `.dockerignore` | Keeps `node_modules`, build output, environment files, the upstream copy, screenshots and the test server's data out of the Docker build. |

## 2. npm scripts

All scripts are in `package.json`. Run them from the repository root. Flags for a script go after `--`, for example `npm run shots -- --list`.

| Script | Runs | Use it when |
|---|---|---|
| `npm run dev` | `vite` | You want the app in a browser. Port 5173; it fails if the port is taken. Section 5. |
| `npm run build` | `tsc -b && vite build` | You want a production build in `dist/`. It typechecks first. |
| `npm run preview` | `vite preview` | You want to look at the contents of `dist/` without the production server. The dev sign-in helper and the Seerr proxy are not part of this. |
| `npm run typecheck` | `tsc -b` | Before reporting any change done. Covers `src/`, `tools/`, `server/` and `vite.config.ts`. It does not cover `e2e/` (see `e2e:typecheck`). |
| `npm run test` | `vitest run` | Before reporting any change done. Section 11. |
| `npm run lint` | `oxlint` | Before reporting any change done. |
| `npm run gen` | the four `gen:*` scripts in order | After changing anything under `docs/spec/`, after updating the upstream checkout, or after changing dependencies. Section 3. |
| `npm run gen:tokens` | `node tools/gen-tokens.mjs` | After editing `docs/spec/design-tokens.json`. |
| `npm run gen:strings` | `tsx tools/gen-strings.ts` | After updating the upstream checkout. |
| `npm run gen:preferences` | `tsx tools/gen-preferences.ts` | After editing `docs/spec/preferences.json` or the web-only list in the generator. |
| `npm run gen:licenses` | `tsx tools/gen-licenses.ts` | After adding, removing or updating a production dependency. |
| `npm run shots` | `tsx tools/shots/cli.ts` | Photograph the app. Section 9. |
| `npm run shots:quick` | `tsx tools/shots/cli.ts --theme PURPLE --viewport desktop,phone` | A faster crawl: one theme, two window sizes. |
| `npm run shots:compare` | `tsx tools/shots/cli.ts --compare` | Web pictures next to the Android TV reference pictures: one TV-canvas web scene per reference picture, in headless Edge. Section 9. |
| `npm run ts:up` | `node tools/testserver/setup.mjs up` | Start the throwaway test server and wait until it answers. Section 7. |
| `npm run ts:down` | `node tools/testserver/setup.mjs down` | Stop and remove its container. Data stays. |
| `npm run ts:reset` | `node tools/testserver/setup.mjs reset` | Wipe its configuration and cache and provision it again, back to the seeded state. Media is kept. |
| `npm run ts:verify` | `node tools/testserver/setup.mjs verify` | Read-only health checks of the test server and its seeded data. |
| `npm run ts:guide` | `node tools/testserver/setup.mjs guide` | Write a new Live TV guide on the test server when its copy is running out. |
| `npm run ref:emu` | `node tools/refshots/emulator.mjs` | Manage the Android TV emulator: `npm run ref:emu -- start`. Section 8. |
| `npm run ref:shots` | `node tools/refshots/capture.mjs` | Capture reference pictures: `npm run ref:shots -- --scene home`. |
| `npm run e2e` | `playwright test` | Run the whole end-to-end suite. Section 12. |
| `npm run e2e:desktop` | `playwright test --project=desktop` | One project of the suite. Also `e2e:keyboard`, `e2e:phone`, `e2e:writes`. |
| `npm run e2e:flaky` | `playwright test --repeat-each=3 --grep-invert @writes` | Hunt for unstable tests: every test not tagged `@writes`, three times. |
| `npm run e2e:typecheck` | `tsc -p e2e/tsconfig.json` | Typecheck the test code and `playwright.config.ts`. CI runs it. |
| `npm run e2e:list` | `playwright test --list` | Print which tests run in which project, without running them. |
| `npm start` | `node server/index.ts` | Run the production server from source (Node 24 runs the TypeScript file directly). Needs a built `dist/`. Section 16. |
| `npm run serve:build` | `vite build --config server/vite.config.ts` | Bundle the production server into the single file `dist-server/index.js`. |
| `npm run docker:build` | `docker build -t wholphin-web .` | Build the production image. |
| `npm run docker:run` | `docker run --rm -p 8080:8080 -e JELLYFIN_URL wholphin-web` | Run the image on port 8080, passing `JELLYFIN_URL` through from the shell. |
| `postinstall` (automatic) | `node tools/quiet-playwright.mjs` | Runs after every `npm install` and `npm ci`. Section 14. |

Not in `package.json`: the low-priority keeper (PowerShell), the agent-log archiver and the test server's media scripts are run directly (sections 14, 15 and 7).

## 3. Generators

Each generator reads data extracted from upstream, or the dependency list, and writes files that are committed, so the app builds without the upstream checkout. Re-run a generator only when its input changes. Never edit a generated file by hand; the next run overwrites it.

| Generator | Input | Output | Re-run when |
|---|---|---|---|
| `npm run gen:tokens` | `docs/spec/design-tokens.json`, plus a few fixed colors defined in the generator | `src/theme/tokens.css`, `src/theme/typography.css`, `src/theme/themes.gen.ts` | The token data changes |
| `npm run gen:strings` | Upstream Android `strings.xml` files in `reference/wholphin/app/src/main/res/values*/` | `src/i18n/locales/<language>.json` (English plus 41 translations, 42 files) and `src/i18n/locales/index.ts` | The upstream checkout is updated |
| `npm run gen:preferences` | `docs/spec/preferences.json`, plus a short list of web-only preferences written in the generator | `src/stores/preferences.gen.ts` | The spec or the web-only list changes |
| `npm run gen:licenses` | `package-lock.json` and the installed production packages; the upstream checkout if present | `src/features/settings/licenses.gen.json`, `src/features/settings/upstream.gen.json` | A production dependency changes, or the upstream checkout moves to another commit |

Details worth knowing:

- **Tokens.** Eight themes, dark scheme only (upstream's light schemes are not reachable in the app). The generator also computes two elevated surface colors per theme (`--c-surface-1`, `--c-surface-3`) with the Material formula, in which the primary color is blended over the surface color more strongly as elevation grows. Fixed colors are written as `--fx-*`; some of them (white, gray, black, red, green, blue and the log-level colors) are defined in the generator and not in the token file. Components must use the variables and never a color value ([CLAUDE.md](../CLAUDE.md)).
- **Strings.** Keys are the Android string names. Positional arguments such as `%1$s` become `{{p1}}`; plural quantities become i18next suffix keys; Android escapes, CDATA and XML entities are decoded; strings marked non-translatable stay in the base locale; the icon-font file `fa_strings.xml` is skipped. The rules are in the header comment of `tools/gen-strings.ts`. If the upstream checkout is missing, the generator prints a warning and keeps the committed files. Strings that upstream does not have go by hand into `src/i18n/extra/en.json` with a `web_` prefix, not into the generated files. That file held 183 keys on `main` at `7ad52ba` (counted with `node -e "console.log(Object.keys(require('./src/i18n/extra/en.json')).length)"`) and holds 186 at `509db33` (counted for this update by its `"web_` lines); they exist only in English.
- **Preferences.** Keys are the upstream ids in lower camel case with a trailing `Pref` or `Preference` removed. Values are stored in the unit the code uses (milliseconds for durations); the settings screens convert. Web-only preferences are defined in the generator (the `WEB_ONLY` list): the interface scale and, since `bf31148`, `WebPlayerDimVideo`, the switch "Dim the video while the controls are shown" of the Advanced screen. The generator's test covers the new entry.
- **Licenses.** `licenses.gen.json` lists every production npm dependency with its version, license, project page, author and license text, plus two bundled assets that do not come from npm (the Font Awesome font and the Material icon paths). The app's License page shows this list. The root file [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md) repeats it (name, version, license, project page) but is not written by the generator: when `licenses.gen.json` changes, update that file by hand. That was last done in `bf31148`, which added `libpgs` 0.9.0 (MIT), the renderer for PGS subtitles: `npm run gen:licenses` wrote the new entry, and the notices file was edited to match (54 components, 47 of them MIT). The generator skips packages that are links into `vendor/`, which are the project's own code. `upstream.gen.json` records which upstream commit the port tracks; it is refreshed only when `reference/wholphin` exists, and is otherwise left as committed.
- **Licenses, author names.** The author column keeps the developer's name only: the e-mail address and web address of npm's `Name <email> (url)` form are dropped, as the TV app's licence list shows it.
- `tools/gen-strings.test.ts` and `tools/gen-preferences.test.ts` test their generators, and `tools/gen-licenses.test.ts` tests the license generator's author-name rule; they run with `npm run test`. The token generator has no test, and the rest of the license generator has none.

## 4. Environment keys

### `.env.local`

`.env.local` sits in the repository root and is git-ignored. It holds addresses and credentials for local use. Never commit it, print it or paste its values anywhere. The keys, by name only:

| Key | Written by | Read by | Purpose |
|---|---|---|---|
| `TESTSRV_URL` | `tools/testserver/setup.mjs` | dev sign-in helper (`?server=test`), end-to-end suite | Address of the throwaway test server |
| `TESTSRV_ADMIN_USER`, `TESTSRV_ADMIN_PASSWORD` | `setup.mjs` | `setup.mjs` | The test server's administrator |
| `TESTSRV_USER`, `TESTSRV_PASSWORD` | `setup.mjs` | dev sign-in helper (and through it the crawler), end-to-end suite, reference capture, `setup.mjs` | The normal test user of the test server |
| `TESTSRV_USER2`, `TESTSRV_PASSWORD2` | `setup.mjs` | end-to-end suite | A second test user with a PG-13 parental limit and an avatar |
| `TESTSRV_API_KEY` | `setup.mjs` | `setup.mjs` (it writes the key into the Live TV channel list) | An API key of the test server |
| `TEST_JELLYFIN_URL`, `TEST_JELLYFIN_USER`, `TEST_JELLYFIN_PASSWORD` | the maintainer, by hand | dev sign-in helper (default mode); the end-to-end Discover spec and the crawler's Discover scenes (user and password, also as the Seerr sign-in) | A real Jellyfin server and a limited, non-admin test account on it. Read-only use only. |
| `DEV_SEERR_URL` | the maintainer, by hand | `vite.config.ts` | Where the dev server's `/seerr-proxy` forwards to. Without it there is no Seerr proxy in development, and Discover cannot work there. |
| `VITE_DEV_JELLYFIN_URL` | the maintainer, by hand | nothing: it is named in [CLAUDE.md](../CLAUDE.md), but no code in `src/`, `tools/`, `e2e/`, `server/` or the configuration files reads it | Unused |

The `TESTSRV_*` values are generated on the first run of the test server setup (random passwords) and reused afterwards, including after `reset`. The modes that write them are provisioning, `reset`, `rescan` and `verify`; `npm run ts:up` and `ts:down` only start and stop the container and write nothing. The other keys only the maintainer can supply. A first day with only the throwaway test server needs none of them by hand.

### Environment variables read by tools

These are set in the shell for one command, not in `.env.local`.

| Variable | Read by | Meaning |
|---|---|---|
| `WW_VITE_CACHE` | `vite.config.ts` | Folder for the dev server's dependency cache. Default `node_modules/.vite`. Each extra dev server needs its own (section 14). |
| `SHOTS_PORT` | crawler | Port of the dev server the crawler starts or reuses. Default 5184. Same as `--port`. |
| `E2E_PORT` | end-to-end suite | Port of the dev server the suite starts or reuses. Default 5601. |
| `E2E_RUN_ID` | end-to-end suite | Name that separates one run's output folder and device ids from another's. Default: empty on port 5601, otherwise the port number. |
| `E2E_WORKERS` | end-to-end suite | Number of parallel test workers. Default 4. |
| `E2E_ENGINES_ALL` | end-to-end suite | When set, Firefox and WebKit run every desktop test and the iPhone profile runs every phone test, not only the tagged subset. |
| `CI` | end-to-end suite | When set: a stray `test.only` fails the run, failed tests are retried once, and an already running dev server is not reused. |
| `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) | reference capture | Location of the Android SDK. Required: there is no built-in default, and the tool stops with a message when neither is set. |
| `UIDEBUG` | reference capture | When set, prints how the focus helper chooses its key presses. |
| `WW_ALLOW_HEADED` | `tools/quiet-playwright.mjs` patch | When set, test browsers may open a visible window. **Never set it on a machine someone is using** (section 14). |
| `JELLYFIN_URL`, `SEERR_URL`, `PORT` and the others in section 16 | production server | Runtime settings of the production server. |

## 5. Dev server

`npm run dev` starts Vite, the build tool, as a development server on `http://localhost:5173`. `vite.config.ts` sets the following:

- **Port.** 5173 with `strictPort`, so a second copy fails instead of silently taking another port.
- **Seerr proxy.** When `DEV_SEERR_URL` is set, requests to `/seerr-proxy/*` are forwarded to that Seerr with the prefix removed. Seerr sends no cross-origin headers and uses a session cookie, so the browser must reach it through the app's own address. The production server does the same (section 16).
- **Dev sign-in helper.** The plugin from `tools/vite-dev-session.ts` (section 6). It is registered for the dev server only and is never part of a build.
- **App routes over root files.** A second dev-only plugin answers page loads of paths such as `/license` with the app. Without it, on a disk that ignores letter case, the dev server would return the repository's `LICENSE` file for the app's License page.
- **Dependency cache.** The cache folder is taken from `WW_VITE_CACHE`, so several dev servers can run side by side (section 14). The dependency scan is limited to `index.html`.
- **File watching.** The dev server ignores this checkout's own `.worktrees/` folder, `reference/`, `dev/testserver/data/`, `refshots/` and `shots/out/`, so large or foreign folders do not trigger reloads. A dev server started inside a worktree still watches its own sources.
- **Units.** CSS is written in `px`, where 1 px is 1 Android dp. A PostCSS plugin converts `px` to `rem` so that the root font size scales the whole interface. A value written `1PX` (upper case) is left alone.
- **Build targets.** The build targets Chrome 119, Edge 119, Firefox 128 and Safari 16.4. `index.html` shows a "browser too old" notice below that baseline; the two must be kept in sync.
- **Unit tests.** The Vitest settings live in the same file (section 11).

## 6. Dev sign-in helper (`/dev/login`)

Purpose: every tool and every agent needs a signed-in app without anybody typing a password into a login form.

How it works:

1. `tools/vite-dev-session.ts` is a Vite plugin that exists only in the dev server. It answers `GET /__dev/session`.
2. On each request it re-reads `.env.local` on the server side, so keys added later need no restart. It fetches the target server's public information, then calls the Jellyfin sign-in endpoint with the user name and password from `.env.local`, and returns only the server address, the server information, the user record and an **access token**.
3. The password is read inside the dev server's Node process and sent only to Jellyfin. It is never written into a file the browser loads, never returned in a response and never logged. The browser receives a token, which is what a normal login would give it.
4. The page `src/app/dev/DevLoginPage.tsx` is registered at `/dev/login` only in development. It calls the helper, stores the session the way a real login would, and redirects.

Options on `/dev/login`:

| Query | Effect |
|---|---|
| none | Signs in to the server named by `TEST_JELLYFIN_URL` with `TEST_JELLYFIN_USER` and `TEST_JELLYFIN_PASSWORD` (a real server, the limited test account) |
| `?server=test` | Signs in to the throwaway test server with `TESTSRV_URL`, `TESTSRV_USER` and `TESTSRV_PASSWORD` |
| `?next=/some/path` | Where to go afterwards. It must start with `/` and not with `//`; otherwise the app goes to the home page |

Example: `http://localhost:5173/dev/login?server=test&next=/settings`.

The token is created for the browser's own device identity (the page passes its device id and name), so it belongs to that browser. If the address or user key is missing, the helper answers 404 and names the missing keys, not their values. If Jellyfin refuses, it answers 502 with the status code.

The helper is not available in `npm run build`, `npm run preview`, the production server or the Docker image.

## 7. Throwaway test server

Purpose: a disposable Jellyfin to develop against, to photograph and to run the end-to-end suite on, with media chosen to exercise every playback path and screen. It is entirely separate from any real server.

Facts: image `jellyfin/jellyfin:10.11.11` (pinned), container `wholphin-web-test-jellyfin`, host port 8097, data in `dev/testserver/data/` (git-ignored: `config`, `cache`, `media`, `avatars`). Compose file: `dev/testserver/docker-compose.yml`. The scripts are plain Node with no extra dependencies.

**CPU cap.** The compose file sets `cpus: 3`, so the container can never use more than three processor cores, also after it is recreated. Library scans and transcodes on an uncapped container once slowed the whole machine down. Check the cap with:

```bash
docker inspect wholphin-web-test-jellyfin --format '{{.HostConfig.NanoCpus}}'   # prints 3000000000
```

### Commands

| Command | Effect |
|---|---|
| `npm run ts:up` | `docker compose up -d`, then waits until the server answers |
| `npm run ts:down` | Stops and removes the container. Data stays. |
| `npm run ts:reset` | Stops the container, deletes `data/config` and `data/cache` (except the generated-asset folder `cache/gen`), starts it again and provisions it. Media is kept. Credentials are reused. Use it when the server's user data has drifted from the seed (see "Known wrinkles"). The first end-to-end run right after a reset can fail on the page guard; run the suite again (see "Known wrinkles"). |
| `npm run ts:verify` | Read-only checks, listed below (32 on `main`). Prints PASS or FAIL per check and exits non-zero on a failure. |
| `npm run ts:guide` | Writes a new Live TV guide when the current one reaches less than two days ahead (`-- --force` writes one regardless), and has Jellyfin read it. |
| `node tools/testserver/setup.mjs` | Provision (the default with no argument; `provision` is accepted too). Safe to repeat; a second run reports nothing to do. |
| `node tools/testserver/setup.mjs status` | Show the container's status line |
| `node tools/testserver/setup.mjs rescan` | Trigger a library scan and wait for it |
| `node tools/testserver/download-media.mjs` | Download the real Blender open movies (about 1.5 GB of downloads). Skips files that exist. Files over about 150 MB are re-encoded to 720p H.264 with the container's ffmpeg. Optional arguments are parts of folder names, to fetch only those movies: `node tools/testserver/download-media.mjs sintel`. |
| `node tools/testserver/gen-media.mjs` | Generate all synthetic media with the container's ffmpeg. Skips files that exist; delete a file or folder to regenerate it. Optional arguments limit it to groups: `zoo`, `shows`, `music`, `photos`, `extras`, `livetv`, `segments`. |

Both media scripts run ffmpeg inside the container through `docker exec`, so the container must be running first. Provisioning configures Live TV only when the generated guide file exists, and uploads the second user's avatar only when the generated image exists at the moment that user is created; without them it logs a message and carries on. The first-time order that follows from the scripts is therefore:

```bash
npm run ts:up
node tools/testserver/download-media.mjs
node tools/testserver/gen-media.mjs
node tools/testserver/setup.mjs
npm run ts:verify
```

(The test server README lists the media scripts before any start command. This order was derived from the code and was not re-run for this document.)

**Waiting for the server.** `ts:up`, provisioning (and so `reset`) and the restart after the segment plugin is installed wait up to three minutes for the server. The server counts as up only when `/System/Info/Public` answers and `/Users/Public` no longer answers 503. On Jellyfin 10.11 a freshly wiped server (after `reset`) answers the first address while its start-up page still answers everything else with 503; the earlier check looked at the first address only, so provisioning began too early. This was found when the lead reset the server on 2026-11-18 and fixed in `tools/testserver/setup.mjs` (`waitForServer`).

What provisioning does, in order: starts the container; completes Jellyfin's setup wizard; signs in as the administrator; creates an API key; creates the two test users; turns Quick Connect on (Quick Connect is Jellyfin's sign-in by a six-digit code approved from another device); installs the media-segment plugin; creates the libraries and scans them; configures Live TV; seeds watch state for the normal test user; creates collections and playlists; makes sure one movie and one episode are in progress; creates the mixed-content library; cancels any Live TV timer it finds; and makes sure the media segments exist.

### What is in it

| Library | Type | Content |
|---|---|---|
| Movies | movies, online metadata (TMDb) on | 12 folders of Blender open movies: Big Buck Bunny (with a local trailer and an `extras` folder), Sintel, Tears of Steel, Elephants Dream (a 720p and a 480p file that Jellyfin merges into one movie with two versions), Cosmos Laundromat, Spring, Agent 327, Coffee Run, Sprite Fright, Charge, Wing It!, Caminandes 2. The Spring folder carries a TMDb id because TMDb had matched it to the wrong film. |
| Codec Zoo | movies, local metadata files (NFO) only | 16 synthetic clips, listed in the next table (15 until `bf31148` added "Dual Audio Second Default") |
| Shows | TV shows, NFO only | Four synthetic series with 56 episode files: Orbital Drift (theme song, Specials, a missing S02E03, a future-dated S03E05, media segments on all of season 1), The Bakery on Elm Street, Detective Moth (rated TV-MA), Pixel Garden (rated TV-Y, Specials) |
| Music | music, tags only | 3 artists, 6 albums, 42 tracks in MP3, FLAC and M4A with embedded covers; one two-disc album; an `.lrc` lyrics file |
| Photos | home videos and photos | Two photo albums with mixed aspect ratios (camera data on about two thirds of the pictures) and two short clips |
| Mixed Folders | mixed content (no collection type) | Plain sub-folders with three photos and two clips copied from Photos, for the generic folder browser |
| Live TV | M3U channel list and XMLTV guide | 4 channels that stream library items through Jellyfin's own stream address. **No timers, and nothing is ever recorded** (see below). Since commit `3b1dd7b` a `Recordings` library holds three pre-made files, copies of a 3.5 MB clip. |
| Collections and playlists | created by the script | Box sets "Blender Open Movies" and "Blender Shorts"; playlists "Weekend Watchlist" (video) and "Late Night Mix" (music) for the normal test user |

The normal test user has seeded state: resume points, played items, favorites across movie, series, episode, person, artist and album, and partly watched series so that Next Up has entries. The second test user is limited to PG-13 and has an avatar. The user names are defaults written in `tools/testserver/setup.mjs`.

The Live TV guide is a generated file of dated programs (`tools/testserver/guide.mjs`): eight days of half-hour programs, starting six hours before it was written. It therefore runs out. `npm run ts:guide` writes a new one when the server's copy reaches less than two days ahead: it copies the file into the container (so it works from any checkout, including a git worktree) and runs Jellyfin's "Refresh Guide" task. Provisioning does the same, the end-to-end suite's global setup calls it when the guide has under three hours left, and `ts:verify` fails when the guide does not reach the next 24 hours. The first guide covered only 24 hours and nothing renewed it; it ran out during the stage 2 audit and failed the Live TV test in three engines.

### Codec Zoo: which file exercises which playback path

The right-hand column is what the server answers for the profile the app builds in headless Microsoft Edge, since the direct-play work of `bf31148` ([DECISIONS.md](DECISIONS.md) T-59): taken from the part "Playing without the server converting" of [PLAYBACK_MATRIX.md](../src/features/playback/engine/PLAYBACK_MATRIX.md), which gives each answer before and after that commit, for the other browsers too, and a read-only run on a real library. Where the answer changed, the earlier one is named. The results were not repeated for this document.

| File | What it is | What happens in Edge since `bf31148` |
|---|---|---|
| H.264 AAC Baseline (MP4) | The browser direct-play baseline | Direct play |
| AV1 Opus (WebM) | AV1 video, Opus audio | Direct play |
| VP9 Vorbis (WebM) | VP9 video, Vorbis audio | Direct play |
| Chapter Marathon (MKV, H.264/AAC) | Ten named chapters in two minutes | Direct play (before: a remux, the server repackaging the file without re-encoding) |
| HEVC 10-bit EAC3 5.1 (MKV) | HEVC Main10 with E-AC-3 audio | The audio is converted and the video copied, before and after (Edge had no E-AC-3 decoder in that run) |
| 4K UHD Demo (MKV) | 3840x2160 HEVC | Direct play (before: remux) |
| Multi Track Showcase (MKV) | Three audio tracks (AAC, AC-3, DTS), embedded SRT, a styled ASS with an attached font, a forced track, external English, French and forced subtitle files | Direct play with the first audio track, also with a text or ASS subtitle drawn in the browser (before: remux); with the AC-3 or the DTS track the audio is converted and the video copied |
| Dual Audio Second Default (MKV) | Two AAC tracks, English first and Japanese second with the default flag, plus a PGS and an ASS subtitle track. New in `bf31148`: a browser plays only the first audio track of a file it plays directly | The first track: direct play. The second (the file's default): a remux with video and audio copied |
| HEVC HDR10 (MKV) | HEVC flagged BT.2020 / PQ with mastering metadata | Direct play: desktop Chromium converts HDR for an ordinary display itself (before: a video transcode, the test display not being HDR) |
| MPEG-2 Program Stream (MPG) | MPEG-2 video, AC-3 audio | Video transcode |
| MPEG-4 ASP AVI | MPEG-4 Part 2 with MP3 | Video transcode |
| Very long title, Hebrew title, Japanese title (MP4) | Layout, right-to-left and CJK text tests | Direct play |
| PGS Image Subtitles (MKV) | Two PGS subtitle tracks (English, Spanish). PGS stores pictures, not text. | Direct play; with a track selected the server hands the track out as a `.sup` file and the app draws it on a canvas (before: a video transcode with the subtitle burned in). `ts:verify` still checks the burn-in answer, with a profile that lists PGS only as burn-in. |
| VobSub Image Subtitles (MKV) | Two VobSub (DVD) subtitle tracks, also pictures | Direct play without a subtitle; with a track selected, a video transcode with the subtitle burned in, as before |

How the image-subtitle files are made: the ffmpeg in the Jellyfin image has no PGS encoder, so `tools/testserver/imgsubs.mjs` renders each subtitle line to a bitmap with ffmpeg and writes the PGS stream itself. `gen-media.mjs zoo` then puts the streams into a 24-second 720p file; for VobSub the same streams are converted with ffmpeg's DVD subtitle encoder. Nothing is downloaded and each item is about 1 MB. To regenerate, delete the item's folder, run `node tools/testserver/gen-media.mjs zoo`, then `node tools/testserver/setup.mjs` (it rescans when the items are missing).

A test server that was seeded before `bf31148` gets the sixteenth clip the same way: `node tools/testserver/gen-media.mjs zoo` generates the missing file (the PGS track with the same `imgsubs.mjs`, the two audio tracks as tones of 440 and 880 Hz), and provisioning rescans the library when it does not find the item "Dual Audio Second Default". The PGS clips end at 24 s, before the display set that would end their fourth cue: a client that draws nothing after a stream's last display set never shows that cue (`tools/testserver/README.md`).

### Media segments (Skip Intro, Skip Outro, Next Up)

A media segment is a marked time range in an episode, such as its intro or credits. Jellyfin serves segments but cannot create them itself; they come from plugins. The setup script installs the official Chapter Segments Provider plugin (pinned to version 4.0.0.0) into the throwaway container through Jellyfin's own package API, restarts the container once so that it loads, and runs the Media Segment Scan task. The plugin turns chapter names into segments. `tools/testserver/segments.mjs` (also run by `gen-media.mjs shows` and `gen-media.mjs segments`) adds chapters to the six Orbital Drift season 1 clips without re-encoding them:

| Episodes | Segments (seconds) |
|---|---|
| S01E01 to E03, E05, E06 (30 s each) | Intro 4 to 14, Outro 21 to 30 |
| S01E04 (30 s, the seeded Next Up entry) | Recap 0 to 5, Intro 5 to 13, Outro 20 to 27, Preview 27 to 30 |

`reset` deletes the plugin with the configuration, and provisioning installs it again.

### What `ts:verify` checks

All checks are read-only and run as the normal test user, except the timer check, which signs in as the administrator. On `main` the command prints 32 PASS lines when everything is in order (the lead's run after the reset of 2026-11-18; earlier documents said 31). The checks cover:

- every library lists items;
- the Blender movies have posters and overviews;
- the resume and Next Up endpoints return entries;
- playback information is returned for the H.264 and the HEVC 10-bit file;
- Quick Connect is enabled;
- Live TV channels exist and the guide reaches the next 24 hours; at least two collections and two playlists exist;
- each image-subtitle item lists two bitmap subtitle streams, and selecting one makes the server choose burn-in;
- Orbital Drift season 1 has six episodes, each with exactly the segments in the table above;
- the recording folder is reported (the pre-made recordings described below);
- **no Live TV timer exists.**

### Nothing is ever recorded, and why

An earlier version of the setup script scheduled real Live TV recordings so that the crawler's Recordings scene would have data. The test server's "live" channels are local files, served as fast as the recorder can read them, so a recording never stays small: a single timer grew without limit and filled the disk. Since then:

- the old seeding step in `setup.mjs` is gone, and the script cancels any timer it finds;
- `ts:verify` fails if a timer exists;
- the crawler and the end-to-end suite answer every recording and timer request inside the test browser, so none reaches a server (sections 9 and 12);
- the rule for people and agents is: never create a timer and never press Record, on any server.

Since commit `3b1dd7b` (on `main` after `bc93855`) provisioning does exactly that instead of recording: it copies a small clip three times into Jellyfin's default recording folder and restarts the container once, so Jellyfin creates a `Recordings` library for the recordings tab and the recording folder, and `ts:verify` checks that the folder is reported (`tools/testserver/README.md`). Nothing is recorded. This change came after the runs recorded in this document; no run of it is recorded here.

### Disk use and limits

Measured for this document: `dev/testserver/data` is about 1.2 GB (media 1.0 GB, of which Movies 855 MB; configuration 82 MB; cache 61 MB). The Jellyfin image adds about 2.3 GB (from the builder's report).

What it cannot provide:

- hardware transcoding, real tuner hardware and an HDR display;
- intro clips for cinema mode;
- a separate display name for a user (Jellyfin has none).

Known wrinkles:

- Wikimedia Commons rate-limited the downloads, so the movies come from archive.org and the Blender download server. One short film (Caminandes 3) was left out because its source failed to re-encode.
- Two reports written after the recording incident still found recorded items listed in the test server's Recordings library. The lead later checked that the recordings folder is empty on disk, so these are library entries, not growing files.
- The data folder belongs to the checkout that created it. Section 14 explains why the test server must not be started from a second working copy.
- The seeded user data drifts when many agents use the server for hours. On 2026-11-18, after the parallel final-check agents, the lead found every Codec Zoo item marked watched, about 950 sessions and a stray user, and reset the server with `npm run ts:reset` before the last end-to-end run. Watched marks also change what the crawler and the TV compare scenes show (for example a Home row of unwatched items disappears; [final-merge-notes.md](final-merge-notes.md), section 12.6). The crawler itself moves the data too: each crawl plays through the Next Up scene, so the next-up episode of one series advances; during the polish round no resumable episode was left and one scene was skipped (section 13.7 of those notes). The lead reset the server again after that round.
- **The first end-to-end run right after a reset can fail on the page guard.** While Jellyfin fills its image cache for the first time it answers some image requests with 500; its log shows "Response Content-Length mismatch". The page guard of the suite fails a test on any response of 400 or higher, so a few tests that show posters fail (on 2026-11-18: three of 239, on five poster requests). The same addresses answer 200 afterwards and the error does not come back: run the suite again, and the second run is clean of it.

## 8. Android TV reference capture (`tools/refshots/`)

> **State on 2026-11-18: the reference pictures have to be captured again.** `refshots/out/` in the main checkout was emptied by accident when finished worktrees were removed (section 14, "Removing a worktree"): the 244 pictures, their manifest, the downloaded app package and the emulator's virtual device are gone. Nothing in the repository was lost; the tool, its scenes and the crawler's reference map are unchanged. Before the next comparison work, run the "one time" commands below again (the app package and the virtual device), then a full capture. The Android system image lives inside the SDK and was not affected.

Purpose: the visual reference for "the same as the TV app". The tool runs the real Wholphin app (version 1.1.1) in an Android TV emulator, drives it with simulated remote-control keys over `adb` (the Android debug bridge), and saves pictures of 1920x1080 at 320 dpi, which is the standard 960x540 dp TV canvas. A `manifest.json` describes each picture: file, description, the key sequence, the focused element, visible texts and time.

**The emulator runs headless and silent.** `emulator.mjs start` always passes `-no-audio` and, unless told otherwise, `-no-window`; the virtual device is created with audio input and output off. The script accepts a `--window` flag that shows the emulator window. Do not use it on a machine someone is using ([CLAUDE.md](../CLAUDE.md), "No sound and no windows"). The emulator costs about 2 GB of memory while it runs: stop it whenever it is not capturing.

### Prerequisites and what it installs

- The Android SDK with `cmdline-tools`, `emulator` and `platform-tools`. Point `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) at it.
- Hardware acceleration (on Windows, the Windows Hypervisor Platform). `create` refuses to continue without it rather than run unaccelerated.
- Java for the SDK tools, and `gh` (the GitHub command-line tool), only to download the app package.
- The throwaway test server running on port 8097, with `TESTSRV_USER` and `TESTSRV_PASSWORD` in `.env.local`. From inside the emulator the host machine is `10.0.2.2`. Never point the emulator at a real server.
- What `create` installs: the system image `system-images;android-36;android-tv;x86_64` (about 1.5 GB to download, about 8 GB on disk, inside the SDK) and a virtual device named `wholphin_tv` (profile `tv_1080p`, 1920x1080, 320 dpi, 2 GB of memory, software-rendered graphics) under `refshots/out/avd`. The app package (about 54 MB) goes to `refshots/out/apk`. The virtual device folder measured 3.3 GB when this was written.

### Commands

```bash
# one time
gh release download -R damontecres/Wholphin --pattern "Wholphin-x86_64.apk" -D refshots/out/apk
npm run ref:emu -- create     # install the system image, create the virtual device
npm run ref:emu -- start      # headless and silent; waits for boot; turns animations off
npm run ref:emu -- install    # install the app package
npm run ref:emu -- status     # JSON: acceleration, device, boot state, resolution, app version
npm run ref:emu -- stop

# capture (starts the emulator if it is not running)
npm run ref:shots                                  # every scene; the tool's README estimates 1.5 to 2 hours
npm run ref:shots -- --scene movie-detail,home     # selected scenes
npm run ref:shots -- --list                        # scene numbers, ids and titles
```

`npm run ref:emu -- start --wipe` starts the emulator with its data wiped. The same commands work as `node tools/refshots/emulator.mjs <command>` and `node tools/refshots/capture.mjs`.

Output goes to `refshots/out/` (git-ignored): `<nn>-<scene>[-<suffix>].png`, where `nn` is the scene's position in the list, plus `manifest.json`. A failed scene leaves `_fail-<scene>.png` and an entry under `failures` in the manifest; a deliberate skip is recorded there as `SKIPPED: ...`. Re-running a scene replaces its earlier pictures and manifest entries. A failing scene is logged and the run continues.

### How it signs in

The `setup` scene wipes the app's data, adds the test server's address as the emulator sees it, opens "Add User" in Quick Connect mode (the TV login that shows a six-digit code), reads the code from the screen, and then approves that code **from the host** by signing in to the test server through its API as the test user. No password is ever typed into the app. Every other scene checks that the app is at Home and runs the setup flow again only if it is not. Quick Connect is enabled on the test server by the setup script.

### Scenes (36)

`setup`, `home`, `nav-drawer`, `library-movies`, `library-codec-zoo`, `library-shows`, `library-music`, `library-grid-dialogs`, `movie-detail`, `movie-versions`, `movie-tracks`, `context-menu`, `series-detail`, `series-overview`, `episode-detail`, `person`, `collection`, `playlist`, `favorites`, `search`, `settings-main`, `settings-sub`, `playback-movie`, `playback-chapters`, `playback-episode`, `music-album`, `music-artist`, `now-playing`, `library-photos`, `settings-subtitle-style`, `settings-advanced`, `settings-home-customize`, `themes` (Home in all 8 themes, a detail page in two), `live-tv` (guide, program dialogs, view options, DVR tabs, live playback; the record actions are photographed and never activated), `segments` (Skip Intro, Skip Outro and Next Up on Orbital Drift S1E1), `image-subtitles` (the PGS item: subtitle chooser, burned-in subtitle during playback).

State before the loss of 2026-11-18, and what a new full capture should give again: `refshots/out` held 244 numbered pictures and the manifest listed 244 shots across all 36 scenes, for app version 1.1.1. The manifest records one deliberate skip and no failure: the episode page of the TV app cannot be reached by normal navigation, so the `episode-detail` scene photographs the episode's context menu only. A new capture will not be pixel-identical with the lost one where the test server's data has changed since (watched marks, resume points, Home rows), so the notes in the crawler's reference map (section 9) may need another look.

### Adding a scene

Append to `tools/refshots/scenes.mjs`. Never insert in the middle, because file numbers follow the position in the list.

```js
scene('my-screen', 'What it shows', async (c) => {
  await c.openDrawer('Movies');           // fresh app start, open the drawer, choose a destination by label
  await c.tab('Library');                 // a tab in a library's tab row
  await c.focus('Big Buck Bunny');        // D-pad to an element by label (string = exact, RegExp, or {at:[x,y]})
  await c.press('enter', 'wait:800');     // keys: up down left right enter back play pause ff rew next prev menu info stop
  await c.shot('detail', 'description');  // waits until the screen stops changing, writes the picture and the manifest entry
});
```

Other helpers: `press('down*3', 'long:enter', 'text:abc', 'wait:500')`, `select`, `waitFor(text)`, `has(text)`, `toolbar(i)` (icon-only buttons), `back(n)`, `scrollThrough(prefix, description, {key, max})`, `get(path)` (a read-only API call as the test user), `skip(reason)`. Set `c.fast = true` around playback so that a picture does not wait for moving video to stop changing. To explore by hand: `node tools/refshots/adbui.mjs dump`, `texts`, `focus`, `key down`, `go "Label"` or `shot out.png`. For a new reference picture, add its web state to `tools/shots/tvScenes.ts` and its line to `tools/shots/refmap.ts` (section 9).

### Known unstable spots

- The emulator's accessibility tree lags behind the app's focus by up to a second. Helpers wait, and a picture is taken only after two identical frames, but a picture right after a key press can still catch an animation.
- The navigation drawer is a list taller than the screen, so it is walked by counting entries. Changing the test server's libraries changes the counts.
- Labels that also appear in the drawer are matched only to the right of it. Icon-only buttons have no label and are addressed by position.
- Player controls hide after five seconds, so playback pictures skip the screen dump; the first one depends on the video having started.
- If the test server is restarted or rescanned during a capture, the app drops to the server list; re-run the scene.
- The app's theme is stored: if the `themes` scene stops half way, run it again before other scenes.
- The emulator was seen shutting down between commands in some shells; the capture script starts it again when it is missing.

## 9. Screenshot crawler (`tools/shots/`)

Purpose: walk the whole web app with Playwright, take a picture of every scene in each chosen window size and theme, and report the health of each page. It is also a smoke test, because a page that throws an error, calls a broken address or overflows horizontally shows up in the report. A scene is one named picture: a page, optionally after an interaction such as opening a menu.

### Running

```bash
npm run shots                                  # everything: all scenes x 4 window sizes x 8 themes, on the test server
npm run shots:quick                            # PURPLE theme, desktop and phone only
npm run shots -- --scene home,item-movie --theme PURPLE --viewport desktop,phone
npm run shots -- --server real --scene library-movies --theme PURPLE --viewport desktop
npm run shots -- --rtl --theme PURPLE          # Hebrew locale, right-to-left layout
npm run shots -- --engine webkit --viewport wide,phone --theme PURPLE   # another browser engine
npm run shots -- --strict --theme PURPLE       # exit code 1 if a picture has an error-level issue
npm run shots -- --list                        # resolved scene list with real ids, no pictures
npm run shots -- --help                        # the flag list
npm run shots:compare                          # web next to the Android TV reference (every reference picture)
npm run shots -- --scene 'tv-09*,tv-14*' --theme PURPLE --viewport desktop   # some of the reference states only
```

The crawler starts its own dev server on port 5184 with its own cache folder (`node_modules/.vite-5184`), or reuses one that already answers there. It signs in through `/dev/login` and stops the dev server again only if it started it; Ctrl+C also stops the browser and the server it started. The browser is launched headless and muted in every engine. `--list` still starts the dev server and signs in, because real item ids are looked up on the server, so it needs the test server running.

A full run on the test server is large: up to 196 scenes in 4 window sizes and 8 themes. (The 208 TV-canvas reference scenes are not part of a plain crawl; see Compare mode.) Do not run it more often than a task needs ([CLAUDE.md](../CLAUDE.md), "Go easy on the development machine"); `--scene`, `--theme` and `--viewport` cut it down.

### Flags

| Flag | Meaning |
|---|---|
| `--scene a,b*` | Scene names or `*` patterns. A bare name also matches its `name-*` family (`home` matches `home`, `home-drawer` and so on). |
| `--viewport v,..` | Window sizes: `desktop` (1920x1080), `laptop` (1280x720), `tablet` (820x1180, touch), `phone` (390x844, touch, mobile browser identity). Default: these four; `all` means the same. `wide` (1440x900) runs only when named. |
| `--engine e` | Browser engine: `chromium` (default), `firefox` or `webkit` (the engine of Safari). In WebKit the phone and tablet sizes use the iPhone and iPad browser identity with touch; Firefox gets touch only. |
| `--channel c` | `msedge` or `chrome`: drive the installed browser (still headless and muted) instead of Playwright's Chromium, for the licensed codecs the player scenes need. `none` forces the bundled Chromium. Compare mode uses `msedge` unless told otherwise. |
| `--theme t,..` | `PURPLE BLUE GREEN ORANGE BOLD_BLUE OLED_BLACK RED BROWN` or `all` (default). The theme is written to the app's stored preferences before the page loads. |
| `--rtl` | A right-to-left browser locale (Hebrew); the app follows it and lays out right to left. The default run name gets an `-rtl` suffix. |
| `--server real\|test` | Which Jellyfin `/dev/login` signs in to. Default `test`. See the caution below. |
| `--run name` | Output folder name under `shots/out/`. Default: a timestamp. |
| `--strict`, `--strict-warnings` | Exit code 1 on error-level issues, or on errors and warnings. |
| `--workers N` | Parallel browser contexts (independent sessions in one browser). Default 4. |
| `--port N`, `--url http://host:port` | The dev server to start or reuse. Default port 5184, or `SHOTS_PORT`. With `--url` the crawler only reuses a running dev server and fails if none answers. |
| `--dpr N` | Device scale factor. Default 1. |
| `--settle-ms N` | Per-picture limit for waiting until the page is still. Default 15000. |
| `--compare`, `--no-capture` | Compare mode; see below. |
| `--list`, `--help` | Print the scene list, or the help text. |

**Caution with `--server real`.** It signs in to a real server as the limited test account. Always name the scenes with `--scene`: an unrestricted run includes the player scenes, which start playback (and transcodes) and report progress for that account. Recording and timer requests and Seerr requests are answered inside the test browser in the scenes that could send them, but nothing blocks other writes in general.

### Output

```
shots/out/<run>/<viewport>/<theme>/<scene>.png
shots/out/<run>/index.html          contact sheet: grouped by scene, filters for window size, theme and name, click to enlarge
shots/out/<run>/report.html         health report (report.json holds the same data)
shots/out/<run>/compare/index.html  compare mode only
shots/out/latest.json               name of the newest run
```

`shots/out/` is git-ignored. Both HTML files open straight from disk.

### Scenes (416 when this was written: 208 app scenes and 208 reference states)

The app's own scenes are defined in `tools/shots/scenes.ts`; every route in `src/app/routes.tsx` has at least one. The scene list also appends the 208 TV-canvas reference states of `tools/shots/tvScenes.ts`, which run only in compare mode or when `--scene` names them (Compare mode, below). The table counts the app's own scenes.

| Group | Scenes | What they cover |
|---|---|---|
| Setup | 8 | Server list (empty and filled), add-server dialog, user list, login, login error, Quick Connect. They run signed out, or with a remembered server and user but no token. |
| Home | 24 | Home, a hovered card, the drawer in its states, context menu, rows 2 to 6, a "View more" page, Home customization and its dialogs |
| Search | 11 | Empty, results, typed, focused, scrolled, context menu, view options, no results; two searches in non-Latin scripts that match the test server's Hebrew and Japanese seed titles and run on the test server only |
| Browse | 3 | Favorites, the generic grid |
| Detail | 52 | Movie (tracks, versions, chapters, extras, menus), series and the series overview, season, episode, box set, playlist, person, album, artist, song, photo album, photo |
| Library | 26 | Each library type; tabs; sort, filter and view options; letter jump; list views; genre and studio pages |
| Live TV | 13 | Guide, program and channel dialogs, view options, DVR schedule, recordings, empty and error states |
| Discover | 11 | The Seerr sign-in gate, and ten Discover scenes that run on a real server only |
| Settings | 22 | Main and sub-screens, dialogs, subtitle style, License, Debug |
| Playback | 12 | Player, paused state, every settings sheet, the shortcut sheet |
| Music | 15 | Music library tabs, genre, album and playlist menus, mini player, Now Playing (five run on the test server only) |
| Photos | 9 | Photo library, album, viewer, slideshow, photo screensaver |
| Other | 2 | Not found, the UI gallery |

Things to know about the scenes:

- Real items are looked up at run time, so no server-specific id is written in the scene list. A scene whose data does not exist is skipped and reported.
- **Controls are found in the run's language.** A scene's `prepare` step finds a button or menu entry by role, by a data attribute the app already sets (`data-pref-id`, `data-focus-key` and the like), or by its name as the app shows it, through `uiText(ctx.lang, key)` and `uiPattern(ctx.lang, key, { match, i })` from `tools/shots/uiText.ts`. These read the name from the app's own locale files under `src/i18n` (the keys are the Android string names), so the same step works in the English run and in the Hebrew one (`--rtl`): an English fallback in Hebrew comes wrapped in a left-to-right isolate, as the app shows it, and a key the app does not have fails loudly. A literal English name fails in the Hebrew run. Before this change (the polish round, `31dbaad`) the Hebrew crawl warned on 84 scene steps; it now has none. No data attributes were added to `src` for the crawler.
- **Home scenes wait for their rows.** The Home scenes wait, through `homeRowsLoaded` in `tools/shots/tvScenes.ts`, until no Home row still shows its loading placeholder, so a picture is never taken before the last row.
- A scene can be limited to one server. With the default `--server test`, the 12 real-server-only scenes are left out (196 scenes run); with `--server real`, the 5 test-server-only scenes are left out.
- **Live TV.** Every write under the timer and recording endpoints is answered inside the test browser and never reaches a server. Some DVR scenes also answer the schedule lists locally, so they have something to show.
- **Quick Connect.** The Quick Connect calls are answered locally, so these scenes run on either server and leave no pending code behind. The login-error scene answers the sign-in call locally too, so no failed login is recorded on a server.
- **Discover.** These scenes need a signed-in Seerr user, so they run only with `--server real` and need `DEV_SEERR_URL`. They sign the test browser in to Seerr through the dev proxy with the limited test account. Every other Seerr write, including a media request, is answered locally and never reaches Seerr.
- The player scenes play real media on the server they run on, so they report playback progress for the signed-in user. After a crawl on the test server, `node tools/testserver/setup.mjs` restores a movie and an episode in progress if the crawl finished them.

### Health report

For each picture the crawler records: console errors and warnings, uncaught exceptions, failed requests and responses with status 400 or higher, leftover placeholder pages (`[data-route-stub]`; the app has none any more), horizontal overflow of the document with the first offending elements, broken images, zero-size images, redirects away from the requested path, settle timeouts and timing.

- **Errors:** console errors, page errors, failed requests or status 400 and higher, broken images, navigation failures.
- **Warnings:** console warnings, placeholder pages, overflow, zero-size images, settle timeouts, a failed interaction step, unexpected redirects, the "No results" text on a page that is not expected to be empty.
- Identical issues across window sizes and themes are collapsed in `report.html`. A 404 on the probe for the optional Wholphin server plugin is ignored, and a 404 on an item image is only a warning.

### How a picture is taken

The crawler does not wait a fixed time for a page to load. A picture is taken after two consecutive passes in which: no API or asset request has been in flight for 350 ms, web fonts are loaded, every image in the window is decoded, no visible element is marked busy, and the layout of everything in the window is identical across two animation frames. An interaction step is followed by a pause of 800 ms and the same check again, so that hover and header timers have finished. CSS animations and transitions are disabled, and reduced motion is emulated, unless a scene asks for animation. The clock is frozen at 20:00 local time so that clocks and "ends at" labels do not change between runs, and the browser's stored data is reset to a baseline before every scene so that scenes cannot affect each other.

### Other engines

`--engine firefox` and `--engine webkit` run the same scenes in Playwright's Firefox and WebKit builds. One thing differs on Windows: with display scaling above 100 %, Playwright's WebKit lays a page out narrower than the requested size. The crawler enlarges the window so that the page gets the requested size in CSS pixels, which makes those pictures larger in device pixels. The end-to-end suite shares this helper. Playwright's WebKit is not Safari itself, and no real Safari or iOS device was available to the project.

### Compare mode

`npm run shots:compare` crawls the scenes named in `tools/shots/refmap.ts` (desktop size, PURPLE theme and headless Edge, unless you pass `--viewport`, `--theme` or `--channel`) and writes `compare/index.html`, with the Android TV reference picture on the left and the web picture on the right. The sheet's header says how many reference pictures have a web picture in the run. There is no automatic pixel comparison: compare structure, colors, type and states.

- **The web side is a TV canvas.** `tools/shots/tvScenes.ts` holds one scene per reference state, named `tv-<reference file name>` and marked `compareOnly`. Each runs in a 1920x1080 window with the interface-scale preference at 160 %, which makes the root scale 2: the page is laid out on the TV's 960x540 dp canvas and 1 dp is 2 picture pixels on both sides, so the two pictures can be laid over each other. The scenes use the keyboard the way the reference run used the remote, starting from the page's own arrival focus, and look up the throwaway test server's items by name. 31 of them are limited to the test server.
- **Codecs.** The player scenes play a few seconds of video each and need H.264, hence headless Edge. A run of reference states started with `npm run shots -- --scene 'tv-*'` uses the bundled Chromium unless `--channel msedge` is given.
- **The player scenes since `bf31148`.** The web player no longer has the TV's layout ([DECISIONS.md](DECISIONS.md) O-34, T-60), so the player scenes of `tvScenes.ts` were changed with it: they find a button in the control strip (`[data-player-strip]`, Settings by its `data-player-button` name), and the chapters and queue scenes open the panels with the H and Q keys, where the TV reaches rows of cards with Down. Those web pictures differ from the TV's by design. No compare run is recorded since the change.
- **Duration.** The tool's README estimates about 20 minutes with `--workers 1`. The last recorded compare run (208 scenes, headless Edge, one worker, on the polish round's final tree) reported 208 ok, 0 warnings and 0 errors ([final-merge-notes.md](final-merge-notes.md), section 13.6). In that round the series overview scenes were changed to wait as the reference run did (900 ms after Right, 500 ms between Downs).
- `refmap.ts` is a plain table of `{ ref, scene, note }`: 244 lines when this was written, one per reference picture, served by the 208 web scenes. A note records what cannot match on purpose: data that changed since the references were taken (watched marks, resume points, Home rows), the clock, and the recorded web-only parts (Back button, mini player, web-only player buttons). Add a line when a new reference picture appears.
- The reference pictures are read from `refshots/out/` in the same checkout. A pair whose reference file is missing, or whose web scene did not run, shows a "missing" box. **Since 2026-11-18 that folder is empty** (section 8), so a compare run now shows the web side only, until the pictures are captured again. The results of the earlier compare runs are recorded in the documents, and some earlier compare output is still under the git-ignored `shots/out/`.
- `npm run shots:compare -- --no-capture --run <name>` rebuilds the sheet from an earlier run without taking pictures.
- What the comparison pass found and changed with this tool is in [parity-notes.md](parity-notes.md).

### Adding a scene

```ts
// a page for a real item, resolved at run time (return null to skip when the server has no such item)
{ name: 'item-movie-4k', path: async (jf) => { const m = await jf.first({ includeItemTypes: 'Movie', sortBy: 'Random' }); return m && `/item/${m.Id}` } },

// an interaction scene: prepare runs after the page settled, then settling runs again before the picture
{ name: 'settings-about-dialog', path: '/settings', prepare: async (page, ctx) => { await page.getByText(uiText(ctx.lang, 'about')).first().click() } },
```

- `ctx.lang` is the run's interface language (`en`, or `he` with `--rtl`); find controls by name only through `uiText` or `uiPattern`, never by a literal English text.
- `jf` is a read-only Jellyfin client that uses the crawler's session. Never write to the server from a scene's `path`; only `prepare` may click.
- Scene options (all in `tools/shots/types.ts`): `auth` (`'in'` signed in, the default; `'out'` an empty profile; `'saved'` a remembered server and user without a token), `state` (navigation state for pages driven by it), `servers` (limit to `'test'` or `'real'`), `viewports`, `allow` (expected failures), `allowEmpty`, `redirectsTo`, `fullPage`, `animations`, `extraWaitMs`, `waitFor`, `group`, `prefs` (app preferences merged into the scene's profile, such as the interface scale or a theme of its own), `clock` (another frozen moment than 20:00, or a function that finds one on the server: the Live TV reference scenes use a moment inside the guide), `compareOnly` (kept out of plain crawls).
- A scene on a `/play/...` page ends its playback session after the picture, so the server stops transcoding.
- Interaction helpers exported from `scenes.ts`: `hoverCard`, `focusRow`, `expandDrawer`, `pointAtDrawerLibrary`, `pointAtDrawerItem`, `contentCards`, and `mockLiveTvWrites` for anything that could reach a recording endpoint.

### Limits and what was not verified

- The most recent recorded crawls, on the polish round's final tree, used the PURPLE theme at desktop and phone size only, in English and in Hebrew: 390 pictures each, 390 ok, no warning or error, one scene skipped in each for lack of data, because the crawls of that round had used up the test server's resumable episode ([final-merge-notes.md](final-merge-notes.md), section 13.6). Before that round, a Hebrew crawl warned on 84 scene steps that looked for English button names (sections 9.6 and 12.6). Section 12.6 also records the grid pages at tablet width in English (18 pictures, 0 warnings). Section 8.7 of those notes records a partial crawl in Firefox and in WebKit (73 scenes of the newer features) with no errors and a few scene steps that timed out. A crawl in all 8 themes, at laptop size and at tablet size for every page has not been recorded for the merged app. The Discover scenes have not been run with the new string lookup (they need the real server).
- The Home row "Watch live" is missing from most crawl pictures. Not a Home defect: the test guide starts every program on the hour and half hour, and the crawler's clock is frozen at 20:00, so no program then ends more than a minute later, which the row requires. Staggered start times in `tools/testserver/guide.mjs` and a crawler clock that follows the server on the Home scenes would fix the pictures; neither was done ([final-merge-notes.md](final-merge-notes.md), sections 13.1 and 13.7). The last full crawl (4,608 pictures, no errors) was taken before playback, settings, Live TV, music and photos were merged in.
- The duration of a full crawl of the merged app was not measured.
- Unit tests cover argument parsing (`tools/shots/args.test.ts`) and the string lookup (`tools/shots/uiText.test.ts`). The capture path itself has no test.

## 10. UI gallery (`/dev/gallery`)

The gallery is one page that shows every shared component of `src/ui/` (buttons, cards, rows, dialogs, tabs, inputs, rating displays and so on) with sample data. It is used to check components in all themes without a server.

- Open `http://localhost:5173/dev/gallery` while `npm run dev` is running. The route is registered only in development and needs no sign-in.
- The crawler photographs it as the scene `dev-gallery`: `npm run shots -- --scene dev-gallery`.
- Sample labels in the gallery are English literals on purpose; the page is not product UI and is not translated.

The standalone gallery page and its own screenshot script, which earlier versions of this document described, were removed. The route and the crawler scene replace them.

## 11. Unit tests

`npm run test` runs Vitest once, in a jsdom environment (a simulated browser document inside Node). It picks up `src/**/*.test.ts`, `src/**/*.test.tsx`, `tools/**/*.test.ts` and `server/**/*.test.ts`. The settings are in the `test` block of `vite.config.ts`.

- The tests cover logic: formatting, stores, navigation helpers, the playback engine's decisions, the Seerr client, the generators, the crawler's argument parsing and string lookup, and the production server (`server/server.test.ts` starts the server against a fake upstream).
- `tools/css-engine-baseline.test.ts` is a guard over every stylesheet in `src`: no `:dir()` pseudo-class (unknown to Chrome 119) and no `text-box` outside the kit helper (unknown to Firefox 128). It came with the polish round.
- The last recorded run, by the lead on `main` at `509db33` and again on the release tree of 2026-11-24: 101 test files, 897 tests, all passing. Earlier: 87 files and 776 tests at `7ad52ba` (84 files and 742 tests after the polish round, 85 and 748 after the closing round's fix; [final-merge-notes.md](final-merge-notes.md), sections 13.5 and 14.5). The count was not re-measured for this document.
- The three newest files show the two ways a component is tested here without a browser: `src/features/playback/ui/rtlValues.test.tsx` renders components and asserts their markup; `src/ui/inputs/Slider.test.tsx` and `src/ui/lib/touchIntent.test.ts` drive the slider with pointer events of type `mouse`, `touch` and `pen`.
- `src/app/shell/extractColors.test.ts` pins the backdrop color extraction to the Android TV result: the nearest-neighbour index tables that reproduce Android's bitmap scaling, and two real backdrops (fixtures in `extractColors.fixtures.ts`) against the colors the TV shows.
- No unit test needs a Jellyfin server, a browser or Docker.
- To run one file: `npx vitest run src/lib/some.test.ts`.

## 12. End-to-end suite (`e2e/`)

The end-to-end suite uses Playwright Test to drive the real app, served by a dev server, against the **throwaway test server**. Tests assert behavior: addresses, focus, accessibility state and server state. They never compare pictures; that is the crawler's job. [e2e/README.md](../e2e/README.md) is the full guide, with the conventions for writing tests and a table of what is covered. This section is the summary.

### Before the first run

```bash
npx playwright install chromium firefox webkit   # Playwright's own browser builds (a standard Playwright command, not a project script)
npm run ts:up                                    # the test server must be up and seeded
```

The specs that play video launch the installed Microsoft Edge, headless (`channel: 'msedge'`), because Playwright's own Chromium lacks the licensed codecs: `playback.spec.ts` and, since `bf31148`, `playback-direct.spec.ts`, `playback-layout.spec.ts`, `subtitles-bidi.spec.ts` and `playback-subtitle-style.spec.ts`. What happens on a machine without Edge was not checked.

### Running

```bash
npm run e2e            # everything: sign-in setup, then all seven projects
npm run e2e:desktop    # one project; also e2e:keyboard, e2e:phone, e2e:writes
npx playwright test --project=firefox --project=webkit --project=iphone   # only the other engines
npm run e2e:flaky      # every test not tagged @writes, three times
npm run e2e:typecheck  # typecheck the test code
npm run e2e:list       # which tests run in which project
npx playwright test e2e/specs/home.spec.ts -g "arrow keys"   # one test
```

To run every desktop and phone test in the other engines, set `E2E_ENGINES_ALL`:

```bash
E2E_ENGINES_ALL=1 npx playwright test --project=firefox --project=webkit --project=iphone
```

```powershell
$env:E2E_ENGINES_ALL = "1"; npx playwright test --project=firefox --project=webkit --project=iphone
```

What a run does:

1. `e2e/global-setup.ts` checks, before any browser starts, that the test server answers, is provisioned, lets both test users sign in, has resume points, Next Up entries and libraries, and has Quick Connect on. If not, the run stops with a message that says what to do.
2. Playwright starts a dev server on port 5601 with its own cache folder (`node_modules/.vite-5601`), or reuses one already running there.
3. The `setup` project signs in once per project through `/dev/login?server=test` and saves each signed-in browser state.
4. The projects run, 4 workers in parallel by default (`E2E_WORKERS`).

Do not use `--ui`, `--headed` or `--debug`, and do not open a trace or the HTML report with `npx playwright show-trace` or `show-report`, on a machine someone is using: they open windows.

### Projects and tags

A project is one browser configuration. Every test names the projects it runs in with tags; a test without a tag runs nowhere.

| Project | Tag | Browser | Notes |
|---|---|---|---|
| `desktop` | `@desktop` | Chromium, 1440x900, mouse and keyboard | |
| `keyboard` | `@keyboard` | Chromium, 1440x900 | Keyboard only: any pointer event fails the test |
| `phone` | `@phone` | Chromium, 390x844, touch, mobile browser identity | |
| `writes` | `@writes` | Chromium, 1440x900, its own session | Tests that change server state |
| `firefox` | `@engines` | Firefox, 1440x900 | A smoke subset; with `E2E_ENGINES_ALL`, every `@desktop` test |
| `webkit` | `@engines` | WebKit, 1440x900 | The same |
| `iphone` | `@iphone` | WebKit, 390x844, touch, iPhone browser identity | A touch subset; with `E2E_ENGINES_ALL`, every `@phone` test |
| `setup` | none | | Creates the signed-in states; every project depends on it |

The suite has 27 spec files in `e2e/specs/` on `main` at `509db33` (21 at `7ad52ba`), roughly one per area of the app: sign-in, accounts, Home, navigation, context menu, drawer, preferences, settings, browse, detail, series, search, Home customization, playback (two files), music, photos, Live TV, Discover, layout and engines, and the six added since: playback without server conversion (`playback-direct`), the player's layout (`playback-layout`), the subtitle style sheet of the player (`playback-subtitle-style`), the direction of subtitle lines (`subtitles-bidi`), grids that just fit their scroller (`grid-stability`) and sliders under a mouse (`slider-mouse`). The coverage table in the e2e README lists each behavior and its projects.

### Defaults that apply to every test

- Headless and muted (`--mute-audio`; Firefox through its volume preference), English locale, UTC, reduced motion, and a stylesheet that removes every animation.
- **Any console error, page error, failed request or response with status 400 or higher fails the test.** Exceptions are listed with their reasons in `e2e/fixtures/guard.ts`, or allowed inside one test.
- No retries locally: a test that fails once is a bug in the test or in the app. One retry when `CI` is set.
- Output goes to the git-ignored `e2e/.output/`: `auth/` (signed-in states), `test-results/` (trace, screenshot and error context of each failure), `report/` (HTML report). Traces record what a test typed, including the test server's passwords: keep them local.

### The `writes` project

Tests that change server state (favorites, watched state, playback progress) are tagged `@writes` only, so they run in their own project and session and the read-only projects never see a half-changed item. Such a test takes a snapshot of the item's user data before acting, checks the change through the API, and the fixture restores every snapshot after each test. One exception to the tag is the short playback test for Firefox and WebKit (`playback-engines.spec.ts`, tagged `@engines`): playing reports progress, so each engine plays its own clip and restores it. The e2e README says not to repeat that spec with `--repeat-each`; `npm run e2e:flaky` excludes only `@writes`, so it does repeat it. Whether that causes failures was not checked. Since `692715f` the same file holds a second test of this kind (the Hebrew values in the player's sheets): each engine pauses an item of its own after about a second, below the point where the server keeps a resume point or a played mark. One observation from that work, cause not proven: after a WebKit run the first of the two tests had left its clip marked played on the test server, although the fixture restores it; the likely cause is the restore running before the server has handled the Stopped report.

Live TV tests answer every recording and timer request inside the test browser and assert that none was sent.

### Touch gestures and drawn text

Two fixture helpers in `e2e/fixtures/app.ts` came with the commits `692715f` and `7ad52ba`. The e2e README has the conventions; in short:

- **`app.touchDrag(from, to, { steps, holdMs })`** sends a real one-finger gesture: down at `from`, an optional rest of `holdMs`, a straight move to `to` in `steps` moves (12 unless given, one per animation frame), up. It goes through Chromium's debugging protocol (`Input.dispatchTouchEvent`), so the browser itself decides whether the finger pans the page, and then sends `pointercancel`, or the page gets the pointer events. That is the only way to test "a scroll that starts on a control must not change it": Playwright's own touchscreen can only tap. The helper throws in any engine other than Chromium, so tests that use it are tagged `@phone`.
- **WebKit and Firefox** have no way to send a moving touch. Tests for them dispatch touch pointer events on the element and assert the computed `touch-action`. A dispatched pointer cannot be captured, so such a test allows that one page error with `guard.allow`.
- **A timed gesture is a fixed wait.** The reorder handle picks a row up after a rest, so its test rests longer than the pick-up time (`holdMs: 650` against 400 ms). That is one of the few fixed waits in the suite, because the wait is the gesture.
- **`app.drawnText(locator)`** returns an element's characters in the order they are drawn, left to right, with spaces dropped. A right-to-left line can draw ".25" as "25." while the element's text still says ".25"; this helper is how the right-to-left value tests see the difference.

### Judging motion

Every test runs with reduced motion and with a stylesheet that removes every animation and transition (`style[data-e2e="no-animation"]`, injected by the fixture; "Defaults that apply to every test" above). A test that passes therefore says nothing about how an animation looks. That was found the hard way on 2026-11-23 with the opening of the Settings panel, which the owner sent back to be redone. The rule since then ([DECISIONS.md](DECISIONS.md) T-62): before an animated change is shown to the owner, the lead looks at it in motion, from recorded frames at normal speed.

- In a headless page of the suite, remove the fixture's stylesheet and set reduced motion to no-preference, then record: `await page.evaluate(() => document.querySelectorAll('style[data-e2e="no-animation"]').forEach((el) => el.remove()))` and `await page.emulateMedia({ reducedMotion: 'no-preference' })`. Two tests in the suite do exactly this for their own assertions (`context-menu.spec.ts` removes the stylesheet; the volume slider's transition test in `playback-layout.spec.ts` does both).
- The frames are screencast frames of the headless browser; no window is opened. There is no script for it in the repository, and the lead's own recording commands were not recorded.
- `test.use({ reducedMotion: 'no-preference' })` alone, as the "with animations on" group of `settings.spec.ts` uses it, leaves the stylesheet in place: those tests assert which animations start and what covers the page, not how the motion looks.

### Real scrollbars and the player's dev hook

Two things the tests added after `7ad52ba` rely on:

- **Real scrollbars.** Every browser of the suite runs with Playwright's default hidden scrollbars, where layout that depends on the room a scrollbar takes cannot be tested. `grid-stability.spec.ts` therefore starts its own browser with `ignoreDefaultArgs: ['--hide-scrollbars']`, still headless and muted.
- **`window.__playback`.** In a development build the playback engine publishes itself and its store under that name (`src/features/playback/engine/engine.ts`). `playback-layout.spec.ts` and `playback-subtitle-style.spec.ts` use it to put the player into states a test item does not have (a queue, chapters, a Skip button, an hour-long duration, a subtitle kind). It is not part of a production build. A state set this way is a stand-in: the note for subtitles that cannot be restyled, for example, has not been seen with real image, ASS or burned-in subtitles.

### Running two suites at once

Two runs on one machine must not share a port, and must not share device ids, because a second sign-in with the same device id revokes the first run's token. Give each run its own port:

```bash
E2E_PORT=5701 npm run e2e
```

```powershell
$env:E2E_PORT = "5701"; npm run e2e
```

A port other than 5601, or an explicit `E2E_RUN_ID`, gives the run its own output folder (`e2e/.output/<run>/`) and its own device ids.

### Real-server rules

- The suite reads the test server's address from `TESTSRV_URL` and **refuses to run** if that address uses port 8096, the default port of a real Jellyfin, because the suite writes user data.
- Exactly one spec touches a real server: `e2e/specs/discover.spec.ts`. Seerr is connected to the real Jellyfin, so Discover cannot be tested on the throwaway server. The spec signs in through `/dev/login` (default mode) as the limited test account, signs in to Seerr through the dev proxy with the same account, and reads. Every other Seerr write, including the media request the test submits, is answered inside the test browser and never reaches Seerr. The spec is skipped when `TEST_JELLYFIN_USER` and `TEST_JELLYFIN_PASSWORD` are not configured. It also needs `TEST_JELLYFIN_URL` and `DEV_SEERR_URL`.
- No test creates a Live TV recording or timer, deletes media, or signs in to a real server as anyone other than the limited test account.

### Recorded results

The suite's size changed with each merge, and it was not run for this document. At `7ad52ba` it had 250 tests across the seven projects (the later numbers are at the end of this paragraph). The last two additions up to that commit: the closing round's two right-to-left tests, each in three engines (239 to 245), and the touch fix's three tests in five runs (245 to 250); [final-merge-notes.md](final-merge-notes.md), section 14.5. Before them the polish round added ten (18 runs across projects, [final-merge-notes.md](final-merge-notes.md), section 13.5), and the final check and repair before it added sixteen (30 runs across projects), and each of the sixteen failed on the tree before its fix ([final-merge-notes.md](final-merge-notes.md), section 12.5). The recorded runs are: 154 tests passing twice on the main line after its fix pass, and 63 passing twice on the merged app after its repair, before the fix pass's tests were merged in ([PROJECT-LOG.md](PROJECT-LOG.md), phases 16 and 17); 188 passing twice in a row for the combined suite ([final-merge-notes.md](final-merge-notes.md), section 8.7); and 221 passing twice in a row, with none failed, flaky or skipped, in 3.9 minutes each, by the final repair's integrator on the tree just before its last e2e-only commit (section 12.6). The independent audit after it ran 213 tests (without the `writes` project and the Discover spec) and had 3 failures, all the Home row drag test in three engines: it depended on which Home rows the shared server showed, and the lead hardened it in `e1b7e04`. The polish round's integrator ran the suite three times: 238 passed on the tree before its last repair, then 239 of 239 twice in a row (section 13.6). After merging that round the lead ran it three times on `main`: 236 of 239 right after a reset of the test server (three tests failed on the page guard because the server answered 500 to five poster requests while it filled its image cache; see section 7, "Known wrinkles"), 238 of 239 (a WebKit test that assumed a Home row with two cards, corrected in `c358a52`), and 239 of 239 in 4.3 minutes on `c358a52`. After the two later commits the lead ran the whole suite once more, alone, on `7ad52ba`: 250 of 250 in 4.4 minutes. The release round then brought the suite to 267 tests (the interface-scale tests, six tests of the player layout and four of direct play), and the lead's last run on `bf31148`, alone, had 267 of 267 in 5.0 minutes. Since then the suite has grown with the specs and tests of 2026-11-22 to 24 (section 12, "Projects and tags"); its size at `509db33` was not counted for this document. After each change of 2026-11-22 to 24 only the browser tests of the changed area were run (section 21). Before the second public release the lead ran the whole suite on the release tree, in all seven projects with three workers: 336 tests, 334 passed and 2 failed in 11.5 minutes; both failures were in tests of the Settings panel on WebKit (the `webkit` and `iphone` projects) and were faults of the tests, repaired in `e9b96bf` and re-run twice in four projects, all passing ([PROJECT-LOG.md](PROJECT-LOG.md) phase 35). A second whole-suite run after those repairs was not made. [STATUS.md](STATUS.md) keeps these results. `npm run e2e:list` prints the current list.

## 13. CI and Dependabot

CI (continuous integration) is the set of checks GitHub runs automatically. `.github/workflows/ci.yml` runs on every push to `main` and on every pull request to `main`. A newer push to the same branch or pull request cancels the run it replaces. The workflow has read-only access to the repository.

| Job | Steps |
|---|---|
| Typecheck, test, lint, build | Check out; set up Node from `.nvmrc` with the npm cache; `npm ci`; `npm run typecheck`; `npm run e2e:typecheck`; `npm run test`; `npm run lint`; `npm run build` |
| Detect Dockerfile | Reports whether a `Dockerfile` exists |
| Docker image build | Runs only when a `Dockerfile` exists: builds the image with a build cache. Nothing is pushed or published. |

What CI does not run: the end-to-end suite and the screenshot crawler. Both need a Jellyfin server and browsers, and run locally against the throwaway test server. The `postinstall` patch does nothing harmful in CI: it patches the installed Playwright package, and no browser is launched there.

Before opening a pull request, run the same checks locally: `npm run typecheck`, `npm run e2e:typecheck`, `npm run test`, `npm run lint`, `npm run build`.

Dependabot is GitHub's service that opens pull requests when a dependency has a newer version. `.github/dependabot.yml` checks npm packages weekly (minor and patch updates grouped into one pull request, at most five open at a time), and GitHub Actions and the Docker base image monthly.

The workflow has run on GitHub and passed. When the files were written it had only been read by hand ([DECISIONS.md](DECISIONS.md), A-91); it runs on every push to `main`. The three most recent runs, read with `gh run list --limit 3` on 2026-11-18, all succeeded: the documents commit `3d1ea68` (1 min 42 s), `c358a52` (1 min 51 s) and `7ad52ba` (1 min 30 s). The listing shows the result of a run as a whole; the jobs were not looked at one by one for this document, so the image build job is known only as part of a successful run. The runs on the commits after `7ad52ba` were not looked up for the update of 2026-11-24.

To see the runs: `gh run list --limit 3` (the GitHub command-line tool, signed in to the repository). CI does not replace the local end-to-end run: a push whose CI is green has not been driven in a browser.

## 14. Guards for a machine someone is using

The project was built on a machine that is in use at the same time. Three incidents (test audio playing, browser windows opening, the machine slowing down) led to the guards below. They are part of the tooling, and [CLAUDE.md](../CLAUDE.md) makes them rules.

### Quiet test browsers (`tools/quiet-playwright.mjs`)

The script patches the installed `playwright-core` package in `node_modules` in two places:

1. Every Chromium, Edge or Chrome that Playwright launches gets `--mute-audio`. Playwright itself mutes only headless browsers, and playback tests play real media.
2. Every Playwright launch, in Chromium, Firefox and WebKit, is forced headless, so no window opens or takes the keyboard focus, even if a script asks for `headless: false`.

How it behaves:

- It runs automatically after every `npm install` and `npm ci` (the `postinstall` script). It is safe to repeat, and does nothing when Playwright is not installed.
- If a Playwright update changes the launch code so that a patch no longer applies, the script prints `launch code not recognized` and exits with an error. That is deliberate: a silent miss would mean sound or windows on someone's desktop. Update the script before continuing.
- To check that the patch is in place, run `node tools/quiet-playwright.mjs`. It prints `already applied` for both patches.
- Each working copy has its own `node_modules`, so each needs the patch; `npm ci` applies it.
- Do not install with `--ignore-scripts`: that skips the patch.

The patch honors one escape hatch: with `WW_ALLOW_HEADED` set in the environment, a script may open a visible window. **Never set `WW_ALLOW_HEADED` on a machine someone is using.** It exists for a manual debugging session on a private machine.

Rules that go with the patch:

- Still write `headless: true` and `args: ['--mute-audio']` in every `launch()` call. Firefox has no such switch: set `firefoxUserPrefs: { 'media.volume_scale': '0.0' }`.
- When a test needs the licensed codecs (H.264, AAC, HEVC), use the installed Edge or Chrome in headless mode (`channel: 'msedge'` or `'chrome'`).
- If something only works in a visible window, record it as "not testable headless" and do not open one. Hardware HEVC decoding is recorded this way.
- Check audio in code (decoded bytes, a Web Audio analyser), not by listening.
- The patch covers Playwright only. The Android emulator is kept silent and invisible by its own start flags (section 8).

### Low-priority keeper (`tools/low-priority.ps1`)

A Windows PowerShell script that keeps the project's tooling from competing with the programs a person is using. Every 20 seconds it lowers the scheduling priority of matching processes to "below normal", so foreground programs get the processor first. It leaves a process alone if its priority is already below normal or idle.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/low-priority.ps1            # runs for 8 hours
powershell -NoProfile -ExecutionPolicy Bypass -File tools/low-priority.ps1 -Hours 2   # runs for 2 hours
```

It runs in the foreground of its terminal until the time is up, and prints a line whenever it lowered something. Start it in a spare terminal before a long session.

What it matches:

- by process name, anywhere on the machine: Playwright's headless Chromium (`chrome-headless-shell`), the bundlers `esbuild` and `rolldown`, the TypeScript compiler `tsgo`, and the Android emulator and `adb`;
- `node.exe` processes whose command line contains the project's folder, or one of the words `playwright`, `vite`, `vitest`, `tsc`, `oxlint`;
- `msedge`, `chrome` and `firefox` processes whose command line contains `playwright`.

It does not touch other programs, and it does not limit how many processes run. Playwright's WebKit processes are not in its lists. It was written for Windows; there is no equivalent script for other systems.

### One dev server per agent, on its own port, with its own cache

Several agents (or people) may each need a running dev server.

- **One each.** The working agreement allows one dev server and one browser per agent at a time. Stop each as soon as it is no longer needed, and leave no watcher, server or browser running between steps.
- **Ports.** `npm run dev` uses 5173 and fails if it is taken. Anyone who needs another server passes their own port. The crawler uses 5184 and the end-to-end suite 5601 unless told otherwise.
- **Cache.** Vite keeps a dependency cache in `node_modules/.vite`. Two servers sharing it corrupt each other, so each extra server gets its own folder through `WW_VITE_CACHE`. The convention is `node_modules/.vite-<port>`:

```bash
WW_VITE_CACHE=node_modules/.vite-5305 npx vite --port 5305 --strictPort
```

```powershell
$env:WW_VITE_CACHE = "node_modules/.vite-5305"; npx vite --port 5305 --strictPort
```

The crawler and the end-to-end suite set this for the servers they start.

### Other load rules

From [CLAUDE.md](../CLAUDE.md): play one video at a time and keep media tests to seconds; stop the playback session afterwards so the server stops transcoding; do codec-heavy work on the throwaway server, which is capped at three processor cores (section 7); keep transcodes on a real server to the minimum a check needs; stop the emulator whenever it is not capturing; do not run the full crawler, a Docker build or the whole test suite more often than a task needs; and never create anything that keeps writing data on its own, such as a Live TV recording.

### Worktrees for parallel lines of work

A git worktree is a second working folder of the same repository on its own branch. Two groups that edit the same files at the same time would overwrite each other in one folder; in separate worktrees they cannot. The project keeps worktrees under `.worktrees/`, which is git-ignored, excluded from lint and excluded from the main checkout's file watching. State on 2026-11-18: no worktree exists. All seven lines of work are in `main`, their worktrees are removed and their local branches deleted; this section describes how to set one up, and how to remove one without the damage the first removal did.

A worktree starts with only the tracked files. To make one usable it needs three things: the environment file, the upstream reference and its own dependencies. The commands below are standard git and operating-system commands; the exact commands used for the project's worktrees were not recorded, but they were set up this way (a copied `.env.local`, directory links for `reference/` and, where the compare sheet was needed, for `refshots/out/`, and their own `node_modules`).

```bash
# from the main checkout
git worktree add .worktrees/<name> -b <branch>
cp .env.local .worktrees/<name>/.env.local

# link the upstream copy so that it is not duplicated (macOS or Linux)
ln -s "$(pwd)/reference" .worktrees/<name>/reference

cd .worktrees/<name>
npm ci        # installs dependencies and applies the quiet-browser patch to this copy
```

On Windows, create the link as a directory junction, which needs no administrator rights:

```powershell
New-Item -ItemType Junction -Path .worktrees\<name>\reference -Target (Resolve-Path reference).Path
```

Rules inside a worktree:

- Work only inside it, and use its own port and cache folder for a dev server (`E2E_PORT`, `--port`, `WW_VITE_CACHE` as above).
- Playwright's browsers are installed per user, not per folder, so they are shared and need no second install.
- **Do not start, stop, reset or provision the test server from a worktree.** The test server's data lives in the main checkout's `dev/testserver/data/`, and the compose file mounts that folder by a relative path. Run from a worktree, the same commands would point the container at the worktree's own, empty data folder, and the setup script would write new credentials into the worktree's `.env.local`. Use the test server that the main checkout started; the copied `.env.local` already holds its address and credentials. (This follows from the compose file and the script; it was not tried.)
- `refshots/out/` and `shots/out/` are also per checkout. `npm run shots:compare` in a worktree finds no reference pictures unless `refshots/out/` is linked or copied in. A link to it is as dangerous at removal time as the link to `reference/` (below).
- `.env.local` is a copy: a key added in one checkout does not appear in the other.

#### Removing a worktree

**Rule: before removing a worktree on Windows, list the directory junctions inside it and remove each link itself first. `git worktree remove --force` deletes through them.** A junction is a link to a folder somewhere else; when git clears the worktree's folder it follows the link and deletes the files of the real folder.

This happened on 2026-11-18. The first four finished worktrees were removed with `git worktree remove --force` while they still held junctions to two shared, git-ignored folders of the main checkout. Both real folders were emptied: `reference/` (the upstream source copy; restored by cloning upstream at the tracked commit `8dcf189`) and `refshots/out/` (the Android TV reference pictures and the emulator's files, about 3.6 GB; not restored, section 8). Nothing tracked, no test data and no server was affected. For the last worktree the links were removed first and nothing else was lost.

When a worktree is finished and merged:

```powershell
# 1. list every directory link inside the worktree (junctions and symbolic links), at any depth
Get-ChildItem .worktrees\<name> -Recurse -Force -Directory -Attributes ReparsePoint | Select-Object FullName, LinkType, Target

# 2. remove each link itself: rmdir on a junction removes the link and leaves the folder it points at
cmd /c rmdir .worktrees\<name>\reference
cmd /c rmdir .worktrees\<name>\refshots\out

# 3. run the listing of step 1 again: it must print nothing

# 4. move anything worth keeping (test evidence under shots\out, for example) into the main checkout, then:
git worktree remove .worktrees\<name>
git branch -d <branch>
```

On macOS or Linux the links are symbolic links: `find .worktrees/<name> -type l` lists them and `rm <link>` (without a trailing slash, never `rm -r`) removes one.

- Do not pass `--force` to get past a link: remove the link, then remove the worktree without it. `--force` is for a worktree with uncommitted or untracked files that are known to be disposable, after the listing of step 1 is empty.
- `Remove-Item -Recurse` on a folder that contains a junction can delete through it in the same way in older PowerShell versions; use `rmdir` on the link, as above.
- `git branch -d` refuses to delete a branch that is not merged, which is the wanted check. Remote branches are deleted with `git push origin --delete <branch>`; on 2026-11-18 that step was refused by the permission check of the lead's tooling for the backup branches `e2e`, `integration` and `wave3a`, which are still on GitHub for the owner to delete.
- There is no script for creating or removing a worktree. The listing and removal commands above were written from the rule; the lead's own commands for the last worktree were not recorded.

## 15. Agent-log archiver

`node tools/archive-agent-logs.mjs "<session folder>"` reads a Claude Code session folder (the transcripts of the agents the lead started, and the journals of workflow runs) and writes a compact, readable copy under `.agent-logs/`:

| Output | Content |
|---|---|
| `.agent-logs/agents/<id>.md` | For each directly started agent: its brief, its final report, model and tool-call count |
| `.agent-logs/workflows/<run>/script.js` | The orchestration script of each workflow run |
| `.agent-logs/workflows/<run>/agents.md` | Every agent of that workflow: label, phase and the result it returned |
| `.agent-logs/index.md` | One line per agent and per run |

Why it exists: so that the project history in `docs/` can be written from primary sources (what each agent was asked and what it reported) rather than from memory. Why `.agent-logs/` is git-ignored: the raw logs contain machine-specific paths and other local details that must not go into a public repository; the curated history lives in `docs/`.

The archive is rebuilt by running the command again; it overwrites its own files. The script exits with a usage message if the folder argument is missing or does not exist. When this was written, the archive held 11 directly started agents and 10 workflow runs.

**The whole conversation** (added 2026-11-24 on the owner's request, O-46; commits `fda0c2b`, `0baf14f`). `npm run conversation` (`node tools/export-conversation.mjs`) writes a readable copy of the newest Claude Code session of this project, or of the session given as an argument (its `.jsonl` file, its folder or its id):

| Output | Content |
|---|---|
| `conversation.md` | The chat between the owner and the lead in order, with the pictures of both sides; tool calls are folded to one line each, and every start of a subagent or a workflow links to its page |
| `conversation/agents/<id>.md` | One subagent's whole chat: its brief, its replies, its tool calls and their results |
| `conversation/workflows/<run>.md` | One workflow run: its agents, what each returned, and its script |
| `conversation/index.md` | Every subagent chat and workflow run, in order of start |
| `conversation/images/` | The pictures, each stored once under the hash of its content |

Options: `--limit <n>` sets how many characters of each tool input and output are kept (2000; 0 keeps everything; the messages themselves are never cut), `--no-agent-images` leaves the pictures out of the subagents' chats (they are most of the size), `--force` rewrites the subagent chats that have not changed (by default only changed ones are written again). `--every <n> --quiet` is for a Claude Code "Stop" hook: the script counts the replies in `conversation/.replies`, does the work on every nth only, and takes the session's transcript path from the hook's input; the hook itself lives in the personal `.claude/settings.local.json`, which is git-ignored.

It differs from the archiver above in what it keeps: the archiver stores each agent's brief and final report for writing the history, this one stores everything that was said. Like `.agent-logs/`, `conversation.md` and `conversation/` are git-ignored, for the same reason. The model's hidden reasoning is not in the copy: the stored session does not hold its text.

## 16. Production server and Docker image

The app is a static single-page app. A small server in `server/`, built on Hono (a minimal web framework for Node), serves it, publishes runtime configuration and proxies Seerr, so that one image can be pointed at any Jellyfin without a rebuild. The server does not carry video or images: the browser talks to Jellyfin directly. [deploy.md](deploy.md) is the deployment guide, with reverse-proxy examples; this section describes the tooling.

| Piece | Role |
|---|---|
| `server/index.ts` | Entry point: loads the configuration, starts listening, shuts down cleanly on a stop signal. A configuration error is printed and the process exits. |
| `server/config.ts` | Reads the settings from environment variables and validates them |
| `server/app.ts` | Routes: `GET /healthz` (answers `{"status":"ok"}`, or 503 when the built app is missing), `GET /config.json` (what the app reads at start-up: the Jellyfin address, an optional name, the Seerr proxy path), the Seerr proxy, static files. Responses are compressed. |
| `server/seerrProxy.ts` | Forwards `/seerr-proxy/*` to the one configured Seerr, only for its API, image and avatar paths. A request cannot change the target. Only Seerr's session cookie is forwarded, and it is rewritten to be valid only below `/seerr-proxy`. Requests that change state must come from the app's own address. |
| `server/security.ts` | Sends a Content-Security-Policy (a header that tells the browser which addresses the page may load from and connect to) and other security headers. With a preset Jellyfin address, only that address is allowed. |
| `server/static.ts` | Serves `dist/`: files under `/assets/` are cached for a year, everything else is revalidated, and any in-app address falls back to `index.html`. |
| `server/server.test.ts` | Unit tests (22 test cases by a text count), run by `npm run test` |
| `server/vite.config.ts` | Bundles the server and its dependencies into one file for the image |
| `Dockerfile` | Two stages on `node:24-alpine`. The build stage installs dependencies, builds the app with `npx vite build` and bundles the server. The runtime stage holds only `dist/` and one server file, has no `node_modules`, runs as the non-root `node` user, exposes port 8080 and has a health check on `/healthz`. |
| `docker-compose.example.yml` | Copy to `docker-compose.yml`, edit the two addresses, then `docker compose up -d --build` |

The image build does not typecheck, lint or test; `npm run build` and CI do. The build stage copies `tools/quiet-playwright.mjs` before `npm ci`, because the `postinstall` script must exist when npm runs it.

### Settings

All settings are environment variables. The app reads the result from `/config.json`, so a change needs a restart, not a rebuild.

| Variable | Default | Meaning |
|---|---|---|
| `JELLYFIN_URL` | unset | The address a user's **browser** uses to reach Jellyfin, for example `https://media.example.org`. When set, the app is locked to that server and opens on its login; the security policy is narrowed to it. When unset, users type a server address. |
| `SEERR_URL` | unset | Where **this server** reaches Seerr; it can be an internal address. When unset, the Seerr proxy is off and the app offers no Discover. |
| `SERVER_NAME` | unset | A display name shown until the Jellyfin server answers |
| `PORT` | `8080` | Port to listen on |
| `HOST` | `0.0.0.0` | Address to bind |
| `TRUST_PROXY` | `true` | Believe the `X-Forwarded-*` headers of a reverse proxy in front. Set `false` when the server is exposed directly. |
| `HSTS` | `true` | Send `Strict-Transport-Security` on HTTPS requests |
| `CSP_EXTRA_ORIGINS` | empty | Extra addresses the app may connect to, separated by spaces or commas |
| `MAX_BODY_MB` | `10` | Largest request body the Seerr proxy accepts |
| `SEERR_TIMEOUT_SECONDS` | `30` | How long the proxy waits for Seerr |
| `ACCESS_LOG` | `false` | Log one line per request: method, path, status and time. Query strings are never logged, because they can carry tokens. |
| `DIST_DIR` | the `dist` folder next to `server/` (`/app/dist` in the image) | Folder with the built app |

On/off settings accept `1`, `true`, `yes` or `on` as on. A value that is not a valid address or number stops the server at start with a message naming the variable.

### Commands

Without Docker (Node 24):

```bash
npm ci
npm run build
JELLYFIN_URL=https://media.example.org PORT=8090 npm start
```

```powershell
$env:JELLYFIN_URL = "https://media.example.org"; $env:PORT = "8090"; npm start
```

`npm run serve:build` writes the single-file server to `dist-server/index.js`. It can be run with `node dist-server/index.js` on a machine that has only that file and the `dist/` folder. It looks for `dist/` next to its own folder; set `DIST_DIR` if it is elsewhere.

With Docker:

```bash
npm run docker:build
JELLYFIN_URL=https://media.example.org npm run docker:run    # http://localhost:8080, removed when stopped
```

```powershell
$env:JELLYFIN_URL = "https://media.example.org"; npm run docker:run
```

`docker:run` passes only `JELLYFIN_URL` through. For Seerr, another port, or a long-running container, use `docker run` with your own options or the compose example; [deploy.md](deploy.md) has both.

### What was verified, and what was not

Verified, from the recorded reports ([final-merge-notes.md](final-merge-notes.md), sections 4 and 12.6; [PROJECT-LOG.md](PROJECT-LOG.md)):

- The latest recorded check, by the final repair's integrator on the tree that then landed on `main` (before the backdrop color fix and the last e2e test change): `npm run docker:build` passed (image `wholphin-web:latest`, 258 MB; the `npm ci` layer came from the build cache). A container on the local address against the throwaway test server, with `HSTS=false`, answered `/healthz`; `/config.json` carried the server address; a deep link returned the app's page; the security headers were present, with the Content-Security-Policy narrowed to the configured Jellyfin; sign-in landed on Home; an H.264 item played 4 s with no policy violation and a Stopped report on exit (section 12.6).
- Earlier, after the first merge stage: the image built, and a container ran healthy as the non-root user against the throwaway test server.
- The app was served with its security headers; `/healthz` answered; sign-in worked; in-app addresses survived a reload.
- One H.264 item played for a few seconds under the security policy with no policy violation, and the stop was reported to the server.
- The Seerr session cookie round trip worked through the proxy (wave 3a). An independent reviewer attacked the proxy and the static handler, and the findings were fixed.
- The unit tests cover cookie rewriting, path traversal, oversized bodies, timeouts and header handling.

Not verified:

- `npm ci` and a build from a clean checkout of the merged tree (the image build of section 12.6 took its `npm ci` layer from the build cache).
- Video playback in the image built from `main` at `7ad52ba`: the smoke test of that image, below, played nothing, to keep transcodes off a real server. The last container that played a clip was built from the tree of section 12.6.
- The images built since then, up to the one of `509db33` that the trial runs: no check by the lead inside the container or through the reverse proxy is recorded for them; the owner looked at each change on the trial ([DECISIONS.md](DECISIONS.md) O-39 to O-43). Among other things no check of the project has run the worker of the PGS renderer (libpgs, a script from the app's own origin) under the production Content-Security-Policy; as the code reads, the policy's `worker-src 'self' blob:` (`server/security.ts`) allows it.
- The Caddy and nginx examples of the deployment guide as written. The trial's route was added to an already running Caddy, not from a site block in a configuration file; nginx was never run.
- `npm start` on Windows.
- The Docker image build job in CI, looked at by itself (section 13: the runs succeeded as a whole).

Nothing in this repository changes a running reverse proxy, Jellyfin or Seerr. How the app goes live is the maintainer's decision.

### Rebuilding the image and checking it

The lead rebuilt `wholphin-web:latest` three times on 2026-11-18, each time from `main` after a landing: from `3b1dd7b` (checked with plain requests: `/healthz`, `/config.json`, a deep link, the security headers), from `c358a52` before the trial behind a reverse proxy, and from `7ad52ba` (258 MB), which is the image the trial used.

The steps are the ones of [deploy.md](deploy.md), section 8:

```bash
npm run docker:build                 # or: docker build -t wholphin-web .
docker rm -f <container>             # the container keeps no data
docker run -d --name <container> --restart unless-stopped ...   # the same options as before (deploy.md sections 2 and 9)
docker ps                            # STATUS shows "healthy" within about half a minute
```

A rebuild replaces the image; a running container keeps the old one until it is removed and started again. The build stage needs no test server and starts no browser, but it is a full `npm ci` and production build, so do not run it more often than a landing needs.

**The smoke test of the trial's image** (the lead, on the image of `7ad52ba`, through the reverse proxy over HTTPS, in headless Edge):

| Check | Result |
|---|---|
| The app's page | 200, with a valid certificate |
| `/config.json` | carries the preset server and the Seerr proxy path |
| A missing file under `/assets/` | 404 (not the app's page) |
| The Seerr proxy | 200 |
| Sign-in | with the limited test account, through the screens |
| Home | its rows load |
| An item page | opens |
| Content-Security-Policy violations | 0 |
| Failed requests | one: `GET /wholphin/public`, the app's probe for the optional Wholphin server plugin, answered 404 by a server without it (expected; the end-to-end guard allows it) |

No video was played in this check: the trial used a real server that other people use. For a check that plays, build the image and run it against the throwaway test server on the local address with `HSTS=false`, as the final check's integrator did ([final-merge-notes.md](final-merge-notes.md), section 12.6); remove that container afterwards.

### A go-live: the owner's yes, a commit label and a rollback tag

Since the first public release the trial is updated one change at a time. Three rules hold for every such update ([DECISIONS.md](DECISIONS.md) O-45, T-64):

1. **The owner's yes for that build.** A new build replaces the trial only after the owner's explicit go for it. A go for one build is not a go for the next.
2. **The previous image is kept under a rollback tag** before the new one takes the name the container runs. Going back is then a matter of starting the container from that tag again; nothing has to be rebuilt.
3. **The build is labelled with its commit**, so the running container can be matched to the source it was built from.

Neither the label nor the tag is written in the `Dockerfile`, in `package.json` or in a script of this repository: the lead sets them by hand at each go-live. The lead's exact commands, label key and tag names were not recorded; with standard Docker commands the steps can be written like this (a sketch from the rules, not run for this document; the names in angle brackets are placeholders):

```bash
docker tag wholphin-web:latest wholphin-web:<rollback tag>                       # keep the image that is running now
docker build -t wholphin-web --label <label key>=$(git rev-parse --short HEAD) .  # npm run docker:build takes no label
docker image inspect wholphin-web:latest --format '{{json .Config.Labels}}'       # which commit an image was built from
docker inspect <container> --format '{{.Image}}'                                  # which image a container runs
```

Then the container is replaced as above. State on 2026-11-24: the trial runs the image built from `509db33`. Its route in the reverse proxy is still the temporary one of the trial ([DECISIONS.md](DECISIONS.md) O-27, T-53). The smoke test in the table above was the one of `7ad52ba`; for the later builds the lead's record names the checks made before each go (section 21), not a new smoke test through the reverse proxy.

## 17. npm audit state

`npm audit` reports six findings of high severity. All six come from one advisory about `picomatch`, a file-pattern library that a crafted pattern can make very slow. The project gets it only through development tools (the build tool, the test runner and their helpers), not through anything shipped to users.

- No patched release of `picomatch` exists yet.
- `npm audit fix` changes nothing. The only fix npm offers is `npm audit fix --force`, which would move the build tool and the test runner back by one or two major versions.
- Decision: do not force it, and check again when a fixed release appears ([DECISIONS.md](DECISIONS.md), T-35 and Q-27). The patterns these tools handle come from the project's own configuration, not from users.

`npm audit` was not re-run for this document; the state is as recorded in the decision.

One related licensing point: the subtitle renderer JASSUB depends on a package named `rvfc-polyfill` that is licensed GPL-3.0, which does not fit this project's GPL-2.0-only license. It is replaced by the project's own stand-in in `vendor/rvfc-polyfill`, wired in through the `overrides` setting in `package.json`. `npm ls rvfc-polyfill` shows that the local package is the one in use.

## 18. First-day checklist

1. **Clone** the repository and enter it. Install Node 24 (the version in `.nvmrc`) and Docker.
2. **Install dependencies:** `npm ci`. The install prints two `quiet-playwright` lines; both should say `applied` or `already applied`.
3. **Install the test browsers:** `npx playwright install chromium firefox webkit`. Chromium alone is enough for the crawler's default engine.
4. **Upstream source (optional).** It is needed only to re-run `npm run gen:strings` or to read the Kotlin code. Put an upstream checkout at `reference/wholphin/` (git-ignored). All generated files are already committed.
5. **Environment file.** For a first day with only the throwaway test server you create nothing by hand: step 6 writes the `TESTSRV_*` keys into `.env.local`. Add `TEST_JELLYFIN_*` only if you have a real server and a limited test account, and `DEV_SEERR_URL` only if you want Seerr in development.
6. **Create the test server:** `npm run ts:up`, `node tools/testserver/download-media.mjs`, `node tools/testserver/gen-media.mjs`, `node tools/testserver/setup.mjs`. Expect about 1.5 GB of downloads and a library scan. Then `npm run ts:verify` should print only PASS lines.
7. **Run the app:** `npm run dev`, then open `http://localhost:5173/dev/login?server=test`. You should land on the home page as the test user.
8. **Look at the components:** `http://localhost:5173/dev/gallery`.
9. **Run the checks:** `npm run typecheck`, `npm run e2e:typecheck`, `npm run test`, `npm run lint`.
10. **Stop the dev server**, then run a quick crawl: `npm run shots:quick`. Open `shots/out/<run>/index.html` (pictures) and `report.html` (health).
11. **Run the end-to-end suite:** `npm run e2e`. Without the real-server keys the Discover spec is skipped; without Microsoft Edge the specs that play video in Chromium cannot run (section 12).
12. **On a shared machine**, start the low-priority keeper first (section 14), never set `WW_ALLOW_HEADED`, and never create a Live TV recording.
13. **Optional, reference pictures.** Only when you need to compare against the TV app: the emulator steps in section 8, then `npm run shots:compare`. On the build machine the pictures have to be captured again first (section 8).
14. **Optional, production image:** `npm run docker:build`, then the `docker:run` command in section 16.
15. **Read** [CLAUDE.md](../CLAUDE.md) for the conventions, then [STATUS.md](STATUS.md) for what works.

## 19. Open items and unverified points

Tooling gaps:

- `VITE_DEV_JELLYFIN_URL` is named in [CLAUDE.md](../CLAUDE.md) but nothing reads it (section 4).
- There is no script for creating or removing a worktree, and running the test server commands from a worktree would detach the container from its data (section 14). Removing a worktree that still holds a directory link deletes the folder the link points at; the rule and the commands are in section 14.
- The Android TV reference pictures are gone from the build machine since 2026-11-18 and have to be captured again before `npm run shots:compare` is of use (sections 8 and 9). The new capture is still owed on 2026-11-24 ([DECISIONS.md](DECISIONS.md) T-57).
- Three procedures of the lead have no script in the repository, and their exact commands were not recorded: a release to the public repository (section 20), the labelled image build with its rollback tag (section 16), and the recording of frames to judge motion (section 12).
- The public repository holds two releases; the second, of 2026-11-24, came after a privacy sweep (section 20).
- `app.touchDrag` works in Chromium only; no engine other than Chromium can be sent a moving touch (section 12).
- The low-priority keeper is Windows only and does not match Playwright's WebKit processes (section 14).
- `npm run e2e:flaky` repeats the Firefox and WebKit playback spec, which the e2e README says not to repeat (section 12).
- The reference capture has no built-in Android SDK location; `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) must be set. The capture script's header comment names a `--keep-going` flag that the script does not read; continuing after a failed scene is simply what it does (section 8).
- The token generator has no unit test, the license generator only one for its author-name rule, and the crawler's capture path has none (sections 3 and 9).
- The test guide starts every program on the hour and half hour and the crawler's clock is frozen at 20:00, so Home's "Watch live" row is missing from crawl pictures (section 9).
- The first end-to-end run after `ts:reset` can fail on the page guard while Jellyfin fills its image cache; the second run is clean (section 7).
- The six `npm audit` findings wait for a patched `picomatch` (section 17).
- What to do with the pull requests Dependabot opens is undecided ([DECISIONS.md](DECISIONS.md), Q-26).

Never verified, or not verified for the merged app:

- A full crawl in all 8 themes, at laptop and tablet size, and in Firefox or WebKit at full size (section 9). The right-to-left crawl ran in full at desktop and phone size in the polish round, with no warning.
- The end-to-end suite on a machine without Microsoft Edge (section 12).
- The jobs of a CI run one by one; the runs as a whole succeeded on GitHub (section 13).
- `npm ci` and a build from a clean checkout; video playback in the image built from `main` as it stands; the Caddy and nginx examples as written; `npm start` on Windows (section 16). The image itself was built from `7ad52ba` and was tried behind a real reverse proxy.
- The worktree removal commands of section 14 as written; a new capture of the reference pictures on the reset test server.
- The touch helpers on real hardware: every touch gesture in the suite is sent to a desktop browser.
- The first-time order of the test server commands as written in section 7 (derived from the scripts), and how Jellyfin picks up a regenerated Live TV guide.
- Real Safari, iOS devices and the oldest supported browser versions (Chrome 119, Firefox 128): none was available. Playwright's WebKit build stands in for Safari; the stylesheet guard test stands in for the old engines.
- Hardware HEVC decoding: not testable headless, and therefore not tested.
- Playback of the VobSub test item with a subtitle track in the web player: the playback matrix has the server's answer for it (burn-in, section 7), no recorded playback. For the PGS item this point is closed since `bf31148`: the matrix has its answers, and `playback-direct.spec.ts` plays it with its subtitles drawn in the browser. The server-side choice of burn-in is still checked by `ts:verify`.
- The full end-to-end suite after each of the small changes of 2026-11-22 to 24: it was run once, over all of them, before the second release (section 12), and not again after the two test repairs and the privacy fixes; only the affected tests and the unit tests were re-run (sections 12 and 21).
- The image builds after `7ad52ba`, inside the container or through the reverse proxy, by the lead (section 16).
- A compare run with the changed player scenes (section 9).

## 20. Releases to the public repository

The project lives in two repositories ([DECISIONS.md](DECISIONS.md) O-33, O-35, T-58):

| Repository | Holds | Who pushes what |
|---|---|---|
| The private repository | The full history: every commit of the project, including the ones from before the privacy pass. It is the archive and the place of work. | The lead pushes `main` there after each landing. |
| The public repository | The cleaned tree, as one commit per release. | Only a release goes there. |

**Why a clean copy and not a cleaned history.** The owner chose it ("Yes, clean copy", O-35). Rewriting the existing repository's history in place would not have removed the old commits: the host keeps them reachable through the refs of pull requests. So the existing repository stays private with its history, and a new public repository holds the tree only.

**The procedure of a release** (T-58):

1. **A privacy sweep of the tree.** For the first release the owner asked for five concurrent agents, each on a different part of the tree, to find and fix (O-33); the documents were cleaned in `f3e18b1` and the remaining wording in comments and tool READMEs in `bf31148`. The second release (2026-11-24) had a sweep of its own: five readers, one per part of the difference between the first release and `main`, and a second reader for every finding who was told to refute it (phase 35; O-47). The bar: decisions the owner made may be told; nothing that describes the owner, a home, a machine or a server may, and no picture of a real server. For the documents the working agreement spells it out: no credentials, account names, e-mail addresses, real server addresses or machine-specific absolute paths ([CLAUDE.md](../CLAUDE.md), "Documentation").
2. **One commit on the public branch whose tree is the tree of `main`.** Its dates are in UTC and its author and committer are a no-reply identity. The commit carries the tree, not the history: none of `main`'s commits is an ancestor of it.
3. **Push that commit to the public repository.**

**The rule that must never be broken: the private history is never pushed to the public remote.** A plain `git push` of `main` to the wrong remote would publish every old commit. Only the release commit of step 2 goes there.

There is no script for a release, and the lead's commands were not recorded. With standard git commands, step 2 can be written like this (a sketch from the rule, not run for this document; the names in angle brackets are placeholders). The first release was one fresh commit; the second (2026-11-24) was one more commit on top of it, with the tree of `main`. The sketch is the same for both:

```bash
git rev-parse 'main^{tree}'                      # the tree to publish
# a commit with that tree on top of the public branch (the first release had no parent)
TZ=UTC git -c user.name='<no-reply name>' -c user.email='<no-reply address>' \
  commit-tree '<tree>' -p '<tip of the public branch>' -m '<release message>'
git push '<public remote>' '<new commit>:refs/heads/<public branch>'
```

**State on 2026-11-24.** The first release was published on 2026-11-18 at about 21:30 UTC (O-35); `1003992` is the README commit made for it. A second release was made on 2026-11-24 ([PROJECT-LOG.md](PROJECT-LOG.md) phase 35; O-47): one new commit on the public branch on top of the first release's commit, with the tree of `main` at that day, made with a no-reply identity and UTC dates, and pushed to the public repository; the private history was not pushed. The public repository now holds the work of phases 32 to 35.

Commit hashes in the documents are those of the private repository; a reader of the public repository will not find them there.

## 21. The fast path for small changes

Since the first release the owner hands over items one at a time, and asked for small changes to go faster without losing quality (O-38; the rule the lead set from it is T-63). A small, clear interface change takes the fast path; a large or risky one takes a multi-agent job, with the expected time stated first.

**Before the change is shown**, all on the lead's own checkout, no job with several agents:

| Step | Command |
|---|---|
| The lead edits directly | none |
| Type check | `npm run typecheck` |
| Unit tests | `npm run test` |
| The one browser test that covers the change | `npx playwright test e2e/specs/<area>.spec.ts -g "<part of the title>"` (section 12) |
| One or two headless pictures of the changed screen | a headless browser, as every browser on the machine (section 14); for an animated change, recorded frames at normal speed (section 12, "Judging motion") |
| Commit | by the lead |
| Build the image | `npm run docker:build` or the labelled build of section 16 |

The lead then asks for the go in the same message that shows the picture. The trial is replaced only after the owner's yes for that build (section 16).

**After, and out of the owner's way:** the slow checks, which are the full end-to-end suite (`npm run e2e`) and the other browsers (`--project=firefox --project=webkit --project=iphone`).

**What it costs.** The full suite has not been run after every small change. It ran once over the work of phases 33 and 34 before the second release (section 12, "Recorded results"). At `509db33` the record is: the type check passes; the unit tests pass (101 files, 897 tests); lint shows no new warning in the changed files; the browser tests of the changed areas passed when each change was made. [STATUS.md](STATUS.md) carries this as an open check.

**How the rounds of the maintenance period were run.** The four bugs of 2026-11-22 (`db14d7c`, `4a08905`, `186fe2a`, `6f16c8b`) went one agent per bug, on the owner's instruction (O-37). The work of 2026-11-23 and 24 was the lead alone on the fast path, plus one independent review of the Settings panel on 2026-11-23: two reviewers, and a third agent that tested in a browser and was stopped because it was testing the panel on its old side. The review found one real defect, through a reviewer's test: the copy of the page behind Settings was measured 10 px too wide (fixed in `398f168`). Three unfinished reviewer tests were adapted or dropped. For the other work after `7ad52ba`, agent counts were not recorded.
