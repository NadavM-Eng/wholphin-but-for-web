// Port of W/ui/playback/ControllerViewState.kt: controls visibility with a debounced auto-hide. `pulse(ms)`
// restarts the hide timer (the last pulse wins, like the conflated channel), `show()` makes the controls visible
// and pulses, `hide()` hides immediately.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export interface ControllerView {
  visible: boolean
  show(ms?: number): void
  hide(): void
  pulse(ms?: number): void
}

export function useControllerView(timeoutMs: number): ControllerView {
  const [visible, setVisible] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timeoutRef = useRef(timeoutMs)
  useEffect(() => {
    timeoutRef.current = timeoutMs
  }, [timeoutMs])

  const pulse = useCallback((ms?: number) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const d = ms ?? timeoutRef.current
    if (Number.isFinite(d)) timer.current = setTimeout(() => setVisible(false), d)
  }, [])
  const show = useCallback(
    (ms?: number) => {
      setVisible(true)
      pulse(ms)
    },
    [pulse],
  )
  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setVisible(false)
  }, [])
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  return useMemo(() => ({ visible, show, hide, pulse }), [visible, show, hide, pulse])
}
