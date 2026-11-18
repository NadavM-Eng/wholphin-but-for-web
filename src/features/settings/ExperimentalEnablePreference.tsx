import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getPref, setPref, usePrefs } from '../../stores/preferences'
import { ConfirmDialog } from '../../ui'
import { SwitchPreference } from './SwitchPreference'

/** ExperimentalPreference.Enable (PreferencesContent.kt:630-668): off at once; turning it on asks first. */
export function ExperimentalEnablePreference({ id, title }: { id: string; title: string }) {
  const { t } = useTranslation()
  const value = usePrefs('experimentalEnable')
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <SwitchPreference
        id={id}
        title={title}
        value={value}
        summary={t(value ? 'enabled' : 'disabled')}
        onToggle={() => (getPref('experimentalEnable') ? setPref('experimentalEnable', false) : setConfirm(true))}
      />
      <ConfirmDialog
        open={confirm}
        title={t('confirm_enable_experimental_title')}
        body={t('confirm_enable_experimental_body')}
        cancelLabel={t('cancel')}
        confirmLabel={t('confirm')}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false)
          setPref('experimentalEnable', true)
        }}
      />
    </>
  )
}
