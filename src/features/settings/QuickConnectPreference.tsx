import { getAuthenticationApi } from '@jellyfin/sdk/lib/utils/api/authentication-api'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getSession } from '../../api/session'
import { toast } from '../../app/toast'
import { Dialog, TextButton, TextField } from '../../ui'
import { ClickPreference } from './ClickPreference'
import styles from './QuickConnectPreference.module.css'

const isValidCode = (v: string) => /^\d{6}$/.test(v.trim())

/**
 * Quick Connect, authorize another device (PreferencesContent.kt:542-556,734-763; QuickConnectDialog.kt):
 * a 360dp dialog with a numeric box; only a trimmed 6-digit code is accepted ("Code must be 6 digits").
 * `POST /QuickConnect/Authorize`; success toasts and closes, failure toasts and keeps the dialog open.
 */
export function QuickConnectPreference({ id, title, summary }: { id: string; title: string; summary?: string | null }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [showError, setShowError] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!isValidCode(code)) {
      setShowError(true)
      return
    }
    setShowError(false)
    const session = getSession()
    if (!session || busy) return
    setBusy(true)
    try {
      const res = await getAuthenticationApi(session.api).authorizeQuickConnect({ code: code.trim(), userId: session.user.id })
      if (res.data === true) {
        toast(t('quick_connect_success'))
        setOpen(false)
      } else {
        toast(t('web_quick_connect_failed'))
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : t('web_quick_connect_failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <ClickPreference
        id={id}
        title={title}
        summary={summary ?? undefined}
        onClick={() => {
          if (!getSession()) return
          setCode('')
          setShowError(false)
          setOpen(true)
        }}
      />
      <Dialog open={open} onClose={() => setOpen(false)} variant="basic" elevation={3} label={t('quick_connect_code')}>
        <div className={styles.column}>
          <p className={styles.title}>{t('quick_connect_code')}</p>
          <TextField
            value={code}
            onChange={(v) => {
              setCode(v)
              setShowError(false)
            }}
            onSubmit={() => void submit()}
            label={t('quick_connect_code')}
            inputMode="numeric"
            enterKeyHint="done"
            autoComplete="one-time-code"
            invalid={showError && !isValidCode(code)}
            autoFocus
          />
          {showError && <p className={styles.error}>{t('quick_connect_code_error')}</p>}
          <TextButton className={styles.submit} onClick={() => void submit()} disabled={busy}>
            {t('submit')}
          </TextButton>
        </div>
      </Dialog>
    </>
  )
}
