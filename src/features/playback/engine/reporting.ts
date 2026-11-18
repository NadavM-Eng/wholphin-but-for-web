// Session reporting, port of W/util/TrackActivityPlaybackListener.kt (spec 05 §5). One reporter per stream
// (PlaybackInfo response): Start on the first `playing`, Progress every 5 s (fixed delay, also while paused) and on
// pause/resume/seek/track change, Stopped on every exit path. Stopped is sent with `fetch(keepalive)` so it also
// survives tab close (sendBeacon cannot carry the Authorization header).
import type { Api } from '@jellyfin/sdk'
import type { PlayMethod } from '@jellyfin/sdk/lib/generated-client/models'
import { getSessionApi } from '@jellyfin/sdk/lib/utils/api/session-api'

export const PROGRESS_INTERVAL_MS = 5000
const TICKS_PER_MS = 10_000

export interface ReportState {
  itemId: string
  mediaSourceId: string | null
  playMethod: PlayMethod
  audioStreamIndex: number | null
  subtitleStreamIndex: number | null
  playSessionId: string | null
  liveStreamId: string | null
}

export interface PlayerProbe {
  positionMs(): number
  isPaused(): boolean
  isMuted(): boolean
  volume(): number
}

const nonNegative = (i: number | null) => (i != null && i >= 0 ? i : null)

export class ProgressReporter {
  private api: Api
  private probe: PlayerProbe
  private state: ReportState
  private started = false
  private released = false
  private timer: ReturnType<typeof setTimeout> | null = null
  /** last successful report, for the debug page */
  lastReport: { kind: 'start' | 'progress' | 'stopped'; positionMs: number; at: number } | null = null

  constructor(api: Api, state: ReportState, probe: PlayerProbe) {
    this.api = api
    this.state = state
    this.probe = probe
  }

  /** In-place track switches keep the same session; upstream kept reporting the old indexes. */
  updateTracks(audio: number | null, subtitle: number | null) {
    this.state = { ...this.state, audioStreamIndex: audio, subtitleStreamIndex: subtitle }
    if (this.started && !this.released) void this.progress()
  }

  /** `onIsPlayingChanged`. */
  onPlayingChanged(isPlaying: boolean) {
    if (this.released) return
    if (this.started) void this.progress()
    else if (isPlaying) void this.start()
  }

  /** Seek completed: report now instead of waiting for the next tick (web addition). */
  onSeeked() {
    if (this.started && !this.released) void this.progress()
  }

  /** `STATE_ENDED`: progress at the duration. */
  onEnded(durationMs: number) {
    if (!this.released) void this.progress(durationMs)
  }

  private common() {
    const s = this.state
    return {
      ItemId: s.itemId,
      MediaSourceId: s.mediaSourceId,
      CanSeek: true,
      IsPaused: this.probe.isPaused(),
      IsMuted: this.probe.isMuted(),
      VolumeLevel: Math.round(this.probe.volume() * 100),
      PlayMethod: s.playMethod,
      RepeatMode: 'RepeatNone' as const,
      PlaybackOrder: 'Default' as const,
      AudioStreamIndex: nonNegative(s.audioStreamIndex),
      SubtitleStreamIndex: nonNegative(s.subtitleStreamIndex),
      PlaySessionId: s.playSessionId,
      LiveStreamId: s.liveStreamId,
    }
  }

  private async start() {
    this.started = true
    try {
      await getSessionApi(this.api).reportPlaybackStart({ playbackStartInfo: this.common() })
      this.lastReport = { kind: 'start', positionMs: this.probe.positionMs(), at: Date.now() }
    } catch {
      // reporting is best effort (upstream logs and continues)
    }
    this.schedule()
  }

  private schedule() {
    if (this.released) return
    this.timer = setTimeout(() => {
      void this.progress().finally(() => this.schedule())
    }, PROGRESS_INTERVAL_MS)
  }

  private async progress(positionMs?: number) {
    if (this.released) return
    const pos = positionMs ?? this.probe.positionMs()
    if (!(pos > 0)) return
    try {
      await getSessionApi(this.api).reportPlaybackProgress({
        playbackProgressInfo: { ...this.common(), PositionTicks: Math.round(pos * TICKS_PER_MS) },
      })
      this.lastReport = { kind: 'progress', positionMs: pos, at: Date.now() }
    } catch {
      // best effort
    }
  }

  /**
   * Stops the timer and sends Stopped (also when Start never went out, like upstream). Transcodes get their
   * server encoder killed (`DELETE /Videos/ActiveEncodings`) and live streams are closed. Safe to call twice.
   */
  release(opts: { failed?: boolean; closeLiveStream?: boolean; positionMs?: number } = {}) {
    if (this.released) return
    this.released = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const pos = opts.positionMs ?? this.probe.positionMs()
    const s = this.state
    const body = {
      ItemId: s.itemId,
      MediaSourceId: s.mediaSourceId,
      PositionTicks: pos >= 0 ? Math.round(pos * TICKS_PER_MS) : null,
      Failed: opts.failed ?? false,
      PlaySessionId: s.playSessionId,
      LiveStreamId: s.liveStreamId,
    }
    this.lastReport = { kind: 'stopped', positionMs: pos, at: Date.now() }
    keepalive(this.api, 'POST', '/Sessions/Playing/Stopped', body)
    if (s.playMethod !== 'DirectPlay' && s.playSessionId) {
      const q = new URLSearchParams({ deviceId: this.api.deviceInfo.id, playSessionId: s.playSessionId })
      keepalive(this.api, 'DELETE', `/Videos/ActiveEncodings?${q}`)
    }
    if (opts.closeLiveStream && s.liveStreamId) {
      keepalive(this.api, 'POST', `/LiveStreams/Close?${new URLSearchParams({ liveStreamId: s.liveStreamId })}`)
    }
  }
}

/** Fire-and-forget request that outlives the page (pagehide / tab close). */
export function keepalive(api: Api, method: 'POST' | 'DELETE', path: string, body?: unknown) {
  try {
    void fetch(`${api.basePath.replace(/\/+$/, '')}${path}`, {
      method,
      keepalive: true,
      headers: { Authorization: api.authorizationHeader, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => undefined)
  } catch {
    // fetch unavailable during teardown
  }
}
