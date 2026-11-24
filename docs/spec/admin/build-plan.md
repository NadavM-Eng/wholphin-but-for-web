<!-- The final build plan for the Wholphin Web admin panel (Jellyfin 10.11): architecture, trials, waves, work packages, safety rules and owner questions. -->

# Admin panel: build plan

## 1. Summary

- **What is built:** an Admin area inside Wholphin Web, for administrators only, that replaces the frontend of Jellyfin's stock dashboard (server 10.11). It has an Overview and nine subjects, 33 screens in all, as drawn in the approved mockup.
- **Waves:** 8 (W0 to W7), about 34 planned agent runs and up to 6 fix runs.
- **First:** W0 copies the mockup into the repository and probes transport and API facts on the throwaway server. W1 builds the whole foundation: every route, the gate, the kit, the data layer, texts, test plumbing and a read-only live Overview. Every unbuilt subject stays hidden behind a flag.
- **Then:** Users and Server (W2, which tries the draft model on real data early), Playback, Transcoding, Devices and Activity (W3), Libraries and Maintenance (W4), Plugins (W5), Network (W6), Live TV last (W7).
- **Out of scope:** item editing, a Jellyfin proxy, the startup wizard, backup download/upload/delete, translation of hand-written texts, recording management, and anything on the real server.

## 2. Decisions already taken by the owner

1. Item-level editing (metadata editor, image editor, identify, refresh) is a separate later track.
2. Live TV is built last.
3. Plugin settings start with the plugin's own page shown inside the panel (or opened in the stock dashboard), plus a simple editor over the plugin's saved settings. The technical route is proven on the throwaway server first.
4. Short settings save when changed. The long or risky pages (User, Library, Transcoding, Network) keep a draft with one Save bar.
5. Destructive actions are guarded and sit last on a page.
6. The Round 2 notes in the kit are binding:
   - use the width on 1080p, 2K and 4K, with cards flowing into columns and an "On this page" list at the side;
   - the main action sits on the same row as search and filters;
   - there is one dropdown look;
   - controls sit side by side on one line at one height;
   - a transcoding session shows the user's progress in the regular colour, with the transcoding progress in yellow underneath;
   - Activity is paged with 30/60/90/120 rows;
   - the plugin screens are finished designs, so only the wiring is left.
7. Development and tests run only against the throwaway test Jellyfin. Every build for the trial site needs the owner's explicit yes.
8. Agents are Opus, Sonnet or Haiku only. Sonnet does most building and reviewing, Haiku does exact mechanical edits, and Opus is kept for the hard problems.

## 3. Architecture

### 3.1 Folders

Everything lives in `src/features/admin/`:

| Folder | Holds |
|---|---|
| `shell/` | `RequireAdmin`, `AdminLayout`, `subjects.ts` (subject list with a `shipped` flag), `RestartBanner` |
| `ui/` | the admin kit (3.6), one component per file, each with its own CSS module |
| `api/` | query hooks, `configQueue.ts`, `useDraft.ts`, `useAdminMutation.ts`, `adminSocket.ts`, `raw.ts` (the only place for raw calls), `keys.ts` |
| `overview/ server/ users/ libraries/ playback/ devices/ activity/ plugins/ maintenance/ network/ livetv/` | one folder per subject, holding its pages and dialogs |

There are only a few edits outside that folder, and each report names them:
- `src/app/routes.tsx`, `src/app/nav.ts`, `src/app/shell/drawerItems.ts`, `NavDrawer.tsx`, `useDrawerItems.ts`;
- `src/ui/overlays/ConfirmDialog` (`typedConfirm`, `tone: 'danger'`);
- `src/ui/inputs/TextField` (`variant: 'box'`);
- the token source: two fixed colours, `--fx-admin-ok` and `--fx-admin-warn`.

### 3.2 Routes

The admin routes form one nested group under `<AppShell/>`, so the real drawer stays visible. The mockup's rail is mock chrome and is not built. The group's element is `RequireAdmin`, which renders `AdminLayout`. Dialogs are state on their page, not routes.

| Address | Screen |
|---|---|
| `/admin` | Overview, including the "all admin settings" list |
| `/admin/server` | Server (the Shutdown dialog lives here) |
| `/admin/users`, `/admin/users/:userId` | Users list (with the Add user dialog), one user |
| `/admin/libraries`, `/admin/libraries/defaults`, `/admin/libraries/:itemId` | Libraries list (with the Add library dialog), defaults, one library |
| `/admin/playback`, `/admin/playback/transcoding` | Playback, Transcoding |
| `/admin/devices`, `/admin/activity` | Devices (with the Clean-up dialog), Activity |
| `/admin/plugins`, `/admin/plugins/catalog`, `/admin/plugins/catalog/:packageGuid` | Installed, catalog, install |
| `/admin/plugins/repositories` | Repositories (with the Add repository dialog) |
| `/admin/plugins/:pluginId`, `/admin/plugins/:pluginId/settings` | One plugin, its settings |
| `/admin/maintenance/tasks`, `/admin/maintenance/tasks/:taskId` | Tasks, one task |
| `/admin/maintenance/backups`, `/admin/maintenance/logs`, `/admin/maintenance/logs/:name` | Backups, logs, log viewer |
| `/admin/network` | Network (with the Review changes dialog) |
| `/admin/livetv` | Live TV |

- All routes, the `nav.admin.*` builders and a placeholder page per route are created in W1, by one package. After that no package edits `routes.tsx` or `nav.ts`.
- `/admin/maintenance` redirects to tasks.
- `isDrawerDestination()` and `selectionForPath()` learn `/admin/*`.
- `subjects.ts` lists each subject with `shipped`. An unshipped subject is missing from the Overview list and the side navigation, and its route shows Overview. Haiku flips the flag at the end of the wave that ships the subject.

### 3.3 Admin gate

- The drawer entry is pinned at the bottom next to Settings. It shows only when `useSession()?.userDto.Policy?.IsAdministrator === true`.
- `RequireAdmin` refetches `/Users/Me` each time the admin area is entered. If the user is not an administrator, it redirects to Home and the session's policy is updated.
- A 403 from any admin call shows an inline "no permission" message and a link to Home, never a crash. The server enforces the rights anyway.

### 3.4 Data and the two save models

- **Query keys** are `qk('admin', area, …)`. Live reads set `staleTime: 0`. SDK getters are imported by deep path (`@jellyfin/sdk/lib/utils/api/<name>-api`). The paths are confirmed by T2 and written into `api/README` comments. An operation with no SDK method goes through `api/raw.ts`, which uses the session's axios instance.
- **`useAdminMutation({ mutationFn, invalidate })`** shows a toast on error and invalidates the narrowest keys. Mutations never retry.
- **`configQueue.ts`** keeps one serialized queue per whole-object resource: `/System/Configuration`, each named configuration (encoding, network, livetv, metadata, xbmcmetadata), branding, a user's policy, a user, and a library's options. For each write it GETs a fresh copy, applies only the changed paths, and POSTs the whole object. Unknown fields round-trip untouched.
- **Short pages** (Server, Branding, Playback, Library defaults, Logs settings, Live TV recording settings) save on change. Switches and selects save at once; text and numbers save after a 600 ms pause or on blur. A failure reverts the field and shows a toast. A small "Saved" note appears next to the row.
- **Long or risky pages** (User, Library, Transcoding, Network) use `useDraft(serverValue)`. It gives the changed paths, a dirty count, a summary and a router blocker (the pattern of `HomeSettingsPage`). The sticky `SaveBar` appears only when the draft differs from the server value. Save runs through the same queue, which means a three-way apply onto a fresh copy, so folder edits and other tabs survive.
- Whole-object rules: UserPolicy must keep `AuthenticationProviderId` and `PasswordResetProviderId`. LibraryOptions are re-read right before save, together with their PathInfos. `RemoteClientBitrateLimit` is in bits (the UI shows Mbit/s). Task ticks are converted only in `api/ticks.ts`.

### 3.5 Live updates

- `api/adminSocket.ts` holds one WebSocket at `/socket?api_key=…&deviceId=…`. It is ref-counted and open only while an admin page is mounted.
  - It sends `SessionsStart "1000,1500"`, `ScheduledTasksInfoStart` and `ActivityLogEntryStart`, plus the matching Stop messages, and answers KeepAlive.
  - It reconnects with backoff and closes on sign-out, on a 401 or on a user change.
- Incoming `Sessions`, `ScheduledTasksInfo`, `ScheduledTaskEnded`, `ActivityLogEntry`, `RefreshProgress`, `RestartRequired`, `ServerRestarting`, `ServerShuttingDown` and the `Package*` messages are written into the cache with `setQueryData` by a pure reducer, which has unit tests.
- While the socket is down, queries poll instead: sessions every 2 s, tasks every 10 s, activity page 1 every 30 s. Polling runs only while the page is visible.
- `RestartBanner` sits in `AdminLayout` and is owned by F3. It shows when `SystemInfo.HasPendingRestart` is set, when a `RestartRequired` message arrives, or when any plugin has `Status = Restart`. It offers Restart, behind a confirmation. Nothing restarts automatically.
- Overview's "needs attention" list is built by `api/useAttention.ts` (F3) from sources that need no subject page: pending restart, failed last task runs, disks at 90% or more, plugins with Restart or a malfunction status, and a newer server version if the system info says so. Later subjects may add sources through that one file, in their own wave, as a reported edit.

### 3.6 Shared components and their homes

The whole kit is built in W1. After W1, each wave has one named kit owner, and other packages ask that owner in their report rather than edit a kit file.

| Piece | Home | Built by |
|---|---|---|
| `AdminLayout`, `AdminPage` (breadcrumb, h1, subtitle, toolbar row, "On this page" list that becomes chips on narrow widths), `CardFlow`, `Card` (`wide`, `tone: 'danger'`), side navigation | `features/admin/shell`, `ui` | F1 |
| `SettingRow`, `Select` (native, the one dropdown look), `NumberField`, TextField `variant="box"`, `CheckList`, `OrderedList` (up/down buttons only), `AdminButton` (default, primary, danger, outline; no scale on focus), `Chip`/`ChipGroup`, `Toolbar` (main action last, one control height), `TagInput`, `FolderPicker` (Environment API), ConfirmDialog `typedConfirm` | `ui`, `src/ui/...` | F2a |
| `Badge` (neutral, ok, warn, err, pri), `ProgressBar2` (user's progress in `--c-tertiary`, transcoding in `--fx-golden-yellow` under it), `DataTable` (plain table with horizontal scroll), `Pager` (30/60/90/120, Previous/Next, page x of y), `Avatar` (initial coloured by `idColor`), `SaveBar`, `EmptyState`, the two tokens | `ui`, theme | F2b |

The app's `Switch`, `Dialog` shell (set to 560px wide for admin), `toast()`, `ErrorMessage` and `LoadingPage` are reused. Colours map onto the PURPLE theme tokens exactly, as the ui-kit reading shows, and never use a hex value.

### 3.7 Texts and translations

- Keys are `web_admin_<area>_<name>`.
- English goes in `src/i18n/extra/admin/en/<area>.json`, one file per area, each owned by that area's package. It is loaded lazily with the admin chunk through `addResourceBundle`.
- Imported translations go in `src/i18n/extra/admin/<lang>/<area>.json` and load together with that language.
- `tools/gen-admin-strings.ts` (`npm run gen:admin-strings`, part of `npm run gen`) reads a pinned jellyfin-web checkout in git-ignored `reference/` and the per-area map files `tools/admin-strings/map/<area>.json`, which list only the keys the panel uses.
  - It converts `{0}` placeholders to `{{p1}}`.
  - It writes a "generated from jellyfin-web <commit>, modified" header key.
  - A key marked `override` ships its hand-written English only, with no imported translation.
- Labels are imported. The mockup's reworded help texts are written in English only.
- A notice file credits jellyfin-web (GPL-2.0-or-later, used under GPL-2.0), and the app's licence list gains a row. All of this depends on owner question 1.

### 3.8 Interface scale, width and phone

- CSS is written in px (1px = 1dp). At-rule thresholds are written in rem, because they are not converted. Hairlines are `1PX`.
- `CardFlow` uses `columns: 520px 3` with `break-inside: avoid`, and `wide` cards span all columns. The "On this page" list is 232px wide and sticky.
- Acceptance widths are 1536, 1707 and 2194 CSS px (1080p at 125%, 2K at 150%, 4K at 175%). Each must show at least two card columns beside the list, and three at 2194. One RTL (he) pass is taken.
- Below 1180px (written in rem) the list becomes chips under the header. Below 720px everything is one column, the toolbar wraps with the main action first, and tables scroll sideways inside their card.
- At 360px nothing scrolls the page sideways. The two phone artboards (Overview, User) are acceptance shots.
- Only logical properties are used. Breadcrumb chevrons flip in RTL.
- Every control has the same look on `:hover` and `:focus-visible`, carries `data-focusable`, and is reachable by Tab. Native selects and number fields use `fieldArrowExit`. Pages use `useScrollRestore`, so Back restores scroll and focus.

## 4. Technical trials

| Trial | Question | How it is tried (throwaway server only) | What each outcome changes |
|---|---|---|---|
| **T0 mockup copy** (Haiku, first) | Can builders in other worktrees read the design? | Copy the approved mockup's `project/*.dc.html`, `canvas.json` and `kit/KIT.md` into `docs/spec/admin/mockup/`. | Nothing to decide; every later package reads from there. |
| **T2 transport and API facts** (Sonnet, alone, before W1) | Do CORS preflights pass for POST, DELETE and PUT with Authorization from the app's origin? Does the WebSocket connect with `api_key`? Do the SDK import paths exist for every admin class? What body shapes do these take: `updatePluginConfiguration`, splash upload (base64), user image upload/delete, NetworkShares? Also: the slow-response config fields, activity sort order, the failed-login Type string, whether `GET /Branding/Splashscreen` exists, backup duration and size, whether logs answer a Range request, whether unknown config fields survive a round trip. | A Node script with the test admin session, writing `docs/spec/admin/probe-results.md` (no addresses, no credentials). | CORS fails for writes: stop and ask the owner (a same-origin proxy is outside this plan). Socket fails: polling only, and F3 drops the socket. A missing SDK method: `raw.ts`. A probe result settles the matching rows in section 6. |
| **T1 plugin page** (Opus, beside W1) | Can a plugin's own configuration page run inside the panel? | Try, in this order: (a) a sandboxed iframe (`srcdoc` or blob) of `/web/ConfigurationPage?name=` with a shim for `ApiClient`, `Dashboard`, the page events and any jQuery or `emby-*` needs, carrying our token; (b) a frame of the Jellyfin-origin page, which needs `frame-src` in `server/security.ts` and Jellyfin's own frame headers; (c) the stock dashboard in a new tab. Test on Open Subtitles, Playback Reporting, Webhook and LDAP where they install on the throwaway server. Also prove how deep and what kind the saved-settings JSON is, and whether secrets come back in clear text. | (a) works for most plugins: W5 P2 builds it (Opus if the shim is complex). Only (b) works: owner question 2. Only (c) works, or stock web is absent: "Open in stock dashboard" where possible, plus the simple editor; P2 is small. |
| **T3 network lock-out** (Sonnet, beside W1, never parallel with other test runs) | Which network fields need a restart, which can lock admins out, and how is a lock-out recovered? | Save bad bind, port, base URL and HTTPS values on the throwaway server, without and with a restart, and recover with `setup.mjs reset`. | It gives W6 its rules table. If a field locks out and cannot be recovered from a browser, W6 lets that field be saved only behind a typed confirmation that names the recovery. |

## 5. The waves

**Every wave ends with the same check before the owner is asked for a go-live:**
1. `npm run typecheck`, `test`, `lint` and `map` pass.
2. The `@admin` e2e project passes on the throwaway server with one worker.
3. Shots of `--scene 'admin*'` in PURPLE are taken at 1536, 1707 and 2194 wide, at phone width, and once in he (RTL).
4. A Sonnet review checks the code and shots against the binding Round 2 rules, CLAUDE.md, focus and Tab order, Back restore and the 360px rule.
5. The lead looks at the shots and folds the reports into the docs.
6. The owner sees the shots and says yes or no. Only a yes deploys.

Builders never edit `docs/*.md`. Their reports list deviations, fixed upstream bugs, decisions and what was verified.

Unless stated otherwise, the review run of a wave also does the Haiku-free mechanical edits for that wave.

### W0: trials (4 runs: Haiku 1, Sonnet 2, Opus 1)
T0, then T2 alone. T1 and T3 run beside W1. W1 starts when T2 has reported.

### W1: foundation and Overview
- **Goal:** the Admin entry, a working gate and a live, read-only Overview. All other subjects stay hidden.
- **Screens:** Overview (desktop and phone).

| Package | What | Owns | Model | Depends on |
|---|---|---|---|---|
| F1 | routes, nav, drawer, gate, layout, subjects list, placeholders | `src/app/{routes.tsx,nav.ts,shell/*}`, `features/admin/shell/` | Sonnet | T2 |
| F2a | form kit | `features/admin/ui/` (form files), `src/ui/overlays/ConfirmDialog*`, `src/ui/inputs/TextField*` | Sonnet | T2 |
| F2b | data-display kit, tokens | `features/admin/ui/` (display files), token source | Sonnet | T2 |
| F3 | data layer, socket, banner, attention list; unit tests (round trip, changed-path apply, queue order, socket reducer and fallback) | `features/admin/api/`, `shell/RestartBanner*` | Sonnet | T2 |
| F4 | string generator and its test, lazy loading, notice | `tools/gen-admin-strings*`, `tools/admin-strings/`, `src/i18n/` admin loading | Sonnet | owner question 1 |
| F5 | test plumbing (below) | `e2e/`, `playwright.config.ts`, `tools/shots/`, `tools/vite-dev-session.ts` | Sonnet | — |
| O1 | Overview: restart needed, needs attention, running tasks with Stop, recent activity, now playing with `ProgressBar2` and the transcode-reason table, settings list | `features/admin/overview/` | Sonnet | F1, F2a, F2b, F3 |
| H1 | `where.json` rows, `npm run map`, flags | `tools/code-map/where.json`, `subjects.ts` | Haiku | all |

F5 test plumbing:
- `/dev/login?server=test&admin=1`, with the credentials read server-side only;
- an `admin` project and an `@admin` tag, one worker;
- an `adminApi` fixture with `snapshotConfig(section)` and tracked clean-up in fixture teardown;
- a teardown sweep that deletes leftover `wholphin-e2e-*` objects and refuses every port but the throwaway's;
- shots with `--as admin`, the three acceptance-width viewports, and per-area scene files `tools/shots/scenes/admin-<area>.ts`.

**Single owners in W1:** routes, nav and drawer: F1. Shared UI: F2a (form files) and F2b (display files). `ConfirmDialog` and `TextField`: F2a. Locale loading: F4. `en/overview.json`: O1. Code map: H1.

**Tests:**
- Real: the gate (a non-admin is redirected, an admin sees the entry); Overview against the seeded data; running "Clean Log Directory" and watching its progress.
- Mocked: now playing and live activity. Restart stops at the confirmation, with no request sent.

**Runs:** Sonnet 8 (7 packages and the review), Haiku 1.

### W2: Users and Server
- **Goal:** the busiest subject, plus the draft and Save bar on real data early.
- **Screens:** Users, User (desktop and phone), Add user dialog, Server, Shutdown dialog.

| Package | What | Owns | Model | Depends on |
|---|---|---|---|---|
| U1 | Users list, Add user dialog (create, then a fresh-read policy post, then open the page) | `features/admin/users/` list and dialog files | Sonnet | W1 |
| U2 | One user: about 45 policy fields, access schedule, tags, channels list, password, picture, delete; **kit owner of W2** | `users/` user page files | Sonnet | W1 |
| S1 | Server: general, paths and storage, branding, API keys, restart, Shutdown dialog | `features/admin/server/` | Sonnet | W1 |
| H2 | map, where.json, flags | as H1 | Haiku | all |

**Single owners in W2:** locale `en/users.json`: U2 (U1 asks U2). `en/server.json`: S1. Shared UI: U2. Code map: H2.

**Tests:**
- Real: create `wholphin-e2e-user`, edit its policy, make it administrator and back, set and remove its password, upload and remove its picture, delete it; change and restore the server name and branding text; create and revoke an API key.
- Stopped at the confirmation: restart and shutdown.
- Refused in the UI: deleting or demoting yourself.

**Runs:** Sonnet 4, Haiku 1.

### W3: Playback, Transcoding, Devices, Activity
- **Screens:** Playback, Transcoding, Devices, Clean-up dialog, Activity.

| Package | What | Owns | Model | Depends on |
|---|---|---|---|---|
| P1 | Playback (resume, streaming, trickplay) and Transcoding (draft, visibility by acceleration type, VAAPI/QSV device fields); **kit owner of W3** | `features/admin/playback/` | Sonnet | W1 |
| D1 | Devices grouped by user and app, rename, remove, Clean-up dialog | `features/admin/devices/` | Sonnet | W1 |
| A1 | Activity: People/System tabs, since-date, pager 30/60/90/120, live prepend on page 1 | `features/admin/activity/` | Sonnet | W1 |
| H3 | map, where.json, flags | as H1 | Haiku | all |

**Tests:**
- Real: trickplay and resume values changed and restored; one transcoding field saved and restored; rename a device and restore it; page through activity.
- Mocked: the clean-up DELETE calls. Deleting the current device is refused.

**Runs:** Sonnet 4, Haiku 1.

### W4: Libraries and Maintenance
- **Screens:** Libraries, Library, Library defaults, Add library dialog, Tasks, Task, Backups, Logs, Log viewer.

| Package | What | Owns | Model | Depends on |
|---|---|---|---|---|
| L1 | Libraries list, one library (draft), defaults, Add library dialog | `features/admin/libraries/` | Sonnet | W1 |
| M1 | Tasks, one task with triggers, backups, logs and their settings, log viewer (client-side levels; above 20 MB, download only); **kit owner of W4** | `features/admin/maintenance/` | Sonnet | W1 |
| H4 | map, where.json, flags | as H1 | Haiku | all |

**Tests:**
- Real: add, rename and remove a library on an empty git-ignored temp folder with `refreshLibrary=false`; add, edit and delete a trigger on a harmless task; create one small backup, check its size, and remove it through the fixture.
- Stopped at the dialog: restore from backup, and removing a library that holds media.

**Runs:** Sonnet 3, Haiku 1.

### W5: Plugins
- **Screens:** Installed, Catalog, Repositories, Add repository dialog, One plugin, Install, Plugin settings, Simple plugin editor.

| Package | What | Owns | Model | Depends on |
|---|---|---|---|---|
| PL1 | Installed, catalog (client search and paging), repositories with the dialog, one plugin, install with indeterminate progress and the third-party warning | `features/admin/plugins/` except `settings/` | Sonnet | W1 |
| PL2 | Plugin settings by the T1 outcome, plus the simple editor | `plugins/settings/`, and `server/security.ts` only if owner question 2 is yes | Sonnet (Opus if the shim route) | T1 |
| H5 | map, where.json, flags | as H1 | Haiku | all |

**Tests:**
- Real: add and remove a repository; read the catalog (an offline failure is allowed by `guard.allow`); enable and disable a bundled plugin, with no restart; save a harmless plugin's settings and restore the snapshot.
- Mocked: install, uninstall and version change.

**Runs:** Sonnet 3, Haiku 1 (one more Opus if the shim route is chosen).

### W6: Network
- **Screens:** Network (draft), Review changes dialog.
- **N1 (Sonnet):** the draft, the field rules from T3, the validators (ports, subnets, URLs, HTTPS needs a certificate, at least one of IPv4/IPv6), the review dialog with warnings and the "I can still reach the server" box. No automatic restart.
- **Review (Sonnet)** against the T3 rules table. Opus is used only if the T3 rules leave a lock-out case open.
- **Tests:**
  - Unit: the validators and the diff.
  - e2e: open the review, then discard. The save is mocked.

**Runs:** Sonnet 2 (Opus 1 conditional).

### W7: Live TV
- **Screens:** Live TV (tuners, guide providers, channel mapping, recording settings).
- **LT1 (Sonnet)** builds it, and a Sonnet review checks it.
- **Tests:**
  - Every tuner and provider write is mocked.
  - Recording settings are shown read-only.
  - Never a timer, a recording or a guide refresh.

**Runs:** Sonnet 2.

## 6. Mockup versus server

| Mockup item | Decision |
|---|---|
| Activity user dropdown, Alerts tab, text search, "App and device" column | Drop. A page-only filter would make counts and paging wrong. Keep People/System, since-date and page size; the column shows ShortOverview. (Question 4) |
| API key "shown once" | Adapt. Keys are listed masked with Reveal and Copy, and a new key is found by diffing the list and highlighted. |
| Library "scanned N ago", per-library Stop | Drop. Show the global scan task's last run and offer Stop on the global task. |
| Task "started N minutes ago" | Drop. Show the last run's start and duration. |
| "Why it transcodes" sentence | Adapt, from `TranscodeReasons` and the direct flags, using our own text table. |
| Failed sign-in count | Keep only if T2 finds the activity Type, otherwise drop. |
| "Disk 91% full", system and media disk | Adapt. Group FolderStorageDto by DeviceId, with our own 90% threshold. |
| "Plugin update waits for restart" | Becomes "restart pending". |
| "Chrome on Windows" device split, "from outside the home network" | Show the device's Name and AppName as given. Drop the remote flag. |
| Web client and build version | Show Wholphin Web's own version. |
| Splash image "is set" | Shown only if T2 finds a read operation, otherwise "Replace" and "Remove" only. |
| Backup size, delete, download, "could not be read" row | Drop. |
| Log tail, "load earlier lines", level filter | Client-side after a full download. Above 20 MB the viewer offers download only. |
| Plugin installed date, Skin Manager note, install percentage | Drop the date and the percentage (progress is indeterminate). The Skin Manager note uses a static id list. |
| Simple editor labels, secrets | Humanised property names. Names containing key, token, password or secret are masked. Nested values are shown as mono JSON, read-only. |
| Channels access, other policy, library and transcoding fields the mockup omits | Add Channels to the User page. Keep every other omitted field untouched on save. Add the VAAPI/QSV device fields. |
| "Open connections end at once" on disable | Shown only if T2 confirms it, otherwise left out. |

## 7. Safety rules

1. Agents use only the throwaway server, through `/dev/login?server=test&admin=1`. Fixtures, the sweep and the probes refuse every other port. No agent has or prints real-server credentials, and the admin test password never appears in a report.
2. Nothing keeps writing data: no Live TV timers, recordings or guide refreshes, no real plugin installs, no scans of real media, no downloads, and at most one small backup at a time.
3. In tests, these always stop at the confirmation or are mocked: restart, shutdown, restore, network save, plugin install and uninstall, deleting all devices, revoking the session's own token, deleting a library with media. A real restart is checked only by the lead, by hand, on the throwaway server, once per wave that touches it.
4. In the UI, destructive actions sit last in a danger card. Shutdown, delete user, remove library, restore and dangerous network fields need a typed confirmation. Restart is offered, never automatic.
5. The app refuses to delete or demote your own user, delete your own device, revoke your own token, or save Network without the review step.
6. Every whole-object write is a fresh read, changed paths only, serialized. Unit tests prove that unknown fields survive.
7. Test objects are named `wholphin-e2e-*` and are tracked and swept. Configuration is snapshotted and restored in fixture teardown, even when a test fails. Admin write tests run on one worker, and T3 never runs beside other tests.
8. Crawler scenes never click Save, Restart or Shut down. Scenes with live data use mocked answers.
9. No addresses, names or credentials appear in code, docs or reports. Every trial-site build needs the owner's yes.

## 8. Out of scope

- Item editing: metadata, images, identify, refresh.
- A same-origin Jellyfin proxy.
- The startup wizard, Quick Connect authorize, SyncPlay admin and the stock web client's display settings.
- Backup download, upload and delete.
- Drag-and-drop ordering.
- Editing the server's XML files.
- Translating the hand-written help texts.
- Recording and timer management.
- Anything on the real server.

## 9. Questions for the owner

1. **Import jellyfin-web's labels and their translations (GPL-2.0-or-later, used under GPL-2.0, with a notice), from a pinned read-only checkout in `reference/`?** Recommendation: yes for labels; the help texts are our own English. Default if unanswered: English only, written by hand, and F4 builds only the lazy loading.
2. **If only a framed Jellyfin page works for plugin settings, may the app's security policy allow framing that one server?** Recommendation: not now; use "Open in stock dashboard" plus the simple editor, and revisit after use. Default: no framing.
3. **Go-live cadence?** Recommendation: W1 alone (read-only) first, then each wave on its own after you have tried it, because a deployed build talks to a live server. Default: one go-live per wave, each with its own yes.
4. **Activity filters the server cannot do: drop them?** Recommendation: drop the user filter, Alerts and search. Default: dropped.
5. **Network: allow saving at all?** Recommendation: yes, through the review step and with no automatic restart. Default: yes, as recommended, with the dangerous fields behind a typed confirmation.

## 10. Totals

**Waves:** 8 (W0 to W7).

| Model | Planned runs | Where |
|---|---|---|
| Sonnet | 28 | T2, T3, 15 builds, 7 reviews, plus the W6 and W7 reviews |
| Opus | 1 | T1 (plus up to 2 conditional: the PL2 shim, the Network review) |
| Haiku | 6 | T0, and the end-of-wave map edits in W1 to W5 |
| **All** | **35** | plus up to 6 Sonnet fix runs and 2 conditional Opus runs |

**Biggest risks:**
1. **Whole-object writes clobbering fields or racing each other** and damaging a server's configuration. Mitigation: the serialized changed-path queue and the round-trip unit tests in W1, and drafts tried on real data in W2.
2. **Plugin pages not running outside the stock app.** Mitigation: T1 early, with a defined fallback; W5 shrinks rather than slips.
3. **Network or restart actions locking admins out.** Mitigation: the T3 rules, the review step, typed confirmations, and no real network save in tests.
4. **The large pages (User, Library, Transcoding, Network) overrunning usage.** Mitigation: one package each, the complete W1 kit, and the mockup's omissions kept omitted.
