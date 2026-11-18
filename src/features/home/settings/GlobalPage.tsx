import type { Translate } from '../../../lib/format'
import { setPref, usePrefs } from '../../../stores/preferences'
import { FaIcon, MaterialIcon } from '../../../ui'
import { ChoicePreference } from './ChoicePreference'
import styles from './HomeSettings.module.css'
import { SettingsListItem } from './SettingsListItem'
import { SliderPreference } from './SliderPreference'
import { SwitchPreference } from './SwitchPreference'

/** `AppPreference.MaxDaysNextUpOptions`; slider index 7 = "No limit" (stored -1). */
const MAX_DAYS = [7, 14, 30, 60, 90, 180, 365]

type Props = { t: Translate; onResize: (relative: number) => void; onViewRemoved: () => void }

/**
 * `HomeSettingsGlobal`: app-level home preferences (saved at once, not part of the row JSON), resizing all
 * cards (working copy) and the removed-from-next-up list.
 */
export function GlobalPage({ t, onResize, onViewRemoved }: Props) {
  const items = usePrefs('homePageItems')
  const rewatch = usePrefs('rewatchNextUp')
  const maxDays = usePrefs('maxDaysNextUp')
  const clickToPlay = usePrefs('homeClickToPlay')
  const found = MAX_DAYS.indexOf(maxDays)
  const dayIndex = found >= 0 ? found : MAX_DAYS.length
  const days = MAX_DAYS[dayIndex] ?? -1
  return (
    <>
      <h2 className={styles.titleCentered}>{t('settings')}</h2>
      <hr className={styles.divider} />
      <div className={styles.listInset}>
        <SliderPreference
          title={t('max_homepage_items')}
          value={items}
          min={5}
          max={50}
          step={1}
          summary={String(items)}
          onChange={(v) => setPref('homePageItems', v)}
        />
        <SwitchPreference
          title={t('rewatch_next_up')}
          value={rewatch}
          summary={t(rewatch ? 'enabled' : 'disabled')}
          onChange={(v) => setPref('rewatchNextUp', v)}
        />
        <SliderPreference
          title={t('max_days_next_up')}
          value={dayIndex}
          min={0}
          max={MAX_DAYS.length}
          step={1}
          summary={days === -1 ? t('no_limit') : t('days', { count: days })}
          onChange={(i) => setPref('maxDaysNextUp', MAX_DAYS[i] ?? -1)}
        />
        <ChoicePreference
          title={t('continue_watching_click_behavior')}
          labels={[t('continue_watching_click_summary_off'), t('continue_watching_click_summary_on')]}
          selectedIndex={clickToPlay ? 1 : 0}
          onChange={(i) => setPref('homeClickToPlay', i === 1)}
        />
        <hr className={styles.divider} />
        <SettingsListItem headline={t('increase_all_cards_size')} leading={<MaterialIcon name="keyboard_arrow_up" />} onClick={() => onResize(1)} />
        <SettingsListItem headline={t('decrease_all_cards_size')} leading={<MaterialIcon name="keyboard_arrow_down" />} onClick={() => onResize(-1)} />
        <hr className={styles.divider} />
        <SettingsListItem headline={t('view_removed_next_up')} leading={<FaIcon name="eye" />} onClick={onViewRemoved} />
      </div>
    </>
  )
}
