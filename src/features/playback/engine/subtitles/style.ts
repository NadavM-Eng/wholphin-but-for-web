// Subtitle style preferences -> CSS (SubtitleSettings.toSubtitleStyle, spec 05 §4.3 and §B4 "Text subtitle
// styling"). Sizes scale with the rendered video height, as a TV renders sp on a 540 dp tall screen.
import type { CSSProperties } from 'react'
import type { Preferences } from '../../../../stores/preferences'

export type SubtitleStylePrefs = Pick<
  Preferences,
  | 'subFontSize'
  | 'subFontColor'
  | 'subFontBold'
  | 'subFontItalic'
  | 'subFontOpacity'
  | 'subEdgeStyle'
  | 'subEdgeColor'
  | 'subEdgeThickness'
  | 'subBackgroundStyle'
  | 'subBackgroundColor'
  | 'subBackgroundOpacity'
  | 'subMargin'
>

/**
 * The style set to use (PlaybackPage.kt:504-515): the separate HDR copy when "different for HDR" is on and the
 * video is HDR, else the normal one.
 */
export function stylePrefsFor(p: Preferences, hdr: boolean): SubtitleStylePrefs {
  if (!p.subSeparateHdr || !hdr) return p
  return {
    subFontSize: p.hdrSubFontSize,
    subFontColor: p.hdrSubFontColor,
    subFontBold: p.hdrSubFontBold,
    subFontItalic: p.hdrSubFontItalic,
    subFontOpacity: p.hdrSubFontOpacity,
    subEdgeStyle: p.hdrSubEdgeStyle,
    subEdgeColor: p.hdrSubEdgeColor,
    subEdgeThickness: p.hdrSubEdgeThickness,
    subBackgroundStyle: p.hdrSubBackgroundStyle,
    subBackgroundColor: p.hdrSubBackgroundColor,
    subBackgroundOpacity: p.hdrSubBackgroundOpacity,
    subMargin: p.hdrSubMargin,
  }
}

/** `SimpleVideoStream.hdr` (PlaybackViewModel.kt:522-536): VideoRange HDR, or a range type other than SDR/Unknown. */
export function isHdrVideo(streams: ReadonlyArray<{ Type?: string | null; VideoRange?: string | null; VideoRangeType?: string | null }> | null | undefined): boolean {
  const v = streams?.find((s) => s.Type === 'Video')
  if (!v) return false
  return v.VideoRange === 'HDR' || (v.VideoRangeType != null && v.VideoRangeType !== 'SDR' && v.VideoRangeType !== 'Unknown')
}

/** TV screen height in dp that the sp sizes are authored against. */
export const TV_HEIGHT_DP = 540

export interface VideoRect {
  x: number
  y: number
  width: number
  height: number
}

/** Where a `object-fit: contain` video draws inside a box (letterboxing removed). */
export function containedVideoRect(boxW: number, boxH: number, videoW: number, videoH: number): VideoRect {
  if (boxW <= 0 || boxH <= 0) return { x: 0, y: 0, width: 0, height: 0 }
  if (videoW <= 0 || videoH <= 0) return { x: 0, y: 0, width: boxW, height: boxH }
  const scale = Math.min(boxW / videoW, boxH / videoH)
  const width = videoW * scale
  const height = videoH * scale
  return { x: (boxW - width) / 2, y: (boxH - height) / 2, width, height }
}

/** `#RRGGBB` + opacity percent -> rgba(). */
export function rgba(hex: string, opacityPercent: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const n = m ? parseInt(m[1], 16) : 0xffffff
  const a = Math.max(0, Math.min(100, opacityPercent)) / 100
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

/**
 * While the controls are visible the TV shrinks its SubtitleView to 70% of the screen, top-center (`subtitleMaxSize`,
 * PlaybackPage.kt:520), because its controller covers the lower part of the picture. The web player's control strip is
 * low (owner request), so subtitles only step up by the strip's height (`--player-strip-h`, PlayerView.module.css).
 */
export const RAISED_BY = 'var(--player-strip-h, 62px)'
/** The same step for a layer that is moved as a whole (image subtitles). */
export const RAISED_SHIFT = `translateY(calc(-1 * ${RAISED_BY}))`

/** `setBottomPaddingFraction(margin / 100)` (SubtitleSettings.kt:362): a fraction of the subtitle view's height. */
export function subtitleBottomMargin(marginPercent: number, viewHeightPx: number): string {
  return `${(marginPercent / 100) * (viewHeightPx > 0 ? viewHeightPx : TV_HEIGHT_DP)}px`
}

export interface SubtitleCss {
  /** the whole cue window: margin from the bottom, BOXED background */
  box: CSSProperties
  /** one cue */
  cue: CSSProperties
  /** one line of text: font, color, edge, WRAP background */
  line: CSSProperties
}

export function subtitleStyle(p: SubtitleStylePrefs, videoHeightPx: number): SubtitleCss {
  const dp = (videoHeightPx > 0 ? videoHeightPx : TV_HEIGHT_DP) / TV_HEIGHT_DP
  // scaled to the video like a TV, but never below a readable 12px (portrait phones show a ~200px tall video)
  const fontPx = Math.max(p.subFontSize * dp, Math.min(12, p.subFontSize))
  // edge_thickness is stored in half-dp units (4 = 2 dp)
  const edgePx = Math.max(0.5, (p.subEdgeThickness / 2) * dp)
  const edgeColor = rgba(p.subEdgeColor, p.subFontOpacity)
  const bg = rgba(p.subBackgroundColor, p.subBackgroundOpacity)
  const line: CSSProperties = {
    color: rgba(p.subFontColor, p.subFontOpacity),
    fontSize: `${fontPx}px`,
    // Media3 SubtitlePainter lays cues out with StaticLayout(spacingMult 1): the font's own line spacing (Roboto 1.172)
    lineHeight: 1.171875,
    fontWeight: p.subFontBold ? 700 : 400,
    fontStyle: p.subFontItalic ? 'italic' : 'normal',
    // BG_WRAP is a BackgroundColorSpan: each line's own width, no padding
    background: p.subBackgroundStyle === 'BG_WRAP' ? bg : undefined,
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone',
  }
  if (p.subEdgeStyle === 'EDGE_SOLID') {
    // calculateEdgeSize (edgeThickness / 2 dp) is SubtitlePainter.outlineWidth: a stroke centred on the glyph edge,
    // so half of it shows (util/Media3SubtitleOverride.kt:52). Same rule as the settings preview (subtitleStyle.ts).
    line.WebkitTextStroke = `${edgePx}px ${edgeColor}`
    line.paintOrder = 'stroke fill'
  } else if (p.subEdgeStyle === 'EDGE_SHADOW') {
    // the drop shadow keeps Media3's fixed 2dp radius and offset (upstream overrides only the outline width);
    // Android blurs radius r with sigma = 0.577 r + 0.5 px, CSS blur = 2 sigma
    const two = 2 * dp
    line.textShadow = `${two}px ${two}px ${2 * (0.57735 * two + 0.25 * dp)}px ${edgeColor}`
  }
  return {
    box: {
      marginBottom: subtitleBottomMargin(p.subMargin, videoHeightPx),
      background: p.subBackgroundStyle === 'BG_BOXED' ? bg : undefined,
      // Media3 windowColor: the text block plus textSize x 0.25 on each side, no vertical padding, square corners
      padding: p.subBackgroundStyle === 'BG_BOXED' ? `0 ${0.25 * fontPx}px` : undefined,
    },
    cue: {},
    line,
  }
}

/**
 * What the style options can do to the subtitles on screen (the player's subtitle style sheet says so when it is
 * not everything): `text` cues are drawn by the app in the chosen style (also the sample line, with no track
 * chosen); `image` subtitles (PGS) are pictures and only take the image opacity; `styled` ones (ASS/SSA) are drawn
 * by libass in the script's own style; `burned` ones are part of the picture the server sends.
 */
export type SubtitleStyleReach = 'text' | 'image' | 'styled' | 'burned'

export function subtitleStyleReach(subtitle: { kind: 'text' | 'ass' | 'pgs' | 'burn-in' | 'unavailable' } | null): SubtitleStyleReach {
  switch (subtitle?.kind) {
    case 'pgs':
      return 'image'
    case 'ass':
      return 'styled'
    case 'burn-in':
      return 'burned'
    default:
      return 'text'
  }
}
