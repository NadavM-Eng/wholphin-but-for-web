/**
 * Dialogs of the player (PlaybackDialogType + the subtitle search, the web shortcuts sheet and the web layout's
 * chapters and queue panels, which replace the CHAPTERS / QUEUE states of upstream's `OverlayViewState`).
 */
export type PlayerDialog = 'settings' | 'captions' | 'audio' | 'speed' | 'scale' | 'bitrate' | 'delay' | 'search' | 'help' | 'chapters' | 'queue'

/** The sheets that stand on the control strip: the controls stay up while one of them is open. */
export const STRIP_SHEETS: ReadonlySet<PlayerDialog> = new Set(['settings', 'captions', 'audio', 'speed', 'scale', 'bitrate', 'chapters', 'queue'])

/** `PrefContentScale` values (PlaybackConstants.playbackScaleOptions order). */
export const CONTENT_SCALES = ['FIT', 'NONE', 'CROP', 'FILL', 'Fill_WIDTH', 'FILL_HEIGHT'] as const
export type ContentScale = (typeof CONTENT_SCALES)[number]

export const CONTENT_SCALE_LABELS: Record<ContentScale, string> = {
  FIT: 'content_scale_fit',
  NONE: 'none',
  CROP: 'content_scale_crop',
  FILL: 'content_scale_fill',
  Fill_WIDTH: 'content_scale_fill_width',
  FILL_HEIGHT: 'content_scale_fill_height',
}
