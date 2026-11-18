import type { Translate } from '../../lib/format'
import { Dialog, ListItem, Switch } from '../../ui'
import styles from './SearchPage.module.css'

type Props = {
  open: boolean
  t: Translate
  combinedResults: boolean
  onCombinedResultsChange: (v: boolean) => void
  /** The browser has speech recognition; without it the voice switch is hidden (the button never shows). */
  voiceAvailable: boolean
  voiceSearchButtonVisible: boolean
  onVoiceSearchButtonVisibleChange: (v: boolean) => void
  onClickFilterTypes: () => void
  onClose: () => void
}

/**
 * `SearchViewOptionsDialog` (W/ui/search/SearchViewOptionsDialog.kt): centered, 400dp wide, 28dp corners,
 * surface at 3dp; "Combined search results", "Show voice search button", "Include types".
 */
export function SearchViewOptionsDialog(p: Props) {
  const { t } = p
  return (
    <Dialog open={p.open} onClose={p.onClose} variant="popup" elevation={3} label={t('view_options')} className={styles.viewOptions}>
      <div className={styles.dialogColumn}>
        <h2 className={styles.dialogTitle}>{t('view_options')}</h2>
        <ListItem
          headline={t('combined_search_results')}
          supporting={p.combinedResults ? t('combined_search_results_on') : t('combined_search_results_off')}
          role="switch"
          checked={p.combinedResults}
          trailing={<Switch checked={p.combinedResults} presentational />}
          onClick={() => p.onCombinedResultsChange(!p.combinedResults)}
        />
        {p.voiceAvailable && (
          <ListItem
            headline={t('show_voice_search_button')}
            supporting={p.voiceSearchButtonVisible ? t('visible_ui') : t('hidden_ui')}
            role="switch"
            checked={p.voiceSearchButtonVisible}
            trailing={<Switch checked={p.voiceSearchButtonVisible} presentational />}
            onClick={() => p.onVoiceSearchButtonVisibleChange(!p.voiceSearchButtonVisible)}
          />
        )}
        <ListItem headline={t('include_types')} onClick={p.onClickFilterTypes} />
      </div>
    </Dialog>
  )
}
