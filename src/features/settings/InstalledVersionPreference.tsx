import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CLIENT_NAME, CLIENT_VERSION, useSession } from '../../api/session'
import { nav, useNav } from '../../app/nav'
import { Dialog, TextButton } from '../../ui'
import { ClickPreference } from './ClickPreference'
import { UPSTREAM, upstreamLabel } from './debugInfo'
import styles from './InstalledVersionPreference.module.css'

const JELLYFIN_URL = 'https://jellyfin.org'

/**
 * Installed version (PreferencesContent.kt:337-350): summary = the version; click opens a scrollable dialog
 * (upstream: release notes from GitHub; the web shows what it is and what it is based on, the server and
 * links); long-press (right-click / touch hold) opens the Debug page.
 */
export function InstalledVersionPreference({ id, title }: { id: string; title: string }) {
  const { t } = useTranslation()
  const go = useNav()
  const session = useSession()
  const [open, setOpen] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const upstream = upstreamLabel()
  const commitUrl = UPSTREAM.commit ? `${UPSTREAM.repository}/commit/${UPSTREAM.commit}` : UPSTREAM.repository
  return (
    <>
      <ClickPreference
        id={id}
        title={title}
        summary={upstream ? `${CLIENT_VERSION} · ${t('web_based_on', { p1: upstream })}` : CLIENT_VERSION}
        onClick={() => setOpen(true)}
        onLongClick={() => go.debug()}
      />
      {/* ScrollableDialog focuses its list, not an entry in it: Up / Down scroll the text */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        variant="scrollable"
        className={styles.dialog}
        label={title}
        initialFocus={() => heading.current?.closest<HTMLElement>('[role="dialog"]')}
      >
        <h2 ref={heading} className={styles.heading}>{`${CLIENT_NAME} ${CLIENT_VERSION}`}</h2>
        <p className={styles.text}>{t('web_about_description')}</p>
        <dl className={styles.facts}>
          <dt>{t('web_upstream_version')}</dt>
          <dd>
            <a className={styles.link} href={commitUrl} target="_blank" rel="noreferrer" data-focusable>
              {upstream ? `Wholphin ${upstream}` : 'Wholphin'}
            </a>
          </dd>
          {session && (
            <>
              <dt>{t('web_server')}</dt>
              <dd>
                {session.server.name ?? session.server.url}
                {session.server.version ? ` · Jellyfin ${session.server.version}` : ''}
              </dd>
              <dt>{t('web_server_address')}</dt>
              <dd dir="ltr">{session.server.url}</dd>
            </>
          )}
          <dt>{t('web_license')}</dt>
          <dd>GPL-2.0-only</dd>
        </dl>
        <div className={styles.links}>
          <a className={styles.link} href={UPSTREAM.repository} target="_blank" rel="noreferrer" data-focusable>
            {t('web_upstream_project')}
          </a>
          <a className={styles.link} href={`${UPSTREAM.repository}/releases`} target="_blank" rel="noreferrer" data-focusable>
            {t('web_upstream_releases')}
          </a>
          <a className={styles.link} href={JELLYFIN_URL} target="_blank" rel="noreferrer" data-focusable>
            Jellyfin
          </a>
        </div>
        <div className={styles.buttons}>
          <TextButton href={nav.license()} onClick={(e) => {
              e.preventDefault()
              setOpen(false)
              go.license()
            }}>
            {t('license_info')}
          </TextButton>
          <TextButton href={nav.debug()} onClick={(e) => {
              e.preventDefault()
              setOpen(false)
              go.debug()
            }}>
            {t('show_debug_info')}
          </TextButton>
        </div>
      </Dialog>
    </>
  )
}
