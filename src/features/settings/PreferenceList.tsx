import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../api/session'
import { ListItem } from '../../ui'
import styles from './Preference.module.css'
import { PreferenceRow } from './PreferenceRow'
import type { PrefGroup } from './prefModel'
import { settingsServerNotice } from '../../lib/serverVersion'

export type PreferenceListProps = {
  groups: readonly PrefGroup[]
  hdrPage?: boolean
  /** Show the server version warning first (every PreferencesContent screen does). */
  serverBanner?: boolean
}

/** Group headers (titleMedium, 8/4dp) and rows, as PreferencesContent's LazyColumn. */
export function PreferenceList({ groups, hdrPage, serverBanner }: PreferenceListProps) {
  const { t } = useTranslation()
  const session = useSession()
  const banner = serverBanner && session ? settingsServerNotice(t, session.server.version) : null
  return (
    <>
      {banner && (
        <div className={styles.row} data-pref-id="ServerVersionWarning">
          <ListItem headline={<span className={`${styles.title} ${styles.error}`}>{banner}</span>} onClick={() => {}} />
        </div>
      )}
      {groups.map((g) => (
        <Fragment key={g.titleKey}>
          <h2 className={styles.groupHeader}>{t(g.titleKey)}</h2>
          {g.entries.map((m) => (
            <PreferenceRow key={m.id} meta={m} hdrPage={hdrPage} />
          ))}
        </Fragment>
      ))}
    </>
  )
}
