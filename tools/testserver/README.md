# Throwaway Jellyfin test server

A disposable Jellyfin 10.11.11 in Docker for developing and screenshot-testing the web client. It is completely separate
from any real Jellyfin you use (default port 8096). Port **8097**, container `wholphin-web-test-jellyfin`, data under
`dev/testserver/data/` (git-ignored: `config`, `cache`, `media`, `avatars`).

## Commands

```bash
# first time (downloads ~1.5 GB of Blender movies, generates the synthetic media, starts Jellyfin, provisions it)
node tools/testserver/download-media.mjs      # real Blender open movies (archive.org / download.blender.org)
node tools/testserver/gen-media.mjs           # codec zoo, shows, music, photos (needs the container image; uses its ffmpeg)
node tools/testserver/setup.mjs               # compose up + idempotent provisioning (wizard, users, libraries, scan, state)

node tools/testserver/setup.mjs up            # start (docker compose up -d) and wait for readiness
node tools/testserver/setup.mjs down          # stop and remove the container (data stays)
node tools/testserver/setup.mjs status
node tools/testserver/setup.mjs rescan        # trigger a library scan and wait for it
node tools/testserver/setup.mjs verify        # read-only API checks as the `tester` user (32 PASS lines when all is well)
node tools/testserver/setup.mjs guide         # new Live TV guide when the server's copy is running out (it is dated: 8 days)
node tools/testserver/setup.mjs reset         # wipe data/config + data/cache, restart, re-provision (media is kept)
```

Compose file: `dev/testserver/docker-compose.yml`
(`docker compose -f dev/testserver/docker-compose.yml up -d` / `down` work too).

After `reset`, the first end-to-end run (`npm run e2e`) can fail on the page guard: while Jellyfin fills its image cache
for the first time it answers some image requests with 500, and its log shows "Response Content-Length mismatch". The
same addresses answer 200 afterwards. Run the suite again; the second run is clean (seen on 2026-11-18, when the suite
had 239 tests: three failed on five poster requests, then none on those; the suite has 250 tests now).

`verify` prints one PASS or FAIL line per check: one per library, posters, resume, Next Up, two PlaybackInfo checks,
Quick Connect, channels, the guide, the recordings folder, collections, playlists, four image-subtitle checks, the
Orbital Drift episodes and their six segment sets, and no timers. With the seeded libraries that is 32 checks.

Running `setup.mjs` again is a no-op once provisioned. Media generators skip files that already exist, so they are also safe
to re-run (delete a file or folder to regenerate it).

## Credentials

Generated on first run and written to `.env.local` (never printed): `TESTSRV_URL`, `TESTSRV_ADMIN_USER` /
`TESTSRV_ADMIN_PASSWORD`, `TESTSRV_USER` (`tester`) / `TESTSRV_PASSWORD`, `TESTSRV_USER2` (`Casey Rivera`, parental
rating limit PG-13, has an avatar) / `TESTSRV_PASSWORD2`, `TESTSRV_API_KEY`. `reset` reuses the same values.

## Libraries and test content

| Library | Type | Content |
|---|---|---|
| Movies | movies (TMDb on) | Blender open movies: Big Buck Bunny, Sintel, Tears of Steel, Elephants Dream (720p + 480p versions), Cosmos Laundromat, Spring, Agent 327, Coffee Run, Sprite Fright, Charge, Wing It!, Caminandes 2. Big Buck Bunny has a local trailer and an `extras/` folder. |
| Codec Zoo | movies (NFO only) | H.264/AAC MP4 (direct-play baseline), HEVC 10-bit + E-AC-3 5.1 MKV, HEVC HDR10 MKV, AV1 + Opus WebM, VP9 + Vorbis WebM, MPEG-4 ASP AVI, MPEG-2 MPG, Multi Track Showcase (3 audio tracks AAC/AC-3/DTS, SRT, styled ASS + attached font, forced SRT, external en/fr/forced sidecars), Chapter Marathon (10 named chapters), PGS Image Subtitles (two embedded hdmv_pgs_subtitle tracks, en + es), VobSub Image Subtitles (two dvd_subtitle tracks, en + es), Dual Audio Second Default (two AAC tracks: English first at 440 Hz, Japanese second and default-flagged at 880 Hz, plus a PGS and an ASS track), 4K HEVC, very long title, Hebrew title (RTL), Japanese title (CJK). |
| Shows | tvshows (NFO only) | Orbital Drift (media segments on all of season 1, see below; theme song, Specials, missing S02E03, future-dated S03E05), The Bakery on Elm Street, Detective Moth (TV-MA), Pixel Garden (TV-Y, Specials). |
| Music | music (tags only) | 3 artists x 2 albums (mp3 / flac / m4a, embedded covers), a two-disc live album, a `.lrc` lyrics sidecar. |
| Photos | homevideos | Two photo albums (mixed aspect ratios, EXIF on two thirds) and two short clips. |
| Mixed Folders | mixed content (no collection type) | Plain sub-folders with three photos and two clips copied from Photos (`media/Mixed`), for the generic folder browser. |
| Live TV | M3U + XMLTV | 4 channels streaming library items; no timers. A `Recordings` library holds three pre-made files (copies of a 3.5 MB clip), nothing is ever recorded (see "Never record Live TV" below). |
| Collections | auto | Boxsets `Blender Open Movies` and `Blender Shorts`; playlists `Weekend Watchlist` (video) and `Late Night Mix` (music), created for `tester`. |

`tester` has resume points, played items, favourites (movie, series, episode, person, artist, album) and mid-season
series so Next Up has entries. Provisioning also makes sure there is at least one in-progress movie and one
in-progress episode (Pixel Garden S1E2), even after other test runs finished the seeded ones.

## Image subtitles (PGS / VobSub)

The Jellyfin image's ffmpeg has no PGS encoder, so `imgsubs.mjs` writes the raw HDMV PGS stream (.sup) itself: each cue is rendered to a
bitmap with ffmpeg `drawtext` and packed as PCS/WDS/PDS/ODS/END segments (3-colour palette, run-length coded). `gen-media.mjs` (ids `pgs`,
`vobsub`) muxes the .sup files into a 24 s 720p MKV with `-c:s copy`; for VobSub the same kind of .sup files are decoded and re-encoded with the
bundled `dvdsub` encoder (`-c:s dvdsub -fix_sub_duration`). Nothing is downloaded and each item is about 1 MB. Cues sit at 2-6, 8-12, 14-18 and
20-24 s and the text says `[PGS]` or `[VobSub]`. Jellyfin reports the codecs as `PGSSUB` and `DVDSUB` (`IsTextSubtitleStream: false`); with a
profile that lists them only as `Encode` (what `verify` sends), selecting a track (body field `SubtitleStreamIndex` of PlaybackInfo) gives
`SubtitleMethod=Encode`, i.e. burn-in. The web client's profile asks for PGS as `External`: the server then serves the track as a .sup stream
(`.../Subtitles/<index>/0/Stream.pgssub`) and the client draws it; for DVDSUB the server also answers "External", but that URL returns 404, so the
client keeps burn-in for it. The PGS clips are cut at 24 s, before the display set that would end the fourth cue (a client that draws nothing after
a stream's last display set never shows that cue).
Regenerate: delete the item folder, run `node tools/testserver/gen-media.mjs zoo`, then `setup.mjs` (it rescans when the items are missing).

## Media segments (Skip intro / outro / next up)

Jellyfin 10.10+ serves `GET /MediaSegments/{itemId}`, but core cannot create segments: they come from segment-provider plugins. The route here is
the official **Chapter Segments Provider** plugin, pinned to **4.0.0.0** (the 10.11 build, GUID `698b6f33-14ca-49b5-9d79-fc3c0ab941f5`), which turns
chapter names into segments. It is cheap (no audio fingerprinting). `setup.mjs` installs it only into this throwaway container through Jellyfin's own
package API (`POST /Packages/Installed/Chapter%20Segments%20Provider?assemblyGuid=...&version=4.0.0.0`, from the default `repo.jellyfin.org`
repository, checksum checked by the server), restarts the container once so it loads, and runs the **Media Segment Scan** scheduled task. The plugin
lives in `data/config/plugins/`, so `reset` reinstalls it.

`segments.mjs` (also run by `gen-media.mjs shows` / `segments`) remuxes the six Orbital Drift season 1 clips with `-c copy` to add chapters; a
segment runs from its chapter start to the next chapter (the last one to the end of the clip). The plugin matches chapter names with its default
regexes (`intro|opening`, `recap|previously on`, `preview|next time on`, `outro|closing|credits|ending`), so "Credits" becomes an Outro:

| Episodes | Chapters (start, s) | Segments (s) |
|---|---|---|
| S01E01-03, S01E05, S01E06 (30 s) | Cold Open 0, Intro 4, Main Story 14, Credits 21 | Intro 4-14, Outro 21-30 |
| S01E04 Salvage Rights (30 s, the seeded next-up) | Recap 0, Intro 5, Main Story 13, Credits 20, Preview 27 | Recap 0-5, Intro 5-13, Outro 20-27, Preview 27-30 |

Every episode has a successor (E04 then E05, E06 then S02E01), so "outro, then next episode" can be exercised. Avoid chapter names containing `ad` or
`break` (the plugin makes those Commercial segments). Do not edit Jellyfin's database by hand; if segments go missing, run `setup.mjs` (it rescans
and re-runs the scan). Segments only appear for the library's own refresh: a changed file needs a library scan before the scan task sees its chapters.

## CPU cap

`docker-compose.yml` sets `cpus: 3`, so a recreated container keeps the cap (same as `docker update --cpus 3`). Check with
`docker inspect wholphin-web-test-jellyfin --format '{{.HostConfig.NanoCpus}}'`, which should print `3000000000`.

## Never record Live TV

Do not create timers or press Record: the channels are local files served as fast as the recorder reads them, so a single timer can write tens of GB and fill the disk.
`setup.mjs` cancels any timer it finds and `verify` checks that `GET /LiveTv/Timers` is empty.

The recordings tab and the recording folder still need something to show, so provisioning copies a small clip three times into
Jellyfin's default recording folder (`/config/data/livetv/recordings/<show>/`) and restarts the container once: Jellyfin makes the
`Recordings` library for that folder when it starts and finds it there. `verify` checks that the folder is reported.
