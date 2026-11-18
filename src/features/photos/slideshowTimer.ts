// The slideshow timer of SlideshowViewModel (W/ui/slideshow/SlideshowViewModel.kt:343-407).
//
// `pulse(ms)` cancels the pending delay and starts a new one; when it fires and the slideshow is active
// (enabled && !paused) it advances, and in every case it re-arms itself with the normal delay
// (`invokeOnCompletion { if (it !is CancellationException) pulseSlideshow() }`). `park()` is
// `pulseSlideshow(Long.MAX_VALUE)`: nothing fires until the next pulse (slow images, playing videos).

export interface SlideshowTimerState {
  enabled: boolean
  paused: boolean
}

export class SlideshowTimer {
  enabled = false
  paused = false
  private handle: ReturnType<typeof setTimeout> | null = null
  private generation = 0
  /** The slideshow duration (ms). */
  delayMs: number
  /** Number of items (the tick wraps to 0 at the end). */
  size = 0
  private readonly onTick: (timer: SlideshowTimer) => void
  private readonly onChange: (s: SlideshowTimerState) => void

  constructor(delayMs: number, onTick: (timer: SlideshowTimer) => void, onChange: (s: SlideshowTimerState) => void) {
    this.delayMs = delayMs
    this.onTick = onTick
    this.onChange = onChange
  }

  get active(): boolean {
    return this.enabled && !this.paused
  }

  /** `pulseSlideshow(milliseconds)`. */
  pulse(ms: number = this.delayMs) {
    this.cancel()
    if (!Number.isFinite(ms)) return
    this.handle = setTimeout(() => {
      this.handle = null
      const gen = this.generation
      if (this.active) this.onTick(this)
      // the tick may have pulsed, parked or stopped the timer already; do not override that
      if (gen === this.generation) this.pulse()
    }, ms)
  }

  /** `pulseSlideshow(Long.MAX_VALUE)`. */
  park() {
    this.pulse(Infinity)
  }

  /** `startSlideshow()`: a video arms nothing, its end does. */
  start(currentIsVideo: boolean) {
    this.enabled = true
    this.paused = false
    this.emit()
    if (!currentIsVideo) this.pulse()
  }

  /** `stopSlideshow()`. */
  stop() {
    this.cancel()
    this.enabled = false
    this.paused = false
    this.emit()
  }

  /** `pauseSlideshow()`: only while enabled; cancels the delay. */
  pause() {
    if (!this.enabled) return
    this.cancel()
    this.paused = true
    this.emit()
  }

  /** `unpauseSlideshow()`: only while enabled; the caller pulses. */
  unpause() {
    if (!this.enabled) return
    this.paused = false
    this.emit()
  }

  setDelay(ms: number) {
    this.delayMs = ms
  }

  setSize(n: number) {
    this.size = n
  }

  dispose() {
    this.cancel()
  }

  private cancel() {
    this.generation++
    if (this.handle != null) clearTimeout(this.handle)
    this.handle = null
  }

  private emit() {
    this.onChange({ enabled: this.enabled, paused: this.paused })
  }
}
