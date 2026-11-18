import type { LocaleInfo } from '../../i18n'

/**
 * Upstream lists its base strings as `en-US` (res/resources.properties: unqualifiedResLocale) and puts that
 * locale first in the generated locale config that LocaleChoiceDialog.kt reads; the web ships them as `en`.
 */
const BASE_TAG = 'en'
const BASE_DISPLAY_TAG = 'en-US'

/** Android resource folders still use the legacy codes, and the generated config is sorted by them. */
const ANDROID_CODE: Record<string, string> = { he: 'iw', id: 'in' }

export type UiLocaleOption = {
  /** the shipped locale tag (what is stored) */
  tag: string
  /** `locale.getDisplayName(locale)` */
  name: string
  /** `locale.getDisplayName(Locale.ENGLISH)` */
  englishName: string
}

const displayTag = (tag: string) => (tag === BASE_TAG ? BASE_DISPLAY_TAG : tag)

/**
 * `Locale.getDisplayName(inLocale)`: the plain ICU form, "English (United States)" rather than the dialect
 * form "American English" that Intl.DisplayNames returns by default. Null when the browser has no names for
 * `inLocale` (it would answer in its default language instead).
 */
export function localeDisplayName(tag: string, inLocale: string): string | null {
  try {
    const names = new Intl.DisplayNames([inLocale], { type: 'language', languageDisplay: 'standard', fallback: 'none' })
    const language = (t: string) => t.split('-')[0].toLowerCase()
    if (language(names.resolvedOptions().locale) !== language(inLocale)) return null
    return names.of(tag) ?? null
  } catch {
    return null
  }
}

/** One entry of the language dialog / the summary of the settings row. */
export function uiLocaleOption(info: LocaleInfo): UiLocaleOption {
  const shown = displayTag(info.tag)
  return {
    tag: info.tag,
    name: localeDisplayName(shown, shown) ?? info.nativeName,
    englishName: localeDisplayName(shown, 'en') ?? info.englishName,
  }
}

/** The dialog's order: the base locale first, then the others by their Android resource tag. */
export function uiLocaleOptions(locales: readonly LocaleInfo[]): UiLocaleOption[] {
  const key = (tag: string) => {
    const [language, ...rest] = tag.split('-')
    return [ANDROID_CODE[language] ?? language, ...rest].join('-')
  }
  return [...locales]
    .sort((a, b) => {
      if (a.tag === BASE_TAG || b.tag === BASE_TAG) return a.tag === b.tag ? 0 : a.tag === BASE_TAG ? -1 : 1
      const ka = key(a.tag)
      const kb = key(b.tag)
      return ka < kb ? -1 : ka > kb ? 1 : 0
    })
    .map(uiLocaleOption)
}
