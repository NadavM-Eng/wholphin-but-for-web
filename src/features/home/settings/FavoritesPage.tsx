import type { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models'
import type { Translate } from '../../../lib/format'
import { typeNameKey } from '../../common/itemKinds'
import type { Library } from '../../common/libraries'
import { possibleFavoriteTypes } from './editorModel'
import styles from './HomeSettings.module.css'
import { SettingsListItem } from './SettingsListItem'

type Props = { t: Translate; libraries: readonly Library[]; onPick: (kind: BaseItemKind) => void }

/** `HomeSettingsFavoriteList`: "Add row for Favorites", one entry per possible favorite kind. */
export function FavoritesPage({ t, libraries, onPick }: Props) {
  return (
    <>
      <h2 className={styles.title}>{t('add_row_for', { p1: t('favorites') })}</h2>
      <div className={styles.listInset}>
        {possibleFavoriteTypes(libraries).map((kind) => (
          <SettingsListItem key={kind} headline={t(typeNameKey(kind))} onClick={() => onPick(kind)} />
        ))}
      </div>
    </>
  )
}
