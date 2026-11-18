// PlaybackInfo request body and response interpretation (PlaybackViewModel.changeStreams, spec 05 §1.3).
import type {
  DeviceProfile,
  MediaSourceInfo,
  PlaybackInfoDto,
  PlaybackInfoResponse,
  PlayMethod,
} from '@jellyfin/sdk/lib/generated-client/models'
import { directStreamUrl, serverUrl } from '../../../api/playback/urls'

export interface PlaybackInfoParams {
  deviceProfile: DeviceProfile
  audioIndex: number | null | undefined
  subtitleIndex: number | null | undefined
  mediaSourceId: string | null | undefined
  maxBitrate: number
  enableDirectPlay: boolean
  enableDirectStream: boolean
  userId?: string | null
  liveStreamId?: string | null
}

/** TrackIndex sentinels (-1/-2/-3) must not reach the server (spec 05 §1.3, §3 "Sentinels reach the server"). */
const realIndex = (i: number | null | undefined) => (i != null && i >= 0 ? i : null)

/** The upstream body with every negative index mapped to null, plus UserId (spec §B3). */
export function buildPlaybackInfoDto(p: PlaybackInfoParams): PlaybackInfoDto {
  return {
    UserId: p.userId ?? null,
    StartTimeTicks: null,
    DeviceProfile: p.deviceProfile,
    MaxAudioChannels: null,
    AudioStreamIndex: realIndex(p.audioIndex),
    SubtitleStreamIndex: realIndex(p.subtitleIndex),
    MediaSourceId: p.mediaSourceId ?? null,
    LiveStreamId: p.liveStreamId ?? null,
    AlwaysBurnInSubtitleWhenTranscoding: false,
    MaxStreamingBitrate: Math.trunc(p.maxBitrate),
    EnableDirectPlay: p.enableDirectPlay,
    EnableDirectStream: p.enableDirectStream,
    AllowVideoStreamCopy: p.enableDirectStream,
    AllowAudioStreamCopy: p.enableDirectStream,
    EnableTranscoding: true,
    AutoOpenLiveStream: true,
  }
}

export type ResolvedStream =
  | {
      ok: true
      source: MediaSourceInfo
      playMethod: PlayMethod
      url: string
      /** the URL is an HLS playlist (play through hls.js or native HLS) */
      hls: boolean
      playSessionId: string | null
      liveStreamId: string | null
    }
  | { ok: false; error: 'server-error'; code: string }
  | { ok: false; error: 'no-media-sources' | 'no-url' | 'no-method' }

/**
 * Picks the URL and play method from a PlaybackInfo response (PlaybackViewModel.kt:704-752). An empty
 * `MediaSources` list is an error (upstream hangs; spec 08 PB-3).
 */
export function resolvePlaybackInfo(
  res: PlaybackInfoResponse,
  itemId: string,
  baseUrl: string,
  token: string | null,
): ResolvedStream {
  if (res.ErrorCode) return { ok: false, error: 'server-error', code: res.ErrorCode }
  const source = res.MediaSources?.[0]
  if (!source) return { ok: false, error: 'no-media-sources' }
  const playSessionId = res.PlaySessionId ?? null
  const liveStreamId = source.LiveStreamId ?? null
  let url = ''
  if (source.SupportsDirectPlay) {
    if (source.IsRemote && source.Path?.trim()) url = source.Path
    else
      url = directStreamUrl(
        baseUrl,
        { itemId, mediaSourceId: source.Id, liveStreamId, eTag: source.ETag, playSessionId },
        token,
      )
  } else if (source.TranscodingUrl) {
    url = serverUrl(baseUrl, source.TranscodingUrl, token)
  }
  if (!url.trim()) return { ok: false, error: 'no-url' }
  let playMethod: PlayMethod
  if (source.SupportsDirectPlay) playMethod = 'DirectPlay'
  else if (source.SupportsDirectStream) playMethod = 'DirectStream'
  else if (source.SupportsTranscoding) playMethod = 'Transcode'
  else return { ok: false, error: 'no-method' }
  const hls =
    playMethod !== 'DirectPlay'
      ? (source.TranscodingSubProtocol ?? 'hls') === 'hls' || /\.m3u8(\?|$)/i.test(url)
      : source.Container === 'hls' || /\.m3u8(\?|$)/i.test(url)
  return { ok: true, source, playMethod, url, hls, playSessionId, liveStreamId }
}
