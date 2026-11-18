# Project log

The chronological record of how Wholphin Web was built: who did each phase, what came out of it, what went wrong, and which commits landed it.

Last updated: 2026-11-18

Related documents: [README.md](README.md) (index), [DECISIONS.md](DECISIONS.md) (decisions), [ARCHITECTURE.md](ARCHITECTURE.md) (structure), [DEVIATIONS.md](DEVIATIONS.md) (differences from upstream), [TOOLING.md](TOOLING.md) (tools and commands), [STATUS.md](STATUS.md) (current state), [spec/](spec/) (behavior specs extracted from upstream), [CLAUDE.md](../CLAUDE.md) (working agreement).

## How to read this log

- The state labels below are the ones defined in [README.md](README.md#status-labels).
- **Built** means an agent wrote the code and its own checks passed. **Reviewed** means a separate agent examined it afterwards. **Verified in a browser** means someone drove it in a real browser and recorded the result. **Planned** means nothing exists yet.
- Numbers come from the agents' own final reports, which are kept in a local archive that is not part of the repository. Where a report is missing or incomplete, this log says so.
- Phases 1 to 17 happened on 2026-11-17. Phases 18 to 30 ran from 2026-11-17 into 2026-11-18. Most commits were made by the lead in batches, so a commit's time is when work was saved, not when it was done.
- Model tiers: **top tier** is Claude Opus, **mid tier** is Claude Sonnet. No agent so far ran on the smallest tier (Haiku). For phases 18 to 28 the workflow runner's records name each agent's model: the merge, repair, area, shared-kit, shared-code fixer and integrator agents ran on Claude Fable, a top-tier model; after the usage limit of phase 20, checkers, reviewers, area fixers, verifiers and auditors ran on Claude Opus instead (phase 20 says why). Which model the top-tier agents of phases 14 to 17 used is not recorded in this log. For phase 29, only the integrator's model is recorded here; for phase 30, no agent's model is.
- From phase 9 on, several phases ran at the same time. Phases 11 to 17 are listed in the order in which their work landed in git, and each one states when its workflow started and finished. Those clock times are taken from the workflow runner's own run records; the table at the start of phase 11 puts them side by side. Phases 18 to 29 overlap as well (the comparison pass of phase 23 ran beside phases 18 to 22, and the backdrop colours job of phase 27 beside the final check of phase 26); they are listed in the order in which each one started or, for the documents and decisions, in which it was settled.
- Phases 6, 8, 9 and 10 were first written while some of their agents were still running. Where a later report or a later commit made a sentence wrong, the sentence was corrected in place and the correction says so.

## Summary of the method

The owner asked for Wholphin, an Android TV app for Jellyfin, to be rebuilt as a web app with the same look and features. The owner also asked the lead to run the project with many agents and to document everything.

**Roles.**
- **The lead** is an AI orchestrator. It talks to the owner, makes the architecture decisions, writes the briefs and the working agreement, starts the agents, accepts or rejects their work, and makes every git commit on `main`.
- **Agents** are separate AI workers. Each gets a written brief, owns a fixed set of folders, and returns a structured final report. Agents never edit files outside their assignment without saying so, and they do not commit. There is one exception, introduced in phase 14: an agent that merges or gates a whole branch in its own worktree is authorized by its brief to commit on that branch only. It never pushes and never touches another branch.

**Waves.** The work is cut into waves. A wave is a set of agents that run at the same time on folders that do not overlap.

**Model tiers.** The lead picks a tier per task.
- **Top tier:** anything that defines a contract other agents build on, or that needs judgment. This covers the core plumbing, the UI kit, playback, Seerr, fidelity reviews and integration.
- **Mid tier:** extraction, tooling, test infrastructure and mechanical verification.
- **The lead itself:** architecture, contracts, orchestration and acceptance.

**The build, review, fix, integrate loop.** From wave 2 on, every substantive task runs as a *workflow*: a script that starts agents in phases and passes each phase's structured results to the next.
1. **Build:** one builder per track (a track is one feature area with its own folders).
2. **Review:** independent reviewers, each with one lens (fidelity to the TV app, web quality, code correctness, security, tooling). Reviewers do not fix anything.
3. **Fix:** one fixer per track. The fixer confirms each finding, fixes the real ones, rejects wrong ones with a reason, and defers anything that needs the lead or another team.
4. **Integrate (or gate):** one agent runs the whole-tree checks and makes the pieces fit together.

**Parallel lines of work in worktrees.** A git worktree is a second working folder of the same repository on its own branch. Work that would collide in one folder runs in separate worktrees, so that the groups cannot overwrite each other's files. Three were used while the app was being built:
- **`wave3a`** (folder `.worktrees/w3`): playback, settings, Seerr and the production server (wave 3a, at the same time as wave 2), and later Live TV, music and photos (wave 4).
- **`e2e`** (folder `.worktrees/e2e`): the end-to-end test suite, the CI workflow and the browser-compatibility review. It was merged into `main` and the worktree was removed.
- **`integration`** (folder `.worktrees/int`): the final merge of `wave3a` with `main`.
- Later worktrees (phases 23 to 27): **`parity`** (folder `.worktrees/parity`) for the comparison with the Android TV pictures; **`final`** (folder `.worktrees/final`, created from `integration` at `c14b168`) for merging that pass into the audited app and for the final check and repair; **`colors`** for the backdrop colour fix; **`polish`** for the polish round (phase 29); and short-lived ones for the documentation passes and for the cancelled demo. Since 2026-11-18 `main` holds all of their work (phases 28 and 29). The lead plans to remove the branches `final`, `colors`, `parity`, `integration`, `polish` and `wave3a` and their worktrees once this documentation pass is done; their commits stay in `main`'s history.

The main tree stayed the place for the shell, Home, browsing, detail pages, search and the fix pass.

**Merge, check, repair.** A branch is brought together with the main line by one dedicated integrator agent. It merges, resolves the conflicts, connects the two halves, runs the gates and writes hand-over notes. Independent checkers who did not write the code then examine the merged app, and a repair agent fixes what they found. The final merge ran on its own `integration` branch, in two stages, while `main` kept receiving fixes; the comparison pass was then merged on branch `final`, which went through a last check and repair before it landed on `main` (phases 25 to 28).

**Guards for the development machine.** The machine stays in use while the agents work. After the incidents in phase 15, every agent runs under these guards:
- Test browsers are always headless (no window) and muted, enforced by a patch that runs after every `npm install`.
- Processes started by the project's tooling are kept at below-normal priority.
- The throwaway test server is capped at 3 CPUs.
- Each agent runs one dev server and one browser at a time and keeps media tests to seconds.
- Nothing may record Live TV or create recording timers.

With these guards on, up to four workflows ran at the same time.

**Sources of truth.** The upstream Kotlin source comes first. The specs extracted from it come second, and the working agreement third (see [CLAUDE.md](../CLAUDE.md)).

## Phase 1: Reconnaissance of upstream

**Goal:** understand what has to be rebuilt and how big it is.

**Who:** the lead. No separate agent log exists for this phase.

**Outcome:**
- **Upstream** is [Wholphin](https://github.com/damontecres/Wholphin), licensed GPL-2.0, release v1.1.1. A copy of the source at commit `8dcf189` is kept in `reference/wholphin/`. That folder is git-ignored and read-only for every agent. Wholphin is a Jetpack Compose for TV client for Jellyfin.
- **Size:** 475 Kotlin files and about 107,000 lines (re-counted from the reference copy for this log). Strings exist in 41 translations.
- **Second repository:** the owner also supplied `morluto/rea`, a binary reverse-engineering toolkit. The lead assessed it and did not use it, because Wholphin is fully open source and nothing has to be reverse-engineered.

**Commits:** none of its own. The reference copy is not committed.

## Phase 2: Questions and decisions

**Goal:** settle everything only the owner can decide before building.

**Who:** the lead asked; the owner answered. All answers were given on 2026-11-17.

**Outcome:** eleven owner answers, plus the owner's explicit request for an in-app Back button. They cover the name and license, repository visibility, the look, target devices, scope and priority, playback, server choice, hosting, test servers and accounts, reference visuals and working style. Each one, with what it means for the build, is recorded in [DECISIONS.md](DECISIONS.md) Part 1 (O-1 to O-12).

The lead's own technical decisions (stack, units, colors, input model, strings, Seerr proxy, deployment shape, safety rules) are recorded in [DECISIONS.md](DECISIONS.md) Part 2 (T-1 to T-26).

**Problems:** one rule was later relaxed. At first agents were told never to submit a Seerr request, because a request could start a real download. The owner then explained that the test account has no auto-approve permission, so its requests stay pending and download nothing. The rule now allows a minimal number of obscure test requests, each withdrawn right away (commit `43241c1`).

**Commits:** `43241c1` Relax Seerr test-request rule: test account cannot trigger downloads.

## Phase 3: Spec extraction

**Goal:** turn the Kotlin into written behavior specs, so that builders can work without reading 107,000 lines each time.

**Who:** six agents running in parallel, five on the mid tier and one on the top tier. Each wrote only its own files under `docs/spec/`.

| Spec | Tier | Tool calls | Delivered |
|---|---|---|---|
| [01 design system](spec/01-design-system.md) + `design-tokens.json` | mid | 56 | All 8 color themes (parsed by script, so exact), typography, shapes, focus states, card catalog, backdrop, building blocks, drawables, web mapping notes |
| [02 shell, navigation, home](spec/02-shell-navigation-home.md) | mid | 81 | Startup flow, all 23 destinations, drawer, the 15 home row types with their requests, home customization, 25 web adaptation questions |
| [03 browse and detail](spec/03-browse-and-detail.md) | mid | 111 | About 930 lines in 17 sections: library tabs, grids, filters, detail pages, search, text-format rules, context menus, 26 web adaptation questions |
| [04 Live TV, music, photos, discover](spec/04-livetv-music-photos-discover.md) | mid | 106 | About 700 lines: Live TV/DVR, music, photo slideshow, Seerr; 32 web adaptation questions, including every direct client-to-Seerr call |
| [05 playback](spec/05-playback.md) | top | 53 | Part 1: what upstream does. Part 2: a browser mapping (device profile, fallback, keyboard scheme), labeled as a recommendation |
| [06 settings, data, setup](spec/06-settings-data-setup.md), [07 API inventory](spec/07-jellyfin-api-inventory.md) + `preferences.json` | mid | 93 | 131 preferences (65 web, 38 web-adapted, 28 android-only), local database, setup flows, screensaver, localization; every Jellyfin API call site |

**What the extractors found surprising (selection):**
- Light mode is unreachable in the app, so only dark themes matter.
- The `border` color role is really the accent color.
- Almost all typography and focus styling comes from the androidx `tv-material` library defaults, not from the app.
- Seerr is disabled only in the Fire TV build flavor.
- Upstream stores Seerr passwords and access tokens in plain text.
- Several upstream bugs, for example the theme-song "highest" volume constant `75f` and playlist removal sending the wrong id.

**Problems:**
- The extractors flagged their own weak spots. Library defaults were recalled from memory, Jellyfin REST paths were inferred from SDK method names, and many `path:line` citations were approximate.
- The playback agent could not determine several things, for example whether the SDK puts the API key into stream URLs. The MPV player backend is a closed library with only a stub in the repository.

These weak spots led directly to the spec audit (phase 7) and the library-defaults check (wave 1).

**Commits:** the specs landed with the scaffold in `8a2dc8f`.

## Phase 4: Environment probing

**Goal:** know what the development machine offers and what must not be touched, before any agent runs.

**Who:** the lead. There is no separate log. The facts below are as the lead recorded them in the wave 1 briefs.

**Outcome:**
- **Toolchain:** Windows, Node 24, Java 25, Git Bash and PowerShell, and Docker. The Android emulator needs the Windows Hypervisor Platform for acceleration. An Android SDK was already installed, but with only a phone system image.
- **Live services:** a real Jellyfin and Seerr that other people use. Every brief lists them as off limits.
- **The emulator** signs in only to the throwaway test server.

**Commits:** none.

## Phase 5: Scaffold and design-token pipeline

**Goal:** lay down the contract every agent builds on.

**Who:** the lead itself, deliberately. The working agreement and the token pipeline define how everyone else writes code, so they were not delegated.

**Outcome:**
- **Scaffold:** Vite, React and strict TypeScript, with the dependency set chosen in [DECISIONS.md](DECISIONS.md) T-1.
- **Working agreement ([CLAUDE.md](../CLAUDE.md)):** sources of truth, stack, folder ownership, conventions (units, colors, type, focus, layout, data, preferences, strings, routing, components), commands, and hard safety rules.
- **Design tokens:** `tools/gen-tokens.mjs` turns `docs/spec/design-tokens.json` into `src/theme/tokens.css` (CSS variables for all 8 themes) and `src/theme/typography.css`. Elevated surface colors are precomputed with the Material formula. Components may use colors only through these variables.
- **Units and scale:** CSS is written in px where 1px equals one Android dp (density-independent pixel). A PostCSS step (`postcss-pxtorem`) converts px to rem at build time. The root font size carries the interface scale, so everything scales together (`src/theme/scale.ts`; [DECISIONS.md](DECISIONS.md) T-3).

**Commits:**
- `8a2dc8f` Scaffold Wholphin Web: Vite/React/TS, specs extracted from upstream, working agreement
- `2e1e11d` Add design-token generator, theme CSS, interface scale, px-to-rem pipeline

## Phase 6: Wave 1 (foundations)

**Goal:** build the foundations in parallel: core plumbing, the UI component kit, a reference-screenshot rig and a throwaway test server.

**Who:** four agents (two top tier, two mid tier) plus one top-tier research agent. They ran while the spec audit (phase 7) was also running, which caused one visible collision (see 1A).

### 1A: Core plumbing (top tier, 139 tool calls)

**Asked:**
- Generators for strings and preferences.
- i18n.
- The multi-server, multi-user session layer on the official Jellyfin SDK, with a preset-server option read from `/config.json`.
- The query layer and image URLs (a port of upstream's `ImageUrlService`).
- The preferences store, the router with a stub page for every upstream destination, auth guards, and arrow-key spatial navigation.
- A temporary setup UI, a dev-only sign-in helper that keeps the password on the dev server, and formatting helpers.

**Delivered:**
- **Router:** the route table documented at the top of `src/app/routes.tsx`.
- **Shared API surface:** the hooks and functions other agents use, such as `useApi`, `connectToServer`, `qk()`, `getItemImageUrl`, `usePrefs`, `nav.*` and `spatialNav`.
- **Strings:** all 41 locales converted from Android XML to i18next JSON.
- **Preferences:** a generated preferences module.
- **Sign-out:** calls `POST /Sessions/Logout`, which upstream forgets to do.

**Verified:**
- 65 unit tests pass.
- 19 Playwright browser checks pass against the real server with the test account: deep link while signed out, add server, password login, reload, theme switch, Hebrew right-to-left, an expired token, dev login, sign-out and arrow keys.

**Not verified:** the Quick Connect code screen.

**Surprises and choices:**
- **Spec changed mid-task:** `docs/spec/preferences.json` changed under the agent while it worked, because the audit was editing it. The generator was adapted to the new shape.
- **Preference scope:** most preferences are kept per browser, as upstream keeps them per device. Only language and track preferences are kept per user.
- **Defaults:** the agent used the defaults upstream actually applies on a fresh install, which differ from its UI defaults in three places.
- **Typecheck:** one error remained, and it was in the UI kit's folder.

### 1B: UI component kit (top tier, 222 tool calls)

**Asked:** every shared presentational component (icons, buttons, the card family, rows and grids, dialogs and menus, inputs, text pieces) matching upstream values. Also: check the values the spec marked "library default, unverified" against the real androidx `tv-material` source, and build a gallery page with screenshots.

**Delivered:**
- **Components:** about 60 components exported from `src/ui/index.ts` (59 are named in [ARCHITECTURE.md](ARCHITECTURE.md) section 10), plus a gallery page.
- **Library values:** `src/ui/LIB_DEFAULTS.md` records the confirmed library values with their sources.

**Verified:**
- Typecheck, tests and lint pass.
- Gallery screenshots at 1920x1080, 1280x720 and 390x844 in the Purple, OLED Black and Bold Blue themes, plus right-to-left. The agent looked at them and fixed three visible problems.
- It did not compare against upstream's own README screenshots.

**Surprises:**
- **No `1.1.0-alpha01` tag:** that version of `tv-material` has no tag, so values were read from the library's main branch.
- **Card corners:** the card corner radius is 8dp, not the 12dp the spec guessed.
- **Type scale:** four letter-spacing values in the type scale were wrong.
- **Avatar colors:** the user-circle color function could be ported exactly, despite the spec saying it could not.

**Left unfinished:**
- When keyboard focus and mouse hover land on different cards, both look focused. This is still open; see [STATUS.md](STATUS.md) section 4, item 1.
- Spring animations are approximated as eases.
- The agent left its gallery dev server running.

### Library-defaults check (top tier, 21 tool calls, read-only)

**Asked:** confirm the exact `tv-material` default values (type scale, shapes, card, surface, button, list item, drawer item, switch, elevation formula, progress indicator) from the library source.

**Delivered:** a sourced table of values. It agreed with the UI kit's findings: card shape 8dp, focus scale 1.1 with a 3dp border, scale animation 300ms in and 500ms out.

**Not verified:** the exact release tag, the glow and border internals, and the list item's disabled alpha.

**Effect:** the type scale in `design-tokens.json` was corrected in `cdb90aa`.

### 1C: Android TV emulator and reference shots (mid tier, 303 tool calls)

*Corrected after the agent finished. When this section was first written the agent was still running (210 tool calls so far), and the archive held no final report for it.*

**Asked:**
- An Android TV emulator running the official Wholphin APK.
- Scripts to create, start and stop it.
- A scene-based capture script that drives the app over `adb` and saves screenshots with a manifest.
- Signing in through Quick Connect on the throwaway test server only, so no password is ever typed into the app.

**Delivered:**
- `tools/refshots/` with `emulator.mjs`, `capture.mjs`, a scene list, and a README covering setup, commands, sign-in and known flaky spots.
- **Pictures:** the agent's final report counts 203 pictures in 33 scenes of app v1.1.1, at 1920x1080 and 320 dpi, which is the standard 960x540dp TV canvas. The app was signed in through Quick Connect: the code was read from the screen and authorized through the Jellyfin API. (The manifest listed 210 entries at the moment this section was first written, while the agent was still re-running scenes.)
- **Disk:** about 9.6 GB by the final report: 8.2 GB for the Android TV system image, 1.3 GB for the virtual device, 52 MB for the app package and 153 MB of pictures. A running emulator adds a 2 GB memory file that is deleted when it stops.
- **Acceleration:** the Windows Hypervisor Platform works; a headless boot takes about 30 seconds.

**Verified:** one full pass plus targeted re-runs of failed scenes. The agent opened about 25 of the pictures and found none black or wrong. The others were not opened.

**Not captured:**
- The episode detail page. Upstream's episode page cannot be reached through normal navigation, because episodes open the series overview, so only the episode context menu was shot.
- The skip-intro button, because the throwaway test server had no media segments, and Live TV. Both were captured later, in phase 11.

**What the real app showed that the specs did not say (selection):** Favorites is a tabbed grid, not rows. Settings are full-screen pages without the drawer. With a 10.11 server the app shows a "will not be supported soon" banner. The drawer gains a "Now playing" entry while music plays.

**Problems:**
- **Still running into wave 2:** it kept adding shots after wave 2 started (the wave 2 briefs say "another agent is still adding more"). Its later changes to `tools/refshots/` were committed with wave 2 in `b37c856`, and the final scenes and the npm scripts `ref:emu` and `ref:shots` in `c2dc99c`.
- **Disk full:** the disk filled up once during the capture and a few scenes failed with "no space left". The agent re-ran them. The cause was not the emulator; see phase 15, incident 4.
- **Side effects:** the app changes the throwaway test server when it plays items (resume positions, watched flags). One favorite it toggled was restored.

### 1D: Throwaway test server (mid tier, 117 tool calls)

**Asked:**
- A disposable Jellyfin in Docker on its own port, with realistic media for every screen.
- Synthetic codec test files for playback.
- Scripted, repeatable provisioning of users, libraries and seeded watch state.
- Commands to start, stop and reset it.

**Delivered:**
- **Server:** Jellyfin 10.11.11 pinned in `dev/testserver/docker-compose.yml`.
- **Scripts:** provisioning and media scripts in `tools/testserver/`.
- **Libraries:**
  - 13 Blender open movies by the builder's count (12 movie folders on disk), one with two versions and one with a trailer and extras.
  - A "Codec Zoo" of synthetic test files, 14 items by the builder's count; the generator makes 13 (see [TOOLING.md](TOOLING.md) section 6). Contents (H.264, HEVC 10-bit, HDR10, AV1, VP9, MPEG-4 ASP, MPEG-2, a multi-audio and multi-subtitle file with styled ASS, a 10-chapter file, 4K, long, Hebrew and Japanese titles).
  - 4 synthetic series with 56 episodes, 6 music albums with 42 tracks, 30 photos, box sets and playlists.
  - A small Live TV setup: 4 channels with about 150 guide entries.
- **Seeded state:** resume points, favorites and next-up entries for the test user.

**Verified:**
- Provisioning ran twice, and the second run was a no-op.
- A `verify` command passes all API checks.
- Nothing was checked in a browser.
- Size is about 3.4 GB including the image.

**Surprises:**
- **Not produced:** PGS and VobSub image subtitles, because the bundled ffmpeg cannot create them. One short film could not be re-encoded and was left out.
- **Rate limits:** Wikimedia Commons rate-limited the downloads, so the agent switched sources.
- **Metadata mismatch:** TMDb matched "Spring" to an unrelated film, so the folder name now carries the TMDb id.
- **Live TV:** the Live TV channels stream library items through Jellyfin itself.
- **npm scripts:** the agent asked for `ts:up`, `ts:down`, `ts:reset` and `ts:verify`. They were added.

### Wave 1 commits

- `e407b3c` Core plumbing: session/servers, router and route stubs, i18n (41 locales), preferences, image URLs, spatial navigation; UI kit and tooling in progress; specs audited against upstream
- `47270e2` Test server tooling and npm scripts; spec audit corrections; UI kit progress
- `cdb90aa` UI component kit with gallery; shared backdrop and user-views contracts; type scale corrected against tv-material

Three small infrastructure commits followed. They let several agents run dev servers side by side and keep the worktree out of tooling:
- `4773184` Allow per-agent Vite cache dir
- `5b0c9ab` Ignore agent worktrees; narrow dev-server file watching
- `029b43d` Lint: ignore worktrees and generated folders

One late commit closed track 1C after its agent finished:
- `c2dc99c` Reference-shot tooling for the Android TV emulator: npm scripts and final capture scenes

## Phase 7: Spec audit workflow

**Goal:** re-check every claim in specs 02 to 07 against the Kotlin, correct the specs in place, and find behavior no spec describes at all. The first-pass specs contained approximate citations and values recalled from memory, and a wrong value in a spec becomes a bug in the port.

**Who:** one workflow with 35 agents. All 35 returned. It ran at the same time as wave 1.

| Stage | Agents | Tier | Job |
|---|---|---|---|
| Verify | 17 (2 to 4 slices per spec) | mid; top for playback (4) | Read-only, statement by statement: compare each spec section with the Kotlin it cites; Jellyfin REST paths settled from the installed SDK |
| Audit preferences | 1 | mid | Check and correct `preferences.json` |
| Apply | 6 (one per spec) | mid; top for playback | Re-confirm each finding against the Kotlin, edit the spec, reject wrong findings with a reason |
| Sweep | 10 (one per source area) | mid | For every Kotlin file, search the specs for what it does; report what is missing |
| Synthesize | 1 | top | Deduplicate, spot-check, write `08-coverage-gaps.md` |

Spec 01 (design system) was not in this audit. Its library values were checked by the library-defaults agent and the UI kit agent in wave 1.

**Results per spec** (verify findings, then what the single editor did):

| Spec | Corrections (high / medium / low) | Missing items | Applied by editor | Listed as rejected |
|---|---|---|---|---|
| 02 shell, navigation, home | 38 (1 / 13 / 24) | 29 | 68 | 4 |
| 03 browse and detail | 46 (3 / 13 / 30) | 30 | 62 | 3 |
| 04 Live TV, music, photos, discover | 39 (2 / 12 / 25) | 35 | 86 | 2 |
| 05 playback | 32 (2 / 9 / 21) | 41 | 62 | 0 |
| 06 settings, data, setup | 35 (1 / 9 / 25) | 20 | 65 | 0 |
| 07 API inventory | 29 (1 / 15 / 13) | 16 | 48 | 4 |
| **Total** | **219 (10 / 71 / 138)** | **171** | **391** | **13** |

Notes on these numbers:
- The "applied" counts are as each editor reported them. Editors sometimes split or merged findings, so they do not add up exactly to corrections plus missing items.
- Several "rejected" entries were applied in a corrected form rather than dropped. For example, a reviewer cited the wrong file and the editor fixed the citation.

**Preferences audit:** 131 entries checked, 24 values corrected, 2 entries added, 3 reclassified. For example, the default for "max days in next up" was 7 and is really -1 (no limit). The four music display preferences had no titles and wrong defaults.

**The most consequential corrections:**
- **Wrong endpoints.** Continue Watching uses `GET /UserItems/Resume`, not `/Items/Resume`. Capabilities go to `POST /Sessions/Capabilities`, not `/Full`. Spec 07 also wrongly said the TypeScript SDK has per-controller accessors such as `getItemsApi`. It merges them, and the doc now lists the real ones (`getLibraryApi`, `getUserDataApi` and others).
- **AV1 default.** The stored default of `decodeAv1` is false on a fresh install, even though the settings screen shows true. This changes the device profile.
- **Auto sign-in failure.** When the saved token is rejected or the server is down, upstream lands on the server list, not the user list.
- **Theme songs** play on movie, episode and series pages too, not only on collections.
- **Subtitle backgrounds.** The "wrap" and "boxed" background modes were described the wrong way round.
- **Seerr season requests** send only the selected seasons. Clicking "Pending" on a TV title opens the season dialog.
- **Extras** resume where they were left and open a grid when there are several. They do not always play from 0.

**The coverage-gaps document.** [`docs/spec/08-coverage-gaps.md`](spec/08-coverage-gaps.md) lists behavior the specs missed. The 10 sweeps produced 110 candidates. After deduplication 104 gaps remain: 4 high, 24 medium, 76 low. Five duplicates were merged and one candidate was dropped. Every high item and about a third of the rest were re-checked against the source. The document ends with the ten gaps a user would most likely notice. Later waves' briefs tell each builder to read its section.

**Problems:**
- The audit edited `preferences.json` while the wave 1 plumbing agent was generating code from it. The generator was adapted (see 1A).
- The preferences auditor noted that `06-settings-data-setup.md` still said "131 entries" after the edit.

**Commits:** the corrected specs landed in `e407b3c` and `47270e2`, together with wave 1 work.

## Phase 8: Wave 2 (shell, setup, home, screenshot crawler)

**Goal:** the first real screens: the app shell (navigation drawer, backdrop, clock, Back handling), server and user setup with login, the home page with shared item logic, and an automatic screenshot crawler.

**Who:** one workflow in the main tree with 15 agents, from 14:48 to 16:31. All 15 returned. (The first version of this log said the integrator had returned nothing; see Integration below.)

| Stage | Agents |
|---|---|
| Build | 4: shell, setup, home (top tier); crawler (mid tier) |
| Review | 6: fidelity to upstream for shell, setup and home (top tier, one each); web quality (mid); code correctness (top); crawler (mid) |
| Fix | 4, one per track: shell, setup, home (top); crawler (mid) |
| Integrate | 1 (top tier): full gates, crawler runs, end-to-end journeys, cleanup |

**Review totals:** 51 findings: 0 blockers, 13 major, 38 minor.

### Shell track

**Built:**
- **Navigation drawer:** items, order, icons and per-theme colors as upstream. On wide screens it is a 64dp rail that expands on hover, keyboard focus or tap. On phones (under 600 CSS px) it is an overlay sheet.
- **Backdrop:** upstream's blank, wait 500ms, then publish-if-still-current flow, with masks and dim. Dynamic corner colors come from a port of Android's Palette.
- **Other pieces:** the clock, an in-app Back button with Escape handling, focus and scroll restore on Back, and a page fade.

**Verified:**
- Both servers at four sizes, in Purple and OLED Black, and in Hebrew right-to-left.
- 112 tests pass at that point.

**Review findings (shell):** 1 major, 3 minor.
- **Major:** OLED Black drawer icons used the wrong colors in focused states.
- **Minor:** mouse hover and keyboard focus could highlight two drawer items at once. Home clicked on Home refetched every query. The backdrop could not take a plain image URL.
- The code reviewer added one more major: the profile entry sent the next user to the previous user's page.

**Fixer:**
- Of 9 findings in total (from the reviewers), the fixer fixed the ones named above, rejected 1 and deferred 2 (listed below). The OLED rules were rewritten so that source order decides. The double highlight is suppressed while an item has keyboard focus.
- Added a `submitBackdropUrl` API.
- The OLED drawer colors now come from generated tokens instead of hex literals in the stylesheet.

**Rejected:** "no way to sign out or switch user on touch". Switching works through the profile entry, and upstream has no separate sign-out item there.

**Deferred:**
- A duplicate Live TV folders request. The home track owns the fix.
- A helper for page-owned backdrop colors. It belongs to the later music track.

### Setup track

**Built:**
- Ports of upstream's server list, user list, login (password and Quick Connect), PIN entry and set-PIN flow.
- Server probing with version warnings, and an add-server dialog with upstream's error texts.
- A PIN pad on screen for touch and mouse.
- `?next=` deep links survive every step.

**Verified:** wrong password, unreachable URL, non-Jellyfin URL, Quick Connect end to end on the throwaway test server, PIN set and enter and wrong PIN, expired token, and preset-server mode.

**Review findings (setup):** 6 minor from the fidelity reviewer. Examples: the login dialog was its own route and reloaded the picker, a button was 48dp instead of 40dp, a Quick Connect 401 did not turn Quick Connect off, and keyboard delete lost focus. Web-quality and code reviewers added more: labels not clickable, avatars requested for users without one, an unsafe `?next=` value accepted, and keys typed during the wrong-PIN shake were lost.

**Fixer:** fixed 10 of 11. Rejected one ("nothing is focused after sign-in"), because it did not reproduce.

### Home track

**Built:**
- All 15 home row types with upstream's encode and decode rules, presets and per-user persistence.
- One query per row, at most 4 at a time.
- The header follows focus, hover or tap.
- Context menus with upstream's entries and conditions.
- Favorite, played and remove-from-next-up actions with narrow cache updates.
- The "view more" grid, and a shared `src/features/common/` layer for card adapters, text rules and item actions.

**Verified:**
- Default rows match direct API calls on the real server.
- Seeded state shows correctly on the throwaway test server.
- Keyboard walk, right-click menus, and Back restoring card, scroll and header.
- 142 tests pass at that point.

**Review findings (home):** 4 major and 5 minor from the fidelity reviewer.
- **Major:** moving Up or Down into a row did not return to that row's remembered card. Arrow Right on the last card jumped rows. Focusing "View more" swapped the header. The grid opened with no focus.

The code reviewer added:
- **Major:** a custom-endpoint row could send the user's Jellyfin access token to another host.
- **Major:** a stale backdrop timer after Back.
- **Minor:** several issues, including an aria-live header that announced every hover.

The web-quality reviewer added:
- **Major:** the header logo was on the wrong side in right-to-left.
- **Minor:** every card was its own Tab stop.

**Fixer:** fixed 19 of 21.
- The token leak is closed: only same-origin paths under the server's base path are allowed, with tests.
- Each row is now one Tab stop.

**Rejected:** a "title indent". The indent is padding inside the logo image, and the TV shows it too.

**Deferred:** progressive row loading and refresh only when older than 5 seconds. Upstream waits for all rows and refreshes on every visit, so matching it is a product decision for the lead ([DECISIONS.md](DECISIONS.md) Q-5).

### Crawler track

**Built:** `tools/shots/`:
- **Commands:** `npm run shots` signs in through the dev helper, finds real item ids through the API, and photographs about 80 scenes across 4 viewports and 8 themes. It waits for a settle check before each shot and writes a health record per picture.
- **Reports:** an HTML contact sheet and a report.
- **Comparison:** `shots:compare` pairs web shots with the emulator's reference shots.

**Verified:** a full run produced 2,336 pictures in about 8 minutes. Many of its 836 errors came from other agents' half-saved files during the run.

**Review findings (crawler):** 3 major, 7 minor.
- **Major:** the settle check ignored JavaScript timers. Drawer scenes on phone and tablet did not show the drawer. One scene used a wrong row id and photographed an empty page.

The reviewer's own full run: 2,336 pictures, 64 ok, 2,144 with warnings and 128 errors. All 128 errors were one avatar request blocked by the browser on the user list.

**Fixer:** fixed all 10.
- An 800ms pause after interactions.
- Drawer opening per input mode.
- A frozen browser clock and mocked Quick Connect codes, so pictures are reproducible.
- Cleanup on Ctrl+C and kill signals.
- The reference pairing table grew from 16 to 35 pairs, as the fixer reported. The file held 33 pairs when the documentation was checked; the difference is not explained in the archive.

**Deferred (4 items):** three scenes that lack data on the throwaway test server (a movie resume point, a folders library, DVR recordings), the missing highlight in the touch drawer picture (a design choice for the lead), a type error in the home track's in-progress file (not the crawler's to fix), and two cosmetic warnings owned by other tracks.

### Integration

*Corrected. The first version of this log was written from an archive that had been generated before the workflow finished, so it held no result for the integrator. The regenerated archive has the integrator's report, summarized here.*

**Who:** one top-tier agent with the whole tree to itself.

**Gates:** `gen`, `typecheck`, `test` (20 files, 145 tests), `lint` (0 errors, 18 warnings) and `build` all pass.

**Crawler:**
- **Throwaway test server, full run:** 2,432 pictures (79 scenes in 4 viewports and 8 themes): 768 ok, 1,664 with warnings, 0 errors. 3 scenes were skipped for lack of data. Every warning is a route stub, a placeholder page that a later wave replaces.
- **Real server, restricted run** (1920x1080 and 390x844, Purple): 134 pictures: 46 ok, 88 with warnings, 0 errors, 12 scenes skipped.

**Fixed (9 items), among them:**
- Launch focus on Home could land on a later row, because rows arrive one by one. It now waits until every row above has loaded or failed.
- A Hebrew title on an English interface was pushed to the far end of the Home header column.
- A keyboard-only user who landed on a page with nothing focusable was stuck. An arrow key now enters the drawer.
- The duplicate Live TV folders request that the shell fixer had deferred.
- The crawler photographed Home during the backdrop's 500ms blank interval. The backdrop layer now reports itself as busy and the crawler waits.
- A leftover development page and five unused web-only strings were removed.

**Journeys walked** on the throwaway test server with mouse at 1920, keyboard only at 1920, and touch at 390x844: cold start on a deep link, add server, user list, login (Quick Connect, then password), back to the deep link, Home, an item, Back, the profile entry, the user list, Home, sign out. Back restored the focused card and the scroll position.

**Not verified:** a right-to-left run, the themes other than Purple through the journeys (the crawler covers them), and a real touch device.

**Left for the lead (6 decisions):** where to put sign-out, whether Home rows load progressively, the backdrop on portrait screens, the initial focus ring on touch setup screens, seeding the throwaway test server for the three skipped scenes, and the touch drawer picture. Four of them (sign-out, the portrait backdrop, the touch focus ring and the seeding), together with two smaller points from the same report (the View-more grid's end inset and a duplicate display-preferences request), became the work list of wave 3b's polish track (phase 12).

The lead then committed wave 2 as `b37c856`.

### Problems in wave 2

- **Wrong starting folder.** Several reviewers and fixers were started in the wave 3a worktree. The wave 2 code existed only, uncommitted, in the main tree. Each agent noticed this, worked in the main tree as its brief named it, and left the worktree untouched.
- **Shared machine.** Builders shared one tree and one machine. Type and lint errors from other agents' half-finished files showed up in each other's runs. One fixer saw a type error from the home fixer's in-progress file, and it was gone on the final run.
- **Server side effects (setup builder):** about four sign-ins with the test account on the real server, plus a few failed logins. Quick Connect authorizations and sessions on the throwaway test server.
- **Server side effects (home builder):** toggled a favorite, mark-watched and remove-from-next-up only on the throwaway test server, and restored each.

**Commits:**
- `b37c856` Wave 2: app shell (nav drawer, backdrop, clock, Back handling), setup/login/Quick Connect/PIN screens, Home page with shared item adapters and context menu, screenshot crawler
- `11aac42` Mute every test browser: postinstall patch for Playwright launches and a hard rule (see [TOOLING.md](TOOLING.md), "Muted test browsers")

## Phase 9: Wave 3a (playback, settings, Seerr, production server)

**Status: finished.** The wave was built, reviewed and fixed on branch `wave3a` and committed there as `318ad04`. Phase 14 continued on the same branch, and phase 17 merged the branch with the main line on branch `integration`. When this was first written it was not on `main` yet (stage 2 of the final merge was in progress); it reached `main` with `integration` on 2026-11-18 (`c14b168`, phase 22).

*This phase was first recorded while the playback UI was still being built. The status, the stage table, the playback UI section, the two sections after it and the commit line were updated when the wave finished.*

**Goal:** the riskiest feature (playback), the settings screens, Seerr discover and requests (the owner's top priority after movies and TV), and the production server with Docker packaging.

**Who:** one workflow in the worktree (`.worktrees/w3`, branch `wave3a`), started from commit `029b43d` at the same time as wave 2. It ran from 14:52 to 17:47. 18 agents started and 18 returned (12 top tier, 6 mid tier).

| Stage | Agents |
|---|---|
| Build | 5: playback engine (top tier), then playback UI (top) on top of it; settings (top); Seerr (top); deploy server (mid) |
| Review | 8. Deploy: operations and security (top). Settings: fidelity (mid), web quality (mid). Seerr: fidelity (top), code and security (mid). Playback, after the playback UI: fidelity (top), a real playback matrix (mid), code (top). |
| Fix | 4, one per track: deploy (mid), settings (top), Seerr (top), playback (top) |
| Gates | 1 (top tier): whole-tree gates in the worktree and the merge notes |

**Review totals:** 49 findings: 0 blockers, 11 major, 38 minor. By track: deploy 6, settings 10, Seerr 14, playback 19.

### Playback engine

**Built:** a headless port of upstream's playback logic under `src/features/playback/engine/`.
- **Device profile:** runtime capability detection builds the profile sent to Jellyfin.
- **Start sequence:** upstream's, with the queue built once.
- **Backends:** three of them: native file playback, hls.js, and native HLS on Apple browsers.
- **Fallback ladder:** direct play, then remux, then full transcode, then a clear error. It never loops. Remux means the server repackages the stream without re-encoding the video.
- **Track selection:** exact ports of upstream's track-selection services.
- **Subtitles:** text subtitles are drawn by the app. ASS goes through JASSUB with the file's fonts. Image subtitles are burned in by the server.
- **Reporting and the rest:** progress reporting including on tab close, media segments, Next Up, trickplay math, Media Session and wake lock.

**Verified:**
- 279 tests pass in the worktree at that point. They include ported upstream unit tests (84 cases).
- **Throwaway server:** in system Edge, every Codec Zoo file and several Blender films. Frames advance, audio decodes, seek works, and server progress matches the client. The results are in `engine/PLAYBACK_MATRIX.md` in the worktree.
- **Real server:** several items with formats the test files do not cover, read-only with the limited test account.

**Bugs found by real playback and fixed:**
- MP3 in fMP4 HLS was declared with a codec string Chromium rejects.
- Live TV needed a TS transcoding profile.
- Jellyfin labels a remux "Transcode", which made the ladder give up early.
- A subtitle cue was not cleared after a delay change.
- A render loop in the subtitle style hook.

**Not verified:**
- Safari and iOS, and Firefox. The installed Firefox could not be automated.
- HDR on an HDR display.
- A real silent failure caught by the watchdog.
- Cinema-mode intros.
- Touch and real phones.

**Side effects:** the real-server runs left resume points and play counts on 8 items for the test account, and one item was marked played. All were reset and re-checked.

### Playback UI

**Built** (top tier, after the engine), under `src/features/playback/ui/`:
- **Controls overlay** as upstream draws it: title block, seek bar, the button row in upstream's order, chapters and queue rows, auto-hide, the skip indicator, the floating Skip button for intro and outro segments, the Next Up panel with its countdown, a debug overlay, and an error screen with Retry and "Play with transcoding".
- **Dialogs** inside the player, so they stay visible in fullscreen: settings (speed, scale, subtitle delay, maximum bitrate), captions, audio, subtitle search and download, and a shortcuts sheet.
- **Input:** upstream's key handling (tap and hold seeking, Back hides the controls, then dismisses Skip, then cancels Next Up, then leaves), plus web shortcuts, mouse (move shows the controls, click toggles play, double-click fullscreen, wheel volume, hover preview on the seek bar) and touch (tap, double-tap to seek, drag on the seek bar).
- **Engine additions:** a retry command, reload with a subtitle, and playback speed kept across stream restarts.

**Verified by the builder:**
- In the system Edge, muted, with real media at 1920x1080: every button and dialog with the mouse; keyboard-only seeking and shortcuts; chapters; an episode with a successor (queue row, Next Up countdown, autoplay of the next episode); touch at 390x844 and 844x390; a Live TV channel; forced error paths.
- On the real server with the limited test account: one episode with intro and outro segments (Skip Intro and Skip Outro). The episode got marked played during the test; the builder reset it and confirmed the reset.
- 295 tests pass at that point, 16 of them new.
- These runs used a visible browser window, which the briefs then still preferred for hardware decoding. Phase 15 (incident 2) explains why that stopped.

**Not verified:** Safari, iOS, Firefox and Chrome with the new controls (Edge only); real phones; hardware media keys; a successful subtitle download (neither test account has the permission, so only the refusal path ran); remote trailers; cinema-mode intros; the HDR subtitle style on an HDR display; a right-to-left interface.

### Playback reviews and fix

Three reviewers examined engine and controls together: 19 findings, 7 major and 12 minor.

- **Fidelity (top tier):** 4 minor. Examples: the skip-back-on-resume preference was applied at start, which upstream does not do; the image-subtitle opacity preferences have no effect, because the web always lets the server burn image subtitles in.
- **Real playback matrix (mid tier):** 1 major, 3 minor. The reviewer was told to trust nothing in the builder's matrix and to reproduce it.
  - **Reproduced** in headless Edge 157 on the throwaway test server: 13 Codec Zoo files and four Blender films play with the method the builder's matrix lists. For each one the position and the decoded frames advance, audio is decoded, a seek to the middle lands within 6 seconds and keeps playing, and the server's session position stays within 1 second of the client's. The Blender films saved resume points that match where the client stopped, and Stop clears the server session. Audio switching, text subtitles, styled ASS subtitles and burned-in image subtitles were confirmed, some of them on real-server items. Firefox 159 passed a subset.
  - **Side effects:** the reviewer reset the resume points and play counts its runs left on 7 real-server items and checked each reset.
  - **Major:** a high-resolution HDR transcode on the real server did not resume within 6 seconds after a seek to the middle, and a later audio switch also stalled.
  - **Not completed:** the forced-failure ladder, the Stopped report on tab close, and Chrome on the full set. The throwaway test server went down when the disk filled up during the run (phase 15, incident 4).
- **Code (top tier):** 6 major, 5 minor. The major ones:
  - Leaving the player while a stream was still loading reported position 0 and wiped the server's resume point.
  - A track or bitrate change during a restart restarted the item from 0.
  - A leftover seek listener carried one stream's start position into the next stream.
  - After the final fallback failure hls.js kept downloading, so the server restarted the transcode it had just been told to stop.
  - The error screen could not be operated from the keyboard.
  - Once a certain signal was set the controls could never hide again, and keyboard Back could not leave the player.

**Fixer (top tier):** fixed 13, rejected 3, deferred 3. 301 tests pass, 6 of them new.
- **Fixed:** all six major code findings, each re-checked in headless Edge on the throwaway test server, and seven minor ones. Among the minor ones, subtitle and font requests now send the access token in a header instead of the URL.
- **Rejected:** a 1280x720 against 1280x725 size reading (the browser reports the coded size of the synthetic file); a stutter at the start of an HDR tone-mapping transcode (the CPU-capped throwaway server is slower than real time at first); slow starts and HTTP 500 fragments in Firefox (the reviewer itself tied the errors to the full disk, and a re-run with free space passed).
- **Deferred:**
  - The HDR transcode stall. It cannot be re-run within the rules: no repeated heavy transcodes on the real server, and the throwaway server has no such file.
  - Two similar speaker icons in the control row (the web-only volume control next to upstream's audio-track button), a design choice for the lead or the owner.
  - Hiding the two image-subtitle opacity preferences, which belongs to the settings track.

### Gates and merge notes

One top-tier agent ran the whole-tree checks in the worktree.
- **Gates:** `gen`, `typecheck`, `test` (21 files, 301 tests), `lint` (0 errors, 21 warnings) and `build` pass. The build warns that the player chunk is 795 kB.
- **Docker:** the image built after one fix (the Dockerfile ran `npm ci` before the post-install script had been copied in). One container served the app; sign-in through the setup screens worked; an H.264 file played directly and an HEVC file played as a transcode, 20 seconds each, under the production security policy with no policy violation. The container was removed afterwards. This closes the "media playback under the security policy" gap listed under the production server below.
- **Smoke test** in headless Edge at 1920x1080 and 390x844: the settings pages, both playback items, and Discover on the real server linked as the limited test account. No Seerr request was submitted.
- **Not testable headless:** HEVC direct play. Only the transcode path was exercised.
- **Hand-over:** `docs/wave3a-merge-notes.md` on the branch lists the files changed outside the owned folders and six points for the lead: two stores for pinned drawer items, doubled Back buttons, when the Discover drawer entry shows, where the per-user settings entry lives, whether Discover uses the shell's backdrop, and the expected textual conflicts. All six were settled in the merge stage of phase 14.

### Settings

**Built:**
- **Screens:** all upstream settings screens, generated from the preference data, in upstream's order. The panel sits on the end edge (full width on phones).
- **Controls:** every control type.
- **Theme picker:** a live preview.
- **Subtitle style editor:** a live preview and an HDR copy.
- **Per-user page:** includes the PIN.
- **Other pages:** About, Licenses (a new generator, `tools/gen-licenses.ts`, lists dependency licenses and the upstream attribution) and Debug.

**Verified:**
- Keyboard-only walk at 1280x720.
- Persistence across reload.
- Hebrew, phone and OLED Black.
- Quick Connect authorize and send-logs on the throwaway test server.
- 260 tests pass at that point.

**Review findings:** 10 in total, 1 major and 9 minor.
- **Major:** the "Start screensaver" row did nothing.
- **Minor:** no focus wrap at list ends, subtitle preview overlap at 360px, the HDR reset differed from upstream, touch targets under 44px, the choice dialog focused the first option instead of the selected one, TV-oriented PIN text, and the license page title.

**Fixer:**
- Fixed 8. The screensaver row is now hidden until a screensaver registers.
- Rejected 1: the language-name finding already worked.
- Deferred 1: the `/license` page title. Its cause is in the dev server config, which the lead owns.

### Seerr discover and requests

**Built:**
- **Client:** a typed Seerr client in `src/api/seerr/` that goes only through the same-origin proxy.
- **Sign-in:** linking per Jellyfin user, by Jellyfin user, local user or API key. No Seerr password is ever stored.
- **Discover page:** five tabs, the 7 discover rows upstream has, and view-more grids with sort and filter.
- **Detail pages:** movie, TV and person pages.
- **Request flow:** season selection, 4K and advanced options gated by permissions, cancelling your own request, and links back into the Jellyfin library.

**Verified:**
- Every row loads real data from the real Seerr.
- "Go To" lands on the matching Jellyfin item for two titles.
- Request variants were tested with intercepted responses.
- 268 tests pass at that point.

**Real requests:** the builder made two real requests with the test account, one movie and one TV season, both obscure titles. Each was withdrawn at once and the list confirmed empty. A first attempt had failed because Seerr rejects null fields, which revealed a bug that was then fixed.

**Review findings:** 14 in total.
- **Fidelity reviewer:** 1 major, 6 minor.
- **Code and security reviewer:** 2 major, 5 minor.
- **Major:**
  - The Search tab lacked upstream's heading and placeholders.
  - An API-key sign-in could silently reuse another Jellyfin user's Seerr session cookie.
  - One failed page wiped a whole infinite grid.

**Fixer:**
- Fixed 13. API-key calls now omit cookies, and a failed page keeps loaded cards and offers Retry.
- Deferred 3 for the lead or owner: the web-only "Seasons (N)" section on the TV page, clearing the shared Seerr cookie on Jellyfin sign-out or user switch (it touches the shell and setup), and keeping API keys in session storage ([DECISIONS.md](DECISIONS.md) Q-6 to Q-8).

### Production server and Docker

**Built:**
- **Server (`server/`):** a small Hono server. It serves the built app with correct caching, compression, security headers and a content security policy, and publishes `/config.json` from environment variables.
- **Seerr proxy:** a hardened proxy at `/seerr-proxy/`. It has a fixed target and forwards only the API, image and avatar paths. It rewrites the cookie path and refuses cross-origin writes.
- **Packaging:** a multi-stage Dockerfile running as a non-root user, a compose example, and `docs/deploy.md` with Caddy and nginx examples that use placeholder domains.
- **Base path:** serving under a sub-path is not supported. The app must sit at the root of a domain or port.

**Verified:**
- The image built and ran healthy.
- Server preset, deep-link reload and headers checked.
- Seerr sign-in round trip through the proxy with the test account.
- 19 server tests pass.

**Not verified:** media playback under the security policy, because the playback pages were stubs in that tree. Real HTTPS behind Caddy or nginx was not tested either.

**Review findings:** 6 minor from the operations and security reviewer. The reviewer built the image itself, attacked the proxy (path traversal, host-header tricks, oversized and slow requests), and checked the Caddy blocks with `caddy adapt` without touching the running Caddy.

**Fixer:**
- Fixed 4: the timeout no longer cuts long responses, only the session cookie is forwarded, a baked-in server address narrows the security policy, and the served files are root-owned. 22 server tests pass.
- Kept the `TRUST_PROXY` default (true, needed behind Caddy) and documented the risk. Whether to flip it is the lead's decision ([DECISIONS.md](DECISIONS.md) Q-9).
- Deferred the "reload after a redeploy" fix to the shell owner.

### Problems in wave 3a

- **Browser choice.** Playback was tested in the system Edge (and a subset in Chrome) rather than Playwright's bundled Chromium, because the lead's wave 3a brief told agents that the bundled build has no proprietary codecs (no H.264, AAC or HEVC). The crawler's scene list carries the same note. Nobody re-tested that claim.
- **Stale code in the worktree.** The dev-server watch setting added in `5b0c9ab` ignores `.worktrees/`. So a dev server started inside the worktree never sees edits, and agents had to restart it ([DECISIONS.md](DECISIONS.md) Q-12). Wave 4's agents hit the same problem, and its gate agent fixed the setting in commit `7e3e0c6` (phase 14).
- **Disk full.** The disk filled up during the playback reviews, which took the throwaway test server down and cut the playback matrix short. The cause was a Live TV recording on the throwaway server, not the player (phase 15, incident 4).
- **Concurrent changes.** At times the settings track's typecheck failed in the playback folder, and the deploy fixer saw errors in the settings folder. These came from concurrent edits.
- **Stubbed sign-in.** The deploy builder could not use the stubbed "Add User" button in the worktree and proved sign-in with an in-page request instead. The reviewer later used the real UI.
- **Leftover dev server.** One settings reviewer could not confirm its dev server was stopped.

**Commits** (on branch `wave3a`):
- `318ad04` Wave 3a: playback engine and player UI, settings screens, Seerr discover and requests, production server with Docker image

## Phase 10: Documentation pass

**Goal:** the owner asked for everything to be documented, so the project can be reviewed at the end.

**Who:** the lead set up the structure. One workflow with 13 agents (4 top tier, 9 mid tier) ran from 16:21 to 16:44, and all 13 returned. One documentation agent wrote each of the six documents from the repository and the agent-log archive, a fact-check agent per document corrected it against the same sources, and one editing agent made the set agree, removed duplication and added [README.md](README.md) as the index.

**Outcome:**
- **Commit `4abbe23`:**
  - Adds a "Documentation" section to [CLAUDE.md](../CLAUDE.md), with the document set and the rule that builders do not edit the docs. Builders list deviations, fixed upstream bugs, decisions and verification in their reports, and the lead folds those into the docs.
  - Adds `tools/archive-agent-logs.mjs`, which writes a local, git-ignored archive of every agent's brief and report. That archive is the primary source of this log.

**Limits:** the documents describe the project as it stood at about 16:44. The archive they were written from had been generated while the wave 1 emulator agent, the wave 2 integrator and part of wave 3a were still running. This log has since been corrected for those three (phases 6, 8 and 9) and extended with phases 11 to 17. The documents are updated after each wave from the agents' reports, because builders do not edit them.

**Commits:**
- `4abbe23` Documentation duty: docs layout, reporting rule for agents, agent-log archiver
- `a1108b4` Project documentation set: index, project log, decisions, architecture, deviations from upstream, tooling, status

The first versions of the six documents were committed together with wave 2 in `b37c856`; `a1108b4` holds the fact-checked and edited versions and the index.

## Phase 11: Test data and reference shots

**How phases 11 to 17 overlap.** The six workflows below ran on the same day, several at once. Times are to the nearest minute.

| Phase | Workflow | Where it ran | Started | Finished |
|---|---|---|---|---|
| 12 | Wave 3b | main tree | 16:35 | 20:04 |
| 14 | Wave 4 | worktree, branch `wave3a` | 18:36 | 20:46 |
| 11 | Test data and reference shots | main tree, tooling folders only | 18:52 | 19:27 |
| 13 | End-to-end suite, CI, compatibility review | worktree, branch `e2e` | 18:52 | 19:37 |
| 16 | Main fix pass | main tree | 20:07 | 21:51 |
| 17 | Final merge, stage 1 | worktree, branch `integration` | 20:48 | 22:54 |

Between 18:52 and 19:27 four workflows ran at the same time. Phase 15 (the incidents) is not a workflow; its events are spread over the rest of that day.

**Goal:** close three gaps in the throwaway test server's data (no image subtitles, no media segments, a CPU cap that a recreated container would lose), then capture the Android TV reference pictures that were still missing: Live TV, the skip-intro button and image subtitles.

**Who:** one workflow with 2 mid-tier agents, one after the other. Both returned. They worked only in the tooling folders (`tools/testserver/`, `dev/testserver/`, `tools/refshots/`, `refshots/out/`) while other teams edited `src/`.

### Test data (mid tier)

**Built:**
- **Image subtitles.** Two new Codec Zoo items, one with PGS and one with VobSub subtitles. Both are subtitle formats that store pictures, not text, so a browser cannot draw them and the server must burn them into the video. Each item is a 24-second 720p file of about 1 MB with an English and a Spanish track. The ffmpeg bundled with Jellyfin cannot create PGS, so a new script (`tools/testserver/imgsubs.mjs`) renders each line to a bitmap and packs the PGS stream itself. This closes the gap that wave 1 left open (phase 6, 1D).
- **Media segments.** A media segment is a marked stretch of an episode (intro, outro, recap, preview) that Jellyfin reports to clients. Segments drive the "Skip intro" button. All six episodes of season 1 of the synthetic series Orbital Drift now have an intro and an outro, and one episode also has a recap and a preview. Jellyfin has no API to create segments, so the agent installed the official "Chapter Segments Provider" plugin, pinned to version 4.0.0.0, in the throwaway container only. A second new script (`tools/testserver/segments.mjs`) gives the clips chapters with the names the plugin looks for.
- **CPU cap.** The 3-CPU limit is now written in `dev/testserver/docker-compose.yml`, so a recreated container keeps it (see phase 15, incident 3).
- **Checks.** `setup.mjs verify` now also checks both subtitle items, the segments on each episode, and that no Live TV timer exists.

**Verified** through the API as the test user:
- Each new item lists 2 image subtitle streams, and with a browser's device profile the server chooses burn-in.
- The segments come back with exactly the intended types and times.
- `verify` reports 30 checks passed and none failed.
- A second run of the provisioning and of the media generator changed nothing.
- The container shows the 3-CPU limit after being recreated.

**Not verified:** a full reset and rebuild of the server, and an actual burn-in transcode (only that the server chooses one).

**Disk:** about 3 MB added.

### Reference shots (mid tier)

**Built:** three new scenes in `tools/refshots/scenes.mjs`, appended so that existing scene numbers stay the same.
- **34 live-tv, 20 pictures:** the Live TV drawer entry, the guide scrolled through time and through the 4 channels, the program dialog for a future program and for one airing now (opened and photographed only, never activated), view options, DVR Schedule, Recordings, and a channel playing with the player overlay.
- **35 segments, 7 pictures:** the Skip Intro button, the moment after skipping, the Skip Outro button, and the Next Up card with its countdown.
- **36 image-subtitles, 13 pictures:** the item page, the subtitle chooser listing both PGS tracks, 7 playback frames, and the in-player captions dialog.

The emulator signed in through Quick Connect on the throwaway test server, as before. The lead does not type account passwords into the third-party Android app.

**Verified:**
- The agent opened 13 of the 40 new pictures and confirmed that they show what the manifest says. The others were not opened one by one.
- The 7 subtitle frames were checked together: 4 show the burned-in subtitle, 3 fall between two lines.
- The server reported no Live TV timer after all runs, so nothing was recorded.
- The emulator was stopped at the end.

**Not done:**
- The Recordings view is not an empty state. The throwaway test server still holds a recordings folder with 7 recorded items, and the agent did not delete them.
- The app has no separate Live TV channels tab. It has only Guide, DVR Schedule and Recordings.
- The episode with a recap and a preview was not played; only the first episode was captured.
- The music Now Playing page was not re-captured, because an existing scene already covers it.

**Numbers:**
- The wave 1 agent reported 203 pictures in 33 scenes; this run reported 40 more in 3 scenes.
- The manifest listed 244 pictures in 36 scenes when this log was updated. It holds 21 pictures for the live-tv scene where the report says 20. The archive does not explain the difference of one.
- The output folder is 3.6 GB including the emulator's virtual device.

**Problems:**
- The first Live TV run failed: pressing Left 20 times from the guide opened the drawer. Three presses are enough, and the scene then ran clean.
- One command hung for over 10 minutes and was killed.
- The agent was asked to run a second emulator in parallel and did not, because one emulator cannot be shared between processes and a second one costs another 2 GB of memory.

**Commits:**
- `900417f` Test server: PGS/VobSub subtitle items, intro/outro segments via chapter provider, permanent CPU cap; emulator scenes for Live TV, skip intro, image subtitles

## Phase 12: Wave 3b (browse, detail pages, search, Home customization)

**Goal:** library browsing, the detail pages, search and the Home customization screen, plus a polish pass over the shell, the setup screens and the UI kit.

**Who:** one workflow in the main tree with 16 agents (15 top tier, 1 mid tier). All 16 returned. It started while wave 3a was still finishing in its worktree, and it ran alongside phases 11, 13 and 14.

| Stage | Agents |
|---|---|
| Build | 5 (top tier): browse; detail core, then the series pages on top of it; search; Home customization with the polish list |
| Review | 6: fidelity to upstream for browse, detail core, detail series, and search with Home customization (top tier, one each); web quality (mid); code correctness (top) |
| Fix | 4 (top tier), one per track: browse, detail, search, polish |
| Integrate | 1 (top tier): gates, crawler runs, journeys, cleanup |

**Review totals:** 42 findings: 1 blocker, 17 major, 24 minor. By track: browse 11, detail 20, search 3, polish 8.

### Browse track

**Built** (`src/features/browse/`):
- **Library pages** for every collection type, with upstream's tab set per type. Movies get Recommended, Library, Collections and Genres. TV gets Recommended, Library, Genres and Studios. The tab is kept in the URL and remembered per library when the preference is on.
- **Recommended tabs** with upstream's exact row requests and the Suggestions row.
- **The library grid:** 100 items per page from the server, sort, every filter with its value source, view options, list and compact-list modes, a letter column with letter jump, an "n / total" footer, the item context menu, and a key to play the focused card.
- **Other pages:** genre and studio grids with their filtered pages, the generic "view more" grid, and Favorites with one tab per type.
- **Web layout:** the chosen column count is the count at the TV-equivalent width, and the grid adds or removes columns as the window changes.

**Upstream bugs fixed (6):** the Recommended tab spun forever when every row was empty or failed; the letter jump was wrong for descending name sort; the Favorites menu's "Favorite" entry called the watched API; the Favorites letter jump ignored the letter; a Favorites tab disappeared after its last item went; and a race in the port's own initial Favorites tab.

**Verified:**
- **Real server, 1920x1080:** request parameters match direct API calls. The letter jump is correct for ascending and descending name sort. Back restores the scroll position and the focused card with no new request.
- **Deep scroll:** a "view more" grid of several thousand episodes loaded its pages one at a time, with about 80 cards in the page and a 57 MB memory heap.
- **Other sizes:** phone (390x844, touch) on the real server; laptop and Hebrew right-to-left on the throwaway test server.
- 211 tests pass at that point.

**Not verified:**
- A library with thousands of top-level items. The largest ones visible to the limited test account hold 64 series and 57 movies.
- Arrow-key navigation across the header, grid and letters. It was written but not exercised by the builder.
- Delete from the grid menu, and Play and Shuffle (the playback page was a placeholder in this tree).
- Themes other than Purple, and the tablet size.

### Detail track

Two builders worked one after the other.

**Detail core built** (`src/features/detail/`):
- The item page picks the screen by item type: movie, episode, box set, playlist and person pages.
- Shared pieces for every detail page: the header, the play-buttons row, people, chapters and extras rows, the media-info dialog, the version, audio and subtitle choosers, add-to-playlist with create-new, delete, and theme music.
- Context-menu entries that had been placeholders now work across the app.
- The store that remembers track choices was copied byte for byte from branch `wave3a`, so that the later merge would not conflict.

**Series pages built:** the series details page and the series overview (season tabs, an episode strip, and details that follow the focused episode). The URL carries the season and episode and is replaced, not pushed, so one Back leaves the series.

**Upstream bugs fixed:** 9 by the first builder (among them the theme-song volume constant, playlist remove and move sending the item id where the entry id is needed, and a missing user id on add-to-playlist) and 4 by the second (all in how the starting episode is found).

**Verified:**
- Both servers at 1920x1080, 1280x720 and 390x844 with touch, next to the reference shots.
- Writes only on the throwaway test server, each one undone and checked through the API.
- Delete: the limited test account may not delete, so the button's permission gating was checked with a mocked permission and a stubbed request.
- Real server, read-only: for a one-season series of 153 episodes, opening a late episode fetched only two pages.
- 223 tests pass at that point.

**Not verified:** a real deletion; that theme music is audible and stops on leaving; playback after Play (a placeholder here); placeholder cards for missing and unaired episodes (both servers hide such episodes); submitting "create new playlist".

### Search track

**Built** (`src/features/search/`): upstream's 750ms debounce (the wait after the last keystroke before searching); both result layouts (rows per category, or one combined grid); upstream's exact request per category; voice search through the browser's speech API, with the microphone shown only where the browser has it; the query kept in the URL; and two extension points, one for Seerr results and one for Live TV program cards.

**Upstream bugs fixed (3):** a stale search after Enter; focus not moving when the first category is empty; a failing refresh after a delete.

**Verified:** both servers at three sizes; on the real server, queries in English and in two non-Latin scripts with the logged requests matching upstream; keyboard only; Back restores the results and the focused card. 23 new tests.

**Not verified:** real speech recognition; Seerr results and Live TV program cards (nothing was registered in this tree); music result rows with real data.

### Home customization and polish track

**Part A, built:** the Home customization screen with upstream's inner pages (row list, add row, per-row settings, global settings, source, presets), a live preview, reordering (upstream's up and down buttons for the keyboard, a drag handle for mouse and touch), the save dialog and upstream's Back rules. The "Customize navigation drawer items" dialog was built and exported but not shown on this screen, because upstream offers it in the settings.

**Part B, eight fixes from the lead's list:**
1. **One highlight at a time.** A keyboard-focused card and a mouse-hovered card could both show the TV focus look, a bug known since wave 1. Pointer movement now takes over the highlight, across the UI kit and the drawer.
2. **Backdrop on portrait screens:** full width and anchored to the top, in place of the TV's small box.
3. **No initial focus ring** on the setup screens of touch-only devices.
4. **Server version message.** Upstream warns "will not be supported soon" for every server below 12.0.0, which today is every Jellyfin server. The web drops that warning and keeps the hard minimum.
5. **Sign out** in the user's context menu on the user list.
6. **View-more grid:** the end inset now matches the start inset.
7. **One display-preferences request** per Home load, where there were two.
8. **Test server seeding** for scenes the crawler skipped: an episode and a movie with resume points, a mixed folders library, and, as the brief asked "if they can be produced", one Live TV recording and two recording timers. That last part caused incident 4 in phase 15.

**Upstream bugs fixed (3)**, all in the customization screen.

**Verified:** Part A on the throwaway test server with mouse at 1920x1080 and 1280x720, keyboard only at 1920x1080 and touch at 390x844, and read-only on the real server (it saves only to the browser there). Each Part B item has a before and an after picture; the builder notes that two of the "before" pictures do not prove much.

**Not verified:** saving to and loading from the server profile; other themes and right-to-left; the tablet size.

### What the reviews found

- **Blocker:** clicking an extras group on a movie page opened a dead grid ("This list is no longer available"). Three reviewers reported it independently.
- **Major, browse:** the library and view-more grids never refetched on a new visit, so they could show data up to 30 minutes old.
- **Major, detail:** delete from the More menu deleted but stayed on the dead page; the box-set header had the wrong height and lacked its focused-item state and the Filter button; the playlist page lacked Filter and View options; cast and person photos were requested at full original size; the series overview did not refetch on return and jumped back to its start episode after a watched toggle.
- **Major, search and polish:** the focused search field lacked upstream's indicator line; Arrow Left from the first column stopped on the floating Back button before the drawer; the drawer-items dialog rewrote the saved order; one dialog was 36% of the screen wide where upstream uses 80%.

### Fixers

| Track | Findings | Result as the fixer reported it |
|---|---|---|
| Browse | 11 | All confirmed and fixed (some were duplicates). 2 items handed on: the player must read the new sort parameters (another branch), and first focus on detail pages (another track; the integrator did it). |
| Detail | 20 | 18 fixes, none rejected. 2 deferred: View options on the playlist page (a structural rebuild) and the box set's sliding header animation. Both were done in phase 16. |
| Search | 3 | 2 fixed. 1 rejected: a literal white in the voice overlay, which upstream hard-codes in every theme. |
| Polish | 8 | 9 fixes (one more problem found while re-checking). 1 rejected in part: the removed-from-Next-Up rows can take focus. |

### Integration (top tier)

**Gates:** `gen`, `typecheck`, `test` (29 files, 230 tests), `lint` (0 errors, 20 warnings) and `build` pass.

**Crawler:**
- **Throwaway test server, full run:** 4,608 pictures (144 scenes in 4 viewports and 8 themes): 3,760 ok, 848 with warnings, 0 errors, 1 scene skipped. 640 warnings are placeholder pages for features on the other branch. 208 are empty preview rows on the Home customization screen, which are expected.
- **Real server, restricted run:** 218 pictures: 178 ok, 40 with warnings, 0 errors. Scenes without a suitable item on that server were skipped.
- **Hebrew, right-to-left:** 102 pictures, 0 errors. 30 warnings come from scenes that click on English text, a limit of the crawler.
- The comparison sheet against the reference shots was rebuilt with 81 pairs.

**Fixed (12 items; the report's list has 14 entries, and the other two are a re-check of the fixers' work and the journeys below), among them:**
- A stall of about one second on every page that needs the library list. It was also why the crawler had photographed empty search results.
- Menus opened by mouse never focused their first item, so Escape did not close a right-click menu. The end-to-end suite's builder found the same bug independently (phase 13).
- Arrow-key navigation: Up from a page's first row went to the Back button, and Right from the toolbar jumped to a tab. Candidates in the same row now win, as in Compose.
- First focus on arrival, as on the TV, for the library, Favorites, movie, episode, series, box set, person and playlist pages.
- Sign out from the user list could not be reached. It is now offered for every saved user that has a token.
- Hebrew and other right-to-left titles on an English page were clipped at their beginning.

**Journeys walked** with mouse, keyboard only, and touch at 390px on both servers: cold start and sign-in, library with filter and Back chain, series to episode, search, Favorites, a box set, a playlist, a person, Home customization, switch user and sign out.

**Left open:**
- A direct load of a playlist URL focused the sort button, and the series overview only drew its selected episode as focused. Both were fixed in phase 16.
- Not verified: the tablet and laptop sizes beyond the crawler pictures, and themes other than Purple by eye.
- Eight points for the lead, among them the accidental write (phase 15, incident 5), confirming the global arrow-key changes, the old standalone gallery page, and a fixed white color token. Phase 16 took up several of them.

### Problems in wave 3b

- **Disk full.** The disk filled up while the series builder worked. It wrote its first files to a scratch folder and copied them over once space came back (phase 15, incident 4).
- **Accidental write on the real server** by the integrator's keyboard test (phase 15, incident 5).
- **Shared tree.** Builders saw type and lint errors from each other's half-finished files, as in wave 2.
- **Test server.** The throwaway test server answered 503 briefly during one journey and recovered.

**Commits:**
- `350cf87` Wave 3b: library browsing (tabs, grid, sort/filter/view options, letter jump), detail pages (movie, episode, box set, playlist, person, series details and overview), search, Home customization, polish fixes

## Phase 13: End-to-end suite, CI and the browser-compatibility review

**Goal:** three things the project lacked:
- An end-to-end regression suite: tests that drive the running app in a real browser the way a user would, and fail when something that worked stops working.
- CI (continuous integration): checks that GitHub runs by itself on every push and pull request, plus the usual repository files for a public project.
- A review of how the app behaves in Firefox and in WebKit, the engine Safari uses. Until then every check had run in Chromium or Edge.

**Who:** one workflow with 4 agents (2 top tier, 2 mid tier) in its own worktree (`.worktrees/e2e`, branch `e2e`, created from `main` at `c2dc99c`). All 4 returned. Three builders ran in parallel, then one verifier. Everything was automated against the throwaway test server; the suite refuses to run against the real server's address.

### End-to-end suite (top tier)

**Built** (`e2e/`, `playwright.config.ts`):
- **Five projects.** A project is one named browser setup. `setup` signs in once for each of the others. `desktop` is 1440x900 with a mouse. `keyboard` fails a test on any pointer event. `phone` is 390x844 with touch. `writes` has its own session for tests that change server state.
- **Guards.** Every test fails on a console error, a page error, a failed request or an HTTP status of 400 or more. Two exceptions are allowed, each with its reason.
- **Server state.** A helper snapshots a user's data before a write test and restores it afterwards.
- **Specs** for sign-in, accounts (Quick Connect, PIN, switch user), Home, navigation (Back and Escape), the context menu, the drawer, preferences (theme, Hebrew, interface scale) and layout (no horizontal overflow on any route).
- **Known bugs** are written as tests that are expected to fail, so they start failing the suite once the bug is fixed.

**Verified by the builder:** 47 tests. The full suite passed three times in a row (47 of 47, about one minute per run). Every read-only test run three times over also passed (127 of 127 in 2.8 minutes). A temporary self-check proved that the guards catch a mouse click in the keyboard project and a console error.

**App bugs the suite found** (reported, not fixed, because `src/` was off limits in this worktree):
1. With a mouse on Home, two cards look focused.
2. The right-click menu never gets keyboard focus, so Escape does not close it.
3. Keyboard focus stays in the collapsed drawer after navigating to a page with nothing focusable.

**Not verified:** CI mode, and any browser other than Chromium.

### CI and repository files (mid tier)

**Built:**
- `.github/workflows/ci.yml`: on every push and pull request to `main` it installs, then runs typecheck, tests, lint and build. A second job builds the Docker image without publishing it, and is skipped while the tree has no Dockerfile.
- A Dependabot configuration. Dependabot is GitHub's service that opens pull requests when a dependency has a newer version.
- Issue and pull-request templates, `CONTRIBUTING.md`, `SECURITY.md`, `.editorconfig`, `.gitattributes` and `.nvmrc`.

**Verified:** the four gates pass in the worktree; the versions of the GitHub actions were checked against their latest releases; the new files contain no personal names, email addresses, domains or machine paths.

**Not verified:** the workflow file was read by hand only (no YAML parser was available); the workflow had not run on GitHub; the Docker job was untested; the tests had run on Windows only.

### Compatibility review (top tier)

**Checked:** the same walk through sign-in, Home, menus, the drawer, the view-more grid and Back in Chromium 159, Firefox 159 and WebKit 27.2 (the versions Playwright ships), at 1440x900 with a mouse and at 390x844 with touch, on the dev server and on a production build, and once with browser storage blocked.

**Findings: 8 (1 major, 7 minor).**
- **Major:** the production build claimed to support older browsers than the stylesheets work in. The build tool's default target was Chrome 111, Firefox 114 and Safari 16.4, while the CSS (relative color syntax, `color-mix` and others) needs Chrome or Edge 119, Firefox 128 and Safari 16.4 (and works fully only from Safari 18).
- **Minor:**
  - A long press on a card does nothing on an iPhone or iPad, because iOS sends no context-menu event for touch.
  - Safari does not focus a button when it is clicked, so a closing dialog or menu gave focus back to nothing.
  - Telling keyboard from pointer relied on fields only Chromium provides.
  - Safari reported a resize-loop error on the gallery page.
  - The backdrop's dynamic colors came out slightly different in Firefox.
  - Safari ignored the themed scrollbar color.
  - In every engine, Escape did not close the right-click menu (bug 2 above).

**Found to be fine:** no page errors in any engine on the walk; with storage blocked the app still loads and signs in, and only forgets the session on reload; the production build signs in and shows Home in all three engines.

**Not checked:**
- Real Safari on iOS. Playwright's WebKit on Windows shares the engine but not the iOS behavior: real gestures, the on-screen keyboard, the notch.
- Older browser versions. The support statements come from reading the source and the built bundle against support tables, not from runs.
- Playback, settings, library, search and the other pages, which were placeholders in this tree.

**Lead decision:** the supported browsers are Chrome and Edge 119 or newer, Firefox 128 or newer, and Safari 16.4 or newer. Older browsers get a notice. Phase 16 built this ([DECISIONS.md](DECISIONS.md) T-33).

### Verification (mid tier)

- **Suite runs:** the first run passed 46 of 47. The failing test assumed that the second Home row has at least two cards, and another team had just added a one-card row to the shared test data. After the test was corrected: 47 of 47 twice, then 48 of 48 with one new test.
- **Mutation checks.** A mutation check puts a deliberate bug into the app to see whether the suite notices. Of 5 mutations, 4 turned tests red. The fifth (removing the "Incorrect" message when a PIN confirmation differs) went unnoticed, so the verifier added a test for it and confirmed that it now fails under the mutation. All mutations were reverted.
- **CI review:** added a typecheck step for the test code and corrected `.gitattributes`.
- **Not done:** the verifier did not reproduce the three app bugs itself; CI mode and other browsers were not run.
- **Remaining risk:** other teams change the same throwaway test server, so tests that assume row sizes or order can break.

**Left open:**
- The CI builder recommends renormalizing line endings in one separate commit after these files land. No such commit exists yet.
- The archive does not record the first CI run on GitHub.

**Commits:**
- `d326a75` End-to-end regression suite (48 tests, 5 projects), CI workflow and repository hygiene files (branch `e2e`)
- `ebcd26c` Merge branch 'e2e': end-to-end suite, CI workflow, repository hygiene files
- `68e6f5f` Lockfile after merge

## Phase 14: Wave 4 (Live TV, music, photos, screensaver)

**Goal:** the remaining features: Live TV with its guide and DVR screens, music with a play queue, photos with the slideshow, and the in-app screensaver. Before that, bring branch `wave3a` up to date with `main` and make the two halves one app, because these features need the real shell.

**Who:** one workflow in the worktree (`.worktrees/w3`, branch `wave3a`) with 13 agents, all top tier. All 13 returned.

| Stage | Agents |
|---|---|
| Merge | 1: merge `main` into the branch, connect the halves, replace the GPL-3.0 package |
| Build | 3 in parallel: Live TV, music, photos with the screensaver |
| Review | 4: fidelity to upstream per track (3), and one for code and web quality |
| Fix | 4: Live TV, music, photos, and the merge stage's own files |
| Gates | 1: whole-tree gates, a container check, merge notes |

This is the first workflow in which agents committed. The merge agent and the gate agent were authorized to commit on branch `wave3a` in their worktree, and nowhere else.

**Review totals:** 29 findings: 0 blockers, 6 major, 23 minor. By track: Live TV 6, music 13, photos 8, merge 2.

### Merge stage

**Done:**
- **Merge.** `main` at `c2dc99c` was merged into `wave3a`. Conflicts were resolved as the brief set out: the working agreement and the docs take `main`'s version, `package.json` takes the union, generated files are regenerated.
- **One app.**
  - The drawer's Discover entry shows only when Seerr is linked for the current user.
  - There is one store for pinned drawer items.
  - Every page has exactly one Back control.
  - Settings can be reached from the drawer, and a "Sign out" row was added to the settings (a web addition; upstream has no sign-out).
  - Play actions from Home and the context menu open the real player, and a resume from Continue Watching starts at the saved position.
  - Seerr pages use the shell's backdrop.
- **Licence.** The GPL-3.0 package `rvfc-polyfill` was replaced (phase 15, incident 6).
- **Smaller player.** The ASS subtitle renderer now loads only when an ASS track is selected. The player's code chunk went from 795 kB to 735 kB.
- **Crawler scenes** for the player, the settings dialogs, Discover and the request flow.

**Verified:**
- Gates pass: `gen`, `typecheck`, `test` (33 files, 381 tests), `lint` (0 errors, 25 warnings) and `build`.
- Crawler on the throwaway test server (Purple, desktop and phone): 190 pictures, 0 errors. Discover scenes on the real server: 22 ok.
- Two walks on the real server, keyboard only at 1920x1080 and touch at 390x844: Home, a card's menu, Play, the player, Settings, a theme change, Discover, a title. Both completed with no page error.
- No Seerr request reached Seerr: every Seerr write was answered by a mock.

**Not verified:** an install from a clean checkout; the Sign out row (clicking it would revoke the shared test token).

**Flagged for the lead:** three dependencies are licensed Apache-2.0 (hls.js, abslink and the Material icon paths), which the Free Software Foundation considers incompatible with GPL-2.0. This is an open decision for the owner.

### Live TV track

**Built** (`src/features/livetv/`): upstream's tabs (Guide, DVR Schedule, then one per recording folder); the guide as a grid that only renders what is on screen, with a fixed channel column and time header and a line for the current time; the program and channel dialogs; view options; the DVR Schedule; and a recordings grid.

**Never record.** Every request that would create or cancel a recording or a timer was answered by a mock in the test browser and never reached a server. The mock's log shows the requests the app would send.

**Upstream bugs fixed (4):** guide rows stayed empty after a jump; program fields that upstream assumes are present are now guarded; the DVR tab crashed on a timer without program information; Cancel was silently skipped in one case.

**Verified:**
- The guide on the throwaway test server at three sizes: 4 channels, 104 programs, upstream's category colors.
- With 300 mocked channels the page renders about 110 cells and fetches programs window by window.
- One channel played in headless Edge, and leaving the player sent the stop and cleanup requests.
- An account without channels shows the no-channels message.
- Crawler: 39 pictures, all ok. 16 new tests.

**Not verified:** creating a real recording or timer (by rule); a user without Live TV permission; channel logos (the throwaway test server has none); right-to-left; playback at phone size.

### Music track

**Built** (`src/features/music/`): a music service with its own audio elements, separate from the video player; a queue; the library tabs and the album, artist, song, playlist, genre and Now Playing pages; the music context menus; and a mini player bar, which is a web addition.

**Upstream bugs fixed (5)**, among them "Play next" moving a song to the wrong place and "Play next" on an album queueing the album itself.

**Verified** on the throwaway test server, headless and muted, in Edge and Chromium:
- Audio is decoded: the position and the decoded byte count rise.
- Start, progress and stop reports reach the server.
- A browser that refuses FLAC gets a server transcode, and a seek reloads it at the new position.
- Synced lyrics, the visualizer, the track details handed to the operating system and the drawer's Now Playing entry work, and opening a video stops the music.
- Crawler: 0 errors and 0 warnings after one fix. 25 new tests.

**Not verified:** anything on the real server (no music library is visible to the limited test account); hardware media keys; favorites and deletes; the tablet size, right-to-left and other themes. Remote control from another device is not built, because the web app has no live connection to Jellyfin yet.

### Photos and screensaver track

**Built:**
- **Photo library and album grids** (`src/features/photos/`) with upstream's sort, filter and view options.
- **The slideshow viewer:** timer, cross-fade, zoom, pan, rotation, a color filter, and video clips inline. Web additions: wheel and pinch zoom, drag, swipe, fullscreen, and keeping the screen awake.
- **The in-app screensaver:** an idle timer, a dim layer, a slow zoom, the clock. Any key or pointer dismisses it and it never starts while media plays. It also makes the "Start screensaver" row work, which wave 3a had hidden.

**Upstream bugs fixed (4)**, among them the viewer opening on the wrong photo when a grid also holds albums or videos.

**Verified:** on the throwaway test server in headless Edge at three sizes: the grids, the viewer with keyboard, mouse and synthetic touch gestures, clips in the slideshow, and the screensaver appearing after 34 seconds of idling with a 30-second setting. Read-only on the real server's only home-videos library. 24 new tests.

**Not verified:** the photo viewer on the real server (no photo library is visible to the test account); saving a color filter; fullscreen and the wake lock, which cannot be tested meaningfully without a window; a browser that blocks a clip's sound.

### What the reviews found

The six major findings:
- **Live TV:** the recording-folder tab and the Recordings page lacked upstream's whole toolbar (sort, filter, view options).
- **Music:** with the controls hidden, Left and Right on Now Playing seeked where upstream only shows the controls; the floating Back button overlapped the Sort control; the Recommended tab kept the previous page's backdrop.
- **Photos:** the viewer acted on a key release whose key press it had never seen, so Enter on a grid card opened the viewer with its overlay already up.
- **Merge:** Arrow Left from the first column went to the floating Back button, not the drawer. Wave 3b had fixed the same bug on `main` at about the same time.

### Fixers

| Track | Findings | Result as the fixer reported it |
|---|---|---|
| Live TV | 6 | 5 fixed. 2 deferred: the missing toolbar, because the grid it needs was being built on `main` (done in phase 17), and one gray that has no color token. |
| Music | 13 | 12 fixed. 2 rejected: "several progress reports at a track's end" was measured again and is exactly one, as upstream; Now Playing opening unfocused matches upstream. 3 deferred to the owners of shared code. |
| Photos | 8 | 8 fixed. |
| Merge | 2 | 2 fixed. |

### Gates (top tier)

- **Gates:** `gen`, `typecheck`, `test` (40 files, 448 tests), `lint` (0 errors, 26 warnings) and `build` pass.
- **Container:** the Docker image built from the final tree. One container served the app with its security headers, sign-in worked, and an H.264 file played with no security-policy violation. The container was removed.
- **Crawler** on the throwaway test server (Purple, desktop and phone): 254 pictures: 200 ok, 54 with warnings, 0 errors, 2 scenes skipped. The warnings are `main`'s placeholder pages on this branch, one intended redirect, and one video that never lets the page settle.
- **Smoke test** at 1920x1080 and at 390x844 with touch: play from Home, settings, the music mini player, the Live TV guide with a program dialog and Watch live, the photo slideshow, the screensaver. 0 page errors and 0 Live TV writes.
- **Fixed (4):** every short page scrolled by the height of the music bar; a dev server inside a worktree never saw edits ([DECISIONS.md](DECISIONS.md) Q-12); a noisy dependency scan; and the merge notes were rewritten as the hand-over for the final merge.
- **Not verified:** the music progress report after a seek in a transcode (code reading only); laptop and tablet sizes; the 8-theme crawl for the new scenes; an install from a clean checkout.

### Problems in wave 4

- **A transcode left running.** The code and web-quality reviewer found a session on the throwaway test server that had been transcoding a Live TV channel for several minutes. It was already there when the reviewer first listed the sessions. It could have come from an earlier builder's run or from the reviewer's own first run, which had left the player while the channel was still starting; the reviewer could not tell which. The reviewer closed the stream and could not reproduce the leak. It recommends a test that leaving the player while a live channel is still starting sends the stop and close requests. The later reports of phases 14 to 17 do not mention such a test. This matters because of the rule against transcodes left behind (phase 15, incidents 3 and 4).
- **Shared worktree.** Three builders worked in one worktree at the same time. The photos builder reports type errors from the others' unfinished files in an early check, gone later, as in waves 2 and 3b.
- **Same bug fixed twice.** The Arrow Left bug of the merge stage was fixed here and, separately, on `main` in phase 12. The two fixes met in phase 17 ([DECISIONS.md](DECISIONS.md) A-34).

**Commits** (all on branch `wave3a`; the first six by the merge agent, the last three by the gate agent):
- `fc2b12e` Merge main into wave3a: app shell, setup, Home, shared item layer, crawler, docs
- `f71d292` Wire wave3a into main's shell: Discover flag, one pins store, shared Back, sign out
- `3a01bf4` Licensing: replace GPL-3.0 rvfc-polyfill, generate licenses in npm run gen; lazy-load JASSUB
- `1b090ed` Crawler: scenes for the player overlay and sheets, settings dialogs, Discover and the request flow
- `580010b` Crawler: tap to show the player overlay on touch; dev server serves /license as the app
- `2fe5593` Merge notes: what is wired after merging main, gates, open items for the browse/detail/search merge
- `0c6ab3b` Wave 4: Live TV, music, photos and screensaver, with review fixes
- `7e3e0c6` Gate fixes: page height under the music bar; dev server in a worktree sees edits
- `7f1e210` Merge notes: definitive hand-over for merging wave3a into main

## Phase 15: Incidents on the development machine and the rules that came out of them

**What this phase is.** Six things went wrong on or around the development machine while the agents worked. None of them is a bug in the app. Each one led to a rule in the working agreement ([CLAUDE.md](../CLAUDE.md), "Hard rules"), to a tool, or to both. They are listed in the order they happened. The account of each incident is the lead's; the agents' reports and the commits confirm the parts noted. The decision that came out of each incident is recorded in [DECISIONS.md](DECISIONS.md): T-27 (sound), T-28 (windows), T-29 (load), T-30 (disk), T-31 (writes on the real server) and T-32 (the licence). The owner's instructions behind them are O-13 to O-18.

### Incident 1: test sound

- **What happened:** during playback testing the test audio was audible on the machine.
- **Cause:** Playwright, the tool that drives the test browsers, mutes only headless browsers (browsers without a window). The playback agents had been told to prefer a visible browser for the sake of hardware video decoding.
- **Fix:** a small script patches Playwright after every `npm install`, so that every browser it launches is muted. A hard rule was added.
- **Commit:** `11aac42` (the script was first named `tools/mute-playwright.mjs`).

### Incident 2: windows on the desktop

- **What happened:** test browser windows kept opening on the desktop of a machine in use.
- **Fix:** the same patch now also forces every launch to be headless, whatever a script asks for. The script was renamed `tools/quiet-playwright.mjs`. The hard rule became "no sound and no windows".
- **Consequence:** a check that only works in a visible window is recorded as "not testable headless" and is not run. The gate report of phase 9 and the merge report of phase 17 list hardware HEVC direct play this way. The lead notes that headless Edge still reports support for H.264 and HEVC. The agents' runs show H.264 playing directly there; an HEVC file played as a server transcode in both gate runs, and the phase 9 gate report says headless Edge has no HEVC decoder. The two statements have not been reconciled by a test.
- **Commit:** `98c1e0b`.

### Incident 3: load

- **What happened:** the machine became slow under parallel load: the throwaway test server's container was busy transcoding, seven agents were running, and the Android emulator was up.
- **Fix:**
  - The container was capped at 3 CPUs, first on the running container and then permanently in its compose file (phase 11).
  - `tools/low-priority.ps1` keeps the processes started by the project's tooling at below-normal priority, so that other programs get the processor first.
  - A rule: one dev server and one browser per agent, media tests of seconds, and the emulator stopped whenever it is not capturing.
- **Afterwards:** the owner later said the load was fine and allowed more parallel work again. Up to four workflows then ran at once, with these guards on.
- **Commit:** `92c3856`.

### Incident 4: disk full

- **What happened:** the disk filled up completely, twice.
- **Cause:** a test-data step scheduled real Live TV recordings on the throwaway test server. The step belonged to wave 3b's polish builder, whose brief asked for recordings or timers "if they can be produced" so that the crawler would have a Recordings scene. The test server's "live" channels are local files that are served as fast as the recorder can read them, so a recording never stays small. A single timer grew without limit and filled the disk.
- **Who it hit:** the throwaway test server went down. The playback matrix review in phase 9 was cut short, emulator scenes in phase 6 failed and were re-run, and a builder in phase 12 had to write to a scratch folder.
- **Fix:**
  - The recordings were deleted and the timer was cancelled.
  - The seeding step in `tools/testserver/setup.mjs` is disabled. The script now cancels any leftover timer, and its `verify` command checks that none exists.
  - A hard rule, "never fill the disk": no recordings and no recording timers anywhere. Live TV record actions are tested against mocked responses only. Phases 14 and 17 each report that no recording request reached a server.
- **Not settled:** two reports written after the clean-up still found recorded items on the throwaway test server. The test-data agent of phase 11 counted 11 items in the Recordings library, and the reference-shot agent saw one folder with 7 recorded items. Both say the items were there before their work and that they left them alone. Neither gives sizes, and both confirm that no timer existed. Whether these items are small remains of the incident has not been checked. Checked by the lead after the final merge stage 1: the Live TV recordings folder of the throwaway server is empty on disk (a few kilobytes), so nothing is being recorded or written; any recorded items the server still lists are library entries, not growing files.
- **Commit:** `2f68c33`.

### Incident 5: an accidental write on a real server

- **What happened:** during wave 3b's integration, an automated keyboard test on the real server changed a watched mark and a favourite of the limited test account.
- **Handling:** both were reverted and checked.
- **Rule since:** briefs say never to send keys or clicks to anything that writes on the real server. The later phases report their use of the real server as read-only.
- **Commit:** none (a brief rule, and one server-side revert).

### Incident 6: a licence that does not fit

- **What happened:** JASSUB, the ASS subtitle renderer, depends on a package named `rvfc-polyfill` that is licensed GPL-3.0. That is not compatible with this project's GPL-2.0-only licence. The settings agent of wave 3a had raised it ([DECISIONS.md](DECISIONS.md) Q-4).
- **Fix:** the package is replaced by the project's own small stand-in in `vendor/rvfc-polyfill`, written from the web platform's specification and wired in through npm's `overrides` setting. The merge agent of phase 14 did this.
- **Verified by that agent:** the installed dependency tree resolves to the local package; no GPL-3.0 package remains in the install or in the built app; ASS subtitles still draw, both with the browser's own function and with the stand-in's fallback.
- **Not verified:** the fallback in a browser that really lacks the function. It was simulated by removing the function in Edge.
- **Commit:** `3a01bf4` (branch `wave3a`).

### What the owner said in this period

The owner's instructions, as the lead recorded them: the limited test account may be used as a normal user; document everything so that it can be reviewed at the end; no test sounds; no windows opening; tone the load down; and later, more parallel processes are fine.

### Seerr test requests

The owner allows a minimal Seerr test request in principle, because the limited test account cannot start a download (phase 2). In phases 11 to 17 none was made. Every request the app tried to submit was answered by a mock in the test browser, and the reports that involve Seerr (phases 14 and 17) each say that none reached it. The two real requests of wave 3a's Seerr builder, each withdrawn at once, are recorded in phase 9. See [DECISIONS.md](DECISIONS.md) T-36.

## Phase 16: Main fix pass

**Goal:** on `main`: fix what the compatibility review found and the bugs the end-to-end suite had recorded, finish what wave 3b left open, widen the end-to-end suite to the new pages, and then check the result again in Firefox and WebKit.

**Who:** one workflow in the main tree with 3 top-tier agents. All 3 returned. Two fixers worked in parallel on separate folders, then one agent re-checked everything. It ran at the same time as phase 17, which worked on another branch.

### Fixer 1: UI kit, shell and other browsers

**Done (from a list of 12):**
- **Supported browsers.** The build target is now Chrome and Edge 119, Firefox 128 and Safari 16.4. The agent checked every CSS and JavaScript feature in the source and in the built bundle against that baseline. A browser that fails a short feature test sees a "your browser is too old" notice in place of a broken page.
- **Long press on touch** opens a card's menu after 500ms. It was checked in Chromium's touch emulation and in WebKit, because iOS sends no context-menu event for touch; a real iOS device was not available.
- **Focus returns to the opener** when a dialog or menu closes, in every engine.
- **Keyboard or pointer** is now tracked in one place and no longer depends on Chromium-only fields.
- **Resize-loop error** in Safari removed, and **themed scrollbars** added for Safari.
- **The three bugs from phase 13** are fixed, and their tests are now normal tests. The "two cards look focused" bug had survived wave 3b's fix, because a single first mouse movement was ignored.
- **Test hooks** that the suite's author had asked for.
- **A fixed white color token**, and the old standalone gallery page removed.
- **Backdrop colors** are now computed the same way in every engine. Measured on one backdrop, Chromium, Firefox and WebKit return identical colors.
- **Parallel suite runs.** Two suite runs at once had revoked each other's sign-ins. Each run now gets its own identity.

**Not done:**
- **npm audit** reports six high findings. All six are one advisory in the package picomatch, which reaches the project only through development tools. No patched release exists, and the only offered fix is a forced downgrade. Lead decision: do not force it, and check again later ([DECISIONS.md](DECISIONS.md) T-35).
- **Real Safari, iOS and the oldest supported versions** could not be tested: no such device or browser build is on the machine.

### Fixer 2: feature leftovers and new end-to-end specs

**Done (from a list of 11):**
- **Playlist page** rebuilt on the library grid, so it has upstream's sort, filter and view options (list, compact list, grid). This was the structural item deferred in phase 12.
- **Box set:** the header now slides as upstream's does.
- **Arrival focus:** a direct load of a playlist focuses the first row, and the series overview gives its selected episode real focus.
- **One hover delay** of 250ms shared by Home, the library grid, the episode strip and the box set.
- **Mixed-direction text.** Hebrew or Arabic details on an English interface, and the reverse, now sit at the start edge with only the text itself running the other way.
- **Search:** switch rows are announced as switches, and the first card in the combined grid is no longer clipped.
- **"Send media info log to server"** now does what upstream does. It had been a placeholder.
- **Missing and unaired episodes** were exercised with mocked server responses. Nothing needed fixing.
- **Flows that cannot run for real** were exercised with mocks: delete from a page and from a grid menu, and "mark entire series played". "Create new playlist" ran for real on the throwaway test server and the test deletes the playlist again.
- **New specs:** browse (8 tests), detail (13), series (4), search (4) and Home customization (2). That is 31 tests. The five specs passed three runs in a row, 37 of 37 each; the 37 include the sign-in tests of the `setup` project.

**Not done:** the playlist page was not checked on the real server (none visible to the limited test account); the media info report lacks the device profile, which lives with playback on the other branch.

**Problem reported:** one run of the whole suite by this fixer had 5 failures in specs it did not own. Four were preference tests (theme, interface scale, Hebrew twice): after the dev server had hot-reloaded a file, the suite's helper for setting a preference loaded a second copy of the preferences module, so the setting never reached the app. The fifth, a test of where the right-click menu opens, failed once and passed on two reruns. The fixer left both to the owner of the test fixtures. The re-check agent below changed the helper to use the module the page has actually loaded, and its two full runs passed.

### Re-check in three engines (top tier)

- **Gates:** `gen`, `typecheck`, `test` (33 files, 245 tests), `lint` (0 errors, 20 warnings), `build` and the test-code typecheck pass.
- **End-to-end suite:** 154 passed, 0 failed, 0 flaky, twice in a row, in about 3.2 minutes per run. Before this agent's changes the suite had 83 tests.
- **New projects** in the suite: `firefox`, `webkit` and `iphone` (WebKit with an iPhone's user agent and touch at 390x844). By default they run a tagged smoke subset, and a switch makes them run everything. Lead decision: they stay in the default run.
- **Crawl in three engines:** the crawler gained an `--engine` option. Every built page was photographed in Chromium, Firefox and WebKit at 1440x900 and at 390x844 with touch: 246 pictures per engine. A script compared each picture with Chromium's, and the agent looked at every pair that differed strongly. Result: Chromium 0 errors, Firefox 0 errors, WebKit 246 of 246 ok after the fixes. The agent judged the remaining differences not to be engine bugs: for example data that changed between runs, and each engine's own font rendering.
- **Fixed (12 items), among them:** the Menu key did nothing in Firefox and WebKit; in WebKit the mouse never took over the highlight; Safari moved focus away on a press; in Firefox, content moving under a resting cursor changed the Home header; long press now also works on list rows and season tabs.
- **Left open:** a performance hint that Firefox prints while the library grid scrolls; in Firefox a card stays lit under a menu until the mouse moves; the default suite run now takes about 3.2 minutes where it took 1.3.
- **Not testable here:** real Safari and iOS, and the oldest supported versions. Playwright's WebKit on Windows has known differences, so a real long press on iOS and Safari's scrollbar look remain unverified.
- The agent did not touch the real server in this pass and did not repeat the second fixer's read-only checks there.

**Commits:**
- `3ab4a60` Fix pass: browser baseline, cross-engine fixes, known bugs, detail/browse/search leftovers, wider e2e

## Phase 17: Final merge, stage 1 (merge, two checkers, repair)

**Goal:** make the two lines of work one app. Branch `wave3a` (playback, settings, Seerr, the production server, Live TV, music, photos, the screensaver) is merged with the main line (sign-in, shell, Home, browsing, detail pages, search, the end-to-end suite, CI). Then independent checkers examine the merged app and a repair agent fixes what they find.

**Where:** a new worktree (`.worktrees/int`, branch `integration`), created from `main` at `68e6f5f`. That commit is from before the fix pass of phase 16, which was still running on `main`. Bringing the fix pass in is stage 2.

**Who:** one workflow with 4 top-tier agents. All 4 returned. The merge agent and the repair agent were authorized to commit on branch `integration`.

| Stage | Agents |
|---|---|
| Merge | 1: merge, resolve conflicts, connect everything, gates, notes |
| Check | 2 in parallel, independent of the merge agent: one walks user journeys in the browser, one reads the code where the two halves meet |
| Repair | 1: confirm or reject each finding, fix, re-check |

### Merge

**Conflicts (11 resolutions), among them:**
- The library, filtered-collection and item pages take `main`'s real pages. The merge added the routing that sends Live TV, music and photo items to their own pages.
- The arrow-key navigation kept both branches' mechanisms for the Back button.
- `package.json`, the web-only strings and the crawler scenes keep both sides.
- The placeholder page component was deleted, because no route shows a placeholder any more.
- Two files that both branches had created were byte-identical, as wave 3b had intended (phase 12), so they did not conflict.

**Connected (11 items), among them:**
- The Live TV recordings grid now uses the library grid with its toolbar. This was the major finding that phase 14 had to defer.
- "Play all" from a filtered grid now honors the filter. Before the merge the player ignored it.
- Audio playlists play in the music queue.
- There is one theme-music player, and its highest volume is 0.75 everywhere.
- The settings open the "Customize navigation drawer items" dialog built in phase 12.
- Seerr's Discover row appears on movie, series and person pages, and Seerr results appear in search.
- Fixed color tokens replace literal colors in 18 files.

**Verified:**
- **Gates:** `gen`, `typecheck`, `test` (49 files, 535 tests), `lint` (0 errors, 26 warnings), `build` and the test-code typecheck pass.
- **End-to-end suite:** 62 passed, twice. It includes new smoke specs for playback (in headless Edge), settings, music, photos, Live TV and Discover. The Live TV spec answers recording requests locally and asserts that none was sent. The Discover spec runs read-only on the real server, and its request is answered by the test and never reaches Seerr.
- **Crawler** on the throwaway test server (Purple, desktop and phone): 388 pictures: 382 ok, 6 with warnings, 0 errors, 1 scene skipped. The three scenes behind the warnings were corrected and re-run: 12 of 12 ok. No placeholder page remains.
- **Container:** the Docker image built; one container served the app with its security headers; sign-in worked; an H.264 file played for about 7 seconds with no security-policy violation. The container was removed.

**Not verified:** an install from a clean checkout; the full 8-theme crawl, the laptop and tablet sizes and a right-to-left crawl; that a chosen version, audio or subtitle track is honored in a real playback session (code reading and unit tests only); hardware HEVC (not testable headless).

### What the two checkers found

**24 findings: no blockers, 5 major, 19 minor.** The journeys checker reported 11 (3 major), the code checker 13 (2 major).

The five major findings:
1. Seerr search failed with an error on any query that contains a space.
2. The screensaver started while music was playing.
3. Coming back to Home after playback lost keyboard focus when the Continue watching row had reordered.
4. After a user switch, "Add to playlist", "Media information" and the track choosers fell back to a "not available yet" message.
5. The music, player, Live TV and settings styles did not follow the one-highlight rule, so two elements could look focused.

Minor findings included: the More menu stayed open after a track was chosen; several pages opened with nothing focused for a keyboard user; Arrow Down in a grid could jump to the letter bar; Back from Home after signing in returned to the user list; three separate implementations of "remember the selected tab", of which the music library used none; the same server data cached under several keys; web-only strings staying English in the Hebrew interface; and a crawler scene dropped in the merge.

**Not checked by either:** the full end-to-end suite and the crawler (too heavy to repeat for this purpose); laptop and tablet sizes, the other themes, Firefox; the Seerr request dialog and request cancel; hardware HEVC.

### Repair

**Result:** 19 fixes, 5 rejections, 2 deferrals. Some findings had several parts, so the three numbers add up to more than 24.

- **Fixed:** all five major findings and fourteen minor ones. Each fix was re-checked in a headless, muted browser. For the Home focus bug the check was also run against the old code, where it failed as expected.
- **Rejected:**
  - Three presses of Back to leave the player during an intro, and a filter submenu covering its parent on a phone. Both match upstream.
  - An error on an old video segment when switching audio, and a photo album opening unfocused. Neither could be reproduced.
  - Two loosened test assertions, which match the merged behavior.
- **Deferred to the lead and the owner:**
  - The roughly 190 web-only strings stay English in every other language, because there is no translation source for them.
  - Two different rules decide when a page header collapses: on scroll in the browse pages, and only on keyboard focus in music, Discover, the guide and photos.

**Verified after the repair:** `gen`, `typecheck`, `test` (50 files, 535 tests), `lint` (0 errors, 26 warnings), `build` and the test-code typecheck pass. The end-to-end suite passed twice with 63 tests. The throwaway test server's own check passes: no Live TV timers, and the seeded data is intact. A partial crawl gave 76 pictures, all ok.

**Not verified after the repair:** the Hebrew strings (deferred), the full 8-theme crawl, and the laptop and tablet sizes.

### Left open on the branch

From the hand-over notes on the branch (`docs/final-merge-notes.md`):
- A Live TV program card in search plays its channel, where upstream opens the program dialog.
- The shared context menu offers no Play on a music album or artist.
- The "two cards look focused with a mouse on Home" test is still marked as an expected failure on this branch. The fix for it is on `main` (phase 16); the two meet in stage 2.
- The photo grid is still the photo track's own grid, not the library grid.
- A Discover page opened directly by its address highlights Home in the drawer.
- The notes list the files where the fix pass is expected to conflict with this merge.

**Commits** (all on branch `integration`):
- Merge agent: `c31a214` (the merge itself), `8566912` (connections), `dd55686` (end-to-end specs), `f7ed3fd` (crawler scenes), `3de9106` (notes).
- Repair agent: 14 fix commits from `1550b6c` to `4cd56b1`, then `5580bdb` and `59d07fd` (notes).

## Phase 18: Final merge, stage 2 (the fix pass merged, three checkers)

**Goal:** bring the fix pass of phase 16 (commit `3ab4a60` on `main`) into the merged app on branch `integration`, make the two sides' solutions to the same problems into one, and have independent checkers examine the result.

**Where and when:** the worktree of phase 17 (`.worktrees/int`, branch `integration`). The workflow started at 22:57 on 2026-11-17. The merge agent worked for about 81 minutes; the three checkers started together at 00:18 on 2026-11-18.

**Who:** one workflow with 5 top-tier agents (Claude Fable). The merge agent and the three checkers returned. The fifth, the repair agent, was cut off by the usage limit (phase 20); its work was finished in phase 21.

| Stage | Agents |
|---|---|
| Merge | 1: merge `main`, resolve conflicts, apply the fix pass's rules to the newer features, baseline audit, gates, notes |
| Check | 3 in parallel, independent of the merge agent: one reads the code where the two sides meet ("seams"), one compares Firefox and WebKit with Chromium ("engines"), one walks user journeys in a browser |
| Repair | 1: cut off; see phases 20 and 21 |

### Merge

The record is section 8 of `docs/final-merge-notes.md` on branch `integration`.

- **17 conflicts** resolved, among them the token generator, the dialog component, the Vite configuration, the startup code, the shell's focus code, the series overview, the web-only strings and five end-to-end spec files. Generated files were regenerated, not merged by hand.
- **15 places where both sides had solved the same problem,** or where the fix pass's new rule had not yet reached the newer features. Among them:
  - "Send media info log" has one implementation, now with the device profile from the playback engine.
  - One rule for "one highlight at a time", with the keyboard-or-pointer tracker of phase 16 applied to the music, player, photo and Live TV code.
  - Touch long press converted in music song rows; in Settings a press had opened the Debug page twice, because two timers fired.
  - One playlist page for audio and video playlists, as upstream has. Audio playlists had used a page of their own.
  - Found while checking: with the reduced-motion setting on, menus and the player controls opened without focus. A URL opened in the same tab could also take the focus position of the page before it. Both were fixed.
- **Browser baseline audit:** the built app was scanned for features newer than the supported browsers (Chrome and Edge 119, Firefox 128, Safari 16.4). Two needed a guard or a fallback: `AbortSignal.any` in the Seerr client, and the `linear()` easing of the drawer. Nothing found needs a higher minimum version.
- **Gates:** `gen` (no change), `typecheck`, `test` (54 files, 553 tests), `lint` (0 errors, 26 warnings), `build` and the test-code typecheck pass. The end-to-end suite passed twice in a row: 188 tests, 0 failed, about 4 minutes each. The crawler on the throwaway test server (Purple, desktop and phone): 390 pictures, all ok. The newer features photographed in WebKit and Firefox: 146 pictures each, 0 errors.
- **Left open:** a few crawler scene scripts time out in WebKit and Firefox; two components keep their own copy of a resize helper; a long press on the name under a user or server circle opens no menu; a grid-layout audio playlist shows placeholder images for songs without their own image.

### What the three checkers found

**31 findings: no blockers, 4 major, 27 minor.**

| Checker | Findings | Major |
|---|---|---|
| Seams (code reading) | 10 | 1 |
| Engines (Firefox and WebKit against Chromium) | 15 | 2 |
| Journeys (in the browser) | 6 | 1 |

The four major findings:
1. The photo filter panel moved focus back to its first slider after every change.
2. In WebKit, leaving the player could leave a paused "ghost" playback session on the server.
3. In WebKit, Back did not restore focus to a card that had been opened with the mouse.
4. The music mini player covered the end of full-height pages, so the last row could not be reached.

Most minor findings concern right-to-left (Hebrew) layout of the newer features, focus details in single engines, duplicate web-only strings and test or crawler details. All 31 are listed with their outcome in section 9.1 of the notes.

**Commits** (all on branch `integration`): `cdd9097` (the merge), `e48f2c9`, `1ac3ac4`, `4b7ffd5`, `39633bf`, `22a67a5`, `c6a1d1f`, `b22cbc6`, `9243449`, `46ece3f` (notes, section 8).

## Phase 19: Public documents and the licence question

**Goal:** prepare the files a public repository needs: a README for newcomers, the licence position, a list of the third-party components, screenshots, and the project documents brought up to the merged app.

**Who:** the lead, and two workflows that wrote documents only in the main tree (no code, no servers, no browsers). Each had three writers and one editor who checked the writers' text against the code. All 8 agents returned.
- **README and reference documents:** the README with the licence note, `LICENSE-EXCEPTION.md`, `THIRD-PARTY-NOTICES.md`, the screenshots, and [ARCHITECTURE.md](ARCHITECTURE.md) and [TOOLING.md](TOOLING.md) rewritten to describe the merged app as it stood on branch `integration`.
- **History documents:** this log, [DECISIONS.md](DECISIONS.md) and [DEVIATIONS.md](DEVIATIONS.md) brought up to the first stage of the final merge, including the incidents of phase 15.

### The licence question and how the owner settled it

The port is licensed GPL-2.0-only, like upstream. Three components it ships are licensed Apache-2.0, which is not compatible with GPL version 2: hls.js (HLS streaming), abslink (a dependency of the subtitle renderer JASSUB) and the Material Design icon paths. This was open decision Q-22.

What happened, as the lead recorded it (these are the lead's summaries of the owner's words, not quotes):
1. The lead first proposed removing all three: an HLS loader of the project's own, a stand-in for abslink, and replacement icon paths. A read-only design workflow with three research agents (one per component) was started. It was stopped before any agent returned, and nothing was written.
2. The owner rejected that approach: "think like a lazy programmer". If something proven already exists, use it rather than reinvent it, because every self-written replacement costs the owner testing time. A stand-in is acceptable only if it is really small, and ready-made is still preferred.
3. The owner chose a written additional permission instead: GPL-2.0 plus permission to combine the project with Apache-2.0 libraries. The lead kept the libraries and wrote `LICENSE-EXCEPTION.md`. It can only cover this project's own code; the parts derived from Wholphin stay under Wholphin's terms. Wholphin itself ships with Apache-2.0 libraries such as AndroidX, Compose and Media3.
4. The one GPL-3.0 package found earlier (`rvfc-polyfill`, phase 15, incident 6) stays replaced by the project's own small copy.

The owner also said that if the licensing could not be made clean, the repository would stay private (phase 24).

### What came out

- **README.md:** 202 lines when first written; the editor then corrected several statements against the code (for example where Home row settings are stored, and that voice search was never tested with a real microphone) and rewrote the Docker section for a newcomer.
- **THIRD-PARTY-NOTICES.md:** generated from the app's licence list: 53 components, of which 3 are Apache-2.0, 1 LGPL (JASSUB), 1 MPL-2.0, 2 OFL-1.1 (fonts) and 46 MIT. The editor compared all 53 entries with the source list by script.
- **docs/screenshots:** 9 pictures, 3.66 MB, all from a crawl of the throwaway test server. There is no Discover picture, because Discover needs a Seerr with content and the throwaway setup has none. A movie page with cast photos was passed over because of its commercial images.
- **The documents** described above.

Later, in phase 21, the License page in the app gained the text of the exception and the Docker image gained the three files.

**Commits** (on `main`, 2026-11-17 to 2026-11-18): `a8bb5a6` (project log, decisions and deviations), `c7fbda9` (two small corrections), `e689d64` (README, licence exception, third-party notices, screenshots, architecture and tooling). These three were the last commits made on `main` itself; on 2026-11-18 `main` was then moved forward to `integration` (phase 22).

## Phase 20: The usage limit and the recovery

**What happened.** On 2026-11-18 the usage limit of the top-tier model (Claude Fable) was reached. The run records show:
- The repair agent of phase 18 stopped after about 32 minutes. It had made three commits (`4b69c7b` for the major findings, `6c0ace2` for the minor ones, `845a917` for one end-to-end test) but had written no notes and had not confirmed the gates.
- In the comparison pass (phase 23), all eleven checkers stopped within the same few minutes, and the integrator failed as it started.

**Nothing was lost.** The commits stayed on the branch, and the comparison pass's finished results stayed in the workflow runner's cache. Later the owner reset the limit. The lead then:
- resumed the comparison workflow from its cached results;
- started a new job, "finish the repair", with an independent audit after it (phase 21);
- moved checkers, fixers and auditors to a different model (Claude Opus), so that the limit of the integrators' model would last;
- stopped about a dozen dev servers that the cut-off agents had left running.

**Commit:** none of its own.

## Phase 21: Stage 2 repair and the independent audit

**Goal:** finish the interrupted repair of phase 18, bring `main`'s new documents into `integration`, apply seven small fixes the lead had collected, run every gate and the container check, and then have someone who did not do the work audit it before it lands.

**When and who:** one workflow with 2 agents, both returned. The repair agent (Claude Fable) started at 06:44 on 2026-11-18 and worked for about 75 minutes. The auditor (Claude Opus) started at 07:59 and worked for about 13 minutes. Only the repair agent was authorized to commit on `integration`. The record is section 9 of `docs/final-merge-notes.md`.

### Repair

**The 31 findings:** 29 fixed (one of them partly rejected), 1 rejected, 1 kept as a recorded difference from the TV app, none deferred.
- All four major findings were fixed and each was re-checked in a headless browser. For example, the WebKit player was left six times and only the start and stop reports reached the server.
- Rejected: an arrow-key finding in a library grid. The library has 15 items, so the card in question is the last one and there is no next card.
- Kept: in Hebrew the photo viewer's Left key goes to the next photo. Upstream reads the raw keys, but the web mirrors its on-screen arrows, grids and swipes in right-to-left languages, so the keys follow them.
- Part of the right-to-left work: English text that has no translation is now wrapped so that it keeps its left-to-right order inside a Hebrew sentence.

**Found while checking, and fixed:**
- The production server's security policy blocked the "browser too old" test of phase 16, because that test was an inline script. In the container it never ran. It is now a separate script file.
- The playlist-creating end-to-end test left playlist folders behind, because Jellyfin writes a playlist's metadata a moment after creating it. 24 such leftovers had gathered on the throwaway test server. The test now waits 3 seconds before deleting, and the suite's setup removes old leftovers.
- One flaky test (the theme test pressed Escape after the dialog had already closed) and one lint warning.

**The lead's seven fixes (a to g):**
- a. The server's `Permissions-Policy` header now allows the microphone for the app's own address, so voice search can work.
- b. The deploy guide had the mixed-content rule the wrong way round.
- c. A machine-specific path was the default location of the Android SDK in the reference-picture tools; they now read an environment variable.
- d. The "server version will not be supported soon" notice showed in Settings but not on the pickers. There is now one helper, and the notice shows nowhere, as decided earlier.
- e. The License page shows the text of `LICENSE-EXCEPTION.md` (phase 19).
- f. The Docker image carries `LICENSE`, `LICENSE-EXCEPTION.md` and `THIRD-PARTY-NOTICES.md`.
- g. Section 9 of `docs/deploy.md`, "Trying it on a second port first", written for the owner's planned trial (phase 24). The steps were checked against the server code; the reverse-proxy block itself was not run.

**Verified by the repair agent:**
- **Gates:** `gen` (no change), `typecheck`, `test` (57 files, 557 tests), `lint` (0 errors, 25 warnings), `build` and the test-code typecheck pass.
- **End-to-end suite:** 189 passed twice in a row, about 3.5 minutes each; six passing runs in a row in all after the two test fixes.
- **Crawler:** 390 pictures, all ok. In Hebrew, the screens the right-to-left findings named: 128 pictures, 0 errors and 18 warnings; the warnings come from scene scripts that look for English button names.
- **Container:** the image built (258 MB). The container served the app with its security headers, sign-in worked, and an H.264 item played for 7 seconds with no policy violation.
- No Seerr request was created and nothing was written on the real servers. On the throwaway test server: a few seconds of playback, three probe playlists created and deleted, and 27 leftover test playlists deleted.

**Not verified:** voice search with a real microphone; the Discover pages with a real Seerr in this pass; real Safari and iOS; the image's `npm ci` step, which came from the build cache.

### Audit

**Verdict:** ready to land, on one condition. Every repair claim the auditor re-checked held.
- **The condition:** in the auditor's own end-to-end run, 186 tests passed and 3 failed: the same Live TV test in three engines. The throwaway test server's Live TV guide covered only 24 hours from the moment it was generated and had run out on 2026-11-18, during the run. A test-environment problem, not a code regression; the guide had to be renewed before the gate could count as green.
- **Re-checked in a browser:** all four major findings, and the lead's fixes a, d and e. The auditor built and ran the production server to check the headers.
- **Minor points:** document lines that still named old file places; one step of the deploy guide's section 9 that would not work with a reverse proxy running in Docker; an unused branch in the server-version helper; repair commits that do not typecheck one by one; about 950 sessions of the test account on the throwaway server, left by end-to-end sign-ins.
- **Privacy sweep** of the tracked files: no machine paths, no owner name, no credentials.
- **Not checked by the auditor:** the Docker image, a real microphone, Discover against a real Seerr, real Safari and iOS.

The stale document lines and the deploy-guide step were corrected in phase 22 (`6674717`). Whether the unused branch and the test account's sessions were dealt with is not recorded.

**Commits** (all on branch `integration`): first repair pass `4b69c7b`, `6c0ace2`, `845a917`; this pass `ccad56c` (merge of `main`'s documents), `c4f0065`, `9928999`, `bfd12d3`, `d4426f1`, `76c8766`, `8ea55f4`, `041fdbf`, `079ef31`, `4b151ca`, `dea5a95`, `45f7b10`, `7bc69d0`, then `c64876d`, `3a014d3` and `1398a28` (notes, section 9).

## Phase 22: After the audit: the test guide and two focus races

**Goal:** meet the audit's condition, run the gates once more, and deal with whatever that run showed. The record is section 10 of `docs/final-merge-notes.md`.

**Who:** the lead, then one workflow with a fixer (Claude Fable) and an independent verifier (Claude Opus). Both returned.

**What happened, in order:**
1. **The test guide.** The lead changed the test-server tooling so that the Live TV guide covers eight days, a new command (`npm run ts:guide`) renews it, provisioning and the suite's setup call it, and the server check fails if the guide does not reach the next 24 hours. The same commit corrected the stale document lines the audit had named (`6674717`).
2. **The lead's own gate run** with the full end-to-end suite: 188 of 189 passed. The one failure was a keyboard test that pressed a key one frame too early, a race in the test and not in the app. The test now waits for the right element to hold focus (`62fe020`).
3. **A second race, a real defect.** Repeating the drawer tests while the machine was busy, a different keyboard test failed: 4 of 15 runs for the lead, 3 of 15 for the fixer. Cause: the Favorites page writes its tab into the URL right after it appears, and the library grid was keyed to the history entry, so it was built twice and the first card lost the focus it had just been given. For about 25 milliseconds on an idle machine, longer under load, nothing had focus, and a key pressed in that gap went to the tab row. Fixed by keying the grid to the visit (`940e0d9`).
4. **Found while recording, not by a test:** opening a page from the drawer with the keyboard a second time in a session left focus on the tab row instead of the first card, on 10 of the 11 drawer pages. Fixed in the shell (`f8024f0`, `f935a79`).
5. **A related rule:** with nothing focused, an arrow key now returns to the page's last focused element, as upstream does inside its rows and grids (`afd1afb`, test `1100e1e`).

**Verified by the fixer:** `typecheck`, the test-code typecheck, `test` (59 files, 572 tests), `lint` (0 errors, 25 warnings) and `build` pass. The end-to-end suite passed 191 of 191 in 3.6 minutes. The failing test passed 30 of 30 after the fix. In a run of the whole suite except the project that writes to the server, every test twice (359 runs including sign-ins), 358 passed; the one failure was WebKit's browser process ending in the middle of a test, and the same test then passed 8 of 8.

**Not verified:** Discover's first focus on a second visit (it needs a Seerr; the real one was not used); real Safari; the two music grids in a production build.

**The independent verifier** (on `c14b168`) found no wait, timeout or loosened check added by these commits and returned "ready to land". Its runs: the drawer tests twenty times over, 127 of 127; the keyboard project four times over, 79 of 79; a script of its own that arrives from the drawer cold and warm, 107 of 107; `typecheck`, `test` (572 tests) and `lint` (25 warnings) as above; the whole suite 190 of 191. The one failure was a WebKit library test that counted 3 cards instead of 4 after the Favorites filter; it passed when run alone, and the verifier's reading (not proven) is that the shared test account's favorites changed during the run through another suite running at the same time. It also reported a problem older than these fixes: an arrow key toward the page, pressed about 16 ms after Enter on a drawer entry, can send focus back into the drawer, because the new page has nothing to focus yet. That problem was fixed later, in the final check and repair (phase 26, findings shell-keyboard-1 and shell-keyboard-2 in `docs/final-merge-notes.md` section 12.2).

**Landing.** On 2026-11-18 at 09:35 `main` was moved forward to `integration` at `c14b168`, as git's reference log of `main` records it (a fast-forward: no merge commit, `main` simply points at the same commit).

**Commits** (all on branch `integration`, and on `main` since the fast-forward): `6674717`, `62fe020` (the lead), `940e0d9`, `afd1afb`, `f8024f0`, `f935a79`, `1100e1e`, `c14b168` (notes, section 10).

## Phase 23: Comparison with the Android TV pictures ("parity" pass)

**Goal:** compare every web screen with the 244 reference pictures taken from the Android TV app in phases 6 and 11, fix real differences in look and layout, check the fixes independently, and integrate them.

**Where and when:** a separate worktree, `.worktrees/parity`, on branch `parity`, which branches off `integration` at `c6a1d1f` (during phase 18). The workflow started at 23:55 on 2026-11-17. It ran beside phases 18 to 22.

**Who:** one workflow with four stages and an integration step. Over the original run and the resumed run, 50 agents were started and 38 returned: every agent of the resumed run returned, including the integrator; the twelve that did not return are the eleven first checkers and the first integrator, cut off by the usage limit (phase 20). The resumed run's record counts 35 agents, 9 of them area results taken from the cache.

| Stage | Agents |
|---|---|
| Compare and fix | 11 area agents (Claude Fable), each owning one area's folders |
| Shared kit | 1 agent (Claude Fable) for the requests the areas made to the shared components, theme and shell, which no area owns |
| Verify | 11 checkers, one per area, independent of the area agents |
| Fix findings | 11 fixers, one per area |
| Integrate | 1 integrator (Claude Fable): gates and commits |

### First stage: areas and shared kit

The eleven area agents ran on 2026-11-17 to 2026-11-18, each for 27 to 46 minutes. Each photographed its screens at the TV's proportions, measured them against the reference pictures and fixed the differences in its own folders. A difference in a shared component became a request to the shared-kit agent.

**Result: 230 picture pairs compared, about 118 fixes, 96 requests to the shared-kit agent.**

| Area | Pairs compared | Fixes | Requests to the shared kit | Checker findings (major) | Fixer fixes |
|---|---|---|---|---|---|
| Setup, shell and themes | 14 | 13 | 8 | 2 (0) | 0 |
| Home, search and favorites | 24 | 12 | 11 | 7 (0) | 1 |
| Library browsing | 22 | 9 | 9 | 6 (2) | 5 |
| Movie detail pages | 20 | 5 | 13 | 7 (0) | 4 |
| Series detail pages | 23 | 13 | 13 | 9 (1) | 4 |
| Player controls | 19 | 13 | 7 | 5 (1) | 3 |
| Player overlays | 20 | 9 | 5 | 5 (2) | 3 |
| Settings, main pages | 24 | 10 | 8 | 7 (2) | 5 |
| Settings, advanced pages | 21 | 9 | 6 | 5 (0) | 3 |
| Live TV | 21 | 13 | 6 | 5 (1) | 1 |
| Music and photos | 22 | 12 | 10 | 8 (2) | 3 |
| **Total** | **230** | **118** | **96** | **66 (11)** | **32** |

The first three number columns are from the original run. The Live TV and music-and-photos areas, and the shared-kit step, ran again in the resumed run (the run records do not say why); there they reported 14 and 11 fixes and 3 and 6 requests, so the total of fixes stays 118.

**The shared-kit agent** (46 minutes in the original run) applied most requests and declined those that asked for changes in feature folders or tools it did not own, naming the area that should make them. Its main decision concerned text height: Android draws a line of text with less space above and below than a browser does, and five areas asked for a global fix. The agent measured the CSS feature meant for this in Chromium, Firefox and WebKit, found it inexact or unsupported in places, and added three opt-in text classes instead of a global rule. Other changes: a centred focus ring, 440dp dialogs, menus placed as Material 3 places them, arrow keys that return to the remembered card when entering a row, and a shared outline color. Its gates: `typecheck`, `test` (62 files, 595 tests) and `lint` (0 errors).

### Second stage: checkers and fixers

The first eleven checkers were cut off by the usage limit (phase 20). In the resumed run on 2026-11-18, eleven new checkers (Claude Opus) started within a few minutes of each other and each re-examined its area's pictures: 229 in all.

**66 findings, 11 major.** Examples of the major ones:
- From the last settings row, wrapping round to the first did not scroll the list back to the top.
- Enter on the floating Skip Intro button also showed the player controls.
- A burned-in picture subtitle sat behind the seek bar while the controls were up.
- The focus ring of a genre tile in the first or last column was clipped.
- The mini player bar, a web addition, was not recorded as a difference from the TV app.

Eleven fixers (Claude Opus) started between 07:29 and 07:39 and reported 32 fixes in all (table above). Some findings were answered with a request to the shared kit or to the lead instead of a fix: for example a row for [DEVIATIONS.md](DEVIATIONS.md), which only the lead edits.

### Integration

The integrator (Claude Fable) started at 07:47 on 2026-11-18 and returned at 10:07, after about 140 minutes. Its record is `docs/parity-notes.md`.

**What it did:**
- Committed the pass's work as it found it (213 files), one commit per group of areas, before changing anything (`b5cacbc` to `3e7de07`).
- Applied the shared requests still outstanding (`07a2971`): card titles clipped and scrolled 4 dp inside the card, as upstream's padding outside the marquee; no marquee for an overflow of up to 1.5 dp; dialogs as tall as the window; popup lists that scroll inside the panel and a bare language dialog from 720 px up; the list layout's 48 dp top padding and the list details pane; a "nearest" scroll rule for the player's chapter and queue rows; no wrap in the letter column; Left from a row with nothing in its beam goes to the drawer; the player's subtitle cues drawn by the settings preview's rules.
- Found and fixed one regression of the pass, caught by the end-to-end suite: the wider menus covered the Confirm button of a dialog opened from a menu entry. Menus and dialogs now share one layer, later on top (`161598d`).
- Rebuilt the TV comparison in the crawler (`097a001`): `tools/shots/tvScenes.ts` holds 208 keyboard-driven scenes at the TV canvas, and `tools/shots/refmap.ts` pairs every one of the 244 reference pictures with a scene (36 references share a scene). `npm run shots:compare` runs it.
- Changed five end-to-end tests to the TV-correct look or to wait for the state they act on (`161598d`, `b1e0f33`); both waits were races in the tests, not faults in the app.
- Resolved collisions between agents: one pivot-scroll helper instead of two, one token for the font height, one trimming technique where the box allows it.

**Per area, in reference pictures** (each area's own verdict after its pass, recounted by the integrator): of 244, 68 matched as found, 113 were fixed, 48 still differed in the area's report and 15 have no web counterpart. Most of the 48 were shared-code items that the shared kit and the integration then closed (`docs/parity-notes.md` sections 3 and 4).

**Gates on the final tree of `parity`:** `npm run gen` no diff; `typecheck`, `e2e:typecheck` and `build` pass; `test` 63 files, 601 tests; `lint` 0 errors, 26 warnings. The end-to-end suite passed 188 of 188 twice in a row, after four earlier runs with 7, 4, 1 and 1 failures, all fixed as described above. `ts:verify` 30 checks pass, no Live TV timer. `npm run shots:compare`: 208 pictures, all ok, all 244 references paired. Normal crawl (desktop and phone): 390 pictures, all ok, one scene skipped for lack of data. After the gates the integrator took two style lines out again; only `typecheck` and two crawler scenes were run on that.

**Still different from the TV**, largest first (`docs/parity-notes.md` section 6): the dynamic backdrop colours of some images (fixed later, phase 27); the Live TV playback overlay (a recorded deviation); the scroll of two arrow-key moves in the series overview; burned-in image subtitles behind the controls; the recorded web-only parts that move things (the Back button, the mini player, the extra player buttons); text that runs up to about 1 % wider; the letter jump's focus; decisions taken earlier (search arrival focus, settings rows not ported); a few feature files that still trim text with `text-box`, which Firefox does not support. Section 5 of the notes lists the deviations the pass introduced, to be folded into [DEVIATIONS.md](DEVIATIONS.md). One upstream bug was fixed: the Artists tab's sort button, which does nothing on the TV.

**Not verified** (`docs/parity-notes.md` section 7): Firefox and WebKit beyond the end-to-end projects; real phones and real touch; most compare pairs one by one (the notes say 72 of 244 were looked at one by one in the integration step, the integrator's report says 80); the player's subtitle cue in a playing video; the Now Playing page in a right-to-left language; several states without a reference picture.

The pass's work reached the app in two merges on branch `final`: as of `2a25082` in phase 25, and its last commits (`b1e0f33` at `f27f68a`, the notes `d23d5bc` at `b120d5f`) in phases 25 and 26. It landed on `main` with phase 28.

**Commits** (all on branch `parity`, on `main` since phase 28): `b5cacbc`, `a157961`, `5b1f5be`, `c7bc265`, `2ef1dca`, `3e7de07` (07:48, the areas' work), `07a2971`, `097a001` (08:47), `161598d` (09:07), `2a25082` (09:18), `b1e0f33` (09:44), `d23d5bc` (10:06, notes).

## Phase 24: Owner decisions and housekeeping of 2026-11-18

**What this phase is.** Decisions the owner made in conversation with the lead on 2026-11-18, and the housekeeping that followed. They are recorded in no file other than the documents. What follows is the lead's summary of the owner's meaning, not a quote. The decisions are kept in [DECISIONS.md](DECISIONS.md).

**Decisions:**
- **Licensing:** a written additional permission, not self-written replacements. See phase 19.
- **Going public:** only after all known problems are solved and the product is, in the owner's word, perfect. This replaces the decision of 2026-11-17, "public when a first version works". If the licensing could not be made clean, the repository would stay private.
- **Going live behind a reverse proxy:** first as a trial on a second port, beside what runs today, before it replaces anything. The timing is the owner's call, and nothing on the live reverse proxy or the live servers changes without the owner's explicit yes. Section 9 of `docs/deploy.md` was written for this (phase 21, fix g).
- **Web-only strings:** the roughly 190 strings with the `web_` prefix are English in every language. The owner wants them translated into the popular languages upstream supports, right-to-left ones included, but put this on hold.
- **Parallel work:** the owner allowed heavy parallel use of the machine (2026-11-17 to 2026-11-18). Later the owner asked the lead to use as many parallel agents as useful, with models matched to the task, and to let agents start helpers of their own. It is the reason the final check of phase 26 ran 13 checkers at once. Found on the way: an agent inside a workflow has no tool to start agents of its own, so the fan-out was written into the workflow script instead. The standing guards did not change: no sound, no windows, never fill the disk, the real servers read-only.

**Housekeeping:**
- **Docker leftovers** from earlier attempts at this project: the owner allowed deleting them, and the lead removed them the same day. Nothing else was touched.
- **A public demo, cancelled.** The owner asked for a demo on GitHub Pages, in which visitors would type their own server address. A workflow was started on a worktree cut from `integration` and stopped before it wrote any code; its one agent did not return. The reason, as the lead recorded it: on the free plan, GitHub Pages needs a public repository, and a public demo distributes the GPL application, so the source would have to be public too. That conflicts with the decision on going public. The owner then said: "No demo".

**State of the branches** (first written at 09:51 on 2026-11-18, brought up to date after phase 28):
- `integration` holds the merged, repaired and audited app (phases 17, 18, 21 and 22), at `c14b168`. It is pushed to the private repository as a backup branch.
- `main` was moved forward to `integration` on 2026-11-18 at 09:35 (a fast-forward), so it was at `c14b168`; the documents followed at 09:51 (`2b40f89`). Before that it was at `e689d64` (the fix pass of phase 16 and the documents of phase 19).
- `parity` holds the comparison pass at `d23d5bc` (phase 23).
- **Comparison pass landed on `main`:** yes, on 2026-11-18 at 13:35, when `main` was moved forward to `final` at `e1b7e04` (phase 28). `main` then also holds the early merge, the final check and repair, and the backdrop colour fix (phases 25 to 27).

## Phase 25: Early merge of the comparison pass (branch `final`)

**Goal:** bring the comparison pass of phase 23 into the audited app without waiting for its integrator to finish, and have every resolution reviewed by someone who did not make it. The record is section 11 of `docs/final-merge-notes.md`.

**Where and when:** a new worktree, `.worktrees/final`, on branch `final`, created from `integration` at `c14b168`. The workflow started at 09:30 on 2026-11-18 and its last agent returned at about 09:56.

**Who:** one workflow with 8 agents, all returned: the merge agent (Claude Fable), six reviewers (Claude Opus), one per area (shell, arrow keys, dialogs and menus; browse grids and detail pages; Live TV; music; settings, licence page, setup and strings; the end-to-end suite and the crawler), and a repair agent (Claude Fable).

**The rule used:** the comparison pass owns how things look; the integration owns how things behave (focus, keyboard, the mixed-direction text rules, the room for the mini player, the playback session, removed strings, end-to-end stability, the licence page's content).

**The merge.** `parity` as of `2a25082` was merged at 09:43 (`3085fba`, 253 files). 13 files had conflicts; each resolution is listed in section 11.1 of the notes. 36 files had been changed on both sides since the fork; the 23 that merged without a conflict were each read against both sides. Three of them needed follow-ups: the phone rule for playlist row buttons (`7ebc953`), the music header's lines on phones (`817594e`), and the pivot scroll, which aligned an item to the window's bottom edge under the music mini player (`e8a7731`).

**Gates after the merge:** `npm run gen` no diff; `typecheck` and `e2e:typecheck` clean; `test` 68 files, 620 tests; `lint` 0 errors, 25 warnings; `build` passes. End-to-end suite once: 190 of 191; the failure was the keyboard sign-in test, a race in parity's test lines (fixed on `parity` by `b1e0f33`, which the merge did not yet have). Crawler on the screens the conflicts touched: 28 pictures, all ok.

**What the reviewers found:** three findings, all minor, all a parity intent that the merge had not carried through. The repair agent checked each against both sides and fixed all three:
- a restored focus (an arrow key with nothing focused) still used the browser's "nearest" scroll instead of the pivot rule, and could put a song under the mini player (`e3df8a1`);
- on touch phones the first button of a playlist row took taps meant for the list item (`6180e80`);
- the keyboard sign-in test pressed Down before the Add User card existed (`73ed619`, the sign-in part of `b1e0f33`).

Three tests were added, each seen failing before its fix: one unit test and two end-to-end tests. Gates after the repair: `test` 68 files, 621 tests; `lint` 0 errors, 25 warnings; the end-to-end specs that cover the changes 98 of 99 (the one failure, a seeded resume item missing in WebKit while other runs shared the test server, passed twice when run again alone).

**After the workflow:** `main` (with the documents of `2b40f89`) was merged into `final` (`1572963`), and so was parity's test fix `b1e0f33` (`f27f68a`), without its drawer part, because on this tree the grid is keyed by the visit and built once.

**Not verified** (section 11.4 of the notes): the guide header, the music header, the program dialog and the License rows in Hebrew after the merge; an arrow-key walk to an item taller than the room below the pivot with the mini player showing (checked by reading only); the full crawl and the TV compare sheet on the merged tree (both were run in phase 26).

**Commits** (on branch `final`, on `main` since phase 28): `3085fba` (09:43), `7ebc953`, `817594e`, `e8a7731` (09:43), `0eb008b` (09:46, notes section 11), `e3df8a1`, `6180e80`, `73ed619` (09:55), `8f88b38` (09:56, notes section 11.5), `1572963`, `f27f68a` (09:57).

## Phase 26: Final check and repair

**Goal:** have the merged tree of phase 25 examined from as many angles as possible at once, repair everything found, and audit the result before it lands. The record is section 12 of `docs/final-merge-notes.md`.

**Where and when:** branch `final`. The workflow started at 10:00 on 2026-11-18 and the audit returned at 13:33, about 3.5 hours.

**Who:** one workflow with 25 agents, all returned. Following the owner's instruction of the same day (phase 24), the fan-out was written into the workflow script.

| Stage | Agents | Time (local) |
|---|---|---|
| Check | 13 independent checkers (Claude Opus), one per angle | 10:00 to between 10:14 and 10:45 |
| Fix | 9 area fixers (Claude Opus): Home, browse and search; detail; playback; Live TV; music; photos; settings and setup; Discover; tools and end-to-end tests. They worked side by side without seeing each other's work | 10:45 to 11:01 |
| Shared code | 1 fixer (Claude Fable) for the shell, navigator and overlays, which no area owns | 11:01 to 11:54 |
| Integrate | 1 integrator (Claude Fable): read every change, settled the requests between fixers, merged parity's last commit, added tests, ran every gate | 11:54 to 12:57 |
| Audit | 1 independent auditor (Claude Opus) | 12:57 to 13:33 |

**The thirteen angles** (section 12.1 of the notes), with their findings: shell and keyboard 7; Home and browse 5; detail pages and dialogs 4; playback in headless Edge 4; Live TV 5; music 3; photos 3; settings and setup 4; search and Discover 3; right-to-left (Hebrew and Arabic) 2; phones and touch 4; Firefox and WebKit 3; the 208 TV comparison scenes 0.

**47 findings: 6 major, 41 minor.** All closed: 44 fixed as reported, 2 that were the same defect as another finding, and 1 rejected by its fixer and then fixed in another place by the integrator. None left open. The six major ones:
- an arrow key pressed while a page opened from the drawer was still loading put focus into the drawer for good;
- the mouse wheel could not scroll a grid whose card had keyboard focus: it jumped back 280 ms later;
- a click beside a nested dialog left focus outside the dialog that was still open, so the arrows reached the page behind it and Escape did nothing;
- dialogs opened from a menu entry that closes its menu dropped focus to the page body when they closed;
- Now Playing locked up when the focused lyric line went away with its track;
- the photo slideshow stopped after the second photo in Chromium-based browsers.

Among the minor ones: Escape within about 10 ms of Enter went back from the page being left; rows could not be dragged with the mouse, as the working agreement says they can; the player's address still named the previous episode after Next Up; in right-to-left languages the page's "first element" was the end of the top row.

**What the integration added** (section 12.3 of the notes): Left from the letter column now returns to the grid's last card at any window size (at 1440x900 it had gone to the nav drawer); the episode page asks for no series backdrop when the item names no ancestor with one (the fix the shared-code fixer had rightly rejected in the image rules); a pinned header no longer scrolls the page when it takes focus; one shared helper for counted titles; source hygiene (escaped invisible characters, no `:dir(rtl)` in the new rule). It merged parity's notes (`b120d5f`). The deviations of this round are written as a table ready for [DEVIATIONS.md](DEVIATIONS.md) (section 12.4 of the notes).

**Sixteen new end-to-end tests** (`db375e8`), each run against the tree before the fixes and seen failing there: the drawer arrival under slow data and choosing the current drawer entry again, Escape right behind Enter, focus after nested and chained dialogs, the wheel on a keyboard-focused grid, the grid's header and letter column, row dragging, the "View more" deep link, the guide click after keys, the DVR tab's arrival focus, the slideshow and the viewer's address, the PIN chain, the License page keys, the mini player from Home, the Now Playing lyric trap. The suite went from 191 to 221 tests; the unit tests from 68 files and 621 tests to 79 files and 686.

**Gates by the integrator** (section 12.6 of the notes): `gen` no diff; `typecheck`, `e2e:typecheck`, `build` pass; `test` 79 files, 686 tests; `lint` 0 errors, 25 warnings. End-to-end suite twice in a row: 221 of 221 both times (on `db375e8`, before the last test-only commit). Crawler: 390 pictures, all ok. Hebrew screens: 27 pictures, 0 errors. TV compare: 208 scenes ok; against the checker's run before the fixes, no layout moved (the 63 pictures that differ show data, clocks and video frames). Production image built (258 MB) and run against the throwaway test server: health check, configuration, deep link, security headers, sign-in, 4 seconds of playback, no policy violation.

**The audit** returned "ready to land". It re-ran the gates (same numbers), re-drove eleven fixes with its own scripts in three engines, checked a production build and swept the tracked files for private data (none found). Its own end-to-end run, without the project that writes to the server and without the Discover spec, which reads the real servers: 213 tests, 210 passed. The three failures were one test in three engines: the Home row drag test needed a fully visible Home row that overflows, which depended on what the shared test server showed that day. A test defect, not an app defect; the lead hardened the test in phase 28. Other points: one Escape on Live TV that did not go back, seen once in about 45 attempts and not reproduced; a press on a row now cancels the browser's own drag of a card link, which is not recorded as a deviation; a focused look that can stay on an element after a press with no click until the next press or key; the DVR tab can take arrival focus after mouse input.

**Not verified** (section 12.7 of the notes): Discover with a real Seerr (checked with requests answered locally); real Safari, iOS and touch hardware; the queued Back key in a production build; a full Hebrew crawl after this round. Still open from that section: [DEVIATIONS.md](DEVIATIONS.md) rows that the table of 12.4 replaces; Down into the mini player from an empty or failed page; two copies of the "arrows leave a text field" rule; the photo grid's letter column; three older `:dir(rtl)` rules that Chrome 119 does not know; a few checker observations not followed.

No Seerr request was created; only the e2e Discover spec read the real servers. No Live TV timer or recording was created.

**Commits** (on branch `final`, on `main` since phase 28): `1d70b92`, `ccdc835`, `d6bbd30`, `695c5c3` (12:00), `f45db21`, `6f2fefd`, `3325a7d`, `0f8a201`, `96f71c0`, `2165b33`, `4d4756a`, `535394e`, `d6f2c63` (12:01; the fixers' work, committed by area), `b120d5f` (12:01, merge of `parity` at `d23d5bc`), `a60b918` (12:11), `db375e8` (12:17), `240b3f9` (12:50), `05b510d` (12:56, notes section 12).

## Phase 27: Backdrop colours

**Goal:** find out why the dynamic backdrop colours differed from the TV on some items (the largest remaining difference of phase 23), fix it at the cause, and have it verified independently against the reference pictures.

**Where and when:** a separate worktree on branch `colors`, cut from `final` at `f27f68a`. The workflow started at 10:08 on 2026-11-18, beside phase 26. The fixer worked until 10:52, the verifier until 10:59.

**Who:** one workflow with 2 agents, both returned: a fixer (Claude Fable) and an independent verifier (Claude Opus).

**The cause, proven.** Android's Palette shrinks the image before it picks colours, with `Bitmap.createScaledBitmap(bitmap, w, h, false)`. That goes through Skia's nearest-neighbour sampling in fixed-point arithmetic on a float scale. The web port used plain `floor((d + 0.5) * src / dst)`. For a 1920x1080 backdrop the two pick a neighbouring source pixel in 16 of 150 columns and 12 of 84 rows, and the colour cut is sensitive enough for that to change the picked colours. Everything else in the chain matched: the image chosen, its size, the palette steps (the real palette classes and the port agreed on 160 of 160 test cases) and the painting.

**Refuted:** the earlier guess that the two JPEG decoders differ. All 16 test backdrops decode byte-identical in the four browser engines and in libjpeg-turbo.

**Home rows 4 and 5 were not a colour defect.** Albums and photo albums have no backdrop; both apps then keep the previous item's colours. The compare scene walked the Home rows faster than the 500 ms the app waits before it publishes new colours, so it kept the first item's colours. The scene now walks at the reference run's pace.

**The fix:**
- `src/app/shell/extractColors.ts` reproduces Skia's sampling (`nearestColumns`, `nearestRows`, `scaleNearest`), in integers, with tests and fixtures (`b08f0bb`). No dependency added.
- Now Playing takes its colours from the stored image, as upstream does, not from the sized picture it draws (`src/features/music/nowplaying/useNowPlayingBackdrop.ts`, `4c2cf63`).
- The compare scenes and their notes (`tools/shots/tvScenes.ts`, `refmap.ts`, `ead7347`).

**Result:** all 11 backdrops that show colours in the reference pictures match the TV within 1/255 (6 of 11 before); by the fixer's measurement the colours computed are the same in Chromium, Edge, Firefox and WebKit. The verifier, in headless Edge, measured 20 reference pictures with its own sampling script: every backdrop with colours within 1/255, including six that the fixer had not listed, and no regression on the other pages, in other themes, on a phone viewport or in Hebrew. Verdict: ready to merge.

**Limits, recorded:** Android's image loader caps decoded images at 4096 px and scales larger ones while decoding; that is not reproduced. A device whose Skia build samples differently, or a browser whose JPEG decoder differs from Android's by a step on a few pixels (possibly Safari on Apple hardware, not testable on this machine), could still give other colours.

**Commits:** `b08f0bb`, `4c2cf63`, `ead7347` (10:50, branch `colors`), merged into `final` as `b6da6a9` at 13:33; on `main` since phase 28.

## Phase 28: Landing on `main`

**What happened**, on 2026-11-18, by the lead:
1. **The colour fix** was merged into `final` (`b6da6a9`, 13:33).
2. **The drag test hardened.** The fragile test the audit of phase 26 found now takes the first overflowing Home row wherever it is, because which rows overflow and where they sit depends on the server's watched marks (`e1b7e04`, 13:35).
3. **Landing.** At 13:35 `main` was moved forward to `final` at `e1b7e04`, as git's reference log of `main` records it: a fast-forward, no merge commit. `main` now holds the merged app, the stage 2 repair, the focus fixes, the TV comparison pass, the final check and repair, and the colour fix. `integration` stays at `c14b168` and `parity` at `d23d5bc`.
4. **The test server reset.** Hours of parallel agents had changed the throwaway test server's user data: every Codec Zoo item marked watched, about 950 sessions of the test account, a stray user. Before the last end-to-end run the lead reset it to its seed (`npm run ts:reset`).
5. **A tool defect the reset exposed.** On Jellyfin 10.11 a freshly wiped server answers `/System/Info/Public` while its startup page still answers every other address with 503, so provisioning began too early. `waitForServer` in `tools/testserver/setup.mjs` now also waits until another address stops answering 503 (`bc93855`, 13:43, committed on `main` after the landing).

**Gates on the landed tree** (the lead's runs on `main` at `e1b7e04`): `typecheck` and `e2e:typecheck` clean; `test` 80 files, 694 tests (eight more than in phase 26, from the colour fix's tests); `lint` 0 errors, 25 warnings; production build passes. The end-to-end suite has 221 tests; the result of the lead's last full run on the reset server is recorded in [STATUS.md](STATUS.md).

6. **The first full end-to-end run on the reset server** (`bc93855`, alone): 220 of 221. The failing test opens the recordings tab of the Live TV library, and the reset server had no recordings folder: the old server's folder was a leftover of the recording incident of phase 15, and the seed had never made one.
7. **Pre-made recordings in the seed.** Provisioning now copies a 3.5 MB clip three times into Jellyfin's default recording folder and restarts the container once; Jellyfin makes the `Recordings` library for that folder when it starts. No timer is created and nothing is recorded. `ts:verify` checks that the folder is reported (`3b1dd7b`, 13:53).
8. **The second full run** (`3b1dd7b`, alone): 221 of 221. `main` was pushed, and the CI run of `3b1dd7b` succeeded.
9. **The Docker image** `wholphin-web:latest` was rebuilt from `main` at `3b1dd7b` (258 MB). Run against the test server with `HSTS=false`, it answered `/healthz`, `/config.json` and a deep link, and sent the security headers; a missing asset answered 404. Sign-in and playback were not repeated on the rebuilt image (the integrator of phase 26 did both on the previous build).

**Commits** (on `main`): `b6da6a9`, `e1b7e04`, `bc93855`, `3b1dd7b`.

## Phase 29: Polish round and its landing

**Goal:** close the points that the final check (section 12.7 of `docs/final-merge-notes.md`), its audit and the comparison pass (`docs/parity-notes.md`, section 6) had left open, check the result independently, and land it on `main`. The record is section 13 of `docs/final-merge-notes.md` (13.1 the items, 13.2 what the integrator changed, 13.3 deviations introduced or removed, 13.4 decisions, 13.5 tests, 13.6 gates, 13.7 what is not verified or still open).

**Where and when:** branch `polish`, cut from `main` at `3b1dd7b`, in a worktree of its own, on the afternoon of 2026-11-18. The integrator's commits are dated 15:45 to 16:12.

**Who:** one workflow with 8 agents, all returned: six fixers working side by side on files that did not overlap, one integrator, who alone committed, and one independent verifier. The integrator's commits name Claude Fable; the models of the other agents are not recorded here.

| Area | Fixer's job |
|---|---|
| Shell focus | the mini player from an empty page, Escape right after opening a page, the held focus look, focus after a window resize, the queued Back key in a production build |
| Grids | the wheel after an arrow key, the restored "View more" card, the photo grid's letter column, Live TV's arrival focus, one rule for arrows that leave a text field, the letter jump, the missing "Watch live" row |
| Series overview scroll | the scroll offset after arrow keys, measured against the TV pictures |
| Stylesheets for old engines | `:dir()`, which Chrome 119 does not know, and `text-box`, which Firefox 128 does not know |
| Tools and i18n | the Hebrew crawl's warnings, the third Live TV tab's label in Hebrew, an unused server-version tier, a Home picture taken before its last row |
| Live TV overlay | the player overlay against the TV picture |

**Fixed** (13.1 of the notes; each with a test or a recorded run):
- **Shell.** Down reaches the music mini player from an empty or failed page once the page has settled (it shows text and nothing is marked busy), and Up in the bar with nothing to return to waits on the page area. An Escape pressed in the moment between the router finishing and React showing the new page is now answered by the new page; it had been lost in 1 of 40 cold starts, and in 160 cold starts after the fix none was lost. The held focus look ends when a press ends without a click. A focused card that a window resize rebuilds gets its focus back: the cause was wider than reported, because the library grid builds its cards anew whenever the column count changes, with or without a menu open. The queued Back key was checked in a production build (`vite preview`): 20 of 20 back on the same card.
- **Grids.** The wheel on a Recommended tab, and on Home's own rows, within 450 ms of an arrow key no longer jumps back. After a reload of a scrolled "View more" grid the card that takes focus is brought fully into view. On the photo grid, Left from a letter level with no photo row ended in the nav drawer (27 of 27 letters); it now returns to the last focused card, as the library grid does. A mouse click on a Live TV tab keeps focus on the clicked tab. The rule "arrows leave a one-line field at its edges" is one helper, `src/ui/lib/fieldArrowExit.ts`; the second copy is gone.
- **Series overview.** Arrow keys scroll the page as the TV does, with its padded viewport and its delayed nested scroll; with reduced motion standing for Android's animations off, the offsets are 165.0 and 324.5 dp against the TV's 165 and 325 (before: 0 on page 2 and 26 dp off on page 3).
- **Stylesheets.** Eight rules used `:dir(rtl)` (the final check had named three); one of them had taken the working half of a selector list with it, the right-to-left slider thumb. The feature stylesheets that trimmed text with `text-box` now use the kit's exact helpers, so Chromium and a Firefox with `text-box` switched off agree within 0.06 px on 39 measured elements (before, texts were 1 to 6 px taller in Firefox 128). A unit test guards every stylesheet in `src` (`tools/css-engine-baseline.test.ts`).
- **Tools and i18n.** The crawler's scenes find controls by their names in the run's language, read from the app's own locale files (`tools/shots/uiText.ts`): the Hebrew crawl went from 84 warnings to 0. Home scenes now wait until every row has its data. The server tier "will not be supported soon", which the web never assigned, is removed from the code (`352fc73`).

**Found to be upstream behaviour, not reproducible, or not a defect** (no change in the app):
- Escape beyond the guide's first program returns to that program first, as upstream does (`TvGuideGrid.kt`).
- WebKit focus on `<body>` after the Menu key on a detail page's More button and Escape: not reproduced in 44 runs.
- Live TV's arrival focus on a direct load stays for every non-touch device, as on every other page (DECISIONS A-32); only the click on a tab was a defect.
- The letter jump: upstream's code means to focus the first item at the letter; the TV picture shows focus on the card it came from because of an upstream bug, which the web does not copy.
- The missing "Watch live" row on some Home pictures is not a Home defect: the test guide starts every program on the hour and half hour, and the crawler's browser clock is frozen at 20:00, so at that moment no program ends more than a minute later.
- The third Live TV tab's label is the recording folder's name from the server, as upstream (`CollectionFolderLiveTv.kt`), not a missing translation.
- A Home picture taken before its last row: not reproduced in 20 runs.
- The Live TV player overlay: the premise was wrong. The TV does not show the program's times either; it shows the player's position and remaining time within the stream it received. The recorded deviation (spec 05 B4) stands, and the wording of DEVIATIONS and the parity notes is to be corrected (13.3).

**What the integrator added** (13.2): it read every change against its fixer's report and settled the requests between areas (the Add to playlist dialog imports the shared field rule; the TV compare scenes of the series overview wait as the reference run did). It found and repaired one regression of the round: the shell puts focus back on Back whatever the input, so with the fixer's version a mouse user who came Back to a scrolled "View more" grid saw the page move by itself (from 60 to 130 px in the test). The page now moves only when the keyboard acted last or nothing was pressed yet in the document (`noInputYet()` in `src/ui/lib/inputModality.ts`). It wrote three end-to-end tests, among them one for that repair, which fails on the fixer's version, and cleaned up five files with Windows line endings and literal invisible characters in the crawler.

**Tests:** unit tests from 80 files and 694 tests to 84 files and 742; end-to-end suite from 221 to 239 tests (10 new tests, 18 runs across projects), each new test seen failing with its fix switched off ([e2e/README.md](../e2e/README.md) has the coverage table).

**Gates by the integrator** (13.6): `gen` no diff; `typecheck`, `e2e:typecheck`, `build` pass; `test` 84 files, 742 tests; `lint` 0 errors, 23 warnings (the same 23 as on `3b1dd7b`, linted side by side). The end-to-end suite ran three times, alone, on its own port: 238 passed on the tree before the mouse-Back repair, then 239 of 239 twice in a row on the final tree (4.3 and 4.2 minutes), with no failure in any of the three runs. The crawler on the test server (PURPLE, desktop and phone): 390 pictures, all ok, 0 warnings, in English and in Hebrew (before the round, the Hebrew crawl had 84 warnings), one scene skipped in each because no resumable episode was left. The English pictures differ from those taken at the start of the round for known reasons: texts 1 to 4 px higher where the stylesheets changed, and server data that changed during the round. The TV compare: 208 scenes, all ok, 0 warnings; the series overview pages now stand at the TV's offsets. `ts:verify`: 32 checks pass, no Live TV timer.

**The verifier** ran the end-to-end suite once and returned "ready to land", with no blocking finding. Its notes, none blocking:
- the stylesheet rewrite (`1850f33`) moves about 100 measured boxes by 1 to 4.5 px, largest on the music header's genre line and the settings group headers;
- the difference in old engines itself could not be seen, because Playwright's Firefox already supports `text-box`;
- one 404 console error in a smoke run of a production build, not traced;
- a "ResizeObserver loop completed with undelivered notifications" message, seen 3 times in the dev server's log during resize runs and not compared with `main`;
- real Chrome 119, Firefox 128, Safari, iOS and touch hardware were not checked.

**Left open** (13.7): the library grid still rebuilds its cards on every column-count change; three overlays outside the kit (`ImageFilterDialog`, the photo viewer's `ViewOptionsPanel`, the player's `PlayerSheet`) do not use the new handling for an overlay whose openers are gone; Right from the photo grid into its letter column still goes by geometry; in Hebrew the player's speed sheet shows ".25" as "25."; `ListItem` slots with element children (and the Live TV view-options title) still trim with `text-box`; the "Watch live" row in crawl pictures would need a staggered test guide and a crawler clock that follows the server; the deviations of 13.3 are still to be folded into [DEVIATIONS.md](DEVIATIONS.md).

**Landing on `main`**, by the lead, on 2026-11-18:
1. `main` was at `3d1ea68` (a documents commit), so `polish` could not be fast-forwarded. It was merged with a merge commit, `f1fb308` ("Merge the polish round (polish fab7ab5)", 16:52), cleanly, without a conflict.
2. **Gates on the merged tree:** `typecheck` and `e2e:typecheck` pass; `test` 84 files, 742 tests (694 before the round); `lint` 0 errors; `build` passes.
3. **The test server reset.** Its data had drifted during the round (each crawl's Next Up scene advances a series), so the lead reset it and provisioned it again from the main checkout. `ts:verify` after the reset: 32 checks pass. Earlier documents said 31; the check count is 32.
4. **First full end-to-end run** (239 tests, alone), started right after the reset: 236 of 239. The three failures (two profile-PIN tests on desktop and the touch "More" button test on the phone) failed only on the page guard: the test server answered 500 to five poster requests. Its log shows Jellyfin's own "Response Content-Length mismatch" error while it fills its image cache for the first time; the same addresses answered 200 afterwards and the error did not come back. A server-side effect of the first run after a reset, not an app change.
5. **Second run:** 238 of 239. The Escape test in `e2e/specs/navigation.spec.ts` failed in WebKit: at that moment the fourth Home row was "Recently added in Mixed Folders", a library with one item, and the test assumed that the row it lands on has two cards. The test now goes on to a row with two cards (`c358a52`, 17:14, test only).
6. **Third run,** on `c358a52`: 239 of 239 in 4.3 minutes.
7. `main` was pushed (`3d1ea68..c358a52`). `main` is now `c358a52`.

8. **CI.** The workflow on GitHub (type checks, unit tests, lint, build, image build) succeeded on `c358a52` in 1 min 51 s.

**What followed the same day** is phase 30: a closing round with a small-fix agent for the verifier's notes and the open points above, the Docker image rebuilt and running as a trial, and the removal of the old worktrees and branches.

**Commits:** on branch `polish`: `a229ac6`, `62249ec`, `8d08312`, `db09814`, `ad65255`, `8b618cd`, `23ac491`, `1850f33`, `352fc73`, `31dbaad`, `07d4d47`, `fab7ab5` (notes, section 13); on `main`: `f1fb308` (merge), `c358a52`.

## Phase 30: Closing round, first owner test, touch fix

**What this phase is.** 2026-11-18, after the polish round had landed: a closing round for the documents, the README's pictures and the last small points; a trial deployment of the app behind a reverse proxy; the first manual test on a real touch device; a fix for the one touch problem the owner named; the last gates and the push; the image the trial runs; and the removal of the old worktrees and branches, with one accident. The record of the two code changes is section 14 of `docs/final-merge-notes.md`. The trial and the clean-up are the lead's account and are in no file; details of the setup the trial ran on are left out of these documents on purpose.

**Where and when:** the code changes were made in the last remaining worktree (`.worktrees/final`, still on branch `polish`, by then at the same commit as `main`) and committed on `main`. Clock times of this phase are not recorded. No agent's model is recorded here.

### The closing round

**Goal:** bring every document to the landed state, retake the README's pictures from the landed app, take up the four points the polish round's verifier and notes had left (phase 29), and have all of it checked by someone who did not write it.

**Who:** one workflow with 6 agents, all returned: three documentation writers, one agent for the screenshots, one small-fix agent and one independent checker.

**Documents and pictures.** The writers brought the document set to `main` at `c358a52`; nine places that depended on results still to come were left marked for the lead. The screenshot agent retook the nine pictures of the root README, with the same file names and pixel sizes, from the app on the seeded throwaway test server. The checker looked at each picture (loaded, English, test data only, no development artifacts) and asked for no retake.

**The small-fix agent** worked on four points. One was a defect and is fixed; three have their cause and needed no change.
- **Fixed: values out of order in Hebrew and Arabic.** The report was the player's speed sheet showing ".25" as "25.". Reproduced in headless Edge in Hebrew; a scan of every value the code can show (1,236 strings, laid out in a right-to-left paragraph) flagged 184, the same in Hebrew and Arabic: 3 of the 8 speeds, all 23 bitrate values in the player's list and in the settings slider ("100 Mbps" drawn "Mbps 100"), every negative subtitle delay ("-1.5s" drawn "1.5s-") and all 6 delay step buttons ("+50ms" drawn "50ms+"). Two neighbours had the same defect: the debug overlay and the two shortcut toasts. The cause: such a value is made of digits, signs and Latin units, and a browser orders a run like that by the direction of its line. The change uses three means the code base already had: the rows of the player's sheets and the slider summaries take their direction from their content (`<bdi>`), the delay value, its buttons and the debug overlay are left to right (`dir="ltr"`), and the toast values are wrapped in isolate characters (`ltrValue()`). English layout was measured as identical with the change on and off.
- **Cause found, no change: the one 404 of the production smoke run.** It is `GET /wholphin/public`, the app's probe for the optional Wholphin server plugin, answered 404 by a server without the plugin. The TV app sends the same request on every user switch. A browser logs every 404, so the console line cannot be avoided; the end-to-end guard has always allowed it.
- **Cause found, not fixed: the "ResizeObserver loop completed with undelivered notifications" message.** It appears only when a scrolled grid is resized in several steps. It comes from the list library's own row observer, which renders synchronously when a measured row comes with a scroll correction; the tree before the polish round has it too. Nothing is visible on screen; the one trace is a line in the app's own log. A library option that removed it in 32 Firefox rounds was tried and put back, because it delays every row measurement and was not run through the suite.
- **No change needed: three overlays without the "openers gone" handling.** Probed in Chromium and Firefox. The photo viewer's view options panel and the player's sheet with the controls shown keep their opener through resizes. The photo filter dialog, and a player sheet opened while the controls are hidden, close with focus on the page body, which is the idle state of those full-screen pages by design.
- **Left for the owner:** the player's time codes in Hebrew keep the locale's direction, as the stylesheet says on purpose ([DECISIONS.md](DECISIONS.md) Q-35).

**Tests:** 6 unit tests (`src/features/playback/ui/rtlValues.test.tsx`) and 2 end-to-end tests, each in Chromium, Firefox and WebKit, with a new fixture helper that reads an element's characters in the order they are drawn. Both end-to-end tests fail in all three engines with the fix switched off (for example: expected "100Mbps", received "Mbps100"). Unit tests from 84 files and 742 tests to 85 and 748; end-to-end suite from 239 to 245 tests.

**The checker** returned "ready to commit", with nothing blocking. It corrected nine small factual slips in the documents, checked every commit hash, path and link in them, swept the tracked documents for private data (none found), and ran the gates on the small fix: `typecheck` and `e2e:typecheck` pass, `test` 85 files and 748 tests, `lint` 0 errors and 23 warnings, the two new end-to-end tests in the desktop project. It did not run them in Firefox and WebKit, and the whole end-to-end suite was not run in this round.

**Found on the way:** the small-fix agent found the main checkout's `reference/` folder empty (see "Clean-up, and an accident" below) and took its upstream facts from the specs. After its WebKit run, the existing Firefox and WebKit playback test had left its clip marked played on the test server although the test restores it; the agent set it back. The likely cause, not proven: the restore runs before the server has handled the Stopped report.

**Commit:** `692715f` (on `main`). The documents' edits were not part of it; they are committed with the final documentation pass.

### The trial deployment

**Goal:** the trial the owner had decided on in phase 24 ([DECISIONS.md](DECISIONS.md) O-21), on the owner's explicit go (O-26), without any risk to the sites the reverse proxy already serves to other people.

**Who:** the lead. Before the trial the image was rebuilt once from `main` at `c358a52`.

**First attempt: a second port.** As section 9 of `docs/deploy.md` describes, but without editing the existing reverse-proxy configuration: a second, separate Caddy process with its own configuration file, in front of the container, which was published on the loopback address only (T-52). Locally it worked: a valid certificate, the preset server, sign-in, Home, an item page, the Seerr proxy, no Content-Security-Policy violation. The second port was not reachable from outside, so the process was stopped.

**Second attempt: a sub-domain**, on the owner's second go, given on condition that the existing sites are not put at risk. The lead added one route for a sub-domain of the existing site, after saving a rollback copy of the configuration and validating the candidate separately (T-53).

**Result:** the new name got a valid certificate, the existing sites answered exactly as before, and the app answered by its public name.

### The first manual test

On 2026-11-18 the first manual test on a real touch device found everything working except one slider problem (O-29). The owner set the order of work from here: the desktop browser version must be flawless first; problems of the phone and touch interface come after it (O-28).

The one touch problem: in Settings, scrolling the page with a finger that lands on a slider changed the slider at once.

### The touch fix

**Goal:** fix that one problem at once, although touch work is scheduled later, because it was small and it changed settings by accident (T-54).

**Who:** one fixer and one independent verifier, both returned.

**Reproduced** with real one-finger gestures, sent through Chromium's debugging protocol to a phone-sized window with touch, on the test server: a 220 px swipe up that started on "Interface scale" set it from 100 to 200 and did not scroll the list; the same on "Slideshow duration" (5000 to 26000). The slider had refused every touch gesture to the browser (`touch-action: none`) and set its value the moment a pointer went down.

**The fix:**
- With a finger or a pen a slider now changes only on a sideways drag of more than 10 dp, after which the thumb is under the finger and follows it, or on a tap, at release. A move up or down scrolls the page. The direction is decided once per gesture. A gesture the browser takes back restores the value the slider had. Mouse and keyboard are unchanged.
- The fixer swept every touch rule and pointer handler in `src` for the same trap and found one more: on the reorder handles of the Home rows editor (a web addition) a swipe that started on a handle swapped two rows and did not scroll. With a finger the handle now scrolls the list, and resting on it picks the row up; the mouse still picks up on press.
- A new shared helper, `src/ui/lib/touchIntent.ts`, reads a touch's travel as undecided, sideways or scrolling.

**The verifier** returned "ready to commit". With a script of its own it swiped up and down over every slider of three settings pages and of Home settings, at several lengths and speeds, and read the value and the stored preferences each time: unchanged, and the list scrolled whenever it could. Its notes, none blocking, and what the lead did with them:
- With the fixer's rest time of 250 ms, a finger that hesitated about 300 ms on a handle before scrolling picked the row up. The lead made the rest 400 ms, which stays under the app's 500 ms long press (T-55).
- By reading the code: a second finger, which the browser captures by itself, would have moved a slider's value directly. The lead made that path mouse-only (T-55).
- Recorded and not changed (T-56): a swipe that first goes more than 10 dp sideways and then up belongs to the slider, and the value jumps to the finger; in Chromium's emulated touch a start of 12 to 14 px sideways can change the value for a moment before the browser takes the gesture back and the value is restored.

**Tests:** 28 unit tests (5 for the gesture reading, 23 for the slider) and 3 end-to-end tests in 5 runs: real touch gestures on the phone project for the slider and for the handle, and dispatched touch pointer events in Firefox, WebKit and the iPhone project, which cannot be sent a moving touch. All five runs fail on the code before the fix. Unit tests from 85 files and 748 tests to 87 and 776; end-to-end suite from 245 to 250 tests.

**Not tested:** real phone hardware and pen hardware; a real moving touch in WebKit and Firefox; the handle's pick-up on iOS.

**Commit:** `7ad52ba` (19:09, on `main`).

### Final gates and push

On `7ad52ba`, by the lead: `typecheck` and `e2e:typecheck` pass; `lint` 0 errors; `test` 87 files, 776 tests; `build` passes; the whole end-to-end suite, alone: 250 of 250 in 4.4 minutes. `main` was pushed (`c358a52..7ad52ba`). The CI workflow on GitHub succeeded on `7ad52ba` in 1 min 30 s.

### The image and the container

The image `wholphin-web:latest` was rebuilt from `main` at `7ad52ba` (258 MB), and the trial used it. Smoke test through the reverse proxy, in headless Edge: the page answers 200 with a valid certificate; `/config.json` carries the preset server and the Seerr proxy path; a missing asset answers 404; the Seerr proxy answers 200; sign-in with the limited test account lands on Home; an item page opens; 0 Content-Security-Policy violations; the only failed request is the plugin probe the closing round had traced. No video was played in this check, to keep transcodes off a real server.

`docs/deploy.md` section 9 gained what the trial taught: the sub-domain variant for a setup where no second port can be opened, a separate Caddy process as the safe way to try a configuration, and the warning that `caddy reload`, `caddy stop` and `caddy start` talk to the Caddy that is running.

### Clean-up, and an accident

**What was done.** With everything on `main`, the lead removed every worktree under `.worktrees/` and deleted the local branches `wave3a`, `integration`, `parity`, `colors`, `final`, `e2e` and `polish`. Every one of them was contained in `main`. Only `main` is left locally. On GitHub the old backup branches `e2e`, `integration` and `wave3a` still exist: deleting them was refused by the permission check of the lead's tooling and is left to the owner (`git push origin --delete e2e integration wave3a`).

**The accident,** in the form of the incidents of phase 15:
- **What happened:** the first four worktrees were removed with `git worktree remove --force`. Two shared, git-ignored folders of the main checkout were emptied with them: `reference/`, the copy of the upstream source, and `refshots/out/`, the Android TV reference pictures and the emulator's files, about 3.6 GB.
- **Cause:** each worktree held directory junctions (Windows directory links) to those two folders, so that they need not be copied. Git followed the links and deleted what they pointed at. The tooling document had warned to remove the link first and had said that what git does with a junction was not tested.
- **When it was noticed:** the four were removed while the closing round was still running; its small-fix agent found `reference/` empty.
- **What was not affected:** nothing tracked, no test data, no server.
- **Handling:** `reference/` was restored by cloning upstream at the commit the project follows (`8dcf189`). The reference pictures are not restored: capturing them again is a long emulator run, postponed until before the next comparison work (T-57). For the last worktree the links were removed first, each link itself, and its test evidence was moved to `shots/out/` before the worktree was removed. The owner has been told.
- **Consequence:** until the pictures are captured again, `npm run shots:compare` has no TV side. The compare results of phases 23, 26, 27 and 29 are recorded in these documents, and some compare output survives in the git-ignored `shots/out/`.
- **Rule since:** before removing a worktree on Windows, list the directory junctions inside it and remove each link itself first; `git worktree remove --force` deletes through them ([TOOLING.md](TOOLING.md) section 14).
- **Commit:** none.

**Commits of this phase** (on `main`): `692715f`, `7ad52ba`.

## What comes next

*Rewritten on 2026-11-18 after phases 18 to 30. The earlier versions listed stage 2 of the final merge, the comparison pass, the README, merging and landing the comparison pass, the polish round, a small-fix round, the trial behind the reverse proxy and the removal of the merged branches as still to come; they are now phases 18, 23, 19, 25 to 28, 29 and 30.*

**Still open** (no dates set):
- **The desktop browser version, flawless first.** That is the owner's order of work (O-28). What it includes is not settled: the owner was asked whether it covers the features that are not built and that a browser could have (remote control from another device over the websocket, the missing options on the music library tabs, Play on albums and artists from the shared context menu, drawing image subtitles in the browser) and has not answered (Q-43).
- **Phone and touch interface problems**, after the desktop version (O-28). No list exists yet beyond the one problem the owner named, which is fixed.
- **Capturing the Android TV reference pictures again** (the lead, before the next comparison work; T-57). Until then `npm run shots:compare` has no TV side.
- **Making the trial deployment permanent:** the owner's decision (O-27).
- **Translations of the web-only strings:** on hold (O-22).
- **Publication** of the repository, only when the owner judges the product finished (O-20, phase 24).
- **The backup branches on GitHub** (`e2e`, `integration`, `wave3a`): for the owner to delete (phase 30).
- **Not tested so far:** real Safari and iOS, real touch hardware beyond one manual test on a phone, pen hardware, the oldest supported Chrome and Firefox versions, HDR, hardware HEVC, Seerr writes against a real Seerr, and video playback in the image of the final commit (the trial's check played none).

**Open decisions for the owner:**
The numbers in brackets are entries in [DECISIONS.md](DECISIONS.md): Q-n in Part 4 (open questions), O-n in Part 1 (the owner's decisions).
- Settled on 2026-11-18: the Apache-2.0 components stay, under a written additional permission (Q-22, O-19; phase 19); going public waits until all known problems are solved (Q-3, O-20; phase 24); the Docker leftovers were removed (Q-25, O-23; phase 24).
- Going live behind a reverse proxy: decided as a trial first (Q-1, O-21; phase 24), started on the owner's go on 2026-11-18 (O-26, O-27; phase 30). Open: making it permanent, which stays the owner's yes.
- Whether the finished desktop version includes the features not built (Q-43; phase 30).
- Whether the minus of the player's time codes, drawn to the right of the number in Hebrew, should be on its left (Q-35).
- Whether to rename the repository (Q-2).
- Translating the 183 web-only strings (the keys of `src/i18n/extra/en.json`): wanted, on hold (Q-23, O-22; phase 24).
- Which of the two header-collapse rules to keep (phase 17; Q-24).
- What to do with the pull requests Dependabot has opened (Q-26).
- Where the web-only volume control sits in the player, and with which icon (Q-34).

**Open for the lead:** re-checking the six npm audit findings once a patched picomatch exists (Q-27); the audit's minor points of phases 21 and 26 that are not recorded as done (DECISIONS Q-40 for the test server's scheduled scan and old sessions); the open items of sections 13.7 and 14.7 of `docs/final-merge-notes.md` (section 12.7 is closed except where 13.7 repeats it; of the verifier's notes of phase 29 only the ResizeObserver message is left, with its cause); capturing the TV reference pictures again (T-57). The arrival-focus problem the verifier of phase 22 reported (an arrow key pressed right after Enter on a drawer entry) was fixed in phase 26 (finding shell-keyboard-1); the audit of phase 26 pressed the key within 16 ms of Enter in 40 runs, cold and warm, and focus never ended in the drawer. The other questions that wait on the lead are listed in [DECISIONS.md](DECISIONS.md) Part 4, under "Waiting on the lead".

Known bugs, deferred findings and what cannot be tested are kept in [STATUS.md](STATUS.md), which also records the lead's last end-to-end runs on the landed tree. Open decisions are tracked in [DECISIONS.md](DECISIONS.md) Part 4.

## Phases still to be recorded

*Placeholders for later updates. Fill in each one with the same shape as above (goal, who, what was built, what the reviews found, numbers, what was left open, commits) when the phase happens. The phases recorded since the first version of this log (the end of wave 3a, wave 3b, wave 4, both stages of the final merge, the documents, the comparison pass, its merge, the final check and repair, the backdrop colours, the landing, the polish round, and the closing round with the trial, the touch fix and the clean-up) are no longer listed here.*

- **The desktop version made flawless,** once the owner has said what it includes (Q-43).
- **The new capture of the TV reference pictures,** before any comparison work (T-57).
- **Phone and touch interface work,** after the desktop version (O-28).
- **Publication.**

The final documentation pass of 2026-11-18 is not a phase of its own: it wrote phase 30 and brought the other documents to `main` at `7ad52ba`. Making the reverse-proxy route permanent is not planned as a phase either. It is the owner's call (phases 24 and 30).

## Summary table

| Phase | Agents | Outcome | Commits |
|---|---|---|---|
| 1. Reconnaissance | the lead | Upstream sized (475 Kotlin files, about 107k lines, commit `8dcf189`); reverse-engineering toolkit assessed and not used | none |
| 2. Questions and decisions | the lead with the owner | 11 owner decisions plus the in-app Back button request; Seerr test rule later relaxed | `43241c1` |
| 3. Spec extraction | 6 (5 mid, 1 top) | Specs 01 to 07, design tokens, 131-entry preference data | `8a2dc8f` |
| 4. Environment probing | the lead | Toolchain and off-limits services recorded in briefs | none |
| 5. Scaffold and tokens | the lead | Working agreement, token generator, px-to-rem and interface scale | `8a2dc8f`, `2e1e11d` |
| 6. Wave 1 | 5 (3 top, 2 mid) | Core plumbing, UI kit with gallery, verified library defaults, emulator reference shots (203 pictures in 33 scenes by the agent's final report), throwaway test server | `e407b3c`, `47270e2`, `cdb90aa`, `4773184`, `5b0c9ab`, `029b43d`; `c2dc99c` (reference-shot tooling, late) |
| 7. Spec audit | 35 (29 mid, 6 top) | 219 corrections and 171 missing items found; 391 edits applied; 104 coverage gaps documented | `e407b3c`, `47270e2` |
| 8. Wave 2 | 15 (11 top, 4 mid); all returned | Shell, setup, home, crawler built; 51 findings (13 major); fixers rejected 3 findings and deferred 7 items (some are notes, not findings), and fixed the rest; the integrator fixed 9 more items and reported green gates with 145 tests; committed by the lead | `b37c856`; `11aac42` (muted test browsers, see phase 15) |
| 9. Wave 3a | 18 (12 top, 6 mid); all returned | Playback engine and controls, settings, Seerr and the production server built, reviewed and fixed on branch `wave3a`; 49 findings (11 major); gates green with 301 tests; container check passed | `318ad04` (branch `wave3a`) |
| 10. Documentation | the lead plus 13 documentation agents (4 top, 9 mid) | Docs layout, reporting rule, agent-log archiver; the document set as of 16:44 | `4abbe23`, `b37c856`, `a1108b4` |
| 11. Test data and reference shots | 2 (mid) | Image-subtitle test items, intro and outro segments, permanent CPU cap on the throwaway test server; 40 more reference pictures (Live TV, skip intro, image subtitles) | `900417f` |
| 12. Wave 3b | 16 (15 top, 1 mid); all returned | Library browsing, detail pages, search, Home customization and 8 polish fixes built in the main tree; 42 findings (1 blocker, 17 major); integrator fixed 12 more items; gates green with 230 tests; full crawl of 4,608 pictures with 0 errors | `350cf87` |
| 13. End-to-end suite, CI, compatibility review | 4 (2 top, 2 mid); all returned | 48 end-to-end tests in 5 projects; CI workflow and repository files; 8 compatibility findings (1 major); 3 app bugs found by the suite; supported-browser baseline decided | `d326a75` (branch `e2e`), `ebcd26c`, `68e6f5f` |
| 14. Wave 4 | 13 (top); all returned | `main` merged into `wave3a` and connected; Live TV, music, photos and the screensaver built; 29 findings (6 major); gates green with 448 tests; container check passed | `fc2b12e`, `f71d292`, `3a01bf4`, `1b090ed`, `580010b`, `2fe5593`, `0c6ab3b`, `7e3e0c6`, `7f1e210` (all on branch `wave3a`) |
| 15. Incidents | the lead with the owner | Six incidents (sound, windows, load, disk full, an accidental write on the real server, a GPL-3.0 dependency) and the rules and tools that came out of them | `11aac42`, `98c1e0b`, `92c3856`, `2f68c33`; `3a01bf4` (branch `wave3a`) |
| 16. Main fix pass | 3 (top); all returned | Browser baseline with a too-old notice, cross-engine fixes, the three known bugs, wave 3b leftovers, 31 new end-to-end tests in five specs, three engine projects; gates green with 245 tests; end-to-end suite 154 passed twice | `3ab4a60` |
| 17. Final merge, stage 1 | 4 (top); all returned | `wave3a` merged with the main line on branch `integration`; no placeholder page remains; 24 checker findings (5 major): 19 fixes, 5 rejections, 2 deferrals; gates green with 535 tests; end-to-end suite 63 passed twice | `c31a214`, `8566912`, `dd55686`, `f7ed3fd`, `3de9106`, `1550b6c` to `4cd56b1` (14 commits), `5580bdb`, `59d07fd` (all on branch `integration`) |
| 18. Final merge, stage 2 | 5 (top, Claude Fable); 4 returned, the repair agent cut off | The fix pass merged into `integration`: 17 conflicts, 15 overlaps made one; gates green with 553 tests; end-to-end suite 188 passed twice; crawl 390 of 390 ok; three checkers found 31 issues (4 major) | `cdd9097`, `e48f2c9`, `1ac3ac4`, `4b7ffd5`, `39633bf`, `22a67a5`, `c6a1d1f`, `b22cbc6`, `9243449`, `46ece3f` (all on branch `integration`) |
| 19. Public documents and the licence question | the lead plus 8 documentation agents; all returned; a 3-agent licence design study stopped | README, licence exception for Apache-2.0 libraries (the owner's choice over self-written replacements), third-party notices (53 components), 9 screenshots, history and reference documents refreshed | `a8bb5a6`, `c7fbda9`, `e689d64` (on `main`) |
| 20. Usage limit and recovery | the lead with the owner | Limit reached on 2026-11-18; repair agent and the comparison pass's checkers and integrator stopped; nothing lost; resumed later, checkers, fixers and auditors moved to Claude Opus | none |
| 21. Stage 2 repair and audit | 2 (Claude Fable repair, Claude Opus audit); all returned | 31 findings: 29 fixed, 1 rejected, 1 kept; the lead's seven fixes; gates green with 557 tests; end-to-end suite 189 passed twice; container check passed; audit: ready to land once the test guide is renewed | `4b69c7b`, `6c0ace2`, `845a917`, `ccad56c` to `7bc69d0` (13 commits), `c64876d`, `3a014d3`, `1398a28` (all on branch `integration`) |
| 22. After the audit | the lead, then 2 (Claude Fable fixer, Claude Opus verifier); both returned | Eight-day test guide that renews itself; lead's run 188 of 189; one test race and two focus defects fixed; gates green with 572 tests; end-to-end suite 191 of 191; verifier: ready to land; `main` moved forward to `integration` (`c14b168`) | `6674717`, `62fe020`, `940e0d9`, `afd1afb`, `f8024f0`, `f935a79`, `1100e1e`, `c14b168` (all on branch `integration`) |
| 23. Comparison with the TV pictures | 50 started over two runs (areas, shared kit and integrator on Claude Fable; checkers and fixers on Claude Opus), 38 returned; the 12 others cut off by the usage limit | 230 picture pairs compared, about 118 fixes, 96 shared-kit requests; 66 checker findings (11 major), 32 fixer fixes; integrator: compare sheet of 208 scenes for all 244 references; gates green with 601 tests; end-to-end suite 188 passed twice; compare 208 ok; crawl 390 ok | `b5cacbc` to `d23d5bc` (12 commits, branch `parity`; on `main` since phase 28) |
| 24. Owner decisions and housekeeping | the lead with the owner | Public only when finished; trial on a second port first; translations on hold; as many parallel agents as useful; Docker leftovers removed; GitHub Pages demo cancelled before any code | none |
| 25. Early merge of the comparison pass | 8 (Claude Fable merge and repair, 6 Claude Opus reviewers); all returned | `parity` at `2a25082` merged into the audited app on branch `final`: 13 conflicts, 36 files changed on both sides read; three follow-ups; reviewers: 3 minor findings, all fixed; gates green with 621 tests; then `main` and parity's test fix merged in | `3085fba`, `7ebc953`, `817594e`, `e8a7731`, `0eb008b`, `e3df8a1`, `6180e80`, `73ed619`, `8f88b38`, `1572963`, `f27f68a` (branch `final`) |
| 26. Final check and repair | 25 (13 checkers, 9 area fixers and the auditor on Claude Opus; shared-code fixer and integrator on Claude Fable); all returned | 47 findings (6 major), all closed; 16 new end-to-end tests (suite 221); gates green with 686 tests; end-to-end suite 221 passed twice; crawl 390 ok; TV compare 208 ok; container check passed; audit: ready to land, one fragile test | `1d70b92` to `05b510d` (18 commits, branch `final`) |
| 27. Backdrop colours | 2 (Claude Fable fixer, Claude Opus verifier); both returned | Cause proven: Android's Skia nearest-neighbour sampling in Palette's downscale; reproduced in `extractColors.ts`; JPEG-decoder guess refuted; 11 of 11 coloured backdrops match the TV within 1/255 (6 before); verifier: ready to merge | `b08f0bb`, `4c2cf63`, `ead7347` (branch `colors`), merged as `b6da6a9` |
| 28. Landing on `main` | the lead | Colour fix merged; drag test hardened; `main` fast-forwarded to `final` (`e1b7e04`) at 13:35; test server reset to its seed; provisioning waits for the startup page to end; gates green with 694 tests (last end-to-end run: see [STATUS.md](STATUS.md)) | `b6da6a9`, `e1b7e04`, `bc93855` |
| 29. Polish round and landing | 8 (6 fixers, 1 integrator, 1 verifier); all returned; then the lead | Six areas in parallel: shell focus, grids, series overview scroll, stylesheets for old engines, tools and i18n, Live TV overlay; one regression (mouse Back to a "View more" grid) found and repaired by the integrator; gates green with 742 tests; end-to-end suite 239 passed twice; crawl 390 ok in English and Hebrew with 0 warnings; TV compare 208 ok; verifier: ready to land; merged into `main` as `f1fb308`, one test fixed (`c358a52`), lead's third run 239 of 239, pushed | `a229ac6` to `fab7ab5` (12 commits, branch `polish`), `f1fb308`, `c358a52` |
| 30. Closing round, first owner test, touch fix | 6 (3 documentation writers, 1 for the screenshots, 1 small-fix agent, 1 checker), then 2 (touch fixer, verifier); all returned; the lead with the owner | Documents and README pictures brought to the landed state; right-to-left values fixed, three open observations traced to their causes; trial behind a reverse proxy on the owner's go (a second port first, then a sub-domain); first manual test on a phone: everything works; the one touch problem named (a scroll that starts on a slider) fixed, and the same trap on the reorder handle; gates green with 776 tests; end-to-end suite 250 of 250; CI green; image of `7ad52ba` running as the trial; worktrees and branches removed, with `reference/` (restored) and the TV reference pictures (lost) emptied by accident | `692715f`, `7ad52ba` |
