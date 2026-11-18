import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getPref, setPref, usePrefs } from '../../stores/preferences'
import { THEME_LABEL_KEYS, THEME_NAMES, type ThemeName } from '../../theme/themes.gen'
import { Dialog, ListItem, SelectedDot } from '../../ui'
import { handleListArrowKeys } from '../../ui/lib/focus'
import { ClickPreference } from './ClickPreference'
import styles from './ThemePreference.module.css'

function preview(theme: ThemeName) {
  document.documentElement.dataset.theme = theme
}

/**
 * Application Theme (AppPreference.ThemeColors, an AppChoicePreference): upstream's choice dialog of the 8
 * palettes (ChoicePreference.kt: the selected-dot leading content, no selected state; choosing one commits and
 * closes), opened on the current choice like every web choice dialog.
 * Web addition: a live preview. Focusing or hovering an option re-themes the app until the dialog closes;
 * choosing one persists it (applied by src/app/applyPreferences).
 */
export function ThemePreference({ id, title }: { id: string; title: string }) {
  const { t } = useTranslation()
  const current = usePrefs('themeColors')
  const [open, setOpen] = useState(false)
  const list = useRef<HTMLDivElement>(null)

  const close = () => {
    preview(getPref('themeColors'))
    setOpen(false)
  }

  return (
    <>
      <ClickPreference id={id} title={title} summary={t(THEME_LABEL_KEYS[current])} onClick={() => setOpen(true)} />
      <Dialog
        open={open}
        onClose={close}
        variant="popup"
        label={title}
        initialFocus={() => list.current?.querySelector<HTMLElement>(`[data-theme-option="${current}"] [data-focusable]`)}
      >
        <div className={styles.column}>
          <h2 className={styles.title}>{title}</h2>
          <div
            ref={list}
            role="menu"
            aria-label={title}
            className={styles.list}
            onKeyDown={(e) => list.current && handleListArrowKeys(e, list.current)}
          >
            {THEME_NAMES.map((name) => (
              <div
                key={name}
                data-theme-option={name}
                onFocus={() => preview(name)}
                onPointerEnter={(e) => e.pointerType === 'mouse' && preview(name)}
              >
                <ListItem
                  role="menuitem"
                  headline={t(THEME_LABEL_KEYS[name])}
                  leading={<SelectedDot selected={name === current} />}
                  onClick={() => {
                    setPref('themeColors', name)
                    close()
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </Dialog>
    </>
  )
}
