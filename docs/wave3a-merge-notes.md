# Merging `wave3a` into `main`: hand-over

This is the definitive note for merging branch `wave3a` into `main`. The earlier versions of this file (the wave 3a
hand-off and the first wave 4 merge note) are in git history (`2fe5593` and before); everything still relevant is
repeated here.

## 1. What the branch contains

| Commit | Content |
|---|---|
| `318ad04` | Wave 3a: playback engine and player, settings screens, Seerr / Discover, production server and Docker image |
| `fc2b12e` | Merge of `main` at `c2dc99c` (app shell, setup, Home, shared item layer, crawler) |
| `f71d292`, `3a01bf4`, `1b090ed`, `580010b` | Wire-up with main's shell, licensing (vendored `rvfc-polyfill`, `gen:licenses`), lazy JASSUB, crawler scenes |
| `0c6ab3b` | Wave 4: Live TV, music, photos and the in-app screensaver, with the review fixes |
| `7e3e0c6` | Gate fixes: page height under the music bar; a dev server started in a worktree sees edits |

Merge base with `main`: `c2dc99c`. Since then `main` gained wave 3b (`350cf87`: library browsing, detail and series
pages, search, Home customization, polish fixes across the shell, setup, Home, common and `src/ui`) and the e2e
suite (`ebcd26c`, `68e6f5f`).

Feature folders owned by this branch (merge them as they are): `src/features/{playback,settings,discover,livetv,
music,photos}`, `src/api/seerr`, `src/stores`, `server/`.

**Two add/add conflicts inside those folders.** `main` also added `src/stores/playbackChoices.ts` and
`src/features/playback/engine/streamChoice.ts`. This branch's versions are the ones the player, the settings
"clear track choices" handler and `src/app/startup.ts` use (API: `saveTrackSelection`, `deleteChosenStreams`,
`getItemPlayback`; `streamChoice.ts` ports `StreamChoiceService.kt`). Keep one module of each: take this branch's
and move any function main's detail pages call that is missing here into it, keeping its tests
(`src/stores/playbackChoices.test.ts`, `src/features/playback/engine/streamChoice.test.ts`).

## 2. Files outside the owned folders that this branch changed (relative to `c2dc99c`)

"Main too" = `main` changed the same file since `c2dc99c`, so expect a textual conflict.

### Shell and app (`src/app`)

| File | Main too | What this branch changed and why | How to merge |
|---|---|---|---|
| `src/app/AppShell.tsx` | yes | `data-focus-enter="up"` on the rail-mode `backSlot` div. TV: Left from the page's start edge enters the drawer; without this, Left landed on the web-only floating Back first | Re-apply the one attribute on main's Back slot |
| `src/app/spatialNav.ts`, `spatialNav.test.ts` | yes | New markup attribute `data-focus-enter="<directions>"`: arrow keys may move into that subtree only in the listed directions; movement inside is free; Tab and click are unaffected. `canEnter()` plus a direction argument to `candidatesIn()`; documented in the file header; one test | Re-apply `canEnter` and the filter in `candidatesIn` on main's version; keep the test |
| `src/app/shell/AppShell.module.css` | no | `body[data-music-bar] .shell/.content { min-height: calc(100dvh - 72px) }` (delimited `wave4:music`). The mini player pads the body by 72dp; without this every short page scrolled by 72dp while music played | Keep the block |
| `src/app/shell/useFocusRestore.ts` | no | Focus inside `[data-no-focus-restore]` is not saved per history entry (the photo viewer starts with no focus; after a reload it focused the hidden "Next" arrow) | Keep (2 lines + header comment) |
| `src/app/layouts.tsx` | no | `DiscoverDrawerFlag` (Discover drawer entry = Seerr status `linked`) and `<MusicHost />` (delimited `wave4:music`) inside `RequireSession` | Keep both |
| `src/app/providers.tsx` | no | `<AppScreensaver />` after `{children}` inside `QueryClientProvider` (delimited `wave4:photos`): the in-app screensaver and dim layer, upstream `MainContent.kt:137-160` | Keep |
| `src/app/startup.ts` | no | Default app-wide `clearTrackChoices` handler (`deleteChosenStreams`) for the item menu. Detail pages may install their own through `setItemMenuHandlers`; theirs win | Keep |
| `src/app/nav.ts` | yes | `nav.slideshow(parentId, { index, id, start, recursive, filter, sort, order })`: `id` = photo to open on, `sort`/`order` = the grid's sort | Take main's file and replace `slideshow` with this signature |
| `src/app/routes.tsx` | yes | Doc table only: `/slideshow/:parentId [?index&id&start&recursive&sort&order&filter]`. No route added or removed | Take main's, fix that one comment row |

### Stub pages that now dispatch (see section 3)

| File | Main too | Change |
|---|---|---|
| `src/features/browse/CollectionFolderPage.tsx` | yes (real page now) | `wave4:music`, `wave4:photos`, `wave4:livetv` dispatch blocks |
| `src/features/browse/FilteredCollectionPage.tsx` | yes (real page now) | `wave4:music` block (music genre) |
| `src/features/detail/MediaItemPage.tsx` | yes (real page now) | `wave4:music`, `wave4:photos` blocks |

Take main's real pages and port the blocks as described in section 3. Do not keep the stub bodies.

### UI kit (`src/ui`)

| File | Main too | Change | How to merge |
|---|---|---|---|
| `src/ui/icons/MaterialIcon.tsx` | yes | Player icons `fullscreen`, `fullscreen_exit`, `picture_in_picture_alt`, `volume_up/down/off`, `expand_less`, `keyboard` | Keep both sides' icons |
| `src/ui/overlays/DialogPopup.tsx` | yes | Optional prop `initialFocusIndex` (choice dialogs focus the current value, as upstream) | Keep main's changes plus the prop; used by settings and the player |
| `src/ui/cards/PersonCard.tsx` | no | `minHeight: 0` on the circle surface (it overflowed its grid cell in Discover cast rows) | Keep |

### Strings, tools, build, deploy

| File | Main too | Change |
|---|---|---|
| `src/i18n/extra/en.json` | yes | New `web_` keys (section 5). `web_move_up` / `web_move_down` exist on both sides with the same text: keep one copy. Then `npm run gen:strings` |
| `package.json`, `package-lock.json` | yes | Section 6 |
| `.gitignore` | yes | `+dist-server` (output of `npm run serve:build`). Keep both sides' lines |
| `vite.config.ts` | no | Dev-only plugin `spaRoutesOverRootFiles` (`/license` served the LICENSE file on a case-insensitive disk); Vitest `include` adds `server/**/*.test.ts`; `server.watch.ignored` ignores only `<this checkout>/.worktrees/**` instead of `**/.worktrees/**` (a dev server started inside a worktree never saw edits); `optimizeDeps.entries: ['index.html']` (the dependency scan picked up HTML under `shots/out/` and `reference/` and logged "Failed to scan") |
| `tools/gen-preferences.ts`, `tools/gen-preferences.test.ts` | no | HDR subtitle style copies (`hdrSub*` keys, `SUBTITLE_HDR_KEYS`, `SubtitleStyleKey`); `SubSeparateHdr` / `SubHdrSettings` reclassified as web-adapted |
| `tools/gen-licenses.ts` | no (new) | Writes `src/features/settings/licenses.gen.json` and `upstream.gen.json`; part of `npm run gen` |
| `tools/shots/scenes.ts`, `tools/shots/refmap.ts` | yes | New scenes: player overlay and sheets, settings dialogs, Discover (`servers: ['real']`, Seerr writes answered locally), Live TV (`livetv-*`, Timer/Recording writes mocked), music (`library-music-*`, `item-album*`, `music-*`, Now Playing), photos (`photos-*`, `item-photo*`). Refmap pairs for the player sheets and photos (`wave4:photos` block). Keep both sides' scenes; main's detail/browse scenes replace this branch's stub expectations |
| `src/api/playback/urls.ts` | no (new) | Playback URL builders (`withApiKey`, stream, subtitle and trickplay URLs) |
| `vendor/rvfc-polyfill/*` | no (new) | GPL-2.0-only stand-in for jassub's GPL-3.0 `rvfc-polyfill` |
| `Dockerfile`, `.dockerignore`, `docker-compose.example.yml`, `docs/deploy.md` | no (new) | Production image (Vite build + bundled Hono server, non-root, healthcheck). The Dockerfile copies `tools/quiet-playwright.mjs` and `vendor/` before `npm ci` |
| `docs/wave3a-merge-notes.md` | no (new) | This file |

Generated files: `src/stores/preferences.gen.ts`, `src/features/settings/licenses.gen.json`,
`src/i18n/locales/*`: never hand-merge; run `npm run gen` after resolving the sources.

## 3. `wave4:` dispatch blocks to port into the real pages

Each block in the stubs is delimited `// wave4:<track> begin … end`. In the real pages, dispatch **before** the
generic page renders, and call every hook unconditionally (hooks first, early returns after). Where the real page
has already loaded the `BaseItemDto`, prefer the pure helpers (no second request).

### 3.1 Library page `/library/:itemId` (`src/features/browse/CollectionFolderPage.tsx`)

Upstream: `DestinationContent.kt:481` (Live TV), `:489` (music), `:496-504` (photos / home videos),
`NavDrawerService.kt:200-215` (recording folders).

| Item | Mount | Notes |
|---|---|---|
| Library with `CollectionType === 'livetv'` | `<LiveTvView key={id} libraryId={id} />` from `src/features/livetv/LiveTvView` | The `/livetv` route already renders it (`LiveTvPage`) |
| Recording folder (drawer library entry with `isRecordingFolder`) | `<RecordingsView key={id} folderId={id} />` from `src/features/livetv/RecordingsView` | `/recordings/:id` already renders it (`RecordingsPage`) |
| Library with `CollectionType === 'music'` | `<MusicLibraryPage key={id} library={item} />` from `src/features/music/MusicLibraryPage` (`item` = the library's `BaseItemDto`) | Or `musicPageFor(item)` from `src/features/music/useMusicRoute`. Keep `MusicLibraryPage` as is: it carries the tab-hide wrapper and the Back-height rule |
| Library with `CollectionType` `photos` or `homevideos` and `Type !== 'Folder'` | `<PhotoLibraryPage itemId={id} />` from `src/features/photos/PhotoLibraryPage` | |
| `Type === 'PhotoAlbum'` | `<PhotoAlbumPage itemId={id} />` from `src/features/photos/PhotoAlbumPage` | |

Hook form, as in the stub (returns `undefined` while loading, `null` when not this kind):

```tsx
const music = useMusicRoute(itemId, 'library', searchParams)   // ReactElement | null (loading page while pending)
const liveTv = useLiveTvRoute(itemId)                          // ReactNode | null | undefined
const photo = usePhotoRoute(itemId, 'library')                 // ReactNode | null | undefined
if (photo === undefined) return <LoadingPage />
if (photo) return photo
if (liveTv === undefined) return <LoadingPage />
if (liveTv) return liveTv
if (music) return music
```

`useLiveTvRoute` reads `useLibraries()` / `findLibrary()` from `src/features/common/libraries`;
`usePhotoRoute` fetches the item under `qk('photos', 'folder', id)` (shared with `PhotoFolderView`).

### 3.2 Filtered collection `/library/:itemId/filtered` (`FilteredCollectionPage.tsx`)

A music library's genre tile (`?type=Genre&collectionType=music&filter=<genreId>`, `BaseItem.kt:380-407`):
`<MusicGenrePage key={genreId} libraryId={itemId} genreId={genreId} />` from `src/features/music/MusicGenrePage`.
Hook form: `const music = useMusicRoute(itemId, 'filtered', searchParams); if (music) return music`.

### 3.3 Item page `/item/:itemId` (`src/features/detail/MediaItemPage.tsx`)

Upstream: `DestinationContent.kt:192, 246-252, 256-275`.

| Item | Mount |
|---|---|
| `MusicAlbum` | `<AlbumPage key={id} itemId={id} initialSongId={searchParams.get('song')} />` (`src/features/music/AlbumPage`) |
| `MusicArtist` | `<ArtistPage key={id} itemId={id} />` |
| `Audio` with `AlbumId` | `<AlbumPage key={AlbumId} itemId={AlbumId} initialSongId={id} />`; without: `<SongPage key={id} itemId={id} />` |
| `Playlist` with `MediaType === 'Audio'` | `<MusicPlaylistPage key={id} itemId={id} />` |
| `PhotoAlbum` | `<PhotoAlbumPage itemId={id} />` |
| `Photo` (web: upstream has no page) | `<Navigate replace to={nav.slideshow(item.ParentId, { id: item.Id })} />` |

`musicPageFor(item, { songId })` returns exactly the music rows above (or `null`). Hook form as in the stub:
`useMusicRoute(itemId, 'item', searchParams)` and `usePhotoRoute(itemId, 'item')`.

### 3.4 Other entry points that need no block

`/livetv`, `/recordings/:id`, `/now-playing`, `/slideshow/:parentId` are real pages in this branch. Cards built by
main's shared item layer navigate with `nav.item()` / `nav.library()` / `nav.play()` (`itemDestination()` in
`src/app/nav.ts`: a song goes to its album with `?song=`, a TV program plays its channel), so search results, Home
rows and grids reach the music and photo pages through the dispatch above.

## 4. Other hook-ups still open

1. **Recording-folder toolbar.** Upstream draws recording-folder tabs and the Recordings page with the shared
   `CollectionFolderView` (sort chip, Filter, View options, dice, letter column, counter; reference shot
   `34-live-tv-recordings.png`). This branch has a simple `src/features/livetv/RecordingFolderGrid.tsx`. When main's
   browse view merges, replace it: in `LiveTvView` folder tabs `recursive=false`, `VideoSortOptions`, `ViewOptions()`,
   `playEnabled=false`, `showTitle=false`, tab row hidden past the first grid row; in `RecordingsView`
   `MovieSortOptions`, `ViewOptionsPoster`, `playEnabled=false`.
2. **PhotoFolderView vs the generic grid.** If browse's generic grid replaces `PhotoFolderView`, keep: the Play key on
   a `PhotoAlbum` card passes the grid's filter, sort and order to `nav.slideshow` (index 0, upstream-bug fix kept);
   Escape's jump to the first card also scrolls the page to the top.
3. **Detail pages and playback.** Play / Resume / Restart / Shuffle / trailers navigate with `nav.play(id, { t, transcode })`
   (`t` in ms) and `nav.playList(id, { shuffle, index, sort, order, filter, recursive })`. Track choices go through
   `src/stores/playbackChoices.ts` (section 1). Local trailers play with `nav.play(trailerId)`.
4. **Back button.** Pages inside `FullScreenLayout` must not draw their own Back unless they call
   `useHideBackButton()`. Pages inside `AppShell` reserve `var(--shell-back-reserve)` / `var(--shell-clock-reserve)` in
   their top row. On a page whose top row is level with the floating Back, arrow keys cannot reach Back (Left goes
   to the drawer, by design); Escape and Tab do. If you want Up from the top row to reach it, the alternative is
   `data-focus-enter="up right"`.
5. **Mini player focus.** The AppShell page area is a focus trap, so `MiniPlayer.tsx` has its own window key handler
   (registered after `initSpatialNav`; keep `initSpatialNav` first in `src/app/startup.ts`): ArrowDown that finds
   nothing below enters the bar, Up returns. A shell-level "zone below the page" in `spatialNav` would be cleaner.
6. **`Button` drops `data-*` props.** `src/ui/buttons/Button.tsx` forwards only `data-touch-label`, so e.g.
   `data-focus-default` on a `Button` never reaches the DOM (music now uses a ref instead). Fix in the UI kit:
   forward `data-*` attributes.
7. **Dialog without dim.** Upstream `MusicViewOptionsDialog` and `LiveTvViewOptionsDialog` use `setDimAmount(0)`; the
   shared `Dialog` (`src/ui/overlays`) always draws the 0.6 scrim. Add an opt-out prop and use it there.
8. **Tokens.** Add fixed colours to `docs/spec/design-tokens.json` and `npm run gen`: `gray` `#888888` (then point
   `--rec` in `src/features/livetv/RecordingMarker.module.css` at it), `white` `#FFFFFF` (music and video seek-bar
   thumbs, discover `SeasonBadge`, `DpadSeekOverlay` write `#fff`), optionally an opaque `black` (photos use
   `var(--c-scrim)`, `#000000` in every theme).
9. **Shared helpers.** `useHeaderOnFirstRow` and `Collapse.module.css` live in `src/features/discover`; music imports
   them, Live TV has a copy. Move them to `src/features/common` or `src/ui`. Music's view options dialog imports
   `SwitchPreference` from `src/features/settings`.
10. **Client log.** `installClientLog()` runs lazily (Debug page, "Send app logs" row). Call it once in `src/main.tsx`
    to capture the whole session (idempotent).
11. **Deployment CSP.** `server/security.ts` allows `'self'`, the Jellyfin origin (`JELLYFIN_URL`),
    `CSP_EXTRA_ORIGINS` and `image.tmdb.org`. If main's pages load anything from another origin (fonts, trailers,
    avatars), add it there and re-run the container check (`shots/out/wave4/gate/docker.mjs`, git-ignored).

## 5. New `web_` string keys (all of this branch, `src/i18n/extra/en.json`)

- General: `web_error_fetching_views`, `web_submit`, `web_cancel`, `web_delete`, `web_close`
- Seerr: `web_seerr_unavailable`, `_unreachable`, `_not_linked`, `_expired`, `_sign_in`, `_sign_in_again`,
  `_session_expired`, `_checking`, `_server`, `_username_line`, `_api_key_note`, `_error_occurred`, `_profiles_error`,
  `_no_jellyfin_id`, `_unknown_jellyfin_id`, `_invalid_credentials`, `_could_not_connect`, `_could_not_remove`,
  `_unknown_type`, `_discover_title`, `_season_status`, `_sort_label`, `_youtube`, `_available`,
  `_partially_available`, `_scroll_previous`, `_scroll_next` (all prefixed `web_seerr`)
- Settings: `web_license`, `web_based_on`, `web_about_description`, `web_upstream_version`, `web_upstream_project`,
  `web_upstream_releases`, `web_server`, `web_server_address`, `web_this_device`, `web_change_pin`, `web_new_pin`,
  `web_pin_confirm_hint`, `web_move_up`, `web_move_down` (also on main, same text), `web_subtitle_sample_1..3`,
  `web_subtitle_sample_margin`, `web_subtitle_sample_image`, `web_gpl_notice`, `web_upstream_attribution`,
  `web_third_party`, `web_license_text_missing`, `web_debug_title`, `web_copy_debug_info`, `web_copied`,
  `web_copy_failed`, `web_client_log`, `web_clear_cache`, `web_cache_cleared`, `web_reset_preferences`,
  `web_reset_preferences_body`, `web_preferences_reset`, `web_switch_user`, `web_background_style`
- Playback: `web_playback_unsupported_type`, `_no_media_sources`, `_playlist_empty`, `_error_load`, `_error_server`,
  `_error_no_sources`, `_error_no_url`, `_error_no_method`, `_error_failed`, `_error_browser`, `_click_to_play`,
  `_seek`, `_live`, `_previous`, `_next`, `_pause`, `_pip`, `_fullscreen`, `_exit_fullscreen`, `_mute`, `_unmute`,
  `_volume`, `_back_to_controls`, `_auto_skipped`, `_no_longer_playable` (prefixed `web_playback`);
  `web_shortcut_title`, `_play_pause`, `_arrows`, `_seek`, `_show_controls`, `_percent`, `_next_previous`,
  `_captions`, `_audio`, `_subtitle_delay`, `_speed`, `_skip_segment`, `_mute`, `_fullscreen`, `_pip`, `_debug`,
  `_back`, `_help` (prefixed `web_shortcut`)
- Photos and screensaver: `web_photos_position`, `web_photos_error_loading_image`,
  `web_photos_error_loading_image_detail`, `web_photos_saved`, `web_photos_pause`, `web_photos_seconds`,
  `web_photos_viewer`, `web_screensaver_error`, `web_screensaver_label`
- Live TV: `web_livetv_no_channels`, `web_livetv_no_guide_data`, `web_livetv_no_channel_id`,
  `web_livetv_invalid_tab`, `web_livetv_jump_to_now`
- Music: `web_music_error`, `web_music_disc`, `web_music_no_items`, `web_music_stop`, `web_music_repeat_off`,
  `web_music_repeat_one`, `web_music_repeat_all`, `web_music_visualizer_unavailable`, `web_music_jump_letter`

Possible duplicates to tidy later: main's `web_previous` / `web_next` vs `web_playback_previous` / `web_playback_next`.

## 6. Dependencies and scripts

- New dependency `"rvfc-polyfill": "file:vendor/rvfc-polyfill"` plus `"overrides": { "rvfc-polyfill": "$rvfc-polyfill" }`:
  replaces jassub's GPL-3.0 `rvfc-polyfill` with a GPL-2.0-only implementation written from the WICG spec. It only
  installs `requestVideoFrameCallback` / `cancelVideoFrameCallback` where the browser lacks them.
- New scripts: `gen:licenses` (and `gen` now runs it), `start`, `serve:build`, `docker:build`, `docker:run`.
- No other dependency added or upgraded. Take the union of both `package.json` files and run `npm install`; then
  `npm ls rvfc-polyfill` must show `-> .\vendor\rvfc-polyfill`. If npm writes a lock entry
  `node_modules/jassub/vendor/rvfc-polyfill` (npm bug with relative `file:` overrides), delete the `rvfc` entries from
  the lock and install again. Do `npm ci` from a clean checkout once afterwards (not done on this branch).

### Licenses to review (as the packages declare them; not a legal opinion)

| Package | License | Note |
|---|---|---|
| `hls.js` 1.7.4 | Apache-2.0 | The FSF lists Apache-2.0 as incompatible with GPLv2 |
| `abslink` 1.3.1 (jassub dependency) | Apache-2.0 | Same |
| Material Design Icons (bundled SVG paths) | Apache-2.0 | Same |
| `@jellyfin/sdk` 1.0.2 | MPL-2.0 | No "Incompatible With Secondary Licenses" notice found |
| `jassub` 2.5.38 | LGPL-2.1-or-later AND (FTL OR GPL-2.0-or-later) AND MIT AND others | |
| Roboto, Font Awesome Free | OFL-1.1 | Fonts |

No GPL-3.0 or AGPL package remains in `node_modules` or `dist/`.

## 7. State at hand-over (this branch, `7e3e0c6`)

- Gates: `npm run gen`, `typecheck`, `test` (40 files, 448 tests), `lint` (0 errors, 26 warnings) and `build` pass.
- Crawler `wave4-test` (test server, PURPLE, desktop-1920x1080 + phone-390x844): 254 pictures, 200 ok, 54 warnings,
  0 errors. The warnings are main's route stubs in this tree (library tabs and genre/studio filters, item pages,
  series overview, search, favorites, grid, Home settings), the expected `item-photo` redirect to the viewer, and the
  `play-movie` settle timeout (the video keeps streaming). Discover on the real server (`wave4-test-discover`): 22 ok,
  no Seerr write reached Seerr.
- Browser smoke (headless Edge, test server, 1920x1080 and 390x844): Home → context menu Play → player → Back;
  Settings; music (album Play, mini player progress, Now Playing); Live TV (guide with programs, a channel played
  about 6 s, no Timer/Recording write sent); photos (album → viewer → overlay → slideshow advances); screensaver
  starts from settings and dismisses on a key or tap. No page errors.
- Docker image: built; the container served the app under the security headers (CSP narrowed to the Jellyfin origin,
  `nosniff`, `no-referrer`, Permissions-Policy, COOP), `/healthz` 200, sign-in through the setup screens, and one
  H.264 item direct-played under the CSP with zero CSP violations and a Stopped report on exit.

## 8. Known gaps

- Upstream parity items listed in section 4 (recording-folder toolbar, dialogs without dim, missing tokens).
- Not verified: the transcoded-seek progress report in music (code reading only); a real slideshow clip with sound
  pausing music (synthetic event only); RTL arrow keys in the mini player; laptop and tablet viewports for the wave 4
  scenes; the full 8-theme crawl; `npm ci` from a clean checkout; the Sign out row (it would revoke the shared test
  account's token); hardware HEVC direct play (not testable headless).
- The Live TV player requested channel images without tags before; fixed (`hasPrimaryArtwork`), but channels without
  logos still show no artwork in the Media Session.
- The Discover entry in the drawer: a Discover title opened directly by URL highlights Home (main's stack rule).
- Lint warnings (not errors): `set-state-in-effect` / `exhaustive-deps` in `PlayerView.tsx`, `PlayerSheet.tsx`,
  `MusicGrid.tsx`, `useFillViewport.ts`, `MarqueeText.tsx`; TanStack Virtual "incompatible library"; unused
  variables in `tools/refshots` and `tools/testserver`.
- The player chunk is about 724 kB minified (hls.js + engine); JASSUB is already split out.
- After merging, run every gate again, the crawler (`npm run shots:quick`), the e2e suite from main, and the
  container check, since the stub dispatch blocks will then live in main's real pages.
