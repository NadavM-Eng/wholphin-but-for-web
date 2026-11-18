import { useTranslation } from 'react-i18next'
import { ErrorMessage, TextButton } from '../../ui'
import { sendAppLogs } from '../settings/sendAppLogs'

type Props = { message?: string | null; error?: unknown; className?: string }

function causes(error: unknown): string[] {
  const out: string[] = []
  let c = error instanceof Error ? error.cause : null
  while (c instanceof Error) {
    out.push(`Caused by: ${c.message}`)
    c = c.cause
  }
  return out
}

/** Upstream `ErrorMessage(message, exception)` (ui/components/ErrorMessage.kt) with its "Send app logs" button. */
export function LiveTvError({ message, error, className }: Props) {
  const { t } = useTranslation()
  const detail = error == null ? null : error instanceof Error ? error.message : String(error)
  return (
    <ErrorMessage
      className={className}
      title={t('compose_error_message_title')}
      action={<TextButton onClick={() => void sendAppLogs()}>{t('send_app_logs')}</TextButton>}
      message={message}
      detail={detail}
      causes={causes(error)}
    />
  )
}
