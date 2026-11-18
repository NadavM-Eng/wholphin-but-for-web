// Silent-failure watchdog (spec 05 §B6.2): canPlayType/decodingInfo can over-report (HEVC profiles, GPU decode
// failures), which shows as audio playing over a black or frozen picture. The watchdog samples the element once a
// second and reports when playback time advances but no video frames do.

export type WatchdogReason = 'no-frames' | 'frames-stalled' | 'no-video-size'

export interface FrameSample {
  /** media time in seconds */
  currentTime: number
  /** decoded/presented frame counter (getVideoPlaybackQuality or requestVideoFrameCallback) */
  frames: number
  paused: boolean
  /** document hidden: browsers stop decoding video of background tabs on purpose */
  hidden: boolean
  videoWidth: number
  readyState: number
}

/** Seconds of advancing playback without a single frame before the start is declared failed. */
export const NO_FRAMES_AFTER_S = 4
/** Seconds of advancing playback without new frames mid-stream. */
export const FRAMES_STALLED_AFTER_S = 6

/** Pure state machine fed by samples; returns a reason once, then stays quiet until reset. */
export class FrameWatchdogState {
  private baseTime: number | null = null
  private baseFrames = 0
  private seenFrames = false
  private fired = false

  reset() {
    this.baseTime = null
    this.baseFrames = 0
    this.seenFrames = false
    this.fired = false
  }

  sample(s: FrameSample): WatchdogReason | null {
    if (this.fired) return null
    if (s.paused || s.hidden || s.readyState < 2) {
      // re-baseline: time spent paused/hidden/buffering must not count
      this.baseTime = null
      return null
    }
    if (this.baseTime == null || s.currentTime < this.baseTime) {
      this.baseTime = s.currentTime
      this.baseFrames = s.frames
      return null
    }
    if (s.frames > this.baseFrames) {
      this.seenFrames = true
      this.baseTime = s.currentTime
      this.baseFrames = s.frames
      return null
    }
    const advanced = s.currentTime - this.baseTime
    if (!this.seenFrames && advanced >= NO_FRAMES_AFTER_S) {
      this.fired = true
      return s.videoWidth === 0 ? 'no-video-size' : 'no-frames'
    }
    if (this.seenFrames && advanced >= FRAMES_STALLED_AFTER_S) {
      this.fired = true
      return 'frames-stalled'
    }
    return null
  }
}

interface VideoFrameCallbackElement {
  requestVideoFrameCallback?(cb: () => void): number
  cancelVideoFrameCallback?(handle: number): void
}

/** Binds the state machine to a <video>. */
export class FrameWatchdog {
  private state = new FrameWatchdogState()
  private timer: ReturnType<typeof setInterval> | null = null
  private rvfcCount = 0
  private rvfcHandle: number | null = null
  private video: HTMLVideoElement
  private onFail: (reason: WatchdogReason) => void

  constructor(video: HTMLVideoElement, onFail: (reason: WatchdogReason) => void) {
    this.video = video
    this.onFail = onFail
  }

  private frames(): number {
    const q = this.video.getVideoPlaybackQuality?.()
    const decoded = q ? q.totalVideoFrames - (q.droppedVideoFrames ?? 0) : 0
    return Math.max(decoded, this.rvfcCount)
  }

  private loopRvfc = () => {
    const v = this.video as unknown as VideoFrameCallbackElement
    if (!v.requestVideoFrameCallback) return
    this.rvfcHandle = v.requestVideoFrameCallback(() => {
      this.rvfcCount++
      this.loopRvfc()
    })
  }

  start() {
    this.stop()
    this.state.reset()
    this.rvfcCount = 0
    this.loopRvfc()
    this.timer = setInterval(() => {
      const v = this.video
      const r = this.state.sample({
        currentTime: v.currentTime,
        frames: this.frames(),
        paused: v.paused,
        hidden: typeof document !== 'undefined' && document.visibilityState === 'hidden',
        videoWidth: v.videoWidth,
        readyState: v.readyState,
      })
      if (r) {
        this.stop()
        this.onFail(r)
      }
    }, 1000)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    const v = this.video as unknown as VideoFrameCallbackElement
    if (this.rvfcHandle != null) v.cancelVideoFrameCallback?.(this.rvfcHandle)
    this.rvfcHandle = null
  }
}
