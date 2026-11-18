import type { DeviceProfile } from '@jellyfin/sdk/lib/generated-client/models'
import { describe, expect, it } from 'vitest'
import { PREFERENCE_DEFAULTS } from '../../../stores/preferences'
import { emptyCapabilities, type Capabilities } from './capabilities'
import {
  buildDeviceProfile,
  getHdrRangeTypesFor,
  isTenEleven,
  profileOptionsFromPrefs,
  VideoRangeTypes as R,
  type ProfileOptions,
} from './deviceProfile'

const on = { file: true, hls: true }

/** Typical desktop Chromium on Windows with a hardware HEVC decoder and an SDR display. */
function chromium(): Capabilities {
  const c = emptyCapabilities()
  c.mse = true
  c.fmp4 = true
  c.containers = { mp4: true, webm: true, mov: false, mkv: false }
  c.video.h264 = { ...on, tenBit: false, level: 52, maxWidth: 3840, maxHeight: 2160 }
  c.video.hevc = { ...on, tenBit: true, level: 183, maxWidth: 7680, maxHeight: 4320 }
  c.video.av1 = { ...on, tenBit: true, level: 0, maxWidth: 3840, maxHeight: 2160 }
  c.video.vp9 = { ...on, tenBit: true, level: 0, maxWidth: 3840, maxHeight: 2160 }
  c.video.vp8 = { file: true, hls: false }
  c.audio.aac = { ...on }
  c.audio.mp3 = { ...on }
  c.audio.opus = { ...on }
  c.audio.flac = { ...on }
  c.audio.vorbis = { file: true, hls: false }
  return c
}

/** The same browser after the Matroska probe clip played: every codec it plays from a file also plays in Matroska. */
function withMatroska(c: Capabilities): Capabilities {
  c.containers.mkv = true
  c.matroska = {
    video: { h264: c.video.h264.file, hevc: c.video.hevc.file, av1: c.video.av1.file, vp9: c.video.vp9.file, vp8: c.video.vp8.file },
    audio: {
      aac: c.audio.aac.file,
      mp3: c.audio.mp3.file,
      opus: c.audio.opus.file,
      flac: c.audio.flac.file,
      vorbis: c.audio.vorbis.file,
      ac3: c.audio.ac3.file,
      eac3: c.audio.eac3.file,
    },
  }
  return c
}

/** Firefox without HEVC. */
function firefox(): Capabilities {
  const c = chromium()
  c.video.hevc = { file: false, hls: false, tenBit: false, level: 0, maxWidth: 0, maxHeight: 0 }
  return c
}

/** Safari: native HLS, mov, AC3/EAC3, HEVC, HDR display with Dolby Vision. */
function safari(): Capabilities {
  const c = chromium()
  c.nativeHls = true
  c.containers.mov = true
  c.video.av1 = { file: false, hls: false, tenBit: false, level: 0, maxWidth: 0, maxHeight: 0 }
  c.audio.ac3 = { ...on }
  c.audio.eac3 = { ...on }
  c.audio.alac = { ...on }
  c.hdr = { ...c.hdr, display: true, hevcHdr10: true, hevcHlg: true, hevcDolbyVision: true }
  return c
}

const opts = (o: Partial<ProfileOptions> = {}): ProfileOptions => ({
  maxBitrate: 104857600,
  maxResolution: 0,
  ac3Supported: true,
  downMixStereo: false,
  assMode: 'ASS_LIBASS',
  pgsRender: true,
  preferAc3ForSurround: false,
  jellyfinTenEleven: true,
  forceEnabledHdr: new Set(),
  forceDisabledHdr: new Set(),
  ...o,
})

function rangeExclusions(p: DeviceProfile, codec: string): Set<string> {
  const cp = p.CodecProfiles?.find((x) => x.Codec === codec && x.ApplyConditions?.some((a) => a.Property === 'VideoRangeType'))
  return new Set(cp?.ApplyConditions?.[0].Value?.split('|') ?? [])
}

describe('buildDeviceProfile', () => {
  it('Chromium: mp4/webm direct play, MKV not listed, fMP4 HLS with HEVC first', () => {
    const p = buildDeviceProfile(chromium(), opts())
    expect(p.Name).toBe('Wholphin-Web')
    expect(p.MaxStaticBitrate).toBe(104857600)
    const mp4 = p.DirectPlayProfiles?.find((d) => d.Container?.startsWith('mp4'))
    expect(mp4?.VideoCodec).toBe('h264,hevc,av1,vp9')
    expect(mp4?.AudioCodec).toBe('aac,flac,mp3,opus')
    expect(p.DirectPlayProfiles?.some((d) => d.Container?.includes('mkv'))).toBe(false)
    const webm = p.DirectPlayProfiles?.find((d) => d.Container === 'webm')
    expect(webm?.AudioCodec).toBe('opus,vorbis')
    const t = p.TranscodingProfiles?.[0]
    expect(t).toMatchObject({ Protocol: 'hls', Container: 'mp4', VideoCodec: 'hevc,h264,av1,vp9', EnableSubtitlesInManifest: false })
    expect(t?.AudioCodec?.split(',')[0]).toBe('aac')
    // TS fallback for live TV (UseMostCompatibleTranscodingProfile)
    expect(p.TranscodingProfiles?.[1]).toMatchObject({ Type: 'Video', Protocol: 'hls', Container: 'ts', VideoCodec: 'h264', AudioCodec: 'aac,mp3' })
    expect(p.TranscodingProfiles?.[2]).toMatchObject({ Type: 'Audio' })
  })

  it('Firefox without HEVC blocks hevc and transcodes to h264', () => {
    const p = buildDeviceProfile(firefox(), opts())
    expect(p.TranscodingProfiles?.[0].VideoCodec).toBe('h264,av1,vp9')
    const hevc = p.CodecProfiles?.find((c) => c.Codec === 'hevc' && c.Conditions?.[0].Property === 'VideoProfile')
    expect(hevc?.Conditions?.[0]).toMatchObject({ Condition: 'Equals', Value: 'none' })
  })

  it('Safari lists mov, AC3/EAC3 and keeps HDR10/DV for HEVC', () => {
    const p = buildDeviceProfile(safari(), opts())
    const mp4 = p.DirectPlayProfiles?.find((d) => d.Container?.startsWith('mp4'))
    expect(mp4?.Container).toBe('mp4,m4v,mov')
    expect(mp4?.AudioCodec?.split(',')).toEqual(expect.arrayContaining(['ac3', 'eac3', 'alac']))
    const ex = rangeExclusions(p, 'hevc')
    expect(ex.has(R.HDR10)).toBe(false)
    expect(ex.has(R.DOVI)).toBe(false)
    expect(ex.has(R.DOVI_WITH_EL)).toBe(true)
    expect(ex.has(R.DOVI_INVALID)).toBe(true)
  })

  it('ac3Supported=false drops ac3/eac3; downmix keeps aac/mp3 and caps channels at 2', () => {
    const noAc3 = buildDeviceProfile(safari(), opts({ ac3Supported: false }))
    expect(noAc3.DirectPlayProfiles?.[0].AudioCodec).not.toMatch(/ac3/)
    const down = buildDeviceProfile(safari(), opts({ downMixStereo: true }))
    expect(down.DirectPlayProfiles?.[0].AudioCodec).toBe('aac,mp3')
    const ch = down.CodecProfiles?.find((c) => c.Type === 'VideoAudio' && !c.Codec)
    expect(ch?.Conditions?.[0].Value).toBe('2')
    expect(down.TranscodingProfiles?.[0].MaxAudioChannels).toBe('2')
    const full = buildDeviceProfile(safari(), opts())
    expect(full.CodecProfiles?.find((c) => c.Type === 'VideoAudio' && !c.Codec)?.Conditions?.[0].Value).toBe('8')
  })

  it('max resolution limits transcodes, clamps codec maxima and adds mpeg/vp9 height caps', () => {
    const p = buildDeviceProfile(chromium(), opts({ maxResolution: 1080 }))
    expect(p.TranscodingProfiles?.[0].Conditions?.[0]).toMatchObject({ Property: 'Height', Value: '1080' })
    const h264 = p.CodecProfiles?.find((c) => c.Codec === 'h264' && c.Conditions?.some((x) => x.Property === 'Width'))
    expect(h264?.Conditions?.map((x) => x.Value)).toEqual(['3840', '1080'])
    expect(p.CodecProfiles?.some((c) => c.Codec === 'vp9' && c.Conditions?.[0].Property === 'Height')).toBe(true)
  })

  it('SDR display excludes every HDR range type for HEVC and AV1', () => {
    const p = buildDeviceProfile(chromium(), opts())
    for (const codec of ['hevc', 'av1']) {
      const ex = rangeExclusions(p, codec)
      for (const r of [R.HDR10, R.HDR10_PLUS, R.DOVI, R.DOVI_WITH_HDR10, R.DOVI_WITH_HDR10_PLUS, R.DOVI_INVALID]) expect(ex.has(r)).toBe(true)
      const cp = p.CodecProfiles?.find((x) => x.Codec === codec && x.ApplyConditions?.[0]?.Property === 'VideoRangeType')
      expect(cp?.Conditions?.[0].Condition).toBe('NotEquals')
    }
  })

  it('SDR display with a browser that tone-maps: HDR10 and Dolby Vision over an HDR10 base stay in the browser, profile 5 does not', () => {
    const c = chromium()
    // capabilities.ts: decoder takes PQ, display is SDR, desktop Chromium tone-maps
    c.hdr = { ...c.hdr, display: false, toneMapsToSdr: true, hevcHdr10: true, hevcHlg: true, av1Hdr10: true, av1Hlg: true }
    const ex = rangeExclusions(buildDeviceProfile(c, opts()), 'hevc')
    for (const r of [R.HDR10, R.HDR10_PLUS, R.DOVI_WITH_HDR10, R.DOVI_WITH_HDR10_PLUS]) expect(ex.has(r)).toBe(false)
    for (const r of [R.DOVI, R.DOVI_WITH_EL, R.DOVI_INVALID]) expect(ex.has(r)).toBe(true)
    expect(rangeExclusions(buildDeviceProfile(c, opts()), 'av1').has(R.HDR10)).toBe(false)
    // "HDR10: Disable" in the settings still hands it to the server
    const forced = rangeExclusions(buildDeviceProfile(c, opts({ forceDisabledHdr: new Set([R.HDR10]) })), 'hevc')
    expect(forced.has(R.HDR10)).toBe(true)
  })

  it('pre-10.11 servers get no 10.11-only range types', () => {
    const p = buildDeviceProfile(chromium(), opts({ jellyfinTenEleven: false }))
    const ex = rangeExclusions(p, 'hevc')
    expect(ex.has(R.DOVI_INVALID)).toBe(false)
    expect(ex.has(R.DOVI_WITH_EL)).toBe(false)
    expect(ex.has(R.DOVI_WITH_HDR10_PLUS)).toBe(false)
  })

  // TestDeviceProfileUtils.kt
  it('HEVC profile 7 unsupported unless force-enabled; force-disable wins over support', () => {
    expect(rangeExclusions(buildDeviceProfile(safari(), opts()), 'hevc').has(R.DOVI_WITH_EL)).toBe(true)
    const enabled = buildDeviceProfile(safari(), opts({ forceEnabledHdr: new Set([R.DOVI_WITH_EL, R.DOVI_WITH_EL_HDR10_PLUS]) }))
    expect(rangeExclusions(enabled, 'hevc').has(R.DOVI_WITH_EL)).toBe(false)
    const disabled = buildDeviceProfile(safari(), opts({ forceDisabledHdr: new Set([R.DOVI]) }))
    expect(rangeExclusions(disabled, 'hevc').has(R.DOVI)).toBe(true)
  })

  it('AV1 profile 5 unsupported unless force-enabled', () => {
    expect(rangeExclusions(buildDeviceProfile(chromium(), opts()), 'av1').has(R.DOVI)).toBe(true)
    const enabled = buildDeviceProfile(chromium(), opts({ forceEnabledHdr: new Set([R.DOVI]) }))
    expect(rangeExclusions(enabled, 'av1').has(R.DOVI)).toBe(false)
  })

  it('ASS mode selects External or burn-in; DVD and DVB image formats always burn in', () => {
    const lib = buildDeviceProfile(chromium(), opts())
    expect(lib.SubtitleProfiles).toContainEqual({ Format: 'ass', Method: 'External' })
    for (const f of ['dvdsub', 'dvbsub', 'idx']) {
      expect(lib.SubtitleProfiles).toContainEqual({ Format: f, Method: 'Encode' })
      // Jellyfin answers "External" for dvdsub with a URL that returns 404: never ask for it
      expect(lib.SubtitleProfiles?.some((s) => s.Format === f && s.Method !== 'Encode')).toBe(false)
    }
    const burn = buildDeviceProfile(chromium(), opts({ assMode: 'ASS_TRANSCODE' }))
    expect(burn.SubtitleProfiles?.some((s) => s.Format === 'ass' && s.Method === 'External')).toBe(false)
    expect(burn.SubtitleProfiles?.some((s) => s.Method === 'Embed' || s.Method === 'Hls')).toBe(false)
  })

  it('PGS is delivered External for the canvas renderer, before the burn-in entry; off with "Direct play PGS"', () => {
    const subs = buildDeviceProfile(chromium(), opts()).SubtitleProfiles ?? []
    const at = (format: string, method: string) => subs.findIndex((s) => s.Format === format && s.Method === method)
    for (const f of ['pgssub', 'pgs']) {
      expect(at(f, 'External')).toBeGreaterThanOrEqual(0)
      // the server takes the first profile that fits, so External must come first; Encode stays as its fallback
      expect(at(f, 'Encode')).toBeGreaterThan(at(f, 'External'))
    }
    const off = buildDeviceProfile(chromium(), opts({ pgsRender: false })).SubtitleProfiles ?? []
    expect(off.some((s) => /^pgs/.test(s.Format ?? '') && s.Method === 'External')).toBe(false)
    expect(off).toContainEqual({ Format: 'pgssub', Method: 'Encode' })
  })

  it('Matroska is a direct-play container only where the probe clip played, with the codecs that play inside it', () => {
    const mkvOf = (c: Capabilities, o = opts()) => buildDeviceProfile(c, o).DirectPlayProfiles?.find((d) => d.Container === 'mkv')
    // Safari, or any engine whose probe failed
    expect(mkvOf(chromium())).toBeUndefined()
    // Chrome without AC-3 decoders: video codecs it decodes, audio it decodes; DTS and TrueHD never
    const chrome = withMatroska(chromium())
    expect(mkvOf(chrome)).toEqual({ Type: 'Video', Container: 'mkv', VideoCodec: 'h264,hevc,av1,vp9,vp8', AudioCodec: 'aac,flac,mp3,opus,vorbis' })
    // the mp4 entry stays first and unchanged
    expect(buildDeviceProfile(chrome, opts()).DirectPlayProfiles?.[0].Container).toBe('mp4,m4v')
    // Edge on a Windows with the Dolby decoder
    const edge = withMatroska(chromium())
    edge.audio.ac3 = { ...on }
    edge.audio.eac3 = { ...on }
    edge.matroska.audio.ac3 = true
    edge.matroska.audio.eac3 = true
    expect(mkvOf(edge)?.AudioCodec).toBe('aac,ac3,eac3,flac,mp3,opus,vorbis')
    // the "AC3 supported" switch and stereo downmix apply inside Matroska too
    expect(mkvOf(edge, opts({ ac3Supported: false }))?.AudioCodec).toBe('aac,flac,mp3,opus,vorbis')
    expect(mkvOf(edge, opts({ downMixStereo: true }))?.AudioCodec).toBe('aac,mp3')
    // Firefox: Matroska plays, but not every codec inside it (no HEVC decoder, FLAC and MP3 in Matroska refused)
    const ff = withMatroska(firefox())
    ff.matroska.audio.flac = false
    ff.matroska.audio.mp3 = false
    expect(mkvOf(ff)).toMatchObject({ VideoCodec: 'h264,av1,vp9,vp8', AudioCodec: 'aac,opus,vorbis' })
    // a container that plays with no video codec the element decodes is not listed
    const none = withMatroska(chromium())
    none.matroska.video = { h264: false, hevc: false, av1: false, vp9: false, vp8: false }
    expect(mkvOf(none)).toBeUndefined()
  })

  it('the second audio track of a file needs the server unless the element can switch tracks (IsSecondaryAudio)', () => {
    const cond = (c: Capabilities) =>
      buildDeviceProfile(c, opts()).CodecProfiles?.find((p) => p.Type === 'VideoAudio' && !p.Codec)?.Conditions ?? []
    // Chromium, Firefox: no audioTracks API
    expect(cond(chromium())).toContainEqual({ Condition: 'Equals', Property: 'IsSecondaryAudio', Value: 'false', IsRequired: false })
    expect(cond(chromium())[0]).toMatchObject({ Property: 'AudioChannels', Value: '8' })
    // Safari switches in place
    const s = safari()
    s.audioTrackSelection = true
    expect(cond(s).some((x) => x.Property === 'IsSecondaryAudio')).toBe(false)
  })

  it('an unsupported audio codec leaves the video to be copied: the HLS profile lists every decodable video codec', () => {
    const t = buildDeviceProfile(withMatroska(chromium()), opts()).TranscodingProfiles?.[0]
    // video the browser decodes is copied into fMP4 untouched; audio it decodes is copied, anything else becomes AAC
    expect(t).toMatchObject({ Container: 'mp4', Protocol: 'hls', VideoCodec: 'hevc,h264,av1,vp9' })
    expect(t?.AudioCodec).toBe('aac,flac,mp3,opus')
    // with an AC-3 decoder (Edge with the Dolby codec, Safari) AC-3 and E-AC-3 are copied too
    const edge = chromium()
    edge.audio.ac3 = { ...on }
    edge.audio.eac3 = { ...on }
    expect(buildDeviceProfile(edge, opts()).TranscodingProfiles?.[0].AudioCodec).toBe('aac,ac3,eac3,flac,mp3,opus')
  })

  it('without fMP4 support falls back to TS with h264/aac', () => {
    const c = firefox()
    c.fmp4 = false
    const t = buildDeviceProfile(c, opts()).TranscodingProfiles?.[0]
    expect(t?.Container).toBe('ts')
    expect(t?.VideoCodec).toBe('h264')
    expect(t?.AudioCodec).toBe('aac,mp3')
  })

  it('preferAc3ForSurround transcodes audio to AC3 and limits other codecs to stereo', () => {
    const p = buildDeviceProfile(safari(), opts({ preferAc3ForSurround: true }))
    expect(p.TranscodingProfiles?.[0].AudioCodec).toBe('ac3')
    expect(p.CodecProfiles?.some((c) => c.Type === 'VideoAudio' && c.Codec === 'aac')).toBe(true)
  })
})

describe('preferences mapping', () => {
  it('HDR override sets follow HdrFormat (spec 08 PB-1)', () => {
    const prefs = { ...PREFERENCE_DEFAULTS, doviProfile7Override: 'HDR_OVERRIDE_ENABLE' as const, doviProfile8Override: 'HDR_OVERRIDE_DISABLE' as const }
    expect([...getHdrRangeTypesFor(prefs, 'HDR_OVERRIDE_ENABLE', true)]).toEqual([R.DOVI_WITH_EL, R.DOVI_WITH_EL_HDR10_PLUS])
    expect([...getHdrRangeTypesFor(prefs, 'HDR_OVERRIDE_ENABLE', false)]).toEqual([])
    expect([...getHdrRangeTypesFor(prefs, 'HDR_OVERRIDE_DISABLE', true)]).toEqual([R.DOVI_WITH_HDR10, R.DOVI_WITH_HDR10_PLUS])
    expect([...getHdrRangeTypesFor(prefs, 'HDR_OVERRIDE_DISABLE', false)]).toEqual([R.DOVI_WITH_HDR10])
  })

  it('options derive from preferences', () => {
    const o = profileOptionsFromPrefs({ ...PREFERENCE_DEFAULTS, maxResolution: 'FULL_HD', preferAc3ForSurround: true }, '10.11.2')
    expect(o.maxResolution).toBe(1080)
    expect(o.jellyfinTenEleven).toBe(true)
    // experimental prefs are gated by experimentalEnable
    expect(o.preferAc3ForSurround).toBe(false)
    // "Direct play PGS" (default on) decides between the canvas renderer and burn-in
    expect(o.pgsRender).toBe(true)
    expect(profileOptionsFromPrefs({ ...PREFERENCE_DEFAULTS, directPlayPgs: false }, '10.11.2').pgsRender).toBe(false)
    expect(isTenEleven('10.10.7')).toBe(false)
    expect(isTenEleven('11.0.0')).toBe(true)
  })
})
