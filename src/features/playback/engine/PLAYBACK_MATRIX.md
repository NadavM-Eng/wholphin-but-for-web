# Playback matrix

Measured 2026-11-17 against the throwaway test server (Jellyfin 10.11.11) and a real server (test account), with
Playwright driving the system browsers headless on Windows (SDR display, no HDR). Each row: start through the
engine (`/play/:id?debug=1`), 4 s of playback, seek to 40 %, optional audio/subtitle switch, 6 s wait, server
session checked through the API, `stop()`, session and resume position checked again. Scripts and raw output were
kept out of the repo; screenshots are in `shots/out/wave3a/playback/`.

Since 2026-11-18 the profile lets the browser do more by itself (Matroska played directly, PGS drawn in the
browser, HDR10 tone-mapped by desktop Chromium): the rows of 2026-11-17 below that say "Transcode remux
(ContainerNotSupported)", "PGS ... burned in" or "VideoRangeTypeNotSupported" describe the earlier profile. The
current answers are in the last section, "Playing without the server converting".

Columns: **method** = server play method (+ `remux` when the server's "Transcode" only copies the video, judged from
`TranscodeReasons`); **frames** = decoded frames in 4 s (`getVideoPlaybackQuality`, 24 fps sources); **audio** =
`webkitAudioDecodedByteCount` grew; **seek** = position landed within 15 s of the target and frames kept advancing;
**progress** = server session position vs client position before stop; **stop** = server session cleared after stop.
Resume = `UserData.PlaybackPositionTicks` after stop (Jellyfin only stores it for items of 5 min or more).

## Throwaway server, Microsoft Edge 157

| item | source | method / backend | frames | audio | seek | audio switch | subtitle | progress | stop / resume |
|---|---|---|---|---|---|---|---|---|---|
| H.264 AAC Baseline | MP4 H.264 + AAC | DirectPlay / native | 96 | yes | ok | - | - | 47 s = 47 s | cleared / < 5 min |
| AV1 Opus | WebM AV1 + Opus | DirectPlay / native | 97 | yes | ok | - | - | 35 = 35 | cleared |
| VP9 Vorbis | WebM VP9 + Vorbis | DirectPlay / native | 96 | yes | ok | - | - | 35 = 35 | cleared |
| Chapter Marathon | MKV H.264 + AAC, 10 chapters | Transcode remux (ContainerNotSupported) / hls.js | 97 | yes | ok | - | - | 59 = 59 | cleared; 10 chapters, trickplay tile math checked |
| HEVC 10-bit EAC3 5.1 | MKV HEVC Main10 + E-AC-3 6ch | Transcode remux (container, audio) / hls.js | 96 | yes | ok | - | - | 41 = 41 | cleared |
| HEVC HDR10 | MKV HEVC Main10 HDR10 | Transcode video (VideoRangeTypeNotSupported: SDR display, server tone-maps) / hls.js | 96 | yes | ok | - | - | 37 = 37 | cleared |
| MPEG-2 Program Stream | MPEG-PS MPEG-2 + AC-3 | Transcode video / hls.js | 96 | yes | ok | - | - | 37 = 37 | cleared |
| MPEG-4 ASP AVI | AVI MPEG-4 ASP + MP3 | Transcode video / hls.js | 96 | yes | ok | - | - | 35 = 35 | cleared (see failure 1) |
| 4K UHD Demo | MKV HEVC 8-bit 3840x2160 | Transcode remux / hls.js, 3840x2160 decoded | 96 | yes | ok | - | - | 23 = 23 | cleared |
| Multi Track Showcase | MKV H.264, AAC + AC-3 5.1 + DTS, 7 SRT (sidecars, forced) + styled ASS with attached font | Transcode remux / hls.js | 96 | yes | ok | AAC -> AC-3 5.1: ok (restart, audio transcoded) | sidecar forced SRT: rendered; embedded SRT: rendered, delay +2 s moves cues; ASS: JASSUB, 1 attached font, colours/bold rendered | 18-54 = same | cleared |
| Long-title / Japanese / Hebrew titles | MP4 H.264 | DirectPlay / native | 96-97 | yes | ok | - | - | equal | cleared |
| Sintel, Tears of Steel, Big Buck Bunny, Cosmos Laundromat, Wing It! (Blender) | MP4 H.264 + AAC | DirectPlay / native | 96-97 | yes | ok | - | - | equal (+-1 s) | cleared; resume 367 / 305 / 250 / 304 s saved (Wing It < 5 min) |
| Pixel Garden S1E2 (series) | MP4 | DirectPlay | yes | yes | - | - | - | - | resume `?t=24000` honoured; queue of 11 episodes; Next Up panel at end, 15 s countdown, autoplayed S1E3; Back cancels countdown, second Back leaves |
| Test News 24 (live TV) | M3U tuner, H.264 + AAC | Transcode remux over HLS TS / hls.js | yes | yes | - | - | - | - | LiveStreamId reported; see failure 2 |
| Playlist "Weekend Watchlist", box set "Blender Open Movies" (Play and Shuffle), Codec Zoo library sorted by date desc from index 2, series Shuffle / next / previous | | DirectPlay | | | | | | | queue built once (no duplicates), next/previous ok |

## Real server (test account), Microsoft Edge 157

The same run was repeated on nine items of a real server, chosen by their streams: Matroska, MP4 and AVI containers;
H.264, HEVC Main10, AV1 10-bit and MPEG-4 ASP video; HDR10 and Dolby Vision with HDR10+; DTS, E-AC-3, AAC, Opus and
MP3 audio; SRT, ASS with attached fonts, and PGS subtitles. Every item decoded frames and audio, seeked, reported the
same position as the client (within 1 s) and cleared its session on stop. The methods matched the throwaway rows
above: MP4 played directly (HEVC 10-bit included), Matroska was remuxed through hls.js (HEVC 10-bit through MSE), HDR
sources and AVI were video-transcoded. Audio switches restarted the stream (DTS transcoded); ASS was drawn by JASSUB
with the attached fonts, SRT was rendered, PGS restarted as a video transcode and was burned in. On an item with media
segments the intro showed the ask-to-skip state and Skip seeked to the segment end + 1 ms; the outro showed its
button and dismissing it marked it interacted; the queue was the rest of the season.

Resume points and play counts that these runs left on real-server items were reset afterwards (mark unplayed).

## Google Chrome 157 (same machine)

H.264 MP4, AV1 WebM, VP9 WebM: DirectPlay, frames and audio ok. HEVC 10-bit + EAC3 MKV, AVI, Multi Track Showcase
(audio switch, ASS): remux / transcode via hls.js, all ok. Real MP4 HEVC episode: DirectPlay ok. Chrome reports
native HLS support too; the engine still uses hls.js there (native HLS is preferred only on Apple WebKit).

## Fallback ladder and errors

- Sintel at 2:00, three forced failures (`debugFail`): DirectPlay -> remux (EnableDirectPlay=false, video copied,
  `DirectPlayError`) -> full transcode (stream copy off) -> clear error "Error during playback" with the path. The
  position was kept at each step (121.8 s -> 121.9 s -> 122.2 s). A bitrate change on the bottom rung stayed on it
  (no return to direct play).
- Tab close (`page.close` with unload): server session cleared, resume saved (Tears of Steel, 203 s).
- Network trace of a remux session: `POST /Sessions/Playing`, Progress every 5 s and on pause,
  `DELETE /Videos/ActiveEncodings` (204), `POST /Sessions/Playing/Stopped` (204).
- Media Session metadata (title, year/series line, artwork) and playback state were set.

## Failures found and fixed during the run

1. **MP3 copied into fMP4 HLS** (AVI): the server declares it `mp4a.40.34`, which Chromium MSE rejects
   (`bufferAddCodecError`). Capability detection now probes that exact string, so MP3 is no longer offered for HLS
   copy on Chromium and the server transcodes it to AAC.
2. **Live TV** answered with an unplayable progressive URL: live sources set `UseMostCompatibleTranscodingProfile`,
   which needs a TS transcoding profile. A TS (H.264/AAC) HLS profile was added after the fMP4 one.
3. **Ladder treated a remux as the last rung**: Jellyfin labels an HLS remux "Transcode". The ladder now works on the
   request flags (direct play -> copy allowed -> no copy), so a failing remux still gets a full transcode.
4. **Subtitle delay** did not clear a cue when the delayed time had none (renderer change detection), and the subtitle
   style hook re-rendered forever (new object per store read). Both fixed.

## Not verified (honest gaps)

- **Safari / iOS**: no Apple browser available. The native-HLS backend, in-place audio switching through
  `video.audioTracks`, AC-3/E-AC-3 and Dolby Vision signalling are untested.
- **Firefox**: Playwright's Firefox build does not match the installed driver and the system Firefox cannot be
  automated here; Firefox playback is untested.
- **HDR output**: the display is SDR, so every HDR10/DV/HDR10+ item went through server tone-mapping; HDR
  passthrough on an HDR display is untested.
- **Watchdog on a real silent failure**: no file here makes a browser play audio over a black picture; the watchdog
  is covered by unit tests and the ladder by forced failures only.
- **Direct-play audio switch** on a multi-audio MP4 (the remux-on-switch path): not exercised, no such test file was available.
- **Cinema mode intros**: not exercised, no intros were set up for the tests.
- **Headed playback, touch devices, phones**: all runs were headless desktop; the minimal player was screenshotted at
  360, 1280, 1920 and 2560 px wide (no horizontal overflow).
- **Wake lock**: requested in code; headless browsers cannot show whether the screen stays on.

## Controls UI (PlayerView), Microsoft Edge 157 headed, muted

Driven with Playwright through mouse, keyboard and touch (CDP touch events); screenshots `shots/out/wave3a/playback/`
(`d*` desktop mouse, `k*` keyboard, `c*` chapters, `n*` next up, `t-*` touch, `r*` real server, `m*` misc).

| scenario | result |
|---|---|
| 1920x1080 mouse, Multi Track Showcase | controls on pointer move, auto-hide after 5 s with the cursor hidden; seek bar hover shows the trickplay tile + time chip, click seeks, drag scrubs and commits on release; Settings / Speed (returns to Settings) / Scale / Bitrate / Captions (9 rows, forced+external labels, Search & Download disabled for the test account) / Audio (switch restarts, speed kept) / Subtitle delay (+250 ms, +1 s, Reset) / debug overlay / volume slider on hover / wheel volume HUD / "?" sheet; click toggles play, double click toggles fullscreen (play state unchanged); Back leaves |
| 1920x1080 keyboard only, Sintel | hidden controls: Right tap +30 s with skip indicator and the 3 dp bottom bar, hold 1 s accelerated to +182 s, Left tap -10 s; Enter/Up/Down show controls with focus on Pause; Up reaches the seek bar, Right steps preview and commit after 750 ms; Space/K, J/L, < >, M, 0-9, C, A, ?, I; D-pad reaches Settings and its sub-dialogs with initial focus on the current value; Esc closes dialog, then hides controls, then leaves |
| D-pad seek mode "trickplay" | pending position overlay with trickplay preview, committed 750 ms after the last step |
| Chapter Marathon | "Chapters" header; Down from the buttons opens the row focused on the current chapter; click/Enter seeks and hides; Up returns to the controller with Pause focused |
| Orbital Drift S1E1 (`?t=12000`) | Queue row with 14 upcoming episodes; Next Up panel at the end with the video shrunk to 60%, "15s" countdown, autoplayed S1E2 after 15 s; with the panel open Back cancels the countdown, a second Back leaves |
| 390x844 and 844x390 touch | tap shows / hides, double tap right +30 s, double tap left -10 s, seek-bar drag, captions and settings sheets fit the screen, outside tap closes; no horizontal overflow; Next Up laid out for both orientations |
| Live TV "Test News 24" | seek bar over the seekable window, "Live" instead of remaining time and "Ends at" |
| Errors | forced ladder failure shows the error with Retry (resumed at 4 s in DirectPlay) and Back; a server error also offers "Play with transcoding" (restarted with stream copy disabled) |
| An episode with intro and outro segments | floating "Skip Intro" after the controls hide, Enter skips past the intro; "Skip Intro" / "Skip Outro" text buttons in the controller; debug overlay; item reset to unplayed afterwards |
| 2560x1080 | layout scales, no overflow |

## Playing without the server converting (2026-11-18)

Throwaway server: Jellyfin 10.11.11. Browsers driven headless by Playwright on a Windows 11 PC with an SDR display: Microsoft Edge 157
and Google Chrome 157 (system browsers), and Playwright's own Firefox 159 and WebKit builds. Two measurements:

1. **What the server would do** (no stream is started): the device profile is built inside each browser from the
   app's own modules, then `POST /Items/{id}/PlaybackInfo` is sent for every item of the throwaway server's Codec
   Zoo and a few other seeded videos, once per audio track and once per kind of subtitle track. The same was done
   read-only on a real server for twelve items picked by their streams (never streamed, never written to).
2. **What the browser really does**: the files were played as static streams in a bare `<video>`, then through the
   app (`/play/:id`), with the server's session and encoder report read back through the API.

Words used in the table: **direct** = the file itself, nothing runs on the server; **remux, all copied** = the server
repackages into HLS/fMP4 without re-encoding anything; **audio converted, video copied** = only the audio is
re-encoded; **VIDEO TRANSCODE** = the picture is re-encoded (the expensive case). In brackets: the server's reasons.
Edge and Chrome gave identical answers for every row (this PC's Windows has no Dolby AC-3 / E-AC-3 decoder, so Edge
cannot decode them here either). The words are derived from the server's reasons alone, with one known blind spot:
an MP3 audio track is always converted to AAC when the server repackages into HLS, before and after, because
Chromium's MediaSource refuses MP3 in fMP4; a row that says "remux, all copied" for an MP3 track really converts
that audio.

### Throwaway server

| item | streams | request | Edge 157 and Chrome 157 | Firefox 159 (Playwright build) | WebKit (Playwright build on Windows) |
|---|---|---|---|---|---|
| 4K UHD Demo | mkv hevc Main 8bit 3840x2160; aac 2ch | default | remux, all copied (container) -> **direct** | remux, all copied (container) -> **direct** | remux, all copied (container) (same) |
| AV1 Opus | webm av1 Main 8bit 1280x720; opus 2ch | default | direct (same) | direct (same) | direct (same) |
| Chapter Marathon | mkv h264 High 8bit 1280x720; aac 2ch | default | remux, all copied (container) -> **direct** | remux, all copied (container) -> **direct** | remux, all copied (container) (same) |
| Dual Audio Second Default | mkv h264 High 8bit 1280x720; aac 2ch, aac 2ch; PGSSUB, ass | default | (new item) remux, all copied (second audio track) | (new item) remux, all copied (second audio track) | (new item) remux, all copied (container) |
| Dual Audio Second Default | mkv h264 High 8bit 1280x720; aac 2ch, aac 2ch; PGSSUB, ass | audio#1 aac 2ch | (new item) direct | (new item) direct | (new item) remux, all copied (container) |
| Dual Audio Second Default | mkv h264 High 8bit 1280x720; aac 2ch, aac 2ch; PGSSUB, ass | sub PGSSUB | (new item) remux, all copied (second audio track), sub drawn in browser | (new item) remux, all copied (second audio track), sub drawn in browser | (new item) remux, all copied (container), sub drawn in browser |
| Dual Audio Second Default | mkv h264 High 8bit 1280x720; aac 2ch, aac 2ch; PGSSUB, ass | sub ass | (new item) remux, all copied (second audio track), sub drawn in browser | (new item) remux, all copied (second audio track), sub drawn in browser | (new item) remux, all copied (container), sub drawn in browser |
| The Extraordinarily Long ... | mp4 h264 High 8bit 1280x720; aac 2ch | default | direct (same) | direct (same) | direct (same) |
| H.264 AAC Baseline | mp4 h264 High 8bit 1280x720; aac 2ch | default | direct (same) | direct (same) | direct (same) |
| HEVC 10-bit EAC3 5.1 | mkv hevc Main 10 10bit 1280x720; eac3 6ch | default | audio converted, video copied (container + audio codec) -> **audio converted, video copied (audio codec)** | audio converted, video copied (container + audio codec) -> **audio converted, video copied (audio codec)** | remux, all copied (container) -> **audio converted, video copied (container + audio codec)** |
| HEVC HDR10 | mkv hevc Main 10 10bit 1280x720 HDR10; aac 2ch | default | VIDEO TRANSCODE (container + HDR range) -> **direct** | VIDEO TRANSCODE (container + HDR range) -> **VIDEO TRANSCODE (HDR range)** | VIDEO TRANSCODE (container + HDR range) (same) |
| MPEG-2 Program Stream | mpeg mpeg2video Main 8bit 1280x720; ac3 2ch | default | VIDEO TRANSCODE (container + video codec + audio codec) (same) | VIDEO TRANSCODE (container + video codec + audio codec) (same) | VIDEO TRANSCODE (container + video codec) -> **VIDEO TRANSCODE (container + video codec + audio codec)** |
| MPEG-4 ASP AVI | avi mpeg4 Simple Profile 8bit 1280x720; mp3 2ch | default | VIDEO TRANSCODE (container + video codec) (same) | VIDEO TRANSCODE (container + video codec) (same) | VIDEO TRANSCODE (container + video codec) (same) |
| Multi Track Showcase | mkv h264 High 8bit 1280x720; aac 2ch, ac3 6ch, dts 2ch; subrip(ext), subrip, ass | default | remux, all copied (container) -> **direct** | remux, all copied (container) -> **direct** | remux, all copied (container) (same) |
| Multi Track Showcase | mkv h264 High 8bit 1280x720; aac 2ch, ac3 6ch, dts 2ch; subrip(ext), subrip, ass | audio#5 ac3 6ch | audio converted, video copied (container + audio codec) -> **audio converted, video copied (audio codec)** | audio converted, video copied (container + audio codec) -> **audio converted, video copied (audio codec)** | remux, all copied (container) -> **audio converted, video copied (container + audio codec)** |
| Multi Track Showcase | mkv h264 High 8bit 1280x720; aac 2ch, ac3 6ch, dts 2ch; subrip(ext), subrip, ass | audio#6 dts 2ch | audio converted, video copied (container + audio codec) -> **audio converted, video copied (audio codec)** | audio converted, video copied (container + audio codec) -> **audio converted, video copied (audio codec)** | remux, all copied (container) (same) |
| Multi Track Showcase | mkv h264 High 8bit 1280x720; aac 2ch, ac3 6ch, dts 2ch; subrip(ext), subrip, ass | sub subrip(ext) | remux, all copied (container), sub drawn in browser -> **direct, sub drawn in browser** | remux, all copied (container), sub drawn in browser -> **direct, sub drawn in browser** | remux, all copied (container), sub drawn in browser (same) |
| Multi Track Showcase | mkv h264 High 8bit 1280x720; aac 2ch, ac3 6ch, dts 2ch; subrip(ext), subrip, ass | sub subrip | remux, all copied (container), sub drawn in browser -> **direct, sub drawn in browser** | remux, all copied (container), sub drawn in browser -> **direct, sub drawn in browser** | remux, all copied (container), sub drawn in browser (same) |
| Multi Track Showcase | mkv h264 High 8bit 1280x720; aac 2ch, ac3 6ch, dts 2ch; subrip(ext), subrip, ass | sub ass | remux, all copied (container), sub drawn in browser -> **direct, sub drawn in browser** | remux, all copied (container), sub drawn in browser -> **direct, sub drawn in browser** | remux, all copied (container), sub drawn in browser (same) |
| PGS Image Subtitles | mkv h264 High 8bit 1280x720; aac 2ch; PGSSUB | default | remux, all copied (container) -> **direct** | remux, all copied (container) -> **direct** | remux, all copied (container) (same) |
| PGS Image Subtitles | mkv h264 High 8bit 1280x720; aac 2ch; PGSSUB | sub PGSSUB | VIDEO TRANSCODE (container + subtitle codec), sub burned in -> **direct, sub drawn in browser** | VIDEO TRANSCODE (container + subtitle codec), sub burned in -> **direct, sub drawn in browser** | VIDEO TRANSCODE (container + subtitle codec), sub burned in -> **remux, all copied (container), sub drawn in browser** |
| 日本語のタイトル テスト映画 | mp4 h264 High 8bit 1280x720; aac 2ch | default | direct (same) | direct (same) | direct (same) |
| שלום עולם - סרט בדיקה | mp4 h264 High 8bit 1280x720; aac 2ch | default | direct (same) | direct (same) | direct (same) |
| VobSub Image Subtitles | mkv h264 High 8bit 1280x720; aac 2ch; DVDSUB | default | remux, all copied (container) -> **direct** | remux, all copied (container) -> **direct** | remux, all copied (container) (same) |
| VobSub Image Subtitles | mkv h264 High 8bit 1280x720; aac 2ch; DVDSUB | sub DVDSUB | VIDEO TRANSCODE (container + subtitle codec), sub burned in -> **VIDEO TRANSCODE (subtitle codec), sub burned in** | VIDEO TRANSCODE (container + subtitle codec), sub burned in -> **VIDEO TRANSCODE (subtitle codec), sub burned in** | VIDEO TRANSCODE (container + subtitle codec), sub burned in (same) |
| VP9 Vorbis | webm vp9 Profile 0 8bit 1280x720; vorbis 2ch | default | direct (same) | direct (same) | direct (same) |
| Agent 327: Operation Barb... | mp4 h264 High 8bit 1920x806; aac 2ch | default | direct (same) | direct (same) | direct (same) |
| Big Buck Bunny | mp4 h264 Constrained Baseline 8bit 640x360; aac 2ch | default | direct (same) | direct (same) | direct (same) |
| Caminandes: Gran Dillama | mp4 h264 High 8bit 1280x720; aac 2ch | default | direct (same) | direct (same) | direct (same) |
| Behind the Hull | mp4 h264 Constrained Baseline 8bit 640x360; aac 2ch | default | direct (same) | direct (same) | direct (same) |

### Real server (read-only PlaybackInfo, items named by their streams)

| item | streams | request | Edge 157 and Chrome 157 | Firefox 159 (Playwright build) |
|---|---|---|---|---|
| #1 | mkv hevc Main 10 10bit 2160p DOVIWithHDR10; truehd 8ch, eac3 6ch; subrip(ext), subrip, PGSSUB | default | VIDEO TRANSCODE (container + audio codec + HDR range) -> **audio converted, video copied (audio codec)** | VIDEO TRANSCODE (container + audio codec + HDR range) -> **VIDEO TRANSCODE (audio codec + HDR range)** |
| #1 | mkv hevc Main 10 10bit 2160p DOVIWithHDR10; truehd 8ch, eac3 6ch; subrip(ext), subrip, PGSSUB | audio#4 eac3 6ch | VIDEO TRANSCODE (container + audio codec + HDR range) -> **audio converted, video copied (audio codec)** | VIDEO TRANSCODE (container + audio codec + HDR range) -> **VIDEO TRANSCODE (audio codec + HDR range)** |
| #1 | mkv hevc Main 10 10bit 2160p DOVIWithHDR10; truehd 8ch, eac3 6ch; subrip(ext), subrip, PGSSUB | sub subrip(ext) | VIDEO TRANSCODE (container + audio codec + HDR range), sub drawn in browser -> **audio converted, video copied (audio codec), sub drawn in browser** | VIDEO TRANSCODE (container + audio codec + HDR range), sub drawn in browser -> **VIDEO TRANSCODE (audio codec + HDR range), sub drawn in browser** |
| #1 | mkv hevc Main 10 10bit 2160p DOVIWithHDR10; truehd 8ch, eac3 6ch; subrip(ext), subrip, PGSSUB | sub subrip | VIDEO TRANSCODE (container + audio codec + HDR range), sub drawn in browser -> **audio converted, video copied (audio codec), sub drawn in browser** | VIDEO TRANSCODE (container + audio codec + HDR range), sub drawn in browser -> **VIDEO TRANSCODE (audio codec + HDR range), sub drawn in browser** |
| #1 | mkv hevc Main 10 10bit 2160p DOVIWithHDR10; truehd 8ch, eac3 6ch; subrip(ext), subrip, PGSSUB | sub PGSSUB | VIDEO TRANSCODE (container + audio codec + subtitle codec + HDR range), sub burned in -> **audio converted, video copied (audio codec), sub drawn in browser** | VIDEO TRANSCODE (container + audio codec + subtitle codec + HDR range), sub burned in -> **VIDEO TRANSCODE (audio codec + HDR range), sub drawn in browser** |
| #2 | mkv hevc Main 10 10bit 2160p HDR10; dts 8ch; subrip(ext), PGSSUB | default | VIDEO TRANSCODE (container + audio codec + HDR range) -> **audio converted, video copied (audio codec)** | VIDEO TRANSCODE (container + audio codec + HDR range) -> **VIDEO TRANSCODE (audio codec + HDR range)** |
| #2 | mkv hevc Main 10 10bit 2160p HDR10; dts 8ch; subrip(ext), PGSSUB | sub subrip(ext) | VIDEO TRANSCODE (container + audio codec + HDR range), sub drawn in browser -> **audio converted, video copied (audio codec), sub drawn in browser** | VIDEO TRANSCODE (container + audio codec + HDR range), sub drawn in browser -> **VIDEO TRANSCODE (audio codec + HDR range), sub drawn in browser** |
| #2 | mkv hevc Main 10 10bit 2160p HDR10; dts 8ch; subrip(ext), PGSSUB | sub PGSSUB | VIDEO TRANSCODE (container + audio codec + subtitle codec + HDR range), sub burned in -> **audio converted, video copied (audio codec), sub drawn in browser** | VIDEO TRANSCODE (container + audio codec + subtitle codec + HDR range), sub burned in -> **VIDEO TRANSCODE (audio codec + HDR range), sub drawn in browser** |
| #3 | mkv hevc Main 10 10bit 2160p HDR10; eac3 6ch; subrip(ext), PGSSUB | default | VIDEO TRANSCODE (container + audio codec + HDR range) -> **audio converted, video copied (audio codec)** | VIDEO TRANSCODE (container + audio codec + HDR range) -> **VIDEO TRANSCODE (audio codec + HDR range)** |
| #3 | mkv hevc Main 10 10bit 2160p HDR10; eac3 6ch; subrip(ext), PGSSUB | sub subrip(ext) | VIDEO TRANSCODE (container + audio codec + HDR range), sub drawn in browser -> **audio converted, video copied (audio codec), sub drawn in browser** | VIDEO TRANSCODE (container + audio codec + HDR range), sub drawn in browser -> **VIDEO TRANSCODE (audio codec + HDR range), sub drawn in browser** |
| #3 | mkv hevc Main 10 10bit 2160p HDR10; eac3 6ch; subrip(ext), PGSSUB | sub PGSSUB | VIDEO TRANSCODE (container + audio codec + subtitle codec + HDR range), sub burned in -> **audio converted, video copied (audio codec), sub drawn in browser** | VIDEO TRANSCODE (container + audio codec + subtitle codec + HDR range), sub burned in -> **VIDEO TRANSCODE (audio codec + HDR range), sub drawn in browser** |
| #4 | mkv h264 Main 8bit 1920x1080; ac3 6ch; subrip | default | audio converted, video copied (container + audio codec) -> **audio converted, video copied (audio codec)** | audio converted, video copied (container + audio codec) -> **audio converted, video copied (audio codec)** |
| #4 | mkv h264 Main 8bit 1920x1080; ac3 6ch; subrip | sub subrip | audio converted, video copied (container + audio codec), sub drawn in browser -> **audio converted, video copied (audio codec), sub drawn in browser** | audio converted, video copied (container + audio codec), sub drawn in browser -> **audio converted, video copied (audio codec), sub drawn in browser** |
| #5 | mkv hevc Main 10 10bit 2160p DOVIWithHDR10; truehd 8ch, ac3 6ch, aac 2ch; subrip(ext), PGSSUB | default | VIDEO TRANSCODE (container + audio codec + HDR range) -> **audio converted, video copied (audio codec)** | VIDEO TRANSCODE (container + audio codec + HDR range) -> **VIDEO TRANSCODE (audio codec + HDR range)** |
| #5 | mkv hevc Main 10 10bit 2160p DOVIWithHDR10; truehd 8ch, ac3 6ch, aac 2ch; subrip(ext), PGSSUB | audio#4 ac3 6ch | VIDEO TRANSCODE (container + audio codec + HDR range) -> **audio converted, video copied (audio codec)** | VIDEO TRANSCODE (container + audio codec + HDR range) -> **VIDEO TRANSCODE (audio codec + HDR range)** |
| #5 | mkv hevc Main 10 10bit 2160p DOVIWithHDR10; truehd 8ch, ac3 6ch, aac 2ch; subrip(ext), PGSSUB | audio#5 aac 2ch | VIDEO TRANSCODE (container + HDR range) -> **remux, all copied (second audio track)** | VIDEO TRANSCODE (container + HDR range) -> **VIDEO TRANSCODE (second audio track + HDR range)** |
| #5 | mkv hevc Main 10 10bit 2160p DOVIWithHDR10; truehd 8ch, ac3 6ch, aac 2ch; subrip(ext), PGSSUB | sub subrip(ext) | VIDEO TRANSCODE (container + audio codec + HDR range), sub drawn in browser -> **audio converted, video copied (audio codec), sub drawn in browser** | VIDEO TRANSCODE (container + audio codec + HDR range), sub drawn in browser -> **VIDEO TRANSCODE (audio codec + HDR range), sub drawn in browser** |
| #5 | mkv hevc Main 10 10bit 2160p DOVIWithHDR10; truehd 8ch, ac3 6ch, aac 2ch; subrip(ext), PGSSUB | sub PGSSUB | VIDEO TRANSCODE (container + audio codec + subtitle codec + HDR range), sub burned in -> **audio converted, video copied (audio codec), sub drawn in browser** | VIDEO TRANSCODE (container + audio codec + subtitle codec + HDR range), sub burned in -> **VIDEO TRANSCODE (audio codec + HDR range), sub drawn in browser** |
| #6 | mkv hevc Main 10 10bit 2160p HDR10; aac 8ch; subrip(ext), DVDSUB | default | VIDEO TRANSCODE (container + HDR range) -> **direct** | VIDEO TRANSCODE (container + HDR range) -> **VIDEO TRANSCODE (HDR range)** |
| #6 | mkv hevc Main 10 10bit 2160p HDR10; aac 8ch; subrip(ext), DVDSUB | sub subrip(ext) | VIDEO TRANSCODE (container + HDR range), sub drawn in browser -> **direct, sub drawn in browser** | VIDEO TRANSCODE (container + HDR range), sub drawn in browser -> **VIDEO TRANSCODE (HDR range), sub drawn in browser** |
| #6 | mkv hevc Main 10 10bit 2160p HDR10; aac 8ch; subrip(ext), DVDSUB | sub DVDSUB | VIDEO TRANSCODE (container + subtitle codec + HDR range), sub burned in -> **VIDEO TRANSCODE (subtitle codec), sub burned in** | VIDEO TRANSCODE (container + subtitle codec + HDR range), sub burned in -> **VIDEO TRANSCODE (subtitle codec + HDR range), sub burned in** |
| #7 | mkv hevc Main 10 10bit 3840x2160 DOVIWithHDR10; ac3 6ch, eac3 6ch; subrip(ext), subrip | default | VIDEO TRANSCODE (container + audio codec + HDR range) -> **audio converted, video copied (audio codec)** | VIDEO TRANSCODE (container + audio codec + HDR range) -> **VIDEO TRANSCODE (audio codec + HDR range)** |
| #7 | mkv hevc Main 10 10bit 3840x2160 DOVIWithHDR10; ac3 6ch, eac3 6ch; subrip(ext), subrip | audio#4 eac3 6ch | VIDEO TRANSCODE (container + audio codec + HDR range) -> **audio converted, video copied (audio codec)** | VIDEO TRANSCODE (container + audio codec + HDR range) -> **VIDEO TRANSCODE (audio codec + HDR range)** |
| #7 | mkv hevc Main 10 10bit 3840x2160 DOVIWithHDR10; ac3 6ch, eac3 6ch; subrip(ext), subrip | sub subrip(ext) | VIDEO TRANSCODE (container + audio codec + HDR range), sub drawn in browser -> **audio converted, video copied (audio codec), sub drawn in browser** | VIDEO TRANSCODE (container + audio codec + HDR range), sub drawn in browser -> **VIDEO TRANSCODE (audio codec + HDR range), sub drawn in browser** |
| #7 | mkv hevc Main 10 10bit 3840x2160 DOVIWithHDR10; ac3 6ch, eac3 6ch; subrip(ext), subrip | sub subrip | VIDEO TRANSCODE (container + audio codec + HDR range), sub drawn in browser -> **audio converted, video copied (audio codec), sub drawn in browser** | VIDEO TRANSCODE (container + audio codec + HDR range), sub drawn in browser -> **VIDEO TRANSCODE (audio codec + HDR range), sub drawn in browser** |
| #8 | mkv h264 High 8bit SD; aac 6ch, mp3 2ch; ass, subrip | default | remux, all copied (container) -> **direct** | remux, all copied (container) -> **direct** |
| #8 | mkv h264 High 8bit SD; aac 6ch, mp3 2ch; ass, subrip | audio#2 mp3 2ch | remux, all copied (container) -> **remux, all copied (second audio track)** | remux, all copied (container) -> **audio converted, video copied (audio codec)** |
| #8 | mkv h264 High 8bit SD; aac 6ch, mp3 2ch; ass, subrip | sub ass | remux, all copied (container), sub drawn in browser -> **direct, sub drawn in browser** | remux, all copied (container), sub drawn in browser -> **direct, sub drawn in browser** |
| #8 | mkv h264 High 8bit SD; aac 6ch, mp3 2ch; ass, subrip | sub subrip | remux, all copied (container), sub drawn in browser -> **direct, sub drawn in browser** | remux, all copied (container), sub drawn in browser -> **direct, sub drawn in browser** |
| #9 | mkv h264 High 8bit 1280x720; dts 6ch, mp3 2ch; subrip(ext), ass | default | audio converted, video copied (container + audio codec) -> **audio converted, video copied (audio codec)** | audio converted, video copied (container + audio codec) -> **audio converted, video copied (audio codec)** |
| #9 | mkv h264 High 8bit 1280x720; dts 6ch, mp3 2ch; subrip(ext), ass | audio#4 mp3 2ch | remux, all copied (container) -> **remux, all copied (second audio track)** | remux, all copied (container) -> **audio converted, video copied (audio codec)** |
| #9 | mkv h264 High 8bit 1280x720; dts 6ch, mp3 2ch; subrip(ext), ass | sub subrip(ext) | audio converted, video copied (container + audio codec), sub drawn in browser -> **audio converted, video copied (audio codec), sub drawn in browser** | audio converted, video copied (container + audio codec), sub drawn in browser -> **audio converted, video copied (audio codec), sub drawn in browser** |
| #9 | mkv h264 High 8bit 1280x720; dts 6ch, mp3 2ch; subrip(ext), ass | sub ass | audio converted, video copied (container + audio codec), sub drawn in browser -> **audio converted, video copied (audio codec), sub drawn in browser** | audio converted, video copied (container + audio codec), sub drawn in browser -> **audio converted, video copied (audio codec), sub drawn in browser** |
| #10 | mp4 h264 Main 8bit 1080p; aac 2ch | default | direct (same) | direct (same) |
| #11 | mkv av1 Main 10bit 1920x1080; opus 2ch; ass | default | remux, all copied (container) -> **direct** | remux, all copied (container) -> **direct** |
| #11 | mkv av1 Main 10bit 1920x1080; opus 2ch; ass | sub ass | remux, all copied (container), sub drawn in browser -> **direct, sub drawn in browser** | remux, all copied (container), sub drawn in browser -> **direct, sub drawn in browser** |
| #12 | mkv h264 High 8bit 1080p; eac3 2ch, eac3 2ch; ass, subrip | default | audio converted, video copied (container + audio codec) -> **audio converted, video copied (audio codec)** | audio converted, video copied (container + audio codec) -> **audio converted, video copied (audio codec)** |
| #12 | mkv h264 High 8bit 1080p; eac3 2ch, eac3 2ch; ass, subrip | audio#2 eac3 2ch | audio converted, video copied (container + audio codec) -> **audio converted, video copied (audio codec)** | audio converted, video copied (container + audio codec) -> **audio converted, video copied (audio codec)** |
| #12 | mkv h264 High 8bit 1080p; eac3 2ch, eac3 2ch; ass, subrip | sub ass | audio converted, video copied (container + audio codec), sub drawn in browser -> **audio converted, video copied (audio codec), sub drawn in browser** | audio converted, video copied (container + audio codec), sub drawn in browser -> **audio converted, video copied (audio codec), sub drawn in browser** |
| #12 | mkv h264 High 8bit 1080p; eac3 2ch, eac3 2ch; ass, subrip | sub subrip | audio converted, video copied (container + audio codec), sub drawn in browser -> **audio converted, video copied (audio codec), sub drawn in browser** | audio converted, video copied (container + audio codec), sub drawn in browser -> **audio converted, video copied (audio codec), sub drawn in browser** |

In the WebKit column the word "remux" is taken from the server's reasons alone. For a source with HEVC video it is not true there: the WebKit profile offers only H.264 in HLS, so the server re-encodes the picture. Playwright's WebKit build on Windows is not Safari: it answers "probably" to every type, including made-up codecs,
and then fails to load each probe clip, which is exactly the case the real probes are for (Matroska correctly
stays off). Its other rows changed only because the AC-3 / E-AC-3 claim is now overruled by the failed clip.

### What the browsers really did with Matroska files (static stream in a bare `<video>`)

Each run: load, play 3 s, seek to the middle, pause 1 s, resume, 2 s at double speed, seek back to 10 %, seek to 3 s
before the end, play to the end.

| file | Edge 157 | Chrome 157 | Firefox 159 (Playwright build) |
|---|---|---|---|
| MKV H.264 + AAC, 120 s, 10 chapters | all steps ok; seeks 17-74 ms; `ended` at 120.02 s | same (24-125 ms) | all steps ok (74-266 ms) |
| MKV H.264, AAC + AC-3 5.1 + DTS | ok; the first track (AAC) is decoded | same | ok |
| MKV H.264 + AAC with PGS / VobSub tracks | ok (image tracks ignored) | same | ok |
| MKV HEVC 8-bit 3840x2160 + AAC | ok, 650 frames | same | metadata only, then "Failed to decode media" (no HEVC decoder in this headless build) |
| MKV HEVC Main 10 HDR10 + AAC | ok | same | same failure |
| MKV HEVC Main 10 + E-AC-3 5.1 | picture ok, **0 bytes of audio decoded, no error**: a silent film | same | same failure as above |
| which audio track of a two-track file plays (first: 440 Hz, second and default-flagged: 880 Hz) | 439 Hz: the first | 439 Hz | 439 Hz |

No browser offers `video.audioTracks` here. Playwright's WebKit fails all three probe clips.

### Through the app, with the server's own report

| case | Edge 157 | Chrome 157 | Firefox 159 (Playwright build) |
|---|---|---|---|
| MKV H.264 + AAC (resume at 30 s, seek to 100 s) | DirectPlay, no encoder | DirectPlay | DirectPlay |
| MKV HEVC 3840x2160 + AAC | DirectPlay, 3840x2160 decoded | not run | not run (no HEVC decoder) |
| MKV, second audio track (AAC, default-flagged) | HLS remux, encoder report "video direct, audio direct"; ffmpeg `-codec:v:0 copy -codec:a:0 copy`; 879 Hz heard (the second track) | same, with the PGS track drawn in the browser on top | not run |
| MKV H.264, AC-3 5.1 track chosen | video direct, audio AC-3 -> AAC 5.1 (`libfdk_aac -ac 6 -ab 384000`) | not run | not run |
| MKV HEVC Main 10 + E-AC-3 5.1 | video (HEVC) direct, audio -> AAC | not run | falls down the ladder to a full transcode (HEVC through MediaSource fails in this headless build) |
| PGS track on a directly played MKV | DirectPlay kept, track fetched as .sup (52 755 bytes), drawn by libpgs; cue visible at 9.5 s, none at 12.8 s; delay +3 s moves it | same | same |
| ASS track (attached font) on a directly played MKV | DirectPlay kept, JASSUB draws it | not run | not run |
| MKV HEVC Main 10 HDR10 (SDR display) | DirectPlay, tone-mapped by the browser; colours match the server's tone-mapped version of the same frame | same | server tone-maps (unchanged) |
| the same with "HDR10: Disable" | server tone-maps (VideoRangeTypeNotSupported) | not run | - |

Every session was stopped and was gone from the server afterwards; no encoder process and no file was left in the
transcode folder; the items' user data was put back.

### What an audio-only conversion costs

The server's own ffmpeg command lines, run again by hand inside the throwaway server's container (limited to 3 CPUs)
over the whole file, CPU time = user + system:

| job | media | CPU time | per minute of media |
|---|---|---|---|
| remux: H.264 and AAC copied | 90 s, 720p | 0.10 s | 0.07 s |
| H.264 copied, AC-3 5.1 -> AAC 5.1 384 kbit/s | 90 s | 2.10 s | 1.4 s |
| H.264 copied, DTS -> AAC stereo | 90 s | 1.22 s | 0.8 s |
| HEVC copied, E-AC-3 5.1 -> AAC 5.1 | 75 s | 1.66 s | 1.3 s |
| for contrast: 720p video re-encoded (x264 veryfast), a synthetic gradient that is far easier than film | 90 s | 17.98 s | 12 s |

So converting 5.1 audio takes about 1.4 CPU-seconds per minute of film: roughly 2 % of one core while it runs, or
about three CPU-minutes for a two-hour film (the server works ahead of playback at 40-50 times real speed and then
idles). The 5.1 layout is kept (AAC 6 channels).

### Not verified in this round

- **AC-3 / E-AC-3 decoded by a browser**: no browser on this PC decodes them (Edge reports no support, and the probe
  clips fail), so the "offer them where they decode" path ran only in unit tests and, negatively, here.
- **Real Safari / iOS** (Playwright's WebKit build stands in badly) and **released Firefox**: whether a given
  Firefox version plays Matroska is decided by the probe at run time; only Playwright's Firefox 159 build was run.
- **HEVC decoded by the hardware decoder in a visible window**, **an HDR display**, **Dolby Vision files** (the
  profile now leaves Dolby Vision with an HDR10 base layer to desktop Chromium, as Jellyfin's web client does; no
  such file was streamed), **surround output** (only that six channels are requested from the server).
- **Large real PGS tracks** (tens of MB): the only tracks drawn were the synthetic ones (37-53 KB). The real server
  was asked for PlaybackInfo only.
- **The production build under its Content-Security-Policy**: the build was made and the worker file
  (`libpgs.worker-*.js`, same origin) and the lazy chunk are emitted; it was not run behind the production server.
- **Picture-in-picture and native iOS fullscreen** show the video only, as they do for text and ASS subtitles.
