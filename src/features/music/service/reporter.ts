// Music playback reporting (W/util/TrackActivityPlaybackListener.kt). One reporting session per music
// session: Start on the first time the player plays, Progress every 5 s and on every play/pause change (only
// while the position is > 0), a final Progress at the track end, Stopped when the music service stops. Track
// changes only change the item id of the next Progress (no per-track Start/Stopped), as upstream.
import type { Api } from '@jellyfin/sdk'
import type { PlayMethod } from '@jellyfin/sdk/lib/generated-client/models'
import { getSessionApi } from '@jellyfin/sdk/lib/utils/api/session-api'
import { msToTicks } from '../../../lib/format'
import { keepalive } from '../../playback/engine/reporting'

export const MUSIC_PROGRESS_INTERVAL_MS = 5000

export type ReportSnapshot = {
  itemId: string
  positionMs: number
  paused: boolean
  muted: boolean
  /** Upstream always reports DirectPlay; the web reports Transcode for transcoded streams so the server can clean up. */
  playMethod: PlayMethod
  playSessionId: string | null
}

export class MusicReporter {
  private started = false
  private timer: ReturnType<typeof setInterval> | null = null
  private last: ReportSnapshot | null = null
  private readonly api: Api
  private readonly probe: () => ReportSnapshot | null

  constructor(api: Api, probe: () => ReportSnapshot | null) {
    this.api = api
    this.probe = probe
  }

  get isStarted() {
    return this.started
  }

  /** `onIsPlayingChanged(true)` the first time: Start, then the 5 s Progress loop. */
  onPlaying() {
    const s = this.probe()
    if (!s) return
    this.last = s
    if (!this.started) {
      this.started = true
      void getSessionApi(this.api)
        .reportPlaybackStart({
          playbackStartInfo: {
            CanSeek: true,
            ItemId: s.itemId,
            IsPaused: s.paused,
            IsMuted: s.muted,
            PlayMethod: s.playMethod,
            PlaySessionId: s.playSessionId,
            RepeatMode: 'RepeatNone',
            PlaybackOrder: 'Default',
          },
        })
        .catch(() => undefined)
      this.timer = setInterval(() => this.progress(), MUSIC_PROGRESS_INTERVAL_MS)
    } else {
      this.progress()
    }
  }

  /** Play/pause change and the periodic tick. */
  progress(overridePositionMs?: number) {
    if (!this.started) return
    const s = this.probe()
    if (!s) return
    this.last = s
    const positionMs = overridePositionMs ?? s.positionMs
    if (positionMs <= 0) return
    void getSessionApi(this.api)
      .reportPlaybackProgress({
        playbackProgressInfo: {
          ItemId: s.itemId,
          PositionTicks: msToTicks(positionMs),
          CanSeek: true,
          IsPaused: s.paused,
          IsMuted: s.muted,
          PlayMethod: s.playMethod,
          PlaySessionId: s.playSessionId,
          RepeatMode: 'RepeatNone',
          PlaybackOrder: 'Default',
        },
      })
      .catch(() => undefined)
  }

  /** `release()`: Stopped with the last known item and position. `keep` uses a keepalive fetch (tab closing). */
  stop(keep = false) {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (!this.started) return
    this.started = false
    const s = this.probe() ?? this.last
    if (!s) return
    const body = { ItemId: s.itemId, PositionTicks: msToTicks(s.positionMs), PlaySessionId: s.playSessionId, Failed: false }
    if (keep) {
      keepalive(this.api, 'POST', '/Sessions/Playing/Stopped', body)
    } else {
      void getSessionApi(this.api)
        .reportPlaybackStopped({ playbackStopInfo: body })
        .catch(() => undefined)
    }
  }
}

/** Ends the server transcode of a music stream (the web counterpart of releasing ExoPlayer's connection). */
export function stopTranscode(api: Api, playSessionId: string) {
  const q = new URLSearchParams({ deviceId: api.deviceInfo.id, playSessionId })
  keepalive(api, 'DELETE', `/Videos/ActiveEncodings?${q}`)
}
