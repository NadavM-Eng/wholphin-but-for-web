// Port of W/ui/playback/TrackSelectionUtils.kt (spec 05 §2.7): maps a server stream index to a track the player
// exposes. On the web the player tracks are `video.audioTracks` (Safari progressive) or hls.js audio tracks;
// text is always rendered by our own layer, so a subtitle selection only decides internal vs external.
import type { MediaSourceInfo, MediaStream } from '@jellyfin/sdk/lib/generated-client/models'

export type TrackSelected = 'SELECTED' | 'NOT_FOUND' | 'UNSUPPORTED'

/** One track as a backend exposes it. `id` follows the container's track id when the backend knows it. */
export interface PlayerTrack {
  id: string
  type: 'audio' | 'text'
  /** side-loaded (upstream: format id contains ":e:") */
  external: boolean
  supported: boolean
}

export interface TrackSelectionResult {
  audio: TrackSelected
  subtitle: TrackSelected
  /** player track to enable for audio, when a specific one was chosen */
  audioTrack: PlayerTrack | null
  /** player track to enable for text, or null when text should be disabled / is external */
  textTrack: PlayerTrack | null
  /** all text tracks off */
  disableText: boolean
}

export const bothSelected = (r: TrackSelectionResult) => r.audio === 'SELECTED' && r.subtitle === 'SELECTED'

/**
 * Ordinal of the stream among same-type server streams; for subtitles only EMBED/HLS deliveries count
 * (`getPlayerIndex`, TrackSelectionUtils.kt:120-137).
 */
export function getPlayerIndex(serverIndex: number, source: MediaSourceInfo, type: 'Audio' | 'Subtitle'): number | null {
  let list = (source.MediaStreams ?? []).filter((s) => s.Type === type)
  if (type === 'Subtitle') list = list.filter((s) => s.DeliveryMethod === 'Embed' || s.DeliveryMethod === 'Hls')
  const i = list.findIndex((s) => s.Index === serverIndex)
  return i >= 0 ? i : null
}

const MAX = Number.MAX_SAFE_INTEGER

/** `sortedById`: sort by the first two numeric parts of the id split on ':' or '/'; externals last. */
export function sortById(tracks: readonly PlayerTrack[]): PlayerTrack[] {
  const key = (t: PlayerTrack): [number, number] => {
    if (t.external) return [MAX, MAX]
    const parts = t.id.split(/[:/]/).map((p) => (/^-?\d+$/.test(p) ? Number(p) : MAX))
    if (parts.length >= 2) return [parts[0], parts[1]]
    if (parts.length === 0 || t.id === '') return [MAX, MAX]
    return [parts[0], MAX]
  }
  return tracks
    .map((t) => ({ t, k: key(t) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1])
    .map((x) => x.t)
}

/** The stream for an index iff it is delivered externally (`findExternalSubtitle`). */
export function findExternalSubtitle(streams: readonly MediaStream[] | null | undefined, subtitleIndex: number | null | undefined): MediaStream | null {
  if (subtitleIndex == null) return null
  return (
    streams?.find((s) => s.Type === 'Subtitle' && (s.DeliveryMethod === 'External' || !!s.IsExternal) && s.Index === subtitleIndex) ?? null
  )
}

/** `createTrackSelections` without the media3 parameter builder: which player tracks to enable. */
export function createTrackSelections(
  tracks: readonly PlayerTrack[],
  audioIndex: number | null | undefined,
  subtitleIndex: number | null | undefined,
  source: MediaSourceInfo,
): TrackSelectionResult {
  let subtitle: TrackSelected = 'SELECTED'
  let textTrack: PlayerTrack | null = null
  let disableText = false
  if (subtitleIndex != null && subtitleIndex >= 0) {
    let chosen: PlayerTrack | undefined
    if (findExternalSubtitle(source.MediaStreams, subtitleIndex)) {
      chosen = tracks.find((t) => t.type === 'text' && t.external)
    } else {
      const pi = getPlayerIndex(subtitleIndex, source, 'Subtitle')
      if (pi != null) chosen = sortById(tracks.filter((t) => t.type === 'text' && !t.external))[pi]
    }
    if (chosen && chosen.supported) textTrack = chosen
    else subtitle = chosen ? 'UNSUPPORTED' : 'NOT_FOUND'
  } else {
    disableText = true
  }

  let audio: TrackSelected = 'SELECTED'
  let audioTrack: PlayerTrack | null = null
  if (audioIndex != null && audioIndex >= 0) {
    const pi = getPlayerIndex(audioIndex, source, 'Audio')
    const chosen = pi != null ? sortById(tracks.filter((t) => t.type === 'audio'))[pi] : undefined
    if (chosen && chosen.supported) audioTrack = chosen
    else audio = chosen ? 'UNSUPPORTED' : 'NOT_FOUND'
  }
  return { audio, subtitle, audioTrack, textTrack, disableText }
}
