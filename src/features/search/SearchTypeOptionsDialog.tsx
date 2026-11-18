import type { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models'
import type { Translate } from '../../lib/format'
import { Dialog, ListItem, Switch } from '../../ui'
import styles from './SearchPage.module.css'
import { searchTypeTitleKey } from './searchTypes'

type Props = {
  open: boolean
  t: Translate
  /** `possibleSearchableTypes` (exclusions ignored). */
  searchableTypes: readonly BaseItemKind[]
  excluded: readonly string[]
  discoverAvailable: boolean
  discoverEnabled: boolean
  onToggle: (type: BaseItemKind) => void
  onToggleDiscover: () => void
  onClose: () => void
}

/** `SearchTypeOptionsDialog` (W/ui/search/SearchTypeOptionsDialog.kt): BasicDialog at 3dp, a switch per type, then "Discover". */
export function SearchTypeOptionsDialog(p: Props) {
  const { t } = p
  return (
    <Dialog open={p.open} onClose={p.onClose} variant="basic" elevation={3} label={t('include_types')} className={styles.typeOptions}>
      <h2 className={styles.typeOptionsTitle}>{t('include_types')}</h2>
      <div className={styles.typeOptionsList}>
        {p.searchableTypes.map((type) => {
          const checked = !p.excluded.includes(type)
          return (
            <ListItem
              key={type}
              role="switch"
              checked={checked}
              headline={t(searchTypeTitleKey(type))}
              trailing={<Switch checked={checked} presentational />}
              onClick={() => p.onToggle(type)}
            />
          )
        })}
        {p.discoverAvailable && (
          <ListItem
            role="switch"
            checked={p.discoverEnabled}
            headline={t('discover')}
            trailing={<Switch checked={p.discoverEnabled} presentational />}
            onClick={p.onToggleDiscover}
          />
        )}
      </div>
    </Dialog>
  )
}
