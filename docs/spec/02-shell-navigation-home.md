# 02 - App shell, navigation and Home page (functional + layout spec)

Source of truth: Wholphin (Jetpack Compose for TV Jellyfin client), read-only checkout at
`reference/wholphin` (git-ignored).

Path abbreviations used for citations:

- `W/` = `app/src/main/java/com/github/damontecres/wholphin/`
- `R/` = `app/src/main/res/`
- `P/` = `app/src/main/proto/WholphinDataStore.proto`

Conventions:

- "dp" are Compose density-independent pixels. The reference TV layout is a 1080p TV (preview spec `tv_1080p`, `W/ui/UiConstants.kt:121`), which Android treats as 960 x 540 dp. That viewport size is an inference, not stated in code. For a web port treat 1 dp = 1 CSS px at a 960x540 design viewport and scale (or define `--dp`).
- "tv-material3 default" means a value that is NOT in this repo but comes from `androidx.tv:tv-material` (Card, ListItem, NavigationDrawerItem, Typography). Those are from memory of the library and flagged `(lib, unverified)`. Everything else is cited to this repo.
- Theme roles are Material 3 roles (`primary`, `surface`, `onSurface`, `border`, ...). Concrete hex values are in Appendix A.
- Jellyfin REST paths are inferred from the Kotlin SDK method names (the repo only calls SDK methods). They are marked `(endpoint inferred from SDK method)`. Query parameter names/values are taken from the Kotlin request objects.

---------------------------------------------------------------------------------------------------

## 1. App startup flow, setup navigation, back stack

### 1.1 Two independent navigation stacks

There are TWO stacks:

1. **Setup stack** (`SetupNavigationManager`, `W/services/SetupNavigationManager.kt`). It is a one-element list; `navigateTo(d)` REPLACES element 0 (`SetupNavigationManager.kt:27-30`; the initial stack is `[Loading]`, line 22). Destinations (`SetupDestination`, line 39-56):
   `Loading`, `ServerList`, `UserList(server)`, `AppContent(CurrentUser{server,user})`.
   It decides which top-level screen is shown. It has no history: system Back on `ServerList`/`UserList` is not intercepted (the `NavDisplay` back handler only fires when stack size > 1, and it is always size 1) so Back exits the activity. In particular, going `ServerList -> UserList` does NOT leave a way back to `ServerList` via Back; the user list has an explicit "switch server" button instead (`W/ui/setup/SwitchUserContent.kt:178-182`).
2. **App stack** (`NavigationManager`, `W/services/NavigationManager.kt`), a `MutableList<Destination>` that is only rendered while setup is in `AppContent`. Initial value `[Destination.Home()]` (line 17, `MainActivity.kt:195`).

Top-level renderer: `W/MainContent.kt:44-135`. It is wrapped in `Surface(background)` + `LocalInterfaceCustomization` and renders:

| SetupDestination | Rendered | Source |
|---|---|---|
| `Loading` | a 200dp box containing a `CircularProgressIndicator` (color = theme `border`) - NOTE the box is 200dp, not full-screen, and the tv `Surface` aligns content top-start, so on the real app this spinner sits near the top-left. Web port can just center a spinner. | `MainContent.kt:76-87` |
| `ServerList` | `SwitchServerContent` full screen (list of saved servers + add server) | `MainContent.kt:88-91`, `W/ui/setup/SwitchServerContent.kt` |
| `UserList(server)` | `SwitchUserContent` full screen (user cards, add user, switch server) | `MainContent.kt:92-97`, `W/ui/setup/SwitchUserContent.kt` |
| `AppContent(current)` | `ApplicationContent` (the app shell; see 1.4) | `MainContent.kt:99-131` |

Overlays on top of everything (inside `MainContent`): in-app screensaver (`AppScreensaver`, `AnimatedVisibility` fade in 1000 ms / out 500 ms) and a black dim layer with alpha = `screensaverPreference.dimPercent/100` (`MainContent.kt:137-161`, `W/services/ScreensaverService.kt:~300` enter/exit animations). See 6.4.

### 1.2 What is shown when (decision table)

Entry point `MainActivityViewModel.appStart(intent)` (`MainActivity.kt:434-469`) runs under a mutex: (a) app-upgrade handler (toast `"Wholphin updated to %s"` if version changed), (b) `handleIntent(intent)` (deep link; see 1.5), (c) `handleAppStart()`. `MainActivity.onNewIntent` (a new deep link delivered to an already-running activity) calls `setIntent(intent)` then `viewModel.appStart(intent)`, so the whole pipeline (upgrade check, `handleIntent`, `handleAppStart`) re-runs, not only on cold start (`MainActivity.kt:385-390`).

Before any of that, `MainActivity.setContent` (`MainActivity.kt:231-286`) waits for `userPreferencesService.flow` (the app preferences DataStore). If it has not emitted, nothing is drawn for 500 ms, then a black full-screen `LoadingPage` (centered 48dp spinner) appears (`MainActivity.kt:235-252`). Once preferences load, `WholphinTheme(dark, appThemeColors)` + `ProvideLocalClock` + `MainContent` are composed.

`handleAppStart()` (`MainActivity.kt:559-579`), with `signInAutomatically` = AppPreferences.sign_in_automatically (proto `P:~270`; default TRUE: `AppPreference.SignInAuto` `defaultValue = true`, `AppPreference.kt:1023-1025`, applied to a fresh datastore by `AppPreferencesSerializer.kt:26`):

| Condition | Result destination |
|---|---|
| `signInAutomatically` AND a current user already in memory AND `!user.isProtected` ("hot reload") | `AppContent(currentUser)` immediately |
| `signInAutomatically`, otherwise | `serverRepository.restoreLastSession()` -> `.destination` (below) |
| NOT `signInAutomatically` | `serverRepository.getMostRecentServer()` -> `.destination` (below) |
| any exception | `ServerList` |

`RestoredSession.destination` (`W/data/MostRecentServer.kt:145-176`):

| Session result | Destination |
|---|---|
| `None` (no saved server) | `ServerList` (the "no server" state: user adds a server URL) |
| `ServerOnly(server)` | `UserList(server)` ("no user / user must be chosen" state) |
| `Success(currentUser)` | `AppContent(currentUser)` |

`restoreLastSession()` (`W/data/ServerRepository.kt:133-165`): reads the "most recent server" record. `None` -> None. `Server` -> look up in DB (ServerOnly or None). `ServerAndUser` -> `tryChangeUser(serverId,userId)`; if it returns a `CurrentUser` that `isProtected` -> `ServerOnly(server)`, if not protected -> `Success`; if it returns null (user row missing OR user protected) -> `getMostRecentServerInternal` (server only -> `ServerOnly`, so the user list is shown and the PIN/login is demanded). Because `tryChangeUser` already returns null for protected users, the "returned user is protected" branch is unreachable in practice; the outcome (`ServerOnly`) is the same.

`tryChangeUser` (`ServerRepository.kt:193-214`) returns null (no auto sign-in) when serverId/userId null or the user is protected. `JellyfinUser.isProtected = hasPin || requireLogin` (`W/data/model/JellyfinServer.kt:74-76`) where `hasPin = pin non-blank`.

The "most recent server + user" record is persisted in SharedPreferences `<package>_server` under the keys `current.server.id`, `current.server.url`, `current.user.id`, `current.user.accessToken` (`W/data/MostRecentServer.kt:100-140`); `changeUser` saves it. `SwitchUserViewModel.init()` calls `serverRepository.switchServerOrUser()` = `mostRecentServerProvider.clear()` (`SwitchUserViewModel.kt:79-82`, `ServerRepository.kt:297-299`), so merely showing the user list erases the persisted record until a user is chosen again.

User list behavior (`SwitchUserContent.kt:163-171`, `onSwitchUser`):

| User state | Click action |
|---|---|
| `accessToken == null` OR `requireLogin` | Open the add-user/login dialog pre-filled with that user (Quick Connect if server supports it, else username + password) |
| `hasPin` | PIN entry dialog. PIN is entered on a D-pad: each Up/Right/Down/Left key appends `U/R/D/L`, each digit key 0-9 / numpad appends the digit; on every change the entered string is compared with `user.pin`; equal -> `trySwitchUser` (PIN dialog `SwitchUserContent.kt:380-393`; key handler `W/ui/setup/PinEntry.kt:41-108`). The key handler is attached to the "use server credentials" button, so it only captures keys while that button has focus, and it handles KeyUp events only. That button opens the login dialog; the PIN is removed (`pin = null`) only after a successful server login (password or Quick Connect) for that existing user, in `changeUser(serverUrl, authenticationResult, existingUser)` (`ServerRepository.kt:239-246`). |
| otherwise | `trySwitchUser(user)` -> `serverRepository.changeUser(server,user)`; on success `navigationManager.reloadHome()` then setup -> `AppContent(current)` (`SwitchUserViewModel.kt:131-165`). Errors (`SwitchUserContent.kt:89-103`): 401 -> toast `login_credentials_expired` AND opens the login dialog; 403 -> toast `login_not_authorized` only (no dialog); any other error -> toast with the message AND opens the login dialog. |

Login dialog (`SwitchUserContent.kt:199-379`): it starts in Quick Connect mode when `GET quick-connect-enabled` succeeded (6 s timeouts; a failure means disabled; checked in `SwitchUserViewModel.init`, `:79-122`); a "username or password" button switches to the credential form. While waiting it shows "Waiting for Quick Connect code...", then "Use Quick Connect on your device to authenticate to {server}" plus the code. Credential form: the username box is focused first if empty, else the password box; username IME action Next, password IME action Go submits; the Login button is enabled only when the username is not blank. `SwitchUserViewModel.login` (`:167-193`): `authenticateUserByName(username,password)` -> `changeUser(...)` -> `AppContent`. Quick Connect (`:195-245`): `initiateQuickConnect`, poll `getQuickConnectState` every 5 000 ms until `authenticated`, then `authenticateWithQuickConnect`; a 401 during Quick Connect sets `quickConnectEnabled=false`. The user list is the known (local DB) users plus public users from `GET /Users/Public` that are not already known (`known=false`, `accessToken=null`, so they always need login); user images come from `/Users/{id}/Images/Primary`; users can be removed from the list; the server version tier shows a bottom error message (see 6.6).

`loginAttempts` is incremented only inside `setError()` (`SwitchUserViewModel.kt:318-328`). A 401 in `login()` does NOT call `setError`: it sets `switchUserState = Error("Invalid username or password")` directly (`:184-191`), so wrong-password attempts never count toward the threshold. Only non-401 login failures ("Error during login") and any Quick Connect error ("Error with Quick Connect") increment it. The counter is reset to 0 each time the add-user/login dialog opens (`resetAttempts`, `SwitchUserContent.kt:203`). When `loginAttempts > 2` the dialog shows "Trouble logging in?" and a "Show debug info" button that calls `viewModel.navigationManager.navigateTo(Destination.Debug)` (`SwitchUserContent.kt:364-376`). That pushes onto the APP stack while the setup stack still shows `UserList`, so the debug page is not rendered until the app shell is shown; a web port should open its debug/about page directly.

Server list (`W/ui/setup/SwitchServerViewModel.kt`): `init` sorts saved servers by name then url and immediately tests every server with `getPublicSystemInfo` (6 s request/connect/socket timeouts) to show status and version support (`:68-88`, `internalTestServer` `:138-173`); `testServer` waits 500 ms then toasts success / error; `discoverServers` (`jellyfin.discovery.discoverLocalServers`) fills a `discoveredServers` list de-duplicated by lowercase-trimmed URL; `removeServer` re-inits the list (`:259-291`). Choosing a saved server (`switchServer`, `:175-187`): `getPublicSystemInfo` (6 s) -> on success copy the server with `name=serverName`, `version=version`, `serverRepository.addAndChangeServer`, then setup -> `UserList(server)`; on failure toast `"Error connecting: {msg}"`. Adding a server by typed URL (`addServer`, `:189-257`) does NOT use `getPublicSystemInfo`: it calls `jellyfin.discovery.getRecommendedServers(inputUrl)` (probes common scheme/port variants), sorts by score, takes the first non-BAD candidate, proceeds only if `serverInfo.id` parses as a UUID AND `startupWizardCompleted == true` (otherwise error "Server returned invalid response"), stores the address returned by discovery (not the typed text), then `addAndChangeServer` and `UserList(server)`. If every candidate is BAD it builds "Error, tried addresses:" followed by one line per address with `Invalid server info` / `Unable to connect` / `Unsupported server version`. For the web port use `GET /System/Info/Public` and require `StartupWizardCompleted`.

Note FLAG_SECURE: while the current user `hasPin`, the Android window is marked secure (no screenshots) (`MainActivity.kt:198-209`). Web: no equivalent.

### 1.3 Lifecycle hooks that change what is shown

- `onStop` -> `screensaverService.stop(true)` and a one-time TV-provider refresh (Android launcher "Watch Next"; not portable) (`MainActivity.kt:323-328`).
- `onRestart` -> `viewModel.appStart(null)` again (re-evaluates the table in 1.2) and, if the top of the app stack is `Playback`/`PlaybackList`/`Slideshow` and external player is not launched, `navigationManager.goBack()` (`MainActivity.kt:309-321`).
- `onResume` -> `viewModel.appResume()` -> `serverRepository.updateUserDto()` (re-fetches `GET /Users/Me`, `getCurrentUser`) (`MainActivity.kt:300-307, 471-482`). `currentUserDtoFlow` is a `StateFlow<ServerUserConfig?>` and `ServerUserConfig` is a data class (id, name, serverId, configuration, policy; `W/data/model/ServerUserConfig.kt:12-25`). `updateUserDto` builds a new instance, but a `StateFlow` drops values equal to the current one, so a resume only re-emits (and only then re-triggers the Home settings collector and the nav-drawer rebuild) if the user's name, configuration or policy actually changed (`ServerRepository.kt:332-346`). The Home refresh seen when returning to the app comes from `HomePage`'s `LifecycleStartEffect -> init()` (4.6), not from the DTO flow. Also pulses the screensaver timer.
- In `AppContent`: on `ON_STOP`, if `signInAutomatically` is false, the content is replaced by the 200dp spinner (`showContent=false`, never set back) (`MainContent.kt:104-131`). On return `onRestart -> appStart` navigates to `UserList` (server only), so with auto-sign-in OFF leaving the app forces user re-selection (and therefore PIN/login).
- Process death / config change: the app stack is JSON-serialized into the saved-instance bundle under key `"backStack"` (class discriminator `"_type"`) and restored; a trailing `Playback`/`PlaybackList`/`Slideshow` destination is dropped when restoring, but only when the external player is NOT launched; if the saved JSON cannot be decoded a fresh `[Home()]` stack is used (`MainActivity.kt:169-196, 356-368`). Some destinations (e.g. `UserAppPreferences`, `ItemGrid<T>`) are not serializable and make saving skip (best effort). Web analog: persist the stack in `history.state`/`sessionStorage`.
- `dispatchKeyEvent`: if the screensaver or dim is shown (`show || showDim`) the key calls `stop(false)` then `pulse()` (re-arms the idle timer) and is consumed (returns true); otherwise it calls `pulse()` and passes the event on (`MainActivity.kt:289-298`).
- On entering `AppContent` the setup layer runs `backdropService.clearBackdrop()` (`MainContent.kt:99-102`). The black startup `LoadingPage` and the in-page `LoadingPage` are focusable (focusRequester + `focusable`, `W/ui/components/CircularProgress.kt:42-66`), which matters for D-pad focus.

### 1.4 App shell (`ApplicationContent`)

`W/ui/nav/ApplicationContent.kt:44-104`. A `Box`:

1. `Backdrop(drawerIsOpen, backdropStyle, enableTopScrim=true)` (full-bleed background art; see 3.9).
2. `NavDisplay(backStack = navigationManager.backStack)` with `onBack = { navigationManager.goBack() }`. Each entry:
   - `contentKey = "${destination}_${serverId}_${userId}"` (so Compose state / ViewModels are tied to destination + user) (line 79).
   - If `destination.fullScreen` -> `DestinationContent` filling the screen (no drawer).
   - else -> `NavDrawer(...)` (drawer + content), sharing ONE `DrawerState` and ONE `LazyListState` (`navDrawerListState`) across all drawer pages so drawer scroll/open state persists between pages (lines 57-96).
   - else (no user/server) -> `ErrorMessage("Trying to go to $key without a user logged in")`.
   - Entry decorators: saveable state holder + ViewModelStore (each back-stack entry has its own ViewModels and remembered state; popping an entry disposes them).
3. Constants for the top scrim: `TOP_SCRIM_ALPHA = 0.55`, `TOP_SCRIM_END_FRACTION = 0.25` (lines 28-29).

When any full-screen destination renders, `DestinationContent` clears the backdrop (`LaunchedEffect -> onClearBackdrop`) (`DestinationContent.kt:68-70`). Many non-drawer-less destinations also call `onClearBackdrop` themselves (see table 2.1 col "clears backdrop").

### 1.5 Back stack operations (`NavigationManager`)

`W/services/NavigationManager.kt`:

| Method | Behavior |
|---|---|
| `navigateTo(d)` | push `d` (line 22-25) |
| `navigateToFromDrawer(d)` | `goToHome()` then push `d`; so after a drawer jump the stack is exactly `[Home, d]` (line 30-34) |
| `goBack()` | `if size > 1 { pop }`; never empties the stack (line 39-45) |
| `goToHome()` | pop everything above index 0; if index 0 is not a `Home`, replace it with `Home()` (line 51-61) |
| `reloadHome()` | `goToHome()`, then replace index 0 with `Home(id+1)`. The id is part of the destination key so a NEW Home entry (new ViewModel, full reload with loading page) is created (line 64-70) |
| `replace(d)` | pop to index 0 and replace index 0 with `d` (line 74-86) |

Every operation logs `"Current Destination: ..."` and records it as crash-report custom data `destination` (ACRA; web: ignore or send to logger).

Deep links / intents (`W/services/IntentService.kt`, applied in `MainActivityViewModel.handleIntent`, `MainActivity.kt:490-538`):

| Intent | Result |
|---|---|
| Normal launch (`ACTION_MAIN`/no action and no `itemType`) | NoOp -> normal start |
| `itemType` extra present (Android "Play Next" channel click) | `[SeriesOverview(seriesId, SERIES, SeasonEpisodeIds(...))]` if series/season/episode numbers present, else `[MediaItem(itemId,type)]`; stack replaced with just that (`addHomeToBackStack=false` -> `backStack.clear()`) |
| `ACTION_SEARCH` / `"search"` with query | `[Search(query)]` on top of Home |
| `ACTION_VIEW`/`"view"` + `itemId` | `[item.destination()]` on top of a reloaded Home |
| `ACTION_PLAYBACK`/`"play"` + `itemId`, optional `position`, `shuffle` | `[item.destination(), Playback(itemId, position, shuffle)]` (just `[Playback]` if the item destination itself is playback) |
| Error | Navigate setup to `UserList(current.server)` or `ServerList` and toast the message |

The intent path requires: explicit `userId`+`serverId` params (switches user) OR `signInAutomatically` with a restorable unprotected session; otherwise error toasts (`"Could not auto sign-in, ..."`). On success: `reloadHome()` (or clear) + add destinations + setup -> `AppContent`. Web analog: URL routes `/item/:id`, `/search?q=`, `/play/:id?position=`.

Intent parsing details (`IntentService.kt:28-205`, `MainActivity.kt:507-529`): parameters are read from extras OR from the data URI query (`getStringParam`/`getLongParam` fall back to `data.getQueryParameter`), and the action falls back to the URI host when `intent.action` is null (e.g. `scheme://view?itemId=...`, `scheme://play?itemId=...&position=..&shuffle=..`). `view` with no `itemId` yields an empty destination list = just a reloaded Home; a `getItem` failure returns Error `"Could not fetch item {id}"`; `play` without a resolvable item returns Error `"Cannot start playback with no itemId"`; `position` is coerced to >= 0; an unknown action returns Error `"Invalid action: ..."`. `prepare()` errors: `"Error restoring user"`, `"Could not auto sign-in, specify a server & user"`, `"Could not auto sign-in, user is protected"`, `"Auto sign-in not enabled"`. A `Target` result with no current user -> setup `ServerList` + toast `"An error occurred parsing the intent"`. Play Next channel intents need `itemId` + `itemType`, and additionally `seriesId`, `seaId`, `epNum >= 0` and `seaNum >= 0` for the `SeriesOverview` form, else `MediaItem(itemId,type)`; missing `itemId`/`itemType` -> Error `"Invalid parameters"`. Extras keys: `itemId`, `itemType`, `seriesId`, `epNum`, `seaNum`, `seaId`, `serverId`, `userId`.

### 1.6 What Back does on each kind of page

| Context | Back behavior | Source |
|---|---|---|
| Any drawer or full-screen page with app stack size > 1 | `navigationManager.goBack()` (pop one) | `ApplicationContent.kt:71` |
| Home, drawer CLOSED | FIRST Back: intercepted - opens the drawer and focuses the selected drawer item. (Compose `BackHandler(enabled = drawer Closed && destination is Home)`) | `NavDrawer.kt:297-301` |
| Home, drawer OPEN (or any state where handler is disabled) | Not intercepted: stack size is 1, so the system handles Back = EXIT APP. This is the "double back to exit": Back (open drawer), Back (exit). There is no toast or timer. | `NavDrawer.kt:298` + `NavDisplay` semantics |
| Drawer open with "More" expanded | Back collapses "More" first (`BackHandler(enabled = moreExpanded && drawer Open)`) | `NavDrawer.kt:308-310` |
| Page reached from drawer (stack `[Home, X]`) | Back -> Home (never straight out of the app) | `navigateToFromDrawer` |
| Home Settings page (`HomeSettings`) | Inner page stack (RowList/AddRow/...): Back pops inner page. At RowList with unsaved changes: Back opens "Save" dialog (Save to this device / Save to server / Discard); at RowList without changes: outer `goBack()` | `W/ui/main/settings/HomeSettingsPage.kt:93-95, 108-115` (see 5.3) |
| Grids / tabbed pages | Page specific (e.g. grid scrolled -> first Back jumps to top: `CollectionFolderList.kt:117`; TV guide `TvGuideGrid.kt:345,353`; music `NowPlaying*`); those are out of scope for this doc but exist | `W/ui/**` BackHandler uses |
| Playback | Handled by the player (out of scope) | |
| Dialogs/popups | Dismiss the dialog (platform dialog) | |

---------------------------------------------------------------------------------------------------

## 2. Destination map

`W/ui/nav/Destination.kt` (sealed class; ctor param `fullScreen`, default false). Rendered by `DestinationContent` (`W/ui/nav/DestinationContent.kt:62-432`). "FS" = full screen = rendered WITHOUT the nav drawer. "CB" = page explicitly clears the backdrop on enter.

### 2.1 Table (every entry)

| # | Destination (params) | FS | Composable (file) | ViewModel(s) | CB | Notes |
|---|---|---|---|---|---|---|
| 1 | `Home(id: Long = 0)` (`:38-41`) | no | `HomePage` (`W/ui/main/HomePage.kt:99`) | `HomeViewModel` (`W/ui/main/HomeViewModel.kt`), `AddPlaylistViewModel` | no (home sets backdrop from focused item) | `id` only exists to force a rebuild (`reloadHome`) |
| 2 | `HomeSettings` (object) (`:43-44`) | YES | `HomeSettingsPage` (`W/ui/main/settings/HomeSettingsPage.kt`) | `HomeSettingsViewModel` (+`RemovedNextUpContentViewModel`) | yes (FS) | opened from Settings > "Customize home page" (`AppPreference.kt:~785-789`) |
| 3 | `Settings(screen: PreferenceScreenOption)` (`:46-49`) | YES | `PreferencesPage` (`W/ui/preferences/PreferencesContent.kt:799`) | `PreferencesViewModel` (+ `UpdateViewModel` and `SwitchSeerrViewModel`, also injected by `PreferencesContent`, `:96-102`) | yes (FS) | enum `BASIC, ADVANCED, EXO_PLAYER, MPV, SCREENSAVER, SKIP_SEGMENTS, EXPERIMENTAL, HDR_FORMATS` (`PreferenceUtils.kt:40-49`); content is a panel on the RIGHT 40% width (`PreferencesContent` modifier `fillMaxWidth(.4f).fillMaxHeight().align(TopEnd)`, `PreferencesContent.kt:817-824`) over `background` |
| 4 | `SubtitleSettings(hdr: Boolean)` (`:51-54`) | YES | `SubtitleStylePage` (`W/ui/preferences/subtitle/SubtitleStylePage.kt`) | `PreferencesViewModel` | yes (FS) | |
| 5 | `Search(query: String = "")` (`:56-59`) | no | `SearchPage` (`W/ui/search/SearchPage.kt`) | `SearchViewModel` | yes | drawer "Search" item; also voice search / intent |
| 6 | `UserAppPreferences` (object, NOT `@Serializable`) (`:61`) | YES | `UserProfilePreferencesPage` (`W/ui/preferences/user/UserProfilePreferencesPage.kt`) | `UserPreferencesViewModel` | yes (FS) | server-profile override settings only (NOT PIN, NOT nav drawer pins). Title "User Profile Settings" (`headlineSmall`, centered, 8dp vertical padding); a 40%-width right-aligned panel on `background` with a `surfaceColorAtElevation(1dp)` column that slides in with `fadeIn() + slideInHorizontally { it / 2 }` (`UserProfilePreferencesPage.kt:67-130`). Its single group "User profile settings from server" (`W/preferences/UserProfileSettings.kt:49-70`) has three prefs: Preferred audio language and Preferred subtitle language (each click opens a language dialog) and Subtitle mode (choice: USE_USER_PROFILE, DEFAULT, SMART, ONLY_FORCED, ALWAYS, NONE). Opened from the Settings entry "More user profile settings" (summary "Override your user profile settings from the server", `AppPreference.kt:650-656`, `strings.xml:98-99, 930-931`). The nav drawer pins are a separate dialog in Settings (3.3) |
| 7 | `SeriesOverview(itemId: UUID, type: BaseItemKind, seasonEpisode: SeasonEpisodeIds? = null)` (`:63-70`) | no | `SeriesOverview` (`W/ui/detail/series/SeriesOverview.kt`) | `SeriesViewModel`, `AddPlaylistViewModel` | no | `SeasonEpisodeIds(seasonId: UUID, seasonNumber: Int?, episodeId: UUID?, episodeNumber: Int?)` (`SeriesOverview.kt:53-58`). Target of Episode/Season clicks via `BaseItem.destination()` |
| 8 | `MediaItem(itemId: UUID, type: BaseItemKind, collectionType: CollectionType? = null, initialSongId: UUID? = null)` (`:72-80`) | no | routed by `type` / `collectionType`, see 2.2 | see 2.2 | see 2.2 | secondary constructor `MediaItem(item: BaseItem)` copies `id,type,data.collectionType` |
| 9 | `Recordings(itemId: UUID)` (`:82-85`) | no | `CollectionFolderRecordings` (`W/ui/detail/CollectionFolderRecordings.kt`) | `PreferencesViewModel` + `CollectionFolderViewModel` (via `CollectionFolderGeneric`) | yes | used by nav drawer for Live TV "recording folders" |
| 10 | `Playback(itemId, positionMs: Long, forceTranscoding=false, backend: PlayerBackend?=null, shuffle=false)` (`:87-96`) | YES | `PlaybackPage` (ExoPlayer/MPV) or `PlayExternalPage` when backend (explicit or pref) == `EXTERNAL_PLAYER` (`DestinationContent.kt:83-99`) | `PlaybackViewModel` / `PlayExternalViewModel` | yes (FS) | secondary ctor `Playback(item)` uses `item.resumeMs` |
| 11 | `PlaybackList(itemId, filter: GetItemsFilter=GetItemsFilter(), startIndex: Int?=null, shuffle=false, recursive=false, sortAndDirection: SortAndDirection?=null)` (`:98-108`) | YES | same as Playback (backend taken from prefs only) (`:101-115`) | same | yes (FS) | play/shuffle a collection (series, season, boxset, playlist, genre) |
| 12 | `FilteredCollection(itemId, parentType: BaseItemKind, filter: CollectionFolderFilter, recursive: Boolean, collectionType: CollectionType)` (`:110-117`) | no | `CollectionFolderGeneric(usePosters=true, playEnabled=true, filterOptions = GENRE->DefaultForGenresFilterOptions / STUDIO->DefaultForStudiosFilterOptions, sortOptions = rememberSortOptions(collectionType))` (`DestinationContent.kt:291-309`) | `CollectionFolderViewModel` | yes | target of Genre/Studio cards (`createGenreDestination`/`createStudioDestination`, `BaseItem.kt:378-430`); `parentType` other than GENRE/STUDIO throws |
| 13 | `ItemGrid<T>(title: StringProvider, request: T, requestHandler: RequestHandler<T>, initialPosition=0, viewOptions: ViewOptions=ViewOptions())` (`:119-126`) | no | `ItemGrid` (`W/ui/components/ItemGrid.kt`) | `ItemGridViewModel`, `AddPlaylistViewModel` | yes | generic paged grid for any request (cast, favorites "view more", ...) |
| 14 | `MoreHomeRow(title: StringProvider, config: HomeRowConfig, initialPosition: Int)` (`:128-133`) | no | `HomeRowGrid` (`W/ui/detail/HomeRowGrid.kt`) | `HomeRowGridViewModel` (assisted factory with `title`,`rowConfig`) | yes | the "View more" card of a Home row; re-runs `HomeDataService.fetchDataForRow(limit=1000, usePaging=true, isRefresh=true)`; for `Genres`/`Studios` rows returns an empty row and a separate genre/studio card grid VM is used (`HomeRowGrid.kt:90-107`). `initialPosition` = number of items the Home row already showed (grid scrolls to it) |
| 15 | `Slideshow(parentId: UUID?, index: Int, filter: CollectionFolderFilter, sortAndDirection: SortAndDirection, recursive: Boolean, startSlideshow: Boolean)` (`:135-143`) | YES | `SlideshowPage` (`W/ui/slideshow/SlideshowPage.kt`) | `SlideshowViewModel` | yes (FS, via the generic clear) | photo viewer; no explicit clear of its own, but as a full-screen destination `DestinationContent` clears the backdrop (`DestinationContent.kt:68-70`) |
| 16 | `Favorites` (object) (`:145-146`) | no | `FavoritesPage` (`W/ui/detail/FavoritesPage.kt`) | `FavoritesViewModel` | yes | drawer built-in "Favorites" |
| 17 | `Discover` (object) (`:148-149`) | no | `DiscoverPage` (`W/ui/discover/DiscoverPage.kt`) | (Seerr view models inside) | yes | drawer built-in "Discover"; only when a Seerr server is active (see 3.4) |
| 18 | `DiscoveredItem(item: DiscoverItem, startIndex=0)` (`:151-156`) | no | by `item.type`: `MOVIE`->`DiscoverMovieDetails` (VM `DiscoverMovieViewModel`), `TV`->`DiscoverSeriesDetails` (`DiscoverSeriesViewModel`), `PERSON`->`DiscoverPersonPage` (`DiscoverPersonViewModel`, clears backdrop), `UNKNOWN`-> plain text "Unknown discover type" (`DestinationContent.kt:386-420`) | | | Seerr |
| 19 | `DiscoverMoreResult(type: DiscoverRequestType, startIndex=SEERR_PAGE_SIZE, initialFilter: DiscoverFilter=DiscoverFilter(), titleOverride: StringProvider?=null)` (`:158-164`) | no | `DiscoverRequestGrid(showTitle=true)` (`W/ui/discover/DiscoverRequestGrid.kt`) | `DiscoverRequestViewModel` | yes | |
| 20 | `NowPlaying` (object) (`:166-167`) | YES | `NowPlayingPage` (`W/ui/detail/music/NowPlayingPage.kt`) | `NowPlayingViewModel` | yes (FS, via the generic clear) | music queue; drawer shows a "Now playing" item while music is playing (3.5) |
| 21 | `UpdateApp` (object) (`:169-170`) | YES | `InstallUpdatePage` (`W/ui/setup/InstallUpdatePage.kt`) | `UpdateViewModel` | yes (FS) | Android self-update; not portable |
| 22 | `License` (object) (`:172-173`) | YES | `LicenseInfo` (`W/ui/components/LicenseInfo.kt`) | none | yes (FS) | |
| 23 | `Debug` (object) (`:175-176`) | YES | `DebugPage` (`W/ui/detail/DebugPage.kt`) | `DebugViewModel` | yes (FS) | also reachable from login failure |

Full-screen set (`Destination(true)`): `HomeSettings, Settings, SubtitleSettings, UserAppPreferences, Playback, PlaybackList, Slideshow, NowPlaying, UpdateApp, License, Debug`. Everything else (including every `MediaItem` page, Search, Favorites, Discover, grids) renders INSIDE the drawer shell.

CB column note: every FS destination gets its backdrop cleared by the generic `LaunchedEffect` at the top of `DestinationContent` (`DestinationContent.kt:68-70`; `Slideshow` and `NowPlaying` are `Destination(true)`, `Destination.kt:143, 167`), so "CB" only distinguishes non-FS destinations. Non-FS destinations that do NOT clear the backdrop: `Home`, `SeriesOverview`, the SERIES / MOVIE / VIDEO / MUSIC_VIDEO / EPISODE `MediaItem` pages, and `DiscoveredItem` MOVIE/TV (they set their own). `DiscoveredItem` PERSON clears it.

### 2.2 `Destination.MediaItem` routing (`DestinationContent.kt:146-289`)

Routing is by `destination.type: BaseItemKind` first; library-like kinds then branch on `collectionType`.

`BaseItemKind` -> page:

| `type` | Composable (file) | ViewModel | Clears backdrop |
|---|---|---|---|
| `SERIES` | `SeriesDetails` (`W/ui/detail/series/SeriesDetails.kt`) | `SeriesViewModel`, `AddPlaylistViewModel` | no |
| `MOVIE` | `MovieDetails` (`W/ui/detail/movie/MovieDetails.kt`) | `MovieViewModel`, `AddPlaylistViewModel` | no |
| `VIDEO`, `MUSIC_VIDEO` | `MovieDetails` (TODO in code: "Use VideoDetails") | same | no |
| `EPISODE` | `EpisodeDetails` (`W/ui/detail/episode/EpisodeDetails.kt`) | `EpisodeViewModel`, `AddPlaylistViewModel` | no |
| `BOX_SET` | `CollectionDetails` (`W/ui/detail/collection/CollectionDetails.kt`) | `CollectionViewModel`, `AddPlaylistViewModel` (also plays theme song) | yes |
| `PLAYLIST` | `PlaylistDetails` (`W/ui/detail/PlaylistDetails.kt`) | `CollectionFolderViewModel`, `PlaylistViewModel`, `AddPlaylistViewModel` | yes |
| `COLLECTION_FOLDER` | `CollectionFolder(usePostersOverride=null, recursiveOverride=null)` -> by `collectionType` | | yes |
| `FOLDER` | `CollectionFolder(usePostersOverride=true, recursiveOverride=null)` | | yes |
| `USER_VIEW` | `CollectionFolder(usePostersOverride=null, recursiveOverride=true)` | | yes |
| `PERSON` | `PersonPage` (`W/ui/detail/PersonPage.kt`) | `PersonViewModel` | yes |
| `PHOTO_ALBUM` | `CollectionFolderPhotoAlbum(recursive=false)` | `CollectionFolderViewModel` | yes |
| `MUSIC_ALBUM` | `AlbumDetailsPage(initialSongId)` (`W/ui/detail/music/AlbumDetailsPage.kt`) | `AlbumViewModel`, `AddPlaylistViewModel` | yes |
| `MUSIC_ARTIST` | `ArtistDetailsPage` | `ArtistViewModel`, `AddPlaylistViewModel` | yes |
| `AUDIO` | `SongDetailsPage` | `SongViewModel`, `AddPlaylistViewModel` | yes |
| anything else | text `"Unsupported item type: $type"` (also logged) | | no |

`CollectionFolder(...)` by `collectionType` (`DestinationContent.kt:434-536`):

| `collectionType` | Page | Notes |
|---|---|---|
| `TVSHOWS` | `CollectionFolderTv` (`W/ui/detail/CollectionFolderTv.kt`, VM `CollectionFolderTvViewModel`) | tabbed (`TabbedPage`: Recommended / Library / Genres / ...) |
| `MOVIES` | `CollectionFolderMovie` (`CollectionFolderMovie.kt`, `PreferencesViewModel` + `RecommendedMovie`) | tabbed |
| `BOXSETS` | `CollectionFolderGeneric(usePosters=true, recursive=false, playEnabled=false, sortOptions=MovieSortOptions)` | |
| `PLAYLISTS` | `CollectionFolderPlaylist(…, true)` | |
| `LIVETV` | `CollectionFolderLiveTv` (VM `LiveTvCollectionViewModel`) | TV guide etc. |
| `MUSIC` | `CollectionFolderMusic` (VM `CollectionFolderMusicViewModel`) | |
| `HOMEVIDEOS`, `PHOTOS` | `CollectionFolderPhotoAlbum(recursive = recursiveOverride ?: false)` | |
| `MUSICVIDEOS`, `BOOKS` | `CollectionFolderGeneric(usePosters = usePostersOverride ?: false, recursive = recursiveOverride ?: false, playEnabled=true)` | |
| `FOLDERS`, `TRAILERS`, `UNKNOWN`, `null` | `CollectionFolderGeneric(usePosters = usePostersOverride ?: false, recursive = recursiveOverride ?: false, playEnabled=false)` | |

### 2.3 `BaseItem.destination()` - what a click on any card navigates to (`W/data/model/BaseItem.kt:~257-340`)

Evaluated in this order:

1. `destinationOverride` (genre/studio cards) wins.
2. `data.extraType != null` or `type == TRAILER` -> `Playback(id, 0)`.
3. `EPISODE` with `seasonId`+`seriesId` -> `SeriesOverview(seriesId, SERIES, SeasonEpisodeIds(seasonId, parentIndexNumber, id, indexNumber))`; else `MediaItem(this)`.
4. `SEASON` with `seriesId` -> `SeriesOverview(seriesId, SERIES, SeasonEpisodeIds(id, indexNumber, null, null))`; else `MediaItem(this)`.
5. `TV_CHANNEL` -> `Playback(id, 0)`.
6. `PROGRAM` -> `Playback(channelId, 0)` if `channelId != null` else `MediaItem`.
7. `AUDIO` with `albumId` -> `MediaItem(albumId, MUSIC_ALBUM, initialSongId = id)`; else `MediaItem`.
8. default `MediaItem(this)` (`itemId,type,collectionType`).

---------------------------------------------------------------------------------------------------

## 3. Navigation drawer

Files: `W/ui/nav/NavDrawer.kt`, `W/ui/nav/NavigationDrawerAndroid.kt` (re-implementation of tv-material3 `ModalNavigationDrawer`), `W/services/NavDrawerService.kt`.

### 3.1 Structure and behavior in one picture

Collapsed (default; drawer state `Closed`) and expanded (`Open`) are the SAME column; only item width animates. The content area does not resize: it is TRANSLATED right by the extra width.

```
 collapsed (64dp rail)                         expanded (224dp)
+--------+----------------------------+      +--------------------------+-----------------------+
| (o)    | 8dp gap                    |      | (o) username             |  content shifted      |
|        |   content area             |      |     server name          |  right by 160dp       |
|  [S]   |   (padding-start 72dp,     |      |  [S] Search              |  (right 160dp is      |
|  [H]   |    padding-end 16dp)       |      |  [H] Home                |   pushed off-screen,  |
|  [<3]  |                            |      |  [<3] Favorites          |   NOT re-laid-out)    |
|  [F]   |                 12:34  <-- |      |  [F] Movies              |             12:34 <-- |
|  [TV]  |   clock top-right          |      |  [TV] Shows              |                       |
|   ...  |   (px 24/16 pad)           |      |   ...                    |                       |
|        |                            |      |                          |                       |
|  [gear]|                            |      |  [gear] Settings         |                       |
+--------+----------------------------+      +--------------------------+-----------------------+
 item w = 64dp                                 item w = 224dp          content x-offset +160dp
```

Dimensions (`NavigationDrawerAndroid.kt:136-140`, `NavDrawer.kt:312-328, 335-338, 556-558`):

| Property | Value |
|---|---|
| Collapsed item width | `CollapsedDrawerItemWidth = 64.dp` |
| Expanded item width | `ExpandedDrawerItemWidth = 224.dp` |
| Icon box | `DrawerIconSize = 24.dp`, horizontal padding `(ListItemDefaults.IconSize - 24dp)/2` each side (`ListItemDefaults.IconSize` = 36dp (lib, unverified) -> 6dp) |
| Item height | one line `NavigationDrawerItemDefaults.ContainerHeightOneLine` (56dp (lib, unverified)); two line (profile item, "Now playing" with subtext) `ContainerHeightTwoLine` (64dp (lib, unverified)) (`NavigationDrawerAndroid.kt:167-172`) |
| Vertical spacing between items | `4.dp` (`spacedBy` at `NavDrawer.kt:335`) |
| Items alignment | `Column(horizontalAlignment = CenterHorizontally, fillMaxHeight)` |
| Text style inside drawer | `labelMedium` (12sp (lib, unverified)), single-line, marquee when focused (`enableMarquee(focused)`) |
| Item width animation | `animateDpAsState` with default spring |
| Drawer container animation | `animateContentSize(spring(stiffness = StiffnessMedium))` |
| Content area offset | `IntOffset(x = if (drawer open) (224-64)dp else 0)`, `animateIntOffsetAsState(spring(StiffnessMedium))` (`NavDrawer.kt:314-328`) |
| Content area padding | `padding(start = 64dp + 8dp = 72dp, end = 16dp)`, applied AFTER the offset (`NavDrawer.kt:556-558`) |
| Clock | `TimeDisplay()` placed `TopEnd` of the content Box with padding `vertical 16dp, horizontal 24dp`, font 18sp, `onSurface`, bodyLarge (`W/ui/components/TimeDisplay.kt`); only if `interfacePreferences.showClock` (default true, `AppPreference.kt:~852-862`). It is a sibling of (not inside) the offset content, so it does NOT shift when the drawer opens |
| Backdrop dimming | while drawer open the backdrop image gets a 75% black overlay (`Backdrop.kt:175-180`) |

### 3.2 Items and order (top to bottom) - `NavDrawer.kt:338-542`

| # | Item | Icon | Label (string) | Click | Notes |
|---|---|---|---|---|---|
| 1 | Profile ("ProfileIcon") | circular `UserIconCardImage` 24dp (`W/ui/setup/UserList.kt:300-343`): `GET /Users/{userId}/Images/Primary` (`imageApi.getUserImageUrl`), `ContentScale.Crop`, clipped to a circle, drawn on a circle filled with `rememberIdColor(id, alpha)`. The `alpha` (.5 when the drawer is collapsed, 1 when open, `NavDrawer.kt:583-589`) is passed ONLY to that background circle color, so a loaded profile image is always fully opaque. Fallback (url blank or image load error `imageError`) = the letter `(name ?: id.toString()).firstOrNull()?.uppercase() ?: "?"`, bodyLarge style with `fontSize` 14sp, `FontWeight.Normal`, color `onSurface`, centered, also at full opacity. Background color formula: see "`rememberIdColor`" below the table | headline: user name (or id), supporting: server name (or url) | `musicService.stop()` then setup -> `UserList(server)` (= switch user) | two-line item |
| 2 | Now playing (conditional) | `Icons.Default.PlayArrow` | "Now playing" + subtext = current track title | `setIndex(NOW_PLAYING_INDEX)` then `navigateTo(NowPlaying)` (push, not from drawer) | only when `NavDrawerItemState.nowPlayingEnabled`; animates in/out with expand/shrink vertically. See 3.5 |
| 3 | Search | `Icons.Default.Search` | "Search" (`R/values/strings.xml:114`) | `navigateToFromDrawer(Search())` | first item of the LazyColumn; focus target when entering the drawer going DOWN |
| 4 | Home | `Icons.Default.Home` | "Home" | if already on `Home` -> `reloadHome()` + clear backdrop (full reload); else `goToHome()` | |
| 5.. | `serviceState.items` | see below | | see below | order = pinned items by user order |
| n+1 | "More" (only if `moreItems` non-empty) | FontAwesome `fa_ellipsis` (U+F141); trailing icon `ArrowDropDown` (expanded) / `KeyboardArrowLeft` (collapsed) | "More" | toggles `moreExpanded` (no navigation) | |
| n+2.. | `moreItems` (only when expanded) | same icons as libraries | | same | background container `surface @ 50% alpha` when drawer open else unspecified |
| last | Settings | `Icons.Default.Settings` | "Settings" | `navigateTo(Settings(BASIC))` (push; Back returns) | PINNED TO THE BOTTOM: the LazyColumn uses `Arrangement.spacedByWithFooter(4dp)` that places the last item at `totalSize - itemSize` (`W/ui/Extensions.kt:275-298`) |

`serviceState.items` / `moreItems` element types:

- Built-ins `NavDrawerItem.Favorites` (id `"a_favorites"`, FA heart U+F004, label "Favorites", click `navigateToFromDrawer(Favorites)`), `NavDrawerItem.Discover` (id `"a_discover"`, FA magnifying-glass-plus U+F00E, label "Discover", click `navigateToFromDrawer(Discover)`, only present when Seerr is active), `NavDrawerItem.More` (id `"a_more"`).
- `ServerNavDrawerItem(itemId, name, destination, type: CollectionType)` for each library, id `"s_" + itemId.toServerString()` (UUID without dashes).

Library icons (`NavDrawer.kt:664-692`): FontAwesome 16sp glyph, centered in the 24dp icon box.

| CollectionType | Glyph | Code point |
|---|---|---|
| MOVIES | film | U+F008 |
| TVSHOWS | tv | U+F26C |
| HOMEVIDEOS | video | U+F03D |
| LIVETV | drawable `gf_dvr` (a vector icon, 24dp `Icon`, not font) | `R/drawable/gf_dvr.xml` |
| MUSIC | music | U+F001 |
| BOXSETS | folder-open | U+F07C |
| PLAYLISTS | list-ul | U+F0CA |
| everything else (MUSICVIDEOS, PHOTOS, FOLDERS, null/mixed...) | film | U+F008 |

Glyph source: `R/values/fa_strings.xml` (`fa_*`). Web: use Font Awesome free-solid with these names (`film, tv, video, music, folder-open, list-ul, heart, ellipsis, magnifying-glass-plus`).

`rememberIdColor` (`W/ui/setup/ServerList.kt:56-92`; also used for Genre/Studio card tints): `h = id.hashCode()` (`java.util.UUID.hashCode()`, i.e. the XOR of the high and low 32-bit halves of both 64-bit parts); `hue = (h % 360).toFloat()`; `sat = 0.6 + ((h / 360) % 40) / 100`; `brightness = 0.4 + ((h / 14400) % 30) / 100`. `/` and `%` are Kotlin integer operators (truncation toward zero, `%` takes the sign of the dividend), so a negative hash gives a negative hue, saturation offset and brightness offset. Then `c = brightness*sat; x = c*(1 - abs((hue/60) % 2 - 1)); m = brightness - c` and the six-sector switch (`hue < 60` -> (c,x,0); `< 120` -> (x,c,0); `< 180` -> (0,c,x); `< 240` -> (0,x,c); `< 300` -> (x,0,c); else (c,0,x)); result = `(r+m, g+m, b+m)` each coerced to 0..1, at the given alpha. A negative hue falls into the `hue < 60` branch. A null id gives `surfaceVariant`. Real ranges: saturation 0.6-0.99, brightness 0.4-0.69 (the source comments say 1.0 / 0.7). A port may use any stable hash, but exact color parity with the Android app needs this formula.

Click behavior details (`NavDrawer.kt:105-150, 360-538`): Search, Home, Now playing, Favorites, Discover and library items call `setIndex(index)` immediately (the highlight moves before navigation completes). Settings does NOT call `setIndex` (the highlight stays on the previous item), nor does the profile item; "More" never changes the selection (`selected=false` always, and `onClickDrawerItem(More)` only toggles `moreExpanded`). Profile and "Now playing" sit ABOVE the `LazyColumn` (they do not scroll with it); the `LazyListState` (`navDrawerListState`) is hoisted in `ApplicationContent`, so the scroll position survives page changes. The focus requester for the selected item is attached to the item whose index equals `selectedIndex`; the "More" row uses index `items.size`, and the first child of `moreItems` has adjusted index `items.size + 0`, so both carry the same requester when that index is selected (collision).

Library click destination: normal library -> `Destination.MediaItem(itemId, type /*BaseItemKind from UserView, usually COLLECTION_FOLDER*/, collectionType)`; Live TV recording folder -> `Destination.Recordings(itemId)` (`NavDrawerService.kt:203-213`). Click always goes through `navigateToFromDrawer` (stack becomes `[Home, X]`).

### 3.3 How libraries are listed, pinned, hidden, ordered (`W/services/NavDrawerService.kt`)

Trigger: `combine(currentUserFlow, currentUserDtoFlow, seerrServerRepository.active)` -> `updateNavDrawer(user, userDto, discoverActive)` only when `user.id == userDto.id`; otherwise the state resets to empty (`:59-86`). Errors -> toast "Error fetching user's views".

`getAllUserLibraries(userId, tvAccess)` (`:128-168`):

1. `GET /UserViews?userId={id}` (`userViewApi.getUserViews`) - all views.
2. If `userDto.policy.enableLiveTvAccess == true`: `GET /LiveTv/Recordings/Folders?userId={id}` (`liveTvApi.getRecordingFolders`). A 401/403 here is swallowed (empty set); other errors throw.
3. Keep views whose `collectionType` is in `supportedCollectionTypes` OR whose id is a recording folder. `supportedCollectionTypes` = `{MOVIES, TVSHOWS, HOMEVIDEOS, PLAYLISTS, BOXSETS, LIVETV, MUSICVIDEOS, FOLDERS, MUSIC, PHOTOS, null(mixed)}` (`W/util/Constants.kt:25-38`). NOT supported (hidden): BOOKS, TRAILERS, UNKNOWN-typed views.
4. Map to `Library(itemId, name, type: BaseItemKind, collectionType (UNKNOWN if null), isRecordingFolder)`.

`updateNavDrawer` (`:190-252`):

1. `allItems = [Favorites] + (Discover if active) + libraries` (server order from `/UserViews`).
2. Per-user pins from table `NavDrawerPinnedItem(userId, itemId: String, type: PINNED|UNPINNED, order: Int default -1)` (`W/data/model/NavDrawerPinnedItem.kt`, DAO `ServerPreferencesDao.getNavDrawerPinnedItems(userId)`). Stored locally (Room DB), NOT on the server.
3. Sort key: `pin.order` if `>= 0` else `Int.MAX_VALUE` (stable sort => unconfigured items keep default order: Favorites, Discover, libraries in server order; new server libraries land at the end; items the pin table knows but server no longer returns are simply skipped).
4. Pinned state: `pin.type` or PINNED if unknown. `PINNED` -> `items`; otherwise -> `moreItems` (shown under "More").
5. `NavDrawerItemState(items, moreItems, nowPlayingEnabled, nowPlayingTitle, allLibraries)`.

User-facing pin editor: the Settings row "Customize Navigation Drawer Items" (summary "Choose the default items to show, others will be hidden"; strings `nav_drawer_pins`, `nav_drawer_pins_summary`, `strings.xml:342-343`; group `profile_specific_settings` = "User Profile Settings"; `AppPreference.UserPinnedNavDrawerItems`, `AppPreference.kt:776-781, 1203-1209`) opens `NavDrawerPreferenceDialog` (`W/ui/preferences/NavDrawerPreference.kt:147-278`): `BasicDialog` elevation 3dp, content padding 16dp, title (same string) in `titleLarge` / `onSurface` with 8dp bottom padding, then a list of all items (items+moreItems, Discover excluded when Seerr off). Each row is a `ListItem` (click toggles the pin) with a trailing `Switch`, row height >= 40dp, then 8dp spacing to two 32dp FA 16sp buttons (caret-up U+F0D8, caret-down U+F0D7) spaced 4dp; Up is disabled on the first row, Down on the last; rows animate (`animateItem`). Closing the dialog saves: row index becomes `order`, `UNPINNED` for switched-off, via `saveNavDrawerPinnedItems` then `navDrawerService.updateNavDrawer(...)`.

Selection highlight (`NavDrawerViewModel.updateSelectedIndex`, `NavDrawer.kt:162-202`; runs once per NavDrawer composition): walks the app stack from the TOP downward, first match wins: `Home` -> index -1; `Search` -> -2; `NowPlaying` -> -3; otherwise index of the destination in `items + moreItems` by structural equality (`Destination.MediaItem(...)` equality incl. `collectionType`); no match continues to the next stack entry. Clicks on Search / Home / Now playing / Favorites / Discover / library items set the index immediately (not Settings or More; see 3.2). Selected state only colors the icon (3.7); `ListItem.selected` is always false.

Drawer VM is keyed by `"${server.id}_${user.id}"` (`NavDrawer.kt:284-288`) so it resets on user switch.

### 3.4 Discover item visibility

`seerrServerRepository.active` is true when `BuildConfig.DISCOVER_ENABLED` and a Seerr server+user was configured/auto-logged-in (`W/services/UserSwitchListener.kt:~75-125`). Web: only include Discover if the web port implements Seerr.

### 3.5 "Now playing" item

`NavDrawerService` observes `MusicService.state.status` (`:88-122`): `PLAYING` -> enabled with `currentItemTitle`; `IDLE` -> disabled; `PAUSED` -> keeps showing for 2 hours (`delay(2.hours)`) then disables. The collector is `collectLatest`, so a new music state cancels a pending 2-hour PAUSED delay (a resume to PLAYING keeps it enabled; `currentItemTitle` is updated on every PLAYING emission). PLAYING/IDLE updates are applied via `copy`, so music state survives library refreshes; the user-change branch resets the whole state to `NavDrawerItemState()` (including the `nowPlaying*` fields) (`NavDrawerService.kt:59-122`).

### 3.6 Focus behavior (D-pad) - `NavDrawerAndroid.kt:86-130`, `NavDrawer.kt:385-402`

- The drawer is "open" iff the drawer container (or any child) has focus: `onFocusChanged { drawerState.setValue(if hasFocus Open else Closed) }` (after init). So pressing LEFT from the content's left edge moves focus into the drawer -> it opens; moving focus right (out) -> it closes. There is no toggle button.
- Entering the LazyColumn: `focusProperties.onEnter`: if entering with direction DOWN (from the profile / Now Playing item above) -> focus Search item; otherwise (from the right) -> focus the item that has the `focusRequester`, which is the currently selected item (Home/Search/library/NowPlaying); if none is selected, nothing is forced (default focus search).
- Back on Home with closed drawer: `drawerState.setValue(Open)` and `focusRequester.requestFocus()` (selected item).
- Pages themselves request focus into their content on entry; the drawer only grabs focus on LEFT / Back-on-Home.
- Text marquee: `Modifier.enableMarquee(focused)` (`W/ui/Extensions.kt:192-201`): when focused `basicMarquee(initialDelayMillis = 250, animationMode = Immediately, velocity = 40.dp)`; when not focused `basicMarquee(animationMode = WhileFocused)` with defaults (`NavDrawer.kt:600, 644, 738`).
- Selecting items does not auto-close the drawer; navigation moves focus into new content, which closes it.
- The "switch on focus" preference (`NavDrawerSwitchOnFocus`) exists in proto and defaults (`AppPreference.kt:826-835`) but is commented out of the settings screen (`AppPreference.kt:1315`) and not used by the drawer code => dead; ignore.

### 3.7 Colors (by theme role)

Item container/text (library `NavigationDrawerItemDefaults.colors(...)`, tv-material3 defaults (lib, unverified): container transparent; contentColor `onSurfaceVariant`; inactiveContentColor = contentColor @ 40% (used when drawer has no focus); focusedContainerColor `inverseSurface`; focusedContentColor `inverseOnSurface` (per-theme values of both are in Appendix A); pressed = focused; selectedContainer `secondaryContainer`). Repo overrides: "More" children use `containerColor = surface @ 50%` only while drawer is open (`NavDrawer.kt:506-511`); `ListItem scale = (1f,1f)` i.e. NO focus zoom (`NavigationDrawerAndroid.kt:207`).

Icon tint (`navItemColor`, `NavDrawer.kt:747-800`) - this is the real visible state logic:

Non-OLED themes:
`alpha = drawerOpen ? .85 : (selected ? .5 : .2)`; base color:

| state | base color |
|---|---|
| selected AND focused | PURPLE/BLUE/GREEN/ORANGE/RED/BROWN: `colorScheme.border`; BOLD_BLUE: `colorScheme.primary` |
| selected | `colorScheme.border` |
| focused | current content color (`LocalContentColor`; = `inverseOnSurface` on the inverseSurface container) |
| else | `colorScheme.onSurface` |

OLED_BLACK theme: selected&focused `#000000`; selected & collapsed `white @ .5`; selected & open `white @ .85`; focused `black @ .5`; open `#707070`; else `#505050 @ .66`.

`border` theme role = `inversePrimary` (alpha .75 for PURPLE/GREEN in dark) - see Appendix A.

Backdrop/background under drawer: the whole screen background is `colorScheme.background`; no separate drawer panel fill (drawer items float on the backdrop).

### 3.8 Drawer-free pages

Full-screen destinations (2.1) skip `NavDrawer` entirely (no drawer, no clock). Because the shared `DrawerState` lives in `ApplicationContent`, returning to a drawer page restores previous open state (it is normally Closed because focus left).

### 3.9 Backdrop (rendered behind everything, `W/ui/nav/Backdrop.kt`, `W/services/BackdropService.kt`)

- Pages submit an item; `BackdropService.submit(item)` (`BackdropService.kt:57-132`): `imageUrl = item.type == GENRE ? item.imageUrlOverride : getItemImageUrl(item, BACKDROP)`; Discover items use itemId `discover_{id}` with their `backDropUrl`. URL rules (`ImageUrlService.kt:65-86`): EPISODE/SEASON with `seriesId != null` -> `/Items/{seriesId}/Images/Backdrop` with tag = `parentBackdropImageTags[0]` only if `parentBackdropItemId == seriesId` (otherwise no tag is sent); else if the item has `backdropImageTags` -> `/Items/{id}/Images/Backdrop?tag={backdropImageTags[0]}`; else `null` (no fallback, so no backdrop is shown). `clearBackdrop()` sets `NONE`.
- Publishing is NOT a debounce (`BackdropService.kt:57-132`, `:182-237`). `submit(itemId, imageUrl)`: if `imageUrl` differs from the currently published url (or `imageUrl == null`) it IMMEDIATELY publishes `{itemId, imageUrl = null}` (blanking the image, keeping the old colors); if the url equals the current non-null url nothing happens. It then waits a fixed `delay(500)`; if the style is dynamic (`BACKDROP_DYNAMIC_COLOR` or `UNRECOGNIZED`) it extracts colors (cache of 50 urls), otherwise the colors are `ExtractedColors.DEFAULT` (unspecified); then, only if the published `itemId` is still this itemId (a newer `submit` supersedes it), it publishes `{itemId, imageUrl, colors = new ?: previous}`. So the image appears 500 ms late even when the style is not dynamic. A null/blank url gives a null extraction result, which keeps the previous colors; a missing Palette swatch gives `Color.Transparent`. Extraction loads the image into an ARGB_8888 software bitmap and runs androidx `Palette.from(bitmap).generate()`: primary = darkVibrant ?: darkMuted @ alpha .4; secondary = (vibrant if "cool" else muted if cool, else vibrant, else muted) @ .4; tertiary = vibrant ?: lightVibrant @ .35. "cool" = `b > r && (b+g) > 1.5*r`.
- Layer 1 (only if style is DYNAMIC and colors exist): full-screen `background` + 4 radial gradients, radius `0.8 * width`: top-left `secondary`, bottom-right `primary`, bottom-left `background`, top-right `tertiary`, each fading to transparent; colors animate 1250 ms.
- Layer 2 (unless style NONE): image aligned TOP-END, size 70% width x 70% height, `ContentScale.Fit`, crossfade 800 ms; masked with: top scrim (black @ 55% fading to transparent at 25% of image height, multiply), horizontal alpha gradient transparent->opaque from x=0 to 60% of width (so left edge fades out), vertical alpha gradient opaque->transparent top to bottom (so bottom fades out). The 75% black overlay when the drawer is open (`drawerIsOpen`) is drawn inside this image layer only (on the 70% x 70% image, before the top scrim and the two DstIn alpha masks), so it fades with the same left and bottom masks and does not darken the radial-gradient layer or the base background (`Backdrop.kt:80-216`).
- Style preference `backdropStyle` default `BACKDROP_DYNAMIC_COLOR`; options Dynamic color / Image only / None (`R/values/strings.xml:771-775`).
- `BackdropStyle.UNRECOGNIZED` is treated as dynamic. RTL mirrors only the horizontal gradient start and the radial-gradient corners. The `Backdrop` is rendered by `ApplicationContent` behind both drawer and full-screen pages (so full-screen pages also show it until their `DestinationContent` clears it), and `SetupDestination.AppContent` clears it on entry (`MainContent.kt:99-102`). The scrim constants live in `ApplicationContent.kt` (`TOP_SCRIM_ALPHA = 0.55`, `TOP_SCRIM_END_FRACTION = 0.25`) and `enableTopScrim` is a parameter (default true).

---------------------------------------------------------------------------------------------------

## 4. Home page

Files: `W/ui/main/HomePage.kt`, `W/ui/main/HomeViewModel.kt`, `W/services/HomeDataService.kt`, `W/services/HomeSettingsService.kt`, `W/services/LatestNextUpService.kt`, `W/data/model/HomeRowConfig.kt`.

### 4.1 Layout

```
+--- content area (x from 72dp, right pad 16dp; top-right spinner / clock) ------------------+
| HEADER  (padding top 48, start 8, bottom 32; inner height 180) -> 260dp tall total       |
|  +-- Title OR logo (max height 60dp, width 75%) ----------------------------+             |
|  |  [logo image  h=60dp, max w=320dp]   or   Title text (headlineMedium     |             |
|  |   SemiBold, max 2 lines, ellipsis)                                       |             |
|  +--------------------------------------------------------------------------+             |
|  4dp gap                                                                                  |
|  +-- details column (width 60%), 8dp vertical spacing ----------------------+            |
|  |  Subtitle (episode/season name)  headlineSmall 20sp, 1 line, ellipsis    |            |
|  |  Quick details row (titleSmall): "S1 E3 . Jan 5, 2024 . 42m . 18m left"   |            |
|  |      + " . PG-13" + " . 7.8 [star]" + " . 91% [tomato]" + " . Ends at 9:41 PM" |      |
|  |  Overview (bodyMedium 14sp, onSurface) FIXED box width 400dp,            |            |
|  |      height 60dp (3 lines)  | 48dp (2 lines when item is an Episode)     |            |
|  +--------------------------------------------------------------------------+            |
|                                                                                          |
| ROWS (LazyColumn, bottom contentPadding 172dp, row spacing 0)                            |
|  Continue watching                       <- titleLarge 22sp, onBackground, start pad 8   |
|  8dp                                                                                     |
|  [card][card][card][card] ...>           <- LazyRow, contentPadding h=spacing v=8dp      |
|      card spacing = viewOptions.spacing (default 16dp)                                   |
|  8dp bottom padding per row                                                              |
|  Recently added in Movies ...                                                            |
+------------------------------------------------------------------------------------------+
                                              top-right: 40dp spinner while refreshing
                                              (padding 40dp if clock shown else 20dp)
```

Sources: header `HeaderUtils` (`W/ui/components/HeaderUtils.kt:9-24`: topPadding 48, bottomPadding 32, startPadding 8, height 180, logoHeight 60; modifier = `padding(48,start 8,32).height(180)`), `HomePageHeader` (`HomePage.kt:542-632`), `TitleOrLogo` (`W/ui/components/TitleOrLogo.kt:29-73`), `ItemRow` (`W/ui/cards/ItemRow.kt:36-130`), `HomePageContent` (`HomePage.kt:278-535`).

Home content (header + rows) is a `Column(fillMaxSize)` inside the drawer content area. Vertical budget on 540dp tall viewport: header 260dp, rows area 280dp, so exactly one row (title 28 + 8 + card row (172+16) + 8 = ~232dp) is fully visible plus the start of the next.

Row scroll behavior: `ScrollToTopBringIntoViewSpec(spaceAbovePx = 50dp)` so when a row takes focus the list scrolls so that the row's top is 50dp below the list top (`HomePage.kt:352-359, W/ui/util/ScrollToTopBringIntoViewSpec.kt:28-43`). Rows scroll vertically one at a time with the focused row snapped near the top; horizontal row scroll uses default Compose bring-into-view (keeps focused card visible). Web: `scroll-margin-top: 50px` + `scrollIntoView` on row focus.

### 4.2 Header (focused item details)

The header always reflects `focusedItem = homeRows[position.row].items[position.column]` where `position: RowColumn` is updated whenever any card gains focus (`HomePage.kt:299-304, 450-453`). Initial `position = (-1,-1)` (no item => header is empty; the Spacer keeps its height).

`HomePageHeader(item, showLogo)` field derivation (`HomePage.kt:542-581`):

| Field | Rule |
|---|---|
| title | `EPISODE`/`SEASON` -> `data.seriesName`; else `item.title` (`item.title` = `seriesName` for EPISODE else `name`) |
| subtitle | `SEASON`/`EPISODE` -> `item.name` (episode/season name); else none |
| overview | `data.overview` (blank -> empty Spacer of the same size) |
| overviewTwoLines | true if `EPISODE` (then 2 lines / 48dp tall) else 3 lines / 60dp |
| quickDetails | `item.ui.quickDetails` (below) |
| timeRemaining | `item.timeRemainingOrRuntime`: `PROGRAM` -> null; else `data.timeRemaining ?: runTimeTicks` |
| endsAt | `data.endDate` (live TV programs) |
| logo | `showLogo` pref (`interfacePreferences.showLogos`, default TRUE, "Prefer logos") AND logo URL available AND image did not error; else text title |

Logo URL (`TitleOrLogo.kt:90-110` + `ImageUrlService.kt:~30-50`): for `EPISODE`/`SEASON` with `seriesId` and `parentLogoImageTag` -> `GET /Items/{seriesId}/Images/Logo?tag={parentLogoImageTag}` (the tag is sent only when `parentLogoItemId == seriesId`, otherwise the URL has no tag; `quality=96`, no `fillHeight`; `TitleOrLogo.kt:90-109`); if the episode/season has no `parentLogoImageTag` it falls through to the own-Logo check; otherwise, only when `Logo` is present in the item's `imageTags`, the item's own `Logo` image (`/Items/{id}/Images/Logo?tag={imageTags.Logo}`); the `Image` is `ContentScale.Fit`, `height 60dp`, `widthIn(max 320dp)`; on load error falls back to the title text permanently for that item.

Quick details line (`BaseItem.ui.quickDetails`, `BaseItem.kt:~125-230`; rendered by `QuickDetails`, `W/ui/components/QuickDetails.kt:36-64`): concatenated spans separated by a dot (`dot()` appends two spaces, U+2022, two spaces: `"  \u2022  "`, `Formatting.kt:243`) in this order:

1. `basic` by item type:
   - EPISODE: `seasonEpisode` ("S1 E3", or "S1 E3-E4" when `indexNumberEnd` is set; `season_episode_number[_range]`, `strings.xml:163-164`, `Formatting.kt:104-134`; the padded variants "S01E03" / "S01E03-E04" exist but are not used here; omitted if the season or episode number is null) then premiere date (localized medium date).
   - SEASON: "N episodes" (plural `episodes_count`) then production year.
   - SERIES: `seriesProductionYears` (`Formatting.kt:154-173`): needs `productionYear` (else omitted); status `Continuing` -> "YYYY - Present"; status `Ended` -> "YYYY - YYYY" only when the end-date year differs from `productionYear`; `Ended` with the same year, or any other status -> just "YYYY".
   - PHOTO: production year, else premiere `LocalDate`.
   - BOX_SET: production year, then "`{childCount} items`".
   - PROGRAM: channel name; if series: seasonEpisode + premiere date; else production year.
   - else: production year.
   Then ALWAYS appended: runtime (rounded to minutes, formatted "1h 42m", minutes-only "42m") if > 0; and `"%s left"` of remaining time (`data.timeRemaining`, rounded) if present. Rounding is to the nearest minute (+30 s then truncate, `Extensions.kt:231-232`); a remaining time under 30 s formats as "0s" (`duration_seconds`). `data.timeRemaining` = `runTimeTicks - playbackPositionTicks` only when `playbackPositionTicks > 0` and the result is > 0 (`Extensions.kt:243-251`; `Formatting.kt:320-331`).
2. `officialRating` (" . PG-13") if `DisplayToggle.OFFICIAL_RATING` enabled.
3. `communityRating` (" . 7.8" `%.1f` + star icon, color `FilledStarColor`) if `COMMUNITY_RATING` enabled.
4. `criticRating` (" . 91%" + tomato icon; fresh if >= 60 else rotten) if `CRITIC_RATING` enabled.
5. Tail: if `timeRemaining` != null -> `" . Ends at {now + remaining formatted}"` (the "now" comes from the 2-second `LocalClock`, so it ticks); else if `endsAt` != null -> `" . Ends at {endDate}"` (`R/values/strings.xml:46`).

`DisplayToggle` set (`InterfacePreferences.display_toggles`, default ALL three) is read from `LocalInterfaceCustomization.enabledDisplayToggles`.

Cross-fade/animation: none; header text swaps instantly on focus change.

### 4.3 Row types - complete list, API requests

`HomeRowConfig` is a sealed interface serialized as JSON with polymorphic discriminator key `"type"` (kotlinx `@SerialName`), 15 subtypes (`W/data/model/HomeRowConfig.kt:26-215`). `HomeDataService.fetchDataForRow` (`HomeDataService.kt:82-700`) loads a row and returns `HomeRowLoadingState.Success(title, items, viewOptions, rowType, showViewMore)`.

Global per-row parameters: `limit = homePagePreferences.max_items_per_row` (default 25, slider 5-50, `AppPreference.kt:~156-170`); `showViewMore = items.size >= limit` (except `CustomEndpoint` and `Suggestions` empty).

`maxDaysNextUp` defaults to -1 (no limit); the UI offers `[7,14,30,60,90,180,365]` days plus "No limit" (stored -1, slider index 0..7); `enableRewatchingNextUp` defaults to false; `clickToPlay` defaults to false (`AppPreference.kt:156-232`, `AppPreferencesSerializer.kt:83-90`). In `ContinueWatchingCombined`, items whose last-played lookup failed get a null timestamp, which sorts last under `sortedByDescending`; resume items use `userData.lastPlayedDate`; `getLastPlayed` is only called for next-up items with a `seriesId` (`LatestNextUpService.kt:134-165`). Genre card images (`getGenreImageMap`) are cached in memory for 2 h, max 8 (user, parent) keys, and the cache is only READ when `isRefresh` is true (it is always written) (`GenreCardGrid.kt:170-243`).

Item field sets (`W/ui/UiConstants.kt:55-92`, JSON `fields=` values):

- `SlimItemFields` = `Overview, SortName, MediaSourceCount, CanDelete`
- `HomeItemFields` = `Overview, CanDelete`
- `HomeItemFieldsBoxSets` = `HomeItemFields + ChildCount`
- `ProgramItemFields` = `Overview, Trickplay, SortName, Chapters, MediaSources, MediaSourceCount, CanDelete, PrimaryImageAspectRatio, ChannelInfo`
- `library.itemFields` = `HomeItemFieldsBoxSets` if the library is a BOXSETS collection folder, else `HomeItemFields` (`HomeDataService.kt:~740-750`).

All requests are authenticated (`Authorization: MediaBrowser Token=...` header via SDK). The current user id comes from the token/`userId` param.

| Config (`type` JSON) | Title (i18n key) | Request(s) (endpoint inferred from SDK method) | Notes |
|---|---|---|---|
| `ContinueWatching` | `continue_watching` "Continue watching" | `GET /UserItems/Resume?userId={uid}&fields=Overview,SortName,MediaSourceCount,CanDelete&limit={limit}&mediaTypes=Video&enableTotalRecordCount=false` (`excludeItemTypes` omitted because `includeEpisodes=true`) (`LatestNextUpService.getResume`, `:52-70`; `libraryApi.getResumeItems`) | `BaseItem(dto, useSeriesForPrimary = viewOptions.useSeries)` |
| `NextUp` | `next_up` "Next Up" | `GET /Shows/NextUp?userId&fields=Overview,SortName,MediaSourceCount,CanDelete&imageTypeLimit=1&limit&enableResumable=false&enableUserData=true&enableRewatching={prefs.enableRewatchingNextUp}&nextUpDateCutoff={now - maxDaysNextUp days, omitted if maxDays<=0}&enableTotalRecordCount=false` (`LatestNextUpService.getNextUp`, `:79-125`) | THEN client-side filter: drop episodes whose `seriesId` is in the user's removed-from-next-up map unless `userData.lastPlayedDate > removedAt` (if `lastPlayedDate` is null the item stays hidden) - see 5.7 |
| `ContinueWatchingCombined` (default) | `continue_watching` (row title) / `combine_continue_next` "Combine Continue Watching & Next Up" (in settings) | Both requests above (limit each), then `buildCombined` (`:134-168`): for each next-up item with a `seriesId`, fetch `datePlayedService.getLastPlayed(item)` (semaphore 3; one extra request per item, cached by `DatePlayedService`); resume items use `userData.lastPlayedDate`; result = `(resume + nextUp).sortedByDescending(lastPlayed)` then `.take(limit)`; `showViewMore = combined.size >= limit` | newest-watched first; "Applies to TV series only" |
| `RecentlyAdded(parentId)` | `recently_added_in` "Recently added in %1$s" (library name) / `recently_added` | `GET /Items/Latest?parentId={parentId}&fields={library.itemFields}&imageTypeLimit=1&groupItems=true&limit={limit}` (`isPlayed` unset => server honors user setting) (`libraryApi.getLatestMedia`, `:269-296`) | `groupItems=true` collapses episodes into season/series |
| `RecentlyReleased(parentId)` | `recently_released_in` "Recently released in %1$s" (lower-case "released") / `recently_released` "Recently Released" | `GET /Items?parentId&limit&sortBy=PremiereDate,SeriesSortName,AiredEpisodeOrder&sortOrder=Descending,Ascending,Descending&fields={itemFields}&recursive=true&maxPremiereDate={now}&isUnaired=false` (`:298-347`) | no `includeItemTypes` is sent (as coded) |
| `Genres(parentId)` | `genres_in` "Genres in %1$s" / `genres` | `GET /Genres?parentId={parentId}&userId={uid}&limit={limit}` (`genreApi.getGenres`), then for each genre (semaphore 4) `GET /Items?userId&parentId&recursive=true&limit=1&sortBy=Random&fields=Genres&imageTypes=Backdrop&imageTypeLimit=1&genreIds={genreId}&enableTotalRecordCount=false` and use that item's BACKDROP image URL as the genre card image (`getGenreImageMap`, `GenreCardGrid.kt:185-246`; cached per (user,parent); `useCache = isRefresh`) | click -> `FilteredCollection` (genre filter). default `viewOptions = genreDefault` (height 128dp, WIDE) |
| `Studios(parentId)` | `studios_in` "Studios in %1$s" / `studios` | `GET /Studios?parentId&userId&limit&includeItemTypes=Series` (`studioApi.getStudios`); image `GET /Items/{studioId}/Images/Thumb?tag={imageTags.Thumb}` | click -> `FilteredCollection` (studio filter). default `genreDefault` |
| `Favorite(kind)` | `favorite_items_title` "Favorite %s" with the type name (`formatTypeName`: Movies, TV Shows, Episodes, Videos, Playlists, People, Collections, Songs, Albums, Artists, ...) | `PERSON`: `GET /Persons?userId&limit&fields=Overview,CanDelete&isFavorite=true&enableImages=true&enableImageTypes=Primary`; `MUSIC_ARTIST`: `GET /Artists?userId&limit&fields=Overview,CanDelete&isFavorite=true`; else `GET /Items?userId&recursive=true&limit&fields={HomeItemFields (+ChildCount for BOX_SET)}&includeItemTypes={kind}&isFavorite=true` | |
| `Recordings` | `active_recordings` "Active Recordings" | `GET /LiveTv/Recordings?userId&isInProgress=true&fields=Overview,CanDelete&limit&enableImages=true&enableUserData=true&enableTotalRecordCount=false` | |
| `TvPrograms` | `watch_live` "Watch live" | `POST /LiveTv/Programs` body `GetProgramsDto{userId, fields=ProgramItemFields, limit, enableUserData=true, enableImages=true, enableImageTypes=[Primary,Logo], imageTypeLimit=1, isAiring=true, minEndDate=now+1min}` (`liveTvApi.getPrograms`) | default viewOptions `liveTvDefault` (96dp, WIDE, FIT) |
| `TvChannels` | `channels` "Channels" | `GET /LiveTv/Channels?userId&fields=Overview,CanDelete&limit&enableImages=true` | `liveTvDefault` |
| `Suggestions(parentId)` | `suggestions_for` "Suggestions for %1$s" | `GET /Items/{parentId}` (library) -> kind via `SuggestionsWorker.getTypeForCollection` (MOVIES->MOVIE, TVSHOWS->SERIES, else unsupported => Error row "Unsupported type ..."). Items come from a CACHE (`SuggestionsCache`, keyed user+parent+kind). If no cache: enqueue a one-time worker that runs the algorithm below and the row shows `Loading` until done; if empty -> Success(empty). Cached ids are resolved by `GET /Items?ids={ids}&fields=PrimaryImageAspectRatio,Overview` | algorithm (`SuggestionsWorker.fetchSuggestions`, `:~160-260`): history = `GET /Items?parentId&userId&includeItemTypes={EPISODE if series else kind}&recursive=true&isPlayed=true&sortBy=DatePlayed&limit=20&fields=Genres&enableTotalRecordCount=false&imageTypeLimit=0` -> distinct by (seriesId ?: id), take 3 as seeds; genres of seeds; three parallel pools: contextual (`sortBy=Random, isPlayed=false, genreIds=seedGenres, excludeItemIds=seedIds, limit=40% of N`), random (`Random, isPlayed=false, 30%`), fresh (`sortBy=DateCreated desc, isPlayed=false, 30%`); union -> distinct by id -> drop seeds -> shuffle -> take N (N = max_items_per_row). Also refreshed periodically every 12 h (flex 1 h, 15-min retry) by `SuggestionsSchedulerService` (Android WorkManager). A web port can compute on demand and cache in memory/localStorage. Details (`SuggestionsWorker.kt:176-336`): every pool request also sends `recursive=true`, `includeItemTypes=[kind]`, `enableTotalRecordCount=false`, `imageTypeLimit=0` (`fields=Genres` only on the history request); pool sizes are `(N*0.4).toInt()`, `(N*0.3).toInt()`, `(N*0.3).toInt()`, each coerced to >= 1; the contextual pool is skipped entirely when the seeds have no genres; the merge order is contextual + fresh + random before the shuffle; if the new id list equals the cached list the cache is not rewritten. `SuggestionService` (`:50-173`): with no cache, if the on-demand work failed or is not active the row is `Empty` (hidden); only RUNNING/ENQUEUED work yields `Loading`; cached ids resolve to `BaseItem` with `useSeries = (kind == SERIES)`. The periodic worker has an initial delay of 60 s + random 0-120 s (coerced to 60-180 s) and refreshes every supported view (`SuggestionsSchedulerService.kt:45, 101-118`). |
| `ByParent(parentId, recursive=false, sort?)` | name of the parent item (`GET /Items/{parentId}` `getItem(userId, itemId)` - a 404 here becomes an EMPTY row, i.e. hidden) | `GET /Items?userId&parentId&recursive={recursive}&limit&fields={itemFields}` plus `sortBy`/`sortOrder` when `sort` set: for `RANDOM` -> `sortBy=SortName,Random`, `sortOrder=Ascending,{dir}`; otherwise `sortBy={sort},SortName` (SortName omitted if sort already SortName) and `sortOrder={dir},Ascending` (second omitted likewise) (`:349-419`) | used for Collections (boxsets) and Playlists rows ("Add row > Collection / Playlist") |
| `GetItems(name, filter: HomeGetItemsFilter)` | `name` | `GET /Items` with `filter.asGetItemsRequest()` + `userId, limit, fields=HomeItemFieldsBoxSets`. Mapped filter fields: `sortBy, sortOrder, ids, minCommunityRating, minCriticRating, recursive, searchTerm, parentId, includeItemTypes, isFavorite, isPlayed, officialRatings, tags, years, personIds, minOfficialRating, hasOfficialRating, studioIds, genreIds`. NOTE: `minPremiereDate`/`maxPremiereDate` exist on `HomeGetItemsFilter` but are NOT forwarded by `asGetItemsRequest()` (`HomeRowConfig.kt:305-326`) | arbitrary rows from server plugin / hand-edited JSON |
| `CustomEndpoint(endpoint, title, headers?, query?)` | `title` | `GET {baseUrl}{endpoint}?userId={uid}&{query...}` with extra `headers`; `endpoint` must be a RELATIVE path (absolute => IllegalArgumentException). Response parsed as `BaseItemDtoQueryResult` (`Items[]`). Non-2xx => `InvalidStatusException` => Error row (`:688-760`) | for third-party plugins (e.g. home-sections); `headers`/`query` are lists of `{key,value}` (XML friendly) |

Defaults for `showViewMore`: `CustomEndpoint` rows never set it, so they get the default `true` in `Success(...)` (`LoadingState.kt:65-71`) even without a limit; effect: a "View more" card appears at the end.

Row error handling in `HomeViewModel.loadHomeRows` (`HomeViewModel.kt:186-228`): `InvalidStatusException` with status 404 -> treated as success-with-no-items (row hidden); any other HTTP/exception -> `HomeRowLoadingState.Error(title, exception)` displayed as a focusable row with the error text in `error` color; the rest of the page still renders.

### 4.4 Default row set and order

The default row set is only used when no stored settings are found for the user (resolution order and fallbacks: 5.4 "Source resolution"). `HomeSettingsService.createDefault` (`HomeSettingsService.kt:277-325`; it uses the unfiltered `getAllUserLibraries` if there is no current user for that id):

1. `ContinueWatchingCombined()` (title "Combine Continue Watching & Next Up" in settings; row heading "Continue watching").
2. For every library the user has NOT unpinned from the drawer (`getFilteredUserLibraries`: all libraries minus those with `UNPINNED` pin) in server order:
   - Live TV library -> `TvPrograms()` (title "Watch live")
   - everything else -> `RecentlyAdded(parentId, viewOptions = viewOptionsForCollectionType(collectionType))` (title "Recently added in {library name}").

Per collection type defaults (`viewOptionsForCollectionType`, `HomeSettingsService.kt:668-707`): MUSIC -> height 128, SQUARE; PHOTOS/HOMEVIDEOS/MUSICVIDEOS/TRAILERS -> height 128, WIDE; LIVETV -> `liveTvDefault`; MOVIES/TVSHOWS/BOXSETS/BOOKS/PLAYLISTS/FOLDERS/UNKNOWN/null -> `HomeRowViewOptions()` default (172, TALL).

`HomeRowViewOptions` defaults (`HomeRowConfig.kt:250-276`): `heightDp=172, spacing=16, contentScale=FILL, aspectRatio=TALL, imageType=PRIMARY, showTitles=false, useSeries=true, episodeContentScale=FILL, episodeAspectRatio=TALL, episodeImageType=PRIMARY`. `genreDefault`: `heightDp=128, aspectRatio=WIDE` (rest default). `liveTvDefault`: `heightDp=96, aspectRatio=WIDE, contentScale=FIT`.

The default is NOT persisted; it is regenerated each session until the user saves (see 5.5).

### 4.5 Row/card sizing options and card rendering

View options and what they control (`HomeRowViewOptions`, `HomePageCardContent`, `HomePage.kt:637-737`):

| Option | Values | Effect |
|---|---|---|
| `heightDp` | slider 64..236 step 4 (`ViewOptionsCardHeight`: min 64, max 172+64) | card height in dp. Width = `height * aspectRatio` |
| `spacing` | slider 0..32 step 2 | gap between cards AND LazyRow horizontal contentPadding |
| `aspectRatio` | `TALL`=2/3 (0.667), `WIDE`=16/9, `FOUR_THREE`=4/3, `SQUARE`=1 (`UiConstants.kt:103-119`) | |
| `imageType` | `PRIMARY`, `THUMB` (selecting THUMB also sets aspectRatio WIDE; PRIMARY sets TALL) | which Jellyfin image |
| `contentScale` | `FIT, NONE, CROP, FILL, Fill_WIDTH, FILL_HEIGHT` (proto `PrefContentScale`, `P:18-25`; note the mixed-case `Fill_WIDTH` spelling, which is also the name in saved home-settings JSON, so a web reader must accept `"Fill_WIDTH"`; Compose `Fit, None, Crop, FillBounds, FillWidth, FillHeight`) | CSS `object-fit`: fit=contain, none=none, crop=cover, fill=fill, fill-width/height need custom |
| `showTitles` | bool | cards render as `BannerCardWithTitle` (title line + subtitle line under the card) vs image-only `BannerCard` |
| `useSeries` | bool ("Use series image") | for EPISODE/SEASON items use the series' Primary/Thumb image instead of the episode's |
| `episodeImageType/AspectRatio/ContentScale` | same enums | applied only to items of type EPISODE (Continue watching / Next up rows expose these in the "For episodes" group); the episode image type setter also forces `episodeAspectRatio` (THUMB -> WIDE, PRIMARY -> TALL) (`HomeRowSettings.kt:373-381`) |

Card element sizes:

- `BannerCard`: `Card(size = width x height)` where width = `cardHeight * aspectRatio` (`BannerCard.kt:~85`). `BannerCardWithTitle` width = `cardHeight * max(aspectRatio, 2/3)`. Examples at defaults: TALL 172 -> 114.7 x 172; WIDE 128 -> 227.6 x 128; WIDE 96 -> 170.7 x 96; SQUARE 128 -> 128 x 128; "Use thumb images" preset (height 128, WIDE) -> 227.6 x 128 (the preset sets height 128 = `Cards.HEIGHT_EPISODE`, spacing 20, THUMB, WIDE, FIT, and the same for the episode fields; `HomeRowSettings.kt:99-112`).
- Image URL: `item.imageUrlOverride ?: ImageUrlService.getItemImageUrl(item, imageType, fillHeight = heightPx, useSeriesForPrimary)` -> `GET /Items/{id}/Images/{type}?fillHeight={px}&quality=96&tag=...` (`QUALITY = 96`, `ImageUrlService.kt:284`; `fillHeight = cardHeight.roundToPx()` = device pixels (dp x density), no width param; `BannerCard.kt:75-99`). THUMB chain (`ImageUrlService.kt:26-193`), first match wins: (1) `useSeries` && `parentThumbItemId != null` && type EPISODE/SEASON -> parent Thumb with `parentThumbImageTag`; (2) else `useSeries` && `parentBackdropItemId != null` && EPISODE/SEASON -> parent BACKDROP (first `parentBackdropImageTags` entry); (3) else SEASON with `parentThumbItemId` and no own Thumb -> parent Thumb (does not need `useSeries`); (4) else `useSeries` && no `parentThumbItemId` && EPISODE && no own Thumb -> the episode's own Primary; (5) else no own Thumb but a backdrop exists -> own first Backdrop; (6) else own Thumb (`imageTags[Thumb]`). PRIMARY (and BANNER): `useSeries` && `seriesId` && EPISODE/SEASON -> series image (the series Primary tag `seriesPrimaryImageTag` is passed only when `imageType == PRIMARY`); else SEASON without an own image of that type -> series; else own image with `imageTags[type]`.
- No image / load error: centered `titleMedium` text of the name (`onSurfaceVariant`), 16dp padding.
- Overlays: top-end row (padding 4dp, spacing 4dp): watched check (`WatchedIcon`, 24dp circle with check, shown only if `played && (playPercent <= 0 || >= 100)`) and "corner text" pill (`TransparentBlack50` background, 25%-rounded, bodySmall, 4dp padding): for EPISODE it is `E{indexNumber}` (`episode_number_short` "E%1$d"; `episodeUnplayedCornerText`, `BaseItem.kt:123-126`; omitted when `indexNumber` is null); for SERIES/SEASON/BOX_SET it is the unplayed count (`abbreviateNumber`, only if > 0). Top-start: favorite heart (FA U+F004, 16sp, `holo_red_light` #FF4444, padding 8dp). Bottom-start: progress bar `Cards.playedPercentHeight = 6dp` tall, width `playedPercentage%`, color `tertiary`, shown only when `0 < percent < 100`.
- Title block (when `showTitles`): `Column(spacing 4dp)`: card, then `SlidingCardText` containing title (`bodyLarge`, SemiBold, centered, 1 line, marquee after 500ms focus) and subtitle (`bodyMedium`, centered, 1 line). Gap between card and title: 12dp unfocused, 4dp focused (animated; the card scales up so the title slides down). Title = `item.title` (series name for episodes); subtitle = `item.subtitle`: EPISODE "S1 E3 - Episode name"; SERIES production years; AUDIO "Album - Artists"; MUSIC_ALBUM "AlbumArtist - Year"; else production year.
- No-title card name fallback: `data.seriesName ?: name`.
- Card focus visuals: tv-material3 `Card` default: focused scale 1.1 + 2dp border in `border` color + glow (lib, unverified). Pressed scale .95 (lib, unverified).
- Genre card (`GenreCard.kt`): rounded-8dp box, aspect 16:9, height = viewOptions.heightDp; image at 75% alpha, overlay = deterministic hue from genre id @ 60% alpha, centered name (`titleLarge`, Bold, `onSurfaceVariant`, 16dp padding). Studio card (`StudioCard.kt:67-124`): unlike the Genre card, the colored overlay and the name are drawn ONLY when there is no image or the image failed to load. When the Thumb loads, the card is just the image (alpha .75, `FillBounds`, 16:9, 8dp clip) with no overlay and no name; the fallback is a box tinted with the id hue @ 40% alpha with the centered name (`titleLarge`, Bold, `onSurfaceVariant`, 16dp padding).
- "View more" card (`ViewMoreCard.kt`): same height/aspect as row cards (`episodeAspectRatio` if the last item is an EPISODE), container `surfaceColorAtElevation(1.dp)`, centered right-arrow icon 66% of card size in `onSurface`; label "View more" (bodyMedium, SemiBold) under it only if `showTitles`. Click -> `MoreHomeRow(title, rowConfig, items.size)`. Appears when `showViewMore && row.showViewMore`.
- Placeholder rows: `Loading`/`Pending` -> `FocusableItemRow(title, subtitle="Loading…")`; `Error` -> subtitle = message in `error` color; empty success -> row not rendered (in the Home Settings preview `showEmptyRows=true` renders "No results"). The placeholder is a `focusable()` block (so D-pad can pass through it) with a 25%-alpha `border` highlight and 8dp rounded corners when focused, padding 8dp (`W/ui/components/FocusableItemRow.kt`).

### 4.6 Loading and refresh behavior

State: `HomeState(loadingState, refreshState, homeRows, settings)` (`HomeViewModel.kt:354-370`).

Rendering of `loadingState` (`HomePage.kt:112-132`): `Error` -> `ErrorMessage` (full area: red title "An error occurred! Press the button to send logs to your server.", "Send app logs to current server" button, message/exception chain); `Loading`/`Pending` -> `LoadingPage` (centered 48dp spinner, color `border`); `Success` -> content.

Load pipeline (`HomeViewModel.loadHomeRows`, `:143-250`):

1. Fetch libraries via `navDrawerService.getAllUserLibraries` (for row titles/item fields).
2. `refresh = state.loadingState == Success && state.settings == settings` (same settings object as last successful load).
3. If NOT refresh: `loadingState = Loading`, rows = N x `Pending(empty title)`. If refresh: keep the current rows visible, `loadingState` stays Success, `refreshState = Loading` (shows the 40dp top-right spinner).
4. Fetch all rows concurrently, at most 4 at a time (`Semaphore(4)`).
5. Non-refresh: wait for ALL rows (`awaitAll`) then show everything at once. Refresh: replace each row in place as it finishes (`select { onAwait }`), so rows update progressively without flashing to a spinner.
6. Errors outside row level: if a page already loaded -> toast `"Error refreshing home: {message}"` + `refreshState = Error`; else `loadingState = Error`.

Reload triggers:

| Trigger | Mechanism |
|---|---|
| Settings or user DTO changes | `serverRepository.currentUserDtoFlow` combined with `homeSettingsService.currentSettings`, `collectLatest`: cancels in-flight load and reloads. Resets to EMPTY if user ids mismatch / settings empty / user changed (`HomeViewModel.kt:78-112`) |
| Every time the Home page becomes visible/started | `LifecycleStartEffect -> viewModel.init()` (`HomePage.kt:106-109`): reloads only if the previous load job has finished (`dataLoadingJob?.isActive == false`; if the job never started, nothing - the settings-flow path starts it). In practice: returning from any detail page/back, returning to the app (screen on), after playback => refresh-in-place |
| Mark watched/unwatched, favorite toggle from the context menu | `FavoriteWatchManager` then `init()` (`HomeViewModel.kt:252-270`) |
| Remove series from Next Up | `latestNextUpService.removeFromNextUp` then `init()` |
| `Home` clicked in drawer while already on Home | `reloadHome()` -> new `Home(id+1)` entry => brand-new `HomeViewModel` => full loading page |
| Switching user | new Home id (`reloadHome` in `SwitchUserViewModel.trySwitchUser`) and `UserSwitchListener` clears settings -> reload |
| App resume | `MainActivity.onResume -> updateUserDto`: reloads through the settings flow only if the fetched `UserDto` differs from the stored one (a `StateFlow` drops equal values, see 1.3). The visible refresh on return comes from the `LifecycleStartEffect -> init()` row above, which is skipped while a load job is still active |
| Websocket `UserUpdated` | `serverRepository.updateUserDto(dto)` (only if same user) -> reload only if the new `ServerUserConfig` differs from the stored one |
| Delete item (long-press menu) | removes the card locally at `(row,column)` without refetch (`HomeViewModel.deleteItem`, `:272-295`) |

`DatePlayedService.invalidateAll()` is called in the Home VM init and on current user change (used by combined row).

There is NO pull-to-refresh and NO polling timer.

### 4.7 Focus / initial position / scroll

- `position: RowColumn` is `rememberSaveable` (survives navigation to a detail page and back; restored on Back) (`W/ui/Extensions.kt:335-349`).
- On first composition with rows: if `position.row >= 0` focus that row (coerced into range) - then each `ItemRow` restores its own last column via `focusRestorer(firstFocus)`/`rememberInt()` position. If `position.row < 0` (fresh): wait for the first row that is `Success` with items, focus it, `delay(50)`, `scrollToItem(thatRow)` (`HomePage.kt:311-336`).
- Focus enters rows via `focusProperties.onEnter` on the column -> `rowFocusRequesters[currentPosition.row]`, i.e. the row of the remembered position (the last focused row, not necessarily the last row of the list); if `position.row` is -1 nothing is requested (`HomePage.kt:345-348`) and each `ItemRow` enters at its remembered card.
- Left from the first card -> drawer (see 3.6). Up from the first row -> header is not focusable (nothing).
- Header updates + backdrop update on every focus change: `LaunchedEffect(focusedItem) { onUpdateBackdrop(item) }` -> `BackdropService.submit` (3.9).

### 4.8 Click / long-press / media keys on cards

| Input | Action | Source |
|---|---|---|
| Click (Enter/DPAD-center) on item in `ContinueWatching`, `NextUp` or `ContinueWatchingCombined` row AND pref `clickToPlay` (default false; "Continue watching/Next up click behavior": "Show details on click" / "Play on click") | `navigateTo(Playback(item))` (resumes at `userData.playbackPositionTicks`) | `HomePage.kt:136-147` |
| Click otherwise | `navigateTo(item.destination())` (2.3) | |
| Click "View more" card | `navigateTo(MoreHomeRow(row.title, row.rowType, row.items.size))` | `HomePage.kt:~190-198` |
| Long-press (hold Enter) | opens context menu dialog (below) with `position` set to that card | `HomePage.kt:149-212` |
| Media Play / Play-Pause key released while a card with a playable item type is focused | `navigateTo(Playback(item))` | `HomePage.kt:448-470` + `isPlayKeyUp` (`W/ui/playback/KeyIdentifier.kt:84`) |
| `type.playable` set | EPISODE, MOVIE, MUSIC_VIDEO, TRAILER, VIDEO, LIVE_TV_CHANNEL/PROGRAM, PROGRAM, RECORDING, TV_CHANNEL, TV_PROGRAM (`PlaybackConstants.kt:39-59`) |

Context menu (`ContextMenuDialog` -> `ContextMenu.ForBaseItem`, built in `W/ui/components/ContextMenu.kt:buildContextMenuItems`), constructed on Home with `showGoTo=true, showStreamChoices=false, fromLongClick=true`. Dialog: platform dialog, background `surfaceColorAtElevation(1dp)`, rounded 28dp, padding 24dp, title = item title (`titleLarge`), items list (ListItems, icon + text). Because opened from long press, items are disabled for 1000 ms (or until the Enter key is released) to avoid the trailing key-up clicking the first item (`Dialogs.kt:206-266`). Items in order, with their conditions:

| # | Label (string) | Condition | Action |
|---|---|---|---|
| 1 | "Go To" (arrow) | `showGoTo` and type != AUDIO | `navigateTo(item.destination())` |
| 2 | "Resume" and "Restart"; or "Play" | type in `supportedPlayableTypes` (MOVIE, EPISODE, VIDEO, MUSIC_VIDEO, TV_CHANNEL, TV_PROGRAM, RECORDING, SEASON, SERIES, BOX_SET, PLAYLIST) | Resume: `Playback(id, playbackPosition ms)` (only if position > 0); Restart: `Playback(id, 0)`; Play: `Playback(id, 0)` |
| 3 | "Shuffle" (FA shuffle) | type in SEASON, SERIES, BOX_SET, PLAYLIST | `navigateTo(PlaybackList(itemId, shuffle=true))` |
| 4 | "Add to queue" | MUSIC_ALBUM / AUDIO | default handler is a NO-OP on Home (action not wired in `HomePage.kt`) |
| 5 | "Add to playlist" (FA list-ul) | always | loads playlists, shows playlist picker (`PlaylistDialog`: pick existing playlist or create new with a name) -> `addToPlaylist` / `createPlaylistAndAddItem` |
| 6 | "Delete" (red trash) | `canDelete` = pref `interfacePreferences.enableMediaManagement` (default false) AND `item.data.canDelete` AND (for RECORDING also user policy `enableLiveTvManagement`) | confirm dialog -> delete item via `MediaManagementService` (`DELETE /Items/{id}`), card removed locally |
| 7 | "Remove from continue watching" (FA eye) | row is ContinueWatching/Combined AND `!played` AND `playbackPosition > 0` | `setWatched(id, false)` (mark unplayed => clears resume) then home refresh |
| 8 | "Remove series from next up" (FA tag) | row is NextUp/Combined AND type == EPISODE AND `seriesId != null` | `removeFromNextUp(item)` (5.7) then refresh |
| 9 | "Mark as watched" / "Mark as unwatched" (FA eye-slash / eye) | always | `POST /UserPlayedItems/{id}` / `DELETE /UserPlayedItems/{id}` (`userDataApi.markPlayedItem/markUnplayedItem`) then refresh |
| 10 | "Favorite" / "Unfavorite" (FA heart, red when favorited) | always | `POST` / `DELETE /UserFavoriteItems/{id}` then refresh |
| 11 | "Go to album" / "Go to artist" | item has `albumId` / `artistItems` | `MediaItem(albumId, MUSIC_ALBUM)` / `MediaItem(artistId, MUSIC_ARTIST)` |
| 12 | "Go to series" | item has `seriesId` | `MediaItem(seriesId, SERIES)` |
| 13 | "Media Information" | `item.data.mediaSources` non-empty: true for items of `TvPrograms` rows when the server returns them (their `ProgramItemFields` = `DetailItemFields` + `ChannelInfo` request `MediaSources`, `UiConstants.kt:50-60, 91`), false for rows using `SlimItemFields` / `HomeItemFields` | `ItemDetailsDialog` |
| 14 | "Play with" (opens submenu: player backends [ExoPlayer, MPV, External player] + "Transcoding") | type in `supportedPlayableTypes` | `Playback(itemId, resumeMs, forceTranscoding, backend)` (Android players; web needs its own mapping) |
| 15 | "Send media info log to server" | same `mediaSources` non-empty condition as row 13 | `serverReportService.sendMediaReportFor(id)` |

Order note (`ContextMenu.kt:520-650`): "Go to album", "Go to artist" (first `artistItems` entry) and "Go to series" come AFTER "Favorite" and BEFORE "Media Information"; then "Play with", then "Send media info log". `PROGRAM` is not in `supportedPlayableTypes`, so cards of `TvPrograms` rows get no Play/Resume/Play with entries (only Go To, Add to playlist, Mark watched, Favorite, ...). "Add to queue" is a no-op default on Home.

Strings: `R/values/strings.xml` (`go_to` 57, `resume` 111, `restart` 110, `play` 91, `shuffle` 139, `add_to_playlist` 188, `delete` 37, `remove_continue_watching` 833, `remove_next_up` 834, `mark_watched` 72, `mark_unwatched` 71, `add_favorite` 7 "Favorite", `remove_favorite` 109 "Unfavorite", `go_to_series` 56, `media_information` 184, `play_with` 850).

### 4.9 Home page data in the shell

`HomeViewModel` also exposes `serverReportService`, `navigationManager`. It is NOT recreated on back-navigation (the stack entry persists), only on `reloadHome()`.

---------------------------------------------------------------------------------------------------

## 5. Home customization

Entry: Settings (basic) > "Customize home page" (`AppDestinationPreference`, `AppPreference.kt:~785-789`, summary "Choose rows and images on the home page") -> `Destination.HomeSettings` (full screen). Files `W/ui/main/settings/*`.

### 5.1 Screen layout (`HomeSettingsPage.kt:68-263`)

```
+------------------- full screen (HomeSettings, no drawer) -------------------------------+
| +----- 360dp settings panel -----+ 8dp |  Live PREVIEW of the home rows                 |
| | surface @ elevation 1dp        |     |  (same HomePageContent, takeFocus=false,       |
| | (inner NavDisplay, 8dp padded) |     |   showEmptyRows=true, showViewMore=false,      |
| |  - RowList (root)              |     |   header = normal HomePageHeader of focused    |
| |  - AddRow / ChooseRowType      |     |   card; clock hidden)                          |
| |  - RowSettings(rowId)          |     |  fills remaining width, weight 1               |
| |  - ChooseFavorite              |     |                                                |
| |  - GlobalSettings              |     |                                                |
| |  - SourceSettings              |     |                                                |
| |  - Presets                     |     |                                                |
| +--------------------------------+     |                                                |
+----------------------------------------------------------------------------------------+
```

`val settingsWidth = 360.dp` (`HomeSettingsPage.kt:~59`). The right side is a live preview using the REAL data (limit 8 items/row, `HomeSettingsViewModel.fetchRowData` `:147-192`, 4 concurrent). Selecting a row in the list scrolls the preview to that row, moves the preview focus position there and sets the backdrop to that row's first item (this logic lives in `HomeSettingsPage.kt:133-147`, not in the ViewModel). Any change that affects data re-fetches all rows (`fetchRowData`); view-option changes only re-style existing data (except changing `useSeries`, which refetches).

The preview is inert: `onClickItem`, `onLongClickItem` and `onClickPlay` are no-ops, so cards do nothing (`HomeSettingsPage.kt:350-369`). While `loadingState` is Pending/Loading a 40dp spinner appears top-end (padding 20dp, since the clock is hidden; `HomePage.kt:520-536`). Empty rows are shown with subtitle "No results", loading rows with "Loading…", errored rows with the error message (`HomePage.kt:380-415, 477-500`). Row cards use each row's own `viewOptions`. The preview honors `interfacePreferences.showLogos` for the header. After each `fetchRowData` the preview backdrop is set from the first non-empty row's first item (`HomeSettingsViewModel.kt:178-187`).

Inner navigation: `HomeSettingsDestination`: `RowList, AddRow, ChooseRowType(library), RowSettings(rowId), ChooseFavorite, ChooseDiscover (TODO, disabled: `discoverEnabled = false`), GlobalSettings, SourceSettings, Presets` (`HomeSettingsDestination.kt`).

### 5.2 Pages

**RowList** (`HomeSettingsRowList.kt`): title "Customize home page" (titleLarge). List:
1. "Add row" (+ icon) -> AddRow.
2. "Source" (hard-coded English headline literal, not a string resource; FA download U+F019) with supporting text = current source label by `HomePageSettingsSource` (`HomeSettingsService.kt:707-716`, `R/values/strings.xml:171, 982-986`): `UNSET` -> "Unknown" (`R.string.unknown`), `LOCAL` -> "Device specific", `SERVER_PROFILE` -> "Server user profile", `PLUGIN` -> "Server default", `DEFAULT` -> "Default", `WEB_CONFIG` -> "User web client" -> SourceSettings.
3. "Settings" (gear) -> GlobalSettings.
4. "Display presets" (FA sliders U+F1DE; subtitle "Built-in presets to quickly style all rows") -> Presets.
5. Divider + title "Home rows (N)".
6. One entry per row: row title (button, opens RowSettings) + three small buttons: up (FA caret-up), down (FA caret-down) - disabled at ends - and delete (trash) - disabled when only 1 row remains. Min row height 40dp, max 88dp, 16dp spacing, buttons spaced 4dp. Moves swap the entry in both `rows` and `rowData`; delete removes both (no confirm).

**AddRow** (`HomeSettingsAddRow.kt`) sections:
- "Continue watching", "Next Up", "Combine Continue Watching & Next Up" -> add immediately (`MetaRowType`).
- Divider + "Library": one item per library (all libraries returned by `getAllUserLibraries`, including unpinned ones) -> ChooseRowType.
- Divider + "More": "Favorites" (-> ChooseFavorite), "Collection" (opens `SearchForDialog` for BOX_SET), "Playlist" (SearchForDialog for PLAYLIST); "Discover" only if `discoverEnabled` (never, hard-coded false).
- After adding, the inner stack is reset to the root and the preview scrolls to the last row.

**ChooseRowType(library)** (`HomeLibraryRowTypeList.kt:90-135` `getSupportedRowTypes`): title "Add row for {library}":

| Library kind | Offered row types |
|---|---|
| Live TV recording folder | Recently Recorded (`RecentlyAdded(library.itemId)`), Genres |
| LIVETV | Channels (`TvChannels`), Watch live (`TvPrograms`) |
| TVSHOWS | Recently added, Recently Released, Suggestions, Genres, Studios |
| MOVIES (the only type that reaches the `supportsSuggestions` branch: `getTypeForCollection` is non-null only for MOVIES -> MOVIE and TVSHOWS -> SERIES, `SuggestionsWorker.kt:361-366`) | Recently added, Recently Released, Suggestions, Genres |
| BOXSETS | Recently added, Recently Released, Genres, Collection (search dialog) |
| PLAYLISTS | Recently added, Recently Released, Genres, Playlist (search dialog) |
| other | Recently added, Recently Released, Genres |

Branch order in `getSupportedRowTypes` (`HomeLibraryRowTypeList.kt:90-135`): recording folder, LIVETV, TVSHOWS, `supportsSuggestions` (MOVIES only), BOXSETS, PLAYLISTS, else. BOXSETS, PLAYLISTS and every other type never offer Suggestions.

`addRow(library,type)` creates configs (`HomeSettingsViewModel.kt:296-413`): RecentlyAdded/RecentlyReleased/Suggestions use `viewOptionsForCollectionType(...)`, Genres/Studios use `genreDefault`, TvChannels `liveTvDefault`, TvPrograms default of its class. Collection/Playlist -> `ByParent(parentId=item.id, recursive=false)` titled with the item name (`addRow(type, parent)`, `:442-465`) after the user picks an item in `SearchForDialog` (`W/ui/search/SearchForDialog.kt:60-275, 281-300`): a `BasicDialog` (elevation 3dp, 80% width, 66% height, padding 8dp) titled "Search {Collections|Playlists}" (`search_for` = "Search %s"), with a voice-search button and a text box that is read-only until activated (Enter / DPAD-center key-up). The search is debounced 750 ms (`delay(750)` in a `LaunchedEffect(query)`, `:91-96`); Search / voice results fire immediately. Query (`SearchForViewModel.kt:44-120`): `GET /Items?userId&searchTerm=<q>&includeItemTypes=[BoxSet|Playlist]&recursive=true&fields=SlimItemFields`, paged. A first row "Results" shows the matches (empty query or no matches -> "No results", in progress -> "Searching…"); a second row "Suggestions" shows the 25 most recent items of that type, loaded when the dialog opens (`includeItemTypes=[type]`, `recursive=true`, `sortBy=DateLastContentAdded` descending, `limit=25`, `fields=SlimItemFields`). Cards are `SeasonCard` at episode height (128dp).

**ChooseFavorite** (`HomeSettingsFavoriteList.kt`): title "Add row for Favorites"; options = `state.libraries.possibleFavoriteTypes(sort=true)`: the distinct item kinds implied by the user's libraries (`collectionType.baseItemKinds`) filtered to `favoriteOptions = [MOVIE, SERIES, SEASON, EPISODE, BOX_SET, PERSON, TV_CHANNEL, MUSIC_ALBUM, MUSIC_ARTIST, AUDIO, MUSIC_VIDEO, PLAYLIST, VIDEO, PHOTO, PHOTO_ALBUM]` (`FavoritesViewModel.kt:770-814`), plus PERSON always, in that order. New row: `Favorite(kind, viewOptions = HomeRowPresets.WholphinDefault.getByItemType(kind))` titled "Favorite %s" (`favorite_items_title`, `R/values/strings.xml:210`) with the kind's `formatTypeName` (`HomeSettingsViewModel.kt:415-432`). Labels (`Formatting.kt:276-306`): MOVIE "Movies", SERIES "TV Shows", SEASON "Seasons", EPISODE "Episodes", BOX_SET "Collections", PERSON "People", TV_CHANNEL "Channels", MUSIC_ALBUM "Albums", MUSIC_ARTIST "Artists", AUDIO "Songs", MUSIC_VIDEO "Music videos", PLAYLIST "Playlists", VIDEO "Videos", PHOTO "Photos", PHOTO_ALBUM "Photo albums". `collectionType.baseItemKinds` (`CollectionFolderGrid.kt:190-251`): MOVIES -> [MOVIE]; TVSHOWS -> [SERIES, SEASON, EPISODE]; PHOTOS and HOMEVIDEOS -> [VIDEO, PHOTO, PHOTO_ALBUM]; MUSIC -> [AUDIO, MUSIC_ARTIST, MUSIC_ALBUM]; MUSICVIDEOS -> [MUSIC_VIDEO]; BOXSETS -> [BOX_SET]; PLAYLISTS -> [PLAYLIST]; LIVETV -> channel and program kinds, of which only TV_CHANNEL survives the `favoriteOptions` filter; TRAILERS / BOOKS / FOLDERS map to kinds outside `favoriteOptions`; UNKNOWN -> none.

`HomeRowPresets.getByItemType` (`HomeRowPresets.kt:37-104`), used for new Favorite rows and for applying a preset to Favorite rows: MOVIE, BOX_SET, PERSON and any kind not listed -> `movieLibrary`; SERIES, SEASON -> `tvLibrary`; EPISODE -> `continueWatching`; VIDEO, MUSIC_VIDEO, PHOTO, PHOTO_ALBUM -> `videoLibrary` (not `photoLibrary`); PLAYLIST -> `playlist`; MUSIC_ARTIST, MUSIC_ALBUM, AUDIO -> `musicLibrary`; TV_CHANNEL, LIVE_TV_CHANNEL, PROGRAM, TV_PROGRAM, LIVE_TV_PROGRAM -> `liveTv`; GENRE, MUSIC_GENRE, STUDIO -> `genreDefault.copy(heightDp = genreSize)`. `getByCollectionType` maps PLAYLISTS, BOOKS, FOLDERS and UNKNOWN to a plain `HomeRowViewOptions()` (not the playlist preset).

**RowSettings(rowId)** (`HomeRowSettings.kt`): title = row title; groups of preferences driving `HomeRowViewOptions`:

| Row kind | Groups |
|---|---|
| `ContinueWatching`, `ContinueWatchingCombined` | "General": Height, Spacing, Show titles, Image type, Aspect Ratio, Content scale. "For episodes": Use series image, Image type, Aspect Ratio, Content scale (episode-specific). "More": Use thumb images, Reset. |
| `Genres` | single group: Height, Spacing, Reset (reset to `genreDefault`) |
| all others (incl. NextUp, RecentlyAdded, Favorite, ...) | "General": Height, Spacing, Show titles, Image type, Aspect Ratio, Content scale, Use series image. "More": Use thumb images, Reset |
| extra rows appended at bottom | `Combined`: "Split into separate rows"; `ContinueWatching`/`NextUp`: "Combine Continue Watching & Next Up"; `ByParent`: "Sort" list item opening a sort dialog (`BoxSetSortOptions`; selecting the current sort flips direction; selecting "default" clears the sort) |

Preference semantics (`Options`, `HomeRowSettings.kt:~210-370`): Height slider 64-236 step 4; Spacing slider 0-32 step 2; Show titles switch; Image type {Primary, Thumb} (choosing one also sets aspect ratio TALL/WIDE respectively); Aspect ratio {Poster (2:3), 16:9, 4:3, Square (1:1)}; Content scale {Fit, None, Crop, Fill, Fill width, Fill height}; "Use thumb images" action sets `height=128, spacing=20, imageType=THUMB, aspectRatio=WIDE, contentScale=FIT` and the same for episode fields; "Reset" restores `HomeRowViewOptions()` (or `genreDefault` for Genres). "Apply to all rows" exists as code but is commented out of the list.

RowSettings quirks (`HomeRowSettings.kt:72-78, 161-216, 218-257, 281-290, 347-390, 392-464`, `HomeSettingsPage.kt:210-232`): group subtitles are shown only when there is more than one group, so the single-group Genres page has no subtitle. Only `Genres` uses `GENRE_OPTIONS` and the `genreDefault` reset; `Studios` rows get the full `OPTIONS` list and their Reset restores plain `HomeRowViewOptions()` (172dp TALL), not `genreDefault`. Changing `episodeImageType` also sets `episodeAspectRatio` (PRIMARY -> TALL, THUMB -> WIDE), like the main Image type. The content-scale preference label is "Default content scale" (`global_content_scale`, `R/values/strings.xml:338`), not "Content scale". The ByParent Sort dialog is a start-gravity `BasicDialog` (elevation 5dp), 320dp wide, listing `BoxSetSortOptions`, with FA caret-up / caret-down on the active one.
Combine action: replaces the clicked row with `ContinueWatchingCombined(viewOptions of clicked row)` and removes every other `ContinueWatching`/`NextUp` row; Split: replaces with `ContinueWatching(viewOptions)` and inserts `NextUp(viewOptions)` after it (`HomeSettingsViewModel.kt:842-910`). After either, RowSettings is popped.

**GlobalSettings** (`HomeSettingsGlobal.kt`) - these are app-level (not per row, not part of the saved row JSON) and persist immediately to the AppPreferences DataStore:
1. "Max items on home page rows" slider 5-50, default 25 (`homePagePreferences.max_items_per_row`).
2. "Enable rewatching in next up" switch, default off (`enable_rewatching_next_up`).
3. "Max days in Next Up" slider over options `[7,14,30,60,90,180,365, No limit]`, default No limit (-1) (`max_days_next_up`, `AppPreference.kt:170-210`).
4. "Continue watching/Next up click behavior" choice {Show details on click, Play on click}, default details (`click_to_play`).
5. Divider; "Increase size for all cards" / "Decrease size for all cards": every row's `heightDp += 4*(+1/-1)` (`resizeCards`, no clamping).
6. Divider; "View series removed from next up" -> dialog (5.7).

**SourceSettings** (`HomeSettingsSourcePage.kt:25-104`; title "Settings", `titleLarge`, centered): lists only "Load from server user profile" (FA cloud-arrow-down; confirm "Overwrite local settings?"), "Load default from server" (FA download; only when `serverPluginActive`; same confirm), "Load from web client" (FA download; same confirm) and "Reset" (FA arrows-rotate; same confirm; runs `addRow(false) { resetToDefault() }`, so the inner stack pops to RowList; if the plugin is active it tries the plugin default first, else the generated default). There is NO Save entry on this page: the page declares an `onClickSave` parameter (line 27) that is never used, so the "Overwrite settings on server?" confirm wired in `HomeSettingsPage.kt:301-337` is dead code. Saving only happens through the Back-triggered Save dialog (5.3).

**Presets** (`HomeRowPresets.kt`): "Display presets": 4 presets that restyle every row (config types GetItems/CustomEndpoint are left unchanged): "Wholphin Default", "Wholphin Compact", "Series Thumb images", "Episode Thumbnail images". Preset table (`HomeRowPresets.kt:~97-275`; H=heightDp; unspecified fields = defaults):

| Preset | continueWatching | movie | tv | video | photo | music | playlist | liveTv | genre height |
|---|---|---|---|---|---|---|---|---|---|
| Default | default (172 TALL) | default | default | WIDE | WIDE+CROP | SQUARE | SQUARE+FIT | liveTvDefault | 128 |
| Compact | H148 | H148 | H148 | H100 WIDE | H100 WIDE CROP | H100 SQUARE | H100 SQUARE FIT | liveTvDefault | 100 |
| Series Thumbs | H100, imageType THUMB, WIDE, useSeries=true, episodeImageType THUMB, episodeAspect WIDE | H148 | H148 | H100 WIDE | H100 WIDE CROP | H100 SQUARE | H100 SQUARE FIT | liveTvDefault | 100 |
| Episode Thumbnails | H100, imageType THUMB, WIDE, showTitles=true, useSeries=false, episodeImageType PRIMARY, episodeAspect WIDE | H148 | H148 | H100 WIDE | H100 WIDE CROP | H100 SQUARE | H100 SQUARE FIT | liveTvDefault | 100 |

Apply mapping (`HomeSettingsViewModel.applyPreset`, `:700-803`): ContinueWatching/NextUp/Combined -> `continueWatching`; ByParent/RecentlyAdded/RecentlyReleased/Suggestions -> `preset.getByCollectionType(parent's collectionType)` (MOVIES, BOXSETS -> movie; TVSHOWS -> tv; MUSICVIDEOS/TRAILERS/HOMEVIDEOS -> video; PHOTOS -> photo; LIVETV -> liveTv; MUSIC -> music; others -> default); Favorite -> `getByItemType(kind)`; Genres/Studios -> keep options but set `heightDp = genreSize`; Recordings -> tv; TvPrograms/TvChannels -> liveTv. Preset applies only to the working copy (needs Save).

### 5.3 Dirty state, Back, Save

`settingsChanged = HomePageSettings(rows.map{it.config}, version=1) != originalSettings` (data equality; includes order and view options) (`HomeSettingsViewModel.kt:105-112`). With changes, Back at the RowList root opens the "Save" dialog (sub-pages: see the NOTE below) with:

1. "Save only to this device" (FA cloud-arrow-down) -> `saveToLocal`.
2. "Save to server user profile" (FA cloud-arrow-up) -> `saveToRemote`.
3. "Discard" (red trash) -> discard (no-op, nothing was persisted).

After saving or discarding it calls `navigationManager.goBack()`. Dialog = standard `DialogPopup` (elevation 3dp). A toast "Settings saved" shows after save.

NOTE: `BackHandler(settingsHaveChanged)` (`HomeSettingsPage.kt:93-95`) is registered BEFORE the inner `NavDisplay` (`:108-115`), and the NavDisplay `onBack` override is commented out (`:110`), so the default pop applies. Compose dispatches Back to the most recently registered enabled callback, and the NavDisplay's own handler is enabled only while its stack is larger than 1, so on sub-pages (AddRow, ChooseRowType, RowSettings, ChooseFavorite, GlobalSettings, SourceSettings, Presets) Back pops the inner page even with unsaved changes, and the outer handler fires only at RowList. This matches 1.6. Without changes, Back at RowList falls through to `navigationManager.goBack()`. This registration-order behavior is derived from the code and is not run-verified; use 1.6's wording for the web port.

### 5.4 Persistence - exactly where and under which keys

`HomePageSettings` JSON (`HomeRowConfig.kt:~215-230`): `{"rows":[ {...HomeRowConfig, "type":"<SerialName>"}, ...], "version": 1}`. `SUPPORTED_HOME_PAGE_SETTINGS_VERSION = 1`. Decoder: lenient, ignores unknown keys, allows trailing commas (`HomeSettingsService.jsonParser`, `:599-607`). Unknown/invalid rows are SKIPPED individually (not fatal); missing or newer `version` throws `UnsupportedHomeSettingsVersionException` (toast "Error: ...").

Row JSON shapes (class discriminator `"type"` with these names): `ContinueWatching{viewOptions}`, `NextUp{viewOptions}`, `ContinueWatchingCombined{viewOptions}`, `RecentlyAdded{parentId,viewOptions}`, `RecentlyReleased{parentId,viewOptions}`, `Genres{parentId,viewOptions}`, `Studios{parentId,viewOptions}`, `Favorite{kind,viewOptions}`, `Recordings{viewOptions}`, `TvPrograms{viewOptions}`, `TvChannels{viewOptions}`, `Suggestions{parentId,viewOptions}`, `ByParent{parentId,recursive,sort{sort,direction}?,viewOptions}`, `GetItems{name,filter{...},viewOptions}`, `CustomEndpoint{endpoint,title,headers?[{key,value}],query?[{key,value}],viewOptions}`. `viewOptions` keys: `heightDp, spacing, contentScale, aspectRatio, imageType, showTitles, useSeries, episodeContentScale, episodeAspectRatio, episodeImageType`. Wholphin's own enums serialize as Kotlin names: `PrefContentScale` {FIT, NONE, CROP, FILL, Fill_WIDTH, FILL_HEIGHT}; `AspectRatio` {TALL, WIDE, FOUR_THREE, SQUARE}; `ViewOptionImageType` {PRIMARY, THUMB}. Jellyfin SDK enums keep their wire names: `Favorite.kind` (`BaseItemKind`, e.g. `"BoxSet"`, `"MusicAlbum"`), `ByParent.sort.sort` (`ItemSortBy`, e.g. `"DateCreated"`, `"Default"`) and `sort.direction` / `sortOrder` (`SortOrder`: `"Ascending"`, `"Descending"`), not `BOX_SET`. The `GetItems.filter` object (`HomeGetItemsFilter`, `HomeRowConfig.kt:282-303`) has the keys `sortBy, sortOrder, ids, minCommunityRating, minCriticRating, recursive, searchTerm, parentId, includeItemTypes, isFavorite, isPlayed, officialRatings, tags, years, personIds, minOfficialRating, hasOfficialRating, studioIds, genreIds, minPremiereDate, maxPremiereDate` (the last two are serialized but silently dropped by `asGetItemsRequest`). `encodeDefaults` is off (`HomeSettingsService.jsonParser`, `:599-607`), so default-valued keys are omitted on write and may be absent when reading.

Storage locations:

| Where | Key / path | Written by | Read by |
|---|---|---|---|
| Local (device, per Jellyfin user id) | file `<filesDir>/home_settings/home_settings_<userIdWithoutDashes>.json` (`HomeSettingsService.filename`/`saveToLocal`, `:104-135`) | Save > "Save only to this device" | `loadFromLocal` |
| Server user profile | Jellyfin Display Preferences: `POST /DisplayPreferences/default?userId={uid}&client=Wholphin` (client string `"Wholphin (Debug)"` in debug builds) with `CustomPrefs["home_settings"] = <HomePageSettings JSON string>`. Implementation read-modify-writes the whole DisplayPreferences DTO (`GET /DisplayPreferences/default?userId&client` first) under a mutex (`DisplayPreferencesService.kt:20-56`). | Save > "Save to server user profile" | `loadFromServer` |
| Server plugin ("Wholphin" Jellyfin plugin, optional) | `GET {baseUrl}/wholphin/homesettings` returns `HomePageSettings` (null/404/empty rows => none); presence probe `GET {baseUrl}/wholphin/public` (any 2xx) | admin on the server | `ServerPluginApi.fetchHomePageSettings` |
| Jellyfin web client layout | `GET /DisplayPreferences/usersettings?userId&client=emby` -> `CustomPrefs["homesection0".."homesection9"]` (values: `none, smalllibrarytitles, librarybuttons, activerecordings, resume, resumeaudio, latestmedia, nextup, livetv, resumebook`) plus `GET /Users/{id}` `Configuration.LatestItemsExcludes` (`parseFromWebConfig`, `:327-444`) | Jellyfin web UI | "Load from web client" |
| Active source selection (which of the above is used) | per-user Room column `JellyfinUser.config.homeSettingsSource` (enum `HomePageSettingsSource`: UNSET, LOCAL, SERVER_PROFILE, PLUGIN, DEFAULT, WEB_CONFIG) (`JellyfinServer.kt:~85-90`, `HomeSettingsService.updateCurrent` `:~262-275`) | each save/load | `fetchSettingsFor` |
| Global home prefs | AppPreferences protobuf DataStore (local to device): `HomePagePreferences{max_items_per_row=1, enable_rewatching_next_up=2, max_days_next_up=4, click_to_play=5}` and `InterfacePreferences.show_logos`, `show_clock`, `backdrop_style`, `display_toggles` (`P`) | settings UI | home loader |

Source resolution (`fetchSettingsFor`, `HomeSettingsService.kt:165-254`; `loadCurrentSettings` runs after login/user switch via `UserSwitchListener`):

- `UNSET` (never chosen): try in order LOCAL -> SERVER_PROFILE -> PLUGIN (only if the plugin was detected), each wrapped in `tryLoad` (errors are logged and treated as null) -> if none found `createDefault` (source `DEFAULT`; the source of a successful UNSET load is whichever source last returned settings).
- `LOCAL`/`SERVER_PROFILE`/`PLUGIN`/`DEFAULT`/`WEB_CONFIG` use exactly that source; if it returns null (e.g. no saved file) the default is used (`createDefault`, source `DEFAULT`). Exceptions from an explicit source (including `UnsupportedHomeSettingsVersionException`) propagate to `loadCurrentSettings`, which catches them and also falls back to `createDefault`; the stored `homeSettingsSource` is not changed by the fallback. The editor's load actions show toasts "No server-side settings found", "No server plugin settings found", "No server-side web settings found" or "Error: <message>" (`HomeSettingsViewModel.kt:544-608, 805-840`).
- `saveToServer` then also sets source SERVER_PROFILE (`updateCurrent`); `saveToLocal` sets LOCAL. Loading from the web client sets the working source label LOCAL (the user must still Save).
- Row titles are resolved after loading (`resolve`, `:446-597`): library/collection names via `GET /Items/{id}` (failure -> "Unknown"); `RecentlyAdded` etc. use the localized "...in %s" pattern.

Web-client mapping (`parseFromWebConfig`, `HomeSettingsService.kt:327-433`; section enum `:642-660`): reads `homesection0..9` in index order (lowercased). `activerecordings` -> `Recordings` (title "Active Recordings"); `resume` -> `ContinueWatching` and `nextup` -> `NextUp`, as separate rows (not combined); `livetv` -> `TvPrograms` only if `userDto.tvAccess`; `latestmedia` expands to one `RecentlyAdded(viewOptionsForCollectionType)` row per library from `getAllUserLibraries`, minus the ids in the user's `Configuration.LatestItemsExcludes` (`GET /Users/{id}` via `userApi.getUserById`; `DefaultUserConfiguration` if null); `none`, `smalllibrarytitles`, `librarybuttons`, `resumeaudio` and `resumebook` are ignored. If `customPrefs` is empty the result is null (toast "No server-side web settings found"). Row ids are sequential from 0. In the editor the resulting source is recorded as LOCAL (`HomeSettingsViewModel.kt:581-608`).

### 5.5 Presets vs saved state

Presets, add/delete/move, view options, global resize and source loads all edit an in-memory working copy only. Only Save (local/server) persists the row list; the 4 GlobalSettings preferences persist immediately on change.

### 5.6 Web-port persistence guidance (what is portable)

Keep the JSON schema above byte-compatible so a web client can read/write the same `CustomPrefs["home_settings"]` display preference (client name differs: pick a stable name; the Android app reads only client "Wholphin"/"Wholphin (Debug)"). Local storage: use `localStorage` key like `home_settings_<userId>`.

### 5.7 Removed-from-Next-Up handling

- Long-press menu "Remove series from next up" (episode in a NextUp/Combined row) calls `LatestNextUpService.removeFromNextUp(userId, episode)` (`:170-195`): (1) `DELETE /UserPlayedItems/{episodeId}` (mark the next-up episode unplayed) and (2) read-modify-write Display Preferences `default` (client "Wholphin") `CustomPrefs["removeNextUp"] = JSON {"value": {"<seriesId>": "<LocalDateTime ISO>"}}` adding `seriesId -> now`. The action (label "Remove series from next up", FA tag icon) is offered only when the long-pressed row is `NextUp` or `ContinueWatchingCombined` and the item is an EPISODE with a `seriesId` (`HomePage.kt:149-158`, `ContextMenu.kt:531-541`); a plain `ContinueWatching` row never shows it. After removal `HomeViewModel.removeFromNextUp` re-runs `init()` to reload Home (`HomeViewModel.kt:343-353`). The removal timestamp is `LocalDateTime.now()` in the DEVICE's local zone, serialized as `ISO_LOCAL_DATE_TIME` WITHOUT an offset (`W/util/LocalDateSerializer.kt:27-41`) and later compared with the server's zoneless `userData.lastPlayedDate`; a web port should store the same zoneless format and mind client/server clock and zone skew.
- Filtering when building Next Up (`getNextUp`, `:79-125`): any returned episode whose `seriesId` is in that map is dropped unless it has `userData.lastPlayedDate` newer than the removal timestamp (null `lastPlayedDate` => stays hidden).
- Review/undo UI: Home Settings > Settings > "View series removed from next up" opens a dialog "Removed from next up" (a hard-coded `displaySmall` string, `RemovedNextUpContent.kt:164-166`): fetches ids from the map, `GET /Items?userId&ids=...` in chunks of 50, lists each series (80dp-tall Primary poster, title, removal date-time) with a trash button that calls `allowSeriesRemovedFromNextUp` (deletes the map entry, rewrites the pref). Empty -> "No results".
- Housekeeping: `LatestNextUpWorker` (periodic, every 4 hours, requires network, exponential backoff from 15 min, Android WorkManager; `LatestNextUpWorker.kt:113-126`) calls `updateRemovedFromNextUp`: for each removed series, `GET /Items?userId&parentId={series}&recursive=true&includeItemTypes=Episode&sortBy=DatePlayed&sortOrder=Descending&limit=1`; if the latest played episode is newer than the removal time (or the series no longer exists) the entry is dropped. Web: run on login/refresh instead of a worker (the filter in `getNextUp` already handles the visible effect).

---------------------------------------------------------------------------------------------------

## 6. Global behaviors

### 6.1 Clock

- `ProvideLocalClock` (`W/ui/util/LocalClock.kt`) updates a shared `Clock{now: LocalDateTime, timeString}` every 2 000 ms on a background coroutine, `timeString = DateFormat.getTimeFormat(context)` (Android system 12/24-hour locale format).
- Shown by `TimeDisplay` on drawer pages only (3.1) if `interfacePreferences.showClock` (default true). Not shown on full-screen pages (except as the screensaver/player's own). Home content also uses `now` for the "Ends at" computation (`TimeRemaining`).
- Home's refresh spinner position adapts: padding 40dp when the clock is shown (so it does not overlap), else 20dp.

### 6.2 Theme music

`ThemeSongPlayer.playThemeFor(itemId)` (`W/services/ThemeSongPlayer.kt`): `GET /Items/{id}/ThemeSongs` -> pick a random theme -> `getUniversalAudioStreamUrl(container=[opus,mp3,aac,flac])` -> ExoPlayer plays at volume by pref `playThemeSongs`: LOWEST .05, LOW .1, MEDIUM .25 (DEFAULT), HIGH .5, HIGHEST 75f (code literal `75f`; likely a typo for .75, clamps to full volume), DISABLED = never. Played on: Movie details (`MovieDetails.kt:149` -> `MovieViewModel.maybePlayThemeSong`, `MovieViewModel.kt:254-261`, the item's own theme), Episode details (plays the SERIES' theme using `seriesId`; `EpisodeDetails.kt:129`, `EpisodeViewModel.kt:177-181`), Series details (`SeriesViewModel.onResumePage` with the series id, `SeriesViewModel.kt:293-298`), Collection/BoxSet detail (`CollectionViewModel.kt:160`) and the collection folder view only when the item type is BOX_SET and the item list did not fail to load (`CollectionFolderView.kt:686-694`). NEVER on Home (`HomeRowGrid` injects the player but never calls it), library grids or Favorites. Default `playThemeSongs` = MEDIUM (`AppPreference.kt:234-238`). These pages call `stop()` on release. A new `playThemeFor` first joins the previous load job (calls are serialized by a mutex), then `player.stop()`, sets the volume and plays; a random theme is chosen with `randomOrNull()` and nothing plays if the list is empty (`ThemeSongPlayer.kt:66-124`). Stopped by `stop()` (page change) and by `PlaybackLifecycleObserver.onPause/onStop` (activity leaves foreground) (`PlaybackLifecycleObserver.kt:33-43`). Web: `<audio>` element + pause on `visibilitychange`.

### 6.3 Server events (`W/services/ServerEventListener.kt`)

Lifecycle: created with the activity; on current user change (and on `onResume`) it (re)subscribes; on `onPause`/`onStop` it cancels the websocket.

1. `POST /Sessions/Capabilities?playableMediaTypes=Video&supportedCommands=DisplayMessage,SendString&supportsMediaControl=true` (`sessionApi.postCapabilities(id?, playableMediaTypes, supportedCommands, supportsMediaControl)`; NOT `/Sessions/Capabilities/Full`, which is the separate `postFullCapabilities` with a JSON body that the app never calls). It is sent only when server, user, `baseUrl` and `accessToken` are all set, and again on every `onResume` and user change, before the websocket is (re)opened (`ServerEventListener.kt:65-77, 143-145`); then it opens the Jellyfin WebSocket (`/socket`, SDK `api.webSocket`).
2. `GeneralCommand` messages: `DisplayMessage` and `SendString` -> toast (LONG) with the `Header` and `Text` (or `String`) arguments joined by newline, shown only if non-blank. Other commands ignored.
3. `UserUpdated` message -> `serverRepository.updateUserDto(dto)`, which only replaces the stored DTO if `currentUser.id == dto.id` (`ServerRepository.kt:342-346`); the nav-drawer rebuild (`tvAccess`, libraries) and the Home reload then happen only if the new `ServerUserConfig` differs from the stored one (see 1.3).
4. The two subscriptions (GeneralCommand and UserUpdated) are parallel collectors in one `coroutineScope`: a failure of one cancels both, and `subscribeToWebSocket()` is then called again recursively while the activity scope is active (no backoff in code) (`ServerEventListener.kt:81-141`).
5. No other message types are consumed on shell/home (no library-changed/refresh events, no playstate remote control).

### 6.4 Screensaver hooks (`W/services/ScreensaverService.kt`, `MainContent.kt:137-161`, `MainActivity.kt:289-307`)

- State `ScreensaverState{enabled, enabledTemp, active, paused, dimEnabled, dimActive}`; `show = (enabled||enabledTemp) && active && !paused`; `showDim = dimEnabled && dimActive && !paused`.
- Idle timer: `pulse()` (`ScreensaverService.kt:87-139`) is called on EVERY key event (`dispatchKeyEvent`) and on `onResume`. It cancels the screensaver timer job; if the in-app screensaver is `enabled`: if not already `active` it sets `active=false, dimActive=false`, and if not `paused` it starts a job that waits `startDelay` then sets `active=true, dimActive=dimEnabled`. It then cancels the dim timer job; if `dimEnabled`: it sets `dimActive=false` and, if not `paused`, starts a job that waits the SAME `startDelay` (there is no separate dim delay setting and no dim-first behavior) then sets `dimActive = !paused`. Both timers therefore fire together. `startDelay` (`screensaverPreference.startDelay`, default 15 minutes, `DEFAULT_START_DELAY = 15*60_000`) has options 30 s, 1, 2, 5, 10, 15, 30, 60 min (`ScreensaverPreference.kt:21-33`). A `pulse()` while already `active` does not deactivate (only the key handler does).
- While the screensaver or dim is visible (`show || showDim`), `dispatchKeyEvent` calls `stop(false)` then `pulse()` (re-arms the idle timer) and consumes the key; otherwise it calls `pulse()` and passes the event on (`MainActivity.kt:289-298`). `onResume` also pulses; `onStop` calls `stop(true)`, which cancels both timer jobs (`:300-307, 323-328`).
- `keepScreenOn(keep)` is called by playback and slideshow to pause the idle timer (`paused=keep`) and, if the in-app screensaver is disabled, to hold the OS wake lock; MainActivity mirrors the `keepScreenOn` flow into `FLAG_KEEP_SCREEN_ON`. Details (`ScreensaverService.kt:57-82, 141-201`, `MainContent.kt:137-161`): when the in-app screensaver is enabled, the OS `keepScreenOn` flow is set true permanently by the prefs-driven `keepScreenOnInternal(enabled)`, so the OS screen never times out. `keepScreenOn(keep)` acts on the in-app state only if the screensaver or dim is enabled: it sets `paused=keep`, resets `active` and `dimActive` to false, and calls `pulse()` when released (`keep=false`); it is relayed to the OS flag only if the in-app screensaver is disabled.
- Content (`createItemFlow` / `createPager`, `ScreensaverService.kt:206-296`): `GET /Items` with `recursive=true`, `includeItemTypes = prefs.itemTypes` (default MOVIE, SERIES), `imageTypes=[Backdrop]` unless PHOTO is among the types (then omitted), `sortBy=Random`; `maxOfficialRating = maxAge.toString()` and `hasParentalRating = true` are sent only when `maxAgeFilter >= 0` (otherwise both are omitted; `hasParentalRating` is never false). Defaults/options: enabled false; `duration` default 30 s (options 15 s, 30 s, 1 min, 2 min); `maxAgeFilter` default 16 (options 0, 5, 10, 13, 14, 16, 18, 21, -1 = no limit) (`ScreensaverPreference.kt:21-66, 115-116`, `AppPreferencesSerializer.kt:140-150`). Per item: PHOTO -> image `/Items/{id}/Download` (`getDownloadUrl`) and title `formatDate(premiereDate)`; otherwise the Backdrop via `getItemImageUrl(BACKDROP)` and `item.title`; items with no backdrop URL are skipped without delay. The image is preloaded, then `{item, backdropUrl, logoUrl (LOGO), title}` is emitted and the loop waits `duration`; the index wraps to 0 at the end. It emits `Empty` if there are no items and `Error` if creating the pager fails. Further options: `animate`, `showClock`. Also exposed as an Android Daydream (`WholphinDreamService`, system-level) and a "Test screensaver" action in settings (`PreferencesContent.kt:562` -> `screensaverService.start()`).
- Fade in 1000 ms / out 500 ms; dim overlay black at `dimPercent`% alpha. The dim overlay is visible when `showDim || (dimEnabled && show)` (`MainContent.kt:137-161`); `dimPercent` default 75 (slider 0-95 step 5, `ScreensaverPreference.kt:191-205`). `start()` (the "Test screensaver" action) sets `enabledTemp`, `active` and `dimActive` true at once.
- Web equivalent: idle detection on `mousemove/keydown/pointerdown`, plus `Screen Wake Lock` during playback.

### 6.5 User switch listener (`W/services/UserSwitchListener.kt`)

On every change of current user id or `uiLanguage` (distinctUntilChanged): clear Seerr state; reset `homeSettingsService.currentSettings` to EMPTY; set the app locale to the user's `uiLanguage` (BCP-47 tags) or system default; check plugin installed (`GET /wholphin/public`), store in `serverRepository.serverPluginInstalled`; load home settings (`loadCurrentSettings`) (5.4); if `DISCOVER_ENABLED`: try plugin-provided Seerr settings (`GET /wholphin/seerrsettings`), else the saved Seerr server/user for this Jellyfin user and login. `DatePlayedInvalidationService` clears the "date played" cache whenever `serverRepository.current` changes. Seerr detail (`UserSwitchListener.kt:42-145`): the plugin-provided Seerr settings are tried only if the plugin is installed; if `usePluginProvidedServer` fails it falls through to the saved Seerr user (the LAST saved user for this Jellyfin user's `rowId`, `lastOrNull`). Login depends on `authMethod`: `API_KEY` uses `authMeGet()`, others call `seerrLogin(authMethod, username, password)`; failures call `seerrServerRepository.error(...)` rather than throwing. The listener `distinctUntilChanged`s on (user id, `uiLanguage`), so a language change alone re-runs the whole switch. `HomeViewModel` combines `currentUserDtoFlow` with `homeSettingsService.currentSettings` and does nothing while the settings are EMPTY (`HomeViewModel.kt:78-100`).

### 6.6 Errors, toasts and loading UI

- Toasts: `showToast(context, text)` = Android `Toast` LONG on main thread (`W/ui/Extensions.kt:360-373`); uses: upgrade, server messages, errors. `ExceptionHandler(autoToast)` coroutine handler logs and, if enabled, toasts `"Error: {message}"` (LONG) (`W/util/ExceptionHandler.kt`). Web: a transient toast/snackbar region.
- Full-page error: `ErrorMessage(message, exception)` (`W/ui/components/ErrorMessage.kt`): column, 16dp padding, 16dp spacing: title "An error occurred! Press the button to send logs to your server." (`compose_error_message_title`, `strings.xml:24`; color `error`, titleMedium), a "Send app logs to current server" text button (`send_app_logs`, `strings.xml:353`) (posts logs to the server via `ServerReportService.sendAppLogs`), the message (error color, titleLarge), exception `localizedMessage` (error color, titleMedium), then each `cause` as "Caused by: ..." (titleSmall). No auto-retry.
- Full-page loading: `LoadingPage` = centered 48dp `CircularProgressIndicator` colored `border`, fills the max size and is focusable; it requests focus when `focusEnabled` (default true) (`CircularProgress.kt:42-66`).
- Per-row loading/error: see 4.5.
- Crash reporting: ACRA dialog "Wholphin has crashed! Would you like to attempt to send a crash report to your Jellyfin server?" (`WholphinApplication.kt:~97-103`). Not portable beyond a global error handler.
- Update check: `UpdateChecker.maybeShowUpdateToast` on `onStart` when `autoCheckForUpdates` (Android APK updates; skip on web).
- Minimum server version: `Jellyfin.minimumVersion` and `newMinimumServerVersion = 12.0.0` (`WholphinApplication.kt:124-126`). Tiers: `NOT_SUPPORTED` (< `Jellyfin.minimumVersion`), `NOT_SUPPORTED_IN_FUTURE` (< 12.0.0), else `SUPPORTED`; `UNKNOWN` (version or status could not be fetched) uses the not-supported text. The warning (`Resources.serverSupportedMessage`, `Formatting.kt:333`) appears in three places: the user list (`SwitchUserContent.kt:186-191`, as a bottom `SwitchErrorMessage`), the server picker rows (`SwitchServerContent.kt:481`) and at the top of Settings (`PreferencesContent.kt:122`, computed in `PreferencesViewModel.kt:85-92`).

---------------------------------------------------------------------------------------------------

## 7. Key handling relevant to navigation (outside playback)

Android TV remote keys -> behavior (there is no custom global key map outside these; everything else is Compose focus defaults):

| Key | Where | Behavior |
|---|---|---|
| D-pad Up/Down/Left/Right | everywhere | Compose focus traversal. LEFT from the leftmost focusable of a drawer page enters the drawer (opens it). RIGHT from the drawer returns to content. UP/DOWN inside rows moves between rows (focusRestorer remembers the card column per row). |
| Center / Enter | cards, list items | click (`onClick`); on cards also initiates long-press detection |
| Long Enter (hold) | cards on Home, grids, lists | `onLongClick`: context menu (4.8). The dialog ignores clicks for 1000 ms or until Enter key-up |
| Back | see 1.6 | pop stack; Home opens drawer first; second Back exits the app |
| Media Play / Media Play-Pause (KeyUp) | focused Home card with playable item | start playback (`HomePage.kt:454`). Other pages: grids etc. may do the same via `KeyIdentifier` helpers |
| Menu key | Not handled anywhere in nav/home code (grep: no `KEYCODE_MENU` / `Key.Menu` handling) | long-press on Enter is the only way to open the context menu |
| Media Next/Prev/Rewind/FastForward/Stop | Only handled by the player/music pages | |
| Any key while screensaver visible | `MainActivity.dispatchKeyEvent` | dismisses screensaver, key consumed |
| Digits / Arrow keys | PIN entry dialog | PIN characters `0-9`, `U/R/D/L` (4.2 / 1.2) |
| Text entry | login, server URL, search | on-screen keyboard (IME Go = submit) |
| In `TabbedPage` (library pages) | tab row | LEFT/RIGHT on tab row switches tab; `remember_selected_tab` pref (not in this doc) |
| Grid pages | `CardGrid.kt:247-300` | custom key handling, out of scope but needed if grids are built: Back long-press jumps to the previously focused index and Back key-up while `focusedIndex > 0` jumps to the top (both when `useBackToJump`); Play / PlayPause key-up plays the focused item if it is playable; the forward/backward remote buttons jump a page when `useJumpRemoteButtons`; letter keys A-Z jump to that letter when `showLetterButtons`. Key helpers (`KeyIdentifier.kt:23-27, 84`): `isEnterKey` = DpadCenter, Enter, NumpadEnter, ButtonSelect, ButtonA; `isBackKey` = Back, ButtonB; `isPlayKeyUp` = KeyUp of MediaPlay or MediaPlayPause only (MediaPause is not handled on Home) |

Voice: search page has a voice search button (`VoiceSearchButton`, `VoiceInputManager`; pref `search_preferences.show_voice_search_button`), and the Android search intent `ACTION_SEARCH` opens `Destination.Search(query)` (1.5).

---------------------------------------------------------------------------------------------------

## 8. Web adaptation questions

These depend on TV-remote semantics; DECISIONS NEEDED (not made here):

1. **Back / exit**: web has browser Back and no "exit". Should "Back on Home opens drawer" be kept (e.g. Escape / browser back opens the nav panel on Home), or should Back on Home do nothing/leave the site? What should browser Back map to relative to the in-app stack (`goBack` pops; `navigateToFromDrawer` resets to `[Home, X]`)? Should URLs/history entries mirror the stack, and should deep links (1.5) be supported?
2. **Drawer open/close**: the drawer opens on focus (D-pad Left) and closes on focus loss. With a mouse: hover to expand, click-to-pin, always-expanded, or a hamburger toggle? Is the 64dp collapsed rail always visible? Should the content shift right by 160dp (translate, pushing the right edge off-screen) or overlay or resize?
3. **Focus model**: keep roving-focus/D-pad navigation (arrow keys over rows/cards, `focusRestorer` per-row column memory, `onEnter` rules, remembered Home position)? Or switch to mouse hover + scroll with optional keyboard? The header is driven by "focused item": on web should it follow hover, keyboard focus, or both (and debounce)?
4. **Long-press context menu**: Enter-hold has no mouse equivalent. Right-click, a "..." button on card hover, or both? Should the 1 000 ms click-guard on the dialog be kept?
5. **Media Play key shortcut on a card**: map to a Play hover button / the `k`/Space/`MediaPlayPause` key? Should it apply only to `type.playable` items?
6. **Click-to-play preference**: for Continue watching/Next up cards, click either plays or opens details; with a mouse, should there be both (click = details, overlay play button = play) regardless of the setting?
7. **Row scrolling**: vertical snap-to-row with 50dp top offset and horizontal LazyRow auto-scroll on focus. Native scroll, wheel, drag, arrow buttons on row hover, scroll-snap, or keyboard-only?
8. **Home refresh triggers**: Android re-runs `init()` on every ON_START of the page. Equivalents: on route re-entry, `visibilitychange`/window focus, and after mutations? Any polling or a manual refresh button (the app has none)? The drawer "Home" click reloads from scratch when already on Home - keep?
9. **Header details panel**: the 400dp-wide fixed-height overview and 60%/75% widths assume a 960dp viewport. Responsive rules for small/large windows and touch devices? Should the header exist at all on narrow/mobile layouts?
10. **Card sizes in dp**: card heights (64-236dp), spacing (0-32), and aspect ratios are TV-scale. Scale by viewport (rem/vw), keep px, or add a UI-scale setting? What is the web-port design viewport (960x540 assumed)?
11. **Clock**: top-right clock uses the system TV time format. Show on web by default (default true), or hide since the OS has one? 12/24h from `Intl`?
12. **Screensaver / dim / keep-awake**: idle detection events for web, Wake Lock API during playback, whether to implement the Daydream equivalent, and whether any key/click should be consumed to dismiss it (current behavior consumes the first key).
13. **Theme music**: browsers block autoplay until a user gesture; trigger on detail page entry after first interaction? Volume mapping (HIGHEST is 75f in code - a bug; treat as 0.75 or 1.0?).
14. **Websocket**: keep websocket subscription (DisplayMessage/SendString toasts, UserUpdated) only while tab visible (Android cancels on pause/stop)? Reconnect/backoff policy? Remote-control commands?
15. **Auto sign-in & PIN**: `signInAutomatically` and the "leaving the app forces user re-selection when off" rule map to what on the web (session vs persistent token storage, tab close vs visibility)? The D-pad PIN entry (arrows + digits) needs a keyboard/on-screen keypad design; is it still compared client-side against a locally stored PIN (it is, in Android)? Is FLAG_SECURE equivalent (blur on `visibilitychange`) desired for PIN-protected users?
16. **Quick Connect** polling interval (5 s) and login flows: keep as-is?
17. **Local stores**: Android keeps nav-drawer pins/home source in Room and home JSON in a file, AppPreferences in protobuf DataStore. Which of these become localStorage/IndexedDB vs Jellyfin display preferences (so settings follow the user across browsers)? Which display-preference `client` name should the web app use (Android reads/writes only `Wholphin`)? Should the web app read the Android `home_settings` customPref?
18. **Android-only features**: TV launcher "Watch Next" channels/intents, Daydream, WorkManager periodic jobs (suggestions every 12 h, next-up cleanup every 4 h), app self-update, ACRA crash dialog, external player/`PlayExternalPage`, player-backend choices (ExoPlayer/MPV) in "Play with". Drop, replace (e.g. on-demand suggestions, cleanup at login), or map to web players?
19. **Settings page placement**: Settings are a full-screen page with a right-hand 40% panel; Home Settings is a 360dp left panel with live preview. Keep these two-pane layouts or use modal/side-sheets?
20. **Drag/reorder in home settings**: TV uses up/down buttons per row; mouse could add drag-and-drop - keep buttons only or add drag?
21. **Context menu items needing TV-specific handling**: "Add to queue" is a no-op on Home; "Media Information"/"Send media info" appear on Home only for cards of `TvPrograms` rows (their `ProgramItemFields` request `MediaSources`) and never for other rows - keep or fix?
22. **Dead preference**: `NavDrawerSwitchOnFocus` is unused; skip.
23. **Error/Toast presentation** for server `DisplayMessage` commands (header + text): toast, notification, or modal?
24. **Backdrop**: dynamic palette extraction (Palette API) needs a JS equivalent (e.g. canvas sampling); keep the 500 ms publish delay (the new image appears 500 ms late; the old image is blanked immediately), 800 ms crossfade, 1250 ms color animation, and the radial-gradient composition?
25. **Hardcoded quirks to confirm**: Loading spinner in a 200dp box (not centered); `RecentlyReleased` sends no `includeItemTypes`; `HomeGetItemsFilter` drops premiere-date filters; `Suggestions` row is cache/worker based.

---------------------------------------------------------------------------------------------------

## Appendix A - Theme color roles (dark scheme always used; `WholphinTheme(darkTheme = true)`, `MainActivity.kt:266`)

The app is ALWAYS dark. Selected by `interfacePreferences.app_theme_colors` (proto `AppThemeColors`: PURPLE=0 (default), BLUE, GREEN, ORANGE, BOLD_BLUE, OLED_BLACK, RED, BROWN). Role values (dark scheme) from `W/ui/theme/colors/*ThemeColors.kt`:

| Role | PURPLE | BLUE | GREEN | ORANGE | BOLD_BLUE | OLED_BLACK | RED | BROWN |
|---|---|---|---|---|---|---|---|---|
| background | #15121C | #111318 | #101510 | #1C1715 | #111318 | #000000 | #1A1110 | #19120D |
| surface | #15121C | #121318 | #101510 | =background | #0A1017 | #000000 | #1A1110 | #19120D |
| onSurface | #E8DFF0 | #E3E2E9 | #DFE4DC | #EAE2D4 | #DAE3FA | #C0FFFFFF | #F1DEDC | #F0DFD6 |
| surfaceVariant | #4A4456 | #44474F | #414941 | #4C4639 | #44474F | #303030 | #534341 | #52443B |
| onSurfaceVariant | #CCC3D9 | #C4C6D0 | #C1C9BF | #CEC6B4 | #C4C6D0 | #C0FFFFFF | #D8C2BE | #D7C3B7 |
| primary | #D2BCFF | #AAC7FF | #98D5A4 | #B67F12 | #0C2A67 | #C04D4B4B | #FFB4AA | #FFB784 |
| onPrimary | #3D008F | #09305F | #00391A | #E0CB7F | #558DD0 | #FFFFFF | #561E18 | #4F2500 |
| secondaryContainer | #48415B | #3E4759 | #394B3C | #524127 | #3E4759 | #505050 | #5D3F3B | #5B412F |
| tertiary | #A071F8 | #BECEFF | #81D29C | #FCE574 | #BEC9FF | #DEDEDE | #DFC38C | #C8CA94 |
| error | #FFB4AB | (all) | | | | | | |
| inversePrimary | #741BF8 | #405F90 | #39912F | #E39012 | #152986 | #C0F9F4FF | #C0000C | #6D3B07 |
| inverseSurface (focused drawer item container) | #E8DFF0 | #E3E2E9 | #DFE4DC | #EAE2D4 | #E3E2E9 | #E8E8E8 | #F1DEDC | #F0DFD6 |
| inverseOnSurface (focused drawer item content) | #332E3A | #2F3036 | #2D322D | #343027 | #2F3036 | #000000 | #392E2C | #382F29 |
| **border** (focus ring / spinner / selected icon) | inversePrimary @ 75% | inversePrimary | inversePrimary @ 75% | inversePrimary | inversePrimary | inversePrimary | inversePrimary | inversePrimary |

Other fixed colors (`W/ui/UiConstants.kt:20-45`): `TransparentBlack25/50/75 = #40/#80/#BF 000000`; `GoldenYellow #DAB440`; `DarkGreen #114000`; `DarkRed #400000`; `DarkCyan #21556E`; `DarkPurple #261370`. Favorite heart `#FF4444` (Android `holo_red_light`). Backdrop: see 3.9.

Typography: app uses default `androidx.tv.material3.Typography()` (`W/ui/theme/Type.kt`) = Material 3 scale (lib, unverified): display 57/45/36sp, headline 32/28/24sp, title 22/16/14sp, body 16/14/12sp, label 14/12/11sp. Used here: row title `titleLarge` 22sp; home title `headlineMedium` 28sp SemiBold; subtitle `headlineSmall` fontSize forced 20sp; overview `bodyMedium` 14sp; quick details `titleSmall` 14sp; drawer text `labelMedium` 12sp; card titles `bodyLarge` 16sp / `bodyMedium` 14sp.

## Appendix B - Key string resources (en)

`R/values/strings.xml`: `favorites` "Favorites" (52), `home` "Home" (61), `more` "More" (75), `search` "Search" (114), `settings` "Settings" (356), `discover` "Discover" (509), `now_playing` "Now playing" (558), `loading` "Loading…" (68), `no_results` "No results" (80), `continue_watching` "Continue watching" (26), `next_up` "Next Up" (78), `combine_continue_next` "Combine Continue Watching & Next Up" (333), `recently_added_in` "Recently added in %1$s" (102), `recently_added` (103), `recently_released_in` "Recently released in %1$s" (565), `recently_released` "Recently Released" (105), `recently_recorded` "Recently Recorded" (104), `genres_in` "Genres in %1$s" (564), `studios_in` "Studios in %1$s" (839), `suggestions_for` "Suggestions for %1$s" (578), `favorite_items_title` "Favorite %s" (210), `watch_live` "Watch live" (177), `active_recordings` "Active Recordings" (6), `channels` "Channels" (464), `view_more` "View more" (836), `ends_at` "Ends at %1$s" (46), `time_left` "%1$s left" (155), `customize_home` "Customize home page" (568), `home_rows` "Home rows" (569), `add_row` (563), `add_row_for` (574), `display_presets` (583), `max_homepage_items` (341), `rewatch_next_up` (350), `max_days_next_up` (553), `continue_watching_click_behavior` (856), `view_removed_next_up` (835), `settings_saved` "Settings saved" (582), `save_to_local` "Save only to this device" (981), `save_to_server` "Save to server user profile" (571), `updated_toast` "Wholphin updated to %s" (832).
FontAwesome code points used: `R/values/fa_strings.xml` (heart f004, film f008, video f03d, tv f26c, music f001, folder-open f07c, list-ul f0ca, ellipsis f141, magnifying-glass-plus f00e, caret-up f0d8, caret-down f0d7, download f019, sliders f1de, cloud-arrow-down f0ed, cloud-arrow-up f0ee, arrows-rotate f021, eye f06e, eye-slash f070, shuffle f074, tag f02b, xmark f00d, check f00c).

## Appendix C - Gaps and unverified items

- tv-material3 library defaults (item heights 56/64dp, ListItemDefaults.IconSize 36dp, Card focus scale/border, exact drawer item container colors, Typography scale) are from memory of the library, not from this repo.
- Jellyfin REST paths are now confirmed against the installed `@jellyfin/sdk` and the Kotlin: resume is `GET /UserItems/Resume` (not the legacy `/Users/{id}/Items/Resume`); `getPrograms` is `POST /LiveTv/Programs` with a `GetProgramsDto` body (`GET /LiveTv/Programs` is the separate `getLiveTvPrograms`); latest media is `GET /Items/Latest`, whose `userId` query param is optional and is not set by Wholphin's `GetLatestMediaRequest`, so the server derives the user from the auth token (a web client may pass `userId` explicitly); `GET /Shows/{seriesId}/Episodes` with `adjacentTo` is confirmed; display preferences are `GET` / `POST /DisplayPreferences/{id}?userId&client`; `DELETE /UserPlayedItems/{itemId}` is the mark-unplayed call used by `removeFromNextUp` (`library-api.js:748,956`, `live-tv-api.js:820,973-985`, `show-api.js:46`, `display-preference-api.js:36,81`, `user-data-api.js:142,183`; `HomeDataService.kt:271-278`). Other endpoint paths in this document remain inferred from SDK method names.
- Image URLs use `quality=96` (`ImageUrlService.kt:284`) plus `fillHeight` = card height in px (device pixels, i.e. dp x density).
- Details pages, grids, search, setup screens' internal layouts, settings pages (other than the home customization), and the player are out of scope here.
- Combined-row ordering detail (`W/services/DatePlayedService.kt:42-105`): for each next-up episode the "last played" timestamp = `GET /Shows/{seriesId}/Episodes?adjacentTo={episodeId}&limit=1` (`GetEpisodesRequest`) first result's `userData.lastPlayedDate` (MIN if none), raised to the episode's `premiereDate` if that is later. Only `InvalidStatusException` falls back to `max(LocalDateTime.MIN, premiereDate)`; any other exception is rethrown, and `buildCombined` catches it and stores null for that item (`LatestNextUpService.kt:145-154`), which sorts last. Cached per (series,item) for 2 hours, max 50 entries (`AppPreference.HomePageItems.max`). Invalidation happens in three places: `HomeViewModel.init` calls `invalidateAll` (`HomeViewModel.kt:80`); every current-user change calls `invalidateAll` (`DatePlayedService.kt:150-160`); `FavoriteWatchManager.setWatched` calls `invalidate(itemId)`, which removes all entries for that series (`FavoriteWatchManager.kt:25`, `DatePlayedService.kt:122-135`).
