import { useEffect, useLayoutEffect, useRef } from 'react'
import { getPlaybackEngine, usePlaybackStore } from './engine'
import type { ExitReason, PlaybackDestination } from './types'

/**
 * Starts the engine for a destination while the calling page is mounted and stops it (Stopped report, encoder
 * cleanup) on unmount. `onExit` runs when the engine asks to leave (end of queue, empty playlist, media-session
 * stop); the page navigates back there.
 */
export function usePlaybackSession(dest: PlaybackDestination | null, onExit: (reason: ExitReason) => void) {
  const key = dest ? JSON.stringify(dest) : null
  const exitRef = useRef(onExit)
  useEffect(() => {
    exitRef.current = onExit
  })
  useEffect(() => {
    if (!key) return
    const engine = getPlaybackEngine()
    void engine.start(JSON.parse(key) as PlaybackDestination)
  }, [key])
  // The stop is a layout cleanup: on unmount it runs before PlayerSurface (a child) takes the <video> out of
  // the document. A passive cleanup runs later, and WebKit pauses a playing element as soon as it is removed:
  // that 'pause' was reported as Progress(IsPaused) just before Stopped, and when the server handled the two
  // out of order the session stayed listed as paused.
  useLayoutEffect(() => {
    if (!key) return
    const engine = getPlaybackEngine()
    return () => engine.stop(null)
  }, [key])

  const exit = usePlaybackStore((s) => s.exit)
  useEffect(() => {
    if (exit) exitRef.current(exit)
  }, [exit])
}
