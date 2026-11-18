// Player backends behind one interface (spec 05 §B1.2): the engine owns a single <video>; a backend only decides
// how a URL is fed to it. native = progressive file (direct play); native-hls = Safari/iOS HLS; hlsjs = hls.js
// over MediaSource (Chromium, Firefox).
import Hls, { type ErrorData } from 'hls.js'
import type { PlayerTrack } from './trackSelection'

export type BackendKind = 'native' | 'native-hls' | 'hlsjs'

export interface BackendError {
  /** 'media' (decode/format), 'network', 'other' */
  type: 'media' | 'network' | 'other'
  detail: string
}

export interface PlayerBackend {
  readonly kind: BackendKind
  /** Starts loading `url` at `startSec`. */
  load(url: string, startSec: number): void
  /** Detaches from the element and frees resources. Leaves the element itself in place. */
  destroy(): void
  /** Audio tracks the backend can switch between in place (empty when it cannot). */
  audioTracks(): PlayerTrack[]
  selectAudioTrack(id: string): boolean
  /** Estimated bandwidth in bit/s, when known. */
  bandwidthEstimate(): number | null
}

export interface BackendEvents {
  onFatal(err: BackendError): void
}

/** Media elements with the (Safari-only) audioTracks list. */
interface AudioTrackLike {
  id: string
  enabled: boolean
}
interface AudioTrackListLike {
  length: number
  [index: number]: AudioTrackLike
}
function elementAudioTracks(video: HTMLVideoElement): AudioTrackListLike | null {
  return (video as unknown as { audioTracks?: AudioTrackListLike }).audioTracks ?? null
}

class NativeBackend implements PlayerBackend {
  readonly kind: BackendKind
  private video: HTMLVideoElement
  /** start seek waiting for metadata; removed on destroy so it cannot fire into the next stream */
  private pendingSeek: (() => void) | null = null
  constructor(video: HTMLVideoElement, kind: 'native' | 'native-hls') {
    this.video = video
    this.kind = kind
  }
  load(url: string, startSec: number) {
    this.video.src = url
    this.seekWhenReady(startSec)
    this.video.load()
  }
  private seekWhenReady(startSec: number) {
    this.clearPendingSeek()
    if (startSec <= 0) return
    const apply = () => {
      this.pendingSeek = null
      try {
        this.video.currentTime = startSec
      } catch {
        // ignored: the element refuses seeks before metadata on some engines
      }
    }
    // video.load() below resets readyState, so the seek always waits for the new stream's metadata
    this.pendingSeek = apply
    this.video.addEventListener('loadedmetadata', apply, { once: true })
  }
  private clearPendingSeek() {
    if (this.pendingSeek) this.video.removeEventListener('loadedmetadata', this.pendingSeek)
    this.pendingSeek = null
  }
  destroy() {
    this.clearPendingSeek()
    this.video.removeAttribute('src')
    try {
      this.video.load()
    } catch {
      // detached element
    }
  }
  audioTracks(): PlayerTrack[] {
    const list = elementAudioTracks(this.video)
    if (!list) return []
    const out: PlayerTrack[] = []
    for (let i = 0; i < list.length; i++) out.push({ id: list[i].id || String(i + 1), type: 'audio', external: false, supported: true })
    return out
  }
  selectAudioTrack(id: string) {
    const list = elementAudioTracks(this.video)
    if (!list) return false
    let found = false
    for (let i = 0; i < list.length; i++) {
      const match = (list[i].id || String(i + 1)) === id
      list[i].enabled = match
      found ||= match
    }
    return found
  }
  bandwidthEstimate() {
    return null
  }
}

class HlsJsBackend implements PlayerBackend {
  readonly kind = 'hlsjs' as const
  private hls: Hls
  private mediaRecoveries = 0
  constructor(video: HTMLVideoElement, events: BackendEvents) {
    this.hls = new Hls({
      // Jellyfin's transcode playlists are VOD playlists produced on demand; segments can take a while
      fragLoadingTimeOut: 60_000,
      manifestLoadingTimeOut: 30_000,
      levelLoadingTimeOut: 30_000,
      backBufferLength: 90,
      maxBufferLength: 30,
      enableWorker: true,
      lowLatencyMode: false,
      startFragPrefetch: true,
    })
    this.hls.on(Hls.Events.ERROR, (_e, data: ErrorData) => {
      if (!data.fatal) return
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && this.mediaRecoveries < 1) {
        this.mediaRecoveries++
        this.hls.recoverMediaError()
        return
      }
      events.onFatal({
        type: data.type === Hls.ErrorTypes.NETWORK_ERROR ? 'network' : data.type === Hls.ErrorTypes.MEDIA_ERROR ? 'media' : 'other',
        detail: `${data.type}/${data.details}${data.response?.code ? ` HTTP ${data.response.code}` : ''}`,
      })
    })
    this.hls.attachMedia(video)
  }
  load(url: string, startSec: number) {
    this.hls.config.startPosition = startSec > 0 ? startSec : -1
    this.hls.loadSource(url)
  }
  destroy() {
    this.hls.destroy()
  }
  audioTracks(): PlayerTrack[] {
    return this.hls.audioTracks.map((t) => ({ id: String(t.id), type: 'audio' as const, external: false, supported: true }))
  }
  selectAudioTrack(id: string) {
    const idx = this.hls.audioTracks.findIndex((t) => String(t.id) === id)
    if (idx < 0) return false
    this.hls.audioTrack = idx
    return true
  }
  bandwidthEstimate() {
    const b = this.hls.bandwidthEstimate
    return Number.isFinite(b) && b > 0 ? b : null
  }
}

/** True when hls.js can run here (MSE present). */
export function hlsJsSupported(): boolean {
  return Hls.isSupported()
}

/**
 * Apple's WebKit: its native HLS player handles HDR/Dolby Vision, AirPlay and fullscreen on iOS better than MSE,
 * so it is preferred there even when hls.js could run (the one place the engine looks at the browser vendor).
 */
function prefersNativeHls(): boolean {
  return typeof navigator !== 'undefined' && navigator.vendor === 'Apple Computer, Inc.'
}

/** Backend for a stream: progressive -> native; HLS -> native on Apple WebKit, else hls.js, else native HLS. */
export function createBackend(video: HTMLVideoElement, hls: boolean, nativeHls: boolean, events: BackendEvents): PlayerBackend {
  if (!hls) return new NativeBackend(video, 'native')
  if (nativeHls && prefersNativeHls()) return new NativeBackend(video, 'native-hls')
  if (hlsJsSupported()) return new HlsJsBackend(video, events)
  if (nativeHls) return new NativeBackend(video, 'native-hls')
  throw new Error('HLS playback is not supported in this browser')
}
