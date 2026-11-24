# Playback engineer's notes

Working notes of the playback agent (`.claude/agents/playback.md`). Read first in every playback task; keep short
and current. The contract of the engine is `engine/README.md`; real-media results are `engine/PLAYBACK_MATRIX.md`;
upstream behaviour is `docs/spec/05-playback.md`.

## How it is put together

- **Routes.** `/play/:itemId` -> `PlaybackPage.tsx`, `/play/list/:itemId` -> `PlaybackListPage.tsx`, both inside
  `FullScreenLayout` (`src/app/layouts.tsx`). Each builds a `PlaybackDestination` (`engine/destination.ts`), calls
  `usePlaybackSession(dest, back)` and renders `PlayerView`. The session hook starts the engine when the JSON of the
  destination changes and stops it in a *layout* cleanup (WebKit pauses a removed `<video>`; see the comment there).
- **Engine** (`engine/engine.ts`, one page-wide instance, `getPlaybackEngine()`): owns the single `<video>`,
  publishes everything in the Zustand `usePlaybackStore`. `start(dest)` -> item, queue (`queue.ts`; a played episode
  gets `queueForPlayedItem`: the contextual list cut at the item), intros, `playEntry(0)`. `playEntry` = full item,
  source/track choice (`streamChoice.ts`), then `changeStreams` = one `POST PlaybackInfo` -> backend (`backends.ts`:
  progressive / hls.js / native HLS) -> `ProgressReporter` (`reporting.ts`). `next()`, `previous()`,
  `previousButton()` (restart after 3 s), `playQueueIndex(i)`, `playNextUp()` all end in `playEntry` on the SAME
  element. `gen` guards stream events, `session` guards a whole start.
- **Queue moves.** `playEntry` tears the old stream down (`teardownStream` -> reporter.release = the one Stopped
  report), sets `index`, `hasNext`/`hasPrevious` (`queuePosition()`), `status: 'loading'`, keeps the old `item` until
  the full new item arrives (~50 ms), then sets item, tracks, chapters, duration. Before the teardown `holdFrame()`
  copies the current picture into a canvas (`[data-player-held-frame]`) laid over the element; `canplay`/`playing`
  of the new stream (or stop/fail) removes it. `frameHeld` in the store tells the UI.
- **Address follow** (`PlaybackPage`, since e6dece7): when the playing media changes, the page `navigate(replace)`s
  to `/play/<new id>` with history state `playbackFollowsQueue`; while that state is on, the destination that started
  the engine stays the running one, so the session key does not change. It calls `skipNextPageFade()` first.
- **UI** (`PlayerView.tsx`): `PlayerSurface` hosts the video; over it `SubtitleLayer` (text cues / JASSUB ASS /
  libpgs PGS), the click catcher, the black `data-player-cover` (only while loading with no held frame), the
  delayed (250 ms) small spinner (buffering, or loading over a held frame), skip / D-pad indicators, the overlay with
  `PlayerTopBar` (title) and `Controller` (`data-player-strip`, only mounted while the controls are visible).
  Visibility = `useControllerView` (show / hide / pulse timer, default 5 s). Next Up panel, Skip button, dialogs and
  panels (chapters, queue) sit outside the surface.
- **Input.** Keys: `ui/usePlayerKeys.ts` (+ `keymap.ts`; Up/Down = volume, `volumeStep.ts`). Mouse click on the
  picture waits 250 ms (`useMouseClickGate.ts`) so a double click (fullscreen) never toggles play. Hold-to-seek:
  `useSeekHold.ts` + `engine/seekHoldState.ts` hide subtitles from the skip until the seek has landed.
- **Dev hooks** (DEV only): `window.__playback = { engine, store }`, `window.__playerUi = { setDialog }`.

## Decisions and deviations that bind

- Previous / Next: Next greyed out (aria-disabled, still focusable and present) on the last entry, as upstream;
  Previous greyed out on the first entry (owner request; upstream keeps it enabled because it restarts after 3 s).
- A move between entries never blanks or fades the page: no page fade on the address follow, the last picture is
  held with the small spinner, the controls keep their state (Next Up click and a queue pick no longer hide them;
  a chapter pick still hides them, as upstream).
- The Stopped report fires exactly once per item left; one PlaybackInfo per move (tested in `playback.spec.ts`).

## Pitfalls already paid for

- `e6dece7`: the address follow changed the session key on the second move and restarted episode 1. Keep the
  follow state + `running` destination.
- `0daae7e`: a mouse click waits 250 ms before toggling play (double click = fullscreen).
- `7b000ca`: mouse movement must bring the controls back after a key hid them (`overlayHovered` is only meaningful
  while the strip shows).
- `93e5bf4`: subtitles hidden at a skip and shown when the seek landed; Up/Down = volume; Tab/Enter show controls.
- Page fade (this task): `usePageFade` (`src/app/shell/useShellLayout.ts`) animates the routed page from opacity 0
  over 700 ms on every new pathname; the address follow triggered it on every move. That, plus the black cover,
  was the owner's "reloads the whole page".
- Held frame (found by the independent checker, same task): `holdFrame()` must check for an empty video element
  BEFORE it releases the canvas it already holds; otherwise a second move before the first has a frame drops the
  held picture and the black cover flashes.
- Changed without being asked (same task): Previous is greyed out on the first queue entry, so on a single movie it
  no longer restarts the item (upstream keeps it enabled). The owner was told; change it back if they ask.

## Measuring in a headless browser

- Player specs are `@writes`: `E2E_PORT=5601 E2E_WORKERS=1 npx playwright test <spec> --project=writes`. One run at a
  time; it starts and stops its own dev server.
- Real codecs need `test.use({ channel: 'msedge' })`. Motion and timing: `reducedMotion: 'no-preference'` AND remove
  `style[data-e2e="no-animation"]` after load (the page fade honours prefers-reduced-motion; the fixture's default
  hides it, which is how it went unseen).
- Frame sampling: a `requestAnimationFrame` loop in the page that records node identity (mark with a dataset
  attribute), computed opacity up the ancestor chain, presence of `[data-player-cover]` /
  `[data-player-held-frame]`, `video.readyState`/`currentSrc`; print only the rows where something changed.
- Request counting: `page.on('request')` for `POST .../PlaybackInfo`, `/Sessions/Playing/Stopped` (ItemId in the
  body), `/Shows/*/Episodes`, `/Intros`. A delayed `page.route(/PlaybackInfo/)` stretches a move for screenshots.
- The test series "Orbital Drift" has Specials (2), Season 1 (6), Season 2 (4), Season 3 (5); episodes are 30 s.
  The stock client is at `http://localhost:8097/web/` (login `#txtManualName` / `#txtManualPassword`, next button
  `.btnNextTrack`, OSD `.videoOsdBottom`) and can be driven headlessly in Edge.

## Measured (2026-11-24, test server, headless Edge 1440x900)

- Before: next button -> black cover at +20 ms, address at +75 ms, whole page opacity 0 at +90 ms fading back to
  1 by ~+780 ms; the Next Up click hid the controls. No remount (player root, strip, video, 6 ancestors the same).
- After: no opacity change, no cover; last frame held ~160 ms (next button), ~360 ms (Next Up), ~160 ms (autoplay
  at the end); per move: Stopped, item, PlaybackInfo, Playing.
- Stock client 10.11: same element and OSD, empty element ~150 ms during which it shows the next item's poster,
  title updates when the new item starts, Previous/Next always enabled when the queue has more than one entry.

## Unverified

A visible window, real (long, high-bitrate, HDR) media, a library with merged versions of an episode, Safari / iOS
(native HLS) for the held frame, a cross-origin stream URL on a production build (the canvas is tainted but only
drawn, never read).
