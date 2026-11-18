# 08 - Coverage gaps (upstream behaviour missing or wrong in specs 01-07)

`W/` = `reference/wholphin/app/src/main/java/com/github/damontecres/wholphin/`. Every item below was found by a sweep that compared the upstream Kotlin against the specs, then deduplicated. Every **high** item and about a third of the rest were re-checked against the source and the current spec text on 2026-11-17. Where a spec contradicts the source, **the source wins**, and the spec should be corrected.

Tags: **port** = implement as described. **adapt** = keep the intent but map it to web primitives. **android-only** = no direct web equivalent; listed only so a builder can decide deliberately.

## Summary

| Area (spec) | High | Medium | Low | Total |
|---|---|---|---|---|
| Shell / home (01, 02) | 0 | 4 | 9 | 13 |
| Browse / detail / search (03) | 0 | 9 | 21 | 30 |
| Live TV (04 A) | 0 | 0 | 2 | 2 |
| Music (04 B) | 1 | 1 | 8 | 10 |
| Photos (04 C) | 0 | 0 | 3 | 3 |
| Seerr / Discover (04 D) | 2 | 5 | 11 | 18 |
| Playback (05) | 1 | 4 | 8 | 13 |
| Settings / data / setup (06, 07) | 0 | 1 | 12 | 13 |
| Cross-cutting | 0 | 0 | 2 | 2 |
| **Total** | **4** | **24** | **76** | **104** |

Sweep coverage: 10 sweeps ran and none failed. They covered `ui/components` (two halves), `ui/detail` core, live TV/music/photos, Seerr, playback, `services`, `data` and `preferences`, shell/cards/search/setup, and preferences UI/theme/util. No Kotlin source area was left unswept. Resources (`res/`) and unit tests were consulted only where an item cites them; they were not swept on their own.

Deduplication: 110 candidates came in. Five duplicates were merged: the HdrFormat mapping, the range-type exclusion rules, the voice state machine, the ArtistSource reload, and the Seerr URL migration. One candidate was dropped: the MPV device profile, because spec 06 already marks every MPV setting android-only and the web port has no MPV backend. Two candidate claims were corrected during verification. The discover rating separator is `"  •  "` (bullet), not `" · "`. The album-page `onClickPlay` is at `AlbumDetailsPage.kt:342`, not :217.

---

## 1. Shell / home (01, 02)

### Medium
- **SH-1 Deep-link parsing rules** (adapt; 02 sec 1.5). *Source:* `W/services/IntentService.kt:28-170`, `MainActivity.kt:490-538`.
  - **Action:** the intent action, else the URI host (`search` / `view` / `play`).
  - **Parameters:** `query`, `itemId`, `position`, `shuffle`, `serverId` and `userId` may come from an extra or from the URI query. UUIDs are accepted with or without hyphens. A user switch is attempted only when both `serverId` and `userId` parse.
  - **Defaults:** `position` is coerced to >= 0 and defaults to 0. `shuffle` defaults to false. Search with no query opens `Search("")`. View with no itemId opens Home.
  - **Error toasts:** "Invalid parameters", "Could not fetch item <id>", "Cannot start playback with no itemId", "Invalid action: <a>", "Error restoring user", "Could not auto sign-in, specify a server & user", "Could not auto sign-in, user is protected", "Auto sign-in not enabled".
  - **Navigation after an error:** go to UserList(current server) if there is a current user, else ServerList. A target with no current user also goes to ServerList, with the toast "An error occurred parsing the intent".
  - **Web:** apply the same rules to URL routes and query parameters.
- **SH-2 "Load from web client" mapping** (port; 02 sec 5.4 / line 752). *Source:* `W/services/HomeSettingsService.kt:263-444`.
  - Process `homesection0..9` (lowercased) in index order, with a running row id.
  - `activerecordings` -> Recordings.
  - `resume` -> ContinueWatching. `nextup` -> a separate NextUp row. The import never emits ContinueWatchingCombined.
  - `livetv` -> TvPrograms, only if `policy.enableLiveTvAccess`.
  - `latestmedia` -> one RecentlyAdded row per library, titled "Recently added in {name}", using `viewOptionsForCollectionType`. The libraries are all supported user libraries (not filtered by nav pins), minus `Configuration.LatestItemsExcludes`.
  - `resumeaudio`, `resumebook`, `smalllibrarytitles`, `librarybuttons` and `none` are ignored.
  - Empty CustomPrefs returns null, and the default home is used.
- **SH-3 `HomeRowPresets.getByItemType` table** (port; 02 sec 5.2). *Source:* `W/ui/main/settings/HomeRowPresets.kt:44-95`.
  - MOVIE, BOX_SET, PERSON -> movieLibrary.
  - SERIES, SEASON -> tvLibrary.
  - EPISODE -> continueWatching.
  - VIDEO, MUSIC_VIDEO, PHOTO, PHOTO_ALBUM -> **videoLibrary** (not photo).
  - PLAYLIST -> playlist.
  - MUSIC_ARTIST, MUSIC_ALBUM, AUDIO -> musicLibrary.
  - TV_CHANNEL, LIVE_TV_CHANNEL, PROGRAM, TV_PROGRAM, LIVE_TV_PROGRAM -> liveTv.
  - GENRE, MUSIC_GENRE, STUDIO -> `genreDefault` with `heightDp = genreSize`.
  - Anything else -> movieLibrary.
  - `getByCollectionType` returns plain `HomeRowViewOptions()` for PLAYLISTS, BOOKS, FOLDERS and UNKNOWN. In `applyPreset` the collection type comes from the loaded libraries, else `GET /Items/{parentId}`.collectionType, else UNKNOWN. A ByParent row for a collection or playlist therefore gets the defaults.
- **SH-4 SearchForDialog (collection/playlist picker) is unspecified** (port; 02 sec 5.2; 03:745 wrongly calls it out of scope). *Source:* `W/ui/search/SearchForDialog.kt:25-304`, `SearchForViewModel.kt:30-114`.
  - **Dialog:** 80% width x 66% height, elevation 3. Title "Search for {Collections|Playlists}".
  - **Search box:** voice button and a 750 ms debounce. IME Search or a voice result searches immediately.
  - **Results row:** `GET /Items?userId&searchTerm&includeItemTypes=[BOX_SET|PLAYLIST]&recursive=true&fields=Slim`. Blank query -> "No results"; while loading -> "Searching..."; error -> ErrorMessage.
  - **Suggestions row:** below a divider. `sortBy=DateLastContentAdded desc, limit=25`.
  - **Cards:** SeasonCard, 128dp, no overlay. Long-press is a no-op.
  - **Click:** closes the dialog and adds `ByParent(parentId, recursive=false)` titled with the item's name.

### Low
- **SH-5 Source page items and toasts** (port; 02 sec 5.2). *Source:* `W/ui/main/settings/HomeSettingsSourcePage.kt:25-111`, `HomeSettingsViewModel.kt:522-629,805-840`.
  - **Items:** the page (title "Settings") lists only Load from server, Load from server plugin (only when the plugin is detected), Load from web client, and Reset. Each asks "Overwrite local settings?".
  - **Correction to 02:714:** there is **no "Save to server" item** on this page. Save lives only in the Save dialog.
  - **Toasts:** "Settings saved"; "Error saving: {msg}"; "No server-side settings found"; "No server plugin settings found"; "No server-side web settings found"; "Error: {msg}".
  - **Load/reset flow:** sets the preview to Loading, replaces the rows, sets the next id to max id + 1, then refetches the previews. The first item of the first non-empty preview row is pushed to the backdrop.
- **SH-6 "Removed from next up" dialog** (port; 02 sec 5.7). *Source:* `W/ui/main/settings/RemovedNextUpContent.kt:150-258`.
  - The timestamp is the localized MEDIUM **date only**, not date-time (`Formatting.kt:54,69`).
  - The title is the hard-coded string "Removed from next up".
  - The delete button is disabled while a removal is in flight.
  - Ids the server no longer returns are omitted silently. Rows appear in server order.
- **SH-7 Tab row behaviour** (adapt; 01 sec 3.2, 03 sec 2.3). *Source:* `W/ui/components/TabRow.kt:57-112`.
  - **Scroll:** the selected tab scrolls to offset `-(viewportWidth/3.5)`.
  - **Entering the row:** from the left focuses the last tab; from the right focuses the first tab; up or down focuses the selected tab.
  - **Selection:** a click selects a tab; focus alone does not.
  - **Colours:** text is `onSurface` when the row has focus or the tab is selected, else `onSurface@0.5`.
  - **Indicator:** a 2dp bar whose width animates between 25% and 100% of the tab width.
- **SH-8 Backdrop submit dedupe and race guard** (port; 01 backdrop / 03 sec 13.6). *Source:* `W/services/BackdropService.kt:38`.
  - `submit` is a no-op when the URL equals the current non-null URL.
  - After the 500 ms delay, the result is published only if `backdropFlow.itemId` still equals the submitted id.
  - When the style is not dynamic-colour (UNRECOGNIZED counts as dynamic), the previous colours are kept.
  - Discover items use the key `discover_{id}`.
  - A failed palette extraction gives DEFAULT colours.
- **SH-9 Backdrop rendering** (adapt; 02 sec 3.9). *Source:* `W/ui/nav/Backdrop.kt:44-120`.
  - UNRECOGNIZED style = dynamic colour.
  - Gradients and the horizontal fade are mirrored in RTL.
  - Layer order: image -> 75% black if the drawer is open -> top scrim (Multiply) -> horizontal alpha mask over 0-60% of the width -> vertical alpha mask.
  - Crossfade is 800 ms by default.
- **SH-10 ContinueWatchingCombined edge cases** (port; 02 home row table). *Source:* `W/services/LatestNextUpService.kt:96`.
  - Next-up items without a seriesId, or whose `getLastPlayed` throws, get a null timestamp and sort last.
  - Resume items use `userData.lastPlayedDate`; null sorts last.
  - If the same id appears in both lists, the resume timestamp wins.
  - The lists are concatenated **without** de-duplication.
- **SH-11 Suggestions row order** (port; 03 sec 3.3). *Source:* `W/services/SuggestionService.kt:123`.
  - Cached ids are refetched with `GET /Items?ids=` and no sortBy, so the server's order is used, not the cached shuffle order.
  - Empty ids, or any exception, give Empty (never an error row).
  - Stale ids simply disappear.
- **SH-12 DefaultUserConfiguration fallback** (port; 02 sec 4). *Source:* `W/preferences/UserPreferences.kt:15-30`, used at `HomeSettingsService.kt:336` when `userDto.configuration` is null.
  - Fields that affect the default home: `hidePlayedInLatest=true`, empty `latestItemsExcludes`/`orderedViews`/`myMediaExcludes`/`groupedFolders`.
  - Other fields: `playDefaultAudioTrack=true`, `subtitleMode=DEFAULT`, `rememberAudio/SubtitleSelections=true`, `enableNextEpisodeAutoPlay=true`, `displayMissingEpisodes=false`.
- **SH-13 DisplayPreferences read/write id mismatch** (adapt; 02 sec 5.4 / 07). *Source:* `W/services/DisplayPreferencesService.kt:19`.
  - `updateDisplayPreferences` always **reads** id `default` but **writes** the passed id, under a global mutex.
  - The client is "Wholphin", or "Wholphin (Debug)" in debug builds.
  - The port should read the same id it writes.

## 2. Browse / detail / search (03)

### Medium
- **BR-1 `CollectionType.baseItemKinds` table** (port; 03 sec 4.3, 14.5, 02:692). *Source:* `W/ui/components/CollectionFolderGrid.kt:190`.

  | Collection type | Item kinds |
  |---|---|
  | MOVIES | MOVIE |
  | TVSHOWS | SERIES, SEASON, EPISODE |
  | PHOTOS, HOMEVIDEOS | VIDEO, PHOTO, PHOTO_ALBUM |
  | MUSIC | AUDIO, MUSIC_ARTIST, MUSIC_ALBUM |
  | MUSICVIDEOS | MUSIC_VIDEO |
  | BOXSETS | BOX_SET |
  | PLAYLISTS | PLAYLIST |
  | LIVETV | TV_CHANNEL, LIVE_TV_CHANNEL, PROGRAM, TV_PROGRAM, LIVE_TV_PROGRAM |
  | TRAILERS | TRAILER |
  | BOOKS | BOOK |
  | FOLDERS | FOLDER |
  | UNKNOWN | (empty) |

- **BR-2 Filter fields per endpoint, and the ArtistSource reload** (port; 03 sec 4, 04 Artists tab). *Source:* `W/data/model/GetItemsFilter.kt:121-165`, `W/ui/components/CollectionFolderView.kt:301`.
  - **Persons request:** forwards only `isFavorite`, plus `enableImageTypes=[Primary,Thumb]`.
  - **Artists / AlbumArtists requests:** forward `minCommunityRating`, `isFavorite`, `genreIds`, `personIds`, `studioIds`, `tags`, `officialRatings` and `years`. Years = the explicit years plus every year in each selected decade, d..d+9. They do **not** forward `played`, `videoTypes` or `includeItemTypes`.
  - **Request choice:** the endpoint follows `filter.override` (NONE / PERSON / ARTIST). For ARTIST, the `artistSource` view option picks Artists vs AlbumArtists.
  - **ArtistSource change:** while the override is ARTIST, changing it reloads from position 0. The dialog shows the Artist source row only when the override is ARTIST.
  - **Letter jump:** counts use the same endpoint as the grid. PERSON has no letter jump.
- **BR-3 Photo-album Play/Shuffle and the grid Play key** (adapt; 03 sec 4.11). *Source:* `W/ui/components/CollectionFolderView.kt:976,1004`.
  - **Header Play or Shuffle on a PHOTO_ALBUM parent:** navigates to `Slideshow(parentId=library, index=0, current filter and sort, recursive=true (forced), startSlideshow=true)`. Shuffle is ignored, so it behaves like Play.
  - **Grid Play key on a PHOTO_ALBUM item:** `Slideshow(parentId=item.id, index=grid index, recursive=true, startSlideshow=true)`.
  - **Grid Play key on any other item:** `Playback(item)`.
- **BR-4 Music list row (`ListItemAlbum`)** (port; 03 sec 4.9). *Source:* `W/ui/components/CollectionFolderList.kt:506`.
  - **Dense title:** "Title (Year)", only if the year is non-null.
  - **Overline:** the album artist, when not dense and the artist is non-null.
  - **Supporting text:** the year for MUSIC_ALBUM, else `subtitle`.
  - **Trailing text:** the rounded runtime, MUSIC_ALBUM only.
  - **Leading:** a heart if the item is a favorite.
- **BR-5 Voice recognition state machine** (adapt; 03 search, line 742). *Source:* `W/ui/components/VoiceInputManager.kt:39-442`.
  - **States:** Idle -> Starting -> Listening -> Processing -> Result(text) | Error(msg, retryable). `start` is ignored while Starting or Listening.
  - **Preconditions:** no network -> retryable "Network error". No audio focus -> retryable "Audio recording error". Permission denied -> non-retryable "Microphone permission required".
  - **Timeout:** an 8 s timer starts from ready-for-speech. When it fires, a non-blank partial transcript becomes the Result; otherwise retryable "Voice recognition timed out".
  - **Live feedback:** partial results update the text live. The sound level is `clamp((rmsdB+2)/12, 0..1)`.
  - **Error messages:** audio, client, permission, network, network timeout, no match ("No speech recognized"), busy / too-many-requests ("Voice recognition busy"), server, speech timeout ("No speech detected"), start failure, unknown.
  - **Retryable errors:** network, network timeout, server, no match, speech timeout.
  - **Cleanup:** callbacks from a superseded recognizer are ignored. Stop or dismiss returns to Idle.
  - **Web:** map onto `SpeechRecognition` events.
- **BR-6 Recommended tab can stay loading forever** (port; 03 sec 3, line 173). *Source:* `W/ui/components/RecommendedContent.kt:100-152,366-376`.
  - The page leaves the full-page LoadingPage only when a **non-Suggestions** row finishes non-empty.
  - If every configured row is empty or errored, the page spins forever, even when Suggestions has content.
  - **Port decision:** show Suggestions, or an empty state.
- **BR-7 Collection detail reload flashes the whole page** (adapt; 03 sec 8.1/8.2). *Source:* `W/ui/detail/collection/CollectionViewModel.kt:130-150`, `CollectionDetails.kt:~150-170`.
  - **Trigger:** any sort, filter or separate-types change, and the first arrival of the saved display info.
  - **Effect:** items are cleared and the **entire page, header included**, is replaced by LoadingPage until every per-type request finishes.
  - **Row assembly:** rows are inserted in type order. Empty rows are skipped; error rows are kept.
  - **Port:** prefer keeping the header mounted and showing a local spinner.
- **BR-8 Series Overview refreshes on return** (port; 03 sec 6.2). *Source:* `W/ui/detail/series/SeriesOverview.kt:79-90`, `SeriesViewModel.kt:316-344`.
  - **Trigger:** recomposing with existing seasons, for example after playback, calls `loadEpisodes(current season)`.
  - **Refetch:** episodes are refetched, the pager is rebuilt, and `/Items/{seasonId}/SpecialFeatures` is refetched. This is what updates watched marks and progress.
  - **Reset:** the list is reset to Loading (with extras and people cleared) only when the season id changed.
  - **Resume:** re-submits the backdrop and replays the theme song.
- **BR-9 Favorites tabs appear and disappear dynamically** (adapt; 03 sec 11.1, line 694). *Source:* `W/ui/detail/FavoritesViewModel.kt:197-265,300-355`.
  - **Initial load:** all type fetches run in parallel. Tabs are added as their requests complete, in `favoriteOptions` order.
  - **Refetch:** after every sort change, filter change or favorite toggle.
  - **Removal:** an empty refetch **removes the tab** while the selected key stays the same. The page then renders "Invalid tab {type}". This happens when a filter yields zero results or when the last item is un-favorited.
  - **Port:** keep the tab and show "No results", or switch to another tab.

### Low
- **BR-10 List rows** (port; 03 sec 4.9). *Source:* `W/ui/components/CollectionFolderList.kt:329`.
  - **Generic row:** supporting text = subtitle if non-null. Trailing text = rounded runtime, or empty.
  - **Movie row:** non-dense supporting text = `subtitle ?: ""`. The dense "Title (Year)" form needs both a title and a year.
  - **Series row:** the dense title is always "{title} ({subtitle})". Trailing shows the unplayed count if >0, else a watched icon.
  - **Density:** dense = `viewOptions.type == DENSE_LIST`.
  - **Animation:** the title marquees after 500 ms of focus. Focus scale 1.0; pressed scale 0.95.
- **BR-11 List mode** (adapt; 03 sec 4.9, 4.5). *Source:* `W/ui/components/CollectionFolderList.kt:105`.
  - **Details pane:** "Show details" opens a 33% pane that always shows the logo (it ignores `showLogos`).
  - **Padding:** top padding is 8dp when the header is shown (index < 1), else 48dp.
  - **Back:** when position > 0, Back scrolls to item 0 and focuses it. There is no long-press-Back restore.
  - **Alphabet picker:** shown only for SortName with a non-empty list.
- **BR-12 Focus target when the grid result reloads** (adapt; 03 sec 4.1/4.11). *Source:* `W/ui/components/CollectionFolderView.kt:1098`. Rules, in priority order:
  1. Context menu open -> request no focus.
  2. Filter dropdown open -> Filter button.
  3. The user left via Random -> Random button, then clear that flag.
  4. Non-empty list -> grid.
  5. Otherwise -> the empty-state target (the tab or the header). An items Error also focuses this target.
- **BR-13 Grid listens for global deletes** (adapt; 03 sec 4.11). *Source:* `W/ui/components/CollectionFolderView.kt:223`.
  - **Trigger:** any delete in the app (`deletedItemFlow`).
  - **Refresh:** `refreshPagesAfter(savedPosition)` runs if the item at that position is the deleted item, or its id equals the deleted item's seriesId.
  - **Failure:** toast "Error refreshing after item deleted".
- **BR-14 Random button** (port; 03 sec 4.11). *Source:* `CollectionFolderView.kt:322`.
  - Disabled when the list is empty.
  - Does nothing unless the list is loaded.
  - Errors show the toast "Error: {msg}".
  - Focus returns to the button after navigating back.
- **BR-15 Generic long-press menu wiring** (port; 03 sec 4.11/14.1). *Source:* `W/ui/components/ContextMenuUtils.kt:66`.
  - **Arguments:** `ForBaseItem(fromLongClick=true, showGoTo=true, showStreamChoices=false, canRemoveContinueWatching/NextUp=false)`. The stream-choice handlers are no-ops.
  - **Media information:** `showFilePath` = the user is an administrator.
  - **Add to playlist:** PlaylistDialog with `createEnabled=true`.
  - **Add to queue:** for MUSIC_ALBUM or AUDIO, goes through `AddPlaylistViewModel.addToQueue`.
- **BR-16 Voice search overlay UI** (adapt; 03 search). *Source:* `W/ui/components/VoiceSearchButton.kt:77-414`.
  - **Button:** 40x40, hidden when recognition is unavailable. Clicking it while Starting or Listening stops listening.
  - **Dialog:** 85% width. A 160dp mic bubble pulses (1.0-1.05, 800 ms) and grows by up to +0.15 with the sound level. Three ripple rings animate only while Listening.
  - **Status text:** error > "Processing..." > "Starting..." > the live partial transcript > "Speak to search...".
  - **Errors:** a retryable error shows a "Retry" pill. A non-retryable error auto-dismisses after 3 s.
  - **Hint:** "Press back to cancel".
  - **Result:** acknowledged 50 ms after it arrives.
- **BR-17 Recommended row mutations** (port; 03 sec 3.4). *Source:* `RecommendedContent.kt:234-286`.
  - **Watched / favorite:** refresh only that slot (`pager.refreshItem`). The Suggestions row is not refreshed.
  - **Delete:** `refreshPagesAfter(column)`.
- **BR-18 Collection view-options Reset** (port; 03 sec 8.2). *Source:* `W/ui/detail/collection/CollectionViewOptionsDialog.kt:49-56,120-130,148-176`.
  - Reset restores `CollectionViewOptions()`, including `separateTypes=true` and card options `showDetails=true, showTitles=true, columns 6, spacing 16, FIT, TALL, PRIMARY`.
  - Changes are saved immediately to `{userId}_CollectionViewOptions`.
- **BR-19 Collection rows** (port; 03 sec 8.2). *Source:* `W/ui/detail/collection/CollectionRows.kt:20-80`.
  - **Empty results:** separate mode renders nothing when every type is empty. Mixed mode shows "No results".
  - **Row shapes:** EPISODE rows use the episode height, WIDE, `useSeries=false`. Artist, album, playlist and audio rows are SQUARE. VIDEO and MUSIC_VIDEO rows are WIDE.
  - **Row index:** counted among non-empty rows only.
- **BR-20 Series details: delete that empties the seasons** (port; 03 sec 6.1). *Source:* `SeriesViewModel.kt:552-607`.
  - On the **details** page, deleting a child refetches the seasons, and goes back if none remain.
  - A `deletedItemFlow` subscription refetches the seasons for any deleted item with this seriesId. (The overview case is already in 03:546.)
- **BR-21 Favorites grid specifics** (adapt; 03 sec 11). *Source:* `W/ui/detail/FavoritesPage.kt:55-100`.
  - **Tab row:** collapses when the focused index >= columns.
  - **Position and focus:** the saved position is 0, so scroll is not restored. There is no fallback focus on empty.
  - **Tab change:** clears the backdrop.
  - **Empty state:** "No favorites found!" on a focusable box.
- **BR-22 More-row grid (HomeRowGrid) differences** (port; 03 sec 4.15). *Source:* `W/ui/detail/HomeRowGrid.kt:40-322`.
  - **Disabled:** the Play key is a no-op and there is no letter bar.
  - **Delete:** does not refresh (TODO in the source).
  - **Watched / favorite:** refresh only that slot.
  - **Backdrop:** not updated on focus.
  - **Genres / Studios:** delegate to GenreCardGrid / StudioCardGrid (`collectionType=UNKNOWN`).
  - **Fetch:** `limit=1000`, paged.
  - **Layout:** 4 columns if the aspect ratio is >1, else 6. Titles are always shown.
- **BR-23 Person page Discover row** (adapt; 03 sec 10.1). *Source:* `W/ui/detail/PersonPage.kt:265,299`.
  - The list is truncated to `maxItemsPerRow`.
  - "View more" is shown only when the full list is longer than the cap. It opens `DiscoveredItem(person, startIndex=cap)`.
  - The row is hidden if the list is empty.
- **BR-24 Add-to-playlist dialog** (port; 03 sec 9.3). *Source:* `W/ui/detail/PlaylistList.kt:100-240`.
  - **Search:** the 750 ms debounce fires only when the query changed. The search icon searches immediately (non-blank only) and suppresses the pending duplicate.
  - **Dialog:** top gravity, elevation 3, radius 24. A 48dp spinner while loading.
  - **Focus:** moves to the list on load, unless the search box has focus.
  - **Create:** blank name -> Submit is disabled. The keyboard Done action does **not** check for a blank name (do not copy).
  - **Row text:** `mediaType` -> Unknown, Video, Audio or Photos. The trailing text is "{n} items".
- **BR-25 Playlist details** (adapt; 03 sec 9.1/9.2). *Source:* `W/ui/detail/PlaylistDetails.kt:60-260`.
  - **Edit permission:** `canEdit` comes from `GET /Playlists/{id}/Users/{userId}`. A 404, or any error, means false.
  - **Media type:** the server's `mediaType` wins unless it is UNKNOWN. Otherwise, only when there are <=50 items, classify them all: AUDIO -> Audio; VIDEO, EPISODE, MOVIE, BOX_SET -> Video; any mix -> Unknown.
  - **"Play as?" dialog:** never closes on a choice in the source; the port should close it.
  - **AUDIO rows:** use the music menu, with remove = `canEdit`, and show a playing or queued marker.
  - **Errors:** a remove failure shows the toast "Error: {msg}".
- **BR-26 Grid paging keys** (adapt; 03 sec 4.5). *Source:* `W/ui/detail/CardGrid.kt:70-150`.
  - **Jump sizes:** computed once and never updated.
  - **Jump target:** `firstVisibleItemIndex + jump` (not the focused index), clamped, then focused.
  - **Back-to-top:** animated if the focused index < columns*6, else instant.
  - **Letter keys:** A-Z only, no modifiers.
  - **Play key:** only for playable items.
- **BR-27 Detail-page error toasts** (port; 03 sec 13.1). *Source:* `MovieViewModel.kt:150-185`, `EpisodeViewModel.kt:95-110`, `SeriesViewModel.kt:357-379`.
  - **Toasts:** "Something went wrong..." (movie watched/favorite), "Error updating episode", "Error updating series", "Error refreshing after item mutate/deleted", "Error: {msg}" (Random).
  - **Side data:** people, extras, similar and streams fail silently.
  - **Bug, do not copy:** the episode "Directed by" line is shown even when the list is empty.
- **BR-28 BaseItem derivations** (port; 03 sec 1). *Source:* `W/data/model/BaseItem.kt:93-95`.
  - `sortName = dto.sortName ?: name ?: ""`.
  - `aspectRatio = PrimaryImageAspectRatio`, only if >0, else null.
- **BR-29 Search refresh and type edge cases** (adapt; 03 sec 12.2). *Source:* `W/ui/search/SearchViewModel.kt:345-427`.
  - **Seerr results:** movie and TV only. The row needs Seerr active and `searchIncludeDiscover` (default true).
  - **Refresh after an action:** only the card at the current focus position, and only if the ids match. A failure shows the toast "Error refreshing" (it always appears after a delete, because the refetch 404s).
  - **Record:** refreshes the program. Cancel does not.
  - **Type exclusion errors:** toast "An error occurred: {msg}".
  - **Tab reset:** the selected tab resets to 0 when Seerr is inactive or the query is blank.
- **BR-30 Search relevance edge cases** (port; 03 ~line 735). *Source:* `W/util/SearchRelevance.kt:21-45`.
  - `/pattern/` and `/pattern/i` are detected on the raw query but applied to the **lowercased** name, so an uppercase non-`i` pattern never matches.
  - An invalid regex scores 400.
  - A null name scores `Int.MAX_VALUE`.
  - Fuzzy score = Levenshtein distance / max(len(name), len(query)).

## 3. Live TV (04 A)

### Low
- **LT-1 Guide cancel when there is no timer id** (port; 04 A.4/A.7). *Source:* `W/ui/detail/livetv/TvGuideGrid.kt:213-225`, `W/services/LiveTvService.kt:39-52`.
  - A null timerId or seriesTimerId returns false: no API call and no refresh, but the dialog still closes.
  - Programs refresh only when the cancel returns true. Record always refreshes.
  - A failed refresh puts the whole guide in Error.
- **LT-2 Gap filling and null guards** (port; 04 A.3). *Source:* `W/ui/detail/livetv/LiveTvViewModel.kt:239-320`.
  - **Overlaps:** add nothing and are not de-overlapped.
  - **Trailing fill:** one filler from `endHours` to `floor(endHours+1)`, which can be zero-length, then 1-hour fillers up to 48. A program ending at >=48 gets no fill.
  - **Null guards:** the source force-unwraps channelId, start, end and runtime; the port must guard them. A null channelId is dropped.
  - **First render:** only the first 10 channels' programs.

## 4. Music (04 B)

### High
- **MU-1 Music preference defaults are wrong in 04 B.11** (port; 04:378 contradicts 06:87). *Source:* `W/preferences/AppPreferencesSerializer.kt:174-176`, `AppUpgradeHandler.kt:331`.
  - **Fresh-install defaults:** `showBackdrop=true`, `showLyrics=true`, `showAlbumArt=true`, `showVisualizer=false`.
  - **Not a default:** `defaultValue=false` in `MusicPreference.kt` is only the settings-UI fallback.
  - **Fix 04:** replace "all 4 prefs default FALSE". As written, Now Playing would ship with no art, backdrop or lyrics.

### Medium
- **MU-2 "Add to queue" and "Play next" semantics** (port; 04 B.7/B.8). *Source:* `W/ui/detail/music/MusicViewModel.kt:94-141`, `W/services/MusicService.kt:238-300`.
  - **AUDIO:** appends the song at the **end**; the index is ignored.
  - **MUSIC_ALBUM / MUSIC_ARTIST / PLAYLIST:** builds the song pager and appends **all** songs in chunks of 25.
  - **Playback side effect:** every path ends in `prepare()+play()`, so adding to an idle or paused queue starts or resumes playback.
  - **Other types:** ignored.
  - **Play next:** does not expand an album or artist into songs; the port should expand.

### Low
- **MU-3 Music library tabs** (adapt; 04 B.2). *Source:* `W/ui/detail/CollectionFolderMusic.kt:20-110`.
  - **No context menu** on music grid cards.
  - **Shared settings:** Albums, Artists and Songs share one persisted LibraryDisplayInfo row (same itemId), so a sort chosen on one tab leaks into the others.
  - **Play all / Shuffle:** ignore the current sort and filter. They use `GET /Items?parentId&includeItemTypes=Audio&recursive=true` with no sort.
  - **Play key:** queues only that song, for AUDIO cards only.
- **MU-4 Visualizer permission flow** (adapt; 04 B.11). *Source:* `W/ui/detail/music/NowPlayingViewModel.kt:380-393`.
  - **On:** requests permission and sets the preference only on grant.
  - **Off:** writes the preference directly.
  - **Denied:** flips the switch back off.
  - **Active:** only while PLAYING.
  - **Web:** the preference sticks only if an AnalyserNode tap can be created.
- **MU-5 Album page "Play" ignores the pressed item** (adapt; 04 B.3). *Source:* `W/ui/detail/music/AlbumDetailsPage.kt:342`.
  - **Bug, do not copy:** `onClickPlay = {index,_ -> play(false,index)}` always plays this album from `index`. Long-pressing a "More like this" card therefore starts the current album at that offset. The port should play the pressed item.
  - **Song menus:** Play starts the queue at that song.
  - **Song rows:** `showArtist = isVariousArtists`.
  - **Music videos row:** long-press is a no-op.
- **MU-6 Delete outcome on music pages** (port; 04 B.3-B.5). *Source:* `MusicViewModel.kt:76-84,132-157`.
  - Deleting the page's own item navigates back.
  - Deleting any other item on the page reloads the whole page.
  - Visibility: `enableMediaManagement && item.CanDelete`.
- **MU-7 Artist page backdrop and refresh** (port; 04 B.4). *Source:* `W/ui/detail/music/ArtistDetailsPage.kt:248-258,399-405`.
  - **Backdrop:** the artist item itself, re-submitted on every re-entry.
  - **Music-video favorite or watched:** refetches only the music-video row.
  - **Artist favorite:** refetches the artist.
- **MU-8 Now Playing queue list** (adapt; 04 B.11). *Source:* `W/ui/detail/music/NowPlayingOverlay.kt:60-155`.
  - **Opening:** scrolls to the current song, and focus enters on it.
  - **Navigation:** Up from the list returns to the buttons. Back from deep in the list (index >=3) scrolls to item 0 first.
  - **Reorder:** ▲ is disabled at index 0 and ▼ at the last index. The moved row is brought into view.
  - **Header:** "Queue", else "No items".
  - **Rows:** keyed per entry, so duplicates are distinct rows, and both duplicates show "playing".
- **MU-9 Lyrics rendering** (port; 04 B.11). *Source:* `W/ui/detail/music/LyricsContent.kt:36-125`.
  - **Auto-scroll:** only when the lyrics list does not have focus, and only if the current line is off-screen.
  - **Blank lines:** rendered as 16 spaces.
  - **Colours:** animate over 500 ms between `onSurface` and `onSurface@40%`. A null current index shows every line at full brightness.
  - **Focus:** entering the list focuses the current line, or line 0.
  - **Reset:** on each track change.
- **MU-10 Now Playing backdrop list** (adapt; 04 B.11). *Source:* `NowPlayingViewModel.kt:156-213`.
  - **Song backdrops:** tags sorted, with the sorted position used as the image index.
  - **Artist backdrops:** from all `artistItems`, limit 50.
  - **Cycling:** shuffled per group and cycled forever. A step that fails the >=15 s-remaining check is skipped with no delay.
  - **Cleared when:** a fetch errors or `showBackdrop` is off.
  - **Colours:** extracted per image.

## 5. Photos (04 C)

### Low
- **PH-1 Slideshow key handling** (adapt; 04 C.3). *Source:* `W/ui/slideshow/SlideshowPage.kt:150-214`.
  - **Long press:** a repeat or long-press key sets a long-press flag, and the next KeyUp is swallowed. Only Up/Down zoom (±0.05) acts on repeats.
  - **Left / Right:** navigate on KeyUp and do **not** restart the timer.
  - **Zoomed (>1.02):** arrows pan 30dp, and Back resets zoom and pan but keeps rotation.
  - **Repeat mode:** `repeatMode` = OFF while the slideshow is enabled, else ONE.
  - **Videos:** get no colour filter.
- **PH-2 Overlay slideshow buttons** (adapt; 04 C.3). *Source:* `W/ui/slideshow/SlideshowViewModel.kt:262-285`, `ImageControlsOverlay.kt:50-72`.
  - **Play slideshow:** starts it and hides the overlay. **Stop slideshow:** leaves the overlay open.
  - **Videos:** starting does not arm the timer (the video's end does). For videos the overlay shows play/pause, and stream details replace the WxH label.
  - **Timer:** a perpetual loop that wraps to 0 at the end.
- **PH-3 Colour-filter lifecycle** (port; 04 C.3). *Source:* `SlideshowPage.kt:395-413`, `SlideshowViewModel.kt:163-210`.
  - **Image change:** unsaved edits are discarded. The album filter loads first, then the per-image filter if one is saved.
  - **Dialog:** opening it pauses the slideshow; closing it unpauses and re-arms the timer.
  - **Reset:** does not save.
  - **Saving:** "Save for album" is a no-op with no parentId.

## 6. Seerr / Discover (04 D)

### High
- **SE-1 The TV "Pending" button is not a no-op** (port; fix 04:616). *Source:* `W/ui/detail/discover/DiscoverSeriesDetails.kt:282`.
  - **TV:** `pendingOnClick = requestOnClick`, so clicking Pending opens the season request dialog, where the pending seasons can be edited. The button is enabled regardless of `canRequestTv`.
  - **Movies:** the no-op applies only to movies.
- **SE-2 Season request submits only the selected seasons** (port; fix 04:634-635). *Source:* `W/ui/detail/discover/RequestSeasons.kt:99-136`.
  - **Body:** contains only `selectedSeasons`, which is the seasons that were PENDING when the dialog opened plus the seasons the user toggles on.
  - **Display-only rows:** already requested, approved or available seasons appear checked but are **not sent**. The spec's "full season list is sent" is wrong.
  - **Select all:** checked iff every editable season is selected (so it is checked when nothing is editable). It adds or removes only editable seasons.
  - **Submit:** disabled when nothing is selected.
  - **4K switch:** swaps to `seasons4k`, resets both sets, and resets the profile and folder to the 4K default or first entry.
  - **Initial `is4k`:** `= !requestEnabled`.

### Medium
- **SE-3 Per-season editable and availability rules** (port; 04:633). *Source:* `W/ui/detail/discover/DiscoverSeriesViewModel.kt:175-186,232-237`.
  - **`seasons4k`:** built only when `series4kEnabled && REQUEST_4K_TV`.
  - **`editable[season]`:** set by **each** request that mentions the season, so the **last request wins**. A request from another user, or an approved one, explicitly sets false.
  - **Default editable:** applies only to seasons that no request mentions.
  - **Availability:** "max wins" uses enum order, so BLOCKLISTED and DELETED outrank AVAILABLE.
  - **Season list:** includes season 0. The title is `season.name`, else "Season N".
- **SE-4 TV discover page differs from the movie page** (adapt; fix 04:632 "same layout as movie"). *Source:* `DiscoverSeriesDetails.kt:36-60`.
  - **No refetch on resume:** there is no LifecycleResumeEffect; the movie page has one at `DiscoverMovieDetails.kt:80`.
  - **Header:** no tagline, no "Directed by" and no certification.
  - **Overview:** 3 lines, and clicking it opens a details dialog (title, overview, genres).
- **SE-5 Movie certification and header rules** (port; 04 D.6). *Source:* `W/ui/detail/discover/DiscoverMovieDetailsHeader.kt:88-108`.
  - **Certification source:** the `releases.results` entry for the device-locale country, else US, else the first entry. Use its **first** releaseDate's certification, if non-blank.
  - **Runtime:** rounded minutes, formatted.
  - **Release date:** the raw string.
  - **"Directed by":** crew with `job=="Director"`, hidden if none.
  - **Tagline:** italic, only if non-blank.
- **SE-6 Discover rating fetch and display** (port; 04 D.5/D.6). *Source:* `W/ui/Formatting.kt:245-269`, `SeerrDiscoverPage.kt`.
  - **Display:** uses `listToDotString` (separator `"  •  "`): audience score `%.1f` (`audienceScore/10`) plus a star, and critic score `n%` plus a fresh tomato at >=60, else rotten. TV has the critic score only.
  - **Discover tab:** ratings are fetched lazily for the focused card, cached for 100 entries **keyed only by TMDB id**, so movie and TV ids can collide; the port should key by type and id.
  - **Skipped:** person and unknown items.
  - **Errors:** give an empty rating.
- **SE-7 Filter option cache and values** (adapt; 04 D.5). *Source:* `W/services/FilterOptionCache.kt:52-82,194-200`.
  - **Cache:** in memory, 16 entries, 1 h after write. The key is (userId, null parent, filter).
  - **Seerr inactive:** empty lists.
  - **Errors:** toast "Error occurred: <msg>", then an empty list.
  - **Watch providers:** `watchRegion=US`.
  - **TV status options, in order:** Returning Series, Planned, In Production, Ended, Canceled, Pilot. The ordinal is sent, `|`-joined.

### Low
- **SE-8 Discover filter dropdown semantics** (port; 04:593). *Source:* `W/ui/components/FilterByButton.kt:444`.
  - **Menu:** two levels with "Remove all" at the top. Active filters are checked.
  - **Genres / studios:** multi-select Int ids.
  - **TV status:** multi-select of the status enum.
  - **Content rating:** multi-select strings.
  - **Community rating:** a single minimum, shown as "{n}+ ★".
  - **Multi-select behaviour:** toggling keeps the menu open, and an empty list becomes null.
- **SE-9 Extra buttons** (port; 04 D.6). *Source:* `W/ui/detail/discover/ExpandableDiscoverButtons.kt:136-146`.
  - **Partial "Request":** for PARTIALLY_AVAILABLE, always enabled (it ignores `canRequest`).
  - **Cancel:** moves focus to the primary button before cancelling.
  - **Trailers:** always present.
  - **Order:** primary, partial Request, Cancel, Trailers.
- **SE-10 Requests tab** (port; 04 D.5). *Source:* `W/ui/discover/SeerrRequestsPage.kt:55-112`.
  - **Detail fetches:** at most 3 at a time. **Any** failure makes the whole tab an ErrorMessage.
  - **Skipped:** requests that are not movie/TV, or have no tmdbId.
  - **Order:** API order.
  - **Backdrop:** cleared and never updated.
  - **Empty:** "No results", and focus goes to the tabs.
- **SE-11 Discover person page** (adapt; 04 D.8). *Source:* `W/ui/detail/discover/DiscoverPersonPage.kt:60-70`.
  - **Bug, do not copy:** a credits fetch error leaves the page loading forever; the port should show an error.
  - **Title:** "Discover" when there is no name.
- **SE-12 Add-server form validation** (port; 04 D.3). *Source:* `W/ui/setup/seerr/AddSeerrServer.kt:154,313`.
  - **API-key form:** Submit needs no error, plus a URL and a key.
  - **Login form:** Submit needs no error, plus a URL and a username (the password may be empty), and no request in flight. While loading, a spinner replaces the label.
  - **Error text:** clears on any status change.
  - **Initial focus:** the first blank field.
  - **Keyboard:** Enter on the last field submits.
  - **Back:** returns to the login-type chooser.
  - **Success:** toast "Seerr server added".
- **SE-13 Add-server submit flow** (adapt; 04 D.3). *Source:* `W/ui/setup/seerr/SwitchSeerrViewModel.kt:43-130`.
  - **Before the dialog:** a loading dialog shows until the plugin check finishes.
  - **Invalid URL:** shows "Invalid URL".
  - **Connection:** candidate URLs are tried in order. The URL that **succeeds** is persisted.
  - **Errors:** 401 or 403 -> "Invalid credentials". Other client errors -> "Could not connect with URL". If every URL fails: toast "Could not connect", and the dialog lists `<url> - <msg>` per line.
  - **Remove failure:** "Could not remove server".
- **SE-14 Plugin-provided Seerr server** (adapt; 04 D.3). *Source:* `W/services/SeerrServerRepository.kt:176-235`.
  - **Storage:** transient (id -1), with no stored credentials.
  - **Login types:** ApiKey (`GET /auth/me`) or Local (`POST /auth/local`) only.
  - **Settings entry:** read-only. On failure it shows an Error state with a retry.
  - **Dialog body:** "URL: …", "Username: … (Local user|Jellyfin user)" or "Username: API Key", then the optional lines "Managed by server" and "Error: …".
- **SE-15 Discover tab-strip visibility** (adapt; 04 D.5). *Source:* `W/ui/discover/DiscoverPage.kt:34-110`.
  - **Discover tab:** the strip hides at focus row >=1.
  - **Grid tabs:** the strip hides past the first row.
  - **Movies / TV state:** each keeps its own view-model state.
  - **"More" grid:** the header shows only if `startIndex<6`.
  - **Sort / filter change:** cancels the old job and shows LoadingPage.
- **SE-16 Discover search** (adapt; 04 D.5 Tab 3). *Source:* `W/ui/discover/DiscoverSearchPage.kt:81-130`.
  - **Repeat query:** the same query is not re-run. A blank query resets the page.
  - **Results:** page 1 only, movie and TV only.
  - **Search click:** bypasses the debounce.
  - **State:** the query survives navigation.
- **SE-17 Discover tab rows** (adapt; 04 D.5 Tab 1). *Source:* `W/ui/discover/SeerrDiscoverPage.kt:168-245`.
  - **Genre rows:** drop null ids and names, and pick one random backdrop per genre at load (1280x720). The focused-genre header is "<Genre> Movies/TV Shows".
  - **Backdrop key:** `discover_<id>`. In-library items use the Jellyfin backdrop; others use TMDB `w1920_and_h1080_multi_faces`.
  - **First focus:** the first load focuses Trending once.
  - **View more:** remembers the view-more slot for focus restore.
  - **Bug, do not copy:** the TV genre row's focus uses `movieGenres`.
- **SE-18 Movie discover view model** (port; 04 D.6). *Source:* `W/ui/detail/discover/DiscoverMovieViewModel.kt:104-124`.
  - **Similar / Recommended:** fetched only when empty.
  - **People row:** cast then crew, not de-duplicated.
  - **Trailers:** Trailer-type videos with a name and a URL. The "YouTube" subtitle appears only for youtube.com hosts.
  - **After request or cancel:** refetch. A refetch failure is silent, and only the POST/DELETE failure toasts "An error occurred".

## 7. Playback (05)

### High
- **PB-1 HDR override -> VideoRangeType mapping** (adapt; 05 sec 1.5 / 13, 06 HDR_FORMATS). *Source:* `W/preferences/HdrFormat.kt:10-57`.

  | Format | Range types |
  |---|---|
  | HDR10 | `HDR10` |
  | HDR10_PLUS | `HDR10Plus` |
  | DOVI_PROFILE_5 | `DOVI` |
  | DOVI_PROFILE_7 | `DOVIWithEL`, `DOVIWithELHDR10Plus` on server >=10.11; **empty** on older servers |
  | DOVI_PROFILE_8 | `DOVIWithHDR10`, plus `DOVIWithHDR10Plus` on >=10.11 |

  - **Collection:** `getHdrRangeTypesFor(mode)` takes the union over every format whose preference equals `mode`. AUTO contributes nothing.
  - **Device profile:** the ENABLE set becomes `forceEnabledHdr` and the DISABLE set becomes `forceDisabledHdr`.
  - **P7 conversion:** when Dolby Vision P7 conversion is wanted, P7's set is also added to `forceEnabledHdr`.

### Medium
- **PB-2 Per-codec unsupported range-type rules** (adapt; 05:213). *Source:* `W/util/profile/DeviceProfileUtils.kt:470-540`. `t` = server >=10.11.
  - **HEVC:**
    1. `t` -> exclude DOVIInvalid.
    2. No DV-EL support and `t` -> exclude DOVIWithEL. Also exclude DOVIWithELHDR10Plus when there is no HDR10+ and no device bug.
    3. No HEVC DV -> exclude DOVI. Also DOVIWithHDR10 when there is no HDR10. Also DOVIWithHDR10Plus when `t`, no HDR10+ and no device bug.
    4. No HDR10+ -> exclude HDR10Plus. Also HDR10 when there is no HDR10.
    5. `t` and the DV+HDR10+ device bug -> exclude DOVIWithHDR10Plus and DOVIWithELHDR10Plus.
  - **AV1:**
    1. `t` -> exclude DOVIInvalid.
    2. If software `decodeAv1` is on, exclude nothing else.
    3. Otherwise apply the same DOVI and HDR10+ rules with the AV1 probes.
  - **Final set:** `built - forceEnabled + forceDisabled`.
  - **Emission:** only if the set is non-empty, as condition `VideoRangeType notEquals "A|B|…"`.
- **PB-3 Empty `mediaSources` hangs forever** (adapt; 05:127). *Source:* `W/ui/playback/PlaybackViewModel.kt:709-710`.
  - With no `errorCode` and an empty list, nothing happens and the spinner stays forever.
  - **Port:** treat it as an error (show a message and allow Back).
- **PB-4 Subtitle download polling bug and edge cases** (port; 05:492). *Source:* `W/ui/playback/SubtitleSearchUtils.kt:127-215`.
  - **Timeout bug, do not copy:** the timeout test is `maxAttempts==0`. A stream that appears on the 4th poll still toasts "too long" and is not switched to.
  - **Source gone:** a missing source shows the toast "Item is no longer playable..." and leaves the dialog stuck on "Downloading...".
  - **No new stream found:** the dialog closes silently.
  - **Each poll:** replaces `currentItem`.
  - **Switch:** `changeStreams(enableDirectPlay=true)` at the current position.
  - **Errors:** an ErrorMessage with no retry.
  - **Dismiss:** resumes playback only if it was playing before.
- **PB-5 Subtitle delay persistence** (adapt; 05 sec 4.4; Android offers it only with MPV). *Source:* `PlaybackViewModel.kt:1647-1686`.
  - **When saved:** only if an `ItemPlayback` row exists, so a delay on an auto-selected subtitle is never saved.
  - **Index mismatch:** the save uses the row's `subtitleIndex` (which may be -3 for ONLY_FORCED), but the load uses the resolved index.
  - **Load:** happens after every stream change and after an in-player switch.
  - **Reset:** sends `-current`.
  - **Labels:** in Duration format ("1.5s", "250ms").

### Low
- **PB-6 Subtitle search result rows** (port; 05 sec 4.5). *Source:* `W/ui/playback/DownloadSubtitlesDialog.kt:168-210`.
  - **Supporting text:** provider - Forced - Hearing impaired - "{n} downloads", with n abbreviated (10500 -> "10.5K").
  - **Overline:** "Hash matches".
  - **Trailing:** the rating plus a gold star.
  - **Dialog:** max 640x400.
  - **Language field:** IME Search searches again.
  - **Focus:** the first result.
- **PB-7 Captions dialog shows the resolved index** (port; 05 sec 3, 9.5). *Source:* `PlaybackViewModel.kt:810-811`.
  - **After a restart path:** the radio shows the concrete forced track instead of "Only forced subtitles".
  - **After an in-player switch:** it shows "Only forced subtitles".
  - **Port:** keep the user's raw choice.
- **PB-8 Skip indicator accumulation** (port; 05 sec 9.6). *Source:* `W/ui/playback/overlay/SkipIndicator.kt:37-51`, `PlaybackKeyHandler.kt:83-91`.
  - **Accumulation:** each press restarts an 800 ms ±270° rotation. Completing it resets the total, so presses within 800 ms add up.
  - **TRICKPLAY mode:** resets after 1.5 s.
  - **SEEKBAR_TRICKPLAY:** the media FF/RW/skip keys seek immediately, bypassing the debounced virtual seek.
- **PB-9 Next Up panel** (port; 05 sec 7). *Source:* `W/ui/playback/NextUpEpisode.kt:139-221`.
  - **Countdown:** text in Duration format ("15s"). At 0, or with autoplay off, a 60dp Play icon instead.
  - **Runtime line:** "{duration} · Ends at {now + full runtime}".
  - **Text:** title "SxEy - name"; overview 4 lines.
  - **Card:** image Fit, aspect >= MIN, auto-focused.
  - **Heading:** "Next up...".
- **PB-10 Media Session metadata** (adapt; 05:1130). *Source:* `W/ui/playback/CurrentMediaInfo.kt:66-83`.
  - **Fields:** title, `subtitle` (not `subtitleLong`), year, overview, artwork (Primary, or the series Primary for episodes), duration.
  - **Media type:** MOVIE, EPISODE -> TV_SHOW, channels -> TV_CHANNEL, else VIDEO.
- **PB-11 Debug overlay sources** (adapt; 05 sec 12.1). *Source:* `W/ui/playback/overlay/PlaybackDebugOverlay.kt:76-137`.
  - **Bitrate:** measured from the last bandwidth sample, alongside the estimate.
  - **Dropped frames:** cumulative.
  - **Memory:** refreshed every 2 s. **Display mode:** every 10 s.
  - **Transcode tables:** shown once the info loads.
  - **Style:** 10sp text, 50% black background.
- **PB-12 Android codec probes and device quirks** (android-only; 05 sec 1.5). *Source:* `W/util/profile/MediaCodecCapabilitiesTest.kt:129-378`, `KnownDefects.kt`.
  - **AV1:** a hardware decoder is required. Main10 needs level 5.
  - **Levels:** the maximum across decoders.
  - **DV P7:** needs more than 1 HEVC decoder instance.
  - **Fire TV quirks:** AFTKRT, AFTKA, AFTKM, AFTMA08C15 and AFTMM have quirks: Hi10P 5.2, the EAC3-in-TS bug and the DV+HDR10+ bug.
  - **Web:** MediaCapabilities only.
- **PB-13 External player** (android-only; 05 sec 12.2). *Source:* `W/ui/playback/PlayExternalPage.kt:86-379`.
  - **Non-playable item:** errors (no queue is built). A null source hangs.
  - **Subtitles:** format from the path extension (default srt), with the chosen subtitle last.
  - **Position from the result:** VLC `extra_position` (Long), mpv/MX/Vimu `position` (Int). An unknown result code toasts "Unknown result from external player".
  - **Relaunch:** a `launched` flag prevents relaunch.
  - **Start report:** canSeek=false, DIRECT_PLAY.

## 8. Settings / data / setup (06, 07)

### Medium
- **ST-1 Login attempt counter** (port; 06:431). *Source:* `W/ui/setup/SwitchUserViewModel.kt:76,186-189,234-242,318-330`, `SwitchUserContent.kt:243-350`.
  - **What counts:** `loginAttempts` increments only via `setError`, that is, non-401 password errors ("Error during login") and any Quick Connect error. A **401 "Invalid username or password" does not count**, so wrong passwords alone never show "Trouble logging in?".
  - **Reset:** the counter resets when the dialog opens. The error clears when the dialog opens and on each password keystroke.
  - **Invalid styling:** the username and password fields show it while the state is Error.
  - **Dialog closed:** an error shows a long toast "Error: {msg}".
  - **Quick Connect:** polling has no timeout. A 401 disables Quick Connect.

### Low
- **ST-2 Server card states** (adapt; 06 sec 5.3-5.4). *Source:* `W/ui/setup/ServerList.kt:150-200`, `SwitchServerContent.kt:170-210`.
  - **Warning branch:** `status is Error || versionSupported != SUPPORTED` is checked first. `versionSupported` resets to UNKNOWN when Pending, so the spinner branch is effectively unreachable.
  - **"Current" alpha:** never applies on the server picker.
  - **Add-server Submit:** stays disabled after an error until the text changes (IME Go still submits).
- **ST-3 PIN entry has no correction** (adapt; 06 sec 5.6). *Source:* `W/ui/setup/PinEntry.kt:44-130`.
  - **Input:** only arrows and digits append, on key-up. There is no backspace.
  - **Verification:** happens on every append.
  - **Create:** Enter confirms, even when empty. The confirm hint is hidden in the remove variant.
  - **Web:** add Backspace.
- **ST-4 Max-bitrate formatting** (port; 06, 05). *Source:* `W/ui/Formatting.kt:212-217`.
  - With `MEGA_BIT=1048576`: below it -> "{b/1024} kbps"; otherwise "{b/MEGA_BIT} Mbps", both with integer division.
- **ST-5 Special preference rows** (adapt; 06 sec 3.2/3.7). *Source:* `W/ui/preferences/PreferencesContent.kt:352-540`.
  - **Update row:** the title is "Install update" / "Check for updates" / "No update available". Long-press opens the updater.
  - **ClearImageCache:** summary "Disk: {n}mb, Memory: {u}mb/{m}mb".
  - **Protect profile:** the value is derived as login > PIN > None. Errors show "Error: …".
  - **Seerr summary:** Server error / Add server / Enabled.
  - **Experimental switch:** turning it ON asks for confirmation.
  - **Screen:** opens with fade+slide and restores the last focused (group, index).
- **ST-6 Preferred-language options** (port; 06 sec 3.6). *Source:* `W/ui/preferences/user/UserPreferencesViewModel.kt:68-133`.
  - **When built:** empty until the cultures load and the user ids match.
  - **Cultures:** those with no 3-letter code are dropped.
  - **Values:** `""` = use profile; `_any-language` = any; otherwise the 3-letter code. An unknown stored code falls back to the profile.
  - **Subtitle-mode summary:** "Use your profile setting - {mode}" only when the server has a mode.
- **ST-7 Defensive decoding of stored JSON** (port; 06 ~line 328). *Source:* `W/data/AppDatabase.kt:118-140`.
  - **Bad filter JSON:** becomes an empty filter.
  - **Bad viewOptions JSON:** becomes null, so the defaults or the inherited options apply.
  - **Unknown keys:** ignored.
  - **Unknown sort or order names:** null.
  - **Web:** the IndexedDB reader needs the same rules.
- **ST-8 Fresh-install migrations** (android-only, but the resulting defaults are port; 06 sec 2.1). *Source:* `W/services/AppUpgradeHandler.kt:98-331`, `SwitchSeerrViewModel.kt:224`.
  - **Values a fresh install ends up with:** music `showBackdrop/Lyrics/AlbumArt=true`, `showVoiceSearchButton=true`, display toggles at their defaults, `useSeparateHdr = shouldEnableSeparateHdrToggle()`, the P7 override migration, and `preferAc3Surround` only if experimental is off.
  - **Seerr URLs:** a trailing `/api/v1` is stripped and a `/` ensured.
  - **Data migrations:** PLC -> STC (batches of 100), remembered tabs, and the most recent server.
- **ST-9 Subtitle style extras** (android-only; 06 sec 3.5). *Source:* `W/ui/preferences/subtitle/SubtitleSettings.kt:433-447`, `SubtitleStylePage.kt:39-55`.
  - **`shouldEnableSeparateHdrToggle`:** true if already separate; false if the SDR style equals the HDR style; else true only if the HDR style differs from the defaults.
  - **HDR page:** switches the window to HDR colour mode. The HDR group is offered only on displays that report HDR.
- **ST-10 Version comparison** (adapt; 06 ~line 463). *Source:* `W/util/Version.kt:1-110`.
  - **Format:** `v?MAJOR.MINOR.PATCH(-N-gSHA)`.
  - **Ordering:** compare major, minor, patch, then N (null = 0).
  - **toString:** omits the suffix unless N>0 and a hash exists.
- **ST-11 Release-notes text** (adapt; 06 ~line 315). *Source:* `W/services/UpdateChecker.kt:295`.
  - **Version:** the release name is parsed as the version; the release is ignored if that fails.
  - **Notes:** `<!-- app-note:(.+) -->` comments are extracted.
  - **Text:** `"# {version}\n" + notes + body`.
  - **Clean-up:** PR URLs become `#n`, and the "**Full Changelog**" line is removed.
- **ST-12 "Send media info" payload** (adapt; 03 sec 14.2 / 07). *Source:* `W/services/ServerReportService.kt:33`.
  - **Request:** `POST /ClientLog/Document`.
  - **Body:** a header (server version, client, device), then `playbackPrefs=`, `experimental=`, `mediaSources=<json>` (refetched if missing) and `deviceProfile=<json>`.
  - **Success:** toast "Sent! Filename={FileName}".
- **ST-13 Debug page contents** (android-only; 06 Debug page). *Source:* `W/ui/detail/DebugPage.kt:36-615`.
  - **Sections:** app, device and display-mode tables; audio outputs; an 8-row HDR capability table; saved ItemPlayback rows; the preferences dump; server, user and config; and the last 500 logcat lines.
  - **Log colours:** D #2bc4cf, I #2bcf8b, W #dde663, E #e67063.
  - **Web:** substitute MediaCapabilities results, local stream choices and a console buffer.

## 9. Cross-cutting

### Low
- **CC-1 `listToDotString` and segment labels** (port; 03 sec 1, 05 skip segments). *Source:* `W/ui/Formatting.kt:231-269`.
  - **Separator:** `"  •  "` (two spaces, bullet, two spaces).
  - **Ratings:** community `%.1f` plus a star; critic `n%` plus fresh (>=60) or rotten.
  - **Segment labels:** each MediaSegmentType has a name string and a "Skip …" string.
  - **`formatTime`:** follows the 12/24h setting (web: `Intl` `hour12`).
- **CC-2 Image loading policy** (adapt; 05 trickplay, 06 image cache). *Source:* `W/ui/CoilConfig.kt:36-134`.
  - **Crossfade:** globally off.
  - **Connectivity:** always "online".
  - **Disk cache:** below the minimum -> the 200 MiB default.
  - **Trickplay:** `/Trickplay/` URLs always prefer the cache. Tiles are cropped at `(i % cols, i / cols)`.

---

## Ten gaps most likely to be noticed by users if left unported

1. **MU-1:** Now Playing shows no album art, backdrop or lyrics, because of the wrong music preference defaults in 04.
2. **SE-2:** a Seerr TV request sends the wrong season list (already-available seasons included).
3. **SE-1:** clicking "Pending" on a TV show does nothing, instead of opening the season editor.
4. **PB-1 / PB-2:** HDR override settings do not change what the server transcodes (wrong or missing range types), which gives failed or needlessly transcoded HDR/DV playback.
5. **PB-3:** an infinite black spinner when PlaybackInfo returns no media sources.
6. **BR-9:** a Favorites tab vanishes ("Invalid tab") after a filter or un-favorite.
7. **BR-6:** a Recommended tab spins forever when every configured row is empty.
8. **BR-8:** watched marks and progress on the Series Overview episode strip go stale after returning from playback.
9. **MU-2:** "Add to queue" on an album or artist adds one item or misbehaves, instead of appending all songs and starting playback.
10. **PB-4:** a successfully downloaded subtitle reports "taking too long" and is not switched to.
