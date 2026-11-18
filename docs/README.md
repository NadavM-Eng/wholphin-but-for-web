# Wholphin Web documentation

The front door to the project's documentation: what the project is, where it stands, and in what order to read the rest.

Last updated: 2026-11-18

## What this project is

Wholphin Web is an unofficial web rebuild of Wholphin, an Android TV client for the Jellyfin media server ([github.com/damontecres/Wholphin](https://github.com/damontecres/Wholphin), release v1.1.1, upstream commit `8dcf189`). The goal is the same look and the same features as the TV app, in a browser: desktop first, but also tablets and phones, driven by mouse, keyboard or touch, with a layout that fills the window instead of a fixed TV screen. The scope includes the TV app's Seerr integration (Seerr is the request manager people use to ask for titles that are not in the library yet) and video playback inside the browser, letting Jellyfin remux or transcode only when the browser cannot play a file directly. Like upstream it is licensed under version 2 of the GNU General Public License (GPL-2.0-only), with an additional permission for three Apache-2.0 components in the root file [LICENSE-EXCEPTION.md](../LICENSE-EXCEPTION.md), and it is not affiliated with the Wholphin author or with Jellyfin. Technically it is a React and TypeScript single-page app plus a small server, shipped as a Docker image, that serves the app and forwards Seerr requests.

The owner, who runs a Jellyfin server and shares it with other people, asked the lead (an AI orchestrator) to build it with many AI agents and to document everything for a review at the end. The lead had the Kotlin source turned into written behavior specs, had those specs audited claim by claim, wrote the working agreement every agent follows, and then ran the build in waves: builders, independent reviewers, fixers and an integration or gate step for each part. Later waves ran side by side on separate branches, which a dedicated agent then merged, independent checkers examined and a repair agent fixed. These documents were written from the repository and from the agents' own reports.

**Current state:** every planned feature is built, and all of it is on `main` at commit `7ad52ba` (2026-11-18). The final merge brought branch `wave3a` (playback, settings, Seerr, the production server, Live TV, music, photos and the screensaver) and `main` (sign-in, the shell, Home, browsing, detail pages, search, the end-to-end suite and the fix pass) together on branch `integration` in two stages, each examined by independent checkers and repaired, followed by focus fixes after the audit (`main` was moved to `integration`, commit `c14b168`, on 2026-11-18). A separate pass then compared every screen with 244 pictures of the TV app (the TV-comparison pass, branch `parity`). On branch `final` that pass was merged into the app, with the rule that the comparison pass decides how things look and the repaired app decides how they behave; thirteen independent checkers examined the result from different angles, area fixers repaired the 47 findings, an integrator ran every gate, and an independent audit found it ready to land. A last job made the dynamic backdrop colors match the TV (branch `colors`, merged into `final`). On 2026-11-18 at 13:35 local time the lead moved `main` forward to `final` without a merge commit. A polish round then closed most of the points that were still open (six fixers side by side, an integrator and an independent verifier, on branch `polish`); the lead merged it into `main` (merge commit `f1fb308`), corrected one end-to-end test (`c358a52`) and pushed. A closing round the same day brought the documents up to date, retook the README's screenshots and fixed how numbers and units are drawn in right-to-left languages (`692715f`). The owner then gave the go for a trial behind their own reverse proxy, opened the app on a phone and reported that everything works; the one touch problem the owner named, a scroll that starts on a slider, was fixed at once (`7ad52ba`). On `main` the 776 unit tests and all 250 end-to-end tests pass, and the CI run on GitHub succeeded. The app runs as a trial in a container built from `7ad52ba`. The branches `integration`, `parity`, `final`, `colors`, `polish`, `e2e` and `wave3a` were all contained in `main` and are deleted locally, with their worktrees; three old backup branches remain on GitHub for the owner to delete. The owner's order of work from here: the desktop browser version flawless first, phone and touch after. [STATUS.md](STATUS.md) has the details, the gates, the results of the last end-to-end runs and what is still open.

**How current each document is.** Every document in the set was brought up to the landed state on 2026-11-18; the last pass of that day brings them to `main` at `7ad52ba`, after the closing round, the first owner test and the touch fix.

- [ARCHITECTURE.md](ARCHITECTURE.md) and [TOOLING.md](TOOLING.md) describe the app and its tools as they are on `main`, without branch labels. Counts in them (tests, scenes, preference keys, strings) are snapshots.
- [PROJECT-LOG.md](PROJECT-LOG.md), [DECISIONS.md](DECISIONS.md) and [DEVIATIONS.md](DEVIATIONS.md) include the TV-comparison pass, its merge into the app, the final check and repair, the backdrop color fix, the landing, the polish round, the closing round, the trial behind a reverse proxy and the touch fix.
- [STATUS.md](STATUS.md) describes the app on `main`, including the TV-comparison pass, the polish round and the two commits after it, and what the owner has tested.
- [parity-notes.md](parity-notes.md) and [final-merge-notes.md](final-merge-notes.md) are the working records of those passes, written by the agents that did them; the documents above summarize them.
- The root [README.md](../README.md), [LICENSE-EXCEPTION.md](../LICENSE-EXCEPTION.md) and [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md) were written on 2026-11-18; the root README's status paragraph describes the landed app. Its nine screenshots were retaken from the landed app on 2026-11-18, under the same file names.

## Start here

A reader who only wants to know what the app is and how to run it should start with the root [README.md](../README.md). A reading order for the end-of-project review:

| Step | Read | Why |
|---|---|---|
| 1 | [STATUS.md](STATUS.md) | What works, how it was checked, known problems, what cannot be tested, and what needs the owner (section 5). Rewritten on 2026-11-18. |
| 2 | [PROJECT-LOG.md](PROJECT-LOG.md) | What happened, in order: each phase, who did it, numbers, problems and commits. Phase 15 tells the six incidents on the development machine and the rules that came out of them; phase 30 tells the trial behind a reverse proxy, the first owner test, and one more accident, during the clean-up. "What comes next" lists the open decisions for the owner. |
| 3 | [DECISIONS.md](DECISIONS.md) | Part 1: the owner's own decisions and instructions. Part 4: the questions still open, split into those waiting on the owner and those waiting on the lead. Parts 2 and 3 when you want the reasons behind a technical choice. |
| 4 | [DEVIATIONS.md](DEVIATIONS.md) | Every place the web app differs from the TV app, area by area: adapted, not ported, upstream bugs fixed, web-only additions. Each row says on which branch the code is. |
| 5 | [ARCHITECTURE.md](ARCHITECTURE.md) | How the code of the merged app is put together, for when you want to look inside. Current. For the last passes in detail: [parity-notes.md](parity-notes.md) (the TV comparison) and [final-merge-notes.md](final-merge-notes.md) sections 11 to 14 (its merge, the final check and repair, the polish round, the closing round and the touch fix). |
| 6 | [TOOLING.md](TOOLING.md) | Every command and tool (generators, test server, screenshot crawler, emulator reference shots, end-to-end suite, CI, the guards for a shared machine, the production image) and how to run them. Current. |
| 7 | [../CLAUDE.md](../CLAUDE.md) | The working agreement and hard safety rules every agent followed. |

The specs in [spec/](spec/) are reference material: open them when a question is about how the TV app behaves.

## Status labels

All documents use these labels for the state of a piece of work. Some documents add a label of their own (for example "not started" in STATUS.md) and define it where it is used.

| Label | Meaning |
|---|---|
| planned | Decided or described, but no code exists. |
| built | Code exists and its author reports its own checks passing. Nobody else has checked it. |
| built and reviewed | Separate reviewer agents examined it, and a fixer applied, rejected or deferred each finding. |
| verified in a browser | Someone drove it in a real browser and recorded the result. Each document says which browser and which server. |
| on branch `integration` | The code is committed on branch `wave3a` or `integration` and is part of the merged app on `integration` (see Terms). Since `main` was moved forward to `integration` on 2026-11-18 (commit `c14b168`), this code is on `main` too; the label is kept to show where the work was done. DEVIATIONS.md splits this into two states, "wave3a" and "integration", to say where a change was made. |
| on branch `parity` | The code was committed on branch `parity`, the TV-comparison pass. It was merged into the app on branch `final` and has been on `main` since `main` was moved forward to `final` on 2026-11-18 (commit `e1b7e04`); the label is kept to show where the work was done. DECISIONS.md and DEVIATIONS.md use it. |
| on branch `final` | The code was committed on branch `final`: the merge of the TV-comparison pass into the app, the final check and repair, and the backdrop color fix (made on branch `colors` and merged there). On `main` since 2026-11-18 (commit `e1b7e04`). |
| on branch `polish` | The code was committed on branch `polish`, the polish round. On `main` since 2026-11-18 (merge commit `f1fb308`). |
| closing | The code came with one of the two commits made on `main` after the polish round, on 2026-11-18: `692715f` (the closing round's fix for values in right-to-left languages) or `7ad52ba` (the touch fix for sliders and the reorder handle). DECISIONS.md and DEVIATIONS.md use it. |
| in progress on branch `wave3a`, not yet merged | The earlier name of the "on branch `integration`" label, from the time when that code existed only on branch `wave3a`. No current document uses it any more. ARCHITECTURE.md and TOOLING.md no longer use branch labels: they describe the merged app. |

## Terms

| Term | Meaning |
|---|---|
| the owner | The person who asked for the project and makes the product decisions. |
| the lead | The AI orchestrator that ran the project: it asked the owner questions, decided the architecture, briefed the agents, accepted their work and made the commits on `main`. From wave 4 on, an agent that merged or gated a whole branch was allowed to commit on that branch only. |
| agent | A separate AI worker with a written brief, a fixed set of folders and a final report. |
| upstream | The original Wholphin Android TV app and its Kotlin source. "The TV app" means the same thing, usually when talking about what it looks like on screen. |
| main tree | The repository's normal working copy, branch `main`. |
| worktree | An extra working copy of the same git repository in another folder, on its own branch, so that two groups of agents cannot overwrite each other's files. |
| branch `wave3a` | The worktree at `.worktrees/w3`, where wave 3a was built in parallel with wave 2, and wave 4 after it. |
| branch `e2e` | The worktree at `.worktrees/e2e`, where the end-to-end test suite and the CI files were built. It has been merged into `main`; its worktree was removed after the merge and the local branch was deleted on 2026-11-18. |
| branch `integration` | The worktree at `.worktrees/int`, where branch `wave3a` and `main` were merged into one app (the final merge). `main` was moved forward to it on 2026-11-18 (`c14b168`), its last commit. |
| branch `parity` | The worktree at `.worktrees/parity`, where the TV-comparison pass compared every web screen with pictures of the TV app and fixed the differences. Its last commit is `d23d5bc`; its work reached `main` through branch `final`. |
| branch `final` | The branch (worktree `.worktrees/final` at the time) where the TV-comparison pass was merged into the app (the early merge), the final check and repair ran, and the backdrop color fix was merged in. `main` was moved forward to it on 2026-11-18 at `e1b7e04`, without a merge commit. |
| branch `colors` | The worktree at `.worktrees/colors`, where the dynamic backdrop colors were made to match the TV; merged into `final`. |
| the TV-comparison pass | The pass that placed every web screen next to a picture of the TV app (244 reference pictures from the Android TV emulator) and fixed the differences in look. Its record is [parity-notes.md](parity-notes.md). Also called the parity pass. |
| the early merge | Merging the TV-comparison pass into the repaired app on branch `final`, before the pass's last notes commit. Rule: the comparison pass decides how things look, the repaired app how they behave. [final-merge-notes.md](final-merge-notes.md), section 11. |
| the final check and repair | Thirteen independent checkers examining the merged app from different angles at the same time, area fixers repairing their findings, an integrator running every gate, and an independent audit. [final-merge-notes.md](final-merge-notes.md), section 12. |
| branch `polish`, the polish round | The round after the landing that closed most of the points the final check had left open: six fixers on separate areas (shell focus, grids, the series overview's scroll, stylesheets for the oldest supported browsers, tools and translations, the Live TV overlay), one integrator and an independent verifier. The branch was cut from `main` at `3b1dd7b` and merged back as `f1fb308`. [final-merge-notes.md](final-merge-notes.md), section 13. |
| the closing round | The round after the polish round, on 2026-11-18: three documentation writers, one agent that retook the README's screenshots, one small-fix agent for the four points the polish round had left, and one independent checker. Its code is commit `692715f`. [final-merge-notes.md](final-merge-notes.md), section 14. |
| the trial | A trial deployment of the app in a container behind a reverse proxy with HTTPS, on 2026-11-18, on the owner's explicit go. [PROJECT-LOG.md](PROJECT-LOG.md), phase 30; [deploy.md](deploy.md), section 9. |
| the touch fix | Commit `7ad52ba`: a finger that starts on a slider or on a reorder handle scrolls the page instead of changing the control. Made after the owner's first test on a touch device, by one fixer and one independent verifier. [final-merge-notes.md](final-merge-notes.md), section 14. |
| the branches today | Every branch named above is deleted locally and its worktree removed (2026-11-18); all of their commits are in `main`. Backup copies of `e2e`, `integration` and `wave3a` still exist on GitHub until the owner deletes them. The entries are kept because the documents tell the history by branch. |
| the throwaway test server | A disposable Jellyfin in Docker on the development machine, filled with free films and synthetic test files, used for anything that changes server state. |
| the real server | A live Jellyfin (and Seerr) used by other people. Agents used it read-only, through a limited non-admin test account. |
| the limited test account | That non-admin account, which the owner created on the real servers for this project. |
| wave 1, wave 2, wave 3a, wave 3b, wave 4 | The build phases: foundations; shell, setup, Home and the crawler; playback, settings, Seerr and the production server; browsing, detail pages, search and Home customization; Live TV, music, photos and the screensaver. All five are built. |
| the fix pass | A later round of fixes on `main`: the supported-browser baseline, fixes for Firefox and for WebKit (the engine Safari uses), known bugs, and what wave 3b had left open. |
| the final merge | Bringing branch `wave3a` and `main` together on branch `integration`. Stage 1 merged `wave3a` with `main` as it stood before the fix pass; stage 2 brought the fix pass in. |
| end-to-end suite | Tests that drive the running app in a real browser the way a user would (`e2e/`). |
| CI | Continuous integration: the checks GitHub runs by itself on every push and pull request. |
| mocked | A test answered a network request itself, so the request never reached a server. |
| the spec audit | The 35-agent workflow that re-checked the first specs against the Kotlin and wrote the coverage-gaps list. |
| workflow | A script that starts agents in phases (build, review, fix, integrate) and passes results between them. |
| dp | Android's density-independent pixel. In this code base 1 CSS px is written for 1 dp and scaled as a whole. |

Entries in DECISIONS.md are cited by number throughout the set: O-n (owner), T-n (lead, technical), A-n (agents), Q-n (open questions).

## The documents

| File | Contents |
|---|---|
| [README.md](README.md) | This page. |
| [STATUS.md](STATUS.md) | Current state: feature by feature and route by route, with how each was verified; quality gates; the newest crawler report; known bugs and deferred findings; what cannot be tested yet; roadmap; what needs the owner. Regenerated at each milestone. |
| [PROJECT-LOG.md](PROJECT-LOG.md) | The chronology in phases (30 when this page was updated), from the first look at upstream through both stages of the final merge, the TV-comparison pass, its early merge into the app, the final check and repair, the backdrop colors, the landing on `main`, the polish round and its landing, and the closing round, the first owner test and the touch fix on 2026-11-18: goal, who did it (and on which model tier), what came out, what was and was not verified, problems, commits. Phase 15 records the incidents on the development machine; phase 20 the run in which the model usage limit was reached. Phase 30 records the trial, the first owner test and the accident of the clean-up. Ends with what comes next, the open decisions for the owner, and placeholders for phases still to come. |
| [DECISIONS.md](DECISIONS.md) | Every significant decision: the owner's decisions and instructions (O-n), the lead's technical ones with reasons and costs (T-n), choices agents made while building (A-n), and questions (Q-n): those waiting on the owner, those waiting on the lead, and those settled since the first version. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the code of the merged app is organized, in 22 sections: the big picture, stack, folder map, startup, session model, routing (including how one route chooses between feature pages), data fetching and local storage, preferences, theming and scale, the UI kit, the input model, translations, the shell and Home, each feature area (browse, detail, search, playback, settings, Seerr, Live TV, music, photos, screensaver), the production server and Docker image, the browser baseline, the testing layers, how to add a screen, a preference or an item-menu action, the generated files, and the places where the code has two mechanisms or an open point. Rewritten on 2026-11-18. |
| [DEVIATIONS.md](DEVIATIONS.md) | Every difference from the TV app, per area (sections 3 to 16), in four tables (adapted, not ported, upstream bugs fixed, web-only additions), with the branch each one is on; how much each part has been checked (section 1.3); the Android-only preferences that are hidden (section 17); the open points that affect the list (section 18); and the differences removed since the previous version (section 19). |
| [TOOLING.md](TOOLING.md) | Every npm script, the four generators, the `.env.local` keys and the environment variables the tools read, the dev server and the dev sign-in helper, the throwaway test server (media, media segments, image subtitles, what its check verifies, why nothing is ever recorded), the emulator reference capture, the screenshot crawler, the UI gallery, unit tests, the end-to-end suite, CI and Dependabot, the guards for a machine someone is using (headless and muted test browsers, the low-priority keeper, one dev server per agent, worktrees), the agent-log archiver, the production server and Docker image, the npm audit state, a first-day checklist, and the list of open and unverified points. The crawler section includes the TV compare sheet and its TV-canvas reference scenes. Rewritten on 2026-11-18 and updated for `main` at `7ad52ba`. |
| [spec/01-design-system.md](spec/01-design-system.md) | Upstream's look: the 8 color themes, typography, shapes, focus treatment and motion, the card catalog, page spacing, the backdrop, building blocks, drawables, and notes on mapping them to the web. Not part of the spec audit; its library values were checked separately in wave 1. |
| [spec/02-shell-navigation-home.md](spec/02-shell-navigation-home.md) | Startup and the back stack, the map of all 23 upstream destinations, the nav drawer, the Home page and its 15 row types, home customization, global behaviors, key handling, and web adaptation questions. |
| [spec/03-browse-and-detail.md](spec/03-browse-and-detail.md) | Library tabs and grids, the movie, series, episode, box set, playlist and person pages, Favorites, Search, context menus, an endpoint index, upstream quirks, and web adaptation questions. |
| [spec/04-livetv-music-photos-discover.md](spec/04-livetv-music-photos-discover.md) | Live TV and DVR (part A), music (B), photos and the slideshow (C), Seerr discover and requests (D), and web adaptation questions. |
| [spec/05-playback.md](spec/05-playback.md) | Part 1: everything upstream does from "Play" to returning to a browse screen (track choice, subtitles, progress reporting, media segments, Next Up, trickplay, controls, errors, live TV, backends). Part 2: a recommended browser mapping (capability detection, device profile, subtitle delivery, fallback, keyboard and mouse scheme, risks), labeled as a recommendation. |
| [spec/06-settings-data-setup.md](spec/06-settings-data-setup.md) | What upstream stores where and its web equivalent, the app preferences, the settings screens, the local database, server and user setup, the screensaver, localization, and background work. |
| [spec/07-jellyfin-api-inventory.md](spec/07-jellyfin-api-inventory.md) | Every Jellyfin call upstream makes, grouped by area, with image URL rules and a cheat sheet of which calls happen when. |
| [spec/08-coverage-gaps.md](spec/08-coverage-gaps.md) | Output of the spec audit: 104 upstream behaviors the first specs missed or got wrong (4 high, 24 medium, 76 low), by area, ending with the ten a user would most likely notice. |
| [spec/design-tokens.json](spec/design-tokens.json) | Machine-readable design values: theme colors, fixed and theme-dependent colors, typography, shapes, focus, motion, backdrop, cards and layout. `tools/gen-tokens.mjs` reads it. |
| [spec/preferences.json](spec/preferences.json) | Machine-readable list of every upstream preference (133 entries: 64 web, 41 web-adapted, 28 Android-only) with type, default, options, labels and settings screens. `tools/gen-preferences.ts` reads it. |

In this folder but not a document:

| Folder | Contents |
|---|---|
| [screenshots/](screenshots/) | The nine pictures the root README shows (Home, a library, a movie page, a series page, the player, settings, the Live TV guide, an album with the mini player, Home at phone width). They were taken by the screenshot crawler on the throwaway test server in the Purple theme, from the landed app, and show only generated test media and openly licensed films. |

In the repository root:

| File | Contents |
|---|---|
| [README.md](../README.md) | The public front page: what the app is, pictures, what it does and does not do, supported browsers and what was tested, how to run it with Docker and behind a reverse proxy, how it relates to a Jellyfin server, credits and the licence. |
| [LICENSE](../LICENSE) | The text of the GNU General Public License, version 2, unchanged. |
| [LICENSE-EXCEPTION.md](../LICENSE-EXCEPTION.md) | The additional permission that the contributors give for combining Wholphin Web with its three Apache-2.0 components (hls.js, abslink and the Material Design icons), and the scope of that permission. |
| [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md) | Every third-party component that ships with the app, by licence, with version and project page, written from the generated licence list; and the note on the one dependency that was replaced because it is GPL-3.0. |
| [CONTRIBUTING.md](../CONTRIBUTING.md), [SECURITY.md](../SECURITY.md) | How to set up and what to check before a pull request; how to report a vulnerability. |
| [CLAUDE.md](../CLAUDE.md) | The working agreement and the hard safety rules. |

Working records and guides, also in this folder:

| File | Contents |
|---|---|
| [deploy.md](deploy.md) | The deployment guide, with Caddy and nginx examples that use placeholder domains. Section 9 describes a trial beside a setup that already works: on a second port, or on a sub-domain when no second port can be opened, and how to try a Caddy configuration without touching a running Caddy. |
| [wave3a-merge-notes.md](wave3a-merge-notes.md) | The hand-over notes that branch `wave3a` wrote for whoever merges it. |
| [final-merge-notes.md](final-merge-notes.md) | The record of the final merge and everything after it: every conflict and how it was resolved, what was connected, the gates, the checkers' findings and the repairs of both stages (sections 1 to 9), what happened after the audit (section 10), the merge of the TV-comparison pass into the app (section 11), the final check and repair with its 47 findings, a ready-to-paste deviations table (12.4), the tests added, the gates and what is still open (section 12), and the polish round (section 13): its items and their outcome (13.1), what the integrator changed (13.2), deviations introduced or removed (13.3), decisions (13.4), tests (13.5), gates (13.6) and what is not verified or still open (13.7), and the closing round and the touch fix after the first owner test (section 14, in the same seven parts). 14 sections in all. |
| [parity-notes.md](parity-notes.md) | The record of the TV-comparison pass: its method, the compare sheet that covers all 244 reference pictures, what was fixed per area, the shared-kit changes, its deviations (section 5), what is still different from the TV (section 6) and what was not verified. |

## Where the raw material lives

These folders hold the primary sources behind the documents. They are git-ignored (see `.gitignore`), so they exist only on the development machine and are not in the repository.

| Folder | What it holds | Why it is not in the repository |
|---|---|---|
| `.agent-logs/` | The archive of every agent's brief and final report (`agents/`), every workflow's orchestration script and returned results (`workflows/`), and an index. Rebuilt with `node tools/archive-agent-logs.mjs` (see [TOOLING.md](TOOLING.md)). | The raw logs contain machine-specific paths and other local details that must not be published. The curated history is in these documents. |
| `shots/out/` | Screenshot crawler runs: pictures per viewport and theme, a contact sheet, a health report, and comparison pages. `latest.json` names the newest run. | Large, regenerated on demand, and specific to the server it was run against. |
| `refshots/out/` | Reference screenshots of the official TV app in the Android TV emulator, their `manifest.json`, the downloaded app and the emulator's virtual device. **Empty since 2026-11-18:** the folder was deleted by accident when finished worktrees were removed ([PROJECT-LOG.md](PROJECT-LOG.md), phase 30). The 244 pictures have to be captured again with `tools/refshots` before `npm run shots:compare` can be used. | Large (the virtual device alone is several GB), regenerated on demand, and includes a third-party app package. |
| `reference/` | A read-only copy of the upstream source at commit `8dcf189`. Emptied in the same accident and restored the same day by cloning upstream at that commit. | It is upstream's repository, available from upstream. |
| `dev/testserver/data/` | The throwaway test server's configuration, cache and media. | Large and disposable; recreated by the test server scripts. |
| `.worktrees/` | The extra working copies used for the parallel lines of work (branches `wave3a`, `e2e`, `integration`, `parity`, `final`, `colors` and `polish`). All of their work is on `main`. All of them were removed on 2026-11-18, with their branches, so the folder is empty now. | They are git working folders, not content. |
| `.env.local` | Local addresses and test credentials. | Credentials never go into the repository. |

## Keeping the docs current

| When | Update |
|---|---|
| At every milestone | Regenerate [STATUS.md](STATUS.md) from the code, the newest agent reports and the newest crawler run, and change its date. |
| At the end of every wave | Add a section to [PROJECT-LOG.md](PROJECT-LOG.md) in the same shape as the others (goal, who, outcome, numbers, problems, commits), fill the matching placeholder, and update its summary table. |
| When something is decided | Append an entry to [DECISIONS.md](DECISIONS.md) with the next free number; when an open question (Q-n) is settled, record the answer there and point to the entry that implements it. |
| When TV behavior is adapted, dropped or fixed | Append a row to the right area in [DEVIATIONS.md](DEVIATIONS.md), with the file and the state. |
| When structure or commands change | Update [ARCHITECTURE.md](ARCHITECTURE.md) (folders, contracts, data flow) and [TOOLING.md](TOOLING.md) (scripts, flags, environment keys), and the root [README.md](../README.md) when the change touches what a user sees or how the app is run. |
| When a production dependency changes | Run `npm run gen:licenses` and update [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md) by hand from the regenerated list. If a new Apache-2.0 component appears, the list of names in [LICENSE-EXCEPTION.md](../LICENSE-EXCEPTION.md) and in the root README needs the owner's attention. |
| After running the archiver | Re-check numbers taken from the agent logs; counts in these documents are snapshots. |
| Before the repository goes public | A final pass over every file in `docs/`, including the specs: remove credentials, account names, email addresses, real server addresses and machine-specific absolute paths, check that every "in progress" or "planned" statement is still true, and update this page's current-state sentence. |

Each fact lives in one document and the others link to it: decisions in DECISIONS.md, chronology in PROJECT-LOG.md, structure in ARCHITECTURE.md, differences from upstream in DEVIATIONS.md, commands in TOOLING.md, current state in STATUS.md. The root README is the summary for the public and repeats only what a reader needs to decide whether and how to run the app. Builders do not edit these files; they list deviations, fixed bugs, decisions and verification in their reports, and the lead folds those in ([CLAUDE.md](../CLAUDE.md), "Documentation").
