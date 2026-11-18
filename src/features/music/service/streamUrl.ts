// Music stream URL (MusicService.convert, W/services/MusicService.kt:298-343). Upstream requests
// `GET /Audio/{id}/universal?container=<supportedAudioCodecs>` and lets ExoPlayer decode almost anything. A
// browser decodes far fewer formats, so the container list is built from runtime capability detection
// (src/features/playback/engine/capabilities.ts) in Jellyfin's `container|codec` form, and the server is told
// how to transcode the rest: progressive MP3 over HTTP (every browser plays it).
import type { AudioItem } from '../../../stores/musicQueue'

/** The browser's audio decoding support (subset of the engine's `Capabilities.audio` plus WAV). */
export type AudioSupport = {
  aac: boolean
  mp3: boolean
  opus: boolean
  flac: boolean
  vorbis: boolean
  alac: boolean
  wav: boolean
}

/** `container` / `container|codec` entries the browser plays as a progressive file, in upstream's codec order. */
export function browserAudioContainers(s: AudioSupport): string[] {
  const out: string[] = []
  if (s.aac) out.push('aac', 'm4a|aac', 'm4b|aac', 'mp4|aac')
  if (s.alac) out.push('m4a|alac', 'm4b|alac')
  if (s.flac) out.push('flac')
  if (s.mp3) out.push('mp3')
  if (s.opus) out.push('opus', 'ogg|opus', 'webm|opus', 'webma|opus')
  if (s.vorbis) out.push('ogg|vorbis', 'oga|vorbis', 'webm|vorbis', 'webma|vorbis')
  if (s.wav) out.push('wav')
  return out
}

/**
 * Whether the server will send the file as is (the same matching the universal endpoint does). Unknown
 * container data counts as direct: it only decides whether seeking reloads the stream.
 */
export function canDirectPlay(entry: Pick<AudioItem, 'container' | 'codec'>, containers: readonly string[]): boolean {
  if (!entry.container) return true
  const codec = entry.codec?.toLowerCase() ?? null
  return entry.container
    .toLowerCase()
    .split(',')
    .some((c) =>
      containers.some((p) => {
        const [pc, pa] = p.split('|')
        return pc === c && (pa == null || codec == null || pa === codec)
      }),
    )
}

export type StreamRequest = {
  baseUrl: string
  token: string | null
  itemId: string
  userId: string
  deviceId: string
  containers: readonly string[]
  playSessionId: string
  /** transcoded streams start here (direct streams seek with currentTime instead) */
  startMs?: number
  maxStreamingBitrate?: number
}

/** Transcode target: progressive MP3, 320 kbps, stereo. */
export const TRANSCODE = { container: 'mp3', codec: 'mp3', bitrate: 320_000, channels: 2 } as const

export function universalAudioUrl(r: StreamRequest): string {
  const q = new URLSearchParams()
  q.set('container', r.containers.join(','))
  q.set('userId', r.userId)
  q.set('deviceId', r.deviceId)
  q.set('maxStreamingBitrate', String(r.maxStreamingBitrate ?? 140_000_000))
  q.set('transcodingContainer', TRANSCODE.container)
  q.set('transcodingProtocol', 'http')
  q.set('audioCodec', TRANSCODE.codec)
  q.set('audioBitRate', String(TRANSCODE.bitrate))
  q.set('maxAudioChannels', String(TRANSCODE.channels))
  q.set('playSessionId', r.playSessionId)
  q.set('enableRedirection', 'true')
  q.set('enableRemoteMedia', 'false')
  if (r.startMs && r.startMs > 0) q.set('startTimeTicks', String(Math.round(r.startMs * 10_000)))
  if (r.token) q.set('ApiKey', r.token)
  return `${r.baseUrl.replace(/\/+$/, '')}/Audio/${encodeURIComponent(r.itemId)}/universal?${q}`
}
