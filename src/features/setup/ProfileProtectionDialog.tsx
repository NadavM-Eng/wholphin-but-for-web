import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { setUserProtection, type SavedUser } from '../../stores/session'
import { DialogPopup, SelectedDot } from '../../ui'
import { PinEntryDialog } from './PinEntryDialog'
import { profileProtectionOf, type ProfileProtection } from './pin'
import { SetPinFlow } from './SetPinFlow'

export type ProfileProtectionDialogProps = {
  user: SavedUser
  onClose: () => void
  /**
   * Ask for the current PIN before NONE / LOGIN replace it. Upstream never does (it only offers the choice
   * to the signed-in user in Settings); the user picker must, since anyone can open it.
   */
  verifyPin?: boolean
  /** Server-auth fallback of the verify step. */
  onServerAuth?: () => void
}

/**
 * "Profile protection" choice (PreferencesContent.kt:453-495): None / Require PIN for profile / Require
 * login for profile, stored with `setUserProtection` (updateUserAuth). PIN opens `SetPinFlow`.
 */
export function ProfileProtectionDialog({ user, onClose, verifyPin = false, onServerAuth }: ProfileProtectionDialogProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState<'choose' | 'pin' | { verifyFor: ProfileProtection }>('choose')
  const current = profileProtectionOf(user)
  const hasPin = !!user.pin?.trim()

  const apply = (p: ProfileProtection) => {
    if (p === 'NONE') setUserProtection(user.serverId, user.id, { pin: null, requireLogin: false })
    if (p === 'LOGIN') setUserProtection(user.serverId, user.id, { pin: null, requireLogin: true })
    onClose()
  }
  const choose = (p: ProfileProtection) => {
    if (p === 'PIN') return setStep('pin')
    if (verifyPin && hasPin) return setStep({ verifyFor: p })
    apply(p)
  }

  if (step === 'pin') {
    return (
      <SetPinFlow
        currentPin={user.pin}
        onAddPin={(pin) => {
          setUserProtection(user.serverId, user.id, { pin, requireLogin: false })
          onClose()
        }}
        onRemovePin={() => {
          setUserProtection(user.serverId, user.id, { pin: null, requireLogin: false })
          onClose()
        }}
        onDismiss={onClose}
      />
    )
  }
  if (step !== 'choose') {
    return (
      <PinEntryDialog
        pin={user.pin ?? ''}
        onMatch={() => apply(step.verifyFor)}
        onServerAuth={() => {
          onClose()
          onServerAuth?.()
        }}
        onClose={onClose}
      />
    )
  }
  const options: { value: ProfileProtection; key: string }[] = [
    { value: 'NONE', key: 'none' },
    { value: 'PIN', key: 'require_pin_code' },
    { value: 'LOGIN', key: 'require_login' },
  ]
  return (
    <DialogPopup
      open
      title={t('profile_protection')}
      dismissOnClick={false}
      onClose={onClose}
      items={options.map((o) => ({
        key: o.value,
        headline: t(o.key),
        leading: <SelectedDot selected={o.value === current} />,
        selected: o.value === current,
        onSelect: () => choose(o.value),
      }))}
    />
  )
}
