import { useTranslation } from 'react-i18next'
import styles from './LoadingScreen.module.css'

/** Full-screen centred spinner (upstream LoadingPage / setup `Loading`). */
export function LoadingScreen() {
  const { t } = useTranslation()
  return (
    <div className={styles.screen} role="progressbar" aria-label={t('loading')}>
      <div className={styles.spinner} />
    </div>
  )
}
