# 05 — Playback

Scope: everything between "user pressed Play" and "user is back on a browse screen": item resolution, the PlaybackInfo handshake, the device profile, track selection, subtitles, session reporting, media segments, next-up/queue/cinema mode, trickplay, the controls overlay and key handling, live TV, trailers, the external player, error fallback, and every playback preference.

Part 1 describes what Wholphin does, with citations. Part 2 is the browser mapping. **Everything in Part 2 is recommendation, not fact about Wholphin.**

## Citation conventions

- `W/` = `reference/wholphin/app/src/main/java/com/github/damontecres/wholphin/`
- `T/` = `reference/wholphin/app/src/test/java/com/github/damontecres/wholphin/`
- `P/` = `reference/wholphin/app/src/main/proto/WholphinDataStore.proto`
- `path:N` or `path:N-M` are 1-based line numbers in the reference tree as read for this spec.
- **AMBIGUOUS** marks places where the Kotlin does not settle the behavior, or where it looks like a bug the port should not copy blindly.

## Key files

| Concern | File(s) |
|---|---|
| Orchestration, state machine | `W/ui/playback/PlaybackViewModel.kt` (1762 lines) |
| Screen composition, dialogs, next-up, skip button | `W/ui/playback/PlaybackPage.kt` |
| Overlay / controls | `W/ui/playback/overlay/PlaybackOverlay.kt`, `PlaybackController.kt`, `PlaybackControls.kt`, `SeekBar.kt`, `SeekBarState.kt` |
| Keys | `W/ui/playback/PlaybackKeyHandler.kt`, `KeyIdentifier.kt`, `SeekAcceleration.kt` |
| Dialogs and media session | `W/ui/playback/PlaybackDialog.kt` (Settings/Captions/Audio/speed/scale/bitrate dialogs, left/right gravity), `W/ui/playback/MediaSessionPlayer.kt` (media-session play applies skipBackOnResume) |
| External player, refresh rate | `W/ui/playback/PlayExternalPage.kt`, `W/services/RefreshRateService.kt` |
| Subtitle search, delay, styling | `W/ui/playback/SubtitleSearchUtils.kt`, `DownloadSubtitlesDialog.kt`, `SubtitleDelay.kt`, `W/ui/preferences/subtitle/SubtitleSettings.kt`, `SubtitleStylePage.kt` |
| Overlay pieces | `overlay/DpadSeekOverlay.kt`, `TrickplayPreview.kt`, `SeekPreviewImage.kt`, `PlaybackDebugOverlay.kt`, `SkipSegmentButton.kt` |
| Track choice | `W/services/StreamChoiceService.kt`, `W/ui/playback/TrackSelectionUtils.kt`, `TracksChangedListener.kt`, `W/data/ItemPlaybackRepository.kt` |
| Device profile | `W/services/DeviceProfileService.kt`, `W/util/profile/DeviceProfileUtils.kt`, `W/util/mpv/MpvDeviceProfile.kt` |
| Player construction | `W/services/PlayerFactory.kt` |
| Session reporting | `W/util/TrackActivityPlaybackListener.kt` |
| Queue building | `W/services/PlaylistCreator.kt` |
| Prefs | `P/` (schema), `W/preferences/AppPreference.kt` (UI defaults/ranges), `W/preferences/AppPreferencesSerializer.kt` (stored defaults) |

---

# Part 1 — What Wholphin does

## 1. Entry points and destinations

Two navigation destinations start playback (`W/ui/nav/Destination.kt:88-108`):

```kotlin
Playback(itemId: UUID, positionMs: Long, forceTranscoding: Boolean = false,
         backend: PlayerBackend? = null, shuffle: Boolean = false)
PlaybackList(itemId: UUID, filter: GetItemsFilter = GetItemsFilter(), startIndex: Int? = null,
             shuffle: Boolean = false, recursive: Boolean = false, sortAndDirection: SortAndDirection? = null)
```

- `Playback(item: BaseItem)` sets `positionMs = item.resumeMs`, which is `userData.playbackPositionTicks` converted to ms (`W/data/model/BaseItem.kt:94-96`). **No skip-back is applied on startup.** See §1.4.
- The context menu offers Resume (`resumeMs`) or Restart (`0`) when there is a resume point, otherwise Play (`0`) (`W/ui/components/ContextMenu.kt:365-404`). A "Play with…" sub-dialog lists every backend except PREFER_MPV, plus "Transcoding", which sets `forceTranscoding = true` (`ContextMenu.kt:304-316`, `657-684`).
- Any item with an `extraType`, and trailers, open as `Playback(id, 0)` through `BaseItem.destination()` (`BaseItem.kt:273-277`). The one exception is a single-extra card in the Extras row, which resumes (§11). `TV_CHANNEL` opens as `Playback(id, 0)`. `PROGRAM` opens as `Playback(channelId, 0)`; with no `channelId` it opens its MediaItem page instead (`BaseItem.kt:307-324`).
- Context-menu entries Resume/Restart/Play and "Play with…" appear only for `item.type in supportedPlayableTypes` (Movie, Episode, Video, MusicVideo, TvChannel, TvProgram, Recording, Season, Series, BoxSet, Playlist; `W/util/Constants.kt:40-52`). "Play with…" always starts at `item.resumeMs`, not 0. "Shuffle" appears for Season, Series, BoxSet and Playlist (`Constants.kt:54-61`) and navigates to `PlaybackList(itemId, shuffle = true)` (`ContextMenu.kt:361-423`, `634-643`).
- Routing: if the effective backend is `EXTERNAL_PLAYER`, `PlayExternalPage` is shown instead of `PlaybackPage`. The effective backend is `destination.backend ?: prefs.playerBackend` for `Playback`, and `prefs.playerBackend` only for `PlaybackList` (`W/ui/nav/DestinationContent.kt:83-115`).

### 1.1 `init()` — item resolution and queue construction (`PlaybackViewModel.kt:293-430`)

1. Stop the music service and load prefs. `maxBitrate = prefs.maxBitrate.takeIf { > 0 } ?: DEFAULT_BITRATE`, which is 100×1024×1024 bps (`:296-304`, `AppPreference.kt:347-348`). Note that a "megabit" here is 1,048,576 bits.
2. If `refreshRateSwitching` is on, register `resetRefreshRate()` to run on ViewModel close (`:305-307`). The closeable is registered only for `refreshRateSwitching`; resolution-only switching never resets the display mode. **AMBIGUOUS**, likely a bug. The UI normally prevents that combination, because turning resolution switching on forces refresh-rate switching on (§13).
3. `controllerViewState.hideMilliseconds = prefs.controllerTimeoutMs` (`:308-309`).
4. Take `positionMs` and `forceTranscoding` from `Playback`. `PlaybackList` always uses 0 and false (`:315-332`).
5. `GET /Items/{itemId}` via `libraryApi.getItem` (`:334`).
6. If `type.playable` (`W/ui/playback/PlaybackConstants.kt:39-85`: Episode, Movie, MusicVideo, Trailer, Video, LiveTvChannel, LiveTvProgram, Program, Recording, TvChannel, TvProgram), the item itself is the first entry. Otherwise a queue is built with `PlaylistCreator.createFrom(...)`:
   - For `PlaybackList`: pass `startIndex`, sort, shuffle, recursive and filter.
   - For `Playback` with a non-playable item: call `createFrom(item, recursive = true, shuffled = destination.shuffle)`. `createFrom` never reads its `recursive` parameter (`PlaylistCreator.kt:157-323`); collections are always queried recursively and the other kinds ignore it. `Playback(shuffle = true)` is built only by `IntentService` deep links (`W/services/IntentService.kt:95-99`). Every in-app Shuffle (context menu, Series details) navigates to `PlaybackList(shuffle = true)`, which skips step 10 (`ContextMenu.kt:408-420`, `W/ui/detail/series/SeriesDetails.kt:229-231`).
   - An empty playlist shows a toast "Playlist is empty" and navigates back. An error sets `LoadingState.Error` (`:335-381`).
7. Start the controller-visibility debouncer (`:383`).
8. **Cinema mode.** If `positionMs == 0 && prefs.cinemaMode`, fetch `GET /Items/{firstItemId}/Intros?userId=` (`libraryApi.getIntros`). Prepend the results as `PlaylistItem.Intro` entries and make the first intro the first item (`:385-408`).
9. `play(firstItem, positionMs, forceTranscoding)`. If that returns false (unsupported type or no media source), call `playNextUp()` (`:410-418`).
10. If the destination is **not** `PlaybackList`, call `playlistCreator.createFrom(queriedItem)` and **append** the result to the playlist (`:420-429`). For an episode this gives "this episode and the following episodes of the series, up to 100". For a movie it gives "this movie and its additional parts".

**AMBIGUOUS.** For a `Playback` destination whose item is *not* playable (for example a Series "Play" or "Shuffle"), step 6 has already built a playlist, and step 10 appends a second `createFrom(queriedItem)` result. The queue will probably contain duplicates. For a Series this is two next-up runs; for a shuffled Series the second run is unshuffled, but that shuffled case is reachable only from intent deep links (see step 6). This looks like a latent bug, so the port should build the queue once.

Queue construction rules (`W/services/PlaylistCreator.kt:119-285`). `MAX_SIZE = 100` (`W/data/model/Playlist.kt:15`). Virtual (missing) items are excluded, and multi-part items expand through `GET /Videos/{id}/AdditionalParts`.

| Item type | Queue |
|---|---|
| Episode | `GET /Shows/{seriesId}/Episodes?startItemId={id}&limit=100` (random sort if shuffled), sliced from the start episode |
| Season | Shuffled: `/Shows/{seriesId}/Episodes?seasonId=…&sortBy=Random&limit=100`. Otherwise the season's episodes |
| Series | Shuffled: random episodes. Otherwise `GET /Shows/NextUp?seriesId=`, or the first episode if there is none, then episodes from it |
| Playlist | `/Items?parentId={playlistId}` with sort/filter (random if shuffled), `startIndex`, `limit=100` |
| BoxSet / CollectionFolder / UserView | Recursive `/Items?parentId=` over playable kinds for that collection type, with sort/filter |
| Movie / Video / MusicVideo / Trailer | `[item] + additional parts` |
| other | Error "Unsupported type" |

### 1.2 `play(playlistItem, positionMs)` (`PlaybackViewModel.kt:446-625`)

1. `resetSegmentState()`, clear subtitle cues, and invalidate the cached "date played" for the item (`:461-467`).
2. If `item.type !in supportItemKinds` (`W/util/Constants.kt:6-18`), show the toast "Unsupported type '<type>', skipping..." and return false (`:469-476`).
3. `isLiveTv = item.type == TV_CHANNEL` (`:480`). Only this exact kind is treated as live.
4. Load the remembered **`ItemPlayback`** row for (user, itemId) from Room. Use it only if `sourceId != null`; otherwise it is treated as null, so a stored row without a source has its `audioIndex`/`subtitleIndex` (including DISABLED and ONLY_FORCED) ignored, and selection falls through to STC and then the defaults (`:484-494`).
5. **Media source (version) choice**, skipped for live TV (`StreamChoiceService.kt:112-131`):
   - Use the source whose id equals `itemPlayback.sourceId`.
   - Otherwise use the source with the largest `width*height` of its first video stream.
   - No source and not live: toast "Item has no media sources, skipping..." and return false (`:513-520`).
6. Load the series/season track choices (`SeriesTrackChoice`, STC) for audio and subtitles (§2.3).
7. Build `SimpleVideoStream` from the first video stream (`:522-533`):
   - `hdr = videoRange == HDR || (videoRangeType != SDR && != UNKNOWN)`.
   - `is4k = width > 2560 || height > 1440`.
8. `createPlayer(hdr, is4k)` picks the backend (§12.1) and recreates the player only if the backend changed.
9. Build the UI stream lists. Subtitles are sorted with streams matching the server profile `subtitleLanguagePreference` first (`W/ui/playback/CurrentMediaInfo.kt:35-52`). Audio keeps server order (`:57-64`).
10. `chooseAudioStream`, then `chooseSubtitleStream`, which uses the chosen audio language (§2).
11. Trickplay: `item.trickplay[sourceId].values.firstOrNull()`, i.e. the **first** width in the map, not the best one. If it is present, all tile sheets are prefetched (§8).
12. Chapters come from `item.chapters`, sorted by start (`W/data/model/Chapter.kt:19-30`).
13. `changeStreams(item, audioIndex, subtitleIndex, positionMs = positionMs>0 ? positionMs : C.TIME_UNSET, sourceId, enableDirectPlay = !forceTranscoding, enableDirectStream = !forceTranscoding)`, then `player.prepare(); player.play()` (`:610-622`).
14. `listenForSegments(item.id)` (§6).

### 1.3 `changeStreams` — PlaybackInfo, play-method decision, URL (`PlaybackViewModel.kt:631-900`)

**Fast path.** If the current playback is the same item, its method is `DIRECT_PLAY`, `enableDirectPlay` is true and `maxBitrate` equals `state.maxBitrate`, try `changeStreamsDirectPlay` (§3). If that succeeds, stop here (`:646-659`). Everything below, including the refresh-rate switch (§12.4) and the creation of a new `TrackActivityPlaybackListener`, runs only on the full PlaybackInfo path.

**PlaybackInfo request.** `POST /Items/{itemId}/PlaybackInfo` (`mediaInfoApi.getPostedPlaybackInfo`) with this body (`:675-703`):

| Field | Value |
|---|---|
| `StartTimeTicks` | `null` (never sent; the position is applied client-side) |
| `DeviceProfile` | ExoPlayer: `DeviceProfileService.getOrCreateDeviceProfile(appPrefs, serverVersion)`. MPV: the static `mpvDeviceProfile` |
| `MaxAudioChannels` | `null` |
| `AudioStreamIndex` | chosen audio index (server index) or null in `play()`. Mid-playback it can be `-2` for the reason given on the next row |
| `SubtitleStreamIndex` | In `play()`: the chosen stream's index (`?.stream?.index`) or null when nothing was chosen. `ONLY_FORCED` is already resolved to a real stream inside `chooseSubtitleStream` (`:553-565`). On a mid-playback change: whatever `resolveSubtitleIndex` returns, i.e. a real index, or the **sentinel passed through unchanged** (`DISABLED = -2`), because it only rewrites `ONLY_FORCED` (`StreamChoiceService.kt:225-253`). `changeMaxBitrate` and `onPlayerError` resend `currentPlayback.audioIndex`/`subtitleIndex` raw. `CurrentPlayback` stores null as `TrackIndex.DISABLED` (`:810-811`), and after an in-place direct-play switch `subtitleIndex` can still be `ONLY_FORCED` (-3). So `-2`/`-3` can reach the server in both index fields (`:691-692`, `:1039-1047`, `:1441-1449`). **The port should map every negative value to null** before building `PlaybackInfoDto` |
| `MediaSourceId` | chosen source id (null for live TV) |
| `AlwaysBurnInSubtitleWhenTranscoding` | `false` |
| `MaxStreamingBitrate` | `maxBitrate.toInt()` |
| `EnableDirectPlay` | param |
| `EnableDirectStream` | param |
| `AllowVideoStreamCopy` | `= enableDirectStream` |
| `AllowAudioStreamCopy` | `= enableDirectStream` |
| `EnableTranscoding` | `true` |
| `AutoOpenLiveStream` | `true` |
| `UserId` | not set |

- If `response.errorCode != null`, show `LoadingState.Error(errorCode.serialName)` and stop (`:704-708`).
- Use `source = response.mediaSources.firstOrNull()`. If it is null (and there is no `errorCode`), `changeStreams` does nothing: no error state, no `setMediaItem`, and `loading` is never set to Success. `play()` still calls `prepare()`/`play()` on the old or empty player, so the page shows no error (`:709-710`, `:898-899`, `:610-622`). The port should treat this as an error.

**URL construction** (`:711-741`):
- `supportsDirectPlay`:
  - If `isRemote && path` is not blank, use `source.path` (for example a .strm URL).
  - Otherwise use `GET /Videos/{itemId}/stream?static=true&mediaSourceId={source.id}&liveStreamId={source.liveStreamId}&tag={source.eTag}&playSessionId={response.playSessionId}` (`videoApi.getVideoStreamUrl`). ExoPlayer authenticates media requests (stream URL and side-loaded external subtitles) with an `Authorization` header (MediaBrowser-style: client, version, deviceId, device, token) added by an OkHttp interceptor, not with a URL token (`W/services/hilt/AppModule.kt:101-129` `authOkHttpClient`, `W/services/PlayerFactory.kt:66`, `219-223` `OkHttpDataSource`). MPV receives no headers. Whether the Kotlin SDK URL helper also embeds a token was not checked. The web port must sign `<video>`/`<track>`/`<img>` URLs itself (`ApiKey` query).
- `supportsDirectStream`, or anything else: `api.createUrl(source.transcodingUrl)`. This is the server-provided relative HLS URL (master.m3u8 with the server's own parameters).
- Blank URL: error "Unable to get media URL from the server. Do you have permission to view and/or transcode?"

**Play method** = DIRECT_PLAY if `supportsDirectPlay`, else DIRECT_STREAM if `supportsDirectStream`, else TRANSCODE if `supportsTranscoding`, else throw (`:742-752`).

**External subtitle.** If the chosen subtitle stream has `deliveryMethod == EXTERNAL || isExternal` (`TrackSelectionUtils.kt:212-221`), it is attached as a side-loaded `SubtitleConfiguration` (`:757-774`):
- URI `api.createUrl(stream.deliveryUrl)`
- id `"e:{index}"`
- MIME from codec (`W/util/CodecUtils.kt`: ass/ssa→text/x-ssa, srt/subrip→application/x-subrip, vtt/webvtt→text/vtt, ttml, pgs/pgssub→application/pgs, dvbsub→vobsub)
- language, label = title, and selection flags forced/default

**MediaItem.** The MIME type is forced to m3u8 when `source.container == "hls"` and to mpd when it is `"dash"` (`:780-799`). Metadata comes from the item, with artwork = Primary image (series primary for episodes).

Then:
1. Refresh-rate switch, if enabled (§12.4).
2. Release the old `TrackActivityPlaybackListener`, which reports *stopped* for the old session, and attach a new one (§5).
3. Set `loading = Success` and `currentPlayback`.
4. `player.setMediaItem(mediaItem, positionMs)` (`:825-851`).
5. Attach a one-shot `TracksChangedListener` (`:870-893`):
   - **DIRECT_PLAY and (audioIndex or subtitleIndex is set):** apply both selections when tracks appear. On failure, `changeStreams(..., enableDirectPlay = false, enableDirectStream = true)`, i.e. retry as direct stream (remux).
   - **External subtitle (any method):** select only the subtitle; audio is not touched.
   - MPV special case: if the player is MPV and an external subtitle exists, a failed selection re-arms the listener instead of falling back, because MPV fires several track changes while adding external subs (`:852-869`).
6. If `subtitleIndex != null`, load the saved subtitle delay (§4.4).

### 1.4 Resume position and "skip back on resume"

- The start position is `positionMs` from the destination, which is the raw server resume point. It is applied with `setMediaItem(item, positionMs)`; `C.TIME_UNSET` means "start".
- **`skipBackOnResume` is not applied at startup.** It applies only when the user *un-pauses*:
  - on-screen Play button (`overlay/PlaybackControls.kt:434-443`)
  - one-click-pause Enter while controls are hidden (`PlaybackKeyHandler.kt:63-70`)
  - MediaSession play (remote media keys / Bluetooth / Google Home) via `MediaSessionPlayer.handleSetPlayWhenReady` (`W/ui/playback/MediaSessionPlayer.kt:18-26`)
- Seek-back clamps at 0 (`W/ui/Extensions.kt:256`).
- Storage quirk: the proto field is `skip_back_on_resume_seconds`, but it stores **milliseconds**. The UI setter writes `seconds.inWholeMilliseconds` and the getter reads `.milliseconds` (`AppPreference.kt:271-291`, `W/preferences/Extensions.kt:20-26`). Range 0–10 s; 0 = disabled.

### 1.5 Device profile (ExoPlayer) — `createDeviceProfile` (`W/util/profile/DeviceProfileUtils.kt:66-616`)

The profile is cached and rebuilt only when this configuration changes (`DeviceProfileService.kt:43-101`):
- `maxBitrate`
- `PlaybackOverrides`
- `ExperimentalPreferences`
- `jellyfinTenEleven = serverVersion >= 10.11.0`

Hardware probes come from `MediaCodecCapabilitiesTest` (`W/util/profile/MediaCodecCapabilitiesTest.kt:129-354`): AVC/AVC High10 levels, HEVC Main/Main10 levels, AV1 (hardware only) and AV1 Main10, VC-1, DV/HDR10/HDR10+ per codec, and max resolution per MIME. Device-model quirks are in `KnownDefects.kt` (Fire TV models: DV+HDR10+ bug, EAC3 8ch-in-TS bug, Hi10P L5.2 support).

**Allowed audio codecs** (`:80-95`):
- `downmixStereo`: `[aac, mp2, mp3]`.
- `!ac3Supported`: `supportedAudioCodecs` minus ac3/eac3.
- Otherwise: `aac, aac_latm, ac3, alac, dca, dts, eac3, flac, mlp, mp2, mp3, opus, pcm_alaw, pcm_mulaw, pcm_s16le, pcm_s20le, pcm_s24le, truehd, vorbis` (`:25-46`).

Profile name is `"AndroidTV-Default"`. `MaxStaticBitrate = MaxStreamingBitrate = ` the **stored pref** `prefs.maxBitrate.toInt()` (`DeviceProfileService.kt:48-63`; `DeviceProfileUtils.kt:132-136`). It is passed raw, with no `DEFAULT_BITRATE` fallback for a stored 0, unlike `init()`. The session bitrate from the in-player "Max bitrate" dialog goes only into `PlaybackInfoDto.MaxStreamingBitrate` (§3), not into the profile.

**Transcoding profiles** (`:140-179`):
- Video: Streaming context, `Container=ts`, `Protocol=hls`.
  - VideoCodec `hevc` (if the device supports HEVC), then `h264`.
  - AudioCodec `ac3` only if experimental preferAc3Surround, else the allowed list.
  - `CopyTimestamps=false`, `EnableSubtitlesInManifest=true`.
  - If maxResolution > 0: condition `Height <= maxResolution`.
- Audio: ts/hls, `aac`, or `ac3` with preferAc3Surround.

**Direct play profiles** (`:183-222`):
- Video containers: `asf, dash, hls, m4v, mkv, mov, mp4, ogm, ogv, ts, vob, webm, wmv, xvid`.
- Video codecs: `av1, h264, hevc, mpeg, mpeg2video, vc1, vp8, vp9`.
- Audio: the allowed list. Audio-only direct play also uses the allowed list.

**Codec profiles:**
- EAC3 in TS `AudioChannels <= 7` on bugged devices only (`:226-236`).
- H.264 (`:239-323`):
  - `VideoProfile ∈ {high, main, baseline, constrained baseline, [high 10]}`, or `== "none"` when AVC is unsupported (which blocks it).
  - `VideoLevel <= avcMainLevel` applied to the 8-bit profiles.
  - `VideoLevel <= avcHigh10Level` applied to high 10.
  - `RefFrames <= 12` when width ≥ 1200.
  - `RefFrames <= 4` when width ≥ 1900.
- HEVC (`:326-373`): `VideoProfile ∈ {main, [main 10]}` or "none". Level caps per profile.
- AV1 (`:376-388`):
  - `decodeAv1` (software dav1d) → any profile.
  - Unsupported → "none".
  - No Main10 → `!= main 10`.
- VC-1 (`:391-401`): supported or "none".
- Max resolution per codec (`:405-466`): `Width/Height <=` the decoder max, clamped by the user's max-resolution height. AV1 is not clamped when `decodeAv1`. `mpeg/mpeg2video/vp8/vp9` get `Height <= maxResolution` only when the user set one.
- **HDR exclusion** (`:470-564`):
  - Build `unsupportedRangeTypes{Av1,Hevc}` from device probes, minus "force enabled" overrides, plus "force disabled" overrides (§13 HDR overrides).
  - Emit a codec profile whose condition is `VideoRangeType notEquals "A|B|C"` and whose **applyConditions** is `VideoRangeType inCollection {A,B,C}`.
  - The comment at `:522-526` explains this: the condition only activates for those range types and always fails, which forces a transcode/tonemap.
  - 10.11-only range types: `DOVIInvalid`, `DOVIWithEL`, `DOVIWithELHDR10Plus`, `DOVIWithHDR10Plus` (`W/util/profile/WholphinVideoRangeType.kt`).
  - Set construction details (`:470-519`):
    - On a 10.11+ server, `DOVIInvalid` is always added for both AV1 and HEVC.
    - When `decodeAv1` is true, none of the AV1 DV/HDR10/HDR10+ exclusions are added (only `DOVIInvalid` on 10.11).
    - On 10.11+, devices with `KnownDefects.hevcDoviHdr10PlusBug` always exclude `DOVIWithHDR10Plus` and `DOVIWithELHDR10Plus` for HEVC.
    - `forceEnabledHdr` also gets the DV profile 7 range types when `DolbyVisionProfile7Conversion.isWanted(experimental, mediaTest)`, i.e. the experimental P7 to 8.1 conversion (`DeviceProfileService.kt:70-83`).
- preferAc3Surround: every non-AC3 audio codec gets `AudioChannels <= 2`, for both Video-audio and Audio (`:566-585`).
- Global `VideoAudio AudioChannels <= (downmix ? 2 : 8)` (`:588-594`).

**Subtitle profiles** (`:596-615`; the ASS/PGS flags come from `DeviceProfileService.kt:66-67`):

| Format | Embed | External | Hls | Encode (burn) |
|---|---|---|---|---|
| vtt, webvtt | ✓ | ✓ | ✓ | |
| srt, subrip, ttml | ✓ | ✓ | | |
| dvbsub, dvdsub, idx | ✓ | | | ✓ |
| pgs, pgssub | `directPlayPgs` | | | ✓ |
| ass, ssa | `assPlaybackMode != ASS_TRANSCODE` | same | | ✓ |

The comment at `:597-598` explains that only VTT is allowed over HLS, so that the server never converts other text formats to VTT.

**MPV profile** (`W/util/mpv/MpvDeviceProfile.kt:11-81`):
- Name `"mpv"`. No bitrate limits (TODO in the code) and no codec profiles.
- Transcode: ts/hls hevc+h264 with all `supportedAudioCodecs`, regardless of the ac3/downmix overrides.
- Direct play: relative to ExoPlayer it adds `avi, mpeg, mpegts, mpg` containers and `wav, ogg` audio, and drops the `dash` container and the `vc1` video codec. There is no audio-only direct-play profile (`MpvDeviceProfile.kt:18-67`).
- Subtitles: everything embeddable, ASS external.

### 1.6 Direct play vs direct stream vs transcode — summary

The **server** makes the decision from the profile plus the `EnableDirectPlay`/`EnableDirectStream` flags. Wholphin forces the flags in these cases:

| Situation | DirectPlay | DirectStream |
|---|---|---|
| Normal | true | true |
| User picked "Play with → Transcoding" | false | false |
| Direct-play track selection failed (`TracksChangedListener`) | false | true |
| Player error during DP/DS (§10) | false | false |
| Audio/subtitle/bitrate change | `true` (**AMBIGUOUS**: `enableDirectPlay = true` is passed literally at `:991`, `:1027`, `:1045`, so a session started with forceTranscoding can go back to direct play after a track change; `enableDirectStream` still defaults to `!forceTranscoding`) | default |

---

## 2. Audio and subtitle track selection

### 2.1 Persistent state (Room)

**`ItemPlayback`**: one row per (userId, itemId), unique (`W/data/model/ItemPlayback.kt:20-49`).

| Column | Type | Meaning |
|---|---|---|
| sourceId | UUID? | chosen version |
| audioIndex | Int | server stream index, or a sentinel |
| subtitleIndex | Int | server stream index, or a sentinel |

`TrackIndex` sentinels: `UNSPECIFIED = -1`, `DISABLED = -2`, `ONLY_FORCED = -3` (`:51-66`).

**`SeriesTrackChoice` (STC)**: primary key (userId, parentId, type) (`W/data/model/SeriesTrackChoice.kt:20-87`).

| Column | Meaning |
|---|---|
| parentType | SERIES / SEASON / DEPRECATED / UNKNOWN |
| itemId | item the choice was made on |
| language | language of the chosen stream |
| activation | ACTIVATED / DISABLED / ONLY_FORCED |
| trackFlags | bitmask DEFAULT=1, FORCED=2, SDH=4, EXTERNAL=8, SIGNS=16 (`:145-165`) |
| codec | codec of the chosen stream |
| relativeTrackIndex | position among streams of the same (type, isExternal), sorted by index (`W/data/model/RelativeMediaStream.kt:30-61`) |
| title | stream title |
| audioChannels | channel count |

**`ItemTrackModification`**: (userId, itemId, trackIndex) → `delayMs`. This is the subtitle delay (`W/data/model/ItemTrackModification.kt`).

`PlaybackLanguageChoice` is deprecated and migrated into STC with parentType DEPRECATED (`SeriesTrackChoice.kt:93-131`).

### 2.2 Saving choices (`ItemPlaybackRepository.saveTrackSelection`, `W/data/ItemPlaybackRepository.kt:157-223`)

- Upsert `ItemPlayback` with the new audio or subtitle index. `sourceId` = existing row's, or else the auto-chosen source.
- If the item has `seriesId != null || parentId != null`, also save STCs:
  - Audio: only if the stream has a language. Saves a SEASON STC (`parentId` = `dto.parentId`) and a SERIES STC (`dto.seriesId`) (`StreamChoiceService.kt:49-97`).
  - Subtitle `DISABLED`: STCs with activation DISABLED.
  - Subtitle `ONLY_FORCED`: STCs with activation ONLY_FORCED.
  - Subtitle stream with a language: ACTIVATED STCs with that stream's language, flags, codec, relative index, title and channels.
- **AMBIGUOUS / probable bug.** A Movie or Video has a `parentId` (its library or folder), so a "SEASON"-typed STC keyed by the folder id is written. It is later read by `getBySeasonId(parentId)` (`StreamChoiceService.kt:496-501`). In effect, **a track choice made on one movie becomes the default for all other movies in the same folder**. Decide deliberately whether to replicate this.
- STC lookup order: `WHERE parentId IN (seasonId, seriesId) ORDER BY parentId = seasonId DESC`, i.e. the season STC first (`W/data/SeriesTrackChoiceDao.kt:14-22`).

### 2.3 Audio algorithm (`StreamChoiceService.chooseAudioStream`, `:153-196`)

Candidates are the source's audio streams.

1. If `itemPlayback.audioIndex >= 0`, use the stream with that index (reason: Item). If no candidate has that index, the result is null (no audio track chosen) with reason Item; there is no fallback to STC or preferences (`:159-163`).
2. Else, if STCs exist, take `first = stc[0]` and `scoreStreams(candidates, first)`:
   - `null` (activation DISABLED): no audio stream chosen.
   - Empty result with more STCs: recurse on `stc[1..]`.
   - Empty result with no more STCs: fall through to step 3.
   - Otherwise: the highest-scored stream.
3. Else use user preferences. `lang = getPreferredLanguage(AUDIO)` (§2.6).
   - If `lang` is set: sort candidates by `language` ascending, then `channels` descending. Pick the first of: lang && isDefault → lang → isDefault → first.
   - Otherwise: first isDefault → first.
   - Language equality here is **case-sensitive `==`**.

### 2.4 Subtitle algorithm (`chooseSubtitleStream`, `:258-410`)

Inputs: the chosen audio stream's language, subtitle candidates, `ItemPlayback`, STCs, prefs.

**1. ItemPlayback overrides** (when `subtitleIndex != UNSPECIFIED`):
- `DISABLED` → none.
- `ONLY_FORCED` → `findForcedTrack(candidates, prefSubLang, audioLang)`.
- Otherwise the stream with that index. If no candidate has that index, the result is null with reason Item, with no fallback to STC or preferences (`:277-279`).

**2. STC** (`stc[0]`):
- `DISABLED` → none.
- `ONLY_FORCED` → `findForcedTrack`. If nothing is found, use the STC fallthrough logic with an empty result: next STC, else defaults.
- `ACTIVATED` → `scoreStreams`. Empty result → next STC, else defaults. Otherwise the top-scored stream (`:415-448`).

**3. Defaults:**
- `prefLang = getPreferredLanguage(SUBTITLE)`.
- `mode` (`:328-337`): override `USE_USER_PROFILE` → `userConfig.subtitleMode ?: DEFAULT`; any explicit override → that mode; `prefs.userPreferences == null` → DEFAULT (the server mode is **not** consulted in that case).
- `getPreferredLanguage` with `userPreferences == null` returns null (no preference), not the server profile language (`:562-588`).
- Candidates are sorted descending by:
  1. `isExternal`
  2. `isDefault`
  3. (!forced && lang==pref, case-insensitive)
  4. (forced && lang==pref)
  5. (forced && lang unknown)
  6. forced

  (`:338-349`). External subtitles therefore win ties first. With no preferred subtitle language (null), `it.language.equals(null, true)` is true for streams whose language is null, so keys 3 and 4 favour null-language non-forced and forced streams respectively (`:343-347`).

  **Case sensitivity.** Only the sort keys, ALWAYS (`equalsLangOrUnknown`) and `findForcedTrack` compare languages case-insensitively (`:344-346`, `:356-358`, `:459`, `:465`). Every language comparison in ONLY_FORCED, SMART and DEFAULT is a plain case-sensitive `==`. That includes `audioLanguage != audioStreamLang`, `subtitleLanguage != audioStreamLang` and `it.language == subtitleLanguage` (`:379-388`, `:397-398`).
- Per mode:
  - **ALWAYS**:
    - If prefLang: first non-forced with lang==pref or unknown, else first with lang==pref or unknown.
    - Otherwise: first non-forced, else first.
  - **ONLY_FORCED**:
    - If prefLang: forced with lang == prefLang (case-sensitive), else forced with unknown lang.
    - Otherwise: first forced.
  - **SMART**:
    - If prefLang: let `profileAudio = userConfig.audioLanguagePreference` (the *server* audio pref, not the app override). If (profileAudio set && profileAudio != actual audio lang) or (profileAudio unset && prefLang != actual audio lang), pick the stream with lang==pref, else unknown lang. Otherwise pick forced with lang==pref, else forced with unknown lang.
    - Otherwise: first isDefault.
  - **DEFAULT**:
    - If prefLang: (lang==pref && (default||forced)), else (default||forced).
    - Otherwise: first (default||forced).
  - **NONE** → none.

`findForcedTrack` (`:451-470`):
- "forced-or-signs" means `isForced` **or** the title/displayTitle contains "forced", "signs" or "songs", case-insensitive (`:547-555`).
- Search order: forced-or-signs with lang == pref subtitle lang (case-insensitive) → with lang == audio lang → with unknown lang → none.

"Unknown" languages: null, blank, `unknown`, `und`, `undetermined`, `mul`, `zxx` (`:531-538`).

### 2.5 `scoreStreams(streams, stc)` (`:595-670`)

Returns null if activation is DISABLED.

**Filters:**
- With activation ONLY_FORCED or the FORCED flag, drop non-forced-or-signs streams.
- If `stc.language` is known, drop streams whose language is not an exact (case-insensitive, both known) match.
- Keep only the STC's type.

**Relative indexes** are recomputed with `asRelative()` on the list **after** the forced, language and type filters (`StreamChoiceService.kt:602-623`, `:650-652`; `W/data/model/RelativeMediaStream.kt:53-61`). The saved `relativeTrackIndex` was computed over all source streams of the same (type, isExternal) (`RelativeMediaStream.kt:30-37`, `ItemPlaybackRepository.kt:190`, `:211`). When the filters remove streams, the +100 relativeIndex match compares positions in different lists.

**Score** (on relative streams):

| Condition | Score |
|---|---|
| exact language | +10000 |
| forced && STC FORCED | +1000 |
| STC SIGNS && stream isSigns | +500 |
| default && STC DEFAULT | +500 |
| hearingImpaired && STC SDH | +500 |
| STC SDH && stream forced (and not SDH) | −10 |
| external && STC EXTERNAL | +100 |
| relativeIndex == STC relativeTrackIndex | +100 |
| title == STC title | +10 |
| channels == STC channels | +100 |
| channels > STC channels (instead of the row above) | +50 |
| isDefault | +1 |

Edge cases (`:653-661`): the channel bonuses (+100 equal, +50 greater) apply only when `stc.audioChannels != null`. The title bonus (+10) also applies when both titles are null.

The result is sorted descending.

**Choice reasons.** Each choice carries a `StreamChoiceReason` that the stream-chooser dialog displays (`StreamChoiceService.kt:687-737`): Item → "chosen by" + user, Series/Season → "chosen by" + series/season, UserPreferences → `profile_specific_settings`, DEPRECATED/UNKNOWN STC → unknown. The details pages reset choices with `deleteChosenStreams`, which deletes both the season and the series STC rows plus the `ItemPlayback` row (`ItemPlaybackRepository.kt:279-290`; `ui/detail/movie/MovieViewModel.kt:274`; `ui/components/Dialogs.kt:684`, `:739`).

Tests covering these rules: `T/test/TestSeriesTrackChoice.kt` (season-vs-series precedence, disabled, only-forced, SDH, default) and `T/services/StreamChoiceServiceTest.kt`.

### 2.6 Preferred language (`getPreferredLanguage`, `:562-588`)

- The app per-user override is `JellyfinUserPreferences.preferredAudioLanguage` / `preferredSubtitleLanguage`, stored per server user (`W/data/model/JellyfinServer.kt:105-113`):
  - `""` (USE_USER_PROFILE, default) → server `UserConfiguration.audioLanguagePreference` / `subtitleLanguagePreference`.
  - `"_any-language"` → no preference.
  - Anything else → that code.
- The subtitle mode override is `SubtitleModePreference {USE_USER_PROFILE (default), DEFAULT, SMART, ONLY_FORCED, ALWAYS, NONE}` (`W/preferences/UserProfileSettings.kt:63-70`; `USE_USER_PROFILE = ""` at `:14`, `PREFER_ANY_LANGUAGE = "_any-language"` at `:19`).
- Server flags `playDefaultAudioTrack`, `rememberAudioSelections` and `rememberSubtitleSelections` are **not consulted** anywhere in the selection logic.

### 2.7 Mapping server index → player track (`TrackSelectionUtils.createTrackSelections`, `W/ui/playback/TrackSelectionUtils.kt:21-118`)

- Server indexes are global stream indexes. The player index is the ordinal of that stream among same-type server streams. For subtitles, only those with `deliveryMethod ∈ {EMBED, HLS}` count (`:120-137`).
- Text groups considered: type TEXT, `length >= 1`, not external (id contains `:e:`). Audio groups considered: type AUDIO, `length >= 1`, with **no** external filter (`:41-46`, `:85-88`).
- Both lists are sorted by `(part[0], part[1])` of `trackFormats[0].id` split on `:` or `/`; a non-integer or missing part counts as `Int.MAX_VALUE`; an external group sorts as (MAX, MAX). The result is indexed by the ordinal above (`:153-174`).
- External subtitles: select the first external text group.
- Disabling subtitles: a subtitle index that is null or `< 0` calls `setTrackTypeDisabled(TEXT, true)` (`:114-116`). An audio index that is null or `< 0` is reported SELECTED with no override, so audio is left untouched (`:85-88`).
- Result per type is SELECTED / NOT_FOUND / UNSUPPORTED. Only "both SELECTED" counts as success.

---

## 3. Changing tracks, quality and speed mid-playback

| Action | Code | Mechanism |
|---|---|---|
| Audio track | `changeAudioStream` `PlaybackViewModel.kt:963-997` | Save the choice (ItemPlayback + STC). Re-resolve `ONLY_FORCED` subtitles against the new audio language. `changeStreams(…, positionMs = currentPosition, enableDirectPlay = true)` |
| Subtitle track (incl. None / Only forced) | `changeSubtitleStream` `:999-1032` | Same; `ONLY_FORCED` resolved to a concrete index first |
| Max bitrate | `changeMaxBitrate` `:1034-1052` | `changeStreams(…, enableDirectPlay = true, maxBitrate = new)`. The dialog lists every `bitrateValues` entry, the current one included. When the new value differs from `state.maxBitrate` (always, unless the user re-picks the current one) the fast path is skipped and a new PlaybackInfo request restarts the stream. Re-picking the current value tries the DIRECT_PLAY fast path, which normally succeeds without a restart. Only the DTO's `MaxStreamingBitrate` takes the new value; the DeviceProfile keeps `prefs.maxBitrate` for `MaxStaticBitrate`/`MaxStreamingBitrate` (§1.5). MPV uses its fixed profile. The value is kept in `state.maxBitrate` for the rest of the PlaybackViewModel's life, including later queue items, and is never written to prefs (`PlaybackDialog.kt:286-304`; `PlaybackViewModel.kt:647-652`, `673`, `682-695`, `1034-1047`; `DeviceProfileService.kt:52`) |
| Playback speed | `PlaybackPage.kt:185-186` | `player.setPlaybackSpeed`. No server call. `playbackSpeed` starts at 1.0, is `remember`ed once per `PlaybackPage`, and so carries over to the next queue item. It is not persisted and not reported to the server (reports hard-code `RepeatNone`/`Default` and have no rate field; `TrackActivityPlaybackListener.kt:61-62`) |
| Video scale | `PlaybackPage.kt:176-184` | UI-only (Compose `ContentScale`). Initial value is `prefs.globalContentScale` for ExoPlayer; the MPV backend always starts at `FillBounds`. It resets when the backend changes (`remember(playerBackend)`) |
| Subtitle delay | §4.4 | MPV only |

**In-player switch vs restart** (`changeStreamsDirectPlay`, `:907-961`). An in-player switch with no new PlaybackInfo happens only when **all** of these hold:
- currently DIRECT_PLAY, same item, same maxBitrate;
- the target subtitle is not external;
- with experimental preferAc3Surround, the target audio is not >2-channel non-AC3;
- `TrackSelectionUtils` finds and supports both tracks.

Otherwise a full restart: new `POST PlaybackInfo` → new URL → `setMediaItem` at the current position.

In DIRECT_STREAM or TRANSCODE, every audio or subtitle change is a restart.

**Sentinels reach the server.** Mid-playback changes send the `TrackIndex` sentinels unchanged:
- "None" calls `changeSubtitleStream(TrackIndex.DISABLED)`, and `resolveSubtitleIndex` rewrites only `ONLY_FORCED`, so a restart posts `SubtitleStreamIndex = -2`.
- `currentPlayback.audioIndex` is `audioIndex ?: DISABLED`, so a subtitle or bitrate change on an item that started with no chosen audio posts `AudioStreamIndex = -2`.
- `changeMaxBitrate` passes `currentPlayback.subtitleIndex` without resolving it. After a successful fast-path switch to "Only forced" that value is still -3, because the fast path copies only `tracks`, and -3 is what gets posted.
- After a restart, `currentPlayback.subtitleIndex` holds the resolved concrete index, so the dialog no longer shows "Only forced" as selected, while the saved `ItemPlayback` keeps `ONLY_FORCED`.
- In the fast path, an index `< 0` disables the text or audio override (`TrackSelectionUtils.kt:30`, `73-78`, `81`, `114-115`).
- A port must map these sentinels (for example to null) and not copy them blindly.
(`PlaybackDialog.kt:123-127`; `StreamChoiceService.kt:225-233`; `PlaybackViewModel.kt:691-692`, `810-811`, `946-952`, `1003-1028`, `1039-1046`.)

**After a restart.** A `TracksChangedListener` is attached when the new play method is DIRECT_PLAY and `audioIndex` or `subtitleIndex` is non-null. In any play method one is also attached for an external subtitle, with audio not activated. If the listener cannot activate the tracks it restarts with `enableDirectPlay = false, enableDirectStream = true`; for MPV with an external subtitle it re-attaches itself instead. So a track change can end in DIRECT_STREAM. After the switch the subtitle delay is reloaded: in the fast path, and in the restart path when `subtitleIndex != null` (`PlaybackViewModel.kt:852-897`, `954`).

---

## 4. Subtitles

### 4.1 Kinds and how they are rendered

- **Text** (SRT/VTT/TTML) embedded in the container (EMBED) or side-loaded (EXTERNAL `deliveryUrl`). Rendered by media3 `SubtitleView` with app styling. Cues flow through `onCues` into state into an `AndroidView` (`PlaybackPage.kt:504-602`). A reflection hack overrides the outline width (`W/util/Media3SubtitleOverride.kt`).
- **ASS/SSA**, per `assPlaybackMode`:
  - `ASS_LIBASS` (default): libass-android `AssHandler` + `AssSubtitleView`, sized to the video surface. libass's MKV extractor gets the embedded fonts (`PlayerFactory.kt:139-157`, `PlaybackPage.kt:532-582`).
  - `ASS_EXO_PLAYER`: media3's own SSA parser, which loses styling.
  - `ASS_TRANSCODE`: profile disallows embed/external, so the server burns them in.
- Device-profile delivery behind these modes (`W/util/profile/DeviceProfileUtils.kt:596-615`; `DeviceProfileService.kt:66-67`):
  - VTT/WEBVTT: EMBED + HLS + EXTERNAL.
  - SRT/SUBRIP/TTML: EMBED + EXTERNAL.
  - DVBSUB/DVDSUB/IDX: EMBED + ENCODE.
  - PGS/PGSSUB: ENCODE always, EMBED only when `directPlayPgs`.
  - ASS/SSA: ENCODE always, EMBED + EXTERNAL unless `assPlaybackMode == ASS_TRANSCODE`.
- **Image** (PGS, DVD, DVB):
  - PGS direct play when `directPlayPgs` (default true); otherwise Encode.
  - DVD/DVB/IDX are embed-capable but also Encode-capable.
  - Bitmap cues get `imageSubtitleOpacity` alpha (`PlaybackPage.kt:516-522`, `592-600`).
- Subtitles are hidden (alpha 0) while the D-pad skip indicator is active, when no subtitle is enabled, or when the surface is covered (`:527-530`).
- The subtitle layer fills 100% of the height normally and **70%** while controls are visible (animated), so captions move above the controls (`:520`).

### 4.2 External delivery URL

The server-provided `MediaStream.deliveryUrl` is resolved with `api.createUrl`. Typically `/Videos/{itemId}/{mediaSourceId}/Subtitles/{index}/0/Stream.{fmt}?ApiKey=…`; the exact format is the server's, not Wholphin's.

### 4.3 Styling preferences (`SubtitlePreferences`, `P/:145-160`; UI `W/ui/preferences/subtitle/SubtitleSettings.kt`)

| Pref | Type | Default | Range / options |
|---|---|---|---|
| font_size | int (sp) | 24 | 8–70 step 2 |
| font_color | RGB | White | White, Black, LightGray, DarkGray, Red, Yellow, Green, Cyan, Blue, Magenta |
| font_opacity | % | 100 | 10–100 step 10 |
| font_bold / font_italic | bool | false / false | |
| edge_style | enum | EDGE_SOLID | NONE, SOLID (outline), SHADOW (drop shadow) |
| edge_color | RGB | Black | color list; alpha = font_opacity |
| edge_thickness | int (half-dp) | 4 (=2dp) | 1–32 |
| background_style | enum | BG_NONE | NONE, WRAP (per-line window), BOXED (whole box) |
| background_color | RGB | declared `Color.Transparent`, effectively **black** (RGB 000000) | same 10-colour list as font_color (no Transparent entry) |
| background_opacity | % | 50 | 10–100 step 10 |
| margin | % of height | 8 | 0–100 (bottom padding fraction) |
| image_subtitle_opacity | % | 100 | 10–100 step 5 |
| use_separate_hdr | bool | false | When true and `videoStream.hdr`, use `hdr_subtitles_preferences` (a second full copy, same defaults) instead (`PlaybackPage.kt:504-515`). On the SDR style page only, and only when `shouldShowHdr(display)` holds (API >= 26 && `display.isHdr`), an "HDR" group is appended. It holds the "Different for HDR" switch, and the "HDR subtitle style" link (`Destination.SubtitleSettings(true)`) appears only while `use_separate_hdr` is true (`SubtitleStylePage.kt:194-202`; `SubtitleSettings.kt:253-267`, `311-329`). The HDR page switches the window to `COLOR_MODE_HDR` while open (`SubtitleStylePage.kt:68-78`) |

Colours are stored with alpha stripped (`toArgb() and 0x00FFFFFF`, `SubtitleSettings.kt:166-180`, `331-334`), and the rendered alpha always comes from the opacity pref. Transparent (0x00000000) is therefore stored as RGB 0x000000, which is black; the choice list has no Transparent entry, so the UI shows the default as "Black" (`valueToIndex` matches index 1). With WRAP/BOXED selected and the colour untouched, the result is black at 50% opacity, not invisible (`AppPreferencesSerializer.kt:283`).

Mapping to media3 is in `toSubtitleStyle` (`SubtitleSettings.kt:336-356`) and `applyTo` (`:358-363`); `calculateEdgeSize` is at `:365`:
- Foreground = color + opacity.
- `CaptionStyleCompat(foreground, backgroundColor, windowColor, edgeType, edgeColor, typeface)` receives the WRAP colour as the 2nd argument and the BOXED colour as the 3rd (`:339-342`). So BG_WRAP → `backgroundColor` (per-line background behind the text glyphs); BG_BOXED → `windowColor` (one box around the whole cue window). The other slot is 0 (transparent). Background alpha = `background_opacity`.
- Edge type → OUTLINE or DROP_SHADOW.
- Fixed text size in sp.
- `bottomPaddingFraction = margin/100`.

MPV gets an equivalent property set (`applyToMpv`, `:367-428`).

### 4.4 Subtitle delay

- The Settings dialog offers "Subtitle delay" **only when the player is MPV** (`PlaybackPage.kt:787`). ExoPlayer has no delay support in Wholphin.
- The dialog has buttons `-1s, -250ms, -50ms, Reset, +50ms, +250ms, +1s`. Initial focus is Reset (`W/ui/playback/SubtitleDelay.kt:31-78`).
- Opening it hides the controls so the subtitles stay visible (`PlaybackPage.kt:779-782`).
- `updateSubtitleDelay(delta)` adds the delta. A debounce of **1500 ms** then saves `ItemTrackModification(user, itemId, subtitleIndex, delayMs)` (`PlaybackViewModel.kt:1647-1668`).
- `loadSubtitleDelay()` runs after any stream change with a subtitle (`:1670-1686`).
- It is applied to MPV via `MpvPlayer.subtitleDelay` (`PlaybackPage.kt:188-191`).

### 4.5 Subtitle search and download (`W/ui/playback/SubtitleSearchUtils.kt`, `DownloadSubtitlesDialog.kt`)

- Entry: the "Search and download" row at the bottom of the Captions dialog. It is enabled only if `user.policy.isAdministrator || enableSubtitleManagement` (`PlaybackPage.kt:754-755`).
- Opening the dialog pauses the player and remembers whether it was playing (`PlaybackPage.kt:704-739`).
- Search: `GET /Items/{itemId}/RemoteSearch/Subtitles/{language}` (`subtitleApi.searchRemoteSubtitles`).
  - Language = argument, else preferred subtitle language, else device locale language.
  - Results are sorted by `isHashMatch` desc, `communityRating` desc, `downloadCount` desc (`:48-87`).
  - The UI shows an editable language field, then a list of rows. Each row has: name; overline "Hash matches"; supporting text "provider - Forced - Hearing impaired - N downloads"; trailing rating with a star (`DownloadSubtitlesDialog.kt:108-175`). States: Searching…, Downloading…, Error, "No subtitles found".
- Download: `POST /Items/{sourceId ?: itemId}/RemoteSearch/Subtitles/{subtitleId}` (`downloadRemoteSubtitles`, `:117-120`). Note it uses the **media source id** as the item id when one is available.
- Polling: at most 4 times, with a 1500 ms delay before each `GET /Items/{itemId}`, while the subtitle count is unchanged (`:129-166`). After the loop, if attempts are exhausted (`maxAttempts == 0`), toast `subtitle_download_too_long` and do not switch. **AMBIGUOUS, likely a bug:** a count change detected on the 4th (last) poll also leaves `maxAttempts == 0`, so the download succeeded but the new subtitle is not selected. Either way the search status is then set to Inactive and playback resumes if it was playing before (`:215-220`). If the refreshed item no longer has the current media source, the code toasts "Item is no longer playable..." and returns without resetting the status, so the dialog stays on "Downloading…" (`:143-153`); the port should close the dialog.
- On success:
  - The new stream is the external stream whose path was not in the old set.
  - If the user had an explicit audio index ≥ the new stream's index, increment it (server indexes shift) and re-save.
  - Save the new subtitle selection, update the media info, then `changeStreams` at the current position, and resume if it was playing (`:167-220`).

---

## 5. Progress reporting (`W/util/TrackActivityPlaybackListener.kt`)

One listener instance exists per `changeStreams` call. Each stream restart means stop-old, start-new.

| Event | API call | Fields |
|---|---|---|
| First `onIsPlayingChanged(true)` | `POST /Sessions/Playing` (`reportPlaybackStart`) | `CanSeek=true`, `ItemId`, `IsPaused=!isPlaying`, `PlayMethod`, `RepeatMode=RepeatNone`, `PlaybackOrder=Default`, `IsMuted=false`, `AudioStreamIndex` and `SubtitleStreamIndex` (each only if ≥0, else null; `PlaybackItemState` drops negatives, e.g. `DISABLED=-2` when no audio was chosen; `:177-186`), `PlaySessionId`, `LiveStreamId`. **No** `PositionTicks`, **no** `MediaSourceId` (`:51-77`) |
| Every 5 s after start (`java.util.Timer.schedule(task, delay, period)`, which is fixed-delay, not `scheduleAtFixedRate`; shared daemon Timer; first tick 5 s after the Start call completes; `:37-46`, `:71-74`, `:165`). It fires **while paused too** (no `isPlaying` check), so paused sessions keep sending Progress with `IsPaused=true` | `POST /Sessions/Playing/Progress` | `ItemId`, `PositionTicks`, `CanSeek=true`, `IsPaused`, `IsMuted=false`, `PlayMethod`, `RepeatMode`, `PlaybackOrder`, `AudioStreamIndex`, `SubtitleStreamIndex` (same ≥0 filtering as Start), `PlaySessionId`, `LiveStreamId`. Skipped if position ≤ 0 (`:118-147`) |
| Any later `onIsPlayingChanged` (pause, resume, buffering) | progress | same |
| `STATE_ENDED` | progress with `position = player.duration` | same |
| Listener `release()`: stream change, `disconnectPlayer`, `PlaybackViewModel.release()` (page `onStop`/dispose `PlaybackPage.kt:122-126`), or remote STOP | `POST /Sessions/Playing/Stopped` | `ItemId`, `PositionTicks` (if ≥0), `Failed=false`, `PlaySessionId`, `LiveStreamId` (`:79-101`) |

- The listener's `PlaybackItemState` is captured once at creation. When an audio/subtitle change succeeds in place on the direct-play fast path (`changeStreamsDirectPlay`), no new listener is created, so later Progress and Stopped reports keep the **old** `AudioStreamIndex`/`SubtitleStreamIndex` (`PlaybackViewModel.kt:647-660`, `832-840`, `907-956`).
- A Stopped report is also sent on `release()` even if Start was never sent (Start waits for the first `isPlaying=true`; `TrackActivityPlaybackListener.kt:79-109`).
- **No ping** (`/Sessions/Playing/Ping`) is ever sent.
- Seeks are not reported immediately; the next 5 s tick carries the new position.
- **Errors**: no special report. `Failed` is always false.
- **Marking played**: there is no explicit "mark played" call during playback. Played state comes from the server's own threshold on `Stopped`/`Progress` (server-side MaxResumePct).
- Each `play()` invalidates the local date-played cache (`PlaybackViewModel.kt:464-467`).

Related session calls:
- **Transcode info poll** (`listenForTranscodeReason`, `:1276-1306`). When the play method is TRANSCODE and info is missing, loop: wait 2 s, `GET /Sessions?deviceId={deviceId}`, take `[0].transcodingInfo`, and if it is null wait another 3 s. This feeds the debug overlay.
- **Remote control** over the websocket (`subscribeToWebSocket`, `:1466-1542`). Subscribes to `PlaystateMessage`:
  - STOP → release + back
  - PAUSE / UNPAUSE
  - NEXT_TRACK / PREVIOUS_TRACK → playlist
  - SEEK → `seekPositionTicks`
  - REWIND / FAST_FORWARD → `skipBackMs` / `skipForwardMs`
  - PLAY_PAUSE → toggle

  Capabilities are posted app-wide: `playableMediaTypes=[Video]`, `supportedCommands=[DisplayMessage, SendString]`, `supportsMediaControl=true` (`W/services/ServerEventListener.kt:67-75`).
- **MediaSession**: Android media session wrapping the player. All controllers are trusted, so Google Home can play/pause (`PlayerFactory.kt:271-295`).
- **Lifecycle** (`W/services/PlaybackLifecycleObserver.kt`): activity `onPause` → remember isPlaying and pause; `onResume` → play if it was playing. Theme song stops.
- **Screen-on**: `keepScreenOn(isPlaying)` (`PlaybackViewModel.kt:1688-1690`).

---

## 6. Media segments (`listenForSegments`, `PlaybackViewModel.kt:1173-1274`; UI `PlaybackPage.kt:332-337`, `605-628`)

- Fetch once per item: `GET /MediaSegments/{itemId}` (`mediaSegmentApi.getItemSegments`), with no type filter.
- Poll every **500 ms**. The current segment is the first with `type != UNKNOWN && start <= pos < end`, compared in ticks, and only if `segment.itemId == current itemId`.
- Per-type behavior, from prefs:

| Type | Pref | Default |
|---|---|---|
| INTRO | skipIntros | ASK_TO_SKIP |
| OUTRO | skipOutros | ASK_TO_SKIP |
| COMMERCIAL | skipCommercials | ASK_TO_SKIP |
| PREVIEW | skipPreviews | IGNORE |
| RECAP | skipRecaps | IGNORE |
| UNKNOWN | — | IGNORE |

- **OUTRO special case.** If `showNextUpWhen == DURING_CREDITS`, there is a next item, and this outro has not triggered yet (tracked per segment id), set `nextUp = nextItem` (only if it is Media, not Intro). The skip behavior is then **not** evaluated for that tick.
- **AUTO_SKIP**: the first time a segment id is seen, `seekTo(end + 1 ms)`. The state is `MediaSegmentState(seg, interacted = true)`, so no floating button appears.
- **ASK_TO_SKIP**: the state is `MediaSegmentState(seg, interacted = autoSkippedSegments.contains(seg.id))` (`:1236-1241`). Merely seeing a segment does not mark it. An id enters `autoSkippedSegments` only via AUTO_SKIP or `updateSegment` (Skip clicked, Back, or the 10 s timeout, `:1258-1273`), and the set is cleared by `resetSegmentState()` when a new item starts (`:1163-1168`, `:461`). The state is rebuilt on every 500 ms tick, so seeking back into an ask-to-skip segment the user never touched shows the button again.
- With the IGNORE behavior (and UNKNOWN), `currentSegment` is set to null, so no button appears. If `getItemSegments` returns no items, no polling loop starts (`:1179`, `:1243-1247`).
- Floating **Skip button**:
  - Visible when `currentSegment.interacted == false && nextUp == null && controls hidden && no D-pad skip indicator`.
  - Position: bottom-end, 40 dp padding. Gets focus automatically.
  - Label (`skipStringRes`, `W/ui/Formatting.kt:232-241`; `res/values/strings.xml:385-390`): INTRO "Skip Intro", OUTRO "Skip Outro", RECAP "Skip Recap", PREVIEW "Skip Preview", COMMERCIAL "Skip Ads", UNKNOWN "Skip Segment".
  - Pulsing rounded outline: `onSurface ↔ transparent`, 1500 ms, linear easing, reverse. It is a round-rect drawn 6 dp outside the button with corner radius = width × 0.5. Content padding is 8/4/8/4 dp (start/top/end/bottom), content height 32 dp (`overlay/SkipSegmentButton.kt:40-76`).
  - Click → `updateSegment(id, dismissed = false)`: `seekTo(end + 1)` and clear.
  - Auto-dismiss after **10 s**, or on Back (`updateSegment(id, dismissed = true)`), which marks it interacted. The 10 s timer lives in a `LaunchedEffect` inside `AnimatedVisibility(showSegment)`, so it restarts each time the button reappears, for example after the controls hide (`PlaybackPage.kt:606-628`).
- A text button with the same label (`segment.type.skipStringRes`) sits left of the CC/Audio buttons with 32 dp end padding. It shows for **any non-null `currentSegment`**, including segments already auto-skipped or dismissed (`interacted = true`). It is a plain `player.seekTo(segment.endTicks)` with no `+1`, and it does not call `updateSegment` (`overlay/PlaybackControls.kt:215-229`; `PlaybackPage.kt:499`).
- Tests: `T/ui/playback/PlaybackViewModelTests.kt:675-916`.

---

## 7. Next up, autoplay, queue, shuffle, cinema mode

**End of item** (`onPlaybackStateChanged(STATE_ENDED)`, `PlaybackViewModel.kt:1111-1152`). Let `next = playlist[index+1]`:
- next is an **Intro** → play immediately.
- next is **Media**:
  - current item is an Intro → play immediately.
  - `showNextUpWhen == NEXT_UP_NEVER && !autoPlayNext` → go back.
  - `showNextUpWhen != NEVER` → show the Next Up panel.
  - else (NEVER with autoplay) → only `showControls()`.

    **AMBIGUOUS**: by the code and the test name "Show next up never with automatic play" (`T/ui/playback/PlaybackViewModelTests.kt:517`), autoplay does not happen in this branch. It just shows controls.
- no next → go back.

**Next Up panel** (`PlaybackPage.kt:630-701`, `W/ui/playback/NextUpEpisode.kt`):
- The video shrinks to **60%** (animated, top-center) and the background becomes the theme background.
- The panel sits bottom-center, 66% wide, 40% tall, with 8 dp corners and surface elevation 2 dp. Contents:
  - Heading `stringResource(next_up) + "..."` = "Next Up..." (capital U; `titleLarge`, centered; `NextUpEpisode.kt:91-97`, `strings.xml:78`)
  - card: image with `ContentScale.Fit`, aspect ratio `item.aspectRatio ?: WIDE` coerced to at least `AspectRatios.MIN` (`PlaybackPage.kt:680, 686`; `NextUpEpisode.kt:111`), focused. A center circle (`TransparentBlack50`, `CircleShape`) shows the remaining time formatted like a Kotlin `Duration` (`"15s"`, not a bare number; `titleMedium`, 12 dp padding) while autoplay is enabled and `timeLeft > 0`; otherwise a 60 dp PlayArrow icon (`:185-218`)
  - "S1E2 - Title", overview (4 lines), "runtime • Ends at hh:mm"
- Autoplay enabled = `autoPlayNext && (passOutProtectionMs == 0 || now - lastInteraction < passOutProtectionMs)` (`PlaybackViewModel.kt:1318-1326`).
  - `lastInteraction` is updated on **every KeyUp** (`PlaybackKeyHandler.kt:43`) and on clicking the next-up card.
  - Pass-out protection default is 2 h, range 0–3 h; 0 = disabled.
- Countdown starts at `autoPlayNextDelaySeconds` (default 15, range 0–60 step 5) and ticks 1 s. At 0 → `playNextUp()`. A delay of 0 means immediate.
- The countdown loop runs only if autoplay was enabled when the panel was composed: `shouldAutoPlayNextUp()` is evaluated once, inside `remember` (`PlaybackPage.kt:631-671`).
- Back with the countdown active (`timeLeft > 0 && autoPlayEnabled`) sets `timeLeft = -1` and turns autoplay off; the panel stays.
- Back again:
  - if `player.isPlaying` (credits case) → `cancelUpNextEpisode()` (`nextUp = null`, hides the panel);
  - else → leave playback (`:681-685`).
- Clicking the card → `reportInteraction()`, `controllerViewState.hideControls()`, then play next.
- The panel can also open **before** the end of the item: with `showNextUpWhen == DURING_CREDITS`, an OUTRO segment sets `nextUp`, once per segment id, only if `hasNext` and the next item is Media (§6; `PlaybackViewModel.kt:1206-1215`). This is the "player is still playing" case the Back rule relies on.

**AMBIGUOUS**: `PlaybackKeyHandler` is `remember(preferences)`-ed with `controlsEnabled = state.nextUp == null` (`PlaybackPage.kt:247-251`). That value is captured once, so the "disable controls while next-up is visible" intent probably never takes effect.

**Playlist navigation** (`:1328-1404`, mutex-guarded):
- `playNextUp`, `playPrevious` and `playItemInPlaylist` set the index, cancel the in-flight job and `play(item, 0)`. `play()` returns false after a short toast ("Unsupported type '<type>', skipping..." or "Item has no media sources, skipping..."). The caller then continues in the same direction: initial play, `playNextUp` and `playItemInPlaylist` call `playNextUp()`; `playPrevious` calls `playPrevious()`, moving further back (`PlaybackViewModel.kt:416-418`, `1340-1343`, `1365-1368`, `1393-1396`). `playNextUp` and `playPrevious` also clear `nextUp` (`cancelUpNextEpisode`) before playing.
- The MediaNext and MediaPrevious remote keys call `playNextUp()` and `playPrevious()` directly (`PlaybackKeyHandler.kt:93-99`). They skip the on-screen Previous rule below. With no previous item the Previous key only logs a warning and does nothing; it does not seek to 0. In the overlay, Previous is always enabled (`previousEnabled = true`) and Next only when `state.hasNext` (`PlaybackPage.kt:272-273`, `483-484`).
- Positions in queued items always start at 0. **Queued items do not resume.**
- The Previous button: if `position < player.maxSeekToPreviousPosition` (media3 default 3000 ms) and there is a previous item → previous item; else `player.seekToPrevious()`, which seeks to 0 for a single media item (`PlaybackPage.kt:317-324`).
- Shuffle is decided at queue-build time (§1.1). There is no in-player shuffle or repeat. Reports always use `RepeatNone`/`Default` order.

**Cinema mode**: §1.1 step 8. Intros play back-to-back with no next-up UI (they are `PlaylistItem.Intro`). Tests: `PlaybackViewModelTests.kt:339-423`, `601`.

---

## 8. Trickplay

- **Info**: `BaseItemDto.trickplay: Map<mediaSourceId, Map<width, TrickplayInfoDto>>`. Wholphin takes `.values.firstOrNull()` for the chosen source (`PlaybackViewModel.kt:573-579`).
- **URL**: `GET /Videos/{itemId}/Trickplay/{width}/{index}.jpg?mediaSourceId={sourceId}` (`trickPlayApi.getTrickplayTileImageUrl`, `:1092-1109`).
- **Prefetch** all sheets when an item starts: `count = (durationMs / interval) / (tileWidth*tileHeight) + 1`, enqueued at original size (`:1072-1090`).
- **Tile math** (`overlay/TrickplayPreview.kt:33-37`, `overlay/SeekPreviewImage.kt:104-110`):

```
idx        = floor(posMs / interval)                  // global thumb index
sheet      = idx / (tileWidth*tileHeight)             // which jpg
tileInSheet= idx % (tileWidth*tileHeight)
col        = tileInSheet % tileWidth
row        = tileInSheet / tileWidth
crop rect  = (col*width, row*height, width, height)   // TrickplayInfoDto.width/height = one thumb
```

- **Layout details** (`overlay/PlaybackOverlay.kt:98-101`, `260-297`; `overlay/TrickplayPreview.kt:28-61`): the seek-bar trickplay preview is forced LTR, sits in a box 95% of the overlay width, and is offset to `clamp(seekPercent, 0, 1)` of that width. It is shown only while controls are visible, `seekProgressPercent >= 0` and the seek bar is focused. `seekProgressMs` resets to `player.currentPosition` whenever seek-bar focus changes. Preview and timestamp chip are spaced 8 dp apart; the chip has 8/4 dp padding and `onSurface` text, and its time is formatted from whole seconds. The trickplay width used is simply the first entry of the source's width map; no size is chosen (`PlaybackViewModel.kt:573-579`).
- **Display**: 160 dp tall, width = 160 × width/height, 1.5 dp border in the theme "border" color, black background. A timestamp chip sits under it (black 60%, 4 dp radius, labelLarge).
- **Where it appears**:
  - (a) Above the seek bar while the **seek bar is focused** with controls visible. Horizontally offset to the seek fraction and clamped to screen edges (`overlay/PlaybackOverlay.kt:260-297`, `offsetByPercent` `SeekPreviewImage.kt:56-70`).
  - (b) In the controls-hidden **D-pad seek overlay** when `dpadSeekMode == SEEKBAR_TRICKPLAY` (§9.6).
- With no trickplay info, only the timestamp chip shows.

---

## 9. Controls overlay

### 9.1 Visibility model (`W/ui/playback/ControllerViewState.kt`)

- `showControls(ms = hideMilliseconds)` sets visible and pulses.
- `pulseControls(ms)` posts to a conflated channel that is **debounced** by `ms`. When the debounce fires, controls hide.
- Default timeout `controllerTimeoutMs = 5000`, range 500–15000 step 100.
- Every button focus change or click pulses.
- Dialogs do **not** hold the controls open. The opening click pulses with the normal timeout, so the controls can auto-hide behind an open dialog, and a dialog opened from the Captions/AudioTrack media key leaves the controls hidden. `pulseControls(Long.MAX_VALUE)` runs only in the dialogs' `onDismissRequest` (Captions, Audio, Speed, Scale, Bitrate); `PlaybackPage`'s own `onDismissRequest` then immediately sends `pulseControls()` with the default timeout when the controls are visible, and the conflated channel keeps only that last value. Choosing "Subtitle delay" calls `hideControls()` so the subtitles are visible (`PlaybackDialog.kt:116-119`, `203-206`, `226-229`, `249-252`, `298-301`; `PlaybackPage.kt:761-783`; `overlay/PlaybackControls.kt:159-164`, `346-351`; `ControllerViewState.kt:38-50`).
- Only focus inside the debug overlay pins the controls with `Long.MAX_VALUE`; leaving it pulses normally (`overlay/PlaybackOverlay.kt:355-362`).
- Overlay state machine: `HIDDEN → CONTROLLER → CHAPTERS → QUEUE` (`PlaybackOverlay.kt:371-376`). Transitions are vertical slides (`:153-165`).

### 9.2 Layout (TV, dp)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [LOGO 240x120, pad16]                                         [CLOCK]        │  top: logo slides from TL, clock from TR
│                                                                              │  (hidden when debug overlay shown)
│                      (trickplay 160dp tall, follows seek x, only while       │
│                       seek bar focused)                                      │
│                                                                              │
│ ░░░░░░░░░░░░░░░░░ scrim: vertical gradient transparent → black50 → black80 ░░│
│  Title (28sp, titleLarge, 1 line, 75% w, start 16)        ← moves up 32dp    │
│  Subtitle (18sp, 75% w)                      Ends at 10:42 PM (labelLarge,   │      when seek bar focused
│                                                                  end 32)     │
│  ●━━━━━━━━━━━━━━━━━━━━━━━━━○──────────────────────────────  (95% w, 6dp;    │
│  0:12:03                                              -0:31:57   12dp focus) │
│  [⚙]                     [⏮][⏪][⏯][⏩][⏭]          [Skip Intro][CC][🔊]   │  36x36 buttons, 12dp gap,
│  Chapters (or Queue)   ← focusable header; moving focus here switches state  │  row has 8dp h-pad
│                                                                   pad-bottom 8│
└──────────────────────────────────────────────────────────────────────────────┘
```

- With show-debug on, the gradient scrim, the logo and the clock are all hidden. The debug overlay itself shows only while the controls are visible: top-start, `TransparentBlack50` background, 8 dp inner padding, 16 dp bottom padding, max height = screen height − controller height. The overlay state resets to CONTROLLER or HIDDEN every time controls visibility changes (`PlaybackOverlay.kt:116-118`, `127-151`, `299-364`).

Sources: `PlaybackOverlay.kt:123-365`, `PlaybackController.kt:47-248`, `PlaybackControls.kt:137-466`, `SeekBar.kt:192-328`.

- Seek bar drawing (`SeekBar.kt:285-325`): round-capped lines with full track `onSurface @25%`, buffered `onSurface @65%`, progress = theme `border` color, and a white circle knob with radius = bar height + 2 px. Height animates 6 dp → 12 dp on focus. The bar refreshes every 250 ms (`PlaybackControls.kt:256-263`).
- Timecodes: left = elapsed, right = `-remaining`, labelLarge, 8 dp padding, always LTR (`PlaybackControls.kt:291-332`).
- "Ends at" = now + (duration − position) / speed, refreshed every 1 s (`PlaybackController.kt:203-224`).
- Buttons: container `TransparentBlack25`, focused container = theme `border` color, 4 dp content padding, onSurface tint. With the OLED theme the tint is LocalContentColor (`PlaybackControls.kt:468-554`).

### 9.3 Buttons, in order

| # | Group | Icon | Action | Condition |
|---|---|---|---|---|
| 1 | Left | `vector_settings` (gear) | Settings dialog | always |
| 2 | Center | `baseline_skip_previous_24` | Previous (§7) | `previousEnabled = true` (always) |
| 3 | Center | `baseline_fast_rewind_24` | `seekBack(skipBackMs)` | always |
| 4 | Center | play_arrow / pause | Play (+ skipBackOnResume) / Pause. **Initial focus** when controls appear | always |
| 5 | Center | `baseline_fast_forward_24` | `seekForward(skipForwardMs)` | always |
| 6 | Center | `baseline_skip_next_24` | Next | `nextEnabled = state.hasNext` (disabled otherwise) |
| 7 | Right | text button "Skip …" (`segment.type.skipStringRes`, 32 dp end padding) | `seekTo(segment.endTicks)` exactly (no `+1 ms`, unlike auto-skip and the floating button); does not mark the segment interacted | `state.currentSegment != null`, including ASK segments already dismissed and the brief window after an AUTO_SKIP (§6) |
| 8 | Right | `captions_svgrepo_com` | Captions dialog | always |
| 9 | Right | FontAwesome `fa_volume_high` (18sp glyph) | Audio dialog | always |

Below the row:
- a focusable **"Chapters"** header if the item has chapters, else **"Queue"** if `hasNext`.
- Focusing it switches the overlay to the CHAPTERS / QUEUE row (`PlaybackController.kt:91-121`).

### 9.4 Chapters and queue rows

**Chapters** (`overlay/ChapterRowOverlay.kt`):
- Title "Chapters", then a LazyRow of `ChapterCard`s (16 dp padding and gap).
- Initial focus is the chapter containing the current position.
- Click → `seekTo(chapter.start)` and hide controls.
- Up from the row → back to CONTROLLER, via a hidden focus box.
- Left on the first card is blocked.
- A trailing "Queue" header moves to QUEUE when `hasNext`.

**Queue** (`overlay/QueueRowOverlay.kt`):
- "Queue" title; LazyRow of `SeasonCard`s with image height 140 dp for the **upcoming** items only (`PlaybackState.upcomingItems`).
- Initial focus is the first card.
- Click → `playItemInPlaylist(item)` and hide controls.
- Up → CHAPTERS if there are chapters, else CONTROLLER.

### 9.5 Dialogs (`W/ui/playback/PlaybackDialog.kt`)

Dim is 0 for every dialog.
- Settings / Speed / Scale / Bitrate use `BottomDialog`: bottom + left gravity, `surfaceColorAtElevation(1.dp)`, 8 dp corners, 8 dp outer padding (`overlay/PlaybackControls.kt:585-603`).
- Captions / Audio: bottom + right gravity, `surfaceColorAtElevation(3.dp)`, 8 dp corners (`PlaybackDialog.kt:340-358`, `498-516`).
- Subtitle delay (MPV only) is **not** bottom-anchored: a plain centered `Dialog` with no gravity set, `TransparentBlack50` background, 16 dp corners, 8 dp inner padding (`PlaybackDialog.kt:260-283`).

- **Settings** (`:138-197`):
  - "Playback speed" (shows the current value). Disabled when the ExoPlayer backend is used and `audioDecoder == null`, i.e. audio passthrough or offload (`PlaybackPage.kt:756-758`; issue #164).
  - "Video scale": ExoPlayer only.
  - "Subtitle delay": MPV only.
  - "Max bitrate".
  - "Show/Hide debug info": toggles the overlay.
  - Dismissing Speed or Scale returns to Settings (`PlaybackPage.kt:761-770`).
- **Captions** (`:311-479`):
  - "None" (DISABLED), "Only forced subtitles" (ONLY_FORCED), then a divider **only if the list has streams**.
  - Each subtitle stream: headline = stream title or displayTitle; supporting = displayTitle when a title exists.
  - A divider, then "Search and download". The row is always rendered and is `enabled` only when `user.policy.isAdministrator || user.policy.enableSubtitleManagement`; it is disabled, not hidden, without permission (`PlaybackPage.kt:754-755`; `PlaybackDialog.kt:321-338`, `419-421`, `445-452`). Choosing it hides the controls (`SearchCaptions → hideControls`), and the player stays paused while the search dialog is open, resuming on dismiss only if it was playing (`PlaybackPage.kt:307-310`, `704-714`).
  - Initial focus goes to the row whose stream index equals the current index; otherwise to "None", even when ONLY_FORCED is current. Up from the first row wraps to the last, and Down from the last wraps to the first.
- **Audio** (`:481-553`): the audio streams with the same headline/supporting rules; focus on the current one.
- **Playback speed**: `.25, .5, .75, 1.0, 1.25, 1.5, 1.75, 2.0` (`PlaybackConstants.kt:9`). The value is per-session, not persisted, and resets to 1.0 on each page.
- **Video scale**: Fit, None, Crop, Fill (stretch), Fill width, Fill height (`PlaybackConstants.kt:11-20`). The initial value comes from the `globalContentScale` pref; MPV forces FillBounds (`PlaybackPage.kt:176-184`).
- **Max bitrate**: `bitrateValues` = 500k, 750k, 1M, 2M, 3M, 5M, 8M, 10M, 15M, 20M, 30–100M step 10, 120–200M step 20, with M = 1,048,576 (`AppPreference.kt:349-363`). A choice is per session only (§3); the Bitrate and Speed lists open focused on the current value, and the Settings list requests no initial focus (`PlaybackDialog.kt:184-196`, `286-307`; `overlay/PlaybackControls.kt:569-583`).

### 9.6 Controls-hidden seek feedback (`PlaybackPage.kt:217-454`)

`dpadSeekMode` (default `SEEKBAR_MINIMAL`):
- **SEEKBAR_MINIMAL / SEEKBAR_NONE**: immediate seek per step. A **SkipIndicator** shows (55 dp circular-arrow image, rotating ±270° over 800 ms, mirrored for back, with the accumulated |seconds| in 13 sp) at bottom-center with 70 dp bottom padding.
  - Accumulation resets on a direction change.
  - MINIMAL also shows a **3 dp bar along the very bottom edge**, width = `position/duration`, theme `border` color, LTR. This is the "subtle bottom progress indicator".
- **SEEKBAR_TRICKPLAY**: steps move a *virtual* position (clamped 0..duration) and post it to `SeekBarState`, which **debounces 750 ms** before the real `seekTo`.
  - A `DpadSeekOverlay` (trickplay thumb at the % position, a static non-focusable seek bar, timecodes) shows at bottom-center, 95% wide, 16 dp from the bottom.
  - It auto-hides 1.5 s after the last change. Enter while it is visible hides it.
- Any show/hide of controls cancels the indicator (`:217-221`).
- **Pause indicator**: when the player transitions to paused (READY/BUFFERING with `playWhenReady=false`) and controls are hidden, a 64 dp pause icon scales in at the center over 300 ms, then fades after about 350 ms (`overlay/PauseIndicator.kt`).
- **Buffering**: a spinner over `TransparentBlack25` appears only after 250 ms of BUFFERING (`PlaybackPage.kt:194-205`). A black cover with a spinner shows until the first frame (`presentationState.coverSurface`).

### 9.7 Seek steps and acceleration

- Step sizes: `skipBackMs` default **10 s**, `skipForwardMs` default **30 s**, each 5–300 s step 5 (`AppPreference.kt:63-120`).
- `seekBarSteps` (default 16, 4–64) is **not used**. `Controller` passes a hardcoded `seekBarIntervals = 16` (`overlay/PlaybackController.kt:240`), `SeekBar` drops it (`// intervals = intervals` is commented out at `overlay/PlaybackControls.kt:275`), and `IntervalSeekBarImpl` (`SeekBar.kt:138-184`) has no `intervals` parameter at all. The focused seek bar moves by skipBack/skipForward × multiplier.
- `calculateSeekAccelerationMultiplier(repeatCount, durationMs)` (`W/ui/playback/SeekAcceleration.kt:9-52`). Returns 1 if repeatCount ≤ 0 or duration unknown. Let `s = repeatCount / 3` (integer division); if `s <= 0` return 1. Then by `durationMinutes`:

| Duration | s ranges → multiplier |
|---|---|
| < 30 min | s<30 →1, else 2 |
| < 90 min | <13 →1, <50 →2, <75 →3, else 4 |
| < 150 min | <20 →1, <40 →2, <60 →4, else 6 |
| ≥ 150 min | <20 →1, <40 →3, <60 →6, else 10 |

- Hold-to-seek with **controls hidden** (`PlaybackKeyHandler.kt:129-172`). Keys: Left/L1/L2 back, Right/R1/R2 forward.
  - KeyDown with repeat 0: arm.
  - Repeats 1..7 (`HOLD_TO_SEEK_REPEAT_START_COUNT = 8`): swallowed.
  - Repeat ≥ 8: seek by `step × multiplier(repeat − 8)` **on every repeat**.
  - KeyUp: if no repeat-seek happened, one ×1 step (so a tap seeks on key *up*).
- **Focused seek bar** (`SeekBar.kt:220-284`): the same pattern but **without** the 8-repeat delay. Each repeat seeks by `step × multiplier(repeatCount)`. A tap seeks on KeyUp. Seeks go through the 750 ms debounced `SeekBarState`; the UI shows the pending position.
- Tests: `T/ui/playback/SeekAccelerationTest.kt`.

### 9.8 Key mapping (`PlaybackKeyHandler.onKeyEvent`, `:42-127`; identifiers `KeyIdentifier.kt`)

Key groups:
- **Enter** = DirectionCenter, Enter, NumPadEnter, ButtonSelect, ButtonA.
- **Back** = Back, ButtonB.
- **Directional** = Up/Down/Left/Right plus the 4 diagonals.
- **ControllerMedia** = L1/L2/R1/R2.
- **Media** = Play, Pause, PlayPause, FastForward, SkipForward, Rewind, SkipBackward, Next, Previous, Captions, AudioTrack, Stop.

Order of evaluation for each event:

1. Any KeyUp → `reportInteraction()`, which updates `lastInteractionDate`. Next-up autoplay is suppressed when `passOutProtectionMs > 0` and no interaction happened within that window (`PlaybackViewModel.kt:1313-1323`). The web pointer/touch/wheel handlers must also report interaction, or pass-out protection will stop autoplay for mouse users.
2. `controlsEnabled == false` → not handled. The handler is built under `remember(preferences)`, so `controlsEnabled = (state.nextUp == null)` is captured once and not updated when next-up appears. **AMBIGUOUS:** the port should decide explicitly whether keys stay live while the next-up panel is shown (see §7).
3. Hold-skip handler (above) when controls are hidden and the key is a skip-back/forward key. Consumes both Down and Up.
4. Other KeyDown → not handled. Everything below acts on **KeyUp**.
5. Directional / Enter / ControllerMedia while **controls hidden**:
   - Left/Right (and L1/L2/R1/R2, which behave the same, hold acceleration included) are already handled in step 3. Their tap/hold seek goes through `seekBy`, which honours `dpadSeekMode` (`PlaybackKeyHandler.kt:83-91`, `187-199`). In SEEKBAR_TRICKPLAY mode a step does not seek immediately: it moves a pending position (clamped 0..duration; a direction reversal resets the accumulator), shows the `DpadSeekOverlay` (cleared 1.5 s after the last change) and commits through the same 750 ms debounced `SeekBarState` (`PlaybackPage.kt:230-246`, `387-454`; `overlay/SeekBarState.kt:44-52`). In the other modes it seeks immediately and shows the SkipIndicator (plus the 3 dp progress line in SEEKBAR_MINIMAL). MediaFastForward/Rewind/SkipForward/SkipBackward (step 6) always seek immediately with the SkipIndicator, regardless of mode.
   - Enter while the trickplay D-pad overlay is visible → dismiss it.
   - Enter with `oneClickPause` → toggle play/pause; on resume, apply skipBackOnResume.
   - Otherwise (Up, Down, Enter without one-click) → `showControls()`.
   - While **controls visible**, these keys go to Compose focus; the handler does nothing.
6. Media keys:

   | Key | Action |
   |---|---|
   | Play / Pause / PlayPause | no-op here; MediaSession handles them, including skipBackOnResume |
   | FastForward / SkipForward | `seekForward(skipForward)` + indicator |
   | Rewind / SkipBackward | `seekBack(skipBack)` + indicator |
   | Next | `playNextUp()` |
   | Previous | `playPrevious()` (always the previous item, unlike the on-screen button; with no previous item it logs a warning and does nothing, it does not restart) |
   | Captions | Captions dialog |
   | AudioTrack | Audio dialog |
   | Stop | `player.stop()` and go back |

7. Back while controls visible → hide controls (consumed).
8. Anything else → `pulseControls()`, not consumed. Back while controls are hidden therefore falls through to the BackHandlers in this order: Skip segment button visible → dismiss it; Next Up visible → cancel or exit (§7); else navigate back, which ends playback.

---

## 10. Errors and automatic fallback

**`onPlayerError`** (`PlaybackViewModel.kt:1418-1458`):
- TRANSCODE → `LoadingState.Error("Error during playback", error)`, which is a full-screen error page.
- DIRECT_PLAY or DIRECT_STREAM → `changeStreams(…, positionMs = currentPosition, enableDirectPlay = false, enableDirectStream = false)`, i.e. straight to **full transcode** (direct stream is skipped), then `prepare(); play()`.
- There is no retry counter, but a second error would be in TRANSCODE and stop there. This "stops there" applies only to `onPlayerError`.
- `onPlayerError` does nothing when `currentPlayback` is null (`:1421`).
- The DP/DS fallback re-sends `currentPlayback.audioIndex` and `subtitleIndex`. These hold `TrackIndex.DISABLED` (-2), not null, when no track was chosen, so PlaybackInfo gets `AudioStreamIndex`/`SubtitleStreamIndex = -2` (`:1441-1449`, `:808-811`; §1.3).

**Track-activation failure.** A `TracksChangedListener` failure retries with `enableDirectPlay = false, enableDirectStream = true` (direct stream). This happens in DIRECT_PLAY with an audio or subtitle index set, and in any play method (TRANSCODE included) when an external subtitle is used. On MPV with an external subtitle the listener is re-armed instead (`PlaybackViewModel.kt:852-893`; `TracksChangedListener.kt:15-39`; §1.3).

Other errors:
- PlaybackInfo `errorCode` (e.g. NotAllowed, NoCompatibleStream, RateLimitExceeded) → error page with the code name.
- No URL → permission error message.
- A source that supports none of DP, DS or Transcode throws "No supported playback method" (`:745-751`).
- An empty PlaybackInfo `mediaSources` list does nothing: no error state, and `loading` is never set to Success (§1.3; `:709-710`).
- A `PlaylistCreationResult.Error` at startup becomes `LoadingState.Error(message, ex)`, shown as the full-screen `ErrorMessage` (`:363-366`; `PlaybackPage.kt:128-131`).
- Unsupported item type / no source → `play()` returns false after a toast, and the caller continues in the direction it was going: forward (`playNextUp`) for initial play, next and queue picks, backward (`playPrevious`) when going to previous (§7; `:469-476`, `:513-520`, `:416-418`).

---

## 11. Live TV, trailers, extras

**Live TV**:
- Only `BaseItemKind.TV_CHANNEL` is treated as live.
- Effects:
  - no media-source choice (`MediaSourceId=null`);
  - no audio or subtitle choice (both null, because `mediaSource` is null);
  - `AutoOpenLiveStream=true`, so the server opens the tuner and returns `liveStreamId`;
  - the direct-play URL carries `LiveStreamId` (`PlaybackViewModel.kt:717-724`; test `T/ui/playback/PlaybackViewModelTests.kt:296-336`, which uses a movie source with a `liveStreamId`, not a TV_CHANNEL). The Start, Progress and Stopped reports carry it too (`W/util/TrackActivityPlaybackListener.kt:67`, `96`, `141`);
  - `mediaSource` is null, so `videoStream` is null and `createPlayer(hdr=false, is4k=false)` is called. Backend choice (for example PREFER_MPV rules keyed on HDR or 4K) never sees the channel's real video properties. Trickplay is never loaded, because `trickPlayInfo` is keyed by the media source id. Refresh-rate switching still runs from the PlaybackInfo response's video stream (`PlaybackViewModel.kt:480`, `495-500`, `522-536`, `573-579`, `814-823`).
- No explicit `POST /LiveStreams/Close`; the code relies on the Stopped report.
- Controls are identical to VOD: `canSeek = true` is reported, seek buttons exist, and segments are still fetched. There is no live-edge or guide UI in the player.
- Programs navigate to their channel.
- **AMBIGUOUS**: there is no live-specific handling of duration, position or the seek bar for infinite streams.

**Trailers** (`W/services/TrailerService.kt`):
- Local trailers: `GET /Items/{id}/LocalTrailers`, fetched only when `localTrailerCount` is non-null and `> 0` → `Destination.Playback(trailerId, 0)` (`TrailerService.kt:28-75`).
- Remote trailers (`item.remoteTrailers`):
  - Entries with a null `url` are dropped. A null `name` falls back to the singular "Trailer" plural string.
  - Sort keys are case-insensitive substring matches, tested in this order: "Official Trailer" = 0, "Official Theatrical Trailer" = 0, "Teaser" = 10, "Trailer" = 1, else 5; ties break by name. Because "Teaser" is tested before "Trailer", "Teaser Trailer" sorts last.
  - The subtitle is "YouTube" only when the host is exactly `youtube.com` or `www.youtube.com` (not `youtu.be` or `m.youtube.com`).
  - Opening one fires `Intent.ACTION_VIEW(url)`, which hands off to the YouTube app or a browser.

**Extras** (`W/services/ExtrasService.kt:35-97`): `GET /Items/{id}/SpecialFeatures`, dropping ThemeSong, ThemeVideo and Trailer, then grouped by `extraType` (null → Unknown) and sorted Trailer, Featurette, Short, Clip, Scene, Sample, DeletedScene, Interview, BehindTheScenes, ThemeSong, ThemeVideo, Unknown (`:103-120`).
- A type with exactly one item becomes an `ExtrasItem.Single` card. Its title is the item title, or the type's singular name if the title is blank; its subtitle is the type name when there is a title. Clicking it goes to `Destination.Playback(item)`, whose secondary constructor is `this(item.id, item.resumeMs)`, so it **resumes** from the saved position and does not start at 0 (`W/data/ExtrasItem.kt:79-82`; `W/ui/nav/Destination.kt:95`).
- A type with several items becomes an `ExtrasItem.Group` card: title = type name, subtitle = "N items", image from a random member, played = all played. Clicking it **does not play**: it opens an `ItemGrid` of those ids, sorted `SortName` ascending, 3 columns, spacing 24, WIDE aspect ratio (`ExtrasItem.kt:45-62`).

---

## 12. Backends, external player, refresh rate

### 12.1 Backend selection (`PlaybackViewModel.kt:235-275`)

`backend = destination.backend ?: prefs.playerBackend`:

| Pref value | Backend |
|---|---|
| EXO_PLAYER (default) | ExoPlayer |
| MPV | MPV |
| PREFER_MPV | ExoPlayer if the video is HDR, or 4K with MPV hardware decoding off; otherwise MPV |
| EXTERNAL_PLAYER | throws here; it is routed to PlayExternalPage instead |

Definitions used here (`PlaybackViewModel.kt:522-536`, `239-275`):
- HDR = the first video stream has `videoRange == HDR`, or `videoRangeType` not in {SDR, UNKNOWN}.
- 4K = `width > 2560 || height > 1440` (width-based because wide-aspect 4K has a lower height).
- "MPV hardware decoding off" = `!mpvOptions.enableHardwareDecoding`.
- The player is recreated only when the chosen backend differs from the current player's.

Backend-specific UI differences (`PlaybackPage.kt:176-184`, `758`, `787-788`; `PlayerFactory.kt:86-100`, `139-157`):
- MPV forces `ContentScale.FillBounds`, and the "Video scale" entry is disabled for MPV (`enableVideoScale = player !is MpvPlayer`).
- Playback speed is enabled only for MPV, or for ExoPlayer when an audio decoder is active (disabled during audio passthrough, issue #164).
- libass rendering (`AssHandler`/`AssSubtitleView`) exists only for the ExoPlayer backend.

**MPV.** The real implementation is a **closed AAR** (`libs/wholphin-mpv-release.aar` or the `wholphin.extensions.mpv` artifact). This repo only contains a stub (`reference/wholphin/wholphin-mpv-stub/.../MpvPlayer.kt`; `app/build.gradle.kts:34-35`, `389-397`). Its internals, including how it maps track indexes, are **unknown**. Options are `enableHardwareDecoding` (default true) and `useGpuNext` (default false), plus an mpv.conf editor (`MpvConfFile` pref).

**ExoPlayer extras** (`PlayerFactory.kt:95-201`):
- FFmpeg extension renderer mode from `mediaExtensionsEnabled`.
- dav1d AV1 software decoder when `decodeAv1`.
- Decoder fallback on.
- Constant-bitrate seeking.
- Optional DV profile 7 → 8.1 bitstream conversion (experimental; only when the device lacks DV-EL but has DV P8) and an HDR10+ masking filter.
- Optional tunneling and audio offload control (experimental).
- Audio attributes: movie / media.

**Debug overlay** (`overlay/PlaybackDebugOverlay.kt:58-173`). It replaces the logo and clock and shows only while controls are visible.
- All text is `bodySmall` at 10 sp in `onSurface`, with key-column widths of 80 dp (cols 1-2) and 64 dp (cols 3-4). Memory is "used / total", refreshed every 2 s. When debug info is on, the bottom OSD scrim is also hidden, and the overlay is limited to screen height minus controller height (`PlaybackDebugOverlay.kt:86-130`; `PlaybackOverlay.kt:127`, `331-350`; `PlaybackViewModel.kt:1563-1572`).
- Col 1: Backend, Play method, Video decoder and Audio decoder (both rows only when the backend is EXO_PLAYER; "(HW)" suffix on the video decoder needs API ≥ 29 `isHardwareAccelerated`; audio decoder shows "Non-ExoPlayer" when null, meaning passthrough), Display mode (`WxH@rate fps, id`, refreshed every 10 s).
- Col 2: measured bitrate, estimated bitrate, dropped frames (cumulative), JVM memory.
- Cols 3–4 (transcoding only): reasons, HW accel, container, bitrate; video codec/size, video direct, audio codec/channels, audio direct.
- Below: a track table (Selected ✓, ID, Type, Codec, Supported = HANDLED/EXCEEDS_CAPABILITIES/…, Labels). It shows the selected tracks only, with a "Show N more" button.

### 12.2 External player (`W/ui/playback/PlayExternalPage.kt`)

- Resolves the item or queue the same way, with the first item only.
- Source choice as in §2. Subtitle choice runs without an audio stream.
- URL: `GET /Videos/{id}/stream?static=true&mediaSourceId=` (always direct, no PlaybackInfo).
- The saved `ItemPlayback` is used only if it has a `sourceId`. `PlaybackList` destinations start at position 0, and an empty playlist toasts "Playlist is empty" and goes back (`:99-101`, `134-138`).
- External subtitle "subs" = **all** `mediaStreams` with `isExternal` (not filtered to subtitles), sorted by `(index == chosenSubtitle)` ascending, then `isDefault` ascending, so the chosen one is last and non-default externals come before default ones. Each URL is `/Videos/{destinationItemId}/{mediaSourceId}/Subtitles/{index}/Stream.{ext}`, where `ext` is the file extension of the stream's `path`, falling back to `srt`. The id is the destination's `itemId` (`routeItemId = itemId`), not the resolved playlist item's id (`:184-199`).
- Launches `ACTION_VIEW video/*` (`:208-264`). The component is the `externalPlayer` pref, used only if that player is still installed; otherwise null (system resolver). Extras:
  - Common: `title` = `"${item.title} ${item.subtitleLong}"`.
  - MX/mpv: `position`, `return_result`, `secure_uri=true`, `subs`, `subs.name`, `subs.enable` (set only when the chosen subtitle is one of the externals)
  - VLC: `from_start` = (`positionMs == 0`), `subtitles_location` = the first sub URL, `extra_duration` = source runtime ms
  - Vimu: `startfrom`, `forceresume=false`, `forcename`, `forcedsrt` (only when the chosen external's codec is `srt`)
- Reports Start (`DIRECT_PLAY`, `canSeek=false`) with the destination `itemId`, which for a `PlaybackList` can be the container rather than the played item, while Stopped uses the resolved item id (**AMBIGUOUS**, `:265-275`).
- On the activity result (`:306-372`), a result is accepted on `RESULT_OK`, `RESULT_CANCELED`, or Vimu's resultCode 1 with action `net.gtvbox.videoplayer.result`. Stop position:
  - VLC (`org.videolan.vlc.player.result`): long `extra_position` > 0.
  - mpv (`is.xyz.mpv.MPVActivity.result`), MX (`com.mxtech.intent.result.VIEW`) and Vimu: int `position` ≥ 0.
  - Unknown apps: int `position`, then long `position`.
  - Stopped is reported (with `MediaSourceId`) only if a position was found or the result has an action. Any other result code toasts "Unknown result from external player". It always navigates back afterwards.

### 12.3 Lifecycle

See §5: the player pauses when the activity pauses and resumes if it was playing.

### 12.4 Refresh rate / resolution switching (`W/services/RefreshRateService.kt`)

- Runs on each full (PlaybackInfo) `changeStreams`, not on the in-place direct-play track switch (which returns early), when `refreshRateSwitching || resolutionSwitching` (both default false). The input is the returned source's first VIDEO stream (`PlaybackViewModel.kt:646-659`, `814-824`).
- Inputs (`RefreshRateService.kt:49-66`, `79-114`, `180-208`): with refresh switching off, the target rate is the display's current refresh rate, not the stream's. The stream rate is `MediaStream.realFrameRate`; nothing switches if width, height or rate is missing. Modes are pre-sorted by area descending, then rate ascending. The "next higher" / "acceptable" steps use `lastOrNull` over that order, so they pick the smallest qualifying area and the highest matching rate. Nothing happens if the target mode equals the current mode.
- Candidate modes:
  - must be ≥ stream width/height;
  - with refresh switching, must also have a rate that is an exact multiple of the fps (×1000, rounded), or exactly 2.5× (e.g. 24→60).
- Without resolution switching: prefer the exact rate with max resolution, else max resolution.
- With resolution switching: exact res+rate → next higher res with exact rate → exact res with acceptable rate → higher res with acceptable rate → max res with exact rate → max res.
- Switch via `MainActivity.changeDisplayMode(modeId)` and wait up to 5 s for the display-changed callback; on timeout, toast "Refresh rate switch is taking a long time". If the switch is not seamless, wait a further 2 s. "Seamless" = the target rate ×1000 (rounded) equals the current mode's, or (API ≥ 31) any of the current mode's `alternativeRefreshRates` ×1000 is a multiple of the target.
- Reset to mode 0 on ViewModel close, but only when `refreshRateSwitching` was enabled at init (§1.1 step 2; resolution-only switching does not reset: AMBIGUOUS, likely a bug).
- Tests: `T/test/TestDisplayModeChoice.kt`.

---

## 13. Every playback-related preference

Proto: `P/:68-103` and overrides `P/:51-66`. "Stored default" is what a fresh install writes (`AppPreferencesSerializer.kt:28-82`). Fields not written there get the proto3 zero value.

### Playback preferences

| Pref (proto) | Type | Default | Range / options | Meaning |
|---|---|---|---|---|
| skip_forward_ms | int64 ms | 30 000 | 5–300 s step 5 | FF button, media key, Right step |
| skip_back_ms | int64 ms | 10 000 | 5–300 s step 5 | REW button, media key, Left step |
| controller_timeout_ms | int64 | 5000 | 500–15000 step 100 | controls auto-hide |
| seek_bar_steps | int32 | 16 | 4–64 | **unused** (§9.7) |
| show_debug_info | bool | false | | debug overlay initially on |
| auto_play_next | bool | true | | autoplay the next-up item |
| auto_play_next_delay_seconds | int64 s | 15 | 0–60 step 5 (0 = immediate) | countdown |
| skip_back_on_resume_seconds | int64 **ms** (misnamed) | 0 | 0–10 s | rewind applied when un-pausing |
| max_bitrate | int64 bps | 104 857 600 | `bitrateValues` | profile + PlaybackInfo cap |
| skip_intros / skip_outros / skip_commercials | enum | ASK_TO_SKIP | IGNORE, AUTO_SKIP, ASK_TO_SKIP | §6 |
| skip_previews / skip_recaps | enum | IGNORE | same | §6 |
| pass_out_protection_ms | int64 | 7 200 000 (2 h) | 0–3 h | autoplay is suppressed if there has been no key press for this long |
| global_content_scale | enum | FIT (proto 0) | FIT, NONE, CROP, FILL, FILL_WIDTH, FILL_HEIGHT | initial video scale |
| show_next_up_when | enum | END_OF_PLAYBACK | END_OF_PLAYBACK, DURING_CREDITS, NEXT_UP_NEVER | §7 |
| one_click_pause | bool | false | | Enter toggles pause while controls are hidden |
| player_backend | enum | EXO_PLAYER | EXO_PLAYER, MPV, PREFER_MPV, EXTERNAL_PLAYER | §12 |
| mpv_options.enable_hardware_decoding | bool | true | | MPV |
| mpv_options.use_gpu_next | bool | false | | MPV |
| refresh_rate_switching | bool | false | | §12.4 |
| resolution_switching | bool | false | | §12.4 |
| external_player | string (component) | "" | installed players | §12.2 |
| cinema_mode | bool | true | | play server intros when starting from 0 |
| dpad_seek_mode | enum | SEEKBAR_MINIMAL | MINIMAL, TRICKPLAY, NONE | §9.6 |

### Overrides

| Pref | Type | Default | Meaning |
|---|---|---|---|
| ac3_supported | bool | true | allow AC3/EAC3 in the profile |
| downmix_stereo | bool | false | audio codecs aac/mp2/mp3 only, ≤2 ch |
| direct_play_pgs | bool | true | PGS Embed allowed |
| media_extensions_enabled | enum | MES_FALLBACK | FFmpeg renderer: fallback / preferred / disabled |
| decode_av1 | bool | UI default true (`AppPreference.DecodeAv1`, `:521-531`), but **stored default false**: `AppPreferencesSerializer` does not write it (`:60-72` sets only ac3Supported, downmixStereo, directPlayPgs, mediaExtensionsEnabled, assPlaybackMode) and no `AppUpgradeHandler` migration sets it (`:163-172`, `347-352`), so a fresh install has `decodeAv1 = false` until the user toggles it (`DeviceProfileService.kt:68`) | software AV1 (dav1d). Changes the AV1 codec profile, the AV1 max-resolution profile and the AV1 HDR exclusion set (§1.5) |
| ass_playback_mode | enum | ASS_LIBASS | LIBASS, EXO_PLAYER, TRANSCODE |
| max_resolution | int32 height | 0 (no limit) | 0, 4320, 2160, 1080, 720, 576, 480, 360 |
| hdr10 / hdr10_plus / dovi_profile_5 / dovi_profile_7 / dovi_profile_8 _override | enum | AUTO | AUTO, ENABLE (treat as supported), DISABLE (force transcode) — §1.5 |

**Setter side effects** (`AppPreference.kt:402-430`, `906-934`) that the port must copy:
- Turning `ac3_supported` OFF also sets experimental `prefer_ac3_surround = false`.
- Turning `downmix_stereo` ON also sets `prefer_ac3_surround = false`.
- Turning `resolution_switching` ON forces `refresh_rate_switching = true`.
- Turning `refresh_rate_switching` OFF forces `resolution_switching = false`.
- UI ranges (`:271-345`): `skip_back_on_resume` step 1 s; `pass_out_protection` step 1 h (0 = disabled); `auto_play_next_delay` 0 is labelled "Immediate".

### Experimental (all default false, gated by `enabled`)

| Pref | Meaning |
|---|---|
| video_tunneling_enabled | ExoPlayer tunneling |
| prefer_ac3_surround | transcode >2-channel non-AC3 audio to AC3 |
| disable_audio_offload | turn off audio offload |
| prefer_dolby_vision_over_hdr10_plus | mask HDR10+ metadata |
| convert_dolby_vision_profile_7 | convert DV P7 to 8.1 |

### Interface prefs used by the player

| Pref | Default | Meaning |
|---|---|---|
| show_clock | true | clock top-right while controls are visible |
| subtitles_preferences / hdr_subtitles_preferences | see §4.3 | subtitle styling |

### Per server user (Room)

| Pref | Default |
|---|---|
| preferredAudioLanguage | "" (use profile) |
| preferredSubtitleLanguage | "" (use profile) |
| subtitleMode | USE_USER_PROFILE |

---

# Part 2 — Browser mapping (RECOMMENDATIONS)

Everything below is engineering judgment for a React + TypeScript + `<video>` + hls.js + libass-WASM client. Browser capability statements reflect general knowledge as of 2025–2026. **Every one of them must be confirmed by runtime detection rather than hard-coded.**

## B1. Guiding principles

1. **Keep the server as the decision-maker**, exactly as Wholphin does. Send an honest, runtime-probed `DeviceProfile` and let `/PlaybackInfo` choose DirectPlay / DirectStream / Transcode. Do not add client-side "will this play?" logic beyond the profile, except the watchdog in B6.
2. **Two delivery paths only**:
   - (a) progressive `video.src = /Videos/{id}/stream?static=true…` for DirectPlay;
   - (b) HLS for DirectStream/Transcode. Use hls.js on Chromium and Firefox, and native HLS on Safari/iOS.
3. **Keep subtitles out of the video pipeline.** Text and ASS subtitles are delivered `External` and rendered by our own overlay (VTT renderer / JASSUB). This keeps styling, subtitle delay and track switching identical across all three play methods and avoids burn-in.
4. **Track switches** that the browser cannot do natively become a PlaybackInfo restart at the current position. This is the same restart path Wholphin already uses for DS/Transcode.

## B2. Capability detection

Probe once at startup, cache, and re-probe when the user changes overrides. Use three APIs, because each answers a different question:

| Question | API |
|---|---|
| Can a *progressive file* of type X play? (DirectPlay) | `video.canPlayType('video/mp4; codecs="hvc1.1.6.L150.B0, mp4a.40.2"')`, plus `navigator.mediaCapabilities.decodingInfo({type:'file', video:{…}, audio:{…}})` |
| Can *MSE/hls.js* play fMP4 with X? (DirectStream/Transcode via hls.js) | `MediaSource.isTypeSupported('video/mp4; codecs="…"')` (or `ManagedMediaSource.isTypeSupported` on iOS 17.1+), plus `decodingInfo({type:'media-source',…})` |
| Is it smooth and power-efficient at this size and bitrate? Is HDR possible? | `decodingInfo` → `{supported, smooth, powerEfficient}` with `width/height/bitrate/framerate`, `transferFunction:'pq'\|'hlg'`, `colorGamut:'rec2020'`, `hdrMetadataType:'smpteSt2086'\|'smpteSt2094-10'\|'smpteSt2094-40'`; display via `matchMedia('(dynamic-range: high)')` / `(video-dynamic-range: high)` |

**Probe matrix.** Codec strings are examples; probe several levels and take the highest that is supported.

| Feature | Probe string(s) | Maps to profile |
|---|---|---|
| H.264 High / Main / Baseline | `avc1.640033`, `avc1.4D4033`, `avc1.42E01E` | `h264` + VideoProfile list + VideoLevel cap |
| H.264 High10 | `avc1.6E0033` | add `high 10` (usually unsupported in browsers) |
| HEVC Main / Main10 | `hvc1.1.6.L153.B0` / `hvc1.2.4.L153.B0` (also try `hev1.`) | `hevc`, `main`/`main 10`, level |
| AV1 8 / 10-bit | `av01.0.08M.08` / `av01.0.12M.10` | `av1` (+ "no main 10" if 10-bit fails) |
| VP9 profile 0 / 2 | `vp09.00.40.08` / `vp09.02.40.10` | `vp9` |
| VP8 | `vp8` (webm) | `vp8` |
| AAC / MP3 / Opus / FLAC / Vorbis | `mp4a.40.2`, `mp4a.69`/`mp3`, `opus`, `flac`, `vorbis` | audio lists |
| AC-3 / E-AC-3 | `ac-3`, `ec-3` | `ac3`, `eac3` |
| DTS / TrueHD | `dtsc`/`dtse`/`dtsx`, `mlpa` | almost always absent; never assume |
| HDR10 / HLG / HDR10+ / DV | `decodingInfo` with PQ/HLG + rec2020, hdrMetadataType; DV via `dvh1.08.06`/`dvh1.05.06` | VideoRangeType EqualsAny list |
| Containers (progressive) | `video/mp4`, `video/webm`, `video/quicktime`(Safari), `video/x-matroska` | DirectPlay containers |

**Expected per-browser results.** Typical results only; detect at runtime.

| | Chromium (Chrome/Edge desktop) | Firefox | Safari macOS / iOS |
|---|---|---|---|
| H.264 | yes (High ≤ L5.2; no Hi10P) | yes (via OS decoders) | yes |
| HEVC | **hardware-dependent**: Chrome 107+ on Windows/macOS/ChromeOS with GPU support, both progressive MP4 and MSE fMP4. Edge similar. Not in MKV | historically no. Recent Windows builds expose hardware HEVC in some configurations; treat as unknown | yes (Main/Main10) |
| AV1 | yes (dav1d software; hardware where present) | yes | only on Apple silicon with an AV1 hardware decoder (M3/A17+) |
| VP9 | yes | yes | partial (MSE on macOS); weak on iOS |
| AC3 / EAC3 | Chrome: generally no on Windows/Linux; Edge on Windows: often yes | no | yes (decoded; EAC3-JOC/Atmos possible over HLS on Apple outputs) |
| DTS / TrueHD | no | no | no |
| HDR | Windows with HDR enabled: HEVC Main10/VP9.2/AV1 PQ & HLG; tone-maps otherwise | limited / unreliable | HDR10/HLG/DV (P5, P8.1 in HLS fMP4) on capable displays |
| HLS | via hls.js (MSE) | via hls.js | **native** (prefer it); hls.js also works on macOS |
| MKV progressive | Chrome's WebM demuxer may play some Matroska files, but `canPlayType` says no and it is unreliable. **Treat MKV as not direct-playable** | no | no |
| `audioTracks` API | behind flag (unusable) | behind pref (unusable) | yes |
| PiP | `requestPictureInPicture` | its own UI only (no API) | yes (+ iOS native) |

## B3. Proposed `DeviceProfile` (sent in `POST /Items/{id}/PlaybackInfo`)

This is built from the probe results; `{…}` marks probed values. Server JSON uses PascalCase. The structure deliberately mirrors Wholphin's (`DeviceProfileUtils.kt`), adapted for the web.

```jsonc
{
  "Name": "Wholphin-Web",
  "MaxStreamingBitrate": {prefs.maxBitrate},          // same bitrateValues ladder & 1024² "Mbit" as Wholphin
  "MaxStaticBitrate":    {prefs.maxBitrate},
  "MusicStreamingTranscodingBitrate": 384000,

  "DirectPlayProfiles": [
    // Progressive only: containers the <video> element can demux
    { "Type": "Video", "Container": "mp4,m4v{,mov if Safari}",
      "VideoCodec": "h264{,hevc}{,av1}{,vp9}",
      "AudioCodec": "aac,mp3{,opus}{,flac}{,ac3}{,eac3}{,alac if Safari}" },
    { "Type": "Video", "Container": "webm",
      "VideoCodec": "vp8,vp9{,av1}", "AudioCodec": "opus,vorbis" },
    // Remote HLS sources (e.g. .strm to m3u8). Mirrors Wholphin's "hls" container entry
    { "Type": "Video", "Container": "hls", "VideoCodec": "h264{,hevc}", "AudioCodec": "aac{,ac3}{,eac3}" },
    { "Type": "Audio", "Container": "mp3,aac,m4a,flac,webma,webm,wav,ogg", "AudioCodec": "…" }
  ],

  "TranscodingProfiles": [
    // fMP4 HLS: carries HEVC/AV1 and works with hls.js and native Safari.
    // Wholphin uses "ts". On the web, prefer fMP4 because hls.js transmuxes TS for AVC/AAC only
    // (HEVC-in-TS support in hls.js is version-dependent; verify).
    { "Type": "Video", "Context": "Streaming", "Protocol": "hls", "Container": "mp4",
      "VideoCodec": "{hevc,}h264", "AudioCodec": "aac{,ac3}{,eac3}{,opus}{,flac}",
      "MaxAudioChannels": "{downmix ? 2 : 6}",
      "BreakOnNonKeyFrames": true, "CopyTimestamps": false,
      "EnableSubtitlesInManifest": false },            // subtitles always External (B5)
    // Safety net for old engines: TS + AVC/AAC
    { "Type": "Video", "Context": "Streaming", "Protocol": "hls", "Container": "ts",
      "VideoCodec": "h264", "AudioCodec": "aac", "MaxAudioChannels": "2" },
    { "Type": "Audio", "Context": "Streaming", "Protocol": "hls", "Container": "mp4", "AudioCodec": "aac" }
  ],

  "CodecProfiles": [
    { "Type": "Video", "Codec": "h264", "Conditions": [
      { "Condition": "EqualsAny", "Property": "VideoProfile", "Value": "high|main|baseline|constrained baseline", "IsRequired": false },
      { "Condition": "LessThanEqual", "Property": "VideoLevel", "Value": "{51|52}", "IsRequired": false },
      { "Condition": "EqualsAny", "Property": "VideoRangeType", "Value": "SDR", "IsRequired": false } ] },
    { "Type": "Video", "Codec": "hevc", "Conditions": [
      { "Condition": "EqualsAny", "Property": "VideoProfile", "Value": "main{|main 10}", "IsRequired": false },
      { "Condition": "LessThanEqual", "Property": "VideoLevel", "Value": "{153|183}", "IsRequired": false },
      { "Condition": "EqualsAny", "Property": "VideoRangeType",
        "Value": "SDR{|HDR10}{|HLG}{|HDR10Plus}{|DOVI|DOVIWithHDR10|DOVIWithHLG|DOVIWithSDR (Safari only)}", "IsRequired": false } ] },
    { "Type": "Video", "Codec": "av1",  "Conditions": [ /* VideoProfile main, 10-bit if probed; VideoRangeType like hevc */ ] },
    { "Type": "Video", "Codec": "vp9",  "Conditions": [ /* VideoRangeType SDR{|HDR10|HLG} */ ] },
    // Max resolution pref: same semantics as Wholphin MaxResolution
    { "Type": "Video", "Conditions": [ { "Condition": "LessThanEqual", "Property": "Height", "Value": "{maxResolution}" } ] },  // only if set
    // H.264 ref-frame guards are Android-decoder specific; omit unless issues appear
    { "Type": "VideoAudio", "Conditions": [
      { "Condition": "LessThanEqual", "Property": "AudioChannels", "Value": "{downmix ? 2 : 6}", "IsRequired": false } ] }
  ],

  "SubtitleProfiles": [
    { "Format": "vtt",    "Method": "External" },   // server converts srt/subrip/ttml/etc. to VTT on the delivery URL
    { "Format": "ass",    "Method": "External" },   // raw .ass for JASSUB (when ASS mode = libass)
    { "Format": "ssa",    "Method": "External" },
    { "Format": "pgssub", "Method": "External" },   // ONLY if the WASM PGS renderer is enabled (B5); else omit
    { "Format": "pgssub", "Method": "Encode" },
    { "Format": "dvdsub", "Method": "Encode" },
    { "Format": "dvbsub", "Method": "Encode" }
  ]
}
```

PlaybackInfo body: identical to Wholphin's (§1.3), with two changes. Send `MaxAudioChannels` (2 or 6) instead of null, and send `UserId`.

Wholphin details the proposal above does not carry over (`DeviceProfileUtils.kt`):
- The max-resolution pref is applied in three places: (1) a `Height <= maxResolution` condition on the video **TRANSCODING** profile, so transcodes are downscaled (`:159-163`); (2) it clamps the probed H264/HEVC/AV1/VC1 max-resolution heights (`:64`, `113-116`); (3) it adds Height conditions for MPEG/MPEG2/VP8/VP9 (`:450-466`). The `Height` codec profile above is only (3)-style; add (1), otherwise a transcode is not limited to the chosen resolution.
- Audio: the `VideoAudio` channel cap is 2 (downmix) or 8, not 6. Downmix also limits the allowed codecs to aac/mp2/mp3. `ac3Supported=false` removes ac3/eac3. With `preferAc3ForSurround`, transcoding uses AC3 and every other codec gets `AudioChannels <= 2` (VideoAudio and Audio). The audio transcoding profile is TS/HLS with AAC (or AC3) (`:18-23`, `80-95`, `150-154`, `166-179`, `566-594`).

Notes:
- Jellyfin-web uses `EqualsAny` VideoRangeType lists. That is cleaner than Wholphin's `notEquals` + applyConditions trick (§1.5). The HDR override prefs map directly: ENABLE adds the type to the list, DISABLE removes it.
- When a DV file has an HDR10 base layer (`DOVIWithHDR10`) and the client lists `HDR10` but not `DOVI…`, Jellyfin 10.10+/10.11 *may* remux with the DV RPU stripped rather than transcode. **Verify against the target server version**; if not, it transcodes.
- Keep `"Name"` stable. The server may log or cache by it.

## B4. Feature-by-feature verdicts

Legend: **PD** = ports directly, **PC** = ports with changes, **NP** = not possible in a browser.

| Wholphin feature | Verdict | How / why / substitute |
|---|---|---|
| Item resolution, queue building, cinema-mode intros | PD | Same API calls (§1.1). Fix the duplicate-queue issue (§1.1 AMBIGUOUS) |
| Version choice, ItemPlayback, STC, subtitle-delay persistence | PC | Same algorithms (port `StreamChoiceService` verbatim as pure TS with unit tests transcribed from `T/test/TestSeriesTrackChoice.kt` and `StreamChoiceServiceTest.kt`). Storage moves from Room to IndexedDB (per server+user). Decide on the movie/parent-folder STC quirk (§2.2) |
| PlaybackInfo request + play-method decision | PD | Same body (B3) |
| Direct-play URL | PC | Same URL, but credentials must be in the query (`ApiKey=`) because `<video>` cannot send an Authorization header. Same for trickplay and subtitles if they are fetched as `<img>`/`<track>`. Fetch-based loads can use the header |
| Direct stream / transcode URL | PC | `transcodingUrl` via hls.js (Chromium/Firefox) or native (Safari). Set `hls.config.startPosition = positionMs/1000` instead of seeking after load |
| ExoPlayer in-player audio switch in direct play | PC | Only Safari has `audioTracks`. Elsewhere, an audio change becomes a **restart**. Recommended rule: if the chosen audio is not the file's default and the browser cannot switch, request PlaybackInfo with `EnableDirectPlay=false` (DirectStream remux, audio copied). This mirrors Wholphin's `TracksChangedListener` fallback |
| Audio switch in HLS | PC | Jellyfin's HLS carries the selected audio only, so a switch is a PlaybackInfo restart at the current position (Wholphin does the same in DS/Transcode). If a future server exposes multiple audio renditions, use `hls.audioTrack` |
| Subtitle switch | PC (better) | With all subtitles External and client-rendered, switching is instant in every play method. No restart unless switching to/from a burn-in format |
| Max-bitrate change | PD | Restart with a new PlaybackInfo, as Wholphin does |
| Playback speed | PC (better) | `video.playbackRate`. Always enabled, because there is no passthrough limitation (§9.5). Same options list |
| Video scale | PC | Fit = `object-fit: contain`, None = `none`, Crop = `cover`, Fill = `fill`. Fill-width / Fill-height need a computed `transform: scale()` from `videoWidth/videoHeight` versus the container |
| Subtitle delay | PC (better) | Wholphin only has it on MPV. On the web, offset VTT cue times in our renderer and JASSUB `timeOffset`; persist as `ItemTrackModification`. Offer it for all backends, with the same ±50/250/1000 ms buttons and 1.5 s debounced save |
| Text subtitle styling (incl. separate HDR style) | PC | Our own cue renderer over the video (React layer, not native `::cue`, which is too limited and inconsistent). Map: font size (sp) to px scaled to **video box height** (suggest `px = sp × videoBoxHeight / 540`, matching a 960×540 dp TV), color and opacity to rgba, outline to `-webkit-text-stroke` with `paint-order: stroke fill` (or multi-direction `text-shadow`), shadow to `text-shadow`, WRAP to per-line `background` with `box-decoration-break: clone`, BOXED to a container background, margin % to `bottom: margin% of video box`. Shrink/raise the subtitle area while controls are visible (Wholphin uses 70% height). Use the HDR style when `videoStream.hdr && useSeparateHdr`; show that setting only if `matchMedia('(dynamic-range: high)')` |
| ASS / SSA (libass) | PC | **JASSUB** (libass WASM, worker + OffscreenCanvas) over the video, sized to the rendered video rect (not the element box when letterboxed). **Fonts:** ExoPlayer's libass reads MKV attachments directly; the browser cannot. Fetch `mediaSource.MediaAttachments[*].DeliveryUrl` (fonts) and pass them to JASSUB `availableFonts/fonts`, with a fallback font. `ASS_EXO_PLAYER` mode becomes "convert to VTT" (server External vtt). `ASS_TRANSCODE` = Encode |
| PGS (image) subtitles | PC | Default: **burn-in** (Encode). This forces a full video transcode, which is very expensive for 4K HEVC, so warn in the debug overlay. Optional (pref replacing `direct_play_pgs`): WASM/JS PGS renderer (e.g. libpgs-js, which jellyfin-web 10.9+ uses) with `pgssub` External delivery. **Verify** that the target server extracts PGS as external `.sup` |
| DVD / DVB subtitles | NP (client) | No practical web renderer; burn-in only |
| Image subtitle opacity | PC | CSS opacity on the PGS canvas |
| Subtitle search & download | PD | Same three calls (§4.5), same permission gate, same polling and index-shift logic |
| Progress reporting | PC | Same calls, fields and 5 s timer (§5). Add: on `pagehide`/`beforeunload`, send Stopped with `fetch(…, {keepalive:true})` and the auth header (`sendBeacon` cannot set headers). Use `visibilitychange` to flush a progress report. Consider sending `MediaSourceId` (Wholphin omits it) |
| Transcode-info poll for debug | PD | `GET /Sessions?deviceId=` |
| Remote control (websocket Playstate) | PD | Same command mapping. Post capabilities with `SupportsMediaControl=true` |
| MediaSession (Android) | PC | **Media Session API**: `navigator.mediaSession.metadata` (title, series, artwork = Primary) and action handlers for play (apply skipBackOnResume), pause, seekbackward/seekforward (skip prefs), seekto, previoustrack/nexttrack (playlist), stop. Call `setPositionState` on time updates |
| Keep screen on | PC | `navigator.wakeLock.request('screen')` while playing; re-acquire on `visibilitychange` |
| Pause on background (lifecycle observer) | PC | Browsers keep playing in background tabs. Recommend **not** auto-pausing by default (desktop multitasking); make it an optional pref. Do pause on PiP close if desired |
| Media segments (skip / auto-skip) | PD | Same fetch, 500 ms poll (or `timeupdate` plus a 500 ms check), same per-type rules, 10 s auto-dismiss, `end + 1 ms` seek |
| Next up / autoplay / pass-out protection | PC | Same logic. "Interaction" becomes any keyup, pointerdown or pointermove over the player. Autoplay policy: the next item is played in the same `<video>` (or after a source swap) in a page that already has sticky user activation, so audible autoplay is allowed. Do not unmount and remount the element through a navigation that loses activation (iOS Safari is strictest) |
| Queue / chapters rows | PD | Same UI states (HIDDEN/CONTROLLER/CHAPTERS/QUEUE). Chapter images: `/Items/{id}/Images/Chapter/{index}?tag={imageTag}` |
| Trickplay | PD | Same URL and tile math. Render a `div` with `background-image` sheet, `background-position: -col*w -row*h`, and `background-size: tileWidth*w`, scaled to 160 px tall. Prefetch sheets with `new Image()` |
| Cinema-mode intros | PD | Same `/Intros` call |
| Refresh-rate / resolution switching | NP | There is no web API to change the display mode. Substitute: nothing. Document that Windows/macOS auto-match only in their native players. Optionally show the measured content fps in the debug overlay |
| MPV backend (+ PREFER_MPV) | NP | Not embeddable (native code, closed AAR). Substitute: the server remux/transcode path. Hide the backend pref; map `Play with → MPV` to "Play with → Direct stream (remux)" |
| ExoPlayer FFmpeg extension, dav1d AV1 | NP / PC | Software decoders are the browser's own. Chromium already decodes AV1 in software. A software HEVC/AC3/DTS via WASM is impractical for video; for audio it is theoretically possible but not recommended |
| Audio passthrough / offload (AC3/EAC3/DTS/TrueHD bitstreaming) | NP | Browsers decode to PCM; there is no bitstreaming. Substitute: list AC3/EAC3 only where decodable (Edge/Safari). Otherwise the server transcodes surround to AAC/Opus multichannel (MaxAudioChannels 6) or stereo (downmix pref). Drop `prefer_ac3_surround`, `disable_audio_offload` and `ac3_supported` (the last becomes auto-detected, optionally user-forceable off) |
| HDR10 / HLG | PC | Detect with `decodingInfo` + `dynamic-range` media query; list them in VideoRangeType only when both decoder and display support them. Otherwise the server tone-maps (if enabled on the server), else output is washed out |
| HDR10+ | PC (mostly NP) | No browser renders HDR10+ dynamic metadata. List `HDR10Plus` only if the base HDR10 is supported (it plays as HDR10) |
| Dolby Vision (P5, P7, P8.x) | PC (Safari only) / NP elsewhere | Safari on DV-capable Apple hardware: P5 and P8.1 in fMP4 (`dvh1`/`dvhe`). Elsewhere: P8.1/P8.4 can play as HDR10/HLG base layer if the server delivers it that way (see B3 note); P5 needs a transcode. P7 FEL is never supported. The DV profile 7 conversion and HDR10+ masking experimentals are NP |
| Hardware decoder name in debug overlay | PC | No API exposes decoder names. Show `decodingInfo().powerEfficient` as a "HW likely" hint, `video.getVideoPlaybackQuality()` dropped/total frames, `hls.bandwidthEstimate`, measured segment throughput, `performance.memory` (Chromium only), and screen `width×height×devicePixelRatio`. The track table becomes the hls.js levels/audio list plus our chosen indices |
| External player | NP | No intents. Substitute: a "Copy stream URL" action and/or download of an `.m3u` with the direct URL (includes ApiKey, so warn). Do not implement position return |
| Remote (YouTube) trailers | PC | Embed `https://www.youtube-nocookie.com/embed/{id}` in a modal iframe (Esc/Back closes), or open in a new tab. Non-YouTube URLs: new tab |
| Live TV | PC | hls.js handles live playlists. Add live handling Wholphin lacks: if `RunTimeTicks` is null or `isInfiniteStream`, hide remaining time and "Ends at", constrain seeking to the DVR window (`hls.liveSyncPosition`), and send `POST /LiveStreams/Close?liveStreamId=` on exit as a belt-and-braces measure |
| PiP | Web-native addition | `video.requestPictureInPicture()` where available. Keep progress reporting running. Optional Document PiP (Chromium) to keep our subtitle renderer visible, since standard PiP shows only the raw video and our client-rendered subtitles will **not** appear in it. That is a known trade-off of B1.3 |
| Fullscreen | Web-native addition | Fullscreen the player container (not the `<video>`) so overlays and subtitles stay visible. Auto-enter on play is optional (requires a user gesture) |

## B5. Subtitle delivery decision table (web)

| Source subtitle | Default web handling | Server method requested |
|---|---|---|
| SRT, SubRip, VTT, TTML, mov_text, other text | Our VTT renderer | External (server converts to `.vtt`) |
| ASS/SSA, ASS mode = libass (default) | JASSUB + attachment fonts | External `.ass` |
| ASS/SSA, mode = "simple" | Our VTT renderer (styling lost) | External `.vtt` |
| ASS/SSA, mode = transcode | burned in | Encode |
| PGS, PGS renderer on | WASM PGS canvas | External `.sup` (verify) |
| PGS, renderer off / DVD / DVB | burned in → forces video transcode | Encode |

Never use `EnableSubtitlesInManifest`/HLS subtitle delivery. It would split behavior between play methods.

## B6. Error handling and fallback (web)

Port Wholphin's ladder and add detection that browsers need:

1. `video.error` (`MEDIA_ERR_SRC_NOT_SUPPORTED`, `MEDIA_ERR_DECODE`) or hls.js fatal `MEDIA_ERROR` (after one `hls.recoverMediaError()` attempt) or `NETWORK_ERROR` (after hls.js retries):
   - DIRECT_PLAY → restart with `EnableDirectPlay=false, EnableDirectStream=true`. Wholphin uses this step only when track activation fails (`TracksChangedListener` `onFailure`, `PlaybackViewModel.kt:852-868`); on player errors it goes straight to transcode (`:1418-1449`). The web port applies it to player errors as well. Remux fixes most container issues cheaply.
   - DIRECT_STREAM → restart with both false (transcode).
   - TRANSCODE → error page (same as Wholphin).
2. **Silent-failure watchdog** (new; needed because `canPlayType`/`decodingInfo` can over-report, e.g. HEVC with an unsupported profile, or GPU decode failing). Trigger the same fallback when either holds:
   - within 6 s of `playing`, `getVideoPlaybackQuality().totalVideoFrames` stays 0 while `currentTime` advances (audio-only playback, black video);
   - `videoWidth === 0` after `loadedmetadata` for a video item.
3. **Selected audio track not honored** (progressive with non-default audio and no `audioTracks` API) → DirectStream restart (B4).
4. Bound the ladder to one step per level per item to avoid loops.

## B7. Keyboard and mouse scheme (preserves the Wholphin overlay)

The overlay remains a **focus-driven TV UI**: the same layout, initial focus on Play/Pause, a focus ring in the theme "border" color, and the same hidden/controller/chapters/queue states. Spatial navigation should use the same library as the rest of the port. Pointer support is layered on top.

### Keyboard

Default focus and visibility rules follow `PlaybackKeyHandler` exactly. `KeyboardEvent.repeat` and the hold duration replace Android `repeatCount`. Details of the Kotlin behavior this table relies on are in §9.8 (D-pad seek modes, interaction reporting for pass-out protection, `controlsEnabled` capture) and §9.6. Skip-back/forward keys also include gamepad L2/R2 and behave like ←/→; Enter also includes NumPadEnter, ButtonSelect and ButtonA; Back includes ButtonB (`KeyIdentifier.kt:23-51`). The on-screen Previous button goes to the previous item only if `position < maxSeekToPreviousPosition && hasPrevious`, otherwise `player.seekToPrevious()` (`PlaybackPage.kt:317-324`); the Media Previous key never restarts (§7).

| Key(s) | Controls hidden | Controls visible |
|---|---|---|
| ← / → | Wholphin hold-skip: tap = 1 step (fires on keyup); hold → after 8 repeats, accelerated steps per `SeekAcceleration` | Move focus. When the seek bar is focused: step seek with acceleration (no 8-repeat delay), 750 ms debounced commit |
| ↑ / ↓ | show controls | move focus (↓ from the controls row goes to Chapters → Queue) |
| Enter | dismiss the D-pad seek overlay if visible; else `oneClickPause` ? toggle : show controls | activate the focused control |
| Space, K | toggle play/pause (apply skipBackOnResume on resume). Web addition: always toggles regardless of `oneClickPause` (desktop convention) | same (do not activate the focused button) |
| J / L | seek −skipBack / +skipForward with the skip indicator (web addition, YouTube convention) | same |
| Backspace, Browser Back, Esc (when not fullscreen) | Back chain: dismiss skip-segment button → cancel next-up countdown → hide next-up → exit player | hide controls |
| Esc in fullscreen | exits fullscreen (browser-reserved; may not reach the page). Do not rely on it for Back | |
| MediaPlayPause / MediaPlay / MediaPause | via Media Session handlers (skipBackOnResume on play) | |
| MediaTrackNext / MediaTrackPrevious, N / Shift+P | next / previous item (keys behave like Wholphin media Next/Previous: Previous always goes to the previous item) | |
| MediaFastForward / MediaRewind | ±skip with indicator | |
| MediaStop | stop and exit | |
| C | Captions dialog (= Key.Captions) | |
| A | Audio dialog (= Key.MediaAudioTrack) | |
| S | press the visible Skip-segment button (web addition) | |
| F | toggle fullscreen (web addition) | |
| P | toggle PiP (web addition; Shift+P is previous) | |
| M | mute toggle (web addition; report `IsMuted` correctly instead of hard-coded false) | |
| I | toggle debug overlay (shortcut for Settings → Show debug info) | |
| [ / ] | subtitle delay −/+250 ms (web addition) | |
| < / > (Shift+, / Shift+.) | speed down/up through the speed list (web addition) | |
| 0–9 | seek to 0–90% (optional web addition) | |
| Gamepad (Gamepad API, optional) | L1/R1 = skip, A = Enter, B = Back (as `KeyIdentifier`) | |

**Hold acceleration on the web.** OS auto-repeat rates differ (often a ~500 ms delay then ~30 Hz on desktops), and Android TV remotes differ again. The `/3` scaling in `SeekAcceleration.kt` was tuned for TV remotes. Compute a synthetic repeat count from hold time and keep the table unchanged: `repeatCount ≈ floor(heldMs / 50)`, with the 8-repeat start mapped to about 400 ms. **The Android TV repeat rate is unknown from the code; tune empirically.**

### Mouse / touch

- **Pointer move** over the player → `showControls()` (pulse). Hide the cursor (`cursor: none`) when controls auto-hide. Hovering over the controls bar keeps them visible (pulse `MAX` while hovered).
- **Click on the video surface**: toggle play/pause, with the pause indicator and skipBackOnResume. **Double-click**: fullscreen. (Desktop convention. `oneClickPause` stays a remote/keyboard Enter setting.)
- **Seek bar**: hover shows the trickplay thumbnail and timestamp at the pointer x (same 160 px preview and edge clamping). Click seeks immediately. Drag scrubs with a live preview and commits on release (no 750 ms debounce needed for pointer). The bar grows 6 → 12 px on hover/focus, as Wholphin does on focus.
- **Buttons**: hover uses the focused-container color, so the same visual language serves mouse and keyboard. Tooltips with shortcut hints.
- **Wheel** over the player: optional volume; over the seek bar: ±skip.
- **Touch**: tap toggles controls; double-tap left/right third = ∓skip with the SkipIndicator; long-press is not used.
- **Dialogs**: keep them bottom-anchored (Settings bottom-left, Captions/Audio bottom-right). Clicking outside closes them. Also add a **volume slider** (absent on TV, where volume is hardware) next to the Audio button.
- **Skip-segment and Next-up**: same placement. Clickable; the countdown cancels on any pointer interaction with the panel.

## B8. Risks and unknowns (ranked by impact)

1. **Transcode load explosion.**
   - **Risk:** HEVC 10-bit, AC3/EAC3/DTS/TrueHD and MKV dominate typical Jellyfin libraries. On Chrome and Firefox many titles that direct-play on Android TV will DirectStream (cheap) or Transcode (expensive).
   - **Risk:** PGS burn-in forces a full video transcode even when video is direct-compatible.
   - **Risk:** Users without the server "allow transcoding" policy will hit the "Unable to get media URL" path.
   - **Mitigation:** ship the WASM PGS renderer early. Surface the transcode reason (debug overlay) and a clear permission error.
2. **Over-reporting capability, which produces silent failures** (black video with audio, or decode stalls), particularly HEVC on Chromium across GPUs and drivers, and HDR. Mitigation: the B6 watchdog and conservative `decodingInfo().supported && smooth` gating.
3. **Audio track switching in direct play** is unsupported outside Safari, so it becomes a remux restart. Seek accuracy on restart (keyframe snap) and brief rebuffers will be visible. Test resume accuracy with `startPosition` in hls.js versus native.
4. **HDR/DV correctness.** The probe matrix is browser/OS/display-specific. The DV fallback depends on server version behavior (**unverified**). Washed-out output is a likely user complaint.
5. **Safari divergence.** Native HLS (no hls.js events or level control), different error semantics, iOS fullscreen and inline restrictions, and ManagedMediaSource. Effectively a second player adapter.
6. **ASS fidelity and performance.** JASSUB on low-end or TV browsers. Font attachments must be fetched (extra requests, CORS through the server origin). Large anime fonts packs are heavy.
7. **Unreliable session end on tab close.** Keepalive fetch helps but is best-effort. Stale "now playing" sessions and lost last-position are possible. Transcodes are killed by server inactivity timeouts.
8. **Autoplay policy for next-up / cinema intros**, mostly iOS Safari. The mitigation is to keep the same element and an activated document.
9. **Port-time ambiguities inherited from Wholphin:**
   - duplicate queue for non-playable `Playback` destinations (§1.1);
   - movie track choices keyed by parent folder (§2.2);
   - `enableDirectPlay=true` on track change overriding a forced transcode (§1.6);
   - `controlsEnabled` captured once (§7);
   - NEVER + autoplay does not autoplay (§7);
   - `seekBarSteps` unused (§9.7);
   - trickplay uses the first width, not the best (§1.2).

   Product should decide replicate-vs-fix for each.
10. **Unknowns that cannot be determined from this repo:**
    - MPV backend internals (closed AAR);
    - whether the Kotlin SDK URL helpers embed `ApiKey`. For ExoPlayer this is moot: it authenticates through an `Authorization` header interceptor (§1.3), so the web must add `ApiKey` to `<video>`/`<img>`/`<track>` URLs explicitly anyway;
    - the Android TV key-repeat cadence that `SeekAcceleration` was tuned for;
    - the exact server behavior for DV stripping, PGS external extraction and fMP4-HLS HEVC on the deployed Jellyfin version. Validate those three against the target server before finalizing B3.
