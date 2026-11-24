import { useTranslation } from 'react-i18next'
import { Navigate, useParams } from 'react-router'
import { nav } from '../../app/nav'
import { PreferenceList } from './PreferenceList'
import { SettingsLayout } from './SettingsLayout'
import { TopicRows } from './TopicRows'
import { buildTopic, topicFromParam } from './topics'
import { useVisibilityContext } from './useVisibilityContext'

/**
 * One subject of Settings (/settings/topic/:topic): web-only, see `topics.ts`. An unknown subject goes to the
 * first Settings screen.
 */
export default function SettingsTopicPage() {
  const { t } = useTranslation()
  const topic = topicFromParam(useParams().topic)
  const ctx = useVisibilityContext()
  if (!topic) return <Navigate to={nav.settings()} replace />
  const sections = buildTopic(topic, ctx)
  return (
    <SettingsLayout key={topic.id} title={t(topic.titleKey)} initialFocusId={sections[0]?.rows[0]?.id}>
      <PreferenceList groups={[]} serverBanner />
      <TopicRows sections={sections} />
    </SettingsLayout>
  )
}
