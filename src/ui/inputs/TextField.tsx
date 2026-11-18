import clsx from 'clsx'
import type { ChangeEvent, CSSProperties, HTMLInputTypeAttribute, KeyboardEvent, ReactNode, Ref } from 'react'
import styles from './TextField.module.css'

export type TextFieldProps = {
  value: string
  onChange: (value: string) => void
  /** Called on Enter (single-line). */
  onSubmit?: (value: string) => void
  /** Accessible name (there is no floating label upstream). */
  label: string
  placeholder?: string
  type?: HTMLInputTypeAttribute
  /** > 1 renders the multi-line variant (8dp corners) with that many rows. */
  maxLines?: number
  leading?: ReactNode
  disabled?: boolean
  readOnly?: boolean
  /** Shows the error colors (upstream `isInputValid` returning false). */
  invalid?: boolean
  autoComplete?: string
  autoFocus?: boolean
  enterKeyHint?: 'search' | 'done' | 'go' | 'next' | 'send' | 'enter'
  inputMode?: 'text' | 'search' | 'url' | 'email' | 'numeric' | 'decimal' | 'tel' | 'none'
  /** Phones: `none` for URLs, usernames (upstream KeyboardCapitalization.None). */
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
  /** false also turns autocorrect off (upstream autoCorrectEnabled = false). */
  spellCheck?: boolean
  name?: string
  className?: string
  style?: CSSProperties
  ref?: Ref<HTMLInputElement | HTMLTextAreaElement>
}

/**
 * Upstream `EditTextBox` (`ui/components/EditTextBox.kt:71-176`): pill (or 8dp for multi-line) box in
 * surfaceVariant @.6, @.8 focused, @.25 disabled, errorContainer @.75 when invalid; text bodyLarge
 * onSurfaceVariant (single-line: onPrimaryContainer and a 4dp primary indicator line while focused, as
 * the String overload at :211-313); 8dp padding; a leading icon sits in a 48dp slot from the edge (single-line) or
 * 8dp before the text (multi-line); 280dp min width (TextFieldDefaults.MinWidth).
 */
export function TextField({
  value,
  onChange,
  onSubmit,
  label,
  placeholder,
  type = 'text',
  maxLines = 1,
  leading,
  disabled,
  readOnly,
  invalid,
  autoComplete,
  autoFocus,
  enterKeyHint,
  inputMode,
  autoCapitalize,
  spellCheck,
  name,
  className,
  style,
  ref,
}: TextFieldProps) {
  const multiline = maxLines > 1
  const change = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value)
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSubmit) {
      e.preventDefault()
      onSubmit(value)
    }
  }
  const common = {
    value,
    onChange: change,
    'aria-label': label,
    'aria-invalid': invalid || undefined,
    placeholder,
    disabled,
    readOnly,
    autoComplete,
    autoFocus,
    name,
    'data-focusable': true,
    className: styles.input,
  }
  return (
    <label
      className={clsx(
        styles.box,
        multiline && styles.multiline,
        invalid && styles.invalid,
        disabled && styles.disabled,
        className,
      )}
      style={style}
    >
      {leading != null && <span className={styles.leading}>{leading}</span>}
      {multiline ? (
        <textarea {...common} ref={ref as Ref<HTMLTextAreaElement>} rows={maxLines} />
      ) : (
        <input
          {...common}
          ref={ref as Ref<HTMLInputElement>}
          type={type}
          onKeyDown={key}
          enterKeyHint={enterKeyHint}
          inputMode={inputMode}
          autoCapitalize={autoCapitalize}
          autoCorrect={spellCheck === false ? 'off' : undefined}
          spellCheck={spellCheck ?? (type === 'search' ? false : undefined)}
        />
      )}
    </label>
  )
}
