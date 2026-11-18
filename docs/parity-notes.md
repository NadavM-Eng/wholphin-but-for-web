# Visual parity pass: notes

What the visual-parity pass against the Android TV app compared, changed and left. Written by the integrator of the
pass for the lead, who folds it into `DEVIATIONS.md`, `DECISIONS.md`, `STATUS.md` and `TOOLING.md`.

## 1. Method

- **References.** `refshots/out`: 244 pictures of the TV app (emulator, 1920x1080 at density 2, so the TV canvas is
  960x540 dp and 1 dp is 2 picture pixels), described by `manifest.json` (scene, key sequence, focused element).
- **Source of truth.** Every number came from the Kotlin (`reference/wholphin`) or, for library behaviour that is
  not in the repository (tv-material, compose-material3, Media3, AboutLibraries), from the recorded defaults in
  `src/ui/LIB_DEFAULTS.md` and the compiled libraries. Pictures were used to find differences and to confirm fixes.
- **Measuring.** Web elements were measured in a headless, muted browser (`getBoundingClientRect`,
  `getComputedStyle`) and compared in dp. A 1920x1080 window with the interface scale at 160 % has root scale 2:
  the page is laid out on 960x540 dp and a picture of it overlays a reference picture.
- **Steps.** Eleven area passes (compare, fix inside the area, list requests for shared code), one shared-kit
  pass (`src/ui`, `src/app`, `src/theme`), eleven independent checks, eleven fix passes, then this integration
  (outstanding shared requests, collisions, the crawler scenes, gates).
- **Server.** Only the throwaway test Jellyfin. Its data changed during the pass (watched marks, resume points,
  favourites, two more libraries, chapters on one episode, a rebuilt Live TV guide), so several pictures differ in
  content from the references. That is data, not a port difference.

## 2. The compare sheet now covers every reference picture

`npm run shots:compare` crawls `tools/shots/tvScenes.ts`: 208 keyboard-driven scenes at the TV canvas, paired with all
244 reference pictures by `tools/shots/refmap.ts` (36 references share a scene because the TV pictures show the
same state). Details are in `tools/shots/README.md`. New crawler features: per-scene preferences and clock,
`compareOnly` scenes, `--channel msedge` (an installed browser, still headless and muted, for H.264), and the
playback session of a player scene is ended right after its picture.

Reference pictures whose web scene shows something else on purpose:

| Reference | Web scene shows | Why |
|---|---|---|
| `01-setup-add-dialog-discovery` | the manual entry dialog | no LAN discovery in a browser (recorded) |
| `10-movie-versions-trailer-dialog` | the focused Play trailer button | the TV picture is that button plus an Android toast; the web opens a remote trailer in a new tab |
| `20-search-keyboard`, the keyboards in `01-setup-add-dialog-*`, `31-settings-advanced-quick-connect` | the same state without a keyboard | system keyboard on the web (recorded) |
| `31-settings-advanced-backend` | the SSA/ASS choice dialog | the playback backend chooser is not ported; the dialog shell is the same |
| `31-settings-advanced-page-4` to `-7` | other rows focused | Android-only rows are not ported, so five steps down land elsewhere |
| `32-settings-home-customize-row-settings` | the presets page | the reference file is a copy of the presets picture (same hash) |
| `02-home-row-2` | the row after Continue watching | the TV row is "Watch live" with the programs airing at capture time |
| `25-playback-episode-skipped-forward`, `-next-up`, `-next-up-2` | the controller and the Next Up panel of scene 35 | same components; the exact moment is not reproduced |
| `34-live-tv-after-back` | the guide | the web returns to the watched program after Back (recorded) |

No reference picture is without a web scene. Not reproducible as a picture: the on-screen keyboards, the Android
toast, the "Wholphin updated" snackbar of `01-setup-server-empty`.

## 3. Per area

Counts are reference pictures, by the area's own verdict after its pass ("left" = a difference remained in the
area's report; many of those were closed later by the shared-kit pass or the integration, see section 4).

| Area | References | Pictures | Matched as found | Fixed | Left | No counterpart |
|---|---|---|---|---|---|---|
| Setup, shell, themes | 01, 03, 33 | 29 | 11 | 17 | 0 | 1 |
| Home, search, favorites, home customization | 02, 19, 20, 32 | 24 | 8 | 10 | 4 | 2 |
| Library browsing | 04, 05, 06, 08, 12, 17 | 22 | 1 | 10 | 10 | 1 |
| Movie detail, menus, choosers | 09, 10, 11, 15 | 20 | 4 | 7 | 9 | 0 |
| Series, person, playlist, collection | 13, 14, 16, 18 | 22 | 6 | 6 | 9 | 1 |
| Player controls | 23, 24, 25 | 19 | 1 | 14 | 1 | 3 |
| Player overlays (segments, Next Up, image subtitles) | 35, 36 | 20 | 11 | 3 | 1 | 5 |
| Settings, main | 21, 22 | 24 | 4 | 16 | 3 | 1 |
| Settings, advanced and subtitle style | 30, 31 | 21 | 10 | 3 | 7 | 1 |
| Live TV | 34 | 21 | 3 | 14 | 4 | 0 |
| Music, photos | 07, 26, 27, 28, 29 | 22 | 9 | 13 | 0 | 0 |
| Total | | 244 | 68 | 113 | 48 | 15 |

### 3.1 The finding behind most vertical offsets

A Compose `Text` on tv-material has no `LineHeightStyle`, so the default (`Trim.Both`, font padding off) applies: the
leading above the first and below the last line is cut. A one-line text is as tall as the font (Roboto: 1.172 em),
not the type scale's line height: bodyMedium 16.4 dp instead of 20, titleLarge 25.8 instead of 28. Every stacked
text on the web was 2 to 5 dp too tall. The fix is three opt-in helpers in `src/theme/global.css` (`t-line`,
`t-trim`, `t-trimBox`) used by every kit text that stands for one Compose Text, and by the features.

### 3.2 Fixed, by area (TV value -> web before -> web after, file)

Setup, shell, themes
- Backdrop colour wash: `radialGradient(color, Transparent)` interpolated premultiplied -> an 8-stop ramp that also faded to black (corner #292927 where the TV has #3f3a34) -> two stops, same colour at alpha 0; `src/app/shell/backdropColors.ts`.
- Backdrop colours from the stored image (upstream's URL without a size) -> from the 1600 px rendition -> from the original; the picture on screen stays window-sized; `src/app/shell/backdropService.ts`.
- Drawer list scroll with the keyboard: focused item at 30 % of the list (98.4 dp on `03-nav-drawer-library-focused`) -> no scroll -> 98 dp; `src/app/shell/NavDrawer.tsx`.
- Profile entry lines 16.4 dp apart -> 20 -> 16.5; clock digits 1 dp lower -> trimmed; `NavDrawer.module.css`, `Clock.module.css`.
- Server and user pickers: `Box { Column(spacedBy 24, padding 16) centred; message bottom, padding 32 }` -> untrimmed lines and a message that pushed the column -> one grid for all heights; `src/features/setup/SetupFrame.*`.
- Add-server and login dialog width `fillMaxWidth(.4f)` inside 16 dp padding = 403.2 dp -> 384 -> 403.2; dialog heights 147 / 183.5 dp -> 152 / 164 -> 147 / 185; no placeholder in the address field; `src/features/setup/setup.module.css`, `AddServerDialog.tsx`.
- Switch servers button: 8 dp between icon and text -> 16 -> 8. A user list without users focuses nothing (`UserList.kt`) -> Add User focused -> nothing focused; `SwitchUserScreen.tsx`.

Home, search, favorites, home customization
- Rows without items compose nothing -> an 8 dp wrapper each -> no height; `src/features/home/HomePage.module.css`.
- Header text title: one 32.8 dp line in the 60 dp box (`TitleOrLogo.kt`) -> 36 dp, two lines -> 32.8 dp, one line; `HomeHeader.module.css`.
- Last row reaches the top (`ScrollToTopBringIntoViewSpec(50dp)` and 172 dp bottom padding) -> stayed 170 dp lower on a 1080 px window -> title at 266 dp; `HomePage.module.css`.
- Customization panel: items 24-336 dp, title centre 29 dp, 1 dp divider #49454F, 17 dp move buttons, row text at 40 dp -> 16-344, 34, 0.8 dp at 12 % onSurface, 32 dp, 60 dp -> TV values; `src/features/home/settings/*`.
- Search header centred (`Box(contentAlignment = Center)`): mic 316, field 368-648, options 660-700 dp -> 68 dp off below 1000 px -> centred down to 840 px; `src/features/search/SearchPage.module.css`.
- Favorites: episode cards show the episode's own image (`useSeriesForPrimary = false`) -> the series poster -> the episode image; the People tab keeps its letter column (letters do nothing there, as upstream); `src/features/browse/FavoritesPage.tsx`, `data/favoritesSource.ts`.

Library browsing
- Grid extent: starts at the page start (72 dp), 838 dp wide, 6 posters of 126.33 dp, 4 tiles of 197.5 dp (`CardGrid.kt`, `NavDrawer.kt:558`) -> 88..898 dp, 121.66 / 191 dp -> TV values; the scroll box is widened so the focus scale is not clipped (16 dp for tiles); `src/features/browse/components/LibraryGrid.*`, `TileGrid.tsx`, `model/gridColumns.ts`.
- Toolbar 57 dp and first card 113 dp under a tab row -> 62 / 122 -> 58 / 114; pages without tabs start at the top (title y 0) -> 16 dp lower -> 0; footer 27 dp centred on the grid -> 32 dp centred on grid plus letters -> 27; letter column 34 dp -> 38 -> 34.
- View options rows are preference rows (titleSmall / bodySmall, 64 dp, 1.05 focus scale) -> generic list rows -> the settings components; `ViewOptionsDialog.tsx`.
- Right from the last column enters the letter column at the current letter (`AlphabetButtons` onEnter) -> nearest letter -> current letter; `letterFocus.ts`.
- Filter menu: material3 position (48 dp from the window edge when it fits neither below nor above), unscaled anchor -> under the button at 103 dp -> 48 dp; divider material3 outlineVariant; `FilterButton.*`.
- Phone toolbar scrolls sideways instead of overlapping when a label expands (web only); `GridHeader.module.css`.

Movie detail, menus, choosers
- Header rhythm (4 dp gaps, 48 dp top, trimmed texts): button row at 316 dp -> 333.5 -> 315.7; `src/features/detail/common/DetailHeader.module.css`.
- People row `contentPadding = 8.dp` -> first card at 88 dp -> 80 dp; `PeopleRow.tsx` (through `ItemRow`'s `contentPadding`).
- Chooser rows always have supporting content (64 dp) -> 56 dp for None / Only Forced -> 64; the Version dialog opened from its button uses the 1 dp surface -> 3 dp colour -> 1 dp; `streamChooser.tsx`, `StreamChooserDialog.tsx`.
- Media Information: section texts trimmed exactly, divider outlineVariant: General at 280 dp -> 282.5 (and 20 dp low before the pass) -> 279.8; `MediaInfoDialog.module.css`.

Series, person, playlist, collection
- Series details: studios 19 dp, button row without vertical padding (250-290 dp), 80 dp bottom padding -> 24 dp, 273-313, 8 -> TV values; `src/features/detail/series/SeriesDetails.*`.
- Series overview: strip 120 dp, 4 dp above the buttons and nothing below, content clipped 16 dp inside the window (`padding(vertical = 16.dp).verticalScroll`) -> 128 dp, 16 dp extra, unclipped -> TV values; `SeriesOverview.*`, `EpisodeStrip.module.css`.
- Person page: photo weight 1, panel weight 3, corner radius 10 % of the shorter side -> file-size photo, 40 dp radius -> 1fr / 3fr, measured radius; Down from the overview scrolls Favorite to the pivot (160 dp) -> no scroll -> 162 dp; `src/features/detail/person/PersonPage.*`.
- Playlist rows: 17 / 17 / 12 dp pills (`Button(contentHeight = 24)`), bodyLarge position number, 20 sp heart -> three 24 dp circles, 14 sp, inherited size -> TV values; on touch the pills keep their size with an invisible 48 dp hit area; `src/features/detail/playlist/PlaylistDetails.*`.
- Collection page: 8 dp between header and items -> 16 -> 8; `collection/BoxSetDetails.*`.

Player controls
- Controller rhythm from font-height lines (title 33 dp, subtitle 21, timecodes 16.4): bar centre 460.5 dp -> 456 -> 460.6; subtitle and Ends at top-aligned; `src/features/playback/ui/Controller.module.css`.
- Seek bar: 6 dp canvas (12 focused), round caps reaching half the thickness past both ends, knob 14 / 26 dp -> 24 dp layout box, no caps, 16 / 28 -> TV values with an invisible pointer area; `SeekBar.*`.
- Trickplay preview: bottom at controller top + 8 + 28 sp + 18 sp, 160 dp box with a 1.5 dp border inside -> anchored to the seek row, 163 dp, 1 dp -> TV values (inset shadow, since browsers floor a 1.5 px border); `TrickplayPreview.module.css`, `Controller.tsx`.
- Bottom dialogs: 424 dp list, 64 dp rows, focused row reaching past the panel, as tall as the screen minus 16 dp -> 440 dp, 56 dp, clipped, 80 % -> TV values; `PlayerSheet.*`, `PlaybackDialogs.*`.
- Disabled Next button: surfaceVariant at 40 %, content at 48 % -> black 40 %, 40 % -> TV values; `PlaybackButton.module.css`.
- Chapter row opens with the current chapter first (`rememberLazyListState(chapterIndex)`); queue row is a `SeasonCard` row without badges; title and subtitle cut in the middle (`TextOverflow.MiddleEllipsis`); `ChapterRow.tsx`, `QueueRow.tsx`, `MiddleEllipsisText.tsx`.
- RTL: the player's Back button is no longer reachable with Left / Right; top bar inset uses logical padding; `PlayerView.*`.

Player overlays
- Next Up panel: `(screen - 16dp) x .66` wide and `x .4` tall = 623 x 209.6 dp -> 633.6 x 200 -> 623 x 209.6; texts trimmed; card fills the row height; countdown badge a pill; `NextUpPanel.*`.
- Text subtitles with the controls up: the 70 % box top-centre, margin as a fraction of that box -> only the height shrank -> TV rule; `engine/SubtitleLayer.*`, `engine/subtitles/style.ts`.
- Enter on the floating Skip button only seeks (controls stay hidden) -> the key-up showed the controls -> swallowed; a mouse over the button no longer raises the controls; `ui/usePlayerKeys.ts`, `PlayerView.tsx`.

Settings
- Rows without a summary are two-line rows (64 dp) -> 48 -> 64; slider rows 72 dp -> 80 -> 72; header 44.1 dp, group header 30.75 dp -> 48 / 36 -> 45 / 31; `src/features/settings/Preference.module.css`, `SettingsLayout.module.css`.
- Theme dialog: the plain choice dialog (dot only, 440 dp, 56 dp rows) -> swatches, a selected highlight, 280 dp -> TV look; `ThemePreference.*`.
- Language dialog: names in themselves over their English names, en-US first, generated order -> one "English", capitalised names -> TV list; `uiLocales.ts`, `LanguagePreference.tsx`.
- Wrap from the last row to the first scrolls the list to its top (`lazyListWrapScrolling`) -> nearest -> top; a focused slider row sits at 146 dp -> 157 -> 146; `SettingsLayout.tsx`, `Preference.module.css`.
- Subtitle preview: three equal thirds with the padding inside, outline `edgeThickness / 4` dp visible, font line spacing 1.172, 2 dp shadow, window padding 0.25 em -> unequal thirds, twice the outline, 1.25 -> TV values; `SubtitlePreview.*`, `subtitleStyle.ts`.
- Quick Connect dialog 360 x 147 dp -> 280 x 152 -> 360 x 147; license rows in the AboutLibraries layout with theme-derived badge colours; `QuickConnectPreference.module.css`, `LicensePage.*`, `licenseColors.ts`.
- Subtitle panel floor 240 dp (25 % of the TV canvas) -> 360 -> 240; license authors without e-mail and URL; `SettingsLayout.module.css`, `tools/gen-licenses.ts`.

Live TV
- Guide header: `padding(top = 48dp).fillMaxHeight(.30f)`, title one 32.8 dp line, details column 60 % -> 30 % of the column, two lines -> TV values; text positions within 0.5 dp; `src/features/livetv/TvGuide*.{tsx,module.css}`.
- A short guide is centred in its box; 4 dp under the header when the options row is hidden -> at the top, 8 dp -> centred (landscape windows only) and 4 dp; `GuideGrid.*`, `TvGuide.*`.
- The focused cell is drawn above the "now" line and keeps its focused look behind its dialog; program dialog 440 x 246 dp -> content-sized, about 260 -> 440 x 245.4; `ProgramCell.*`, `ProgramDialog.*`.
- Keyboard: Up from any program of the first row goes to View options, Up again to the selected tab, a chosen tab's content takes focus; `GuideGrid.tsx`, `LiveTvView.tsx`.

Music, photos
- Music library tabs use the shared library grid (6 square columns, letters, footer) and the home-style Recommended tab -> their own grid and a scrolling column -> shared components; `src/features/music/MusicLibraryPage.tsx`, `library/*`.
- Album / artist header: cover 20 % of the page, trimmed lines, 4 dp gaps; song rows 40 dp back to back (44 for the playing row) -> cover 20 % of the rest, 4 dp gaps between rows -> TV values; `components/MusicHeader.*`, `SongRow.module.css`.
- Now Playing: cover 240 dp, texts 8 dp apart, overlay `(100 % - 32dp) x .33 + 32dp`, round 32 dp queue buttons, play / pause focused when the keyboard opens the controls, no top scrim; `NowPlayingPage.*`, `src/app/shell/Backdrop.tsx`.
- Photo grids: header exactly title plus 40 dp row, grid from the page edge, letters centred, footer "n / total" in bodyLarge with raw integers; viewer overlay 252.6 dp (TV 251.5); `src/features/photos/*`.

## 4. Shared kit and integration

Shared-kit pass (`src/ui`, `src/app`, `src/theme`; details in the kit's own `LIB_DEFAULTS.md`):
- Focus ring: a 3 dp stroke centred on the card edge (tv-material strokes the outline), drawn by the scaler so it is not clipped; `src/ui/cards/CardFrame.*`.
- Text trimming helpers and their use in rows, cards, tabs, list items, chips, pills, headers (section 3.1).
- `DialogPopup` 440 dp wide (the platform dialog width), menu at the 1 dp surface, 16 sp leading icons, disabled rows at 48 %, divider material3 outlineVariant #49454F (new token `--fx-m3-outline-variant`), `ConfirmDialog` 440 dp with a bodyLarge body.
- Dropdown menus: bodyLarge items and material3's position rule (`src/ui/lib/menuPosition.ts`).
- Arrow keys: the focused element is scrolled to the TV's pivot (30 % of the viewport, `src/ui/lib/bringIntoView.ts`); rows, tab rows and button rows are entered at their remembered or selected element; an opener keeps its focused look under its dialog or menu.
- Text fields (8 dp text inset, 48 dp icon slot, flat 4 dp focus band), sliders (round caps, PURPLE inactive colour), tab row (25 dp, 0.5 sp tracking), quick-details star touching the rating, 22 dp stream chips, expandable button without the 8 dp spacer, letter picker focus colours.

Integration (this step):

| Change | TV value | Web before | Web after | File |
|---|---|---|---|---|
| Card title clip and marquee | `padding(horizontal = 4.dp).enableMarquee()`: the padding is outside the marquee | clipped at the card edge; the marquee overshot by 8 dp and cut the first letter during its pause | clipped and scrolled 4 dp inside the card | `src/ui/cards/CardTitle.tsx` |
| A title that just fits | "The Glass Orchard" stands still in its 118 dp box | scrolled (the web font is about 1 dp wider) | an overflow of up to 1.5 dp does not scroll | `src/ui/lib/marquee.ts` |
| Dialog height | a dialog may be as tall as the screen (530 dp menu on 540 dp) | capped 32 dp below the window height | full window height | `src/ui/overlays/Dialog.module.css` |
| Popup list | the title stays, the `LazyColumn` scrolls | the whole panel scrolled; a long menu ran into the bottom padding | the list scrolls inside the panel | `src/ui/overlays/DialogPopup.*` |
| Language dialog | `DialogPopupContent` bare on the dimmed page, title centre 13 dp | normal container, title centre 52.5 dp | bare from 720 px up (title, rows and text on the TV positions); container kept on phones | `DialogPopup.*`, `src/features/settings/LanguagePreference.tsx` |
| Dialog over a menu | a second dialog covers the first | the menu (z-index 950) stayed above the confirm dialog and covered its button | one layer, later on top | `src/ui/overlays/DropdownMenu.module.css` |
| Overview text | first line at the top of the fixed box | `text-box` (rounded, unreliable in a clamp) | exact margins | `src/ui/text/OverviewText.module.css` |
| Preference rows with a wrapped title | 73 px title + 28 px summary at density 2 | 1 dp taller per row | exact trim | `src/features/settings/Preference.module.css`, `src/features/home/settings/HomeSettings.module.css` |
| List layout (playlists, library list view) | `padding(top = 8 or 48dp, bottom = 16dp)`: 48 dp once the header is hidden | rows scrolled under the clock; focused row 57 dp higher | 48 dp, focused row on the TV line (`18-playlist-page-4`) | `src/features/browse/components/LibraryGrid.*` |
| List details pane | `QuickDetails(.., null)`, title in a centred box, 116 dp overview box | "Ends at" shown, title 21 dp high, box only with text | TV values | `src/features/browse/components/ListDetails.*` |
| Player chapter and queue rows | the row does not move while the next card is in view (`24-playback-chapters-chapters-2`) | every focused card scrolled to 30 % | scrolls only as far as needed (`data-focus-scroll="nearest"`) | `src/ui/lib/bringIntoView.ts`, `src/features/playback/ui/ChapterRow.tsx`, `QueueRow.tsx` |
| Letter column | a plain `LazyColumn` | Up on `#` wrapped to `Z` | no wrap | `src/ui/rows/AlphabetPicker.tsx`, `src/ui/lib/focus.ts` |
| Left from a row that has nothing to its left | the rail (in the beam) beats an element in another row | Left from a song row went up to Play | goes to the drawer | `src/app/spatialNav.ts`, `src/app/AppShell.tsx` |
| Player subtitles | outline `edgeThickness / 2` dp as stroke width, font line spacing, wrap background without padding, 2 dp shadow | twice the outline, 1.25, 0.25 em padding | the settings preview's rules | `src/features/playback/engine/subtitles/style.ts` |
| Dialog shadows | no shadow on a dialog whose content only has a background | view options (browse, Live TV, photos) and the program dialog cast one | none | their `*.module.css` |
| Settings panel floor | 384 dp (40 % of 960) | 400 dp | 384 dp | `src/features/settings/SettingsLayout.module.css` |
| RTL header lines | start padding on the line's start edge | padding followed the text's own direction on `dir="auto"` lines | padding on a wrapper | `src/features/detail/common/DetailHeader.tsx` |

On the dialog shadows: the pass's last report says that the `box-shadow: none` lines were taken back out of the browse view options (`src/features/browse/components/ViewOptionsDialog.module.css`) before hand-back, so that only the Live TV and photo view options and the program dialog lose their shadow. That change was never committed: the file on `parity` (`d23d5bc`) and on `main` (`e1b7e04`) still sets `box-shadow: none`. Whether the rule wins over the shared dialog's shadow in the browser was not checked for these notes.

Collisions between agents, resolved: one pivot helper instead of two (`src/app/shell/pivotScroll.ts` removed, its
test kept as `navDrawerScroll.test.ts`); literal `1.172` line heights replaced by `--t-font-height`; three
different trimming techniques reduced to the kit helpers where the box allows it; the settings `text-box` trim
that doubled the kit's `ListItem` trim; the divider token used without a literal fallback everywhere.

## 5. New deviations (TV behaviour -> web behaviour -> why -> file)

Shell and kit
- Bring-into-view jumps in Compose's animation -> smooth scroll unless reduced motion is asked for -> web convention -> `src/ui/lib/bringIntoView.ts`.
- No Back button on the TV -> the floating Back button hides for keyboard users while the window is scrolled and returns on any pointer movement or when it takes focus -> pivot scrolling would put row titles under it; keyboard users have the Back keys -> `src/app/AppShell.tsx`, `src/app/shell/AppShell.module.css`.
- The opener keeps real focus behind a dialog -> it is marked `data-focus-held` while focus is inside the overlay (keyboard only) -> web focus must move into the overlay -> `src/ui/lib/inputModality.ts`.
- Dialog 440 dp wide -> 440 dp capped at the window minus a 16 dp gutter -> phones -> `src/ui/overlays/Dialog.module.css`.
- Language dialog bare on the dimmed page at every size -> bare from 720 px up, the normal container below -> the list would sit on the settings rows on a phone -> `src/ui/overlays/DialogPopup.module.css`.
- Title text is one line with an ellipsis -> two lines below 600 px -> a phone would cut most titles -> `src/ui/text/TitleOrLogo.module.css`.
- A title scrolls whenever it overflows -> an overflow of up to 1.5 dp does not scroll -> the web font's advance widths run about 1 % wider than the TV's -> `src/ui/lib/marquee.ts`.
- Disabled list row content at 48 % (64 % focused) is a measured value, not a ported constant -> `src/ui/overlays/ListItem.module.css`.
- Backdrop colours come from the stored image, the picture shown is window-sized -> one more image request per backdrop -> exact colours without drawing originals on phones -> `src/app/shell/backdropService.ts`.
- Backdrop image box is 70 % x 70 % of a 16:9 canvas -> never wider than 16:9 on wider windows -> the fitted image showed its start edge as a line -> `src/app/shell/Backdrop.module.css`.
- Drawer list: only keyboard focus scrolls it to the pivot; hover and touch never do -> `src/app/shell/NavDrawer.tsx`.
- Drawer selection for a page opened by its URL: the first stack entry that is a drawer destination is selected, as upstream (`[Home, item]` selects Home, a bare deep link selects nothing). The `33-themes-detail-*` references show Movies because the TV reached the item through the library: a state difference, not a port difference -> `src/app/shell/drawerItems.ts`.

Setup
- The bottom message is drawn over the centred column -> it has its own row and pushes the column up when it is taller than the free space -> windows of any height -> `src/features/setup/SetupFrame.module.css`.
- Dialog column 40 % of the screen at any size -> never narrower than 403 dp or the window, never wider than 640 dp -> phones and ultrawide windows -> `src/features/setup/setup.module.css`.
- Removed deviations: no placeholder in the server address field; a user list without users focuses nothing.

Home, search
- Home: the last non-empty row gets `min-height: 100cqh - 5dp` on hover-capable devices so it can reach the top on any window height -> fluid layout -> `src/features/home/HomePage.module.css`.
- Home customization: the Source list starts at 48 dp (TV 41.8) to clear the Back button; the drag handle overlays the row's start padding; up / down buttons are 17 dp wide with a fine pointer and at least 32 dp on touch -> `src/features/home/settings/HomeSettings.module.css`.
- Search: centred down to 840 px (was 1000), then it only clears the Back button and clock -> `src/features/search/SearchPage.module.css`.
- Search arrival focus: the TV focuses the first child of the search row, the voice button when shown; the web focuses the text field on keyboard or mouse arrival, never on touch -> the web field is always editable -> `src/features/search/SearchPage.tsx` (the existing row in `DEVIATIONS.md` should say that the TV focuses the voice button).

Library browsing
- The library page clips in the block axis only and the grid's scroll box is 8 dp (tiles 16 dp) wider on each side -> a CSS scroller clips both axes, a Compose grid does not clip across its scroll axis -> `src/features/browse/components/LibraryGrid.module.css`, `TabbedPage.module.css`.
- The view options dialog imports the settings preference components -> same composable upstream -> `ViewOptionsDialog.tsx`.
- Phone toolbar scrolls sideways when an expanded label makes it wider than the window -> `GridHeader.module.css`.
- List layout: the 48 dp top padding follows the web's header rule (hidden once scrolled more than 24 px) instead of "focus past the first row" -> the existing header rule, see Q-24 -> `LibraryGrid.tsx`.

Detail pages
- Person page: the photo keeps the 48 dp Back reserve (198 x 298 dp at x = 120 instead of 210 x 315 at 72; the filmography sits about 18 dp higher); 16 dp bottom padding below 760 px -> `src/features/detail/person/PersonPage.module.css`.
- Series overview: the 16 dp clip of the scrolled content is a `clip-path` that follows the window; the window stays the scroller -> scroll restoration and phone browser bars -> `src/features/detail/series/SeriesOverview.tsx`.
- Series overview, Down from an episode to Play: the TV scrolls about 165 dp (`14-series-overview-page-2`), which the Kotlin does not determine (two competing bring-into-view requests); the web follows the explicit `header.bringIntoView()` and does not scroll -> `SeriesOverview.tsx`. *Corrected after the polish round:* the Kotlin does account for most of it. The scrolled column is padded 16 dp before it scrolls and sits under a delayed nested scroll (`SeriesOverviewContent.kt:147-155`, `DelayedNestedScrollConnection.kt`, `yDelay` 0.33), and the reference run had animations off; the one-frame move onto the buttons is fitted to the picture. The web now lands where the TV does with reduced motion, and this deviation is removed (`src/features/detail/series/overviewScroll.ts`; `docs/final-merge-notes.md` section 13.3).
- Playlist row buttons on touch: TV pill sizes with an invisible 48 dp hit area (replaces the earlier 32 dp minimum) -> `src/features/detail/playlist/PlaylistDetails.module.css`.
- Chooser rows without a second line pass an empty supporting slot so the kit lays them out as two-line rows -> `src/features/detail/common/streamChooser.tsx`.

Player
- Image subtitles (PGS, VobSub) with the controls up: the TV moves its client-drawn cue into the top-centre 70 %; the web's cue is burned in by the server and stays where it was authored, behind the seek bar -> a client renderer would be a new dependency -> add to the existing "Image subtitles and ASS: transcode" row.
- Next Up: a Cancel button in the panel's top-end corner while counting (Back / Escape still cancels) -> pointer and touch have no Back key -> `src/features/playback/ui/NextUpPanel.*`.
- A mouse move whose target is the floating Skip button or the Next Up panel does not raise the controls -> the TV hides the button while the controls are up, so a mouse could never click it -> `src/features/playback/PlayerView.tsx`.
- Seek bar: a pointer area 9 dp (16 dp on touch) above and below the 6 dp bar outside the layout; hover grows the bar like focus; knob radius is bar height + 1 dp (the TV's 2 physical pixels at density 2) -> `ui/SeekBar.module.css`.
- Bottom dialogs show no scroll bar (the focused row reaches past the panel) and may be as tall as the screen minus 16 dp -> `ui/PlayerSheet.module.css`.
- Middle ellipsis is measured and cut in script; with no subtitle the Ends at text stays at the end (the TV's row slides it to the start) -> `ui/MiddleEllipsisText.tsx`, `ui/Controller.tsx`.
- Next Up card: never wider than half the row on tall or narrow windows -> `ui/NextUpPanel.module.css`.

Settings
- Slider rows: the layout box is the 6 dp track (so the pivot matches), with an invisible 28 dp (44 px on touch) pointer area -> `src/features/settings/Preference.module.css`.
- About dialog: 380 dp cap from 720 px up, full window height below -> its buttons were cut off on phones -> `InstalledVersionPreference.module.css`.
- Theme dialog: focusing or hovering an option previews it until the dialog closes (kept, unrecorded so far) -> `ThemePreference.tsx`.
- Language names come from the browser's `Intl.DisplayNames` (capitalisation of a few names differs from Android) -> `uiLocales.ts`.
- License page: rows get a visible focus highlight (the TV list shows none); badge colours follow the theme through CSS relative colours; the untranslated notices are `dir="auto"` -> `LicensePage.*`, `licenseColors.ts`.
- Subtitle panel: 25 % with a 240 dp floor (the TV's own width) -> `SettingsLayout.module.css`.

Live TV, music, photos
- Guide placement: centred in landscape windows as on the TV; under 600 px wide and in portrait windows the rows stay under the buttons -> the TV canvas is always 16:9 -> `src/features/livetv/GuideGrid.module.css`.
- A grid cell carries `data-held` while its dialog is open; tab content takes focus after a tab is chosen except on touch-only devices; the overview paragraph is pulled up by its half-leading -> `src/features/livetv/*`.
- Album and artist header with the Back button: the cover stays at x = 72 dp and sits 24 dp lower (not on phones) -> the Back button occupies the corner -> `src/features/music/components/MusicHeader.module.css`.
- Mini player background is opaque; music genre page keeps square cards and queues the genre's songs (upstream stretches covers to 2:3 and opens the video playlist player) -> `src/features/music/*`.
- Now Playing: the shell's Back button is hidden while the controls are hidden; controls opened by the mouse do not take focus -> `NowPlayingPage.tsx`.
- Photo grids: the window scrolls, letters and footer stay in view; the column count follows the width -> `src/features/photos/PhotoFolderView.*`.

Upstream bug fixed: the Artists tab's sort button does nothing on the TV (`createGetArtistsRequest` drops the sort);
the web sends it (`src/features/music/library/musicSources.ts`). Upstream quirks reproduced on purpose: the
expandable button's 8 dp spacer takes no width, grid titles never show their ellipsis, a two-line title request ends
as one line in the 60 dp box, the 16 dp divider box draws its line along the top, empty filmography rows keep
their 16 dp spacing, the customization pages apply the 8 dp entry padding twice.

## 6. What is still different, largest first

1. **Dynamic backdrop colours on some images.** Solved after this pass: the cause was Skia's nearest-neighbour sampling in the bitmap scaling that Palette does before it picks colours, not the JPEG decoders; see [DEVIATIONS.md](DEVIATIONS.md).
2. **Live TV playback overlay.** The web shows the seekable window with a "Live" label; the TV shows position,
   remaining time and "Ends at" (`34-live-tv-player-overlay*`). Recorded deviation (spec 05 B4).
   *Corrected after the polish round:* these are not the program's times. The TV shows ExoPlayer's position and
   remaining time within the stream it received, and an "Ends at" worked out from them (`PlaybackControls.kt:253-322`,
   `PlaybackController.kt:203-218`); nothing in upstream's player reads a guide program. The picture, taken 20 minutes
   into a 30-minute program, shows "3s", "-28m 39s" and "Ends at 5:20 PM". The web receives a transcode window of
   about 30 s for the same channel, so it could not show those numbers either; the deviation stands
   (`docs/final-merge-notes.md` section 13.3).
3. **Scroll position after some arrow-key moves in the series overview.** `14-series-overview-page-2`: the TV
   scrolls about 165 dp, the web does not. `14-series-overview-page-3`: about 20 dp apart. Other pages land on the
   TV's pivot. *Settled after the polish round:* the offsets come from the column's 16 dp padding and its delayed
   nested scroll, with the reference run's animations off (see the corrected entry in section 5); with reduced
   motion the web now lands at 165.0 and 324.5 dp against the TV's 165 and 325.
4. **Image subtitles behind the controls** (section 5).
5. **Recorded web-only parts that move things:** the Back button (tabs start 48 dp later, person photo and album
   cover offsets), the mini player bar and its page reserve, the player's volume / picture-in-picture / fullscreen
   buttons, the Cancel button of Next Up, drag handles and the Sign out and Interface scale rows in settings.
6. **Text width.** The web's Roboto runs up to about 1 % wider than the TV's, so a few lines break or end one word
   earlier (movie overview: "... After…" where the TV shows "... After the deaths …").
7. **Letter jump.** After Enter on a letter the TV picture (`08-library-grid-dialogs-alphabet-jumped`) shows focus
   on the card it came from; the web focuses the first item at or after the letter, as `CardGrid.kt` reads.
   *Corrected after the polish round:* the TV picture shows an upstream bug, not a different design. `CardGrid.kt`
   picks each card's focus requester inside `remember(index, item, cardWidthPx, columns)` (lines 362-375) without the
   focused index, so `focusOn(jumpPosition)` never moves the requester and the grid's `focusRestorer` hands focus
   back to the last focused card. The web keeps what `jumpToLetter` (lines 215-231) means to do; recorded in
   `DEVIATIONS.md` section 7 as an upstream bug not copied.
8. **Not ported or adapted by earlier decision:** the old-server warning on the setup screens, Android-only
   settings rows, the About dialog instead of release notes, search arrival focus.
9. **Engines without `text-box`.** A few feature files still trim with `text-box` (music, photos, drawer, some
   settings titles): Firefox keeps full line boxes there (2 to 5 dp per text). The kit and most features use the
   exact helpers. *Settled after the polish round* (`1850f33`): every feature stylesheet now uses the exact helpers,
   except the Live TV view-options title; only the kit's `t-trimBox`, for that title and for `ListItem` slots with
   element children, still uses `text-box`.

## 7. Not verified

- Firefox and WebKit rendering of the parity changes beyond the e2e smoke projects; real phones and real touch.
- Pictures: about a third of the compare pairs were looked at one by one in this step (72 of 244, all areas);
  the rest only through the area passes.
- The D-pad seek overlay, a People row with more than 30 people (virtualised path), a Next Up item without an
  overview, DVR rows with real timers, program images and channel logos in the guide (the test server has none).
- Preview states without a reference picture: boxed and shadowed subtitle styles, the margin and image-opacity
  samples, the multi-choice and preferred-language dialogs, the music genre page, the song page.
- The player's subtitle cue after the outline change was checked by unit test only, not measured in a playing video.
- The 1.5 s cross-fade of the Now Playing backdrop in motion; the Now Playing page in a right-to-left locale.
- Whether Home and detail rows on the TV pivot horizontally after several Right presses: only the player's chapter
  row has a reference picture for it, and it does not.
