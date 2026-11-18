// Diagnostics for the Debug page (web stand-in for W/ui/detail/DebugPage.kt): app/client identity, what the
// browser can decode (instead of ExoPlayer/MediaCodec tables), display/HDR, preferences, server and user
// (tokens redacted). Everything here is safe to copy into a bug report.
import { CLIENT_NAME, CLIENT_VERSION, deviceNameFromUserAgent, getDeviceId } from '../../api/session'
import { detectCapabilities } from '../playback/engine/capabilities'
import type { CurrentSession } from '../../stores/session'
import upstream from './upstream.gen.json'

export interface UpstreamRef {
  repository: string
  branch: string | null
  commit: string | null
  commitDate: string | null
}

export const UPSTREAM: UpstreamRef = upstream

/** "main@8dcf189 (2026-11-15)" or null when the generator had no reference checkout. */
export function upstreamLabel(): string | null {
  if (!UPSTREAM.commit) return null
  const date = UPSTREAM.commitDate?.slice(0, 10)
  return `${UPSTREAM.branch ?? 'commit'}@${UPSTREAM.commit.slice(0, 7)}${date ? ` (${date})` : ''}`
}

export type Section = { title: string; rows: Array<[string, string]> }

export function appInfo(): Section {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  return {
    title: 'App Information',
    rows: [
      ['Client', `${CLIENT_NAME} ${CLIENT_VERSION}`],
      ['Upstream', upstreamLabel() ?? 'unknown'],
      ['Build', import.meta.env.MODE],
      ['Device id', getDeviceId()],
      ['Device name', deviceNameFromUserAgent(ua)],
      ['User agent', ua],
      ['Language', `${navigator.language} (${navigator.languages?.join(', ') ?? ''})`],
    ],
  }
}

export function deviceInfo(): Section {
  const mm = (q: string) => (typeof matchMedia === 'undefined' ? false : matchMedia(q).matches)
  return {
    title: 'Device Information',
    rows: [
      ['Screen', `${screen.width}x${screen.height} @${window.devicePixelRatio}x`],
      ['Viewport', `${window.innerWidth}x${window.innerHeight}`],
      ['HDR display', String(mm('(dynamic-range: high)'))],
      ['Color gamut', mm('(color-gamut: rec2020)') ? 'rec2020' : mm('(color-gamut: p3)') ? 'p3' : 'srgb'],
      ['Pointer', mm('(pointer: coarse)') ? 'coarse' : mm('(pointer: fine)') ? 'fine' : 'none'],
      ['Hover', String(mm('(hover: hover)'))],
      ['Hardware threads', String(navigator.hardwareConcurrency ?? '?')],
      ['Online', String(navigator.onLine)],
    ],
  }
}

/** MIME types checked with MediaSource.isTypeSupported and <video>.canPlayType. */
export const CODEC_PROBES: ReadonlyArray<[string, string]> = [
  ['H.264 High', 'video/mp4; codecs="avc1.640028"'],
  ['HEVC Main', 'video/mp4; codecs="hvc1.1.6.L120.90"'],
  ['HEVC Main 10', 'video/mp4; codecs="hvc1.2.4.L153.B0"'],
  ['AV1 Main 10', 'video/mp4; codecs="av01.0.08M.10"'],
  ['VP9 Profile 0', 'video/webm; codecs="vp09.00.10.08"'],
  ['VP9 Profile 2', 'video/webm; codecs="vp09.02.10.10"'],
  ['Dolby Vision (dvh1)', 'video/mp4; codecs="dvh1.05.06"'],
  ['AAC LC', 'audio/mp4; codecs="mp4a.40.2"'],
  ['AC-3', 'audio/mp4; codecs="ac-3"'],
  ['E-AC-3', 'audio/mp4; codecs="ec-3"'],
  ['Opus', 'audio/webm; codecs="opus"'],
  ['FLAC', 'audio/mp4; codecs="flac"'],
  ['MP3', 'audio/mpeg'],
  ['HLS (native)', 'application/vnd.apple.mpegurl'],
]

export function codecSupport(): Section {
  const MS = (globalThis as { ManagedMediaSource?: typeof MediaSource }).ManagedMediaSource ?? globalThis.MediaSource
  const video = typeof document === 'undefined' ? null : document.createElement('video')
  return {
    title: 'Codec Support',
    rows: [
      ['MediaSource', MS ? (MS === globalThis.MediaSource ? 'MediaSource' : 'ManagedMediaSource') : 'none'],
      ...CODEC_PROBES.map(([name, type]): [string, string] => {
        const mse = MS?.isTypeSupported?.(type) ?? false
        const native = video?.canPlayType(type) || 'no'
        return [name, `MSE ${mse ? 'yes' : 'no'}, <video> ${native}`]
      }),
    ],
  }
}

/**
 * What the player measured by really loading a clip, as opposed to the type answers above: Matroska direct play,
 * AC-3 / E-AC-3 decoding and audio track switching (async; the same cached result the device profile is built from).
 */
export async function measuredPlaybackSupport(): Promise<Section> {
  const yes = (b: boolean) => (b ? 'yes' : 'no')
  const list = (o: Record<string, boolean>) => Object.entries(o).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'
  try {
    const c = await detectCapabilities()
    return {
      title: 'Measured Playback Support',
      rows: [
        ['Matroska (MKV) direct play', c.containers.mkv ? 'yes (probe clip played)' : 'no (remuxed by the server, video copied)'],
        ['Video codecs in MKV', list(c.matroska.video)],
        ['Audio codecs in MKV', list(c.matroska.audio)],
        ['AC-3 decoding', `file ${yes(c.audio.ac3.file)}, HLS ${yes(c.audio.ac3.hls)}`],
        ['E-AC-3 decoding', `file ${yes(c.audio.eac3.file)}, HLS ${yes(c.audio.eac3.hls)}`],
        ['Audio track switching in a file', c.audioTrackSelection ? 'yes' : 'no (only the first track plays directly)'],
        ['PGS subtitles', 'drawn in the browser (libpgs) unless "Direct play PGS" is off'],
        [
          'HDR10 on this display',
          c.hdr.display ? 'HDR display' : c.hdr.toneMapsToSdr ? 'SDR display, tone-mapped by the browser (no server transcode)' : 'SDR display, tone-mapped by the server (video transcode)',
        ],
      ],
    }
  } catch (e) {
    return { title: 'Measured Playback Support', rows: [['Probe', `error: ${e instanceof Error ? e.message : String(e)}`]] }
  }
}

/** MediaCapabilities results for a few HDR/4K decode configurations (async). */
export async function hdrDecodeSupport(): Promise<Section> {
  const mc = navigator.mediaCapabilities
  const configs: Array<[string, string, Partial<VideoConfiguration>]> = [
    ['HEVC 4K HDR10', 'video/mp4; codecs="hvc1.2.4.L153.B0"', { hdrMetadataType: 'smpteSt2086', colorGamut: 'rec2020', transferFunction: 'pq' }],
    ['AV1 4K HDR10', 'video/mp4; codecs="av01.0.12M.10"', { hdrMetadataType: 'smpteSt2086', colorGamut: 'rec2020', transferFunction: 'pq' }],
    ['VP9 4K HDR (PQ)', 'video/webm; codecs="vp09.02.51.10"', { colorGamut: 'rec2020', transferFunction: 'pq' }],
    ['H.264 4K SDR', 'video/mp4; codecs="avc1.640033"', {}],
  ]
  const rows: Array<[string, string]> = []
  for (const [name, contentType, extra] of configs) {
    if (!mc?.decodingInfo) {
      rows.push([name, 'MediaCapabilities unavailable'])
      continue
    }
    try {
      const r = await mc.decodingInfo({
        type: 'media-source',
        video: { contentType, width: 3840, height: 2160, bitrate: 20_000_000, framerate: 24, ...extra },
      })
      rows.push([name, `supported ${r.supported}, smooth ${r.smooth}, power efficient ${r.powerEfficient}`])
    } catch (e) {
      rows.push([name, `error: ${e instanceof Error ? e.message : String(e)}`])
    }
  }
  return { title: 'Detected HDR Support', rows }
}

export function userInfo(session: CurrentSession | null): Section {
  if (!session) return { title: 'User Information', rows: [['Session', 'none']] }
  const { server, user, userDto } = session
  return {
    title: 'User Information',
    rows: [
      ['Server', `${server.name ?? ''} ${server.url} (${server.id})`],
      ['Server version', server.version ?? 'unknown'],
      ['User', `${user.name ?? ''} (${user.id})`],
      ['Token', user.accessToken ? '[REDACTED]' : 'none'],
      ['PIN set', String(!!user.pin)],
      ['Require login', String(user.requireLogin)],
      ['Administrator', String(userDto.Policy?.IsAdministrator ?? false)],
      ['Configuration', JSON.stringify(userDto.Configuration ?? {})],
    ],
  }
}

export function sectionsToText(sections: readonly Section[]): string {
  return sections.map((s) => `## ${s.title}\n${s.rows.map(([k, v]) => `${k}: ${v}`).join('\n')}`).join('\n\n')
}

/**
 * `ServerReportService.buildLogHeader`: the first lines of every report sent to the server (app logs, media info).
 * Android's flavor / manufacturer / model / API level become the app and device sections of the Debug page.
 */
export function buildLogHeader(title: string, serverVersion: string | null | undefined): string {
  return [title, `serverVersion=${serverVersion ?? 'null'}`, sectionsToText([appInfo(), deviceInfo()])].join('\n')
}
