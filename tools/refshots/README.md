# refshots: reference screenshots of the official Wholphin Android TV app

Runs the real Wholphin APK (v1.1.1) in a headless Android TV emulator, drives it over `adb` and saves PNGs
(1920x1080 at 320 dpi, i.e. the standard 960x540dp TV canvas) to `refshots/out/` (git-ignored) together with a
`manifest.json`. Use them to compare the web port against the original.

## Prerequisites

- An Android SDK with `cmdline-tools`, `emulator`, `platform-tools`. Its folder is read from `ANDROID_HOME`, then
  `ANDROID_SDK_ROOT`; with neither set the tools stop with a message (there is no built-in default).
- Windows Hypervisor Platform enabled (`emulator -accel-check` must say "usable"). `create` refuses to continue otherwise.
- Java for `sdkmanager`/`avdmanager` (Java 25 works).
- Disk: the Android TV image `system-images;android-36;android-tv;x86_64` is 8.2 GB unpacked (1.5 GB download) and lives in the SDK.
  The AVD (`refshots/out/avd`) is about 1.3 GB, plus a 2 GB RAM backing file while the emulator runs. The APK is 54 MB.
  The PNGs are about 1.5 MB each (~300 MB for a full run).
- The throwaway Jellyfin test server (`tools/testserver`, port 8097) running, and `TESTSRV_USER` / `TESTSRV_PASSWORD`
  in `.env.local`. **Never point the emulator at your real Jellyfin server.** From the emulator the host is `10.0.2.2`.
- `gh` logged in (only to download the APK).

## Commands

```bash
# one-time
gh release download -R damontecres/Wholphin --pattern "Wholphin-x86_64.apk" -D refshots/out/apk
node tools/refshots/emulator.mjs create        # installs the TV image, creates AVD wholphin_tv (1920x1080, 320 dpi)
node tools/refshots/emulator.mjs start         # headless: -no-window -no-audio -no-boot-anim; waits for boot; disables animations
node tools/refshots/emulator.mjs install       # adb install the APK
node tools/refshots/emulator.mjs status        # JSON: accel, AVD, boot, resolution, app version
node tools/refshots/emulator.mjs stop

# capture (starts the emulator if it is not running; a full run takes roughly 1.5-2 hours)
node tools/refshots/capture.mjs                            # every scene
node tools/refshots/capture.mjs --scene movie-detail,home  # selected scenes (shots of those scenes are replaced)
node tools/refshots/capture.mjs --list                     # scene ids and numbers
```

Suggested npm scripts (not added, `package.json` is not owned by this tool):
`"ref:emu": "node tools/refshots/emulator.mjs"`, `"ref:shots": "node tools/refshots/capture.mjs"`.

Output: `refshots/out/<nn>-<scene>[-<suffix>].png` (nn = position of the scene in `scenes.mjs`) and
`refshots/out/manifest.json` with, per shot: file, description, the key sequence since the scene started, the focused
element's label, visible texts (not for playback shots, which skip the UI dump to stay fast), timestamp, md5.
Failed scenes and skipped scenes/entries are listed under `failures` (`SKIPPED: ...` for deliberate skips); a failed
scene also leaves `_fail-<scene>.png`. Re-running a scene replaces its previous shots and manifest entries.

## How sign-in works

`setup` scene: wipes the app data (`pm clear`), adds `http://10.0.2.2:8097`, opens Add User (Quick Connect mode), reads the
6-digit code from the screen (uiautomator text) and authorizes it from the host with the test user's API token
(`POST /QuickConnect/Authorize`). No password is ever typed into the app. Every other scene calls `ctx.ensureSignedIn()` or
restarts the app (it restores the session), and only runs the setup flow when the app is not at Home.

## Adding a scene

Edit `scenes.mjs` and append (new scenes go at the END, because file numbers follow list position):

```js
scene('my-screen', 'What it shows', async (c) => {
  await c.openDrawer('Movies');           // fresh app start, then pick a drawer entry by counting items
  await c.tab('Library');                 // library tab row
  await c.focus('Big Buck Bunny');        // D-pad to an element by label (string = exact, RegExp = pattern, {at:[x,y]} = point)
  await c.press('enter', 'wait:800');     // keys: up down left right enter back play pause ff rew next prev menu info stop
  await c.shot('detail', 'description');  // waits for the screen to stop changing, writes PNG + manifest entry
});
```

Helpers (see `ctx.mjs`, `adbui.mjs`): `press('down*3', 'long:enter', 'text:abc', 'wait:500')`, `focus`, `select`, `tab`,
`waitFor(text)`, `has(text)`, `toolbar(i)` (icon-only buttons on grid pages), `back(n)`, `scrollThrough(prefix, desc, {key, max})`
(shoot, press, repeat until the screen stops changing), `get(path)` (read-only API as the test user), `skip(reason)`.
Set `c.fast = true` around playback so shots do not wait for a moving video to "settle" (and the overlay does not time out).
Explore interactively: `node tools/refshots/adbui.mjs dump|texts|focus|key down|go "Label"|shot out.png`
(`UIDEBUG=1` prints the geometry decisions of `focus`).

## Known flaky spots

- The uiautomator tree lags behind Compose focus by up to a second on the software-rendered emulator; helpers wait before
  dumping, but a shot taken right after a key press may still catch an animation. `settle()` waits for two identical frames.
- The nav drawer is a lazy list taller than 1080 px with the test server's libraries, so it is walked by counting items
  (library order from `/UserViews`, plus a "Now playing" entry while music plays) with a geometry fallback. Changing the
  libraries on the test server changes the counts. Settings, Subtitle style etc. are drawer-free pages: leave with Back.
- Text labels that also exist in the drawer (e.g. a tab called "Collections") are matched only at x >= 140 px.
- Icon-only buttons have no label: they are addressed by position or by counting RIGHT presses (the focused button on
  detail pages expands to show its label, which shifts the others).
- Playback: controls hide after 5 s, so playback shots are quick (no dump); the first shot after starting depends on the
  video having started (fixed 6-9 s wait). Media segments exist on Orbital Drift S1 (Intro 4-14 s, Outro 21-30 s); the `segments` scene polls the UI tree for the Skip buttons (each dump costs ~4 s, the clips are ~30 s) and the test clips carry a burned-in time stamp.
- Dialogs with a text field need two Backs (keyboard, then dialog); `visit()` in `scenes.mjs` handles it.
- If the test server answers 503 (it was restarted/rescanned by someone else) the app drops to "Select Server": rerun the scene.
- The app theme is persisted: the `themes` scene ends on Purple; if it dies half way, run it again before other scenes.
- The emulator was observed to shut down between tool invocations in some shells; `capture.mjs` restarts it when it is missing.
- `EpisodeDetails` (episode page) is not reachable by normal navigation upstream; the `episode-detail` scene only shoots the
  episode context menu and records a skip.

## Scenes added later (34-36)

- 34 `live-tv`: drawer entry, Guide tab (focused program, scrolled right in time into the next day, down through the 4 channels), program dialogs
  (future program: Record Series/Record Program only; airing now: Watch live + record actions; only opened and photographed, never activated),
  View options dialog, DVR Schedule ("No scheduled recordings") and Recordings tabs, live playback of a channel with the overlay, Back.
  The only Live TV tabs are Guide, DVR Schedule and Recordings (no separate channels tab: channels are the guide's left column).
  Recordings is NOT empty on the test server (a Headline Hour folder with 7 pre-existing items). Never press Record anywhere.
- 35 `segments`: Orbital Drift S1E1: Skip Intro button, just after skipping, Skip Outro button, Next Up card with countdown.
  Skip behavior defaults (Ask to skip) already show the buttons, so no setting was changed; the settings screen is in `31-settings-advanced-skip`.
- 36 `image-subtitles`: PGS Image Subtitles item: Choose Subtitles dialog, English PGS selected, playback frames (play-1, 2, 5, 6 show the
  burned-in subtitle; 3, 4, 7 fall between cues), in-player captions dialog.
- Music Now Playing page, queue and the drawer "Now playing" entry were already covered by scene 28 `now-playing`.
