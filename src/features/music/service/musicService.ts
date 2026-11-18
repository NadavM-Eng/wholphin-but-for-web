// The music player service (W/services/MusicService.kt): one app-wide queue and its own audio output,
// separate from the video player. It lives at module level, so music keeps playing while the user navigates.
// State is published in src/stores/musicQueue.ts; pages call the commands below.
//
// Output: two <audio> elements (never in the DOM). One plays; the other preloads the next direct-play track
// during the last 30 s, and the two swap on track end (gapless-ish). Transcoded tracks are not preloaded.
import type { Api } from '@jellyfin/sdk'
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { getInstantMixApi } from '@jellyfin/sdk/lib/utils/api/instant-mix-api'
import { getSession } from '../../../api/session'
import { toast } from '../../../app/toast'
import { i18next } from '../../../i18n'
import { MUSIC_QUEUE_EMPTY, useMusicQueue, type AudioItem, type MusicQueueState } from '../../../stores/musicQueue'
import { DETAIL_ITEM_FIELDS } from '../../common/itemFields'
import { detectCapabilities } from '../../playback/engine/capabilities'
import { bindMediaSession, updateMediaPosition } from '../../playback/engine/platform'
import { addMediaPlayingProbe } from '../../photos/screensaverService'
import { allSongs, songPages, sourceForItem, type SongSource } from '../data/songSources'
import {
  appendEntries,
  insertNext,
  MAX_SEEK_TO_PREVIOUS_MS,
  moveEntry,
  nextIndex,
  nextRepeatMode,
  previousIndex,
  removeEntry,
  shuffleOrderFrom,
} from '../queue/queueOps'
import { audioOnly, toAudioItem } from './audioItem'
import { MusicReporter, stopTranscode } from './reporter'
import { browserAudioContainers, canDirectPlay, universalAudioUrl } from './streamUrl'
import { stopThemeSong } from './themeSongs'
import { ensureVisualizerTap } from './visualizerTap'

/** MusicService/NowPlaying: Rewind 10 s, FastForward 30 s. */
export const SEEK_BACK_MS = 10_000
export const SEEK_FORWARD_MS = 30_000
/** Start preloading the next track when this much of the current one is left. */
const PRELOAD_LEAD_MS = 30_000

type Stream = { key: string; itemId: string; transcode: boolean; offsetMs: number; playSessionId: string }

const set = (patch: Partial<MusicQueueState> | ((s: MusicQueueState) => Partial<MusicQueueState>)) => useMusicQueue.setState(patch)
const get = () => useMusicQueue.getState()

let elements: [HTMLAudioElement, HTMLAudioElement] | null = null
let activeSlot: 0 | 1 = 0
let stream: Stream | null = null
let preloaded: { key: string; slot: 0 | 1 } | null = null
let reporter: MusicReporter | null = null
let sessionApi: Api | null = null
let unbindMediaSession: (() => void) | null = null
let containers: string[] | null = null
let corsFailed = false
/** bumps on every queue replacement / stop so stale async fills stop appending */
let fillGeneration = 0
/** ignore pause events fired by our own source switches */
let switching = false
let pagehideBound = false

function activeEl(): HTMLAudioElement | null {
  return elements ? elements[activeSlot] : null
}

// The elements are detached (new Audio()), so the screensaver's document scan cannot see them.
addMediaPlayingProbe(() => {
  const el = activeEl()
  return el != null && !el.paused && !el.ended
})

function makeElement(): HTMLAudioElement {
  const el = new Audio()
  el.preload = 'auto'
  if (!corsFailed) el.crossOrigin = 'anonymous'
  el.addEventListener('playing', onPlaying)
  el.addEventListener('pause', onPause)
  el.addEventListener('timeupdate', onTime)
  el.addEventListener('durationchange', onTime)
  el.addEventListener('progress', onTime)
  el.addEventListener('waiting', onWaiting)
  el.addEventListener('ended', onEnded)
  el.addEventListener('error', onError)
  return el
}

function ensureElements(): [HTMLAudioElement, HTMLAudioElement] {
  if (!elements) {
    elements = [makeElement(), makeElement()]
    const { volume, muted } = get()
    for (const el of elements) {
      el.volume = volume
      el.muted = muted
    }
  }
  return elements
}

async function audioContainers(): Promise<string[]> {
  if (containers) return containers
  const caps = await detectCapabilities()
  const a = caps.audio
  const wav = typeof document !== 'undefined' && document.createElement('audio').canPlayType('audio/wav') !== ''
  containers = browserAudioContainers({
    aac: a.aac.file,
    mp3: a.mp3.file,
    opus: a.opus.file,
    flac: a.flac.file,
    vorbis: a.vorbis.file,
    alac: a.alac.file,
    wav,
  })
  return containers
}

function newPlaySessionId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '') : `${Date.now()}${Math.random()}`
}

function positionOf(el: HTMLAudioElement | null): number {
  if (!el || !stream) return 0
  return stream.offsetMs + (Number.isFinite(el.currentTime) ? el.currentTime * 1000 : 0)
}

function durationOf(el: HTMLAudioElement | null, entry: AudioItem | null): number {
  if (el && stream && !stream.transcode && Number.isFinite(el.duration) && el.duration > 0) return el.duration * 1000
  return entry?.runtimeMs ?? (el && Number.isFinite(el.duration) ? el.duration * 1000 : 0)
}

function currentAudio(): AudioItem | null {
  const s = get()
  return s.entries[s.currentIndex] ?? null
}

// ---------------------------------------------------------------------------------------------
// Session (MusicService.start / stop)

function ensureSession(): Api | null {
  const s = getSession()
  if (!s) return null
  if (!reporter || sessionApi !== s.api) {
    reporter?.stop()
    sessionApi = s.api
    reporter = new MusicReporter(s.api, () => {
      const entry = currentAudio()
      if (!entry || !stream) return null
      const el = activeEl()
      return {
        itemId: entry.id,
        positionMs: positionOf(el),
        paused: el?.paused ?? true,
        muted: el?.muted ?? false,
        playMethod: stream.transcode ? 'Transcode' : 'DirectPlay',
        playSessionId: stream.playSessionId,
      }
    })
  }
  if (!unbindMediaSession) {
    unbindMediaSession = bindMediaSession({
      play: () => play(),
      pause: () => pause(),
      seekBackward: () => seekBy(-SEEK_BACK_MS),
      seekForward: () => seekBy(SEEK_FORWARD_MS),
      seekTo: (ms) => seekTo(ms),
      previous: () => previous(),
      next: () => next(),
      stop: () => stop(),
    })
  }
  if (!pagehideBound && typeof window !== 'undefined') {
    pagehideBound = true
    window.addEventListener('pagehide', () => {
      if (stream?.transcode && sessionApi) stopTranscode(sessionApi, stream.playSessionId)
      reporter?.stop(true)
    })
  }
  stopThemeSong()
  return s.api
}

/** `MusicService.stop()`: Stopped report, release the output, clear the queue. */
export function stop() {
  fillGeneration++
  reporter?.stop()
  reporter = null
  if (stream?.transcode && sessionApi) stopTranscode(sessionApi, stream.playSessionId)
  stream = null
  preloaded = null
  sessionApi = null
  unbindMediaSession?.()
  unbindMediaSession = null
  if (elements) {
    switching = true
    for (const el of elements) {
      el.pause()
      el.removeAttribute('src')
      el.load()
    }
    switching = false
  }
  const { volume, muted } = get()
  set({ ...MUSIC_QUEUE_EMPTY, volume, muted, version: get().version + 1 })
}

// ---------------------------------------------------------------------------------------------
// Loading a track

async function loadCurrent(autoplay: boolean, startMs = 0) {
  const entry = currentAudio()
  const api = sessionApi ?? ensureSession()
  const session = getSession()
  if (!entry || !api || !session) return
  const [a, b] = ensureElements()
  const list = await audioContainers()
  // the queue may have moved on while capabilities were detected
  if (currentAudio()?.key !== entry.key) return
  const transcode = !canDirectPlay(entry, list)
  if (stream?.transcode && sessionApi) stopTranscode(sessionApi, stream.playSessionId)
  set({ error: null, positionMs: startMs, durationMs: entry.runtimeMs ?? 0, bufferedMs: 0 })
  switching = true
  try {
    if (preloaded && preloaded.key === entry.key && !transcode && startMs === 0) {
      const prev = activeEl()
      activeSlot = preloaded.slot
      preloaded = null
      if (prev && prev !== activeEl()) {
        prev.pause()
        prev.removeAttribute('src')
        prev.load()
      }
      const el = activeEl()!
      stream = { key: entry.key, itemId: entry.id, transcode: false, offsetMs: 0, playSessionId: el.dataset.playSessionId ?? newPlaySessionId() }
      el.currentTime = 0
    } else {
      const playSessionId = newPlaySessionId()
      const el = (elements ?? [a, b])[activeSlot]
      const other = (elements ?? [a, b])[activeSlot === 0 ? 1 : 0]
      if (preloaded) {
        other.removeAttribute('src')
        other.load()
        preloaded = null
      }
      el.pause()
      stream = { key: entry.key, itemId: entry.id, transcode, offsetMs: transcode ? startMs : 0, playSessionId }
      el.src = universalAudioUrl({
        baseUrl: api.basePath,
        token: api.accessToken,
        itemId: entry.id,
        userId: session.user.id,
        deviceId: api.deviceInfo.id,
        containers: list,
        playSessionId,
        startMs: transcode ? startMs : 0,
      })
      el.dataset.playSessionId = playSessionId
      if (!transcode && startMs > 0) {
        const seek = () => {
          el.currentTime = startMs / 1000
        }
        el.addEventListener('loadedmetadata', seek, { once: true })
      }
      el.load()
    }
  } finally {
    switching = false
  }
  updateMetadata(entry)
  if (autoplay) await playActive()
  else set({ status: 'paused', pausedAt: get().pausedAt ?? Date.now() })
}

async function playActive() {
  const el = activeEl()
  if (!el) return
  try {
    await el.play()
  } catch (e) {
    if ((e as DOMException)?.name === 'NotAllowedError') set({ status: 'paused', pausedAt: Date.now() })
  }
}

function preloadNext() {
  const s = get()
  if (!elements || !stream || !containers) return
  const idx = nextIndex(s, true)
  const entry = idx >= 0 ? s.entries[idx] : null
  if (!entry || entry.key === stream.key || preloaded?.key === entry.key) return
  if (!canDirectPlay(entry, containers)) return
  const session = getSession()
  if (!session || !sessionApi) return
  const slot: 0 | 1 = activeSlot === 0 ? 1 : 0
  const el = elements[slot]
  const playSessionId = newPlaySessionId()
  el.src = universalAudioUrl({
    baseUrl: sessionApi.basePath,
    token: sessionApi.accessToken,
    itemId: entry.id,
    userId: session.user.id,
    deviceId: sessionApi.deviceInfo.id,
    containers,
    playSessionId,
  })
  el.dataset.playSessionId = playSessionId
  el.preload = 'auto'
  el.load()
  preloaded = { key: entry.key, slot }
}

function updateMetadata(entry: AudioItem) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: entry.title ?? '',
      artist: entry.artistNames ?? '',
      album: entry.albumTitle ?? '',
      artwork: entry.imageUrl ? [{ src: entry.imageUrl }] : [],
    })
  } catch {
    // MediaMetadata unavailable
  }
}

// ---------------------------------------------------------------------------------------------
// Element events (only the active element counts)

function isActive(e: Event) {
  return e.target === activeEl()
}

function onPlaying(e: Event) {
  if (!isActive(e)) return
  set({ status: 'playing', pausedAt: null, buffering: false })
  reporter?.onPlaying()
  syncPosition(true)
}

function onPause(e: Event) {
  if (!isActive(e) || switching) return
  const el = e.target as HTMLAudioElement
  if (el.ended) return
  set({ status: 'paused', pausedAt: Date.now() })
  reporter?.progress()
  syncPosition(true)
}

function onWaiting(e: Event) {
  if (isActive(e)) set({ buffering: true })
}

function syncPosition(force = false) {
  const el = activeEl()
  const entry = currentAudio()
  const positionMs = positionOf(el)
  const durationMs = durationOf(el, entry)
  let bufferedMs = 0
  if (el && el.buffered.length) bufferedMs = (stream?.offsetMs ?? 0) + el.buffered.end(el.buffered.length - 1) * 1000
  set({ positionMs, durationMs, bufferedMs })
  updateMediaPosition(positionMs, durationMs, 1, el?.paused ?? true, force)
  if (durationMs > 0 && durationMs - positionMs < PRELOAD_LEAD_MS && !el?.paused) preloadNext()
}

function onTime(e: Event) {
  if (!isActive(e)) return
  if (get().buffering && !(e.target as HTMLAudioElement).paused && e.type === 'timeupdate') set({ buffering: false })
  syncPosition()
}

function onEnded(e: Event) {
  if (!isActive(e)) return
  const el = e.target as HTMLAudioElement
  // STATE_ENDED: progress with position = duration
  reporter?.progress(durationOf(el, currentAudio()))
  const s = get()
  const idx = nextIndex(s, true)
  if (idx < 0) {
    // queue end leaves the state PAUSED
    set({ status: 'paused', pausedAt: Date.now() })
    return
  }
  if (idx === s.currentIndex) {
    el.currentTime = 0
    void playActive()
    return
  }
  set({ currentIndex: idx })
  void loadCurrent(true)
}

function onError(e: Event) {
  if (!isActive(e)) return
  const el = e.target as HTMLAudioElement
  // A server without CORS headers cannot feed the visualizer: retry once without crossOrigin.
  if (!corsFailed && el.crossOrigin) {
    corsFailed = true
    if (elements) for (const x of elements) x.removeAttribute('crossorigin')
    void loadCurrent(true, get().positionMs)
    return
  }
  const message = el.error?.message || i18next.t('web_playback_error_failed')
  set({ error: message })
  toast(i18next.t('web_music_error', { p1: currentAudio()?.title ?? '', p2: message }))
  const s = get()
  const idx = nextIndex(s, false)
  if (idx >= 0 && idx !== s.currentIndex) {
    set({ currentIndex: idx })
    void loadCurrent(true)
  } else {
    set({ status: 'paused', pausedAt: Date.now() })
  }
}

// ---------------------------------------------------------------------------------------------
// Queue commands

function bumpVersion() {
  set((s) => ({ version: s.version + 1 }))
}

/** `setQueue(list, shuffled)`: replaces the queue with the AUDIO items of `items` and starts playing. */
export async function setQueue(items: readonly (BaseItemDto | null | undefined)[], shuffled: boolean) {
  const api = ensureSession()
  if (!api) return
  fillGeneration++
  const entries = audioOnly(items).map((i) => toAudioItem(i, api.basePath))
  const base = { ...get(), entries: [], currentIndex: 0, order: [], shuffle: shuffled }
  const next = appendEntries(base, entries)
  set({ ...next, shuffle: shuffled, loading: false })
  bumpVersion()
  if (entries.length) await loadCurrent(true)
}

/**
 * `setQueue(pager, startIndex, shuffled)`: clears the queue and appends the songs of `source` from
 * `startIndex` on, page by page; playback starts with the first page.
 */
export async function setQueueFromSource(source: SongSource, startIndex: number, shuffled: boolean) {
  const api = ensureSession()
  const session = getSession()
  if (!api || !session) return
  const gen = ++fillGeneration
  set({ entries: [], currentIndex: 0, order: [], shuffle: shuffled, loading: true })
  bumpVersion()
  let first = true
  try {
    for await (const page of songPages(api, session.user.id, source, startIndex)) {
      if (gen !== fillGeneration) return
      const items = audioOnly(page).map((i) => toAudioItem(i, api.basePath))
      set((s) => appendEntries(s, items))
      bumpVersion()
      if (first && get().entries.length) {
        first = false
        void loadCurrent(true)
      }
    }
  } catch (e) {
    if (gen === fillGeneration) toast(i18next.t('web_music_error', { p1: '', p2: (e as Error).message }))
  } finally {
    if (gen === fillGeneration) set({ loading: false })
  }
}

/** `MusicViewModel.play(item, startIndex, shuffled)`: AUDIO -> that song; album/artist/playlist -> their songs. */
export async function playItem(item: BaseItemDto, opts: { startIndex?: number; shuffle?: boolean } = {}) {
  if (item.Type === 'Audio') return setQueue([item], opts.shuffle ?? false)
  const source = sourceForItem(item)
  if (source) return setQueueFromSource(source, opts.startIndex ?? 0, opts.shuffle ?? false)
}

/** A music library's Play all / Shuffle (CollectionFolderMusic.onClickPlayAll). */
export function playLibrary(libraryId: string, shuffle: boolean) {
  return setQueueFromSource({ kind: 'library', id: libraryId }, 0, shuffle)
}

/** Play all / Shuffle of a music library's genre page: that genre's songs in the library. */
export function playLibraryGenre(libraryId: string, genreId: string, shuffle: boolean) {
  return setQueueFromSource({ kind: 'genre', id: libraryId, genreId }, 0, shuffle)
}

async function expand(item: BaseItemDto): Promise<BaseItemDto[]> {
  if (item.Type === 'Audio') return [item]
  const source = sourceForItem(item)
  const session = getSession()
  if (!source || !session) return []
  return allSongs(session.api, session.user.id, source)
}

/**
 * "Add to queue" (MusicViewModel.addToQueue -> addAllToQueue): appends the song, or every song of an album,
 * artist or playlist, at the end; like upstream (`start()` = prepare + play) it starts or resumes playback.
 */
export async function addToQueue(item: BaseItemDto) {
  const api = ensureSession()
  if (!api) return
  set({ loading: true })
  try {
    const items = audioOnly(await expand(item)).map((i) => toAudioItem(i, api.basePath))
    if (!items.length) return
    const wasEmpty = get().entries.length === 0
    set((s) => appendEntries(s, items))
    bumpVersion()
    if (wasEmpty || !stream) await loadCurrent(true)
    else if (activeEl()?.paused) await playActive()
  } finally {
    set({ loading: false })
  }
}

/**
 * "Play next" (MusicService.playNext): inserts after the current song. Upstream has no AUDIO guard and would
 * queue an album id as a song (spec 04 B.7); the web expands albums, artists and playlists into their songs
 * (spec 08 MU-2) and starts a new queue when nothing is queued (upstream: index out of range).
 */
export async function playNext(item: BaseItemDto) {
  const api = ensureSession()
  if (!api) return
  const items = audioOnly(await expand(item)).map((i) => toAudioItem(i, api.basePath))
  if (!items.length) return
  const wasEmpty = get().entries.length === 0
  set((s) => insertNext(s, items))
  bumpVersion()
  if (wasEmpty || !stream) await loadCurrent(true)
}

/** `startInstantMix(itemId)`: `GET /Items/{id}/InstantMix?limit=200` replaces the queue. */
export async function startInstantMix(itemId: string) {
  const session = getSession()
  if (!session) return
  set({ loading: true })
  try {
    const res = await getInstantMixApi(session.api).getInstantMixFromItem({
      itemId,
      userId: session.user.id,
      limit: 200,
      fields: DETAIL_ITEM_FIELDS,
    })
    await setQueue(res.data.Items ?? [], false)
  } catch (e) {
    toast(i18next.t('web_music_error', { p1: '', p2: (e as Error).message }))
  } finally {
    set({ loading: false })
  }
}

/** `playIndex(i)` = seekTo(i, 0) + play. */
export async function playIndex(index: number) {
  const s = get()
  if (index < 0 || index >= s.entries.length) return
  // with shuffle on the order is kept; playback continues from the chosen entry's place in it
  set({ currentIndex: index })
  await loadCurrent(true)
}

export function play() {
  const el = activeEl()
  if (!el || !stream) {
    if (get().entries.length) void loadCurrent(true)
    return
  }
  const s = get()
  // after the queue ended, Play starts it again from the current entry
  if (el.ended) el.currentTime = 0
  if (s.status === 'paused' && s.positionMs >= s.durationMs - 250 && s.durationMs > 0) el.currentTime = 0
  void playActive()
}

export function pause() {
  activeEl()?.pause()
}

export function togglePlay() {
  const el = activeEl()
  if (!el || el.paused) play()
  else pause()
}

/** Media3 seekToNext (repeat ONE behaves as OFF). */
export function next() {
  const s = get()
  const idx = nextIndex(s, false)
  if (idx < 0) return
  set({ currentIndex: idx })
  void loadCurrent(!(activeEl()?.paused ?? true) || get().status === 'playing')
}

/** Media3 seekToPrevious: the previous track within the first 3 s, else restart the current one. */
export function previous() {
  const s = get()
  const idx = previousIndex(s)
  const autoplay = get().status === 'playing'
  if (idx >= 0 && s.positionMs <= MAX_SEEK_TO_PREVIOUS_MS) {
    set({ currentIndex: idx })
    void loadCurrent(autoplay)
  } else {
    seekTo(0)
  }
}

export function hasNext(s: MusicQueueState): boolean {
  return nextIndex(s, false) >= 0
}

export function hasPrevious(s: MusicQueueState): boolean {
  return s.entries.length > 0
}

export function seekTo(ms: number) {
  const el = activeEl()
  if (!el || !stream) return
  const s = get()
  const target = Math.max(0, s.durationMs > 0 ? Math.min(ms, s.durationMs) : ms)
  if (stream.transcode) {
    // a progressive transcode cannot seek: restart it at the target
    void loadCurrent(!el.paused, target)
  } else {
    el.currentTime = target / 1000
  }
  set({ positionMs: target })
  // a transcode reload sets the new stream offset asynchronously: report the target, not the probe's old position
  reporter?.progress(target)
}

export function seekBy(deltaMs: number) {
  seekTo(get().positionMs + deltaMs)
}

/** Player.shuffleModeEnabled toggle. */
export function toggleShuffle() {
  const s = get()
  const on = !s.shuffle
  set({ shuffle: on, order: on ? shuffleOrderFrom(s.entries, s.entries[s.currentIndex]?.key ?? null) : s.entries.map((e) => e.key) })
  preloaded = null
  bumpVersion()
}

export function cycleRepeat() {
  set((s) => ({ repeat: nextRepeatMode(s.repeat) }))
  preloaded = null
}

/** `moveQueue(index, newIndex)`. */
export function moveQueue(from: number, to: number) {
  const moved = moveEntry(get(), from, to)
  if (!moved) return
  set(moved)
  if (!get().shuffle) set({ order: get().entries.map((e) => e.key) })
  preloaded = null
  bumpVersion()
}

/** `removeFromQueue(index)`. */
export function removeFromQueue(index: number) {
  const s = get()
  const r = removeEntry(s, index)
  if (!r) return
  const { currentChanged, ended, ...rest } = r
  if (r.entries.length === 0) {
    stop()
    return
  }
  set(rest)
  bumpVersion()
  preloaded = null
  if (currentChanged) {
    if (ended) {
      pause()
      set({ status: 'paused', pausedAt: Date.now() })
      void loadCurrent(false)
    } else {
      void loadCurrent(s.status === 'playing')
    }
  }
}

/**
 * Now Playing "Play next" on a queued row. Upstream calls `moveQueue(index, 1)`, which moves the row to
 * position 1 instead of after the current song (NowPlayingViewModel.kt:playNext); fixed here.
 */
export function moveToNext(index: number) {
  const s = get()
  if (index === s.currentIndex) return
  const target = index < s.currentIndex ? s.currentIndex : s.currentIndex + 1
  moveQueue(index, target)
}

export function setVolume(volume: number) {
  const v = Math.max(0, Math.min(1, volume))
  if (elements) for (const el of elements) el.volume = v
  set({ volume: v, muted: v === 0 ? get().muted : false })
  if (elements && v > 0) for (const el of elements) el.muted = false
}

export function setMuted(muted: boolean) {
  if (elements) for (const el of elements) el.muted = muted
  set({ muted })
}

/** Connects the visualizer analyser; false when the browser cannot provide one (or CORS blocks it). */
export async function enableVisualizer(): Promise<boolean> {
  if (corsFailed) return false
  return ensureVisualizerTap(ensureElements())
}

/** The playing element (tests read `currentTime` / decoded bytes from it). */
export function musicElement(): HTMLAudioElement | null {
  return activeEl()
}

/** Current stream details (debugging, tests). */
export function musicStreamInfo(): { transcode: boolean; playSessionId: string } | null {
  return stream ? { transcode: stream.transcode, playSessionId: stream.playSessionId } : null
}
