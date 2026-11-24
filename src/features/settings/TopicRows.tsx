import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './Preference.module.css'
import { PreferenceRow } from './PreferenceRow'
import { ProfileLanguagePreference } from './ProfileLanguagePreference'
import { ProfileProtectionPreference } from './ProfileProtectionPreference'
import { ResetPreferencesPreference } from './ResetPreferencesPreference'
import { SignOutPreference } from './SignOutPreference'
import { SubtitleModePreference } from './SubtitleModePreference'
import type { TopicRow, TopicSection } from './topics'

/**
 * The rows of a subject (or the quick rows), each under its section heading when it has one. `columns`: the rows
 * stand two beside each other where the panel is wide enough (the first screen).
 */
export function TopicRows({ sections, columns = false }: { sections: readonly TopicSection[]; columns?: boolean }) {
  const { t } = useTranslation()
  const render = (row: TopicRow) => {
    const title = t(row.titleKey)
    switch (row.id) {
      case 'WebSignOut':
        return <SignOutPreference key={row.id} />
      case 'WebResetPreferences':
        return <ResetPreferencesPreference key={row.id} id={row.id} title={title} />
      case 'PreferredAudioLang':
        return <ProfileLanguagePreference key={row.id} id={row.id} title={title} kind="audio" />
      case 'PreferredSubtitleLang':
        return <ProfileLanguagePreference key={row.id} id={row.id} title={title} kind="subtitle" />
      // with the "Change PIN" row, as upstream's User Profile page had it on the web
      case 'ProtectProfilePreference':
        return <ProfileProtectionPreference key={row.id} id={row.id} title={title} showChangePin />
    }
    if (!row.meta) return null
    if (row.id === 'SubtitleModePref') return <SubtitleModePreference key={row.id} meta={row.meta} title={title} />
    return <PreferenceRow key={row.id} meta={row.meta} />
  }
  return (
    <>
      {sections.map((s, i) => (
        <Fragment key={s.titleKey ?? i}>
          {s.titleKey && <h2 className={styles.groupHeader}>{t(s.titleKey)}</h2>}
          {columns ? (
            <div className={styles.topicsBox}>
              <div className={styles.topics}>{s.rows.map(render)}</div>
            </div>
          ) : (
            s.rows.map(render)
          )}
        </Fragment>
      ))}
    </>
  )
}
