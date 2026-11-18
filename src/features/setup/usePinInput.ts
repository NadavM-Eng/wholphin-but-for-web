import { useCallback, useRef, useState, type KeyboardEvent } from 'react'
import { pinKeyFor, type PinKey } from './pin'

/** PIN input state: the typed key sequence, with Backspace (web addition, spec 08 ST-3). */
export function usePinInput(onChange: (value: string) => void) {
  const [value, setValue] = useState('')
  const ref = useRef('')
  const set = useCallback(
    (next: string) => {
      ref.current = next
      setValue(next)
      onChange(next)
    },
    [onChange],
  )
  const append = useCallback((k: PinKey) => set(ref.current + k), [set])
  const backspace = useCallback(() => set(ref.current.slice(0, -1)), [set])
  const reset = useCallback(() => {
    ref.current = ''
    setValue('')
  }, [])

  /** Keyboard: arrows / digits append, Backspace deletes; returns true when the key was a PIN key. */
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>): boolean => {
      if (e.altKey || e.ctrlKey || e.metaKey) return false
      const k = pinKeyFor(e.key)
      if (k) {
        e.preventDefault()
        e.stopPropagation()
        append(k)
        return true
      }
      if (e.key === 'Backspace') {
        e.preventDefault()
        e.stopPropagation()
        backspace()
        return true
      }
      return false
    },
    [append, backspace],
  )
  return { value, append, backspace, reset, onKeyDown }
}
