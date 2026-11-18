// Web counterpart of the Android `Visualizer` waveform capture (NowPlayingViewModel.kt:323-339): an
// AnalyserNode behind the music elements. A MediaElementSource reroutes the element's output through the
// AudioContext for good, so the tap is only created when the user turns the visualizer on, and only kept when
// the context actually runs (a suspended context would silence the music). Spec 08 MU-4: the preference
// sticks only if the tap can be created.

/** Bars drawn (upstream: ~96-103 depending on the device capture size). */
export const VISUALIZER_BARS = 96

type Tap = { ctx: AudioContext; analyser: AnalyserNode; sources: WeakSet<HTMLMediaElement> }
let tap: Tap | null = null

/** Creates (once) the analyser and connects `elements` to it. Resolves false when it cannot run. */
export async function ensureVisualizerTap(elements: readonly HTMLMediaElement[]): Promise<boolean> {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return false
  if (!tap) {
    let ctx: AudioContext
    try {
      ctx = new AudioContext()
    } catch {
      return false
    }
    try {
      await ctx.resume()
    } catch {
      // handled below
    }
    if (ctx.state !== 'running') {
      void ctx.close().catch(() => undefined)
      return false
    }
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0
    analyser.connect(ctx.destination)
    tap = { ctx, analyser, sources: new WeakSet() }
  }
  for (const el of elements) {
    if (tap.sources.has(el)) continue
    try {
      tap.ctx.createMediaElementSource(el).connect(tap.analyser)
      tap.sources.add(el)
    } catch {
      return false
    }
  }
  if (tap.ctx.state !== 'running') await tap.ctx.resume().catch(() => undefined)
  return tap.ctx.state === 'running'
}

export function hasVisualizerTap(): boolean {
  return tap != null
}

/**
 * Waveform grouped into `bars` values of 0..255 (upstream: mean of each chunk + 128; here the mean absolute
 * deviation from the centre line, scaled, so silence is a flat line at the middle and loud audio fills the box).
 */
export function readBars(out: Uint8Array<ArrayBuffer>, bars = VISUALIZER_BARS): number[] {
  if (!tap) return []
  tap.analyser.getByteTimeDomainData(out)
  return groupWaveform(out, bars)
}

export function analyserSize(): number {
  return tap?.analyser.fftSize ?? 2048
}

export function groupWaveform(samples: ArrayLike<number>, bars: number): number[] {
  const n = samples.length
  if (n === 0 || bars <= 0) return []
  const group = Math.max(1, Math.floor(n / bars))
  const out: number[] = []
  for (let start = 0; start < n && out.length < bars; start += group) {
    let sum = 0
    let count = 0
    for (let i = start; i < Math.min(n, start + group); i++) {
      sum += Math.abs(samples[i] - 128)
      count++
    }
    out.push(Math.min(255, Math.round((sum / Math.max(1, count)) * 4)))
  }
  return out
}
