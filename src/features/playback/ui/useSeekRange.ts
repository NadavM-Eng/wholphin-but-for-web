import { useEffect, useState } from 'react'
import { getPlaybackEngine, usePlaybackStore } from '../engine'

export interface SeekRange {
  startMs: number
  endMs: number
  positionMs: number
  bufferedMs: number
  /** live stream without a fixed runtime: no remaining time / "Ends at", seeking limited to the DVR window */
  live: boolean
}

/**
 * Position and range for the seek bar, refreshed every 250 ms like upstream (PlaybackControls.kt:256-263).
 * Live TV channels use the element's seekable window (spec 05 §B4 Live TV).
 */
export function useSeekRange(): SeekRange {
  const isLive = usePlaybackStore((s) => s.isLiveTv)
  const durationMs = usePlaybackStore((s) => s.durationMs)
  const positionMs = usePlaybackStore((s) => s.positionMs)
  const bufferedMs = usePlaybackStore((s) => s.bufferedMs)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [])
  void tick
  const v = getPlaybackEngine().video
  // a TV channel is live even when hls.js reports the growing playlist's finite duration
  const live = isLive
  if (live) {
    const s = v.seekable
    const start = s.length > 0 ? s.start(0) * 1000 : 0
    const end = s.length > 0 ? s.end(s.length - 1) * 1000 : v.currentTime * 1000
    return { startMs: start, endMs: end, positionMs: v.currentTime * 1000, bufferedMs: bufferedMs, live: true }
  }
  // the element position is fresher than the store's timeupdate (4 Hz) value
  const pos = v.readyState > 0 && !v.seeking ? v.currentTime * 1000 : positionMs
  return { startMs: 0, endMs: durationMs, positionMs: Math.min(pos, durationMs || pos), bufferedMs, live: false }
}
