import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { setPref, usePrefs } from '../../stores/preferences'
import { Dialog, ListItem, SearchField, SelectedDot } from '../../ui'
import { handleListArrowKeys } from '../../ui/lib/focus'
import { ClickPreference } from './ClickPreference'
import { filterLanguages, optionLabel, selectedLanguage, type LanguageOption } from './languageOptions'
import styles from './PreferredLanguagePreference.module.css'
import prefStyles from './Preference.module.css'

export type PreferredLanguagePreferenceProps = {
  id: string
  title: string
  prefKey: 'preferredAudioLang' | 'preferredSubtitleLang'
  options: readonly LanguageOption[]
}

/** FilterableLanguagePreference: 500 ms debounce like upstream. */
const FILTER_DEBOUNCE_MS = 500

/**
 * Preferred audio / subtitle language (UserProfilePreferencesPage.kt + FilterableLanguagePreference.kt):
 * the summary is the selected option; the dialog (BasicDialog, 3dp, 16dp padding, as tall as the window allows)
 * is a titleLarge title over one scrolling list: the search box (8dp below it), "Use your profile setting"
 * (with the server language below it), "Any language", a 1dp divider and every server culture. It opens on
 * the first option, not on the search box.
 */
export function PreferredLanguagePreference({ id, title, prefKey, options }: PreferredLanguagePreferenceProps) {
  const { t } = useTranslation()
  const stored = usePrefs(prefKey)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('')
  const list = useRef<HTMLDivElement>(null)
  const selected = selectedLanguage(options, stored)

  useEffect(() => {
    const h = window.setTimeout(() => setFilter(query), FILTER_DEBOUNCE_MS)
    return () => window.clearTimeout(h)
  }, [query])

  const shown = filterLanguages(options, filter)
  const isSelected = (o: LanguageOption) => !!selected && o.kind === selected.kind && 'value' in o && 'value' in selected && o.value === selected.value

  return (
    <>
      <ClickPreference
        id={id}
        title={title}
        summary={optionLabel(selected, t)}
        onClick={() => {
          setQuery('')
          setFilter('')
          setOpen(true)
        }}
      />
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        variant="basic"
        elevation={3}
        label={title}
        initialFocus={() => list.current?.querySelector<HTMLElement>('button[data-focusable], a[data-focusable]')}
      >
        <div className={`${prefStyles.dialogColumn} ${styles.column}`}>
          <h2 className={prefStyles.dialogTitle}>{title}</h2>
          <div ref={list} className={styles.list} onKeyDown={(e) => list.current && handleListArrowKeys(e, list.current)}>
            <SearchField
              className={styles.search}
              value={query}
              onChange={setQuery}
              onSearch={() => list.current?.querySelector<HTMLElement>('button[data-focusable], a[data-focusable]')?.focus()}
              label={t('search')}
            />
            {shown.map((o, i) =>
              o.kind === 'divider' ? (
                <hr key={`d${i}`} className={styles.divider} />
              ) : (
                <ListItem
                  key={`${o.kind}:${o.value}:${i}`}
                  headline={<span className={prefStyles.itemText}>{o.kind === 'profile' ? t('use_user_profile') : optionLabel(o, t)}</span>}
                  supporting={o.kind === 'profile' && o.serverName ? <span className={prefStyles.itemText}>{o.serverName}</span> : undefined}
                  leading={<SelectedDot selected={isSelected(o)} />}
                  onClick={() => {
                    setPref(prefKey, o.value)
                    setOpen(false)
                  }}
                />
              ),
            )}
          </div>
        </div>
      </Dialog>
    </>
  )
}
