import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from '../../app/toast'
import { isPinLongEnough } from './pin'
import { PinArrowRow, PinEntryDots, PinPad } from './PinEntry'
import { usePinInput } from './usePinInput'
import styles from './PinEntry.module.css'
import { SetupDialog } from './SetupDialog'

type PinCreateProps = {
  title: string
  onTextChange: (value: string) => void
  /** null hides the confirm hint and OK key (the remove variant). */
  onConfirm: ((value: string) => void) | null
}

/**
 * `PinEntryCreate` (PinEntry.kt:110-172): title, hint row, dots and "Press center to confirm"; Enter (or the
 * OK key) confirms. The column itself takes focus so every key lands in the PIN.
 */
function PinEntryCreate({ title, onTextChange, onConfirm }: PinCreateProps) {
  const { t } = useTranslation()
  const input = usePinInput(onTextChange)
  return (
    <div
      className={styles.column}
      tabIndex={-1}
      data-pin-create
      data-testid="pin-create"
      onKeyDown={(e) => {
        if (input.onKeyDown(e)) return
        // Enter on a keypad button presses that button; anywhere else it confirms (isEnterKey).
        if (e.key === 'Enter' && onConfirm && !(e.target as HTMLElement).closest('button')) {
          e.preventDefault()
          onConfirm(input.value)
        }
      }}
    >
      <h2 className={styles.title}>{title}</h2>
      <PinArrowRow onKey={input.append} />
      <PinEntryDots count={input.value.length} />
      {onConfirm && <p className={styles.hint}>{t('web_press_enter_to_confirm')}</p>}
      <PinPad onKey={input.append} onBackspace={input.backspace} onConfirm={onConfirm ? () => onConfirm(input.value) : undefined} />
    </div>
  )
}

type FlowState = 'ENTER_PIN_TO_REMOVE' | 'ENTER_PIN' | 'CONFIRM_PIN'

export type SetPinFlowProps = {
  currentPin: string | null
  onAddPin: (pin: string) => void
  onRemovePin: () => void
  onDismiss: () => void
}

/**
 * `SetPinFlow` (W/ui/preferences/SetPinFlow.kt): with a PIN set, typing it removes it (ENTER_PIN_TO_REMOVE);
 * otherwise ENTER_PIN (at least 4 keys, else "PIN must be 4 keys or longer") then CONFIRM_PIN ("Incorrect"
 * and back to ENTER_PIN on mismatch). Exported for the settings page (Profile protection).
 */
export function SetPinFlow({ currentPin, onAddPin, onRemovePin, onDismiss }: SetPinFlowProps) {
  const { t } = useTranslation()
  const [state, setState] = useState<FlowState>(currentPin?.trim() ? 'ENTER_PIN_TO_REMOVE' : 'ENTER_PIN')
  const pending = useRef('')
  const removeCheck = useCallback(
    (v: string) => {
      if (v === currentPin) onRemovePin()
    },
    [currentPin, onRemovePin],
  )
  const noop = useCallback(() => {}, [])
  const focusColumn = () => document.querySelector<HTMLElement>('[data-pin-create]')

  return (
    <SetupDialog open onClose={onDismiss} label={t(state === 'CONFIRM_PIN' ? 'confirm_pin' : 'enter_pin')} size="compact" initialFocus={focusColumn}>
      {state === 'ENTER_PIN_TO_REMOVE' && <PinEntryCreate key={state} title={t('enter_pin')} onTextChange={removeCheck} onConfirm={null} />}
      {state === 'ENTER_PIN' && (
        <PinEntryCreate
          key={state}
          title={t('enter_pin')}
          onTextChange={noop}
          onConfirm={(v) => {
            if (isPinLongEnough(v)) {
              pending.current = v
              setState('CONFIRM_PIN')
              requestAnimationFrame(() => focusColumn()?.focus())
            } else {
              toast(t('pin_too_short'))
            }
          }}
        />
      )}
      {state === 'CONFIRM_PIN' && (
        <PinEntryCreate
          key={state}
          title={t('confirm_pin')}
          onTextChange={noop}
          onConfirm={(v) => {
            if (v === pending.current) {
              onAddPin(pending.current)
            } else {
              toast(t('incorrect'))
              setState('ENTER_PIN')
              requestAnimationFrame(() => focusColumn()?.focus())
            }
          }}
        />
      )}
    </SetupDialog>
  )
}
