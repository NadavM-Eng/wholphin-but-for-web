// Play-method fallback ladder (spec 05 §10 and §B6). Upstream jumps from any direct-play/direct-stream player
// error straight to a full transcode and has no watchdog; the browser needs one rung more (remux fixes most
// container problems cheaply) and must never loop. One ladder lives per queue item.
import type { PlayMethod } from '@jellyfin/sdk/lib/generated-client/models'

export interface FallbackStep {
  /** the method that failed */
  method: PlayMethod
  /** short machine reason: 'media-error', 'hls-fatal', 'no-frames', 'no-video-size', 'track-activation', ... */
  reason: string
  detail?: string
}

export interface FallbackLadder {
  /** EnableDirectPlay for the next PlaybackInfo request */
  allowDirectPlay: boolean
  /** EnableDirectStream (and AllowVideo/AudioStreamCopy) for the next request */
  allowDirectStream: boolean
  /** every failure so far, oldest first */
  path: FallbackStep[]
}

/** Fresh ladder for an item; "Play with transcoding" starts at the bottom rung (both flags off). */
export function initialLadder(forceTranscode: boolean): FallbackLadder {
  return { allowDirectPlay: !forceTranscode, allowDirectStream: !forceTranscode, path: [] }
}

/**
 * One rung down after `failure`. The rungs are the request flags, not the server's label, because Jellyfin reports
 * an HLS remux (video copied, only the container or audio changed) as "Transcode":
 *   direct play allowed -> stream copy allowed (remux) -> full transcode (no copy) -> give up.
 * A direct-play failure drops only direct play; any other failure drops stream copy. The flags only ever go down,
 * so the ladder cannot loop. Returns null when nothing lower is left (surface the error).
 */
export function stepDown(ladder: FallbackLadder, failure: FallbackStep): FallbackLadder | null {
  const path = [...ladder.path, failure]
  if (failure.method === 'DirectPlay' && ladder.allowDirectPlay) {
    return { allowDirectPlay: false, allowDirectStream: ladder.allowDirectStream, path }
  }
  if (ladder.allowDirectStream) return { allowDirectPlay: false, allowDirectStream: false, path }
  return null
}

/** Transcode reasons that change only the container or the audio: the video is stream-copied. */
const COPY_REASONS = new Set([
  // EnableDirectPlay=false: the server still copies a compatible video stream when copy is allowed
  'DirectPlayError',
  'ContainerNotSupported',
  'ContainerBitrateExceedsLimit',
  'AudioCodecNotSupported',
  'AudioChannelsNotSupported',
  'AudioProfileNotSupported',
  'AudioSampleRateNotSupported',
  'AudioBitrateNotSupported',
  'AudioBitDepthNotSupported',
  'SecondaryAudioNotSupported',
  'UnknownAudioStreamInfo',
])

/** `TranscodeReasons` from a server TranscodingUrl. */
export function transcodeReasons(url: string | null | undefined): string[] {
  const m = /[?&]TranscodeReasons=([^&]*)/i.exec(url ?? '')
  return m ? decodeURIComponent(m[1]).split(',').filter(Boolean) : []
}

/** True when a server "Transcode" is really a remux (video copied). */
export function isVideoCopy(reasons: readonly string[]): boolean {
  return reasons.length > 0 && reasons.every((r) => COPY_REASONS.has(r))
}

/**
 * Flags for a mid-playback restart (audio/subtitle/bitrate change). Upstream passes `enableDirectPlay = true`
 * literally (PlaybackViewModel.kt changeAudioStream/changeSubtitleStream/changeMaxBitrate), so a forced or
 * fallen-back transcode could return to direct play; the ladder floor is kept instead.
 */
export function restartFlags(ladder: FallbackLadder): { enableDirectPlay: boolean; enableDirectStream: boolean } {
  return { enableDirectPlay: ladder.allowDirectPlay, enableDirectStream: ladder.allowDirectStream }
}

/** Human-readable path such as "DirectPlay (no-frames) -> DirectStream (media-error) -> Transcode". */
export function describePath(ladder: FallbackLadder, current: PlayMethod | null): string {
  const parts = ladder.path.map((p) => `${p.method} (${p.reason})`)
  if (current) parts.push(current)
  return parts.join(' -> ')
}
