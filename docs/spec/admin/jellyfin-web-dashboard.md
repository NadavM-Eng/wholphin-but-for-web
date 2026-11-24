<!-- Inventory of the stock Jellyfin 10.11 web dashboard (jellyfin-web, branch release-10.11.z), extracted from its public source for the Wholphin Web admin panel. -->

# jellyfin-web 10.11 dashboard inventory

Source: `github.com/jellyfin/jellyfin-web`, branch `release-10.11.z`, read file by file through raw.githubusercontent.com. Paths below are relative to the repo root (`src/...`).

Conventions in this file:

- Label text in backticks like `LabelServerName` is the key in `src/strings/en-us.json`. The English text of every key used in this file is in the appendix at the end (fetched from the branch's `en-us.json`); in-line English is shown where it helps. `{0}`, `{1}` in a string are positional arguments.
- "Config property" names are the Jellyfin server DTO property names (`ServerConfiguration`, `EncodingOptions`, `UserPolicy`, ...).
- SDK or `ApiClient` method names are quoted from the source. REST paths: where the source writes the path (legacy `ApiClient.getUrl('...')` calls) it is quoted as written, without a leading slash. Where the source only calls an SDK method, the path is taken from `docs/spec/admin/api-inventory.md` (the throwaway server's OpenAPI document, 10.11.11) and was checked against it; a note says so where the first draft was wrong. Where the inventory has no such operation this is stated in place. No unverified paths remain in this file.
- Notes starting "Observation:" are mine.
- Several fetches went through a summarizing step, so quoted details (defaults, option lists) come from that summary of the file. Anything the summary said it could not see is stated as such.

---

## 1. Drawer / navigation structure

Built in `src/apps/dashboard/components/drawer/AppDrawer.tsx`. Section order, top to bottom: a header link (`DrawerHeaderLink`, file listed in the tree but the fetch of `.../drawer/DrawerHeaderLink.tsx` returned 404, so its contents are unknown), then `ServerDrawerSection`, `DevicesDrawerSection`, `LiveTvDrawerSection`, `PluginDrawerSection`, `AdvancedDrawerSection`. No item in any section is gated by a permission or a setting in the drawer code (the whole dashboard sits behind one admin guard, see section 2). The only conditional parts are the two expandable groups and the dynamic plugin list.

The drawer is rendered only when a user is signed in and the route is not the metadata manager (`/metadata`), per `AppLayout.tsx`.

### Server (subheader `TabServer`, "Server")

`ServerDrawerSection.tsx`

| # | Label key (English) | MUI icon | Route | Notes |
|---|---|---|---|---|
| 1 | `TabDashboard` (Dashboard) | Dashboard | `/dashboard` | |
| 2 | `General` (General) | Settings | `/dashboard/settings` | |
| 3 | `HeaderBranding` (Branding) | Palette | `/dashboard/branding` | |
| 4 | `HeaderUsers` (Users) | People | `/dashboard/users` | |
| 5 | `HeaderLibraries` (Libraries) | LibraryAdd | none (expander) | Group starts open when the current path is in `LIBRARY_PATHS` |
| 5a | `HeaderLibraries` | none | `/dashboard/libraries` | sub-item |
| 5b | `Display` (Display) | none | `/dashboard/libraries/display` | sub-item |
| 5c | `LabelMetadata` (Metadata) | none | `/dashboard/libraries/metadata` | sub-item |
| 5d | `TabNfoSettings` (NFO Settings) | none | `/dashboard/libraries/nfo` | sub-item |
| 6 | `TitlePlayback` (Playback) | PlayCircle | none (expander) | Starts open when the path is in `PLAYBACK_PATHS` |
| 6a | `Transcoding` (Transcoding) | none | `/dashboard/playback/transcoding` | |
| 6b | `ButtonResume` (Resume) | none | `/dashboard/playback/resume` | |
| 6c | `TabStreaming` (Streaming) | none | `/dashboard/playback/streaming` | |
| 6d | `Trickplay` (Trickplay) | none | `/dashboard/playback/trickplay` | |

Expanders show ExpandLess / ExpandMore.

### Devices (subheader `HeaderDevices`, "Devices")

`DevicesDrawerSection.tsx`

| Label key | Icon | Route |
|---|---|---|
| `HeaderDevices` (Devices) | Devices | `/dashboard/devices` |
| `HeaderActivity` (Activity) | Analytics | `/dashboard/activity` |

### Live TV (subheader label key not read from the section file; items below)

`LiveTvDrawerSection.tsx`

| Label key | Icon | Route |
|---|---|---|
| `LiveTV` (Live TV) | LiveTv | `/dashboard/livetv` |
| `HeaderDVR` (DVR) | Dvr | `/dashboard/livetv/recordings` |

Observation: the Live TV section is always shown, even if the server has Live TV disabled or no tuner.

### Plugins (subheader `TabPlugins`, id `plugins-subheader`)

`PluginDrawerSection.tsx`

- Fixed first item: `TabPlugins` (Plugins), icon Extension, route `/dashboard/plugins`. Its "also active on" paths are `/configurationpage` and `/dashboard/plugins/repositories`. Its exclude list is the URLs of all plugin pages below, so a plugin page does not highlight the Plugins item.
- Dynamic items: the section calls `useConfigurationPages({ enableInMainMenu: true })`, which is `getDashboardApi(api).getConfigurationPages({ enableInMainMenu })` (React Query key `[ConfigurationPages, enableInMainMenu]`). Each returned `ConfigurationPageInfo` becomes one list item:
  - text: `pageInfo.DisplayName`; React key: `pageInfo.PluginId`;
  - icon: always the Folder icon (source has `TODO: Support different icons?`);
  - link: `/${Dashboard.getPluginUrl(pageInfo.Name)}` which is `/configurationpage?name=<encoded Name>`.
  - No sorting in this component; server order is kept.
- Errors are only `console.error`'d (`[PluginDrawerSection] unable to fetch plugin config pages`).

### Advanced (subheader `TabAdvanced`, "Advanced")

`AdvancedDrawerSection.tsx`

| Label key | Icon | Route |
|---|---|---|
| `TabNetworking` (Networking) | Lan | `/dashboard/networking` |
| `HeaderApiKeys` (API Keys) | VpnKey | `/dashboard/keys` |
| `HeaderBackups` (Backups) | Backup | `/dashboard/backups` |
| `TabLogs` (Logs) | Article | `/dashboard/logs` |
| `TabScheduledTasks` (Scheduled Tasks) | Schedule | `/dashboard/tasks` |

### Other chrome

`AppLayout.tsx`: fixed AppBar (no elevation change on scroll), drawer permanent from the `md` breakpoint (width `DRAWER_WIDTH`), temporary below it with a toggle button; back button when `appRouter.canGoBack()`; a `HelpButton` in the toolbar (`components/toolbar/HelpButton.tsx`, links from `constants/helpLinks.ts`, see table in section 2); `AppTabs` (tabs delivered through an `EventType.SET_TABS` event by legacy pages; standard centered on `sm`+, scrollable below); `ThemeCss dashboard`; class `dashboardDocument` on `<body>`; date-fns `LocalizationProvider`. A user avatar button component exists (`UserAvatarButton.tsx`).

---

## 2. Route table

Router assembly (`src/apps/dashboard/routes/routes.tsx`): everything is under one guard `<ConnectionRequired level='admin' />`, then lazily loaded `AppLayout`. Under `dashboard` the routes are `ASYNC_ADMIN_ROUTES` (React pages, `_asyncRoutes.ts`), `LEGACY_ADMIN_ROUTES` (HTML views plus a JS controller, `_legacyRoutes.ts`), and one redirect (the old plugin catalog URL goes to `/dashboard/plugins`). Outside `dashboard`, two more routes live in the same guard: `/metadata` (legacy) and `/configurationpage` (server-served plugin HTML). Only the dashboard subtree has an `ErrorBoundary`.

Page title = the first `Page` title/heading the file sets (string key, English where known).

| Path | Source file | Kind | Page title key |
|---|---|---|---|
| `/dashboard` | `apps/dashboard/routes/index.tsx` | React | `TabDashboard` |
| `/dashboard/settings` | `routes/settings/index.tsx` | React | `General` |
| `/dashboard/branding` | `routes/branding/index.tsx` | React | `HeaderBranding` (page uses heading; title not confirmed) |
| `/dashboard/users` | `routes/users/index.tsx` | React page, legacy-style body (`window.ApiClient`) | `HeaderUsers` |
| `/dashboard/users/add` | `routes/users/add.tsx` | React page, legacy-style body | not read (new user) |
| `/dashboard/users/profile?userId=` | `routes/users/profile.tsx` | React page, legacy-style body | user name (id `editUserPage`) |
| `/dashboard/users/access?userId=` | `routes/users/access.tsx` | React page, legacy-style body | user name (id `userLibraryAccessPage`) |
| `/dashboard/users/parentalcontrol?userId=` | `routes/users/parentalcontrol.tsx` | React page, legacy-style body | user name |
| `/dashboard/users/password?userId=` | `routes/users/password.tsx` + `components/dashboard/users/UserPasswordForm.tsx` | React page, legacy-style body | user name (id `userPasswordPage`) |
| `/dashboard/libraries` | `routes/libraries/index.tsx` | React (MUI) + legacy dialogs | `HeaderLibraries` (id `mediaLibraryPage`) |
| `/dashboard/libraries/display` | `routes/libraries/display.tsx` | React | `Display` |
| `/dashboard/libraries/metadata` | `routes/libraries/metadata.tsx` | React | `LabelMetadata` |
| `/dashboard/libraries/nfo` | `routes/libraries/nfo.tsx` | React | `TabNfoSettings` |
| `/dashboard/playback/transcoding` | `routes/playback/transcoding.tsx` | React | `Transcoding` |
| `/dashboard/playback/resume` | `routes/playback/resume.tsx` | React | `ButtonResume` |
| `/dashboard/playback/streaming` | `routes/playback/streaming.tsx` | React | `TabStreaming` |
| `/dashboard/playback/trickplay` | `routes/playback/trickplay.tsx` | React | `Trickplay` |
| `/dashboard/devices` | `routes/devices/index.tsx` | React (Material React Table) | `HeaderDevices` |
| `/dashboard/activity` | `routes/activity/index.tsx` | React (Material React Table) | `HeaderActivity` |
| `/dashboard/livetv` | `routes/livetv/index.tsx` | React | `LiveTV` (id `liveTvStatusPage`) |
| `/dashboard/livetv/recordings` | `routes/livetv/recordings.tsx` | React | `HeaderDVR` |
| `/dashboard/livetv/tuner?id=` | `apps/dashboard/controllers/livetvtuner.html` + `.js` | LEGACY controller | `HeaderLiveTvTunerSetup` (id `liveTvTunerPage`) |
| `/dashboard/livetv/guide?type=&id=` | `apps/dashboard/controllers/livetvguideprovider.html` + `.js`, then `components/tvproviders/<type>.js` + `.template.html` | LEGACY controller | provider-specific (id `liveTvGuideProviderPage`) |
| `/dashboard/networking` | `apps/dashboard/controllers/networking.html` + `.js` | LEGACY controller | `TabNetworking` |
| `/dashboard/keys` | `routes/keys/index.tsx` | React (Material React Table) | `HeaderApiKeys` |
| `/dashboard/backups` | `routes/backups/index.tsx` | React | `HeaderBackups` (id `backupsPage`) |
| `/dashboard/logs` | `routes/logs/index.tsx` | React | `TabLogs` |
| `/dashboard/logs/:file` | `routes/logs/file.tsx` | React | the file name (id `logPage`) |
| `/dashboard/tasks` | `routes/tasks/index.tsx` | React | `TabScheduledTasks` (id `scheduledTasksPage`) |
| `/dashboard/tasks/:id` | `routes/tasks/task.tsx` | React (Material React Table) | task name |
| `/dashboard/plugins` | `routes/plugins/index.tsx` | React | `TabPlugins` |
| `/dashboard/plugins/:pluginId?name=` | `routes/plugins/plugin.tsx` | React | plugin name |
| `/dashboard/plugins/repositories` | `routes/plugins/repositories.tsx` | React | `TabRepositories` |
| `/metadata` | `src/controllers/edititemmetadata.html` + `.js` | LEGACY controller, in the `/` app shell (drawer hidden) | Metadata manager |
| `/configurationpage?name=` | `components/ServerContentPage.tsx` with `view='/web/configurationpage'` | server-served HTML | plugin-defined |

Counts: 30 entries in `_asyncRoutes.ts` (one is the index `''`), 3 in `_legacyRoutes.ts`, plus `/metadata` and `/configurationpage`: 35 routes. The user pages and wizard-style pages marked "legacy-style body" are React components that still manipulate the DOM via refs and `window.ApiClient`. Second pass: `_asyncRoutes.ts` and `_legacyRoutes.ts` were re-fetched and match the lists below exactly (30 and 3 entries; the three legacy ones are `networking`, `livetv/guide`, `livetv/tuner`). The directory `src/apps/dashboard/routes/` holds `_asyncRoutes.ts`, `_legacyRoutes.ts`, `index.tsx`, `routes.tsx` and 13 page folders (activity, backups, branding, devices, keys, libraries, livetv, logs, playback, plugins, settings, tasks, users). There is NO `_redirects.ts` on this branch; the one redirect (`plugins/catalog` -> `/dashboard/plugins`, replace) is inside `routes.tsx`, whose path constants are `dashboard`, `metadata`, `configurationpage`. Every address on the walked-server list (`/dashboard`, settings, branding, users, users/add|profile|access|parentalcontrol|password, libraries, libraries/display|metadata|nfo, playback/transcoding|resume|streaming|trickplay, devices, activity, livetv, livetv/recordings, networking, keys, backups, logs, tasks, plugins, plugins/repositories, `/configurationpage?name=`) is in the table. The table also has the parametrised sub-routes (`logs/:file`, `tasks/:id`, `plugins/:pluginId`) and the two legacy-only pages `livetv/tuner` and `livetv/guide`, which the walk could not list because they need parameters. Nothing in the table is invented.

`_asyncRoutes.ts` entries (path, optional `page`): `''`, `activity`, `backups`, `branding`, `devices`, `settings`, `keys`, `libraries`, `libraries/display`, `libraries/metadata`, `libraries/nfo`, `livetv`, `livetv/recordings`, `logs`, `logs/:file` (page `logs/file`), `playback/resume`, `playback/streaming`, `playback/transcoding`, `playback/trickplay`, `plugins`, `plugins/:pluginId` (page `plugins/plugin`), `plugins/repositories`, `tasks`, `tasks/:id` (page `tasks/task`), `users`, `users/access`, `users/add`, `users/parentalcontrol`, `users/password`, `users/profile`. All typed `AppType.Dashboard`.

`_legacyRoutes.ts`: `networking` (controller+view `networking`), `livetv/guide` (`livetvguideprovider`), `livetv/tuner` (`livetvtuner`).

Observation: `plugins/:pluginId` and `plugins/repositories` are both declared; React Router ranking resolves `repositories` to the static route first.

### Help-button URLs (`constants/helpLinks.ts`)

`/dashboard/devices` -> jellyfin.org/docs/general/server/devices; `/dashboard/libraries` -> .../server/libraries; `/dashboard/livetv`, `/dashboard/livetv/tuner`, `/dashboard/recordings` -> .../server/live-tv/; `/dashboard/livetv/guide` -> .../live-tv/setup-guide#adding-guide-data; `/dashboard/networking` -> .../general/networking/; `/dashboard/playback/transcoding` -> .../server/transcoding; `/dashboard/plugins` -> .../server/plugins/; `/dashboard/plugins/repositories` -> .../plugins/#repositories; `/dashboard/branding` and `/dashboard/settings` -> .../server/settings; `/dashboard/tasks` -> .../server/tasks; `/dashboard/users` -> .../users/adding-managing-users; user sub-pages -> .../server/users/; `/dashboard/backups` -> .../administration/backup-and-restore/. Note the key `/dashboard/recordings` does not match the real route `/dashboard/livetv/recordings`.

---

## 3. Page by page

Common patterns for the React pages built on the newer pattern (settings, branding, libraries display/metadata/nfo, playback, livetv recordings, logs): the page loads the config with React Query, the form is a React Router `<Form method='POST'>`, the route `action` reads form data, fetches the current config fresh, overwrites only its own fields, saves, invalidates the query, and returns `{ isSaved: true }`; the page then shows an inline MUI success `Alert` with `SettingsSaved` ("Settings saved."). Load failure shows an error alert in place of the form. Save failure is not handled in the pages (it goes to the router error boundary).

### 3.1 Dashboard home (`/dashboard`)

File `routes/index.tsx`. Layout (MUI Grid, spacing 3): left column [ServerInfoWidget, ItemCountsWidget, RunningTasksWidget, DevicesWidget], middle column [ActivityLogWidget], right column [AlertsLogWidget, ServerPathWidget].

- Tasks come from `useLiveTasks({ isHidden: false })`. `isScanning` is true while the `RefreshLibrary` task state is not Idle (also true until tasks load).
- Actions:
  - Scan libraries: starts the task whose `Key === 'RefreshLibrary'` through `useStartTask` (`getScheduledTasksApi.startTask({ taskId })`). No-op if the task is missing. No confirmation.
  - Restart: confirm dialog (title `Restart`, text `MessageConfirmRestart`, red confirm `Restart`) then `restartServer.mutate()` = `getSystemApi(api).restartApplication()` (`POST /System/Restart`).
  - Shutdown: confirm dialog (title `ButtonShutdown`, text `MessageConfirmShutdown`, red confirm `ButtonShutdown`) then `shutdownServer.mutate()` (`POST /System/Shutdown`).

Widgets:

1. **Server info** (`ServerInfoWidget.tsx`). Title `TabServer` (links to `/dashboard/settings`). Rows: `LabelServerName` -> `ServerName`; `LabelServerVersion` -> `Version`; `LabelWebVersion` -> build constant `__PACKAGE_JSON_VERSION__`; `LabelBuildVersion` -> `__JF_BUILD_VERSION__`. Buttons: `ButtonScanAllLibraries` (Refresh icon, disabled while scanning), `Restart` (error colour), `ButtonShutdown` (error colour). Data from `useSystemInfo` (endpoint not visible; `GET /System/Info` (`SystemApi.getSystemInfo`, confirmed in the inventory)). Skeletons while pending. No polling visible.
2. **Item counts** (`ItemCountsWidget.tsx`, hook `useItemCounts`, `getLibraryApi(api).getItemCounts` (the SDK class is `LibraryApi`, not `ItemsApi`) = `GET /Items/Counts`, query `userId`, `isFavorite`). Cards: Movies (`Movies`); TV (`Series`, `Episodes`); Music (`Albums`, `Songs`); Music videos (`MusicVideos`); Books (`Books`); Collections (`Collections`). After load a card is shown only if at least one of its metrics is non-zero; while loading all cards show.
3. **Running tasks** (`RunningTasksWidget.tsx`). Title `HeaderRunningTasks`, links to `/dashboard/tasks`. Lists tasks whose `State` is Running with a `TaskProgress` bar each; renders nothing when none run. No controls.
4. **Devices / active sessions** (`DevicesWidget.tsx`, title `HeaderDevices`, links to `/dashboard/devices`). One `DeviceCard` per active session from `useLiveSessions()`. Filtering (`filterSessions.ts`): keep a session only if it has `LastActivityDate`, was active within the last 95 seconds, and has a `NowPlayingItem` or a `UserId`.
   - Live updates (`hooks/useLiveSessions.ts`): query `getSessionApi.getSessions({ activeWithinSeconds: 960 })`; on mount sends websocket message `SessionsStart` with payload `'0,1500'`; listens for `Sessions` messages and merges each filtered session into the cache by `DeviceId` (adds or replaces, never removes); sends `SessionsStop` on unmount. Fallback poll every 2000 ms that invalidates the query only when the websocket message channel is closed.
   - `DeviceCard` (`features/devices/components/DeviceCard.tsx`) shows: device icon (`getDeviceIcon`), `DeviceName`, client name + `ApplicationVersion`, `UserName`; when playing: blurred backdrop image (`getNowPlayingImageUrl`), logo or title text (`getNowPlayingName`), start/end time (`getSessionNowPlayingTime`), a buffered progress bar (`PositionTicks` over `RunTimeTicks`, buffer from `TranscodingInfo.CompletionPercentage`).
   - Buttons (all gated by `canControl = device.ServerId && device.SupportsRemoteControl`, except Info):
     - Play/Pause: `getSessionApi.sendPlaystateCommand` with `PlaystateCommand.PlayPause` (`POST /Sessions/{sessionId}/Playing/{command}`, optional query `seekPositionTicks`, `controllingUserId`). Needs active playback.
     - Stop: same call with `PlaystateCommand.Stop`.
     - Info (needs active playback): alert whose title/text depend on `playmethodhelper.getDisplayPlayMethod`: `Remuxing` + `RemuxHelp1`/`RemuxHelp2`; `DirectStreaming` + `DirectStreamHelp1`/`2`; `DirectPlaying` + `DirectPlayHelp`; `Transcoding` + `MediaIsBeingConverted` + `LabelReasonForTranscoding` and one line per `TranscodingInfo.TranscodeReasons` (each reason is its own string key).
     - Message: input dialog (title `HeaderSendMessage`, field `LabelMessageText`, button `ButtonSend`) -> `getSessionApi.sendMessageCommand` with `{ Text, TimeoutMs: 5000 }` (`POST /Sessions/{sessionId}/Message`, body `MessageCommand`). Fixed 5 s timeout, no header field.
5. **Activity** (`ActivityLogWidget.tsx`). Title `HeaderActivity`, link `/dashboard/activity?useractivity=true`. Up to 7 entries of `getActivityLogApi.getLogEntries` with `hasUserId: true`, `minDate` = now minus 24 h (computed once per mount), rendered by `ActivityListItem`. 4 skeletons while loading. The hook sets no refetch interval and `refetchOnMount: false`.
6. **Alerts** (`AlertsLogWidget.tsx`). Title `Alerts`, link `/dashboard/activity?useractivity=false`. Up to 4 entries, `hasUserId: false`, last 7 days. Renders nothing when loading or empty.
7. **Paths / storage** (`ServerPathWidget.tsx`). Title `HeaderPaths`, link `/dashboard/settings`. Seven `StorageListItem` rows from `useSystemStorage` (`getSystemApi.getSystemStorage`, no refetch interval, no refetch on focus): `LabelCache` (`CacheFolder`), `LabelImageCache` (`ImageCacheFolder`), `LabelProgramData` (`ProgramDataFolder`), `LabelLogs` (`LogFolder`), `LabelMetadata` (`InternalMetadataFolder`), `LabelTranscodes` (`TranscodingTempFolder`), `LabelWeb` (`WebFolder`). Each row: storage-type icon with tooltip (translated `StorageType.<type>`), path, usage bar (red at >= 90 %, amber at >= 80 %, green otherwise), text `used / total` (`?` when unknown). Free space is not shown.

### 3.2 General settings (`/dashboard/settings`)

`routes/settings/index.tsx`. Read `getConfigurationApi.getConfiguration()` (`GET /System/Configuration`), save `updateConfiguration({ serverConfiguration })` (`POST /System/Configuration`). Language options come from `useLocalizationOptions` (endpoint not visible; server localization options).

| # | Label (key) | Control | Property | Help |
|---|---|---|---|---|
| 1 | Server name (`LabelServerName`) | text | `ServerName` | `LabelServerNameHelp`: "This name will be used to identify the server and will default to the server's hostname." |
| 2 | Preferred display language (`LabelPreferredDisplayLanguage`) | select (localization options) | `UICulture` | `LabelDisplayLanguageHelp` plus link `LearnHowYouCanContribute` -> jellyfin.org translating docs |
| 3 | Cache path (`LabelCachePath`) | text + folder picker (write-validated) | `CachePath` | `LabelCachePathHelp`: custom location for cache files such as images; blank = default. Picker header `HeaderSelectServerCachePath` |
| 4 | Metadata path (`LabelMetadataPath`) | text + folder picker (write-validated) | `MetadataPath` | `LabelMetadataPathHelp`. Picker header `HeaderSelectMetadataPath` |
| 5 | Enable Quick Connect on this server (`EnableQuickConnect`) | checkbox | `QuickConnectAvailable` | none. Section heading `QuickConnect` |
| 6 | Parallel library scan tasks limit (`LibraryScanFanoutConcurrency`) | number min 0 step 1 | `LibraryScanFanoutConcurrency` | `LibraryScanFanoutConcurrencyHelp` (empty/0 = server chooses). Section heading `HeaderPerformance` |
| 7 | Parallel image encoding limit (`LabelParallelImageEncodingLimit`) | number min 0 step 1 | `ParallelImageEncodingLimit` | `LabelParallelImageEncodingLimitHelp` |

Section headings `HeaderPaths`, `QuickConnect`, `HeaderPerformance`. Submit `Save`. Folder pickers use the shared `DirectoryBrowser` (section 3.19). No confirmation. Observation: restart-needed hints (cache/metadata path) are not shown.

### 3.3 Branding (`/dashboard/branding`)

`routes/branding/index.tsx`. Reads/writes the named configuration `branding` (`getConfigurationApi.updateNamedConfiguration({ key: 'branding', body })`, `POST /System/Configuration/{key}` with key `branding`. Correction: the inventory also has a dedicated `POST /System/Configuration/Branding` (`SystemApi.updateBrandingConfiguration`, body `BrandingOptionsDto`); a new client should call that one. Both return 204. Splash image: `POST`/`DELETE /Branding/Splashscreen`; anonymous read: `GET /Branding/Configuration`, `GET /Branding/Css`). Options loaded by `useBrandingOptions`.

| Control | Label key | Property | Behavior |
|---|---|---|---|
| Switch | `EnableSplashScreen` ("Enable the splash screen image") | `SplashscreenEnabled` (default false) | Saves immediately on change (own `updateNamedConfiguration` call, spreading default options) and also posts with the form |
| Upload button | `UploadCustomImage` | none | Hidden `<input type=file accept=image/*>`; reads as data URL, sends the Base64 part via `getImageApi.uploadCustomSplashscreen` with `Content-Type` = file type. Disabled unless splash enabled. Errors: `ImageUploadFailed`, `ImageUploadCancelled`. Help `CustomSplashScreenSize` ("16x9 at a minimum size of 1920x1080") |
| Delete button | `DeleteCustomImage` | none | `getImageApi.deleteCustomSplashscreen()`; refreshes preview; error `ImageDeleteFailed`. Disabled unless splash enabled. No confirmation |
| Login disclaimer | `LabelLoginDisclaimer` | `LoginDisclaimer` | multiline textarea (5 rows, monospace); help `LabelLoginDisclaimerHelp` |
| Custom CSS code | `LabelCustomCss` | `CustomCss` | multiline textarea (5-20 rows, no spellcheck); help `LabelCustomCssHelp` |
| Save | `Save` | all three | `updateNamedConfiguration({ key: 'branding', body: JSON.stringify(...) })`, then alert `SettingsSaved` |

Observation: a source FIXME notes the SDK types the splash body as a `File` though a Base64 string is sent.

### 3.4 Users list (`/dashboard/users`)

`routes/users/index.tsx` (legacy-style, id `userProfilesPage`, title `HeaderUsers`).

- Load: `window.ApiClient.getUsers()` (`GET /Users`). No search or filter. Load errors are only logged and the spinner is not hidden.
- Card per user (`components/dashboard/users/UserCardBox.tsx`): primary image or coloured person icon, name, relative last-seen (`LastSeen`, from `LastActivityDate`); disabled users are shown greyscale. Clicking the image links to `/dashboard/users/profile?userId=<id>`; a `more_vert` button `.btnUserMenu` opens the action sheet.
- Header button `#btnAddUser` -> `/dashboard/users/add`.
- Action sheet: `ButtonEditUser` (`mode_edit`) -> profile; `ButtonLibraryAccess` (`lock`) -> access; `ButtonParentalControl` (`person`) -> parental control; `Delete` (`delete`) -> confirm.
- Delete confirm: title `DeleteName` with the user name (or `DeleteUser`), body `DeleteUserConfirmation`, confirm `Delete`. Then `ApiClient.deleteUser(id)` (`DELETE /Users/{id}`) and reload.
- Toast `SettingsSaved` when arriving with `state.openSavedToast`.

### 3.5 Add user (`/dashboard/users/add`)

`routes/users/add.tsx`.

- Fields: Name (`LabelName`, text, required, trimmed); Password (`LabelPassword`, password, optional).
- Library access block (`AccessContainer`): header `HeaderLibraryAccess`, help `LibraryAccessHelp`; master checkbox `.chkEnableAllFolders` (`OptionEnableAccessToAllLibraries`, starts unchecked); list titled `HeaderLibraries` of `Library/MediaFolders?IsHidden=false` checkboxes (hidden while "all" is checked).
- Channel access block (hidden unless `GET Channels` returns items): header `HeaderChannelAccess`, help `ChannelAccessHelp`; master `OptionEnableAccessToAllChannels`; list titled `Channels`.
- Buttons: Save (`Save`, submit), Cancel (`ButtonCancel`, `history.back()`).
- Save: `ApiClient.createUser({ Name, Password })` (`POST /Users/New`), then `ApiClient.updateUserPolicy(id, policy)` setting `EnableAllFolders`, `EnabledFolders`, `EnableAllChannels`, `EnabledChannels`; then navigates to `/dashboard/users/profile?userId=<newId>`.
- Errors: createUser failure toast `ErrorDefault`; policy-update failure only logged, spinner left on; missing `Id`/`Policy` throws uncaught.
- Observation: new users are created with server default policy and the admin must fix the rest on the next page.

### 3.6 User tabs (profile / access / parental control / password)

Tab strip (`components/dashboard/users/SectionTabs.tsx`), always all four, order: Profile (`Profile`, `/dashboard/users/profile`), Access (`TabAccess`, `/dashboard/users/access`), Parental Control (`TabParentalControl`, `/dashboard/users/parentalcontrol`), Password (`HeaderPassword`, `/dashboard/users/password`). All pages require `?userId=`; a missing id logs an error and loads nothing.

#### Profile (`/dashboard/users/profile`)

`routes/users/profile.tsx`. Header shows the user name. Link button `ButtonEditOtherUserPreferences` ("Edit this user's profile, image and personal preferences.") -> `mypreferencesmenu?userId=<id>` (section 4.14).

Load: `getUser` (`GET /Users/{id}`), `GET Auth/Providers`, `GET Auth/PasswordResetProviders`, `GET Channels?SupportsMediaDeletion=true`, `GET Library/MediaFolders?IsHidden=false`, `getNamedConfiguration('network')`.

| Label (key) | Control | Property | Visibility / notes |
|---|---|---|---|
| Name (`LabelName`) | text | `UserDto.Name` | trimmed |
| Authentication Provider (`LabelAuthProvider`) | select | `Policy.AuthenticationProviderId` | only when 2+ providers; help `AuthProviderHelp` |
| Password Reset Provider (`LabelPasswordResetProvider`) | select | `Policy.PasswordResetProviderId` | only when 2+ providers; help `PasswordResetProviderHelp` |
| `AllowRemoteAccess` | checkbox | `Policy.EnableRemoteAccess` | shown only if network config `EnableRemoteAccess` is true; checked when null/true; help `AllowRemoteAccessHelp` |
| Allow this user to manage the server (`OptionAllowUserToManageServer`) | checkbox | `IsAdministrator` | |
| Allow this user to manage collections (`AllowCollectionManagement`) | checkbox | `EnableCollectionManagement` | |
| Allow this user to edit subtitles (`AllowSubtitleManagement`) | checkbox | `EnableSubtitleManagement` | |
| Section `HeaderFeatureAccess`: Allow Live TV access (`OptionAllowBrowsingLiveTv`) | checkbox | `EnableLiveTvAccess` | |
| Allow Live TV recording management (`OptionAllowManageLiveTv`) | checkbox | `EnableLiveTvManagement` | |
| Section `HeaderPlayback`: Allow media playback (`OptionAllowMediaPlayback`) | checkbox | `EnableMediaPlayback` | section help `OptionAllowMediaPlaybackTranscodingHelp` |
| `OptionAllowAudioPlaybackTranscoding` | checkbox | `EnableAudioPlaybackTranscoding` | |
| `OptionAllowVideoPlaybackTranscoding` | checkbox | `EnableVideoPlaybackTranscoding` | |
| `OptionAllowVideoPlaybackRemuxing` | checkbox | `EnablePlaybackRemuxing` | |
| `OptionForceRemoteSourceTranscoding` | checkbox | `ForceRemoteSourceTranscoding` | |
| Internet streaming bitrate limit (`LabelRemoteClientBitrateLimit`) | number Mbps, min 0, step .25 | `RemoteClientBitrateLimit` (bits = floor(1e6 x value); blank = 0) | helps `LabelRemoteClientBitrateLimitHelp`, `LabelUserRemoteClientBitrateLimitHelp` |
| SyncPlay access (`LabelSyncPlayAccess`) | select `CreateAndJoinGroups` / `JoinGroups` / `None` | `SyncPlayAccess` | help `SyncPlayAccessHelp` |
| `HeaderAllowMediaDeletionFrom`: "All libraries" (`AllLibraries`) | checkbox | `EnableContentDeletion` | hides the per-folder list when checked |
| per-folder checkboxes (media folders + channels supporting deletion) | checkboxes | `EnableContentDeletionFromFolders` (`[]` when "all") | |
| Section `HeaderRemoteControl`: `OptionAllowRemoteControlOthers` | checkbox | `EnableRemoteControlOfOtherUsers` | |
| `OptionAllowRemoteSharedDevices` | checkbox | `EnableSharedDeviceControl` | help `OptionAllowRemoteSharedDevicesHelp` |
| `OptionAllowContentDownload` | checkbox | `EnableContentDownloading` | help `OptionAllowContentDownloadHelp` |
| Disable this user (`OptionDisableUser`) | checkbox | `IsDisabled` | help `OptionDisableUserHelp`; banner `HeaderThisUserIsCurrentlyDisabled` / `MessageReenableUser` when disabled |
| Hide this user from login screens (`OptionHideUser`) | checkbox | `IsHidden` | help `OptionHideUserFromLoginHelp` |
| Failed login tries before user is locked out (`LabelUserLoginAttemptsBeforeLockout`) | number min -1 | `LoginAttemptsBeforeLockout` | helps `OptionLoginAttemptsBeforeLockout`, `OptionLoginAttemptsBeforeLockoutHelp` |
| Maximum number of simultaneous user sessions (`LabelUserMaxActiveSessions`) | number min 0 | `MaxActiveSessions` | helps `OptionMaxActiveSessions`, `OptionMaxActiveSessionsHelp` |

Save writes 24 policy properties (IsAdministrator, IsHidden, IsDisabled, EnableRemoteControlOfOtherUsers, EnableLiveTvManagement, EnableLiveTvAccess, EnableSharedDeviceControl, EnableMediaPlayback, EnableAudioPlaybackTranscoding, EnableVideoPlaybackTranscoding, EnablePlaybackRemuxing, EnableCollectionManagement, EnableSubtitleManagement, ForceRemoteSourceTranscoding, EnableContentDownloading, EnableRemoteAccess, RemoteClientBitrateLimit, LoginAttemptsBeforeLockout, MaxActiveSessions, AuthenticationProviderId, PasswordResetProviderId, EnableContentDeletion, EnableContentDeletionFromFolders, SyncPlayAccess) plus `Name`: it re-fetches the user, then `updateUser` (CORRECTED: `POST /Users?userId={id}` with body `UserDto`, policy DefaultAuthorization; the draft's `POST /Users/{id}` does not exist) then `updateUserPolicy` (`POST /Users/{userId}/Policy`, body `UserPolicy`), then navigates to `/dashboard/users` with the saved toast. Cancel: `history.back()`. No confirmations; errors only logged. Source quirks: lockout/max-sessions defaults use `String(x) || default` and show "undefined" when unset; folder checkbox pre-check uses `!= -1` so a missing array shows everything checked.

#### Access (`/dashboard/users/access`)

`routes/users/access.tsx` (id `userLibraryAccessPage`). Three blocks, each a master checkbox that hides its list when checked:

- Libraries: header `HeaderLibraryAccess`, master `OptionEnableAccessToAllLibraries` -> `EnableAllFolders`, list `HeaderLibraries` -> `EnabledFolders` (from `Library/MediaFolders?IsHidden=false`), help `LibraryAccessHelp`.
- Channels (hidden unless `GET Channels` returns items): header `HeaderChannelAccess`, master `OptionEnableAccessToAllChannels` -> `EnableAllChannels`, list `Channels` -> `EnabledChannels`, help `ChannelAccessHelp`.
- Devices (hidden when the user is an administrator): header `HeaderDeviceAccess`, master `OptionEnableAccessFromAllDevices` -> `EnableAllDevices`, list `HeaderDevices` -> `EnabledDevices` (from `GET Devices`; label `[CustomName||Name, AppName]` joined with " - "), help `DeviceAccessHelp`.

Save re-fetches the user, sets the three pairs, sets `BlockedChannels` and `BlockedMediaFolders` to null, calls `updateUserPolicy`, shows toast `SettingsSaved`. On failure only logged, spinner stuck. Listeners are re-attached without cleanup (accumulate).

#### Parental control (`/dashboard/users/parentalcontrol`)

`routes/users/parentalcontrol.tsx`.

- Maximum allowed parental rating (`LabelMaxParentalRating`, help `MaxParentalRatingHelp`): select `#selectMaxParentalRating`, blank first, options from `ApiClient.getParentalRatings()` (`GET /Localization/ParentalRatings`) with `RatingScore != null`; ratings sharing score and sub-score are merged and joined with `/`. Writes `MaxParentalRating` and `MaxParentalSubRating`; blank saves null (may save undefined, source quirk). On load an exact score+subscore match is selected, else the highest rating with score <= user's.
- Block items with no or unrecognized rating information (`HeaderBlockItemsWithNoRating`): checkboxes `Books`->`Book`, `Channels`->`ChannelContent`, `LiveTV`->`LiveTvChannel`, `Movies`->`Movie`, `Music`->`Music`, `Trailers`->`Trailer`, `Shows`->`Series`; writes `BlockUnratedItems`.
- Allow items with tags (`LabelAllowContentWithTags`, help `AllowContentWithTagsHelp`) -> `AllowedTags`; Block items with tags (`LabelBlockContentWithTags`, help `BlockContentWithTagsHelp`) -> `BlockedTags`. Each has an add (+) button opening a prompt labeled `LabelTag` (duplicates ignored) and a removable tag list.
- Access schedule (`HeaderAccessSchedule`, help `HeaderAccessScheduleHelp`, hidden for administrators) -> `AccessSchedules`. Add button opens the access schedule dialog (`components/accessSchedule/accessSchedule.js`): Day select (default Sunday), Start select, End select (half-hour steps 0-23.5, plus 24; default 0). Validation: start must be strictly less than end, else alert `ErrorStartHourGreaterThanEnd`. Rows show the day and "start - end" and have a delete icon (title hardcoded "Delete"). No edit of an existing row.
- Save re-fetches, `updateUserPolicy` via `ServerConnections.getCurrentApiClientAsync()`, toast `SettingsSaved`. Failure only logged. Observation: loads via `window.ApiClient`, saves via `ServerConnections` (two different client access paths in one page).

#### Password (`/dashboard/users/password`)

`routes/users/password.tsx` + `UserPasswordForm.tsx`. Header user name.

- The form (`.passwordSection`) is shown only if the signed-in user is an administrator or the target user's `Policy.EnableUserPreferenceAccess` is on.
- Fields: Current password (`LabelCurrentPassword`, shown only if the target has a password), New password (`LabelNewPassword`), Confirm (`LabelNewPasswordConfirm`).
- Buttons: Save (`SavePassword`); Reset password (`btnResetPassword`, `ResetPassword`; shown only if the target has a password and is not an administrator).
- Validation: mismatch toast `PasswordMatchError`; empty new password for an administrator target toast `PasswordMissingSaveError`; an empty password is allowed for non-admin targets (clears the password). If the current-password field is hidden, current password is sent as empty.
- Calls: `ApiClient.updateUserPassword(userId, currentPassword, newPassword)` (CORRECTED: `POST /Users/Password?userId={id}`, body `UpdateUserPassword` = `CurrentPw`, `NewPw`, `ResetPassword`, plus a legacy sha1 `CurrentPassword`; the draft's `/Users/{id}/Password` does not exist in the inventory), toast `PasswordSaved`, failure alert title `HeaderLoginFailure` text `MessageInvalidUser`. Reset: confirm `PasswordResetConfirmation` (title `ResetPassword`), `ApiClient.resetUserPassword(userId)` (the inventory has no separate reset operation; the only candidate is `POST /Users/Password?userId={id}` with `ResetPassword: true`; the legacy apiclient's own path was not read), alert `PasswordResetComplete`.

### 3.7 Libraries (`/dashboard/libraries`)

`routes/libraries/index.tsx` (id `mediaLibraryPage`). Data: `useVirtualFolders()` (key `['VirtualFolders']`, `getLibraryStructureApi.getVirtualFolders` `GET /Library/VirtualFolders` (policy FirstTimeSetupOrElevated)), `useLiveTasks({ isHidden: false })`.

- Buttons: Add Media Library (`ButtonAddMediaLibrary`, Add icon) opens `MediaLibraryCreator` with `getCollectionTypeOptions()` (`features/libraries/utils/collectionTypeOptions.ts`) and `refresh: true`; if it resolves true, invalidates `['VirtualFolders']`. Scan All Libraries (`ButtonScanAllLibraries`) starts the `RefreshLibrary` task; shows a loading spinner while the task is not Idle; a `TaskProgress` bar appears next to it while Running.
- Grid of `LibraryCard`s (xs 12, sm 6, md 3, lg 2.4 columns). Card (260 px high): name, subtitle = collection type name or `Other`, primary image or type icon. Clicking the card opens the library editor. A menu button offers:
  - `EditImages` -> shared image editor for the library item (invalidates list on close);
  - `ManageLibrary` -> `MediaLibraryEditor` (invalidates list if changed);
  - `ButtonRename` -> input dialog (title `ButtonRename`, label `LabelNewName`, help `MessageRenameMediaFolder`), `renameVirtualFolder({ name, newName, refreshLibrary: true })` (`POST /Library/VirtualFolders/Name`, query `name`, `newName`, `refreshLibrary`);
  - `ScanLibrary` -> `RefreshDialog` in `scan` mode for that item (section 4.4);
  - `ButtonRemove` -> confirm (title `HeaderRemoveMediaFolder`, text `MessageAreYouSureYouWishToRemoveMediaFolder` + `MessageTheFollowingLocationWillBeRemovedFromLibrary` + location list, red `Delete`), `removeVirtualFolder({ name, refreshLibrary: true })` (`DELETE /Library/VirtualFolders`, query `name`, `refreshLibrary`).
- No polling on this page; scan state comes from the live task hook (websocket, see 3.17).

#### Add library dialog (`components/mediaLibraryCreator/`)

Dialog title `ButtonAddMediaLibrary`. Fields: Content type (`LabelContentType`, select `#selectCollectionType`, required, shows a per-type description message); Display name (`LabelDisplayName`, text `#txtValue`, required; auto-filled from the type label unless type is "mixed"); Folders (`Folders`) with an Add button (`Add`) that opens the directory browser (path plus optional network share path); duplicate paths (case-insensitive) are ignored; each folder row can be removed. Below: the shared **library options editor** (next section), embedded and updated on type change. Buttons: `ButtonOk` (submit), back/cancel.

- Validation: no folder -> alert `PleaseAddAtLeastOneFolder`; empty name -> `LibraryNameInvalid`; type "mixed" is sent as null; failure toast `ErrorAddingMediaPathToVirtualFolder`.
- API: `ApiClient.addVirtualFolder(name, type, refresh, libraryOptions)` (`POST /Library/VirtualFolders`: query `name`, `collectionType`, `paths`, `refreshLibrary`; body `AddVirtualFolderDto` carrying `LibraryOptions`), `libraryOptions` includes `PathInfos`.

Content-type options (`getCollectionTypeOptions()`, `src/apps/dashboard/features/libraries/utils/collectionTypeOptions.ts`; the first draft's path without `apps/dashboard/` was wrong) are exactly 8 entries, in this order: (1) empty value, no label (the placeholder row); (2) `Movies` -> `movies`; (3) `TabMusic` -> `music`; (4) `Shows` -> `tvshows`; (5) `Books` -> `books`; (6) `HomeVideosPhotos` -> `homevideos`; (7) `MusicVideos` -> `musicvideos`; (8) `MixedMoviesShows` -> `mixed`. There is no boxsets, photos or playlists option in the creator (those types only exist for folders created elsewhere). The same folder has a second file `metadataOptions.ts` (not read). Selecting `mixed` sends a null type to the server (see above).

#### Edit library dialog (`components/mediaLibraryEditor/`)

Title = library name. Shows the folder list from `LibraryOptions.PathInfos` (fallback `Locations`; section hidden for `boxsets`) and the library options editor. Actions:

- Add path: directory browser -> `ApiClient.addMediaPath(Name, path, networkSharePath, refresh)` (`POST /Library/VirtualFolders/Paths`, query `refreshLibrary`, body `MediaPathDto` = `Name`, `Path`, `PathInfo`); failure toast `ErrorAddingMediaPathToVirtualFolder`.
- Edit path: click a row -> directory browser with the local path read-only, only the network share path changes -> `ApiClient.updateMediaPath(Name, { Path, NetworkPath })` (`POST /Library/VirtualFolders/Paths/Update`, body `UpdateMediaPathRequestDto`); failure reuses `ErrorAddingMediaPathToVirtualFolder`.
- Remove path: confirm (title `HeaderRemoveMediaLocation`, text `MessageConfirmRemoveMediaLocation`, `Delete`) -> `ApiClient.removeMediaPath(Name, location, refresh)` (`DELETE /Library/VirtualFolders/Paths`, query `name`, `path`, `refreshLibrary`); failure `ErrorDefault`.
- Save: `ApiClient.updateVirtualFolderOptions(ItemId, libraryOptions)` (`POST /Library/VirtualFolders/LibraryOptions`, body `UpdateLibraryOptionsDto`). Missing `ItemId` -> alert `LibraryInvalidItemIdError`.
- The list reloads through `ApiClient.getVirtualFolders()`.

#### Library options editor (`components/libraryoptionseditor/`)

Fields in template order (control, property it writes). Defaults come from the template or the loaded options; a new library uses template defaults.

| Section / field (key) | Control | `LibraryOptions` property | Shown for |
|---|---|---|---|
| Section `HeaderLibrarySettings`: Enable the library (`EnableLibrary`, help `EnableLibraryHelp`), default checked | checkbox | `Enabled` | all |
| Metadata download language (`LabelMetadataDownloadLanguage`) | select | `PreferredMetadataLanguage` | when any metadata fetcher exists |
| Country (`LabelCountry`) | select | `MetadataCountryCode` | same |
| Enable photos (`EnablePhotos`, help `EnablePhotosHelp`), default checked | checkbox | `EnablePhotos` | homevideos, photos |
| Special seasons display name (`LabelSpecialSeasonsDisplayName`), "Specials" | text, required for tvshows | `SeasonZeroDisplayName` | tvshows |
| Prefer embedded titles over file names (`PreferEmbeddedTitlesOverFileNames`) | checkbox | `EnableEmbeddedTitles` | movies, tvshows, musicvideos, homevideos, photos, mixed |
| Prefer embedded extras titles (`PreferEmbeddedExtrasTitlesOverFileNames`) | checkbox | `EnableEmbeddedExtrasTitles` | same, only when embedded titles on |
| Prefer embedded episode infos (`PreferEmbeddedEpisodeInfosOverFileNames`) | checkbox | `EnableEmbeddedEpisodeInfos` | tvshows |
| Allow embedded subtitles (`AllowEmbeddedSubtitles`): `AllowAll`/`AllowText`/`AllowImage`/`AllowNone` | select | `AllowEmbeddedSubtitles` | movies, tvshows, musicvideos, "mixed" |
| Enable real-time monitoring (`LabelEnableRealtimeMonitor`), default checked | checkbox | `EnableRealtimeMonitor` | all (advanced) |
| Enable LUFS scan (`LabelEnableLUFSScan`) | checkbox | `EnableLUFSScan` | music |
| Automatically add to collection (`LabelAutomaticallyAddToCollection`) | checkbox | `AutomaticallyAddToCollection` | movies, "mixed" |
| Metadata readers (ordered, local readers; up/down buttons) | list | `LocalMetadataReaderOrder` | hidden if fewer than 2 readers |
| Metadata downloaders per content type (ordered, enable checkboxes) | lists | `TypeOptions[].MetadataFetchers`, `MetadataFetcherOrder` | types that have plugins |
| Automatically refresh metadata every (`LabelAutomaticallyRefreshInternetMetadataEvery`; help `MessageEnablingOptionLongerScans`) | select (Never=0 ...) | `AutomaticRefreshIntervalDays` | when fetchers exist |
| Metadata savers (checkboxes, `data-defaultenabled`) | list | `MetadataSavers` | when any saver exists |
| Image fetchers per content type (ordered, enable checkboxes, "fetcher settings" button opening the image options editor per type) | lists | `TypeOptions[].ImageFetchers`, `ImageFetcherOrder`, `ImageOptions` | |
| Save artwork into media folders (`LabelSaveLocalMetadata`, help `LabelSaveLocalMetadataHelp`) | checkbox | `SaveLocalMetadata` | when image fetchers exist |
| Automatically group series (`OptionAutomaticallyGroupSeries`) | checkbox | `EnableAutomaticSeriesGrouping` | tvshows |
| Media segment providers (ordered, enable) | list | `MediaSegmentProviderOrder`, `DisabledMediaSegmentProviders` | when any provider exists |
| Section `Trickplay`: Extract trickplay images (`OptionExtractTrickplayImage`, help `ExtractTrickplayImagesHelp`) | checkbox | `EnableTrickplayImageExtraction` | video types (not music/photos) |
| During library scan (`LabelExtractTrickplayDuringLibraryScan`) | checkbox | `ExtractTrickplayImagesDuringLibraryScan` | |
| Save trickplay with media (`LabelSaveTrickplayLocally`) | checkbox | `SaveTrickplayWithMedia` | |
| Section `HeaderChapterImages`: Extract chapter images (`OptionExtractChapterImage`) | checkbox | `EnableChapterImageExtraction` | video types |
| During library scan (`LabelExtractChaptersDuringLibraryScan`) | checkbox | `ExtractChapterImagesDuringLibraryScan` | |
| Section `HeaderSubtitleDownloads`: download languages (`LabelDownloadLanguages`) | checkbox list | `SubtitleDownloadLanguages` | when a subtitle fetcher exists |
| Subtitle downloaders (ordered, enable) | list | `SubtitleFetcherOrder`, `DisabledSubtitleFetchers` | |
| Require perfect subtitle match (`OptionRequirePerfectSubtitleMatch`), default checked | checkbox | `RequirePerfectSubtitleMatch` | |
| Skip if audio track present (`LabelSkipIfAudioTrackPresent`) | checkbox | `SkipSubtitlesIfAudioTrackMatches` | |
| Skip if graphical subs present (`LabelSkipIfGraphicalSubsPresent`) | checkbox | `SkipSubtitlesIfEmbeddedSubtitlesPresent` | |
| Save subtitles into media folders (`SaveSubtitlesIntoMediaFolders`), default checked | checkbox | `SaveSubtitlesWithMedia` | |
| Section `Lyrics`: lyric fetchers (ordered, enable) | list | `LyricFetcherOrder`, `DisabledLyricFetchers` | music |
| Save lyrics into media folders (`SaveLyricsIntoMediaFolders`) | checkbox | `SaveLyricsWithMedia` | music |
| Section `LabelAudioTagSettings`: Prefer non-standard artists tag (`PreferNonstandardArtistsTag`) | checkbox | `PreferNonstandardArtistsTag` | music |
| Use custom tag delimiters (`UseCustomTagDelimiters`) | checkbox | `UseCustomTagDelimiters` | music |
| Custom tag delimiters (`LabelCustomTagDelimiters`; default characters `/|;\`) | text, split into characters | `CustomTagDelimiters` | music |
| Delimiter whitelist (`LabelDelimiterWhitelist`) | textarea, one entry per line | `DelimiterWhitelist` | music |

Fixed on save: `EnableArchiveMediaFiles = false`, `EnableInternetProviders = true`. Ordering rule for all lists: plugins sorted by their index in the saved order array; unknown plugins sort first; the first row has only a "down" button. Inclusive lists (metadata, image fetchers) are checked if in the saved list, else `DefaultEnabled`; exclusive lists (subtitle, lyric, segments) are enabled unless in the `Disabled*` list.

Visibility by content type (Y shown): chapter and trickplay sections: movies, tvshows, musicvideos, homevideos, falsy-"mixed"; hidden for music, photos, books, boxsets, playlists and the literal string `'mixed'`. LUFS and lyrics/audio-tag blocks: music only. Group series, season-zero name, embedded episode infos: tvshows only. Embedded subtitles: movies, tvshows, musicvideos, `'mixed'`. Auto-add to collection: movies and `'mixed'`. Enable photos: homevideos, photos. Source inconsistency: "mixed" is tested both as falsy and as the string `'mixed'` with different results (observation).

### 3.8 Libraries display (`/dashboard/libraries/display`)

`routes/libraries/display.tsx`. Writes server config plus named config `metadata`.

| Label (key) | Control | Property |
|---|---|---|
| Date added behavior for new content (`LabelDateAddedBehavior`, help `LabelDateAddedBehaviorHelp`): `OptionDateAddedImportTime` "Use date scanned into the library" / `OptionDateAddedFileTime` "Use file creation date" | select | named config `metadata`: `UseFileCreationTimeForDateAdded` |
| Display a folder view... (`OptionDisplayFolderView`, help `OptionDisplayFolderViewHelp`) | checkbox | `EnableFolderView` |
| Display specials within seasons they aired in (`LabelDisplaySpecialsWithinSeasons`) | checkbox | `DisplaySpecialsWithinSeasons` |
| Group movies into collections (`LabelGroupMoviesIntoCollections`, help) | checkbox | `EnableGroupingMoviesIntoCollections` |
| Group shows into collections (`LabelGroupShowsIntoCollections`, help) | checkbox | `EnableGroupingShowsIntoCollections` |
| Enable external content in suggestions (`OptionEnableExternalContentInSuggestions`, help) | checkbox | `EnableExternalContentInSuggestions` |

Save: `getConfiguration`, set the five booleans, `updateConfiguration`, then `updateNamedConfiguration({ key: 'metadata', ... })`; invalidates both; `SettingsSaved`.

### 3.9 Libraries metadata (`/dashboard/libraries/metadata`)

`routes/libraries/metadata.tsx`. Server config only.

| Label (key) | Control | Property | Help |
|---|---|---|---|
| Language (`LabelLanguage`), under `HeaderPreferredMetadataLanguage` / `DefaultMetadataLangaugeDescription` | select of cultures (`TwoLetterISOLanguageName`) | `PreferredMetadataLanguage` | |
| Country (`LabelCountry`) | select of countries (`TwoLetterISORegionName`) | `MetadataCountryCode` | |
| Interval (`LabelDummyChapterDuration`), under `HeaderDummyChapter` | number min 0 required | `DummyChapterDuration` | `LabelDummyChapterDurationHelp` |
| Resolution (`LabelChapterImageResolution`) | select (`getImageResolutionOptions()`) | `ChapterImageResolution` | `LabelChapterImageResolutionHelp` |

Cultures/countries via `useCultures` / `useCountries` (`GET /Localization/Cultures`, `/Localization/Countries`).

### 3.10 NFO settings (`/dashboard/libraries/nfo`)

`routes/libraries/nfo.tsx`. Named config `xbmcmetadata` (`updateNamedConfiguration({ key: 'xbmcmetadata' })`).

| Label (key) | Control | Property |
|---|---|---|
| Save user watch data to NFO files for (`LabelKodiMetadataUser`, help `LabelKodiMetadataUserHelp`) | select: `None` (empty) or each user (`useUsers()`) | `UserId` |
| Save image paths within NFO files (`LabelKodiMetadataSaveImagePaths`, help) | checkbox | `SaveImagePathsInNfo` |
| Enable path substitution (`LabelKodiMetadataEnablePathSubstitution`, help) | checkbox | `EnablePathSubstitution` |
| Copy extrafanart to extrathumbs field (`LabelKodiMetadataEnableExtraThumbs`, help) | checkbox | `EnableExtraThumbsDuplication` |

Also forces `ReleaseDateFormat = 'yyyy-MM-dd'` (not a field). On submit an alert shows `MetadataSettingChangeHelp`.

### 3.11 Playback: transcoding (`/dashboard/playback/transcoding`)

`routes/playback/transcoding.tsx`. Config: named configuration `encoding` (`EncodingOptions`; `GET`/`POST /System/Configuration/encoding`). Defaults are server-side (the page sets none; only `HardwareAccelerationType` falls back to `none` in the UI). On every submit the page opens an alert (title `TitleHardwareAcceleration`, text `HardwareAccelerationWarning`: "Enabling hardware acceleration may cause instability in some environments...") whatever the type, then posts the full config as JSON. Save: `updateNamedConfiguration({ key: 'encoding', body })`, invalidate, `SettingsSaved`. Load error: `TranscodingLoadError`.

Visibility key: HWA = type is not `none`; HWA-sel = type in {amf, nvenc, qsv, vaapi, rkmpp, videotoolbox} (so `v4l2m2m` is excluded).

| Field (label key) | Control | `EncodingOptions` property | Visible when |
|---|---|---|---|
| Hardware acceleration (`LabelHardwareAccelerationType`, help `LabelHardwareAccelerationTypeHelp` + docs link) | select: None, AMD AMF `amf`, Nvidia NVENC `nvenc`, Intel Quicksync (QSV) `qsv`, Video Acceleration API (VAAPI) `vaapi`, Rockchip MPP (RKMPP) `rkmpp`, Apple VideoToolBox `videotoolbox`, Video4Linux2 (V4L2) `v4l2m2m` | `HardwareAccelerationType` | always (labels other than None are hardcoded English) |
| VA-API Device (`LabelVaapiDevice`, `LabelVaapiDeviceHelp`) | text | `VaapiDevice` | type vaapi |
| QSV Device (`LabelQsvDevice`, `LabelQsvDeviceHelp`) | text | `QsvDevice` | type qsv |
| Heading `LabelEnableHardwareDecodingFor`: one checkbox per codec | checkboxes | entries in `HardwareDecodingCodecs` | HWA; list = `CODECS` filtered by type |
| HEVC 10bit (hardcoded label) | checkbox | `EnableDecodingColorDepth10Hevc` | amf, nvenc, qsv, vaapi, rkmpp |
| VP9 10bit (hardcoded) | checkbox | `EnableDecodingColorDepth10Vp9` | same set |
| HEVC RExt 8/10bit (hardcoded) | checkbox | `EnableDecodingColorDepth10HevcRext` | nvenc, qsv, vaapi |
| HEVC RExt 12bit (hardcoded) | checkbox | `EnableDecodingColorDepth12HevcRext` | nvenc, qsv, vaapi |
| Enable enhanced NVDEC decoder (`EnableEnhancedNvdecDecoder`, help) | checkbox | `EnableEnhancedNvdecDecoder` | nvenc |
| Prefer OS native DXVA or VA-API hardware decoders (`PreferSystemNativeHwDecoder`) | checkbox | `PreferSystemNativeHwDecoder` | qsv |
| Heading `LabelHardwareEncodingOptions`: Enable hardware encoding (`EnableHardwareEncoding`) | checkbox | `EnableHardwareEncoding` | HWA |
| `EnableIntelLowPowerH264HwEncoder` | checkbox | `EnableIntelLowPowerH264HwEncoder` | qsv, vaapi |
| `EnableIntelLowPowerHevcHwEncoder` (help `IntelLowPowerEncHelp` + docs link) | checkbox | `EnableIntelLowPowerHevcHwEncoder` | qsv, vaapi |
| Heading `LabelEncodingFormatOptions` + `EncodingFormatHelp`: Allow encoding in HEVC format (`AllowHevcEncoding`) | checkbox | `AllowHevcEncoding` | always |
| Allow encoding in AV1 format (`AllowAv1Encoding`) | checkbox | `AllowAv1Encoding` | always |
| Enable VPP Tone mapping (`EnableVppTonemapping`, help `AllowVppTonemappingHelp`) | checkbox | `EnableVppTonemapping` | qsv, vaapi |
| `LabelVppTonemappingBrightness` (help) | number 0-100 step 0.00001 | `VppTonemappingBrightness` | qsv, vaapi |
| `LabelVppTonemappingContrast` (help) | number 1-2 step 0.00001 | `VppTonemappingContrast` | qsv, vaapi |
| `EnableVideoToolboxTonemapping` (help `AllowVideoToolboxTonemappingHelp`) | checkbox | `EnableVideoToolboxTonemapping` | videotoolbox |
| Enable Tone mapping (`EnableTonemapping`, help `AllowTonemappingHelp`) | checkbox | `EnableTonemapping` | HWA-sel only |
| Tone mapping algorithm (`LabelTonemappingAlgorithm`, help `TonemappingAlgorithmHelp` + FFmpeg link) | select: none, clip, linear, gamma, reinhard, hable, mobius, bt2390 | `TonemappingAlgorithm` | type `none` or HWA-sel (the whole tone-mapping group is hidden for v4l2m2m) |
| `LabelTonemappingMode` (help) | select: auto, max, rgb, lum, itp | `TonemappingMode` | HWA-sel only |
| Tone mapping range (`LabelTonemappingRange`, help) | select: auto, tv, pc | `TonemappingRange` | none or HWA-sel |
| Tone mapping desat (`LabelTonemappingDesat`) | number min 0 step 0.00001 | `TonemappingDesat` | same |
| Tone mapping peak (`LabelTonemappingPeak`) | number | `TonemappingPeak` | same |
| Tone mapping param (`LabelTonemappingParam`) | number | `TonemappingParam` | same |
| Transcoding thread count (`LabelTranscodingThreadCount`, help) | select: -1 Auto, 1-16, 0 `OptionMax` | `EncodingThreadCount` | always |
| FFmpeg path (`LabelffmpegPath`, help) | text, DISABLED (read only; shows `EncoderAppPathDisplay`) | none | always |
| Transcode path (`LabelTranscodePath`, help `LabelTranscodingTempPathHelp`) | text + folder picker (write-validated; header `HeaderSelectTranscodingPath`) | `TranscodingTempPath` | always |
| Fallback font path (`LabelFallbackFontPath`, help) | text + folder picker | `FallbackFontPath` | always |
| Enable fallback fonts (`EnableFallbackFont`, help) | checkbox | `EnableFallbackFont` | always |
| Enable VBR audio encoding (`LabelEnableAudioVbr`, help) | checkbox | `EnableAudioVbr` | always |
| Audio boost when downmixing (`LabelDownMixAudioScale`) | number 0.5-3 step 0.1 required | `DownMixAudioBoost` | always |
| Stereo downmix algorithm (`LabelStereoDownmixAlgorithm`, help) | select None, Dave750, NightmodeDialogue, Rfc7845, Ac4 | `DownMixStereoAlgorithm` | always |
| Max muxing queue size (`LabelMaxMuxingQueueSize`, help) | text | `MaxMuxingQueueSize` | always |
| Encoding preset (`LabelEncoderPreset`, help) | select: auto, veryslow, slower, slow, medium, fast, faster, veryfast, superfast, ultrafast | `EncoderPreset` | always |
| H.265 encoding CRF (`LabelH265Crf`) | number 0-51 | `H265Crf` | always |
| H.264 encoding CRF (`LabelH264Crf`, help `H264CrfHelp`) | number 0-51 | `H264Crf` | always |
| Deinterlacing method (`LabelDeinterlaceMethod`, help) | select yadif, bwdif | `DeinterlaceMethod` | always |
| `UseDoubleRateDeinterlacing` (help) | checkbox | `DeinterlaceDoubleRate` | always |
| Allow subtitle extraction on the fly (`AllowOnTheFlySubtitleExtraction`, help) | checkbox | `EnableSubtitleExtraction` | always |
| Throttle Transcodes (`AllowFfmpegThrottling`, help) | checkbox | `EnableThrottling` | always |
| Delete segments (`AllowSegmentDeletion`, help) | checkbox | `EnableSegmentDeletion` | always |
| Throttle after (`LabelThrottleDelaySeconds`) | number 10-3600 | `ThrottleDelaySeconds` | always |
| Time to keep segments (`LabelSegmentKeepSeconds`) | number 10-3600 | `SegmentKeepSeconds` | always |

`CODECS` table (`features/playback/constants/codecs.ts`): H264 `h264` (amf, nvenc, qsv, vaapi, rkmpp, videotoolbox, v4l2m2m); HEVC `hevc` (amf, nvenc, qsv, vaapi, rkmpp, videotoolbox); MPEG1 `mpeg1video` (rkmpp); MPEG2 `mpeg2video` (amf, nvenc, qsv, vaapi, rkmpp); MPEG4 `mpeg4` (nvenc, rkmpp); VC1 `vc1` (amf, nvenc, qsv, vaapi); VP8 `vp8` (nvenc, qsv, vaapi, rkmpp, videotoolbox); VP9 `vp9` (amf, nvenc, qsv, vaapi, rkmpp, videotoolbox); AV1 `av1` (amf, nvenc, qsv, vaapi, rkmpp, videotoolbox).

Observations: FFmpeg path is read-only here; the warning appears on every save even for "none"; several labels are hardcoded English; controls with `step` constraints only enforce in the browser.

### 3.12 Playback: resume, streaming, trickplay

**Resume** (`routes/playback/resume.tsx`, title `ButtonResume`): server config. Five required number fields, integer-parsed (ranges are HTML hints only): Minimum resume percentage (`LabelMinResumePercentage`, 0-100) -> `MinResumePct`; Maximum resume percentage (`LabelMaxResumePercentage`, 1-100) -> `MaxResumePct`; Minimum Audiobook resume in minutes (`LabelMinAudiobookResume`, 0-100) -> `MinAudiobookResume`; Audiobook remaining minutes to resume (`LabelMaxAudiobookResume`, 1-100) -> `MaxAudiobookResume`; Minimum resume duration (`LabelMinResumeDuration`, min 0) -> `MinResumeDurationSeconds`. Each has a `...Help`. No cross-field validation (min < max is not checked).

**Streaming** (`routes/playback/streaming.tsx`, title `TabStreaming`): one field, Internet streaming bitrate limit (Mbps) (`LabelRemoteClientBitrateLimit`, help `LabelRemoteClientBitrateLimitHelp`, number min 0 step 0.25) -> `RemoteClientBitrateLimit` (shown divided by 1,000,000, saved x1,000,000 truncated; empty = 0).

**Trickplay** (`routes/playback/trickplay.tsx`, title `Trickplay`): server config `TrickplayOptions`.

| Label (key) | Control | Property | Empty-field fallback |
|---|---|---|---|
| Enable hardware decoding (`LabelTrickplayAccel`) | checkbox | `EnableHwAcceleration` | false |
| `LabelTrickplayAccelEncoding` (help) | checkbox | `EnableHwEncoding` | false |
| `LabelTrickplayKeyFrameOnlyExtraction` (help) | checkbox | `EnableKeyFrameOnlyExtraction` | false |
| Scan Behavior (`LabelScanBehavior`): `NonBlockingScan` / `BlockingScan` | select | `ScanBehavior` (`NonBlocking`/`Blocking`) | |
| Process Priority (`LabelProcessPriority`): High, AboveNormal, Normal, BelowNormal, Idle (`PriorityHigh` ...) | select | `ProcessPriority` | |
| Image Interval (`LabelImageInterval`, min 1) | number | `Interval` | 10000 |
| Width Resolutions (`LabelWidthResolutions`, pattern `[0-9,]*`) | text | `WidthResolutions` (comma list -> numbers; only the first space is stripped, source quirk) | none |
| Tile Width / Tile Height (min 1) | number | `TileWidth`, `TileHeight` | 10 / 10 |
| JPEG Quality (1-100) | number | `JpegQuality` | 90 |
| Qscale (2-31) | number | `Qscale` | 4 |
| FFmpeg Threads (min 0) | number | `ProcessThreads` | 1 |

### 3.13 Devices (`/dashboard/devices`)

`routes/devices/index.tsx`. Table, 25 per page, compact. Data `useDevices({})` = `getDevicesApi.getDevices` (`GET /Devices`, optional `userId`); no polling; plus `useUsersDetails`.

- Columns: Last Active (`LastActive`, date-time range filter), Device (`LabelDevice`, shows `CustomName` or `DeviceName`, editable inline), App (`LabelAppName`, app name + version), User (`LabelUser`, avatar + last user, multi-select filter), Actions.
- Row actions: Edit (`Edit`) -> inline rename; saved with `useUpdateDevice` (`getDevicesApi.updateDeviceOptions`, `POST /Devices/Options` with `{ CustomName }`; trimmed, only if changed; empty clears). Delete (`Delete`): disabled for the device the admin is using; confirm title `HeaderDeleteDevice`, text `DeleteDeviceConfirmation`, button `Delete`; `useDeleteDevice` (`DELETE /Devices`).
- Toolbar: Delete All (`DeleteAll`, red): confirm title `HeaderDeleteDevices`, text `DeleteDevicesConfirmation`, `Delete`. It iterates all devices except the current one (matched by id). Failures only logged. No search box; per-column filters only.

### 3.14 Activity (`/dashboard/activity`)

`routes/activity/index.tsx`. Data `useLogEntries` = `getActivityLogApi.getLogEntries({ startIndex, limit, hasUserId })` (`GET /System/ActivityLog/Entries`), manual pagination (default 25), no refetch interval, `refetchOnMount: false`.

- Toggle group All / User / System, stored in the URL as `useractivity` (absent = all, `true` = user, `false` = system) -> `hasUserId` true / false / undefined.
- Columns (px width): Date (160, datetime-range filter), Severity (90, multi-select of translated log levels), User (75, hidden in System view, multi-select of names), Name (270), Overview (170), Type (150), Actions (60; `ActionsCell` keyed on `ItemId`, link to the item).
- No free-text search; no export. Rows show a severity chip (`LogLevelChip`).
- The dashboard widgets link here with `?useractivity=true|false`.

### 3.15 Live TV (`/dashboard/livetv`)

`routes/livetv/index.tsx` (id `liveTvStatusPage`). Data: named config `livetv` (`LiveTvOptions`: `TunerHosts`, `ListingProviders`) and live tasks. Load error: `HeaderError`.

- Tuner devices (`HeaderTunerDevices`): button `ButtonAddTunerDevice` -> `/dashboard/livetv/tuner`. One `TunerDeviceCard` per host: DVR icon, title `FriendlyName` or type name (`getTunerName`), subtitle `Url`. Click or menu `Edit` -> `/dashboard/livetv/tuner?id=<Id>`. Menu `Delete`: confirm (title `HeaderDeleteDevice`, text `MessageConfirmDeleteTunerDevice`, red `Delete`), `useDeleteTuner` (`DELETE /LiveTv/TunerHosts?id=`).
- TV Guide Data Providers (`HeaderGuideProviders`): button `ButtonAddProvider` opens a menu with two hardcoded English entries, Schedules Direct and XMLTV -> `/dashboard/livetv/guide?type=schedulesdirect|xmltv`. Button `ButtonRefreshGuideData` starts the `RefreshGuide` task, with loading state and `TaskProgress`.
- Provider rows (only when any): DVR icon, name from `getProviderName`, secondary line `Path` or `ListingsId`. Click opens `getProviderConfigurationUrl(type)&id=<Id>` (supports `xmltv` and `schedulesdirect` only; any other type returns undefined, so such providers cannot be edited). Menu: Map Channels (opens the channel mapper dialog) and Delete (confirm title `HeaderDeleteProvider`, text `MessageConfirmDeleteGuideProvider`, red `Delete`; `useDeleteProvider`, `DELETE /LiveTv/ListingProviders?id=`).

#### Add / edit tuner (`/dashboard/livetv/tuner`, LEGACY)

`apps/dashboard/controllers/livetvtuner.{html,js}` (id `liveTvTunerPage`). Heading `HeaderLiveTvTunerSetup`. Type list from `GET LiveTv/TunerHosts/Types` plus an "Other" option. New tuner: a "Detect" button (`HeaderDetectMyDevices`) opens the tuner picker dialog (`components/tunerPicker.js`: dialog `HeaderLiveTvTunerSetup`, `GET LiveTv/Tuners/Discover?NewDevicesOnly=true`, shows `DetectingDevices`, `HeaderNewDevices`, empty `NoNewDevicesFound`; each result card shows type name, `FriendlyName`, `Url`; picking one fills the form). Editing: the type select is disabled; the host is found in the `livetv` named config by `Id`.

Fields (html classes; none have ids) and `TunerHostInfo` property:

| Label (key) | Control | Property | Shown for |
|---|---|---|---|
| Tuner type (`LabelTunerType`) | select, required | `Type` (nextpvr is sent as `Type='m3u'`, `Source='nextpvr'`) | always |
| Friendly name (`LabelFriendlyName`) | text | `FriendlyName` | hdhomerun, m3u |
| File or URL (`LabelFileOrUrl`) / tuner IP for HDHomeRun, required for m3u | text + browse-file button | `Url` | hdhomerun, m3u |
| User agent (`LabelUserAgent`, help `UserAgentHelp`) | text | `UserAgent` | m3u |
| Simultaneous stream limit (`LabelSimultaneousConnectionLimit`, help; min 0, default 0, required for m3u) | number | `TunerCount` | m3u |
| Fallback max streaming bitrate (`LabelFallbackMaxStreamingBitrate`, help; min 1, default 30, Mbps) | number | `FallbackMaxStreamingBitrate` (x1e6) | hdhomerun, m3u |
| Import only favorite channels (`LabelImportOnlyFavoriteChannels`, help `ImportFavoriteChannelsHelp`) | checkbox | `ImportFavoritesOnly` | hdhomerun |
| Allow hardware transcoding (`LabelAllowHWTranscoding`, help) | checkbox | `AllowHWTranscoding` | hdhomerun |
| Allow fMP4 transcoding container (`LabelAllowFmp4TranscodingContainer`, help) | checkbox | `AllowFmp4TranscodingContainer` | m3u |
| Allow stream sharing (`LabelAllowStreamSharing`, help; default checked) | checkbox | `AllowStreamSharing` | m3u |
| Enable stream looping (`EnableStreamLooping`, help) | checkbox | `EnableStreamLooping` | m3u |
| Ignore DTS (`IgnoreDts`, help; default checked) | checkbox | `IgnoreDts` | m3u |
| Read input at native framerate (`ReadInputAtNativeFramerate`, help; default checked) | checkbox | `ReadAtNativeFramerate` | m3u |
| DRM message (`DrmChannelsNotImported`) | paragraph | none | hdhomerun |
| hidden `fldDeviceId` | hidden | `DeviceId` | |

"Other" type hides Save. Save and Cancel (`Save`, `ButtonCancel` -> `history.back()`). Save: `POST LiveTv/TunerHosts` (JSON, includes `Id` when editing), then `Dashboard.processServerConfigurationUpdateResult()` and navigate to `dashboard/livetv`; failure alert `ErrorSavingTvProvider`.

#### Add / edit guide provider (`/dashboard/livetv/guide?type=&id=`, LEGACY)

`livetvguideprovider.js` only loads `components/tvproviders/<type>.js` and its `.template.html` into `.providerTemplate`, translates it, and navigates to `dashboard/livetv` when the provider fires `submitted`. It never hides the loading indicator and has no error handling for an unknown type (observation).

**Schedules Direct** (`tvproviders/schedulesdirect.{js,template.html}`):
- Section 1 `GuideProviderLogin`: Username (`LabelUsername`, required), Password (`LabelPassword`, required, sent as typed), Save (`Save`). `POST LiveTv/ListingProviders?ValidateLogin=true` with `{ Type: 'SchedulesDirect', Username, Password, Id? }`. Failure `ErrorSavingTvProvider`; help `MessageCreateAccountAt`.
- Section 2 (shown once username and password exist) `GuideProviderSelectListings`: Country (`LabelCountry`, `#selectCountry`, from `GET LiveTv/ListingProviders/SchedulesDirect/Countries`, region ZZZ dropped, sorted), Zip code (`LabelZipCode`, change reloads lineups), Lineup (`LabelLineup`, `#selectListing`, from `GET LiveTv/ListingProviders/Lineups?Id&Location&Country`; error `ErrorGettingTvLineups`), Enable for all tuners (`OptionEnableForAllTuners`) or per-tuner checkbox list (`HeaderTuners`, from `TunerHosts`, `EnabledTuners`), Save and Cancel. Save: `POST LiveTv/ListingProviders?ValidateListings=true` with `ZipCode`, `Country`, `ListingsId`, `EnableAllTuners`, `EnabledTuners`. No lineup -> `ErrorPleaseSelectLineup`; failure `ErrorAddingListingsToSchedulesDirect`.

**XMLTV** (`tvproviders/xmltv.{js,template.html}`): File or URL (`LabelFileOrUrl`, `XmlTvPathHelp`, required, browse-file button, `Path`); Movie categories (`LabelMovieCategories`, `XmlTvMovieCategoriesHelp`, `MovieCategories`, pipe-separated); Movie prefix (`LabelMoviePrefix`, `MoviePrefix`); Kids categories (`KidsCategories`); News categories (`NewsCategories`); Sports categories (`SportsCategories`); User agent (`LabelUserAgent`, `UserAgent`); Enable for all tuners / tuner list; Save, Cancel. `POST LiveTv/ListingProviders?ValidateListings=true` with `Type='xmltv'`. Fallback `GET LiveTv/ListingProviders/Default` when the id is unknown. Failure alert `ErrorAddingXmlTvFile`.

**Channel mapper dialog** (`components/channelMapper/channelMapper.js`): title `MapChannels`, heading `Channels`. `GET LiveTv/ChannelMappingOptions?providerId=` returns `ProviderName`, `ProviderChannels`, `TunerChannels`. One row per tuner channel with its mapped provider channel (`"<ProviderChannelName> - <ProviderName>"`) and an edit button opening an action sheet of provider channels (sorted by name, current one marked). Choosing one: `POST LiveTv/ChannelMappings` with `{ providerId, tunerChannelId, providerChannelId }`. No confirmation, no error handler (spinner can stick). No auto-map, no search.

### 3.16 DVR / recordings settings (`/dashboard/livetv/recordings`)

`routes/livetv/recordings.tsx`, title `HeaderDVR`. Named config `livetv` (`updateNamedConfiguration({ key: 'livetv' })`); load failure `LiveTVPageLoadError`.

| Label (key) | Control | Property | Help |
|---|---|---|---|
| Number of days of guide data to download (`LabelNumberOfGuideDays`) | select: Auto (empty), 1-14 | `GuideDays` | `LabelNumberOfGuideDaysHelp` |
| Default recording path (`LabelRecordingPath`) | text + picker (write-validated) | `RecordingPath` | `LabelRecordingPathHelp` |
| Movie recording path (`LabelMovieRecordingPath`) | text + picker | `MovieRecordingPath` | |
| Series recording path (`LabelSeriesRecordingPath`) | text + picker | `SeriesRecordingPath` | |
| Start when possible (`LabelStartWhenPossible`, suffix `MinutesBefore`) | text, minutes | `PrePaddingSeconds` (x60) | |
| Stop when possible (`LabelStopWhenPossible`, suffix `MinutesAfter`) | text, minutes | `PostPaddingSeconds` (x60) | |
| Post-processing application (`LabelPostProcessor`) | text + picker | `RecordingPostProcessor` | |
| Post-processor command line arguments (`LabelPostProcessorArguments`) | text | `RecordingPostProcessorArguments` | `LabelPostProcessorArgumentsHelp` |
| Save recording EPG metadata in NFO (`SaveRecordingNFO`) | checkbox | `SaveRecordingNFO` | `SaveRecordingNFOHelp` |
| Save recording EPG images (`SaveRecordingImages`) | checkbox | `SaveRecordingImages` | `SaveRecordingImagesHelp` |

Section headings `HeaderDefaultRecordingSettings`, `HeaderRecordingPostProcessing`, `HeaderRecordingMetadataSaving`. A cleared padding field becomes `NaN`, which serializes to null (source note). There is no list of existing recordings, timers, or series timers in the dashboard.

### 3.17 Networking (`/dashboard/networking`, LEGACY)

`controllers/networking.{html,js}`. Named config `network` (`ApiClient.getNamedConfiguration('network')`, saved with `updateNamedConfiguration('network', config)`). All numeric fields are saved as raw strings.

| Label (key) | Control | `NetworkConfiguration` property | Notes |
|---|---|---|---|
| Local HTTP port number (`LabelLocalHttpServerPortNumber`) | number 1-65535 required | `InternalHttpPort` | |
| Enable HTTPS (`LabelEnableHttps`) | checkbox | `EnableHttps` | |
| Local HTTPS port number (`LabelHttpsPort`) | number | `InternalHttpsPort` | |
| Base URL (`LabelBaseUrl`) | text | `BaseUrl` | |
| Bind to local network address (`LabelBindToLocalNetworkAddress`) | text, comma list | `LocalNetworkAddresses` | non-empty triggers a `SettingsWarning` confirm before saving |
| LAN networks (`LabelLanNetworks`) | text, comma list | `LocalNetworkSubnets` | |
| Known proxies (`LabelKnownProxies`) | text, comma list | `KnownProxies` | |
| Require HTTPS (`LabelRequireHttps`) | checkbox | `RequireHttps` | |
| Custom SSL certificate path (`LabelCustomCertificatePath`) | text + browse button (file or folder) | `CertificatePath` (empty = null) | |
| Certificate password (`LabelCertificatePassword`) | password | `CertificatePassword` (empty = null) | |
| Allow remote connections to this server (`AllowRemoteAccess`) | checkbox | `EnableRemoteAccess` (null = on) | toggles the next four rows |
| Remote IP address filter (`LabelAllowedRemoteAddresses`) | text, comma list | `RemoteIPFilter` | hidden unless remote access on |
| Remote IP address filter mode (`LabelAllowedRemoteAddressesMode`) | select Whitelist / Blacklist | `IsRemoteIPFilterBlacklist` | hidden unless remote on |
| Public HTTP port number (`LabelPublicHttpPort`) | number | `PublicHttpPort` | hidden unless remote on |
| Public HTTPS port number (`LabelPublicHttpsPort`) | number | `PublicHttpsPort` | hidden unless remote on |
| Enable IPv4 / IPv6 (`LabelEnableIP4` / `LabelEnableIP6`) | checkboxes | `EnableIPv4` / `EnableIPv6` | |
| Enable Auto Discovery (`LabelAutomaticDiscovery`) | checkbox | `AutoDiscovery` | |
| Published Server URIs (`LabelPublishedServerUri`) | text, comma list | `PublishedServerUriBySubnet` | |

Lists are parsed by splitting on commas, trimming, dropping empties; shown joined with ", ". Each field has a `...Help` key. Validations at save: public HTTP and HTTPS ports must differ, internal HTTP and HTTPS ports must differ, at least one of IPv4/IPv6, and a certificate path is required when HTTPS is on (alerts). Success: `Dashboard.processServerConfigurationUpdateResult` (toast `SettingsSaved`); failure `Dashboard.processErrorResponse`. No explicit restart prompt appears (observation: many of these settings need a restart).

### 3.18 API keys (`/dashboard/keys`)

`routes/keys/index.tsx`. `useApiKeys` (`getApiKeyApi.getKeys`, `GET /Auth/Keys`). Table columns: API Key (`HeaderApiKey`, shows the full `AccessToken`, 300 px), App (`HeaderApp`, `AppName`), Date Issued (`HeaderDateIssued`, date-time range filter), and an unlabeled column with a delete icon (tooltip `ButtonRevoke`, "Revoke").

- Toolbar button `HeaderNewApiKey` ("New API Key"): input dialog, one field App name (`LabelAppName`, help `LabelAppNameExample`), button `Create`. `getApiKeyApi.createKey({ app })` (`POST /Auth/Keys?app=`, returns 204 with no body, so the new key is only visible after the list reloads). Dialog closes on settle; errors unhandled; the created key is not shown separately (it appears in the table).
- Revoke: confirm (title `HeaderConfirmRevokeApiKey`, text `MessageConfirmRevokeApiKey`, red `Delete`), `revokeKey({ key })` (`DELETE /Auth/Keys/{key}`).
- No copy button.

### 3.19 Directory browser (shared dialog)

`components/directorybrowser/directorybrowser.js` (read in the second pass). Default export `DirectoryBrowser` with `show(options)` and `close()`. Used for cache/metadata/transcode/fallback-font/recording paths, library folders, certificate and XMLTV file pickers.

Options: `header` (title, default `HeaderSelectPath`); `path` (start path; without it the server default is asked for); `includeDirectories` (default true); `includeFiles` (also switches the field label from `LabelFolder` to `LabelPath`); `pathReadOnly` (path input read-only; hides the instruction banner, the refresh button and the list, and skips the initial listing; used when only the network share path of an existing library path is edited); `instruction` (escaped text in the info banner; banner hidden when read-only); `enableNetworkSharePath` + `networkSharePath` (adds an optional input `txtNetworkPath` labeled `LabelOptionalNetworkPath`, help `LabelOptionalNetworkPathHelp`); `validateWriteable`; `callback(path, networkSharePath)` (`networkSharePath` is null when the field is absent).

Dialog: small, with a back button (title `ButtonBack`) and the header text; an info banner with an extra OS line (`MessageDirectoryPickerLinuxInstruction` on Linux, `MessageDirectoryPickerBSDInstruction` on BSD, nothing elsewhere; the OS comes from `getPublicSystemInfo`); a required text input `#txtDirectoryPickerPath`; a refresh icon button (`Refresh`); a results list (max height 200 px); the optional network path field; submit `ButtonOk`.

Listing behavior and the server calls (all confirmed in `api-inventory.md`, policy FirstTimeSetupOrElevated):

- Start path: `options.path`, else `GET /Environment/DefaultDirectoryBrowser` (`result.Path`; failure gives an empty string).
- With a path: first row `...` (the parent, from `GET /Environment/ParentPath?path=`), then `GET /Environment/DirectoryContents?path=&includeFiles=&includeDirectories=` (entries have `Type`, `Path`, `Name`; `Type === 'File'` is a file row, everything else a folder row). Clicking a folder navigates into it; clicking a file fills the input. Editing the input (change event) or pressing refresh re-lists.
- Without a path (empty input): `GET /Environment/Drives`.
- `GET /Environment/NetworkShares` exists on the server (no SDK method) but this dialog never calls it; there are no special-folder shortcuts either. The network path is only collected and passed to the callback.
- Only the initial load and folder navigation clear the path and list on error; refresh and typing do not.
- On submit: `POST /Environment/ValidatePath` with JSON `{ ValidateWriteable, Path }`. HTTP 404: alert `PathNotFound`. HTTP 500: alert `WriteAccessRequired` if a write check was requested, else `PathNotFound`; both reject. Any other error resolves and the callback still runs.
- Observations: the callback is invoked immediately instead of after validation (source bug `.then(options.callback(...))`), so a failed validation may still deliver the path; the loading indicator can stay up after a failed refresh.


### 3.20 Backups (`/dashboard/backups`)

`routes/backups/index.tsx` (id `backupsPage`). `useBackups` (`BackupApi.listBackups`, `GET /Backup`). Heading `HeaderBackups`, help `HeaderBackupsHelp` ("Create and restore snapshots of your server which can include the database, metadata, subtitles and trickplay."). Load error `BackupsPageLoadError`.

- Button `ButtonCreateBackup` opens `CreateBackupForm` (title `ButtonCreateBackup`, disclaimer `MessageBackupDisclaimer`): checkboxes Database (`LabelDatabase`, always checked, disabled, not sent), Metadata (`LabelMetadata`), Subtitles (`Subtitles`), Trickplay (`Trickplay`), default unchecked; buttons `ButtonCancel`, `Create`. Submit calls `new BackupApi(...).createBackup({ backupOptionsDto: { Metadata, Subtitles, Trickplay } })` (`POST /Backup/Create`; built directly because the SDK helper was missing, FIXME in source) and shows `BackupProgressDialog` until it settles. Error alert `UnknownError`.
- List: each `Backup` row shows `DateCreated` and `Path`; clicking opens `BackupInfoDialog` (read-only: title date; Path with a copy button toast `Copied`; Version `LabelVersion` = `ServerVersion`; checkboxes Database/`LabelMetadata`/`Subtitles`/`Trickplay` from `Options`; `ButtonOk`). A restore icon (tooltip `LabelRestore`) opens `RestoreConfirmationDialog` (title and button `LabelRestore`, body `MessageRestoreDisclaimer`: "WARNING: You are about to restore from a previous backup. Your server will be rendered unusable...", `ButtonCancel`).
- Restore: `restoreBackup.mutate(Path)` (`POST /Backup/Restore`, body `BackupRestoreRequestDto` = `ArchiveFileName`, the file must exist in the server's backup folder); then `RestoreProgressDialog` and a poll of `getSystemApi.getPublicSystemInfo()` every 45,000 ms (first check after 45 s, failures ignored while the server restarts) until it answers; then alert (title `Success`, text `MessageRestoreSuccess`). Error alert `UnknownError`.
- No delete-backup, no download, no upload of an archive; backups are listed from the server's backup folder only. (Manifest/path data come from the server.)

### 3.21 Logs (`/dashboard/logs`, `/dashboard/logs/:file`)

`routes/logs/index.tsx`: heading `TabLogs`; a form with a checkbox `EnableSlowResponseWarning` (`LabelSlowResponseEnabled`: "Log a warning message if the server was slow to answer") and a number `SlowResponseThresholdMs` (`LabelSlowResponseTime`: "Time in ms after which a response is considered slow"), `Save`, `SettingsSaved`; below, the list of server log files from `useServerLogs` (`getSystemApi.getServerLogs`, `GET /System/Logs`). Each `LogItemList` row: file name and `DateModified` (no size), links to `/dashboard/logs/<name>`; no download link in the list.

`routes/logs/file.tsx`: `useServerLog(fileName)` (`GET /System/Logs/Log?name=`). Shows the whole text in a `<pre>`; buttons Copy (`Copy`, toast `CopyLogSuccess`), Download (`Download`, a client-side Blob download of the fetched text), Retry on error (`Retry`, text `LogLoadFailure`). No search, no tail, no auto-refresh, no level filtering.

### 3.22 Scheduled tasks (`/dashboard/tasks`, `/dashboard/tasks/:id`)

List (`routes/tasks/index.tsx`, `features/tasks/components/Tasks.tsx`, `Task.tsx`): tasks from `useLiveTasks({ isHidden: false })`, grouped by `Category` (categories sorted by `localeCompare`; tasks within a category sorted by `Name`); each category is an `h2` heading. Row: clock avatar, task name, secondary line = progress (`TaskProgress`) if `State === 'Running'` else "last ran" (`TaskLastRan`); a play button (start, `getScheduledTasksApi.startTask`, `POST /ScheduledTasks/Running/{id}`) or, while running, a stop button (`stopTask`, `DELETE /ScheduledTasks/Running/{id}`). Clicking the row goes to `/dashboard/tasks/<Id>`. No confirmation for start or stop.

Live updates (`features/tasks/hooks/useLiveTasks.ts`): on mount sends websocket `ScheduledTasksInfoStart` with payload `'1000,1000'`; listens for `ScheduledTasksInfo` messages and writes the `TaskInfo[]` into the query cache; sends `ScheduledTasksInfoStop` on unmount. Fallback poll every 10,000 ms that invalidates the query only when the websocket channel is closed. (Source TODO: migrate off the legacy client when the TS SDK supports websockets.)

Detail (`routes/tasks/task.tsx`): task name as heading and description as text (no category shown); `useTask({ taskId })` (`getTask`, `GET /ScheduledTasks/{id}`). Table of triggers with one column `LabelTime` rendered by `TaskTriggerCell`; each row has a red remove button. Add trigger: button `ButtonAddScheduledTaskTrigger` opens `NewTriggerForm`. Saving either action calls `useUpdateTask` = `getScheduledTasksApi.updateTask({ taskId, taskTriggerInfo: [...all triggers] })` (`POST /ScheduledTasks/{id}/Triggers`; the full list is replaced). Remove confirm: title `HeaderDeleteTaskTrigger`, text `MessageDeleteTaskTrigger`, red button `ButtonRemove`.

`NewTriggerForm` fields: Trigger type (`LabelTriggerType`): Daily (`OptionDaily`, default), Weekly (`OptionWeekly`), Interval (`OptionOnInterval`), Startup (`OnApplicationStartup`); Day (`LabelDay`, Sunday-Saturday, weekly only, default Sunday) -> `DayOfWeek`; Time (`LabelTime`, daily/weekly, from `getTimeOfDayOptions`, default 0) -> `TimeOfDayTicks`; Every X minutes (`LabelEveryXMinutes`, interval only) -> `IntervalTicks`, options from `INTERVAL_DURATIONS`: 15, 30, 45 min; 1, 2, 3, 4, 6, 8, 12, 24 h; Time limit in hours (`LabelTimeLimitHours`, number min 1 step 0.5, empty by default) -> `MaxRuntimeTicks` = hours x 36e9, always shown. Startup has no extra fields. Buttons `ButtonCancel`, `Add`. No custom validation.

### 3.23 Plugins (`/dashboard/plugins`, `/dashboard/plugins/:pluginId`, `/dashboard/plugins/repositories`)

**Catalog and installed list** (`routes/plugins/index.tsx`): `usePluginDetails()` merges `usePackages` (catalog, `getPackageApi.getPackages`, `GET /Packages`), `usePlugins` (installed, `getPluginsApi.getPlugins`, `GET /Plugins`) and `useConfigurationPages`. Plugins are de-duplicated by id (catalog `guid` and installed `Id`), sorted by name; installed ones are matched to a catalog version, else a minimal record from the installed version is used; categories come from the catalog, with a hardcoded fallback for a few built-in GUIDs (AudioDB, MusicBrainz -> Music; OMDb, TMDb -> MoviesAndShows; Studio Images -> General). Installed images use `/Plugins/{Id}/{Version}/Image`.

- Filters in URL params: `status` (chips `All`, `LabelAvailable` "Available", `LabelInstalled` "Installed"; default Installed; "Installed" means a truthy `status`), `category` (chips: All, Administration, General, Anime, Books, LiveTV, MoviesAndShows, Music, Subtitles, Other; "Other" matches anything not in `MAIN_CATEGORIES`), `query` (case-insensitive name search, label `Search`).
- Card grid (`PluginCard`, 1 column on xs up to 6 on xl); empty state `NoPluginResults` with a "view all" action. Button `ManageRepositories` -> `/dashboard/plugins/repositories`. Load error `PluginsLoadError`.

**Plugin detail** (`routes/plugins/plugin.tsx`, `?name=` plus id): header with image (Extension icon fallback), name, description; `PluginDetailsTable` rows `LabelStatus` (status or `LabelNotInstalled`), `LabelVersion`, `LabelDeveloper` (owner or `Unknown`), `LabelRepository` (repo link; `LabelBundled` for non-uninstallable installed plugins); `PluginRevisions` accordion per version: version, timestamp, changelog rendered as Markdown (`LabelNoChangelog` fallback), button `HeaderInstall` or disabled `LabelInstalled`. No target-ABI field is displayed.

Buttons and flows:
- Install (not-installed plugin): `getPackageApi.installPackage(...)` (`POST /Packages/Installed/{name}` with QUERY parameters `assemblyGuid`, `version`, `repositoryUrl`, no body; returns 204). Installs from any repository other than `https://repo.jellyfin.org/` first show a confirm (title `HeaderConfirmPluginInstallation`, text `MessagePluginInstallDisclaimer`). Success alert `MessagePluginInstalled`, error `MessagePluginInstallError`. Info alert `ServerRestartNeededAfterPluginInstall` while not installed.
- Enable/Disable switch (non-built-in only; disabled while status is `Restart`): `getPluginsApi.enablePlugin` / `disablePlugin` (`POST /Plugins/{pluginId}/{version}/Enable` and `.../Disable`). Errors `PluginEnableError`, `PluginDisableError`.
- Settings link: to the plugin's configuration page (best match by `findBestConfigurationPage`: pages for that plugin id; the first with `EnableInMainMenu` wins, else the first).
- Uninstall (non-built-in): confirm (title `HeaderUninstallPlugin`, text `UninstallPluginConfirmation`), `getPluginsApi.uninstallPluginByVersion` (`DELETE /Plugins/{id}/{version}`); error `PluginUninstallError`.
- Load warnings: `PluginLoadConfigError`, `PluginLoadRepoError` (skipped for built-ins), `MessageGetInstalledPluginsError`.
- There is no per-plugin "update" button: updating means installing a newer revision from the revisions list; no update-available indicator was found in the files read (observation).

**Repositories** (`routes/plugins/repositories.tsx`, title `TabRepositories`): `useRepositories` (`getPluginsApi`/`getRepositories`, `GET /Repositories`); list of `RepositoryListItem` (OpenInNew avatar linking to the repo URL, name, URL, delete icon with tooltip `ButtonRemove`); empty state `MessageNoRepositories` + `MessageAddRepository`; error `RepositoriesPageLoadError`. Button `HeaderNewRepository` opens `NewRepositoryForm` (fields Name `LabelRepositoryName` required, help `LabelRepositoryNameHelp`; Url `LabelRepositoryUrl`, type url, help `LabelRepositoryUrlHelp`; buttons `ButtonCancel`, `Add`; created with `Enabled: true`). Delete confirm: title `ConfirmDeleteRepository`, text `DeleteRepositoryConfirmation`, `Delete`. Both add and delete rewrite the whole list via `useSetRepositories` (`POST /Repositories`). There is no enable/disable toggle for a repository in these files.

**Plugin hooks and components (second pass, `src/apps/dashboard/features/plugins/`)**: folders `api`, `components`, `constants`, `types`.

- `api/`: `configurationPage.ts`, `pluginInfo.ts`, `queryKey.ts`, `useConfigurationPages`, `useDisablePlugin`, `useEnablePlugin`, `useInstallPackage`, `usePackageInfo`, `usePackages`, `usePluginDetails`, `usePlugins`, `useRepositories`, `useSetRepositories`, `useUninstallPlugin`.
- `usePlugins`: query key `[Plugins]`, `getPluginsApi(api).getPlugins` = `GET /Plugins` (`PluginInfo[]`, fields used: `Id`, `Name`, `Description`, `Version`, `Status`, `CanUninstall`, `HasImage`). `usePackages`: key `[Packages]`, `getPackageApi(api).getPackages` = `GET /Packages`, `staleTime` 15 minutes. `usePackageInfo({ name, assemblyGuid })` = `GET /Packages/{name}?assemblyGuid=` (only when a name is known).
- `useInstallPackage` (mutation): `installPackage(params)`; on success invalidates `[ConfigurationPages]` and `[Plugins]`. `useUninstallPlugin`: `uninstallPluginByVersion`, same two invalidations. The enable/disable hooks call `enablePlugin` / `disablePlugin`.
- `usePluginDetails` (merge): the id set is the union of catalog `guid` and installed `Id`; the installed record is chosen by `findBestPluginInfo(id, plugins)`; version = the catalog version equal to the installed `Version`, else a minimal record `{ version, VersionNumber }` from the installed one, else (not installed) the first catalog version (the newest). `isEnabled = status !== Disabled` (so a plugin with no installed record counts as enabled). `canUninstall = !!CanUninstall`. Image: `/Plugins/{Id}/{Version}/Image` only when `HasImage`, else the catalog `imageUrl`. Description: installed `Description`, else catalog `description`, else `overview`. Name: installed `Name`, else catalog `name`. Sorted by name (`localeCompare`). The category fallback switch (no default case, so any other id gets none): AudioDB `a629c0dafac54c7e931a7174223f14c8` and MusicBrainz `8c95c4d2e50c4fb0a4f36c06ff0f9a1a` -> Music; OMDb `a628c0dafac54c7e9d1a7134223f14c8` and TMDb `b8715ed16c4745289ad3f72deb539cd4` -> MoviesAndShows; Studio Images `872a78491171458da6fb3de3d442ad30` -> General. Returns `{ data, isError, isPending }` where error and pending are the OR of the packages, plugins and configuration-pages queries; the list stays empty until packages and plugins have loaded.
- `components/PluginCard.tsx`: the whole card links to `/dashboard/plugins/{id}?name={encoded name}` (the URL hash is kept). Title = name; text = version number and status joined by a space (empty parts dropped; the status is the raw enum text, no chip, no translation); image = `imageUrl` with an Extension icon (80 px) passed as well. No buttons, no handlers, no string keys.
- Other components: `NewRepositoryForm`, `NoPluginResults`, `PluginDetailsTable`, `PluginRevisions`, `RepositoryListItem` (behavior described above).
- Plugin detail page (`routes/plugins/plugin.tsx`, page id `addPluginPage`): id from the path, `name` from the query. Main column (8/12): name (h1), description, `HeaderRevisionHistory`. Side column (4/12): the image (hidden below the large breakpoint, Extension icon fallback), the control stack and the details table. Controls: Install (only when the plugin has no status; preceded by the info alert `ServerRestartNeededAfterPluginInstall`), switch `LabelEnablePlugin` (only for uninstallable plugins; disabled while the status is Restart), `Settings` (only when a configuration page exists; links to `/` plus that page's URL-safe name), `ButtonUninstall` (red). Owner shows "jellyfin" for built-ins (`CanUninstall === false`). Install flow: a repository URL that does not start with the official repository URL opens the confirm (`HeaderConfirmPluginInstallation`, `MessagePluginInstallDisclaimer`, confirm `HeaderInstall`) and keeps the version as pending; otherwise it installs at once. Enable/disable sets a local override of the enabled state on success. Uninstall confirm: `HeaderUninstallPlugin`, `UninstallPluginConfirmation` (plugin name as argument), confirm `ButtonUninstall`. Alerts: `PluginDisableError`, `PluginEnableError`, `MessagePluginInstalled`, `MessagePluginInstallError`, `PluginUninstallError`, `PluginLoadConfigError`, `PluginLoadRepoError` (non-built-in only, warning), `MessageGetInstalledPluginsError`.
- Inventory extras that the stock UI does not use: `DELETE /Plugins/{pluginId}` (all versions), `GET`/`POST /Plugins/{pluginId}/Configuration` (a plugin's JSON config), `POST /Plugins/{pluginId}/Manifest`, `DELETE /Packages/Installing/{packageId}` (cancel a running install).


### 3.24 Plugin configuration pages (the injection mechanism)

Plugins ship their own configuration UI as HTML pages that the SERVER serves. jellyfin-web does not know their content; it fetches and injects them.

1. Discovery. `getDashboardApi(api).getConfigurationPages({ enableInMainMenu })` returns `ConfigurationPageInfo` records (`Name`, `DisplayName`, `PluginId`, `EnableInMainMenu`, `MenuSection`, `MenuIcon`; only `Name`, `DisplayName`, `PluginId`, `EnableInMainMenu` are used by the web). Pages with `EnableInMainMenu = true` appear in the drawer's Plugins section (3.1) with a Folder icon under `DisplayName`. Other pages are reached only from the plugin detail page's Settings link. `Dashboard.getPluginUrl(name)` returns `configurationpage?name=<encodeURIComponent(name)>`, and the route is `/configurationpage?name=...` (declared in the admin guard, error boundary not applied).
2. Fetch. `ServerContentPage` (`components/ServerContentPage.tsx`) with `view='/web/configurationpage'` does `ServerConnections.currentApiClient().getUrl('/web/configurationpage' + location.search)`, i.e. `GET {server}/web/ConfigurationPage?name=<Name>`; the returned HTML string is passed through `globalize.translateHtml` (so `${Key}` placeholders resolve against jellyfin-web strings), then `viewManager.loadView({ url, state, autoFocus: false, view: html, options: { supportsThemeMedia: false, enableMediaControl: true } })`. It first tries `viewManager.tryRestoreView`. The effect re-runs on `view`, pathname and search (not on `location.state`).
3. Injection (`components/viewContainer.js`). If the HTML contains `data-role="page"`, it is parsed with `wrapper.innerHTML = html` and the first `div[data-role="page"]` is used; otherwise the string is wrapped in a new `div`. Script tags hidden in comments (`<!--<script`) are re-enabled. For plugin pages (URL contains `configurationpage`) the loader flags jQuery use by scanning for `jQuery`, `$(`, `$.`. When a page contains a script and `window.$` exists, the page is attached with `$(view).appendTo(...)` (which executes inline scripts); otherwise plain `appendChild`/`replaceChild` (where inline scripts do not run, per standard DOM behavior; the source does not say more). The view gets class `mainAnimatedPage` and optional `data-type`, `data-properties`. Up to 3 views are cached round-robin; a `viewdestroy` event fires on the slot being overwritten.
4. Controller. `viewManager` instantiates a controller on first show, from `options.controllerFactory`, set by `setControllerClass` from the page's `data-controller` attribute: a value starting with `__plugin/` has that prefix stripped, is resolved through `Dashboard.getPluginUrl`, loaded from `ApiClient.getUrl('/web/' + ...)` with a dynamic `import()`, and the module's default export is constructed with `(view, params)`. Plugin pages normally do not need this; most use inline `<script>` that listens for page events.
5. Events dispatched on the page element (and mirrored as `page*` events): `viewinit`, `viewbeforeshow`, `viewshow`, `viewbeforehide`, `viewhide` (and `viewdestroy` from the container). Event `detail` carries `type` (from `data-type`), `properties` (from `data-properties`), `params` (parsed query string), `isRestored`, `state`, `options`. Plugin scripts typically do `document.querySelector('#MyPluginPage').addEventListener('pageshow', ...)` or use `Dashboard`'s helpers `pageIdOn('pageshow', id, fn)` / `pageClassOn`.
6. Globals the pages rely on (source: `src/utils/dashboard.js` and shell): `window.ApiClient` (legacy client, e.g. `getPluginConfiguration(pluginId)`, `updatePluginConfiguration(pluginId, config)`, `getJSON`, `ajax`, `getUrl`, `getCurrentUser`), `window.Dashboard` (object assigned in `utils/dashboard.js`; members: `getCurrentUser()`, `getCurrentUserId()`, `serverAddress()`, `onServerChanged`, `logout()`, `selectServer()`, `getPluginUrl(name)`, `getConfigurationResourceUrl(name)`, `navigate(url, preserveQuery)`, `processPluginConfigurationUpdateResult()` and `processServerConfigurationUpdateResult()` (both hide the loading overlay and toast `SettingsSaved`), `processErrorResponse(response)`, `alert(opts)` (string = toast), `confirm(message, title, cb)`, `showLoadingMsg()`, `hideLoadingMsg()`, `capabilities(host)`, `pageClassOn`, `pageIdOn`, plus embedded `datetime`, `DirectoryBrowser`, `dialogHelper`, `itemIdentifier`, `setBackdropTransparency`), `window.LibraryMenu` (not read; plugins call e.g. `LibraryMenu.setTitle`; source of `LibraryMenu` was not fetched), jQuery/`$` (used by many old plugin pages), the `emby-*` custom elements and their CSS classes (`emby-input`, `emby-select`, `emby-checkbox`, `emby-button`, `emby-textarea`, `emby-scroller`, `paper-icon-button-light`, `raised button-submit block`, `sectionTitle`, `content-primary`, `readOnlyContent`, `fieldDescription`, `inputContainer`, `selectContainer`, `checkboxContainer`), and the `data-role="page"` / `data-require` / `data-controller` attributes. A typical page does `ApiClient.getPluginConfiguration(id).then(fill)` on `pageshow`, `Dashboard.showLoadingMsg()` on submit, `ApiClient.updatePluginConfiguration(id, cfg).then(Dashboard.processPluginConfigurationUpdateResult)`.
7. Themes: dashboard pages use the dark dashboard theme (`ThemeCss dashboard`) and `AppOverrides.scss`; plugin HTML relies on those global classes and has no isolation (no iframe, no shadow DOM), so plugin CSS and JS share the page with the app.
8. Admin tabs: legacy pages can publish tabs through `EventType.SET_TABS` consumed by `AppTabs`.
9. Not read: `data-require` handling, `LibraryMenu`, the server side of `/web/ConfigurationPage` and `/web/ConfigurationPages` (which also serve a plugin's JS resources under `/web/...`). The `__plugin/` loader above shows controller scripts are fetched under `/web/`.

### 3.25 First-run setup wizard (list only)

Routes in `apps/wizard/routes/routes.tsx`, all under `/wizard/`, `AppType.Wizard`, guarded by `ConnectionRequired level='wizard'`, `/wizard` redirects to `start`: `/wizard/start` (`start/index`), `/wizard/user` (`user/index`), `/wizard/library` (`library`), `/wizard/settings` (`settings/index`, metadata language), `/wizard/remoteaccess` (`remote/index`), `/wizard/finish` (`finish/index`). All legacy controller + HTML views. Their fields were not read.

---

## 4. Admin-ish features outside the dashboard

All opened from item context menus (`src/components/itemContextMenu.js`, which lists these entries with ids and conditions) or detail pages. Permission checks in the web code are thin; the server enforces them. Context-menu conditions read from source: collections need `Policy.IsAdministrator` or `EnableCollectionManagement`; Live TV cancel needs `EnableLiveTvManagement`; Download needs `Policy.EnableContentDownloading` (for batch) or `item.CanDownload`; Delete needs `item.CanDelete`; others rely on `itemHelper.canEdit / canEditImages / canEditSubtitles / canEditLyrics / canIdentify / canRefreshMetadata` (file not read).

1. **Metadata editor** (`components/metadataEditor/metadataEditor.js`, `personEditor.js`; `show(itemId, serverId)` dialog or `embed(...)` inline). Fields by item type: name, sort name, overview, tags, premiere/release date, date added, year, original title (series/season/episode/movie/trailer/person), critic rating (movie/trailer), community rating, parental/official rating and custom rating, genres, studios, people (add/edit/delete person dialog), lock-data checkbox and locked-field checkboxes (Name, Overview, Genres, OfficialRating, Cast, ProductionLocations, Runtime for Series, Studios, Tags; unchecked = locked), preferred language and country, per-provider external IDs, series fields (runtime, end date, status, air days/time, display order), index numbers for episodes/seasons/audio, artist/album-artist/album, 3D format, aspect ratio, tagline, TV channel fields, content type. Calls: `getItem`, `GET Items/{id}/MetadataEditor`, `updateItem`, `POST Items/{id}/ContentType`. Buttons: Save, Cancel/Back, Reset, More (context menu), add/remove list entries.
2. **Metadata manager page** (`/metadata`, `controllers/edititemmetadata.{html,js}`): a library tree (`.libraryTree`, `itemclicked` event) with the metadata editor embedded; no drawer; reached via `AppLayout`'s metadata-manager mode with a `ServerButton`.
3. **Image editor** (`components/imageeditor/imageeditor.js`, plus `imageDownloader`, `imageUploader`, `imageOptionsEditor`): lists all image types; backdrops in their own reorderable list; per image delete (confirm `ConfirmDeleteImage`), move left/right (backdrops), search remote images per type or "browse all" (shown when providers exist, via `getRemoteImageProviders`), upload (hidden when the host lacks file input). Calls: `getItemImageInfos`, `deleteItemImage`, `updateItemImageIndex`. Second pass. **Image downloader** (`components/imageDownloader/imageDownloader.js`): dialog with an image-type select (`#selectBrowsableImageType`), a provider select (`#selectImageProvider`, first row `All`, then the providers the server returns), an include-all-languages checkbox (sent as `IncludeAllLanguages`) and, when the item has a parent, a checkbox to show the parent's images (the search then uses the parent id; downloads always use the current item). Paging: 30 per page (6 on slow browsers), previous/next only when the total exceeds a page, summary `ListPaging`. Each card shows provider, size (`W x H`, then a bullet and the language), rating (`N likes`, or a one-decimal rating, a bullet and `N votes`, else the hardcoded `Unrated`), a link that opens the image in a new tab, and a `Download` button. Card shape: backdrop for Backdrop/Art/Thumb/Logo/Episode, banner for Banner, square for Disc/MusicAlbum/MusicArtist, else portrait. No confirmation and no error handling (the spinner can stay up). Calls: the list is `getAvailableRemoteImages` (query `type`, `startIndex`, `limit`, `providerName`, `includeAllLanguages`; the inventory has NO list operation for remote images, only the download, so the list address must be taken from the live OpenAPI) and `POST /Items/{itemId}/RemoteImages/Download` (query `type`, `imageUrl`; confirmed). **Image uploader** (`components/imageUploader/imageUploader.js`): options `itemId`, `serverId`, `imageType` (default `Primary`); a file input and an image-type select (`#selectImageType`); the file must have an `image/*` MIME type, else toast `MessageImageFileTypeAllowed`; type `None` gives `MessageImageTypeNotSelected`; read errors `MessageFileReadError`; a thumbnail preview before upload; upload via `uploadItemImage(itemId, imageType, file)` = `POST /Items/{itemId}/Images/{imageType}` with the image as body (inventory `ImageApi.setItemImage`, body binary `image/*`). A failed upload shows nothing and leaves the spinner on.
4. **Identify** (`components/itemidentifier/itemidentifier.js`): search by name/year (year hidden for Person/BoxSet) or by provider ids; `POST Items/RemoteSearch/{Type}`; apply with `POST Items/RemoteSearch/Apply/{id}` and the option "replace all images" (default checked, `#chkIdentifyReplaceImages`). Toast `PleaseEnterNameOrId` when empty. Inventory check: of the per-type searches `POST /Items/RemoteSearch/{Type}` only `POST /Items/RemoteSearch/Person` appears in `api-inventory.md`; take the Movie/Series/Album/etc. variants from the live server's OpenAPI before building. `POST /Items/RemoteSearch/Apply/{itemId}` has query `replaceAllImages` and body `RemoteSearchResult`; `GET /Items/{itemId}/ExternalIdInfos` is in the inventory.
5. **Refresh metadata / scan** (`components/refreshdialog/refreshdialog.js`): mode select `ScanForNewAndUpdatedFiles` (default; API mode Default), `SearchForMissingMetadata` (FullRefresh), `ReplaceAllMetadata` (FullRefresh + `ReplaceAllMetadata`); checkboxes `ReplaceExistingImages` and `ReplaceTrickplayImages` (hidden in scan mode); help `RefreshDialogHelp`. One `apiClient.refreshItem(id, { Recursive: true, ImageRefreshMode, MetadataRefreshMode, ReplaceAllImages, RegenerateTrickplay, ReplaceAllMetadata })` per item (`POST /Items/{itemId}/Refresh` with QUERY parameters `metadataRefreshMode`, `imageRefreshMode`, `replaceAllMetadata`, `replaceAllImages`, `regenerateTrickplay` (no body)). No confirmation even for replace-all; toast `RefreshQueued`.
6. **Scan library per library**: in the item context menu, `RefreshMetadata` on a `CollectionFolder` opens the refresh dialog in `scan` mode; on the dashboard it is the `ScanLibrary` card menu entry (3.7); global scan is the `RefreshLibrary` task.
7. **Delete item**: context menu `Delete` / `DeleteSeries` / `DeleteEpisode` / `DeleteMedia` when `item.CanDelete`, executed by `scripts/deleteHelper.js` (read in the second pass). Confirm dialog with a delete-styled primary action. For a Series: title `HeaderDeleteSeries`, text `ConfirmDeleteSeries` (`{0}` = `RecursiveItemCount`), button `DeleteEntireSeries` (`{0}` = the episode count). For everything else: title `HeaderDeleteItem`, text `ConfirmDeleteItem`, button `Delete`. On confirm `apiClient.deleteItem(id)` = `DELETE /Items/{itemId}` (inventory: policy DefaultAuthorization only, so the server decides per user; there is also a bulk `DELETE /Items`). Failure: alert `ErrorDeletingItem`. With `options.navigate` it then opens the parent (`SeasonId || SeriesId || ParentId`) or the home page. Lyrics have their own confirm: title `HeaderDeleteLyrics`, text `ConfirmDeleteLyrics`, button `Delete`, then `DELETE /Audio/{itemId}/Lyrics`; failure `ErrorDeletingLyrics`; no navigation.
8. **Media info** (`components/itemMediaInfo/itemMediaInfo.js` plus a template, read in the second pass): context menu `MoreMediaInfo` when the item has `MediaSources`. The dialog (small; fullscreen on TV) loads the item (`getItem`) and the current user (the file path is shown only to administrators). One block per `MediaSource`, separated by a divider: heading = source `Name`; rows `MediaInfoContainer`, `MediaInfoFormat` (comma-joined `Formats`), `MediaInfoPath` (admin only, left-to-right), `MediaInfoSize` (readable size). Then one block per stream (sorted with `itemHelper.sortTracks`; type `Data` skipped) headed by the stream-type key (`Audio`, `Subtitle`, `Video`, `Lyric`; embedded image uses `Image`). Stream rows in order, each only when the value exists: `MediaInfoTitle` (DisplayTitle), `MediaInfoLanguage` (not video), `MediaInfoCodec` (upper-case), `MediaInfoCodecTag`, `AVC` (yes/no), `MediaInfoProfile`, `MediaInfoLevel` (>0), `MediaInfoResolution` (`WxH`), `MediaInfoAspectRatio` (not mjpeg), video `MediaInfoAnamorphic`, video `MediaInfoInterlaced` (always shown), `MediaInfoFramerate`, `MediaInfoLayout` (channel layout), `MediaInfoChannels` (`N ch`), `MediaInfoBitrate` (kbps), `MediaInfoSampleRate` (`N Hz`), `MediaInfoBitDepth` (`N bit`), video `MediaInfoVideoRange`, `MediaInfoVideoRangeType`, Dolby Vision (`MediaInfoDoViTitle`, `MediaInfoDvVersionMajor`, `MediaInfoDvVersionMinor`, `MediaInfoDvProfile`, `MediaInfoDvLevel`, `MediaInfoRpuPresentFlag`, `MediaInfoElPresentFlag`, `MediaInfoBlPresentFlag`, `MediaInfoDvBlSignalCompatibilityId`), `MediaInfoColorSpace`, `MediaInfoColorTransfer`, `MediaInfoColorPrimaries`, `MediaInfoPixelFormat`, `MediaInfoRefFrames`, video `MediaInfoRotation`, `NAL`, audio and subtitle `MediaInfoDefault`, `MediaInfoForced`, `MediaInfoExternal` (yes/no), video `MediaInfoTimestamp`. Copy icon buttons (`Copy`) per source and per stream copy that block's text; toast `Copied`, or `CopyFailed` on error; none on TV layouts. Only a close button. There is no API call beyond `getItem` and `getCurrentUser`; the data already sits in the item's `MediaSources`.
9. **Subtitle editor** (`components/subtitleeditor/subtitleeditor.js`): current external subtitles with delete (`DELETE Videos/{itemId}/Subtitles/{index}`; confirm `ConfirmDeletion` / `MessageAreYouSureDeleteSubtitles` / `Delete`); remote search with language select (`GET`-style `Items/{id}/RemoteSearch/Subtitles/{lang}`, last language remembered in local storage key `subtitleeditor-language`; results grouped by provider with flags PerfectMatch, AiTranslated, MachineTranslated, ForeignPartsOnly, hearing-impaired); download `POST Items/{id}/RemoteSearch/Subtitles/{subId}` (toast `MessageDownloadQueued`); upload dialog (`components/subtitleuploader`, not read). Second pass, **subtitle uploader** (`components/subtitleuploader/subtitleuploader.js`): a browse button and file input accepting by extension `.sub`, `.srt`, `.vtt`, `.ass`, `.ssa`, `.mks` (the check is case-sensitive, so `.SRT` is rejected; submit with a bad type shows toast `MessageSubtitleFileTypeAllowed`; picking a bad file just clears the preview silently). After a valid pick the dialog shows the file name, a language select (`#selectLanguage`; the caller passes the list), checkbox forced (`#chkIsForced`), checkbox hearing impaired (`#chkIsHearingImpaired`), Cancel and submit. Upload = `SubtitleApi.uploadSubtitle` = `POST /Videos/{itemId}/Subtitles` with JSON `UploadSubtitleDto` { `Data` (the file, base64), `Language`, `IsForced`, `Format` (lower-case extension), `IsHearingImpaired` } (inventory, policy SubtitleManagement). Read error toast `MessageFileReadError`. No catch on the upload: failure leaves the spinner on with no message. Success closes the dialog and the editor reloads. Also in the inventory: `GET /Providers/Subtitles/Subtitles/{subtitleId}` (text of a remote subtitle).
10. **Lyrics** (`components/lyricseditor`, `lyricsuploader`, page `/lyrics`): list current lyrics (timestamped), remote search (`getLyricsApi.searchRemoteLyrics`), preview dialog, download (`downloadRemoteLyrics`), delete, upload. Second pass, **lyrics uploader** (`components/lyricsuploader/lyricsuploader.js`): file input accepting `.lrc` and `.txt` (case-sensitive; a bad type on submit shows toast `MessageLyricsFileTypeAllowed`; a bad pick clears silently), shows the file name, upload = `LyricApi.uploadLyrics` = `POST /Audio/{itemId}/Lyrics?fileName=` with the file read as TEXT in a `text/plain` body (inventory, policy LyricManagement). Read errors `MessageFileReadError`; no catch on upload. Remote lyrics: search `GET /Audio/{itemId}/RemoteSearch/Lyrics`, download `POST /Audio/{itemId}/RemoteSearch/Lyrics/{lyricId}`, preview `GET /Providers/Lyrics/{lyricId}`, delete `DELETE /Audio/{itemId}/Lyrics` (all in the inventory).
11. **Collection editor** (`components/collectionEditor/collectionEditor.js`): dialog to add selected items to an existing BoxSet (`POST Collections/{id}/Items`) or create one (`POST Collections` with `Name`, `IsLocked` = not "search internet metadata", `Ids`); keys `HeaderAddToCollection`, `NewCollection`, `LabelCollection`, `LabelName`, `SearchForCollectionInternetMetadata`. Removal via context menu `RemoveFromCollection` (`DELETE Collections/{id}/Items`).
12. **Playlist editor** (`components/playlisteditor/playlisteditor.ts`): add to / create / edit playlists; fields name, public toggle (`IsPublic`/`OpenAccess`); lists only playlists the user can edit (checked with `getPlaylistUser`); calls `createPlaylist`, `addItemToPlaylist`, `updatePlaylist`, `getPlaylist`. Context menu also provides remove from playlist, move to top/bottom. Playlist user/permission sharing is not editable in this dialog.
13. **Quick Connect authorize** (`apps/stable/routes/quickConnect/index.tsx`): page titled `QuickConnect`, text `QuickConnectDescription`, one code input (`LabelQuickConnectCode`, numeric, min 6 chars, spaces stripped), button `Authorize`; `getQuickConnectApi.authorizeQuickConnect({ code, userId })` (`POST /QuickConnect/Authorize`, query `code`, `userId`; returns a boolean), userId from the query or the signed-in user; messages `QuickConnectInvalidCode`, `QuickConnectAuthorizeFail`, `QuickConnectAuthorizeSuccess` + `GoHome`. Whether Quick Connect is available is the General-settings toggle. No admin list of pending/active quick-connect requests exists.
14. **Per-user preferences for another user** (`apps/stable/routes/legacyRoutes/user.ts`: `mypreferencesdisplay`, `mypreferenceshome`, `mypreferencesplayback`, `mypreferencessubtitles`, `mypreferencescontrols`; the dashboard link goes to `mypreferencesmenu?userId=`): the display controller reads `userId` from the URL, falling back to the current user, and uses a separate `UserSettings` instance when it is not the signed-in user, so display settings can be edited for another user by id. The controller contains no admin check (server enforces). Other pages' use of `userId` was not verified. A user profile page (`apps/stable/routes/user/userprofile.tsx`, id `userProfilePage`, also `?userId=`) lets an admin (or a user with `EnableUserPreferenceAccess`) upload/delete the avatar (`uploadUserImage`, `deleteUserImage` after confirm) and embeds the password form.
15. **Media segments, "Enable library" and similar server-side-only options** are covered only inside the library options editor above.

---

## 5. Things the stock dashboard does poorly or inconsistently (my observations)

Everything here is my reading of the source, not an upstream statement.

1. **Two generations of code in one dashboard.** Settings pages (general, branding, library display/metadata, playback, DVR, logs) are modern React + MUI + React Router actions with inline success alerts. Networking, Live TV tuner and guide-provider setup are still legacy HTML + controller scripts (`_legacyRoutes.ts`), saved with `Dashboard.processServerConfigurationUpdateResult` toasts instead. The user pages are React components that still do DOM queries by class and `window.ApiClient`. Save feedback is therefore inconsistent (inline alert vs toast vs navigation with a toast flag).
2. **Error handling is thin.** Many pages only `console.log` failures and leave the loading spinner on (users list load, user policy saves, access and parental-control saves, channel mapping). Settings `action`s have no try/catch. Failures usually give the admin no message.
3. **Missing or inconsistent confirmations.** Confirmed: delete user, delete device, delete all devices, revoke key, remove library or path, restart, shutdown, delete trigger, uninstall plugin, delete repository, restore backup. Not confirmed: stop a running task, delete a custom splash image, remove a user's access-schedule row, refresh metadata with "replace all metadata" (destructive), channel remapping, saving networking changes that need a restart (only a warning when a bind address is set), and the transcoding page shows its hardware-acceleration warning on every save even when acceleration is off.
4. **Related settings are split across pages.** Streaming bitrate limit (`RemoteClientBitrateLimit`) is on its own page yet repeated per user. Library behavior is spread over Libraries (per-library options), Libraries Display, Libraries Metadata (language/country/chapter), NFO and Trickplay (server-wide trickplay options plus per-library trickplay checkboxes). Metadata language/country exist both server-wide (3.9) and per library. Resume rules, streaming and transcoding are three pages for "playback". Server cache/metadata paths are on General while transcode path and FFmpeg path are on Transcoding and recording paths on DVR; the home "paths" widget links to General only. Quick Connect has a server toggle but no management page. Plugin repositories are a sub-page that the Plugins drawer item merely highlights.
5. **Duplicated or redundant settings and quirks.** Remote access exists in network config and as a per-user policy flag (the per-user flag is hidden when network remote access is off). The Devices widget and Devices page both exist with different filtering rules. Source-visible bugs: user lockout / max-sessions defaults print "undefined" (`String(x) || default`), folder checkboxes pre-check when the saved array is missing (`!= -1` on undefined), "mixed" content type handled two ways in the library options editor, `Dashboard`-style help URL keyed `/dashboard/recordings` that never matches, delete-tuner/provider menu for unknown provider types can't link to an editor, the Schedules Direct password is sent as typed (the client does not hash it).
6. **No search or filter in most lists.** Users, libraries, tasks, logs, backups, repositories, API keys and activity have no free-text search (plugins and the table-based pages have chips or per-column filters only). Users has no sort or filter (disabled users are only greyed). Logs open as one big text blob without tail, filtering, or auto-refresh. Activity has no export. Devices has no bulk selection beyond "delete all but this one".
7. **Live data is limited.** Only sessions (2 s fallback) and tasks (10 s fallback) use websocket subscriptions. Devices, activity, plugin status, storage and item counts do not refresh on their own (no refetch interval; `refetchOnMount: false` for activity). The storage widget never refreshes; backups and restore rely on a blind 45 s poll.
8. **Hardcoded English and drifting strings.** Transcoding hardware labels (AMD AMF ... V4L2, HEVC 10bit ...), Live TV add-provider menu entries, tuner type names in the picker, "Xml TV" title, "Delete" title on schedule rows, and the `Folder` icon for every plugin are not translated or customizable. Several error keys are reused for unrelated failures (`ErrorAddingMediaPathToVirtualFolder` on path update).
9. **Plugin pages are unmanaged HTML.** They run in the same document with the app's globals (jQuery, `ApiClient`, `Dashboard`, `emby-*`) and no isolation, theming contract or typed API. A replacement dashboard cannot render them natively; it has to embed them (iframe or injected view) or drop them.
10. **Missing admin functions the web client never offers** (from what the files expose): list/edit/cancel Live TV timers and recordings, quick-connect request management, backup delete/download/upload, plugin repository enable toggle and update-available notices, per-session kill/log-out of a user's devices (only per-device delete), activity filtering by user via UI search, bulk user operations.

---

## Not fetched or only partly read

- `src/strings/en-us.json`: fetched completely in the second pass (121,294 characters); the English text of every key in this file is in the appendix. Two keys the source uses, `MessageSubtitleFileTypeAllowed` and `MessageLyricsFileTypeAllowed`, do NOT exist in this file on the branch, so those two toasts have no English text there (likely a source bug; `MessageImageFileTypeAllowed` does exist).
- `DrawerHeaderLink.tsx` (404 at the path guessed), `src/components/viewManager/viewContainer.js` (404; the container was read from `src/components/viewContainer.js`), `routes/_redirects.ts` (does not exist on this branch; the redirect lives in `routes.tsx`).
- Not read: `LibraryMenu` and `src/scripts/*` other than `deleteHelper.js`, the `itemidentifier` template, `imageOptionsEditor`, the HTML templates of the image/subtitle/lyrics uploaders and of the media info dialog (so the dialog title keys and button labels inside them are unknown), `homeScreenSettings`, `displaySettings` (only the controller wrapper), wizard controllers and templates, `TaskProgress`/`TaskTriggerCell`/`TaskLastRan` internals, `useSystemInfo`, `ActivityListItem`/`ActionsCell`, `features/libraries/utils/metadataOptions.ts`, the bodies of `PluginDetailsTable`, `PluginRevisions` and `usePackageInfo`, `routes/users` hooks beyond the pages, and the legacy `jellyfin-apiclient` paths behind helpers such as `getAvailableRemoteImages` and `resetUserPassword`. `src/controllers/dashboard/*` does not exist on this branch (the legacy dashboard controllers moved to `src/apps/dashboard/controllers/`).
- The GitHub recursive tree listing is 361,791 characters; directory (`contents`) listings were used instead for `src/controllers`, `src/apps/dashboard` (including `routes` and `features/plugins`), `src/apps/stable/routes`, `src/apps/wizard`.

## 6. REST path verification (second pass, against `api-inventory.md`)

53 paths carried a dagger. 51 were correct as written (method, path and parameter placement confirmed). Wrong: (1) updating a user is `POST /Users?userId={id}` with a `UserDto` body, not `POST /Users/{id}`; (2) changing a password is `POST /Users/Password?userId={id}` with `UpdateUserPassword` (`CurrentPw`, `NewPw`, `ResetPassword`), not `POST /Users/{id}/Password`, and the inventory has no separate reset path. Imprecise and fixed in place: branding has a dedicated `POST /System/Configuration/Branding` (the lower-case key only works through the generic `{key}` route); the SDK class for item counts is `LibraryApi.getItemCounts`; package install parameters are query parameters, not a body; the plugin configuration page list is `PluginApi.getConfigurationPages` in the inventory (`GET /web/ConfigurationPages`) although jellyfin-web 10.11 reaches it through `getDashboardApi`. Not in the inventory: a remote-image list operation, `POST /Items/RemoteSearch/{Type}` other than Person, and `GET /Channels` (a user-level call); those need the live OpenAPI. The websocket messages (`SessionsStart`, `ScheduledTasksInfoStart` and so on) are documented in the inventory's WebSocket section (D), not as REST.

---

## Appendix: English text of every label key used above (`src/strings/en-us.json`, branch release-10.11.z)

Keys appear in order of first use. A few entries are also generic words that double as config property names (for example `Version`, `Folder`); where a property name and a string key coincide, only the string is shown here. `{0}`, `{1}` are positional arguments.

| Key | English |
|---|---|
| `LabelServerName` | Server name |
| `TabServer` | Server |
| `TabDashboard` | Dashboard |
| `General` | General |
| `HeaderBranding` | Branding |
| `HeaderUsers` | Users |
| `HeaderLibraries` | Libraries |
| `Display` | Display |
| `LabelMetadata` | Metadata |
| `TabNfoSettings` | NFO Settings |
| `TitlePlayback` | Playback |
| `Transcoding` | Transcoding |
| `ButtonResume` | Resume |
| `TabStreaming` | Streaming |
| `Trickplay` | Trickplay |
| `HeaderDevices` | Devices |
| `HeaderActivity` | Activity |
| `LiveTV` | Live TV |
| `HeaderDVR` | DVR |
| `TabPlugins` | Plugins |
| `TabAdvanced` | Advanced |
| `TabNetworking` | Networking |
| `HeaderApiKeys` | API Keys |
| `HeaderBackups` | Backups |
| `TabLogs` | Logs |
| `TabScheduledTasks` | Scheduled Tasks |
| `HeaderLiveTvTunerSetup` | Live TV Tuner Setup |
| `TabRepositories` | Repositories |
| `SettingsSaved` | Settings saved. |
| `Restart` | Restart |
| `MessageConfirmRestart` | Are you sure you wish to restart Jellyfin? |
| `ButtonShutdown` | Shutdown |
| `MessageConfirmShutdown` | Are you sure you wish to shut the server down? |
| `LabelServerVersion` | Server version |
| `LabelWebVersion` | Web version |
| `LabelBuildVersion` | Build version |
| `ButtonScanAllLibraries` | Scan All Libraries |
| `Movies` | Movies |
| `Series` | Series |
| `Episodes` | Episodes |
| `Albums` | Albums |
| `Songs` | Songs |
| `MusicVideos` | Music Videos |
| `Books` | Books |
| `Collections` | Collections |
| `HeaderRunningTasks` | Running Tasks |
| `Remuxing` | Remuxing |
| `RemuxHelp1` | The media is in an incompatible file container (MKV, AVI, WMV, etc) but both the video stream and audio stream are compatible with the device. The media will be repackaged losslessly on the fly before being sent to the device. |
| `RemuxHelp2` | Remux uses very little processing power with a completely lossless media quality. |
| `DirectStreaming` | Direct streaming |
| `DirectStreamHelp1` | The video stream is compatible with the device, but has an incompatible audio format (DTS, Dolby TrueHD, etc.) or number of audio channels. The video stream will be repackaged losslessly on the fly before being sent to the device. Only the audio stream will be transcoded. |
| `DirectPlaying` | Direct playing |
| `DirectPlayHelp` | The source file is entirely compatible with this client and the session is receiving the file without modifications. |
| `MediaIsBeingConverted` | The media is being converted into a format that is compatible with the device that is playing the media. |
| `LabelReasonForTranscoding` | Reason for transcoding |
| `HeaderSendMessage` | Send Message |
| `LabelMessageText` | Message text |
| `ButtonSend` | Send |
| `Alerts` | Alerts |
| `HeaderPaths` | Paths |
| `LabelCache` | Cache |
| `LabelImageCache` | Image Cache |
| `LabelProgramData` | Program Data |
| `LabelLogs` | Logs |
| `LabelTranscodes` | Transcodes |
| `LabelWeb` | Web |
| `LabelServerNameHelp` | This name will be used to identify the server and will default to the server's hostname. |
| `LabelPreferredDisplayLanguage` | Preferred display language |
| `LabelDisplayLanguageHelp` | Translating Jellyfin is an ongoing project. |
| `LearnHowYouCanContribute` | Learn how you can contribute. |
| `LabelCachePath` | Cache path |
| `LabelCachePathHelp` | Specify a custom location for server cache files such as images. Leave blank to use the server default. |
| `HeaderSelectServerCachePath` | Select Server Cache Path |
| `LabelMetadataPath` | Metadata path |
| `LabelMetadataPathHelp` | Specify a custom location for downloaded artwork and metadata. |
| `HeaderSelectMetadataPath` | Select Metadata Path |
| `EnableQuickConnect` | Enable Quick Connect on this server |
| `QuickConnect` | Quick Connect |
| `LibraryScanFanoutConcurrency` | Parallel library scan tasks limit |
| `LibraryScanFanoutConcurrencyHelp` | Maximum number of parallel tasks during library scans. Leaving this empty will choose a limit based on your systems core count. WARNING: Setting this number too high may cause issues with network file systems; if you encounter problems lower this number. |
| `HeaderPerformance` | Performance |
| `LabelParallelImageEncodingLimit` | Parallel image encoding limit |
| `LabelParallelImageEncodingLimitHelp` | Maximum number of image encodings that are allowed to run in parallel. Leaving this empty will choose a limit based on your systems core count. |
| `Save` | Save |
| `EnableSplashScreen` | Enable the splash screen image |
| `UploadCustomImage` | Upload Custom Image |
| `ImageUploadFailed` | Image upload failed |
| `ImageUploadCancelled` | Image upload cancelled |
| `CustomSplashScreenSize` | Custom images should be in a 16x9 aspect ratio at a minimum size of 1920x1080. |
| `DeleteCustomImage` | Delete Custom Image |
| `ImageDeleteFailed` | Image deletion failed |
| `LabelLoginDisclaimer` | Login disclaimer |
| `LabelLoginDisclaimerHelp` | A message that will be displayed at the bottom of the login page. |
| `LabelCustomCss` | Custom CSS code |
| `LabelCustomCssHelp` | Apply your custom CSS code for theming/branding on the web interface. |
| `File` | File |
| `LastSeen` | Last activity {0} |
| `ButtonEditUser` | Edit user |
| `ButtonLibraryAccess` | Library access |
| `ButtonParentalControl` | Parental control |
| `Delete` | Delete |
| `DeleteName` | Delete {0} |
| `DeleteUser` | Delete User |
| `DeleteUserConfirmation` | Are you sure you wish to delete this user? |
| `LabelName` | Name |
| `LabelPassword` | Password |
| `HeaderLibraryAccess` | Library Access |
| `LibraryAccessHelp` | Select the libraries to share with this user. Administrators will be able to edit all folders using the metadata manager. |
| `OptionEnableAccessToAllLibraries` | Enable access to all libraries |
| `HeaderChannelAccess` | Channel Access |
| `ChannelAccessHelp` | Select the channels to share with this user. Administrators will be able to edit all channels using the metadata manager. |
| `OptionEnableAccessToAllChannels` | Enable access to all channels |
| `Channels` | Channels |
| `ButtonCancel` | Cancel |
| `ErrorDefault` | There was an error processing the request. Please try again later. |
| `Profile` | Profile |
| `TabAccess` | Access |
| `TabParentalControl` | Parental Control |
| `HeaderPassword` | Password |
| `ButtonEditOtherUserPreferences` | Edit this user's profile, image and personal preferences. |
| `LabelAuthProvider` | Authentication Provider |
| `AuthProviderHelp` | Select an authentication provider to be used to authenticate this user's password. |
| `LabelPasswordResetProvider` | Password Reset Provider |
| `PasswordResetProviderHelp` | Pick a password reset provider to be used when this user requests a password reset. |
| `AllowRemoteAccess` | Allow remote connections to this server |
| `AllowRemoteAccessHelp` | If unchecked, all remote connections will be blocked. |
| `OptionAllowUserToManageServer` | Allow this user to manage the server |
| `AllowCollectionManagement` | Allow this user to manage collections |
| `AllowSubtitleManagement` | Allow this user to edit subtitles |
| `HeaderFeatureAccess` | Feature access |
| `OptionAllowBrowsingLiveTv` | Allow Live TV access |
| `OptionAllowManageLiveTv` | Allow Live TV recording management |
| `HeaderPlayback` | Media playback |
| `OptionAllowMediaPlayback` | Allow media playback |
| `OptionAllowMediaPlaybackTranscodingHelp` | Restricting access to transcoding may cause playback failures in clients due to unsupported media formats. |
| `OptionAllowAudioPlaybackTranscoding` | Allow audio playback that requires transcoding |
| `OptionAllowVideoPlaybackTranscoding` | Allow video playback that requires transcoding |
| `OptionAllowVideoPlaybackRemuxing` | Allow video playback that requires conversion without re-encoding |
| `OptionForceRemoteSourceTranscoding` | Force transcoding of remote media sources such as Live TV |
| `LabelRemoteClientBitrateLimit` | Internet streaming bitrate limit (Mbps) |
| `LabelRemoteClientBitrateLimitHelp` | An optional per-stream bitrate limit for all out of network devices. This is useful to prevent devices from requesting a higher bitrate than your internet connection can handle. This may result in increased CPU load on your server in order to transcode videos on the fly to a lower bitrate. |
| `LabelUserRemoteClientBitrateLimitHelp` | Override the default global value set in server settings, see Dashboard > Playback > Streaming. |
| `LabelSyncPlayAccess` | SyncPlay access |
| `None` | None |
| `SyncPlayAccessHelp` | The SyncPlay feature enables to sync playback with other devices. Select the level of access this user has to the SyncPlay. |
| `HeaderAllowMediaDeletionFrom` | Allow media deletion from |
| `AllLibraries` | All libraries |
| `HeaderRemoteControl` | Remote Control |
| `OptionAllowRemoteControlOthers` | Allow remote control of other users |
| `OptionAllowRemoteSharedDevices` | Allow remote control of shared devices |
| `OptionAllowRemoteSharedDevicesHelp` | DLNA devices are considered shared until a user begins controlling them. |
| `OptionAllowContentDownload` | Allow media downloads |
| `OptionAllowContentDownloadHelp` | Users can download media and store it on their devices. This is not the same as a sync feature. Book libraries require this enabled to function properly. |
| `OptionDisableUser` | Disable this user |
| `OptionDisableUserHelp` | The server will not allow any connections from this user. Existing connections will be abruptly ended. |
| `HeaderThisUserIsCurrentlyDisabled` | This user is currently disabled |
| `MessageReenableUser` | See below to reenable |
| `OptionHideUser` | Hide this user from login screens |
| `OptionHideUserFromLoginHelp` | Useful for private or hidden administrator accounts. The user will need to sign in manually by entering their username and password. |
| `LabelUserLoginAttemptsBeforeLockout` | Failed login tries before user is locked out |
| `OptionLoginAttemptsBeforeLockout` | Determine how many incorrect login tries can be made before lockout occurs. |
| `OptionLoginAttemptsBeforeLockoutHelp` | A value of zero means inheriting the default of three tries for normal users and five for administrators. Setting this to -1 will disable the feature. |
| `LabelUserMaxActiveSessions` | Maximum number of simultaneous user sessions |
| `OptionMaxActiveSessions` | Set the maximum number of simultaneous user sessions. |
| `OptionMaxActiveSessionsHelp` | A value of 0 will disable the feature. |
| `Name` | Name |
| `HeaderDeviceAccess` | Device Access |
| `OptionEnableAccessFromAllDevices` | Enable access from all devices |
| `DeviceAccessHelp` | This only applies to devices that can be uniquely identified and will not prevent browser access. Filtering user device access will prevent them from using new devices until they've been approved here. |
| `LabelMaxParentalRating` | Maximum allowed parental rating |
| `MaxParentalRatingHelp` | Content with a higher rating will be hidden from this user. |
| `HeaderBlockItemsWithNoRating` | Block items with no or unrecognized rating information |
| `Movie` | Movie |
| `Trailers` | Trailers |
| `Trailer` | Trailer |
| `Shows` | Shows |
| `LabelAllowContentWithTags` | Allow items with tags |
| `AllowContentWithTagsHelp` | Only show media with at least one of the specified tags. |
| `LabelBlockContentWithTags` | Block items with tags |
| `BlockContentWithTagsHelp` | Hide media with at least one of the specified tags. |
| `LabelTag` | Tag |
| `HeaderAccessSchedule` | Access Schedule |
| `HeaderAccessScheduleHelp` | Create an access schedule to limit access to certain hours. |
| `ErrorStartHourGreaterThanEnd` | End time must be greater than the start time. |
| `LabelCurrentPassword` | Current password |
| `LabelNewPassword` | New password |
| `LabelNewPasswordConfirm` | New password confirm |
| `SavePassword` | Save Password |
| `ResetPassword` | Reset Password |
| `PasswordMatchError` | Password and password confirmation must match. |
| `PasswordMissingSaveError` | New password cannot be empty. |
| `PasswordSaved` | Password saved. |
| `HeaderLoginFailure` | Login Failure |
| `MessageInvalidUser` | Invalid username or password. Please try again. |
| `PasswordResetConfirmation` | Are you sure you wish to reset the password? |
| `PasswordResetComplete` | The password has been reset. |
| `ButtonAddMediaLibrary` | Add Media Library |
| `Other` | Other |
| `EditImages` | Edit images |
| `ManageLibrary` | Manage library |
| `ButtonRename` | Rename |
| `LabelNewName` | New name |
| `MessageRenameMediaFolder` | Renaming a media library will cause all metadata to be lost, proceed with caution. |
| `ScanLibrary` | Scan library |
| `ButtonRemove` | Remove |
| `HeaderRemoveMediaFolder` | Remove Media Folder |
| `MessageAreYouSureYouWishToRemoveMediaFolder` | Are you sure you wish to remove this media folder? |
| `MessageTheFollowingLocationWillBeRemovedFromLibrary` | The following media locations will be removed from your library |
| `LabelContentType` | Content type |
| `LabelDisplayName` | Display name |
| `Folders` | Folders |
| `Add` | Add |
| `ButtonOk` | OK |
| `PleaseAddAtLeastOneFolder` | Please add at least one folder to this library by clicking the '+' button in 'Folders' section. |
| `LibraryNameInvalid` | Library name cannot be empty. |
| `ErrorAddingMediaPathToVirtualFolder` | There was an error adding the media path. Please ensure the path is valid and Jellyfin has access to that location. |
| `TabMusic` | Music |
| `HomeVideosPhotos` | Home Videos and Photos |
| `MixedMoviesShows` | Mixed Movies and Shows |
| `HeaderRemoveMediaLocation` | Remove Media Location |
| `MessageConfirmRemoveMediaLocation` | Are you sure you wish to remove this location? |
| `LibraryInvalidItemIdError` | The library is in an invalid state and cannot be edited. You are possibly encountering a bug: the path in the database is not the correct path on the filesystem. |
| `HeaderLibrarySettings` | Library Settings |
| `EnableLibrary` | Enable the library |
| `EnableLibraryHelp` | Disabling the library will hide it from all user views. |
| `LabelMetadataDownloadLanguage` | Preferred download language |
| `LabelCountry` | Country/Region |
| `EnablePhotos` | Display the photos |
| `EnablePhotosHelp` | Images will be detected and displayed alongside other media files. |
| `LabelSpecialSeasonsDisplayName` | Special season display name |
| `PreferEmbeddedTitlesOverFileNames` | Prefer embedded titles over filenames |
| `PreferEmbeddedExtrasTitlesOverFileNames` | Prefer embedded titles over filenames for extras |
| `PreferEmbeddedEpisodeInfosOverFileNames` | Prefer embedded episode information over filenames |
| `AllowEmbeddedSubtitles` | Disable different types of embedded subtitles |
| `LabelEnableRealtimeMonitor` | Enable real time monitoring |
| `LabelEnableLUFSScan` | Enable LUFS scan |
| `LabelAutomaticallyAddToCollection` | Automatically add to collection |
| `LabelAutomaticallyRefreshInternetMetadataEvery` | Automatically refresh metadata from the internet |
| `MessageEnablingOptionLongerScans` | Enabling this option may result in significantly longer library scans. |
| `LabelSaveLocalMetadata` | Save artwork into media folders |
| `LabelSaveLocalMetadataHelp` | Saving artwork into media folders will put them in a place where they can be easily edited. |
| `OptionAutomaticallyGroupSeries` | Automatically merge series that are spread across multiple folders |
| `OptionExtractTrickplayImage` | Enable trickplay image extraction |
| `ExtractTrickplayImagesHelp` | Trickplay images are similar to chapter images, except they span the entire length of the content and are used to show a preview when scrubbing through videos. |
| `LabelExtractTrickplayDuringLibraryScan` | Extract trickplay images during the library scan |
| `LabelSaveTrickplayLocally` | Save trickplay images next to media |
| `HeaderChapterImages` | Chapter Images |
| `OptionExtractChapterImage` | Enable chapter image extraction |
| `LabelExtractChaptersDuringLibraryScan` | Extract chapter images during the library scan |
| `HeaderSubtitleDownloads` | Subtitle Downloads |
| `LabelDownloadLanguages` | Download languages |
| `OptionRequirePerfectSubtitleMatch` | Only download subtitles that are a perfect match for video files |
| `LabelSkipIfAudioTrackPresent` | Skip if the default audio track matches the download language |
| `LabelSkipIfGraphicalSubsPresent` | Skip if the video already contains embedded subtitles |
| `SaveSubtitlesIntoMediaFolders` | Save subtitles into media folders |
| `Lyrics` | Lyrics |
| `SaveLyricsIntoMediaFolders` | Save lyrics into media folders |
| `LabelAudioTagSettings` | Audio Tag settings |
| `PreferNonstandardArtistsTag` | Prefer ARTISTS tag if available |
| `UseCustomTagDelimiters` | Use custom tag delimiter |
| `LabelCustomTagDelimiters` | Custom Tag Delimiter |
| `LabelDelimiterWhitelist` | Delimiter Whitelist |
| `LabelDateAddedBehavior` | Date added behavior for new content |
| `LabelDateAddedBehaviorHelp` | If a metadata value is present, it will always be used before either of these options. |
| `OptionDateAddedImportTime` | Use date scanned into the library |
| `OptionDateAddedFileTime` | Use file creation date |
| `OptionDisplayFolderView` | Display a folder view to show plain media folders |
| `OptionDisplayFolderViewHelp` | Display folders alongside your other media libraries. This can be useful if you'd like to have a plain folder view. |
| `LabelDisplaySpecialsWithinSeasons` | Display specials within seasons they aired in |
| `LabelGroupMoviesIntoCollections` | Group movies into collections |
| `LabelGroupShowsIntoCollections` | Group shows into collections |
| `OptionEnableExternalContentInSuggestions` | Enable external content in suggestions |
| `LabelLanguage` | Language |
| `HeaderPreferredMetadataLanguage` | Preferred Metadata Language |
| `DefaultMetadataLangaugeDescription` | These are your defaults and can be customized on a per-library basis. |
| `LabelDummyChapterDuration` | Interval |
| `HeaderDummyChapter` | Chapter Images |
| `LabelDummyChapterDurationHelp` | The interval between dummy chapters in seconds. Set to 0 to disable dummy chapter generation. Changing this will have no effect on existing dummy chapters. |
| `LabelChapterImageResolution` | Resolution |
| `LabelChapterImageResolutionHelp` | The resolution of the extracted chapter images. Changing this will have no effect on existing dummy chapters. |
| `LabelKodiMetadataUser` | Save user watch data to NFO files for |
| `LabelKodiMetadataUserHelp` | Save watch data to NFO files for other applications to use. |
| `LabelKodiMetadataSaveImagePaths` | Save image paths within NFO files |
| `LabelKodiMetadataEnablePathSubstitution` | Enable path substitution |
| `LabelKodiMetadataEnableExtraThumbs` | Copy extrafanart to extrathumbs field |
| `MetadataSettingChangeHelp` | Changing metadata settings will affect new content added going forward. To refresh existing content, open the detail screen and click the 'Refresh' button, or do bulk refreshes using the 'Metadata Manager'. |
| `TitleHardwareAcceleration` | Hardware Acceleration |
| `HardwareAccelerationWarning` | Enabling hardware acceleration may cause instability in some environments. Ensure that your operating system and video drivers are fully up to date. If you have difficulty playing video after enabling this, you'll need to change the setting back to None. |
| `TranscodingLoadError` | Failed to load transcoding settings |
| `LabelHardwareAccelerationType` | Hardware acceleration |
| `LabelHardwareAccelerationTypeHelp` | Hardware acceleration requires additional configuration. |
| `LabelVaapiDevice` | VA-API Device |
| `LabelVaapiDeviceHelp` | This is the render node that is used for hardware acceleration. |
| `LabelQsvDevice` | QSV Device |
| `LabelQsvDeviceHelp` | Specify the device for Intel QSV on a multi-GPU system. On Linux, this is the render node, e.g., /dev/dri/renderD128. On Windows, this is the device index starting from 0. Leave blank unless you know what you are doing. |
| `LabelEnableHardwareDecodingFor` | Enable hardware decoding for |
| `EnableDecodingColorDepth10Hevc` | Enable 10-bit hardware decoding for HEVC |
| `EnableDecodingColorDepth10Vp9` | Enable 10-bit hardware decoding for VP9 |
| `EnableEnhancedNvdecDecoder` | Enable enhanced NVDEC decoder |
| `PreferSystemNativeHwDecoder` | Prefer OS native DXVA or VA-API hardware decoders |
| `LabelHardwareEncodingOptions` | Hardware encoding options |
| `EnableHardwareEncoding` | Enable hardware encoding |
| `EnableIntelLowPowerH264HwEncoder` | Enable Intel Low-Power H.264 hardware encoder |
| `EnableIntelLowPowerHevcHwEncoder` | Enable Intel Low-Power HEVC hardware encoder |
| `IntelLowPowerEncHelp` | Low-Power Encoding can keep unnecessary CPU-GPU sync. On Linux they must be disabled if the i915 HuC firmware is not configured. |
| `LabelEncodingFormatOptions` | Encoding format options |
| `EncodingFormatHelp` | Select the video encoding that Jellyfin should transcode to. Jellyfin will use software encoding when hardware acceleration for the selected format is not available. H264 encoding will always be enabled. |
| `AllowHevcEncoding` | Allow encoding in HEVC format |
| `AllowAv1Encoding` | Allow encoding in AV1 format |
| `EnableVppTonemapping` | Enable VPP Tone mapping |
| `AllowVppTonemappingHelp` | Full Intel driver based tone-mapping. Currently works only on certain hardware with HDR10 videos. This has a higher priority compared to another OpenCL implementation. |
| `LabelVppTonemappingBrightness` | VPP Tone mapping brightness gain |
| `LabelVppTonemappingContrast` | VPP Tone mapping contrast gain |
| `EnableVideoToolboxTonemapping` | Enable VideoToolbox Tone mapping |
| `AllowVideoToolboxTonemappingHelp` | Hardware-accelerated tone-mapping provided by VideoToolbox. It works with most HDR formats, including HDR10, HDR10+, and HLG, but does not work with Dolby Vision Profile 5. This has a higher priority compared to another Metal implementation. |
| `EnableTonemapping` | Enable Tone mapping |
| `AllowTonemappingHelp` | Tone-mapping can transform the dynamic range of a video from HDR to SDR while maintaining image details and colors, which are very important information for representing the original scene. Currently works only with 10bit HDR10, HLG and DoVi videos. This requires the corresponding GPGPU runtime. |
| `LabelTonemappingAlgorithm` | Select the Tone mapping algorithm to use |
| `TonemappingAlgorithmHelp` | Tone mapping can be fine-tuned. If you are not familiar with these options, just keep the default. The recommended value is 'BT.2390'. |
| `LabelTonemappingMode` | Tone mapping mode |
| `LabelTonemappingRange` | Tone mapping range |
| `LabelTonemappingDesat` | Tone mapping desat |
| `LabelTonemappingPeak` | Tone mapping peak |
| `LabelTonemappingParam` | Tone mapping param |
| `LabelTranscodingThreadCount` | Transcoding thread count |
| `OptionMax` | Max |
| `LabelffmpegPath` | FFmpeg path |
| `LabelTranscodePath` | Transcode path |
| `LabelTranscodingTempPathHelp` | Specify a custom path for the transcode files served to clients. Leave blank to use the server default. |
| `HeaderSelectTranscodingPath` | Select Transcoding Temporary Path |
| `LabelFallbackFontPath` | Fallback font folder path |
| `EnableFallbackFont` | Enable fallback fonts |
| `LabelEnableAudioVbr` | Enable VBR audio encoding |
| `LabelDownMixAudioScale` | Audio boost when downmixing |
| `LabelStereoDownmixAlgorithm` | Stereo Downmix Algorithm |
| `LabelMaxMuxingQueueSize` | Max muxing queue size |
| `LabelEncoderPreset` | Encoding preset |
| `LabelH265Crf` | H.265 encoding CRF |
| `LabelH264Crf` | H.264 encoding CRF |
| `H264CrfHelp` | The 'Constant Rate Factor' (CRF) is the default quality setting for the x264 and x265 software encoders. You can set the values between 0 and 51, where lower values would result in better quality (at the expense of higher file sizes). Sane values are between 18 and 28. The default for x264 is 23, and for x265 is 28, so you can use this as a starting point. Hardware encoders do not use these settings. |
| `LabelDeinterlaceMethod` | Deinterlacing method |
| `UseDoubleRateDeinterlacing` | Double the frame rate when deinterlacing |
| `AllowOnTheFlySubtitleExtraction` | Allow subtitle extraction on the fly |
| `AllowFfmpegThrottling` | Throttle Transcodes |
| `AllowSegmentDeletion` | Delete segments |
| `LabelThrottleDelaySeconds` | Throttle after |
| `LabelSegmentKeepSeconds` | Time to keep segments |
| `LabelMinResumePercentage` | Minimum resume percentage |
| `LabelMaxResumePercentage` | Maximum resume percentage |
| `LabelMinAudiobookResume` | Minimum Audiobook resume in minutes |
| `LabelMaxAudiobookResume` | Audiobook remaining minutes to resume |
| `LabelMinResumeDuration` | Minimum resume duration |
| `LabelTrickplayAccel` | Enable hardware decoding |
| `LabelTrickplayAccelEncoding` | Enable hardware accelerated MJPEG encoding |
| `LabelTrickplayKeyFrameOnlyExtraction` | Only generate images from key frames |
| `LabelScanBehavior` | Scan Behavior |
| `NonBlockingScan` | Non Blocking - queues generation, then returns |
| `BlockingScan` | Blocking - queues generation, blocks scan until complete |
| `LabelProcessPriority` | Process Priority |
| `PriorityHigh` | High |
| `LabelImageInterval` | Image Interval |
| `LabelWidthResolutions` | Width Resolutions |
| `LastActive` | Last active |
| `LabelDevice` | Device |
| `LabelAppName` | App name |
| `LabelUser` | User |
| `Edit` | Edit |
| `HeaderDeleteDevice` | Delete Device |
| `DeleteDeviceConfirmation` | Are you sure you wish to delete this device? It will reappear the next time a user signs in with it. |
| `DeleteAll` | Delete All |
| `HeaderDeleteDevices` | Delete All Devices |
| `DeleteDevicesConfirmation` | Are you sure you wish to delete all devices? All other sessions will be logged out. Devices will reappear the next time a user signs in. |
| `HeaderError` | Error |
| `HeaderTunerDevices` | Tuner Devices |
| `ButtonAddTunerDevice` | Add Tuner Device |
| `MessageConfirmDeleteTunerDevice` | Are you sure you wish to delete this device? |
| `HeaderGuideProviders` | TV Guide Data Providers |
| `ButtonAddProvider` | Add Provider |
| `ButtonRefreshGuideData` | Refresh Guide Data |
| `HeaderDeleteProvider` | Delete Provider |
| `MessageConfirmDeleteGuideProvider` | Are you sure you wish to delete this guide provider? |
| `HeaderDetectMyDevices` | Detect My Devices |
| `DetectingDevices` | Detecting devices |
| `HeaderNewDevices` | New Devices |
| `NoNewDevicesFound` | No new devices found. To add a new tuner, close this dialog and enter the device information manually. |
| `LabelTunerType` | Tuner type |
| `LabelFriendlyName` | Friendly name |
| `LabelFileOrUrl` | File or URL |
| `LabelUserAgent` | User agent |
| `UserAgentHelp` | Supply a custom 'User-Agent' HTTP header. |
| `LabelSimultaneousConnectionLimit` | Simultaneous stream limit |
| `LabelFallbackMaxStreamingBitrate` | Fallback max stream bitrate (Mbps) |
| `LabelImportOnlyFavoriteChannels` | Restrict to channels marked as favorite |
| `ImportFavoriteChannelsHelp` | Only channels that are marked as favorite on the tuner device will be imported. |
| `LabelAllowHWTranscoding` | Allow hardware transcoding |
| `LabelAllowFmp4TranscodingContainer` | Allow fMP4 transcoding container |
| `LabelAllowStreamSharing` | Allow stream sharing |
| `EnableStreamLooping` | Auto-loop live streams |
| `IgnoreDts` | Ignore DTS (decoding timestamp) |
| `ReadInputAtNativeFramerate` | Read input at native frame rate |
| `DrmChannelsNotImported` | Channels with DRM will not be imported. |
| `ErrorSavingTvProvider` | There was an error saving the TV provider. Please ensure it is accessible and try again. |
| `GuideProviderLogin` | Login |
| `LabelUsername` | Username |
| `MessageCreateAccountAt` | Create an account at {0} |
| `GuideProviderSelectListings` | Select Listings |
| `LabelZipCode` | Zip Code |
| `LabelLineup` | Lineup |
| `ErrorGettingTvLineups` | There was an error downloading TV lineups. Please ensure your information is correct and try again. |
| `OptionEnableForAllTuners` | Enable for all tuner devices |
| `HeaderTuners` | Tuners |
| `ErrorPleaseSelectLineup` | Please select a lineup and try again. If no lineups are available, then please check that your username, password, and postal code is correct. |
| `ErrorAddingListingsToSchedulesDirect` | There was an error adding the lineup to your Schedules Direct account. Schedules Direct only allows a limited number of lineups per account. You may need to log into the Schedules Direct website and remove others listings from your account before proceeding. |
| `XmlTvPathHelp` | A path to a XMLTV file. Jellyfin will read this file and periodically check it for updates. You are responsible for creating and updating the file. |
| `LabelMovieCategories` | Movie categories |
| `XmlTvMovieCategoriesHelp` | Programs with these categories will be displayed as movies. Separate multiple with '\|'. |
| `LabelMoviePrefix` | Movie prefix |
| `ErrorAddingXmlTvFile` | There was an error accessing the XMLTV file. Please ensure the file exists and try again. |
| `MapChannels` | Map Channels |
| `LiveTVPageLoadError` | Failed to load recordings page |
| `LabelNumberOfGuideDays` | Number of days of guide data to download |
| `LabelNumberOfGuideDaysHelp` | Downloading more days worth of guide data provides the ability to schedule out further in advance and view more listings, but it will also take longer to download. Auto will pick based on the number of channels. |
| `LabelRecordingPath` | Default recording path |
| `LabelRecordingPathHelp` | Specify the default location to save recordings. If left empty, the server's program data folder will be used. |
| `LabelMovieRecordingPath` | Movie recording path |
| `LabelSeriesRecordingPath` | Series recording path |
| `LabelStartWhenPossible` | Start when possible |
| `MinutesBefore` | minutes before |
| `LabelStopWhenPossible` | Stop when possible |
| `MinutesAfter` | minutes after |
| `LabelPostProcessor` | Post-processing application |
| `LabelPostProcessorArguments` | Post-processor command line arguments |
| `LabelPostProcessorArgumentsHelp` | Use {path} as the path to the recording file. |
| `SaveRecordingNFO` | Save recording EPG metadata in NFO |
| `SaveRecordingNFOHelp` | Save metadata from EPG listings provider along side media. |
| `SaveRecordingImages` | Save recording EPG images |
| `SaveRecordingImagesHelp` | Save images from EPG listings provider along side media. |
| `HeaderDefaultRecordingSettings` | Default Recording Settings |
| `HeaderRecordingPostProcessing` | Recording Post Processing |
| `HeaderRecordingMetadataSaving` | Recording Metadata |
| `LabelLocalHttpServerPortNumber` | Local HTTP port number |
| `LabelEnableHttps` | Enable HTTPS |
| `LabelHttpsPort` | Local HTTPS port number |
| `LabelBaseUrl` | Base URL |
| `LabelBindToLocalNetworkAddress` | Bind to local network address |
| `SettingsWarning` | Changing these values may cause instability or connectivity failures. If you experience any problems, we recommend changing them back to default. |
| `LabelLanNetworks` | LAN networks |
| `LabelKnownProxies` | Known proxies |
| `LabelRequireHttps` | Require HTTPS |
| `LabelCustomCertificatePath` | Custom SSL certificate path |
| `LabelCertificatePassword` | Certificate password |
| `LabelAllowedRemoteAddresses` | Remote IP address filter |
| `LabelAllowedRemoteAddressesMode` | Remote IP address filter mode |
| `LabelPublicHttpPort` | Public HTTP port number |
| `LabelPublicHttpsPort` | Public HTTPS port number |
| `LabelEnableIP4` | Enable IPv4 |
| `LabelEnableIP6` | Enable IPv6 |
| `LabelAutomaticDiscovery` | Enable Auto Discovery |
| `LabelPublishedServerUri` | Published Server URIs |
| `HeaderApiKey` | API Key |
| `HeaderApp` | App |
| `HeaderDateIssued` | Date Issued |
| `ButtonRevoke` | Revoke |
| `HeaderNewApiKey` | New API Key |
| `LabelAppNameExample` | A human readable name for identifying API keys. This setting will not affect functionality. |
| `Create` | Create |
| `HeaderConfirmRevokeApiKey` | Revoke API Key |
| `MessageConfirmRevokeApiKey` | Are you sure you wish to revoke this API key? The application's connection to this server will be abruptly ended. |
| `HeaderSelectPath` | Select Path |
| `LabelFolder` | Folder |
| `LabelPath` | Path |
| `LabelOptionalNetworkPath` | Shared network folder |
| `LabelOptionalNetworkPathHelp` | If this folder is shared on your network, supplying the network share path can allow clients on other devices to access media files directly. For example, {0} or {1}. |
| `ButtonBack` | Back |
| `MessageDirectoryPickerLinuxInstruction` | For Linux on Arch Linux, CentOS, Debian, Fedora, openSUSE, or Ubuntu, you must grant the service user at least read access to your storage locations. |
| `MessageDirectoryPickerBSDInstruction` | For BSD, you may need to set up storage within your 'FreeNAS Jail' so Jellyfin can access your media. |
| `Refresh` | Refresh |
| `PathNotFound` | The path could not be found. Please ensure the path is valid and try again. |
| `WriteAccessRequired` | Jellyfin requires write access to this folder. Please ensure write access and try again. |
| `HeaderBackupsHelp` | Create and restore snapshots of your server which can include the database, metadata, subtitles and trickplay. |
| `BackupsPageLoadError` | Failed to load backups page |
| `ButtonCreateBackup` | Create Backup |
| `MessageBackupDisclaimer` | Depending on the size of your library, the backup process may take a while. |
| `LabelDatabase` | Database |
| `Subtitles` | Subtitles |
| `UnknownError` | An unknown error occurred. |
| `Copied` | Copied |
| `LabelVersion` | Version |
| `LabelRestore` | Restore |
| `MessageRestoreDisclaimer` | WARNING: You are about to restore from a previous backup. Your server will be rendered unusable for the duration of the process and any new data created since the backup will be lost. |
| `Success` | Success |
| `MessageRestoreSuccess` | Restore successfully completed |
| `LabelSlowResponseEnabled` | Log a warning message if the server was slow to answer |
| `LabelSlowResponseTime` | Time in ms after which a response is considered slow |
| `DateModified` | Date modified |
| `Copy` | Copy |
| `CopyLogSuccess` | Log contents copied successfully. |
| `Download` | Download |
| `Retry` | Retry |
| `LogLoadFailure` | Failed to load the log file. It may still be actively written to. |
| `LabelTime` | Time |
| `ButtonAddScheduledTaskTrigger` | Add Trigger |
| `HeaderDeleteTaskTrigger` | Delete Task Trigger |
| `MessageDeleteTaskTrigger` | Are you sure you wish to delete this task trigger? |
| `LabelTriggerType` | Trigger type |
| `OptionDaily` | Daily |
| `OptionWeekly` | Weekly |
| `OptionOnInterval` | On an interval |
| `OnApplicationStartup` | On application startup |
| `LabelDay` | Day of week |
| `LabelEveryXMinutes` | Every |
| `LabelTimeLimitHours` | Time limit (hours) |
| `All` | All |
| `LabelAvailable` | Available |
| `LabelInstalled` | Installed |
| `Search` | Search |
| `ManageRepositories` | Manage Repositories |
| `PluginsLoadError` | An error occurred while loading plugins. |
| `LabelStatus` | Status |
| `LabelNotInstalled` | Not installed |
| `LabelDeveloper` | Developer |
| `Unknown` | Unknown |
| `LabelRepository` | Repository |
| `LabelBundled` | Bundled |
| `LabelNoChangelog` | No changelog provided for this release. |
| `HeaderInstall` | Install |
| `HeaderConfirmPluginInstallation` | Confirm Plugin Installation |
| `MessagePluginInstallDisclaimer` | WARNING: Installing a third party plugin carries risks. It may contain unstable or malicious code, and may change at any time. Only install plugins from authors that you trust, and please be aware of the potential effects it may have, including external service queries, longer library scans, or additional background processing. |
| `MessagePluginInstalled` | The plugin has been successfully installed. The server will need to be restarted for changes to take effect. |
| `MessagePluginInstallError` | An error occurred while installing the plugin. |
| `ServerRestartNeededAfterPluginInstall` | Jellyfin will need to be restarted after installing the plugin. |
| `PluginEnableError` | An error occurred while enabling the plugin. |
| `PluginDisableError` | An error occurred while disabling the plugin. |
| `HeaderUninstallPlugin` | Uninstall Plugin |
| `UninstallPluginConfirmation` | Are you sure you wish to uninstall {0}? |
| `PluginUninstallError` | An error occurred while uninstalling the plugin. |
| `PluginLoadConfigError` | An error occurred while getting the plugin configuration pages. |
| `PluginLoadRepoError` | An error occurred while getting the plugin details from the repository. |
| `MessageGetInstalledPluginsError` | An error occurred while getting the list of currently installed plugins. |
| `MessageNoRepositories` | No repositories. |
| `MessageAddRepository` | If you wish to add a repository, click the button next to the header and fill out the requested information. |
| `RepositoriesPageLoadError` | Failed to load repositories |
| `HeaderNewRepository` | New Repository |
| `LabelRepositoryName` | Repository Name |
| `LabelRepositoryNameHelp` | A custom name to distinguish this repository from any others added to your server. |
| `LabelRepositoryUrl` | Repository URL |
| `LabelRepositoryUrlHelp` | The location of the repository manifest you want to include. |
| `ConfirmDeleteRepository` | Delete repository? |
| `DeleteRepositoryConfirmation` | Are you sure you want to delete this repository? |
| `HeaderRevisionHistory` | Revision History |
| `LabelEnablePlugin` | Enable plugin |
| `Settings` | Settings |
| `ButtonUninstall` | Uninstall |
| `ConfirmDeleteImage` | Delete image? |
| `ListPaging` | {0}-{1} of {2} |
| `Unrated` | Unrated |
| `Primary` | Primary |
| `MessageImageFileTypeAllowed` | Only JPEG and PNG files are supported. |
| `MessageImageTypeNotSelected` | Please select an image type from the drop-down menu. |
| `MessageFileReadError` | There was an error reading the file. Please try again. |
| `PleaseEnterNameOrId` | Please enter a name or an external ID. |
| `ScanForNewAndUpdatedFiles` | Scan for new and updated files |
| `SearchForMissingMetadata` | Search for missing metadata |
| `ReplaceAllMetadata` | Replace all metadata |
| `ReplaceExistingImages` | Replace existing images |
| `ReplaceTrickplayImages` | Replace existing trickplay images |
| `RefreshDialogHelp` | Metadata is refreshed based on settings and internet services that are enabled in the Dashboard. |
| `RefreshQueued` | Refresh queued. |
| `RefreshMetadata` | Refresh metadata |
| `DeleteSeries` | Delete Series |
| `DeleteEpisode` | Delete Episode |
| `DeleteMedia` | Delete media |
| `HeaderDeleteSeries` | Delete Series |
| `ConfirmDeleteSeries` | Deleting this series will delete ALL {0} episodes from both the file system and your media library. Are you sure you wish to continue? |
| `DeleteEntireSeries` | Delete {0} Episodes |
| `HeaderDeleteItem` | Delete Item |
| `ConfirmDeleteItem` | Deleting this item will delete it from both the file system and your media library. Are you sure you wish to continue? |
| `ErrorDeletingItem` | There was an error deleting the item from the server. Please check that Jellyfin has write access to the media folder and try again. |
| `HeaderDeleteLyrics` | Delete Lyrics |
| `ConfirmDeleteLyrics` | Deleting these lyrics will delete them from both the file system and your media library. Are you sure you wish to continue? |
| `ErrorDeletingLyrics` | There was an error deleting the lyrics from the server. Please check that Jellyfin has write access to the media folder and try again. |
| `MoreMediaInfo` | Media Info |
| `MediaInfoContainer` | Container |
| `MediaInfoPath` | Path |
| `MediaInfoSize` | Size |
| `Data` | Data |
| `Audio` | Audio |
| `Subtitle` | Subtitle |
| `Video` | Video |
| `Lyric` | Lyric |
| `Image` | Image |
| `MediaInfoTitle` | Title |
| `MediaInfoLanguage` | Language |
| `MediaInfoCodec` | Codec |
| `MediaInfoCodecTag` | Codec tag |
| `MediaInfoProfile` | Profile |
| `MediaInfoLevel` | Level |
| `MediaInfoResolution` | Resolution |
| `MediaInfoAspectRatio` | Aspect ratio |
| `MediaInfoAnamorphic` | Anamorphic |
| `MediaInfoInterlaced` | Interlaced |
| `MediaInfoFramerate` | Framerate |
| `MediaInfoLayout` | Layout |
| `MediaInfoChannels` | Channels |
| `MediaInfoBitrate` | Bitrate |
| `MediaInfoSampleRate` | Sample rate |
| `MediaInfoBitDepth` | Bit depth |
| `MediaInfoVideoRange` | Video range |
| `MediaInfoVideoRangeType` | Video range type |
| `MediaInfoDoViTitle` | DV title |
| `MediaInfoDvVersionMajor` | DV version major |
| `MediaInfoDvVersionMinor` | DV version minor |
| `MediaInfoDvProfile` | DV profile |
| `MediaInfoDvLevel` | DV level |
| `MediaInfoRpuPresentFlag` | DV rpu preset flag |
| `MediaInfoElPresentFlag` | DV el preset flag |
| `MediaInfoBlPresentFlag` | DV bl preset flag |
| `MediaInfoDvBlSignalCompatibilityId` | DV bl signal compatibility id |
| `MediaInfoColorSpace` | Color space |
| `MediaInfoColorTransfer` | Color transfer |
| `MediaInfoColorPrimaries` | Color primaries |
| `MediaInfoPixelFormat` | Pixel format |
| `MediaInfoRefFrames` | Ref frames |
| `MediaInfoRotation` | Rotation |
| `MediaInfoDefault` | Default |
| `MediaInfoForced` | Forced |
| `MediaInfoExternal` | External |
| `MediaInfoTimestamp` | Timestamp |
| `CopyFailed` | Could not copy |
| `ConfirmDeletion` | Confirm Deletion |
| `MessageAreYouSureDeleteSubtitles` | Are you sure you wish to delete this subtitle file? |
| `MessageDownloadQueued` | Download queued. |
| `HeaderAddToCollection` | Add to Collection |
| `NewCollection` | New Collection |
| `LabelCollection` | Collection |
| `SearchForCollectionInternetMetadata` | Search the internet for artwork and metadata |
| `RemoveFromCollection` | Remove from collection |
| `QuickConnectDescription` | To sign in with Quick Connect, select the 'Quick Connect' button on the device you are logging in from and enter the displayed code below. |
| `LabelQuickConnectCode` | Quick Connect code |
| `Authorize` | Authorize |
| `QuickConnectInvalidCode` | Invalid Quick Connect code |
| `QuickConnectAuthorizeFail` | Unknown Quick Connect code |
| `QuickConnectAuthorizeSuccess` | You have successfully authenticated your device! |
| `GoHome` | Go Home |
