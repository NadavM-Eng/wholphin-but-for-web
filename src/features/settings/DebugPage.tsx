import { useEffect, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { leaveUser, signOut, useSession } from '../../api/session'
import { queryClient } from '../../api/queryClient'
import { useNav } from '../../app/nav'
import { toast } from '../../app/toast'
import { resetPrefs, usePrefsStore } from '../../stores/preferences'
import { ConfirmDialog, TextButton } from '../../ui'
import { clearCacheStorage } from './cacheTools'
import { formatLogLine, getLogLines, getLogVersion, installClientLog, subscribeLog } from './clientLog'
import { appInfo, codecSupport, deviceInfo, hdrDecodeSupport, measuredPlaybackSupport, sectionsToText, userInfo, type Section } from './debugInfo'
import styles from './DebugPage.module.css'
import { FullPage } from './FullPage'
import { sendAppLogs } from './sendAppLogs'

/**
 * Debug page (Destination.Debug, W/ui/detail/DebugPage.kt; reachable without a session): app and device
 * information, codec / HDR support detected in this browser (instead of ExoPlayer / display-mode tables),
 * preferences, server and user (token redacted) and the last 500 client log lines coloured by level.
 * Web helpers: copy everything, send logs, clear caches, reset preferences, switch user, sign out.
 */
export default function DebugPage() {
  const { t } = useTranslation()
  const go = useNav()
  const session = useSession()
  const prefs = usePrefsStore((s) => s.values)
  const [hdr, setHdr] = useState<Section | null>(null)
  const [measured, setMeasured] = useState<Section | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  useEffect(installClientLog, [])
  useSyncExternalStore(subscribeLog, getLogVersion, getLogVersion)
  const logs = getLogLines()

  useEffect(() => {
    let alive = true
    void hdrDecodeSupport().then((s) => alive && setHdr(s))
    void measuredPlaybackSupport().then((s) => alive && setMeasured(s))
    return () => {
      alive = false
    }
  }, [])

  const sections: Section[] = [
    appInfo(),
    deviceInfo(),
    codecSupport(),
    ...(measured ? [measured] : []),
    ...(hdr ? [hdr] : []),
    { title: 'AppPreferences', rows: [['JSON', JSON.stringify(prefs, null, 1)]] },
    userInfo(session),
  ]

  const copy = async () => {
    const text = `${sectionsToText(sections)}\n\n## Log\n${logs.map(formatLogLine).join('\n')}`
    try {
      await navigator.clipboard.writeText(text)
      toast(t('web_copied'))
    } catch {
      toast(t('web_copy_failed'))
    }
  }

  return (
    <FullPage
      title={t('web_debug_title')}
      actions={
        <>
          <TextButton onClick={() => void copy()}>{t('web_copy_debug_info')}</TextButton>
          {session && <TextButton onClick={() => void sendAppLogs()}>{t('send_app_logs')}</TextButton>}
          <TextButton
            onClick={() =>
              void clearCacheStorage().then(() => {
                queryClient.clear()
                toast(t('web_cache_cleared'))
              })
            }
          >
            {t('web_clear_cache')}
          </TextButton>
          <TextButton onClick={() => setConfirmReset(true)}>{t('web_reset_preferences')}</TextButton>
          {session && (
            <TextButton
              onClick={() => {
                leaveUser()
                go.users()
              }}
            >
              {t('web_switch_user')}
            </TextButton>
          )}
          {session && (
            <TextButton onClick={() => void signOut().then(() => go.users())}>{t('web_sign_out')}</TextButton>
          )}
        </>
      }
    >
      {sections.map((s) => (
        <section key={s.title} className={styles.section}>
          <h2 className={styles.heading}>{s.title}</h2>
          <dl className={styles.rows}>
            {s.rows.map(([k, v]) => (
              <div key={k} className={styles.row}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <section className={styles.section}>
        <h2 className={styles.heading}>{t('web_client_log')}</h2>
        <div className={styles.log} dir="ltr">
          {logs.length === 0 && <p className={styles.empty}>-</p>}
          {logs.map((l, i) => (
            <div key={i} className={styles[`level${l.level}`]}>
              {formatLogLine(l)}
            </div>
          ))}
        </div>
      </section>
      <ConfirmDialog
        open={confirmReset}
        title={t('web_reset_preferences')}
        body={t('web_reset_preferences_body')}
        cancelLabel={t('cancel')}
        confirmLabel={t('reset')}
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false)
          resetPrefs('all')
          toast(t('web_preferences_reset'))
        }}
      />
    </FullPage>
  )
}
