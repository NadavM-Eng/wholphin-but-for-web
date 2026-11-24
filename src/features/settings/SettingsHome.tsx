import { useTranslation } from 'react-i18next'
import { useNav } from '../../app/nav'
import { ClickPreference } from './ClickPreference'
import styles from './Preference.module.css'
import { PreferenceList } from './PreferenceList'
import { SettingsLayout } from './SettingsLayout'
import { TopicRows } from './TopicRows'
import { buildRows, QUICK_ROWS, TOPICS, topicPreview, topicRowId } from './topics'
import { useVisibilityContext } from './useVisibilityContext'

/**
 * The first Settings screen on the web (owner request): the few rows people change most, then the nine subjects.
 * Each subject lists the rows inside it under its name, one to a line, so a row can be found without opening
 * every subject. Upstream's first screen is its "Settings" list (PreferenceScreenOption.BASIC).
 */
export function SettingsHome() {
  const { t } = useTranslation()
  const go = useNav()
  const ctx = useVisibilityContext()
  const quick = buildRows(QUICK_ROWS, ctx)
  return (
    <SettingsLayout title={t('settings')} initialFocusId={quick[0]?.id}>
      <PreferenceList groups={[]} serverBanner />
      <TopicRows sections={[{ titleKey: 'web_quick_settings', rows: quick }]} columns />
      <h2 className={styles.groupHeader}>{t('web_all_settings')}</h2>
      <div className={styles.topicsBox}>
        <div className={styles.subjects}>
          {TOPICS.map((topic) => (
            <ClickPreference
              key={topic.id}
              id={topicRowId(topic.id)}
              title={t(topic.titleKey)}
              summary={topicPreview(topic, ctx).map((key) => (
                <span key={key} className={styles.subjectRow} data-subject-row>
                  {t(key)}
                </span>
              ))}
              onClick={() => go.settingsTopic(topic.id)}
            />
          ))}
        </div>
      </div>
    </SettingsLayout>
  )
}
