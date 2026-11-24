<!-- Inventory of the Jellyfin 10.11 admin API (operations, policies, configuration models, WebSocket messages), generated from the test server's OpenAPI document and the @jellyfin/sdk generated client. -->

# Jellyfin 10.11 admin API inventory

Source: OpenAPI document of the throwaway test server (`localhost:8097`, `info.version` 10.11.11, 315 paths, 388 operations, 357 schemas) and the SDK's `lib/generated-client/api/*.d.ts`. Everything below was extracted programmatically; nothing was written from memory except where marked "not in spec".

Conventions: `*` after a parameter name means required. Path parameters are prefixed `path`. Request bodies are listed with the first content type the spec offers (JSON bodies are also accepted as `text/json` and `application/*+json`). "SDK class.method" is the method on the generated API class (call it as `new XApi(configuration).method(params)` or via `getXApi(api)`); **(none)** means the SDK has no method for that operation.

## Policies found in the spec

The spec only gives policy names (security scheme `CustomAuthentication`, scopes = policy names). The meanings below are derived from the names and the matching `UserPolicy` fields; the spec itself contains no policy descriptions (**not in spec**, verify against server code before relying on edge cases). Operations without a `security` entry are anonymous.

| Policy | Operations | Meaning |
|---|---|---|
| DefaultAuthorization | 257 | Any signed-in user or API key (the base policy; combined with the others below on most operations). |
| RequiresElevation | 78 | Administrator only. |
| (none: anonymous) | 59 | No authentication required. |
| LiveTvAccess | 22 | User with Live TV access (`EnableLiveTvAccess`). |
| SyncPlayHasAccess | 22 | SyncPlay access (`SyncPlayAccess` is not `None`). |
| FirstTimeSetupOrElevated | 21 | Allowed without authentication while the first-run wizard is incomplete; otherwise administrator only. |
| SyncPlayIsInGroup | 17 | SyncPlay: caller is currently in a group. |
| LiveTvManagement | 7 | User with the Live TV management permission (`EnableLiveTvManagement`). |
| FirstTimeSetupOrDefault | 5 | Open during first-run setup; otherwise any signed-in user. |
| LyricManagement | 5 | User with the lyric-management permission (`EnableLyricManagement`). |
| SubtitleManagement | 4 | User with the subtitle-management permission (`EnableSubtitleManagement`). |
| CollectionManagement | 3 | User with the collection-management permission (`EnableCollectionManagement`). |
| SyncPlayJoinGroup | 3 | SyncPlay: may join groups. |
| Download | 1 | User allowed to download media (`EnableContentDownloading`). |
| SyncPlayCreateGroup | 1 | SyncPlay: may create groups (`SyncPlayAccess` = CreateAndJoinGroups). |
| FirstTimeSetupOrIgnoreParentalControl | 1 | Open during first-run setup; otherwise a user allowed to ignore parental controls. |
| LocalAccessOrRequiresElevation | 1 | Administrator, or a request from the local network (used by `POST /System/Restart`). |
| IgnoreParentalControl | 1 | User allowed to bypass parental-control restrictions (or administrator). |

Elevated operations (RequiresElevation, FirstTimeSetupOrElevated, LocalAccessOrRequiresElevation): **100**. Other non-default management policies (LiveTvManagement, SubtitleManagement, LyricManagement, CollectionManagement), listed in section A as well: **19**.

Caveat (verified against server source, release-10.11.z): the spec marks some admin-flavoured operations only as DefaultAuthorization; the handlers add checks the spec cannot show. `GET /Users` (`Jellyfin.Api/Controllers/UserController.cs`): plain `[Authorize]`, no admin check; any signed-in user lists users (filters `isHidden`/`isDisabled` only). `POST /Users`, `POST /Users/Password`, `POST /Users/Configuration` (same file): call `RequestHelpers.AssertCanUpdateUser(User, user, true)` (`Jellyfin.Api/Helpers/RequestHelpers.cs`): updating another user requires an administrator; updating yourself requires `EnableUserPreferenceAccess` on your own policy unless you are admin; failure is 403. `POST /Users/Password` additionally demands the current password unless the caller is an administrator. `DELETE /Items` and `DELETE /Items/{itemId}` (`Jellyfin.Api/Controllers/LibraryController.cs`): plain `[Authorize]`, then `item.CanDelete(user)` per item (an API key skips the check); `DELETE /Items` deletes one id at a time, so a failure part-way leaves earlier items already deleted. Class-level policies matter too: `ItemUpdateController` is `RequiresElevation` for every action. Also note `GET /System/Configuration/{key}` and `GET /System/Configuration` have no elevation: any signed-in user can read every named section (encoding paths, network, ...), only writes are admin.

# A. Elevated and permission-gated operations, by area

## 1. System & server

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `POST /System/Configuration` | `SystemApi.updateConfiguration` | RequiresElevation | Updates application configuration. | body: ServerConfiguration* (application/json) | 204 (no body) |
| `POST /System/Configuration/{key}` | `SystemApi.updateNamedConfiguration` | RequiresElevation | Updates named configuration. | path key*; body: any* (application/json) | 204 (no body) |
| `GET /web/ConfigurationPages` | `PluginApi.getConfigurationPages` | RequiresElevation | Gets the configuration pages. | enableInMainMenu | ConfigurationPageInfo[] |
| `GET /System/Info/Storage` | `SystemApi.getSystemStorage` | RequiresElevation | Gets information about the server. | - | SystemStorageDto |
| `GET /System/Logs` | `SystemApi.getServerLogs` | RequiresElevation | Gets a list of available server log files. | - | LogFile[] |
| `GET /System/Logs/Log` | `SystemApi.getLogFile` | RequiresElevation | Gets a log file. | name* | binary (text/plain) |
| `POST /System/Restart` | `SystemApi.restartApplication` | LocalAccessOrRequiresElevation | Restarts the application. | - | 204 (no body) |
| `POST /System/Shutdown` | `SystemApi.shutdownApplication` | RequiresElevation | Shuts down the application. | - | 204 (no body) |

## 2. Branding

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `POST /System/Configuration/Branding` | `SystemApi.updateBrandingConfiguration` | RequiresElevation | Updates branding configuration. | body: BrandingOptionsDto* (application/json) | 204 (no body) |
| `POST /Branding/Splashscreen` | `ImageApi.uploadCustomSplashscreen` | RequiresElevation | Uploads a custom splashscreen. The body is expected to the image contents base64 encoded. | body: string (binary) (image/*) | 204 (no body) |
| `DELETE /Branding/Splashscreen` | `ImageApi.deleteCustomSplashscreen` | RequiresElevation | Delete a custom splashscreen. | - | 204 (no body) |

## 3. Users

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `GET /Auth/PasswordResetProviders` | `AuthenticationApi.getPasswordResetProviders` | RequiresElevation | Get all password reset providers. | - | NameIdPair[] |
| `GET /Auth/Providers` | `AuthenticationApi.getAuthProviders` | RequiresElevation | Get all auth providers. | - | NameIdPair[] |
| `DELETE /Users/{userId}` | `UserApi.deleteUser` | RequiresElevation | Deletes a user. | path userId* | 204 (no body) |
| `POST /Users/{userId}/Policy` | `UserApi.updateUserPolicy` | RequiresElevation | Updates a user policy. | path userId*; body: UserPolicy* (application/json) | 204 (no body) |
| `POST /Users/New` | `UserApi.createUserByName` | RequiresElevation | Creates a user. | body: CreateUserByName* (application/json) | UserDto |

## 4. Libraries

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `GET /System/Configuration/MetadataOptions/Default` | `SystemApi.getDefaultMetadataOptions` | RequiresElevation | Gets a default MetadataOptions object. | - | MetadataOptions |
| `GET /Library/MediaFolders` | `LibraryApi.getMediaFolders` | RequiresElevation | Gets all user media folders. | isHidden | BaseItemDtoQueryResult |
| `GET /Library/PhysicalPaths` | `LibraryApi.getPhysicalPaths` | RequiresElevation | Gets a list of physical paths from virtual folders. | - | string[] |
| `POST /Library/Refresh` | `LibraryApi.refreshLibrary` | RequiresElevation | Starts a library scan. | - | 204 (no body) |
| `GET /Library/VirtualFolders` | `LibraryStructureApi.getVirtualFolders` | FirstTimeSetupOrElevated | Gets all virtual folders. | - | VirtualFolderInfo[] |
| `POST /Library/VirtualFolders` | `LibraryStructureApi.addVirtualFolder` | FirstTimeSetupOrElevated | Adds a virtual folder. | name, collectionType, paths, refreshLibrary; body: AddVirtualFolderDto (application/json) | 204 (no body) |
| `DELETE /Library/VirtualFolders` | `LibraryStructureApi.removeVirtualFolder` | FirstTimeSetupOrElevated | Removes a virtual folder. | name, refreshLibrary | 204 (no body) |
| `POST /Library/VirtualFolders/LibraryOptions` | `LibraryStructureApi.updateLibraryOptions` | FirstTimeSetupOrElevated | Update library options. | body: UpdateLibraryOptionsDto (application/json) | 204 (no body) |
| `POST /Library/VirtualFolders/Name` | `LibraryStructureApi.renameVirtualFolder` | FirstTimeSetupOrElevated | Renames a virtual folder. | name, newName, refreshLibrary | 204 (no body) |
| `POST /Library/VirtualFolders/Paths` | `LibraryStructureApi.addMediaPath` | FirstTimeSetupOrElevated | Add a media path to a library. | refreshLibrary; body: MediaPathDto* (application/json) | 204 (no body) |
| `DELETE /Library/VirtualFolders/Paths` | `LibraryStructureApi.removeMediaPath` | FirstTimeSetupOrElevated | Remove a media path. | name, path, refreshLibrary | 204 (no body) |
| `POST /Library/VirtualFolders/Paths/Update` | `LibraryStructureApi.updateMediaPath` | FirstTimeSetupOrElevated | Updates a media path. | body: UpdateMediaPathRequestDto* (application/json) | 204 (no body) |

## 5. Playback & encoding configuration

No dedicated paths. Encoding options, trickplay, resume thresholds and streaming bitrate live in the named configuration section `encoding` (`EncodingOptions`) and in `ServerConfiguration` (`TrickplayOptions`, `MinResumePct`, `MaxResumePct`, `MinAudiobookResume`, `MaxAudiobookResume`, `RemoteClientBitrateLimit`, ...). Read with `GET /System/Configuration/{key}`, write with `POST /System/Configuration/{key}` / `POST /System/Configuration` (see area 1).

## 6. Sessions & devices

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `GET /Devices` | `DeviceApi.getDevices` | RequiresElevation | Get Devices. | userId | DeviceInfoDtoQueryResult |
| `DELETE /Devices` | `DeviceApi.deleteDevice` | RequiresElevation | Deletes a device. | id* | 204 (no body) |
| `GET /Devices/Info` | `DeviceApi.getDeviceInfo` | RequiresElevation | Get info for a device. | id* | DeviceInfoDto |
| `GET /Devices/Options` | `DeviceApi.getDeviceOptions` | RequiresElevation | Get options for a device. | id* | DeviceOptionsDto |
| `POST /Devices/Options` | `DeviceApi.updateDeviceOptions` | RequiresElevation | Update device options. | id*; body: DeviceOptionsDto* (application/json) | 204 (no body) |

## 7. Activity log

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `GET /System/ActivityLog/Entries` | `SystemApi.getLogEntries` | RequiresElevation | Gets activity log entries. | startIndex, limit, minDate, hasUserId | ActivityLogEntryQueryResult |

## 8. Live TV

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `GET /LiveTv/ChannelMappingOptions` | `LiveTvApi.getChannelMappingOptions` | RequiresElevation | Get channel mapping options. | providerId | ChannelMappingOptionsDto |
| `POST /LiveTv/ChannelMappings` | `LiveTvApi.setChannelMapping` | RequiresElevation | Set channel mappings. | body: SetChannelMappingDto* (application/json) | TunerChannelMapping |
| `POST /LiveTv/ListingProviders` | `LiveTvApi.addListingProvider` | RequiresElevation | Adds a listings provider. | pw, validateListings, validateLogin; body: ListingsProviderInfo (application/json) | ListingsProviderInfo |
| `DELETE /LiveTv/ListingProviders` | `LiveTvApi.deleteListingProvider` | RequiresElevation | Delete listing provider. | id | 204 (no body) |
| `GET /LiveTv/ListingProviders/SchedulesDirect/Countries` | `LiveTvApi.getSchedulesDirectCountries` | RequiresElevation | Gets available countries. | - | binary (application/json) |
| `DELETE /LiveTv/Recordings/{recordingId}` | `LiveTvApi.deleteRecording` | LiveTvManagement | Deletes a live tv recording. | path recordingId* | 204 (no body) |
| `POST /LiveTv/SeriesTimers` | `LiveTvApi.createSeriesTimer` | LiveTvManagement | Creates a live tv series timer. | body: SeriesTimerInfoDto (application/json) | 204 (no body) |
| `DELETE /LiveTv/SeriesTimers/{timerId}` | `LiveTvApi.cancelSeriesTimer` | LiveTvManagement | Cancels a live tv series timer. | path timerId* | 204 (no body) |
| `POST /LiveTv/SeriesTimers/{timerId}` | `LiveTvApi.updateSeriesTimer` | LiveTvManagement | Updates a live tv series timer. | path timerId*; body: SeriesTimerInfoDto (application/json) | 204 (no body) |
| `POST /LiveTv/Timers` | `LiveTvApi.createTimer` | LiveTvManagement | Creates a live tv timer. | body: TimerInfoDto (application/json) | 204 (no body) |
| `DELETE /LiveTv/Timers/{timerId}` | `LiveTvApi.cancelTimer` | LiveTvManagement | Cancels a live tv timer. | path timerId* | 204 (no body) |
| `POST /LiveTv/Timers/{timerId}` | `LiveTvApi.updateTimer` | LiveTvManagement | Updates a live tv timer. | path timerId*; body: TimerInfoDto (application/json) | 204 (no body) |
| `POST /LiveTv/TunerHosts` | `LiveTvApi.addTunerHost` | RequiresElevation | Adds a tuner host. | body: TunerHostInfo (application/json) | TunerHostInfo |
| `DELETE /LiveTv/TunerHosts` | `LiveTvApi.deleteTunerHost` | RequiresElevation | Deletes a tuner host. | id | 204 (no body) |
| `POST /LiveTv/Tuners/{tunerId}/Reset` | `LiveTvApi.resetTuner` | RequiresElevation | Resets a tv tuner. | path tunerId* | 204 (no body) |
| `GET /LiveTv/Tuners/Discover` | `LiveTvApi.discoverTuners` | RequiresElevation | Discover tuners. | newDevicesOnly | TunerHostInfo[] |
| `GET /LiveTv/Tuners/Discvover` | `LiveTvApi.discvoverTuners` | RequiresElevation | Discover tuners. | newDevicesOnly | TunerHostInfo[] |

## 9. Plugins, repositories & packages

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `GET /Packages` | `PluginApi.getPackages` | RequiresElevation | Gets available packages. | - | PackageInfo[] |
| `GET /Packages/{name}` | `PluginApi.getPackageInfo` | RequiresElevation | Gets a package by name or assembly GUID. | path name*, assemblyGuid | PackageInfo |
| `POST /Packages/Installed/{name}` | `PluginApi.installPackage` | RequiresElevation | Installs a package. | path name*, assemblyGuid, version, repositoryUrl | 204 (no body) |
| `DELETE /Packages/Installing/{packageId}` | `PluginApi.cancelPackageInstallation` | RequiresElevation | Cancels a package installation. | path packageId* | 204 (no body) |
| `GET /Repositories` | `PluginApi.getRepositories` | RequiresElevation | Gets all package repositories. | - | RepositoryInfo[] |
| `POST /Repositories` | `PluginApi.setRepositories` | RequiresElevation | Sets the enabled and existing package repositories. | body: RepositoryInfo[]* (application/json) | 204 (no body) |
| `GET /Plugins` | `PluginApi.getPlugins` | RequiresElevation | Gets a list of currently installed plugins. | - | PluginInfo[] |
| `DELETE /Plugins/{pluginId}` | `PluginApi.uninstallPlugin` | RequiresElevation | Uninstalls a plugin. | path pluginId* | 204 (no body) |
| `DELETE /Plugins/{pluginId}/{version}` | `PluginApi.uninstallPluginByVersion` | RequiresElevation | Uninstalls a plugin by version. | path pluginId*, path version* | 204 (no body) |
| `POST /Plugins/{pluginId}/{version}/Disable` | `PluginApi.disablePlugin` | RequiresElevation | Disable a plugin. | path pluginId*, path version* | 204 (no body) |
| `POST /Plugins/{pluginId}/{version}/Enable` | `PluginApi.enablePlugin` | RequiresElevation | Enables a disabled plugin. | path pluginId*, path version* | 204 (no body) |
| `GET /Plugins/{pluginId}/{version}/Image` | `PluginApi.getPluginImage` | RequiresElevation | Gets a plugin's image. | path pluginId*, path version* | binary (image/*) |
| `GET /Plugins/{pluginId}/Configuration` | `PluginApi.getPluginConfiguration` | RequiresElevation | Gets plugin configuration. | path pluginId* | BasePluginConfiguration |
| `POST /Plugins/{pluginId}/Configuration` | `PluginApi.updatePluginConfiguration` | RequiresElevation | Updates plugin configuration. | path pluginId* | 204 (no body) |
| `POST /Plugins/{pluginId}/Manifest` | `PluginApi.getPluginManifest` | RequiresElevation | Gets a plugin's manifest. | path pluginId* | 204 (no body) |

## 10. Scheduled tasks & triggers

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `GET /ScheduledTasks` | `ScheduledTaskApi.getTasks` | RequiresElevation | Get tasks. | isHidden, isEnabled | TaskInfo[] |
| `GET /ScheduledTasks/{taskId}` | `ScheduledTaskApi.getTask` | RequiresElevation | Get task by id. | path taskId* | TaskInfo |
| `POST /ScheduledTasks/{taskId}/Triggers` | `ScheduledTaskApi.updateTask` | RequiresElevation | Update specified task triggers. | path taskId*; body: TaskTriggerInfo[]* (application/json) | 204 (no body) |
| `POST /ScheduledTasks/Running/{taskId}` | `ScheduledTaskApi.startTask` | RequiresElevation | Start specified task. | path taskId* | 204 (no body) |
| `DELETE /ScheduledTasks/Running/{taskId}` | `ScheduledTaskApi.stopTask` | RequiresElevation | Stop specified task. | path taskId* | 204 (no body) |

## 11. Networking

No dedicated paths. Network settings are the named configuration section `network` (`NetworkConfiguration`), read/written with `GET/POST /System/Configuration/{key}` (see area 1). `GET /System/Endpoint` (not elevated) reports `EndPointInfo` (IsLocal / IsInNetwork).

## 12. API keys

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `GET /Auth/Keys` | `AuthenticationApi.getKeys` | RequiresElevation | Get all keys. | - | AuthenticationInfoQueryResult |
| `POST /Auth/Keys` | `AuthenticationApi.createKey` | RequiresElevation | Create a new api key. | app* | 204 (no body) |
| `DELETE /Auth/Keys/{key}` | `AuthenticationApi.revokeKey` | RequiresElevation | Remove an api key. | path key* | 204 (no body) |

## 13. Backups

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `GET /Backup` | `BackupApi.listBackups` | RequiresElevation | Gets a list of all currently present backups in the backup directory. | - | BackupManifestDto[] |
| `POST /Backup/Create` | `BackupApi.createBackup` | RequiresElevation | Creates a new Backup. | body: BackupOptionsDto (application/json) | BackupManifestDto |
| `GET /Backup/Manifest` | `BackupApi.getBackup` | RequiresElevation | Gets the descriptor from an existing archive is present. | path* | BackupManifestDto |
| `POST /Backup/Restore` | `BackupApi.startRestoreBackup` | RequiresElevation | Restores to a backup by restarting the server and applying the backup. | body: BackupRestoreRequestDto* (application/json) | 204 (no body) |

## 14. Quick Connect

(no elevated operations)

## 15. Localization & environment helpers

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `GET /Environment/DefaultDirectoryBrowser` | `EnvironmentApi.getDefaultDirectoryBrowser` | FirstTimeSetupOrElevated | Get Default directory browser. | - | DefaultDirectoryBrowserInfoDto |
| `GET /Environment/DirectoryContents` | `EnvironmentApi.getDirectoryContents` | FirstTimeSetupOrElevated | Gets the contents of a given directory in the file system. | path*, includeFiles, includeDirectories | FileSystemEntryInfo[] |
| `GET /Environment/Drives` | `EnvironmentApi.getDrives` | FirstTimeSetupOrElevated | Gets available drives from the server's file system. | - | FileSystemEntryInfo[] |
| `GET /Environment/NetworkShares` | **(none)** | FirstTimeSetupOrElevated | Gets network paths. | - | FileSystemEntryInfo[] |
| `GET /Environment/ParentPath` | `EnvironmentApi.getParentPath` | FirstTimeSetupOrElevated | Gets the parent path of a given path. | path* | string |
| `POST /Environment/ValidatePath` | `EnvironmentApi.validatePath` | FirstTimeSetupOrElevated | Validates path. | body: ValidatePathDto* (application/json) | 204 (no body) |

## 16. Item editing

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `DELETE /Items/{itemId}/Images/{imageType}` | `ImageApi.deleteItemImage` | RequiresElevation | Delete an item's image. | path itemId*, path imageType*, imageIndex | 204 (no body) |
| `POST /Items/{itemId}/Images/{imageType}` | `ImageApi.setItemImage` | RequiresElevation | Set item image. | path itemId*, path imageType*; body: string (binary) (image/*) | 204 (no body) |
| `DELETE /Items/{itemId}/Images/{imageType}/{imageIndex}` | `ImageApi.deleteItemImageByIndex` | RequiresElevation | Delete an item's image. | path itemId*, path imageType*, path imageIndex* | 204 (no body) |
| `POST /Items/{itemId}/Images/{imageType}/{imageIndex}` | `ImageApi.setItemImageByIndex` | RequiresElevation | Set item image. | path itemId*, path imageType*, path imageIndex*; body: string (binary) (image/*) | 204 (no body) |
| `POST /Items/{itemId}/Images/{imageType}/{imageIndex}/Index` | `ImageApi.updateItemImageIndex` | RequiresElevation | Updates the index for an item image. | path itemId*, path imageType*, path imageIndex*, newIndex* | 204 (no body) |
| `GET /Items/{itemId}/ExternalIdInfos` | `ItemLookupApi.getExternalIdInfos` | RequiresElevation | Get the item's external id info. | path itemId* | ExternalIdInfo[] |
| `POST /Items/RemoteSearch/Apply/{itemId}` | `ItemLookupApi.applySearchCriteria` | RequiresElevation | Applies search criteria to an item and refreshes metadata. | path itemId*, replaceAllImages; body: RemoteSearchResult* (application/json) | 204 (no body) |
| `POST /Items/RemoteSearch/Person` | `ItemLookupApi.getPersonRemoteSearchResults` | RequiresElevation | Get person remote search. | body: PersonLookupInfoRemoteSearchQuery* (application/json) | RemoteSearchResult[] |
| `POST /Items/{itemId}/Refresh` | `LibraryApi.refreshItem` | RequiresElevation | Refreshes metadata for an item. | path itemId*, metadataRefreshMode, imageRefreshMode, replaceAllMetadata, replaceAllImages, regenerateTrickplay | 204 (no body) |
| `POST /Items/{itemId}` | `ItemUpdateApi.updateItem` | RequiresElevation | Updates an item. | path itemId*; body: BaseItemDto* (application/json) | 204 (no body) |
| `POST /Items/{itemId}/ContentType` | `ItemUpdateApi.updateItemContentType` | RequiresElevation | Updates an item's content type. | path itemId*, contentType | 204 (no body) |
| `GET /Items/{itemId}/MetadataEditor` | `ItemUpdateApi.getMetadataEditorInfo` | RequiresElevation | Gets metadata editor info for an item. | path itemId* | MetadataEditorInfo |
| `POST /Audio/{itemId}/Lyrics` | `LyricApi.uploadLyrics` | LyricManagement | Upload an external lyric file. | path itemId*, fileName*; body: string (binary) (text/plain) | LyricDto |
| `DELETE /Audio/{itemId}/Lyrics` | `LyricApi.deleteLyrics` | LyricManagement | Deletes an external lyric file. | path itemId* | 204 (no body) |
| `GET /Audio/{itemId}/RemoteSearch/Lyrics` | `LyricApi.searchRemoteLyrics` | LyricManagement | Search remote lyrics. | path itemId* | RemoteLyricInfoDto[] |
| `POST /Audio/{itemId}/RemoteSearch/Lyrics/{lyricId}` | `LyricApi.downloadRemoteLyrics` | LyricManagement | Downloads a remote lyric. | path itemId*, path lyricId* | LyricDto |
| `GET /Providers/Lyrics/{lyricId}` | `LyricApi.getRemoteLyrics` | LyricManagement | Gets the remote lyrics. | path lyricId* | LyricDto |
| `POST /Items/{itemId}/RemoteImages/Download` | `RemoteImageApi.downloadRemoteImage` | RequiresElevation | Downloads a remote image for an item. | path itemId*, type*, imageUrl | 204 (no body) |
| `GET /Items/{itemId}/RemoteSearch/Subtitles/{language}` | `SubtitleApi.searchRemoteSubtitles` | SubtitleManagement | Search remote subtitles. | path itemId*, path language*, isPerfectMatch | RemoteSubtitleInfo[] |
| `POST /Items/{itemId}/RemoteSearch/Subtitles/{subtitleId}` | `SubtitleApi.downloadRemoteSubtitles` | SubtitleManagement | Downloads a remote subtitle. | path itemId*, path subtitleId* | 204 (no body) |
| `GET /Providers/Subtitles/Subtitles/{subtitleId}` | `SubtitleApi.getRemoteSubtitles` | SubtitleManagement | Gets the remote subtitles. | path subtitleId* | binary (text/*) |
| `POST /Videos/{itemId}/Subtitles` | `SubtitleApi.uploadSubtitle` | SubtitleManagement | Upload an external subtitle file. | path itemId*; body: UploadSubtitleDto* (application/json) | 204 (no body) |
| `DELETE /Videos/{itemId}/Subtitles/{index}` | `SubtitleApi.deleteSubtitle` | RequiresElevation | Deletes an external subtitle file. | path itemId*, path index* | 204 (no body) |
| `DELETE /Videos/{itemId}/AlternateSources` | `VideoApi.deleteAlternateSources` | RequiresElevation | Removes alternate video sources. | path itemId* | 204 (no body) |
| `POST /Videos/MergeVersions` | `VideoApi.mergeVersions` | RequiresElevation | Merges videos into a single record. | ids* | 204 (no body) |

## 17. Leftover: collections

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `POST /Collections` | `CollectionApi.createCollection` | CollectionManagement | Creates a new collection. | name, ids, parentId, isLocked | CollectionCreationResult |
| `POST /Collections/{collectionId}/Items` | `CollectionApi.addToCollection` | CollectionManagement | Adds items to a collection. | path collectionId*, ids* | 204 (no body) |
| `DELETE /Collections/{collectionId}/Items` | `CollectionApi.removeFromCollection` | CollectionManagement | Removes items from a collection. | path collectionId*, ids* | 204 (no body) |

## 18. Leftover: first-time setup wizard

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `POST /Startup/Complete` | `StartupApi.completeWizard` | FirstTimeSetupOrElevated | Completes the startup wizard. | - | 204 (no body) |
| `GET /Startup/Configuration` | `StartupApi.getStartupConfiguration` | FirstTimeSetupOrElevated | Gets the initial startup wizard configuration. | - | StartupConfigurationDto |
| `POST /Startup/Configuration` | `StartupApi.updateInitialConfiguration` | FirstTimeSetupOrElevated | Sets the initial startup wizard configuration. | body: StartupConfigurationDto* (application/json) | 204 (no body) |
| `GET /Startup/FirstUser` | `StartupApi.getFirstUser2` | FirstTimeSetupOrElevated | Gets the first user. | - | StartupUserDto |
| `POST /Startup/RemoteAccess` | `StartupApi.setRemoteAccess` | FirstTimeSetupOrElevated | Sets remote access and UPnP. | body: StartupRemoteAccessDto* (application/json) | 204 (no body) |
| `GET /Startup/User` | `StartupApi.getFirstUser` | FirstTimeSetupOrElevated | Gets the first user. | - | StartupUserDto |
| `POST /Startup/User` | `StartupApi.updateStartupUser` | FirstTimeSetupOrElevated | Sets the user name and password. | body: StartupUserDto (application/json) | 204 (no body) |

## 19. Leftover: other

(no elevated operations)

# B. Read by the dashboard but not elevated

Operations an admin UI needs that the spec marks as anonymous or DefaultAuthorization (or another non-elevation policy that is not a management permission).

## Branding

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `GET /Branding/Configuration` | `BrandingApi.getBrandingOptions` | (anonymous) | Gets branding configuration. | - | BrandingOptionsDto |
| `GET /Branding/Css` | `BrandingApi.getBrandingCss` | (anonymous) | Gets branding css. | - | string |
| `GET /Branding/Css.css` | `BrandingApi.getBrandingCss2` | (anonymous) | Gets branding css. | - | string |

## Configuration

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `GET /System/Configuration` | `SystemApi.getConfiguration` | DefaultAuthorization | Gets application configuration. | - | ServerConfiguration |
| `GET /System/Configuration/{key}` | `SystemApi.getNamedConfiguration` | DefaultAuthorization | Gets a named configuration. | path key* | binary (application/json) |

## Dashboard

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `GET /web/ConfigurationPage` | `PluginApi.getDashboardConfigurationPage` | (anonymous) | Gets a dashboard configuration page. | name | binary (text/html) |

## DisplayPreferences

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `GET /DisplayPreferences/{displayPreferencesId}` | `DisplayPreferenceApi.getDisplayPreferences` | DefaultAuthorization | Get Display Preferences. | path displayPreferencesId*, userId, client* | DisplayPreferencesDto |
| `POST /DisplayPreferences/{displayPreferencesId}` | `DisplayPreferenceApi.updateDisplayPreferences` | DefaultAuthorization | Update Display Preferences. | path displayPreferencesId*, userId, client*; body: DisplayPreferencesDto* (application/json) | 204 (no body) |

## Items

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `GET /Items` | `LibraryApi.getItems` | DefaultAuthorization | Gets items based on a query. | userId, maxOfficialRating, hasThemeSong, hasThemeVideo, hasSubtitles, hasSpecialFeature, hasTrailer, adjacentTo, indexNumber, parentIndexNumber, hasParentalRating, isHd, is4K, locationTypes, excludeLocationTypes, isMissing, isUnaired, minCommunityRating, minCriticRating, minPremiereDate, minDateLastSaved, minDateLastSavedForUser, maxPremiereDate, hasOverview, hasImdbId, hasTmdbId, hasTvdbId, isMovie, isSeries, isNews, isKids, isSports, excludeItemIds, startIndex, limit, recursive, searchTerm, sortOrder, parentId, fields, excludeItemTypes, includeItemTypes, filters, isFavorite, mediaTypes, imageTypes, sortBy, isPlayed, genres, officialRatings, tags, years, enableUserData, imageTypeLimit, enableImageTypes, person, personIds, personTypes, studios, artists, excludeArtistIds, artistIds, albumArtistIds, contributingArtistIds, albums, albumIds, ids, videoTypes, minOfficialRating, isLocked, isPlaceHolder, hasOfficialRating, collapseBoxSetItems, minWidth, minHeight, maxWidth, maxHeight, is3D, seriesStatus, nameStartsWithOrGreater, nameStartsWith, nameLessThan, studioIds, genreIds, enableTotalRecordCount, enableImages | BaseItemDtoQueryResult |
| `GET /UserItems/{itemId}/UserData` | `UserDataApi.getItemUserData` | DefaultAuthorization | Get Item User Data. | userId, path itemId* | UserItemDataDto |
| `POST /UserItems/{itemId}/UserData` | `UserDataApi.updateItemUserData` | DefaultAuthorization | Update Item User Data. | userId, path itemId*; body: UpdateUserItemDataDto* (application/json) | UserItemDataDto |
| `GET /UserItems/Resume` | `LibraryApi.getResumeItems` | DefaultAuthorization | Gets items based on a query. | userId, startIndex, limit, searchTerm, parentId, fields, mediaTypes, enableUserData, imageTypeLimit, enableImageTypes, excludeItemTypes, includeItemTypes, enableTotalRecordCount, enableImages, excludeActiveSessions | BaseItemDtoQueryResult |

## Library

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `DELETE /Items` | `LibraryApi.deleteItems` | DefaultAuthorization | Deletes items from the library and filesystem. | ids | 204 (no body) |
| `DELETE /Items/{itemId}` | `LibraryApi.deleteItem` | DefaultAuthorization | Deletes an item from the library and filesystem. | path itemId* | 204 (no body) |
| `GET /Items/{itemId}/Ancestors` | `LibraryApi.getAncestors` | DefaultAuthorization | Gets all parents of an item. | path itemId*, userId | BaseItemDto[] |
| `GET /Items/Counts` | `LibraryApi.getItemCounts` | DefaultAuthorization | Get item counts. | userId, isFavorite | ItemCounts |
| `GET /Libraries/AvailableOptions` | `LibraryApi.getLibraryOptionsInfo` | FirstTimeSetupOrDefault | Gets the library options info. | libraryContentType, isNewLibrary | LibraryOptionsResultDto |

## LiveTv

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `GET /LiveTv/Channels` | `LiveTvApi.getLiveTvChannels` | LiveTvAccess | Gets available live tv channels. | type, userId, startIndex, isMovie, isSeries, isNews, isKids, isSports, limit, isFavorite, isLiked, isDisliked, enableImages, imageTypeLimit, enableImageTypes, fields, enableUserData, sortBy, sortOrder, enableFavoriteSorting, addCurrentProgram | BaseItemDtoQueryResult |
| `GET /LiveTv/Channels/{channelId}` | `LiveTvApi.getChannel` | LiveTvAccess | Gets a live tv channel. | path channelId*, userId | BaseItemDto |
| `GET /LiveTv/GuideInfo` | `LiveTvApi.getGuideInfo` | LiveTvAccess | Get guide info. | - | GuideInfo |
| `GET /LiveTv/Info` | `LiveTvApi.getLiveTvInfo` | LiveTvAccess | Gets available live tv services. | - | LiveTvInfo |
| `GET /LiveTv/ListingProviders/Default` | `LiveTvApi.getDefaultListingProvider` | LiveTvAccess | Gets default listings provider info. | - | ListingsProviderInfo |
| `GET /LiveTv/ListingProviders/Lineups` | `LiveTvApi.getLineups` | LiveTvAccess | Gets available lineups. | id, type, location, country | NameIdPair[] |
| `GET /LiveTv/Programs` | `LiveTvApi.getLiveTvPrograms` | LiveTvAccess | Gets available live tv epgs. | channelIds, userId, minStartDate, hasAired, isAiring, maxStartDate, minEndDate, maxEndDate, isMovie, isSeries, isNews, isKids, isSports, startIndex, limit, sortBy, sortOrder, genres, genreIds, enableImages, imageTypeLimit, enableImageTypes, enableUserData, seriesTimerId, librarySeriesId, fields, enableTotalRecordCount | BaseItemDtoQueryResult |
| `POST /LiveTv/Programs` | `LiveTvApi.getPrograms` | LiveTvAccess | Gets available live tv epgs. | body: GetProgramsDto (application/json) | BaseItemDtoQueryResult |
| `GET /LiveTv/Programs/{programId}` | `LiveTvApi.getProgram` | LiveTvAccess | Gets a live tv program. | path programId*, userId | BaseItemDto |
| `GET /LiveTv/Programs/Recommended` | `LiveTvApi.getRecommendedPrograms` | LiveTvAccess | Gets recommended live tv epgs. | userId, startIndex, limit, isAiring, hasAired, isSeries, isMovie, isNews, isKids, isSports, enableImages, imageTypeLimit, enableImageTypes, genreIds, fields, enableUserData, enableTotalRecordCount | BaseItemDtoQueryResult |
| `GET /LiveTv/Recordings` | `LiveTvApi.getRecordings` | LiveTvAccess | Gets live tv recordings. | channelId, userId, startIndex, limit, status, isInProgress, seriesTimerId, enableImages, imageTypeLimit, enableImageTypes, fields, enableUserData, isMovie, isSeries, isKids, isSports, isNews, isLibraryItem, enableTotalRecordCount | BaseItemDtoQueryResult |
| `GET /LiveTv/Recordings/{recordingId}` | `LiveTvApi.getRecording` | LiveTvAccess | Gets a live tv recording. | path recordingId*, userId | BaseItemDto |
| `GET /LiveTv/Recordings/Folders` | `LiveTvApi.getRecordingFolders` | LiveTvAccess | Gets recording folders. | userId | BaseItemDtoQueryResult |
| `GET /LiveTv/Recordings/Groups` | **(none)** | LiveTvAccess | Gets live tv recording groups. | userId | BaseItemDtoQueryResult |
| `GET /LiveTv/Recordings/Groups/{groupId}` | **(none)** | LiveTvAccess | Get recording group. | path groupId* | - |
| `GET /LiveTv/Recordings/Series` | **(none)** | LiveTvAccess | Gets live tv recording series. | channelId, userId, groupId, startIndex, limit, status, isInProgress, seriesTimerId, enableImages, imageTypeLimit, enableImageTypes, fields, enableUserData, enableTotalRecordCount | BaseItemDtoQueryResult |
| `GET /LiveTv/SeriesTimers` | `LiveTvApi.getSeriesTimers` | LiveTvAccess | Gets live tv series timers. | sortBy, sortOrder | SeriesTimerInfoDtoQueryResult |
| `GET /LiveTv/SeriesTimers/{timerId}` | `LiveTvApi.getSeriesTimer` | LiveTvAccess | Gets a live tv series timer. | path timerId* | SeriesTimerInfoDto |
| `GET /LiveTv/Timers` | `LiveTvApi.getTimers` | LiveTvAccess | Gets the live tv timers. | channelId, seriesTimerId, isActive, isScheduled | TimerInfoDtoQueryResult |
| `GET /LiveTv/Timers/{timerId}` | `LiveTvApi.getTimer` | LiveTvAccess | Gets a timer. | path timerId* | TimerInfoDto |
| `GET /LiveTv/Timers/Defaults` | `LiveTvApi.getDefaultTimer` | LiveTvAccess | Gets the default values for a new timer. | programId | SeriesTimerInfoDto |
| `GET /LiveTv/TunerHosts/Types` | `LiveTvApi.getTunerHostTypes` | LiveTvAccess | Get tuner host types. | - | NameIdPair[] |

## Localization

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `GET /Localization/Countries` | `LocalizationApi.getCountries` | FirstTimeSetupOrDefault | Gets known countries. | - | CountryInfo[] |
| `GET /Localization/Cultures` | `LocalizationApi.getCultures` | FirstTimeSetupOrDefault | Gets known cultures. | - | CultureDto[] |
| `GET /Localization/Options` | `LocalizationApi.getLocalizationOptions` | FirstTimeSetupOrDefault | Gets localization options. | - | LocalizationOption[] |
| `GET /Localization/ParentalRatings` | `LocalizationApi.getParentalRatings` | FirstTimeSetupOrDefault | Gets known parental ratings. | - | ParentalRating[] |

## MediaSegments

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `GET /MediaSegments/{itemId}` | `MediaSegmentApi.getItemSegments` | DefaultAuthorization | Gets all media segments based on an itemId. | path itemId*, includeSegmentTypes | MediaSegmentDtoQueryResult |

## QuickConnect

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `POST /QuickConnect/Authorize` | `AuthenticationApi.authorizeQuickConnect` | DefaultAuthorization | Authorizes a pending quick connect request. | code*, userId | boolean |
| `GET /QuickConnect/Connect` | `AuthenticationApi.getQuickConnectState` | (anonymous) | Attempts to retrieve authentication information. | secret* | QuickConnectResult |
| `GET /QuickConnect/Enabled` | `AuthenticationApi.getQuickConnectEnabled` | (anonymous) | Gets the current quick connect state. | - | boolean |
| `POST /QuickConnect/Initiate` | `AuthenticationApi.initiateQuickConnect` | (anonymous) | Initiate a new quick connect request. | - | QuickConnectResult |

## Session

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `GET /Sessions` | `SessionApi.getSessions` | DefaultAuthorization | Gets a list of sessions. | controllableByUserId, deviceId, activeWithinSeconds | SessionInfoDto[] |
| `POST /Sessions/{sessionId}/Command` | `SessionApi.sendFullGeneralCommand` | DefaultAuthorization | Issues a full general command to a client. | path sessionId*; body: GeneralCommand* (application/json) | 204 (no body) |
| `POST /Sessions/{sessionId}/Command/{command}` | `SessionApi.sendGeneralCommand` | DefaultAuthorization | Issues a general command to a client. | path sessionId*, path command* | 204 (no body) |
| `POST /Sessions/{sessionId}/Message` | `SessionApi.sendMessageCommand` | DefaultAuthorization | Issues a command to a client to display a message to the user. | path sessionId*; body: MessageCommand* (application/json) | 204 (no body) |
| `POST /Sessions/{sessionId}/Playing` | `SessionApi.play` | DefaultAuthorization | Instructs a session to play an item. | path sessionId*, playCommand*, itemIds*, startPositionTicks, mediaSourceId, audioStreamIndex, subtitleStreamIndex, startIndex | 204 (no body) |
| `POST /Sessions/{sessionId}/Playing/{command}` | `SessionApi.sendPlaystateCommand` | DefaultAuthorization | Issues a playstate command to a client. | path sessionId*, path command*, seekPositionTicks, controllingUserId | 204 (no body) |
| `POST /Sessions/{sessionId}/System/{command}` | `SessionApi.sendSystemCommand` | DefaultAuthorization | Issues a system command to a client. | path sessionId*, path command* | 204 (no body) |
| `POST /Sessions/{sessionId}/User/{userId}` | `SessionApi.addUserToSession` | DefaultAuthorization | Adds an additional user to a session. | path sessionId*, path userId* | 204 (no body) |
| `DELETE /Sessions/{sessionId}/User/{userId}` | `SessionApi.removeUserFromSession` | DefaultAuthorization | Removes an additional user from a session. | path sessionId*, path userId* | 204 (no body) |
| `POST /Sessions/{sessionId}/Viewing` | `SessionApi.displayContent` | DefaultAuthorization | Instructs a session to browse to an item or view. | path sessionId*, itemType*, itemId*, itemName* | 204 (no body) |
| `POST /Sessions/Capabilities` | `SessionApi.postCapabilities` | DefaultAuthorization | Updates capabilities for a device. | id, playableMediaTypes, supportedCommands, supportsMediaControl, supportsPersistentIdentifier | 204 (no body) |
| `POST /Sessions/Capabilities/Full` | `SessionApi.postFullCapabilities` | DefaultAuthorization | Updates capabilities for a device. | id; body: ClientCapabilitiesDto* (application/json) | 204 (no body) |
| `POST /Sessions/Logout` | `SessionApi.reportSessionEnded` | DefaultAuthorization | Reports that a session has ended. | - | 204 (no body) |
| `POST /Sessions/Viewing` | `SessionApi.reportViewing` | DefaultAuthorization | Reports that a session is viewing an item. | sessionId, itemId* | 204 (no body) |

## Subtitle

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `GET /FallbackFont/Fonts` | `SubtitleApi.getFallbackFontList` | DefaultAuthorization | Gets a list of available fallback font files. | - | FontFile[] |
| `GET /FallbackFont/Fonts/{name}` | `SubtitleApi.getFallbackFont` | DefaultAuthorization | Gets a fallback font file. | path name* | binary (font/*) |

## System

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `GET /System/Endpoint` | `SystemApi.getEndpointInfo` | DefaultAuthorization | Gets information about the request endpoint. | - | EndPointInfo |
| `GET /System/Info` | `SystemApi.getSystemInfo` | FirstTimeSetupOrIgnoreParentalControl | Gets information about the server. | - | SystemInfo |
| `GET /System/Info/Public` | `SystemApi.getPublicSystemInfo` | (anonymous) | Gets public information about the server. | - | PublicSystemInfo |
| `GET /System/Ping` | `SystemApi.getPingSystem` | (anonymous) | Pings the system. | - | string |
| `POST /System/Ping` | `SystemApi.postPingSystem` | (anonymous) | Pings the system. | - | string |

## Tmdb

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `GET /Tmdb/ClientConfiguration` | **(none)** | DefaultAuthorization | Gets the TMDb image configuration options. | - | ConfigImageTypes |

## User

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `GET /Users` | `UserApi.getUsers` | DefaultAuthorization | Gets a list of users. | isHidden, isDisabled | UserDto[] |
| `POST /Users` | `UserApi.updateUser` | DefaultAuthorization | Updates a user. | userId; body: UserDto* (application/json) | 204 (no body) |
| `GET /Users/{userId}` | `UserApi.getUserById` | IgnoreParentalControl | Gets a user by Id. | path userId* | UserDto |
| `POST /Users/AuthenticateByName` | `AuthenticationApi.authenticateUserByName` | (anonymous) | Authenticates a user by name. | body: AuthenticateUserByName* (application/json) | AuthenticationResult |
| `POST /Users/AuthenticateWithQuickConnect` | `AuthenticationApi.authenticateWithQuickConnect` | (anonymous) | Authenticates a user with quick connect. | body: QuickConnectDto* (application/json) | AuthenticationResult |
| `POST /Users/Configuration` | `UserApi.updateUserConfiguration` | DefaultAuthorization | Updates a user configuration. | userId; body: UserConfiguration* (application/json) | 204 (no body) |
| `POST /Users/ForgotPassword` | `AuthenticationApi.forgotPassword` | (anonymous) | Initiates the forgot password process for a local user. | body: ForgotPasswordDto* (application/json) | ForgotPasswordResult |
| `POST /Users/ForgotPassword/Pin` | `AuthenticationApi.forgotPasswordPin` | (anonymous) | Redeems a forgot password pin. | body: ForgotPasswordPinDto* (application/json) | PinRedeemResult |
| `GET /Users/Me` | `UserApi.getCurrentUser` | DefaultAuthorization | Gets the user based on auth token. | - | UserDto |
| `POST /Users/Password` | `UserApi.updateUserPassword` | DefaultAuthorization | Updates a user's password. | userId; body: UpdateUserPassword* (application/json) | 204 (no body) |
| `GET /Users/Public` | `UserApi.getPublicUsers` | (anonymous) | Gets a list of publicly visible users for display on a login screen. | - | UserDto[] |

## UserLibrary

| HTTP | SDK class.method | Policy | Purpose | Request (path/query params; * = required; body model) | Response |
|---|---|---|---|---|---|
| `GET /Items/{itemId}` | `LibraryApi.getItem` | DefaultAuthorization | Gets an item from a user's library. | userId, path itemId* | BaseItemDto |
| `GET /Items/Root` | `LibraryApi.getRootFolder` | DefaultAuthorization | Gets the root folder from a user's library. | userId | BaseItemDto |

# C. Configuration and DTO models

Every field as in the spec. Models are expanded transitively from the configuration roots plus every request/response model of the operations in sections A and B; large item/media models (`BaseItemDto`, `MediaSourceInfo`, `MediaStream`, `UserItemDataDto`, `BaseItemPerson`, `DeviceProfile`, ...) are intentionally not expanded. "Req" = in the schema's `required` list. Enum values are listed in the notes column and again in the enum glossary at the end.

## Named configuration sections

`GET/POST /System/Configuration/{key}` takes a free-form key and the spec types the body as `object` / `any` (response: binary (application/json)). The spec lists no key names; the names below are **confirmed from the server source** (each `IConfigurationFactory` returns a `ConfigurationStore` whose `Key` and `ConfigurationType` are set in its constructor; `ConfigurationController.cs` resolves a POST with `GetConfigurationType(key)` and deserializes the body into that type; GET returns `GetConfiguration(key)` with no type lookup):

| Key | Model | Source file (release-10.11.z) |
|---|---|---|
| encoding | EncodingOptions | `MediaBrowser.MediaEncoding/Configuration/EncodingConfigurationStore.cs` |
| network | NetworkConfiguration | `MediaBrowser.Common/Net/NetworkConfigurationStore.cs` (StoreKey = "network") |
| livetv | LiveTvOptions | `src/Jellyfin.LiveTv/Configuration/LiveTvConfigurationFactory.cs` |
| metadata | MetadataConfiguration | `MediaBrowser.Controller/Library/MetadataConfigurationStore.cs` |
| xbmcmetadata | XbmcMetadataOptions | `MediaBrowser.XbmcMetadata/Configuration/NfoConfigurationFactory.cs` |
| branding | BrandingOptions (server type; the API DTO is BrandingOptionsDto) | `Emby.Server.Implementations/Branding/BrandingConfigurationFactory.cs` |
| subtitles | SubtitleOptions (not in this inventory's earlier guess) | `MediaBrowser.Common/Providers/SubtitleConfigurationFactory.cs` |
| database | DatabaseConfigurationOptions (spec has no schema for it; avoid exposing) | `Jellyfin.Server.Implementations/DbConfiguration/DatabaseConfigurationStore.cs` |
| (no key: `/System/Configuration`) | ServerConfiguration | `Jellyfin.Api/Controllers/ConfigurationController.cs` |

Not checked: whether further keys exist in the unread part of the repository tree (plugins can register their own). `POST /System/Configuration/Branding` is a separate action that hard-codes key "branding" and copies only `LoginDisclaimer`, `CustomCss`, `SplashscreenEnabled` (it preserves `SplashscreenLocation`). `TrickplayOptions` lives inside ServerConfiguration, not as its own key.

### ServerConfiguration

Represents the server configuration.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| LogFileRetentionDays | integer (int32) |  |  | Gets or sets the number of days we should retain log files. |
| IsStartupWizardCompleted | boolean |  |  | Gets or sets a value indicating whether this instance is first run. |
| CachePath | string (nullable) |  |  | Gets or sets the cache path. |
| PreviousVersion | string (nullable) |  |  | Gets or sets the last known version that was ran using the configuration. |
| PreviousVersionStr | string (nullable) |  |  | Gets or sets the stringified PreviousVersion to be stored/loaded, because System.Version itself isn't xml-serializable. |
| EnableMetrics | boolean |  |  | Gets or sets a value indicating whether to enable prometheus metrics exporting. |
| EnableNormalizedItemByNameIds | boolean |  |  |  |
| IsPortAuthorized | boolean |  |  | Gets or sets a value indicating whether this instance is port authorized. |
| QuickConnectAvailable | boolean |  |  | Gets or sets a value indicating whether quick connect is available for use on this server. |
| EnableCaseSensitiveItemIds | boolean |  |  | Gets or sets a value indicating whether [enable case-sensitive item ids]. |
| DisableLiveTvChannelUserDataName | boolean |  |  |  |
| MetadataPath | string |  |  | Gets or sets the metadata path. |
| PreferredMetadataLanguage | string |  |  | Gets or sets the preferred metadata language. |
| MetadataCountryCode | string |  |  | Gets or sets the metadata country code. |
| SortReplaceCharacters | string[] |  |  | Gets or sets characters to be replaced with a ' ' in strings to create a sort name. |
| SortRemoveCharacters | string[] |  |  | Gets or sets characters to be removed from strings to create a sort name. |
| SortRemoveWords | string[] |  |  | Gets or sets words to be removed from strings to create a sort name. |
| MinResumePct | integer (int32) |  |  | Gets or sets the minimum percentage of an item that must be played in order for playstate to be updated. |
| MaxResumePct | integer (int32) |  |  | Gets or sets the maximum percentage of an item that can be played while still saving playstate. If this percentage is crossed playstate will be reset to the beginning and the item will be marked watched. |
| MinResumeDurationSeconds | integer (int32) |  |  | Gets or sets the minimum duration that an item must have in order to be eligible for playstate updates.. |
| MinAudiobookResume | integer (int32) |  |  | Gets or sets the minimum minutes of a book that must be played in order for playstate to be updated. |
| MaxAudiobookResume | integer (int32) |  |  | Gets or sets the remaining minutes of a book that can be played while still saving playstate. If this percentage is crossed playstate will be reset to the beginning and the item will be marked watched. |
| InactiveSessionThreshold | integer (int32) |  |  | Gets or sets the threshold in minutes after a inactive session gets closed automatically. If set to 0 the check for inactive sessions gets disabled. |
| LibraryMonitorDelay | integer (int32) |  |  | Gets or sets the delay in seconds that we will wait after a file system change to try and discover what has been added/removed Some delay is necessary with some items because their creation is not atomic.  It involves the creation of several different directories and files. |
| LibraryUpdateDuration | integer (int32) |  |  | Gets or sets the duration in seconds that we will wait after a library updated event before executing the library changed notification. |
| CacheSize | integer (int32) |  |  | Gets or sets the maximum amount of items to cache. |
| ImageSavingConvention | ImageSavingConvention |  | enum: Legacy / Compatible | Gets or sets the image saving convention. |
| MetadataOptions | MetadataOptions[] |  |  |  |
| SkipDeserializationForBasicTypes | boolean |  |  |  |
| ServerName | string |  |  |  |
| UICulture | string |  |  |  |
| SaveMetadataHidden | boolean |  |  |  |
| ContentTypes | NameValuePair[] |  |  |  |
| RemoteClientBitrateLimit | integer (int32) |  |  |  |
| EnableFolderView | boolean |  |  |  |
| EnableGroupingMoviesIntoCollections | boolean |  |  |  |
| EnableGroupingShowsIntoCollections | boolean |  |  |  |
| DisplaySpecialsWithinSeasons | boolean |  |  |  |
| CodecsUsed | string[] |  |  |  |
| PluginRepositories | RepositoryInfo[] |  |  |  |
| EnableExternalContentInSuggestions | boolean |  |  |  |
| ImageExtractionTimeoutMs | integer (int32) |  |  |  |
| PathSubstitutions | PathSubstitution[] |  |  |  |
| EnableSlowResponseWarning | boolean |  |  | Gets or sets a value indicating whether slow server responses should be logged as a warning. |
| SlowResponseThresholdMs | integer (int64) |  |  | Gets or sets the threshold for the slow response time warning in ms. |
| CorsHosts | string[] |  |  | Gets or sets the cors hosts. |
| ActivityLogRetentionDays | integer (int32) (nullable) |  |  | Gets or sets the number of days we should retain activity logs. |
| LibraryScanFanoutConcurrency | integer (int32) |  |  | Gets or sets the how the library scan fans out. |
| LibraryMetadataRefreshConcurrency | integer (int32) |  |  | Gets or sets the how many metadata refreshes can run concurrently. |
| AllowClientLogUpload | boolean |  |  | Gets or sets a value indicating whether clients should be allowed to upload logs. |
| DummyChapterDuration | integer (int32) |  |  | Gets or sets the dummy chapter duration in seconds, use 0 (zero) or less to disable generation altogether. |
| ChapterImageResolution | ImageResolution |  | enum: MatchSource / P144 / P240 / P360 / P480 / P720 / P1080 / P1440 / P2160 | Gets or sets the chapter image resolution. |
| ParallelImageEncodingLimit | integer (int32) |  |  | Gets or sets the limit for parallel image encoding. |
| CastReceiverApplications | CastReceiverApplication[] |  |  | Gets or sets the list of cast receiver applications. |
| TrickplayOptions | TrickplayOptions |  |  | Gets or sets the trickplay options. |
| EnableLegacyAuthorization | boolean |  |  | Gets or sets a value indicating whether old authorization methods are allowed. |

### EncodingOptions

Class EncodingOptions.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| EncodingThreadCount | integer (int32) |  |  | Gets or sets the thread count used for encoding. |
| TranscodingTempPath | string (nullable) |  |  | Gets or sets the temporary transcoding path. |
| FallbackFontPath | string (nullable) |  |  | Gets or sets the path to the fallback font. |
| EnableFallbackFont | boolean |  |  | Gets or sets a value indicating whether to use the fallback font. |
| EnableAudioVbr | boolean |  |  | Gets or sets a value indicating whether audio VBR is enabled. |
| DownMixAudioBoost | number (double) |  |  | Gets or sets the audio boost applied when downmixing audio. |
| DownMixStereoAlgorithm | DownMixStereoAlgorithms |  | enum: None / Dave750 / NightmodeDialogue / Rfc7845 / Ac4 | Gets or sets the algorithm used for downmixing audio to stereo. |
| MaxMuxingQueueSize | integer (int32) |  |  | Gets or sets the maximum size of the muxing queue. |
| EnableThrottling | boolean |  |  | Gets or sets a value indicating whether throttling is enabled. |
| ThrottleDelaySeconds | integer (int32) |  |  | Gets or sets the delay after which throttling happens. |
| EnableSegmentDeletion | boolean |  |  | Gets or sets a value indicating whether segment deletion is enabled. |
| SegmentKeepSeconds | integer (int32) |  |  | Gets or sets seconds for which segments should be kept before being deleted. |
| HardwareAccelerationType | HardwareAccelerationType |  | enum: none / amf / qsv / nvenc / v4l2m2m / vaapi / videotoolbox / rkmpp | Gets or sets the hardware acceleration type. |
| EncoderAppPath | string (nullable) |  |  | Gets or sets the FFmpeg path as set by the user via the UI. |
| EncoderAppPathDisplay | string (nullable) |  |  | Gets or sets the current FFmpeg path being used by the system and displayed on the transcode page. |
| VaapiDevice | string (nullable) |  |  | Gets or sets the VA-API device. |
| QsvDevice | string (nullable) |  |  | Gets or sets the QSV device. |
| EnableTonemapping | boolean |  |  | Gets or sets a value indicating whether tonemapping is enabled. |
| EnableVppTonemapping | boolean |  |  | Gets or sets a value indicating whether VPP tonemapping is enabled. |
| EnableVideoToolboxTonemapping | boolean |  |  | Gets or sets a value indicating whether videotoolbox tonemapping is enabled. |
| TonemappingAlgorithm | TonemappingAlgorithm |  | enum: none / clip / linear / gamma / reinhard / hable / mobius / bt2390 | Gets or sets the tone-mapping algorithm. |
| TonemappingMode | TonemappingMode |  | enum: auto / max / rgb / lum / itp | Gets or sets the tone-mapping mode. |
| TonemappingRange | TonemappingRange |  | enum: auto / tv / pc | Gets or sets the tone-mapping range. |
| TonemappingDesat | number (double) |  |  | Gets or sets the tone-mapping desaturation. |
| TonemappingPeak | number (double) |  |  | Gets or sets the tone-mapping peak. |
| TonemappingParam | number (double) |  |  | Gets or sets the tone-mapping parameters. |
| VppTonemappingBrightness | number (double) |  |  | Gets or sets the VPP tone-mapping brightness. |
| VppTonemappingContrast | number (double) |  |  | Gets or sets the VPP tone-mapping contrast. |
| H264Crf | integer (int32) |  |  | Gets or sets the H264 CRF. |
| H265Crf | integer (int32) |  |  | Gets or sets the H265 CRF. |
| EncoderPreset | EncoderPreset (nullable) |  | enum: auto / placebo / veryslow / slower / slow / medium / fast / faster / veryfast / superfast / ultrafast | Gets or sets the encoder preset. |
| DeinterlaceDoubleRate | boolean |  |  | Gets or sets a value indicating whether the framerate is doubled when deinterlacing. |
| DeinterlaceMethod | DeinterlaceMethod |  | enum: yadif / bwdif | Gets or sets the deinterlace method. |
| EnableDecodingColorDepth10Hevc | boolean |  |  | Gets or sets a value indicating whether 10bit HEVC decoding is enabled. |
| EnableDecodingColorDepth10Vp9 | boolean |  |  | Gets or sets a value indicating whether 10bit VP9 decoding is enabled. |
| EnableDecodingColorDepth10HevcRext | boolean |  |  | Gets or sets a value indicating whether 8/10bit HEVC RExt decoding is enabled. |
| EnableDecodingColorDepth12HevcRext | boolean |  |  | Gets or sets a value indicating whether 12bit HEVC RExt decoding is enabled. |
| EnableEnhancedNvdecDecoder | boolean |  |  | Gets or sets a value indicating whether the enhanced NVDEC is enabled. |
| PreferSystemNativeHwDecoder | boolean |  |  | Gets or sets a value indicating whether the system native hardware decoder should be used. |
| EnableIntelLowPowerH264HwEncoder | boolean |  |  | Gets or sets a value indicating whether the Intel H264 low-power hardware encoder should be used. |
| EnableIntelLowPowerHevcHwEncoder | boolean |  |  | Gets or sets a value indicating whether the Intel HEVC low-power hardware encoder should be used. |
| EnableHardwareEncoding | boolean |  |  | Gets or sets a value indicating whether hardware encoding is enabled. |
| AllowHevcEncoding | boolean |  |  | Gets or sets a value indicating whether HEVC encoding is enabled. |
| AllowAv1Encoding | boolean |  |  | Gets or sets a value indicating whether AV1 encoding is enabled. |
| EnableSubtitleExtraction | boolean |  |  | Gets or sets a value indicating whether subtitle extraction is enabled. |
| HardwareDecodingCodecs | string[] (nullable) |  |  | Gets or sets the codecs hardware encoding is used for. |
| AllowOnDemandMetadataBasedKeyframeExtractionForExtensions | string[] (nullable) |  |  | Gets or sets the file extensions on-demand metadata based keyframe extraction is enabled for. |

### NetworkConfiguration

Defines the MediaBrowser.Common.Net.NetworkConfiguration.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| BaseUrl | string |  |  | Gets or sets a value used to specify the URL prefix that your Jellyfin instance can be accessed at. |
| EnableHttps | boolean |  |  | Gets or sets a value indicating whether to use HTTPS. |
| RequireHttps | boolean |  |  | Gets or sets a value indicating whether the server should force connections over HTTPS. |
| CertificatePath | string |  |  | Gets or sets the filesystem path of an X.509 certificate to use for SSL. |
| CertificatePassword | string |  |  | Gets or sets the password required to access the X.509 certificate data in the file specified by MediaBrowser.Common.Net.NetworkConfiguration.CertificatePath. |
| InternalHttpPort | integer (int32) |  |  | Gets or sets the internal HTTP server port. |
| InternalHttpsPort | integer (int32) |  |  | Gets or sets the internal HTTPS server port. |
| PublicHttpPort | integer (int32) |  |  | Gets or sets the public HTTP port. |
| PublicHttpsPort | integer (int32) |  |  | Gets or sets the public HTTPS port. |
| AutoDiscovery | boolean |  |  | Gets or sets a value indicating whether Autodiscovery is enabled. |
| EnableUPnP | boolean |  |  | Gets or sets a value indicating whether to enable automatic port forwarding. |
| EnableIPv4 | boolean |  |  | Gets or sets a value indicating whether IPv6 is enabled. |
| EnableIPv6 | boolean |  |  | Gets or sets a value indicating whether IPv6 is enabled. |
| EnableRemoteAccess | boolean |  |  | Gets or sets a value indicating whether access from outside of the LAN is permitted. |
| LocalNetworkSubnets | string[] |  |  | Gets or sets the subnets that are deemed to make up the LAN. |
| LocalNetworkAddresses | string[] |  |  | Gets or sets the interface addresses which Jellyfin will bind to. If empty, all interfaces will be used. |
| KnownProxies | string[] |  |  | Gets or sets the known proxies. |
| IgnoreVirtualInterfaces | boolean |  |  | Gets or sets a value indicating whether address names that match MediaBrowser.Common.Net.NetworkConfiguration.VirtualInterfaceNames should be ignored for the purposes of binding. |
| VirtualInterfaceNames | string[] |  |  | Gets or sets a value indicating the interface name prefixes that should be ignored. The list can be comma separated and values are case-insensitive. <seealso cref="P:MediaBrowser.Common.Net.NetworkConfiguration.IgnoreVirtualInterfaces" />. |
| EnablePublishedServerUriByRequest | boolean |  |  | Gets or sets a value indicating whether the published server uri is based on information in HTTP requests. |
| PublishedServerUriBySubnet | string[] |  |  | Gets or sets the PublishedServerUriBySubnet Gets or sets PublishedServerUri to advertise for specific subnets. |
| RemoteIPFilter | string[] |  |  | Gets or sets the filter for remote IP connectivity. Used in conjunction with <seealso cref="P:MediaBrowser.Common.Net.NetworkConfiguration.IsRemoteIPFilterBlacklist" />. |
| IsRemoteIPFilterBlacklist | boolean |  |  | Gets or sets a value indicating whether <seealso cref="P:MediaBrowser.Common.Net.NetworkConfiguration.RemoteIPFilter" /> contains a blacklist or a whitelist. Default is a whitelist. |

### LiveTvOptions

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| GuideDays | integer (int32) (nullable) |  |  |  |
| RecordingPath | string (nullable) |  |  |  |
| MovieRecordingPath | string (nullable) |  |  |  |
| SeriesRecordingPath | string (nullable) |  |  |  |
| EnableRecordingSubfolders | boolean |  |  |  |
| EnableOriginalAudioWithEncodedRecordings | boolean |  |  |  |
| TunerHosts | TunerHostInfo[] (nullable) |  |  |  |
| ListingProviders | ListingsProviderInfo[] (nullable) |  |  |  |
| PrePaddingSeconds | integer (int32) |  |  |  |
| PostPaddingSeconds | integer (int32) |  |  |  |
| MediaLocationsCreated | string[] (nullable) |  |  |  |
| RecordingPostProcessor | string (nullable) |  |  |  |
| RecordingPostProcessorArguments | string (nullable) |  |  |  |
| SaveRecordingNFO | boolean |  |  |  |
| SaveRecordingImages | boolean |  |  |  |

### MetadataConfiguration

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| UseFileCreationTimeForDateAdded | boolean |  |  |  |

### XbmcMetadataOptions

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| UserId | string (nullable) |  |  |  |
| ReleaseDateFormat | string |  |  |  |
| SaveImagePathsInNfo | boolean |  |  |  |
| EnablePathSubstitution | boolean |  |  |  |
| EnableExtraThumbsDuplication | boolean |  |  |  |

### BrandingOptionsDto

The branding options DTO for API use. This DTO excludes SplashscreenLocation to prevent it from being updated via API.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| LoginDisclaimer | string (nullable) |  |  | Gets or sets the login disclaimer. |
| CustomCss | string (nullable) |  |  | Gets or sets the custom CSS. |
| SplashscreenEnabled | boolean |  |  | Gets or sets a value indicating whether to enable the splashscreen. |

### TrickplayOptions

Class TrickplayOptions.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| EnableHwAcceleration | boolean |  |  | Gets or sets a value indicating whether or not to use HW acceleration. |
| EnableHwEncoding | boolean |  |  | Gets or sets a value indicating whether or not to use HW accelerated MJPEG encoding. |
| EnableKeyFrameOnlyExtraction | boolean |  |  | Gets or sets a value indicating whether to only extract key frames. Significantly faster, but is not compatible with all decoders and/or video files. |
| ScanBehavior | TrickplayScanBehavior |  | enum: Blocking / NonBlocking | Gets or sets the behavior used by trickplay provider on library scan/update. |
| ProcessPriority | ProcessPriorityClass |  | enum: Normal / Idle / High / RealTime / BelowNormal / AboveNormal | Gets or sets the process priority for the ffmpeg process. |
| Interval | integer (int32) |  |  | Gets or sets the interval, in ms, between each new trickplay image. |
| WidthResolutions | integer (int32)[] |  |  | Gets or sets the target width resolutions, in px, to generates preview images for. |
| TileWidth | integer (int32) |  |  | Gets or sets number of tile images to allow in X dimension. |
| TileHeight | integer (int32) |  |  | Gets or sets number of tile images to allow in Y dimension. |
| Qscale | integer (int32) |  |  | Gets or sets the ffmpeg output quality level. |
| JpegQuality | integer (int32) |  |  | Gets or sets the jpeg quality to use for image tiles. |
| ProcessThreads | integer (int32) |  |  | Gets or sets the number of threads to be used by ffmpeg. |

### UserPolicy

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| IsAdministrator | boolean |  |  | Gets or sets a value indicating whether this instance is administrator. |
| IsHidden | boolean |  |  | Gets or sets a value indicating whether this instance is hidden. |
| EnableCollectionManagement | boolean |  | default: false | Gets or sets a value indicating whether this instance can manage collections. |
| EnableSubtitleManagement | boolean |  | default: false | Gets or sets a value indicating whether this instance can manage subtitles. |
| EnableLyricManagement | boolean |  | default: false | Gets or sets a value indicating whether this user can manage lyrics. |
| IsDisabled | boolean |  |  | Gets or sets a value indicating whether this instance is disabled. |
| MaxParentalRating | integer (int32) (nullable) |  |  | Gets or sets the max parental rating. |
| MaxParentalSubRating | integer (int32) (nullable) |  |  |  |
| BlockedTags | string[] (nullable) |  |  |  |
| AllowedTags | string[] (nullable) |  |  |  |
| EnableUserPreferenceAccess | boolean |  |  |  |
| AccessSchedules | AccessSchedule[] (nullable) |  |  |  |
| BlockUnratedItems | UnratedItem[] (nullable) |  | enum: Movie / Trailer / Series / Music / Book / LiveTvChannel / LiveTvProgram / ChannelContent / Other |  |
| EnableRemoteControlOfOtherUsers | boolean |  |  |  |
| EnableSharedDeviceControl | boolean |  |  |  |
| EnableRemoteAccess | boolean |  |  |  |
| EnableLiveTvManagement | boolean |  |  |  |
| EnableLiveTvAccess | boolean |  |  |  |
| EnableMediaPlayback | boolean |  |  |  |
| EnableAudioPlaybackTranscoding | boolean |  |  |  |
| EnableVideoPlaybackTranscoding | boolean |  |  |  |
| EnablePlaybackRemuxing | boolean |  |  |  |
| ForceRemoteSourceTranscoding | boolean |  |  |  |
| EnableContentDeletion | boolean |  |  |  |
| EnableContentDeletionFromFolders | string[] (nullable) |  |  |  |
| EnableContentDownloading | boolean |  |  |  |
| EnableSyncTranscoding | boolean |  |  | Gets or sets a value indicating whether [enable synchronize]. |
| EnableMediaConversion | boolean |  |  |  |
| EnabledDevices | string[] (nullable) |  |  |  |
| EnableAllDevices | boolean |  |  |  |
| EnabledChannels | string (uuid)[] (nullable) |  |  |  |
| EnableAllChannels | boolean |  |  |  |
| EnabledFolders | string (uuid)[] (nullable) |  |  |  |
| EnableAllFolders | boolean |  |  |  |
| InvalidLoginAttemptCount | integer (int32) |  |  |  |
| LoginAttemptsBeforeLockout | integer (int32) |  |  |  |
| MaxActiveSessions | integer (int32) |  |  |  |
| EnablePublicSharing | boolean |  |  |  |
| BlockedMediaFolders | string (uuid)[] (nullable) |  |  |  |
| BlockedChannels | string (uuid)[] (nullable) |  |  |  |
| RemoteClientBitrateLimit | integer (int32) |  |  |  |
| AuthenticationProviderId | string | yes |  |  |
| PasswordResetProviderId | string | yes |  |  |
| SyncPlayAccess | SyncPlayUserAccessType |  | enum: CreateAndJoinGroups / JoinGroups / None | Enum SyncPlayUserAccessType. |

### UserConfiguration

Class UserConfiguration.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| AudioLanguagePreference | string (nullable) |  |  | Gets or sets the audio language preference. |
| PlayDefaultAudioTrack | boolean |  |  | Gets or sets a value indicating whether [play default audio track]. |
| SubtitleLanguagePreference | string (nullable) |  |  | Gets or sets the subtitle language preference. |
| DisplayMissingEpisodes | boolean |  |  |  |
| GroupedFolders | string (uuid)[] |  |  |  |
| SubtitleMode | SubtitlePlaybackMode |  | enum: Default / Always / OnlyForced / None / Smart | An enum representing a subtitle playback mode. |
| DisplayCollectionsView | boolean |  |  |  |
| EnableLocalPassword | boolean |  |  |  |
| OrderedViews | string (uuid)[] |  |  |  |
| LatestItemsExcludes | string (uuid)[] |  |  |  |
| MyMediaExcludes | string (uuid)[] |  |  |  |
| HidePlayedInLatest | boolean |  |  |  |
| RememberAudioSelections | boolean |  |  |  |
| RememberSubtitleSelections | boolean |  |  |  |
| EnableNextEpisodeAutoPlay | boolean |  |  |  |
| CastReceiverId | string (nullable) |  |  | Gets or sets the id of the selected cast receiver. |

### LibraryOptions

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Enabled | boolean |  |  |  |
| EnablePhotos | boolean |  |  |  |
| EnableRealtimeMonitor | boolean |  |  |  |
| EnableLUFSScan | boolean |  |  |  |
| EnableChapterImageExtraction | boolean |  |  |  |
| ExtractChapterImagesDuringLibraryScan | boolean |  |  |  |
| EnableTrickplayImageExtraction | boolean |  |  |  |
| ExtractTrickplayImagesDuringLibraryScan | boolean |  |  |  |
| PathInfos | MediaPathInfo[] |  |  |  |
| SaveLocalMetadata | boolean |  |  |  |
| EnableInternetProviders | boolean |  |  |  |
| EnableAutomaticSeriesGrouping | boolean |  |  |  |
| EnableEmbeddedTitles | boolean |  |  |  |
| EnableEmbeddedExtrasTitles | boolean |  |  |  |
| EnableEmbeddedEpisodeInfos | boolean |  |  |  |
| AutomaticRefreshIntervalDays | integer (int32) |  |  |  |
| PreferredMetadataLanguage | string (nullable) |  |  | Gets or sets the preferred metadata language. |
| MetadataCountryCode | string (nullable) |  |  | Gets or sets the metadata country code. |
| SeasonZeroDisplayName | string |  |  |  |
| MetadataSavers | string[] (nullable) |  |  |  |
| DisabledLocalMetadataReaders | string[] |  |  |  |
| LocalMetadataReaderOrder | string[] (nullable) |  |  |  |
| DisabledSubtitleFetchers | string[] |  |  |  |
| SubtitleFetcherOrder | string[] |  |  |  |
| DisabledMediaSegmentProviders | string[] |  |  |  |
| MediaSegmentProviderOrder | string[] |  |  |  |
| SkipSubtitlesIfEmbeddedSubtitlesPresent | boolean |  |  |  |
| SkipSubtitlesIfAudioTrackMatches | boolean |  |  |  |
| SubtitleDownloadLanguages | string[] (nullable) |  |  |  |
| RequirePerfectSubtitleMatch | boolean |  |  |  |
| SaveSubtitlesWithMedia | boolean |  |  |  |
| SaveLyricsWithMedia | boolean |  | default: false |  |
| SaveTrickplayWithMedia | boolean |  | default: false |  |
| DisabledLyricFetchers | string[] |  |  |  |
| LyricFetcherOrder | string[] |  |  |  |
| PreferNonstandardArtistsTag | boolean |  | default: false |  |
| UseCustomTagDelimiters | boolean |  | default: false |  |
| CustomTagDelimiters | string[] |  |  |  |
| DelimiterWhitelist | string[] |  |  |  |
| AutomaticallyAddToCollection | boolean |  |  |  |
| AllowEmbeddedSubtitles | EmbeddedSubtitleOptions |  | enum: AllowAll / AllowText / AllowImage / AllowNone | An enum representing the options to disable embedded subs. |
| TypeOptions | TypeOptions[] |  |  |  |

### TaskTriggerInfo

Class TaskTriggerInfo.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Type | TaskTriggerInfoType |  | enum: DailyTrigger / WeeklyTrigger / IntervalTrigger / StartupTrigger | Gets or sets the type. |
| TimeOfDayTicks | integer (int64) (nullable) |  |  | Gets or sets the time of day. |
| IntervalTicks | integer (int64) (nullable) |  |  | Gets or sets the interval. |
| DayOfWeek | DayOfWeek (nullable) |  | enum: Sunday / Monday / Tuesday / Wednesday / Thursday / Friday / Saturday | Gets or sets the day of week. |
| MaxRuntimeTicks | integer (int64) (nullable) |  |  | Gets or sets the maximum runtime ticks. |

### DeviceOptionsDto

A dto representing custom options for a device.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Id | integer (int32) |  |  | Gets or sets the id. |
| DeviceId | string (nullable) |  |  | Gets or sets the device id. |
| CustomName | string (nullable) |  |  | Gets or sets the custom name. |

### TunerHostInfo

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Id | string (nullable) |  |  |  |
| Url | string (nullable) |  |  |  |
| Type | string (nullable) |  |  |  |
| DeviceId | string (nullable) |  |  |  |
| FriendlyName | string (nullable) |  |  |  |
| ImportFavoritesOnly | boolean |  |  |  |
| AllowHWTranscoding | boolean |  |  |  |
| AllowFmp4TranscodingContainer | boolean |  |  |  |
| AllowStreamSharing | boolean |  |  |  |
| FallbackMaxStreamingBitrate | integer (int32) |  |  |  |
| EnableStreamLooping | boolean |  |  |  |
| Source | string (nullable) |  |  |  |
| TunerCount | integer (int32) |  |  |  |
| UserAgent | string (nullable) |  |  |  |
| IgnoreDts | boolean |  |  |  |
| ReadAtNativeFramerate | boolean |  |  |  |

### ListingsProviderInfo

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Id | string (nullable) |  |  |  |
| Type | string (nullable) |  |  |  |
| Username | string (nullable) |  |  |  |
| Password | string (nullable) |  |  |  |
| ListingsId | string (nullable) |  |  |  |
| ZipCode | string (nullable) |  |  |  |
| Country | string (nullable) |  |  |  |
| Path | string (nullable) |  |  |  |
| EnabledTuners | string[] (nullable) |  |  |  |
| EnableAllTuners | boolean |  |  |  |
| NewsCategories | string[] (nullable) |  |  |  |
| SportsCategories | string[] (nullable) |  |  |  |
| KidsCategories | string[] (nullable) |  |  |  |
| MovieCategories | string[] (nullable) |  |  |  |
| ChannelMappings | NameValuePair[] (nullable) |  |  |  |
| MoviePrefix | string (nullable) |  |  |  |
| PreferredLanguage | string (nullable) |  |  |  |
| UserAgent | string (nullable) |  |  |  |

### PluginInfo

This is a serializable stub class that is used by the api to provide information about installed plugins.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Name | string |  |  | Gets or sets the name. |
| Version | string |  |  | Gets or sets the version. |
| ConfigurationFileName | string (nullable) |  |  | Gets or sets the name of the configuration file. |
| Description | string |  |  | Gets or sets the description. |
| Id | string (uuid) |  |  | Gets or sets the unique id. |
| CanUninstall | boolean |  |  | Gets or sets a value indicating whether the plugin can be uninstalled. |
| HasImage | boolean |  |  | Gets or sets a value indicating whether this plugin has a valid image. |
| Status | PluginStatus |  | enum: Active / Restart / Deleted / Superseded / Superceded / Malfunctioned / NotSupported / Disabled | Gets or sets a value indicating the status of the plugin. |

### RepositoryInfo

Class RepositoryInfo.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Name | string (nullable) |  |  | Gets or sets the name. |
| Url | string (nullable) |  |  | Gets or sets the URL. |
| Enabled | boolean |  |  | Gets or sets a value indicating whether the repository is enabled. |

### BackupOptionsDto

Defines the optional contents of the backup archive.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Metadata | boolean |  |  | Gets or sets a value indicating whether the archive contains the Metadata contents. |
| Trickplay | boolean |  |  | Gets or sets a value indicating whether the archive contains the Trickplay contents. |
| Subtitles | boolean |  |  | Gets or sets a value indicating whether the archive contains the Subtitle contents. |
| Database | boolean |  |  | Gets or sets a value indicating whether the archive contains the Database contents. |

### BackupManifestDto

Manifest type for backups internal structure.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| ServerVersion | string |  |  | Gets or sets the jellyfin version this backup was created with. |
| BackupEngineVersion | string |  |  | Gets or sets the backup engine version this backup was created with. |
| DateCreated | string (date-time) |  |  | Gets or sets the date this backup was created with. |
| Path | string |  |  | Gets or sets the path to the backup on the system. |
| Options | BackupOptionsDto |  |  | Gets or sets the contents of the backup archive. |

### AccessSchedule

An entity representing a user's access schedule.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Id | integer (int32) |  |  | Gets the id of this instance. |
| UserId | string (uuid) |  |  | Gets the id of the associated user. |
| DayOfWeek | DynamicDayOfWeek |  | enum: Sunday / Monday / Tuesday / Wednesday / Thursday / Friday / Saturday / Everyday / Weekday / Weekend | Gets or sets the day of week. |
| StartHour | number (double) |  |  | Gets or sets the start hour. |
| EndHour | number (double) |  |  | Gets or sets the end hour. |

### ActivityLogEntry

An activity log entry.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Id | integer (int64) |  |  | Gets or sets the identifier. |
| Name | string |  |  | Gets or sets the name. |
| Overview | string (nullable) |  |  | Gets or sets the overview. |
| ShortOverview | string (nullable) |  |  | Gets or sets the short overview. |
| Type | string |  |  | Gets or sets the type. |
| ItemId | string (nullable) |  |  | Gets or sets the item identifier. |
| Date | string (date-time) |  |  | Gets or sets the date. |
| UserId | string (uuid) |  |  | Gets or sets the user identifier. |
| UserPrimaryImageTag | string (nullable) |  |  | Gets or sets the user primary image tag. |
| Severity | LogLevel |  | enum: Trace / Debug / Information / Warning / Error / Critical / None | Gets or sets the log severity. |

### ActivityLogEntryQueryResult

Query result container.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Items | ActivityLogEntry[] |  |  | Gets or sets the items. |
| TotalRecordCount | integer (int32) |  |  | Gets or sets the total number of records available. |
| StartIndex | integer (int32) |  |  | Gets or sets the index of the first record in Items. |

### AddVirtualFolderDto

Add virtual folder dto.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| LibraryOptions | LibraryOptions (nullable) |  |  | Gets or sets library options. |

### AuthenticateUserByName

The authenticate user by name request body.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Username | string (nullable) |  |  | Gets or sets the username. |
| Pw | string (nullable) |  |  | Gets or sets the plain text password. |

### AuthenticationInfo

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Id | integer (int64) |  |  | Gets or sets the identifier. |
| AccessToken | string (nullable) |  |  | Gets or sets the access token. |
| DeviceId | string (nullable) |  |  | Gets or sets the device identifier. |
| AppName | string (nullable) |  |  | Gets or sets the name of the application. |
| AppVersion | string (nullable) |  |  | Gets or sets the application version. |
| DeviceName | string (nullable) |  |  | Gets or sets the name of the device. |
| UserId | string (uuid) |  |  | Gets or sets the user identifier. |
| IsActive | boolean |  |  | Gets or sets a value indicating whether this instance is active. |
| DateCreated | string (date-time) |  |  | Gets or sets the date created. |
| DateRevoked | string (date-time) (nullable) |  |  | Gets or sets the date revoked. |
| DateLastActivity | string (date-time) |  |  |  |
| UserName | string (nullable) |  |  |  |

### AuthenticationInfoQueryResult

Query result container.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Items | AuthenticationInfo[] |  |  | Gets or sets the items. |
| TotalRecordCount | integer (int32) |  |  | Gets or sets the total number of records available. |
| StartIndex | integer (int32) |  |  | Gets or sets the index of the first record in Items. |

### AuthenticationResult

A class representing an authentication result.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| User | UserDto (nullable) |  |  | Class UserDto. |
| SessionInfo | SessionInfoDto (nullable) |  |  | Session info DTO. |
| AccessToken | string (nullable) |  |  | Gets or sets the access token. |
| ServerId | string (nullable) |  |  | Gets or sets the server id. |

### BackupRestoreRequestDto

Defines properties used to start a restore process.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| ArchiveFileName | string |  |  | Gets or Sets the name of the backup archive to restore from. Must be present in MediaBrowser.Common.Configuration.IApplicationPaths.BackupPath. |

### BasePluginConfiguration

Class BasePluginConfiguration.

Type: object

### CastReceiverApplication

The cast receiver application model.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Id | string |  |  | Gets or sets the cast receiver application id. |
| Name | string |  |  | Gets or sets the cast receiver application name. |

### ChannelMappingOptionsDto

Channel mapping options dto.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| TunerChannels | TunerChannelMapping[] |  |  | Gets or sets list of tuner channels. |
| ProviderChannels | NameIdPair[] |  |  | Gets or sets list of provider channels. |
| Mappings | NameValuePair[] |  |  | Gets or sets list of mappings. |
| ProviderName | string (nullable) |  |  | Gets or sets provider name. |

### ClientCapabilitiesDto

Client capabilities dto.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| PlayableMediaTypes | MediaType[] |  | enum: Unknown / Video / Audio / Photo / Book | Gets or sets the list of playable media types. |
| SupportedCommands | GeneralCommandType[] |  | enum: MoveUp / MoveDown / MoveLeft / MoveRight / PageUp / PageDown / PreviousLetter / NextLetter / ToggleOsd / ToggleContextMenu / Select / Back / TakeScreenshot / SendKey / SendString / GoHome / GoToSettings / VolumeUp / VolumeDown / Mute / Unmute / ToggleMute / SetVolume / SetAudioStreamIndex / SetSubtitleStreamIndex / ToggleFullscreen / DisplayContent / GoToSearch / DisplayMessage / SetRepeatMode / ChannelUp / ChannelDown / Guide / ToggleStats / PlayMediaSource / PlayTrailers / SetShuffleQueue / PlayState / PlayNext / ToggleOsdMenu / Play / SetMaxStreamingBitrate / SetPlaybackOrder | Gets or sets the list of supported commands. |
| SupportsMediaControl | boolean |  |  | Gets or sets a value indicating whether session supports media control. |
| SupportsPersistentIdentifier | boolean |  |  | Gets or sets a value indicating whether session supports a persistent identifier. |
| DeviceProfile | DeviceProfile (nullable) |  |  | Gets or sets the device profile. |
| AppStoreUrl | string (nullable) |  |  | Gets or sets the app store url. |
| IconUrl | string (nullable) |  |  | Gets or sets the icon url. |

### CollectionCreationResult

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Id | string (uuid) |  |  |  |

### ConfigImageTypes

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| BackdropSizes | string[] (nullable) |  |  |  |
| BaseUrl | string (nullable) |  |  |  |
| LogoSizes | string[] (nullable) |  |  |  |
| PosterSizes | string[] (nullable) |  |  |  |
| ProfileSizes | string[] (nullable) |  |  |  |
| SecureBaseUrl | string (nullable) |  |  |  |
| StillSizes | string[] (nullable) |  |  |  |

### ConfigurationPageInfo

The configuration page info.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Name | string |  |  | Gets or sets the name. |
| EnableInMainMenu | boolean |  |  | Gets or sets a value indicating whether the configurations page is enabled in the main menu. |
| MenuSection | string (nullable) |  |  | Gets or sets the menu section. |
| MenuIcon | string (nullable) |  |  | Gets or sets the menu icon. |
| DisplayName | string (nullable) |  |  | Gets or sets the display name. |
| PluginId | string (uuid) (nullable) |  |  | Gets or sets the plugin id. |

### CountryInfo

Class CountryInfo.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Name | string (nullable) |  |  | Gets or sets the name. |
| DisplayName | string (nullable) |  |  | Gets or sets the display name. |
| TwoLetterISORegionName | string (nullable) |  |  | Gets or sets the name of the two letter ISO region. |
| ThreeLetterISORegionName | string (nullable) |  |  | Gets or sets the name of the three letter ISO region. |

### CreateUserByName

The create user by name request body.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Name | string | yes |  | Gets or sets the username. |
| Password | string (nullable) |  |  | Gets or sets the password. |

### CultureDto

Class CultureDto.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Name | string |  |  | Gets the name. |
| DisplayName | string |  |  | Gets the display name. |
| TwoLetterISOLanguageName | string |  |  | Gets the name of the two letter ISO language. |
| ThreeLetterISOLanguageName | string (nullable) |  |  | Gets the name of the three letter ISO language. |
| ThreeLetterISOLanguageNames | string[] |  |  |  |

### DefaultDirectoryBrowserInfoDto

Default directory browser info.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Path | string (nullable) |  |  | Gets or sets the path. |

### DeviceInfoDto

A DTO representing device information.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Name | string (nullable) |  |  | Gets or sets the name. |
| CustomName | string (nullable) |  |  | Gets or sets the custom name. |
| AccessToken | string (nullable) |  |  | Gets or sets the access token. |
| Id | string (nullable) |  |  | Gets or sets the identifier. |
| LastUserName | string (nullable) |  |  | Gets or sets the last name of the user. |
| AppName | string (nullable) |  |  | Gets or sets the name of the application. |
| AppVersion | string (nullable) |  |  | Gets or sets the application version. |
| LastUserId | string (uuid) (nullable) |  |  | Gets or sets the last user identifier. |
| DateLastActivity | string (date-time) (nullable) |  |  | Gets or sets the date last modified. |
| Capabilities | ClientCapabilitiesDto |  |  | Gets or sets the capabilities. |
| IconUrl | string (nullable) |  |  | Gets or sets the icon URL. |

### DeviceInfoDtoQueryResult

Query result container.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Items | DeviceInfoDto[] |  |  | Gets or sets the items. |
| TotalRecordCount | integer (int32) |  |  | Gets or sets the total number of records available. |
| StartIndex | integer (int32) |  |  | Gets or sets the index of the first record in Items. |

### DisplayPreferencesDto

Defines the display preferences for any item that supports them (usually Folders).

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Id | string (nullable) |  |  | Gets or sets the user id. |
| ViewType | string (nullable) |  |  | Gets or sets the type of the view. |
| SortBy | string (nullable) |  |  | Gets or sets the sort by. |
| IndexBy | string (nullable) |  |  | Gets or sets the index by. |
| RememberIndexing | boolean |  |  | Gets or sets a value indicating whether [remember indexing]. |
| PrimaryImageHeight | integer (int32) |  |  | Gets or sets the height of the primary image. |
| PrimaryImageWidth | integer (int32) |  |  | Gets or sets the width of the primary image. |
| CustomPrefs | map<string, string> |  |  | Gets or sets the custom prefs. |
| ScrollDirection | ScrollDirection |  | enum: Horizontal / Vertical | An enum representing the axis that should be scrolled. |
| ShowBackdrop | boolean |  |  | Gets or sets a value indicating whether to show backdrops on this item. |
| RememberSorting | boolean |  |  | Gets or sets a value indicating whether [remember sorting]. |
| SortOrder | SortOrder |  | enum: Ascending / Descending | An enum representing the sorting order. |
| ShowSidebar | boolean |  |  | Gets or sets a value indicating whether [show sidebar]. |
| Client | string (nullable) |  |  | Gets or sets the client. |

### EndPointInfo

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| IsLocal | boolean |  |  |  |
| IsInNetwork | boolean |  |  |  |

### ExternalIdInfo

Represents the external id information for serialization to the client.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Name | string |  |  | Gets or sets the display name of the external id provider (IE: IMDB, MusicBrainz, etc). |
| Key | string |  |  | Gets or sets the unique key for this id. This key should be unique across all providers. |
| Type | ExternalIdMediaType (nullable) |  | enum: Album / AlbumArtist / Artist / BoxSet / Episode / Movie / OtherArtist / Person / ReleaseGroup / Season / Series / Track / Book / Recording | Gets or sets the specific media type for this id. This is used to distinguish between the different external id types for providers with multiple ids. A null value indicates there is no specific media type associated with the external id, or this is the default id for the external provider so there is no need to specify a type. |

### FileSystemEntryInfo

Class FileSystemEntryInfo.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Name | string |  |  | Gets the name. |
| Path | string |  |  | Gets the path. |
| Type | FileSystemEntryType |  | enum: File / Directory / NetworkComputer / NetworkShare | Gets the type. |

### FolderStorageDto

Contains information about a specific folder.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Path | string |  |  | Gets the path of the folder in question. |
| FreeSpace | integer (int64) |  |  | Gets the free space of the underlying storage device of the Jellyfin.Api.Models.SystemInfoDtos.FolderStorageDto.Path. |
| UsedSpace | integer (int64) |  |  | Gets the used space of the underlying storage device of the Jellyfin.Api.Models.SystemInfoDtos.FolderStorageDto.Path. |
| StorageType | string (nullable) |  |  | Gets the kind of storage device of the Jellyfin.Api.Models.SystemInfoDtos.FolderStorageDto.Path. |
| DeviceId | string (nullable) |  |  | Gets the Device Identifier. |

### FontFile

Class FontFile.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Name | string (nullable) |  |  | Gets or sets the name. |
| Size | integer (int64) |  |  | Gets or sets the size. |
| DateCreated | string (date-time) |  |  | Gets or sets the date created. |
| DateModified | string (date-time) |  |  | Gets or sets the date modified. |

### ForgotPasswordDto

Forgot Password request body DTO.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| EnteredUsername | string | yes |  | Gets or sets the entered username to have its password reset. |

### ForgotPasswordPinDto

Forgot Password Pin enter request body DTO.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Pin | string | yes |  | Gets or sets the entered pin to have the password reset. |

### ForgotPasswordResult

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Action | ForgotPasswordAction |  | enum: ContactAdmin / PinCode / InNetworkRequired | Gets or sets the action. |
| PinFile | string (nullable) |  |  | Gets or sets the pin file. |
| PinExpirationDate | string (date-time) (nullable) |  |  | Gets or sets the pin expiration date. |

### GeneralCommand

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Name | GeneralCommandType |  | enum: MoveUp / MoveDown / MoveLeft / MoveRight / PageUp / PageDown / PreviousLetter / NextLetter / ToggleOsd / ToggleContextMenu / Select / Back / TakeScreenshot / SendKey / SendString / GoHome / GoToSettings / VolumeUp / VolumeDown / Mute / Unmute / ToggleMute / SetVolume / SetAudioStreamIndex / SetSubtitleStreamIndex / ToggleFullscreen / DisplayContent / GoToSearch / DisplayMessage / SetRepeatMode / ChannelUp / ChannelDown / Guide / ToggleStats / PlayMediaSource / PlayTrailers / SetShuffleQueue / PlayState / PlayNext / ToggleOsdMenu / Play / SetMaxStreamingBitrate / SetPlaybackOrder | This exists simply to identify a set of known commands. |
| ControllingUserId | string (uuid) |  |  |  |
| Arguments | map<string, string> |  |  |  |

### GetProgramsDto

Get programs dto.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| ChannelIds | string (uuid)[] (nullable) |  |  | Gets or sets the channels to return guide information for. |
| UserId | string (uuid) (nullable) |  |  | Gets or sets optional. Filter by user id. |
| MinStartDate | string (date-time) (nullable) |  |  | Gets or sets the minimum premiere start date. |
| HasAired | boolean (nullable) |  |  | Gets or sets filter by programs that have completed airing, or not. |
| IsAiring | boolean (nullable) |  |  | Gets or sets filter by programs that are currently airing, or not. |
| MaxStartDate | string (date-time) (nullable) |  |  | Gets or sets the maximum premiere start date. |
| MinEndDate | string (date-time) (nullable) |  |  | Gets or sets the minimum premiere end date. |
| MaxEndDate | string (date-time) (nullable) |  |  | Gets or sets the maximum premiere end date. |
| IsMovie | boolean (nullable) |  |  | Gets or sets filter for movies. |
| IsSeries | boolean (nullable) |  |  | Gets or sets filter for series. |
| IsNews | boolean (nullable) |  |  | Gets or sets filter for news. |
| IsKids | boolean (nullable) |  |  | Gets or sets filter for kids. |
| IsSports | boolean (nullable) |  |  | Gets or sets filter for sports. |
| StartIndex | integer (int32) (nullable) |  |  | Gets or sets the record index to start at. All items with a lower index will be dropped from the results. |
| Limit | integer (int32) (nullable) |  |  | Gets or sets the maximum number of records to return. |
| SortBy | ItemSortBy[] (nullable) |  | enum: Default / AiredEpisodeOrder / Album / AlbumArtist / Artist / DateCreated / OfficialRating / DatePlayed / PremiereDate / StartDate / SortName / Name / Random / Runtime / CommunityRating / ProductionYear / PlayCount / CriticRating / IsFolder / IsUnplayed / IsPlayed / SeriesSortName / VideoBitRate / AirTime / Studio / IsFavoriteOrLiked / DateLastContentAdded / SeriesDatePlayed / ParentIndexNumber / IndexNumber | Gets or sets specify one or more sort orders, comma delimited. Options: Name, StartDate. |
| SortOrder | SortOrder[] (nullable) |  | enum: Ascending / Descending | Gets or sets sort order. |
| Genres | string[] (nullable) |  |  | Gets or sets the genres to return guide information for. |
| GenreIds | string (uuid)[] (nullable) |  |  | Gets or sets the genre ids to return guide information for. |
| EnableImages | boolean (nullable) |  |  | Gets or sets include image information in output. |
| EnableTotalRecordCount | boolean |  | default: true | Gets or sets a value indicating whether retrieve total record count. |
| ImageTypeLimit | integer (int32) (nullable) |  |  | Gets or sets the max number of images to return, per image type. |
| EnableImageTypes | ImageType[] (nullable) |  | enum: Primary / Art / Backdrop / Banner / Logo / Thumb / Disc / Box / Screenshot / Menu / Chapter / BoxRear / Profile | Gets or sets the image types to include in the output. |
| EnableUserData | boolean (nullable) |  |  | Gets or sets include user data. |
| SeriesTimerId | string (nullable) |  |  | Gets or sets filter by series timer id. |
| LibrarySeriesId | string (uuid) (nullable) |  |  | Gets or sets filter by library series id. |
| Fields | ItemFields[] (nullable) |  | enum: AirTime / CanDelete / CanDownload / ChannelInfo / Chapters / Trickplay / ChildCount / CumulativeRunTimeTicks / CustomRating / DateCreated / DateLastMediaAdded / DisplayPreferencesId / Etag / ExternalUrls / Genres / ItemCounts / MediaSourceCount / MediaSources / OriginalTitle / Overview / ParentId / Path / People / PlayAccess / ProductionLocations / ProviderIds / PrimaryImageAspectRatio / RecursiveItemCount / Settings / SeriesStudio / SortName / SpecialEpisodeNumbers / Studios / Taglines / Tags / RemoteTrailers / MediaStreams / SeasonUserData / DateLastRefreshed / DateLastSaved / RefreshState / ChannelImage / EnableMediaSourceDisplay / Width / Height / ExtraIds / LocalTrailerCount / IsHD / SpecialFeatureCount | Gets or sets specify additional fields of information to return in the output. |

### GuideInfo

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| StartDate | string (date-time) |  |  | Gets or sets the start date. |
| EndDate | string (date-time) |  |  | Gets or sets the end date. |

### ImageOption

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Type | ImageType |  | enum: Primary / Art / Backdrop / Banner / Logo / Thumb / Disc / Box / Screenshot / Menu / Chapter / BoxRear / Profile | Gets or sets the type. |
| Limit | integer (int32) |  |  | Gets or sets the limit. |
| MinWidth | integer (int32) |  |  | Gets or sets the minimum width. |

### InstallationInfo

Class InstallationInfo.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Guid | string (uuid) |  |  | Gets or sets the Id. |
| Name | string (nullable) |  |  | Gets or sets the name. |
| Version | string (nullable) |  |  | Gets or sets the version. |
| Changelog | string (nullable) |  |  | Gets or sets the changelog for this version. |
| SourceUrl | string (nullable) |  |  | Gets or sets the source URL. |
| Checksum | string (nullable) |  |  | Gets or sets a checksum for the binary. |
| PackageInfo | PackageInfo (nullable) |  |  | Gets or sets package information for the installation. |

### ItemCounts

Class LibrarySummary.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| MovieCount | integer (int32) |  |  | Gets or sets the movie count. |
| SeriesCount | integer (int32) |  |  | Gets or sets the series count. |
| EpisodeCount | integer (int32) |  |  | Gets or sets the episode count. |
| ArtistCount | integer (int32) |  |  | Gets or sets the artist count. |
| ProgramCount | integer (int32) |  |  | Gets or sets the program count. |
| TrailerCount | integer (int32) |  |  | Gets or sets the trailer count. |
| SongCount | integer (int32) |  |  | Gets or sets the song count. |
| AlbumCount | integer (int32) |  |  | Gets or sets the album count. |
| MusicVideoCount | integer (int32) |  |  | Gets or sets the music video count. |
| BoxSetCount | integer (int32) |  |  | Gets or sets the box set count. |
| BookCount | integer (int32) |  |  | Gets or sets the book count. |
| ItemCount | integer (int32) |  |  | Gets or sets the item count. |

### LibraryOptionInfoDto

Library option info dto.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Name | string (nullable) |  |  | Gets or sets name. |
| DefaultEnabled | boolean |  |  | Gets or sets a value indicating whether default enabled. |

### LibraryOptionsResultDto

Library options result dto.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| MetadataSavers | LibraryOptionInfoDto[] |  |  | Gets or sets the metadata savers. |
| MetadataReaders | LibraryOptionInfoDto[] |  |  | Gets or sets the metadata readers. |
| SubtitleFetchers | LibraryOptionInfoDto[] |  |  | Gets or sets the subtitle fetchers. |
| LyricFetchers | LibraryOptionInfoDto[] |  |  | Gets or sets the list of lyric fetchers. |
| MediaSegmentProviders | LibraryOptionInfoDto[] |  |  | Gets or sets the list of MediaSegment Providers. |
| TypeOptions | LibraryTypeOptionsDto[] |  |  | Gets or sets the type options. |

### LibraryStorageDto

Contains informations about a libraries storage informations.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Id | string (uuid) |  |  | Gets or sets the Library Id. |
| Name | string |  |  | Gets or sets the name of the library. |
| Folders | FolderStorageDto[] |  |  | Gets or sets the storage informations about the folders used in a library. |

### LibraryTypeOptionsDto

Library type options dto.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Type | string (nullable) |  |  | Gets or sets the type. |
| MetadataFetchers | LibraryOptionInfoDto[] |  |  | Gets or sets the metadata fetchers. |
| ImageFetchers | LibraryOptionInfoDto[] |  |  | Gets or sets the image fetchers. |
| SupportedImageTypes | ImageType[] |  | enum: Primary / Art / Backdrop / Banner / Logo / Thumb / Disc / Box / Screenshot / Menu / Chapter / BoxRear / Profile | Gets or sets the supported image types. |
| DefaultImageOptions | ImageOption[] |  |  | Gets or sets the default image options. |

### LocalizationOption

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Name | string (nullable) |  |  |  |
| Value | string (nullable) |  |  |  |

### LogFile

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| DateCreated | string (date-time) |  |  | Gets or sets the date created. |
| DateModified | string (date-time) |  |  | Gets or sets the date modified. |
| Size | integer (int64) |  |  | Gets or sets the size. |
| Name | string |  |  | Gets or sets the name. |

### LyricDto

LyricResponse model.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Metadata | LyricMetadata |  |  | Gets or sets Metadata for the lyrics. |
| Lyrics | LyricLine[] |  |  | Gets or sets a collection of individual lyric lines. |

### LyricLine

Lyric model.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Text | string |  |  | Gets the text of this lyric line. |
| Start | integer (int64) (nullable) |  |  | Gets the start time in ticks. |
| Cues | LyricLineCue[] (nullable) |  |  | Gets the time-aligned cues for the song's lyrics. |

### LyricLineCue

LyricLineCue model, holds information about the timing of words within a LyricLine.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Position | integer (int32) |  |  | Gets the start character index of the cue. |
| EndPosition | integer (int32) |  |  | Gets the end character index of the cue. |
| Start | integer (int64) |  |  | Gets the timestamp the lyric is synced to in ticks. |
| End | integer (int64) (nullable) |  |  | Gets the end timestamp the lyric is synced to in ticks. |

### LyricMetadata

LyricMetadata model.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Artist | string (nullable) |  |  | Gets or sets the song artist. |
| Album | string (nullable) |  |  | Gets or sets the album this song is on. |
| Title | string (nullable) |  |  | Gets or sets the title of the song. |
| Author | string (nullable) |  |  | Gets or sets the author of the lyric data. |
| Length | integer (int64) (nullable) |  |  | Gets or sets the length of the song in ticks. |
| By | string (nullable) |  |  | Gets or sets who the LRC file was created by. |
| Offset | integer (int64) (nullable) |  |  | Gets or sets the lyric offset compared to audio in ticks. |
| Creator | string (nullable) |  |  | Gets or sets the software used to create the LRC file. |
| Version | string (nullable) |  |  | Gets or sets the version of the creator used. |
| IsSynced | boolean (nullable) |  |  | Gets or sets a value indicating whether this lyric is synced. |

### MediaPathDto

Media Path dto.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Name | string | yes |  | Gets or sets the name of the library. |
| Path | string (nullable) |  |  | Gets or sets the path to add. |
| PathInfo | MediaPathInfo (nullable) |  |  | Gets or sets the path info. |

### MediaPathInfo

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Path | string |  |  |  |

### MediaSegmentDto

Api model for MediaSegment's.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Id | string (uuid) |  |  | Gets or sets the id of the media segment. |
| ItemId | string (uuid) |  |  | Gets or sets the id of the associated item. |
| Type | MediaSegmentType |  | enum: Unknown / Commercial / Preview / Recap / Outro / Intro | Defines the types of content an individual Jellyfin.Database.Implementations.Entities.MediaSegment represents. |
| StartTicks | integer (int64) |  |  | Gets or sets the start of the segment. |
| EndTicks | integer (int64) |  |  | Gets or sets the end of the segment. |

### MediaSegmentDtoQueryResult

Query result container.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Items | MediaSegmentDto[] |  |  | Gets or sets the items. |
| TotalRecordCount | integer (int32) |  |  | Gets or sets the total number of records available. |
| StartIndex | integer (int32) |  |  | Gets or sets the index of the first record in Items. |

### MessageCommand

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Header | string (nullable) |  |  |  |
| Text | string | yes |  |  |
| TimeoutMs | integer (int64) (nullable) |  |  |  |

### MetadataEditorInfo

A class representing metadata editor information.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| ParentalRatingOptions | ParentalRating[] |  |  | Gets or sets the parental rating options. |
| Countries | CountryInfo[] |  |  | Gets or sets the countries. |
| Cultures | CultureDto[] |  |  | Gets or sets the cultures. |
| ExternalIdInfos | ExternalIdInfo[] |  |  | Gets or sets the external id infos. |
| ContentType | CollectionType (nullable) |  | enum: unknown / movies / tvshows / music / musicvideos / trailers / homevideos / boxsets / books / photos / livetv / playlists / folders | Gets or sets the content type. |
| ContentTypeOptions | NameValuePair[] |  |  | Gets or sets the content type options. |

### MetadataOptions

Class MetadataOptions.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| ItemType | string (nullable) |  |  |  |
| DisabledMetadataSavers | string[] (nullable) |  |  |  |
| LocalMetadataReaderOrder | string[] (nullable) |  |  |  |
| DisabledMetadataFetchers | string[] (nullable) |  |  |  |
| MetadataFetcherOrder | string[] (nullable) |  |  |  |
| DisabledImageFetchers | string[] (nullable) |  |  |  |
| ImageFetcherOrder | string[] (nullable) |  |  |  |

### NameIdPair

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Name | string (nullable) |  |  | Gets or sets the name. |
| Id | string (nullable) |  |  | Gets or sets the identifier. |

### NameValuePair

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Name | string (nullable) |  |  | Gets or sets the name. |
| Value | string (nullable) |  |  | Gets or sets the value. |

### PackageInfo

Class PackageInfo.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| name | string |  |  | Gets or sets the name. |
| description | string |  |  | Gets or sets a long description of the plugin containing features or helpful explanations. |
| overview | string |  |  | Gets or sets a short overview of what the plugin does. |
| owner | string |  |  | Gets or sets the owner. |
| category | string |  |  | Gets or sets the category. |
| guid | string (uuid) |  |  | Gets or sets the guid of the assembly associated with this plugin. This is used to identify the proper item for automatic updates. |
| versions | VersionInfo[] |  |  | Gets or sets the versions. |
| imageUrl | string (nullable) |  |  | Gets or sets the image url for the package. |

### ParentalRating

Class ParentalRating.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Name | string |  |  | Gets or sets the name. |
| Value | integer (int32) (nullable) |  |  | Gets or sets the value. |
| RatingScore | ParentalRatingScore (nullable) |  |  | Gets or sets the rating score. |

### ParentalRatingScore

A class representing an parental rating score.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| score | integer (int32) |  |  | Gets or sets the score. |
| subScore | integer (int32) (nullable) |  |  | Gets or sets the sub score. |

### PathSubstitution

Defines the MediaBrowser.Model.Configuration.PathSubstitution.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| From | string |  |  | Gets or sets the value to substitute. |
| To | string |  |  | Gets or sets the value to substitution with. |

### PersonLookupInfo

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Name | string (nullable) |  |  | Gets or sets the name. |
| OriginalTitle | string (nullable) |  |  | Gets or sets the original title. |
| Path | string (nullable) |  |  | Gets or sets the path. |
| MetadataLanguage | string (nullable) |  |  | Gets or sets the metadata language. |
| MetadataCountryCode | string (nullable) |  |  | Gets or sets the metadata country code. |
| ProviderIds | map<string, string> (nullable) |  |  | Gets or sets the provider ids. |
| Year | integer (int32) (nullable) |  |  | Gets or sets the year. |
| IndexNumber | integer (int32) (nullable) |  |  |  |
| ParentIndexNumber | integer (int32) (nullable) |  |  |  |
| PremiereDate | string (date-time) (nullable) |  |  |  |
| IsAutomated | boolean |  |  |  |

### PersonLookupInfoRemoteSearchQuery

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| SearchInfo | PersonLookupInfo (nullable) |  |  |  |
| ItemId | string (uuid) |  |  |  |
| SearchProviderName | string (nullable) |  |  | Gets or sets the provider name to search within if set. |
| IncludeDisabledProviders | boolean |  |  | Gets or sets a value indicating whether disabled providers should be included. |

### PinRedeemResult

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Success | boolean |  |  | Gets or sets a value indicating whether this MediaBrowser.Model.Users.PinRedeemResult is success. |
| UsersReset | string[] |  |  | Gets or sets the users reset. |

### PlayerStateInfo

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| PositionTicks | integer (int64) (nullable) |  |  | Gets or sets the now playing position ticks. |
| CanSeek | boolean |  |  | Gets or sets a value indicating whether this instance can seek. |
| IsPaused | boolean |  |  | Gets or sets a value indicating whether this instance is paused. |
| IsMuted | boolean |  |  | Gets or sets a value indicating whether this instance is muted. |
| VolumeLevel | integer (int32) (nullable) |  |  | Gets or sets the volume level. |
| AudioStreamIndex | integer (int32) (nullable) |  |  | Gets or sets the index of the now playing audio stream. |
| SubtitleStreamIndex | integer (int32) (nullable) |  |  | Gets or sets the index of the now playing subtitle stream. |
| MediaSourceId | string (nullable) |  |  | Gets or sets the now playing media version identifier. |
| PlayMethod | PlayMethod (nullable) |  | enum: Transcode / DirectStream / DirectPlay | Gets or sets the play method. |
| RepeatMode | RepeatMode |  | enum: RepeatNone / RepeatAll / RepeatOne | Gets or sets the repeat mode. |
| PlaybackOrder | PlaybackOrder |  | enum: Default / Shuffle | Gets or sets the playback order. |
| LiveStreamId | string (nullable) |  |  | Gets or sets the now playing live stream identifier. |

### QueueItem

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Id | string (uuid) |  |  |  |
| PlaylistItemId | string (nullable) |  |  |  |

### QuickConnectDto

The quick connect request body.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Secret | string | yes |  | Gets or sets the quick connect secret. |

### QuickConnectResult

Stores the state of an quick connect request.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Authenticated | boolean |  |  | Gets or sets a value indicating whether this request is authorized. |
| Secret | string |  |  | Gets the secret value used to uniquely identify this request. Can be used to retrieve authentication information. |
| Code | string |  |  | Gets the user facing code used so the user can quickly differentiate this request from others. |
| DeviceId | string |  |  | Gets the requesting device id. |
| DeviceName | string |  |  | Gets the requesting device name. |
| AppName | string |  |  | Gets the requesting app name. |
| AppVersion | string |  |  | Gets the requesting app version. |
| DateAdded | string (date-time) |  |  | Gets or sets the DateTime that this request was created. |

### RemoteLyricInfoDto

The remote lyric info dto.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Id | string |  |  | Gets or sets the id for the lyric. |
| ProviderName | string |  |  | Gets the provider name. |
| Lyrics | LyricDto |  |  | Gets the lyrics. |

### RemoteSearchResult

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Name | string (nullable) |  |  | Gets or sets the name. |
| ProviderIds | map<string, string> (nullable) |  |  | Gets or sets the provider ids. |
| ProductionYear | integer (int32) (nullable) |  |  | Gets or sets the year. |
| IndexNumber | integer (int32) (nullable) |  |  |  |
| IndexNumberEnd | integer (int32) (nullable) |  |  |  |
| ParentIndexNumber | integer (int32) (nullable) |  |  |  |
| PremiereDate | string (date-time) (nullable) |  |  |  |
| ImageUrl | string (nullable) |  |  |  |
| SearchProviderName | string (nullable) |  |  |  |
| Overview | string (nullable) |  |  |  |
| AlbumArtist | RemoteSearchResult (nullable) |  |  |  |
| Artists | RemoteSearchResult[] (nullable) |  |  |  |

### RemoteSubtitleInfo

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| ThreeLetterISOLanguageName | string (nullable) |  |  |  |
| Id | string (nullable) |  |  |  |
| ProviderName | string (nullable) |  |  |  |
| Name | string (nullable) |  |  |  |
| Format | string (nullable) |  |  |  |
| Author | string (nullable) |  |  |  |
| Comment | string (nullable) |  |  |  |
| DateCreated | string (date-time) (nullable) |  |  |  |
| CommunityRating | number (float) (nullable) |  |  |  |
| FrameRate | number (float) (nullable) |  |  |  |
| DownloadCount | integer (int32) (nullable) |  |  |  |
| IsHashMatch | boolean (nullable) |  |  |  |
| AiTranslated | boolean (nullable) |  |  |  |
| MachineTranslated | boolean (nullable) |  |  |  |
| Forced | boolean (nullable) |  |  |  |
| HearingImpaired | boolean (nullable) |  |  |  |

### SeriesTimerInfoDtoQueryResult

Query result container.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Items | SeriesTimerInfoDto[] |  |  | Gets or sets the items. |
| TotalRecordCount | integer (int32) |  |  | Gets or sets the total number of records available. |
| StartIndex | integer (int32) |  |  | Gets or sets the index of the first record in Items. |

### SessionInfoDto

Session info DTO.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| PlayState | PlayerStateInfo (nullable) |  |  | Gets or sets the play state. |
| AdditionalUsers | SessionUserInfo[] (nullable) |  |  | Gets or sets the additional users. |
| Capabilities | ClientCapabilitiesDto (nullable) |  |  | Gets or sets the client capabilities. |
| RemoteEndPoint | string (nullable) |  |  | Gets or sets the remote end point. |
| PlayableMediaTypes | MediaType[] |  | enum: Unknown / Video / Audio / Photo / Book | Gets or sets the playable media types. |
| Id | string (nullable) |  |  | Gets or sets the id. |
| UserId | string (uuid) |  |  | Gets or sets the user id. |
| UserName | string (nullable) |  |  | Gets or sets the username. |
| Client | string (nullable) |  |  | Gets or sets the type of the client. |
| LastActivityDate | string (date-time) |  |  | Gets or sets the last activity date. |
| LastPlaybackCheckIn | string (date-time) |  |  | Gets or sets the last playback check in. |
| LastPausedDate | string (date-time) (nullable) |  |  | Gets or sets the last paused date. |
| DeviceName | string (nullable) |  |  | Gets or sets the name of the device. |
| DeviceType | string (nullable) |  |  | Gets or sets the type of the device. |
| NowPlayingItem | BaseItemDto (nullable) |  |  | Gets or sets the now playing item. |
| NowViewingItem | BaseItemDto (nullable) |  |  | Gets or sets the now viewing item. |
| DeviceId | string (nullable) |  |  | Gets or sets the device id. |
| ApplicationVersion | string (nullable) |  |  | Gets or sets the application version. |
| TranscodingInfo | TranscodingInfo (nullable) |  |  | Gets or sets the transcoding info. |
| IsActive | boolean |  |  | Gets or sets a value indicating whether this session is active. |
| SupportsMediaControl | boolean |  |  | Gets or sets a value indicating whether the session supports media control. |
| SupportsRemoteControl | boolean |  |  | Gets or sets a value indicating whether the session supports remote control. |
| NowPlayingQueue | QueueItem[] (nullable) |  |  | Gets or sets the now playing queue. |
| NowPlayingQueueFullItems | BaseItemDto[] (nullable) |  |  | Gets or sets the now playing queue full items. |
| HasCustomDeviceName | boolean |  |  | Gets or sets a value indicating whether the session has a custom device name. |
| PlaylistItemId | string (nullable) |  |  | Gets or sets the playlist item id. |
| ServerId | string (nullable) |  |  | Gets or sets the server id. |
| UserPrimaryImageTag | string (nullable) |  |  | Gets or sets the user primary image tag. |
| SupportedCommands | GeneralCommandType[] |  | enum: MoveUp / MoveDown / MoveLeft / MoveRight / PageUp / PageDown / PreviousLetter / NextLetter / ToggleOsd / ToggleContextMenu / Select / Back / TakeScreenshot / SendKey / SendString / GoHome / GoToSettings / VolumeUp / VolumeDown / Mute / Unmute / ToggleMute / SetVolume / SetAudioStreamIndex / SetSubtitleStreamIndex / ToggleFullscreen / DisplayContent / GoToSearch / DisplayMessage / SetRepeatMode / ChannelUp / ChannelDown / Guide / ToggleStats / PlayMediaSource / PlayTrailers / SetShuffleQueue / PlayState / PlayNext / ToggleOsdMenu / Play / SetMaxStreamingBitrate / SetPlaybackOrder | Gets or sets the supported commands. |

### SessionUserInfo

Class SessionUserInfo.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| UserId | string (uuid) |  |  | Gets or sets the user identifier. |
| UserName | string (nullable) |  |  | Gets or sets the name of the user. |

### SetChannelMappingDto

Set channel mapping dto.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| ProviderId | string | yes |  | Gets or sets the provider id. |
| TunerChannelId | string | yes |  | Gets or sets the tuner channel id. |
| ProviderChannelId | string | yes |  | Gets or sets the provider channel id. |

### StartupConfigurationDto

The startup configuration DTO.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| ServerName | string (nullable) |  |  | Gets or sets the server name. |
| UICulture | string (nullable) |  |  | Gets or sets UI language culture. |
| MetadataCountryCode | string (nullable) |  |  | Gets or sets the metadata country code. |
| PreferredMetadataLanguage | string (nullable) |  |  | Gets or sets the preferred language for the metadata. |

### StartupRemoteAccessDto

Startup remote access dto.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| EnableRemoteAccess | boolean | yes |  | Gets or sets a value indicating whether enable remote access. |
| EnableAutomaticPortMapping | boolean | yes |  | Gets or sets a value indicating whether enable automatic port mapping. |

### StartupUserDto

The startup user DTO.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Name | string (nullable) |  |  | Gets or sets the username. |
| Password | string (nullable) |  |  | Gets or sets the user's password. |

### SystemInfo

Class SystemInfo.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| LocalAddress | string (nullable) |  |  | Gets or sets the local address. |
| ServerName | string (nullable) |  |  | Gets or sets the name of the server. |
| Version | string (nullable) |  |  | Gets or sets the server version. |
| ProductName | string (nullable) |  |  | Gets or sets the product name. This is the AssemblyProduct name. |
| OperatingSystem | string (nullable) |  |  | Gets or sets the operating system. |
| Id | string (nullable) |  |  | Gets or sets the id. |
| StartupWizardCompleted | boolean (nullable) |  |  | Gets or sets a value indicating whether the startup wizard is completed. |
| OperatingSystemDisplayName | string (nullable) |  |  | Gets or sets the display name of the operating system. |
| PackageName | string (nullable) |  |  | Gets or sets the package name. |
| HasPendingRestart | boolean |  |  | Gets or sets a value indicating whether this instance has pending restart. |
| IsShuttingDown | boolean |  |  |  |
| SupportsLibraryMonitor | boolean |  |  | Gets or sets a value indicating whether [supports library monitor]. |
| WebSocketPortNumber | integer (int32) |  |  | Gets or sets the web socket port number. |
| CompletedInstallations | InstallationInfo[] (nullable) |  |  | Gets or sets the completed installations. |
| CanSelfRestart | boolean |  | default: true | Gets or sets a value indicating whether this instance can self restart. |
| CanLaunchWebBrowser | boolean |  | default: false |  |
| ProgramDataPath | string (nullable) |  |  | Gets or sets the program data path. |
| WebPath | string (nullable) |  |  | Gets or sets the web UI resources path. |
| ItemsByNamePath | string (nullable) |  |  | Gets or sets the items by name path. |
| CachePath | string (nullable) |  |  | Gets or sets the cache path. |
| LogPath | string (nullable) |  |  | Gets or sets the log path. |
| InternalMetadataPath | string (nullable) |  |  | Gets or sets the internal metadata path. |
| TranscodingTempPath | string (nullable) |  |  | Gets or sets the transcode path. |
| CastReceiverApplications | CastReceiverApplication[] (nullable) |  |  | Gets or sets the list of cast receiver applications. |
| HasUpdateAvailable | boolean |  | default: false | Gets or sets a value indicating whether this instance has update available. |
| EncoderLocation | string (nullable) |  | default: "System" |  |
| SystemArchitecture | string (nullable) |  | default: "X64" |  |

### SystemStorageDto

Contains informations about the systems storage.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| ProgramDataFolder | FolderStorageDto |  |  | Gets or sets the Storage information of the program data folder. |
| WebFolder | FolderStorageDto |  |  | Gets or sets the Storage information of the web UI resources folder. |
| ImageCacheFolder | FolderStorageDto |  |  | Gets or sets the Storage information of the folder where images are cached. |
| CacheFolder | FolderStorageDto |  |  | Gets or sets the Storage information of the cache folder. |
| LogFolder | FolderStorageDto |  |  | Gets or sets the Storage information of the folder where logfiles are saved to. |
| InternalMetadataFolder | FolderStorageDto |  |  | Gets or sets the Storage information of the folder where metadata is stored. |
| TranscodingTempFolder | FolderStorageDto |  |  | Gets or sets the Storage information of the transcoding cache. |
| Libraries | LibraryStorageDto[] |  |  | Gets or sets the storage informations of all libraries. |

### TaskInfo

Class TaskInfo.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Name | string (nullable) |  |  | Gets or sets the name. |
| State | TaskState |  | enum: Idle / Cancelling / Running | Gets or sets the state of the task. |
| CurrentProgressPercentage | number (double) (nullable) |  |  | Gets or sets the progress. |
| Id | string (nullable) |  |  | Gets or sets the id. |
| LastExecutionResult | TaskResult (nullable) |  |  | Gets or sets the last execution result. |
| Triggers | TaskTriggerInfo[] (nullable) |  |  | Gets or sets the triggers. |
| Description | string (nullable) |  |  | Gets or sets the description. |
| Category | string (nullable) |  |  | Gets or sets the category. |
| IsHidden | boolean |  |  | Gets or sets a value indicating whether this instance is hidden. |
| Key | string (nullable) |  |  | Gets or sets the key. |

### TaskResult

Class TaskExecutionInfo.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| StartTimeUtc | string (date-time) |  |  | Gets or sets the start time UTC. |
| EndTimeUtc | string (date-time) |  |  | Gets or sets the end time UTC. |
| Status | TaskCompletionStatus |  | enum: Completed / Failed / Cancelled / Aborted | Gets or sets the status. |
| Name | string (nullable) |  |  | Gets or sets the name. |
| Key | string (nullable) |  |  | Gets or sets the key. |
| Id | string (nullable) |  |  | Gets or sets the id. |
| ErrorMessage | string (nullable) |  |  | Gets or sets the error message. |
| LongErrorMessage | string (nullable) |  |  | Gets or sets the long error message. |

### TimerInfoDtoQueryResult

Query result container.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Items | TimerInfoDto[] |  |  | Gets or sets the items. |
| TotalRecordCount | integer (int32) |  |  | Gets or sets the total number of records available. |
| StartIndex | integer (int32) |  |  | Gets or sets the index of the first record in Items. |

### TranscodingInfo

Class holding information on a running transcode.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| AudioCodec | string (nullable) |  |  | Gets or sets the thread count used for encoding. |
| VideoCodec | string (nullable) |  |  | Gets or sets the thread count used for encoding. |
| Container | string (nullable) |  |  | Gets or sets the thread count used for encoding. |
| IsVideoDirect | boolean |  |  | Gets or sets a value indicating whether the video is passed through. |
| IsAudioDirect | boolean |  |  | Gets or sets a value indicating whether the audio is passed through. |
| Bitrate | integer (int32) (nullable) |  |  | Gets or sets the bitrate. |
| Framerate | number (float) (nullable) |  |  | Gets or sets the framerate. |
| CompletionPercentage | number (double) (nullable) |  |  | Gets or sets the completion percentage. |
| Width | integer (int32) (nullable) |  |  | Gets or sets the video width. |
| Height | integer (int32) (nullable) |  |  | Gets or sets the video height. |
| AudioChannels | integer (int32) (nullable) |  |  | Gets or sets the audio channels. |
| HardwareAccelerationType | HardwareAccelerationType (nullable) |  | enum: none / amf / qsv / nvenc / v4l2m2m / vaapi / videotoolbox / rkmpp | Gets or sets the hardware acceleration type. |
| TranscodeReasons | TranscodeReason[] |  | enum: ContainerNotSupported / VideoCodecNotSupported / AudioCodecNotSupported / SubtitleCodecNotSupported / AudioIsExternal / SecondaryAudioNotSupported / VideoProfileNotSupported / VideoLevelNotSupported / VideoResolutionNotSupported / VideoBitDepthNotSupported / VideoFramerateNotSupported / RefFramesNotSupported / AnamorphicVideoNotSupported / InterlacedVideoNotSupported / AudioChannelsNotSupported / AudioProfileNotSupported / AudioSampleRateNotSupported / AudioBitDepthNotSupported / ContainerBitrateExceedsLimit / VideoBitrateNotSupported / AudioBitrateNotSupported / UnknownVideoStreamInfo / UnknownAudioStreamInfo / DirectPlayError / VideoRangeTypeNotSupported / VideoCodecTagNotSupported / StreamCountExceedsLimit | Gets or sets the transcode reasons. |

### TunerChannelMapping

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Name | string (nullable) |  |  |  |
| ProviderChannelName | string (nullable) |  |  |  |
| ProviderChannelId | string (nullable) |  |  |  |
| Id | string (nullable) |  |  |  |

### TypeOptions

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Type | string (nullable) |  |  |  |
| MetadataFetchers | string[] (nullable) |  |  |  |
| MetadataFetcherOrder | string[] (nullable) |  |  |  |
| ImageFetchers | string[] (nullable) |  |  |  |
| ImageFetcherOrder | string[] (nullable) |  |  |  |
| ImageOptions | ImageOption[] (nullable) |  |  |  |

### UpdateLibraryOptionsDto

Update library options dto.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Id | string (uuid) |  |  | Gets or sets the library item id. |
| LibraryOptions | LibraryOptions (nullable) |  |  | Gets or sets library options. |

### UpdateMediaPathRequestDto

Update library options dto.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Name | string | yes |  | Gets or sets the library name. |
| PathInfo | MediaPathInfo | yes |  | Gets or sets library folder path information. |

### UpdateUserItemDataDto

This is used by the api to get information about a item user data.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Rating | number (double) (nullable) |  |  | Gets or sets the rating. |
| PlayedPercentage | number (double) (nullable) |  |  | Gets or sets the played percentage. |
| UnplayedItemCount | integer (int32) (nullable) |  |  | Gets or sets the unplayed item count. |
| PlaybackPositionTicks | integer (int64) (nullable) |  |  | Gets or sets the playback position ticks. |
| PlayCount | integer (int32) (nullable) |  |  | Gets or sets the play count. |
| IsFavorite | boolean (nullable) |  |  | Gets or sets a value indicating whether this instance is favorite. |
| Likes | boolean (nullable) |  |  | Gets or sets a value indicating whether this MediaBrowser.Model.Dto.UpdateUserItemDataDto is likes. |
| LastPlayedDate | string (date-time) (nullable) |  |  | Gets or sets the last played date. |
| Played | boolean (nullable) |  |  | Gets or sets a value indicating whether this MediaBrowser.Model.Dto.UserItemDataDto is played. |
| Key | string (nullable) |  |  | Gets or sets the key. |
| ItemId | string (nullable) |  |  | Gets or sets the item identifier. |

### UpdateUserPassword

The update user password request body.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| CurrentPassword | string (nullable) |  |  | Gets or sets the current sha1-hashed password. |
| CurrentPw | string (nullable) |  |  | Gets or sets the current plain text password. |
| NewPw | string (nullable) |  |  | Gets or sets the new plain text password. |
| ResetPassword | boolean |  |  | Gets or sets a value indicating whether to reset the password. |

### UploadSubtitleDto

Upload subtitles dto.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Language | string | yes |  | Gets or sets the subtitle language. |
| Format | string | yes |  | Gets or sets the subtitle format. |
| IsForced | boolean | yes |  | Gets or sets a value indicating whether the subtitle is forced. |
| IsHearingImpaired | boolean | yes |  | Gets or sets a value indicating whether the subtitle is for hearing impaired. |
| Data | string | yes |  | Gets or sets the subtitle data. |

### UserDto

Class UserDto.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Name | string (nullable) |  |  | Gets or sets the name. |
| ServerId | string (nullable) |  |  | Gets or sets the server identifier. |
| ServerName | string (nullable) |  |  | Gets or sets the name of the server. This is not used by the server and is for client-side usage only. |
| Id | string (uuid) |  |  | Gets or sets the id. |
| PrimaryImageTag | string (nullable) |  |  | Gets or sets the primary image tag. |
| HasPassword | boolean |  |  | Gets or sets a value indicating whether this instance has password. |
| HasConfiguredPassword | boolean |  |  | Gets or sets a value indicating whether this instance has configured password. |
| HasConfiguredEasyPassword | boolean |  |  | Gets or sets a value indicating whether this instance has configured easy password. |
| EnableAutoLogin | boolean (nullable) |  |  | Gets or sets whether async login is enabled or not. |
| LastLoginDate | string (date-time) (nullable) |  |  | Gets or sets the last login date. |
| LastActivityDate | string (date-time) (nullable) |  |  | Gets or sets the last activity date. |
| Configuration | UserConfiguration (nullable) |  |  | Gets or sets the configuration. |
| Policy | UserPolicy (nullable) |  |  | Gets or sets the policy. |
| PrimaryImageAspectRatio | number (double) (nullable) |  |  | Gets or sets the primary image aspect ratio. |

### ValidatePathDto

Validate path object.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| ValidateWritable | boolean |  |  | Gets or sets a value indicating whether validate if path is writable. |
| Path | string (nullable) |  |  | Gets or sets the path. |
| IsFile | boolean (nullable) |  |  | Gets or sets is path file. |

### VersionInfo

Defines the MediaBrowser.Model.Updates.VersionInfo class.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| version | string |  |  | Gets or sets the version. |
| VersionNumber | string |  |  | Gets the version as a System.Version. |
| changelog | string (nullable) |  |  | Gets or sets the changelog for this version. |
| targetAbi | string (nullable) |  |  | Gets or sets the ABI that this version was built against. |
| sourceUrl | string (nullable) |  |  | Gets or sets the source URL. |
| checksum | string (nullable) |  |  | Gets or sets a checksum for the binary. |
| timestamp | string (nullable) |  |  | Gets or sets a timestamp of when the binary was built. |
| repositoryName | string |  |  | Gets or sets the repository name. |
| repositoryUrl | string |  |  | Gets or sets the repository url. |

### VirtualFolderInfo

Used to hold information about a user's list of configured virtual folders.

| Field | Type | Req | Notes | Description |
|---|---|---|---|---|
| Name | string (nullable) |  |  | Gets or sets the name. |
| Locations | string[] (nullable) |  |  | Gets or sets the locations. |
| CollectionType | CollectionTypeOptions (nullable) |  | enum: movies / tvshows / music / musicvideos / homevideos / boxsets / books / mixed | Gets or sets the type of the collection. |
| LibraryOptions | LibraryOptions (nullable) |  |  |  |
| ItemId | string (nullable) |  |  | Gets or sets the item identifier. |
| PrimaryImageItemId | string (nullable) |  |  | Gets or sets the primary image item identifier. |
| RefreshProgress | number (double) (nullable) |  |  |  |
| RefreshStatus | string (nullable) |  |  |  |

## Enum glossary

| Enum | Values | Description |
|---|---|---|
| CollectionType | unknown / movies / tvshows / music / musicvideos / trailers / homevideos / boxsets / books / photos / livetv / playlists / folders | Collection type. |
| CollectionTypeOptions | movies / tvshows / music / musicvideos / homevideos / boxsets / books / mixed | The collection type options. |
| DayOfWeek | Sunday / Monday / Tuesday / Wednesday / Thursday / Friday / Saturday |  |
| DeinterlaceMethod | yadif / bwdif | Enum containing deinterlace methods. |
| DownMixStereoAlgorithms | None / Dave750 / NightmodeDialogue / Rfc7845 / Ac4 | An enum representing an algorithm to downmix surround sound to stereo. |
| DynamicDayOfWeek | Sunday / Monday / Tuesday / Wednesday / Thursday / Friday / Saturday / Everyday / Weekday / Weekend | An enum that represents a day of the week, weekdays, weekends, or all days. |
| EmbeddedSubtitleOptions | AllowAll / AllowText / AllowImage / AllowNone | An enum representing the options to disable embedded subs. |
| EncoderPreset | auto / placebo / veryslow / slower / slow / medium / fast / faster / veryfast / superfast / ultrafast | Enum containing encoder presets. |
| ExternalIdMediaType | Album / AlbumArtist / Artist / BoxSet / Episode / Movie / OtherArtist / Person / ReleaseGroup / Season / Series / Track / Book / Recording | The specific media type of an MediaBrowser.Model.Providers.ExternalIdInfo. |
| FileSystemEntryType | File / Directory / NetworkComputer / NetworkShare | Enum FileSystemEntryType. |
| ForgotPasswordAction | ContactAdmin / PinCode / InNetworkRequired |  |
| GeneralCommandType | MoveUp / MoveDown / MoveLeft / MoveRight / PageUp / PageDown / PreviousLetter / NextLetter / ToggleOsd / ToggleContextMenu / Select / Back / TakeScreenshot / SendKey / SendString / GoHome / GoToSettings / VolumeUp / VolumeDown / Mute / Unmute / ToggleMute / SetVolume / SetAudioStreamIndex / SetSubtitleStreamIndex / ToggleFullscreen / DisplayContent / GoToSearch / DisplayMessage / SetRepeatMode / ChannelUp / ChannelDown / Guide / ToggleStats / PlayMediaSource / PlayTrailers / SetShuffleQueue / PlayState / PlayNext / ToggleOsdMenu / Play / SetMaxStreamingBitrate / SetPlaybackOrder | This exists simply to identify a set of known commands. |
| HardwareAccelerationType | none / amf / qsv / nvenc / v4l2m2m / vaapi / videotoolbox / rkmpp | Enum containing hardware acceleration types. |
| ImageResolution | MatchSource / P144 / P240 / P360 / P480 / P720 / P1080 / P1440 / P2160 | Enum ImageResolution. |
| ImageSavingConvention | Legacy / Compatible |  |
| ImageType | Primary / Art / Backdrop / Banner / Logo / Thumb / Disc / Box / Screenshot / Menu / Chapter / BoxRear / Profile | Enum ImageType. |
| ItemFields | AirTime / CanDelete / CanDownload / ChannelInfo / Chapters / Trickplay / ChildCount / CumulativeRunTimeTicks / CustomRating / DateCreated / DateLastMediaAdded / DisplayPreferencesId / Etag / ExternalUrls / Genres / ItemCounts / MediaSourceCount / MediaSources / OriginalTitle / Overview / ParentId / Path / People / PlayAccess / ProductionLocations / ProviderIds / PrimaryImageAspectRatio / RecursiveItemCount / Settings / SeriesStudio / SortName / SpecialEpisodeNumbers / Studios / Taglines / Tags / RemoteTrailers / MediaStreams / SeasonUserData / DateLastRefreshed / DateLastSaved / RefreshState / ChannelImage / EnableMediaSourceDisplay / Width / Height / ExtraIds / LocalTrailerCount / IsHD / SpecialFeatureCount | Used to control the data that gets attached to DtoBaseItems. |
| ItemSortBy | Default / AiredEpisodeOrder / Album / AlbumArtist / Artist / DateCreated / OfficialRating / DatePlayed / PremiereDate / StartDate / SortName / Name / Random / Runtime / CommunityRating / ProductionYear / PlayCount / CriticRating / IsFolder / IsUnplayed / IsPlayed / SeriesSortName / VideoBitRate / AirTime / Studio / IsFavoriteOrLiked / DateLastContentAdded / SeriesDatePlayed / ParentIndexNumber / IndexNumber | These represent sort orders. |
| LogLevel | Trace / Debug / Information / Warning / Error / Critical / None |  |
| MediaSegmentType | Unknown / Commercial / Preview / Recap / Outro / Intro | Defines the types of content an individual Jellyfin.Database.Implementations.Entities.MediaSegment represents. |
| MediaType | Unknown / Video / Audio / Photo / Book | Media types. |
| PlayMethod | Transcode / DirectStream / DirectPlay |  |
| PlaybackOrder | Default / Shuffle | Enum PlaybackOrder. |
| PluginStatus | Active / Restart / Deleted / Superseded / Superceded / Malfunctioned / NotSupported / Disabled | Plugin load status. |
| ProcessPriorityClass | Normal / Idle / High / RealTime / BelowNormal / AboveNormal |  |
| RepeatMode | RepeatNone / RepeatAll / RepeatOne |  |
| ScrollDirection | Horizontal / Vertical | An enum representing the axis that should be scrolled. |
| SortOrder | Ascending / Descending | An enum representing the sorting order. |
| SubtitlePlaybackMode | Default / Always / OnlyForced / None / Smart | An enum representing a subtitle playback mode. |
| SyncPlayUserAccessType | CreateAndJoinGroups / JoinGroups / None | Enum SyncPlayUserAccessType. |
| TaskCompletionStatus | Completed / Failed / Cancelled / Aborted | Enum TaskCompletionStatus. |
| TaskState | Idle / Cancelling / Running | Enum TaskState. |
| TaskTriggerInfoType | DailyTrigger / WeeklyTrigger / IntervalTrigger / StartupTrigger | Enum TaskTriggerInfoType. |
| TonemappingAlgorithm | none / clip / linear / gamma / reinhard / hable / mobius / bt2390 | Enum containing tonemapping algorithms. |
| TonemappingMode | auto / max / rgb / lum / itp | Enum containing tonemapping modes. |
| TonemappingRange | auto / tv / pc | Enum containing tonemapping ranges. |
| TranscodeReason | ContainerNotSupported / VideoCodecNotSupported / AudioCodecNotSupported / SubtitleCodecNotSupported / AudioIsExternal / SecondaryAudioNotSupported / VideoProfileNotSupported / VideoLevelNotSupported / VideoResolutionNotSupported / VideoBitDepthNotSupported / VideoFramerateNotSupported / RefFramesNotSupported / AnamorphicVideoNotSupported / InterlacedVideoNotSupported / AudioChannelsNotSupported / AudioProfileNotSupported / AudioSampleRateNotSupported / AudioBitDepthNotSupported / ContainerBitrateExceedsLimit / VideoBitrateNotSupported / AudioBitrateNotSupported / UnknownVideoStreamInfo / UnknownAudioStreamInfo / DirectPlayError / VideoRangeTypeNotSupported / VideoCodecTagNotSupported / StreamCountExceedsLimit |  |
| TrickplayScanBehavior | Blocking / NonBlocking | Enum TrickplayScanBehavior. |
| UnratedItem | Movie / Trailer / Series / Music / Book / LiveTvChannel / LiveTvProgram / ChannelContent / Other | An enum representing an unrated item. |

# D. WebSocket messages

The spec defines the envelope (`WebSocketMessage`, discriminator `MessageType`, plus `MessageId`, `Data`) and two unions: `InboundWebSocketMessage` (client to server) and `OutboundWebSocketMessage` (server to client). The WebSocket endpoint path is not in the OpenAPI document. Server source: `WebSocketHandlerMiddleware` (`Jellyfin.Api/Middleware/`) does not match a path; it hands every request with `IsWebSocketRequest` to `WebSocketManager.WebSocketRequestHandler` (`Emby.Server.Implementations/HttpServer/WebSocketManager.cs`), which runs `IAuthService.Authenticate` and throws "Token is required" if not authenticated. The token is read by `AuthorizationContext` from the `Authorization` header (`MediaBrowser Token="..."`), or the `ApiKey` / `api_key` query string (legacy `X-Emby-Token` / `X-MediaBrowser-Token` headers only when legacy authorization is enabled; the exact legacy gating was summarised by a fetch tool, treat as unverified). Official clients connect to `/socket?api_key=<token>&deviceId=<id>` (the path itself is client convention, not confirmed in the files read). Browsers cannot set headers on a WebSocket, so use the query string. Server push listeners: `Jellyfin.Api/WebSocketListeners/{ActivityLog,ScheduledTasks,SessionInfo}WebSocketListener.cs`. Message type enum: `SessionMessageType`.

## Inbound (client sends)

| MessageType | Model | Data | Description |
|---|---|---|---|
| ActivityLogEntryStart | ActivityLogEntryStartMessage | string - Gets or sets the data. | Activity log entry start message. Data is the timing data encoded as "$initialDelay,$interval" in ms. |
| ActivityLogEntryStop | ActivityLogEntryStopMessage | - | Activity log entry stop message. |
| KeepAlive | InboundKeepAliveMessage | - | Keep alive websocket messages. |
| ScheduledTasksInfoStart | ScheduledTasksInfoStartMessage | string - Gets or sets the data. | Scheduled tasks info start message. Data is the timing data encoded as "$initialDelay,$interval" in ms. |
| ScheduledTasksInfoStop | ScheduledTasksInfoStopMessage | - | Scheduled tasks info stop message. |
| SessionsStart | SessionsStartMessage | string - Gets or sets the data. | Sessions start message. Data is the timing data encoded as "$initialDelay,$interval" in ms. |
| SessionsStop | SessionsStopMessage | - | Sessions stop message. |

## Outbound (server sends)

| MessageType | Model | Data | Description |
|---|---|---|---|
| ActivityLogEntry | ActivityLogEntryMessage | ActivityLogEntry[] - Gets or sets the data. | Activity log created message. |
| ForceKeepAlive | ForceKeepAliveMessage | integer (int32) - Gets or sets the data. | Force keep alive websocket messages. |
| GeneralCommand | GeneralCommandMessage | GeneralCommand - Gets or sets the data. | General command websocket message. |
| LibraryChanged | LibraryChangedMessage | LibraryUpdateInfo - Class LibraryUpdateInfo. | Library changed message. |
| KeepAlive | OutboundKeepAliveMessage | - | Keep alive websocket messages. |
| Play | PlayMessage | PlayRequest - Class PlayRequest. | Play command websocket message. |
| Playstate | PlaystateMessage | PlaystateRequest - Gets or sets the data. | Playstate message. |
| PackageInstallationCancelled | PluginInstallationCancelledMessage | InstallationInfo - Class InstallationInfo. | Plugin installation cancelled message. |
| PackageInstallationCompleted | PluginInstallationCompletedMessage | InstallationInfo - Class InstallationInfo. | Plugin installation completed message. |
| PackageInstallationFailed | PluginInstallationFailedMessage | InstallationInfo - Class InstallationInfo. | Plugin installation failed message. |
| PackageInstalling | PluginInstallingMessage | InstallationInfo - Class InstallationInfo. | Package installing message. |
| PackageUninstalled | PluginUninstalledMessage | PluginInfo - This is a serializable stub class that is used by the api to provide information about installed plugins. | Plugin uninstalled message. |
| RefreshProgress | RefreshProgressMessage | map<string, string> - Gets or sets the data. | Refresh progress message. |
| RestartRequired | RestartRequiredMessage | - | Restart required. |
| ScheduledTaskEnded | ScheduledTaskEndedMessage | TaskResult - Class TaskExecutionInfo. | Scheduled task ended message. |
| ScheduledTasksInfo | ScheduledTasksInfoMessage | TaskInfo[] - Gets or sets the data. | Scheduled tasks info message. |
| SeriesTimerCancelled | SeriesTimerCancelledMessage | TimerEventInfo - Gets or sets the data. | Series timer cancelled message. |
| SeriesTimerCreated | SeriesTimerCreatedMessage | TimerEventInfo - Gets or sets the data. | Series timer created message. |
| ServerRestarting | ServerRestartingMessage | - | Server restarting down message. |
| ServerShuttingDown | ServerShuttingDownMessage | - | Server shutting down message. |
| Sessions | SessionsMessage | SessionInfoDto[] - Gets or sets the data. | Sessions message. |
| SyncPlayCommand | SyncPlayCommandMessage | SendCommand - Class SendCommand. | Sync play command. |
| TimerCancelled | TimerCancelledMessage | TimerEventInfo - Gets or sets the data. | Timer cancelled message. |
| TimerCreated | TimerCreatedMessage | TimerEventInfo - Gets or sets the data. | Timer created message. |
| UserDataChanged | UserDataChangedMessage | UserDataChangeInfo - Class UserDataChangeInfo. | User data changed message. |
| UserDeleted | UserDeletedMessage | string (uuid) - Gets or sets the data. | User deleted message. |
| UserUpdated | UserUpdatedMessage | UserDto - Class UserDto. | User updated message. |
| SyncPlayGroupUpdate | SyncPlayGroupUpdateMessage | GroupUpdate - Group update data | Untyped sync play command. |

Dashboard-relevant: subscribe with `SessionsStart` / `ScheduledTasksInfoStart` / `ActivityLogEntryStart` (the Data of the Start message carries the interval string described above), receive `Sessions`, `ScheduledTasksInfo`, `ActivityLogEntry`; server lifecycle: `RestartRequired`, `ServerRestarting`, `ServerShuttingDown`; plugin install progress: `PackageInstalling`, `PackageInstallationCompleted`, `PackageInstallationFailed`, `PackageInstallationCancelled`, `PackageUninstalled`; also `ScheduledTaskEnded`, `RefreshProgress`, `LibraryChanged`, `UserUpdated`, `UserDeleted`, `UserDataChanged`, `TimerCreated`/`TimerCancelled`/`SeriesTimerCreated`/`SeriesTimerCancelled`. Keep-alive: `KeepAlive` both ways, `ForceKeepAlive` from the server.

# E. Destructive or dangerous operations

Gate these behind a confirmation dialog. Reasons are taken from the operation summaries where the spec says so, otherwise from the operation semantics (general knowledge, not spec text).

| HTTP | SDK | Policy | Why |
|---|---|---|---|
| `DELETE /Audio/{itemId}/Lyrics` | `LyricApi.deleteLyrics` | LyricManagement | Deletes the lyrics file. |
| `POST /Auth/Keys` | `AuthenticationApi.createKey` | RequiresElevation | Creates an API key (grants whatever access the key allows to anyone holding it). |
| `DELETE /Auth/Keys/{key}` | `AuthenticationApi.revokeKey` | RequiresElevation | Revokes an API key; clients using it stop working immediately. |
| `POST /Backup/Create` | `BackupApi.createBackup` | RequiresElevation | Writes a backup archive to the server disk (size depends on options). |
| `POST /Backup/Restore` | `BackupApi.startRestoreBackup` | RequiresElevation | Restores a backup over the current server data; overwrites existing configuration/database. |
| `DELETE /Branding/Splashscreen` | `ImageApi.deleteCustomSplashscreen` | RequiresElevation | Deletes the custom splashscreen. |
| `DELETE /Collections/{collectionId}/Items` | `CollectionApi.removeFromCollection` | CollectionManagement | Removes items from a collection (items themselves stay). |
| `DELETE /Devices` | `DeviceApi.deleteDevice` | RequiresElevation | Removes a device and invalidates its access tokens (the device must sign in again). |
| `POST /Devices/Options` | `DeviceApi.updateDeviceOptions` | RequiresElevation | Changes a device's custom name. |
| `DELETE /Items` | `LibraryApi.deleteItems` | DefaultAuthorization | Bulk delete of items and, where permitted, their files from disk. Cannot be undone. |
| `POST /Items/{itemId}` | `ItemUpdateApi.updateItem` | RequiresElevation | Overwrites item metadata. |
| `DELETE /Items/{itemId}` | `LibraryApi.deleteItem` | DefaultAuthorization | Deletes the item and, where the server has permission, its media files from disk. Cannot be undone. |
| `POST /Items/{itemId}/ContentType` | `ItemUpdateApi.updateItemContentType` | RequiresElevation | Changes the item content type. |
| `DELETE /Items/{itemId}/Images/{imageType}` | `ImageApi.deleteItemImage` | RequiresElevation | Deletes an item image. |
| `DELETE /Items/{itemId}/Images/{imageType}/{imageIndex}` | `ImageApi.deleteItemImageByIndex` | RequiresElevation | Deletes an item image. |
| `POST /Items/{itemId}/Refresh` | `LibraryApi.refreshItem` | RequiresElevation | Refreshes metadata; with replace-all options it overwrites edited metadata and images. |
| `POST /Items/RemoteSearch/Apply/{itemId}` | `ItemLookupApi.applySearchCriteria` | RequiresElevation | Replaces item metadata with the chosen remote result (overwrites edits). |
| `POST /Library/Refresh` | `LibraryApi.refreshLibrary` | RequiresElevation | Starts a full library scan. |
| `POST /Library/VirtualFolders` | `LibraryStructureApi.addVirtualFolder` | FirstTimeSetupOrElevated | Creates a library and starts a scan. |
| `DELETE /Library/VirtualFolders` | `LibraryStructureApi.removeVirtualFolder` | FirstTimeSetupOrElevated | Removes a library from Jellyfin (media files on disk stay). |
| `POST /Library/VirtualFolders/LibraryOptions` | `LibraryStructureApi.updateLibraryOptions` | FirstTimeSetupOrElevated | Changes library options (metadata savers, real-time monitoring, scan behaviour). |
| `POST /Library/VirtualFolders/Paths` | `LibraryStructureApi.addMediaPath` | FirstTimeSetupOrElevated | Adds a path to a library and triggers a scan. |
| `DELETE /Library/VirtualFolders/Paths` | `LibraryStructureApi.removeMediaPath` | FirstTimeSetupOrElevated | Removes a path from a library; its items disappear from the library. |
| `POST /LiveTv/ChannelMappings` | `LiveTvApi.setChannelMapping` | RequiresElevation | Changes channel mappings. |
| `DELETE /LiveTv/ListingProviders` | `LiveTvApi.deleteListingProvider` | RequiresElevation | Deletes a Live TV listing provider. |
| `DELETE /LiveTv/Recordings/{recordingId}` | `LiveTvApi.deleteRecording` | LiveTvManagement | Deletes a recording from disk. |
| `DELETE /LiveTv/SeriesTimers/{timerId}` | `LiveTvApi.cancelSeriesTimer` | LiveTvManagement | Cancels a series recording timer. |
| `DELETE /LiveTv/Timers/{timerId}` | `LiveTvApi.cancelTimer` | LiveTvManagement | Cancels a recording timer. |
| `DELETE /LiveTv/TunerHosts` | `LiveTvApi.deleteTunerHost` | RequiresElevation | Deletes a Live TV tuner host. |
| `POST /LiveTv/Tuners/{tunerId}/Reset` | `LiveTvApi.resetTuner` | RequiresElevation | Resets a tuner (interrupts recordings/streams). |
| `POST /Packages/Installed/{name}` | `PluginApi.installPackage` | RequiresElevation | Installs/updates a plugin from a repository (third-party code; restart required). |
| `DELETE /Packages/Installing/{packageId}` | `PluginApi.cancelPackageInstallation` | RequiresElevation | Cancels an install in progress. |
| `DELETE /Plugins/{pluginId}` | `PluginApi.uninstallPlugin` | RequiresElevation | Uninstalls a plugin (restart required). |
| `DELETE /Plugins/{pluginId}/{version}` | `PluginApi.uninstallPluginByVersion` | RequiresElevation | Uninstalls a plugin version. |
| `POST /Plugins/{pluginId}/{version}/Disable` | `PluginApi.disablePlugin` | RequiresElevation | Disables a plugin (restart required). |
| `POST /Plugins/{pluginId}/{version}/Enable` | `PluginApi.enablePlugin` | RequiresElevation | Enables a plugin (restart required). |
| `POST /Plugins/{pluginId}/Configuration` | `PluginApi.updatePluginConfiguration` | RequiresElevation | Overwrites plugin configuration. |
| `POST /Repositories` | `PluginApi.setRepositories` | RequiresElevation | Replaces the plugin repository list (trust decision: installs come from these repositories). |
| `POST /ScheduledTasks/{taskId}/Triggers` | `ScheduledTaskApi.updateTask` | RequiresElevation | Replaces the triggers of a scheduled task. |
| `POST /ScheduledTasks/Running/{taskId}` | `ScheduledTaskApi.startTask` | RequiresElevation | Starts a scheduled task (may be long running / CPU heavy). |
| `DELETE /ScheduledTasks/Running/{taskId}` | `ScheduledTaskApi.stopTask` | RequiresElevation | Stops a running scheduled task (library scan, etc.). |
| `DELETE /Videos/ActiveEncodings` | `StopEncodingProcess` (SDK method not looked up) | DefaultAuthorization | Kills a device's running transcode jobs (any signed-in user; spec). |
| `POST /Items/{itemId}/Images/{imageType}` (and `.../{imageIndex}`) | `ImageApi.setItemImage` / `setItemImageByIndex` | RequiresElevation | Replaces an item image. |
| `POST /Items/{itemId}/RemoteImages/Download` | `RemoteImageApi.downloadRemoteImage` | RequiresElevation | Replaces an item image with a remote download. |
| `POST /Library/VirtualFolders/Name` | `LibraryStructureApi.renameVirtualFolder` | FirstTimeSetupOrElevated | Renames a library (changes its folder on disk). |
| `POST /Library/VirtualFolders/Paths/Update` | `LibraryStructureApi.updateMediaPath` | FirstTimeSetupOrElevated | Changes a library path (network credentials). |
| `POST /Branding/Splashscreen` | `ImageApi.uploadCustomSplashscreen` | RequiresElevation | Overwrites the custom splashscreen. |
| `POST /LiveTv/TunerHosts` | `LiveTvApi.addTunerHost` | RequiresElevation | Adds or overwrites a tuner host. |
| `POST /LiveTv/ListingProviders` | `LiveTvApi.addListingProvider` | RequiresElevation | Adds or overwrites a listing provider (carries credentials). |
| `POST /Sessions/Logout` | `SessionApi.reportSessionEnded` | DefaultAuthorization | Ends the calling session. |
| `POST /Startup/Complete` | `StartupApi.completeWizard` | FirstTimeSetupOrElevated | Marks first-run setup complete. |
| `POST /Startup/Configuration` | `StartupApi.updateInitialConfiguration` | FirstTimeSetupOrElevated | Changes startup configuration during setup. |
| `POST /Startup/RemoteAccess` | `StartupApi.setRemoteAccess` | FirstTimeSetupOrElevated | Changes remote access / UPnP during setup. |
| `POST /Startup/User` | `StartupApi.updateStartupUser` | FirstTimeSetupOrElevated | Sets the first administrator account during setup. |
| `POST /System/Configuration` | `SystemApi.updateConfiguration` | RequiresElevation | Overwrites the whole server configuration. |
| `POST /System/Configuration/{key}` | `SystemApi.updateNamedConfiguration` | RequiresElevation | Overwrites a named configuration section (encoding, network, ...); wrong network values can lock admins out. |
| `POST /System/Configuration/Branding` | `SystemApi.updateBrandingConfiguration` | RequiresElevation | Overwrites branding (login disclaimer, custom CSS). |
| `POST /System/Restart` | `SystemApi.restartApplication` | LocalAccessOrRequiresElevation | Restarts the server (connections drop). |
| `POST /System/Shutdown` | `SystemApi.shutdownApplication` | RequiresElevation | Stops the server; it cannot be started again from the API. |
| `POST /Users` | `UserApi.updateUser` | DefaultAuthorization | Updates a user record (spec: DefaultAuthorization only). |
| `DELETE /Users/{userId}` | `UserApi.deleteUser` | RequiresElevation | Deletes a user account and its data. |
| `POST /Users/{userId}/Policy` | `UserApi.updateUserPolicy` | RequiresElevation | Changes a user's permissions (administrator flag, library access, disabled flag, remote access, ...). |
| `POST /Users/Configuration` | `UserApi.updateUserConfiguration` | DefaultAuthorization | Changes user settings. |
| `POST /Users/New` | `UserApi.createUserByName` | RequiresElevation | Creates a user. |
| `POST /Users/Password` | `UserApi.updateUserPassword` | DefaultAuthorization | Changes a password (own or, with reset, another user's). |
| `DELETE /Videos/{itemId}/AlternateSources` | `VideoApi.deleteAlternateSources` | RequiresElevation | Deletes alternate versions of a video. |
| `DELETE /Videos/{itemId}/Subtitles/{index}` | `SubtitleApi.deleteSubtitle` | RequiresElevation | Deletes a subtitle file from disk. |
| `POST /Videos/MergeVersions` | `VideoApi.mergeVersions` | RequiresElevation | Merges videos into one item with several versions (hard to reverse). |

# F. Spec versus SDK mismatches

Operations in the spec with no SDK method (25): `GetHlsAudioSegment` (GET /Audio/{itemId}/hls1/{playlistId}/{segmentId}.{container}); `GetVariantHlsAudioPlaylist` (GET /Audio/{itemId}/main.m3u8); `GetMasterHlsAudioPlaylist` (GET /Audio/{itemId}/master.m3u8); `HeadMasterHlsAudioPlaylist` (HEAD /Audio/{itemId}/master.m3u8); `GetHlsVideoSegment` (GET /Videos/{itemId}/hls1/{playlistId}/{segmentId}.{container}); `GetLiveHlsStream` (GET /Videos/{itemId}/live.m3u8); `GetVariantHlsVideoPlaylist` (GET /Videos/{itemId}/main.m3u8); `GetMasterHlsVideoPlaylist` (GET /Videos/{itemId}/master.m3u8); `HeadMasterHlsVideoPlaylist` (HEAD /Videos/{itemId}/master.m3u8); `GetNetworkShares` (GET /Environment/NetworkShares); `GetHlsAudioSegmentLegacyAac` (GET /Audio/{itemId}/hls/{segmentId}/stream.aac); `GetHlsAudioSegmentLegacyMp3` (GET /Audio/{itemId}/hls/{segmentId}/stream.mp3); `GetHlsVideoSegmentLegacy` (GET /Videos/{itemId}/hls/{playlistId}/{segmentId}.{segmentContainer}); `GetHlsPlaylistLegacy` (GET /Videos/{itemId}/hls/{playlistId}/stream.m3u8); `StopEncodingProcess` (DELETE /Videos/ActiveEncodings); `GetInstantMixFromArtists2` (GET /Artists/InstantMix); `GetCriticReviews` (GET /Items/{itemId}/CriticReviews); `GetRecordingGroups` (GET /LiveTv/Recordings/Groups); `GetRecordingGroup` (GET /LiveTv/Recordings/Groups/{groupId}); `GetRecordingsSeries` (GET /LiveTv/Recordings/Series); `GetMusicGenres` (GET /MusicGenres); `OnPlaybackStart` (POST /PlayingItems/{itemId}); `OnPlaybackStopped` (DELETE /PlayingItems/{itemId}); `OnPlaybackProgress` (POST /PlayingItems/{itemId}/Progress); `TmdbClientConfiguration` (GET /Tmdb/ClientConfiguration).

SDK methods with no matching spec operation id: `LibraryApi.getItemCollections`.
