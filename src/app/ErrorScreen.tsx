import { useTranslation } from 'react-i18next'
import styles from './ErrorScreen.module.css'

/** Error message page (upstream `ErrorMessage`): title, message and a reload / home action. */
export function ErrorScreen({ error, title }: { error: unknown; title?: string }) {
  const { t } = useTranslation()
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : null
  return (
    <div className={styles.screen} role="alert">
      <h1 className="t-headlineSmall">{title ?? t('web_error_title')}</h1>
      {message && <p className={styles.message}>{message}</p>}
      <div className={styles.actions}>
        <button type="button" data-focusable className={styles.button} onClick={() => window.location.reload()}>
          {t('web_reload')}
        </button>
        <a data-focusable className={styles.button} href="/">
          {t('web_go_home')}
        </a>
      </div>
    </div>
  )
}
