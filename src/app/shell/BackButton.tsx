import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { IconButton, MaterialIcon } from '../../ui'
import styles from './BackButton.module.css'
import { useGoBack } from './useGoBack'

export type BackButtonProps = {
  className?: string
}

/**
 * Web-only Back control (the TV remote's Back button). Goes back in history, or to Home when the page was
 * opened directly. Full-screen pages can place it themselves; the shell shows a floating one by default
 * (hide it with useHideBackButton()).
 */
export function BackButton({ className }: BackButtonProps) {
  const { t } = useTranslation()
  const goBack = useGoBack()
  return (
    <IconButton
      className={clsx(styles.button, className)}
      label={t('web_back')}
      icon={<MaterialIcon name="arrow_back" className={styles.icon} />}
      onClick={goBack}
    />
  )
}
