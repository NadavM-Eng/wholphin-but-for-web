import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from '../../app/toast'
import { Dialog } from '../../ui'
import { PinEntry } from './PinEntry'

type FlowState = 'ENTER_PIN_TO_REMOVE' | 'VERIFY_TO_CHANGE' | 'ENTER_PIN' | 'CONFIRM_PIN'

export type SetPinFlowProps = {
  currentPin: string | null
  /** `change` (web addition): verify the current PIN, then enter and confirm a new one. */
  mode: 'set-or-remove' | 'change'
  onAddPin: (pin: string) => void
  onRemovePin: () => void
  onClose: () => void
}

/** Minimum PIN length (SetPinFlow.kt `it.length >= 4`). */
export const MIN_PIN_LENGTH = 4

/**
 * `SetPinFlow` (W/ui/preferences/SetPinFlow.kt) in a BasicDialog. Without a PIN: Enter PIN -> Confirm PIN
 * (too short: toast; mismatch: toast "Incorrect" and start over). With a PIN: typing the current one removes
 * it (compared on every key). Change mode verifies the current PIN first, then runs the create steps.
 */
export function SetPinFlow({ currentPin, mode, onAddPin, onRemovePin, onClose }: SetPinFlowProps) {
  const { t } = useTranslation()
  const hasPin = !!currentPin?.trim()
  const [state, setState] = useState<FlowState>(
    !hasPin ? 'ENTER_PIN' : mode === 'change' ? 'VERIFY_TO_CHANGE' : 'ENTER_PIN_TO_REMOVE',
  )
  const [pending, setPending] = useState('')

  let body
  switch (state) {
    case 'ENTER_PIN_TO_REMOVE':
      body = <PinEntry key={state} title={t('enter_pin')} onChange={(p) => p === currentPin && onRemovePin()} />
      break
    case 'VERIFY_TO_CHANGE':
      body = <PinEntry key={state} title={t('enter_pin')} onChange={(p) => p === currentPin && setState('ENTER_PIN')} />
      break
    case 'ENTER_PIN':
      body = (
        <PinEntry
          key={state}
          title={mode === 'change' && hasPin ? t('web_new_pin') : t('enter_pin')}
          onConfirm={(p) => {
            if (p.length >= MIN_PIN_LENGTH) {
              setPending(p)
              setState('CONFIRM_PIN')
            } else {
              toast(t('pin_too_short'))
            }
          }}
        />
      )
      break
    case 'CONFIRM_PIN':
      body = (
        <PinEntry
          key={state}
          title={t('confirm_pin')}
          onConfirm={(p) => {
            if (p === pending) onAddPin(pending)
            else {
              toast(t('incorrect'))
              setState('ENTER_PIN')
            }
          }}
        />
      )
      break
  }

  return (
    <Dialog
      open
      onClose={onClose}
      variant="basic"
      label={t('profile_protection')}
      initialFocus={() => document.querySelector<HTMLElement>('[data-pin-input]')}
    >
      {body}
    </Dialog>
  )
}
