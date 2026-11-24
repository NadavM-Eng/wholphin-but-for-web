import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LOCALES, matchLocale } from '../../i18n'
import { setPref, usePrefs } from '../../stores/preferences'
import { DialogPopup, SelectedDot } from '../../ui'
import { ClickPreference } from './ClickPreference'
import styles from './Preference.module.css'
import { uiLocaleOptions } from './uiLocales'

/**
 * User interface language (PreferencesContent.kt + LocaleChoiceDialog.kt): the shipped locales, the base one
 * (en-US) first, each named in itself (`locale.getDisplayName(locale)`) over its English name; the current one
 * (the user's choice, else the active browser-derived language) is marked and is the row's summary.
 * Choosing one stores the per-user value; src/app/applyPreferences switches i18next and `<html lang dir>`.
 * Like upstream there is no "follow the system" entry.
 * Web (owner request): the list is in the popup's container like every other choice. LocaleChoiceDialog.kt draws
 * DialogPopupContent without it (no background, clip or padding), so on the TV the list floats on the dimmed
 * page; over the page that stays visible behind Settings on the web, the names ran through the picture.
 * The box is as wide as the longest name and keeps a gap to the top and bottom of the window (`fit`), where the
 * TV's 440dp column runs from edge to edge.
 */
export function LanguagePreference({ id, title }: { id: string; title: string }) {
  const { i18n } = useTranslation()
  const stored = usePrefs('userInterfaceLanguage')
  const [open, setOpen] = useState(false)
  const current = matchLocale(stored) ?? i18n.resolvedLanguage ?? i18n.language
  const options = useMemo(() => uiLocaleOptions(LOCALES), [])
  const info = options.find((l) => l.tag === current)
  return (
    <>
      <ClickPreference id={id} title={title} summary={info?.name ?? current} onClick={() => setOpen(true)} />
      <DialogPopup
        open={open}
        fit
        title={title}
        onClose={() => setOpen(false)}
        items={options.map((l) => ({
          key: l.tag,
          headline: (
            <span className={styles.itemText} lang={l.tag}>
              {l.name}
            </span>
          ),
          supporting: <span className={styles.itemText}>{l.englishName}</span>,
          leading: <SelectedDot selected={l.tag === current} />,
          selected: l.tag === current,
          onSelect: () => setPref('userInterfaceLanguage', l.tag),
        }))}
      />
    </>
  )
}
