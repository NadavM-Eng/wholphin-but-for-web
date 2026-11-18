# Spec 04 — Live TV/DVR, Music, Photo Slideshow, Seerr Discover

Source root (all paths below are relative to it unless noted):
`reference/wholphin/app/src/main/java/com/github/damontecres/wholphin/` — abbreviated `W/`.
Resources: `reference/wholphin/app/src/main/res/values/strings.xml` — abbreviated `strings.xml`.
"dp" values are Compose density-independent pixels (a 1080p TV is ~960x540 dp). 1dp ~ 1 CSS px is a reasonable web mapping; how to scale for large/small viewports is a decision (see Web adaptation questions). Line numbers are approximate where written with "~".

---------------------------------------------------------------------------------------------------

# A. LIVE TV & DVR

## A.1 Entry points / navigation

- Live TV library: a Jellyfin user view with `collectionType == LIVETV`. `supportedCollectionTypes` includes LIVETV (`W/util/Constants.kt:25-37`). Library list is built by `NavDrawerService.getAllUserLibraries` (`W/services/NavDrawerService.kt:127-165`):
  - `GET /UserViews?userId=` (SDK `userViewApi.getUserViews`).
  - If user policy `EnableLiveTvAccess == true` (`W/data/model/ServerUserConfig.kt:27`, `tvAccess`), also `GET /LiveTv/Recordings/Folders?userId=` (`liveTvApi.getRecordingFolders`). A 401/403 there is swallowed (empty set) (`NavDrawerService.kt:139-150`).
  - Libraries kept = views whose collectionType is supported OR whose id is a recording folder.
  - Nav destination: recording folder -> `Destination.Recordings(itemId)`; else `Destination.MediaItem(itemId,type,collectionType)` (`NavDrawerService.kt:200-215`).
- `DestinationContent` routes `CollectionType.LIVETV` MediaItem -> `CollectionFolderLiveTv` (`W/ui/nav/DestinationContent.kt:481`) and `Destination.Recordings` -> `CollectionFolderRecordings` (`DestinationContent.kt:320`).
- Nav drawer icon for LIVETV: drawable `gf_dvr` (`W/ui/nav/NavDrawer.kt:684`).
- Home rows related to Live TV (`W/services/HomeDataService.kt:539-640`, `HomeRowConfig.kt:128`): see A.9.

## A.2 Live TV library page = tabbed page (`W/ui/detail/CollectionFolderLiveTv.kt`)

Tabs (`CollectionFolderLiveTv.kt:107-112`): `Guide` (strings `tv_guide`), `DVR Schedule` (`tv_dvr_schedule`), then ONE TAB PER RECORDING FOLDER (tab title = folder `name ?: "Recordings"`).
- Recording folders loaded by `GET /LiveTv/Recordings/Folders?userId=<currentUser>` (`CollectionFolderLiveTv.kt:58-63`). Error -> `ErrorMessage`; loading -> `LoadingPage`.
- `TabbedPage` header (tab row) is hidden (`showTabs=false`) while the guide's focused row > 0 (`onRowPosition = { showHeader = it <= 0 }`, line 135) and in recording-folder tabs while the focused grid position >= column count (`positionCallback`, lines 167-169; the recording-folder `CollectionFolderView` also gets `showTitle=false` (line 163) and `focusRequesterOnEmpty` = the tab header (line 172)). Tab selection is remembered: `TabbedPage` keys a `TabViewModel` on itemId + tab count; if `interfacePreferences.rememberSelectedTab` is on, the starting tab is loaded from the Room `RememberedTab` table (per Jellyfin user rowId + itemId, coerced into the tab range, default 0) and selecting a tab saves it (`ui/components/TabbedPage.kt:40-119`, `services/RememberedTabService.kt:15-36`). The tab row has vertical padding 16dp, end padding 184dp when the clock is shown, and expand/shrink visibility animation.
- Recording-folder tab content = generic `CollectionFolderView(itemId=folderId, recursive=false, sortOptions=VideoSortOptions, defaultViewOptions=ViewOptions(), playEnabled=false, initialFilter=CollectionFolderFilter())`. Clicking an item -> `item.destination()`. For Live TV recording items (type `RECORDING`/movie/episode etc.) that is the normal item detail/play destination. VideoSortOptions = SORT_NAME, PREMIERE_DATE, DATE_CREATED, DATE_PLAYED, COMMUNITY_RATING, CRITIC_RATING, OFFICIAL_RATING, RUNTIME, PLAY_COUNT, RANDOM (`W/ui/data/SortAndDirection.kt:73-84`).
- Separate `Destination.Recordings(itemId)` (nav drawer when the recording folder is a top-level user view) shows `CollectionFolderRecordings` (invoked with `recursive=false`, `DestinationContent.kt:320-326`): `CollectionFolderView` with `MovieSortOptions`, `defaultViewOptions=ViewOptionsPoster`, `playEnabled=false`, title shown only while the first grid row is focused (`W/ui/detail/CollectionFolderRecordings.kt:19-43`).
- There is NO separate "series timers" page. Series timers appear only through DVR Schedule rows (as the scheduled timers' program infos) and cancellation via `seriesTimerId` (see A.6). No "timers list" other than DVR Schedule.

## A.3 TV Guide tab (`W/ui/detail/livetv/TvGuideGrid.kt`, `LiveTvViewModel.kt`, `Components.kt`, `TvGuideHeader.kt`)

### Library
`eu.wewox.programguide.ProgramGuide` (third-party Compose lib; a 2D lazily-laid-out grid with sticky channel column and timeline row, programs placed by fractional hour start/end). Items are given `ProgramGuideItem.Program(channelIndex, startHour, endHour)`, `Channel(index)`, `Timeline(startHour,endHour)`, `CurrentTime(hour)`. `guideStartHour = 0f` (`TvGuideGrid.kt:375`).

### Dimensions (`TvGuideGrid.kt:294-301`)
```
timelineHourWidth = 240dp   (1 hour = 240dp; 4dp per minute)
timelineHeight    = 32dp
channelWidth      = 120dp
channelHeight     = 64dp     (= row height)
currentTimeWidth  = 2dp
```

### Layout sketch
```
Column(spacedBy 4dp) fill
+----------------------------------------------------------------------------------+
| [TvGuideHeader] (only if pref showHeader; fillMaxHeight(.30f); padding top 48dp,   |
|    start 8dp, plus each text element inset another 8dp => text starts ~16dp)  title (big) | image(right, program primary image, crossfade 300ms)  |
|    subtitle(episode name) / quickDetails + "Repeat" label / overview (3 lines)   |
+----------------------------------------------------------------------------------+
| [View options] button (sliders icon, fa_sliders) -- only visible when focused    |
|   row < 1 (animated expand/shrink); start padding = 120dp (channelWidth)         |
+--------+-------------------------------------------------------------------------+
| corner | 6:00 PM | 6:30 PM? | 7:00 PM | ...  (timeline, h=32dp, hour cell 240dp)  |
| (surf) |  cells: surfaceVariant bg, radius 4dp, horizontal pad 2dp, text pad 2dp   |
+--------+-------------------------------------------------------------------------+
| ch 120 | program cells (padding 2dp each, radius 4dp), row height 64dp             |
| x 64dp | [num] [logo]                | Title 16sp (1 line, ellipsis)            |
|        | [name 10sp]                 | "S1E3 - Episode title" 14sp               |
|        |                             |                         recording dot BR |
|  ...   |    | <- now indicator: vertical 2dp bar, tertiary color @ 25% alpha      |
+--------+-------------------------------------------------------------------------+
                                            refreshing spinner: 64dp circle, BottomEnd, bg @50%
```
Container background = `colorScheme.background`; top-left corner box = `colorScheme.surface`.

### Time model
- `MAX_HOURS = 48` (`LiveTvViewModel.kt:71`). Guide window: `guideStart = now rounded DOWN to :00/:30` (`roundDownToHalfHour`, line 701). Window end = guideStart + 48h.
- `guideTimes` (timeline labels, `buildGuideTimes` 188-198): `[start]`, plus `start+30m` if start.minute==30, then 47 more entries each +1h from the last. So when start is on the half hour the first label cell is only 30 min wide (the next label starts +30 min), and subsequent cells hour-aligned to :00. Each label cell spans label[i] -> label[i+1] (last: +1h), width = hours * 240dp.
- Label text: locale time (`DateUtils.FORMAT_SHOW_TIME`) plus WEEKDAY when the label date differs from guideStart date (`TvGuideGrid.kt:425-438`).
- Horizontal coordinate of anything = `hoursBetween(guideStart, t)` hours * 240dp. Program `startHours` clamped >= 0; `endHours` unclamped; positioned using `abs(endHours - startHours)` as duration ("accounts for daylight saving", comment line 447).
- Programs that started before guideStart: cell shape = rounded only on the right (4dp end corners, 0 start) and a "caret-left" FontAwesome glyph (16sp) at the left (`Components.kt:44-97`).
- Now-indicator: `currentTime` at `hoursBetween(guideStart, now)`; a 2dp-wide full-height Surface, color `colorScheme.tertiary` alpha 0.25 (`TvGuideGrid.kt:376-394`). Computed once at composition (not live ticking in this code — a web port should tick).
- No auto-refresh timer of the guide; reload only on pref change (see A.5), record/cancel actions, and focus-driven paging.

### Channel list API call (`LiveTvViewModel.kt:124-143`)
`GET /LiveTv/Channels` via `GetLiveTvChannelsRequest`:
```
startIndex = 0
userId = current user id
enableFavoriteSorting = pref favoriteChannelsAtBeginning   (default true)
sortBy = [DatePlayed] if pref sortByRecentlyWatched else null     (default false)
sortOrder = Descending if sortByRecentlyWatched else null
addCurrentProgram = false
(no limit -> all channels in one request)
```
Channel mapping: `id`, `number = channelNumber`, `name = channelName ?: name`, `imageUrl = getItemImageUrl(id, PRIMARY, tag=imageTags[Primary])`, `favorite = userData.isFavorite`. No channel-type filter (radio mixed), no `isFavorite` filter. If channels empty -> text error "Live TV is enabled, but no channels were found." (`TvGuideGrid.kt:127`).

### Program fetch (`fetchPrograms`, 224-434)
`POST /LiveTv/Programs` (`liveTvApi.getPrograms(GetProgramsDto)`):
```
maxStartDate = guideStart + 48h - 1min
minEndDate   = guideStart + 1min
channelIds   = ids of the channel slice being fetched
sortBy       = [StartDate]
userId       = current user
fields       = [Overview]
```
Result then filtered client-side to `endDate > guideStart`. Items grouped by `channelId`.
Loading strategy:
1. First load only channels `[0, 10)` (fast first paint), set `loading=Success`.
2. Then load `[0, min(100, N))` ("range = 100").
3. `onFocusChannel(position)` (498-538): fetched window `range`; let `quarter = 25`; test range = fetched.start+25 .. fetched.last-25 (if that is smaller than 100 and focus row < 50 -> testStart=0; if row > N-50 -> testEnd=N). If focused row is NOT inside the test range AND the new window `[row-100, row+100]` (clamped) is not wholly within already-fetched window -> cancel previous job and refetch that window (spinner shows via `refreshing`). A mutex serialises fetches. Only the most recent fetched window's programs are kept in state (`FetchedPrograms.range`).
Per program mapping: `id`, `channelId`, `start/end` (LocalDateTime), `startHours/endHours` relative to guideStart, `duration = runTimeTicks`, `name = (seriesName ?: name)` with whitespace collapsed, `subtitle = episodeTitle` only if `isSeries` (whitespace collapsed), `overview`, `officialRating`, `seasonEpisode` (if both parentIndexNumber & indexNumber), `isRecording = timerId not blank`, `isSeriesRecording = seriesTimerId not blank`, `isRepeat`, `category`, `imageUrl = Primary image`.
Category precedence: `isKids` -> KIDS, `isMovie` -> MOVIE, `isNews` -> NEWS, `isSports` -> SPORTS, else null.
Gap filling ("fake" programs, name = "No data", category FAKE): leading gap before first program -> 1-hour fakes; gaps between programs -> fakes of <=1h; after last program until hour 48 -> fake to next integer hour then 1h fakes; a channel with no programs -> 48 one-hour fakes. Final list sorted by (channel index, start).

### Program cell (`Components.kt:36-142`)
- Surface, padding 2dp, fills assigned box; radius 4dp (or right-only if started before guide); focus scale 1.0 / 1.0 / pressed .95.
- Colors: if pref colorCodePrograms (default true): container = `category.color ?: surfaceColorAtElevation(1dp)`; else `surfaceColorAtElevation(1dp)`. Content `onSurface`. Focused: container `inverseSurface`, content `inverseOnSurface`.
- Category colors (`W/ui/UiConstants.kt:29-32`): KIDS `#21556E` (DarkCyan), NEWS `#114000` (DarkGreen), MOVIE `#261370` (DarkPurple), SPORTS `#400000` (DarkRed); FAKE has no color.
- Content: title 16sp 1 line ellipsis (`name ?: id`); second line 14sp: `"S{n}E{m}" + " - " + subtitle` (formatSeasonEpisode) joined by " - ", ellipsis only (no `maxLines`, so it can wrap within the 64dp row); padding start 2 end 4 top 4 bottom 4dp, 4dp spacing. Source assumes non-null `channelId`, `startDate`, `endDate`, `runTimeTicks` (`!!`; programs with a null channelId are dropped by the group-by) -- a web port should guard (`Components.kt:125-133`, `LiveTvViewModel.kt:250-284`).
- Recording marker (`RecordingMarker.kt`) bottom-end: single recording = red 16dp circle (padding 4dp); series recording = two overlapping 16dp circles (second offset 6dp, 50% alpha), color red if this very airing is recording else gray.
- Channel cell (`Components.kt:145-228`): Surface radius 8dp, container `surfaceColorAtElevation(2dp)`, focused `inverseSurface`, outer padding 2dp over background, inner 4dp; Row (vertically centred, `spacedBy(8.dp)`): channel number (`channel.number ?: ""`, bodyMedium, 1 line) then Column(logo image weight 1 — hidden on load error — over name bodySmall 10sp, or 16sp when no image). Favorite -> red heart (FontAwesome `fa_heart`, 16sp, `holo_red_light`) at TopEnd.

### Header (focused program) (`TvGuideHeader.kt`)
Shows program of focused cell: title (no logo), episode name, quickDetails line + "Repeat" `StreamLabel` (`live_tv_repeat`) when repeat, overview max 3 lines (not clickable). Right: program Primary image (crossfade 300ms). Inside the header every text element has its own extra 8dp start padding (on top of the container's 8dp); title width 75%, detail column (episode name, quick details, overview) width 60% (`TvGuideHeader.kt:47-65`). `quickDetails` = time range (+ weekday if not today), " · " duration (rounded min), " · N left" when airing now (`time_left`), " · S1E2", " · officialRating`; fake programs show only the time range (`LiveTvViewModel.kt:614-655`).
Header and guide area are the same page; header height 30% of screen.

### Interactions
- Program click:
  - Fake ("No data") program: if airing now (now between start/end) -> navigate `Playback(itemId=channelId, positionMs=0)` (tune to channel anyway); else toast "No guide data found!".
  - Real program -> `GET /LiveTv/Programs/{programId}` (`liveTvApi.getProgram(programId)`, no user id param passed) and open Program dialog (A.4) — dialog shows spinner until loaded, error message on failure.
- Channel click -> small dialog titled channel name: items "Watch live" (play icon -> `Playback(channelId)`) and "Favorite"/"Unfavorite" (heart icon, red when currently favorite) (`TvGuideGrid.kt:259-291`). Favorite toggle calls `FavoriteWatchManager.setFavorite(channelId, !fav)` -> Jellyfin `POST /UserFavoriteItems/{itemId}` / `DELETE /UserFavoriteItems/{itemId}` with no `userId` query (optional in the SDK; the server infers the user from the token) (`W/services/FavoriteWatchManager.kt:33-41`), then updates channel list in memory only (no re-sort until next init).
- Long click: no-op on both.
- Keyboard/D-pad: standard grid focus; focus moves auto-scroll the guide to center the program (`animateToProgram(index, Center)`) or channel (`animateToChannel(index, CenterVertically)`). Back press #1 when focused column>0: jump focus back to the first program of the current channel row; Back #2 when row>0: jump to program index 0 (top row, now). Web: map to Home/Esc behaviors (decision for builders).
- Initial focus: first program (index 0).
- Error states: guide load error -> `ErrorMessage(exception)`; pending -> `LoadingPage`; refresh failure also sets `loading=Error`.

## A.4 Program dialog (`W/ui/detail/livetv/ProgramDialog.kt`)

Modal, bg `surfaceColorAtElevation(5dp)`, radius 16dp, padding 16dp, column spacing 8dp:
```
Title (titleLarge)  = program name
[if isSeries] "S1E2 - Episode title" (titleMedium)    -- uses dto.seasonEpisode/episodeTitle
time range (titleSmall) e.g. "7:00 - 8:00 PM"
overview (bodyMedium, 3 lines ellipsis)
        [ > Watch live ]                  <- only if start < now < end (strict)
  [ x Cancel Series Recording | Record Series ]  [ x Cancel Recording | Record Program ]
     ^ one centred horizontal row; first button only if isSeries, second only if end is null or > now
     ^ the whole record row exists only when the `canRecord` parameter is true (guide and DVR tab both pass true)
```
Under the overview: `Column(spacedBy 16dp, centred, top padding 8dp)`; first the Watch-live button (strict `isAfter(start) && isBefore(end)`), then, iff `canRecord`, a horizontally centred `LazyRow` (spacing 16dp) holding the series button and the program button side by side (`ProgramDialog.kt:143-182, 223`).
- State: Pending/Loading -> 48dp spinner (padding 8dp); Error -> ErrorMessage; Success -> above.
- `isRecording = timerId non-blank`; `isSeriesRecording = seriesTimerId non-blank` (from the `/LiveTv/Programs/{id}` response). Cancel buttons show a red close icon.
- Actions (TvGuideGrid.kt:206-243): Watch -> dismiss + `Playback(channelId, 0)` (toast "Program has no channel ID" if absent). Record(series) -> `LiveTvService.record` then dismiss then refresh programs. Cancel -> `LiveTvService.cancelRecording(series, timerId = series ? seriesTimerId : timerId)` then refresh.
- Strings: `watch_live` "Watch live", `record_program` "Record Program", `record_series` "Record Series", `cancel_recording` "Cancel Recording", `cancel_series_recording` "Cancel Series Recording".

## A.5 View options dialog (`LiveTvViewOptionsDialog.kt`, prefs `W/preferences/AppPreference.kt:1062-1110, 1405`)

Right-aligned panel (gravity END, no dim), width 256dp, max height 380dp, radius 8dp, bg `surfaceColorAtElevation(6dp)`, title "View options" (titleMedium, center), then 4 switches (padding 16dp):
| Pref (proto `LiveTvPreferences`, `src/main/proto/WholphinDataStore.proto:162-167`) | label (strings) | default |
|---|---|---|
| `show_header` | `show_details` "Show details" | true |
| `favorite_channels_at_beginning` | `favorite_channels_at_beginning` "Show favorite channels first" | true |
| `sort_by_recently_watched` | `sort_channels_recently_watched` "Sort channels by recently watched" | false |
| `color_code_programs` | `color_code_programs` "Color-code programs" | true |
Each switch shows summaryOn "Enabled" / summaryOff "Disabled". Title has vertical padding 8dp; list content padding 16dp. Changes persist immediately by replacing the whole AppPreferences datastore value (`ui/detail/livetv/TvGuideGrid.kt:246-257`); the guide reacts live to `showHeader`/`colorCodePrograms`. The opening button lives in the guide (`fa_sliders` icon, label "View options", start padding = channel column width 120dp) (`TvGuideGrid.kt:151-158`; `LiveTvViewOptionsDialog.kt:61-103`).
Changing `favoriteChannelsAtBeginning` or `sortByRecentlyWatched` re-initialises the guide (debounced 500ms; state reset -> reload channels + programs) (`LiveTvViewModel.kt:98-113`). Others re-render only. These are per-device app preferences (datastore), not server settings.

## A.6 DVR Schedule tab (`W/ui/detail/livetv/DvrSchedule.kt`)

API calls on open and after every cancel (`DvrScheduleViewModel.init`, 74-114):
- Active: `GET /LiveTv/Recordings?isInProgress=true&fields=<SlimItemFields>&limit=100` (userId not passed in this call) -> `BaseItem.from(..)`.
- Scheduled: `GET /LiveTv/Timers?isActive=false&isScheduled=true` -> each `TimerInfoDto.programInfo!!` converted to BaseItem, grouped by `startDate.toLocalDate()` (TODO in source: breaks for time-based recordings without programInfo — web should guard null).
Layout: centered column width 60% of the screen, bg `surface`, content padding 16dp, spacing 8dp.
```
[ No scheduled recordings ]  (headlineSmall, centered) -- only if both empty
Active Recordings            (headlineMedium)
  ListItem(row): Title | (S/E - episode title) | trailing time range "7:00-8:00 PM"
<Weekday, Date>              (headlineSmall) per date ascending
  ListItem rows...
```
ListItem bg `surfaceColorAtElevation(1dp)`; leading image is a TODO (none). Click row -> ProgramDialog (Success state, canRecord=true): Watch (if airing), Record (no-op in DVR tab), Cancel -> `DELETE /LiveTv/Timers/{timerId}` or `DELETE /LiveTv/SeriesTimers/{seriesTimerId}` (SDK `cancelTimer` / `cancelSeriesTimer`) then reload both lists. NB: if the programInfo has no `timerId` the cancel is silently skipped (`DvrSchedule.kt:209-213`).
Focus: after load focuses list if non-empty else the tab header.
Differences from the guide's use of the same dialog (`DvrSchedule.kt:70-72,144-146,181-216`): `onWatch` does NOT dismiss the dialog (the guide's does); the Record buttons are shown but `onRecord` is a no-op and does not dismiss; the cancel handler dismisses before calling the API. `init()` runs twice on open (ViewModel `init` and a `LaunchedEffect`). Within a date, scheduled items keep server order; only the date keys are sorted ascending (`keys.sorted()`). Active-recording rows open the same dialog with the recording item (so "Watch live" appears if now is inside its start/end window).

## A.7 Recording / timer API (`W/services/LiveTvService.kt`)
| Action | Calls |
|---|---|
| fetch program | `GET /LiveTv/Programs/{programId}` (programId as server-string UUID, no dashes) -> `BaseItem` |
| record single | `GET /LiveTv/Timers/Defaults?programId={id}` -> `SeriesTimerInfoDto d`; then `POST /LiveTv/Timers` with `TimerInfoDto` copied from d: id,type,serverId,externalId,channelId,externalChannelId,channelName,programId,externalProgramId,name,overview,startDate,endDate,serviceName,priority,prePaddingSeconds,postPaddingSeconds,isPrePaddingRequired,isPostPaddingRequired,keepUntil (note: copies a subset; `isPrePaddingRequired` etc. forwarded as given) (lines 59-93) |
| record series | `GET /LiveTv/Timers/Defaults?programId={id}` then `POST /LiveTv/SeriesTimers` with the defaults DTO as-is |
| cancel single | `DELETE /LiveTv/Timers/{timerId}` |
| cancel series | `DELETE /LiveTv/SeriesTimers/{timerId}` |
After record/cancel the guide re-fetches the current channel window so markers update. Errors: toast `"Error: <message>"` (cancel uses an auto-toast exception handler).

## A.8 How live playback starts
- Any channel item / program -> `Destination.Playback(itemId = channelId, positionMs = 0)` (`W/data/model/BaseItem.kt:308-322`: TV_CHANNEL -> Playback; PROGRAM -> Playback(channelId) or MediaItem fallback). `Destination.Playback` is a "fullscreen" destination (`Destination.kt:88-97`).
- `PlaybackViewModel` (`W/ui/playback/PlaybackViewModel.kt:480-520`): `isLiveTv = item.type == TV_CHANNEL`. For live TV: no media source selection (`mediaSource=null`), no saved-ItemPlayback source override (it still reads DB row but ignores), no audio/subtitle stream choice (`audioStreamIndex`/`subtitleStreamIndex` null), `createPlayer(hdr=false, is4k=false)`; no trickplay. The chapters (`Chapter.fromDto`, line 593) and `listenForSegments(item.id)` (line 623) code still runs but finds nothing for a channel. Only `BaseItemKind.TV_CHANNEL` sets `isLiveTv`; `RECORDING` items (recording folders / active recordings) take the normal non-live path with media source selection (`PlaybackViewModel.kt:480-537`).
- Then `changeStreams` (660-720) calls `POST /Items/{channelId}/PlaybackInfo` (`mediaInfoApi.getPostedPlaybackInfo`) with body `PlaybackInfoDto{ startTimeTicks=null, deviceProfile=<ExoPlayer device profile or MPV profile>, maxAudioChannels=null, audioStreamIndex, subtitleStreamIndex, mediaSourceId=null, alwaysBurnInSubtitleWhenTranscoding=false, maxStreamingBitrate, enableDirectPlay, enableDirectStream, allowVideoStreamCopy=enableDirectStream, allowAudioStreamCopy=enableDirectStream, enableTranscoding=true, autoOpenLiveStream=true }`.
- Server returns a media source with `liveStreamId` (autoOpenLiveStream). URL: direct play -> `GET /Videos/{channelId}/stream?static=true&mediaSourceId=&liveStreamId=&tag=<eTag>&playSessionId=` (remote sources use `source.path` directly); otherwise `api.createUrl(source.transcodingUrl)` (HLS, `Codec.Container.HLS` -> mime m3u8; `DASH` -> `application/mpd`). Direct-play URL params: `mediaSourceId=source.id`, `liveStreamId=source.liveStreamId`, `static=true`, `tag=source.eTag`, `playSessionId=response.playSessionId`. If `PlaybackInfo` returns `errorCode`, the player shows that error; if no usable URL, error text "Unable to get media URL from the server. Do you have permission to view and/or transcode?" (`PlaybackViewModel.kt:704-736`). `PlaybackViewModel.kt:808` only stores `liveStreamId`/`playSessionId` in `CurrentPlayback`; the Start (`POST /Sessions/Playing`), Progress (every 5 s via timer + on play/pause change, only when position > 0) and Stopped reports built in `TrackActivityPlaybackListener.kt:57-99,123-143` each carry `liveStreamId`, `playSessionId` and the real `playMethod` (DirectPlay/DirectStream/Transcode from the PlaybackInfo response) plus audio/subtitle stream indices.
- Web hint: for HLS use hls.js with the `transcodingUrl`; report with `POST /Sessions/Playing`, `/Playing/Progress`, `/Playing/Stopped` including `LiveStreamId` + `PlaySessionId` (Android does exactly this via `TrackActivityPlaybackListener`, passing `liveStreamId` from the media source, stored at `PlaybackViewModel.kt:808`). The Android code never calls an explicit live-stream close endpoint; closing relies on the Stopped report.

## A.9 Other Live TV surfaces
- Home rows (`HomeRowConfig.Recordings`, `TvPrograms`, `TvChannels`):
  - Active recordings row: `GET /LiveTv/Recordings?userId&isInProgress=true&fields=HomeItemFields&limit&enableImages=true&enableUserData=true&enableTotalRecordCount=false`, title `active_recordings` (`HomeDataService.kt:539-575`).
  - "Watch live" row (TV programs), title `watch_live`: `POST /LiveTv/Programs` (SDK `liveTvApi.getPrograms(GetProgramsDto)` = the body overload, same as A.3) with JSON body `GetProgramsDto{userId, fields=ProgramItemFields (= DetailItemFields + ChannelInfo, `ui/UiConstants.kt:91`), limit, enableUserData=true, enableImages=true, enableImageTypes=[Primary,Logo], imageTypeLimit=1, isAiring=true, minEndDate=now+1min}` (`:577-600`).
  - Channels row: `GET /LiveTv/Channels?userId&fields&limit&enableImages=true`, title `channels` (`:617-640`).
  - Generic library views of LIVETV types: item kinds TV_CHANNEL/LIVE_TV_CHANNEL/PROGRAM/TV_PROGRAM/LIVE_TV_PROGRAM (`ui/components/CollectionFolderGrid.kt:227-236`).
- Favorites page includes channels (`ui/detail/FavoritesViewModel.kt:778`).

## A.10 Empty / error states summary
| Situation | UI |
|---|---|
| Guide loading | LoadingPage spinner |
| Guide API error | ErrorMessage with exception text |
| No channels | "Live TV is enabled, but no channels were found." |
| Channel without programs | 48 hour-wide "No data" cells |
| Click "No data" cell airing now | tune channel; otherwise toast "No guide data found!" |
| Program fetch failure | dialog ErrorMessage |
| DVR empty | "No scheduled recordings" |
| Recording tabs empty | centred "No results" (`no_results`) from the generic grid (`ui/detail/CardGrid.kt:234-240, 396-400`); focus moves to the tab header (`focusRequesterOnEmpty`) |
| Recording-folder list load failure (Live TV page) | ErrorMessage (`CollectionFolderLiveTv.kt:58-100`) |
| DVR Schedule load failure | ErrorMessage (`DvrSchedule.kt`) |
| Program dialog "Watch" with no channelId | toast "Program has no channel ID" (`TvGuideGrid.kt:223`, `DvrSchedule.kt`) |
| Tab index outside folder range | ErrorMessage "Invalid tab index N" (`CollectionFolderLiveTv.kt:190-195`) |
| record/cancel error | toast "Error: msg" |

---------------------------------------------------------------------------------------------------

# B. MUSIC

## B.1 Where music lives

| Concept | Source |
|---|---|
| Music library (collectionType MUSIC) -> `CollectionFolderMusic` (5 tabs) | `W/ui/nav/DestinationContent.kt:489`, `W/ui/detail/CollectionFolderMusic.kt` |
| Album page (`BaseItemKind.MUSIC_ALBUM`), optional `initialSongId` | `DestinationContent.kt:256`, `W/ui/detail/music/AlbumDetailsPage.kt` |
| Artist page (`MUSIC_ARTIST`) | `DestinationContent.kt:266`, `ArtistDetailsPage.kt` |
| Song page (`AUDIO`), only used when the song has no album | `DestinationContent.kt:275`, `SongDetailsPage.kt` |
| Playlist (`PLAYLIST`) -> `PlaylistDetails` (generic grid; AUDIO playlists play via MusicService) | `DestinationContent.kt:192`, `W/ui/detail/PlaylistDetails.kt` |
| Now Playing (`Destination.NowPlaying`, fullscreen) | `DestinationContent.kt:353`, `W/ui/nav/Destination.kt:167` |
| Genres (grid inside music library; click -> filtered collection) | `W/ui/components/GenreCardGrid.kt` |
| Music videos (`MUSIC_VIDEO`) | rows on album/artist pages; plays as video (B.9) |
| Theme songs | `W/services/ThemeSongPlayer.kt` (B.10) |
| Queue / player / session | `W/services/MusicService.kt` |

`BaseItem.destination()` for an AUDIO item: if the song has `albumId` -> `Destination.MediaItem(albumId, MUSIC_ALBUM, initialSongId = song.id)` (opens the album scrolled/focused to that song), else `Destination.MediaItem(item)` = Song page (`W/data/model/BaseItem.kt:327-337`).

## B.2 Music library page (`CollectionFolderMusic.kt`)

`TabbedPage` with tabs in order: Recommended, Albums, Artists, Genres, Songs. Tab header hides when the focused row >= 1 / grid position >= column count.

| Tab | Content | API |
|---|---|---|
| Recommended | `RecommendedMusic`: item rows (square cards, height `Cards.HEIGHT_EPISODE`, titles shown): "Recently Released", "Recently added", "Top Rated" (exact strings `recently_released`/`recently_added`/`top_rated`), then the suggestions row (title `suggestions`, type MUSIC_ALBUM from `RecommendedContent`) LAST; each row is limited to `homePagePreferences.maxItemsPerRow` and shows a View-more item when count >= limit; items use `useSeries=true` (`W/ui/components/RecommendedContent.kt:104-171`) | `GET /Items?parentId=<lib>&includeItemTypes=MusicAlbum&recursive=true&enableUserData=true&fields=<Slim>&enableTotalRecordCount=false` plus: released `sortBy=PremiereDate,SortName&sortOrder=Descending,Ascending&maxPremiereDate=now`; added `sortBy=DateCreated&sortOrder=Descending`; top rated `sortBy=CommunityRating&sortOrder=Descending` (`W/ui/components/RecommendedMusic.kt:30-80`) |
| Albums | `CollectionFolderView` square-card grid, `includeItemTypes=[MusicAlbum]`, recursive; sort options `AlbumSortOptions` = SORT_NAME, PREMIERE_DATE, DATE_CREATED, DATE_PLAYED, ALBUM_ARTIST, COMMUNITY_RATING, CRITIC_RATING, RANDOM (`W/ui/data/SortAndDirection.kt:117`); Play-all enabled | `GET /Items` (paged) |
| Artists | same grid, filter override ARTIST; a view option `ArtistSource` toggles ARTIST vs ALBUM_ARTIST (`ViewOptionsDialog.kt:135`, `CollectionFolderView.kt:462-482`); sort `ArtistSortOptions` = SORT_NAME, PREMIERE_DATE, DATE_CREATED, DATE_PLAYED, COMMUNITY_RATING, CRITIC_RATING, RANDOM; playEnabled=false | `GET /Artists?parentId=<lib>&fields=Slim&enableImageTypes=Primary,Thumb` or `GET /Artists/AlbumArtists?...` (`W/util/ApiRequestPager.kt:401,420`) |
| Genres | `GenreCardGrid`, 4 columns, 16dp spacing; each genre card image = a random item in that genre (4 concurrent requests, cached 2 h per user+library) | `GET /Genres?userId&parentId=<lib>&fields=Slim&includeItemTypes=MusicAlbum` (`genreApi.getGenres`, `ApiRequestPager.kt:284`); image per genre via `GET /Items?userId&parentId=<lib>&recursive=true&limit=1&sortBy=Random&fields=Genres&imageTypes=Backdrop&imageTypeLimit=1&includeItemTypes=MusicAlbum&genreIds=<genreId>&enableTotalRecordCount=false`; the card image is that random item's BACKDROP (`Items/{id}/Images/Backdrop` from `backdropImageTags`, `fillWidth=(screenWidthDp - (2*16 + 3*16))/4` px), so genres whose items have no backdrop get no image; 4 concurrent, cache = 8 entries, 2 h, keyed (user, parent) (`GenreCardGrid.kt:170-246, 274-288`). The genre grid is a `CardGrid` with letter buttons (A-Z) and no jump buttons (`showJumpButtons=false`, `showLetterButtons=true`, `GenreCardGrid.kt:326-329`); long-click is a no-op; letter jump = `GET /Genres?nameLessThan=<letter>&limit=0&enableTotalRecordCount=true`. Click -> `Destination.FilteredCollection(parent library, filter genres=[genreId] + includeItemTypes=[MusicAlbum], recursive=true, nameOverride="<genre> <library name>")` (`W/data/model/BaseItem.kt:380-407`; the filter also sets `useSavedLibraryDisplayInfo=true` and `libraryDisplayInfoIdOverride="<libraryId>_genres"`, `collectionType=MUSIC`) |
| Songs | same grid, `includeItemTypes=[Audio]`; `SongSortOptions` = SORT_NAME, PREMIERE_DATE, ALBUM, ALBUM_ARTIST, ARTIST, DATE_CREATED, DATE_PLAYED, COMMUNITY_RATING, CRITIC_RATING, PLAY_COUNT, RUNTIME, RANDOM; playEnabled | `GET /Items` |

Grid click -> `item.destination()` (B.1). Music grids pass `onLongClickItem = null` (no long-press menu). The Artists-tab view-options dialog has an extra `ArtistSource` choice (ARTIST default = `GET /Artists`, or ALBUM_ARTIST = `GET /Artists/AlbumArtists`; shown only when the filter override is ARTIST; changing it reloads the pager) (`ViewOptionsDialog.kt:135-138, 261-272`, `CollectionFolderView.kt:303-306, 462-485, 1193`). The Genres tab never updates `showHeader` (tab strip state stays whatever the previous tab left it) (`CollectionFolderMusic.kt:220-231`). "Play all/Shuffle" button -> paged `GET /Items?userId&parentId=<lib>&includeItemTypes=Audio&recursive=true` -> `MusicService.setQueue(pager, 0, shuffle)` (`CollectionFolderMusic.kt:onClickPlayAll`). Remote play key on an AUDIO item -> queue of just that song.

## B.3 Album page (`AlbumDetailsPage.kt`)

```
LazyColumn (rows: HEADER=0, SONG=1, MUSIC_VIDEO=2/EXTRAS=2, SIMILAR=3)
+---------------------------------------------------------------------------------+
| top pad 32dp                                                                    |
| [cover 20% width, r=16dp, FillWidth]  16dp gap                                  |
|   Artist(s) string  headlineMedium SemiBold, 1 line, width 75%, start pad 8dp   |
|   Album name        headlineSmall, 1 line                                       |
|   (column width 60%) QuickDetails line (year, counts, runtime...)               |
|                      Genre text                                                 |
|                      Overview (max 3 lines)                                     |
| [> Play] [Shuffle] [Instant mix] [Heart Favorite] [Delete?] [... More]          |  <- MusicExpandableButtons, spacing 16dp, pad 8dp
| bottom pad 32dp                                                                  |
| "Songs (N)" titleLarge, start pad 8dp                                            |
| song rows, each 75% page width, centered:                                        |
|   [track#][▶ playing | ● queued 8dp]  Title (1 line, marquee on focus)  mm:ss [⋮ 32dp] |
|   2nd line artist only when album is "various artists"                           |
| Row "Music videos" (banner cards, aspect WIDE/item aspect, year subtitle)         |
| Extras row                                                                        |
| Row "More like this" (square banner cards, title + production year)               |
+---------------------------------------------------------------------------------+
```
API (`AlbumViewModel.init` override, `AlbumDetailsPage.kt:150-236`):
1. `GET /Items/{id}` album.
2. Songs: `GET /Items?parentId=<albumId>&includeItemTypes=Audio&fields=<DetailItemFields>&sortBy=ParentIndexNumber,IndexNumber,SortName` as a lazily paged list (`getPagerForAlbum`, `W/ui/detail/music/Utils.kt`, `ApiRequestPager`).
3. `initialSongId` -> pager index of that song; list scrolls to it and focuses it.
4. Similar: `GET /Items/{id}/Similar?userId&excludeArtistIds=<albumArtistIds>&fields=Slim&limit=25`; only issued when `state.similar.isEmpty()` (guard at line 189), so it is not refetched when `init()` re-runs after favorite/delete.
5. Music videos: `GET /Items?userId&albumIds=<id>&recursive=true&includeItemTypes=MusicVideo&fields=<ItemRowFields>`.
6. Extras: `ExtrasService.getExtras(id)`.
7. Backdrop: album's own if it has `backdropImageTags`, else first of up to 50 shuffled album-artist ids that has a Backdrop: `GET /Items?ids=<artistIds>&imageTypes=Backdrop`.
8. Favorite: `FavoriteWatchManager.setFavorite` -> SDK `markFavoriteItem`/`unmarkFavoriteItem` (`POST/DELETE /UserFavoriteItems/{id}`), then refetch the item.
`isVariousArtists` = any artist/albumArtist (lower-cased) == "various artists" OR album has > 1 entry in `artists` -> song rows then show the artist line.
Actions: Play -> `setQueue(pager, 0, false)`; Shuffle -> `setQueue(pager, 0, true)`; click song i -> `setQueue(pager, startIndex=i, false)` (queue starts AT song i; earlier songs are dropped, see B.8); Instant mix; Favorite (heart red when on); Delete (only when `MediaManagementService.canDelete`) with confirm; More -> context menu (B.7); long-press song -> menu.
Back handler: active only while the first visible LazyColumn item index is > 2 (`itemsBefore = 2`: item 0 = header, 1 = "Songs (N)" title, 2 = first song). It animates the list to item index 2 (the first song row, NOT the header) and requests focus on song index 0; once the first visible index is <= 2, Back falls through to normal navigation (`AlbumDetailsPage.kt:367, 391-401`).
Other row behaviors: song rows show the now-playing arrow when `currentMusic.currentItemId == song.id` and a dot when `song.id in queuedIds` (lines 528-529). The "More like this" row has a long-press context menu (`ContextMenu.ForMusic`, `showGoTo=true`, `canRemoveFromQueue=false`) and click -> `item.destination()` (lines 597-610). The "Music videos" row long-press is an empty TODO (line 554-555), the Extras row long-press is a no-op; music-video cards show watched/progress/favorite state; the album overview click is a no-op. From the album page "Add to queue" = `addToQueue(item, -1)`, "Play next" = `playNext`, "Remove from queue" is not offered (`canRemoveFromQueue=false`).
States: LoadingPage / ErrorMessage; empty sub-rows are omitted.

## B.4 Artist page (`ArtistDetailsPage.kt`)

Header (`ArtistHeader`, `ArtistDetailsPage.kt:770-840`: top padding 32dp; portrait 20% width FillWidth r=16dp, 16dp gap; then a column with TWO heading lines, first `artist.artistsString` (= `item.data.artists` joined by ", ", headlineMedium SemiBold, 1 line, 75% width, start pad 8dp; usually empty for a MusicArtist item) then the artist name (headlineSmall, 1 line, 75% width), then a 60%-width column of QuickDetails, genres, overview 3 lines (click opens the overview dialog)) then the same button row (Play, Shuffle, Instant mix, Favorite, Delete?, More), then rows in order:
1. "Popular songs" (`popular_songs`): song list rows (with more button).
2. "Albums" (square cards)
3. "Appears on" (square cards)
4. "Music videos" (banner cards using the item aspect ratio (default WIDE) with watched/favorite/progress overlays; menu supports watched toggle / favorite / playlist because they are video items)
5. "More like this" (square cards)
Popular-song rows are 75% width, centred, `showArtist=false`; Albums / Appears on / More like this cards are square `BannerCardWithTitle` with title = name and subtitle = production year. Each row is hidden when empty.
API (`ArtistViewModel.init`, `ArtistDetailsPage.kt:143-251`):
- `GET /Items/{id}`.
- Albums: `GET /Items?albumArtistIds=<id>&recursive=true&fields=Slim&includeItemTypes=MusicAlbum&sortBy=PremiereDate,SortName&sortOrder=Descending,Ascending` (paged).
- Appears on: identical with `contributingArtistIds=<id>`.
- Popular songs: `GET /Items?artistIds=<id>&fields=Slim&recursive=true&includeItemTypes=Audio&minCommunityRating=1&sortBy=CommunityRating&sortOrder=Descending&limit=10` (row omitted when empty). Clicking a popular song plays only that song.
- Similar: `GET /Items/{id}/Similar?userId&excludeArtistIds=<id>&fields=Slim&limit=25`.
- Music videos: `GET /Items?userId&artistIds=<id>&recursive=true&includeItemTypes=MusicVideo&fields=<ItemRowFields>`.
- Play/Shuffle: pager `GET /Items?artistIds=<id>&recursive=true&includeItemTypes=Audio&fields=<Detail>&sortBy=ParentIndexNumber,IndexNumber,SortName` (`getPagerForArtist`, comment "TODO better sort") -> `setQueue(pager, 0, shuffled)`.

## B.5 Song page (`SongDetailsPage.kt`)
Reached only for songs without an album. `AlbumHeader` + `MusicExpandableButtons(showShuffle=false)`. Play -> queue of that song. `GET /Items/{id}`. Favorite toggle uses the returned `UserItemDataDto` (no refetch). Context menu as B.7.
Page: vertical scroll Column (spacing 8dp, bottom padding 32dp), header then the button row, no other rows. The button row is `MusicExpandableButtons` minus Shuffle: Play, Instant mix (`startInstantMix` then navigates to Now Playing after a 250 ms delay), Favorite/Unfavorite (heart red when on), Delete (only if `canDelete`, confirm; on success goes back because `item.id == itemId`), More (context menu with `canRemoveFromQueue=false`, Add to playlist dialog with create-new, Play next, Add to queue). "Add to queue" appends at the end (the `index` argument of `addToQueue` is ignored; album/artist/playlist "Add to queue" appends all their tracks via `getPagerForAlbum/Artist/Playlist`) (`SongDetailsPage.kt:157-272`, `MusicViewModel.kt:75-149`).

## B.6 Playlist page (`PlaylistDetails.kt`)
- Generic grid/list over playlist items; sort = `PlaylistSortOptions` (DEFAULT, SORT_NAME, PREMIERE_DATE, DATE_CREATED, DATE_PLAYED, COMMUNITY_RATING, CRITIC_RATING, OFFICIAL_RATING, RUNTIME, PLAY_COUNT, RANDOM).
- Playlist `mediaType`: server value, else inferred when pager.size <= 50 and the first <=50 items are all AUDIO (-> AUDIO) or all VIDEO/EPISODE/MOVIE/BOX_SET (-> VIDEO); otherwise a "confirm type" dialog (`PlaylistDetails.kt:191-232`, `:330-355`).
- Click / play behavior (`PlaylistDetails.kt:346-372, 437-442`): a normal row click does NOT play; it navigates to `item.destination(index)` (album page with `initialSongId`, or the song page). The Play-all/Shuffle header button passes the PLAYLIST item (`play(0, playlist, shuffle)`): AUDIO playlist -> `MusicViewModel.play` PLAYLIST branch via `getPagerForPlaylist` = `GET /Items?parentId=<playlist>&recursive=true&includeItemTypes=Audio&fields=<Detail>&sortBy=Default`, startIndex 0; VIDEO playlist -> `Destination.PlaybackList(itemId=playlist, startIndex=index, shuffle, filter, sortAndDirection)`. The remote "play" key on a row and the context-menu "Play" on an AUDIO row pass the AUDIO item, which hits the AUDIO branch = `setQueue(listOf(item), shuffled)`, a single-song queue (row index ignored) (`MusicViewModel.kt:36-68`).
- Defaults/row UI (`PlaylistDetails.kt:452-500, 543-700, 758-762`): `playlistDefaultViewOptions` = type LIST, spacing 0, showDetails true; grid is `recursive=false`, `playEnabled=true`, initial sort DEFAULT ascending. Each row: leading index text `N.` (index+1) only when sort == DEFAULT, queue marker for AUDIO rows (playing arrow / queued dot), favorite indicator; headline title (marquee on focus); supporting subtitle; trailing duration (AUDIO: seconds-rounded; others: minutes-rounded plus a 75%-size "Ends at <time>" line unless AUDIO or dense list) and a watched icon. When `canEdit`: up/down caret buttons (up disabled at index 0, down disabled at the last index; after a move, focus moves up/down) and always a more (ellipsis) button. Context menu: AUDIO rows get the music menu, other rows the item menu with `showGoTo=true`; both get "Remove from playlist" only when `canEdit` (`:360-436`).
- "Confirm type" dialog `play_as_type` (titleLarge, centred) with two buttons "Audio" / "Video"; confirming calls `play()` again with that `MediaType` override (`:707-745`). Edit check: HTTP 404 from `GET /Playlists/{id}/Users/{userId}` means "no permission entry" and is treated as `canEdit=false` (any other error also false) (`:145-190`). Remove sends `entryIds=<item.id>` (the media item id, not the BaseItemDto `playlistItemId`) and refreshes pages after the index; move sends `newIndex = index -/+ 1` and refreshes pages after `index-1` (`:240-285`).
- Edit permission: `GET /Playlists/{id}/Users/{userId}` (`playlistApi.getPlaylistUser`); canEdit enables remove/move.
- Mutations (`W/services/PlaylistCreator.kt:389-425`, `PlaylistDetails.kt:240-285`): create `POST /Playlists` body `{Name, Ids:[itemId], Users:[{UserId, CanEdit:true}], IsPublic:false}`; add `POST /Playlists/{id}/Items?ids=<itemId>`; remove `DELETE /Playlists/{id}/Items?entryIds=...`; move `POST /Playlists/{id}/Items/{itemId}/Move/{newIndex}`.

## B.7 Context menus (`W/ui/components/ContextMenu.kt:758-960`)
Music item menu, in order: Go to (only if `showGoTo` and not AUDIO), Play, Play next, [Remove from queue if `canRemoveFromQueue`] else Add to queue, [Remove from playlist if editable playlist], Add to playlist, [Delete (red, confirm) if allowed], Favorite/Unfavorite (heart red when on), [Go to album: AUDIO with albumId], [Go to artist: AUDIO or MUSIC_ALBUM with artistItems; first artist].
Labels: "Go To", "Play", "Play next", "Remove from queue", "Add to queue", "Remove from playlist", "Add to playlist", "Delete", "Favorite"/"Unfavorite", "Go to album", "Go to artist". Delete does not auto-dismiss and opens a confirm dialog ("Are you sure you want to delete this item?"). "Go to" is shown only when `showGoTo=true` (album/artist/similar rows set it; song rows and the header More button do not) and is hidden for AUDIO. Caveat: "Play next" is offered for every item type, but `MusicViewModel.playNext(song)` -> `MusicService.playNext()` has no AUDIO guard (unlike `setQueue`/`addToQueue`, which ignore non-AUDIO), so from an album/artist card it would enqueue the album/artist id as an audio stream URL (broken source behavior; a web port should guard) (`ContextMenu.kt:758-900`, `MusicService.kt:408-417`).
Queue menu (Now Playing): Play, Play next, Remove from queue, Go to album (if albumId), Go to artist (if artistId).
"Add to playlist" opens a playlist picker dialog (search/list + create new).

## B.8 Queue model & playback (`W/services/MusicService.kt`)

One app-wide singleton owns its own ExoPlayer for audio (usage MEDIA / content type MUSIC; separate from the video player). State `MusicServiceState`: `queueVersion`, `queueSize`, `currentIndex`, `currentItemId`, `status` (PLAYING|PAUSED|IDLE), `currentItemTitle`, `loadingState`, `queuedIds:Set<UUID>`.
Queue entry = `MediaItem{uri=stream URL, mediaId=item id (no dashes), tag=AudioItem}`. `AudioItem` (`W/data/model/AudioItem.kt`) = `{key (unique per queue entry so the same song can be queued twice), id, albumId, artistId (first artistItem), title, albumTitle, artistNames (", " joined), runtime, imageUrl (the ALBUM's Primary image: itemId=albumId, tag=albumPrimaryImageTag), hasLyrics}`.
Operations:
- `setQueue(list, shuffled)`: keep only `AUDIO`, replace queue, `shuffleModeEnabled=shuffled`, `start()`.
- `setQueue(pager, startIndex, shuffled)`: clear queue, set shuffle mode, `start()`, then `addAllToQueue(list, startIndex)`: **skips the first `startIndex` items**, loads remaining items in chunks of 25 (blocking fetch of lazily paged data) and appends each chunk. Playback begins as soon as the first chunk is added. Shuffle = player shuffle mode over the whole queue (not a pre-shuffled list).
- `addToQueue(item[,index])`, `addAllToQueue`, `playNext(song)` inserts at `currentIndex+1`, `moveQueue(index, UP|DOWN | newIndex)`, `removeFromQueue(index)`, `playIndex(i)` = `seekTo(i,0)+play`. NOTE quirk: Now Playing "Play next" on a queued row calls `moveQueue(index, 1)` (moves it to position 1, not current+1) (`NowPlayingViewModel.kt:playNext`).
- Non-AUDIO items are ignored (warning logged) by `setQueue`/`addToQueue`.
- Omitted behaviors: (1) the music ExoPlayer honours the experimental pref `disableAudioOffload` (read once at player creation, `MusicService.kt:88-97`). (2) `playNext` calls `player.addMediaItem(currentIndex+1, ...)`, which is out of range on an empty queue (web: start a new queue instead; line 408-417). (3) The ext-function `addToQueue(item, index)` ignores `index`. (4) `loadingState` goes Loading during `addAllToQueue` and `startInstantMix` (`loading { }` wrapper, lines 427-432), driving the Now Playing `LoadingPage`. (5) Server reporting happens once per session: `Playing` start only on the first `isPlaying`, `Stopped` only on service stop (`failed=false`); track changes only produce Progress reports with the new itemId (no per-track Start/Stopped) (`TrackActivityPlaybackListener.kt:51-147`).
- Instant mix: `GET /Items/{id}/InstantMix?userId&limit=200&fields=<Detail>` (`instantMixApi.getInstantMixFromItem`) -> `setQueue(items, false)`; the UI navigates to NowPlaying 250 ms after starting. Offered for album, artist, song.
- `start()`: lazily builds MediaSession + `TrackActivityPlaybackListener` + websocket subscription once, then `prepare(); play()`.
- `stop()`: release session, cancel websocket job, release tracker (sends Stopped), `player.stop()`, clear items, reset state.

### Streaming URL (`MusicService.convert`, 298-343)
- Default: `GET {server}/Audio/{itemId}/universal?container=<aac,aac_latm,ac3,alac,dca,dts,eac3,flac,mlp,mp2,mp3,opus,pcm_alaw,pcm_mulaw,pcm_s16le,pcm_s20le,pcm_s24le,truehd,vorbis>` (SDK `audioApi.getUniversalAudioStreamUrl(itemId, container=[...])`; list = `supportedAudioCodecs`, `W/util/profile/DeviceProfileUtils.kt:25-46`). No `userId`, `deviceId`, `maxStreamingBitrate`, `startTimeTicks` or transcoding params are sent in this call; the SDK URL builder appends the access token; the Android player uses an authenticated OkHttp client.
- Experimental pref `preferAc3Surround`: when the first media source has an audio stream with > 2 channels and codec != AC3 -> `/Audio/{id}/universal?container=mka&transcodingContainer=mka&maxAudioChannels=6&transcodingAudioChannels=6&audioCodec=ac3` (source bug: a missing `&&` at lines 307-311 means `codec != AC3` alone is effectively tested).
- Web hint: browsers cannot decode most of that list. Builders should send `userId`, `deviceId`, `maxStreamingBitrate`, `container=mp3,aac,flac,ogg,webma,m4a`, `transcodingContainer`, `transcodingProtocol` and `audioCodec` (decision for builders).

### Server reporting (`W/util/TrackActivityPlaybackListener.kt`)
First time the player reports `isPlaying` -> `POST /Sessions/Playing` `{canSeek:true, itemId, isPaused, playMethod:DirectPlay, repeatMode:RepeatNone, playbackOrder:Default, isMuted:false}`; then every 5 s and on every play/pause change -> `POST /Sessions/Playing/Progress` `{itemId, positionTicks, canSeek, isPaused, isMuted:false, playMethod, repeatMode:RepeatNone, playbackOrder:Default}` (only while position > 0); on `STATE_ENDED` progress with position=duration; on release `POST /Sessions/Playing/Stopped` `{itemId, positionTicks}`. It always reports DirectPlay and fixed repeat/order values (does not mirror actual repeat/shuffle). The reported item is `state.currentItemId`.
### Remote control
Websocket `PlaystateMessage` handled: Stop, Pause, Unpause, NextTrack, PreviousTrack, Seek(ticks), Rewind (-10 s), FastForward (+30 s), PlayPause (`MusicService.kt:437-488`). The code does not post session capabilities here.

### Media session / background rules
- `androidx.media3.session.MediaSession` wraps the music player with `TrustAllControllersCallback` (any controller may connect) -> notification, lock screen, Bluetooth, Assistant. Web equivalent: `navigator.mediaSession` (metadata title/artist/album/artwork; handlers play, pause, previoustrack, nexttrack, seekbackward 10 s, seekforward 30 s, seekto, stop).
- Music continues while the app is in the background: `PlaybackLifecycleObserver` (`W/services/PlaybackLifecycleObserver.kt`) pauses only the VIDEO player (`playerFactory.currentPlayer`) and theme songs.
- Music stops when: Stop button (then navigates back); any video playback starts (`PlaybackViewModel.init -> musicService.stop()`, `W/ui/playback/PlaybackViewModel.kt:294`); user/server switch (`NavDrawer.kt:204`); websocket Stop; (queue end leaves state PAUSED/IDLE).
- Nav drawer "Now playing" entry (`W/services/NavDrawerService.kt:88-121`, `W/ui/nav/NavDrawer.kt:360-385`): shown while status PLAYING (subtext = current title), hidden on IDLE; on PAUSED it remains for 2 hours then hides. Click -> `Destination.NowPlaying`. There is no mini-player bar.

## B.9 Music video handling
`BaseItemKind.MUSIC_VIDEO` is treated as a normal video: details page is `MovieDetails` (source TODO: use VideoDetails), play = `Destination.Playback` through the video player (which stops MusicService). `CollectionType.MUSICVIDEOS` (and BOOKS) libraries are `CollectionFolderGeneric` with `playEnabled=true` and `includeItemTypes=[MUSIC_VIDEO]` (not a special video grid) (`DestinationContent.kt:508-516`, `CollectionFolderGrid.kt:215-217`); `VIDEO` and `MUSIC_VIDEO` items share the `MovieDetails` page (`DestinationContent.kt:162-171`). Album and artist pages show "Music videos" rows (queries in B.3/B.4) and navigate to `item.destination()`.

## B.10 Theme songs (`W/services/ThemeSongPlayer.kt`)
- Setting `play_theme_music` (`AppChoicePreference`, default MEDIUM, stored in `interfacePreferences.playThemeSongs`; `AppPreference.kt:234-245`). Labels (`strings.xml:610-621`, array `theme_song_volume`): Disabled, Lowest, Low, Medium, High, Full (the top level is labelled "Full", `volume_full`, not "Highest"). `ThemeSongVolume`: DISABLED, LOWEST, LOW, MEDIUM, HIGH, HIGHEST -> volume .05 / .1 / .25 / .5 / `75f` in source (bug: the intended value is 1.0 given the label "Full"; ExoPlayer clamps volume to [0,1], so 75f behaves as full volume 1.0 in practice). Web: implement HIGHEST as 1.0 (`ThemeSongPlayer.kt:76-89`).
- `playThemeFor(itemId)`: first waits for any previous playback job (`state.value.job?.join()`), reads the volume pref on every call and returns silently on DISABLED; then `GET /Items/{itemId}/ThemeSongs` (item id as given -- movie id, series id or boxset id -- with no userId/inheritFromParent params) -> pick random (`items.randomOrNull()`; if there are no theme songs nothing plays and a currently playing theme is NOT stopped by this call) -> `GET /Audio/{themeId}/universal?container=opus,mp3,aac,flac` -> separate ExoPlayer: `stop(); volume=; setMediaItem; prepare(); play()`. Serialised by a mutex. The theme player is its own ExoPlayer using the authenticated OkHttp data source; `stop()` cancels the job and calls `player.stop()`.
- NOT collection-only. `playThemeFor` is triggered by: Movie details (`MovieDetails.kt:147-152` LifecycleResumeEffect -> `maybePlayThemeSong(movieId)`; MUSIC_VIDEO and VIDEO items share this page), Episode details (`EpisodeDetails.kt:126-134` -> `maybePlayThemeSong(ep.data.seriesId)`, skipped if no seriesId; plays the series' theme), Series details and Series overview (`SeriesDetails.kt:178-182`, `SeriesOverview.kt:187-193` -> `SeriesViewModel.onResumePage` -> `playThemeFor(seriesId)`, `SeriesViewModel.kt:293-299`), the collection page (`CollectionViewModel.kt:160`, at init), and `CollectionFolderView.onResumePage` only when the folder item is a BOX_SET and its items did not error (`CollectionFolderView.kt:684-692`). Stopped via `release()` on navigating away/dispose and by `PlaybackLifecycleObserver` `onPause`/`onStop` (`services/PlaybackLifecycleObserver.kt:33-43`).

## B.11 Now Playing screen (`NowPlayingPage.kt`, `NowPlayingOverlay.kt`, `NowPlayingButtons.kt`, `NowPlayingViewModel.kt`, `LyricsContent.kt`, `BarVisualizer.kt`)

Layers: Backdrop (full bleed, dynamic color, 1.5 s crossfade) -> invisible key-handling box -> content Row -> bottom controls overlay -> LoadingPage when `musicService.loadingState==Loading`.
```
+--------------------------------------------------------------------------------------+
| Backdrop image (pref showBackdrop; rotates every 2 min)                               |
| +------------------------------+  +------------------------------------------------+ |
| | album art 240dp r=16dp       |  | LYRICS (pref showLyrics AND lyrics fetched non-empty): | |
| | title  titleLarge            |  | bodyLarge lines, 4dp spacing, pad 8dp each;     | |
| | album  titleMedium           |  | current = onSurface, others 40% alpha (500 ms   | |
| | artists titleMedium          |  | linear tween); horiz pad 32dp, vert pad 100dp   | |
| | (col width 50%, pad 32dp)    |  | click a line = seek to its start                | |
| +------------------------------+  +------------------------------------------------+ |
|  [Bar visualizer: 75% height; width 100% (50% if lyrics shown); ~96-103 bars, 1dp gap]      |
|                                                                                        |
| == controls overlay (bottom; gradient transparent -> black; padding 16dp) =========== |
|  seek bar (95% width, display only: seeking disabled)                                  |
|  [gear][stop]            [prev][-10s][play/pause][+30s][next]       [shuffle][repeat]  |
|  "Queue" titleMedium                                                                   |
|  rows: [n] [▶ if current] Title / Artist     runtime   [▲][▼][⋮ 32dp]  bg surface@50% r=8dp |
+--------------------------------------------------------------------------------------+
```
- Album-art column only visible when pref `showAlbumArt`; visualizer only when `showVisualizer`; all 4 prefs default FALSE (`W/ui/detail/music/MusicPreference.kt`, proto `musicPreferences`: show_album_art, show_visualizer, show_backdrop, show_lyrics).
- Overlay height 33% of screen, animating to 100% (500 ms) while the queue list holds focus. The big buttons row hides when a queue row with index >= 3 has focus. Overlay slides vertically; auto-hides via `ControllerViewState`, whose timeout is a FIXED 5000 ms: `NowPlayingViewModel` builds `ControllerViewState(AppPreference.ControllerTimeout.defaultValue, true)`, so the user's `controllerTimeoutMs` playback preference is ignored (`NowPlayingViewModel.kt:88-92`, `AppPreference.kt:121-127`); each key-up or focus change in the overlay re-arms it (`pulseControls`). `controlsVisible` starts FALSE and nothing pulses it on open, so the screen opens with the bottom overlay hidden; any D-pad/Enter/media key shows it (Enter toggles play/pause instead when `oneClickPause` is on) (`ui/playback/ControllerViewState.kt:24-25`, `PlaybackKeyHandler.kt:54-76,93-100`). Back chain: (1) if the queue is scrolled so the button row is hidden (a queue row with index >= 3 focused), Back scrolls the queue to the top and focuses row 0 (`NowPlayingOverlay.kt:99-107`); (2) then Back hides the overlay (`NowPlayingPage.kt:339-341`); (3) then Back leaves the screen. Lyric focus has its own Back handler that refocuses the key box (`:160-162`). MediaNext/MediaPrevious keys call `seekToNext/seekToPrevious`; MediaRewind/FastForward seek 10 s / 30 s.
- Buttons: shuffle/repeat 36x36dp, 18sp icon, container `#40000000`, spacing 12dp (`buttonSpacing`, `ui/playback/overlay/PlaybackControls.kt:334`). Shuffle active = full opacity, inactive 50%. Repeat OFF/ALL/ONE (ONE draws a "1" badge 10sp bottom-start); Media3 default cycle OFF -> ONE -> ALL -> OFF; shuffle toggles `player.shuffleModeEnabled`. Prev/next use player previous/next (prev restarts the track if > ~3 s in, Media3 default).
- Key handler: seek back 10 s / forward 30 s, no left/right skip, `oneClickPause`, `dpadSeekMode` from playback prefs, Stop key = stop.
- Gear -> "View options" dialog (right aligned, 256dp wide, max 380dp, r=8dp, bg `surfaceColorAtElevation(6)`) with the 4 switches (`show_album_cover`, `show_visualizer`, `show_backdrop`, `show_lyrics`). Enabling visualizer requests Android RECORD_AUDIO permission (rationale string `visualizer_rationale`).
- Stop -> `musicService.stop()` then back.
- Queue-row details: up-caret is disabled on row 0 and down-caret on the last row; the "currently playing" marker is `current?.id == song.id`, so every queue entry for the same song id shows as playing; the list initially scrolls to `currentIndex`; entering the list focuses the current item and pressing Up out of the list returns focus to the button row; focusing any queue row pulses the controller; rows use `animateItem()` (`NowPlayingOverlay.kt:172-242`). Backdrop artist ids come from the song's `artistItems` (not album artists). When RECORD_AUDIO is not granted, opening Now Playing calls `startVisualizer(false, ...)`, which writes `showVisualizer=false` to the stored preference (`NowPlayingViewModel.kt:113-118, 374-392`). The album-art column and the visualizer share one Box, so the visualizer is drawn over the album art when both are on (`NowPlayingPage.kt:205-278`).
- Queue row: click = `playIndex(i)`; ▲/▼ = `moveQueue`; ⋮ or long-press = queue menu. Empty queue -> plain text "No items" (hard-coded).
- Lyrics pane / visualizer width are driven by `state.hasLyrics` (`lyrics != null && lyrics.lyrics.isNotEmpty()`, `NowPlayingState.kt:18`), NOT by `AudioItem.hasLyrics`: show the pane iff `musicPrefs.showLyrics && lyrics != null && lyrics.lyrics.isNotEmpty()`; visualizer width = 50% under that same condition else 100% (animated) (`NowPlayingPage.kt:148,268,281`). A song flagged hasLyrics whose fetch fails or is empty shows no pane. The fetch happens whenever `AudioItem.hasLyrics`, regardless of the `showLyrics` pref, and lyrics + index are reset to null on every track transition (`onMediaItemTransition`), so the pane collapses briefly between tracks (`NowPlayingViewModel.kt:144-185`).
- Lyrics: when `AudioItem.hasLyrics` -> `GET /Audio/{id}/Lyrics` (`lyricApi.getLyrics`; LRU cache of 20 in memory; remote lyrics not implemented). `LyricDto{metadata.offset, lyrics[{text, start(ticks)}]}`. A 150 ms loop sets `currentLyricIndex` = last line with `start <= position + offset`. Unsynced lines (no start) never highlight (index null -> all lines full brightness). Pressing Up with hidden controls focuses the lyric list; lyric focus hides controls and returns focus to the player after 5 s.
- Backdrop: `GET /Items/{songId}` song backdrops + `GET /Items?ids=<artistIds>&imageTypes=Backdrop&limit=50&enableImages=true&enableImageTypes=Backdrop`; list = shuffled song backdrops then shuffled artist backdrops, cycled; change every 2 min but only if >= 15 s remain in the track (or no backdrop shown); colors extracted from the image for theming. Backdrop images come from `GET /Items/{id}/Images/Backdrop/{index}?tag=...`.
- Visualizer: Android `Visualizer` waveform capture (max capture size, rate max/3) grouped with `groupSize = (captureSize/96f).toInt()` and `chunked(groupSize)` (each bar = mean of its chunk `+128`), so the bar count is ceil(captureSize/floor(captureSize/96)): with the usual max capture size 1024, groupSize = 10 and there are 103 bars (the last averages 4 samples); it depends on `Visualizer.getCaptureSizeRange()[1]` (`NowPlayingViewModel.kt:323-339`). Rendering (`BarVisualizer.kt:20-94`): bar width = areaWidth/count, 1dp gap (none before the first), vertically centred, height = value/256 of area height, colour = theme "border", per-bar height animated with the default `tween` (300 ms) and `LinearEasing`. A web port can use a fixed ~96-103 bars. Web: AnalyserNode time-domain data (needs CORS-enabled audio element / MediaElementSource).

## B.12 Music API summary (Jellyfin)
`GET /Items`, `/Items/{id}`, `/Items/{id}/Similar`, `/Items/{id}/InstantMix`, `/Items/{id}/ThemeSongs`, `/Items/{id}/SpecialFeatures`, `/Artists`, `/Artists/AlbumArtists`, `/Genres`, `/Audio/{id}/universal`, `/Audio/{id}/Lyrics`, `POST /Sessions/Playing[/Progress|/Stopped]`, `POST|DELETE /UserFavoriteItems/{id}`, `DELETE /Items/{id}` (Delete on album/artist/song pages and the playlist context menu: confirm dialog, then toast "Deleted" or "Error deleting item: <msg>"; offered only when `MediaManagementService.canDelete` is true, `W/services/MediaManagementService.kt:89-99,117-136`), `POST /Playlists`, `POST|DELETE /Playlists/{id}/Items`, `POST /Playlists/{id}/Items/{itemId}/Move/{n}`, `GET /Playlists/{id}/Users/{userId}`, WebSocket `/socket`, images `GET /Items/{id}/Images/{Primary|Backdrop}`.

---------------------------------------------------------------------------------------------------

# C. PHOTOS / HOME VIDEOS & SLIDESHOW

## C.1 Browsing

- Libraries with `CollectionType.HOMEVIDEOS` or `PHOTOS` -> `CollectionFolderPhotoAlbum` (`W/ui/nav/DestinationContent.kt:496-504`, recursive=false unless override). Photo albums (`BaseItemKind.PHOTO_ALBUM`) opened from anywhere use the same composable with `recursive=false` (`DestinationContent.kt:245-252`).
- `CollectionFolderPhotoAlbum` (`W/ui/detail/CollectionFolderPhotoAlbum.kt`): generic `CollectionFolderView` with
  - `defaultViewOptions = ViewOptionsWide` = 4 columns, spacing 24, content scale CROP, aspect ratio 16:9 (`W/ui/components/ViewOptionsDialog.kt:328`),
  - sort options = `VideoSortOptions` (SORT_NAME, PREMIERE_DATE, DATE_CREATED, DATE_PLAYED, COMMUNITY_RATING, CRITIC_RATING, OFFICIAL_RATING, RUNTIME, PLAY_COUNT, RANDOM),
  - filter options = `DefaultFilterOptions` (Played, Favorite, Genre, CommunityRating, OfficialRating, VideoType, Year, Decade) (`W/data/filter/ItemFilterBy.kt:8`),
  - `playEnabled = true` (the grid shows the Play/Shuffle header button), title hidden after scrolling past first row.
  - Generic `CollectionFolderView` queries `GET /Items?parentId=<id>&recursive=<bool>&sortBy&sortOrder&filters...` paged (fields per generic grid). `includeItemTypes` is derived from the folder item's `collectionType` (`CollectionType.baseItemKinds`): at a PHOTOS / HOMEVIDEOS library root the query is restricted to `VIDEO, PHOTO, PHOTO_ALBUM` (so plain Folders are excluded); inside a `PHOTO_ALBUM` item (collectionType null) there is NO type filter, so sub-albums, photos and videos are listed together. Always sent: `excludeItemIds=[<folder id>]`, `enableImageTypes=Primary,Thumb,Backdrop,Logo`, `fields=Slim`, `sortBy=[<chosen sort>, SortName]` with `sortOrder=[<chosen dir>, Ascending]` (SortName omitted when the chosen sort is SortName; both lists empty when sort is DEFAULT) (`ui/components/CollectionFolderView.kt:513-560`, `CollectionFolderGrid.kt:190-210`).
- Click behavior: PHOTO -> `Destination.Slideshow(parentId=<album id>, index=<grid index>, filter=current grid filter, sortAndDirection=current sort, recursive, startSlideshow=false)`; any other item (album, folder, video) -> `item.destination(index)` (a VIDEO plays/open details normally).
- Grid "Play"/"Shuffle" header button starts a slideshow only when the OPEN folder item's type is `PHOTO_ALBUM`: `Slideshow(parentId=album, index=0, filter, sort, recursive=true, startSlideshow=true)` (the shuffle flag is ignored, `recursive` is forced true) (`W/ui/components/CollectionFolderView.kt:976-997`). At a PHOTOS/HOMEVIDEOS library root (a collection folder, not a PHOTO_ALBUM) it instead navigates to `Destination.PlaybackList(itemId, startIndex=0, shuffle, recursive, sortAndDirection, filter)` (a video playlist). Remote "play" key on a PHOTO_ALBUM card: `Slideshow(parentId=album.id, index=<that card's grid index in the parent>, recursive=true, startSlideshow=true)` (i.e. NOT index 0) (`:1003-1013`); on other items normal `Playback`.
- "Random" button util: picks a random grid index; if PHOTO -> `Slideshow(index=<random grid index>, startSlideshow=false)` (`W/ui/util/RandomButtonUtils.kt:28-42`).
- Index hazard: the `index` handed to the slideshow is the GRID index (position among all grid items, which can include sub-albums/videos/folders), but `SlideshowViewModel` re-queries only `Photo` (and `Video` if `slideshowPlayVideos`) with a single `sortBy` key (no SortName tiebreak); so when the grid has non-photo items before the clicked photo the slideshow opens at the wrong image; with sort RANDOM the query is re-randomised server-side so the opened photo is unrelated to the clicked one. A web port should resolve the start position by item id (`ui/detail/CollectionFolderPhotoAlbum.kt:58-75`, `SlideshowViewModel.kt:128-144`).
- `Destination.Slideshow` fields (`W/ui/nav/Destination.kt:136-143`): `parentId: UUID?`, `index`, `filter: CollectionFolderFilter`, `sortAndDirection`, `recursive`, `startSlideshow`. It is a "fullscreen"/playback-type destination (nav drawer hidden; `MainActivity.kt:586` treats Slideshow like Playback for screensaver handling).

## C.2 Slideshow data loading (`SlideshowViewModel.kt`)
1. Prefs: `photoPreferences.slideshowDuration` (ms; default 5000, min 1000, max 30000, step 250; falls back to default if below min) and `slideshowPlayVideos` (default false) (`W/preferences/AppPreference.kt:1122-1160`; proto `PhotoPreferences{slideshow_duration int64, slideshow_play_videos bool}`). Settings labels: `slideshow_duration` "Slideshow duration" (summary `decimal_seconds`), `play_videos_during_slideshow`.
2. Query list: `GET /Items?parentId=<parentId>&includeItemTypes=Photo[,Video if playVideos]&fields=<PhotoItemFields = Overview,Trickplay,SortName,Chapters,MediaSources,MediaSourceCount,CanDelete,PrimaryImageAspectRatio,Width,Height>&recursive=<recursive>&sortBy=<sort>&sortOrder=<dir>` + the grid's active filters applied (`filter.applyTo`). Result is a lazily-paged list (`ApiRequestPager.init(startIndex)` loads the page around `index` first); `position = index`.
3. Saved gallery color filter: if `parentId != null`, load from local Room table `playback_effects` (key = jellyfinUserRowId + itemId + type) with type `PHOTO_ALBUM` -> `albumImageFilter`.
4. On each position change (`updatePosition`): fetch item `index` (blocking pager). URL for a PHOTO = `api.libraryApi.getDownloadUrl(id)` = `GET /Items/{id}/Download` (original file, with token; NO maxWidth/quality/format params — full original is downloaded). For VIDEO = `GET /Videos/{id}/stream` (`videoApi.getVideoStreamUrl(itemId)` with no params; source comment: "assumes direct play"). `thumbnailUrl = getItemImageUrl(image, THUMB)` (unused loading placeholder; generic image URL uses `quality=96` default, `ImageUrlService.QUALITY`, plus `tag`).
5. Per-image filter: reset to album filter, then load per-image `PlaybackEffect(type=PHOTO)`; if it `hasImageFilter()` use it.
6. Prefetch: after loading position p, the neighbor in the travel direction (p+1 if moving forward else p-1) is enqueued in the image cache (photos only, `Size.ORIGINAL`).
   The per-image state is only published after the `playback_effects` lookup and only when `serverRepository.currentUser != null` (`SlideshowViewModel.kt:161-170, 206-217, 267-291`).
7. Error states: whole load error -> `ErrorMessage`; per-image failure -> text "Error loading image" (+ toast `"Error loading image: <msg>"` and the slideshow timer resumes so it does not stall); loading -> LoadingPage / spinner.

## C.3 Slideshow page layout & behavior (`SlideshowPage.kt`)

Black full-screen Box. No chrome by default.
```
+---------------------------------------------------------------------------+
|                                                                           |
|            current image (ContentScale.Fit, black letterbox)              |
|            crossfade 750 ms from previous image (kept as placeholder)     |
|            transforms: zoom (1x-5x), pan, rotation (90deg steps) animated  |
|                                                                           |
| +-----------------------------------------------------------------------+ |
| | OVERLAY (slides up from bottom; bg #80000000 full width; pad 16dp)    | |
| |  Title (headlineMedium SemiBold, 1 line, 75% width)                    | |
| |  QuickDetails (date taken/year, etc.)                                  | |
| |  [ "3 of 120" label ] [ "4032x3024" label | video stream details ]      | |
| |  Overview (3 lines, 75% width)                                         | |
| |  [Play/Stop slideshow][Rotate left][Rotate right][Zoom in][Zoom out]    | |
| |  [Reset][Filter]      (spacing 16dp, row padding 8dp)                   | |
| +-----------------------------------------------------------------------+ |
+---------------------------------------------------------------------------+
Filter dialog: top-right, 40% screen width, padding 8dp, bg secondaryContainer@40%, no dim.
```
Overlay for a VIDEO item shows only [Play/Stop slideshow] and a play/pause toggle (no rotate/zoom/filter).

### State
`SlideshowState{items, position, image, loading, imageLoading, enabled (slideshow mode on), paused}`; `slideshowActive = enabled && !paused`. Local UI state: `zoomFactor` (1..5), `panX/panY` (px), `rotation` (degrees, accumulates +/-90; animated), `showOverlay`, `showFilterDialog`. All transforms animate (default spring). Whenever a new image finishes loading: zoom=1, pan=0, rotation=0.

### Timing / transitions
- Auto-advance: `pulseSlideshow()` starts a delay job of `slideshowDelay` ms; when it fires and `slideshowActive`, `nextImage()`; at the end of the list it LOOPS to index 0. The job is SELF-RESCHEDULING: `invokeOnCompletion { if (it !is CancellationException) pulseSlideshow() }`, so after each delay fires a new delay starts forever (until cancelled by stop/pause/another pulse); the tick only advances when `enabled && !paused`. Model it as a repeating tick of `slideshowDelay` ms that is reset (cancel + restart) on: image load success or error (`onSuccess`/`onError` call `pulseSlideshow()` even when the slideshow is not enabled), any HANDLED overlay/zoom/pan key (the key handler pulses only when `result == true`; Left/Right navigation leaves `result=false`, so it does NOT pulse from the key handler -- the timer restarts via the new image's `onSuccess`), unpause, and filter-dialog dismiss. While an image is loading the timer is parked (`pulseSlideshow(Long.MAX_VALUE)`) so slow images are never skipped; on image load error it resumes (`SlideshowViewModel.kt:390-407`, `SlideshowPage.kt:269-292,302-305,431-449`). Overlay open or filter dialog open -> `pauseSlideshow()` (timer cancelled); closing -> `unpauseSlideshow()` + pulse.
- Start paths: `startSlideshow=true` auto-starts (overlay hidden); or overlay "Play slideshow" -> `startSlideshow()` (also hides overlay). "Stop slideshow" -> `enabled=false`. While enabled, `screensaverService.keepScreenOn(true)` (web: Screen Wake Lock).
- Video items during slideshow (only if pref on): player `repeatMode = OFF` while slideshow enabled else `ONE` (loops); timer disabled (`pulseSlideshow(Long.MAX_VALUE)`) until the video ends (`STATE_ENDED` -> `pulseSlideshow(delay)`). Video rendered Fit with zoom/pan/rotate transforms; Android ExoPlayer, direct stream. For videos only scale + translation + rotation are applied via `graphicsLayer`: NO `transformOrigin` (zoom origin is the centre, not the pan-dependent origin formula) and NO colour filter; the pan-origin formula and colour filter apply to photos only (`SlideshowPage.kt:346-364` video vs `:373-406` photo). If the very first item is a VIDEO, `startSlideshow` does not start the timer (relies on `STATE_ENDED`).
- Only transition effect: 750 ms cross-fade (Coil `CrossFadeFactory(750ms)` with previous image as placeholder). No slide/Ken Burns effects.
- Prefetch of next image described in C.2.

### Input (TV remote; map to keyboard/touch for web)
Overlay hidden:
- Left / Right (key up): previous/next image; toast "At beginning" (`slideshow_at_beginning`) / "No more photos" (`no_more_images`) at ends (note: manual next at the end does NOT wrap; only the auto timer wraps).
- OK/Enter or any other D-pad key: open overlay + pause.
- Long-press (key repeat) Up: zoom in +0.05 per repeat; long-press Down: zoom out -0.05 per repeat (min 1, max 5; zoom-out also shrinks pan proportionally; at zoom <= 1.02 pan resets to 0).
- When zoomed (> 1.02x): D-pad pans 30dp per press (Left -> panX +30dp, Right -> -30dp, Up -> +30dp, Down -> -30dp; clamped to +/-75% of screen width/height); Back resets zoom/pan (rotation kept).
Pressing Up/Down (short press, key-up) with the overlay hidden and not zoomed also opens the overlay (only long-press zooms). When no overlay/zoom applies, Back is not consumed and exits the slideshow (`keepScreenOn(false)` runs when the ViewModel closes).
Overlay shown: Back closes overlay and unpauses; focus starts on the Play/Stop button. While the overlay is shown, "Stop slideshow" does not dismiss the overlay but "Play slideshow" does (`ImageControlsOverlay.kt:84-91`). The overlay is only rendered when an image has loaded successfully; `ImageLoadingState.Error` shows ErrorMessage "Error loading image". In the video overlay the play/pause button shows the play icon while playing (icons inverted in source, `:98-115`). "Save for album" is a silent no-op (no toast) when the slideshow has no `parentId`.
Overlay buttons: Rotate left = rotation -= 90; Rotate right += 90; Zoom in = zoom +0.15; Zoom out = -0.15; Reset = zoom 1, pan 0, rotation 0; Filter = open filter dialog (and hide overlay, pause).
Pan transform origin = `((screenW - panX) / (2*screenW), (screenH - panY)/(2*screenH))`; when zoomed, the image is requested at `Size.ORIGINAL` to avoid blur after resolution change.

### Color filter (`ImageFilterSliders.kt`, `W/data/model/VideoFilter.kt`)
Dialog: 40% screen width, top-right. Sliders (label 96dp wide, value 48dp, wrap-around enabled, step 1): Brightness 0-200 (%), Contrast 0-200 (%), Saturation 0-200 (%), Red 0-200 (%), Green 0-200 (%), Blue 0-200 (%) — red/green/blue sliders are tinted. Hue (0-360 deg) and Blur (0-250 px) exist in `VideoFilter` but are hidden for images (`showVideoOptions=false`) and their rendering is TODO. Default for each = 100 (hue 0, blur 0). Buttons: Save (per image), Save for album, Reset (back to defaults, not saved).
`VideoFilter` fields: `rotation, brightness, contrast, saturation, hue, red, green, blue, blur` (ints).
Rendering: the slideshow uses `VideoFilter.colorMatrix` = `createComposeColorMatrix()` (a Compose `ColorMatrix`), NOT the android.graphics `createColorMatrix()` (which is unused). In that function: if saturation != 100 `matrix.setToSaturation(sat/100)`; if any RGB != 100 `matrix.setToScale(r/100, g/100, b/100, 1)`, which RESETS the matrix (so the saturation step is discarded whenever any of R/G/B != 100: saturation and RGB are effectively mutually exclusive); if contrast != 100 `matrix *= scale(c/100 on RGB)`; if brightness != 100 `matrix *= diag(b/100 on RGB)` (`timesAssign`). No offsets. The filter is applied only when `hasImageFilter()` (rgb || brightness || contrast || saturation != 100). Hue and blur are not applied (TODO). Builders wanting parity should replicate the overwrite or consciously fix it (compose saturation + RGB + contrast + brightness) (`SlideshowPage.kt:373-380`, `VideoFilter.kt:50,183-222`). Web mapping suggestion: CSS `filter: saturate() contrast() brightness()` + SVG feColorMatrix for RGB scaling (decision for builders; exact parity requires an SVG feColorMatrix with the same multiplication order).
Persistence: Room table `playback_effects` (PK userRowId + itemId + type[PHOTO | PHOTO_ALBUM], column `videoFilter`). "Save" writes (user, imageId, PHOTO); "Save for album" writes (user, parentId, PHOTO_ALBUM) and updates the album default; toast "Saved". Per-user, local to the device (NOT stored on the Jellyfin server). Web: IndexedDB/localStorage keyed by server+user (decision).

### Image-quality / size parameters
- Photo bytes: `GET /Items/{id}/Download` — no maxWidth/maxHeight/quality. (If builders prefer resized images for web: `GET /Items/{id}/Images/Primary?maxWidth=...&quality=...`; the Android app does not do this for the slideshow.)
- Grid thumbnails: `GET /Items/{id}/Images/Primary?quality=96&tag=<tag>[&fillWidth/fillHeight]` via `ImageUrlService` (quality default 96).

## C.4 API calls summary
`GET /Items` (album listing and slideshow list), `GET /Items/{id}/Download` (photo), `GET /Videos/{id}/stream` (video), `GET /Items/{id}/Images/{type}` (thumbs). No server-side writes (no played/progress reporting for photos; no `Sessions/Playing` for slideshow videos in this code path).

---------------------------------------------------------------------------------------------------

# D. SEERR DISCOVER

Paths abbreviated `W/` = `app/src/main/java/com/github/damontecres/wholphin/`; `S/` = `app/src/main/seerr/seerr-api.yml` (OpenAPI 3 spec used to generate the client; package `com.github.damontecres.wholphin.api.seerr`, generator config `app/build.gradle.kts:265-272`).

## D.1 Build flag: when Seerr is disabled

- `app/build.gradle.kts:134-163`: product flavors `default` (DISCOVER_ENABLED=true), `appstore` (true), **`firetv` (DISCOVER_ENABLED=false)** (`setFeatureFlag(featureDiscover, false)`; `featureDiscover = "DISCOVER_ENABLED"` at line 138; default = line 151, appstore = line 157, firetv = line 163). `BuildConfig.DISCOVER_ENABLED` is read at:
  - `W/services/SeerrApi.kt:23` — `active = baseUrl not blank && DISCOVER_ENABLED` (so the Discover nav item, Discover search tab, "Discover" rows, filters all vanish).
  - `W/preferences/AppPreference.kt:1228` — the "Seerr integration" settings entry only exists when enabled.
  - `W/services/UserSwitchListener.kt:89` — the auto-connect on user switch (plugin settings / saved Seerr user) only runs when enabled (the whole block is under the flag, so firetv also skips plugin-provided Seerr auto-login).
- The flag only gates those three spots; actual Discover UI visibility is driven by `SeerrServerRepository.active` = connection is `Success` AND `SeerrApi.active` (`W/services/SeerrServerRepository.kt:61`), so a configured-but-erroring server also hides Discover.
- Web port: no flavor concept; decision needed (feature flag / config) — see questions.

## D.2 Auth methods, HTTP calls, cookies and headers

Base URL normalisation: `createSeerrApiUrl(url)` appends path segments `api/v1` unless the URL already ends with `/api/v1[/]` (`W/ui/setup/seerr/SwitchSeerrViewModel.kt:209-222`). Stored server URL is the user-entered base (e.g. `https://seerr.example/`), the `/api/v1` suffix is added only when building the client. Image proxy uses the un-suffixed URL.

`SeerrApiClient` (`W/api/seerr/SeerrApiClient.kt`): one OkHttp client with
- request interceptor: `X-Api-Key: <apiKey>` header when an API key is set;
- custom CookieJar: stores ONLY cookies named `connect.sid` (the Seerr/Express session cookie), keyed by cookie domain, in memory; sent back by request host; `hasValidCredentials` = api key set OR `connect.sid` not expired.
There is no CSRF handling and no bearer token. The cookie jar ignores path/Secure/SameSite and sends the stored cookie on every request to that host; `X-Api-Key` is added to every request when an API key is set (including plugin-provided API-key mode). The Seerr API base URL always gets `/api/v1` appended (`createSeerrApiUrl`), while the imageproxy URL is built from the stored URL minus a trailing slash (`CurrentSeerr.imageUrlBuilder`, `SeerrServerRepository.kt:339-358`), so a user-entered URL that already ends in `/api/v1` would break image proxying (only migrated at upgrade by `migrateSeerrUrl`, which strips `/api/v1` and ensures a trailing slash, `SwitchSeerrViewModel.kt:209-229`). The Jellyfin-plugin calls use the Jellyfin access-token `Authorization` header instead.

Supported auth methods (`SeerrAuthMethod`: LOCAL, JELLYFIN, API_KEY — `W/data/model/SeerrServer.kt:68`). Plex login exists in the spec (`POST /auth/plex`) but is NOT used.
| Method | Calls (`seerrLogin`, `W/services/SeerrServerRepository.kt:307-337`) |
|---|---|
| API key | no login call; every request carries `X-Api-Key`. Validated with `GET /api/v1/auth/me` (which returns the API-key owner = admin user) |
| Jellyfin user | `POST /api/v1/auth/jellyfin` JSON `{username, password}` (spec also allows hostname/email/serverType but they are NOT sent) -> `Set-Cookie: connect.sid=...`; then `GET /api/v1/auth/me` |
| Local user | `POST /api/v1/auth/local` JSON `{email: <username field>, password}`; then `GET /api/v1/auth/me` (the UI labels the field "Username" but the value is sent as `email`) |
After success: `GET /api/v1/settings/public` -> `PublicSettings` (fields used: `movie4kEnabled`, `series4kEnabled`, `cacheImages`) stored with the user (`SeerrServerRepository.set`).

Permissions: `User.permissions` bitmask (`W/data/model/SeerrPermission.kt`, from Seerr `permissions.ts`): NONE 0, ADMIN 2, MANAGE_SETTINGS 4, MANAGE_USERS 8, MANAGE_REQUESTS 16, REQUEST 32, VOTE 64, AUTO_APPROVE 128, AUTO_APPROVE_MOVIE 256, AUTO_APPROVE_TV 512, REQUEST_4K 1024, REQUEST_4K_MOVIE 2048, REQUEST_4K_TV 4096, REQUEST_ADVANCED 8192, REQUEST_VIEW 16384, AUTO_APPROVE_4K 32768, AUTO_APPROVE_4K_MOVIE 65536, AUTO_APPROVE_4K_TV 131072, REQUEST_MOVIE 262144, REQUEST_TV 524288, MANAGE_ISSUES 1048576, VIEW_ISSUES 2097152, CREATE_ISSUES 4194304, AUTO_REQUEST 8388608, AUTO_REQUEST_MOVIE 16777216, AUTO_REQUEST_TV 33554432, RECENT_VIEW 67108864, WATCHLIST_VIEW 134217728, MANAGE_BLOCKLIST 268435456, VIEW_BLOCKLIST 1073741824. `hasPermission(p)` = false when `User.permissions` is null; otherwise bit set OR any of p's *parents* has the bit (evaluated recursively, so a parent's own parents and ADMIN also count) OR ADMIN bit set (`W/data/model/SeerrPermission.kt:46-56`). (Parents: e.g. REQUEST_MOVIE <- REQUEST; REQUEST_4K_MOVIE <- REQUEST_4K; REQUEST_ADVANCED <- MANAGE_REQUESTS; AUTO_APPROVE_MOVIE <- AUTO_APPROVE ...) Derived flags (`CurrentSeerr`): `requestMovieEnabled = REQUEST_MOVIE`; `request4kMovieEnabled = publicSettings.movie4kEnabled && REQUEST_4K_MOVIE`; `requestTvEnabled = REQUEST_TV`; `request4kTvEnabled = publicSettings.series4kEnabled && REQUEST_4K_TV`. `canRequestMovies = REQUEST_MOVIE || REQUEST_4K_MOVIE`; `canRequestTv = REQUEST_TV || REQUEST_4K_TV`.

## D.3 Setup / login flow UI (`W/ui/setup/seerr/*`, entry `W/ui/preferences/PreferencesContent.kt:497-540`)

Entry: Settings > More > "Seerr integration" (only if flavor enabled). Summary text: NotConfigured -> "Add Server" (`add_server`), Success -> "Enabled" (`enabled`), Error -> "Server error" (`voice_error_server`); the plugin-provided error dialog title is "Error" (string `error`). Dialog bodies (`rememberSeerrDialogBody`, `PreferenceUtils.kt:57-97`): "URL: <url>\nUsername: <name> (Local user|Jellyfin user)" or "Username: API Key", plus "\n\nManaged by server" when plugin-provided, plus "\n\nError: <message>" in the error dialog (rendered in the error colour). Click:
- NotConfigured -> Add flow (below);
- Success -> "Remove Seerr Server" confirm dialog showing `URL: ...`, `Username: <name> (Local user|Jellyfin user)` or `Username: API Key`, plus "Managed by server" if plugin-provided (plugin-provided: read-only scrollable dialog, no remove);
- Error -> confirm dialog (title "Remove Seerr Server", or "Error"+Retry when plugin-provided) with the exception message.
Add flow (`AddSeerrServerDialog.kt`): 1) choose login type dialog "Login to Seerr server" with items **API Key**, **Jellyfin user**, **Local user**; 2a) API key form: title "Enter URL & API Key", fields URL (90dp label), API Key (password keyboard), Submit; 2b) username form ("Use username/password"): URL, Username (prefilled with current Jellyfin user name), Password, Submit with spinner while loading. Error text under fields in error color. Initial URL pre-filled from the server plugin if available.
Form behavior (`AddSeerrServer.kt:42-157,160-329`, `AddSeerrServerDialog.kt:70-103,164-215`): API-key form Submit is enabled only when there is no current error and URL and API key are non-blank (no spinner; error text titleLarge in the error colour; keyboard IME Go submits); username form Submit is enabled when no error, URL and username are non-blank (password may be blank) and not loading (spinner while loading); editing any field clears the error; initial focus goes to the first empty field; choosing a login type resets the status; API key and password fields use the Password keyboard type; on success the dialog auto-dismisses and toasts "Seerr server added". Remove failure -> toast "Could not remove server"; plugin Retry re-fetches the plugin settings and clears Seerr state if the plugin now returns none (`SwitchSeerrViewModel.kt:147-168`).
Submit (`SwitchSeerrViewModel.submitServer`, `SwitchSeerrViewModel.kt:61-145`; `createUrls` 181-207; `createSeerrApiUrl` 209-222): an unparsable URL throws `IllegalArgumentException` before any request -> toast "Invalid URL" and error state "Invalid URL". The stored server URL is the tested `HttpUrl` string (scheme/port/trailing slash as OkHttp normalises it).
1. `createUrls(input)`: if it has http(s) scheme -> try as typed, plus (when default port) the same host on port 5055; if no scheme -> try `http://x`, and when port is 80 also `https://x`, `http://x:5055`, `https://x:5055`; non-80 ports also try https.
2. For each URL candidate: `SeerrServerRepository.testConnection` using a client with connectTimeout 2 s / readTimeout 6 s: performs `seerrLogin` (see D.2). First success wins. Per URL: `ClientException` 401/403 -> toast "Invalid credentials"; other `ClientException` -> "Could not connect with URL"; other exceptions -> their message. If none succeed -> toast "Could not connect" and the error text is one line per URL "<url> - <message>".
3. On success `addAndChangeServer`: upsert server by URL, save SeerrUser, set client, call `GET /auth/me`, `GET /settings/public`, publish `SeerrState`. Toast "Seerr server added".
Plugin-provided server: if the Jellyfin server has the companion plugin ("Wholphin" plugin; `GET {jellyfin}/wholphin/public` returns 2xx), `GET {jellyfin}/wholphin/seerrsettings` returns JSON `{"version":1,"serverUrl":"https://seerr","login":{"type":"ApiKey","apiKey":"..."}}` or `"login":{"type":"Local","local":{"username":"..","password":".."}}` or `"login":{"type":"None"}`: `login` is a kotlinx.serialization sealed interface decoded with the default polymorphic `type` discriminator (`@SerialName` "None"/"ApiKey"/"Local") with the variant's properties flattened beside it, NOT a wrapper key named after the variant; `version` is an Int (default 1), `serverUrl` and `login` are nullable; decoder = `Json{isLenient, ignoreUnknownKeys, allowTrailingComma}` (`HomeSettingsService.jsonParser`). A null/None login or blank `serverUrl` means not configured (`usePluginProvidedServer` returns false). HTTP 404 -> null (treated as "no config"); other non-2xx throws. Requests use the Jellyfin-authenticated OkHttp client (`Authorization: MediaBrowser ...` with the access token) (`W/services/ServerPluginApi.kt:62-80`, `W/data/model/SeerrPluginConfig.kt:6-30`, `W/services/HomeSettingsService.kt:602-607`, `SeerrServerRepository.kt:191-198`). On a connection exception the repository sets state Error with `pluginProvided=true` and returns false, after which `UserSwitchListener` falls through to the locally saved SeerrUser, which can override the Error state. On user switch this is tried first (`UserSwitchListener.kt:89-100`); success sets `pluginProvided=true` (not removable by user).

### Persistence (per Jellyfin user, per Seerr server)
- Room tables `seerr_servers(id, url UNIQUE, name, version)` and `seerr_users(PK jellyfinUserRowId+serverId, authMethod, username, password, credential)`; FKs cascade on delete (`W/data/model/SeerrServer.kt`, DAO `W/data/SeerrServerDao.kt`). `credential` = the API key (API_KEY method); `username`/`password` = stored for LOCAL/JELLYFIN (**plain-text password is stored** so the session can be re-established with a fresh login on every app start/user switch).
- On Jellyfin user switch (`UserSwitchListener.kt:100-135`): take the LAST saved SeerrUser of that Jellyfin user; `seerrApi.update(url, apiKey)`; if not API key -> re-login with stored username/password; else `GET /auth/me`; then `GET /settings/public`. Failure -> `SeerrConnectionStatus.Error` (Discover disabled, settings shows Error). Only one Seerr connection is active at a time. Remove = delete the SeerrUser row (`DELETE ... seerr_users`) and clear client.
- Web analog: store per (Jellyfin server + user) in a secure place; browsers need a decision (see questions).

## D.4 Where Discover appears
- Nav drawer item "Discover" (`NavDrawerItem.Discover`) only when `seerrServerRepository.active` (`W/services/NavDrawerService.kt:62-78, 193-200`); pinnable in nav drawer prefs. It is added right after Favorites in the built-in items and is PINNED by default (unknown pin state = PINNED); it appears in the pin-editing list only when Seerr is active (`NavDrawerService.kt:193-200, 225-243`, `ui/preferences/NavDrawerPreference.kt:315-320, 367`).
- `Destination.Discover` -> `DiscoverPage` (tabs below). Also `Destination.DiscoveredItem(item, startIndex)`, `Destination.DiscoverMoreResult(type, startIndex=20, initialFilter, titleOverride)` (`W/ui/nav/Destination.kt:150-166`).
- Main Search page gets a "Discover" tab / combined results when Seerr is active and the user toggled "discoverEnabled" (`W/ui/search/SearchViewModel.kt:126-145, 345-360, 548-566`; `SearchPage.kt:117, 249-253`).
- Jellyfin Movie/Series/Person detail pages append a Seerr-powered row (`seerrService.similar(item)` using Jellyfin `providerIds.Tmdb`): movie -> `GET /movie/{tmdbId}/similar`, series/season/episode -> `GET /tv/{tmdbId}/similar`, person -> `GET /person/{tmdbId}/combined_credits` (cast+crew merged, de-duplicated by id, sorted by release date desc); person page also gets a "view more" -> `DiscoveredItem(discoverPerson, maxItems)` (`W/ui/detail/PersonPage.kt:150-165, 286-300`, `MovieViewModel.kt:155`, `SeriesViewModel.kt:254`). These calls return null/skip silently when Seerr is inactive; when Seerr is active but the item has no `Tmdb` provider id (or is another type), `similar()` returns an EMPTY list (not null) (`SeerrService.kt:80-135`). The row is titled `discover` and uses `DiscoverRequestType.UNKNOWN`; on the Person page it is truncated to `homePagePreferences.maxItemsPerRow` and the view-more button appears only when more exist (`PersonPage.kt:265-300, 443-452`).
- Jellyfin Series detail page has its own "Discover" button (`fa_magnifying_glass_plus` icon, title `discover`) in the button row, shown only when `GET /tv/{tmdbId}` (via `seerrService.getTvSeries(series)` + `createDiscoverItem`) succeeds while Seerr is active (collected live from `seerrService.active`); it navigates to `Destination.DiscoveredItem(discoverSeries)` (the Seerr TV detail page) (`SeriesViewModel.kt:257-272`, `SeriesDetails.kt:249-253, 488-505`).
- Search: `discoverEnabled` defaults to true, is toggled by a button on the search page and persisted per user under key `searchIncludeDiscover` (`SearchViewModel.kt:126-145, 548-575`); the Discover search tab / combined results show only when `seerrActive && discoverEnabled`, and Discover search results are filtered to movie/tv (`SearchViewModel.kt:345-355`, `SearchPage.kt:249-253`).
- Home settings may only offer Discover rows when `discoverEnabled` (`W/ui/main/settings/HomeSettingsViewModel.kt:116`).

## D.5 Discover page (`W/ui/discover/DiscoverPage.kt`)

Tabbed page, tabs in order: **Discover**, **Request**, **Search**, **Movies**, **TV Shows** (`R.string.discover/request/search/movies_title/tv_shows_title`). Tab strip hidden when focus row/position moves down.

### Tab 1 "Discover" (`SeerrDiscoverPage.kt`)
```
HomePageHeader (height 180dp; top pad 48dp; start pad 8dp)
  focused item: title (or logo if prefs.showLogos and the item exists in Jellyfin), overview, quick details = `listToDotString([year], audienceRating, criticRating)` = "<year> · <audienceScore/10 formatted %.1f> + star icon · <criticsScore as integer N%> + 'fresh' icon if >= 60 else 'rotten' icon" (ratings fetched lazily; movies have both, TV only the critic %); shown only when the focused thing is an item. When a genre card is focused the header shows only the genre title (`genre_movies`/`genre_tv_shows` = "<Genre> Movies"/"<Genre> TV Shows") with no subtitle, overview, details or logo (`SeerrDiscoverPage.kt:417-456`, `ui/Formatting.kt:245-269`, `data/model/DiscoverItem.kt:130-142`, `DiscoverFocusedItem.kt:43-58`)
LazyColumn (content pad start/end 16dp, bottom 40dp; row spacing 8dp)
  Row 0  "Trending"            poster cards   [View more]
  Row 1  "Movies"              poster cards   [View more]
  Row 2  "Genres in Movies"    backdrop genre cards (height 128dp)
  Row 3  "Upcoming Movies"     poster cards   [View more]
  Row 4  "TV Shows"            poster cards   [View more]
  Row 5  "Genres in TV Shows"  backdrop genre cards
  Row 6  "Upcoming TV Shows"   poster cards   [View more]
```
Poster card: width = 172dp * 2/3 = 114.7dp, aspect 2:3, below it title (bodyMedium SemiBold, 1 line, marquee on focus after 500 ms) and release year (bodySmall). Row items spacing 16dp, row content padding horizontal 16dp / vertical 8dp. Row title style titleLarge.
Backdrop: focused card's TMDB backdrop (or genre backdrop) becomes the page backdrop (`backdropService.submit("discover_<id>", url)`); cleared when focus is on nothing. Initially focus lands on Trending when loaded.
Per-row load states: Loading -> row title + "Loading" text; Error -> error message in place of row; Success -> row. Rows are independent requests started in parallel.

Seerr endpoints per row (all `GET`, page=1, via `SeerrService`, `W/services/SeerrService.kt:54-96`):
| Row | Endpoint | notes |
|---|---|---|
| Trending | `/discover/trending?page=1` | mixed movie/tv/person results, mapped by `mediaType` |
| Movies | `/discover/movies?page=1` | only `page` is sent (no `sortBy`); the sort is whatever the Seerr server defaults to (the OpenAPI file gives `sortBy` only an `example` of popularity.desc, no default; `seerr-api.yml:5218-5260`) |
| TV Shows | `/discover/tv?page=1` | |
| Upcoming Movies | `/discover/movies/upcoming?page=1` | |
| Upcoming TV | `/discover/tv/upcoming?page=1` | |
| Movie genres | `/discover/genreslider/movie` | each `{id,name,backdrops[]}`; card image = random backdrop at `w1280_and_h720_multi_faces` |
| TV genres | `/discover/genreslider/tv` | same |
"View more" card at the end of each item row (not genres) -> `DiscoverMoreResult(type)` (`startIndex` default 20 = SEERR_PAGE_SIZE, i.e. scrolled to where page 2 starts). Genre card click -> `DiscoverMoreResult(DISCOVER_MOVIES|DISCOVER_TV, initialFilter=DiscoverFilter(genreIds=[id]), titleOverride="<Genre> Movies"|"<Genre> TV Shows" (`genre_movies`/`genre_tv_shows`), startIndex=0)`.
Quirk: the TV genre row's focus-backdrop lookup uses `movieGenres` (copy/paste bug at `SeerrDiscoverPage.kt` ROW_GENRES_TV branch) so backdrop preview for TV genres shows the wrong list.
Ratings (focused item only, cached 100 entries): movie `GET /movie/{id}/ratings` (`criticsScore`, `audienceScore`/10); tv `GET /tv/{id}/ratings` (`criticsScore` only); persons no rating. Any failure (404 or otherwise) is swallowed and the id is cached as an empty `DiscoverRating(null, null)`, so it is never retried in the session (`ui/detail/discover/DiscoverUtils.kt:17-35`, `SeerrDiscoverPage.kt:256-293`).
Card text: the gap between image and title/year text animates from 12dp (unfocused) to 4dp (focused) (`ui/cards/SlidingCardText.kt:20-46`); Discover-tab cards use `onLongClick` = no-op; genre cards use height 128dp (`Cards.heightEpisode`, `UiConstants.kt:96-98`) with row-title padding-start 8dp.

Item mapping (`SeerrService.createDiscoverItem`): `DiscoverItem{ id (TMDB id), type (movie|tv|person|unknown from mediaType), title (`title` for MovieResult/MovieDetails, `name` for TvResult/TvDetails, `title ?: name` for search results, `name ?: title` for credits), subtitle (cast character or crew job), overview, availability = SeerrAvailability.from(mediaInfo.status) ?: UNKNOWN, releaseDate (release_date | first_air_date; search/credits use `releaseDate ?: firstAirDate`), posterUrl (credits fall back to `profilePath`), backDropUrl, logoUrl, jellyfinItemId = `mediaInfo.jellyfinId` = `jellyfinMediaId4k` parsed as UUID, else `jellyfinMediaId` parsed as UUID (an unparsable 4K id falls back to the normal id; `data/model/DiscoverItem.kt`, `SeerrService.kt:362-506`) }`.
Image URLs (`SeerrService.createImageUrl`, `SeerrServerRepository.kt` helper): if the item exists in Jellyfin (`mediaInfo` jellyfin id) -> **Jellyfin** image URL for that item (`/Items/{id}/Images/{type}`); else TMDB: base = `https://image.tmdb.org` or, when `PublicSettings.cacheImages == true`, `{seerrUrl}/imageproxy/tmdb`; poster prefix `/t/p/w500`, backdrop `/t/p/w1920_and_h1080_multi_faces` (genre cards 1280x720); path appended. Logos only exist for Jellyfin-matched items (`LOGO` from Jellyfin), never from TMDB (`createImageUrl` is passed null path; with null mediaInfo a LOGO request returns null). `createImageUrl` throws for any ImageType other than PRIMARY/BACKDROP on the TMDB branch.

### Card overlays / status badges (`W/ui/cards/DiscoverItemCard.kt`)
- Type pill TopStart (when `showOverlay`): "Movie" (bg rgb(37,99,235)), "TV Show" (rgb(147,51,234)), "Person" (rgb(74,222,128)), alpha .8, rounded full, text 10sp, padding 4dp.
- Availability badge TopEnd, 16dp circle, 4dp margin, 0.5dp border:
  - PENDING or PROCESSING -> white (85%) circle, yellow `rgb(234,179,8)` border, yellow bell icon 10sp;
  - PARTIALLY_AVAILABLE -> green `rgb(74,222,128)` 85% fill, white border, white 10x2dp horizontal bar;
  - AVAILABLE -> green 85% fill, white border, white check icon 10sp;
  - BLOCKLISTED -> nothing (TODO in source; a red `rgb(204,38,38)` BlocklistedIndicator composable exists but is unused);
  - UNKNOWN/DELETED -> nothing.
- Click -> `item.destination`: if `jellyfinItemId != null` and type maps to a BaseItemKind (movie->MOVIE, tv->SERIES, person->PERSON) -> the normal Jellyfin item page; else `DiscoveredItem(item)` (Seerr detail page). Long press: no-op.

### Tab 2 "Request" (`SeerrRequestsPage.kt`)
- `GET /request` with NO params (the client calls `requestGet()` and reads only `.results`; the OpenAPI file lists defaults sort=added, sortDirection=desc, filter=all, mediaType=all, and gives `take: 20` / `skip: 0` only as `example`s with no declared default, so the actual page size is Seerr server behavior; `seerr-api.yml:6066-6125`; admins/MANAGE_REQUESTS see every user's requests, others only theirs) — NOTE: only the first page; no paging implemented.
- For each request with `media.tmdbId` (3 concurrent): movie -> `GET /movie/{tmdbId}`; tv -> `GET /tv/{tmdbId}`; mapped to `DiscoverItem`. Re-runs whenever the Seerr connection state changes. All request details load inside one `awaitAll`, so one failing `GET /movie/{id}` or `/tv/{id}` fails the entire tab (ErrorMessage). `RequestGridItem.sortName = request.updatedAt` but the list is not re-sorted client-side (`SeerrRequestsPage.kt:63-120, 139-146`).
- UI: 6-column card grid, spacing 16dp, same `DiscoverItemCard` (badges + type pill). Click -> `DiscoveredItem(item)` (always the Seerr detail page, not the Jellyfin page). Empty -> centered "No results". Error/loading -> ErrorMessage / LoadingPage.

### Tab 3 "Search" (`DiscoverSearchPage.kt`)
Search text box (+ voice button shown iff `interfacePreferences.searchPreferences.showVoiceSearchButton` is true, collected live from preferences; not a TV-only check, `DiscoverSearchPage.kt:125-128, 204-217`) at the top; debounced 750 ms after typing (immediate on search click). `GET /search?query=<q>&page=1`; results mapped, filtered to `movie`/`tv` only (people dropped); shown in combined result grid via `SearchCombinedResults` using `DiscoverItemCard`; click -> Jellyfin item page when `jellyfinItemId` set else `DiscoveredItem`. States: NoQuery, Searching, SuccessSeerr(list), Error.

### Tabs 4/5 "Movies" / "TV Shows" (`DiscoverRequestGrid.kt`, `W/data/filter/DiscoverFilter.kt`, `W/util/DiscoverRequestPager.kt`)
6-column poster grid (`columns=6`, no jump/letter buttons), paged 20/page (Seerr page = index/20 + 1; total from `totalResults`). Header (animated, shown while focus row 0): optional title, **Sort** button, **Filter** button.
- Sort options (`DiscoverSort`), UI labels: "Popularity" (`popularity`), "Date Released" (`release_date`; TV uses `first_air_date`), "Community Rating" (`vote_average`), "Name" (`original_title`; TV also `original_title`) (`DiscoverFilter.kt:18-27`, `strings.xml:23,144,145,878`). Direction asc/desc, default popularity desc. Sent as `sortBy=<key>.<asc|desc>`.
- Filter options Movies (`discoverMovieFilters`): Genres (multi), Studios (watch providers, multi), Community rating (min vote average 1-10), Official rating. TV (`discoverTvFilters`): Genres, Studios, Community rating, Official rating, Production status. A filter already fixed by the entry point (e.g. genre from a genre card) is removed from the list.
- Filter value sources (`W/services/FilterOptionCache.kt:194-265`): genres `GET /discover/genreslider/movie|tv`; studios `GET /watchproviders/movies?watchRegion=US` or `/watchproviders/tv?watchRegion=US` (region hard-coded US); status = enum TvShowStatus values (display = enum value, sent as the enum's ordinal in declaration order, `seerr-api.yml:1100-1102`: Returning Series=0, Planned=1, In Production=2, Ended=3, Canceled=4, Pilot=5; joined with `|`); movie ratings `NR,G,PG,PG-13,R,NC-17`; tv ratings `NR,TV-Y,TV-Y7,TV-G,TV-PG,TV-14,TV-MA`; community rating 1..10.
- Request mapping `GET /discover/movies` / `GET /discover/tv` params: `page`, `language`(unused), `genre` (comma list of ids), `keywords`, `excludeKeywords`, `sortBy`, `withRuntimeGte/Lte` (minutes), `voteAverageGte/Lte`, `voteCountGte/Lte`, `watchRegion` ("US" when any provider chosen), `watchProviders` (comma list), `status` (TV only: `|`-joined ordinals), `certification` (`|`-joined), `certificationCountry` ("US" when certification set), `certificationMode` (`exact` when certification set). Changing sort/filter rebuilds the pager from index 0.
- "View more" destinations: TRENDING (`/discover/trending`), UPCOMING_TV (`/discover/tv/upcoming`), UPCOMING_MOVIES (`/discover/movies/upcoming`), DISCOVER_* with sort/filter. Trending/upcoming grids have no sort/filter controls. Title strings: `discover_tv` "Discover TV Shows", `discover_movies` "Discover Movies", `trending`, `upcoming_tv`, `upcoming_movies`.

## D.6 Movie detail (`W/ui/detail/discover/DiscoverMovieDetails*.kt`, `DiscoverMovieViewModel.kt`)

Layout: `LazyColumn` content padding horizontal 32dp / vertical 8dp, row spacing 16dp:
```
Header (top pad 48dp, bottom 16dp):
   Title (or Jellyfin logo if item is in library & prefs.showLogos) width 75%
   col width 60%: QuickDetails (release date · runtime · certification · audience rating · critic %)
                  Genres, tagline (italic bodyLarge), Overview (3 lines, click -> details dialog),
                  "Directed by <names>"
Buttons (LazyRow, spacing 16dp, pad 8dp): [Request | Pending | Go to | ...] [Request (extra, when PARTIALLY_AVAILABLE)] [Cancel (if allowed)] [Trailers]
People row (cast then crew; PersonCard width 108dp; role = character/job)
"More like this" row (poster cards)   "Recommended" row (poster cards)
```
Calls: `GET /movie/{id}` (full details incl. credits, relatedVideos, releases, mediaInfo+requests) on enter and **on every resume** (`LifecycleResumeEffect -> init()`); in parallel `GET /movie/{id}/ratings`, `GET /movie/{id}/similar?page=1`, `GET /movie/{id}/recommendations?page=1`. Trailers = `relatedVideos` with type Trailer, name+url non-blank; the Trailers button has three states: no trailers -> disabled "No trailers"; exactly one -> "Play trailer" (opens it directly); more than one -> "Trailers" opening a chooser dialog (`ui/components/PlayButtons.kt:389-422`); remote trailers open via an `ACTION_VIEW` intent (web: new tab), local trailers navigate to Playback (`TrailerService.kt:84-104`). Similar and Recommended are only fetched when the `similar` list is empty (`DiscoverMovieViewModel.kt:98-137`), while `GET /movie/{id}` and the ratings call are re-fetched on every resume. People / "More like this" / "Recommended" rows always open the Seerr page (`Destination.DiscoveredItem`), never the Jellyfin page (`DiscoverMovieDetails.kt:122-127`). QuickDetails = release date, runtime (rounded minutes), certification (`releases.results` entry whose `iso_3166_1` == device-locale country, else US, else the first entry; its first `releaseDates[0].certification` if non-blank), then `listToDotString` adds audience score "%.1f" + star icon and critic "<n>%" + fresh icon if >= 60 else rotten icon (`DiscoverMovieDetailsHeader.kt:80-114`, `ui/Formatting.kt:245-269`). Overview click opens a details dialog (title, overview, genres).
Primary button state machine (`ExpandableDiscoverButtons.kt`) from `MediaInfo.status` (`SeerrAvailability`: 1 UNKNOWN, 2 PENDING, 3 PROCESSING, 4 PARTIALLY_AVAILABLE, 5 AVAILABLE, 6 BLOCKLISTED, 7 DELETED):
| availability | label / icon | enabled | action |
|---|---|---|---|
| UNKNOWN | "Request" / download | only if user `canRequestMovies` (or `canRequestTv` for TV) | open request flow |
| PENDING, PROCESSING | "Pending" / clock | yes | movie: no-op (`pendingOnClick` default); TV: opens the season request dialog (see D.7) |
| PARTIALLY_AVAILABLE, AVAILABLE | "Go to" / play | yes | navigate to Jellyfin item `Destination.MediaItem(jellyfinId(4k first), MOVIE|SERIES)`; toast "No Jellyfin ID found" / "Unknown Jellyfin ID: x" if mapping missing |
| DELETED | "Delete" | disabled | - |
| BLOCKLISTED | "Unavailable" | disabled | - |
PARTIALLY_AVAILABLE additionally shows a second "Request" button that is always enabled (not gated by `canRequest`). DELETED shows the label "Delete" with a video icon and BLOCKLISTED the label "Unavailable" with an xmark icon (both disabled) (`ExpandableDiscoverButtons.kt:51-149`). "Cancel" button shows when `canUserCancelRequest(user, mediaInfo.requests)` = (user has MANAGE_REQUESTS and any request exists) OR (user has REQUEST and any request where `requestedBy.id == me` and `status < APPROVED` [RequestStatus: UNKNOWN0, PENDING1, APPROVED2, DECLINED3, FAILURE4, COMPLETED5]).
Cancel: `DELETE /request/{id}` of the FIRST request in `mediaInfo.requests` (source TODO: not necessarily the user's), then refetch `GET /movie/{id}`.

### Movie request flow (`RequestMovie.kt`, `SeerrService.getProfilesAndFolders`)
1. Click Request -> `GET` advanced data **only if** user has REQUEST_ADVANCED (admin implied): `GET /service/radarr` (list; pick `isDefault && !is4k`, else first non-4k; 4K likewise `is4k`), then `GET /service/radarr/{id}` for each chosen -> `profiles[{id,name}]` (default = `server.activeProfileId`) and `rootFolders[{id,path,freeSpace}]` (default = `server.activeDirectory`); free space formatted from bytes. Errors -> toast "Error getting profiles & folders: msg" and continue without advanced data.
2. Dialog states: loading spinner; error message; otherwise
   - No advanced data (profiles/folders all empty): if both normal and 4K allowed -> choice popup titled "<Title> (<release date>)" with items "Request" and "Request in 4K"; else auto-submits immediately (4K iff only 4K allowed).
   - Advanced data: form with title "<Title> (<date>)", [4K switch "Request in 4K" shown only when both allowed] + Submit, then ListItems "Quality profile" (name, "(Default)" suffix) and "Root folder" (path + free space on trailing side), each opening a picker dialog with check mark on selected. Defaults: the profile/folder flagged default else first. Switching 4K swaps the profile/folder lists (`profiles4k`, `rootFolders4k`). If `requestEnabled` is false the 4K switch starts on.
3. Submit -> `POST /request` JSON `{mediaType:"movie", mediaId:<tmdbId>, is4k, serverId, profileId, rootFolder, tags:[]}` where `serverId` = null if both profileId and rootFolder are null, else radarr (or radarr4k) server id; profile/folder null when no advanced data. Response 201 `MediaRequest`. On error toast "An error occurred". Then refetch `GET /movie/{id}`, recompute cancel permission. When no advanced data exists and the 4K/normal choice popup does not apply, the request auto-submits with `is4k = request4kEnabled` even if `requestEnabled` is false (`RequestMovie.kt:100-127`). `profileLoading` is only ever set to Success (never reset to Loading), so reopening the dialog shows the previous data until the new fetch completes (`DiscoverMovieViewModel.kt:248-257`).

## D.7 TV detail (`DiscoverSeriesDetails.kt`, `DiscoverSeriesViewModel.kt`, `RequestSeasons.kt`)

Header is NOT the movie header with different fields (`DiscoverSeriesDetails.kt:424-490` vs `DiscoverMovieDetailsHeader.kt:78-168`): TitleOrLogo (width 75%, Jellyfin logo if the series is in the library and `showLogos`), then a column of width 60% with QuickDetails = `firstAirDate` (raw string) + mean of `episodeRunTime` (via `average()`, rounded to minutes, omitted when NaN/<= 0) + audience rating (always absent for TV) + critic %, then genres, then overview (3 lines, click opens the details dialog). No tagline, no "Directed by", no certification. TV details are NOT re-fetched on resume (the movie page has a `LifecycleResumeEffect`); `/tv/{id}/similar` and `/recommendations` are only requested when `similar` is empty (`DiscoverSeriesViewModel.kt:121-140`). Seasons row is commented out in source; rows: buttons, people (cast then crew), "More like this", "Recommended". Calls: `GET /tv/{id}`, `/tv/{id}/ratings`, `/tv/{id}/similar?page=1`, `/tv/{id}/recommendations?page=1`. Overall availability: `mediaInfo.status`; if UNKNOWN then derived from the current user's requests: any PENDING -> PENDING, else any APPROVED -> PROCESSING, else UNKNOWN. Primary button state machine as D.6 except: UNKNOWN -> "Request" (enabled iff `canRequestTv`) opens the season dialog; PENDING/PROCESSING -> "Pending" (enabled) ALSO opens the season dialog (`DiscoverSeriesDetails` passes `pendingOnClick = requestOnClick`, so pending seasons can be edited; movie details do not override it) after loading profiles/folders; PARTIALLY_AVAILABLE/AVAILABLE -> "Go to" (Jellyfin SERIES), PARTIALLY_AVAILABLE also shows the second Request button opening the season dialog; DELETED/BLOCKLISTED disabled (`DiscoverSeriesDetails.kt:279-283`, `ExpandableDiscoverButtons.kt:40,110-114,135-149`).
Per-season model (`updateSeasonStatus`, `DiscoverSeriesViewModel.kt:181-303`; computed for normal and, only when `request4kTvEnabled`, 4K; it uses every `tv.seasons[]` entry that has a seasonNumber, with no client-side filtering of season 0 / Specials): `seasonAvailability` from `tv.seasons[].status|status4k` raised by `tv.mediaInfo.seasons[]` (max wins); `seasonStatus` (RequestStatus) from `tv.mediaInfo.requests` filtered by `is4k`, taking the highest status per season (compared by numeric RequestStatus value, so DECLINED 3 / FAILURE 4 / COMPLETED 5 outrank APPROVED 2); `editable[season]` = request owned by current user AND request status PENDING or DECLINED, overwritten by the LAST matching request. Season availability shown: status PENDING -> PENDING, APPROVED -> PROCESSING, DECLINED/FAILURE -> UNKNOWN, UNKNOWN/COMPLETED -> seasonAvailability. Default editable = availability not in {AVAILABLE, PARTIALLY_AVAILABLE, PROCESSING, BLOCKLISTED}.
Season request dialog (`RequestSeasons`): title series name; [4K switch if both] + Submit (disabled when nothing selected); quality profile & root folder pickers (advanced users only, same sourcing via `GET /service/sonarr` + `/service/sonarr/{id}`, default non-4K default server); divider; "Seasons" header + "Select all" switch (only editable seasons); list row per season: name (or "Season N") + "<n> episodes", leading availability badge, trailing switch. Switch display: a row's switch shows checked when the season is in `selectedSeasons` OR in `availableSeasons` (non-editable seasons whose request status is PENDING/APPROVED/COMPLETED or whose availability is PARTIALLY_AVAILABLE/AVAILABLE; shown checked and disabled). Initial `selectedSeasons` = seasons whose request-season status is PENDING (even non-editable ones), plus user toggles; the already-available/approved seasons are NOT part of the submission. Non-editable rows are disabled. A second Submit button appears when more than 3 seasons. Submit is disabled when `selectedSeasons` is empty. The dialog always opens (even with no advanced data, unlike the movie flow's auto-submit/choice popup); when `requestEnabled` is false the 4K switch starts ON and `is4k` swaps the season list, profiles and folders; `profileLoading` is never reset, so reopening shows the previous data until the new fetch completes. Row label: `season.name` else formatted "Season N", supporting text "<episodeCount> episodes"; availability badges: PENDING/PROCESSING pending icon, PARTIALLY_AVAILABLE, AVAILABLE; none for UNKNOWN/DELETED/BLOCKLISTED (`RequestSeasons.kt:60-175, 228-334`).
Submit: the request body's `seasons` is `selectedSeasons.toList()` for both PUT and POST (the currently selected set only; un-checking a pending season removes it from the sent list, so the PUT does drop it; already approved/available seasons are not sent). If the user already has a PENDING request on the series (the first request with `status == PENDING && requestedBy.id == me`, regardless of `is4k`) -> `PUT /request/{requestId}` body `{mediaType:"tv", seasons:[n..], is4k, serverId?, profileId?, rootFolder?}` (`DiscoverSeriesViewModel.kt:364-411`); else `POST /request` `{mediaType:"tv", mediaId:<tmdbId>, seasons:[...], is4k, serverId, profileId, rootFolder, tags:[]}`. `serverId` rule identical to movies. Then refetch `GET /tv/{id}` and recompute seasons/availability. Cancel = `DELETE /request/{firstRequest.id}`.

## D.8 Person detail (`DiscoverPersonPage.kt`)
Title "Discover: <name>" (displaySmall, centered); `GET /person/{id}/combined_credits` (cast + crew merged, de-duplicated by TMDB id, sorted by release date desc, undated last) shown in a 6-column `DiscoverItemCard` grid (spacing 16dp, initial scroll position `startIndex`); click -> `DiscoveredItem(item)` (movie/tv detail). Empty -> "No results". Note: the person's own details (`GET /person/{id}`) are not fetched here. Item ids across types can collide (movie id vs tv id) — de-dup is by `id` only (source behavior), keeping the cast entry first; sort puts null dates last. There is no error handling: `seerrService.personCredits(item.id)` is called inside `launchIO` (default `ExceptionHandler()` only logs) without try/catch, so a failure leaves the page on the LoadingPage spinner and the ErrorMessage branch is unreachable. The page is reached from `DiscoveredItem(person, startIndex)` both from Seerr person cards and from the Jellyfin person page "view more" (`discoverPerson` built from `providerIds.Tmdb`). Poster for person-type credits falls back to `profilePath` (`DiscoverPersonPage.kt:60-94`, `SeerrService.kt:146-181, 447-499`).

## D.9 Linking Seerr items back to Jellyfin library items
- Seerr `MediaInfo.jellyfinMediaId` / `jellyfinMediaId4k` (strings) -> UUID (`jellyfinId` prefers 4K id, then normal); stored in `DiscoverItem.jellyfinItemId`. `jellyfinId` = `jellyfinMediaId4k` parsed as UUID, falling back to `jellyfinMediaId` parsed as UUID (an unparsable 4K id falls back to the normal id; `data/model/DiscoverItem.kt:113-125`, `SeerrService.kt:502-506`). The Jellyfin item page (`item.destination`: used only when `jellyfinItemId != null` and the type maps to MOVIE/SERIES) is opened from: Discover-tab rows (`SeerrDiscoverPage.kt:476`), the Movies/TV grids (`DiscoverRequestGrid`), Discover search (`DiscoverSearchPage.kt:130-140`) and the main Search page (`SearchPage.kt:178-186`). `Destination.DiscoveredItem` (the Seerr page) is ALWAYS used from: the Request tab (`SeerrRequestsPage.kt:198`), the people / "More like this" / "Recommended" rows on Seerr movie and TV detail pages (`DiscoverMovieDetails.kt:122-127`, `DiscoverSeriesDetails.kt:124-127`) and the Seerr person-page grid (`DiscoverPersonPage.kt:122`), even if the item exists in Jellyfin. Seerr persons are never linked (`discoverPerson()` and credit/person items have `jellyfinItemId=null`; credit items take `jellyfinId` from the credit's work `mediaInfo` only). Posters/backdrops/logos come from Jellyfin when a Jellyfin id exists.
- Reverse: Jellyfin items are mapped to Seerr by `BaseItem.data.providerIds["Tmdb"]` -> Seerr TMDB id (movie `GET /movie/{id}/similar`; series `GET /tv/{id}` for `getTvSeries`; person combined credits).
- "Go to" on a Seerr detail page for AVAILABLE / PARTIALLY_AVAILABLE navigates to the Jellyfin item using the id above.

## D.10 Error / empty states summary
| Situation | UI |
|---|---|
| Flavor off | no settings entry (`AppPreference.kt:1226-1233`), no auto-connect, no Discover UI |
| Flavor on, Seerr not configured | settings entry visible with summary "Add Server" (click opens the Add flow); no Discover nav item / search tab / rows / similar rows; no Seerr calls |
| Seerr connection error | settings summary "Server error"; Discover UI absent (nav/search gating uses `SeerrServerRepository.active` = connection Success AND `SeerrApi.active`, `SeerrServerRepository.kt:61`, `SeerrApi.kt:23`); click shows error dialog with remove/retry |
| Malformed server URL | toast "Invalid URL" and error state "Invalid URL" (`SwitchSeerrViewModel.kt:61-84`) |
| "Go to" without a Jellyfin id | toast "No Jellyfin ID found" / "Unknown Jellyfin ID: <id>" (`DiscoverUtils.kt:42-71`) |
| Rating fetch failure (incl. 404) | swallowed silently; rating just absent (`DiscoverUtils.kt:17-35`) |
| Seerr removal failure / plugin retry failure | toast "Could not remove server" / toast "Server error" (`SwitchSeerrViewModel.kt:147-168`) |
| Cancel-request failure | same "An error occurred" toast (`DiscoverSeriesViewModel.kt:426-440`) |
| Row failure | ErrorMessage replaces that row only |
| Detail load failure | ErrorMessage |
| Request failure | toast "An error occurred" |
| Profiles/folders failure | toast "Error getting profiles & folders: ..." (request still possible without advanced options) |
| Empty request list / credits | "No results" (Discover search uses NoQuery / Searching / Error states instead) |
| Login failure | toast "Invalid credentials" or "Could not connect" and per-URL error text in dialog |

## D.11 Seerr HTTP API summary (all prefixed with `{seerr}/api/v1`)
`GET /auth/me`, `POST /auth/local`, `POST /auth/jellyfin`, `GET /settings/public`, `GET /search`, `GET /discover/{trending,movies,movies/upcoming,tv,tv/upcoming,genreslider/movie,genreslider/tv}`, `GET /watchproviders/{movies,tv}`, `GET /movie/{id}[/ratings|/similar|/recommendations]`, `GET /tv/{id}[/ratings|/similar|/recommendations]`, `GET /person/{id}/combined_credits`, `GET /request`, `POST /request`, `PUT /request/{id}`, `DELETE /request/{id}`, `GET /service/{radarr|sonarr}`, `GET /service/{radarr|sonarr}/{id}`, images `{seerr}/imageproxy/tmdb/t/p/...` or `https://image.tmdb.org/t/p/...`. Companion plugin on Jellyfin: `GET {jellyfin}/wholphin/public`, `GET {jellyfin}/wholphin/seerrsettings`.

---------------------------------------------------------------------------------------------------

# WEB ADAPTATION QUESTIONS (decisions needed; not decided here)

## Seerr — every place the client calls Seerr directly (CORS / cookie constraints)
1. All Seerr traffic in the Android app is direct client -> Seerr (no Jellyfin proxy): login (`POST /auth/local`, `POST /auth/jellyfin`), identity (`GET /auth/me`), settings (`GET /settings/public`), every discover/search/detail/rating/similar/recommendation GET, request create/update/delete, radarr/sonarr service lookups, watch-provider lists, genre sliders, and image requests (`/imageproxy/tmdb/...` or TMDB CDN). A browser needs: (a) Seerr to send CORS headers (`Access-Control-Allow-Origin` for the web app origin, `Allow-Headers` incl. `X-Api-Key`, `Content-Type`; `Allow-Credentials: true` for cookie auth) — stock Seerr does not enable cross-origin credentials; (b) or a reverse proxy / same-origin path; (c) or a server-side proxy added by the web host (Jellyfin plugin, BFF).
2. Session cookie `connect.sid`: it is HttpOnly + typically `SameSite=Lax`/`Secure`; third-party-cookie rules block it in cross-site XHR/fetch (`credentials: "include"` + `SameSite=None; Secure` + CORS credentials needed) and JS cannot read or persist it. The Android app re-logs in on each start using the stored username/password (plain). Decide: store password in the browser (security!), prefer API key, or proxy.
3. API key auth (`X-Api-Key` header) avoids cookies but is a custom header (preflight OPTIONS) and the key is a full-privilege admin secret if the Seerr owner key is used (it authenticates as the admin user, so request approval/permissions would be admin's) — decide if API-key mode is allowed in the browser.
4. Mixed content: HTTPS web app calling `http://` Seerr (the Android setup also probes `http://host`, `https://host`, `:5055` variants) is blocked by browsers; URL probing strategy (`createUrls`) needs redefining; connectivity test timeouts (2 s connect / 6 s read) also.
5. Image URLs: TMDB CDN (`https://image.tmdb.org/t/p/w500|w1920_and_h1080_multi_faces`) is fine cross-origin for `<img>`; `{seerr}/imageproxy/tmdb` (when `cacheImages`) is cross-origin too; image-based color extraction for dynamic backdrops needs CORS-enabled images (canvas taint).
6. The companion plugin endpoints are on the Jellyfin origin (`/wholphin/public`, `/wholphin/seerrsettings`) and need the Jellyfin auth header (`Authorization: MediaBrowser ...` / `X-Emby-Token`) — CORS on the Jellyfin server must allow that; the settings payload contains the Seerr password/API key in clear (only fetch over trusted origin).
7. Persistence: Android stores `seerr_servers`/`seerr_users` per Jellyfin user row in Room. Web equivalent (per Jellyfin server+user in localStorage/IndexedDB vs. server-side) is undecided; so is whether to store the Seerr password at all.
8. Feature flag replacement for the `firetv` flavor condition (`DISCOVER_ENABLED=false`): runtime config / env var / always on.
9. Request-list scope: Android sends no `take`/`skip`/`filter` params to `GET /request` (server default page size; the OpenAPI example is 20, no declared default) and only uses page-1 `.results` (no paging); documented defaults are sort=added, sortDirection=desc, filter=all, mediaType=all; admins/MANAGE_REQUESTS see all users' requests (`seerr-api.yml:6066-6130`, `SeerrRequestsPage.kt:72-76`); decide whether to add paging and filters (`filter=pending`, `requestedBy=<me>`) to avoid showing all users' requests for admins.
10. `PUT /request/{id}` for TV season edits and `DELETE /request/{firstRequest.id}` (not necessarily the user's own request) — decide whether to fix to "own request only".
11. Region/language hard-coded (`watchRegion=US`, certification country `US`, no `language` param): decide locale handling.

## Live TV
12. Playback: MPEG-TS/HLS live streams in browsers need hls.js/Media Source; DirectPlay of channel streams is unlikely; the app posts `PlaybackInfo` with a device profile -> web needs its own device profile and `LiveStreamId` close handling (Android only relies on the `Playing/Stopped` report).
13. Guide rendering at 240dp/hour x 48 h x up to 100+ channels needs virtualization (2-D) — library choice, row height 64, channel column 120, time header 32; time-zone/DST handling (Android uses local time and explicitly handles DST via durations); live "now" line should tick.
14. Remote-control focus model (Back-key jumps) -> keyboard/mouse equivalents; the channel dialog (Watch live / Favorite-Unfavorite) opens on a plain click/OK on the channel cell; long-press does nothing in the source (`onLongClick = {}` on programs and channels, `TvGuideGrid.kt:465, 504`), so the web mapping (click or right-click) is a free decision.
15. DVR page: `GET /LiveTv/Timers` returns `programInfo` possibly null for time-based timers (source has `!!` TODO) — decide fallback; there is no series-timer management list in Android; decide whether to add `GET /LiveTv/SeriesTimers`.
16. View options (guide header, favorites first, sort by recently watched, color code) are local prefs — web storage key location.

## Music
17. Audio formats: browsers vs the `/Audio/{id}/universal` container list; transcode params and bitrate caps (Android sends none); gapless/preload; replay-gain; crossfade not present.
18. Media session: `navigator.mediaSession` actions; background playback and autoplay policies (user-gesture requirement); tab throttling.
19. Queue persistence: Android keeps the queue only in memory in the player (lost on app kill) — decide whether to persist across reloads. Play-from-index drops preceding tracks (`setQueue(pager,startIndex,...)`) — keep or change.
20. Reporting: only DirectPlay + fixed repeat/shuffle reported to `/Sessions/Playing*`; decide if web should report real values and handle remote-control websocket (`/socket` PlaystateMessage). Session capabilities are already registered app-wide, not in `MusicService`: on login/user switch `ServerEventListener.init` posts capabilities with `playableMediaTypes=[VIDEO]` only (music is not advertised), `supportedCommands=[DisplayMessage, SendString]`, `supportsMediaControl=true`, then subscribes to the websocket for `GeneralCommandMessage`; the music websocket subscription only handles `PlaystateMessage` (`W/services/ServerEventListener.kt:62-80`, `MusicService.kt:437-488`).
21. Visualizer (needs AnalyserNode + CORS on audio), lyrics (`/Audio/{id}/Lyrics`, only synced highlight), backdrop rotation (2 min), 4 per-device preferences all default off.
22. Theme songs: played on Movie, Series, Episode (series' theme) and collection/BOX_SET pages (B.10); volume `HIGHEST=75f` is a source bug whose label is "Full" (intended 1.0; ExoPlayer clamps to 1.0, so full volume in practice) — implement HIGHEST as 1.0. Autoplay policy blocks theme music without gesture.
23. Video player vs music conflict: starting video stops music; web single `<audio>` + `<video>` coordination.

## Photos
24. The slideshow loads the ORIGINAL file (`/Items/{id}/Download`); consider resized `Images/Primary?maxWidth&quality` or `/Items/{id}/Images/...` variants for browsers/mobile data; HEIC/RAW support in browsers; EXIF orientation.
25. Per-image and per-album color filters are stored locally (Room, per user) — web storage choice; how to render (CSS filter vs SVG feColorMatrix vs canvas) and whether to implement Hue/Blur (TODO in Android).
26. Input mapping: D-pad zoom (long-press up/down), pan (30dp steps), wrap-around only for timer; mouse-wheel/pinch/drag equivalents; keep-screen-on -> Screen Wake Lock API; fullscreen API.
27. Video items in slideshow: `Videos/{id}/stream` with no params (assumes direct play) — browser codec support, loop vs advance rules.
28. Transition effects: only 750 ms crossfade; decide whether to add more.

## Cross-cutting
29. Tokens in URLs: Android appends access tokens to stream/image URLs (`api_key`/`ApiKey`) for `<audio>/<video>/<img>`; browsers expose them in history/referrer — alternative: Authorization header via fetch+blob/MSE, or cookies.
30. Websocket (`/socket`) usage and reconnect policy for remote-control commands.
31. Pagination: Jellyfin `ApiRequestPager` (lazy random-access pages, `DEFAULT_PAGE_SIZE=100`) and Seerr pager (page size 20, 1-indexed) -> virtual-scroll strategy with total counts.
32. Platform-specific features with no web equivalent: RECORD_AUDIO permission flow, MediaSession "trust all controllers", Fire TV flavor gating, TV-remote focus management, system `DateUtils` formatting (use Intl).
