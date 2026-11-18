# 06 - Settings, persisted data, server/user setup (Wholphin -> web port spec)

Source of truth: `reference/wholphin/app/src/main/java/com/github/damontecres/wholphin/` (abbrev. `W/`), proto `app/src/main/proto/WholphinDataStore.proto`, strings `app/src/main/res/values/strings.xml`.
Machine-readable companion: [`preferences.json`](./preferences.json) (131 entries; every preference with key, type, default, range, options, title/summary keys + English text, screens/order/visibility, classification). API surface is in [`07-jellyfin-api-inventory.md`](./07-jellyfin-api-inventory.md).

Classification vocabulary used throughout: **web** = applies as-is; **web-adapted** = applies with a different mechanism (stated); **android-only** = drop (reason stated).

"Fresh-install default" = value actually stored on first run: `AppPreferencesSerializer.defaultValue` (W/preferences/AppPreferencesSerializer.kt:18-192) followed by `AppUpgradeHandler.upgradeApp` which runs *every* migration on a fresh install because the previous version is read as `0.0.0` (W/services/AppUpgradeHandler.kt:73-110). "UI default" = `AppPreference.defaultValue`. They differ in a few places (see section 2.4).

---------------------------------------------------------------------

## 1. Persistence overview (what Android stores where, and the web equivalent)

| Android store | Content | Code | Web mapping (recommended) |
|---|---|---|---|
| Proto DataStore `app_preferences.pb` (`AppPreferences`) | All app-wide preferences (section 2). **Device-global, not per-user** | W/services/hilt/DatabaseModule.kt:89-95 | One JSON document in localStorage key `wholphin.appPreferences` (or IndexedDB store `kv`, key `appPreferences`), shape = proto JSON mapping (lowerCamelCase). Use a store with subscribe (zustand/Redux) |
| Preferences DataStore `key_value` | Per-user JSON blobs through `KeyValueService`: key `"{userId}_{key}"` where `userId` is the Jellyfin user UUID via `UUID.toString()` (**with dashes**, unlike the dash-less 32-char form used in Room and file names; not the Room `rowId`). Keys used: `CollectionViewOptions` (W/ui/detail/collection/CollectionViewModel.kt:510), `excludedSearchableTypes` and `searchIncludeDiscover` (W/ui/search/SearchViewModel.kt:573-574) | W/services/KeyValueService.kt, DatabaseModule.kt:101-107 | IndexedDB object store `keyValue` (key = `${userId}_${key}`, value = JSON) |
| Room DB `AppDatabase` v41 | servers, users (+tokens, PIN, per-user prefs), pins, library display info, track choices, ... (section 4) | W/data/AppDatabase.kt:34-61 | IndexedDB (Dexie), one object store per entity |
| SharedPreferences `<pkg>_server` | "Most recent server/user" for auto sign-in: `current.server.id`, `current.server.url`, `current.user.id`, `current.user.accessToken` | W/data/MostRecentServer.kt:82-137 (provider class; key constants 133-137; `RestoredSession` is 142-175) | localStorage key `wholphin.mostRecent` (JSON) |
| SharedPreferences (default) | `version.previous.name/.code`, `version.current.name/.code` (upgrade handler); `preference.update.threshold` (suppression window in hours, default 12, below which the update toast is not shown), `preference.update.lastTimestamp` (epoch ms of the last check that found an update, UpdateChecker.kt:75-105); `acra.enable` (crash reporter mirror); SharedPreferences file `channels` (TV provider channel ids) | AppUpgradeHandler.kt:73-110; UpdateChecker.kt:79-96; AppPreference.kt:803-812; TvProviderWorker.kt:258 | Only `app.version` (for migrations) is useful; rest android-only |
| Server user DisplayPreferences (`customPrefs` map, id `default`, client `Wholphin`) | `home_settings` (home rows JSON, v1) and `removeNextUp` (JSON `{value:{seriesUuid:LocalDateTime}}`) | W/services/HomeSettingsService.kt:599, W/services/LatestNextUpService.kt:267; DisplayPreferencesService.kt:56-59 (`DEFAULT_CLIENT`) | Same endpoint (server-side, shared across devices) via `getDisplayPreferencesApi` |
| Files in `filesDir` | `home_settings/home_settings_{userId32}.json` (local home layout), `mpv.conf`, `subfont.ttf` | HomeSettingsService.kt:62-98 | IndexedDB `homeSettings` store keyed by userId; others android-only |
| Cache dir | `coil3_image_cache` (size pref), suggestions cache: file `cacheDir/suggestions/{key}.json` with key `{userId32}_{libraryId32}_{itemKind.serialName}` (dash-less hex, underscores, e.g. `..._Movie`), JSON `{ids:[uuid]}` (+ in-memory Kache of max size 8) | CoilConfig.kt, SuggestionsCache.kt:41-110 (cacheKey at 48-52) | Browser HTTP cache; suggestions in IndexedDB `suggestions` store, key `${userId32}_${parentId32}_${itemKind}` (itemKind = BaseItemKind serial name, e.g. "Movie", "Series") |

### 1.1 Web storage layout proposal

```
localStorage
  wholphin.deviceId            string  (random UUID v4, created once; see 5.9)
  wholphin.appPreferences      JSON    (AppPreferences, section 2)
  wholphin.mostRecent          JSON    {serverId, serverUrl, userId, accessToken} (any may be absent)
  wholphin.appVersion          string  (for migrations)
IndexedDB "wholphin"
  servers            keyPath id (uuid32 lowercase no dashes)   {id,name,url,version,lastUsed}
  users              keyPath [serverId,id] + auto rowId        (section 4.2)
  navDrawerPins      keyPath [userRowId,itemId]
  libraryDisplayInfo keyPath [userRowId,itemId]
  itemPlayback       keyPath [userRowId,itemId]
  itemTrackModification keyPath [userRowId,itemId,trackIndex]
  seriesTrackChoice  keyPath [userRowId,parentId,type]
  playbackEffects    keyPath [userRowId,itemId,type]
  rememberedTabs     keyPath [userRowId,itemId]
  seerrServers / seerrUsers (optional feature)
  keyValue           keyPath key
  homeSettings       keyPath userId
  suggestions        keyPath key
```

Security note: Android stores `accessToken` and the PIN **in clear text** in Room; Seerr `password` and `credential` too. A web port should treat tokens as sensitive (never log; consider same-origin only) and consider hashing the PIN (it is only a local UI lock; real security is the server token).

---------------------------------------------------------------------

## 2. App preferences (proto `AppPreferences`)

### 2.1 Message tree with fresh-install defaults

Types: enums in `WholphinDataStore.proto:6-49` (ShowNextUpWhen..AssPlaybackMode), `99-103` (DpadSeekMode), `113-143` (ThemeSongVolume, AppThemeColors, EdgeStyle, BackgroundStyle), `169-173` (BackdropStyle), `192-196` (DisplayToggle), `232-236` (HdrOverrideMode). JSON path = lowerCamelCase. `*` = serializer sets it; otherwise proto3 zero value, possibly overwritten by an upgrade migration (noted).

```
AppPreferences
  autoCheckForUpdates* true         (android-only)    updateUrl* "https://api.github.com/repos/damontecres/Wholphin/releases/latest" (android-only)
  sendCrashReports* true            (android-only)    debugLogging* false
  signInAutomatically* true         (web-adapted)
  currentServerId / currentUserId   (deprecated, migrated to SharedPreferences in 1.0.8)
  playbackPreferences
    skipForwardMs* 30000  skipBackMs* 10000  controllerTimeoutMs* 5000  seekBarSteps* 16  showDebugInfo* false
    autoPlayNext* true  autoPlayNextDelaySeconds* 15  skipBackOnResumeSeconds* 0 (stores ms)  maxBitrate* 104857600 (100*1048576)
    skipIntros* ASK_TO_SKIP  skipOutros* ASK_TO_SKIP  skipCommercials* ASK_TO_SKIP  skipPreviews* IGNORE  skipRecaps* IGNORE
    passOutProtectionMs* 7200000 (2 h)  globalContentScale FIT(0)  showNextUpWhen* END_OF_PLAYBACK  oneClickPause false
    playerBackend* EXO_PLAYER (android-only)  refreshRateSwitching* false  resolutionSwitching* false (both android-only)
    externalPlayer "" (android-only)  cinemaMode* true  dpadSeekMode* SEEKBAR_MINIMAL
    mpvOptions { enableHardwareDecoding* true, useGpuNext* false }  (android-only)
    overrides { ac3Supported* true, downmixStereo* false, directPlayPgs* true, mediaExtensionsEnabled* MES_FALLBACK, assPlaybackMode* ASS_LIBASS,
                decodeAv1 false (!), maxResolution 0, dovi5/7/8 + hdr10 + hdr10Plus override AUTO(0) }
  homePagePreferences { maxItemsPerRow* 25, enableRewatchingNextUp* false, maxDaysNextUp* -1, clickToPlay false, combineContinueNext (deprecated) }
  interfacePreferences
    playThemeSongs* MEDIUM  rememberSelectedTab false  appThemeColors* PURPLE  navDrawerSwitchOnFocus* true (not surfaced)  showClock* true
    backdropStyle* BACKDROP_DYNAMIC_COLOR  showLogos* true  enableMediaManagement false  displayToggles* [OFFICIAL_RATING,CRITIC_RATING,COMMUNITY_RATING]
    searchPreferences { combinedSearchResults* false, showVoiceSearchButton* true }
    subtitlesPreferences / hdrSubtitlesPreferences  (identical copies; defaults in 2.5)
    liveTvPreferences { showHeader* true, favoriteChannelsAtBeginning* true, sortByRecentlyWatched* false, colorCodePrograms* true }
    screensaverPreference { startDelay* 900000, duration* 30000, animate* true, maxAgeFilter* 16, showClock* true, itemTypes* ["Movie","Series"],
                            enabled false, dimEnabled false, dimPercent 75 (set by migration 1.0.6-0 on first run) }
    rememberedTabs (deprecated map)
  advancedPreferences { imageDiskCacheSizeBytes* 200*1048576 }   (android-only)
  photoPreferences { slideshowDuration* 5000, slideshowPlayVideos* false }
  musicPreferences { showBackdrop* true, showLyrics* true, showAlbumArt* true, showVisualizer false }
  experimentalPreferences { enabled* false, videoTunnelingEnabled* false, preferAc3Surround* false, disableAudioOffload* false,
                            preferDolbyVisionOverHdr10Plus* false, convertDolbyVisionProfile7* false }
```

Enum value lists (exact proto names; use them as stable stored values in the web JSON):
`ShowNextUpWhen {END_OF_PLAYBACK, DURING_CREDITS, NEXT_UP_NEVER}`, `SkipSegmentBehavior {IGNORE, AUTO_SKIP, ASK_TO_SKIP}`, `PrefContentScale {FIT, NONE, CROP, FILL, Fill_WIDTH, FILL_HEIGHT}`, `MediaExtensionStatus {MES_FALLBACK, MES_PREFERRED, MES_DISABLED}`, `PlayerBackend {EXO_PLAYER, MPV, PREFER_MPV, EXTERNAL_PLAYER}`, `AssPlaybackMode {ASS_LIBASS, ASS_EXO_PLAYER, ASS_TRANSCODE}`, `HdrOverrideMode {HDR_OVERRIDE_AUTO, HDR_OVERRIDE_ENABLE, HDR_OVERRIDE_DISABLE}`, `DpadSeekMode {SEEKBAR_MINIMAL, SEEKBAR_TRICKPLAY, SEEKBAR_NONE}`, `ThemeSongVolume {DISABLED, LOWEST, LOW, MEDIUM, HIGH, HIGHEST}`, `AppThemeColors {PURPLE, BLUE, GREEN, ORANGE, BOLD_BLUE, OLED_BLACK, RED, BROWN}`, `EdgeStyle {EDGE_NONE, EDGE_SOLID, EDGE_SHADOW}`, `BackgroundStyle {BG_NONE, BG_WRAP, BG_BOXED}`, `BackdropStyle {BACKDROP_DYNAMIC_COLOR, BACKDROP_IMAGE_ONLY, BACKDROP_NONE}`, `DisplayToggle {OFFICIAL_RATING, CRITIC_RATING, COMMUNITY_RATING}`.

### 2.2 Preference widget types (`AppPreference` sealed interface, W/preferences/AppPreference.kt:29-1552)

| Class | Meaning | Extra fields |
|---|---|---|
| `AppSwitchPreference` | boolean; summary = `summaryOn`/`summaryOff` (string res) else fixed `summary` | `validator(prefs,value)->Valid/Invalid(msg)` (Invalid -> toast, no write) |
| `AppSliderPreference` | `Long` slider (`min,max,interval`), summary from `summarizer` | getter/setter often convert units or map slider *index* <-> value |
| `AppChoicePreference<T>` | one-of dialog from a string-array; optional parallel `subtitles` array shown as supporting text | `indexToValue`, `valueToIndex` |
| `AppMultiChoicePreference<T>` | dialog of Switches | `allValues`, optional subtitles array |
| `AppStringPreference` | click -> text input dialog (single line, `ImeAction.Done`, no autocorrect); summary = string res or current value | |
| `AppClickablePreference` | arbitrary action; special-cased in `PreferencesContent` | `summary` |
| `AppDestinationPreference` | click -> navigate to a `Destination` | `summary` |

Settings are applied by `preferenceDataStore.updateData { pref.setter(prefs, newValue) }` (atomic read-modify-write; UI re-collects the data flow). Side effects embedded in setters: `Ac3Supported=false` and `DownMixStereo=true` do **NOT** actually clear `experimental.preferAc3Surround` - the setter's `prefs.updateExperimentalPreferences { preferAc3Surround = false }` result is discarded (AppPreferences is immutable; only the following `updatePlaybackOverrides` expression is returned) (AppPreference.kt:402-430, discarded at :408 and :423). Conflicts are only rejected when *enabling* `PreferAc3ForSurround`, via its validator (ExperimentalPreference.kt:83-95): Invalid("AC3 support is not enabled") if `!overrides.ac3Supported`, else Invalid("Always downmixing to stereo") if `overrides.downmixStereo`, else Valid. If the flag is already true and the user then disables AC3 or enables downmix it stays true. A web port can reproduce the intended behaviour (clear the flag) or the actual one - pick explicitly. Working side effects: `RefreshRateSwitching=false` => `resolutionSwitching=false`; `ResolutionSwitching=true` => `refreshRateSwitching=true`; `SendCrashReports` also writes SharedPreferences `acra.enable`; `DebugLogging` toggles the log tree live. Not every getter reads the proto: `SendCrashReports.getter` reads SharedPreferences `acra.enable` (default true); `DebugLogging.getter` reads `DebugLogTree.INSTANCE.enabled` (displayed value can diverge from `debugLogging` until start-up applies it); `ExternalPlayerApp` is a choice over installed player apps whose stored value is the app identifier string ("" = System default) (AppPreference.kt:798-816,950-959,1008-1019; PreferencesContent.kt:567-600).

### 2.3 Complete preference table

Full detail (title keys, English strings, option lists, screens, order, conditions) is in `preferences.json`; the table below is the human index. `D` = fresh-install default. Slider "index" means the slider moves over a list and the stored value is `list[index]`.

**Settings (BASIC) screen** — order top to bottom (after optional banner rows, see 3.2):

| Group (string) | # | Pref (Kotlin id) | Title (en) | Type / range | D | Class |
|---|---|---|---|---|---|---|
| Interface (`ui_interface`) | 0 | SignInAuto | Sign in automatically | switch | true | web-adapted |
| | 1 | RememberSelectedTab | Remember selected tabs | switch | false | web |
| | 2 | PlayThemeMusic | Play theme music | choice Disabled/Lowest/Low/Medium/High/Full | MEDIUM | web |
| | 3 | SubtitleStyle | Subtitle style | -> subtitle editor | | web-adapted |
| | 4 | ThemeColors | Application Theme | choice Purple/Blue/Green/Orange/Bold Blue/Black/Red/Brown | PURPLE | web |
| | 5 | ScreensaverSettings | Screensaver settings | -> SCREENSAVER | | web-adapted |
| Playback (`playback`) | 0 | SkipForward | Skip forward | slider 5..300 step 5 (s), stored ms | 30 | web |
| | 1 | SkipBack | Skip back | slider 5..300 step 5 (s), stored ms | 10 | web |
| | 2 | SkipBackOnResume | Skip back when resuming playback | slider 0..10 step 1 (s); 0 shows "Disabled" else "{n}s" | 0 | web |
| Next Up (`next_up`) | 0 | ShowNextUpTiming | Show next up | choice: At the end of playback / During end credits/outro / Never | END_OF_PLAYBACK | web |
| | 1 | AutoPlayNextUp | Auto play next up | switch | true | web |
| | 2 | AutoPlayNextDelay | Delay before playing next up | slider 0..60 step 5 s; 0 = "Immediate" | 15 | web |
| | 3 | PassOutProtection | Passout Protection | slider 0..3 h; 0 = Disabled | 2 | web |
| User Profile Settings (`profile_specific_settings`) | 0 | ProtectProfilePreference | Profile protection | choice None / Require PIN for profile / Require login for profile | None | web |
| | 1 | CustomizeHome | Customize home page (sub: "Choose rows and images on the home page") | -> HomeSettings | | web |
| | 2 | UserPinnedNavDrawerItems | Customize Navigation Drawer Items (sub: "Choose the default items to show, others will be hidden") | dialog | | web |
| | 3 | UserInterfaceLanguage | User interface language (summary = native display name of current locale) | locale dialog | system | web-adapted |
| | 4 | UserProfileSettings | More user profile settings (sub: "Override your user profile settings from the server") | -> USER_PROFILE | | web |
| About (`about`) | 0 | InstalledVersion | Installed version (summary = version) | click=release notes dialog, long-click=Debug page | | web-adapted |
| | 1 | Update | Check for updates / Install update / No update available | | | android-only (only if UPDATING_ENABLED) |
| More (`more`) | 0 | SeerrIntegration | Seerr integration (summary Add Server / Enabled / Server error) | dialog | | web-adapted (only if `BuildConfig.DISCOVER_ENABLED`: true for flavors default/appstore, false for firetv - build.gradle.kts:146-166, AppPreference.kt:1228; for the web port the row is always shown) |
| | 1 | AdvancedSettings | Advanced Settings | -> ADVANCED | | web |

**Advanced Settings (ADVANCED)**:

| Group | # | Pref | Title (en) | Type / range | D | Class |
|---|---|---|---|---|---|---|
| Interface | 0 | ShowClock | Show Clock | switch | true | web |
| | 1 | BackdropStylePref | Backdrop style | Image with dynamic color / Image only / None | DYNAMIC_COLOR | web |
| | 2 | ShowLogos | Prefer showing logos for titles | switch | true | web |
| | 3 | ManageMedia | Show media management options | switch | false | web |
| | 4 | DisplayTogglesPref | Ratings display (sub "Customize which to display") | multi: Parental Rating / Critic Rating (sub "Tomatoes") / Community Rating (sub "Stars") | all three | web |
| | 5 | SlideshowDuration | Slideshow duration | slider 1000..30000 step 250 ms, summary "%.2f seconds" | 5000 | web |
| | 6 | SlideshowPlayVideos | Play videos during slideshow | switch | false | web |
| | (x) | NavDrawerSwitchOnFocus | Switch nav drawer pages on focus | commented out in list | true | android-only |
| Playback | 0 | OneClickPause | Pause with one click (on: "Press D-Pad center to pause/play") | switch | false | web-adapted |
| | 1 | ControllerTimeout | Hide playback controls | slider 500..15000 step 100 ms, "%.2f seconds" | 5000 | web |
| | 2 | CinemaMode | Cinema mode | switch | true | web |
| | 3 | GlobalContentScale | Default content scale | Fit/None/Crop/Fill/Fill width/Fill height | FIT | web-adapted |
| | 4 | SkipSegments | Skip behavior (sub "For intros, credits, etc") | -> SKIP_SEGMENTS | | web |
| | 5 | DpadSeekModePref | D-Pad seek bar mode | Minimal / Trickplay / None (each with a summary line) | MINIMAL | web-adapted |
| | 6 | MaxResolutionPref | Max resolution before transcoding | No limit/8K/4K/1080/720/576/480/360; stored `overrides.maxResolution` ints: 0 (no limit), 4320, 2160, 1080, 720, 576, 480, 360; unknown values fall back to NO_LIMIT (MaxResolution.kt:3-19, AppPreference.kt:389-400) | NO_LIMIT | web |
| | 7 | MaxBitrate | Max bitrate | slider over index list (500 Kbit, 750 Kbit, 1,2,3,5,8,10,15,20, 30..100 step 10, 120..200 step 20 Mbit; 1 Mbit = 1048576; summary `formatMaxBitrate` = "<n> kbps" if below 1 MiB (500, 750), else "<n> Mbps" with integer division by 1048576, Formatting.kt:212-217) | 100 Mbit | web |
| | 8 | RefreshRateSwitching | Refresh rate switching | switch | false | android-only |
| | 9 | ResolutionSwitching | Resolution switching | switch | false | android-only |
| | 10 | PlaybackDebugInfo | Show playback debug info (Show/Hide) | switch | false | web |
| Playback Backend (`player_backend`) | 0 | PlayerBackendPref | Playback Backend | ExoPlayer / MPV / Prefer MPV (sub "Use ExoPlayer for HDR playback") / External Player | EXO_PLAYER | android-only |
| | cond | EXO_PLAYER: FfmpegPreference, DownMixStereo, Ac3Supported, AssSubtitleMode, DirectPlayPgs, DecodeAv1, HdrFormatSettings (inline); MPV: MpvHardwareDecoding, MpvGpuNext, MpvConfFile; PREFER_MPV: ExoPlayerSettings + MpvSettings links; EXTERNAL_PLAYER: ExternalPlayerApp picker | | | mixed (see JSON) |
| Updates (`updates`) | 0-1 | AutoCheckForUpdates, UpdateUrl | | | | android-only |
| More | 0 | QuickConnect | Quick Connect (sub "Authorize another device to log in to your account") | click -> dialog (3.7) | | web |
| | 1 | SendAppLogs | Send app logs to current server (sub "Useful for debugging") | click | | web-adapted |
| | 2 | SendCrashReports | Send Crash Reports (sub "Will try to send to last connected server") | switch | true | android-only |
| | 3 | DebugLogging | Verbose logging | switch | false | web |
| | 4 | ImageDiskCacheSize | Image disk cache size (MB) | slider 25..1000 step 25 | 200 | android-only |
| | 5 | ClearImageCache | Clear image cache (summary "Disk: {n}mb, Memory: {used}mb/{max}mb", MB = bytes/1048576; click clears Coil memory + disk caches, PreferencesContent.kt:372-398) | click | | web-adapted |
| | 6 | ExperimentalEnable | Experimental settings | switch + confirm dialog on enable | false | web |
| | 7 | OssLicenseInfo | License information | -> License page | | web-adapted |
| | cond | ExperimentalSettings link (only if experimental enabled) | | | | web |

**EXO_PLAYER**: FfmpegPreference (android-only), DownMixStereo, Ac3Supported, AssSubtitleMode, DirectPlayPgs, DecodeAv1, HdrFormatSettings (all web-adapted: they feed the device profile). **HDR_FORMATS**: Hdr10Override ("HDR10"), Hdr10PlusOverride ("HDR10+"), DoviProfile5/7/8Override ("Dolby Vision Profile 5/7/8"), each Automatic / Force enable / Force disable. **MPV**: all android-only. **SKIP_SEGMENTS** (group "Skip"): SkipIntros, SkipOutros, SkipCommercials (default Ask to skip), SkipPreviews, SkipRecaps (default Ignore); each Ignore / Skip automatically / Ask to skip. **EXPERIMENTAL** (group "Experimental settings"): VideoTunneling (android-only), PreferDolbyVisionOverHdr10Plus (android-only), ConvertDolbyVisionProfile7 (android-only), PreferAc3ForSurround (web-adapted; validator rules in JSON), DisableAudioOffload (android-only).

**SCREENSAVER** (title "Screensaver settings"): group "Screensaver": Enabled "Use in-app screensaver" (Yes/No, default No), StartDelay "Start after", Duration "Duration", ShowClock "Show Clock", Animate "Animate", MaxAge "Max age rating", ItemTypes "Include types" (Movies / TV Shows / Photos), Start "Start screensaver" (click). Group "Dim screen": DimToggle "Dim screen after delay", DimPercentage "Dim percentage". Details in section 6. Value formatting (ScreensaverPreference.kt:17-19,48-55,99-100,135-156,187-208): DimPercentage slider 0..95 step 5, default 75, summary "{n}%"; MaxAge labels: index 0 "For all ages", last index (-1) "No max", otherwise "Up to age N"; StartDelay/Duration summaries use Kotlin `Duration.toString` (e.g. "15m", "30s"); Enabled/ShowClock/DimToggle summaries Yes/No, Animate Enabled/Disabled.

**Not on a Settings screen** (still `AppPreference` members or proto fields): HomePageItems (slider 5..50 step 1, default 25), RewatchNextUp, MaxDaysNextUp (slider index 0..7 over [7,14,30,60,90,180,365] days; index 7 = "No limit" = -1; a stored value outside the list reads back as index 7; summary uses plural `days`), HomeClickToPlay (choice "Show details on click" = false / "Play on click" = true, default false) (Home settings -> global section, order as listed; AppPreference.kt:142-232), SeekBarSteps (slider 4..64 step 1, default 16; unused), LiveTv* x4 (Live TV guide view-options dialog), Search* x2 (Search view-options dialog), Music* x4 (Now Playing view options).

### 2.4 Quirks / traps (fresh-install vs UI)

1. `decodeAv1`: UI default true (AppPreference.kt:521-531) but not set by serializer nor any migration -> fresh install stores **false**. Web port: choose true unless AV1 unsupported.
2. `screensaver.dimEnabled` UI default taken from `AppPreference.ShowClock.defaultValue` (true) (DimToggle definition ScreensaverPreference.kt:179-189, default at :182; `ScreensaverPreference.ShowClock` at :94 likewise takes its default from `AppPreference.ShowClock`) but stored default false; `dimPercent` serializer default 0, migration 1.0.6-0 sets 75.
3. `skipBackOnResumeSeconds` stores **milliseconds** (name misleading); `skipForwardMs/skipBackMs/controllerTimeoutMs/passOutProtectionMs/screensaver.startDelay/duration/slideshowDuration` are ms; `autoPlayNextDelaySeconds` is seconds.
4. `PlayThemeMusic` volume map (ThemeSongPlayer.kt:70-90): DISABLED/UNRECOGNIZED = no playback, LOWEST 0.05, LOW 0.10, MEDIUM 0.25, HIGH 0.50, HIGHEST `75f` (line 88; an obvious bug, intended ~0.75).
5. Proto enum member `Fill_WIDTH` has odd casing; keep verbatim if you serialise.
6. `MaxDaysNextUp` slider index 7 = "No limit" and is stored as -1; `MaxBitrate`/`Screensaver*Delay/Duration/MaxAge` also index-based. Provide helper to convert.
7. Colours in subtitle prefs: the **setters** write `argb & 0x00FFFFFF` (opacity is a separate percent field). But defaults written by `resetSubtitles()` (fresh install and the Reset button) are **unmasked** `Color.toArgb()`: fontColor -1 (0xFFFFFFFF), edgeColor -16777216 (0xFF000000), backgroundColor 0 (AppPreferencesSerializer.kt:275-289). Readers must mask before comparing or rendering (`combine` and `valueToIndex` do, SubtitleSettings.kt:72-79,331-334).
8. `ProfileProtection` UI is not in proto: it edits `users.pin` / `users.requireLogin`.
9. `ThemeColors`, `ShowClock` etc. are read through `LocalTheme`/flows - live-apply, no restart.
10. Remembered tabs: the proto flag only enables the feature; positions are in table `RememberedTab`.

### 2.5 Subtitle style defaults (`SubtitleSettings`, W/ui/preferences/subtitle/SubtitleSettings.kt:37-269; reset via `resetSubtitles()` AppPreferencesSerializer.kt:275-289)

| Field (proto) | Title (en) | Control | Range / options | Default |
|---|---|---|---|---|
| fontSize | Font size | slider | 8..70 step 2 (sp) | 24 |
| fontColor | Font color | choice | White, Black, Light gray, Dark gray, Red, Yellow, Green, Cyan, Blue, Magenta (#FFFFFF, #000000, #CCCCCC, #444444, #FF0000, #FFFF00, #00FF00, #00FFFF, #0000FF, #FF00FF) | White |
| fontBold / fontItalic | Bold font / Italicize font | switch | | false/false |
| fontOpacity | Font opacity | slider | 10..100 step 10 (%) | 100 |
| edgeStyle | Edge style | choice | None / Outline / Shadow | EDGE_SOLID (Outline) |
| edgeColor | Edge color | choice (same colours) | | Black |
| edgeThickness | Edge size | slider | 1..32 step 1; displays `n/2.0`; rendered as `n/2` dp | 4 |
| backgroundStyle | Background style | choice | None / Wrap / Boxed | BG_NONE |
| backgroundColor | Background color | choice | | Transparent -> masked 0 -> resolves to Black |
| backgroundOpacity | Background opacity | slider | 10..100 step 10 | 50 |
| margin | Margin | slider | 0..100 step 1 (%) of video height from bottom | 8 |
| imageSubtitleOpacity | Image subtitle opacity | slider | 10..100 step 5 | 100 |
| useSeparateHdr | Use different style for HDR | switch | android-only | false |

Compose named colours: Color.LightGray=0xFFCCCCCC, Color.DarkGray=0xFF444444 (Compose `Color.Red/Yellow/Green/Cyan/Blue/Magenta` = pure #FF0000/#FFFF00/#00FF00/#00FFFF/#0000FF/#FF00FF).

The `ExoPlayer SubtitleView` mapping (`toSubtitleStyle`, SubtitleSettings.kt:336-356; `combine` at 331-334): builds `CaptionStyleCompat(foreground, bgIfWRAP, bgIfBOXED, edgeType, edgeColor, typeface)` - foreground = fontColor+fontOpacity alpha; `BG_WRAP` -> the 2nd parameter = Media3 per-line `backgroundColor` (colour+backgroundOpacity, hugging each text line); `BG_BOXED` -> the 3rd parameter = `windowColor` (one box behind the whole cue block); `BG_NONE` -> both 0 (lines 341-342; the mpv mapping at :417-426 agrees: WRAP = `opaque-box`, BOXED = `background-box`); edge type NONE/OUTLINE/DROP_SHADOW with edge colour using **fontOpacity** alpha; typeface bold/italic; size fixed `fontSize` SP; bottom padding fraction `margin/100`. Combine formula: `alpha = floor(opacity/100*255) << 24 | (rgb & 0xFFFFFF)`.
Web CSS equivalent: `color: rgba(font, fontOpacity)`, `font-size: fontSize px` (Android sp ~ css px at 1x; see Section 3.5 note), `text-shadow` / `-webkit-text-stroke` for outline (stroke width = edgeThickness/2 px), drop shadow `2px 2px 0 edge`, BG_WRAP -> `<span>` with `box-decoration-break: clone` background per line, BG_BOXED -> one wrapping `<div>` with background behind the whole cue, `bottom: margin%`.

---------------------------------------------------------------------

## 3. Settings UI

### 3.1 Screen hierarchy

`PreferenceScreenOption` enum: `BASIC, ADVANCED, EXO_PLAYER, MPV, SCREENSAVER, SKIP_SEGMENTS, EXPERIMENTAL, HDR_FORMATS` (W/ui/preferences/PreferenceUtils.kt:42-55). All are rendered by the same `PreferencesContent` (W/ui/preferences/PreferencesContent.kt:96-796) given `prefList`:

```
Settings (BASIC)  [Destination.Settings(BASIC)]
 |- Subtitle style  -> SubtitleStylePage(hdr=false)  [-> SubtitleStylePage(hdr=true) when useSeparateHdr]
 |- Screensaver settings -> SCREENSAVER
 |- Customize home page -> HomeSettingsPage  (own spec)
 |- Customize Navigation Drawer Items (dialog)
 |- User interface language (dialog)
 |- More user profile settings -> UserProfilePreferencesPage
 |- Installed version (dialog: release notes) / long-press -> Debug page
 |- Seerr integration (dialog)
 `- Advanced Settings -> ADVANCED
       |- Skip behavior -> SKIP_SEGMENTS
       |- Playback Backend (cond.) -> EXO_PLAYER -> HDR_FORMATS ;  MPV
       |- Quick Connect (dialog)
       |- License information -> License page (Destination.License)
       `- Experimental settings (cond.) -> EXPERIMENTAL
```

Navigation: `Destination.Settings(screen)` pushes a back-stack entry; Back returns. The page is full screen with the content panel on the right (3.3).

### 3.2 PreferencesContent behaviour

- Title (screen title, `headlineSmall`, centered, `padding(vertical=8dp)`).
- Top banners: (a) server-version warning on **every** PreferencesContent screen (Advanced, Skip, Experimental, ...), not only BASIC: a non-interactive ListItem (`onClick {}`) with error-coloured PreferenceTitle, shown whenever `serverSupportedMessage` is non-null (message builder `Resources.serverSupportedMessage`, Formatting.kt:333; text rules in 5.10). It uses the saved `server.version` from the DB (`JellyfinServer.serverVersion`), not a fresh probe; null/unparseable -> NOT_SUPPORTED (message ": Unknown"); the initial value before the flow emits is SUPPORTED (no banner) (PreferencesContent.kt:119-123,205-209,240-252; PreferencesViewModel serverSupported flow). (b) "Install update" row (**BASIC only**, `showUpdate` checks `preferenceScreenOption == BASIC`) (summary = new version) when `UpdateChecker.ACTIVE && autoCheckForUpdates && update available` (android-only).
- Then for each `PreferenceGroup`: header text (`titleMedium`, onSurface, `padding(top=8dp,bottom=4dp)`), then `group.preferences + conditionalPreferences.filter{condition(prefs)}` flattened. Conditions are re-evaluated on every prefs change (e.g. changing Playback Backend changes the list live).
- Special rows (not generic): InstalledVersion, Update, ClearImageCache, UserPinnedNavDrawerItems, SendAppLogs, SubtitleSettings.Reset, ProtectProfilePreference, SeerrIntegration, QuickConnect, ScreensaverPreference.Start, ExternalPlayerApp, UserInterfaceLanguage, ExperimentalPreference.Enable. Details: ClearImageCache summary/click as in 2.3; the Seerr row summary is Add Server (NotConfigured) / Enabled (Success) / the `voice_error_server` text (Error) and click opens a dialog in mode Add, Remove(current) or Error(server,user,exception); ExternalPlayerApp (choice with 40dp app icons, first entry "System default" id "") bypasses `validate`; ExperimentalPreference.Enable turns OFF immediately and only turning ON asks confirmation (ConfirmDialog Cancel/Confirm) (PreferencesContent.kt:389-416,497-540,571-610,630-668; AppPreference.kt:347).
- Validation: `pref.validate(prefs,newValue)`; Invalid -> `Toast(message, SHORT)` and no write.
- D-pad niceties (drop on web): focus restore, wrap-around scrolling (`lazyListWrapScrolling`), optional UI sounds (`movementSounds=false`).
- Start-up check: if `playerBackend == MPV` and `libmpv` fails to load, toast "MPV is not supported on this device" and reset to EXO_PLAYER (android-only).

### 3.3 Layout (TV 960x540dp-ish viewport; all sizes dp)

```
+------------------------------- full screen, bg = colorScheme.background -----------------------------+
|                                                           +------------- panel: 40% width, 100% h -+ |
|   (empty / app backdrop shows through, 60%)               | bg = surfaceColorAtElevation(1dp)       | |
|                                                           |        Settings   (headlineSmall, ctr) | |
|                                                           |  padding 16dp all around the list       | |
|                                                           |  Interface                (titleMedium) | |
|                                                           |  [ListItem title / summary      (o) ]   | |
|                                                           |  ...                                    | |
|                                                           +-----------------------------------------+ |
+---------------------------------------------------------------------------------------------------------+
```
Enter animation: `fadeIn + slideInHorizontally{ width/2 }` on first composition; exit reverse.
Subtitle page: `Row` -> preview box `weight(1f)` (≈75%) + settings column `fillMaxWidth(.25f)` (25%). User-profile page same 40% panel as Settings.

### 3.4 List item types (exact visuals)

| Type | Composable | Layout |
|---|---|---|
| Click / destination / choice / string | `ClickPreference` = TV-Material `ListItem(selected=false)` headline = title (`titleSmall`), supporting = summary (`bodySmall`) | one/two lines; choice & string summaries show the current value |
| Switch | `SwitchPreference` = `ListItem` + `trailingContent = Switch(checked)`; summary = On/Off text; click anywhere toggles | |
| Slider | `SliderPreference` | `Column`, min height 72dp, `padding(h=16dp, v=12dp)`, bg = `inverseSurface` with `RoundedCornerShape(8dp)` only while focused; title (`padding(bottom=8dp)`), then `Row(spacedBy 16dp)`: `SliderBar` (weight 1) + summary text right-aligned (`summaryBelow=false`) |
| `SliderBar` | Canvas | track height 6dp (animates to 12dp when focused), horizontal padding 4dp, round caps; inactive/active colours per theme (`sliderActiveColor/InactiveColor`, W/ui/components/SliderBar.kt); thumb = white circle radius `trackHeight+2`; keys: Left/Right = -/+ `interval` clamped (no wrap in prefs), Center re-commits. **Every step commits immediately** (`onChange` each press) |
| Choice dialog | `ChoicePreference` -> `DialogPopup(title, items)` | each item: leading selected-indicator (`SelectedLeadingContent`), headline = option label, supporting = subtitle (if non-blank); click -> `onValueChange(index)` and close; `DialogPopup` default elevation **1dp**, `RoundedCornerShape(28dp)`, padding 24dp, `waitToLoad=false`, `dismissOnClick=false` (the single-choice item handler closes itself; multi-choice stays open) (Dialogs.kt:206-266; ChoicePreference.kt; ComposablePreference.kt:236-262) |
| Multi-choice dialog | `MultiChoicePreference` | like choice but trailing `Switch` per option; dialog stays open; each toggle immediately commits the **full list** |
| String input dialog | `StringInputDialog(elevation=3dp)` | fixed width 512dp, padding 16dp around a 16dp-padded column, `RoundedCornerShape(8dp)`, title `titleLarge`, single-line text box (multi-line max 10 for mpv.conf), Cancel/Save with SpaceAround; with `confirmDiscard` (mpv.conf) dismissing changed text shows the `discard_change` ConfirmDialog (StringInputDialog.kt) |
| Confirm dialog | `ConfirmDialog(title, body, onCancel, onConfirm)` | used for experimental enable |

Dialog shapes: `DialogPopup` = background `surfaceColorAtElevation(elevation)` (default 1dp), `RoundedCornerShape(28dp)`, 24dp padding (server delete dialog elevation 5dp, user dialog default 1dp, `waitToLoad=true`); `BasicDialog` = `RoundedCornerShape(8dp)` (Dialogs.kt:417-440), used with 3dp by StringInput, QuickConnect, nav-drawer pins and the preferred-language dialogs. `SliderBar` reacts only to D-pad key-down events (Left/Right/Center) with no pointer/touch handling (SliderBar.kt:46-75), so a web port must add mouse/keyboard (arrows, drag) itself.

Translatable strings with args used in summaries: `decimal_seconds`="%.2f seconds", plurals `seconds` (`%d second(s)`), `hours`, `days`, `up_to_age`="Up to age %s". Bitrate: `formatMaxBitrate` (W/ui/Formatting.kt).

### 3.5 Subtitle style editor (W/ui/preferences/subtitle/*)

Page = `SubtitleStylePage(isPageForHdrSettings)`:
- Left (weight 1): `Box(contentAlignment=BottomCenter)` with full-bleed image `R.mipmap.eclipse` (`ContentScale.FillBounds`) as sample video frame.
- Over it, normally: `Column(SpaceBetween, padding 16dp)` of **three** `SubtitleView`s, each `weight(1f).fillMaxWidth()` with `padding(bottom = 48dp / 24dp / 0dp)`, cues: `"Subtitles will look like this"`, `"This is another example"`, `"Longer multi line subtitles will\nlook like this"` (hard-coded English, not localised). Font size = `fontSize` SP; style from prefs; edge size via `Media3SubtitleOverride(edgeThickness/2 dp)`.
- When the focused row is **Margin**: single full-size SubtitleView with cue `"Subtitles margin below here"` and `bottomPaddingFraction = margin/100` (live preview of margin).
- When focused row is **Image subtitle opacity**: sample cue `"ExoPlayer only:\nImage based subtitles can be dimmed."` rendered with default style at `alpha = imageSubtitleOpacity/100`.
- Right (25% width): `SubtitlePreferencesContent` (same list machinery as PreferencesContent but over `SubtitlePreferences`): title "Subtitle style" or "HDR subtitle style"; groups `Font` (size, color, bold, italic, opacity), `Edge style` (style, color, size), `Background` (style, color, opacity), `More` (margin, image opacity, `Reset` click). On the SDR page when the display is HDR-capable a group `HDR` is appended with the "Use different style for HDR" switch (and, if on, the "HDR subtitle style" link). If `useSeparateHdr` the list scrolls the toggle into view. Reset writes `resetSubtitles()` defaults to the page's own style only.
- The HDR-style decision reads `useSeparateHdr` from the **SDR** `subtitlesPreferences` only (the HDR page does not append the HDR group). On the SDR page the "HDR" group appears only when `Display.isHdr` and API >= 26 (`shouldShowHdr`). The image-subtitle-opacity preview always renders with the reset (default) style. The HDR page forces the window colour mode to HDR (android-only) (SubtitleStylePage.kt:57-72,150-186; SubtitleSettings.kt:311-329; PlaybackPage.kt:505-516).
- Persist: `interfacePreferences.subtitlesPreferences` (SDR page) or `.hdrSubtitlesPreferences` (HDR page). Playback chooses HDR style only if `useSeparateHdr` and the video is HDR (PlaybackPage.kt:509-511).
- Web port: reproduce the page with a `<video poster>`-less static sample image + DOM cues; HDR page = android-only (web-adapted alternative: single style).

### 3.6 User profile preferences page (W/ui/preferences/user/*)

Title `profile_specific_settings` = "User Profile Settings". Single group "User profile settings from server" (`profile_specific_settings_from_server`):
1. **Preferred audio language** (click): summary = selected option text. Dialog `FilterableLanguagePreference`: title, a search text field (filter debounce 500 ms; matches `name.lowercase().contains(q) || iso.contains(q)`; results sorted so names starting with `q` come first; "built-in" rows hidden while searching), list: row 1 headline `use_user_profile` = "Use your profile setting" with the server language display name as separate supporting text (hidden if blank; falls back to the raw code if not in the cultures list; value `""`) - the joined `"Use your profile setting - <name>"` string is only the page's summary line; the dialog is a `BasicDialog` at 3dp. If `Localization/Cultures` has not loaded, or the DB user id differs from the UserDto id, the options list is empty and the selection is ServerProfile; a stored ISO code not in the list reverts to ServerProfile for summary/selection (FilterableLanguagePreference.kt, PreferredLanguage.kt:14-26, UserPreferencesViewModel.kt:62-118), `Any language` (value `"_any-language"`), divider, then every culture from `GET Localization/Cultures` that has a ThreeLetterISOLanguageName (value = 3-letter code, label = DisplayName), selected row marked.
2. **Preferred subtitle language** (same).
3. **Subtitle mode** (choice): `Use your profile setting` (summary `"<label> - <server mode>"`; supporting text = the server's mode), `Default`, `Smart`, `Only Forced`, `Always`, `None`.
Server profile values come from `UserDto.configuration.{audioLanguagePreference, subtitleLanguagePreference, subtitleMode}` (kept fresh by websocket `UserUpdated`). Persisted in the `users` row (embedded `JellyfinUserPreferences`).

### 3.7 Other settings-related dialogs

- **Quick Connect (authorize another device)**: `QuickConnectDialog` width 360dp, padding 16dp, `spacedBy(8dp)`, title `quick_connect_code` "Enter Quick Connect code", numeric text box (IME Done submits), inline error `quick_connect_code_error` "Code must be 6 digits" when `trim()` is not 6 digits (only `trim().length == 6 && all digits` is accepted), `Submit` button (or IME Done). The Advanced row does nothing unless `currentUser != null`; `resetQuickConnectStatus()` runs on open and dismiss; on failure the dialog stays open with a short toast and only Success closes it (PreferencesContent.kt:542-556,734-763; QuickConnectDialog.kt). Calls `authorizeQuickConnect(code, userId)` (07 doc). Success toast `quick_connect_success` "Device authorized successfully" and dialog closes; failure toast with message ("Authorization failed" if server returned false).
- **Profile protection / PIN**: see 5.6.
- **Navigation drawer pins dialog** (`NavDrawerPreference`): `BasicDialog(elevation 3dp)`, title `nav_drawer_pins`, `LazyColumn` of rows `[ListItem(title, trailing Switch) | Up caret button | Down caret button]` with min row height 40dp; Up disabled on first, Down on last. Items = all current drawer items (`Favorites` id `a_favorites`; `Discover` id `a_discover` only if Seerr active; each library `s_<uuid32>`), ordered by saved order (unknown = end), default pinned. Dismiss saves (`NavDrawerPinnedItem(userRowId,itemId,PINNED|UNPINNED,index)` for every row) then rebuilds the drawer: pinned -> main list, unpinned -> "More". (`Discover` is hidden unless a Seerr server is active.)
- **Locale dialog** (user interface language): standard `Dialog` with list; each item: headline = locale's own display name, supporting = English display name, check mark for current; click -> persist `users.uiLanguage = locale.toLanguageTag()` and reapply (section 7). There is no "follow system language" entry, so once chosen `uiLanguage` cannot be reset to null from the UI; the current-item marker compares `locale.toLanguageTag()` with the user's tag (or the system default tag when unset); order = generated locale config order. Because `UserSwitchListener`'s `distinctUntilChanged` includes `uiLanguage`, a language change re-runs the whole switch routine: clears the Seerr connection, resets home settings to EMPTY, rechecks the plugin (`/wholphin/public`), reloads home settings and retries Seerr login (LocaleChoiceDialog.kt:38-56,128-172; UserSwitchListener.kt:37-60).
- **Installed version dialog**: `ScrollableDialog` showing release notes for the installed version fetched from GitHub (`api.github.com/repos/damontecres/Wholphin/releases/tags/v{major}.{minor}.{patch}`); loading / error states.
- **Debug page** (`Destination.Debug`, reached by long-press on Installed version, or "Show debug info" button after >2 counted login errors in the login dialog, see 5.6): full-screen scrollable text page (`padding 16dp`; Up/Down scroll 100px, PageUp/PageDown and MediaFastForward/MediaSkipBackward 300px) with sections: App Information (version name/code, ClientInfo, build type/flavor/time, ffmpeg/AV1/libmpv flags, ABIs, installer info), Device Information (DeviceInfo, manufacturer, model, API level, live Audio Devices list, Display Modes grid ID/Width/Height/FPS/HDR/Alt FPS, Detected HDR Support table with 8 rows), AppPreferences, User Information (current server, current user, `UserDto.configuration`), Database (ItemPlayback rows for the current user) and Logcat (last 500 lines coloured by level). There is no separate codec-support section (DebugPage.kt). Web: replace with a diagnostics page (client info, device id, prefs JSON, server+user JSON with token redacted, `MediaSource` capabilities, console log buffer) - web-adapted.
- **License page** (`Destination.License`): `LicenseInfo` -> AboutLibraries `LibrariesContainer`. Web: generated list of npm licenses.
- **Experimental enable confirm**: `confirm_enable_experimental_title` "Enable experimental settings?" / body "Experimental settings may be unstable!\n\n These may removed or changed in any release."

### 3.8 Settings per-user vs per-device

Everything in `AppPreferences` is **per device** (one document), *not* per user, **except** where noted: ProfileProtection (users row), UI language (users row), preferred audio/subtitle language & subtitle mode (users row), nav drawer pins / remembered tabs / library view-options / track choices (per-user tables), home layout (per-user, server DisplayPreferences or local file), `removeNextUp` (per-user on server).

---------------------------------------------------------------------

## 4. Local database (Room `AppDatabase`, version 41) — entities, DAOs, usage

UUIDs are stored as 32-char lowercase hex **without dashes** (`Converters`, AppDatabase.kt:84-89). Enums as `serialName` strings; `ZonedDateTime` as ISO_ZONED_DATE_TIME. `userId` columns elsewhere = `users.rowId` (an auto-increment Int), **not** the Jellyfin user UUID.

### 4.1 `servers` — `JellyfinServer` (W/data/model/JellyfinServer.kt:21-33), DAO `JellyfinServerDao`
`id: UUID (PK)`, `name: String?`, `url: String`, `version: String?`, `lastUsed: ZonedDateTime?`. `lastUsed` exists in the schema but is **never written** (always null; nothing sorts by it; a port can omit it). The row is written when a server is added/selected (`addAndChangeServer`) and refreshed (name+version from `GET System/Info/Public`) on every `changeUser`. Deleting a server cascades to its users (FK). Listing sorted by `name` then `url` in the picker.

### 4.2 `users` — `JellyfinUser` (JellyfinServer.kt:41-100)
| Column | Type | Meaning |
|---|---|---|
| rowId | Int PK autogenerate | local FK target for all per-user tables |
| id | UUID (indexed; unique with serverId) | Jellyfin user id |
| name | String? | |
| serverId | UUID FK->servers CASCADE | |
| accessToken | String? | null for "public user" placeholders and after expiry |
| pin | String? | local PIN, plain text; sequence of chars from `0-9` and `U R D L` |
| requireLogin | Boolean (default false) | force full login to unlock |
| lastUsed | ZonedDateTime? | set to now() only when the user authenticates by username/password or Quick Connect (`ServerRepository.changeUser(serverUrl, authResult, existingUser)`, ServerRepository.kt:245,254); **not** updated on token-based restore/switch; a port can omit it |
| uiLanguage | String? | BCP-47 tag override (section 7) |
| preferredAudioLanguage, preferredSubtitleLanguage | String default `""` | `""`=use server profile, `"_any-language"`=any, else 3-letter ISO |
| subtitleMode | enum default `USE_USER_PROFILE` | `USE_USER_PROFILE, DEFAULT, SMART, ONLY_FORCED, ALWAYS, NONE` |
| c_homeSettingsSource | enum default `UNSET` | `UNSET, LOCAL, SERVER_PROFILE, PLUGIN, DEFAULT, WEB_CONFIG` (where the home layout comes from) |
Derived: `hasPin = !pin.isNullOrBlank()`, `isProtected = hasPin || requireLogin`. `addOrUpdateUser` upserts on `(serverId,id)` keeping `rowId`.

### 4.3 Other tables
| Table (entity) | Key | Fields | Used for |
|---|---|---|---|
| `NavDrawerPinnedItem` | (userId,itemId) | `type: PINNED|UNPINNED`, `order: Int default -1` | Nav drawer customisation; itemId = `a_favorites`/`a_discover`/`s_<uuid>` |
| `LibraryDisplayInfo` | (userId,itemId) | `sort: ItemSortBy`, `direction: SortOrder`, `filter: GetItemsFilter(JSON)`, `viewOptions: ViewOptions?(JSON)` | Remember sort/filter/view options per library; restored on open |
| `ItemPlayback` | autogen rowId; unique (userId,itemId) | `sourceId: UUID?`, `audioIndex`, `subtitleIndex` (`UNSPECIFIED=-1`, `DISABLED=-2`, `ONLY_FORCED=-3`) | Per-item chosen media version + tracks (ItemPlaybackRepository) |
| `ItemTrackModification` | (userId,itemId,trackIndex) | `delayMs: Long` | Subtitle delay per track |
| `SeriesTrackChoice` | (userId,parentId,type) | `parentType SERIES|SEASON|DEPRECATED|UNKNOWN`, `itemId?`, `language?`, `activation ACTIVATED|DISABLED|ONLY_FORCED`, `trackFlags` bitmask (DEFAULT=1, FORCED=2, SDH=4, EXTERNAL=8, SIGNS=16), `codec?`, `relativeTrackIndex?`, `title?`, `audioChannels?`; `type AUDIO|SUBTITLE` | Reuse the audio/subtitle choice for the rest of a season/series; DAO `get(userId, seasonId, seriesId, type)` returns season row first then series row |
| `PlaybackLanguageChoice` (deprecated) | (userId,seriesId) | `itemId?, audioLanguage?, subtitleLanguage?, subtitlesDisabled?` | Legacy, migrated into SeriesTrackChoice; skip in web |
| `playback_effects` | (jellyfinUserRowId,itemId,type: BaseItemKind) | embedded `VideoFilter{rotation, brightness 0-200, contrast, saturation, hue 0-360, red, green, blue (0-200, default 100), blur 0-250}` | Photo/video colour adjustments in slideshow |
| `RememberedTab` | (userId,itemId) | `index: Int` | "Remember selected tabs"; itemId = library id string |
| `seerr_servers` | autogen id; unique url | `url, name?, version?` | Optional Seerr/Discover |
| `seerr_users` | (jellyfinUserRowId, serverId) | `authMethod LOCAL|JELLYFIN|API_KEY`, `username?`, `password?`, `credential?` (API key) | Seerr login per Jellyfin user (plain text) |
No search-history entity exists in this version (search state is in-memory; only `excludedSearchableTypes` / `searchIncludeDiscover` in KeyValue). No downloads / offline tables.

Room migrations (`Migrations.Migrate2to3` + auto-migrations 3..41) are irrelevant to the web (fresh schema).

`KeyValueService` (W/services/KeyValueService.kt:42-85): `get/save(userId?, key, value)` stored under `"${userId}_${key}"` with the dashed `UUID.toString()` form (unlike dash-less Room ids; pick one form consistently in a web port, and use the dashed form for byte-compatible exports); the non-user variants `get(key)`/`save(key,...)` exist but have no current caller; JSON (`ignoreUnknownKeys`, `isLenient`, `encodeDefaults=false`). `CollectionViewOptions` shape in W/ui/detail/collection/*, `ViewOptions` (W/ui/components/ViewOptionsDialog.kt:146-157): `{columns=6, spacing=16, contentScale=FIT, aspectRatio=TALL, showDetails=false, showBackdrop=false, imageType=PRIMARY|THUMB, showTitles=true, type=GRID|LIST|DENSE_LIST, extras}`.

### 4.4 Home page settings JSON (HomeRowConfig) — persisted blob
`HomePageSettings { version: 1, rows: HomeRowConfig[] }` (W/data/model/HomeRowConfig.kt). Polymorphic discriminator `type` = `SerialName`: `ContinueWatching, NextUp, ContinueWatchingCombined, RecentlyAdded{parentId}, RecentlyReleased{parentId}, Genres{parentId}, Studios{parentId}, Favorite{kind}, Recordings, TvPrograms, TvChannels, Suggestions{parentId}, ByParent{parentId,recursive,sort}, GetItems{name,filter:HomeGetItemsFilter}, CustomEndpoint{endpoint,title,headers[],query[]}`; each has `viewOptions: HomeRowViewOptions{heightDp=172, spacing=16, contentScale=FILL, aspectRatio=TALL, imageType=PRIMARY, showTitles=false, useSeries=true, episodeContentScale=FILL, episodeAspectRatio=TALL, episodeImageType=PRIMARY}` (genre default: height 128 + WIDE; live-tv default: height 96 + WIDE + FIT). Parser: lenient, ignore unknown keys, trailing commas, rows that fail to decode are **skipped**, `decode()` throws `UnsupportedHomeSettingsVersionException` when `version` is absent/non-integer **or** > 1 (`version` has no default; a persisted `HomePageSettings` needs both `rows` and `version`); missing `rows` -> `[]` (HomeSettingsService.kt:144-147). `HomeGetItemsFilter` fields: sortBy, sortOrder, ids, minCommunityRating, minCriticRating, recursive, searchTerm, parentId, includeItemTypes, isFavorite, isPlayed, officialRatings, tags, years, personIds, minOfficialRating, hasOfficialRating, studioIds, genreIds, minPremiereDate, maxPremiereDate; `asGetItemsRequest()` does **not** forward minPremiereDate/maxPremiereDate (persisted but ignored). `ByParent.sort` is `SortAndDirection?`, `CustomEndpoint.headers/query` are nullable lists of `{key,value}`, `Favorite.kind` is a BaseItemKind serial name (HomeRowConfig.kt:164-205,242-300). The resolution order below applies **only** when `users.c_homeSettingsSource == UNSET`; any other stored source loads only that source (LOCAL, SERVER_PROFILE, PLUGIN, DEFAULT, WEB_CONFIG) and on failure/null falls back to the generated default **without persisting it**; the first source returning non-null is persisted via `updateCurrent` (HomeSettingsService.kt:157-190). Order when UNSET: local file -> server DisplayPreferences `customPrefs["home_settings"]` -> plugin `GET {server}/wholphin/homesettings` (only if the companion server plugin is installed) -> generated default (built from the nav-drawer-filtered libraries respecting pins/tvAccess: ContinueWatchingCombined first, then one RecentlyAdded row per library; view options by collection type: MUSIC -> height 128 + SQUARE; PHOTOS/HOMEVIDEOS/MUSICVIDEOS/TRAILERS -> height 128 + WIDE; LIVETV -> TvPrograms with liveTvDefault; others default; HomeSettingsService.kt:261-324,326-420). `WEB_CONFIG` source imports the jellyfin-web home layout from DisplayPreferences id `usersettings`, client `emby`, keys `homesection0..9`; mapping (HomeSettingsService.kt:655-700): `activerecordings` -> Recordings, `resume` -> ContinueWatching, `nextup` -> NextUp, `livetv` -> TvPrograms (only if the user has live TV access), `latestmedia` -> one RecentlyAdded row per library not in `configuration.latestItemsExcludes`; every other section type (resumeaudio, resumebook, smalllibrarytitles, librarybuttons, none) is skipped. (Home settings UI is specified elsewhere; this is the persistence contract.)

---------------------------------------------------------------------

## 5. Server & user setup

Navigation graph is `SetupDestination` (W/services/SetupNavigationManager.kt): `Loading -> ServerList | UserList(server) | AppContent(currentUser)`; handled in `MainContent.kt:88-130`.

### 5.1 Start-up decision (W/MainActivity.kt:559-584 `handleAppStart`)
```
signIn = prefs.signInAutomatically
if signIn && current session in memory && !user.isProtected -> AppContent (hot reload)
else if signIn -> restoreLastSession()    // see below
else           -> getMostRecentServer()  // ServerOnly or None
destination = result.destination:  None -> ServerList ; ServerOnly(server) -> UserList(server) ; Success -> AppContent
```
`restoreLastSession`: read SharedPrefs most-recent {serverId, serverUrl, userId, accessToken}. None -> ServerList. Server only -> must exist in DB else None -> `UserList`. Server+user -> `tryChangeUser(serverId,userId)`: finds user row; **if user is protected (pin or requireLogin) -> returns null** -> falls back to `ServerOnly` (user list) so the PIN/login prompt appears; else `changeUser` (below). `getMostRecentServerInternal` -> `ServerOnly` runs only when `tryChangeUser` returns null (user row missing, or user protected). `restoreLastSession` has **no try/catch**: if `changeUser` throws (401 token rejected, network error, dead server) the exception propagates out of `handleAppStart` and MainActivity's catch navigates to `SetupDestination.ServerList` (not the user list) (ServerRepository.kt:133-165,193-214; MainActivity.kt:457-462). The `currentUser.user.isProtected` branch inside `restoreLastSession` is dead code, because `tryChangeUser` already returns null for protected users.
When `signInAutomatically` is **off**: `MainContent` (ON_STOP lifecycle) blanks the app content (`showContent=false`) so leaving and returning shows only a spinner box (forces re-entry via setup). FLAG_SECURE (no screenshots) is set when the current user has a PIN (MainActivity.kt:196-206) - android-only.
Deep-link/intents: `serverId` + `userId` params call `tryChangeUser` (IntentService.kt:100-150) - android-only.

### 5.2 `changeUser(server, user)` (W/data/ServerRepository.kt:94-130) — "become this user"
1. `apiClient.update(baseUrl = server.url, accessToken = user.accessToken)`.
2. `GET Users/Me` (`userApi.getCurrentUser`) -> throws on 401/403.
3. `GET System/Info/Public` (best effort) -> `server.copy(name=serverName, version)`.
4. Upsert server row and user row (id/name refreshed from `Users/Me`); `rowId` retained.
5. Save most-recent {server id/url, user id, token} to SharedPrefs.
6. Publish `current` and `currentUserDto = ServerUserConfig(UserDto)` (id,name,serverId,configuration,policy; `tvAccess = policy.enableLiveTvAccess`).
After a successful `trySwitchUser` the UI calls `navigationManager.reloadHome()` before navigating to AppContent; password login and Quick Connect login (`login()`/`initiateQuickConnect()`) navigate to AppContent **without** `reloadHome` (SwitchUserViewModel.kt:131-193). Then `UserSwitchListener` (W/services/UserSwitchListener.kt:55-130) reapplies the locale, checks the plugin (`GET /wholphin/public`), loads home settings, and attempts Seerr auto-login; `ServerEventListener` opens the websocket and posts capabilities.

### 5.3 Server picker (`SwitchServerContent`, W/ui/setup/SwitchServerContent.kt)

State: `servers` (DB, sorted by name then url) each with a connection status `Pending|Success(PublicSystemInfo)|Error(msg)`, `versionSupported`. On open: show all instantly, then **probe each server** with `GET {server.url}/System/Info/Public` using a fresh client with request/connect/socket timeout **6 s**. Version support: `SUPPORTED` if `serverVersion >= newMinimumServerVersion`; `NOT_SUPPORTED` if `< Jellyfin.minimumVersion` (the Kotlin SDK 1.9.4 constant is not in the repo; for the web port use `MINIMUM_VERSION` from `@jellyfin/sdk` = '10.10.0', node_modules/@jellyfin/sdk/lib/versions.js:6-9, which also exports `API_VERSION` = '12.3.0'; Kotlin is expected to match); `NOT_SUPPORTED_IN_FUTURE` if between that and `ServerVersion(12,0,0)` (WholphinApplication.kt:124-126 - note: effectively every 10.x/11.x server shows the "will not be supported soon" notice; probably should be adjusted - flag for product decision); `UNKNOWN` if probe failed. Classification of a missing/unparseable version differs per screen: server picker Success with null version -> NOT_SUPPORTED; user picker `checkServerVersion` null -> UNKNOWN; settings banner null -> NOT_SUPPORTED (SwitchServerViewModel.kt:96-99; SwitchUserViewModel.kt:306-308). UNKNOWN and NOT_SUPPORTED render the same message (`server_version_not_supported`, ": Unknown", required = minimum version). A probe failure in the server picker shows the raw error text instead (`serverErrorMessage`).
Layout: Column centred, `spacedBy(24dp)`, `padding(16dp)`; header Column(`spacedBy 8dp`): title `select_server` "Select Server" (`displaySmall`), then an invisible placeholder line (`titleLarge`, transparent) so the layout matches the user screen; `LazyRow(spacedBy 24dp, contentPadding h=48dp v=16dp)` of **ServerIconCard**s + a final **AddServerCard**; a 56dp spacer; bottom area shows (animated slide up) a red error line (`bodyMedium`, max 3 lines, padding start/end 32dp bottom 32dp) for the focused server: version warning (`server_version_not_supported` / `_future` + `": <ver>"` + `\nRequired server version: <min>`) or the connection error text.
ServerIconCard: circle `size = 172dp * .75 = 129dp` (`Cards.serverUserCircle`), fill = `rememberIdColor(server.id)` alpha 0.5 (focused 0.7; 'current' 0.7/0.9), 3dp `onSurface` border when focused, scale 1.2 on focus. Content: first letter (uppercased) of `name ?: url-without-scheme` in `displayLarge` bold; if status=Error **or** version != SUPPORTED: warning icon (size 30% of card; gold `0xFFDAB440` for "in future", `errorContainer` otherwise) above a `titleLarge` bold letter; else if Success: `displayLarge` bold letter; the Pending/spinner (40% of card) branch is **unreachable** in practice: a Pending server always has `versionSupported = UNKNOWN`, so the warning branch (checked first) is taken while probing (and on the re-test after clicking an Error card) (ServerList.kt:171-220; SwitchServerViewModel.kt:94-107,301-306). A spinner while probing would be a deliberate improvement over Android. Label under card (`bodyLarge`, bold, centred, max 2 lines, width 129dp, `padding(h=4dp)`), 24dp gap.
`rememberIdColor(uuid)`: `h = uuid.hashCode()` (Java `UUID.hashCode()` = `(msb ^ lsb)` folded to int: `hilo = msb ^ lsb; (int)(hilo>>32) ^ (int)hilo`); `hue = (h % 360)`; `sat = 0.6 + ((h/360) % 40)/100`; `val = 0.4 + ((h/14400) % 30)/100`; HSV->RGB with the standard formula using those (negative `%` stays negative in Kotlin - clamp channels 0..1). Web may use any stable hash.
Interactions: click = if Success -> `switchServer` (re-probe, update name/version, `addAndChangeServer` which clears the current user & most-recent user, navigate to UserList); if Error -> re-test (show "success"/error toast; 500 ms artificial delay); Pending -> ignore. Click on Success runs `switchServer`: re-probe, on success copy name+version from the probe then `addAndChangeServer`, then UserList; on failure toast "Error connecting: <msg>". `removeServer` re-runs `init()` which re-probes all remaining servers. A timeout whose cause is a ConnectException shows the cause's message. Cards show `server.name` (if not blank) else URL under the circle; initial focus is the first server card; the Add Server card is always last (SwitchServerViewModel.kt:68-88,125-187,259-264; SwitchServerContent.kt:149-212,243-271). Long-press = dialog titled with the server name: **Switch servers** / **Delete** (red, `removeServer`: deletes server+users (cascade) and, if current, clears session and most-recent).

### 5.4 Add server (`AddServerDialog`)
Dialog width 40% of screen, `spacedBy(8dp)`, padding 16dp, elevation 10dp.
1. **Discovery step**: title "Discovered Servers"; while empty shows "Searching…"; results as ListItems (headline = name or url, supporting = url); click adds that server through the same validation as manual entry. Discovery = **UDP broadcast** via SDK `jellyfin.discovery.discoverLocalServers()` (Jellyfin local discovery: send `"who is JellyfinServer?"` to broadcast port 7359, servers reply JSON `{Id,Name,Address,EndpointAddress}`), requires `ACCESS_LOCAL_NETWORK` permission on Android 17+ (requested; if denied, jump to manual entry). De-dup by lower-cased trimmed URL. **Not possible in a browser** - web: drop the discovery step (go straight to manual entry), optionally pre-fill `window.location.origin` and previously-used servers.
2. Button "Enter server address" -> **manual step**: label "Enter Server IP or URL", text box (URI keyboard, no capitalisation/autocorrect, IME action Go = submit), error text in `error` colour, Submit button (enabled only when `url.isNotNullOrBlank() && addServerState == Pending`, so also disabled after an Error/Success until the text changes - typing resets the state to Pending via `LaunchedEffect(url)`; the Go IME key calls submit regardless; errors from the manual path are shown inline only (showToast=false), errors from a discovered-server click by toast (showToast=true)) (SwitchServerContent.kt:390-392,411-413,419-421,458-468).
3. `addServer(inputUrl)` (SwitchServerViewModel.kt:197-199): Kotlin calls the SDK recommended-server discovery -> candidates scored `GREAT/GOOD/OK/BAD`, sorted (Kotlin `sortedBy{score}` is ascending because the enum order is GREAT, GOOD, OK, BAD); choose first with `score != BAD`. **Web**: call `jellyfin.discovery.getRecommendedServerCandidates(input)` (discovery-service.js:61 = `getAddressCandidates` + `getRecommendedServers`), drop BAD entries and sort by score **descending** (TS numbers: GREAT=2, GOOD=1, OK=0, BAD=-1; the TS output is not sorted); break ties by candidate order (already static-score order); pick the first non-BAD. Candidate generation, verified in the TS SDK (lib/utils/address-candidates.js:15-87): if the input already has protocol AND port the only candidate is that URL; a missing scheme parses as http and https is added, and an explicit `http://` input also gets an https twin; default-port candidates add `:8096` for http and `:8096` and `:8920` for https; candidates are sorted by static score: https +5, http -5, `:8096` +2, `:8920` -1, default port +3; any path (reverse proxy) is kept. Each candidate is probed with `GET /System/Info/Public`, timeout 5000 ms; server score (lib/discovery/recommended-server-discovery.js:12-60,105): BAD (-1) when the response errors, `ProductName != "Jellyfin Server"` or Version is missing; OK (0) when version < MINIMUM_VERSION; GOOD (1) when version < API_VERSION or the response takes more than 3000 ms; otherwise GREAT (2). HTTPS does not demote anything in the server scoring. Reproduce the 3000 ms/5000 ms/product-name rules only for Kotlin-equivalent behaviour. Candidate strings come from `URL.toString()`, so a bare host ends with "/": strip the trailing slash before storing `server.url`. Result issues map to messages: `InvalidProductName|MissingSystemInfo` -> "Invalid server info"; `SecureConnectionFailed|ServerUnreachable|SlowResponse` -> "Unable to connect"; `MissingVersion|OutdatedServerVersion|UnsupportedServerVersion` -> "Unsupported server version"; failure text = `"Error, tried addresses:\n<address> - <issue>..."`.
4. Accept only if `serverInfo.id` parses as UUID **and** `startupWizardCompleted == true`; otherwise error "Server returned invalid response". On success create `JellyfinServer(id, name=ServerName, url=bestServer.address (normalised by SDK, no trailing slash), version)`, `addAndChangeServer`, navigate to `UserList(server)`.
Web notes: browsers block `http://` requests from an `https://` page (mixed content) and enforce CORS; the Jellyfin server must allow the web origin (Dashboard > Networking > CORS or same-origin deployment). Prefer deploying the app on the same origin or proxy.

### 5.5 User picker (`SwitchUserContent`, `UserList`)
Two jobs. Job A runs **sequentially**: `getUsers()` (known DB users for this server + `GET Users/Public` minus known ids; each with image URL from `imageApi.getUserImageUrl(id)` = `{server}/UserImage?userId={id}` on current servers (legacy `/Users/{id}/Images/Primary`); no auth needed) then `checkServerVersion()` (`GET System/Info/Public`); any exception from either puts the whole page in an Error state (ErrorMessage, no Add User card); default timeouts. Job B: `GET QuickConnect/Enabled` with 6 s request/connect/socket timeouts; failure => `quickConnectEnabled=false` (SwitchUserViewModel.kt:79-129,264-316; SwitchUserContent.kt:121-130). `init()` also calls `serverRepository.switchServerOrUser()` which clears the "most recent" SharedPrefs so the picker will show on next launch unless a user is chosen.
Layout: same centred Column as server picker; header: `select_user` "Select User" (`displaySmall`) and server name or URL (`titleLarge`); `LazyRow` of **UserIconCard** (same 129dp circle; image via Coil `ContentScale.Crop` clipped circle; on image error show first letter) + **AddUserCard** (plus icon); below, a Button **Switch servers** (width 200dp, FontAwesome icon + text) -> `SetupDestination.ServerList`; bottom red version-support message (`SwitchErrorMessage`, same style as server picker).
User card: label under the circle is `name ?: id` (bold `bodyLarge`, max 2 lines); fallback letter `(name ?: id).first().uppercase()` in `displayLarge` bold; circle colour from `rememberIdColor(user.id)` alpha 0.5/0.7 (current user 0.7/0.9); the Add User card is last (label `add_user`); the Switch-servers button label is `switch_servers`; the long-press dialog's first item is `switch_user` = "Switch" calling the same click handler (UserList.kt:97-185,196-332,373-434).
Click user:
```
if user.accessToken == null || user.requireLogin -> open login dialog (prefilled username)
else if user.hasPin                               -> PIN dialog (PinEntryDialog)
else trySwitchUser(user)                          -> changeUser; on 401 toast "Credentials expired, please login in again" + open login dialog;
                                                      on 403 toast "You are not authorized to access the server at this time" and **no** login dialog; else (any other status/exception) toast message + login dialog. Toasts are LENGTH_LONG. When `switchUserState` becomes an Error while the login dialog is closed, a long toast "Error: <msg>" is shown (SwitchUserContent.kt:89-118)
```
Long-press user: dialog titled with the user name: **Switch** (same as click) and **Delete** (only for known users) -> `removeUser` (deletes row; if current user, clears session and most-recent user).
Add user card -> login dialog with empty username. If `quickConnectEnabled`, the dialog starts in Quick Connect mode.

### 5.6 Login dialog, Quick Connect login, PIN
**Dialog** (`BasicDialog`, column width 40% of screen, `spacedBy(8dp)`, padding 16dp):
- *Quick Connect mode* (default when enabled): spinner row "Waiting for Quick Connect code..." until code; then text "Use Quick Connect on your device to authenticate to <server name or url>" and the **code** in `displayMedium`; error lines below; text button `username_or_password` "Use username/password" (cancels QC job, switches mode).
- *Password mode*: text "Enter username/password to login to <server>", error lines (message, exception.localizedMessage, `Cause: ...`), `Username` + text box (Next -> focus password), `Password` + text box (password keyboard, IME Go submits), `Login` button (enabled when username non-blank). When `loginAttempts > 2` show "Trouble logging in?" + button "Show debug info" -> Debug page. `loginAttempts` is incremented only inside `setError(...)`: non-401 password-login failures ("Error during login") and every Quick Connect error ("Error with Quick Connect"). A wrong password (HTTP 401) writes `Error("Invalid username or password")` directly and does **not** increment, so repeated wrong passwords alone never reveal the debug button on Android (decide whether the port keeps that quirk). The counter resets to 0 each time the dialog opens; the displayed error clears when the password text changes (`LaunchedEffect(password)`) (SwitchUserViewModel.kt:75-77,184-191,232-243,318-328; SwitchUserContent.kt:202-203,336-338,364-376).
- Errors: HTTP 401 on password login -> "Invalid username or password"; otherwise "Error during login" + exception text.

**Password login**: `POST Users/AuthenticateByName {Username, Pw}` -> `AuthenticationResult{AccessToken, User, ServerId, SessionInfo}`; `ServerRepository.changeUser(serverUrl, authResult, existingUser)` builds `JellyfinServer(id = result.ServerId, name = user.ServerName, url, version=null)`; if an existing known user is being re-logged, reuse its row **and set `pin = null`** ("if the server authenticated, always remove the PIN"), update token + `lastUsed`; else create new user row. Requires `AccessToken != null` and `ServerId` to be a valid UUID.

**Quick Connect login**: `GET QuickConnect/Enabled` once in `init()`; when starting: `POST QuickConnect/Initiate` -> `QuickConnectResult{Secret, Code, Authenticated}`; display `Code`; **poll `GET QuickConnect/Connect?secret=` every 5000 ms** until `Authenticated == true`; then `POST Users/AuthenticateWithQuickConnect {Secret}`; same `changeUser`. Cancelled (dialog dismissed / switch to password) by cancelling the coroutine. A 401 from the flow sets `quickConnectEnabled=false` but the dialog stays in QC mode showing "Error with Quick Connect" plus the exception text; the user must press "Use username/password". The QC-mode decision is captured once when the dialog opens (`useQuickConnect = state.quickConnectEnabled`) and applies to every `showAddUserDialog`, including re-login of an existing user with an expired token (that user is passed to `initiateQuickConnect`, so its row is reused and its PIN cleared); there is no way back from password mode to QC inside the same dialog; password mode focuses the password box when a username is prefilled (SwitchUserContent.kt:199-207,226-288; SwitchUserViewModel.kt:195-245).

**Profile PIN** (W/ui/setup/PinEntry.kt, W/ui/preferences/SetPinFlow.kt):
- The PIN is a *key sequence*, not just digits: each key-up appends a character: D-pad arrows -> `U`,`R`,`D`,`L`; keys 0-9/NumPad -> `0-9`. Hint row shows four arrow glyphs (FontAwesome `fa_arrow_left_long, up, right, down`) + `[0-9]` (`pin_digits_hint`). Display: `PinEntryDots` — pill (`defaultMinSize 180x40dp`, `surfaceVariant@0.8`, `CircleShape`, vertical padding 16dp) with one 8dp `onSurface` dot per entered char (horizontal padding 8dp, 2dp spacing).
- Verification: **compared on every key** against the stored plain string (`if (input == user.pin) trySwitchUser(user)`); no max length, no lockout, no attempt counter. Under the dots: a text button "Login via server" (+ small 10sp "Will remove PIN") -> opens the login dialog (successful server auth clears the PIN).
- Creating: `SetPinFlow` states `ENTER_PIN` (title "Enter PIN", on Enter/Center confirm; if `length < 4` toast "PIN must be 4 keys or longer") -> `CONFIRM_PIN` (title "Confirm PIN"; mismatch toast "Incorrect" and back to ENTER_PIN; match -> `updateUserAuth(user, pin, requireLogin=false)`). Subtitle "Press center to confirm". Removing: if a PIN exists, choosing "Require PIN for profile" opens `ENTER_PIN_TO_REMOVE` which removes it as soon as the typed sequence equals the stored PIN (a remove-only flow; there is no change/replace flow). The three-way Profile protection mapping (PreferencesContent.kt:453-495; SetPinFlow.kt:38-100; ServerRepository.kt:301-316): NONE -> `removeLoginAndPin` = `updateUserAuth(user,null,false)` **immediately, no PIN prompt**; PIN -> SetPinFlow (ENTER_PIN -> CONFIRM_PIN -> `updateUserAuth(user,pin,false)`, or if a PIN exists ENTER_PIN_TO_REMOVE -> `updateUserAuth(user,null,false)`); LOGIN -> `updateUserAuth(user,null,true)` immediately. The current PIN is never required to remove or replace protection (a port may require it before NONE; not Android behaviour). Picking PIN with requireLogin=true and no PIN starts ENTER_PIN and clears requireLogin when saved.
- Web: replace with a standard numeric PIN field (keyboard digits + optionally arrow keys for TV remotes), store as hash (SHA-256 + per-user salt) in IndexedDB, same >=4 chars rule.

**Require server login ("Require login for profile")**: `users.requireLogin=true` (and pin cleared). Effects: user is never auto-restored (`isProtected`), clicking the user always opens the login dialog (even though a token is stored). Choice UI = "Profile protection": `None` / `Require PIN for profile` / `Require login for profile`; summary text `none|require_pin_code|require_login`.

### 5.7 Auto sign-in rules summary
| Condition | Result |
|---|---|
| `signInAutomatically=true`, most-recent present, user not protected, token valid | straight to app |
| same but protected (PIN/requireLogin) | user list for that server |
| same but token rejected (401), server unreachable or any other exception from `Users/Me` | **server list** (exception caught in MainActivity). The user list appears only when (a) the user row is protected, (b) the user row is missing but the server row exists, or (c) only the server was remembered. The login-dialog-with-toast path (`trySwitchUser` 401 -> "Credentials expired, please login in again") applies only when the user clicks a stored user in the user picker |
| `signInAutomatically=false` | server/user list on every launch; `getMostRecentServer` still lands on that server's user list; content hidden when app is stopped |
| Opening the user picker (`SwitchUserViewModel.init`) | `switchServerOrUser()` -> `mostRecentServerProvider.clear()` (server+user keys removed) so a relaunch shows the server list until a user is chosen again; `addAndChangeServer` additionally `clearUser()`s |

### 5.8 Sign-out / remove behaviours
There is **no explicit "sign out" command**; signing out = go to Switch user: the only entry point is the nav drawer ProfileIcon click -> `SetupDestination.UserList(server)` (NavDrawer.kt:343-358; no settings row navigates there). Clearing of the most-recent prefs (`switchServerOrUser()`) happens in `SwitchUserViewModel.init()` when the user list opens (SwitchUserViewModel.kt:79-82), not in the drawer; the in-memory `ServerRepository.current` stays set while the list is open; the token is kept in the DB. Token is **not revoked on the server** (`POST Sessions/Logout` is never called). `removeUser(user)`: if current -> clear session, `apiClient.update(accessToken=null)`, clear most-recent user; delete row (cascades to all per-user tables). `removeServer(server)`: if current -> clear session, `apiClient.update(baseUrl=null, accessToken=null)`, clear most-recent; delete server (cascade users). Web port: recommend also calling `POST /Sessions/Logout` on explicit sign-out (improvement, optional).

### 5.9 Identity reported to the server
Auth header is built by `AuthorizationHeaderBuilder.buildHeader(clientName, clientVersion, deviceId, deviceName, accessToken)` (SDK) and added to every request (W/services/hilt/AppModule.kt:104-134). Format: `Authorization: MediaBrowser Client="<clientName>", Device="<deviceName>", DeviceId="<deviceId>", Version="<clientVersion>", Token="<accessToken>"` (token omitted before login; the SDK also sets this header itself for SDK calls - the OkHttp interceptor covers image/stream/plugin requests).
| Field | Android value | Source |
|---|---|---|
| Client | `"Wholphin"` (`app_name`, untranslatable) | AppModule.kt:83-89 |
| Version | `BuildConfig.VERSION_NAME` (git describe, e.g. `1.0.8`) | app/build.gradle.kts:78-79 |
| DeviceId | `androidDevice(context).id` (Jellyfin Android SDK: stable per-install/ANDROID_ID based id) | AppModule.kt:204-208 |
| Device (name) | `androidDevice(context).name` (device model/name string) | same |
| DisplayPreferences client | `"Wholphin"` (debug builds `"Wholphin (Debug)"`) | DisplayPreferencesService.kt:56-59 |
Web recommendation: Client `"Wholphin Web"` (or keep `"Wholphin"`), Version from `package.json`, DeviceId = persisted random UUID (`wholphin.deviceId`), Device = e.g. `"Wholphin Web - Chrome on Windows"` (UA-derived). `@jellyfin/sdk` `new Jellyfin({clientInfo:{name,version}, deviceInfo:{name,id}})`. Keep the DisplayPreferences client string constant (`"Wholphin"`) so home layouts remain shared with the Android app.
Capabilities (`POST /Sessions/Capabilities` with query params, `sessionApi.postCapabilities(playableMediaTypes=[Video], supportedCommands=[DisplayMessage, SendString], supportsMediaControl=true)`) are posted whenever `serverRepository.current` changes (login/user/server switch) and on activity `onResume`; `init` bails out if the api has no baseUrl or token (ServerEventListener.kt:40-60,141-156). The global `ServerEventListener` subscribes only to `GeneralCommandMessage` (DisplayMessage/SendString -> toast of "Header\nText|String") and `UserUpdatedMessage` (refresh UserDto); it reconnects immediately on any non-cancellation exception and cancels on pause/stop. `Playstate` messages are **not** handled there: they are subscribed per playback session in `PlaybackViewModel.subscribeToWebSocket/handlePlaystateRequest` (PlaybackViewModel.kt:1466-1540: STOP -> release + goBack, PAUSE, UNPAUSE, NEXT_TRACK -> playNextUp, PREVIOUS_TRACK, SEEK ticks->ms, REWIND -> skipBack pref, FAST_FORWARD -> skipForward pref, PLAY_PAUSE) and in `MusicService.subscribe` (MusicService.kt:434-490; REWIND fixed 10 s, FAST_FORWARD fixed 30 s).

### 5.10 Server version constants
`minimumServerVersion = Jellyfin.minimumVersion` (SDK), `newMinimumServerVersion = ServerVersion(12,0,0)` (WholphinApplication.kt:124-126). Messages: `server_version_not_supported` / `server_version_not_supported_future` + `": <ver>"` (or `": Unknown"`) + `"\n"` + `server_version_required` ("Required server version: %1$s"). The version shown after "Required server version" differs: NOT_SUPPORTED and UNKNOWN -> "Server version not supported: <ver|Unknown>\nRequired server version: <minimumServerVersion>"; NOT_SUPPORTED_IN_FUTURE -> "Server version will not be supported soon: <ver>\nRequired server version: 12.0.0"; SUPPORTED -> no message (Formatting.kt:333-380; strings.xml:941-943).

---------------------------------------------------------------------

## 6. Screensaver

Files: W/services/ScreensaverService.kt, W/ui/components/AppScreensaver.kt, W/MainContent.kt:139-160, W/MainActivity.kt:288-330, W/WholphinDreamService.kt (Android system dream - **android-only**).

**State** (`ScreensaverState`): `enabled` (pref), `enabledTemp` (manual "Start screensaver"), `active`, `paused`, `dimEnabled`, `dimActive`. `show = (enabled||enabledTemp) && active && !paused`; `showDim = dimEnabled && dimActive && !paused`.

**Trigger timing**: `pulse()` is called on **every key event** (`dispatchKeyEvent`) and on `onResume`. `pulse()` cancels the wait job, sets `active=false,dimActive=false` (unless already active), and, if enabled and not paused, starts a job: `delay(startDelay)` then `active=true, dimActive=dimEnabled`. A second job handles dimming alone (when `dimEnabled`): `delay(startDelay)` then `dimActive = !paused` (so dimming works even if the screensaver itself is disabled). A key press while the screensaver/dim is showing is **consumed** (stops it, re-pulses, returns true). `onStop` stops everything (`stop(true)`). Web: use `pointermove/pointerdown/keydown/wheel/touchstart` and `visibilitychange`; do not consume the first event unless screensaver is showing.
`keepScreenOn(keep)`: logic (ScreensaverService.kt:171-201): `if (screensaverEnabled || dimEnabled) { active=false; dimActive=false; paused=keep; if (!keep) pulse() }` - the wait/dim jobs are **not** cancelled, `paused=true` just suppresses `show`/`showDim`; they are cancelled only by the next `pulse()`. PlaybackViewModel passes the player's `isPlaying`, so it calls `keepScreenOn(false)` on every pause (re-pulse, restarting the countdown) and on init/release (PlaybackViewModel.kt:210,1689); slideshow calls true on start and false on stop (SlideshowViewModel.kt:107,346,360). If the in-app screensaver is **not** enabled, the call sets `FLAG_KEEP_SCREEN_ON` on the window. When the in-app screensaver is enabled, keep-screen-on is always set (so Android's own screen timeout never preempts it). Web: use `navigator.wakeLock.request('screen')` while playing / screensaver visible.
`start()` (Settings "Start screensaver" button): `enabledTemp=true, active=true, dimActive=true`.

**Content** (`createItemFlow`): builds `GetItemsRequest(recursive=true, includeItemTypes = prefs.itemTypes (default Movie, Series; optional Photo), imageTypes = [Backdrop] unless Photo selected (null), sortBy=[Random], maxOfficialRating = maxAge (omitted if <0), hasParentalRating = true when maxAge set)` through `ApiRequestPager` (paged, page size `DEFAULT_PAGE_SIZE=100`). Loop forever over the (random-ordered) list: for each item compute `backdropUrl` = photo -> `GET Items/{id}/Download`, else `ImageUrlService.getItemImageUrl(item, Backdrop)` (may be null -> item skipped silently with no delay); `title` = photo -> formatted `premiereDate` else item title; `logoUrl` = Logo image URL. **Preloads** the backdrop (image loader enqueue + await) then emits `CurrentItem`, `delay(duration)`, next index (wraps to 0). Errors: pager creation failure -> `Error` item (text "Error connecting to Jellyfin server"); empty -> `Empty` item (text `no_results` "No results"); placeholder text starts at BottomStart and every `duration` jumps to a random one of the **other 8** positions (TopStart, TopCenter, TopEnd, CenterStart, Center, CenterEnd, BottomStart, BottomCenter, BottomEnd; never repeats the current one), text colour `error`, `displaySmall`, padding 40dp, crossfade `fadeIn/fadeOut` `tween(500ms, delay 100ms)` (AppScreensaver.kt:254-302). The Error text is hard-coded English; `no_results` is localised. Further details: `ScreensaverService.init` re-creates the whole `ScreensaverState` (active=false, enabledTemp=false, paused=false) whenever any AppPreferences value changes, so changing a setting while it runs resets it; in the item loop a per-item exception is logged, followed by `delay(duration)` and advance, a null item is skipped, and `duration` is read once at flow start; items are emitted only when a backdrop URL exists (first backdrop tag only; movies/series without a backdrop are skipped); `AppColors.TransparentBlack25` = 0x40000000, vignette stop 0.85; the screensaver layer is composed only if `enabled || enabledTemp`, the dim layer independently (ScreensaverService.kt:65-81,206-276; UiConstants.kt:25; ImageUrlService.kt:53-77; MainContent.kt:135-165).

**Rendering** (`AppScreensaverContent`): black background; `AsyncImage` of the backdrop fills the screen with **cross-fade 2000 ms**; if `animate` then `scale` animates 1.0 -> 1.1 linearly over `duration` with 500 ms initial delay, reverse repeat (Ken-Burns zoom, centre origin); logo `AsyncImage` bottom-start, size 240x120dp, padding 16dp, cross-fade 750 ms (on error shows the title text instead: width 50%, height 30%, bottom-start, padding 16dp, `displaySmall`, max 2 lines, ellipsis). Overlays: radial vignette (transparent centre -> `AppColors.TransparentBlack25` at 85% of radius = max(w,h)/1.5, multiply blend) and, if `showClock`, a top scrim (black alpha 0.55 fading to transparent at 25% height) plus `TimeDisplay` clock. Enter/exit animation of the whole layer: fade-in 1000 ms, fade-out 500 ms.
**Dim**: separate full-screen black rectangle with alpha = `dimPercent/100` shown with the same fade animations when `showDim || (dimEnabled && show)`.

**Options** (screen SCREENSAVER): see 2.3 and preferences.json (`Screensaver*` ids). Start delay values: 30 s, 1, 2, 5, 10, 15 (default), 30, 60 min; duration values 15 s, 30 s (default), 1 min, 2 min; max age values 0 (all ages), 5, 10, 13, 14, 16 (default), 18, 21, none; types Movie/Series/Photo.
Web differences: **web-adapted** (in-app only). Drop DreamService. Needed server calls: `GET Items` (Random, backdrops), `GET Items/{id}/Images/Backdrop|Logo` and `GET Items/{id}/Download` for photos.

---------------------------------------------------------------------

## 7. Localization

- **Resource model**: Android `strings.xml` (default/English) + 41 translation folders `values-<qualifier>`: ar, be, ca, cs, da, de, el, en-rGB, es, et, fi, fr, hr, hu, in (Indonesian), it, iw (Hebrew), ja, kab, ko, lo, lv, nb-rNO, nl, nn, pl, pt, pt-rBR, ro, ru, sk, sl, sq, sr, sv, th, tr, uk, vi, zh-rCN, zh-rTW. `resources.properties`: `unqualifiedResLocale=en-US`. Several translation files are empty or tiny (ca, fi, ja, ko, lo, vi are 67-byte empty `<resources/>` shells; be=3, sq=33, kab=53, en-rGB=57, ar=146 strings) - fall back to English per key. Translations are managed on Codeberg Weblate (README badge).
- **Counts (default locale)**: 674 `<string>` (6 `translatable="false"`: `app_name`, `app_name_long`, `pref_key_update_last_check_threshold`, `pref_key_update_last_check`, `exoplayer`, `mpv`; plus all `fa_*` glyph strings in `fa_strings.xml` (65 lines, `translatable=false`, `&#xf02b;` style FontAwesome codepoints, FontAwesome 6 solid)), 25 `<string-array>` (2 more use tag `<array>`; items are `@string/...` references or empty strings for "no subtitle"), 23 `<plurals>`.
- **Android format features to convert** (for an i18next JSON converter):
  1. **Positional args** `%1$s`, `%1$d`, `%2$s` (29 strings, e.g. `server_version_required`="Required server version: %1$s", `recently_added_in`, `genres_in`, `season_episode_number`, `duration_hours_minutes`, `time_left`, `ends_at`, `chosen_by` ...) -> `{{1}}`, `{{2}}` (or named) with the argument order preserved.
  2. **Non-positional args** `%s`, `%d`, `%.2f` (5 strings: `decimal_seconds`="%.2f seconds", `favorite_items_title`, `up_to_age`, `search_for`, `updated_toast`) and inside plurals (`%d`, `%s`, `%1$d`) -> `{{count}}` / `{{0}}`; `%.2f` needs custom formatter (`toFixed(2)`).
  3. **Plurals**: 23 `<plurals>` each with quantities `zero`, `one`, `other` in English (e.g. `seconds`, `hours`, `days`, `minutes`, `items`, `episodes_count`, `movies`, `tv_shows`, `people`, `years_old`, `downloads`, extras categories like `trailers`, `featurettes`...). Some locales add `few`/`many`/`two` (ru, uk, pl, cs, sk, sl, hr, ar, he ...): map to i18next `key_zero/_one/_two/_few/_many/_other` using CLDR plural rules (i18next v21+ JSON v4 suffixes). Note English `zero` entries exist (Android ignores `zero` for English; i18next with `count=0` uses `_zero` only if present and the locale has the zero category; handle by treating `zero` as optional).
  4. **Escapes**: literal `\n` (2 strings: `upgrade_mpv_toast`, `confirm_enable_experimental_body`) -> newline; Android also requires `\'` and `\"` escapes (none in default file) and `\@`, `\?` and `\uXXXX`; unescape generally. `&amp;`/`&lt;` XML entities appear in translated files; 7 strings use `<![CDATA[ ... & ... ]]>` in English.
  5. **`@string/` references**: only inside arrays (101 references in the file; resolve at build time).
  6. **HTML / styled text tags** (`<b>`, `<i>`, `<a>`): **none** in the default file (no child elements in any `<string>`); `%%` literal percent: none. If translations introduce markup, `Html.fromHtml` is not used by this app's string loading, so treat as plain text.
  7. `translatable="false"` entries are skipped in translations. Strings referenced from Kotlin by `R.string.name`; keep key names (snake_case) as i18next keys. Namespaces suggestion: one `translation.json` per locale; `fa_*` become a constant icon map (not i18n).
- **Per-user language override**: stored in `users.uiLanguage` (BCP-47 tag string or null). Picker = `LocaleChoiceDialog`: available locales are read from the generated `_generated_res_locale_config` XML (AGP `generateLocaleConfig`), i.e. exactly the shipped locale folders + `en-US`; fallback `assets.locales`. Display: `locale.getDisplayName(locale)` (native) with `getDisplayName(Locale.ENGLISH)` as second line; current = `uiLanguage ?: Locale.getDefault()`. On **user switch** (`UserSwitchListener.switchUser`) the app calls `AppCompatDelegate.setApplicationLocales(user.uiLanguage ? [tag] : empty)` (empty list = follow system). Changing the language calls `serverRepository.changeUser(server, user.copy(uiLanguage=tag))` which re-persists the user and re-runs the switch (so the UI recreates in the new language). Web: `i18n.changeLanguage(user.uiLanguage ?? navigator.language)` with BCP-47 fallback chain (`pt-BR` -> `pt` -> `en`); native names via `Intl.DisplayNames`. Android quirk: legacy ISO codes `in`/`iw` (Indonesian/Hebrew) map to `id`/`he` in modern BCP-47; `Locale.forLanguageTag` handles both.
- Dates/numbers use `Locale` of the *application* (Formatting.kt notes Resources vs. locale) - web: use `Intl` with the active language.

---------------------------------------------------------------------

## 8. Background work

| Job | What | Schedule / trigger | Matters on web? |
|---|---|---|---|
| `SuggestionsWorker` (WorkManager periodic) | For every user view whose collection type is Movies (-> Movie) or TV Shows (-> Series) builds `maxItemsPerRow` (default 25) suggestion ids: seed = last 3 distinct *played* items (GetItems DatePlayed, played, limit 20; episodes grouped by series); 40% contextual (random unplayed sharing the seed genres, excluding seeds), 30% random unplayed, 30% fresh (DateCreated desc unplayed); merged, de-duplicated, shuffled, trimmed; caches ids per (user,parent,kind) JSON; also on-demand unique work when a Suggestions row is shown and no cache | every **12 h** (flex 1 h), network required, initial delay 60-180 s random, exponential back-off 15 min; unique per user. Details (SuggestionsWorker.kt:51-64,150-360): bucket sizes = floor(itemsPerRow*0.4/0.3/0.3) with a minimum of 1 each (25 items -> 10/7/7, not exact 40/30/30); final list excludes seeds (by seriesId-or-id), de-duplicates by id, shuffles, takes itemsPerRow; contextual is skipped when seeds have no genre ids; history uses `includeItemTypes=EPISODE` for series libraries; requests use `enableTotalRecordCount=false, imageTypeLimit=0`; the cache write is skipped if ids are unchanged; all-views-failed or ApiClientException -> retry in periodic mode, failure on-demand; an on-demand run requires BOTH parentId and itemKind, unique work name `...SuggestionsWorker.onDemand.{userId}.{parentId}.{kind}` | web-adapted: compute lazily when the row is first shown (or via `requestIdleCallback`/Periodic Background Sync not needed); cache in IndexedDB with TTL 12 h |
| `LatestNextUpWorker` | `updateRemovedFromNextUp`: for each series in `removeNextUp` check if the user watched an episode after removal (via GetItems DatePlayed desc limit 1) or series vanished -> un-remove, write back DisplayPreferences | every **4 h**, network required, back-off 15 min | web-adapted: run on app start/home load |
| `TvProviderWorker` / `TvProviderSchedulerService` | Publishes "Continue Watching/Next up/Latest" channels to the Android TV launcher via `androidx.tvprovider` (`WRITE_EPG_DATA`); uses SharedPreferences `channels` | periodic **1 h**, initial delay 60 s, LINEAR backoff 15 min, scheduled only on leanback devices (`FEATURE_LEANBACK`) with SDK >= O (TvProviderSchedulerService.kt:40-98); plus a one-time request from `MainActivity.onStop` | **android-only** |
| `UpdateChecker` | GitHub release check; toast at most every 12 h; in-app APK install page | on settings open / start if `autoCheckForUpdates` | **android-only** (web: service worker update) |
| `AppUpgradeHandler` | One-time migrations of proto prefs/DB between versions; copies `subfont.ttf` for MPV | on version change | web-adapted: version-keyed migration function; fresh install must apply the defaults in 2.1 |
| `ServerEventListener` | Posts capabilities (playable=[Video], commands=[DisplayMessage, SendString], supportsMediaControl) then subscribes to GeneralCommand (toast `Header\nText|String`) and UserUpdated; resubscribes on non-cancellation errors; cancelled on pause/stop, re-init on resume. Playstate remote control is **not** here: see 5.9 (PlaybackViewModel / MusicService) | lifecycle | **web** (use `@jellyfin/sdk` websocket or raw `/socket?api_key=&deviceId=`) |
| Playback reporting (`TrackActivityPlaybackListener`) | `reportPlaybackStart`, **progress every 5 s** + on pause/play changes, `reportPlaybackStopped` | during playback | web |
| Playstate/segments polling | MediaSegments polled every 500 ms in playback; transcode info polled via Sessions every 2-5 s | playback | web |
| `DatePlayedService`, `FilterOptionCache` | In-memory caches: `DatePlayedService` = Guava cache max 50 entries (`AppPreference.HomePageItems.max`), invalidated per series on watch changes and on user change (DatePlayedService.kt:42-46); `FilterOptionCache` = separate in-memory Kache max 16 keyed (userId,parentId,filterOption) (FilterOptionCache.kt:63-65,265) | | web (memoise) |
| ACRA crash reporter + `ServerReportService` | Sends log/crash text to server `System/Logs/Log` | on crash / user click | android-only / optional |
| `PlaybackLifecycleObserver`, `RefreshRateService`, Dream service, FLAG_SECURE | OS integrations | | android-only |

---------------------------------------------------------------------

## 9. Gaps and judgement calls for builders

- The Kotlin `Jellyfin.minimumVersion` is SDK-internal (not in this repo); the web port uses the TS SDK constants and discovery behaviour verified in `node_modules/@jellyfin/sdk` (5.3, 5.4).
- `androidDevice()` id/name derivation is SDK-internal; the web port should define its own (5.9).
- Colour palettes for the 8 themes live in `ui/theme/colors/*ThemeColors.kt` (not detailed here).
- The Seerr (Discover) subsystem has its own server/user tables and an OkHttp client (`api/seerr`); only its storage footprint is covered.
- `preferences.json` lists deprecated proto fields with `classification: "android-only"` purely so a migration importer can ignore them.
