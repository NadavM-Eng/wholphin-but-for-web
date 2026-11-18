import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { setPref, usePrefs, type PreferenceKey } from '../../stores/preferences'
import { Dialog } from '../../ui'
import { handleListArrowKeys } from '../../ui/lib/focus'
import { SwitchPreference } from '../settings/SwitchPreference'
import styles from './LiveTvViewOptionsDialog.module.css'

/** `liveTvPreferences` (W/preferences/AppPreference.kt): order and labels of the four switches. */
const OPTIONS: { key: PreferenceKey & ('liveTvShowHeader' | 'liveTvFavoriteChannelsBeginning' | 'liveTvChannelSortByWatched' | 'liveTvColorCodePrograms'); title: string }[] = [
  { key: 'liveTvShowHeader', title: 'show_details' },
  { key: 'liveTvFavoriteChannelsBeginning', title: 'favorite_channels_at_beginning' },
  { key: 'liveTvChannelSortByWatched', title: 'sort_channels_recently_watched' },
  { key: 'liveTvColorCodePrograms', title: 'color_code_programs' },
]

/**
 * `LiveTvViewOptionsDialog` (W/ui/detail/livetv/LiveTvViewOptionsDialog.kt): a dialog window with gravity END and
 * no dim: 256dp wide, max 380dp tall, 8dp corners, surface@6dp; "View options" (titleMedium, centred, 8dp
 * vertical padding) over a list (16dp padding) of switch preferences with Enabled / Disabled summaries. Changes
 * apply at once. Outside click and Back close it.
 */
export function LiveTvViewOptionsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const list = useRef<HTMLDivElement>(null)
  const values = [
    usePrefs('liveTvShowHeader'),
    usePrefs('liveTvFavoriteChannelsBeginning'),
    usePrefs('liveTvChannelSortByWatched'),
    usePrefs('liveTvColorCodePrograms'),
  ]

  return (
    <Dialog
      open
      onClose={onClose}
      variant="basic"
      scrim={false}
      label={t('view_options')}
      className={styles.panel}
      // surfaceColorAtElevation(6dp)
      style={{ background: 'color-mix(in srgb, var(--c-primary) 10.76%, var(--c-surface))' }}
    >
      <h2 className={styles.title}>{t('view_options')}</h2>
      <div ref={list} className={styles.list} onKeyDown={(e) => list.current && handleListArrowKeys(e, list.current)}>
        {OPTIONS.map((o, i) => (
          <SwitchPreference
            key={o.key}
            id={o.key}
            title={t(o.title)}
            value={values[i] as boolean}
            summary={values[i] ? t('enabled') : t('disabled')}
            onToggle={() => setPref(o.key, !values[i])}
          />
        ))}
      </div>
    </Dialog>
  )
}
