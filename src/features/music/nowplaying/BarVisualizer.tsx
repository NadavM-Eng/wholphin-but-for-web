import { useEffect, useRef } from 'react'
import { useMusicQueue } from '../../../stores/musicQueue'
import { analyserSize, readBars, VISUALIZER_BARS } from '../service/visualizerTap'
import styles from './BarVisualizer.module.css'

/**
 * `BarVisualizer` (W/ui/detail/music/BarVisualizer.kt): bars of width area/count with a 1dp gap, vertically
 * centred, height = value/256 of the area, in the theme border colour; heights ease toward new values.
 * Runs only while the music plays (upstream: `visualizer.enabled = status == PLAYING`).
 */
export function BarVisualizer({ className }: { className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const playing = useMusicQueue((s) => s.status === 'playing')

  useEffect(() => {
    const c = canvas.current
    if (!c || !playing) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const samples = new Uint8Array(new ArrayBuffer(analyserSize()))
    let heights = new Array<number>(VISUALIZER_BARS).fill(0)
    let raf = 0
    let last = performance.now()
    const color = getComputedStyle(c).color
    const draw = (now: number) => {
      const dpr = window.devicePixelRatio || 1
      const w = c.clientWidth * dpr
      const h = c.clientHeight * dpr
      if (c.width !== w || c.height !== h) {
        c.width = w
        c.height = h
      }
      const values = readBars(samples)
      // the default 300 ms linear tween per bar
      const k = Math.min(1, (now - last) / 300)
      last = now
      heights = heights.map((v, i) => v + ((values[i] ?? 0) - v) * k)
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = color
      const bar = w / VISUALIZER_BARS
      const gap = dpr
      heights.forEach((v, i) => {
        const bh = Math.max(dpr, (v / 256) * h)
        ctx.fillRect(i * bar + (i > 0 ? gap : 0), (h - bh) / 2, Math.max(1, bar - (i > 0 ? gap : 0)), bh)
      })
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  return <canvas ref={canvas} className={`${styles.canvas} ${className ?? ''}`} aria-hidden />
}
