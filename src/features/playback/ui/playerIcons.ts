import type { MaterialIconName } from '../../../ui'

/**
 * The audio-track button. Upstream draws a Font Awesome speaker (`fa_volume_high`, PlaybackControls.kt:381-383);
 * the web row also has a volume control, so here a speaker means volume only and the track list gets the music
 * note that Jellyfin's own web player uses for it.
 */
export const AUDIO_TRACK_ICON = 'audiotrack' satisfies MaterialIconName

/**
 * The Chapters button of the control strip (the TV has a row of chapter cards under its controller, no button).
 * Jellyfin's web player has no chapters button either (only previous / next chapter arrows), so this is the
 * plain Material list icon.
 */
export const CHAPTERS_ICON = 'format_list_bulleted' satisfies MaterialIconName

/**
 * The Queue button: stacked cards with a play mark (Material `video_library`). Jellyfin's web player has no queue
 * button in its video controls, so this is the standard Material icon for a stack of videos.
 */
export const QUEUE_ICON = 'video_library' satisfies MaterialIconName

/** The volume control's speaker: crossed out when silent, one wave below half volume, two waves above. */
export function volumeIcon(silent: boolean, volume: number): MaterialIconName {
  return silent ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'
}
