# 03 - Library browsing and detail pages (Wholphin spec for web port)

Source: `reference/wholphin/app/src/main/java/com/github/damontecres/wholphin/` (abbreviated `W/` below). Strings: `reference/wholphin/app/src/main/res/values/strings.xml` (abbr. `strings.xml`). All paths are relative to `W/` unless they start with `app/`.
Jellyfin SDK (Kotlin) method names are given with the REST endpoint they hit. Where the Kotlin SDK has typed requests (`GetItemsRequest`) the REST query parameter names follow the SDK's generated client (`node_modules/@jellyfin/sdk/lib/generated-client/api/*.d.ts`), which are mostly the lowerCamel Kotlin field names but NOT always: Kotlin `is4k`/`is3d` are REST `is4K`/`is3D` (`isHd` is unchanged), and `libraryApi.getResumeItems` hits `/UserItems/Resume`.

Out of scope here (other docs): home, live TV, music, photo slideshow, Seerr/discover, playback, settings.

---------------------------------------------------------------------------------------------------

## 0. Conventions, shared constants

### 0.1 Item field sets (`ui/UiConstants.kt:47-91`)
| Name | Jellyfin `fields=` values |
|---|---|
| `SlimItemFields` (grids, rows) | `Overview, SortName, MediaSourceCount, CanDelete` |
| `ItemRowFields` (rows w/ season cards) | Slim + `PrimaryImageAspectRatio` |
| `DetailItemFields` (detail pages, playback) | `Overview, Trickplay, SortName, Chapters, MediaSources, MediaSourceCount, CanDelete, PrimaryImageAspectRatio` |
| `HomeItemFields` | `Overview, CanDelete` |
| `PhotoItemFields` | Detail + `Width, Height` |
| `ProgramItemFields` | Detail + `ChannelInfo` |

`DEFAULT_PAGE_SIZE = 100` (`UiConstants.kt:45`).

### 0.2 Card geometry constants (`UiConstants.kt:93-117`; `object Cards` :93, `object AspectRatios` :103, `enum class AspectRatio` :112)
- `Cards.HEIGHT_2X3_DP = 172` (poster card height in rows), `HEIGHT_EPISODE = 128`, `HEIGHT_LIVE_TV = 96`, played-progress bar height `6dp`.
- `AspectRatios`: WIDE 16/9, FOUR_THREE 4/3, TALL 2/3 (poster), SQUARE 1. `MIN = TALL` (card aspect is clamped to >= 2/3 via `coerceAtLeast(MIN)`).
- Colors: TransparentBlack25 `#40000000`, 50 `#80000000`, 75 `#BF000000`; GoldenYellow `#DAB440`.

### 0.3 Image URL rules (`services/ImageUrlService.kt`)
All image URLs are `GET {server}/Items/{itemId}/Images/{ImageType}` with query `quality=96` (constant `QUALITY`), `fillWidth`, `fillHeight`, `tag` (image tag, cache-busting). Selection rules per requested `ImageType` (`getItemImageUrl(itemId,itemType,...)`, lines 20-168):
- **LOGO**: for EPISODE/SEASON with a `seriesId` -> the *series'* logo (tag = `parentLogoImageTag` only if `parentLogoItemId == seriesId`); otherwise the item's own `imageTags[Logo]`.
- **BACKDROP**: EPISODE/SEASON with seriesId -> series backdrop (tag = first of `parentBackdropImageTags` if `parentBackdropItemId == seriesId`); else first of the item's `backdropImageTags` if any; else `null` (no image).
- **THUMB** (in order): (a) `useSeriesForPrimary` && parentThumbItemId && type is EPISODE/SEASON -> parent's Thumb (tag `parentThumbImageTag`); (b) `useSeriesForPrimary` && parentBackdropItemId && EPISODE/SEASON -> parent's Backdrop; (c) SEASON with parentThumbItemId and no own Thumb tag -> parent thumb; (d) `useSeriesForPrimary` && no parentThumbItemId && EPISODE && no own Thumb -> episode's Primary; (e) no own Thumb tag but backdrops exist -> own first Backdrop; (f) own Thumb.
- **PRIMARY / BANNER**: `useSeriesForPrimary` && seriesId && EPISODE/SEASON -> series' Primary (tag = `seriesPrimaryImageTag`); SEASON with seriesId and no own Primary -> series' Primary; else own.
- Anything else -> own image with own tag.
`useSeriesForPrimary` is a flag stored on each `BaseItem` (set `true` by library grids, recommended rows, `CollectionFolderView(useSeriesForPrimary = true)` default; `false` by default constructor). Consequence: episodes in library grids/rows show the **series poster** and seasons show the series poster when they lack one.
Genre cards use a random item's BACKDROP (see 4.5). Studio cards use the studio's THUMB.

### 0.4 Text formatting helpers (`ui/Formatting.kt`, `ui/Extensions.kt`, `data/model/BaseItem.kt`) - the rules a port must reproduce
- **Rounded minutes**: `Duration.roundMinutes = (duration + 30s).inWholeMinutes` (`Extensions.kt:231`). Ticks -> duration: `ticks / 10_000_000` s (Kotlin `.ticks`).
- **formatDuration** (`Formatting.kt` `Resources.formatDuration`): components h/m/s; strings `"%dh %dm %ds"`, `"%dh %dm"`, `"%dh %ds"`, `"%dh"`, `"%dm %ds"`, `"%dm"`, `"%ds"` (`strings.xml:29-35`). Display runtime = `formatDuration(roundMinutes(runTimeTicks))` and only shown when rounded > 0. E.g. 2h 3m 40s -> `2h 4m`; 90 min -> `1h 30m`; 45 min -> `45m`; exactly 2h -> `2h`.
- **Time left**: `data.timeRemaining` is computed client-side by a Kotlin extension (`ui/Extensions.kt:243-251`), not by the server/SDK: `timeRemaining = (userData.playbackPositionTicks > 0 && runTimeTicks != null && runTimeTicks - playbackPositionTicks > 0) ? (runTimeTicks - playbackPositionTicks) : null`. It is null at position 0 and when the position is at/past the end (then `timeRemainingOrRuntime` falls back to the full runtime, `BaseItem.kt:102-107`). Rounded to minutes -> `"%s left"` (`strings.xml:155`), appended after runtime in `quickDetails.basic`.
- **Ends at**: `QuickDetails` (`ui/components/QuickDetails.kt`): if `timeRemaining != null` -> `TimeRemaining(remaining)` = `EndsAt(now + remaining seconds)`; else if `endsAt != null` -> `EndsAt(endsAt)`. Rendered `"  •  Ends at %s"` (`strings.xml:46`) where `%s` = locale/12-24h device time-of-day (`formatTime`, `Formatting.kt:36-51`). `now` is `LocalClock` (ticking clock). Callers pass `timeRemaining = item.timeRemainingOrRuntime` = `data.timeRemaining ?: runTimeTicks` (null for PROGRAM), so a not-started movie "ends at" = now + full runtime, and a partially watched one = now + remaining.
- **Dot separator**: `"  •  "` (two spaces, bullet, two spaces) (`Formatting.kt` `dot()`).
- **Date**: `DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)` in default locale, e.g. `Aug 24, 2000` (`formatDateTime`). (Known bug note in source: server UTC date converted to local so can be a day early; port should format date-only values without TZ shift.)
- **Season/episode label**: `S%d E%d` (`season_episode_number`), range `S%d E%d-E%d`, padded `S%02dE%02d` / `S%02dE%02d-E%02d`; null if season or episode index is null. `formatEpisodeNumber(n)` = `E%d`; `formatSeasonNumber(n)` = `Season %d`.
- **Series years** (`seriesProductionYears`): requires `productionYear`; `"{year}"`; if `status == "Continuing"` -> `"{year} - Present"` (`series_continueing`="Present"); if `status == "Ended"` and `endDate.year != productionYear` -> `"{year} - {endDate.year}"`.
- **abbreviateNumber(n)**: <1000 -> integer; else divide by 1000 up to 3 times, format `"%.1f"` + suffix `K|M|B` (5533 -> `5.5K`). Used for unplayed counts on cards.
- **Community rating**: `String.format("%.1f")` + star icon (filled star, colour `FilledStarColor`). **Critic rating**: `"{toInt}%"` + RT icon: >= 60 -> "fresh" tomato, else "rotten" splat. **Official rating**: plain text. Each is prefixed with the dot separator inside its own annotated string and shown according to interface-customization toggles `DisplayToggle.OFFICIAL_RATING / COMMUNITY_RATING / CRITIC_RATING` (`QuickDetails.kt:28-40`; toggles live in settings, default all on).
- **`BaseItem.ui.quickDetails.basic`** (the joined detail line, `BaseItem.kt:142-259`), joined with the dot separator, per type:
  - EPISODE: `seasonEpisode` ("S2 E5"), then premiere date (medium format).
  - SEASON: `"{childCount} episodes"` (plural `episodes_count`) then `productionYear`.
  - SERIES: `seriesProductionYears`.
  - PHOTO: productionYear else premiere date `toLocalDate().toString()` (ISO).
  - BOX_SET: `productionYear`, `"{childCount} items"` (literal English string).
  - PROGRAM: channelName; if `isSeries` -> seasonEpisode + premiere date; else productionYear.
  - else (movie, video etc.): `productionYear`.
  - Then for all: runtime (`formatDuration(roundMinutes)`, only if > 0), then `"{timeRemaining} left"` if `timeRemaining` present.
  - Order of the full quick-details row: `basic` | official rating | community rating | critic rating | ends-at.
- **Card subtitle** (`BaseItem.subtitle`): EPISODE -> `"{S# E#} - {episode name}"`; SERIES -> series years; AUDIO -> `"{album} - {artists}"`; MUSIC_ALBUM -> `"{albumArtist|artists} - {year}"`; else `productionYear`. **Card title** = EPISODE ? `seriesName` : `name`.
- **subtitleLong** (episode headers): `"S02E05 - {name} - {premiere date}"` (padded form), non-episode -> year.
- **Episode corner text** (`episodeCornerText`, `BaseItem.kt:115-141`): exists only for EPISODE: `E{indexNumber}`, else (indexNumber null) the premiere date (medium format); null for every other type. **Unplayed corner** (`episodeUnplayedCornerText`): EPISODE -> `E{n}` (no premiere-date fallback); SERIES/SEASON/BOX_SET -> `abbreviateNumber(userData.unplayedItemCount)` if > 0.
- **Resolution badge** (`ui/util/StreamFormatting.resolutionString`): vertical video swaps w/h. Rules in order (width, height): `w>5120||h>4320` "8K"; `w>2560||h>1440` "4K"; `w>1920||h>1080` "1440"+p/i; `w>1280||h>962` "1080"+p/i; `w>1024||h>576` "720"+; `w>960||h>544` "576"+; `w>845||h>480` "540"+; `w>720||h>404` "480"+; `w>682||h>384` "404"+; `w>640||h>360` "384"+; `w>426||h>240` "360"+; `w>256||h>144` "240"+; else `"{height}"`+p/i. Suffix `i` if `isInterlaced` else `p`. NOTE 4K/8K have no p/i suffix.
- **HDR/Dolby**: `formatVideoRange`: videoRange UNKNOWN/SDR/null -> none. HDR: if `videoDoViTitle` non-blank -> "Dolby Vision"; else by `videoRangeType`: HDR10 -> `HDR10`, HDR10_PLUS -> `HDR10+`, HLG -> `HLG`, any DOVI* -> "Dolby Vision", DOVI_INVALID -> "Invalid Dolby Vision" (string `dolby_vision_invalid`, `strings.xml:989`), UNKNOWN/SDR -> none. Video label = `"{resolution} {range}"` (space-joined, either may be null).
- **Audio codec label** (`formatAudioCodec`): profile contains "Dolby Atmos" (ci) -> "Dolby Atmos"; profile contains "DTS": contains "X" -> "DTS:X", contains "MA" -> "DTS:HD MA", contains "HD" -> "DTS:HD", else "DTS"; else by codec lowercase: truehd -> "TrueHD", ac3 -> "DD", eac3 -> "DD+", dca -> "DTS", ogg/opus/vorbis -> capitalised first letter, null -> null, else UPPERCASE codec. Literal strings (`strings.xml:397,495-501`): `dolby_atmos`="Dolby Atmos", `dts_x`="DTS:X", `dts_hd`="DTS:HD", `dts_hd_ma`="DTS:HD MA", `truehd`="TrueHD", `dolby_digital`="DD", `dolby_digital_plus`="DD+", `dts`="DTS" (`ui/util/StreamFormatting.kt:104-143`).
- **Subtitle codec label**: dvbsub -> "DVB", dvdsub -> "DVD", pgssub -> "PGS", subrip -> "SRT", null -> null, else UPPERCASE.
- **Stream display title** (`mediaStreamDisplayTitle`, `StreamFormatting.kt:148-176`): a plain space-joined list, no brackets or pipe: `[languageName(lang)] + (AUDIO: formatAudioCodec, channelLayout | SUBTITLE: "SDH" if hearing-impaired, formatSubtitleCodec | other types: language only)`. (Kotlin joins nulls as the literal "null"; the port must skip null codec label / channelLayout.) When `includeFlags` and any flag is set, append `" (" + flags.join(", ") + ")"` with flags in order Default, Forced, External (localized, only present ones). `languageName(code)` (`util/TrackSupport.kt:174-186`) = "Unknown" if code is null or `"und"`; else the locale's display language for the code (fallback `code.uppercase()` if the locale lookup throws).
- **Stream badges row** (`ui/components/VideoStreamDetails.kt`): chips with background `secondaryContainer @ 50% alpha`, radius 4dp, padding v4/h6, 12sp SemiBold, spacing 4dp. Chips in order: (1) video `"{res} {range}"` with suffix ` (+N)` where N = `numberOfVersions - 1` if > 0 (i.e. extra media-source versions); (2) video codec UPPERCASE (`videoStream.codec.uppercase()`); (3) audio chip with volume-high icon, text `"{language} {codecLabel} {channelLayout}"` (space-joined non-nulls) or "None" when `audioStreamCount == 0` or no audio stream is chosen; suffix ` (+N)` N = audioStreamCount-1; max width 200dp; (4) subtitle chip with closed-captions icon, max width 160dp, shown only if (embedded + external subtitle count) > 0: if a subtitle track is chosen -> `"{language} SDH? {codecLabel}"` + ` (+{count-1})`; if subtitles exist but none selected -> "None" with ` (+{count})` (the `disabled` flag only changes the suffix: `(+count)` instead of `(+count-1)`; nothing is dimmed, `VideoStreamDetails.kt:113-162,199-207`). No subtitle chip when no subtitle streams at all. The audio and subtitle chips start with a FontAwesome glyph (volume-high / closed-captioning) with a 2dp gap to the text; the audio text uses `languageName` (so "Unknown" for missing/und).

### 0.5 Item-kind -> destination (`BaseItem.destination()`, `data/model/BaseItem.kt:272-337`)
Resolved when a card is clicked:
1. `destinationOverride` if set.
2. If `data.extraType != null` or type TRAILER -> `Playback(itemId, positionMs=0)` (extras/trailers play directly).
3. EPISODE -> if `seasonId` and `seriesId` both present: `SeriesOverview(seriesId, SERIES, SeasonEpisodeIds(seasonId, parentIndexNumber, episodeId, indexNumber))` else `MediaItem(item)`.
4. SEASON -> if `seriesId`: `SeriesOverview(seriesId, SERIES, SeasonEpisodeIds(seasonId, indexNumber, null, null))` else `MediaItem`.
5. TV_CHANNEL -> `Playback(channelId)`; PROGRAM -> `Playback(channelId)` if channelId else MediaItem.
6. AUDIO -> `MediaItem(albumId, MUSIC_ALBUM, initialSongId=id)` if album known.
7. everything else -> `MediaItem(itemId, type, collectionType)`.
`Destination.MediaItem` -> `ui/nav/DestinationContent.kt:146-289` switch on `type` (table in 1.1). `Destination.SeriesOverview` -> `SeriesOverview` page (section 6).

---------------------------------------------------------------------------------------------------

## 1. Navigation / routing

### 1.1 `Destination` classes that lead to pages in this doc (`ui/nav/Destination.kt`)
| Destination | Fields | fullScreen | Page |
|---|---|---|---|
| `MediaItem(itemId, type: BaseItemKind, collectionType?, initialSongId?)` | | no | switch below |
| `SeriesOverview(itemId, type: BaseItemKind, seasonEpisode: SeasonEpisodeIds? = null)` (only `seasonEpisode` has a default; callers pass `SERIES`, `Destination.kt:64-70`) | | no | `SeriesOverview` (sec 6.2) |
| `FilteredCollection(itemId, parentType: GENRE|STUDIO, filter: CollectionFolderFilter, recursive, collectionType)` | | no | genre/studio grid (sec 4.5) |
| `ItemGrid<T>(title: StringProvider, request: T, requestHandler: RequestHandler<T>, initialPosition=0, viewOptions=ViewOptions())` | | no | generic "view more" grid (sec 4.6) |
| `MoreHomeRow(title, config: HomeRowConfig, initialPosition)` | | no | `HomeRowGrid` (sec 4.7) |
| `Favorites` (object) | | no | `FavoritesPage` (sec 11) |
| `Search(query="")` | | no | `SearchPage` (sec 12) |
| `Playback(itemId, positionMs, forceTranscoding=false, backend?, shuffle=false)` | | yes | playback (other doc) |
| `PlaybackList(itemId, filter=GetItemsFilter(), startIndex?, shuffle=false, recursive=false, sortAndDirection?)` | | yes | playback queue from a folder/collection |
| `Slideshow(...)` | | yes | photos (other doc) |

`MediaItem(item)` secondary constructor = `(item.id, item.type, item.data.collectionType)`.

### 1.2 `Destination.MediaItem` type switch (`ui/nav/DestinationContent.kt:146-289`)
Every branch with `onClearBackdrop` calls it on enter (the app-wide backdrop layer is cleared); series/movie/episode details keep and set the backdrop.
| `type` | Page | Notes |
|---|---|---|
| SERIES | `SeriesDetails` (`ui/detail/series/SeriesDetails.kt`) | series landing page (seasons row etc.) - sec 6.1 |
| MOVIE | `MovieDetails` | sec 5 |
| VIDEO, MUSIC_VIDEO | `MovieDetails` (same page, "TODO Use VideoDetails") | |
| EPISODE | `EpisodeDetails` | sec 7 (only reached if season/series ids missing; normally episodes route to SeriesOverview) |
| BOX_SET | `CollectionDetails` | sec 8 |
| PLAYLIST | `PlaylistDetails` | sec 9 |
| COLLECTION_FOLDER | `CollectionFolder(usePostersOverride=null, recursiveOverride=null)` | library root; switch by `collectionType` (1.3) |
| FOLDER | `CollectionFolder(usePostersOverride=true, recursiveOverride=null)` | sub-folder -> posters |
| USER_VIEW | `CollectionFolder(usePostersOverride=null, recursiveOverride=true)` | |
| PERSON | `PersonPage` | sec 10 |
| PHOTO_ALBUM | photo album grid (other doc) | |
| MUSIC_ALBUM / MUSIC_ARTIST / AUDIO | music pages (other doc) | |
| other | text "Unsupported item type: X" | |

### 1.3 `CollectionFolder(...)` by `collectionType` (`DestinationContent.kt:434-536`)
| CollectionType | Page | Params |
|---|---|---|
| TVSHOWS | `CollectionFolderTv` (tabs, sec 2.2) | |
| MOVIES | `CollectionFolderMovie` (tabs, sec 2.1) | |
| BOXSETS | `CollectionFolderGeneric(usePosters=true, recursive=false, playEnabled=false, sortOptions=MovieSortOptions)` | |
| PLAYLISTS | `CollectionFolderPlaylist(recursive=true)` -> `CollectionFolderView(ViewOptionsSquare, sort=PlaylistSortOptions, playEnabled=false)` | |
| LIVETV, MUSIC, HOMEVIDEOS, PHOTOS | other docs | |
| MUSICVIDEOS, BOOKS | `CollectionFolderGeneric(usePosters = override ?: false, recursive = override ?: false, playEnabled=true)` | |
| FOLDERS, TRAILERS, UNKNOWN, null | `CollectionFolderGeneric(usePosters = override ?: false, recursive = override ?: false, playEnabled=false)` | |

`CollectionFolderGeneric` (`ui/detail/CollectionFolderGeneric.kt`): wraps `CollectionFolderView` with `defaultViewOptions = usePosters ? ViewOptionsPoster : ViewOptionsWide`, default `sortOptions = VideoSortOptions`, default `filterOptions = DefaultFilterOptions`, `showTitle = showHeader` (title shown only while the focused index is in the first row), `initialFilter = filter` (default empty `CollectionFolderFilter()`).

Where do the destinations come from in the nav drawer? (drawer is another doc) `NavDrawerService` builds `Destination.MediaItem(it.itemId, it.type, it.collectionType)` using the item's real `BaseItemKind` (not always COLLECTION_FOLDER), except recording folders, which become `Destination.Recordings(itemId)` (a separate destination rendered by `CollectionFolderRecordings`, `DestinationContent.kt:320-324`; live-TV doc) (`services/NavDrawerService.kt:200-216`). `Playback`/`PlaybackList` render the external-player page when the backend is EXTERNAL_PLAYER (`Playback` also honours `destination.backend`) (`DestinationContent.kt:83-112`).

---------------------------------------------------------------------------------------------------

## 2. Library page: tabs per collection type

All tabbed library pages use `TabbedPage` (`ui/components/TabbedPage.kt`) + `TabRow`.

### 2.1 Movies library (`ui/detail/CollectionFolderMovie.kt`)
Tabs in order (string): **Recommended**, **Library**, **Collections**, **Genres** (`R.string.recommended/library/collections/genres`).
| idx | Content |
|---|---|
| 0 Recommended | `RecommendedMovie(parentId)` (sec 3.1). `onFocusPosition = pos -> showHeader = pos.row < 1` (tab row hides when focus is below the first row) |
| 1 Library | `CollectionFolderView(itemId, viewModelKey="{id}_library", initialFilter = CollectionFolderFilter(filter = GetItemsFilter(includeItemTypes=[MOVIE])), recursive=true, sortOptions=MovieSortOptions, defaultViewOptions=ViewOptionsPoster, playEnabled=true, showTitle=false)` + default `filterOptions=DefaultFilterOptions` |
| 2 Collections | same but `viewModelKey="{id}_collection"`, `includeItemTypes=[BOX_SET]`, `sortOptions=VideoSortOptions`, `playEnabled=false` |
| 3 Genres | `GenreCardGrid(itemId, includeItemTypes=[MOVIE], collectionType=MOVIES)` (sec 4.5) |
`onClickItem` = `navigate(item.destination())`. Tab row hidden when `grid position >= columns` (scrolled past first row) via `positionCallback { columns, pos -> showHeader = pos < columns }`.
**Gotcha**: Library and Collections tabs have different `viewModelKey` (separate view-model state) but the same `itemId`, so **both read/write the same persisted `LibraryDisplayInfo` row** (key = library item id; see 3.4). Sort/filter/viewOptions set in one tab are therefore saved over the other's. `includeItemTypes` from the tab's `initialFilter` takes priority (`merge` only fills unset fields).

### 2.2 TV Shows library (`ui/detail/CollectionFolderTv.kt`)
Tabs: **Recommended**, **Library**, **Genres**, **Studios**.
| idx | Content |
|---|---|
| 0 | `RecommendedTvShow` (sec 3.2) |
| 1 | `CollectionFolderView(initialFilter includeItemTypes=[SERIES], recursive=true, sortOptions=SeriesSortOptions, filterOptions=DefaultTvFilterOptions, defaultViewOptions=ViewOptionsPoster, playEnabled=false)` |
| 2 | `GenreCardGrid(includeItemTypes=[SERIES], collectionType=TVSHOWS)` |
| 3 | `StudioCardGrid(includeItemTypes=[SERIES])` (sec 4.5) |

### 2.3 Tab behaviour (`TabbedPage.kt`, `TabRow.kt`, `services/RememberedTabService.kt`, `data/model/RememberedTab.kt`)
- `TabViewModel(itemId, tabCount)`: initial tab = remembered tab index (clamped to `0..<tabCount`) **only if** app preference `interfacePreferences.rememberSelectedTab` is true (default **false**, `AppPreference.kt:545-555`, proto field `remember_selected_tab`); else 0. While unresolved the state is `UNSET=-1234` and a delayed loading page shows.
- On tab change: `backdropService.clearBackdrop()`; if remember enabled -> save `RememberedTab(userId, itemId, index)` (local Room table; PK `(userId,itemId)`; `itemId` = the library's item id as string, for favorites it is `NavDrawerItem.Favorites.id`). Not synced to the server.
- Tab row: padding top 16dp, bottom 16dp, end padding 184dp if "show clock" preference is on else 0. Tab bar is collapsible (`AnimatedVisibility(expandVertically/shrinkVertically)`) driven by `showTabs`.
- TabRow is a horizontally-scrolling `LazyRow`; selected tab auto-scrolls to ~1/3.5 of viewport. D-pad entering the row from left focuses the last tab, from right the first tab, else the selected tab.
- Each tab's content has its own `FocusRequester`s; when a grid is empty focus goes back to that tab (`focusRequesterOnEmpty = tab.tabFocusRequester`).

---------------------------------------------------------------------------------------------------

## 3. Recommended tabs (movies / TV)

Shared `RecommendedViewModel` + `RecommendedContent` (`ui/components/RecommendedContent.kt`; the hero header also receives the `showClock`/`showLogos` interface prefs) and rows rendered by `HomePageContent` (home doc owns row layout; here: rows of cards with title, "View more" end card, hero header showing the focused item).

Per-row limit `limit = homePagePreferences.maxItemsPerRow` (default **25**, slider 5-50, `AppPreference.kt:156-168`). Each row = one REST call with `startIndex=0, limit=limit, enableTotalRecordCount=false`; rows load in parallel, each independently (error -> row error state). Page `loading` becomes Success only via a sequential join over the non-Suggestions row jobs: the first row that is Success AND non-empty flips it (`RecommendedContent.kt:116-151`; Suggestions are fetched separately at :143 and do not count). **If every non-Suggestions row is empty or errors, `loading` stays Loading forever (spinner), the Suggestions row is never shown and no empty/error page is rendered** - a port needs its own all-rows-done empty state (or timeout). Empty rows are hidden (and the tab-header-collapse row index subtracts empty rows before the focused row). A trailing **Suggestions** row (sec 3.3) is appended. `showViewMore = items.size >= limit` -> shows a "View more" card -> `Destination.ItemGrid(title, request, handler, initialPosition = row.items.size, viewOptions = ViewOptions(aspectRatio = rowViewOptions.aspectRatio))` (sec 4.6). `useSeriesForPrimary = true` for these items.

### 3.1 Movies "Recommended" rows (`ui/components/RecommendedMovie.kt:18-90`), in order
1. **Continue watching** - `GET /UserItems/Resume` (`libraryApi.getResumeItems`; query also allows `userId, searchTerm, mediaTypes, excludeItemTypes, imageTypeLimit, enableImageTypes`): `parentId, fields=SlimItemFields, includeItemTypes=[MOVIE], enableUserData=true, enableTotalRecordCount=false`.
2. **Recently Released** - `GET /Items` (`getItems`): `parentId, fields=Slim, includeItemTypes=[MOVIE], recursive=true, enableUserData=true, sortBy=[PremiereDate, SortName], sortOrder=[Descending, Ascending], enableTotalRecordCount=false, maxPremiereDate=now`.
3. **Recently added** - `parentId, Slim, [MOVIE], recursive, enableUserData, sortBy=[DateCreated] Descending`.
4. **Top Rated Unwatched** - `[MOVIE], recursive, isPlayed=false, sortBy=[CommunityRating] Descending`.
5. **Suggestions** (3.3).

### 3.2 TV "Recommended" rows (`ui/components/RecommendedTvShow.kt:22-110`; rows list at :28-110)
1. **Continue watching** - `GET /UserItems/Resume` with `includeItemTypes=[EPISODE]`.
2. **Next Up** - `GET /Shows/NextUp` (`showApi.getNextUp`): `fields=Slim, imageTypeLimit=1, parentId, enableResumable=false, enableUserData=true, enableRewatching = homePagePreferences.enableRewatchingNextUp`.
3. **Recently Released** - `getItems`: `[EPISODE], recursive, enableUserData, sortBy=[PremiereDate, SeriesSortName, AiredEpisodeOrder], sortOrder=[Desc, Asc, Desc], maxPremiereDate=now, isUnaired=false`.
4. **Recently added** - `[EPISODE], recursive, sortBy=[DateCreated] Desc`.
5. **Top Rated Unwatched** - `[SERIES], recursive, isPlayed=false, sortBy=[CommunityRating] Desc`.
6. **Suggestions** (type SERIES).

### 3.3 Suggestions row (`services/SuggestionService.kt`, `services/SuggestionsWorker.kt`)
Only for MOVIES and TVSHOWS libraries. Cached per `(userId, parentId, itemKind)` in a local cache (`SuggestionsCache`; also refreshed periodically by WorkManager). If no cache: an on-demand worker runs and row shows loading, then Empty if it yields nothing. Algorithm (`SuggestionsWorker.fetchSuggestions`), with `N = maxItemsPerRow`:
1. **History seed**: `getItems(parentId, userId, includeItemTypes=[EPISODE if series else kind], sortBy=[DatePlayed] (NO `sortOrder` is sent, so the server default **Ascending** applies: the seeds are the 3 *least* recently played of the 20 fetched, not the most recent; a port that sends Descending changes which genres are chosen - replicate or fix deliberately), isPlayed=true, limit=20, fields=[Genres], recursive=true, enableTotalRecordCount=false, imageTypeLimit=0)`; de-dupe by `seriesId ?: id`; take first 3 -> `seedItems`.
2. `genreIds` = distinct genre ids of the seeds; `excludeIds` = seeds' (series)ids.
3. Three parallel queries (all `recursive=true, isPlayed=false, includeItemTypes=[kind], enableTotalRecordCount=false, imageTypeLimit=0`):
   - **contextual** (only if genreIds non-empty): `sortBy=[Random], genreIds, excludeItemIds=excludeIds, limit = max(1, floor(N*0.4))`.
   - **random**: `sortBy=[Random], limit = max(1, floor(N*0.3))`.
   - **fresh** (the only query that sends `sortOrder=Descending`; contextual/random send none): `sortBy=[DateCreated] Descending, limit = max(1, floor(N*0.3))`.
4. `(contextual + fresh + random)` -> distinct by id -> filter out `excludeIds` (compared with `seriesId ?: id`) -> **shuffle** -> take N.
5. Display: ids cached (the cache holds only ids and is never TTL-expired, only replaced by the periodic worker), then fetched with `getItems(ids=[...], fields=[PrimaryImageAspectRatio, Overview])`; **the order shown is the server's order for the `ids` query, not the cached shuffled order**; a fetch failure maps to an Empty (hidden) row (`SuggestionService.kt:141-173`). Items are wrapped (`useSeriesForPrimary = (kind == SERIES)`). "View more" for Suggestions opens an `ItemGrid` with `GetItemsRequest(ids = shown ids)`.
Scheduling (`SuggestionsSchedulerService.kt:99-121`, `SuggestionsWorker.kt:81,158-167`): WorkManager periodic every 12 h (flex 1 h), initial delay clamped to 60-180 s, exponential backoff 15 min, network-connected constraint; the on-demand worker is unique per (user, parent, kind) with REPLACE policy and an `ApiClientException` there returns failure so the row ends Empty; fetches use `limitedParallelism(2)`.
(Web port may reimplement this client-side without WorkManager/cache; keep the 40/30/30 mix.)

### 3.4 Context menu / click on Recommended rows
Click -> `item.destination()`. Play remote button -> `Destination.Playback(item)` (resume position). Long-press -> context menu `ForBaseItem(showGoTo=true, showStreamChoices=false, canRemoveContinueWatching=false, canRemoveNextUp=false)` (full item list in 14.2). Choose-version/tracks/clear-chosen-streams are no-ops here. Overview dialog = `ItemDetailsDialog` with `showFilePath = currentUser.policy.isAdministrator` (file path shown to administrators only, `RecommendedContent.kt:455-464`). `canDelete = viewModel.canDelete(item, appPreferences)` (`:414-427`). A failing row shows its own error row; it does not remove the page.

---------------------------------------------------------------------------------------------------

## 4. Library grid ("Library" tab, generic folders, genre/studio filtered pages, ItemGrid)

Core composable: `CollectionFolderView` (`ui/components/CollectionFolderView.kt`) with `CollectionFolderViewModel` (one VM per `viewModelKey`, default = item id). Used by: movie Library + Collections tabs, TV Library tab, `CollectionFolderGeneric`, `CollectionFolderPlaylist`, `FilteredCollection` (genre/studio). Favorites (sec 11), person page (sec 10) use their own grids.

### 4.1 Layout (dp)
```
+--------------------------------------------------------------------------------------------+
| [TabRow: Recommended | Library | Collections | Genres]  pad t16 b16 r184(if clock)         |  tabbed libraries only; collapses when focus leaves first grid row
|                    Title  (displaySmall, centered, 1 line, ellipsis)                       |  GridTitle: only if showTitle (non-tab pages) and header visible
| [^ Name] [Filter(+n)] [View options]   <------ spacer ------>   [Random] [Play] [Shuffle]   |  row: start pad 16, end pad 16 (+24 if alphabet column), gap 8
| (optional "Show details" header, 200dp tall, pad top48/bottom32/start8)                    |
| +------+ +------+ +------+ +------+ +------+ +------+                              ( # )   |
| |poster| |poster| |poster| ... 6 cols default, spacing 16 ...                     ( A )   |  alphabet column: only when sort == Name
| | Title| | Title|                                                                  ( B )   |
| | sub  | | sub  |                                                                   ...    |
|                       [ 37 / 1204 ]  footer, bottom-center, bg #80000000, pad 4            |
+--------------------------------------------------------------------------------------------+
```
- Grid content padding vertical 16. Columns = `viewOptions.columns` (default 6); spacing = `viewOptions.spacing` (both axes). Card width px = `ceil((gridWidth - spacing*(columns-1)) / columns)` and is passed as `fillWidth` to the image URL.
- The header row (title + buttons) collapses (`expandVertically/shrinkVertically`) when the focused index >= `columns` (user is below row 1) and reappears on row 1; always visible while loading. In tabbed pages the tab row collapses on the same condition.
- Buttons, left group: **Sort** (text button: caret icon + sort name; only if `sortOptions` non-empty), **Filter** (icon button with active-filter count badge; "Filter" label when focused; only if `filterOptions` non-empty), **View options** (sliders icon; label when focused). Right group: **Random** (dice, "Random", disabled when list empty) and only if `playEnabled`: **Play** (play icon) and **Shuffle**. All icon buttons are "expandable": icon only until focused/hovered, then icon + label.
- Empty result: centered "No results" (`titleLarge`). Loading: centered spinner page. On any sort, filter or artist-source change `loadResults` sets `items=Loading` (and `backgroundLoading=Loading`) together, so the grid and its pager are replaced by the full-area centered 48dp `LoadingPage` (header row and buttons stay visible above it, since `showHeader` is forced true while items are not Success) until the new pager's page 0 is loaded. A 64dp overlay spinner exists in code but needs items Success + backgroundLoading Loading, so it never shows; do not build it (`CollectionFolderView.kt:378-392,1091-1094,1166`).
- Footer text `"{focusedIndex+1} / {total}"` (`?` when focusedIndex < 0) is shown only when the list is non-empty; for an empty list only the centered "No results" (`titleLarge`) appears, with no footer and no letter column (`CardGrid.kt:210-224,334-352`). Random, Play and Shuffle are all disabled (`enabled = listIsNotEmpty`) when the list is empty. Focus after load: context menu showing -> none; filter dropdown was open -> Filter button; returned from Random -> Random button; non-empty -> grid; empty -> the page's `focusRequesterOnEmpty` or the header (`CollectionFolderView.kt:1103-1114`).
- Error: `ErrorMessage` filling the area.

### 4.2 Initial load (`CollectionFolderViewModel.init`, lines 164-229)
1. `GET /Items/{itemId}` (`libraryApi.getItem`) -> the library/folder item. Page title = `filter.nameOverride ?: item.name ?: item.collectionType.name ?: "Collection"`.
2. Load saved display info from local DB: `LibraryDisplayInfoDao.getItem(user, collectionFilter.libraryDisplayInfoIdOverride ?: itemId)`.
3. If saved viewOptions are null and the item is a FOLDER (and no override id): `GET /Items/{id}/Ancestors?userId=` (`libraryApi.getAncestors`); use the first ancestor that has saved display info (sub-folders inherit the parent library's prefs).
4. `viewOptions = saved.viewOptions ?: ancestor.viewOptions ?: page defaultViewOptions`.
5. `sortAndDirection`: if `collectionFilter.useSavedLibraryDisplayInfo` (default true) `saved ?: ancestor`, else/fallback `initialSortAndDirection ?: SortName Ascending`.
6. `filter = (useSaved && saved.filter != null) ? pageFilter.merge(saved.filter) : pageFilter`. `merge` keeps the page's non-null values (notably `includeItemTypes`) and fills only unset ones from the saved filter; `override` always from the page.
7. `loadResults`: state.items=Loading -> build pager -> `pager.init()` (page 0 incl. total count) -> `getBlocking(0)` -> Success.

### 4.3 Items request (`createGetItemsRequest`, lines 513-567) = `GET /Items` (`libraryApi.getItems`)
```
parentId          = library/folder id
enableImageTypes  = Primary, Thumb, Backdrop, Logo
includeItemTypes  = filter.includeItemTypes   (the library's collectionType kinds are computed first but are then overwritten by filter.applyTo; null => no type restriction)
recursive         = per page (true: movie/TV Library & Collections tabs, USER_VIEW, playlists, genre/studio pages; false: BoxSets folder, generic folders unless USER_VIEW)
excludeItemIds    = [library id]
fields            = SlimItemFields (Overview, SortName, MediaSourceCount, CanDelete)
filter -> isFavorite, genreIds, minCommunityRating, personIds, isPlayed, studioIds, tags, officialRatings,
          years = years U every year in each selected decade [d..d+9],
          is4K/isHd/is3D/videoTypes (REST names; mapping below)
startIndex, limit(100), enableTotalRecordCount injected by pager
```
`sortBy`: if sort == `Default` -> omitted (server order; playlists/box sets). Else `[sort]` + `SortName` tie-breaker (unless sort is SortName) + `ProductionYear` if the library collectionType is MOVIES. `sortOrder` = `[direction]` + `Ascending` per tie-breaker added.
Video-type filter mapping: `4K` -> `is4K=true`; `HD` -> `isHd=true` else `SD` -> `isHd=false`; `3D` -> `is3D=true` (Kotlin `applyTo` sends these only when the option is selected, otherwise omitted; a port sending `is4k`/`is3d` would be ignored by the server); `Blu-Ray` -> `videoTypes=[BluRay]`; `DVD` -> `videoTypes=[Dvd]` (4K/HD/SD/3D are never sent in `videoTypes`).
`createPager` branches on `filter.override` (`CollectionFolderView.kt:432-495`): NONE -> the `GET /Items` request above; PERSON -> `GetPersonsRequest` (enableImageTypes Primary+Thumb; only `isFavorite` taken from the filter; page size 50); ARTIST -> `GetArtistsRequest` or `GetAlbumArtistsRequest` depending on the view option `artistSource`, applying only rating, favorite, genre, person, studio, tag, official-rating and year filters. Changing `artistSource` in View options re-queries when override == ARTIST (`:302-318`, `GetItemsFilter.kt:128-165`).

### 4.4 Paging / virtualization (`util/RequestPager.kt`, `util/ApiRequestPager.kt`)
- Page size **100**. `init()` fetches page 0 with `enableTotalRecordCount=true` -> `totalCount`. The list reports `size = totalCount` immediately; element `i` is `null` until page `i/100` is loaded; reading a null element triggers an async fetch (serialized by a mutex). Unloaded (null) slots still go through `GridCard`/`ItemCardImage` with a null url, so they render the fallback: a `surfaceVariant` tile with the centered video glyph (40% of the tile) and blank title/subtitle lines when titles are shown (`GridCard.kt:61-95`, `ItemCardImage.kt:68-77,150-190`).
- Cache of **8 pages** (Guava); evicted pages refetch on demand. UI `LazyVerticalGrid` with cache window ahead 2x / behind 0.5x viewport.
- `refreshItem(position,id)` after watched/favorite change: `GET /Items/{id}` and swap into the cached page. `refreshPagesAfter(position)` after delete: drop pages >= position/100 and refetch.
- Web: virtualized grid with `startIndex/limit=100` windows; total from first response.
- Items are wrapped `BaseItem(dto, useSeriesForPrimary)`; library grids pass `useSeriesForPrimary=true`.

### 4.5 Alphabet jump (letter picker)
- Shown whenever `sort == SortName`, regardless of direction (`CollectionFolderGrid.kt:96`); hidden otherwise but its width is reserved (14 + 2*2 + 16 dp) so cards do not resize. Letters `#ABCDEFGHIJKLMNOPQRSTUVWXYZ` (`strings.xml:64`). Each button: 14dp circle, `bodySmall`, 1.1dp vertical gap, 2dp horizontal padding. Current letter = first char of the focused item's `sortName` (server SortName, else name): 0-9 -> `#`, A-Z -> letter, any other char -> `#` (first char of the string). Opacity: picker unfocused: current letter 100% / others 25%; picker focused: 85%. Current letter gets filled circle (primary), others transparent. The column auto-scrolls to keep the current letter visible.
- Click a letter -> `positionOfLetter(letter)` = `GET /Items` with the same request as the grid plus `nameLessThan="{letter}", limit=0, enableTotalRecordCount=true, enableImageTypes=null, fields=null, enableUserData=false` -> `totalRecordCount` = target index. Scroll to index, focus it. Negative result -> no-op. (`/Persons` cannot do it -> disabled; artists use `/Artists` or `/Artists/AlbumArtists` with `nameLessThan`.)
- Physical keys A-Z jump the same way when sort == SortName (the key handler passes `unicodeChar.toChar()`, lowercase when unshifted, whereas picker clicks pass uppercase). **Quirk**: the jump index is the count of items with name < letter (an ascending-order index), so with SortName *Descending* a letter lands at the mirrored position; a port should replicate or fix it (descending: `total - count`).
- Genre/Studio grids: `GET /Genres` or `/Studios` with `parentId, nameLessThan, limit=0, enableTotalRecordCount=true, includeItemTypes` (genres) / `userId` (studios).
- Remote paging keys (Page Up/Down, channel +/-, media next/prev/FF/rewind) jump `jump1` items = `columns*6` (<2000 items) / `*15` (>=2000) / `*50` (>=7000) / `*500` (>=25000). `jump2` (only for never-shown jump buttons) `*20 / *50 / *200 / *2000`. Jump buttons themselves are disabled (`showJumpButtons=false`).
- Back key on grid with focus index > 0: scroll to item 0 and focus it (animated if within 6 rows). **Long-press Back**: return to previously focused index. Media Play / Play-Pause key on a focused playable item plays it.

### 4.6 Sort options per context (`ui/data/SortAndDirection.kt`)
`SortAndDirection(sort, direction)`; default `SortName Ascending`. In the dropdown, picking the current sort flips direction; picking another keeps the current direction. Leading caret icon on the active entry (up=ascending, down=descending). **Long-press on the sort button flips direction.** Re-applying Random re-rolls.
Labels: SortName/SeriesSortName "Name"; PremiereDate "Date Released"; DateCreated "Date Added"; DateLastContentAdded "Date Episode Added"; DatePlayed/SeriesDatePlayed "Date Played"; Random "Random"; CommunityRating "Community Rating"; CriticRating "Critic Rating"; OfficialRating "Parental Rating"; PlayCount "Play Count"; AiredEpisodeOrder "Aired Episode Order"; Runtime "Runtime"; Default "Default".
| List | Entries (order) |
|---|---|
| `MovieSortOptions` | SortName, PremiereDate, DateCreated, DatePlayed, CommunityRating, CriticRating, OfficialRating, Runtime, PlayCount, Random |
| `SeriesSortOptions` | SortName, PremiereDate, DateCreated, DateLastContentAdded, SeriesDatePlayed, CommunityRating, CriticRating, OfficialRating, Random |
| `EpisodeSortOptions` | SortName, PremiereDate, DateCreated, DatePlayed, AiredEpisodeOrder, CommunityRating, CriticRating, OfficialRating, Runtime, PlayCount, Random |
| `VideoSortOptions` | identical to Movie list |
| `PlaylistSortOptions`, `BoxSetSortOptions` | `Default` + Video list |
Picker: `rememberSortOptions(collectionType)` MOVIES->Movie, TVSHOWS->Series, MUSIC->Album(music doc), BOXSETS->BoxSet, else Video. By kind: MOVIE->Movie, SERIES/SEASON->Series, EPISODE->Episode, AUDIO->Song, MUSIC_ALBUM->Album, MUSIC_ARTIST->Artist, BOX_SET->BoxSet, else Video.
Note: the BOXSETS *library* folder passes `MovieSortOptions` explicitly (`DestinationContent.kt:468`), not BoxSet.

### 4.7 Persistence (`data/model/LibraryDisplayInfo.kt`, `data/LibraryDisplayInfoDao.kt`, `data/model/RememberedTab.kt`)
Local Room tables (not server): `LibraryDisplayInfo(userId:Int FK->JellyfinUser.rowId cascade, itemId:String, sort, direction, filter:GetItemsFilter JSON, viewOptions:ViewOptions? JSON)` PK `(userId,itemId)`; `RememberedTab(userId, itemId, index)` PK `(userId,itemId)`.
Saved on every sort change, filter change, view-options change, but only when `CollectionFolderFilter.useSavedLibraryDisplayInfo` is true (default true; true for genre/studio pages): `saveLibraryDisplayInfo` is a no-op otherwise, and the sort/filter restore (4.2) is gated the same way, whereas saved view options are read regardless (`CollectionFolderView.kt:190-196,283`). Key = `libraryDisplayInfoIdOverride ?: libraryItemId`; genre pages use `"{libraryId}_genres"`, studio pages `"{libraryId}_studios"`. Server-side `DisplayPreferencesService` (`GET/POST /DisplayPreferences/default?userId&client=Wholphin`, customPrefs map) is NOT used for library browsing (home config only). A web port should key local storage by `(serverId,userId,itemId)`.
View-option change resets saved grid position to 0 (`saveViewOptions`, `CollectionFolderView.kt:302`) and, if `showBackdrop` is off, clears the backdrop. **Sort and filter changes do NOT reset the saved position**: `CardGrid` takes `initialPosition = viewModel.position` clamped to `[0, size-1]` (`CardGrid.kt:121-124`) and focuses it when the new pager's grid is composed, so after a sort/filter change the grid reopens at the previously focused index (clamped to the new total), not at the top.

### 4.8 Filter UI and data (`data/filter/ItemFilterBy.kt`, `ui/components/FilterByButton.kt`, `services/FilterOptionCache.kt`)
`GetItemsFilter` (`null` = inactive): `favorite`, `genres[UUID]`, `minCommunityRating`, `officialRatings[String]`, `persons[UUID]`, `played`, `studios[UUID]`, `tags[String]`, `includeItemTypes[BaseItemKind]`, `videoTypes[FilterVideoType]`, `years[Int]`, `decades[Int]`, `override NONE|PERSON|ARTIST`.
Option lists (dropdown order):
| Set | Used for | Entries |
|---|---|---|
| `DefaultFilterOptions` | movie Library/Collections, generic folders, box sets | Played, Favorite, Genre, CommunityRating, OfficialRating, VideoType, Year, Decade |
| `DefaultTvFilterOptions` | TV Library | Played, Favorite, Genre, Studio, CommunityRating, OfficialRating, VideoType, Year, Decade |
| `DefaultForGenresFilterOptions` | genre result pages | Played, Favorite, Studio, CommunityRating, OfficialRating, VideoType, Year, Decade |
| `DefaultForStudiosFilterOptions` | studio result pages | Played, Favorite, Genre, CommunityRating, OfficialRating, VideoType, Year, Decade |
| `DefaultForFavoritesFilterOptions` | favorites | Played, Genre, CommunityRating, OfficialRating, VideoType, Year, Decade |
| `DefaultPlaylistItemsOptions` | playlist items | Played, Favorite, CommunityRating, OfficialRating, VideoType, Year, Decade |
Labels: Genre "Genres", Played "Played", Favorite "Favorites", OfficialRating "Parental Rating", VideoType "Video", Year "Year", Decade "Decade", CommunityRating "Community Rating", Studio "Studios". Multi-select (`supportMultiple`): all except Played, Favorite (CommunityRating is flagged `supportMultiple=true` (`ItemFilterBy.kt:208`) but is a single min-value).
Value sources (cache: in memory, key `(userId, parentId, filter)`, 16 entries, expire 1 h after write; parentId = the **library id** even on genre pages):
- Genre: `GET /Genres?parentId&userId` -> `(name, id)`.
- Studio: `GET /Studios?parentId&userId&includeItemTypes=Series` -> `(name, id)`.
- Played, Favorite: two static options with literal labels `True`, `False` (parsed with `toBoolean`).
- OfficialRating: `GET /Localization/ParentalRatings` (name->value) + `GET /Items/Filters?parentId&userId` (legacy; `officialRatings`) -> `(rating, value ?: 0)` **sorted ascending by numeric value**.
- VideoType: static `4K, HD, SD, 3D, Blu-Ray, DVD`.
- Year: `GET /Years?parentId&userId&sortBy=SortName&sortOrder=Ascending`, names parsed as ints (non-numeric dropped).
- Decade: same call, `floor(year/10)*10`, unique, ascending, label `"{d}'s"` (e.g. `1990's`).
- CommunityRating: static `1..10`, rendered as star + `"{n}+"`; value sent as `minCommunityRating`.
- Errors: toast "Error occurred: {msg}" and empty list.
Interaction: button opens menu 1 (filter names; active ones have leading check; if any active a red "Remove" with trash icon at top, then divider, clears all filters). Choosing a name opens menu 2 anchored right of it (offset 80,16dp): red "Remove" (clears that filter) + divider if active; spinner while loading; "No results" if empty; value rows with leading check when selected. Multi-select rows toggle membership (empty list -> null) and keep menu 2 open; Played and Favorite set the boolean and close menu 2 (menu 2 closes only when `!filterOption.supportMultiple`, `FilterByButton.kt:376-378`). CommunityRating sets `minCommunityRating = n` (re-selecting the same n keeps it set; there is no toggle-off) and keeps menu 2 open like the multi-select filters; the user clears it via the per-filter "Remove" row or the top-level Remove. Both `onSortChange` and `onFilterChange` save display info, then call `loadResults`, which sets items=Loading and builds a new pager (page 0 with total count, then `getBlocking(0)`); the `resetState` argument of `loadResults` is never read. Badge number = count of non-null filters among this page's option list.

### 4.9 View options dialog (`ui/components/ViewOptionsDialog.kt`)
Right-docked panel: width 256, max height 380, radius 8, no scrim, elevation-6 surface, title "View options" (titleMedium, centered, v-pad 8), scrollable list pad 16. Closing persists. `ViewOptions` (JSON) defaults: `columns=6, spacing=16, contentScale=FIT, aspectRatio=TALL, showDetails=false, showBackdrop=false, imageType=PRIMARY, showTitles=true, type=GRID, extras=None`.
Grid-mode rows in order: (Artist source, music only), **Layout** [Grid | List | Compact List], **Image type** [Primary | Thumb], **Aspect Ratio** [Poster (2:3) | 16:9 | 4:3 | Square (1:1)], **Show details** (switch), **Show backdrop** (switch), **Show titles** (switch), **Columns** (slider 1-12 step 1), **Spacing** (slider 0-32 step 2), **Default content scale** [Fit | None | Crop | Fill | Fill width | Fill height], **Reset** (restores the page's `defaultViewOptions`).
List/Compact-list rows: Layout, Show details, Show backdrop, Spacing, Reset.
Side effects: Image type Primary sets aspect TALL, Thumb sets WIDE. Layout sets spacing: Grid 16, List 4, Compact 2.
Defaults per page: `ViewOptionsPoster = {cols 6, spacing 16, FILL}`; `ViewOptionsWide = {cols 4, spacing 24, CROP, aspect WIDE}`; `ViewOptionsSquare = {cols 6, spacing 16, FILL, aspect SQUARE}`. By kind (`BaseItemKind.defaultViewOptions`): AUDIO/MUSIC_ALBUM/MUSIC_ARTIST/PLAYLIST -> Square; EPISODE/VIDEO/MUSIC_VIDEO/PHOTO/PHOTO_ALBUM/channels/programs -> Wide; else Poster.
Content scale -> CSS object-fit: FIT=`contain`, NONE=`none`, CROP=`cover`, FILL=`fill`, FILL_WIDTH/FILL_HEIGHT=scale to that axis.
Effects: **Show details** -> a `HomePageHeader` (height 200) above the grid for the focused item: logo (if `showLogos` pref) or title; EPISODE/SEASON title = series name with item name as subtitle; quick-details line (0.4); overview max 3 lines (2 for episode), fixed 400dp width; grid scrolls the focused row to top. **Show backdrop** -> focused item's backdrop becomes the page backdrop. **List mode**: `LazyColumn`, row gap = spacing; with details a left pane (33% width) shows logo/title, primary image (radius 8), quick-details, overview (5 lines). List row content by library type: MOVIES `ListItemMovie` (leading heart if favorite; title [dense: `"Title (Year)"`]; supporting = subtitle (non-dense); trailing = runtime + watched check); TVSHOWS `ListItemSeries` (dense title `"Title (years)"`; trailing = unplayed count, else watched check); MUSIC album variant; others `ListItemGeneric` (title, subtitle, trailing runtime). Row bg `surface@1dp elevation, 50% alpha`. List/Compact-list keyboard behaviour differs from the grid: no position footer, no paging keys, no physical A-Z keys, no Play-key handler; Back (focus in the list and position > 0) jumps to item 0 (animated scroll) (`CollectionFolderList.kt:117`); letter clicks use `positionOfLetter` and a negative result is ignored; the list top padding switches 8dp (first row) / 48dp (otherwise); the details pane always shows the logo regardless of the `showLogos` pref (`showLogo = true`, :147); `ListItemGeneric` also shows the leading favorite heart (`CollectionFolderList.kt:80-165,215-300,329-374`).

### 4.10 Grid card (`ui/cards/GridCard.kt`, `ui/cards/ItemCardImage.kt`)
Column gap 4: `Card` (transparent) > image box with `aspectRatio = max(viewOptions.aspect, 2/3)`, bg `surfaceVariant`, content scale per view options; below (if `showTitles`, animated) two centered 1-line texts: title (`bodyMedium` SemiBold; episode -> series name) and subtitle (`bodySmall` Normal). Long text marquees after 500 ms of focus. No image / load error: `surfaceVariant` block with centered video icon (40% size) (name text only if `useFallbackText`, off in grids).
Overlay (always): top-left: version-count pill (if `mediaSourceCount > 1`; rounded, `#80000000`, bodyMedium) + red heart (20sp) if favorite. Top-right: watched check badge (24dp circle, accent bg, white check, 0.5dp black border) if played and (`playedPercentage` is null/<=0/>=100); unplayed-count pill if `userData.unplayedItemCount > 0`. Bottom: 6dp progress bar (`tertiary`) of width `playedPercentage`% when 0<p<100.
Image request: `GET /Items/{id}/Images/{Primary|Thumb}?fillWidth={cardPx}&quality=96&tag=...` with series-fallback rules in 0.3.

### 4.11 Click / long-press / buttons on library grids
- Click -> `item.destination()` (0.5), grid position saved.
- Long-press -> `ContextMenu.ForBaseItem(fromLongClick=true, showGoTo=true, showStreamChoices=false, canDelete=mediaManagement&&item.canDelete (additionally false for RECORDING items unless the user has `enableLiveTvManagement`, `MediaManagementService.kt:57-72`), canRemoveContinueWatching=false, canRemoveNextUp=false)` -> items in 14.2. Handlers: watched/favorite -> API then refresh that grid slot; delete -> `DELETE /Items/{id}` then toast "Deleted" and refresh pages after position if the deleted item (or its series) is the item at that position; add-to-playlist dialog; "Media information" dialog; "Send media info log to server".
- **Random**: `idx = Random(0, total)`, fetch that index, navigate to `item.destination()` (photo -> slideshow). On back, focus returns to the Random button.
- **Play** (only if `playEnabled`): `Destination.PlaybackList(itemId=library id, startIndex=0, shuffle=false, recursive, sortAndDirection=current, filter=current)`; **Shuffle**: same with `shuffle=true`. Photo albums -> Slideshow. Queue building: 14.5.
- A BOX_SET parent plays its theme song while visible (`ThemeSongPlayer`).
- Grid index preserved in `SavedStateHandle` ("position") for back navigation.
- The Play key only acts on kinds where `BaseItemKind.playable` is true (EPISODE, MOVIE, MUSIC_VIDEO, TRAILER, VIDEO, LIVE_TV_CHANNEL, LIVE_TV_PROGRAM, PROGRAM, RECORDING, TV_CHANNEL, TV_PROGRAM); folders, series, seasons, box sets and audio do nothing (`ui/playback/PlaybackConstants.kt:40-80`).
- `CollectionFolderViewModel` also collects `MediaManagementService.deletedItemFlow`, so deleting an item elsewhere (e.g. a detail page) triggers the same `refreshAfterDelete` at the saved position (`CollectionFolderView.kt:218-224`).
- The unplayed-count pill on grid cards shows the raw integer (`unplayedItemCount.toString()`), not `abbreviateNumber` (`ItemCardImage.kt:248-262`).

### 4.12 Genre grid (`ui/components/GenreCardGrid.kt`, `ui/cards/GenreCard.kt`)
- Fixed **4 columns**, spacing 16, letter bar on, `CardGrid`. No sort/filter header. Focus goes to the first card on load.
- Data: `GET /Items/{libraryId}` (for the page name), then `GET /Genres` (`genreApi.getGenres`: `userId, parentId=libraryId, fields=SlimItemFields, includeItemTypes=[Movie] or [Series]`; no paging; all returned) -> `Genre(id, name, imageUrl=null, sortName=SortName ?: name)`. Cards appear immediately, images fill in afterwards.
- Image per genre (max 4 concurrent): `GET /Items?userId&parentId=libraryId&recursive=true&limit=1&sortBy=Random&fields=Genres&imageTypes=Backdrop&imageTypeLimit=1&includeItemTypes=...&genreIds={genreId}&enableTotalRecordCount=false` -> that item's first Backdrop at `fillWidth = (screenWidthDp - (2*16 + 3*16)) / 4`. Cache in memory per `(userId, parentId)` for 2 h (8 entries).
- Card: 16:9 box, radius 8; image (alpha .75) under a tint `rememberIdColor(genreId) @ 60%` (HSV from `uuid.hashCode()` - a Java Int, possibly negative - with Kotlin truncating `%` and `/`: h = hash%360, s = .6 + ((hash/360)%40)/100, v = .4 + ((hash/14400)%30)/100; h can be negative (it then falls in the `h < 60` branch) and s can drop below .6 / v below .4, so a port using positive modulo gets different colours. HSV->RGB: c = v*s, x = c*(1-|(h/60)%2-1|), m = v-c; branches h<60 (c,x,0), <120 (x,c,0), <180 (0,c,x), <240 (0,x,c), <300 (x,0,c), else (c,0,x); channels = value+m clamped to [0,1]; alpha applied by the card; a null id uses `surfaceVariant`; `ServerList.kt:57-95`); centered name `titleLarge` Bold, `onSurfaceVariant`, pad 16.
- Click -> `Destination.FilteredCollection(itemId=libraryId, parentType=GENRE, filter=CollectionFolderFilter(nameOverride="{genre} {libraryName}", filter=GetItemsFilter(genres=[id], includeItemTypes), useSavedLibraryDisplayInfo=true, libraryDisplayInfoIdOverride="{libraryId}_genres"), recursive=true, collectionType)`. Long-press: nothing.

### 4.13 Studio grid (TV libraries only; `ui/components/StudioCardGrid.kt`, `ui/cards/StudioCard.kt`)
As genres but `GET /Studios` (`studioApi.getStudios`: `userId, parentId, fields=Slim, includeItemTypes=[Series]`); image = the studio's own THUMB `/Items/{studioId}/Images/Thumb?fillWidth&tag`; if absent/failed -> coloured name tile (`rememberIdColor @ 40%`). Click -> `FilteredCollection(parentType=STUDIO, filter.studios=[id], includeItemTypes, libraryDisplayInfoIdOverride="{libraryId}_studios", collectionType=UNKNOWN)`.

### 4.14 FilteredCollection page
`CollectionFolderGeneric(itemId=libraryId, filter, recursive=true, usePosters=true, playEnabled=true, filterOptions=(GENRE? DefaultForGenres : DefaultForStudios), sortOptions=rememberSortOptions(collectionType))`. Title = `nameOverride` (e.g. "Action Movies"). Saved sort/filter/viewOptions are per `"{libraryId}_genres"` / `"_studios"`. For studio pages `collectionType=UNKNOWN` so sort list = Video list.

### 4.15 Generic `ItemGrid` ("View more"; `ui/components/ItemGrid.kt`) and `MoreHomeRow` (`ui/detail/HomeRowGrid.kt`)
`ItemGrid`: `Column { GridTitle(title); CardGrid(...) }`. Data: `ApiRequestPager(api, destination.request, destination.requestHandler, useSeriesForPrimary=true)`, page size 100, initial `getBlocking(0)`; first item index `destination.initialPosition` (= number of items already shown in the originating row) is scrolled to/focused. Columns = `viewOptions.columns` (default 6), spacing = `viewOptions.spacing`, aspect = `viewOptions.aspectRatio`; `GridCard` default content-scale Fit, titles shown. No sort/filter/letter bar. Click -> `item.destination(index)`; long-press -> `ForBaseItem(showGoTo=true, showStreamChoices=false)` context menu; Play key -> `Playback(item)`.
`MoreHomeRow(title, config: HomeRowConfig, initialPosition)`: same visual grid but uses the row-config's `viewOptions`: card image type/aspect/contentScale/spacing from config, `columns = (aspectRatio > 1 ? 4 : 6)`, titles always on; data via `HomeDataService.fetchDataForRow(row, limit=1000, usePaging=true)`; Genres/Studios configs render `GenreCardGrid`/`StudioCardGrid` with `includeItemTypes=null`. Home doc owns row config details.

---------------------------------------------------------------------------------------------------

## 5. Movie detail page (also Video / MusicVideo) - `ui/detail/movie/MovieDetails.kt`, `MovieDetailsHeader.kt`, `MovieViewModel.kt`

Reached by `Destination.MediaItem(id, MOVIE | VIDEO | MUSIC_VIDEO)` (VIDEO/MUSIC_VIDEO reuse this page).

### 5.1 Data fetches (`MovieViewModel.init`, re-run on every `ON_RESUME`)
1. **Item**: `GET /Items/{id}` (`libraryApi.getItem(itemId)`; user-scoped; returns full DTO incl. `MediaSources`, `Chapters`, `People`, `Genres`, `Studios`, `Taglines`, `RemoteTrailers`, `LocalTrailerCount`, `UserData`, `ImageTags`, `BackdropImageTags`, `CanDelete`, `PartCount`...). Errors -> full-page `ErrorMessage`.
2. **Chosen streams** (local DB + prefs; see 5.5) -> badges row.
3. **Remote trailers** from `item.RemoteTrailers` (sync, no call): each `{name, url}`; `name ?: "Trailer"`; subtitle "YouTube" if host is `youtube.com`/`www.youtube.com`; sorted: name containing "Official Trailer"/"Official Theatrical Trailer" -> rank 0; contains "Trailer" -> 1; other -> 5; contains "Teaser" -> 10 (Teaser checked before generic Trailer); ties by name.
4. Page shows as soon as 1-3 are done; backdrop set from the movie (`BackdropService.submit(movie)` -> `/Items/{id}/Images/Backdrop`).
5. Async, in parallel, each updating state when done:
   - **Local trailers**: only if `LocalTrailerCount > 0`: `GET /Items/{id}/LocalTrailers` (`libraryApi.getLocalTrailers`) -> `LocalTrailer(item)`; final list = local + remote.
   - **People**: `getPeopleFor(movie)`: for the DTO's `People` (BaseItemPerson list) chunk ids by 50 and `GET /Items?ids=...` (`libraryApi.getItems(ids)`) to read each person's `UserData.IsFavorite`. Person card: name, role text (5.7), image `GET /Items/{personId}/Images/Primary?tag={primaryImageTag}`.
   - **Extras**: `GET /Items/{id}/SpecialFeatures` (`libraryApi.getSpecialFeatures`) -> see 5.8.
   - **Discover** (Seerr): `seerrService.similar(movie)` (other doc; skipped if Seerr off).
   - **Similar** (only if state.similar empty): `GET /Items/{id}/Similar` (`libraryApi.getSimilarItems(GetSimilarItemsRequest(userId, itemId, fields=ItemRowFields, limit=25))`).
6. Theme song: on resume `themeSongPlayer.playThemeFor(itemId)` (plays the item's theme song audio if the pref is on; stops on pause/navigate).
7. `canDelete` = `mediaManagement pref enabled && item.CanDelete` (live recordings also need `enableLiveTvManagement`).
Chapters come from the item DTO (`Chapters`, sorted by `StartPositionTicks`).

### 5.2 Layout (LazyColumn, vertical gap 16, bottom pad 8)
```
backdrop (full-bleed, app-level)                                   
+--------------------------------------------------------------------------------------------+
| [pad top 48]                                                                               |
|  TITLE or LOGO (logo height 60, max w 320; title headlineMedium SemiBold max 2 lines)      |  width 75%, start pad 8
|  QuickDetails: 2021 • 2h 4m • PG-13 • 7.8★ • 92% 🍅 • Ends at 9:41 PM                      |  width 60% column, start pad 8
|  Genres: Action, Adventure, Sci-Fi, Drama, +2                                              |
|  [1080p HDR10] [H264] [🔊 English Dolby Digital 5.1 (+1)] [CC English SRT (+3)]            |  stream chips, top pad 4, bottom 16
|  "Tagline in italics"                                                                      |  bodyLarge italic
|  Overview text (3 lines max, clickable -> Media information dialog)                        |
|  Directed by Jane Doe, John Roe                                                            |
|  [pad bottom 16]                                                                           |
|  [▶ Play/Resume] [↺ Restart] [Version] [Watched] [Favorite] [Trailer] [Delete] [⋮ More]    |  ExpandablePlayButtons: gap 16, content pad 8
|  PEOPLE            (cards 108dp wide, circular 1:1 photo, name, role)                      |
|  CHAPTERS          (cards height 120, 16:9 default, name+time overlay)                     |
|  EXTRAS            (SeasonCard style, height 128, 16:9 default)                            |
|  MORE LIKE THIS    (height 172 for MOVIE, 128 for others)                                  |
|  DISCOVER          (Seerr; other doc)                                                      |
+--------------------------------------------------------------------------------------------+
```
Row order and conditions (constants `HEADER_ROW=0, PEOPLE_ROW=1, TRAILER_ROW=2, CHAPTER_ROW=3, EXTRAS_ROW=4, SIMILAR_ROW=5, DISCOVER_ROW=6`; trailer index only for focus restore - there is no trailer *row*, trailers are a button): header block always; **People** if non-empty; **Chapters** if non-empty; **Extras** if non-empty; **More like this** if non-empty; **Discover** if non-empty.
Images: backdrop (page background via `BackdropService`), logo (title area, if `showLogos` pref and the item has a Logo image tag, else text title), no poster on the movie page. Cast/chapters/extras/similar use their own images.
Vertical scroll: focusing any header control scrolls the header block back into view. Focus is restored to the last focused row on return (`rememberInt` position + `RequestOrRestoreFocus`).

### 5.3 Header content (`MovieDetailsHeader`)
In order, each with start padding 8:
1. `TitleOrLogo`: logo `GET /Items/{id}/Images/Logo?tag=` if pref `showLogos` and `ImageTags` contains Logo (for EPISODE/SEASON the series logo `parentLogoImageTag`), else `item.title` text. Falls back to text on image error.
2. `QuickDetails(movie.ui.quickDetails, movie.timeRemainingOrRuntime)` = `year • runtime [• N left]` + official rating + community rating star + critic rating + `Ends at {time}` (0.4).
3. Genres (`GenreText`): `bodyMedium`; first 4 joined with ", ", if more -> `", +{n-4}"`. Hidden if no genres.
4. Stream chips (`VideoStreamDetails(chosenStreams, numberOfVersions = MediaSourceCount ?: 0)`).
5. Tagline: first of `Taglines`, `bodyLarge` italic.
6. Overview: `OverviewText(maxLines=3)`; text box padded 8, rounded 8; focusable/clickable -> opens Media Information dialog (5.9); focus highlight `onPrimary @ 40%`.
7. "Directed by X, Y" (string `directed_by`) from `People` where `Type == Director`, names joined ", "; hidden if none. `bodyMedium`.

### 5.4 Button row (`ExpandablePlayButtons`, `ui/components/PlayButtons.kt`)
Horizontal row, spacing 16, content padding 8; each button is height 40dp min, icon 28dp (Fa icons 16sp in 32dp box), **label appears only on focus (web: show label always or on hover - see questions)**. Order and conditions:
1. **Play** (primary; initial focus). Title "Resume" if `UserData.PlaybackPositionTicks > 0` else "Play". Click -> `Destination.Playback(itemId, positionMs = resumePosition)` (0 if fresh).
2. **Restart** (mirrored refresh icon) only if resume position > 0 -> `Playback(itemId, 0)`. If focus was on Restart and it disappears, focus moves to Play.
3. **Version** (file-video icon) only if `mediaSources.size > 1` -> dialog "Choose Version" listing each source: headline = `source.name ?: path ?: id`; supporting = `"{videoStream.displayTitle}, {bitrate}"` (bitrate via `formatBitrate`); trailing = rounded-minute runtime; leading check mark on the currently chosen source. Select -> `savePlayVersion(itemId, sourceId)` (stored locally in `ItemPlayback` DB; refreshes chips; **does not start playback**).
4. **Watched toggle**: label "Mark as watched" (eye-slash icon) / "Mark as unwatched" (eye icon) -> `POST /UserPlayedItems/{id}` or `DELETE /UserPlayedItems/{id}` (`userDataApi.markPlayedItem/markUnplayedItem`), then refetch item.
5. **Favorite toggle**: label "Favorite" / "Unfavorite" (heart icon, red when favorited) -> `POST/DELETE /UserFavoriteItems/{id}` (`markFavoriteItem/unmarkFavoriteItem`), refetch item.
6. **Trailer** (film icon): always present for movies once trailers loaded (list non-null). Label: no trailers -> "No trailers" (disabled); one -> "Play trailer"; many -> "Trailers". One -> immediately; many -> dialog "Play trailer" listing each (headline name; supporting "Local" for local, "YouTube" for YouTube remote, else "External"). Local trailer -> `Playback(trailerItemId, 0)`; remote -> open URL externally (web: `window.open`).
7. **Delete** (trash; turns red on focus) only if `canDelete` -> confirm dialog "Are you sure you want to delete this item?" + item title + [Cancel] [trash Delete]; confirm -> `DELETE /Items/{id}`, toast "Deleted", navigate back.
8. **More** (kebab icon) -> context menu dialog (14.2) with `showGoTo=false, showStreamChoices=true, canDelete, fromLongClick=false`.

### 5.5 Chosen streams for the badges (`data/ItemPlaybackRepository.getSelectedTracks`, `services/StreamChoiceService.kt`)
- Source: the user's saved `ItemPlayback.sourceId` (local DB) if it exists in `mediaSources`, else the source with the **largest video width*height**.
- Audio: user's saved `audioIndex` for this item; else series-level saved choice (episodes); else user preference language (`getPreferredLanguage(AUDIO, prefs, userConfig.AudioLanguagePreference)`): sort by language then channels desc, pick language-match+default, language-match, default, first; no preference -> default-flagged else first.
- Subtitle: saved index (`DISABLED` = off, `ONLY_FORCED`, or index); else series-level choice; else by subtitle-mode (pref or user profile `SubtitleMode`: DEFAULT/SMART/ONLY_FORCED/ALWAYS/NONE) over candidates sorted external > default > non-forced-in-lang > forced-in-lang > forced-unknown > forced. (Playback doc owns the full algorithm; web port may simplify to server defaults.)
- Saved choices are local (Room `ItemPlayback`, `SeriesTrackChoice`), not on the server.
- More-menu "Choose Audio / Choose Subtitles" lists streams of the chosen source (5.6); selecting persists via `saveTrackSelection` (also saves a per-series language preference for episodes); "Clear track choices" deletes them.

### 5.6 Movie "More" context menu
See 14.2 for the full builder. For the movie page the instance is `ForBaseItem(fromLongClick=false, showGoTo=false, showStreamChoices=true, canDelete, canRemoveContinueWatching=false, canRemoveNextUp=false)`. "Choose Audio" listed only if the chosen source has > 1 audio stream; "Choose Subtitles" if >= 1 subtitle stream; "Choose Version" if > 1 source. Stream dialogs: for subtitles the list is `None`, `Only Forced Subtitles`, divider, then each subtitle stream (sorted so the user's preferred subtitle language comes first); audio lists audio streams. Each row: leading selected-check; headline = stream title (or display title); supporting = display title if title present; trailing = reason the current stream was chosen (e.g. "Chosen by User preferences"). Selection value `TrackIndex` (DISABLED / ONLY_FORCED / stream index).

### 5.7 People row (`ui/cards/PersonRow.kt`, `PersonCard.kt`, `data/model/Person.kt`)
Title "People" (`titleLarge`, start pad 8). `LazyRow`, gap 16, content pad 8, card width **108dp**. Card: circular image (1:1, `Crop`), 3dp focus ring; fallback = grey circle with FontAwesome user glyph 64sp; name (`bodyMedium` SemiBold, 1 line centered, marquee on focus) + role (`bodySmall`, 1 line). Order = server `People` order (no filtering/sorting; includes actors, directors, writers...). (The `favorite` flag is only used by the context menu label; the person card draws **no** heart overlay: `showOverlay=false`.) Click -> `Destination.MediaItem(personId, PERSON)`; long-press -> person context menu: **Go To** (-> person page), **Favorite/Unfavorite** (`POST/DELETE /UserFavoriteItems/{personId}`; then people list refetched).
Role text (`personRole`): ACTOR/GUEST_STAR/UNKNOWN -> role (character name); role equals the type name (ci) -> localized type label; role contains the type name -> role; else `"{role} - {Type label}"` or just whichever exists. Type labels: Director, Composer, Writer, Guest star, Producer, Conductor, Lyricist, Arranger, Engineer, Mixer (also Remixer), Creator, Artist (also album artist); Actor "Actor"; others none.

### 5.8 Extras row (`services/ExtrasService.kt`, `data/ExtrasItem.kt`, `ui/cards/ExtrasRow.kt`)
Title "Extras". `GET /Items/{id}/SpecialFeatures`; drop `ExtraType` THEME_SONG, THEME_VIDEO, TRAILER; group by extraType (`UNKNOWN` if missing). Per group: 1 item -> `Single`: title = item name (else the type's singular label e.g. "Featurette"), subtitle = type singular label if the item had a name, image = item Primary, click -> `Playback(item)` (with item resume), progress/watched shown. >1 items -> `Group`: title = type label plural-ish (`behind_the_scenes_title` "Behind the Scenes", `clips_title`, `deleted_scenes_title`, `interviews_title`, `scenes_title`, `samples_title`, `featurettes_title`, `shorts_title`, `other_extras_title`), subtitle = `"{n} items"`, image = a **random** member's Primary, `isPlayed` = all played, click -> `ItemGrid` of those ids (`GET /Items?ids=...&sortBy=SortName&sortOrder=Ascending`; columns 3, spacing 24, aspect 16:9). Groups ordered: Trailer 0, Featurette 1, Short 2, Clip 3, Scene 4, Sample 5, DeletedScene 6, Interview 7, BehindTheScenes 8, ThemeSong 9, ThemeVideo 10, Unknown 11. Card = `SeasonCard` with image height 128 (width from aspect, default 16:9, min 2:3), overlay on, title/subtitle texts below.

### 5.9 Chapters row (`ui/cards/ChapterRow.kt`, `ChapterCard.kt`)
Title "Chapters". Cards: height **120dp**, width = image's intrinsic width (initially 16:9), image `GET /Items/{id}/Images/Chapter/{chapterIndex}?tag={chapter.imageTag}&fillHeight=120px...` (`ImageType.CHAPTER`, `imageIndex` = chapter index), `ContentScale.Fit`. Bottom overlay bar (bg `#80000000`, pad 4): chapter name (`bodyMedium` SemiBold) + position `formatDuration(roundSeconds(position))` e.g. `1h 2m 3s`/`4m 5s`. Click -> `Playback(movieId, chapter.position ms)` (starts at the chapter). Row has no long-press action. Row hidden when `Chapters` empty. Gap 16, content padding v8/h16.

### 5.10 More like this row
Title "More like this". `SeasonCard` (generic card) with `imageHeight = 172` for MOVIE, `128` otherwise, width from item aspect ratio (`PrimaryImageAspectRatio`, default 2:3, min 2:3), overlay on (favorite/watched/progress/unplayed/version badges), title = `item.title`, subtitle = `item.subtitle` (year). Click -> `item.destination()`; long-press -> context menu `ForBaseItem(showGoTo=true, showStreamChoices=false, canDelete=false)`.

### 5.11 Media Information dialog (`ui/data/ItemDetailsDialogInfo.kt`)
Opened by: clicking the overview, "Media Information" in the context menu (only if the item has `MediaSources`). Scrollable dialog 680 x max 440, padding 16, elevation 3. Content: title (`headlineSmall`); studios joined ", " (`titleMedium`, from `Studios[].name`); genres joined ", " (`titleSmall`); overview (`bodyMedium`); "Last played: {medium date}" if `UserData.LastPlayedDate`. Then for **each media source** (with streams) a divider and:
- **General** (suffix " (n)" when several sources): Container; (admin only: Path, ID); Size (`formatBytes`: 1024 base, 2 decimals, `B/KiB/MiB/GiB/TiB`); Bitrate (`formatBitrate`: 1000 base, 2 decimals, `bps/kbps/mbps/gbps/tbps`); Runtime (`formatDuration`).
- **Video** (per video stream): Title, Codec (UPPER), Resolution `WxH`, Aspect ratio (reduced by gcd e.g. `16:9`), Bitrate, Framerate (`%.3f`), Video range (SDR/HDR), Profile, Level, Interlaced Yes/No; second column: AVC, Anamorphic, Bit depth (`N bit`), Video range type (SDR/HDR10/HDR10+/HLG/Dolby Vision), Color space, Color transfer, Color primaries, Pixel format, Ref frames, NAL, Dolby Vision title.
- **Audio** (three per row): Title, Language (full name), Codec `"{label} ({codec})"`, Layout, Channels, Profile, Bitrate, Sample rate (`N Hz`), Default.
- **Subtitle** (three per row): Title, Language, Codec `"{label} ({codec})"`, Default, Forced, External, SDH (`localizedHearingImpaired` or "SDH"), (admin) Path.
Down/up keys scroll 100px. `showFilePath` = current user is administrator.
Also a "Send media info log to server" action (`serverReportService.sendMediaReportFor(itemId)`) available from the context menu when MediaSources exist.

---------------------------------------------------------------------------------------------------

## 6. TV series: Details page and Overview page (`ui/detail/series/*`)

Two distinct pages share `SeriesViewModel(seriesId, seasonEpisodeIds?, SeriesPageType)`:
- **Series details** (`SeriesPageType.DETAILS`): `Destination.MediaItem(seriesId, SERIES)` -> `SeriesDetails` (landing page with action buttons and a seasons row).
- **Series overview** (`SeriesPageType.OVERVIEW`): `Destination.SeriesOverview(seriesId, SERIES, SeasonEpisodeIds?)` -> `SeriesOverview` (season tabs + episode strip + focused-episode info). This is where season, episode, and "continue watching episode" clicks go (`BaseItem.destination()`, 0.5). It is **not** reached from the series details page's Play button (that plays directly); it is reached by clicking a season card on the details page (`SEASON.destination()` -> `SeriesOverview(seriesId, SERIES, SeasonEpisodeIds(seasonId, seasonNumber, null, null))`).
`SeasonEpisodeIds(seasonId: UUID, seasonNumber: Int?, episodeId: UUID?, episodeNumber: Int?)`; `SeriesOverviewPosition(seasonTabIndex, episodeRowIndex)`.

### 6.1 Series details page

#### Data (`SeriesViewModel.init`)
1. `GET /Items/{seriesId}` (`libraryApi.getItem`) -> series (error -> ErrorMessage). `backdropService.submit(series)`.
2. **Seasons**: `GET /Items` (`getItems`): `parentId=seriesId, recursive=false, includeItemTypes=[Season], sortBy=[IndexNumber], sortOrder=[Ascending], enableUserData=true (DETAILS only), fields=[PrimaryImageAspectRatio, CanDelete]` (Overview page: `fields=[CanDelete]`, no user data), paged with `pageSize=20` via `ApiRequestPager`, initial page for `seasonNumber ?: 0`. Season ordering therefore = Specials (index 0) first, then 1..N.
3. Remote trailers (sync from series DTO, same sort as movies). Then async: local trailers (`GET /Items/{id}/LocalTrailers` if `LocalTrailerCount>0`), people (`getPeopleFor(series)`), extras (`GET /Items/{id}/SpecialFeatures`), similar (`GET /Items/{id}/Similar?userId&fields=ItemRowFields&limit=25`, wrapped with `useSeriesForPrimary=true`), Seerr similar and `discoverSeries` (other doc).
4. On resume: `refresh()` re-fetches all season pages; backdrop re-submitted; theme song plays (`themeSongPlayer.playThemeFor(seriesId)`), stops on pause/navigate.
5. Deleted-item flow: if a deleted item's `seriesId` equals this series, seasons are refetched. `deleteItem` (`SeriesViewModel.kt:636-650`): deleting the series itself goes back; on the DETAILS page deleting a season/episode refetches the seasons and goes back if none remain; on the OVERVIEW page see 6.2 (last episode / empty season).
6. Updates after actions (`SeriesViewModel.kt:441-463,486-490`): `updateSeries()` re-fetches the series, its people and the seasons. A series-level watched/favorite change, and a favorite toggle from the season/similar context menu (`setFavorite(itemId, fav, null)`), re-run `updateSeries()` (so people are reloaded too, not just series + seasons); the season watched toggle on this page refreshes nothing on the list.

#### Layout (LazyColumn, bottom pad 80, gap 16)
```
+------------------------------------------------------------------------------------+
| [pad top 48]                                                                       |
|  TITLE / LOGO                         (75% width, start pad 8)                     |
|  QuickDetails: 2008 - 2013 • TV-MA • 9.5★ • 97%🍅   (no ends-at; series years)     |  60% width column
|  Studios: HBO, AMC            (bodyLarge)    <- studio names via GenreText: first 4 comma-joined, then ", +N" |
|  Genres: Drama, Crime, Thriller                                                    |
|  Overview (3 lines, click -> media information dialog)                             |
|  [▶ Play] [Shuffle] [Watched] [Favorite] [Trailer] [Delete?] [Discover?]           |  start pad 8, gap 16
|  Seasons (N)         [SeasonCard 172dp tall ...]                                   |
|  People               ...                                                          |
|  Extras               ...                                                          |
|  More like this      [SeasonCard 172dp tall]                                       |
|  Discover (Seerr)                                                                  |
+------------------------------------------------------------------------------------+
```
Row order: header (+buttons) -> Seasons row (always, title `"Seasons (N)"` = `tv_seasons` + count) -> People (if non-empty) -> Extras (if non-empty) -> More like this (if non-empty) -> Discover (if non-empty). Constants `HEADER_ROW=0, SEASONS_ROW=1, PEOPLE_ROW=2, TRAILER_ROW=3, EXTRAS_ROW=4, SIMILAR_ROW=5, DISCOVER_ROW=6`. Note: **no chapters row**, and no poster.
Images: backdrop (series), logo (series Logo tag) or title text; season cards use Primary; similar uses Primary with series fallback.
Header details: quick-details = series years + official/community/critic ratings (no runtime/ends-at since `timeRemaining=null`). Studio line only if `studios` present (names via `studioNames`, rendered by `GenreText` with bodyLarge: shows first 4, then `, +N`). Genres line (same helper). No tagline, no stream chips, no "Directed by".

#### Buttons (order; start pad 8, gap 16)
1. **Play**: `viewModel.playNextUp()` -> `GET /Shows/NextUp?seriesId={id}` (`showApi.getNextUp(seriesId)`), first result; if none, `GET /Shows/{id}/Episodes?limit=1` first episode; navigates to `Destination.Playback(episode)` (with its resume position). If neither -> toast "Could not find an episode to play". (Next-up here has default params: rewatching not enabled.)
2. **Shuffle**: `Destination.PlaybackList(itemId=seriesId, shuffle=true)` (queue: `GET /Shows/{id}/Episodes?sortBy=Random&limit=Playlist.MAX_SIZE&fields=DetailItemFields`, virtual episodes dropped; 14.5).
3. **Mark watched / unwatched**: always opens confirm dialog (title = series name, body "Mark entire series as played?" / "Mark entire series as unplayed?", Cancel / Confirm). Confirm -> `POST|DELETE /UserPlayedItems/{seriesId}` (marks all) then refresh series + seasons.
4. **Favorite / Unfavorite**: `POST|DELETE /UserFavoriteItems/{seriesId}`, then refetch series, people, seasons.
5. **Trailer** button (same component as movie 5.4#6, `PlayButtons.kt:389-420`; always rendered but three states): no trailers -> disabled, label "No trailers" (`no_trailers`); exactly one -> label "Play trailer" (`play_trailer`), click plays it; two or more -> label "Trailers" (`trailers_title`), click opens the picker dialog.
6. **Delete** if `canDelete` -> confirm dialog -> `DELETE /Items/{id}` -> go back.
7. **Discover** (Seerr) if the series exists on Seerr (other doc).
No "More" (kebab) button and no version/restart buttons on this page.

#### Seasons row
`ItemRow` (gap 16, content pad h16 v8, title `titleLarge` start pad 8) of `SeasonCard`: image height **172dp**, width = 172 * aspect (item aspect default 2:3, min 2:3), overlay on (favorite heart, watched check, unplayed count pill = `UserData.UnplayedItemCount`, progress, and the version-count badge when `mediaSourceCount > 1`, `SeasonCard.kt:175-188`). Title = `item.title` (season name; SEASON `title` = `name`), subtitle = `item.subtitle` -> for SEASON `productionYear` string (BaseItem.subtitle `else` branch). Click -> `SeriesOverview` for that season. Long-press -> **season context menu** `ForBaseItem(showGoTo=true, showStreamChoices=false, canDelete=mediaMgmt&&canDelete)` with items per 14.2 (SEASON is in `supportedPlayableTypes` and `supportedShufflableTypes`): Go To, Play, Shuffle, Add to playlist, [Delete], Mark as watched/unwatched, Favorite/Unfavorite, Go to series (seriesId present), [Media Information only if mediaSources non-empty - not for seasons]. Watched toggle on a season -> `setWatched(seasonId)` (no list refresh on this page); on the series id it asks the confirm dialog.
Other rows: People (same as movie; long-press person -> Go To / Favorite), Extras (series extras; click -> same as 5.8), More like this (SeasonCard 172dp; long-press -> `ForBaseItem(showGoTo=true, showStreamChoices=false, canDelete=false)`).
Series overview dialog: `ItemDetailsDialog(info(series), showFilePath=false)` (the series *overview page*, 6.2, uses `showFilePath = isAdministrator` instead; `SeriesDetails.kt:170-176`).

### 6.2 Series overview page (seasons as tabs + episode strip)

Created with `SeasonEpisodeIds` from `BaseItem.destination()`:
- Click on an **episode** anywhere (home next up, library episode grid, search...) -> `SeasonEpisodeIds(seasonId, parentIndexNumber, episodeId, indexNumber)`.
- Click on a **season** -> `SeasonEpisodeIds(seasonId, indexNumber, null, null)`.
- Navigating from elsewhere with `null` ids -> opens first season, first episode.

#### Data
1. Series `GET /Items/{id}`; seasons as in 6.1 (page size 20, no user data).
2. **Initial episode list** (`loadEpisodesInternal`) for `seasonEpisodeIds.seasonId` (else first season's id): `GET /Shows/{seriesId}/Episodes` (`showApi.getEpisodes(GetEpisodesRequest)`): `seriesId, seasonId, sortBy=IndexNumber, fields=[MediaSources, MediaSourceCount, Overview, CustomRating, PrimaryImageAspectRatio, CanDelete, ParentId]`; no `isMissing`, no `startItemId` -> server decides whether virtual (missing/unaired) episodes appear (library "Display missing episodes"/"upcoming" settings). The UI does not filter them; virtual episodes render like others (no image, name only). Paged with `ApiRequestPager` (page size 100; `startIndex/limit` injected; this endpoint has no total-count flag, the pager reads `TotalRecordCount` from the response).
3. **Initial episode index**: if an episodeId or episodeNumber was supplied: `findIndexByNumberOrIdFast` (`SeriesViewModel.kt:752-878`): if `list.size <= list.pageSize` (the pager's own page size: **100 for the episodes pager, 20 for the seasons pager**, `:346`) linear scan for an item where `item.id == targetId || item.indexNumber == targetNum` (and parent matches by `parentId == seasonId || parentIndexNumber == seasonNumber`); else it starts at array index `targetNum-1` (fetching that page); if that item's parent check fails it searches outward alternating left/right for an item with the matching parent; then walks right if `item.indexNumber < target` or left if `> target` until the number/id matches (handles missing episodes shifting indices) and returns `0` when not found; a full `indexOf` scan is used only when the number equals but id/parent do not match. No supplied episode -> index 0 (first episode, even if watched).
   **Initial season tab**: the index in the seasons pager where `indexNumber == seasonNumber || id == seasonId` (same helper, so more than 20 seasons uses the hint-based path), clamped >= 0. Season extras (`GET /Items/{seasonId}/SpecialFeatures`) are loaded initially only when `seasonEpisodeIds != null` (`SeriesViewModel.kt:185-206`); when the page is opened with null ids no extras load until the user selects a season tab (the `LaunchedEffect(Unit)` tab-load in `SeriesOverview.kt:92-98` runs before seasons exist and is a no-op).
4. When a season tab is selected: `loadEpisodes(seasonId, seasonNumber)` -> same Episodes request (no episode hint) + `GET /Items/{seasonId}/SpecialFeatures` (season extras; shown under the strip). Episode list reset to "loading" with extras and cast cleared. Position becomes `(seasonIndex, 0)`.
5. **Focused episode side data** (runs on every focus change of the strip): chosen streams for that episode (`itemPlaybackRepository.getSelectedTracks`, local) and **people in episode** (`lookupPeopleInEpisode`, `SeriesViewModel.kt:599-623`): on focus change `peopleInEpisode` is cleared immediately if the id differs; the `GET /Items/{episodeId}` -> `People` -> `Person` fetch starts immediately (not debounced) and is cached per episode id (Guava, max 25 entries); only the UI state update waits 250 ms (`delay(250)` before awaiting the result) and is cancelled if focus moves again.
6. Backdrop = **series** backdrop (`BackdropService.submit(series)`; re-submitted after episode refresh). Theme song of the series plays.

#### Layout (vertical scroll; page pad v16, gap 8; end padding 184 when clock shown else 16 for the tab row)
```
+---------------------------------------------------------------------------------------------+
| [Specials] [Season 1] [Season 2*] [Season 3] ...         TabRow (season name or "Season N")  |
|  SERIES LOGO or TITLE                                       (start pad 8)                    |
|  Episode title (headlineSmall 20sp, 1 line)                                         60% wide |
|  S2 E5  •  Mar 3, 2013  •  58m  • 8.7★ • Ends at 9:12 PM                                    |
|  [1080p] [H264] [🔊 ...] [CC ...]                                                            |
|  Overview (3 lines; click -> media info dialog)                                              |
|  [ep card][ep card][ep card*][ep card] ...   LazyRow, cardHeight 120, gap 16, pad h16         |
|  [▶ Resume][↺ Restart][Version][Watched][Favorite][Delete?][⋮ More]  (footer buttons)        |
|  Cast & Crew   (circles, 108dp)                                                              |
|  Guest stars   (circles)                                                                     |
|  Extras        (season extras)                                                               |
+---------------------------------------------------------------------------------------------+
```
- **Season tabs** (`TabRow`): one per season, label = `season.name ?: "Season {indexNumber}" ?: ""` (Jellyfin names season 0 "Specials"). Selecting a tab re-queries episodes and moves focus to the first episode card (focus/hover on the strip). The tab *index* is `position.seasonTabIndex`; tabs are not remembered across sessions.
- **Episode strip** (`BannerCard`, 120dp tall): width = `120 * aspectRatio` where `aspectRatio = max(item.aspectRatio, 4/3)` or 16:9 if unknown (`PrimaryImageAspectRatio`); image = episode **Primary** (`useSeriesForPrimary=false`) at `fillHeight = round(120 * devicePixelRatio)` (`cardHeight.roundToPx()`, `BannerCard.kt:75-84`), `FillBounds`; fallback text = episode name (titleMedium, centered). Overlays: top-right: watched check (if played and playedPercentage <=0 or >=100) + corner pill with `E{indexNumber}` (or premiere date if no index); top-left heart if favorite (note: Overview passes `favorite=false` default so no heart); bottom progress bar (`tertiary`, 6dp) for partially watched. Non-focused cards are on black bg rounded 8 and **dimmed to 40% alpha when the strip itself is not focused but the page is** (focus is on buttons/people), the focused episode remains 100%.
- The "focused episode" is whichever card has focus/is `position.episodeRowIndex`; header, chips, overview and footer buttons all describe it and update immediately as focus moves (web: hover/selected state; see questions).
- Header (`FocusedEpisodeHeader`): episode name; `QuickDetails(ep.ui.quickDetails, ep.timeRemainingOrRuntime)` = `S# E#  •  {premiere date}  •  runtime/left` + ratings + ends-at; `VideoStreamDetails(chosenStreams, mediaSourceCount)`; overview (3 lines, in a 8dp-padded box 3*20dp tall, click -> media-info dialog). No tagline, no director here. The title text is `episode.episodeTitle ?: name` (`SeriesComponents.kt:45-48`). The overview page's `ItemDetailsDialog` uses `showFilePath = isAdministrator` and the context-menu dialog receives the user's `subtitleLanguagePreference` (`SeriesOverview.kt:163-164,318-335`).
- Footer (`FocusedEpisodeFooter` = `ExpandablePlayButtons` for the focused episode, trailers=null): Resume/Play, Restart (if resume>0), Version (if >1 source), Watched, Favorite, [Delete if `canDelete`], More. **Play** -> `Playback(episodeId, resumeMs)`; Watched toggle -> API + `refreshEpisode` (re-fetch that episode in the pager) + focus returns to the strip (`episodeRowFocusRequester.tryRequestFocus()`); Favorite toggle -> API + `refreshEpisode`, no refocus (`SeriesOverviewContent.kt:322-326`); **More** -> `ForBaseItem(fromLongClick=false, showGoTo=false, showStreamChoices=true, canDelete)`.
- **Cast & Crew** row: people of the focused episode whose `type != GuestStar` (title "Cast & Crew"); **Guest stars** row: `type == GuestStar` (title "Guest stars"). Both hidden when none; fade in/out. Click person -> person page. No long-press on these rows here.
- **Extras** row: season extras (`/Items/{seasonId}/SpecialFeatures`), same grouping as 5.8.
- Episode card click -> `Playback(episodeId, resumeMs)` (starts/resumes immediately, does **not** open the episode details page). Episode long-press -> context menu `ForBaseItem(fromLongClick=true, showGoTo=false, showStreamChoices=true, canDelete, ...)`; Media/Play key on a focused episode card -> play.
- Context menu actions here refresh the episode in the strip (`refreshEpisode(itemId, currentEpisodeIndex)`). Delete: removes the item; if it was the last episode in the strip the focus index moves left; if the season becomes empty, navigate back.
- Mark-played/favorite for an episode: `POST|DELETE /UserPlayedItems/{id}`, `/UserFavoriteItems/{id}`.
- Season-level actions (mark season watched, play season) are **not** on this page (only via context menu of the season card on the details page, or playback queues).

#### Special cases
- Specials: season index 0 sorts first and gets the server's name ("Specials").
- Missing/unaired episodes: depend on server config; they are listed (virtual items), cannot be played (playback queue creation drops `LocationType.Virtual`).
- Episodes of multi-part ranges: `indexNumberEnd` => label `S1 E3-E4` (padded variant `S01E03-E04`).
- Series with zero seasons: tab row empty and episode list shows "Could not determine season" error text.

---------------------------------------------------------------------------------------------------

## 7. Episode detail page (`ui/detail/episode/EpisodeDetails.kt`, `EpisodeDetailsHeader.kt`, `EpisodeViewModel.kt`)

Reached only by `Destination.MediaItem(id, EPISODE)` (happens when an episode lacks `seasonId` or `seriesId`; normal episode clicks use SeriesOverview). Single header block (no rows below).
Data: `GET /Items/{id}` (+ chosen streams, local). Re-fetched on every resume. Backdrop from `BackdropService.submit(episode)` -> series backdrop (0.3). Series theme song plays.
Layout: top pad 48, bottom 16:
1. Series name (`headlineMedium` SemiBold, max 2 lines, 75% width).
2. Episode name (`headlineSmall` 20sp, 1 line).
3. (60% width column) QuickDetails (`S# E# • date • runtime • ratings • Ends at`), stream chips, tagline (italic), overview (3 lines, click -> media info dialog), "Directed by ..." (episode `People` Director).
4. `ExpandablePlayButtons`: Play/Resume, Restart, Version, Watched, Favorite, [Delete], More (no trailers). Same behaviours as 5.4. Play -> `Playback(epId, ms)`. Delete -> confirm -> `DELETE /Items/{id}` -> back.
5. More menu: `ForBaseItem(fromLongClick=false, showGoTo=false, showStreamChoices=true, ...)`; includes "Go to series" (episode has `seriesId`, 14.2) which navigates to `MediaItem(seriesId, SERIES)` (the series details page).
No people/extras/similar rows on this page.
Details (`EpisodeDetailsHeader.kt:47-101`, `EpisodeDetails.kt:70-73,124-134`, `EpisodeViewModel.kt:76-110`): "Directed by" lists ALL Director-type people with non-blank names joined ", " (not just one); only the first tagline is shown; the overview block is omitted when overview is null; the theme song is requested only when the episode has a `seriesId`, restarted on every resume and stopped on pause; header rows have an 8dp vertical gap and the header block sits above the button row with 16dp bottom padding. After watched/favorite toggles only the item is refetched (`GET /Items/{id}`), while track and version choices are reloaded from the local DB on resume.

---------------------------------------------------------------------------------------------------

## 8. Box set / Collection detail (`ui/detail/collection/*`)

Reached by `Destination.MediaItem(id, BOX_SET)` (clicking a collection card anywhere, e.g. movie library "Collections" tab, a BoxSets library, search, a movie's "go to"). Backdrop cleared on enter, then set to the collection's backdrop/focused item's backdrop. The collection's theme song plays (`ThemeSongPlayer.playThemeFor(collectionId)`).

### 8.1 Data
1. `GET /Items/{id}` -> collection (`BaseItem(useSeriesForPrimary=false)`); logo URL = `Items/{id}/Images/Logo` if the item has a Logo tag.
2. Local saved settings (observed as flows): `LibraryDisplayInfo` row keyed by the collection id (sort + filter; viewOptions column unused here, saved as null) and per-user **global** `CollectionViewOptions` JSON stored in the key-value store under key `"{userId}_CollectionViewOptions"` (shared by all collections). Default sort for a collection with no saved row = **`Default` Ascending** (server order), empty filter. `CollectionViewOptions(separateTypes = true, cardViewOptions = ViewOptions(showDetails = true, showTitles = true, ...other ViewOptions defaults))` (note the dialog's switch default is shown as false but the data default is `true`).
3. Items (re-queried whenever sort, filter, or `separateTypes` changes): `GET /Items` with `userId, parentId={collectionId}, recursive=false, fields=SlimItemFields, sortBy=[sort], sortOrder=[direction]` (the sort is always sent as-is, even `Default`; no SortName tie-breaker), plus the saved filter fields (isFavorite, genreIds, minCommunityRating, officialRatings, isPlayed, studioIds, years/decades, is4K/isHd/is3D/videoTypes) with `includeItemTypes` **not** overwritten by the filter, and type selection:
   - `typesInCollection = [Movie, Series, Episode, Video, BoxSet, MusicArtist, MusicAlbum, MusicVideo]`.
   - Mixed mode (`separateTypes=false`): one request, `includeItemTypes = typesInCollection`, `useSeriesForPrimary = true`, paged 100.
   - Separate mode (`separateTypes=true`, default): one request **per type** in parallel, `includeItemTypes=[type]`, `useSeriesForPrimary=false`; empty types are omitted; each becomes a horizontal row titled by type (Movies, TV Shows, Episodes, Videos, Collections, Artists, Albums, Music videos). Error rows are kept (show error). Row order = order of `typesInCollection`.
   - Workaround for server bug jellyfin#16454: for the BOX_SET-only request `includeItemTypes=null` and `excludeItemTypes = all BaseItemKinds except BoxSet`.
4. Letter jump: same query with `nameLessThan, limit=0, enableTotalRecordCount=true` (`typesInCollection` types); only in mixed mode with sort == SortName.
5. Filter option values: `FilterOptionCache` with parent = collection id (genres etc. within the collection).

### 8.2 Layout and behaviour
Two header states with a shared slide transition (header slides up/out when focus enters the items area, slides back when focus returns above via a hidden focus box / pressing up):
```
STATE A (focus in header)                              STATE B (focus in items)
+----------------------------------------------+       +------------------------------------------+
| [pad top 48]  TITLE/LOGO (75% w)             |       | (optional) HomePageHeader for focused    |
| quick details: 2001 • 8 items • ratings      |       | item (height 180, start pad 8, top 48)   |
| genres, tagline (italic), overview 3 lines   |       |  only if viewOptions.cardViewOptions     |
| [Play][Shuffle][Fav][Delete?][View][More] [Sort ▾][Filter]  |  .showDetails                       |
+----------------------------------------------+       +------------------------------------------+
|  items: rows by type  OR  mixed grid                 |  items: ...                              |
```
- Header height = 180, bottom pad 32, top pad 48. Contents (`CollectionDetailsHeader`): logo or title (75% width), quick details (year, `"{childCount} items"`, runtime if any, ratings; `timeRemaining=runtime`), genres (`GenreText`), tagline, overview (3 lines; click -> media info dialog with title/overview/genres/studios).
- Button row (`CollectionButtons`), left group (gap 16, padding 8): **Play**, **Shuffle**, **Favorite/Unfavorite**, **Delete** (if `canDelete`), **View options**, **More**; right group: **Sort** (`MovieSortOptions`; direction toggled via re-select/long press as in 4.6) and **Filter** (`DefaultFilterOptions`).
  - Play/Shuffle -> `Destination.PlaybackList(itemId=collectionId, startIndex=0, shuffle, recursive=true, sortAndDirection=current, filter=current)`; queue: `GET /Items` with `parentId=collection, recursive=true, includeItemTypes=<playable kinds from the collection's collectionType, else all playable kinds: Episode, Movie, MusicVideo, Trailer, Video, LiveTvChannel, LiveTvProgram, Program, Recording, TvChannel, TvProgram>, excludeItemIds=[collection], sortBy [RANDOM if shuffle], fields=DetailItemFields, startIndex, limit=Playlist.MAX_SIZE, excludeLocationTypes=[Virtual]` (see 14.5).
  - Favorite -> `POST/DELETE /UserFavoriteItems/{id}` then refetch the collection.
  - Delete -> confirm -> `DELETE /Items/{id}`.
  - **View options** -> `CollectionViewOptionsDialog` (right panel 256dp): first row **Separate types** (switch); if separate: Show details, Show titles, Reset; if mixed: Image type, Aspect ratio, Show details, Show titles, Columns (1-12), Spacing (0-32 step 2), Default content scale, Reset. Persisted per user (key above), applies to all collections. Turning **Show details** off resets the backdrop to the collection's.
  - **More** -> `ForBaseItem(fromLongClick=false, showGoTo=false, showStreamChoices=false, canDelete)` for the collection itself (menu: Play, Shuffle (BOX_SET is playable+shufflable), Add to playlist, [Delete], Mark watched/unwatched, Favorite, [Media information only if mediaSources non-empty]).
- Items area:
  - **Separate mode**: `HomePageContent`-style vertical stack of rows (title per type, cards 172dp tall poster; EPISODE rows 128dp tall 16:9; Artists/Albums/Playlist/Audio rows 128dp square; Video/MusicVideo rows 128dp 16:9), no "view more", no clock, `showTitles` from view options, backdrop follows the focused card when show-details is on.
  - **Mixed mode**: `CardGrid` like 4.1 (letter bar when sort == SortName; no header buttons; columns/spacing/aspect/imageType/contentScale/showTitles from the global collection options; optional details header; footer position).
- Click item -> `item.destination()`; Play key -> `Playback(item)`; long-press -> `ForBaseItem(fromLongClick=true, showGoTo=true, showStreamChoices=false, canDelete)` with actions that refresh the affected slot (watched, favorite, delete, add to playlist, media info, send report, add to queue for music).
- Backdrop logic (`updateBackdrop`): focused item == collection -> collection backdrop; else if `showDetails` -> focused item's backdrop; else clear.

---------------------------------------------------------------------------------------------------

## 9. Playlist page (`ui/detail/PlaylistDetails.kt`, `ui/detail/PlaylistList.kt`)

Reached by `Destination.MediaItem(id, PLAYLIST)` (card click for a PLAYLIST item; also from a Playlists library = `CollectionFolderPlaylist` grid of playlists with `ViewOptionsSquare`, `PlaylistSortOptions`, play disabled). Implemented as a **`CollectionFolderViewContent` list view** over the playlist's items plus playlist-specific controls.

### 9.1 Data
- Item/Items: same VM as 4.2/4.3 with `itemId=playlistId`, `recursive=false`, no filter, `useSeriesForPrimary=false`, initial sort **`Default` Ascending** (= playlist order; `sortBy` omitted), page size 100, `defaultViewOptions = ViewOptions(spacing=0, showDetails=true, type=LIST)`. So the request is `GET /Items?parentId={playlistId}&recursive=false&fields=SlimItemFields&enableImageTypes=Primary,Thumb,Backdrop,Logo&excludeItemIds=[playlistId]` (+ saved sort/filter/viewOptions from `LibraryDisplayInfo` keyed by the playlist id). Title = playlist name.
- Edit permission: `GET /Playlists/{id}/Users/{userId}` (`playlistApi.getPlaylistUser`) -> `canEdit`; 404/other error -> false.
- Media type determination (`PlaylistDetails.kt:195-238`): `item.mediaType`; if UNKNOWN and the pager has <= 50 items (more than 50 stays UNKNOWN and prompts), inspect at most the first 50 items: AUDIO -> Audio; VIDEO/EPISODE/MOVIE/BOX_SET -> Video; any other type counts as UNKNOWN; if all items map to one media type that type is used, otherwise (mixed) Unknown.

### 9.2 UI
Header row (from 4.1, `showTitle` on): [Sort (PlaylistSortOptions)] [Filter (`DefaultFilterOptions`)] [View options] ... [Random] [Play] [Shuffle]. `PlaylistSortOptions` in order (`ui/data/SortAndDirection.kt:87-100`): Default, SortName, PremiereDate, DateCreated, DatePlayed, CommunityRating, CriticRating, OfficialRating, Runtime, PlayCount, Random. Default sends no `sortBy`; any other choice sends `sortBy=[chosen, SortName]` (SortName not duplicated) and `sortOrder=[direction, Ascending]` (`CollectionFolderView.kt:538-560`). The Playlists *library* page (`CollectionFolderPlaylist`, `ui/detail/CollectionFolderPlaylist.kt:19-42`, `DestinationContent.kt:472-478`) uses `recursive=true`, `PlaylistSortOptions`, `playEnabled=false`, `ViewOptionsSquare`. **Show details** default on -> left info pane (33% width) with the focused item's logo/title, Primary image, quick details, overview (5 lines).
List row (`PlaylistItem`, row gap 16): `ListItem` (or compact variant if layout = compact list):
- leading: **index number `"{n}."`** only when sort == Default; it is always `index+1` of the displayed order, even for Default/Descending (the reverse-numbering code is commented out with a source TODO, `PlaylistDetails.kt:639-652`); music-queue marker for AUDIO; red heart if favorite.
- headline: `item.title`; supporting: `item.subtitle` (year / "S2 E3 - name"; for songs album - artist).
- trailing: runtime (`formatDuration(roundMinutes)` for videos, `roundSeconds` for audio) and, for non-audio non-compact rows, a smaller "Ends at {now+duration}" line; watched check if played.
- right-side buttons (24dp tall): if `canEdit`: **Move up** (caret up; disabled for first item) and **Move down** (disabled for last); always **More** (kebab) -> context menu (`fromLongClick=false`).
Behaviours:
- Click row -> `item.destination(index)`. Long-press -> context menu.
- **Play** header button: `play(0, playlist, shuffle=false)`; **Shuffle**: `shuffle=true`. Dispatch by media type: VIDEO -> `PlaybackList(itemId=playlistId, startIndex=index, shuffle, filter=current, sortAndDirection=current)` (queue: `GET /Items?parentId={playlistId}&fields=DetailItemFields&startIndex&limit=Playlist.MAX_SIZE&sortBy=[sort]&sortOrder=[dir]&excludeLocationTypes=Virtual` + filters; shuffle uses `RANDOM`); AUDIO -> music queue (music doc); UNKNOWN -> dialog "Play as?" with [Audio] [Video] buttons.
- Play-remote key on a row -> `play(index, item, false)`.
- **Move**: `POST /Playlists/{playlistId}/Items/{itemId}/Move/{newIndex}` (`playlistApi.moveItem(playlistId, itemId, newIndex = index -/+ 1)`) then refetch pages from `index-1`; focus moves one row up/down.
- **Remove from playlist** (context menu entry shown only if `canEdit`): `DELETE /Playlists/{playlistId}/Items?entryIds=...` (`playlistApi.removeItemFromPlaylist(playlistId, listOf(itemId))`) then refetch pages after index. NOTE: the SDK call is passed `itemId` where the server API expects the playlist `entryId`; items that appear multiple times in a playlist may remove the wrong entry (known risk).
- Context menu (VIDEO items): `ForBaseItem(showGoTo=true, showStreamChoices=false, canDelete, showRemoveFromPlaylist=canEdit, index)`: Go To, Play (or Resume+Restart only when playbackPosition > 0), [Shuffle only for container types], **Remove from playlist**, Add to playlist, [Delete], Mark watched, Favorite, Go to series (episodes), Play with... `Media information` and `Send media info log` are added only when `item.data.mediaSources` is non-empty (`ContextMenu.kt:612,644`); playlist rows are fetched with `SlimItemFields` (no MediaSources, only MediaSourceCount), so they normally do NOT appear, and on this page `onShowOverview = {}` is a no-op (`PlaylistDetails.kt:423`). Port: omit both entries. AUDIO items use the music context menu (music doc).
- Add-to-queue entry (music/playlist-of-audio) calls `addToQueue`.
- Failures: remove shows toast "Error: {message}" (`PlaylistDetails.kt:240-282`); move has no error handling. Heart and watched icon appear in the row; Move down is disabled when `index >= lastIndex` (computed from loaded items); Remove from playlist passes the item id (not the playlist entry id) as `entryIds`.
- "Play as?" dialog (`play_as_type`) has two buttons, Audio and Video; the chosen type overrides the media type and `play` is re-invoked (`PlaylistDetails.kt:328-355,706-748`). Play queue creation (14.5) sends `userId`; `Playlist.MAX_SIZE = 100` (`data/model/Playlist.kt:15`).

### 9.3 Server playlist API used when adding items (`services/PlaylistCreator.kt`, `ui/data/AddPlaylistViewModel.kt`)
- List selectable playlists: `GET /Items?searchTerm={query?}&includeItemTypes=Playlist&recursive=true&limit=25&sortBy=DateLastContentAdded&sortOrder=Descending` (+ `mediaTypes` if filtering), then for each result `GET /Playlists/{id}/Users/{userId}` and keep only those with `canEdit` (404 -> skip). Dialog rows: name, media type label (Unknown/Video/Audio/Photos), `"{n} items"` plural. Search box with 750 ms debounce (an explicit search click/Enter fires immediately and suppresses the pending debounce; a blank query omits `searchTerm`); the list request does not filter by mediaType from this dialog (`mediaType = null`); the media-type label map is UNKNOWN/BOOK -> Unknown, VIDEO -> Video, AUDIO -> Audio, PHOTO -> Photos. Non-404 errors from `GET /Playlists/{id}/Users/{userId}` while filtering are rethrown and put the whole dialog into an Error state (only 404 skips an entry) (`PlaylistCreator.kt:344-388`, `PlaylistList.kt:68-208,228-238`). Footer "Create new playlist" -> name dialog -> `POST /Playlists` body `{name, ids:[itemId], users:[{userId, canEdit:true}], isPublic:false}`; the Submit button is disabled for a blank name but IME Done submits even a blank name.
- Add: `POST /Playlists/{playlistId}/Items?ids={itemId}` (`playlistApi.addItemToPlaylist(playlistId, listOf(itemId))`, no `userId`, no `position`; the server uses the token user; `PlaylistCreator.kt:407-412`). On success toast "Success"; on exception toast "Error: {localizedMessage}" (`AddPlaylistViewModel.kt:44-55`).

---------------------------------------------------------------------------------------------------

## 10. Person page (`ui/detail/PersonPage.kt`)

Reached by `Destination.MediaItem(personId, PERSON)` (click on a cast card, person search result, favorites > People).

### 10.1 Data
1. `GET /Items/{personId}` (`libraryApi.getItem`; person DTO has `MovieCount, SeriesCount, EpisodeCount, PremiereDate (birth), EndDate (death), ProductionLocations, Overview, ImageTags`).
2. For each of Movie / Series / Episode **only if the corresponding count > 0**: `GET /Items`: `personIds=[personId], includeItemTypes=[type], fields=ItemRowFields (Overview, SortName, MediaSourceCount, CanDelete, PrimaryImageAspectRatio), recursive=true, sortBy=[PremiereDate, ProductionYear, SortName], sortOrder=[Descending, Descending, Ascending]`, pager page size **15** (`useSeriesForPrimary=false`). Row titles `"Movies (N)"`, `"TV Shows (N)"`, `"Episodes (N)"` where N = total count; empty rows are hidden. Rows load independently with a "Loading" placeholder (title + "Loading" text) / error text.
3. Seerr: `similar(person)` and `discoverPerson(person)` for a "Discover" row capped at `maxItemsPerRow` with a View-more card (other doc).
Image: `GET /Items/{personId}/Images/Primary?tag=`. Backdrop is cleared (no backdrop on this page).

### 10.2 Layout
```
+------------------------------------------------------------------------------------------------+
| [pad top 16, bottom 40; header max height 480]                                                  |
|  +--------+  gap 32  +--------------------------------------------------------------+          |
|  | photo  |          | Name (displaySmall, 2 lines max)                              |          |
|  | weight1|          | Born: Mar 22, 1975 (50 years old)       <- titleSmall, 1 line |          |
|  | r.10%  |          | Birthplace: Phoenix, Arizona, USA                             |          |
|  +--------+          | Died: Feb 1, 2025 (49 years old)    (only if EndDate)         |          |
|     weight 1        | Overview (3 lines, click -> dialog) [Favorite/Unfavorite]      |  weight 3|
|                      +--------------------------------------------------------------+          |
|  Movies (12)   [SeasonCard 172dp poster ...]                                                    |
|  TV Shows (3)  [172dp ...]                                                                     |
|  Episodes (40) [128dp tall, aspect = item aspect or 4:3, row horizontal padding 24]            |
|  Discover      [...]                                                                           |
+------------------------------------------------------------------------------------------------+
```
- Info panel bg `surface @ elevation 1`, radius 10% corner, padding 16 (end pad 32, top 16). Photo clipped radius 10%.
- Age text: `Born: {medium date}` + ` ({n} years old)` (plural resource `years_old`, `strings.xml:178-182`: 1 -> "1 year old", other incl. 0 -> "{n} years old"; same plural for the Died line) only when alive (`deathdate == null`); `n = birthdate.until(today).years`. Died: `Died: {date}` + ` ({age at death} years old)` when birthdate known. Birthplace = first `ProductionLocations` entry. Dates are LocalDate (no TZ shift).
- Overview click -> dialog (title = name, overview only). Favorite button toggles `POST/DELETE /UserFavoriteItems/{personId}` then refetches.
- The page's vertical scroll is disabled while focus is in the header (web: n/a).
- Card click -> `item.destination()` (movie -> movie page, series -> series details, episode -> SeriesOverview). Long-press on cards in these rows: **no action**.
- Episode cards: `SeasonCard(imageHeight=128, aspectRatio = item.aspect ?: 4/3)`; movie/series cards `SeasonCard(imageHeight=172)` with default overlay off (SeasonCard default `showImageOverlay=false`) - title = item.title (episode -> series name), subtitle = item.subtitle (episode -> "S# E# - name").

### 10.3 Person grid in other contexts
Search results use `PersonCard` for `BaseItemKind.PERSON` (circular, 108dp wide `personRowCardWidth`, `role = null`; the `favorite` flag is passed but `PersonCard` uses `showOverlay=false`, so no heart is drawn, consistent with 5.7) (`SearchPageCard.kt:62-77`). The Favorites > People tab is NOT circular: it renders through `CollectionFolderViewContent` with its default grid card (`FavoritesPage.kt:101-122`, no `gridCardContent` override), i.e. the standard `GridCard` with `BaseItemKind.PERSON.defaultViewOptions = ViewOptionsPoster` (6 columns, 2:3, FILL), backed by `/Persons` (`GetPersonsRequest`, pager page size 50, `FavoritesViewModel.kt:399-402`).

---------------------------------------------------------------------------------------------------

## 11. Favorites page (`ui/detail/FavoritesPage.kt`, `FavoritesViewModel.kt`)

`Destination.Favorites` (nav drawer entry `NavDrawerItem.Favorites`). Tabbed page (`KeyedTabbedPage`) with one tab per **favorite type that has results**, each tab a library-style grid (4.1 layout, `showTitle=false`, no play/shuffle buttons).

### 11.1 Data
- Candidate types = `favoriteOptions` (in this order): MOVIE, SERIES, SEASON, EPISODE, BOX_SET, PERSON, TV_CHANNEL, MUSIC_ALBUM, MUSIC_ARTIST, AUDIO, MUSIC_VIDEO, PLAYLIST, VIDEO, PHOTO, PHOTO_ALBUM, restricted to kinds present in the user's libraries (`possibleFavoriteTypes`: union of `collectionType.baseItemKinds` of the user's libraries; PERSON is always appended).
- Per type (all fetched in parallel at start; page size **50**): 
  - default: `GET /Items`: `isFavorite=true, recursive=true, includeItemTypes=[type], fields=SlimItemFields, sortBy=[sort], sortOrder=[dir]` + saved filter (not overriding includeItemTypes). No `parentId`.
  - MUSIC_ARTIST: `GET /Artists` with `isFavorite=true, fields, sort`.
  - PERSON: `GET /Persons?isFavorite=true&fields=SlimItemFields` (no sort; no paging params since the Persons endpoint ignores `startIndex`).
- A tab exists only if its pager is non-empty (or it errored, so the error is visible). Tabs sorted by `favoriteOptions` order. Labels: Movies, TV Shows, Seasons, Episodes, Collections, People, Channels, Albums, Artists, Songs, Music videos, Playlists, Videos, Photos, Photo albums.
- Initial tab: remembered tab (only if "remember selected tab" pref; stored in `RememberedTab` with itemId `NavDrawerItem.Favorites.id` and value = `BaseItemKind.ordinal`) if it is among the options, else first option; if that tab's result is empty it falls forward to the first non-empty/error tab in option order; if every type is empty -> centered text "No favorites found!".
- Per-type saved display info: key `"{NavDrawerItem.Favorites.id}_{typeKey}"` with `typeKey` = `movies, series, episodes, videos, playlists, people` for those six (legacy), else the kind's serial name (`Season`, `BoxSet`...). Saved sort/filter/viewOptions; default when none: sort `SortName Ascending`, filter `GetItemsFilter(favorite=true)`, `viewOptions = type.defaultViewOptions` (4.9). The filter dropdown uses `DefaultForFavoritesFilterOptions` (no "Favorites" filter), sort list = `rememberSortOptions(type)` (4.6). Filter option values use `parentId=null` (whole server).
- Letter jump: for MUSIC_ARTIST/other uses the same request with `limit=0, enableTotalRecordCount=true`; note **the favorites implementation does not pass `nameLessThan`**, so it returns the total count (the jump goes to the end) - appears to be a bug; PERSON: none.
- Random button: random index in the type's list -> item destination.
- Click -> `item.destination()`. Long-press -> `ForBaseItem(showGoTo=true, showStreamChoices=false, ...)`. Watch toggle refreshes the single slot; **favorite toggle refetches the whole tab** (and a bug: `TypedProvider.setFavorite` calls `setWatched(itemId, favorite)` instead of `setFavorite`, so un-favoriting from this page's context menu actually marks played/unplayed) - spec the intended behaviour (un-favorite and drop from list) in the port.

---------------------------------------------------------------------------------------------------

## 12. Search page (`ui/search/*`)

`Destination.Search(query = "")` (search icon in nav drawer / remote search button / voice assistant deep link). Backdrop cleared. State survives rotation via saveable query.

### 12.1 Layout
```
+------------------------------------------------------------------------------------------+
| [pad top 16, start/end 16]  [🎤 voice (optional)]  [ 🔍 text field h=40, rounded ]  [≡ View options] |
| (tabs  Library | Discover   -> only when Seerr active && discover on && query non-blank && combined mode && header visible) |
|  --- results (vertical LazyColumn, contentPadding start/end 16, top 8, bottom 44) ---    |
|  Movies            [SeasonCard 172dp ...]                                                |
|  TV Shows          [...]                                                                 |
|  Episodes          [BannerCardWithTitle, 128dp tall, 16:9]                               |
|  Collections       [...]                                                                 |
|  People            [PersonCard 108dp circles]                                            |
|  Channels / TV programs / Albums / Artists / Songs / Music videos / Playlists / Videos / Photos / Photo albums ... |
|  Discover (Seerr)  [DiscoverItemCard ...]                                                |
+------------------------------------------------------------------------------------------+
```
Row gap vertical 12 between header parts. Text field: min height 40dp, leading magnifier icon, IME action Search with autocorrect off (`EditTextBox.kt:319-345`).

### 12.2 Behaviour
- **Debounce**: query changes trigger a search after **750 ms** (`delay(750.milliseconds)` in a `LaunchedEffect(query, combinedMode)`), re-keyed on every keystroke so only the last query runs. An **immediate** search happens on IME "Search"/Enter, on the search icon, and after voice recognition (`triggerImmediateSearch`). Blank query -> all rows cleared (`NoQuery`). Same query + same mode + not forced -> no re-run. `initialQuery` from `Destination.Search(query)` pre-fills, but the initial search is not immediate: the `LaunchedEffect(query, combinedMode)` also waits 750 ms (and re-runs 750 ms after toggling combined mode) (`SearchPage.kt:145-156`).
- **On TV the text field is read-only until Enter/Center is pressed** (to avoid the on-screen keyboard opening on focus); Back while editing exits edit mode; otherwise moves focus. (Web: normal input.)
- **Searchable types** in fixed order (`allSearchableTypes`): MOVIE, SERIES, EPISODE, BOX_SET, PERSON, TV_CHANNEL, LIVE_TV_PROGRAM, MUSIC_ALBUM, MUSIC_ARTIST, AUDIO, MUSIC_VIDEO, PLAYLIST, VIDEO, PHOTO, PHOTO_ALBUM. A type is included only if: PERSON -> always (unless excluded); TV_CHANNEL/LIVE_TV_PROGRAM/TV_PROGRAM/PROGRAM -> user has Live TV access (`policy` tvAccess); others -> the user has a library (`navDrawerService.state.allLibraries`) whose `collectionType.baseItemKinds` contains it (mapping, `CollectionFolderGrid.kt:190-250`: TVSHOWS -> SERIES, SEASON, EPISODE; MOVIES -> MOVIE; PHOTOS and HOMEVIDEOS -> VIDEO, PHOTO, PHOTO_ALBUM; MUSIC -> AUDIO, MUSIC_ARTIST, MUSIC_ALBUM; MUSICVIDEOS -> MUSIC_VIDEO; BOXSETS -> BOX_SET; PLAYLISTS -> PLAYLIST; LIVETV -> TV_CHANNEL, LIVE_TV_CHANNEL, PROGRAM, TV_PROGRAM, LIVE_TV_PROGRAM; TRAILERS -> TRAILER; BOOKS -> BOOK; FOLDERS -> FOLDER; UNKNOWN -> none; so "Collections" and "Playlists" rows appear only if a Collections/Playlists library exists and "Videos" only with a Photos/Home videos library; Live TV types ignore libraries and need `tvAccess`); and the user has not excluded it (stored per user, key `"{userId}_excludedSearchableTypes"`, JSON list). Section titles = `formatTypeName` (`ui/Formatting.kt:313`; "Movies", "TV Shows", "Episodes", "Collections", "People", "Channels", "TV programs" (`programs`, `strings.xml:935`; also for PROGRAM/TV_PROGRAM), "Albums", "Artists", "Songs", "Music videos", "Playlists", "Videos", "Photos", "Photo albums").
- **Queries** (non-combined mode: one request per included type, all fired in parallel, each section shows "Searching…" until done; sections with zero results are hidden; errors show red text in the section):
  - default: `GET /Items?searchTerm={q}&recursive=true&includeItemTypes=[type]&fields=SlimItemFields&limit=50&enableTotalRecordCount=false`.
  - LIVE_TV_PROGRAM: same with `fields=ProgramItemFields`.
  - MUSIC_ARTIST: `GET /Artists?searchTerm&fields=Slim&limit=50&enableTotalRecordCount=false`.
  - PERSON: `GET /Persons?searchTerm&fields=Slim&limit=50`.
  - **Combined mode** (`SearchPreferences.combinedSearchResults`, default **false**): single `GET /Items?searchTerm&recursive=true&includeItemTypes=<all included types>&fields=Slim&limit=50` rendered as one "Results" grid (CardGrid with `GridCard`, not `SearchPageCard`, no letters). Unlike the per-type queries it omits `enableTotalRecordCount=false`, and `includeItemTypes` contains every included type including PERSON, MUSIC_ARTIST and LIVE_TV_PROGRAM (those are served by `/Persons` and `/Artists` in category mode, so do not expect them from `/Items`); the Seerr search still runs and is filtered to MOVIE and TV (`SearchViewModel.kt:294-323`). Tabs (Library | Discover) appear only in combined mode; in category mode the Discover row is appended after the type rows when Seerr is active and discover is enabled.
  - Seerr: `searchSeerr(q)` if Seerr active and the "Discover" include switch is on (other doc).
- **Result ordering** (client side, per section and in combined mode): ascending `SearchRelevance.score(name, type, query)` (stable sort, ties keep server order): 
  - Regex query form (`^/(.+)/(i)?$` matched against the raw, un-lowercased query): `containsMatchIn` of the pattern on the **lower-cased name** (default locale); 250 if matches, else 400; an invalid regex scores 400; so a `/Foo/` without `i` can never match capital letters in the pattern. The type bonus is still added (`SearchRelevance.kt:12-27,40-50`).
  - Else (lower-cased name vs lower-cased query; the query is not trimmed): equal 0; startsWith 100; contains `" "+q` (word start) 200; contains 300; else fuzzy by Levenshtein similarity `1 - dist/max(len)`: >= .8 -> 350, >= .6 -> 375, else 400; null name -> `Int.MAX_VALUE` with no type bonus.
  - plus type bonus: SERIES 0, MOVIE 1, BOX_SET 2, EPISODE 10, others 5.
- **Result cards** (`SearchPageCard`): EPISODE -> `BannerCardWithTitle(height 128, 16:9, title=series name, subtitle="S# E# - name")` with horizontal pad 8, NO corner text and NO watched/favorite/progress overlays (none of cornerText/played/favorite/playPercent is passed, `SearchPageCard.kt:34-44`, `BannerCard.kt:62-67`); image = the episode's own Primary (search items are built with `useSeriesForPrimary=false`, `SearchViewModel.kt:244,276,310`); card width = 128 x aspect (default 16:9); MUSIC_ALBUM/ARTIST/AUDIO -> `SeasonCard` 128dp square with overlay; PERSON -> circular `PersonCard` 108dp wide (Primary image, name only, no heart); TV_CHANNEL -> 96dp tall 16:9; PROGRAM kinds (LIVE_TV_PROGRAM/PROGRAM/TV_PROGRAM) -> 96dp tall 16:9, Primary image, with subtitle = locale date range from startDate to endDate (`DateUtils.formatDateRange` with SHOW_TIME|SHOW_DATE|SHOW_WEEKDAY; null if either is missing); everything else -> `SeasonCard` 172dp tall poster with overlay (favorite/watched/progress/unplayed/version).
- **Click**: programs -> fetch program details and show a program dialog (live TV doc); everything else -> `item.destination()`. Play key -> `Playback(item)`. Long-press -> standard context menu (14.2, `showGoTo=true`, `showStreamChoices=false`); watched/favorite/delete refresh just that item in place (`GET /Items/{id}`).
- Persistence: the Discover include switch is stored per user under `{userId}_searchIncludeDiscover` (default true; turning it on re-runs only the Seerr search); excluded types under `{userId}_excludedSearchableTypes` (`SearchViewModel.kt:126-139,572-575`). Context-menu watched/favorite/delete refresh only the item at the saved row/column position and only if its id equals the changed id; after a delete the `GET /Items/{id}` fails and the toast "Error refreshing" shows (`SearchViewModel.kt:383-427`). A program click opens a program dialog with Watch (plays `channelId`; toast "Program has no channel ID" if missing, `SearchPage.kt:517`) and Record/Cancel (series or episode timer).
- **View options dialog** (center dialog 400 wide, radius 28, elevation 3): (1) "Combined search results" switch ("Show all results in a single list" / "Show results by category"), (2) "Show voice search button" switch (Visible/Hidden; default **visible**), (3) "Include types" -> dialog with a switch per searchable type (`possibleSearchableTypes`, i.e. ignoring exclusions) + "Discover" if Seerr available. Toggling a type persists; excluding in non-combined mode just hides that row, including re-runs the search, any change in combined mode re-runs.
- **Voice search** (`VoiceSearchButton`, `VoiceInputManager`): microphone button left of the text field (Android `SpeechRecognizer`; asks audio permission, takes audio focus, requires network). Result text replaces the query and runs an immediate search. (Web: Web Speech API `SpeechRecognition`.)
- After an explicit search, focus jumps to the first successful row once all rows above it have finished searching.
- Empty states: section hidden when 0 results; in combined mode a "Results / No results" placeholder; "Searching…" placeholder while loading; no global "no results" message in category mode.
- `SearchForDialog` / `SearchForViewModel` (`ui/search/SearchFor*.kt`) are used only by home-settings (pick an item to add as a row) - out of scope.

---------------------------------------------------------------------------------------------------

## 13. Shared building blocks

### 13.1 Loading / error / empty states
- Loading page: centered 48dp circular progress (`border` colour) filling the area. Tab pages use a *delayed* loading page (appears after 300 ms) while the remembered tab resolves.
- `ErrorMessage`: red title "An error occurred! Press the button to send logs to your server." (`compose_error_message_title`), a "Send app logs to current server" text button (`send_app_logs`, `strings.xml:353`; uploads logs to the server), the error message (titleLarge), the exception message (titleMedium) and the cause chain as "Caused by: ..." (titleSmall).
- Row placeholders (`LoadingRowPlaceholder`): row title + "Loading…" / "No results" / red error text (bottom pad 32).
- Rows (`ItemRow`, `ui/cards/ItemRow.kt:50-80`): `Column(gap 8){ title (titleLarge, start pad 8), LazyRow(arrangement gap = P, contentPadding h=P, v=8) }` with `P` = the `horizontalPadding` param (default 16; the person page Episodes row passes 24, so both its gap and edge padding are 24); items null while paging -> blank cards.

### 13.2 Text/animation helpers
- Card text marquee: text scrolls only after the card has been focused for **500 ms** (`rememberFocusedAfterDelay`); people cards use 1000 ms. Text block slides down 8dp when the card is focused (TV focus scale) - web may ignore.
- `OverviewText`: box padded 8, radius 8, text `bodyMedium`, `maxLines` (3 on detail pages), clickable (opens media info / overview dialog), focus bg `onPrimary @ 40%`; default fixed height `maxLines*20dp` (unspecified on detail headers).
- `HeaderUtils`: top padding 48, bottom 32, start 8, standard header height 180, logo height 60.

### 13.3 Dialog primitives
- `DialogPopup` (context menus, choose-stream etc.): title `titleLarge`, scrollable list of items (icon/leading, headline, supporting, trailing), card radius 28, padding 24, elevation 1 (3 when nested). Items start **disabled for ~1 s when opened by long-press** (so the key release doesn't activate the first item) unless Enter is released earlier. Items may have `dismissOnClick` (most do; "Choose X", "Delete", "Play with" keep the menu open and open a second dialog instead).
- `ConfirmDialog(title, body?, [Cancel] [Confirm])`; `ConfirmDeleteDialog`.
- `ScrollableDialog` (media info): width 680, max height 440, radius 8, elevation 3; keyboard up/down scrolls by 100px.
- `PlaylistDialog`: see 9.3.

### 13.4 Persisted-state key summary (all local; scope = current server user)
| Data | Store | Key |
|---|---|---|
| Library sort/filter/viewOptions (libraries, folders, genres, studios, playlists, favorites types, collections [sort+filter only]) | Room `LibraryDisplayInfo` | `(userId, itemId)`; itemId = library id, or `"{libraryId}_genres"`, `"{libraryId}_studios"`, or `"{Favorites.id}_{movies|series|episodes|videos|playlists|people|<kind serial name>}"` |
| Selected tab | Room `RememberedTab` | `(userId, itemId)`; library id or favorites id; only when `rememberSelectedTab` pref |
| Box-set view options | key-value store | `"{userId}_CollectionViewOptions"` |
| Search excluded types / include discover | key-value store | `"{userId}_excludedSearchableTypes"` (JSON list of BaseItemKind), `"{userId}_searchIncludeDiscover"` (bool) |
| Search combined / voice button | app prefs (proto) | `interfacePreferences.searchPreferences.{combinedSearchResults=false, showVoiceSearchButton=true}` |
| Chosen version/audio/subtitle per item; per-series track language | Room `ItemPlayback`, `SeriesTrackChoice` | per user + item/series |
| Show logos (default true), show clock (default true), remember tab (default false), enable media management (delete buttons; default false), theme-song volume (default Medium), per-row item cap `maxItemsPerRow` (default 25), `enableRewatchingNextUp`, display toggles (official/community/critic rating, default all on) | app prefs (proto) | see `preferences/AppPreference.kt` |

### 13.5 Theme songs (`services/ThemeSongPlayer.kt`)
On series details/overview, movie details, episode details (series theme), box set, and box-set library view: `GET /Items/{id}/ThemeSongs`, pick a random one, stream via `GET /Audio/{themeId}/universal?container=opus,mp3,aac,flac` at pref volume (`Disabled`, Lowest .05, Low .1, Medium .25 [default], High .5, Highest [coded 75f, effectively 1.0]). Stops when leaving the page or navigating.

### 13.6 Backdrop (`services/BackdropService.kt`)
App-level full-bleed background image, changed by pages. `submit(item)` -> first Backdrop image of item (EPISODE/SEASON -> series backdrop; Genre -> `imageUrlOverride`); 500 ms delay before applying; optional dynamic colour extraction (backdrop style pref). Cleared on tab change and by pages that call `onClearBackdrop` (libraries, grids, playlist, person, favorites, search, box-set header state).

---------------------------------------------------------------------------------------------------

## 14. Context menus, actions, and playback entry points

### 14.1 Where each context menu is created
| Page | Item | Trigger | `showGoTo` | `showStreamChoices` | `canDelete` | Notes |
|---|---|---|---|---|---|---|
| Library grid / list, ItemGrid, favorites, search, recommended rows, box-set items, person's (none) | any BaseItem | long-press | true | false | mediaMgmt && item.CanDelete | choose-version/tracks no-ops |
| Movie details "More" | the movie | button | false | true | same | stream choices functional |
| Series details | season card | long-press | true | false | same | |
| Series details | similar item | long-press | true | false | false | |
| Series overview | focused episode | long-press or More | false | true | same | |
| Episode details | the episode | More | false | true | same | |
| Collection details | collection (More) / items (long-press) | | false / true | false | same | |
| Playlist | item | long-press or row kebab | true | false | same | + "Remove from playlist" if canEdit |
| People rows | person | long-press | n/a (person menu) | | | `Go To`, `Favorite/Unfavorite` |

### 14.2 Item context-menu entry list (`ui/components/ContextMenu.kt` `buildContextMenuItems`) - exact order and conditions
1. **Go To** (arrow icon): if `showGoTo` and item type != AUDIO -> `navigateTo(item.destination())`.
2. If item type in `supportedPlayableTypes` = {MOVIE, EPISODE, VIDEO, MUSIC_VIDEO, TV_CHANNEL, TV_PROGRAM, RECORDING, SEASON, SERIES, BOX_SET, PLAYLIST}:
   - if `playbackPosition > 0`: **Resume** (play icon) -> `Playback(id, positionMs)` and **Restart** (refresh icon) -> `Playback(id, 0)`;
   - else **Play** -> `Playback(id, 0)`.
   (For SERIES/SEASON/BOX_SET/PLAYLIST the `Playback` destination with the container id is resolved by the playback layer via `PlaylistCreator.createFrom`, 14.5.)
3. If type in `supportedShufflableTypes` = {SEASON, SERIES, BOX_SET, PLAYLIST}: **Shuffle** -> `PlaybackList(itemId, shuffle=true)`.
4. If `showStreamChoices` and the item has `mediaSources`: choose the chosen source (or first), then
   - **Choose Audio** if the source has > 1 audio streams;
   - **Choose Subtitles** if the source has >= 1 subtitle streams;
   - **Choose Version** if `mediaSources.size > 1`.
   (Keep menu open; opens the choose dialog. Titles use `choose_stream` = "Choose %s" with "Audio" / "Subtitles" / "Version".)
5. If type is MUSIC_ALBUM or AUDIO: **Add to queue**.
6. If `showRemoveFromPlaylist`: **Remove from playlist**.
7. **Add to playlist** (list icon) - always.
8. **Delete** (red trash; keeps menu open -> confirm dialog) if `canDelete`.
9. **Remove from continue watching** (eye) if `canRemoveContinueWatching` && !played && position > 0 -> marks as unwatched (`DELETE /UserPlayedItems/{id}` which resets progress). (Home only.)
10. **Remove series from next up** if `canRemoveNextUp` && EPISODE && seriesId. (Home only.)
11. **Mark as watched / Mark as unwatched** (eye-slash/eye icon; label by current `played`).
12. **Favorite / Unfavorite** (heart; red when favorited).
13. **Go to album** if the item has `albumId`; **Go to artist** if it has `artistItems` (first artist).
14. **Go to series** if `seriesId` present (episodes, seasons) -> `MediaItem(seriesId, SERIES)`.
15. **Media Information** (info icon) if `mediaSources` non-empty -> dialog 5.11.
16. **Clear track choices** if `showStreamChoices` and the user has any saved choice (saved `ItemPlayback` or series track choices) -> deletes them.
17. **Play with** if playable type (keeps menu open) -> submenu: one entry per player backend (`ExoPlayer`, `MPV`, `External Player`; "Prefer MPV" omitted - labels from `R.array.player_backend_options`) -> `Playback(id, resumeMs, forceTranscoding=false, backend)`; plus **Transcoding** -> `Playback(id, resumeMs, forceTranscoding=true)`. (Web: likely only "Direct / Transcode".)
18. **Send media info log to server** if `mediaSources` non-empty.
Menu title = `item.title` (series name for episodes). Dialog opened from a long press ignores clicks for ~1 s.
Person menu: **Go To**, **Favorite/Unfavorite**.

### 14.3 Watched / favorite endpoints (`services/FavoriteWatchManager.kt`)
- Mark played: `POST /UserPlayedItems/{itemId}` (returns `UserItemDataDto`); unplayed: `DELETE /UserPlayedItems/{itemId}`. A local "date played" cache for the item is invalidated.
- Favorite: `POST /UserFavoriteItems/{itemId}`; unfavorite: `DELETE /UserFavoriteItems/{itemId}`.
- Delete: `DELETE /Items/{itemId}` (only when media-management pref enabled and `CanDelete`).
After success pages refetch the item (`GET /Items/{id}`) and update the slot.

### 14.4 "Choose version / tracks" persistence (movie, episode, series-overview pages only)
Dialog selection writes local `ItemPlayback(userId, itemId, sourceId?, audioIndex?, subtitleIndex?)` (`TrackIndex`: `UNSPECIFIED=-1`, `DISABLED=-2` (subtitles off), `ONLY_FORCED=-3`, otherwise the MediaStream index). For episodes/series items also stores a per-series language-based choice so later episodes follow it. These choices are consumed by playback; web port may store equivalent in localStorage.

### 14.5 Building a playback queue (`services/PlaylistCreator.createFrom`) - used by Play/Shuffle buttons and `Destination.PlaybackList`
`Playlist.MAX_SIZE = 100` items per queue.
| Source item | Query |
|---|---|
| BOX_SET / COLLECTION_FOLDER / USER_VIEW | `GET /Items?parentId={id}&recursive=true&includeItemTypes=<collection type's kinds filtered to playable, else all playable kinds>&excludeItemIds=[id]&sortBy=[sort]&sortOrder=[dir]&fields=DetailItemFields&startIndex&limit=100&excludeLocationTypes=Virtual` + the page filter (include types not overwritten); shuffle => `sortBy=Random Ascending` |
| EPISODE | `GET /Shows/{seriesId}/Episodes?startItemId={episodeId}&fields=DetailItemFields&limit=100` (+`sortBy=Random` if shuffled); queue starts at that episode |
| SEASON | `GET /Shows/{seriesId}/Episodes?seasonId={seasonId}&fields&limit=100` (shuffle: `sortBy=Random`) |
| SERIES | not shuffled: `GET /Shows/NextUp?seriesId` first result else first episode (`GET /Shows/{id}/Episodes?limit=1`), then episodes from there (`startItemId`); shuffled: `GET /Shows/{id}/Episodes?sortBy=Random&limit=100` |
| PLAYLIST | `GET /Items?parentId={playlistId}&userId&fields&startIndex&limit=100&sortBy=[sort]&sortOrder=[dir]&excludeLocationTypes=Virtual` + filter (default sort `Default`; shuffle `Random`) |
| MOVIE / VIDEO / MUSIC_VIDEO / TRAILER | the item itself; if `PartCount > 1`, append `GET /Videos/{id}/AdditionalParts` items after it (`PlaylistCreator.kt:86-107,325-340`) |
Virtual (missing) episodes are dropped (also client-side for Virtual location items); multi-part items are expanded with their additional parts; queue creation sends `userId`; for shuffle the sort is Random Ascending.

### 14.6 Item-type -> card style cheat sheet (for the port's card component)
| Context | Type | Card |
|---|---|---|
| Grid, Poster default | MOVIE, SERIES, BOX_SET, SEASON | `GridCard`, 2:3 Primary, title+subtitle |
| Grid, EPISODE default | EPISODE | `GridCard` 16:9 (Wide options) Primary/Thumb (series art unless `useSeriesForPrimary` false) |
| Rows (detail pages, search) | any | `SeasonCard` (title line + subtitle line, image height 172 poster / 128 episode / 96 live tv; width from aspect ratio, min 2:3, gap 4) with overlay |
| Episode strip | EPISODE | `BannerCard` 120 tall, `E#` corner pill |
| Search episode | EPISODE | `BannerCardWithTitle` 128 tall |
| People | PERSON | circular `PersonCard`, 108 wide |
| Chapters | chapter | `ChapterCard` 120 tall |
| Genres / Studios | GENRE, STUDIO | wide tinted tile with image |
| Extras | ExtrasItem | `SeasonCard` 128 tall |

---------------------------------------------------------------------------------------------------

## 15. Quick endpoint index (Jellyfin REST used by these pages)
| Purpose | Method + path | Key params |
|---|---|---|
| Item | `GET /Items/{id}` | (user from token) |
| Item list/grid | `GET /Items` | `parentId, recursive, includeItemTypes, excludeItemTypes, excludeItemIds, sortBy, sortOrder, fields, enableImageTypes, imageTypes, imageTypeLimit, startIndex, limit, enableTotalRecordCount, enableUserData, searchTerm, nameLessThan, ids, personIds, genreIds, studioIds, tags, officialRatings, years, minCommunityRating, isFavorite, isPlayed, is4K, isHd, is3D, videoTypes, maxPremiereDate, isUnaired, excludeLocationTypes, mediaTypes` |
| Resume | `GET /UserItems/Resume` | `userId, parentId, includeItemTypes, fields, enableUserData, enableTotalRecordCount, startIndex, limit` (also `searchTerm, mediaTypes, excludeItemTypes, imageTypeLimit, enableImageTypes`) |
| Next up | `GET /Shows/NextUp` | `seriesId?, parentId?, fields, imageTypeLimit, enableResumable, enableRewatching, enableUserData, startIndex, limit` |
| Episodes | `GET /Shows/{seriesId}/Episodes` | `seasonId, startItemId, sortBy, fields, startIndex, limit` |
| Similar | `GET /Items/{id}/Similar` | `userId, fields, limit=25` |
| Extras | `GET /Items/{id}/SpecialFeatures` | |
| Local trailers | `GET /Items/{id}/LocalTrailers` | |
| Theme songs | `GET /Items/{id}/ThemeSongs` | |
| Ancestors | `GET /Items/{id}/Ancestors` | `userId` |
| Genres | `GET /Genres` | `startIndex, limit, searchTerm, parentId, fields, includeItemTypes, excludeItemTypes, isFavorite, imageTypeLimit, enableImageTypes, userId, nameStartsWith(OrGreater), nameLessThan, sortBy, sortOrder, enableImages, enableTotalRecordCount` |
| Studios | `GET /Studios` | same as Genres minus `sortBy`/`sortOrder`, plus `enableUserData` |
| Years | `GET /Years` | `startIndex, limit, sortOrder, sortBy, parentId, fields, includeItemTypes, excludeItemTypes, mediaTypes, enableUserData, imageTypeLimit, enableImageTypes, userId, recursive, enableImages` (no `nameLessThan`, no `enableTotalRecordCount`) |
| Filters (ratings) | `GET /Items/Filters` | `parentId, userId` |
| Parental ratings | `GET /Localization/ParentalRatings` | |
| Persons / Artists | `GET /Persons`, `GET /Artists` | `searchTerm, isFavorite, fields, limit, nameLessThan` (`/Persons` has no `enableTotalRecordCount`) |
| Images | `GET /Items/{id}/Images/{Primary|Backdrop|Logo|Thumb}`, `/Images/Chapter/{index}` | `tag, fillWidth, fillHeight, quality=96, maxWidth..` |
| Played / favorite | `POST|DELETE /UserPlayedItems/{id}`, `POST|DELETE /UserFavoriteItems/{id}` | |
| Delete | `DELETE /Items/{id}` | |
| Playlists | `POST /Playlists`, `POST /Playlists/{id}/Items`, `DELETE /Playlists/{id}/Items`, `POST /Playlists/{id}/Items/{itemId}/Move/{index}`, `GET /Playlists/{id}/Users/{userId}` | |
| Additional parts | `GET /Videos/{id}/AdditionalParts` | |
| Audio (theme) | `GET /Audio/{id}/universal` | `container` |

---------------------------------------------------------------------------------------------------

## 16. Known quirks / surprises in the reference implementation (decide per case whether to replicate)
1. Movie "Library" and "Collections" tabs share one persisted `LibraryDisplayInfo` row (same library id) -> sort/filter/view options bleed between them.
2. `CollectionFolderViewModel.createGetItemsRequest` computes `includeItemTypes` from the library's collection type but `filter.applyTo(overwriteIncludeTypes=true)` overwrites it with the filter's value (null in generic folders) -> no type restriction.
3. Favorites page context-menu "Favorite" calls `setWatched` (bug) and "letter jump" ignores the letter (bug).
4. Theme song `HIGHEST` volume constant is `75f` (clamped by the player to max).
5. Person role string logic can show `"Role - Type"` combinations (5.7).
6. Studio filter values and Studio grid use `includeItemTypes=[Series]` always, even if used for non-TV libraries.
7. Playlist item removal passes item ids where the server expects playlist entry ids.
8. "Played" and "Favorites" filter values are literal `"True"/"False"` strings.
9. Series overview episode strip hides the favorite heart (not passed to `BannerCard`).
10. `DefaultPlaylistItemsOptions` is defined but unused; the playlist page uses `DefaultFilterOptions`.

---------------------------------------------------------------------------------------------------

## 17. Web adaptation questions (behaviours tied to D-pad / long-press / TV focus that need a mouse + keyboard decision)
1. **Long-press context menu**: every card has a long-press menu (Enter held). Web needs: right-click, a hover kebab button, or both? Which keyboard shortcut (e.g. `Shift+F10`/`ContextMenu` key)?
2. **Expandable icon buttons** (Play/Restart/Watched/Favorite/Trailer/More show their label only when focused): always show labels, show on hover/focus only, or use tooltips? What about touch devices?
3. **Focused-item-driven headers** (library "Show details" header, box-set header, series overview header/episode info/cast follow the focused card): on web, should this follow hover, selection (click), or keyboard focus? Hover-driven changes can flicker and trigger many requests (people-in-episode fetch is debounced 250 ms).
4. **Series overview**: episode click plays immediately and there is no separate "select" step; with a mouse, single click on a strip card = play? Or select first (update header) and play via the footer button / double-click?
5. **Collapsing header/tab row when focus moves below the first grid row**: replace with scroll-based sticky/collapse? Keep tabs always visible?
6. **Back key behaviours in grids** (Back = jump to top; long-press Back = return to previous position; letter keys jump; page up/down/media keys jump by N rows): which keyboard equivalents (Home, Page Up/Down, type-to-jump), and keep "jump back" at all?
7. **Alphabet picker**: render as a clickable vertical letter rail only, or also enable typing letters? Scroll-synced highlighting?
8. **Hover/focus scale & title sliding** on cards: reproduce or use simple hover ring?
9. **Dropdown nested menus** (filter menu -> value menu with multi-select staying open): keep as cascading popover, or use a modal/sidebar with checkboxes and an "Apply"? Is live re-query per click acceptable?
10. **View options panel** docked right with sliders: use same side panel with range inputs? Should changes apply live (as in source) or on close?
11. **Sort button long-press flips direction**: needs an alternative (separate asc/desc toggle).
12. **Voice search**: Web Speech API availability (Chrome only, needs HTTPS); keep button hidden when unsupported?
13. **Search text entry**: TV needs "activate to edit"; web uses always-editable input. Keep 750 ms debounce + Enter immediate? Autofocus on page open?
14. **Play key (media play/pause) on a focused card**: map to Space/Enter-with-modifier or a hover play button overlay on cards? Does clicking the card body open details while a play overlay plays?
15. **Dialog "waitToLoad" 1 s lockout after long-press**: unnecessary on web (drop?).
16. **Playback entry points** open full-screen player routes (`Playback`, `PlaybackList`): route naming/URL for deep links and for resume position param.
17. **External actions**: remote trailers open a YouTube link in a new tab vs embedded player; "Play with ... (External player)" and "Transcoding" options - which to expose?
18. **Theme songs on detail pages**: autoplay audio is blocked by browsers until user gesture; keep feature? Where is the setting?
19. **Backdrop service** (full-bleed image changing with focus + dynamic colours): keep dynamic colour extraction (canvas) or static dim overlay?
20. **Local persistence** (Room tables for library display info, remembered tabs, per-item track choices): store in localStorage/IndexedDB keyed per server+user, or sync to server DisplayPreferences so it roams across browsers?
21. **Delete / media-management gating** (pref default off): keep the preference gate and admin-only path/ID display?
22. **Genre/studio card artwork** (up to N concurrent random-item queries per genre, cached 2 h): keep random backdrop approach (N+1 requests on tab open) or lazy-load images on scroll?
23. **Move up/down in playlists** (focus-moving buttons): replace with drag-and-drop reordering?
24. **Series "Play" button semantics** (next-up, not a season/episode selector): confirm it should still jump straight into playback rather than into the overview page.
25. **Page-size / virtualization**: confirm 100-item windows with a total-count-sized scroller (placeholder cards) vs infinite scroll; footer "x / total" indicator on web?
26. **Time zone**: source formats UTC dates in local time (known off-by-one); decide date-only formatting in UTC for premiere/birth dates.
