import type { Translate } from '../../../lib/format'
import type { Library } from '../../common/libraries'
import { META_ROW_TYPES, type MetaRowType } from './editorModel'
import styles from './HomeSettings.module.css'
import { SettingsListItem } from './SettingsListItem'

type Props = {
  t: Translate
  libraries: readonly Library[]
  onMeta: (type: MetaRowType) => void
  onLibrary: (library: Library) => void
  onFavorites: () => void
  onCollection: () => void
  onPlaylist: () => void
}

/**
 * `HomeSettingsAddRow`: the three watching rows (added at once), every library (drawer-unpinned ones
 * included) leading to its row types, then Favorites / Collection / Playlist. Discover is never offered
 * (upstream hard-codes it off).
 */
export function AddRowPage({ t, libraries, onMeta, onLibrary, onFavorites, onCollection, onPlaylist }: Props) {
  return (
    <>
      <h2 className={styles.title}>{t('add_row')}</h2>
      <div className={styles.listInset}>
        {META_ROW_TYPES.map((m) => (
          <SettingsListItem key={m.type} headline={t(m.labelKey)} onClick={() => onMeta(m.type)} />
        ))}
        <div className={styles.sectionTitle}>{t('library')}</div>
        <hr className={styles.divider} />
        {libraries.map((l) => (
          <SettingsListItem key={l.id} headline={l.name} onClick={() => onLibrary(l)} focusKey={`lib:${l.id}`} />
        ))}
        <div className={styles.sectionTitle}>{t('more')}</div>
        <hr className={styles.divider} />
        <SettingsListItem headline={t('favorites')} onClick={onFavorites} focusKey="favorites" />
        <SettingsListItem headline={t('collection')} onClick={onCollection} focusKey="collection" />
        <SettingsListItem headline={t('playlist')} onClick={onPlaylist} focusKey="playlist" />
      </div>
    </>
  )
}
