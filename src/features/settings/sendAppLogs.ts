import { getSystemApi } from '@jellyfin/sdk/lib/utils/api/system-api'
import { getSession } from '../../api/session'
import { toast } from '../../app/toast'
import { i18next } from '../../i18n'
import { formatLogLine, getLogLines } from './clientLog'
import { buildLogHeader } from './debugInfo'

/**
 * `ServerReportService.sendAppLogs`: uploads a header and the client log buffer to the current server
 * (`POST /ClientLog/Document`), then toasts the stored file name.
 */
export async function sendAppLogs(): Promise<void> {
  const session = getSession()
  if (!session) return
  const body = `${buildLogHeader('Send App Logs', session.server.version)}\n\n${getLogLines().map(formatLogLine).join('\n')}`
  try {
    const res = await getSystemApi(session.api).logFile({ body: new File([body], 'wholphin-web.log', { type: 'text/plain' }) })
    toast(i18next.t('web_report_sent', { p1: res.data.FileName ?? '' }))
  } catch (e) {
    // ExceptionHandler.kt (autoToast): "Error: <message>", long
    toast(`${i18next.t('error')}: ${e instanceof Error ? e.message : String(e)}`, { long: true })
  }
}
