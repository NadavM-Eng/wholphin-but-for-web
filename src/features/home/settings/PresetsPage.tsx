import type { Translate } from '../../../lib/format'
import { HOME_ROW_PRESETS, type HomeRowPresets } from '../model/homeRowPresets'
import styles from './HomeSettings.module.css'
import { SettingsListItem } from './SettingsListItem'

type Props = { t: Translate; onApply: (preset: HomeRowPresets) => void }

/** `HomeRowPresetsContent`: the four built-in presets; applying one restyles the working copy only. */
export function PresetsPage({ t, onApply }: Props) {
  return (
    <>
      <h2 className={styles.title}>{t('display_presets')}</h2>
      <div className={styles.listInset}>
        {HOME_ROW_PRESETS.map((p) => (
          <SettingsListItem key={p.titleKey} headline={t(p.titleKey)} onClick={() => onApply(p.preset)} />
        ))}
      </div>
    </>
  )
}
