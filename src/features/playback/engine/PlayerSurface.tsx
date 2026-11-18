import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { getPlaybackEngine } from './engine'
import styles from './PlayerSurface.module.css'

export interface PlayerSurfaceProps {
  /** overlays drawn over the video (SubtitleLayer, controls); they share the positioned box with the <video> */
  children?: ReactNode
  className?: string
}

/** Positioned black box that hosts the engine's single <video> element. */
export function PlayerSurface({ children, className }: PlayerSurfaceProps) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const engine = getPlaybackEngine()
    const el = ref.current
    engine.attachSurface(el)
    return () => {
      if (engine.video.parentElement === el) engine.attachSurface(null)
    }
  }, [])
  return (
    <div ref={ref} className={className ? `${styles.surface} ${className}` : styles.surface}>
      {children}
    </div>
  )
}
