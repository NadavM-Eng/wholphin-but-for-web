# Playback engine

Headless port of `W/ui/playback/PlaybackViewModel.kt` and its services for the browser. It owns one `<video>`
element, talks to Jellyfin, picks tracks, reports progress and publishes everything in a Zustand store. The UI
(controls overlay, dialogs, next-up panel, skip button) only reads `usePlaybackStore` and calls engine commands.

Spec: `docs/spec/05-playback.md` (Part 1 = upstream behaviour, Part 2 = browser mapping) and
`docs/spec/08-coverage-gaps.md` §7. Results on real media: `PLAYBACK_MATRIX.md`.

## Using it

```tsx
import { destinationFromRoute, getPlaybackEngine, PlayerSurface, SubtitleLayer, usePlaybackSession, usePlaybackStore } from './engine'

function Page() {
  // starts on mount, stops (Stopped report, encoder cleanup) on unmount; onExit = navigate back
  usePlaybackSession(dest, () => navigate(-1))
  const st = usePlaybackStore()              // or a selector: usePlaybackStore((s) => s.positionMs)
  const engine = getPlaybackEngine()
  return (
    <PlayerSurface>                           {/* positioned box; the engine's <video> is mounted inside */}
      <SubtitleLayer raised={controlsVisible} />
      {/* overlay: engine.togglePlay(), engine.seekTo(ms), engine.setAudio(i), ... */}
    </PlayerSurface>
  )
}
```

Only one playback exists at a time (`getPlaybackEngine()` is page-wide). Keep the same element across queue items:
the next item plays in it, which keeps the document's autoplay permission (iOS is strict about this).

## Destinations

`PlaybackDestination` mirrors upstream `Destination.Playback` / `PlaybackList`:

| kind | fields | route |
|---|---|---|
| `item` | `itemId`, `positionMs` (resume point, 0 = start), `forceTranscode` ("Play with -> Transcoding"), `shuffle` | `nav.play(id, { t, transcode, shuffle })` |
| `list` | `itemId`, `startIndex`, `shuffle`, `recursive`, `sort` (`{ sort: ItemSortBy, direction }`), `filter` (JSON `QueueFilter`) | `nav.playList(id, {...})` |

`destinationFromRoute(kind, itemId, searchParams)` converts the route query.

## State (`PlaybackEngineState`, see `types.ts`)

- lifecycle: `status` (`idle | loading | playing | paused | buffering | ended | error`), `error` (`PlaybackError.kind` + `code`/`detail`; map to text with `playbackErrorText` in `../playbackErrors.ts`), `exit` (set when the UI should leave), `autoplayBlocked` (show a play button), `showControlsSignal` (increments when the engine wants the controls shown).
- queue: `queue` (`{ kind: 'media' | 'intro', item }[]`), `index`, `hasNext`, `hasPrevious`, `item` (full DTO of the current entry), `entryKind`, `isLiveTv`.
- stream: `source` (PlaybackInfo source: per-subtitle `DeliveryMethod`/`DeliveryUrl`), `playMethod` (server label), `videoCopy` (a server "Transcode" that only remuxes), `transcodeReasons`, `backend` (`native | native-hls | hlsjs`), `streamUrl`, `playSessionId`, `liveStreamId`, `fallbackPath`, `allowDirectPlay`/`allowDirectStream` (current ladder rung), `transcodeInfo` (polled for TRANSCODE, for the debug overlay), `maxBitrate` (session cap).
- tracks: `audioStreams` (server order), `subtitleStreams` (server profile language first), `audioIndex`, `subtitleChoice` (the raw pick: an index, `TrackIndex.DISABLED` -2 or `TrackIndex.ONLY_FORCED` -3 - show this as selected), `subtitleIndex` (the concrete stream shown), `audioReason`/`subtitleReason` (`StreamChoiceReason`: Item / Series / Season / UserPreferences / Unknown, for the "chosen by" line), `subtitle` (`text` cues / `ass` content + fonts / `burn-in` / `unavailable`), `subtitleLoading`, `subtitleDelayMs`.
- time: `positionMs`, `durationMs`, `bufferedMs`, `paused`, `muted`, `volume`, `playbackRate`, `videoWidth`, `videoHeight`.
- features: `chapters` (`{ index, startMs, name, imageTag }`, sorted), `trickplay` (`TrickplayInfoDto`), `segments`, `segment` (`{ segment, interacted }`: show the floating Skip button when `!interacted && !nextUp && controls hidden`), `nextUp` (`{ index, item, countdown }`; `countdown` null = no autoplay), `autoSkipped` (last automatic segment skip, for the UI toast), `stats` (frames, dropped, bandwidth), `lastReport`.

## Commands (`getPlaybackEngine()`)

| command | upstream |
|---|---|
| `start(dest)`, `stop(exit)` | `init()`, `release()` |
| `play()` (applies skip-back-on-resume), `pause()`, `togglePlay()` | Play button / one-click pause / MediaSession play |
| `seekTo(ms)`, `seekBy(ms)`, `skipBack()`, `skipForward()` | seek bar, FF/RW (skip prefs) |
| `next()`, `previous()` (always the previous entry), `previousButton()` (previous entry only within 3 s, else restart), `playQueueIndex(i)` | `playNextUp`, `playPrevious`, `playItemInPlaylist` |
| `setAudio(index)`, `setSubtitle(index or TrackIndex.DISABLED / ONLY_FORCED)` | `changeAudioStream`, `changeSubtitleStream` (choice saved per item, season and series) |
| `setMaxBitrate(bps)` | `changeMaxBitrate` (session only; values in `BITRATE_VALUES`) |
| `setPlaybackRate(r)` (`PLAYBACK_SPEEDS`), `setVolume(v)`, `setMuted(m)` | speed dialog; web additions |
| `setSubtitleDelay(ms)`, `adjustSubtitleDelay(deltaMs)` | `updateSubtitleDelay` (works on every backend; saved after 1.5 s) |
| `skipSegment()`, `dismissSegment()` | `updateSegment(id, dismissed)`; the controls' text button is a plain `seekTo(end)` |
| `playNextUp()`, `cancelNextUpCountdown()`, `cancelNextUp()`, `handleBack()` (Skip button -> countdown -> panel; returns false when the page should leave) | Next Up panel and Back handlers |
| `retry(forceTranscode)` | error screen Retry / "Play with transcoding": replays the current entry where it failed (web addition) |
| `reloadWithSubtitle(item, subtitleIndex, audioIndex)` | `downloadAndSwitchSubtitles` after a remote subtitle download |
| `reportInteraction()` | key-up / pointer activity for pass-out protection - call it from every input handler |
| `trickplayImage(ms)` | `{ url, x, y, width, height, sheetWidth, sheetHeight }` for a seek preview (`background-position: -x -y`) |
| `setContentScale(scale)` | video scale dialog (`globalContentScale` values) |
| `attachSurface(el)` | done by `PlayerSurface` |
| `deviceProfile()`, `capabilities()`, `debugFail(reason)` | debug page |

Helpers exported for the controls: `calculateSeekAccelerationMultiplier`, `HOLD_TO_SEEK_REPEAT_START_COUNT`, `repeatCountFromHold`, `SKIP_BUTTON_TIMEOUT_MS`, `MAX_SEEK_TO_PREVIOUS_MS`, `trickplayTile`, trailers (`getLocalTrailers`, `getRemoteTrailers`, `openRemoteTrailer`).

## How a start works (spec 05 §1)

1. `GET /Items/{id}`. Playable kinds play themselves and get the contextual queue appended once (episode -> rest of the season/series, movie -> its parts); containers (series, season, playlist, box set, collection, folder) become a queue (`queue.ts`, port of PlaylistCreator). The upstream double queue for non-playable items is not copied.
2. Cinema mode: when starting at 0, `GET /Items/{id}/Intros` is prepended.
3. Per entry: full item, remembered `ItemPlayback` (only with a source id), version choice, STC lookups, audio then subtitle choice (`streamChoice.ts`, port of StreamChoiceService), trickplay prefetch, chapters. The start position is the raw resume point: skip-back-on-resume applies only on un-pause (spec 05 §1.4). Until the stream reaches `canplay`/`playing`, `positionMs()` returns that pending start position (like ExoPlayer during preparation), so reports, track/bitrate restarts and seeks made while loading never fall back to 0.
4. `POST /Items/{id}/PlaybackInfo` with the runtime-built DeviceProfile (`deviceProfile.ts` from `capabilities.ts`), negative track indexes sent as null, then URL + play method (`playbackInfo.ts`). Empty `MediaSources` is an error, not a hang.
5. Backend: progressive -> `<video src>`; HLS -> hls.js (MSE) or native HLS on Apple WebKit. A browser without the `audioTracks` API (all but Safari) plays only the first audio track of a file it plays directly; the profile says so (`IsSecondaryAudio`), so the server answers a request for any other track with a remux (video and that audio track copied).
6. Reporter (`reporting.ts`): Start on first `playing`, Progress every 5 s (also paused) and on pause/resume/seek/track change, Stopped (keepalive fetch) on every exit path including tab close; transcodes get `DELETE /Videos/ActiveEncodings`; live streams `POST /LiveStreams/Close`.
7. Segments polled every 500 ms (`segments.ts`), next up on end / during credits (`nextUp.ts`), media session and wake lock (`platform.ts`).

## What the browser plays itself (so the server does not convert)

The profile is built from what the browser really does (`capabilities.ts`), in this order of trust: a clip that was
actually loaded (`probeMedia.ts`: three embedded clips of a fraction of a second, about 7 KB together), then
`canPlayType` / `MediaSource.isTypeSupported` / `mediaCapabilities.decodingInfo`. Measured results and the
before/after table are in `PLAYBACK_MATRIX.md` ("Playing without the server converting").

- **Matroska (MKV)** is a direct-play container when the embedded MKV clip plays (Edge, Chrome and other Chromium
  browsers; Firefox builds with Matroska support; not Safari). Only codecs the element decodes inside Matroska are
  listed, because Chromium plays a file whose audio it cannot decode as a silent film, without an error.
- **Audio the browser cannot decode** (AC-3 / E-AC-3 without a system decoder, DTS, TrueHD): the HLS profile lists
  every video codec the browser decodes, so the server copies the video into fMP4 and converts only the audio
  (to AAC, channels kept). AC-3 and E-AC-3 are offered only when the type check says yes and a silent clip of that
  codec did not fail to load.
- **A file's second audio track**: remux with both streams copied (see step 5 above).
- **PGS subtitles** are fetched as a `.sup` stream (`DeliveryMethod: External`) and drawn on a canvas by libpgs
  (`PgsSubtitles.tsx`), unless the "Direct play PGS" preference is off (then burn-in, as before).
- **HDR10 / HLG on a display that is not HDR**: desktop Chromium tone-maps by itself, so these range types are not
  excluded there (`browserToneMapsHdr`, the one engine check; the same rule as Jellyfin's web client). The HDR
  override preferences still force either way. Dolby Vision without an HDR10 base layer always goes to the server.
- Still converted by the server: video codecs no browser decodes (MPEG-2, MPEG-4 ASP, VC-1), containers other than
  MP4 / WebM / Matroska (AVI, MPEG-TS/PS: remux when the codecs fit), DVD (VobSub) and DVB subtitles (burn-in),
  ASS in burn-in mode, and anything over the bitrate or resolution limit the user set.

## Fallback ladder (`fallback.ts`, spec 05 §B6)

Rungs are request flags: direct play -> stream copy allowed (remux) -> full transcode -> error. Triggers: `<video>` error, hls.js fatal error (after one `recoverMediaError`), no `canplay` within 20 s (direct) / 45 s (HLS), the frame watchdog (`watchdog.ts`: time advances without decoded frames for 4 s at start or 6 s mid-stream, skipped while hidden/paused/buffering), and track activation failure. Flags only go down, so it cannot loop. Track/bitrate restarts keep the current rung (upstream re-enabled direct play).

## Subtitles

The text style follows the separate HDR style set when "different for HDR" is on and the item's video is HDR (`stylePrefsFor`, `isHdrVideo`). Text is never drawn below 12 px (portrait phones).

All text, ASS and PGS subtitles are requested `External` and drawn by `SubtitleLayer`: text via the server's JSON track events (VTT fallback) styled from the subtitle preferences, scaled to the rendered video height; ASS/SSA via JASSUB with the item's font attachments (fallback font: JASSUB's bundled Liberation Sans); PGS via libpgs on a canvas that takes the video's box and `object-fit`, fed the time of every animation frame (libpgs alone follows `timeupdate`, about four times a second), shrunk to the top-center 70% while the controls are up like the TV's SubtitleView, and kept alive (only hidden) while the seek indicator shows. "ASS: ExoPlayer built-in" mode renders ASS as plain text cues. DVD (VobSub) and DVB image subtitles, PGS with "Direct play PGS" off and ASS in burn-in mode are burned in by the server (forces a video transcode): no established web renderer exists for VobSub or DVB, and Jellyfin 10.11 offers a dvdsub "external" URL that answers 404. Delay works for every kind. Like every canvas or DOM overlay, subtitles are not part of the picture-in-picture window. libpgs draws nothing after a stream's last display set, so a PGS track cut off before the set that ends its last cue never shows that cue.

## Upstream bugs fixed here (each also commented in code)

movie track choices leaking to the whole folder (stores/playbackChoices.ts); sentinels reaching PlaybackInfo; empty MediaSources hang; duplicate queue for non-playable items; "Next up: never" blocking autoplay; track changes re-enabling direct play after a forced/fallback transcode; subtitle delay MPV-only; stale track indexes in progress reports after in-place switches; IsMuted always false.

## Files

`engine.ts` orchestration + store, `types.ts` public types, `capabilities.ts`, `probeMedia.ts` (embedded probe clips), `deviceProfile.ts`, `playbackInfo.ts`, `streamChoice.ts`, `trackSelection.ts`, `queue.ts`, `backends.ts`, `fallback.ts`, `watchdog.ts`, `reporting.ts`, `segments.ts`, `nextUp.ts`, `trickplay.ts`, `seekAcceleration.ts`, `platform.ts`, `trailers.ts`, `subtitles/` (`cues.ts`, `loader.ts`, `style.ts`), `SubtitleLayer.tsx`, `AssSubtitles.tsx`, `PgsSubtitles.tsx`, `PlayerSurface.tsx`, `usePlaybackSession.ts`, `__dev/PlaybackDevPage.tsx` (DEV only: `/play/:id?debug=1`). The TV-style UI on top of it is `../PlayerView.tsx` and `../ui/` (see the header comment of each file for the upstream source). URL builders live in `src/api/playback/urls.ts`, remembered choices in `src/stores/playbackChoices.ts`.
