import type { Translate } from '../../../lib/format'
import { ListItem } from '../../../ui'
import type { Library } from '../../common/libraries'
import { LIBRARY_ROW_TYPE_LABEL, supportedRowTypes, type LibraryRowType } from './editorModel'
import styles from './HomeSettings.module.css'

type Props = { t: Translate; library: Library; onPick: (type: LibraryRowType) => void }

/**
 * `HomeLibraryRowTypeList`: "Add row for {library}" with the row types `getSupportedRowTypes` allows. Its
 * items are plain tv ListItems (headline in the list item's own titleMedium), not HomeSettingsListItems.
 */
export function RowTypePage({ t, library, onPick }: Props) {
  return (
    <>
      <h2 className={styles.title}>{t('add_row_for', { p1: library.name })}</h2>
      <div className={styles.listInset}>
        {supportedRowTypes(library).map((type) => (
          <ListItem key={type} headline={t(LIBRARY_ROW_TYPE_LABEL[type])} onClick={() => onPick(type)} />
        ))}
      </div>
    </>
  )
}
