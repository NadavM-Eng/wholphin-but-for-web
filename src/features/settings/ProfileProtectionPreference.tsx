import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from '../../app/toast'
import { setUserProtection, useSessionStore } from '../../stores/session'
import { ChoicePreference } from './ChoicePreference'
import { ClickPreference } from './ClickPreference'
import { SetPinFlow } from './SetPinFlow'

const OPTIONS = ['none', 'require_pin_code', 'require_login'] as const

/**
 * Profile protection (PreferencesContent.kt:453-495): derived as login > PIN > none from the saved user.
 * None removes PIN and login requirement at once; Require login sets it (and clears the PIN) at once;
 * Require PIN runs SetPinFlow (create, or type the current PIN to remove it). With `showChangePin` a
 * "Change PIN" row follows when a PIN is set (web addition: upstream can only remove and re-create).
 */
export function ProfileProtectionPreference({ id, title, showChangePin }: { id: string; title: string; showChangePin?: boolean }) {
  const { t } = useTranslation()
  const user = useSessionStore((s) => s.current?.user ?? null)
  const [flow, setFlow] = useState<null | 'set-or-remove' | 'change'>(null)
  if (!user) return null
  const hasPin = !!user.pin?.trim()
  const selected = user.requireLogin ? 2 : hasPin ? 1 : 0
  const apply = (pin: string | null, requireLogin: boolean) => {
    try {
      setUserProtection(user.serverId, user.id, { pin, requireLogin })
    } catch (e) {
      toast(`${t('error')}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return (
    <>
      <ChoicePreference
        id={id}
        title={title}
        summary={t(OPTIONS[selected])}
        options={OPTIONS.map((k) => ({ label: t(k) }))}
        selectedIndex={selected}
        onSelect={(i) => {
          if (i === 0) apply(null, false)
          else if (i === 2) apply(null, true)
          else setFlow('set-or-remove')
        }}
      />
      {showChangePin && hasPin && !user.requireLogin && (
        <ClickPreference id={`${id}.change`} title={t('web_change_pin')} onClick={() => setFlow('change')} />
      )}
      {flow && (
        <SetPinFlow
          currentPin={user.pin}
          mode={flow}
          onAddPin={(pin) => {
            apply(pin, false)
            setFlow(null)
          }}
          onRemovePin={() => {
            apply(null, false)
            setFlow(null)
          }}
          onClose={() => setFlow(null)}
        />
      )}
    </>
  )
}
