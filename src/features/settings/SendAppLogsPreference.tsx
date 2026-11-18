import { useEffect } from 'react'
import { ClickPreference } from './ClickPreference'
import { installClientLog } from './clientLog'
import { sendAppLogs } from './sendAppLogs'

/** SendAppLogs (Advanced > More). */
export function SendAppLogsPreference({ id, title, summary }: { id: string; title: string; summary?: string | null }) {
  useEffect(installClientLog, [])
  return <ClickPreference id={id} title={title} summary={summary ?? undefined} onClick={() => void sendAppLogs()} />
}
