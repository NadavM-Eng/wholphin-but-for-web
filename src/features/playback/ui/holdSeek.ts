// Hold-to-seek with acceleration (PlaybackKeyHandler.handleHoldSkip and SeekBar.kt SeekBarDisplay key handling,
// spec 05 §9.7). Browsers repeat keys at their own rate (often ~30 Hz after 500 ms), so the Android repeat count
// is rebuilt from how long the key has been held (one repeat per 50 ms, the Android TV cadence) and drives the
// acceleration table unchanged. Seeking on every 50 ms repeat moves 30 s steps at 10 minutes per second, which
// overshoots with a mouse-and-keyboard reaction time, so steps are applied at most every 125 ms (spec 05 §B7 asks
// for the cadence to be tuned on the web).
import { calculateSeekAccelerationMultiplier, HOLD_TO_SEEK_REPEAT_START_COUNT, repeatCountFromHold } from '../engine'

export const REPEAT_INTERVAL_MS = 125

interface Held {
  dir: -1 | 1
  at: number
  lastSeekAt: number
  handled: boolean
}

export class HoldSeek {
  private held: Held | null = null
  private readonly startCount: number
  /**
   * @param startCount repeats swallowed before seeking starts: 8 with the controls hidden
   * (`HOLD_TO_SEEK_REPEAT_START_COUNT`), 0 on the focused seek bar.
   */
  constructor(startCount: number = HOLD_TO_SEEK_REPEAT_START_COUNT) {
    this.startCount = startCount
  }

  /** KeyDown. Returns the multiplier to seek with now, or null. */
  keyDown(dir: -1 | 1, repeat: boolean, now: number, durationMs: number): number | null {
    const h = this.held
    if (!repeat || !h || h.dir !== dir) {
      this.held = { dir, at: now, lastSeekAt: -Infinity, handled: false }
      return null
    }
    const count = repeatCountFromHold(now - h.at)
    if (count <= 0 || count < this.startCount) return null
    if (now - h.lastSeekAt < REPEAT_INTERVAL_MS) return null
    h.lastSeekAt = now
    h.handled = true
    return calculateSeekAccelerationMultiplier(count - this.startCount, durationMs)
  }

  /** KeyUp. Returns 1 for a tap (no repeat seek happened), else null. */
  keyUp(dir: -1 | 1): number | null {
    const h = this.held
    this.held = null
    if (!h || h.dir !== dir) return 1
    return h.handled ? null : 1
  }

  reset() {
    this.held = null
  }
}
