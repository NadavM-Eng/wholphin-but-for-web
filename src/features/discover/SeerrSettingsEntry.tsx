import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { refreshSeerr, unlinkSeerr, useSeerrSession } from '../../api/seerr'
import { toast } from '../../app/toast'
import { ConfirmDialog, Dialog, DialogPopup, ListItem, TextButton } from '../../ui'
import { SeerrLinkDialog } from './SeerrLinkDialog'
import { seerrUserLine, plainT } from './seerrText'
import styles from './SeerrSettingsEntry.module.css'

export type SeerrSettingsEntryProps = {
  className?: string
}

type Mode = 'none' | 'info' | 'link' | 'relogin' | 'remove' | 'expired' | 'error'

/**
 * The "Seerr integration" settings entry (Settings > More, `AppPreference.SeerrIntegration`) for the
 * settings screen to mount. Summary: "Add Server" / "Enabled" / "Server error", plus the web states
 * "unavailable" (no proxy on this deployment, explained in a dialog) and "Session expired" (sign in again).
 * Click: add flow, remove confirmation, or error dialog, as upstream.
 */
export function SeerrSettingsEntry({ className }: SeerrSettingsEntryProps) {
  const { t } = useTranslation()
  const seerr = useSeerrSession()
  const [mode, setMode] = useState<Mode>('none')

  const summary =
    seerr.status === 'unavailable'
      ? t('unavailable')
      : seerr.status === 'checking'
        ? t('web_seerr_checking')
        : seerr.status === 'linked'
          ? t('enabled')
          : seerr.status === 'expired'
            ? t('web_seerr_session_expired')
            : seerr.status === 'error'
              ? t('voice_error_server')
              : t('add_server')

  const onClick = () => {
    switch (seerr.status) {
      case 'unavailable':
        return setMode('info')
      case 'notLinked':
        return setMode('link')
      case 'linked':
        return setMode('remove')
      case 'expired':
        return setMode('expired')
      case 'error':
        return setMode('error')
      default:
        return undefined
    }
  }

  const remove = async () => {
    setMode('none')
    try {
      await unlinkSeerr()
    } catch {
      toast(t('web_seerr_could_not_remove'))
    }
  }

  const body = seerrUserLine(seerr.link, plainT(t))
  return (
    <>
      <ListItem
        className={className}
        headline={t('seerr_integration')}
        supporting={summary}
        onClick={onClick}
        disabled={seerr.status === 'checking'}
      />
      <Dialog open={mode === 'info'} onClose={() => setMode('none')} variant="basic" label={t('seerr_integration')}>
        <div className={styles.info}>
          <h2 className={styles.title}>{t('seerr_integration')}</h2>
          <p className={styles.body}>
            {seerr.available === false && seerr.error ? t('web_seerr_unreachable') : t('web_seerr_unavailable')}
          </p>
          <div className={styles.actions}>
            <TextButton
              onClick={() => {
                setMode('none')
                void refreshSeerr()
              }}
            >
              {t('retry')}
            </TextButton>
            <TextButton onClick={() => setMode('none')}>{t('cancel')}</TextButton>
          </div>
        </div>
      </Dialog>
      <SeerrLinkDialog open={mode === 'link'} onClose={() => setMode('none')} />
      <SeerrLinkDialog open={mode === 'relogin'} method={seerr.link?.method} onClose={() => setMode('none')} />
      <ConfirmDialog
        open={mode === 'remove'}
        title={t('remove_seerr_server')}
        body={body}
        cancelLabel={t('cancel')}
        confirmLabel={t('remove')}
        onCancel={() => setMode('none')}
        onConfirm={() => void remove()}
      />
      <DialogPopup
        open={mode === 'expired'}
        title={t('web_seerr_session_expired')}
        onClose={() => setMode('none')}
        dismissOnClick={false}
        items={[
          {
            key: 'login',
            headline: t('web_seerr_sign_in_again'),
            supporting: body,
            onSelect: () => setMode('relogin'),
          },
          {
            key: 'remove',
            headline: t('remove_seerr_server'),
            onSelect: () => void remove(),
          },
        ]}
      />
      <ConfirmDialog
        open={mode === 'error'}
        title={t('remove_seerr_server')}
        body={`${body}\n\n${t('error')}: ${seerr.error ?? ''}`}
        bodyColor="var(--c-error)"
        cancelLabel={t('cancel')}
        confirmLabel={t('remove')}
        onCancel={() => setMode('none')}
        onConfirm={() => void remove()}
      />
    </>
  )
}
