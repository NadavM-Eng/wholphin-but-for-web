# tv-material library defaults (checked against source)

These values come from the `androidx.tv:tv-material` source, not from the Wholphin repo. Paths are relative to
`tv/tv-material/src/main/java/androidx/tv/material3/` in https://github.com/androidx/androidx.

**Source version:** `androidx-main`, fetched 2026-11-17. There is no git tag named `tv-material-1.1.0-alpha01`, so
I could not pin the exact release Wholphin uses (`1.1.0-alpha01`). Values may differ slightly from that release.
Anything marked **guess** was not confirmed.

| Value | Confirmed | Source |
|---|---|---|
| Card shape | **8dp** RoundedCornerShape (the spec guessed 12dp) | `Card.kt` `CardDefaults.ContainerShape` (private) |
| Card focused scale / pressed | 1.1 / 1.0 (pressed = unfocused scale) | `Card.kt` `CardDefaults.scale()` |
| Card focused border | 3dp `colorScheme.border`, card shape, inset 0; pressed border is the same. Drawn after the content as a stroke on the surface outline (`drawOutline(outline, brush, Stroke(width))`), so it is centred on the card edge: 1.5dp outside, 1.5dp over the content, and it scales with the card. Confirmed on refshots 02-home-row-3 and 01-setup-server-empty | `Card.kt` `CardDefaults.border()`, `Surface.kt` `SurfaceBorderNode` |
| Card glow | none | `CardDefaults.glow()` |
| Card colors | container `surfaceVariant`, focused container same as unfocused | `CardDefaults.colors()` |
| Surface scale animation | tween **300ms** to focus, **500ms** from focus, 120ms press, 300ms release; easing CubicBezier(0, 0, 0.2, 1) | `SurfaceScale.kt`, `tokens/SurfaceTokens.kt` (`SurfaceScaleTokens`) |
| ClickableSurface scale | focused 1.1, pressed/disabled 1.0 | `SurfaceDefaults.kt` `ClickableSurfaceDefaults.scale()` |
| ClickableSurface shape | `shapes.medium` (12dp) | `ClickableSurfaceDefaults.shape()` |
| Shapes | extraSmall 4, small 8, medium 12, large 16, extraLarge 28 dp | `Shapes.kt`, `tokens/ShapeTokens.kt` |
| Button | CircleShape; min 58x40dp; padding 16/10dp; focused 1.1; container surfaceVariant@.8, content onSurface@.8, focused onSurface/inverseOnSurface, disabled @.4; focusedDisabled border 1.5dp onSurfaceVariant@.2 | `ButtonDefaults.kt` |
| ListItem heights | 48 (one line), 56 (with leading), 64 (two lines), 80 (three); dense 40/40/56/72 | `ListItemDefaults.kt` `MinContainerHeight*` |
| ListItem padding / gaps | 16dp x 12dp (dense 12 x 10); 8dp after leading, 8dp before trailing; icon 32dp (dense 20) | `ListItemDefaults.kt` |
| ListItem shape / scale | 8dp; focused **1.05** (the spec guessed 1.1) | `ListItemDefaults.kt` |
| ListItem colors | container transparent, content onSurface; focused inverseSurface / inverseOnSurface; selected secondaryContainer@.4 / onSecondaryContainer; focusedDisabled border 2dp `border` | `ListItemDefaults.colors()` |
| ListItem text | headline titleMedium (dense titleSmall); overline labelSmall @.6; supporting bodySmall @.8; trailing labelLarge (dense labelSmall); leading content @.8 | `ListItem.kt` |
| Surface disabled content | The surface fades its whole content: alpha .6 when disabled, .8 when disabled and focused / pressed / selected (`stateAlpha`), on top of the content color | `Surface.kt` `SurfaceImpl` |
| ListItem disabled alpha | **measured**: content at .48 of onSurface on a disabled, unfocused row (refshots 36-image-subtitles-captions-dialog, 23-playback-movie-captions-dialog), i.e. the surface's .6 times a further .8 whose source was not found. The kit uses .48, and .64 (.8 x .8, unmeasured) while focused. The disabled Wholphin Button icon measures .48 too; `ClickableSurfaceDefaults` disabledContainerColor = surfaceVariant@.4 confirmed by pixel (23-playback-movie-controls) | measurement |
| Nav drawer item | height 48 (one line), 56 (two lines); collapsed width 56dp, expanded 256dp; icon 24dp; focused scale 1.05; inactive content @.4 | `NavigationDrawerItemDefaults` |
| Switch size | track 40x24dp, 1.5dp outline, thumb 12dp unchecked / 18dp checked, state layer 40dp, thumb tween 100ms | `tokens/SwitchTokens.kt`, `Switch.kt` |
| Switch colors | checked: thumb onPrimary, track primary, no outline. Unchecked: thumb `border`, track surfaceVariant, outline `border`. Disabled colors are composited over surface. There are no focused colors. | `Switch.kt` `defaultSwitchColors` |
| surfaceColorAtElevation | surface at 0dp; otherwise surfaceTint at alpha (4.5 ln(e+1) + 2)/100 composited over surface | `ColorScheme.kt` |
| Default surfaceTint / borderVariant | surfaceTint = primary; borderVariant = NeutralVariant30 | `ColorScheme.kt` `darkColorScheme()` |
| Circular progress | not in tv-material. Compose material3: 4dp stroke, 40dp diameter. The 40dp is matched by token order and is a **guess**. | material3 `ProgressIndicatorDefaults` |
| Text style | `PlatformTextStyle(includeFontPadding = false)`, no LineHeightStyle, font SansSerif. No LineHeightStyle means Compose's default, `Trim.Both`: the leading above the first and below the last line of every Text is cut, so a one-line text is as tall as the font (Roboto 1.172em: bodyLarge 18.75dp, bodyMedium 16.4dp, bodySmall 14dp, titleLarge 25.8dp), not the line height. See the `t-line` / `t-trim` / `t-trimBox` helpers in `src/theme/global.css` | `tokens/TypographyTokens.kt` |
| material3 divider | compose-material3 `HorizontalDivider`: 1dp, `outlineVariant`. Wholphin's material3 scheme never sets outlineVariant, so it is the library's dark default #49454F in every theme (`--fx-m3-outline-variant`). With `Modifier.height(16.dp)` the line is drawn along the top of the 16dp box | material3 `Divider.kt`, `W/ui/theme/Theme.kt:47-50` |
| material3 dropdown menu | Position: start edges aligned; below the anchor, else above, else centred on its top, else 48dp (`MenuVerticalMargin`) from the window edge nearer the anchor. Item label inside `TvDropdownMenuItem` is a tv `Text`, so tv bodyLarge, not M3 labelLarge | material3 `MenuPosition.kt`, `W/ui/components/TvDropdownMenuItem.kt` |
| Bring into view | TV devices: `PivotBringIntoViewSpec` (parent fraction .3, child fraction 0) for every scrollable without its own spec, both axes (`src/ui/lib/bringIntoView.ts`) | compose foundation `BringIntoViewSpec.android.kt` |

## Type scale (`tokens/TypeScaleTokens.kt`)

| Style | Size | Line height | Weight | Tracking (sp) | Differs from `design-tokens.json`? |
|---|---|---|---|---|---|
| displayLarge | 57 | 64 | 400 | **-0.2** | yes (json -0.25) |
| displayMedium | 45 | 52 | 400 | 0 | |
| displaySmall | 36 | 44 | 400 | 0 | |
| headlineLarge | 32 | 40 | 400 | 0 | |
| headlineMedium | 28 | 36 | 400 | 0 | |
| headlineSmall | 24 | 32 | 400 | 0 | |
| titleLarge | 22 | 28 | 400 | 0 | |
| titleMedium | 16 | 24 | 500 | **0.2** | yes (json 0.15) |
| titleSmall | 14 | 20 | 500 | 0.1 | |
| bodyLarge | 16 | 24 | 400 | 0.5 | |
| bodyMedium | 14 | 20 | 400 | **0.2** | yes (json 0.25) |
| bodySmall | 12 | 16 | 400 | **0.2** | yes (json 0.4) |
| labelLarge | 14 | 20 | 500 | 0.1 | |
| labelMedium | 12 | 16 | 500 | 0.5 | |
| labelSmall | 11 | 16 | 500 | 0.5 | |

Sizes, line heights and weights match the json. Only four letter-spacing values differ. `typography.css` is generated
from the json, so I did not edit either file; the corrections need to go into `design-tokens.json`.

## One highlight at a time (web input modality)

The TV app only ever shows one focused element. The kit draws the TV focus look for both `:focus-visible`
and `:hover`, so on the web the two are coordinated by `src/ui/lib/inputModality.ts` (installed once by the
shell's `installModalityTracking`):

- a real mouse/pen movement (the cursor's screen position changed; touch never counts) sets `data-pointer`
  on `<html>`; any key press other than a lone modifier removes it;
- focus-look rules are written `:where(:root:not([data-pointer])) .x:focus-visible`, hover-look rules
  `:where(:root[data-pointer]) .x:hover` (inside the usual `@media (hover: hover)`); rules keyed on a theme
  put the condition in the root selector: `:global(:root[data-theme='X']:where([data-pointer]))`.
  `:where()` keeps specificity unchanged.

An overlay's opener keeps its focused look while the overlay is open, as on the TV where the window behind a
dialog keeps its focus: `Dialog` and `DropdownMenu` mark it with `data-focus-held` (`holdFocusLook`), and the
focus-look rules read `:is(:focus-visible, [data-focus-held])`. Components with their own focus look that open
dialogs should do the same.

So moving the mouse takes the highlight (the keyboard focus ring is hidden), and the next key press gives it
back to the focused element. Focus never follows the pointer: Tab / arrow navigation continue from the real
focus and screen readers are unaffected. New interactive components must gate both looks the same way.
