// Subtitle style (upstream SubtitlePreferences, W/ui/preferences/subtitle/SubtitleSettings.kt) as CSS for DOM-rendered
// cues. Used by the settings preview and meant for the player's text-cue renderer: `subtitleStyleFor(prefs, isHdrVideo)`.
import type { CSSProperties } from 'react'
import { dpCss } from '../../theme/scale'
import {
  PREFERENCE_DEFAULTS,
  SUBTITLE_HDR_KEYS,
  setPref,
  type Preferences,
  type SubtitleStyleKey,
} from '../../stores/preferences'

export interface SubtitleStyle {
  fontSize: number
  fontColor: string
  fontBold: boolean
  fontItalic: boolean
  fontOpacity: number
  edgeStyle: Preferences['subEdgeStyle']
  edgeColor: string
  edgeThickness: number
  backgroundStyle: Preferences['subBackgroundStyle']
  backgroundColor: string
  backgroundOpacity: number
  margin: number
  imageOpacity: number
}

/** The SDR style, or the HDR copy (PlaybackPage.kt:509-511: only when useSeparateHdr and the video is HDR). */
export function subtitleStyleFor(p: Preferences, hdrVideo = false): SubtitleStyle {
  const hdr = hdrVideo && p.subSeparateHdr
  const g = <K extends SubtitleStyleKey>(k: K): Preferences[K] => (hdr ? p[SUBTITLE_HDR_KEYS[k]] : p[k]) as Preferences[K]
  return {
    fontSize: g('subFontSize'),
    fontColor: g('subFontColor'),
    fontBold: g('subFontBold'),
    fontItalic: g('subFontItalic'),
    fontOpacity: g('subFontOpacity'),
    edgeStyle: g('subEdgeStyle'),
    edgeColor: g('subEdgeColor'),
    edgeThickness: g('subEdgeThickness'),
    backgroundStyle: g('subBackgroundStyle'),
    backgroundColor: g('subBackgroundColor'),
    backgroundOpacity: g('subBackgroundOpacity'),
    margin: g('subMargin'),
    imageOpacity: g('subImageOpacity'),
  }
}

/** Upstream's defaults (resetSubtitles()). */
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = subtitleStyleFor(PREFERENCE_DEFAULTS)

/** `combine(color, opacity)`: floor(opacity/100*255) as alpha over the RGB (alpha bits of the stored color ignored). */
export function rgba(hex: string, opacity: number): string {
  const m = /^#?([0-9a-f]{6})/i.exec(hex.trim())
  const rgb = m ? parseInt(m[1], 16) : 0xffffff
  const a = Math.floor((opacity / 100) * 255) / 255
  return `rgb(${(rgb >> 16) & 255} ${(rgb >> 8) & 255} ${rgb & 255} / ${a.toFixed(3)})`
}

/**
 * Outline stroke width in dp: `edgeThickness / 2` (calculateEdgeSize, written into SubtitlePainter.outlineWidth by
 * Media3SubtitleOverride). The stroke is centered on the glyph edge, so half of it shows outside the letters.
 */
export const edgeSizeDp = (s: SubtitleStyle) => s.edgeThickness / 2

/**
 * Media3 SubtitlePainter's own edge sizes (`twoDpInPx`): outline width, shadow radius and shadow offset. Upstream
 * overrides only the outline width, and only where it applies Media3SubtitleOverride, so the drop shadow and the
 * "margin" sample keep these.
 */
export const MEDIA3_EDGE_DP = 2

/** Android blurs a shadow of radius r with sigma = 0.57735 r + 0.5 px (at density 2: 1.4dp for 2dp); CSS blur = 2 sigma. */
const SHADOW_BLUR_DP = 2 * (0.57735 * MEDIA3_EDGE_DP + 0.25)

/**
 * Text style of one cue (Media3 CaptionStyleCompat via toSubtitleStyle, drawn by SubtitlePainter): color with font
 * opacity, bold/italic, an outline (a stroke of `outlineDp` painted under the fill, like Android's FILL_AND_STROKE
 * pass followed by the fill) or the fixed 2dp drop shadow, both in the edge color at font opacity. The text size is
 * the caller's: fixed sp for styled cues, a fraction of the view height for default ones.
 */
export function cueTextStyle(s: SubtitleStyle, outlineDp: number = edgeSizeDp(s)): CSSProperties {
  const edge = rgba(s.edgeColor, s.fontOpacity)
  const css: CSSProperties = {
    color: rgba(s.fontColor, s.fontOpacity),
    fontWeight: s.fontBold ? 700 : 400,
    fontStyle: s.fontItalic ? 'italic' : 'normal',
  }
  if (s.edgeStyle === 'EDGE_SOLID') {
    css.WebkitTextStroke = `${dpCss(outlineDp)} ${edge}`
    css.paintOrder = 'stroke fill'
  } else if (s.edgeStyle === 'EDGE_SHADOW') {
    css.textShadow = `${dpCss(MEDIA3_EDGE_DP)} ${dpCss(MEDIA3_EDGE_DP)} ${dpCss(SHADOW_BLUR_DP)} ${edge}`
  }
  if (s.backgroundStyle === 'BG_WRAP') {
    // Media3 backgroundColor is a BackgroundColorSpan: each line's own width, no padding
    css.backgroundColor = rgba(s.backgroundColor, s.backgroundOpacity)
    css.boxDecorationBreak = 'clone'
    css.WebkitBoxDecorationBreak = 'clone'
  }
  return css
}

/** Color of the rectangle behind the whole cue block (BG_BOXED = Media3 windowColor), or null. */
export function cueWindowColor(s: SubtitleStyle): string | null {
  return s.backgroundStyle === 'BG_BOXED' ? rgba(s.backgroundColor, s.backgroundOpacity) : null
}

/**
 * Reset button: restores the page's own style to the defaults. Upstream replaces the page's whole
 * SubtitlePreferences with a fresh one (SubtitlePreferencesContent.kt:162-172), so on the SDR page
 * "Use different style for HDR" (useSeparateHdr, a field of that object) goes back to off as well.
 */
export function resetSubtitleStyle(hdr: boolean) {
  for (const k of Object.keys(SUBTITLE_HDR_KEYS) as SubtitleStyleKey[]) {
    const target = hdr ? SUBTITLE_HDR_KEYS[k] : k
    setPref(target, PREFERENCE_DEFAULTS[k] as Preferences[typeof target])
  }
  if (!hdr) setPref('subSeparateHdr', PREFERENCE_DEFAULTS.subSeparateHdr)
}
