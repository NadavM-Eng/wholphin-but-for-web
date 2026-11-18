// Preferred audio/subtitle language options (W/ui/preferences/user/PreferredLanguage.kt,
// UserPreferencesViewModel.kt:62-133).
import type { CultureDto } from '@jellyfin/sdk/lib/generated-client/models'
import type { Translate } from './prefModel'

/** UserProfileSettings.USE_USER_PROFILE / PREFER_ANY_LANGUAGE */
export const USE_USER_PROFILE = ''
export const PREFER_ANY_LANGUAGE = '_any-language'

export type LanguageOption =
  | { kind: 'profile'; value: typeof USE_USER_PROFILE; serverName: string | null }
  | { kind: 'any'; value: typeof PREFER_ANY_LANGUAGE }
  | { kind: 'divider' }
  | { kind: 'language'; value: string; name: string }

/** Display name of a server-side language code (3-letter ISO, falls back to the code itself). */
export function cultureName(cultures: readonly CultureDto[], code: string | null | undefined): string | null {
  if (!code?.trim()) return null
  const c = code.trim().toLowerCase()
  const hit = cultures.find(
    (x) =>
      x.ThreeLetterISOLanguageName?.toLowerCase() === c ||
      x.TwoLetterISOLanguageName?.toLowerCase() === c ||
      x.ThreeLetterISOLanguageNames?.some((n) => n.toLowerCase() === c),
  )
  return hit?.DisplayName ?? code
}

/** Option list: profile, any, divider, then every culture with a 3-letter code (empty until cultures load). */
export function languageOptions(cultures: readonly CultureDto[] | undefined, serverCode: string | null | undefined): LanguageOption[] {
  if (!cultures) return []
  return [
    { kind: 'profile', value: USE_USER_PROFILE, serverName: cultureName(cultures, serverCode) },
    { kind: 'any', value: PREFER_ANY_LANGUAGE },
    { kind: 'divider' },
    ...cultures
      .filter((c) => !!c.ThreeLetterISOLanguageName)
      .map((c): LanguageOption => ({ kind: 'language', value: c.ThreeLetterISOLanguageName!, name: c.DisplayName ?? c.ThreeLetterISOLanguageName! })),
  ]
}

/** The selected option; a stored code that is not in the list reverts to the profile setting. */
export function selectedLanguage(options: readonly LanguageOption[], stored: string): LanguageOption | null {
  const profile = options.find((o) => o.kind === 'profile') ?? null
  if (stored === PREFER_ANY_LANGUAGE) return options.find((o) => o.kind === 'any') ?? profile
  if (stored) return options.find((o) => o.kind === 'language' && o.value === stored) ?? profile
  return profile
}

export function optionLabel(o: LanguageOption | null, t: Translate): string {
  if (!o || o.kind === 'profile') {
    const name = o && o.kind === 'profile' ? o.serverName : null
    return name ? `${t('use_user_profile')} - ${name}` : t('use_user_profile')
  }
  if (o.kind === 'any') return t('any_language')
  if (o.kind === 'language') return o.name
  return ''
}

/**
 * FilterableLanguagePreference filter: only languages whose name or code contains the query, names that
 * start with it first. Blank query = the full list.
 */
export function filterLanguages(options: readonly LanguageOption[], query: string): LanguageOption[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...options]
  const hits = options.filter(
    (o): o is Extract<LanguageOption, { kind: 'language' }> =>
      o.kind === 'language' && (o.name.toLowerCase().includes(q) || o.value.includes(q)),
  )
  return [...hits.filter((o) => o.name.toLowerCase().startsWith(q)), ...hits.filter((o) => !o.name.toLowerCase().startsWith(q))]
}
