// Keyboard shortcuts of the web player (spec 05 §9.8 media keys + §B7 web additions). The D-pad rules (arrows,
// Enter, Back, hold-to-seek) live in usePlayerKeys; this file only names single-key shortcuts.

export type Shortcut =
  | 'toggle-play'
  | 'seek-back'
  | 'seek-forward'
  | 'next'
  | 'previous'
  | 'stop'
  | 'captions'
  | 'audio'
  | 'skip-segment'
  | 'fullscreen'
  | 'pip'
  | 'mute'
  | 'debug'
  | 'subtitle-delay-down'
  | 'subtitle-delay-up'
  | 'speed-down'
  | 'speed-up'
  | 'help'
  | 'chapters'
  | 'queue'
  | { percent: number }

export interface KeyLike {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  metaKey?: boolean
}

/** The shortcut a key press triggers, or null. Modifier chords (Ctrl/Alt/Meta) are left to the browser. */
export function shortcutFor(e: KeyLike): Shortcut | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null
  switch (e.key) {
    case ' ':
    case 'k':
    case 'K':
      return 'toggle-play'
    case 'j':
    case 'J':
    case 'MediaRewind':
      return 'seek-back'
    case 'l':
    case 'L':
    case 'MediaFastForward':
      return 'seek-forward'
    case 'n':
    case 'N':
    case 'MediaTrackNext':
      return 'next'
    case 'P':
      return e.shiftKey ? 'previous' : 'pip'
    case 'MediaTrackPrevious':
      return 'previous'
    case 'p':
      return 'pip'
    case 'MediaStop':
      return 'stop'
    case 'c':
    case 'C':
    case 'ClosedCaptionToggle':
    case 'Subtitle':
      return 'captions'
    case 'a':
    case 'A':
    case 'MediaAudioTrack':
      return 'audio'
    case 's':
    case 'S':
      return 'skip-segment'
    case 'f':
    case 'F':
      return 'fullscreen'
    case 'm':
    case 'M':
    case 'AudioVolumeMute':
      return 'mute'
    case 'i':
    case 'I':
      return 'debug'
    case '[':
      return 'subtitle-delay-down'
    case ']':
      return 'subtitle-delay-up'
    case '<':
      return 'speed-down'
    case '>':
      return 'speed-up'
    case '?':
      return 'help'
    case 'h':
    case 'H':
      return 'chapters'
    case 'q':
    case 'Q':
      return 'queue'
  }
  if (/^[0-9]$/.test(e.key)) return { percent: Number(e.key) * 10 }
  return null
}

/** Next speed in the upstream list, or null at the end. */
export function stepSpeed(list: readonly number[], current: number, dir: -1 | 1): number | null {
  let i = list.findIndex((r) => Math.abs(r - current) < 1e-6)
  if (i < 0) i = list.findIndex((r) => r > current) - (dir > 0 ? 1 : 0)
  const n = i + dir
  return n >= 0 && n < list.length ? list[n] : null
}

/** Groups of the "?" sheet: the visible key labels and the i18n key of the description. */
export const SHORTCUT_SHEET: ReadonlyArray<{ keys: string[]; label: string }> = [
  { keys: ['Space', 'K'], label: 'web_shortcut_play_pause' },
  { keys: ['←', '→'], label: 'web_shortcut_arrows' },
  { keys: ['J', 'L'], label: 'web_shortcut_seek' },
  { keys: ['Tab', 'Enter'], label: 'web_shortcut_show_controls' },
  { keys: ['↑', '↓'], label: 'web_shortcut_volume' },
  { keys: ['0', '…', '9'], label: 'web_shortcut_percent' },
  { keys: ['N', 'Shift+P'], label: 'web_shortcut_next_previous' },
  { keys: ['C'], label: 'subtitles' },
  { keys: ['A'], label: 'web_shortcut_audio' },
  { keys: ['H'], label: 'chapters' },
  { keys: ['Q'], label: 'queue' },
  { keys: ['[', ']'], label: 'web_shortcut_subtitle_delay' },
  { keys: ['<', '>'], label: 'web_shortcut_speed' },
  { keys: ['S'], label: 'web_shortcut_skip_segment' },
  { keys: ['M'], label: 'web_playback_mute' },
  { keys: ['F'], label: 'web_playback_fullscreen' },
  { keys: ['P'], label: 'web_playback_pip' },
  { keys: ['I'], label: 'web_shortcut_debug' },
  { keys: ['Esc', 'Backspace'], label: 'web_shortcut_back' },
  { keys: ['?'], label: 'web_shortcut_help' },
]
