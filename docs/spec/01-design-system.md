# Wholphin design system spec (extracted for the web port)

Source: Wholphin, Jetpack Compose for TV Jellyfin client (read-only reference).
Path shorthand used in every citation:

- `W/` = `app/src/main/java/com/github/damontecres/wholphin/`
- `R/` = `app/src/main/res/`
- Machine-readable twin of this document: `design-tokens.json` (same folder).

Conventions: `dp` and `sp` are Compose units. "LIB DEFAULT" means the value is not in the repo; it comes from `androidx.tv:tv-material:1.1.0-alpha01` (`gradle/libs.versions.toml:25`) or `androidx.compose.material3` (BOM `2026.09.00`, `libs.versions.toml:15`). The API to look up is named, and any number I give for a LIB DEFAULT is from memory of the library, marked "(unverified)". Nothing has been executed.

---

## 1. Color themes

### 1.1 Mechanics

- 8 themes, enum `AppThemeColors` (`proto/WholphinDataStore.proto:122-131`; path `app/src/main/proto/`): PURPLE=0, BLUE=1, GREEN=2, ORANGE=3, BOLD_BLUE=4, OLED_BLACK=5, RED=6, BROWN=7. UI labels come from `R/values/strings.xml:630-639` (Purple, Blue, Green, Orange, Bold Blue, Black, Red, Brown; the `black` string is the label for OLED_BLACK). Picker order in the UI is the enum order.
- **Default theme: PURPLE.** `W/preferences/AppPreference.kt:558-568` (`defaultValue = AppThemeColors.PURPLE`), `W/ui/theme/Theme.kt:17-18` (`LocalTheme` default), `W/ui/theme/Theme.kt:30-31` (UNRECOGNIZED falls back to Purple). Before user prefs load, `W/MainActivity.kt:232` uses `PurpleThemeColors.darkScheme`.
- Each theme object (`W/ui/theme/colors/<Name>ThemeColors.kt`) implements `ThemeColors` (`W/ui/theme/ThemeColors.kt:3-8`) with four schemes: `lightScheme`, `darkScheme` (androidx.tv.material3 `ColorScheme`) and `lightSchemeMaterial`, `darkSchemeMaterial` (androidx.compose.material3 `ColorScheme`).
- `WholphinTheme` (`W/ui/theme/Theme.kt:33-57`) installs BOTH: the TV scheme into `androidx.tv.material3.MaterialTheme` (used by almost everything, via `MaterialTheme.colorScheme.*`) and the Material scheme into `androidx.compose.material3.MaterialTheme`. The Material scheme only reaches M3 widgets: `TextFieldDefaults`/`BasicTextField` in `EditTextBox` (`W/ui/components/EditTextBox.kt`), and any other `androidx.compose.material3` composable.
- **Light mode is NOT reachable.** `WholphinTheme(darkTheme: Boolean = true, ...)` (`Theme.kt:34-35`). Every call site passes `true` or omits it: `W/MainActivity.kt:266-269` (`WholphinTheme(true, appThemeColors=...)`), `W/WholphinDreamService.kt:107`, previews. No preference, no `isSystemInDarkTheme()` usage (grep returned nothing). Light tables are included for completeness only. The web port should ship dark only.
- The TV scheme and Material scheme hold identical values for every shared role, except `border`, which exists only in the TV scheme (verified by script: only `border` differs). So the tables below apply to both.
- The `border` role is the app's accent/focus color. It is used for focus rings, selected nav icons, progress/loading spinners, slider fill, tab underline, star-focus highlight, watched check badge background, and so on. Treat `border` as `--accent`.
  - `border = inversePrimary` for BLUE, BOLD_BLUE, BROWN, ORANGE, OLED_BLACK, RED (dark: e.g. `BlueThemeColors.kt:201`, light: `:140`).
  - `border = inversePrimary` at alpha 0.75 (0xBF) for PURPLE and GREEN dark (`PurpleThemeColors.kt:183`, `GreenThemeColors.kt:201`); their light border is plain inversePrimary (`PurpleThemeColors.kt:122`).
- Color literal format in source is `Color(0xAARRGGBB)`. The tables below are converted to CSS order: `#RRGGBB` when alpha is FF, otherwise 8-digit `#RRGGBBAA`. OLED_BLACK uses alpha `C0` (75%) on several roles (e.g. `OledThemeColors.kt:47,50`).
- Roles passed to the TV scheme: 27 (the 26 below plus `border`). Roles `surfaceDim`, `surfaceBright`, `surfaceContainer*`, `outline`, `outlineVariant` are declared as `val`s in every file except Purple but are never passed to any `ColorScheme` constructor (see `design-tokens.json` -> `declaredButNotAppliedToAnyScheme`). Do not use them as the app's look. The TV `ColorScheme` also receives LIB DEFAULTs for roles it does not set (`surfaceTint`, `borderVariant`; see 1.4).
- File anchors per theme: values are declared at the top of each file (light block starts at line 10, dark block follows), scheme constructors start at lines recorded in `design-tokens.json` -> `themes.<NAME>.schemeStartLines`.

| Theme | File | darkScheme constructor line | notable |
|---|---|---|---|
| PURPLE | `W/ui/theme/colors/PurpleThemeColors.kt` | 155 (TV), 125 (Material) | shortest file (185 lines), no unused extra vals |
| BLUE | `BlueThemeColors.kt` | 173 / 143 | |
| GREEN | `GreenThemeColors.kt` | 173 / 143 | border alpha .75 dark |
| ORANGE | `OrangeThemeColors.kt` | 174 / 144 | `surfaceDark = backgroundDark` (`:65`) |
| BOLD_BLUE | `BoldBlueThemeColors.kt` | 174 / 144 | primary is dark navy, onPrimary light blue |
| OLED_BLACK | `OledThemeColors.kt` | 176 / 146 | pure black bg, alpha-white text (`onDark = 0xC0FFFFFF`, `:47`) |
| RED | `RedThemeColors.kt` | 174 / 144 | |
| BROWN | `BrownThemeColors.kt` | 174 / 144 | |

### 1.2 Dark scheme (the one actually used), TV `ColorScheme`, all 8 themes

| role | PURPLE | BLUE | GREEN | ORANGE | BOLD_BLUE | OLED_BLACK | RED | BROWN |
|---|---|---|---|---|---|---|---|---|
| primary | #D2BCFF | #AAC7FF | #98D5A4 | #B67F12 | #0C2A67 | #4D4B4BC0 | #FFB4AA | #FFB784 |
| onPrimary | #3D008F | #09305F | #00391A | #E0CB7F | #558DD0 | #FFFFFF | #561E18 | #4F2500 |
| primaryContainer | #7A28FE | #274777 | #16512C | #574500 | #192E4F | #505050 | #73342C | #6D390C |
| onPrimaryContainer | #EADCFF | #D6E3FF | #B3F1BF | #FFE086 | #B4C9F6 | #FFFFFFC0 | #FFDAD5 | #FFDCC6 |
| secondary | #D2BCFF | #BEC7DC | #B7CCB7 | #D4C5A1 | #BEC7DC | #808080 | #E7BDB7 | #E4BFA8 |
| onSecondary | #3B167D | #283141 | #223526 | #383016 | #283141 | #FFFFFFC0 | #442926 | #422B1B |
| secondaryContainer | #48415B | #3E4759 | #394B3C | #524127 | #3E4759 | #505050 | #5D3F3B | #5B412F |
| onSecondaryContainer | #DFD3F8 | #DAE2F9 | #D2E8D3 | #F1E1BB | #DAE2F9 | #FFFFFFC0 | #FFDAD5 | #FFDCC6 |
| tertiary | #A071F8 | #BECEFF | #81D29C | #FCE574 | #BEC9FF | #DEDEDE | #DFC38C | #C8CA94 |
| onTertiary | #5E0052 | #31285F | #01363F | #492900 | #28345F | #363535 | #3F2E04 | #30330B |
| tertiaryContainer | #B800A3 | #483F77 | #204D56 | #693C00 | #8CDDE8 | #909090 | #574419 | #47491F |
| onTertiaryContainer | #FFD7F0 | #E6DEFF | #BDEAF5 | #FFDCBD | #E6DEFF | #FFFFFF | #FDDFA6 | #E5E6AE |
| error | #FFB4AB | #FFB4AB | #FFB4AB | #FFB4AB | #FFB4AB | #FFB4AB | #FFB4AB | #FFB4AB |
| onError | #690005 | #690005 | #690005 | #690005 | #690005 | #690005 | #690005 | #690005 |
| errorContainer | #93000A | #93000A | #93000A | #93000A | #93000A | #93000A | #93000A | #93000A |
| onErrorContainer | #FFDAD6 | #FFDAD6 | #FFDAD6 | #FFDAD6 | #FFDAD6 | #FFFFFF | #FFDAD6 | #FFDAD6 |
| background | #15121C | #111318 | #101510 | #1C1715 | #111318 | #000000 | #1A1110 | #19120D |
| onBackground | #E8DFF0 | #E2E2E9 | #DFE4DC | #EAE2D4 | #E2E2E9 | #FFFFFFC0 | #F1DEDC | #F0DFD6 |
| surface | #15121C | #121318 | #101510 | #1C1715 | #0A1017 | #000000 | #1A1110 | #19120D |
| onSurface | #E8DFF0 | #E3E2E9 | #DFE4DC | #EAE2D4 | #DAE3FA | #FFFFFFC0 | #F1DEDC | #F0DFD6 |
| surfaceVariant | #4A4456 | #44474F | #414941 | #4C4639 | #44474F | #303030 | #534341 | #52443B |
| onSurfaceVariant | #CCC3D9 | #C4C6D0 | #C1C9BF | #CEC6B4 | #C4C6D0 | #FFFFFFC0 | #D8C2BE | #D7C3B7 |
| scrim | #000000 | #000000 | #000000 | #000000 | #000000 | #000000 | #000000 | #000000 |
| inverseSurface | #E8DFF0 | #E3E2E9 | #DFE4DC | #EAE2D4 | #E3E2E9 | #E8E8E8 | #F1DEDC | #F0DFD6 |
| inverseOnSurface | #332E3A | #2F3036 | #2D322D | #343027 | #2F3036 | #000000 | #392E2C | #382F29 |
| inversePrimary | #741BF8 | #405F90 | #39912F | #E39012 | #152986 | #F9F4FFC0 | #C0000C | #6D3B07 |
| border | #741BF8BF | #405F90 | #39912FBF | #E39012 | #152986 | #F9F4FFC0 | #C0000C | #6D3B07 |


### 1.3 Light scheme (defined, unreachable)

| role | PURPLE | BLUE | GREEN | ORANGE | BOLD_BLUE | OLED_BLACK | RED | BROWN |
|---|---|---|---|---|---|---|---|---|
| primary | #5F00D6 | #405F90 | #316A42 | #725C0C | #405F90 | #405F90 | #904A42 | #8A5022 |
| onPrimary | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF |
| primaryContainer | #7A28FE | #D6E3FF | #B3F1BF | #FFE086 | #D6E3FF | #D6E3FF | #FFDAD5 | #FFDCC6 |
| onPrimaryContainer | #EADCFF | #274777 | #16512C | #574500 | #274777 | #274777 | #73342C | #6D390C |
| secondary | #6B4BAE | #565F71 | #506352 | #685E3F | #565F71 | #565F71 | #775652 | #755845 |
| onSecondary | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF |
| secondaryContainer | #B594FD | #DAE2F9 | #D2E8D3 | #F1E1BB | #DAE2F9 | #DAE2F9 | #FFDAD5 | #FFDCC6 |
| onSecondaryContainer | #472489 | #3E4759 | #394B3C | #50462A | #3E4759 | #3E4759 | #5D3F3B | #5B412F |
| tertiary | #8F007E | #605690 | #3A656E | #855317 | #605690 | #605690 | #715C2E | #5F6135 |
| onTertiary | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF |
| tertiaryContainer | #B800A3 | #E6DEFF | #BDEAF5 | #FFDCBD | #E6DEFF | #E6DEFF | #FDDFA6 | #E5E6AE |
| onTertiaryContainer | #FFD7F0 | #483F77 | #204D56 | #693C00 | #483F77 | #483F77 | #574419 | #47491F |
| error | #BA1A1A | #BA1A1A | #BA1A1A | #BA1A1A | #BA1A1A | #BA1A1A | #BA1A1A | #BA1A1A |
| onError | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF |
| errorContainer | #FFDAD6 | #FFDAD6 | #FFDAD6 | #FFDAD6 | #FFDAD6 | #FFDAD6 | #FFDAD6 | #FFDAD6 |
| onErrorContainer | #93000A | #93000A | #93000A | #93000A | #93000A | #93000A | #93000A | #93000A |
| background | #FEF7FF | #F9F9FF | #F6FBF3 | #FFF8F0 | #F9F9FF | #F9F9FF | #FFF8F7 | #FFF8F5 |
| onBackground | #1D1A25 | #191C20 | #181D18 | #1E1B13 | #191C20 | #191C20 | #231918 | #221A15 |
| surface | #FEF7FF | #FAF8FF | #F6FBF3 | #FFF8F0 | #FAF8FF | #FAF8FF | #FFF8F7 | #FFF8F5 |
| onSurface | #1D1A25 | #1A1B21 | #181D18 | #1E1B13 | #1A1B21 | #1A1B21 | #231918 | #221A15 |
| surfaceVariant | #E9DEF6 | #E1E2EC | #DDE5DA | #EBE2CF | #E1E2EC | #E1E2EC | #F5DDDA | #F3DED3 |
| onSurfaceVariant | #4A4456 | #44474F | #414941 | #4C4639 | #44474F | #44474F | #534341 | #52443B |
| scrim | #000000 | #000000 | #000000 | #000000 | #000000 | #000000 | #000000 | #000000 |
| inverseSurface | #332E3A | #2F3036 | #2D322D | #343027 | #2F3036 | #2F3036 | #392E2C | #382F29 |
| inverseOnSurface | #F6EDFE | #F1F0F7 | #EEF2EA | #F8F0E2 | #F1F0F7 | #F1F0F7 | #FFEDEA | #FEEDE4 |
| inversePrimary | #D2BCFF | #AAC7FF | #98D5A4 | #E1C46D | #AAC7FF | #AAC7FF | #FFB4AA | #FFB784 |
| border | #D2BCFF | #AAC7FF | #98D5A4 | #E1C46D | #AAC7FF | #AAC7FF | #FFB4AA | #FFB784 |


### 1.4 LIB DEFAULT roles not set by the repo

- `androidx.tv.material3.darkColorScheme()/lightColorScheme()` defaults for `surfaceTint` (believed = `primary`) and `borderVariant`. Used by `surfaceColorAtElevation` (see 1.5). `scrim` is set explicitly (`#000000` in every theme).
- Material3 `darkColorScheme()` defaults fill `surfaceContainer*`, `outline`, `outlineVariant` etc. for the Material scheme only; effectively only `EditTextBox` / `TextFieldDefaults` uses them.

### 1.5 Elevation surfaces

`MaterialTheme.colorScheme.surfaceColorAtElevation(e)` (`androidx.tv.material3`, LIB DEFAULT) is used for dialogs, menus, settings panel, and list rows. Standard M3 formula (unverified for tv variant, same idea): `surface` blended with `surfaceTint` at alpha `((4.5 * ln(e_dp + 1)) + 2) / 100`; `e = 0` returns `surface`. Elevations used: 1dp (dialog default, settings panel `W/ui/preferences/PreferencesContent.kt:221`, list rows `W/ui/components/CollectionFolderList.kt:616-621` with extra alpha .5), 3dp (context menu dialogs `W/ui/components/ContextMenu.kt:349,361,386`, dropdown items `W/ui/components/TvDropdownMenuItem.kt:30`, preference dialogs `W/ui/preferences/ComposablePreference.kt:246`). For the web: precompute these with the formula per theme (JSON tokens do not precompute them).

### 1.6 Non-theme fixed colors (`W/ui/UiConstants.kt:24-43`, object `AppColors`)

| name | value | use |
|---|---|---|
| TransparentBlack25 | `#00000040` | screensaver vignette (`W/ui/components/AppScreensaver.kt:220`) |
| TransparentBlack50 | `#00000080` | corner count pills (`W/ui/cards/ItemCardImage.kt:220,253`), chapter label bar (`W/ui/cards/ChapterCard.kt:87`) |
| TransparentBlack75 | `#000000BF` | star-rating pill bg (`W/ui/components/Rating.kt:167`) |
| DarkGreen / DarkRed / DarkCyan / DarkPurple | `#114000` / `#400000` / `#21556E` / `#261370` | declared (`:29-32`), usage not traced |
| GoldenYellow | `#DAB440` | version-warning icon (`W/ui/setup/ServerList.kt:~182`) |
| Discover.Blue / Purple / Green / Yellow / Red | rgb(37,99,235) `#2563EB` / rgb(147,51,234) `#9333EA` / rgb(74,222,128) `#4ADE80` / rgb(234,179,8) `#EAB308` / rgb(204,38,38) `#CC2626` | Seerr "Discover" type chips and availability badges (`W/ui/cards/DiscoverItemCard.kt`) |

Other fixed colors:
- Favorite heart: `android.R.color.holo_red_light` = `#FF4444` (Android system value, not in repo) (`ItemCardImage.kt:288`, `BannerCard.kt:179`); in buttons `Color.Red` (`#FF0000`) when favorited (`W/ui/components/PlayButtons.kt:180`).
- Star rating: filled `#FFC700`, empty `#5D4A0A` (`W/ui/components/Rating.kt:75-76`).
- Rotten Tomatoes icons: fresh `#F93208` (`R/drawable/ic_rotten_tomatoes_fresh.xml`), rotten icon in its own colors (`ic_rotten_tomatoes_rotten.xml`); fresh if `rating >= 60` (`Rating.kt:123`).
- Delete button: `Color.Red` at alpha .8 (`#FF0000CC`) (`PlayButtons.kt:437`, `Dialogs.kt:581`).
- Splash/pre-theme: root Android theme `Theme.AppCompat.DayNight.NoActionBar` with `colorBackground=@android:color/background_dark` (`R/values/themes.xml`); loading page before prefs load is `Color.Black` (`W/MainActivity.kt:248`).
- App page background: `W/MainContent.kt:50-56` is a tv `Surface` with `.background(colorScheme.background)`. The tv `Surface` default container is `colorScheme.surface` (LIB DEFAULT `SurfaceDefaults.colors()`, unverified), which is painted over that. `background` and `surface` are equal for PURPLE, GREEN, OLED_BLACK, ORANGE, RED, BROWN and differ slightly for BLUE (`#111318` vs `#121318`) and BOLD_BLUE (`#111318` vs `#0A1017`). Use `surface` as the page color if in doubt.

### 1.7 Theme-conditional rules (OLED vs. rest)

- Nav icon/label colors `navItemColor` (`W/ui/nav/NavDrawer.kt:747-799`): OLED: selected+focused `#000000`; selected, drawer closed `#FFFFFF`@.5; selected, drawer open `#FFFFFF`@.85; focused `#000000`@.5; drawer open `#707070`; else `#505050`@.66. Others: alpha = .85 (drawer open) / .5 (selected & closed) / .2 (else); color = selected&focused: `border` (PURPLE, BLUE, GREEN, ORANGE, RED, BROWN) or `primary` (BOLD_BLUE, OLED); selected: `border`; focused: `LocalContentColor`; else `onSurface`; all `.copy(alpha=...)`.
- Watched badge background (`W/ui/cards/WatchedIcon.kt:39-53`): `border` at alpha 1 for all themes except OLED_BLACK -> `secondaryContainer`. Check icon always white, 0.5dp black ring.
- Slider (`W/ui/components/SliderBar.kt:141-205`): active = `border` (all themes except OLED focused -> `primaryContainer`); inactive: PURPLE = `border`@.25 composited over `surfaceVariant` then alpha .66; BLUE/GREEN/ORANGE/BOLD_BLUE/RED/BROWN = `secondaryContainer`@.66; OLED = `tertiaryContainer` focused else `primaryContainer`.
- Switch (`W/ui/preferences/SwitchPreference.kt:67-93`): PURPLE and BLUE use `SwitchDefaults.colors()` (LIB DEFAULT); others set checked/unchecked thumb = `onPrimary`.

---

## 2. Typography

### 2.1 What the repo defines

- `W/ui/theme/Type.kt:5`: `val AppTypography = Typography()`. **The entire type scale is the androidx.tv.material3 `Typography()` default**, and `androidx.compose.material3.Typography()` default for M3 widgets (`Theme.kt:49`). No custom size/weight/line-height anywhere in the theme.
- No text font in the repo. `R/font/` contains only `fa_solid_900.ttf` (Font Awesome 5/6 Solid, FontAwesome free). All text uses Compose's default system font (Roboto on Android TV; `FontFamily.Default`). For the web: Roboto (or system sans stack).
- Values below are the Material 3 type scale tokens that `Typography()` is built from, **LIB DEFAULT (unverified, from memory; look up `androidx.tv.material3.Typography` / `TypographyTokens`)**:

| style | size sp | line height sp | weight | letter spacing sp |
|---|---|---|---|---|
| displayLarge | 57 | 64 | 400 | -0.25 |
| displayMedium | 45 | 52 | 400 | 0 |
| displaySmall | 36 | 44 | 400 | 0 |
| headlineLarge | 32 | 40 | 400 | 0 |
| headlineMedium | 28 | 36 | 400 | 0 |
| headlineSmall | 24 | 32 | 400 | 0 |
| titleLarge | 22 | 28 | 400 | 0 |
| titleMedium | 16 | 24 | 500 | 0.15 |
| titleSmall | 14 | 20 | 500 | 0.1 |
| bodyLarge | 16 | 24 | 400 | 0.5 |
| bodyMedium | 14 | 20 | 400 | 0.25 |
| bodySmall | 12 | 16 | 400 | 0.4 |
| labelLarge | 14 | 20 | 500 | 0.1 |
| labelMedium | 12 | 16 | 500 | 0.5 |
| labelSmall | 11 | 16 | 500 | 0.5 |

Recommendation: run the real app once or read `TypographyTokens` in the tv-material 1.1.0-alpha01 sources to confirm before shipping; the shape of the scale (M3 baseline) is what the code expects.

### 2.2 How styles are used (repo facts)

| where | style | override | cite |
|---|---|---|---|
| Row title ("Continue Watching") | titleLarge, color onBackground, padding-start 8dp | | `W/ui/cards/ItemRow.kt:130-138` |
| Card title (grid/season/person/discover) | bodyMedium | SemiBold(600), center, 1 line, marquee | `GridCard.kt:109-121`, `SeasonCard.kt:204-215`, `PersonCard.kt:166-177` |
| Card subtitle | bodySmall | Normal(400), center, 1 line | `GridCard.kt:122-133` |
| Banner card title (home with titles) | bodyLarge | SemiBold | `BannerCard.kt:246-257` |
| Banner card subtitle | bodyMedium | Normal | `BannerCard.kt:258-269` |
| Banner fallback name | titleMedium, onSurfaceVariant, center, padding 16dp | | `BannerCard.kt:131-141` |
| Grid card fallback name | fontSize 14sp, onSurfaceVariant, padding 8dp | | `ItemCardImage.kt:168-176` |
| Genre / Studio card name | titleLarge Bold(700), onSurfaceVariant, center, padding 16dp | | `GenreCard.kt:107-117`, `StudioCard.kt:114-124` |
| Corner count pill | bodyMedium, onSurface | pad 4dp | `ItemCardImage.kt:224-230` |
| Banner corner text | bodySmall | | `BannerCard.kt:163-168` |
| Detail/home title (no logo) | headlineMedium, 2 lines | | `W/ui/components/TitleOrLogo.kt:60-70` |
| Home header overview | bodyMedium, onSurface, 2 lines (episode) or 3 | box 400dp wide, height 48dp (+12 if 3 lines) | `W/ui/main/HomePage.kt:608-622` |
| Quick details (year, rating, runtime) | titleSmall, onSurface, 1 line | | `W/ui/components/QuickDetails.kt:40,71` |
| Tagline | bodyLarge italic | | `MovieDetailsHeader.kt:87-92` |
| "Directed by" | bodyMedium onSurface | | `MovieDetailsHeader.kt:122-128` |
| Tab label | fontSize 16sp (style default bodyLarge-ish from LocalTextStyle; size forced), color onSurface (@.5 when not active/selected), padding-h 16dp | | `W/ui/components/TabRow.kt:223-228` |
| Button label | labelLarge ambient (`ProvideTextStyle`); expandable play buttons use titleSmall | | `W/ui/components/Button.kt:101`, `PlayButtons.kt:330,378` |
| Dialog title | titleLarge, onSurface | | `Dialogs.kt:280-285` |
| Confirm dialog title | titleLarge; delete dialog: titleMedium + titleLarge | | `Dialogs.kt:487,540,547` |
| Settings screen title | headlineSmall, center, onSurface | | `PreferencesContent.kt:224-232` |
| Settings group header | titleMedium | | `PreferencesContent.kt:293` |
| Settings item title / summary | titleSmall / bodySmall | | `ComposablePreference.kt:275-281` |
| Nav drawer item | labelMedium via `ProvideTextStyle` | icon 16sp FA | `NavDrawer.kt:~340`, `:709` |
| Clock | bodyLarge, fontSize 18sp | | `W/ui/components/TimeDisplay.kt:23-25` |
| Text field | bodyLarge | | `EditTextBox.kt:145,161,249` |
| Stream chips (video/audio/subs) | TextStyle fontSize 12sp SemiBold(600), onSurface | | `VideoStreamDetails.kt:176-185` |
| Title/value pair | label: labelMedium Normal @alpha .8; value: labelLarge Normal | | `TitleValueText.kt:64-73` |
| Loading row title/message | titleLarge / titleMedium | | `LoadingRow.kt:116-122` |
| Error | title titleMedium error; message titleLarge error; exception titleMedium; "Caused by" titleSmall | | `ErrorMessage.kt:152-185` |
| Chapter card | name bodyMedium SemiBold, time bodySmall Normal | | `ChapterCard.kt:90-104` |
| Discover type chip | bodySmall at fontSize 10sp | | `DiscoverItemCard.kt:166-167` |

### 2.3 FontAwesome icon font

- Declared once: `W/ui/UiConstants.kt:16`: `val FontAwesome = FontFamily(Font(resId = R.font.fa_solid_900))`. File `R/font/fa_solid_900.ttf` (Font Awesome Solid 900).
- Icons are referenced by **codepoint strings** in `R/values/fa_strings.xml:6-64` (`<string name="fa_heart">&#xf004;</string>` etc.), then rendered as `Text(text = stringResource(R.string.fa_x), fontFamily = FontAwesome, fontSize = N.sp)`. Translatable = false.
- Full map (name -> codepoint): tag f02b, user f007, location_dot f3c5, film f008, circle_play f144, image f03e, images f302, rotate_right f2f9, rotate_left f2ea, arrows_rotate f021, arrow_right_arrow_left f0ec (also arrow_left_arrow_right, same code), magnifying_glass_plus f00e, magnifying_glass_minus f010, caret_up f0d8, caret_down f0d7, caret_left f0d9, caret_right f0da, heart f004, video f03d, play f04b, pause f04c, arrow_down_long f175, arrow_up_long f176, arrow_left_long f177, arrow_right_long f178, angle_up f106, angles_up f102, angle_down f107, angles_down f103, house f015, closed_captioning f20a, tv f26c, music f001, eye f06e, eye_slash f070, shuffle f074, open_folder f07c, list_ul f0ca, file_video f1c8, volume_low f027, volume_high f028, ellipsis f141, ellipsis_vertical f142, filter f0b0, sliders f1de, microphone f130, download f019, clock f017, bell f0f3, check f00c, cloud_arrow_up f0ee, cloud_arrow_down f0ed, compass f14e, repeat f363, compact_disc f51f, xmark f00d, dice f522, circle_xmark f057. (Web: use the same TTF via `@font-face` or `@fortawesome/fontawesome-free` solid; these codepoints are FA 6 solid.)
- Typical sizes: heart badge 20sp on grid cards (`ItemCardImage.kt:286`), 16sp on banner cards (`BannerCard.kt:181`); expandable buttons 16sp inside a 32dp box (`PlayButtons.kt:366-373`); nav drawer 16sp (`NavDrawer.kt:709`); person fallback `fa_user` 64sp (`PersonCard.kt:145-148`); discover badges 10sp (`DiscoverItemCard.kt:228`).
- Nav drawer icon per library type (`NavDrawer.kt:~655-684`): Favorites=heart, More=ellipsis, Discover=magnifying_glass_plus, movies=film, tvshows=tv, homevideos=video, livetv=drawable `gf_dvr` (vector, not FA), music=music, boxsets=open_folder, playlists=list_ul, default=film. Home / Search / Settings use Material icons (`Icons.Default.Settings`, `NavDrawer.kt:~520`).
- Also uses Material Icons (androidx.compose.material.icons): `Check` (watched), `Star` (rating), `ArrowForward` (view more), `Search`, `Settings`, `Warning`, `ArrowDropDown`, `KeyboardArrowLeft`. Web: any equivalent (Material Symbols) is acceptable.

---

## 3. Shapes, focus treatment, motion

### 3.1 What is in the repo

- No custom `Shapes`. `MaterialTheme(colorScheme, typography, content)` only (`Theme.kt:51-55`), so shapes are the tv-material3 `Shapes()` LIB DEFAULT (believed: extraSmall 4dp, small 8dp, medium 12dp, large 16dp, extraLarge 28dp; unverified).
- Explicit corner radii found:

| element | radius | cite |
|---|---|---|
| Image cards (GridCard, SeasonCard, BannerCard, ViewMore, Chapter, Discover) | LIB DEFAULT `CardDefaults.shape()` (believed `shapes.medium` = 12dp) | cards use `Card(...)` with no `shape=` |
| Person card | circle (image `clip(CircleShape)` + `CardDefaults.shape(CircleShape)`) | `PersonCard.kt:107,162` |
| Genre / Studio card image | 8dp inner clip | `GenreCard.kt:81`, `StudioCard.kt:85` |
| Buttons (custom `Button`) | `CircleShape` (pill/circle) | `Button.kt:51-54` |
| Corner count pills | `RoundedCornerShape(25)` = 25% of height (percent, not dp) | `ItemCardImage.kt:221,254` |
| Star-rating pill | 16dp | `Rating.kt:176,231` |
| Dialog (`DialogPopup`) | 28dp | `Dialogs.kt:257,260` |
| Scrollable dialog / BasicDialog | 8dp | `Dialogs.kt:391,394,430,433` |
| Switch-with-label row | 20dp | `SwitchWithLabel.kt:42` |
| Text field single line | `CircleShape` (pill); multiline 8dp | `EditTextBox.kt:119,286` |
| Overview text focus box | 8dp | `OverviewText.kt:50` |
| Stream chip | 4dp | `VideoStreamDetails.kt:176` |
| Title/value focus bg | 4dp | `TitleValueText.kt:107` |
| FocusableItemRow bg | 8dp | `FocusableItemRow.kt:72` |
| Watched badge | circle, 24dp, 0.5dp black ring, 2dp pad | `WatchedIcon.kt:22-37`, used `ItemCardImage.kt:246` |
| Discover availability badge | circle 16dp, 0.5dp border | `DiscoverItemCard.kt:211-310` |
| Server/user chooser circle | circle, `Cards.serverUserCircle` = 129dp (172*.75) | `UiConstants.kt:100`, `ServerList.kt:115,135` |

### 3.2 Focus treatment per component (TV focus = hover/keyboard-focus on web)

| component | focus look | source |
|---|---|---|
| All image Cards (poster, wide, season, episode, view-more, genre, studio, chapter, discover) | LIB DEFAULT `CardDefaults.scale()` -> focused scale 1.1 (unverified); LIB DEFAULT `CardDefaults.border()` -> 3dp ring in `colorScheme.border` (unverified; PersonCard sets exactly this explicitly, which supports it); no glow (`CardDefaults.glow()` = none). Card container default `surfaceVariant` unless overridden with `Color.Transparent` (grid, season, person, genre, studio, discover cards override to Transparent; BannerCard and ChapterCard do not). | `PersonCard.kt:108-119` (explicit), other cards rely on defaults |
| Person card | 3dp ring `colorScheme.border`, circle shaped, + default scale | `PersonCard.kt:108-119` |
| Server / user circles (login) | focused scale **1.2**, 3dp ring `onSurface`, container color of the id-derived color at alpha .5->.7 (current server .7->.9) | `ServerList.kt:136-164`, `UserList.kt:216-244` |
| Custom `Button` (play, favorite, sort, etc.) | container `surfaceVariant`@.8, content `onSurface`@.8. Focused/pressed: container `onSurface`, content `inverseOnSurface` (color inversion). Disabled: @.4. No border (except focused-disabled 1.5dp ring `onSurfaceVariant`@.2). Scale/glow = LIB DEFAULT `ClickableSurfaceDefaults.scale()/glow()` (focused 1.1, no glow; unverified). Min size 40dp, padding 4dp, `labelLarge`. | `Button.kt:44-113, 172-178`, `PlayButtons.kt:229` |
| Expandable play / fa buttons | icon only (28dp icon in 40dp-high pill); on focus `AnimatedVisibility` reveals the label (`titleSmall`) to the right; default enter = fade+expandHorizontally (LIB DEFAULT) | `PlayButtons.kt:292-337,341-386` |
| TextButton | same as Button, height 32dp, padding 8/4dp | `Button.kt:115-141` |
| Nav drawer item | focus uses ListItem colors (LIB DEFAULT `NavigationDrawerItemDefaults.colors()`), scale forced to 1 (`ListItemDefaults.scale(1f,1f)`), item width animates 64dp -> 224dp | `NavigationDrawerAndroid.kt:136-211` |
| Grid card focused title | title text slides: gap between image and title animates 12dp -> 4dp (to make room for scaled card); marquee scroll after 500ms focus | `SlidingCardText.kt`, `SeasonCard.kt:114-146` |
| Tab | text full color when row has focus or tab selected; underline bar: selected = `onSurface` 2dp at 25% of tab width; focused (row active) = `border` full tab width (width animated `animateDpAsState`, LIB DEFAULT spring) | `TabRow.kt:240-265` |
| Settings / dialog list items | LIB DEFAULT `ListItem` focus colors; `ListItemDefaults.scale()` default (focused 1.1, unverified). In collection lists: scale override focused 1.0, pressed .95 | `Dialogs.kt:~310`, `CollectionFolderList.kt:623`, `ListItemWrapper.kt:35-40` |
| Dropdown menu item | focused: bg `inverseSurface`, text `inverseOnSurface`; unfocused bg `surfaceColorAtElevation(3dp)`, text `onSurface` | `TvDropdownMenuItem.kt:33-45` |
| Switch-with-label | focused row bg `onSurface`, label `surfaceVariant`; unfocused bg `surfaceVariant`@.8, label `onSurfaceVariant` | `SwitchWithLabel.kt:43-64` |
| Text field | container `surfaceVariant`@.6 unfocused, @.8 focused, @.25 disabled; error `errorContainer`@.75; text `onSurfaceVariant` (error `onErrorContainer`); 40dp high (`:220`), padding 8x10dp (legacy variant: `focusedIndicatorLineThickness = 4dp`, unfocused 0, `:305-306`) | `EditTextBox.kt:71-81,226-310` |
| Row title container (FocusableItemRow placeholder) | bg animates Transparent -> `border`@.25, 8dp radius, 8dp padding | `FocusableItemRow.kt:59-73` |
| Overview text | focused bg `onPrimary`@.4, 8dp radius | `OverviewText.kt:41-50` |
| Title/value (clickable) | focused bg `onPrimary`@.75, 4dp radius, `scale(1.1f)` | `TitleValueText.kt:96-108` |
| Star rating | focused star gets `border` bg with 16dp radius; whole pill bg `#000000BF` | `Rating.kt:222-232` |
| Slider | indicator height 6dp -> 12dp when focused (`animateDpAsState` LIB DEFAULT spring), round caps, white thumb circle | `SliderBar.kt:46-47,105-115` |

### 3.3 Motion (explicit values in the repo)

| what | spec | cite |
|---|---|---|
| Backdrop image crossfade | 800ms (`CrossFadeFactory`, Coil `CrossfadeTransition`, always fades even from memory cache); easing = Coil default | `Backdrop.kt:53,78,161`, `CrossFadeFactory.kt` |
| Dynamic backdrop color blobs | `tween(1250)` per color, default easing (FastOutSlowIn) | `Backdrop.kt:85-98` |
| Backdrop color extraction delay | `delay(500)` before extracting/updating | `BackdropService.kt:104` |
| Title slide under cards | `animateDpAsState` 12dp <-> 4dp, LIB DEFAULT spring | `SlidingCardText.kt:27-31` |
| Marquee | starts after 500ms of focus (`rememberFocusedAfterDelay`, 1000ms for person card), then `basicMarquee(initialDelayMillis=250, velocity=40.dp/s)` | `SeasonCard.kt:236-249`, `PersonCard.kt:80`, `Extensions.kt:192-201` |
| Grid card "focusedAfterDelay" | 500ms | `GridCard.kt:57` |
| Nav drawer open/close | content offset `spring(stiffness = Spring.StiffnessMedium)` (~1500, damping ratio default .. LIB DEFAULT); item width via default `animateDpAsState` spring; `animateContentSize(spring(StiffnessMedium))` | `NavDrawer.kt:314-330`, `NavigationDrawerAndroid.kt:107-112,140,157-165` |
| Tab content swap (`KeyedTabbedPage`) | `fadeIn(tween(300, delay 100))` together with `fadeOut(tween(200))` | `TabbedPage.kt:226-231` |
| Tab strip show/hide | `expandVertically` / `shrinkVertically` (LIB DEFAULT) | `TabbedPage.kt:166-171` |
| Settings panel | `fadeIn() + slideInHorizontally { it / 2 }` / reverse out (LIB DEFAULT specs) | `PreferencesContent.kt:213-216` |
| Screensaver item swap | fadeIn tween(500, delay 100) / fadeOut tween(500, delay 100); screen fade in 1000ms, out 500ms | `AppScreensaver.kt:281-286`, `ScreensaverService.kt:299-300` |
| Series overview dimming | `animateFloatAsState` to .4 (page focused but card row not) else 1 | `SeriesOverviewContent.kt:118` |
| Play button delete color | `animateColorAsState` with tween (value not traced) | `PlayButtons.kt:434-446` |
| Home/page navigation | `NavDisplay` (androidx.navigation3) without custom `transitionSpec`/`popTransitionSpec` anywhere in repo -> **LIB DEFAULT** nav3 transition (believed a cross fade; unverified). Detail pages are not shared-element animated except Collection details (`CollectionDetails.kt:317-367`: slide vertical half-height + fade). | `ApplicationContent.kt:69-104`, `MainContent.kt:62` |
| Focus scale animation (cards/buttons) | not set in repo; LIB DEFAULT inside tv-material `Surface`/`Card` | look up `ClickableSurfaceScale`/`animateFloatAsState` in tv-material `Surface.kt`. Do not invent; a visually safe web approximation is ~150-200ms ease-out, flagged as a guess. |
| Scroll behavior | Home: custom `ScrollToTopBringIntoViewSpec(spaceAbovePx = 50dp)` so the focused row snaps near the top below the header | `HomePage.kt:362-375`, `W/ui/util/ScrollToTopBringIntoViewSpec.kt` |

---

## 4. Card catalog (`W/ui/cards/*`)

Shared constants (`W/ui/UiConstants.kt:93-119`): `Cards.HEIGHT_2X3_DP = 172` (poster height), `HEIGHT_EPISODE = 128`, `HEIGHT_LIVE_TV = 96`, `playedPercentHeight = 6dp`, `serverUserCircle = 172*.75 = 129dp`. Aspect ratios: WIDE 16/9, FOUR_THREE 4/3, TALL 2/3, SQUARE 1; `MIN = TALL` (ratios below 2/3 are clamped to 2/3, `.coerceAtLeast(AspectRatios.MIN)`). Poster width = 172 x 2/3 = 114.67dp. Wide at 128 high = 227.6dp; wide at 96 high = 170.7dp.

Common image behavior (`ItemCardImage.kt`): Coil `AsyncImage`; on null URL or load error shows a fallback: box in `surfaceVariant` filling the card; if `useFallbackText` and a name: name in `onSurfaceVariant` 14sp centered with 8dp padding; else the `video_solid` vector icon tinted `onSurfaceVariant` at 40% of the card (`fillMaxSize(.4f)`) centered (`ItemCardImage.kt:154-195`). Image URL is requested at the pixel size of the layout (`fillWidth`/`fillHeight`), image type default PRIMARY.

Overlay layout (`ItemCardImageOverlay`, `ItemCardImage.kt:197-281`), 4dp inset from card edges:
- Top-start row (gap 4dp): "versions" pill if `mediaSourceCount > 1` (number, bodyMedium, `onSurface`, bg `#00000080`, radius 25%, pad 4dp), then favorite heart (FA `fa_heart`, 20sp, `#FF4444`).
- Top-end row (gap 4dp): watched badge (24dp circle, see 1.7) when `played` and (`playedPercentage` null or 0 or >=100); then unplayed-count pill (same pill style) when `unplayedItemCount > 0`.
- Bottom-start: progress bar, height 6dp, color `tertiary`, width = playedPercentage% of card, only when 0 < pct < 100, no track drawn.

| card | file | size | aspect / image | overlay | text | focus / notes |
|---|---|---|---|---|---|---|
| **GridCard** (library grids, search, favorites, collections) | `GridCard.kt:40-137` | width = (gridWidth - gap*(cols-1))/cols, computed in px (`CardGrid.kt:330-345`); height from aspect | param `imageAspectRatio` default TALL (clamped >= 2/3); image type PRIMARY or THUMB (`ViewOptionImageType`); scale FillBounds (poster/square), Crop (wide), default Fit | full overlay always on (`showOverlay = true`, `:90`); bg `surfaceVariant` behind image | title bodyMedium SemiBold center 1 line; subtitle bodySmall; 4dp gap to image; slides 12->4dp on focus | container Transparent; marquee after 500ms |
| Grid presets (`CollectionFolderGridParameters`) | `CollectionFolderGrid.kt:123-185` | POSTER: 6 cols, gap 16dp, TALL, FillBounds. WIDE: 4 cols, gap 24dp, WIDE, Crop. SQUARE: 6 cols, gap 16dp, SQUARE, FillBounds. Default struct: 6 cols, 16dp. Grid vertical contentPadding 16dp (`CardGrid.kt:324`). User can change columns (ViewOptionsDialog, default 6, 4 for wide/genre/studio grids, `ViewOptionsDialog.kt:324-337`) | | | | |
| **SeasonCard** (generic poster; rows: seasons, similar, cast filmography, search, queue, loading placeholder) | `SeasonCard.kt:43-230` | height given (`Cards.height2x3` = 172dp typical), width = height x aspect (aspect = item's own ratio else TALL, clamped >= 2/3); image PRIMARY only | overlay only when `showImageOverlay` (detail rows pass true; default false) | title bodyMedium SemiBold, subtitle bodySmall, centered, 1 line, 4dp horizontal pad, sliding 12->4dp | container Transparent |
| **BannerCard** (home rows, episodes, thumbs) | `BannerCard.kt:56-199` | `cardHeight` (default 120dp; home rows use `viewOptions.heightDp`, default 172) x `aspectRatio` (default WIDE; home default TALL) | image PRIMARY default, THUMB selectable; `useSeriesForPrimary` (episodes show series poster) ; scale default FillBounds | played badge (24dp), `cornerText` pill (episode unplayed count, bodySmall), favorite heart 16sp at top-start with 8dp pad, progress bar 6dp `tertiary` | fallback: `name` titleMedium centered, `onSurfaceVariant` | default Card container (`surfaceVariant`) |
| **BannerCardWithTitle** | `BannerCard.kt:201-272` | column width = cardHeight x clamped aspect | same | same | title bodyLarge SemiBold, subtitle bodyMedium; 4dp gap; sliding text; used when row `showTitles` is true (default **false**, `HomeRowConfig.kt:256`) | |
| **PersonCard** | `PersonCard.kt:52-194`, width const `personRowCardWidth = 108dp` (`PersonRow.kt:129`) | square 1:1, circle-clipped, ContentScale.Crop | none (overlay disabled) | name bodyMedium SemiBold; role bodySmall Normal; fallback = FA `fa_user` 64sp on `surfaceVariant` | 3dp ring `border`, 1000ms before marquee |
| **GenreCard** | `GenreCard.kt:55-121` | row height `viewOptions.heightDp` (genre default 128dp, WIDE) -> ~227dp wide; in grids 4 columns | 16:9, image `FillBounds` at alpha .75 (backdrop-type image from `imageUrlOverride`) clipped 8dp | tinted overlay `rememberIdColor(genreId)` at alpha .6 covering the whole card; name titleLarge Bold center `onSurfaceVariant` | Transparent container |
| **StudioCard** | `StudioCard.kt:58-129` | same geometry as Genre | image at alpha .75; if no image or error: tint color alpha **.4** + name | | |
| **ViewMoreCard** ("View more" end-of-row) | `ViewMoreCard.kt:46-126` | default size 172 high x 2/3 aspect; home passes row height and ratio | none | `ArrowForward` icon at 66% of card, `onSurface`; label "View more" bodyMedium SemiBold below (if titles shown) | container `surfaceColorAtElevation(1dp)` |
| **ChapterCard** | `ChapterCard.kt:41-109` | height 120dp default, width from intrinsic image width (WIDE x height until loaded), image CHAPTER type, ContentScale.Fit | bottom label bar bg `#00000080`, 4dp pad | chapter name bodyMedium SemiBold; time bodySmall | default Card container |
| **DiscoverItemCard** (Seerr) | `DiscoverItemCard.kt:52-208` | width = 172x2/3 = 114.7dp default, TALL, FillBounds | availability badge top-end (16dp circle: pending = yellow bell on white@.85; available = green@.85 + white check; partial = green@.85 + white 10x2dp bar; blocklisted unused); type chip top-start (Movie blue / TV purple / Person green @.8 alpha, circle shape, bodySmall 10sp, pad 4dp) | title bodyMedium SemiBold; subtitle bodySmall = release year | |
| Server/User circle cards | `W/ui/setup/ServerList.kt:100-250`, `UserList.kt:196-410` | 129dp circle, name titleLarge Bold; second variant (`ServerList.kt:255`) 172*.75 | id-hash color via `rememberIdColor` (`ServerList.kt:56-96`: hue = hash%360, sat .6-1.0, value .4-.7; deterministic, can't be reproduced exactly without the JVM `UUID.hashCode`) | | scale 1.2 on focus |
| Row layout (`ItemRow`) | `ItemRow.kt:44-135` | LazyRow, item gap = `viewOptions.spacing` (default 16dp), content padding horizontal 16dp (= gap) and vertical 8dp; title above at 8dp gap | | | |
| PersonRow | `PersonRow.kt:42-103` | gap 16dp, content padding 8dp, title padding-start 8dp (16dp in the second variant) | | | |
| ChapterRow | `ChapterRow.kt:29-41` | gap 16dp, padding v8 h16 | | | |

Placeholder behavior while loading: `LoadingRow` (`W/ui/components/LoadingRow.kt`) shows row title (`titleLarge`) and message (`titleMedium`, error color on failure) with 32dp bottom padding; null items render the `SeasonCard`/`GridCard` with a `surfaceVariant` fallback box (video icon). A page-level spinner is `CircularProgress` in `border` color: 40dp at top-end with 20dp padding (40dp if clock shown) (`HomePage.kt:524-535`); full page `LoadingPage` 48dp (`CircularProgress.kt:58-63`; the delayed version waits 300ms, `:75`).

---

## 5. Page-level spacing and layout

- **Nav drawer**: collapsed width 64dp, expanded 224dp, icon 24dp, icon padding derived from `ListItemDefaults.IconSize` (LIB DEFAULT, believed 36dp -> 6dp each side) (`NavigationDrawerAndroid.kt:136-140`). Item height = `NavigationDrawerItemDefaults.ContainerHeightOneLine / TwoLine` (LIB DEFAULT). Items spaced 4dp (`NavDrawer.kt:335`). Page content is offset by `64dp + 8dp` on the left and 16dp on the right (`NavDrawer.kt:558`); when the drawer opens the content is pushed right by (224-64)dp using a spring (`NavDrawer.kt:314-330`), while the backdrop darkens (see 6).
- **Header block** (`W/ui/components/HeaderUtils.kt`): top padding 48dp, bottom 32dp, start 8dp, fixed height 180dp, logo max height 60dp (and logo max width 320dp, `TitleOrLogo.kt:48-52`). Home header: title/logo block `fillMaxWidth(.75)`, details column `fillMaxWidth(.6)`, 8dp gap; overview 400dp wide x 48dp (60dp for 3 lines) (`HomePage.kt:598-622`).
- **Home page**: header on top, then a vertical list of `ItemRow`s with 0 gap between rows, each row has `bottom padding 8dp`; list bottom padding 172dp (= `Cards.height2x3`); focused row aligns to top with 50dp reserved for the title (`HomePage.kt:352-376`).
- **Detail pages (movie)**: sections spaced 16dp; header top padding = `HeaderUtils.topPadding` (48dp), bottom 16dp; text blocks use `startPadding` 8dp; header text column width .6 of page, title .75 (`MovieDetails.kt:324-345`, `MovieDetailsHeader.kt:49-91`).
- **Tabbed pages** (library home, e.g. Movies/TV): tab row padding top 16dp, bottom 16dp, end 184dp when the clock is shown (so tabs don't run under it) else 0 (`TabbedPage.kt:156-176`).
- **Clock** (`TimeDisplay.kt:20-30`): top-end, padding vertical 16dp, horizontal 24dp, bodyLarge 18sp.
- **Settings**: right-aligned panel `fillMaxWidth(.4f)`, full height, bg `surfaceColorAtElevation(1dp)`, title headlineSmall centered with 8dp vertical pad, list contentPadding 16dp (`PreferencesContent.kt:213-240,821`); slides in from the right.
- **Dialogs**: `DialogPopup` 28dp radius, padding 24dp, title->list gap 8dp, bg `surfaceColorAtElevation(1dp)` (3dp for context menus); `ScrollableDialog` 600dp wide, max 380dp tall, content padding 16dp, item gap 8dp, 8dp radius, elevation 8dp shadow, bg `surfaceColorAtElevation(3dp)` (`Dialogs.kt:205-415`). Confirm dialogs: content padding 16dp, gap 8dp; delete confirm buttons gap 32dp, button width 72dp (`Dialogs.kt:479-580`). Default dialog width = Android `Dialog` default platform width (`DialogProperties()`), not specified in repo.
- **Common gaps**: 4dp (tight text stacks, button padding), 8dp (row title->row, dialogs), 16dp (card gaps, content padding, page sections), 24dp (wide grids, circle-card label gap), 32dp (bottom padding on row placeholders).
- **Pagination of grids**: jump buttons on side (`CardGrid.kt:300-310`); not specified visually here.

---

## 6. Backdrop system

Files: `W/ui/nav/Backdrop.kt`, `W/ui/nav/ApplicationContent.kt:27-29,57-67`, `W/services/BackdropService.kt`.

Where it sits: `ApplicationContent` stacks `Backdrop(...)` (full-screen, behind) and the `NavDisplay` pages on top, so the backdrop persists across non-fullscreen pages and is simply swapped/cleared (`ApplicationContent.kt:57-104`). Full-screen destinations (`key.fullScreen`, e.g. playback) render without the nav drawer; backdrop is still behind but pages draw their own background.

State: `BackdropService.backdropFlow: StateFlow<BackdropResult(itemId, imageUrl, primaryColor, secondaryColor, tertiaryColor)>`. Pages call `submit(item)` when focus changes (`HomePage.kt:344-346`, `updateBackdrop` in collection/recommended views); image = Jellyfin item `BACKDROP` image (genre items use their override URL). `submit` first nulls the imageUrl then, after a **500ms delay**, sets the new URL plus extracted colors (`BackdropService.kt:76-132`). `clearBackdrop()` resets to NONE when entering pages with no backdrop (tabs, favorites, person pages).

Style preference `BackdropStyle` (`proto:169-173`): `BACKDROP_DYNAMIC_COLOR` = 0 (**default**, `AppPreference.kt:864-872`), `BACKDROP_IMAGE_ONLY` = 1, `BACKDROP_NONE` = 2.

Layers, bottom to top:
1. Page color `colorScheme.surface/background` from `MainContent.kt:50-56`.
2. **Dynamic color wash** (only when style is DYNAMIC_COLOR and colors exist): full-screen box that first draws `background`, then four radial gradients, each `radius = 0.8 x screen width`, from the color to Transparent (`Backdrop.kt:100-148`):
   - top-left (x = 0, y = 0): `secondary` extracted color
   - bottom-right (x = W, y = H): `primary` extracted color
   - bottom-left (0, H): theme `background` color -> transparent ("bridge")
   - top-right (W, 0): `tertiary` extracted color
   (mirrored horizontally for RTL). Drawn in that order, normal blending (SrcOver). Each color is animated with `tween(1250)`.
3. **Backdrop image** (when style != NONE): box `fillMaxSize`, image placed at the **top-end corner, width 70% x height 70% of the screen**, `ContentScale.Fit`, `alignment = TopEnd` (`Backdrop.kt:152-171`). Coil crossfade **800ms** (`CrossFadeFactory`). Offscreen layer with masks applied in this order in `drawWithContent` (`:172-213`):
   a. if nav drawer is open: black overlay at alpha **.75** over the image (`:175-180`)
   b. top scrim (if `enableTopScrim`, default true): vertical gradient from `Black` alpha **0.55** at 0% to transparent at **25%** of the image height, blend mode **Multiply** (`ApplicationContent.kt:28-29`)
   c. horizontal mask: gradient Transparent -> Black from x = 0 to x = 60% of the image width, blend **DstIn** (image fades in from its left edge, fully visible by 60% width)
   d. vertical mask: gradient Black -> Transparent from top to bottom of the image, blend **DstIn** (image fades out toward the bottom)
   CSS equivalent: a `position:absolute; top:0; right:0; width:70vw; height:70vh` element with `object-fit: contain; object-position: top right` and `mask-image: linear-gradient(to right, transparent 0%, black 60%), linear-gradient(to bottom, black, transparent)` with `mask-composite: intersect`, plus `linear-gradient(rgba(0,0,0,.55), transparent 25%)` multiplied (use `mix-blend-mode: multiply` on an overlay). Overlay of rgba(0,0,0,.75) when nav is expanded.
4. Screensaver also reuses TOP_SCRIM (`AppScreensaver.kt:237-241`) and a radial vignette (`:216-226`: radial gradient Transparent -> `#00000040`, center of screen, radius = max(w,h)/1.5, stops 0 and .85, Multiply).

Dynamic colors (Android `androidx.palette:palette-ktx:1.1.0`, `libs.versions.toml:45,149`; `BackdropService.kt:134-237`):
- The backdrop image is downloaded as ARGB_8888 and passed to `Palette.from(bitmap).generate()` (Palette library defaults: up to 16 colors, bitmap downsampled to ~112x112 px area; LIB DEFAULT). Results cached in an LRU of 50 URLs (`:49`).
- Primary (bottom-right) = `darkVibrant ?: darkMuted` swatch RGB at **alpha .4**.
- Secondary (top-left) = first of: `vibrant` if "cool", `muted` if cool, `vibrant`, `muted`; at alpha **.4**. "Cool" test: `b > r && (b + g) > r * 1.5` on the swatch RGB (`:174-180`).
- Tertiary (top-right) = `vibrant ?: lightVibrant` at alpha **.35**.
- Missing swatch -> Transparent. For the web use `node-vibrant` (same algorithm family) or `colorthief` and replicate the rules above.

Dynamic backdrop on the web, as CSS (first listed layer is topmost, so the order is the reverse of Compose draw order TL, BR, BL, TR): `background: radial-gradient(circle 80vw at 100% 0, rgba(ter,.35), transparent), radial-gradient(circle 80vw at 0 100%, <bg>, transparent), radial-gradient(circle 80vw at 100% 100%, rgba(pri,.4), transparent), radial-gradient(circle 80vw at 0 0, rgba(sec,.4), transparent), <bg>`. Animate the three extracted colors with a 1250ms transition using registered `@property` color custom properties. (Radius is 0.8 x the screen WIDTH for all four, even the bottom ones.)

---

## 7. Building blocks (look + states)

- **Button** (`Button.kt`, `PlayButtons.kt`): pill (`CircleShape`), min height 40dp (`MinButtonSize`, `PlayButtons.kt:229`), padding 4dp; default: bg `surfaceVariant`@.8, content `onSurface`@.8; focused and pressed: bg `onSurface`, content `inverseOnSurface`; disabled bg `surfaceVariant`@.4, content `onSurface`@.4; focused-disabled 1.5dp ring `onSurfaceVariant`@.2; label `labelLarge`; scale/glow LIB DEFAULT. Icon-only until focused; icons 28dp (Material) or FA 16sp in a 32dp box; the label appears via `AnimatedVisibility` with `titleSmall` and 4dp end padding (+8dp spacer for painter icons). Favorite icon red when favorited. Delete button bg `Color.Red`@.8 when focused-confirmed (`PlayButtons.kt:425-460`).
- **TextButton**: same, 32dp high, padding 8dp/4dp.
- **Chips / stream labels** (`StreamLabel`, `VideoStreamDetails.kt:166-215`): bg `secondaryContainer`@.5, 4dp radius, padding 4dp v / 6dp h, 12sp SemiBold `onSurface`, FA icon + text, gap 2dp, max width 160dp (subtitle). Row gap 4dp.
- **Quick details** (year, official rating, community rating w/ star, critic rating w/ tomato): `titleSmall`, `onSurface`; star `#FFC700`; tomato icon at 0.8 x font size (`Rating.kt:119-153`); `SimpleStarRating`: number "%.1f" + star at font-size height, gap 2dp. `TomatoRating`: "NN%" + icon, fresh if >= 60.
- **Star-rating input** (`StarRating`, `Rating.kt:159-304`): 5 stars in a pill (16dp radius, bg `#000000BF`), padding 4dp; unfilled portion painted with the bg color over the stars (percentage mask); focused star gets a `border` rounded square (16dp). Precision FULL/HALF.
- **Tab row** (`TabRow.kt`): see 3.2; text 16sp, h-padding 16dp, 4dp gap between text and 2dp underline; active-selected tab underline = 25% of tab width.
- **Dialogs**: see section 5. List rows are tv `ListItem`s (headline / overline / supporting / leading / trailing content), enabled state disabled for 1000ms after open to swallow the long-press (`Dialogs.kt:218-226`). Divider = `HorizontalDivider` in a 16dp-high slot.
- **Context menu / dropdown** (`ContextMenu.kt`, `TvDropdownMenuItem.kt`): built from `DialogPopup` with elevation 3dp; items have FA leading icons (tinted `iconColor` e.g. red for destructive/favorite).
- **Text field** (`EditTextBox.kt`): see 3.2; pill shape, search variant has `Icons.Default.Search` tinted `onPrimaryContainer`; password uses secure field.
- **Switch row** (`SwitchWithLabel.kt`): see 3.2; Switch from tv-material3 with theme-specific thumb colors (1.7).
- **Slider** (`SliderBar.kt`): track 6dp (12dp when focused), round caps, thumb white circle, theme-dependent colors (1.7); vertical gap 16dp when a label is shown.
- **Loading and error**: `CircularProgress`/`CircularProgressIndicator` colored `colorScheme.border`, indicator style LIB DEFAULT (tv-material3 `CircularProgressIndicator`: 4dp stroke typical; unverified), 48dp on pages, 40dp in the corner. `ErrorMessage` (`ErrorMessage.kt:141-189`): column gap 16dp, padding 16dp, all text in `colorScheme.error`, a TextButton "Send app logs". Row-level error: title + message in `error` color (`LoadingRow.kt:60-70`).
- **Overview text** (`OverviewText.kt`): clickable text, bodyMedium, fixed height (maxLines x 20dp) or unspecified, padding 8dp, focus bg `onPrimary`@.4.
- **Genre text, Title/Value text**: see 2.2/3.2.
- **Search field / voice search**: `VoiceSearchButton.kt` uses circular `ButtonDefaults.shape(RoundedCornerShape(50))`; animation constants named `SOUND_LEVEL_ANIM_MS`, `BASE_PULSE_ANIM_MS`, `RIPPLE_ANIM_MS`, `DOTS_ANIM_MS` (`:252-290`; values not traced; Android-specific feature, skip on web).
- **Playback controls** and **subtitles style** pages exist (`W/ui/playback/overlay/*`, `W/ui/preferences/subtitle/*`) and are not covered here beyond their icon drawables; a separate spec is needed for the player.

---

## 8. Drawables and mipmaps

All in `R/`. `V` = Android vector XML (convertible to SVG: `<vector>` -> `<svg viewBox>`, `android:pathData` -> `d`, `android:fillColor` -> `fill`). `tint` handled at use site.

| file | what | format | size / viewport | used by |
|---|---|---|---|---|
| `drawable/video_solid.xml` | FA "video" glyph; placeholder when a card has no image | V, black fill `#FF000000`, tinted `onSurfaceVariant` | 512dp, viewport 576x512 | `ItemCardImage.kt:180` |
| `drawable/baseline_play_arrow_24.xml` | Material play | V, 24dp, viewport 24 | | PlaybackControls, slideshow, ThemePreview |
| `drawable/baseline_pause_24.xml` | Material pause | V 24 | | player, slideshow, play button |
| `drawable/baseline_stop_24.xml` | Material stop | V 24 | | NowPlayingButtons |
| `drawable/baseline_skip_next_24.xml` / `skip_previous_24` | Material | V 24 | | PlaybackControls |
| `drawable/baseline_fast_forward_24.xml` / `fast_rewind_24` | Material | V 24 | | PlaybackControls |
| `drawable/baseline_undo_24.xml` | Material undo | V 24, tint #FFFFFF | | (not traced) |
| `drawable/baseline_more_vert_96.xml` | Material more_vert | V 96dp, viewport 24 | | (not traced) |
| `drawable/vector_settings.xml` | settings gear | V 32dp, viewport 24 | | player/now-playing settings button |
| `drawable/captions_svgrepo_com.xml` | closed captions icon (SVG Repo) | V 200dp, viewport 24, fill #000000 | | PlaybackControls:372 |
| `drawable/circular_arrow_right.xml` | skip indicator arrow | V 800dp, viewport 75.695 | | SkipIndicator.kt:60 |
| `drawable/gf_dvr.xml` | Google "dvr" icon, Live TV nav item | V 64dp, viewport 960, fill #5F6368 | | NavDrawer.kt:684 |
| `drawable/ic_rotten_tomatoes_fresh.xml` | RT fresh tomato, fill #F93208 | V 138.75x141.25 | | Rating, QuickDetails |
| `drawable/ic_rotten_tomatoes_rotten.xml` | RT rotten splat | V 145x140 (multi-color) | | Rating, QuickDetails |
| `mipmap-anydpi-v26/ic_launcher.xml`, `ic_launcher_round.xml` | adaptive launcher icon: bg `#101010` (`R/values/ic_launcher_background.xml`) + `mipmap/ic_launcher_foreground` | adaptive XML | | manifest icon |
| `mipmap-anydpi-v26/ic_banner.xml` | TV banner: bg `#000B25` (`R/values/ic_banner_background.xml`) + `ic_banner_foreground` inset 18% | adaptive XML | | manifest `android:banner` |
| `mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher*.webp` | **app logo**: launcher (full), foreground (transparent layer), round | raster WebP, up to xxxhdpi (largest `ic_launcher_foreground.webp` 21 KB) | | |
| `mipmap-xhdpi/ic_banner.png`, `ic_banner_foreground.png` | TV home-screen banner / its foreground (logo art) | PNG (18 KB) | | |
| `mipmap-hdpi/eclipse.jpeg` | sample image (eclipse photo, 386 KB) used to preview subtitle style | JPEG | | `SubtitleStylePage.kt:99` |

Best candidates for the web app logo: `mipmap-xxxhdpi/ic_launcher_foreground.webp` (on `#101010`) and `mipmap-xhdpi/ic_banner_foreground.png` (on `#000B25`). No standalone SVG logo exists in the repo. Font Awesome supplies all other glyphs (section 2.3).

---

## 9. Web mapping notes

**dp -> px / canvas.** The app does **not** hard-code a 960x540 canvas: no `LocalDensity` override, no fixed-size root (grep for `LocalDensity provides`/`Density(` returned only player code). Layout is in dp relative to the device's actual density. Android TV at 1080p reports 320 dpi (density 2.0) = 960x540 dp, and 4K TVs commonly keep a 960x540dp UI, so all numbers above are tuned for a **960x540 dp** viewport (previews use `device = "spec:parent=tv_1080p"`, `UiConstants.kt:121-126`). Recommended port: treat 1 dp = 1 CSS px at a 960x540 design viewport and scale the whole app with `rem`/`vw`: e.g. `:root { --dp: calc(100vw / 960); }`, so a 1920x1080 browser renders every dp at 2 CSS px. 1sp = 1dp at default font scale. Keep a `--dp` custom property and write sizes as `calc(N * var(--dp))`.

- Poster card 114.7 x 172dp -> 229 x 344 CSS px at 1920x1080. Six poster columns in the grid at 960dp wide minus 72dp left inset, 16dp right, 16dp gaps.
- Image requests: Android asks Jellyfin for exact pixel sizes (`fillWidth`/`fillHeight`); on web request widths scaled by the CSS pixel ratio.

**Things that do not translate directly to CSS**
1. **D-pad focus model**: Compose focus groups, `focusRestorer`, `onEnter` redirects, `FocusRequester`s, wrap scrolling (`lazyListWrapScrolling`). Needs a spatial-navigation layer; focus rings must be applied on `:focus-visible` and on hover for mouse use.
2. **Library-default values** (card scale, focus border, shape radii, springs, nav3 transition, CircularProgress, type scale, `surfaceColorAtElevation` tint) come from androidx.tv; check them in the library sources before finalizing numbers. Where flagged "(unverified)" they are recalled, not read.
3. **Spring animations** (`spring(StiffnessMedium)`, default `animateDpAsState`): use CSS `linear()` easing or a spring lib (e.g. `motion`); there is no duration, so match feel.
4. **Blend modes in the backdrop**: `DstIn` masks + `Multiply` -> use `mask-image` with `mask-composite: intersect` and `mix-blend-mode: multiply` (or a pre-darkened gradient), and `isolation: isolate` on the container.
5. **Palette extraction**: Android `Palette` (no direct browser equivalent); use `node-vibrant`; cache per URL (LRU 50) and apply the alpha .4/.4/.35 and "cool color" rule.
6. **Marquee** (`basicMarquee`, 40dp/s, 250ms start, only after 500ms focus): CSS keyframe translate with computed overflow width.
7. **Percent corner radius** `RoundedCornerShape(25)` = `border-radius: 25%` of each side (becomes a stadium shape for wide pills only approximately; in CSS `border-radius: 25%` is equivalent per axis).
8. **Compose `Modifier.scale(1.1)`** transforms don't affect layout; use `transform: scale()` and keep the sliding title trick (12dp -> 4dp) so labels do not overlap the enlarged poster.
9. **Fonts**: Roboto is the system default on Android TV; web needs it loaded (or accept system-ui). Weights used: 400, 500, 600 (SemiBold), 700 (Bold).
10. **Android-only pieces**: adaptive icon masks, `holo_red_light` resource color (use `#FF4444`), Coil `useExistingImageAsPlaceholder`, window insets, TV overscan (none handled in code).
11. **Theme switching**: expose each theme as a `[data-theme=...]` block of CSS custom properties generated from `design-tokens.json` (`themes.<NAME>.tv.dark`); `border` -> `--accent`. Dark only; do not build light.
12. **Not traced / TODO for the next pass**: playback overlay visuals, subtitle style preview, Live TV guide grid, music now-playing visualizer, screensaver layout details, exact `FastOutSlowIn` easing use where only "default tween" is given (Compose `tween` default easing = `FastOutSlowInEasing` = `cubic-bezier(0.4, 0, 0.2, 1)`).
