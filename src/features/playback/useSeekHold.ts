// A hook that says "a seek is in flight": true from a skip press (or any seek of the video) until the latest seek has landed and one frame was drawn.
import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { getPlaybackEngine } from './engine'
import { isSeekHeld, SEEK_HOLD_IDLE, seekHoldNext, type SeekHoldEvent } from './engine/seekHoldState'

/** how long a seek may stay unanswered before the hold is let go (a seek the element never saw, e.g. while loading) */
const GIVE_UP_MS = 3000

/**
 * `frame`: what the renderer draws on. ASS follows the video's own frames (JASSUB redraws on requestVideoFrameCallback,
 * which does not fire while paused); PGS and text follow animation frames.
 * Differs from the TV app, which never takes the subtitles away for a skip.
 */
export function useSeekHold(frame: 'video' | 'animation') {
  const [held, setHeld] = useState(false)
  const state = useRef(SEEK_HOLD_IDLE)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelFrame = useRef<(() => void) | null>(null)
  const frameKind = useRef(frame)
  const sendRef = useRef<(e: SeekHoldEvent) => void>(() => undefined)
  useEffect(() => {
    frameKind.current = frame
  })

  const send = useCallback((e: SeekHoldEvent) => {
    const next = seekHoldNext(state.current, e)
    if (next === state.current) return
    const video = getPlaybackEngine().video
    state.current = next
    // a press hides before the next frame is painted (a batched update would let that frame show the old line)
    if (e.type === 'press') flushSync(() => setHeld(true))
    else setHeld(isSeekHeld(next))
    cancelFrame.current?.()
    cancelFrame.current = null
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (next.phase === 'idle') return
    const giveUp = () => {
      // a seek that is still running (a repackaged stream restarting) keeps the hold
      if (video.seeking) timer.current = setTimeout(giveUp, GIVE_UP_MS)
      else sendRef.current({ type: 'timeout' })
    }
    timer.current = setTimeout(giveUp, GIVE_UP_MS)
    if (next.phase === 'landed') {
      const gen = next.gen
      if (frameKind.current === 'video' && !video.paused && 'requestVideoFrameCallback' in video) {
        const id = video.requestVideoFrameCallback(() => sendRef.current({ type: 'frame', gen }))
        cancelFrame.current = () => video.cancelVideoFrameCallback(id)
      } else {
        const id = requestAnimationFrame(() => sendRef.current({ type: 'frame', gen }))
        cancelFrame.current = () => cancelAnimationFrame(id)
      }
    }
  }, [])
  useEffect(() => {
    sendRef.current = send
  }, [send])

  useEffect(() => {
    const video = getPlaybackEngine().video
    const onSeeking = () => send({ type: 'seeking' })
    const onSeeked = () => send({ type: 'seeked', stillSeeking: video.seeking })
    video.addEventListener('seeking', onSeeking)
    video.addEventListener('seeked', onSeeked)
    return () => {
      video.removeEventListener('seeking', onSeeking)
      video.removeEventListener('seeked', onSeeked)
      cancelFrame.current?.()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [send])

  const press = useCallback(() => send({ type: 'press' }), [send])
  return { held, press }
}
