import clsx from 'clsx'
import { useEffect, useRef } from 'react'
import { handleListArrowKeys } from '../lib/focus'
import { JUMP_LETTERS } from '../lib/letters'
import styles from './AlphabetPicker.module.css'

export type AlphabetPickerProps = {
  /** The current letter (first letter of the focused item's sort name; digits map to '#'). */
  current: string
  onSelect: (letter: string) => void
  letters?: string
  label?: string
  className?: string
}

/**
 * Upstream `AlphabetButtons` (`ui/detail/CardGrid.kt:509-620`): a column of 14dp circular letter
 * buttons (bodySmall) 1.1dp apart. Unfocused picker: current letter in `tertiary` on a button
 * background, others dimmed to 25%; while the picker has focus everything is at 85% and the focused letter is an
 * onSurface circle with inverseOnSurface text.
 */
export function AlphabetPicker({ current, onSelect, letters = JUMP_LETTERS, label, className }: AlphabetPickerProps) {
  const list = useRef<HTMLDivElement>(null)

  // Keep the current letter visible when the list is shorter than the alphabet.
  useEffect(() => {
    const box = list.current
    const el = box?.querySelector<HTMLElement>(`[data-letter="${CSS.escape(current)}"]`)
    if (!box || !el) return
    // Scroll only the picker itself (scrollIntoView would also scroll the page).
    const top = el.offsetTop - box.offsetTop
    if (top < box.scrollTop) box.scrollTop = top
    else if (top + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top + el.offsetHeight - box.clientHeight
  }, [current])

  return (
    <div
      ref={list}
      role="toolbar"
      aria-orientation="vertical"
      aria-label={label}
      data-focus-enter="current"
      className={clsx(styles.picker, className)}
      // a plain LazyColumn upstream: Up on the first letter and Down on the last do not wrap around
      onKeyDown={(e) => list.current && handleListArrowKeys(e, list.current, undefined, false)}
    >
      {Array.from(letters).map((l) => (
        <button
          key={l}
          type="button"
          data-letter={l}
          data-focusable
          aria-current={l === current || undefined}
          tabIndex={l === current ? 0 : -1}
          className={clsx(styles.letter, l === current && styles.current)}
          onClick={() => onSelect(l)}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
