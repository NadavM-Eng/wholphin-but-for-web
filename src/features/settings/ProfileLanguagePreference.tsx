import { getLocalizationApi } from '@jellyfin/sdk/lib/utils/api/localization-api'
import { useQuery } from '@tanstack/react-query'
import { qk } from '../../api/queryKeys'
import { useApi, useSession } from '../../api/session'
import { languageOptions } from './languageOptions'
import { PreferredLanguagePreference } from './PreferredLanguagePreference'

/**
 * "Preferred audio language" / "Preferred subtitle language" (UserProfilePreferencesPage.kt): this device's
 * override of the language the server profile prefers. Upstream has both on its User Profile page; the web shows
 * each with its subject (Audio, Subtitles).
 */
export function ProfileLanguagePreference({ id, title, kind }: { id: string; title: string; kind: 'audio' | 'subtitle' }) {
  const api = useApi()
  const config = useSession()?.userDto.Configuration
  const cultures = useQuery({
    queryKey: qk('cultures'),
    staleTime: Infinity,
    queryFn: async ({ signal }) => (await getLocalizationApi(api).getCultures({ signal })).data,
  })
  return (
    <PreferredLanguagePreference
      id={id}
      title={title}
      prefKey={kind === 'audio' ? 'preferredAudioLang' : 'preferredSubtitleLang'}
      options={languageOptions(cultures.data, kind === 'audio' ? config?.AudioLanguagePreference : config?.SubtitleLanguagePreference)}
    />
  )
}
