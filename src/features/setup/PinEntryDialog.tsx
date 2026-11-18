import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CircularProgress, TextButton } from '../../ui'
import type { PinKey } from './pin'
import { PinArrowRow, PinEntryDots, PinPad } from './PinEntry'
import { usePinInput } from './usePinInput'
import styles from './PinEntry.module.css'
import { SetupDialog } from './SetupDialog'

export type PinEntryDialogProps = {
  /** The stored PIN (plain key sequence, as upstream). */
  pin: string
  /** The typed sequence matched; resolves when the sign-in attempt is over. */
  onMatch: () => Promise<void> | void
  /** "Login via server" (removes the PIN after a successful server login). */
  onServerAuth: () => void
  onClose: () => void
}

/**
 * `PinEntryDialog` (W/ui/setup/PinEntry.kt:41-108, 228-243): "Enter PIN", the arrow/digit hint row, dots,
 * and "Login via server". Each key (arrow or digit) is appended and the sequence is compared on every key.
 * Web additions: Backspace and an on-screen keypad; a wrong sequence as long as the PIN shakes and clears
 * (upstream keeps appending silently, with no way to correct a typo).
 */
export function PinEntryDialog({ pin, onMatch, onServerAuth, onClose }: PinEntryDialogProps) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [wrong, setWrong] = useState(false)
  const serverAuth = useRef<HTMLElement>(null)
  const resetRef = useRef<() => void>(() => {})
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  // Length of the wrong sequence still on screen (shaking), or null.
  const wrongLength = useRef<number | null>(null)
  const appendRef = useRef<(k: PinKey) => void>(() => {})

  const onChange = useCallback(
    (value: string) => {
      setWrong(false)
      const stale = wrongLength.current
      if (stale != null) {
        // A key during the shake starts a new attempt with that key; Backspace just clears now.
        clearTimeout(timer.current)
        wrongLength.current = null
        resetRef.current()
        if (value.length > stale) appendRef.current(value.slice(stale) as PinKey)
        return
      }
      if (value === pin) {
        setBusy(true)
        void Promise.resolve(onMatch()).finally(() => {
          setBusy(false)
          resetRef.current()
        })
      } else if (value.length >= pin.length) {
        setWrong(true)
        clearTimeout(timer.current)
        wrongLength.current = value.length
        timer.current = setTimeout(() => {
          wrongLength.current = null
          setWrong(false)
          resetRef.current()
        }, 450)
      }
    },
    [pin, onMatch],
  )
  const input = usePinInput(onChange)
  useEffect(() => {
    resetRef.current = input.reset
    appendRef.current = input.append
  }, [input.reset, input.append])

  return (
    <SetupDialog
      open
      onClose={onClose}
      label={t('enter_pin')}
      size="compact"
      initialFocus={() => serverAuth.current}
    >
      <div
        className={styles.column}
        data-testid="pin-entry"
        onKeyDown={(e) => {
          if (!busy) input.onKeyDown(e)
        }}
      >
        <h2 className={styles.title}>{t('enter_pin')}</h2>
        <PinArrowRow onKey={(k) => !busy && input.append(k)} />
        <PinEntryDots count={input.value.length} error={wrong} />
        {busy ? (
          <CircularProgress size={32} />
        ) : (
          <PinPad onKey={input.append} onBackspace={input.backspace} />
        )}
        <TextButton ref={serverAuth} onClick={onServerAuth}>
          <span className={styles.serverAuth}>
            <span>{t('use_server_credentials')}</span>
            <span className={styles.serverAuthSmall}>{t('will_remove_pin')}</span>
          </span>
        </TextButton>
      </div>
    </SetupDialog>
  )
}
