// The playback engine: a headless port of W/ui/playback/PlaybackViewModel.kt for the browser. One instance owns
// one <video> element; the UI mounts it with `attachSurface` and drives everything through the commands below.
// State is published in `usePlaybackStore` (Zustand). See README.md for the contract and spec 05 for behaviour.
import type { Api } from '@jellyfin/sdk'
import type { BaseItemDto, DeviceProfile, MediaSourceInfo, MediaStream, PlayMethod } from '@jellyfin/sdk/lib/generated-client/models'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { getMediaInfoApi } from '@jellyfin/sdk/lib/utils/api/media-info-api'
import { getMediaSegmentApi } from '@jellyfin/sdk/lib/utils/api/media-segment-api'
import { getSessionApi } from '@jellyfin/sdk/lib/utils/api/session-api'
import i18next from 'i18next'
import { create } from 'zustand'
import { itemImageUrl } from '../../../api/images'
import { getSession } from '../../../api/session'
import { toast } from '../../../app/toast'
import { getPrefs } from '../../../stores/preferences'
import {
  getItemPlayback,
  getSeriesTrackChoices,
  getSubtitleDelay,
  saveSubtitleDelay,
  saveTrackSelection,
} from '../../../stores/playbackChoices'
import { createBackend, type PlayerBackend } from './backends'
import { detectCapabilities, type Capabilities } from './capabilities'
import { buildDeviceProfile, profileOptionsFromPrefs } from './deviceProfile'
import { describePath, initialLadder, isVideoCopy, restartFlags, stepDown, transcodeReasons, type FallbackLadder } from './fallback'
import { endOfItemAction, nextUpCountdownStart, previousAction, shouldAutoPlayNextUp } from './nextUp'
import { buildPlaybackInfoDto, resolvePlaybackInfo } from './playbackInfo'
import { bindMediaSession, hasPrimaryArtwork, keepScreenOn, setMediaMetadata, updateMediaPosition } from './platform'
import { createQueue, isSameMedia, PLAYABLE_KINDS, queueForPlayedItem, queuePosition, SUPPORTED_ITEM_KINDS, type QueueEntry } from './queue'
import { ProgressReporter } from './reporting'
import { evaluateSegments, SEGMENT_POLL_MS, segmentEndMs } from './segments'
import {
  chooseAudioStream,
  chooseSource,
  chooseSubtitleStream,
  resolveSubtitleIndex,
  TrackIndex,
  type ChoicePrefs,
  type ItemPlayback,
  type ServerUserConfig,
} from './streamChoice'
import { loadSubtitle } from './subtitles/loader'
import { createTrackSelections } from './trackSelection'
import { pickTrickplayInfo, trickplayImageAt, trickplaySheetCount, type TrickplayImage } from './trickplay'
import { trickplayTileUrl } from '../../../api/playback/urls'
import { onItemPatched } from '../../common/itemCache'
import { episodeLine, itemTitle } from '../ui/text'
import type { Chapter, ExitReason, PlaybackDestination, PlaybackEngineState, PlaybackError } from './types'
import { FrameWatchdog, type WatchdogReason } from './watchdog'

/** `AppPreference.DEFAULT_BITRATE`: 100 "Mbit" where 1 M = 1,048,576. */
export const DEFAULT_BITRATE = 100 * 1024 * 1024
/** A stream that has not produced `canplay` by then counts as failed to start. */
const START_TIMEOUT_DIRECT_MS = 20_000
const START_TIMEOUT_HLS_MS = 45_000
const SUBTITLE_DELAY_SAVE_MS = 1500

const initialState: PlaybackEngineState = {
  status: 'idle',
  error: null,
  exit: null,
  autoplayBlocked: false,
  frameHeld: false,
  destination: null,
  queue: [],
  index: 0,
  hasNext: false,
  hasPrevious: false,
  item: null,
  entryKind: null,
  isLiveTv: false,
  source: null,
  playMethod: null,
  backend: null,
  streamUrl: null,
  playSessionId: null,
  liveStreamId: null,
  fallbackPath: [],
  allowDirectPlay: true,
  allowDirectStream: true,
  transcodeReasons: [],
  videoCopy: false,
  transcodeInfo: null,
  audioStreams: [],
  subtitleStreams: [],
  audioIndex: null,
  subtitleChoice: TrackIndex.UNSPECIFIED,
  subtitleIndex: null,
  audioReason: null,
  subtitleReason: null,
  subtitle: null,
  subtitleLoading: false,
  subtitleDelayMs: 0,
  subtitleSample: false,
  positionMs: 0,
  durationMs: 0,
  bufferedMs: 0,
  paused: true,
  muted: false,
  volume: 1,
  playbackRate: 1,
  maxBitrate: DEFAULT_BITRATE,
  videoWidth: 0,
  videoHeight: 0,
  chapters: [],
  trickplay: null,
  segment: null,
  segments: [],
  autoSkipped: null,
  nextUp: null,
  showControlsSignal: 0,
  stats: { droppedFrames: 0, totalFrames: 0, bandwidthEstimate: null },
  lastReport: null,
}

export const usePlaybackStore = create<PlaybackEngineState>()(() => ({ ...initialState }))

const set = (patch: Partial<PlaybackEngineState>) => usePlaybackStore.setState(patch)
const get = () => usePlaybackStore.getState()
const t = (key: string, opts: Record<string, unknown> = {}) => i18next.t(key, opts)
const norm = (id: string | null | undefined) => id?.replace(/-/g, '').toLowerCase() ?? null

// The store keeps its own copies of items (the playing item, the queue entries, next up) that the query caches do
// not reach: a favourite or watched change made anywhere (the player's own favourite button, a web addition) is
// applied to them as well, so the state shown is right at once, after a rollback, and when the queue comes back
// to the entry and its reload fails.
onItemPatched((itemId, fn) => {
  const st = get()
  const same = (item: BaseItemDto | null | undefined): item is BaseItemDto => !!item?.Id && norm(item.Id) === norm(itemId)
  const patch: Partial<PlaybackEngineState> = {}
  if (same(st.item)) patch.item = fn(st.item)
  if (st.queue.some((e) => same(e.item))) patch.queue = st.queue.map((e) => (same(e.item) ? { ...e, item: fn(e.item) } : e))
  if (st.nextUp && same(st.nextUp.item)) patch.nextUp = { ...st.nextUp, item: fn(st.nextUp.item) }
  if (patch.item || patch.queue || patch.nextUp) set(patch)
})

interface StreamRequest {
  item: BaseItemDto
  sourceId: string | null
  audioIndex: number | null
  subtitleIndex: number | null
  positionMs: number
  enableDirectPlay: boolean
  enableDirectStream: boolean
  maxBitrate: number
}

interface SessionCtx {
  api: Api
  baseUrl: string
  token: string | null
  authorization: string | null
  userId: string
  userConfig: ServerUserConfig | null
  serverVersion: string | null
}

function sessionCtx(): SessionCtx | null {
  const s = getSession()
  if (!s) return null
  return {
    api: s.api,
    baseUrl: s.api.basePath,
    token: s.api.accessToken || null,
    authorization: s.api.accessToken ? s.api.authorizationHeader : null,
    userId: s.user.id,
    userConfig: (s.userDto.Configuration as ServerUserConfig | undefined) ?? null,
    serverVersion: s.server.version,
  }
}

function choicePrefs(): ChoicePrefs {
  const p = getPrefs()
  return { preferredAudioLanguage: p.preferredAudioLang, preferredSubtitleLanguage: p.preferredSubtitleLang, subtitleMode: p.subtitleMode }
}

/** Subtitle list order of CurrentMediaInfo.getSubtitleStreams: the server profile's language first. */
function sortedSubtitleStreams(source: MediaSourceInfo | null, userConfig: ServerUserConfig | null): MediaStream[] {
  const subs = (source?.MediaStreams ?? []).filter((s) => s.Type === 'Subtitle')
  const pref = userConfig?.SubtitleLanguagePreference
  if (!pref?.trim()) return subs
  return [...subs].sort((a, b) => Number(b.Language != null && b.Language === pref) - Number(a.Language != null && a.Language === pref))
}

function chaptersOf(item: BaseItemDto): Chapter[] {
  return (item.Chapters ?? [])
    .map((c, index) => ({ index, startMs: Math.floor((c.StartPositionTicks ?? 0) / 10_000), name: c.Name ?? null, imageTag: c.ImageTag ?? null }))
    .sort((a, b) => a.startMs - b.startMs)
}

/**
 * The audio stream a progressive <video> plays when it cannot switch: the first one in the file. Edge, Chrome and
 * Firefox were measured on a file whose second track carries the default flag: all three play the first. This is
 * also what the server calls "not secondary" (the profile's IsSecondaryAudio condition).
 */
function defaultAudioIndex(source: MediaSourceInfo): number | null {
  return (source.MediaStreams ?? []).find((s) => s.Type === 'Audio')?.Index ?? null
}

export class PlaybackEngine {
  readonly video: HTMLVideoElement
  private caps: Capabilities | null = null
  private profileCache: { key: string; profile: DeviceProfile } | null = null
  private backend: PlayerBackend | null = null
  private reporter: ProgressReporter | null = null
  private watchdog: FrameWatchdog
  /** start() generation: a newer start abandons older async work */
  private session = 0
  /** stream generation: a newer PlaybackInfo/load abandons older work and events */
  private gen = 0
  /** generation of the stream currently loaded into the element */
  private loadedGen = -1
  private loadedUrl: string | null = null
  private failedGen = -1
  /** the last picture of the entry being left (holdFrame) */
  private heldFrame: HTMLCanvasElement | null = null
  private startTimer: ReturnType<typeof setTimeout> | null = null
  private ladder: FallbackLadder = initialLadder(false)
  private itemPlayback: ItemPlayback | null = null
  private burnedSubtitle: number | null = null
  private request: StreamRequest | null = null
  private segTimer: ReturnType<typeof setInterval> | null = null
  private segmentHandled = new Set<string>()
  private outroShown = new Set<string>()
  private nextUpTimer: ReturnType<typeof setInterval> | null = null
  private lastInteraction = Date.now()
  private subtitleAbort: AbortController | null = null
  private delaySave: ReturnType<typeof setTimeout> | null = null
  private statsTimer: ReturnType<typeof setInterval> | null = null
  private unbindMediaSession: (() => void) | null = null
  private started = false
  /**
   * Where the stream being loaded will start. While set, positionMs() returns it instead of video.currentTime,
   * which reads 0 until the backend applies the start seek (ExoPlayer.currentPosition returns the pending seek
   * during preparation). Without it an early exit reports Stopped at 0 and wipes the resume point.
   */
  private pendingStartMs: number | null = null
  /** a user seek made while the stream was still loading, applied once it settles */
  private pendingUserSeek = false

  constructor() {
    this.video = document.createElement('video')
    this.video.playsInline = true
    this.video.preload = 'auto'
    this.video.setAttribute('data-playback-video', '')
    Object.assign(this.video.style, { width: '100%', height: '100%', objectFit: 'contain', background: 'var(--fx-black)', display: 'block' })
    this.watchdog = new FrameWatchdog(this.video, (r) => this.onWatchdog(r))
    this.bindVideoEvents()
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.stop('user'))
    }
  }

  // -------------------------------------------------------------------------------------------
  // Surface

  /** Mounts the engine's <video> into `container` (pass null to detach). */
  attachSurface(container: HTMLElement | null) {
    if (container) {
      if (this.video.parentElement !== container) container.prepend(this.video)
    } else if (this.video.parentElement) {
      this.video.parentElement.removeChild(this.video)
    }
  }

  /** Video scale (PlaybackConstants playbackScaleOptions / spec B4 "Video scale"). */
  setContentScale(scale: 'FIT' | 'NONE' | 'CROP' | 'FILL' | 'Fill_WIDTH' | 'FILL_HEIGHT') {
    const s = this.video.style
    Object.assign(s, { position: '', inset: '', width: '100%', height: '100%', transform: '', left: '', top: '' })
    switch (scale) {
      case 'NONE':
        s.objectFit = 'none'
        break
      case 'CROP':
        s.objectFit = 'cover'
        break
      case 'FILL':
        s.objectFit = 'fill'
        break
      case 'Fill_WIDTH':
        Object.assign(s, { objectFit: 'contain', height: 'auto', position: 'absolute', left: '0', top: '50%', transform: 'translateY(-50%)' })
        break
      case 'FILL_HEIGHT':
        Object.assign(s, { objectFit: 'contain', width: 'auto', position: 'absolute', top: '0', left: '50%', transform: 'translateX(-50%)' })
        break
      default:
        s.objectFit = 'contain'
    }
  }

  // -------------------------------------------------------------------------------------------
  // Start / stop

  /** `init()` (PlaybackViewModel.kt:293-430): resolve the item, build the queue once, cinema intros, play. */
  async start(dest: PlaybackDestination): Promise<void> {
    this.stop(null)
    const session = ++this.session
    this.started = true
    const prefs = getPrefs()
    usePlaybackStore.setState({
      ...initialState,
      status: 'loading',
      destination: dest,
      maxBitrate: prefs.maxBitrate > 0 ? prefs.maxBitrate : DEFAULT_BITRATE,
      muted: this.video.muted,
      volume: this.video.volume,
      playbackRate: 1,
    })
    this.video.defaultPlaybackRate = 1
    this.video.playbackRate = 1
    const ctx = sessionCtx()
    if (!ctx) return this.fail({ kind: 'load-failed', detail: 'No session' })
    this.bindMediaSession()
    try {
      this.caps = await detectCapabilities()
      if (session !== this.session) return
      const positionMs = dest.kind === 'item' ? (dest.positionMs ?? 0) : 0
      const force = dest.kind === 'item' && !!dest.forceTranscode
      const item = (await getLibraryApi(ctx.api).getItem({ itemId: dest.itemId, userId: ctx.userId })).data
      if (session !== this.session) return

      let entries: QueueEntry[]
      if (item.Type && PLAYABLE_KINDS.has(item.Type)) {
        entries = [{ kind: 'media', item }]
        if (dest.kind === 'item') {
          // "this episode and the following ones" / "this movie and its parts" (step 10, built once)
          const q = await createQueue(ctx.api, item, { userId: ctx.userId }).catch(() => null)
          if (q?.ok && q.entries.length > 0) {
            entries = queueForPlayedItem(item, q.entries)
          }
        }
      } else {
        const q =
          dest.kind === 'list'
            ? await createQueue(ctx.api, item, {
                userId: ctx.userId,
                startIndex: dest.startIndex ?? 0,
                sort: dest.sort ?? undefined,
                shuffled: dest.shuffle,
                filter: dest.filter,
              })
            : await createQueue(ctx.api, item, { userId: ctx.userId, shuffled: dest.shuffle })
        if (session !== this.session) return
        if (!q.ok) return this.fail({ kind: 'load-failed', detail: q.message })
        if (q.entries.length === 0) {
          toast(t('web_playback_playlist_empty'))
          return this.requestExit('playlist-empty')
        }
        entries = q.entries
      }

      // Cinema mode: only when not resuming
      if (positionMs === 0 && prefs.cinemaMode && entries[0].item.Id) {
        try {
          const intros = (await getLibraryApi(ctx.api).getIntros({ itemId: entries[0].item.Id, userId: ctx.userId })).data.Items ?? []
          if (session !== this.session) return
          entries = [...intros.map((i) => ({ kind: 'intro' as const, item: i })), ...entries]
        } catch {
          // no intros
        }
      }
      set({ queue: entries })
      const played = await this.playEntry(0, positionMs, force, session)
      if (session !== this.session) return
      if (!played) await this.advance(1, session)
    } catch (err) {
      if (session === this.session) this.fail({ kind: 'load-failed', detail: err instanceof Error ? err.message : String(err) })
    }
  }

  /** Ends playback: Stopped report, encoder cleanup, element reset. `exit` also asks the UI to leave. */
  stop(exit: ExitReason | null) {
    this.session++
    this.gen++
    this.releaseFrame()
    this.teardownStream({ closeLiveStream: true })
    this.setPendingStart(null)
    this.clearItemTimers()
    this.subtitleAbort?.abort()
    this.flushDelaySave()
    if (this.statsTimer) clearInterval(this.statsTimer)
    this.statsTimer = null
    this.unbindMediaSession?.()
    this.unbindMediaSession = null
    keepScreenOn(false)
    if (this.started) {
      this.started = false
      set({ status: exit ? 'ended' : 'idle', exit, nextUp: null, segment: null })
    }
  }

  // -------------------------------------------------------------------------------------------
  // Queue

  /** `play(playlistItem, positionMs)` (PlaybackViewModel.kt:446-625). Returns false when the entry was skipped. */
  private async playEntry(index: number, positionMs: number, force: boolean, session: number): Promise<boolean> {
    const entry = get().queue[index]
    if (!entry) return false
    this.gen++
    this.holdFrame()
    this.teardownStream({ closeLiveStream: true })
    this.setPendingStart(positionMs)
    this.clearItemTimers()
    this.subtitleAbort?.abort()
    this.flushDelaySave()
    this.ladder = initialLadder(force)
    this.burnedSubtitle = null
    const q = get().queue
    set({
      index,
      ...queuePosition(index, q.length),
      entryKind: entry.kind,
      nextUp: null,
      segment: null,
      segments: [],
      subtitle: null,
      status: 'loading',
      error: null,
      fallbackPath: [],
      allowDirectPlay: this.ladder.allowDirectPlay,
      allowDirectStream: this.ladder.allowDirectStream,
      transcodeReasons: [],
      videoCopy: false,
      transcodeInfo: null,
    })
    const type = entry.item.Type ?? ''
    if (!SUPPORTED_ITEM_KINDS.has(type)) {
      toast(t('web_playback_unsupported_type', { p1: type }))
      return false
    }
    const ctx = sessionCtx()
    if (!ctx) return false
    // Queue entries come from list endpoints; fetch the full item (MediaSources, Chapters, Trickplay).
    const item = entry.item.Id
      ? ((await getLibraryApi(ctx.api).getItem({ itemId: entry.item.Id, userId: ctx.userId }).then((r) => r.data).catch(() => null)) ??
        entry.item)
      : entry.item
    if (session !== this.session) return true
    const isLive = item.Type === 'TvChannel'
    const stored = item.Id ? getItemPlayback(item.Id) : null
    const ip = stored?.sourceId ? stored : null
    this.itemPlayback = ip
    const source = isLive ? null : chooseSource(item.MediaSources, ip)
    if (!source && !isLive) {
      toast(t('web_playback_no_media_sources'))
      return false
    }
    const prefs = choicePrefs()
    const streams = source?.MediaStreams ?? []
    const audioCandidates = streams.filter((s) => s.Type === 'Audio')
    const subCandidates = streams.filter((s) => s.Type === 'Subtitle')
    const audio = source ? chooseAudioStream(audioCandidates, ip, getSeriesTrackChoices(item, 'AUDIO'), prefs, ctx.userConfig) : null
    const sub = source
      ? chooseSubtitleStream(audio?.stream?.Language, subCandidates, ip, getSeriesTrackChoices(item, 'SUBTITLE'), prefs, ctx.userConfig)
      : null
    const trickplay = pickTrickplayInfo(item.Trickplay, source?.Id)
    if (trickplay && source?.RunTimeTicks && item.Id) this.prefetchTrickplay(ctx, item.Id, source.Id ?? null, trickplay, source.RunTimeTicks / 10_000)

    set({
      item,
      isLiveTv: isLive,
      audioStreams: audioCandidates,
      subtitleStreams: sortedSubtitleStreams(source, ctx.userConfig),
      audioIndex: audio?.stream?.Index ?? null,
      subtitleChoice: ip && ip.subtitleIndex < -1 ? ip.subtitleIndex : (sub?.stream?.Index ?? TrackIndex.DISABLED),
      subtitleIndex: sub?.stream?.Index ?? null,
      audioReason: audio?.reason ?? null,
      subtitleReason: sub?.reason ?? null,
      chapters: chaptersOf(item),
      trickplay,
      durationMs: (item.RunTimeTicks ?? source?.RunTimeTicks ?? 0) / 10_000,
      positionMs: positionMs,
    })
    this.updateMediaMetadata(item)

    // skipBackOnResume is not applied at startup, only on un-pause (spec 05 §1.4)
    await this.changeStreams({
      item,
      sourceId: source?.Id ?? null,
      audioIndex: audio?.stream?.Index ?? null,
      subtitleIndex: sub?.stream?.Index ?? null,
      // a seek made while the item was loading wins over the resume point
      positionMs: this.positionMs(),
      enableDirectPlay: this.ladder.allowDirectPlay,
      enableDirectStream: this.ladder.allowDirectStream,
      maxBitrate: get().maxBitrate,
    })
    if (session !== this.session) return true
    if (item.Id) void this.listenForSegments(ctx, item.Id, session)
    return true
  }

  /** Moves through the queue in `direction` (+1/-1), skipping entries that cannot play. */
  private async advance(direction: 1 | -1, session = this.session): Promise<void> {
    let i = get().index + direction
    const q = get().queue
    while (i >= 0 && i < q.length) {
      const ok = await this.playEntry(i, 0, false, session)
      if (session !== this.session) return
      if (ok) return
      i += direction
    }
    if (direction === 1) this.requestExit('ended')
  }

  /** Next queue entry (`playNextUp`). */
  next() {
    this.cancelNextUp()
    if (get().hasNext) void this.advance(1)
  }

  /** Previous queue entry (media key Previous: always the previous entry, never a restart). */
  previous() {
    this.cancelNextUp()
    if (get().hasPrevious) void this.advance(-1)
  }

  /** On-screen Previous button rule: previous entry only within the first 3 s, else restart. */
  previousButton() {
    if (previousAction(this.positionMs(), get().hasPrevious) === 'previous-item') this.previous()
    else this.seekTo(0)
  }

  /** `playItemInPlaylist`. */
  playQueueIndex(index: number) {
    this.cancelNextUp()
    const session = this.session
    void (async () => {
      const ok = await this.playEntry(index, 0, false, session)
      if (!ok && session === this.session) await this.advance(1, session)
    })()
  }

  // -------------------------------------------------------------------------------------------
  // Streams

  private profile(ctx: SessionCtx): DeviceProfile {
    const caps = this.caps
    if (!caps) throw new Error('capabilities not detected')
    const opts = profileOptionsFromPrefs(getPrefs(), ctx.serverVersion)
    const key = JSON.stringify({ ...opts, forceEnabledHdr: [...opts.forceEnabledHdr], forceDisabledHdr: [...opts.forceDisabledHdr] })
    if (this.profileCache?.key !== key) this.profileCache = { key, profile: buildDeviceProfile(caps, opts) }
    return this.profileCache.profile
  }

  /** Current device profile (debug page). */
  async deviceProfile(): Promise<DeviceProfile | null> {
    const ctx = sessionCtx()
    if (!ctx) return null
    this.caps ??= await detectCapabilities()
    return this.profile(ctx)
  }

  capabilities(): Capabilities | null {
    return this.caps
  }

  /** `changeStreams` full path: PlaybackInfo -> URL -> backend -> reporter -> subtitles (PlaybackViewModel.kt:631-900). */
  private async changeStreams(req: StreamRequest): Promise<void> {
    const gen = ++this.gen
    const session = this.session
    const ctx = sessionCtx()
    if (!ctx || !req.item.Id) return
    this.request = req
    this.teardownStream({ closeLiveStream: false })
    this.setPendingStart(req.positionMs)
    set({ status: 'loading', maxBitrate: req.maxBitrate, allowDirectPlay: req.enableDirectPlay, allowDirectStream: req.enableDirectStream })
    let res
    try {
      res = await getMediaInfoApi(ctx.api).getPostedPlaybackInfo({
        itemId: req.item.Id,
        playbackInfoDto: buildPlaybackInfoDto({
          deviceProfile: this.profile(ctx),
          audioIndex: req.audioIndex,
          subtitleIndex: req.subtitleIndex,
          mediaSourceId: req.sourceId,
          maxBitrate: req.maxBitrate,
          enableDirectPlay: req.enableDirectPlay,
          enableDirectStream: req.enableDirectStream,
          userId: ctx.userId,
        }),
      })
    } catch (err) {
      if (gen === this.gen) this.fail({ kind: 'load-failed', detail: err instanceof Error ? err.message : String(err) })
      return
    }
    if (gen !== this.gen || session !== this.session) return
    const resolved = resolvePlaybackInfo(res.data, req.item.Id, ctx.baseUrl, ctx.token)
    if (!resolved.ok) {
      const e: PlaybackError = resolved.error === 'server-error' ? { kind: 'server-error', code: resolved.code } : { kind: resolved.error }
      return this.fail(e)
    }
    const caps = this.caps
    let backend: PlayerBackend
    try {
      backend = createBackend(this.video, resolved.hls, !!caps?.nativeHls, {
        onFatal: (e) => this.onFailure(gen, resolved.playMethod, e.type === 'network' ? 'network-error' : 'media-error', e.detail),
      })
    } catch (err) {
      return this.fail({ kind: 'unsupported-browser', detail: err instanceof Error ? err.message : String(err) })
    }
    this.backend = backend
    const audioIndex = req.audioIndex
    const subtitleStream = (resolved.source.MediaStreams ?? []).find((s) => s.Type === 'Subtitle' && s.Index === req.subtitleIndex) ?? null
    this.burnedSubtitle = subtitleStream?.DeliveryMethod === 'Encode' ? (subtitleStream.Index ?? null) : null
    this.reporter = new ProgressReporter(
      ctx.api,
      {
        itemId: req.item.Id,
        mediaSourceId: resolved.source.Id ?? null,
        playMethod: resolved.playMethod,
        audioStreamIndex: audioIndex,
        subtitleStreamIndex: req.subtitleIndex,
        playSessionId: resolved.playSessionId,
        liveStreamId: resolved.liveStreamId,
      },
      {
        positionMs: () => this.positionMs(),
        isPaused: () => this.video.paused,
        isMuted: () => this.video.muted,
        volume: () => this.video.volume,
      },
    )
    const reasons = resolved.playMethod === 'DirectPlay' ? [] : transcodeReasons(resolved.source.TranscodingUrl)
    // the PlaybackInfo source carries DeliveryMethod/DeliveryUrl for every subtitle stream
    if ((resolved.source.MediaStreams ?? []).length > 0) {
      set({
        audioStreams: (resolved.source.MediaStreams ?? []).filter((s) => s.Type === 'Audio'),
        subtitleStreams: sortedSubtitleStreams(resolved.source, ctx.userConfig),
      })
    }
    set({
      source: resolved.source,
      playMethod: resolved.playMethod,
      transcodeReasons: reasons,
      videoCopy: resolved.playMethod === 'DirectStream' || (req.enableDirectStream && isVideoCopy(reasons)),
      backend: backend.kind,
      streamUrl: resolved.url,
      playSessionId: resolved.playSessionId,
      liveStreamId: resolved.liveStreamId,
      audioIndex,
      subtitleIndex: req.subtitleIndex,
      fallbackPath: this.ladder.path,
      autoplayBlocked: false,
    })
    this.loadedGen = gen
    this.loadedUrl = resolved.url
    this.failedGen = -1
    // a seek made during the PlaybackInfo round trip becomes the start position
    this.pendingUserSeek = false
    backend.load(resolved.url, this.positionMs() / 1000)
    this.video.playbackRate = get().playbackRate
    this.armStartTimer(gen, resolved.playMethod, resolved.hls)
    this.attemptPlay()
    this.startStats()
    if (resolved.playMethod === 'DirectPlay') this.video.addEventListener('loadedmetadata', () => this.activateDirectPlayTracks(gen), { once: true })
    if (resolved.playMethod === 'Transcode') void this.pollTranscodeInfo(ctx, gen)
    void this.loadSubtitleFor(subtitleStream, resolved.source, req.item.Id, gen)
  }

  /** TracksChangedListener: a direct-played file must play the chosen audio track or be remuxed. */
  private activateDirectPlayTracks(gen: number) {
    if (gen !== this.gen || !this.backend || !this.request) return
    const source = get().source
    const audioIndex = this.request.audioIndex
    if (!source || audioIndex == null || audioIndex < 0) return
    const audioCount = (source.MediaStreams ?? []).filter((s) => s.Type === 'Audio').length
    if (audioCount <= 1) return
    const tracks = this.backend.audioTracks()
    if (tracks.length > 0) {
      const sel = createTrackSelections(tracks, audioIndex, null, source)
      if (sel.audio === 'SELECTED' && sel.audioTrack) {
        this.backend.selectAudioTrack(sel.audioTrack.id)
        return
      }
    } else if (audioIndex === defaultAudioIndex(source)) {
      return
    }
    this.onFailure(gen, 'DirectPlay', 'track-activation', `audio index ${audioIndex} cannot be selected in place`)
  }

  private armStartTimer(gen: number, method: PlayMethod, hls: boolean) {
    if (this.startTimer) clearTimeout(this.startTimer)
    this.startTimer = setTimeout(() => {
      if (gen === this.gen && this.video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA && !this.video.paused) {
        this.onFailure(gen, method, 'start-timeout', 'no playable data')
      }
    }, hls ? START_TIMEOUT_HLS_MS : START_TIMEOUT_DIRECT_MS)
  }

  private attemptPlay() {
    const p = this.video.play()
    p?.catch((err: unknown) => {
      const name = (err as { name?: string } | null)?.name
      if (name === 'NotAllowedError') set({ autoplayBlocked: true, paused: true, status: 'paused' })
      // AbortError: a newer load replaced this one; NotSupportedError arrives through the 'error' event
    })
  }

  /** One step down the fallback ladder, or the final error (spec 05 §B6). Never loops. */
  private onFailure(gen: number, method: PlayMethod, reason: string, detail?: string) {
    if (gen !== this.gen || this.failedGen === gen) return
    this.failedGen = gen
    const req = this.request
    const next = stepDown(this.ladder, { method, reason, detail })
    if (!next || !req) {
      this.ladder = { ...this.ladder, path: [...this.ladder.path, { method, reason, detail }] }
      set({ fallbackPath: this.ladder.path })
      // Detach the player first: a live hls.js instance keeps requesting segments for the killed PlaySessionId,
      // which makes the server start the encoder again.
      const positionMs = this.positionMs()
      this.fail({ kind: 'playback-failed', detail: `${describePath(this.ladder, null)}${detail ? `: ${detail}` : ''}` })
      this.backend?.destroy()
      this.backend = null
      this.reporter?.release({ failed: true, closeLiveStream: true, positionMs })
      this.setPendingStart(positionMs)
      set({ positionMs })
      return
    }
    this.ladder = next
    const resumeAt = this.positionMs() > 500 ? this.positionMs() : req.positionMs
    void this.changeStreams({ ...req, positionMs: resumeAt, ...flagsOf(next) })
  }

  /** DEV/testing: treat the current stream as failed and take one step down the ladder. */
  debugFail(reason = 'manual') {
    const m = get().playMethod
    if (m) this.onFailure(this.gen, m, reason)
  }

  /**
   * Error screen "Retry" / "Play with transcoding": replays the current entry from where it stopped, from a fresh
   * ladder (or straight from full transcode). Falls back to a fresh start when no entry was loaded yet.
   */
  retry(forceTranscode = false) {
    const st = get()
    const resumeAt = Math.max(st.positionMs, this.request?.positionMs ?? 0)
    if (st.queue.length === 0 || !st.queue[st.index]) {
      const dest = st.destination
      if (!dest) return
      void this.start(dest.kind === 'item' ? { ...dest, forceTranscode: forceTranscode || dest.forceTranscode } : dest)
      return
    }
    this.started = true
    const session = this.session
    set({ error: null, status: 'loading' })
    void (async () => {
      const ok = await this.playEntry(st.index, resumeAt, forceTranscode, session)
      if (!ok && session === this.session) await this.advance(1, session)
    })()
  }

  /**
   * After a subtitle download (SubtitleSearchUtils.downloadAndSwitchSubtitles): adopt the refreshed item, save the
   * new subtitle (and the shifted audio index when the user had picked one) and restart at the current position.
   */
  async reloadWithSubtitle(item: BaseItemDto, subtitleIndex: number, audioIndex: number | null) {
    if (!this.request) return
    const ctx = sessionCtx()
    if (audioIndex != null && audioIndex !== this.request.audioIndex && this.itemPlayback && this.itemPlayback.audioIndex !== TrackIndex.UNSPECIFIED) {
      this.itemPlayback = saveTrackSelection(item, this.itemPlayback, audioIndex, 'Audio')
    }
    this.itemPlayback = saveTrackSelection(item, this.itemPlayback, subtitleIndex, 'Subtitle')
    const source = chooseSource(item.MediaSources, this.itemPlayback)
    set({
      item,
      audioStreams: (source?.MediaStreams ?? []).filter((s) => s.Type === 'Audio'),
      subtitleStreams: sortedSubtitleStreams(source, ctx?.userConfig ?? null),
      subtitleChoice: subtitleIndex,
      subtitleReason: { kind: 'Item', itemPlayback: this.itemPlayback },
    })
    await this.changeStreams({
      ...this.request,
      item,
      audioIndex,
      subtitleIndex,
      positionMs: this.positionMs(),
      ...flagsOf(restartFlags(this.ladder)),
    })
  }

  private onWatchdog(reason: WatchdogReason) {
    const m = get().playMethod
    if (m) this.onFailure(this.gen, m, reason)
  }

  private teardownStream(opts: { closeLiveStream: boolean }) {
    if (this.startTimer) clearTimeout(this.startTimer)
    this.startTimer = null
    this.watchdog.stop()
    // detach the player before the server encoder is killed, so no segment request races the cleanup; the
    // position is read first because detaching resets currentTime
    const positionMs = this.positionMs()
    // the stream is dead from here: element events fired by the detach itself (WebKit sends 'pause') must not
    // be reported as progress of a session that is being stopped
    this.loadedGen = -1
    if (this.backend) {
      this.backend.destroy()
      this.backend = null
    }
    this.reporter?.release({ closeLiveStream: opts.closeLiveStream, positionMs })
    if (this.reporter) set({ lastReport: this.reporter.lastReport })
    this.reporter = null
    this.loadedUrl = null
  }

  /**
   * Web: moving to another queue entry keeps the picture of the one being left on screen, drawn into a canvas over
   * the element, until the next entry has a frame (as Jellyfin's web client, whose element keeps its last frame
   * while the next source loads). Detaching the stream empties the element, which showed black. Only when a
   * picture is there: at the first start the element is empty and the player's black cover shows instead.
   */
  private holdFrame() {
    const v = this.video
    // no picture in the element (a second move before the first one has a frame, a skipped entry): the picture
    // already held stays, a black cover would flash otherwise
    if (!v.parentElement || v.readyState < 2 || !v.videoWidth || !v.videoHeight) return
    this.releaseFrame()
    // drawn at most at the size it is shown (a 4K frame would take 33 MB for a moment)
    const fit = Math.min(1, Math.max((v.clientWidth * devicePixelRatio) / v.videoWidth, (v.clientHeight * devicePixelRatio) / v.videoHeight) || 1)
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(v.videoWidth * fit))
    c.height = Math.max(1, Math.round(v.videoHeight * fit))
    try {
      c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height)
    } catch {
      return
    }
    // the same box and scale as the video (setContentScale writes them inline)
    c.style.cssText = v.style.cssText
    c.style.display = 'block'
    if (!c.style.position) Object.assign(c.style, { position: 'absolute', inset: '0' })
    c.setAttribute('aria-hidden', 'true')
    c.dataset.playerHeldFrame = ''
    v.after(c)
    this.heldFrame = c
    set({ frameHeld: true })
  }

  private releaseFrame() {
    if (!this.heldFrame) return
    this.heldFrame.remove()
    this.heldFrame = null
    set({ frameHeld: false })
  }

  private fail(error: PlaybackError) {
    this.watchdog.stop()
    if (this.startTimer) clearTimeout(this.startTimer)
    // stop listening to the dead stream's element events so they cannot overwrite the error state
    this.loadedGen = -1
    this.video.pause()
    this.releaseFrame()
    set({ status: 'error', error, paused: true })
    keepScreenOn(false)
  }

  private requestExit(reason: ExitReason) {
    this.stop(reason)
  }

  private async pollTranscodeInfo(ctx: SessionCtx, gen: number) {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    while (gen === this.gen) {
      await sleep(2000)
      if (gen !== this.gen) return
      try {
        const sessions = (await getSessionApi(ctx.api).getSessions({ deviceId: ctx.api.deviceInfo.id })).data
        const info = sessions[0]?.TranscodingInfo
        if (info) {
          if (gen === this.gen) set({ transcodeInfo: info })
          return
        }
      } catch {
        return
      }
      await sleep(3000)
    }
  }

  private startStats() {
    if (this.statsTimer) return
    this.statsTimer = setInterval(() => {
      const q = this.video.getVideoPlaybackQuality?.()
      set({
        stats: {
          droppedFrames: q?.droppedVideoFrames ?? 0,
          totalFrames: q?.totalVideoFrames ?? 0,
          bandwidthEstimate: this.backend?.bandwidthEstimate() ?? null,
        },
        lastReport: this.reporter?.lastReport ?? get().lastReport,
      })
    }, 1000)
  }

  // -------------------------------------------------------------------------------------------
  // Tracks

  /** `changeAudioStream`: save the choice, then switch in place when the backend can, else restart. */
  setAudio(index: number) {
    const st = get()
    const item = st.item
    const source = st.source
    if (!item || !source || !this.request || index === st.audioIndex) return
    this.itemPlayback = saveTrackSelection(item, this.itemPlayback, index, 'Audio')
    let subtitleIndex = this.request.subtitleIndex
    if (st.subtitleChoice === TrackIndex.ONLY_FORCED) {
      subtitleIndex = resolveSubtitleIndex(source, index, TrackIndex.ONLY_FORCED, choicePrefs(), sessionCtx()?.userConfig)
    }
    set({ audioReason: { kind: 'Item', itemPlayback: this.itemPlayback } })
    const fast = st.playMethod === 'DirectPlay' && subtitleIndex === this.request.subtitleIndex && this.trySwitchAudioInPlace(index, source)
    if (fast) {
      this.request = { ...this.request, audioIndex: index }
      set({ audioIndex: index })
      this.reporter?.updateTracks(index, subtitleIndex)
      return
    }
    // A progressive <video> without the audioTracks API plays only the file's first audio track (spec B4 "ExoPlayer
    // in-player audio switch in direct play"). The device profile says so (IsSecondaryAudio), so the server answers
    // a request for any other track with a remux and for the first one with direct play again: no ladder step.
    void this.changeStreams({ ...this.request, audioIndex: index, subtitleIndex, positionMs: this.positionMs(), ...flagsOf(restartFlags(this.ladder)) })
  }

  private trySwitchAudioInPlace(index: number, source: MediaSourceInfo): boolean {
    const tracks = this.backend?.audioTracks() ?? []
    if (tracks.length === 0) return false
    const sel = createTrackSelections(tracks, index, null, source)
    return sel.audio === 'SELECTED' && !!sel.audioTrack && !!this.backend?.selectAudioTrack(sel.audioTrack.id)
  }

  /**
   * `changeSubtitleStream`: index is a stream index or TrackIndex.DISABLED / ONLY_FORCED. External text/ASS swaps
   * in the renderer without touching the stream; burn-in formats (or leaving one) restart the stream.
   */
  setSubtitle(index: number) {
    const st = get()
    const item = st.item
    const source = st.source
    if (!item || !source || !this.request) return
    this.itemPlayback = saveTrackSelection(item, this.itemPlayback, index, 'Subtitle')
    const ctx = sessionCtx()
    const resolved = resolveSubtitleIndex(source, st.audioIndex, index, choicePrefs(), ctx?.userConfig)
    const target = resolved != null && resolved >= 0 ? ((source.MediaStreams ?? []).find((s) => s.Type === 'Subtitle' && s.Index === resolved) ?? null) : null
    set({ subtitleChoice: index, subtitleReason: { kind: 'Item', itemPlayback: this.itemPlayback } })
    const concrete = target?.Index ?? null
    const inPlace = this.burnedSubtitle == null && (target == null || target.DeliveryMethod === 'External')
    if (inPlace) {
      this.request = { ...this.request, subtitleIndex: concrete }
      set({ subtitleIndex: concrete })
      this.reporter?.updateTracks(st.audioIndex, concrete)
      void this.loadSubtitleFor(target, source, item.Id ?? '', this.gen)
      return
    }
    void this.changeStreams({ ...this.request, subtitleIndex: concrete, positionMs: this.positionMs(), ...flagsOf(restartFlags(this.ladder)) })
  }

  /** `changeMaxBitrate`: session-only cap; restarts unless unchanged. */
  setMaxBitrate(bitsPerSecond: number) {
    if (!this.request || bitsPerSecond === get().maxBitrate) return
    void this.changeStreams({ ...this.request, maxBitrate: bitsPerSecond, positionMs: this.positionMs(), ...flagsOf(restartFlags(this.ladder)) })
  }

  private async loadSubtitleFor(stream: MediaStream | null, source: MediaSourceInfo, itemId: string, gen: number) {
    this.subtitleAbort?.abort()
    this.flushDelaySave()
    if (!stream) {
      set({ subtitle: null, subtitleLoading: false, subtitleDelayMs: 0 })
      return
    }
    const ctx = sessionCtx()
    if (!ctx) return
    const abort = new AbortController()
    this.subtitleAbort = abort
    set({ subtitleLoading: true, subtitle: null, subtitleDelayMs: getSubtitleDelay(itemId, stream.Index ?? -1) })
    try {
      const data = await loadSubtitle(stream, {
        baseUrl: ctx.baseUrl,
        authorization: ctx.authorization,
        itemId,
        source,
        assMode: getPrefs().assSubtitleMode,
        signal: abort.signal,
      })
      if (abort.signal.aborted || gen !== this.gen) return
      set({ subtitle: data, subtitleLoading: false })
    } catch {
      if (!abort.signal.aborted) set({ subtitle: { kind: 'unavailable', streamIndex: stream.Index ?? -1 }, subtitleLoading: false })
    }
  }

  /** Subtitle delay in ms (positive = later). Saved per item and track after 1.5 s (spec 05 §4.4). */
  setSubtitleDelay(ms: number) {
    set({ subtitleDelayMs: ms })
    const itemId = get().item?.Id
    const idx = get().subtitleIndex
    if (!itemId || idx == null) return
    if (this.delaySave) clearTimeout(this.delaySave)
    this.delaySave = setTimeout(() => {
      this.delaySave = null
      saveSubtitleDelay(itemId, idx, ms)
    }, SUBTITLE_DELAY_SAVE_MS)
  }

  adjustSubtitleDelay(deltaMs: number) {
    this.setSubtitleDelay(get().subtitleDelayMs + deltaMs)
  }

  private flushDelaySave() {
    if (!this.delaySave) return
    clearTimeout(this.delaySave)
    this.delaySave = null
    const st = get()
    if (st.item?.Id && st.subtitleIndex != null) saveSubtitleDelay(st.item.Id, st.subtitleIndex, st.subtitleDelayMs)
  }

  // -------------------------------------------------------------------------------------------
  // Transport

  positionMs(): number {
    if (this.pendingStartMs != null) return this.pendingStartMs
    return Math.max(0, (this.video.currentTime || 0) * 1000)
  }

  private setPendingStart(ms: number | null) {
    this.pendingStartMs = ms == null ? null : Math.max(0, ms)
    this.pendingUserSeek = false
  }

  /** The loading stream reached playable data: the element's position is real from now on. */
  private settlePendingStart() {
    if (this.pendingStartMs == null) return
    const target = this.pendingStartMs
    const userSeek = this.pendingUserSeek
    this.setPendingStart(null)
    if (userSeek && Math.abs(this.video.currentTime * 1000 - target) > 1000) this.video.currentTime = target / 1000
  }

  /** Play; when un-pausing, rewinds by skipBackOnResume (on-screen Play, one-click pause, media session). */
  play() {
    this.reportInteraction()
    const skip = getPrefs().skipBackOnResume
    if (this.video.paused && skip > 0 && this.video.currentTime > 0) {
      this.video.currentTime = Math.max(0, this.video.currentTime - skip / 1000)
    }
    set({ autoplayBlocked: false })
    this.attemptPlay()
  }

  pause() {
    this.reportInteraction()
    this.video.pause()
  }

  togglePlay() {
    if (this.video.paused) this.play()
    else this.pause()
  }

  seekTo(ms: number) {
    const dur = get().durationMs
    const target = Math.max(0, dur > 0 ? Math.min(ms, dur) : ms)
    if (this.pendingStartMs != null) {
      // still loading: the backend would override a seek on the empty element with its start position
      this.pendingStartMs = target
      this.pendingUserSeek = true
    } else {
      this.video.currentTime = target / 1000
    }
    set({ positionMs: target })
  }

  seekBy(deltaMs: number) {
    this.seekTo(this.positionMs() + deltaMs)
  }

  skipBack() {
    this.seekBy(-getPrefs().skipBack)
  }

  skipForward() {
    this.seekBy(getPrefs().skipForward)
  }

  setPlaybackRate(rate: number) {
    // the media load algorithm resets playbackRate to defaultPlaybackRate on every new stream (track/bitrate
    // restarts, next item); the speed is kept for the whole page like upstream's remembered playbackSpeed
    this.video.defaultPlaybackRate = rate
    this.video.playbackRate = rate
    set({ playbackRate: rate })
  }

  setVolume(v: number) {
    this.video.volume = Math.min(1, Math.max(0, v))
  }

  setMuted(m: boolean) {
    this.video.muted = m
  }

  /** Any user interaction (keys, pointer, touch); feeds pass-out protection. */
  reportInteraction() {
    this.lastInteraction = Date.now()
  }

  // -------------------------------------------------------------------------------------------
  // Segments

  private async listenForSegments(ctx: SessionCtx, itemId: string, session: number) {
    let segments
    try {
      segments = (await getMediaSegmentApi(ctx.api).getItemSegments({ itemId })).data.Items ?? []
    } catch {
      return
    }
    if (session !== this.session || norm(get().item?.Id) !== norm(itemId) || segments.length === 0) return
    set({ segments })
    if (this.segTimer) clearInterval(this.segTimer)
    this.segTimer = setInterval(() => {
      const st = get()
      const next = st.queue[st.index + 1]
      const r = evaluateSegments({
        segments,
        positionMs: this.positionMs(),
        itemId,
        prefs: getPrefs(),
        hasNext: st.hasNext,
        nextIsMedia: next?.kind === 'media',
        handled: this.segmentHandled,
        outroShown: this.outroShown,
      })
      if (r.markOutroShown) this.outroShown.add(r.markOutroShown)
      if (r.showNextUp) this.showNextUp(st.index + 1)
      if (r.markHandled) this.segmentHandled.add(r.markHandled)
      if (r.seekToMs != null) {
        this.seekTo(r.seekToMs)
        const seg = r.state && r.state !== 'keep' ? r.state.segment : null
        if (seg) set({ autoSkipped: { segmentId: seg.Id ?? '', type: seg.Type ?? 'Unknown', at: Date.now() } })
      }
      if (r.state !== 'keep' && (r.state?.segment.Id !== st.segment?.segment.Id || r.state?.interacted !== st.segment?.interacted)) {
        set({ segment: r.state })
      }
    }, SEGMENT_POLL_MS)
  }

  /** Floating Skip button clicked (`updateSegment(id, dismissed = false)`): seek past the end + 1 ms. */
  skipSegment() {
    const seg = get().segment?.segment
    if (!seg?.Id) return
    this.segmentHandled.add(seg.Id)
    set({ segment: null })
    this.seekTo(segmentEndMs(seg) + 1)
  }

  /** Skip button dismissed by Back or its 10 s timeout (`updateSegment(id, dismissed = true)`). */
  dismissSegment() {
    const s = get().segment
    if (!s?.segment.Id) return
    this.segmentHandled.add(s.segment.Id)
    set({ segment: { ...s, interacted: true } })
  }

  // -------------------------------------------------------------------------------------------
  // Next up

  private showNextUp(start: number) {
    const { queue, item: playing } = get()
    // never offer the item that is playing (a second copy of it in the queue)
    let index = start
    while (index < queue.length && isSameMedia(queue[index].item, playing)) index++
    const entry = queue[index]
    if (!entry || entry.kind !== 'media') return
    const autoplay = shouldAutoPlayNextUp(getPrefs(), this.lastInteraction, Date.now())
    const countdown = nextUpCountdownStart(getPrefs(), autoplay)
    set({ nextUp: { index, item: entry.item, countdown } })
    if (this.nextUpTimer) clearInterval(this.nextUpTimer)
    this.nextUpTimer = null
    if (countdown == null) return
    if (countdown <= 0) {
      this.playNextUp()
      return
    }
    this.nextUpTimer = setInterval(() => {
      const nu = get().nextUp
      if (!nu || nu.countdown == null) return this.clearNextUpTimer()
      const left = nu.countdown - 1
      if (left <= 0) {
        this.clearNextUpTimer()
        this.playNextUp()
      } else set({ nextUp: { ...nu, countdown: left } })
    }, 1000)
  }

  private clearNextUpTimer() {
    if (this.nextUpTimer) clearInterval(this.nextUpTimer)
    this.nextUpTimer = null
  }

  /** Play the Next Up entry now (card click or countdown end). */
  playNextUp() {
    const nu = get().nextUp
    this.reportInteraction()
    this.clearNextUpTimer()
    set({ nextUp: null })
    if (nu) this.playQueueIndex(nu.index)
    else this.next()
  }

  /** Back while counting down: stop autoplay, keep the panel. */
  cancelNextUpCountdown() {
    this.clearNextUpTimer()
    const nu = get().nextUp
    if (nu) set({ nextUp: { ...nu, countdown: null } })
  }

  /** Hide the panel (`cancelUpNextEpisode`). */
  cancelNextUp() {
    this.clearNextUpTimer()
    if (get().nextUp) set({ nextUp: null })
  }

  /**
   * The Back chain while controls are hidden (PlaybackPage BackHandlers): Skip button -> Next Up countdown ->
   * Next Up panel (or leave when the item has finished). Returns true when consumed; false = leave the player.
   */
  handleBack(): boolean {
    const st = get()
    if (st.segment && !st.segment.interacted && !st.nextUp) {
      this.dismissSegment()
      return true
    }
    if (st.nextUp) {
      if (st.nextUp.countdown != null && st.nextUp.countdown > 0) {
        this.cancelNextUpCountdown()
        return true
      }
      if (!this.video.paused && !this.video.ended) {
        this.cancelNextUp()
        return true
      }
      return false
    }
    return false
  }

  private onEnded() {
    const st = get()
    this.reporter?.onEnded(this.video.duration * 1000 || st.durationMs)
    const next = st.queue[st.index + 1] ?? null
    const prefs = getPrefs()
    const action = endOfItemAction(next?.kind ?? null, st.entryKind ?? 'media', prefs, shouldAutoPlayNextUp(prefs, this.lastInteraction, Date.now()))
    switch (action) {
      case 'play-next':
        void this.advance(1)
        break
      case 'show-next-up':
        if (!st.nextUp) this.showNextUp(st.index + 1)
        break
      case 'show-controls':
        set({ status: 'ended', showControlsSignal: st.showControlsSignal + 1 })
        break
      case 'exit':
        this.requestExit('ended')
        break
    }
  }

  // -------------------------------------------------------------------------------------------
  // Trickplay

  /** Image URL and sprite rectangle for a position, or null without trickplay. */
  trickplayImage(positionMs: number): TrickplayImage | null {
    const st = get()
    const ctx = sessionCtx()
    if (!st.trickplay || !st.item?.Id || !ctx) return null
    return trickplayImageAt(ctx.baseUrl, ctx.token, st.item.Id, st.source?.Id ?? null, st.trickplay, positionMs)
  }

  private prefetchTrickplay(ctx: SessionCtx, itemId: string, sourceId: string | null, info: NonNullable<PlaybackEngineState['trickplay']>, durationMs: number) {
    const n = Math.min(trickplaySheetCount(info, durationMs), 200)
    for (let i = 0; i < n; i++) {
      const img = new Image()
      img.decoding = 'async'
      img.src = trickplayTileUrl(ctx.baseUrl, itemId, info.Width ?? 0, i, sourceId, ctx.token)
    }
  }

  // -------------------------------------------------------------------------------------------
  // Element events, media session

  private clearItemTimers() {
    if (this.segTimer) clearInterval(this.segTimer)
    this.segTimer = null
    this.segmentHandled.clear()
    this.outroShown.clear()
    this.clearNextUpTimer()
  }

  private bindVideoEvents() {
    const v = this.video
    const isCurrent = () => this.loadedGen === this.gen && this.loadedGen >= 0
    v.addEventListener('playing', () => {
      if (!isCurrent()) return
      if (this.startTimer) clearTimeout(this.startTimer)
      this.settlePendingStart()
      this.releaseFrame()
      set({ status: 'playing', paused: false, autoplayBlocked: false })
      this.reporter?.onPlayingChanged(true)
      if (this.request?.item.MediaType !== 'Audio' && (get().source?.MediaStreams ?? []).some((s) => s.Type === 'Video')) this.watchdog.start()
      keepScreenOn(true)
      updateMediaPosition(this.positionMs(), get().durationMs, v.playbackRate, false, true)
    })
    v.addEventListener('pause', () => {
      if (!isCurrent()) return
      set({ status: v.ended ? 'ended' : 'paused', paused: true })
      this.reporter?.onPlayingChanged(false)
      keepScreenOn(false)
      updateMediaPosition(this.positionMs(), get().durationMs, v.playbackRate, true, true)
    })
    v.addEventListener('waiting', () => {
      if (isCurrent() && !v.paused) set({ status: 'buffering' })
    })
    v.addEventListener('canplay', () => {
      if (!isCurrent()) return
      if (this.startTimer) clearTimeout(this.startTimer)
      this.settlePendingStart()
      this.releaseFrame()
      if (get().status === 'loading' || get().status === 'buffering') set({ status: v.paused ? 'paused' : 'playing' })
    })
    v.addEventListener('timeupdate', () => {
      if (!isCurrent()) return
      const b = v.buffered
      let buffered = 0
      for (let i = 0; i < b.length; i++) if (b.start(i) <= v.currentTime + 0.5) buffered = Math.max(buffered, b.end(i))
      const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration * 1000 : get().durationMs
      set({ positionMs: this.positionMs(), bufferedMs: buffered * 1000, durationMs: dur })
      updateMediaPosition(this.positionMs(), dur, v.playbackRate, v.paused)
    })
    v.addEventListener('loadedmetadata', () => {
      if (!isCurrent()) return
      v.playbackRate = get().playbackRate
      set({ videoWidth: v.videoWidth, videoHeight: v.videoHeight })
    })
    v.addEventListener('resize', () => set({ videoWidth: v.videoWidth, videoHeight: v.videoHeight }))
    v.addEventListener('seeked', () => {
      if (isCurrent()) this.reporter?.onSeeked()
    })
    v.addEventListener('volumechange', () => set({ volume: v.volume, muted: v.muted }))
    v.addEventListener('ratechange', () => set({ playbackRate: v.playbackRate }))
    v.addEventListener('ended', () => {
      if (isCurrent()) this.onEnded()
    })
    v.addEventListener('error', () => {
      if (!isCurrent() || !this.backend || this.backend.kind === 'hlsjs') return
      // ignore errors from the src being cleared during teardown
      if (!v.getAttribute('src') || v.src !== new URL(this.loadedUrl ?? '', location.href).href) return
      const m = get().playMethod
      if (m) this.onFailure(this.gen, m, 'media-error', v.error ? `MediaError ${v.error.code}${v.error.message ? `: ${v.error.message}` : ''}` : undefined)
    })
  }

  private bindMediaSession() {
    this.unbindMediaSession?.()
    this.unbindMediaSession = bindMediaSession({
      play: () => this.play(),
      pause: () => this.pause(),
      seekBackward: () => this.skipBack(),
      seekForward: () => this.skipForward(),
      seekTo: (ms) => this.seekTo(ms),
      previous: () => this.previous(),
      next: () => this.next(),
      stop: () => this.stop('user'),
    })
  }

  private updateMediaMetadata(item: BaseItemDto) {
    setMediaMetadata({
      title: itemTitle(item) ?? '',
      subtitle: item.Type === 'Episode' ? episodeLine(t, item) : item.ProductionYear != null ? String(item.ProductionYear) : '',
      artworkUrl: hasPrimaryArtwork(item) ? itemImageUrl(item, 'Primary', { width: 512 }) : null,
    })
  }
}

function flagsOf(f: { allowDirectPlay?: boolean; allowDirectStream?: boolean; enableDirectPlay?: boolean; enableDirectStream?: boolean }) {
  return {
    enableDirectPlay: f.enableDirectPlay ?? f.allowDirectPlay ?? true,
    enableDirectStream: f.enableDirectStream ?? f.allowDirectStream ?? true,
  }
}

let instance: PlaybackEngine | null = null

/** The page-wide engine (created on first use, so importing this module has no side effects). */
export function getPlaybackEngine(): PlaybackEngine {
  if (!instance) {
    instance = new PlaybackEngine()
    // test hook for the Playwright verification scripts
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__playback = { engine: instance, store: usePlaybackStore }
  }
  return instance
}
