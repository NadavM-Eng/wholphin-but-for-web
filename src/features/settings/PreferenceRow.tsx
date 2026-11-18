import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNav } from '../../app/nav'
import { toast } from '../../app/toast'
import { getPrefs, setPref, usePrefs, type PreferenceKey, type PreferenceMeta, type Preferences } from '../../stores/preferences'
import { SeerrSettingsEntry } from '../discover/SeerrSettingsEntry'
import { ChoicePreference } from './ChoicePreference'
import styles from './Preference.module.css'
import { ClearImageCachePreference } from './ClearImageCachePreference'
import { ClickPreference } from './ClickPreference'
import { ExperimentalEnablePreference } from './ExperimentalEnablePreference'
import { InstalledVersionPreference } from './InstalledVersionPreference'
import { LanguagePreference } from './LanguagePreference'
import { MultiChoicePreference } from './MultiChoicePreference'
import { NavDrawerPinsPreference } from './NavDrawerPinsPreference'
import { destinationPath, keyFor, optionIndex, relaysOutPage, rowSummary, sliderSpec, sliderSummary, titleKeyOf, validate } from './prefModel'
import { ProfileProtectionPreference } from './ProfileProtectionPreference'
import { QuickConnectPreference } from './QuickConnectPreference'
import { ScreensaverStartPreference } from './ScreensaverStartPreference'
import { SendAppLogsPreference } from './SendAppLogsPreference'
import { SliderPreference } from './SliderPreference'
import { StringInputDialog } from './StringInputDialog'
import { resetSubtitleStyle } from './subtitleStyle'
import { SwitchPreference } from './SwitchPreference'
import { ThemePreference } from './ThemePreference'

export type PreferenceRowProps = {
  meta: PreferenceMeta
  /** the HDR copy of the subtitle editor */
  hdrPage?: boolean
}

function write(key: PreferenceKey, value: unknown) {
  setPref(key, value as Preferences[typeof key])
}

/** Validates (AppPreference.validate) and writes; an invalid value toasts and is not written. */
function commit(meta: PreferenceMeta, key: PreferenceKey, value: unknown) {
  const v = validate(meta, getPrefs(), value)
  if (!v.ok) toast(v.message)
  else write(key, value)
}

/**
 * One preference row: the special rows of PreferencesContent.kt (protection, language, version, Quick
 * Connect, logs, cache, experimental, screensaver start, subtitle reset, theme) and otherwise the generic
 * ComposablePreference by widget type.
 */
export function PreferenceRow({ meta, hdrPage = false }: PreferenceRowProps) {
  const { t } = useTranslation()
  const go = useNav()
  const key = keyFor(meta, hdrPage)
  const value = usePrefs((p) => (key ? p[key] : undefined))
  const [editing, setEditing] = useState(false)
  const id = meta.id
  const titleKey = titleKeyOf(meta)
  const title = titleKey ? t(titleKey) : id
  const summaryKey = meta.summaryKey ? t(meta.summaryKey) : undefined

  switch (id) {
    case 'ProtectProfilePreference':
      return <ProfileProtectionPreference id={id} title={title} />
    case 'UserPinnedNavDrawerItems':
      return <NavDrawerPinsPreference id={id} title={title} summary={summaryKey} />
    case 'UserInterfaceLanguage':
      return <LanguagePreference id={id} title={title} />
    case 'InstalledVersion':
      return <InstalledVersionPreference id={id} title={title} />
    case 'QuickConnect':
      return <QuickConnectPreference id={id} title={title} summary={summaryKey} />
    case 'SendAppLogs':
      return <SendAppLogsPreference id={id} title={title} summary={summaryKey} />
    case 'ClearImageCache':
      return <ClearImageCachePreference id={id} title={title} />
    case 'ExperimentalEnable':
      return <ExperimentalEnablePreference id={id} title={title} />
    case 'ThemeColors':
      return <ThemePreference id={id} title={title} />
    case 'ScreensaverStart':
      return <ScreensaverStartPreference id={id} title={title} summary={summaryKey} />
    case 'SeerrIntegration':
      return (
        <div className={`${styles.row} ${styles.seerr}`} data-pref-id={id}>
          <SeerrSettingsEntry className={styles.item} />
        </div>
      )
    case 'SubReset':
      return <ClickPreference id={id} title={title} summary={summaryKey} onClick={() => resetSubtitleStyle(hdrPage)} />
  }

  switch (meta.widget) {
    case 'switch':
      return (
        <SwitchPreference
          id={id}
          title={title}
          value={value === true}
          summary={rowSummary(meta, value, t)}
          onToggle={() => key && commit(meta, key, !(value === true))}
        />
      )
    case 'slider': {
      const spec = sliderSpec(meta)
      const stored = typeof value === 'number' ? value : 0
      const ui = spec.toUi(stored)
      return (
        <SliderPreference
          id={id}
          title={title}
          summary={sliderSummary(meta, ui, stored, t)}
          value={ui}
          min={spec.min}
          max={spec.max}
          step={spec.step}
          onChange={(next) => key && commit(meta, key, spec.fromUi(next))}
          dragSummary={relaysOutPage(meta) ? (next) => sliderSummary(meta, next, spec.fromUi(next), t) : undefined}
        />
      )
    }
    case 'choice': {
      const options = meta.options ?? []
      return (
        <ChoicePreference
          id={id}
          title={title}
          summary={rowSummary(meta, value, t)}
          options={options.map((o) => ({ label: t(o.labelKey), subtitle: o.subtitleKey ? t(o.subtitleKey) : undefined }))}
          selectedIndex={optionIndex(options, value)}
          onSelect={(i) => key && commit(meta, key, options[i].value)}
        />
      )
    }
    case 'multichoice': {
      const options = meta.options ?? []
      return (
        <MultiChoicePreference
          id={id}
          title={title}
          summary={rowSummary(meta, value, t)}
          values={options.map((o) => o.value)}
          options={options.map((o) => ({ label: t(o.labelKey), subtitle: o.subtitleKey ? t(o.subtitleKey) : undefined }))}
          selected={Array.isArray(value) ? (value as Array<string | number | boolean>) : []}
          onChange={(next) => key && commit(meta, key, next)}
        />
      )
    }
    case 'string':
      return (
        <>
          <ClickPreference
            id={id}
            title={title}
            summary={summaryKey ?? (typeof value === 'string' ? value : undefined)}
            onClick={() => setEditing(true)}
          />
          {editing && key && (
            <StringInputDialog
              title={title}
              initialValue={typeof value === 'string' ? value : ''}
              onClose={() => setEditing(false)}
              onSave={(v) => {
                setEditing(false)
                commit(meta, key, v)
              }}
            />
          )}
        </>
      )
    case 'destination': {
      const path = destinationPath(meta)
      return <ClickPreference id={id} title={title} summary={summaryKey} onClick={() => path && go.to(path)} />
    }
    default:
      if (import.meta.env.DEV) console.warn(`[settings] no web handler for ${id}`)
      return <ClickPreference id={id} title={title} summary={summaryKey} disabled />
  }
}
