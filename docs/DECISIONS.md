# Decisions

This document lists every significant decision in the Wholphin Web project, who made it, why, and where it shows up in the code. It is meant for reviewing the project once it is finished.

Last updated: 2026-11-24

Related documents: [README.md](README.md) (index), [PROJECT-LOG.md](PROJECT-LOG.md) (chronology), [ARCHITECTURE.md](ARCHITECTURE.md) (structure), [DEVIATIONS.md](DEVIATIONS.md) (differences from upstream), [TOOLING.md](TOOLING.md) (tools and commands), [STATUS.md](STATUS.md) (current state), [spec/](spec/) (behavior specs extracted from upstream), [CLAUDE.md](../CLAUDE.md) (working agreement).

## How to read this document

- **Part 1 (O-n)** covers decisions the owner made in answer to questions.
- **Part 2 (T-n)** covers technical decisions the lead made, with reasons, rejected alternatives and costs.
- **Part 3 (A-n)** covers choices individual agents made while building. Each one has a visible effect and may be worth revisiting.
- **Part 4 (Q-n)** covers questions that are still open, and lists the earlier questions that have been settled since.

Other documents can cite an entry by its number, for example "see DECISIONS T-10". Numbers are never reused or changed. New entries get the next free number, so inside a topic the numbers are not always consecutive.

**Terms used throughout**

- **Upstream** means the original Android TV app, Wholphin (github.com/damontecres/Wholphin), version 1.1.1 at commit 8dcf189, licensed GPL-2.0. Its Kotlin source is in `reference/wholphin/`, which is git-ignored and read-only.
- **The lead** is the AI orchestrator that ran the project. **Agents** are the AI workers the lead started for individual tasks.
- **Main tree** is the repository's normal working copy (branch `main`).
- **Worktree** means an extra checkout of the same git repository in another folder, so two groups can edit files without overwriting each other. The project used three during the build: `.worktrees/w3` (branch `wave3a`), `.worktrees/e2e` (branch `e2e`, since merged into `main` and removed) and `.worktrees/int` (branch `integration`). Four more followed on 2026-11-18: `.worktrees/parity` (branch `parity`, the TV-comparison pass), `.worktrees/final` (branch `final`, where the comparison pass was merged into the merged app and the final check and repair ran), `.worktrees/docs` (branch `docs-final`, an earlier documentation update, since fast-forwarded into `main` and removed) and `.worktrees/colors` (branch `colors`, the backdrop colour fix). All of this work is on `main` since 2026-11-18 (commit `e1b7e04`). Branches `wave3a`, `integration`, `parity`, `final` and `colors` were kept only as history (`integration` last at `c14b168`, `parity` at `d23d5bc`). See T-19, T-34, T-40, T-41, T-44, T-45 and T-47. The polish round that followed reused the folder `.worktrees/final` with a new branch, `polish`, cut from `main` at `3b1dd7b`; it was merged into `main` on 2026-11-18 (merge commit `f1fb308`, T-48). The closing round's fix and the touch fix were made in that same worktree and committed on `main` (`692715f`, `7ad52ba`). Later on 2026-11-18 the lead removed every worktree and deleted every one of these branches locally; all of their commits are in `main`, and only `main` is left (T-57 records what went wrong in that step). Entries below that name a branch say where the work was done.
- **The throwaway test server** is a disposable Jellyfin in Docker on the development machine. **The real server** is a live Jellyfin and Seerr that other people use. **The limited test account** is the non-admin account the owner created on the real servers for this project.
- **Wave** means one build phase: wave 1 (foundations), wave 2 (shell, setup, Home, crawler), wave 3a (playback, settings, Seerr, production server), wave 3b (library browsing, detail pages, search, Home customization), wave 4 (Live TV, music, photos, screensaver). **The fix pass** is a later round of fixes on `main`. **The final merge** joins `main` and `wave3a` on branch `integration`: stage 1 joined `wave3a` with `main` as it was before the fix pass, stage 2 merged the fix pass, and **the stage 2 repair** handled the 31 findings of the checkers of stage 2. **The TV-comparison pass** (also called the parity pass, branch `parity`) compared the web app's screens with pictures of the Android TV app and fixed the differences (T-40). **The early merge** joined it into the merged app on branch `final` (T-41). **The final check and repair** examined the result with thirteen checkers and repaired it (T-44). **The backdrop colour job** made the dynamic backdrop colours match the TV (T-45). **The polish round** closed the points that the final check and the comparison pass had left open, after the landing (T-48).
- **Usage limit** means the cap on how much model work the account may use in a period. When it is reached, running agents stop mid-task until it is reset.
- **Mocked** means that a test answered a network request itself (with a Playwright route handler), so the request never reached a server.
- **The trial** is the deployment of the app behind the owner's reverse proxy that started on 2026-11-18 (O-26, T-53) and still runs (O-27). **The trial address** is the public name it answers under. A **go-live** replaces the build the trial runs with a newer one, after the owner's yes for that build (O-45, T-64).
- **The private repository** holds the full development history and is where the work goes on. **The public repository** holds the published tree, one commit per release (O-35, T-58). The commit hashes named in this document belong to the private repository.
- **The fast path** is the lead's way of making a small, clear interface change alone and showing it within minutes, with the slow checks afterwards (T-63).

**Status labels.** Each technical decision has a status. The labels follow [README.md](README.md#status-labels), with additions that name the branch where the work was done (all of it is on `main` since 2026-11-18):

| Label | Meaning |
|---|---|
| Planned | Decided, but no code exists yet. |
| Built | Code exists in the main tree. |
| Built and reviewed | Code exists, and independent reviewer agents checked it and fixers applied their findings. |
| Verified in a browser | An agent ran it in a real browser (usually scripted Playwright/Chromium) and reported the result. |
| On branch integration | Code is committed on branch `wave3a` or `integration` and is part of the merged app on `integration`. (Earlier versions of this document called this "In progress on branch wave3a".) Since `main` was fast-forwarded to `integration` on 2026-11-18, everything with this label is also on `main`; the label is kept to show where the work was done. |
| On branch parity | Code was committed on branch `parity` (the TV-comparison pass, T-40). It reached the merged app through branch `final` (T-41) and is on `main` since 2026-11-18 (commit `e1b7e04`, T-47); the label is kept to show where the work was done. |
| On branch final | Code was committed on branch `final` (the early merge, the final check and repair) or on branch `colors` and merged into `final`. On `main` since 2026-11-18 (commit `e1b7e04`). |
| In force, In use | For a rule or a working method that has no code state of its own: it applies now. |
| Done, Closed | A one-time step that is finished. |
| Open for re-checking | Decided for now, with a named condition for looking again. |

At the time of writing, the code is spread over three branches:

- **`main` (commit `3ab4a60`):**
  - wave 1 (core plumbing, UI kit, test server, specs) and wave 2 (shell, setup, Home, screenshot crawler; commit `b37c856`);
  - the extra test data and reference shots (commit `900417f`);
  - wave 3b (library browsing, detail pages, search, Home customization; commit `350cf87`);
  - the end-to-end test suite and the CI files, built on branch `e2e` and merged (commits `d326a75`, `ebcd26c`);
  - the fix pass (commit `3ab4a60`).
- **`wave3a` (commit `7f1e210`):** wave 3a (commit `318ad04`), a merge of `main` as it was before wave 3b (commit `fc2b12e`), and wave 4 (commit `0c6ab3b`).
- **`integration` (commit `59d07fd`):** `main` as it was before the fix pass (commit `68e6f5f`) merged with `wave3a` (commit `c31a214`), then wired together, examined by two independent checkers and repaired. This is stage 1 of the final merge.

That was the state when this document was first written (2026-11-17). Since then:

- **Stage 2 of the final merge** merged the fix pass into `integration` (merge commit `cdd9097`). Three independent checkers returned 31 findings, and the stage 2 repair handled them (`docs/final-merge-notes.md` sections 8 and 9).
- An **independent audit** found the result ready to land, on one condition: the test server's Live TV guide had to be renewed (T-38, T-39). A timing race in one test, and two small focus defects in the app found while looking for its cause, were fixed afterwards; an independent verifier checked the app fixes (section 10 of the notes; A-118 to A-121).
- **`main` was fast-forwarded to `integration`** on 2026-11-18, to commit `c14b168`. From then on `main` holds waves 1 to 4, the end-to-end suite, the fix pass, both merge stages, the repair and the focus fixes. Earlier entries that say "on branch integration" or "not on `main` yet" describe the state before that day; the ones that this update touched say so.
- **The TV-comparison pass** ran on branch `parity` (T-40). It forked from `integration` at commit `c6a1d1f`, before the stage 2 repair, and finished there (last code commit `b1e0f33`, notes `d23d5bc`; T-43).
- **The early merge** joined `parity` (as of `2a25082`) into the audited app on branch `final`, created from `integration` at `c14b168` (merge commit `3085fba`; T-41). Parity's later test fix and notes were merged in afterwards (`f27f68a`, `b120d5f`).
- **The final check and repair** ran on `final`: thirteen checkers, 47 findings, area fixers, a shared-code fixer, an integrator and an independent audit (commits `1d70b92` to `05b510d`; T-44).
- **The backdrop colour job** ran on branch `colors` (commits `b08f0bb`, `4c2cf63`, `ead7347`), merged into `final` as `b6da6a9` (T-45).
- **`main` was fast-forwarded to `final`** on 2026-11-18, to commit `e1b7e04` (T-47). From then on `main` holds everything above. A later commit on `main`, `bc93855`, is the test-server fix of T-46.
- **The polish round** ran on branch `polish`, cut from `main` at `3b1dd7b`: six fixers in parallel on disjoint files, one integrator who alone committed, and one independent verifier, whose verdict was "ready to land" (commits `a229ac6` to `fab7ab5`; `docs/final-merge-notes.md` section 13). Meanwhile `main` had moved by one documentation commit (`3d1ea68`), so the lead merged `polish` with a merge commit, `f1fb308` (T-48). After a reset of the test server (T-49) and a hardened end-to-end test (`c358a52`, T-51), `main` was pushed at `c358a52`.
- **The closing round** (the same day): three documentation writers, one agent that retook the README's screenshots, one small-fix agent and one independent checker, whose verdict was "ready to commit". Its code is commit `692715f` on `main` (A-158 to A-162; `docs/final-merge-notes.md` section 14).
- **The trial deployment** started on the owner's go (O-26; T-52, T-53), and the owner tested the app on a touch device (O-29).
- **The touch fix** for the one problem the owner named: one fixer and one independent verifier, verdict "ready to commit", commit `7ad52ba` on `main` (T-54 to T-56; A-163 to A-166). `main` was pushed at `7ad52ba`; the CI run on GitHub succeeded on `c358a52` and on `7ad52ba`.
- **The clean-up:** all worktrees and finished branches removed (T-57).
- **The work up to the first public release** (still 2026-11-18; [PROJECT-LOG.md](PROJECT-LOG.md) phase 31): the interface scale is applied when its slider is released (`93fe59c`; O-32, T-65) and the audio-track button is a music note (`6c14670`; O-32); a privacy sweep of the documents (`f3e18b1`; O-33); a compact player control strip and far less server transcoding (`bf31148`; O-34, T-59, T-60); the README of the first public release (`1003992`). The repository was published as a clean copy the same day (O-35, T-58).
- **The first maintenance round** (2026-11-22; phase 32): four bugs, one fixer each (`db14d7c`, `4a08905`, `186fe2a`, `6f16c8b`; O-37, T-66 to T-68), then two more rounds for the player's strip (`c2316a4`, `255bff6`; T-60).
- **The shell and Settings round** (2026-11-23; phase 33): the Back button only where it is needed (`32a0101`; O-39, T-69), the open drawer over the page and no darkening (`bb76c45`, `732e409`; T-70), Settings as a panel over the page it was opened from (`dc3c877` and six more commits up to `445a739`; O-40, T-61), and the series actor rows (`ba1526e`; T-75).
- **Sign-in, the Home header and the player's settings** (2026-11-23 and 2026-11-24; phase 34): `27ab920` (O-41, T-71), `8d305b7` (O-42, T-72), `e31ba4b`, `cf29a99` and `509db33` (O-43, T-73, T-74).
- **State on 2026-11-24:** `main` is at `509db33` and pushed to the private repository. The trial runs the image built from `509db33`. After it came the documentation catch-up (`3c66f2e`), the conversation export (`fda0c2b`, `0baf14f`; O-46), the repair of two Settings tests (`e9b96bf`) and the commit with the privacy sweep's fixes and phase 35. The second public release of 2026-11-24 (O-47, T-58) carries the tree of `main` after that commit, so the public repository holds the work up to and including phase 35.
- **Phase 35** (2026-11-24; [PROJECT-LOG.md](PROJECT-LOG.md)): the conversation export on the owner's request (O-46), the privacy sweep and the second release after the owner's "Yes, publish" (O-47, T-58), and the lead's rule that every agent gets an explicit model (T-76).
- **Phase 36** (2026-11-24, after the second release; [PROJECT-LOG.md](PROJECT-LOG.md)): the new order of Settings, quick rows and nine subjects, on the owner's requests (O-48, T-77), in `b7f3310`. It is not in the public repository yet.
- **Phase 37** (2026-11-24, after phase 36; [PROJECT-LOG.md](PROJECT-LOG.md)): three small changes made by the lead alone on the fast path. The subtitle line that seemed to fly in after an arrow-key skip, on the owner's report (O-49, T-78), in `c92f5e6`. The episode strip moved by the mouse, on the owner's request (O-50, T-79), in `4d6b61e`. The language list of Settings in a solid box, on the owner's report (O-51, T-80), in `ce06734`. On 2026-11-24 the owner said yes to the first two, and the trial runs the image built from `4d6b61e` (a rollback image is kept), so it has the new order of Settings, the subtitle fix and the mouse on the episode strip. The owner said yes to the third the same day and it went onto the trial. None of the four changes of phases 36 and 37 is in the public repository. **Phase 38** (the same day, after phase 37; [PROJECT-LOG.md](PROJECT-LOG.md)): the language list's box made to fit its names, on the owner's request (O-52, T-81), in `d036067`, and a generated code map, on the owner's request (O-53, T-82), in `26273ae`; the owner's answer to keep all the stored images (O-54). The trial runs the image built from `d036067`.
- **Phase 39** (the same day, after phase 38; [PROJECT-LOG.md](PROJECT-LOG.md)): the owner's question about announcing the project and the decision "Yes, publish first" (O-55), the privacy sweep and the checks before the third public release (T-83), which brought the work of phases 36 to 38 and this phase to the public repository, and the next project, an admin panel (O-56; nothing built). The trial is unchanged, at the image built from `d036067`.
- **Phase 40** (the same day, after phase 39; [PROJECT-LOG.md](PROJECT-LOG.md)): the admin panel's research, mockup (the owner's review points are binding for the build) and build plan, which the owner put on hold (O-57, O-58, `docs/spec/admin/`); the owner's rules that the lead only reviews and that one agent per area is kept (O-59, T-87); and five player changes, each put on the trial the same day on the owner's yes: a double click for fullscreen that no longer pauses (O-60, T-84, `0daae7e`), the mouse bringing the controls back after a key hid them (O-61, `7b000ca`), the subtitles back as soon as a skip has landed (O-62, T-85, `93e5bf4`), the volume on the Up and Down arrows (O-63, `93e5bf4`) and the next episode that no longer restarts an earlier one (O-64, T-86, `e6dece7`). The third release is at `66b94ca` in the public repository; none of phase 40 was in it. `main` was at `e6dece7` plus the documentation, and the trial ran the image built from `e6dece7`.
- **Phase 41** (the same day, after phase 40; [PROJECT-LOG.md](PROJECT-LOG.md)): the seamless episode change (O-65, T-88, `5734cae`), the playback engineer as a kept Opus agent with a role file and notes (O-66, T-89), the owner's question where to announce the project and the decision to ask the upstream author about the name first (O-67), and the fourth public release after "update the repo and its images" with a rewritten README (O-68, O-69, T-90). The public repository now holds everything up to and including phase 41 except the admin panel's mockup; the trial runs the image built from `5734cae`.

> **Landing state of the comparison pass:** landed. On `main` since 2026-11-18, commit `e1b7e04` (fast-forward of `main` to `final`, which holds the merge `3085fba` of `parity` at `2a25082` and the top-up merges `f27f68a` and `b120d5f`).

---

## Part 1: Decisions made by the owner

The owner gave O-1 to O-12 on 2026-11-17, in answer to explicit questions from the lead. The question wording below is a summary of how it was put. Where the lead's notes do not record the options offered, the entry says so.

O-13 to O-18 are instructions the owner gave during the build without being asked. The lead's notes record what was said in substance, not the exact words.

O-19 to O-25 come from the lead's conversation with the owner on 2026-11-17 and 2026-11-18. They are in no file; the lead reported them for this document. The wording below is the lead's summary of the owner's meaning, not a quote; the few words in quotation marks are the lead's rendering of the owner's own phrase.

O-26 to O-29 come from later on 2026-11-18, around the trial deployment and the owner's first test of the app. They are recorded the same way: in no file, reported by the lead, summarized and not quoted.

O-30 to O-69 come from 2026-11-18 (after the touch fix) to 2026-11-24: the way to the first public release, the maintenance rounds after it, the second release, the order of Settings, the subtitle report after a skip, the mouse on the episode strip, the language list, the code map, the stored images, the third release, the admin panel (its mockup, its hold, and the owner's rules for how the lead works) five reports and requests about the player, the seamless episode change, where to announce and the fourth release, in which the owner tried each change on the trial and answered. They are in no file either; the lead reported them for this document. Here the words in quotation marks are the owner's own, with the spelling corrected; everything else is the lead's summary.

### O-1. Name and license

- **Question:** What should the project be called, and under which license?
- **Choice:** The name is "Wholphin Web". The repository description and the README say it is unofficial. The license is GPL-2.0, the same as upstream, and upstream is credited.
- **What it means for the build:**
  - `package.json` has `"license": "GPL-2.0-only"` and the description "Unofficial web port of Wholphin".
  - `README.md` says it is unofficial and not affiliated with the Wholphin author or Jellyfin.
  - The license rules out GPL-3.0-only dependencies. One turned up and was replaced; see T-32. A second license question, about Apache-2.0 dependencies, was open as Q-22 and was settled by the owner on 2026-11-18 with an additional permission (O-19).

### O-2. Repository visibility

- **Question:** Should the GitHub repository be public from the start?
- **Choice:** It stays private until a first version works: sign-in, browsing, playback and a README. Then it goes public.
- **What it means for the build:**
  - Everything committed is written as if it will be public. Credentials live only in git-ignored `.env.local` (see T-25).
  - Commits use a GitHub no-reply identity.
  - The raw agent logs (`.agent-logs/`) are git-ignored. This documentation set is the curated history instead.
  - The timing of publication is still open (Q-3).
- **Superseded on 2026-11-18 by O-20.** The bar "public when a first version works" no longer applies: the repository goes public only when every known problem is solved. The rest of this entry (writing everything as if public, the no-reply identity, the git-ignored logs) still holds.
- **Updated later on 2026-11-18:** the project was published the same day, as a clean copy in a new public repository; this repository stays private (O-33, O-35, T-58). Q-3 is settled.

### O-3. Look and layout

- **Question:** Should the web app reproduce the TV screen exactly, or adapt it?
- **Options offered:**
  1. An exact TV canvas, scaled to fit the window.
  2. The TV look on a fluid layout.
  3. A toggle between the two.
- **Choice:** Option 2. The app looks identical to the TV app (colors, cards, type, drawer, page structure), but the layout is fluid. Rows and grids fill the window, and the mouse wheel scrolls.
- **What it means for the build:**
  - Design values are copied exactly from upstream (T-3, T-4).
  - Layout is not fixed: rows scroll sideways, grids reflow, and pages scroll vertically (CLAUDE.md, "Layout").
  - The wave 2 and wave 3a briefs state the owner's bar in these words: it must look and behave like the TV app (same colors, cards, type, structure), adapted to mouse, keyboard and touch, with a fluid layout from 360px phones to ultrawide desktops. (This is the lead's wording in the briefs, not a verbatim quote from the owner.)
- **Departures the owner asked for later (2026-11-18 to 2026-11-24):** the player's controls (O-34, T-60), the Back button, the nav drawer and the Settings panel (O-39, O-40, T-61, T-69, T-70), the Home header's overview (O-42) and the player's Settings sheets (O-43). Each is a deliberate difference from the TV app, made on the owner's word and recorded in [DEVIATIONS.md](DEVIATIONS.md). For everything else this entry still holds.

### O-4. Target devices

- **Question:** Which devices must the app support?
- **Choice:** Desktop browsers come first, but the app must also work on tablets and phones, because users open the link on whatever they have. TV browsers were not requested.
- **What it means for the build:**
  - Touch adaptations exist throughout: the "more" button, the phone drawer sheet and the on-screen PIN pad (see Part 3).
  - Agents test at phone width (360–390 px) as well as desktop sizes.
  - The TV remote's Back keys (`GoBack`, `XF86Back`) are handled anyway, at no cost (`src/app/shell/useBackKey.ts`), but nobody has tested them on a TV browser.

### O-5. Scope and priority

- **Question:** How much of Wholphin should be ported, and in what order?
- **Choice:** Everything Wholphin has. After movies and TV, the priority is Seerr discover and requests, at full parity: "implement the Seerr capabilities that Wholphin has". (Seerr is the request manager the owner runs next to Jellyfin: people use it to ask for titles that are not in the library yet.)
- **What it means for the build:**
  - The route table maps every upstream screen ("Destination") to a URL (T-14), including Live TV, music and photos.
  - Seerr was built in wave 3a, ahead of library browsing and detail pages. That work is on branch integration.
  - Live TV, music, photos and the screensaver were built in wave 4, also on branch integration.
  - Where upstream has no such Seerr feature, agents did not add one. Example: the brief mentioned "watchlist" and "studios" rows, which upstream does not have, so they were left out (A-27).

### O-6. Playback approach

- **Question:** How far should playback go, and is a desktop wrapper wanted?
- **Choice:** The best playback possible inside the browser:
  - detect what the browser can play;
  - play the file directly when possible;
  - otherwise let Jellyfin remux it (repackage it into another container without re-encoding) or transcode it (re-encode it);
  - render ASS subtitles in the browser.
  
  No desktop wrapper was requested.
- **What it means for the build:** The playback engine (on branch integration, `src/features/playback/engine/`):
  - builds a Jellyfin device profile from what the browser reports it can decode;
  - steps down a fallback ladder: direct play, then remux, then full transcode, then a clear error;
  - draws ASS/SSA subtitles with JASSUB, which is libass compiled to WebAssembly.

### O-7. Choosing a server

- **Question:** Should users see a server picker, or land on one server?
- **Choice:** If the deployment presets a server address, users land directly on that server's login. Otherwise the normal Wholphin multi-server screen appears.
- **What it means for the build:**
  - The app reads `/config.json` at startup (`src/api/config.ts`). If `serverUrl` is set, `ensurePresetServer()` in `src/api/session.ts` locks the app to that server and hides "Switch servers".
  - Without it, the full multi-server flow from upstream applies.
  - Verified in a browser in wave 2: preset mode goes straight to the user list.

### O-8. Hosting context

- **Question:** Where will the app run, and how will its users reach it?
- **Context:**
  - The owner runs Jellyfin and Seerr behind an existing reverse proxy with a public HTTPS address.
  - The owner was unsure about hosting options.
- **Choice:**
  - Users should reach Wholphin Web from outside, at a separate address next to Jellyfin's built-in web interface (not replacing it).
  - How it goes live behind the reverse proxy is "decide later".
- **What it means for the build:**
  - The deployment shape is a static app plus a small server in a Docker image (T-11).
  - Nobody may touch the live Caddy, Jellyfin or Seerr configuration (T-23).
  - `docs/deploy.md` (on branch integration) contains a Caddy example that the owner applies themself.
  - Going live is still open (Q-1). On 2026-11-18 the owner settled how it starts: as a trial on a second port (O-21).

### O-9. Test servers and accounts

- **Question:** Which servers may agents test against?
- **Choice:** Both:
  - a throwaway local Jellyfin, for destructive tests;
  - the real server, through a limited non-admin test account the owner created.
  
  The owner later clarified two points. The test account has no auto-approve or download permission in Seerr, so a test request cannot start a download. And using the test account is fine.
- **What it means for the build:**
  - The throwaway test server is built: Jellyfin 10.11.11 in Docker, provisioned by `tools/testserver/setup.mjs` with Blender films, a "Codec Zoo" of synthetic test files, synthetic shows, music, photos and Live TV channels. It no longer makes Live TV recordings (T-30).
  - The rule for test requests was relaxed in commit 43241c1: minimal, obscure titles, withdrawn at once, and listed in the report.
  - The Seerr builder in wave 3a made two real requests this way and withdrew both. No later run sent a request to Seerr (T-36).
  - See also O-13.

### O-10. Reference visuals

- **Question:** What should "looks the same" be measured against?
- **Choice:** An Android TV emulator running the official app, plus the source code.
- **What it means for the build:**
  - `tools/refshots/` creates the emulator, installs the official release and captures screenshots of named scenes into `refshots/out/` (git-ignored).
  - The web screenshot crawler (`tools/shots/`, `npm run shots:compare`) pairs those reference shots with web screenshots of the same screen.
  - See T-24 for how the emulator signs in.

### O-11. Working style

- **Question:** How often should the lead stop and check in?
- **Choice:** Run straight through, report at milestones with screenshots, and stop only for things that truly need the owner. Later the owner also asked for:
  - multi-agent workflows for every substantive task;
  - custom tools, notably an automatic screenshot crawler;
  - documentation of everything, so it can be reviewed at the end.
- **What it means for the build:** Every wave from wave 2 on ran as a scripted workflow with build, review and fix phases (T-21). The crawler exists (`tools/shots/`), and this documentation set exists (O-14).

### O-12. In-app Back button

- **Question:** The lead's notes record this as an adjustment the owner asked for explicitly. The options offered are not recorded.
- **Choice:** An on-screen Back button plus the Escape key replace the TV remote's Back key.
- **What it means for the build:** See T-7.
- **Narrowed on 2026-11-23 by O-39:** the button shows only where it is needed. Escape and the browser's Back are unchanged.

### O-13. The limited test account may be used as a normal user

- **What the owner said, in substance:** The limited test account on the real servers may be used the way any normal user of those servers would use it.
- **What it changed:**
  - Signing in, browsing and playing as that account on the real server needs no further permission.
  - A Seerr test request is allowed in principle, because that account cannot trigger a download (O-9).
  - The lead kept stricter limits of its own on top of this: no settings changes, no deleting or editing media, no mass-marking (T-23), and no keys or clicks that write on the real server during scripted tests (T-31). In practice, every Seerr request after wave 3a was mocked (T-36).

### O-14. Document everything, for a review at the end

- **What the owner said, in substance:** Everything about the project should be documented, so that the owner can review it when it is finished. O-11 first recorded this as part of the working style.
- **What it changed:**
  - This documentation set exists (first version in commit `a1108b4`), with `docs/README.md` as its index.
  - Agents that build do not edit these documents, because parallel edits collide. Instead, each final report must list its deviations from upstream, the upstream bugs it fixed, the decisions it made where a spec was ambiguous, any new command or setting, and what it verified and what it did not (CLAUDE.md, "Documentation"; commit `4abbe23`).
  - The lead folds the reports into the documents after each wave. The raw briefs and reports are archived locally with `node tools/archive-agent-logs.mjs` into the git-ignored `.agent-logs/` folder.
  - The documents go public with the repository, so they contain no credentials, account names, addresses of real servers or machine-specific paths.

### O-15. No test sounds

- **What the owner said, in substance:** During playback testing the test audio was audible, and the owner told the lead that tests must not make sound.
- **What it changed:** Every test browser is muted by a patch, and a hard rule was added. See T-27.

### O-16. No windows popping up

- **What the owner said, in substance:** Test browser windows kept appearing on the desktop while the machine was in use. The owner told the lead to stop that.
- **What it changed:** Every test browser now runs headless, which means without a visible window, whatever a script asks for. Anything that only works in a visible window is recorded as "not testable headless" instead. See T-28.

### O-17. Tone the load down

- **What the owner said, in substance:** The machine was slow under the project's work, and the owner asked the lead to reduce the load.
- **What it changed:** The throwaway test server's CPU use was capped, agent-started processes run at low priority, and each agent is limited to one dev server and one browser. See T-29.

### O-18. Later: more parallel processes are fine

- **What the owner said, in substance:** After the load was reduced, the owner said the load was fine and that more parallel work was allowed again.
- **What it changed:**
  - Up to four workflows ran at the same time, with the guards from T-29 still on.
  - The end-to-end suite defaults to 4 parallel workers instead of the 2 its brief asked for (A-89).
  - The parallel lines of work described in T-34 became possible.
- **Later:** the owner widened this further on 2026-11-17 to 2026-11-18 (O-24).

### O-19. Licensing: keep the Apache-2.0 libraries and add a written permission

- **Context:** The port is GPL-2.0-only, like upstream (O-1). It bundles three components under the Apache-2.0 license: hls.js (the library that plays HLS streams), abslink (a library that JASSUB, the subtitle renderer, uses) and the Material Design icons. Whether that combination is acceptable was open as Q-22.
- **What the lead proposed first:** removing the three components: a self-written HLS loader, a stand-in for abslink, and replacement icon shapes. The lead had started a design study for this (an agent workflow of three research agents, one per component). None of them returned a result before it was stopped.
- **What the owner decided:**
  - No replacements. The owner asked the lead to "think like a lazy programmer": if something proven already exists, use it instead of writing it again, because every self-written replacement costs the owner testing time. A stand-in is acceptable only if it is really small, and a ready-made one is still preferred. The owner meant this as a general rule for the project, not only for licensing.
  - Instead, the project adds a written additional permission: GPL-2.0, plus permission to combine the project with Apache-2.0 libraries.
- **What it changed:**
  - The lead stopped the design study and kept the three libraries.
  - The lead wrote `LICENSE-EXCEPTION.md`. It grants the permission for the code the project's contributors wrote. It states that it cannot cover the parts derived from Wholphin, which stay under Wholphin's own terms, and it notes that Wholphin itself ships with Apache-2.0 libraries such as AndroidX, Jetpack Compose and Media3. It reached `main` in commit `e689d64`, together with `THIRD-PARTY-NOTICES.md`.
  - `package.json` still says `GPL-2.0-only`. The License page in Settings shows the permission as its own section, and the Docker image carries the file (T-42, items e and f).
  - The one GPL-3.0 package found earlier (`rvfc-polyfill`) stays replaced by the project's own copy (T-32). The owner's decision does not touch that.
  - Q-22 is settled.

### O-20. The repository goes public only when the product is finished

- **What the owner decided:** The GitHub repository goes public only after every known problem is solved and the product is, in the owner's word, perfect. If the licensing could not have been made clean (O-19), the repository would have stayed private.
- **What it replaced:** O-2's bar, "public when a first version works" (sign-in, browsing, playback and a README). O-2 is marked superseded.
- **What it changed:** Q-3 now waits on this bar instead of O-2's. The public demo was cancelled partly because of it (O-25).
- **Updated later on 2026-11-18:** the owner gave the go for publishing the same day, after two last requests and a privacy sweep (O-33, O-34), and chose a clean copy (O-35). What was still open at that moment stayed open and is listed in [STATUS.md](STATUS.md).

### O-21. Going live: first a trial on a second port

- **What the owner decided:** When Wholphin Web goes live behind a reverse proxy, it starts as a trial on a second port, next to what runs today, before it replaces anything. The timing is the owner's call. Nothing on the live reverse proxy or on the live servers changes without the owner's explicit yes.
- **What it changed:**
  - `docs/deploy.md` section 9, "Trying it on a second port first", was written for this by the stage 2 repair at the lead's request (T-42, item g). It describes the container on the loopback address, a second site block in the reverse proxy for the same host name, the port forward, the checks, and how to remove the trial again. The reverse-proxy block itself has not been run.
  - The trial command turns HSTS off (A-113).
  - Q-1 stays open for the timing.
- **Updated 2026-11-18:** the owner gave the go the same day (O-26). A second port turned out not to be reachable from outside, so the trial used a sub-domain instead; `docs/deploy.md` section 9 now describes both variants.

### O-22. Translating the web-only strings: wanted, on hold

- **Context:** About 190 strings exist only in this port (keys with the `web_` prefix, T-9). They have no upstream translation, so they appear in English in every language.
- **What the owner decided:** They should be translated into the popular languages that upstream supports, right-to-left ones included. The owner put the work on hold.
- **What it changed:** Nothing yet. Until then, English text inside a right-to-left interface is wrapped so that it reads in the right order (A-110). Q-23 stays open: the decision to translate is made, the timing and the languages in full are not.

### O-23. Docker leftovers from earlier attempts may be deleted

- **Context:** Containers and images from earlier attempts at this project were left on the development machine. Agents may not touch containers they did not start (T-23), so this was open as Q-25.
- **What the owner decided:** They may be deleted.
- **What it changed:** On the same day the lead deleted these leftovers of the project and nothing else. Q-25 is settled. The project's own current image is a separate question (Q-33).

### O-24. Heavy parallel use, and as many parallel agents as useful

- **What the owner decided:**
  - For 2026-11-17 to 2026-11-18 the owner allowed heavy parallel use of the machine, unattended.
  - Later on 2026-11-18 the owner asked the lead to use as many parallel agents as are useful, with models matched to each task, and to let agents start helpers of their own.
- **What did not change:** the standing guards: no sound (T-27), no windows (T-28), never fill the disk (T-30), and the real servers are read-only (T-23, T-31).
- **What it changed:**
  - The TV-comparison pass ran eleven area agents at once (T-40).
  - During that run the usage limit was reached (T-37).
  - Briefs written after this decision tell agents that they may split their work among helpers, with a model that fits each piece, as the brief of the merge in T-41 does.
  - Found on the way: agents started by a workflow have no tool to start agents of their own, so "let agents fan out" could not be done inside an agent. The fan-out was written into the workflow scripts instead. This is why the final check ran thirteen checkers at once, then nine area fixers and one shared-code fixer side by side (T-44).

### O-25. No public demo

- **What the owner asked for, and then cancelled:** A public demo on GitHub Pages, where visitors type the address of their own server. The owner asked for it and cancelled it on the same day, 2026-11-18, with the words "No demo".
- **Why, as the lead recorded it:** A public demo distributes the GPL application, so its source would have to be public too. That conflicts with O-20.
- **What it changed:** The job that was to build the demo was stopped before it wrote any code (the archive lists it with one agent and no result).

### O-26. The go for the trial, and a second go for a sub-domain

- **Context:** O-21 had decided that going live starts as a trial next to what runs today, at a time the owner chooses, and that nothing on the live reverse proxy changes without the owner's explicit yes.
- **What the owner decided, in two steps on 2026-11-18:**
  - The go for the trial. The lead tried it first without touching the running reverse proxy at all: a second, separate reverse-proxy process on another port (T-52). The second port was not reachable from outside.
  - A second go, for the way that needs no new port: a sub-domain of the existing site, routed by the reverse proxy that already runs, on condition that the existing sites, which serve other people, are not put at risk.
- **What it changed:**
  - The lead added one route to the running reverse proxy, with a saved copy to roll back to and a candidate validated beforehand (T-53). The existing sites answered exactly as before; the app answered under its new name with a valid certificate.
  - `docs/deploy.md` section 9 gained the sub-domain variant and the safe way to try a configuration.
  - Q-1 is answered for the start of the trial; what stays open is whether and when it becomes permanent (O-27).

### O-27. The trial keeps running for now

- **What the owner decided:** After testing the app (O-29), the owner decided to keep the trial for now.
- **What stays the owner's:** making it permanent is the owner's decision; the lead does not edit the owner's reverse-proxy configuration.
- **State on 2026-11-24:** the trial still runs, on the same temporary route. Since the first public release each newer build replaces the one it runs only after the owner's yes for that build (O-45, T-64).

### O-28. The order of work: the desktop browser version first, phone and touch after

- **What the owner decided:** The desktop browser version must be flawless first. Problems of the phone and touch interface come after it.
- **What it changed:**
  - Open points are sorted by it: [STATUS.md](STATUS.md) section 4.3 lists the phone and touch interface as a later block of work, with no list of problems yet.
  - One exception was made the same day, by the lead: the touch problem the owner had just named was fixed at once (T-54).
  - It raised a question: whether "flawless" includes the features that are not built (Q-43). The owner answered it later the same day: they do not block it (O-30).
  - The maintenance rounds after the first public release follow it: the owner hands over items one at a time, the desktop browser first (O-35, O-37).

### O-29. The owner's first acceptance: "everything works"

- **What happened:** On 2026-11-18 the owner tried the app on a real touch device and reported that everything works. It is the first time a person used the app, and the first use on a real touch device.
- **What the owner named:** one touch problem. In Settings, scrolling the page with a finger that lands on a slider changed the slider at once.
- **What it changed:** the touch fix (`7ad52ba`; T-54 to T-56, A-163 to A-166). The owner's statement is recorded as given: which pages and which browser the owner used is not recorded, and it does not replace the acceptance pass of [STATUS.md](STATUS.md) section 5.

### O-30. The features that are not built do not block "finished"

- **Context:** Q-43 asked whether the "flawless" desktop version of O-28 includes four things that a browser could have and the app did not: remote control of this app from another device, the filter and the full view options on the music library tabs, Play on an album or an artist from the shared context menu, and image subtitles drawn in the browser.
- **What the owner decided (2026-11-18):**
  - Remote control from another device is "nice to have", not required.
  - The music extras: the owner does not care about them as long as music works.
  - Image subtitles drawn in the browser: left out, on the lead's recommendation, after the lead had explained what it is.
- **What it changed:**
  - Q-43 is settled: none of the four blocks "finished".
  - One of them was built later the same day after all, as part of the request for less server transcoding: image subtitles of the PGS kind are drawn in the browser (O-34, T-59).
  - The others stay recorded as not built in [DEVIATIONS.md](DEVIATIONS.md).

### O-31. The next priority: polish, then additions for the owner of a deployment

- **What the owner decided (2026-11-18):**
  - The next priority, in the owner's words: "polish everything up so it would look the greatest that ever been".
  - After that, additions for the owner of a deployment: things that shape how that deployment's own users first get the app. The first example is the default interface language of a deployment.
- **Confirmed on 2026-11-19:** the direction is that the owner of a deployment sets the defaults for all its users (O-36).
- **What it changed:** Nothing is built yet. The lead's idea, which is not agreed: a setting of the deployment, served through `/config.json` (T-12), and not a fork of the code. The form is open (Q-44).

### O-32. Two small requests: the audio-track button and the interface scale slider

- **What the owner asked for (2026-11-18):**
  - The audio-track button of the player must not look like the volume control. Both showed a speaker (open as Q-34 since wave 3a).
  - The interface scale must not resize the interface while its slider is dragged.
- **What it changed:**
  - Commit `6c14670`: the volume control keeps its speaker, and the audio-track button takes the Material "audiotrack" music note, which Jellyfin's own web player uses for it. The icon was the lead's choice; the owner saw it: "looks fine". Q-34 is settled.
  - Commit `93fe59c`: a drag on the "Interface scale" slider moves only the thumb and the row's summary, and the scale is applied once, at the release (T-65).
  - Each was built by one fixer, and one independent verifier checked both (the archive lists the job with three agents).

### O-33. The go for publishing, after a privacy sweep

- **What the owner decided (2026-11-18):** When the fixes are finished: first a privacy sweep of the repository, then the repository becomes public. The owner asked for five agents at once, each on a different part, and not as a high-security matter: "don't treat it as high security", find and fix.
- **The rule for the documents:** a decision the owner made may be recorded. Nothing describes the owner, the owner's home, machine or server, and no picture shows the real server.
- **What it replaced:** the bar of O-20, "only when every known problem is solved". The owner gave the go while some points were still open; they are listed in [STATUS.md](STATUS.md).
- **What it changed:**
  - The sweep ran as five finders (the documents that tell the story; the technical documents; the application code; the tools, tests and pictures; the git history), one fixer and two re-checkers.
  - Its fixes are commit `f3e18b1` (the documents) and a part of `bf31148` (the last wording in comments and tool READMEs).
  - How the repository was published is O-35 and T-58. Q-3 is settled.

### O-34. Two must-haves before shipping: less server transcoding, and a player laid out like Jellyfin's own web player

- **Context:** For a desktop Chromium browser the server transcoded far more than it had to: "container not supported" for MKV files, "audio codec not supported" for AC-3 and E-AC-3 sound, and image subtitles burned into the picture.
- **What the owner decided (2026-11-18):**
  - (a) Less server transcoding: the site should do as much as it can itself.
  - (b) A player layout modelled on Jellyfin's own web player: no dimming of the video when the controls show; a compact control strip flush with the bottom edge; chapters and queue as icon buttons that open panels, instead of rows of cards.
  - Later, after seeing the layout: "keep the controls in the middle."
- **What it means:** (b) knowingly departs from the TV layout, and so from O-3 for the player's controls.
- **What it changed:**
  - Commit `bf31148`, built by two builders side by side (the layout; the playback engine), each checked by an independent verifier (the archive lists the job with four agents).
  - The direct-play work is T-59; the layout is T-60. A web-only preference brings the TV's dimming back.

### O-35. How to publish: a clean copy

- **Context:** The privacy sweep cleaned the current files (O-33). Older versions of the documents stayed in the repository's history, and a history cannot be cleaned in place on the host (T-58).
- **What the owner decided (2026-11-18):** "Yes, clean copy". The existing repository stays private, as the archive with the full history. A new public repository holds the cleaned tree as one fresh commit.
- **What happened:** The project was published on 2026-11-18. The README of that release is commit `1003992`.
- **What it changed:**
  - Since then the project is in "maintenance and improvements": the owner hands over items one at a time, the desktop browser first (O-28).
  - The procedure for every later release is T-58.

### O-36. Four answers: the time format, where Settings opens, global view options, the defaults of a deployment

- **What the owner decided (2026-11-19):**
  - The time format in the player: "52:53 and 1:52:53". There is no hour field under an hour.
  - Settings opens next to the sidebar (the nav drawer), in left-to-right and in right-to-left languages alike.
  - The view options (card size, columns, spacing, text under a card) are global: one setting for every library.
  - The owner of a deployment sets the defaults for all its users (O-31).
- **What it changed:**
  - The time format: commit `c2316a4` (T-60).
  - Settings on the nav drawer's side: commit `398f168` (O-40, T-61).
  - The global view options are not built; the owner set them aside on 2026-11-24 (O-44).
  - The defaults of a deployment are not built (Q-44).

### O-37. The order of the first maintenance round

- **What the owner decided (2026-11-22):**
  - Bugs first, one agent per bug, the lead leading: "start only on the bugs. delegate to each for an agent. You are the lead as always."
  - Then, for the player: a softer gradient, fixed button positions, the title closer to the edge, the time format of O-36, a favourite button.
  - Then: swap the two side button groups and keep their inner order, "meaning that the volume will be at the right in its row".
- **What it changed:**
  - Four bugs, one fixer each; the archive also lists one checker for each fix:
    - a poster grid that just fits shook sideways (`db14d7c`, T-66);
    - a mouse drag on a slider was taken over by the browser's drag-and-drop (`4a08905`, T-67);
    - the player's video box against the window: measured, it already filled it, and a test now holds that (`186fe2a`);
    - subtitle lines took the direction of the interface language (`6f16c8b`, T-68).
  - The player round: commit `c2316a4` (T-60).
  - The swap: commit `255bff6` (T-60).

### O-38. Small changes must not take long

- **What the owner said (2026-11-22 and 2026-11-23):** "it doesn't need to take more than 7 minutes"; "again, things are taking too long"; "you need to learn how to make things go faster, without losing quality".
- **What it changed:** The lead set a rule for small, clear interface changes: the fast path (T-63). The multi-agent workflows of O-11 are kept for large or risky work.

### O-39. The Back button only where it is needed

- **Context:** Since T-7 a floating Back button showed on every page except Home (O-12).
- **What the owner decided (2026-11-23):** The Back button "is ugly, and unneeded in many cases. Understand when there is no need for it and get rid of it." Later the same day: no Back button on Settings either.
- **What it changed:**
  - Commit `32a0101`: no Back button on the pages the drawer leads to, and no circle around the arrow at rest (T-69).
  - Commit `dc3c877` and the ones after it: no Back button on Settings while the area beside the panel can be clicked (T-61).

### O-40. Settings: a panel on the drawer's side over the page behind it, and no darkening

- **What the owner decided (2026-11-23),** one step at a time, each after seeing the one before:
  1. No Back button on Settings, and a see-through background: "just remove it and make the background transparent with a little tint". Asked what should be behind it, the owner chose "Page behind stays visible".
  2. "I now want to make the settings be in the correct side": the nav drawer's side.
  3. "make the settings not fade in, just appear".
  4. "I do not like the way the settings pop up. Can't it be something similar to the sidebar's look and feel?"
  5. "I want the darkening of the image to go away. The background doesn't need to get dark when I open the sidebar or settings."
  6. A blink between the open drawer and Settings, to be found and fixed.
  7. The opening transition of the Settings panel was broken: "redo it".
- **At the end:** "seems to work great now."
- **Related, the same day:** the open drawer lies over the page instead of pushing it aside (commit `bb76c45`). The commit message records it as an owner request, because the push was unpleasant to watch; the owner's words are not recorded.
- **What it changed:**
  - Commits `dc3c877`, `398f168`, `5ab9fd6`, `d1be200`, `7454e4c`, `732e409`, `630c7e9` and `445a739` (T-61, T-70).
  - Step 3 was replaced by steps 4 and 7 for one case: chosen from the open drawer, the panel now opens out of the drawer. Opened any other way, and between Settings screens, it just appears.
  - Each step is a deliberate difference from the TV app, which shows Settings as a full-screen page with its panel at the end edge, fades and slides it in, and darkens the backdrop behind the open drawer. They are recorded in [DEVIATIONS.md](DEVIATIONS.md).

### O-41. A listed user without a password is signed in by the click

- **What the owner decided (2026-11-23):** About users without a password: "it should account only to users on the welcome screen". For such a user: "clicking it should immediately open the main screen".
- **What it changed:** Commit `27ab920` (T-71).

### O-42. More room for the description in the Home header

- **What the owner asked for (2026-11-23):** more room for the show description in the Home header.
- **What it changed:** Commit `8d305b7` (T-72). The owner: "seems fine".

### O-43. The player's settings: subtitle style inside the player, and smaller sheets

- **What the owner asked for (2026-11-23 and 2026-11-24),** in three steps:
  - "change subtitles inside a player's settings": the subtitle style options inside the player (commit `e31ba4b`).
  - "When there are subtitles unable to be changed it should say so. Make it a bit more transparent. The settings themselves take too much space for what they need. Let them keep a bit of padding and make less wide." With a picture of the player's main Settings menu the owner made clear that this means every Settings sheet of the player (commit `cf29a99`).
  - "there is still a lot of space to the left" and "less transparent also make it" (commit `509db33`).
- **What it changed:** T-73 and T-74.

### O-44. View options for every library: set aside

- **Context:** O-36 had decided that the view options are global. The lead offered "view options for every library, with a bigger dialog" as the next item.
- **What the owner decided (2026-11-24):** "no need for now, I think it is pretty nice as it is".
- **What it changed:** The global view options of O-36 are not built. The view options stay as they are.

### O-45. A new build replaces the trial only after the owner's yes for that build

- **What the owner decided:** A standing rule, restated every time: a new build replaces the one the trial runs only after the owner's explicit yes for that build ("Yes, go live").
- **What it means:**
  - It continues O-21: nothing on the live side changes without the owner's explicit yes.
  - A yes covers one build. The lead shows the change first, then asks (T-63); how a go-live is carried out is T-64.

### O-46. A written copy of the whole working session, kept up to date

- **Context:** The documents are written from agents' reports and the lead's account; the owner wanted the working session itself to be readable afterwards.
- **What the owner asked (2026-11-24):** An automatically written copy of the working session that includes the pictures, the subagents' chats and the chat with the lead; then that it be brought up to date "every few chats".
- **What it changed:** The tool `tools/export-conversation.mjs` (`npm run conversation`; commits `fda0c2b`, `0baf14f`), described in [TOOLING.md](TOOLING.md) section 15. Its output is git-ignored, like the agent-log archive. As a Claude Code "Stop" hook it rebuilds the copy on every fifth reply.

### O-47. The go for the second public release

- **Context:** After the documentation catch-up the lead asked whether to run the privacy check and publish the newer work. Until then it was not recorded whether the owner wants to give a go for each release.
- **What the owner decided (2026-11-24):** "Yes, publish".
- **What it changed:** The privacy sweep and the second release were made the same day (T-58; phase 35 of [PROJECT-LOG.md](PROJECT-LOG.md)). For this release the owner was asked and gave the go; whether the owner wants to be asked before every later release is not recorded.

### O-48. The order of Settings: quick rows, then nine subjects, each listing its rows

- **Context:** After the second release the owner asked what comes next, and the lead proposed Settings navigation and categories, the item on the owner's list for later. The lead read the layout then in use: about 95 rows on 8 screens in the TV app's order, one subject spread over several screens (subtitles in three places, audio in three, the groups Interface, Playback and More each twice).
- **What the owner asked (2026-11-24), in order:**
  - "do a small research about settings and give me a few options for the order. make it as a tree like folder tree." The lead showed three orders as trees: A by subject (nine subjects on the first screen), B the TV's two levels tidied, and C a short first screen with the most used rows on top and five subjects.
  - The owner asked for an example of a mixture of option C and option A, got one (five quick rows, then A's nine subjects) and said "do this".
  - After the first build, in which each subject showed its first three rows on one line cut off with an ellipsis: "make the options inside each setting be in a list instead of just having ...". Each subject now lists all its rows, one to a line.
- **What it changed:** T-77 and the Settings rows of [DEVIATIONS.md](DEVIATIONS.md). With the full lists the first screen is taller than a 16:9 window and scrolls; the owner chose the lists. A search box in Settings, which the lead had mentioned as an idea, was not asked for and not built.

### O-49. Subtitles that seemed to fly in from the left after a skip

- **Context:** The owner reported a problem with text subtitles after skipping with the arrow keys.
- **What the owner reported (2026-11-24), in order** (summarized, not quoted):
  - After a skip forward the subtitles seemed to fly into existence from the left.
  - The owner wanted them to just appear.
  - Then: it only happens in fullscreen, and when pressing the arrow keys forward and backward.
  - And: with the skip button on the screen there is no problem.
- **What it changed:** T-78, and the subtitle rows of [DEVIATIONS.md](DEVIATIONS.md). The last two remarks were the clue: with the on-screen button the controls are up and the subtitles are never taken away.

### O-50. The mouse moves the episode strip

- **Context:** The episode strip of a series page scrolled with a trackpad, a finger, the keyboard and its arrow buttons only.
- **What the owner asked (2026-11-24):** to be able to move the episodes carousel by holding and dragging, and with the scroll of the mouse.
- **What it changed:** T-79 and the series rows of [DEVIATIONS.md](DEVIATIONS.md). On 2026-11-24 the owner said yes and it went onto the trial (the image built from `4d6b61e`).

### O-51. The language list is not transparent

- **Context:** The language row of Settings opens a list of languages over the panel, and the page stays visible behind the panel (T-61).
- **What the owner reported (2026-11-24), with a picture of Settings open over a page:** the language select should not be transparent.
- **What it changed:** T-80 and the Settings row of [DEVIATIONS.md](DEVIATIONS.md). The language list now has the popup's surface like every other choice. The owner said yes the same day and it went onto the trial.

### O-52. The language list's box: some margin, smaller

- **Context:** After O-51 the language list had the popup's surface, at the TV's fixed width and, being a long list, from the top of the window to its bottom.
- **What the owner asked (2026-11-24), with a picture of the list in its new box:** make some margin around it, make it smaller, not so much unused space.
- **What it changed:** T-81 and the Settings row of [DEVIATIONS.md](DEVIATIONS.md). The owner said yes and it went onto the trial.

### O-53. A folder tree that helps to find the element to change

- **Context:** Looking for what makes the language list see-through (O-51), the owner found the Settings code but not the file responsible, and then asked whether a file with a similar name, the stylesheet of the preferred audio and subtitle language rows, was the one. It was not.
- **What the owner asked (2026-11-24):** a folder tree for the project, and for the source folder in particular, to help the owner, others and the lead find the element that needs changing.
- **What it changed:** T-82 and the code map, `docs/CODE-MAP.md`.

### O-54. Keep all the stored images

- **Context:** The trial's go-lives keep the previous image under a rollback tag (T-64), and many were stored.
- **What the owner said (2026-11-24),** asked whether to delete the old rollback images and keep the last two: "Keep them all".
- **What it changed:** it refines T-64: no image is pruned.

### O-55. May the project be announced, and the go for the third public release

- **Context:** The owner wanted to announce the project in the Jellyfin community's subreddit and asked whether anyone's permission is needed.
- **What the lead answered (2026-11-24),** from the licence and from the Jellyfin project's published policies read that day:
  - No permission is needed: the licence is GPL-2.0, the same as upstream's, the source is public, upstream is credited and the project is marked unofficial.
  - The Jellyfin project's policy on large language models asks that a project developed mainly by one is clearly marked as such when it is shared in their communities (the root README already says how the project was built), that posts are in the poster's own words (so the lead does not write the announcement), and that licences and credit are respected. Their branding page asks third-party projects not to use the name Jellyfin as the product's name.
  - The lead recommended telling Wholphin's author first as a courtesy, and bringing the public repository up to date before announcing.
  - Not verified: the subreddit's own rules page, which could not be opened from the lead's tools.
- **What the owner decided (2026-11-24):** "Yes, publish first".
- **What it changed:** The privacy sweep and the third release were made the same day (T-83; phase 39 of [PROJECT-LOG.md](PROJECT-LOG.md)). Whether the owner wants to be asked before every later release is still not recorded; for the first three the owner gave a go.

### O-56. The next project: an admin panel inside Wholphin Web

- **Context:** After the third release the owner opened the next project.
- **What the owner asked (2026-11-24):** an admin panel inside Wholphin Web that is to replace the frontend of Jellyfin's stock dashboard, starting with research (what pages exist, how they connect, what can be merged or improved, what is needed), then a mockup. The owner's constraint: where the research looks at a running server's dashboard, only the lead looks, and nothing is changed.
- **What it changed:** nothing in the code. The research was done the same day (`docs/spec/admin/`; phase 40 of [PROJECT-LOG.md](PROJECT-LOG.md)); the structure, the mockup and the build plan followed (O-57, O-58), and the owner put the project on hold. Nothing is built; no file of it is in the third release (the research and the plan are in `docs/spec/admin/` on `main`).

### O-57. The admin panel's structure, and the owner's review of the mockup

- **Context:** The research for the admin panel (O-56) was done: the server's administration API and the stock dashboard were written down in `docs/spec/admin/` (phase 40 of [PROJECT-LOG.md](PROJECT-LOG.md)), and three proposed structures were checked against the page list. The structure the owner was shown was an Overview and nine subjects.
- **What the owner decided (2026-11-24):** the structure was approved with "Yes, mock it up". The lead's mockup was a private design canvas with invented data, first of 28 screens.
- **What the owner asked after looking at it,** in substance (the lead's summary, not quotes). These points are binding for the build:
  - Use the width on 1080p, 2K and 4K screens: cards flow into columns, and an "On this page" list stands at the side, like a documentation page.
  - The main action of a page stands on the same row as the search and the filters.
  - One look for dropdowns, with room to the right of the arrow.
  - Controls that belong together stand side by side on one line and at one height. The owner called misaligned field-and-button pairs a recurring fault.
  - The Activity log is paged with 30, 60, 90 or 120 rows.
  - Plugin screens are drawn as finished designs, not left as placeholders.
  - Later, one more note: a transcoding session shows the user's progress in the regular colour, and the transcoding progress in yellow underneath it.
- **What it changed:** a second version of the mockup, 33 screens, and the build plan (O-58). Nothing in the app. The mockup's files are local; the first step of the build plan copies them into the repository.

### O-58. The admin panel's build plan is put on hold

- **Context:** The lead presented the build plan (`docs/spec/admin/build-plan.md`): eight waves, 35 planned agent runs, everything built and tested only on the throwaway test server, a go-live only on the owner's yes, a list of mockup items the server cannot do, and five questions for the owner with default answers.
- **What the owner decided (2026-11-24):** "Before the big project we will wait a bit".
- **What it changed:** the plan stays a document, the state is "on hold": research and plan are on `main`, the mockup is outside the repository, nothing is built. Nothing starts until the owner says so; then the plan's five questions are asked. O-56 stands as the direction.

### O-59. The lead only reviews: every task goes to an Opus, Sonnet or Haiku agent, and one agent per area is kept

- **Context:** The owner wanted the lead's own model spared for reviewing.
- **What the owner said (2026-11-24), in two steps:**
  - "from now on give only opus, sonnet, haiku tasks, you are only a reviewer". So the lead no longer does the work itself: each task goes to an agent on Claude Opus, Claude Sonnet or Claude Haiku with the model named, and the lead writes the briefs, reviews, and does the hand-offs (talking to the owner, commits, publishing, go-lives).
  - Later the same day, after asking whether new agents must learn the project again every time: an edit of a few lines where the lead already knows the exact place is made by the lead; one agent per area is kept alive and gets that area's next task as a follow-up (the owner's examples: an Opus agent for the player, a Sonnet agent for Settings); Haiku agents are for pinpoint tasks and are not kept.
- **What it changed:** T-87, and the rule of T-76 (an explicit model for every agent) is now stricter. The documents agent that wrote phase 40 is the first of the kept agents. The small edits the lead still makes itself are the fast path of T-63 (see T-87).

### O-60. A double click for fullscreen must not stop the video

- **Context:** In the player a mouse click on the picture plays or pauses, and a double click goes fullscreen.
- **What the owner reported (2026-11-24):** a fast double click for fullscreen stops the video. Each of the two clicks toggled play, so the video paused and resumed.
- **What it changed:** T-84. The owner's yes put it on the trial the same day (a rollback image is kept). The TV app has no mouse double click, so the row of [DEVIATIONS.md](DEVIATIONS.md) says "web only".

### O-61. After a key hid the controls, the mouse did not bring them back

- **Context:** The mouse cursor was resting over the picture during playback.
- **What the owner reported (2026-11-24):** moving the mouse did not bring the cursor and the controls back; only the Up arrow did.
- **What the lead found** (two Claude Sonnet agents, one finding the cause and one confirming it): a flag that says the pointer rests on the control strip stayed set when a key (Escape, Back) hid the controls, because the hidden strip can no longer report that the pointer left, and every later mouse move was ignored until a key showed the controls again. The flag now counts only while the controls are visible (one line in `PlayerView.tsx`), with an end-to-end test in `playback-layout.spec.ts` that fails without it.
- **What it changed:** commit `7b000ca`; on the trial the same day on the owner's yes. Not proven: that this was the owner's exact sequence. The owner's report is recorded as a bug report, like the earlier ones (O-49).

### O-62. The subtitles after a skip: about 0.05 seconds

- **Context:** After an arrow-key skip the subtitles were hidden for the skip indicator's 0.8 seconds (T-78 had only fixed their fly-in).
- **What the owner asked (2026-11-24),** in order: first for a number, how long after a skip the subtitles come back; the lead measured about 0.81 seconds for every kind of subtitle. Then: "I would like to be able to see the subtitles 0.05 seconds after the skip. there should be enough time for the previous to disappear. of course there shouldn't be problems with the subtitles and playback being synchronised".
- **What it changed:** T-85. The result is a median of 16 to 58 ms for the ways of playing the lead measured. The owner's yes put it on the trial the same day. The TV app never takes the subtitles away for a skip, so the 0.8 second rule was a web-only rule that is now gone.

### O-63. The Up and Down arrows change the volume

- **Context:** In the player the Up and Down arrows showed the controls, as on the TV, where the D-pad's Up shows them.
- **What the owner asked (2026-11-24):** "I want the audio go up and down when using the arrow up and down".
- **What it changed:** commit `93e5bf4` (the same commit as T-85). ArrowUp and ArrowDown change the volume by 5 percent when the keyboard focus is not inside the control strip, a sheet or a dialog; raising while muted unmutes; the existing volume pill shows the level. Since Up no longer shows the controls, Tab (new) or Enter show them. The shortcut sheet lists the change. Not like the TV, where Up shows the controls ([DEVIATIONS.md](DEVIATIONS.md)). On the trial the same day on the owner's yes.

### O-64. At the end of an episode the next button went back to an earlier episode

- **Context:** The queue plays the next episode when one ends (the Next Up panel, its countdown, or the next button of the controls).
- **What the owner reported (2026-11-24), with a picture:** the Next Up panel (by click or by its countdown) and the next button of the controls went back to the start of an episode already played, with a lot of loading; the picture showed the panel naming the episode that was still playing. The owner asked for an Opus agent to fix it.
- **What it changed:** T-86. A Claude Sonnet agent found the cause, a Claude Opus agent fixed it and a Claude Sonnet agent checked it; commit `e6dece7`; on the trial the same day on the owner's yes. The case in the picture, Next Up naming the playing episode, was not reproduced on the throwaway server and is covered by unit tests only.

### O-65. Changing episodes must reload only the picture

- **Context:** At the end of an episode, or by the next button, the player went on to the next episode. The owner compared it with Jellyfin's own web client.
- **What the owner asked (2026-11-24):** to research how the stock Jellyfin web client changes episodes, because this app "reloads the whole page". The wanted behaviour: "reload only the picture, the controls remain untouched and are only updated based on the content (for one example last episode the next is grayed out)".
- **What it changed:** T-88 (commit `5734cae`). It is on the trial since the owner's "Yes, go live" the same day, with a rollback image. Three points are deviations from the TV app that the owner was told about; the owner may reverse the Previous button's (DEVIATIONS section 9).

### O-66. A kept playback engineer on Claude Opus, as a project agent

- **Context:** For O-65 the owner asked for the research and the change to be made by an Opus agent, "created as an agent in this project that learns how playback works". This follows the rule of O-59 that one agent per area is kept.
- **What the owner decided (2026-11-24):** the agent is a project agent with a role of its own, on Claude Opus. A first try, an agent started inside the lead's chat, was stopped by the owner, who asked for a separate session; the engineer runs as its own session under the lead's chat.
- **What it changed:** T-89: `.claude/agents/playback.md` (the role) and `src/features/playback/AGENT-NOTES.md` (its notes).

### O-67. Where to announce the project, and asking the upstream author first

- **Context:** After O-55 ("Yes, publish first") the owner asked where the project may be announced.
- **What the lead reported (2026-11-24),** from a Claude Sonnet agent that read the rules it could reach (the points are in phase 41 of [PROJECT-LOG.md](PROJECT-LOG.md)): allowed with conditions are the Jellyfin forum's Client Development section, the awesome-jellyfin list (a pull request; the project must be at least four weeks old) and Hacker News "Show HN"; from search results only, r/selfhosted takes new projects only in its weekly new-project thread (which asks about AI involvement) and r/opensource bars projects made by AI; Jellyfin's chat rules count self-promotion as spam; Reddit's rule pages could not be read. Jellyfin's policy on large language models, which the upstream app has also adopted, asks that an AI-built project is marked as such and that posts are in the poster's own words, so the lead does not write the owner's announcement or the message to the upstream author. The lead only reviewed the owner's own draft for accuracy.
- **What the owner decided (2026-11-24):** to ask the upstream author about the name before announcing, through the Discussions of the upstream repository.
- **What it changed:** nothing in the code. The announcement waits for the answer. It extends O-55.

### O-68. The go for the fourth public release: "update the repo and its images"

- **Context:** The public repository held the third release; `main` was ahead of it by phases 40 and 41. The owner noticed that some of the README's pictures were older.
- **What the owner said (2026-11-24):** "update the repo and its images, some of them are older".
- **What it changed:** the privacy sweep, the new pictures and the fourth release the same day (T-90; phase 41 of [PROJECT-LOG.md](PROJECT-LOG.md)). The owner's go was given for this release; whether the owner wants to be asked before every later one is still not recorded.

### O-69. The README must be easy to understand and to set up

- **Context:** The root README opened with long status paragraphs of test counts and rounds before a visitor learned how to run the app. The owner was about to show the repository to the upstream author and to the Jellyfin community.
- **What the owner said (2026-11-24):** "make sure that the Readme is understandable and there is no unnecessary flare. it should be easy to understand and setup".
- **What it changed:** the README was rewritten in two rounds and read cold by an agent that saw only it (phase 41). The AI disclosure stays in its own plain section, as the Jellyfin community's policy asks. The old status history stays in [STATUS.md](STATUS.md) and the project log.

---

## Part 2: Technical decisions made by the lead

Each entry gives:

- **Context:** the situation that called for a decision.
- **Decision:** what was chosen.
- **Why:** the reasons.
- **Rejected:** the alternatives that were turned down.
- **Consequences:** what follows from it, including costs.
- **Code:** where it lives.
- **Status:** one of the labels defined at the top.

Where the sources do not record which alternatives were weighed, the "Rejected" line names the obvious alternative and is marked "(implied)".

T-27 to T-32 each came out of an incident on the development machine. What happened, in order and with the commits, is in [PROJECT-LOG.md](PROJECT-LOG.md) phase 15. T-33 to T-36 are the lead's decisions from the later phases (phases 13 to 17 of the log). T-37 to T-42 are the lead's decisions of 2026-11-17 and 2026-11-18: stage 2 of the final merge, the run in which the usage limit was reached, the TV-comparison pass and the way to landing. T-48 to T-51 are the lead's decisions at the landing of the polish round, the same day. T-52 to T-57 are the lead's later decisions of that day: the trial deployment, the touch fix after the owner's first test, and the clean-up.

T-58 to T-64 are the lead's decisions around the first public release and the maintenance rounds after it (2026-11-18 to 2026-11-24; phases 31 to 34 of the log): how the project is published, the direct-play work, the web player's layout, the Settings panel, and three working rules. T-65 to T-75 record the smaller technical choices of the same days that have a visible effect, one entry per change. T-76 is the lead's rule of 2026-11-24 about the model each agent runs on. T-77 is the new order of Settings of the same day, after the second release. T-78 to T-80 are the three small changes after it: the subtitle line after an arrow-key skip, the mouse on the episode strip and the language list in a solid box. T-81 and T-82 are the language box fitted to its names and the generated code map. T-83 is the privacy sweep and the checks before the third public release. T-84 to T-86 are three player changes of the same day (the click gate, the seek hold for subtitles and the queue rules that stop the next episode from restarting an earlier one), and T-87 is the working rule of the owner's, with its kept agents. T-88 to T-90 come from the end of the same day: the episode change that keeps the player in place, the playback engineer as a project agent, and the sweep, pictures and checks of the fourth public release. Part 3 ends with the touch fix, so these entries also hold the choices of the agents that built the work of 2026-11-18 and 2026-11-22; the lead kept those choices when it committed, and each entry says who built it where that is recorded. The work of 2026-11-23 and 2026-11-24 was the lead's own, on the fast path (T-63).

### T-1. Stack: Vite, React, TypeScript and a small set of libraries

- **Context:**
  - Upstream is about 475 Kotlin files (about 107,000 lines) using Jetpack Compose for TV.
  - Many agents would write the code in parallel.
- **Decision:**
  - **Core:** Vite with React and TypeScript in strict mode.
  - **Routing and data:** React Router (library mode), TanStack Query (server data caching) and TanStack Virtual (long lists), Zustand (small state stores), the official `@jellyfin/sdk`.
  - **Text and playback:** i18next for strings, hls.js for HLS streams, JASSUB for ASS subtitles.
  - **Styling:** CSS Modules.
  - **Testing:** Vitest for unit tests, Playwright for browser automation.
  - **Production server:** Hono, a small web framework.
- **Why:**
  - Agents are most reliable with React.
  - The React ecosystem covers every need (virtual lists, video, subtitles, i18n) without custom infrastructure.
- **Rejected:** No UI kit and no Tailwind or CSS-in-JS. Exact upstream values (sizes, colors, focus behavior) matter more than convenience, and a kit would impose its own look.
- **Consequences:**
  - Every shared component had to be written by hand (`src/ui/`, about 60 components).
  - Versions are recent: Vite 8, React 19, TypeScript 7, React Router 8. TypeScript's `erasableSyntaxOnly` setting forbids enums, so the code uses `as const` objects.
  - Adding a dependency needs a clear reason (CLAUDE.md).
- **Code:** `package.json`, `vite.config.ts`, CLAUDE.md "Stack".
- **Status:** Built.

### T-2. The lead writes the contracts

- **Context:** Many agents build on shared conventions. If those drift, their work does not fit together.
- **Decision:** The lead itself wrote:
  - the working agreement (`CLAUDE.md`): folder ownership, conventions, hard rules;
  - the design-token pipeline (`tools/gen-tokens.mjs`, `src/theme/`).
  
  Everything else was delegated.
- **Why:** These are the contract every agent builds on.
- **Consequences:**
  - Agents follow CLAUDE.md. Where an agent's work contradicts it, the agent reports the deviation; one case is open (Q-18).
  - The token generator was later extended by a fixer agent, which added the OLED drawer colors.
- **Code:** `CLAUDE.md`, `tools/gen-tokens.mjs`, `src/theme/tokens.css` (generated). Commits 8a2dc8f and 2e1e11d.
- **Status:** Built.

### T-3. Sizes: 1 CSS px = 1 Android dp, converted to rem and scaled

- **Context:**
  - Upstream sizes are in dp (density-independent pixels) on a 960×540 dp TV canvas.
  - The web app must scale from phones to ultrawide monitors.
- **Decision:**
  - CSS is written in `px`, with 1px meaning 1 Android dp. A PostCSS step (`postcss-pxtorem`) rewrites every `px` to `rem` at build time. (rem is a CSS unit relative to the page's root font size.)
  - The root font size carries the interface scale: 16px × automatic scale × user preference.
  - The automatic scale depends on window width:

    | Window width | Scale |
    |---|---|
    | under 1600 px | 1.0 |
    | 1600 px and wider | 1.25 |
    | 2400 px and wider | 1.5 |
    | 3200 px and wider | 1.75 |

  - The user preference `webInterfaceScale` runs from 50% to 200%.
  - A true hairline that must not scale is written `1PX`.
  - JavaScript that needs real pixels uses `dp()` / `useDp()`.
- **Why:**
  - Upstream's numbers stay readable in the code: `padding: 16px` means the 16dp from the Kotlin.
  - Everything scales together.
- **Rejected:** A fixed TV canvas scaled as a whole (the owner's choice, O-3). Hand-converting every value to rem (implied).
- **Consequences:**
  - Sizes on a 1920-wide desktop come out smaller than on the TV. The emulator renders upstream at 2 device pixels per dp (`docs/spec/01-design-system.md`; the reference shots are 1920x1080 for a 960x540 dp canvas), while the web at 1920 px wide uses 1.25 CSS px per dp.
  - Any size computed in JavaScript must go through `dp()`. A wave 2 reviewer caught one place that did not (the Home "more" grid's row-height estimate added a raw 52 instead of `dp(52)`), and a fixer corrected it.
- **Code:** `vite.config.ts` (pxtorem), `src/theme/scale.ts` (`autoScale`, `setUserScale`, `dp`, `useDp`), `src/app/applyPreferences.ts` (clamps the preference to 50–200).
- **Status:** Built; verified in a browser in wave 1 (the scale preference changes the root font size).

### T-4. Colors only through generated CSS variables; dark themes only

- **Context:**
  - Upstream has 8 color themes. Each defines Material color roles, plus light variants.
  - Several upstream colors depend on the theme (for example the OLED drawer colors).
- **Decision:**
  - `tools/gen-tokens.mjs` reads `docs/spec/design-tokens.json` and writes `src/theme/tokens.css`. That file holds one block of CSS variables per theme (`--c-primary`, `--c-surface`, `--c-border` and so on), selected by `<html data-theme="...">`.
  - Fixed colors are written `--fx-*`.
  - Components never contain a theme hex value.
  - Only the dark schemes are generated.
  - Elevated surface colors (`--c-surface-1`, `--c-surface-3`) are precomputed with the Material formula: the primary color at alpha (4.5·ln(e+1)+2)/100, laid over the surface color.
- **Why:**
  - Exact upstream colors.
  - Instant theme switching.
  - No drift between components.
  - Upstream's light schemes cannot be reached: every call site passes dark (`docs/spec/01-design-system.md` §1, "Light mode is NOT reachable").
- **Rejected (implied):** Hand-written theme CSS, and shipping light themes nobody can select in the original.
- **Consequences:**
  - The default theme (PURPLE) also applies to `:root` before preferences load.
  - When an agent needed new fixed colors (the OLED drawer), it had to extend the generator rather than write hex values.
- **Code:** `tools/gen-tokens.mjs` (`surfaceAt`), `src/theme/tokens.css`, `src/app/applyPreferences.ts` (sets `data-theme`).
- **Status:** Built; verified in a browser (theme switching; the OLED drawer colors were read back from computed styles in wave 2).

### T-5. The TV "focused" look applies to mouse hover and keyboard focus

- **Context:**
  - On TV, exactly one element is "focused" at a time, and it shows a scale-up, a border and color changes.
  - Browsers have mouse hover, keyboard focus and touch.
- **Decision:**
  - The focused look applies to `:hover` (only on devices with a real hover pointer, `@media (hover: hover)`) and to `:focus-visible` (keyboard focus).
  - Every interactive element is a real `<button>` or `<a>`, or has a role and `tabIndex`.
- **Why:**
  - Desktop users get the TV look from the mouse.
  - Keyboard users get it from Tab and the arrow keys.
  - Touch devices do not get "sticky" hover states.
- **Rejected (implied):** Focus-only styling, which would make mouse users see none of the TV look.
- **Consequences (cost):**
  - A keyboard-focused card and a mouse-hovered card could both show the focus ring at once. The UI kit agent listed this as unfinished, and the lead saw it in the app.
  - The wave 2 shell fixer solved it for the nav drawer only. It suppresses hover while a drawer item has keyboard focus, and a real mouse move hands focus to the hovered item.
  - Wave 3b and the fix pass solved it for the rest of the app with one rule: whichever input moved last owns the highlight (A-31).
- **Code:** `src/ui/cards/CardFrame.module.css` (`@media (hover: hover)` and `:focus-visible` rules), `src/app/shell/NavDrawer.module.css` (the drawer-only fix), `src/ui/lib/inputModality.ts` (the later rule).
- **Status:** Built and reviewed. The double highlight is fixed everywhere: stage 2 of the final merge brought the fix pass to `integration` and checked the remaining style files (A-31). (Corrected on 2026-11-18; this line used to say that the Home case still reproduced on `integration`.)

### T-6. Arrow-key spatial navigation for keyboards

- **Context:** The TV app is driven by a D-pad (up, down, left, right, select). Keyboard users on the web should be able to move the same way.
- **Decision:**
  - A global handler (`src/app/spatialNav.ts`) moves focus between elements marked `data-focusable`. It picks the nearest one in the pressed direction, with cross-axis distance weighted ×2 so focus stays in the same row or column.
  - Groups (`data-focus-group`) are searched first.
  - Traps (`data-focus-trap`, for dialogs) keep focus inside.
  - `data-focus-default` marks the starting element.
  - Arrow keys are never taken over while the user types in a field, or when a page handler already handled the key.
  - The global handler does not react to the mouse at all. Only the nav drawer hands keyboard focus to a hovered item (see T-5).
- **Why:** It keeps the TV interaction model for keyboards without every page writing its own key handling.
- **Rejected (implied):** Tab-only navigation. It works, but it is not how the TV app feels.
- **Consequences:**
  - Some screens need upstream's exact row behavior and add their own handler on top. Home remembers the column per row (A-10), and settings wrap from the last row to the first. The Live TV guide and the episode strip also handle arrows themselves (A-69, A-56).
  - The geometry has unit tests (`src/app/spatialNav.test.ts`).
  - Wave 3b changed two global rules: how Left and Right pick a target (A-33) and how the floating Back button is reached (A-34).
- **Code:** `src/app/spatialNav.ts`.
- **Status:** Built and reviewed; verified in a browser.

### T-7. A Back button and Escape replace the remote's Back key

- **Context:** The TV remote has a Back key. Browsers have their own Back button, but no in-page Back control. The owner asked for an explicit adjustment here (O-12).
- **Decision:**
  - A floating in-app Back button appears on every page except Home.
  - The Escape key (and `GoBack` / `XF86Back`, the Back keys of TV browsers) also acts as Back.
  - The browser's own Back button and gestures stay native history.
  - Back pops one history entry. On the first entry of a tab (a deep link) it goes to Home instead of leaving the site.
  - An open dialog or menu handles Escape itself first.
- **Why:** It gives every input method a way back that matches the TV app, without fighting the browser.
- **Consequences:**
  - Pages with content in the top corners must leave room for the floating button (`--shell-back-reserve`).
  - The player hides the button.
  - What Escape does on Home is an agent decision (A-5).
- **Changed on 2026-11-23:** the floating button no longer shows on every page except Home. It is absent on the pages the drawer leads to (T-69) and on Settings while the area beside the panel can be clicked (T-61). The keys are unchanged.
- **Code:** `src/app/shell/BackButton.tsx`, `src/app/shell/useBackKey.ts`, `src/app/shell/useGoBack.ts`.
- **Status:** Built and reviewed; verified in a browser.

### T-8. Long-press menus become right-click and a visible "more" button

- **Context:** On TV, a long press (or the Menu key) on a card opens a context menu. Mice have no long press, and touch has no hover.
- **Decision:**
  - Right-click opens the context menu.
  - A visible "more" (⋮) button exists for touch.
  - The keyboard Menu key and Shift+F10 also open it.
  - The details of which variant opens where are agent decisions (A-1).
- **Why:** Each input method gets its natural gesture for "more options".
- **Code:** `src/ui/cards/CardFrame.tsx`, `src/ui/overlays/ContextMenu.tsx`, `src/ui/lib/contextMenu.ts`.
- **Status:** Built and reviewed; verified in a browser (right-click, Menu key and touch "more" button on Home).

### T-9. Strings: upstream Android string names as keys, all 41 translations

- **Context:**
  - Upstream ships English plus 41 translations as Android `strings.xml` files.
  - Upstream ships right-to-left locales (Hebrew, Arabic).
- **Decision:**
  - `tools/gen-strings.ts` converts every upstream `strings.xml` into i18next JSON (`src/i18n/locales/<language>.json`).
    - Keys are the Android string names.
    - Positional arguments `%1$s`, `%2$d` become `{{p1}}`, `{{p2}}`.
    - Plurals become i18next plural keys driven by `count`.
    - Android folder names are mapped to standard language tags: `iw`→`he`, `in`→`id`, `pt-rBR`→`pt-BR`.
  - Strings upstream does not have go in `src/i18n/extra/en.json` under a `web_` prefix. There were 42 such keys when this entry was first written. The final merge notes counted 190 on branch `integration`; `src/i18n/extra/en.json` on `main` at `e1b7e04` has 183.
  - Right-to-left languages (ar, he, fa, ur, yi) set `<html dir="rtl">`, and CSS uses logical properties (`margin-inline-start` and so on) instead of left and right.
- **Why:**
  - All translations come for free on day one.
  - Any string in the code can be looked up in upstream by name.
- **Rejected (implied):** Rewriting keys into a new web scheme, which would lose the link to upstream and its translators.
- **Consequences:**
  - New `web_` strings exist in English only, so they stay English in every other language. Whether to translate them is open (Q-23).
  - Number formatting flags are dropped, so callers pass pre-formatted values.
  - A converter quirk lets a string-array overwrite a string with the same name (`background_style`). The settings agent worked around it.
- **Code:** `tools/gen-strings.ts`, `src/i18n/index.ts` (`RTL_LANGUAGES`), `src/i18n/locales/` (42 JSON files: English plus 41 translations), `src/i18n/extra/en.json`.
- **Status:** Built; verified in a browser (Hebrew sets `lang=he dir=rtl`; the shell mirrors in RTL).

### T-10. Call Jellyfin directly; reach Seerr through a same-origin proxy

- **Context:**
  - Jellyfin allows cross-origin requests from browsers. (A cross-origin request is one from a web page to a different address than the one that served it.)
  - Seerr does not: it sends no CORS headers (the headers that permit such requests), and it keeps the login in a session cookie.
- **Decision:**
  - The browser talks to Jellyfin directly, with its access token.
  - Seerr is reached only at `/seerr-proxy/...` on the app's own address:
    - in development, the Vite dev server forwards it;
    - in production, the small server does.
  - The deployment configures the Seerr address once. Users only sign in.
  - There is no open proxy: the production proxy forwards only to the configured Seerr, and only three path prefixes (`/api/v1/`, `/imageproxy/`, `/avatarproxy/`).
- **Why:**
  - It is the only way a browser can use Seerr's cookie session.
  - Proxying Jellyfin as well would add load and latency to video for no gain.
- **Rejected:**
  - A user-entered Seerr URL, as upstream has. The browser cannot reach an arbitrary Seerr anyway.
  - An open proxy.
- **Consequences:**
  - A deployment without the server, or without `SEERR_URL`, has no Discover.
  - Seerr's cookie is shared by every Jellyfin user of the same browser (see Q-6).
- **Code:** `vite.config.ts` (`/seerr-proxy` dev proxy). On branch integration: `server/seerrProxy.ts` (`ALLOWED_PREFIXES`) and `src/api/seerr/client.ts`.
- **Status:** Dev proxy built; production proxy on branch integration (unit-tested; run in a real container in wave 3a, where only Seerr's status and a sign-in as the limited test account through the proxy were exercised).

### T-11. Deployment: a static app plus a small server in one Docker image

- **Context:** The owner wants a separate address next to Jellyfin, behind the existing Caddy (O-8). Seerr needs a proxy (T-10).
- **Decision:** One Docker image that:
  - serves the built single-page app from `dist/`;
  - publishes runtime configuration at `/config.json`;
  - proxies Seerr.
  
  The server is written with Hono and bundled into one file, so the final image has no `node_modules`. It runs as a non-root user.
- **Why:**
  - It fits "a separate address behind Caddy".
  - The same image works for anyone.
  - Configuration is runtime environment variables, not a rebuild.
- **Rejected (implied):** Static hosting alone, which cannot proxy Seerr. The sources do not record other options being weighed.
- **Consequences:**
  - The app must be served at the root of a domain or port; a sub-path is not supported (the base path is fixed at build time).
  - A preset server shows its public user list to anyone who opens the app (see Q-15).
  - The image is 248 MB, almost all of it the `node:24-alpine` base.
- **Code:** on branch integration: `server/`, `Dockerfile`, `docker-compose.example.yml`, `docs/deploy.md`.
- **Status:** On branch integration. In wave 3a the image was built and run, and an independent reviewer attacked it; fixes were applied. The image was built and run again at the end of wave 4 and after the final merge, each time against the throwaway test server: the container served the app with its security headers, sign-in worked, and one H.264 item played under the content security policy with no violation reported. The stage 2 repair built it again (258 MB) and ran it the same way: security headers present, sign-in, and one H.264 item played for 7 seconds with no policy violation. Not verified: `npm ci` from a clean checkout (in the stage 2 build that step came from the build cache), and the container behind a reverse proxy (Q-1, O-21).

### T-12. Runtime configuration through /config.json

- **Context:** O-7 requires an optional preset server without rebuilding the app.
- **Decision:**
  - At startup the app fetches `/config.json`, with the shape `{ serverUrl?, serverName?, seerrProxyPath? }`.
  - An empty or missing file means normal multi-server mode.
  - The production server fills it from environment variables.
  - In development, the test server address is only offered as a prefilled value; it is not a preset.
- **Code:** `src/api/config.ts`, `public/config.json`, `ensurePresetServer()` in `src/api/session.ts`.
- **Status:** Built; verified in a browser (wave 2 setup, and the wave 3a container).

### T-13. Session model: several servers, several users, tokens in the browser

- **Context:** Upstream keeps a list of servers, saved users per server with their tokens, and a "most recent" pair to restore on start.
- **Decision:** Port that model faithfully into a Zustand store, persisted in `localStorage` under a versioned key (`wholphin.session.v1`).
  - The Jellyfin client identifies itself as "Wholphin Web", with a random device id kept per browser and a device name derived from the browser.
  - Explicit sign-out calls `POST /Sessions/Logout` to revoke the token. Upstream never does; this is one of the upstream bugs fixed (CLAUDE.md allows fixing obvious upstream bugs with a comment).
  - A 401 (rejected token) from any request drops that user's token and returns to the user list with an "expired" message.
  - Per-user PIN and "require login" flags are stored as upstream stores them.
- **Why:** It is upstream's behavior. It also lets several people share one browser, as on a shared TV.
- **Consequences:**
  - Access tokens and PINs live in the browser's `localStorage` in plain text, as upstream keeps them in app storage (see Q-16 for PINs).
  - "Leave user" behaves slightly differently from upstream (A-12).
- **Code:** `src/stores/session.ts`, `src/api/session.ts` (`CLIENT_NAME`, `getDeviceId`, `signOut`, `leaveUser`, `handleUnauthorized`).
- **Status:** Built and reviewed; verified in a browser (deep link to sign-in and back, reload keeps the session, sign-out sends Logout, rejected token handling).

### T-14. Route table: every upstream screen gets a URL

- **Context:** Upstream navigates with an in-memory back stack of "Destinations". The web needs URLs that survive reloads and can be shared.
- **Decision:**
  - Each upstream Destination maps to a path. Examples: `/item/:itemId`, `/series/:itemId?season=&episode=`, `/library/:itemId`, `/play/:itemId?t=`, `/discover`, `/settings/:screen`.
  - All routes are declared in one file, with the full table as a comment at its top.
  - Pages are loaded on demand from their feature folder.
  - Code builds paths only through typed helpers in `src/app/nav.ts`.
  - There are three layouts:
    - **setup**, which needs no session;
    - **shell**, with the drawer and backdrop;
    - **full screen**, for playback, settings and similar.
  - Development-only routes (`/dev/login`, `/dev/gallery`) are not part of production builds.
- **Why:** It keeps one place to look and one place to change. Feature agents can replace a page's contents without touching the router.
- **Consequences:**
  - Some state that upstream passes as objects goes into query strings or history state. Examples: `/grid` takes its state from history, and Discover person pages take `?name=` (on branch integration).
  - The `/license` path collided with the repository's `LICENSE` file in the Windows dev server. A dev-server plugin on branch integration fixes that (A-43).
- **Code:** `src/app/routes.tsx` (table at the top), `src/app/nav.ts`, `src/app/layouts.tsx`.
- **Status:** Built. On `main`, the routes for library browsing, detail pages, search and Home customization lead to real pages since wave 3b; the routes for playback, settings, Discover, Live TV, music and photos are still placeholders there. On `integration` every route leads to a real page, and the placeholder component is deleted (A-101).

### T-15. Preference scope: mostly per browser, a few per user

- **Context:**
  - Upstream keeps almost all settings per device, and a few on the user record.
  - The lead's original brief asked for preferences "persisted per user", and CLAUDE.md still says "Persisted per user in localStorage".
- **Decision (made by the plumbing agent, accepted by the lead):** Follow upstream (spec 06 §3.8).
  - Most preferences are one document per browser (`wholphin.prefs.app.v1`).
  - Only the interface language, preferred audio and subtitle language, subtitle mode and the search settings are stored per `serverId:userId` (`wholphin.prefs.user.v1.<server:user>`).
  - Only values that differ from the default are stored, so later default changes reach people who never touched a setting.
- **Why:** It matches how the TV app behaves on a shared device.
- **Rejected:** Everything per user. The agent noted this is a one-line change in the generator.
- **Consequences:**
  - Two users on the same browser share the theme, interface scale and playback settings.
  - CLAUDE.md is out of date on this point (Q-18).
  - Other per-user data uses its own per-user keys: home rows, drawer pins, remembered audio and subtitle choices.
- **Code:** `src/stores/preferences.ts`, `src/stores/preferences.gen.ts` (`PREFERENCE_SCOPE`), `tools/gen-preferences.ts`.
- **Status:** Built; verified in a browser (theme survives reload).

### T-16. Images requested in fixed size buckets

- **Context:** Jellyfin resizes images on request (`fillWidth` / `fillHeight`). A web layout produces many slightly different sizes, which would defeat the browser cache.
- **Decision:**
  - Image URLs are a faithful port of upstream's `ImageUrlService`.
  - The requested size is the layout size × `devicePixelRatio` (screen pixel density) × interface scale, rounded up to the next bucket: 64, 96, 128, 160, 200, 240, 280, 320, 400, 480, 560, 640, 800, 960, 1280, 1600, 1920, 2560 or 3840 device pixels.
- **Why:** Images stay sharp on high-density screens, and the same image is reused across layouts and window sizes.
- **Consequences:** Some images are up to one bucket larger than needed.
- **Code:** `src/api/images.ts` (`IMAGE_BUCKETS`, `bucketPx`, `useItemImageUrl`), with unit tests in `src/api/images.test.ts`.
- **Status:** Built.

### T-17. Server data through TanStack Query with user-scoped keys

- **Context:** Many screens read the same Jellyfin data, and several users can share a browser.
- **Decision:**
  - All server reads go through query hooks.
  - Every cache key starts with `[serverId, userId]` (`qk()`), so one user's cached data never shows for another.
  - Changes refresh only the narrowest keys affected.
- **Code:** `src/api/queryKeys.ts`, `src/api/queryClient.ts`, CLAUDE.md "Data".
- **Status:** Built and reviewed. In wave 2 a reviewer found that clicking Home on Home refetched everything, and that was fixed.

### T-18. Extract specs from the Kotlin, then audit them

- **Context:** Agents cannot each read 107,000 lines of Kotlin.
- **Decision:**
  1. Six research agents wrote behavior specs into `docs/spec/`. Five ran on the mid tier; the playback one ran on the top tier.
  2. Because these first-pass specs contained approximate citations and values recalled from memory, a 35-agent audit workflow re-checked every claim against the Kotlin. It applied corrections and wrote `docs/spec/08-coverage-gaps.md`, a list of behaviors no spec covered.
  3. A separate research agent read the androidx `tv-material` library for its default values (card shape, focus scale, type scale).
- **Why:** Specs make agent briefs short. The audit makes them trustworthy.
- **Consequences:**
  - CLAUDE.md ranks the Kotlin above the specs when they disagree.
  - The library check corrected the spec. Card corners are 8dp, not the 12dp the spec guessed, and several letter-spacing values were wrong.
  - Those values come from the library's main branch, because no tag for the exact version upstream uses exists (`src/ui/LIB_DEFAULTS.md`).
- **Code:** `docs/spec/`, `src/ui/LIB_DEFAULTS.md`.
- **Status:** Done.

### T-19. Use a second worktree for parallel waves

- **Context:** Wave 2 (shell, setup, home) and wave 3a (playback, settings, Seerr, server) had to run at the same time.
- **Decision:**
  - Wave 3a runs in a separate git worktree (`.worktrees/w3`, branch `wave3a`).
  - Its agents were told not to read source from the main tree or write to it.
  - The two are merged later.
- **Why:** The two groups cannot overwrite each other's files.
- **Rejected (implied):** Running both waves in one tree. Wave 1 did that with strict folder ownership; waves 2 and 3a both touch shared files such as `src/i18n/extra/en.json`.
- **Consequences (costs):**
  - **Watching:** the dev server's file-watch rule ignored `**/.worktrees/**`. That rule also matches every file when Vite runs from inside the worktree, so wave 3a and wave 4 agents had no live reload and restarted their dev servers after edits. The rule was narrowed at the end of wave 4 (A-49). The narrowed rule was on branch integration and is on `main` since 2026-11-18.
  - **Wrong tree:** the four wave 2 fixers (and some wave 2 reviewers) started in the worktree. They noticed that the wave 2 code existed only in the main tree and worked there, as their task said.
  - **Merge conflicts:**
    - Both waves edited `src/i18n/extra/en.json`.
    - Both waves built a store for nav drawer pins: `wholphin.navPins.v1.` in `src/app/shell/navPins.ts` (main), and `wholphin.navDrawerPins.v1.` in `src/features/settings/navDrawerPins.ts` (wave3a). They became one when `main` was merged into `wave3a` before wave 4 (A-42).
- **Code:** `.worktrees/` (git-ignored), workflow script for wave 3a.
- **Status:** Done for wave 2 and wave 3a: `main` was merged into `wave3a` in commit `fc2b12e`. The same approach was then used for more lines of work (T-34).

### T-20. Model tiering

- **Context:** Agents can run on different model tiers, which differ in cost and judgment.
- **Decision:**

  | Tier | Used for |
  |---|---|
  | Top | Anything that defines a contract or needs judgment: core plumbing, UI kit, playback, settings, Seerr, the shell, setup and home builders, most fixers, the playback, Seerr and shell fidelity reviews, the deploy security review, integration. |
  | Mid | Extraction (five of six spec agents, the audit's checkers), tooling (crawler, test server, emulator shots), the production server build and its fixer, the crawler fixer, and some reviewers (web quality, crawler, the settings fidelity review, the Seerr code and security review, the real-codec playback matrix). |
  | The lead | Architecture, contracts (T-2), orchestration and acceptance. |

- **Why:** Spend the strongest model where a mistake spreads to other agents' work.
- **Later change:** after the usage limit was reached on 2026-11-18, checkers, fixers, auditors and verifiers were moved to a different model from the integrators (T-37). In the final check and repair the checkers, the area fixers and the audit ran on Opus, and the shared-code fixer and the integrator on Fable; in the backdrop colour job the fixer ran on Fable and the verifier on Opus (as the workflow results record them; T-44, T-45). The lead's account calls this a model tier matched to each task (O-24); no further rule is recorded.
- **Code:** model choices are recorded per agent in `.agent-logs/index.md` and in each workflow script.
- **Status:** In use.

### T-21. Build, independent review, fix

- **Context:** A builder's report is a claim, not proof.
- **Decision:** Each workflow runs:
  1. builders, with separate file ownership;
  2. independent reviewers, each looking through one lens: fidelity to upstream, web quality, code, tooling, security, or the real playback matrix. Each finding must be observed, with steps to reproduce, and graded blocker, major or minor;
  3. one fixer per track, which applies, rejects (with a reason) or defers (to the lead) each finding;
  4. an integration or gate step.
- **Why:** Reviewers who did not write the code catch what builders miss. In wave 2 the findings included OLED drawer colors, a double focus highlight in the drawer, Home sending the access token to other hosts through custom row URLs, and a redirect check that accepted `/\host`.
- **Consequences:**
  - Rejections and deferrals are recorded, so each decision is visible. The deferred ones are listed in Part 4.
  - The process costs many agent runs: 15 in wave 2, 18 in wave 3a, 16 in wave 3b and 13 in wave 4.
  - The final merge added a variant of the same idea: a dedicated integrator, then independent checkers, then a repair agent (T-34).
- **Code:** `.agent-logs/workflows/*/script.js` (orchestration), `.agent-logs/workflows/*/agents.md` (results).
- **Status:** In use.

### T-22. Fix obvious upstream bugs, with a comment

- **Context:** The audit and the builders found real bugs in upstream.
- **Decision:** Port behavior faithfully, but fix an obvious upstream bug and leave a one-line comment naming the upstream file (CLAUDE.md).
- **Examples:**
  - sign-out now revokes the token;
  - home display preferences are read from the same id they are written to;
  - a movie's audio/subtitle choice no longer applies to every movie in its folder (wave3a);
  - Seerr Cancel now deletes your own request, not the first request on the title (wave3a).
- **Consequences:** These differences are listed in [DEVIATIONS.md](DEVIATIONS.md).
- **Status:** In use.

### T-23. Safety rules for the live servers

- **Context:** The real Jellyfin and Seerr used during development are used by other people.
- **Decision:** Hard rules in CLAUDE.md and every brief:
  - **Real servers:**
    - read-only use, with the test account only;
    - never change server settings, delete or edit media, or mass-mark items as played;
    - never sign in as anyone else.
  - **Seerr test requests:** at most a minimal number, with obscure titles, withdrawn at once and listed in the report.
  - **Destructive tests:** on the throwaway test server only.
  - **Other systems:** never touch Caddy, Docker containers the agent did not start, or anything outside the repository.
- **Why:** A mistake would affect other people, not just the project.
- **Consequences:**
  - Some things cannot be tested on the real server. Examples: delete flows, "remove from Next Up", and 4K Seerr requests, which were tested with mocked responses.
  - Agents report side effects. The playback engine agent reset the resume points and play counts it caused on 8 items. The setup agent reported the sessions it created.
  - The Seerr builder in wave 3a made two real requests, each deleted at once. Later runs mocked every request (T-36).
  - One accidental write happened on the real server in wave 3b. It led to a stricter rule (T-31).
  - Further hard rules came out of incidents on the development machine: no sound (T-27), no windows (T-28), low load (T-29) and never fill the disk (T-30).
- **Status:** In force.

### T-24. Reference screenshots signed in through Quick Connect on the throwaway test server

- **Context:**
  - The emulator runs the official third-party Wholphin app.
  - Typing an account password into it would put a credential into an app outside the project's control.
  - The real server could not be used for Quick Connect. (Quick Connect is Jellyfin's way to sign in a device by entering a short code from an already signed-in session.)
- **Decision:**
  - The emulator connects only to the throwaway test server.
  - It signs in with Quick Connect: the capture script reads the code from a screenshot and approves it through the Jellyfin API as the test user.
  - The lead never types an account password into the app.
- **Consequences:**
  - The reference shots show the throwaway test server's synthetic library, not the real one.
  - The emulator tooling agent's final report was cut off ("Let me look at the detail shots."), so its own summary of coverage is not recorded. Later agents used the shots in `refshots/out/` and the crawler's comparison table.
  - Three more scenes (Live TV, skip intro and image subtitles) were captured later in the same way (A-47).
- **Code:** `tools/refshots/` (`emulator.mjs`, `capture.mjs`, `scenes.mjs`).
- **Status:** Built; reference shots exist and are used.

### T-25. Repository hygiene for a future public repository

- **Decision:**
  - Credentials live only in `.env.local`, which is ignored (`.env.*` and `*.local` in `.gitignore`). Agents never print them.
  - The dev-only sign-in helper reads them on the dev server side, so the password never reaches the browser bundle.
  - Commits use a GitHub no-reply identity.
  - The repository name was left unchanged; only its description was edited.
  - Raw agent logs are git-ignored.
- **Code:** `.gitignore`, `tools/vite-dev-session.ts`.
- **Status:** In force.

### T-26. A toolkit supplied by the owner was assessed and not used

- **Context:** The owner supplied a binary reverse-engineering toolkit as a possible aid.
- **Decision:** Not used.
- **Why:** Wholphin is fully open source, so the source code answers every question directly.
- **Status:** Closed.

### T-27. Test browsers never make sound

- **Context:**
  - During playback testing the test audio was audible (O-15).
  - The cause: Playwright, the browser automation tool, mutes only headless browsers (browsers without a visible window). Agents had been told to prefer headed mode, a visible window, so that hardware video decoding could be tested.
- **Decision:**
  - `tools/quiet-playwright.mjs` patches the installed Playwright so that every Chromium, Edge or Chrome it launches gets the `--mute-audio` switch. It runs automatically after every `npm install` (the npm "postinstall" step).
  - A hard rule in CLAUDE.md: every `launch()` call still writes `headless: true` and `--mute-audio` itself, Firefox launches also set its volume preference to zero, and nobody changes the system volume.
  - Audio is asserted with code (decoded bytes, a Web Audio analyser), never by listening.
- **Why:** The PC is in use while agents work. A written rule can be forgotten by one agent; a patch applies to all of them.
- **Rejected (implied):** Relying on the briefs alone.
- **Consequences:**
  - Decoding and Web Audio analysis still work when a browser is muted, so audio checks are unaffected (comment in the script).
  - The patch edits a file inside `node_modules`, so it has to be applied again after every install. The postinstall step does that, and the production `Dockerfile` copies the script before it installs packages.
- **Code:** `tools/quiet-playwright.mjs`, the `postinstall` script in `package.json`, CLAUDE.md "Hard rules". Commit `11aac42`.
- **Status:** In force.

### T-28. Test browsers never open a window

- **Context:** Test browser windows kept appearing on the desktop of a machine in use (O-16).
- **Decision:**
  - The same patch forces every Playwright launch (Chromium, Firefox, WebKit) to be headless, whatever a script asks for.
  - The environment variable `WW_ALLOW_HEADED` exists for a manual debugging session by a person. Agents may not set it.
  - The Android emulator is only started with its no-window and no-audio options.
  - Anything that only works in a visible window is recorded as "not testable headless" instead of opening one.
- **Why:** Windows that appear and take keyboard focus interrupt whoever is using the machine.
- **Rejected:** Headed mode for hardware decoding, which was the earlier instruction to agents and was withdrawn.
- **Consequences:**
  - Headless Edge still reports H.264 and HEVC support (the lead's note), so tests that need real codecs use the installed Edge or Chrome in headless mode.
  - In the agents' runs H.264 played directly in headless Edge, while an HEVC file played as a server transcode; the wave 3a gate report says headless Edge has no HEVC decoder. Hardware HEVC direct play is therefore recorded as not testable headless (wave 3a gate report, final merge notes). The lead's note and the gate report have not been reconciled by a test.
- **Code:** `tools/quiet-playwright.mjs`, CLAUDE.md "Hard rules". Commit `98c1e0b`.
- **Status:** In force.

### T-29. Keep the load on the development machine low

- **Context:** The machine became slow under parallel load (O-17): the throwaway Jellyfin container was busy, seven agents were running, and the Android emulator was up.
- **Decision:**
  - The throwaway test server's container is capped at 3 CPUs. The cap is written into its compose file, so a recreated container keeps it.
  - `tools/low-priority.ps1` runs in the background and, every 20 seconds, lowers the scheduling priority of processes started by the project's tooling (dev servers, the type checker, the test runner, headless test browsers, the emulator) to below normal. It never touches other programs.
  - A hard rule in CLAUDE.md: one dev server and one browser per agent, each closed as soon as it is no longer needed; one video at a time; media tests of seconds, not minutes; codec-heavy work on the throwaway server; no full crawler run, Docker build or whole test suite more often than a task needs.
  - The emulator is stopped whenever it is not capturing.
- **Why:** The machine stays in use while agents work.
- **Later change:** The owner said the load was fine and allowed more parallel work again (O-18). After that, up to four workflows ran at once, with these guards still on.
- **Consequences:**
  - Parallel runs on one machine needed their own ports and their own test sessions (A-89).
  - The emulator agent declined to start a second emulator in parallel, because it would cost another 2 GB of memory (A-47).
- **Code:** `dev/testserver/docker-compose.yml` (`cpus: 3`), `tools/low-priority.ps1`, CLAUDE.md "Hard rules". Commits `92c3856` and `900417f`.
- **Status:** In force.

### T-30. Never fill the disk: no real Live TV recordings

- **Context:**
  - A test-data step scheduled real Live TV recordings on the throwaway test server, so that the crawler's recording scenes would have data (the item deferred earlier as Q-13). A wave 3b builder reports that its re-provisioning of the server added two Live TV timers, one of which recorded the programme that was on air.
  - The test server's "live" channels are local files that are served as fast as a recorder can read them, so a recording never stays small. A single timer grew without limit, and the disk filled up completely, twice.
- **Decision:**
  - The lead deleted the recordings and cancelled the timer.
  - The step that seeds recordings is disabled in `tools/testserver/setup.mjs`, with a comment that explains why. The script's `verify` mode now checks that no recording timer exists.
  - A hard rule in CLAUDE.md, "Never fill the disk": no Live TV recordings or recording timers on any server, no long-running transcodes left behind, no downloads of large media. Anything generated stays small and inside git-ignored project folders. If a step could write more than about 1 GB, the agent stops and reports instead.
  - Live TV record actions are tested against mocked responses only.
- **Why:** A full disk stops the machine and every server on it from working.
- **Rejected:** Keeping real recordings for screenshots. The comment in the script names a safe alternative that was not built: put a pre-made file of a few seconds into a recordings folder. **Update:** built on 2026-11-18 in commit `3b1dd7b` (three copies of a 3.5 MB clip in Jellyfin's default recording folder; still no timer and no recording).
- **Consequences:**
  - Scheduling, cancelling and deleting a recording have never been run against a real server. Wave 4 checked the requests the app sends against mocks (A-71).
  - Every crawler scene and every test that could touch recordings installs the mock first.
  - Not settled: two reports written after the clean-up still found recorded items on the throwaway test server (11 items in its Recordings library by one count, one folder with 7 items by the other). Both agents say the items were there before their work, and both confirmed that no timer existed. Neither gives sizes, so whether these are small remains of the incident has not been checked. Checked by the lead after the final merge stage 1: the Live TV recordings folder of the throwaway server is empty on disk (a few kilobytes), so nothing is being recorded or written; any recorded items the server still lists are library entries, not growing files.
- **Code:** `tools/testserver/setup.mjs` (`ensureRecordings`, disabled), `tools/testserver/README.md`, CLAUDE.md "Hard rules". Commit `2f68c33`.
- **Status:** In force.

### T-31. No keys or clicks that write on the real server

- **Context:**
  - During the wave 3b integration, a scripted keyboard test on the real server changed a watched mark and a favourite of the limited test account by mistake.
- **Decision:**
  - Both were reverted and checked.
  - Later briefs say: never send keys or clicks to anything that writes on the real server.
- **Why:** T-23 already limited the real server to read-only use. This incident showed that a scripted key press can write without anyone intending it.
- **Consequences:**
  - Later runs on the real server either block or mock every request that is not a read or a playback report, or log every such request to prove that none was sent (the fix pass and the final merge checks report this).
  - Flows that write (delete, mark played, playlists, favorites) are exercised on the throwaway test server, where the tests restore the data afterwards, or against mocks (A-90).
- **Status:** In force.

### T-32. Replace the GPL-3.0 polyfill with our own stand-in

- **Context:** JASSUB, the subtitle renderer, depends on a small package called `rvfc-polyfill`. Its license is GPL-3.0, which cannot be combined with this project's GPL-2.0-only license (O-1). The settings agent raised this in wave 3a, and it was open as Q-4.
- **Decision:**
  - The project carries its own small implementation in `vendor/rvfc-polyfill`, licensed GPL-2.0-only and written from the public specification of the browser feature. It only adds `requestVideoFrameCallback` and `cancelVideoFrameCallback` where a browser lacks them.
  - npm's `overrides` setting makes every package that asks for `rvfc-polyfill`, JASSUB included, get this one.
  - `npm run gen` now also generates the list of third-party licenses that the License page in Settings shows (`gen:licenses`).
- **Why:** It removes the incompatible license without giving up ASS subtitles (O-6).
- **Rejected:** Q-4 named two options, replacing the polyfill or removing it. The sources do not record why replacing was chosen.
- **Consequences:**
  - After a merge or an install, `npm ls rvfc-polyfill` must point at `vendor/rvfc-polyfill`. The merge notes describe an npm quirk that can write a wrong lockfile entry, and how to repair it.
  - The `Dockerfile` copies `vendor/` before it installs packages.
  - A checker of the final merge scanned the installed packages and the built app and found no GPL-3.0 or AGPL package.
  - A different license question, three Apache-2.0 components inside a GPL-2.0-only project (Q-22), was settled by the owner on 2026-11-18 with an additional permission (O-19).
  - Not verified: `npm ci` from a clean checkout.
- **Code:** on branch integration: `vendor/rvfc-polyfill/`, `package.json` (`overrides`), `tools/gen-licenses.ts`. Commit `3a01bf4`.
- **Status:** On branch integration.

### T-33. Supported browsers, and a notice for older ones

- **Context:**
  - A compatibility reviewer found that the production build declared support for older browsers than the CSS works on. The build used the build tool's default target (Chrome 111, Firefox 114, Safari 16.4), while the styles rely on newer CSS features.
  - The main one is relative color syntax, which derives a color from another color, for example the same color at 50% opacity. The design-token approach (T-4) uses it throughout, together with `color-mix()`. On an older browser those declarations are dropped: buttons and fields lose their backgrounds and dialogs lose their dimmed background.
- **Decision:**
  - Supported browsers are Chrome and Edge 119 or newer, Firefox 128 or newer, and Safari 16.4 or newer (including iOS and iPadOS 16.4).
  - The build targets exactly those versions.
  - An older browser gets a full-screen notice that it is too old, instead of a broken page (A-94).
  - The end-to-end suite's default run includes smoke tests in Firefox, in WebKit (the engine of Safari) and in an iPhone-sized WebKit profile (A-93).
- **Why:** Relative color syntax and `color-mix()` need those versions, and current browsers all have them.
- **Rejected:** The reviewer also described how to support much older browsers: generate a second set of tokens that hold the red, green and blue channels of every color, and rewrite about 45 style declarations to use them. The lead chose to declare the real minimum instead.
- **Consequences:**
  - Older iPhones that cannot go beyond iOS 15 or early iOS 16, and older long-term-support Firefox versions, get the notice.
  - The notice text is fixed English, because translations are not loaded at that point.
  - The feature test in `index.html` and the target list in `vite.config.ts` must be kept in step.
  - The default end-to-end run takes about 3.2 minutes instead of about 1.3 (as reported by the fix pass).
  - Not verified: real Safari on macOS or iOS, and the oldest supported versions. No such browser exists on the machine. The checks used Playwright's current Chromium, Firefox and WebKit builds on Windows.
- **Code:** `vite.config.ts` (`BROWSER_TARGETS`), `index.html`, `src/app/startup.ts`, `playwright.config.ts`, `e2e/specs/engines.spec.ts`. Commit `3ab4a60`.
- **Status:** Built; verified in a browser (three engines, headless, on the throwaway test server).

### T-34. Parallel lines of work, then an integrator, independent checkers and a repair

- **Context:** After waves 2 and 3a, several pieces of work could run at the same time: wave 3b, wave 4, the end-to-end suite and the fix pass. The owner had allowed more parallel work (O-18).
- **Decision:**
  - Each line of work gets its own branch in its own worktree:
    - `wave3a` for playback, settings, Seerr and the production server, and then for wave 4, which builds on them;
    - `e2e` for the end-to-end suite and the CI files;
    - `integration` for the final merge;
    - `main` for wave 3b and the fix pass.
  - A branch writes a hand-over note for whoever merges it (`docs/wave3a-merge-notes.md` on branch integration).
  - A merge is done by a dedicated integrator agent, which also wires the two sides together and records every conflict (`docs/final-merge-notes.md` on branch integration).
  - The merged app is then examined by independent checkers that did not take part in the merge. In stage 1 of the final merge there were two: one walked user journeys in a browser, the other read the code where the two sides meet.
  - A repair agent then confirms or rejects each finding, fixes the confirmed ones and re-checks them.
- **Why:** It extends T-19 and T-21. A merge is where the assumptions of two groups meet, so it gets its own review.
- **Rejected (implied):** Building everything in sequence on one branch.
- **Consequences:**
  - Each side built stand-ins for what the other side owned, and some things were built twice. The merges had to settle them: two stores for drawer pins (A-42), two ways to keep arrow keys off the Back button (A-34), two theme-music players (A-44), three stores for the remembered tab (A-40) and a stand-in grid for recordings (A-73).
  - Stage 1 of the final merge produced 24 findings from the two checkers. The repair notes list 19 fixes, 5 rejections and 2 deferrals. Some findings were split into parts, so these add up to more than 24. See A-104 and A-105.
  - The fix pass ran on `main` while stage 1 ran on `integration`, so a second merge was needed. Stage 2 merged it with 17 conflicting files and applied the fix pass's rules to the newer features (A-107). Three independent checkers (one reading the code where the two sides meet, one testing the other browser engines, one walking user journeys) returned 31 findings, 4 of them major. The stage 2 repair fixed 29 (one of them only in part), rejected one and kept one as a recorded difference (A-108, A-109). An independent audit followed before landing (T-38).
- **Code:** `.worktrees/` (git-ignored); on branch integration `docs/wave3a-merge-notes.md` and `docs/final-merge-notes.md`. Merge commits `fc2b12e`, `ebcd26c`, `c31a214`.
- **Status:** In use.

### T-35. The npm audit findings are not forced

- **Context:** `npm audit` reports six findings of high severity. All six come from one advisory about `picomatch`, a file-pattern library, which can be made very slow by a crafted pattern. The project only gets it through development tools (the build tool, the test runner and their helpers). No fixed release of `picomatch` exists yet.
- **Decision:** Leave the dependencies as they are, and check again when a fixed release appears.
- **Why:**
  - `npm audit fix` changes nothing.
  - The only fix npm offers is `--force`, which would move the build tool and the test runner back by one or two major versions.
  - The patterns these tools handle come from the project's own configuration, not from users.
- **Rejected:** Forcing the downgrade.
- **Consequences:** The findings stay visible in `npm audit` until then (Q-27).
- **Status:** Open for re-checking.

### T-36. Seerr test requests are allowed, but mocked in practice

- **Context:** The owner allowed test requests in Seerr with the limited test account, which cannot trigger a download (O-9, O-13). The Seerr builder in wave 3a made two real requests and withdrew both.
- **Decision:** Since wave 3a, every test of the request flow answers the request itself. In wave 4 and in stage 1 of the final merge, no request reached Seerr (as their reports state).
- **How:**
  - The crawler's Discover scenes run only against the real server, because Seerr is tied to that server's library and its images fail to load on the throwaway server. They sign in to Seerr through the dev proxy as the limited test account and answer every Seerr write locally.
  - The request scenes use obscure titles that are not in the library, so the Request button is offered.
- **Why:** A mock is enough to check what the app sends and shows, and it leaves nothing behind on a server that other people use.
- **Consequences:**
  - The real submit path against the real Seerr was last exercised in wave 3a.
  - A checker of the final merge observed that for this account the request is submitted at once, with no dialog. The checker judged that this matches upstream, which submits at once when the account has no choices to make. The request itself was mocked.
  - The same held in stage 2, its repair, the audit and the focus fixes: the real servers were used only by the end-to-end Discover test, which signs in with the limited account, reads, and answers every Seerr write itself. The TV-comparison pass did not use the real servers at all (T-40).
- **Status:** In force.

### T-37. After the usage limit: resume from cached results, and a different model for checking

- **Context:**
  - On 2026-11-17 to 2026-11-18 several workflows ran unattended (O-24), and the usage limit was reached.
  - The stage 2 repair agent was cut off after three commits (`4b69c7b`, `6c0ace2`, `845a917`). It wrote no notes, and none of its gates was confirmed.
  - In the TV-comparison pass (T-40), the eleven area agents and the shared-kit agent had finished, but all eleven checkers and the integrator failed to start or to finish.
  - Nothing was lost: the commits and the finished results were kept. The owner reset the limit later.
- **Decision:**
  - Resume the comparison workflow instead of starting it again. The resumed run reused the finished results it had cached, ran two area agents (Live TV, music and photos) and the shared-kit step again, and then ran the checkers, the fixers and the integrator. The shared-kit agent found its earlier run's edits in the tree, re-checked them and reverted none.
  - Start a separate job to finish the repair: a new agent confirms what the cut-off agent committed, fixes the rest, runs every gate, and an independent auditor checks the result (T-38).
  - To spare the limit, move checkers, fixers, auditors and verifiers to a different model from the integrators. In the workflow scripts that followed, the checkers, fixers, the auditor and the verifier name the model `opus`; the area agents, the integrators, the repair agent and the fixer of the focus race run on the session's default model.
  - The lead stopped about a dozen dev servers that the cut-off agents had left running.
- **Why:** The finished work was intact, so repeating it would only cost time and more of the limit.
- **Rejected (implied):** Restarting both workflows from the beginning.
- **Consequences:**
  - The second repair pass checked each of the first pass's commits against the findings before relying on it (`docs/final-merge-notes.md` section 9).
  - Some commits of the repair do not build on their own: `c4f0065` to `8ea55f4` need `041fdbf` to typecheck. That only matters for searching the history commit by commit.
- **Code:** the workflows "tv-parity-pass" and "final-merge-stage2-finish" in the agent log archive (`.agent-logs/index.md`).
- **Status:** Done.

### T-38. An independent audit before landing

- **Context:** A repair agent's report is a claim, like a builder's (T-21). This repair had been done in two passes, the first one cut off (T-37).
- **Decision:**
  - Before landing, a separate agent that took no part in the repair re-checks the repair's claims in a browser and runs the gates itself, without changing anything.
  - The same was done for the later focus fixes: a fixer, then an independent verifier with repeat runs and a review of the diff.
  - The lead then runs the gates and the full end-to-end suite once more himself before landing.
- **Why:** The last step before `main` should not rest on the word of the agent that did the work.
- **Consequences:**
  - **The audit's verdict:** "ready to land, with one condition". Its only failing gate was the Live TV test in three engines, because the test server's guide had run out during its run, which is the test environment and not the code. The guide had to be renewed first (T-39). It re-checked the four major findings and the lead's fixes a, d and e in a browser, and every claim it checked held.
  - **The audit's smaller points:** some document lines still named old places (corrected in commit `6674717`); the deploy guide's trial section pointed a reverse proxy in a container at a port that only listens on the host's loopback address (corrected in the same commit); the repair commits that do not typecheck on their own (T-37); and the throwaway server had collected about 950 sign-in sessions from test runs, which is harmless there.
  - **The lead's own run:** 188 of 189 end-to-end tests passed. The one failure was a timing race in a keyboard test, fixed in the test (commit `62fe020`, A-118). Repeating the drawer tests under load then showed a second race that was a real small defect (A-119 to A-121).
  - **The verifier's verdict on the focus fixes:** "ready to land". Its full run had one failure in 191 tests (a WebKit filter test that counted 3 cards instead of 4). Its reading: the shared test account's favorites changed between two requests, probably through another suite run at the same time; the test passed 4 of 4 times when run alone. Not proven.
  - `main` was fast-forwarded to `integration` (commit `c14b168`) on 2026-11-18.
- **Code:** the workflows "final-merge-stage2-finish" (phase "Audit") and "arrival-focus-race" (phase "Verify") in the agent log archive.
- **Status:** Done.

### T-39. The test server's Live TV guide covers eight days and renews itself

- **Context:** The throwaway test server's Live TV guide is a file of dated programs. It covered 24 hours from the moment it was written, and nothing renewed it. The audit's end-to-end run fell after its end, so every guide cell showed "No data" and the Live TV test failed in three engines. The server check (`npm run ts:verify`) did not notice. The audit suggested three ways out: renew the guide or roll it forward, make the check fail, or let the test skip with a reason.
- **Decision (commit `6674717`):**
  - The guide is written by `tools/testserver/guide.mjs` for eight days, starting six hours before "now". Jellyfin loads at most its configured number of guide days (7 by default); one more day keeps the last loaded day full.
  - `npm run ts:guide` copies a new guide into the container and runs Jellyfin's "Refresh Guide".
  - Provisioning calls it, and so does the end-to-end global setup (the step that runs before the tests) whenever the guide no longer reaches three hours ahead. If it still cannot reach that far, the setup stops with a message.
  - `npm run ts:verify` now checks that the guide reaches the next 24 hours.
- **Why:** The Live TV test then tests the app, not the date.
- **Rejected:** Letting the test skip when the guide is stale, the audit's third option (implied: the commit does not say why).
- **Consequences:** The end-to-end setup may write a new guide file on the throwaway server: a small text file, not a recording (T-30). The next full run passed 191 of 191 (`docs/final-merge-notes.md` section 10.7).
- **Code:** `tools/testserver/guide.mjs`, `tools/testserver/setup.mjs` (`guide`), `e2e/global-setup.ts` (`guideReaches`), `package.json` (`ts:guide`).
- **Status:** Built.

### T-40. The TV-comparison pass: eleven areas, one shared-kit agent, then checkers, fixers and an integrator

- **Context:** The reference pictures of the Android TV app (O-10) had been used screen by screen, but nobody had compared every screen with them. The owner's bar is the TV look (O-3). The pictures were taken on the throwaway test server with its data.
- **Decision:**
  - A pass on its own branch, `parity`, in its own worktree, forked from `integration` at commit `c6a1d1f`.
  - Eleven area agents: setup, shell and themes; Home, search and favorites; library browsing; movie detail pages; series, person, playlist and collection pages; player controls; player overlays (skip buttons, Next Up, subtitles); main settings; advanced settings; Live TV; music and photos. Each compares its reference pictures with the web app and fixes the differences in the folders it owns.
  - Changes to shared components, the shell and the theme are sent as requests to one shared-kit agent, which applies, adapts or declines each one.
  - Then a fresh checker for each area (remaining differences, claimed fixes, regressions), a fixer for each area's findings, and an integrator (shared leftovers, crawler scenes, gates, the end-to-end suite, a comparison sheet, commit, notes). At most nine agents run at the same time.
  - Only the throwaway test server is used, the one the reference pictures were taken on. The real servers are not touched at all.
- **Why:** Same server and same data make the pictures comparable. Folder ownership lets many agents work in one tree, as in wave 1 (T-19).
- **Rejected (implied):** One agent going through all screens in sequence.
- **Consequences:**
  - The first stage compared 230 pairs of pictures, made 118 fixes and sent 96 requests to the shared-kit agent (as the workflow's result counts them).
  - The judgment calls are in A-122 to A-124.
  - The integrator added a crawler mode that drives the app with the keyboard at the TV's own canvas size, one scene per reference picture, and a comparison sheet for all 244 pictures (commit `097a001`).
  - The integrator's notes are `docs/parity-notes.md`: all 244 reference pictures are paired with 208 web scenes; by the areas' own verdicts 68 matched as found, 113 were fixed, 48 were left and 15 have no counterpart (section 3), many of the "left" ones closed later by the shared-kit step or the integration. Section 5 lists the new differences from upstream, section 6 what is still different.
  - How the pass was finished and joined to the merged app: T-43 and T-41.
- **Code:** branch `parity`, commits `b5cacbc` to `b1e0f33` (code) and `d23d5bc` (notes); the workflow "tv-parity-pass" in the agent log archive.
- **Status:** On branch parity; on `main` since 2026-11-18 (commit `e1b7e04`).

### T-41. Merging the comparison pass early, in a separate worktree, with one rule for conflicts

- **Context:** Branch `parity` forked from `integration` before the stage 2 repair, so about 253 files differ between them, and a trial merge showed 13 files in conflict. The comparison pass's integrator was still finishing.
- **Decision:**
  - Do not wait. A new worktree `final` (branch `final`) is created from `integration`, and a merge agent merges `parity` as it stands at that moment. A later job adds what the integrator commits afterwards.
  - The rule of thumb for every conflict: **the comparison pass owns how things look** (sizes, spacing, type, colors, layout that matches the TV pictures); **the repaired app owns how things behave** (focus, keyboard, the rules for right-to-left and mixed-direction text, the page padding that keeps content above the mini player, the playback session, removed string keys, end-to-end stability, the start-up that the Content-Security-Policy allows, the content of the License page). Where both sides changed the same lines, both intents are kept.
  - A string key that the repair removed is not brought back. If code from the comparison pass still uses one, it is pointed at the upstream key the repair chose.
  - Files that merged without a conflict but were changed on both sides are read one by one against both sides' changes, because a clean text merge does not mean the code still works together.
  - The end-to-end suite is run once, as information; only failures caused by the merge are fixed there.
- **Why:** It saves the time of waiting for the integrator. The two sides made mostly different kinds of changes, so one rule settles most conflicts.
- **Consequences (the outcome, `docs/final-merge-notes.md` section 11):**
  - `parity` at `2a25082` was merged in merge commit `3085fba` (253 files). The 13 conflicts were resolved by the rule (section 11.1). Of the 23 files changed on both sides that merged without a conflict, three needed a follow-up: the playlist row's small buttons on phones (`7ebc953`), the music header lines on phones (`817594e`) and the pivot scrolling against the room kept for the mini player (`e8a7731`).
  - Six independent reviewers, one per area (the shell and the dialog layer; browse grids and detail pages; Live TV; music; settings, License, setup and strings; the end-to-end suite and the crawler), compared each side's intent with the merged files. As the workflow result records the models: the merge agent and the repair agent on Fable, the reviewers on Opus. They reported three findings, all minor and all a comparison-pass intent the merge had not carried through; all three were right and were fixed (`e3df8a1`, `6180e80`, `73ed619`; section 11.5). The fix commits added unit and end-to-end tests, each seen failing before its fix.
  - The one end-to-end failure of the merge's own run (190 of 191) was a test race that came with `parity`; its fix `b1e0f33` was later merged in full at `f27f68a`, except for its drawer part (A-128).
  - `main` was then merged into `final` (`1572963`) to bring in the documentation update of that day.
- **Status:** Done. On `main` since 2026-11-18 (commit `e1b7e04`).

### T-42. Seven small fixes collected by the lead for the stage 2 repair

- **Context:** While that work ran, the lead collected small problems outside the 31 findings and handed them to the agent that finished the repair.
- **Decision:**

  | | Problem | Fix |
  |---|---|---|
  | a | The server's `Permissions-Policy` header blocked the microphone, so voice search could not work. | The microphone is allowed for the app's own origin; camera, location, payment and USB stay off. A server test checks the header. |
  | b | `docs/deploy.md` stated the mixed-content rule the wrong way round. | Corrected: a page served over HTTPS cannot call a Jellyfin address that is plain HTTP; a page served over HTTP can call either. |
  | c | The reference-picture tools had a machine-specific Android SDK path as a default. | They read the standard `ANDROID_HOME`, then `ANDROID_SDK_ROOT`, and stop with a message when neither is set. No machine path is left in the tracked files. |
  | d | Settings showed the "server will not be supported soon" notice that setup had dropped (A-39). | **One shared server-version helper**, `src/lib/serverVersion.ts`, used by the server list, the user list and Settings, as upstream shows the notice in those three places. The "soon" level is shown nowhere; the "not supported" level is unchanged. |
  | e | The License page did not show the additional permission (O-19). | The text of `LICENSE-EXCEPTION.md` is read at build time and shown as its own section. |
  | f | The Docker image lacked the license files. | `LICENSE`, `LICENSE-EXCEPTION.md` and `THIRD-PARTY-NOTICES.md` are copied into the image. |
  | g | There was no guide for the trial on a second port (O-21). | `docs/deploy.md` section 9, "Trying it on a second port first". |

- **Why:** Each was found by reading, not by a checker, and each was too small for its own job.
- **Consequences:** Since item c, `npm run ref:shots` on a machine without either variable needs `ANDROID_HOME` set first. Item g goes beyond the brief in one point (A-113). The audit checked a, d and e in a browser (T-38). Not verified: voice search with a real microphone (headless browsers have no speech recognition), and the reverse-proxy block of item g.
- **Code:** `server/security.ts`, `docs/deploy.md`, `tools/refshots/common.mjs`, `src/lib/serverVersion.ts`, `src/features/settings/LicensePage.tsx`, `Dockerfile`. `docs/final-merge-notes.md` section 9.2.
- **Status:** On branch integration (on `main` since 2026-11-18).

### T-43. Finishing the comparison pass on its own branch, then topping up the merge

- **Context:** The early merge (T-41) took `parity` at `2a25082`, while the pass's integrator was still working.
- **Decision:**
  - The integrator finished on `parity`, untouched by the merge: its last code commit is `b1e0f33` (two keyboard tests wait for the state they act on), its notes are `d23d5bc` (`docs/parity-notes.md`).
  - What it committed after `2a25082` was brought into `final` by small top-up merges of `parity` as it moved on: `f27f68a` merged `b1e0f33` (the test fix; its sign-in part had already been applied by hand in `73ed619`, its drawer part was left out, A-128), and `b120d5f`, by the integrator of the final check (T-44), merged `d23d5bc` (the notes, no conflict).
- **Why (implied):** the early merge did not have to wait for the integrator, and each top-up brought only a few known commits.
- **Consequences:**
  - The pass's own gates on its final tree, as its integrator reported them: `npm run test` 63 files, 601 tests; lint 0 errors, 26 warnings; build passes; `npm run e2e` twice in a row, 188 of 188 both times; `npm run ts:verify` passes. The comparison sheet covers all 244 reference pictures with 208 scenes (`docs/parity-notes.md` section 2). The integrator's final report also gives the compare run (208 pictures, 208 ok, all 244 references paired) and a normal crawl, PURPLE, desktop and phone: 390 pictures, 390 ok, 1 scene skipped for lack of data.
  - Branch `parity` stays at `d23d5bc` as history.
- **Code:** branch `parity` (`b1e0f33`, `d23d5bc`); merges `f27f68a` and `b120d5f` on `final`.
- **Status:** Done. On `main` since 2026-11-18 (commit `e1b7e04`).

### T-44. The final check and repair: thirteen checkers at once, fixers by area, one integrator, an independent audit

- **Context:** After the early merge (T-41) the tree on `final` joined two large lines of work that had never been examined together in full. The owner had asked for as many parallel agents as useful, with a model that fits each task (O-24).
- **Decision:** One workflow on `final`, in four phases:
  1. **Thirteen independent checkers in parallel**, each with its own angle so that their work does not overlap: shell and keyboard; Home and library browsing; detail pages and dialogs; playback; Live TV; music; photos; settings and setup; search and Discover; Hebrew and Arabic; phones and touch; the Firefox and WebKit engines; and the TV comparison scenes. Each walked its angle in headless, muted browsers against the throwaway test server and reported findings with a severity.
  2. **Fixers by area, on disjoint files, in parallel**: nine area fixers (Home, browsing and search; detail; playback; Live TV; music; photos; settings and setup; Discover; tools and end-to-end tests) and one fixer for the shared code (the shell, the navigator, the overlays, the image rules). A fixer changes only its own files and sends what it needs elsewhere as a request; the fixers did not see each other's work.
  3. **One integrator, the only agent that commits.** It reads every change, settles the requests between fixers, completes fixes that need two areas, merges the comparison branch's last notes commit, adds end-to-end tests, and runs every gate, the crawler, the TV comparison and a Docker build with a smoke test.
  4. **An independent audit** that changes nothing, re-checks the claims with its own scripts and runs the gates.
- **Why the fan-out is in the workflow script:** agents started by a workflow have no tool to start agents of their own, so "let agents fan out" (O-24) could not be left to the agents. The lead wrote the parallel phases into the script instead.
- **Why one committer (implied; the sources give no reason):** ten fixers in one working tree would collide in git; a single integrator also gives one place where cross-area effects are read.
- **Rejected (implied):** one checker per broad area, as in stage 2 (three checkers, T-34); letting each fixer commit.
- **Consequences:**
  - 25 agents, about 3.5 hours (the lead's account). Models, as the workflow result records them: checkers, area fixers and the audit on Opus; the shared-code fixer and the integrator on Fable.
  - 47 findings, 6 major and 41 minor; the TV-comparison checker found none. All closed: 44 fixed, 2 the same defect as another finding, 1 rejected by its fixer and fixed elsewhere by the integrator (`docs/final-merge-notes.md` section 12.2). Commits `1d70b92` to `05b510d`.
  - The integrator added sixteen end-to-end tests (30 runs across the browser projects; the suite went from 191 to 221 tests) and the fixers and integrator took the unit tests from 68 files and 621 tests to 79 files and 686 tests. The integrator ran the end-to-end suite twice, 221 of 221 both times, on `db375e8`.
  - The audit's verdict was "ready to land". It found one fragile end-to-end test: the Home row drag test depended on which Home rows the shared test server showed, and failed on that day's data in three engines (210 of 213 in its run, which left out the writes project and the Discover spec). The lead hardened the test in `e1b7e04`. The audit's other minor points (among them: a mouse press on an overflowing row cancels dragging a card link out of it, which is not listed as a difference; a held focused look that can stay after a press without a click) are open for the follow-up polish round (Part 4). **Updated:** the polish round fixed the held focused look (A-144); its item list (`docs/final-merge-notes.md` section 13.1) does not name the row-drag point.
  - The new differences from upstream are listed in `docs/final-merge-notes.md` section 12.4, written to be folded into [DEVIATIONS.md](DEVIATIONS.md).
- **Code:** `docs/final-merge-notes.md` section 12; the workflow of the final check in the agent log archive.
- **Status:** Done. On branch final; on `main` since 2026-11-18 (commit `e1b7e04`).

### T-45. The backdrop colours: find the proven cause before fixing

- **Context:** The comparison pass left one difference at the top of its list: on some items the dynamic backdrop colours differed from the TV (the artist page of one test album was green on the TV and grey-green on the web; Home rows 4 and 5 were blue on the TV and brown-grey on the web). Its notes named a guess: the two JPEG decoders reconstruct a few pixels differently, and matching would need an Android-exact decoder (`docs/parity-notes.md` section 6, item 1).
- **Decision:**
  - A separate job on its own branch and worktree (`colors`), one fixer and one independent verifier: find the cause stage by stage with the same input on both sides, fix it at the cause, and verify against the reference pictures. Fixer on Fable, verifier on Opus.
  - Hypotheses tested, stage by stage: which image is chosen and its fallback; the requested size and the decode; the JPEG decoder; the size of the downscale; the sampling of the downscale; Palette's quantising, colour cut, scoring and targets; the corner rules and painting.
- **What was proven:**
  - Before picking colours, Android's Palette shrinks the image with `Bitmap.createScaledBitmap(bitmap, w, h, false)`, which goes through Skia's fixed-point nearest-neighbour sampling: a sample that lands exactly on a pixel edge takes the lower pixel, until the error of the float inverse scale, added up along a row, pushes it over (for 1920 to 150 columns, from column 80).
  - The web port used plain `floor((d + 0.5) * src / dst)`. On the test image that picked a neighbouring pixel in 16 of 150 columns and 12 of 84 rows, enough to change the picked colours.
  - Every other stage matched: the real Palette classes run on a JVM and the port agreed on 160 of 160 cases.
  - Prediction from decoded pixels with Skia's sampling gave the TV's colours for 11 of the 11 backdrops that show colours in the reference pictures; plain floor gave 6 of 11.
- **What was refuted:** the JPEG-decoder idea. All 16 test backdrops decode byte for byte like Android's libjpeg-turbo in headless Chromium, Edge, Firefox and WebKit; identical pixels gave the web's colours with the web's sampling and the TV's colours with Skia's.
- **Home rows 4 and 5 were not a colour defect:** albums and photo albums have no backdrop, and both apps keep the previous item's colours. The TV's reference run had paused on row 3; the web's comparison scene pressed Down every 160 ms, faster than the 500 ms colour delay, so the rows kept the first Home item's colours. The scene was paced (A-141).
- **Rejected:** approximating the sampling or shipping a JPEG decoder (A-139).
- **Consequences:**
  - All 11 backdrops that show colours in the reference pictures match the TV within 1/255 (6 of 11 before). The verifier measured 20 reference pictures with its own script and found no regression, also in other themes, at phone size and in Hebrew.
  - Recorded limits, not reproduced: Android's image loader (Coil) caps decoded images at 4096 px and scales larger ones while decoding; a device whose Skia build samples differently, or a browser whose JPEG decoder differs from Android's by a step on a few pixels (possibly Safari on Apple hardware; not testable on this machine), could still give other colours.
  - Now Playing makes one more image request per backdrop (A-140).
- **Code:** `src/app/shell/extractColors.ts` (`nearestColumns`, `nearestRows`, `scaleNearest`), its tests and fixtures; `src/features/music/nowplaying/useNowPlayingBackdrop.ts`; `tools/shots/tvScenes.ts`, `tools/shots/refmap.ts`. Commits `b08f0bb`, `4c2cf63`, `ead7347`, merged as `b6da6a9`.
- **Status:** Done. On branch final; on `main` since 2026-11-18 (commit `e1b7e04`).

### T-46. Reset the throwaway test server before the last gate

- **Context:** Hours of parallel agents had changed the throwaway server's user data: every item of the Codec Zoo library was marked watched (which removed a Home row from the comparison scenes), about 950 sign-in sessions had gathered, and a stray user existed. The last end-to-end run should test the app against the seed, not against what earlier runs left behind.
- **Decision:** Before the last full end-to-end run the lead reset the server to its seed (`npm run ts:reset`).
- **Consequences:**
  - The reset exposed a tool defect: on Jellyfin 10.11 a freshly wiped server already answers `/System/Info/Public` while its startup page answers every other address with 503, so provisioning began too early. `waitForServer` in `tools/testserver/setup.mjs` now also waits until another address (`/Users/Public`) stops answering 503 (commit `bc93855`, on `main` after the landing).
  - The result of the lead's last full run is in [STATUS.md](STATUS.md).
- **Rejected (implied):** running the last gate on the server as it was.
- **Code:** `tools/testserver/setup.mjs` (`waitForServer`).
- **Status:** Done (the fix is Built).

### T-47. Landing by fast-forward

- **Context:** `final` held everything: the merged app, the stage 2 repair, the focus fixes, the comparison pass, the final check and repair, and the colour fix. `main` had not moved since the earlier documentation update, which `final` had already merged (`1572963`).
- **Decision:** Move `main` forward to `final` without a merge commit (fast-forward), as was done for `integration` (T-38).
- **Why:** `main` was an ancestor of `final`, so the history stays linear and `main` gets exactly the tree that was audited and gated.
- **Consequences:**
  - On 2026-11-18 `main` moved to `e1b7e04` (git reflog of `main`).
  - `integration` stays at `c14b168` and `parity` at `d23d5bc` as history. Branches `final`, `colors`, `parity`, `integration` and `wave3a` and their worktrees are removed once the documentation is done. (Done later on 2026-11-18: T-57.)
  - The Docker image tested by the integrator was built from the final tree before the landing; a rebuild from `main` was still to be done at that point. (Done since: from `3b1dd7b`, from `c358a52`, and from `7ad52ba` for the trial; Q-33.)
- **Status:** Done.

### T-48. Landing the polish round with a merge commit

- **Context:** The polish round closed the open points of `docs/final-merge-notes.md` section 12.7, the minor points of the audit of T-44 and the largest remaining differences of the comparison pass (`docs/parity-notes.md` section 6). It ran as one workflow on branch `polish`, cut from `main` at `3b1dd7b`: six fixers in parallel on disjoint files (shell focus; grids; the series overview scroll; stylesheets for the oldest supported engines; tools and translations; the Live TV overlay), one integrator, who alone committed, and one independent verifier. Twelve commits, `a229ac6` to `fab7ab5`; the full notes are section 13 of `docs/final-merge-notes.md`. The verifier found nothing blocking and judged the branch ready to land. While the round ran, `main` had moved by one documentation commit (`3d1ea68`), so `main` was no longer an ancestor of `polish`.
- **Decision:** Merge `polish` into `main` with a merge commit instead of a fast-forward: `f1fb308`, "Merge the polish round (polish fab7ab5)".
- **Why (implied; the lead's account gives the fact, not the reasoning):** a fast-forward was not possible, and rebasing `polish` onto `main` would have rewritten the twelve commits that the integrator gated and the verifier checked. The commit on `main` touched only documentation, so the merge could not change the code that was checked.
- **Rejected (implied):** rebasing `polish` onto `main`; squashing the round into one commit.
- **Consequences:**
  - The merge was clean, with no conflict. On the merged tree: `typecheck` and `e2e:typecheck` pass; unit tests 84 files and 742 tests pass (694 tests before the round); lint 0 errors; the build passes.
  - The verifier's notes that did not block the landing: the stylesheet rewrite (`1850f33`) moves about 100 measured boxes by 1 to 4.5 px (largest: the genre line of the music header and the settings group headers); the difference in old engines could not be observed, because Playwright's Firefox already supports `text-box`; one untraced 404 console error in a smoke run of the production build; the message "ResizeObserver loop completed with undelivered notifications" three times in the dev-server log during the resize runs, not compared with `main`; real Chrome 119, Firefox 128, Safari, iOS and touch hardware not checked.
  - The final end-to-end runs needed a server reset (T-49), a recorded first-run effect (T-50) and one hardened test (T-51). `main` was then pushed, `3d1ea68..c358a52`.
  - The CI workflow on GitHub succeeded on `c358a52` (1 min 51 s).
  - What followed the landing the same day, each with its own entries: the closing round took the verifier's open notes (the Hebrew playback speed label fixed in `692715f`; the 404, the ResizeObserver message and the overlays without the "openers gone" handling traced to their causes and left unchanged: A-158 to A-162); the Docker image was rebuilt from `c358a52` before the trial and from `7ad52ba` after the touch fix (Q-33); the old worktrees and branches were removed (T-57).
- **Code:** `docs/final-merge-notes.md` section 13; merge commit `f1fb308`.
- **Status:** Done.

### T-49. Reset the throwaway test server again before the final runs

- **Context:** The test server's data had drifted during the polish round. Each crawl plays through the Next Up scene, so the next-up episode of one series advanced by several episodes, and no resumable episode was left (one crawler scene was skipped for lack of data; `docs/final-merge-notes.md` section 13.7).
- **Decision:** After the merge (T-48) and before the final end-to-end runs, the lead reset the server and provisioned it again from the main checkout, as in T-46.
- **Why:** the last runs should test the app against the seed, not against what the round's crawls left behind; the notes of the round name provisioning from the main checkout as the way to put the seeded state back.
- **Rejected (implied):** running the final gates on the drifted data.
- **Consequences:**
  - `npm run ts:verify` after the reset: 32 checks pass (the tool has 32 checks, not 31).
  - The first full end-to-end run after the reset met an effect of the fresh server itself (T-50).
- **Code:** `tools/testserver/` (`npm run ts:reset`, `npm run ts:verify`).
- **Status:** Done.

### T-50. The end-to-end page guard stays strict for the image errors of a freshly reset server

- **Context:** The first full end-to-end run after the reset (T-49), whole and alone, passed 236 of 239 tests. The three failures (two profile-PIN tests on the desktop project, the touch "More" button test on the phone project) failed only on the page guard (`e2e/fixtures/guard.ts`, which fails a test on any failed request or status of 400 or more): the test server answered 500 to five poster requests. The server's log shows Jellyfin's own "Response Content-Length mismatch" error while it fills its image cache for the first time; the same addresses answered 200 afterwards, and the error did not come back.
- **Decision:** No exception was added to the guard. The failures are recorded as a first-run-after-reset effect on the server side, with no change to the app.
- **Why (implied):** an exception for server errors on images would also hide a real broken image in the app; the errors came from the server, only once, and the next run did not show them.
- **Rejected:** allowing status 500 on image requests in the guard.
- **Consequences:** a full run started right after a reset of the test server can fail on these image errors; a second run is the check. The second run had 238 of 239 (T-51), the third 239 of 239.
- **Code:** `e2e/fixtures/guard.ts` (unchanged).
- **Status:** In force.

### T-51. Harden the Escape test instead of pinning the Home rows

- **Context:** The second full run passed 238 of 239. The Escape test in `e2e/specs/navigation.spec.ts` failed in WebKit: it goes three Home rows down and one card right, and at that moment the fourth Home row was "Recently added in Mixed Folders", a library with one item, so the row had no second card. Which Home rows show, and how long they are, depends on the server's data.
- **Decision:** The test goes on down to a Home row that has a second card before it presses Right (commit `c358a52`, test only).
- **Why:** the test is about Escape and focus restore, not about which rows Home shows (the commit message: the rows and their length depend on the server's data); the same approach as the Home row drag test after the final audit (A-138).
- **Rejected:** pinning the Home rows of the test user. The reason is implied, not recorded: a fixed row list would tie the suite to one server layout and change the user's data on the shared test server.
- **Consequences:** the third full run, on `c358a52`, passed 239 of 239 in 4.3 minutes.
- **Code:** `e2e/specs/navigation.spec.ts`.
- **Status:** Done.

### T-52. The first trial: a separate Caddy process that cannot reach the running one

- **Context:** The owner gave the go for the trial behind the reverse proxy (O-26). `docs/deploy.md` section 9 described it as a site block added to the existing Caddy configuration, followed by `caddy reload`. The running Caddy serves existing sites to other people.
- **Decision:** For the first attempt the lead did not edit or reload the running Caddy. It started a second, separate Caddy process with its own configuration file on another port, in front of the app's container, which was published on the loopback address only. That configuration has no admin endpoint, does not save itself, has automatic HTTPS off and uses a storage folder of its own.
- **Why:**
  - `caddy reload`, `caddy stop` and `caddy start` talk to the admin endpoint of the Caddy that is running. A second process with the default admin endpoint would collide with it or reach it. Without an admin endpoint the second process cannot.
  - With automatic HTTPS off the second process requests no certificate and opens no port 80, so it cannot disturb the first one's certificates either.
  - Stopping the second process removes the whole attempt.
- **Rejected:** editing the running Caddy's configuration file and reloading it, as section 9 was written.
- **Consequences:**
  - Locally it worked: a valid certificate, the preset server, sign-in, Home, an item page, the Seerr proxy, and no Content-Security-Policy violation.
  - The second port was not reachable from outside. The process was stopped, and the second attempt followed (T-53).
  - `docs/deploy.md` section 9 now records these settings as the safe way to try a configuration without touching a running Caddy, with the warning about `caddy reload`, `caddy stop` and `caddy start`.
- **Code:** `docs/deploy.md` section 9. The trial's own configuration is local and git-ignored.
- **Status:** Done (stopped).

### T-53. The second trial: one route for a sub-domain, with a rollback copy and a validated candidate

- **Context:** The second port of T-52 was not reachable from outside. A sub-domain of the existing site needs no new port. The owner gave a second go for that way, on condition that the existing sites are not put at risk (O-26).
- **Decision:** Add one route for the sub-domain to the running Caddy, without editing its configuration file. Before the change: save the running configuration as a rollback copy; build the candidate (the running configuration plus the one route) and validate it separately. After the change: check the existing sites first, then the new name.
- **Why:**
  - The existing configuration file stays unedited.
  - A candidate that was validated beforehand cannot bring a malformed configuration into the running process, which serves every existing site.
  - The saved copy is the exact state to return to if a check fails.
- **Rejected:** editing the configuration file and running `caddy reload` (a mistake in the file would be loaded for every site); opening a second port (a change outside the machine, for a trial).
- **Consequences:**
  - The new name got a valid certificate. The existing sites answered exactly as before; the app answered by its public name.
  - The app and Jellyfin are different origins on the same site, which works as in the port variant.
  - The owner tested the app (O-29) and keeps the trial for now (O-27); making it permanent is the owner's decision.
- **Code:** none in the repository. `docs/deploy.md` section 9 describes the sub-domain variant with placeholder names.
- **Status:** Done.

### T-54. The touch slider fix now, although touch work is scheduled later

- **Context:** After the first test the owner set the order of work: the desktop browser version first, phone and touch interface problems after it (O-28). The owner also named one touch problem: in Settings, a finger that lands on a slider while scrolling the page changed the slider at once (O-29).
- **Decision:** Fix that one problem at once, as a small job of its own: one fixer and one independent verifier.
- **Why:** it was small, and it changed settings by accident. With real touch gestures the fixer saw a scroll set "Interface scale" from 100 to 200, which lays the whole app out at double size. A defect that changes what a user has set, without the user meaning to, does not wait for the touch block.
- **Rejected:** leaving it for the later phone and touch work, as the order of work would have it.
- **Consequences:**
  - Commit `7ad52ba`. The fixer's sweep of every pointer handler in `src` found the same trap on the reorder handles of the Home rows editor and fixed it too (A-164).
  - The other touch observations of the sweep were recorded and not changed (A-165); they belong to the later block.
  - The end-to-end suite went from 245 to 250 tests.
- **Code:** `src/ui/inputs/Slider.tsx`, `src/ui/lib/touchIntent.ts`, `src/features/home/settings/RowListPage.tsx`.
- **Status:** Done.

### T-55. The reorder handle rests 400 ms, and a finger the gesture does not track moves nothing

- **Context:** The verifier of the touch fix judged it ready to commit and left notes. Two of them were about details of the fixer's code. First, the fixer's rest time for the reorder handle was 250 ms: a finger that landed on a handle, crept 6 px over about 300 ms and then swiped up picked the row up and moved it to the top, where a scroll was meant. Second, by reading the code and not reproduced: the last line of the slider's move handler also ran for a touch that the gesture does not track (a second finger, which the browser captures by itself), so that finger would have moved the value with no test of distance or direction.
- **Decision:** The lead changed both before committing. `HANDLE_HOLD_MS` is 400. The slider's fallback line runs for the mouse only.
- **Why:**
  - 400 ms is longer than a hesitation before a scroll and stays under the app's 500 ms long press (`LONG_PRESS_MS` in `src/ui/lib/useLongPress.ts`), at which Android would offer its own menu. The verifier had suggested 400 to 500 ms.
  - A value that changes under a finger the user did not mean for the slider is the defect the fix was made for.
- **Rejected:** the fixer's 250 ms; the long-press time itself (implied: the row would be picked up at the same moment as the browser's own long-press menu).
- **Consequences:** the end-to-end test of the handle rests 650 ms before it drags, longer than the pick-up time; the commit message of `7ad52ba` states the 400 ms. The cost the fixer had named stays: nothing on screen tells a touch user to rest on the handle first, and the up and down buttons remain the other way.
- **Code:** `src/features/home/settings/RowListPage.tsx` (`HANDLE_HOLD_MS`), `src/ui/inputs/Slider.tsx` (`onPointerMove`), `e2e/specs/home-settings.spec.ts`.
- **Status:** Done.

### T-56. Nothing is weakened for the two recorded slider notes

- **Context:** Two more notes of the verifier describe what the fixed slider still does. A swipe that first goes more than 10 dp sideways and then up belongs to the slider: the page does not scroll, and the value jumps to the finger's position ("Interface scale" went from 100 to 140 in the verifier's run). And in Chromium's emulated touch a start of 12 to 14 px sideways, then up, changes the value for a moment before the browser takes the gesture back; the slider then restores the value, and the stored preference is unchanged.
- **Decision:** Record both and change nothing.
- **Why:**
  - The first follows from the two choices that make a deliberate drag work: the direction is decided once, and the thumb goes under the finger (A-163). A scroll rarely starts more sideways than up.
  - A larger distance before the slider reacts, or a drag relative to the thumb, would make every deliberate drag worse to prevent a rare gesture.
  - The second ends with the right value, and is probably an effect of the emulation: a real Android Chrome decides to pan at about 8 dp, before the slider's 10 dp. That is not verified on hardware.
- **Rejected (implied):** a larger slop, a relative drag, a delay before the slider reacts.
- **Consequences:** both are listed as known behaviour in [STATUS.md](STATUS.md) section 4.3 and [DEVIATIONS.md](DEVIATIONS.md) section 18.
- **Code:** `src/ui/inputs/Slider.tsx` (unchanged for these).
- **Status:** In force. Open for re-checking when the slider is tried on real touch hardware.

### T-57. After the clean-up accident: `reference/` restored by cloning the tracked commit, the TV pictures captured again later

- **Context:** With everything on `main`, the lead removed the worktrees and deleted the finished local branches (`wave3a`, `integration`, `parity`, `colors`, `final`, `e2e`, `polish`). The first four worktrees were removed with `git worktree remove --force`. They held directory junctions (Windows directory links) to two shared, git-ignored folders of the main checkout, and git followed the links and emptied the real folders: `reference/`, the copy of the upstream source, and `refshots/out/`, the Android TV reference pictures with the emulator's files, about 3.6 GB. Nothing tracked, no test data and no server was affected. The owner has been told.
- **Decision:**
  - Restore `reference/` at once, by cloning upstream at the commit the project follows (`8dcf189`).
  - Do not capture the TV pictures again now. That is postponed until before the next comparison work.
  - A rule for removing a worktree on Windows: list the directory junctions inside it and remove each link itself first. For the last worktree the lead did that, and moved its test evidence to `shots/out/` before removing it.
- **Why:**
  - The upstream source is the first source of truth for every agent and the input of the string generator; cloning one commit is quick and exact.
  - Capturing the 244 pictures is a long emulator run on a machine that is in use, and no comparison work is next: the owner's order is the desktop version first (O-28). The compare results of the earlier rounds are recorded in the documents, and some compare output survives in the git-ignored `shots/out/`.
- **Rejected (implied):** starting the emulator run at once.
- **Consequences:**
  - Until the pictures exist again, `npm run shots:compare` has no reference side.
  - Only `main` is left locally. On GitHub the old backup branches `e2e`, `integration` and `wave3a` still exist: deleting them was refused by the permission check of the lead's tooling and is left to the owner (`git push origin --delete e2e integration wave3a`).
  - [TOOLING.md](TOOLING.md) section 14 carries the rule; its earlier text had said that what `git worktree remove` does with a directory junction was not tested.
- **Code:** none. [TOOLING.md](TOOLING.md) sections 8 and 14.
- **Status:** `reference/` restored: Done. The new capture: Planned.

### T-58. Publication as a clean copy: two repositories, one commit per release

- **Context:** The owner gave the go for publishing after a privacy sweep (O-33). The sweep cleaned the current files. Older versions of the documents, with what the sweep had removed, stayed in the git history.
- **Decision:**
  - Two repositories. The private repository keeps the full history and is where the work goes on. The public repository gets one commit per release.
  - The procedure for a release: first a privacy sweep of the tree; then one commit on the public branch whose tree is exactly the tree of `main`, with its dates in UTC and a no-reply identity.
  - The private history is never pushed to the public remote.
- **Why:**
  - The history could not be cleaned in place: the host keeps old commits reachable through pull-request refs, so rewriting the branches would not have removed them.
  - A release that is one commit brings no history with it, so the sweep before it has only the tree to read.
  - The owner chose it: "Yes, clean copy" (O-35).
- **Rejected:** rewriting the history of the existing repository and making that one public.
- **Consequences:**
  - The commit hashes named in these documents belong to the private repository and cannot be looked up in the public one.
  - The public repository shows no development history; these documents are the history.
  - The second release was made on 2026-11-24 (O-47; phase 35 of [PROJECT-LOG.md](PROJECT-LOG.md)): one new commit on the public branch on top of the first release's commit, whose tree is the tree of `main` at the release, made with a no-reply identity and UTC dates, and pushed to the public repository; the private history was not pushed. The public repository now holds the work of phases 32 to 35.
  - The third release was made the same day, after the owner's "Yes, publish first" (O-55; T-83; phase 39): one new commit on top of the second (`b9d0037`), with the tree of `main` after the documentation commit of that phase, made the same way. The public repository then held the work of phases 32 to 39. The public commit is `66b94ca`, with the tree of `main` at `162b44d`.
  - Its sweep followed the procedure above with five readers, one per part of the difference between the first release and `main` (the documents, the end-to-end tests, the player, the rest of the code and tools, and a pattern search over the whole tracked tree), and a second reader for every finding who was told to refute it. 51 findings were reported; the readers that tried to refute them let about 30 stand, all of low severity (none was a name, an address, a credential or a path), and about half of those were in text that the first release had already published. What was found, in general terms: statements that described the owner's use or the real server rather than the software, local clock times of the work, sample data in a unit test taken from a real response, and a table of the stream types of real items. All were reworded or removed before the release. The lead also searched the whole tree for the real private values themselves; none was present.
  - It cost more than announced: see T-76.
- **Code:** none. `README.md` carries the status line of the first public release (commit `1003992`).
- **Status:** In use. The first release: Done. The second release: Done (2026-11-24).

### T-59. Direct play: the browser plays what it really can, and the server converts only what is left

- **Context:** For a desktop Chromium browser the server converted far more than it had to, and the owner asked for the site to do as much as it can itself (O-34). Until then Matroska files were always repackaged by the server; image subtitles were always burned in (A-25); HDR video was offered only on an HDR display; and the browser's own answers about AC-3 and E-AC-3 were believed.
- **Decision** (commit `bf31148`, by the engine builder; the lead kept it):
  - **Matroska is decided by playing a clip, not by asking and not by the browser's name.** A Matroska clip of about 1.5 kB is embedded in the app and loaded into a detached, muted media element when the capabilities are measured. A decoded first frame means yes, an error means no. With no answer in 2 seconds (a browser that postpones loading), the browser's own type answer is believed, but only from an engine that turns down a made-up codec.
  - **Inside Matroska only what the element decodes is listed.** Chromium plays a Matroska file whose audio it cannot decode as a silent film, without an error. Such a file goes through the server, which copies the video and converts the audio.
  - **AC-3 and E-AC-3 are confirmed with a silent clip** of a quarter of a second when the type check says yes. An explicit error overrules the claim; no answer leaves it standing.
  - **The second audio track is the server's call.** A video element without the `audioTracks` API plays the first audio track of a file, whatever the default flags say (measured in Edge, Chrome and Firefox). The profile says so with the condition `IsSecondaryAudio = false`, and the server answers a request for another track with a repackaged stream in which the video and that audio track are copied. The player's own fallback step for this case was removed, so choosing the first track again returns to direct play.
  - **PGS subtitles are drawn in the browser** by libpgs when the existing preference "Direct play PGS" is on. It is on by default and had no effect before. The track is fetched whole with the Authorization header, and a body that is not a PGS stream is treated as unavailable. DVD (VobSub) and DVB subtitles stay burned in.
  - **HDR10 and HLG are played directly in desktop Chromium also on a display that is not HDR,** because that browser converts the picture for the display itself. No API answers the question, so this is the one check by browser engine: the "Chromium" brand and "not mobile" of the browser's own client hints.
  - **When one codec is unsupported, only that stream is converted** and the video is copied.
- **Why:**
  - Each point removes a conversion the owner had seen.
  - A type question answers "would you play this"; the clip answers "did you just play it". Browsers disagree with their own type answers for Matroska, and a browser can name the Dolby codecs without having a decoder on the machine.
  - Three points follow Jellyfin's own web client: Matroska as a direct-play container, the `IsSecondaryAudio` condition, and PGS delivered as a file for a canvas renderer. The HDR check is the one that client makes.
- **Rejected:**
  - Deciding by the browser's name (the user agent).
  - Believing the type answers alone.
  - A Dolby decoder inside the browser (WebAssembly feeding Web Audio beside a muted video): looked into by the builder and not built. It takes the sound out of the video element, so keeping picture and sound in step, volume, mute and picture in picture would all have to be built again.
- **Consequences:**
  - A new dependency, libpgs 0.9.0 (MIT), in its own lazily loaded chunk; it is in `THIRD-PARTY-NOTICES.md` and in the generated licence list.
  - AC-3, E-AC-3, DTS and TrueHD sound is still converted by the server where the browser has no decoder: the audio alone, with the video copied.
  - Two earlier entries changed: the rule of A-24 that a track change never climbs back to direct play no longer holds for a file's first audio track, and the first point of A-25 is replaced.
  - A defect fixed on the way: the audio track shown as selected for a directly played file was the one with the default flag, where the browser plays the first one. It is the first one now.
  - The throwaway test server got three small sample files for these cases, and the Debug page shows what was measured.
  - Tested in headless Edge with those sample files (`e2e/specs/playback-direct.spec.ts`). Not recorded here: how the films of a real server play since the change, and how the browser's HDR conversion looks on real films.
- **Code:** `src/features/playback/engine/probeMedia.ts`, `capabilities.ts` (`matroskaSupported`, `confirmDecode`, `browserToneMapsHdr`, `hdrPlayable`), `deviceProfile.ts`, `engine.ts`, `PgsSubtitles.tsx`, `subtitles/loader.ts`, `PLAYBACK_MATRIX.md`; `src/features/settings/debugInfo.ts`; `e2e/specs/playback-direct.spec.ts`.
- **Status:** Done. The HDR rule: Open for re-checking when someone has watched real HDR films this way.

### T-60. The web player's layout: one compact strip, fixed button positions, clock times

- **Context:** The owner asked for a player laid out like Jellyfin's own web player (O-34), then for a second round and a swap of the side groups (O-36, O-37). The TV's controller is a title, a seek bar, three button groups and rows of chapter and queue cards under them, about a quarter of the screen, over a darkened picture.
- **Decision,** in three commits:
  - **`bf31148` (the layout builder, checked by an independent verifier; the last two points are the lead's changes before the commit):**
    - Nothing darkens the picture while the controls show. A web-only preference, "Dim the video while the controls are shown" (`WebPlayerDimVideo`, off by default), brings the TV's scrim back.
    - One low strip at the bottom edge. Its height is one variable, `--player-strip-h`: 62dp, never more than 12.8% of the window's height, which is the black bar of a 2.39:1 film on a 16:9 screen, and never less than 46 real pixels. Every inner size is a share of it. Phones in portrait get two rows of buttons in 100dp.
    - Title, Back and clock are in a slim strip at the top.
    - Chapters and queue are two icon buttons that open panels (keys H and Q), instead of the rows of cards.
    - The transport buttons are in the middle: the button row is a grid whose two side columns are equal while there is room. The builder had put them at the start side; the lead changed it after the owner's "keep the controls in the middle" (O-34).
    - With the controls up, subtitles step up only by the strip's height. The TV shrinks its subtitle view to the top 70% of the screen, because its controller covers the lower part of the picture. Both builders had left the TV's rule in place and both verifiers pointed at it.
  - **`c2316a4` (a job of two builders, three checkers and one fixer):**
    - The button row has the same physical positions in every language; it is laid out left to right whatever the page's direction.
    - Times are clocks ("52:53", "1:52:53", "-53:39") in the elapsed and remaining time, the seek preview, the D-pad seek overlay and the chapter list. The digits have one width and the longest text of the item has its room, so the seek bar keeps its length.
    - The strip's dark gradient starts transparent one strip height above it and darkens to the window's edge.
    - The top strip has no logo: the title starts right after Back.
    - A favourite button for the item that is playing (a web addition).
    - A window under 500 wide has the two-row strip whatever its height.
  - **`255bff6`** (how it was built is not recorded): the two side groups swap places. Left: settings, favourite, picture in picture, volume. Right: subtitles, audio track, chapters, queue, fullscreen. Settings and fullscreen stay at the ends, the transport stays in the middle. The volume slider opens at the right of its button, over the free part of the left side, and takes no room in the row. Sheets and panels open above their buttons.
- **Why:**
  - The owner asked for each of these.
  - A strip no taller than the letterbox bar does not cover the picture of a wide film.
  - Fixed positions: a button stays where the hand expects it, in Hebrew and Arabic too.
  - A grid centres the transport group without measuring anything in script.
- **Rejected:** the TV controller's layout for the web (one preference keeps its dimming); a row that mirrors with the language's direction, as the first commit had it.
- **Consequences:**
  - A deliberate deviation from the TV layout, and from O-3 for the player; it is recorded in [DEVIATIONS.md](DEVIATIONS.md).
  - The times are plain left-to-right text in every locale, so the minus of the remaining time stands in front of the digits in Hebrew too. That settles Q-35.
  - For the favourite button, item patches now reach the playback store's own copies (`itemCache.onItemPatched`), so its state is right at once and after a rollback.
  - The TV-comparison scenes of the player differ from the TV pictures by design.
  - A burned-in subtitle cannot move and can be covered by the strip.
  - Known limit: in a narrow one-row window the volume slider has little room while a Skip button shows.
- **Code:** `src/features/playback/PlayerView.module.css` (`--player-strip-h`), `src/features/playback/ui/Controller.tsx`, `Controller.module.css`, `PlayerTopBar.tsx`, `PlayerPanel.tsx`, `ChaptersPanel.tsx`, `QueuePanel.tsx`, `FavoriteButton.tsx`, `VolumeControl.tsx`, `keymap.ts`; `src/features/playback/engine/subtitles/style.ts` (`RAISED_BY`); `tools/gen-preferences.ts` (`WEB_ONLY`); `e2e/specs/playback-layout.spec.ts`.
- **Status:** Done.

### T-61. Settings as a panel over a lifeless copy of the page it was opened from

- **Context:** The owner wanted Settings as a panel beside the page, with the page behind it still visible (O-40). The shell (the drawer and the page) and Settings are different route layouts: the shell layout unmounts when the full-screen layout mounts, so the page is gone at the moment Settings shows.
- **Decision:**
  - **A copy, not the page.** When the shell is torn down for a Settings route it copies its own DOM. The full-screen layout shows the copy in an inert layer behind the panel. Opened by its address, Settings has no copy and the layer is the plain background.
  - **What is stripped from the copy:** media elements, frames and scripts, so that there is never a second player; ids, `for`, `autofocus` and `tabindex`; every `data-*` attribute that no stylesheet selects on, because those are the hooks code finds elements by; the drawer's open state. A copy has no listeners. Its animations and transitions are switched off.
  - **What is kept:** the scroll offsets inside the page and of the window, the width the shell had, the values of inputs and the content of canvases.
  - **Whose it is:** the copy carries the key of the user it was taken for. It is never shown to another session and is dropped at sign-out.
  - **The return:** back on the copied page, the copy lies over the real page for 150 ms while that mounts, then fades away in 200 ms, and the page's own fade-in is skipped. With reduced motion it is removed at once. Any other arrival discards it.
  - **The backdrop:** a full-screen layout clears the published backdrop. The backdrop service remembers what the copied page showed and publishes it again on the return; a request for the same image within 2 seconds is answered from it, and the image skips its fade.
  - **The panel:** at the start edge, the nav drawer's side, in both directions, with the open drawer's look: the surface colour and a soft fade of 64dp past its end edge.
  - **The opening:** only when Settings is chosen from the open drawer. One piece moves, the panel's ground (one pseudo-element): it slides out from the open drawer's width with the drawer's spring, as a single transform. The header and the list do not move and are not clipped; they fade in once the ground has all but arrived. Opened by its address, on a reload and between Settings screens nothing moves. The Settings code is fetched while the drawer is open, so the bare page does not show in between.
  - **The Back button:** none while the empty area beside the panel can be clicked to leave. That room is measured (at least 48dp), not asked with a width query, because the panel's least width grows with the interface scale. Where it is missing the layout places its own button: over the panel's header when the panel fills the window, in the preview's corner beside the subtitle preview. The shell's floating button never shows on Settings.
- **Why:** Keeping the real page mounted would leave its key handlers, its focus logic and its queries running under Settings. A copy is a picture of the page that costs nothing while Settings is open.
- **Rejected:**
  - Keeping the real page mounted behind the panel.
  - Built first on the owner's word and then replaced on the owner's word (O-40): a light tint over the copy (`dc3c877`, removed in `732e409`), and a panel that just appears on every opening (`5ab9fd6`, replaced in `7454e4c`).
  - For the opening: a clip-path that grew out of the rail (`7454e4c`); a mask that ended in the drawer's fade (`630c7e9`), which wiped the content in mid-word beside the page's text and was painted on every frame; and, by the lead's account, a version with two transforms whose counter transform did not take effect in Chromium.
- **Consequences:**
  - An independent review on 2026-11-23 by two reviewers. A third agent, which tested in a browser, was stopped because it was testing the old panel side. A reviewer's test found one real defect, which was fixed: the copy was measured 10px too wide, because it used the document's client width; it now uses the shell's own width. Three unfinished reviewer tests were adapted or dropped.
  - Still open from the review, all minor: the copy does not follow a window resize, a change of the interface scale or a change of language made inside Settings; the mini player is not in the copy; pictures that had not loaded yet are empty in the copy.
  - To check: after Back to a "View more" grid in a short window, the window's scroll position is not restored. It was seen also without Settings, so it predates this work.
  - The way the opening was judged led to a rule of its own (T-62).
- **Code:** `src/app/shell/pageSnapshot.ts`, `PageUnderlay.tsx`, `backdropService.ts` (`keepBackdrop`, `resumeBackdrop`), `NavDrawer.tsx`; `src/app/AppShell.tsx`; `src/app/layouts.tsx` (`FullScreenLayout`); `src/features/settings/SettingsLayout.tsx`, `SettingsLayout.module.css`; `e2e/specs/settings.spec.ts`.
- **Status:** Done (commits `dc3c877`, `398f168`, `5ab9fd6`, `d1be200`, `7454e4c`, `630c7e9` and `445a739`; the tint went with `732e409`, T-70), and reviewed. The Firefox and WebKit projects were not run for its tests.

### T-62. Motion is judged from recorded frames at normal speed

- **Context:** The end-to-end fixture switches CSS animations off, with the same stylesheet as the screenshot crawler. On 2026-11-23 the opening of the Settings panel passed its tests while it looked wrong; the lead found that out the hard way, after the owner had seen it (O-40).
- **Decision:** Before an animated change is shown to the owner, the lead removes the fixture's no-animation style, sets reduced motion to "no preference", records screencast frames at normal speed and looks at them.
- **Why:** A test that passes with animations off says nothing about how an animation looks.
- **Rejected (implied):** judging a motion from its end state, or from still pictures of a run with animations off.
- **Consequences:** an extra step, for animated changes only. The recording runs headless like every other browser of the project (T-28).
- **Code:** none. The style it removes is `NO_ANIMATION_CSS` in `tools/shots/settle.ts`, applied by `e2e/fixtures/index.ts`.
- **Status:** In force.

### T-63. The fast path for small interface changes

- **Context:** The owner found small changes too slow (O-38). Until then every substantive task ran as a multi-agent workflow with build, review and fix phases (O-11, T-21).
- **Decision:**
  - A small, clear interface change takes the fast path: the lead edits directly, with no multi-agent job. It runs the type check, the unit tests and the one browser test that covers the change, takes one or two headless pictures, commits, builds the image, and asks for the go in the same message that shows the picture.
  - The slow checks (the full end-to-end suite, the other browsers) come afterwards and out of the owner's way.
  - Multi-agent jobs are kept for large or risky work, with the expected time stated first.
- **Why:** The owner asked for it (O-38): a small change should be in front of the owner within minutes, without losing quality, and the owner judges such a change by looking at it.
- **Rejected:** a multi-agent job for every change, as before.
- **Consequences:**
  - Phases 33 and 34 of the log were the lead working alone this way, with one review job (T-61).
  - The cost: the full end-to-end suite has not been run again after every small change. It ran once over the work of phases 33 and 34, before the second release (phase 35): 336 tests, two failures, both faults of Settings tests on WebKit. [STATUS.md](STATUS.md) carries the current state of the checks.
- **Code:** none.
- **Status:** In use.

### T-64. Every go-live keeps the previous image for a rollback and labels the build with its commit

- **Context:** Since the first public release, each newer build replaces the one the trial runs, after the owner's yes for that build (O-45).
- **Decision:**
  - Before the new image takes over, the previous one is kept under a rollback tag.
  - The build is labelled with its commit, so that the running container can be matched to the source.
- **Why:** If a build turns out wrong on the trial, the way back is one step and does not need a rebuild. The label answers "which commit is running" without guessing.
- **Rejected (implied):** replacing the image in place.
- **Consequences:**
  - On 2026-11-24 the trial ran the image built from `509db33`; later the same day, on the owner's yes, the image built from `4d6b61e`; later still, the image built from `d036067`.
  - No image is pruned: asked whether to delete the old rollback images and keep only the last two, the owner said to keep them all (O-54).
  - The reverse-proxy route of the trial is still the temporary one (O-27, T-53); making it permanent is the owner's decision (Q-1).
- **Code:** none in the repository. Neither the rollback tag nor the commit label is written down in `Dockerfile` or `docs/deploy.md`; the lead sets them at each go-live.
- **Status:** In use.

### T-65. The interface scale is applied at the release of its slider; every other slider still applies each step

- **Context:** While the "Interface scale" slider was dragged, every step resized the whole page, the slider included, under the finger or the mouse (O-32).
- **Decision** (commit `93fe59c`, by a fixer; checked by an independent verifier):
  - The shared slider can report its value while it is dragged apart from the value it commits.
  - Only a slider whose value lays out its own page anew uses that, and the list of those has one entry, `WebInterfaceScale`. Its row shows the pending value and applies it once, at the release.
  - After the page is laid out with the new scale, the list scrolls so that the slider is back at the height it had.
  - The keys still apply each step, as on the TV.
- **Why:** A control must not move and change size under the pointer that drags it. Every other slider changes something beside its list or nothing on screen, so those keep the TV's behaviour.
- **Rejected (implied):** applying at the release for every slider.
- **Consequences:** a web-only difference from the TV for one slider and for pointer drags only.
- **Code:** `src/ui/inputs/Slider.tsx` (`onDragValue`), `src/features/settings/SliderPreference.tsx` (`dragSummary`), `prefModel.ts` (`relaysOutPage`); `e2e/specs/settings.spec.ts`.
- **Status:** Done.

### T-66. A scroller that holds a card grid always reserves the room of its scrollbar

- **Context:** A poster grid that just fitted its scroller shook sideways (O-37). The cards are sized from the width of the element that scrolls them and decide the height of its content. With a scrollbar that takes room only while the content overflows, such a grid had no resting state: scrollbar in, cards narrower and shorter, content fits, scrollbar out, cards larger again, on every frame.
- **Decision** (commit `db14d7c`, by a fixer): whatever scrolls a card grid always reserves the gutter of its vertical scrollbar (`scrollbar-gutter: stable`): the grid's own scroller, marked `data-grid-scroller`, or the page itself while it shows a grid that scrolls with the window. Where a browser has no `scrollbar-gutter`, an always-present scrollbar reserves the same room.
- **Why:** With the gutter reserved, the width cannot depend on the height of the content, so the loop cannot start.
- **Rejected (implied):** damping the resize in script.
- **Consequences:** on a device with classic scrollbars a grid page keeps an empty gutter while its content fits. Overlay scrollbars (touch, macOS) take no room either way. In development builds the grid reports a scroller without the mark.
- **Code:** `src/theme/global.css`, `src/ui/rows/CardGrid.tsx`; `e2e/specs/grid-stability.spec.ts`.
- **Status:** Done.

### T-67. From a press on a slider to its release, the page starts no drag-and-drop and no text selection

- **Context:** A press on a slider that the page's text selection covered (select all, a double click on the slider, a selection across the row) made the browser drag the selection away: the pointer was cancelled, the cursor showed "not allowed" and the slider did not follow (O-37).
- **Decision** (commit `4a08905`, by a fixer): from the press to its release both are refused on the whole page, not only on the control (`keepPressToControl`). It applies to the shared slider, the player's and the music page's seek bars and the Live TV guide's drag-scroll. The refusal also ends at the next press anywhere and when the window loses focus.
- **Why:**
  - The browser looks up what to drag at the point of the press once the pointer has moved, and by then the control can have moved from under that point, so the drag would begin on the selected text beside it.
  - `user-select: none` on the control would not do: the drag of a selection made elsewhere remains.
  - Cancelling the press itself would take away the browser's own focus on press.
- **Rejected:** `user-select: none` on the control; cancelling the press event.
- **Consequences:** while a slider is held nothing on the page can be selected or dragged, which is what a held slider means.
- **Code:** `src/ui/lib/touchIntent.ts` (`keepPressToControl`), `src/ui/inputs/Slider.tsx`, `src/features/playback/ui/SeekBar.tsx`, `src/features/music/nowplaying/MusicSeekBar.tsx`, `src/features/livetv/GuideGrid.tsx`; `e2e/specs/slider-mouse.spec.ts`.
- **Status:** Done.

### T-68. Each subtitle line gets the direction of its own text

- **Context:** A subtitle line took its direction from the interface language, so closing punctuation landed on the wrong end: a Hebrew sentence in an English interface, an English one in a Hebrew interface (O-37). The TV app draws cues with Android text views, which pick each line's direction themselves.
- **Decision** (commit `6f16c8b`, by a fixer): every line of a cue gets a direction of its own, by these rules in order:
  - a line that starts with a direction mark has the direction its author stated;
  - a line without right-to-left letters is left to right;
  - a track that stores the closing punctuation of its right-to-left lines at the start of the line was prepared for players that lay every line out left to right (common for right-to-left subtitle files). Its lines are laid out left to right, as on those players;
  - otherwise a line with right-to-left letters is right to left when its first letter is one, when most of its letters are, or when the track as a whole is mostly right to left;
  - a line without letters follows its neighbour in the cue, else the track.
  
  ASS scripts in reading order get the automatic detection of the ASS renderer. Only the base direction is set; the text itself is never rearranged.
- **Why:** Setting only the base direction leaves the marks a file already carries working, and leaves embedded numbers and Latin words to the browser's own algorithm.
- **Rejected (implied):** one direction for a whole track; rearranging the text.
- **Consequences:** the price the code names: in a mostly right-to-left track, an English sentence that quotes a right-to-left word is laid out right to left.
- **Code:** `src/features/playback/engine/subtitles/direction.ts`, `assDirection.ts`, `src/features/playback/engine/SubtitleLayer.tsx`, `AssSubtitles.tsx`; `e2e/specs/subtitles-bidi.spec.ts`.
- **Status:** Done.

### T-69. No Back button on the pages the drawer leads to, and no circle at rest

- **Context:** The floating Back button showed on every page except Home (T-7). The owner found it ugly and unneeded in many cases (O-39).
- **Decision** (commit `32a0101`):
  - The shell shows no Back button on a page the drawer itself leads to: Home, Search, Favorites, Discover, Live TV and the libraries. It stays on inner pages such as an item.
  - Until the libraries have loaded the drawer is empty, so the shape of the address decides, and the button does not flash.
  - At rest the arrow has no circle. Under the pointer, and while the page is scrolled under it, it gets a gentle one. Keyboard focus keeps the kit's look.
- **Why:** On those pages the drawer is beside the page and is the way out. The circle returns while the page is scrolled, when rows pass under the arrow.
- **Rejected:** the button on every page except Home, as before.
- **Consequences:** Escape and the browser's Back work on those pages as before. The Settings pages have their own rule (T-61).
- **Code:** `src/app/shell/drawerItems.ts` (`isDrawerDestination`), `src/app/AppShell.tsx`, `src/app/shell/AppShell.module.css`.
- **Status:** Done.

### T-70. The open drawer lies over the page, and nothing is darkened for it or behind Settings

- **Context:** On the TV the open drawer pushes the page 160dp aside, and the backdrop image is covered with black at 75% while the drawer is open. The owner found the push unpleasant to watch and wanted no darkening (O-40).
- **Decision:**
  - Commit `bb76c45`: the page and the music bar no longer move when the drawer opens. The open drawer has its own panel in the surface colour, solid under its entries and fading out past its end edge. The phone's drawer sheet keeps its own background.
  - Commit `732e409`: the backdrop is no longer darkened while the drawer is open, and the light tint over the page behind Settings is gone.
- **Why:** The owner asked for both. A panel that fades out gives the page under it no hard border.
- **Rejected:** the TV's push and its darkening.
- **Consequences:** two deliberate deviations from the TV app, recorded in [DEVIATIONS.md](DEVIATIONS.md). The Settings panel took the same look (T-61).
- **Code:** `src/app/shell/NavDrawer.module.css`, `AppShell.module.css`, `Backdrop.tsx`, `src/features/music/MiniPlayer.tsx`.
- **Status:** Done.

### T-71. A user the server lists without a password is signed in by the click

- **Context:** Upstream opens the login dialog for every user who is not signed in. The owner wanted a user without a password to open the main screen at once, and only for the users shown on the user list (O-41).
- **Decision** (commit `27ab920`):
  - A user without a password is recognised by the server's public user list (`GET /Users/Public`): `HasPassword` is `false`. Only an explicit `false` counts; a server that does not say is treated as asking for a password.
  - A click on such a user signs in with the empty password instead of opening the dialog.
  - A refusal falls back to the dialog: a password may have been set since the list loaded. Any other error is shown first.
  - A name typed under Add User goes through the dialog as before.
- **Why:** The server's own list already says who has no password, so nothing has to be tried or guessed.
- **Rejected (implied):** trying the empty password for every listed user.
- **Consequences:** no new access: the dialog accepted an empty password before. With a preset server, such a user is now one click away for anyone who opens the app (Q-15). A deviation from upstream.
- **Code:** `src/features/setup/setupHelpers.ts` (`hasNoPassword`), `SwitchUserScreen.tsx`; `e2e/specs/signin.spec.ts`.
- **Status:** Done.

### T-72. The Home header's overview takes the room the header has

- **Context:** The overview in the Home header was upstream's fixed box, 400dp wide and 3 lines high (2 under an episode name), with empty room beside and under it. The owner wanted more room for the description (O-42).
- **Decision** (commit `8d305b7`): the box takes the height that is left in the header's 180dp and shows as many whole lines as fit (4 for a film, 3 under an episode name). It is a third of the window wide, from 400dp up to 680dp. The number of lines is measured from the box and its line height.
- **Why:** The header keeps its height, so the rows below do not move; only room that was empty is used.
- **Rejected (implied):** a taller header.
- **Consequences:** a deviation from upstream, which keeps the fixed box.
- **Code:** `src/features/home/HomeHeader.tsx`, `HomeHeader.module.css`.
- **Status:** Done.

### T-73. Subtitle style in the player reuses the Settings list, with the video as the preview

- **Context:** Upstream has the subtitle style options in Settings only. The owner wanted to change them inside the player (O-43).
- **Decision** (commit `e31ba4b`):
  - "Subtitle style" in the player's Settings opens the same list as the Settings page (the `SUBTITLE_STYLE` screen of the preference model) in a sheet on the control strip. No second list was written. The row that opens another page is left out.
  - The playing video is the preview: changes apply at once. While no subtitle line is on screen a sample line stands in, also with subtitles off.
  - The sheet edits the copy of the style the video uses: the separate HDR one for HDR video when that option is on.
  - A dialog opened from a row of a sheet (a colour choice) is drawn outside the sheet. Its keys no longer reach the sheet's handler or the player's Back handling, so its Escape closes only that dialog.
- **Why:** One list means that an option added to Settings appears in the player too, and both always edit the same preferences.
- **Rejected (implied):** a list of its own for the player.
- **Consequences:** the sheet addresses the Settings rows by their place (the element inside a `data-pref-id` row), because their class names belong to the settings feature. A web addition.
- **Code:** `src/features/playback/ui/SubtitleStyleSheet.tsx`, `PlaybackDialogs.tsx`, `PlayerSheet.tsx`, `usePlayerKeys.ts`; `src/features/playback/engine/SubtitleLayer.tsx`; `e2e/specs/playback-subtitle-style.spec.ts`.
- **Status:** Done.

### T-74. The player's Settings sheets are compact and a little see-through, and say when subtitles cannot be restyled

- **Context:** The player's Settings sheets had the TV's size, 424dp wide with 64dp rows, and hid the video. The owner asked for less width, a little padding, some transparency, and a note for subtitles the options cannot change; then for still less empty room and less transparency (O-43).
- **Decision:**
  - Commit `cf29a99`: the Settings sheets of the player (Settings, speed, scale, bitrate, subtitle style) are 280dp wide instead of the TV's 424dp, at most 72% of the height and 80% opaque, with 44dp rows and no empty slot for a selection dot before the Settings rows. The track, chapter and queue sheets keep the TV's size.
  - Commit `509db33`: a menu is as wide as its longest row, from 120dp to 280dp. The subtitle style sheet keeps the full 280dp, because a slider has no width of its own. The surface is 92% opaque; at the 80% of the commit before, a bright picture washed the labels out.
  - The subtitle style sheet says so when the subtitles on screen cannot be restyled, and shows no sample line then. Three cases: pictures (PGS; only the image opacity applies), ASS with its own style, and subtitles the server draws into the video.
  - "Image subtitle opacity" is now applied to PGS subtitles in the player, as upstream does for image cues. Before, only the Settings preview used it.
- **Why:** The video is what one looks at while using these sheets. The fixed 280dp of the first version left an empty half beside short labels.
- **Rejected:** the TV's sheet size for these sheets; the fixed 280dp; 80% opacity.
- **Consequences:**
  - A deviation from the TV's sheet size, for the Settings sheets only.
  - Not verified: the note was tested by setting the subtitle kind through the development hook, not with real image, ASS or burned-in subtitles; the sheets were not reviewed at phone width.
- **Code:** `src/features/playback/ui/PlaybackDialogs.module.css` (`.compactSheet`), `SubtitleStyleSheet.tsx`; `src/features/playback/engine/subtitles/style.ts` (`subtitleStyleReach`), `PgsSubtitles.tsx`; `src/i18n/extra/en.json` (`web_subtitle_style_note_*`).
- **Status:** Done.

### T-75. The series actor rows stay while the selection moves between episodes

- **Context:** On a series page the Cast & Crew and Guest stars rows show the people of the selected episode, 250 ms after the selection settles. As upstream does, every change of episode emptied the rows; on the web they were then removed and built again with a fade, every picture loaded again, although most of the cast is the same. With a mouse moving along the episode strip that happened for episode after episode.
- **Decision** (commit `ba1526e`): the rows keep the people shown last until the newly selected episode's people are ready. Shared actors keep their cards; only the others change. Without an episode (a season still loading), or when the lookup fails, the rows are empty.
- **Why:** A mouse moving along the strip selects episode after episode, so the rows were torn down and built again each time, pictures included.
- **Rejected:** upstream's emptying on every change.
- **Consequences:** for up to 250 ms and the time of the lookup, the rows show the people of the episode selected before. A deviation from upstream.
- **Code:** `src/features/detail/series/seriesQueries.ts`; `e2e/specs/series.spec.ts`.
- **Status:** Done.

### T-76. Every agent gets an explicit model, and a confirm stage batches its findings

- **Context:** The owner asked whether all subagents were running as Claude Fable. They were: the lead had set no model on the agents of the documentation job or of the privacy sweep before the second release, so all inherited the lead's model. The sweep's "one confirmer per finding" stage also grew it to 56 agents where the lead had announced five.
- **Decision:**
  - Every agent gets an explicit model chosen for its task: reading, searching, sweeps, confirmations and mechanical edits on Claude Sonnet, plain lookups on Claude Haiku, and Claude Fable only for hard code changes and for work where a wrong result is costly.
  - A confirm stage batches findings instead of starting one agent per finding.
- **Why:** An agent that inherits the lead's model runs on the most expensive one whatever its task, and a stage that starts one agent per finding has a size nobody announced.
- **Rejected:** leaving the model to be inherited.
- **Consequences:** The two jobs of 2026-11-24 (the documentation catch-up and the privacy sweep, 10 and 56 agents) ran entirely on the most expensive model. The fix-up of the sweep's findings in the documents ran on Claude Sonnet, the first job started under the rule.
  - The sweep and the documentation of the third release (phase 39) followed it: five readers and the documentation agent, all on Claude Sonnet.
  - On the same day the owner went further (O-59, T-87): the lead's own model does no work at all, only reviews, and one agent per area is kept. The agents of phase 40 (research, mockup, plan, player fixes, documents) all ran on Claude Sonnet or Claude Opus.
- **Code:** none.
- **Status:** In use.

### T-77. Settings regrouped into quick rows and nine subjects, with a test that no row is lost

- **Context:** The owner chose the order of Settings (O-48). Upstream sorts its rows into "Settings" and "Advanced Settings" (and Experimental and User Profile) by how often a TV user needs them. That spreads one subject over several screens.
- **Decision** (`b7f3310`):
  - `/settings` is a new first screen (`SettingsHome`). A "Quick settings" group holds five shortcut rows (Application Theme, User interface language, Interface scale, Subtitle style, Customize home page), two beside each other with the slider across both columns. Under "All settings" stand nine subjects (Profile, Interface, Home, Playback, Subtitles, Audio, Video, Screensaver, About), flowing down two columns. Each subject is a row that opens it and lists the rows inside it under its name, one to a line. In a narrow panel (a phone) both parts are one column.
  - `/settings/topic/:topic` (`SettingsTopicPage`) shows one subject. The model is `topics.ts`: `TOPICS`, `QUICK_ROWS`, `NAVIGATION_ONLY`, `buildTopic`, `resolveRow` and `topicPreview`. A row keeps the visibility condition of its entry on the upstream screen it came from (`resolveRow` uses that entry). The experimental row under Audio shows only while "Experimental settings" (About) is on, because upstream reaches its Experimental screen only then.
  - No row was removed. Every web-visible row of upstream's Settings (BASIC), Advanced, Experimental and User Profile screens has exactly one home in a subject. A unit test (`topics.test.ts`) fails if a row is missing, placed twice or never shown. Three upstream rows that only led from one of these screens to another are dropped: Advanced Settings, More user profile settings and the Experimental settings link. The five quick rows are shortcuts: each is also in its subject.
  - One row was added to Settings: "Reset preferences" (About), which until now was only a button on the Debug page.
  - Upstream's sub-screens Screensaver settings, Skip behavior, HDR formats and the subtitle style editor are unchanged and are reached from their subject. Old addresses redirect: `/settings/advanced` to `/settings`, `/settings/experimental` to the Audio subject, `/settings/user` to the Profile subject; an unknown subject goes to `/settings`. `UserProfileSettingsPage.tsx` is gone: its rows (preferred audio language, preferred subtitle language, subtitle mode, profile protection with "Change PIN") moved to Audio, Subtitles and Profile.
  - Names: the nine subjects use strings the TV app already has (`profile`, `ui_interface`, `home`, `playback`, `subtitles`, `audio`, `video`, `screensaver`, `about`), so they are translated in every language the TV app is translated into. That is why they are not the names of the lead's first tree (Account, Appearance, Home and sidebar, Video quality, Screensaver and photos, About and support). The two group headings "Quick settings" and "All settings" are new web-only strings (`web_quick_settings`, `web_all_settings`), English until the web-only strings are translated (O-22).
  - Layout: two columns, because one column needed scrolling on a 16:9 window; rows of the first screen 56dp instead of the TV's 64dp; the subjects as CSS columns (flow down, then across), so the keyboard order equals the reading order; the narrow-panel threshold is written in rem, because the build's px-to-rem step does not touch at-rule conditions and the threshold must follow the interface scale (found by the reviewer).
- **Why:** The owner chose this order (O-48). A list of every row of a subject on the first screen finds a row without opening each subject. A test over the model is the cheap way to keep a regrouping from losing a setting.
- **Rejected:** the other two trees (A alone, B the TV's two levels tidied, C alone); a search box in Settings (the lead's idea, not asked for); keeping upstream's navigation-only rows (they lead to screens that no longer exist); the subjects' own names from the lead's first tree (not translated).
- **Consequences:**
  - With the full lists the first screen is taller than a 16:9 window and scrolls.
  - A change to upstream's rows (a new one) must be given a home in `topics.ts`; the unit test fails until it is.
  - An independent reviewer (Claude Sonnet, read-only, T-76) found nothing lost in the regrouping and two things that were fixed: the threshold in raw px (see above) and the lookup of old addresses, which matched inherited object keys such as "constructor" (now own keys only, also in `screenFromParam`). Its smaller points (a stronger unit test, an unused string) were taken too.
  - Not verified: the new screens on real Safari or a real phone; the screenshot crawler was not run.
  - A deviation from upstream.
- **Code:** `src/features/settings/topics.ts`, `topics.test.ts`, `SettingsHome.tsx`, `SettingsTopicPage.tsx`, `TopicRows.tsx`, `ProfileLanguagePreference.tsx`, `SubtitleModePreference.tsx`, `ResetPreferencesPreference.tsx`, `SettingsPage.tsx`, `PreferenceList.tsx`, `prefModel.ts`, `Preference.module.css`; `src/app/nav.ts`, `routes.tsx`; `src/i18n/extra/en.json`; `e2e/specs/settings.spec.ts`, `slider-mouse.spec.ts`; `tools/shots/scenes.ts`, `tvScenes.ts`.
- **Status:** Done. On the trial since the build of `c92f5e6`; in the public repository since the third release (2026-11-24; O-55).

### T-78. No transition on the subtitle area, and the ASS renderer kept over a skip

- **Context:** The owner saw text subtitles fly in from the left after an arrow-key skip (O-49). With the controls hidden, an arrow-key skip shows the skip indicator, and `PlayerView.tsx` passes `hidden={skip.total !== 0 && !visible}` to the subtitle layer, which took the text subtitles away for that time. When the text renderer was put back, its area started without a size at the left edge and was measured at once, and a 200 ms transition on its `left`, `width` and `height` drew that as the line flying in. The transition was a leftover of upstream's shrinking subtitle view (the TV animates the view's size fraction when the controls show), which the web no longer uses: the text keeps its size and steps up by the height of the control strip. With the on-screen skip button the controls are up, so the subtitles are never taken away; in fullscreen with the arrow keys they are hidden.
- **Decision** (`c92f5e6`):
  - The transition on the text subtitle area (`SubtitleLayer.module.css`) is removed: the line is in its place from its first frame.
  - The ASS renderer (`AssSubtitles.tsx`) is kept over a skip and only hidden for it (`visibility: hidden`), as the PGS renderer already was. Before, a new one (worker, libass, fonts, script parse) was started after every arrow-key skip.
  - A new end-to-end spec, `subtitles-skip.spec.ts`, records every frame after the key press with animations running.
- **Why:** The owner wanted the line to just appear. The test is how it was found and kept found: the end-to-end fixture switches animations and transitions off, which is why this went unseen. This is the second find of that kind (see T-62). Before the fix the spec saw the area at 14, 34, 58 and 89 px wide, growing from the left edge.
- **Rejected:** none recorded.
- **Consequences:**
  - The text area no longer animates when the picture's box changes; the PGS picture keeps its own 200 ms transform.
  - Checks: the new spec passed on repeat runs; the other subtitle and direct-play specs (19 tests) and the playback unit tests (265) passed. Not verified: real media (only a generated test film was used), a real fullscreen window (the test plays a test film with a cue it supplies through the development hook).
  - Live on the trial since 2026-11-24 on the owner's yes (a rollback image is kept; the trial now runs the image of `4d6b61e`, which includes it).
- **Code:** `src/features/playback/engine/SubtitleLayer.tsx`, `SubtitleLayer.module.css`, `AssSubtitles.tsx`; `e2e/specs/subtitles-skip.spec.ts`.
- **Status:** Done. On the trial; in the public repository since the third release (2026-11-24; O-55).

### T-79. The wheel is taken only on the episode strip, and only for the notches of a mouse wheel

- **Context:** The owner asked to move the episode strip by holding and dragging and with the mouse wheel (O-50). The item rows already had drag-scroll (`src/ui/lib/dragScroll.ts`) and their wheel scrolls the page.
- **Decision** (`4d6b61e`):
  - Hold and pull moves the strip with the mouse, by the shared `dragScroll`. The click that ends a pull plays nothing.
  - A new `src/ui/lib/wheelScroll.ts` (with `wheelScroll.test.ts`) lets a wheel notch down run the strip towards its end, in both writing directions, about one card a notch (`WHEEL_GAIN`). Quick notches add up while it glides; there is no glide under reduced motion. At either end of the strip the wheel scrolls the page again.
  - Only the notches of a mouse wheel are taken. The fine steps of a trackpad, Shift+wheel and Ctrl+wheel are left alone (`isMouseWheelNotch` holds the exact rule).
  - Other rows are unchanged.
- **Why:** On a page of many rows, a wheel that moved whichever row is under the pointer would stop the page from scrolling; so the wheel is taken on the episode strip only, which is the owner's request. The trackpad rule is a guess from the size of the wheel step and cannot be exact.
- **Rejected:** the wheel on every row (the page could not be scrolled with the pointer over a row).
- **Consequences:**
  - A deviation from upstream: the TV has no pointer and no wheel.
  - Checks: unit tests 103 files, 910 tests, all pass (were 102 and 903). The series end-to-end spec passes in all seven projects (20 tests), with a new test of the wheel, the end of the strip and hold-and-pull using a real mouse in Chromium, Firefox and WebKit. The lead recorded frames of the glide with motion on: one notch moved 200 px in about a quarter of a second, and three quick notches added up to 600 px.
  - Not verified: a real trackpad; a real mouse with a free-spinning or high-resolution wheel.
- **Code:** `src/ui/lib/wheelScroll.ts`, `wheelScroll.test.ts`; `src/features/detail/series/EpisodeStrip.tsx`, `EpisodeStrip.module.css`; `e2e/specs/series.spec.ts`.
- **Status:** Done. On the trial since 2026-11-24, on the owner's yes (the image built from `4d6b61e`; a rollback image is kept); in the public repository since the third release (2026-11-24; O-55).

### T-80. The language list gets the popup's container

- **Context:** The owner reported that the language select was transparent (O-51). Upstream draws its language list without the popup's container (`LocaleChoiceDialog.kt` calls `DialogPopupContent` without the container's background, clip and padding), so on the TV the names float on the dimmed page. The web had copied that faithfully as a `bare` variant of `DialogPopup`, from 720 px of window width up. Since Settings became a panel over a page that stays visible behind it (T-61), the names ran through the page's picture and the dialog looked broken.
- **Decision** (`ce06734`):
  - The language list has the popup's surface, corners and padding, like every other choice.
  - The `bare` variant of `DialogPopup` (the prop and its styles), which nothing else used, is removed.
  - A new test in `settings.spec.ts` checks that the list has a solid background, rounded corners and padding, that it stays inside the window, and that the long list scrolls inside the box.
- **Why:** The owner asked for it, and the container-less look only works on the TV's dimmed page.
- **Rejected:** none recorded.
- **Consequences:**
  - A deviation from upstream, made on the owner's request.
  - Checks (the lead's): the Settings and preferences end-to-end specs pass in all seven projects (76 tests), with the new test in Chromium, Firefox and WebKit; the type check and the lint pass.
- **Code:** `src/features/settings/LanguagePreference.tsx`; `src/ui/overlays/DialogPopup.tsx`, `DialogPopup.module.css`; `e2e/specs/settings.spec.ts`.
- **Status:** Done. On the trial since 2026-11-24, on the owner's yes (O-52 and T-81 changed the box's size the same day); in the public repository since the third release (2026-11-24; O-55).

### T-81. The language list's box fits its names

- **Context:** The owner, with a picture of the list in its new box, asked for some margin around it and for it to be smaller, with not so much unused space (O-52). The box had the TV's fixed 440 dp width and, being a long list, ran from the top of the window to its bottom; the shared `Dialog` backdrop gives a popup the whole height on purpose, as on the TV.
- **Decision** (`d036067`): a `fit` option of `DialogPopup` (the prop and the class `div.fit` in `DialogPopup.module.css`): the width is `max-content` between 240 dp and 440 dp, and the height is at most the window's less 64 px, so the box keeps a gap above and below. Only the language list uses it; the other popups keep the TV's size.
- **Why:** The owner asked for it. It is an option, so the other popups keep the TV's size.
- **Rejected:** none recorded.
- **Consequences:**
  - A deviation from upstream, made on the owner's request.
  - Checks (the lead's): the Settings and preferences end-to-end specs pass in all seven projects (76 tests); the language test (Chromium, Firefox, WebKit) now also asserts the gap above and below, a width under 400 dp and that no name is cut.
- **Code:** `src/ui/overlays/DialogPopup.tsx`, `DialogPopup.module.css`; `src/features/settings/LanguagePreference.tsx`; `e2e/specs/settings.spec.ts`.
- **Status:** Done. On the trial since 2026-11-24, on the owner's yes (the image built from `d036067`); in the public repository since the third release (2026-11-24; O-55).

### T-82. A generated code map says which file is responsible for what one sees

- **Context:** The owner asked for a folder tree of the project, and of the source folder in particular, to help the owner, others and the lead find the element that needs changing (O-53). The example: looking for what makes the language list see-through, the owner found the Settings code but not the file responsible, and then a file with a similar name that belongs to another list.
- **Decision** (`26273ae`): `docs/CODE-MAP.md`, written by `tools/gen-code-map.mjs` (`npm run map`).
  - A "Where is ... ?" section of 560 rows: what a person sees or does, the files responsible, what each file decides, the marker to look for with the browser's Inspect tool, and a note. Kept by hand in `tools/code-map/where.json`; one line per folder in `tools/code-map/folders.json`.
  - Read from the code on every run: the screens (the table in `src/app/routes.tsx`), the `data-*` markers with the files that set them, the folder trees of the project and of `src/`, and every file of `src/` with the first sentence of its own comment.
  - `tools/gen-code-map.test.ts` (part of `npm run test`) fails when the page is out of date or a hand-kept row names a file that is gone. `CLAUDE.md` tells every agent to use the map, to add a row for anything new a person can see, and to start every new file with a one-sentence comment.
- **Who:** the lead wrote the generator. Eight read-only readers on Claude Sonnet, one per part of the source, wrote the rows (559 rows; one row named a file that does not exist and was dropped; about 1.1 million tokens, under three minutes). A ninth agent on Claude Sonnet, allowed to open nothing but the map, was given 18 problems in the owner's words and named the right files for all 18 (sure of 13). What slowed it down was corrected: the rows became short lines instead of table rows, because search tools skip very long lines; each file is labelled with what it decides; rows about similar things got notes that point at each other; a row for the darkening of the video was added, making 560.
- **Why:** Generated rather than hand-written so it cannot go stale silently (the test). The "what you see" rows are hand-kept because no script can know how a person describes a thing. The descriptions of files come from the files' own comments, so improving a comment improves the map.
- **Rejected:** none recorded.
- **Consequences:**
  - Cost: every added, moved or renamed source file now needs `npm run map`, or the unit tests fail.
  - Checks: unit tests 104 files, 911 tests, all pass.
  - Not verified: all 560 rows by hand. Every path is checked by the script; the wording and the markers are the readers' work, spot-checked.
- **Code:** `docs/CODE-MAP.md`; `tools/gen-code-map.mjs`, `tools/gen-code-map.test.ts`, `tools/code-map/`; `CLAUDE.md` ("Finding things").
- **Status:** Done. Committed on `main`; in the public repository since the third release (2026-11-24; O-55).

### T-83. The privacy sweep and the checks before the third public release

- **Context:** The owner said "Yes, publish first" (O-55). The public repository held the second release; `main` was ahead of it by phases 36 to 38. T-58 requires a privacy sweep of the difference before every release.
- **Decision** (2026-11-24; phase 39):
  - The sweep: five readers on Claude Sonnet (T-76), find only, each on a different part of what changed since the second release (49 files, about 11,800 added lines): the two halves of `tools/code-map/where.json`, the rest of the code map and its generator, the documents, and the code and tests. Seven points were reported; none was a credential, an address, a name or a path. Five sentences in `DECISIONS.md` and `PROJECT-LOG.md` were reworded: one that told what the owner was doing when a bug was seen, one that spoke of the owner's own media, and three that gave a count taken from the trial deployment.
  - Left as they were: an example clock time inside the code map's description of the "Ends at" text (an example of interface text, with no date beside it), and one sentence in `TOOLING.md` about the trial's temporary reverse-proxy route (the same wording was already public).
  - The release: one new commit on top of the second (`b9d0037`), with the tree of `main` after the documentation commit of phase 39 (T-58). That documentation commit is `162b44d` and the public commit is `66b94ca`; the CI run on GitHub for the public repository succeeded on it in 1 min 18 s (recorded in phase 40).
- **Why:** The release is one commit with no history (T-58), so the sweep has only the tree to read. A smaller sweep than the second release's (five readers, no second reader per finding) fitted a difference of this size, and the rule of T-76 kept its cost as announced.
- **Rejected:** none recorded.
- **Consequences:**
  - Gaps the readers stated: the long list of source files in `docs/CODE-MAP.md` and the generator script were pattern-searched, not read line by line. The lead's own search of the whole tracked tree for the real private values found none.
  - Checks on the release tree (the lead): the type check passes; lint has 0 errors; the unit tests pass (104 files, 911 tests); the production build passes. The whole end-to-end suite ran once in all seven projects with two workers: 345 tests, 345 passed, in 14.0 minutes (the first whole-suite run since the one before the second release, which had 336 tests). The screenshot crawler was run for the Settings scenes only (one theme, desktop size): 26 pictures, 26 ok, no warnings, no page errors.
  - Not verified: anything on real Safari or a real phone; the full crawl. (The CI result for this release, a success, is recorded in phase 40.)
  - The root README's status paragraph was rewritten for the release, and the Settings picture in `docs/screenshots/` was taken again with the crawler because it showed the old order of Settings; the other eight pictures are from 2026-11-18.
- **Code:** none; documents only.
- **Status:** Done (2026-11-24).

### T-84. A mouse click on the picture waits a quarter second before it plays or pauses

- **Context:** The owner's report that a fast double click for fullscreen stops the video (O-60). A click on the picture toggles play and a double click goes fullscreen; the browser sends two clicks first, so each of them toggled play.
- **Decision** (`0daae7e`):
  - A mouse click on the picture does not act at once: it waits 250 ms (`CLICK_WAIT_MS`), and a second click inside that time cancels the wait, so the pair is a double click and play is not toggled.
  - A double click slower than 250 ms (up to the system's time, at most one second) has already toggled play with its first click; the second click, with the double click event, puts the earlier play state back.
  - Touch, pen, the keyboard and the buttons are unchanged and act at once; only a mouse click (or a click with no pointer type) goes through the gate.
- **Why:** The owner wanted fullscreen to leave the video as it was; a click can only be told from the first of two by waiting a moment to see whether a second follows.
- **Rejected:** none recorded.
- **Consequences:** A single click on the picture now plays or pauses a quarter second later. The logic is free of React (`createClickGate`) so it is tested without a browser: 7 unit tests, and one end-to-end test in `playback-layout.spec.ts`. Not verified: the slow double click in a browser. On the trial since 2026-11-24.
- **Code:** `src/features/playback/ui/useMouseClickGate.ts`, `useMouseClickGate.test.ts`, `src/features/playback/PlayerView.tsx`.
- **Status:** Done. On the trial; not in the public repository.

### T-85. The subtitles are hidden at a skip and shown when the seek has landed

- **Context:** The owner asked how long after a skip the subtitles come back and then asked for 0.05 seconds (O-62). Measured before, in a headless browser on the throwaway test server, as the time from the key press to a visible subtitle (median of 5 runs): ASS played directly 815 ms, PGS 812 ms, text 811 ms, ASS on a repackaged stream 821 ms, while the renderers had the new picture after 11 to 76 ms. The cause: the subtitles were hidden for the skip indicator's fixed 800 ms animation, a rule of the web version only (the TV app never takes the subtitles away for a skip), kept because the indicator and the subtitle line overlap on the screen.
- **Decision** (`93e5bf4`):
  - A skip press hides the subtitle layer at once, before the next frame is painted. It is shown again when the video's latest seek has landed (the element's `seeked` event with no seek still running) and one frame has been drawn: ASS follows the video's own frames (JASSUB redraws on the video frame callback, which does not fire while paused), PGS and text follow animation frames. After 3 seconds without an answer the hold lets go, unless the video is still seeking, which keeps it.
  - The order of the states, `idle`, `armed`, `seeking` and `landed`, is a small pure state machine (`seekHoldState.ts`), so a late event of an older seek cannot show the layer early; a skip pressed again while the first is still in flight starts a new round.
  - The text subtitles stay mounted while hidden, as the PGS and ASS renderers already did.
  - While the skip indicator or the seek bar shows, the line is lifted above it (the layer's new `lifted` prop), as it already steps up for the controls.
- **Why:** It removes the 800 ms wait without showing the old line over the new picture or the new line early, which the owner required ("there shouldn't be problems with the subtitles and playback being synchronised").
- **Rejected:** none recorded. The old rule, a fixed 800 ms hide, is what was replaced.
- **Consequences:**
  - Measured after, smallest, median and largest in ms: ASS direct 22, 36, 134; PGS direct 56, 58, 71; text 15, 16, 33; ASS repackaged 19, 37, 40; three quick presses 55 to 93 from the last press. No sampled frame showed an old line or an early new line.
  - An independent checker found one defect and repaired it: after a skip while paused the old ASS line showed for one frame.
  - Checks: unit tests of the state machine (`seekHoldState.test.ts`) and the key rules, and the `subtitles-skip` end-to-end spec in the writes project. Not verified: the seek bar's scrubbing mode in a browser, the look of the lifted line, and the few slow first runs of ASS.
  - It replaces the rule of T-78 that the text renderer is taken away for a skip; T-78's other decisions (no transition on the area, the ASS renderer kept) stand.
- **Code:** `src/features/playback/useSeekHold.ts`, `src/features/playback/engine/seekHoldState.ts` and its test, `SubtitleLayer.tsx`, `AssSubtitles.tsx`, `src/features/playback/PlayerView.tsx`; `e2e/specs/subtitles-skip.spec.ts`.
- **Status:** Done. On the trial; not in the public repository.

### T-86. The address follows the queue without restarting the engine, and the queue is cut at the played item

- **Context:** The owner's report that the next episode went back to one already played (O-64). Since `3325a7d` (2026-11-18) the page address follows the play queue: when the queue moves on, `PlaybackPage` replaces `/play/<id>` with the entry now playing so that a reload continues what is playing. On the second move in a row the session key changed, so the engine restarted several times and ended on the item playback began with. It happened only when playback was started from an episode's own page. A broken move made 7 item requests, 3 playback-info requests and 4 engine restarts.
- **Decision** (`e6dece7`):
  - While the address only follows the queue, the destination that started the engine stays the running one, so the session key does not change and nothing restarts. The follow is marked by the address's own history state (`playbackFollowsQueue`), not found by comparing ids: the follow is a state update and a navigation that land in different renders, and a comparison seen between the two had restarted the engine on the previous episode and then on the first one.
  - The queue for a playable item started directly is cut after the item (`queueForPlayedItem`): when the list the server returns holds the item under its own id, the queue starts there; when it holds the same episode under another id (another version, as servers that merge versions or library plugins can list one), that entry stands for the item; every other copy of the item is dropped.
  - Next Up never offers the media that is playing (`isSameMedia`: the same id, or the same episode number of the same season of the same series).
- **Why:** The two defects together made the queue end on an episode already played. The history-state mark does not depend on the order of renders.
- **Rejected:** none recorded.
- **Consequences:** Now each move makes one playback-info request and no restart, and the video element stays. Not reproduced on the throwaway server: Next Up naming the episode that is playing (the owner's picture); it is covered by unit tests only. Upstream difference: upstream appends the whole contextual list after the played item (`PlaybackViewModel.kt`), which repeats the item when the list does not start with exactly that id (the comment in `queue.ts` names the file). Checks: unit tests in `queue.test.ts` and `PlaybackPage.test.tsx`, and an end-to-end test in `playback.spec.ts`; the player specs pass in the writes project.
- **Code:** `src/features/playback/PlaybackPage.tsx`, `src/features/playback/engine/queue.ts`, `engine.ts` (`showNextUp`), with tests.
- **Status:** Done. On the trial; not in the public repository.

### T-87. The lead reviews; one agent per area is kept; Haiku for pinpoint tasks

- **Context:** The owner's rules of 2026-11-24 (O-59): the lead no longer does the work itself, and agents need not relearn the project each time.
- **Decision:**
  - Every task goes to an agent on Claude Opus, Claude Sonnet or Claude Haiku, with the model named (T-76). The work of 2026-11-24 after the rule: Sonnet for the readers, builders, reviewers, investigators and checkers; Opus for the plan's planners and writer and for the fix of the next-episode bug; Haiku is for pinpoint tasks.
  - The lead writes the briefs, reviews the result, and does the hand-offs: talking to the owner, commits, publishing, go-lives. It edits itself only a few lines in a place it already knows exactly (the fast path of T-63).
  - One agent per area is kept alive and gets that area's next task as a follow-up, so it keeps what it has learned (the owner's examples: an Opus agent for the player and a Sonnet agent for Settings). Haiku agents are not kept. The first kept agent is the documents agent, which writes each documentation round; the lead sends it the facts and it reads git.
- **Why:** The lead's own model is kept for reviewing (O-59), and the owner asked whether new agents must relearn the project each time; a kept agent already has what it learned.
- **Rejected:** none recorded.
- **Consequences:** Each agent's model is named in the record of the work (phase 40 of [PROJECT-LOG.md](PROJECT-LOG.md) does so); a result is still reviewed by the lead. The follow-up to a kept agent carries the facts it cannot read in git, as this phase's did.
- **Code:** none.
- **Status:** In force (since 2026-11-24).

### T-88. An episode change keeps the player in place: no page fade, the last picture held, the controls kept

- **Context:** The owner's request that changing episodes reload only the picture (O-65). The playback engineer (T-89) compared the stock Jellyfin web client, served by the throwaway test server, with this app. The stock client keeps its video page, hands the next item to the same player, which swaps the source of the same video element, and refreshes its controls; its picture is empty for about 150 ms. In this app nothing was remounted. Three things made it look like a page reload: the app shell fades the page in from opacity 0 over 700 ms on every new address (and the address follow of T-86 changed the address on every move); a black cover with a spinner stood over the picture until the new stream loaded; and the Next Up click hid the controls.
- **Decision** (`5734cae`):
  - The address follow calls `skipNextPageFade()` (`src/app/shell/useShellLayout`), so the page does not fade in for it.
  - Before a move to another queue entry the engine copies the last picture to a canvas over the video (`holdFrame`, drawn at most at the size it is shown, with the video's box and scale) and removes it (`releaseFrame`) when the new entry has a frame: about 160 ms after the next button or at the end of an episode, about 360 ms after Next Up. The store field `frameHeld` says it. When the element holds no picture (a second move before the first has a frame, or a skipped entry) the picture already held stays, so no cover flashes.
  - The black cover is used only where there is no picture: the first start and a track change. During a move a small spinner stands over the held picture.
  - Next Up and the choice of a queue entry no longer hide the controls.
  - Previous and Next are disabled at the ends of the queue: `queuePosition(index, length)` in `engine/queue.ts` gives `hasPrevious` and `hasNext`.
- **Why:** It is what the owner asked and what the stock client does: the picture changes, the player and its controls stay. The held canvas is the web's way of keeping the last frame while the element is detached from its stream.
- **Rejected:** none recorded.
- **Consequences:**
  - Deviations from the TV app (DEVIATIONS section 9): the TV shows black between entries and the web holds the last picture; the TV keeps Previous enabled (it restarts the item after 3 seconds) and the web disables it on the first entry, so on a single movie it no longer restarts the item (the owner was told and may reverse it); choosing a queue entry (the TV hides the controls) and clicking Next Up keep the controls as they were.
  - Checks: the unit test of `queuePosition` and the rewritten end-to-end spec `playback`; an independent Claude Sonnet checker found and repaired one defect (a second move before the first had a frame dropped the held picture and flashed the cover) and measured with its own frame sampling: the page opacity never fell below 1, no frame of the cover showed, the control strip stayed as it was, and the title updated. The checker did not repeat the engineer's check that the new test fails without the fix.
  - Not verified: the held picture's position in fullscreen and at other aspect ratios, repackaged streams, a visible window, real media, and episodes with subtitles.
  - On the trial since the owner's yes the same day.
- **Code:** `src/features/playback/engine/engine.ts`, `engine/queue.ts`, `engine/types.ts`, `src/features/playback/PlaybackPage.tsx`, `PlayerView.tsx`, `ui/Controller.tsx`; `e2e/specs/playback.spec.ts`.
- **Status:** Done. On the trial; in the public repository since the fourth release.

### T-89. The playback engineer: a kept Opus agent with a role file and its own notes

- **Context:** O-66, on top of the rule of O-59 and T-87 that one agent per area is kept.
- **Decision:**
  - The role is a project agent definition, `.claude/agents/playback.md`: Claude Opus; it owns `src/features/playback/` and the player's end-to-end specs; it finds the cause before it changes anything, makes the smallest correct change, writes a test that fails without the fix, measures when the complaint is about time, and reports short and exactly with the lines for the lead's documents. Its safety rules repeat the working agreement (the throwaway test server only, one headless muted browser, no real server, no recordings, no commits).
  - Its own notes are `src/features/playback/AGENT-NOTES.md` (94 lines at the start): how playback is put together, the decisions and deviations that bind it with the reason for each, the pitfalls already paid for with the commit that fixed each, how to reproduce and measure in a headless browser, and what is unverified. The engineer reads them first in every task and updates them after it.
  - It runs as a separate session under the lead's chat. The first try, an agent started inside the chat, was stopped by the owner, who asked for the separate session.
- **Why:** The owner wanted an agent that learns how playback works and need not relearn it (O-66).
- **Rejected:** an in-chat agent (stopped by the owner).
- **Consequences:** The engineer does not edit the documents under `docs/`; it lists what belongs in them and this documents agent writes it. The two kept agents are the playback engineer and the documents agent (TOOLING section 14). The privacy sweep of the fourth release replaced the role file's list of local file names with a general sentence.
- **Code:** `.claude/agents/playback.md`, `src/features/playback/AGENT-NOTES.md`.
- **Status:** In force (since 2026-11-24).

### T-90. The privacy sweep, the pictures and the checks before the fourth public release

- **Context:** The owner said "update the repo and its images" (O-68). The public repository held the third release (`66b94ca`); `main` was ahead by phases 40 and 41. T-58 requires a sweep of the difference before every release.
- **Decision** (2026-11-24; phase 41):
  - The sweep: four Claude Sonnet readers (T-76), find only, on the changes since the third release (37 files, about 5,600 added lines). No credential, address, name, path or title was found. Five rewordings in three files by the lead (listed in phase 41): one sentence in the build plan that spoke of the trial talking to a real server; in `DECISIONS.md` three, the context of the cursor entry (it said what the owner was doing when a fault showed), and the context and the quoted sentence of the working-rules entry (the reason for the rule, which is now that the lead's own model is kept for reviewing; the rule stays); and in the playback role file the list of local file names, replaced by a general sentence. The old publication time of the first release, a clock time of day, was removed from every document in the last round of this phase (it remains in the history of the earlier public releases, which cannot be changed). Left as they were: sentences that mention a trial deployment in general terms, and a comment in a test that quotes the owner's wording of a subtitle fault.
  - The pictures: eight of the nine README pictures retaken with the crawler on the throwaway test server by a Claude Sonnet agent; the player picture from a new crawler scene, `play-controls`, because the old scene showed a paused film.
  - The release: one new commit on top of `66b94ca`, with the tree of `main` after the documentation commit of phase 41 (T-58).
- **Why:** The release is one commit with no history, so the sweep has only the tree to read.
- **Rejected:** none recorded.
- **Consequences:**
  - Gaps the readers stated: the long generated tables of the two admin inventories were pattern-searched and sampled, not read line by line; the code part was read by targeted searches.
  - Checks on the release tree (the lead): the type check passes; lint has 0 errors; the unit tests pass (109 files, 944 tests); the production build passes; the whole end-to-end suite ran once in all seven projects with two workers: 351 tests, 351 passed, in 14.1 minutes. The development server logged one unhandled error that no test caught: `setPointerCapture` threw a NotFoundError in `src/ui/inputs/Slider.tsx` during a synthetic touch drag. Open, not fixed in this release.
  - Not verified: real Safari or a real phone; CI on GitHub for this release is not recorded yet.
  - `docs/deploy.md` was corrected: the default of `DIST_DIR` is the `dist` folder next to `server/` (the image sets `/app/dist`), not `./dist` (checked against `server/config.ts`).
- **Code:** `tools/shots/scenes.ts` (the scene `play-controls`); documents only otherwise.
- **Status:** Done (2026-11-24).

---

## Part 3: Decisions made by agents during the build

These choices were made by agents, usually to resolve something the specs left open, or to adapt TV behavior to a browser. Each has a visible effect.

**Where each entry lives**

- No mark: on `main`. That covers waves 1, 2 and 3b, the end-to-end suite and the fix pass.
- **(wave3a)**: built on branch `wave3a`, in wave 3a or wave 4. It became part of branch `integration`, and of `main` on 2026-11-18.
- **(integration)**: made during stage 1 of the final merge or its repair. It existed on branch `integration` only when it was written.
- **(stage 2)**: made during stage 2 of the final merge, its repair or the focus fixes after the audit, on branch `integration`.
- **(parity)**: made during the TV-comparison pass, on branch `parity`.
- **(final)**: made during the early merge, the final check and repair, or the backdrop colour job, on branch `final` (or on `colors`, merged into `final`).
- **(polish)**: made during the polish round, on branch `polish`.
- **(closing)**: made after the polish round, in the closing round's small fix (commit `692715f`) or in the touch fix (commit `7ad52ba`). Both were committed on `main`; the mark names no branch.

Since 2026-11-18, `main` holds everything marked (wave3a), (integration) and (stage 2), because it was fast-forwarded to `integration` (commit `c14b168`), and, since a second fast-forward the same day (commit `e1b7e04`, T-47), everything marked (parity) and (final) as well. Everything marked (polish) reached `main` with the merge commit `f1fb308` the same day (T-48), and everything marked (closing) with the commits `692715f` and `7ad52ba` later that day. The marks are kept to show where each decision was made; the branches themselves were deleted on 2026-11-18 (T-57).

Part 3 ends with the touch fix (A-166). The choices made after it, by agents on 2026-11-18 and 2026-11-22 and by the lead working alone after that, are recorded in Part 2 as T-58 to T-90. Where one of them changed an entry below, the entry says so.

**Decisions that were made more than once.** Several things were decided by one agent and changed by a later one. Such an entry gives the decisions in order and says which one stands. In a few cases the fix pass (on `main`) and the repair (on `integration`) each changed the same thing in their own way. Those entries say so. Stage 2 of the final merge settled which version remains; A-107 lists how, and the entries concerned were updated.

**Kotlin over brief and spec.** Many entries below follow one rule from CLAUDE.md: when a brief or a spec asks for something that the upstream Kotlin does not do, the Kotlin wins. A-50 lists the cases.

### Input and navigation

| # | What was decided | Where it lives |
|---|---|---|
| A-1 | **How context menus open.** Right-click opens a compact menu at the pointer. The keyboard Menu key (or Shift+F10), a touch long-press and the ⋮ "more" button open the centered TV-style menu. | `src/ui/overlays/ContextMenu.tsx`, `src/ui/lib/contextMenu.ts`, `src/ui/cards/CardFrame.tsx` |
| A-2 | **When the ⋮ "more" button shows.** Always on touch screens, and on mouse hover. On cards like Play, the label stays visible on touch. | `src/ui/cards/CardFrame.module.css`, `src/ui/buttons/ExpandableButton` |
| A-3 | **Row scrolling.** Arrow buttons on a row appear only for a mouse, on hover. Snap-scrolling is for touch only. | `src/ui/rows/ItemRow.tsx` |
| A-4 | **Disabled buttons stay focusable** (marked `aria-disabled`), as on TV. | `src/ui/buttons/` |
| A-5 | **What Escape does on Home.** The first Escape opens the drawer focused on Home, as upstream's Back does. The second Escape returns to the page, because a web page cannot exit the app. With "More" expanded, Escape collapses it first. On a phone, Escape opens and closes the drawer sheet. | `src/app/shell/useBackKey.ts`, `src/app/AppShell.tsx` |
| A-6 | **Back on a deep link** goes to Home (replacing the entry) instead of leaving the site. | `src/app/shell/useGoBack.ts` |
| A-7 | **Drawer behavior on the web.** On wide screens it is a 64dp icon rail that expands on hover (after a 150 ms delay), on keyboard focus or on a tap. Under 600 px there is no rail: a top bar has a menu button, Back and the clock, and the drawer is an overlay sheet. On touch tablets the first tap expands the rail and the second navigates. A mouse click does not keep the drawer open. | `src/app/shell/NavDrawer.tsx`, `src/app/shell/useShellLayout.ts` |
| A-8 | **Floating Back button on every non-Home page.** Pages opt out with `useHideBackButton()`. | `src/app/shell/BackButton.tsx` |
| A-9 | **Page transition** is a fade-in of the new page only, not a cross-fade, so scroll restoration keeps working. | `src/app/shell/` |
| A-10 | **Home keyboard model.** Up and Down return to the column last used in each row. Left and Right stay inside a row; Left on the first card enters the drawer. Each row is one Tab stop. On launch the first card takes focus, except on touch devices. | `src/features/home/HomePage.tsx`, `src/features/home/useHomeFocus.ts` |
| A-11 | **Home header follows input differently per device.** Keyboard focus updates it at once and scrolls the row to the top. Mouse hover updates it after 250 ms without scrolling. Touch uses the tapped card, or the first visible card after a swipe. | `src/features/home/HomePage.tsx`, `src/features/home/HomeHeader.tsx` |
| A-31 | **One highlight at a time.** This settles the double focus ring (T-5, formerly Q-17).<br>• Rule (wave 3b): whichever input moved last owns the highlight. A real mouse or pen movement marks the page (`data-pointer` on `<html>`) and hides the keyboard focus look. Any key press removes the mark. Focus itself never moves on hover. Touch never takes the highlight, and a modifier key pressed alone does not count as a key press.<br>• First applied to the UI kit, the drawer, the error screen and the PIN entry, by a script that only prefixed selectors.<br>• The fix pass moved the tracking into one module. It also changed when the first mouse movement after start-up counts: only when it reports real movement, or comes more than 1 second after start-up. Before, a single jump of the cursor onto a card was ignored, which was the remaining Home bug.<br>• The cross-engine recheck widened "movement" to any change in the pointer's position values, because WebKit under automation reports some of them as constant.<br>• **(integration)** The repair applied the same rule to 17 style files in music, the player, Live TV, settings and Discover.<br>• **(stage 2)** Stage 2 merged the fix pass, so the Home case is fixed on `integration` too. A search of every style module for hover and focus rules outside this gating found two more (the recording schedule rows and the player's seek bar), and both were fixed. Text-field rings and rules that reveal controls while something inside has focus were left as they are. (This bullet replaces one that said the Home case still reproduced on `integration`.) | `src/ui/lib/inputModality.ts`, `src/ui/LIB_DEFAULTS.md`, `src/app/shell/shellFocus.ts` |
| A-32 | **Which element gets focus when a page opens ("arrival focus").**<br>• Rule (wave 3b integrator): a page focuses its first element as the TV app does, but never on touch screens, never when the user has already focused something, and after Back the remembered element wins.<br>• The integrator asked the lead to confirm this as the contract for later pages. The sources record no explicit answer. It was committed with wave 3b, and later runs use it.<br>• Earlier in wave 3b, a fixer had only drawn the selected episode of the series overview as focused, without giving it real focus. The fix pass replaced that with real focus, and the repair did the same on `integration`. Real focus stands.<br>• The fix pass added it for the playlist page and for the search field on a direct load.<br>• **(integration)** The Live TV guide first took arrival focus only after keyboard input (wave 4 fixer). The repair changed it to every non-touch device, like Home. The repair's rule stands. | `src/app/shell/shellFocus.ts` (`mayTakeInitialFocus`), the pages named |
| A-33 | **Left and Right prefer the same row.** For Left and Right, a target that overlaps the current element's row always beats one outside it. This ports the rule of Compose, the Android toolkit upstream uses. Up and Down keep the earlier scoring, to limit risk. The change is global, so the wave 3b integrator asked the lead to confirm it. The sources record no explicit answer; it was committed with wave 3b. | `src/app/spatialNav.ts`, `src/app/spatialNav.test.ts` |
| A-34 | **Arrow keys and the floating Back button.** The TV app has no Back button, and Left from a page's first column enters the drawer. Two branches solved this separately:<br>• `main` (wave 3b): the Back button is never a Left or Right target. Up or Down reach it only when nothing else lies in that direction (`data-focus-vertical-only`).<br>• `wave3a` (wave 4 fixer): a general attribute that says from which directions arrow keys may enter an area (`data-focus-enter`), with the Back button enterable only by Up.<br>• **(integration)** The merge first kept both mechanisms. The repair then removed the second one as unused. The `main` rule stands.<br>• **(parity)** The TV-comparison pass brought back an attribute of the same name with another meaning (`b5cacbc`): `data-focus-enter` now says where focus lands when an arrow key enters a container (`"restore"`, `"last"` and the other modes in ARCHITECTURE.md section 11.3), not from which directions it may enter. The Back button still follows the `main` rule (`data-focus-vertical-only`).<br>• Escape, Tab and a click reach the Back button in every case. | `src/app/spatialNav.ts`, `src/app/AppShell.tsx` |
| A-35 | **Mouse hover acts like TV focus only after a pause.** Where the TV app shows details of the focused item (the Home header and backdrop, the grid's details header and pane, the box set, the playlist, the episode strip), mouse hover does the same only after 250 ms, and only while the mouse owns the highlight (A-31). Keyboard focus and touch act at once.<br>• Before: Home had its own 250 ms delay (A-11). The wave 3b browse builder had none and listed that as unfinished.<br>• The fix pass made one shared helper. The cross-engine recheck added the "mouse owns the highlight" condition, because content that scrolls under a resting cursor otherwise moved the header away from the keyboard item. | `src/features/common/hoverIntent.ts` |
| A-36 | **Backdrop on tall windows.** On a window that is square or taller than wide, the backdrop image spans the full width from the top and is cropped to fill. Wide windows keep the TV rule (the image fits a box in the top corner). Reason given: the TV rule leaves a thin strip on a tall screen. | `src/app/shell/Backdrop.module.css` |

### Accounts, sign-in and PINs

| # | What was decided | Where it lives |
|---|---|---|
| A-12 | **What leaving a user does.** "Switch user" (the profile entry in the drawer) forgets the current user but keeps the server, so a reload lands on that server's user list. Upstream forgets the server too. After a deliberate switch, the user list does not send you back to the page you were on. | `src/api/session.ts` (`leaveUser`), `src/app/shell/switchUser.ts`, `src/app/layouts.tsx` |
| A-13 | **No sign-out in the drawer.** A reviewer asked for one; the shell fixer rejected it because upstream's drawer has none. Sign-out (with switch user, reset preferences and clear caches) was placed on the Debug page by the settings agent **(wave3a)**. Later runs added sign-out in two more places; see A-37. | `src/app/shell/NavDrawer.tsx`; wave3a `src/features/settings/DebugPage.tsx` |
| A-14 | **Opening the user list while signed in keeps the session** and highlights the current user. Upstream clears it, which on the web would sign you out whenever Back landed on the list. | `src/features/setup/UserListPage.tsx` |
| A-15 | **Add server has no network-discovery step.** Browsers cannot broadcast to find servers, so the dialog opens straight on "Enter server address". | `src/features/setup/ServerListPage.tsx` |
| A-16 | **Sign-in details:**<br>• every failed attempt counts toward the "Show debug info" button (upstream does not count wrong passwords);<br>• an expired Quick Connect code says so and offers a new code (upstream polls forever);<br>• server and user circles wrap and center instead of scrolling sideways;<br>• the most recent server is highlighted;<br>• a user-list error offers Retry and Switch servers;<br>• user avatars are requested only when the user has one. | `src/features/setup/LoginDialog.tsx`, `src/features/setup/` |
| A-17 | **How PIN entry works on touch and keyboard.**<br>• The upstream arrow-and-digit entry is kept, plus Backspace and an on-screen keypad (digits, arrows, OK).<br>• A wrong PIN of full length shakes and clears.<br>• On touch-only devices the hint row about remote keys is hidden, and "Press center to confirm" becomes a web wording.<br>• PINs are stored as plain text, as upstream does (Q-16). | `src/features/setup/PinEntryDialog.tsx`, `src/features/setup/pin.ts`; wave3a settings PIN screens |
| A-18 | **Profile protection is also offered in the user list's context menu** (upstream: Settings only). Changing an existing PIN to None or Login asks for the PIN first. **(wave3a)** Settings also has a "Change PIN" row, which upstream lacks. | `src/features/setup/ProfileProtectionDialog.tsx`; wave3a `src/features/settings/UserProfileSettingsPage.tsx` (since 2026-11-24 the row is in the Profile subject of Settings, T-77: `TopicRows.tsx`) |
| A-37 | **Where sign-out is offered, in the order it was decided.** Upstream has no sign-out at all. The reason given each time: a browser may be shared.<br>1. Wave 2: none in the drawer; wave 3a put it on the Debug page (A-13).<br>2. Wave 3b builder: "Sign out" in the user list's context menu, for the signed-in user only.<br>3. Wave 3b integrator: that entry could not be reached, because the drawer's profile entry leaves the current user before it shows the list. Sign-out is now offered for every saved user that has a token, and it revokes that user's token. The integrator asked the lead to confirm this widening; the sources record no explicit answer, and it was committed with wave 3b.<br>4. **(wave3a)** Wave 4 merge agent: a "Sign out" row at the end of the profile group on the main settings screen.<br>All of these stand. A checker of the final merge observed that the settings row signs out without asking for confirmation. Wave 4 did not exercise that row, because it would have revoked the shared test token. | `src/api/session.ts` (`signOut`), `src/features/setup/SwitchUserScreen.tsx`; wave3a `src/features/settings/SignOutPreference.tsx` |
| A-38 | **(integration) Signing in from the user list replaces the list in the browser history.** Before the repair, Back from Home after such a sign-in returned to the user list. A browser cannot clear its history, so the list's entry is replaced by Home. Back from Home then goes to whatever came before the user list. | `src/features/setup/SwitchUserScreen.tsx` |
| A-39 | **The "server will not be supported soon" warning is dropped.** Upstream shows it for every server below version 12.0.0, which today is every Jellyfin server. The web keeps only the hard minimum-version check. Reason given: that schedule belongs to the TV app, not to this port. Since the stage 2 repair this holds in Settings too, through one shared helper. | `src/lib/serverVersion.ts` |

### Data and storage

| # | What was decided | Where it lives |
|---|---|---|
| A-19 | **Where preferences are stored:** per browser, except language, audio/subtitle language, subtitle mode and search settings, which are per user. See T-15. | `src/stores/preferences.ts` |
| A-20 | **Home row settings are stored in the browser per server and user**, in upstream's Android format. Jellyfin display preferences use the client name "Wholphin", so home settings and "removed from Next Up" are shared with the TV app on the same account. | `src/features/home/model/homeSettings.ts`, `src/features/common/displayPreferences.ts` |
| A-21 | **Home loads rows one by one.** Rows appear as each one arrives, instead of all at once behind a loading page. They refresh when Home opens if older than 5 seconds, and when the tab becomes visible again. A fixer deferred this as a product question (Q-5). | `src/features/home/data/useHomeData.ts` |
| A-22 | **"Play with" offers only Play and Transcoding**, because a browser has one player. "Suggestions" are computed on demand and cached for 12 hours in the browser, where upstream uses a background job. | `src/features/common/itemMenu.tsx`, `src/features/common/suggestions.ts` |
| A-23 | **Custom-endpoint home rows may only call the Jellyfin server itself** (same origin, under its base path), so the access token cannot be sent elsewhere. Added by a fixer after a reviewer finding. | `src/features/home/data/rowFetchers.ts` (`resolveCustomEndpointUrl`) |
| A-40 | **(integration) One cache entry per server fact, and one store for the remembered tab.** A checker found the same server data cached under several keys, and three separate stores for "which tab was open". The repair merged them:<br>• one key for a single item, used by the detail, music, photo, browse and Live TV pages;<br>• one entry for the list of recording folders, shared by the drawer, Home and Live TV. A refused request (401 or 403) now reads as "no folders" on the Live TV page too, which is the drawer's rule;<br>• one key for "may this user edit this playlist";<br>• Live TV's own remembered-tab store (wave 4) is deleted and Live TV uses the browse store. The music library now uses it too, so the "Remember selected tab" setting applies to music. | `src/api/queryKeys.ts` (`itemKey`), `src/features/browse/data/useTabState.ts`, `src/features/livetv/LiveTvView.tsx`, `src/features/music/MusicLibraryPage.tsx` |
| A-41 | **Fixed colors became tokens in the generator, not in the spec file.** T-4 forbids color values in components. Several upstream colors are fixed, the same in every theme (white, black, gray and a few others), and had no token.<br>• Wave 3b and wave 4 fixers kept the literal values with a comment, and left the question to the lead. One of them rejected a reviewer finding on that ground: upstream hard-codes white there in every theme.<br>• The fix pass added `--fx-white` in the token generator, as a literal, because `docs/spec/design-tokens.json` has no entry for it.<br>• **(integration)** The final merge added `--fx-white`, `--fx-gray` and `--fx-black` the same way, because that task could not edit `docs/`. The repair added red, green, blue and the four log-level colors, and made every translucent black or white in the styles derive from the two tokens.<br>• Tokens stand. The spec file still lacks these entries (Q-30). | `tools/gen-tokens.mjs`, `src/theme/tokens.css` (generated) |

### Playback, settings, Seerr and deployment (wave3a)

All of these were built on branch `wave3a` and are part of branch `integration`. They are on `main` since 2026-11-18.

| # | What was decided | Where it lives (wave3a) |
|---|---|---|
| A-24 | **Playback fallback ladder.** Direct play, then remux, then full transcode, then a clear error, without looping. A track or bitrate change never climbs back to direct play. Steps are defined by what is requested, because Jellyfin calls a remux "Transcode". **Changed on 2026-11-18 (T-59):** the ladder has no step of its own for an audio track any more. The server decides, so choosing a file's first audio track again returns to direct play. | `src/features/playback/engine/` |
| A-25 | **Subtitles and codecs in the browser:**<br>• image subtitles (PGS) are always burned in by the server, so the "direct play PGS" setting has no effect;<br>• the "decode AV1" setting is ignored, because the browser decides;<br>• all text subtitles are fetched and drawn by the app;<br>• the "ASS: built-in" mode shows ASS as plain text cues.<br>**Changed on 2026-11-18 (T-59):** the first point no longer holds. PGS subtitles are drawn in the browser, and the "direct play PGS" setting chooses between that and burn-in; DVD and DVB subtitles are still burned in. | `src/features/playback/engine/` |
| A-26 | **Playback behavior changes:**<br>• "Next up: never" combined with autoplay now autoplays;<br>• skip-back-on-resume also applies when a resumed item starts;<br>• subtitle delay is saved per item and track;<br>• remembered audio/subtitle choices are stored in the browser per server and user, capped at 3000 items;<br>• playback does not pause when the tab goes to the background;<br>• remote control over Jellyfin's websocket is not implemented. | `src/features/playback/engine/`, `src/stores/playbackChoices.ts` |
| A-27 | **Seerr sign-in and storage:**<br>• there is no "enter your Seerr URL" step; the deployment decides;<br>• Seerr passwords are never stored (upstream stores them in plain text); the browser's Seerr cookie is the credential;<br>• an API key is kept only for the browser tab's lifetime (Q-7);<br>• Discover is reachable when not linked and shows a sign-in prompt (upstream hides it);<br>• rows follow upstream exactly (7 rows);<br>• grids reflow by width instead of a fixed 6 columns;<br>• a read-only season-status list was added to the TV page (Q-8). | `src/api/seerr/session.ts`, `src/api/seerr/client.ts`, `src/features/discover/` |
| A-28 | **Settings adaptations:**<br>• "Installed version" opens an About dialog (version, upstream commit, links to License and Debug) instead of upstream's release notes;<br>• "Clear image cache" can clear only the app's own cache storage;<br>• a header Back button shows only on touch or under 720 px. Overturned before wave 4: every settings screen now uses the shell's floating Back button at every width (A-42);<br>• "Start screensaver" stays hidden until a screensaver exists. Wave 4 built the screensaver, and the row now starts it (A-86);<br>• Android-only settings (update checks, player backend) are omitted. | `src/features/settings/` |
| A-29 | **Production server defaults:**<br>• the Seerr proxy forwards only three path prefixes and rejects cross-site writes;<br>• Seerr cookies are limited to `/seerr-proxy`;<br>• Seerr responses get a "no scripts" content security policy (a browser rule that limits what a page may load or run);<br>• `TRUST_PROXY` defaults to on, for Caddy (Q-9);<br>• a sub-path deployment is not supported. | `server/seerrProxy.ts`, `server/config.ts`, `docs/deploy.md` |
| A-42 | **Joining wave 3a to the shell from `main`** (the agent that merged `main` into `wave3a` before wave 4):<br>• the Discover entry in the drawer shows only while Seerr is linked. An expired or failed link hides it, as upstream does;<br>• one store for drawer pins. The settings row "Customize Navigation Drawer Items" keeps only the row; **(integration)** it opens the dialog from `main` (A-67). This settles the former Q-19;<br>• one Back control per page: settings screens use the shell's floating Back button at every width, which overturns the header Back button of A-28. Reason given: one consistent Back control. Changed on 2026-11-23: the shell's floating button never shows on Settings, and the Settings layout places its own where the area beside the panel cannot be clicked (T-61);<br>• Discover backdrops go through the shell's backdrop service instead of a private layer, and so also get the dynamic colors other backdrops have;<br>• "Clear track choices" in the item menu gets a default handler for the whole app. A detail page may install its own, which then wins;<br>• a wave 4 fixer added: the Media Session artwork (the picture a browser or operating system shows for playing media) is set only when the image exists, so no request is made that is certain to fail. | wave3a `src/app/layouts.tsx`, `src/app/startup.ts`, `src/features/settings/SettingsLayout.tsx`, `src/features/discover/backdropStore.ts`, `src/features/playback/engine/platform.ts` |
| A-43 | **License list and the `/license` page in development.**<br>• The generated list of third-party licenses skips packages that are links to `vendor/`. Those are the project's own code under GPL-2.0-only (T-32).<br>• A dev-server plugin answers a page load of a path that has no file extension but matches a file in the repository with the app itself. Without it, `/license` served the `LICENSE` file on a disk that ignores upper and lower case. This settles the former Q-11. | wave3a `tools/gen-licenses.ts`, `vite.config.ts` (`spaRoutesOverRootFiles`) |
| A-44 | **Theme music: volume at the highest setting, and one player.** Upstream writes 75 where a fraction is meant, and its player clamps that to full volume (the former Q-21).<br>• Wave 3b detail builder (`main`): 0.75, as `docs/spec/preferences.json` records.<br>• Wave 4 music builder (`wave3a`): 1.0, with its own second player.<br>• **(integration)** The final merge kept one player, the one from `main`, and 0.75 everywhere. The music service and a starting video stop it, and it never starts while the music queue is active. 0.75 stands.<br>• The cross-engine recheck (on `main`) made it ask the browser's autoplay policy first where the browser offers that, and wait for the first user action when autoplay is refused. | `src/features/detail/common/themeMusic.ts` |
| A-45 | **"Send media info log to server": built twice.** It was a placeholder until both branches ported it, independently:<br>• Fix pass (`main`): `src/features/detail/common/mediaReport.ts`. It sends the media sources and playback preferences, puts the browser's user-agent string where upstream puts the Android device details, and leaves out the device profile, because the player was on the other branch.<br>• **(integration)** Repair: `src/features/settings/sendMediaReport.ts`. It also sends the device profile the web player would use.<br>• Both show the entry whenever the item has media sources, as upstream does. The brief for the fix pass had offered hiding the entry when the server lacks the companion plugin. The agent found that upstream uses Jellyfin's built-in client-log upload, not the plugin, and did not hide it.<br>• Both keep upstream's fixed English toast text.<br>• Which of the two remains is settled by stage 2 of the final merge. | as named |

### Tooling

| # | What was decided | Where it lives |
|---|---|---|
| A-30 | **Screenshot crawler:**<br>• the clock is frozen at 20:00 so pictures are comparable;<br>• Quick Connect and some error states are mocked;<br>• browser storage is reset before each scene;<br>• the crawler's Jellyfin client is read-only;<br>• scenes that lack data on the throwaway test server are skipped rather than seeded. Wave 3b later seeded most of that data (A-46). | `tools/shots/` |
| A-46 | **Test data added to the throwaway test server.**<br>• Wave 3b builder: a resume point for an episode and for a movie, and a library of mixed folders, so that crawler scenes skipped for lack of data now run. This settles most of the former Q-13. The same step also scheduled recordings, which was undone (T-30).<br>• Image subtitles: two short test films with bitmap subtitle tracks (PGS and VobSub). The bundled ffmpeg cannot write PGS, so the agent wrote its own small packer for that format.<br>• Media segments (intro, outro, recap, preview) on one season of a synthetic show. They come from Jellyfin's official "Chapter Segments Provider" plugin, pinned to one version and installed only in the throwaway container.<br>• The setup script's `verify` mode gained checks for all of this and for "no recording timers".<br>• Not done, as reported: a full rebuild from nothing with the new steps, and an actual burn-in transcode of an image subtitle (only that the server chooses burn-in). | `tools/testserver/` (`setup.mjs`, `gen-media.mjs`, `imgsubs.mjs`, `segments.mjs`, `README.md`) |
| A-47 | **More reference shots from the emulator.** Three scenes were added at the end of the list, so existing scene numbers did not change: Live TV (20 shots), skip intro and outro (7 shots) and image subtitles (13 shots).<br>• In the Live TV program dialog the record actions were only shown, never activated. The agent checked which action had focus before every Enter, and confirmed afterwards that no timer existed.<br>• The agent did not delete recordings that were already on the test server, so the Recordings shot is not an empty state.<br>• It did not start a second emulator in parallel, although a relayed message suggested it: one emulator cannot be shared between processes, and a second costs another 2 GB of memory.<br>• As reported, some of the new pictures were opened and checked and the others were not. | `tools/refshots/scenes.mjs`, `tools/refshots/README.md` |
| A-48 | **Crawler additions.**<br>• A scene can declare the redirect it expects, so an intended redirect is not reported as a warning (wave 3b; used again in the final merge).<br>• **(wave3a)** Discover scenes run only against the real server and answer every Seerr write locally (T-36). Every scene that could touch recordings installs the Live TV write mock first (T-30).<br>• The cross-engine recheck added an `--engine` option (Chromium, Firefox, WebKit) and a 1440×900 viewport that is used only when named.<br>• On this Windows machine Playwright's WebKit lays pages out smaller than the requested size, because of the display scaling. The crawler and the end-to-end suite enlarge the viewport to compensate, and run the WebKit phone and tablet profiles without mobile emulation, which cannot be compensated. | `tools/shots/` (`scenes.ts`, `capture.ts`, `types.ts`) |
| A-49 | **Dev-server and gallery housekeeping.**<br>• **(wave3a)** The file-watch rule that switched off live reload inside a worktree (the former Q-12) was narrowed to the main checkout's own worktrees folder. The same commit limits the dev server's dependency scan to the app's entry page, which removes a noisy error message.<br>• The standalone UI gallery page and its screenshot script were removed in the fix pass. The gallery remains as the `/dev/gallery` route, and the crawler photographs it. The wave 3b integrator had asked the lead to keep or delete them. | wave3a `vite.config.ts`; `src/ui/gallery/` |

### Browse and detail

Built in wave 3b on `main`; later changes are from the fix pass unless marked. Paths are under `src/features/browse/` and `src/features/detail/`.

| # | What was decided | Where it lives |
|---|---|---|
| A-50 | **Where a brief or a spec asked for more than upstream has, the Kotlin was followed.**<br>• Series page: the brief asked for button labels such as "Resume S1 E3" or "Next up". Upstream's button always says "Play" and decides at click time (next up, else the first episode, from its resume point).<br>• Series overview: the brief listed "resume" and "next up" as ways to pick the first episode. Upstream uses only the ids it is given, else the first season's first episode.<br>• No separate season page and no "go to episode page" from the overview: upstream has neither.<br>• Missing and unaired episodes get no special look: upstream has none. The server's per-user setting decides whether they are listed. The fix pass re-checked this with mocked episodes and changed nothing.<br>• Detail pages: no refresh-metadata, identify or "collections containing this" (upstream has none).<br>• Search: the brief asked for paging and a "view more" card. Upstream has neither; each row asks for 50 results (A-61).<br>• Live TV: the brief listed a "channels" tab. Upstream has none (A-68).<br>• Photos: spec 04 limits the library's root to three item types. The Kotlin overwrites that limit, and the reference shot shows a plain folder at the root. No type limit (A-82). | the pages named |
| A-51 | **The library grid on a fluid layout.**<br>• Columns: the number in "view options" is the number at the TV's grid width. On wider or narrower windows columns are added or removed so cards keep about their TV size (about 10 at 1920 px wide, about 8 at 1280, 2 on phones).<br>• The tab row and the grid's header collapse once the content is scrolled more than 24 px, and return near the top. The TV app collapses them when focus leaves the first row, but a mouse or a finger has no focused row. Other features chose a different rule (Q-24).<br>• After a sort or filter change the grid starts at the top. Upstream reopens at the previously focused position. Reason given: that confuses pointer users after a re-sort.<br>• Keys: Back stays the browser's Back (upstream's Back first jumps to the first item). Home and End jump to the first and last card, Page Up and Page Down jump by upstream's step, the letter keys jump to a letter, and Space or a media Play key plays the focused card.<br>• The sort direction flips on right-click or a touch long-press of the sort button (upstream: long-press). Choosing the current sort again also flips it, as upstream.<br>• Before anything is focused, hovered or tapped, the footer, the letter column, the details header and the backdrop follow the first item, as upstream's focus starts there. | `components/LibraryGrid.tsx`, `model/gridColumns.ts`, `components/SortButton.tsx` |
| A-52 | **Dialog placement follows what the real app shows, not what the Kotlin asks for.** The Kotlin asks for the view-options dialog at the screen's end edge. The reference shots show it centered. The browse builder followed the picture. In wave 4 the Live TV builder first followed the Kotlin, and a fixer then centered it for the same reason (A-72). | `components/ViewOptionsDialog.tsx` |
| A-53 | **Library data and settings in the browser.**<br>• Each page of 100 items is cached, so Back shows the grid again without a request. A favorite or watched change patches the cached pages; a delete refetches them.<br>• Switching a library tab rewrites `?tab=` in place, which counts as a new visit, so cached pages are re-checked in the background. A fixer chose this over tracking visits across replaced history entries, which it judged could bring back a stale-cache bug.<br>• Sort, filter and view options are saved in the browser per server, user and library, in upstream's field names. Upstream keeps them in its local database.<br>• The open tab is kept in the URL, and also remembered per library when that preference is on (A-40).<br>• The generic grid page (`/grid`) takes its request from the browser's history state. A fresh load without it shows a notice and a Home button.<br>• Detail pages refetch their data every time they open, in place of upstream's refresh when a screen resumes. | `data/usePagedItems.ts`, `data/visit.ts`, `model/displayInfo.ts`, `data/useTabState.ts`, `ItemGridPage.tsx` |
| A-54 | **Upstream quirks that were kept on purpose** (each has a comment in the code or a note in the report):<br>• the movie Library and Collections tabs share one saved sort and view setting;<br>• the studio filter and studio tiles always ask for series;<br>• the Suggestions row seeds from the least recently played items, because upstream sends no sort order;<br>• there is no Tags filter, although the filter model has the field;<br>• the unplayed-count badge shows the raw number. | `CollectionFolderPage.tsx`, `data/` |
| A-55 | **Which page an item opens.**<br>• Series and seasons opened by item URL first redirected to the overview, until the series pages existed. A series now opens its details page; a season opens the overview at that season.<br>• An episode that belongs to a season opens the series overview, as upstream. The episode's own page is reachable only by a direct URL.<br>• A trailer item uses the movie page (upstream has no case for it).<br>• Item kinds from later waves showed a "not built yet" placeholder on `main`. **(integration)** The merge removed it: music and photo items go to their pages, a channel or program opened by URL plays the channel as a card click does, and a recording opens the movie page. Upstream shows "unsupported" for the last two.<br>• **(wave3a)** A photo opened by item URL goes to the viewer on its album. Upstream shows "unsupported". | `MediaItemPage.tsx`, `src/app/nav.ts` (`itemDestination`) |
| A-56 | **Series overview on the web.**<br>• The URL carries only ids (`?season=&episode=`), not the season and episode numbers upstream passes along. The page looks the numbers up when it needs them.<br>• The selection is written into the URL in place, 300 ms after it settles. Back therefore leaves the series, and a reload returns to the same episode.<br>• Selecting an episode: keyboard focus selects at once, mouse hover after the hover pause (A-35), and a mouse click plays. On touch, a tap on another card selects it, a tap on the selected card plays, and a swipe selects the first card fully in view. Reason given: a tap that started playback at once would hide the details.<br>• The strip handles Left and Right itself and is virtualized, for seasons with hundreds of episodes.<br>• Web addition: right-click or long-press on a season tab opens the item menu for that season (play, shuffle, watched, favorite). Upstream has no season actions here. The brief asked for them without changing the TV layout.<br>• All seasons are fetched in one request, not in pages of 20.<br>• A row with zero seasons is hidden (upstream shows "Seasons (0)"). | `series/SeriesOverview.tsx`, `series/EpisodeStrip.tsx`, `series/seriesQueries.ts` |
| A-57 | **Box set page.**<br>• Upstream swaps the collection's header for a header about the focused item ("Show details"). The builder built only the part where the backdrop follows the card. A fixer added the header swap, entered only by keyboard focus, not by mouse hover, because swapping the header under a moving pointer would make the page jump; the swap was instant. The fix pass added the slide animation for the incoming header only (upstream also slides the outgoing one out) and moved hover onto the shared hover pause.<br>• Delete goes Back after the "Deleted" message. Upstream stays on the deleted collection's page.<br>• In the view options, three choices cycle on click instead of opening a list.<br>• With "Show details" off, focusing an item clears the backdrop, as upstream does (the fix pass corrected the first web version). | `collection/BoxSetDetails.tsx`, `collection/CollectionViewOptionsDialog.tsx` |
| A-58 | **Playlist page: built twice.**<br>• Wave 3b builder: its own list page with its own toolbar and no View options. Sort was saved under a web-only key.<br>• Wave 3b fixer: added the filter, and deferred View options to the lead as a structural change, because upstream draws playlists with the shared library view.<br>• Fix pass: rebuilt the page on the shared library grid (list, compact list and grid, details pane, letter column, paging), keeping the playlist's own row. Sort, filter and view are now saved the way libraries save them. Values saved under the old web-only keys are not carried over. This version stands.<br>• Move up and down are hidden while a filter hides rows, because the positions would be wrong. Upstream allows it.<br>• What kind of media a playlist holds is worked out when Play is pressed, from the first 50 items of the current list. Upstream watches the list continuously. | `playlist/PlaylistDetails.tsx`, `components/LibraryGrid.tsx` (`renderListRow`, `menuOptionsFor`, `onPlayItem`) |
| A-59 | **Smaller detail-page choices.**<br>• Delete can appear in the menu of a "More like this" card when the user may delete that item. Upstream never offers it there. The shared menu works out the permission from the item.<br>• Trailers on other sites open in a new browser tab.<br>• Text whose direction differs from the interface (a Hebrew overview on an English interface, or the reverse) is laid out by its own direction and stays at the interface's starting edge. The fix pass chose `dir="auto"` with a fitted width over a CSS-only alternative that pushed such text to the far edge.<br>• Ages on the person page count whole calendar years, with no time-zone shift.<br>• Phone layouts: detail headers go full width below 760 px; the playlist's and the list view's details pane are hidden on narrow windows.<br>• The dialogs behind the item menu (add to playlist, media information, choose audio or subtitles) are mounted through the shared menu hook, so that the app shell did not have to be edited. Only the first mounted copy renders.<br>• Menu entries that open a chooser: a wave 3b fixer let a click inside the chooser close a mouse-opened menu underneath. **(integration)** The repair made every pick close the menu and a cancel return to it, as upstream does. The repair's rule stands. | `common/`, `person/PersonPage.tsx`, `src/features/common/itemMenu.tsx` |
| A-60 | **Single-line text fields.** A wave 3b fixer gave every single-line text field upstream's focus line and text color, rather than adding an option per field, because every upstream call site of that kind has both. The line is drawn so that it follows the field's rounded corners, which is how the reference shot looks. A disabled field stays dimmed, where upstream keeps the normal text color, so that it still reads as disabled. | `src/ui/inputs/TextField.module.css` |

### Search

Built in wave 3b on `main`. Paths are under `src/features/search/`.

| # | What was decided | Where it lives |
|---|---|---|
| A-61 | **Search follows upstream where the brief asked for more.**<br>• No paging and no "view more": every request asks for 50 results, sorted by relevance in the browser.<br>• The minimum length is "not blank", and the query is sent untrimmed.<br>• Nothing is shown before typing: upstream keeps no search history.<br>• With one row per category and no results anywhere, no message is shown, as upstream. The combined layout shows "No results".<br>• With every type excluded, the combined layout searches all types, as upstream does with an empty list. | `SearchPage.tsx`, `useSearchResults.ts` |
| A-62 | **The search field, the URL and focus.**<br>• The field is always editable. On TV it is read-only until activated, to avoid the on-screen keyboard.<br>• The query is kept in the URL (`?q=`) and updated in place, so Back leaves the search page instead of undoing keystrokes.<br>• A link with a query, or Back to the page, searches at once. Upstream waits 750 ms. Typing keeps the 750 ms pause.<br>• The field takes focus when the page is reached by keyboard or mouse, not on touch (no surprise on-screen keyboard) and not on Back. The fix pass added focus on a direct load or reload.<br>• Escape moves focus from the field to the results, or leaves the field when there are none.<br>• The excluded types and the Discover switch use the existing per-user preferences, not a new browser database. | `SearchPage.tsx`, `SearchHeader.tsx` |
| A-63 | **Voice search.** It uses the browser's speech recognition where that exists. The microphone button, and the setting that shows it, are hidden where it does not. The recognition language is the interface language. The browser gives no sound level, so the bubble only pulses. The browser asks for the microphone permission itself. | `voiceInput.ts`, `VoiceSearchOverlay.tsx` |
| A-64 | **Results layout and extension points.**<br>• The combined grid has 6 columns from 900 px wide and as many as fit below that. Its posters use a fixed 2:3 shape. The fix pass added side padding so that a focused first card is not clipped.<br>• Search offers two hooks for other features: one for Seerr results and one for what a Live TV program card does. **(integration)** The final merge registered the Seerr one. The Live TV one is still not registered, so a program card plays its channel, where upstream opens the program dialog (A-106).<br>• **(integration)** The Play key on a result starts at the item's resume point, as upstream. On `main` it started at the beginning.<br>• The rows in the "Include types" dialog announce themselves as switches to screen readers (fix pass). | `useGridColumns.ts`, `searchExtensions.ts`, `SearchPage.tsx` |

### Home customization

Built in wave 3b on `main`. Paths are under `src/features/home/`.

| # | What was decided | Where it lives |
|---|---|---|
| A-65 | **Back and saving.** One rule covers Escape, the floating Back button and the browser's Back: an inner page goes back one level; on the row list with unsaved changes the Save dialog opens; otherwise the screen closes. Navigating away by a link with unsaved changes also opens the Save dialog, and closing the tab shows the browser's own "leave site" prompt. Upstream's code leaves the order of its Back handlers to chance; the port follows the spec.<br>• "Unsaved changes" means the rows differ from the saved rows when both are written in one canonical form. After a save, a second Back leaves without asking.<br>• The Source page has no Save item. Upstream wires a confirmation there that nothing can reach; the port follows the corrected spec.<br>• "Apply to all rows" is left out, as upstream has it commented out. | `HomeSettingsPage.tsx`, `settings/` |
| A-66 | **Editing and preview.**<br>• Rows can be reordered with upstream's up and down buttons, and also by dragging a handle with a mouse or a finger (web addition).<br>• The preview fetches again only for rows that are new or changed. Upstream refetches every row after each change; the result looks the same.<br>• Removing a series from the "removed from Next Up" list refreshes Home at once. Upstream waits for Home's next reload.<br>• On phones the editing panel sits above the preview, because there is no room side by side.<br>• The Discover row type is not built: upstream switches it off in code, so it cannot be reached there either.<br>• The dialog for picking a collection or playlist has a normal search field and no voice button. | `settings/RowListPage.tsx`, `settings/editorModel.ts`, `settings/RemovedNextUpDialog.tsx`, `settings/SearchForDialog.tsx` |
| A-67 | **The dialog for drawer items lives in the shell.** "Customize Navigation Drawer Items" was built next to the drawer's pin store, not under Home, and is not shown on the Home customization screen, because upstream does not offer it there. **(integration)** The settings row opens it (A-42). Its order follows upstream: pinned items and "More" items in one list, sorted by saved order, unknown ones last. | `src/app/shell/navPins.ts`, `src/app/shell/` (`NavDrawerPinsDialog`) |

### Live TV

Built in wave 4 on branch `wave3a` **(wave3a)**; later changes are marked. Paths are under `src/features/livetv/`.

| # | What was decided | Where it lives |
|---|---|---|
| A-68 | **Tabs follow the Kotlin.** Guide, DVR Schedule, then one tab per recording folder. No channel-list tab (the guide's channel column and its dialog are the channel list), no page for series timers, and no "go to series" in the program dialog: upstream has none of them. | `LiveTvView.tsx` |
| A-69 | **Moving through the guide.**<br>• The guide handles arrow keys itself, from its data rather than from what is on screen, because only the visible cells exist in the page. Up and Down pick the program in the next row that overlaps the current one, closest to its middle.<br>• Escape inside the guide first does what upstream's Back does there: jump to the row's first program, then to the first row. After that it goes back.<br>• Time runs left to right in every language. The guide is not mirrored for right-to-left languages; tabs and dialogs still are. Reason given: mirrored scroll math is avoidable complexity.<br>• Program positions use real elapsed time, so a daylight-saving change does not distort them. Upstream uses wall-clock differences.<br>• The first load starts at once. Upstream waits 500 ms for its preference debounce. | `GuideGrid.tsx`, `guideModel.ts`, `useGuide.ts` |
| A-70 | **Guide additions for pointer users.**<br>• More programs load 150 ms after a scroll, not only when focus moves.<br>• Hover updates the header, like focus.<br>• Only keyboard focus re-centers the guide; a mouse click does not move it under the pointer.<br>• Dragging with the mouse scrolls the guide.<br>• A "Jump to now" button exists, because pointer users have no Back-key jump to the start.<br>• The "now" line moves every 15 seconds. Upstream computes it once.<br>• The tab row and the view-options button hide only while keyboard focus is below the first row. Any pointer input shows them again. Discover and music use the same rule; browse uses a scroll rule (Q-24).<br>• A channel logo is requested only when the channel has one. | `GuideGrid.tsx`, `TvGuide.tsx`, `ChannelCell.tsx` |
| A-71 | **Recording actions were checked only against mocks** (T-30). The app sends upstream's requests for "Record Program", "Record Series" and "Cancel", as seen in the logged mock traffic. No recording, timer or series timer was created on any server. | `liveTvApi.ts`, `ProgramDialog.tsx`; `tools/shots/scenes.ts` (`mockLiveTvWrites`) |
| A-72 | **View-options dialog: three steps.** The builder placed it at the end edge, as the Kotlin asks, in a dialog of its own. A fixer centered it, because the reference shot shows the real app centering it (the Kotlin's request has no effect on a device). **(integration)** The merge replaced the hand-made dialog with the shared one, with its dimmed background switched off as upstream does. Centered and without dimming stands. | `LiveTvViewOptionsDialog.tsx` |
| A-73 | **The recordings grid was a stand-in.** Upstream draws recording folders with the shared library view (sort, filter, view options). That view was being built on `main`, so wave 4 built a minimal grid and a fixer deferred the rest rather than build the shared view twice. **(integration)** The merge replaced the stand-in with the library grid from `main`. | `RecordingFolderGrid.tsx` |
| A-74 | **Smaller Live TV choices.**<br>• Toggling a channel's favorite does not re-sort the list, as upstream updates it in memory.<br>• When the program dialog fails to load, focus lands on its "Send app logs" button. That matches the default of upstream's toolkit and was kept.<br>• A program without a channel or without times is dropped, and a DVR timer without program data is skipped, where upstream would crash. | `guideModel.ts`, `liveTvApi.ts`, `ProgramDialog.tsx` |

### Music

Built in wave 4 on branch `wave3a` **(wave3a)**; later changes are marked. Paths are under `src/features/music/`. Music was tested on the throwaway test server only.

| # | What was decided | Where it lives |
|---|---|---|
| A-75 | **A music service of its own.**<br>• Music plays through its own pair of audio elements, separate from the video player. The next track is preloaded in the last 30 seconds and swapped in when the current one ends. Tracks that the server has to convert are not preloaded.<br>• The stream request lists what this browser can decode. Anything else is converted by the server to MP3 at 320 kbps in stereo. Seeking in a converted track reloads it from the new position.<br>• Reports to the server say "Transcode" for converted tracks. Upstream always says "DirectPlay".<br>• A "stopped" report is also sent when the tab closes.<br>• The service does not import the video player, so the main bundle stays small. It notices video playback by watching the route. | `service/musicService.ts`, `service/streamUrl.ts`, `service/reporter.ts`, `MusicHost.tsx` |
| A-76 | **Queue rules.**<br>• "Add to queue" starts or resumes playback, as every upstream path does.<br>• Repeat cycles off, one, all. A manual Next or Previous treats "one" as "off". Previous restarts the track after 3 seconds.<br>• Removing the current entry plays the one that takes its place.<br>• A track that fails shows a message and skips to the next. Upstream's player would stay in an error state.<br>• Shuffle: the order starts with the current song. "Play next" goes right after the current song in that order. Reason given: to make "Play next" and "Add to queue" predictable. Upstream uses its player's random order.<br>• "Play next" on an album, artist or playlist adds its songs. Upstream would queue the album's id as if it were a song. | `queue/queueOps.ts`, `src/stores/musicQueue.ts` |
| A-77 | **A mini player (web addition).** A bar at the bottom shows the current track while the user browses other pages. Upstream has only a drawer entry and the Now Playing screen.<br>• The page area of the shell traps arrow keys, so the bar has its own key handler: Down from the lowest element of the page enters the bar, Up returns. A fixer and the merge notes both say a shell-level rule would be cleaner (Q-32).<br>• The bar first carried its own list of routes on which to hide. **(integration)** The repair made it show only next to the app shell and take its position from widths the drawer publishes. | `MiniPlayer.tsx`, `MusicHost.tsx` |
| A-78 | **Music and other sound.**<br>• Starting a video stops the music, as upstream does.<br>• The queue pauses when any unmuted video in the page starts to play. This stands in for Android's audio focus.<br>• Theme music never plays over the queue (A-44).<br>• **(integration)** The screensaver does not start while music plays. Wave 4's screensaver only looked at media elements inside the page and missed the music service's detached ones; a checker found it starting during music, and the repair added a probe. | `MusicHost.tsx`, `service/musicService.ts`, `src/features/photos/screensaverService.ts` |
| A-79 | **The music library grid is its own.** It has sort (remembered per tab; upstream shares one setting across the three tabs), Play and Shuffle, the artist-source option, the letter jump and paging. Filter, the full view options and the random-item button are not ported. Whether it should become the shared library grid is open (Q-31).<br>• The "view more" card of a Recommended row opens the Albums tab, not a grid of that row.<br>• **Superseded (parity, on `main` since `e1b7e04`):** `library/MusicGrid.tsx` is removed; the music tabs use the shared library grid with one saved display setting per library (Q-31). | `library/MusicGrid.tsx`, `library/RecommendedMusic.tsx` |
| A-80 | **Now Playing and album pages.**<br>• The seek bar can be clicked, dragged and moved with the arrow keys. Upstream's is display-only, and a pointer has no other way to seek.<br>• Controls appear on pointer movement or a tap as well as on a key press. Space always toggles play and pause.<br>• An album with more than one disc shows a heading per disc. Upstream's list is flat; the brief asked for the grouping.<br>• The visualizer taps the audio in the page and needs no microphone permission. The tap is created only when the switch is turned on.<br>• The view-options dialog kept the dimmed background at first, because the shared dialog had no way to switch it off. **(integration)** The merge switched it off, as upstream does. | `NowPlayingPage.tsx`, `nowplaying/`, `AlbumPage.tsx` |
| A-81 | **Reviewer findings the music fixer rejected.**<br>• "Several progress reports at a track's natural end": measured again on a real natural end; the sequence matches upstream. The extra reports the reviewer saw came from a key bug that was fixed.<br>• "Now Playing opens with nothing focused": upstream opens it with the controls hidden and no visible focus; any key shows them. Kept. | - |

### Photos and screensaver

Built in wave 4 on branch `wave3a` **(wave3a)**; later changes are marked. Paths are under `src/features/photos/`.

| # | What was decided | Where it lives |
|---|---|---|
| A-82 | **Kotlin over spec, and quirks kept.**<br>• The library's root is not limited to three item types (A-50).<br>• Spec 04 says the clip's play and pause icons are inverted. The Kotlin's double inversion gives the correct icon, and the web shows the correct one.<br>• The letter jump with names sorted descending keeps upstream's wrong position. The spec allowed copying it. The library grid on `main` fixed the same upstream bug, so the two grids differ here.<br>• The "Played" and "Favorites" filter values keep upstream's literal labels "True" and "False". The library grid on `main` translates them.<br>• At the end of an album, a manual Next says "No more photos"; only the slideshow timer wraps to the start. As upstream. | `PhotoFolderView.tsx`, `SlideshowPage.tsx` |
| A-83 | **The viewer loads a screen-sized picture.** Upstream downloads the original file. The web asks the server for a copy sized to the screen, and loads the original on top only when the zoom needs more detail. Reason given: bandwidth and memory on phones and in large libraries. The screensaver uses sized pictures too. | `photoUrls.ts`, `slideshowModel.ts` |
| A-84 | **Viewer controls and corrections.**<br>• Web additions: a top bar (Back, full screen) and side arrows that appear while the mouse moves; click or tap toggles the overlay; wheel and pinch zoom; drag to pan; swipe for previous and next; extra keys for zoom and full screen.<br>• A "Slideshow duration" button in the overlay writes the same preference that upstream only offers in Settings.<br>• A photo rotated by a quarter turn still fits the screen. Upstream clips it.<br>• The viewer opens on the photo that was clicked, found by its id. Upstream opens at the grid position, which also counts albums, folders and videos and can open the wrong photo.<br>• The slideshow list holds photos (and videos when that setting is on). Upstream's list would also contain albums and folders, which then fail.<br>• Below 600 px the overlay's controls wrap onto several lines. A hidden sideways scroll had left three controls undiscoverable on phones.<br>• Focus inside the viewer is not remembered per history entry, so a reload does not focus a hidden arrow. | `SlideshowPage.tsx`, `SlideshowStage.tsx`, `ImageOverlay.tsx`, `src/app/shell/useFocusRestore.ts` |
| A-85 | **The photo grid is its own.** It ports upstream's photo-album view with its own saved display settings and color filters, kept in the browser per server and user. **(integration)** The merge left it in place rather than replace it with the library grid from `main` (Q-31).<br>• In list layout, "Show details" puts the header above the list, not in a pane beside it.<br>• On the album grid, Escape first jumps to the first item, as upstream's Back does, and also scrolls the page to the top. | `PhotoFolderView.tsx`, `photoStorage.ts` |
| A-86 | **The in-app screensaver.**<br>• It keeps the screen awake through the browser's wake lock, as upstream keeps the TV's screen on. The wake lock is also held while a slideshow runs.<br>• It never starts while a video or audio element in the page is playing, and a starting player hides it. The web player and music do not report to the screensaver service the way upstream's player does, so the service looks for playing media itself. **(integration)** The repair added a probe for the music service (A-78).<br>• The key or click that wakes it is used up and does nothing else. A pointer movement or the wheel only wakes it.<br>• It builds a new random order each time it shows and keeps at most two pages of items in memory.<br>• The "Start screensaver" row in Settings starts it (A-28). | `AppScreensaver.tsx`, `screensaverService.ts`, `screenWakeLock.ts` |

### End-to-end tests and CI

The end-to-end suite drives the real app in a browser against the throwaway test server. It was built on branch `e2e`, merged into `main`, and extended by the fix pass and the final merge. CI means the checks GitHub runs on every push. Paths are under `e2e/` and `.github/`.

| # | What was decided | Where it lives |
|---|---|---|
| A-87 | **Test projects and tags.** The suite runs as several "projects", each a browser profile: desktop, keyboard-only (any pointer event fails the test), touch phone, and "writes" for tests that change server data, with its own session. A setup project signs each one in once. Every test names its projects with tags. A test without a tag runs nowhere. | `playwright.config.ts`, `e2e/projects.ts`, `e2e/fixtures/` |
| A-88 | **What makes a test fail, and how known bugs are recorded.**<br>• Every test fails on a console error, a page error, a failed request or an HTTP error status. The suite-wide exceptions are two, each with a written reason: the probe for the optional server plugin, and requests the app cancels on purpose. A test can allow a failure it provokes.<br>• The suite builder did not edit the app. The three app bugs it found were written as tests that are expected to fail, which turn red once the bug is fixed.<br>• The fix pass fixed all three on `main` and made them normal tests. **(integration)** One of them, the double highlight on Home, is still an expected failure there until the fix pass is merged. | `e2e/fixtures/guard.ts`, `e2e/README.md` |
| A-89 | **Isolation and safety.**<br>• The suite refuses to run against the real server, and reads the test server's credentials without printing them.<br>• Each project and worker uses a fixed device id, so repeated sign-ins replace their own session instead of piling up devices on the server.<br>• Tests that write take a snapshot first and restore it after every test.<br>• Expectations are read from the server at test time, because other agents change the shared test data. The verifier still names shared data as the remaining source of rare failures.<br>• The default is 4 parallel workers. The brief said 2; the owner had allowed more (O-18).<br>• The fix pass added a run id: a run on another port gets its own output folder and device ids. Two agents had revoked each other's sessions by running the suite at the same time.<br>• Saved sign-in states and failure traces go to a git-ignored folder. | `e2e/fixtures/env.ts`, `e2e/fixtures/api.ts`, `e2e/global-setup.ts` |
| A-90 | **Flows that cannot run for real are mocked.** Delete (from a detail page and from a grid menu) and "mark the whole series played" run against mocked responses. Creating a playlist and moving playlist rows run for real on the throwaway test server, and the test deletes or restores what it changed. The agent logged every request other than a read to the real server during these checks and reports that none was sent. Sign-in error cases use mocks instead of real hosts. | `e2e/specs/` |
| A-91 | **CI and repository files.**<br>• One job runs install, typecheck, tests, lint and build on every push and pull request to `main`. A second job builds the Docker image without publishing it, and is skipped while the repository has no `Dockerfile`.<br>• Dependabot, GitHub's dependency updater, checks npm weekly (small updates grouped) and GitHub Actions and Docker monthly. What to do with its pull requests is open (Q-26).<br>• Text files are stored with Unix line endings; Windows script files are the exception. The one-time conversion of the existing files was left to the lead (Q-28).<br>• The verifier added a typecheck of the test code itself to the CI job, because the app's typecheck does not cover it.<br>• As reported at the time: the workflow file was read by hand, not parsed by a tool, and had not run on GitHub. | `.github/workflows/ci.yml`, `.github/dependabot.yml`, `.gitattributes`, `.editorconfig`, `CONTRIBUTING.md`, `SECURITY.md` |
| A-92 | **The suite was checked by breaking the app on purpose.** An independent verifier made five deliberate changes to the app, one at a time, and ran the suite. Four turned tests red. The fifth (removing the "incorrect PIN confirmation" message) left the suite green, so the verifier added a test for it and confirmed that it then failed. All changes were undone. | `e2e/specs/accounts.spec.ts` |
| A-93 | **Other browser engines in the default run.** The cross-engine recheck added three projects: Firefox, WebKit and an iPhone-sized WebKit. By default they run a smoke subset (sign-in, Home, drawer, library, movie page, series, search, menus, Back, theme, Hebrew, layout). One setting makes them run every desktop and phone test. The agent notes that this raises the default run from about 1.3 to about 3.2 minutes, and names the alternative of running them only on request. The lead kept them in the default run (T-33). | `playwright.config.ts`, `e2e/specs/engines.spec.ts` |

### Cross-browser

A compatibility reviewer compared the app in Chromium, Firefox and WebKit. The fix pass acted on its findings and a recheck crawled every built page in all three engines. All of this is on `main`. Not verified anywhere: real Safari on macOS or iOS, and the oldest supported browser versions (T-33).

| # | What was decided | Where it lives |
|---|---|---|
| A-94 | **The "browser too old" notice.** A small test loaded by `index.html` as a script file (it was inline at first; the production Content-Security-Policy blocks inline scripts), written in old-style JavaScript so that old browsers can run it, checks for two CSS features and three JavaScript features that every supported browser has. When one is missing, the page shows a full-screen notice and the app does not start. The text is fixed English. | `index.html`, `public/browser-check.js`, `src/app/startup.ts` |
| A-95 | **Touch long-press is timed by the app.** iPhones and iPads do not report a long-press as a "context menu" event, so on them the TV app's main menu gesture did nothing.<br>• A card times a touch press itself: 500 ms, cancelled by more than 10 px of movement or by any scroll. It then opens the same menu as the ⋮ button.<br>• The click that follows the release is swallowed for 500 ms across the page. Without that, it landed on the menu that had just opened and chose its first entry.<br>• A native event that arrives within 800 ms counts as the same gesture, so the menu never opens twice on Android.<br>• The recheck extended this from cards to list rows and season tabs. The fix pass report lists the server list, user circles and the people row as not converted, and the recheck does not mention them. | `src/ui/lib/useLongPress.ts`, `src/ui/cards/CardFrame.tsx`, `src/ui/overlays/ListItem.tsx` |
| A-96 | **Focus behaves the same in every engine.**<br>• Safari does not focus a button when it is clicked. The app now focuses a pressed button or link itself.<br>• A dialog or menu returns focus to what opened it: an element named by the caller, else the element pressed in the last 2 seconds, else the focused element. A press on a card's ⋮ button returns focus to the card, because the button hides again.<br>• When the keyboard is in charge, focus set by the app shows the focus ring in Firefox too.<br>• A page with nothing to focus: after keyboard navigation from the drawer, focus used to stay in the collapsed drawer. The fix pass lets the page's main area take focus. **(integration)** The repair did the same in a slightly different way (the main area is focusable only for that moment).<br>• **(stage 2)** The fix pass's version stands: the main area is always focusable by script and takes focus at once after a drawer navigation, until the page's first element shows up. From the repair's version one rule stays: the main area is never remembered as the page's last focused element. |  `src/ui/lib/inputModality.ts`, `src/app/shell/shellFocus.ts`, `src/app/AppShell.tsx` |
| A-97 | **The Menu key is handled by the app.** The app turns the keyboard's Menu key and Shift+F10 into the context-menu event itself, and drops the browser's own event if one follows within 600 ms. Reason given: WebKit, and Firefox outside Windows, do not create that event, and Mac keyboards have no Menu key. Whether the menu opens centered (keyboard, touch) or at the pointer (mouse) is now decided from the tracked input, not from details of the event that only Chromium provides. | `src/ui/lib/inputModality.ts` (`installMenuKey`), `src/ui/lib/contextMenu.ts` |
| A-98 | **Backdrop colors are computed the same way in every engine.** The colors behind Home are taken from the backdrop image. Firefox scaled the image differently and produced slightly different colors. The app now reads the full image and reduces it itself. All three engines then return identical colors on the test backdrop. The colors can differ slightly from what Chromium produced before. The reduction rule is the agent's reading of how Android does it and was not checked against a device. | `src/app/shell/extractColors.ts` |
| A-99 | **Smaller engine fixes.**<br>• Themed scrollbars: Safari before 18.2 ignores the standard properties, so matching fallback rules were added. Their look in real Safari is not verified.<br>• Layout measurements are applied one frame later, which removes an error message WebKit raised.<br>• WebKit's own clear button in the search field is hidden. | `src/theme/global.css`, `src/ui/rows/CardGrid.tsx`, `src/ui/inputs/TextField.module.css` |
| A-100 | **Engine behavior that was left alone.** Firefox logs an advisory about the virtualized grid on phones; nothing renders wrongly. Firefox keeps a card looking hovered under a menu that opened over it until the mouse moves. Playwright's Firefox and WebKit have no speech recognition, so the voice button is absent there, as intended. | - |

### The final merge

Stage 1 of the final merge joined `main` (before the fix pass) and `wave3a` on branch `integration`. Everything here is **(integration)**. The full record is `docs/final-merge-notes.md` on that branch.

| # | What was decided | Where it lives |
|---|---|---|
| A-101 | **How the conflicts were resolved.**<br>• `package.json`: the scripts of both sides. The polyfill replacement still resolves to `vendor/` (T-32).<br>• Library, filtered-collection and item pages: the real pages from `main`, with the dispatch to Live TV, photos and music added in front of the generic page (A-102).<br>• Arrow-key rules and the Back slot: A-34.<br>• `nav.slideshow` and its route note: the `wave3a` version, which can name the photo to open.<br>• Web-only strings, crawler scenes and reference pairs: the union of both sides.<br>• The placeholder page component is deleted, because no route uses it any more.<br>• Two files existed on both sides (the store for remembered audio and subtitle choices, and its helper). They did not conflict: a wave 3b builder had copied them byte for byte from `wave3a` (the first as its brief said, the second because the first needs it), so that they would merge cleanly.<br>• Generated files were regenerated, not merged by hand. | `docs/final-merge-notes.md` section 2 |
| A-102 | **Which page a library or item opens after the merge.** A library opens, in this order of checks: the Live TV view or a recordings view, then the photo pages, then the music library, else the generic library page from `main`. An item opens its music or photo page before the generic switch (A-55). The checks use the item that is already loaded, so no second request is made. | `src/features/browse/CollectionFolderPage.tsx`, `src/features/detail/MediaItemPage.tsx` |
| A-103 | **Play paths joined.**<br>• "Play all" ignored the grid's filter, because the grid and the player wrote the filter in two different spellings. The player now accepts both.<br>• An audio playlist plays in the music queue, from the playlist page and from the context menu.<br>• Stand-ins and duplicates were replaced by the shared version: the recordings grid (A-73), the dialogs without dimming (A-72, A-80), the theme-music player (A-44), the helper that hides a header below the first row (moved to the shared folder), and buttons now pass every `data-` attribute through, which a wave 4 fixer had found missing.<br>• The Discover row and button from Seerr were added to the movie, series and person pages; they show nothing while Seerr is not linked. | `src/features/playback/engine/queue.ts`, `src/features/discover/DetailDiscover.tsx`, `src/ui/buttons/Button.tsx` |
| A-104 | **Checker findings the repair rejected, with its reasons.**<br>• "Three Backs are needed to leave the player during an intro": as upstream. The first hides the controls, the second dismisses the Skip button, the third leaves.<br>• "The nested filter menu covers its parent on a phone": as upstream, which opens the second menu over the first. Both stay usable.<br>• "A server error on an old stream segment after an audio switch": not reproduced; most likely a passing server answer.<br>• "The photo album opens with nothing focused": not reproduced.<br>• "Two end-to-end assertions were loosened": both match the merged behavior and were kept. | `docs/final-merge-notes.md` section 7.2 |
| A-105 | **Decisions the repair made.**<br>• Home puts focus back on the remembered row and column when a refresh after playback removes or moves the focused card.<br>• After a user switch, the item menu's handlers no longer fall back to placeholders: a page that leaves restores only the handlers it installed itself.<br>• In the library grid, Down from a column that the short last row lacks goes to the last item, not to the letter bar.<br>• A library URL of the Live TV library or a recording folder selects that entry in the drawer.<br>• Also: A-31 (one highlight), A-32 (arrival focus), A-38 (sign-in history), A-40 (one cache entry, one tab store), A-41 (color tokens), A-45 (media info log), A-59 (chooser closes the menu), A-77 (mini player), A-78 (screensaver and music).<br>• The repair deferred two findings to the lead as product decisions. Both are now with the owner: Q-23 and Q-24. | `docs/final-merge-notes.md` section 7 |
| A-106 | **Left open after stage 1, as the notes list it.**<br>• A Live TV program card in search plays its channel; upstream opens the program dialog.<br>• The shared context menu offers no Play on a music album or artist; upstream uses a separate music menu that is not ported.<br>• The photo grid was not replaced by the library grid (Q-31).<br>• Opening a Discover URL directly highlights Home in the drawer.<br>• Two pairs of duplicate strings for "previous" and "next". (Settled in the stage 2 repair: they stay, because they carry two meanings; A-116.)<br>• Not verified: `npm ci` from a clean checkout; the crawl in all 8 themes, at laptop and tablet sizes and in a right-to-left language; that the choices from the version, audio and subtitle choosers are honored in a real playback session (code reading and shared tests only; the journey checker did observe chosen tracks and a chosen version in the playback requests); the mini player across several pages; screensaver suppression during typing; hardware HEVC (not testable headless). | `docs/final-merge-notes.md` sections 5 and 7.5 |

### Stage 2 of the final merge, its repair, and the focus fixes

Everything here is **(stage 2)**. The full record is `docs/final-merge-notes.md` sections 8 to 10. "Finding n" refers to the table of the 31 findings in section 9.1.

| # | What was decided | Where it lives |
|---|---|---|
| A-107 | **How the merge reconciled two sides that solved the same problem.** The integrator of stage 2:<br>• kept one playlist page for audio and video playlists, as upstream has one, and deleted the separate music playlist page (the brief only asked to re-apply its behavior), adding the music menu, the queue marker and the music queue to the shared page;<br>• made "Send media info log" one implementation with one toast string, and shared one log header with "Send app logs", as upstream does;<br>• fixed reduced motion at its root (transitions of 0 seconds) instead of retrying focus in the menu, because the old 0.01 ms transitions left a just-placed menu "hidden" so that it refused focus;<br>• fixed the focus restore, which was not an overlap, because a new page took the focus position of the page before it and that made the arrival-focus checks wrong;<br>• kept the looser context-menu position check of the end-to-end suite (a corner at the pointer, or clamped inside the window);<br>• let one new playback test write user data outside the suite's "writes" project (it restores the data). | `src/features/detail/playlist/PlaylistDetails.tsx`, `src/features/detail/common/mediaReport.ts`, `src/theme/global.css`, `src/app/shell/useFocusRestore.ts`; notes section 8 |
| A-108 | **The photo viewer's arrow keys are mirrored in right-to-left languages** (finding 17). Upstream reads the raw keys, so Left is "previous" in every language. The web mirrors them, because in Hebrew its on-screen arrows, its grids and its swipes are mirrored too, and Left from a photo in the album grid already goes to the next photo. The key that points at the "next" arrow goes next. The repair agent asked the lead to say if upstream's raw keys are wanted instead (Q-37). | `src/features/photos/SlideshowPage.tsx` |
| A-109 | **Finding 23 rejected on the data, not on behavior.** A checker reported that after Back, the first arrow in a library grid continued from a stale position. The library had 15 items, so the card the checker expected next does not exist. Right from the last card of a short last row goes to the nearest card on its right, in the row above, and WebKit does the same once finding 12 was fixed. Upstream's grid has no key handling of its own for this either. | `docs/final-merge-notes.md` section 9.1 |
| A-110 | **Untranslated English text is wrapped in a left-to-right isolate in right-to-left languages** (finding 18). An isolate is a pair of invisible Unicode characters that keeps a piece of text in its own direction inside a sentence of the other direction. Without it, an English fallback string inside a Hebrew interface is reordered ("5 of 15" and similar). The web-only strings have no translations yet (O-22), so the i18n setup wraps every fallback. The characters are also part of accessible names and tooltips; nothing in the app compares or sorts translated strings, and one end-to-end locator allows for them. In the source they are written as escapes, not as literal invisible characters. | `src/i18n/index.ts` |
| A-111 | **The mixed-direction text rule was extended beyond the places the finding named** (finding 6): the mini player, the guide cells, the program dialog and the genre page title, besides the music header, guide header, photo overlay and song rows. In the left-to-right guide, a Hebrew program title now starts at the cell's left edge, where the program begins, instead of at the far end of a long cell. Rejected for the photo folder title and the Now Playing lines: they are centered, so direction does not move them. | `src/features/livetv/ProgramCell.tsx`, `src/features/music/MiniPlayer.tsx` and the files named in section 9.1 |
| A-112 | **The "browser too old" test became a script file, not a hashed inline script.** The fix pass had put it inline in `index.html`, and the production Content-Security-Policy (the header that tells the browser which scripts may run) allows scripts from the app's own address only. In the container the test never ran, and every page load logged a violation. The repair agent moved it to `public/browser-check.js`, loaded before the app, rather than adding a hash of the inline script to the policy, and added a server test that keeps `index.html` free of inline scripts. Seen in the rebuilt container: no violation, and with a failing feature test the notice shows. The audit noted that in the built file the script tag comes after the app's module tag; the order of execution is still right, because the module is deferred. See also A-94. | `public/browser-check.js`, `index.html`, `server/server.test.ts` |
| A-113 | **HSTS is off in the trial command** of `docs/deploy.md` section 9. HSTS (`Strict-Transport-Security`) tells a browser to use only HTTPS for a host name. The header counts for the whole host name on every port, so a browser that saw it on the trial port would refuse plain-HTTP addresses on that name for about six months (`max-age=15552000` seconds). This goes beyond the lead's brief for that section. | `docs/deploy.md` section 9 |
| A-114 | **The additional permission on the License page reads left to right in a Hebrew interface** (`dir="auto"`), as other long English texts do. The GPL notice above it is a translated string and stays at the right edge. | `src/features/settings/LicensePage.tsx` |
| A-115 | **Test-data housekeeping.**<br>• The playlist end-to-end test waits a fixed 3 seconds before it deletes its playlist. Jellyfin writes the playlist's metadata a moment after creating it, and a delete that comes first leaves its folder behind; a later library scan lists each such folder again as an ownerless playlist (24 had gathered). The fixed wait goes against the suite's own rule of polling instead of sleeping, because there is nothing to poll for.<br>• The end-to-end global setup signs in as the throwaway server's administrator, when its credentials are configured, only to delete such leftovers older than ten minutes: only the administrator may delete an ownerless playlist.<br>• The repair agent ran one library rescan on the throwaway server to list and delete the leftovers. Turning off that server's scheduled scan was left for later (Q-40). | `e2e/global-setup.ts`, the playlist spec in `e2e/specs/` |
| A-116 | **Duplicate web-only strings** (finding 9). Nine keys were removed: the eight the checker listed, and one that repeated upstream's own "Subtitles" string. The two "previous" keys and the two "next" keys stay, because scrolling a row and the previous item of a queue are two meanings. | `src/i18n/extra/en.json` |
| A-117 | **The player's remaining-time label in Hebrew follows the locale's direction** (finding 16), as upstream does: upstream hands the label the locale's direction, inside a row that is always left to right. Whether a leading minus sign should stay on the left was not decided (Q-35). Changed on 2026-11-22: the times are clocks, left to right in every locale, so the label no longer takes the locale's direction and the minus is in front of the digits (T-60). | `src/features/playback/ui/Controller.module.css` |
| A-118 | **A test race is fixed in the test, not in the app.** The drawer test "an empty page still takes focus out of the drawer" pressed Left in the frame between the empty-state text appearing and that text taking focus, and failed about once in fifteen runs. The test now waits until the text holds focus (commit `62fe020`, by the lead). A WebKit browser process that crashed once during a long repeat run (a failed picture allocation) was not treated as an app or test problem; the same test then passed 8 of 8 times. | `e2e/specs/drawer.spec.ts` |
| A-119 | **The library grid is kept over a replace navigation.** A replace navigation changes the current history entry instead of adding one; Favorites uses it right after its first render to write its tab into the address. The grid's identity contained the history entry's key, so the grid was built twice and the focused first card was removed, leaving focus nowhere for about 25 ms (longer under load). An arrow key pressed in that gap went to the tab row. The fixer keyed the grid by the visit instead: the history key kept over replace navigations, new on every push and every Back or Forward. Scroll memory stays keyed by the history entry itself, which is what Back returns to. Recorded on the other pages built from the same parts: only the library grid had this key. As a consequence, choosing the current page's own drawer entry again kept the grid instead of rebuilding it. **Superseded in part by A-129:** since the final check every drawer choice builds the page anew; the visit key over replace navigations stands. | `src/features/browse/data/visit.ts` (`useVisitKey`), `src/features/browse/components/LibraryGrid.tsx` |
| A-120 | **Keyboard arrival from the drawer is "pending" from the moment a drawer entry is activated.** On a second visit the page's cards come from the cache and are there at once, so the page asked for its first focus before the shell had moved focus out of the drawer, was refused, and never asked again: focus stayed on the tab row on 10 of the 11 drawer pages. Now, from the keyboard activation until the shell's first look at the new page, a page may take its first focus even though focus is still in the drawer, and the shell then leaves it alone. Any key or pointer press ends the window. Three pages had their own obstacle on that path and were fixed too (the photo grid, and the two music grids in the development build only). | `src/app/shell/shellFocus.ts`, `src/app/AppShell.tsx` |
| A-121 | **What an arrow key does when nothing is focused.** Focus can be nowhere on the web (for example after a click on empty space); on TV it never is. Before, an arrow key then focused the page's first element. Upstream returns focus to the last focused child of every row and grid, so the web now does the same one level up: the element of the page that last had focus, if it is still shown and takes focus; else the page's first element; the drawer only when the page has nothing to focus. The direction of the key does not matter: the first press gives focus back, the next one moves. The floating Back button is never returned to this way. Leaving the drawer for the page now also checks that the remembered element really took focus (a button that had become disabled swallowed the key). | `src/app/shell/shellFocus.ts` (`focusPageFromNowhere`), `src/app/AppShell.tsx` |

### The TV-comparison pass

Everything here is **(parity)**: made on branch `parity`, merged into the merged app on branch `final` (T-41) and on `main` since 2026-11-18 (commit `e1b7e04`). The sources are the reports of the area agents and of the shared-kit agent, and the integrator's notes (`docs/parity-notes.md`). Most of what these agents changed are differences from upstream, which belong in [DEVIATIONS.md](DEVIATIONS.md); only the choices they made between options are listed here.

| # | What was decided | Where it lives |
|---|---|---|
| A-122 | **Compose's text trimming is opt-in per element.** Compose, the Android toolkit, trims the extra line height above the first and below the last line of a text; browsers keep it. Five area agents asked for this to be done once on the shared type classes. The shared-kit agent did it differently: three helper classes (`t-line`, `t-trim`, `t-trimBox`) and a font-height property that an element composes where it needs them. Reason given: the type classes sit on containers, buttons and texts that about 40 area files had already trimmed locally, so a global rule would trim some twice or shift them unchecked. Where a browser lacks the CSS property for trimming, the area agents chose to accept boxes a few dp taller rather than measure fonts in JavaScript. | `src/theme/global.css` |
| A-123 | **The shared-kit agent's other choices.**<br>• A basic dialog stays as wide as its content; it is 440dp only where the content fills it.<br>• The divider color is one fixed color for all themes, as upstream's Material scheme gives it (a new fixed token, `--fx-m3-outline-variant`).<br>• The watched badge keeps its half-dp black ring.<br>• An item opened directly by its address still highlights Home in the drawer.<br>• Where the evidence was thin, values were measured from the reference pictures: the fade of a disabled list row (0.48) is measured, and its focused value (0.64) is derived.<br>• It declined requests outside its folders (crawler scene lists) and passed them on. | `src/ui/overlays/Dialog.module.css`, `src/theme/tokens.css`, `src/ui/overlays/ListItem.module.css` |
| A-124 | **Choices of the area agents.**<br>• Movie detail: where the code was ambiguous, a title that wraps to two lines stays at two lines.<br>• Series detail: the series header uses the common detail-header classes instead of a copy, because the movie-detail agent was changing them at the same time.<br>• Player: the bottom dialogs may be as tall as the screen minus 16dp (before: 80 percent), as on TV, where the 8-row speed list fills 512 of 540dp.<br>• Live TV: a guide shorter than its box is centered vertically, as on TV, from 600 px width up; on phones the rows stay directly under the buttons. The agent left a note for the owner: on a tall desktop window with few channels the grid now floats in the free space, and one line of CSS switches this.<br>• Language dialog: the settings agent first kept a container around the list, which upstream lacks, and asked for confirmation. A later commit of the pass (`2a25082`) follows upstream from 720 px up (the bare list on the dimmed page) and keeps the container on phones. The later commit stands.<br>• Music: the music library now uses the shared library grid, with one saved sort, filter and view record for all its tabs, as upstream keys it by the library. The photo grid stays its own, but takes its column count by the same fluid rule as the other grids. See Q-31. | `src/features/detail/`, `src/features/playback/ui/PlayerSheet.module.css`, `src/features/livetv/GuideGrid.module.css`, `src/features/settings/LanguagePreference.tsx`, `src/features/music/MusicLibraryPage.tsx`, `src/features/photos/PhotoFolderView.tsx` |

### The early merge, the final check and repair, and the backdrop colours

Everything here is **(final)**: on `main` since 2026-11-18 (commit `e1b7e04`). The sources are `docs/final-merge-notes.md` sections 11 and 12, the integrator's report of the final check (its list of decisions for this document), and the report and verdict of the backdrop colour job. The new differences from upstream are listed in section 12.4 of the notes and belong in [DEVIATIONS.md](DEVIATIONS.md); only choices between options are listed here.

| # | What was decided | Where it lives |
|---|---|---|
| A-125 | **How the early merge resolved its 13 conflicts** (T-41's rule: the comparison pass owns the look, the repaired app the behavior).<br>• The library grid: the comparison pass's layout, but keyed by the visit (A-119), not by the history entry.<br>• The old music grid is deleted, as on `parity`; the music tabs use the shared library grid, which already covers the repair's two changes to it (first focus, the "jump to letter" label).<br>• The License page: the comparison pass's rows and the repair's additional-permission section before the list.<br>• Strings: both sides' removals stand; no removed key is used by the merged code.<br>• Where both sides fixed the same thing in their own way (the 8dp inset of mixed-direction lines in the detail header), both fixes are kept, although either alone would do. | `docs/final-merge-notes.md` sections 11.1 and 11.2 |
| A-126 | **Pivot scrolling keeps clear of the music mini player, for restored focus too.** The comparison pass scrolls a focused item to the TV's pivot; the repair keeps room at the bottom for the mini player. An item that does not fit below the pivot is aligned to the bottom of the window less the body's bottom padding (`e8a7731`). A reviewer found that a restored focus (an arrow key with nothing focused, Right out of the drawer) still used the browser's "nearest" scroll; it now goes through the same function (`e3df8a1`). The drawer's own entry focus stays "nearest", because it is inside the fixed drawer. | `src/ui/lib/bringIntoView.ts`, `src/app/shell/shellFocus.ts` |
| A-127 | **Playlist row buttons on phones.** The merge kept the comparison pass's 4dp buttons and dropped the repair's narrower phone padding (`7ebc953`). The first button's touch hit area then covered 8dp of the list item; under 600dp with a coarse pointer it now takes the 4dp gap and no more. The reviewers suggested 2dp; the fixer chose 4dp, which keeps the target as wide as the gap allows and still stops at the item's edge (`6180e80`). | `src/features/detail/playlist/PlaylistDetails.module.css` |
| A-128 | **Only the sign-in part of the comparison pass's last test fix was taken.** `b1e0f33` also made the drawer test wait for a grid that is built again when the tab page writes its tab into the address. On `final` the grid is keyed by the visit and built once, and the drawer test asserts exactly that, so that part was left out; `f27f68a` merged the commit with the drawer test as it was. | `e2e/specs/drawer.spec.ts`, `e2e/specs/signin.spec.ts` |
| A-129 | **Choosing the current page's own drawer entry builds the page anew** (finding shell-keyboard-4). A kept page asked for no first focus, so focus stayed on the tab row or the Sort button. Every drawer navigation now rebuilds the routed page. This reverses the last point of A-119. | `src/app/AppShell.tsx`, `src/app/shell/useAppStack.ts` |
| A-130 | **The queued Back key reads the router's own state.** A Back key pressed while a navigation is under way waits for it (finding shell-keyboard-7). To know that a navigation is under way, the shell reads React Router's `UNSAFE_DataRouterContext`, because `useNavigation` is one render behind. The integrator read it and left it as the fixer wrote it. Not verified in a production build: the window was measured on the development server. | `src/app/shell/useBackKey.ts` |
| A-131 | **A missing series backdrop is decided on the episode page, not in the image rules** (finding phone-touch-4). The shared-code fixer rejected a fix in the image rules, and the integrator agreed: lists that ask for primary images only do not get the field that names the nearest ancestor with a backdrop (0 of 64 episodes in the fixer's probe), so a rule there would drop backdrops that exist. The episode page has the full item and asks for no backdrop when it names none. Separately, the image rules ask for no series image when the item carries no `SeriesPrimaryImageTag`. | `src/features/detail/episode/EpisodeDetails.tsx`, `src/api/images.ts` |
| A-132 | **Grid focus fixes are local, not changes to the navigator's scoring.**<br>• Up from a grid's first row reaches the grid's own buttons before the tab row (home-browse-3): the grid and its header are one focus group on the grid root.<br>• Left from the letter column returns to the last focused card (home-browse-2): the letter column hands the key to the grid's own entry rule (`focusInto`). The beam rule was not relaxed. The integrator found the case the fixer's change missed: in a 1440x900 window the letter sat level with no card row and Left went to the nav drawer.<br>• A container marked `data-focus-scroll="none"` ends the bring-into-view walk, so moving to a pinned header no longer scrolls the page. | `src/app/spatialNav.ts`, `src/features/browse/components/LibraryGrid.tsx`, `src/features/browse/components/letterFocus.ts`, `src/ui/lib/bringIntoView.ts` |
| A-133 | **License page: Up and Down keep scrolling, Left and Right enter the rows** (finding settings-setup-4). Upstream moves through the License rows with the D-pad and scrolls the Debug page; the web keeps the scrolling model of the Debug page for both, because the License page carries long web-only texts that row-to-row focus would skip. At a scroll edge, Up and Down hand focus to a row in view. | `src/features/settings/FullPage.tsx` |
| A-134 | **"Play with transcoding" is offered when the item itself loaded**, not by the kind of error (finding playback-4). Transcoding cannot help when the request for the item failed. | `src/features/playback/playbackErrors.ts` |
| A-135 | **The photo viewer's address follows the photo with one `replace` per photo; the `start` flag stays** (finding photos-3). No new history entries are made. A held arrow key does not step through photos, so the browsers' limit on history writes is out of reach. The player's address follows the queue in the same way (playback-3). | `src/features/photos/SlideshowPage.tsx`, `src/features/playback/PlaybackPage.tsx` |
| A-136 | **Source rules for old browsers and invisible characters.** New CSS does not use `:dir()`, because the oldest supported Chrome (119) does not know it; it uses the document's `dir` attribute like the rules around it. Three older rules still use it (Part 4). **Updated by the polish round:** eight rules used it, not three; none is left, and a unit test now holds the rule (A-152). The left-to-right isolate characters around server addresses, still literal in two files, are written as `\u` escapes, as A-110 had done everywhere else. | the files named in `docs/final-merge-notes.md` section 12.3 ("Source hygiene") |
| A-137 | **Test housekeeping of the final check.**<br>• The lyric end-to-end test runs on desktop only, like the other music tests, and snapshots and restores its songs' user data.<br>• The wheel test holds a fixed 700 ms wait against the suite's rule of polling, because the defect was a timer and there is nothing to poll for.<br>• The photo test waits for the overlay to settle before it clicks: in WebKit a click within about 100 ms of opening it is lost, the same on the tree before this round, and faster than a person.<br>• The container smoke test ran with `HSTS=false`, as `docs/deploy.md` section 9 advises for trials (A-113); the header itself has its server test. | `e2e/specs/` (music, browse, photos), `docs/final-merge-notes.md` sections 12.5 and 12.6 |
| A-138 | **The lead hardened the Home row drag test after the audit.** The audit found that it needed a Home row both on screen and overflowing, which depends on the shared server's watched marks. The test now takes the first overflowing Home row wherever it is (`e1b7e04`), one of the two ways the audit suggested. | `e2e/specs/home.spec.ts` |
| A-139 | **The backdrop colours reproduce Skia's sampling exactly, not approximately** (T-45). The reduction before Palette computes the same source indices as Skia's nearest-neighbour loop, in exact integers: the 32.32 stepping of Skia's general loop, which matched 11 of 11 reference backdrops, not the 16.16 "every edge sample low" variant, which matched 6 of 11. The verifier pointed out that this choice is tied to the reference device's Skia build, and the code comment says so. Rows of a scaled width above 254 restart the column stepping, as Skia's span buffer does; this is implemented from the Skia source and cannot be checked against the references, whose working width is 150. No dependency was added. | `src/app/shell/extractColors.ts`, `extractColors.test.ts`, `extractColors.fixtures.ts` |
| A-140 | **Now Playing takes its colours from the stored backdrop image**, as the shell already did, while it still draws the window-sized rendition. The palette of a resized JPEG differs. Cost: one more image request and one full-size decode per backdrop. Kept as its own commit (`4c2cf63`), because it was outside the files the job expected to touch, so that it could be dropped. | `src/features/music/nowplaying/useNowPlayingBackdrop.ts` |
| A-141 | **The comparison scenes for the Home rows wait for the backdrop on each row**, like the reference run (200 ms, then until the app is not busy, then 300 ms per step). The app's behavior did not change; the scene had walked the rows faster than the 500 ms colour delay. The two "dynamic colours differ" notes were removed from the reference map. Kept as a separate tools-only commit (`ead7347`). | `tools/shots/tvScenes.ts`, `tools/shots/refmap.ts` |

### The polish round

Everything here is **(polish)**: made on branch `polish` and on `main` since the merge commit `f1fb308` (T-48). The source is `docs/final-merge-notes.md` section 13: the items of 13.1 (where an item was closed without a change, the reason given there), the integrator's changes of 13.2 and the decisions of 13.4. The differences from upstream that the round introduced or removed are in section 13.3 and belong in [DEVIATIONS.md](DEVIATIONS.md); only the choices between options are listed here.

| # | What was decided | Where it lives |
|---|---|---|
| A-142 | **The mini player from a page with nothing to focus: "settled" is read from the page.** Down with nothing focused enters the music mini player once the page has settled, which settles Q-41. The page counts as settled when it shows some text and nothing in it is marked `aria-busy`, not by the state of the router or the query client; the fixer surveyed 35 pages with every server answer delayed and found every loading state marked busy. A page that renders nothing at all is taken to be on its way elsewhere. The bar focus given this way is a placeholder: the page's own first focus may still replace it, as a net for a wrong guess. Up in the bar with nothing to return to puts focus on the page area, from where the arrow keys work as with nothing focused. While the page is still loading, Down is still taken and moves nothing (on windows with the drawer rail; phones leave the key to the navigator), so the stray focus that the final check fixed (shell-keyboard-1) cannot come back. | `src/app/shell/shellFocus.ts` (`pageSettled`, `focusFromNowhere`, `leaveBarToPage`), `src/app/AppShell.tsx` |
| A-143 | **The Back key's second window is closed in the shared hook, for every page.** An Escape right after opening Live TV from the drawer was lost now and then (1 of 40 cold starts). The cause was the moment after the router is through and before React shows the new page: the address is the new one, the Back rule still the old page's. The fixer closed it in `useBackKey` for every page, not for Live TV alone; a Back key in that moment is queued for the page that is about to show. The other half of the report, Escape beyond the guide's first program returning to that program first, is upstream's rule (`TvGuideGrid.kt:345-365`) and was not changed. The queued Back key of A-130, measured before on the development server only, was also checked in a production build (`vite preview`, Chromium): 20 of 20 back on the same card. | `src/app/shell/useBackKey.ts` |
| A-144 | **The held focus look ends 400 ms after a touch release, not at once.** The look that a press holds on the keyboard-focused element (`data-focus-held`) stayed when the press produced no click (a secondary or middle button, a pressed node removed before the release). It now also ends when the press ends without a click: in the next task after a mouse or pen release, at once on `contextmenu`, and 400 ms after a touch release, because a tap's click may follow the lifted finger by about 350 ms where the browser still waits for a double tap. Ending it at once would have broken the tap fix of the final check (phone-touch-1). The 400 ms rule is unit-tested only; no real touch hardware was used. | `src/ui/lib/inputModality.ts` (`installPressHold`, `TAP_CLICK_MS`) |
| A-145 | **Focus lost in a window resize: the same item first, a fallback only once the layout has settled, no page scroll after a pointer press.** The library grid builds its cards anew whenever its column count changes, so a focused card, or the card a still open dialog was opened from, lost focus in a resize (the report named only the case with a menu open). The fixer kept the grid as it is and added a recovery in the shell: focus goes back to the same item, found as on Back (its key, its link, its place); only when the re-layout has settled (1 second after the last resize event) does it fall back into the page as an arrow key with nothing focused would. The page is scrolled for it only when the keyboard acted last. The watch runs only after resize events and ends at the next key or pointer press. A dialog or menu of the kit that closes with every opener gone asks the same recovery through a handler (`setOpenersGoneHandler`). The integrator checked that a menu entry that navigates ends with the same focus with the handler on and off. Not taken up: keeping the grid's cards across a column change, and the overlays outside the kit (the photo viewer's panels, the player's sheet). | `src/app/shell/useFocusRestore.ts` (`recoverLostFocus`), `src/ui/lib/inputModality.ts` (`restoreFocusToOpeners`), `src/ui/overlays/Dialog.tsx`, `DropdownMenu.tsx`, `src/app/spatialNav.ts` (`focusFirst` without scrolling) |
| A-146 | **A pointer user's page does not move by itself** (integrator). The grids fixer made a reloaded "View more" grid bring the card that takes focus fully into view. Because the shell also puts focus back on Back whatever the input, a mouse user who clicked a card cut by the window's edge and came Back then saw the page move (from 60 to 130 px in the test). The integrator applied the rule the resize fix had chosen (A-145): the page moves only when the keyboard acted last or nothing has been pressed in this document yet (a reload, an address opened). `noInputYet()` tells the second case from the tracker's default, which is "pointer". | `src/features/home/restoredFocus.ts`, `src/features/home/pickVisibleCell.ts`, `src/ui/lib/inputModality.ts` (`noInputYet`) |
| A-147 | **Letter jump: the web keeps what the Kotlin means to do, not what the TV shows.** The TV picture of a letter jump has focus back on the card it came from. Reading `CardGrid.kt` settled it as an upstream bug: each card's focus requester is chosen inside `remember(index, item, cardWidthPx, columns)` (lines 362-375) without `focusedIndex`, so `focusOn(jumpPosition)` never moves it, and the grid's `focusRestorer` hands focus back to the last focused child. `jumpToLetter` (lines 215-231) means to focus the first item at or after the letter, which the web does; copying the bug would make a near jump undo itself. No code changed. | `src/features/browse/components/LibraryGrid.tsx` |
| A-148 | **One helper for "arrows leave a one-line text field at its edges", in the UI kit's helpers.** It settles Q-42. The rule lived twice (the search header and a copy for Add to playlist in `src/features/detail/common/`); it is now `src/ui/lib/fieldArrowExit.ts`, because it serves two features. The copy and its re-export file are gone. | `src/ui/lib/fieldArrowExit.ts`, `src/features/search/SearchHeader.tsx`, `src/features/detail/common/AddToPlaylistDialog.tsx` |
| A-149 | **Live TV: arrival focus on a direct load stays for every device that is not touch-only** (A-32), although the item asked for the keyboard only: that would have contradicted every other page and an existing test. The real difference was elsewhere: a mouse click on a tab moved focus off the clicked tab into the tab's content. Now only that exemption is keyboard-only: a tab chosen with the keyboard, or a page opened with nothing focused, hands focus to the content; a tab chosen with a pointer keeps it, as on every other tabbed page. Separately, the third tab reads "Recordings" in Hebrew because the label is the recording folder's name from the server, as upstream (`CollectionFolderLiveTv.kt:63`); not a missing translation, no change. | `src/features/livetv/tabArrival.ts`, `src/features/livetv/LiveTvView.tsx` |
| A-150 | **Series overview: reduced motion stands for Android's animator scale 0.** The overview now scrolls as the TV's column does: padded 16dp, under a delayed nested scroll that takes a third of every scroll step (`SeriesOverviewContent.kt:147-155`, `DelayedNestedScrollConnection.kt`). With `prefers-reduced-motion: reduce` the web matches the reference pictures, which were taken with animations off (two scroll frames); otherwise the animated behaviour applies, which is derived from the Compose code and not measured on a TV. The one-frame rule for Down from the episode strip onto the buttons is fitted to the reference picture (exact to 0.1dp), not derived: the code does not explain why the second frame is missing there. The rule runs for arrow-key moves only. Web addition: after a partial move the focused element is pulled whole into the viewport. | `src/features/detail/series/overviewScroll.ts`, `src/features/detail/series/SeriesOverview.tsx` |
| A-151 | **Exact text heights in every engine, not `text-box` kept for Chromium behind `@supports`.** Firefox 128 skips `text-box`, so trimmed texts were 1 to 6 px taller there and later content up to 27 px further down. The fixer moved the feature stylesheets to the kit's exact helpers (`t-line`, `t-trim`) in every engine. The price: Chromium's pictures are not pixel-identical with before; texts move by 0.25 to 1.9 px and what follows them by the running sum (up to about 5.6 px on the music header's genre line, in the integrator's measurement; the verifier measured about 100 boxes moving 1 to 4.5 px). The three screens compared with the TV pictures (settings, an album page, the server list) are as close as before or closer. The slots of `ListItem` that hold element children, and the Live TV view-options title, still use the kit's `t-trimBox`, so they keep full line boxes in Firefox 128. | the stylesheets of commit `1850f33`; `src/theme/global.css` |
| A-152 | **Mirrored details use `[dir='rtl']` selectors, never `:dir()`, and a unit test holds the rule.** Eight rules used `:dir(rtl)`, which Chrome 119 does not know (the final check had counted three, A-136). One of them had taken the working half of a selector list with it, because a browser drops a whole selector list with an unknown pseudo-class in it: the right-to-left slider thumb. Every mirrored detail is now written with the document's `dir` attribute, as a selector of its own. `tools/css-engine-baseline.test.ts` reads every stylesheet under `src` and fails on any `:dir()` and on `text-box` outside the kit helper in `src/theme/global.css`. | `tools/css-engine-baseline.test.ts`; `src/ui/inputs/Slider.module.css` and the other stylesheets of `1850f33` |
| A-153 | **The Live TV player overlay stays as spec 05 B4 decided.** It settles Q-39. The premise of the item was wrong: the TV does not show the program's times either, but ExoPlayer's position and remaining time within the stream it received, and an "Ends at" worked out from them (`PlaybackControls.kt:253-322`, `PlaybackController.kt:203-218`). A program-based overlay would not be a port, and its bar would show program time behind the knob that cannot be reached; ExoPlayer's rule over the web's transcode window of about 30 s would show "-26s" and an "Ends at" half a minute ahead. No code changed; the wording of DEVIATIONS and `docs/parity-notes.md` is to be corrected. | none (`docs/final-merge-notes.md` section 13.3) |
| A-154 | **The crawler finds controls by their names in the run's language, read from the app's own locale files.** The Hebrew crawl had 84 `prepare` warnings, because the scenes looked for English control names. `tools/shots/uiText.ts` reads `src/i18n` and applies the app's own rule for an English fallback in a right-to-left language (wrapped in a left-to-right isolate); a key the app does not have fails loudly. No data attributes were added to `src` for the crawler. The Hebrew crawl now has 0 warnings. The Home scenes also state their wait for the rows (`homeRowsLoaded`). | `tools/shots/uiText.ts`, `tools/shots/scenes.ts` |
| A-155 | **The server tier "will not be supported soon" is removed as dead code.** The web never classifies a server that way (it enforces only the hard minimum version), so the tier is gone from the type and from the server list's card status. The server card component keeps its `unsupported_future` look, which only the UI kit's gallery still shows, and the string `server_version_not_supported_future` stays in the generated locales. | `src/lib/serverVersion.ts`, `src/features/setup/ServerListPage.tsx` |
| A-156 | **Items closed without a code change, with the reason.**<br>• The Menu key on a detail page's More button, then Escape, leaving focus on `<body>` in WebKit: not reproduced in 44 WebKit runs. The More button has no context menu, Escape is Back, and `<body>` shows only while the page that Back opens is loading.<br>• The "Watch live" row missing from some Home pictures is not a Home defect: the row lists programs on air that end more than a minute after the browser's time, the test guide starts every program on the hour and half hour, and the crawler's browser clock is frozen at 20:00, so the row is empty for most of the day. Fixing the pictures needs a guide with staggered start times or a crawler clock that follows the server; neither was done, because changing the guide rewrites server data.<br>• A Home picture taken before its last row: not reproduced in 20 runs; the missing row is the "Watch live" case above. | `docs/final-merge-notes.md` section 13.1 |
| A-157 | **Test housekeeping of the polish round.**<br>• Ten end-to-end tests were added (18 runs across the projects; the suite went from 221 to 239 tests). Seven came with the fixers, each reported as failing with its fix switched off. The integrator wrote three and checked them the same way: the fix's lines switched off in the working copy, the test run, the lines put back.<br>• Two tests hold a fixed wait against the suite's rule of polling, because the defect was a timer or a late focus move with nothing to poll for: the Recommended wheel test (700 ms) and the Live TV tab test (500 ms). | `e2e/specs/`, `e2e/README.md` |

### The closing round and the touch fix

Everything here is **(closing)**. A-158 to A-162 are choices of the closing round's small-fix agent (commit `692715f`); its independent checker read the change and judged it ready to commit. A-163 to A-166 are choices of the touch fix's fixer (commit `7ad52ba`), checked by an independent verifier; the two details the lead changed before committing are T-55, and what the lead decided not to change is T-56. The source is `docs/final-merge-notes.md` section 14 and the two agents' reports. The differences from upstream that came with these commits belong in [DEVIATIONS.md](DEVIATIONS.md) (its sections 3, 6, 9 and 11).

| # | What was decided | Where it lives |
|---|---|---|
| A-158 | **Which means keeps a value in order in a right-to-left line.** A value made of digits, signs and Latin units (".25", "-1.5s", "100 Mbps") is ordered by the direction of its line, so in Hebrew and Arabic it was drawn backwards. Three means, each for one kind of slot, and no new component: `<bdi>` where a slot holds either a translated text or a value (the rows of the player's sheets, a settings slider's summary), so the slot takes its direction from its content; `dir="ltr"` on an element whose content is always a value (the subtitle delay value and its step buttons, the debug overlay); the isolate characters U+2066 and U+2069, written as escapes, only for a plain string that has no element of its own (the two shortcut toasts, through `ltrValue()`). They follow what the License page, the Seerr request options and the setup helpers already did. The checker's note: `ltrValue` sits beside an older `isolate` helper in the Discover code and inline isolates in `src/i18n/index.ts` and the setup helpers; one shared helper could serve them all and was not needed now. | `src/features/playback/ui/PlaybackDialogs.tsx` (`Line`), `SubtitleDelayDialog.tsx`, `DebugOverlay.tsx`, `text.ts` (`ltrValue`), `src/features/settings/SliderPreference.tsx` |
| A-159 | **Every row of the player's sheets is wrapped, and two neighbours were fixed without being asked for.** The component that draws a sheet row's headline and supporting line wraps its text for every row, not only for the rows known to hold a value, so a track title from the server also takes its direction from its content; nothing visible changed with the test data. The task named the speed list; the agent's scan of all 1,236 value strings found the same defect in the bitrate list, the delay dialog and the slider summaries, and beside them in the debug overlay and the two shortcut toasts, each a one-line change, and fixed those too. | `src/features/playback/ui/PlaybackDialogs.tsx`, `DebugOverlay.tsx`, `src/features/playback/PlayerView.tsx` |
| A-160 | **The player's time codes are left as they are.** In Hebrew a remaining time is drawn with its minus to the right of the number. The stylesheet gives each time text the locale's direction on purpose, citing upstream (`Controller.module.css`, `PlaybackControls.kt:297-322`), so the agent did not change it and handed it to the lead, who leaves it to the owner (Q-35). Changed on 2026-11-22: the times are clocks, left to right in every locale, so the minus is in front of the digits (T-60). | `src/features/playback/ui/Controller.module.css` (unchanged) |
| A-161 | **Three points closed without a code change, each with its cause.**<br>• The one 404 of the production smoke run is the app's probe for the optional Wholphin server plugin (`GET /wholphin/public`), answered 404 by a server without the plugin. The TV app sends the same request on every user switch; the web asks less often. A browser logs every 404, and the plugin's presence has no other signal, so the line stays; the end-to-end guard already allows it.<br>• The "ResizeObserver loop completed with undelivered notifications" message comes from the list library's own row observer, which renders synchronously when a measured row comes with a scroll correction; it shows only when a scrolled grid is resized in several steps, existed before the polish round and has no visible effect. One library option (measuring a frame later) removed it in 32 Firefox rounds and was put back: it delays every row measurement in every grid and was not run through the suite. Not tried: switching the library's synchronous render off, or not logging this message.<br>• The three overlays outside the kit do not need the "openers gone" handling: two keep their opener through resizes, and the other cases close onto the page body, which is the idle state of the full-screen viewer and player by design. The shell's handler must not be used there: it would put focus on a control of a page whose keys act without focus, so Enter would press that control. | `docs/final-merge-notes.md` section 14.1; `src/features/home/model/homeSettings.ts`, `src/ui/rows/CardGrid.tsx`, `e2e/fixtures/guard.ts` (all unchanged) |
| A-162 | **Tests of the closing round.**<br>• Six unit tests assert the markup that is absent without the fix; two end-to-end tests assert the order in which the characters are drawn, through a new fixture helper, `app.drawnText(locator)`, in Chromium, Firefox and WebKit (the suite went from 239 to 245 tests). Both fail in all three engines with the fix switched off.<br>• The player test plays for about a second without the `@writes` tag, like the existing engines test: each engine pauses an item of its own that no other test plays, and stops below 5 % of the runtime, so the server keeps neither a resume point nor a played mark; the fixture restores anyway.<br>• One exception to the page guard inside that test: Firefox ends the download of a paused direct-play file itself and reports it as a failed request. | `src/features/playback/ui/rtlValues.test.tsx`, `e2e/specs/playback-engines.spec.ts`, `e2e/specs/settings.spec.ts`, `e2e/fixtures/app.ts` |
| A-163 | **A slider under a finger: the page scrolls, a sideways drag is absolute, and the browser's decision wins.**<br>• The slider lets the browser pan up and down (`touch-action: pan-y pinch-zoom`, not bare `pan-y`, so a two-finger zoom that starts on a slider still works) and does nothing when a finger lands.<br>• One distance decides, 10 dp (`TOUCH_SLOP_DP`, through `dp()`): at least Android's 8 dp and about iOS's 10 pt, so the browser has normally decided whether it pans before the slider reacts.<br>• The direction is locked once decided: a gesture that began as a scroll never becomes a drag, even where nothing can scroll and no cancel comes.<br>• The drag is absolute, not relative: the thumb goes under the finger. A relative drag cannot reach the far end from a finger that started beside the thumb, and absolute matches the mouse, the tap and the browsers' own range input.<br>• A gesture the browser takes back after a drag began restores the value the slider had, so "the browser took the gesture" always means nothing changed.<br>• A pen is treated like a finger; no reason against it was found. Mouse and keyboard are unchanged. | `src/ui/inputs/Slider.tsx`, `Slider.module.css`, `src/ui/lib/touchIntent.ts` |
| A-164 | **The reorder handle: rest to pick up.** Reordering is itself an up-and-down drag, so direction cannot tell it from a scroll. With a finger or pen the handle lets the list pan, and resting on it within the 10 dp slop picks the row up, shown by the existing dragging look; the mouse still picks up on press. The fixer chose 250 ms; the lead made it 400 ms (T-55). Because `touch-action` cannot change during a gesture, a non-passive `touchmove` listener on the handle refuses the pan once the row is held, and the browser's long-press menu is suppressed while it is. The price the fixer named: a finger that drags a handle at once now scrolls, and nothing on screen says to rest first; if the owner prefers the old immediate pick-up, this is the one change to revert. | `src/features/home/settings/RowListPage.tsx`, `HomeSettings.module.css` |
| A-165 | **What the sweep left alone.** The fixer read every `touch-action` rule and every pointer or touch handler in `src`. Left unchanged, each with its reason: the player's and the music page's seek bars (their surroundings do not scroll, and a scrub commits only on release); the player's volume slider (it opens on mouse hover only); the photo viewer's stage (pan, zoom and swipe are its own gestures); the guide grid (it is the scroller); the mouse-only row drag; the long press (movement or any scroll cancels it; its 10 px tolerance is a bare number, not through `dp()`). Seen and recorded for the later touch work, not changed: a dialog's or player sheet's backdrop dismisses when a finger lands on it, so a finger beside the panel closes it; and on Home a scroll that starts on a card makes that card the highlighted one, so the header and backdrop switch. | `docs/final-merge-notes.md` sections 14.1 and 14.7 |
| A-166 | **Tests of the touch fix.**<br>• Real touch only where the browser can be sent one: a new fixture helper, `app.touchDrag(from, to, { steps, holdMs })`, sends a one-finger gesture through Chromium's debugging protocol, so the browser itself decides between panning and handing the events to the page. WebKit and Firefox have no such channel; there the test dispatches touch pointer events on the element and asserts the computed `touch-action`, and allows one page error, because a dispatched pointer cannot be captured.<br>• Three end-to-end tests where one was asked for (five runs across projects; the suite went from 245 to 250), because the handle fix and the other engines had no cover otherwise. All five runs fail on the code before the fix.<br>• The handle test holds a fixed rest, against the suite's rule of polling, because the pick-up is a timer.<br>• 28 unit tests: 5 for the gesture reading, 23 for the slider (the touch block runs for a finger and for a pen); 16 of the 23 fail against the old slider, the other 7 are the mouse, keyboard, right-to-left and disabled cases. | `e2e/fixtures/app.ts`, `e2e/specs/settings.spec.ts`, `e2e/specs/home-settings.spec.ts`, `src/ui/inputs/Slider.test.tsx`, `src/ui/lib/touchIntent.test.ts` |

---

## Part 4: Open decisions

These wait on the owner or on the lead. The numbers of earlier questions are kept. A question that has been settled is no longer in the first two tables; the third table says where it was settled.

### Waiting on the owner

| # | Question | Notes |
|---|---|---|
| Q-1 | How and when does Wholphin Web go live behind a reverse proxy? | O-8 says "decide later". `docs/deploy.md` (on `main` since 2026-11-18) gives a Caddy example (subdomain or own port, proxying to the container). The container has been built and run locally against the throwaway test server (T-11). Nobody has run it behind the live proxy, and nothing touches the live Caddy. **Updated 2026-11-18:** the owner decided how it starts: a trial on a second port, next to what runs today, before it replaces anything (O-21; `docs/deploy.md` section 9). The timing is still the owner's call: the trial waits for the owner's go. The integrator of the final check smoke-tested the image built from the final tree in a local container (T-44); that was not the trial. **Updated later on 2026-11-18:** the owner gave the go, and the trial ran under a sub-domain (O-26, T-52, T-53). The owner tested it and keeps it for now (O-27, O-29). Open: whether and when it becomes permanent, and when the app replaces or joins what users use today. **Updated 2026-11-24:** the trial still runs on the same temporary route and gets each newer build after the owner's yes for it (O-45, T-64); on this day it runs the build of `509db33`. Still open: whether the route becomes permanent. |
| Q-2 | Should the GitHub repository be renamed? | The name was left unchanged on purpose; only the description was edited. |
| Q-8 | Keep or remove the web-only season-status list on Seerr TV pages? (owner or lead) | Upstream has the equivalent row commented out. The builder declared it a web addition; not verified how much code removing it takes. |
| Q-15 | With a preset server, anyone who opens the app sees the server's public user list. Is that acceptable? | The deploy agent suggests hiding users from the login screen in Jellyfin's own settings. Nothing is changed on the real server. **Updated 2026-11-23:** a user whom that list shows without a password is now signed in by one click (O-41, T-71). It gives no new access, because the login dialog accepted an empty password before, but it is one step shorter for anyone who opens the app. |
| Q-23 | Should the web-only strings be translated, by whom, and into which languages? | About 190 strings (183 counted at `c358a52`) exist only in English (T-9), so they stay English in the 41 other languages. A checker of the final merge saw this in the Hebrew interface. No translation source exists for them. Deferred by the repair. **Updated 2026-11-18:** the owner wants them translated into the popular languages upstream supports, right-to-left ones included, and has put it on hold (O-22). Open: when, by whom, and the full list of languages. Until then, English fallback text in right-to-left languages is isolated so that it reads in order (A-110). |
| Q-24 | Which rule should hide a page's header: scrolling or focus? | Two rules exist. Library browsing (and the recordings grid that now uses it) hides the tab row once the content is scrolled (A-51). Music, Discover, the Live TV guide and photos hide it only while keyboard focus is below the first row (A-70). Choosing one changes how the other features behave. Deferred by the repair. Still open on 2026-11-18: stage 2 and its repair left it as it was, and the TV-comparison pass recorded it as an open owner decision and did not change either rule (its list layout follows the scroll rule, `docs/parity-notes.md` section 5). The final check and repair did not change either rule, nor did the polish round. Open. |
| Q-26 | What should happen with the pull requests Dependabot opens? | Dependabot was configured together with the CI files (A-91). From the lead's notes; the agent reports do not cover the pull requests themselves. |
| Q-37 | Keep the photo viewer's mirrored arrow keys in right-to-left languages? (owner or lead) | The repair kept them mirrored on purpose, against upstream's raw keys, and asked the lead to say if upstream's behavior is wanted instead (A-108). No answer is recorded. |
| Q-38 | Should the Live TV guide float in the middle of a tall desktop window? (owner) | The comparison pass applied the TV rule (a guide shorter than its box is centered vertically) from 600 px width up, and left a note for the owner: with few channels on a tall window the grid floats in the free space; one line of CSS turns it off (A-124). On `main` since 2026-11-18; no answer is recorded. |
| Q-44 | What form do the defaults of a deployment take? (owner and lead) | The owner wants the owner of a deployment to set the defaults for all its users; the first example is the default interface language (O-31, O-36). Nothing is built. The lead's idea, which is not agreed: a setting of the deployment served through `/config.json` (T-12), not a fork of the code. Open: which settings can get such a default, where it is set, and how it meets a choice a user has already made. |

### Waiting on the lead

Most of these were deferred by fixer agents with a recorded reason. The follow-up polish round for the open items of `docs/final-merge-notes.md` section 12.7 and the audit's minor points (T-44) has run and landed (T-48); it settled Q-39, Q-41 and Q-42 (see the third table). What it left open (section 13.7 of the notes) is defects and checks rather than choices, so it is tracked in [STATUS.md](STATUS.md), not here. The closing round then took four of those points: one is fixed, three are closed with their cause (A-158 to A-161). One task for the lead came out of the clean-up of that day and is not a question: capturing the Android TV reference pictures again before the next comparison work (T-57). On 2026-11-24 more tasks were owed that are not questions either: a privacy sweep and the next public release (done the same day, O-47, T-58), the slow checks that the fast path postponed (they ran once before that release, T-63; a second whole run after their repairs is still owed), and the items the owner listed for later (Settings navigation and categories, since done: O-48, T-77; a better sign-in and welcome page, the defaults of a deployment (Q-44), microphone search at low priority, then phone and touch polish). [STATUS.md](STATUS.md) tracks them.

| # | Question | Notes |
|---|---|---|
| Q-5 | Should Home wait for all rows and refresh on every visit, as upstream does? | Deferred by the Home fixer (A-21). |
| Q-6 | Should signing out or switching the Jellyfin user also sign out of Seerr? | The Seerr cookie is shared by all Jellyfin users of a browser. Clearing it would sign out every other linked user on that browser. The worst cross-user case already shows "session expired". |
| Q-7 | Where should a Seerr API key live: tab only (current), memory only, or not offered? | Deferred by the Seerr fixer. |
| Q-9 | Should `TRUST_PROXY` default to off? | It is on because a reverse proxy is in front, and Secure cookies need it. The risk is documented for direct exposure. |
| Q-10 | Should the app reload itself when a redeploy removed the code chunk it needs? | Deferred by the deploy fixer. Today it shows the error screen. |
| Q-14 | The crawler cannot show a keyboard-style focus highlight on touch screenshots. | A design choice for screenshots only. |
| Q-16 | Should PINs be hashed instead of stored as plain text? | Upstream stores them as plain text. The spec suggested hashing, and the settings agent kept plain text so setup and settings compare the same way. |
| Q-18 | CLAUDE.md says preferences are "persisted per user", but the code stores most per browser (T-15). | Either update CLAUDE.md or change the generator. |
| Q-20 | Upstream's companion Jellyfin plugin features (a server-provided Seerr address, server-side home settings) are not ported. | The web gets Seerr only through its own proxy. Plugin-based home settings were not tested (that needs a server with the plugin). Home's probe for the plugin is answered "not found" in the tests, which they treat as expected. The closing round traced the one 404 line in the console of a production smoke run to this probe (A-161). |
| Q-27 | Re-check `npm audit` when a fixed release of `picomatch` exists. | T-35. |
| Q-28 | Convert the existing files to Unix line endings in one commit? | `.gitattributes` now asks for Unix line endings (A-91). The CI builder left the one-time conversion to the lead: as its own commit, at a quiet moment, because branches that have not merged it would get whole-file conflicts. The git history shows no such commit yet. |
| Q-29 | What is the policy for the remaining lint warnings? | The linter passes with warnings and no errors: 20 on `main` after the fix pass and 26 on `integration`, as reported; 25 after the stage 2 repair and after the focus fixes (`docs/final-merge-notes.md` sections 9.5 and 10.7); 26 on branch `parity` at its end; 25 after the early merge and after the final check and repair (sections 11.3 and 12.6), and on `main` after the landing as the lead reports; 23 on the final tree of the polish round, the same 23 as on `3b1dd7b`, linted side by side (`docs/final-merge-notes.md` section 13.6). No policy has been set. Most are advisories from the React compiler rules, plus unused variables in the tools. The wave 3b integrator asked for a policy. |
| Q-30 | Add the fixed colors to the spec file? | The fixed-color tokens exist only in the generator, not in `docs/spec/design-tokens.json` (A-41). |
| Q-31 | Should the photo grid and the music grid be replaced by the shared library grid? | Both were built as their own grids in wave 4 (A-79, A-85). The final merge replaced only the recordings grid (A-73). The music grid lacks filter, the full view options and the random-item button. **Updated 2026-11-18:** on branch `parity` the music library uses the shared library grid and its own grid is removed; the photo grid stays its own, with the shared column rule (A-124). **Updated after the landing:** the music part is settled and on `main` since 2026-11-18 (commit `e1b7e04`). Open for the photo grid only. It also keeps its own letter column; whether Left from a letter that is level with no photo row ends in the nav drawer there, as it did in the library grid before A-132, was not looked at (`docs/final-merge-notes.md` section 12.7). **Updated by the polish round:** it did (27 of 27 letters of a test library at 1440 and 1920 px wide); the photo grid now follows the library grid's rule, so an arrow key entering it, Left from any letter included, returns to the card focused last (`db09814`). Right from the photo grid into its letter column still goes by geometry, where the library grid lands on the current letter (section 13.7). |
| Q-32 | Give the shell a rule for bars below the page, in place of the mini player's own key handler? | A-77. |
| Q-33 | Remove the Docker images the project built locally? | The wave 4 gate and the final merge each kept one image as a build cache. The wave 4 report gives about 257 MB for its image. After the stage 2 repair one image is left, `wholphin-web:latest` (258 MB); the other project images and the superseded builds were removed (`docs/final-merge-notes.md` section 9.5). The integrator of the final check rebuilt `wholphin-web:latest` from the final tree (258 MB) and smoke-tested it; it is still the only image of this project (section 12.6). No Docker build was run in the polish round (section 13.7). **Updated later on 2026-11-18:** the lead rebuilt `wholphin-web:latest` from `main` three times after the landing: from `3b1dd7b` (checked with plain requests), from `c358a52` before the trial started, and from `7ad52ba` (258 MB) after the touch fix. The last one is the image the trial used, so it is not a leftover; it was smoke-tested through the reverse proxy (T-53; [STATUS.md](STATUS.md) section 4.1). The question comes back only if the trial is removed. The Docker leftovers of earlier attempts are a separate matter, settled by O-23. **Updated 2026-11-24:** the image is built anew for every go-live, and the one before it is kept under a rollback tag on purpose (T-64). |
| Q-36 | Real Safari, on macOS and on iPhone or iPad, has never been tested. | Every WebKit check (the cross-engine recheck, stage 2, its repair, the focus fixes) used Playwright's WebKit build on Windows, which, for example, has no MediaSource and no native HLS. No real Safari exists on the machine. See T-33. **Updated after the landing:** the final check and repair also used only Playwright's WebKit build and touch profiles (`docs/final-merge-notes.md` section 12.7: real Safari, real iOS and real touch hardware not verified). The backdrop colour job names Safari on Apple hardware as a browser whose JPEG decoder might differ from Android's on a few pixels and so give other backdrop colours (T-45); not testable on this machine. The polish round also used only Playwright's engines; its 400 ms touch rule (A-144) is unit-tested only. **Updated later on 2026-11-18:** one phone is the first real touch device that opened the app (O-29); which browser it runs is not recorded. The touch fix that followed (A-163, A-164) was tested with real touch gestures in Chromium only; in Playwright's WebKit and Firefox only its handlers could be exercised, and the reorder handle's pick-up on iOS is untested. |
| Q-40 | Turn off the throwaway test server's scheduled library scan, and clear its old sessions? | The scan relists leftover test playlists; with the 3-second wait and the clean-up in the global setup that should be rare (A-115), but the scan still exists and belongs to `tools/testserver`. The audit also counted about 950 sign-in sessions of the test account on that server, collected from test runs; harmless there, but the number grows with every run. **Updated after the landing:** before the last gate the lead reset the server to its seed (`npm run ts:reset`, T-46), which started its user data, sessions included, from the seed again. Not recorded: whether the scheduled scan is still on after the reset. The scan question and a rule for clearing sessions stay open. **Updated after the polish round:** the lead reset and provisioned the server once more before the final runs (T-49), because the round's crawls had moved its data. |

### Settled since the first version of this document

| # | Question | How it was settled |
|---|---|---|
| Q-4 | License conflict: the GPL-3.0 `rvfc-polyfill` under JASSUB. | Replaced by the project's own stand-in. See T-32. |
| Q-11 | `/license` served the repository's LICENSE file in the Windows dev server. | A dev-server plugin, on branch integration. See A-43. |
| Q-12 | The dev-server file-watch rule turned off live reload inside a worktree. | The rule was narrowed, on branch integration (on `main` since 2026-11-18). See A-49. |
| Q-13 | Seed the throwaway test server so skipped crawler scenes have data? | Yes for resume points and a folders library (A-46). No for recordings: seeding them filled the disk, and it is now forbidden (T-30). |
| Q-17 | The double focus ring. | One input owns the highlight at a time. Fixed on `main`; the Home case reaches `integration` with the fix pass. See A-31. (Stage 2 merged it on 2026-11-17.) |
| Q-19 | Two nav-drawer pin stores. | One store since `main` was merged into `wave3a`; the settings row opens the dialog from `main`. See A-42. |
| Q-21 | Theme music "Full" volume: 0.75 or 1.0? | 0.75. See A-44. |
| Q-22 | Are Apache-2.0 components acceptable inside a GPL-2.0-only project? (hls.js, abslink and the Material icon shapes; the merge notes had recorded that the Free Software Foundation lists Apache-2.0 as incompatible with version 2 of the GPL.) | Settled by the owner on 2026-11-18: the libraries stay, and `LICENSE-EXCEPTION.md` adds a written permission to combine the project with Apache-2.0 libraries. Replacing them was rejected. See O-19. |
| Q-39 | Compare the Live TV player overlay with upstream? (It differed from the TV picture: an "Ends at" line, a plain seek track with position and remaining time instead of a "Live" chip.) | Settled by the polish round: the TV does not show the program's times either, only ExoPlayer's numbers for the stream it received, so the recorded deviation (spec 05 B4) stands and no code changed. See A-153. |
| Q-41 | With the music mini player showing, should Down on an empty, failed or still-loading page reach the bar? | Settled by the polish round: Down reaches the bar once the page has settled (some text shown, nothing marked busy); while the page is still loading the key is still taken. See A-142. |
| Q-42 | Make one shared helper for "arrows leave a one-line text field at its edges"? | Settled by the polish round: one helper, `src/ui/lib/fieldArrowExit.ts`, used by the search page and Add to playlist. See A-148. |
| Q-25 | Should old Docker leftovers on the development machine be removed? | Settled by the owner on 2026-11-18: yes. The lead deleted these leftovers of the project and touched nothing else. The question used to say the leftovers had nothing to do with this project; the lead's account says they came from earlier attempts at this project. See O-23. |
| Q-3 | When does the repository go public? | Settled by the owner on 2026-11-18: after two last requests and a privacy sweep, as a clean copy. A new public repository holds the cleaned tree as one commit, and the existing repository stays private with the full history. Published the same day. See O-33, O-35 and T-58. Not recorded: whether the three GitHub settings the question named for that moment (private vulnerability reporting, Dependabot alerts, branch protection that requires the CI check) were switched on in the public repository. |
| Q-34 | Where should the web-only volume control sit in the player, and with which icon? | Settled on 2026-11-18, on the owner's request: the volume control keeps its speaker, and the audio-track button is the Material "audiotrack" music note (commit `6c14670`). The lead chose the icon and the owner approved it. See O-32. Where the control sits changed later with the player's layout: it is in the left group of the strip (T-60). |
| Q-35 | Is the minus sign of the player's remaining-time label in the right place in Hebrew? | Settled by the player round of 2026-11-22 (commit `c2316a4`): the times are clocks, written left to right in every locale, so the minus stands in front of the digits in Hebrew and Arabic too. It came with the time format the owner chose (O-36); no word of the owner about the minus itself is recorded. See T-60. This replaces what A-160 had left as it was. |
| Q-43 | Does the finished desktop version include the features that are not built? (Remote control from another device, the music library tabs' filter and full view options, Play on an album or artist from the shared menu, image subtitles drawn in the browser.) | Answered by the owner on 2026-11-18: they do not block "finished". Remote control is "nice to have"; the music extras do not matter as long as music works; image subtitles in the browser were left out on the lead's recommendation. PGS subtitles were built the same day after all, with the direct-play work (T-59). See O-30. |

---

## Sources

This document was written from:

- the repository: `CLAUDE.md`, `package.json`, `vite.config.ts`, `.gitignore`, `README.md`, `src/` (files cited above), `tools/` (the token generator, `quiet-playwright.mjs`, `low-priority.ps1`, the test-server scripts), `docs/spec/01-design-system.md` and the git log of all branches;
- branch `integration`: `docs/final-merge-notes.md`, `docs/wave3a-merge-notes.md`, `docs/deploy.md`, and the files cited above as being on that branch;
- the agent log archive in `.agent-logs/` (git-ignored): the wave 1 agents' briefs and reports, and the results and scripts of these workflows: spec audit, wave 2, wave 3a, test data and reference shots, wave 3b, the end-to-end suite with CI and the compatibility review, wave 4, the fix pass, and stage 1 of the final merge;
- the lead's notes, for the owner's decisions and instructions, the incidents behind T-27 to T-32, and the chronology.

The update of 2026-11-18 added:

- `docs/final-merge-notes.md` sections 8 to 10 on branch `integration`, and `LICENSE-EXCEPTION.md`, `docs/deploy.md` section 9, `tools/testserver/guide.mjs` and `e2e/global-setup.ts`;
- the results of the workflows of stage 2 (the merge and its three checkers), of the finished repair and its audit, of the focus-race fix and its verifier, and of the TV-comparison pass (its first stage, and the checkers, fixers and shared-kit step of the resumed run), together with the scripts and the model each agent ran on;
- the brief of the merge of the comparison pass (T-41), which was still running then;
- the git log and reflog of `main`, `integration`, `parity` and `final`;
- the lead's account of the owner's decisions of 2026-11-18 (O-19 to O-25) and of the usage-limit events (T-37), which are in no file.

The update after the landing (2026-11-18, afternoon) added:

- `docs/parity-notes.md`, `docs/final-merge-notes.md` sections 11 and 12, `e2e/README.md` and `tools/testserver/setup.mjs`;
- the results of the workflows of the comparison pass's final round, the early merge and its reviewers, the final check and repair (checkers, fixers, integrator, audit, and the model each agent ran on), and the backdrop colour job (its report and its verifier's verdict);
- the git log and the reflog of `main` (the fast-forward to `final`);
- the lead's account of the order of events, the server reset and the owner's instruction on parallel agents.

The update after the polish round (2026-11-18) added:

- `docs/final-merge-notes.md` section 13 and the code on `main` at `c358a52` for the entries A-142 to A-157 (each file named there was read);
- the git log of `main` (the merge commit `f1fb308` and the test commit `c358a52`);
- the lead's account of the landing, the server reset and the three final end-to-end runs (T-48 to T-51).

The update after the closing round and the first owner test (2026-11-18) added:

- the final reports of the closing round's small-fix agent and its checker and of the touch fix's fixer and its verifier, and the code on `main` at `7ad52ba` for the entries A-158 to A-166 (the files named there were read);
- the git log of `main` (`692715f`, `7ad52ba`) and the list of CI runs on GitHub;
- the lead's account of the owner's later decisions of that day (O-26 to O-29), of the two attempts of the trial (T-52, T-53), of the changes made before the touch fix was committed (T-55) and of the clean-up and its accident (T-57). The trial and the owner's words are in no file. Details of the setup the trial ran on are left out on purpose.

The update of 2026-11-24 (the first public release and the maintenance rounds) added:

- the git log of `main` from `7ad52ba` to `509db33`, whose commit messages the lead wrote, and the code on `main` at `509db33` for the entries T-59 to T-61 and T-65 to T-75 (the files named there were read);
- the index of the agent log archive for the jobs of 2026-11-18 and 2026-11-22 (which agents each job had), and the notes of an unfinished documentation update of 2026-11-18 for details of the player layout and the direct-play work;
- the lead's account of the owner's decisions and words (O-30 to O-69), of the publication and the second and third releases (T-58, T-83), of the new order of Settings (T-77), of the subtitle fix, the mouse on the episode strip, the language list and the code map (T-78 to T-82), of the review of the Settings panel (T-61), of the working rules T-62 to T-64, and of the state on 2026-11-24. None of these is in a file. Where a number of agents or a count of a test run was not recorded, the entry says so and gives none.

The items that the earlier update could not yet record (the comparison pass's notes, section 11 of the final merge notes, the outcome of T-41) are now in T-40, T-41 and T-43. The result of the lead's last full end-to-end run is in [STATUS.md](STATUS.md), not here.

The update of 2026-11-24 for phase 40 added:

- the git log of `main` from `162b44d` to `e6dece7`, with the code and the tests in the commits `0daae7e`, `7b000ca`, `93e5bf4` and `e6dece7` for T-84 to T-86, and the documents `docs/spec/admin/*.md` for O-56 to O-58;
- the git log of `main` from `f1b1e56` to `5734cae`, the code in `5734cae` for T-88 and T-89, and `.claude/agents/playback.md`;
- the lead's account of the owner's words (O-65 to O-69), of the announcement research, of the privacy sweep and the checks of the fourth release (T-90), of the measurements before and after the subtitle change, of the cause of the next-episode bug and of the check numbers, and of the owner's rules for the lead's work (O-59, T-87). None of these is in a file.

Where the logs and the notes differ, the logs were followed for numbers. Counts of tests, pictures and findings are given as the reports state them. "Verified" is used only where a report says something was run and observed; everything else is marked as reported or not verified.
