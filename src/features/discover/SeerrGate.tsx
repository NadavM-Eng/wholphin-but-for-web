import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { refreshSeerr, useSeerrSession } from '../../api/seerr'
import { Button, LoadingPage } from '../../ui'
import { SeerrLinkDialog } from './SeerrLinkDialog'
import { seerrUserLine, plainT } from './seerrText'
import styles from './SeerrGate.module.css'

/**
 * Renders Discover content only while a Seerr session is active. Otherwise explains why and offers the
 * sign-in flow (upstream hides Discover entirely; the web keeps the page reachable so it can link).
 */
export function SeerrGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const seerr = useSeerrSession()
  const [linking, setLinking] = useState(false)

  if (seerr.status === 'linked') return <>{children}</>
  if (seerr.status === 'checking') return <LoadingPage delayMs={300} label={t('loading')} />

  let message: string
  let action: ReactNode = null
  switch (seerr.status) {
    case 'unavailable':
      message = seerr.error ? t('web_seerr_unreachable') : t('web_seerr_unavailable')
      action = seerr.error ? <Button onClick={() => void refreshSeerr()}>{t('retry')}</Button> : null
      break
    case 'error':
      message = `${t('voice_error_server')}: ${seerr.error ?? ''}`
      action = <Button onClick={() => void refreshSeerr()}>{t('retry')}</Button>
      break
    case 'expired':
      message = t('web_seerr_expired')
      action = <Button onClick={() => setLinking(true)}>{t('web_seerr_sign_in_again')}</Button>
      break
    default:
      message = t('web_seerr_not_linked')
      action = <Button onClick={() => setLinking(true)}>{t('web_seerr_sign_in')}</Button>
  }
  return (
    <div className={styles.root}>
      <h1 className={styles.title}>{t('discover')}</h1>
      <p className={styles.message}>{message}</p>
      {seerr.status === 'expired' && seerr.link && <p className={styles.detail}>{seerrUserLine(seerr.link, plainT(t))}</p>}
      {action}
      <SeerrLinkDialog
        open={linking}
        method={seerr.status === 'expired' ? seerr.link?.method : null}
        onClose={() => setLinking(false)}
      />
    </div>
  )
}
