import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from '../../app/toast'
import { resetPrefs } from '../../stores/preferences'
import { ConfirmDialog } from '../../ui'
import { ClickPreference } from './ClickPreference'

/** Web-only "Reset preferences" row: every setting of this device back to its default, after a confirmation. */
export function ResetPreferencesPreference({ id, title }: { id: string; title: string }) {
  const { t } = useTranslation()
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <ClickPreference id={id} title={title} onClick={() => setConfirm(true)} />
      <ConfirmDialog
        open={confirm}
        title={title}
        body={t('web_reset_preferences_body')}
        cancelLabel={t('cancel')}
        confirmLabel={t('reset')}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false)
          resetPrefs('all')
          toast(t('web_preferences_reset'))
        }}
      />
    </>
  )
}
