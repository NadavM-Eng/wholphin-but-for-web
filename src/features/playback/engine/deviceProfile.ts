// DeviceProfile sent with POST /Items/{id}/PlaybackInfo. Mirrors W/util/profile/DeviceProfileUtils.kt and
// W/services/DeviceProfileService.kt (same preferences, same condition structure), with the codec/container lists
// coming from runtime browser detection (capabilities.ts) instead of Android MediaCodec. Spec 05 §1.5, §B3, §B5;
// HDR mapping per spec 08 PB-1/PB-2. Three decisions follow Jellyfin's own web client (jellyfin-web,
// src/scripts/browserDeviceProfile.js, GPL-2.0): Matroska as a direct-play container, the IsSecondaryAudio
// condition, and PGS delivered as an external file for a canvas renderer.
import type {
  CodecProfile,
  DeviceProfile,
  DirectPlayProfile,
  ProfileCondition,
  SubtitleProfile,
  TranscodingProfile,
} from '@jellyfin/sdk/lib/generated-client/models'
import type { Preferences } from '../../../stores/preferences'
import type { Capabilities, CodecSupport } from './capabilities'

export const PROFILE_NAME = 'Wholphin-Web'

/** Video range type names, including the 10.11-only ones (W/util/profile/WholphinVideoRangeType.kt). */
export const VideoRangeTypes = {
  SDR: 'SDR',
  HDR10: 'HDR10',
  HLG: 'HLG',
  DOVI: 'DOVI',
  DOVI_WITH_HDR10: 'DOVIWithHDR10',
  DOVI_WITH_HLG: 'DOVIWithHLG',
  DOVI_WITH_SDR: 'DOVIWithSDR',
  HDR10_PLUS: 'HDR10Plus',
  DOVI_INVALID: 'DOVIInvalid',
  DOVI_WITH_EL: 'DOVIWithEL',
  DOVI_WITH_EL_HDR10_PLUS: 'DOVIWithELHDR10Plus',
  DOVI_WITH_HDR10_PLUS: 'DOVIWithHDR10Plus',
} as const

export interface ProfileOptions {
  /** stored preference, passed raw like upstream (no DEFAULT_BITRATE fallback) */
  maxBitrate: number
  /** max height, 0 = no limit */
  maxResolution: number
  ac3Supported: boolean
  downMixStereo: boolean
  assMode: Preferences['assSubtitleMode']
  /** "Direct play PGS": draw PGS subtitles in the browser (libpgs) instead of asking the server to burn them in */
  pgsRender: boolean
  /** experimental prefer AC3 for surround (already gated by `experimentalEnable`) */
  preferAc3ForSurround: boolean
  jellyfinTenEleven: boolean
  forceEnabledHdr: ReadonlySet<string>
  forceDisabledHdr: ReadonlySet<string>
}

type HdrMode = Preferences['hdr10Override']

/** `HdrFormat.rangeTypeNames` (W/preferences/HdrFormat.kt). */
const HDR_FORMATS: Array<{ key: keyof Preferences; names: (tenEleven: boolean) => string[] }> = [
  { key: 'hdr10Override', names: () => [VideoRangeTypes.HDR10] },
  { key: 'hdr10PlusOverride', names: () => [VideoRangeTypes.HDR10_PLUS] },
  { key: 'doviProfile5Override', names: () => [VideoRangeTypes.DOVI] },
  {
    key: 'doviProfile7Override',
    names: (t) => (t ? [VideoRangeTypes.DOVI_WITH_EL, VideoRangeTypes.DOVI_WITH_EL_HDR10_PLUS] : []),
  },
  {
    key: 'doviProfile8Override',
    names: (t) => (t ? [VideoRangeTypes.DOVI_WITH_HDR10, VideoRangeTypes.DOVI_WITH_HDR10_PLUS] : [VideoRangeTypes.DOVI_WITH_HDR10]),
  },
]

/** `getHdrRangeTypesFor(mode)`: union over every HDR format whose override equals `mode`. */
export function getHdrRangeTypesFor(prefs: Pick<Preferences, HdrKey>, mode: HdrMode, tenEleven: boolean): Set<string> {
  const out = new Set<string>()
  for (const f of HDR_FORMATS) if (prefs[f.key as HdrKey] === mode) f.names(tenEleven).forEach((n) => out.add(n))
  return out
}
type HdrKey = 'hdr10Override' | 'hdr10PlusOverride' | 'doviProfile5Override' | 'doviProfile7Override' | 'doviProfile8Override'

/** MaxResolution enum -> height (preferences meta `intValue`). */
const MAX_RES_HEIGHT: Record<Preferences['maxResolution'], number> = {
  NO_LIMIT: 0,
  ULTRA_HD_8K: 4320,
  ULTRA_HD_4K: 2160,
  FULL_HD: 1080,
  HD: 720,
  PAL_SD: 576,
  NTSC_SD: 480,
  LOW_DEF: 360,
}

export function maxResolutionHeight(pref: Preferences['maxResolution']): number {
  return MAX_RES_HEIGHT[pref] ?? 0
}

/** Server version >= 10.11.0 (DeviceProfileService.kt). */
export function isTenEleven(version: string | null | undefined): boolean {
  const m = /^(\d+)\.(\d+)/.exec(version ?? '')
  if (!m) return false
  const major = Number(m[1])
  const minor = Number(m[2])
  return major > 10 || (major === 10 && minor >= 11)
}

/** The configuration DeviceProfileService derives from preferences (DeviceProfileConfiguration). */
export function profileOptionsFromPrefs(prefs: Preferences, serverVersion: string | null | undefined): ProfileOptions {
  const tenEleven = isTenEleven(serverVersion)
  return {
    maxBitrate: prefs.maxBitrate,
    maxResolution: maxResolutionHeight(prefs.maxResolution),
    ac3Supported: prefs.ac3Supported,
    downMixStereo: prefs.downMixStereo,
    assMode: prefs.assSubtitleMode,
    pgsRender: prefs.directPlayPgs,
    preferAc3ForSurround: prefs.experimentalEnable && prefs.preferAc3ForSurround,
    jellyfinTenEleven: tenEleven,
    forceEnabledHdr: getHdrRangeTypesFor(prefs, 'HDR_OVERRIDE_ENABLE', tenEleven),
    forceDisabledHdr: getHdrRangeTypesFor(prefs, 'HDR_OVERRIDE_DISABLE', tenEleven),
  }
}

// ---------------------------------------------------------------------------------------------

const cond = (Condition: ProfileCondition['Condition'], Property: ProfileCondition['Property'], Value: string, IsRequired = false): ProfileCondition => ({
  Condition,
  Property,
  Value,
  IsRequired,
})

/** Audio codecs the browser decodes, in upstream's order (supportedAudioCodecs, DeviceProfileUtils.kt:25-46). */
function browserAudioCodecs(caps: Capabilities, path: keyof CodecSupport): string[] {
  const a = caps.audio
  const out: string[] = []
  if (a.aac[path]) out.push('aac')
  if (a.ac3[path]) out.push('ac3')
  if (a.alac[path]) out.push('alac')
  if (a.dts[path]) out.push('dca', 'dts')
  if (a.eac3[path]) out.push('eac3')
  if (a.flac[path]) out.push('flac')
  if (a.truehd[path]) out.push('truehd')
  if (a.mp3[path]) out.push('mp3')
  if (a.opus[path]) out.push('opus')
  if (a.vorbis[path]) out.push('vorbis')
  return out
}

/** `allowedAudioCodecs` (DeviceProfileUtils.kt:80-95) restricted to what the browser decodes. */
function allowedAudio(caps: Capabilities, path: keyof CodecSupport, o: ProfileOptions): string[] {
  const all = browserAudioCodecs(caps, path)
  if (o.downMixStereo) return all.filter((c) => c === 'aac' || c === 'mp2' || c === 'mp3')
  if (!o.ac3Supported) return all.filter((c) => c !== 'ac3' && c !== 'eac3')
  return all
}

/**
 * Builds the profile from a capability set and the preference-derived options. Pure: unit-tested with mocked
 * capability sets.
 */
export function buildDeviceProfile(caps: Capabilities, o: ProfileOptions): DeviceProfile {
  const v = caps.video
  const fileAudio = allowedAudio(caps, 'file', o)
  const hlsAudio = allowedAudio(caps, 'hls', o)

  // ---- Direct play: only containers the <video> element demuxes. AVI/TS/MPEG are remuxed to HLS (spec B2).
  const directPlay: DirectPlayProfile[] = []
  if (caps.containers.mp4) {
    const codecs = [v.h264.file && 'h264', v.hevc.file && 'hevc', v.av1.file && 'av1', v.vp9.file && 'vp9'].filter(Boolean) as string[]
    const audio = fileAudio.filter((c) => c !== 'vorbis')
    if (codecs.length) {
      directPlay.push({
        Type: 'Video',
        Container: caps.containers.mov ? 'mp4,m4v,mov' : 'mp4,m4v',
        VideoCodec: codecs.join(','),
        AudioCodec: audio.join(','),
      })
    }
  }
  if (caps.containers.webm) {
    const codecs = [v.vp8.file && 'vp8', v.vp9.file && 'vp9', v.av1.file && 'av1'].filter(Boolean) as string[]
    const audio = fileAudio.filter((c) => c === 'opus' || c === 'vorbis')
    if (codecs.length) directPlay.push({ Type: 'Video', Container: 'webm', VideoCodec: codecs.join(','), AudioCodec: audio.join(',') })
  }
  // Matroska where the browser really played the probe clip (capabilities.ts). Only codecs the element decodes
  // are listed: Chromium plays a Matroska file whose audio it cannot decode as a silent film, without an error,
  // so an unlisted audio codec must go through the server (video copied, audio converted).
  if (caps.containers.mkv) {
    const m = caps.matroska
    const codecs = (['h264', 'hevc', 'av1', 'vp9', 'vp8'] as const).filter((c) => m.video[c])
    const audio = fileAudio.filter((c) => (m.audio as Record<string, boolean | undefined>)[c])
    if (codecs.length) directPlay.push({ Type: 'Video', Container: 'mkv', VideoCodec: codecs.join(','), AudioCodec: audio.join(',') })
  }
  // Remote HLS sources (e.g. a .strm pointing at an m3u8), Wholphin's "hls" container entry
  if (caps.mse || caps.nativeHls) {
    const codecs = [v.h264.hls && 'h264', v.hevc.hls && 'hevc'].filter(Boolean) as string[]
    if (codecs.length) directPlay.push({ Type: 'Video', Container: 'hls', VideoCodec: codecs.join(','), AudioCodec: hlsAudio.join(',') })
  }
  directPlay.push({ Type: 'Audio', Container: 'mp3,aac,m4a,m4b,flac,webma,webm,wav,ogg,opus', AudioCodec: fileAudio.join(',') })

  // ---- Transcoding: HLS. fMP4 carries HEVC/AV1 and works with hls.js and Safari; TS only as a last resort.
  const hlsContainer = caps.fmp4 ? 'mp4' : 'ts'
  const tVideo = [v.hevc.hls && 'hevc', 'h264', hlsContainer === 'mp4' && v.av1.hls && 'av1', hlsContainer === 'mp4' && v.vp9.hls && 'vp9'].filter(
    Boolean,
  ) as string[]
  const tAudio = hlsContainer === 'ts' ? hlsAudio.filter((c) => c === 'aac' || c === 'mp3' || c === 'ac3') : hlsAudio
  const breakOnNonKeyFrames = !caps.nativeHls || caps.mse
  const transcoding: TranscodingProfile[] = [
    {
      Type: 'Video',
      Context: 'Streaming',
      Protocol: 'hls',
      Container: hlsContainer,
      VideoCodec: tVideo.join(','),
      AudioCodec: o.preferAc3ForSurround && caps.audio.ac3.hls ? 'ac3' : (tAudio.length ? tAudio : ['aac']).join(','),
      CopyTimestamps: false,
      // subtitles are always delivered External and rendered by the client (spec B5)
      EnableSubtitlesInManifest: false,
      BreakOnNonKeyFrames: breakOnNonKeyFrames,
      ...(o.downMixStereo ? { MaxAudioChannels: '2' } : {}),
      ...(o.maxResolution > 0 ? { Conditions: [cond('LessThanEqual', 'Height', String(o.maxResolution))] } : {}),
    },
    {
      Type: 'Audio',
      Context: 'Streaming',
      Protocol: 'hls',
      Container: hlsContainer,
      AudioCodec: o.preferAc3ForSurround && caps.audio.ac3.hls ? 'ac3' : 'aac',
      BreakOnNonKeyFrames: breakOnNonKeyFrames,
    },
  ]
  if (hlsContainer === 'mp4') {
    // Live TV sources set UseMostCompatibleTranscodingProfile, which makes the server pick a TS profile; without
    // one it answers with an unusable progressive URL. hls.js transmuxes TS for H.264 + AAC/MP3.
    transcoding.splice(1, 0, {
      Type: 'Video',
      Context: 'Streaming',
      Protocol: 'hls',
      Container: 'ts',
      VideoCodec: 'h264',
      AudioCodec: hlsAudio.filter((c) => c === 'aac' || c === 'mp3').join(',') || 'aac',
      CopyTimestamps: false,
      EnableSubtitlesInManifest: false,
      BreakOnNonKeyFrames: breakOnNonKeyFrames,
      ...(o.downMixStereo ? { MaxAudioChannels: '2' } : {}),
      ...(o.maxResolution > 0 ? { Conditions: [cond('LessThanEqual', 'Height', String(o.maxResolution))] } : {}),
    })
  }

  // ---- Codec profiles (DeviceProfileUtils.kt:224-594)
  const codecProfiles: CodecProfile[] = []
  const anyPath = (c: CodecSupport) => c.file || c.hls
  const supportsAvc = anyPath(v.h264)

  codecProfiles.push({
    Type: 'Video',
    Codec: 'h264',
    Conditions: [
      supportsAvc
        ? cond('EqualsAny', 'VideoProfile', ['high', 'main', 'baseline', 'constrained baseline', ...(v.h264.tenBit ? ['high 10'] : [])].join('|'))
        : cond('Equals', 'VideoProfile', 'none'),
    ],
  })
  if (supportsAvc && v.h264.level > 0) {
    codecProfiles.push({
      Type: 'Video',
      Codec: 'h264',
      Conditions: [cond('LessThanEqual', 'VideoLevel', String(v.h264.level))],
      ApplyConditions: [cond('EqualsAny', 'VideoProfile', 'high|main|baseline|constrained baseline')],
    })
  }
  if (v.h264.tenBit && v.h264.level > 0) {
    codecProfiles.push({
      Type: 'Video',
      Codec: 'h264',
      Conditions: [cond('LessThanEqual', 'VideoLevel', String(v.h264.level))],
      ApplyConditions: [cond('Equals', 'VideoProfile', 'high 10')],
    })
  }
  // The RefFrames <= 12/4 guards (DeviceProfileUtils.kt:297-323) are Android decoder workarounds; browsers do not
  // need them and they would force needless transcodes of 1080p H.264.

  const supportsHevc = anyPath(v.hevc)
  codecProfiles.push({
    Type: 'Video',
    Codec: 'hevc',
    Conditions: [
      supportsHevc
        ? cond('EqualsAny', 'VideoProfile', ['main', ...(v.hevc.tenBit ? ['main 10'] : [])].join('|'))
        : cond('Equals', 'VideoProfile', 'none'),
    ],
  })
  if (supportsHevc && v.hevc.level > 0) {
    codecProfiles.push({
      Type: 'Video',
      Codec: 'hevc',
      Conditions: [cond('LessThanEqual', 'VideoLevel', String(v.hevc.level))],
      ApplyConditions: [cond('EqualsAny', 'VideoProfile', v.hevc.tenBit ? 'main|main 10' : 'main')],
    })
  }

  const supportsAv1 = anyPath(v.av1)
  codecProfiles.push({
    Type: 'Video',
    Codec: 'av1',
    Conditions: [
      !supportsAv1
        ? cond('Equals', 'VideoProfile', 'none')
        : !v.av1.tenBit
          ? cond('NotEquals', 'VideoProfile', 'main 10')
          : cond('NotEquals', 'VideoProfile', 'none'),
    ],
  })
  codecProfiles.push({ Type: 'Video', Codec: 'vc1', Conditions: [cond('Equals', 'VideoProfile', 'none')] })
  if (anyPath(v.vp9) && !v.vp9.tenBit) {
    codecProfiles.push({ Type: 'Video', Codec: 'vp9', Conditions: [cond('NotEquals', 'VideoProfile', 'Profile 2')] })
  }

  // Max resolution per codec, clamped by the user's max resolution height (Size.min)
  const clamp = (w: number, h: number) => (o.maxResolution > 0 && h > o.maxResolution ? [w, o.maxResolution] : [w, h])
  for (const [codec, caps1] of [
    ['h264', v.h264],
    ['hevc', v.hevc],
    ['av1', v.av1],
  ] as const) {
    if (!anyPath(caps1) || caps1.maxWidth <= 0) continue
    const [w, h] = clamp(caps1.maxWidth, caps1.maxHeight)
    codecProfiles.push({
      Type: 'Video',
      Codec: codec,
      Conditions: [cond('LessThanEqual', 'Width', String(w)), cond('LessThanEqual', 'Height', String(h))],
    })
  }
  if (o.maxResolution > 0) {
    for (const codec of ['mpeg', 'mpeg2video', 'vp8', 'vp9']) {
      codecProfiles.push({ Type: 'Video', Codec: codec, Conditions: [cond('LessThanEqual', 'Height', String(o.maxResolution))] })
    }
  }

  // ---- HDR exclusion (DeviceProfileUtils.kt:470-564; spec 08 PB-2). There is no "device bug" on the web.
  const t = o.jellyfinTenEleven
  const hdr = caps.hdr
  const R = VideoRangeTypes
  const hdr10Plus = (hdr10: boolean) => hdr10 // browsers ignore HDR10+ dynamic metadata; it plays as HDR10 (spec B4)
  const av1Set = new Set<string>()
  if (t) av1Set.add(R.DOVI_INVALID)
  if (!hdr.av1DolbyVision) {
    av1Set.add(R.DOVI)
    if (!hdr.av1Hdr10) av1Set.add(R.DOVI_WITH_HDR10)
    if (t && !hdr10Plus(hdr.av1Hdr10)) av1Set.add(R.DOVI_WITH_HDR10_PLUS)
  }
  if (!hdr10Plus(hdr.av1Hdr10)) {
    av1Set.add(R.HDR10_PLUS)
    if (!hdr.av1Hdr10) av1Set.add(R.HDR10)
  }
  const hevcSet = new Set<string>()
  if (t) hevcSet.add(R.DOVI_INVALID)
  // Dolby Vision profile 7 (enhancement layer) is never decodable in a browser
  if (t) {
    hevcSet.add(R.DOVI_WITH_EL)
    if (!hdr10Plus(hdr.hevcHdr10)) hevcSet.add(R.DOVI_WITH_EL_HDR10_PLUS)
  }
  if (!hdr.hevcDolbyVision) {
    hevcSet.add(R.DOVI)
    if (!hdr.hevcHdr10) hevcSet.add(R.DOVI_WITH_HDR10)
    if (t && !hdr10Plus(hdr.hevcHdr10)) hevcSet.add(R.DOVI_WITH_HDR10_PLUS)
  }
  if (!hdr10Plus(hdr.hevcHdr10)) {
    hevcSet.add(R.HDR10_PLUS)
    if (!hdr.hevcHdr10) hevcSet.add(R.HDR10)
  }
  const vp9Set = new Set<string>()
  if (!hdr.vp9Hdr10) vp9Set.add(R.HDR10).add(R.HDR10_PLUS)

  const finalize = (s: Set<string>) => {
    for (const x of o.forceEnabledHdr) s.delete(x)
    for (const x of o.forceDisabledHdr) s.add(x)
    return s
  }
  for (const [codec, set] of [
    ['av1', finalize(av1Set)],
    ['hevc', finalize(hevcSet)],
    ['vp9', finalize(vp9Set)],
  ] as const) {
    if (set.size === 0) continue
    // The NotEquals condition always fails, and ApplyConditions limits the profile to the listed range types,
    // so the server transcodes (tone-maps) exactly those (DeviceProfileUtils.kt:522-526).
    const values = [...set]
    codecProfiles.push({
      Type: 'Video',
      Codec: codec,
      Conditions: [cond('NotEquals', 'VideoRangeType', values.join('|'))],
      ApplyConditions: [cond('EqualsAny', 'VideoRangeType', values.join('|'))],
    })
  }

  if (o.preferAc3ForSurround) {
    for (const c of browserAudioCodecs(caps, 'hls').filter((c) => c !== 'ac3')) {
      codecProfiles.push({ Type: 'VideoAudio', Codec: c, Conditions: [cond('LessThanEqual', 'AudioChannels', '2')] })
      codecProfiles.push({ Type: 'Audio', Codec: c, Conditions: [cond('LessThanEqual', 'AudioChannels', '2')] })
    }
  }
  codecProfiles.push({
    Type: 'VideoAudio',
    Conditions: [
      cond('LessThanEqual', 'AudioChannels', o.downMixStereo ? '2' : '8'),
      // A <video> without the audioTracks API plays the first audio track of a file and cannot switch (measured
      // in Edge, Chrome and Firefox: the default flag is ignored). Any other track is "secondary" to the server,
      // which then remuxes with the video and that audio track copied (jellyfin-web: canPlaySecondaryAudio).
      ...(caps.audioTrackSelection ? [] : [cond('Equals', 'IsSecondaryAudio', 'false')]),
    ],
  })

  // ---- Subtitles (spec B5): text is External (server converts to WebVTT) and drawn by our renderer; ASS/SSA is
  // External for JASSUB unless the user chose burn-in; PGS is External (the server hands out the .sup stream) for
  // libpgs unless "Direct play PGS" is off. DVD (VobSub) and DVB subtitles are burned in: no established web
  // renderer exists, and Jellyfin 10.11 answers "External" for dvdsub with a URL that returns 404.
  const subtitles: SubtitleProfile[] = [
    { Format: 'vtt', Method: 'External' },
    { Format: 'webvtt', Method: 'External' },
  ]
  if (o.assMode !== 'ASS_TRANSCODE') {
    subtitles.push({ Format: 'ass', Method: 'External' }, { Format: 'ssa', Method: 'External' })
  }
  if (o.pgsRender) {
    subtitles.push({ Format: 'pgssub', Method: 'External' }, { Format: 'pgs', Method: 'External' })
  }
  for (const f of ['ass', 'ssa', 'pgs', 'pgssub', 'dvdsub', 'dvbsub', 'idx']) subtitles.push({ Format: f, Method: 'Encode' })

  return {
    Name: PROFILE_NAME,
    MaxStaticBitrate: o.maxBitrate,
    MaxStreamingBitrate: o.maxBitrate,
    MusicStreamingTranscodingBitrate: 384000,
    DirectPlayProfiles: directPlay,
    TranscodingProfiles: transcoding,
    ContainerProfiles: [],
    CodecProfiles: codecProfiles,
    SubtitleProfiles: subtitles,
  }
}
