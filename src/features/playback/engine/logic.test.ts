// Pure engine logic: segments (T/ui/playback/PlaybackViewModelTests.kt "Media segments"), next up / end of item
// (same file, "Show next up ..."), trickplay math, fallback ladder, seek acceleration (SeekAccelerationTest.kt),
// track mapping (TrackSelectionUtils), PlaybackInfo body/URL, subtitle parsing.
import type { MediaSegmentDto, MediaSourceInfo, PlaybackInfoResponse } from '@jellyfin/sdk/lib/generated-client/models'
import { describe, expect, it } from 'vitest'
import { PREFERENCE_DEFAULTS } from '../../../stores/preferences'
import { BITRATE_VALUES } from './constants'
import { describePath, initialLadder, isVideoCopy, restartFlags, stepDown, transcodeReasons } from './fallback'
import { endOfItemAction, nextUpCountdownStart, previousAction, shouldAutoPlayNextUp } from './nextUp'
import { buildPlaybackInfoDto, resolvePlaybackInfo } from './playbackInfo'
import { calculateSeekAccelerationMultiplier } from './seekAcceleration'
import { evaluateSegments, type SegmentPrefs } from './segments'
import { activeCues, parseAssAsText, parseJsonTrackEvents, parseVtt } from './subtitles/cues'
import { containedVideoRect, RAISED_BY, RAISED_SHIFT, rgba, subtitleBottomMargin, subtitleStyle } from './subtitles/style'
import { createTrackSelections, getPlayerIndex, sortById, type PlayerTrack } from './trackSelection'
import { pickTrickplayInfo, trickplaySheetCount, trickplayTile } from './trickplay'
import { FrameWatchdogState } from './watchdog'

const T = 10_000
const seg = (id: string, type: MediaSegmentDto['Type'], startS: number, endS: number, itemId = 'item'): MediaSegmentDto => ({
  Id: id,
  ItemId: itemId,
  Type: type,
  StartTicks: startS * 1000 * T,
  EndTicks: endS * 1000 * T,
})
const segPrefs = (o: Partial<SegmentPrefs> = {}): SegmentPrefs => ({
  skipIntros: 'ASK_TO_SKIP',
  skipOutros: 'ASK_TO_SKIP',
  skipCommercials: 'ASK_TO_SKIP',
  skipPreviews: 'IGNORE',
  skipRecaps: 'IGNORE',
  showNextUpTiming: 'END_OF_PLAYBACK',
  ...o,
})

describe('media segments', () => {
  const intro = seg('intro', 'Intro', 5, 20)
  const base = { segments: [intro], itemId: 'item', hasNext: true, nextIsMedia: true, handled: new Set<string>(), outroShown: new Set<string>() }

  it('auto skip seeks once to end + 1 ms and shows no button', () => {
    const r = evaluateSegments({ ...base, positionMs: 5500, prefs: segPrefs({ skipIntros: 'AUTO_SKIP' }) })
    expect(r.seekToMs).toBe(20_001)
    expect(r.markHandled).toBe('intro')
    expect(r.state).toEqual({ segment: intro, interacted: true })
    const again = evaluateSegments({ ...base, handled: new Set(['intro']), positionMs: 5600, prefs: segPrefs({ skipIntros: 'AUTO_SKIP' }) })
    expect(again.seekToMs).toBeUndefined()
  })

  it('ask to skip shows the button until handled; seeking back re-shows only if never handled', () => {
    const r = evaluateSegments({ ...base, positionMs: 5500, prefs: segPrefs() })
    expect(r.state).toEqual({ segment: intro, interacted: false })
    expect(r.seekToMs).toBeUndefined()
    const handled = evaluateSegments({ ...base, handled: new Set(['intro']), positionMs: 6000, prefs: segPrefs() })
    expect(handled.state).toEqual({ segment: intro, interacted: true })
  })

  it('ignore, unknown type, outside any segment and foreign item', () => {
    expect(evaluateSegments({ ...base, positionMs: 5500, prefs: segPrefs({ skipIntros: 'IGNORE' }) }).state).toBeNull()
    expect(evaluateSegments({ ...base, segments: [seg('u', 'Unknown', 0, 100)], positionMs: 5500, prefs: segPrefs() }).state).toBeNull()
    expect(evaluateSegments({ ...base, positionMs: 25_000, prefs: segPrefs() }).state).toBeNull()
    expect(evaluateSegments({ ...base, segments: [seg('x', 'Intro', 0, 30, 'other')], positionMs: 5500, prefs: segPrefs() }).state).toBe('keep')
  })

  it('end is exclusive', () => {
    expect(evaluateSegments({ ...base, positionMs: 20_000, prefs: segPrefs() }).state).toBeNull()
  })

  it('outro during credits opens next up once and skips the skip evaluation that tick', () => {
    const outro = seg('outro', 'Outro', 100, 120)
    const p = segPrefs({ showNextUpTiming: 'DURING_CREDITS', skipOutros: 'AUTO_SKIP' })
    const r = evaluateSegments({ ...base, segments: [outro], positionMs: 101_000, prefs: p })
    expect(r).toEqual({ state: 'keep', markOutroShown: 'outro', showNextUp: true })
    const later = evaluateSegments({ ...base, segments: [outro], outroShown: new Set(['outro']), positionMs: 102_000, prefs: p })
    expect(later.seekToMs).toBe(120_001)
    // next entry is an intro: recorded, but no panel
    expect(evaluateSegments({ ...base, nextIsMedia: false, segments: [outro], positionMs: 101_000, prefs: p }).showNextUp).toBe(false)
    // no next entry: plain skip behaviour
    expect(evaluateSegments({ ...base, hasNext: false, segments: [outro], positionMs: 101_000, prefs: p }).seekToMs).toBe(120_001)
  })
})

describe('end of item / next up', () => {
  const prefs = (o: Partial<typeof PREFERENCE_DEFAULTS> = {}) => ({ ...PREFERENCE_DEFAULTS, ...o })

  it('show next up at end of playback', () => {
    expect(endOfItemAction('media', 'media', prefs(), true)).toBe('show-next-up')
  })
  it('never + autoplay plays the next entry (upstream only showed controls)', () => {
    expect(endOfItemAction('media', 'media', prefs({ showNextUpTiming: 'NEXT_UP_NEVER', autoPlayNextUp: true }), true)).toBe('play-next')
    expect(endOfItemAction('media', 'media', prefs({ showNextUpTiming: 'NEXT_UP_NEVER', autoPlayNextUp: true }), false)).toBe('show-controls')
  })
  it('never without autoplay leaves', () => {
    expect(endOfItemAction('media', 'media', prefs({ showNextUpTiming: 'NEXT_UP_NEVER', autoPlayNextUp: false }), false)).toBe('exit')
  })
  it('no next entry leaves; intros always continue', () => {
    expect(endOfItemAction(null, 'media', prefs(), true)).toBe('exit')
    expect(endOfItemAction('media', 'intro', prefs({ showNextUpTiming: 'NEXT_UP_NEVER', autoPlayNextUp: false }), false)).toBe('play-next')
    expect(endOfItemAction('intro', 'media', prefs(), false)).toBe('play-next')
  })
  it('pass-out protection', () => {
    const p = prefs({ passOutProtection: 2 * 3600_000 })
    expect(shouldAutoPlayNextUp(p, 0, 3600_000)).toBe(true)
    expect(shouldAutoPlayNextUp(p, 0, 3 * 3600_000)).toBe(false)
    expect(shouldAutoPlayNextUp(prefs({ passOutProtection: 0 }), 0, 1e12)).toBe(true)
    expect(shouldAutoPlayNextUp(prefs({ autoPlayNextUp: false }), 0, 1)).toBe(false)
  })
  it('countdown and previous rules', () => {
    expect(nextUpCountdownStart(prefs({ autoPlayNextDelay: 15 }), true)).toBe(15)
    expect(nextUpCountdownStart(prefs(), false)).toBeNull()
    expect(previousAction(2000, true)).toBe('previous-item')
    expect(previousAction(4000, true)).toBe('restart')
    expect(previousAction(1000, false)).toBe('restart')
  })
})

describe('trickplay', () => {
  const info = { Width: 320, Height: 180, TileWidth: 10, TileHeight: 10, Interval: 10_000, ThumbnailCount: 250 }
  it('tile math', () => {
    expect(trickplayTile(info, 0)).toMatchObject({ index: 0, sheet: 0, col: 0, row: 0, x: 0, y: 0, width: 320, height: 180, sheetWidth: 3200 })
    expect(trickplayTile(info, 125_000)).toMatchObject({ index: 12, sheet: 0, col: 2, row: 1, x: 640, y: 180 })
    expect(trickplayTile(info, 1_234_000)).toMatchObject({ index: 123, sheet: 1, col: 3, row: 2 })
    // clamps to the last thumbnail
    expect(trickplayTile(info, 99_999_999)?.index).toBe(249)
    expect(trickplayTile({ ...info, Interval: 0 }, 1000)).toBeNull()
  })
  it('sheet count and first width per source', () => {
    expect(trickplaySheetCount(info, 2_500_000)).toBe(3)
    const map = { 'AB-cd': { '320': info, '640': { ...info, Width: 640 } } }
    expect(pickTrickplayInfo(map, 'abcd')?.Width).toBe(320)
    expect(pickTrickplayInfo(map, 'zz')).toBeNull()
  })
})

describe('fallback ladder', () => {
  it('direct play -> direct stream -> transcode -> error, never looping', () => {
    let l = initialLadder(false)
    expect(restartFlags(l)).toEqual({ enableDirectPlay: true, enableDirectStream: true })
    l = stepDown(l, { method: 'DirectPlay', reason: 'no-frames' })!
    expect(restartFlags(l)).toEqual({ enableDirectPlay: false, enableDirectStream: true })
    l = stepDown(l, { method: 'DirectStream', reason: 'media-error' })!
    expect(restartFlags(l)).toEqual({ enableDirectPlay: false, enableDirectStream: false })
    expect(stepDown(l, { method: 'Transcode', reason: 'media-error' })).toBeNull()
    expect(describePath(l, 'Transcode')).toBe('DirectPlay (no-frames) -> DirectStream (media-error) -> Transcode')
  })
  it('flags only go down, so repeated failures always end', () => {
    let l: ReturnType<typeof stepDown> = initialLadder(false)
    let steps = 0
    while (l && steps < 10) {
      l = stepDown(l, { method: 'DirectPlay', reason: 'x' })
      steps++
    }
    expect(steps).toBe(3)
  })
  it('a remux reported as Transcode drops stream copy before giving up', () => {
    const l = stepDown(initialLadder(false), { method: 'Transcode', reason: 'media-error' })!
    expect(restartFlags(l)).toEqual({ enableDirectPlay: false, enableDirectStream: false })
    expect(stepDown(l, { method: 'Transcode', reason: 'media-error' })).toBeNull()
  })
  it('transcode reasons tell a remux from a video transcode', () => {
    const url = '/videos/x/master.m3u8?VideoCodec=h264&TranscodeReasons=ContainerNotSupported,AudioCodecNotSupported'
    expect(transcodeReasons(url)).toEqual(['ContainerNotSupported', 'AudioCodecNotSupported'])
    expect(isVideoCopy(transcodeReasons(url))).toBe(true)
    expect(isVideoCopy(['ContainerNotSupported', 'VideoCodecNotSupported'])).toBe(false)
    expect(isVideoCopy([])).toBe(false)
  })
  it('a forced transcode never re-enables direct play on track changes', () => {
    const l = initialLadder(true)
    expect(restartFlags(l)).toEqual({ enableDirectPlay: false, enableDirectStream: false })
    expect(stepDown(l, { method: 'Transcode', reason: 'x' })).toBeNull()
  })
  it('direct stream answered for a direct-play request skips straight to transcode', () => {
    const l = stepDown(initialLadder(false), { method: 'DirectStream', reason: 'media-error' })!
    expect(restartFlags(l)).toEqual({ enableDirectPlay: false, enableDirectStream: false })
  })
})

describe('watchdog', () => {
  const s = (t: number, frames: number, o: Partial<{ paused: boolean; hidden: boolean; videoWidth: number }> = {}) => ({
    currentTime: t,
    frames,
    paused: false,
    hidden: false,
    videoWidth: 1280,
    readyState: 4,
    ...o,
  })
  it('fires when time advances without frames', () => {
    const w = new FrameWatchdogState()
    expect(w.sample(s(0, 0))).toBeNull()
    expect(w.sample(s(2, 0))).toBeNull()
    expect(w.sample(s(4.2, 0))).toBe('no-frames')
    expect(w.sample(s(9, 0))).toBeNull()
  })
  it('reports missing video size, mid-stream stalls, and ignores paused/hidden time', () => {
    const a = new FrameWatchdogState()
    a.sample(s(0, 0, { videoWidth: 0 }))
    expect(a.sample(s(5, 0, { videoWidth: 0 }))).toBe('no-video-size')
    const b = new FrameWatchdogState()
    b.sample(s(0, 0))
    b.sample(s(1, 24))
    expect(b.sample(s(5, 24))).toBeNull()
    expect(b.sample(s(7.5, 24))).toBe('frames-stalled')
    const c = new FrameWatchdogState()
    c.sample(s(0, 0))
    expect(c.sample(s(10, 0, { hidden: true }))).toBeNull()
    expect(c.sample(s(11, 0))).toBeNull()
    expect(c.sample(s(13, 30))).toBeNull()
  })
})

describe('seek acceleration (SeekAccelerationTest.kt)', () => {
  it('matches upstream tiers', () => {
    expect(calculateSeekAccelerationMultiplier(0, 30_000)).toBe(1)
    expect(calculateSeekAccelerationMultiplier(89, 0)).toBe(1)
    expect(calculateSeekAccelerationMultiplier(300, -1)).toBe(1)
    const short = 20 * 60_000
    expect(calculateSeekAccelerationMultiplier(89, short)).toBe(1)
    expect(calculateSeekAccelerationMultiplier(90, short)).toBe(2)
    const medium = 60 * 60_000
    expect(calculateSeekAccelerationMultiplier(38, medium)).toBe(1)
    expect(calculateSeekAccelerationMultiplier(39, medium)).toBe(2)
    expect(calculateSeekAccelerationMultiplier(150, medium)).toBe(3)
    expect(calculateSeekAccelerationMultiplier(225, medium)).toBe(4)
  })
})

describe('track selection (TrackSelectionUtils)', () => {
  const source: MediaSourceInfo = {
    MediaStreams: [
      { Type: 'Video', Index: 0 },
      { Type: 'Audio', Index: 1 },
      { Type: 'Audio', Index: 2 },
      { Type: 'Audio', Index: 3 },
      { Type: 'Subtitle', Index: 4, DeliveryMethod: 'Embed' },
      { Type: 'Subtitle', Index: 5, DeliveryMethod: 'External', IsExternal: false },
      { Type: 'Subtitle', Index: 6, DeliveryMethod: 'Embed' },
    ],
  }
  const tracks: PlayerTrack[] = [
    { id: '4', type: 'audio', external: false, supported: true },
    { id: '2', type: 'audio', external: false, supported: true },
    { id: '3', type: 'audio', external: true, supported: true },
    { id: '0:6', type: 'text', external: false, supported: true },
    { id: '0:5', type: 'text', external: false, supported: true },
    { id: '1:e:0', type: 'text', external: true, supported: true },
  ]
  it('player index counts only same-type streams (and EMBED/HLS subtitles)', () => {
    expect(getPlayerIndex(2, source, 'Audio')).toBe(1)
    expect(getPlayerIndex(6, source, 'Subtitle')).toBe(1)
    expect(getPlayerIndex(5, source, 'Subtitle')).toBeNull()
  })
  it('sorts by numeric id parts, externals last', () => {
    expect(sortById(tracks.filter((t) => t.type === 'audio')).map((t) => t.id)).toEqual(['2', '4', '3'])
    expect(sortById(tracks.filter((t) => t.type === 'text')).map((t) => t.id)).toEqual(['0:5', '0:6', '1:e:0'])
  })
  it('maps server indexes to player tracks; externals select the external group', () => {
    const r = createTrackSelections(tracks, 2, 6, source)
    expect(r.audio).toBe('SELECTED')
    expect(r.audioTrack?.id).toBe('4')
    expect(r.textTrack?.id).toBe('0:6')
    const ext = createTrackSelections(tracks, 1, 5, source)
    expect(ext.textTrack?.id).toBe('1:e:0')
    const off = createTrackSelections(tracks, -2, -2, source)
    expect(off.disableText).toBe(true)
    expect(off.audio).toBe('SELECTED')
    expect(createTrackSelections([], 3, null, source).audio).toBe('NOT_FOUND')
    expect(createTrackSelections([{ id: '9', type: 'audio', external: false, supported: false }], 1, null, source).audio).toBe('UNSUPPORTED')
  })
})

describe('PlaybackInfo', () => {
  it('maps every negative track index to null and mirrors stream-copy flags', () => {
    const dto = buildPlaybackInfoDto({
      deviceProfile: {},
      audioIndex: -2,
      subtitleIndex: -3,
      mediaSourceId: 'src',
      maxBitrate: 1234.7,
      enableDirectPlay: false,
      enableDirectStream: true,
      userId: 'u',
    })
    expect(dto).toMatchObject({
      AudioStreamIndex: null,
      SubtitleStreamIndex: null,
      MaxStreamingBitrate: 1234,
      EnableDirectPlay: false,
      EnableDirectStream: true,
      AllowVideoStreamCopy: true,
      AllowAudioStreamCopy: true,
      EnableTranscoding: true,
      AutoOpenLiveStream: true,
      AlwaysBurnInSubtitleWhenTranscoding: false,
      StartTimeTicks: null,
    })
  })
  const res = (source: MediaSourceInfo, extra: Partial<PlaybackInfoResponse> = {}): PlaybackInfoResponse => ({
    MediaSources: [source],
    PlaySessionId: 'ps',
    ...extra,
  })
  it('direct play URL carries the static stream params and ApiKey', () => {
    const r = resolvePlaybackInfo(res({ Id: 'src', SupportsDirectPlay: true, ETag: 'tag', Container: 'mp4' }), 'item', 'http://s/', 'TOKEN')
    expect(r.ok && r.playMethod).toBe('DirectPlay')
    expect(r.ok && r.url).toBe('http://s/Videos/item/stream?static=true&mediaSourceId=src&tag=tag&playSessionId=ps&ApiKey=TOKEN')
    expect(r.ok && r.hls).toBe(false)
  })
  it('transcoding URL is resolved against the base and flagged HLS', () => {
    const r = resolvePlaybackInfo(
      res({ Id: 'src', SupportsDirectStream: true, SupportsTranscoding: true, TranscodingUrl: '/videos/item/master.m3u8?ApiKey=X', TranscodingSubProtocol: 'hls' }),
      'item',
      'http://s',
      'TOKEN',
    )
    expect(r.ok && r.playMethod).toBe('DirectStream')
    expect(r.ok && r.url).toBe('http://s/videos/item/master.m3u8?ApiKey=X')
    expect(r.ok && r.hls).toBe(true)
  })
  it('errors: server code, empty sources, no url', () => {
    expect(resolvePlaybackInfo({ ErrorCode: 'NotAllowed' }, 'i', 'http://s', null)).toEqual({ ok: false, error: 'server-error', code: 'NotAllowed' })
    expect(resolvePlaybackInfo({ MediaSources: [] }, 'i', 'http://s', null)).toEqual({ ok: false, error: 'no-media-sources' })
    expect(resolvePlaybackInfo(res({ Id: 's', SupportsTranscoding: true }), 'i', 'http://s', null)).toEqual({ ok: false, error: 'no-url' })
  })
  it('remote direct play uses the source path', () => {
    const r = resolvePlaybackInfo(res({ Id: 's', SupportsDirectPlay: true, IsRemote: true, Path: 'https://cdn/x.mp4' }), 'i', 'http://s', 'T')
    expect(r.ok && r.url).toBe('https://cdn/x.mp4')
  })
})

describe('subtitle data', () => {
  it('parses JSON track events and VTT', () => {
    const cues = parseJsonTrackEvents({
      TrackEvents: [
        { StartPositionTicks: 20_000_000, EndPositionTicks: 30_000_000, Text: 'Two\\Nlines' },
        { StartPositionTicks: 10_000_000, EndPositionTicks: 15_000_000, Text: '<i>One</i> <font color="red">x</font>' },
      ],
    })
    expect(cues).toEqual([
      { startMs: 1000, endMs: 1500, text: '<i>One</i> x' },
      { startMs: 2000, endMs: 3000, text: 'Two\nlines' },
    ])
    const vtt = parseVtt('WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.500 line:90%\n<b>Hi</b> &amp; bye\n\n00:01:00.000 --> 00:01:01.000\nLater')
    expect(vtt).toEqual([
      { startMs: 1000, endMs: 2500, text: '<b>Hi</b> & bye' },
      { startMs: 60_000, endMs: 61_000, text: 'Later' },
    ])
  })
  it('reads ASS dialogue as plain text', () => {
    const ass = `[Script Info]\nTitle: x\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.50,0:00:03.00,Default,,0,0,0,,{\\an8}Hello, world\\NSecond`
    expect(parseAssAsText(ass)).toEqual([{ startMs: 1500, endMs: 3000, text: 'Hello, world\nSecond' }])
  })
  it('active cues honour the delay (positive = later)', () => {
    const cues = [
      { startMs: 1000, endMs: 2000, text: 'a' },
      { startMs: 1500, endMs: 4000, text: 'b' },
      { startMs: 5000, endMs: 6000, text: 'c' },
    ]
    expect(activeCues(cues, 1800).map((c) => c.text)).toEqual(['a', 'b'])
    expect(activeCues(cues, 2500).map((c) => c.text)).toEqual(['b'])
    expect(activeCues(cues, 5200, 500).map((c) => c.text)).toEqual([])
    expect(activeCues(cues, 5600, 500).map((c) => c.text)).toEqual(['c'])
  })
  it('style maps preferences and scales with the video height', () => {
    expect(rgba('#FF0000', 50)).toBe('rgba(255, 0, 0, 0.5)')
    const s = subtitleStyle({ ...PREFERENCE_DEFAULTS, subBackgroundStyle: 'BG_WRAP' }, 1080)
    expect(s.line.fontSize).toBe('48px')
    expect(s.line.background).toBe('rgba(0, 0, 0, 0.5)')
    // edge thickness 4 = a 2dp stroke centred on the glyph edge (1dp visible), x2 for a 1080 px tall video
    expect(s.line.WebkitTextStroke).toBe('4px rgba(0, 0, 0, 1)')
    expect(s.line.paddingInline).toBeUndefined()
    expect(s.line.lineHeight).toBe(1.171875)
    expect(s.box.marginBottom).toBe(`${0.08 * 1080}px`)
    // controls visible: subtitles step up by the control strip's height, as a whole layer or as extra bottom margin
    expect(RAISED_BY).toBe('var(--player-strip-h, 62px)')
    expect(RAISED_SHIFT).toBe('translateY(calc(-1 * var(--player-strip-h, 62px)))')
    expect(subtitleBottomMargin(8, 0)).toBe(`${0.08 * 540}px`)
    const r = containedVideoRect(1000, 1000, 1920, 1080)
    expect(r.x).toBeCloseTo(0)
    expect(r.y).toBeCloseTo(218.75)
    expect(r.width).toBeCloseTo(1000)
    expect(r.height).toBeCloseTo(562.5)
  })
})

describe('constants', () => {
  it('bitrate ladder matches AppPreference.bitrateValues', () => {
    expect(BITRATE_VALUES.length).toBe(23)
    expect(BITRATE_VALUES[0]).toBe(512_000)
    expect(BITRATE_VALUES.at(-1)).toBe(200 * 1024 * 1024)
  })
})
