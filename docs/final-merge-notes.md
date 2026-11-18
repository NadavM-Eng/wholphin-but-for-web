# Final merge: `wave3a` into `integration` (= main at `68e6f5f`)

This note records the merge that made the two lines of work one app: what was merged, every conflict and how it
was resolved, every hook-up, what is still open, and which files a later merge of main's in-flight fix pass is
likely to touch in conflict with these changes. The hand-over it follows is `docs/wave3a-merge-notes.md`.

## 1. What was merged

| Side | Content |
|---|---|
| `integration` (main `68e6f5f`) | sign-in, shell, Home and Home customization, library browsing (`src/features/browse`), detail pages incl. series (`src/features/detail`), search, the shared item layer, UI-kit polish, crawler scenes, the e2e suite (`e2e/`), CI files |
| `wave3a` (`7f1e210`) | playback engine and player, settings, Seerr / Discover, production server and Docker image, Live TV, music with mini player, photos and slideshow, the in-app screensaver, the `rvfc-polyfill` replacement in `vendor/`, license generation |

Commits on `integration`:

| Commit | What |
|---|---|
| `c31a214` | `git merge --no-ff wave3a` with the conflicts resolved (section 2) |
| `8566912` | Wiring: play paths, music queue, Seerr on detail and search, settings dialogs, UI-kit requests (section 3) |
| `dd55686` | e2e: real pages instead of stubs; smoke specs for playback, settings, music, photos, Live TV, Discover |
| `f7ed3fd` | Crawler scenes pointed at the merged pages; `wave4:` markers removed |
| (this file) | Merge notes |

## 2. Conflicts and resolutions

| File | Resolution |
|---|---|
| `package.json` | Union of the scripts: main's `e2e:*` plus wave3a's `start`, `serve:build`, `docker:build`, `docker:run`. Dependencies and `overrides` merged cleanly. `npm install` left the lockfile as merged; `npm ls rvfc-polyfill` resolves to `vendor/rvfc-polyfill` (also under `jassub`); no GPL-3.0 / AGPL package in `node_modules` |
| `src/app/spatialNav.ts` | Both mechanisms kept: main's `data-focus-vertical-only` (last-resort Up/Down search) and wave3a's `data-focus-enter="<dirs>"` (`canEnter()`, direction filter in `candidatesIn`). The header documents both; wave3a's `canEnter` test kept |
| `src/app/AppShell.tsx` | Main's `data-focus-vertical-only` on the rail Back slot. It solves the same problem as wave3a's `data-focus-enter="up"` (Left from the page start goes to the drawer) and main's box-set header depends on it |
| `src/app/nav.ts` | wave3a's `nav.slideshow(parentId, { index, id, start, recursive, filter, sort, order })` |
| `src/app/routes.tsx` | Doc row of `/slideshow/:parentId` with `id` |
| `src/features/browse/CollectionFolderPage.tsx` | Main's real page; dispatch ported in front of the generic page with the pure helpers on the already loaded folder item: `useLiveTvRoute(itemId)` (Live TV user view, recording folders), then `photoPageFor(folder, 'library')` (photos / home videos libraries, photo albums), then `musicPageFor(folder)` (music libraries). Hooks run unconditionally, early returns after |
| `src/features/browse/FilteredCollectionPage.tsx` | Main's page; a music library's genre (`type=Genre&collectionType=music`) returns `MusicGenrePage` |
| `src/features/detail/MediaItemPage.tsx` | Main's page; `musicPageFor(item, { songId: ?song })` and `photoPageFor(item, 'item')` before the kind switch. The "not built yet" placeholder (`LATER` set, `NotBuiltYet`, `web_page_not_built_yet`, its CSS) is gone. `Recording` uses `MovieDetails`; `TvChannel` / `Program` (and the `LiveTv*` / `TvProgram` spellings) opened by URL redirect to `itemDestination()` (play the channel), as a card click does |
| `src/i18n/extra/en.json` | Union of the keys (`web_move_up` / `web_move_down` once); `npm run gen` |
| `tools/shots/scenes.ts`, `tools/shots/refmap.ts` | Both sides' helpers, scenes and reference pairs |
| `src/app/RouteStub.tsx` | Deleted: no route renders a stub any more |
| add/add `src/stores/playbackChoices.ts`, `src/features/playback/engine/streamChoice.ts` | No conflict: main's copies were byte-identical to wave3a's, so the merge kept one module each with wave3a's tests. The detail pages, the player, settings and startup all use the same store and keys |

Generated files (`src/stores/preferences.gen.ts`, `src/features/settings/licenses.gen.json`, `upstream.gen.json`,
`src/theme/tokens.css`, locales) were regenerated with `npm run gen`, not hand-merged.

New helper: `photoPageFor(item, route)` in `src/features/photos/usePhotoRoute.tsx` (the pure form of `usePhotoRoute`).

## 3. Hook-ups

### Routing

- Library route: Live TV library -> `LiveTvView`; recording folder -> `RecordingsView`; music library ->
  `MusicLibraryPage`; photos / home videos library (not `Folder`) -> `PhotoLibraryPage`; `PhotoAlbum` ->
  `PhotoAlbumPage`; everything else keeps main's pages.
- Item route: `MusicAlbum` / `MusicArtist` / `Audio` (album with `?song=`) / audio `Playlist` -> music pages;
  `PhotoAlbum` -> photo grid; `Photo` -> the viewer on its album (`/slideshow/<parent>?id=`).
- Live TV stand-in grid replaced: `src/features/livetv/RecordingFolderGrid.tsx` now renders browse's `LibraryGrid`
  (`recursive=false`, `playEnabled=false`). Live TV folder tab: `VideoSortOptions`, `ViewOptions()` (FIT), no
  title; the tab row collapses while the grid is scrolled (`onScrolled`). Recordings page: `MovieSortOptions`,
  `ViewOptionsPoster`, folder name as the grid title, inside `FullHeightPage`. Its old CSS modules are deleted.

### Play everywhere

- Main's pages already navigated with `nav.play(id, { t })` / `nav.playList(id, { index, shuffle, recursive, sort,
  order, filter })`; those routes now reach the real player. Checked in code: library Play / Shuffle and Play key,
  recommended rows, item grid, box set Play / Shuffle, extras, local trailers, chapters, episode strip, series
  Play (next up from its resume point) / Shuffle, series overview, playlist Play / Shuffle / index, context menu
  Play / Resume / Restart / Shuffle / Play with, Home rows.
- **Filter contract fixed**: browse and the playlist page pass the filter as the Kotlin `GetItemsFilter` JSON
  (`genres`, `played`, `decades`, `videoTypes`...), but the player's `parseQueueFilter` only understood REST names
  (`genreIds`, `isPlayed`...), so "Play all" ignored the grid's filter. `parseQueueFilter` now accepts both
  spellings and maps the Kotlin one with browse's `applyFilter` (`src/features/playback/engine/queue.ts`; test in
  `misc.test.ts`). The queue request also forwards `minCommunityRating`, `is4K`, `isHd`, `is3D`, `videoTypes`.
- Search: the Play key on a combined-grid card starts at the item's resume position (`Destination.Playback(item)`).
- Audio: an audio playlist's Play / Shuffle / index (playlist page) and the context menu's Play / Shuffle on an
  audio playlist go to the music queue (`playItem` = `MusicViewModel.play`), via a new `playMusic` item-menu
  handler that `MusicHost` installs. Albums, artists and songs already play from the music pages.
- Pre-play choosers: the detail pages' version / audio / subtitle choices are written to the same
  `playbackChoices` store the engine reads (`getItemPlayback`); verified by code reading and the shared tests.
- Theme music: one player (`src/features/detail/common/themeMusic.ts`). wave3a's second player in
  `music/service/themeSongs.ts` is now a re-export of `stopThemeSong`; the music service and `MusicHost` stop it
  when the queue or a video starts, and it does not start while the queue is active. Volume HIGHEST = 0.75 (the
  preference spec's value; wave3a used 1.0); the music test was updated.

### Settings

- Entry points: drawer Settings, user settings (`/settings/user`), subtitle style (+ HDR copy), Home customization
  (`CustomizeHome` -> `/home/settings`, as upstream links it), Seerr settings entry (`SeerrIntegration` row), Sign
  out, License, Debug.
- "Customize Navigation Drawer Items" now opens main's `NavDrawerPinsDialog` (settings kept only the row);
  `NavDrawerPinsPreference.module.css` deleted.
- Preferences: browse / detail / search / Home and the settings screens use the same generated keys
  (`src/stores/preferences.gen.ts`), so there is nothing to map.

### Seerr

- Drawer Discover entry while linked (wave3a's `DiscoverDrawerFlag`).
- Detail pages: `src/features/discover/DetailDiscover.tsx` adds the "Discover" row (similar titles) to movie and
  series pages and the person's credits row (cut at the Home items-per-row preference with a "View more" card)
  to person pages, and the series "Discover" button after Delete. All render nothing while Seerr is not linked.
- Search: `src/features/discover/searchProvider.ts` registers the provider of main's search extension point
  (`registerSearchDiscoverProvider`), installed from `DiscoverDrawerFlag`; movie and TV results only.

### Shell

- One Back control per page: unchanged rules (`useHideBackButton()` on full-screen pages with their own Back);
  checked on the player, settings, music, photos, Live TV, Discover pages in the crawler pictures.
- Music mini player: body padding and `body[data-music-bar]` page height rules kept; e2e checks the padding.
- Screensaver: `<AppScreensaver />` once in `src/app/providers.tsx` (its own rules skip playback and typing).
- Client log installed at startup (`src/app/startup.ts`), so the Debug page sees the whole session.
- `useHeaderOnFirstRow` and `Collapse.module.css` moved to `src/features/common` (Live TV's copy deleted).

### UI kit

- `Button` forwards every `data-*` attribute (typed as a template-literal index signature).
- Dialog without dim: main's `Dialog` already had `scrim={false}`; Music and Live TV view-options dialogs use it
  (Live TV's hand-rolled portal replaced by the shared `Dialog`).
- Tokens `--fx-white`, `--fx-gray`, `--fx-black` come from `tools/gen-tokens.mjs` (Compose `Color.White`, `Gray`,
  `Black`; added in the generator, not in `docs/spec/design-tokens.json`, which this task could not edit) and
  replace the hex literals in seek bars, Seerr badges, the recording marker, player / trickplay / subtitle-preview
  surfaces, card frame text, watched badge, slider thumb, star rating, voice overlay, photos.

## 4. Gates (this branch)

- `npm run gen`, `typecheck`, `test` (49 files, 535 tests), `lint` (0 errors, 26 warnings), `build`: pass.
- `npm run e2e` twice: 62 passed each time (port override `E2E_PORT=5801`).
- Crawler `final-merge-test` (test server, PURPLE, desktop-1920x1080 + phone-390x844): 388 pictures, 382 ok,
  6 warnings, 0 errors, 1 scene skipped for lack of data. The warnings were `item-photo` (expected redirect),
  `item-playlist-row-menu` (picked an audio playlist) and `play-movie` (streaming video never settles); the scenes
  were fixed and re-run (`final-merge-test-fixes`: 12 ok, 0 warn). No route stub remains in the app or the crawl.
- Docker: image built; container `wholphin-web-int-app` on 127.0.0.1:8098 (`JELLYFIN_URL` = test server) served the
  app under CSP, `nosniff`, `no-referrer`, Permissions-Policy and COOP; `/healthz` 200; sign-in; one H.264 item
  played about 7 s under the CSP with no CSP violation and a Stopped report on exit; container removed. The only
  console errors were the expected `/wholphin/public` 404 (Home's plugin probe).
- Real server (read-only): Discover e2e (Seerr sign-in only; the request POST was answered by the test, never
  forwarded), plus a manual check of the search Discover row, series Discover row and button, person Discover row.
  No Seerr request was created; no Live TV timer or recording was created anywhere (writes answered locally).

## 5. Still open

- Search: a Live TV program card plays its channel; upstream opens the program dialog. The extension point
  (`registerSearchProgramHandler`) is there; Live TV has not registered it (needs a dialog host and the same
  write guards as the guide).
- The context menu's Play on a music album / artist is not offered (upstream uses a separate music menu,
  `ContextMenu.ForMusic`, not ported in the shared menu).
- e2e known issue 1 (two highlighted cards with a mouse on Home) still reproduces; the test keeps `test.fail()`.
- wave3a's `PhotoFolderView` stays the photo grid (merge notes 4.2); not replaced by browse's grid.
- `web_previous` / `web_next` vs `web_playback_previous` / `web_playback_next` duplicate strings.
- The Discover drawer highlight on a Discover URL opened directly (main's stack rule highlights Home).
- `npm ci` from a clean checkout not run; the full 8-theme crawl, laptop / tablet viewports, RTL crawl not run.
- The test server's played state after crawls: the crawler's player scenes report progress as before; the H.264
  item's seeded resume point was restored after the container check (`npm run ts:verify` passes).

## 6. Where main's in-flight fix pass will conflict

The fix pass edits `src/ui/**`, `src/app/**`, `src/theme`, `vite.config.ts`, `package.json`, existing `e2e/` files and
`src/features/{browse,detail,search,home}`. Files this merge changed in those areas:

| Area | Files changed here | Expect |
|---|---|---|
| `src/ui` | `buttons/Button.tsx` (data-* forwarding), `cards/CardFrame.module.css`, `cards/DiscoverItemCard.module.css`, `cards/DiscoverItemCard.tsx`, `cards/WatchedBadge.module.css`, `inputs/Slider.module.css`, `text/StarRating.module.css` (hex -> `--fx-*`), plus wave3a's `icons/MaterialIcon.tsx` (player icons), `overlays/DialogPopup.tsx` (`initialFocusIndex`), `cards/PersonCard.tsx` (`minHeight: 0`) | Textual conflicts if the fix pass touches the same lines (focus restore, long-press, input modality, scrollbars); keep both |
| `src/app` | `spatialNav.ts` + test (both attributes), `AppShell.tsx` (Back slot attribute), `layouts.tsx` (Discover flag, search provider, `MusicHost`), `providers.tsx` (screensaver), `startup.ts` (client log, clear-track-choices handler), `nav.ts` (`slideshow`), `routes.tsx` (doc row), `shell/AppShell.module.css` (music bar height), `shell/useFocusRestore.ts` (`data-no-focus-restore`), deleted `RouteStub.tsx` | Likely: `spatialNav.ts`, `useFocusRestore.ts`, `AppShell.tsx`, `layouts.tsx` (shell focus work) |
| `src/theme` | `tokens.css` (generated: three `--fx-*` lines) | Regenerate with `npm run gen` after merging `tools/gen-tokens.mjs` |
| `vite.config.ts` | wave3a's dev plugin `spaRoutesOverRootFiles`, Vitest `server/**` include, worktree-only watch ignore, `optimizeDeps.entries` | Conflict with the build-target change: keep both |
| `package.json` | scripts union | Conflict likely; take the union again and `npm install`, then `npm ls rvfc-polyfill` |
| `e2e/` existing files | `fixtures/app.ts` (`gridCards`, `detailButtons`, doc), `fixtures/env.ts` (`realServerAccount`), `README.md`, specs `context-menu`, `drawer`, `home`, `layout`, `navigation`, `preferences`, `signin` | Conflicts where the fix pass edits the same tests; new specs (`playback`, `settings`, `music`, `photos`, `livetv`, `discover`) are new files |
| `src/features/browse` | `CollectionFolderPage.tsx` (dispatch), `FilteredCollectionPage.tsx` (music genre) | Conflict if playlist view options / hover intent touch these pages |
| `src/features/detail` | `MediaItemPage.tsx` (+ CSS), `movie/MovieDetails.tsx`, `series/SeriesDetails.tsx`, `series/SeriesDetailButtons.tsx`, `person/PersonPage.tsx` (Discover), `playlist/PlaylistDetails.tsx` (audio -> music queue), `common/themeMusic.ts` | Likely in `PlaylistDetails.tsx` (playlist view options) and the series / box-set header files |
| `src/features/search` | `SearchPage.tsx` (Play key resume), `VoiceSearchOverlay.module.css` | Likely with the search fixes |
| `src/features/home` | none | - |
| `src/features/common` | `itemMenu.tsx` (+ test), `itemMenuHandlers.ts` (`playMusic`), new `useHeaderOnFirstRow.ts`, `Collapse.module.css` | Possible if the fix pass touches the item menu |

After that merge run `npm run gen`, every gate, `npm run e2e` (twice), the crawler and the container check again.

## 7. Repair

Two independent checkers examined the merged app and reported 24 findings. Each was confirmed or rejected against
the code and the running app (test server; the real server read-only for the Seerr search), fixed in order
major then minor (there were no blockers), and re-checked in a headless, muted browser. Commits on `integration`,
oldest first: `1550b6c` to `4cd56b1` (14 commits), then this section.

### 7.1 Fixed

| Severity | Finding | Change | Files |
|---|---|---|---|
| major | Seerr search with a space answers 400 | `buildSeerrUrl` percent-encodes (`%20`, and `!'()*`) instead of `URLSearchParams` (`+`); the unit test asserted the wrong form | `src/api/seerr/client.ts`, `client.test.ts` |
| major | Screensaver starts while music plays | `addMediaPlayingProbe()` in the screensaver service; the music service registers its detached `Audio` elements | `photos/screensaverService.ts`, `music/service/musicService.ts` |
| major | Home loses focus after playback reorders a row | When a row refresh removes the focused card and focus fell to the body, Home refocuses the remembered row and column (clamped), as upstream keeps the RowColumn | `home/HomePage.tsx` |
| major | Add to playlist, Media information and the choosers fall back to the placeholder after a user switch | The restore function of `setItemMenuHandlers()` puts back only the keys that call set, and only while they are still its own; `clearTrackChoices` is installed once (startup) | `common/itemMenuHandlers.ts` (+ new test), `detail/common/itemDialogs.ts` |
| major | Music, player, Live TV, settings and Discover CSS draw two highlights | Hover looks under `:where(:root[data-pointer])`, focus looks under `:where(:root:not([data-pointer]))` in the 17 listed modules (the PIN entry's text-entry ring is left as is) | 17 `*.module.css` |
| minor | More menu stays open after a track pick | `chooseStream(item, kind, onChosen)`: a pick closes the menu, a cancel returns to it (ContextMenu.kt calls `onDismissRequest` after `onChooseTracks`) | `common/itemMenu.tsx`, `common/useItemContextMenu.tsx`, `detail/common/{itemDialogs.ts,ItemDialogsHost.tsx,StreamChooserDialog.tsx}` |
| minor | Pages open with nothing focused | Series overview focuses the selected episode once its season loads; the Live TV guide takes arrival focus on any non-touch device (was keyboard modality only) | `detail/series/SeriesOverview.tsx`, `livetv/GuideGrid.tsx` |
| minor | Grid Down from the second-last row jumps to the letter bar | Down from a column the short last row lacks goes to the last item | `browse/components/LibraryGrid.tsx` |
| minor | Back from Home after sign-in returns to the user list | A login dialog opened from the list steps back onto the list's entry and replaces it with Home | `setup/SwitchUserScreen.tsx` |
| minor | `/library/<id>` of Live TV or a recording folder highlights Home | `selectionForPath` matches a library entry by item id under either prefix | `app/shell/drawerItems.ts` (+ test) |
| minor | Three remembered-tab stores; music ignores "Remember selected tab" | `livetv/rememberedTab.ts` deleted (Live TV uses browse's store); the music library uses `useTabState` | `livetv/LiveTvView.tsx`, `music/MusicLibraryPage.tsx` |
| minor | "Send media info log to server" is a placeholder | Ported `ServerReportService.sendMediaReportFor`: media sources, playback preferences and the device profile to `POST /ClientLog/Document`, then upstream's "Sent! Filename=" toast | new `settings/sendMediaReport.ts`, `app/startup.ts` |
| minor | Same server data under several query keys | One `itemKey(id)` (`src/api/queryKeys.ts`) for `GET /Items/{id}` in detail, music, photos, browse and Live TV; one recording-folders entry (full items, shared by the drawer, Home and Live TV); one playlist can-edit key | commit `4cd56b1` |
| minor | Unused `data-focus-enter` mechanism | Removed; `spatialNav.ts` equals main's again | `app/spatialNav.ts` (+ test) |
| minor | Mini player hardcodes the rail and the full-screen route list | NavDrawer publishes `--shell-rail-width` / `--shell-rail-open-width`; the bar shows only while an AppShell is mounted (`shellMounted` flag) | `app/shell/{NavDrawer.module.css,shellFlags.ts}`, `app/AppShell.tsx`, `music/MiniPlayer.*` |
| minor | Literal colours in merged features | `--fx-red/green/blue` and `--fx-log-debug/info/warn/error` added in `tools/gen-tokens.mjs`; every `rgb(0 0 0 / a)` and `rgb(255 255 255 / a)` in `src` CSS now derives from `--fx-black` / `--fx-white` | `tools/gen-tokens.mjs`, 24 CSS files |
| minor | Quick Connect literal English; 7 unused `web_` keys | `web_quick_connect_failed`; removed `web_dev_login`, `web_submit`, `web_cancel`, `web_delete`, `web_seerr_server`, `web_photos_seconds`, `web_screensaver_label` | `settings/QuickConnectPreference.tsx`, `i18n/extra/en.json` |
| minor | e2e: a focus bug lost its test, README stale | The fallback of `focusPageWhenReady` gives `<main>` a temporary `tabIndex=-1` (removed on blur) and the shell no longer records `<main>` as the last content focus; new drawer spec "a page without focusable content still takes focus out of the drawer" (Favorites emptied by a route mock); README entries 2 and 3 updated | `app/shell/shellFocus.ts`, `app/shell/AppShell.module.css`, `e2e/specs/drawer.spec.ts`, `e2e/README.md` |
| minor | main's slideshow `?start=true` scene dropped | Restored as scene `slideshow` | `tools/shots/scenes.ts` |

### 7.2 Rejected

- **Three Backs to leave the player during an intro.** Faithful: `PlaybackPage.kt` hides the controls first, then
  `BackHandler(showSegment)` dismisses the Skip button, then Back leaves.
- **Nested filter menu covers its parent on a phone.** Faithful: `FilterByButton.kt` opens menu 2 at a fixed
  80,16dp offset from the button, over menu 1; at 390px it is clamped to the window. Both menus stay usable.
- **HTTP 500 on `hls1/main/-1.mp4` after an audio switch.** Not reproduced: Multi Track Showcase transcoding from
  50 s, audio 4 to 5 in headless Edge; the old session's DELETE (204) came before the new PlaybackInfo, the new init
  segment answered 200, no video request failed or answered 5xx. The engine already destroys hls.js before the
  encoder is killed. Most likely a transient server answer.
- **Photo album opens with nothing focused.** Not reproduced: a direct `/item/<album>` load and Enter on the album
  card in the photo library both focus the first photo, and ArrowDown moves inside the grid.
- **Loosened e2e assertions (context-menu clamp, Home backdrop only with BackdropImageTags).** Both match the merged
  behaviour (the menu is clamped to the window; an item without a backdrop has none to show); kept.

### 7.3 Deferred (needs the lead)

- **Web-only strings in Hebrew (and every other non-English locale).** There is no translation source for the
  190 `web_` keys, and upstream's `he.json` lacks `server_version_not_supported_future`. Needs a decision on
  translating web-only strings (who, which locales).
- **Two header-collapse policies.** Browse's scroll-based tab-row collapse (movies, TV, Live TV recordings) against
  the focus-only rule of `useHeaderOnFirstRow` (music, Discover, guide, photos). Choosing one changes the behaviour
  of the other features.

### 7.4 Deviations and decisions introduced

- Live TV guide arrival focus: `TvGuideGrid` always requests focus on TV; the web now does it on every non-touch
  device (mouse arrivals included; the focus look stays hidden while `data-pointer` is set), like Home's launch focus.
- Recording folders: a 401/403 now reads as "no folders" on the Live TV page too (one shared cache entry; the
  NavDrawerService rule).
- Sign-in from the user list: a browser cannot clear its history, so the list's entry is replaced by Home; Back from
  Home goes to whatever preceded the user list.
- "Send media info log" uploads the preferences of the playback and player-backend groups (upstream: the playback
  and experimental protos) and the device profile the web player would send; the toast stays upstream's English.

### 7.5 Verification

- Gates on the final tree: `npm run gen`, `typecheck`, `test` (50 files, 535 tests), `lint` (0 errors, 26 warnings
  of the existing kinds), `build`, `e2e:typecheck`. `npm run e2e` twice with `E2E_PORT=5821`: 63 passed both times
  (62 plus the new drawer spec). `npm run ts:verify` passes afterwards.
- Browser checks (headless, muted; scripts in the git-ignored `shots/out/repair/`): album page keyboard focus plus
  mouse hover lights only the hovered row; the guide lights one cell; while music plays no screensaver after more
  than the start delay, and it shows once the music stopped; the mini player shows on the album page and Home, is
  hidden on Settings and moves with the open drawer; sign out, sign in from the list, then Back stays on Home and
  Add to playlist opens its dialog; Choose Audio closes the More menu with focus back on More, a cancel returns to
  the menu; grid Down reaches the last item; the drawer marks Live TV at `/library/<id>`; series overview, Live TV
  and photo album arrival focus; Home refocuses 0:2 after a forced refresh dropped the focused item (old code:
  BODY); a multi-word Seerr search answers 200 (real server, read-only, every Seerr write mocked, no request
  created); Send media info log uploads and toasts the file name (test server).
- Crawler run `repair-check` (PURPLE, desktop and phone; slideshow, photos, Live TV, music, settings and player
  scenes): 76 pictures, 76 ok.
- Not verified: Hebrew strings (deferred), the full 8-theme crawl, laptop and tablet viewports.

## 8. Stage 2: the fix pass merged

`main` moved one commit past the merge base while sections 1 to 7 were written: the fix pass (`3ab4a60`: browser
baseline, one input-modality tracker, touch long-press, overlay focus return, ResizeObserver work in the next
frame, the playlist page on the library grid, "Send media info log", hover intent, the firefox / webkit / iphone
e2e projects, the crawler's `--engine`). This section records its merge into `integration`: the textual
conflicts, the places where both sides had solved the same problem or where one side's new rule did not reach the
other side's code, what was converted, the baseline audit and the gates.

### 8.1 Commits

| Commit | What |
|---|---|
| `cdd9097` | `git merge --no-ff main` with the 17 conflicts resolved (8.2) |
| `e48f2c9` | The fix pass's rules applied to the newer features: input modality, long-press, hover intent, arrival focus, ResizeObserver, highlight gating (8.3, 8.4) |
| `1ac3ac4` | One playlist page for audio and video playlists (8.3 item 7) |
| `4b7ffd5` | Baseline guards and the reduced-motion fix (8.5) |
| `39633bf` | e2e: engine smoke subset for settings, music, photos, Live TV, playback (8.6) |
| `22a67a5` | e2e README |
| `c6a1d1f` | Focus restore only on the page it was remembered on (found while verifying, 8.3 item 15) |
| `b22cbc6` | Crawler: Firefox may autoplay (8.6) |
| (this section) | Notes |

### 8.2 Textual conflicts

| File | Resolution |
|---|---|
| `tools/gen-tokens.mjs`, `src/theme/tokens.css` | Integration's `--fx-*` set (white, gray, black, red, green, blue, the four log colours) already contains main's `--fx-white`; kept once, `tokens.css` regenerated with `npm run gen` |
| `src/ui/cards/WatchedBadge.module.css` | `var(--fx-black)` border (integration's sweep) with `var(--fx-white)` check (both sides) |
| `src/ui/overlays/DialogPopup.tsx` | Both props: `initialFocusIndex` (integration) and `returnFocus` (main), both passed to `Dialog` |
| `vite.config.ts` | Both: the dev plugin `spaRoutesOverRootFiles`, `optimizeDeps.entries`, the `server/**` tests, the worktree watch ignore, and `BROWSER_TARGETS` with `build.target` / `cssTarget` |
| `src/app/startup.ts` | Main's unsupported-browser guard and `installModalityTracking()`; integration's client log and the item-menu handlers installed at startup (clear track choices, send media info log) |
| `src/app/shell/shellFocus.ts` | Main's design (8.3 item 2); integration's `focusPageArea` (temporary `tabIndex`) removed, its rule "`<main>` is never the last content focus" kept |
| `src/features/detail/common/itemDialogs.ts` | Integration's `chooseStream(item, kind, onChosen)` and "clear track choices is installed at startup"; main's `sendMediaInfoLog` handler moved to startup (8.3 item 1) |
| `src/features/detail/playlist/PlaylistDetails.tsx` | Main's library-grid page with integration's changes on top (8.3 item 7) |
| `src/features/detail/series/SeriesOverview.tsx` | One arrival-focus effect: main's (next frame, `mayTakeInitialFocus`), integration's dropped; main's season-tab long-press kept |
| `src/i18n/extra/en.json` | Union; the report toast is one key (`web_report_sent`, 8.3 item 1) |
| `e2e/specs/context-menu.spec.ts` | Integration's position check (a corner at the pointer, or clamped inside the window) and main's focus-return test with its `@engines` tag |
| `e2e/specs/drawer.spec.ts` | Integration's stricter URL and "first favorite card is focused" checks, main's `app.tap()`; both empty-page tests kept: Favorites emptied by a route mock (now also asserts Left returns to the drawer entry) and main's Live TV entry test (the page is real now: focus lands in the guide) |
| `e2e/specs/home.spec.ts` | Main's backdrop assertion (a superset of integration's) |
| `e2e/specs/navigation.spec.ts`, `e2e/specs/signin.spec.ts` | Both sides' assertions (grid cards and detail buttons visible; URL, Back button, drawer entry marked) |
| `e2e/README.md` | One coverage table (integration's feature rows, main's engine rows), "Known app issues: none open" |

Generated files were regenerated, not merged by hand. `package.json` and the lockfile did not conflict.

### 8.3 Semantic overlaps

1. **Send media info log.** One implementation, `src/features/detail/common/mediaReport.ts`: main's pure
   `buildMediaReport` with upstream's blocks in upstream's order (header, `playbackPrefs`, `experimental`,
   `mediaSources`, `deviceProfile`), now with the device profile the playback engine builds (integration's part).
   It is installed from `app/startup` by dynamic import (the engine stays out of the entry chunk and the handler
   exists on every route). `settings/sendMediaReport.ts` is deleted. The log header is one function
   (`buildLogHeader` in `settings/debugInfo.ts`) shared with "Send app logs", as upstream shares it. One toast
   string, `web_report_sent`, for both reports (two literal English toasts before). One test file; it also checks
   the preference list against the proto paths of `docs/spec/preferences.json` (`dpadSeekMode` was missing).
2. **Page with nothing focusable.** Main's design: `<main>` has a permanent `tabIndex={-1}`, focus is parked on it
   at once after a drawer navigation and the page's first element takes over when it shows up; `installPressFocus`
   keeps Safari from dropping focus onto `<main>` on a click. From integration: `<main>` is never recorded as the
   last content focus (leaving the drawer looks for the page's first element), and `.page:focus` draws no ring.
   `mayTakeInitialFocus()` now also treats `<main>` as "nothing focused". Both sides' drawer tests pass.
3. **One highlight at a time.** The 17 modules integration gated with `:where(:root[data-pointer])` /
   `:where(:root:not([data-pointer]))` read the same attribute main's tracker sets (first real pointer movement
   sets it, any key removes it). A grep over every CSS module for `:hover` / `:focus-visible` outside that gating
   found two stragglers, both fixed: the DVR schedule rows (resting background was tied to `:not(:focus-visible)`)
   and the player's seek bar (a JS `focused` class kept it thick while the pointer owned the highlight). Left as
   they are: text-entry rings (`TextField`, PIN entry), `:focus-within` rules that reveal controls (slideshow top
   bar, tab row, alphabet picker). Checked in a browser on the album page and the guide: exactly one element looks
   focused after a key press, after a mouse move, and after the next key press.
4. **Input modality.** Converted to `src/ui/lib/inputModality.ts`: `home/useHomeFocus.ts`, `detail/series/
   EpisodeStrip.tsx` and `search/SearchPage.tsx` (main's three stragglers: each kept its own "last pointer"
   variable; new `lastInputWasTouch()`), `playback/ui/PlayerSheet.tsx` (opener from `captureOpener()`, focus back
   with `restoreFocus()`), `photos/ViewOptionsPanel.tsx` (it returned focus nowhere and refocused its first row on
   every change). No feature reads `sourceCapabilities` or `button === -1`. Reading `event.pointerType` inside a
   pointer handler is not modality tracking and stays.
5. **Touch long-press.** Converted: music song rows (`music/components/SongRow.tsx`: album, artist and queue rows)
   through `useLongPress`; `settings/ClickPreference.tsx` lost its own 600 ms timer (its `ListItem` now times the
   press: after the merge both fired, so "Installed version" opened the Debug page twice). Already covered by
   `CardFrame` / `ListItem`: photo cards and rows, music cards, people rows, user and server circles, playlist
   rows, recordings grid. Already had a visible More button: song rows, queue rows, playlist rows, circles. No
   menu upstream, nothing to convert: guide cells and channels (`onLongClick = {}`), Discover cards. The sort
   buttons' right-click (flip direction) is a web shortcut for something the menu also does.
6. **Arrival focus.** Series overview: one effect (main's). Playlist page: the library grid's own arrival focus
   (integration's hand-written one went with the old page). Discover buttons and tabs, music buttons, the photo
   grid and the guide now ask `mayTakeInitialFocus()` instead of comparing with `<body>` (with `<main>` parked,
   their own check would have refused).
7. **Playlist page.** Upstream has one `PlaylistDetails` for every playlist. Main rebuilt it on the library grid;
   integration had routed audio playlists to its own `MusicPlaylistPage`, so main's playlist tests (which use the
   audio playlist) could not pass and the grid page had no music behaviour. Kept: main's page for every playlist.
   Added to it from the music side: the music menu on songs (`ContextMenu.ForMusic`, through the grid's new
   `menuFor` prop, in list and grid layouts), the queue marker on song rows (`MusicQueueMarker`, extracted from
   `SongRow`), Play all / Shuffle into the music queue through the `playMusic` handler, the Play key and the menu's
   Play on a song as a one-song queue, the shared can-edit query key. `MusicPlaylistPage` and its styles are
   deleted.
8. **Item-menu chooser.** `chooseStream(item, kind, onChosen)` and the restore rule of `setItemMenuHandlers` are
   untouched by the merge (main only added a handler in `itemDialogs.ts`); the handlers test passes.
9. **Tokens.** Union in `tools/gen-tokens.mjs`. No hex or `rgb()` literal is left in `src` CSS (one fallback in
   the playback dev page removed).
10. **Shared query keys.** Main's new code reads no single item through a private key; the playlist can-edit
    query uses `playlistCanEditKey`.
11. **ResizeObserver.** One helper, `src/ui/lib/observeResize.ts` (work in the next frame, latest notification
    only), used by the library grid, tile grid, item grid, episode strip, Discover layout, guide, subtitle layer;
    the subtitle preview got the same pattern inline (it needs the content rect). Setters keep the old state when
    nothing changed. `CardGrid` and `ItemRow` keep main's own copies of the pattern.
12. **Browser baseline.** See 8.5.
13. **Theme music.** One player, merged without conflict: integration's "not while the music queue plays, stopped
    by the queue and by video" with main's `getAutoplayPolicy` check; levels as before (HIGHEST 0.75).
14. **`vite.config.ts`.** Both sides (8.2).
15. **Found while verifying.**
    - *Hover intent.* Main's rule (a hover takes the header after 250 ms, and only while the pointer owns the
      highlight) now also holds for Discover cards and genre cards, music recommendations, the guide's program
      header and the photo grid's position.
    - *Reduced motion.* The app's own rule gave every element a 0.01 ms transition, `visibility` included, so a
      menu that had just been placed still computed as hidden and refused focus: for users with
      `prefers-reduced-motion` the right-click menu and the player controls opened unfocused. The e2e suite hid
      this by removing every transition. Fixed in `global.css` (transitions 0 s; animations keep their token
      duration), with a test that runs without the suite's stylesheet.
    - *Focus restore.* The first history entry of every document load has the same key, so a URL opened in the
      same tab took the focus position of the page before it. The remembered focus now carries its path.

### 8.4 Deviations and decisions

- Audio playlists use the same page as video playlists (upstream does; the web had two). The grid layout of an
  audio playlist shows the songs' own images, which are usually missing: the list layout is the default.
- "Send media info log" has no `itemId=` line any more (main's addition; upstream has none: the media sources
  carry the ids). Android's flavor / manufacturer / model / API level are the app and device sections of the
  Debug page, in both reports.
- The report toasts ("Sent! Filename=...", "Error: ...") go through i18n (`web_report_sent`, `error`); upstream
  hard-codes the English text.
- A touch long-press on a preference with a long-click action fires after 500 ms (the kit's timer), not 600 ms.
- Reduced motion: transitions are instant (0 s). Before, they lasted 0.01 ms, which nobody could see either.
- The drawer's spring easing is one custom property with a `cubic-bezier` fallback for Safari before 17.2.

### 8.5 Baseline audit (Chrome / Edge 119, Firefox 128, Safari 16.4)

Method: `npm run build` with the targets, then a pattern scan of `dist/` (app code, hls.js, the JASSUB worker and
wasm loaders, the `requestVideoFrameCallback` stand-in) and of `src/` for APIs and CSS newer than the baseline.

| Finding | Where | Result |
|---|---|---|
| `AbortSignal.any` (Safari 17.4) | Seerr client | Guarded: `anySignal()` falls back to a controller that follows every signal; test added |
| `linear()` easing (Safari 17.2) | drawer, page area, mini player | One `--shell-spring` property with a fallback behind `@supports` |
| `:dir(rtl)` (Chrome 120) | six CSS modules | Lowered by the build to `:lang(...)` lists for the targets; nothing to do |
| unprefixed `mask-image`, `user-select`, `line-clamp` | several | The build emits the `-webkit-` forms next to them |
| `requestVideoFrameCallback` (Firefox 132) | JASSUB | The vendored stand-in installs it when missing; the player's own use is guarded |
| JASSUB renderer | worker | WebGL2, else WebGL1, else 2D canvas (Safari 16.4 has only 2D in an `OffscreenCanvas`); module workers and wasm SIMD are inside the baseline |
| `ManagedMediaSource`, Picture-in-Picture, fullscreen, wake lock, `mediaSession` actions, `getAutoplayPolicy`, `crypto.randomUUID`, clipboard, Cache Storage | playback, music, settings | All feature-detected or inside `try` already |
| `:has()`, container queries, `dvh`, `color-mix`, relative colours | CSS | Inside the baseline (Firefox 121 / 110 / 101 / 113 / 128) |

`index.html`'s feature test and `BROWSER_TARGETS` are unchanged and agree (relative colours, `color-mix`,
`isWellFormed`, `findLast`, lookbehind). Nothing found needs a higher floor.

### 8.6 e2e and crawler

- Projects: `setup`, `desktop`, `keyboard`, `phone`, `writes`, `firefox`, `webkit`, `iphone`; run isolation by
  `E2E_PORT` / `E2E_RUN_ID`. 22 spec files, 188 tests (59 desktop, 15 keyboard, 20 phone, 7 writes, 33 firefox,
  33 webkit, 14 iphone, 7 setup). No `test.fail`, `fixme` or `only`. Two `test.skip` calls remain, both
  conditions on data: the Discover spec without the real server's test account, the Live TV drawer test on a
  server without a Live TV library; a third in the new playback test fires only when an engine reports it cannot
  decode H.264 (neither engine does).
- New tests: the audio playlist (music menu, focus back to the row, Play all marks the rows); reduced motion
  without the suite's stylesheet; a 15 s H.264 clip in Firefox and WebKit (`playback-engines.spec.ts`: plays,
  pauses, Back leaves, the Stopped report arrives; each engine has its own clip, user data restored).
- Smoke subset for the newer features (`@engines`, plus `@iphone` where marked): settings theme dialog (+ iphone),
  music library (+ iphone), album Play with the mini player and its progress, photo album into the viewer
  (+ iphone), the guide and its program dialog.
- What the engines reported about H.264 + AAC in MP4, headless: Firefox `canPlayType` "probably", MediaSource
  supported; Playwright's WebKit on Windows `canPlayType` "probably" but no `MediaSource` at all and no native HLS
  (`canPlayType('application/vnd.apple.mpegurl')` is empty). Direct play of an MP4 works in both; anything that
  needs HLS (remux or transcode) cannot be tested in that WebKit build.
- Crawler: both sides' scenes resolve (195 scenes; 1 skipped for lack of data); `--engine` and the `wide`
  viewport work with them. Firefox now gets autoplay prefs like Chromium's flag.

### 8.7 Gates (final tree)

- `npm run gen` (no diff), `typecheck`, `test` (54 files, 553 tests), `lint` (0 errors, 26 warnings of the
  existing kinds), `build` (with the browser targets), `e2e:typecheck`: pass.
- `npm run e2e` twice in a row (own port): 188 passed both times, 0 failed, 0 flaky, 0 skipped, about 4 minutes
  each.
- `npm run ts:verify` afterwards: 30 checks pass (seeded resume points, next up, libraries, playlists; no Live TV
  timers).
- Crawler, test server, PURPLE, desktop-1920x1080 + phone-390x844: 390 pictures, 390 ok, 0 warnings, 0 errors.
  Contact sheets of every feature were looked at (Home, drawer, libraries, detail pages, both playlists, series,
  Live TV guide / DVR / recordings, music library / album / Now Playing, photos / viewer / screensaver, player and
  its sheets, settings and its dialogs, setup, phone layouts).
- Extra: 73 scenes of the newer features in WebKit and in Firefox (`--engine`, wide + phone): 146 pictures each,
  0 errors; warnings in 8.8.
- Browser checks (headless, muted): audio playlist page (music menu in list and grid, Play all, Play key);
  one highlight on the album page and the guide; touch long-press on a song row (one menu, no playback) and on
  "Installed version" (one navigation); photo view options (focus in, stays on the changed row, back to the
  button); player sheet (focus in, back to its button with keyboard and mouse); player controls focus on
  Play / Pause under reduced motion; album page arrival focus on Play.
- No Seerr request was created, nothing on the real server was written. No Live TV timer or recording was created
  anywhere (the specs and scenes answer those writes locally).

### 8.8 Still open

- Crawler under `--engine webkit` / `firefox`: a few scene `prepare` steps of the newer features time out (warnings,
  not errors): `play-paused` in WebKit (the scene's MKV needs HLS, which that WebKit build lacks),
  `now-playing-controls` (WebKit wide and phone, Firefox phone: the scene's pointer / touch gesture; the controls
  do show on a mouse move in WebKit when driven directly), `livetv-program-dialog` in Firefox (the scene's click on
  the second program times out; the same click works when driven directly and in the e2e test). Scene scripts, not
  app behaviour, as far as checked.
- `CardGrid` and `ItemRow` still carry their own copies of the next-frame ResizeObserver pattern instead of
  `observeResize()`.
- The name label under a user / server circle opens the menu on right-click but not on a touch long-press (the
  circle and its More button do).
- A grid-layout audio playlist shows placeholder images for songs without their own image (upstream resolves
  song images the same way; album art would be a web addition).
- Everything listed in section 5 and 7.3 that this stage did not touch (search program dialog, the context menu's
  Play on albums and artists outside the music pages, the Discover drawer highlight on a direct URL, web-only
  strings in other locales, the two header-collapse policies, `npm ci` from a clean checkout, the 8-theme crawl,
  laptop / tablet viewports, the RTL crawl, the container check after this merge).

## 9. Stage 2 repair

Three independent checkers (code seams, browser engines, user journeys) examined the stage-2 merge and returned
31 findings: 4 major, 27 minor. A first repair pass committed `4b69c7b` (the majors), `6c0ace2` (the minors) and
`845a917` (an e2e fix) and was cut off before anything was verified or written down. This section is the second
pass: every finding checked against those commits and the running app (headless, muted; the throwaway test
server), the rest fixed, `main`'s documents merged (`ccad56c`, clean), seven fixes collected by the lead, and the
gates on the final tree. Commits of this pass, oldest first: `ccad56c` (merge), `c4f0065`, `9928999`, `bfd12d3`,
`d4426f1`, `76c8766`, `8ea55f4`, `041fdbf`, `079ef31`, `4b151ca`, `dea5a95`, `45f7b10`, `7bc69d0`, then this
section. (`c4f0065` also carries the move of the server-version helper, which was staged early; the commits
between it and `041fdbf` do not typecheck on their own.)

### 9.1 The 31 findings

Status: **fixed** (in which commit), **rejected**, **kept** (a deliberate difference, recorded). "Seen" names how
it was checked in this pass; engines are Playwright's builds.

| # | Sev. | Finding | Status | Seen |
|---|---|---|---|---|
| 1 | major | Photo filter panel moves focus back to the first slider after every change | fixed `4b69c7b` | Chromium and Firefox: panel opened from Filter, Down twice, Right three times: focus stays on the third slider and only its value changes (100 to 103); Escape closes it. Focus then rests on the viewer, not on the Filter button: opening the panel closes the overlay that holds that button, so there is no opener to return to |
| 2 | minor | Series overview keeps its own keyboard / pointer tracker | fixed `6c0ace2` | Code (`lastInput()` of the kit); series e2e |
| 3 | minor | Discover "View more" card takes the header at once on hover | fixed `6c0ace2` | Code only (hover intent like the cards beside it); needs Seerr to see |
| 4 | minor | Arrival-focus checks still compare with `<body>` (Home, genre tiles, "more" page) | fixed `6c0ace2` | Code (`mayTakeInitialFocus()`); the new drawer e2e (focus parked on `<main>`, then the first card takes it) |
| 5 | minor | Focus restore records `<main>` | fixed `4b69c7b` | With 12 |
| 6 | minor | Mixed-direction rule not applied to the newer features' headers | fixed `6c0ace2`, `8ea55f4`, `45f7b10`; part rejected | Music header, guide header, photo overlay, song rows (first pass); mini player, guide cells, genre page title, program dialog (this pass). Hebrew text put into an English interface: the mini player and guide-cell blocks stay at the start edge; in a Hebrew interface the program dialog's English title sits at the right edge. Rejected for the photo folder title and the Now Playing lines: they are centred, direction does not move them |
| 7 | minor | Playlist page writes a ref while rendering | fixed `6c0ace2` | Code (the grid state is recorded when the menu opens); audio playlist e2e |
| 8 | minor | Literal English toast in profile protection | fixed `6c0ace2` | Code |
| 9 | minor | Duplicate `web_` keys | fixed `6c0ace2`, `dea5a95` | Nine keys removed (the listed eight, and `web_shortcut_captions`, which repeated upstream's `subtitles`). `web_previous` / `web_playback_previous` and the two "next" keys stay: scrolling a row and the previous item of a queue are two meanings |
| 10 | minor | e2e README table, a loosened URL check, stale crawler comments | fixed `6c0ace2` | Read |
| 11 | major | WebKit: leaving the player leaves a ghost paused session | fixed `4b69c7b` | WebKit, 6 runs of the checker's steps: only Start and Stopped are sent, the server lists no playing item afterwards (before: Progress with paused just ahead of Stopped, session left paused in 3 of 6). Firefox and headless Edge, one run each: the same |
| 12 | major | WebKit: Back does not restore focus after a card was opened with the mouse | fixed `4b69c7b` | WebKit, real mouse presses: photo album card 4, Back: that card is focused (the saved entry holds its link); library card 5 and, at 1000x420 scrolled, card 15: focused again after browser Back, scroll kept |
| 13 | minor | Firefox: photo overlay opens without a visible highlight after a mouse-opened viewer | fixed `4b69c7b` | Firefox: the ring is on "Play slideshow" |
| 14 | minor | WebKit: a second click on the focused control drops focus to `<body>` | fixed `4b69c7b` | WebKit: a second click on a settings row keeps it focused, Down goes to the next row; Play / Pause in the player takes focus on a click |
| 15 | minor | Hebrew: Now Playing time labels swapped, transport reversed | fixed `6c0ace2` | Hebrew pictures, desktop and phone: elapsed under the left end, total under the right, previous on the left (NowPlayingButtons.kt uses PlaybackButtons, which forces left-to-right); the mini player's line fills from the left |
| 16 | minor | Hebrew: the video player's time labels are reordered | fixed `6c0ace2` | Hebrew picture; both labels compute `direction: rtl` inside the left-to-right row (PlaybackControls.kt:297-322) |
| 17 | minor | Hebrew: photo viewer arrow keys are mirrored | kept, recorded (9.4) | Upstream reads the raw keys (SlideshowPage.kt:269-290: Left is previous in every language). The web mirrors them: its on-screen arrows, its grids and its swipes are mirrored in Hebrew, and Left from a photo in the album grid goes to the next photo |
| 18 | minor | Hebrew: English fallback strings and left-to-right tokens are scrambled | fixed `6c0ace2`, `8ea55f4` | An i18n post-processor wraps untranslated text in a left-to-right isolate; key chips, licence names and stream chips fixed one by one. Hebrew pictures: "5 of 15", `@scope/name` licence rows, "HDR10+", full stops at the end, "J L". The isolate is part of accessible names: the e2e menu-button locator allows for it (the Hebrew test failed on phones after the first pass). The isolate characters were literal invisible characters in three source files; they are `⁦` escapes now |
| 19 | minor | Hebrew: the guide stays left-to-right and Left dead-ends on the channel column | fixed `6c0ace2`; the left-to-right guide was already a recorded deviation | Hebrew: Left from the first program reaches the channel, Left again the drawer entry |
| 20 | minor | Phone: Now Playing "View options" title drawn over the page text | fixed `6c0ace2` | Phone pictures, English and Hebrew: the title is on the panel |
| 21 | minor | WebKit: "Play with transcoding" offered when HLS itself is unsupported | fixed `6c0ace2` | WebKit, an MKV: the box offers Retry and Back |
| 22 | minor | Chromium: a press on the rim of a focused button is lost | fixed `6c0ace2` | Chromium: press 3 px inside the right edge of the focused More pill (91 px, 83 while pressed): the menu opens |
| 23 | minor | Chromium: after Back the first arrow continues from a stale position | rejected | The library has 15 items, so card 15 (index 14) is the last one and there is no next card. Right from the last card of a short last row goes to the nearest card on its right, in the row above; WebKit does the same now that 12 is fixed. `CardGrid.kt` has no key handling for it either (Compose focus search) |
| 24 | minor | Crawler: guide scenes empty outside the guide window; WebKit Now Playing scenes | fixed `6c0ace2` | The full crawl ran when today's 20:00 was outside the server's guide data: the guide scenes have programs. WebKit: 30 pictures of the Live TV and Now Playing scenes, 0 warnings; Firefox: 6, 0 warnings (the two open scene items of 8.8) |
| 25 | minor | Phone: audio playlist rows wrap while space stays unused | fixed `6c0ace2` | Phone pictures: the gaps went to the text. Long titles still wrap: the row also holds the runtime, the watched mark and three buttons |
| 26 | major | Mini player covers the end of full-height pages | fixed `4b69c7b` | Playlist at 1280x720 and 390x844, last row reached with the keyboard: it ends 8 px above the bar. Library grid, Home and a Recommended tab with music playing, scrolled to the end at 1280x560 and on a phone: nothing focusable under the bar. An e2e check compares the last row with the bar |
| 27 | minor | e2e "page without focusable content" never saw one | fixed `6c0ace2` | Both drawer tests pass |
| 28 | minor | Series overview: Enter right after an arrow returns to the wrong episode | fixed `6c0ace2`, e2e `845a917` | Chromium: three Rights 80 ms apart, Enter, Back: the URL and the focus are on the episode that was opened |
| 29 | minor | Music library has no arrival focus | fixed `6c0ace2` | Direct load (Recommended, Albums) and from the drawer: the first card |
| 30 | minor | Hebrew genre and tagline lines start 8dp outside the column | fixed `6c0ace2` | English interface, Hebrew text put into the genres and tagline of a movie page: the text starts at the same x as the lines around it |
| 31 | minor | Add to playlist focuses its Search field on touch devices | fixed `6c0ace2` | Phone and desktop: focus is on the first playlist; Up reaches Search (PlaylistList.kt:290-305: a placeholder takes the first focus, then the first result) |

Totals: 29 fixed (one of them partly rejected), 1 rejected, 1 kept as a recorded deviation, none deferred.

Found while verifying, and fixed:

- **The production Content-Security-Policy blocked the "browser too old" test** (`7bc69d0`). The fix pass put the
  test into `index.html` as an inline script; the server allows scripts from the app's own origin only, so in the
  container the test never ran and every page load logged a violation. The test is now `public/browser-check.js`,
  loaded before the module. A server test keeps `index.html` free of inline scripts. Seen in the container: no
  violation; with a failing feature test the notice shows and the app does not start.
- **Leftover test playlists** (`4b151ca`, `45f7b10`). The playlist-creating e2e test deletes its playlist, but
  Jellyfin writes the playlist's metadata file a moment after creating it; a delete that comes first leaves the
  folder (measured: a delete at once leaves it, one 1.5 s later does not). The server's scheduled library scan
  (every 12 hours) then lists every such folder again as a playlist without an owner, the app's permission lookup
  answers 404 for each, and the console guard failed the test: 24 of them had gathered. The test now waits 3 s
  before deleting, and the global setup removes leftovers older than ten minutes when the server's administrator
  is configured (only it may delete an ownerless playlist). The test server is clean again (two seeded playlists).
- **A flaky e2e test** (`4b151ca`): the theme test pressed Escape after choosing a theme. Choosing closes the
  dialog, so depending on timing Escape was the shell's Back and left Settings.
- **A lint warning** from the first pass (a component file exporting helpers): the viewport-fit helpers are in
  `browse/components/fitViewport.ts` (`079ef31`).

### 9.2 The lead's fixes

| | What | Change | Seen |
|---|---|---|---|
| a | Voice search blocked by `Permissions-Policy` | `microphone=(self)`; camera, geolocation, payment and USB stay off. A server test asserts the header. The sentences in `README.md` and `docs/ARCHITECTURE.md` say so | Unit test; the header on the running container |
| b | `docs/deploy.md` had the mixed-content rule reversed | An HTTPS page cannot call an HTTP Jellyfin address; an HTTP page can call either (the note in section 2, and section 5) | Read |
| c | Machine path as the Android SDK default | `tools/refshots/common.mjs` reads `ANDROID_HOME`, then `ANDROID_SDK_ROOT`, and stops with a message when neither is set or the folder is missing; its README and three sentences of `docs/TOOLING.md` follow. No drive-letter or user-profile path is left in the tracked tree (grep) | Ran it with neither variable, with a missing folder, with a valid one |
| d | "Server version will not be supported soon" on the Settings page | Upstream shows the notice on the server picker, the user picker and every settings screen. One helper now, `src/lib/serverVersion.ts` (the setup copy moved there, the settings copy deleted), used by all three; it applies the recorded decision (no "soon" tier) everywhere. The "not supported" tier is unchanged: below the SDK's minimum, or a version that cannot be read | Unit tests (`src/lib/serverVersion.test.ts`); Settings on the test server (10.11): no notice, where the red line showed before |
| e | License page | The text of `LICENSE-EXCEPTION.md` is imported at build time (`?raw`) and shown as its own section before the third-party list; heading `web_license_exception`. `package.json` stays `GPL-2.0-only` | Unit test; pictures, English and Hebrew, desktop and phone; the text is in the built chunk |
| f | Dockerfile | `LICENSE`, `LICENSE-EXCEPTION.md` and `THIRD-PARTY-NOTICES.md` are copied to `/app` | The three files in the built image |
| g | `docs/deploy.md` section 9, "Trying it on a second port first" | Container on 127.0.0.1, a second Caddy site block for the same host name, the router's port forward, `JELLYFIN_URL` and `SEERR_URL` for that case, the checks, and how to remove it | Every variable, path and header read against `server/config.ts`, `app.ts`, `security.ts`, `seerrProxy.ts`; the Caddy block itself was not run |

One point in (g) goes beyond the brief: the trial command sets `HSTS=false`. The `Strict-Transport-Security` header
counts for the whole host name on every port, so a browser that saw it on the trial port would refuse plain-HTTP
addresses on that name for months (`max-age=15552000`).

### 9.3 Decisions in this pass

- 17 (photo viewer keys in Hebrew): mirrored on purpose; see 9.4.
- 23 rejected on the data (15 items), not on behaviour.
- 6 was extended to the same pattern in places the finding did not name (mini player, guide cells, program
  dialog, genre title). In the left-to-right guide a Hebrew program title now starts at the cell's left edge,
  where the program begins, instead of the far end of a long cell.
- The License page shows the exception text left-to-right (`dir="auto"`) in a Hebrew interface, as other long
  English texts are; the GPL notice above it is a translated-string block and stays at the right edge.
- English fallback text carries invisible isolate characters in right-to-left languages, also inside accessible
  names and tooltips. Nothing compares or sorts translated strings.
- The 3 s wait in one e2e test is a fixed sleep, against the suite's own rule: there is nothing to poll for.

### 9.4 Deviations added or changed

| TV | Web | Why | File |
|---|---|---|---|
| Photo viewer: Left is previous and Right is next in every language (SlideshowPage.kt:269-290) | In right-to-left languages Left is next and Right is previous | The web's on-screen arrows, grids and swipes are mirrored there; the key that points at the "next" arrow goes next | `src/features/photos/SlideshowPage.tsx` |
| The guide follows the layout direction | Left-to-right in every language (already recorded); new: in a right-to-left interface Left from the channel column goes to the drawer | The shell's rule (leave the page from its start edge) can never apply inside a left-to-right grid | `src/features/livetv/GuideGrid.tsx` |
| Every string comes translated from the Android resources | English fallback text in a right-to-left language is wrapped in a left-to-right isolate | Web-only strings have no translations yet; without it the sentence is reordered | `src/i18n/index.ts` |
| "Server will not be supported soon" on the pickers and every settings screen | Shown nowhere (was: hidden on the pickers, shown in Settings) | Recorded decision: it announces a requirement of the Android app's SDK | `src/lib/serverVersion.ts` |
| Add to playlist: an invisible placeholder takes the first focus (PlaylistList.kt) | The same; before, the Search field took it | Follows upstream; no on-screen keyboard over the list on a phone | `src/features/detail/common/AddToPlaylistDialog.tsx` |
| Now Playing "View options" title is drawn over the page | On phones it is part of the panel | No free space beside the page's texts at 390 px | `src/features/music/nowplaying/MusicViewOptionsDialog.module.css` |
| No such text (upstream has no exception file) | The additional permission has its own section on the License page | The project's licence exception for Apache-2.0 libraries | `src/features/settings/LicensePage.tsx` |

Document lines that now name old places (left for the lead, not edited here): `docs/ARCHITECTURE.md` and
`docs/DECISIONS.md` (A-94) call the browser test an inline script of `index.html`; `docs/ARCHITECTURE.md` (the
duplicated-helpers table) and `docs/DEVIATIONS.md` (setup table) name `setup/serverVersion.ts` and
`settings/serverVersion.ts`.

### 9.5 Gates (final tree)

- `npm run gen` (no diff), `typecheck`, `test` (57 files, 557 tests), `lint` (0 errors, 25 warnings of the existing
  kinds; 26 before, 27 after the first pass), `build`, `e2e:typecheck`: pass.
- `npm run e2e` twice in a row on the final tree (own port): 189 passed both times, 0 failed, 0 flaky, 0 skipped,
  about 3.5 minutes each (188 tests before; the first pass added one drawer test). The suite passed six times in
  a row in all after the two e2e fixes of 9.1; the run before them failed two tests (the leftover playlists and
  the Escape race).
- `npm run ts:verify` afterwards: 30 checks pass; the test server holds its two seeded playlists and no Live TV
  timer.
- Crawler, test server, PURPLE, desktop-1920x1080 + phone-390x844, on the final tree: 390 pictures, 390 ok,
  0 warnings, 0 errors, 1 scene skipped for lack of data. Looked at: the guide and its program dialog, the License
  page, Settings, Now Playing with its controls and view options, both playlists, Add to playlist, the shortcuts
  sheet, Home (desktop and phone).
- Hebrew (`--rtl`), the screens the right-to-left findings named and their families (Now Playing, player, photo
  viewer, License, Live TV, album, audio playlist, movie pages, settings, Discover gate): 128 pictures, 0 errors,
  18 warnings, all of them scene `prepare` steps that look for English button names (9.6). Hebrew pictures looked
  at: Now Playing (desktop, phone, view options), the paused player and its shortcuts sheet, photo overlay, guide
  and program dialog, album, audio playlist, License, HDR formats, movie page with tracks, Settings.
- Other engines, the scenes of finding 24: WebKit 30 pictures and Firefox 6, 0 warnings, 0 errors.
- Production image: `npm run docker:build` passes (258 MB; the `npm ci` layer came from the cache, see 9.6; about
  0.3 GB of new disk for images and build cache together). Container with `--rm` on 127.0.0.1 against the test
  server: `/healthz` 200; Content-Security-Policy narrowed to the configured Jellyfin, `nosniff`, `no-referrer`,
  `Permissions-Policy: camera=(), microphone=(self), geolocation=(), payment=(), usb=()`, COOP `same-origin`;
  `LICENSE`, `LICENSE-EXCEPTION.md` and `THIRD-PARTY-NOTICES.md` in `/app`; sign-in through the setup screens
  lands on Home; one H.264 item played 7 s (161 frames) under the policy with no violation and a Stopped report
  on exit; the only console errors were the expected `/wholphin/public` 404 of Home's plugin probe. The first
  build showed the inline-script violation of 9.1; the numbers here are from the rebuilt image. The container is
  stopped and removed; one image is left, `wholphin-web:latest` (the `wholphin-web-int` image and the two
  superseded builds are gone).
- The real servers were used only by the e2e Discover spec, as before: it signs in with the limited account,
  reads, and answers every Seerr write itself; no Seerr request was created. No Live TV timer or recording
  was created anywhere. On the throwaway server: playback of seconds (user data restored), three probe playlists
  created and deleted (one of them after a library rescan), 27 leftover test playlists deleted.

### 9.6 Not verified, still open

- Voice search with a real microphone, in the dev server or the container (headless browsers have no speech
  recognition); only the header was checked.
- The Hebrew crawl's 18 warnings: scene scripts that look for English button names. The Hebrew pictures of those
  screens were taken with separate scripts instead.
- 3 (Discover "View more") and the Discover pages in Hebrew were not looked at with a real Seerr in this pass.
- 16: the remaining-time label reads as the Hebrew locale orders it (as upstream, which hands the label the
  locale's direction); whether a leading minus should stay on the left was not decided.
- Real Safari and real iOS: every WebKit check used Playwright's build.
- The reference-capture tools were only run as far as the SDK check; a machine with neither variable set needs
  `ANDROID_HOME` before `npm run ref:shots` from now on.
- The image's `npm ci` layer came from the build cache (same `package.json` and lockfile as the earlier build
  that ran it).
- The test server's scheduled library scan still exists; with the 3 s wait a leftover playlist should be rare, and
  the global setup removes it. Turning the scan off belongs to `tools/testserver` and was not done.
- Everything in 8.8 that this pass did not touch (`CardGrid` / `ItemRow` resize copies, long-press on a circle's
  name label, song images in a grid-layout audio playlist, and the older items of sections 5 and 7.3).

## 10. After the audit: the test server guide and two focus races

Three things turned up after the stage 2 audit: the test server's Live TV guide had run out, one keyboard test
pressed a key one frame too early, and another keyboard test failed about one run in five because the app
dropped focus. Looking for the cause of the last one, with the test server slow under other work, showed a
second focus defect that no test covered. Commits, oldest first: `6674717`, `62fe020` (the lead), `940e0d9`,
`afd1afb`, `f8024f0`, `f935a79`, `1100e1e`, then this section.

### 10.1 The Live TV guide ran out (`6674717`)

The test server's guide covered 24 hours from the moment it was written and nothing renewed it, so the Live TV
e2e test failed in three engines once it had run out. The guide text now comes from `tools/testserver/guide.mjs`
and covers eight days; `npm run ts:guide` copies a new one into the container and runs Refresh Guide;
provisioning and the e2e global setup call it, and `ts:verify` checks that the guide reaches the next 24 hours
([TOOLING.md](TOOLING.md)).

### 10.2 The empty-page test pressed a key too early (`62fe020`)

`drawer.spec.ts`, "an empty page still takes focus out of the drawer": after Enter on a drawer entry, focus is
parked on the page area (`<main>`) until the page has something to focus. The test pressed Left in the frame
between the empty-state text appearing and that text taking focus; an arrow key pressed while only the page area
holds focus goes to the page's first element, not to the drawer, so the second expectation failed about once in
fifteen runs. A test race: the test now waits for the empty-state text to be focused. The app was not changed.

### 10.3 Favorites: the first card lost the focus it had just been given (`940e0d9`)

What failed: `drawer.spec.ts`, "focus expands the rail, Enter navigates, closes it and moves focus into the
page". The test saw focus on the first Favorites card, pressed Left and expected the drawer entry; the focused
element was the page's first tab ("Movies") instead, and stayed there. 4 of 15 runs for the lead, 3 of 15 in
this pass, on the unchanged tree.

Cause, recorded with a script installed before navigation (focusin / focusout listeners, a MutationObserver,
`history.replaceState` wrapped, the active element sampled every frame). One arrival, milliseconds after Enter
on the drawer entry:

| ms | event |
|---|---|
| 55 | `pushState /favorites` |
| 88 | focus leaves the drawer for the page area (`<main>`), the page is still loading |
| 216 | `replaceState /favorites?tab=Movie`: the page writes its tab into the URL; the history entry gets a new key |
| 236 | the grid's 5 cards are added |
| 238 | focus: the first tab (the shell's placeholder), then the first card (the grid's own first focus) |
| 257 | focusout from the first card to nothing: the grid is removed |
| 281 | a new grid with 5 new cards is in the document; the active element is `<body>` |
| 282 | the grid's first focus runs again: the new first card |

The card grid's React key contained `location.key`. Favorites writes `?tab=` with a replace navigation right
after its first render (so that Back reopens the same tab), a replace gives the entry a new key, and the grid
was therefore built twice. The first build's focused card was removed and focus sat on `<body>` until the next
frame. An arrow key pressed in that gap is handled by the shell's "nothing focused" rule and goes to the page's
first element, the tab row; the grid's second first-focus then sees that something else holds focus and leaves
it. The removal happened in 8 of 8 recorded arrivals, drawer arrival and direct load alike; the gap was about
25 ms on an idle machine and longer under load. A library opened on a remembered tab with its items already
cached went through the same double build (recorded: 15 cards removed and added again).

An app defect: a keyboard user's first key press could land on the tab row instead of acting from the first
card. Fix: the grid is keyed by the visit (`useVisitKey`, `src/features/browse/data/visit.ts`): `location.key`,
kept over replace navigations; PUSH and POP still give a new key. Scroll memory stays keyed by `location.key`
itself, which is what Back returns to. After the fix the same recording shows one grid, no removal, and the
favourite pages are still requested once each.

Other pages built from the same parts were recorded the same way (Home, Favorites, Search, every library type,
the movie library's Library / Collections / Genres tabs, collection, playlist, photo album, album and artist
pages, Live TV, recordings; direct load and keyboard arrival from the drawer): only the library grid had the key,
so only Favorites and remembered-tab libraries re-created anything. 58 arrivals after the fix: no focused
element removed, no time without focus.

### 10.4 A second visit left focus on the tab row (`f8024f0`, `f935a79`)

Found while recording, not by a failing test. Opening a page from the drawer with the keyboard a second time in
the same session ended with focus on the page's first element (the tab row, or the Sort button) instead of the
first card: 10 of the 11 drawer pages, every time; the first visit was right, and so was Live TV.

Cause: a page asks once for its first focus when its cards show, and may take it only if nothing else holds
focus or if the shell's placeholder does (`mayTakeInitialFocus`). On a first visit the data arrives after the
shell has moved focus out of the drawer. On a second visit the cards come from the query cache and are there in
the page's first render, so the page asked before the shell had looked: the drawer entry still held focus, the
page was refused and never asked again, and the shell's placeholder focus stayed.

Fix (`src/app/shell/shellFocus.ts`): from the keyboard activation of a drawer entry until the shell's first
look at the new page, the arrival is pending; a page may take its first focus in that window while focus is still
in the drawer, and the shell then leaves that focus alone. A key or pointer press ends it. Three pages had an
obstacle of their own on that path: the photo grid asked before its root element was known (cached items), and
the two music grids marked "asked" before a frame that the development build's second effect run cancels
(development only). The Discover tab, the Seerr requests tab and the guide ask in their first effects and are
covered by marking the arrival at the activation; that part is covered by a unit test only (10.7).

After the fix, first and second visit end on the same element on all 11 drawer pages (recorded three times).

### 10.5 An arrow key with nothing focused (`afd1afb`)

The rule that turned the 25 ms gap of 10.3 into a visible fault was looked at on its own. With focus on `<body>`
or on the page area itself, an arrow key focused the page's first element. Upstream hands focus back to the
last focused child of every row and grid (`focusRestorer`), so the web now does the same one level up: the
element of the routed page that last had focus, while it is still shown and takes focus; else the first element
as before; the drawer only when the page has nothing to focus. The direction of the key does not matter, as
before: the first press gives focus back, the next one moves. The shell's Back button is not returned to this
way. Leaving the drawer to the page already used the remembered element; it now also checks that the element
took focus (a remembered button that had become disabled swallowed the key).

This does not change 10.2 or 10.3: a removed element is not usable, and a page that never had focus has nothing
remembered, so those cases still go to the first element.

### 10.6 Other failures while looking

- Keyboard project, every test six times (counts include the seven sign-in setups): 103 of 103 after 10.3, 10.5
  and the first half of 10.4; 109 of 109 on the final shell code with the Favorites test added. The arrow-key
  test, added last, passed 6 of 6 on its own.
- The whole suite without the writing project, every test twice (359 runs with the setups): 358 passed. The one failure was
  WebKit's browser process ending in the middle of `browse.spec.ts` "sort, filter and view options" with
  `SkBitmap ... tryAllocPixels` (a failed bitmap allocation; "Target page, context or browser has been closed").
  Not the app and not a test race: the browser died. The same test then passed 8 of 8 in WebKit. Nothing was
  changed for it.
- No other test race was found; no wait or timeout was changed.

### 10.7 Deviations, tests, gates

Deviations to carry into [DEVIATIONS.md](DEVIATIONS.md):

- TV: a key press always starts from a focused element. Web: focus can be nowhere (a click on empty space); an
  arrow key then returns to the page's last focused element, else its first, else the drawer
  (`src/app/shell/shellFocus.ts`, `src/app/AppShell.tsx`).
- TV: a destination is a new page with its own state. Web: a replace navigation keeps the history entry, and now
  the library grid with it. Selecting the current page's own drawer entry again is such a navigation: the grid is
  kept instead of rebuilt. In the one case recorded (movie library on its remembered Library tab, grid scrolled
  to the end) focus went to the first card and the grid scrolled back to the top, as a new page would show
  (`src/features/browse/components/LibraryGrid.tsx`).

Tests added: unit, `src/app/shell/shellFocus.test.ts` (12) and `src/features/browse/data/useVisitKey.test.tsx`
(3); e2e, two keyboard tests in `drawer.spec.ts`: Favorites twice (the focused card must stay the same element
after the URL write, and the second visit must land on the first card), and the arrow key with nothing focused.
The first of them fails on the tree without 10.3 (2 of 2) and on the tree without 10.4 (2 of 2).

Gates on the final tree: `npm run typecheck` and `npm run e2e:typecheck` clean; `npm run test` 59 files, 572
tests; `npm run lint` 0 errors, 25 warnings (as before); `npm run build` passes; `npm run e2e` 191 of 191 in 3.6
minutes. The failing test of 10.3: 0 failures in 30 runs after the fix (3 in 15 before, on the same machine
within the same hour). Every browser was headless and muted; one dev server at a time.

Not verified: Discover's first focus on a second visit (it needs a Seerr; the real one was not used for this);
real Safari; a production build's behaviour for the two music grids (their obstacle exists only in the
development build). Focus remembered for Back is still stored per `location.key`, so a focus taken before a
replace navigation is not carried to the new key; with the grid no longer re-created nothing re-records it. No
case was found where that changes what Back restores (the first card is also what a page focuses on its own).

## 11. Merging the TV comparison pass

Branch `parity` is the pass that compared the web pictures with the Android TV reference pictures and changed
sizes, spacing, type and layout to match (its own story is to come in `docs/parity-notes.md`, which its
integrator was still writing). It forked from `integration` at `c6a1d1f`, before the stage 2 repair of section 9.
This section merges it into the audited app on branch `final` (created from `integration` at `c14b168`).

Merged: `parity` at `2a25082` (ten commits after the fork; its integrator was still working, a later merge tops
up). Merge commit `3085fba`, 253 files. Follow-up commits: `7ebc953`, `817594e`, `e8a7731`, then this section;
after an independent review, `e3df8a1`, `6180e80` and `73ed619` (11.5).

The rule used: parity owns how things look, integration owns how things behave (focus, keyboard, the
mixed-direction text rules, the room for the mini player, the playback session, removed strings, e2e stability,
the licence page's content).

### 11.1 The 13 conflicts

| File | Resolution |
|---|---|
| `e2e/specs/settings.spec.ts` | Both sides removed the Escape after choosing a theme; one comment says why |
| `src/app/AppShell.tsx` | Imports only: integration's `shellFocus` functions, plus parity's `setBeamEdge` from the navigator (`focusFirst` is no longer used here) |
| `src/features/browse/components/LibraryGrid.tsx` | Parity's layout (grid box, footer inside it, series image for episode cards); the grid and the list are keyed by the visit (`gridKey`, section 10.3), not by `location.key` |
| `src/features/livetv/ProgramDialog.module.css` | Both: the start-edge rule for mixed-direction texts and parity's trimmed text boxes |
| `src/features/livetv/TvGuideHeader.module.css` | Parity's structure (text column of 8dp + 75%, one-line title, overview in its own padded box); the title and episode name stay fit-content blocks with the physical 8dp inset, capped at the column's width; the overview hugs the start edge of its box (`align-self`) |
| `src/features/music/MusicGenrePage.tsx` | Parity's page on the shared library grid. Integration's change (direction on the title text, not on the heading with unequal paddings) has nothing left to apply to: the grid's title is centred with equal paddings |
| `src/features/music/components/MusicHeader.module.css` | Parity's trimmed boxes and no minimum height (an empty line is kept by a zero-width space now); the artist, name and genre lines stay fit-content blocks with the physical inset, `max-width` in place of `width` |
| `src/features/music/library/MusicGrid.tsx` | Deleted, as on parity (the music tabs use the shared library grid). Integration's two changes to it are covered there: the grid's own first focus, and the "jump to letter" label |
| `src/features/music/library/RecommendedMusic.tsx` | Parity's rewrite (the structure of the other libraries' Recommended tab). Its first-focus request asks `mayTakeInitialFocus` and does not cancel its frame, so the development-only obstacle of section 10.4 does not exist in it |
| `src/features/settings/LicensePage.tsx` | Parity's rows (name, version, author, coloured licence badge; names isolated with `<bdi>`) and integration's additional-permission section before the list |
| `src/i18n/extra/en.json` | Both removals: `web_loading` (integration) and `web_server_url_placeholder` (parity). No removed key is used by the merged code |
| `src/ui/text/StreamChip.tsx` | Same markup on both sides (`dir="auto"` on the text); one comment |
| `tools/shots/capture.ts` | Parity's `channel` argument (an installed browser, headless and muted) and integration's Firefox autoplay preferences |

### 11.2 Files changed on both sides

36 files were changed on both sides since the fork: the 13 above and 23 that merged without a conflict. Each of
the 23 was read against both sides' changes. Changed afterwards:

- `src/features/detail/playlist/PlaylistDetails.module.css` (`7ebc953`): integration's phone rule narrowed the
  row's small buttons (padding 4dp 6dp, gap 2dp) to leave room for titles. Parity made the buttons 4dp all round
  and built touch hit areas on the 4dp gap; the older phone rule then made them wider than parity's again. The
  phone rule keeps its row gap and item padding only.
- `src/features/music/components/MusicHeader.module.css` (`817594e`): the phone rule set `width: 100%` on the
  artist and name lines, which overrode the fit-content block there and left the 75% cap in place (this was so
  on `integration` already); it is `max-width: 100%` now.
- `src/ui/lib/bringIntoView.ts` (`e8a7731`), parity's pivot scrolling against integration's mini-player reserve:
  an item that does not fit below the pivot is aligned to the bottom of the viewport, which for the window was
  the real bottom edge, under the mini player. The body's bottom padding is taken off the window's height first.

Read and left as merged:

- `DetailHeader.module.css` / `DetailHeader.tsx`: both sides fixed the 8dp inset of mixed-direction lines,
  integration with a physical padding, parity by moving the padding to a wrapper. Both are in; either alone
  would do.
- `ProgramCell.module.css`, `SongRow.module.css`, `MiniPlayer.module.css`, `ImageOverlay.module.css`,
  `NowPlayingPage.module.css`, `Controller.module.css`: the start-edge, left-to-right and time-label rules are
  all still there next to parity's trimmed text boxes; the player's time labels are still direct `span` children.
- `GuideGrid.tsx` (Left from the channel column in a right-to-left interface; parity's held look and Up exit),
  `SeriesOverview.tsx` (URL flush before a key that leaves; parity's clip to the window), `PlaylistDetails.tsx`,
  `TileGrid.tsx`, `PhotoFolderView.tsx`, `ImageOverlay.tsx`, `PlayerView.tsx`, `AddServerDialog.tsx`,
  `SwitchUserScreen.tsx`, `Button.module.css`, `inputModality.ts`, `LicensePage.module.css`: independent changes.
- `e2e/fixtures/app.ts`: the Hebrew menu-button name and parity's "first visible Home row".
- `tools/shots/scenes.ts`, `tools/shots/README.md`: integration's guide-window clock applies to the whole run,
  parity's per-scene `clock` overrides it; parity's Live TV scenes look up "Headline Hour, Episode 23", which the
  renewed eight-day guide of section 10.1 still contains.

Looked for across files, not only in the 36:

- Data attributes the e2e suite and the focus code use: none lost. `data-row` and the `music-grid` / `music-rec`
  focus keys went with the old music grid and had no other reader.
- Page heights: parity's photo grid subtracts the mini player itself; the music tabs and the music genre page
  now sit in the tabbed page, which integration made end above the bar. No window-sized layout was added
  without it.
- Dialog and menu layer: parity's opener handling (`Dialog`, `DropdownMenu`: opener read while rendering, held
  focused look) builds on the same `captureOpener` / `restoreFocus`; Add to playlist names its first focus
  explicitly and is unaffected by "a child that focused itself keeps focus".
- Arrow keys: the shell's "nothing focused" rule runs before the navigator; parity's beam rule hands Left from
  a page row to the shell, which goes to the drawer as before.
- Strings: every `web_` key the code names exists; three keys are unused by name (`web_music_repeat_*`, built
  from the repeat mode).

### 11.3 Gates

On the tree with the follow-up fixes: `npm run gen` no diff; `typecheck` and `e2e:typecheck` clean; `test` 68
files, 620 tests; `lint` 0 errors, 25 warnings; `build` passes.

`npm run e2e`, once, own port: 190 passed, 1 failed, of 191, 4.7 minutes. The failure is `signin.spec.ts`,
"keyboard only: add server and sign in with Tab, Enter and typing": after the user list's heading shows, the
test presses Down and expects Add User, but the heading is there while the users are still loading, and then
Switch servers is the only element to focus. The lines are parity's (focus starts nowhere on an empty user
list). Run alone four times: 3 passed, 1 failed the same way. A test race that came with parity, not caused by
the merge; left for parity's integrator.

Crawler, test server, PURPLE, desktop and phone, the screens the conflicts touched (guide with keyboard focus,
program dialog, License, album pages, the four music tabs, music genre page, audio playlist): 28 pictures, 28
ok, 0 warnings. Looked at: the guide, the program dialog, the album page on both sizes, the audio playlist on a
phone, License.

Every browser was headless and muted; one dev server at a time; the real servers were used only by the e2e
Discover spec, as before. No Live TV timer or recording was created.

### 11.4 Open

- Parity's tip was not final: its later commits and `docs/parity-notes.md` are still to be merged.
- Not looked at in Hebrew after this merge: the guide header, the music header, the program dialog and the
  License rows, where both sides' rules for mixed-direction text now meet.
- `bringIntoView` with the mini player showing: the restore path has a test now (11.5), but no test walks a
  window-scrolled page with arrow keys to an item taller than the room below the pivot, the case `e8a7731`
  changed the arithmetic for; that one was checked by reading only.
- The full crawl and the TV compare sheet were not run on the merged tree.

The sign-in test's race and the "nearest" scroll of a restored focus, both listed here before, are closed in
11.5.

### 11.5 Review of the merge

Independent reviewers compared each side's intent with the merged files and reported three findings, all minor,
all a parity intent that the merge had not carried through. Each was checked against both sides' diffs from the
fork and the merged file; all three were right and are fixed.

| Finding | Cause | Fix |
|---|---|---|
| A focus that is restored (an arrow key with nothing focused, Right out of the drawer) scrolls differently from an arrow-key move | Integration's `restoreLastFocus` in `src/app/shell/shellFocus.ts` kept the native `scrollIntoView` "nearest" it had at the fork; parity moved the navigator's `focusEl` to the pivot rule of `bringIntoView`, and `e8a7731` taught only that function about the room the body keeps for the music mini player. A song that sat just below the window was put at the window's very bottom edge, under the bar | `e3df8a1`: `restoreLastFocus` calls `bringIntoView`. The drawer's own entry focus stays "nearest" (it is inside the fixed drawer) |
| On a touch phone the first row button of a playlist row takes taps on the end of the list item | Parity's hit area for the first button reaches 12dp towards the item, sized for the row's 16dp gap; `7ebc953` kept integration's 4dp gap on phones, so 8dp of the item was covered | `6180e80`: under 600dp with a coarse pointer the first button's hit area takes the 4dp gap and no more (the reviewers suggested 2dp; 4dp keeps the target as wide as the gap allows and still stops at the item's edge) |
| The keyboard sign-in test presses Down before the Add User card exists | The merge had parity's test lines but not parity's later fix `b1e0f33` (parity's tip moved on after `2a25082`) | `73ed619`: the sign-in part of `b1e0f33`, the test waits for the card |

The drawer part of `b1e0f33` (wait for the grid that is built again when the tab page writes `?tab=`) was left
out: on this tree the grid is keyed by the visit and built once (section 10.3), and the drawer test here is
integration's, which asserts exactly that.

Tests added, each seen failing on the tree before its fix and passing after:

- `src/app/shell/shellFocus.test.ts`: both restore paths hand the element to `bringIntoView` and do not call
  the native `scrollIntoView`.
- `e2e/specs/music.spec.ts`, desktop: with the mini player showing in a 480-pixel-high window, the last song
  of an album is focused, the page is scrolled until the song is just under the window, focus is dropped, and
  an arrow key brings the song back above the bar (before: its bottom edge at 480, the bar's top at 416).
- `e2e/specs/detail.spec.ts`, phone: a tap just inside the end of a playlist row's list item hits the item,
  and a tap in the gap next to the first button hits the button (before: the button on both).

Gates on the tree with these fixes: `typecheck` and `e2e:typecheck` clean; `test` 68 files, 621 tests; `lint`
0 errors, 25 warnings; `build` passes. e2e, own port, the specs that cover the changes (`signin`, `music`,
`detail`, `drawer`, `navigation`, `home`, `browse`, all projects): 98 passed, 1 failed, of 99, 1.7 minutes. The
failure was `home.spec.ts` "Continue watching lists the seeded resume items" in the WebKit project only (a
seeded resume item missing from the row); the same test passed in the four other projects of that run and
twice when run again alone in WebKit. Other runs were using the same test server at the time, which changes
resume state; not followed further. The keyboard sign-in test, alone, four times: 4 passed. The two new e2e
tests, three times each: 6 passed.

Every browser was headless and muted; one dev server at a time, stopped after each run; only the test server
was used. No Live TV timer or recording was created.

## 12. Final check and repair

Thirteen independent checkers looked at the merged tree of section 11, each from one angle, with headless muted
browsers against the throwaway test server, and reported 47 findings: 6 major, 41 minor. Area fixers (one per
feature area) and one fixer for the shared code repaired them side by side in the working tree without seeing
each other's work. This section is the integration of that work: every change read, the requests between fixers
settled, the comparison branch's last commit merged, tests added, and the gates on the final tree.

Commits, oldest first: `1d70b92` (shell), `ccdc835` (navigator and overlays), `d6bbd30` (row drag), `695c5c3`
(images, counted titles), `f45db21` (Home, library grids, search), `6f2fefd` (Add to playlist), `3325a7d`
(player), `0f8a201` (Live TV), `96f71c0` (Now Playing), `2165b33` (photo viewer), `4d4756a` (settings, setup),
`535394e` (Discover grid), `d6f2c63` (two e2e fixes), `b120d5f` (merge of `parity` at `d23d5bc`), `a60b918`
(letter column), `db375e8` and `240b3f9` (e2e tests), then this section.

The top-up merge brought one file, `docs/parity-notes.md` (the comparison pass's own story); no conflict. The
comparison branch's working tree was clean.

### 12.1 The thirteen angles

| Angle | What it walked | Findings |
|---|---|---|
| shell-keyboard | drawer, arrival focus, Back and Escape, fast key sequences, slow data | 7 |
| home-browse | Home rows, library grids and lists, letter column, wheel and drag | 5 |
| detail-dialogs | item pages, menus, nested dialogs, Add to playlist | 4 |
| playback | the video player in headless Edge: keys, sheets, Next Up, errors, phone layout | 4 |
| livetv | guide, program dialog, view options, DVR tab, recordings | 5 |
| music | album and artist pages, mini player, Now Playing, lyrics | 3 |
| photos | photo grid, viewer, slideshow, filter panel (Chromium and Firefox) | 3 |
| settings-setup | sign-in screens, every settings row and dialog, License, Debug | 4 |
| search-discover | search, combined results, Discover rows and grids (read-only) | 3 |
| rtl-hebrew | Hebrew and Arabic interface on the main screens | 2 |
| phone-touch | 360 to 768 px touch profiles, taps, menus, error states | 4 |
| engines | Firefox and WebKit builds: the suite, the crawler, adversarial key sequences | 3 |
| tv-compare | the 208 TV comparison scenes against the comparison pass's pictures | 0 |

### 12.2 The 47 findings

Status: **fixed** by the fixer of its area (or the shared-code fixer), **fixed here** (by the integration),
**same as** another finding. "Seen" is how the outcome was checked; the e2e tests named there are new (12.5).

| Finding | Sev. | What was wrong | Status | Seen |
|---|---|---|---|---|
| shell-keyboard-1 | major | An arrow key pressed while a page opened from the drawer was still loading put focus into the drawer for good | fixed | e2e (`drawer`): the toward-page key right behind Enter, then Down and Right with the data held back; the first card takes focus when the data arrives |
| shell-keyboard-2 | minor | Second visit: a key pressed a few milliseconds after Enter left focus on the tab row | fixed (same change: key presses no longer end an arrival) | fixer's runs, English and Hebrew; unit test |
| shell-keyboard-3 | minor | In right-to-left the page's "first element" was the end of the top row (the last tab) | fixed | unit tests (`spatialNav.dom`) |
| shell-keyboard-4 | minor | Choosing the current page's own drawer entry again left focus on the tab row or the Sort button | fixed: every drawer choice builds a new page | e2e (`drawer`) |
| shell-keyboard-5 | minor | Home: Down on the last row did not enter the music mini player | fixed | e2e (`music`) |
| shell-keyboard-6 | minor | Home in a short window: the focused card ran under the mini player | fixed: the card moves up just far enough to end at the list's edge | fixer's measurement at 480 px; unit test |
| shell-keyboard-7 | minor | Escape within about 10 ms of Enter on a card went back from the page being left | fixed: a Back key pressed while a navigation is under way waits for it | e2e (`navigation`), three engines; unit test |
| home-browse-1 | major | The wheel could not scroll a grid whose card had keyboard focus: it jumped back 280 ms later | fixed | e2e (`browse`), three engines |
| home-browse-2 | minor | Left from the letter column went to the nearest card, not to the card focused last | fixed, completed here: at 1440x900 the letter was level with no card row and Left went to the nav drawer | e2e (`browse`); unit tests |
| home-browse-3 | minor | Up from the first grid row skipped the grid's own buttons and went to the tab row | fixed: the grid is one focus group with its header | e2e (`browse`); unit test |
| home-browse-4 | minor | A "View more" page opened by its address or reloaded had nothing focused | fixed | e2e (`home`) |
| home-browse-5 | minor | Rows could not be dragged with the mouse, as the working agreement says they can | fixed | e2e (`home`), three engines; unit tests |
| detail-dialogs-1 | major | A click beside a nested dialog left focus outside the dialog still open: arrows reached the page behind it, Escape did nothing | fixed | e2e (`detail`), three engines |
| detail-dialogs-2 | major | Dialogs opened from a menu entry that closes its menu dropped focus to `<body>` when closed | fixed: focus returns to the nearest opener still in the document | e2e (`detail`) |
| detail-dialogs-3 | minor | A click beside a single dialog or menu left focus on `<body>` | fixed | e2e (`detail`) |
| detail-dialogs-4 | minor | Add to playlist: arrows could enter the search field but not leave it | fixed | e2e (`detail`); unit test |
| playback-1 | minor | Enter on a chapter card, a track or the help sheet's Close re-opened the controls | fixed | unit test; fixer's runs in headless Edge |
| playback-2 | minor | Phone portrait: the player title ran to the screen's end edge | fixed | fixer's measurement at 390 and 360 px |
| playback-3 | minor | After Next Up, the address still named the previous episode; a reload replayed it | fixed: the address follows the queue | fixer's runs (one Start report per episode, the reload continues the new one); unit test |
| playback-4 | minor | The error screen offered "Play with transcoding" when the item itself could not be loaded, and repeated the detail | fixed | unit test; fixer's run |
| livetv-1 | minor | The first click after keyboard focus left guide row 0 was lost (the guide moved 43 px under the pointer) | fixed: the tab row comes back on release | e2e (`livetv`), three engines |
| livetv-2 | minor | The view options dialog was rebuilt when a channel-order switch reloaded the guide | fixed | fixer's runs |
| livetv-3 | minor | Hebrew: Up to View options, then Down, jumped the guide hours ahead | fixed: Down returns to the program it came from | fixer's runs, Hebrew and English |
| livetv-4 | minor | The DVR tab took no arrival focus on a direct load or from the drawer | fixed | e2e (`livetv`); unit test |
| livetv-5 | minor | A recording's series page asked for a series image that does not exist (404) | fixed | page loaded here: no failed image request; unit test |
| music-1 | major | Now Playing locked up when the focused lyric line went away with its track | fixed | e2e (`music`) |
| music-2 | minor | Phone Now Playing: lyric text showed through the controls | fixed | fixer's picture; crawler picture |
| music-3 | minor | Down on Home's last row never reached the mini player | same as shell-keyboard-5 | |
| photos-1 | major | The slideshow stopped after the second photo in Chromium-based browsers | fixed | e2e (`photos`), three engines |
| photos-2 | minor | An outside press that closed the filter panel also opened the details overlay | fixed | fixer's runs, Chromium, Firefox, touch |
| photos-3 | minor | The viewer's address kept the start photo | fixed: it follows the photo on screen | e2e (`photos`) |
| settings-setup-1 | minor | A dialog opened from a choice dialog lost focus to `<body>` on close | fixed (the opener chain of detail-dialogs-2) | e2e (`settings`) |
| settings-setup-2 | minor | Toasts were drawn under an open dialog's scrim | fixed: toasts are drawn in `<body>` | fixer's picture |
| settings-setup-3 | minor | Hebrew: the Add Server error line put the address's trailing slash in front | fixed | unit test; fixer's picture |
| settings-setup-4 | minor | License page: arrows could not reach the rows in view; any sideways arrow threw focus to the top | fixed; here: Left from a row to the pinned header no longer scrolls the page | e2e (`settings`); unit tests |
| search-discover-1 | minor | A Discover grid opened from a genre card took no first focus | fixed | unit test; fixer's runs with Seerr answered locally |
| search-discover-2 | minor | "View more": the focused start card was cut off at the window's top | fixed | fixer's runs and picture |
| search-discover-3 | minor | Back from a Discover result returned to the Library tab of the search page | fixed: the tab is in the address | fixer's run with a stand-in provider |
| rtl-hebrew-1 | minor | The "Go to series" arrow was not mirrored in right-to-left languages | fixed | fixer's runs, Hebrew and Arabic |
| rtl-hebrew-2 | minor | Arabic: an untranslated counted heading read "(6) Songs" | fixed, one shared helper for the four places | unit test |
| phone-touch-1 | minor | A tap on View options right after Escape closed the Filter menu was lost | fixed | fixer's runs at 390 and 360 px; unit test |
| phone-touch-2 | minor | Grid titles were cut to an ellipsis at tablet widths although room was free | fixed in the four title rules | fixer's measurements; crawler pictures |
| phone-touch-3 | minor | The photo viewer's error text was drawn under the Back button | fixed | fixer's measurements |
| phone-touch-4 | minor | An episode page asked for a series backdrop that does not exist (404) | fixed here, at the episode page (the shared-code fixer had rejected a fix in the image rules, rightly: see 12.3) | page loaded here: no failed image request |
| engines-1 | minor | Enter on a Home card followed at once by Escape left the drawer open over the new page | same cause and fix as shell-keyboard-7 | e2e (`navigation`), three engines |
| engines-2 | minor | The media info e2e test always failed in WebKit (no post data for a File body) | fixed in the test | fixer's runs, three engines |
| engines-3 | minor | Firefox: the mixed-direction e2e test reloaded while the Hebrew locale was loading | fixed in the test | fixer's runs, three engines |

Totals: 47 findings, all closed: 44 fixed as reported, 2 that were the same defect as another finding, and 1
(phone-touch-4) rejected by its fixer and then fixed in another place. None rejected, none left open.

### 12.3 What the integration changed beyond the fixers' work

- **Left from the letter column (home-browse-2).** The fix made the grid hand focus back to its last card when
  an arrow key enters it. In a 1440x900 window the focused letter is below every card row, the navigator finds
  no card in the key's beam, and its rule for that case gives the key to the shell, which opens the nav drawer:
  Left from "S" ended in the drawer. The letter column now hands the key to the grid's own entry rule
  (`leaveLetterColumn` in `src/features/browse/components/letterFocus.ts`, `focusInto` in
  `src/app/spatialNav.ts`), in the library grid and in the genre and studio tiles; mirrored in right-to-left.
- **The series backdrop of an episode without one (phone-touch-4).** The image rules cannot tell from an item
  alone whether its series has a backdrop: lists that ask the server for primary images only do not get
  `ParentBackdropItemId` either (0 of 64 episodes in the fixer's probe), so skipping the request there would
  drop backdrops that exist. The episode page, though, has the full item, which names the nearest ancestor with a
  backdrop; when it names none and has none of its own, the page asks for no backdrop
  (`src/features/detail/episode/EpisodeDetails.tsx`).
- **A pinned header and the pivot scroll.** Focus moving from a License row to the header's Back button
  scrolled the page up by about 230 px, although a sticky header is always in view. A container marked
  `data-focus-scroll="none"` now ends the bring-into-view walk (`src/ui/lib/bringIntoView.ts`); the full-page
  header carries it.
- **One helper for counted titles.** The music copy of `withCount` is gone; the album page uses the shared one
  in `src/i18n`.
- **Source hygiene.** The left-to-right isolate characters around server addresses were literal invisible
  characters in two files (section 9.1, finding 18, had made them escapes everywhere else): escapes now. The new
  mirrored-icon rule used `:dir(rtl)`, which the oldest supported Chrome does not know: it uses the document's
  `dir` attribute like the rules around it. The phone overlay of Now Playing uses the black token instead of a
  colour computed from the half-transparent one. The navigator's visibility test passes both spellings of the
  option that older Chromium versions know.
- **Lint.** The player's error box computed its text in a variable of the component body, which made the React
  compiler rule report the component's shortcut handler twice (27 warnings); the text is computed where it is
  used (25, as before).
- **e2e.** Sixteen tests (12.5); every one fails on the tree before the fixes.

Read and left as the fixers wrote it: the arrival state machine of the shell, the queued Back key (it reads the
router's own state through React Router's `UNSAFE_DataRouterContext`, because `useNavigation` is one render
behind), the opener chain of the overlays, the press guards, the drag handler, the photo viewer's address
writes (a `replace` per photo; a held arrow key does not step through photos, so the browsers' limit on
history writes is out of reach), the player's address follow.

Found on the way, not changed: in WebKit a mouse click on a button of the photo overlay within about 100 ms of
opening the overlay with the keyboard is lost (the pressed node is replaced while the overlay finishes
opening). It is the same on the tree before this round, a person cannot be that fast, and a click one second
later works; the new photo test waits for the overlay to settle.

### 12.4 Deviations introduced

To carry into [DEVIATIONS.md](DEVIATIONS.md). This list replaces two older statements: section 10.7 ("selecting
the current page's own drawer entry keeps the grid") and the rule of section 10.5 that any arrow key goes to
the drawer when the page has nothing to focus.

| TV | Web | Why | File |
|---|---|---|---|
| Keys are queued: Back right after OK acts on the page just opened | A Back key (Escape) pressed while a navigation is under way waits for it and is handled on the page it opens; it is dropped when another navigation took its place | The next page's module may still be loading with the address unchanged; Back then acted on the page being left | `src/app/shell/useBackKey.ts` |
| Every drawer choice pushes a new destination | Every drawer navigation builds the routed page anew, also when the current page's own entry is chosen | A kept page asked for no first focus and focus stayed on the tab row | `src/app/AppShell.tsx`, `src/app/shell/useAppStack.ts` |
| A key always starts from a focused element | With nothing focused and nothing to focus in the page (loading, empty, error), only the arrow that points at the drawer enters it; other arrows are taken and move nothing. Phones (no rail) unchanged | An arrow pressed while a page was loading put focus in the drawer for good | `src/app/shell/shellFocus.ts` |
| A page opened from the drawer requests focus when its content shows | The same, whatever is pressed meanwhile; a pointer press or the user's own move into the drawer ends it. The toward-page key pressed before the new page shows is taken and moves nothing (for at most 10 s) | The page on screen is still the one being left | `src/app/shell/shellFocus.ts` |
| Rows have no pointer | A row can be dragged sideways with the mouse (6 px before it counts; the click that ends a drag is swallowed; while a row can scroll its cards are not picked up as browser drag-and-drop links) | The working agreement's layout rule | `src/ui/lib/dragScroll.ts`, `src/ui/rows/ItemRow.tsx` |
| The series image of a season or episode is requested even when the series has none (the image loader swallows the 404) | No request without `SeriesPrimaryImageTag`; on the episode page, no series backdrop request when the full item names no ancestor with one | The request is certain to fail | `src/api/images.ts`, `src/features/detail/episode/EpisodeDetails.tsx` |
| Closing a dialog returns focus to the focused element of the window underneath | An overlay opened from an element of another overlay returns focus to that element if it is still there, else to what opened that overlay, and so on | A menu entry is removed with its menu | `src/ui/lib/inputModality.ts`, `src/ui/overlays/Dialog.tsx`, `DropdownMenu.tsx` |
| (no pointer) | A press that closes a dialog or menu does not move focus; Escape closes the top dialog also when focus is in no overlay; arrow keys with nothing focused belong to the open overlay | Focus fell to the page behind an open dialog | `src/ui/overlays/Dialog.tsx`, `DropdownMenu.tsx`, `src/app/AppShell.tsx` |
| (no pointer) | While the keyboard owns the highlight, the focused element keeps its focused look through a press elsewhere until that press's click | An expanding pill that shrank at mouse-down moved the pressed button away | `src/ui/lib/inputModality.ts`, `src/features/browse/components/GridHeader.module.css` |
| The grid restores its last focused card; its header is its sibling | The same now: the grid hands focus back to its last card (also from the letter column, whatever the window's size), and Up from its first row reaches its own buttons before the tab row | Geometry alone chose the nearest card or the tab row | `src/app/spatialNav.ts`, `src/features/browse/components/LibraryGrid.tsx`, `letterFocus.ts` |
| The focused Home row sits 50dp under the top of the list | In a window too short for 50dp plus the card, the card moves up just far enough to end at the list's bottom edge | The card was cut off next to the mini player | `src/features/home/useHomeFocus.ts` |
| Down on Home's last row does nothing | With the music mini player showing, it enters the bar | The bar was out of reach with the arrows on Home only | `src/features/home/HomePage.tsx` |
| Grid titles are centred on the full width | Centred, but a title too long for the room between the Back button's and the clock's reserve uses the free side and may sit slightly off centre | Titles were unreadable at 600 to 850 px | `GridHeader.module.css`, `ItemGridPage.module.css`, `MoreHomeRowPage.module.css`, `PhotoFolderView.module.css` |
| The search page's tab is saved state | It is in the address (`?tab=discover`) | Back and reload return to it | `src/features/search/SearchPage.tsx` |
| (no address) | A "View more" grid opened by its address or reloaded focuses a card already in view, without scrolling | Nothing was focused | `src/features/home/MoreHomeRowPage.tsx` |
| (no wheel) | The library grid re-pivots its focused card after the header collapses only when a focus move scrolled it, never after a wheel, touch or scrollbar scroll | The wheel scroll was undone | `src/features/browse/components/LibraryGrid.tsx` |
| The playback destination has no address | `/play/<id>` is replaced with the entry now playing when Next Up or the queue moves on; the engine is not restarted. `/play/list` keeps naming the list | Reload and shared links continue what is playing | `src/features/playback/PlaybackPage.tsx` |
| (web-only screen) | The player's error screen offers "Play with transcoding" only when the item itself loaded, and does not repeat a detail the message already quotes | Transcoding cannot help a failed item request | `src/features/playback/playbackErrors.ts` |
| (no pointer) | In the guide, pointer input shows the tab row and the buttons again on release, not on the press | The click after keyboard focus was lost | `src/features/livetv/TvGuide.tsx` |
| Down from the guide's buttons: focus search | Down returns to the program (or channel) of the first row that was focused last, else the program at the start of the visible guide | The buttons follow the interface direction, the guide is left-to-right in every language | `src/features/livetv/TvGuide.tsx`, `GuideGrid.tsx` |
| Now Playing: a transparent-to-black gradient behind the controls, beside the lyrics | Under 600 px the gradient is solid black after 24dp | There the lyrics run under the controls | `src/features/music/NowPlayingPage.module.css` |
| (no address) | The photo viewer's address follows the photo on screen (`replace`, no new history entries) | Reload, shared links, Back and Forward return to that photo | `src/features/photos/SlideshowPage.tsx` |
| The filter panel is closed with Back | A click or tap outside it closes it and does nothing else | The same press opened the details overlay | `src/features/photos/ImageFilterDialog.tsx`, `SlideshowStage.tsx` |
| License page: the D-pad moves through the rows; Debug page: Up and Down scroll | Both pages keep the scrolling model; Left and Right on the page, and Up and Down at a scroll edge, hand focus to an element in view, and the arrows then move through the rows | The License page carries long web-only texts that row-to-row focus would skip | `src/features/settings/FullPage.tsx` |

Not deviations (the web now does what upstream does): the first element of a right-to-left row; the "Go to
series" arrow mirrored in right-to-left; Enter that activated a chapter, a queue item or a sheet item does not
show the player's controls again; the D-pad leaves the search field of Add to playlist; the DVR tab's arrival
focus; a Discover grid's first focus from a genre card; the view options dialog of the guide stays open over a
reload.

### 12.5 Tests added

Unit (the suite went from 68 files and 621 tests to 79 files
and 686 tests): the shell's arrival state and the queued Back key, the navigator (start edge, grid re-entry,
header before tabs, hidden elements, `focusInto`), the overlays' opener chain and press guards, row dragging,
the pinned container, image rules, counted titles, Home's short-window scroll, the visible-cell pick, the
field's arrow exits, the player's Enter rule, error-screen rules and address follow, the Live TV tab arrival,
the viewer address, the License page's pick, the Discover grid's arrival steps.

e2e (16 tests, 30 runs across projects; the suite went from 191 to 221): see the coverage table of
`e2e/README.md`. Each of the sixteen was run against the source tree of before the fixes and failed there.
One of them holds a fixed 700 ms wait (the wheel test: the defect was a timer and there is nothing to poll
for).

### 12.6 Gates (final tree)

- `npm run gen` (no diff), `typecheck`, `e2e:typecheck`, `test` (79 files, 686 tests), `lint` (0 errors, 25
  warnings, as before), `build`: pass.
- `npm run e2e`, twice in a row, own port: 221 passed both times, 0 failed, 0 flaky, 0 skipped, 3.9 minutes
  each. (The runs were on the tree before the last e2e-only commit, which adds a user-data snapshot to one music
  test; that spec then passed twice on its own.) Seen while writing the tests and settled:
  - The photo test failed in WebKit (2 of 2): its click on "Play slideshow" came within 100 ms of opening the
    overlay and hit a node that was being replaced (12.3, last paragraph). The test now waits for the overlay to
    settle; 3 of 3 in WebKit afterwards, and in both full runs.
  - The same test failed once in Firefox, in a run of three engines side by side, on the background check
    (console or request error); the line itself was not kept. The test reloaded right after two key presses;
    Firefox reports a module import that a reload aborts as an uncaught error (the cause of engines-3). The test
    now waits for the page to settle before it reloads: 16 of 16 in Firefox afterwards, and in both full runs.
    The cause is the likely one, not a proven one.
- Crawler, test server, PURPLE, desktop-1920x1080 and phone-390x844: 390 pictures, 390 ok, 0 warnings, 0
  errors, 1 scene skipped for lack of data. The 62 pictures that an English crawl of the tree before the fixes
  also holds were compared pixel by pixel: 60 identical; the two of the music library's Songs tab differ by
  watched marks (data). Looked at: Now Playing on a phone (controls, lyrics), the "View more" grid, a genre page,
  a photo album, a folder library, the paused player on a phone, the photo viewer.
- The same screens in Hebrew (desktop, tablet, phone: 27 pictures, 0 errors, 6 warnings, all scene `prepare`
  steps that look for English button names, as in section 9.6) and the grid pages at tablet width in English
  (18 pictures, 0 warnings). Looked at: the grid titles at 820 px in both languages (whole and centred), the
  Hebrew item menu ("Go to" points right, "Go to series" points left).
- TV compare run (208 scenes, headless Edge, one worker): 208 ok, 0 warnings, 0 errors. Compared pixel by pixel
  with the tv-compare checker's run of the tree before the fixes: 145 identical, 63 differ. Every difference
  was looked at or belongs to a family of which several were: Home's row list in 25 scenes (the "Recently added
  in Codec Zoo" row is gone: every item of that library is marked watched on the shared server now, and the row
  lists unwatched items); frames, clocks and progress lines of playing video, Live TV and music (21); the
  server's random order and images of "More like this", the extras and the genre tiles (4); watched marks,
  unwatched counts and resume bars (7); one or two pixels of a poster's decoding (6). No layout moved: titles,
  headers, rows and dialogs are at the same pixels.
- `npm run ts:verify` afterwards: 31 checks pass; two playlists, no Live TV timer.
- Production image: `npm run docker:build` passes (258 MB; the `npm ci` layer came from the build cache).
  Container with `--rm` on 127.0.0.1 against the test server, `HSTS=false`: `/healthz` 200; `/config.json`
  carries the server address; a deep link answers 200 with the app's page; Content-Security-Policy narrowed to
  the configured Jellyfin, `frame-ancestors 'none'`, `nosniff`, `no-referrer`, `Permissions-Policy: camera=(),
  microphone=(self), geolocation=(), payment=(), usb=()`, COOP `same-origin`; sign-in on the user list lands on
  Home (11 rows); an H.264 item opened by its address shows "Click to play" (no user gesture yet), then played
  4 s (100 frames) with no policy violation and a Stopped report on exit; the only console error was the
  expected 404 of Home's plugin probe. The container is stopped and removed; one image of this project is left,
  `wholphin-web:latest`.
- Every browser was headless and muted; one dev server and one browser at a time. The real servers were used
  only by the e2e Discover spec, as before (the limited account, reads only, every Seerr write answered by the
  test itself). No Live TV timer or recording was created. On the throwaway server: playback of seconds (user
  data restored by the fixtures), sign-ins of the test user.

### 12.7 Not verified, still open

Open:

- [DEVIATIONS.md](DEVIATIONS.md) still says what 12.4 replaces: the row "Row scrolls when focus moves" (wheel,
  trackpad and swipe, no mouse drag), the library row "a destination is a new screen" (the grid is kept when
  the current page is chosen again) and the rule for an arrow key with nothing focused. The table of 12.4 is
  written to be folded in.
- An empty or failed page with the music mini player showing: with nothing focused, Down does not reach the
  bar (the shell takes the key, 12.4, third row); Tab does. Letting it through would send a Down pressed while a
  page is loading into the bar instead.
- The rule "arrows leave a one-line text field at its edges" now exists twice, in the search page's header and
  in `src/features/detail/common/fieldArrowExit.ts`; one shared helper would do.
- The photo grid has its own letter column and its own grid: whether Left from a letter that is level with no
  photo row ends in the nav drawer there too was not looked at.
- Three older style rules still use `:dir(rtl)` (episode strip arrows, a Home customization handle, the
  settings page), which the oldest supported Chrome version (119) does not know; there the mirrored detail is
  missing in a right-to-left interface.
- Seen by the checkers, not reproduced or not judged a defect, and not followed here: a wheel scroll on a
  Recommended tab within about 450 ms of an arrow key jumps back; in WebKit, focus on `<body>` once after the
  Menu key on a detail page's More button and Escape; a right-click menu whose card a large window shrink
  removes from a virtual grid closes with focus on `<body>`; after a reload of a scrolled "View more" grid the
  restored focus was on a card partly below the window; the third Live TV tab's label is not translated in
  Hebrew (translations are on hold).

Not verified:

- Discover with a real Seerr: the grid's first focus and start card (search-discover-1, -2) were checked with
  every Seerr request answered locally, the search tab (search-discover-3) with a stand-in provider.
- Real Safari, real iOS and real touch hardware: every WebKit and touch check used Playwright's builds.
- The queued Back key in a production build: the window in which a navigation is "under way" was measured on
  the development server, where route modules load one by one; the unit test covers the logic.
- A full Hebrew crawl after this round (only the screens named in 12.6); the Hebrew crawl's `prepare` warnings
  of section 9.6 stand.
- playback-1 to -4 and livetv-2, -3 were not run again here in a browser beyond the suite and the crawls; their
  fixers' runs and the unit tests stand for them.
- The container check ran with `HSTS=false`; the header itself has its server test.
- Everything listed as open in sections 9.6 and 11.4 that this round did not touch.

## 13. Polish round

Six fixers worked side by side in the working tree of section 12 (branch `polish`, cut from `main` at `3b1dd7b`),
each on one area, on the points section 12.7 and the comparison pass (`docs/parity-notes.md`, section 6) had left
open. None of them committed. This section is the integration: every change read against its fixer's report,
the requests between areas settled, one regression found and repaired, tests added, and the gates on the final
tree.

Commits, oldest first: `a229ac6` (the Back key before the new page shows), `62249ec` (shell focus), `8d08312`
(Home and "View more"), `db09814` (photo grid letters), `ad65255` (Live TV tabs), `8b618cd` (one field rule),
`23ac491` (series overview scroll), `1850f33` (stylesheets), `352fc73` (server version tiers), `31dbaad`
(crawler), `07d4d47` (e2e tests), then this section.

### 13.1 The items

Status: **fixed** by the fixer of its area, **fixed, completed here** (the integration added to it), **no
change** with the reason. "Seen" is how the outcome was checked; the e2e tests named there are new (13.5).

| Item | What was open | Status | Seen |
|---|---|---|---|
| shell-focus 1 | With nothing focused on an empty or failed page, Down did not reach the music mini player (12.7) | fixed: Down enters the bar once the page has settled; Up in the bar with nothing to return to waits on the page area | e2e (`drawer`); 10 unit tests; fixer's runs in three engines |
| shell-focus 2 | An Escape right after opening Live TV from the drawer was lost now and then | two things. Escape beyond the guide's first program returns to the first program, as upstream does (`TvGuideGrid.kt:345-365`): no change. A real loss in the moment between the router finishing and React showing the new page (1 of 40 cold starts): fixed for every page | e2e (`navigation`), three engines; unit test; fixer's 160 cold starts after the fix, 0 lost |
| shell-focus 3 | The held focus look (`data-focus-held`) stayed after a press that produced no click (secondary or middle button, a pressed node removed before release) | fixed | e2e (`home`), three engines, written here; unit test |
| shell-focus 4 | WebKit: focus on `<body>` after the Menu key on a detail page's More button and Escape (12.7) | not reproduced in 44 WebKit runs, no change: the More button has no context menu, Escape is Back, and `<body>` shows only while the page that Back opens is loading | fixer's runs |
| shell-focus 5 | A window shrink with a card's menu open left focus on `<body>` (12.7) | fixed, and the cause was wider than reported: the library grid builds its cards anew whenever the column count changes, so a focused card lost focus with or without a menu | e2e (`context-menu`); 10 unit tests; fixer's runs in three engines |
| shell-focus 6 | The queued Back key had been measured on the development server only (12.7) | checked in a production build (`vite preview`): Enter then Escape at once on a library card, 20 of 20 back on the same card after one history entry | fixer's runs |
| grids 1 | The wheel on a Recommended tab within 450 ms of an arrow key jumped back (12.7) | fixed, for Home's own rows too (the same hook) | e2e (`browse`), three engines |
| grids 2 | After a reload of a scrolled "View more" grid the card that took focus was cut by the window (12.7) | fixed, completed here: after a mouse or touch press the page no longer moves (13.2) | e2e (`home`), two tests; unit tests |
| grids 3 | Photo grid: Left from a letter level with no photo row (12.7) | it did end in the nav drawer (27 of 27 letters in the library at 1440 and 1920 px wide); fixed like the library grid | e2e (`photos`) |
| grids 4 | Live TV took arrival focus where other pages do not | on a direct load Live TV does what every page does (focus for every non-touch device, DECISIONS A-32): no change there. The real difference was a mouse click on a tab, which moved focus off the clicked tab into the content: fixed | e2e (`livetv`), three engines; unit tests |
| grids 5 | The rule "arrows leave a one-line field at its edges" existed twice (12.7) | one helper in `src/ui/lib/fieldArrowExit.ts`; the copy and its re-export are gone (the last import was moved here) | unit tests; existing e2e (`search`, `detail`) |
| grids 6 | Letter jump: the TV picture has focus back on the card it came from (`parity-notes` section 6, item 7) | settled from the Kotlin, no change: an upstream bug (13.3) | reading; the compare pair |
| grids 7 | The "Watch live" row is missing from some Home pictures | not a Home defect, no change in `src`: the row lists programs on air that end more than a minute after the browser's time; the test guide starts every program on the hour and half hour, and the crawler's browser clock is frozen at 20:00, so the row is empty for most of the day (and in the last minute of every half hour with a real clock) | fixers' probes (API answers on both sides of the boundary; Home with the page clock set) |
| series-scroll | Series overview: the scroll offset after arrow keys differed from the TV by 165dp (page 2) and 26dp (page 3) (`parity-notes` section 6, item 3) | fixed: 165.0 and 324.5dp against the TV's 165 and 325 | compare pairs looked at here; e2e (`series`), written here; 8 unit tests |
| css-engines 1 | Eight rules used `:dir(rtl)`, unknown to Chrome 119 (12.7 named three) | fixed; one of them had taken the working half of a selector list with it (the right-to-left slider thumb) | guard test; fixer's Hebrew measurements; Hebrew crawl |
| css-engines 2 | Feature stylesheets trimmed text with `text-box`, which Firefox 128 skips: texts 1 to 6 px taller there, up to 27 px further down the page | fixed with the kit's exact helpers: Chromium and a Firefox with `text-box` switched off now agree within 0.06 px on 39 measured elements | guard test; fixer's measurements; crawls and compare pairs looked at here |
| tools-i18n 1 | The Hebrew crawl's 84 `prepare` warnings from English control names (9.6, 12.6) | fixed: 0 warnings | Hebrew crawl run here |
| tools-i18n 2 | Live TV's third tab reads "Recordings" in Hebrew (12.7) | no change: the label is the recording folder's name from the server, as upstream (`CollectionFolderLiveTv.kt:63`) | reading; fixer's probe |
| tools-i18n 3 | A server status "will not be supported soon" in the types | dead code, removed: the web never classifies a server that way (recorded deviation) | unit test |
| tools-i18n 4 | A Home picture taken before its last row | not reproduced in 20 runs; the Home scenes now state the wait (`homeRowsLoaded`). The missing row is grids 7 | English pictures byte-identical before and after |
| livetv-overlay | The Live TV player overlay differs from the TV picture (`parity-notes` section 6, item 2) | no change, and the premise was wrong: the TV does not show the program's times either (13.3) | reading; fixer's probe; the compare pair |

### 13.2 What the integration changed beyond the fixers' work

- **Back with the mouse to a "View more" grid (grids 2).** The fix brings the card that takes focus after a
  reload fully into view. The shell also puts focus back on Back, whatever the input: a mouse user who scrolled
  the grid, clicked a card that the window's edge cut and came Back saw the page move (from 60 to 130 px in the
  test), which the tree before this round did not do. The page now moves only when the keyboard acted last or
  nothing was pressed in this document yet (a reload, an address opened); `noInputYet()` in
  `src/ui/lib/inputModality.ts` tells the second case from the default "pointer". A new e2e test holds it; it
  fails on the fixer's version.
- **Requests between areas.** The Add to playlist dialog imports the shared field rule and the re-export file
  is gone. The TV compare scenes of the series overview wait as the reference run did (900 ms after Right, 500 ms
  between Downs: the second episode's people have to be there before Down, or the page is too short to scroll),
  and the two notes in `tools/shots/refmap.ts` that recorded the old offsets are gone. The note of the letter
  jump pair names the upstream bug.
- **Source hygiene.** Five files had Windows line endings; the left-to-right isolate characters in the crawler's
  new `uiText.ts` were literal invisible characters (escapes now, as in 12.3). One comment in the crawler said
  the opposite of what its author had measured.
- **e2e.** Three tests written here (13.5), the coverage table and the count in `e2e/README.md`.

Read and left as the fixers wrote it: the settled-page rule of the shell (text shown and no `aria-busy`), the
second window of the queued Back key, the resize watch and the "openers gone" handler, the end of the press
hold, the tab arrival rule, the overview scroll rule, the stylesheet rewrite. For the "openers gone" handler one
thing was checked beyond the report: a menu entry that navigates (Go to, from a Home card, with the Menu key
and with the mouse) ends with the same focus with the handler on and off, because the menu closes onto its
still present card before the router moves.

Not taken up (recorded in 13.7): the library grid still builds its cards anew on every column-count change; the
overlays of the photo viewer and the player sheet do not use the new "openers gone" handling; the gallery still
shows the server card's `unsupported_future` look, which only the gallery uses now.

### 13.3 Deviations introduced or removed

To carry into [DEVIATIONS.md](DEVIATIONS.md).

| TV | Web | Why | File |
|---|---|---|---|
| A key always starts from a focused element | Replaces 12.4, third row. With nothing focused and nothing to focus in the page, only the arrow that points at the drawer enters it, and Down enters the music mini player once the page has settled (it shows some text and nothing marked `aria-busy`); while the page is loading the other arrows are taken and move nothing, as before. Up in the bar with nothing to return to puts focus on the page area, from where the arrows work as with nothing focused | The bar, and from the bar the drawer, was out of reach with the arrows on empty and failed pages | `src/app/shell/shellFocus.ts`, `src/app/AppShell.tsx` |
| Keys are queued: Back right after OK acts on the page just opened | Extends 12.4, first row. A Back key is also held in the moment after the router is through and before React shows the new page | The address was the new one, the Back rule still the old page's (on Home: "Back in the drawer returns to the page") | `src/app/shell/useBackKey.ts` |
| (no pointer) | Extends the 12.4 row on the held focus look: it ends with the press's click, or when the press ends without one (the next task after a mouse or pen release, 400 ms after a touch release, at once on `contextmenu`) | The mark stayed until the next click or key | `src/ui/lib/inputModality.ts` |
| (no window resize) | Focus whose element goes away in a resize re-layout returns to the same item (found as on Back: its key, its link, its place), else into the page as an arrow key with nothing focused would; the page is scrolled for it only when the keyboard acted last. An overlay that closes with every opener gone does the same | A focused card, or the card a dialog was opened from, is rebuilt when the column count changes | `src/app/shell/useFocusRestore.ts`, `src/ui/lib/inputModality.ts`, `src/ui/overlays/Dialog.tsx`, `DropdownMenu.tsx`, `src/app/spatialNav.ts`, `src/app/shell/shellFocus.ts` |
| (no wheel) | A wheel, touch or pointer press on Home's rows or a Recommended tab cancels the pending 450 ms settle onto the keyboard-focused card | The settle undid the user's scroll | `src/features/home/useHomeFocus.ts` |
| (no address, no reload) | Replaces the 12.4 row "focuses a card already in view, without scrolling". After a reload or Back of a "View more" grid, the card that takes focus without input (the page's pick, or the card the shell remembers) is brought fully into view as an arrow-key move would, when the keyboard acted last or nothing was pressed yet; after a mouse or touch press the page stays where it was. With no card fully in view the first partly visible one is picked | The focused card was cut by the window; a pointer user's page must not move by itself | `src/features/home/MoreHomeRowPage.tsx`, `restoredFocus.ts`, `pickVisibleCell.ts`, `src/ui/lib/inputModality.ts` |
| The grid restores its last focused card | The photo grid now follows the 12.4 row of the library grid: an arrow key entering it, also Left from any letter, returns to the card focused last | Left from a letter level with no photo row went to the nav drawer | `src/features/photos/PhotoFolderView.tsx` |
| (no pointer) A chosen Live TV tab hands focus to its content | Chosen with the keyboard, or on a page opened with nothing focused: the same. Chosen with a pointer: focus stays on the clicked tab, as on every other tabbed page | A click moved focus off the clicked control | `src/features/livetv/tabArrival.ts`, `LiveTvView.tsx` |
| Series overview: the column is padded 16dp before it scrolls and sits under a delayed nested scroll (`yDelay` .33). With animations off it covers 89% of the way to the pivot below the header and 67% onto the buttons; with animations on, the whole way to the pivot of the padded viewport | The same, with `prefers-reduced-motion: reduce` standing for Android's animator scale 0. Removes the recorded deviation "Down from an episode to Play: the TV scrolls about 165dp, the web does not". Web addition: after a partial move the focused element is pulled whole into the viewport | `SeriesOverviewContent.kt:147-155`, `DelayedNestedScrollConnection.kt`; the reference pictures were taken with animations off | `src/features/detail/series/overviewScroll.ts`, `SeriesOverview.tsx` |
| A Compose Text is as tall as its font (`LineHeightStyle` Trim.Both) | Removes a difference between engines rather than adding one: the drawer profile, music headers, song numbers, section titles, Now Playing, the photo title, footer and overlay, settings group and dialog titles, the setup screens and dialogs, and the phone title of `TitleOrLogo` use the exact helpers (`t-line`, `t-trim`) in every engine. Before, Chromium rounded these boxes up by as much as 1.5dp and Firefox 128 kept full line boxes | `text-box` is unknown to Firefox 128 and inexact in Chromium | the stylesheets of commit `1850f33` |

Upstream bug not copied (the web's behaviour is unchanged; the reason is new):

| TV | Web | Why | File |
|---|---|---|---|
| Letter jump leaves focus on the card it came from: `CardGrid.kt` picks each card's focus requester inside `remember(index, item, cardWidthPx, columns)` (lines 362-375) without `focusedIndex`, so `focusOn(jumpPosition)` never moves the requester, and the grid's `focusRestorer` hands focus back to the last focused child. In a large library the jumped-to cards are new and the request most likely fails | Focus goes to the first item at or after the letter | That is what `jumpToLetter` (lines 215-231) means to do; a near jump otherwise undoes itself | `src/features/browse/components/LibraryGrid.tsx` |

Corrections of wording (no behaviour changed):

- **Live TV player overlay.** `docs/parity-notes.md` (section 6, item 2) and the Live TV row of DEVIATIONS
  ("Remaining time and 'Ends at' for live") say that the TV shows the program's position, remaining time and
  end. It does not: the TV shows ExoPlayer's position and remaining time within the stream it received, and an
  "Ends at" worked out from them (`PlaybackControls.kt:253-322`, `PlaybackController.kt:203-218`); nothing under
  `ui/playback` reads a guide program. The reference picture was taken 20 minutes into a 30-minute program and
  shows "3s", "-28m 39s" and "Ends at 5:20 PM". The web receives a growing transcode window of about 30 s for
  the same channel, so it cannot show those numbers either. The recorded deviation (the seekable window and a
  "Live" label, no "Ends at" for an infinite stream, spec 05 B4) stands.
- **Escape in the guide.** Not a deviation: Escape beyond the guide's first program returns to that program
  first, as upstream.
- **The third Live TV tab's label** is server data, not a missing translation.

### 13.4 Decisions

- **"Settled" is read from the page** (text shown, nothing marked busy), not from the router or the query
  client; a survey of 35 pages with every answer delayed found every loading state marked busy. The bar focus
  given this way stays replaceable by the page's own first focus, as a net for a wrong guess.
- **The Back key's second window is closed in the shared hook**, not for Live TV alone.
- **400 ms for a touch release**, not 0, so the tap fix of section 12 (phone-touch-1) stays intact.
- **Resize: the same item first, a fallback only once the layout has settled, no page scroll after a pointer
  press.** The watch runs only after resize events and ends at the next key or pointer press.
- **Live TV: arrival focus on a direct load stays for every non-touch device** (DECISIONS A-32), although the
  item asked for keyboard only; that would have contradicted every other page and an existing test. Only the
  exemption for focus on the tab row became keyboard-only.
- **Series overview: reduced motion stands for Android's animator scale 0.** The reference pictures are
  matched with reduced motion; otherwise the animated behaviour applies, which is derived from the Compose
  code and not measured on a TV. The one-frame rule for Down from the strip onto the buttons is fitted to the
  reference picture (exact to 0.1dp), not derived: why the second frame is missing there is not explained by
  the code. The rule runs for arrow-key moves only.
- **Exact text heights in every engine** rather than keeping `text-box` for Chromium behind `@supports`. The
  price: Chromium's pictures are not pixel-identical with before; texts move by 0.25 to 1.9 px and what follows
  them by the running sum (up to about 5.6 px on the music header's genre line). The three screens checked here
  against the TV pictures (settings, an album page, the server list) are as close as before or closer.
- **The live overlay stays as spec 05 B4 decided.** A program-based overlay would not be a port, and its bar
  would show program time behind the knob that cannot be reached; ExoPlayer's rule over a 30 s window would
  show "-26s" and an "Ends at" half a minute ahead.
- **Letter jump: the web keeps the code's intent** (13.3).
- **The crawler reads control names from the app's own locale files**, with the app's own rule for an English
  fallback in a right-to-left language (wrapped in a left-to-right isolate); an unknown key fails loudly. No
  data attributes were added to `src` for the crawler.
- **Here: a pointer user's page does not move by itself** (13.2), the same rule the resize fix had chosen.

### 13.5 Tests added

Unit (the suite went from 80 files and 694 tests to 84 files and 742 tests): the mini player from a settled
page, the Back key's second window, the end of the press hold, the "openers gone" handler, focus recovery after
a resize, the first press in a document, the partly visible cell, the Live TV tab chosen with a pointer, the
shared field rule (moved and extended), the overview scroll, the crawler's string lookup, and a guard over
every stylesheet in `src` (`tools/css-engine-baseline.test.ts`: no `:dir()`, no `text-box` outside the kit
helper).

e2e (10 tests, 18 runs across projects; the suite went from 221 to 239): see the coverage table of
`e2e/README.md`. Seven came with the fixers, each reported as failing with its fix switched off. Three were
written here and checked the same way (the fix's lines switched off in the working copy, the test run, the
lines put back): the series overview scroll (the page stayed at 0), the press hold (the mark stayed), and Back
with the mouse to a "View more" grid (the page moved from 60 to 130 px on the fixer's version). Two tests hold
a fixed wait because the defect was a timer or a late focus move with nothing to poll for (the Recommended
wheel test, 700 ms; the Live TV tab test, 500 ms).

### 13.6 Gates (final tree)

- `npm run gen` (no diff), `typecheck`, `e2e:typecheck`, `test` (84 files, 742 tests), `lint` (0 errors, 23
  warnings: the same 23 as the tree of `3b1dd7b`, linted here side by side), `build`: pass.
- `npm run e2e`, own port, alone: 238 passed on the tree before the mouse-Back repair of 13.2; then, on the final
  tree, twice in a row: 239 passed both times, 0 failed, 0 flaky, 0 skipped, 4.3 and 4.2 minutes. No failure
  in any of the three runs.
- Crawler, test server, PURPLE, desktop-1920x1080 and phone-390x844: 390 pictures, 390 ok, 0 warnings, 0
  errors, 1 scene skipped for lack of data (no resumable episode is left on the test server, see 13.7).
  Compared pixel by pixel with the two English sets taken at the start of this round (206 and 148 pictures):
  154 and 126 differ. Looked at, by family: the stylesheet change (settings, setup, music, Now Playing, photos,
  the drawer: texts 1 to 4 px higher, nothing else moved); Home's first row and everything drawn over Home
  (next-up and watched state changed on the server during the round); unwatched counts in search; the times in
  the mocked DVR list; video frames, progress lines and the random "More like this" rows. A comparison with
  the crawl of section 12 is of little use: the test server was provisioned anew in between (another server and
  user id, so another avatar colour in every picture).
- The same crawl in Hebrew: 390 pictures, 390 ok, 0 warnings, 0 errors, 1 scene skipped (before this round: 84
  warnings). Looked at: the series overview and the settings page on a phone.
- TV compare run (208 scenes, headless Edge, one worker): 208 ok, 0 warnings, 0 errors. Looked at, each beside
  its TV picture: series overview pages 2, 3 and 4 (the same offsets as the TV now; before, page 2 stood at
  the top and page 3 was 26dp off), the Live TV player overlay (unchanged, as recorded), the letter jump
  (unchanged: the TV on the card it came from, the web on the first item at the letter), and the settings
  page, an album page and the server list beside both the TV picture and the picture of section 12 (texts
  within a pixel or two of the TV, as close as before or closer).
- `npm run ts:verify` before and after: 32 checks pass; no Live TV timer.
- Every browser was headless and muted; one dev server and one browser at a time. The real servers were
  used only by the e2e Discover spec, as before. No Live TV timer or recording was created. On the throwaway
  server: sign-ins of the test user and playback of seconds. One probe written here (the menu check of 13.2)
  opened a Live TV channel six times for about a second each, because "Go to" on a program card of Home's
  "Watch live" row starts the channel; no session was left playing.

### 13.7 Not verified, still open

Open:

- [DEVIATIONS.md](DEVIATIONS.md), `docs/parity-notes.md` (section 6, items 2, 3 and 7) and the rows of 12.4
  named in 13.3 still say what this section replaces. The tables of 13.3 are written to be folded in.
- **The test server's data moved during the round.** Each crawl plays through the Next Up scene, so the next-up
  episode of one series advanced by several episodes and no resumable episode is left (one scene skipped).
  Running the provisioning from the main checkout puts the seeded state back; it was not run from this
  worktree.
- **The "Watch live" row in crawl pictures** (grids 7, tools-i18n 4): the guide of `tools/testserver/guide.mjs`
  would have to stagger the programs' start times per channel, and the crawler's frozen clock would have to
  follow the server's time on the Home scenes (or `/LiveTv/Programs` be answered locally). Neither was done:
  changing the guide rewrites server data and belongs to the main checkout.
- **The library grid builds its cards anew on every column-count change** (twice per shrink). Keeping the
  nodes would remove the focus loss at its source; the recovery of this round covers it meanwhile.
- **Overlays outside the kit** (`ImageFilterDialog`, `ViewOptionsPanel` of the photo viewer, the player's
  `PlayerSheet`) still return focus to the nearest live opener only; the recovery for a missing opener also
  knows shell pages only, not full-screen ones.
- **Right from the photo grid into its letter column** still goes by geometry; the library grid lands on the
  current letter.
- **The server card's `unsupported_future` look** is used by the gallery only; the string
  `server_version_not_supported_future` stays in the generated locales.
- **Hebrew: the player's speed sheet** shows ".25" as "25." (a number made of neutral characters in a
  right-to-left list). Seen by the crawler's fixer, belongs to playback, not followed here.
- Slots of `ListItem` that hold element children still trim with `text-box` (the kit helper `t-trimBox`), so
  those slots keep full line boxes in Firefox 128.

Not verified:

- Real Chrome 119 and real Firefox 128: `:dir()` was judged by reading (Playwright's Chromium is far newer),
  `text-box` with a current Firefox whose `layout.css.text-box.enabled` was switched off.
- Real Safari, real iOS, real touch hardware and a real long press: the 400 ms touch rule is unit-tested only.
- A real Android TV with animations on: the series overview's behaviour with normal motion comes from the
  Compose code. The overview scroll was run in Chromium only; the row of extras and the mini player's reserve
  were not exercised.
- Why the Android client received a Live TV stream about 28m 42s long (the emulator was not run).
- The mini player from an empty page on a phone layout and in Hebrew (unit test only); empty or failed pages
  other than a failed item page.
- Resize recovery with a card that the shrink drops from the rendered range while the keyboard is in charge
  (the test server's largest grid is too small; the scroll path is unit-tested), and in Hebrew.
- The restored "View more" card in Firefox and WebKit (Chromium only); a real trackpad on the Recommended tab.
- The queued Back key in a production build was checked with `vite preview` in Chromium, not with the Hono
  server or the Docker image. No Docker build was run in this round.
- The Discover scenes of the crawler with the new string lookup (real server only), the TV compare scenes
  other than the pairs named in 13.6 one by one, and themes other than PURPLE.
- Everything listed as open in sections 9.6, 11.4 and 12.7 that this round did not touch.

## 14. Closing round and first owner test

Two small jobs after the polish round had landed (`main` at `c358a52`), both in the working tree of section 13
and both committed on `main` by the lead. Each had one agent that changed code and one independent agent that
checked it; neither agent committed.

- **The closing round.** One workflow: three documentation writers, one agent that retook the nine pictures of
  the root README (same names and pixel sizes, from the app on the seeded test server), one small-fix agent for
  the four points 13.7 and the verifier of section 13 had left, and one independent checker. Verdict of the
  checker: "ready to commit", nothing blocking. The code is commit `692715f`.
- **The touch fix.** On 2026-11-18 the owner tried the app on a real touch device and reported that
  everything works. The owner named one touch problem: in Settings, scrolling
  the page with a finger that lands on a slider changed the slider at once. One fixer and one independent
  verifier took it. Verdict of the verifier: "ready to commit". The lead changed two details after the
  verifier's notes (14.2). The code is commit `7ad52ba`.

The trial itself, the owner's decisions and the clean-up of worktrees and branches are not code and are
recorded in [PROJECT-LOG.md](PROJECT-LOG.md), phase 30, and [DECISIONS.md](DECISIONS.md) (O-26 to O-29, T-52 to
T-57).

Commits, oldest first: `692715f` (values in right-to-left languages), `7ad52ba` (touch on sliders and the
reorder handle).

### 14.1 The items

Status as in 13.1: **fixed**, **fixed, completed by the lead**, **no change** with the reason. "Seen" is how the
outcome was checked; the e2e tests named there are new (14.5).

| Item | What was open | Status | Seen |
|---|---|---|---|
| closing 1 | Hebrew: the player's speed sheet shows ".25" as "25." (13.7) | fixed, and wider than reported. A scan of every value the code can show (1,236 strings, laid out in a right-to-left paragraph) flagged 184, the same in Hebrew and Arabic: 3 of 8 speeds, all 23 maximum-bitrate values in the player's list and in the settings slider ("100 Mbps" drawn "Mbps 100"), all 129 negative subtitle delays of 259 ("-1.5s" drawn "1.5s-"), all 6 delay step buttons ("+50ms" drawn "50ms+"). The debug overlay ("mbps 3.93", ":Backend") and the two shortcut toasts had the same defect. Cause: such a value is made of digits, signs and Latin units, and the browser orders a run like that by the line's direction; upstream lists the speeds as the literal strings ".25", ".5", ".75", "1.0" (`PlaybackConstants.kt:9`) | e2e (`playback-engines`, `settings`), three engines each; 6 unit tests; fixer's probe after the change in Edge, Chromium and Firefox (nothing flagged in any sheet, the delay dialog, the toasts, the debug overlay; the settings scan clean in Chromium, Firefox, WebKit and in Arabic); English rects of every text-bearing element identical with the change on and off |
| closing 2 | One 404 console error in a smoke run of a production build, not traced (the verifier of section 13) | no change, cause found: exactly one failed request, during Home, `GET /wholphin/public`, the presence probe of the optional Wholphin server plugin (`src/features/home/model/homeSettings.ts`); the test server does not have the plugin. The TV app sends the same request on every user switch (spec 02); the web asks only when no source is chosen and neither the device nor the server profile has settings. A browser logs every 404 and the plugin's presence has no other signal; the e2e guard already allows it | fixer's run: a production build behind the Hono server, headless Edge, sign-in through the screens, Home, an item page, 2 s of video; the same single 404 on the development server |
| closing 3 | "ResizeObserver loop completed with undelivered notifications" three times in the dev server's log during resize runs, not compared with the tree before section 13 | cause found, not fixed (not in our code). Reproduced only on a scrolled grid resized in several steps (Movies library, 600x600, widths 580, 560, 540: Firefox 5 of 8 rounds on the dev server and 5 of 5 on the production build, headless Edge 5 of 5, Chromium 1 of 6, WebKit 0 of 6; never on a grid that is not scrolled, which is why the existing e2e test passes). The tree before section 13 has it too: with the resize watch of 13.1 switched off it came in 8 of 8 rounds. The observer is the virtualizer's own: `@tanstack/react-virtual` re-renders with `flushSync` when a measured row size comes with a scroll-offset correction, React commits inside the observer callback, the grid container's height changes again after its notification of this frame, and `CardGrid` watches that container for its width. No visible effect: one uniform gap and one cell width at the error and on the three frames after it, focus on the same card. The one trace is an "E" line in the app's own log (`src/features/settings/clientLog.ts` records window errors) | fixer's runs in three engines on the dev server and the production build; the frame that raised it traced, identical in Firefox, Chromium and Edge |
| closing 4 | Overlays outside the kit (`ViewOptionsPanel`, `ImageFilterDialog`, `PlayerSheet`) do not use the "openers gone" handling (13.7) | no change. `ViewOptionsPanel`: its opener is the toolbar's button, the same node after resizes to 900 and 390 px, by keyboard or mouse (6 of 6); the case cannot happen. `PlayerSheet` with the controls shown: focus returns to the Settings button, also after a resize and through a nested sheet. `ImageFilterDialog` (opening it closes the viewer's overlay) and a `PlayerSheet` opened while the controls are hidden close onto `<body>`, which is the idle state of those full-screen pages by design: the same focus as before the overlay was opened, and their keys act from there. The shell's handler must not be used for them: it would put focus on a control that Enter then presses, and it knows the shell's page element only | fixer's probes in Chromium and Firefox, identical results |
| touch 1 | A scroll with a finger that starts on a slider changes the slider (the owner, from a phone) | fixed. Reproduced with real one-finger gestures: a 220 px swipe up from "Interface scale" set it from 100 to 200 and from "Slideshow duration" from 5000 to 26000, the list did not scroll, no `pointercancel` came. Cause: `touch-action: none` and the value set, with pointer capture, on pointerdown. Now a finger or pen changes a slider only on a sideways drag past 10dp (absolute) or on a tap at release; up and down is the page's; a gesture the browser takes back restores the value | e2e (`settings`): real touch on the phone project, dispatched pointer events in Firefox, WebKit and the iPhone project; 23 unit tests; fixer's runs (vertical swipe: value unchanged, list scrolled 205, `pointercancel`; diagonal: unchanged, scrolled; sideways drag 30% to 70%: value follows, no scroll; tap at 50%; Hebrew: mirrored); the verifier's own script: vertical swipes on all six sliders of three settings pages and both sliders of Home settings, up and down, 40 to 300 px, 3 to 30 steps: `aria-valuenow` and the stored preferences unchanged every time, the list scrolled whenever it could |
| touch 2 | The same trap on the reorder handles of the Home rows editor (found by the fixer's sweep): a 120 px swipe from a handle swapped rows 0 and 1, the list did not scroll | fixed, completed by the lead (14.2): with a finger or pen the handle scrolls the list, and a rest picks the row up | e2e (`home-settings`), real touch; fixer's runs (swipe: order unchanged, list scrolled 105; rest then drag: rows swap, no scroll); the verifier's runs (rest 600 ms and release: nothing changes, no stuck look; mouse still picks up on press) |
| touch 3 | Every other `touch-action` rule and pointer or touch handler in `src` (the fixer's sweep) | no change, each with its reason. The sliders in Home settings, the library view options, the collection view options and the two photo dialogs are the shared component and are fixed with it. Left alone: the player's volume slider (opens on mouse hover only), the player's and the music page's seek bars (nothing scrolls around them; a scrub commits on release, a cancel commits nothing), the photo viewer's stage (pan, zoom and swipe are its gestures), the guide grid (it is the scroller), the mouse-only row drag, the long press (movement or any scroll cancels it) | reading; the verifier read four of the verdicts against the code and confirmed them |
| touch 4 | Do settings rows react when a scroll starts on them? | no change needed: a 150 px swipe started on three switch rows, a choice row, a click row and a slider row's title scrolled the list each time, activated nothing and left no hover, active or focused look behind | fixer's runs, phone viewport, Chromium, real touch |

### 14.2 What the lead changed before committing

The closing round's fix was committed as its agent left it and its checker read it. For the touch fix the lead
changed two things after the verifier's notes, both in the fixer's code, and then committed:

- **The handle's rest is 400 ms, not 250 ms.** With 250 ms, a finger that landed on a handle, crept 6 px over
  about 300 ms (inside the slop) and then swiped up picked the row up and moved it to the top, where a scroll
  was meant (the verifier, real touch). 400 ms stays under the app's 500 ms long press (`LONG_PRESS_MS`), at
  which Android would offer its own menu. The e2e test of the handle rests 650 ms.
- **A finger the gesture does not track moves nothing.** The last line of the slider's `onPointerMove` followed
  any pointer the element has captured. A real browser captures a touch by itself, so a second finger on the
  slider would have driven the value with no slop and no direction test (the verifier, by reading; in its
  two-finger runs Chromium started a pinch and cancelled both pointers first). That line now runs for the mouse
  only.

Read and left as the verifier described them, recorded in 14.7: a swipe that first goes sideways and then up,
and the brief value change in Chromium's emulated touch.

### 14.3 Deviations introduced

To carry into [DEVIATIONS.md](DEVIATIONS.md).

| TV | Web | Why | File |
|---|---|---|---|
| A Compose Text per value; what the TV draws in Hebrew was not checked (no emulator run) | In the player's sheets every row line takes its direction from its content (`<bdi>`); the subtitle delay value and its step buttons are left-to-right; a settings slider summary takes its direction from its content | A right-to-left line drew ".25" as "25.", "-1.5s" as "1.5s-", "+50ms" as "50ms+", "100 Mbps" as "Mbps 100" | `src/features/playback/ui/PlaybackDialogs.tsx`, `SubtitleDelayDialog.tsx`, `src/features/settings/SliderPreference.tsx` |
| Debug overlay mirrored with the interface | Laid out left to right in every language | English diagnostics read "mbps 3.93", ":Backend" | `src/features/playback/ui/DebugOverlay.tsx` |
| (no shortcut toasts) | The value in the delay and speed toasts is wrapped in a left-to-right isolate | "-250 ms" drew "ms 250-" | `src/features/playback/PlayerView.tsx`, `ui/text.ts` |
| `SliderBar` is D-pad only, no touch | A finger or pen on a slider scrolls the page; only a sideways drag past 10dp (absolute, the thumb under the finger) or a tap changes the value; a gesture the browser takes back restores the value. The mouse still sets on press | Sliders sit in scrolling lists, and a scroll that started on one changed the setting at once | `src/ui/inputs/Slider.tsx`, `Slider.module.css`, `src/ui/lib/touchIntent.ts` |
| No handle (up and down buttons only; the handle is already a web addition) | With a finger or pen the handle scrolls the list, and resting on it for 400 ms picks the row up; the mouse picks up on press | Reordering and scrolling are the same up-and-down movement | `src/features/home/settings/RowListPage.tsx`, `HomeSettings.module.css` |

If the TV also draws "25." in Hebrew, the first row is an upstream bug not copied; that needs an emulator run.
No upstream bug was involved in the touch rows.

### 14.4 Decisions

- **`<bdi>`, `dir="ltr"` or isolate characters.** `<bdi>` where a slot holds either a translated text or a
  value (sheet rows, slider summary); `dir="ltr"` where the content is always a value (the delay value and
  buttons, the debug overlay); the characters only for plain strings (toasts, `ltrValue()` in
  `src/features/playback/ui/text.ts`). These follow `LicensePage.tsx`, `RequestOptions.tsx` and
  `setupHelpers.ts`. `ltrValue` (U+2066) sits beside an older `isolate` (U+2068, `seerrText.ts`) and inline
  isolates in `src/i18n/index.ts` and `setupHelpers.ts`; one shared helper could serve them all and was not
  needed now (the checker's note).
- **The sheet's `Line` wraps every row**, so track titles from the server also take their direction from their
  content. No visible change in the test data.
- **The debug overlay and the toasts were not asked for**; the scan found them, and each is a one-line change.
- **The controller's time codes are left alone.** A Hebrew remaining time draws its minus to the right of the
  number; the stylesheet gives each time text the locale's direction on purpose (`Controller.module.css`,
  citing `PlaybackControls.kt:297-322`). Left to the owner (DECISIONS Q-35).
- **ResizeObserver: the candidate fix was tested and put back.** `useAnimationFrameWithResizeObserver: true`
  on `CardGrid`'s two virtualizers gave 0 errors in 32 Firefox rounds; it delays every row measurement by a
  frame in every grid and was not run through the suite. Untested alternatives: `useFlushSync: false`, or not
  logging this message.
- **Touch: the drag is absolute, not relative.** A relative drag cannot reach the far end when the finger
  starts beside the thumb; absolute matches the mouse, the tap and the browsers' own range input.
- **Slop 10dp**, one constant (`TOUCH_SLOP_DP`) used by the slider and the handle through `dp()`: at least
  Android's 8dp and about iOS's 10pt, so the browser has normally decided before the control reacts.
- **The direction is locked once decided**, and `pointercancel` after a drag began restores the starting value.
- **A pen is treated like touch.** `pan-y pinch-zoom`, not bare `pan-y`, so a two-finger zoom that starts on a
  slider still works.
- **The handle: rest to pick up.** The cost is discoverability: a finger that drags a handle at once now
  scrolls, and there is no hint for touch (the "Drag to reorder" title is a mouse tooltip; the up and down
  buttons remain). If the owner prefers immediate pick-up on the handle, this is the one change to revert.
- **By the lead: 400 ms and the second-finger guard** (14.2), and nothing weakened for the two notes of 14.7.

### 14.5 Tests added

Unit (the suite went from 84 files and 742 tests to 87 files and 776 tests):

- `src/features/playback/ui/rtlValues.test.tsx` (6): the speed list labels, the Settings sheet values, the
  bitrate list, the delay dialog's value and buttons, the slider summary, `ltrValue`. They assert the `<bdi>`
  and `dir="ltr"` markup, which is absent without the fix.
- `src/ui/lib/touchIntent.test.ts` (5): undecided inside the slop; sideways past it; up, down and slightly
  diagonal are scroll (the exact diagonal too); the slop is the caller's; touch and pen pan, the mouse does
  not.
- `src/ui/inputs/Slider.test.tsx` (23; the touch block runs for `touch` and for `pen`): a finger that lands
  changes nothing; moving up or down changes nothing, also when the browser never takes the gesture; a
  slightly diagonal scroll and a `pointercancel` change nothing; a sideways drag past the slop captures and the
  value follows; a drag the browser takes back restores the value; a tap sets the value on release; the slop
  grows with the interface scale; right to left mirrors the drag and the tap; a disabled slider ignores both;
  the mouse sets at once and captures; the keyboard steps and jumps. 16 of the 23 fail against the old slider;
  the 7 that pass are the mouse, keyboard, right-to-left and disabled cases.

e2e (5 tests, 11 runs across projects; the suite went from 239 to 250): see the coverage table of
`e2e/README.md`.

- `settings`, in the group "Hebrew interface": "a slider summary made of a number and a Latin unit reads left to
  right" (desktop, Firefox, WebKit); it also holds that a translated summary keeps the interface's direction.
- `playback-engines`, in the group "Hebrew interface": "values in the player sheets read left to right"
  (desktop, Firefox, WebKit): the speed list, the bitrate row, and a translated value still right to left. It
  plays for about a second without `@writes`: each engine pauses an item of its own that no other test plays
  and stops below 5% of the runtime. One test-local `guard.allow`: Firefox ends the download of a paused
  direct-play file itself.
- `settings`: "a finger that starts on a slider scrolls the settings list; only a sideways drag or a tap
  changes the slider" (phone, real touch).
- `settings`: "slider under touch pointer events: down, an up-and-down move and a cancel change nothing; a
  sideways drag and a tap do" (Firefox, WebKit, iPhone; dispatched events, and one allowed page error, because
  a dispatched pointer id cannot be captured).
- `home-settings`: "a finger that starts on a reorder handle scrolls the row list; resting on the handle picks
  the row up" (phone, real touch, one fixed rest because the pick-up is a timer).

Two fixture helpers in `e2e/fixtures/app.ts`: `app.drawnText(locator)` (an element's characters in drawn
order) and `app.touchDrag(from, to, { steps, holdMs })` (a real one-finger gesture through the DevTools
protocol, Chromium only). The two right-to-left tests fail in all three engines with the two `<bdi>` changes
switched off (6 of 6, for example `Expected "100Mbps", Received "Mbps100"`); the five touch runs fail on the
old source. None of the new tests is tagged `@writes`.

### 14.6 Gates (final tree)

- Closing round, the small-fix agent: `typecheck`, `e2e:typecheck`, `test` (85 files, 748 tests), `lint` (0
  errors, the same 23 warnings): pass. Its two e2e tests 6 of 6, three times in a row and once more on its
  final tree. The whole e2e suite was not run.
- Closing round, the checker: the same four gates, the same numbers; both new e2e tests in the desktop project
  (9 of 9 with the sign-in setup), not in Firefox or WebKit. It did not reproduce items 3 and 4 and ran no
  build, no Docker build and no full suite.
- Touch fix, the fixer: `typecheck`, `e2e:typecheck`, `test` (776 passed), `lint` (exit 0): pass. The
  `settings`, `home-settings`, `preferences` and `layout` specs in desktop, phone and keyboard: 25 passed. The
  five new runs with `--repeat-each=3`: all passed.
- Touch fix, the verifier: the four gates pass (`test`: 87 files, 776 tests). The `settings`, `home-settings`
  and `layout` specs in desktop, keyboard, phone, firefox, webkit and iphone: 32 passed, 7 of them sign-in
  setup.
- The lead, on `7ad52ba`: `typecheck` and `e2e:typecheck` pass; `lint` 0 errors; `test` 87 files, 776 tests;
  `build` passes; `npm run e2e`, alone: 250 of 250 in 4.4 minutes. Pushed (`c358a52..7ad52ba`). The CI
  workflow on GitHub succeeded on `c358a52` and on `7ad52ba`.
- The image `wholphin-web:latest` built from `7ad52ba` (258 MB), tried behind a reverse proxy, headless
  Edge: the page 200 with a valid certificate, `/config.json` with the preset server
  and the Seerr proxy path, a missing asset 404, the Seerr proxy 200, sign-in with the limited test account,
  Home, an item page, 0 Content-Security-Policy violations; the only failed request is the plugin
  probe of 14.1. No video was played (a real server).
- No crawl and no TV compare run was made in this section. The reference pictures of the TV compare were lost
  the same day (PROJECT-LOG phase 30), so a compare run is not possible until they are captured again.
- Every browser was headless and muted, one at a time; for a few minutes the small-fix agent ran the dev
  server and the production server side by side for the comparison of closing 2. On the throwaway server:
  sign-ins of the test user and playback of seconds, each stopped; no Live TV timer, no `@writes` tests. The
  real Jellyfin was not used by the agents; the dev server asks the real Seerr for its public settings by
  itself, as in every e2e run. The small-fix agent's probes left their device ids in the test server's device
  list; their tokens were signed out.

### 14.7 Not verified, still open

Open:

- **A swipe that first goes 10dp or more sideways and then up is the slider's**, and the thumb jumps to the
  finger: "Interface scale" went from 100 to 140, "Slideshow duration" from 5000 to 20750, the list did not
  scroll and no `pointercancel` came, because Chrome drops the whole pan for a gesture that starts sideways
  under `pan-y`. The expected result of the direction lock and the absolute drag; recorded, not changed.
- **A brief value change in Chromium's emulated touch.** 12 to 14 px sideways (past the 10dp slop, before
  Chromium decides to pan), then up: Chromium sends `pointercancel` and the slider restores the value; the
  final and the stored value are unchanged and the list scrolled. On "Interface scale" the page is laid out
  anew for a moment. Probably emulation only (a real Android Chrome decides at about 8dp); not verified on
  hardware. The restore writes the value back through `onChange`, which turns an empty stored preferences
  entry into an empty object; harmless.
- **Touch observations of the sweep, not changed:** a dialog's and a player sheet's backdrop dismisses at
  pointerdown, so a finger that lands beside the panel closes it; on Home a touch that lands on a card makes
  it the highlighted one, so a scroll that starts on a card switches header and backdrop; the long press's
  10px tolerance is a bare number, not through `dp()`; a deliberate drag on "Interface scale" lays the page
  out anew under the finger as the value changes (the same with the mouse).
- **The ResizeObserver message** (closing 3) stays, with its cause.
- **The player's time codes in Hebrew** (14.4), for the owner.
- **`playback-engines` and the test server's played marks.** After a WebKit run of the existing engines test
  its clip was marked played although the fixture restores it; set back by hand. The likely cause, not proven:
  the restore runs before the server has handled the Stopped report. `npm run e2e:flaky` would run three
  copies of the new player test at once on one item, the same caveat the e2e README states for the engines
  test. Also seen and left: the seeded item "Multi Track Showcase" was marked played at the agent's first
  listing, which came after two of its probe runs; the seed gives it a resume point, and the crawler plays it
  without restoring. Whether it was played before the probes is not known.
- **The owner's order of work** after the first test: the desktop browser version first, phone and touch
  problems after it; whether the desktop version includes the features that are not built is asked and not
  answered (DECISIONS O-28, Q-43).

Not verified:

- Real phone hardware (Android Chrome, iOS Safari, Firefox for Android) and pen hardware (unit tests only).
  The one manual phone test met the defect, not yet the fix.
- A real moving touch in WebKit and Firefox; there only the handlers and the computed `touch-action` were
  tested.
- The handle's pick-up on iOS, which relies on `touchmove.preventDefault()` after the rest; and the Android
  long-press `contextmenu` while a row is held, suppressed in code and never triggered in a test.
- The second-finger guard of 14.2: by reading only; no test sends a second finger.
- A sideways drag that drifts 30 to 80 px up or down ended at a fraction of 0.897 to 0.931 for a finger at
  0.9. The verifier marked the 0.931 as worth a look; it was not followed.
- The sliders in the collection view options and the two photo dialogs under touch (the library view options
  dialog was driven by the fixer: "Columns" unchanged, list scrolled).
- What the TV shows for these values in Hebrew. Arabic by picture (only the value scan and the settings
  scan), and the phone layout of the sheets in Hebrew. In WebKit: the delay dialog, the toasts and the debug
  overlay (WebKit did not play the multi-track file in the probe; its e2e test passes with an mp4 item).
- Closing 2 in headless Edge only, with the Seerr proxy disabled. Closing 3 with a window dragged by hand,
  with touch, and which target was skipped in a second resize sequence (900 to 800 to 700). Closing 4 with
  touch.
- The Kotlin line numbers cited in this section and in the documents written that day: the main
  checkout's `reference/` folder was empty at the time (PROJECT-LOG phase 30), so they come from the specs and
  from sections 13.x, not from a fresh reading.
- Video playback in the image of `7ad52ba`; the old code side by side for the mouse path (compared by
  reading: for a mouse the new handlers run the same lines as before).
- Everything listed as open in sections 9.6, 11.4, 12.7 and 13.7 that this section did not touch.
