// Runtime media capability detection (spec 05 Part 2 §B2). The web counterpart of
// W/util/profile/MediaCodecCapabilitiesTest.kt: canPlayType answers "can a progressive file play",
// MediaSource.isTypeSupported answers "can hls.js/MSE play it", navigator.mediaCapabilities.decodingInfo adds
// size limits and HDR. Where those answers are known to be unreliable (Matroska, AC-3 / E-AC-3) a clip of a
// fraction of a second is really loaded (probeMedia.ts). Results are cached for the page lifetime.
import { probePlayback, type ProbeResult } from './probeMedia'

/** Support of one codec in each delivery path. */
export interface CodecSupport {
  /** progressive file in a <video> (direct play) */
  file: boolean
  /** fragmented MP4 through MediaSource (hls.js) or the native HLS player */
  hls: boolean
}

export interface VideoCodecCaps extends CodecSupport {
  /** 10-bit profile (H.264 High 10, HEVC Main 10, AV1 Main 10, VP9 profile 2) */
  tenBit: boolean
  /** highest supported level in Jellyfin units (H.264 level x10, HEVC level x30); 0 when not probed */
  level: number
  maxWidth: number
  maxHeight: number
}

export interface HdrCaps {
  /** the display reports high dynamic range (`(dynamic-range: high)`) */
  display: boolean
  /**
   * the browser converts HDR10 / HLG video to the SDR display itself (desktop Chromium), so such a file needs no
   * tone-mapping transcode on the server. Dolby Vision without an HDR10 or HLG base layer is not covered.
   */
  toneMapsToSdr: boolean
  hevcHdr10: boolean
  hevcHlg: boolean
  hevcDolbyVision: boolean
  av1Hdr10: boolean
  av1Hlg: boolean
  av1DolbyVision: boolean
  vp9Hdr10: boolean
}

export interface Capabilities {
  /** MediaSource or ManagedMediaSource is available */
  mse: boolean
  /** `<video>` plays application/vnd.apple.mpegurl itself (Safari, iOS, some Android browsers) */
  nativeHls: boolean
  /**
   * progressive containers the element demuxes. `mkv` is measured, not asked: an embedded Matroska clip was
   * loaded (Chromium and recent Firefox play Matroska, Safari does not, and canPlayType is not a reliable witness)
   */
  containers: { mp4: boolean; webm: boolean; mov: boolean; mkv: boolean }
  /** codecs the element plays from a Matroska file (all false when `containers.mkv` is false) */
  matroska: { video: Record<MatroskaVideoCodec, boolean>; audio: Record<MatroskaAudioCodec, boolean> }
  /**
   * the element lists a file's audio tracks (`video.audioTracks`, Safari). Without it a progressive file plays
   * its first audio track only, whatever the default flags say
   */
  audioTrackSelection: boolean
  /** hls.js can carry fMP4 segments (MSE accepts video/mp4 avc1) */
  fmp4: boolean
  video: { h264: VideoCodecCaps; hevc: VideoCodecCaps; av1: VideoCodecCaps; vp9: VideoCodecCaps; vp8: CodecSupport }
  audio: {
    aac: CodecSupport
    mp3: CodecSupport
    opus: CodecSupport
    flac: CodecSupport
    vorbis: CodecSupport
    alac: CodecSupport
    ac3: CodecSupport
    eac3: CodecSupport
    dts: CodecSupport
    truehd: CodecSupport
  }
  hdr: HdrCaps
}

export type MatroskaVideoCodec = 'h264' | 'hevc' | 'av1' | 'vp9' | 'vp8'
export type MatroskaAudioCodec = 'aac' | 'mp3' | 'opus' | 'flac' | 'vorbis' | 'ac3' | 'eac3'

const NONE: CodecSupport = { file: false, hls: false }

// ---------------------------------------------------------------------------------------------
// Decisions on top of the real probes (pure: unit-tested)

/** What canPlayType says about Matroska. */
export interface MatroskaTypeAnswers {
  /** `video/x-matroska` without codecs */
  bare: boolean
  /** `video/x-matroska; codecs="avc1.42E01E, mp4a.40.2"` */
  h264Aac: boolean
  /** a made-up codec in Matroska: an engine that accepts it answers "yes" to everything */
  bogus: boolean
}

/**
 * Matroska direct play. The loaded clip decides; when the browser postponed loading (no answer), canPlayType is
 * believed only from an engine that turns down a made-up codec.
 */
export function matroskaSupported(probe: ProbeResult, type: MatroskaTypeAnswers): boolean {
  if (probe === 'ok') return true
  if (probe === 'error') return false
  return type.h264Aac && !type.bogus
}

/**
 * One codec inside Matroska: the element must play it from a file at all, and an engine that answers Matroska
 * questions per codec (it knows the bare type and rejects a made-up codec) must also say yes for this one.
 * Engines that play Matroska without admitting the type (older Chromium) get the file answer alone.
 */
export function matroskaCodecSupported(container: boolean, file: boolean, type: MatroskaTypeAnswers, typeSaysYes: boolean): boolean {
  if (!container || !file) return false
  const answersPerCodec = type.bare && !type.bogus
  return answersPerCodec ? typeSaysYes : true
}

/**
 * Whether HDR10 / HLG video is shown properly on a display that is not HDR. No API answers this, so it is the one
 * engine check here, the same one Jellyfin's web client makes (browserDeviceProfile.js `supportsHdr10`): desktop
 * Chromium (Chrome, Edge, Brave, Opera...) tone-maps to SDR itself; Chrome on Android and Firefox do not, and
 * Safari is judged by its display alone.
 */
export function browserToneMapsHdr(uaData: { brands?: ReadonlyArray<{ brand: string }>; mobile?: boolean } | null | undefined): boolean {
  if (!uaData?.brands) return false
  return uaData.brands.some((b) => b.brand === 'Chromium') && uaData.mobile !== true
}

/**
 * HDR10-class video (PQ) is offered when the decoder takes it and either the display is HDR or the browser
 * tone-maps it. Without both the server tone-maps, which is a full video transcode.
 */
export function hdrPlayable(decodes: boolean, display: boolean, toneMapsToSdr: boolean): boolean {
  return decodes && (display || toneMapsToSdr)
}

/**
 * AC-3 / E-AC-3: the type check is confirmed by loading a silent clip. Only an explicit error overrules it (Edge
 * names the codecs on a Windows without the Dolby decoder); no answer leaves the type check standing.
 */
export function confirmDecode(claimed: CodecSupport, probe: ProbeResult): CodecSupport {
  return probe === 'error' ? { ...NONE } : claimed
}

// ---------------------------------------------------------------------------------------------
// Probe primitives

let probeVideo: HTMLVideoElement | null = null
function canPlay(type: string): boolean {
  if (typeof document === 'undefined') return false
  probeVideo ??= document.createElement('video')
  const r = probeVideo.canPlayType(type)
  return r === 'probably' || r === 'maybe'
}

interface MediaSourceLike {
  isTypeSupported(type: string): boolean
}
function mediaSourceCtor(): MediaSourceLike | null {
  const w = globalThis as unknown as { ManagedMediaSource?: MediaSourceLike; MediaSource?: MediaSourceLike }
  return w.MediaSource ?? w.ManagedMediaSource ?? null
}
function mseSupports(type: string): boolean {
  try {
    return mediaSourceCtor()?.isTypeSupported(type) ?? false
  } catch {
    return false
  }
}

type DecodeKind = 'file' | 'media-source'
interface VideoProbe {
  contentType: string
  width: number
  height: number
  bitrate: number
  framerate: number
  transferFunction?: 'srgb' | 'pq' | 'hlg'
  colorGamut?: 'srgb' | 'p3' | 'rec2020'
  hdrMetadataType?: 'smpteSt2086' | 'smpteSt2094-10' | 'smpteSt2094-40'
}

async function decodes(kind: DecodeKind, video: VideoProbe): Promise<boolean> {
  const mc = (globalThis.navigator as Navigator | undefined)?.mediaCapabilities
  if (!mc?.decodingInfo) return false
  try {
    const r = await mc.decodingInfo({ type: kind, video } as MediaDecodingConfiguration)
    return r.supported
  } catch {
    return false
  }
}

const mp4 = (codecs: string) => `video/mp4; codecs="${codecs}"`
const webm = (codecs: string) => `video/webm; codecs="${codecs}"`

/** Both delivery paths for a codec string in an MP4 container. */
const both = (codecs: string): CodecSupport => ({ file: canPlay(mp4(codecs)), hls: mseSupports(mp4(codecs)) || nativeHlsPlays(codecs) })

let nativeHlsCache: boolean | null = null
function hasNativeHls(): boolean {
  nativeHlsCache ??= canPlay('application/vnd.apple.mpegurl') || canPlay('application/x-mpegURL')
  return nativeHlsCache
}
/** Native HLS players decode what the element decodes. */
const nativeHlsPlays = (codecs: string) => hasNativeHls() && canPlay(mp4(codecs))

const or = (a: CodecSupport, b: CodecSupport): CodecSupport => ({ file: a.file || b.file, hls: a.hls || b.hls })

// H.264 level probes: [codec suffix, Jellyfin level]
const AVC_LEVELS: Array<[string, number]> = [
  ['1E', 30],
  ['1F', 31],
  ['28', 40],
  ['29', 41],
  ['2A', 42],
  ['32', 50],
  ['33', 51],
  ['34', 52],
  ['3C', 60],
  ['3D', 61],
  ['3E', 62],
]
// HEVC main-tier level probes: Jellyfin uses level x30 (L153 = 5.1)
const HEVC_LEVELS = [90, 120, 123, 150, 153, 156, 180, 183, 186]

function highest<T>(levels: T[], ok: (l: T) => boolean): T | null {
  let best: T | null = null
  for (const l of levels) if (ok(l)) best = l
  return best
}

async function maxSize(contentType: string, kind: DecodeKind): Promise<{ maxWidth: number; maxHeight: number }> {
  const sizes: Array<[number, number]> = [
    [7680, 4320],
    [3840, 2160],
    [2560, 1440],
    [1920, 1080],
  ]
  for (const [w, h] of sizes) {
    if (await decodes(kind, { contentType, width: w, height: h, bitrate: 20_000_000, framerate: 30 })) return { maxWidth: w, maxHeight: h }
  }
  // decodingInfo missing or negative for every size: the element decided support already, assume 4K like a TV decoder
  return { maxWidth: 4096, maxHeight: 2304 }
}

async function hdrProbe(contentType: string, kind: DecodeKind, transferFunction: 'pq' | 'hlg'): Promise<boolean> {
  return decodes(kind, {
    contentType,
    width: 3840,
    height: 2160,
    bitrate: 20_000_000,
    framerate: 24,
    transferFunction,
    colorGamut: 'rec2020',
    ...(transferFunction === 'pq' ? { hdrMetadataType: 'smpteSt2086' as const } : {}),
  })
}

// ---------------------------------------------------------------------------------------------
// Detection

/** Runs every probe once. Safe to call repeatedly; the first result is cached. */
export function detectCapabilities(): Promise<Capabilities> {
  cached ??= probe().catch((err: unknown) => {
    cached = null
    throw err
  })
  return cached
}
let cached: Promise<Capabilities> | null = null

/** Forget the cached probe (tests, or after the user toggled something that affects detection). */
export function resetCapabilities() {
  cached = null
  nativeHlsCache = null
}

async function probe(): Promise<Capabilities> {
  const mse = mediaSourceCtor() != null
  const nativeHls = hasNativeHls()
  const kind: DecodeKind = mse ? 'media-source' : 'file'

  // H.264
  const avcHigh = 'avc1.640028'
  const h264Support = or(both(avcHigh), both('avc1.42E01E'))
  const avcLevel = highest(AVC_LEVELS, ([hex]) => canPlay(mp4(`avc1.6400${hex}`)) || mseSupports(mp4(`avc1.6400${hex}`)))
  const h264High10 = canPlay(mp4('avc1.6E0028')) || mseSupports(mp4('avc1.6E0028'))

  // HEVC (hvc1 and hev1 sample entries)
  const hevcMain = or(both('hvc1.1.6.L120.B0'), both('hev1.1.6.L120.B0'))
  const hevcMain10 = or(both('hvc1.2.4.L120.B0'), both('hev1.2.4.L120.B0'))
  const hevcLevel = highest(HEVC_LEVELS, (l) => {
    const c = `hvc1.1.6.L${l}.B0`
    return canPlay(mp4(c)) || mseSupports(mp4(c))
  })

  // AV1 / VP9 / VP8
  const av1Main = or(both('av01.0.08M.08'), { file: canPlay(webm('av01.0.08M.08')), hls: false })
  const av1Main10 = both('av01.0.12M.10').file || both('av01.0.12M.10').hls || canPlay(webm('av01.0.12M.10'))
  const vp9 = or(both('vp09.00.40.08'), { file: canPlay(webm('vp9')) || canPlay(webm('vp09.00.40.08')), hls: false })
  const vp9p2 = canPlay(webm('vp09.02.40.10')) || mseSupports(mp4('vp09.02.40.10'))
  const vp8: CodecSupport = { file: canPlay(webm('vp8')), hls: false }

  const sizes = async (contentType: string, supported: boolean) =>
    supported ? maxSize(contentType, kind) : { maxWidth: 0, maxHeight: 0 }

  const [h264Size, hevcSize, av1Size, vp9Size] = await Promise.all([
    sizes(mp4(avcHigh), h264Support.file || h264Support.hls),
    sizes(mp4('hvc1.1.6.L150.B0'), hevcMain.file || hevcMain.hls),
    sizes(mp4('av01.0.08M.08'), av1Main.file || av1Main.hls),
    sizes(mp4('vp09.00.40.08'), vp9.file || vp9.hls),
  ])

  // HDR: decoder support (decodingInfo with PQ/HLG + BT.2020) and an HDR display
  const display =
    typeof matchMedia === 'function' &&
    (matchMedia('(dynamic-range: high)').matches || matchMedia('(video-dynamic-range: high)').matches)
  const toneMapsToSdr = browserToneMapsHdr((globalThis.navigator as (Navigator & { userAgentData?: { brands?: Array<{ brand: string }>; mobile?: boolean } }) | undefined)?.userAgentData)
  const hevc10Type = mp4('hvc1.2.4.L153.B0')
  const av1_10Type = mp4('av01.0.12M.10')
  const [hevcPq, hevcHlg, av1Pq, av1Hlg, vp9Pq] = await Promise.all([
    hevcMain10.file || hevcMain10.hls ? hdrProbe(hevc10Type, kind, 'pq') : false,
    hevcMain10.file || hevcMain10.hls ? hdrProbe(hevc10Type, kind, 'hlg') : false,
    av1Main10 ? hdrProbe(av1_10Type, kind, 'pq') : false,
    av1Main10 ? hdrProbe(av1_10Type, kind, 'hlg') : false,
    vp9p2 ? hdrProbe(mp4('vp09.02.40.10'), kind, 'pq') : false,
  ])
  const dv = (codecs: string) => canPlay(mp4(codecs)) || mseSupports(mp4(codecs))

  const audio = (codecs: string, alt?: string): CodecSupport => {
    const a = both(codecs)
    if (!alt) return a
    return or(a, { file: canPlay(alt), hls: false })
  }

  // AC-3 / E-AC-3: asked by type, then confirmed with a real clip when the type check says yes
  const confirmed = async (claimed: CodecSupport, clip: 'ac3' | 'eac3') =>
    claimed.file || claimed.hls ? confirmDecode(claimed, await probePlayback(clip)) : claimed
  const [mkvProbe, ac3, eac3] = await Promise.all([probePlayback('mkv'), confirmed(audio('ac-3'), 'ac3'), confirmed(audio('ec-3'), 'eac3')])

  // Matroska: the clip decides the container; codecs inside it follow the file answers, narrowed by the
  // engine's own per-codec Matroska answers where it gives credible ones
  const mkvType = (codecs: string) => canPlay(`video/x-matroska; codecs="${codecs}"`)
  const mkvAnswers: MatroskaTypeAnswers = { bare: canPlay('video/x-matroska'), h264Aac: mkvType('avc1.42E01E, mp4a.40.2'), bogus: mkvType('bogus') }
  const mkv = matroskaSupported(mkvProbe, mkvAnswers)
  const inMkv = (file: boolean, ...codecs: string[]) => matroskaCodecSupported(mkv, file, mkvAnswers, codecs.some(mkvType))
  const aac = audio('mp4a.40.2')
  // Jellyfin's fMP4 segments declare MP3 as mp4a.40.34, which Chromium's MSE rejects (bufferAddCodecError)
  const mp3: CodecSupport = { file: canPlay(mp4('mp4a.69')) || canPlay('audio/mpeg'), hls: mseSupports(mp4('mp4a.40.34')) || nativeHlsPlays('mp4a.40.34') }
  const opus = audio('opus', 'audio/webm; codecs="opus"')
  const flac = audio('flac', 'audio/flac')
  const vorbis: CodecSupport = { file: canPlay('audio/webm; codecs="vorbis"') || canPlay('audio/ogg; codecs="vorbis"'), hls: false }

  return {
    mse,
    nativeHls,
    containers: {
      mp4: canPlay('video/mp4'),
      webm: canPlay('video/webm'),
      mov: canPlay('video/quicktime'),
      mkv,
    },
    matroska: {
      video: {
        h264: inMkv(h264Support.file, avcHigh, 'avc1.42E01E'),
        hevc: inMkv(hevcMain.file, 'hvc1.1.6.L120.B0', 'hev1.1.6.L120.B0'),
        av1: inMkv(av1Main.file, 'av01.0.08M.08'),
        vp9: inMkv(vp9.file, 'vp09.00.40.08', 'vp9'),
        vp8: inMkv(vp8.file, 'vp8'),
      },
      audio: {
        aac: inMkv(aac.file, 'mp4a.40.2'),
        mp3: inMkv(mp3.file, 'mp3', 'mp4a.69', 'mp4a.6B'),
        opus: inMkv(opus.file, 'opus'),
        flac: inMkv(flac.file, 'flac'),
        vorbis: inMkv(vorbis.file, 'vorbis'),
        ac3: inMkv(ac3.file, 'ac-3'),
        eac3: inMkv(eac3.file, 'ec-3'),
      },
    },
    audioTrackSelection: typeof document !== 'undefined' && !!(document.createElement('video') as unknown as { audioTracks?: unknown }).audioTracks,
    fmp4: mseSupports(mp4('avc1.42E01E,mp4a.40.2')) || nativeHls,
    video: {
      h264: { ...h264Support, tenBit: h264High10, level: avcLevel?.[1] ?? (h264Support.file || h264Support.hls ? 41 : 0), ...h264Size },
      hevc: { ...hevcMain, tenBit: hevcMain10.file || hevcMain10.hls, level: hevcLevel ?? 0, ...hevcSize },
      av1: { ...av1Main, tenBit: av1Main10, level: 0, ...av1Size },
      vp9: { ...vp9, tenBit: vp9p2, level: 0, ...vp9Size },
      vp8,
    },
    audio: {
      aac,
      mp3,
      opus,
      flac,
      vorbis,
      alac: audio('alac'),
      ac3,
      eac3,
      dts: or(audio('dtsc'), audio('dtsx')),
      truehd: audio('mlpa'),
    },
    hdr: {
      display,
      toneMapsToSdr,
      hevcHdr10: hdrPlayable(hevcPq, display, toneMapsToSdr),
      hevcHlg: hdrPlayable(hevcHlg, display, toneMapsToSdr),
      hevcDolbyVision: (dv('dvh1.05.06') || dv('dvhe.05.06')) && display,
      av1Hdr10: hdrPlayable(av1Pq, display, toneMapsToSdr),
      av1Hlg: hdrPlayable(av1Hlg, display, toneMapsToSdr),
      av1DolbyVision: dv('dav1.10.06') && display,
      vp9Hdr10: hdrPlayable(vp9Pq, display, toneMapsToSdr),
    },
  }
}

/** A capability set with nothing supported; the base for test fixtures. */
export function emptyCapabilities(): Capabilities {
  const v = (): VideoCodecCaps => ({ ...NONE, tenBit: false, level: 0, maxWidth: 0, maxHeight: 0 })
  return {
    mse: false,
    nativeHls: false,
    containers: { mp4: false, webm: false, mov: false, mkv: false },
    matroska: {
      video: { h264: false, hevc: false, av1: false, vp9: false, vp8: false },
      audio: { aac: false, mp3: false, opus: false, flac: false, vorbis: false, ac3: false, eac3: false },
    },
    audioTrackSelection: false,
    fmp4: false,
    video: { h264: v(), hevc: v(), av1: v(), vp9: v(), vp8: { ...NONE } },
    audio: {
      aac: { ...NONE },
      mp3: { ...NONE },
      opus: { ...NONE },
      flac: { ...NONE },
      vorbis: { ...NONE },
      alac: { ...NONE },
      ac3: { ...NONE },
      eac3: { ...NONE },
      dts: { ...NONE },
      truehd: { ...NONE },
    },
    hdr: {
      display: false,
      toneMapsToSdr: false,
      hevcHdr10: false,
      hevcHlg: false,
      hevcDolbyVision: false,
      av1Hdr10: false,
      av1Hlg: false,
      av1DolbyVision: false,
      vp9Hdr10: false,
    },
  }
}
